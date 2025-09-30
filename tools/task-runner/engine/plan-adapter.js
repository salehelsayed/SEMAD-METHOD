const { resolveModule } = require('../utils');
const { planAdaptation } = require(resolveModule('tools/dynamic-planner', '../semad-core/tools/dynamic-planner'));
const { TaskExecutionError } = require(resolveModule('errors/task-errors', '../semad-core/errors/task-errors'));

class PlanAdapter {
  estimateTokenCount(task) {
    try {
      let text = '';
      if (!task) return 0;
      if (task.title) text += ` ${task.title}`;
      if (task.name) text += ` ${task.name}`;
      if (task.description) text += ` ${task.description}`;

      const steps = Array.isArray(task.steps) ? task.steps : [];
      for (const step of steps) {
        if (step.name) text += ` ${step.name}`;
        if (step.description) text += ` ${step.description}`;
        const actions = Array.isArray(step.actions) ? step.actions : [];
        for (const action of actions) {
          if (typeof action.description === 'string') {
            text += ` ${action.description}`;
          }
        }
      }

      return Math.ceil((text || '').length / 4);
    } catch (error) {
      return 0;
    }
  }

  adaptPlan(memory, task) {
    try {
      const tokenCount = this.estimateTokenCount(task);
      return planAdaptation(memory, task, { tokenCount });
    } catch (error) {
      throw new TaskExecutionError(
        `Failed to adapt plan for task: ${error.message}`,
        { id: 'plan-adaptation', name: 'Plan Adaptation' },
        { task: task?.name, error: error.message }
      );
    }
  }
}

module.exports = PlanAdapter;
