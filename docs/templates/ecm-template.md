# Epic Coverage Matrix (ECM)

Purpose: Make every capability traceable to concrete components, interfaces, and a story, so nothing is missed. Fill this table before story slicing. Keep IDs consistent with the EpicContract frontmatter.

Required columns
- ECM ID: Stable row id (e.g., ECM-001)
- Capability: Business slice delivered by the row
- Component(s): Concrete component/module names
- Interface/Port: API route, event, DB table, CLI, config key
- REQ IDs: Comma-separated REQ-* from this epic
- INT IDs: Comma-separated INT-* from this epic (if applicable)
- Story ID: StoryContract ID that will implement this row (or TBA)
- Delta: existing | extend | new
- Status: planned | in_progress | done
- SourceRef: Optional code anchor when Delta ≠ new (e.g., src/auth/login.ts#login)

Template

| ECM ID  | Capability                     | Component(s)                     | Interface/Port        | REQ IDs        | INT IDs | Story ID         | Delta   | Status     | SourceRef                           |
|---------|--------------------------------|----------------------------------|-----------------------|----------------|---------|------------------|---------|------------|--------------------------------------|
| ECM-001 | Password reset request (happy) | auth-api, email-service          | POST /v1/auth/reset   | REQ-001        | INT-1   | ST-RESET-REQUEST | new     | planned    |                                      |
| ECM-002 | Abuse prevention (rate limit)  | auth-api                         | POST /v1/auth/reset   | REQ-002        | INT-1   | ST-RESET-RATE    | extend  | planned    | routes/auth.ts:/v1/auth/reset        |
| ECM-003 | Email dispatch                 | email-service                    | event: email.reset.send| REQ-001        | INT-2   | ST-EMAIL-DISPATCH| extend  | planned    | events/email-reset.js:publishReset   |

Gates
- 100% REQ coverage: every REQ-* appears in ≥1 ECM row.
- 100% INT coverage (if used): every INT-* appears in ≥1 ECM row.
- If Delta ≠ new, include a SourceRef.

Usage
- PO fills ECM using PRD + architecture + manifest (.ai/documentation-manifest.json) before story creation.
- SM creates StoryContracts referencing the Story ID and underlying REQ/INT.
- QA uses ECM as the checklist for validation.

