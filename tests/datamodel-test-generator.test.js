const DataModelTestGenerator = require('../bmad-core/utils/datamodel-test-generator');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('DataModelTestGenerator', () => {
  let generator;
  let tempDir;

  beforeEach(() => {
    generator = new DataModelTestGenerator();
    // Create a temporary directory for test outputs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmtg-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    test('should initialize with AJV instance', () => {
      expect(generator.ajv).toBeDefined();
      expect(generator.ajv.compile).toBeDefined();
    });
  });

  describe('isPatternSafe', () => {
    test('should reject patterns longer than MAX_PATTERN_LENGTH', () => {
      const longPattern = 'a'.repeat(201);
      expect(generator.isPatternSafe(longPattern)).toBe(false);
    });

    test('should reject ReDoS vulnerable patterns', () => {
      const dangerousPatterns = [
        '(a*)*',
        '(a+)+',
        '(a{1,5})*',
        '(a|b)++'
      ];

      dangerousPatterns.forEach(pattern => {
        expect(generator.isPatternSafe(pattern)).toBe(false);
      });
      
      // Test that simple \d*\d* is safe (not nested)
      expect(generator.isPatternSafe('\\d*\\d*')).toBe(true);
      
      // But [a-z]*[0-9]* is considered dangerous due to potential backtracking
      expect(generator.isPatternSafe('[a-z]*[0-9]*')).toBe(false);
    });

    test('should reject overly complex patterns', () => {
      const complexPattern = 'a*b+c?d{1,3}e*f+g?h{2,4}i*j+k?'; // Many quantifiers
      expect(generator.isPatternSafe(complexPattern)).toBe(false);
    });

    test('should accept safe patterns', () => {
      const safePatterns = [
        '^[a-z0-9-]+$',
        '^CAT-[0-9]{4}$',
        '^[A-Z]{2,4}$',
        '^\\d{4}-\\d{2}-\\d{2}$'
      ];

      safePatterns.forEach(pattern => {
        expect(generator.isPatternSafe(pattern)).toBe(true);
      });
    });
  });

  describe('generateStringFromPattern', () => {
    test('should return safe fallback for unsafe patterns', () => {
      const unsafePattern = '(a*)*';
      expect(generator.generateStringFromPattern(unsafePattern)).toBe('safe-pattern-fallback');
    });

    test('should generate strings for known patterns', () => {
      const patterns = {
        '^[a-z0-9-]+$': 'example-slug-123',
        '^CAT-[0-9]{4}$': 'CAT-1234',
        '^[A-Z]{2,4}$': 'ABC'
      };

      Object.entries(patterns).forEach(([pattern, expected]) => {
        expect(generator.generateStringFromPattern(pattern)).toBe(expected);
      });
    });
  });

  describe('isSchemaLarge', () => {
    test('should return true for schemas larger than threshold', () => {
      const largeSchema = {
        type: 'object',
        properties: {}
      };
      
      // Add many properties to make it large
      for (let i = 0; i < 1000; i++) {
        largeSchema.properties[`prop${i}`] = {
          type: 'string',
          description: 'A very long description that takes up space in the JSON representation'
        };
      }

      expect(generator.isSchemaLarge(largeSchema)).toBe(true);
    });

    test('should return false for small schemas', () => {
      const smallSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };

      expect(generator.isSchemaLarge(smallSchema)).toBe(false);
    });
  });

  describe('generateSchemaReference', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    };

    test('should generate external file reference for large schemas', () => {
      const result = generator.generateSchemaReference('TestModel', schema, true);
      
      expect(result.schemaImport).toBe("const schema = require('./test-model.schema.json');");
      expect(result.schemaSetup).toBe('');
      expect(result.schemaFile).toEqual({
        name: 'test-model.schema.json',
        content: JSON.stringify(schema, null, 2)
      });
    });

    test('should generate inline schema for small schemas', () => {
      const result = generator.generateSchemaReference('TestModel', schema, false);
      
      expect(result.schemaImport).toBe('');
      expect(result.schemaSetup).toContain('const schema =');
      expect(result.schemaFile).toBeNull();
    });
  });

  describe('generateDataModelTests', () => {
    const storyContract = {
      dataModels: {
        User: {
          type: 'object',
          required: ['id', 'email'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user'] }
          }
        },
        Product: {
          type: 'object',
          required: ['id', 'name', 'price'],
          properties: {
            id: { type: 'string', pattern: '^PROD-[0-9]{4}$' },
            name: { type: 'string' },
            price: { type: 'number', minimum: 0 }
          }
        }
      }
    };

    test('should generate tests for all data models', () => {
      const result = generator.generateDataModelTests(storyContract, 'jest');
      
      expect(result.tests).toBeDefined();
      expect(Object.keys(result.tests)).toEqual(['user.test.js', 'product.test.js']);
    });

    test('should return empty object when no data models', () => {
      const emptyContract = { dataModels: {} };
      const result = generator.generateDataModelTests(emptyContract, 'jest');
      
      expect(result).toEqual({});
    });

    test('should generate schema files for large schemas', () => {
      // Create a large schema
      const largeModel = {
        type: 'object',
        properties: {}
      };
      for (let i = 0; i < 1000; i++) {
        largeModel.properties[`field${i}`] = { 
          type: 'string',
          description: 'Long description to increase size'
        };
      }

      const contractWithLargeModel = {
        dataModels: {
          LargeModel: largeModel
        }
      };

      const result = generator.generateDataModelTests(contractWithLargeModel, 'jest');
      
      expect(result.schemaFiles).toBeDefined();
      expect(Object.keys(result.schemaFiles)).toContain('large-model.schema.json');
    });
  });

  describe('generateValidationTestCases', () => {
    const schema = {
      type: 'object',
      required: ['id', 'email'],
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        age: { type: 'number' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        code: { type: 'string', pattern: '^[A-Z]{3}$' }
      }
    };

    test('should generate test cases for all validation types', () => {
      const testCases = generator.generateValidationTestCases('TestModel', schema, 'jest');
      
      // Check for valid test cases
      const validCases = testCases.filter(tc => tc.type === 'valid');
      expect(validCases).toHaveLength(2); // complete valid + minimal valid
      
      // Check for invalid test cases
      const invalidCases = testCases.filter(tc => tc.type === 'invalid');
      
      // Should have tests for: 2 required fields + 5 properties with validation
      expect(invalidCases.length).toBeGreaterThan(0);
      
      // Check specific test case types
      const requiredTests = invalidCases.filter(tc => tc.assertion === 'expectRequired');
      expect(requiredTests).toHaveLength(2); // id and email
      
      const typeTests = invalidCases.filter(tc => tc.assertion === 'expectType');
      expect(typeTests.length).toBeGreaterThan(0);
      
      const formatTests = invalidCases.filter(tc => tc.assertion === 'expectFormat');
      expect(formatTests).toHaveLength(1); // email format
      
      const enumTests = invalidCases.filter(tc => tc.assertion === 'expectEnum');
      expect(enumTests).toHaveLength(1); // status enum
      
      const patternTests = invalidCases.filter(tc => tc.assertion === 'expectPattern');
      expect(patternTests).toHaveLength(1); // code pattern
    });
  });

  describe('generateJestTests', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      }
    };

    test('should generate valid Jest test content', () => {
      const schemaRef = generator.generateSchemaReference('TestModel', schema, false);
      const testContent = generator.generateJestTests('TestModel', schema, schemaRef);
      
      // Check for Jest-specific syntax
      expect(testContent).toContain('describe(');
      expect(testContent).toContain('test(');
      expect(testContent).toContain('beforeAll(');
      expect(testContent).toContain('expect(');
      expect(testContent).toContain('toBe(');
      expect(testContent).toContain('toBeNull()');
      expect(testContent).toContain('toContainEqual(');
    });

    test('should include schema import for external schemas', () => {
      const schemaRef = generator.generateSchemaReference('TestModel', schema, true);
      const testContent = generator.generateJestTests('TestModel', schema, schemaRef);
      
      expect(testContent).toContain("const schema = require('./test-model.schema.json');");
    });
  });

  describe('generateMochaTests', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      }
    };

    test('should generate valid Mocha test content', () => {
      const schemaRef = generator.generateSchemaReference('TestModel', schema, false);
      const testContent = generator.generateMochaTests('TestModel', schema, schemaRef);
      
      // Check for Mocha-specific syntax
      expect(testContent).toContain('describe(');
      expect(testContent).toContain('it(');
      expect(testContent).toContain('before(');
      expect(testContent).toContain('expect(');
      expect(testContent).toContain('to.be.true');
      expect(testContent).toContain('to.be.false');
      expect(testContent).toContain('to.be.null');
      expect(testContent).toContain('const { expect } = require(\'chai\')');
    });
  });

  describe('generateExampleValue', () => {
    test('should use example value if provided', () => {
      const propSchema = { type: 'string', example: 'test-example' };
      expect(generator.generateExampleValue(propSchema)).toBe('test-example');
    });

    test('should use default value if no example', () => {
      const propSchema = { type: 'string', default: 'default-value' };
      expect(generator.generateExampleValue(propSchema)).toBe('default-value');
    });

    test('should use first enum value if enum is defined', () => {
      const propSchema = { type: 'string', enum: ['option1', 'option2'] };
      expect(generator.generateExampleValue(propSchema)).toBe('option1');
    });

    test('should generate appropriate values for different formats', () => {
      const formats = {
        email: 'test@example.com',
        date: '2024-01-01',
        'date-time': '2024-01-01T00:00:00Z',
        uri: 'https://example.com',
        uuid: '550e8400-e29b-41d4-a716-446655440000'
      };

      Object.entries(formats).forEach(([format, expected]) => {
        const propSchema = { type: 'string', format };
        expect(generator.generateExampleValue(propSchema)).toBe(expected);
      });
    });

    test('should handle arrays and objects', () => {
      const arraySchema = { type: 'array', items: { type: 'string' } };
      const result = generator.generateExampleValue(arraySchema);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      const objectSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };
      const objResult = generator.generateExampleValue(objectSchema);
      expect(typeof objResult).toBe('object');
      expect(objResult.name).toBe('example string');
    });
  });

  describe('toKebabCase', () => {
    test('should convert camelCase to kebab-case', () => {
      expect(generator.toKebabCase('UserProfile')).toBe('user-profile');
      expect(generator.toKebabCase('productCatalog')).toBe('product-catalog');
      expect(generator.toKebabCase('XMLHttpRequest')).toBe('xmlhttp-request');
      expect(generator.toKebabCase('simpleTest')).toBe('simple-test');
      expect(generator.toKebabCase('CamelCase')).toBe('camel-case');
    });
  });

  describe('writeTestsToFiles', () => {
    test('should write test files to directory', () => {
      const result = {
        tests: {
          'user.test.js': 'test content 1',
          'product.test.js': 'test content 2'
        },
        schemaFiles: {
          'user.schema.json': '{"type":"object"}',
          'product.schema.json': '{"type":"object"}'
        }
      };

      generator.writeTestsToFiles(result, tempDir);

      // Check test files
      expect(fs.existsSync(path.join(tempDir, 'user.test.js'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'product.test.js'))).toBe(true);
      
      // Check schema files
      expect(fs.existsSync(path.join(tempDir, 'user.schema.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'product.schema.json'))).toBe(true);

      // Verify content
      const userTest = fs.readFileSync(path.join(tempDir, 'user.test.js'), 'utf8');
      expect(userTest).toBe('test content 1');
    });

    test('should handle backward compatibility (tests only)', () => {
      const tests = {
        'test.test.js': 'test content'
      };

      generator.writeTestsToFiles(tests, tempDir);
      
      expect(fs.existsSync(path.join(tempDir, 'test.test.js'))).toBe(true);
    });

    test('should create directory if it does not exist', () => {
      const newDir = path.join(tempDir, 'new-test-dir');
      const result = {
        tests: {
          'test.test.js': 'content'
        }
      };

      generator.writeTestsToFiles(result, newDir);
      
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.existsSync(path.join(newDir, 'test.test.js'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should throw error for unsupported test framework', () => {
      const schema = { type: 'object' };
      expect(() => {
        generator.generateTestContent('Model', schema, 'unsupported');
      }).toThrow('Unsupported test framework: unsupported');
    });

    test('should handle schemas without properties gracefully', () => {
      const schema = { type: 'object' };
      const testCases = generator.generateValidationTestCases('Model', schema, 'jest');
      
      expect(testCases).toBeDefined();
      expect(testCases.length).toBeGreaterThan(0);
    });
  });
});