const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function writeFileEnsuringDir(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function updateStoryStatus(storyPath) {
  const raw = readFile(storyPath);
  const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
  const m = raw.match(statusRegex);
  return m ? m[2].trim() : null;
}

describe('E2E: implement-next-story red→green→evidence→Implemented', () => {
  const root = process.cwd();
  const storyDir = path.join(root, 'docs', 'stories');
  const storyPath = path.join(storyDir, 'e2e.1.dev-impl-test.md');
  const storyId = 'E2E-IMPL-1';
  const testFile = path.join(root, 'tests', 'acceptance', storyId, 'AC-1.test.js');
  const redReport = path.join(root, '.ai', 'dev', 'test-reports', `${storyId}-red.json`);
  const greenReport = path.join(root, '.ai', 'dev', 'test-reports', `${storyId}-green.json`);
  const evidencePath = path.join(root, '.ai', 'dev', 'acceptance', `${storyId}.json`);

  beforeAll(() => {
    // Create synthetic story with acceptance matrix and filesToModify
    const storyContent = `---
StoryContract:
  version: "1.0"
  story_id: "${storyId}"
  epic_id: "E2E"
  filesToModify:
    - path: src/e2e/temp-e2e.js
      reason: temp change
  acceptanceTestMatrix:
    items:
      - id: AC-1
        description: basic works
        must_have: true
        test_files:
          - path: tests/acceptance/${storyId}/AC-1.test.js
            framework: jest
---

# E2E Implement Story

## Status
Approved

## Acceptance Criteria
1. AC-1: basic works
`;
    writeFileEnsuringDir(storyPath, storyContent);

    // Scaffold failing tests from StoryContract via generator (skeleton asserts fail)
    const gen = spawnSync(process.execPath, [path.join('tools', 'dev', 'generate-tests-from-contract.js'), '--story', storyPath], {
      cwd: root,
      stdio: 'inherit'
    });
    const genCode = gen.status ?? gen.code ?? 1;
    expect(genCode).toBe(0);
  });

  afterAll(() => {
    // Leave artifacts for inspection; do not delete .ai outputs
    // Best-effort cleanup of the generated test and story
    try { if (fs.existsSync(testFile)) fs.unlinkSync(testFile); } catch {}
    try { if (fs.existsSync(storyPath)) fs.unlinkSync(storyPath); } catch {}
    // Remove now-empty test directory
    try {
      const testDir = path.dirname(testFile);
      if (fs.existsSync(testDir) && fs.readdirSync(testDir).length === 0) fs.rmdirSync(testDir);
    } catch {}
  });

  it('runs red tests, then green via dev-next-story, and enforces acceptance evidence', () => {
    // 1) Red run should fail
    const redRes = spawnSync(process.execPath, [path.join('tools', 'dev', 'run-story-tests.js'), '--story', storyPath, '--report', redReport], {
      cwd: root,
      env: { ...process.env, CI: process.env.CI || '1' },
      stdio: 'inherit'
    });
    const redCode = redRes.status ?? redRes.code ?? 1;
    expect(redCode).not.toBe(0);

    // 2) Make test pass (green)
    // Patch generated skeleton to pass (switch expect(false).toBe(true) → expect(true).toBe(true))
    const original = fs.readFileSync(testFile, 'utf8');
    const patched = original.replace(/expect\(false\)\.toBe\(true\)/g, 'expect(true).toBe(true)');
    fs.writeFileSync(testFile, patched, 'utf8');

    // 3) Run dev agent implementer for this explicit story
    const implRes = spawnSync(process.execPath, [path.join('tools', 'dev-next-story.js'), '--auto', '--quiet', '--no-codex', '--story', storyPath], {
      cwd: root,
      env: { ...process.env, SEMAD_DEV_DISABLE_CODEX: '1', BMAD_DEV_DISABLE_CODEX: '1' },
      stdio: 'inherit'
    });
    const implCode = implRes.status ?? implRes.code ?? 1;
    expect(implCode).toBe(0);

    // 4) Verify acceptance evidence exists and has verified entries
    expect(fs.existsSync(evidencePath)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    expect(Array.isArray(evidence.acceptance)).toBe(true);
    expect(evidence.acceptance.length).toBeGreaterThan(0);
    const unverified = evidence.acceptance.filter(a => !a || a.verified !== true);
    expect(unverified.length).toBe(0);

    // 5) Verify story status updated to Implemented
    const status = updateStoryStatus(storyPath);
    expect(status).toBe('Implemented');
  }, 180000); // generous timeout for nested jest runs
});
