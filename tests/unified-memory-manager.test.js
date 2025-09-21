const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const AgentMemoryStore = require('../semad-core/agents/agent-memory-store');
const WorkingMemoryStore = require('../semad-core/utils/working-memory-store');

describe('AgentMemoryStore', () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-memory-store-'));
    store = new AgentMemoryStore({ baseDirectory: tempDir, maxObservations: 3 });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('initializes a new agent store with default files', async () => {
    const paths = await store.initializeAgent('dev');
    const entries = await fs.readdir(paths.agentDir);

    expect(entries.sort()).toEqual([
      'observations.jsonl',
      'plan.json',
      'state.json',
      'subtasks'
    ]);

    const state = JSON.parse(await fs.readFile(paths.statePath, 'utf8'));
    expect(state).toEqual({ taskId: null, currentStep: null, context: {} });
  });

  test('updates memory while preserving subtasks and observations', async () => {
    const agent = 'qa';
    await store.initializeAgent(agent);

    await store.updateAgentMemory(agent, {
      taskId: 'QA-001',
      currentStep: 'analysis',
      context: { storyId: 'STORY-1' },
      plan: ['collect data'],
      subTasks: [
        { id: 'sub-1', title: 'Review findings', status: 'pending' }
      ],
      observations: [{ note: 'Initial observation' }]
    });

    const memory = await store.getAgentMemory(agent);
    expect(memory.taskId).toBe('QA-001');
    expect(memory.plan).toEqual(['collect data']);
    expect(memory.subTasks[0]).toMatchObject({ id: 'sub-1', status: 'pending' });
    expect(memory.observations).toHaveLength(1);
  });

  test('records observations with cap on history', async () => {
    const agent = 'architect';
    await store.initializeAgent(agent);

    await store.recordObservation(agent, { note: 'First' });
    await store.recordObservation(agent, { note: 'Second' });
    await store.recordObservation(agent, { note: 'Third' });
    const observations = await store.recordObservation(agent, { note: 'Fourth' });

    expect(observations).toHaveLength(3);
    expect(observations[0].note).toBe('Second');
    expect(observations[2].note).toBe('Fourth');
  });

  test('clears agent store when requested', async () => {
    const agent = 'pm';
    const paths = await store.initializeAgent(agent);
    await store.clearAgent(agent);

    await expect(fs.access(paths.agentDir)).rejects.toThrow();
  });
});

describe('WorkingMemoryStore', () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'working-memory-store-'));
    store = new WorkingMemoryStore(tempDir, {
      maxInteractionsPerChunk: 2,
      maxChunksPerSession: 2,
      sessionTtlDays: 1
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('appends interactions and retrieves them in reverse chronological order', async () => {
    await store.appendInteraction('dev', {
      id: 'int-1',
      timestamp: '2024-01-01T00:00:00Z',
      agentName: 'dev',
      context: {},
      phase: 'analysis'
    });

    await store.appendInteraction('dev', {
      id: 'int-2',
      timestamp: '2024-01-01T01:00:00Z',
      agentName: 'dev',
      context: {},
      phase: 'analysis'
    });

    const interactions = await store.getInteractions('dev');
    expect(interactions.map(i => i.id)).toEqual(['int-2', 'int-1']);
  });

  test('updates an existing interaction via updateInteraction', async () => {
    await store.appendInteraction('qa', {
      id: 'qa-int',
      timestamp: new Date().toISOString(),
      agentName: 'qa',
      context: { storyId: 'STORY-2' },
      phase: 'review'
    });

    const updated = await store.updateInteraction('qa', 'qa-int', prev => ({
      ...prev,
      phase: 'validated',
      context: { ...prev.context, status: 'approved' }
    }));

    expect(updated.phase).toBe('validated');
    expect(updated.context.status).toBe('approved');
  });

  test('cleans up old sessions based on TTL', async () => {
    await store.appendInteraction('sm', {
      id: 'sm-int-1',
      timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      agentName: 'sm',
      context: {},
      phase: 'planning'
    });

    await store.cleanup({ olderThanMs: 24 * 60 * 60 * 1000 });

    const interactions = await store.getInteractions('sm');
    expect(interactions).toEqual([]);
  });
});
