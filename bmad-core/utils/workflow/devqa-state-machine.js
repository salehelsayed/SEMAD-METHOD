/**
 * Dev↔QA State Machine
 * States: PLAN → DEV_IMPL → QA_REVIEW → DEV_FIX → DONE/ABORT
 * Transitions based on QA output (schema-validated in AgentRunner layer when used).
 */

class DevQAStateMachine {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.logger = options.logger || { taskStart(){}, taskComplete(){}, warning(){}, error(){} };
  }

  async run(workflow, context, executeStep) {
    const results = {
      success: false,
      flowType: 'iterative-sm',
      iterations: [],
      totalIterations: 0,
      qaApproved: false
    };

    const seq = workflow.sequence || [];
    const devIdx = seq.findIndex(s => s.agent === 'dev' && (s.action === 'implement_story' || s.creates === 'implementation_files'));
    const qaIdx = seq.findIndex(s => s.agent === 'qa' && (s.action === 'review_implementation' || s.action === 'review_story'));
    const fixIdx = seq.findIndex(s => s.agent === 'dev' && s.action === 'address_qa_feedback');

    // Pre-dev steps
    for (let i = 0; i < devIdx && i < seq.length; i++) {
      const step = seq[i];
      const stepResult = await executeStep(step, context);
      if (!stepResult.success && step.critical !== false) {
        results.error = 'Failed during pre-development steps';
        return results;
      }
    }

    let iteration = 1;
    let previousIssuesFingerprint = null;
    let qaApproved = false;
    let devResult = null;
    let qaFeedback = null;

    while (!qaApproved && iteration <= this.maxIterations) {
      const it = { iteration, devResult: null, qaResult: null };
      this.logger.taskStart(`Dev↔QA Iteration ${iteration}`, 'State: DEV_IMPL');

      // DEV_IMPL or DEV_FIX
      if (iteration === 1) {
        const devStep = seq[devIdx];
        devResult = await executeStep(devStep, context);
      } else {
        const fixStep = fixIdx >= 0 ? seq[fixIdx] : { agent: 'dev', action: 'address_qa_feedback' };
        devResult = await executeStep(fixStep, { ...context, qaFeedback, previousImplementation: devResult });
      }
      it.devResult = devResult;
      if (!devResult.success) {
        it.error = 'Dev implementation failed';
        results.iterations.push(it);
        break;
      }

      // QA_REVIEW
      this.logger.taskStart(`Dev↔QA Iteration ${iteration}`, 'State: QA_REVIEW');
      const qaStep = seq[qaIdx];
      const qaResult = await executeStep(qaStep, { ...context, devImplementation: devResult, iteration });
      it.qaResult = qaResult;
      results.iterations.push(it);

      const approved = !!(qaResult.success && (qaResult.data?.approved || qaResult.approved));
      const issues = qaResult.data?.issues || qaResult.issues || [];

      if (approved) {
        qaApproved = true;
        results.qaApproved = true;
        results.success = true;
        break;
      }

      // stop on repeated identical issues fingerprint
      const currentFP = JSON.stringify(issues);
      if (previousIssuesFingerprint && currentFP === previousIssuesFingerprint) {
        this.logger.warning('QA issues repeated; stopping to avoid infinite loop.');
        break;
      }
      previousIssuesFingerprint = currentFP;
      qaFeedback = issues;
      iteration += 1;
    }

    results.totalIterations = iteration - (results.qaApproved ? 0 : 1);

    // Post-QA steps if approved
    if (qaApproved) {
      for (let i = qaIdx + 1; i < seq.length; i++) {
        const step = seq[i];
        if (step.agent === 'dev' && step.action === 'address_qa_feedback') continue;
        const stepResult = await executeStep(step, context);
        if (!stepResult.success && step.critical !== false) {
          results.success = false;
          results.error = 'Failed during post-QA steps';
          break;
        }
      }
    }

    return results;
  }
}

module.exports = DevQAStateMachine;

