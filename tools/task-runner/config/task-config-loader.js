const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const StructuredTaskLoader = require('../../lib/structured-task-loader');
const { resolveModule } = require('../utils');
const {
  ConfigurationError,
  ValidationError
} = require(resolveModule('errors/task-errors', '../semad-core/errors/task-errors'));

class TaskConfigLoader {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.coreConfigPath = null;
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);

    this.schemaValidators = {
      structuredTask: this.compileSchema('schemas/structured-task-schema.json'),
      task: this.compileSchema('schemas/task-schema.json')
    };

    this.structuredTaskLoader = new StructuredTaskLoader(rootDir);
    this.coreConfig = this.loadCoreConfig();
  }

  getCoreConfig() {
    return this.coreConfig;
  }

  getTaskLoader() {
    return this.structuredTaskLoader;
  }

  reloadCoreConfig() {
    this.coreConfig = this.loadCoreConfig();
    return this.coreConfig;
  }

  async loadTask(taskPath) {
    try {
      const taskData = await this.structuredTaskLoader.loadTask(taskPath);

      if (taskData.type === 'structured') {
        this.validateStructuredTask(taskData.data, taskPath);
      }

      return taskData;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (error && typeof error.message === 'string' && error.message.includes('Task validation failed')) {
        throw new ValidationError(
          error.message,
          error.errors || [],
          { taskPath }
        );
      }

      throw error;
    }
  }

  validateStructuredTask(task, taskPath = 'inline task') {
    const validator = this.schemaValidators.structuredTask;

    if (!validator) {
      return { valid: true, errors: [] };
    }

    const valid = validator(task);
    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = validator.errors || [];
    const message = this.formatValidationMessage(
      `Structured task schema validation failed for ${taskPath}`,
      errors
    );

    throw new ValidationError(message, errors, { taskPath });
  }

  validateTaskDefinition(task, taskPath = 'inline task') {
    const validator = this.schemaValidators.task;

    if (!validator) {
      return { valid: true, errors: [] };
    }

    const valid = validator(task);
    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = validator.errors || [];
    const message = this.formatValidationMessage(
      `Task definition schema validation failed for ${taskPath}`,
      errors
    );

    throw new ValidationError(message, errors, { taskPath });
  }

  loadCoreConfig() {
    const fileName = 'core-config.yaml';
    const configPaths = this.coreConfigCandidates(fileName);

    for (const candidate of configPaths) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      try {
        const fileContent = fs.readFileSync(candidate, 'utf8');
        const parsed = yaml.load(fileContent) || {};
        this.coreConfigPath = candidate;
        return parsed;
      } catch (error) {
        console.error('❌ Failed to parse core configuration:', error.message);
        throw new ConfigurationError(
          `Failed to parse core-config.yaml: ${error.message}`,
          candidate,
          { originalError: error.message }
        );
      }
    }

    console.error('❌ Core configuration not found');
    console.error('  Searched in:');
    configPaths.forEach(p => console.error(`    - ${p}`));
    console.error('\n  The core-config.yaml file is required for task execution');

    throw new ConfigurationError(
      'Failed to find core-config.yaml in any expected location',
      fileName,
      { searchedPaths: configPaths }
    );
  }

  compileSchema(relativePath) {
    const schemaPath = this.resolveFromCore(relativePath);
    if (!schemaPath) {
      return null;
    }

    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      return this.ajv.compile(schema);
    } catch (error) {
      console.warn(`⚠️  Failed to load schema ${relativePath}: ${error.message}`);
      return null;
    }
  }

  resolveFromCore(relativePath) {
    const candidates = this.coreDirectoryCandidates()
      .map(base => path.join(base, relativePath));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  coreConfigCandidates(fileName) {
    const rawCandidates = [
      path.join(this.rootDir, '.semad-core', fileName),
      path.join(this.rootDir, 'semad-core', fileName),
      path.join(this.rootDir, fileName)
    ];

    return [...new Set(rawCandidates)];
  }

  coreDirectoryCandidates() {
    const rawCandidates = [
      path.join(this.rootDir, '.semad-core'),
      path.join(this.rootDir, 'semad-core'),
      this.rootDir
    ];

    return [...new Set(rawCandidates)];
  }

  formatValidationMessage(prefix, errors) {
    if (!errors || errors.length === 0) {
      return prefix;
    }

    const details = errors.map(err => {
      const location = err.instancePath && err.instancePath !== '' ? err.instancePath : '/';
      const message = err.message || 'Invalid value';
      return `  - ${location}: ${message}`;
    }).join('\n');

    return `${prefix}:\n${details}`;
  }
}

function loadCoreConfig(rootDir) {
  const loader = new TaskConfigLoader(rootDir);
  return loader.getCoreConfig();
}

module.exports = {
  TaskConfigLoader,
  loadCoreConfig
};
