/**
 * Simple Task Tracker
 * A lightweight in-memory task tracking system for agent workflows
 * Replaces the over-engineered memory system for basic task tracking needs
 */

class TaskTracker {
  constructor() {
    this.workflow = null;
    this.history = [];
    this.startTime = new Date();
  }

  /**
   * Start a new workflow with a list of tasks
   * @param {string} workflowName - Name of the workflow (e.g., 'develop-story')
   * @param {Array} tasks - Array of task objects with at least a 'name' property
   */
  startWorkflow(workflowName, tasks) {
    this.workflow = {
      name: workflowName,
      tasks: tasks.map((task, index) => ({
        ...task,
        id: task.id || ('task-' + (index + 1)),
        status: 'pending'
      })),
      currentIndex: 0,
      completed: [],
      startTime: new Date(),
      agentName: null
    };
    
    this.log('Started workflow: ' + workflowName + ' with ' + tasks.length + ' tasks');
    return true;
  }

  /**
   * Backward-compatibility helper: add a task to the current workflow
   * If no workflow exists, starts an 'adhoc' workflow with this single task.
   * Accepts a string task name or a task object with a 'name' property.
   * @param {string|Object} task - Task name or task object
   * @returns {boolean} Success status
   */
  addTask(task) {
    // Normalize input
    const taskObj = typeof task === 'string' ? { name: task } : { ...(task || {}) };
    if (!taskObj.name) {
      this.log('addTask called without a task name', 'warning');
      return false;
    }

    // If no workflow yet, create an adhoc workflow
    if (!this.workflow) {
      this.startWorkflow('adhoc', [taskObj]);
      this.log('Initialized adhoc workflow with task: ' + taskObj.name, 'info');
      return true;
    }

    // Append to existing workflow
    const nextIndex = this.workflow.tasks.length + 1;
    this.workflow.tasks.push({
      ...taskObj,
      id: taskObj.id || ('task-' + nextIndex),
      status: 'pending'
    });
    this.log("Added task to workflow '" + this.workflow.name + "': " + taskObj.name, 'info');
    return true;
  }

  /**
   * Find task index by id or name
   * @param {string} identifier - task id or name
   * @returns {number} index or -1 if not found
   */
  _findTaskIndex(identifier) {
    if (!this.workflow) return -1;
    const idxById = this.workflow.tasks.findIndex(t => t.id === identifier);
    if (idxById >= 0) return idxById;
    const idxByName = this.workflow.tasks.findIndex(t => t.name === identifier);
    return idxByName;
  }

  /**
   * Backward-compat: update a task's status by id or name
   * @param {string} identifier - task id or name
   * @param {string} status - pending | in_progress | completed | skipped
   * @param {string} notes - optional notes
   * @returns {boolean}
   */
  updateTask(identifier, status = 'pending', notes = '') {
    if (!this.workflow) {
      // If no workflow, initialize adhoc with this single task
      this.startWorkflow('adhoc', [{ name: typeof identifier === 'string' ? identifier : 'task' }]);
    }
    const idx = this._findTaskIndex(identifier);
    if (idx < 0) {
      // If not found, add then mark
      this.addTask(typeof identifier === 'string' ? identifier : 'task');
    }
    const targetIdx = idx >= 0 ? idx : this.workflow.tasks.length - 1;
    const task = this.workflow.tasks[targetIdx];
    task.status = status;
    if (status === 'in_progress') {
      this.workflow.currentIndex = targetIdx;
      this.log("Task '" + task.name + "' is now in progress", 'info');
    } else if (status === 'completed') {
      // Mirror completeCurrentTask behavior for this specific task
      this.workflow.completed.push({ task, completedAt: new Date(), notes, duration: this.getTaskDuration() });
      this.log('Completed task: ' + task.name, 'success');
    } else if (status === 'skipped') {
      task.skipReason = notes;
      this.log('Skipped task: ' + task.name + ' - ' + (notes || 'no reason provided'), 'warning');
    } else {
      this.log("Updated task '" + task.name + "' status to " + status, 'info');
    }
    return true;
  }

  /** Start a task by id or name (alias) */
  startTask(identifier, notes = '') { return this.updateTask(identifier, 'in_progress', notes); }
  /** Complete a task by id or name (alias) */
  completeTask(identifier, notes = '') { return this.updateTask(identifier, 'completed', notes); }

  /**
   * Set the agent name for the current workflow
   * @param {string} agentName - Name of the agent (e.g., 'dev', 'qa')
   */
  setAgent(agentName) {
    if (this.workflow) {
      this.workflow.agentName = agentName;
    }
  }

  /**
   * Get the current task details
   * @returns {Object|null} Current task info or null if no tasks remain
   */
  getCurrentTask() {
    if (!this.workflow || this.workflow.currentIndex >= this.workflow.tasks.length) {
      return null;
    }
    
    const task = this.workflow.tasks[this.workflow.currentIndex];
    return {
      task: task,
      index: this.workflow.currentIndex,
      total: this.workflow.tasks.length,
      progress: (this.workflow.currentIndex + 1) + '/' + this.workflow.tasks.length,
      percentComplete: Math.round((this.workflow.completed.length / this.workflow.tasks.length) * 100)
    };
  }

  /**
   * Mark the current task as completed
   * @param {string} notes - Optional completion notes
   * @returns {boolean} Success status
   */
  completeCurrentTask(notes = '') {
    const current = this.getCurrentTask();
    if (!current) return false;
    
    // Update task status
    this.workflow.tasks[this.workflow.currentIndex].status = 'completed';
    
    // Add to completed list
    this.workflow.completed.push({
      task: current.task,
      completedAt: new Date(),
      notes: notes,
      duration: this.getTaskDuration()
    });
    
    this.log('Completed task ' + (current.index + 1) + ': ' + current.task.name, 'success');
    
    // Move to next task
    this.workflow.currentIndex++;
    
    // Check if workflow is complete
    if (this.workflow.currentIndex >= this.workflow.tasks.length) {
      this.log("Workflow '" + this.workflow.name + "' completed! All " + this.workflow.tasks.length + ' tasks done.', 'success');
    }
    
    return true;
  }

  /**
   * Skip the current task with a reason
   * @param {string} reason - Reason for skipping
   * @returns {boolean} Success status
   */
  skipCurrentTask(reason) {
    const current = this.getCurrentTask();
    if (!current) return false;
    
    this.workflow.tasks[this.workflow.currentIndex].status = 'skipped';
    this.workflow.tasks[this.workflow.currentIndex].skipReason = reason;
    
    this.log('Skipped task ' + (current.index + 1) + ': ' + current.task.name + ' - Reason: ' + reason, 'warning');
    
    this.workflow.currentIndex++;
    return true;
  }

  /**
   * Log a message with timestamp and context
   * @param {string} message - Message to log
   * @param {string} type - Log type (info, success, warning, error)
   */
  log(message, type = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      type: type,
      message: message,
      workflowContext: this.workflow ? {
        name: this.workflow.name,
        agent: this.workflow.agentName,
        progress: this.workflow.completed.length + '/' + this.workflow.tasks.length,
        currentTask: this.getCurrentTask()?.task?.name || 'None'
      } : null
    };
    
    this.history.push(entry);
    
    // Console output with color coding
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m'    // Red
    };
    
    const resetColor = '\x1b[0m';
    const color = colors[type] || colors.info;
    
    console.log(color + '[' + String(type).toUpperCase() + ']' + resetColor + ' ' + message);
  }

  /**
   * Get current progress summary
   * @returns {Object|null} Progress information
   */
  getProgress() {
    if (!this.workflow) return null;
    
    const remainingTasks = this.workflow.tasks.filter(t => t.status === 'pending');
    const skippedTasks = this.workflow.tasks.filter(t => t.status === 'skipped');
    
    return {
      workflow: this.workflow.name,
      agent: this.workflow.agentName,
      totalTasks: this.workflow.tasks.length,
      completedTasks: this.workflow.completed.length,
      skippedTasks: skippedTasks.length,
      remainingTasks: remainingTasks.length,
      currentTask: this.getCurrentTask(),
      percentComplete: Math.round((this.workflow.completed.length / this.workflow.tasks.length) * 100),
      elapsedTime: this.getElapsedTime(),
      estimatedTimeRemaining: this.getEstimatedTimeRemaining()
    };
  }

  /**
   * Get a formatted progress report
   * @returns {string} Formatted progress report
   */
  getProgressReport() {
    const progress = this.getProgress();
    if (!progress) return 'No active workflow';
    
    let report = '\n=== Task Progress Report ===\n';
    report += 'Workflow: ' + progress.workflow + '\n';
    report += 'Agent: ' + (progress.agent || 'Not set') + '\n';
    report += 'Progress: ' + progress.completedTasks + '/' + progress.totalTasks + ' tasks (' + progress.percentComplete + '%)\n';
    report += 'Elapsed Time: ' + progress.elapsedTime + '\n';
    
    if (progress.currentTask) {
      report += '\nCurrent Task: ' + progress.currentTask.task.name + '\n';
      report += 'Task Progress: ' + progress.currentTask.progress + '\n';
    }
    
    if (progress.skippedTasks > 0) {
      report += '\nSkipped Tasks: ' + progress.skippedTasks + '\n';
    }
    
    if (progress.estimatedTimeRemaining) {
      report += 'Estimated Time Remaining: ' + progress.estimatedTimeRemaining + '\n';
    }
    
    report += '===========================\n';
    
    return report;
  }

  /**
   * Save debug log to file for audit/debugging
   * @param {string} directory - Directory to save the log (default: .ai)
   * @returns {string} Path to saved file
   */
  saveDebugLog(directory = '.ai') {
    const fs = require('fs');
    const path = require('path');
    
    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = 'task-tracker_' + ((this.workflow && this.workflow.name) || 'unknown') + '_' + timestamp + '.json';
    const filepath = path.join(directory, filename);
    
    const debugData = {
      workflow: this.workflow,
      history: this.history,
      summary: this.getProgress(),
      savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2));
    this.log('Debug log saved to: ' + filepath, 'info');
    
    return filepath;
  }

  /**
   * Get elapsed time since workflow start
   * @returns {string} Formatted elapsed time
   */
  getElapsedTime() {
    if (!this.workflow) return 'N/A';
    
    const elapsed = Date.now() - this.workflow.startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return hours + 'h ' + (minutes % 60) + 'm';
    } else if (minutes > 0) {
      return minutes + 'm ' + (seconds % 60) + 's';
    } else {
      return String(seconds) + 's';
    }
  }

  /**
   * Get task duration (time since last task completion or workflow start)
   * @returns {number} Duration in milliseconds
   */
  getTaskDuration() {
    if (!this.workflow) return 0;
    
    const lastCompletion = this.workflow.completed.length > 0 
      ? this.workflow.completed[this.workflow.completed.length - 1].completedAt
      : this.workflow.startTime;
    
    return Date.now() - lastCompletion.getTime();
  }

  /**
   * Estimate time remaining based on average task completion time
   * @returns {string|null} Formatted estimated time or null if not enough data
   */
  getEstimatedTimeRemaining() {
    if (!this.workflow || this.workflow.completed.length === 0) return null;
    
    const totalElapsed = Date.now() - this.workflow.startTime.getTime();
    const avgTimePerTask = totalElapsed / this.workflow.completed.length;
    const remainingTasks = this.workflow.tasks.length - this.workflow.currentIndex;
    const estimatedMs = avgTimePerTask * remainingTasks;
    
    const minutes = Math.floor(estimatedMs / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return '~' + hours + 'h ' + (minutes % 60) + 'm';
    } else {
      return '~' + minutes + 'm';
    }
  }

  /**
   * Reset the tracker for a new workflow
   */
  reset() {
    this.workflow = null;
    this.history = [];
    this.log('Task tracker reset', 'info');
  }
}

// Export for use in agents
module.exports = TaskTracker;
