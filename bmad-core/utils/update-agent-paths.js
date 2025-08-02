#!/usr/bin/env node

/**
 * Update Agent Paths
 * 
 * Updates all agent files to use dynamic path resolution instead of hardcoded .bmad-core paths
 */

const fs = require('fs');
const path = require('path');
const { getBmadCommand } = require('./subprocess-executor');

/**
 * Updates hardcoded paths in agent files
 */
async function updateAgentPaths() {
    const agentsDir = path.join(__dirname, '..', 'agents');
    
    // Pattern to match hardcoded memory commands
    const patterns = [
        {
            // Match: execute: node .bmad-core/utils/persist-memory-cli.js
            pattern: /execute:\s*node\s+\.bmad-core\/utils\/([\w-]+\.js)/g,
            replacement: (match, scriptName) => {
                return `execute: ${getBmadCommand(scriptName)}`;
            }
        },
        {
            // Match: Execute: node .bmad-core/utils/persist-memory-cli.js
            pattern: /Execute:\s*node\s+\.bmad-core\/utils\/([\w-]+\.js)/g,
            replacement: (match, scriptName) => {
                return `Execute: ${getBmadCommand(scriptName)}`;
            }
        },
        {
            // Match standalone references in documentation
            pattern: /node\s+\.bmad-core\/utils\/([\w-]+\.js)/g,
            replacement: (match, scriptName) => {
                return `${getBmadCommand(scriptName)}`;
            }
        }
    ];
    
    // Get all agent files
    const agentFiles = fs.readdirSync(agentsDir)
        .filter(file => file.endsWith('.md'))
        .map(file => path.join(agentsDir, file));
    
    console.log(`Found ${agentFiles.length} agent files to update`);
    
    let totalUpdates = 0;
    
    for (const agentFile of agentFiles) {
        console.log(`\nProcessing: ${path.basename(agentFile)}`);
        
        let content = fs.readFileSync(agentFile, 'utf8');
        let fileUpdates = 0;
        
        // Apply each pattern
        for (const { pattern, replacement } of patterns) {
            const matches = content.match(pattern);
            if (matches) {
                fileUpdates += matches.length;
                content = content.replace(pattern, replacement);
            }
        }
        
        if (fileUpdates > 0) {
            // Write updated content
            fs.writeFileSync(agentFile, content, 'utf8');
            console.log(`  ✅ Updated ${fileUpdates} references`);
            totalUpdates += fileUpdates;
        } else {
            console.log(`  ℹ️  No updates needed`);
        }
    }
    
    console.log(`\n✅ Complete! Updated ${totalUpdates} references across all agent files`);
    console.log('\nNote: The subprocess-executor will automatically detect whether to use');
    console.log('bmad-core (development) or .bmad-core (production) based on your environment.');
}

// Run if called directly
if (require.main === module) {
    updateAgentPaths().catch(error => {
        console.error('Failed to update agent paths:', error.message);
        process.exit(1);
    });
}

module.exports = { updateAgentPaths };