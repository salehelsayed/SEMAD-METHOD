---
StoryContract:
  version: "1.0"
  story_id: "AH-010"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/context/index-artifacts.js
      reason: Build embedding index for artifacts/code symbols
    - path: tools/context/retrieve-context.js
      reason: Deterministic top-N retrieval based on bundle
    - path: package.json
      reason: Add npm scripts context:index and context:retrieve
    - path: docs/search-tools-guide.md
      reason: Document retrieval strategy and parameters
  acceptanceCriteriaLinks:
    - "AC1: Indexer builds an embedding/symbol index"
    - "AC2: Retriever returns deterministic top-N slices pinned to versions"
    - "AC3: Scripts wired and documented"
---

# Story AH-010: Embedding-backed Retrieval

## Status
Draft

## Story
As a Dev agent, I want a reliable retrieval layer that surfaces only the most relevant, version-pinned context for a story.

## Acceptance Criteria
1. Artifact/code index exists; re-built via `npm run context:index`.
2. Retrieval script returns deterministic snippets based on bundle references and fixed parameters.
3. Documentation describes usage and caveats.

## Tasks / Subtasks
- [ ] Implement indexer (AC: 1)
- [ ] Implement retriever (AC: 2)
- [ ] Wire scripts and docs (AC: 3)

## Dev Notes
Prefer local symbol graph where embeddings unavailable.

