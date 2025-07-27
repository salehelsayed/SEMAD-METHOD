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
    const agentContent = await fs.readFile(agentPath, 'utf8');
    
    // Extract YAML from markdown content with command cleaning
    const yamlContent = extractYamlFromAgent(agentContent, true);
    if (!yamlContent) {
      throw new Error(`No YAML configuration found in agent ${agentId}`);
    }
    
    const agentConfig = yaml.load(yamlContent);
    
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
    const teamContent = await fs.readFile(teamPath, 'utf8');
    const teamConfig = yaml.load(teamContent);
    
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
        console.warn(`Resource not found: ${type}/${id}`);
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
      console.error(`Error loading resource ${type}/${id}:`, error.message);
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
