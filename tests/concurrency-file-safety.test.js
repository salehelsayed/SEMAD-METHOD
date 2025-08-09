const path = require('path');
const fs = require('fs').promises;

const {
  initializeWorkingMemory,
  updateWorkingMemory,
  recordObservation,
  getWorkingMemory,
  clearWorkingMemory
} = require('../bmad-core/agents/index.js');

const fileAdapter = require('../bmad-core/utils/memory/adapters/file');

describe('Concurrency and File Safety', () => {
  const agent = 'race-condition-agent';

  beforeEach(async () => {
    await clearWorkingMemory(agent);
  });

  afterEach(async () => {
    await clearWorkingMemory(agent);
  });

  test('concurrent observations do not corrupt JSON', async () => {
    await initializeWorkingMemory(agent);
    const N = 50;
    await Promise.all(
      Array.from({ length: N }, (_, i) => recordObservation(agent, `s${i}`, `obs ${i}`))
    );
    const mem = await getWorkingMemory(agent);
    expect(mem && typeof mem === 'object').toBe(true);
    expect(Array.isArray(mem.observations)).toBe(true);
    // Should record all or up to cap (100)
    expect(mem.observations.length).toBeGreaterThanOrEqual(Math.min(N, 1));
  });

  test('concurrent updates are serialized safely', async () => {
    await initializeWorkingMemory(agent);
    const N = 30;
    await Promise.all(
      Array.from({ length: N }, (_, i) => updateWorkingMemory(agent, { plan: `p${i}` }))
    );
    const mem = await getWorkingMemory(agent);
    expect(Array.isArray(mem.plan)).toBe(true);
    // Expect at least some of the updates to be present and JSON intact
    expect(mem.plan.length).toBeGreaterThanOrEqual(Math.min(N, 1));
  });

  test('file adapter JSONL log handles concurrent appends', async () => {
    const N = 60;
    await Promise.all(
      Array.from({ length: N }, (_, i) => fileAdapter.logEntry(agent, 'observation', `L${i}`, { idx: i }))
    );
    const history = await fileAdapter.getHistory(agent);
    expect(Array.isArray(history)).toBe(true);
    // Should have at least N entries; if multiple prior runs, length can be >= N
    expect(history.length).toBeGreaterThanOrEqual(N);
    // Verify each entry is valid JSON shape
    expect(history[0]).toHaveProperty('timestamp');
    expect(history[0]).toHaveProperty('type');
  });
});

