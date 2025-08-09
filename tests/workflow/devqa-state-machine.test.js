const DevQAStateMachine = require('../../bmad-core/utils/workflow/devqa-state-machine');

describe('Dev↔QA State Machine', () => {
  test('approves on second iteration', async () => {
    const sm = new DevQAStateMachine({ maxIterations: 3, logger: { taskStart(){}, taskComplete(){}, warning(){}, error(){} } });
    const workflow = {
      sequence: [
        { agent: 'analyst', action: 'prep' },
        { agent: 'dev', action: 'implement_story' },
        { agent: 'qa', action: 'review_implementation' },
        { agent: 'dev', action: 'address_qa_feedback' },
        { agent: 'sm', action: 'wrap' }
      ]
    };
    let call = 0;
    const executeStep = async (step, ctx) => {
      if (step.agent === 'qa') {
        call++;
        if (call >= 2) return { success: true, data: { approved: true, issues: [] } };
        return { success: true, data: { approved: false, issues: [{ message: 'fix', severity: 'low' }] } };
      }
      return { success: true, data: {} };
    };
    const res = await sm.run(workflow, {}, executeStep);
    expect(res.success).toBe(true);
    expect(res.qaApproved).toBe(true);
    expect(res.iterations.length).toBeGreaterThanOrEqual(1);
  });
});

