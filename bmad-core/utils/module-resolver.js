const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ModuleResolver {
  static resolveSchemaPath(schemaKey, baseDir) {
    try {
      // First, try to find and load core-config.yaml
      const coreConfigPaths = [
        path.join(baseDir, 'bmad-core', 'core-config.yaml'),
        path.join(baseDir, 'core-config.yaml')
      ];

      let coreConfig = null;
      let coreConfigPath = null;

      for (const configPath of coreConfigPaths) {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          coreConfig = yaml.load(content);
          coreConfigPath = configPath;
          break;
        }
      }

      if (!coreConfig || !coreConfig.validationSchemas) {
        return null;
      }

      // Map schema keys to their config entries
      const schemaMapping = {
        'storyContractSchema': 'storyContractSchema',
        'story-contract-schema': 'storyContractSchema',
        'taskSchema': 'taskSchema',
        'task-schema': 'taskSchema',
        'structuredTaskSchema': 'structuredTaskSchema',
        'structured-task-schema': 'structuredTaskSchema',
        'checklistSchema': 'checklistSchema',
        'checklist-schema': 'checklistSchema'
      };

      const configKey = schemaMapping[schemaKey] || schemaKey;
      const schemaPath = coreConfig.validationSchemas[configKey];

      if (!schemaPath) {
        return null;
      }

      // Resolve the schema path relative to core-config location
      const configDir = path.dirname(coreConfigPath);
      const resolvedPath = path.join(configDir, schemaPath);

      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }

      // Try relative to bmad-core directory
      const bmadCoreDir = path.join(configDir, '..');
      const altPath = path.join(bmadCoreDir, schemaPath);
      
      if (fs.existsSync(altPath)) {
        return altPath;
      }

      return null;
    } catch (error) {
      console.error('Error resolving schema path:', error.message);
      return null;
    }
  }

  static findBmadCoreDir(startDir) {
    let currentDir = startDir;
    
    // Traverse up the directory tree looking for bmad-core
    while (currentDir !== path.dirname(currentDir)) {
      const bmadCorePath = path.join(currentDir, 'bmad-core');
      if (fs.existsSync(bmadCorePath) && fs.statSync(bmadCorePath).isDirectory()) {
        return bmadCorePath;
      }
      
      const hiddenBmadCorePath = path.join(currentDir, '.bmad-core');
      if (fs.existsSync(hiddenBmadCorePath) && fs.statSync(hiddenBmadCorePath).isDirectory()) {
        return hiddenBmadCorePath;
      }
      
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }
}

module.exports = ModuleResolver;