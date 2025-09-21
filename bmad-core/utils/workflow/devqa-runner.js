class DevQaRunner {
  constructor(executor) {
    this.executor = executor;
  }

  async execute(workflow, context) {
    if (this.executor.flowType === 'iterative') {
      return this.executeIterative(workflow, context);
    }
    return this.executeLinear(workflow, context);
  }

  async executeLinear(workflow, context) {
    const sequence = workflow.sequence || [];
    const results = {
      success: true,
      flowType: 'linear',
      steps: [],
      devResult: null,
      qaResult: null
    };

    const devStepIndex = sequence.findIndex(step =>
      step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')
    );
    const qaStepIndex = sequence.findIndex(step =>
      step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')
    );

    for (let i = 0; i <= devStepIndex && i < sequence.length; i += 1) {
      const step = sequence[i];
      const stepResult = await this.executor.executeStep(step, context);
      results.steps.push(stepResult);

      if (step.agent === 'dev') {
        results.devResult = stepResult;
      }

      if (!stepResult.success) {
        results.success = false;
        return results;
      }
    }

    if (qaStepIndex > devStepIndex && qaStepIndex < sequence.length) {
      const qaStep = sequence[qaStepIndex];
      const qaResult = await this.executor.executeStep(qaStep, {
        ...context,
        devImplementation: results.devResult
      });

      results.steps.push(qaResult);
      results.qaResult = qaResult;

      if (!qaResult.success) {
        results.success = false;
      }
    }

    for (let i = qaStepIndex + 1; i < sequence.length; i += 1) {
      const step = sequence[i];
      const stepResult = await this.executor.executeStep(step, context);
      results.steps.push(stepResult);

      if (!stepResult.success && step.critical !== false) {
        results.success = false;
        break;
      }
    }

    return results;
  }

  async executeIterative(workflow, context) {
    const sequence = workflow.sequence || [];
    const results = {
      success: false,
      flowType: 'iterative',
      iterations: [],
      totalIterations: 0,
      qaApproved: false
    };

    const devStepIndex = sequence.findIndex(step =>
      step.agent === 'dev' && (step.action === 'implement_story' || step.creates === 'implementation_files')
    );
    const qaStepIndex = sequence.findIndex(step =>
      step.agent === 'qa' && (step.action === 'review_implementation' || step.action === 'review_story')
    );
    const devFixStepIndex = sequence.findIndex(step =>
      step.agent === 'dev' && step.action === 'address_qa_feedback'
    );

    for (let i = 0; i < devStepIndex && i < sequence.length; i += 1) {
      const step = sequence[i];
      const stepResult = await this.executor.executeStep(step, context);

      if (!stepResult.success) {
        results.success = false;
        results.error = 'Failed during pre-development steps';
        return results;
      }
    }

    let iteration = 1;
    let qaApproved = false;
    let devResult = null;
    let qaFeedback = null;

    while (!qaApproved && iteration <= this.executor.maxIterations) {
      const iterationResult = {
        iteration,
        devResult: null,
        qaResult: null
      };

      if (iteration === 1) {
        const devStep = sequence[devStepIndex];
        devResult = await this.executor.executeStep(devStep, context);
        iterationResult.devResult = devResult;
      } else {
        const fixStep = devFixStepIndex >= 0
          ? sequence[devFixStepIndex]
          : { agent: 'dev', action: 'address_qa_feedback' };

        devResult = await this.executor.executeStep(fixStep, {
          ...context,
          qaFeedback,
          previousImplementation: devResult
        });
        iterationResult.devResult = devResult;
      }

      if (!devResult.success) {
        iterationResult.error = 'Dev implementation failed';
        results.iterations.push(iterationResult);
        break;
      }

      const qaStep = sequence[qaStepIndex];
      const qaResult = await this.executor.executeStep(qaStep, {
        ...context,
        devImplementation: devResult,
        iteration
      });

      iterationResult.qaResult = qaResult;
      results.iterations.push(iterationResult);

      if (qaResult.success && qaResult.data?.approved) {
        qaApproved = true;
        results.qaApproved = true;
        results.success = true;
      } else if (qaResult.data?.issues) {
        qaFeedback = qaResult.data.issues;

        if (iteration >= this.executor.maxIterations) {
          const handler = this.executor.callbacks.onMaxIterationsReached;
          if (handler) {
            const shouldContinue = await handler(iteration, qaFeedback);
            if (!shouldContinue) {
              break;
            }
            this.executor.maxIterations += 5;
          } else {
            break;
          }
        }
      }

      iteration += 1;
    }

    results.totalIterations = iteration - 1;

    if (qaApproved) {
      for (let i = qaStepIndex + 1; i < sequence.length; i += 1) {
        const step = sequence[i];

        if (step.agent === 'dev' && step.action === 'address_qa_feedback') {
          continue;
        }

        const stepResult = await this.executor.executeStep(step, context);
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

module.exports = DevQaRunner;
