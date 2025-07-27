const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class StructuredTaskLoader {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.coreConfigPath = path.join(rootDir, 'bmad-core', 'core-config.yaml');
  }

  async isStructuredTasksEnabled() {
    try {
      const configContent = await fs.readFile(this.coreConfigPath, 'utf8');
      const config = yaml.load(configContent);
      return config.structuredTasks === true;
    } catch (e) {
      return false;
    }
  }

  async loadTask(taskPath) {
    const content = await fs.readFile(taskPath, 'utf8');
    
    if (taskPath.endsWith('.yaml')) {
      // Load and parse YAML task
      const task = yaml.load(content);
      return {
        type: 'structured',
        data: task,
        raw: content
      };
    } else {
      // Return markdown as-is
      return {
        type: 'markdown',
        data: null,
        raw: content
      };
    }
  }

  async loadChecklist(checklistPath) {
    const content = await fs.readFile(checklistPath, 'utf8');
    
    if (checklistPath.endsWith('.yaml')) {
      // Load and parse YAML checklist
      const checklist = yaml.load(content);
      return {
        type: 'structured',
        data: checklist,
        raw: content
      };
    } else {
      // Return markdown as-is
      return {
        type: 'markdown',
        data: null,
        raw: content
      };
    }
  }

  // Convert structured task to markdown format for backward compatibility
  convertTaskToMarkdown(task) {
    let markdown = `# ${task.name}\n\n`;
    
    if (task.purpose) {
      markdown += `## Purpose\n\n${task.purpose}\n\n`;
    }
    
    if (task.notes) {
      markdown += `${task.notes}\n\n`;
    }
    
    // Restore preserved metadata
    if (task.metadata && task.metadata.executionMode === 'SEQUENTIAL') {
      markdown += `## SEQUENTIAL Task Execution (Do not proceed until current Task is complete)\n\n`;
    } else if (task.metadata && task.metadata.preservedContent) {
      // Check for preserved section headers
      const sectionHeaders = task.metadata.preservedContent.filter(c => 
        c.type === 'section-header' && c.level === 2
      );
      if (sectionHeaders.length > 0) {
        markdown += `## ${sectionHeaders[0].content}\n\n`;
      } else {
        markdown += `## Task Execution\n\n`;
      }
    } else {
      markdown += `## Task Execution\n\n`;
    }
    
    task.steps.forEach((step, index) => {
      // Use original step number if available
      const stepNum = step.metadata && step.metadata.originalNumber ? 
        step.metadata.originalNumber : (index + 1);
      const headerLevel = step.metadata && step.metadata.level ? 
        '#'.repeat(step.metadata.level) : '###';
      
      markdown += `${headerLevel} ${stepNum}. ${step.name}\n\n`;
      
      if (step.description) {
        markdown += `${step.description}\n\n`;
      }
      
      if (step.actions && step.actions.length > 0) {
        step.actions.forEach(action => {
          if (action.elicit) {
            markdown += `- **[USER INPUT REQUIRED]** ${action.description}\n`;
          } else {
            markdown += `- ${action.description}\n`;
          }
        });
        markdown += '\n';
      }
      
      if (step.notes) {
        markdown += `${step.notes}\n\n`;
      }
    });
    
    return markdown;
  }

  // Convert structured checklist to markdown format for backward compatibility
  convertChecklistToMarkdown(checklist) {
    let markdown = `# ${checklist.name}\n\n`;
    
    checklist.categories.forEach((category, index) => {
      markdown += `## ${index + 1}. ${category.name}\n\n`;
      
      if (category.notes) {
        markdown += `[[LLM: ${category.notes}]]\n\n`;
      }
      
      category.items.forEach(item => {
        markdown += `- [ ] ${item.description}\n`;
      });
      
      markdown += '\n';
    });
    
    if (checklist.result) {
      markdown += `## Validation Result\n\n`;
      markdown += `Status: ${checklist.result.status}\n\n`;
      if (checklist.result.notes) {
        markdown += `${checklist.result.notes}\n`;
      }
    }
    
    return markdown;
  }
}

module.exports = StructuredTaskLoader;