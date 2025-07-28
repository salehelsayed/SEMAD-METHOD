/**
 * Dependency Validator for BMad Method
 * Validates and checks dependencies across the system
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const ErrorHandler = require('./error-handler');

class DependencyValidator {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.bmadCore = path.join(rootDir, 'bmad-core');
    this.common = path.join(rootDir, 'common');
    this.cache = new Map();
  }
  
  /**
   * Validate all dependencies for an agent
   * @param {string} agentId - Agent identifier
   * @returns {Object} Validation result
   */
  async validateAgentDependencies(agentId) {
    const result = {
      valid: true,
      missing: [],
      circular: [],
      warnings: [],
      scanned: new Set()
    };
    
    try {
      const agentPath = path.join(this.bmadCore, 'agents', `${agentId}.md`);
      
      // Check if agent exists
      if (!(await this.fileExists(agentPath))) {
        result.valid = false;
        result.missing.push({
          type: 'agent',
          id: agentId,
          expected: agentPath
        });
        
        ErrorHandler.warn(`Agent not found: ${agentId}`, [
          `Expected location: ${agentPath}`,
          'Ensure the agent file exists with .md extension'
        ]);
        
        return result;
      }
      
      // Load agent configuration
      const agentContent = await fs.readFile(agentPath, 'utf8');
      const yamlMatch = agentContent.match(/```ya?ml\n([\s\S]*?)\n```/);
      
      if (!yamlMatch) {
        result.valid = false;
        result.warnings.push(`Agent ${agentId} has no YAML configuration block`);
        return result;
      }
      
      let agentConfig;
      try {
        agentConfig = yaml.load(yamlMatch[1]);
      } catch (error) {
        result.valid = false;
        result.warnings.push(`Agent ${agentId} has invalid YAML: ${error.message}`);
        return result;
      }
      
      // Validate dependencies
      await this.validateDependencyTree(
        agentConfig.dependencies || {},
        result,
        `agent:${agentId}`
      );
      
      return result;
      
    } catch (error) {
      result.valid = false;
      result.warnings.push(`Error validating ${agentId}: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Validate all dependencies for a team
   * @param {string} teamId - Team identifier
   * @returns {Object} Validation result
   */
  async validateTeamDependencies(teamId) {
    const result = {
      valid: true,
      missing: [],
      circular: [],
      warnings: [],
      scanned: new Set()
    };
    
    try {
      const teamPath = path.join(this.bmadCore, 'agent-teams', `${teamId}.yaml`);
      
      // Check if team exists
      if (!(await this.fileExists(teamPath))) {
        result.valid = false;
        result.missing.push({
          type: 'team',
          id: teamId,
          expected: teamPath
        });
        
        ErrorHandler.warn(`Team not found: ${teamId}`, [
          `Expected location: ${teamPath}`,
          'Ensure the team file exists with .yaml extension'
        ]);
        
        return result;
      }
      
      // Load team configuration
      let teamConfig;
      try {
        const teamContent = await fs.readFile(teamPath, 'utf8');
        teamConfig = yaml.load(teamContent);
      } catch (error) {
        result.valid = false;
        result.warnings.push(`Team ${teamId} has invalid YAML: ${error.message}`);
        return result;
      }
      
      // Validate team agents
      if (teamConfig.agents) {
        for (const agentId of teamConfig.agents) {
          if (agentId === '*') continue; // Skip wildcard
          
          const agentResult = await this.validateAgentDependencies(agentId);
          
          if (!agentResult.valid) {
            result.valid = false;
            result.missing.push(...agentResult.missing);
            result.warnings.push(...agentResult.warnings);
          }
        }
      }
      
      // Validate workflows
      if (teamConfig.workflows) {
        for (const workflowId of teamConfig.workflows) {
          const workflowPath = this.findResourcePath('workflows', workflowId);
          
          if (!workflowPath || !(await this.fileExists(workflowPath))) {
            result.valid = false;
            result.missing.push({
              type: 'workflow',
              id: workflowId,
              expected: `workflows/${workflowId}`
            });
          }
        }
      }
      
      return result;
      
    } catch (error) {
      result.valid = false;
      result.warnings.push(`Error validating team ${teamId}: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Validate a dependency tree recursively
   * @param {Object} dependencies - Dependencies object
   * @param {Object} result - Result object to populate
   * @param {string} parent - Parent identifier for circular check
   */
  async validateDependencyTree(dependencies, result, parent) {
    // Check for circular dependency
    if (result.scanned.has(parent)) {
      result.circular.push(parent);
      result.valid = false;
      return;
    }
    
    result.scanned.add(parent);
    
    const depTypes = ['tasks', 'templates', 'checklists', 'workflows', 'data', 'utils'];
    
    for (const depType of depTypes) {
      if (!dependencies[depType]) continue;
      
      for (const depId of dependencies[depType]) {
        const resourcePath = await this.findResourcePath(depType, depId);
        
        if (!resourcePath || !(await this.fileExists(resourcePath))) {
          result.valid = false;
          result.missing.push({
            type: depType,
            id: depId,
            parent: parent,
            searched: [
              path.join(this.bmadCore, depType, depId),
              path.join(this.common, depType, depId)
            ]
          });
          
          // For structured tasks/checklists, also check structured directories
          if (depType === 'tasks' || depType === 'checklists') {
            const structuredType = depType === 'tasks' ? 'structured-tasks' : 'structured-checklists';
            result.missing[result.missing.length - 1].searched.push(
              path.join(this.bmadCore, structuredType, depId),
              path.join(this.common, structuredType, depId)
            );
          }
        }
        
        // Check for nested dependencies in tasks
        if (depType === 'tasks' && resourcePath && await this.fileExists(resourcePath)) {
          await this.validateTaskDependencies(resourcePath, result, `${parent}>${depId}`);
        }
      }
    }
    
    result.scanned.delete(parent);
  }
  
  /**
   * Validate dependencies within a task
   * @param {string} taskPath - Path to task file
   * @param {Object} result - Result object
   * @param {string} parent - Parent identifier
   */
  async validateTaskDependencies(taskPath, result, parent) {
    try {
      // Check if it's a structured task
      if (taskPath.endsWith('.yaml')) {
        const content = await fs.readFile(taskPath, 'utf8');
        const task = yaml.load(content);
        
        // Check task dependencies
        if (task.dependencies) {
          await this.validateDependencyTree(task.dependencies, result, parent);
        }
        
        // Check step schemas
        if (task.steps) {
          for (const step of task.steps) {
            if (step.schema) {
              const schemaPath = await this.findSchemaPath(step.schema);
              
              if (!schemaPath || !(await this.fileExists(schemaPath))) {
                result.warnings.push(
                  `Schema '${step.schema}' referenced in ${parent} not found`
                );
              }
            }
          }
        }
      }
    } catch (error) {
      result.warnings.push(`Could not validate task ${parent}: ${error.message}`);
    }
  }
  
  /**
   * Find resource path with fallback locations
   * @param {string} type - Resource type
   * @param {string} id - Resource identifier
   * @returns {string|null} Resource path or null
   */
  async findResourcePath(type, id) {
    // Add appropriate extensions
    const extensions = {
      tasks: ['.yaml', '.md'],
      templates: ['.yaml', '.md'],
      checklists: ['.yaml', '.md'],
      workflows: ['.yaml'],
      data: ['.yaml', '.json', '.md'],
      utils: ['.js', '.yaml', '.md']
    };
    
    const exts = extensions[type] || ['.yaml', '.md'];
    
    // Check structured directories first for tasks/checklists
    if (type === 'tasks' || type === 'checklists') {
      const structuredType = type === 'tasks' ? 'structured-tasks' : 'structured-checklists';
      
      for (const ext of exts) {
        const paths = [
          path.join(this.bmadCore, structuredType, id + ext),
          path.join(this.common, structuredType, id + ext)
        ];
        
        for (const p of paths) {
          if (await this.fileExists(p)) {
            return p;
          }
        }
      }
    }
    
    // Check regular directories
    for (const ext of exts) {
      const paths = [
        path.join(this.bmadCore, type, id + ext),
        path.join(this.common, type, id + ext)
      ];
      
      for (const p of paths) {
        if (await this.fileExists(p)) {
          return p;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Find schema path
   * @param {string} schemaId - Schema identifier
   * @returns {string|null} Schema path or null
   */
  async findSchemaPath(schemaId) {
    const ModuleResolver = require('./module-resolver');
    
    // Try ModuleResolver first
    const resolved = ModuleResolver.resolveSchemaPath(schemaId, this.rootDir);
    if (resolved && await this.fileExists(resolved)) {
      return resolved;
    }
    
    // Try standard locations
    const possiblePaths = [
      path.join(this.bmadCore, 'schemas', `${schemaId}.json`),
      path.join(this.bmadCore, 'schemas', `${schemaId}-schema.json`),
      path.join(this.common, 'schemas', `${schemaId}.json`)
    ];
    
    for (const p of possiblePaths) {
      if (await this.fileExists(p)) {
        return p;
      }
    }
    
    return null;
  }
  
  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {boolean} True if exists
   */
  async fileExists(filePath) {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath);
    }
    
    try {
      await fs.access(filePath);
      this.cache.set(filePath, true);
      return true;
    } catch {
      this.cache.set(filePath, false);
      return false;
    }
  }
  
  /**
   * Validate all agents in the system
   * @returns {Object} Validation summary
   */
  async validateAllAgents() {
    const summary = {
      total: 0,
      valid: 0,
      invalid: 0,
      warnings: 0,
      details: {}
    };
    
    try {
      const agentFiles = await fs.readdir(path.join(this.bmadCore, 'agents'));
      const agents = agentFiles
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      
      summary.total = agents.length;
      
      for (const agentId of agents) {
        const result = await this.validateAgentDependencies(agentId);
        
        if (result.valid) {
          summary.valid++;
        } else {
          summary.invalid++;
        }
        
        if (result.warnings.length > 0) {
          summary.warnings++;
        }
        
        summary.details[agentId] = result;
      }
      
    } catch (error) {
      ErrorHandler.handle(error, {
        operation: 'Validate all agents'
      });
    }
    
    return summary;
  }
  
  /**
   * Generate validation report
   * @param {Object} validationResult - Validation result
   * @returns {string} Formatted report
   */
  generateReport(validationResult) {
    const lines = [];
    
    lines.push('Dependency Validation Report');
    lines.push('===========================\n');
    
    if (validationResult.valid) {
      lines.push('✓ All dependencies are valid\n');
    } else {
      lines.push('✗ Dependency validation failed\n');
      
      if (validationResult.missing.length > 0) {
        lines.push('Missing Dependencies:');
        validationResult.missing.forEach(dep => {
          lines.push(`  - ${dep.type}/${dep.id}`);
          lines.push(`    Parent: ${dep.parent}`);
          lines.push(`    Searched:`);
          dep.searched?.forEach(path => {
            lines.push(`      - ${path}`);
          });
        });
        lines.push('');
      }
      
      if (validationResult.circular.length > 0) {
        lines.push('Circular Dependencies:');
        validationResult.circular.forEach(dep => {
          lines.push(`  - ${dep}`);
        });
        lines.push('');
      }
    }
    
    if (validationResult.warnings.length > 0) {
      lines.push('Warnings:');
      validationResult.warnings.forEach(warning => {
        lines.push(`  - ${warning}`);
      });
    }
    
    return lines.join('\n');
  }
}

module.exports = DependencyValidator;