#!/usr/bin/env node

/**
 * QA Review Bridge - Properly handles Claude CLI output without corruption
 * This calls your LOCAL Claude CLI (claude.ai/code) not the Anthropic API
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runClaude(prompt) {
    try {
        // Call your local Claude CLI and properly handle the output
        const result = execSync(`claude -p "${prompt.replace(/"/g, '\\"')}"`, {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr to avoid noise
        });
        
        // Clean the result - remove any non-printable characters
        return result
            .replace(/[^\x20-\x7E\n\t]/g, '') // Remove non-ASCII
            .trim();
    } catch (error) {
        console.error('Claude CLI error:', error.message);
        return 'Failed to get response from Claude';
    }
}

function reviewStory(storyFile) {
    console.log('🔍 QA Review using Claude CLI Bridge\n');
    
    // Read story file
    const content = fs.readFileSync(storyFile, 'utf8');
    
    // Extract key information
    const storyId = (content.match(/story_id:\s*(.+)/) || [,'Unknown'])[1];
    const storyTitle = (content.match(/story_title:\s*(.+)/) || [,'Unknown'])[1];
    
    console.log(`📋 Story: ${storyId} - ${storyTitle}`);
    console.log('━'.repeat(50));
    
    // Step 1: Review Acceptance Criteria
    console.log('\n📝 Reviewing Acceptance Criteria...');
    const criteriaSection = content.match(/acceptanceCriteria:[\s\S]*?(?=\n[a-z])/);
    
    const criteriaPrompt = `Review these acceptance criteria and provide a brief status for each. Use check marks or X marks. Be concise:
${criteriaSection ? criteriaSection[0] : 'No criteria found'}`;
    
    const criteriaResult = runClaude(criteriaPrompt);
    console.log('✅ Criteria review complete');
    
    // Step 2: Review Security Issues  
    console.log('\n🔒 Reviewing Security Issues...');
    const securitySection = content.match(/securityVulnerabilities:[\s\S]*?(?=\n[a-z])/);
    
    const securityPrompt = `Review these security issues. For each, state if it's FIXED or NOT FIXED:
${securitySection ? securitySection[0] : 'No security issues found'}`;
    
    const securityResult = runClaude(securityPrompt);
    console.log('✅ Security review complete');
    
    // Step 3: Make Decision
    console.log('\n🎯 Making QA Decision...');
    const decisionPrompt = `Based on the reviews, should QA PASS or FAIL? Reply with only PASS or FAIL followed by a one-line reason.`;
    
    const decisionResult = runClaude(decisionPrompt);
    const decision = decisionResult.includes('PASS') ? 'PASS' : 'FAIL';
    const status = decision === 'PASS' ? 'QA Approved' : 'QA Failed';
    
    console.log(`\n📊 Decision: ${decision}`);
    
    // Step 4: Update Story File
    updateStoryFile(storyFile, status, criteriaResult, securityResult, decision);
    
    console.log('\n✅ QA Review Complete!');
}

function updateStoryFile(storyFile, status, criteriaResult, securityResult, decision) {
    let content = fs.readFileSync(storyFile, 'utf8');
    
    // Update status
    content = content.replace(/status:\s*.+/, `status: ${status}`);
    
    // Create QA Results section
    const qaResults = `
## QA Results

### Review ${new Date().toISOString()}
**Status:** ${status}
**Reviewer:** Automated QA via Claude CLI Bridge

**Acceptance Criteria:**
${criteriaResult.split('\n').map(line => '  ' + line).join('\n')}

**Security Review:**
${securityResult.split('\n').map(line => '  ' + line).join('\n')}

**Decision:** ${decision}
`;
    
    // Remove old QA Results if exists
    content = content.replace(/## QA Results[\s\S]*?(?=##[^#]|$)/, '');
    
    // Add new QA Results
    content += qaResults;
    
    // Write back
    fs.writeFileSync(storyFile, content, 'utf8');
    console.log(`\n📄 Updated story file: ${storyFile}`);
}

// CLI
if (require.main === module) {
    const storyFile = process.argv[2];
    
    if (!storyFile) {
        console.error('Usage: node qa-review-bridge.js <story-file>');
        process.exit(1);
    }
    
    if (!fs.existsSync(storyFile)) {
        console.error(`Story file not found: ${storyFile}`);
        process.exit(1);
    }
    
    reviewStory(storyFile);
}

module.exports = { runClaude, reviewStory };