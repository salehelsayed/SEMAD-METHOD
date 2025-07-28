const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('Schema Structure Tests', () => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  const schemaDir = path.join(__dirname, '..', 'bmad-core', 'schemas');
  
  test('all schema files should be valid JSON Schema', () => {
    const schemaFiles = [
      'task-schema.json',
      'structured-task-schema.json',
      'checklist-schema.json',
      'story-contract-schema.json',
      'prd-schema.json',
      'architecture-schema.json'
    ];
    
    schemaFiles.forEach(file => {
      const schemaPath = path.join(schemaDir, file);
      
      if (!fs.existsSync(schemaPath)) {
        console.warn(`Schema file not found: ${file}`);
        return;
      }
      
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      let schema;
      
      // Test JSON parsing
      expect(() => {
        schema = JSON.parse(schemaContent);
      }).not.toThrow();
      
      // Test schema compilation
      expect(() => {
        ajv.compile(schema);
      }).not.toThrow();
      
      // Test required schema properties
      expect(schema).toHaveProperty('$schema');
      expect(schema).toHaveProperty('title');
      expect(schema).toHaveProperty('type');
    });
  });
  
  test('task schema should have required properties', () => {
    const taskSchemaPath = path.join(schemaDir, 'task-schema.json');
    const taskSchema = JSON.parse(fs.readFileSync(taskSchemaPath, 'utf8'));
    
    // Task schema has flexible requirements - only id and name are required
    expect(taskSchema.required).toContain('id');
    expect(taskSchema.required).toContain('name');
    expect(taskSchema.properties).toHaveProperty('id');
    expect(taskSchema.properties).toHaveProperty('name');
    expect(taskSchema.properties).toHaveProperty('purpose');
    expect(taskSchema.properties).toHaveProperty('type');
    expect(taskSchema.properties).toHaveProperty('priority');
  });
  
  test('structured task schema should have required properties', () => {
    const structuredTaskSchemaPath = path.join(schemaDir, 'structured-task-schema.json');
    const structuredTaskSchema = JSON.parse(fs.readFileSync(structuredTaskSchemaPath, 'utf8'));
    
    // Structured task schema has minimal requirements - only id is required
    expect(structuredTaskSchema.required).toContain('id');
    expect(structuredTaskSchema.properties).toHaveProperty('id');
    expect(structuredTaskSchema.properties).toHaveProperty('name');
    expect(structuredTaskSchema.properties).toHaveProperty('purpose');
    expect(structuredTaskSchema.properties).toHaveProperty('steps');
    
    // Test steps structure
    const stepsSchema = structuredTaskSchema.properties.steps;
    expect(stepsSchema.type).toBe('array');
    expect(stepsSchema.items.required).toContain('id');
    expect(stepsSchema.items.required).toContain('name');
    // Steps can have either 'actions' array or 'action' string
    expect(stepsSchema.items.oneOf).toBeDefined();
    expect(stepsSchema.items.oneOf[0].required).toContain('actions');
    expect(stepsSchema.items.oneOf[1].required).toContain('action');
  });
  
  test('checklist schema should have required properties', () => {
    const checklistSchemaPath = path.join(schemaDir, 'checklist-schema.json');
    const checklistSchema = JSON.parse(fs.readFileSync(checklistSchemaPath, 'utf8'));
    
    expect(checklistSchema.required).toContain('id');
    expect(checklistSchema.required).toContain('name');
    expect(checklistSchema.required).toContain('categories');
    expect(checklistSchema.required).toContain('result');
    expect(checklistSchema.properties).toHaveProperty('id');
    expect(checklistSchema.properties).toHaveProperty('name');
    expect(checklistSchema.properties).toHaveProperty('categories');
    expect(checklistSchema.properties).toHaveProperty('result');
    
    // Test categories structure
    const categoriesSchema = checklistSchema.properties.categories;
    expect(categoriesSchema.type).toBe('array');
    expect(categoriesSchema.items.required).toContain('name');
    expect(categoriesSchema.items.required).toContain('items');
    
    // Test result structure
    const resultSchema = checklistSchema.properties.result;
    expect(resultSchema.required).toContain('status');
    expect(resultSchema.properties.status.enum).toEqual(['pending', 'pass', 'partial', 'fail']);
  });
  
  test('schemas should properly reference each other', () => {
    // Test that task schema allows structuredTaskReference
    const taskSchemaPath = path.join(schemaDir, 'task-schema.json');
    const taskSchema = JSON.parse(fs.readFileSync(taskSchemaPath, 'utf8'));
    
    expect(taskSchema.properties).toHaveProperty('structuredTaskReference');
    expect(taskSchema.properties.structuredTaskReference.type).toBe('string');
  });
  
  test('schemas should have consistent pattern constraints', () => {
    const structuredTaskSchemaPath = path.join(schemaDir, 'structured-task-schema.json');
    const structuredTaskSchema = JSON.parse(fs.readFileSync(structuredTaskSchemaPath, 'utf8'));
    
    // Test ID patterns
    expect(structuredTaskSchema.properties.id).toHaveProperty('pattern');
    expect(structuredTaskSchema.properties.id.pattern).toBe('^[a-z0-9-]+$');
    
    // Test step ID patterns
    const stepIdSchema = structuredTaskSchema.properties.steps.items.properties.id;
    expect(stepIdSchema).toHaveProperty('pattern');
    expect(stepIdSchema.pattern).toBe('^[a-zA-Z0-9-]+$');
  });
});