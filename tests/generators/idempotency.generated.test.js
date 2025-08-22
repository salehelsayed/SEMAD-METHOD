const fs = require('fs');
const path = require('path');
const os = require('os');

const WorkflowOrchestrator = require('../../tools/workflow-orchestrator');

describe('Generated shards idempotency', () => {
  test('generateGPRD and generateGArchitecture produce identical output on repeated runs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idempotent-'));
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(path.join(docsDir, 'prd.generated'), { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'architecture.generated'), { recursive: true });
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

    const orch = new WorkflowOrchestrator(root);
    const analysis = {
      entities: [
        { id: 'tools/a.js', type: 'module', name: 'tools/a.js', lifecycle: 'active', evidence: [{ file: 'tools/a.js' }], sourcePaths: ['tools/a.js'] }
      ],
      features: [],
      evidence: {}
    };

    const gPrd1 = await orch.generateGPRD(analysis);
    const gArch1 = await orch.generateGArchitecture(analysis);
    const tPrd1 = fs.readFileSync(gPrd1, 'utf8');
    const tArch1 = fs.readFileSync(gArch1, 'utf8');

    const gPrd2 = await orch.generateGPRD(analysis);
    const gArch2 = await orch.generateGArchitecture(analysis);
    const tPrd2 = fs.readFileSync(gPrd2, 'utf8');
    const tArch2 = fs.readFileSync(gArch2, 'utf8');

    expect(tPrd2).toBe(tPrd1);
    expect(tArch2).toBe(tArch1);
    // Ensure markers are present
    expect(/BEGIN GENERATED: PRD/.test(tPrd1)).toBe(true);
    expect(/BEGIN GENERATED: ARCHITECTURE/.test(tArch1)).toBe(true);
  });
});
