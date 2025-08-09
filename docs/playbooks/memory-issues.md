# Memory Issues Playbook

Symptoms
- JSON corruption in `.ai/*_context.json`
- Missing or partial entries in `.ai/history/*_log.jsonl`
- Lock files lingering: `*.lock`

Quick Checks
- Ensure Node >= 20 and local filesystem not read-only.
- Verify `.ai/` exists and is writable.
- Check for `.ai/.migrated` (migration completed) and remove legacy `bmad-core/ai` if needed.

Fix Steps
1) Clear stale locks: remove `*.lock` files in `.ai/` and `.ai/history/`.
2) Re-run a command to trigger migration at boot (e.g., `node tools/workflow-orchestrator.js status`).
3) Validate file permissions for your user.

Notes
- Writes are atomic with per-file locks; lingering locks typically indicate a previous process crash. They auto-expire by timeout but can be removed manually if necessary.

