const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { extractYamlFromAgent } = require('./yaml-utils');
const StructuredTaskLoader = require('./structured-task-loader');

class DependencyResolver {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.bmadCore = path.join(rootDir, 'bmad-core');
    this.common = path.join(rootDir, 'common');
    this.cache = new Map();
    this.taskLoader = new StructuredTaskLoader(rootDir);
  }

  async resolveAgentDependencies(agentId) {
    const agentPath = path.join(this.bmadCore, 'agents', `${agentId}.md`);
    let agentContent;
    
    try {
      agentContent = await fs.readFile(agentPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Agent file not found: ${agentPath}\nMake sure the agent '${agentId}' exists in bmad-core/agents/`);
      }
      throw error;
    }
    
    // Extract YAML from markdown content with command cleaning
    const yamlContent = extractYamlFromAgent(agentContent, true);
    if (!yamlContent) {
      throw new Error(`No YAML configuration found in agent ${agentId}\nAgent files must contain a YAML configuration block enclosed in triple backticks`);
    }
    
    let agentConfig;
    try {
      agentConfig = yaml.load(yamlContent);
    } catch (error) {
      throw new Error(`Failed to parse YAML in agent ${agentId}: ${error.message}\nCheck the YAML syntax in the agent configuration`);
    }
    
    const dependencies = {
      agent: {
        id: agentId,
        path: agentPath,
        content: agentContent,
        config: agentConfig
      },
      resources: []
    };

    // Personas are now embedded in agent configs, no need to resolve separately

    // Resolve other dependencies
    const depTypes = ['tasks', 'templates', 'checklists', 'data', 'utils'];
    for (const depType of depTypes) {
      const deps = agentConfig.dependencies?.[depType] || [];
      for (const depId of deps) {
        const resource = await this.loadResource(depType, depId);
        if (resource) dependencies.resources.push(resource);
      }
    }

    return dependencies;
  }

  async resolveTeamDependencies(teamId) {
    const teamPath = path.join(this.bmadCore, 'agent-teams', `${teamId}.yaml`);
    let teamContent;
    
    try {
      teamContent = await fs.readFile(teamPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Team file not found: ${teamPath}\nMake sure the team '${teamId}' exists in bmad-core/agent-teams/`);
      }
      throw error;
    }
    
    let teamConfig;
    try {
      teamConfig = yaml.load(teamContent);
    } catch (error) {
      throw new Error(`Failed to parse YAML in team ${teamId}: ${error.message}\nCheck the YAML syntax in the team configuration`);
    }
    
    const dependencies = {
      team: {
        id: teamId,
        path: teamPath,
        content: teamContent,
        config: teamConfig
      },
      agents: [],
      resources: new Map() // Use Map to deduplicate resources
    };

    // Always add bmad-orchestrator agent first if it's a team
    const bmadAgent = await this.resolveAgentDependencies('bmad-orchestrator');
    dependencies.agents.push(bmadAgent.agent);
    bmadAgent.resources.forEach(res => {
      dependencies.resources.set(res.path, res);
    });

    // Resolve all agents in the team
    let agentsToResolve = teamConfig.agents || [];
    
    // Handle wildcard "*" - include all agents except bmad-master
    if (agentsToResolve.includes('*')) {
      const allAgents = await this.listAgents();
      // Remove wildcard and add all agents except those already in the list and bmad-master
      agentsToResolve = agentsToResolve.filter(a => a !== '*');
      for (const agent of allAgents) {
        if (!agentsToResolve.includes(agent) && agent !== 'bmad-master') {
          agentsToResolve.push(agent);
        }
      }
    }
    
    for (const agentId of agentsToResolve) {
      if (agentId === 'bmad-orchestrator' || agentId === 'bmad-master') continue; // Already added or excluded
      const agentDeps = await this.resolveAgentDependencies(agentId);
      dependencies.agents.push(agentDeps.agent);
      
      // Add resources with deduplication
      agentDeps.resources.forEach(res => {
        dependencies.resources.set(res.path, res);
      });
    }

    // Resolve workflows
    for (const workflowId of teamConfig.workflows || []) {
      const resource = await this.loadResource('workflows', workflowId);
      if (resource) dependencies.resources.set(resource.path, resource);
    }

    // Convert Map back to array
    dependencies.resources = Array.from(dependencies.resources.values());

    return dependencies;
  }

  async loadResource(type, id) {
    const cacheKey = `${type}#${id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let content = null;
      let filePath = null;
      let structuredData = null;

      // Check if structured tasks are enabled
      const structuredEnabled = await this.taskLoader.isStructuredTasksEnabled();
      
      // For tasks and checklists, check structured directories first if enabled
      if (structuredEnabled && (type === 'tasks' || type === 'checklists')) {
        const structuredType = type === 'tasks' ? 'structured-tasks' : 'structured-checklists';
        
        // First try structured directories in bmad-core
        try {
          filePath = path.join(this.bmadCore, structuredType, id);
          if (type === 'tasks') {
            const taskData = await this.taskLoader.loadTask(filePath);
            content = taskData.type === 'structured' ? 
              this.taskLoader.convertTaskToMarkdown(taskData.data) : 
              taskData.raw;
            structuredData = taskData.data;
          } else {
            const checklistData = await this.taskLoader.loadChecklist(filePath);
            content = checklistData.type === 'structured' ? 
              this.taskLoader.convertChecklistToMarkdown(checklistData.data) : 
              checklistData.raw;
            structuredData = checklistData.data;
          }
        } catch (e) {
          // Try structured directories in common
          try {
            filePath = path.join(this.common, structuredType, id);
            if (type === 'tasks') {
              const taskData = await this.taskLoader.loadTask(filePath);
              content = taskData.type === 'structured' ? 
                this.taskLoader.convertTaskToMarkdown(taskData.data) : 
                taskData.raw;
              structuredData = taskData.data;
            } else {
              const checklistData = await this.taskLoader.loadChecklist(filePath);
              content = checklistData.type === 'structured' ? 
                this.taskLoader.convertChecklistToMarkdown(checklistData.data) : 
                checklistData.raw;
              structuredData = checklistData.data;
            }
          } catch (e2) {
            // Fall back to regular directories
            filePath = null;
            content = null;
          }
        }
      }

      // If not found in structured directories or structured not enabled, try regular locations
      if (!content) {
        // First try bmad-core
        try {
          filePath = path.join(this.bmadCore, type, id);
          content = await fs.readFile(filePath, 'utf8');
        } catch (e) {
          // If not found in bmad-core, try common folder
          try {
            filePath = path.join(this.common, type, id);
            content = await fs.readFile(filePath, 'utf8');
          } catch (e2) {
            // File not found in either location
          }
        }
      }

      if (!content) {
        console.warn(`⚠️  Resource not found: ${type}/${id}`);
        console.warn(`   Searched in: bmad-core/${type} and common/${type}`);
        return null;
      }

      const resource = {
        type,
        id,
        path: filePath,
        content,
        structuredData
      };

      this.cache.set(cacheKey, resource);
      return resource;
    } catch (error) {
      console.error(`❌ Error loading resource ${type}/${id}:`, error.message);
      if (error.code === 'ENOENT') {
        console.error(`   File not found in expected locations`);
      }
      return null;
    }
  }

  async listAgents() {
    try {
      const files = await fs.readdir(path.join(this.bmadCore, 'agents'));
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    } catch (error) {
      return [];
    }
  }

  async listTeams() {
    try {
      const files = await fs.readdir(path.join(this.bmadCore, 'agent-teams'));
      return files
        .filter(f => f.endsWith('.yaml'))
        .map(f => f.replace('.yaml', ''));
    } catch (error) {
      return [];
    }
  }
}

module.exports = DependencyResolver;
