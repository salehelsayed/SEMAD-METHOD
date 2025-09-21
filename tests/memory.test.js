const fs = require('fs-extra');
const path = require('path');
const { 
  initializeWorkingMemory, 
  updateWorkingMemory, 
  recordObservation, 
  getWorkingMemory 
} = require('../semad-core/agents/index');

const TEST_AGENT = 'test-agent';
const MEMORY_ROOT = path.join(__dirname, '..', 'bmad-core', 'ai', 'working-memory', 'agents');
const TEST_AGENT_DIR = path.join(MEMORY_ROOT, TEST_AGENT);
const TEST_MEMORY_STATE_FILE = path.join(TEST_AGENT_DIR, 'state.json');

describe('Working Memory Functions', () => {
  beforeEach(async () => {
    await fs.remove(TEST_AGENT_DIR).catch(() => {});
  });

  afterEach(async () => {
    await fs.remove(TEST_AGENT_DIR).catch(() => {});
  });

  describe('initializeWorkingMemory', () => {
    it('should create a new memory file with default structure', async () => {
      const memoryFile = await initializeWorkingMemory(TEST_AGENT);

      expect(memoryFile.endsWith(path.join('ai', 'working-memory', 'agents', TEST_AGENT, 'state.json'))).toBe(true);

      const stateExists = await fs.pathExists(memoryFile);
      expect(stateExists).toBe(true);

      const state = await fs.readJson(memoryFile);
      expect(state).toEqual({
        taskId: null,
        currentStep: null,
        context: {}
      });

      const agentDir = path.dirname(memoryFile);
      const plan = await fs.readJson(path.join(agentDir, 'plan.json'));
      expect(plan).toEqual([]);

      const observations = await fs.readFile(path.join(agentDir, 'observations.jsonl'), 'utf8');
      expect(observations.trim()).toBe('');
    });

    it('should ensure memory directory exists', async () => {
      // Simply check that initializeWorkingMemory ensures the directory exists
      await initializeWorkingMemory(TEST_AGENT);

      const dirExists = await fs.pathExists(TEST_AGENT_DIR);
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
      
      const exists = await fs.pathExists(TEST_MEMORY_STATE_FILE);
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

    it('should return default structure if memory does not exist', async () => {
      const memory = await getWorkingMemory('non-existent-agent');
      
      expect(memory).toMatchObject({
        taskId: null,
        plan: [],
        currentStep: null,
        context: {},
        observations: []
      });
    });
  });
});
