const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Resolves which Qdrant collections to search based on query
 */
class QdrantCollectionResolver {
  constructor() {
    this.collections = null;
    this.loadCollections();
  }

  loadCollections() {
    try {
      const configPath = path.join(__dirname, '../data/qdrant-collections.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(content);
        this.collections = config.collections || {};
        console.log(`Loaded ${Object.keys(this.collections).length} Qdrant collections`);
      } else {
        console.warn('No qdrant-collections.yaml found, using defaults');
        this.collections = {};
      }
    } catch (error) {
      console.error('Error loading Qdrant collections config:', error.message);
      this.collections = {};
    }
  }

  /**
   * Find relevant collections for a query
   * @param {string} query - The search query
   * @param {string} technology - Optional specific technology
   * @returns {Array} Array of collection names to search
   */
  findRelevantCollections(query, technology = '') {
    const relevantCollections = [];
    const lowerQuery = (query + ' ' + technology).toLowerCase();

    for (const [key, collection] of Object.entries(this.collections)) {
      let shouldSearch = false;

      // Check search_when conditions
      if (collection.search_when) {
        for (const condition of collection.search_when) {
          if (this.evaluateCondition(condition, lowerQuery)) {
            shouldSearch = true;
            break;
          }
        }
      }

      // Also check if technology matches topics
      if (technology && collection.topics) {
        for (const topic of collection.topics) {
          if (technology.toLowerCase().includes(topic.toLowerCase()) || 
              topic.toLowerCase().includes(technology.toLowerCase())) {
            shouldSearch = true;
            break;
          }
        }
      }

      if (shouldSearch) {
        relevantCollections.push({
          name: collection.name,
          description: collection.description,
          content_type: collection.content_type
        });
      }
    }

    // If no specific collections found, return default collections
    if (relevantCollections.length === 0 && Object.keys(this.collections).length > 0) {
      // Return general collections like code_examples and best_practices
      const defaults = ['code_examples', 'best_practices'];
      for (const defaultKey of defaults) {
        if (this.collections[defaultKey]) {
          relevantCollections.push({
            name: this.collections[defaultKey].name,
            description: this.collections[defaultKey].description,
            content_type: this.collections[defaultKey].content_type
          });
        }
      }
    }

    return relevantCollections;
  }

  /**
   * Evaluate a search condition
   * @param {string} condition - The condition to evaluate
   * @param {string} query - The query to test against
   * @returns {boolean} Whether the condition matches
   */
  evaluateCondition(condition, query) {
    // Simple string matching for now
    // Format: "keyword contains X" or "query contains Y"
    const parts = condition.toLowerCase().split(' contains ');
    if (parts.length === 2) {
      const term = parts[1].replace(/['"]/g, '').trim();
      return query.includes(term);
    }
    return false;
  }

  /**
   * Get all available collections
   * @returns {Object} All collections
   */
  getAllCollections() {
    return Object.values(this.collections).map(col => ({
      name: col.name,
      description: col.description,
      topics: col.topics || []
    }));
  }

  /**
   * Check if any collections are configured
   * @returns {boolean} Whether collections exist
   */
  hasCollections() {
    return Object.keys(this.collections).length > 0;
  }
}

// Create singleton instance
const resolver = new QdrantCollectionResolver();

// Export functions
module.exports = {
  findRelevantCollections: (query, technology) => resolver.findRelevantCollections(query, technology),
  getAllCollections: () => resolver.getAllCollections(),
  hasCollections: () => resolver.hasCollections(),
  reloadCollections: () => resolver.loadCollections()
};