#!/usr/bin/env node

/**
 * Memory Operation Validator
 * 
 * This utility validates that agents executed required memory operations during story implementation.
 * It checks for dev-save-memory and qa-save-memory task executions and validates parameters.
 * 
 * Usage:
 *   node memory-operation-validator.js [story-id] [--verbose] [--report-format=json|text]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class MemoryOperationValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.reportFormat = options.reportFormat || 'text';
    this.validationErrors = [];
    this.validationWarnings = [];
    this.memoryOperations = [];
  }

  /**
   * Validate memory operations for a specific story
   */
  async validateStory(storyId, storyPath) {
    console.log(`Validating memory operations for story: ${storyId}`);
    
    const validation = {
      storyId,
      storyPath,
      timestamp: new Date().toISOString(),
      devMemoryOperations: [],
      qaMemoryOperations: [],
      errors: [],
      warnings: [],
      passed: false
    };

    try {
      // Read story file
      const storyContent = fs.readFileSync(storyPath, 'utf8');
      const storyData = this.parseStoryFile(storyContent);

      // Extract memory operations from story logs
      const memoryOps = this.extractMemoryOperations(storyData);
      validation.devMemoryOperations = memoryOps.dev;
      validation.qaMemoryOperations = memoryOps.qa;

      // Validate dev memory operations
      this.validateDevMemoryOperations(validation, storyData);

      // Validate QA memory operations
      this.validateQAMemoryOperations(validation, storyData);

      // Check overall completion
      validation.passed = validation.errors.length === 0;

      return validation;
    } catch (error) {
      validation.errors.push({
        type: 'VALIDATION_ERROR',
        message: `Failed to validate story: ${error.message}`,
        severity: 'critical'
      });
      return validation;
    }
  }

  /**
   * Parse story file and extract YAML front matter and content
   */
  parseStoryFile(content) {
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      throw new Error('Story file missing YAML front matter');
    }

    const yamlContent = yamlMatch[1];
    const markdownContent = content.substring(yamlMatch[0].length).trim();

    return {
      frontMatter: yaml.load(yamlContent),
      content: markdownContent
    };
  }

  /**
   * Extract memory operations from story logs and agent records
   */
  extractMemoryOperations(storyData) {
    const operations = { dev: [], qa: [] };

    // Extract from Dev Agent Record section
    const devSection = this.extractSection(storyData.content, 'Dev Agent Record');
    if (devSection) {
      operations.dev = this.findMemoryOperations(devSection, 'dev-save-memory');
    }

    // Extract from QA Results section
    const qaSection = this.extractSection(storyData.content, 'QA Results');
    if (qaSection) {
      operations.qa = this.findMemoryOperations(qaSection, 'qa-save-memory');
    }

    // Also check Debug Log References
    const debugSection = this.extractSection(storyData.content, 'Debug Log References');
    if (debugSection) {
      const debugOps = this.findMemoryOperations(debugSection, ['dev-save-memory', 'qa-save-memory']);
      operations.dev.push(...debugOps.filter(op => op.type === 'dev-save-memory'));
      operations.qa.push(...debugOps.filter(op => op.type === 'qa-save-memory'));
    }

    return operations;
  }

  /**
   * Extract a specific section from markdown content
   */
  extractSection(content, sectionName) {
    // Split content into lines to handle this more reliably
    const lines = content.split('\n');
    let sectionStart = -1;
    let sectionEnd = -1;
    
    // Find the section start
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === `## ${sectionName}` || line === `# ${sectionName}` || line === `### ${sectionName}`) {
        sectionStart = i + 1; // Start after the header line
        break;
      }
    }
    
    if (sectionStart === -1) {
      return null; // Section not found
    }
    
    // Find the section end (next header at same or higher level)
    for (let i = sectionStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('# ') || line.startsWith('## ')) {
        sectionEnd = i;
        break;
      }
    }
    
    // If no end found, take until end of content
    if (sectionEnd === -1) {
      sectionEnd = lines.length;
    }
    
    // Extract and return the section content
    return lines.slice(sectionStart, sectionEnd).join('\n').trim();
  }

  /**
   * Find memory operation references in text
   */
  findMemoryOperations(text, taskTypes) {
    const types = Array.isArray(taskTypes) ? taskTypes : [taskTypes];
    const operations = [];

    for (const taskType of types) {
      // Look for task execution patterns - more comprehensive patterns
      const patterns = [
        // Standard format: *execute-task dev-save-memory task_name='...' story_id='...'
        new RegExp(`\\*execute-task\\s+${taskType}\\s+([^\\n]*?)(?=\\n|$)`, 'gi'),
        // Executed format: Executed: *execute-task dev-save-memory ...
        new RegExp(`Executed:\\s*\\*execute-task\\s+${taskType}\\s+([^\\n]*?)(?=\\n|$)`, 'gi'),
        // Memory saved format: Memory saved: *execute-task qa-save-memory ...
        new RegExp(`Memory saved:\\s*\\*execute-task\\s+${taskType}\\s+([^\\n]*?)(?=\\n|$)`, 'gi'),
        // Simple reference: dev-save-memory task executed
        new RegExp(`${taskType}\\s+task\\s+executed`, 'gi'),
        // General memory saved reference
        new RegExp(`Memory saved.*?${taskType}`, 'gi')
      ];

      for (const pattern of patterns) {
        let match;
        // Reset lastIndex to avoid issues with global regex
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          // Avoid infinite loops
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
          
          operations.push({
            type: taskType,
            reference: match[0].trim(),
            parameters: match[1] ? match[1].trim() : null,
            foundAt: text.substring(Math.max(0, match.index - 50), match.index + match[0].length + 50).trim()
          });
        }
      }
    }

    // Remove duplicate operations (same reference)
    const uniqueOperations = [];
    const seen = new Set();
    for (const op of operations) {
      const key = `${op.type}:${op.reference}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueOperations.push(op);
      }
    }

    return uniqueOperations;
  }

  /**
   * Validate dev agent memory operations
   */
  validateDevMemoryOperations(validation, storyData) {
    const devOps = validation.devMemoryOperations;
    const storyStatus = storyData.frontMatter.Status;
    const tasks = this.extractTasks(storyData.content);

    // Critical validation: Must have memory operations for completed tasks
    const completedTasks = tasks.filter(task => task.completed);
    const expectedMemoryOps = completedTasks.length + (storyStatus === 'Ready for Review' || storyStatus === 'Done' ? 1 : 0);

    if (devOps.length === 0) {
      validation.errors.push({
        type: 'MISSING_DEV_MEMORY_OPERATIONS',
        message: 'No dev-save-memory operations found despite completed tasks',
        severity: 'critical',
        details: {
          completedTasks: completedTasks.length,
          expectedOperations: expectedMemoryOps,
          foundOperations: 0
        }
      });
    } else if (devOps.length < expectedMemoryOps / 2) {
      validation.warnings.push({
        type: 'INSUFFICIENT_DEV_MEMORY_OPERATIONS',
        message: 'Fewer dev-save-memory operations than expected for completed tasks',
        severity: 'medium',
        details: {
          completedTasks: completedTasks.length,
          expectedOperations: expectedMemoryOps,
          foundOperations: devOps.length
        }
      });
    }

    // Validate parameter structure
    for (const op of devOps) {
      if (op.parameters) {
        const hasStoryId = op.parameters.includes('story_id');
        const hasTaskName = op.parameters.includes('task_name');
        const hasDetails = op.parameters.includes('implementation_details');

        if (!hasStoryId || !hasTaskName || !hasDetails) {
          validation.errors.push({
            type: 'INVALID_DEV_MEMORY_PARAMETERS',
            message: 'dev-save-memory missing required parameters',
            severity: 'high',
            details: {
              operation: op.reference,
              missingParams: [
                !hasStoryId && 'story_id',
                !hasTaskName && 'task_name', 
                !hasDetails && 'implementation_details'
              ].filter(Boolean)
            }
          });
        }
      }
    }
  }

  /**
   * Validate QA agent memory operations
   */
  validateQAMemoryOperations(validation, storyData) {
    const qaOps = validation.qaMemoryOperations;
    const storyStatus = storyData.frontMatter.Status;
    const qaResults = this.extractSection(storyData.content, 'QA Results');

    // If story has been reviewed, should have QA memory operations
    if (qaResults && qaResults.length > 100) { // Significant QA content
      if (qaOps.length === 0) {
        validation.errors.push({
          type: 'MISSING_QA_MEMORY_OPERATIONS',
          message: 'No qa-save-memory operations found despite QA review activity',
          severity: 'critical',
          details: {
            storyStatus,
            qaResultsLength: qaResults.length
          }
        });
      }
    }

    // If story is marked "Done" by QA, must have final memory operation
    if (storyStatus === 'Done') {
      const hasFinalMemoryOp = qaOps.some(op => 
        op.reference.includes('final') || 
        op.reference.includes('complete') ||
        op.reference.includes('Done')
      );

      if (!hasFinalMemoryOp) {
        validation.errors.push({
          type: 'MISSING_QA_FINAL_MEMORY_OPERATION',
          message: 'Story marked "Done" but no final QA memory operation found',
          severity: 'high',
          details: {
            storyStatus,
            qaOperations: qaOps.length
          }
        });
      }
    }

    // Validate parameter structure
    for (const op of qaOps) {
      if (op.parameters) {
        const hasStoryId = op.parameters.includes('story_id');
        const hasReviewId = op.parameters.includes('review_id');
        const hasDetails = op.parameters.includes('review_details');

        if (!hasStoryId || !hasReviewId || !hasDetails) {
          validation.errors.push({
            type: 'INVALID_QA_MEMORY_PARAMETERS',
            message: 'qa-save-memory missing required parameters',
            severity: 'high',
            details: {
              operation: op.reference,
              missingParams: [
                !hasStoryId && 'story_id',
                !hasReviewId && 'review_id',
                !hasDetails && 'review_details'
              ].filter(Boolean)
            }
          });
        }
      }
    }
  }

  /**
   * Extract task list from story content
   */
  extractTasks(content) {
    const tasks = [];
    const taskPattern = /^[\s]*-[\s]*\[([ x])\][\s]*(.+)$/gm;
    let match;

    while ((match = taskPattern.exec(content)) !== null) {
      tasks.push({
        completed: match[1] === 'x',
        text: match[2].trim()
      });
    }

    return tasks;
  }

  /**
   * Validate all stories in a directory
   */
  async validateAllStories(storiesDir) {
    const results = {
      totalStories: 0,
      validatedStories: 0,
      passedStories: 0,
      failedStories: 0,
      stories: [],
      summary: {
        criticalErrors: 0,
        highErrors: 0,
        mediumWarnings: 0,
        commonIssues: {}
      }
    };

    try {
      const files = fs.readdirSync(storiesDir)
        .filter(file => file.endsWith('.md'))
        .sort();

      results.totalStories = files.length;

      for (const file of files) {
        const storyPath = path.join(storiesDir, file);
        const storyId = path.basename(file, '.md');
        
        try {
          const validation = await this.validateStory(storyId, storyPath);
          results.stories.push(validation);
          results.validatedStories++;

          if (validation.passed) {
            results.passedStories++;
          } else {
            results.failedStories++;
          }

          // Count error types
          for (const error of validation.errors) {
            if (error.severity === 'critical') results.summary.criticalErrors++;
            if (error.severity === 'high') results.summary.highErrors++;
            
            // Track common issues
            if (!results.summary.commonIssues[error.type]) {
              results.summary.commonIssues[error.type] = 0;
            }
            results.summary.commonIssues[error.type]++;
          }

          for (const warning of validation.warnings) {
            if (warning.severity === 'medium') results.summary.mediumWarnings++;
          }

        } catch (error) {
          console.error(`Failed to validate ${file}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.error(`Failed to read stories directory: ${error.message}`);
      return results;
    }
  }

  /**
   * Generate validation report
   */
  generateReport(results) {
    if (this.reportFormat === 'json') {
      return JSON.stringify(results, null, 2);
    }

    let report = '';
    report += '# Memory Operation Validation Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    report += '## Summary\n';
    report += `- Total Stories: ${results.totalStories}\n`;
    report += `- Validated: ${results.validatedStories}\n`;
    report += `- Passed: ${results.passedStories}\n`;
    report += `- Failed: ${results.failedStories}\n`;
    report += `- Critical Errors: ${results.summary.criticalErrors}\n`;
    report += `- High Errors: ${results.summary.highErrors}\n`;
    report += `- Medium Warnings: ${results.summary.mediumWarnings}\n\n`;

    if (Object.keys(results.summary.commonIssues).length > 0) {
      report += '## Common Issues\n';
      for (const [issue, count] of Object.entries(results.summary.commonIssues)) {
        report += `- ${issue}: ${count} occurrences\n`;
      }
      report += '\n';
    }

    // Report failed stories
    const failedStories = results.stories.filter(s => !s.passed);
    if (failedStories.length > 0) {
      report += '## Failed Stories\n\n';
      for (const story of failedStories) {
        report += `### ${story.storyId}\n`;
        report += `Path: ${story.storyPath}\n`;
        report += `Dev Memory Operations: ${story.devMemoryOperations.length}\n`;
        report += `QA Memory Operations: ${story.qaMemoryOperations.length}\n\n`;

        if (story.errors.length > 0) {
          report += '**Errors:**\n';
          for (const error of story.errors) {
            report += `- [${error.severity.toUpperCase()}] ${error.type}: ${error.message}\n`;
            if (this.verbose && error.details) {
              report += `  Details: ${JSON.stringify(error.details, null, 2)}\n`;
            }
          }
          report += '\n';
        }

        if (story.warnings.length > 0 && this.verbose) {
          report += '**Warnings:**\n';
          for (const warning of story.warnings) {
            report += `- [${warning.severity.toUpperCase()}] ${warning.type}: ${warning.message}\n`;
          }
          report += '\n';
        }
      }
    }

    return report;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose'),
    reportFormat: args.find(arg => arg.startsWith('--report-format='))?.split('=')[1] || 'text'
  };

  const validator = new MemoryOperationValidator(options);

  if (args.length > 0 && !args[0].startsWith('--')) {
    // Validate specific story
    const storyId = args[0];
    const storyPath = path.join(process.cwd(), 'docs', 'stories', `${storyId}.md`);
    
    if (!fs.existsSync(storyPath)) {
      console.error(`Story file not found: ${storyPath}`);
      process.exit(1);
    }

    validator.validateStory(storyId, storyPath)
      .then(result => {
        console.log(validator.generateReport({ stories: [result], totalStories: 1, validatedStories: 1, passedStories: result.passed ? 1 : 0, failedStories: result.passed ? 0 : 1, summary: { criticalErrors: 0, highErrors: 0, mediumWarnings: 0, commonIssues: {} } }));
        process.exit(result.passed ? 0 : 1);
      })
      .catch(error => {
        console.error(`Validation failed: ${error.message}`);
        process.exit(1);
      });
  } else {
    // Validate all stories
    const storiesDir = path.join(process.cwd(), 'docs', 'stories');
    
    if (!fs.existsSync(storiesDir)) {
      console.error(`Stories directory not found: ${storiesDir}`);
      process.exit(1);
    }

    validator.validateAllStories(storiesDir)
      .then(results => {
        console.log(validator.generateReport(results));
        process.exit(results.failedStories > 0 ? 1 : 0);
      })
      .catch(error => {
        console.error(`Validation failed: ${error.message}`);
        process.exit(1);
      });
  }
}

module.exports = MemoryOperationValidator;