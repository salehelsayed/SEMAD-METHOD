# BMad Knowledge Base (Sharded)

The legacy `data/bmad-kb.md` has been split into topic-specific markdown files so agents can load only the sections they need.

- `00-title.md` contains the primary H1 heading and introduction.
- `sections/*.md` contains each `##` topic.
- `index.yaml` lists the files in render order for the assembler.

Rebuild the original monolithic file when necessary:

```
node tools/assemble-structured-content.js concat data/kb/index.yaml data/bmad-kb.md
```

All documentation links should continue to target `data/bmad-kb.md`; the file is now generated from the modular sources above.
