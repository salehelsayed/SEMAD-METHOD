class MarkdownParser {
  async extractSymbols(content, filePath) {
    // Markdown files typically don't export symbols
    return [];
  }

  async extractReferences(content, filePath) {
    const references = [];
    
    // Extract file links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      
      // Only check local file references
      if (!url.startsWith('http') && !url.startsWith('#')) {
        references.push({
          type: 'file',
          path: url,
          line: this.getLineNumber(content, match.index),
          description: match[1]
        });
      }
    }
    
    // Extract code fence file references
    const codeFenceRegex = /```[a-zA-Z]*\s*([^\n]*\.\w+)\s*\n/g;
    
    while ((match = codeFenceRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      
      if (filePath && filePath.includes('.')) {
        references.push({
          type: 'file',
          path: filePath,
          line: this.getLineNumber(content, match.index),
          context: 'code-fence'
        });
      }
    }
    
    // Extract image references
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    
    while ((match = imageRegex.exec(content)) !== null) {
      const imagePath = match[2];
      
      if (!imagePath.startsWith('http')) {
        references.push({
          type: 'file',
          path: imagePath,
          line: this.getLineNumber(content, match.index),
          context: 'image'
        });
      }
    }
    
    return references;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

module.exports = new MarkdownParser();
