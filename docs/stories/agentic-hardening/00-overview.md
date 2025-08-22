# Agentic Hardening Initiative

This folder contains a structured set of stories to improve code implementation accuracy, strengthen context, and reduce hallucinations across the SEMAD-METHOD framework. These stories are designed to be dummy-proof: each includes precise acceptance criteria and step-by-step tasks that map directly to files, scripts, and validations in this repo.

## Scope
- Phase 1: Foundations (typed artifacts, task bundles, preflight checks, orchestrator gates)
- Phase 2: Accuracy (grounded editing, reference checks, deterministic templates, type-first, traceability)
- Phase 3: Scale & Quality (retrieval, concurrency, metrics, security, rollback/drift)
- Guardrails (instruction hierarchy, structured outputs)

## Working Agreements
- Do not skip validation steps. Preflight checks must pass before applying any code patches.
- When in doubt, escalate with a clarification request; never invent files or APIs.
- Use the StoryContract at the top of each story as the single source of truth.

## Review Plan (for later verification)
- For each story, verify: (1) StoryContract is valid; (2) Acceptance tests or checks exist and pass; (3) Only files listed in `filesToModify` changed; (4) All ACs demonstrably met.
- Track progress in `.ai/progress/` using the story ID (e.g., `AH-001.json`).
- Record key decisions in `.ai/observations/` with type `decision` and link back to the story ID.

## Story Index
- AH-001: Typed Artifacts (JSON Schemas)
- AH-002: Task Bundle Manifest + Context Assembly
- AH-003: Preflight Checks Suite
- AH-004: Orchestrator Gates
- AH-005: Grounded Editing Protocol
- AH-006: Reference Checker
- AH-007: Deterministic Templates
- AH-008: Type-First Enforcement
- AH-009: Traceability Enforcement
- AH-010: Embedding-backed Retrieval
- AH-011: Concurrency Control
- AH-012: Metrics & Monitoring
- AH-013: Security Guardrails in CI
- AH-014: Rollback & Drift Alarms
- AH-015: Instruction Hierarchy & Structured Outputs

