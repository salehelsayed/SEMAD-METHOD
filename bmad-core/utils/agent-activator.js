#!/usr/bin/env node

/**
 * Agent Activator
 * 
 * Provides programmatic agent activation for orchestrated workflows.
 * Allows the orchestrator to automatically activate agents with context
 * without requiring manual user intervention.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { executeBmadCommand, getBmadCoreDir } = require('./subprocess-executor');
const { withTimeout } = require('./timeout-wrapper');
// Simple stubs for removed memory functions
class MemoryError extends Error {}
const handleCriticalMemoryError = (error) => console.error('Critical error:', error);

/**
 * Validates that a handoff context file exists and is readable
 * @param {string} contextPath - Path to handoff context file
 * @returns {Object} The parsed context object
 */
async function loadHandoffContext(contextPath) {
    try {
        if (!fs.existsSync(contextPath)) {
            throw new Error(`Handoff context not found at: ${contextPath}`);
        }
        
        const content = await fs.promises.readFile(contextPath, 'utf8');
        const context = JSON.parse(content);
        
        // Validate required fields
        if (!context.workflow || !context.currentStep) {
            throw new Error('Invalid handoff context: missing required fields');
        }
        
        return context;
    } catch (error) {
        throw new Error(`Failed to load handoff context: ${error.message}`);
    }
}

/**
 * Saves updated handoff context
 * @param {string} contextPath - Path to handoff context file
 * @param {Object} context - Updated context object
 */
async function saveHandoffContext(contextPath, context) {
    try {
        const contextDir = path.dirname(contextPath);
        if (!fs.existsSync(contextDir)) {
            await fs.promises.mkdir(contextDir, { recursive: true });
        }
        
        await fs.promises.writeFile(
            contextPath,
            JSON.stringify(context, null, 2),
            'utf8'
        );
    } catch (error) {
        throw new Error(`Failed to save handoff context: ${error.message}`);
    }
}

/**
 * Activates an agent with the given context
 * @param {string} agentName - Name of the agent to activate
 * @param {Object} context - Handoff context for the agent
 * @param {Object} options - Activation options
 * @returns {Object} Agent execution result
 */
async function activateAgent(agentName, context, options = {}) {
    const {
        timeout = 300000, // 5 minutes default timeout
        orchestratorMode = true,
        workingDirectory = process.cwd()
    } = options;
    
    try {
        // Prepare agent-specific context
        const agentContext = {
            ...context,
            activatedBy: 'orchestrator',
            activationTime: new Date().toISOString(),
            orchestratorMode,
            targetAgent: agentName
        };
        
        // Save context for agent to access
        const contextPath = path.join(workingDirectory, '.ai', 'handoff-context.json');
        await saveHandoffContext(contextPath, agentContext);
        
        // Prepare command based on agent type
        const agentCommand = prepareAgentCommand(agentName, agentContext);
        
        // Execute agent with timeout
        const executeWithTimeout = withTimeout(
            () => executeBmadCommand(agentCommand.script, agentCommand.args, {
                timeout: timeout,
                silent: false
            }),
            timeout,
            `Agent ${agentName} execution`
        );
        
        const result = await executeWithTimeout();
        
        // Load updated context after agent execution
        const updatedContext = await loadHandoffContext(contextPath);
        
        return {
            success: true,
            agent: agentName,
            executionTime: Date.now() - new Date(agentContext.activationTime).getTime(),
            output: result.stdout,
            errors: result.stderr,
            updatedContext,
            exitCode: result.exitCode
        };
        
    } catch (error) {
        // Handle timeout errors specially
        if (error.name === 'TimeoutError') {
            return {
                success: false,
                agent: agentName,
                error: `Agent ${agentName} timed out after ${timeout}ms`,
                timeout: true
            };
        }
        
        // Handle other errors
        return {
            success: false,
            agent: agentName,
            error: error.message,
            stack: error.stack
        };
    }
}

/**
 * Prepares the command to execute for a given agent
 * @param {string} agentName - Name of the agent
 * @param {Object} context - Agent context
 * @returns {Object} Command configuration
 */
function prepareAgentCommand(agentName, context) {
    // Map agent names to their runner commands
    const agentCommands = {
        'analyst': {
            script: 'agent-runner.js',
            args: ['analyst', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'pm': {
            script: 'agent-runner.js',
            args: ['pm', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'architect': {
            script: 'agent-runner.js',
            args: ['architect', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'dev': {
            script: 'agent-runner.js',
            args: ['dev', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'qa': {
            script: 'agent-runner.js',
            args: ['qa', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'sm': {
            script: 'agent-runner.js',
            args: ['sm', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'po': {
            script: 'agent-runner.js',
            args: ['po', '--orchestrated', '--context', '.ai/handoff-context.json']
        },
        'ux-expert': {
            script: 'agent-runner.js',
            args: ['ux-expert', '--orchestrated', '--context', '.ai/handoff-context.json']
        }
    };
    
    const command = agentCommands[agentName.toLowerCase()];
    if (!command) {
        throw new Error(`Unknown agent: ${agentName}`);
    }
    
    // Add workflow-specific arguments
    if (context.workflow) {
        command.args.push('--workflow', context.workflow);
    }
    
    if (context.currentStep) {
        command.args.push('--step', context.currentStep);
    }
    
    return command;
}

/**
 * Monitors agent execution status
 * @param {string} agentName - Name of the agent
 * @param {string} contextPath - Path to context file
 * @returns {Object} Monitoring result
 */
async function monitorAgentExecution(agentName, contextPath) {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds
    const maxChecks = 60; // Maximum 5 minutes of monitoring
    
    for (let i = 0; i < maxChecks; i++) {
        try {
            const context = await loadHandoffContext(contextPath);
            
            // Check if agent has completed
            if (context.agentCompleted && context.agentCompleted[agentName]) {
                return {
                    completed: true,
                    duration: Date.now() - startTime,
                    result: context.agentCompleted[agentName]
                };
            }
            
            // Check for errors
            if (context.agentErrors && context.agentErrors[agentName]) {
                return {
                    completed: true,
                    error: true,
                    duration: Date.now() - startTime,
                    errorDetails: context.agentErrors[agentName]
                };
            }
            
        } catch (error) {
            // Context might be temporarily locked, continue monitoring
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Timeout reached
    return {
        completed: false,
        timeout: true,
        duration: Date.now() - startTime
    };
}

/**
 * CLI interface for testing agent activation
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Usage: agent-activator.js <agent-name> [--context <path>] [--timeout <ms>]');
        console.error('Example: agent-activator.js analyst --context .ai/handoff-context.json');
        process.exit(1);
    }
    
    const agentName = args[0];
    let contextPath = '.ai/handoff-context.json';
    let timeout = 300000;
    
    // Parse arguments
    for (let i = 1; i < args.length; i += 2) {
        if (args[i] === '--context' && args[i + 1]) {
            contextPath = args[i + 1];
        } else if (args[i] === '--timeout' && args[i + 1]) {
            timeout = parseInt(args[i + 1]);
        }
    }
    
    // Run activation
    (async () => {
        try {
            console.log(`Activating agent: ${agentName}`);
            console.log(`Context path: ${contextPath}`);
            console.log(`Timeout: ${timeout}ms`);
            
            // Load context
            const context = await loadHandoffContext(contextPath);
            
            // Activate agent
            const result = await activateAgent(agentName, context, { timeout });
            
            if (result.success) {
                console.log(`✅ Agent ${agentName} completed successfully`);
                console.log(`Execution time: ${result.executionTime}ms`);
                process.exit(0);
            } else {
                console.error(`❌ Agent ${agentName} failed:`, result.error);
                process.exit(1);
            }
            
        } catch (error) {
            console.error('Failed to activate agent:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    activateAgent,
    loadHandoffContext,
    saveHandoffContext,
    monitorAgentExecution,
    prepareAgentCommand
};