const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Dep-report lifecycle flips', () => {
  const { extractEntities } = require('../../tools/extractors');

  function write(p, txt) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  }

  test('module lifecycle flips between active/unused via dep-report.json', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-report-'));
    const root = tmp;
    const a = path.join(root, 'tools', 'a.js');
    const b = path.join(root, 'tools', 'b.js');
    write(a, 'export const A=1; import {B} from "./b";\n');
    write(b, 'export const B=2;\n');

    // Case 1: mark b.js unreachable
    write(path.join(root, '.ai', 'dep-report.json'), JSON.stringify({ unreachable: ['tools/b.js'] }, null, 2));
    let res = await extractEntities(root, {});
    const entB1 = res.entities.find(e => e.id === 'tools/b.js');
    expect(entB1).toBeTruthy();
    expect(entB1.lifecycle).toBe('unused');

    // Case 2: clear unreachable
    write(path.join(root, '.ai', 'dep-report.json'), JSON.stringify({ unreachable: [] }, null, 2));
    res = await extractEntities(root, {});
    const entB2 = res.entities.find(e => e.id === 'tools/b.js');
    expect(entB2).toBeTruthy();
    expect(entB2.lifecycle === 'active' || entB2.lifecycle === undefined).toBeTruthy();
  });
});

