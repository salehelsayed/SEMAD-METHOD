# Deterministic Story Template (Modular)

The legacy `story-tmpl.yaml` is now stored as a series of ordered parts so agents can stream only the sections they need.

- `index.yaml` lists the part files in render order.
- `parts/*.mustache` and `parts/*.md` contain the raw template fragments.

Rebuild the single-file version if a downstream tool still needs it:

```
node tools/assemble-structured-content.js concat templates/story-template/index.yaml templates/story-tmpl.yaml
```

Edit the part files instead of the generated output to keep diffs readable and to avoid merge conflicts.
