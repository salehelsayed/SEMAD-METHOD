#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function retrieveContext(query, options = {}) {
  const { topN = 5, bundleId = null, useEmbeddings = false } = options;
  
  console.log(`Retrieving context for query: "${query}"`);
  
  // Load index
  const indexPath = path.join(__dirname, '..', '..', '.ai', 'index', 'artifacts.index.json');
  const symbolMapPath = path.join(__dirname, '..', '..', '.ai', 'index', 'symbols.map.json');
  
  const results = [];
  
  try {
    const index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    const symbolMap = JSON.parse(await fs.readFile(symbolMapPath, 'utf-8'));
    
    // If bundle specified, filter to bundle files
    let searchSpace = index.files;
    if (bundleId) {
      const bundlePath = path.join(__dirname, '..', '..', '.ai', 'bundles', `${bundleId}.bundle.json`);
      const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
      const bundleFiles = bundle.files.map(f => f.path);
      searchSpace = index.files.filter(f => bundleFiles.includes(f.path));
    }
    
    // Simple keyword matching (would use embeddings in production)
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    for (const file of searchSpace) {
      let score = 0;
      
      // Check path relevance
      const pathLower = file.path.toLowerCase();
      queryTerms.forEach(term => {
        if (pathLower.includes(term)) score += 2;
      });
      
      // Check symbol relevance
      if (file.symbols) {
        const allSymbols = [
          ...file.symbols.functions,
          ...file.symbols.classes,
          ...file.symbols.exports
        ].map(s => s.toLowerCase());
        
        queryTerms.forEach(term => {
          allSymbols.forEach(symbol => {
            if (symbol.includes(term)) score += 3;
          });
        });
      }
      
      if (score > 0) {
        results.push({
          path: file.path,
          type: file.type,
          score,
          checksum: file.checksum,
          symbols: file.symbols
        });
      }
    }
    
    // Sort by score and return top N
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topN);
    
    // Load actual content snippets
    const snippets = [];
    for (const result of topResults) {
      const filePath = path.join(__dirname, '..', '..', result.path);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Find most relevant lines (simple approach)
        const relevantLines = [];
        lines.forEach((line, idx) => {
          const lineLower = line.toLowerCase();
          if (queryTerms.some(term => lineLower.includes(term))) {
            relevantLines.push({
              lineNumber: idx + 1,
              content: line,
              context: lines.slice(Math.max(0, idx - 2), idx + 3).join('\n')
            });
          }
        });
        
        snippets.push({
          ...result,
          snippets: relevantLines.slice(0, 3) // Top 3 relevant snippets per file
        });
        
      } catch (error) {
        console.error(`Failed to read ${result.path}: ${error.message}`);
      }
    }
    
    return {
      query,
      topN,
      bundleId,
      results: snippets,
      totalMatches: results.length
    };
    
  } catch (error) {
    console.error(`Retrieval failed: ${error.message}`);
    return {
      query,
      error: error.message,
      results: []
    };
  }
}

// CLI interface
if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.error('Usage: node retrieve-context.js <search query>');
    process.exit(1);
  }
  
  retrieveContext(query, { topN: 10 }).then(results => {
    console.log(`\nFound ${results.totalMatches} matches, showing top ${results.results.length}:\n`);
    
    results.results.forEach((result, idx) => {
      console.log(`${idx + 1}. ${result.path} (score: ${result.score})`);
      if (result.snippets && result.snippets.length > 0) {
        result.snippets.forEach(snippet => {
          console.log(`   Line ${snippet.lineNumber}: ${snippet.content.trim()}`);
        });
      }
      console.log();
    });
  });
}

module.exports = { retrieveContext };
