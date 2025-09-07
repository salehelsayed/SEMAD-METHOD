#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Claude CLI Integration Handler - Headless Mode
 * Uses stored authentication from interactive login
 */

async function claudeLLMHandler(actions, step) {
  // Verify Claude is working in headless mode
  if (!testClaudeHeadless()) {
    console.error('❌ Claude CLI not working. Please ensure:');
    console.error('   1. Run: claude');
    console.error('   2. Use: /login to authenticate');
    console.error('   3. Exit: /exit or Ctrl+D');
    console.error('   4. Test: claude -p "test" (should work without prompting)');
    process.exit(1);
  }
  
  const responses = {};
  
  console.log(`\n🤖 Claude Handler activated for step: ${step.name}`);
  console.log(`📋 Processing ${actions.length} action(s)...`);
  
  for (const action of actions) {
    try {
      const prompt = buildPrompt(action, step);
      const response = await callClaudeHeadless(prompt, action.description);
      responses[action.description] = response;
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      responses[action.description] = `[Error] ${error.message}`;
    }
  }
  
  return responses;
}

/**
 * Test if Claude works in headless mode
 */
function testClaudeHeadless() {
  try {
    console.log('🔍 Testing Claude CLI authentication...');
    
    // Try a simple headless command
    const result = spawnSync('claude', ['-p', 'respond with just: OK'], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Check if it worked without prompting for login
    if (result.status === 0 && result.stdout) {
      console.log('✅ Claude CLI authenticated and working');
      return true;
    }
    
    // Check stderr for login prompts
    const stderr = result.stderr || '';
    if (stderr.includes('login') || stderr.includes('authenticate')) {
      console.error('⚠️  Claude needs authentication');
      return false;
    }
    
    // Unknown error
    console.error('⚠️  Claude test failed:', stderr || result.error);
    return false;
    
  } catch (error) {
    console.error('⚠️  Could not test Claude:', error.message);
    return false;
  }
}

/**
 * Call Claude in headless mode with real-time progress
 */
function callClaudeHeadless(prompt, actionDesc) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let output = '';
    let errorOutput = '';
    let progressInterval;
    
    console.log(`\n📝 ${actionDesc}`);
    console.log('   Calling Claude in headless mode...');
    
    // Show the prompt being sent if VERBOSE is set
    if (process.env.VERBOSE) {
      console.log('\n   📋 Prompt being sent to Claude:');
      console.log('   ' + '─'.repeat(60));
      console.log('   ' + prompt.split('\n').slice(0, 5).join('\n   '));
      if (prompt.split('\n').length > 5) {
        console.log(`   ... (${prompt.length} total characters)`);
      }
      console.log('   ' + '─'.repeat(60));
    }
    
    // Properly escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    
    // Use -p flag for headless mode
    // Note: Using 'inherit' for stdin to make Claude think it's interactive
    const claude = spawn('claude', ['-p', prompt], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Force non-interactive mode
        CLAUDE_NONINTERACTIVE: '1',
        NO_COLOR: '1'  // Disable color output for cleaner parsing
      },
      shell: true  // Run through shell to handle TTY properly
    });
    
    // Show progress indicator OR stream output
    let dots = 0;
    let lastOutputTime = Date.now();
    
    if (!process.env.VERBOSE_STREAM) {
      // Original dot progress for non-verbose mode
      progressInterval = setInterval(() => {
        process.stdout.write('.');
        dots++;
        if (dots % 40 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          process.stdout.write(` ${elapsed}s\n   `);
        }
      }, 500);
    } else {
      // Show time since last output for verbose mode
      progressInterval = setInterval(() => {
        const timeSinceOutput = ((Date.now() - lastOutputTime) / 1000).toFixed(0);
        process.stdout.write(`\r   ⏱️ Waiting for Claude... ${timeSinceOutput}s since last output`);
      }, 1000);
    }
    
    // Collect output
    claude.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      lastOutputTime = Date.now();
      
      // Show real-time output if VERBOSE_STREAM is set
      if (process.env.VERBOSE_STREAM) {
        // Clear the waiting message
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        // Show the actual Claude output as it comes
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            console.log('   📝 Claude: ' + line);
          }
        });
      }
    });
    
    // Collect errors
    claude.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorOutput += text;
      
      // In verbose mode, show stderr too (Claude might output there)
      if (process.env.VERBOSE_STREAM) {
        console.log('   ⚠️ Claude stderr:', text.trim());
      }
      
      // Check for authentication errors in real-time
      if (text.includes('login') || text.includes('authenticate')) {
        clearInterval(progressInterval);
        claude.kill();
        reject(new Error('Claude requires authentication. Please run: claude and use /login'));
      }
    });
    
    claude.on('close', (code) => {
      clearInterval(progressInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (code === 0 && output) {
        // Clean the output (remove ANSI codes if any)
        const cleanOutput = output
          .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
          .trim();
        
        console.log(`\n   ✅ Complete (${cleanOutput.length} chars in ${elapsed}s)`);
        resolve(cleanOutput);
      } else {
        const error = errorOutput || `Process exited with code ${code}`;
        console.log(`\n   ❌ Failed: ${error}`);
        reject(new Error(error));
      }
    });
    
    claude.on('error', (err) => {
      clearInterval(progressInterval);
      console.log(`\n   ❌ Spawn error: ${err.message}`);
      reject(err);
    });
    
    // Timeout protection - configurable via env var, default 5 minutes
    const timeoutMs = parseInt(process.env.CLAUDE_TIMEOUT || '300000', 10);
    const timeoutSecs = Math.round(timeoutMs / 1000);
    const timeout = setTimeout(() => {
      clearInterval(progressInterval);
      console.log(`\n   ⏱️  Timeout - killing process after ${timeoutSecs}s...`);
      claude.kill('SIGTERM');
      reject(new Error(`Timeout after ${timeoutSecs}s`));
    }, timeoutMs);
    
    claude.on('exit', () => {
      clearTimeout(timeout);
      clearInterval(progressInterval);
    });
  });
}

/**
 * Build context-aware prompt
 */
function buildPrompt(action, step) {
  // Keep prompts focused and concise for better responses
  let prompt = `Context: ${step.name}`;
  
  if (step.description) {
    prompt += ` - ${step.description}`;
  }
  
  prompt += `\n\nTask: ${action.description}`;
  
  if (action.context) {
    prompt += `\n\nDetails: ${action.context}`;
  }
  
  // Action-specific guidance
  const actionLower = action.description.toLowerCase();
  
  if (actionLower.includes('review')) {
    prompt += '\n\nFocus on: quality, security, performance, and specific improvements.';
  } else if (actionLower.includes('validate')) {
    prompt += '\n\nConfirm requirements are met and note any issues.';
  } else if (actionLower.includes('suggest')) {
    prompt += '\n\nProvide specific, actionable recommendations.';
  }
  
  prompt += '\n\nProvide a concise, practical response.';
  
  return prompt;
}

// Quick test function
async function quickTest() {
  console.log('🧪 Quick Claude Headless Test\n');
  
  try {
    const result = await callClaudeHeadless(
      'Say "Claude is working in headless mode!" and nothing else.',
      'Testing headless mode'
    );
    console.log('\n📊 Result:', result);
    console.log('\n✅ Test passed! Claude is working in headless mode.');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

module.exports = claudeLLMHandler;
module.exports.default = claudeLLMHandler;

// If run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    quickTest();
  } else if (args.includes('--check')) {
    if (testClaudeHeadless()) {
      console.log('✅ Claude is ready for headless operation');
    } else {
      console.log('❌ Claude is not ready');
      process.exit(1);
    }
  } else {
    console.log(`
Claude Headless Handler for SEMAD/BMAD
=======================================

SETUP STEPS:
------------
1. Install Claude CLI:
   npm install -g @anthropic-ai/claude-code

2. Authenticate ONCE:
   $ claude
   > /login
   [complete browser auth]
   > /exit

3. Verify headless works:
   $ claude -p "say hello"
   [should respond without prompting]

4. Test this handler:
   $ node ${__filename} --test

USAGE:
------
SEMAD_ELICIT_HANDLER_MODULE=./tools/claude-llm-handler.js \\
BMAD_NONINTERACTIVE=1 \\
VERBOSE=1 \\
node tools/agent.js "/qa *review docs/stories/story.md"

COMMANDS:
---------
--test   Run a quick test
--check  Check if Claude is authenticated

TROUBLESHOOTING:
----------------
- "Not authenticated": Run 'claude', use /login, then /exit
- Hanging: Claude might be in interactive mode, kill and retry
- No output: Check if 'claude -p "test"' works in terminal
    `);
  }
}
