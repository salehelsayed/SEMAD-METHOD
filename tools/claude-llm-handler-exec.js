#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Claude CLI Integration Handler - Using exec for better output capture
 */

async function claudeLLMHandler(actions, step) {
  // Verify Claude is working
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
      const response = await callClaudeExec(prompt, action.description);
      responses[action.description] = response;
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      responses[action.description] = `[Error] ${error.message}`;
    }
  }
  
  return responses;
}

/**
 * Test if Claude works
 */
function testClaudeHeadless() {
  try {
    console.log('🔍 Testing Claude CLI authentication...');
    
    const result = execSync('claude -p "respond with just: OK"', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    if (result && result.includes('OK')) {
      console.log('✅ Claude CLI authenticated and working');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('⚠️  Could not test Claude:', error.message);
    return false;
  }
}

/**
 * Call Claude using exec for real-time output
 */
function callClaudeExec(prompt, actionDesc) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let output = '';
    let errorOutput = '';
    
    console.log(`\n📝 ${actionDesc}`);
    console.log('   Calling Claude...');
    
    // Show the prompt if verbose
    if (process.env.VERBOSE) {
      console.log('\n   📋 Prompt:');
      console.log('   ' + '─'.repeat(60));
      const lines = prompt.split('\n').slice(0, 5);
      console.log('   ' + lines.join('\n   '));
      if (prompt.split('\n').length > 5) {
        console.log(`   ... (${prompt.length} total characters)`);
      }
      console.log('   ' + '─'.repeat(60));
    }
    
    // Escape prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    
    // Configure timeout
    const timeoutMs = parseInt(process.env.CLAUDE_TIMEOUT || '300000', 10);
    const timeoutSecs = Math.round(timeoutMs / 1000);
    
    // Use exec for real-time output streaming
    const claude = exec(`claude -p '${escapedPrompt}'`, {
      encoding: 'utf8',
      timeout: timeoutMs
    });
    
    // Track output timing
    let lastOutputTime = Date.now();
    let progressInterval;
    
    // Show progress
    if (process.env.VERBOSE_STREAM) {
      progressInterval = setInterval(() => {
        const waiting = Math.round((Date.now() - lastOutputTime) / 1000);
        process.stdout.write(`\r   ⏱️ Waiting... ${waiting}s since last output`);
      }, 1000);
    } else {
      let dots = 0;
      progressInterval = setInterval(() => {
        process.stdout.write('.');
        dots++;
        if (dots % 40 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          process.stdout.write(` ${elapsed}s\n   `);
        }
      }, 500);
    }
    
    // Capture stdout
    claude.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      lastOutputTime = Date.now();
      
      if (process.env.VERBOSE_STREAM) {
        // Clear progress line
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        // Show Claude's output
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            console.log(`   📝 Claude: ${line}`);
          }
        });
      }
    });
    
    // Capture stderr  
    claude.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorOutput += text;
      
      if (process.env.VERBOSE_STREAM && text.trim()) {
        console.log(`   ⚠️ Stderr: ${text.trim()}`);
      }
    });
    
    // Handle completion
    claude.on('close', (code) => {
      clearInterval(progressInterval);
      
      if (process.env.VERBOSE_STREAM) {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
      }
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (code === 0 && output) {
        console.log(`\n   ✅ Complete (${elapsed}s, ${output.length} chars)`);
        resolve(output.trim());
      } else if (code === null) {
        console.log(`\n   ⏱️ Timeout after ${timeoutSecs}s`);
        reject(new Error(`Timeout after ${timeoutSecs}s`));
      } else {
        const error = errorOutput || `Process exited with code ${code}`;
        console.log(`\n   ❌ Failed: ${error}`);
        reject(new Error(error));
      }
    });
    
    claude.on('error', (err) => {
      clearInterval(progressInterval);
      console.log(`\n   ❌ Error: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Build context-aware prompt
 */
function buildPrompt(action, step) {
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

// Quick test
async function quickTest() {
  console.log('🧪 Testing Claude with exec method\n');
  
  try {
    const result = await callClaudeExec(
      'Say "Claude is working!" and nothing else.',
      'Testing exec-based handler'
    );
    console.log('\n📊 Result:', result);
    console.log('\n✅ Test passed!');
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
      console.log('✅ Claude is ready');
    } else {
      console.log('❌ Claude is not ready');
      process.exit(1);
    }
  } else {
    console.log('Usage: node claude-llm-handler-exec.js [--test|--check]');
  }
}