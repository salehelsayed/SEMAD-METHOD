---
StoryContract:
  version: "1.0"
  story_id: "AH-012"
  epic_id: "AH"
  apiEndpoints: []
  filesToModify:
    - path: tools/metrics/collect.js
      reason: Collect KPIs from logs and test outputs
    - path: tools/metrics/report.md.tmpl
      reason: Template for metrics report
    - path: docs/validation-system.md
      reason: Add metrics section
    - path: .ai/test-logs/
      reason: Store structured metrics logs
  acceptanceCriteriaLinks:
    - "AC1: Metrics collected for contract pass rate, time-to-green, diff churn"
    - "AC2: Report generated and checked into .ai/test-logs/"
    - "AC3: Docs updated with KPI definitions"
---

# Story AH-012: Metrics & Monitoring

## Status
Draft

## Story
As a Team, we want to track quality and velocity metrics to identify regressions and improve the process.

## Acceptance Criteria
1. Collector aggregates metrics from preflight logs and test runs.
2. A markdown/JSON report is generated with current values and trends.
3. Metrics documented with definitions and targets.

## Tasks / Subtasks
- [ ] Implement collector (AC: 1)
- [ ] Implement report template (AC: 2)
- [ ] Update docs (AC: 3)

## Dev Notes
Keep storage local; no PII.

