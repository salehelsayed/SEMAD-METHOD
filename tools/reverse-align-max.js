#!/usr/bin/env node

// Reverse-Align Orchestrator (Max Agents)
// Runs the reverse-alignment workflow using safe parallelism where possible.
// Sequence rationale:
// 1) cleanup-docs (sequential, destructive)
// 2) analyst-analyze (sequential, produces analysis basis)
// 3) architect-rewrite + pm-update-prd (parallel; both use the same analysis)
// 4) shard-docs (sequential; depends on rewritten docs)
// 5) sm-recreate-stories (sequential; uses analysis)
// 6) validate-story-consistency (sequential; uses stories)
// 7) generate-alignment-report (sequential; runs QA coverage internally)
// 8) create-documentation-manifest (sequential; picks up latest coverage)
// 9) reverse-quality-gate (optional, sequential)

const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const { Command } = require('commander');
const WorkflowOrchestrator = require('./workflow-orchestrator');

async function runReverseAlignMax({ directory, threshold }) {
  const rootDir = directory || process.cwd();
  const orchestrator = new WorkflowOrchestrator(rootDir);
  // Suppress transient devLoad warnings during cleanup → rewrite → shard window
  orchestrator.suppressDevLoadWarnings = true;

  console.log(chalk.bold('\n🎼 Reverse-Align Orchestrator (Max Agents)'));

  try {
    // Initialize once
    await orchestrator.initialize();

    // 1) Cleanup docs
    const s1 = ora('Cleaning up docs (core set only)...').start();
    const cleanupRes = await orchestrator.cleanupDocs();
    s1.succeed(`Docs cleanup complete (removed ${cleanupRes.removed.length}, kept ${cleanupRes.kept.length})`);

    // 2) Analyze implementation (Analyst)
    const s2 = ora('Analyzing implementation (Analyst)...').start();
    const analysis = await orchestrator.analyzeImplementation();
    s2.succeed('Analysis complete');

    // 3) Rewrite Architecture (Architect) and Update PRD (PM) in parallel
    const s3 = ora('Updating Architecture and PRD in parallel...').start();
    const [archPath, prdPath] = await Promise.all([
      orchestrator.rewriteArchitectureFromImplementation(analysis),
      orchestrator.updatePRDFromImplementation(analysis)
    ]);
    s3.succeed('Architecture and PRD updated');
    console.log(chalk.dim(' - ' + path.relative(rootDir, archPath)));
    console.log(chalk.dim(' - ' + path.relative(rootDir, prdPath)));

    // 4) Shard documents (PO sharding step)
    const s4 = ora('Sharding PRD/Architecture (where enabled)...').start();
    await orchestrator.shardDocuments();
    s4.succeed('Sharding complete');

    // Re-enable warnings after shards ensured
    orchestrator.suppressDevLoadWarnings = false;

    // 5) Recreate stories (SM)
    const s5 = ora('Recreating stories (SM)...').start();
    const storyFiles = await orchestrator.recreateStoriesFromCode(analysis);
    s5.succeed(`Recreated ${storyFiles.length} stories`);

    // 6) Validate story consistency
    const s6 = ora('Validating story consistency...').start();
    const storyCheck = await orchestrator.validateStoryConsistency(analysis);
    const storySummary = `${storyCheck.valid}/${storyCheck.checked} valid` + (storyCheck.issues.length ? `, ${storyCheck.issues.length} issues` : '');
    if (storyCheck.issues.length) {
      s6.warn(`Story consistency checks: ${storySummary}`);
    } else {
      s6.succeed(`Story consistency checks: ${storySummary}`);
    }

    // 7) Generate alignment report (includes QA coverage)
    const s7 = ora('Generating alignment report (QA coverage included)...').start();
    const alignment = await orchestrator.generateAlignmentReport(analysis);
    s7.succeed('Alignment report generated (.ai/reports/alignment-report.json)');

    // 8) Create documentation manifest
    const s8 = ora('Creating documentation manifest...').start();
    const manifestPath = await orchestrator.createDocumentationManifest(analysis);
    s8.succeed('Documentation manifest created');
    console.log(chalk.dim(' - ' + path.relative(rootDir, manifestPath)));

    // 9) Optional: reverse quality gate
    if (typeof threshold === 'number' && !Number.isNaN(threshold)) {
      const s9 = ora(`Running reverse quality gate (threshold: ${threshold})...`).start();
      const gate = await orchestrator.reverseAlignQualityGate(threshold);
      const status = gate.pass ? chalk.green('PASS') : chalk.red('FAIL');
      if (gate.coverage) {
        s9.stop();
        console.log(`Reverse-Align Quality Gate: ${status} (coverage ${gate.coverage.mentioned}/${gate.coverage.total})`);
      } else {
        s9.stop();
        console.log(`Reverse-Align Quality Gate: ${status}`);
      }
      console.log(chalk.dim('.ai/reports/reverse-align-gate.json'));
      if (!gate.pass) process.exitCode = 1;
    }

    // Summary
    console.log('\n' + chalk.bold('✅ Reverse alignment completed (max agents).'));
    console.log('- Architect/PM ran in parallel');
    console.log('- QA coverage included in alignment report');
    console.log('- Manifest updated for downstream agents');

  } catch (error) {
    console.error(chalk.red('\n❌ Reverse-Align Orchestrator failed:'), error.message);
    process.exit(1);
  }
}

// CLI wrapper
const program = new Command();
program
  .name('reverse-align-max')
  .description('Run reverse-alignment with safe parallelism across agents')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-t, --threshold <ratio>', 'Quality gate coverage threshold (0-1)', (v) => parseFloat(v))
  .option('-e, --epic-id <number>', 'Numeric epic ID for generated stories (default 99)', (v) => parseInt(v, 10))
  .option('--preserve-stories', 'Do not delete or recreate docs/stories', true)
  .option('--shard-only', 'Only shard PRD/Architecture per config and exit', false)
  .action(async (opts) => {
    // If epic-id supplied, propagate to orchestrator by setting env var the child reads or mutating after construct
    const rootDir = opts.directory || process.cwd();
    const WorkflowOrchestrator = require('./workflow-orchestrator');
    const orch = new WorkflowOrchestrator(rootDir);
    if (opts.epicId && !Number.isNaN(opts.epicId)) {
      orch.reverseEpicId = opts.epicId;
    }
    orch.preserveStories = opts.preserveStories !== false; // default true for max script
    // Reuse the same orchestrator in the runner
    await (async () => {
      const path = require('path');
      const chalk = require('chalk');
      const ora = require('ora');
      const orchestrator = orch;
      console.log(chalk.bold('\n🎼 Reverse-Align Orchestrator (Max Agents)'));
      try {
        await orchestrator.initialize();
        if (!opts.shardOnly) {
          const s1 = ora('Cleaning up docs (core set only)...').start();
          const cleanupRes = await orchestrator.cleanupDocs();
          s1.succeed(`Docs cleanup complete (removed ${cleanupRes.removed.length}, kept ${cleanupRes.kept.length})`);
        }
        const s2 = ora(opts.shardOnly ? 'Loading implementation context...' : 'Analyzing implementation (Analyst)...').start();
        const analysis = await orchestrator.analyzeImplementation();
        s2.succeed('Analysis ready');
        const s3 = ora('Updating Architecture and PRD in parallel...').start();
        const [archPath, prdPath] = opts.shardOnly
          ? [null, null]
          : await Promise.all([
              orchestrator.rewriteArchitectureFromImplementation(analysis),
              orchestrator.updatePRDFromImplementation(analysis)
            ]);
        s3.succeed('Architecture and PRD updated');
        if (archPath) console.log(chalk.dim(' - ' + path.relative(rootDir, archPath)));
        if (prdPath) console.log(chalk.dim(' - ' + path.relative(rootDir, prdPath)));
        const s4 = ora('Sharding PRD/Architecture (where enabled)...').start();
        await orchestrator.shardDocuments();
        s4.succeed('Sharding complete');
        orchestrator.suppressDevLoadWarnings = false;
        if (!orch.preserveStories && !opts.shardOnly) {
          const s5 = ora('Recreating stories (SM)...').start();
          const storyFiles = await orchestrator.recreateStoriesFromCode(analysis);
          s5.succeed(`Recreated ${storyFiles.length} stories`);
          const s6 = ora('Validating story consistency...').start();
          const storyCheck = await orchestrator.validateStoryConsistency(analysis);
          const storySummary = `${storyCheck.valid}/${storyCheck.checked} valid` + (storyCheck.issues.length ? `, ${storyCheck.issues.length} issues` : '');
          if (storyCheck.issues.length) { s6.warn(`Story consistency checks: ${storySummary}`); }
          else { s6.succeed(`Story consistency checks: ${storySummary}`); }
        }
        const s7 = ora('Generating alignment report (QA coverage included)...').start();
        const alignment = await orchestrator.generateAlignmentReport(analysis);
        s7.succeed('Alignment report generated (.ai/reports/alignment-report.json)');
        const s8 = ora('Creating documentation manifest...').start();
        const manifestPath = await orchestrator.createDocumentationManifest(analysis);
        s8.succeed('Documentation manifest created');
        console.log(chalk.dim(' - ' + path.relative(rootDir, manifestPath)));
        if (!opts.shardOnly && typeof opts.threshold === 'number' && !Number.isNaN(opts.threshold)) {
          const s9 = ora(`Running reverse quality gate (threshold: ${opts.threshold})...`).start();
          const gate = await orchestrator.reverseAlignQualityGate(opts.threshold);
          const status = gate.pass ? chalk.green('PASS') : chalk.red('FAIL');
          s9.stop();
          console.log(`Reverse-Align Quality Gate: ${status}${gate.coverage ? ` (coverage ${gate.coverage.mentioned}/${gate.coverage.total})` : ''}`);
          console.log(chalk.dim('.ai/reports/reverse-align-gate.json'));
          if (!gate.pass) process.exitCode = 1;
        }
        console.log('\n' + chalk.bold('✅ Reverse alignment completed (max agents).'));
        if (!opts.shardOnly) console.log(`- Stories epic: ${orchestrator.reverseEpicId}`);
      } catch (error) {
        console.error(chalk.red('\n❌ Reverse-Align Orchestrator failed:'), error.message);
        process.exit(1);
      }
    })();
  });

if (require.main === module) {
  program.parse(process.argv);
}

module.exports = runReverseAlignMax;
