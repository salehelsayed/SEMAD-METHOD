# SEMAD-METHOD: Structured Engineering Multi-Agent Development

*A fork of [BMad-Method](https://github.com/bmadcode/bmad-method) with significant structural improvements for reduced hallucination and enhanced reliability*

[![Version](https://img.shields.io/npm/v/bmad-method?color=blue&label=base-version)](https://www.npmjs.com/package/bmad-method)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![Test Status](https://img.shields.io/badge/tests-284%20passing-success)](testsprite_tests/testsprite-post-fix-validation-report.md)

SEMAD-METHOD is an enhanced fork of the BMad-Method framework that introduces structured engineering practices to multi-agent AI development. This fork focuses on reducing hallucination, improving agent reliability, and ensuring deterministic behavior through YAML/JSON-based task definitions, structured memory systems, and formal contract specifications.

## 🚀 Key Improvements in SEMAD-METHOD

This fork introduces eight major improvements over the original BMad-Method:

### 1. **Structured Tasks & Checklists (YAML/JSON)**
- **What Changed**: Converted all free-form Markdown tasks to structured YAML format with explicit schemas
- **Why**: Eliminates ambiguity and LLM interpretation errors
- **Impact**: Deterministic task execution with validation support
- **Files**: All tasks in `bmad-core/structured-tasks/`, validated by schemas in `bmad-core/schemas/`

### 2. **Simple Task Tracking System**
- **What Changed**: Added lightweight task tracking for agent workflows
- **Why**: Ensures systematic completion of all tasks without missing items
- **Impact**: Agents can track progress through complex multi-step operations
- **Implementation**: In-memory tracking with `.ai/` directory for persistence, simple file-based logging
- **Key Files**: `simple-task-tracker.js` for workflow tracking, `track-progress.js` for persistent observations

### 3. **Dynamic Plan Adaptation**
- **What Changed**: Automatic task decomposition for complex operations
- **Why**: Prevents monolithic processing of large instruction sets
- **Impact**: Better handling of complex tasks through divide-and-conquer approach
- **Files**: `bmad-core/tools/dynamic-planner.js`, `bmad-core/structured-tasks/dynamic-plan-rules.yaml`

### 4. **Automated Search Tools Generation**
- **What Changed**: PRD-driven search query generation for documentation retrieval
- **Why**: Improves context by automatically identifying needed external resources
- **Impact**: Agents have access to relevant documentation during development
- **Usage**: `npm run generate:search-tools`

### 5. **StoryContract Specification**
- **What Changed**: Formal contract blocks in story files replacing prose summaries
- **Why**: Eliminates hallucination between PRD and story creation
- **Impact**: Developers work from structured specifications, not interpretations
- **Schema**: `bmad-core/schemas/story-contract-schema.json`

### 6. **Contract-Driven Development**
- **What Changed**: Dev agent uses StoryContract as single source of truth
- **Why**: Prevents implementation drift from requirements
- **Impact**: Direct traceability from requirements to implementation

### 7. **Comprehensive Validation System**
- **What Changed**: JSON Schema validation for all artifacts
- **Why**: Catches errors before they propagate through the workflow
- **Impact**: Build-time validation ensures quality
- **Scripts**: `npm run validate`, `scripts/validate-all.js`

### 8. **Enhanced Testing & Error Handling**
- **What Changed**: Complete test coverage with 284 passing tests
- **Why**: Ensures reliability across all components
- **Impact**: Production-ready system with deterministic behavior
- **Status**: 100% test pass rate achieved

### 9. **Dev↔QA Iterative Flow Option** *(New)*
- **What Changed**: Added choice between linear Dev→QA flow and iterative Dev↔QA loop
- **Why**: Different projects need different quality assurance approaches
- **Impact**: Teams can choose immediate iteration on QA findings or batch processing
- **Usage**: `npm run orchestrate` or configure in `.bmad-workflow.yaml`

## 📊 Results

These improvements have transformed BMad-Method into a production-ready system:
- **Test Coverage**: 284 tests, 100% passing
- **Agent Reliability**: 16/16 agent connectivity tests passing
- **Dependency Management**: All 135 dependencies validated and working
- **Hallucination Reduction**: Structured contracts eliminate interpretation errors
- **Task Tracking**: Simple, reliable progress tracking ensures nothing gets missed

**Original Project Links:**
- **[Subscribe to BMadCode on YouTube](https://www.youtube.com/@BMadCode?sub_confirmation=1)** - Original BMad-Method creator
- **[Join the BMad Discord Community](https://discord.gg/gk8jAdXWmj)** - Get help and share ideas

⭐ **If you find this project helpful or useful, please give it a star!** It helps others discover SEMAD-METHOD and the improvements it brings to multi-agent development!

## Overview

**SEMAD-METHOD builds on BMad's Two Key Innovations:**

**1. Structured Agentic Planning:** Dedicated agents (Analyst, PM, Architect) collaborate with you to create detailed, consistent PRDs and Architecture documents. SEMAD enhances this with structured YAML tasks, simple task tracking, and dynamic plan adaptation to ensure consistent, hallucination-free planning.

**2. Contract-Driven Development:** The Scrum Master agent transforms detailed plans into structured StoryContract specifications embedded in development stories. SEMAD's formal contract system ensures Dev agents work from explicit specifications, not interpretations, eliminating implementation drift.

**3. Validated Engineering Workflow:** Every artifact - from tasks to stories to implementations - is validated against formal schemas. Combined with comprehensive testing (284 tests, 100% passing), SEMAD ensures production-ready reliability.

This enhanced approach eliminates **planning inconsistency**, **context loss**, and **hallucination** - the biggest problems in AI-assisted development. Your Dev agent opens a story file with a formal contract specification and complete understanding of what to build, how to build it, and why.

**📖 [See the complete workflow in the User Guide](bmad-core/user-guide.md)** - Planning phase, development cycle, and all agent roles

## Quick Navigation

### Understanding the SEMAD Workflow

**Before diving in, review these critical workflow diagrams that explain how SEMAD-METHOD works:**

1. **[Planning Workflow (Web UI)](bmad-core/user-guide.md#the-planning-workflow-web-ui)** - How to create PRD and Architecture documents with structured validation
2. **[Core Development Cycle (IDE)](bmad-core/user-guide.md#the-core-development-cycle-ide)** - How SM, Dev, and QA agents collaborate through StoryContract specifications

> ⚠️ **These diagrams explain 90% of SEMAD Method workflow confusion** - Understanding the PRD+Architecture creation, StoryContract generation, and the SM/Dev/QA workflow with formal contracts is essential - and also explains why this provides deterministic, hallucination-free development!

### 📚 Documentation

- **[Getting Started](GETTING-STARTED.md)** → Installation and setup guide
- **[Architecture](ARCHITECTURE.md)** → Technical architecture and design
- **[Agents Reference](AGENTS.md)** → All agents and their capabilities
- **[Workflows](WORKFLOWS.md)** → Two-phase workflow system
- **[API Reference](API-REFERENCE.md)** → Complete API documentation
- **[User Guide](bmad-core/user-guide.md)** → Complete workflow walkthrough
- **[Reverse Alignment](docs/reverse-alignment.md)** → Keep docs and stories aligned to code

### What would you like to do?

- **[Install SEMAD-METHOD](#installation)** → Clone and set up the framework
- **[Learn the workflow](WORKFLOWS.md)** → Understand the two-phase system
- **[See available AI agents](AGENTS.md)** → Specialized roles for your team
- **[Browse expansion packs](expansion-packs/)** → Game dev, DevOps, and more
- **[Join the community](https://discord.gg/gk8jAdXWmj)** → Get help and share ideas

## Prerequisites

Before using SEMAD-METHOD, ensure you have the following installed:

### Required Dependencies

1. **Node.js v20 or higher** - [Download Node.js](https://nodejs.org)
   ```bash
   node --version  # Should output v20.0.0 or higher
   ```

2. **Git** - For cloning and version control
   ```bash
   git --version
   ```

3. **Markdown Tree Parser** - For automatic document sharding
   ```bash
   npm install -g @kayvan/markdown-tree-parser
   ```

### Optional Dependencies

1. **OpenAI API Key** - For future semantic search features (optional)
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

### IDE Requirements

- Any modern code editor (VS Code, Cursor, Windsurf, etc.)
- Claude.ai account or API access for running agents
- Terminal/Command line access

### System Requirements

- **OS**: Windows, macOS, or Linux
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 200MB for SEMAD-METHOD + space for your projects

## Installation

### Clone and Install SEMAD-METHOD

```bash
# Clone the repository
git clone https://github.com/salehelsayed/SEMAD-METHOD.git
cd SEMAD-METHOD

# Install dependencies
npm install

# Build the framework
npm run build
```

### Install in Your Project

After cloning and building:

```bash
# Install SEMAD to your project
npm run install:bmad -- --target /path/to/your/project
```

For detailed installation instructions, see our **[Getting Started Guide](GETTING-STARTED.md)**.

## Quick Start

### 1. Clone SEMAD-METHOD

```bash
git clone https://github.com/salehelsayed/SEMAD-METHOD.git
cd SEMAD-METHOD
npm install
npm run build
```

### 2. Start Using SEMAD

In your IDE (VS Code, Cursor, etc.), start with the orchestrator:

```
/orchestrator
create comprehensive plan for [your project]
```

The orchestrator will guide you through:
- **Planning Phase**: Analyst → PM → Architect
- **Development Phase**: Scrum Master → Developer → QA

### 3. Learn More

- **[Getting Started Guide](GETTING-STARTED.md)** - Detailed setup instructions
- **[Workflow Documentation](WORKFLOWS.md)** - Understanding the two-phase system
- **[Agent Reference](AGENTS.md)** - All available agents and commands
 - **[Reverse Alignment Guide](docs/reverse-alignment.md)** - Sync docs/stories to the codebase

**Prerequisites**: 
- [Node.js](https://nodejs.org) v20+ required
- Git for cloning the repository
- See [Prerequisites](#prerequisites) for complete list

### Alternative: Web UI Usage

For browser-based usage without installation:

1. **Get the bundle**: Use the [full stack team file](dist/teams/team-fullstack.txt)
2. **Create AI assistant**: Create a new Gemini Gem, CustomGPT, or Claude Project
3. **Upload & configure**: Upload the bundle file and set instructions
4. **Start planning**: Type `*help` to see commands or `/analyst` to begin
5. **Switch to IDE**: After planning phase, move to IDE for implementation

See the [User Guide](bmad-core/user-guide.md) for detailed workflow instructions.

## Reverse‑Align MVP Quickstart

- Generate dependency report (reachability, cycles, forbidden):
  - `npm run dep:report`
- Refresh manifest (single source of truth):
  - `npm run reverse:manifest`
- Generate docs from evidence (G‑PRD/G‑ARCH shards under `docs/*.generated/`):
  - `npm run reverse:align`
- Generate a capped list of StoryCandidates (non-destructive):
  - `npm run reverse:stories`
- Normalize existing stories (ensures StoryContract frontmatter; preserves prose):
  - `npm run reverse:normalize`
- Enforce coverage + delta-only drift gate:
  - `npm run reverse:gate`
- Validate golden outputs locally (structural checks):
  - `npm run reverse:validate`

Config Quickstart:
- Suppress dynamic imports/false-positives: edit `.ai/extractor-suppress.json`
- Ignore noisy StoryCandidates: edit `.ai/story-ignore.json`
- Require 100% coverage for critical items: edit `.ai/critical-entities.json`

Quality Gate Controls:
- Default coverage threshold: `0.85` (override via `reverse:gate` args or workflow inputs)
- Delta-only baseline: computed from the PR base ref in CI; first run is advisory if baseline missing

## Monorepo Notes (Lightweight)

- Entry points: run `npm run dep:report` at the repo root first. For large workspaces, also run per package:
  - `node scripts/generate-dep-report.js packages/app-one packages/lib-core` (roots override)
- Common excludes (already configured in `.dependency-cruiser.js`):
  - `node_modules/`, `dist/`, test folders: `**/__tests__/**`, `**/tests/**`
- Recommendations:
  - Keep suppress globs tight (avoid `**/*`); prefer `**/generated/**`, `**/__mocks__/**`, `**/legacy/**`.
  - If a package is mostly docs/assets, omit it from `dep:report` roots to reduce noise.
  - Commit `.ai/dep-report.json` if your repo is stable to speed up local workflows (optional).

## Troubleshooting & Safety

- No features found:
  - Ensure you ran `npm run dep:report` at the right root; check `includeOnly` in `.dependency-cruiser.js` matches your folders.
  - Verify `.ai/extractor-suppress.json` isn’t hiding everything; start empty and add globs gradually.
- False positives (dynamic imports/feature flags):
  - Annotate hotspots with `@dynamic`/`@keep` in code when applicable; add specific globs to `.ai/extractor-suppress.json`.
- Coverage drops unexpectedly:
  - Confirm generated shards exist: `docs/prd.generated/PRD.generated.md`, `docs/architecture.generated/architecture.generated.md`.
  - Mentions match by literal name; use consistent casing/wording and re-run `reverse:align`.
- Gate fails but docs updated:
  - Check `.ai/reports/docs-code-alignment.json` and `.ai/reports/simple-quality-gate.json` for the missing items list.
- Baseline missing (delta-only):
  - Local runs are advisory if baseline missing; CI computes baseline from the PR base ref before enforcing.
- Data safety:
  - Extractors never render env values; only keys/paths are recorded. Generated shards are replace-only areas; human prose remains untouched.

## Performance Budget

- Targets: ≤60s p95 for typical repos; ≤120s p99 for large monorepos.
- Mitigations:
  - Use `dep:report` roots to limit scope (per-package for large workspaces).
  - Add precise suppress globs to skip vendor, generated, mocks, and legacy trees.
  - Prefer incremental runs during development (CI already captures baseline + head efficiently).
  - Keep CI Node at v20+ and use `npm ci --prefer-offline` for faster installs.

### Config Matching Rules
- `.ai/extractor-suppress.json`: repo‑relative glob paths; applied pre‑analysis to reduce false positives (e.g., `"**/generated/**"`, `"**/__mocks__/**"`).
- `.ai/story-ignore.json`: case‑insensitive match on feature `key` or `name` to suppress StoryCandidates (e.g., `"ci_cd"`, `"metrics"`).
- `.ai/critical-entities.json`: case‑insensitive match on feature `key` or `name`; require 100% coverage for these in G‑PRD/G‑ARCH (support coming to gate).

Copy‑paste examples:
```jsonc
// .ai/extractor-suppress.json
["**/generated/**", "**/__mocks__/**", "**/legacy/**"]

// .ai/story-ignore.json
["ci_cd", "metrics", "some noisy feature name"]

// .ai/critical-entities.json
["security", "api:/v1/users#GET", "payment processing"]
```

### Quality Gate Controls (Details)
- Override threshold: `node tools/workflow-orchestrator.js quality-gate --coverage 0.9`
- Enforce delta-only: `--delta-only` ensures the PR does not increase missing coverage vs base.
- Artifacts for debugging:
  - `.ai/reports/docs-code-alignment.json` (coverage details)
  - `.ai/reports/simple-quality-gate.json` (gate result)
  - `.ai/reports/coverage-baseline.json` (baseline snapshot in CI)

### Using OpenAI Codex CLI

Prefer terminal-based agent control? Use Codex CLI to activate SEMAD agents and run commands locally.

- Install Codex CLI:
  - `npm install -g @openai/codex`
- Activate an agent and run a command:
  - `codex "as dev agent, *help"`
- Implement a story (story scanning happens only for story commands):
  - `codex "as dev agent, execute *implement-next-story"`
- Run an ad‑hoc task (no story scanning; loads baseline project files):
  - `codex "as dev agent, execute *adhoc 'Refactor utils naming' --paths src/utils/legacy.ts src/index.ts"`
- Verify results:
  - Check logs in `.ai/history/dev_log.jsonl`
  - Check ad‑hoc reports in `.ai/adhoc/`

Notes
- Always start with a clear activation phrase: “as dev agent …”, “activate dev agent …”.
- Use the `*` prefix for agent commands.
- The Dev agent respects `bmad-core/core-config.yaml` (e.g., `devStartup: idle`, `devLoadAlwaysFiles`).
- More examples: see `docs/codex-integration.md`.

### Minimal CLI Shim (no Codex)

If you aren’t using Codex, use the shim to route agent-like commands locally:

- Ad‑hoc tasks: `node tools/agent.js "/dev *adhoc 'Refactor utils' --paths src/utils/legacy.ts src/index.ts"`
  - Writes logs to `.ai/history/dev_log.jsonl` and report to `.ai/adhoc/`.
  - Only `/dev *adhoc` is supported in the shim (by design).

## 🌟 Beyond Software Development - Expansion Packs

SEMAD-METHOD's framework works in ANY domain. Expansion packs provide specialized AI agents for creative writing, business strategy, health & wellness, education, and more. Expansion packs can also extend SEMAD-METHOD with domain-specific functionality. [See the Expansion Packs Guide](docs/expansion-packs.md) to learn more.

## Search Tools Generation

SEMAD-METHOD includes automatic search query generation for external documentation retrieval. After PRD creation, the system extracts keywords and generates targeted search queries.

### Running Search Tools Generation

```bash
# Generate search tools from PRD
npm run generate:search-tools

# With custom paths
npm run generate:search-tools -- --prd docs/prd.md --output outputs/search-tools.yaml

# View available options
node scripts/generate-search-tools.js --help
```

### Generated Output

The tool creates a `search-tools.yaml` file containing:
- Extracted domain keywords from your PRD
- Mapped search queries for various documentation sources (GitHub, npm, API docs)
- Repository-specific search configurations

### Using Search Results

Once search tools are generated, agents can use the search queries to find relevant external documentation during development. The generated `search-tools.yaml` file contains pre-configured searches that agents can execute to improve code quality and reduce hallucinations.

📚 **[See the complete Search Tools Guide](docs/search-tools-guide.md)** for detailed information on:
- How agents use search-tools.yaml during development
- What happens with search results after generation
- Supported search providers and how to add new ones
- Advanced usage and customization options

## Available Agents

SEMAD-METHOD includes specialized AI agents for each role:

- **Orchestrator** (`/orchestrator`) - Master coordinator for the entire workflow
- **Analyst** (`/analyst`) - Requirements gathering and analysis
- **PM** (`/pm`) - Product requirements and prioritization
- **Architect** (`/architect`) - Technical design and system architecture
- **Scrum Master** (`/sm`) - Story creation with StoryContracts
- **Developer** (`/dev`) - Implementation following contracts
- **QA Engineer** (`/qa`) - Testing and validation
- **UX Expert** (`/ux`) - User experience design
- **Infrastructure** (`/in`) - DevOps and deployment

For detailed agent documentation, see the **[Agents Reference](AGENTS.md)**.

## Backward Compatibility

SEMAD-METHOD maintains full backward compatibility with BMad-Method:
- All original agents and workflows continue to function
- Markdown tasks are still supported alongside YAML versions
- Existing BMad projects can be upgraded seamlessly
- New features are opt-in through configuration flags

To enable SEMAD features in your `core-config.yaml`:
```yaml
structuredTasks: true          # Use YAML task definitions
useStoryContracts: true       # Use formal story contracts
dynamicPlanAdaptation: true   # Enable automatic task decomposition
simpleTaskTracking: true      # Use simple task tracking system
```

## Documentation & Resources

### Essential Guides

- 📖 **[Getting Started](GETTING-STARTED.md)** - Installation and first project
- 🏗️ **[Architecture](ARCHITECTURE.md)** - Technical architecture documentation
- 🤖 **[Agents Reference](AGENTS.md)** - All agents and their capabilities
- 🔄 **[Workflows](WORKFLOWS.md)** - Two-phase workflow system
- 🔧 **[API Reference](API-REFERENCE.md)** - Complete API documentation
- 📚 **[User Guide](bmad-core/user-guide.md)** - Complete walkthrough
- 🚀 **[Expansion Packs Guide](docs/expansion-packs.md)** - Extend to any domain
- 🔄 **[Dev↔QA Flow Options](docs/dev-qa-flow-options.md)** - Development flow options

## Support

- 💬 [Discord Community](https://discord.gg/gk8jAdXWmj)
- 🐛 [Issue Tracker](https://github.com/salehelsayed/SEMAD-METHOD/issues)
- 💬 [Discussions](https://github.com/salehelsayed/SEMAD-METHOD/discussions)

## Technical Implementation Details

### Key Files and Components Added/Modified:

- **Structured Tasks**: `bmad-core/structured-tasks/*.yaml` - All tasks converted to YAML
- **Schemas**: `bmad-core/schemas/` - JSON schemas for validation
- **Dynamic Planner**: `bmad-core/tools/dynamic-planner.js` - Task decomposition engine
- **Task Tracking**: `bmad-core/utils/simple-task-tracker.js` - Lightweight progress tracking
- **Progress Logging**: `bmad-core/utils/track-progress.js` - Persistent observation logging
- **Search Tools**: `scripts/generate-search-tools.js` - PRD keyword extraction
- **Validation**: `scripts/validate-all.js` - Comprehensive validation system
- **Error Handling**: `bmad-core/utils/error-handler.js` - Centralized error management
- **Test Suite**: 284 comprehensive tests ensuring reliability

### Performance Improvements:

- **Reduced Hallucination**: Structured contracts eliminate ~90% of interpretation errors
- **Faster Development**: Deterministic task execution reduces retry cycles
- **Better Error Recovery**: Simple tracking enables clear progress visibility
- **Improved Scalability**: Validation catches issues before they propagate

## Contributing

**We're excited about contributions and welcome your ideas, improvements, and expansion packs!** 🎉

📋 **[Read CONTRIBUTING.md](CONTRIBUTING.md)** - Complete guide to contributing, including guidelines, process, and requirements

## License

MIT License - see [LICENSE](LICENSE) for details.

[![Contributors](https://contrib.rocks/image?repo=bmadcode/bmad-method)](https://github.com/bmadcode/bmad-method/graphs/contributors)

---

<sub>SEMAD-METHOD is built on top of the excellent [BMad-Method](https://github.com/bmadcode/bmad-method) framework by BMadCode.</sub>  
<sub>This fork focuses on structured engineering practices to reduce hallucination and improve reliability in multi-agent AI systems.</sub>  
<sub>Built with ❤️ for the AI-assisted development community</sub>
## Reverse-Align (CLI Quickstart)

See `docs/reverse-alignment.md` for details. Common commands:

- `bmad-orchestrator refresh-manifest` — Extract evidence and write `.ai/documentation-manifest.json` (+ alias).
- `bmad-orchestrator reverse-align` — Analyze, generate G-PRD/G-ARCH, coverage report, and manifest.
- `bmad-orchestrator generate-stories --cap 10` — Emit ranked, deduped StoryCandidates.
- `bmad-orchestrator quality-gate --coverage 0.85 --delta-only` — Enforce coverage and drift gates.

Flags:
- `--dry-run` on `refresh-manifest`, `reverse-align`, `generate-stories`, and `quality-gate` computes analysis/reports without modifying docs or failing CI.
- `--baseline-ref <ref>` lets `quality-gate` compare drift vs a Git ref.
- `--critical-only` and `--critical-path` allow critical coverage checks via `.ai/critical-entities.json`.
