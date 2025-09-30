const ActionNamespaces = Object.freeze({
  FILE: 'file',
  YAML: 'yaml',
  SCRIPT: 'script',
  LOGIC: 'logic',
  WORKFLOW: 'workflow'
});

const ContextKeys = Object.freeze({
  INPUTS: 'inputs',
  OUTPUTS: 'outputs',
  USER_INPUT_HANDLER: 'userInputHandler',
  USER_RESPONSES: 'userResponses',
  ALLOW_MISSING_USER_INPUT: 'allowMissingUserInput',
  IGNORE_VALIDATION: 'ignoreValidation',
  EXECUTION_STATE: 'task_execution_state',
  CURRENT_STEP: 'currentStep'
});

const ErrorCodes = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  USER_INPUT_REQUIRED: 'USER_INPUT_REQUIRED',
  STEP_VALIDATION_FAILED: 'STEP_VALIDATION_FAILED',
  UNKNOWN: 'UNKNOWN_ERROR'
});

module.exports = {
  ActionNamespaces,
  ContextKeys,
  ErrorCodes
};
