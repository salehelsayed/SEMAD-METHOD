const TaskTracker = require('./simple-task-tracker');
const fs = require('fs');
const path = require('path');

class QAFixTracker extends TaskTracker {
  constructor() {
    super();
    this.findings = null;
    this.fixResults = [];
  }

  /**
   * Initialize with parsed QA findings
   * @param {Object} findings - Parsed QA findings from qa-findings-parser
   */
  initializeFromFindings(findings) {
    this.findings = findings;
    const tasks = this.convertFindingsToTasks(findings);
    this.startWorkflow('qa-fixes', tasks);
  }

  /**
   * Convert QA findings to trackable tasks
   * @private
   */
  convertFindingsToTasks(findings) {
    const tasks = [];
    let taskId = 0;

    // Add critical issues as high priority tasks
    findings.findings.critical.forEach(issue => {
      tasks.push({
        id: `critical-${++taskId}`,
        description: `[CRITICAL] ${issue.title}: ${issue.description}`,
        file: issue.file,
        fix: issue.fix,
        severity: 'critical',
        priority: 'high'
      });
    });

    // Add major issues as high priority tasks
    findings.findings.major.forEach(issue => {
      tasks.push({
        id: `major-${++taskId}`,
        description: `[MAJOR] ${issue.title}: ${issue.description}`,
        file: issue.file,
        fix: issue.fix,
        severity: 'major',
        priority: 'high'
      });
    });

    // Add minor issues as medium priority tasks
    findings.findings.minor.forEach(issue => {
      tasks.push({
        id: `minor-${++taskId}`,
        description: `[MINOR] ${issue.title}: ${issue.description}`,
        file: issue.file,
        fix: issue.fix,
        severity: 'minor',
        priority: 'medium'
      });
    });

    // Add checklist items as tasks
    findings.checklist.forEach(item => {
      if (!item.completed) {
        tasks.push({
          id: item.id,
          description: `[CHECKLIST] ${item.description}`,
          file: item.file,
          severity: 'checklist',
          priority: 'medium'
        });
      }
    });

    return tasks;
  }

  /**
   * Get all tasks in the current workflow
   * @returns {Array} Array of tasks
   */
  getTasks() {
    if (!this.workflow) {
      return [];
    }
    return this.workflow.tasks || [];
  }

  /**
   * Mark a fix as completed with verification
   * @param {string} fixId - ID of the fix
   * @param {Object} verification - Verification details
   */
  completeFix(fixId, verification) {
    // Find the task index
    const tasks = this.getTasks();
    const taskIndex = tasks.findIndex(t => t.id === fixId);
    
    if (taskIndex === -1) {
      console.log(`Task ${fixId} not found`);
      return null;
    }

    // Mark as completed
    this.workflow.tasks[taskIndex].status = 'completed';
    
    const task = tasks[taskIndex];
    
    this.fixResults.push({
      fixId: fixId,
      task: task,
      verification: verification,
      completedAt: new Date().toISOString()
    });

    this.log(`Completed fix: ${fixId}`, 'success');
    return task;
  }

  /**
   * Generate fix summary report
   * @returns {Object} Summary of all fixes applied
   */
  generateFixReport() {
    const report = {
      findings: this.findings,
      totalIssues: {
        critical: this.findings.findings.critical.length,
        major: this.findings.findings.major.length,
        minor: this.findings.findings.minor.length,
        checklist: this.findings.checklist.filter(item => !item.completed).length
      },
      fixedIssues: {
        critical: 0,
        major: 0,
        minor: 0,
        checklist: 0
      },
      completedFixes: [],
      pendingFixes: [],
      completionRate: 0,
      summary: ''
    };

    // Count fixed issues by severity
    this.fixResults.forEach(result => {
      const task = result.task;
      if (task.severity === 'critical') report.fixedIssues.critical++;
      else if (task.severity === 'major') report.fixedIssues.major++;
      else if (task.severity === 'minor') report.fixedIssues.minor++;
      else if (task.severity === 'checklist') report.fixedIssues.checklist++;

      report.completedFixes.push({
        id: result.fixId,
        description: task.description,
        file: task.file,
        verification: result.verification
      });
    });

    // Get pending fixes
    const currentTasks = this.getTasks();
    currentTasks.forEach(task => {
      if (task.status !== 'completed') {
        report.pendingFixes.push({
          id: task.id,
          description: task.description,
          file: task.file,
          severity: task.severity
        });
      }
    });

    // Calculate completion rate
    const totalTasks = currentTasks.length;
    const completedTasks = currentTasks.filter(t => t.status === 'completed').length;
    report.completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Generate summary
    report.summary = this.generateSummaryText(report);

    return report;
  }

  /**
   * Generate human-readable summary text
   * @private
   */
  generateSummaryText(report) {
    const lines = [];
    lines.push(`QA Fix Summary - ${new Date().toISOString()}`);
    lines.push('='.repeat(50));
    lines.push(`Original Quality Score: ${report.findings.qualityMetrics.score}/100 (Grade: ${report.findings.qualityMetrics.grade})`);
    lines.push('');
    lines.push('Issues Fixed:');
    lines.push(`- Critical: ${report.fixedIssues.critical}/${report.totalIssues.critical}`);
    lines.push(`- Major: ${report.fixedIssues.major}/${report.totalIssues.major}`);
    lines.push(`- Minor: ${report.fixedIssues.minor}/${report.totalIssues.minor}`);
    lines.push(`- Checklist: ${report.fixedIssues.checklist}/${report.totalIssues.checklist}`);
    lines.push('');
    lines.push(`Overall Completion: ${report.completionRate}%`);
    
    if (report.pendingFixes.length > 0) {
      lines.push('');
      lines.push(`Pending Fixes: ${report.pendingFixes.length}`);
      report.pendingFixes.forEach(fix => {
        lines.push(`  - [${fix.severity.toUpperCase()}] ${fix.id}: ${fix.description.substring(0, 60)}...`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Save fix tracking to file
   */
  saveFixTracking(directory = '.ai') {
    try {
      // Ensure directory exists
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      // Save current state
      const trackingData = {
        findings: this.findings,
        workflow: this.workflow,
        fixResults: this.fixResults,
        report: this.generateFixReport(),
        savedAt: new Date().toISOString()
      };

      const filePath = path.join(directory, 'qa_fixes_checklist.json');
      fs.writeFileSync(filePath, JSON.stringify(trackingData, null, 2));
      
      console.log(`QA fix tracking saved to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Error saving QA fix tracking:', error);
      throw error;
    }
  }

  /**
   * Load fix tracking from file
   */
  loadFixTracking(directory = '.ai') {
    try {
      const filePath = path.join(directory, 'qa_fixes_checklist.json');
      
      if (!fs.existsSync(filePath)) {
        console.log('No existing QA fix tracking found');
        return false;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      this.findings = data.findings;
      this.workflow = data.workflow;
      this.fixResults = data.fixResults || [];
      
      console.log(`QA fix tracking loaded from ${filePath}`);
      return true;
    } catch (error) {
      console.error('Error loading QA fix tracking:', error);
      return false;
    }
  }

  /**
   * Get a summary of pending critical issues
   */
  getPendingCriticalIssues() {
    const tasks = this.getTasks();
    return tasks.filter(task => 
      task.severity === 'critical' && task.status !== 'completed'
    );
  }

  /**
   * Check if all critical issues are fixed
   */
  areAllCriticalIssuesFixed() {
    const pendingCritical = this.getPendingCriticalIssues();
    return pendingCritical.length === 0;
  }
}

module.exports = QAFixTracker;