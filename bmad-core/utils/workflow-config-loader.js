/**
 * Workflow Configuration Loader
 * Loads and validates workflow configuration including Dev↔QA flow settings
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

class WorkflowConfigLoader {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.configPaths = [
      path.join(rootDir, '.bmad-workflow.yaml'),
      path.join(rootDir, '.bmad-workflow.json'),
      path.join(rootDir, 'bmad-workflow.config.yaml'),
      path.join(rootDir, 'bmad-workflow.config.json')
    ];
    this.schemaPath = path.join(rootDir, 'bmad-core', 'schemas', 'workflow-config-schema.json');
    this.ajv = new Ajv({ useDefaults: true });
  }

  /**
   * Load workflow configuration from file or defaults
   * @returns {Object} Workflow configuration
   */
  async loadConfig() {
    // Try to load from various config files
    for (const configPath of this.configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const config = await this.loadConfigFile(configPath);
          const validatedConfig = await this.validateConfig(config);
          return validatedConfig;
        } catch (error) {
          console.warn(`Failed to load config from ${configPath}: ${error.message}`);
        }
      }
    }
    
    // Return default config if no file found
    return this.getDefaultConfig();
  }

  /**
   * Load configuration from a specific file
   * @param {string} filePath - Path to config file
   * @returns {Object} Configuration object
   */
  async loadConfigFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.yaml' || ext === '.yml') {
      return yaml.load(content);
    } else if (ext === '.json') {
      return JSON.parse(content);
    } else {
      throw new Error(`Unsupported config file extension: ${ext}`);
    }
  }

  /**
   * Validate configuration against schema
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validated configuration with defaults applied
   */
  async validateConfig(config) {
    // Load schema
    const schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf8'));
    const validate = this.ajv.compile(schema);
    
    // Validate and apply defaults
    const valid = validate(config);
    
    if (!valid) {
      const errors = validate.errors.map(err => 
        `${err.instancePath || '/'}: ${err.message}`
      ).join('\n');
      throw new Error(`Invalid workflow configuration:\n${errors}`);
    }
    
    return config;
  }

  /**
   * Get default configuration
   * @returns {Object} Default configuration
   */
  getDefaultConfig() {
    return {
      flowType: 'linear',
      maxIterations: 5,
      autoApproveOnNoIssues: true,
      persistIterationHistory: true,
      notifyOnIterationComplete: false,
      qaReviewCriteria: {
        checkCodeStyle: true,
        checkTestCoverage: true,
        checkDocumentation: true,
        checkPerformance: false,
        checkSecurity: false
      },
      devFixStrategy: 'fix-all',
      verbosity: true,
      verbosityLevel: 'normal'
    };
  }

  /**
   * Save configuration to file
   * @param {Object} config - Configuration to save
   * @param {string} format - File format ('yaml' or 'json')
   */
  async saveConfig(config, format = 'yaml') {
    const validated = await this.validateConfig(config);
    
    const filePath = format === 'json' 
      ? path.join(this.rootDir, '.bmad-workflow.json')
      : path.join(this.rootDir, '.bmad-workflow.yaml');
    
    let content;
    if (format === 'json') {
      content = JSON.stringify(validated, null, 2);
    } else {
      content = yaml.dump(validated, { 
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * Update specific configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @param {*} value - New value
   */
  async updateConfig(key, value) {
    const config = await this.loadConfig();
    
    // Set nested value using dot notation
    const keys = key.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    
    // Save updated config
    await this.saveConfig(config);
    return config;
  }

  /**
   * Get specific configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @returns {*} Configuration value
   */
  async getConfigValue(key) {
    const config = await this.loadConfig();
    
    // Get nested value using dot notation
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Check if iterative flow is enabled
   * @returns {boolean} True if iterative flow is enabled
   */
  async isIterativeFlowEnabled() {
    const flowType = await this.getConfigValue('flowType');
    return flowType === 'iterative';
  }

  /**
   * Get QA review criteria
   * @returns {Object} QA review criteria settings
   */
  async getQAReviewCriteria() {
    return await this.getConfigValue('qaReviewCriteria') || this.getDefaultConfig().qaReviewCriteria;
  }
}

module.exports = WorkflowConfigLoader;