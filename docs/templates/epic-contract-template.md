---
type: EpicContract
schemaVersion: 1.1

epic:
  epicId: EP-XXX
  title: "Concise epic title"
  goal: "Outcome the epic delivers"
  status: draft # draft | active | done | archived
  owner:
    role: pm # pm | po
    name: "Name"
    contact: "email@company.com"
  stakeholders:
    - "Role/Team: Name"
  links:
    prd: "docs/prd/PRD.md#ep-xxx"
    architecture: "docs/architecture/architecture.md#ep-xxx"
    storiesDir: "docs/stories/ep-xxx/"
    decisionLog: "docs/adr/"
    qaReports: ".ai/reports/"
    manifest: ".ai/documentation-manifest.json"

successCriteria:
  - id: SC-1
    metric: "Example: Signup conversion rate (%)"
    target: ">= 20%"
    method: "Analytics event EV_SIGNUP over 14 days"
    owner: "PO"

scope:
  in:
    - "What is explicitly in scope"
  out:
    - "What is explicitly out of scope"

nfrBudgets:
  performance: "p95 < 300ms; p99 < 600ms"
  availability: ">= 99.9% monthly"
  security: "OWASP mitigations; MFA for admin"
  privacy: "PII masked; GDPR lawful basis recorded"
  compliance: "PCI SAQ-A if payments"
  operability: "SLOs; runbooks; error budgets"

requirements:
  - id: REQ-001
    type: functional # functional | nfr
    title: "User can request password reset"
    description: "Describe capability and boundaries"
    priority: must # must | should | could | wont
    rationale: "Why it matters"
    acceptance:
      - "Given X when Y then Z"
    dependencies:
      - "REQ-002"
      - "External: Email service"
  - id: REQ-002
    type: nfr
    title: "Rate limit password reset requests"
    description: "5 requests/hour per user; 429 on excess"
    priority: must
    acceptance:
      - "Given >5 requests within 1h then 429 returned"

flows:
  - id: FLOW-A
    title: "Password reset request flow"
    description: "End-to-end path UI → API → email"
    actors: ["EndUser","System"]
    components: ["web-ui","auth-api","email-service"]
    preconditions: "User account exists"
    postconditions: "Reset email delivered with token"
    mainScenario:
      given: "User on Forgot Password page"
      when: "User submits registered email"
      then: "System sends reset email and confirms"
    altScenarios:
      - name: "Unregistered email"
        given: "Email not found"
        when: "Submit"
        then: "Return generic success; log attempt"

integrationPoints:
  - id: INT-1
    kind: api # api | event | db | cron
    name: "POST /v1/auth/reset"
    location: "auth-api"
    ownerTeam: "Identity"
    contract: "docs/apis/auth-reset.yaml"
    version: "v1"
  - id: INT-2
    kind: event
    name: "email.reset.send"
    location: "email-service"
    ownerTeam: "Platform"
    contract: "docs/events/email-reset.md"
    version: "v2"

acceptanceScenarios:
  - id: E2E-1
    name: "Successful reset request"
    reqIds: ["REQ-001"]
    flowIds: ["FLOW-A"]
    scenario:
      given: "Valid user email"
      when: "Reset requested"
      then: "Email with token is sent"
  - id: E2E-2
    name: "Abuse prevented"
    reqIds: ["REQ-002"]
    flowIds: ["FLOW-A"]
    scenario:
      given: "6th reset attempt within 1h"
      when: "Request submitted"
      then: "API responds 429; no email sent"
  - id: E2E-3
    name: "Downstream timeout resilience"
    reqIds: ["REQ-001"]
    flowIds: ["FLOW-A"]
    scenario:
      given: "Email service timeout"
      when: "Reset requested"
      then: "Retry/backoff; user sees generic success; event queued"

assumptions:
  - id: A-1
    statement: "Email deliverability ≥ 99%"
    validation: "Monitor bounce rate dashboard"

risks:
  - id: R-1
    desc: "Email service throttle"
    mitigation: "Exponential backoff; queue buffering"

rolloutPlan:
  strategy: "feature-flagged; canary 10% → 50% → 100%"
  migration:
    requires: false
    steps: []
    rollback: "Toggle flag off"
observability:
  slos: ["auth-api p95<300ms","reset-success-rate>98%"]
  dashboards: ["grafana/auth-reset"]
  alerts: ["pagerduty/identity-oncall"]
  logFields: ["req_id","user_id","flow_id","req_ids"]
security:
  threatModelLink: "docs/security/EP-XXX-threat-model.md"
  dataRetention: "reset tokens 24h; logs 30d; PII masked"
accessibility:
  standard: "WCAG 2.2 AA"
  notes: []

changeControl:
  decisionLog: "docs/adr/"
  changePolicy: "IDs immutable once active; changes via ADR + schemaVersion bump"
  schemaUrl: "docs/schemas/story-contract.schema.json" # optional reference
versioning:
  compatibility: "backward-compatible contracts unless ADR states otherwise"

validation:
  epicDoR:
    - "Success Criteria (SC-*) defined: metric, target, method"
    - "All REQ-* and FLOW-* drafted; integrationPoints listed with owners/contracts"
    - "NFR budgets set; threat model started"
    - "Assumptions and Open Questions recorded"
  storyRules:
    requireEpicId: true
    requireReqIds: true
    requireFlowIds: true
    requireIntegrationPointIds: true
  storyDoD:
    - "Acceptance criteria pass with tests"
    - "Contract tests passing for all integrationPointIds"
    - "Telemetry for SC-* emitting if relevant"
    - "No open P0/P1 defects on story scope"
  epicDoneCriteria:
    - "All REQ-* mapped to ≥1 implemented StoryContract"
    - "All epic acceptanceScenarios (E2E-*) pass including negative/resiliency paths"
    - "NFR budgets verified (perf/security/availability)"
    - "Success Criteria measured; targets met or ADR with rationale"
    - "Operational readiness: runbook, dashboards, alerts live"
    - "Reverse traceability check passes"

coverage:
  generatedBy: ".ai/reports/traceability.json" # pointer to generated artifact

audit:
  createdAt: "YYYY-MM-DD"
  updatedAt: "YYYY-MM-DD"
  approvedBy: ["PM Name","QA Lead"]
---

# Epic: {{title}}

## Goal
{{goal}}

## Success Criteria
- {{SC-1.metric}}: target {{SC-1.target}} (method: {{SC-1.method}})

## Scope
- In: {{scope.in}}
- Out: {{scope.out}}

## Numbered Requirements (REQ-*)
Mirror the YAML section in human-readable form for reviewers.

## End‑to‑End Flows (FLOW-*)
Narrative of flows; reference components and actors.

## Integration Points
Summarize APIs/events and owners.

## Epic‑Level Acceptance Scenarios (E2E)
List Gherkin‑style scenarios for reviewers.

## Definition of Done
- All requirements covered by stories and tests.
- All E2E scenarios pass in QA.
- NFR budgets met; runbooks/alerts ready.
- Reverse‑trace check clean.

## Links
- PRD: {{links.prd}}
- Architecture: {{links.architecture}}
- Stories: {{links.storiesDir}}
- Decision Log: {{links.decisionLog}}

## Epic Coverage Matrix (ECM)
Fill this table before creating stories. Each row maps a capability to concrete components and interfaces, and (eventually) a Story ID. All REQ-* and INT-* should be covered by ≥1 row.

| ECM ID  | Capability                     | Component(s)                     | Interface/Port         | REQ IDs        | INT IDs | Story ID         | Delta   | Status     | SourceRef                           |
|---------|--------------------------------|----------------------------------|------------------------|----------------|---------|------------------|---------|------------|--------------------------------------|
| ECM-001 | Password reset request (happy) | auth-api, email-service          | POST /v1/auth/reset    | REQ-001        | INT-1   | ST-RESET-REQUEST | new     | planned    |                                      |
| ECM-002 | Abuse prevention (rate limit)  | auth-api                         | POST /v1/auth/reset    | REQ-002        | INT-1   | ST-RESET-RATE    | extend  | planned    | routes/auth.ts:/v1/auth/reset        |
| ECM-003 | Email dispatch                 | email-service                    | event: email.reset.send| REQ-001        | INT-2   | ST-EMAIL-DISPATCH| extend  | planned    | events/email-reset.js:publishReset   |

Notes
- Delta: existing | extend | new
- Status: planned | in_progress | done
- If Delta ≠ new, include a SourceRef to document the exact hook point in the current codebase.
