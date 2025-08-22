#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function checkTestNaming() {
  console.log('Checking test file naming conventions...');
  
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  const results = [];
  
  for (const dir of testDirs) {
    const testPath = path.join(__dirname, '..', '..', dir);
    
    if (await fs.stat(testPath).catch(() => false)) {
      await scanDirectory(testPath, results);
    }
  }
  
  // Check results
  const violations = results.filter(r => !r.valid);
  
  if (violations.length > 0) {
    console.error(`✗ ${violations.length} test files missing story IDs:`);
    violations.forEach(v => {
      console.error(`  - ${v.file}`);
    });
    return { success: false, violations };
  }
  
  console.log(`✓ All ${results.length} test files include story IDs`);
  return { success: true, results };
}

async function scanDirectory(dir, results) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await scanDirectory(fullPath, results);
    } else if (entry.isFile() && entry.name.includes('test')) {
      // Check if filename or content includes story ID
      const hasStoryInName = /AH-\d+|STORY-\d+/.test(entry.name);
      
      if (!hasStoryInName) {
        // Check file content for story reference
        const content = await fs.readFile(fullPath, 'utf-8');
        const hasStoryInContent = /AH-\d+|STORY-\d+|@story/.test(content);
        
        results.push({
          file: fullPath,
          valid: hasStoryInContent,
          method: hasStoryInContent ? 'content' : 'none'
        });
      } else {
        results.push({
          file: fullPath,
          valid: true,
          method: 'filename'
        });
      }
    }
  }
}

if (require.main === module) {
  checkTestNaming().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { checkTestNaming };
