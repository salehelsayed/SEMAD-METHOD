const path = require('path');
const fs = require('fs');

describe('TaskRunner security and file guards', () => {
  const TaskRunner = require('../tools/task-runner');
  const runner = new TaskRunner(process.cwd());

  test('evaluateExpression uses vm sandbox', () => {
    const result = runner.evaluateExpression('1 + 1', {});
    expect(result).toBe(2);
    expect(() => runner.evaluateExpression('process.exit(0)', {})).toThrow();
  });

  test('file:read prevents path traversal outside project root', async () => {
    await expect(runner.executeFileAction('read', { path: path.join('..', 'package.json') }, {}))
      .rejects.toThrow(/escapes project root|Failed to read file/);
  });
});

