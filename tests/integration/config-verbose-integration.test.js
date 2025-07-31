/**
 * Integration tests for VerboseLogger with configuration loading
 */

const VerboseLogger = require('../../bmad-core/utils/verbose-logger');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

describe('VerboseLogger Configuration Integration', () => {
  const testConfigDir = path.join(__dirname, 'test-configs');
  const configPath = path.join(testConfigDir, '.bmad-workflow.yaml');
  
  beforeEach(async () => {
    await fs.ensureDir(testConfigDir);
  });

  afterEach(async () => {
    await fs.remove(testConfigDir);
  });

  describe('Configuration file loading', () => {
    it('should load configuration from YAML file', async () => {
      const config = {
        verbosity: true,
        verbosityLevel: 'detailed'
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      // Simulate config loading
      const loadedConfig = yaml.load(await fs.readFile(configPath, 'utf8'));
      const logger = new VerboseLogger(loadedConfig);
      
      expect(logger.enabled).toBe(true);
      expect(logger.level).toBe('detailed');
    });

    it('should handle missing configuration file with defaults', () => {
      const logger = new VerboseLogger({});
      
      expect(logger.enabled).toBe(true);
      expect(logger.level).toBe('normal');
    });

    it('should override file config with command line args', async () => {
      const fileConfig = {
        verbosity: true,
        verbosityLevel: 'minimal'
      };
      
      await fs.writeFile(configPath, yaml.dump(fileConfig));
      
      // Simulate command line override
      const cliConfig = {
        verbosity: false
      };
      
      const loadedConfig = yaml.load(await fs.readFile(configPath, 'utf8'));
      const finalConfig = { ...loadedConfig, ...cliConfig };
      const logger = new VerboseLogger(finalConfig);
      
      expect(logger.enabled).toBe(false);
      expect(logger.level).toBe('minimal');
    });
  });

  describe('Configuration validation', () => {
    it('should handle invalid verbosity level gracefully', () => {
      const logger = new VerboseLogger({ verbosityLevel: 'invalid' });
      
      // Should default to normal behavior
      expect(logger.level).toBe('invalid');
      expect(logger.shouldLog('normal')).toBe(true); // Falls back to normal
    });

    it('should handle non-boolean verbosity values', () => {
      const logger1 = new VerboseLogger({ verbosity: 'true' });
      expect(logger1.enabled).toBe(true);
      
      const logger2 = new VerboseLogger({ verbosity: 0 });
      expect(logger2.enabled).toBe(true);
      
      const logger3 = new VerboseLogger({ verbosity: false });
      expect(logger3.enabled).toBe(false);
    });
  });

  describe('Dynamic configuration updates', () => {
    it('should update configuration at runtime', () => {
      const logger = new VerboseLogger({ 
        verbosity: true, 
        verbosityLevel: 'minimal' 
      });
      
      expect(logger.enabled).toBe(true);
      expect(logger.level).toBe('minimal');
      
      // Update configuration
      logger.configure({
        verbosity: false,
        verbosityLevel: 'detailed'
      });
      
      expect(logger.enabled).toBe(false);
      expect(logger.level).toBe('detailed');
    });

    it('should partially update configuration', () => {
      const logger = new VerboseLogger({ 
        verbosity: true, 
        verbosityLevel: 'normal',
        prefix: '🎵'
      });
      
      // Only update verbosity level
      logger.configure({ verbosityLevel: 'detailed' });
      
      expect(logger.enabled).toBe(true);
      expect(logger.level).toBe('detailed');
      expect(logger.prefix).toBe('🎵');
    });
  });

  describe('Environment-based configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should respect environment variables', () => {
      process.env.BMAD_VERBOSE = 'false';
      process.env.BMAD_VERBOSE_LEVEL = 'minimal';
      
      // Simulate env-based config loading
      const config = {
        verbosity: process.env.BMAD_VERBOSE !== 'false',
        verbosityLevel: process.env.BMAD_VERBOSE_LEVEL || 'normal'
      };
      
      const logger = new VerboseLogger(config);
      
      expect(logger.enabled).toBe(false);
      expect(logger.level).toBe('minimal');
    });
  });
});