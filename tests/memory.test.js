const fs = require('fs-extra');
const path = require('path');
const { 
  initializeWorkingMemory, 
  updateWorkingMemory, 
  recordObservation, 
  getWorkingMemory 
} = require('../bmad-core/agents/index');
const { storeMemorySnippet, retrieveMemory } = require('../bmad-core/utils/qdrant');

const TEST_AGENT = 'test-agent';
const MEMORY_DIR = path.join(__dirname, '..', 'bmad-core', 'ai');
const TEST_MEMORY_FILE = path.join(MEMORY_DIR, `working_memory_${TEST_AGENT}.json`);

describe('Working Memory Functions', () => {
  beforeEach(async () => {
    await fs.remove(TEST_MEMORY_FILE);
  });

  afterEach(async () => {
    await fs.remove(TEST_MEMORY_FILE);
  });

  describe('initializeWorkingMemory', () => {
    it('should create a new memory file with default structure', async () => {
      const memoryFile = await initializeWorkingMemory(TEST_AGENT);
      
      expect(memoryFile).toBe(TEST_MEMORY_FILE);
      
      const exists = await fs.pathExists(TEST_MEMORY_FILE);
      expect(exists).toBe(true);
      
      const memory = await fs.readJson(TEST_MEMORY_FILE);
      expect(memory).toEqual({
        taskId: null,
        plan: [],
        currentStep: null,
        context: {},
        observations: []
      });
    });

    it('should ensure memory directory exists', async () => {
      await fs.remove(MEMORY_DIR);
      
      await initializeWorkingMemory(TEST_AGENT);
      
      const dirExists = await fs.pathExists(MEMORY_DIR);
      expect(dirExists).toBe(true);
    });
  });

  describe('updateWorkingMemory', () => {
    it('should update existing memory with new values', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      
      const updates = {
        taskId: 'TASK-123',
        currentStep: 'implementation',
        context: { feature: 'authentication' }
      };
      
      const memory = await updateWorkingMemory(TEST_AGENT, updates);
      
      expect(memory.taskId).toBe('TASK-123');
      expect(memory.currentStep).toBe('implementation');
      expect(memory.context).toEqual({ feature: 'authentication' });
    });

    it('should merge context updates without overwriting', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      
      await updateWorkingMemory(TEST_AGENT, {
        context: { feature: 'auth', version: '1.0' }
      });
      
      const memory = await updateWorkingMemory(TEST_AGENT, {
        context: { feature: 'authentication', module: 'login' }
      });
      
      expect(memory.context).toEqual({
        feature: 'authentication',
        version: '1.0',
        module: 'login'
      });
    });

    it('should handle plan updates correctly', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      
      await updateWorkingMemory(TEST_AGENT, {
        plan: ['step1', 'step2']
      });
      
      const memory = await updateWorkingMemory(TEST_AGENT, {
        plan: 'step3'
      });
      
      expect(memory.plan).toEqual(['step1', 'step2', 'step3']);
    });

    it('should create memory file if it does not exist', async () => {
      const memory = await updateWorkingMemory(TEST_AGENT, {
        taskId: 'NEW-TASK'
      });
      
      expect(memory.taskId).toBe('NEW-TASK');
      
      const exists = await fs.pathExists(TEST_MEMORY_FILE);
      expect(exists).toBe(true);
    });
  });

  describe('recordObservation', () => {
    it('should add observations with timestamp', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      
      const memory = await recordObservation(TEST_AGENT, 'step1', 'Completed authentication setup');
      
      expect(memory.observations).toHaveLength(1);
      expect(memory.observations[0]).toMatchObject({
        stepId: 'step1',
        observation: 'Completed authentication setup'
      });
      expect(memory.observations[0].timestamp).toBeDefined();
    });

    it('should append multiple observations', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      
      await recordObservation(TEST_AGENT, 'step1', 'First observation');
      const memory = await recordObservation(TEST_AGENT, 'step2', 'Second observation');
      
      expect(memory.observations).toHaveLength(2);
      expect(memory.observations[0].observation).toBe('First observation');
      expect(memory.observations[1].observation).toBe('Second observation');
    });
  });

  describe('getWorkingMemory', () => {
    it('should retrieve existing memory', async () => {
      await initializeWorkingMemory(TEST_AGENT);
      await updateWorkingMemory(TEST_AGENT, { taskId: 'TEST-123' });
      
      const memory = await getWorkingMemory(TEST_AGENT);
      
      expect(memory).toBeDefined();
      expect(memory.taskId).toBe('TEST-123');
    });

    it('should return null if memory does not exist', async () => {
      const memory = await getWorkingMemory('non-existent-agent');
      
      expect(memory).toBeNull();
    });
  });
});

describe('Qdrant Integration', () => {
  describe('storeMemorySnippet', () => {
    it('should generate embeddings and store memory', async () => {
      const id = await storeMemorySnippet('dev', 'Implemented user authentication', {
        type: 'story-completion'
      });
      
      if (id) {
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(0);
      }
    });
  });

  describe('retrieveMemory', () => {
    it('should retrieve relevant memories', async () => {
      await storeMemorySnippet('dev', 'Implemented user login feature', {
        type: 'feature'
      });
      
      await storeMemorySnippet('dev', 'Fixed authentication bug', {
        type: 'bugfix'
      });
      
      const memories = await retrieveMemory('authentication implementation', 2);
      
      expect(Array.isArray(memories)).toBe(true);
      
      if (memories.length > 0) {
        expect(memories[0]).toHaveProperty('score');
        expect(memories[0]).toHaveProperty('text');
        expect(memories[0]).toHaveProperty('agentName');
      }
    });
  });
});