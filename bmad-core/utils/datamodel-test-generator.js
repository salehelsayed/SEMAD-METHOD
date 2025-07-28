const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Constants for security and performance
const MAX_PATTERN_LENGTH = 200;
const MAX_PATTERN_COMPLEXITY = 10; // Max number of quantifiers/alternations
const LARGE_SCHEMA_THRESHOLD = 50000; // 50KB threshold for external schema files

class DataModelTestGenerator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  /**
   * Generate unit tests for data models defined in a StoryContract
   * @param {Object} storyContract - The StoryContract containing dataModels
   * @param {string} testFramework - The test framework to use (jest, mocha, etc.)
   * @returns {Object} Object containing test file paths and their content
   */
  generateDataModelTests(storyContract, testFramework = 'jest') {
    if (!storyContract.dataModels || Object.keys(storyContract.dataModels).length === 0) {
      return {};
    }

    const tests = {};
    const schemaFiles = {};
    
    for (const [modelName, schema] of Object.entries(storyContract.dataModels)) {
      const testFileName = `${this.toKebabCase(modelName)}.test.js`;
      const result = this.generateTestContent(modelName, schema, testFramework);
      
      tests[testFileName] = result.testContent;
      
      // Add schema file if needed
      if (result.schemaFile) {
        schemaFiles[result.schemaFile.name] = result.schemaFile.content;
      }
    }

    // Return both tests and schema files
    return { tests, schemaFiles };
  }

  /**
   * Check if schema is too large and should be in external file
   * @param {Object} schema - The schema object
   * @returns {boolean} True if schema should be external
   */
  isSchemaLarge(schema) {
    const schemaSize = JSON.stringify(schema).length;
    return schemaSize > LARGE_SCHEMA_THRESHOLD;
  }

  /**
   * Generate schema reference for tests
   * @param {string} modelName - Name of the model
   * @param {Object} schema - The schema object
   * @param {boolean} useExternalFile - Whether to use external file
   * @returns {Object} Object with schemaSetup and schemaImport
   */
  generateSchemaReference(modelName, schema, useExternalFile) {
    if (useExternalFile) {
      const schemaFileName = `${this.toKebabCase(modelName)}.schema.json`;
      return {
        schemaImport: `const schema = require('./${schemaFileName}');`,
        schemaSetup: '',
        schemaFile: {
          name: schemaFileName,
          content: JSON.stringify(schema, null, 2)
        }
      };
    } else {
      return {
        schemaImport: '',
        schemaSetup: `  const schema = ${JSON.stringify(schema, null, 2)};`,
        schemaFile: null
      };
    }
  }

  /**
   * Generate test content for a single data model
   * @param {string} modelName - Name of the data model
   * @param {Object} schema - JSON Schema for the model
   * @param {string} testFramework - Test framework to use
   * @returns {Object} Object with test content and optional schema file
   */
  generateTestContent(modelName, schema, testFramework) {
    const useExternalSchema = this.isSchemaLarge(schema);
    const schemaRef = this.generateSchemaReference(modelName, schema, useExternalSchema);
    
    let testContent;
    if (testFramework === 'jest') {
      testContent = this.generateJestTests(modelName, schema, schemaRef);
    } else if (testFramework === 'mocha') {
      testContent = this.generateMochaTests(modelName, schema, schemaRef);
    } else {
      throw new Error(`Unsupported test framework: ${testFramework}`);
    }
    
    return {
      testContent,
      schemaFile: schemaRef.schemaFile
    };
  }

  /**
   * Generate common test setup code
   * @param {string} testFramework - 'jest' or 'mocha'
   * @param {Object} schemaRef - Schema reference object
   * @returns {string} Common setup code
   */
  generateCommonSetup(testFramework, schemaRef) {
    const imports = `const Ajv = require('ajv');
const addFormats = require('ajv-formats');${
      schemaRef.schemaImport ? '\n' + schemaRef.schemaImport : ''
    }`;
    
    return imports;
  }

  /**
   * Generate validation test cases (shared between Jest and Mocha)
   * @param {string} modelName - Name of the data model
   * @param {Object} schema - JSON Schema for the model
   * @param {string} testFramework - 'jest' or 'mocha'
   * @returns {Array} Array of test case objects
   */
  generateValidationTestCases(modelName, schema, testFramework) {
    const testCases = [];
    const requiredFields = schema.required || [];
    const properties = schema.properties || {};
    
    // Valid object test
    testCases.push({
      type: 'valid',
      description: `should validate a complete valid ${modelName}`,
      setup: `const valid${modelName} = ${this.generateValidExample(schema)};`,
      assertion: 'expectValid',
      target: `valid${modelName}`
    });
    
    // Minimal object test
    if (requiredFields.length > 0) {
      testCases.push({
        type: 'valid',
        description: `should validate ${modelName} with only required fields`,
        setup: `const minimal${modelName} = ${this.generateMinimalExample(schema)};`,
        assertion: 'expectValid',
        target: `minimal${modelName}`
      });
    }
    
    // Missing required field tests
    for (const field of requiredFields) {
      testCases.push({
        type: 'invalid',
        description: `should fail validation when missing required field: ${field}`,
        setup: `const invalid${modelName} = ${this.generateValidExample(schema)};\n      delete invalid${modelName}.${field};`,
        assertion: 'expectRequired',
        target: `invalid${modelName}`,
        field: field
      });
    }
    
    // Type validation tests
    for (const [propName, propSchema] of Object.entries(properties)) {
      if (propSchema.type) {
        testCases.push({
          type: 'invalid',
          description: `should fail validation when ${propName} has wrong type`,
          setup: this.generateTypeTestSetup(modelName, propName, propSchema),
          assertion: 'expectType',
          target: `invalid${modelName}`,
          property: propName
        });
      }
      
      if (propSchema.enum) {
        testCases.push({
          type: 'invalid',
          description: `should fail validation when ${propName} is not one of allowed values`,
          setup: this.generateEnumTestSetup(modelName, propName, propSchema),
          assertion: 'expectEnum',
          target: `invalid${modelName}`,
          property: propName
        });
      }
      
      if (propSchema.pattern) {
        testCases.push({
          type: 'invalid',
          description: `should fail validation when ${propName} does not match pattern`,
          setup: this.generatePatternTestSetup(modelName, propName, propSchema),
          assertion: 'expectPattern',
          target: `invalid${modelName}`,
          property: propName
        });
      }
      
      if (propSchema.format) {
        testCases.push({
          type: 'invalid',
          description: `should fail validation when ${propName} has invalid ${propSchema.format} format`,
          setup: this.generateFormatTestSetup(modelName, propName, propSchema),
          assertion: 'expectFormat',
          target: `invalid${modelName}`,
          property: propName
        });
      }
    }
    
    return testCases;
  }

  /**
   * Generate Jest tests for a data model
   * @param {string} modelName - Name of the data model
   * @param {Object} schema - JSON Schema for the model
   * @param {Object} schemaRef - Schema reference object
   * @returns {string} Jest test content
   */
  generateJestTests(modelName, schema, schemaRef) {
    const testCases = this.generateValidationTestCases(modelName, schema, 'jest');
    
    let testContent = `${this.generateCommonSetup('jest', schemaRef)}

describe('${modelName} Data Model Validation', () => {
  let ajv;
  let validate;
${schemaRef.schemaSetup}
  
  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid ${modelName} objects', () => {
`;

    // Generate test cases
    const validTests = testCases.filter(tc => tc.type === 'valid');
    const invalidTests = testCases.filter(tc => tc.type === 'invalid');
    
    // Add valid test cases
    for (const testCase of validTests) {
      testContent += this.generateJestTestCase(testCase);
    }
    
    testContent += `  });

  describe('Invalid ${modelName} objects', () => {
`;
    
    // Add invalid test cases
    for (const testCase of invalidTests) {
      testContent += this.generateJestTestCase(testCase);
    }
    
    testContent += `  });
});
`;

    return testContent;
  }

  /**
   * Generate a Jest test case
   * @param {Object} testCase - Test case object
   * @returns {string} Jest test code
   */
  generateJestTestCase(testCase) {
    let testCode = `    test('${testCase.description}', () => {
      ${testCase.setup}
      
      const isValid = validate(${testCase.target});
`;
    
    switch (testCase.assertion) {
      case 'expectValid':
        testCode += `      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
`;
        break;
      case 'expectRequired':
        testCode += `      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: '${testCase.field}' }
        })
      );
`;
        break;
      case 'expectType':
      case 'expectEnum':
      case 'expectPattern':
      case 'expectFormat':
        const keyword = testCase.assertion.replace('expect', '').toLowerCase();
        testCode += `      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: '${keyword}',
          instancePath: '/${testCase.property}'
        })
      );
`;
        break;
    }
    
    testCode += `    });

`;
    return testCode;
  }

  /**
   * Generate a Mocha test case
   * @param {Object} testCase - Test case object
   * @returns {string} Mocha test code
   */
  generateMochaTestCase(testCase) {
    let testCode = `    it('${testCase.description}', () => {
      ${testCase.setup}
      
      const isValid = validate(${testCase.target});
`;
    
    switch (testCase.assertion) {
      case 'expectValid':
        testCode += `      expect(isValid).to.be.true;
      expect(validate.errors).to.be.null;
`;
        break;
      case 'expectRequired':
        testCode += `      expect(isValid).to.be.false;
      expect(validate.errors).to.deep.include({
        keyword: 'required',
        params: { missingProperty: '${testCase.field}' },
        schemaPath: '#/required',
        instancePath: ''
      });
`;
        break;
      case 'expectType':
      case 'expectEnum':
      case 'expectPattern':
      case 'expectFormat':
        const keyword = testCase.assertion.replace('expect', '').toLowerCase();
        testCode += `      expect(isValid).to.be.false;
      const error = validate.errors.find(e => e.keyword === '${keyword}' && e.instancePath === '/${testCase.property}');
      expect(error).to.exist;
`;
        break;
    }
    
    testCode += `    });

`;
    return testCode;
  }

  /**
   * Generate Mocha tests for a data model
   * @param {string} modelName - Name of the data model
   * @param {Object} schema - JSON Schema for the model
   * @param {Object} schemaRef - Schema reference object
   * @returns {string} Mocha test content
   */
  generateMochaTests(modelName, schema, schemaRef) {
    const testCases = this.generateValidationTestCases(modelName, schema, 'mocha');
    
    let testContent = `const { expect } = require('chai');
${this.generateCommonSetup('mocha', schemaRef)}

describe('${modelName} Data Model Validation', () => {
  let ajv;
  let validate;
${schemaRef.schemaSetup}
  
  before(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid ${modelName} objects', () => {
`;

    // Generate test cases
    const validTests = testCases.filter(tc => tc.type === 'valid');
    const invalidTests = testCases.filter(tc => tc.type === 'invalid');
    
    // Add valid test cases
    for (const testCase of validTests) {
      testContent += this.generateMochaTestCase(testCase);
    }
    
    testContent += `  });

  describe('Invalid ${modelName} objects', () => {
`;
    
    // Add invalid test cases
    for (const testCase of invalidTests) {
      testContent += this.generateMochaTestCase(testCase);
    }
    
    testContent += `  });
});
`;

    return testContent;
  }

  /**
   * Generate a valid example object based on the schema
   * @param {Object} schema - JSON Schema
   * @returns {string} JSON string of valid example
   */
  generateValidExample(schema) {
    const example = {};
    
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        example[propName] = this.generateExampleValue(propSchema);
      }
    }
    
    return JSON.stringify(example, null, 2);
  }

  /**
   * Generate a minimal example with only required fields
   * @param {Object} schema - JSON Schema
   * @returns {string} JSON string of minimal example
   */
  generateMinimalExample(schema) {
    const example = {};
    const required = schema.required || [];
    
    if (schema.properties) {
      for (const field of required) {
        if (schema.properties[field]) {
          example[field] = this.generateExampleValue(schema.properties[field]);
        }
      }
    }
    
    return JSON.stringify(example, null, 2);
  }

  /**
   * Generate an example value based on property schema
   * @param {Object} propSchema - Property schema
   * @returns {any} Example value
   */
  generateExampleValue(propSchema) {
    if (propSchema.example !== undefined) {
      return propSchema.example;
    }
    
    if (propSchema.default !== undefined) {
      return propSchema.default;
    }
    
    if (propSchema.enum && propSchema.enum.length > 0) {
      return propSchema.enum[0];
    }
    
    switch (propSchema.type) {
      case 'string':
        if (propSchema.format === 'email') return 'test@example.com';
        if (propSchema.format === 'date') return '2024-01-01';
        if (propSchema.format === 'date-time') return '2024-01-01T00:00:00Z';
        if (propSchema.format === 'uri') return 'https://example.com';
        if (propSchema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
        if (propSchema.pattern) return this.generateStringFromPattern(propSchema.pattern);
        return 'example string';
        
      case 'number':
      case 'integer':
        if (propSchema.minimum !== undefined) return propSchema.minimum;
        if (propSchema.maximum !== undefined) return propSchema.maximum;
        return 42;
        
      case 'boolean':
        return true;
        
      case 'array':
        const itemExample = propSchema.items ? this.generateExampleValue(propSchema.items) : 'item';
        return [itemExample];
        
      case 'object':
        if (propSchema.properties) {
          const obj = {};
          for (const [key, value] of Object.entries(propSchema.properties)) {
            obj[key] = this.generateExampleValue(value);
          }
          return obj;
        }
        return {};
        
      default:
        return null;
    }
  }

  /**
   * Generate type test setup
   */
  generateTypeTestSetup(modelName, propName, propSchema) {
    const wrongTypeValue = this.getWrongTypeValue(propSchema.type);
    return `const invalid${modelName} = ${this.generateValidExample({ properties: { [propName]: propSchema } })};
      invalid${modelName}.${propName} = ${JSON.stringify(wrongTypeValue)};`;
  }

  /**
   * Generate enum test setup
   */
  generateEnumTestSetup(modelName, propName, propSchema) {
    return `const invalid${modelName} = ${this.generateValidExample({ properties: { [propName]: propSchema } })};
      invalid${modelName}.${propName} = 'invalid_enum_value';`;
  }

  /**
   * Generate pattern test setup
   */
  generatePatternTestSetup(modelName, propName, propSchema) {
    return `const invalid${modelName} = ${this.generateValidExample({ properties: { [propName]: propSchema } })};
      invalid${modelName}.${propName} = 'invalid_pattern_value';`;
  }

  /**
   * Generate format test setup
   */
  generateFormatTestSetup(modelName, propName, propSchema) {
    const invalidFormatValue = this.getInvalidFormatValue(propSchema.format);
    return `const invalid${modelName} = ${this.generateValidExample({ properties: { [propName]: propSchema } })};
      invalid${modelName}.${propName} = '${invalidFormatValue}';`;
  }

  /**
   * Get a value of the wrong type for testing
   */
  getWrongTypeValue(correctType) {
    const typeMap = {
      'string': 123,
      'number': 'not a number',
      'integer': 'not an integer',
      'boolean': 'not a boolean',
      'array': 'not an array',
      'object': 'not an object'
    };
    return typeMap[correctType] || null;
  }

  /**
   * Get an invalid value for format testing
   */
  getInvalidFormatValue(format) {
    const formatMap = {
      'email': 'not-an-email',
      'date': 'not-a-date',
      'date-time': 'not-a-datetime',
      'uri': 'not a uri',
      'uuid': 'not-a-uuid',
      'ipv4': 'not.an.ip',
      'ipv6': 'not:an:ipv6'
    };
    return formatMap[format] || 'invalid';
  }

  /**
   * Validate regex pattern for security (ReDoS prevention)
   * @param {string} pattern - The regex pattern to validate
   * @returns {boolean} True if pattern is safe, false otherwise
   */
  isPatternSafe(pattern) {
    // Check pattern length
    if (pattern.length > MAX_PATTERN_LENGTH) {
      console.warn(`Pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH}): ${pattern}`);
      return false;
    }

    // Check for dangerous patterns that can cause ReDoS
    const dangerousPatterns = [
      /\([^)]*\*\)[*+]/,           // (a*)*
      /\([^)]*\+\)[*+]/,           // (a+)+
      /\([^)]*\{[^}]*\}\)[*+]/,    // (a{n,m})*
      /\([^)]*\|[^)]*\)\+\+/,      // (a|b)++
      /\\\\d\*\\\\d\*/,            // \d*\d*
      /\[[^\]]*\]\*\[[^\]]*\]\*/   // [a-z]*[0-9]*
    ];

    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        console.warn(`Potentially dangerous pattern detected: ${pattern}`);
        return false;
      }
    }

    // Count complexity indicators
    const quantifiers = (pattern.match(/[*+?{]/g) || []).length;
    const alternations = (pattern.match(/\|/g) || []).length;
    const complexity = quantifiers + alternations;

    if (complexity > MAX_PATTERN_COMPLEXITY) {
      console.warn(`Pattern too complex (complexity ${complexity} > ${MAX_PATTERN_COMPLEXITY}): ${pattern}`);
      return false;
    }

    return true;
  }

  /**
   * Generate a string that matches a simple pattern
   * @param {string} pattern - The regex pattern to match
   * @returns {string} A string that matches the pattern
   */
  generateStringFromPattern(pattern) {
    // Validate pattern for security
    if (!this.isPatternSafe(pattern)) {
      console.warn(`Unsafe pattern detected, using fallback: ${pattern}`);
      return 'safe-pattern-fallback';
    }

    // This is a simplified implementation
    // For complex patterns, you might want to use a library like randexp
    
    // Common patterns
    if (pattern === '^[a-z0-9-]+$') return 'example-slug-123';
    if (pattern === '^CAT-[0-9]{4}$') return 'CAT-1234';
    if (pattern === '^[A-Z]{2,4}$') return 'ABC';
    if (pattern === '^\\d{4}-\\d{2}-\\d{2}$') return '2024-01-01';
    if (pattern === '^[a-zA-Z0-9_-]+$') return 'user_name-123';
    if (pattern === '^[a-z]{2}-[A-Z]{2}$') return 'en-US';
    // Phone pattern (E.164 format)
    if (pattern === '^\\+?[1-9]\\d{1,14}$') return '+1234567890';
    if (pattern.includes('[A-Z]') && pattern.includes('[0-9]')) return 'ABC123';
    if (pattern.includes('\\d{3,}')) return '12345';
    if (pattern.includes('[a-z]+')) return 'example';
    if (pattern.includes('[A-Z]+')) return 'EXAMPLE';
    if (pattern.includes('\\d+')) return '12345';
    
    // Default fallback
    return 'pattern-match';
  }

  /**
   * Convert camelCase to kebab-case
   */
  toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Extract data models from a story file
   * @param {string} storyFilePath - Path to the story file
   * @returns {Object|null} Data models from the story contract
   */
  extractDataModelsFromStory(storyFilePath) {
    try {
      const content = fs.readFileSync(storyFilePath, 'utf8');
      
      // Look for YAML front matter containing StoryContract
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      
      if (yamlMatch) {
        const yamlContent = yamlMatch[1];
        const parsed = yaml.load(yamlContent);
        
        if (parsed && parsed.StoryContract && parsed.StoryContract.dataModels) {
          return parsed.StoryContract.dataModels;
        }
      }
      
      return null;
    } catch (error) {
      throw new Error(`Failed to extract data models from story: ${error.message}`);
    }
  }

  /**
   * Write generated tests to files
   * @param {Object} result - Object with tests and schemaFiles
   * @param {string} outputDir - Directory to write test files to
   */
  writeTestsToFiles(result, outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Handle backward compatibility
    const tests = result.tests || result;
    const schemaFiles = result.schemaFiles || {};
    
    // Write test files
    for (const [fileName, content] of Object.entries(tests)) {
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Generated test file: ${filePath}`);
    }
    
    // Write schema files if any
    for (const [fileName, content] of Object.entries(schemaFiles)) {
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Generated schema file: ${filePath}`);
    }
  }
}

module.exports = DataModelTestGenerator;