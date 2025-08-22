---
id: ARCH-001
version: "1.0.0"
components:
  - name: Orchestrator
    type: Service
    responsibilities: ["Coordinate agents", "Enforce gates"]
    dependencies: ["Preflight Suite", "Schemas"]
apis:
  - name: GateControl
    protocol: internal
    endpoints:
      - "POST /gate/check"
dataModels:
  - name: Story
    fields:
      id: string
      title: string
      status: string
decisions:
  - id: ADR-1
    decision: Use JSON Schemas for artifacts
    rationale: Enforce structure and reduce ambiguity
    alternatives: ["Free-form markdown", "Ad-hoc parsing"]
---

# Architecture Overview

Minimal schema-compliant architecture document for Planning gate validation.
