const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

// Qdrant configuration from environment variables
const QDRANT_CONFIG = {
  host: process.env.QDRANT_HOST || 'localhost',
  port: parseInt(process.env.QDRANT_PORT) || 6333,
  apiKey: process.env.QDRANT_API_KEY, // Optional for cloud instances
  timeout: parseInt(process.env.QDRANT_TIMEOUT) || 30000
};

// Initialize Qdrant client with configurable options
const createQdrantClient = () => {
  const config = { 
    host: QDRANT_CONFIG.host, 
    port: QDRANT_CONFIG.port,
    timeout: QDRANT_CONFIG.timeout
  };
  
  // Add API key if provided (for Qdrant Cloud)
  if (QDRANT_CONFIG.apiKey) {
    config.apiKey = QDRANT_CONFIG.apiKey;
  }
  
  return new QdrantClient(config);
};

let client = null;

// Lazy initialization of client
const getClient = () => {
  if (!client) {
    try {
      client = createQdrantClient();
    } catch (error) {
      throw new Error(`Failed to initialize Qdrant client: ${error.message}. Please check your Qdrant configuration.`);
    }
  }
  return client;
};

// Configuration constants\nconst CONFIG = {\n  DEFAULT_SEARCH_LIMIT: 100,\n  OPENAI_MAX_TOKENS: 8192,\n  HASH_BYTES_FOR_EMBEDDING: {\n    PRIMARY: 0,\n    SECONDARY: 16, \n    TERTIARY: 32\n  },\n  HASH_WEIGHTS: {\n    PRIMARY: 0.5,\n    SECONDARY: 0.3,\n    TERTIARY: 0.2\n  },\n  NORMALIZATION_OFFSET: 128\n};\n\n// Dependency collection configuration
const DEPENDENCY_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'bmad_code_dependencies';
const DEPENDENCY_VECTOR_SIZE = parseInt(process.env.QDRANT_VECTOR_SIZE) || 384;

/**
 * Schema for dependency information stored in Qdrant:
 * 
 * Point Structure:
 * - id: hash of symbol identifier (file_path:symbol_name)
 * - vector: embedding of symbol description/context
 * - payload: {
 *     symbolName: string,          // Function/class/variable name
 *     symbolType: string,          // 'function', 'class', 'method', 'variable', 'import', 'export'
 *     filePath: string,            // Relative path from repo root
 *     lineNumber: number,          // Line where symbol is defined
 *     dependencies: string[],      // Array of symbols this depends on
 *     dependents: string[],        // Array of symbols that depend on this
 *     scope: string,               // 'global', 'local', 'module'
 *     signature: string,           // Function signature or class definition
 *     description: string,         // Auto-generated description for embedding
 *     lastModified: string,        // ISO timestamp of last analysis
 *     fileHash: string             // Hash of file content when analyzed
 *   }
 */

/**
 * Ensure the dependency collection exists with proper configuration
 */
async function ensureDependencyCollection() {
  try {
    const qdrantClient = getClient();
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === DEPENDENCY_COLLECTION);
    
    if (!exists) {
      await qdrantClient.createCollection(DEPENDENCY_COLLECTION, {
        vectors: {
          size: DEPENDENCY_VECTOR_SIZE,
          distance: 'Cosine'
        }
      });
      logger.info(`Created dependency collection: ${DEPENDENCY_COLLECTION}`, 'QDRANT_SETUP');
    }
  } catch (error) {
    const errorMessage = `Dependency collection initialization failed: ${error.message}. Please ensure Qdrant is running at ${QDRANT_CONFIG.host}:${QDRANT_CONFIG.port}`;
    logger.error(errorMessage, 'QDRANT_INIT');
    throw new Error(errorMessage);
  }
}

/**
 * Generate embedding for symbol description
 * Uses OpenAI embeddings if available, falls back to hash-based approach
 */
async function generateSymbolEmbedding(text) {
  try {
    // Try OpenAI embeddings first if API key is available
    if (process.env.OPENAI_API_KEY) {
      return await generateOpenAIEmbedding(text);
    }
  } catch (error) {
    logger.warn(`OpenAI embedding failed, falling back to hash-based approach: ${error.message}`, 'EMBEDDING');
  }
  
  // Fallback to hash-based embedding
  return generateHashBasedEmbedding(text);
}

/**
 * Generate OpenAI embedding using text-embedding-3-small model
 */
async function generateOpenAIEmbedding(text) {
  try {
    const OpenAI = require('openai');
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text.substring(0, 8192), // Limit to model's max token length
      encoding_format: 'float',
      dimensions: DEPENDENCY_VECTOR_SIZE // Use the configured vector size
    });
    
    const embedding = response.data[0].embedding;
    
    // Ensure embedding matches expected size
    if (embedding.length !== DEPENDENCY_VECTOR_SIZE) {
      // Pad or truncate to match expected size
      if (embedding.length > DEPENDENCY_VECTOR_SIZE) {
        return embedding.slice(0, DEPENDENCY_VECTOR_SIZE);
      } else {
        const padded = [...embedding];
        while (padded.length < DEPENDENCY_VECTOR_SIZE) {
          padded.push(0);
        }
        return padded;
      }
    }
    
    return embedding;
  } catch (error) {
    throw new Error(`OpenAI embedding API failed: ${error.message}`);
  }
}

/**
 * Generate hash-based embedding as fallback
 */
function generateHashBasedEmbedding(text) {
  // Use SHA-256 hash for more deterministic results
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  
  // Create a more sophisticated hash-based embedding
  for (let i = 0; i < DEPENDENCY_VECTOR_SIZE; i++) {
    // Use multiple hash positions with different transformations
    const byte1 = hash[i % hash.length];
    const byte2 = hash[(i + 16) % hash.length];
    const byte3 = hash[(i + 32) % hash.length];
    
    // Combine bytes with different weights and normalize to [-1, 1]
    const combined = (byte1 * 0.5 + byte2 * 0.3 + byte3 * 0.2);
    embedding.push((combined - 128) / 128);
  }
  
  return embedding;
}

/**
 * Create a unique ID for a symbol based on file path and symbol name
 */
function createSymbolId(filePath, symbolName) {
  return crypto.createHash('md5').update(`${filePath}:${symbolName}`).digest('hex');
}

/**
 * Store or update a symbol's dependency information in Qdrant
 */
async function storeSymbolDependency(symbolInfo) {
  try {
    await ensureDependencyCollection();
    
    const {
      symbolName,
      symbolType,
      filePath,
      lineNumber,
      dependencies = [],
      dependents = [],
      scope,
      signature,
      fileHash
    } = symbolInfo;
    
    // Generate description for embedding
    const description = `${symbolType} ${symbolName} in ${filePath} at line ${lineNumber}. Signature: ${signature}`;
    
    const embedding = await generateSymbolEmbedding(description);
    const id = createSymbolId(filePath, symbolName);
    
    const qdrantClient = getClient();
    await qdrantClient.upsert(DEPENDENCY_COLLECTION, {
      wait: true,
      points: [
        {
          id,
          vector: embedding,
          payload: {
            symbolName,
            symbolType,
            filePath,
            lineNumber,
            dependencies,
            dependents,
            scope,
            signature,
            description,
            lastModified: new Date().toISOString(),
            fileHash
          }
        }
      ]
    });
    
    return id;
  } catch (error) {
    const contextError = new Error(`Failed to store symbol dependency '${symbolName}' in file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { symbolName, symbolType, filePath, lineNumber };
    logger.error(contextError.message, 'SYMBOL_STORE');
    throw contextError;
  }
}

/**
 * Query dependencies for symbols that might be impacted by changes to a file
 */
async function queryImpactedSymbols(filePath, symbolNames = []) {
  try {
    await ensureDependencyCollection();
    
    // Build filter for symbols that depend on the changed file or specific symbols
    const should = [
      // Find symbols that depend on this file
      {
        key: 'dependencies',
        match: { any: [filePath] }
      }
    ];
    
    // If specific symbols are provided, find their dependents
    if (symbolNames.length > 0) {
      symbolNames.forEach(symbolName => {
        should.push({
          key: 'dependencies',
          match: { any: [`${filePath}:${symbolName}`] }
        });
      });
    }
    
    const qdrantClient = getClient();
    const searchResult = await qdrantClient.scroll(DEPENDENCY_COLLECTION, {
      filter: {
        should
      },
      limit: 100,
      with_payload: true
    });
    
    return searchResult.points.map(point => ({
      id: point.id,
      ...point.payload
    }));
  } catch (error) {
    const contextError = new Error(`Failed to query impacted symbols for file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { filePath, symbolNames };
    logger.error(contextError.message, 'SYMBOL_STORE');
    // Return empty array but log the error for monitoring
    return [];
  }
}

/**
 * Query symbols defined in a specific file
 */
async function querySymbolsInFile(filePath) {
  try {
    await ensureDependencyCollection();
    
    const qdrantClient = getClient();
    const searchResult = await qdrantClient.scroll(DEPENDENCY_COLLECTION, {
      filter: {
        key: 'filePath',
        match: { value: filePath }
      },
      limit: 100,
      with_payload: true
    });
    
    return searchResult.points.map(point => ({
      id: point.id,
      ...point.payload
    }));
  } catch (error) {
    const contextError = new Error(`Failed to query symbols in file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { filePath };
    logger.error(contextError.message, 'SYMBOL_STORE');
    return [];
  }
}

/**
 * Remove all dependency information for a file (when file is deleted)
 */
async function removeFileSymbols(filePath) {
  try {
    await ensureDependencyCollection();
    
    // Get all symbols in the file
    const symbols = await querySymbolsInFile(filePath);
    
    if (symbols.length > 0) {
      const pointIds = symbols.map(symbol => symbol.id);
      const qdrantClient = getClient();
      await qdrantClient.delete(DEPENDENCY_COLLECTION, {
        points: pointIds
      });
      
      logger.info(`Removed ${pointIds.length} symbols from ${filePath}`, 'FILE_CLEANUP');
    }
  } catch (error) {
    const contextError = new Error(`Failed to remove symbols for file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { filePath };
    logger.error(contextError.message, 'SYMBOL_STORE');
    throw contextError;
  }
}

/**
 * Search for symbols by name or description
 */
async function searchSymbols(query, limit = 10) {
  try {
    await ensureDependencyCollection();
    
    const queryVector = await generateSymbolEmbedding(query);
    
    const qdrantClient = getClient();
    const searchResult = await qdrantClient.search(DEPENDENCY_COLLECTION, {
      vector: queryVector,
      limit,
      with_payload: true
    });
    
    return searchResult.map(result => ({
      score: result.score,
      id: result.id,
      ...result.payload
    }));
  } catch (error) {
    const contextError = new Error(`Failed to search symbols with query '${query}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { query, limit };
    logger.error(contextError.message, 'SYMBOL_STORE');
    return [];
  }
}

/**
 * Get dependency statistics for the repository
 */
async function getDependencyStats() {
  try {
    await ensureDependencyCollection();
    
    const qdrantClient = getClient();
    const info = await qdrantClient.getCollection(DEPENDENCY_COLLECTION);
    const totalSymbols = info.points_count;
    
    // Get symbol type distribution
    const typeStats = {};
    const allSymbols = await qdrantClient.scroll(DEPENDENCY_COLLECTION, {
      limit: 1000,
      with_payload: ['symbolType']
    });
    
    allSymbols.points.forEach(point => {
      const type = point.payload.symbolType;
      typeStats[type] = (typeStats[type] || 0) + 1;
    });
    
    return {
      totalSymbols,
      typeDistribution: typeStats
    };
  } catch (error) {
    const contextError = new Error(`Failed to get dependency statistics: ${error.message}`);
    contextError.originalError = error;
    logger.error(contextError.message, 'SYMBOL_STORE');
    return { totalSymbols: 0, typeDistribution: {}, error: contextError.message };
  }
}

module.exports = {
  ensureDependencyCollection,
  storeSymbolDependency,
  queryImpactedSymbols,
  querySymbolsInFile,
  removeFileSymbols,
  searchSymbols,
  getDependencyStats,
  createSymbolId,
  generateSymbolEmbedding, // Export for testing
  getClient, // Export for testing
  QDRANT_CONFIG // Export for reference
};