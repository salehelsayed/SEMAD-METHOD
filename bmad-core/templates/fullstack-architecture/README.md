# Fullstack Architecture Template (Modular)

The monolithic `fullstack-architecture-tmpl.yaml` is now sourced from modular section files so agents can fetch only the pieces they need.

- `parts/00-header.yaml` holds the template metadata and `sections:` marker.
- `sections/*.yaml` contains one top-level document section each (in original order).
- `index.yaml` lists the files for the concatenation assembler.

Regenerate the legacy single-file template when required:

```
node tools/assemble-structured-content.js concat templates/fullstack-architecture/index.yaml templates/fullstack-architecture-tmpl.yaml
```

Edit the section files rather than the generated YAML to keep diffs readable.
