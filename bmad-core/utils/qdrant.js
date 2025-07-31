const { QdrantClient } = require('@qdrant/js-client-rest');
const { MEMORY_CONFIG, validateAgentName, validateTextContent, sanitizeTextContent } = require('./memory-config');

const client = new QdrantClient({ 
  host: MEMORY_CONFIG.QDRANT_HOST, 
  port: MEMORY_CONFIG.QDRANT_PORT 
});

// Connection health tracking
let qdrantHealthy = null; // null = unknown, true = healthy, false = unhealthy
let lastHealthCheck = null;
const HEALTH_CHECK_INTERVAL = MEMORY_CONFIG.QDRANT_HEALTH_CHECK_INTERVAL;

// Fallback memory storage when Qdrant is unavailable
const fallbackMemory = new Map();
let fallbackCounter = 0;

// OpenAI configuration - only initialized if API key is present
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const { Configuration, OpenAIApi } = require('openai');
    const openAIConfig = new Configuration({
      apiKey: process.env.OPENAI_API_KEY
    });
    openai = new OpenAIApi(openAIConfig);
  } catch (error) {
    // OpenAI package not installed, will use fallback
    console.warn('OpenAI package not installed. Using hash-based embeddings.');
  }
}

const COLLECTION_NAME = MEMORY_CONFIG.QDRANT_COLLECTION;
const VECTOR_SIZE = MEMORY_CONFIG.QDRANT_VECTOR_SIZE;

/**
 * Check Qdrant connection health
 * @returns {boolean} True if healthy, false otherwise
 */
async function checkQdrantHealth() {
  const now = Date.now();
  
  // Use cached result if recent
  if (lastHealthCheck && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL && qdrantHealthy !== null) {
    return qdrantHealthy;
  }
  
  try {
    // Simple health check - try to get collections
    await client.getCollections();
    qdrantHealthy = true;
    lastHealthCheck = now;
    
    if (process.env.NODE_ENV !== 'test') {
      console.log('✅ Qdrant connection healthy');
    }
    return true;
  } catch (error) {
    qdrantHealthy = false;
    lastHealthCheck = now;
    
    if (process.env.NODE_ENV !== 'test') {
      console.warn('❌ Qdrant connection failed:', error.message);
      console.warn('📝 Falling back to in-memory storage');
    }
    return false;
  }
}

async function ensureCollection() {
  try {
    const isHealthy = await checkQdrantHealth();
    if (!isHealthy) {
      return false; // Skip collection creation if Qdrant is down
    }
    
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        }
      });
    }
    return true;
  } catch (error) {
    console.warn('Qdrant collection initialization failed:', error.message);
    qdrantHealthy = false;
    return false;
  }
}

/**
 * Generate a semantic embedding for the given text using OpenAI's API.
 * Falls back to a hash-based embedding if no API key is provided.
 * @param {string} text - The text to embed
 * @param {boolean} returnMetadata - If true, returns {embedding, method} instead of just embedding
 * @returns {Array<number>|{embedding: Array<number>, method: string}} The embedding or embedding with metadata
 */
async function generateEmbedding(text, returnMetadata = false) {
  let method = 'hash';
  let embedding;
  
  if (openai && process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: text
      });
      embedding = response.data.data[0].embedding;
      method = 'openai';
    } catch (error) {
      console.warn('OpenAI embedding failed, using fallback:', error.message);
    }
  }
  
  // Fallback to deterministic hash if no API key is set or OpenAI fails
  if (!embedding) {
    const hash = require('crypto').createHash('sha256').update(text).digest();
    embedding = [];
    for (let i = 0; i < VECTOR_SIZE; i++) {
      embedding.push((hash[i % hash.length] - 128) / 128);
    }
  }
  
  return returnMetadata ? { embedding, method } : embedding;
}

async function storeMemorySnippet(agentName, text, metadata = {}) {
  try {
    // Validate inputs
    validateAgentName(agentName);
    validateTextContent(text, 'memory snippet text');
    
    // Sanitize text content
    const sanitizedText = sanitizeTextContent(text);
    
    const collectionReady = await ensureCollection();
    const id = Date.now();
    
    if (collectionReady && qdrantHealthy) {
      // Store in Qdrant if available
      const { embedding, method } = await generateEmbedding(sanitizedText, true);
      
      await client.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id,
            vector: embedding,
            payload: {
              agentName,
              text: sanitizedText,
              originalLength: text.length,
              timestamp: new Date().toISOString(),
              embeddingMethod: method,
              ...metadata
            }
          }
        ]
      });
      
      return id;
    } else {
      // Fallback to in-memory storage
      const fallbackId = `fallback_${++fallbackCounter}`;
      const payload = {
        agentName,
        text: sanitizedText,
        originalLength: text.length,
        timestamp: new Date().toISOString(),
        embeddingMethod: 'fallback',
        isFallback: true,
        ...metadata
      };
      
      fallbackMemory.set(fallbackId, payload);
      
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`📝 Stored memory snippet in fallback storage: ${fallbackId}`);
      }
      
      return fallbackId;
    }
  } catch (error) {
    // Final fallback - store in memory even if everything else fails
    const fallbackId = `emergency_${++fallbackCounter}`;
    const payload = {
      agentName,
      text: sanitizedText,
      originalLength: text.length,
      timestamp: new Date().toISOString(),
      embeddingMethod: 'emergency-fallback',
      isFallback: true,
      error: error.message,
      ...metadata
    };
    
    fallbackMemory.set(fallbackId, payload);
    console.error('Failed to store memory snippet, using emergency fallback:', error.message);
    return fallbackId;
  }
}

async function retrieveMemory(query, topN = 5, filters = {}) {
  try {
    const collectionReady = await ensureCollection();
    
    if (collectionReady && qdrantHealthy) {
      // Retrieve from Qdrant if available
      const queryVector = await generateEmbedding(query);
      
      // Build filter conditions for Qdrant
      const filterConditions = [];
      
      if (filters.agentName) {
        filterConditions.push({
          key: 'agentName',
          match: { value: filters.agentName }
        });
      }
      
      if (filters.storyId) {
        filterConditions.push({
          key: 'storyId',
          match: { value: filters.storyId }
        });
      }
      
      if (filters.epicId) {
        filterConditions.push({
          key: 'epicId',
          match: { value: filters.epicId }
        });
      }
      
      if (filters.type) {
        filterConditions.push({
          key: 'type',
          match: { value: filters.type }
        });
      }
      
      if (filters.taskId) {
        filterConditions.push({
          key: 'taskId',
          match: { value: filters.taskId }
        });
      }
      
      const searchParams = {
        vector: queryVector,
        limit: topN,
        with_payload: true
      };
      
      // Add filters if any exist
      if (filterConditions.length > 0) {
        searchParams.filter = {
          must: filterConditions
        };
      }
      
      const searchResult = await client.search(COLLECTION_NAME, searchParams);
      
      return searchResult.map(result => ({
        score: result.score,
        ...result.payload
      }));
    } else {
      // Fallback to in-memory search
      const results = [];
      const queryLower = query.toLowerCase();
      
      for (const [id, payload] of fallbackMemory.entries()) {
        // Simple text-based matching for fallback
        let matches = true;
        
        // Apply filters
        if (filters.agentName && payload.agentName !== filters.agentName) matches = false;
        if (filters.storyId && payload.storyId !== filters.storyId) matches = false;
        if (filters.epicId && payload.epicId !== filters.epicId) matches = false;
        if (filters.type && payload.type !== filters.type) matches = false;
        if (filters.taskId && payload.taskId !== filters.taskId) matches = false;
        
        if (matches && payload.text && payload.text.toLowerCase().includes(queryLower)) {
          results.push({
            score: 0.5, // Default fallback score
            id,
            ...payload
          });
        }
      }
      
      // Sort by timestamp (newest first) and limit results
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`📝 Retrieved ${results.slice(0, topN).length} memories from fallback storage`);
      }
      
      return results.slice(0, topN);
    }
  } catch (error) {
    // Emergency fallback - return empty array with warning
    console.error('Failed to retrieve memory, returning empty results:', error.message);
    return [];
  }
}

/**
 * Retrieve memories for a specific agent and story context
 * @param {string} agentName - Name of the agent
 * @param {string} query - Search query
 * @param {string} storyId - Story ID to filter by
 * @param {number} topN - Number of results to return
 * @returns {Array} Array of relevant memories
 */
async function retrieveAgentStoryMemory(agentName, query, storyId, topN = 5) {
  return await retrieveMemory(query, topN, {
    agentName,
    storyId
  });
}

/**
 * Retrieve memories for a specific agent and epic context
 * @param {string} agentName - Name of the agent
 * @param {string} query - Search query
 * @param {string} epicId - Epic ID to filter by
 * @param {number} topN - Number of results to return
 * @returns {Array} Array of relevant memories
 */
async function retrieveAgentEpicMemory(agentName, query, epicId, topN = 5) {
  return await retrieveMemory(query, topN, {
    agentName,
    epicId
  });
}

/**
 * Retrieve task-specific memories for an agent
 * @param {string} agentName - Name of the agent
 * @param {string} taskId - Task ID to filter by
 * @param {number} topN - Number of results to return
 * @returns {Array} Array of task memories
 */
async function retrieveTaskMemory(agentName, taskId, topN = 10) {
  return await retrieveMemory(`task ${taskId}`, topN, {
    agentName,
    taskId,
    type: 'task-archive'
  });
}

/**
 * Store memory with enhanced context metadata
 * @param {string} agentName - Name of the agent
 * @param {string} text - Text content to store
 * @param {Object} context - Context metadata
 * @param {string} context.storyId - Story ID
 * @param {string} context.epicId - Epic ID
 * @param {string} context.taskId - Task ID
 * @param {string} context.type - Memory type
 * @returns {string} Memory ID
 */
async function storeContextualMemory(agentName, text, context = {}) {
  // Validation is handled in storeMemorySnippet
  const metadata = {
    agent: agentName,
    storyId: context.storyId || null,
    epicId: context.epicId || null,
    taskId: context.taskId || null,
    type: context.type || 'observation',
    timestamp: new Date().toISOString(),
    ...context
  };
  
  return await storeMemorySnippet(agentName, text, metadata);
}

module.exports = {
  client,
  storeMemorySnippet,
  retrieveMemory,
  retrieveAgentStoryMemory,
  retrieveAgentEpicMemory,
  retrieveTaskMemory,
  storeContextualMemory,
  checkQdrantHealth,
  // Expose fallback memory for diagnostics (read-only)
  getFallbackMemoryStatus: () => ({
    isHealthy: qdrantHealthy,
    lastCheck: lastHealthCheck,
    fallbackEntries: fallbackMemory.size,
    mode: qdrantHealthy ? 'qdrant' : 'fallback'
  })
};