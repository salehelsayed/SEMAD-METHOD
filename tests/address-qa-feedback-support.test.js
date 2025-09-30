const fs = require('fs');
const os = require('os');
const path = require('path');

const QAFixTracker = require('../bmad-core/utils/qa-fix-tracker');
const {
  collectImpactedFiles,
  updateStoryFile,
  restorePreviousCompletions,
  applyCompletionFlags
} = require('../tools/dev/address-qa-feedback-support');

function buildFindings() {
  return {
    reviewDate: '2025-01-01',
    reviewedBy: 'QA Bot',
    qualityMetrics: {
      score: 70,
      grade: 'C',
      criticalIssues: 1,
      majorIssues: 0,
      minorIssues: 0
    },
    findings: {
      critical: [{
        title: 'Fix critical path',
        file: 'src/critical.js',
        line: '10',
        description: 'Critical failure',
        fix: 'Apply patch'
      }],
      major: [],
      minor: []
    },
    checklist: [],
    refactoring: [],
    security: [],
    performance: [],
    approved: false
  };
}

describe('address-qa-feedback support utilities', () => {
  test('collectImpactedFiles gathers unique relative paths', () => {
    const findings = buildFindings();
    findings.checklist = [{ id: 'chk1', description: 'Tidy', file: './docs/readme.md', completed: false }];
    findings.findings.major.push({ title: 'Major issue', file: path.join(process.cwd(), 'src/major.js'), description: 'desc', fix: 'fix' });

    const storyContract = {
      filesToModify: [{ path: 'package.json' }]
    };

    const files = collectImpactedFiles(findings, storyContract, process.cwd());

    expect(files).toEqual([
      'docs/readme.md',
      'package.json',
      'src/critical.js',
      'src/major.js'
    ]);
  });

  test('appendBullet appends to existing sections and updateStoryFile writes to disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-feedback-test-'));
    const storyPath = path.join(tmpDir, 'story.md');
    const original = '# Story\n\n## Status\nNeeds Fixes\n\n## Completion Notes\n- existing note\n\n';
    fs.writeFileSync(storyPath, original, 'utf8');

    const trackerReport = {
      completionRate: 100
    };

    const updated = updateStoryFile(storyPath, original, {
      testsPassed: true,
      fixReport: trackerReport,
      reportPath: '.ai/qa_fix_report.json'
    });

    expect(updated).toBe(true);

    const finalContent = fs.readFileSync(storyPath, 'utf8');
    expect(finalContent).toContain('## Status\nReady for Review');
    expect(finalContent).toMatch(/## Completion Notes[\s\S]*existing note[\s\S]*QA fixes completed/);
    expect(finalContent).toMatch(/## Change Log[\s\S]*qa_fix_report\.json/);
  });

  test('restorePreviousCompletions and applyCompletionFlags update tracker state', () => {
    const findings = buildFindings();
    const tracker = new QAFixTracker();
    tracker.initializeFromFindings(findings);

    const previousState = {
      workflow: {
        tasks: [
          { id: 'critical-1', status: 'completed' }
        ]
      },
      fixResults: [
        {
          fixId: 'critical-1',
          verification: { note: 'Completed earlier' }
        }
      ]
    };

    restorePreviousCompletions(tracker, previousState);

    let task = tracker.getTasks().find(t => t.id === 'critical-1');
    expect(task.status).toBe('completed');

    // reset and test applyCompletionFlags
    const tracker2 = new QAFixTracker();
    tracker2.initializeFromFindings(findings);

    applyCompletionFlags(tracker2, [{ fixId: 'critical-1', verification: 'Manual verification' }]);
    task = tracker2.getTasks().find(t => t.id === 'critical-1');
    expect(task.status).toBe('completed');
  });
});
