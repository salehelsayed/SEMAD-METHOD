const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { validateTask, validateStructuredTask, validateChecklist } = require('../scripts/validate-schemas');
const { validateFile, validators, schemas } = require('../scripts/validate-all');

describe('Schema Validation Tests', () => {
  describe('Task Schema Validation', () => {
    test('should validate a valid regular task', () => {
      const validTask = {
        id: 'test-task',
        name: 'Test Task',
        description: 'A test task',
        type: 'task',
        structuredTaskReference: '../structured-tasks/test.yaml',
        steps: {
          step1: 'Do something',
          step2: 'Do something else'
        },
        category: 'test',
        priority: 'high'
      };
      
      expect(validateTask(validTask)).toBe(true);
    });
    
    test('should reject task without required fields', () => {
      const invalidTask = {
        name: 'Test Task'
      };
      
      expect(validateTask(invalidTask)).toBe(false);
      expect(validateTask.errors).toBeDefined();
      expect(validateTask.errors.some(e => e.keyword === 'required')).toBe(true);
    });
    
    test('should reject task with invalid priority', () => {
      const invalidTask = {
        id: 'test-task',
        name: 'Test Task',
        description: 'A test task',
        type: 'task',
        priority: 'invalid'
      };
      
      expect(validateTask(invalidTask)).toBe(false);
    });
  });
  
  describe('Structured Task Schema Validation', () => {
    test('should validate a valid structured task', () => {
      const validStructuredTask = {
        id: 'test-structured-task',
        name: 'Test Structured Task',
        purpose: 'To test structured task validation',
        steps: [
          {
            id: 'step1',
            name: 'First Step',
            actions: [
              {
                description: 'Do something',
                elicit: false
              }
            ]
          }
        ]
      };
      
      expect(validateStructuredTask(validStructuredTask)).toBe(true);
    });
    
    test('should accept structured task without steps (steps are optional)', () => {
      const validTask = {
        id: 'test-task',
        name: 'Test Task',
        purpose: 'Test'
      };
      
      expect(validateStructuredTask(validTask)).toBe(true);
    });
    
    test('should reject structured task with invalid step structure', () => {
      const invalidTask = {
        id: 'test-task',
        name: 'Test Task',
        purpose: 'Test',
        steps: [
          {
            name: 'Missing ID and actions'
          }
        ]
      };
      
      expect(validateStructuredTask(invalidTask)).toBe(false);
    });
    
    test('should validate structured task with metadata', () => {
      const taskWithMetadata = {
        id: 'test-task',
        name: 'Test Task',
        purpose: 'Test',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            actions: [
              {
                description: 'Action',
                elicit: true,
                metadata: {
                  originalIndent: 2
                }
              }
            ],
            metadata: {
              level: 3,
              originalNumber: '1.1'
            }
          }
        ],
        metadata: {
          executionMode: 'SEQUENTIAL',
          originalSections: ['Section 1'],
          preservedContent: [
            {
              type: 'note',
              content: 'Special note',
              lineNumber: 42
            }
          ]
        }
      };
      
      expect(validateStructuredTask(taskWithMetadata)).toBe(true);
    });
  });
  
  describe('Checklist Schema Validation', () => {
    test('should validate a valid checklist', () => {
      const validChecklist = {
        id: 'test-checklist',
        name: 'Test Checklist',
        categories: [
          {
            name: 'Category 1',
            items: [
              {
                description: 'Check item 1',
                checked: false
              }
            ]
          }
        ],
        result: {
          status: 'pending'
        }
      };
      
      expect(validateChecklist(validChecklist)).toBe(true);
    });
    
    test('should reject checklist without categories', () => {
      const invalidChecklist = {
        id: 'test-checklist',
        name: 'Test Checklist',
        result: {
          status: 'pending'
        }
      };
      
      expect(validateChecklist(invalidChecklist)).toBe(false);
    });
    
    test('should reject checklist with invalid status', () => {
      const invalidChecklist = {
        id: 'test-checklist',
        name: 'Test Checklist',
        categories: [
          {
            name: 'Category 1',
            items: [
              {
                description: 'Check item 1'
              }
            ]
          }
        ],
        result: {
          status: 'invalid-status'
        }
      };
      
      expect(validateChecklist(invalidChecklist)).toBe(false);
    });
  });
  
  describe('Existing Files Validation', () => {
    const projectRoot = path.join(__dirname, '..');
    
    test('all regular task files should be valid', () => {
      const taskDirs = [
        path.join(projectRoot, 'bmad-core', 'tasks'),
        path.join(projectRoot, 'common', 'tasks')
      ];
      
      taskDirs.forEach(dir => {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = yaml.load(content);
          
          const valid = validateTask(data);
          if (!valid) {
            console.error(`Invalid task file: ${filePath}`);
            console.error('Errors:', validateTask.errors);
          }
          expect(valid).toBe(true);
        });
      });
    });
    
    test('all structured task files should be valid', () => {
      const structuredTaskDirs = [
        path.join(projectRoot, 'bmad-core', 'structured-tasks'),
        path.join(projectRoot, 'common', 'structured-tasks')
      ];
      
      structuredTaskDirs.forEach(dir => {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = yaml.load(content);
          
          const valid = validateStructuredTask(data);
          if (!valid) {
            console.error(`Invalid structured task file: ${filePath}`);
            console.error('Errors:', validateStructuredTask.errors);
          }
          expect(valid).toBe(true);
        });
      });
    });
    
    test('all checklist files should be valid', () => {
      const checklistDirs = [
        path.join(projectRoot, 'bmad-core', 'structured-checklists'),
        path.join(projectRoot, 'common', 'structured-checklists')
      ];
      
      checklistDirs.forEach(dir => {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = yaml.load(content);
          
          const valid = validateChecklist(data);
          if (!valid) {
            console.error(`Invalid checklist file: ${filePath}`);
            console.error('Errors:', validateChecklist.errors);
          }
          expect(valid).toBe(true);
        });
      });
    });
  });
  
  describe('Comprehensive Validation Script', () => {
    test('validateFile should correctly validate files', () => {
      // Create temporary test file
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const validTaskFile = path.join(tempDir, 'valid-task.yaml');
      const validTaskContent = {
        id: 'temp-task',
        name: 'Temporary Task',
        description: 'Test task',
        type: 'task',
        priority: 'medium'
      };
      
      fs.writeFileSync(validTaskFile, yaml.dump(validTaskContent));
      
      // Mock console.log to capture output
      const originalLog = console.log;
      let logOutput = [];
      console.log = (...args) => logOutput.push(args.join(' '));
      
      const result = validateFile(validTaskFile, validators.task, 'task');
      
      console.log = originalLog;
      
      expect(result).toBe(true);
      expect(logOutput.some(line => line.includes('✓'))).toBe(true);
      
      // Clean up
      fs.unlinkSync(validTaskFile);
      fs.rmdirSync(tempDir);
    });
  });
});