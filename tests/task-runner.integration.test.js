const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const TaskRunner = require('../tools/task-runner');
const { ContextKeys } = require('../tools/task-runner/engine/constants');
const { clearWorkingMemory } = require('../semad-core/agents/index');

describe('TaskRunner integration scenarios', () => {
  const projectRoot = path.join(__dirname, '..');
  const tempRoot = path.join(projectRoot, 'tests', '.tmp-task-runner');
  let taskRunner;
  const createdFiles = [];
  const usedAgents = new Set();

  beforeAll(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  beforeEach(() => {
    taskRunner = new TaskRunner(projectRoot);
  });

  afterEach(async () => {
    for (const filePath of createdFiles.splice(0)) {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    }

    const agents = Array.from(usedAgents);
    usedAgents.clear();

    for (const agent of agents) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await clearWorkingMemory(agent);
      } catch (error) {
        // Swallow cleanup errors to avoid masking test results
      }
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  function registerAgent(agentName) {
    usedAgents.add(agentName);
    return agentName;
  }

  function createTempScript(content) {
    const scriptPath = path.join(tempRoot, `script-${Date.now()}-${Math.random().toString(16).slice(2)}.js`);
    fs.writeFileSync(scriptPath, content, 'utf8');
    createdFiles.push(scriptPath);
    return path.relative(projectRoot, scriptPath);
  }

  function createStructuredTaskFile(definition) {
    const taskPath = path.join(tempRoot, `task-${Date.now()}-${Math.random().toString(16).slice(2)}.yaml`);
    fs.writeFileSync(taskPath, yaml.dump(definition), 'utf8');
    createdFiles.push(taskPath);
    return taskPath;
  }

  test('executes script action and captures outputs', async () => {
    const agentName = registerAgent('integration-script-agent');
    const scriptRelativePath = createTempScript('console.log("integration script output");');

    const taskDefinition = {
      id: 'integration-script-task',
      name: 'Run script action',
      steps: [
        {
          id: 'run-script',
          name: 'Execute script',
          action: 'script:execute',
          inputs: {
            script: scriptRelativePath,
            args: []
          },
          outputs: {
            exitCode: 'scriptExit',
            stdout: 'scriptStdout',
            stderr: 'scriptStderr'
          }
        }
      ]
    };

    const taskPath = createStructuredTaskFile(taskDefinition);

    const result = await taskRunner.executeTask(agentName, taskPath, {});

    expect(result.success).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.context.scriptExit).toBe(0);
    expect(result.context.scriptStdout).toContain('integration script output');
  });

  test('prompts for user input via handler during execution', async () => {
    const agentName = registerAgent('integration-elicit-agent');

    const taskDefinition = {
      id: 'integration-elicit-task',
      name: 'Collect input',
      steps: [
        {
          id: 'collect-input',
          name: 'Collect user responses',
          actions: [
            { description: 'What is your preferred editor?', elicit: true },
            { description: 'Provide a short justification', elicit: true }
          ]
        }
      ]
    };

    const taskPath = createStructuredTaskFile(taskDefinition);

    const handler = jest.fn().mockResolvedValue({
      'What is your preferred editor?': 'vim',
      'Provide a short justification': 'Muscle memory'
    });

    const context = {
      [ContextKeys.USER_INPUT_HANDLER]: handler
    };

    const result = await taskRunner.executeTask(agentName, taskPath, context);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    const recordedResponses = result.context?.[ContextKeys.USER_RESPONSES]?.['collect-input'];
    expect(recordedResponses).toBeDefined();
    expect(recordedResponses['What is your preferred editor?']).toBe('vim');
  });

  test('returns structured error information on action failure', async () => {
    const agentName = registerAgent('integration-failure-agent');

    const taskDefinition = {
      id: 'integration-failure-task',
      name: 'Trigger failure',
      steps: [
        {
          id: 'failure-step',
          name: 'Evaluate expression',
          action: 'logic:evaluate',
          inputs: {
            expression: 'nonExistentFunction()'
          },
          outputs: {
            result: 'logicResult'
          }
        }
      ]
    };

    const taskPath = createStructuredTaskFile(taskDefinition);

    const result = await taskRunner.executeTask(agentName, taskPath, {});

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('ActionExecutionError');
    expect(result.recovery).toBeDefined();
  });
});
