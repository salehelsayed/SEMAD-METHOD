---
id: BR-001
version: "1.0.0"
stakeholders:
  - name: Product Owner
    role: Decision Maker
    concerns: ["ROI", "Timeline"]
  - name: Architect
    role: Technical Authority
    concerns: ["Scalability", "Maintainability"]
successCriteria:
  - "All gates pass for AH stories"
  - "Preflight and tests are green"
scope:
  included: ["Agentic hardening gates", "Preflight suite", "Schemas"]
  excluded: ["Production deployment"]
nonFunctional:
  performance: ["CLI checks < 60s"]
  security: ["No secrets in repo"]
  scalability: ["Support multi-agent runs"]
  maintainability: ["Schema-validated artifacts"]
---

# Project Brief

Minimal schema-compliant brief for Planning gate validation.

