#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');
const yaml = require('js-yaml');

/**
 * Generate story from YAML template
 */
class StoryGenerator {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'bmad-core', 'core-config.yaml');
    this.defaultTemplate = path.join(rootDir, 'bmad-core', 'templates', 'story-tmpl.yaml');
  }

  /**
   * Load configuration from core-config.yaml
   */
  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Core configuration not found: ${this.configPath}`);
    }

    const content = fs.readFileSync(this.configPath, 'utf8');
    return yaml.load(content);
  }

  /**
   * Load story template
   */
  loadTemplate(templatePath = null) {
    const config = this.loadConfig();
    const templateFile = templatePath || 
                        config.stories?.storyTemplate || 
                        this.defaultTemplate;

    const fullTemplatePath = path.isAbsolute(templateFile) 
      ? templateFile 
      : path.resolve(this.rootDir, templateFile);

    if (!fs.existsSync(fullTemplatePath)) {
      throw new Error(`Story template not found: ${fullTemplatePath}`);
    }

    console.log(chalk.blue(`📝 Using template: ${path.relative(this.rootDir, fullTemplatePath)}`));
    this.templatePath = fullTemplatePath;
    this.usesDefaultTemplate = /story-tmpl\.yaml$/.test(fullTemplatePath);
    
    const content = fs.readFileSync(fullTemplatePath, 'utf8');
    return yaml.load(content);
  }

  /**
   * Get next story ID
   */
  getNextStoryId(epicId = null) {
    const config = this.loadConfig();
    const storyLocation = config.stories?.storyLocation || 'docs/stories';
    const storiesDir = path.isAbsolute(storyLocation) 
      ? storyLocation 
      : path.resolve(this.rootDir, storyLocation);

    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
      return epicId ? `${epicId}-1` : '1';
    }

    const storyFiles = fs.readdirSync(storiesDir)
      .filter(file => file.startsWith('story-') && file.endsWith('.md'))
      .map(file => {
        const match = file.match(/story-(.+)\.md$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (epicId) {
      // Find next story ID within epic
      const epicStories = storyFiles.filter(id => id.startsWith(`${epicId}-`));
      if (epicStories.length === 0) {
        return `${epicId}-1`;
      }
      
      const epicNumbers = epicStories.map(id => {
        const match = id.match(/^\d+-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      
      const maxEpicNumber = Math.max(...epicNumbers);
      return `${epicId}-${maxEpicNumber + 1}`;
    } else {
      // Find next global story ID
      const storyNumbers = storyFiles.map(id => {
        const match = id.match(/^(\d+)(-\d+)?$/);
        return match ? parseInt(match[1]) : 0;
      });
      
      if (storyNumbers.length === 0) {
        return '1';
      }
      
      const maxNumber = Math.max(...storyNumbers);
      return `${maxNumber + 1}`;
    }
  }

  /**
   * Generate story content from template
   */
  generateStoryContent(template, context) {
    // If using the canonical story template, generate deterministic content
    if (this.usesDefaultTemplate) {
      return this.generateDeterministicStory(context);
    }

    // Handle both simple string templates and YAML story template structure for custom templates
    let content = '';
    
    if (typeof template === 'string') {
      content = template;
    } else if (template.template && typeof template.template === 'string') {
      content = template.template;
    } else if (template.content && typeof template.content === 'string') {
      content = template.content;
    } else if (template.sections) {
      // Handle YAML story template format - generate a basic markdown structure
      content = this.generateMarkdownFromYamlTemplate(template, context);
    } else {
      // Fallback to a basic story template
      content = `# Story: {{TITLE}}

**Story ID:** {{STORY_ID}}
**Epic ID:** {{EPIC_ID}}
**Status:** {{STATUS}}
**Priority:** {{PRIORITY}}
**Effort:** {{EFFORT}}
**Assigned To:** {{ASSIGNED_TO}}
**Created:** {{CREATED_DATE}}

## Description
{{DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Business Value
{{BUSINESS_VALUE}}

## Technical Notes
{{TECHNICAL_NOTES}}

## Definition of Done
{{DEFINITION_OF_DONE}}

## Dependencies
{{DEPENDENCIES}}

## Tags
{{TAGS}}
`;
    }

    // Ensure content is a string before performing replacements
    if (typeof content !== 'string') {
      console.warn('Warning: Template content is not a string, using fallback');
      content = `# Story: {{TITLE}}

**Story ID:** {{STORY_ID}}
**Epic ID:** {{EPIC_ID}}
**Status:** {{STATUS}}
**Priority:** {{PRIORITY}}
**Effort:** {{EFFORT}}
**Assigned To:** {{ASSIGNED_TO}}
**Created:** {{CREATED_DATE}}

## Description
{{DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Business Value
{{BUSINESS_VALUE}}

## Technical Notes
{{TECHNICAL_NOTES}}

## Definition of Done
{{DEFINITION_OF_DONE}}

## Dependencies
{{DEPENDENCIES}}

## Tags
{{TAGS}}
`;
    }
    
    // Replace template variables
    const replacements = {
      '{{STORY_ID}}': context.storyId || 'TBD',
      '{{EPIC_ID}}': context.epicId || 'N/A',
      '{{TITLE}}': context.title || 'Story Title',
      '{{DESCRIPTION}}': context.description || 'Story description goes here',
      '{{ACCEPTANCE_CRITERIA}}': context.acceptanceCriteria || 'Acceptance criteria to be defined',
      '{{PRIORITY}}': context.priority || 'Medium',
      '{{EFFORT}}': context.effort || 'TBD',
      '{{STATUS}}': context.status || 'Draft',
      '{{ASSIGNED_TO}}': context.assignedTo || 'Unassigned',
      '{{CREATED_DATE}}': new Date().toISOString().split('T')[0],
      '{{DEPENDENCIES}}': context.dependencies || 'None',
      '{{TAGS}}': context.tags || '',
      '{{BUSINESS_VALUE}}': context.businessValue || 'Business value to be defined',
      '{{TECHNICAL_NOTES}}': context.technicalNotes || 'Technical implementation notes',
      '{{DEFINITION_OF_DONE}}': context.definitionOfDone || 'Definition of done criteria'
    };

    // Perform replacements
    Object.entries(replacements).forEach(([placeholder, value]) => {
      content = content.replace(new RegExp(placeholder, 'g'), value);
    });

    // Handle conditional sections
    if (context.epicId) {
      content = content.replace(/{{#if EPIC_ID}}([\s\S]*?){{\/if}}/g, '$1');
    } else {
      content = content.replace(/{{#if EPIC_ID}}[\s\S]*?{{\/if}}/g, '');
    }

    return content;
  }

  /**
   * Generate markdown content from YAML story template
   */
  generateMarkdownFromYamlTemplate(template, context) {
    let content = `# Story: ${context.title || 'Story Title'}\n\n`;
    
    // Add basic story information
    content += `**Story ID:** ${context.storyId || 'TBD'}\n`;
    content += `**Epic ID:** ${context.epicId || 'N/A'}\n`;
    content += `**Status:** ${context.status || 'Draft'}\n`;
    content += `**Priority:** ${context.priority || 'Medium'}\n`;
    content += `**Effort:** ${context.effort || 'TBD'}\n`;
    content += `**Assigned To:** ${context.assignedTo || 'Unassigned'}\n`;
    content += `**Created:** ${new Date().toISOString().split('T')[0]}\n\n`;

    // Add story header if present
    if (template.header) {
      content += `## Story Contract\n\n`;
      if (template.header.template) {
        content += template.header.template + '\n\n';
      }
    }

    // Add main sections
    if (template.sections) {
      template.sections.forEach(section => {
        content += `## ${section.title}\n\n`;
        if (section.template) {
          content += section.template + '\n\n';
        } else if (section.instruction) {
          content += `${section.instruction}\n\n`;
        }
      });
    }

    return content;
  }

  /**
   * Deterministic story content aligned with bmad-core/templates/story-tmpl.yaml
   */
  generateDeterministicStory(context) {
    const id = context.storyId || 'TBD';
    const epic = context.epicId || 'N/A';
    const title = context.title || 'Story Title';
    const now = new Date().toISOString();

    const header = [
      '---',
      'StoryContract:',
      '  version: "1.0"',
      '  schemaVersion: "1.0"',
      `  story_id: "${id}"`,
      `  epic_id: "${epic}"`,
      '  preConditions: []',
      '  postConditions: []',
      '  apiEndpoints: []',
      '  filesToModify: []',
      '  acceptanceCriteriaLinks: []',
      '  impactRadius:',
      '    components: []',
      '    symbols: []',
      '    breakageBudget:',
      '      allowedInterfaceChanges: false',
      '      migrationNotes: ""',
      '      maxFilesAffected: 20',
      '  cleanupRequired:',
      '    removeUnused: true',
      '    deprecations: []',
      '    notes: []',
      '  qualityGates:',
      '    typeErrors: 0',
      '    zeroUnused: true',
      '    coverageDeltaMax: 0.5',
      '    runImpactScan: true',
      '  linkedArtifacts: []',
      '---',
      ''
    ].join('\n');

    const body = [
      `# Story ${id}: ${title}`,
      '',
      '## Status',
      context.status || 'Draft',
      '',
      '## Priority',
      context.priority || 'Medium',
      '',
      '## Story',
      `As a ${context.persona || 'user'}, I want ${context.description || '...'} so that ${context.businessValue || '...'} .`,
      '',
      '## Context',
      context.technicalNotes || 'Add relevant background and constraints.',
      '',
      '## Acceptance Criteria',
      Array.isArray(context.acceptanceCriteria)
        ? context.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')
        : (context.acceptanceCriteria || '- Define at least 3 ACs.'),
      '',
      '## Technical Requirements',
      '### Dependencies',
      '- List key packages/services/files relevant to this story',
      '',
      '### Performance Criteria',
      '- Define expected performance targets if applicable',
      '',
      '### Security Requirements',
      '- Note authentication/authorization implications if any',
      '',
      '## Implementation Plan',
      '### Files to Create',
      '- N/A',
      '',
      '### Files to Modify',
      '- N/A',
      '',
      '### Test Requirements',
      '- Unit: list tests and files',
      '- Integration: list cross-module tests',
      '',
      '## Risk Assessment',
      '**Risk Level**: Low',
      '',
      '### Identified Risks',
      '- Document potential issues and mitigations',
      '',
      '### Rollback Plan',
      'Describe a simple rollback strategy.',
      '',
      '## Definition of Done',
      '- [ ] ACs pass',
      '- [ ] QA checks pass',
      '',
      '## Traceability',
      `- Epic: ${epic}`,
      '- Requirements: link when known',
      '- Architecture: link when known',
      '- Tests: link when known',
      '',
      '## Generation Metadata',
      '- Template Version: 1.0',
      `- Generated At: ${now}`,
      '- Generated By: tools/generate-story.js',
      '',
      '## Implementation Details',
      '- Add references and notes as work progresses',
      '',
      '## QA Findings',
      '_No findings yet_'
    ].join('\n');

    return header + body + '\n';
  }

  /**
   * Interactive story creation
   */
  async collectStoryDetails(options = {}) {
    const inquirer = require('inquirer');
    
    const questions = [
      {
        type: 'input',
        name: 'title',
        message: 'Story title:',
        validate: input => input.trim().length > 0 || 'Title is required'
      },
      {
        type: 'input',
        name: 'epicId',
        message: 'Epic ID (optional):',
        when: !options.epicId
      },
      {
        type: 'editor',
        name: 'description',
        message: 'Story description:',
        when: !options.nonInteractive
      },
      {
        type: 'editor',
        name: 'acceptanceCriteria',
        message: 'Acceptance criteria:',
        when: !options.nonInteractive
      },
      {
        type: 'list',
        name: 'priority',
        message: 'Priority:',
        choices: ['High', 'Medium', 'Low'],
        default: 'Medium'
      },
      {
        type: 'list',
        name: 'status',
        message: 'Initial status:',
        choices: ['Draft', 'Ready for Review', 'Approved'],
        default: 'Draft'
      },
      {
        type: 'input',
        name: 'effort',
        message: 'Effort estimate (story points, hours, etc.):',
        default: 'TBD'
      },
      {
        type: 'input',
        name: 'assignedTo',
        message: 'Assigned to:',
        default: 'Unassigned'
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        filter: input => input.split(',').map(tag => tag.trim()).join(', ')
      }
    ];

    if (options.nonInteractive) {
      return {
        title: options.title || 'Generated Story',
        epicId: options.epicId || null,
        description: options.description || 'Story description',
        acceptanceCriteria: options.acceptanceCriteria || 'Acceptance criteria',
        priority: options.priority || 'Medium',
        status: options.status || 'Draft',
        effort: options.effort || 'TBD',
        assignedTo: options.assignedTo || 'Unassigned',
        tags: options.tags || ''
      };
    }

    return await inquirer.prompt(questions);
  }

  /**
   * Save story to file
   */
  saveStory(storyId, content, options = {}) {
    const config = this.loadConfig();
    const storyLocation = config.stories?.storyLocation || 'docs/stories';
    const storiesDir = path.isAbsolute(storyLocation) 
      ? storyLocation 
      : path.resolve(this.rootDir, storyLocation);

    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
    }

    const fileName = `story-${storyId}.md`;
    const filePath = path.join(storiesDir, fileName);

    if (fs.existsSync(filePath) && !options.overwrite) {
      throw new Error(`Story file already exists: ${filePath}. Use --overwrite to replace.`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log(chalk.green(`✅ Story created: ${path.relative(this.rootDir, filePath)}`));
    return filePath;
  }

  /**
   * Main generation process
   */
  async generateStory(options = {}) {
    console.log(chalk.bold('📚 BMad Story Generator\n'));
    console.log(`📂 Project: ${this.rootDir}\n`);

    try {
      // Load template
      const template = this.loadTemplate(options.template);
      
      // Collect story details
      console.log(chalk.blue('📝 Collecting story details...\n'));
      const storyDetails = await this.collectStoryDetails(options);
      
      // Generate story ID
      const storyId = options.storyId || this.getNextStoryId(storyDetails.epicId || options.epicId);
      storyDetails.storyId = storyId;
      
      console.log(chalk.green(`\n📋 Generated Story ID: ${storyId}`));
      
      // Generate story content
      const content = this.generateStoryContent(template, storyDetails);
      
      // Save story
      const filePath = this.saveStory(storyId, content, options);
      
      console.log(chalk.blue('\n📋 Story Details:'));
      console.log(`   Story ID: ${storyId}`);
      console.log(`   Title: ${storyDetails.title}`);
      console.log(`   Epic ID: ${storyDetails.epicId || 'N/A'}`);
      console.log(`   Priority: ${storyDetails.priority}`);
      console.log(`   Status: ${storyDetails.status}`);
      console.log(`   File: ${path.relative(this.rootDir, filePath)}`);
      
      console.log(chalk.green('\n✅ Story generation completed successfully!'));
      
      if (storyDetails.status === 'Approved') {
        console.log(chalk.blue('\n📋 Next Steps:'));
        console.log(`   Story is ready for implementation!`);
        console.log(`   Run: npm run dev:next-story`);
      }
      
      return 0;

    } catch (error) {
      console.error(chalk.red('Story generation failed:'), error.message);
      return 1;
    }
  }
}

// CLI setup
program
  .description('Generate a new story from YAML template')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-t, --template <path>', 'Path to story template file')
  .option('-s, --story-id <id>', 'Specific story ID to use')
  .option('-e, --epic-id <id>', 'Epic ID for the story')
  .option('--title <title>', 'Story title')
  .option('--description <desc>', 'Story description')
  .option('--priority <priority>', 'Story priority (High, Medium, Low)')
  .option('--status <status>', 'Initial story status')
  .option('--effort <effort>', 'Effort estimate')
  .option('--assigned-to <assignee>', 'Assigned to')
  .option('--tags <tags>', 'Tags (comma-separated)')
  .option('--overwrite', 'Overwrite existing story file')
  .option('--non-interactive', 'Run in non-interactive mode with provided options')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const generator = new StoryGenerator(options.directory);
  
  try {
    const exitCode = await generator.generateStory({
      template: options.template,
      storyId: options.storyId,
      epicId: options.epicId,
      title: options.title,
      description: options.description,
      priority: options.priority,
      status: options.status,
      effort: options.effort,
      assignedTo: options.assignedTo,
      tags: options.tags,
      overwrite: options.overwrite,
      nonInteractive: options.nonInteractive
    });
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = StoryGenerator;
