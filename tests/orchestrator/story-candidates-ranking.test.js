const fs = require('fs');
const path = require('path');
const os = require('os');

const WorkflowOrchestrator = require('../../tools/workflow-orchestrator');

describe('StoryCandidates generator ranking and ignore', () => {
  test('respects cap, orders critical first, and honors ignore list', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-cap-'));
    const docsDir = path.join(root, 'docs');
    const storiesDir = path.join(docsDir, 'stories');
    fs.mkdirSync(storiesDir, { recursive: true });
    fs.mkdirSync(path.join(root, '.ai'), { recursive: true });
    // minimal core-config to satisfy FilePathResolver
    fs.mkdirSync(path.join(root, 'bmad-core'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'bmad-core', 'core-config.yaml'),
      [
        'devStoryLocation: docs/stories',
        'devDebugLog: .ai/dev-debug.log',
        'prd:',
        '  prdFile: docs/prd/PRD.md',
        '  prdShardedLocation: docs/prd',
        '  prdSharded: false',
        'architecture:',
        '  architectureFile: docs/architecture/architecture.md',
        '  architectureShardedLocation: docs/architecture.generated',
        '  architectureSharded: false',
        'devLoadAlwaysFiles: []'
      ].join('\n') + '\n'
    );

    // Critical list prioritizes feature "alpha"
    fs.writeFileSync(path.join(root, '.ai', 'critical-entities.json'), JSON.stringify(['alpha'], null, 2));
    // Ignore list suppresses feature "delta"
    fs.writeFileSync(path.join(root, '.ai', 'story-ignore.json'), JSON.stringify(['delta'], null, 2));

    const orchestrator = new WorkflowOrchestrator(root);
    // Build fake analysis with entities/relations for impact degree
    const analysis = {
      features: [
        { key: 'alpha', name: 'alpha', present: true },
        { key: 'beta', name: 'beta', present: true },
        { key: 'gamma', name: 'gamma', present: true },
        { key: 'delta', name: 'delta', present: true } // will be ignored
      ],
      evidence: {
        alpha: ['tools/a.js'],
        beta: ['tools/b.js'],
        gamma: ['tools/c.js'],
        delta: ['tools/d.js']
      },
      entities: [
        { id: 'tools/a.js', sourcePaths: ['tools/a.js'] },
        { id: 'tools/b.js', sourcePaths: ['tools/b.js'] },
        { id: 'tools/c.js', sourcePaths: ['tools/c.js'] },
        { id: 'tools/d.js', sourcePaths: ['tools/d.js'] }
      ],
      relations: [
        { fromId: 'tools/a.js', toId: 'tools/b.js' },
        { fromId: 'tools/b.js', toId: 'tools/c.js' },
        { fromId: 'tools/c.js', toId: 'tools/a.js' }
      ]
    };

    const created = await orchestrator.generateStoryCandidates(analysis, { cap: 2, dryRun: false });

    // Only 2 candidates created due to cap
    expect(created.length).toBe(2);
    // Index exists
    const indexPath = path.join(storiesDir, 'index.md');
    expect(fs.existsSync(indexPath)).toBe(true);
    const indexTxt = fs.readFileSync(indexPath, 'utf8');
    expect(/story-99-1\.md/i.test(indexTxt)).toBeTruthy();

    // Verify ignored feature "delta" not created
    const allStories = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md'));
    const contents = allStories.map(f => fs.readFileSync(path.join(storiesDir, f), 'utf8'));
    const hasDelta = contents.some(t => /Story \d+-\d+: delta/i.test(t));
    expect(hasDelta).toBe(false);

    // Critical (alpha) should appear among created stories
    const hasAlpha = contents.some(t => /Story \d+-\d+: alpha/i.test(t));
    expect(hasAlpha).toBe(true);
  });
});
