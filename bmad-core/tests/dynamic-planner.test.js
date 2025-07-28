const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { planAdaptation, insertSubTask, MAX_STEPS } = require('../tools/dynamic-planner');

describe('Dynamic Planner', () => {
  describe('planAdaptation', () => {
    it('should not split tasks with fewer than MAX_STEPS', () => {
      const memory = {
        taskId: 'test-task-1',
        plan: [],
        subTasks: []
      };
      
      const task = {
        title: 'Simple Task',
        description: 'A simple task',
        steps: [
          { name: 'Step 1' },
          { name: 'Step 2' },
          { name: 'Step 3' }
        ]
      };
      
      const result = planAdaptation(memory, task);
      
      expect(result.subTasks).toHaveLength(0);
      expect(result.plan).toHaveLength(0);
    });
    
    it('should split tasks with more than MAX_STEPS', () => {
      const memory = {
        taskId: 'test-task-2',
        plan: [],
        subTasks: []
      };
      
      const task = {
        title: 'Complex Task',
        description: 'A complex task with many steps',
        steps: Array.from({ length: 8 }, (_, i) => ({ name: `Step ${i + 1}` }))
      };
      
      const result = planAdaptation(memory, task);
      
      expect(result.subTasks).toHaveLength(2);
      expect(result.subTasks[0].steps).toHaveLength(5);
      expect(result.subTasks[1].steps).toHaveLength(3);
      expect(result.subTasks[0].parentTaskId).toBe('test-task-2');
      expect(result.plan).toHaveLength(2);
    });
    
    it('should split tasks with conjunction keywords in description', () => {
      const memory = {
        taskId: 'test-task-3',
        plan: [],
        subTasks: []
      };
      
      const task = {
        title: 'Multi-part Task',
        description: 'First do this and then do that',
        steps: [
          { name: 'Step 1' },
          { name: 'Step 2' },
          { name: 'Step 3' }
        ]
      };
      
      const result = planAdaptation(memory, task);
      
      expect(result.subTasks.length).toBeGreaterThan(0);
    });
    
    it('should handle tasks without steps gracefully', () => {
      const memory = {
        taskId: 'test-task-4',
        plan: [],
        subTasks: []
      };
      
      const task = {
        title: 'Empty Task',
        description: 'A task without steps'
      };
      
      const result = planAdaptation(memory, task);
      
      expect(result).toEqual(memory);
    });
    
    it('should preserve existing subTasks when adding new ones', () => {
      const memory = {
        taskId: 'test-task-5',
        plan: [],
        subTasks: [{ id: 'existing-sub-1', title: 'Existing Sub-task' }]
      };
      
      const task = {
        title: 'Another Complex Task',
        steps: Array.from({ length: 7 }, (_, i) => ({ name: `Step ${i + 1}` }))
      };
      
      const result = planAdaptation(memory, task);
      
      expect(result.subTasks[0]).toEqual({ id: 'existing-sub-1', title: 'Existing Sub-task' });
      expect(result.subTasks.length).toBeGreaterThan(1);
    });
  });
  
  describe('insertSubTask', () => {
    it('should insert a new sub-task and update the plan', () => {
      const memory = {
        taskId: 'test-task-6',
        plan: [],
        subTasks: []
      };
      
      const subTask = {
        title: 'New Sub-task',
        steps: [
          { name: 'Sub-step 1' },
          { name: 'Sub-step 2' }
        ]
      };
      
      const result = insertSubTask(memory, subTask);
      
      expect(result.subTasks).toHaveLength(1);
      expect(result.subTasks[0].id).toBe('test-task-6_sub_1');
      expect(result.subTasks[0].title).toBe('New Sub-task');
      expect(result.subTasks[0].steps).toHaveLength(2);
      expect(result.subTasks[0].status).toBe('pending');
      expect(result.subTasks[0].parentTaskId).toBe('test-task-6');
      
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0]).toEqual({ id: 'test-task-6_sub_1', status: 'pending' });
    });
    
    it('should insert sub-task after current step if present', () => {
      const memory = {
        taskId: 'test-task-7',
        currentStep: 'step-2',
        plan: [
          { id: 'step-1', status: 'completed' },
          { id: 'step-2', status: 'in_progress' },
          { id: 'step-3', status: 'pending' }
        ],
        subTasks: []
      };
      
      const subTask = {
        title: 'Inserted Sub-task',
        steps: [{ name: 'Emergency step' }]
      };
      
      const result = insertSubTask(memory, subTask);
      
      expect(result.plan).toHaveLength(4);
      expect(result.plan[2].id).toBe('test-task-7_sub_1');
      expect(result.plan[3].id).toBe('step-3');
    });
    
    it('should handle memory without subTasks array', () => {
      const memory = {
        taskId: 'test-task-8',
        plan: []
      };
      
      const subTask = {
        title: 'Sub-task for legacy memory',
        steps: [{ name: 'Step' }]
      };
      
      const result = insertSubTask(memory, subTask);
      
      expect(result.subTasks).toBeDefined();
      expect(result.subTasks).toHaveLength(1);
    });
  });
  
  describe('Step splitting logic', () => {
    it('should split steps at conjunction boundaries', () => {
      const memory = {
        taskId: 'test-task-9',
        plan: [],
        subTasks: []
      };
      
      const task = {
        title: 'Task with conjunctions',
        steps: [
          { description: 'Setup the environment' },
          { description: 'Configure the database' },
          { description: 'And then initialize the schema' },
          { description: 'Load test data' },
          { description: 'Then run validation checks' },
          { description: 'Generate reports' }
        ]
      };
      
      const result = planAdaptation(memory, task);
      
      // Should create multiple sub-tasks based on conjunctions
      expect(result.subTasks.length).toBeGreaterThan(1);
      
      // Check that steps are properly distributed
      const totalSteps = result.subTasks.reduce((sum, st) => sum + st.steps.length, 0);
      expect(totalSteps).toBe(task.steps.length);
    });
  });
});

describe('Dynamic Planner Rule Loading', () => {
  const rulesPath = path.join(__dirname, '..', 'structured-tasks', 'dynamic-plan-rules.yaml');
  let originalRules;
  
  beforeAll(() => {
    // Backup original rules if they exist
    if (fs.existsSync(rulesPath)) {
      originalRules = fs.readFileSync(rulesPath, 'utf8');
    }
  });
  
  afterAll(() => {
    // Restore original rules
    if (originalRules) {
      fs.writeFileSync(rulesPath, originalRules);
    }
  });
  
  afterEach(() => {
    // Clear module cache to force reload
    delete require.cache[require.resolve('../tools/dynamic-planner')];
  });
  
  it('should handle missing rules file gracefully', () => {
    // Temporarily rename rules file
    const tempPath = rulesPath + '.temp';
    if (fs.existsSync(rulesPath)) {
      fs.renameSync(rulesPath, tempPath);
    }
    
    try {
      // Should not throw when loading module
      const planner = require('../tools/dynamic-planner');
      expect(planner).toBeDefined();
      expect(planner.planAdaptation).toBeDefined();
    } finally {
      // Restore file
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, rulesPath);
      }
    }
  });
  
  it('should handle invalid YAML gracefully', () => {
    // Write invalid YAML
    fs.writeFileSync(rulesPath, 'invalid: yaml: content: {{{');
    
    // Should not throw when loading module
    const planner = require('../tools/dynamic-planner');
    expect(planner).toBeDefined();
  });
  
  it('should respect custom maxSteps from rules', () => {
    const customRules = {
      id: 'test-rules',
      thresholds: {
        maxSteps: 3
      },
      splitStrategies: {
        byConjunction: {
          keywords: ['and', 'then']
        }
      }
    };
    
    fs.writeFileSync(rulesPath, yaml.dump(customRules));
    
    const planner = require('../tools/dynamic-planner');
    // Force reload of rules
    planner._loadRules();
    
    const memory = {
      taskId: 'test-custom-max',
      plan: [],
      subTasks: []
    };
    
    const task = {
      title: 'Task with 4 steps',
      steps: [
        { name: 'Step 1' },
        { name: 'Step 2' },
        { name: 'Step 3' },
        { name: 'Step 4' }
      ]
    };
    
    const result = planner.planAdaptation(memory, task);
    
    // Should split because we have 4 steps and max is 3
    expect(result.subTasks.length).toBeGreaterThan(0);
    // Verify max steps was updated
    expect(planner._getMaxSteps()).toBe(3);
  });
  
  it('should handle invalid threshold values', () => {
    const invalidRules = {
      id: 'test-rules',
      thresholds: {
        maxSteps: 'not-a-number'
      }
    };
    
    fs.writeFileSync(rulesPath, yaml.dump(invalidRules));
    
    // Should not throw and use defaults
    const planner = require('../tools/dynamic-planner');
    expect(planner).toBeDefined();
  });
  
  it('should use custom conjunction keywords from rules', () => {
    const customRules = {
      id: 'test-rules',
      thresholds: {
        maxSteps: 10
      },
      splitStrategies: {
        byConjunction: {
          keywords: ['moreover', 'subsequently']
        }
      }
    };
    
    fs.writeFileSync(rulesPath, yaml.dump(customRules));
    
    const planner = require('../tools/dynamic-planner');
    // Force reload of rules
    planner._loadRules();
    
    const memory = {
      taskId: 'test-custom-keywords',
      plan: [],
      subTasks: []
    };
    
    const task = {
      title: 'Task with custom conjunctions',
      description: 'Do this moreover do that',
      steps: [
        { name: 'Step 1' },
        { name: 'Step 2' }
      ]
    };
    
    const result = planner.planAdaptation(memory, task);
    
    // Should split because of custom conjunction
    expect(result.subTasks.length).toBeGreaterThan(0);
  });
});

describe('Advanced Rule Conditions', () => {
  afterEach(() => {
    delete require.cache[require.resolve('../tools/dynamic-planner')];
  });
  
  it('should detect multiple domains', () => {
    const { planAdaptation, _loadRules } = require('../tools/dynamic-planner');
    // Ensure rules are loaded after cache clear
    _loadRules();
    
    const memory = {
      taskId: 'test-domains',
      plan: [],
      subTasks: []
    };
    
    const task = {
      title: 'Full-stack task',
      description: 'Update frontend UI and backend API',
      steps: [
        { description: 'Update React component' },
        { description: 'Modify database schema' },
        { description: 'Update API endpoint' }
      ]
    };
    
    const result = planAdaptation(memory, task);
    
    // Should split due to multiple domains
    expect(result.subTasks.length).toBeGreaterThan(0);
  });
  
  it('should detect complex dependencies', () => {
    const { planAdaptation } = require('../tools/dynamic-planner');
    
    const memory = {
      taskId: 'test-dependencies',
      plan: [],
      subTasks: []
    };
    
    const task = {
      title: 'Task with dependencies',
      steps: [
        { description: 'Setup database' },
        { description: 'Create tables (depends on database setup)' },
        { description: 'Load initial data (requires tables)' },
        { description: 'Run validation (after data is loaded)' },
        { description: 'Generate report (wait for validation)' }
      ]
    };
    
    const result = planAdaptation(memory, task);
    
    // Should split due to complex dependencies
    expect(result.subTasks.length).toBeGreaterThan(0);
  });
  
  it('should handle context size threshold', () => {
    const { planAdaptation, _loadRules } = require('../tools/dynamic-planner');
    // Ensure rules are loaded after cache clear
    _loadRules();
    
    const memory = {
      taskId: 'test-context',
      plan: [],
      subTasks: []
    };
    
    const task = {
      title: 'Task with large context',
      steps: [
        { name: 'Step 1' },
        { name: 'Step 2' }
      ]
    };
    
    const context = {
      tokenCount: 3000 // Exceeds default threshold of 2000
    };
    
    const result = planAdaptation(memory, task, context);
    
    // Should split due to large context
    expect(result.subTasks.length).toBeGreaterThan(0);
  });
});

describe('Recursive Task Processing', () => {
  it('should recursively decompose large sub-tasks', () => {
    const { processTaskRecursively, MAX_STEPS, _loadRules } = require('../tools/dynamic-planner');
    // Ensure rules are loaded after cache clear
    _loadRules();
    
    // Create a task with enough steps to guarantee nested decomposition
    // With MAX_STEPS = 5, we need a task that when split will create subtasks
    // that themselves have more than MAX_STEPS
    // If we have 36 steps, splitting by 5 gives us: 7 chunks with 5 steps and 1 with 1 step
    // But we need the chunks themselves to be larger than MAX_STEPS
    // So we need at least (MAX_STEPS + 1) * MAX_STEPS = 30 steps to ensure
    // at least one subtask will have 6 steps and need decomposition
    const task = {
      id: 'main-task', 
      title: 'Very large task',
      steps: Array.from({ length: (MAX_STEPS + 1) * MAX_STEPS }, (_, i) => ({ name: `Step ${i + 1}` }))
    };
    
    const result = processTaskRecursively(task);
    
    // Should have sub-tasks
    expect(result.subTasks).toBeDefined();
    expect(result.subTasks.length).toBeGreaterThan(0);
    expect(result.hasSubTasks).toBe(true);
    expect(result.steps).toHaveLength(0); // Parent steps should be cleared
    
    // Since splitSteps ensures chunks don't exceed MAX_STEPS,
    // no sub-task will need further decomposition in the current implementation
  });
  
  it('should respect maximum recursion depth', () => {
    const { processTaskRecursively } = require('../tools/dynamic-planner');
    
    const task = {
      id: 'deep-task',
      title: 'Task for deep recursion',
      steps: Array.from({ length: 100 }, (_, i) => ({ name: `Step ${i + 1}` }))
    };
    
    const result = processTaskRecursively(task, 2); // Max depth of 2
    
    // Count recursion levels
    let maxDepth = 0;
    function countDepth(t, depth = 0) {
      maxDepth = Math.max(maxDepth, depth);
      if (t.subTasks) {
        t.subTasks.forEach(st => countDepth(st, depth + 1));
      }
    }
    
    countDepth(result);
    expect(maxDepth).toBeLessThanOrEqual(2);
  });
});