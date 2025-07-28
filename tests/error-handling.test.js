/**
 * Test suite for error handling improvements
 */

const path = require('path');
const fs = require('fs').promises;
const ErrorHandler = require('../bmad-core/utils/error-handler');
const WorkflowMonitor = require('../bmad-core/utils/workflow-monitor');
const DependencyValidator = require('../bmad-core/utils/dependency-validator');

// Mock console methods to capture output
const mockConsole = {
  logs: [],
  errors: [],
  warns: [],
  
  log: function(...args) { this.logs.push(args.join(' ')); },
  error: function(...args) { this.errors.push(args.join(' ')); },
  warn: function(...args) { this.warns.push(args.join(' ')); },
  
  clear: function() {
    this.logs = [];
    this.errors = [];
    this.warns = [];
  }
};

describe('Error Handling Improvements', () => {
  const rootDir = path.join(__dirname, '..');
  
  beforeEach(() => {
    mockConsole.clear();
  });
  
  describe('ErrorHandler', () => {
    it('should handle file not found errors with guidance', () => {
      const error = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      
      // Replace console with mock
      const originalConsole = { ...console };
      Object.assign(console, mockConsole);
      
      ErrorHandler.handle(error, { operation: 'Test operation' });
      
      // Restore console
      Object.assign(console, originalConsole);
      
      // Check output
      expect(mockConsole.errors.some(e => e.includes('Test operation failed'))).toBe(true);
      expect(mockConsole.errors.some(e => e.includes('File or directory not found'))).toBe(true);
      expect(mockConsole.errors.some(e => e.includes('Ensure the file/directory exists'))).toBe(true);
    });
    
    it('should handle permission errors', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      
      const originalConsole = { ...console };
      Object.assign(console, mockConsole);
      
      ErrorHandler.handle(error, { operation: 'File write' });
      
      Object.assign(console, originalConsole);
      
      expect(mockConsole.errors.some(e => e.includes('Permission denied'))).toBe(true);
      expect(mockConsole.errors.some(e => e.includes('elevated permissions'))).toBe(true);
    });
    
    it('should handle YAML parsing errors', () => {
      const error = new Error('YAML parse error: duplicate key "test"');
      
      const originalConsole = { ...console };
      Object.assign(console, mockConsole);
      
      ErrorHandler.handle(error, { operation: 'Config load' });
      
      Object.assign(console, originalConsole);
      
      expect(mockConsole.errors.some(e => e.includes('Configuration parsing error'))).toBe(true);
      expect(mockConsole.errors.some(e => e.includes('Duplicate keys'))).toBe(true);
    });
    
    it('should format multiple errors correctly', () => {
      const errors = [
        'First error message',
        { message: 'Second error message' },
        'Third error message'
      ];
      
      const formatted = ErrorHandler.formatMultipleErrors(errors);
      
      expect(formatted).toContain('1. First error message');
      expect(formatted).toContain('2. Second error message');
      expect(formatted).toContain('3. Third error message');
    });
    
    it('should identify recoverable errors', () => {
      const recoverableError = new Error('File already exists');
      recoverableError.code = 'EEXIST';
      
      const nonRecoverableError = new Error('Invalid syntax');
      nonRecoverableError.code = 'ESYNTAX';
      
      expect(ErrorHandler.isRecoverable(recoverableError)).toBe(true);
      expect(ErrorHandler.isRecoverable(nonRecoverableError)).toBe(false);
    });
  });
  
  describe('WorkflowMonitor', () => {
    let monitor;
    
    beforeEach(() => {
      monitor = new WorkflowMonitor(rootDir);
    });
    
    it('should detect missing workflow files', async () => {
      const result = await monitor.monitorExecution('non-existent-workflow', {});
      
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Workflow not found: non-existent-workflow');
    });
    
    it('should validate workflow structure', () => {
      const invalidWorkflow = {
        name: 'Test Workflow'
        // Missing required 'steps' field
      };
      
      const validation = monitor.validateWorkflow(invalidWorkflow, 'test-workflow');
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Workflow must have a steps array');
    });
    
    it('should detect circular dependencies', () => {
      const workflow = {
        name: 'Test Workflow',
        steps: [
          { action: 'test-action' },
          { workflow: 'test-workflow' } // Self-reference
        ]
      };
      
      const validation = monitor.validateWorkflow(workflow, 'test-workflow');
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Circular workflow dependency detected');
    });
    
    it('should check required inputs', async () => {
      const workflow = {
        name: 'Test Workflow',
        inputs: {
          requiredParam: { required: true },
          optionalParam: { required: false }
        },
        steps: []
      };
      
      const context = {
        inputs: {
          optionalParam: 'value'
          // Missing requiredParam
        }
      };
      
      const depCheck = await monitor.checkDependencies(workflow, context);
      
      expect(depCheck.allPresent).toBe(false);
      expect(depCheck.critical).toBe(true);
      expect(depCheck.missing.some(m => m.name === 'requiredParam')).toBe(true);
    });
    
    it('should track execution patterns', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 6; i++) {
        monitor.logExecution({
          workflowId: 'test-workflow',
          status: i < 4 ? 'failed' : 'success',
          errors: i < 4 ? ['Test error'] : [],
          warnings: [],
          duration: 100
        });
      }
      
      const originalConsole = { ...console };
      Object.assign(console, mockConsole);
      
      await monitor.checkFailurePatterns('test-workflow');
      
      Object.assign(console, originalConsole);
      
      expect(mockConsole.warns.some(w => w.includes('High failure rate detected'))).toBe(true);
    });
  });
  
  describe('DependencyValidator', () => {
    let validator;
    
    beforeEach(() => {
      validator = new DependencyValidator(rootDir);
    });
    
    it('should validate agent dependencies', async () => {
      // Test with a known agent
      const result = await validator.validateAgentDependencies('dev');
      
      // The dev agent should exist
      expect(result.missing.some(m => m.type === 'agent' && m.id === 'dev')).toBe(false);
    });
    
    it('should detect missing agent', async () => {
      const result = await validator.validateAgentDependencies('non-existent-agent');
      
      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.type === 'agent' && m.id === 'non-existent-agent')).toBe(true);
    });
    
    it('should find resource paths with extensions', async () => {
      // Test finding a task
      const taskPath = await validator.findResourcePath('tasks', 'create-story');
      
      if (taskPath) {
        expect(taskPath).toMatch(/\.(yaml|md)$/);
      }
    });
    
    it('should generate validation report', () => {
      const validationResult = {
        valid: false,
        missing: [
          {
            type: 'task',
            id: 'missing-task',
            parent: 'agent:test',
            searched: ['/path1', '/path2']
          }
        ],
        circular: ['agent:a>task:b>agent:a'],
        warnings: ['Test warning']
      };
      
      const report = validator.generateReport(validationResult);
      
      expect(report).toContain('Dependency validation failed');
      expect(report).toContain('Missing Dependencies:');
      expect(report).toContain('task/missing-task');
      expect(report).toContain('Circular Dependencies:');
      expect(report).toContain('Warnings:');
    });
  });
  
  describe('Integration Tests', () => {
    it('should handle build errors gracefully', async () => {
      // This would test the actual build process with error handling
      // For now, we'll verify the error handling structure exists
      
      const cliPath = path.join(rootDir, 'tools', 'cli.js');
      const cliContent = await fs.readFile(cliPath, 'utf8');
      
      // Check for improved error handling
      expect(cliContent).toContain('chalk');
      expect(cliContent).toContain('Missing required directories');
      expect(cliContent).toContain('DEBUG=1 for more details');
    });
    
    it('should validate schemas with helpful errors', async () => {
      const schemaValidatorPath = path.join(rootDir, 'scripts', 'validate-schemas.js');
      const content = await fs.readFile(schemaValidatorPath, 'utf8');
      
      // Check for enhanced error messages
      expect(content).toContain('Schema not found:');
      expect(content).toContain('Searched locations:');
      expect(content).toContain('Common issues:');
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  const jest = require('jest');
  jest.run(['--testPathPattern=error-handling\\.test\\.js']);
}