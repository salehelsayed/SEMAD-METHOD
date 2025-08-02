/**
 * Memory Usage Logger
 * 
 * Utility for logging all memory operations across BMad agents to provide
 * visibility into memory usage patterns and operations.
 * 
 * Logs all memory activities to .ai/memory-usage.log for monitoring and debugging.
 */

const fs = require('fs').promises;
const path = require('path');

// Conditional import to avoid circular dependency
let closeConnections = null;
try {
    const qdrant = require('./qdrant');
    closeConnections = qdrant.closeConnections;
} catch (e) {
    // Handle circular dependency gracefully
    closeConnections = async () => {
        // No-op if qdrant module is not available
    };
}

/**
 * Ensures the .ai directory exists
 */
async function ensureAiDirectory() {
    const aiDir = path.join(process.cwd(), '.ai');
    try {
        await fs.access(aiDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(aiDir, { recursive: true });
        } else {
            throw error;
        }
    }
}

/**
 * Formats a log entry with timestamp and structured data
 */
function formatLogEntry(logData) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ...logData
    };
    return JSON.stringify(logEntry) + '\n';
}

/**
 * Writes a log entry to the memory usage log file
 */
async function writeLogEntry(logData) {
    try {
        await ensureAiDirectory();
        const logPath = path.join(process.cwd(), '.ai', 'memory-usage.log');
        const logEntry = formatLogEntry(logData);
        await fs.appendFile(logPath, logEntry);
    } catch (error) {
        // Log to console if file logging fails, but don't throw
        console.warn('Memory usage logging failed:', error.message);
        // Don't throw to avoid disrupting the main operation
        // The memory operation itself is more important than logging
    }
}

/**
 * Logs memory initialization operations
 */
async function logMemoryInit(agentName, operation, details = {}) {
    await writeLogEntry({
        type: 'memory_init',
        agent: agentName,
        operation,
        details,
        level: 'info'
    });
}

/**
 * Logs working memory operations
 */
async function logWorkingMemory(agentName, operation, memoryType, data, details = {}) {
    await writeLogEntry({
        type: 'working_memory',
        agent: agentName,
        operation,
        memoryType,
        dataSize: typeof data === 'string' ? data.length : JSON.stringify(data).length,
        details,
        level: 'info'
    });
}

/**
 * Logs long-term memory operations
 */
async function logLongTermMemory(agentName, operation, memoryContent, details = {}) {
    await writeLogEntry({
        type: 'long_term_memory',
        agent: agentName,
        operation,
        memoryType: memoryContent?.memoryType || 'unknown',
        importance: memoryContent?.metadata?.importance || 'medium',
        tags: memoryContent?.metadata?.tags || [],
        contentSize: JSON.stringify(memoryContent).length,
        details,
        level: 'info'
    });
}

/**
 * Logs memory retrieval operations
 */
async function logMemoryRetrieval(agentName, operation, query, resultsCount, details = {}) {
    await writeLogEntry({
        type: 'memory_retrieval',
        agent: agentName,
        operation,
        query,
        resultsCount,
        details,
        level: 'info'
    });
}

/**
 * Logs memory context validation operations
 */
async function logContextValidation(agentName, operation, contextType, isValid, details = {}) {
    await writeLogEntry({
        type: 'context_validation',
        agent: agentName,
        operation,
        contextType,
        isValid,
        details,
        level: 'info'
    });
}

/**
 * Logs memory operation errors
 */
async function logMemoryError(agentName, operation, error, details = {}) {
    await writeLogEntry({
        type: 'memory_error',
        agent: agentName,
        operation,
        error: error.message || error,
        stack: error.stack,
        details,
        level: 'error'
    });
}

/**
 * Logs session summary operations
 */
async function logSessionSummary(agentName, operation, summaryData, details = {}) {
    await writeLogEntry({
        type: 'session_summary',
        agent: agentName,
        operation,
        summaryItems: Array.isArray(summaryData) ? summaryData.length : 1,
        details,
        level: 'info'
    });
}

/**
 * Logs task-specific memory operations
 */
async function logTaskMemory(agentName, taskName, operation, taskData, details = {}) {
    await writeLogEntry({
        type: 'task_memory',
        agent: agentName,
        taskName,
        operation,
        taskId: taskData?.taskId || 'unknown',
        storyId: taskData?.storyId || 'unknown',
        details,
        level: 'info'
    });
}

/**
 * Logs agent handoff memory operations (for orchestrated workflows)
 */
async function logHandoffMemory(fromAgent, toAgent, operation, contextData, details = {}) {
    await writeLogEntry({
        type: 'handoff_memory',
        fromAgent,
        toAgent,
        operation,
        contextSize: JSON.stringify(contextData).length,
        details,
        level: 'info'
    });
}

/**
 * Gets recent memory usage statistics from the log
 */
async function getMemoryUsageStats(hoursBack = 24) {
    try {
        const logPath = path.join(process.cwd(), '.ai', 'memory-usage.log');
        const logContent = await fs.readFile(logPath, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line.trim());
        
        const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        const recentEntries = lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(entry => entry && new Date(entry.timestamp) > cutoffTime);

        const stats = {
            totalOperations: recentEntries.length,
            byAgent: {},
            byType: {},
            byLevel: { info: 0, error: 0, warn: 0 },
            errors: recentEntries.filter(e => e.level === 'error'),
            timeRange: {
                from: cutoffTime.toISOString(),
                to: new Date().toISOString()
            }
        };

        recentEntries.forEach(entry => {
            // Count by agent
            stats.byAgent[entry.agent] = (stats.byAgent[entry.agent] || 0) + 1;
            
            // Count by type
            stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
            
            // Count by level
            stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
        });

        return stats;
    } catch (error) {
        return {
            error: 'Could not read memory usage log',
            message: error.message
        };
    }
}

/**
 * Clears old log entries (keeps last N days)
 */
async function cleanupOldLogs(daysToKeep = 7) {
    try {
        const logPath = path.join(process.cwd(), '.ai', 'memory-usage.log');
        const logContent = await fs.readFile(logPath, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line.trim());
        
        const cutoffTime = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
        const recentEntries = lines
            .map(line => {
                try {
                    const entry = JSON.parse(line);
                    return new Date(entry.timestamp) > cutoffTime ? line : null;
                } catch {
                    return null;
                }
            })
            .filter(line => line !== null);

        await fs.writeFile(logPath, recentEntries.join('\n') + '\n');
        
        await writeLogEntry({
            type: 'log_cleanup',
            agent: 'system',
            operation: 'cleanup_old_logs',
            entriesKept: recentEntries.length,
            entriesRemoved: lines.length - recentEntries.length,
            daysToKeep,
            level: 'info'
        });
    } catch (error) {
        console.warn('Log cleanup failed:', error.message);
    }
}

module.exports = {
    logMemoryInit,
    logWorkingMemory,
    logLongTermMemory,
    logMemoryRetrieval,
    logContextValidation,
    logMemoryError,
    logSessionSummary,
    logTaskMemory,
    logHandoffMemory,
    getMemoryUsageStats,
    cleanupOldLogs
};

// Command-line interface
if (require.main === module) {
    const command = process.argv[2];
    const agent = process.argv[3];
    const args = process.argv.slice(4);
    
    async function runCommand() {
        try {
            switch (command) {
                case 'logMemoryInit':
                    // Handle --data flag properly
                    let initData = {};
                    const dataIndex = args.indexOf('--data');
                    if (dataIndex !== -1 && args[dataIndex + 1]) {
                        try {
                            initData = JSON.parse(args[dataIndex + 1]);
                        } catch (e) {
                            console.error('Invalid JSON in --data argument:', args[dataIndex + 1]);
                            throw new Error(`Invalid JSON in --data argument`);
                        }
                    } else if (args[1] && !args[1].startsWith('--')) {
                        try {
                            initData = JSON.parse(args[1]);
                        } catch (e) {
                            // If not JSON, treat as empty object
                            initData = {};
                        }
                    }
                    await logMemoryInit(agent, args[0] || 'cli_init', initData);
                    console.log('Memory init logged');
                    break;
                    
                case 'logWorkingMemory':
                    await logWorkingMemory(
                        agent, 
                        args[0] || 'cli_update', 
                        args[1] || 'general', 
                        args[2] || '{}', 
                        args[3] ? JSON.parse(args[3]) : {}
                    );
                    console.log('Working memory logged');
                    break;
                    
                case 'logLongTermMemory':
                    await logLongTermMemory(agent, args[0] || 'cli_save', args[1] ? JSON.parse(args[1]) : {}, args[2] ? JSON.parse(args[2]) : {});
                    console.log('Long-term memory logged');
                    break;
                    
                case 'logMemoryRetrieval':
                    await logMemoryRetrieval(
                        agent, 
                        args[0] || 'cli_retrieve', 
                        args[1] || 'unknown_query', 
                        parseInt(args[2]) || 0, 
                        args[3] ? JSON.parse(args[3]) : {}
                    );
                    console.log('Memory retrieval logged');
                    break;
                    
                case 'logContextValidation':
                    await logContextValidation(
                        agent, 
                        args[0] || 'cli_validate', 
                        args[1] || 'unknown_context', 
                        args[2] === 'true' || args[2] === true, 
                        args[3] ? JSON.parse(args[3]) : {}
                    );
                    console.log('Context validation logged');
                    break;
                    
                default:
                    console.error(`Unknown command: ${command}`);
                    console.error('Available commands: logMemoryInit, logWorkingMemory, logLongTermMemory, logMemoryRetrieval, logContextValidation');
                    await closeConnections();
                    process.exit(1);
            }
            await closeConnections();
            process.exit(0);
        } catch (error) {
            console.error(`Command failed: ${error.message}`);
            await closeConnections();
            process.exit(1);
        }
    }
    
    runCommand();
}