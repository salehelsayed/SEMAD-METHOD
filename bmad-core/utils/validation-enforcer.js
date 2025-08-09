#!/usr/bin/env node

/**
 * Validation Enforcer
 * 
 * Provides automatic validation enforcement for StoryContract and memory operations.
 * Ensures all critical operations are validated before execution.
 */

const fs = require('fs');
const path = require('path');
const StoryContractValidator = require('./story-contract-validator');
const { validateMemoryResult, MemoryError } = require('./memory-error-handler');
const { executeBmadCommand } = require('./subprocess-executor');
const { logMemoryError } = require('./memory-usage-logger');

/**
 * Enforces StoryContract validation with automatic failure handling
 * @param {string} storyPath - Path to the story file
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with enforcement details
 */
async function enforceStoryContractValidation(storyPath, options = {}) {
    const {
        failOnError = true,
        autoFix = false,
        logErrors = true
    } = options;
    
    try {
        // Initialize validator
        const validator = new StoryContractValidator();
        
        // Perform validation
        const result = validator.validateStoryFile(storyPath);
        
        if (!result.valid) {
            const errorMessage = validator.formatErrors(result.errors);
            
            if (logErrors) {
                console.error('\n❌ STORY CONTRACT VALIDATION FAILED');
                console.error('━'.repeat(80));
                console.error(`Story: ${path.basename(storyPath)}`);
                console.error('Errors:');
                console.error(errorMessage);
                console.error('━'.repeat(80));
            }
            
            // Log validation failure for audit
            await logValidationFailure('StoryContract', storyPath, result.errors);
            
            if (failOnError) {
                throw new Error(`StoryContract validation failed: ${errorMessage}`);
            }
        }
        
        return {
            valid: result.valid,
            contract: result.contract,
            errors: result.errors,
            enforced: true,
            failureHandled: !result.valid && !failOnError
        };
        
    } catch (error) {
        if (logErrors) {
            console.error(`\n❌ VALIDATION ENFORCEMENT ERROR: ${error.message}`);
        }
        
        if (failOnError) {
            throw error;
        }
        
        return {
            valid: false,
            errors: [{ message: error.message }],
            enforced: false,
            exception: true
        };
    }
}

/**
 * Enforces memory operation validation before execution
 * @param {Function} memoryOperation - The memory operation to execute
 * @param {string} operationName - Name of the operation
 * @param {string} agentName - Agent performing the operation
 * @param {Array} args - Arguments for the operation
 * @returns {*} Result of the memory operation
 */
async function enforceMemoryOperationValidation(memoryOperation, operationName, agentName, args = []) {
    try {
        // Pre-validation: Check if memory system is healthy
        const healthCheck = await checkMemorySystemHealth();
        if (!healthCheck.healthy) {
            throw new MemoryError(
                `Memory system unhealthy: ${healthCheck.reason}`,
                operationName,
                agentName,
                { healthCheck }
            );
        }
        
        // Execute the memory operation
        const result = await memoryOperation(...args);
        
        // Post-validation: Validate the result
        validateMemoryResult(result, operationName, agentName);
        
        // Additional validation for specific operations
        if (operationName.includes('persist') || operationName.includes('save')) {
            await validateMemoryPersistence(result, agentName);
        }
        
        return result;
        
    } catch (error) {
        // Log the error
        await logMemoryError(agentName, operationName, error, {
            args,
            validationEnforced: true
        });
        
        // Re-throw as MemoryError if not already
        if (!(error instanceof MemoryError)) {
            throw new MemoryError(
                error.message,
                operationName,
                agentName,
                { originalError: error.name }
            );
        }
        
        throw error;
    }
}

/**
 * Validates that memory was actually persisted
 * @param {Object} result - Result from memory operation
 * @param {string} agentName - Agent name
 */
async function validateMemoryPersistence(result, agentName) {
    try {
        // Execute memory validation CLI
        const validationResult = await executeBmadCommand(
            'memory-operation-validator.js',
            ['validate', agentName],
            { timeout: 10000, silent: true }
        );
        
        if (validationResult.exitCode !== 0) {
            throw new Error(`Memory persistence validation failed: ${validationResult.stderr}`);
        }
    } catch (error) {
        throw new MemoryError(
            `Failed to validate memory persistence: ${error.message}`,
            'validatePersistence',
            agentName
        );
    }
}

/**
 * Checks overall memory system health
 * @returns {Object} Health check result
 */
async function checkMemorySystemHealth() {
    try {
        // Check if .ai directory exists
        const aiDir = path.join(process.cwd(), '.ai');
        if (!fs.existsSync(aiDir)) {
            return {
                healthy: false,
                reason: '.ai directory not found'
            };
        }
        
        // Check write permissions
        try {
            const testFile = path.join(aiDir, '.health-check');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            return {
                healthy: false,
                reason: 'No write permissions to .ai directory'
            };
        }
        
        // Check Qdrant connection (quick timeout)
        try {
            const healthResult = await executeBmadCommand(
                'memory-health.js',
                ['check'],
                { timeout: 5000, silent: true }
            );
            
            if (healthResult.exitCode !== 0) {
                return {
                    healthy: false,
                    reason: 'Qdrant connection unhealthy'
                };
            }
        } catch (error) {
            // Qdrant might not be required for all operations
            // Log but don't fail
            console.warn('Qdrant health check failed:', error.message);
        }
        
        return {
            healthy: true,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        return {
            healthy: false,
            reason: error.message
        };
    }
}

/**
 * Logs validation failures for audit trail
 * @param {string} validationType - Type of validation that failed
 * @param {string} target - What was being validated
 * @param {Array} errors - Validation errors
 */
async function logValidationFailure(validationType, target, errors) {
    try {
        const logDir = path.join(process.cwd(), '.ai', 'validation-logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            validationType,
            target,
            errors,
            enforced: true
        };
        
        const logFile = path.join(logDir, `validation-${new Date().toISOString().split('T')[0]}.log`);
        const logContent = JSON.stringify(logEntry) + '\n';
        
        fs.appendFileSync(logFile, logContent);
    } catch (error) {
        // Log to console if file logging fails
        console.warn('Failed to log validation failure:', error.message);
    }
}

/**
 * Creates a validation-enforced wrapper for any async function
 * @param {Function} fn - Function to wrap
 * @param {Object} validationRules - Validation rules to apply
 * @returns {Function} Wrapped function with validation
 */
function withValidation(fn, validationRules = {}) {
    return async function(...args) {
        const {
            preValidation,
            postValidation,
            onError
        } = validationRules;
        
        try {
            // Pre-validation
            if (preValidation) {
                const preResult = await preValidation(...args);
                if (!preResult.valid) {
                    throw new Error(`Pre-validation failed: ${preResult.reason}`);
                }
            }
            
            // Execute function
            const result = await fn.apply(this, args);
            
            // Post-validation
            if (postValidation) {
                const postResult = await postValidation(result, ...args);
                if (!postResult.valid) {
                    throw new Error(`Post-validation failed: ${postResult.reason}`);
                }
            }
            
            return result;
            
        } catch (error) {
            // Custom error handling
            if (onError) {
                return await onError(error, ...args);
            }
            throw error;
        }
    };
}

/**
 * CLI interface for validation enforcement
 */
if (require.main === module) {
    const command = process.argv[2];
    const args = process.argv.slice(3);
    
    (async () => {
        try {
            switch (command) {
                case 'validate-story':
                    if (!args[0]) {
                        console.error('Usage: validation-enforcer.js validate-story <story-path>');
                        process.exit(1);
                    }
                    const storyResult = await enforceStoryContractValidation(args[0]);
                    if (storyResult.valid) {
                        console.log('✅ Story contract is valid');
                        process.exit(0);
                    } else {
                        process.exit(1);
                    }
                    break;
                    
                case 'check-health':
                    const health = await checkMemorySystemHealth();
                    if (health.healthy) {
                        console.log('✅ Memory system is healthy');
                        process.exit(0);
                    } else {
                        console.error(`❌ Memory system unhealthy: ${health.reason}`);
                        process.exit(1);
                    }
                    break;
                    
                default:
                    console.error('Unknown command:', command);
                    console.error('Available commands: validate-story, check-health');
                    process.exit(1);
            }
        } catch (error) {
            console.error('Validation enforcement failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    enforceStoryContractValidation,
    enforceMemoryOperationValidation,
    checkMemorySystemHealth,
    withValidation,
    logValidationFailure
};