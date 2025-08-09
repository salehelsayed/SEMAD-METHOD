# Diff-First Patching with Dry-Run and Repair

This project supports a safe patch flow where agents propose unified diffs, we dry-run them, and feed precise errors back for self-repair before applying.

## Patch format

Use the project’s patch envelope (similar to our internal apply_patch format):

```
*** Add File: src/new-feature.js
+export function hello() { return 'world'; }

*** Update File: src/app.js
@@
  import { something } from './util';
+ import { hello } from './new-feature';
@@
  console.log('ready');
+ console.log(hello());

*** Delete File: obsolete/tmp.txt
```

## Programmatic usage

```js
const { applyUnifiedDiff } = require('../bmad-core/utils/patcher');
const { assertPathsExist } = require('../bmad-core/utils/guardrails/grounding-checks');
const { parsePatch } = require('../bmad-core/utils/patcher');

async function applyPatchSafely(patchText) {
  // Optional: ensure update/delete targets exist
  const ops = parsePatch(patchText);
  const mustExist = ops.filter(op => op.type === 'update' || op.type === 'delete').map(op => op.file);
  if (mustExist.length) assertPathsExist(mustExist);

  // Dry run
  const dry = await applyUnifiedDiff(patchText, { dryRun: true });
  if (!dry.success) {
    // Return messages to agent for repair
    return { success: false, errors: dry.errors };
  }

  // Apply for real
  const res = await applyUnifiedDiff(patchText, { dryRun: false });
  return { success: res.success, operations: res.operations };
}
```

## Agent flow (high-level)

1. Agent returns JSON with a `patch` string and optional `modules`, `commands`.
2. Runner does:
   - Grounding: `assertPathsExist()`, `assertModulesResolvable()`, `assertNoDangerousOps()`.
   - Dry-run `applyUnifiedDiff()`.
   - On error: feed `patchErrors` back; agent repairs and resubmits.
   - On success: apply for real.

This approach reduces broken patches and false file references before any write occurs.

