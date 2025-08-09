# Patch Failures Playbook

Symptoms
- "Patch dry-run failed" errors in console
- Guardrails complaining about missing files/paths

Quick Checks
- Ensure patch headers reference correct paths.
- Include complete hunks with context and apply minimal scope.

Fix Steps
1) Re-run with smaller, focused patch; include only necessary files.
2) If adding new files, include an Add File operation in the diff.
3) Verify paths exist for update/delete operations; create files or adjust paths.
4) Use the repair pass: the runner will provide feedback; incorporate it into the next patch.

Example Minimal Patch
```
*** Begin Patch
*** Update File: src/app.js
@@
-console.log('hi')
+console.log('hello')
*** End Patch
```

