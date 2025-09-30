# Dev Agent Checklist – *address-qa-feedback

1. Run `codex "as dev agent, execute *address-qa-feedback @<story>"` to parse QA feedback and regenerate `.ai/qa_fixes_checklist.json`.
2. Review `.ai/qa_findings.json` and the console summary to understand critical/major/minor issues.
3. Inspect `.ai/dependency_impact_report_qa.md` for high-risk touch points before editing code.
4. Implement fixes file-by-file; after each fix rerun the command with `--complete <fixId[:note]>` to record verification details.
5. Re-run the command without `--complete` to ensure tests pass (or provide `--test-command`/`--skip-tests` as needed).
6. Confirm `.ai/qa_fix_report.json` reports 100% completion; the story’s Status, Completion Notes, and Change Log are updated automatically when all fixes are verified.
7. Notify QA once the command exits successfully so they can re-review the story.
