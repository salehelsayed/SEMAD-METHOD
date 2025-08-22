const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Extractor ID stability on rename', () => {
  const { extractEntities } = require('../../tools/extractors');

  function write(p, txt) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  }

  test('only renamed module ids change', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-rename-'));
    const root = tmp;
    // initial files
    write(path.join(root, 'tools', 'a.js'), 'export function foo(){}\nimport b from "./b.js";\n');
    write(path.join(root, 'tools', 'b.js'), 'export default function b(){}\n');

    const first = await extractEntities(root, {});
    const firstIds = new Set(first.entities.map(e => e.id));

    // rename b.js -> c.js and update import
    fs.renameSync(path.join(root, 'tools', 'b.js'), path.join(root, 'tools', 'c.js'));
    write(path.join(root, 'tools', 'a.js'), 'export function foo(){}\nimport c from "./c.js";\n');

    const second = await extractEntities(root, {});
    const secondIds = new Set(second.entities.map(e => e.id));

    // Changed IDs should include c.js and related symbol, not unrelated a.js#foo
    expect([...secondIds].every(id => id.indexOf('\\\\') === -1)).toBe(true); // no backslashes
    const aFoo = 'tools/a.js#foo';
    expect(firstIds.has(aFoo)).toBeTruthy();
    expect(secondIds.has(aFoo)).toBeTruthy();
  });
});

