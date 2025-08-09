const { validate } = require('../../bmad-core/utils/validators/schema-validator');

describe('Agent IO Schema Validation', () => {
  test('dev implement_story valid', () => {
    const data = { success: true, files: [{ path: 'src/x.js', content: '// ok' }], summary: 'done' };
    const res = validate('agents/dev.implement_story.output', data);
    expect(res.valid).toBe(true);
  });

  test('dev implement_story invalid missing files', () => {
    const data = { success: true };
    const res = validate('agents/dev.implement_story.output', data);
    expect(res.valid).toBe(false);
  });
});

