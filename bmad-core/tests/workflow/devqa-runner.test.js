const DevQaRunner = require('../../utils/workflow/devqa-runner');

describe('DevQaRunner', () => {
  const createExecutor = ({ flowType = 'linear', results = [], maxIterations = 3, callbacks = {} } = {}) => {
    const queue = [...results];
    return {
      flowType,
      maxIterations,
      callbacks,
      executeStep: jest.fn(async () => {
        if (!queue.length) {
          throw new Error('Unexpected step execution in test stub');
        }
        return queue.shift();
      })
    };
  };

  it('runs linear Dev→QA flow and collects results', async () => {
    const workflow = {
      sequence: [
        { agent: 'dev', action: 'implement_story' },
        { agent: 'qa', action: 'review_story' },
        { agent: 'pm', action: 'finalize_workflow' }
      ]
    };

    const executorStub = createExecutor({
      flowType: 'linear',
      results: [
        { success: true, data: { filesModified: ['a.js'] } },
        { success: true, data: { approved: true } },
        { success: true, data: { completed: true } }
      ]
    });

    const runner = new DevQaRunner(executorStub);
    const result = await runner.execute(workflow, {});

    expect(result.success).toBe(true);
    expect(result.devResult).toEqual({ success: true, data: { filesModified: ['a.js'] } });
    expect(result.qaResult).toEqual({ success: true, data: { approved: true } });
    expect(result.steps).toHaveLength(3);
    expect(executorStub.executeStep).toHaveBeenCalledTimes(3);
  });

  it('marks linear flow as failed when QA rejects implementation', async () => {
    const workflow = {
      sequence: [
        { agent: 'dev', action: 'implement_story' },
        { agent: 'qa', action: 'review_story' }
      ]
    };

    const executorStub = createExecutor({
      flowType: 'linear',
      results: [
        { success: true, data: {} },
        { success: false, error: 'quality issues' }
      ]
    });

    const runner = new DevQaRunner(executorStub);
    const result = await runner.execute(workflow, {});

    expect(result.success).toBe(false);
    expect(result.qaResult).toEqual({ success: false, error: 'quality issues' });
  });

  it('loops in iterative flow until QA approval', async () => {
    const workflow = {
      sequence: [
        { agent: 'dev', action: 'prepare_context' },
        { agent: 'dev', action: 'implement_story' },
        { agent: 'qa', action: 'review_story' },
        { agent: 'dev', action: 'address_qa_feedback' },
        { agent: 'pm', action: 'finalize_workflow' }
      ]
    };

    const executorStub = createExecutor({
      flowType: 'iterative',
      maxIterations: 2,
      results: [
        { success: true },
        { success: true, data: { build: 'initial' } },
        { success: true, data: { approved: false, issues: ['fix logging'] } },
        { success: true, data: { build: 'fixes' } },
        { success: true, data: { approved: true } },
        { success: true }
      ]
    });

    const runner = new DevQaRunner(executorStub);
    const result = await runner.execute(workflow, {});

    expect(result.success).toBe(true);
    expect(result.qaApproved).toBe(true);
    expect(result.totalIterations).toBe(2);
    expect(executorStub.executeStep).toHaveBeenCalledTimes(6);
  });
});
