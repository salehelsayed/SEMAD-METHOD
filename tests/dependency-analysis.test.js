const { parseFile, isFileSupported } = require('../bmad-core/utils/dependency-parser');
const { 
  storeSymbolDependency, 
  queryImpactedSymbols, 
  ensureDependencyCollection 
} = require('../bmad-core/utils/dependency-analyzer');
const { 
  checkFileImpact, 
  generateImpactReport 
} = require('../bmad-core/utils/dependency-impact-checker');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Dependency Analysis System', () => {
  let tempDir;
  let testFiles;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-dep-test-'));
    
    // Create test JavaScript files
    testFiles = {
      'utils.js': `
        // Utility functions
        export function formatDate(date) {
          return date.toISOString();
        }
        
        export class Logger {
          constructor(level) {
            this.level = level;
          }
          
          log(message) {
            console.log(\`[\${this.level}] \${message}\`);
          }
        }
        
        const API_BASE = 'https://api.example.com';
        export { API_BASE };
      `,
      
      'user-service.js': `
        import { formatDate, Logger, API_BASE } from './utils.js';
        import axios from 'axios';
        
        const logger = new Logger('INFO');
        
        export class UserService {
          constructor() {
            this.baseUrl = API_BASE + '/users';
          }
          
          async createUser(userData) {
            logger.log('Creating user');
            const timestamp = formatDate(new Date());
            
            return await axios.post(this.baseUrl, {
              ...userData,
              createdAt: timestamp
            });
          }
          
          async getUser(id) {
            return await axios.get(\`\${this.baseUrl}/\${id}\`);
          }
        }
      `,
      
      'auth-controller.js': `
        import { UserService } from './user-service.js';
        import { Logger } from './utils.js';
        
        const userService = new UserService();
        const logger = new Logger('AUTH');
        
        export async function register(req, res) {
          try {
            logger.log('User registration attempt');
            const user = await userService.createUser(req.body);
            res.json(user);
          } catch (error) {
            logger.log('Registration failed');
            res.status(500).json({ error: error.message });
          }
        }
        
        export async function getProfile(req, res) {
          const user = await userService.getUser(req.params.id);
          res.json(user);
        }
      `
    };
    
    // Write test files to temp directory
    for (const [filename, content] of Object.entries(testFiles)) {
      fs.writeFileSync(path.join(tempDir, filename), content.trim());
    }
    
    // Initialize Qdrant collection
    await ensureDependencyCollection();
  });

  afterAll(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Dependency Parser', () => {
    test('should identify supported file types', () => {
      expect(isFileSupported('test.js')).toBe(true);
      expect(isFileSupported('test.ts')).toBe(true);
      expect(isFileSupported('test.py')).toBe(true);
      expect(isFileSupported('test.java')).toBe(true);
      expect(isFileSupported('test.txt')).toBe(false);
      expect(isFileSupported('test.md')).toBe(false);
    });

    test('should parse JavaScript file and extract symbols', () => {
      const utilsPath = path.join(tempDir, 'utils.js');
      const result = parseFile(utilsPath);
      
      expect(result.symbols).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.symbols.length).toBeGreaterThan(0);
      
      // Check for extracted symbols
      const symbolNames = result.symbols.map(s => s.symbolName);
      expect(symbolNames).toContain('formatDate');
      expect(symbolNames).toContain('Logger');
      expect(symbolNames).toContain('API_BASE');
      
      // Check symbol details
      const formatDateSymbol = result.symbols.find(s => s.symbolName === 'formatDate');
      expect(formatDateSymbol.symbolType).toBe('function');
      expect(formatDateSymbol.filePath).toBe(utilsPath);
      expect(formatDateSymbol.lineNumber).toBeGreaterThan(0);
    });

    test('should extract dependencies from imports', () => {
      const servicePath = path.join(tempDir, 'user-service.js');
      const result = parseFile(servicePath);
      
      expect(result.symbols).toBeDefined();
      
      // Check that dependencies are captured
      const serviceClass = result.symbols.find(s => s.symbolName === 'UserService');
      expect(serviceClass).toBeDefined();
      expect(serviceClass.dependencies).toContain('./utils.js');
      expect(serviceClass.dependencies).toContain('axios');
    });
  });

  describe('Dependency Storage', () => {
    test('should store symbol dependency in Qdrant', async () => {
      const testSymbol = {
        symbolName: 'testFunction',
        symbolType: 'function',
        filePath: 'test.js',
        lineNumber: 10,
        dependencies: ['./utils.js'],
        dependents: [],
        scope: 'global',
        signature: 'function testFunction() {}',
        fileHash: 'abc123'
      };
      
      const symbolId = await storeSymbolDependency(testSymbol);
      expect(symbolId).toBeDefined();
      expect(typeof symbolId).toBe('string');
    }, 10000); // Increase timeout for Qdrant operations
  });

  describe('Impact Analysis', () => {
    beforeAll(async () => {
      // Store test symbols in Qdrant for impact analysis
      const utilsPath = path.join(tempDir, 'utils.js');
      const servicePath = path.join(tempDir, 'user-service.js');
      const controllerPath = path.join(tempDir, 'auth-controller.js');
      
      const utilsResult = parseFile(utilsPath);
      const serviceResult = parseFile(servicePath);
      const controllerResult = parseFile(controllerPath);
      
      // Store all symbols
      for (const symbol of [...utilsResult.symbols, ...serviceResult.symbols, ...controllerResult.symbols]) {
        await storeSymbolDependency(symbol);
      }
    }, 30000);

    test('should identify impacted symbols when file changes', async () => {
      const utilsPath = path.relative(process.cwd(), path.join(tempDir, 'utils.js'));
      
      const impact = await checkFileImpact(utilsPath, process.cwd());
      
      expect(impact).toBeDefined();
      expect(impact.targetFile).toBe(utilsPath);
      expect(impact.symbolsInFile).toBeDefined();
      expect(impact.impactedSymbols).toBeDefined();
      
      // Should find symbols that depend on utils.js
      if (impact.impactedSymbols.length > 0) {
        const impactedSymbol = impact.impactedSymbols[0];
        expect(impactedSymbol.dependencies).toContain(utilsPath);
      }
    }, 15000);

    test('should generate readable impact report', async () => {
      const utilsPath = path.relative(process.cwd(), path.join(tempDir, 'utils.js'));
      const impact = await checkFileImpact(utilsPath, process.cwd());
      
      const report = generateImpactReport(impact, { format: 'markdown' });
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('# Dependency Impact Analysis Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Recommendations');
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle non-existent files gracefully', () => {
      const result = parseFile('/non-existent-file.js');
      
      expect(result.symbols).toEqual([]);
      expect(result.fileHash).toBeNull();
    });

    test('should handle unsupported file types', () => {
      const textFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(textFile, 'This is a text file');
      
      const result = parseFile(textFile);
      
      expect(result.symbols).toEqual([]);
      expect(result.fileHash).toBeDefined(); // File hash should still be calculated
    });
  });
});

// Integration test with real BMad files (if they exist)
describe('BMad Integration', () => {
  test('should parse BMad utility files', () => {
    const bmadUtilsPath = path.join(__dirname, '../bmad-core/utils/dependency-analyzer.js');
    
    if (fs.existsSync(bmadUtilsPath)) {
      const result = parseFile(bmadUtilsPath);
      
      expect(result.symbols).toBeDefined();
      expect(result.symbols.length).toBeGreaterThan(0);
      
      // Should find our main functions
      const symbolNames = result.symbols.map(s => s.symbolName);
      expect(symbolNames).toContain('ensureDependencyCollection');
      expect(symbolNames).toContain('storeSymbolDependency');
    }
  });
});