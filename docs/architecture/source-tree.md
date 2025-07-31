# Source Tree Structure

## Root Directory Structure
```
SEMAD-METHOD/
├── bmad-core/                  # Core framework components
├── tools/                      # Build and utility tools
├── expansion-packs/            # Domain-specific extensions
├── dist/                       # Built output for web distribution
├── docs/                       # Documentation
├── tests/                      # Test files
└── scripts/                    # Build and maintenance scripts
```

## bmad-core/ Directory
```
bmad-core/
├── agents/                     # Individual AI agent definitions
│   ├── analyst.md
│   ├── architect.md
│   ├── dev.md
│   ├── pm.md
│   └── ... (other agents)
├── agent-teams/               # Pre-configured agent team compositions
├── workflows/                 # Task execution workflows
├── templates/                 # Document and code templates
├── structured-tasks/          # Task definitions (YAML format)
├── checklists/               # Quality assurance checklists
├── data/                     # Knowledge base files
├── utils/                    # Utility modules and helpers
└── schemas/                  # JSON schemas for validation
```

## tools/ Directory
```
tools/
├── builders/                  # Build system components
│   └── web-builder.js        # Web bundle builder
├── installer/                # NPX installer components
├── lib/                      # Shared utility libraries
├── md-assets/               # Markdown template assets
├── cli.js                   # Main CLI tool
├── task-runner.js           # Task execution engine
└── workflow-orchestrator.js # Workflow orchestration
```

## expansion-packs/ Directory
```
expansion-packs/
├── bmad-2d-phaser-game-dev/  # Phaser game development pack
├── bmad-2d-unity-game-dev/   # Unity game development pack
└── bmad-infrastructure-devops/ # Infrastructure/DevOps pack
```

## Key File Types and Patterns

### Agent Files (*.md)
- Markdown files with embedded YAML configuration
- Contains persona definition, commands, and dependencies
- Located in `bmad-core/agents/`

### Task Files (*.yaml)
- YAML structure defining task steps and parameters
- Located in `bmad-core/structured-tasks/`
- Used by agents to execute specific workflows

### Template Files (*.yaml)
- YAML-based templates for document generation
- Located in `bmad-core/templates/`
- Support variable substitution and conditional content

### Configuration Files
- `bmad-core/core-config.yaml`: Main system configuration
- `package.json`: NPM package configuration
- Various schema files for validation

## Build Artifacts
- `dist/`: Contains web-ready bundles
- Generated automatically by build process
- Includes agent bundles, team compositions, and dependencies