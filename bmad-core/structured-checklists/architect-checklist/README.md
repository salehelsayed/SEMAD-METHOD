# Architect Checklist (Modular)

This checklist has been refactored into bite-sized category files so agents can load only the sections they need.

- `index.yaml` &mdash; describes the checklist metadata and lists category file paths.
- `categories/*.yaml` &mdash; each file contains a single checklist category.

To rebuild the legacy single-file version:

```
node tools/assemble-structured-content.js checklist structured-checklists/architect-checklist/index.yaml structured-checklists/architect-checklist.yaml
```

The assembler emits the original YAML shape and can be used in CI to verify generated artifacts stay in sync.
