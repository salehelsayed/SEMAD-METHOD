/**
 * File Path Resolver
 * Centralizes file path resolution based on core-config.yaml to eliminate searching
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class FilePathResolver {
  constructor(rootDir) {
    this.rootDir = rootDir || process.cwd();
    this.configPath = path.join(this.rootDir, 'bmad-core', 'core-config.yaml');
    this.config = null;
    this.quietDevLoadWarnings = false;
    this.loadConfig();
  }

  /**
   * Load configuration from core-config.yaml
   */
  loadConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(configContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Core configuration file not found: ${this.configPath}`);
      }
      throw new Error(`Failed to load core configuration: ${error.message}`);
    }
  }

  /**
   * Reload configuration (useful when config changes)
   */
  reloadConfig() {
    this.config = null;
    this.loadConfig();
  }

  /**
   * Get absolute file path, ensuring it exists
   * @param {string} relativePath - Relative path from project root
   * @param {boolean} mustExist - Whether file must exist (default: true)
   * @returns {string} Absolute file path
   * @throws {Error} If file doesn't exist and mustExist is true
   */
  getAbsolutePath(relativePath, mustExist = true) {
    const absolutePath = path.resolve(this.rootDir, relativePath);
    
    if (mustExist) {
      try {
        fs.accessSync(absolutePath, fs.constants.F_OK);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`Required file not found at expected location: ${absolutePath}`);
        }
        throw error;
      }
    }
    
    return absolutePath;
  }

  /**
   * Private helper method to get configured path with validation
   * @param {string} configPath - Dot notation path to config value (e.g., 'prd.prdFile')
   * @param {string} errorMessage - Error message to throw if config is missing
   * @param {boolean} mustExist - Whether file must exist
   * @returns {string} Absolute path
   * @private
   */
  _getConfiguredPath(configPath, errorMessage, mustExist = false) {
    const pathParts = configPath.split('.');
    let configValue = this.config;
    
    for (const part of pathParts) {
      configValue = configValue?.[part];
    }
    
    if (!configValue) {
      throw new Error(errorMessage);
    }
    
    return this.getAbsolutePath(configValue, mustExist);
  }

  /**
   * Get development story location directory
   * @returns {string} Absolute path to stories directory
   */
  getStoryLocation(mustExist = true) {
    return this._getConfiguredPath(
      'devStoryLocation',
      'devStoryLocation not configured in core-config.yaml',
      mustExist
    );
  }

  /**
   * Get PRD file path (monolithic or main index)
   * @param {boolean} mustExist - Whether file must exist (default: false for optional files)
   * @returns {string} Absolute path to PRD file
   */
  getPRDFile(mustExist = false) {
    return this._getConfiguredPath(
      'prd.prdFile',
      'prd.prdFile not configured in core-config.yaml',
      mustExist
    );
  }

  /**
   * Get PRD sharded location directory
   * @param {boolean} mustExist - Whether directory must exist (default: false for optional dirs)
   * @returns {string} Absolute path to PRD sharded directory
   */
  getPRDShardedLocation(mustExist = false) {
    return this._getConfiguredPath(
      'prd.prdShardedLocation',
      'prd.prdShardedLocation not configured in core-config.yaml',
      mustExist
    );
  }

  /**
   * Get architecture file path (monolithic or main index)
   * @param {boolean} mustExist - Whether file must exist (default: false for optional files)
   * @returns {string} Absolute path to architecture file
   */
  getArchitectureFile(mustExist = false) {
    return this._getConfiguredPath(
      'architecture.architectureFile',
      'architecture.architectureFile not configured in core-config.yaml',
      mustExist
    );
  }

  /**
   * Get architecture sharded location directory
   * @param {boolean} mustExist - Whether directory must exist (default: false for optional dirs)
   * @returns {string} Absolute path to architecture sharded directory
   */
  getArchitectureShardedLocation(mustExist = false) {
    return this._getConfiguredPath(
      'architecture.architectureShardedLocation',
      'architecture.architectureShardedLocation not configured in core-config.yaml',
      mustExist
    );
  }

  /**
   * Get dev debug log file path
   * @returns {string} Absolute path to debug log file
   */
  getDevDebugLog() {
    return this._getConfiguredPath(
      'devDebugLog',
      'devDebugLog not configured in core-config.yaml',
      false
    );
  }

  /**
   * Get dev load always files (files that should always be loaded for dev tasks)
   * @returns {string[]} Array of absolute paths to always-load files
   */
  getDevLoadAlwaysFiles() {
    if (!this.config?.devLoadAlwaysFiles || !Array.isArray(this.config.devLoadAlwaysFiles)) {
      return [];
    }
    
    return this.config.devLoadAlwaysFiles.map(filePath => {
      try {
        return this.getAbsolutePath(filePath);
      } catch (error) {
        // Log warning but don't fail - some files might be optional
        if (!this.quietDevLoadWarnings) {
          console.warn(`Warning: devLoadAlwaysFiles entry not found: ${filePath}`);
        }
        return null;
      }
    }).filter(Boolean); // Remove null entries
  }

  /**
   * Check if PRD is sharded
   * @returns {boolean} True if PRD uses sharded structure
   */
  isPRDSharded() {
    return this.config?.prd?.prdSharded === true;
  }

  /**
   * Check if architecture is sharded
   * @returns {boolean} True if architecture uses sharded structure
   */
  isArchitectureSharded() {
    return this.config?.architecture?.architectureSharded === true;
  }

  /**
   * Get epic file pattern for sharded PRD
   * @returns {string} Epic file pattern (e.g., "epic-{n}*.md")
   */
  getEpicFilePattern() {
    return this.config?.prd?.epicFilePattern || 'epic-{n}*.md';
  }

  /**
   * Get architecture version
   * @returns {string} Architecture version (e.g., "v4")
   */
  getArchitectureVersion() {
    return this.config?.architecture?.architectureVersion || 'v1';
  }

  /**
   * Get PRD version
   * @returns {string} PRD version (e.g., "v4")
   */
  getPRDVersion() {
    return this.config?.prd?.prdVersion || 'v1';
  }

  /**
   * Find specific story file by epic and story number
   * @param {number} epicNum - Epic number
   * @param {number} storyNum - Story number
   * @returns {string|null} Absolute path to story file or null if not found
   */
  findStoryFile(epicNum, storyNum) {
    const storyLocation = this.getStoryLocation();
    const storyFileName = `${epicNum}.${storyNum}.story.md`;
    const storyPath = path.join(storyLocation, storyFileName);
    
    try {
      fs.accessSync(storyPath, fs.constants.F_OK);
      return storyPath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find epic file by number in sharded PRD
   * @param {number} epicNum - Epic number
   * @returns {string|null} Absolute path to epic file or null if not found
   */
  findEpicFile(epicNum) {
    if (!this.isPRDSharded()) {
      return null; // Epic files only exist in sharded PRD
    }
    
    const prdLocation = this.getPRDShardedLocation();
    const pattern = this.getEpicFilePattern();
    
    // Convert pattern to actual filename
    // e.g., "epic-{n}*.md" becomes "epic-1*.md" for epicNum = 1
    const filePattern = pattern.replace('{n}', epicNum.toString());
    
    try {
      const files = fs.readdirSync(prdLocation);
      // Simple pattern matching - look for files that start with the pattern prefix
      const prefix = filePattern.replace('*', '');
      const matchingFiles = files.filter(file => file.startsWith(prefix));
      
      if (matchingFiles.length > 0) {
        return path.join(prdLocation, matchingFiles[0]);
      }
    } catch (error) {
      // Directory doesn't exist or can't be read - return null instead of throwing
    }
    
    return null;
  }

  /**
   * Get all resolved file paths for agent context
   * @returns {Object} Object containing all resolved paths
   */
  getAllResolvedPaths() {
    try {
      return {
        // Do not require story directory to exist; reverse-align cleanup removes it before recreation
        storyLocation: this.getStoryLocation(false),
        prdFile: this.getPRDFile(false), // Don't require existence
        prdShardedLocation: this.isPRDSharded() ? this.getPRDShardedLocation(false) : null,
        architectureFile: this.getArchitectureFile(false), // Don't require existence
        architectureShardedLocation: this.isArchitectureSharded() ? this.getArchitectureShardedLocation(false) : null,
        devDebugLog: this.getDevDebugLog(),
        devLoadAlwaysFiles: this.getDevLoadAlwaysFiles(),
        isPRDSharded: this.isPRDSharded(),
        isArchitectureSharded: this.isArchitectureSharded(),
        epicFilePattern: this.getEpicFilePattern(),
        architectureVersion: this.getArchitectureVersion(),
        prdVersion: this.getPRDVersion()
      };
    } catch (error) {
      throw new Error(`Failed to resolve file paths: ${error.message}`);
    }
  }

  /**
   * Find and validate specific file paths
   * @param {string} fileType - Type of file to find ('story', 'epic', 'prd', 'architecture')
   * @param {Object} params - Parameters for finding the file
   * @returns {string|null} Absolute path to file or null if not found
   * @throws {Error} If file is required but not found
   */
  findSpecificFile(fileType, params = {}) {
    switch (fileType.toLowerCase()) {
      case 'story':
        if (!params.epicNum || !params.storyNum) {
          throw new Error('epicNum and storyNum required for story file lookup');
        }
        return this.findStoryFile(params.epicNum, params.storyNum);
        
      case 'epic':
        if (!params.epicNum) {
          throw new Error('epicNum required for epic file lookup');
        }
        return this.findEpicFile(params.epicNum);
        
      case 'prd':
        return this.isPRDSharded() ? this.getPRDShardedLocation(false) : this.getPRDFile(false);
        
      case 'architecture':
        return this.isArchitectureSharded() ? this.getArchitectureShardedLocation(false) : this.getArchitectureFile(false);
        
      default:
        throw new Error(`Unknown file type: ${fileType}. Supported types: story, epic, prd, architecture`);
    }
  }

  /**
   * Async version of getAbsolutePath for non-initialization code paths
   * @param {string} relativePath - Relative path from project root
   * @param {boolean} mustExist - Whether file must exist (default: true)
   * @returns {Promise<string>} Absolute file path
   * @throws {Error} If file doesn't exist and mustExist is true
   */
  async getAbsolutePathAsync(relativePath, mustExist = true) {
    const absolutePath = path.resolve(this.rootDir, relativePath);
    
    if (mustExist) {
      try {
        await fsPromises.access(absolutePath, fs.constants.F_OK);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`Required file not found at expected location: ${absolutePath}`);
        }
        throw error;
      }
    }
    
    return absolutePath;
  }

  /**
   * Async version of findStoryFile for better performance
   * @param {number} epicNum - Epic number
   * @param {number} storyNum - Story number
   * @returns {Promise<string|null>} Absolute path to story file or null if not found
   */
  async findStoryFileAsync(epicNum, storyNum) {
    const storyLocation = this.getStoryLocation();
    const storyFileName = `${epicNum}.${storyNum}.story.md`;
    const storyPath = path.join(storyLocation, storyFileName);
    
    try {
      await fsPromises.access(storyPath, fs.constants.F_OK);
      return storyPath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Async version of findEpicFile for better performance
   * @param {number} epicNum - Epic number
   * @returns {Promise<string|null>} Absolute path to epic file or null if not found
   */
  async findEpicFileAsync(epicNum) {
    if (!this.isPRDSharded()) {
      return null; // Epic files only exist in sharded PRD
    }
    
    const prdLocation = this.getPRDShardedLocation();
    const pattern = this.getEpicFilePattern();
    
    // Convert pattern to actual filename
    const filePattern = pattern.replace('{n}', epicNum.toString());
    
    try {
      const files = await fsPromises.readdir(prdLocation);
      // Simple pattern matching - look for files that start with the pattern prefix
      const prefix = filePattern.replace('*', '');
      const matchingFiles = files.filter(file => file.startsWith(prefix));
      
      if (matchingFiles.length > 0) {
        return path.join(prdLocation, matchingFiles[0]);
      }
    } catch (error) {
      // Directory doesn't exist or can't be read - return null instead of throwing
    }
    
    return null;
  }

  /**
   * Get all file locations that agents should NOT search for
   * @returns {Object} Object containing file patterns and their resolved locations
   */
  getNoSearchPaths() {
    return {
      // Core document locations - agents should use these directly
      coreDocuments: {
        'docs/prd.md': this.config?.prd?.prdFile,
        'docs/architecture.md': this.config?.architecture?.architectureFile,
        'docs/stories': this.config?.devStoryLocation,
        'bmad-core/core-config.yaml': 'bmad-core/core-config.yaml'
      },
      
      // Patterns that should be resolved through configuration
      searchPatterns: [
        'find epic files',
        'locate story files',
        'search for prd',
        'find architecture',
        'look for core-config',
        'scan for documents'
      ],
      
      // Direct paths agents should receive instead of searching
      directPaths: this.getAllResolvedPaths()
    };
  }

  /**
   * Validate that all required files and directories exist
   * @returns {Object} Validation result with success status and any errors
   */
  validatePaths() {
    const errors = [];
    const warnings = [];

    try {
      // Validate required directories
      try {
        const loc = this.getStoryLocation(false);
        // Warn if configured but missing; reverse-align may recreate later
        const fs = require('fs');
        if (!fs.existsSync(loc)) {
          warnings.push(`Story location does not exist yet: ${loc}`);
        }
      } catch (error) {
        errors.push(`Story location: ${error.message}`);
      }

      // Validate PRD structure (files may not exist yet)
      try {
        if (this.isPRDSharded()) {
          this.getPRDShardedLocation(false); // Don't require existence
        } else {
          this.getPRDFile(false); // Don't require existence
        }
      } catch (error) {
        warnings.push(`PRD structure configured but not validated: ${error.message}`);
      }

      // Validate architecture structure (files may not exist yet)
      try {
        if (this.isArchitectureSharded()) {
          this.getArchitectureShardedLocation(false); // Don't require existence
        } else {
          this.getArchitectureFile(false); // Don't require existence
        }
      } catch (error) {
        warnings.push(`Architecture structure configured but not validated: ${error.message}`);
      }

      // Validate devLoadAlwaysFiles (warnings only)
      const alwaysFiles = this.getDevLoadAlwaysFiles();
      if (this.config?.devLoadAlwaysFiles) {
        const configured = this.config.devLoadAlwaysFiles.length;
        const found = alwaysFiles.length;
        if (found < configured) {
          warnings.push(`Some devLoadAlwaysFiles not found (${found}/${configured} found)`);
        }
      }

    } catch (error) {
      errors.push(`Configuration error: ${error.message}`);
    }

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Legacy alias for getAllResolvedPaths - for backward compatibility
   * @returns {Object} All resolved file paths
   */
  resolveAllPaths() {
    return this.getAllResolvedPaths();
  }
}

module.exports = FilePathResolver;
