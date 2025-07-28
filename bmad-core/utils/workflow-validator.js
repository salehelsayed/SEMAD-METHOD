/**
 * Workflow Dependency Validator
 * Validates that all workflow steps have proper agent/action/uses fields
 * and that required tasks exist in the repository
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const glob = require('glob');

class WorkflowValidator {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.errors = [];
    this.warnings = [];
    this.availableTasks = new Set();
    this.availableAgents = new Set();
    this.availableTemplates = new Set();
    this.availableChecklists = new Set();
  }

  /**
   * Load all available resources (tasks, agents, templates, checklists)
   */
  async loadAvailableResources() {
    // Load tasks
    const taskFiles = glob.sync(path.join(this.rootPath, 'bmad-core/tasks/**/*.{yaml,md}'));
    for (const file of taskFiles) {
      const ext = path.extname(file);
      const taskName = path.basename(file, ext);
      this.availableTasks.add(taskName);
    }

    // Load structured tasks
    const structuredTaskFiles = glob.sync(path.join(this.rootPath, 'bmad-core/structured-tasks/**/*.yaml'));
    for (const file of structuredTaskFiles) {
      const taskName = path.basename(file, '.yaml');
      this.availableTasks.add(taskName);
    }

    // Load agents (both .yaml and .md files)
    const agentFiles = glob.sync(path.join(this.rootPath, 'bmad-core/agents/*.{yaml,md}'));
    for (const file of agentFiles) {
      const ext = path.extname(file);
      const agentName = path.basename(file, ext);
      this.availableAgents.add(agentName);
    }

    // Load templates (both .yaml and .md files)
    const templateFiles = glob.sync(path.join(this.rootPath, 'bmad-core/templates/**/*.{yaml,md}'));
    for (const file of templateFiles) {
      const ext = path.extname(file);
      const templateName = path.basename(file, ext);
      this.availableTemplates.add(templateName);
    }

    // Load checklists
    const checklistFiles = glob.sync(path.join(this.rootPath, 'bmad-core/checklists/**/*.md'));
    for (const file of checklistFiles) {
      const checklistName = path.basename(file, '.md');
      this.availableChecklists.add(checklistName);
    }
  }

  /**
   * Validate a single workflow file
   */
  validateWorkflowFile(filePath) {
    const fileName = path.basename(filePath);
    const fileErrors = [];
    const fileWarnings = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const workflow = yaml.load(content);

      if (!workflow || !workflow.workflow) {
        fileErrors.push({
          file: fileName,
          message: 'Invalid workflow structure: missing "workflow" key'
        });
        return { errors: fileErrors, warnings: fileWarnings };
      }

      const wf = workflow.workflow;

      // Validate workflow metadata
      if (!wf.id) fileErrors.push({ file: fileName, message: 'Missing workflow id' });
      if (!wf.name) fileErrors.push({ file: fileName, message: 'Missing workflow name' });
      if (!wf.description) fileWarnings.push({ file: fileName, message: 'Missing workflow description' });

      // Validate sequence steps
      if (wf.sequence) {
        this.validateSequence(wf.sequence, fileName, fileErrors, fileWarnings);
      } else {
        fileErrors.push({ file: fileName, message: 'Missing workflow sequence' });
      }

    } catch (error) {
      fileErrors.push({
        file: fileName,
        message: `Failed to parse workflow: ${error.message}`
      });
    }

    this.errors.push(...fileErrors);
    this.warnings.push(...fileWarnings);

    return { errors: fileErrors, warnings: fileWarnings };
  }

  /**
   * Validate workflow sequence steps
   */
  validateSequence(sequence, fileName, errors, warnings) {
    sequence.forEach((step, index) => {
      const stepIdentifier = step.step || `Step ${index + 1}`;

      // Check if step has at least one of: agent, action, or uses
      if (!step.agent && !step.action && !step.uses && !step.condition && !step.routes) {
        errors.push({
          file: fileName,
          step: stepIdentifier,
          message: 'Step must have at least one of: agent, action, uses, or be a conditional/routing step'
        });
      }

      // Validate agent references
      if (step.agent && step.agent !== 'various' && !step.agent.includes('/')) {
        if (!this.availableAgents.has(step.agent)) {
          errors.push({
            file: fileName,
            step: stepIdentifier,
            message: `Agent "${step.agent}" not found in repository`
          });
        }
      }

      // Validate task references
      if (step.uses) {
        // Check tasks, templates, and checklists
        if (!this.availableTasks.has(step.uses) && 
            !this.availableTemplates.has(step.uses) && 
            !this.availableChecklists.has(step.uses)) {
          errors.push({
            file: fileName,
            step: stepIdentifier,
            message: `Task/template/checklist "${step.uses}" not found in repository`
          });
        }
      }

      // Validate nested routes
      if (step.routes) {
        Object.entries(step.routes).forEach(([routeName, route]) => {
          if (route.agent && !this.availableAgents.has(route.agent)) {
            errors.push({
              file: fileName,
              step: `${stepIdentifier} -> ${routeName}`,
              message: `Agent "${route.agent}" not found in repository`
            });
          }
          if (route.uses && 
              !this.availableTasks.has(route.uses) && 
              !this.availableTemplates.has(route.uses) && 
              !this.availableChecklists.has(route.uses)) {
            errors.push({
              file: fileName,
              step: `${stepIdentifier} -> ${routeName}`,
              message: `Task/template/checklist "${route.uses}" not found in repository`
            });
          }
        });
      }

      // Validate memory_tasks
      if (step.memory_tasks) {
        step.memory_tasks.forEach(task => {
          const taskName = Object.keys(task)[0];
          if (!['retrieve-context', 'update-working-memory'].includes(taskName)) {
            warnings.push({
              file: fileName,
              step: stepIdentifier,
              message: `Unknown memory task: ${taskName}`
            });
          }
        });
      }

      // Check for required fields
      if (step.requires && Array.isArray(step.requires)) {
        step.requires.forEach(req => {
          if (!req.endsWith('.md') && !req.endsWith('.yaml')) {
            warnings.push({
              file: fileName,
              step: stepIdentifier,
              message: `Required file "${req}" should have a file extension`
            });
          }
        });
      }
    });
  }

  /**
   * Validate all workflows in the repository
   */
  async validateAllWorkflows() {
    await this.loadAvailableResources();

    const workflowFiles = glob.sync(path.join(this.rootPath, 'bmad-core/workflows/**/*.yaml'));
    
    const results = {
      totalWorkflows: workflowFiles.length,
      validWorkflows: 0,
      workflowsWithErrors: 0,
      workflowsWithWarnings: 0,
      errors: [],
      warnings: []
    };

    for (const file of workflowFiles) {
      const { errors, warnings } = this.validateWorkflowFile(file);
      
      if (errors.length === 0 && warnings.length === 0) {
        results.validWorkflows++;
      }
      if (errors.length > 0) {
        results.workflowsWithErrors++;
      }
      if (warnings.length > 0) {
        results.workflowsWithWarnings++;
      }
    }

    results.errors = this.errors;
    results.warnings = this.warnings;

    return results;
  }

  /**
   * Generate a validation report
   */
  generateReport(results) {
    const report = [];
    
    report.push('=== Workflow Validation Report ===');
    report.push(`Total workflows: ${results.totalWorkflows}`);
    report.push(`Valid workflows: ${results.validWorkflows}`);
    report.push(`Workflows with errors: ${results.workflowsWithErrors}`);
    report.push(`Workflows with warnings: ${results.workflowsWithWarnings}`);
    report.push('');

    if (results.errors.length > 0) {
      report.push('=== ERRORS ===');
      results.errors.forEach(error => {
        if (error.step) {
          report.push(`❌ ${error.file} [${error.step}]: ${error.message}`);
        } else {
          report.push(`❌ ${error.file}: ${error.message}`);
        }
      });
      report.push('');
    }

    if (results.warnings.length > 0) {
      report.push('=== WARNINGS ===');
      results.warnings.forEach(warning => {
        if (warning.step) {
          report.push(`⚠️  ${warning.file} [${warning.step}]: ${warning.message}`);
        } else {
          report.push(`⚠️  ${warning.file}: ${warning.message}`);
        }
      });
      report.push('');
    }

    if (results.errors.length === 0) {
      report.push('✅ All workflows have valid dependencies!');
    }

    return report.join('\n');
  }
}

// Export for use in other modules
module.exports = WorkflowValidator;

// CLI interface
if (require.main === module) {
  const rootPath = process.cwd();
  const validator = new WorkflowValidator(rootPath);

  validator.validateAllWorkflows()
    .then(results => {
      const report = validator.generateReport(results);
      console.log(report);
      
      // Exit with error code if there are errors
      if (results.errors.length > 0) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}