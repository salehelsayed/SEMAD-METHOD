# Dependency Report Spec (MVP)

Location: `.ai/dep-report.json`

Purpose: Provide reachability and structural signals to classify entities into `active|deprecated|unused|planned`.

Schema (informal):
- `entrypoints`: string[] — absolute or repo-relative paths considered as roots (e.g., service mains, CLI bins).
- `unreachable`: string[] — files/modules proven unreachable from entrypoints.
- `cycles`: string[][] — arrays of file/module identifiers forming a cycle.
- `forbidden`: { rule: string, from: string, to: string }[] — violations of boundary rules.

Example:
```json
{
  "entrypoints": ["services/api/src/index.ts", "tools/cli.js"],
  "unreachable": ["legacy/old-util.ts"],
  "cycles": [["src/a.ts", "src/b.ts", "src/a.ts"]],
  "forbidden": [
    { "rule": "no-ui-to-db", "from": "web/pages/user.tsx", "to": "db/repo/user.ts" }
  ]
}
```

Generation: Recommended via dependency-cruiser with a repo-specific config. Ensure paths are repo-relative and stable.

Notes:
- This file is advisory; reverse-align treats it as hints for lifecycle classification.
- Keep false positives low. Use suppress lists where appropriate.

