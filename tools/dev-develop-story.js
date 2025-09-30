#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const {
  loadStoryContract,
  normalizeStoryId
} = require('../semad-core/utils/story-contract');

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function createUserInputHandler({ interactive = false, modeLabel = 'develop-story' } = {}) {
  if (interactive && process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const ask = (question) => new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer && answer.trim() ? answer.trim() : 'acknowledged');
      });
    });

    const closeIfOpen = () => {
      if (rl) {
        rl.close();
      }
    };

    process.on('exit', closeIfOpen);
    process.on('SIGINT', () => {
      closeIfOpen();
      process.exit(1);
    });

    return async (actions, step = {}) => {
      console.log(chalk.yellow(`\n[${modeLabel}] Step requires input → ${step.name || step.id || 'unnamed step'}`));
      actions.forEach((action, idx) => {
        console.log(chalk.yellow(`  [${idx + 1}] ${action.description}`));
      });
      const response = await ask('> ');
      return {
        mode: 'interactive',
        response,
        stepId: step.id || null,
        actions: actions.map((action) => ({ description: action.description }))
      };
    };
  }

  return async (actions, step = {}) => {
    console.log(chalk.yellow(`\n[${modeLabel}] User input requested (auto-response mode)`));
    if (step.name) {
      console.log(chalk.yellow(`  Step: ${step.name}`));
    }
    actions.forEach((action, idx) => {
      console.log(chalk.yellow(`  [${idx + 1}] ${action.description}`));
    });
    console.log(chalk.yellow(`[${modeLabel}] Responding with placeholder acknowledgement. Set SEMAD_DEV_INTERACTIVE_PROMPTS=1 or pass --interactive-prompts to enable interactive replies.`));
    return {
      mode: 'auto',
      stepId: step.id || null,
      responses: actions.map((action) => ({
        description: action.description,
        response: 'Auto-acknowledged (non-interactive mode)'
      }))
    };
  };
}

async function loadCoreConfig(rootDir) {
  const yaml = require('js-yaml');
  const candidates = [
    path.join(rootDir, 'semad-core', 'core-config.yaml'),
    path.join(rootDir, 'core-config.yaml')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, 'utf8');
      return yaml.load(raw) || {};
    }
  }
  throw new Error('core-config.yaml not found (checked semad-core/core-config.yaml and core-config.yaml)');
}

function resolveStoryPath(rootDir, cfg, cliStory) {
  if (cliStory) {
    const abs = path.isAbsolute(cliStory) ? cliStory : path.join(rootDir, cliStory);
    if (!fs.existsSync(abs)) {
      throw new Error(`Story file not found: ${abs}`);
    }
    return abs;
  }

  const storyDir = (() => {
    const configured = cfg.devStoryLocation || 'docs/stories';
    return path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
  })();

  const { findNextApprovedStory } = require('../semad-core/utils/find-next-story');
  const result = findNextApprovedStory(storyDir);
  if (!result.found) {
    throw new Error(result.error || 'No approved story available for development');
  }
  return result.path;
}

function seedDevTaskTracker(rootDir) {
  try {
    const TaskTracker = require('../semad-core/utils/simple-task-tracker');
    const tracker = new TaskTracker();
    tracker.setAgent('dev');
    const devTasksPath = path.join(rootDir, '.ai', 'dev_tasks.json');
    if (!fs.existsSync(devTasksPath)) {
      tracker.startWorkflow('develop-story', []);
      tracker.saveDevTasks(devTasksPath);
    }
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Unable to seed dev task tracker:'), error.message);
  }
}

async function run() {
  const rootDir = process.cwd();
  const argv = process.argv.slice(2);
  let storyArg = null;
  let analyzeOnly = false;
  let interactivePrompts = toBoolean(process.env.SEMAD_DEV_INTERACTIVE_PROMPTS, false);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--story' && argv[i + 1]) {
      storyArg = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--analysis-only' || arg === '--analyze-only') {
      analyzeOnly = true;
      continue;
    }
    if (arg === '--interactive-prompts' || arg === '--interactive') {
      interactivePrompts = true;
      continue;
    }
    if (arg === '--no-interactive-prompts' || arg === '--no-interactive') {
      interactivePrompts = false;
    }
  }

  console.log(chalk.bold('🧭 Dev Agent – develop-story\n'));

  try {
    const cfg = await loadCoreConfig(rootDir);
    const storyPath = resolveStoryPath(rootDir, cfg, storyArg);
    const relativeStory = path.relative(rootDir, storyPath);
    console.log(`📖 Story: ${relativeStory}`);

    // Warm up tracker so downstream tooling finds dev_tasks.json
    seedDevTaskTracker(rootDir);

    const userInputHandler = createUserInputHandler({
      interactive: interactivePrompts,
      modeLabel: analyzeOnly ? 'develop-story:analysis-only' : 'develop-story'
    });

    if (analyzeOnly) {
      console.log(chalk.blue('🔎 Running analyze-dependencies-before-implementation task...'));
      const WorkflowExecutor = require('../semad-core/utils/workflow-executor');
      const executor = new WorkflowExecutor(rootDir, { flowType: 'linear' });
      await executor.executeStructuredTask('analyze-dependencies-before-implementation', {
        storyPath,
        userInputHandler,
        allowMissingUserInput: !interactivePrompts
      });
      console.log(chalk.green('✅ Dependency analysis completed (analysis-only mode).'));
      process.exit(0);
    }

    const AgentRunner = require('../semad-core/utils/agent-runner');
    const runner = new AgentRunner({ memoryEnabled: true });

    let storyId = null;
    try {
      const { contract } = loadStoryContract(storyPath);
      storyId = normalizeStoryId(contract, storyPath);
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Unable to derive storyId:'), error.message);
    }

    console.log(chalk.blue('🚀 Executing develop-story workflow with guardrail enforcement...'));
    const context = {
      storyPath,
      projectRoot: rootDir,
      task: 'develop-story',
      storyId,
      userInputHandler,
      allowMissingUserInput: !interactivePrompts
    };
    const result = await runner.invokeAgent('dev', 'develop-story', context);

    if (!result || result.success === false) {
      throw new Error('develop-story workflow reported failure. Check agent output for details.');
    }

    console.log(chalk.green('✅ develop-story workflow completed. Guardrails, tests, and evidence recorded.'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('❌ develop-story failed:'), error.message);
    process.exit(1);
  }
}

run();
