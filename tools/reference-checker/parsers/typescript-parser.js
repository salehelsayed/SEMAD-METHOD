const JavaScriptParser = require('./javascript-parser');

class TypeScriptParser extends JavaScriptParser.constructor {
  async extractSymbols(content, filePath) {
    const symbols = await super.extractSymbols(content, filePath);
    
    // Extract TypeScript interfaces
    const interfaceRegex = /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+[^{]+)?\s*\{/g;
    let match;
    
    while ((match = interfaceRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    // Extract TypeScript types
    const typeRegex = /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    
    while ((match = typeRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    // Extract enums
    const enumRegex = /enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\{/g;
    
    while ((match = enumRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    return symbols;
  }

  async extractReferences(content, filePath) {
    const references = await super.extractReferences(content, filePath);
    
    // Extract type imports
    const typeImportRegex = /import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = typeImportRegex.exec(content)) !== null) {
      const types = match[1].split(',').map(t => t.trim());
      
      types.forEach(type => {
        references.push({
          type: 'import',
          module: match[2],
          identifier: type,
          typeOnly: true,
          line: this.getLineNumber(content, match.index)
        });
      });
    }
    
    return references;
  }
}

module.exports = new TypeScriptParser();
