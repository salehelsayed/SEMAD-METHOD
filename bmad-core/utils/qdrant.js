const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({ host: 'localhost', port: 6333 });

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

const COLLECTION_NAME = 'bmad_agent_memory';
const VECTOR_SIZE = 384;

async function ensureCollection() {
  try {
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
  } catch (error) {
    console.warn('Qdrant collection initialization failed:', error.message);
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
    await ensureCollection();
    
    const id = Date.now();
    const { embedding, method } = await generateEmbedding(text, true);
    
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id,
          vector: embedding,
          payload: {
            agentName,
            text,
            timestamp: new Date().toISOString(),
            embeddingMethod: method,
            ...metadata
          }
        }
      ]
    });
    
    return id;
  } catch (error) {
    console.error('Failed to store memory snippet:', error.message);
    return null;
  }
}

async function retrieveMemory(query, topN = 5) {
  try {
    await ensureCollection();
    
    const queryVector = await generateEmbedding(query);
    
    const searchResult = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: topN,
      with_payload: true
    });
    
    return searchResult.map(result => ({
      score: result.score,
      ...result.payload
    }));
  } catch (error) {
    console.error('Failed to retrieve memory:', error.message);
    return [];
  }
}

module.exports = {
  client,
  storeMemorySnippet,
  retrieveMemory
};