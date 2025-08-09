# Migration Playbook

Goal
- Move legacy `bmad-core/ai` artifacts to `.ai` and write `.ai/.migrated`.

How It Runs
- Automatically at startup for orchestrator, agent runner, and CLI commands.
- Lazy fallback: first memory operation triggers migration once per process.

Failures
- Permission denied, invalid files, or cross-device rename issues.

Fix Steps
1) Run a startup path (e.g., `node tools/workflow-orchestrator.js status`) to surface errors immediately.
2) If cross-device rename fails, the system falls back to copy+unlink automatically; ensure disk space.
3) Fix permissions for the project directory; re-run.
4) Check `.ai/.migrated` for details.

