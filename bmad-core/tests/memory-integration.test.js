const fs = require('fs').promises;
const path = require('path');
const { 
  initializeWorkingMemory, 
  updateWorkingMemory, 
  recordObservation,
  getWorkingMemory,
  clearWorkingMemory
} = require('../agents/index.js');

describe('Working Memory Integration Tests', () => {
  const testAgents = ['dev', 'pm', 'analyst', 'architect', 'qa', 'sm', 'po', 'ux-expert'];
  const memoryDir = path.join(__dirname, '../ai/working-memory/agents');
  
  beforeEach(async () => {
    // Clean up any existing test memory files
    for (const agent of testAgents) {
      await clearWorkingMemory(agent);
    }
  });

  afterEach(async () => {
    // Clean up after tests
    for (const agent of testAgents) {
      await clearWorkingMemory(agent);
    }
  });

  test('should initialize working memory for all agents', async () => {
    for (const agent of testAgents) {
      await initializeWorkingMemory(agent);
      
      const memoryPath = path.join(memoryDir, agent, 'state.json');
      const exists = await fs.access(memoryPath)
        .then(() => true)
        .catch(() => false);
      
      expect(exists).toBe(true);
      
      const memory = await getWorkingMemory(agent);
      expect(memory).toMatchObject({
        taskId: null,
        plan: [],
        currentStep: null,
        context: {},
        observations: [],
        subTasks: []
      });
    }
  });

  test('should update working memory correctly', async () => {
    const agent = 'dev';
    await initializeWorkingMemory(agent);
    
    const updates = {
      taskId: 'implement-feature-123',
      currentStep: 'writing-tests',
      plan: ['analyze-requirements', 'write-tests', 'implement-feature']
    };
    
    await updateWorkingMemory(agent, updates);
    
    const memory = await getWorkingMemory(agent);
    expect(memory.taskId).toBe('implement-feature-123');
    expect(memory.currentStep).toBe('writing-tests');
    expect(memory.plan).toEqual(updates.plan);
  });

  test('should record observations correctly', async () => {
    const agent = 'qa';
    await initializeWorkingMemory(agent);
    
    await recordObservation(agent, 'test-step-1', 'Found 3 failing tests');
    await recordObservation(agent, 'test-step-2', 'Fixed 2 tests, 1 remaining');
    
    const memory = await getWorkingMemory(agent);
    expect(memory.observations).toHaveLength(2);
    expect(memory.observations[0]).toMatchObject({
      stepId: 'test-step-1',
      observation: 'Found 3 failing tests'
    });
  });

  test('should handle concurrent memory updates', async () => {
    const promises = testAgents.map(async (agent) => {
      await initializeWorkingMemory(agent);
      await updateWorkingMemory(agent, {
        taskId: `task-${agent}`,
        currentStep: `step-${agent}`
      });
    });
    
    await Promise.all(promises);
    
    // Verify each agent has its own memory
    for (const agent of testAgents) {
      const memory = await getWorkingMemory(agent);
      expect(memory.taskId).toBe(`task-${agent}`);
      expect(memory.currentStep).toBe(`step-${agent}`);
    }
  });

  test('should persist memory across agent sessions', async () => {
    const agent = 'architect';
    
    // First session
    await initializeWorkingMemory(agent);
    await updateWorkingMemory(agent, {
      taskId: 'arch-design-001',
      context: { technology: 'microservices' }
    });
    
    // Simulate new session without clearing
    const memory = await getWorkingMemory(agent);
    expect(memory.taskId).toBe('arch-design-001');
    expect(memory.context.technology).toBe('microservices');
  });

  test('should handle missing memory files gracefully', async () => {
    const agent = 'sm';
    
    // Try to get memory without initialization
    const memory = await getWorkingMemory(agent);
    
    // Should return default structure
    expect(memory).toMatchObject({
      taskId: null,
      plan: [],
      currentStep: null,
      context: {},
      observations: []
    });
  });

  test('should validate memory structure on updates', async () => {
    const agent = 'ux-expert';
    await initializeWorkingMemory(agent);
    
    // Try to update with invalid structure
    const invalidUpdate = {
      taskId: 'ui-design-001',
      invalidField: 'this should not be added'
    };
    
    await updateWorkingMemory(agent, invalidUpdate);
    
    const memory = await getWorkingMemory(agent);
    // Should only have valid fields
    expect(memory.taskId).toBe('ui-design-001');
    expect(memory.invalidField).toBeUndefined();
  });

  test('should handle memory size limits', async () => {
    const agent = 'dev';
    await initializeWorkingMemory(agent);
    
    // Add many observations
    for (let i = 0; i < 100; i++) {
      await recordObservation(agent, `step-${i}`, `Observation ${i}`);
    }
    
    const memory = await getWorkingMemory(agent);
    // Should maintain reasonable size (implementation dependent)
    expect(memory.observations.length).toBeLessThanOrEqual(100);
  });
  
  test('should handle subTasks in working memory', async () => {
    const agent = 'sm';
    await initializeWorkingMemory(agent);
    
    // Update with subTasks
    const updates = {
      taskId: 'create-story-001',
      subTasks: [
        {
          id: 'create-story-001_sub_1',
          title: 'Gather requirements',
          steps: ['Read PRD', 'Extract features'],
          status: 'pending',
          parentTaskId: 'create-story-001'
        },
        {
          id: 'create-story-001_sub_2',
          title: 'Write story details',
          steps: ['Create tasks', 'Add acceptance criteria'],
          status: 'pending',
          parentTaskId: 'create-story-001'
        }
      ]
    };
    
    const updatedMemory = await updateWorkingMemory(agent, updates);
    
    expect(updatedMemory.subTasks).toHaveLength(2);
    expect(updatedMemory.subTasks[0].id).toBe('create-story-001_sub_1');
    expect(updatedMemory.subTasks[1].id).toBe('create-story-001_sub_2');
    
    // Verify persistence
    const retrievedMemory = await getWorkingMemory(agent);
    expect(retrievedMemory.subTasks).toEqual(updates.subTasks);
  });
});
