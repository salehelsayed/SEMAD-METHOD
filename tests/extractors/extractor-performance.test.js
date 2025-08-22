const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Extractor performance and caching profile', () => {
  const { extractEntities } = require('../../tools/extractors');

  function write(p, txt) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  }

  test('writes profile and benefits from cache on second run', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-perf-'));
    const root = tmp;

    // Seed a small repo with multiple files and imports
    const n = 30;
    for (let i = 0; i < n; i++) {
      const file = path.join(root, 'tools', `m${i}.js`);
      const imp = i > 0 ? `import x from './m${i - 1}.js';\n` : '';
      write(file, `${imp}export const v${i}=${i};\n`);
    }

    // First run
    await extractEntities(root, {});
    const profPath = path.join(root, '.ai', 'reports', 'extractor-profile.json');
    expect(fs.existsSync(profPath)).toBe(true);
    const prof1 = JSON.parse(fs.readFileSync(profPath, 'utf8'));
    expect(typeof prof1.elapsedMs).toBe('number');
    expect(prof1.entities).toBeGreaterThan(0);

    // Second run (should benefit from cache)
    await extractEntities(root, {});
    const prof2 = JSON.parse(fs.readFileSync(profPath, 'utf8'));
    expect(typeof prof2.elapsedMs).toBe('number');
    // second should be faster or equal (allow equal for fast machines)
    expect(prof2.elapsedMs).toBeLessThanOrEqual(prof1.elapsedMs);
    // Timing budget for tiny repo should be well under 5 seconds
    expect(prof1.elapsedMs).toBeLessThan(5000);
    expect(prof2.elapsedMs).toBeLessThan(5000);
  });
});

