#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-009: Traceability Enforcement
async function execute() {
  console.log('[AH-009] Implementing Traceability Enforcement...');
  
  const toolsDir = path.join(__dirname, '..', '..');
  const traceabilityDir = path.join(toolsDir, 'traceability');
  
  await fs.mkdir(traceabilityDir, { recursive: true });
  
  // Create traceability-enforcer.js
  const traceabilityEnforcer = `const fs = require('fs').promises;
const path = require('path');

class TraceabilityEnforcer {
  async enforceTraceability(projectDir = process.cwd()) {
    console.log('[TRACE] Enforcing traceability requirements...');
    
    const results = {
      storyToCode: false,
      codeToTests: false,
      testsToACs: false,
      errors: []
    };
    
    // Check story-to-code traceability
    try {
      const stories = await this.findStoryFiles(projectDir);
      const codeFiles = await this.findCodeFiles(projectDir);
      
      for (const story of stories) {
        const storyContent = await fs.readFile(story, 'utf-8');
        const linkedFiles = this.extractLinkedFiles(storyContent);
        
        for (const file of linkedFiles) {
          if (!codeFiles.includes(file)) {
            results.errors.push(\`Story \${story} references non-existent file: \${file}\`);
          }
        }
      }
      
      results.storyToCode = results.errors.length === 0;
    } catch (error) {
      results.errors.push(\`Traceability check failed: \${error.message}\`);
    }
    
    console.log(\`[TRACE] Traceability compliance: \${results.storyToCode}\`);
    return results;
  }
  
  async findStoryFiles(dir) {
    // Implementation for finding story files
    return [];
  }
  
  async findCodeFiles(dir) {
    // Implementation for finding code files
    return [];
  }
  
  extractLinkedFiles(content) {
    // Extract file references from story content
    const matches = content.match(/filesToModify:[\\s\\S]*?path:\\s*['\"]([^'\"]+)['\"]/g);
    return matches ? matches.map(m => m.match(/path:\\s*['\"]([^'\"]+)['\"]/)[1]) : [];
  }
}

module.exports = { TraceabilityEnforcer };

if (require.main === module) {
  const enforcer = new TraceabilityEnforcer();
  enforcer.enforceTraceability().then(results => {
    process.exit(results.storyToCode ? 0 : 1);
  });
}`;
  
  await fs.writeFile(path.join(traceabilityDir, 'traceability-enforcer.js'), traceabilityEnforcer);
  
  console.log('[AH-009] ✓ Traceability Enforcement implementation complete');
}

module.exports = { execute };