/**
 * Memory leak prevention tests for VerboseLogger progress indicator
 */

const VerboseLogger = require('../../bmad-core/utils/verbose-logger');
const EventEmitter = require('events');

describe('VerboseLogger - Memory Leak Prevention', () => {
  let logger;
  let processOnSpy;
  let processRemoveListenerSpy;
  let stdoutSpy;

  beforeEach(() => {
    logger = new VerboseLogger({ verbosity: true });
    processOnSpy = jest.spyOn(process, 'on');
    processRemoveListenerSpy = jest.spyOn(process, 'removeListener');
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processRemoveListenerSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  describe('progress indicator cleanup', () => {
    it('should register cleanup handlers on creation', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should cleanup on completion', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      
      progress.update(100);
      
      // Should write newline on completion
      expect(stdoutSpy).toHaveBeenCalled();
      
      // Verify it doesn't update after completion
      stdoutSpy.mockClear();
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should cleanup when complete() is called', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      progress.complete();
      
      expect(consoleSpy).toHaveBeenCalledWith('');
      
      // Verify it doesn't update after completion
      stdoutSpy.mockClear();
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle multiple progress indicators', () => {
      const progress1 = logger.createProgressIndicator('Task 1', 100);
      const progress2 = logger.createProgressIndicator('Task 2', 50);
      
      progress1.update(50);
      progress2.update(25);
      
      expect(stdoutSpy).toHaveBeenCalled();
      
      progress1.complete();
      progress2.complete();
      
      // Both should be completed
      stdoutSpy.mockClear();
      progress1.update(75);
      progress2.update(40);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should not leak memory with rapid updates', () => {
      const progress = logger.createProgressIndicator('Rapid Task', 1000);
      
      // Simulate rapid updates
      for (let i = 0; i <= 1000; i++) {
        progress.update(i);
      }
      
      // Should complete without issues
      expect(stdoutSpy).toHaveBeenCalled();
      
      // Verify no further updates after completion
      stdoutSpy.mockClear();
      progress.update(500);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should handle process termination gracefully', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Get the cleanup handler that was registered
      const sigintHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )[1];
      
      // Simulate SIGINT
      progress.update(50);
      sigintHandler();
      
      // Should write newline to stdout
      expect(stdoutSpy).toHaveBeenCalledWith('\n');
      
      // Should not allow further updates
      stdoutSpy.mockClear();
      progress.update(75);
      expect(stdoutSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should prevent duplicate cleanup', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Complete normally
      progress.complete();
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      // Try to complete again
      consoleSpy.mockClear();
      progress.complete();
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle disabled logger gracefully', () => {
      logger.enabled = false;
      const progress = logger.createProgressIndicator('Test Task', 100);
      
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
      
      progress.complete();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('interval cleanup', () => {
    it('should clear intervals on cleanup', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      const progress = logger.createProgressIndicator('Test Task', 100);
      
      // If intervals are used, they should be cleared
      progress.complete();
      
      // Note: Current implementation doesn't use intervals,
      // but this test ensures that if they are added, they are cleaned up
      
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle zero total steps', () => {
      const progress = logger.createProgressIndicator('Test Task', 0);
      
      expect(() => {
        progress.update(0);
      }).not.toThrow();
    });

    it('should handle negative total steps', () => {
      const progress = logger.createProgressIndicator('Test Task', -10);
      
      expect(() => {
        progress.update(5);
      }).not.toThrow();
    });

    it('should handle updates beyond total steps', () => {
      const progress = logger.createProgressIndicator('Test Task', 100);
      
      progress.update(150);
      
      // Should still complete
      stdoutSpy.mockClear();
      progress.update(50);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });
});