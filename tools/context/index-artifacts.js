#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function indexDirectory(dirPath, baseDir = '') {
  const index = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(baseDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        // Recursively index subdirectories
        const subIndex = await indexDirectory(fullPath, relativePath);
        index.push(...subIndex);
        
      } else if (entry.isFile()) {
        // Index relevant file types
        const ext = path.extname(entry.name);
        const relevantExts = ['.js', '.ts', '.jsx', '.tsx', '.md', '.yaml', '.yml', '.json'];
        
        if (relevantExts.includes(ext)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const checksum = crypto.createHash('sha256').update(content).digest('hex');
          
          // Extract symbols for code files
          const symbols = extractSymbols(content, ext);
          
          index.push({
            path: relativePath,
            type: ext.substring(1),
            size: content.length,
            checksum,
            symbols,
            indexed: new Date().toISOString()
          });
        }
      }
    }
    
  } catch (error) {
    console.error(`Error indexing ${dirPath}: ${error.message}`);
  }
  
  return index;
}

function extractSymbols(content, extension) {
  const symbols = {
    functions: [],
    classes: [],
    exports: [],
    imports: []
  };
  
  if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
    // Extract function names
    const functionRegex = /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*)?(?:\([^)]*\)\s*=>|function)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.functions.push(match[1]);
    }
    
    // Extract class names
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.classes.push(match[1]);
    }
    
    // Extract exports
    const exportRegex = /export\s+(?:default\s+)?(\w+)|export\s*{([^}]+)}/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
        symbols.exports.push(match[1]);
      } else if (match[2]) {
        symbols.exports.push(...match[2].split(',').map(e => e.trim()));
      }
    }
    
    // Extract imports
    const importRegex = /import\s+(?:{([^}]+)}|([\w*]+))\s+from/g;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        symbols.imports.push(...match[1].split(',').map(i => i.trim()));
      } else if (match[2]) {
        symbols.imports.push(match[2]);
      }
    }
  }
  
  return symbols;
}

async function buildIndex() {
  console.log('Building artifact index...');
  
  const projectRoot = path.join(__dirname, '..', '..');
  const index = [];
  
  // Index key directories
  const dirsToIndex = [
    'bmad-core',
    'docs',
    'tools',
    'scripts'
  ];
  
  for (const dir of dirsToIndex) {
    const dirPath = path.join(projectRoot, dir);
    if (await fs.stat(dirPath).catch(() => false)) {
      console.log(`Indexing ${dir}...`);
      const dirIndex = await indexDirectory(dirPath, dir);
      index.push(...dirIndex);
    }
  }
  
  // Save index
  const indexDir = path.join(projectRoot, '.ai', 'index');
  await fs.mkdir(indexDir, { recursive: true });
  
  const indexPath = path.join(indexDir, 'artifacts.index.json');
  await fs.writeFile(indexPath, JSON.stringify({
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    totalFiles: index.length,
    files: index
  }, null, 2));
  
  console.log(`✓ Index created with ${index.length} files: ${indexPath}`);
  
  // Create symbol map for quick lookups
  const symbolMap = {};
  
  for (const file of index) {
    if (file.symbols) {
      for (const func of file.symbols.functions) {
        symbolMap[func] = symbolMap[func] || [];
        symbolMap[func].push(file.path);
      }
      for (const cls of file.symbols.classes) {
        symbolMap[cls] = symbolMap[cls] || [];
        symbolMap[cls].push(file.path);
      }
    }
  }
  
  const symbolMapPath = path.join(indexDir, 'symbols.map.json');
  await fs.writeFile(symbolMapPath, JSON.stringify(symbolMap, null, 2));
  
  console.log(`✓ Symbol map created: ${symbolMapPath}`);
}

// Main execution
if (require.main === module) {
  buildIndex().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { buildIndex, indexDirectory };
