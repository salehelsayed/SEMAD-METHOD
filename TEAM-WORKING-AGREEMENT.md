# SEMAD-METHOD Team Working Agreement

## Purpose
This document defines our team's commitment to maintaining lossless traceability from PRD through implementation, ensuring quality gates are enforced at every phase transition.

## Core Principles

1. **No Orphans**: Every PRD requirement must trace to implementation
2. **No Drift**: Implementation must match documented requirements
3. **No Gaps**: Coverage must be 100% before phase transitions
4. **No Assumptions**: Missing information blocks progress until clarified

## Quality Gates & Ownership

### Gate 0: PRD Ready
- **Owner**: Product Manager (PM)
- **Criteria**: 
  - All requirements have PRD-REQ-### IDs
  - Each requirement has clear acceptance criteria
  - Glossary defines all ambiguous terms
- **Evidence**: `docs/prd/PRD.md` with complete IDs and acceptance
- **Blocker Policy**: No architecture work begins without PRD IDs

### Gate 1: PRD → Architecture
- **Owner**: Architect
- **Criteria**:
  - Every PRD-REQ-### maps to ARCH-COMP-### or ADR-###
  - Architecture coverage table complete
  - NFRs tagged with PRD IDs
- **Evidence**: `docs/architecture/architecture.md` coverage table
- **Blocker Policy**: No epic creation without architecture mapping

### Gate 2: Architecture → Epics  
- **Owner**: PM + Architect
- **Criteria**:
  - Each PRD-REQ-### listed in ≥1 Epic's `prdTraceability.prdReqs`
  - Epic includes `coverage` map of PRD → Stories
  - Architecture scope defined (`archScope`)
- **Evidence**: Epic contracts with complete traceability fields
- **Blocker Policy**: No story creation without epic traceability

### Gate 3: Epics → Stories (DoR)
- **Owner**: Scrum Master (SM)
- **Criteria**:
  - Stories have `traceability.prdReqIds` (non-empty)
  - Stories have `traceability.archRefs` 
  - Stories have `acceptanceRef` linking to PRD
  - Stories have `qaHooks` defined
- **Evidence**: `/sm *story-checklist` passes
- **Blocker Policy**: No sprint planning for non-compliant stories

### Gate 4: Pre-Development QA
- **Owner**: QA
- **Criteria**:
  - Coverage matrix shows 100% PRD → Epic → Story
  - No orphan requirements or stories
  - Acceptance criteria align with PRD
- **Evidence**: `/qa *validate-docs-code-alignment` report
- **Blocker Policy**: Development blocked until alignment clean

### Gate 5: Pre-Merge
- **Owner**: QA
- **Criteria**:
  - Reverse alignment run and clean
  - QA alignment validates 100% coverage
  - All PR template checks complete
- **Evidence**: `.ai/reports/` validation artifacts
- **Blocker Policy**: PR marked `blocked:traceability` until resolved

### Gate 6: Release
- **Owner**: PM + QA  
- **Criteria**:
  - NFRs validated with QA hooks
  - Final alignment report archived
  - Metrics show no drift
- **Evidence**: Release validation report
- **Blocker Policy**: No release until traceability confirmed

## Operational Rituals

### Daily
- **Morning**: Run manual reverse-alignment check
- **09:00 Local**: SM/PM review alignment reports
- **EOD**: Resolve any gaps identified

### Sprint Planning
1. PM presents Coverage Matrix
2. Architect confirms Gate 1 (architecture coverage)
3. SM confirms Gate 3 (story readiness)
4. Only compliant stories enter sprint

### Pre-Merge
1. Developer runs `node tools/workflow-orchestrator.js reverse-align`
2. QA runs `/qa *validate-docs-code-alignment`
3. Complete PR template checklist
4. Attach evidence to PR

### Retrospective
- Review traceability metrics from `.ai/progress/traceability-metrics.json`
- Discuss gate failures and time to resolution
- Update working agreement based on learnings

## Escalation & Blocking

### Coverage Gap Policy
- **Detection**: Any PRD-REQ-### without Epic/Story mapping
- **Action**: Block sprint planning until mapped
- **Escalation**: PM → Architect → Engineering Lead

### Drift Policy  
- **Detection**: Story implementation doesn't match PRD acceptance
- **Action**: Block merge, create correction story
- **Escalation**: Dev → SM → QA Lead

### Gate Failure Policy
- **Detection**: Any gate criteria not met
- **Action**: Label work as `blocked:gate-N`
- **Resolution**: Gate owner must resolve or grant exception
- **Escalation**: Gate Owner → Team Lead → Product Owner

## Metrics & Targets

Tracked in `.ai/progress/traceability-metrics.json`:

| Metric | Target | Escalation Threshold |
|--------|--------|---------------------|
| PRD Coverage % | 100% | <100% blocks sprint |
| Orphan PRD Count | 0 | >0 blocks planning |
| Orphan Story Count | 0 | >0 blocks development |
| Acceptance Mismatches | 0 | >0 blocks merge |
| Gate Failure Rate | <5% | >10% triggers review |
| Mean Time to Close (hrs) | <4 | >8 triggers escalation |
| Rework Stories | <2/sprint | >3 triggers retrospective |

## Tools & Commands

### Validation Commands
```bash
# Reverse alignment
node tools/workflow-orchestrator.js reverse-align

# QA alignment check  
/qa *validate-docs-code-alignment

# SM story checklist
/sm *story-checklist

# Generate coverage report
/qa *generate-coverage-report
```

### Key Files
- Coverage Matrix: `docs/coverage.md`
- Architecture Table: `docs/architecture/architecture.md`
- Change Log: `.ai/observations/change-log.json`
- Metrics: `.ai/progress/traceability-metrics.json`
- Reports: `.ai/reports/`

## Amendments

This agreement is reviewed and updated:
- After each retrospective
- When gate failure rate exceeds 10%
- When new requirements emerge

**Last Updated**: 2025-08-28
**Version**: 1.0.0
**Approved By**: [Team consensus required]