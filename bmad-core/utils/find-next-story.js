const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Simple YAML parser for story frontmatter
 * Handles basic key-value pairs and nested objects
 * @param {string} yamlString - YAML content to parse
 * @returns {Object} Parsed object
 */
function parseSimpleYAML(yamlString) {
  const result = {};
  const lines = yamlString.split('\n');
  let currentObject = result;
  let currentKey = null;
  let indentStack = [{ obj: result, indent: -1 }];
  
  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    // Calculate indent level
    const indent = line.search(/\S/);
    const trimmedLine = line.trim();
    
    // Handle key-value pairs
    if (trimmedLine.includes(':')) {
      const colonIndex = trimmedLine.indexOf(':');
      const key = trimmedLine.substring(0, colonIndex).trim();
      const value = trimmedLine.substring(colonIndex + 1).trim();
      
      // Adjust indent stack
      while (indentStack.length > 1 && indent <= indentStack[indentStack.length - 1].indent) {
        indentStack.pop();
      }
      currentObject = indentStack[indentStack.length - 1].obj;
      
      if (value) {
        // Simple key-value pair
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        currentObject[key] = cleanValue;
        currentKey = key;
      } else {
        // Start of nested object
        currentObject[key] = {};
        currentKey = key;
        indentStack.push({ obj: currentObject[key], indent });
        currentObject = currentObject[key];
      }
    } else if (trimmedLine.startsWith('- ')) {
      // List item (simplified handling)
      if (currentKey && currentObject === indentStack[indentStack.length - 2]?.obj) {
        if (!Array.isArray(currentObject[currentKey])) {
          currentObject[currentKey] = [];
        }
        currentObject[currentKey].push(trimmedLine.substring(2).trim().replace(/^["']|["']$/g, ''));
      }
    }
  }
  
  return result;
}

/**
 * Find the next approved story from the stories directory
 * @param {string} storiesDir - Path to the stories directory (pre-resolved from core-config.yaml)
 * @returns {Object} Object containing story path and metadata, or null if none found
 */
function findNextApprovedStory(storiesDir) {
  // Validate that the directory was provided and exists
  if (!storiesDir) {
    return {
      found: false,
      error: 'Stories directory path not provided. Ensure core-config.yaml devStoryLocation is configured.'
    };
  }

  try {
    // Check if stories directory exists at the expected location
    try {
      fs.accessSync(storiesDir, fs.constants.F_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          found: false,
          error: `Stories directory not found at expected location: ${storiesDir}. Check core-config.yaml devStoryLocation configuration.`
        };
      }
      return {
        found: false,
        error: `Cannot access stories directory: ${error.message}`
      };
    }

    // Get all files in the stories directory
    const files = fs.readdirSync(storiesDir);
    
    // Filter for markdown files that look like story files
    const storyFiles = files.filter(file => {
      // Match pattern like "4.1.story-name.md" or similar
      // Regex: ^\d+\.\d+ matches files starting with "number.number" (e.g., "1.2" for epic.story)
      return file.endsWith('.md') && /^\d+\.\d+/.test(file);
    });

    if (storyFiles.length === 0) {
      return {
        found: false,
        error: 'No story files found in the stories directory'
      };
    }

    // Sort files by modification time (most recent first)
    // Map each file to an object containing file info and stats
    const filesWithStats = storyFiles.map(file => {
      const filePath = path.join(storiesDir, file);
      const stats = fs.statSync(filePath);
      return {
        file,
        path: filePath,
        mtime: stats.mtime
      };
    })
    // Sort by modification time in descending order (newest first)
    .sort((a, b) => b.mtime - a.mtime);

    // Look for the most recent approved story
    for (const fileInfo of filesWithStats) {
      try {
        // Ensure the resolved path is within the stories directory (path traversal protection)
        const resolvedPath = path.resolve(fileInfo.path);
        const resolvedStoriesDir = path.resolve(storiesDir);
        if (!resolvedPath.startsWith(resolvedStoriesDir)) {
          continue; // Skip files outside the stories directory
        }
        
        const content = fs.readFileSync(fileInfo.path, 'utf8');
        
        // Extract status from the story
        // Regex: ##\s*Status\s*\n\s*(.+) matches "## Status" header followed by the status value on next line
        const statusMatch = content.match(/##\s*Status\s*\n\s*(.+)/i);
        if (statusMatch && statusMatch[1].trim().toLowerCase() === 'approved') {
          // Extract StoryContract from YAML frontmatter
          // Regex: ^---\n([\s\S]*?)\n--- matches YAML frontmatter between --- delimiters
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let storyContract = null;
          
          if (frontmatterMatch) {
            try {
              const yamlContent = parseSimpleYAML(frontmatterMatch[1]);
              storyContract = yamlContent.StoryContract;
            } catch (e) {
              // Continue even if YAML parsing fails
            }
          }
          
          // Extract story title and ID
          const titleMatch = content.match(/^#\s+(.+)/m);
          const storyTitle = titleMatch ? titleMatch[1] : fileInfo.file;
          
          return {
            found: true,
            path: fileInfo.path,
            filename: fileInfo.file,
            title: storyTitle,
            storyContract,
            modifiedTime: fileInfo.mtime
          };
        }
      } catch (error) {
        // Continue to next file if there's an error reading this one
        continue;
      }
    }

    return {
      found: false,
      error: 'No approved stories found. All stories are either in Draft, InProgress, Review, or Done status.'
    };

  } catch (error) {
    return {
      found: false,
      error: `Error scanning stories directory: ${error.message}`
    };
  }
}

/**
 * Get all stories with their statuses
 * @param {string} storiesDir - Path to the stories directory (pre-resolved from core-config.yaml)
 * @returns {Array} Array of story objects with status information
 */
function getAllStoriesStatus(storiesDir) {
  // Validate that the directory was provided
  if (!storiesDir) {
    console.warn('Stories directory path not provided. Ensure core-config.yaml devStoryLocation is configured.');
    return [];
  }

  try {
    try {
      fs.accessSync(storiesDir, fs.constants.F_OK);
    } catch (error) {
      console.warn(`Stories directory not found at expected location: ${storiesDir}. Check core-config.yaml devStoryLocation configuration.`);
      return [];
    }

    const files = fs.readdirSync(storiesDir);
    const storyFiles = files.filter(file => file.endsWith('.md') && /^\d+\.\d+/.test(file));

    return storyFiles.map(file => {
      const filePath = path.join(storiesDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const statusMatch = content.match(/##\s*Status\s*\n\s*(.+)/i);
        const titleMatch = content.match(/^#\s+(.+)/m);
        
        // Extract epic ID from filename (first number before the dot)
        const epicMatch = file.match(/^(\d+)\.(\d+)/);
        const epicId = epicMatch ? epicMatch[1] : null;
        const storyId = epicMatch ? epicMatch[2] : null;
        
        return {
          file,
          path: filePath,
          title: titleMatch ? titleMatch[1] : file,
          status: statusMatch ? statusMatch[1].trim() : 'Unknown',
          epicId,
          storyId,
          fullStoryId: epicMatch ? `${epicId}.${storyId}` : file
        };
      } catch (error) {
        return {
          file,
          path: filePath,
          title: file,
          status: 'Error reading file',
          epicId: null,
          storyId: null,
          fullStoryId: file
        };
      }
    }).sort((a, b) => a.file.localeCompare(b.file));
  } catch (error) {
    return [];
  }
}

/**
 * Get all stories belonging to a specific epic (optimized to avoid reading all files)
 * @param {string} storiesDir - Path to the stories directory (pre-resolved from core-config.yaml)
 * @param {string} epicId - Epic ID to filter stories for
 * @returns {Array} Array of story objects for the specified epic
 */
function getStoriesForEpic(storiesDir, epicId) {
  if (!storiesDir || !epicId) {
    return [];
  }

  try {
    // Validate that the directory exists
    try {
      fs.accessSync(storiesDir, fs.constants.F_OK);
    } catch (error) {
      console.warn(`Stories directory not found at expected location: ${storiesDir}. Check core-config.yaml devStoryLocation configuration.`);
      return [];
    }

    // Get all files in the stories directory
    const files = fs.readdirSync(storiesDir);
    
    // Filter for markdown files that match the specific epic pattern
    // This avoids reading files for other epics entirely
    const epicPrefix = `${epicId}.`;
    const epicStoryFiles = files.filter(file => {
      return file.endsWith('.md') && file.startsWith(epicPrefix);
    });

    if (epicStoryFiles.length === 0) {
      return [];
    }

    // Now only read files that belong to this epic
    const epicStories = epicStoryFiles.map(file => {
      const filePath = path.join(storiesDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const statusMatch = content.match(/##\s*Status\s*\n\s*(.+)/i);
        const titleMatch = content.match(/^#\s+(.+)/m);
        
        // Extract epic ID and story ID from filename
        const epicMatch = file.match(/^(\d+)\.(\d+)/);
        const storyIdFromFile = epicMatch ? epicMatch[2] : null;
        
        return {
          file,
          path: filePath,
          title: titleMatch ? titleMatch[1] : file,
          status: statusMatch ? statusMatch[1].trim() : 'Unknown',
          epicId: epicId.toString(),
          storyId: storyIdFromFile,
          fullStoryId: epicMatch ? `${epicId}.${storyIdFromFile}` : file
        };
      } catch (error) {
        return {
          file,
          path: filePath,
          title: file,
          status: 'Error reading file',
          epicId: epicId.toString(),
          storyId: null,
          fullStoryId: file
        };
      }
    });

    // Sort by story ID numerically
    return epicStories.sort((a, b) => {
      const aStoryNum = parseInt(a.storyId) || 0;
      const bStoryNum = parseInt(b.storyId) || 0;
      return aStoryNum - bStoryNum;
    });
  } catch (error) {
    console.error(`Error getting stories for epic ${epicId}:`, error.message);
    return [];
  }
}

/**
 * Find the next pending story in an epic (Approved status)
 * @param {string} storiesDir - Path to the stories directory
 * @param {string} epicId - Epic ID to search within
 * @returns {Object} Next approved story or null if none found
 */
function findNextApprovedStoryInEpic(storiesDir, epicId) {
  if (!storiesDir || !epicId) {
    return {
      found: false,
      error: 'Stories directory path or epic ID not provided'
    };
  }

  try {
    const epicStories = getStoriesForEpic(storiesDir, epicId);
    
    if (epicStories.length === 0) {
      return {
        found: false,
        error: `No stories found for epic ${epicId}`
      };
    }

    // Find the first approved story in the epic
    const approvedStory = epicStories.find(story => 
      story.status.toLowerCase() === 'approved'
    );

    if (!approvedStory) {
      return {
        found: false,
        error: `No approved stories found in epic ${epicId}. All stories are either in Draft, InProgress, Review, or Done status.`
      };
    }

    // Read the full story content for additional metadata
    try {
      const content = fs.readFileSync(approvedStory.path, 'utf8');
      
      // Extract StoryContract from YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let storyContract = null;
      
      if (frontmatterMatch) {
        try {
          const yamlContent = parseSimpleYAML(frontmatterMatch[1]);
          storyContract = yamlContent.StoryContract;
        } catch (e) {
          // Continue even if YAML parsing fails
        }
      }

      const stats = fs.statSync(approvedStory.path);
      
      return {
        found: true,
        path: approvedStory.path,
        filename: approvedStory.file,
        title: approvedStory.title,
        status: approvedStory.status,
        epicId: approvedStory.epicId,
        storyId: approvedStory.storyId,
        fullStoryId: approvedStory.fullStoryId,
        storyContract,
        modifiedTime: stats.mtime
      };
    } catch (error) {
      return {
        found: false,
        error: `Error reading story file ${approvedStory.path}: ${error.message}`
      };
    }
  } catch (error) {
    return {
      found: false,
      error: `Error finding next approved story in epic ${epicId}: ${error.message}`
    };
  }
}

/**
 * Get epic completion status
 * @param {string} storiesDir - Path to the stories directory
 * @param {string} epicId - Epic ID to check
 * @returns {Object} Epic completion information
 */
function getEpicStatus(storiesDir, epicId) {
  if (!storiesDir || !epicId) {
    return {
      epicId,
      totalStories: 0,
      completedStories: 0,
      inProgressStories: 0,
      pendingStories: 0,
      isComplete: false,
      stories: []
    };
  }

  try {
    const epicStories = getStoriesForEpic(storiesDir, epicId);
    
    const statusCounts = epicStories.reduce((counts, story) => {
      const status = story.status.toLowerCase();
      if (status === 'done') {
        counts.completed++;
      } else if (status === 'inprogress' || status === 'review') {
        counts.inProgress++;
      } else if (status === 'approved') {
        counts.pending++;
      }
      return counts;
    }, { completed: 0, inProgress: 0, pending: 0 });

    return {
      epicId,
      totalStories: epicStories.length,
      completedStories: statusCounts.completed,
      inProgressStories: statusCounts.inProgress,
      pendingStories: statusCounts.pending,
      isComplete: statusCounts.completed === epicStories.length && epicStories.length > 0,
      stories: epicStories
    };
  } catch (error) {
    console.error(`Error getting epic status for ${epicId}:`, error.message);
    return {
      epicId,
      totalStories: 0,
      completedStories: 0,
      inProgressStories: 0,
      pendingStories: 0,
      isComplete: false,
      stories: [],
      error: error.message
    };
  }
}

/**
 * Async version of findNextApprovedStory for better performance
 * @param {string} storiesDir - Path to the stories directory (pre-resolved from core-config.yaml)
 * @returns {Promise<Object>} Object containing story path and metadata, or null if none found
 */
async function findNextApprovedStoryAsync(storiesDir) {
  // Validate that the directory was provided and exists
  if (!storiesDir) {
    return {
      found: false,
      error: 'Stories directory path not provided. Ensure core-config.yaml devStoryLocation is configured.'
    };
  }

  try {
    // Check if stories directory exists at the expected location
    try {
      await fsPromises.access(storiesDir, fs.constants.F_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          found: false,
          error: `Stories directory not found at expected location: ${storiesDir}. Check core-config.yaml devStoryLocation configuration.`
        };
      }
      return {
        found: false,
        error: `Cannot access stories directory: ${error.message}`
      };
    }

    // Get all files in the stories directory
    const files = await fsPromises.readdir(storiesDir);
    
    // Filter for markdown files that look like story files
    const storyFiles = files.filter(file => {
      return file.endsWith('.md') && /^\d+\.\d+/.test(file);
    });

    if (storyFiles.length === 0) {
      return {
        found: false,
        error: 'No story files found in the stories directory'
      };
    }

    // Sort files by modification time (most recent first)
    const filesWithStats = await Promise.all(storyFiles.map(async (file) => {
      const filePath = path.join(storiesDir, file);
      const stats = await fsPromises.stat(filePath);
      return {
        file,
        path: filePath,
        mtime: stats.mtime
      };
    }));
    
    // Sort by modification time in descending order (newest first)
    filesWithStats.sort((a, b) => b.mtime - a.mtime);

    // Look for the most recent approved story
    for (const fileInfo of filesWithStats) {
      try {
        // Ensure the resolved path is within the stories directory (path traversal protection)
        const resolvedPath = path.resolve(fileInfo.path);
        const resolvedStoriesDir = path.resolve(storiesDir);
        if (!resolvedPath.startsWith(resolvedStoriesDir)) {
          continue; // Skip files outside the stories directory
        }
        
        const content = await fsPromises.readFile(fileInfo.path, 'utf8');
        
        // Extract status from the story
        const statusMatch = content.match(/##\s*Status\s*\n\s*(.+)/i);
        if (statusMatch && statusMatch[1].trim().toLowerCase() === 'approved') {
          // Extract StoryContract from YAML frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let storyContract = null;
          
          if (frontmatterMatch) {
            try {
              const yamlContent = parseSimpleYAML(frontmatterMatch[1]);
              storyContract = yamlContent.StoryContract;
            } catch (e) {
              // Continue even if YAML parsing fails
            }
          }
          
          // Extract story title and ID
          const titleMatch = content.match(/^#\s+(.+)/m);
          const storyTitle = titleMatch ? titleMatch[1] : fileInfo.file;
          
          return {
            found: true,
            path: fileInfo.path,
            filename: fileInfo.file,
            title: storyTitle,
            storyContract,
            modifiedTime: fileInfo.mtime
          };
        }
      } catch (error) {
        // Continue to next file if there's an error reading this one
        continue;
      }
    }

    return {
      found: false,
      error: 'No approved stories found. All stories are either in Draft, InProgress, Review, or Done status.'
    };

  } catch (error) {
    return {
      found: false,
      error: `Error scanning stories directory: ${error.message}`
    };
  }
}

module.exports = {
  findNextApprovedStory,
  findNextApprovedStoryAsync,
  getAllStoriesStatus,
  getStoriesForEpic,
  findNextApprovedStoryInEpic,
  getEpicStatus
};