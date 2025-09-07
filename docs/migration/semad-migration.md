# SEMAD Migration Guide (from BMAD)

This guide explains how to migrate an existing BMAD-based project to SEMAD.

## Summary
- SEMAD-first paths: `semad-core/` and `.semad-core/` replace `bmad-core/` and `.bmad-core/`.
- Config: prefer `.semad-workflow.yaml` (legacy `.bmad-workflow.yaml` still read with a warning).
- Binaries: use `semad`, `semad-method`, `semad-orchestrator` (legacy `bmad*` remain as aliases temporarily).
- Docs and generators now normalize paths to `semad-core/`.

## Steps
1) Add SEMAD mirrors (if you have only legacy dirs)
```bash
# In your project repo
[ -e semad-core ] || ln -s bmad-core semad-core
[ -e .semad-core ] || ln -s .bmad-core .semad-core
```

2) Copy workflow config (optional but recommended)
```bash
[ -f .bmad-workflow.yaml ] && cp .bmad-workflow.yaml .semad-workflow.yaml
```

3) Update imports (recommended)
- Replace `bmad-core/` with `semad-core/` in your scripts and tests.
- Prefer `semad-orchestrator` in CI commands.

4) Verify installation
```bash
npm run install:semad && npm run install:verify
```

5) Run brand preflight (non-blocking)
```bash
npm run preflight:brand
```

6) Regenerate generated docs
```bash
npx semad-orchestrator reverse-align
```

## Deprecation Timeline
- BMAD compatibility will remain for at least one major version after SEMAD 5.x.
- Future releases may remove `.bmad-core/` and `.bmad-workflow.*` support. Follow this guide to migrate proactively.

## FAQ
- My CI still uses `bmad-orchestrator`. Is that ok?
  - Yes, aliases remain. Prefer switching to `semad-orchestrator` soon.
- Do I need to rename folders immediately?
  - No. The preflight warns if only legacy folders exist; symlinks are fine during transition.

## Need Help?
Open an issue or reach out on Discord. Include your preflight output and repository structure for faster triage.

