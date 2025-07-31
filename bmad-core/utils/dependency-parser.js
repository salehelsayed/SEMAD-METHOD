const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Multi-language dependency parser that extracts symbols and their relationships
 * from source code files. Supports JavaScript, TypeScript, Python, Java, and more.
 */

/**
 * Parse JavaScript/TypeScript files for symbols and dependencies
 */
function parseJavaScript(content, filePath) {
  const symbols = [];
  const lines = content.split('\n');
  
  // Patterns for different symbol types
  const patterns = {
    // Function declarations
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/,
    // Arrow functions
    arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,
    // Class declarations
    class: /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/,
    // Method definitions
    method: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/,
    // Variable declarations
    variable: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/,
    // Import statements
    import: /^import\s+(?:{[^}]+}|\w+|[*]\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/,
    // Require statements
    require: /^(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/
  };
  
  const dependencies = new Set();
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    const lineNumber = index + 1;
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || !trimmedLine) {
      return;
    }
    
    // Check for imports/requires (dependencies)
    const importMatch = trimmedLine.match(patterns.import);
    const requireMatch = trimmedLine.match(patterns.require);
    
    if (importMatch) {
      dependencies.add(importMatch[1]);
    }
    if (requireMatch) {
      dependencies.add(requireMatch[1]);
    }
    
    // Check for symbol definitions with enhanced validation
    Object.entries(patterns).forEach(([type, pattern]) => {
      if (type === 'import' || type === 'require') return;
      
      const match = trimmedLine.match(pattern);
      if (match && match[1]) {
        const symbolName = match[1];
        const signature = trimmedLine;
        
        // Skip if symbol name is a reserved word or invalid identifier
        if (isValidJSIdentifier(symbolName)) {
          symbols.push({
            symbolName,
            symbolType: type === 'arrowFunction' ? 'function' : type,
            filePath,
            lineNumber,
            scope: determineScope(line),
            signature: signature.replace(/\s+/g, ' ').trim(), // Normalize whitespace
            dependencies: Array.from(dependencies),
            dependents: [] // Will be populated during relationship analysis
          });
        }
      }
    });
  });
  
  return symbols;
}

/**
 * Parse Python files for symbols and dependencies
 */
function parsePython(content, filePath) {
  const symbols = [];
  const lines = content.split('\n');
  const dependencies = new Set();
  
  const patterns = {
    function: /^(?:\s*)def\s+(\w+)\s*\([^)]*\):/,
    class: /^(?:\s*)class\s+(\w+)(?:\([^)]*\))?:/,
    variable: /^(?:\s*)(\w+)\s*=/,
    import: /^(?:\s*)(?:from\s+(\S+)\s+)?import\s+(.+)/
  };
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    const lineNumber = index + 1;
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('#') || !trimmedLine) {
      return;
    }
    
    // Check for imports
    const importMatch = trimmedLine.match(patterns.import);
    if (importMatch) {
      if (importMatch[1]) {
        dependencies.add(importMatch[1]); // from module import
      }
      const imports = importMatch[2].split(',').map(imp => imp.trim());
      imports.forEach(imp => dependencies.add(imp));
    }
    
    // Check for symbol definitions
    Object.entries(patterns).forEach(([type, pattern]) => {
      if (type === 'import') return;
      
      const match = trimmedLine.match(pattern);
      if (match) {
        const symbolName = match[1];
        const signature = trimmedLine;
        
        symbols.push({
          symbolName,
          symbolType: type,
          filePath,
          lineNumber,
          scope: determineScope(line),
          signature,
          dependencies: Array.from(dependencies),
          dependents: []
        });
      }
    });
  });
  
  return symbols;
}

/**
 * Parse Java files for symbols and dependencies
 */
function parseJava(content, filePath) {
  const symbols = [];
  const lines = content.split('\n');
  const dependencies = new Set();
  
  const patterns = {
    class: /^(?:\s*)(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)/,
    method: /^(?:\s*)(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*{/,
    variable: /^(?:\s*)(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+)?(?:\w+\s+)?(\w+)\s*[=;]/,
    import: /^import\s+(?:static\s+)?([^;]+);/
  };
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    const lineNumber = index + 1;
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || !trimmedLine) {
      return;
    }
    
    // Check for imports
    const importMatch = trimmedLine.match(patterns.import);
    if (importMatch) {
      dependencies.add(importMatch[1]);
    }
    
    // Check for symbol definitions
    Object.entries(patterns).forEach(([type, pattern]) => {
      if (type === 'import') return;
      
      const match = trimmedLine.match(pattern);
      if (match) {
        const symbolName = match[1];
        const signature = trimmedLine;
        
        symbols.push({
          symbolName,
          symbolType: type,
          filePath,
          lineNumber,
          scope: determineScope(line),
          signature,
          dependencies: Array.from(dependencies),
          dependents: []
        });
      }
    });
  });
  
  return symbols;
}

/**
 * Determine the scope of a symbol based on indentation
 */
function determineScope(line) {
  const leadingSpaces = line.length - line.trimLeft().length;
  if (leadingSpaces === 0) {
    return 'global';
  } else if (leadingSpaces <= 4) {
    return 'module';
  } else {
    return 'local';
  }
}

/**
 * Parse a file and extract symbols based on file extension
 */
function parseFile(filePath, content = null) {
  try {
    // Read file content if not provided
    if (!content) {
      if (!fs.existsSync(filePath)) {
        const error = new Error(`File not found: ${filePath}`);
        error.code = 'FILE_NOT_FOUND';
        error.context = { filePath };
        throw error;
      }
      
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        const contextError = new Error(`Failed to read file '${filePath}': ${error.message}`);
        contextError.originalError = error;
        contextError.code = 'FILE_READ_ERROR';
        contextError.context = { filePath };
        throw contextError;
      }
    }
    
    // Calculate file hash for change detection
    const fileHash = crypto.createHash('md5').update(content).digest('hex');
    
    const ext = path.extname(filePath).toLowerCase();
    let symbols = [];
    
    switch (ext) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        symbols = parseJavaScript(content, filePath);
        break;
      case '.py':
        symbols = parsePython(content, filePath);
        break;
      case '.java':
        symbols = parseJava(content, filePath);
        break;
      default:
        // For unsupported file types, just extract basic info
        const warning = `Unsupported file type '${ext}' for file '${filePath}'`;
        console.warn(warning);
        return { 
          symbols: [], 
          fileHash,
          warning,
          supported: false
        };
    }
    
    // Add file hash to all symbols
    symbols.forEach(symbol => {
      symbol.fileHash = fileHash;
    });
    
    return { symbols, fileHash };
  } catch (error) {
    const contextError = new Error(`Critical parsing error for file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { 
      filePath, 
      fileExtension: path.extname(filePath),
      hasContent: !!content,
      contentLength: content ? content.length : 0
    };
    console.error(contextError.message);
    
    return { 
      symbols: [], 
      fileHash: null, 
      error: contextError.message,
      context: contextError.context
    };
  }
}

/**
 * Analyze cross-file dependencies by finding references between symbols
 */
function analyzeCrossFileDependencies(allSymbols) {
  // Create a map of symbol names to their definitions
  const symbolMap = new Map();
  
  allSymbols.forEach(symbol => {
    const key = `${symbol.filePath}:${symbol.symbolName}`;
    symbolMap.set(key, symbol);
    // Also map by just symbol name for quick lookup
    if (!symbolMap.has(symbol.symbolName)) {
      symbolMap.set(symbol.symbolName, []);
    }
    symbolMap.get(symbol.symbolName).push(symbol);
  });
  
  // For each symbol, find what it depends on and what depends on it
  allSymbols.forEach(symbol => {
    // Look for references to other symbols in the same file
    // This is a simplified approach - a full AST parser would be more accurate
    const fileSymbols = allSymbols.filter(s => s.filePath === symbol.filePath);
    
    fileSymbols.forEach(otherSymbol => {
      if (otherSymbol.symbolName !== symbol.symbolName) {
        // Check if this symbol's signature references the other symbol
        if (symbol.signature.includes(otherSymbol.symbolName)) {
          if (!symbol.dependencies.includes(`${otherSymbol.filePath}:${otherSymbol.symbolName}`)) {
            symbol.dependencies.push(`${otherSymbol.filePath}:${otherSymbol.symbolName}`);
          }
          if (!otherSymbol.dependents.includes(`${symbol.filePath}:${symbol.symbolName}`)) {
            otherSymbol.dependents.push(`${symbol.filePath}:${symbol.symbolName}`);
          }
        }
      }
    });
  });
  
  return allSymbols;
}

/**
 * Get all supported file extensions
 */
function getSupportedExtensions() {
  return ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.kt', '.scala', '.go', '.rs', '.cpp', '.c', '.h', '.hpp'];
}

/**
 * Check if a file is supported for dependency analysis
 */
function isFileSupported(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return getSupportedExtensions().includes(ext);
}

module.exports = {
  parseFile,
  parseJavaScript,
  parsePython,
  parseJava,
  analyzeCrossFileDependencies,
  getSupportedExtensions,
  isFileSupported
};