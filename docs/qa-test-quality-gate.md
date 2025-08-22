# Test Quality Gate

This gate enforces basic standards for developer-written tests and strengthens traceability to StoryContracts.

## What It Checks

- Story traceability: tests include a story reference `@SC: <story-id>` or a `// Story: <id>` header.
- Acceptance criteria tags: recommends `@AC: <criterion-id>` tags in test names or comments.
- Focus/skip guards: blocks `.only` and flags `.skip` in committed tests.
- Determinism: flags unmocked `Date`/`Math.random` usage.
- Network discipline: flags unmocked `fetch`/`http(s).request` usage.
- Matrix compliance: verifies tests listed in `StoryContract.acceptanceTestMatrix.items` exist in the PR and include rationale.
- TDD evidence: when `developmentPolicy.tdd` is true, expects tests to appear before or alongside code changes.

Outputs:
- `.ai/reports/test-quality-report.json`
- `.ai/reports/test-quality-report.md`

## Usage

Run for the whole suite:

```
npm run test:quality
```

Run for a specific story (fails if no tests reference it):

```
npm run test:quality -- --story-id 4.1
```

Optional coverage threshold (use Jest coverage or set an env var to make this script enforce a minimum in the future):

```
TEST_COVERAGE_MIN=75 npm run test:quality
```

## Conventions

- Include a story tag in related tests:
  - `// Story: 4.1` or `@SC: 4.1`
- Map acceptance criteria explicitly:
  - In test name: `it('[@AC: 4.1-AC2] rejects invalid email', ...)`
  - Or as a comment above the case
- Avoid `.only`/`.skip` in committed tests.
- Mock time, randomness, and network.

## Integrations

- CI: Add `npm run test:quality` to your QA gate or preflight.
- Orchestrator: Run before `gate:qa` to fail early on low-value tests.
