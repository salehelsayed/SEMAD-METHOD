#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const chalk = require('chalk');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function resolveStoryPath(root, input) {
  if (!input) return null;
  const raw = input.startsWith('@') ? input.slice(1) : input;
  const abs = path.isAbsolute(raw) ? raw : path.join(root, raw);
  return abs;
}

function runNode(cmd, args, cwd) {
  return spawnSync(process.execPath, [cmd, ...args], { stdio: 'inherit', cwd });
}

function runShell(cmd, args, cwd) {
  return spawnSync(cmd, args, { stdio: 'inherit', cwd });
}

async function main() {
  const projectRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  // Accept story via: positional, --story <path>, or @<path>
  const storyArg = args.story || args._[0] || null;
  if (!storyArg) {
    console.error(chalk.red('DevX3 requires a story path.'));
    console.log('Usage: /dev *devx3 <story-path>');
    console.log('   or: /dev *devx3 --story docs/stories/<story>.md');
    process.exit(1);
  }
  const storyPath = resolveStoryPath(projectRoot, storyArg);
  if (!fs.existsSync(storyPath)) {
    console.error(chalk.red('Story file not found:'), path.relative(projectRoot, storyPath));
    process.exit(1);
  }

  console.log(chalk.bold(`🧭 DevX3 – Triple-pass implementation for: ${path.relative(projectRoot, storyPath)}`));

  const results = [];
  const iters = Number(args.iterations || 3);
  for (let i = 1; i <= iters; i++) {
    console.log('\n' + chalk.cyan(`====== Iteration ${i}/${iters}: Develop & Implement ======`));

    // Run the standard develop + implement flow for the given story
    const devRes = runNode(path.join('tools', 'dev-develop-story.js'), ['--story', storyPath], projectRoot);
    const devCode = devRes.status ?? devRes.code ?? 1;
    if (devCode !== 0) {
      console.log(chalk.red(`❌ Iteration ${i}: development/implementation step reported failure (code ${devCode}).`));
    } else {
      console.log(chalk.green(`✅ Iteration ${i}: development/implementation completed.`));
    }

    console.log(chalk.cyan(`\n------ Iteration ${i}: Running story-scoped tests (TDD) ------`));
    let testsOk = true;
    try {
      const tRes = runNode(path.join('tools', 'dev', 'run-story-tests.js'), ['--story', storyPath], projectRoot);
      const tCode = tRes.status ?? tRes.code ?? 1;
      testsOk = tCode === 0;
    } catch (e) {
      console.log(chalk.red('Test execution failed:'), e.message);
      testsOk = false;
    }

    results.push({ iteration: i, devCode, testsOk });

    if (!testsOk) {
      console.log(chalk.yellow('⚠️  Tests failed on this iteration. Proceeding to next pass to capture/fix gaps.'));
    } else {
      console.log(chalk.green('✓ Tests passed on this iteration.'));
    }

    // Stricter handover semantics: reset Dev working memory between passes
    if (i < iters && args.handover) {
      try {
        console.log(chalk.dim('\n🔄 Handover: resetting Dev working memory...'));
        const agentsIndexPath = path.join(projectRoot, 'semad-core', 'agents', 'index.js');
        const { clearWorkingMemory } = require(agentsIndexPath);
        await clearWorkingMemory('dev');
        // Also clear simple progress/error artifacts to simulate a fresh Dev
        const aiDir = path.join(projectRoot, '.ai');
        const progressFile = path.join(aiDir, 'dev_progress.json');
        const errorFile = path.join(aiDir, 'dev_error.json');
        try { if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile); } catch (_) {}
        try { if (fs.existsSync(errorFile)) fs.unlinkSync(errorFile); } catch (_) {}
      } catch (e) {
        console.log(chalk.yellow('⚠️  Handover memory reset encountered an issue:'), e.message);
      }
    }
  }

  // Summarize
  const passes = results.filter(r => r.devCode === 0 && r.testsOk).length;
  const allPass = passes === iters;
  console.log('\n' + chalk.bold('==== DevX3 Summary ===='));
  results.forEach(r => {
    console.log(`- Iteration ${r.iteration}: dev=${r.devCode === 0 ? 'ok' : 'fail'}, tests=${r.testsOk ? 'ok' : 'fail'}`);
  });
  if (allPass) {
    console.log(chalk.green('\n🎉 DevX3 completed: All three passes implemented and tests passed.')); 
    process.exit(0);
  } else {
    console.log(chalk.yellow(`\nDevX3 completed with ${passes}/${iters} clean passes. See logs and .ai/reports for details.`));
    process.exit(1);
  }
}

main();
