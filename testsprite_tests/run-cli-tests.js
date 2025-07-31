#!/usr/bin/env node

/**
 * SEMAD-METHOD CLI Test Runner with Immediate Status Reporting
 *
 * This script reads the test plan (semad-method-cli-test-plan.json) in the
 * current directory, executes each CLI test case, checks for expected files,
 * skips tests requiring unavailable services (like Qdrant), and prints a pass/
 * fail/timeout message for each command.  A summary and detailed report are
 * written to the tmp/ directory.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Constants
const TEST_PLAN_FILENAME = 'semad-method-cli-test-plan.json';
const PROJECT_ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = 30000; // 30 seconds per command
const OUTPUT_DIR = path.join(__dirname, 'tmp');

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load test plan
const testPlanPath = path.join(__dirname, TEST_PLAN_FILENAME);
if (!fs.existsSync(testPlanPath)) {
  console.error(`❌ Test plan file not found: ${testPlanPath}`);
  process.exit(1);
}
const testPlan = JSON.parse(fs.readFileSync(testPlanPath, 'utf8'));

console.log('🚀 Starting SEMAD-METHOD CLI Test Execution');
console.log(`📋 Total test cases: ${testPlan.length}`);

// Helpers to run commands
function runCommandSync(command) {
  let output = '';
  let errorMsg = '';
  let status = 'passed';
  const start = Date.now();

  try {
    output = execSync(command, {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: TIMEOUT_MS,
      killSignal: 'SIGKILL',
      stdio: 'pipe'
    });
  } catch (err) {
    if (err.killed || err.code === 'ETIMEDOUT') {
      status = 'timeout';
      errorMsg = `Command timed out after ${TIMEOUT_MS / 1000}s`;
    } else {
      status = 'failed';
      errorMsg = err.message || String(err);
      output = err.stdout ? err.stdout.toString() : '';
    }
  }
  const duration = Date.now() - start;
  return { status, output, errorMsg, duration };
}

function runCommandInteractive(command, userInputs = []) {
  return new Promise(resolve => {
    let output = '';
    let errorMsg = '';
    let status = 'passed';
    const start = Date.now();
    const child = spawn(command, { shell: true, cwd: PROJECT_ROOT });
    let idx = 0;

    child.stdout.on('data', data => {
      output += data.toString();
      if (idx < userInputs.length) {
        child.stdin.write(userInputs[idx] + '\n');
        idx++;
      }
    });

    child.stderr.on('data', data => {
      output += data.toString();
    });

    const timeoutId = setTimeout(() => {
      status = 'timeout';
      errorMsg = `Command timed out after ${TIMEOUT_MS / 1000}s`;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.on('close', code => {
      clearTimeout(timeoutId);
      if (status !== 'timeout') {
        status = code === 0 ? 'passed' : 'failed';
        if (code !== 0) {
          errorMsg = `Process exited with code ${code}`;
        }
      }
      const duration = Date.now() - start;
      resolve({ status, output, errorMsg, duration });
    });
  });
}

// Check for expected files (supports simple wildcards like *.yaml)
function checkExpectedFiles(patterns) {
  return patterns.map(pattern => {
    if (pattern.includes('*')) {
      const dir = path.dirname(pattern);
      const glob = path.basename(pattern);
      const absDir = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(absDir)) {
        return { pattern, exists: false, count: 0 };
      }
      const files = fs.readdirSync(absDir).filter(f => {
        if (glob === '*.yaml') return f.endsWith('.yaml');
        if (glob === '*.json') return f.endsWith('.json');
        if (glob === '*.md') return f.endsWith('.md');
        return true;
      });
      return { pattern, exists: files.length > 0, count: files.length };
    } else {
      const absPath = path.join(PROJECT_ROOT, pattern);
      return { pattern, exists: fs.existsSync(absPath) };
    }
  });
}

(async function runTests() {
  const results = [];

  for (const testCase of testPlan) {
    // Skip tests that need unavailable services
    if (testCase.expected_services && testCase.expected_services.includes('qdrant')) {
      console.log(`\n⚠️  Skipping ${testCase.id} - Requires Qdrant service`);
      results.push({
        testId: testCase.id,
        title: testCase.title,
        category: testCase.category,
        status: 'skipped',
        reason: 'Requires Qdrant service',
        timestamp: new Date().toISOString()
      });
      continue;
    }

    // Run commands or mark as pending
    if (testCase.commands && testCase.commands.length > 0) {
      for (const cmd of testCase.commands) {
        console.log('\n' + '-'.repeat(80));
        console.log(`Running Test: ${testCase.id} - ${testCase.title}`);
        console.log(`Command: ${cmd}`);
        console.log('-'.repeat(80));

        let execResult;
        if (Array.isArray(testCase.user_input) && testCase.user_input.length > 0) {
          execResult = await runCommandInteractive(cmd, testCase.user_input);
        } else {
          execResult = runCommandSync(cmd);
        }

        // Perform file checks if necessary
        let fileChecks = null;
        if (testCase.expected_files) {
          fileChecks = checkExpectedFiles(testCase.expected_files);
        }

        const resultRecord = {
          testId: testCase.id,
          title: testCase.title,
          category: testCase.category,
          command: cmd,
          status: execResult.status,
          duration: execResult.duration,
          output: execResult.output,
          error: execResult.errorMsg,
          fileChecks: fileChecks,
          validationCriteria: testCase.validation_criteria,
          timestamp: new Date().toISOString()
        };

        // Immediate status
        if (resultRecord.status === 'passed') {
          console.log(`✅ ${testCase.id} passed in ${resultRecord.duration}ms`);
        } else if (resultRecord.status === 'timeout') {
          console.log(`⏱️  ${testCase.id} timed out: ${resultRecord.error}`);
        } else {
          console.log(`❌ ${testCase.id} failed: ${resultRecord.error || 'Unknown error'}`);
        }

        results.push(resultRecord);
      }
    } else {
      console.log(`\n⚠️  Test ${testCase.id} has no commands specified`);
      results.push({
        testId: testCase.id,
        title: testCase.title,
        category: testCase.category,
        status: 'pending',
        reason: 'No commands specified',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Summarise
  const summary = {
    totalTests: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    timeout: results.filter(r => r.status === 'timeout').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    pending: results.filter(r => r.status === 'pending').length,
    executionTime: new Date().toISOString()
  };

  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Execution Summary:');
  console.log(`Total: ${summary.totalTests}`);
  console.log(`✅ Passed: ${summary.passed}`);
  console.log(`❌ Failed: ${summary.failed}`);
  console.log(`⏱️  Timeout: ${summary.timeout}`);
  console.log(`⏭️  Skipped: ${summary.skipped}`);
  console.log(`⏸️  Pending: ${summary.pending}`);

  // Save results
  const report = { summary, results, testPlan };
  const resultsPath = path.join(OUTPUT_DIR, 'test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Test results saved to: ${resultsPath}`);

  // Write a report prompt
  const reportPrompt = {
    testResults: { summary, results },
    projectInfo: {
      name: "SEMAD-METHOD",
      type: "CLI Tool",
      description: "Breakthrough Method of Agile AI-driven Development"
    },
    instructions: "Generate a comprehensive test report analyzing the CLI test execution results"
  };
  const reportPromptPath = path.join(OUTPUT_DIR, 'report_prompt.json');
  fs.writeFileSync(reportPromptPath, JSON.stringify(reportPrompt, null, 2));
  console.log(`📝 Report prompt saved to: ${reportPromptPath}`);

  process.exit(summary.failed > 0 || summary.timeout > 0 ? 1 : 0);
})();
