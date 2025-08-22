#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function checkFileExists(filePath, baseDir) {
  const fullPath = path.join(baseDir, filePath);
  try {
    await fs.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function extractReferences(patchPlan) {
  const references = {
    files: new Set(),
    symbols: new Set()
  };
  
  if (patchPlan.changes) {
    for (const change of patchPlan.changes) {
      if (change.path) {
        references.files.add(change.path);
      }
      if (change.symbols) {
        change.symbols.forEach(s => references.symbols.add(s));
      }
    }
  }
  
  return references;
}

async function runGroundingCheck(patchPlanPath, bundlePath) {
  console.log('Running grounding check...');
  
  try {
    // Load patch plan
    const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
    
    // Load bundle if exists
    let bundle = null;
    if (bundlePath && await fs.stat(bundlePath).catch(() => false)) {
      bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
    }
    
    // Extract references
    const references = await extractReferences(patchPlan);
    
    // Check grounding
    const projectRoot = path.join(__dirname, '..', '..');
    const ungrounded = {
      files: [],
      symbols: []
    };
    
    // Check file references
    for (const file of references.files) {
      const exists = await checkFileExists(file, projectRoot);
      const inBundle = bundle?.files?.some(f => f.path === file);
      
      if (!exists && !inBundle) {
        ungrounded.files.push(file);
      }
    }
    
    // Check symbol references (simplified)
    const indexPath = path.join(projectRoot, '.ai', 'index', 'symbols.map.json');
    if (await fs.stat(indexPath).catch(() => false)) {
      const symbolMap = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      
      for (const symbol of references.symbols) {
        if (!symbolMap[symbol]) {
          ungrounded.symbols.push(symbol);
        }
      }
    }
    
    // Report results
    if (ungrounded.files.length > 0 || ungrounded.symbols.length > 0) {
      console.error('✗ Ungrounded references detected:');
      if (ungrounded.files.length > 0) {
        console.error('  Files:', ungrounded.files);
      }
      if (ungrounded.symbols.length > 0) {
        console.error('  Symbols:', ungrounded.symbols);
      }
      return { success: false, ungrounded };
    }
    
    console.log('✓ All references are grounded');
    return { success: true };
    
  } catch (error) {
    console.error('Grounding check failed:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  const patchPlanPath = process.argv[2];
  const bundlePath = process.argv[3];
  
  if (!patchPlanPath) {
    console.error('Usage: node grounding-check.js <patch-plan.json> [bundle.json]');
    process.exit(1);
  }
  
  runGroundingCheck(patchPlanPath, bundlePath).then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runGroundingCheck };
