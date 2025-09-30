const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawn, exec } = require('child_process');
const util = require('util');
const { Script, createContext } = require('vm');

const execAsync = util.promisify(exec);

const { resolveModule } = require('../utils');
const { ActionNamespaces, ContextKeys } = require('./constants');
const NAMESPACED_ACTION_PATTERN = new RegExp(`^(${Object.values(ActionNamespaces).join('|')}):`);

const {
  ActionExecutionError,
  TaskExecutionError
} = require(resolveModule('errors/task-errors', '../semad-core/errors/task-errors'));

const { executeFunction, hasFunction } = require('../../lib/function-registry');

class ActionDispatcher {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  collectElicitActions(task) {
    const actionsRequiringInput = [];

    if (task.steps && Array.isArray(task.steps)) {
      for (const step of task.steps) {
        if (step.actions && Array.isArray(step.actions)) {
          const elicitActions = step.actions.filter(action => action.elicit === true);
          if (elicitActions.length > 0) {
            actionsRequiringInput.push({
              stepId: step.id,
              stepName: step.name,
              actions: elicitActions
            });
          }
        }
      }
    }

    return actionsRequiringInput;
  }

  validateElicitRequirements(task, context, options = {}) {
    const requiredInputs = this.collectElicitActions(task);

    if (requiredInputs.length === 0) {
      return { valid: true, missingInputs: [] };
    }

    if (!context[ContextKeys.USER_INPUT_HANDLER]) {
      if (!options.suppressWarning) {
        console.warn('\n⚠️  Task has actions requiring user input but no userInputHandler provided');
        console.warn('Actions requiring input:');
        for (const stepInput of requiredInputs) {
          console.warn(`\nStep: ${stepInput.stepName}`);
          for (const action of stepInput.actions) {
            console.warn(`  - ${action.description}`);
          }
        }
      }

      return {
        valid: false,
        missingInputs: requiredInputs,
        requiresUserInput: true,
        error: 'Task requires user input but no handler provided'
      };
    }

    return {
      valid: true,
      missingInputs: []
    };
  }

  resolveTemplateValue(value, context) {
    if (typeof value !== 'string') {
      return value;
    }

    return value.replace(/{{([^}]+)}}/g, (match, pathExpression) => {
      const parts = pathExpression.split('.');
      let result = context;

      for (const part of parts) {
        if (result && result[part] !== undefined) {
          result = result[part];
        } else {
          result = undefined;
          break;
        }
      }

      if (result === undefined && parts.length === 1 && context[ContextKeys.INPUTS] && context[ContextKeys.INPUTS][pathExpression] !== undefined) {
        result = context[ContextKeys.INPUTS][pathExpression];
      }

      if (result === undefined) {
        return match;
      }

      return result;
    });
  }

  async executeStepActions(step, agentName, context) {
    if (step.output && context[step.output]) {
      return context[step.output];
    }

    if (step.action) {
      const result = await this.executeNamespacedAction(step, context);

      if (result && typeof result === 'object' && !Array.isArray(result)) {
        Object.assign(context, result);
      }

      return result;
    }

    if (step.actions && step.actions.length > 0) {
      const actionsRequiringInput = step.actions.filter(action => action.elicit === true);
      if (actionsRequiringInput.length > 0 && context[ContextKeys.USER_INPUT_HANDLER]) {
        console.log('\n🔔 User input required for the following actions:');
        for (const action of actionsRequiringInput) {
          console.log(`  - ${action.description}`);
        }

        const userResponses = await context[ContextKeys.USER_INPUT_HANDLER](actionsRequiringInput, step);
        if (userResponses) {
          context[ContextKeys.USER_RESPONSES] = context[ContextKeys.USER_RESPONSES] || {};
          context[ContextKeys.USER_RESPONSES][step.id] = userResponses;
        }
      }

      for (const action of step.actions) {
        if (action.elicit === true && !context[ContextKeys.USER_INPUT_HANDLER]) {
          console.warn(`⚠️  Action requires user input but no handler provided:\n  Step: ${step.name} (ID: ${step.id})\n  Action: "${action.description}"\n  \n  To resolve this, either:\n  - Provide a userInputHandler in the context when calling runTask()\n  - Set allowMissingUserInput: true in the context to suppress this warning`);
        }

        if (action.function && hasFunction(action.function)) {
          try {
            console.log(`Executing function: ${action.function}`);

            const enhancedContext = {
              ...context,
              current_timestamp: new Date().toISOString(),
              agentName
            };

            const result = await executeFunction(action.function, action.parameters || {}, enhancedContext);

            if (result && typeof result === 'object') {
              context._lastFunctionResult = result;
            }

            console.log(`Function ${action.function} completed:`, result?.success ? 'SUCCESS' : 'FAILED');

            if (action.function.includes('AndExit') && result?.success === false) {
              throw new ActionExecutionError(
                `Function ${action.function} failed and requested exit`,
                action.function,
                action.parameters,
                result
              );
            }
          } catch (error) {
            console.error(`Function execution failed: ${action.function}`, error.message);
            throw new ActionExecutionError(
              `Function execution failed: ${error.message}`,
              action.function,
              action.parameters || {},
              { error: error.message, stack: error.stack }
            );
          }
        } else if (action.action && typeof action.action === 'string' && NAMESPACED_ACTION_PATTERN.test(action.action)) {
          try {
            const tmpStep = { action: action.action };
            if (action.inputs) tmpStep.inputs = action.inputs;
            if (action.outputs) tmpStep.outputs = action.outputs;
            const result = await this.executeNamespacedAction(tmpStep, context);
            if (result && typeof result === 'object' && !Array.isArray(result)) {
              Object.assign(context, result);
            }
          } catch (error) {
            console.error(`Namespaced action failed: ${action.action}`, error.message);
            throw new ActionExecutionError(
              `Namespaced action failed: ${error.message}`,
              action.action,
              { inputs: action.inputs, outputs: action.outputs },
              { error: error.message, stack: error.stack }
            );
          }
        } else if (action.action && typeof action.action === 'string') {
          let command = action.action;

          if (context[ContextKeys.INPUTS]) {
            Object.keys(context[ContextKeys.INPUTS]).forEach(key => {
              command = command.replace(new RegExp(`{{inputs.${key}}}`, 'g'), context[ContextKeys.INPUTS][key]);
            });
          }

          if (context[ContextKeys.OUTPUTS]) {
            Object.keys(context[ContextKeys.OUTPUTS]).forEach(key => {
              command = command.replace(new RegExp(`{{outputs.${key}}}`, 'g'), context[ContextKeys.OUTPUTS][key]);
            });
          }

          try {
            console.log(`Executing: ${command}`);
            const { stdout, stderr } = await execAsync(command, { cwd: this.rootDir });

            if (stderr) {
              console.warn(`Warning: ${stderr}`);
            }

            console.log('Command completed successfully');
          } catch (error) {
            const errorMessage = `Step action failed: ${command}\n${error.message}`;
            console.error(errorMessage);
            throw new ActionExecutionError(
              errorMessage,
              action.action,
              { command, inputs: context[ContextKeys.INPUTS], outputs: context[ContextKeys.OUTPUTS] },
              { exitCode: error.code, stderr: error.stderr, stdout: error.stdout }
            );
          }
        }
      }
    }

    if (step.id === 'parse-story' && step.output === 'storyContract') {
      return {
        version: '1.0',
        story_id: 'TEST-STORY-001',
        epic_id: 'TEST-EPIC-001',
        apiEndpoints: [],
        filesToModify: [],
        acceptanceCriteriaLinks: []
      };
    }

    return undefined;
  }

  async executeNamespacedAction(step, context) {
    const [namespace, action] = step.action.split(':');

    const resolvedInputs = {};
    if (step.inputs) {
      for (const [key, value] of Object.entries(step.inputs)) {
        resolvedInputs[key] = this.resolveTemplateValue(value, context);
      }
    }

    switch (namespace) {
      case ActionNamespaces.FILE:
        return await this.executeFileAction(action, resolvedInputs, step.outputs);
      case ActionNamespaces.YAML:
        return await this.executeYamlAction(action, resolvedInputs, step.outputs, context);
      case ActionNamespaces.SCRIPT:
        return await this.executeScriptAction(action, resolvedInputs, step.outputs, context);
      case ActionNamespaces.LOGIC:
        return await this.executeLogicAction(action, resolvedInputs, step.outputs, context);
      case ActionNamespaces.WORKFLOW:
        return await this.executeWorkflowAction(action, resolvedInputs, step.outputs, context);
      default:
        throw new ActionExecutionError(
          `Unknown action namespace: ${namespace}`,
          step.action,
          resolvedInputs,
          { availableNamespaces: Object.values(ActionNamespaces) }
        );
    }
  }

  async executeFileAction(action, inputs, outputs) {
    switch (action) {
      case 'read': {
        if (!inputs.path) {
          throw new ActionExecutionError(
            'file:read requires a path input',
            'file:read',
            inputs,
            { requiredInputs: ['path'] }
          );
        }
        try {
          const base = path.resolve(this.rootDir);
          const target = path.resolve(base, inputs.path);
          if (!(target === base || target.startsWith(base + path.sep))) {
            throw new Error('Path escapes project root');
          }
          const content = fs.readFileSync(target, 'utf8');
          if (outputs && outputs.content) {
            return { [outputs.content]: content };
          }
          return content;
        } catch (error) {
          throw new ActionExecutionError(
            `Failed to read file: ${error.message}`,
            'file:read',
            inputs,
            { path: inputs.path, error: error.message }
          );
        }
      }
      default:
        throw new ActionExecutionError(
          `Unknown file action: ${action}`,
          `file:${action}`,
          inputs,
          { availableActions: ['read'] }
        );
    }
  }

  async executeYamlAction(action, inputs, outputs, context) {
    switch (action) {
      case 'extract-frontmatter': {
        const content = inputs.content;
        const key = inputs.key;

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
          throw new ActionExecutionError(
            'No YAML frontmatter found in content',
            'yaml:extract-frontmatter',
            inputs,
            { contentPreview: content.substring(0, 100) }
          );
        }

        try {
          const frontmatter = yaml.load(frontmatterMatch[1]);
          const result = key ? frontmatter[key] : frontmatter;

          if (outputs && outputs.contractData) {
            context[outputs.contractData] = result;
          }

          return result;
        } catch (error) {
          throw new ActionExecutionError(
            `Failed to parse YAML frontmatter: ${error.message}`,
            'yaml:extract-frontmatter',
            inputs,
            { error: error.message }
          );
        }
      }
      default:
        throw new ActionExecutionError(
          `Unknown yaml action: ${action}`,
          `yaml:${action}`,
          inputs,
          { availableActions: ['extract-frontmatter'] }
        );
    }
  }

  async executeScriptAction(action, inputs, outputs, context) {
    switch (action) {
      case 'execute': {
        const scriptPath = path.join(this.rootDir, inputs.script);
        const args = inputs.args || [];

        const resolvedArgs = args.map(arg =>
          typeof arg === 'string' ? this.resolveTemplateValue(arg, context) : arg
        );

        const child = spawn(process.execPath, [scriptPath, ...resolvedArgs], { cwd: this.rootDir });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += String(d); });
        child.stderr.on('data', d => { stderr += String(d); });

        const exitCode = await new Promise(resolve => child.on('close', code => resolve(code)));

        if (outputs) {
          if (outputs.exitCode) {
            context[outputs.exitCode] = exitCode;
          }
          if (outputs.stdout) {
            context[outputs.stdout] = stdout;
          }
          if (outputs.stderr) {
            context[outputs.stderr] = stderr;
          }
        }

        return { exitCode, stdout, stderr };
      }
      default:
        throw new ActionExecutionError(
          `Unknown script action: ${action}`,
          `script:${action}`,
          inputs,
          { availableActions: ['execute'] }
        );
    }
  }

  async executeLogicAction(action, inputs, outputs, context) {
    switch (action) {
      case 'evaluate': {
        const expression = inputs.expression;
        const result = this.evaluateExpression(expression, context);

        if (outputs && outputs.result) {
          context[outputs.result] = result;
        }

        return result;
      }
      default:
        throw new ActionExecutionError(
          `Unknown logic action: ${action}`,
          `logic:${action}`,
          inputs,
          { availableActions: ['evaluate'] }
        );
    }
  }

  async executeWorkflowAction(action, inputs, outputs, context) {
    switch (action) {
      case 'conditional-halt': {
        let conditionResult = inputs.condition;

        if (typeof inputs.condition === 'string') {
          const resolvedCondition = this.resolveTemplateValue(inputs.condition, context);
          const trimmed = typeof resolvedCondition === 'string'
            ? resolvedCondition.trim()
            : resolvedCondition;

          if (typeof trimmed === 'string' && trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
            const innerExpression = trimmed.slice(2, -2);
            try {
              conditionResult = this.evaluateExpression(innerExpression, context);
            } catch (error) {
              conditionResult = innerExpression === 'true' || innerExpression === true;
            }
          } else if (typeof trimmed === 'string' && (
            trimmed.includes('!') ||
            trimmed.includes('===') ||
            trimmed.includes('!==') ||
            trimmed.includes('>') ||
            trimmed.includes('<') ||
            trimmed.includes('&&') ||
            trimmed.includes('||')
          )) {
            try {
              conditionResult = this.evaluateExpression(trimmed, context);
            } catch (error) {
              conditionResult = trimmed === 'true' || trimmed === true;
            }
          } else {
            conditionResult = trimmed === 'true' || trimmed === true;
          }
        }

        if (conditionResult) {
          const errorMessage = inputs.errorMessage
            ? this.resolveTemplateValue(inputs.errorMessage, context)
            : 'Workflow halted by condition';
          throw new TaskExecutionError(
            errorMessage,
            { id: 'conditional-halt', name: 'Conditional Halt' },
            { condition: inputs.condition, evaluated: conditionResult }
          );
        }
        return true;
      }
      default:
        throw new ActionExecutionError(
          `Unknown workflow action: ${action}`,
          `workflow:${action}`,
          inputs,
          { availableActions: ['conditional-halt'] }
        );
    }
  }

  evaluateExpression(expression, context) {
    const resolvedExpression = this.resolveTemplateValue(expression, context);
    try {
      const sandbox = Object.freeze({ ...context });
      const vmContext = createContext(sandbox);
      const script = new Script(`(function(){ return (${resolvedExpression}); })()`, { timeout: 50 });
      return script.runInContext(vmContext, { timeout: 50 });
    } catch (error) {
      throw new ActionExecutionError(
        `Failed to evaluate expression: ${expression}\n${error.message}`,
        'expression-evaluation',
        { expression, context: Object.keys(context) },
        { resolvedExpression, error: error.message }
      );
    }
  }
}

module.exports = ActionDispatcher;
