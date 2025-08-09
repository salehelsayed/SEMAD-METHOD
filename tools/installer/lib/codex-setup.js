const path = require("path");
const fs = require("fs-extra");
const yaml = require("js-yaml");
const chalk = require("chalk");
const fileManager = require("./file-manager");
const { extractYamlFromAgent } = require("../../lib/yaml-utils");

class CodexSetup {
  constructor() {
    this.agentsMdContent = "";
  }

  /**
   * Setup Codex CLI integration by creating AGENTS.md files
   * @param {string} installDir - Installation directory
   * @param {string} selectedAgent - Specific agent to setup (optional)
   * @returns {boolean} Success status
   */
  async setup(installDir, selectedAgent = null) {
    console.log(chalk.blue("\n🤖 Setting up OpenAI Codex CLI integration..."));
    
    // Create main AGENTS.md in project root
    const agentsMdPath = path.join(installDir, "AGENTS.md");
    
    // Check if AGENTS.md already exists
    let existingContent = "";
    if (await fileManager.pathExists(agentsMdPath)) {
      existingContent = await fileManager.readFile(agentsMdPath);
      console.log(chalk.yellow("Found existing AGENTS.md file. Will append BMad agents section."));
    }
    
    // Generate BMad agents section
    const bmadSection = await this.generateBmadAgentsSection(installDir, selectedAgent);
    
    // Combine content
    let finalContent = existingContent;
    if (existingContent && !existingContent.includes("# BMad Method Agents")) {
      finalContent += "\n\n---\n\n" + bmadSection;
    } else if (!existingContent) {
      finalContent = bmadSection;
    } else {
      console.log(chalk.dim("BMad agents section already exists in AGENTS.md"));
      return true;
    }
    
    // Write AGENTS.md
    await fileManager.writeFile(agentsMdPath, finalContent);
    console.log(chalk.green("✓ Created/Updated AGENTS.md in project root"));
    
    // Create .codex directory structure
    await this.setupCodexConfig(installDir, selectedAgent);
    
    // Create agent-specific AGENTS.md files in .bmad-core
    await this.createAgentSpecificFiles(installDir, selectedAgent);
    
    console.log(chalk.green("\n✓ OpenAI Codex CLI setup complete!"));
    console.log(chalk.dim("\nUsage examples:"));
    console.log(chalk.cyan("  codex 'activate dev agent and implement the next story'"));
    console.log(chalk.cyan("  codex 'as qa agent, review the latest implementation'"));
    console.log(chalk.cyan("  codex 'use sm agent to create a new story for user authentication'"));
    
    return true;
  }

  /**
   * Generate BMad agents section for AGENTS.md
   */
  async generateBmadAgentsSection(installDir, selectedAgent) {
    let content = "# BMad Method Agents\n\n";
    content += "This project uses the SEMAD-METHOD framework with specialized AI agents for different development tasks.\n\n";
    content += "## Available Agents\n\n";
    
    const agents = selectedAgent ? [selectedAgent] : await this.getAllAgentIds(installDir);
    
    for (const agentId of agents) {
      const agentPath = await this.findAgentPath(agentId, installDir);
      
      if (agentPath) {
        const agentContent = await fileManager.readFile(agentPath);
        const agentInfo = this.extractAgentInfo(agentContent);
        
        content += `### ${agentInfo.icon} ${agentInfo.title} (\`${agentId}\`)\n\n`;
        content += `**When to use:** ${agentInfo.whenToUse}\n\n`;
        content += `**Activation:** To activate this agent, say "activate ${agentId} agent" or "as ${agentId} agent"\n\n`;
        
        // Add role and persona details
        if (agentInfo.role) {
          content += `**Role:** ${agentInfo.role}\n\n`;
        }
        
        // Add key commands
        if (agentInfo.commands && agentInfo.commands.length > 0) {
          content += "**Key Commands:**\n";
          agentInfo.commands.forEach(cmd => {
            content += `- \`*${cmd.name}\`: ${cmd.description}\n`;
          });
          content += "\n";
        }
        
        // Add agent-specific instructions
        content += `**Agent Definition:** The complete agent configuration is in \`.bmad-core/agents/${agentId}.md\`\n\n`;
        
        // Add activation instructions
        content += "**Activation Instructions:**\n";
        content += "```yaml\n";
        content += "# When this agent is activated, follow these steps:\n";
        content += agentInfo.activationInstructions || "# See agent file for detailed activation instructions\n";
        content += "```\n\n";
      }
    }
    
    // Add workflow information
    content += "## Development Workflow\n\n";
    content += "The SEMAD-METHOD follows this structured workflow:\n\n";
    content += "1. **Planning Phase**: Use `analyst`, `pm`, and `architect` agents to create PRD and Architecture docs\n";
    content += "2. **Story Creation**: Use `sm` (Scrum Master) agent to create implementation stories with StoryContracts\n";
    content += "3. **Implementation**: Use `dev` agent to implement stories following the StoryContract specifications\n";
    content += "4. **Quality Assurance**: Use `qa` agent to review and validate implementations\n\n";
    
    // Add important files and directories
    content += "## Project Structure\n\n";
    content += "- `.bmad-core/`: Framework configuration and agent definitions\n";
    content += "- `docs/stories/`: Development stories with StoryContracts\n";
    content += "- `docs/prd/`: Product requirement documents\n";
    content += "- `docs/architecture/`: Architecture documentation\n";
    content += "- `.ai/`: Agent working memory and progress tracking\n\n";
    
    // Add testing and validation commands
    content += "## Testing and Validation\n\n";
    content += "```bash\n";
    content += "# Run all tests\n";
    content += "npm test\n\n";
    content += "# Validate all configurations\n";
    content += "npm run validate\n\n";
    content += "# Run linting\n";
    content += "npm run lint\n";
    content += "```\n\n";
    
    // Add agent coordination rules
    content += "## Agent Coordination Rules\n\n";
    content += "1. Agents should read their full YAML configuration from their `.md` files\n";
    content += "2. Follow the activation instructions exactly as specified\n";
    content += "3. Use the `.ai/` directory for progress tracking and memory\n";
    content += "4. StoryContract in story files is the single source of truth for implementation\n";
    content += "5. Update only authorized sections when modifying story files\n\n";
    
    return content;
  }

  /**
   * Setup Codex configuration directory
   */
  async setupCodexConfig(installDir, selectedAgent) {
    const codexDir = path.join(process.env.HOME || process.env.USERPROFILE, ".codex");
    await fileManager.ensureDirectory(codexDir);
    
    // Create instructions.md with BMad context
    const instructionsPath = path.join(codexDir, "instructions.md");
    let instructionsContent = "# Global Codex Instructions for BMad Projects\n\n";
    instructionsContent += "When working in a BMad/SEMAD-METHOD project:\n\n";
    instructionsContent += "1. Check for `.bmad-core/` directory to identify BMad projects\n";
    instructionsContent += "2. Read AGENTS.md for available agents and their activation commands\n";
    instructionsContent += "3. Follow agent-specific workflows defined in agent files\n";
    instructionsContent += "4. Use StoryContract specifications as the source of truth\n";
    instructionsContent += "5. Track progress in `.ai/` directory\n\n";
    instructionsContent += "## Agent Activation Patterns\n\n";
    instructionsContent += "- 'activate [agent] agent' - Switch to agent persona\n";
    instructionsContent += "- 'as [agent] agent' - Execute command as specific agent\n";
    instructionsContent += "- '*[command]' - Execute agent-specific command\n\n";
    
    // Only write if it doesn't exist to avoid overwriting user customizations
    if (!await fileManager.pathExists(instructionsPath)) {
      await fileManager.writeFile(instructionsPath, instructionsContent);
      console.log(chalk.green("✓ Created ~/.codex/instructions.md with BMad context"));
    } else {
      console.log(chalk.dim("~/.codex/instructions.md already exists, skipping..."));
    }
    
    // Create config.toml for model configuration
    const configPath = path.join(codexDir, "config.toml");
    if (!await fileManager.pathExists(configPath)) {
      let configContent = `# OpenAI Codex CLI Configuration
model = "o4-mini"  # Default model, can be changed to gpt-4.1, o3, etc.

# Approval policy
approval_policy = "auto-edit"  # Options: suggest, auto-edit, full-auto

# Sandbox configuration  
sandbox = "directory"  # Options: none, directory, network-disabled

# BMad-specific settings
[bmad]
track_progress = true
use_story_contracts = true
validate_on_save = true
`;
      
      await fileManager.writeFile(configPath, configContent);
      console.log(chalk.green("✓ Created ~/.codex/config.toml with BMad settings"));
    }
  }

  /**
   * Create agent-specific AGENTS.md files
   */
  async createAgentSpecificFiles(installDir, selectedAgent) {
    const agents = selectedAgent ? [selectedAgent] : await this.getAllAgentIds(installDir);
    
    for (const agentId of agents) {
      const agentPath = await this.findAgentPath(agentId, installDir);
      
      if (agentPath) {
        // Create AGENTS.md in the agent's directory
        const agentDir = path.dirname(agentPath);
        const agentSpecificMdPath = path.join(agentDir, `AGENTS-${agentId}.md`);
        
        const agentContent = await fileManager.readFile(agentPath);
        const agentInfo = this.extractAgentInfo(agentContent);
        
        let mdContent = `# ${agentInfo.title} Agent Instructions\n\n`;
        mdContent += `This file provides specific instructions for the ${agentInfo.title} agent.\n\n`;
        mdContent += `## Activation\n\n`;
        mdContent += `When activated as the ${agentId} agent, you must:\n\n`;
        mdContent += `1. Read the full agent definition from ${path.basename(agentPath)}\n`;
        mdContent += `2. Follow the activation-instructions section exactly\n`;
        mdContent += `3. Stay in character until explicitly told to exit\n\n`;
        mdContent += `## Agent Configuration\n\n`;
        mdContent += "```yaml\n";
        mdContent += extractYamlFromAgent(agentContent) || agentContent;
        mdContent += "\n```\n\n";
        mdContent += `## Working Directory\n\n`;
        mdContent += `- Use \`.ai/\` for progress tracking\n`;
        mdContent += `- Log observations to \`.ai/history/${agentId}_log.jsonl\`\n`;
        mdContent += `- Track tasks in \`.ai/${agentId}_tasks.json\`\n\n`;
        
        await fileManager.writeFile(agentSpecificMdPath, mdContent);
        console.log(chalk.green(`✓ Created ${path.basename(agentSpecificMdPath)}`));
      }
    }
  }

  /**
   * Extract agent information from content
   */
  extractAgentInfo(agentContent) {
    const info = {
      title: "Unknown Agent",
      icon: "🤖",
      whenToUse: "Specialized tasks",
      role: null,
      commands: [],
      activationInstructions: null
    };
    
    const yamlContent = extractYamlFromAgent(agentContent);
    if (yamlContent) {
      // Extract various fields
      const titleMatch = yamlContent.match(/title:\s*(.+)/);
      const iconMatch = yamlContent.match(/icon:\s*(.+)/);
      const whenToUseMatch = yamlContent.match(/whenToUse:\s*"([^"]+)"/);
      const roleMatch = yamlContent.match(/role:\s*(.+)/);
      
      if (titleMatch) info.title = titleMatch[1].trim();
      if (iconMatch) info.icon = iconMatch[1].trim();
      if (whenToUseMatch) info.whenToUse = whenToUseMatch[1].trim();
      if (roleMatch) info.role = roleMatch[1].trim();
      
      // Extract commands
      const commandsMatch = yamlContent.match(/commands:[\s\S]*?(?=\n[a-z]|\n$)/);
      if (commandsMatch) {
        const commandLines = commandsMatch[0].split('\n').slice(1);
        commandLines.forEach(line => {
          const cmdMatch = line.match(/^\s*-\s*(\w+):\s*(.+)/);
          if (cmdMatch) {
            info.commands.push({
              name: cmdMatch[1],
              description: cmdMatch[2].replace(/['"]/g, '').trim()
            });
          }
        });
      }
      
      // Extract activation instructions
      const activationMatch = yamlContent.match(/activation-instructions:[\s\S]*?(?=\n[a-z]|\n$)/);
      if (activationMatch) {
        info.activationInstructions = activationMatch[0];
      }
    }
    
    return info;
  }

  /**
   * Find agent path
   */
  async findAgentPath(agentId, installDir) {
    const possiblePaths = [
      path.join(installDir, ".bmad-core", "agents", `${agentId}.md`),
      path.join(installDir, "bmad-core", "agents", `${agentId}.md`),
      path.join(installDir, "agents", `${agentId}.md`)
    ];
    
    for (const agentPath of possiblePaths) {
      if (await fileManager.pathExists(agentPath)) {
        return agentPath;
      }
    }
    
    return null;
  }

  /**
   * Get all agent IDs
   */
  async getAllAgentIds(installDir) {
    const glob = require("glob");
    const allAgentIds = [];
    
    // Check various locations
    const locations = [
      path.join(installDir, ".bmad-core", "agents"),
      path.join(installDir, "bmad-core", "agents"),
      path.join(installDir, "agents")
    ];
    
    for (const location of locations) {
      if (await fileManager.pathExists(location)) {
        const agentFiles = glob.sync("*.md", { cwd: location });
        allAgentIds.push(...agentFiles.map(file => path.basename(file, ".md")));
      }
    }
    
    return [...new Set(allAgentIds)];
  }
}

module.exports = new CodexSetup();