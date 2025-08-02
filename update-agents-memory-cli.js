#!/usr/bin/env node

/**
 * Script to update all agent configurations to use CLI wrapper for memory persistence
 */

const fs = require('fs').promises;
const path = require('path');

const agentsDir = path.join(__dirname, 'bmad-core', 'agents');

// Pattern to match persist function calls
const patterns = [
  {
    // Match: execute persistObservation(agent, 'message', {metadata})
    regex: /execute persistObservation\((\w+), '([^']+)'(?:, \{[^}]+\})?\)/g,
    replacement: (match, agent, message) => `execute: node .bmad-core/utils/persist-memory-cli.js observation ${agent} '${message}'`
  },
  {
    // Match: execute persistDecision(agent, 'decision', {metadata})
    regex: /execute persistDecision\((\w+), '([^']+)'(?:, \{[^}]+\})?\)/g,
    replacement: (match, agent, decision) => `execute: node .bmad-core/utils/persist-memory-cli.js decision ${agent} '${decision}' 'Decision reasoning'`
  },
  {
    // Match: execute persistKeyFact(agent, 'fact', {metadata})
    regex: /execute persistKeyFact\((\w+), '([^']+)'(?:, \{[^}]+\})?\)/g,
    replacement: (match, agent, fact) => `execute: node .bmad-core/utils/persist-memory-cli.js keyfact ${agent} '${fact}'`
  },
  {
    // Match: execute persistBlocker(agent, 'blocker', {metadata})
    regex: /execute persistBlocker\((\w+), '([^']+)'(?:, \{[^}]+\})?\)/g,
    replacement: (match, agent, blocker) => `execute: node .bmad-core/utils/persist-memory-cli.js blocker ${agent} '${blocker}'`
  }
];

async function updateAgentFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let updated = false;
    
    // Apply each pattern replacement
    patterns.forEach(({ regex, replacement }) => {
      const originalContent = content;
      content = content.replace(regex, replacement);
      if (content !== originalContent) {
        updated = true;
      }
    });
    
    if (updated) {
      await fs.writeFile(filePath, content);
      console.log(`✓ Updated: ${path.basename(filePath)}`);
    } else {
      console.log(`  No changes needed: ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.error(`✗ Error updating ${filePath}:`, error.message);
  }
}

async function main() {
  try {
    const files = await fs.readdir(agentsDir);
    const agentFiles = files.filter(f => f.endsWith('.md'));
    
    console.log('Updating agent configurations to use CLI wrapper...\n');
    
    for (const file of agentFiles) {
      await updateAgentFile(path.join(agentsDir, file));
    }
    
    console.log('\n✓ Update complete!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();