class YamlParser {
  async extractSymbols(content, filePath) {
    // YAML files typically don't export symbols
    return [];
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract file path references in YAML values
    const filePathRegex = /\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*(['"]?)([^\s'"]+\.[a-zA-Z]+)\1/g;
    let match;
    
    while ((match = filePathRegex.exec(content)) !== null) {
      const filePath = match[2];
      
      // Skip URLs and absolute paths
      if (!filePath.startsWith('http') && !filePath.startsWith('/') && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'yaml-value'
        });
      }
    }
    
    // Extract path arrays
    const pathArrayRegex = /\s*-\s*(['"]?)([^\s'"]+\.[a-zA-Z]+)\1/g;
    
    while ((match = pathArrayRegex.exec(content)) !== null) {
      const filePath = match[2];
      
      if (!filePath.startsWith('http') && !filePath.startsWith('/') && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'yaml-array'
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

module.exports = new YamlParser();
