/**
 * Test file path resolver functionality
 */

const fs = require('fs');
const path = require('path');
const FilePathResolver = require('../bmad-core/utils/file-path-resolver');

// Mock project root for testing
const testRootDir = '/Users/I560101/Project-Sat/SEMAD-METHOD';

describe('FilePathResolver', () => {
  let resolver;

  beforeAll(() => {
    resolver = new FilePathResolver(testRootDir);
  });

  test('should load configuration successfully', () => {
    expect(resolver.config).toBeDefined();
    expect(resolver.config.devStoryLocation).toBeDefined();
    expect(resolver.config.prd).toBeDefined();
    expect(resolver.config.architecture).toBeDefined();
  });

  test('should resolve story location', () => {
    const storyLocation = resolver.getStoryLocation();
    expect(storyLocation).toContain('docs/stories');
    expect(path.isAbsolute(storyLocation)).toBe(true);
  });

  test('should resolve PRD paths', () => {
    const prdFile = resolver.getPRDFile();
    expect(prdFile).toContain('docs/prd.md');
    expect(path.isAbsolute(prdFile)).toBe(true);

    if (resolver.isPRDSharded()) {
      const prdShardedLocation = resolver.getPRDShardedLocation();
      expect(prdShardedLocation).toContain('docs/prd');
      expect(path.isAbsolute(prdShardedLocation)).toBe(true);
    }
  });

  test('should resolve architecture paths', () => {
    const architectureFile = resolver.getArchitectureFile();
    expect(architectureFile).toContain('docs/architecture.md');
    expect(path.isAbsolute(architectureFile)).toBe(true);

    if (resolver.isArchitectureSharded()) {
      const architectureShardedLocation = resolver.getArchitectureShardedLocation();
      expect(architectureShardedLocation).toContain('docs/architecture');
      expect(path.isAbsolute(architectureShardedLocation)).toBe(true);
    }
  });

  test('should provide all resolved paths', () => {
    const allPaths = resolver.getAllResolvedPaths();
    
    expect(allPaths).toHaveProperty('storyLocation');
    expect(allPaths).toHaveProperty('prdFile');
    expect(allPaths).toHaveProperty('architectureFile');
    expect(allPaths).toHaveProperty('isPRDSharded');
    expect(allPaths).toHaveProperty('isArchitectureSharded');
    
    // All paths should be absolute
    expect(path.isAbsolute(allPaths.storyLocation)).toBe(true);
    expect(path.isAbsolute(allPaths.prdFile)).toBe(true);
    expect(path.isAbsolute(allPaths.architectureFile)).toBe(true);
  });

  test('should validate paths', () => {
    const validation = resolver.validatePaths();
    
    expect(validation).toHaveProperty('success');
    expect(validation).toHaveProperty('errors');
    expect(validation).toHaveProperty('warnings');
    
    if (!validation.success) {
      console.log('Validation errors:', validation.errors);
      console.log('Validation warnings:', validation.warnings);
    }
  });

  test('should handle missing files with clear error messages', () => {
    expect(() => {
      resolver.getAbsolutePath('non-existent-file.md', true);
    }).toThrow(/Required file not found at expected location/);
  });

  test('should provide no-search paths information', () => {
    const noSearchPaths = resolver.getNoSearchPaths();
    
    expect(noSearchPaths).toHaveProperty('coreDocuments');
    expect(noSearchPaths).toHaveProperty('searchPatterns');
    expect(noSearchPaths).toHaveProperty('directPaths');
    
    expect(Array.isArray(noSearchPaths.searchPatterns)).toBe(true);
    expect(noSearchPaths.searchPatterns.length).toBeGreaterThan(0);
  });

  test('should find specific files by type', () => {
    // Test PRD file lookup
    const prdPath = resolver.findSpecificFile('prd');
    expect(prdPath).toBeDefined();
    expect(path.isAbsolute(prdPath)).toBe(true);

    // Test architecture file lookup
    const archPath = resolver.findSpecificFile('architecture');
    expect(archPath).toBeDefined();
    expect(path.isAbsolute(archPath)).toBe(true);

    // Test error handling for invalid file type
    expect(() => {
      resolver.findSpecificFile('invalid-type');
    }).toThrow(/Unknown file type/);
  });
});

// Integration test with orchestrator
describe('FilePathResolver Integration', () => {
  test('should integrate with workflow orchestrator', () => {
    const WorkflowOrchestrator = require('../tools/workflow-orchestrator');
    const orchestrator = new WorkflowOrchestrator(testRootDir);
    
    expect(orchestrator.filePathResolver).toBeDefined();
    expect(orchestrator.filePathResolver).toBeInstanceOf(FilePathResolver);
  });

  test('should integrate with workflow executor', () => {
    const WorkflowExecutor = require('../bmad-core/utils/workflow-executor');
    const executor = new WorkflowExecutor(testRootDir);
    
    expect(executor.filePathResolver).toBeDefined();
    expect(executor.filePathResolver).toBeInstanceOf(FilePathResolver);
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running FilePathResolver tests...');
  
  const resolver = new FilePathResolver(testRootDir);
  
  console.log('1. Testing configuration loading...');
  console.log('Config loaded:', !!resolver.config);
  
  console.log('2. Testing path resolution...');
  const paths = resolver.getAllResolvedPaths();
  console.log('Resolved paths:', Object.keys(paths));
  
  console.log('3. Testing path validation...');
  const validation = resolver.validatePaths();
  console.log('Validation result:', validation.success ? 'PASS' : 'FAIL');
  if (!validation.success) {
    console.log('Errors:', validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.log('Warnings:', validation.warnings);
  }
  
  console.log('4. Testing no-search patterns...');
  const noSearch = resolver.getNoSearchPaths();
  console.log('Search patterns to avoid:', noSearch.searchPatterns);
  
  console.log('\nFilePathResolver tests completed.');
}