#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  resolveStoryPath,
  parseStoryFrontMatter
} = require('./qa-feedback-utils');

const QAFindingsParser = require('../../bmad-core/utils/qa-findings-parser');
const QAFixTracker = require('../../bmad-core/utils/qa-fix-tracker');
const {
  analyzeBatchImpact,
  generateImpactReport
} = require('../../bmad-core/utils/dependency-impact-checker');
const {
  loadPreviousTrackerState,
  restorePreviousCompletions,
  applyCompletionFlags,
  logChecklistSummary,
  collectImpactedFiles,
  updateStoryFile,
  listPendingFixes
} = require('./address-qa-feedback-support');

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const args = parseArgs(process.argv.slice(2));

  const storyPath = resolveStoryPath(args.storyArg, projectRoot);
  if (!storyPath) {
    console.error('⚠️  Unable to resolve story. Provide a story path or StoryContract.story_id.');
    process.exit(1);
  }

  const storyContent = fs.readFileSync(storyPath, 'utf8');
  const frontMatter = parseStoryFrontMatter(storyContent) || {};
  const storyContract = frontMatter.StoryContract || {};
  const relativeStoryPath = path.relative(projectRoot, storyPath);

  const parser = new QAFindingsParser();
  const findings = parser.parseQAResults(storyContent);

  const outputDir = path.join(projectRoot, '.ai');
  ensureDir(outputDir);

  const runMetadata = {
    story: relativeStoryPath,
    generatedAt: new Date().toISOString()
  };

  writeJson(path.join(outputDir, 'qa_findings.json'), {
    ...runMetadata,
    findings
  });

  const tracker = new QAFixTracker();
  const checklistPath = path.join(outputDir, 'qa_fixes_checklist.json');
  const previousState = loadPreviousTrackerState(checklistPath);

  tracker.initializeFromFindings(findings);
  restorePreviousCompletions(tracker, previousState);

  if (args.completions.length) {
    console.log('↪️  Marking fixes as completed via --complete flags');
    applyCompletionFlags(tracker, args.completions);
  }

  tracker.saveFixTracking(outputDir);

  const fixReportBeforeValidation = tracker.generateFixReport();
  logChecklistSummary(fixReportBeforeValidation);

  const impactedFiles = collectImpactedFiles(findings, storyContract, projectRoot);

  let dependencyAnalysis = null;
  if (impactedFiles.length) {
    console.log('🔍 Running dependency impact analysis for QA fixes…');
    dependencyAnalysis = await analyzeBatchImpact(impactedFiles, projectRoot);
    writeJson(path.join(outputDir, 'dependency_analysis_qa.json'), {
      ...runMetadata,
      impactedFiles,
      analysis: dependencyAnalysis
    });
    const mdReport = generateImpactReport(dependencyAnalysis, { format: 'markdown' });
    fs.writeFileSync(path.join(outputDir, 'dependency_impact_report_qa.md'), mdReport, 'utf8');
  } else {
    console.log('ℹ️  No impacted files detected from QA findings; skipping dependency analysis.');
  }

  let testsPassed = true;
  if (!args.skipTests) {
    testsPassed = runTests(projectRoot, args.testCommand);
  } else {
    console.log('⚠️  Tests skipped via --skip-tests.');
  }

  tracker.saveFixTracking(outputDir);
  const fixReport = tracker.generateFixReport();

  writeJson(path.join(outputDir, 'qa_fix_report.json'), {
    ...runMetadata,
    report: fixReport
  });

  writeJson(path.join(outputDir, 'qa_fix_context.json'), {
    ...runMetadata,
    impactedFiles,
    totals: fixReport.totalIssues,
    fixed: fixReport.fixedIssues,
    pending: fixReport.pendingFixes,
    completionRate: fixReport.completionRate,
    dependencySummary: dependencyAnalysis ? dependencyAnalysis.impactSummary : null
  });

  let storyUpdated = false;
  if (fixReport.pendingFixes.length === 0) {
    storyUpdated = updateStoryFile(storyPath, storyContent, {
      testsPassed,
      fixReport,
      reportPath: path.relative(projectRoot, path.join(outputDir, 'qa_fix_report.json'))
    });
  }

  const hasPending = fixReport.pendingFixes.length > 0;
  const hasHighRisk = Boolean(
    dependencyAnalysis &&
    dependencyAnalysis.impactSummary &&
    Array.isArray(dependencyAnalysis.impactSummary.highRiskFiles) &&
    dependencyAnalysis.impactSummary.highRiskFiles.length
  );

  if (hasHighRisk) {
    console.warn('⚠️  High-risk dependency impacts detected. Review dependency_impact_report_qa.md before finalising fixes.');
  }

  console.log('📄 Fix report saved to .ai/qa_fix_report.json');
  if (storyUpdated) {
    console.log(`✏️  Story updated: ${relativeStoryPath}`);
  }

  if (hasPending || !testsPassed) {
    console.error('❌ QA feedback still pending.');
    if (hasPending) {
      listPendingFixes(fixReport.pendingFixes);
      console.error('  - Complete fixes and rerun with --complete <fixId> to record progress.');
    }
    if (!testsPassed) {
      console.error('  - Tests failed. Review output above before re-running.');
    }
    process.exit(1);
  }

  if (hasHighRisk) {
    process.exit(1);
  }

  console.log('✅ All QA feedback items recorded as complete and tests passed. Story ready for QA re-review.');
  process.exit(0);
}

function parseArgs(argv) {
  const completions = [];
  let storyArg = null;
  let skipTests = false;
  let testCommand = null;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;

    if (token === '--story' && argv[i + 1]) {
      storyArg = argv[i + 1];
      i++;
      continue;
    }

    if (token === '--skip-tests') {
      skipTests = true;
      continue;
    }

    if (token === '--test-command' && argv[i + 1]) {
      testCommand = argv[i + 1];
      i++;
      continue;
    }

    if (token === '--complete' && argv[i + 1]) {
      const entry = argv[i + 1];
      i++;
      const [fixId, verification] = entry.split(':');
      if (fixId) {
        completions.push({
          fixId,
          verification: verification ? verification.trim() : null
        });
      }
      continue;
    }

    if (!storyArg && !token.startsWith('--')) {
      storyArg = token;
      continue;
    }
  }

  return {
    storyArg,
    completions,
    skipTests,
    testCommand
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function runTests(projectRoot, customCommand) {
  console.log('🧪 Running validation tests…');

  let command = 'npm';
  let args = ['test', '--', '--runInBand'];

  if (customCommand) {
    const parts = customCommand.split(' ');
    if (parts.length) {
      command = parts[0];
      args = parts.slice(1);
    }
  }

  const result = spawnSync(command, args, { stdio: 'inherit', cwd: projectRoot, env: { ...process.env, CI: process.env.CI || '1' } });

  if (result.status !== 0) {
    console.error('❌ Tests failed.');
    return false;
  }

  console.log('✅ Tests passed.');
  return true;
}

main().catch(error => {
  console.error('address-qa-feedback failed with an unexpected error:', error);
  process.exit(1);
});
