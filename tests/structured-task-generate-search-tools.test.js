const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('Generate Search Tools Structured Task', () => {
  const taskPath = path.join(__dirname, '..', 'bmad-core', 'structured-tasks', 'generate-search-tools.yaml');

  test('structured task file should exist', () => {
    expect(fs.existsSync(taskPath)).toBe(true);
  });

  test('structured task should have valid YAML structure', () => {
    const taskContent = fs.readFileSync(taskPath, 'utf8');
    let task;
    
    expect(() => {
      task = yaml.load(taskContent);
    }).not.toThrow();

    // Verify required fields according to task schema
    expect(task).toHaveProperty('id', 'generate-search-tools');
    expect(task).toHaveProperty('name', 'Generate Search Tools');
    expect(task).toHaveProperty('purpose');
    expect(task).toHaveProperty('steps');
    expect(Array.isArray(task.steps)).toBe(true);
  });

  test('structured task should define inputs and outputs', () => {
    const taskContent = fs.readFileSync(taskPath, 'utf8');
    const task = yaml.load(taskContent);

    // Check inputs
    expect(task).toHaveProperty('inputs');
    expect(task.inputs).toHaveProperty('prdPath');
    expect(task.inputs.prdPath).toHaveProperty('type', 'string');
    expect(task.inputs.prdPath).toHaveProperty('default', 'docs/prd.md');
    
    expect(task.inputs).toHaveProperty('mappingsPath');
    expect(task.inputs.mappingsPath).toHaveProperty('type', 'string');
    expect(task.inputs.mappingsPath).toHaveProperty('default', 'bmad-core/data/tool-mappings.yaml');

    // Check outputs
    expect(task).toHaveProperty('outputs');
    expect(task.outputs).toHaveProperty('searchToolsFile');
    expect(task.outputs.searchToolsFile).toHaveProperty('type', 'string');
    expect(task.outputs.searchToolsFile).toHaveProperty('default', 'search-tools.yaml');
  });

  test('structured task should define proper steps', () => {
    const taskContent = fs.readFileSync(taskPath, 'utf8');
    const task = yaml.load(taskContent);

    expect(task.steps.length).toBe(3);
    
    // Second step - parse PRD (first step is initialization)
    const parseStep = task.steps[1];
    expect(parseStep).toHaveProperty('id', 'parse-prd');
    expect(parseStep).toHaveProperty('name', 'Parse PRD and Extract Keywords');
    expect(parseStep).toHaveProperty('actions');
    expect(Array.isArray(parseStep.actions)).toBe(true);
    
    // Check that the action contains the script execution
    const scriptAction = parseStep.actions[0];
    expect(scriptAction.action).toContain('node scripts/generate-search-tools.js');
    expect(scriptAction.action).toContain('{{inputs.prdPath}}');
    expect(scriptAction.action).toContain('{{inputs.mappingsPath}}');
    expect(scriptAction.action).toContain('{{outputs.searchToolsFile}}');
    
    // Third step - validate output
    const validateStep = task.steps[2];
    expect(validateStep).toHaveProperty('id', 'validate-output');
    expect(validateStep).toHaveProperty('name', 'Validate Generated Search Tools');
    expect(validateStep).toHaveProperty('actions');
    
    // Should now call the validation script
    const validateAction = validateStep.actions[0];
    expect(validateAction.action).toContain('node scripts/validate-search-tools.js');
    expect(validateAction.action).toContain('{{outputs.searchToolsFile}}');
  });

  test('structured task should have metadata', () => {
    const taskContent = fs.readFileSync(taskPath, 'utf8');
    const task = yaml.load(taskContent);

    expect(task).toHaveProperty('metadata');
    expect(task.metadata).toHaveProperty('agent', 'sm');
    expect(task.metadata).toHaveProperty('priority', 'high');
    expect(task.metadata).toHaveProperty('depends_on');
    expect(task.metadata.depends_on).toContain('prd.md');
    expect(task.metadata).toHaveProperty('tags');
    expect(task.metadata.tags).toContain('search');
    expect(task.metadata.tags).toContain('prd');
    expect(task.metadata.tags).toContain('extraction');
  });
});