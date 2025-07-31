#!/usr/bin/env node

/**
 * Agent Permissions Validator
 * 
 * This utility enforces file modification restrictions for different agents,
 * particularly preventing the QA agent from modifying repository files.
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

class AgentPermissionsValidator {
  constructor() {
    // Define agent permissions
    this.permissions = {
      'qa': {
        canModifyFiles: false,
        allowedStoryFileSections: ['qa-results', 'change-log', 'status'],
        readOnly: true,
        description: 'QA agent can only read files and update specific story sections'
      },
      'dev': {
        canModifyFiles: true,
        allowedStoryFileSections: ['tasks-subtasks', 'dev-agent-record', 'change-log', 'status', 'file-list'],
        readOnly: false,
        description: 'Dev agent can modify code files and update dev-specific story sections'
      },
      'scrum-master': {
        canModifyFiles: true,
        allowedStoryFileSections: '*', // All sections
        readOnly: false,
        description: 'Scrum Master has full story file access'
      },
      'analyst': {
        canModifyFiles: true,
        allowedStoryFileSections: ['requirements', 'acceptance-criteria'],
        readOnly: false,
        description: 'Analyst can modify requirement documents'
      },
      'architect': {
        canModifyFiles: true,
        allowedStoryFileSections: ['technical-design', 'architecture'],
        readOnly: false,
        description: 'Architect can modify architecture documents'
      },
      'pm': {
        canModifyFiles: true,
        allowedStoryFileSections: ['story', 'epic-context'],
        readOnly: false,
        description: 'PM can modify story context and epic information'
      }
    };
  }

  /**
   * Validate if an agent can modify a file
   * @param {string} agentId - The agent identifier
   * @param {string} filePath - The file path to be modified
   * @returns {object} - Validation result with allowed flag and reason
   */
  validateFileModification(agentId, filePath) {
    const agentPerms = this.permissions[agentId];
    
    if (!agentPerms) {
      return {
        allowed: false,
        reason: `Unknown agent: ${agentId}`
      };
    }

    // Check if agent has general file modification permission
    if (!agentPerms.canModifyFiles) {
      return {
        allowed: false,
        reason: `Agent ${agentId} is not allowed to modify files. This agent has read-only permissions.`
      };
    }

    // Additional checks can be added here for specific file types or paths
    const fileName = path.basename(filePath);
    
    // Story files have special section-based permissions
    if (fileName.endsWith('.yaml') && fileName.includes('story')) {
      return {
        allowed: true,
        reason: 'Story file modifications are controlled by section permissions',
        sections: agentPerms.allowedStoryFileSections
      };
    }

    return {
      allowed: true,
      reason: 'File modification allowed'
    };
  }

  /**
   * Validate if an agent can modify a specific story section
   * @param {string} agentId - The agent identifier
   * @param {string} sectionId - The story section identifier
   * @returns {object} - Validation result
   */
  validateStorySectionModification(agentId, sectionId) {
    const agentPerms = this.permissions[agentId];
    
    if (!agentPerms) {
      return {
        allowed: false,
        reason: `Unknown agent: ${agentId}`
      };
    }

    // Check if agent has wildcard access
    if (agentPerms.allowedStoryFileSections === '*') {
      return {
        allowed: true,
        reason: 'Agent has full story file access'
      };
    }

    // Check if section is in allowed list
    const allowed = agentPerms.allowedStoryFileSections.includes(sectionId);
    
    return {
      allowed,
      reason: allowed 
        ? `Agent ${agentId} is allowed to modify section: ${sectionId}`
        : `Agent ${agentId} is NOT allowed to modify section: ${sectionId}. Allowed sections: ${agentPerms.allowedStoryFileSections.join(', ')}`
    };
  }

  /**
   * Get agent permissions summary
   * @param {string} agentId - The agent identifier
   * @returns {object} - Agent permissions
   */
  getAgentPermissions(agentId) {
    return this.permissions[agentId] || null;
  }

  /**
   * Validate an operation before execution
   * @param {object} operation - Operation details
   * @returns {object} - Validation result
   */
  validateOperation(operation) {
    const { agent, action, target, targetSection } = operation;

    // Check read operations (always allowed)
    if (action === 'read') {
      return {
        allowed: true,
        reason: 'Read operations are allowed for all agents'
      };
    }

    // Check write operations
    if (action === 'write' || action === 'modify' || action === 'update') {
      // Story file section modification
      if (targetSection) {
        return this.validateStorySectionModification(agent, targetSection);
      }
      
      // General file modification
      return this.validateFileModification(agent, target);
    }

    return {
      allowed: true,
      reason: 'Operation type not restricted'
    };
  }

  /**
   * Create a validation wrapper for file operations
   * @param {string} agentId - The agent performing the operation
   * @returns {object} - Object with wrapped file operation methods
   */
  createSecureFileOperations(agentId) {
    const validator = this;
    
    return {
      readFile: (filePath) => {
        // Reading is always allowed
        return fs.readFileSync(filePath, 'utf8');
      },
      
      writeFile: (filePath, content) => {
        const validation = validator.validateFileModification(agentId, filePath);
        if (!validation.allowed) {
          throw new Error(`Permission denied: ${validation.reason}`);
        }
        return fs.writeFileSync(filePath, content);
      },
      
      modifyStorySection: (storyPath, sectionId, content) => {
        const validation = validator.validateStorySectionModification(agentId, sectionId);
        if (!validation.allowed) {
          throw new Error(`Permission denied: ${validation.reason}`);
        }
        
        // Read story file
        const storyContent = fs.readFileSync(storyPath, 'utf8');
        const story = yaml.load(storyContent);
        
        // Update only the allowed section
        if (story.sections) {
          const section = story.sections.find(s => s.id === sectionId);
          if (section) {
            section.content = content;
          }
        }
        
        // Write back
        fs.writeFileSync(storyPath, yaml.dump(story));
        return true;
      }
    };
  }
}

// Export for use in other modules
module.exports = AgentPermissionsValidator;

// CLI interface for testing
if (require.main === module) {
  const validator = new AgentPermissionsValidator();
  
  // Example usage
  console.log('Agent Permissions Validator\n');
  
  // Test QA agent trying to modify a file
  console.log('Test 1: QA agent trying to modify a code file');
  const result1 = validator.validateFileModification('qa', '/src/index.js');
  console.log(`Result: ${result1.allowed ? '✅ Allowed' : '❌ Denied'} - ${result1.reason}\n`);
  
  // Test QA agent trying to modify QA Results section
  console.log('Test 2: QA agent trying to modify QA Results section');
  const result2 = validator.validateStorySectionModification('qa', 'qa-results');
  console.log(`Result: ${result2.allowed ? '✅ Allowed' : '❌ Denied'} - ${result2.reason}\n`);
  
  // Test Dev agent trying to modify a file
  console.log('Test 3: Dev agent trying to modify a code file');
  const result3 = validator.validateFileModification('dev', '/src/index.js');
  console.log(`Result: ${result3.allowed ? '✅ Allowed' : '❌ Denied'} - ${result3.reason}\n`);
  
  // Show all agent permissions
  console.log('All Agent Permissions:');
  console.log('-'.repeat(50));
  Object.keys(validator.permissions).forEach(agentId => {
    const perms = validator.permissions[agentId];
    console.log(`\n${agentId.toUpperCase()} Agent:`);
    console.log(`  Can modify files: ${perms.canModifyFiles ? 'Yes' : 'No'}`);
    console.log(`  Allowed story sections: ${Array.isArray(perms.allowedStoryFileSections) ? perms.allowedStoryFileSections.join(', ') : perms.allowedStoryFileSections}`);
    console.log(`  Description: ${perms.description}`);
  });
}