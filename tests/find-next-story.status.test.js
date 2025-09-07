const fs = require('fs');
const path = require('path');

const { getAllStoriesStatus } = require('../semad-core/utils/find-next-story');

describe('find-next-story status parsing', () => {
  const tmpDir = path.join(__dirname, 'tmp-stories');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const storyContent = `---\nstatus: Approved\nStoryContract: { version: '1.0' }\n---\n# Demo Story\n`;
    fs.writeFileSync(path.join(tmpDir, '1.1.demo.md'), storyContent);
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('parses status from frontmatter when header missing', () => {
    const statuses = getAllStoriesStatus(tmpDir);
    expect(statuses.length).toBeGreaterThan(0);
    const s = statuses.find(x => x.file === '1.1.demo.md');
    expect(s).toBeTruthy();
    expect((s.status || '').toLowerCase()).toBe('approved');
  });
});

