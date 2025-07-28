const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

describe('Validation System Integration Tests', () => {
  const projectRoot = path.join(__dirname, '..', '..');
  
  test('npm run validate:all should succeed with current files', () => {
    const result = execSync('npm run validate:all', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    
    expect(result).toContain('All files are valid!');
    expect(result).not.toContain('validation errors');
  });
  
  test('npm run validate:tasks should validate only task files', () => {
    const result = execSync('npm run validate:tasks', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    
    expect(result).toContain('Tasks Validation');
    expect(result).not.toContain('Checklists');
  });
  
  test('npm run validate:checklists should validate only checklist files', () => {
    const result = execSync('npm run validate:checklists', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    
    expect(result).toContain('Checklists Validation');
    expect(result).not.toContain('Tasks Validation');
  });
  
  test('validation should fail for invalid files', () => {
    // Create a temporary invalid file
    const tempDir = path.join(projectRoot, 'tests', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const invalidTaskFile = path.join(tempDir, 'invalid-task.yaml');
    const invalidContent = {
      // Missing required 'id' field
      name: 'Invalid Task'
    };
    
    fs.writeFileSync(invalidTaskFile, yaml.dump(invalidContent));
    
    // Test that validation catches the error
    const validateScript = require(path.join(projectRoot, 'scripts', 'validate-all.js'));
    const result = validateScript.validateFile(
      invalidTaskFile,
      validateScript.validators.task,
      'task'
    );
    
    expect(result).toBe(false);
    
    // Clean up
    fs.unlinkSync(invalidTaskFile);
    fs.rmdirSync(tempDir);
  });
  
  test('all schemas should be valid JSON Schema', () => {
    const schemaFiles = [
      'task-schema.json',
      'structured-task-schema.json',
      'checklist-schema.json'
    ];
    
    schemaFiles.forEach(file => {
      const schemaPath = path.join(projectRoot, 'bmad-core', 'schemas', file);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      
      expect(schema).toHaveProperty('$schema');
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema).toHaveProperty('title');
      expect(schema).toHaveProperty('type');
      expect(schema).toHaveProperty('properties');
    });
  });
  
  test('ModuleResolver should correctly resolve schema paths', () => {
    const ModuleResolver = require(path.join(projectRoot, 'bmad-core', 'utils', 'module-resolver.js'));
    
    const schemas = [
      'taskSchema',
      'structuredTaskSchema',
      'checklistSchema'
    ];
    
    schemas.forEach(schemaKey => {
      const schemaPath = ModuleResolver.resolveSchemaPath(schemaKey, projectRoot);
      expect(schemaPath).toBeTruthy();
      expect(fs.existsSync(schemaPath)).toBe(true);
    });
  });
});