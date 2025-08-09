const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const { applyUnifiedDiff, parsePatch } = require('../../bmad-core/utils/patcher');

describe('Unified Patcher', () => {
  let cwd;
  let tmp;
  beforeAll(async () => {
    cwd = process.cwd();
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'patcher-test-'));
    process.chdir(tmp);
  });
  afterAll(async () => {
    process.chdir(cwd);
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch {}
  });

  test('dry-run error on missing update target', async () => {
    const patch = `*** Update File: non-existent.txt\n@@\n-hello\n+hello world\n`;
    const res = await applyUnifiedDiff(patch, { dryRun: true, baseDir: tmp });
    expect(res.success).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Update target not found/);
  });

  test('apply add and update', async () => {
    const target = path.join(tmp, 'a.txt');
    fs.writeFileSync(target, 'line1\nline2\n');
    const patch = `*** Add File: b.txt\n+first line\n+\n*** Update File: a.txt\n@@\n line1\n-line2\n+line2 changed\n`;
    const dry = await applyUnifiedDiff(patch, { dryRun: true, baseDir: tmp });
    expect(dry.success).toBe(true);
    const res = await applyUnifiedDiff(patch, { dryRun: false, baseDir: tmp });
    expect(res.success).toBe(true);
    const updated = fs.readFileSync(target, 'utf8');
    expect(updated).toContain('line2 changed');
    const added = fs.readFileSync(path.join(tmp, 'b.txt'), 'utf8');
    expect(added).toContain('first line');
  });
});

