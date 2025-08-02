#!/usr/bin/env node

/**
 * Memory Audit CLI
 * 
 * Command-line interface for auditing memory operations in completed stories.
 * Generates reports and remediation plans for missing memory operations.
 * 
 * Usage:
 *   npx memory-audit-cli [options]
 *   node memory-audit-cli.js [options]
 * 
 * Options:
 *   --story <id>          Audit specific story
 *   --all                 Audit all stories
 *   --status <status>     Filter by story status (e.g., "Done", "Ready for Review")
 *   --format <format>     Output format: text, json, html (default: text)
 *   --output <file>       Write report to file
 *   --remediate           Generate remediation plan for missing operations
 *   --verbose             Detailed output
 *   --help                Show help
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const MemoryOperationValidator = require('./memory-operation-validator');

class MemoryAuditCLI {
  constructor() {
    this.validator = new MemoryOperationValidator();
    this.setupCommander();
  }

  setupCommander() {
    program
      .name('memory-audit-cli')
      .description('Audit memory operations in BMad stories')
      .version('1.0.0');

    program
      .option('--story <id>', 'audit specific story')
      .option('--all', 'audit all stories')
      .option('--status <status>', 'filter by story status')
      .option('--format <format>', 'output format: text, json, html', 'text')
      .option('--output <file>', 'write report to file')
      .option('--remediate', 'generate remediation plan')
      .option('--verbose', 'detailed output')
      .action((options) => this.executeAudit(options));

    program
      .command('remediate')
      .description('Generate and optionally execute remediation plan')
      .argument('<story-id>', 'story to remediate')
      .option('--execute', 'execute remediation plan')
      .option('--dry-run', 'show what would be done without executing')
      .action((storyId, options) => this.executeRemediation(storyId, options));

    program
      .command('stats')
      .description('Show memory operation statistics')
      .option('--timeframe <days>', 'limit to stories from last N days', '30')
      .action((options) => this.showStats(options));
  }

  async executeAudit(options) {
    try {
      console.log('🔍 Starting Memory Operation Audit...\n');
      
      let results;
      
      if (options.story) {
        results = await this.auditSingleStory(options.story, options);
      } else if (options.all) {
        results = await this.auditAllStories(options);
      } else {
        results = await this.auditByStatus(options.status || 'Done', options);
      }

      const report = this.generateAuditReport(results, options);
      
      if (options.output) {
        fs.writeFileSync(options.output, report, 'utf8');
        console.log(`📄 Report written to: ${options.output}`);
      } else {
        console.log(report);
      }

      if (options.remediate && results.failedStories > 0) {
        console.log('\n🔧 Generating Remediation Plan...\n');
        const remediationPlan = this.generateRemediationPlan(results);
        console.log(remediationPlan);
      }

      process.exit(results.failedStories > 0 ? 1 : 0);
    } catch (error) {
      console.error(`❌ Audit failed: ${error.message}`);
      process.exit(1);
    }
  }

  async auditSingleStory(storyId, options) {
    const storyPath = this.findStoryPath(storyId);
    const validation = await this.validator.validateStory(storyId, storyPath);
    
    return {
      totalStories: 1,
      validatedStories: 1,
      passedStories: validation.passed ? 1 : 0,
      failedStories: validation.passed ? 0 : 1,
      stories: [validation],
      summary: this.calculateSummary([validation])
    };
  }

  async auditAllStories(options) {
    const storiesDir = path.join(process.cwd(), 'docs', 'stories');
    this.validator.verbose = options.verbose;
    this.validator.reportFormat = options.format;
    
    return await this.validator.validateAllStories(storiesDir);
  }

  async auditByStatus(status, options) {
    const storiesDir = path.join(process.cwd(), 'docs', 'stories');
    const allResults = await this.validator.validateAllStories(storiesDir);
    
    // Filter by status
    const filteredStories = allResults.stories.filter(story => {
      try {
        const storyContent = fs.readFileSync(story.storyPath, 'utf8');
        const frontMatter = this.extractFrontMatter(storyContent);
        return frontMatter && frontMatter.Status === status;
      } catch (error) {
        return false;
      }
    });

    return {
      ...allResults,
      totalStories: filteredStories.length,
      validatedStories: filteredStories.length,
      stories: filteredStories,
      passedStories: filteredStories.filter(s => s.passed).length,
      failedStories: filteredStories.filter(s => !s.passed).length,
      summary: this.calculateSummary(filteredStories)
    };
  }

  generateAuditReport(results, options) {
    if (options.format === 'json') {
      return JSON.stringify(results, null, 2);
    } else if (options.format === 'html') {
      return this.generateHTMLReport(results);
    } else {
      return this.generateTextReport(results, options.verbose);
    }
  }

  generateTextReport(results, verbose = false) {
    let report = '';
    report += '# Memory Operation Audit Report\n\n';
    report += `📊 **Audit Summary**\n`;
    report += `- Generated: ${new Date().toISOString()}\n`;
    report += `- Total Stories Audited: ${results.totalStories}\n`;
    report += `- Stories Passed: ${results.passedStories} (${Math.round(results.passedStories / results.totalStories * 100)}%)\n`;
    report += `- Stories Failed: ${results.failedStories} (${Math.round(results.failedStories / results.totalStories * 100)}%)\n\n`;

    if (results.summary.criticalErrors > 0 || results.summary.highErrors > 0) {
      report += `⚠️  **Issues Found**\n`;
      report += `- Critical Errors: ${results.summary.criticalErrors}\n`;
      report += `- High Priority Errors: ${results.summary.highErrors}\n`;
      report += `- Medium Warnings: ${results.summary.mediumWarnings}\n\n`;
    }

    if (Object.keys(results.summary.commonIssues).length > 0) {
      report += '📈 **Most Common Issues**\n';
      const sortedIssues = Object.entries(results.summary.commonIssues)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      
      for (const [issue, count] of sortedIssues) {
        report += `- ${this.formatIssueType(issue)}: ${count} stories\n`;
      }
      report += '\n';
    }

    const failedStories = results.stories.filter(s => !s.passed);
    if (failedStories.length > 0) {
      report += '❌ **Failed Stories**\n\n';
      
      for (const story of failedStories) {
        report += `### ${story.storyId}\n`;
        report += `📁 Path: \`${story.storyPath}\`\n`;
        report += `🔧 Dev Memory Ops: ${story.devMemoryOperations.length}\n`;
        report += `🧪 QA Memory Ops: ${story.qaMemoryOperations.length}\n\n`;

        if (story.errors.length > 0) {
          report += '**Critical Issues:**\n';
          for (const error of story.errors) {
            const severity = this.getSeverityEmoji(error.severity);
            report += `${severity} ${this.formatIssueType(error.type)}: ${error.message}\n`;
            
            if (verbose && error.details) {
              report += `   📋 Details: ${JSON.stringify(error.details, null, 2)}\n`;
            }
          }
          report += '\n';
        }

        if (verbose && story.warnings.length > 0) {
          report += '**Warnings:**\n';
          for (const warning of story.warnings) {
            report += `⚠️  ${this.formatIssueType(warning.type)}: ${warning.message}\n`;
          }
          report += '\n';
        }
      }
    }

    if (results.passedStories > 0) {
      report += `✅ **${results.passedStories} stories passed validation**\n\n`;
    }

    return report;
  }

  generateHTMLReport(results) {
    // HTML report generation
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memory Operation Audit Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .error { color: #d73a49; }
        .warning { color: #f66a0a; }
        .success { color: #28a745; }
        .story { border: 1px solid #e1e4e8; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
        .story.failed { border-left: 4px solid #d73a49; }
        .story.passed { border-left: 4px solid #28a745; }
        code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; }
        .issue { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .issue.critical { background: #ffeaea; border-left: 3px solid #d73a49; }
        .issue.high { background: #fff4e6; border-left: 3px solid #f66a0a; }
    </style>
</head>
<body>
    <h1>Memory Operation Audit Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">📊 Total Stories: <strong>${results.totalStories}</strong></div>
        <div class="metric">✅ Passed: <strong>${results.passedStories}</strong></div>
        <div class="metric">❌ Failed: <strong>${results.failedStories}</strong></div>
        <div class="metric">🚨 Critical: <strong>${results.summary.criticalErrors}</strong></div>
        <div class="metric">⚠️ High: <strong>${results.summary.highErrors}</strong></div>
    </div>
    
    ${results.stories.map(story => `
    <div class="story ${story.passed ? 'passed' : 'failed'}">
        <h3>${story.storyId} ${story.passed ? '✅' : '❌'}</h3>
        <p><code>${story.storyPath}</code></p>
        <p>Dev Memory Operations: ${story.devMemoryOperations.length} | QA Memory Operations: ${story.qaMemoryOperations.length}</p>
        
        ${story.errors.map(error => `
        <div class="issue ${error.severity}">
            <strong>${error.type}:</strong> ${error.message}
        </div>
        `).join('')}
    </div>
    `).join('')}
    
    <footer>
        <p><small>Generated: ${new Date().toISOString()}</small></p>
    </footer>
</body>
</html>`;
    
    return html;
  }

  generateRemediationPlan(results) {
    const failedStories = results.stories.filter(s => !s.passed);
    
    let plan = '# Memory Operation Remediation Plan\n\n';
    plan += `Generated: ${new Date().toISOString()}\n`;
    plan += `Stories requiring remediation: ${failedStories.length}\n\n`;

    for (const story of failedStories) {
      plan += `## ${story.storyId}\n\n`;
      plan += `**Path:** \`${story.storyPath}\`\n\n`;
      plan += '**Required Actions:**\n\n';

      for (const error of story.errors) {
        plan += `### ${error.type}\n`;
        plan += `**Issue:** ${error.message}\n\n`;
        plan += `**Remediation Steps:**\n`;
        plan += this.getRemediationSteps(error.type, error.details);
        plan += '\n\n';
      }

      plan += '**Validation Command:**\n';
      plan += `\`\`\`bash\n`;
      plan += `node bmad-core/utils/memory-operation-validator.js ${story.storyId}\n`;
      plan += `\`\`\`\n\n`;
      plan += '---\n\n';
    }

    return plan;
  }

  getRemediationSteps(errorType, details) {
    const steps = {
      'MISSING_DEV_MEMORY_OPERATIONS': [
        '1. Review completed tasks in the story',
        '2. For each completed task, execute:',
        '   ```bash',
        '   *execute-task dev-save-memory task_name="[task_name]" story_id="[story_id]" implementation_details="[details]"',
        '   ```',
        '3. Add memory operation references to Dev Agent Record section',
        '4. Re-run validation to confirm completion'
      ],
      'MISSING_QA_MEMORY_OPERATIONS': [
        '1. Review QA Results section for review activities',
        '2. For each review iteration, execute:',
        '   ```bash',
        '   *execute-task qa-save-memory story_id="[story_id]" review_id="[review_id]" review_details="[details]"',
        '   ```',
        '3. Add memory operation references to QA Results section',
        '4. Execute final memory operation if story is marked "Done"'
      ],
      'INVALID_DEV_MEMORY_PARAMETERS': [
        '1. Locate the invalid dev-save-memory operation',
        '2. Ensure all required parameters are present:',
        '   - story_id: Current story identifier',
        '   - task_name: Name of the completed task',
        '   - implementation_details: Object with task completion details',
        '3. Re-execute with correct parameters',
        '4. Update story documentation'
      ],
      'INVALID_QA_MEMORY_PARAMETERS': [
        '1. Locate the invalid qa-save-memory operation',
        '2. Ensure all required parameters are present:',
        '   - story_id: Current story identifier',
        '   - review_id: Unique review session identifier',
        '   - review_details: Object with review findings and patterns',
        '3. Re-execute with correct parameters',
        '4. Update QA Results section'
      ],
      'MISSING_QA_FINAL_MEMORY_OPERATION': [
        '1. Verify story is correctly marked as "Done"',
        '2. Execute final QA memory operation:',
        '   ```bash',
        '   *execute-task qa-save-memory story_id="[story_id]" review_id="final-review" review_details="{finalReview: true, ...}"',
        '   ```',
        '3. Document completion in QA Results section'
      ]
    };

    const defaultSteps = [
      '1. Review the specific error details',
      '2. Consult the memory operation documentation',
      '3. Execute missing or corrected memory operations',
      '4. Re-run validation to confirm resolution'
    ];

    return (steps[errorType] || defaultSteps).map(step => `${step}\n`).join('');
  }

  async executeRemediation(storyId, options) {
    console.log(`🔧 Generating remediation plan for story: ${storyId}\n`);
    
    try {
      const storyPath = this.findStoryPath(storyId);
      const validation = await this.validator.validateStory(storyId, storyPath);
      
      if (validation.passed) {
        console.log(`✅ Story ${storyId} already passes validation`);
        return;
      }

      const results = {
        stories: [validation],
        failedStories: 1
      };

      const remediationPlan = this.generateRemediationPlan(results);
      
      if (options.dryRun) {
        console.log('🔍 Dry run - showing remediation plan:\n');
        console.log(remediationPlan);
      } else if (options.execute) {
        console.log('⚠️  Automatic remediation execution not yet implemented');
        console.log('Please follow the manual remediation plan:\n');
        console.log(remediationPlan);
      } else {
        console.log(remediationPlan);
      }
    } catch (error) {
      console.error(`❌ Remediation failed: ${error.message}`);
      process.exit(1);
    }
  }

  async showStats(options) {
    console.log('📊 Memory Operation Statistics\n');
    
    try {
      const storiesDir = path.join(process.cwd(), 'docs', 'stories');
      const results = await this.validator.validateAllStories(storiesDir);
      
      const stats = this.calculateDetailedStats(results, options.timeframe);
      
      console.log(`📈 **Overall Statistics**`);
      console.log(`- Stories Analyzed: ${stats.totalStories}`);
      console.log(`- Compliance Rate: ${stats.complianceRate}%`);
      console.log(`- Average Dev Memory Ops per Story: ${stats.avgDevOps}`);
      console.log(`- Average QA Memory Ops per Story: ${stats.avgQaOps}`);
      console.log(`- Most Common Issue: ${stats.mostCommonIssue}\n`);
      
      console.log(`🎯 **Quality Metrics**`);
      console.log(`- Stories with Zero Memory Ops: ${stats.zeroMemoryOps}`);
      console.log(`- Stories with Incomplete Parameters: ${stats.incompleteParams}`);
      console.log(`- Stories Missing Final Operations: ${stats.missingFinal}\n`);
      
      if (stats.trends.length > 0) {
        console.log(`📊 **Trends (Last ${options.timeframe} days)**`);
        for (const trend of stats.trends) {
          console.log(`- ${trend}`);
        }
      }
    } catch (error) {
      console.error(`❌ Stats generation failed: ${error.message}`);
      process.exit(1);
    }
  }

  // Helper methods
  findStoryPath(storyId) {
    const possiblePaths = [
      path.join(process.cwd(), 'docs', 'stories', `${storyId}.md`),
      path.join(process.cwd(), 'stories', `${storyId}.md`),
      path.join(process.cwd(), `${storyId}.md`)
    ];
    
    for (const storyPath of possiblePaths) {
      if (fs.existsSync(storyPath)) {
        return storyPath;
      }
    }
    
    throw new Error(`Story file not found for: ${storyId}`);
  }

  extractFrontMatter(content) {
    const yaml = require('js-yaml');
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      return yaml.load(yamlMatch[1]);
    }
    return null;
  }

  calculateSummary(stories) {
    const summary = {
      criticalErrors: 0,
      highErrors: 0,
      mediumWarnings: 0,
      commonIssues: {}
    };

    for (const story of stories) {
      for (const error of story.errors) {
        if (error.severity === 'critical') summary.criticalErrors++;
        if (error.severity === 'high') summary.highErrors++;
        
        if (!summary.commonIssues[error.type]) {
          summary.commonIssues[error.type] = 0;
        }
        summary.commonIssues[error.type]++;
      }

      for (const warning of story.warnings) {
        if (warning.severity === 'medium') summary.mediumWarnings++;
      }
    }

    return summary;
  }

  calculateDetailedStats(results, timeframeDays) {
    const stats = {
      totalStories: results.totalStories,
      complianceRate: Math.round((results.passedStories / results.totalStories) * 100),
      avgDevOps: Math.round(results.stories.reduce((sum, s) => sum + s.devMemoryOperations.length, 0) / results.totalStories * 10) / 10,
      avgQaOps: Math.round(results.stories.reduce((sum, s) => sum + s.qaMemoryOperations.length, 0) / results.totalStories * 10) / 10,
      zeroMemoryOps: results.stories.filter(s => s.devMemoryOperations.length === 0 && s.qaMemoryOperations.length === 0).length,
      incompleteParams: results.stories.filter(s => s.errors.some(e => e.type.includes('INVALID') && e.type.includes('PARAMETERS'))).length,
      missingFinal: results.stories.filter(s => s.errors.some(e => e.type.includes('FINAL'))).length,
      trends: []
    };

    // Most common issue
    const issues = Object.entries(results.summary.commonIssues);
    if (issues.length > 0) {
      const mostCommon = issues.sort(([,a], [,b]) => b - a)[0];
      stats.mostCommonIssue = `${this.formatIssueType(mostCommon[0])} (${mostCommon[1]} stories)`;
    } else {
      stats.mostCommonIssue = 'None';
    }

    return stats;
  }

  formatIssueType(type) {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      high: '⚠️',
      medium: '📋',
      low: 'ℹ️'
    };
    return emojis[severity] || '❓';
  }

  run() {
    program.parse();
  }
}

// CLI Entry point
if (require.main === module) {
  const cli = new MemoryAuditCLI();
  cli.run();
}

module.exports = MemoryAuditCLI;