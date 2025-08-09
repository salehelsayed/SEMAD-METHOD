const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Use the relocated facade
const umm = require('../../bmad-core/utils/memory/unified-memory-manager');

jest.mock('../../bmad-core/utils/agent-memory-manager', () => ({
  loadWorkingMemory: jest.fn(async () => ({ agentName: 'dev', observations: [] })),
  initializeWorkingMemory: jest.fn(async () => ({ agentName: 'dev', observations: [] })),
  retrieveRelevantMemories: jest.fn(async () => ([])),
  updateWorkingMemory: jest.fn(async () => true),
  archiveTaskMemory: jest.fn(async () => true),
  storeMemorySnippetWithContext: jest.fn(async () => 'id-1'),
  getMemorySummary: jest.fn(async () => ({ observationCount: 0 }))
}));

const agentMemory = require('../../bmad-core/utils/agent-memory-manager');

describe('Unified Memory Manager (facade)', () => {
  let cwd;
  let tmp;
  beforeAll(async () => {
    cwd = process.cwd();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'umm-test-'));
    process.chdir(tmp);
  });
  afterAll(async () => {
    process.chdir(cwd);
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  });

  test('loads memory for task via agent-memory-manager', async () => {
    const res = await umm.loadMemoryForTask('dev', { taskId: 't1', storyId: 'S-1' });
    expect(res).toHaveProperty('shortTerm');
    expect(res).toHaveProperty('longTerm');
  });

  test('falls back to file adapter when agent-memory-manager fails', async () => {
    agentMemory.loadWorkingMemory.mockRejectedValueOnce(new Error('boom'));
    const res = await umm.loadMemoryForTask('qa', { taskId: 't2' });
    expect(res).toHaveProperty('shortTerm');
    expect(res).toHaveProperty('longTerm');
  });
});

