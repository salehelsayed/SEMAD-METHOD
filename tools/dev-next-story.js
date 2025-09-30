#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { program } = require('commander');
const { spawnSync } = require('child_process');
const {
  loadStoryContract,
  normalizeStoryId
} = require('../semad-core/utils/story-contract');

function ensureDir(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Dev Agent 'Implement Next Story' Command
 * Implements the next approved story using the dev agent
 */
class DevNextStoryRunner {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'semad-core', 'core-config.yaml');
    this._codexAvailable = null;
  }

  /**
   * Load configuration from core-config.yaml
   */
  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Core configuration not found: ${this.configPath}`);
    }

    const yaml = require('js-yaml');
    const content = fs.readFileSync(this.configPath, 'utf8');
    return yaml.load(content);
  }

  /**
   * Find the next story to implement
   */
  findNextStory() {
    try {
      const findNextStoryModule = require('../semad-core/utils/find-next-story');
      const config = this.loadConfig();
      
      const storyLocation = config.devStoryLocation || 'docs/stories';
      const result = findNextStoryModule.findNextApprovedStory(storyLocation);
      
      if (!result.found) {
        console.log(chalk.yellow('⏭️  No approved stories found ready for implementation.'));
        console.log(chalk.dim('Stories must have status "Approved" to be implemented.'));
        if (result.error) {
          console.log(chalk.dim(`Details: ${result.error}`));
        }
        return null;
      }

      // Transform the result to match expected format
      return {
        storyId: result.fullStoryId || result.filename,
        epicId: result.epicId,
        title: result.title,
        status: 'Approved',
        filePath: result.path
      };
    } catch (error) {
      console.error(chalk.red('Error finding next story:'), error.message);
      return null;
    }
  }

  /**
   * Run the dev agent to implement the story
   */
  isCodexDisabledByEnv() {
    const flag = process.env.SEMAD_DEV_DISABLE_CODEX || process.env.BMAD_DEV_DISABLE_CODEX;
    if (!flag) return false;
    const lowered = String(flag).toLowerCase();
    return lowered === '1' || lowered === 'true' || lowered === 'yes';
  }

  hasCodexSupport() {
    if (this._codexAvailable !== null) {
      return this._codexAvailable;
    }

    if (this.isCodexDisabledByEnv()) {
      this._codexAvailable = false;
      return false;
    }

    try {
      const res = spawnSync('codex', ['--version'], {
        cwd: this.rootDir,
        stdio: 'ignore'
      });

      if (res?.error) {
        this._codexAvailable = false;
        return false;
      }

      const code = res.status ?? res.code ?? 1;
      this._codexAvailable = code === 0;
      return this._codexAvailable;
    } catch (error) {
      this._codexAvailable = false;
      return false;
    }
  }

  buildCodexStoryArg(storyPath) {
    const rel = path.relative(this.rootDir, storyPath);
    const preferred = (!rel.startsWith('..') && !path.isAbsolute(rel)) ? rel : storyPath;
    const normalized = preferred.replace(/\\/g, '/');
    const escaped = normalized.replace(/"/g, '\\"');
    return /\s/.test(normalized) ? `@"${escaped}"` : `@${escaped}`;
  }

  tryCodexImplementation(storyPath, options = {}) {
    const useCodex = options.codex !== false;
    if (!useCodex) {
      return { attempted: false };
    }

    if (!this.hasCodexSupport()) {
      return { attempted: false };
    }

    const storyArg = this.buildCodexStoryArg(storyPath);
    const command = `as dev agent, execute *develop-story ${storyArg}`;
    console.log(chalk.blue('🤖 Dev agent: delegating implementation to Codex CLI...'));

    const env = { ...process.env, NO_UPDATE_NOTIFIER: '1' };
    const res = spawnSync('codex', [command], {
      cwd: this.rootDir,
      stdio: 'inherit',
      env
    });

    const code = res.status ?? res.code ?? 1;
    if (code === 0) {
      console.log(chalk.green('✅ Codex implementation completed successfully.'));
      return { attempted: true, success: true, via: 'codex' };
    }

    console.log(chalk.yellow(`⚠️  Codex implementation exited with code ${code}. Falling back to local workflow.`));
    return { attempted: true, success: false, exitCode: code };
  }

  async runDevAgent(storyPath, options = {}, artifactPaths = {}) {
    console.log(chalk.blue('🚀 Running Dev Agent Implementation...\n'));

    try {
      const codexAttempt = this.tryCodexImplementation(storyPath, options);
      if (codexAttempt?.success) {
        return { success: true, via: 'codex' };
      }

      if (codexAttempt?.attempted) {
        console.log(chalk.dim('ℹ️  Proceeding with local structured task implementation.'));
      }

      const AgentRunner = require('../semad-core/utils/agent-runner');
      const runner = new AgentRunner({
        memoryEnabled: true,
        healthMonitoringEnabled: true,
        verbose: options.verbose || false
      });

      // Load dev agent configuration
      const devAgentPath = path.join(this.rootDir, 'semad-core', 'agents', 'dev.md');
      if (!fs.existsSync(devAgentPath)) {
        throw new Error(`Dev agent not found: ${devAgentPath}`);
      }

      console.log(`📖 Story: ${path.relative(this.rootDir, storyPath)}`);
      console.log(`🤖 Agent: dev`);
      console.log(`📂 Working Directory: ${this.rootDir}\n`);

      // Prepare context for the dev agent
      const context = {
        storyPath: storyPath,
        task: 'implement-next-story',
        mode: options.mode || 'implementation',
        projectRoot: this.rootDir,
        allowMissingUserInput: options.allowMissingUserInput !== false,
        artifactPaths
      };
      console.log(chalk.blue('🔧 Using structured task: develop-story.yaml'));
      const result = await runner.invokeAgent('dev', 'develop-story', context);
      return result;

    } catch (error) {
      console.error(chalk.red('Dev agent execution failed:'), error.message);
      throw error;
    }
  }

  getAcceptanceEvidencePath(storyPath, storyId) {
    const rootRelative = path.join('.ai', 'dev', 'acceptance', `${storyId}.json`);
    return path.join(this.rootDir, rootRelative);
  }

  computeArtifactPaths(storyId) {
    const base = storyId || 'story';
    return {
      checklistPath: path.join(this.rootDir, '.ai', 'dev', 'checklists', `${base}.json`),
      dependencyPlanPath: path.join(this.rootDir, '.ai', 'dev', 'dependency', `${base}.json`),
      redReportPath: path.join(this.rootDir, '.ai', 'dev', 'test-reports', `${base}-red.json`),
      greenReportPath: path.join(this.rootDir, '.ai', 'dev', 'test-reports', `${base}-green.json`),
      acceptanceEvidencePath: this.getAcceptanceEvidencePath(null, base)
    };
  }

  verifyAcceptanceEvidence(evidencePath) {
    if (!fs.existsSync(evidencePath)) {
      return { ok: false, reason: `Acceptance evidence missing at ${path.relative(this.rootDir, evidencePath)}` };
    }

    try {
      const raw = fs.readFileSync(evidencePath, 'utf8');
      const payload = JSON.parse(raw);
      const acceptance = Array.isArray(payload.acceptance) ? payload.acceptance : [];
      if (acceptance.length === 0) {
        return { ok: false, reason: 'Acceptance evidence contains no criteria entries.' };
      }
      const pending = acceptance.filter(item => !item || item.verified !== true || !Array.isArray(item.evidence) || item.evidence.length === 0);
      if (pending.length > 0) {
        return { ok: false, reason: `Acceptance evidence has unverified items: ${pending.map(item => item.id).join(', ')}` };
      }
      return { ok: true, path: evidencePath };
    } catch (error) {
      return { ok: false, reason: `Failed to parse acceptance evidence: ${error.message}` };
    }
  }

  runAcceptanceValidator(evidencePath) {
    const validatorScript = path.join('tools', 'qa', 'validate-acceptance-evidence.js');
    const res = spawnSync(process.execPath, [validatorScript, '--evidence', evidencePath], {
      cwd: this.rootDir,
      stdio: 'inherit'
    });
    return res.status ?? res.code ?? 1;
  }

  appendDevTaskBlocker(storyId, message) {
    try {
      const devTasksPath = path.join(this.rootDir, '.ai', 'dev_tasks.json');
      let payload = {
        workflow: {
          name: 'develop-story',
          tasks: []
        },
        tasks: []
      };

      if (fs.existsSync(devTasksPath)) {
        try {
          payload = JSON.parse(fs.readFileSync(devTasksPath, 'utf8'));
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Could not parse existing dev_tasks.json (${error.message}); regenerating.`));
        }
      }

      payload.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      payload.tasks.push({
        id: `blocker-${Date.now()}`,
        name: `Blocker: ${message}`,
        status: 'blocked',
        storyId,
        recordedAt: new Date().toISOString()
      });

      ensureDir(devTasksPath);
      fs.writeFileSync(devTasksPath, JSON.stringify(payload, null, 2));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to record blocker: ${error.message}`));
    }
  }

  logGateEvent(eventType, details = {}) {
    try {
      const logDir = path.join(this.rootDir, '.ai', 'dev', 'logs');
      ensureDir(path.join(logDir, 'placeholder.log'));
      const logPath = path.join(logDir, 'gate-events.jsonl');
      const entry = {
        timestamp: new Date().toISOString(),
        event: eventType,
        ...details
      };
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to log gate event: ${error.message}`));
    }
  }

  ensureDependencyPlan(storyPath, dependencyPlanPath) {
  ensureDir(dependencyPlanPath);
  const result = spawnSync(process.execPath, [path.join('tools', 'dev', 'run-dependency-plan.js'), '--story', storyPath, '--output', dependencyPlanPath], {
      cwd: this.rootDir,
      stdio: 'inherit'
    });
    return result.status ?? result.code ?? 1;
  }

  /**
   * Parse StoryContract YAML front matter from a story file
   */
  parseStoryContract(storyPath) {
    try {
      const { loadStoryContract } = require('../semad-core/utils/story-contract');
      return loadStoryContract(storyPath).contract;
    } catch (e) {
      // Fallback to legacy frontmatter parsing (best-effort)
      try {
        const raw = fs.readFileSync(storyPath, 'utf8');
        const fm = /(^---[\s\S]*?\n---)/m;
        const m = raw.match(fm);
        if (!m) return null;
        const yamlText = m[1].replace(/^---\n/, '').replace(/\n---$/, '');
        const yaml = require('js-yaml');
        const doc = yaml.load(yamlText);
        return doc && doc.StoryContract ? doc.StoryContract : null;
      } catch (_) {
        return null;
      }
    }
}

/**
 * Read current story status from the story file (## Status section)
 */
function getStoryStatus(storyPath) {
  try {
    const content = fs.readFileSync(storyPath, 'utf8');
    const m = content.match(/##\s*Status\s*\n\s*([^\n]+)/i);
    return m ? m[1].trim() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Run dev guard with given args; returns { code }
 */
  runGuard(args, cwd) {
    const res = spawnSync('node', ['tools/dev-guard.js', ...args], {
      cwd: cwd || this.rootDir,
      stdio: 'inherit'
    });
    return { code: res.status ?? res.code ?? 0 };
  }

  /**
   * Update story status after implementation
   */
  async updateStoryStatus(storyPath, status) {
    try {
      const content = fs.readFileSync(storyPath, 'utf8');
      const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
      
      if (!statusRegex.test(content)) {
        console.warn(chalk.yellow('⚠️  Could not find Status section in story file'));
        return false;
      }

      const updatedContent = content.replace(statusRegex, `$1${status}`);
      fs.writeFileSync(storyPath, updatedContent, 'utf8');
      
      console.log(chalk.green(`✅ Story status updated to: ${status}`));
      return true;
      
    } catch (error) {
      console.error(chalk.red('Failed to update story status:'), error.message);
      return false;
    }
  }

  /**
   * Main execution flow
   */
  async run(options = {}) {
    console.log(chalk.bold('🛠️  BMad Dev Agent - Develop Story\n'));
    console.log(`📂 Project: ${this.rootDir}\n`);

    let statusInProgress = false;
    let originalStatus = 'Approved';
    let storyFilePath = null;
    let normalizedStoryId = null;
    let artifactPaths = null;
    let evidencePath = null;

    try {
      // Resolve story to implement
      let nextStory = null;
      if (options.storyOverride) {
        const spath = path.isAbsolute(options.storyOverride)
          ? options.storyOverride
          : path.join(this.rootDir, options.storyOverride);
        if (!fs.existsSync(spath)) {
          console.log(chalk.red('Provided --story not found:'), spath);
          return 1;
        }
        // Derive minimal descriptor from file
        const sc = this.parseStoryContract(spath) || {};
        nextStory = {
          storyId: sc.story_id || path.basename(spath, path.extname(spath)),
          epicId: sc.epic_id || 'N/A',
          title: sc.title || 'Untitled',
          status: 'Approved',
          filePath: spath
        };
      } else {
        // Find next story to implement
        nextStory = this.findNextStory();
      }
      if (!nextStory) {
        return 1;
      }

      storyFilePath = nextStory.filePath;
      // Determine original status from the story file, fallback to detected/assumed
      const detectedStatus = getStoryStatus(nextStory.filePath);
      originalStatus = detectedStatus || nextStory.status || 'Approved';

      console.log(chalk.green(`📋 Found story to implement:`));
      console.log(`   Story ID: ${nextStory.storyId}`);
      console.log(`   Epic ID: ${nextStory.epicId || 'N/A'}`);
      console.log(`   Title: ${nextStory.title || 'Untitled'}`);
      console.log(`   Status: ${nextStory.status}`);
      console.log(`   File: ${path.relative(this.rootDir, nextStory.filePath)}\n`);

      let contract;
      try {
        ({ contract } = loadStoryContract(nextStory.filePath));
      } catch (error) {
        console.log(chalk.red('Failed to load StoryContract:'), error.message);
        return 1;
      }

      normalizedStoryId = normalizeStoryId(contract, nextStory.filePath);
      evidencePath = this.getAcceptanceEvidencePath(nextStory.filePath, normalizedStoryId);
      artifactPaths = this.computeArtifactPaths(normalizedStoryId);

      // Confirm execution if not in auto mode
      if (!options.auto) {
        const inquirer = require('inquirer');
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with implementation?',
            default: true
          }
        ]);

        if (!proceed) {
          console.log(chalk.yellow('⏹️  Implementation cancelled.'));
          return 0;
        }
      }

      console.log(chalk.blue('🧭 Running pre-flight dependency planning...'));
      const depExit = this.ensureDependencyPlan(nextStory.filePath, artifactPaths.dependencyPlanPath);
      if (depExit !== 0) {
        const msg = 'Dependency analysis failed; see console output for details.';
        console.log(chalk.red(`❌ ${msg}`));
        this.appendDevTaskBlocker(normalizedStoryId, msg);
        this.logGateEvent('dependency_plan_failed', { storyId: normalizedStoryId, exitCode: depExit });
        return 1;
      }
      this.logGateEvent('dependency_plan_succeeded', { storyId: normalizedStoryId, dependencyPlan: path.relative(this.rootDir, artifactPaths.dependencyPlanPath) });

      // Enforce breakage budget gate before status changes
      try {
        const planRaw = fs.readFileSync(artifactPaths.dependencyPlanPath, 'utf8');
        const plan = JSON.parse(planRaw);
        const configuredMax = (contract && contract.impactRadius && contract.impactRadius.breakageBudget && contract.impactRadius.breakageBudget.maxFilesAffected) || null;
        const planMax = plan?.notes?.maxFilesAffected || null;
        const maxFilesAllowed = configuredMax || planMax || 10; // fallback: 10
        const impactedCount = Array.isArray(plan?.filesToModify) ? plan.filesToModify.length : 0;
        if (maxFilesAllowed && impactedCount > maxFilesAllowed) {
          const reason = `Breakage budget exceeded: impacted files ${impactedCount} > maxFilesAffected ${maxFilesAllowed}`;
          console.log(chalk.red(`⛔ ${reason}`));
          this.appendDevTaskBlocker(normalizedStoryId, reason);
          this.logGateEvent('breakage_budget_exceeded', {
            storyId: normalizedStoryId,
            impactedCount,
            maxFilesAllowed,
            dependencyPlan: path.relative(this.rootDir, artifactPaths.dependencyPlanPath)
          });
          console.log(chalk.yellow('Halting implementation until budget is adjusted or scope is reduced.'));
          return 1;
        }
      } catch (e) {
        console.log(chalk.yellow(`⚠️  Could not enforce breakage budget gate (${e.message}). Proceeding with caution.`));
      }

      // Update story status to In Progress
      console.log(chalk.blue('📝 Updating story status to "In Progress"...'));
      if (await this.updateStoryStatus(nextStory.filePath, 'In Progress')) {
        statusInProgress = true;
      }

      // Decide guard behavior from StoryContract or CLI option
      const qualityGates = contract.qualityGates || {};
      const cleanupRequired = contract.cleanupRequired || {};

      // guardMode: contract | always | never
      const guardMode = options.guard || 'contract';
      const shouldPreImpact = guardMode === 'always' || (guardMode === 'contract' && !!qualityGates.runImpactScan);
      const shouldPostCleanup = guardMode === 'always' || (guardMode === 'contract' && (cleanupRequired.removeUnused || qualityGates.zeroUnused));

      // Pre-work impact scan
      if (shouldPreImpact) {
        const components = (contract.impactRadius && contract.impactRadius.components) || [];
        const paths = components.length ? components : ['tools', 'scripts', 'semad-core'];
        console.log(chalk.blue('🛰️  Running pre-change impact scan via dev-guard...'));
        const args = ['--impact-scan', '--report', '--paths', ...paths];
        const { code } = this.runGuard(args, this.rootDir);
        if (code !== 0) {
          console.log(chalk.yellow('⚠️  Impact scan reported issues. Check .ai/reports/impact-map.json'));
        }
      }

      // Run dev agent implementation
      const result = await this.runDevAgent(nextStory.filePath, options, artifactPaths);

      if (result && result.success) {
        const acceptanceCheck = this.verifyAcceptanceEvidence(evidencePath);
        if (!acceptanceCheck.ok) {
          console.log(chalk.red('\n❌ Implementation halted:'), acceptanceCheck.reason);
          this.appendDevTaskBlocker(normalizedStoryId, acceptanceCheck.reason);
          this.logGateEvent('acceptance_evidence_missing', { storyId: normalizedStoryId, reason: acceptanceCheck.reason });
          if (statusInProgress) {
            await this.updateStoryStatus(nextStory.filePath, originalStatus);
          }
          console.log(chalk.yellow('Story status reverted due to missing acceptance evidence.'));
          return 1;
        }

        const validatorExit = this.runAcceptanceValidator(evidencePath);
        if (validatorExit !== 0) {
          const msg = 'Acceptance evidence validator reported missing or incomplete coverage.';
          console.log(chalk.red(`\n❌ ${msg}`));
          this.appendDevTaskBlocker(normalizedStoryId, msg);
          this.logGateEvent('acceptance_validator_failed', { storyId: normalizedStoryId, exitCode: validatorExit });
          if (statusInProgress) {
            await this.updateStoryStatus(nextStory.filePath, originalStatus);
          }
          console.log(chalk.yellow('Story status reverted due to acceptance validation failure.'));
          return validatorExit;
        }

        this.logGateEvent('implementation_success', {
          storyId: normalizedStoryId,
          acceptanceEvidence: path.relative(this.rootDir, evidencePath),
          dependencyPlan: path.relative(this.rootDir, artifactPaths.dependencyPlanPath)
        });

        console.log(chalk.green('\n✅ Implementation completed successfully!'));

        // Post-work cleanup and report
        if (shouldPostCleanup) {
          console.log(chalk.blue('🧹 Running post-change cleanup and reporting via dev-guard...'));
          const { code } = this.runGuard(['--cleanup', '--report'], this.rootDir);
          if (code !== 0) {
            console.log(chalk.yellow('⚠️  Cleanup scan found issues. See .ai/reports/cleanup-report.json'));
          }
        }
        
        // Update story status to final desired state (default: Implemented; devx3 may request Ready for Review)
        const finalStatus = options.finalStatus || 'Implemented';
        await this.updateStoryStatus(nextStory.filePath, finalStatus);
        console.log(chalk.green(`📁 Acceptance evidence: ${path.relative(this.rootDir, evidencePath)}`));

        if (!options.quiet) {
          console.log(chalk.blue('\n📋 Next Steps:'));
          console.log('   1. Review the implemented changes');
          console.log('   2. Run tests to ensure quality');
          console.log('   3. Use QA agent for validation');
          console.log(`   4. Run: npm run qa:review "${path.relative(this.rootDir, nextStory.filePath)}"`);
        }
        
        return 0;
      } else {
        console.log(chalk.red('\n❌ Implementation failed or incomplete.'));
        this.appendDevTaskBlocker(normalizedStoryId, 'Structured task execution failed or returned incomplete status.');
        this.logGateEvent('implementation_failed', { storyId: normalizedStoryId });
        if (statusInProgress) {
          await this.updateStoryStatus(nextStory.filePath, originalStatus);
          console.log(chalk.yellow(`Story status reverted to "${originalStatus}" for retry.`));
        }
        return 1;
      }

    } catch (error) {
      console.error(chalk.red('\nError during implementation:'), error.message);
      if (normalizedStoryId) {
        this.appendDevTaskBlocker(normalizedStoryId, error.message);
        this.logGateEvent('implementation_error', { storyId: normalizedStoryId, error: error.message });
      }
      if (statusInProgress && storyFilePath) {
        await this.updateStoryStatus(storyFilePath, originalStatus);
      }
      if (options.verbose) {
        console.error(error.stack);
      }
      return 1;
    }
  }
}

// CLI setup
program
  .description('Run dev agent to implement the next approved story')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-a, --auto', 'Run automatically without confirmation prompts')
  .option('-v, --verbose', 'Show detailed execution logs')
  .option('-m, --mode <mode>', 'Implementation mode (implementation, review, test)', 'implementation')
  .option('--guard <mode>', 'Guard mode: contract | always | never', 'contract')
  .option('--story <path>', 'Explicit story file path to implement (bypass finder)')
  .option('--quiet', 'Reduce output; suppress tips/next-steps')
  .option('--no-codex', 'Disable Codex CLI integration (use local fallback only)');

async function main() {
  program.parse(process.argv);
  const options = program.opts();
  const runner = new DevNextStoryRunner(options.directory);
  
  try {
    const exitCode = await runner.run({
      auto: options.auto,
      verbose: options.verbose,
      mode: options.mode,
      storyOverride: options.story,
      quiet: options.quiet,
      codex: options.codex
    });
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red('Command failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DevNextStoryRunner;
