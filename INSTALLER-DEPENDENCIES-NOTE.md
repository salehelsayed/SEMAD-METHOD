# Installer Dependencies Note

## Required Dependencies for BMad Projects

When BMad is installed in a project using `npx bmad-method install`, the installer should ensure these dependencies are added to the project's package.json:

### Essential Dependencies:
```json
{
  "dependencies": {
    "@kayvan/markdown-tree-parser": "^1.5.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1"
  }
}
```

### Why These Are Needed:

1. **@kayvan/markdown-tree-parser** - Required for the `shard-doc` task that splits documents
2. **ajv** - JSON schema validator used by story contract validation
3. **ajv-formats** - Format validation plugin for ajv (email, date-time, etc.)

### Current Issue:
When BMad is installed, it copies files that depend on these packages but doesn't install the packages themselves. This causes errors like:
- `Error: Cannot find module 'ajv-formats'`
- `Error: Cannot find module '@kayvan/markdown-tree-parser'`

### Solution:
The installer (`tools/installer/bin/bmad.js`) should:
1. Check if these dependencies exist in the target project's package.json
2. If not, add them and run `npm install`
3. Or at minimum, notify the user to install them manually

### Manual Fix:
Users can manually fix by running:
```bash
npm install @kayvan/markdown-tree-parser ajv ajv-formats
```