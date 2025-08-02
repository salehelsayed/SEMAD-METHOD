#!/usr/bin/env node

/**
 * Subprocess Executor
 * 
 * Handles execution of BMad CLI tools with proper path resolution
 * for both development (bmad-core) and production (.bmad-core) environments.
 * 
 * This utility ensures proper error handling and propagation for subprocess execution.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ModuleResolver = require('./module-resolver');

/**
 * Determines if we're in development or production environment
 * Development: bmad-core directory exists
 * Production: .bmad-core directory exists
 */
function getBmadCoreDir() {
    const cwd = process.cwd();
    
    // First check for bmad-core (development)
    const devPath = path.join(cwd, 'bmad-core');
    if (fs.existsSync(devPath) && fs.statSync(devPath).isDirectory()) {
        return 'bmad-core';
    }
    
    // Then check for .bmad-core (production/installed)
    const prodPath = path.join(cwd, '.bmad-core');
    if (fs.existsSync(prodPath) && fs.statSync(prodPath).isDirectory()) {
        return '.bmad-core';
    }
    
    // Use ModuleResolver as fallback
    const resolvedPath = ModuleResolver.findBmadCoreDir(cwd);
    if (resolvedPath) {
        return path.basename(resolvedPath);
    }
    
    // Default to .bmad-core for production
    return '.bmad-core';
}

/**
 * Execute a BMad CLI command with proper path resolution and error handling
 * 
 * @param {string} scriptPath - Relative path to the script within bmad-core/utils
 * @param {string[]} args - Command line arguments
 * @param {object} options - Additional options
 * @param {number} options.timeout - Command timeout in milliseconds
 * @param {boolean} options.silent - Suppress output
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function executeBmadCommand(scriptPath, args = [], options = {}) {
    const bmadDir = getBmadCoreDir();
    const fullScriptPath = path.join(process.cwd(), bmadDir, 'utils', scriptPath);
    
    // Verify script exists
    if (!fs.existsSync(fullScriptPath)) {
        throw new Error(`BMad script not found: ${fullScriptPath}. Please ensure BMad is properly installed.`);
    }
    
    return new Promise((resolve, reject) => {
        const child = spawn('node', [fullScriptPath, ...args], {
            cwd: process.cwd(),
            env: { ...process.env, BMAD_CORE_DIR: bmadDir }
        });
        
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timeoutHandle;
        
        if (options.timeout) {
            timeoutHandle = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }, options.timeout);
        }
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            if (!options.silent) {
                process.stdout.write(data);
            }
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            if (!options.silent) {
                process.stderr.write(data);
            }
        });
        
        child.on('error', (error) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            reject(new Error(`Failed to execute BMad command: ${error.message}`));
        });
        
        child.on('close', (code, signal) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            
            if (timedOut) {
                reject(new Error(`Command timed out after ${options.timeout}ms`));
            } else if (signal) {
                reject(new Error(`Command terminated by signal ${signal}`));
            } else if (code !== 0) {
                const error = new Error(`Command failed with exit code ${code}`);
                error.stdout = stdout;
                error.stderr = stderr;
                error.exitCode = code;
                reject(error);
            } else {
                resolve({ stdout, stderr, exitCode: code });
            }
        });
    });
}

/**
 * Execute a BMad CLI command synchronously (for backward compatibility)
 * 
 * @param {string} scriptPath - Relative path to the script within bmad-core/utils
 * @param {string[]} args - Command line arguments
 * @returns {string} - Command output
 */
function executeBmadCommandSync(scriptPath, args = []) {
    const bmadDir = getBmadCoreDir();
    const fullScriptPath = path.join(process.cwd(), bmadDir, 'utils', scriptPath);
    
    // Verify script exists
    if (!fs.existsSync(fullScriptPath)) {
        throw new Error(`BMad script not found: ${fullScriptPath}. Please ensure BMad is properly installed.`);
    }
    
    try {
        const result = execSync(`node "${fullScriptPath}" ${args.map(arg => `"${arg}"`).join(' ')}`, {
            cwd: process.cwd(),
            env: { ...process.env, BMAD_CORE_DIR: bmadDir },
            encoding: 'utf8'
        });
        return result;
    } catch (error) {
        // Preserve error details
        const enhancedError = new Error(`BMad command failed: ${error.message}`);
        enhancedError.stdout = error.stdout?.toString() || '';
        enhancedError.stderr = error.stderr?.toString() || '';
        enhancedError.exitCode = error.status || 1;
        throw enhancedError;
    }
}

/**
 * Helper function to execute memory persistence commands
 */
async function executeMemoryCommand(command, agentName, ...args) {
    try {
        const result = await executeBmadCommand('persist-memory-cli.js', [command, agentName, ...args], {
            timeout: 30000 // 30 second timeout for memory operations
        });
        return result;
    } catch (error) {
        // Log error but don't throw to prevent disrupting agent flow
        console.error(`Memory command failed: ${command} for ${agentName}`, error.message);
        return { stdout: '', stderr: error.message, exitCode: 1 };
    }
}

/**
 * Helper function to get the correct BMad command for agent use
 * This replaces hardcoded .bmad-core references in agent files
 */
function getBmadCommand(scriptName) {
    const bmadDir = getBmadCoreDir();
    return `node ${bmadDir}/utils/${scriptName}`;
}

module.exports = {
    executeBmadCommand,
    executeBmadCommandSync,
    executeMemoryCommand,
    getBmadCommand,
    getBmadCoreDir
};

// CLI interface for testing
if (require.main === module) {
    const script = process.argv[2];
    const args = process.argv.slice(3);
    
    if (!script) {
        console.error('Usage: subprocess-executor.js <script> [args...]');
        console.error('Example: subprocess-executor.js persist-memory-cli.js observation dev "Test observation"');
        process.exit(1);
    }
    
    executeBmadCommand(script, args)
        .then(result => {
            process.exit(result.exitCode);
        })
        .catch(error => {
            console.error('Execution failed:', error.message);
            process.exit(1);
        });
}