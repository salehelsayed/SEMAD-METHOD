const path = require('path');

const ActionDispatcher = require('../tools/task-runner/engine/action-dispatcher');
const { ContextKeys } = require('../tools/task-runner/engine/constants');

describe('ActionDispatcher security and file guards', () => {
  const dispatcher = new ActionDispatcher(process.cwd());

  test('evaluateExpression uses vm sandbox', () => {
    const context = {
      [ContextKeys.INPUTS]: {},
      [ContextKeys.OUTPUTS]: {}
    };

    const result = dispatcher.evaluateExpression('1 + 1', context);
    expect(result).toBe(2);
    expect(() => dispatcher.evaluateExpression('process.exit(0)', context)).toThrow();
  });

  test('file:read prevents path traversal outside project root', async () => {
    await expect(
      dispatcher.executeFileAction('read', { path: path.join('..', 'package.json') }, {})
    ).rejects.toThrow(/escapes project root|Failed to read file/);
  });
});
