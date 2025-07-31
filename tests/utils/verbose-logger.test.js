/**
 * Unit tests for VerboseLogger class
 */

const VerboseLogger = require('../../bmad-core/utils/verbose-logger');

// Mock chalk to avoid color codes in tests
jest.mock('chalk', () => {
  const mockChalk = {
    blue: jest.fn(str => str),
    green: jest.fn(str => str),
    cyan: jest.fn(str => str),
    magenta: jest.fn(str => str),
    yellow: jest.fn(str => str),
    red: jest.fn(str => str),
    bold: jest.fn(str => str),
    dim: jest.fn(str => str),
  };
  
  // Add nested properties
  mockChalk.bold.blue = jest.fn(str => str);
  mockChalk.bold.green = jest.fn(str => str);
  
  return mockChalk;
});

describe('VerboseLogger', () => {
  let logger;
  let consoleSpy;
  let stdoutSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  describe('constructor and configuration', () => {
    it('should enable logging by default', () => {
      logger = new VerboseLogger();
      expect(logger.enabled).toBe(true);
    });

    it('should disable logging when verbosity is false', () => {
      logger = new VerboseLogger({ verbosity: false });
      expect(logger.enabled).toBe(false);
    });

    it('should set verbosity level from config', () => {
      logger = new VerboseLogger({ verbosityLevel: 'detailed' });
      expect(logger.level).toBe('detailed');
    });

    it('should use normal level by default', () => {
      logger = new VerboseLogger();
      expect(logger.level).toBe('normal');
    });

    it('should update configuration dynamically', () => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'normal' });
      logger.configure({ verbosity: false, verbosityLevel: 'detailed' });
      expect(logger.enabled).toBe(false);
      expect(logger.level).toBe('detailed');
    });
  });

  describe('shouldLog', () => {
    beforeEach(() => {
      logger = new VerboseLogger({ verbosity: true });
    });

    it('should log minimal messages at all levels', () => {
      logger.level = 'minimal';
      expect(logger.shouldLog('minimal')).toBe(true);
      
      logger.level = 'normal';
      expect(logger.shouldLog('minimal')).toBe(true);
      
      logger.level = 'detailed';
      expect(logger.shouldLog('minimal')).toBe(true);
    });

    it('should not log normal messages at minimal level', () => {
      logger.level = 'minimal';
      expect(logger.shouldLog('normal')).toBe(false);
    });

    it('should log normal messages at normal and detailed levels', () => {
      logger.level = 'normal';
      expect(logger.shouldLog('normal')).toBe(true);
      
      logger.level = 'detailed';
      expect(logger.shouldLog('normal')).toBe(true);
    });

    it('should only log detailed messages at detailed level', () => {
      logger.level = 'minimal';
      expect(logger.shouldLog('detailed')).toBe(false);
      
      logger.level = 'normal';
      expect(logger.shouldLog('detailed')).toBe(false);
      
      logger.level = 'detailed';
      expect(logger.shouldLog('detailed')).toBe(true);
    });
  });

  describe('logging methods when disabled', () => {
    beforeEach(() => {
      logger = new VerboseLogger({ verbosity: false });
    });

    it('should not log taskStart when disabled', () => {
      logger.taskStart('Test task');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log taskComplete when disabled', () => {
      logger.taskComplete('Test task');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log agentAction when disabled', () => {
      logger.agentAction('dev', 'testing', { foo: 'bar' });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log workflowTransition when disabled', () => {
      logger.workflowTransition('start', 'end');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log iteration when disabled', () => {
      logger.iteration(1, 'development');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log warn when disabled', () => {
      logger.warn('Warning message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log error when disabled', () => {
      logger.error('Error message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not create progress indicator when disabled', () => {
      const progress = logger.createProgressIndicator('Task', 100);
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('logging methods when enabled', () => {
    beforeEach(() => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'detailed' });
    });

    it('should log taskStart with timestamp and icon', () => {
      logger.taskStart('Loading data', 'Loading from disk');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      const firstCall = consoleSpy.mock.calls[0][0];
      expect(firstCall).toContain('Loading data...');
      expect(firstCall).toMatch(/\[\d+:\d+:\d+ [AP]M\]/);
    });

    it('should log taskComplete with result', () => {
      logger.taskComplete('Task', 'Success');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[1][0]).toContain('Success');
    });

    it('should log agentAction with context in detailed mode', () => {
      logger.agentAction('dev', 'coding', { language: 'javascript' });
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain('dev agent: coding');
      expect(consoleSpy.mock.calls[1][0]).toContain('Context:');
      expect(consoleSpy.mock.calls[1][0]).toContain('javascript');
    });

    it('should log workflowTransition with reason', () => {
      logger.workflowTransition('planning', 'development', 'Requirements complete');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain('planning → development');
      expect(consoleSpy.mock.calls[1][0]).toContain('Requirements complete');
    });

    it('should log iteration with details', () => {
      logger.iteration(3, 'QA Review', 'Found 2 issues');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain('Iteration 3: QA Review');
      expect(consoleSpy.mock.calls[1][0]).toContain('Found 2 issues');
    });

    it('should log warnings', () => {
      logger.warn('Configuration missing');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('Warning: Configuration missing');
    });

    it('should log errors with stack trace in detailed mode', () => {
      const error = new Error('Test error');
      logger.error('Something went wrong', error);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain('Error: Something went wrong');
      expect(consoleSpy.mock.calls[1][0]).toContain(error.stack);
    });

    it('should log summary with items', () => {
      logger.summary('Build Summary', ['Files: 10', 'Errors: 0', 'Time: 2.5s']);
      expect(consoleSpy).toHaveBeenCalledTimes(5); // Title + 3 items + empty line
      expect(consoleSpy.mock.calls[0][0]).toContain('Build Summary');
      expect(consoleSpy.mock.calls[1][0]).toContain('Files: 10');
    });

    it('should log phase start and complete', () => {
      logger.phaseStart('Planning Phase', 'Analyzing requirements');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting Planning Phase'));
      
      consoleSpy.mockClear();
      logger.phaseComplete('Planning Phase', '3 stories created');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed Planning Phase'));
    });
  });

  describe('icon selection', () => {
    beforeEach(() => {
      logger = new VerboseLogger({ verbosity: true });
    });

    it('should select appropriate task icons', () => {
      expect(logger.getTaskIcon('loading files')).toBe('📂');
      expect(logger.getTaskIcon('validating input')).toBe('🔍');
      expect(logger.getTaskIcon('executing command')).toBe('⚡');
      expect(logger.getTaskIcon('saving results')).toBe('💾');
      expect(logger.getTaskIcon('analyzing data')).toBe('🔬');
      expect(logger.getTaskIcon('configuring system')).toBe('⚙️');
      expect(logger.getTaskIcon('random task')).toBe('📋');
    });

    it('should select appropriate agent icons', () => {
      expect(logger.getAgentIcon('dev')).toBe('👨‍💻');
      expect(logger.getAgentIcon('qa')).toBe('🧪');
      expect(logger.getAgentIcon('analyst')).toBe('📊');
      expect(logger.getAgentIcon('pm')).toBe('📝');
      expect(logger.getAgentIcon('architect')).toBe('🏗️');
      expect(logger.getAgentIcon('sm')).toBe('🏃');
      expect(logger.getAgentIcon('po')).toBe('👔');
      expect(logger.getAgentIcon('ux')).toBe('🎨');
      expect(logger.getAgentIcon('unknown')).toBe('🤖');
    });
  });

  describe('progress indicator', () => {
    beforeEach(() => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'normal' });
    });

    it('should create progress indicator and update', () => {
      const progress = logger.createProgressIndicator('Processing', 100);
      
      progress.update(25, 'Processing item 25');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('25%'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Processing item 25'));
      
      stdoutSpy.mockClear();
      progress.update(100);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('100%'));
      expect(consoleSpy).toHaveBeenCalledWith('');
    });

    it('should complete progress indicator', () => {
      const progress = logger.createProgressIndicator('Task', 10);
      progress.complete();
      expect(consoleSpy).toHaveBeenCalledWith('');
    });

    it('should not update progress when logging is disabled', () => {
      logger.enabled = false;
      const progress = logger.createProgressIndicator('Task', 100);
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('level-based filtering', () => {
    it('should filter messages based on minimal level', () => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'minimal' });
      
      logger.taskStart('Task', 'Details', 'normal');
      expect(consoleSpy).not.toHaveBeenCalled();
      
      logger.warn('Warning', 'minimal');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should filter messages based on normal level', () => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'normal' });
      
      logger.taskStart('Task', 'Details', 'detailed');
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockClear();
      logger.taskStart('Task', 'Details', 'normal');
      expect(consoleSpy).toHaveBeenCalledTimes(1); // No details in normal mode
    });

    it('should show all messages at detailed level', () => {
      logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'detailed' });
      
      logger.taskStart('Task', 'Details', 'detailed');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});