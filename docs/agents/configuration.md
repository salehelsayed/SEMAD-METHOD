# Agent Configuration Reference

Use these settings to control which agents activate automatically and how they load project context.

## `.bmad-config.yaml`

Enable or disable agents, or override per-agent defaults:

```yaml
agents:
  analyst:
    enabled: true
    autoActivate: false
  pm:
    enabled: true
    autoActivate: false
    commands:
      validateFeatureCoverage:
        enabled: true
  architect:
    enabled: true
    autoActivate: false
  scrumMaster:
    enabled: true
    autoActivate: false
  dev:
    enabled: true
    autoActivate: false
  qa:
    enabled: true
    autoActivate: false

agentSettings:
  scrumMaster:
    autoSplitStories: true
    maxStoriesPerEpic: -1  # unlimited
    complexityBudget: 5
  pm:
    coverageThreshold: 100
  qa:
    minTestCoverage: 80

features:
  traceabilityTags: required
  unlimitedBrownfieldSplit: true
  coverageValidation:
    enabled: true
    enforceInCI: true
    autoGenerateStories: true
```

## `bmad-core/core-config.yaml`

This file (also accessible via the `semad-core` symlink) tells agents where to find stories, PRDs, architecture docs, and startup context.

Key fields used by the orchestrator, developer, and QA agents:
- `markdownExploder`: enables document sharding commands
- `prd.prdFile`, `prd.prdSharded`, `prd.prdShardedLocation`: primary PRD file and shard directory
- `architecture.architectureFile`, `architecture.architectureSharded`, `architecture.architectureShardedLocation`: architecture documents
- `devLoadAlwaysFiles`: baseline context files the Dev agent always loads
- `devStoryLocation`: story directory (default `docs/stories`)
- `devStartup`: initial behavior for Dev agent (`idle` or `story`)
- `validationSchemas.*`: schema paths for StoryContracts, PRDs, architecture docs, structured tasks, and more
- `codeQuality`: configuration block consumed by QA’s `*analyze-code-quality`

> Tip: The Dev, QA, and Orchestrator tools all resolve paths via `bmad-core/utils/file-path-resolver.js`, so keep `core-config.yaml` authoritative and committed.

## Structured Tasks and Search Tools

If you enable `structuredTasks: true` or configure `searchTools` in `core-config.yaml`, the orchestrator automatically wires task runners and search helpers for the SM, QA, and Dev agents. See `tools/task-runner/` and `docs/search-tools-guide.md` for customization details.

