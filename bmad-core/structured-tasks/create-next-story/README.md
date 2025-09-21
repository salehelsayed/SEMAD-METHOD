# Create Next Story Task (Modular)

The legacy task is now sourced from modular step files so agents can load only what they need.

- `index.yaml` lists metadata and step file paths.
- `steps/*.yaml` contains an individual task step.

Rebuild the combined YAML when required:

```
node tools/assemble-structured-content.js task structured-tasks/create-next-story/index.yaml structured-tasks/create-next-story.yaml
```

Edit the modular files instead of the generated task to avoid merge conflicts.
