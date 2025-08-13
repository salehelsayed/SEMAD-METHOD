const fs = require('fs').promises;
const path = require('path');
const { InstructionHierarchyManager } = require('./instruction-hierarchy-manager');

class HierarchyUpdater {
  constructor() {
    this.manager = new InstructionHierarchyManager();
  }
  
  async updateFromAgent(agentPath) {
    console.log(`[UPDATER] Updating hierarchy from agent: ${agentPath}`);
    
    try {
      const agentConfig = await this.loadAgentConfig(agentPath);
      const instructions = this.extractInstructionsFromAgent(agentConfig);
      
      if (instructions.length > 0) {
        await this.manager.updateHierarchy('agent', instructions, {
          scope: 'individual-agent',
          priority: 4,
          overridable: true
        });
        
        console.log(`[UPDATER] Added ${instructions.length} instructions from ${path.basename(agentPath)}`);
      }
    } catch (error) {
      console.error(`[UPDATER] Failed to update from agent: ${error.message}`);
    }
  }
  
  async updateFromTeam(teamPath) {
    console.log(`[UPDATER] Updating hierarchy from team: ${teamPath}`);
    
    try {
      const teamConfig = await this.loadTeamConfig(teamPath);
      const instructions = this.extractInstructionsFromTeam(teamConfig);
      
      if (instructions.length > 0) {
        await this.manager.updateHierarchy('team', instructions, {
          scope: 'agent-team',
          priority: 3,
          overridable: true
        });
        
        console.log(`[UPDATER] Added ${instructions.length} team instructions from ${path.basename(teamPath)}`);
      }
    } catch (error) {
      console.error(`[UPDATER] Failed to update from team: ${error.message}`);
    }
  }
  
  async scanAndUpdateAll() {
    console.log('[UPDATER] Scanning all agents and teams for instructions...');
    
    const bmadCore = path.join(process.cwd(), 'bmad-core');
    
    // Scan agents
    const agentsDir = path.join(bmadCore, 'agents');
    try {
      const agentFiles = await fs.readdir(agentsDir);
      for (const file of agentFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await this.updateFromAgent(path.join(agentsDir, file));
        }
      }
    } catch (error) {
      console.log('[UPDATER] No agents directory found');
    }
    
    // Scan teams
    const teamsDir = path.join(bmadCore, 'agent-teams');
    try {
      const teamFiles = await fs.readdir(teamsDir);
      for (const file of teamFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await this.updateFromTeam(path.join(teamsDir, file));
        }
      }
    } catch (error) {
      console.log('[UPDATER] No teams directory found');
    }
    
    console.log('[UPDATER] Scan complete');
  }
  
  async loadAgentConfig(agentPath) {
    const content = await fs.readFile(agentPath, 'utf-8');
    return this.parseYaml(content);
  }
  
  async loadTeamConfig(teamPath) {
    const content = await fs.readFile(teamPath, 'utf-8');
    return this.parseYaml(content);
  }
  
  parseYaml(content) {
    // Simple YAML parsing for instructions
    const lines = content.split('\n');
    const config = {};
    let currentSection = null;
    let currentArray = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes(':') && !trimmed.startsWith('-')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        if (value) {
          config[key] = value;
        } else {
          currentSection = key;
          config[key] = {};
        }
      } else if (trimmed.startsWith('-') && currentSection) {
        const value = trimmed.substring(1).trim();
        if (!currentArray) {
          currentArray = [];
          config[currentSection] = currentArray;
        }
        currentArray.push(value);
      } else if (trimmed === '' || trimmed.startsWith('#')) {
        currentArray = null;
      }
    }
    
    return config;
  }
  
  extractInstructionsFromAgent(agentConfig) {
    const instructions = [];
    
    // Look for common instruction fields
    const instructionFields = [
      'instructions',
      'guidelines',
      'rules',
      'constraints',
      'requirements'
    ];
    
    for (const field of instructionFields) {
      if (agentConfig[field]) {
        if (Array.isArray(agentConfig[field])) {
          instructions.push(...agentConfig[field]);
        } else if (typeof agentConfig[field] === 'string') {
          instructions.push(agentConfig[field]);
        }
      }
    }
    
    return instructions.filter(inst => inst && inst.length > 10); // Filter meaningful instructions
  }
  
  extractInstructionsFromTeam(teamConfig) {
    const instructions = [];
    
    // Look for team-level instructions
    if (teamConfig.collaboration_rules) {
      if (Array.isArray(teamConfig.collaboration_rules)) {
        instructions.push(...teamConfig.collaboration_rules);
      }
    }
    
    if (teamConfig.workflow_rules) {
      if (Array.isArray(teamConfig.workflow_rules)) {
        instructions.push(...teamConfig.workflow_rules);
      }
    }
    
    return instructions.filter(inst => inst && inst.length > 10);
  }
}

module.exports = { HierarchyUpdater };

if (require.main === module) {
  const updater = new HierarchyUpdater();
  const command = process.argv[2];
  
  switch (command) {
    case 'scan':
      updater.scanAndUpdateAll().then(() => {
        console.log('[UPDATER] Hierarchy update complete');
      });
      break;
    case 'agent':
      const agentPath = process.argv[3];
      if (agentPath) {
        updater.updateFromAgent(agentPath).then(() => {
          console.log('[UPDATER] Agent hierarchy update complete');
        });
      }
      break;
    case 'team':
      const teamPath = process.argv[3];
      if (teamPath) {
        updater.updateFromTeam(teamPath).then(() => {
          console.log('[UPDATER] Team hierarchy update complete');
        });
      }
      break;
    default:
      console.log('Usage: node hierarchy-updater.js [scan|agent|team] [path]');
  }
}