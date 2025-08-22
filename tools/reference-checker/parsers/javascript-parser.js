const path = require('path');

class JavaScriptParser {
  async extractSymbols(content, filePath) {
    const symbols = [];
    
    // Extract function declarations
    const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    // Extract arrow functions assigned to variables
    const arrowFunctionRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>/g;
    
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    // Extract class declarations
    const classRegex = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+[a-zA-Z_$][a-zA-Z0-9_$]*)?\s*\{/g;
    
    while ((match = classRegex.exec(content)) !== null) {
      symbols.push(`${filePath}:${match[1]}`);
    }
    
    // Extract exports
    const exportRegex = /module\.exports\s*=\s*\{([^}]+)\}/g;
    
    while ((match = exportRegex.exec(content)) !== null) {
      const exportContent = match[1];
      const exportedNames = exportContent.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
      
      if (exportedNames) {
        exportedNames.forEach(name => {
          symbols.push(`${filePath}:${name}`);
        });
      }
    }
    
    return symbols;
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    
    while ((match = requireRegex.exec(content)) !== null) {
      references.push({
        type: 'import',
        module: match[1],
        line: this.getLineNumber(content, match.index),
        identifier: null
      });
    }
    
    // Extract destructured requires
    const destructureRequireRegex = /const\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    while ((match = destructureRequireRegex.exec(content)) !== null) {
      const identifiers = match[1].split(',').map(id => id.trim());
      
      identifiers.forEach(identifier => {
        references.push({
          type: 'import',
          module: match[2],
          identifier: identifier,
          line: this.getLineNumber(content, match.index)
        });
      });
    }
    
    // Extract ES6 imports
    const importRegex = /import\s+(?:\{([^}]+)\}\s+from\s+|([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+|\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+)['"]([^'"]+)['"]/g;
    
    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1];
      const defaultImport = match[2];
      const namespaceImport = match[3];
      const module = match[4];
      
      if (namedImports) {
        const identifiers = namedImports.split(',').map(id => id.trim());
        identifiers.forEach(identifier => {
          references.push({
            type: 'import',
            module: module,
            identifier: identifier,
            line: this.getLineNumber(content, match.index)
          });
        });
      } else if (defaultImport) {
        references.push({
          type: 'import',
          module: module,
          identifier: defaultImport,
          line: this.getLineNumber(content, match.index)
        });
      } else if (namespaceImport) {
        references.push({
          type: 'import',
          module: module,
          identifier: namespaceImport,
          line: this.getLineNumber(content, match.index)
        });
      }
    }
    
    // Extract function calls
    const functionCallRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    
    while ((match = functionCallRegex.exec(content)) !== null) {
      // Skip common keywords
      const identifier = match[1];
      if (!['if', 'for', 'while', 'switch', 'function', 'class', 'const', 'let', 'var'].includes(identifier)) {
        references.push({
          type: 'function',
          identifier: identifier,
          line: this.getLineNumber(content, match.index)
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

module.exports = new JavaScriptParser();
