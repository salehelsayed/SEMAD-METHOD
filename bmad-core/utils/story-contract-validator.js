const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ModuleResolver = require('./module-resolver');

class StoryContractValidator {
  constructor() {
    this.ajv = new Ajv({ allowUnionTypes: true });
    // Add format support including uri-reference
    addFormats(this.ajv);
    this.validate = null;
    this.loadSchema();
  }

  loadSchema() {
    try {
      let schemaPath;
      
      // 1. Try to resolve from core config first
      schemaPath = ModuleResolver.resolveSchemaPath('storyContractSchema', process.cwd());
      
      // 2. If not found, try to resolve from current module location
      if (!schemaPath) {
        schemaPath = ModuleResolver.resolveSchemaPath('storyContractSchema', __dirname);
      }
      
      // 3. If still not found, try direct paths
      if (!schemaPath) {
        const schemaPaths = [
          // Relative to validator module
          path.join(__dirname, '../schemas/story-contract-schema.json'),
          // Try to find bmad-core and look there
          ...this.getBmadCoreSchemaPaths(),
          // Try using require.resolve for npm package scenarios
          ...this.tryRequireResolve()
        ];
        
        for (const candidatePath of schemaPaths) {
          if (fs.existsSync(candidatePath)) {
            schemaPath = candidatePath;
            break;
          }
        }
      }
      
      if (!schemaPath) {
        throw new Error('Could not find story-contract-schema.json in any expected location');
      }
      
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      this.validate = this.ajv.compile(schema);
    } catch (error) {
      throw new Error(`Failed to load story contract schema: ${error.message}`);
    }
  }
  
  getBmadCoreSchemaPaths() {
    const paths = [];
    const bmadCore = ModuleResolver.findBmadCoreDir(process.cwd());
    if (bmadCore) {
      paths.push(path.join(bmadCore, 'schemas', 'story-contract-schema.json'));
    }
    
    const bmadCoreFromModule = ModuleResolver.findBmadCoreDir(__dirname);
    if (bmadCoreFromModule && bmadCoreFromModule !== bmadCore) {
      paths.push(path.join(bmadCoreFromModule, 'schemas', 'story-contract-schema.json'));
    }
    
    return paths;
  }
  
  tryRequireResolve() {
    const paths = [];
    try {
      // Try to resolve as if it's an installed package
      const packagePath = require.resolve('bmad-method/bmad-core/schemas/story-contract-schema.json');
      paths.push(packagePath);
    } catch (e) {
      // Not an npm package, that's OK
    }
    return paths;
  }

  /**
   * Validate a StoryContract object
   * @param {Object} contract - The StoryContract to validate
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validateContract(contract) {
    if (!this.validate) {
      throw new Error('Schema not loaded');
    }

    const valid = this.validate(contract);
    
    return {
      valid,
      errors: valid ? [] : this.validate.errors
    };
  }

  /**
   * Extract StoryContract from a story file
   * @param {string} storyFilePath - Path to the story file
   * @returns {Object|null} The extracted StoryContract or null if not found
   */
  extractContractFromStory(storyFilePath) {
    try {
      const content = fs.readFileSync(storyFilePath, 'utf8');
      
      // Look for YAML front matter containing StoryContract
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      
      if (yamlMatch) {
        const yamlContent = yamlMatch[1];
        const parsed = yaml.load(yamlContent);
        
        if (parsed && parsed.StoryContract) {
          return parsed.StoryContract;
        }
      }
      
      return null;
    } catch (error) {
      throw new Error(`Failed to extract contract from story: ${error.message}`);
    }
  }

  /**
   * Validate a story file's StoryContract
   * @param {string} storyFilePath - Path to the story file
   * @returns {Object} { valid: boolean, contract: Object|null, errors: Array }
   */
  validateStoryFile(storyFilePath) {
    try {
      const contract = this.extractContractFromStory(storyFilePath);
      
      if (!contract) {
        return {
          valid: false,
          contract: null,
          errors: [{ message: 'No StoryContract found in story file' }]
        };
      }

      const validation = this.validateContract(contract);
      
      return {
        valid: validation.valid,
        contract,
        errors: validation.errors
      };
    } catch (error) {
      return {
        valid: false,
        contract: null,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Format validation errors for display
   * @param {Array} errors - Array of validation errors from AJV
   * @returns {string} Formatted error message
   */
  formatErrors(errors) {
    if (!errors || errors.length === 0) {
      return 'No errors';
    }

    return errors.map(err => {
      const path = err.instancePath || '/';
      const message = err.message || 'Unknown error';
      
      switch (err.keyword) {
        case 'required':
          return `Missing required field: ${err.params.missingProperty} at ${path}`;
        case 'enum':
          const allowedValues = err.params && err.params.allowedValues 
            ? err.params.allowedValues.join(', ') 
            : 'check schema for allowed values';
          return `Invalid value at ${path}: ${message}. Allowed values: ${allowedValues}`;
        case 'type':
          return `Invalid type at ${path}: expected ${err.params.type}, got ${typeof err.data}`;
        default:
          return `Validation error at ${path}: ${message}`;
      }
    }).join('\n');
  }
}

module.exports = StoryContractValidator;
