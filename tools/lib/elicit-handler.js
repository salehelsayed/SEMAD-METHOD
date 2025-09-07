const inquirer = require('inquirer');

/**
 * Create a user input handler for structured tasks with elicit=true actions.
 * Modes:
 *  - cli: prompts in terminal using inquirer (default)
 *  - auto: returns generic acknowledgements without prompting
 *
 * You can override by providing your own handler module via env var
 * `SEMAD_ELICIT_HANDLER_MODULE` which should export a default function
 * with the signature (actions, step) => Promise<Record<string, string>>.
 */
function loadExternalHandler() {
  const mod = process.env.SEMAD_ELICIT_HANDLER_MODULE;
  if (!mod) return null;
  try {
    // Support absolute, relative, or resolvable module names
    const handler = require(mod);
    return handler && (handler.default || handler);
  } catch (e) {
    console.warn(`⚠️  Failed to load external elicit handler '${mod}': ${e.message}`);
    return null;
  }
}

function createCliHandler() {
  return async (actions, step) => {
    const questions = actions.map(a => ({
      type: 'input',
      name: a.description,
      message: `${step.name}: ${a.description}`.slice(0, 200)
    }));
    const answers = await inquirer.prompt(questions);
    return answers;
  };
}

function createAutoHandler() {
  return async (actions, step) => {
    const result = {};
    for (const a of actions) {
      result[a.description] = '[auto] acknowledged';
    }
    return result;
  };
}

function createUserInputHandler(options = {}) {
  const external = loadExternalHandler();
  if (external) return external;

  const mode = options.mode || process.env.SEMAD_ELICIT_MODE || 'cli';
  if (mode === 'auto' || options.nonInteractive) return createAutoHandler();
  return createCliHandler();
}

module.exports = { createUserInputHandler };

