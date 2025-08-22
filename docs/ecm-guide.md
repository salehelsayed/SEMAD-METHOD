# Epic Coverage Matrix (ECM) – PO Guide

Goal: Make the PO’s “strings → outlets” board explicit so no component or interface is missed when creating epics and stories.

What you add (no framework changes)
- A mandatory ECM section inside each EpicContract (already added to the template).
- A lightweight validator `tools/ecm-validate.js` to check coverage.

Authoritative sources
- What we need: PRD sections referenced by the epic.
- What exists: Architecture docs (`docs/architecture/architecture.md`) and manifest (`.ai/documentation-manifest.json`).

PO workflow
- Draft/Update epic frontmatter: `requirements (REQ-*)`, `flows (FLOW-*)`, `integrationPoints (INT-*)`.
- Fill the ECM table (Capabilities × Components × Interfaces) and tag Delta per row: `existing | extend | new`.
- For `existing/extend`, add a `SourceRef` (file#symbol or route) so Dev/QA know the exact outlet.
- Run validator: `node tools/ecm-validate.js <epic.md>`
- Fix any missing coverage (all REQ-* and INT-* must appear in ≥1 ECM row).
- Hand off to SM to create StoryContracts; copy `REQ IDs`, `INT IDs`, and `Story ID`.

Validation rules (enforced by the script)
- ECM table present with headers: `ECM ID, Capability, Component(s), Interface/Port, REQ IDs, INT IDs, Story ID, Delta, Status, SourceRef`.
- `Delta` ∈ {existing, extend, new}.
- 100% coverage: every REQ-* and INT-* in the epic frontmatter is referenced in ≥1 ECM row.
- Warnings: Unknown REQ/INT references or missing `SourceRef` when Delta ≠ new.

Example
- See `docs/templates/epic-contract-template.md` and `docs/templates/ecm-template.md` for a ready‑to‑copy ECM.

Tips
- Keep ECM rows thin and testable; one capability per row.
- Use consistent component names from architecture docs.
- Add a short risk/note inline if the row hides a non‑functional constraint.

