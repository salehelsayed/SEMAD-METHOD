---
StoryContract:
  version: "1.0"
  story_id: "AH-013"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: .github/workflows/security-guardrails.yml
      reason: CI job for secret scan and dependency audit
    - path: scripts/security/secret-scan.sh
      reason: Secret scanning wrapper
    - path: scripts/security/deps-audit.sh
      reason: Dependency audit wrapper
    - path: docs/validation-system.md
      reason: Document security gates
  acceptanceCriteriaLinks:
    - "AC1: CI job runs secret scan and dependency audit"
    - "AC2: Fails on detected secrets or high severity vulns"
    - "AC3: Docs include remediation steps"
---

# Story AH-013: Security Guardrails in CI

## Status
Draft

## Story
As a Security-conscious team, we want CI guardrails to prevent accidental secret leaks and risky dependencies.

## Acceptance Criteria
1. GitHub Actions workflow runs secret scan and dependency audit on PRs.
2. Pipeline fails on violations with clear messages.
3. Documentation includes how to fix issues and rerun.

## Tasks / Subtasks
- [ ] Add CI workflow (AC: 1)
- [ ] Implement scripts (AC: 1,2)
- [ ] Update docs (AC: 3)

## Dev Notes
Prefer fast, open-source tooling.

