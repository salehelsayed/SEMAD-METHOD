const fs = require('fs');
const path = require('path');

describe('Manifest stability and path normalization', () => {
  test('refresh-manifest produces normalized ids and stable schemaVersion', () => {
    const root = process.cwd();
    const { execSync } = require('child_process');
    execSync(`node tools/workflow-orchestrator.js refresh-manifest`, { cwd: root, stdio: 'inherit' });
    const p = path.join(root, '.ai', 'documentation-manifest.json');
    expect(fs.existsSync(p)).toBe(true);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(j.schemaVersion).toBeDefined();
    for (const e of j.entities || []) {
      expect(String(e.id)).not.toContain('\\\\');
    }
  });
});

