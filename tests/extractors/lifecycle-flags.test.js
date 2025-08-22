const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Lifecycle flags via annotations and dep-report', () => {
  const { extractEntities } = require('../../tools/extractors');

  function write(p, txt) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  }

  test('@deprecated and @dynamic are honored', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-life-'));
    const root = tmp;
    write(path.join(root, 'tools', 'dyn.js'), '// @dynamic\nexport const x = 1;\n');
    write(path.join(root, 'tools', 'dep.js'), '// @deprecated\nexport const y = 2;\n');

    const res = await extractEntities(root, {});
    const dyn = res.entities.find(e => e.id === 'tools/dyn.js');
    const dep = res.entities.find(e => e.id === 'tools/dep.js');
    expect(dyn && dyn.lifecycle).toBe('active');
    expect(dep && dep.lifecycle).toBe('deprecated');
  });
});

