// Simplified dependency analyzer - Qdrant functionality removed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

// In-memory storage for dependencies (simplified implementation)
const dependencyStore = new Map();

/**
 * Store symbol dependency information (simplified - no vector DB)
 * @param {Object} dependency - Dependency information
 */
async function storeSymbolDependency(dependency) {
  try {
    const key = `${dependency.projectId}:${dependency.filePath}:${dependency.symbol}`;
    dependencyStore.set(key, dependency);
    logger.debug(`Stored dependency: ${key}`);
    return true;
  } catch (error) {
    logger.error('Error storing dependency:', error);
    return false;
  }
}

/**
 * Remove all symbols for a specific file (simplified)
 * @param {string} projectId - Project identifier
 * @param {string} filePath - Path to the file
 */
async function removeFileSymbols(projectId, filePath) {
  try {
    const keysToDelete = [];
    for (const key of dependencyStore.keys()) {
      if (key.startsWith(`${projectId}:${filePath}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => dependencyStore.delete(key));
    logger.debug(`Removed ${keysToDelete.length} symbols for file: ${filePath}`);
    return keysToDelete.length;
  } catch (error) {
    logger.error('Error removing file symbols:', error);
    return 0;
  }
}

/**
 * Query symbols that would be impacted by changes (simplified)
 * @param {string} projectId - Project identifier
 * @param {Array<Object>} changedSymbols - List of changed symbols
 * @returns {Array} List of impacted symbols
 */
async function queryImpactedSymbols(projectId, changedSymbols) {
  try {
    const impactedSymbols = [];
    
    // Simple implementation: find symbols that import the changed symbols
    for (const [key, dependency] of dependencyStore.entries()) {
      if (!key.startsWith(`${projectId}:`)) continue;
      
      for (const changedSymbol of changedSymbols) {
        if (dependency.imports && dependency.imports.includes(changedSymbol.symbol)) {
          impactedSymbols.push({
            symbol: dependency.symbol,
            filePath: dependency.filePath,
            type: dependency.type,
            impactType: 'import',
            changedSymbol: changedSymbol.symbol
          });
        }
      }
    }
    
    return impactedSymbols;
  } catch (error) {
    logger.error('Error querying impacted symbols:', error);
    return [];
  }
}

/**
 * Query all symbols in a specific file (simplified)
 * @param {string} projectId - Project identifier
 * @param {string} filePath - Path to the file
 * @returns {Array} List of symbols in the file
 */
async function querySymbolsInFile(projectId, filePath) {
  try {
    const symbols = [];
    
    for (const [key, dependency] of dependencyStore.entries()) {
      if (key.startsWith(`${projectId}:${filePath}:`)) {
        symbols.push({
          symbol: dependency.symbol,
          type: dependency.type,
          exports: dependency.exports || [],
          imports: dependency.imports || []
        });
      }
    }
    
    return symbols;
  } catch (error) {
    logger.error('Error querying symbols in file:', error);
    return [];
  }
}

/**
 * Search for symbols by query (simplified)
 * @param {string} projectId - Project identifier
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Array} List of matching symbols
 */
async function searchSymbols(projectId, query, options = {}) {
  try {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const [key, dependency] of dependencyStore.entries()) {
      if (!key.startsWith(`${projectId}:`)) continue;
      
      if (dependency.symbol.toLowerCase().includes(lowerQuery)) {
        results.push({
          symbol: dependency.symbol,
          filePath: dependency.filePath,
          type: dependency.type,
          score: 1.0 // Simplified scoring
        });
      }
    }
    
    // Apply limit if specified
    if (options.limit && results.length > options.limit) {
      results.length = options.limit;
    }
    
    return results;
  } catch (error) {
    logger.error('Error searching symbols:', error);
    return [];
  }
}

/**
 * Get dependency statistics (simplified)
 * @param {string} projectId - Project identifier
 * @returns {Object} Statistics about stored dependencies
 */
async function getDependencyStats(projectId) {
  try {
    let fileCount = new Set();
    let symbolCount = 0;
    let importCount = 0;
    let exportCount = 0;
    
    for (const [key, dependency] of dependencyStore.entries()) {
      if (!key.startsWith(`${projectId}:`)) continue;
      
      fileCount.add(dependency.filePath);
      symbolCount++;
      importCount += (dependency.imports || []).length;
      exportCount += (dependency.exports || []).length;
    }
    
    return {
      files: fileCount.size,
      symbols: symbolCount,
      imports: importCount,
      exports: exportCount,
      storageType: 'in-memory'
    };
  } catch (error) {
    logger.error('Error getting dependency stats:', error);
    return {
      files: 0,
      symbols: 0,
      imports: 0,
      exports: 0,
      storageType: 'in-memory',
      error: error.message
    };
  }
}

/**
 * Initialize dependency storage (simplified - no-op for in-memory)
 * @param {boolean} recreate - Whether to recreate storage
 */
async function initializeDependencyStorage(recreate = false) {
  try {
    if (recreate) {
      dependencyStore.clear();
      logger.info('Cleared in-memory dependency storage');
    }
    logger.info('Dependency storage initialized (in-memory mode)');
    return true;
  } catch (error) {
    logger.error('Error initializing dependency storage:', error);
    return false;
  }
}

module.exports = {
  storeSymbolDependency,
  removeFileSymbols,
  queryImpactedSymbols,
  querySymbolsInFile,
  searchSymbols,
  getDependencyStats,
  initializeDependencyStorage
};