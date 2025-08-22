# Reverse-Align MVP — Golden Tests (Initial Draft)

These fixtures validate that reverse-align generates the expected core artifacts
without being strict about dynamic values. The checks are intentionally loose to
avoid churn: they verify presence, basic types, and minimal structure only.

What gets validated:
- `.ai/documentation-manifest.json` (manifest exists with expected top-level keys)
- `.ai/reports/alignment-report.json` (alignment report shape)
- `.ai/reports/docs-code-alignment.json` (coverage summary by doc)

How to run locally:
1. From repo root, run:
   - `node tools/workflow-orchestrator.js reverse-align`
2. Then validate structure:
   - `node scripts/validate-golden.js`

Notes:
- These are structural checks, not byte-for-byte snapshots. As the MVP evolves,
  tighten validations gradually (e.g., per-field expectations for new keys).
- If reverse-align is extended (e.g., new outputs), update the validator to
  include additional presence/type checks.

