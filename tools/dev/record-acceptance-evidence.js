#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const {
  loadStoryContract,
  deriveAcceptanceCriteria,
  normalizeStoryId
} = require('../../semad-core/utils/story-contract');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function ensureDir(targetFile) {
  const dir = path.dirname(targetFile);
  fs.mkdirSync(dir, { recursive: true });
}

function loadJsonIfExists(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = args.story || args._[0];
  const workplanPath = args.workplan;
  const testReportArg = args.testReport;
  const checklistArg = args.checklist;

  if (!story) {
    console.error('Usage: record-acceptance-evidence --story <story.md> [--workplan <plan.json>] [--testReport <file>]');
    process.exit(2);
  }

  const rootDir = process.cwd();
  const storyPath = path.isAbsolute(story) ? story : path.join(rootDir, story);

  let contract;
  try {
    ({ contract } = loadStoryContract(storyPath));
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(3);
  }

  const storyId = normalizeStoryId(contract, storyPath);
  const acceptance = deriveAcceptanceCriteria(storyPath, contract);
  const workplan = workplanPath
    ? loadJsonIfExists(path.isAbsolute(workplanPath) ? workplanPath : path.join(rootDir, workplanPath))
    : null;

  const checklistPath = (() => {
    const defaultPath = path.join(rootDir, '.ai', 'dev', 'checklists', `${storyId}.json`);
    if (!checklistArg) return defaultPath;
    return path.isAbsolute(checklistArg)
      ? checklistArg
      : path.join(rootDir, checklistArg);
  })();

  const checklistDoc = loadJsonIfExists(checklistPath);
  if (!checklistDoc || !Array.isArray(checklistDoc.checklist)) {
    console.error(chalk.red(`Checklist not found or invalid at ${path.relative(rootDir, checklistPath)}`));
    process.exit(4);
  }

  const testReportPath = testReportArg
    ? (path.isAbsolute(testReportArg) ? testReportArg : path.join(rootDir, testReportArg))
    : null;

  const passingTests = [];
  if (testReportPath && fs.existsSync(testReportPath)) {
    try {
      const reportRaw = fs.readFileSync(testReportPath, 'utf8');
      const report = JSON.parse(reportRaw);
      const suites = Array.isArray(report.testResults) ? report.testResults : [];
      suites.forEach(suite => {
        const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
        assertions
          .filter(assertion => assertion.status === 'passed')
          .forEach(assertion => {
            passingTests.push({
              fullName: assertion.fullName || assertion.title,
              ancestorTitles: assertion.ancestorTitles || [],
              status: assertion.status,
              location: assertion.location || null,
              suite: suite.name || suite.testFilePath
            });
          });
      });
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Could not parse test report (${error.message}). Evidence will note tests but not mark as verified.`));
    }
  }

  const checklistItems = checklistDoc.checklist.map(item => ({ ...item }));
  const missingEvidence = [];

  checklistItems.forEach(item => {
    const relevantTests = new Set();
    const declaredTests = Array.isArray(item.tests) ? item.tests : [];

    declaredTests.forEach(testPath => {
      passingTests.forEach(result => {
        if (!result || !result.suite) return;
        if (result.suite.endsWith(testPath) || result.suite.includes(testPath)) {
          relevantTests.add(result);
        }
      });
    });

    const evidenceEntries = Array.isArray(item.evidence) ? [...item.evidence] : [];
    relevantTests.forEach(test => {
      evidenceEntries.push({
        type: 'test',
        reference: test.fullName,
        suite: test.suite,
        status: test.status
      });
    });

    if (workplan && workplan.criteriaWork) {
      const linked = workplan.criteriaWork.find(entry => entry.id === item.id);
      if (linked && Array.isArray(linked.relatedFiles) && linked.relatedFiles.length) {
        evidenceEntries.push({
          type: 'files',
          reference: linked.relatedFiles
        });
      }
    }

    item.evidence = evidenceEntries;
    item.verified = evidenceEntries.length > 0;
    item.status = item.verified ? 'verified' : 'pending';

    if (!item.verified) {
      missingEvidence.push(item.id);
    }
  });

  if (missingEvidence.length) {
    fs.writeFileSync(checklistPath, JSON.stringify({ ...checklistDoc, checklist: checklistItems }, null, 2));
    console.error(chalk.red('Acceptance checklist incomplete. Missing evidence for:'), missingEvidence.join(', '));
    process.exit(5);
  }

  const evidence = {
    storyId,
    storyPath: path.relative(rootDir, storyPath),
    generatedAt: new Date().toISOString(),
    workplanPath: workplan ? path.relative(rootDir, path.resolve(workplanPath)) : null,
    checklistPath: path.relative(rootDir, checklistPath),
    guardrails: contract?.guardrails || {},
    performanceBudget: contract?.performanceBudget || {},
    integrationVerification: contract?.integrationVerification || [],
    rollbackPlan: contract?.rollbackPlan || {},
    acceptance: checklistItems.map(item => ({
      id: item.id,
      description: item.description,
      verified: item.verified === true,
      evidence: item.evidence || [],
      tests: item.tests || []
    })),
    passingTests,
    testReport: null
  };

  if (testReportPath && fs.existsSync(testReportPath)) {
    evidence.testReport = path.relative(rootDir, testReportPath);
  }

  const outputPath = path.join(rootDir, '.ai', 'dev', 'acceptance', `${storyId}.json`);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2));

  // Persist checklist updates with evidence
  fs.writeFileSync(checklistPath, JSON.stringify({ ...checklistDoc, checklist: checklistItems }, null, 2));

  console.log(chalk.green('✅ Acceptance evidence captured:'), path.relative(rootDir, outputPath));
  evidence.acceptance.forEach(item => {
    console.log(`  - ${item.id}: ${item.description}`);
  });

  return outputPath;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

module.exports = main;
