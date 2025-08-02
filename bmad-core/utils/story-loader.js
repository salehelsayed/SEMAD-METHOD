/**
 * Story Loader with Automatic Validation
 * 
 * Loads story files and automatically validates them using validation hooks.
 * Ensures story contracts and memory operations are validated on load.
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const validationHooks = require('./validation-hooks');

class StoryLoader {
  constructor() {
    this.loadedStories = new Map();
  }

  /**
   * Load a story file with automatic validation
   * @param {string} storyPath - Path to the story file
   * @param {Object} options - Loading options
   * @returns {Object} Loaded and validated story
   */
  async loadStory(storyPath, options = {}) {
    try {
      // Check if story exists
      await fs.access(storyPath);
      
      // Read story content
      const content = await fs.readFile(storyPath, 'utf8');
      
      // Parse story structure
      const storyData = this.parseStoryContent(content);
      storyData.path = storyPath;
      storyData.loadedAt = new Date().toISOString();
      
      // Run validation hooks
      const validation = await validationHooks.executeHooks('afterStoryLoad', storyData);
      
      // Store validation results with the story
      storyData.validation = validation;
      
      // Cache the loaded story
      this.loadedStories.set(storyPath, storyData);
      
      // Log validation issues if any
      if (!validation.valid && !options.suppressValidationErrors) {
        console.error(`Story validation failed for ${path.basename(storyPath)}:`);
        validation.errors.forEach(error => {
          console.error(`  - ${error.type}: ${error.message}`);
        });
      }
      
      if (validation.warnings && validation.warnings.length > 0 && !options.suppressWarnings) {
        console.warn(`Story validation warnings for ${path.basename(storyPath)}:`);
        validation.warnings.forEach(warning => {
          console.warn(`  - ${warning.type}: ${warning.message}`);
        });
      }
      
      return storyData;
    } catch (error) {
      throw new Error(`Failed to load story ${storyPath}: ${error.message}`);
    }
  }

  /**
   * Parse story content into structured format
   * @param {string} content - Raw story content
   * @returns {Object} Parsed story data
   */
  parseStoryContent(content) {
    const result = {
      frontMatter: null,
      content: content,
      sections: new Map()
    };
    
    // Extract YAML front matter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      result.frontMatter = yaml.load(yamlMatch[1]);
      result.content = content.substring(yamlMatch[0].length).trim();
    }
    
    // Parse sections
    const lines = result.content.split('\n');
    let currentSection = null;
    let sectionContent = [];
    
    for (const line of lines) {
      const sectionMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (sectionMatch) {
        // Save previous section
        if (currentSection) {
          result.sections.set(currentSection, sectionContent.join('\n').trim());
        }
        // Start new section
        currentSection = sectionMatch[1];
        sectionContent = [];
      } else {
        sectionContent.push(line);
      }
    }
    
    // Save last section
    if (currentSection) {
      result.sections.set(currentSection, sectionContent.join('\n').trim());
    }
    
    return result;
  }

  /**
   * Save a story with automatic validation
   * @param {string} storyPath - Path to save the story
   * @param {Object} storyData - Story data to save
   * @param {Object} options - Save options
   */
  async saveStory(storyPath, storyData, options = {}) {
    // Validate before save
    const validation = await validationHooks.executeHooks('beforeStorySave', storyData);
    
    if (!validation.valid && !options.forceWrite) {
      throw new Error(`Story validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
    }
    
    // Construct story content
    let content = '';
    
    // Add front matter if present
    if (storyData.frontMatter) {
      content += '---\n';
      content += yaml.dump(storyData.frontMatter, { lineWidth: -1 });
      content += '---\n\n';
    }
    
    // Add main content
    if (storyData.content) {
      content += storyData.content;
    } else if (storyData.sections) {
      // Reconstruct from sections
      for (const [section, sectionContent] of storyData.sections.entries()) {
        content += `## ${section}\n\n${sectionContent}\n\n`;
      }
    }
    
    // Write to file
    await fs.writeFile(storyPath, content.trim() + '\n', 'utf8');
    
    // Update cache
    this.loadedStories.set(storyPath, {
      ...storyData,
      path: storyPath,
      savedAt: new Date().toISOString(),
      validation
    });
    
    return { success: true, validation };
  }

  /**
   * Validate a story without loading it into memory
   * @param {string} storyPath - Path to the story file
   * @returns {Object} Validation result
   */
  async validateStory(storyPath) {
    const storyData = await this.loadStory(storyPath, { 
      suppressValidationErrors: true,
      suppressWarnings: true 
    });
    return storyData.validation;
  }

  /**
   * Get cached story if available
   * @param {string} storyPath - Path to the story file
   * @returns {Object|null} Cached story data or null
   */
  getCachedStory(storyPath) {
    return this.loadedStories.get(storyPath) || null;
  }

  /**
   * Clear story cache
   * @param {string} storyPath - Optional specific story to clear
   */
  clearCache(storyPath = null) {
    if (storyPath) {
      this.loadedStories.delete(storyPath);
    } else {
      this.loadedStories.clear();
    }
  }

  /**
   * Batch validate multiple stories
   * @param {Array<string>} storyPaths - Array of story paths
   * @returns {Object} Batch validation results
   */
  async batchValidate(storyPaths) {
    const results = {
      total: storyPaths.length,
      validated: 0,
      passed: 0,
      failed: 0,
      stories: []
    };
    
    for (const storyPath of storyPaths) {
      try {
        const validation = await this.validateStory(storyPath);
        results.validated++;
        
        if (validation.valid) {
          results.passed++;
        } else {
          results.failed++;
        }
        
        results.stories.push({
          path: storyPath,
          ...validation
        });
      } catch (error) {
        results.stories.push({
          path: storyPath,
          valid: false,
          errors: [{ type: 'LOAD_ERROR', message: error.message }]
        });
      }
    }
    
    return results;
  }
}

// Create singleton instance
const storyLoader = new StoryLoader();

// Export both the class and singleton
module.exports = storyLoader;
module.exports.StoryLoader = StoryLoader;