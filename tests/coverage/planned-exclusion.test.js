const fs = require('fs');
const path = require('path');
const os = require('os');

const WorkflowOrchestrator = require('../../tools/workflow-orchestrator');

describe('Planned features do not affect active-entity coverage', () => {
  test('coverage totals count only active entities, not planned features', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planned-cov-'));
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(path.join(docsDir, 'architecture'), { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'prd'), { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'architecture.generated'), { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'prd.generated'), { recursive: true });
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

    // Minimal docs content mentioning neither entity nor planned feature
    fs.writeFileSync(path.join(docsDir, 'architecture', 'architecture.md'), '# Architecture\n');
    fs.writeFileSync(path.join(docsDir, 'prd', 'PRD.md'), '# PRD\n');
    fs.writeFileSync(path.join(docsDir, 'architecture.generated', 'architecture.generated.md'), '<!-- BEGIN GENERATED: ARCHITECTURE -->\n<!-- END GENERATED -->\n');
    fs.writeFileSync(path.join(docsDir, 'prd.generated', 'PRD.generated.md'), '<!-- BEGIN GENERATED: PRD -->\n<!-- END GENERATED -->\n');

    const orch = new WorkflowOrchestrator(root);
    const analysis = {
      entities: [
        { id: 'tools/a.js', type: 'module', name: 'Alpha', lifecycle: 'active', evidence: [{ file: 'tools/a.js' }], sourcePaths: ['tools/a.js'] }
      ],
      features: [
        { key: 'alpha', name: 'Alpha', present: true, lifecycle: 'active' },
        { key: 'beta', name: 'Beta', present: false, lifecycle: 'planned' }
      ],
      evidence: {}
    };

    const cov = await orch.qaValidateDocsCodeAlignment(analysis);
    expect(cov.total).toBe(1); // only active entity counted
    expect(Array.isArray(cov.missing)).toBe(true);
    expect(cov.missing.length).toBe(1); // Alpha missing (not mentioned)
    // Mention planned feature in docs should not change totals
    fs.writeFileSync(path.join(docsDir, 'prd', 'PRD.md'), '# PRD\nBeta\n');
    const cov2 = await orch.qaValidateDocsCodeAlignment(analysis);
    expect(cov2.total).toBe(1);
  });
});
