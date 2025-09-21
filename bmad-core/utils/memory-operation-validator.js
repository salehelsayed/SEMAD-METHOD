/**
 * Minimal MemoryOperationValidator shim. Provides no-op validation.
 */
class MemoryOperationValidator {
  validate() {
    return { valid: true, errors: [], warnings: [] };
  }
}

module.exports = MemoryOperationValidator;

