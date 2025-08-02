const { getQdrantClient } = require('./qdrant');
const { findRelevantCollections, hasCollections } = require('./qdrant-collection-resolver');
const { generateEmbedding } = require('./qdrant');

/**
 * Search documentation collections in Qdrant
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @param {string} options.technology - Specific technology to focus on
 * @param {number} options.limit - Maximum results per collection
 * @param {boolean} options.combineResults - Whether to combine results from all collections
 * @returns {Object} Search results from relevant collections
 */
async function searchDocumentation(query, options = {}) {
  const { technology = '', limit = 5, combineResults = true } = options;
  
  // Check if any collections are configured
  if (!hasCollections()) {
    console.log('No Qdrant collections configured. Please configure collections in qdrant-collections.yaml');
    return {
      results: [],
      message: 'No documentation collections configured',
      collectionsSearched: []
    };
  }
  
  // Find relevant collections based on query
  const relevantCollections = findRelevantCollections(query, technology);
  
  if (relevantCollections.length === 0) {
    return {
      results: [],
      message: 'No relevant collections found for this query',
      collectionsSearched: []
    };
  }
  
  console.log(`Searching ${relevantCollections.length} collections:`, relevantCollections.map(c => c.name).join(', '));
  
  const client = getQdrantClient();
  const results = [];
  const collectionsSearched = [];
  
  try {
    // Generate embedding for the query
    const queryVector = await generateEmbedding(query);
    
    // Search each relevant collection
    for (const collection of relevantCollections) {
      try {
        const searchResult = await client.search(collection.name, {
          vector: queryVector,
          limit: limit,
          with_payload: true
        });
        
        if (searchResult && searchResult.length > 0) {
          const collectionResults = searchResult.map(result => ({
            ...result,
            collection: collection.name,
            content_type: collection.content_type,
            relevance_score: result.score
          }));
          
          results.push(...collectionResults);
          collectionsSearched.push({
            name: collection.name,
            found: searchResult.length
          });
        }
      } catch (error) {
        console.warn(`Failed to search collection ${collection.name}:`, error.message);
        // Continue with other collections
      }
    }
    
    // Sort by relevance if combining results
    if (combineResults && results.length > 0) {
      results.sort((a, b) => b.relevance_score - a.relevance_score);
      // Limit total results
      results.splice(limit * 2); // Allow up to 2x limit when combining
    }
    
    return {
      results,
      message: `Found ${results.length} results across ${collectionsSearched.length} collections`,
      collectionsSearched
    };
    
  } catch (error) {
    console.error('Error searching documentation:', error);
    return {
      results: [],
      message: `Search error: ${error.message}`,
      collectionsSearched: []
    };
  }
}

/**
 * Search a specific collection by name
 * @param {string} collectionName - The collection to search
 * @param {string} query - The search query
 * @param {number} limit - Maximum results
 * @returns {Object} Search results
 */
async function searchSpecificCollection(collectionName, query, limit = 5) {
  const client = getQdrantClient();
  
  try {
    const queryVector = await generateEmbedding(query);
    
    const searchResult = await client.search(collectionName, {
      vector: queryVector,
      limit: limit,
      with_payload: true
    });
    
    return {
      results: searchResult || [],
      collection: collectionName,
      message: `Found ${searchResult?.length || 0} results in ${collectionName}`
    };
    
  } catch (error) {
    console.error(`Error searching collection ${collectionName}:`, error);
    return {
      results: [],
      collection: collectionName,
      message: `Error: ${error.message}`
    };
  }
}

module.exports = {
  searchDocumentation,
  searchSpecificCollection
};