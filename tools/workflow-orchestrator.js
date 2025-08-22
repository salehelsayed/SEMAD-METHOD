#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { Command } = require('commander');
const AgentSimulator = require('../bmad-core/utils/agent-simulator');
const WorkflowConfigLoader = require('../bmad-core/utils/workflow-config-loader');
const VerboseLogger = require('../bmad-core/utils/verbose-logger');
const FilePathResolver = require('../bmad-core/utils/file-path-resolver');
const SharedContextManager = require('../bmad-core/utils/shared-context-manager');
let AgentRunner;
try {
  AgentRunner = require('../bmad-core/utils/agent-runner');
} catch (_) {
  try { AgentRunner = require('./orchestrator/agent-runner-shim'); } catch (_) {}
}
// Fallback to shim if memory modules are not available in installed package
try {
  const coreDir = fs.existsSync(path.join(process.cwd(), 'bmad-core')) ? 'bmad-core' : '.bmad-core';
  const umm = path.join(process.cwd(), coreDir, 'utils', 'unified-memory-manager.js');
  const mh = path.join(process.cwd(), coreDir, 'utils', 'memory-health.js');
  if (!fs.existsSync(umm) || !fs.existsSync(mh)) {
    const Shim = require('./orchestrator/agent-runner-shim');
    AgentRunner = Shim;
  }
} catch (e) {
  try { AgentRunner = require('./orchestrator/agent-runner-shim'); } catch (_) {}
}
let getAggregatedHealthStatus;
try {
  ({ getAggregatedHealthStatus } = require('../bmad-core/utils/memory-health'));
} catch (_) {
  try { ({ getAggregatedHealthStatus } = require('./orchestrator/memory-health-shim')); } catch (_) {}
}

class WorkflowOrchestrator {
  constructor(rootDir) {
    this.rootDir = rootDir || process.cwd();
    this.workflowsDir = path.join(this.rootDir, 'bmad-core', 'workflows');
    this.storyMetadataPath = path.join(this.rootDir, '.bmad-orchestrator-metadata.json');
    this.simulator = new AgentSimulator();
    this.configLoader = new WorkflowConfigLoader(this.rootDir);
    this.logger = new VerboseLogger();
    this.filePathResolver = new FilePathResolver(this.rootDir);
    this.contextManager = new SharedContextManager(path.join(this.rootDir, '.ai'));
    this.agentRunner = new AgentRunner({ memoryEnabled: true, healthMonitoringEnabled: true });
    this.config = null;
    this.resolvedPaths = null;
    this.nonInteractive = false;
    this.suppressDevLoadWarnings = false;
    this.preserveStories = false;
    // Reverse alignment cache paths
    this.reverseDir = path.join(this.rootDir, '.ai', 'reverse');
    this.reportsDir = path.join(this.rootDir, '.ai', 'reports');
    // Default epic ID for reverse-aligned stories; can be overridden via CLI
    this.reverseEpicId = 99;
  }

  /**
   * Display consolidated memory health status for all agents
   * @param {Array} agents - List of agent names to check
   * @returns {Object} Memory health summary
   */
  async displayMemoryHealthStatus(agents = ['dev', 'qa', 'sm', 'analyst', 'pm', 'architect']) {
    this.logger.taskStart('Memory health assessment', 'Checking memory systems across all agents');
    
    console.log(chalk.bold('\n🩺 Memory Health Status Report\n'));
    
    try {
      // Get aggregated health status
      const aggregatedStatus = getAggregatedHealthStatus();
      
      if (aggregatedStatus.summary.totalAgents === 0) {
        console.log(chalk.yellow('⚠️  No memory health data available yet.'));
        console.log(chalk.dim('Memory health checks will be performed when agents are first used.\n'));
        return { 
          healthy: true, 
          message: 'No health data available', 
          agentCount: 0,
          recommendation: 'Memory health checks will run automatically when agents start'
        };
      }
      
      // Display overall summary
      const { summary } = aggregatedStatus;
      console.log(chalk.bold(`📊 Overall Status:`));
      console.log(`   Total Agents Monitored: ${summary.totalAgents}`);
      console.log(`   Healthy Agents: ${chalk.green(summary.healthyAgents)}`);
      console.log(`   Degraded Agents: ${chalk.yellow(summary.degradedAgents)}`);
      console.log(`   Unhealthy Agents: ${chalk.red(summary.unhealthyAgents)}`);
      console.log(`   Total System Checks: ${summary.totalChecks}`);
      
      // Display critical issues if any
      if (aggregatedStatus.criticalIssues.length > 0) {
        console.log(chalk.red(`\n🚨 CRITICAL ISSUES (${aggregatedStatus.criticalIssues.length}):`));
        aggregatedStatus.criticalIssues.forEach(issue => {
          console.log(chalk.red(`   • [${issue.agent}] ${issue.message}`));
        });
      }
      
      // Display agent-specific status
      if (Object.keys(aggregatedStatus.agents).length > 0) {
        console.log(chalk.bold(`\n🤖 Agent Status:`));
        
        Object.entries(aggregatedStatus.agents).forEach(([agentName, status]) => {
          const statusIcon = status.overallStatus === 'healthy' ? '✅' : 
                           status.overallStatus === 'degraded' ? '⚠️' : '❌';
          const statusColor = status.overallStatus === 'healthy' ? chalk.green : 
                            status.overallStatus === 'degraded' ? chalk.yellow : chalk.red;
          
          console.log(`   ${statusIcon} ${agentName}: ${statusColor(status.overallStatus.toUpperCase())}`);
          
          if (status.overallStatus !== 'healthy') {
            const issues = Object.values(status.components).filter(c => c.status !== 'healthy');
            issues.forEach(issue => {
              const severity = issue.severity === 'critical' ? '🚨' : 
                             issue.severity === 'error' ? '❌' : '⚠️';
              console.log(`     ${severity} ${issue.message}`);
            });
          }
        });
      }
      
      // Display top recommendations
      if (aggregatedStatus.recommendations.length > 0) {
        console.log(chalk.bold(`\n💡 Top Recommendations:`));
        const topRecommendations = aggregatedStatus.recommendations
          .slice(0, 5)
          .map(rec => `[${rec.agent}] ${rec.recommendation}`)
          .forEach(rec => console.log(`   • ${rec}`));
      }
      
      // Overall health determination
      const overallHealthy = summary.unhealthyAgents === 0 && aggregatedStatus.criticalIssues.length === 0;
      const status = overallHealthy ? 
        (summary.degradedAgents > 0 ? 'degraded' : 'healthy') : 
        'unhealthy';
      
      const statusColor = status === 'healthy' ? chalk.green : 
                         status === 'degraded' ? chalk.yellow : chalk.red;
      
      console.log(chalk.bold(`\n🎯 Overall Memory System Status: ${statusColor(status.toUpperCase())}`));
      
      if (!overallHealthy) {
        console.log(chalk.yellow(`\n⚠️  Some memory systems need attention before proceeding.`));
        console.log(chalk.dim(`Review the recommendations above to ensure optimal performance.\n`));
      } else if (status === 'degraded') {
        console.log(chalk.yellow(`\n⚠️  Memory systems are functional but have some issues.`));
        console.log(chalk.dim(`Consider addressing warnings when convenient.\n`));
      } else {
        console.log(chalk.green(`\n✅ All memory systems are healthy and ready!\n`));
      }
      
      this.logger.taskComplete('Memory health assessment', `Status: ${status}, Agents: ${summary.totalAgents}`);
      
      return {
        healthy: overallHealthy,
        status,
        agentCount: summary.totalAgents,
        healthyAgents: summary.healthyAgents,
        degradedAgents: summary.degradedAgents,
        unhealthyAgents: summary.unhealthyAgents,
        criticalIssues: aggregatedStatus.criticalIssues.length,
        recommendations: aggregatedStatus.recommendations.length
      };
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Failed to get memory health status: ${error.message}`));
      this.logger.error('Memory health assessment failed', error);
      
      return {
        healthy: false,
        status: 'error',
        agentCount: 0,
        error: error.message,
        recommendation: 'Check memory health system configuration'
      };
    }
  }

  // ========= Reverse Alignment Helpers =========
  async ensureDirs() {
    const fsExtra = require('fs-extra');
    await fsExtra.ensureDir(this.reverseDir);
    await fsExtra.ensureDir(this.reportsDir);
    // Ensure baseline config files exist for reverse-align workflows
    try {
      const aiDir = path.join(this.rootDir, '.ai');
      await fsExtra.ensureDir(aiDir);
      const crit = path.join(aiDir, 'critical-entities.json');
      const ignore = path.join(aiDir, 'story-ignore.json');
      if (!fs.existsSync(crit)) await fs.promises.writeFile(crit, '[]\n', 'utf8');
      if (!fs.existsSync(ignore)) await fs.promises.writeFile(ignore, '[]\n', 'utf8');
    } catch (_) { /* non-fatal */ }
  }

  async cleanupDocs() {
    await this.initialize();
    await this.ensureDirs();

    const fsExtra = require('fs-extra');
    const preserve = new Set([
      path.join(this.rootDir, 'docs', 'prd', 'PRD.md'),
      path.join(this.rootDir, 'docs', 'architecture', 'architecture.md'),
      path.join(this.rootDir, 'docs', 'brief.md'),
      path.join(this.rootDir, 'docs', 'workflow-orchestrator.md')
    ]);

    // Also preserve any devLoadAlwaysFiles from core-config.yaml so the Dev agent keeps its required docs
    try {
      const coreConfigPath = path.join(this.rootDir, 'bmad-core', 'core-config.yaml');
      if (fs.existsSync(coreConfigPath)) {
        const cfgRaw = fs.readFileSync(coreConfigPath, 'utf8');
        const cfg = yaml.load(cfgRaw) || {};
        const loadAlways = Array.isArray(cfg.devLoadAlwaysFiles) ? cfg.devLoadAlwaysFiles : [];
        for (const rel of loadAlways) {
          // Only preserve markdown files we can resolve under repo root
          const abs = path.join(this.rootDir, rel);
          preserve.add(abs);
        }
      }
    } catch (_) {
      // Non-fatal: continue with default preserve set
    }

    const docsRoot = path.join(this.rootDir, 'docs');
    this.logger.phaseStart('Docs Cleanup', 'Pruning docs to core set');

    const spinner = ora('Scanning docs directory...').start();
    const removed = [];
    const kept = [];

    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Remove entire stories directory; recreated later
          if (full === path.join(docsRoot, 'stories')) {
            if (!this.preserveStories) {
              await fsExtra.remove(full);
              removed.push(full + '/');
            } else {
              kept.push(full + '/');
            }
            continue;
          }
          await walk(full);
          continue;
        }
        if (!entry.name.toLowerCase().endsWith('.md')) continue;
        if (preserve.has(full)) {
          kept.push(full);
          continue;
        }
        const lower = entry.name.toLowerCase();
        const isAssessment = lower.includes('assessment') || lower.includes('test') || lower.includes('qa');
        const isTemp = lower.endsWith('.tmp.md') || lower.endsWith('.backup.md') || lower.includes('temp');
        const isExample = lower.includes('example');
        const isPreserved = preserve.has(full);
        const isCoreSubdoc = full.startsWith(path.join(docsRoot, 'architecture') + path.sep) && path.basename(full) === 'architecture.md';
        if (isCoreSubdoc || isPreserved) {
          kept.push(full);
          continue;
        }
        if (isAssessment || isTemp || isExample || !preserve.has(full)) {
          await fsExtra.remove(full);
          removed.push(full);
        } else {
          kept.push(full);
        }
      }
    };

    if (fs.existsSync(docsRoot)) {
      await walk(docsRoot);
    }

    // Ensure an empty docs/stories directory exists after cleanup to avoid warnings
    if (!this.preserveStories) {
      try {
        await fsExtra.ensureDir(path.join(docsRoot, 'stories'));
      } catch (_) {
        // Non-fatal: proceed even if we can't recreate stories dir
      }
    }

    spinner.succeed('Docs cleanup complete');
    this.logger.summary('Docs Cleanup Summary', [
      `Removed: ${removed.length} items`,
      `Kept: ${kept.length} core docs`
    ]);

    return { removed, kept };
  }

  async analyzeImplementation(options = {}) {
    await this.initialize();
    await this.ensureDirs();

    const analysis = {
      timestamp: new Date().toISOString(),
      features: [],
      evidence: {},
      pkg: {},
      toolsDetected: {},
      ciWorkflows: [],
      repo: {},
      entities: [],
      relations: []
    };

    // CI/CD workflows
    const workflowsDir = path.join(this.rootDir, '.github', 'workflows');
    const hasCI = fs.existsSync(workflowsDir) && fs.readdirSync(workflowsDir).length > 0;
    const ciFiles = hasCI ? fs.readdirSync(workflowsDir).map(f => path.join('.github/workflows', f)) : [];
    analysis.features.push({ key: 'ci_cd', name: 'CI/CD workflows', present: hasCI });
    analysis.evidence.ci_cd = ciFiles;
    analysis.ciWorkflows = ciFiles;

    // Gate system (planning, dev, QA gates) - inferred from orchestrator and docs
    const hasGates = fs.existsSync(path.join(this.rootDir, 'docs', 'validation-system.md')) || fs.existsSync(path.join(this.rootDir, 'tools', 'workflow-orchestrator.js'));
    analysis.features.push({ key: 'gates', name: 'Gate system', present: !!hasGates });
    analysis.evidence.gates = ['tools/workflow-orchestrator.js', 'docs/validation-system.md'].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));

    // Metrics collection system (memory health, logs)
    const metricsFiles = [
      'bmad-core/utils/memory-health.js',
      'bmad-core/utils/verbose-logger.js'
    ].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'metrics', name: 'Metrics collection system', present: metricsFiles.length > 0 });
    analysis.evidence.metrics = metricsFiles;

    // Dynamic plan adaptation
    const hasDynamicPlan = fs.existsSync(path.join(this.rootDir, 'docs', 'dynamic-planning.md')) || fs.existsSync(path.join(this.rootDir, 'tools', 'workflow-orchestrator.js'));
    analysis.features.push({ key: 'dynamic_plan', name: 'Dynamic plan adaptation', present: !!hasDynamicPlan });
    analysis.evidence.dynamic_plan = ['docs/dynamic-planning.md', 'tools/workflow-orchestrator.js'].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));

    // Preflight checks and validation (file-path-resolver, config loader)
    const preflightFiles = [
      'bmad-core/utils/file-path-resolver.js',
      'bmad-core/utils/workflow-config-loader.js'
    ].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'preflight', name: 'Preflight checks and validation', present: preflightFiles.length > 0 });
    analysis.evidence.preflight = preflightFiles;

    // Reference checking system (dependency/scanner, find-next-story)
    const refFiles = [
      'bmad-core/utils/dependency-scanner.js',
      'bmad-core/utils/find-next-story.js'
    ].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'reference_checking', name: 'Reference checking system', present: refFiles.length > 0 });
    analysis.evidence.reference_checking = refFiles;

    // Patch plan validation (examples and tools)
    const patchPlanEvidence = [
      'docs/examples/patch-plan-example.md'
    ].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'patch_plan_validation', name: 'Patch plan validation', present: patchPlanEvidence.length > 0 });
    analysis.evidence.patch_plan_validation = patchPlanEvidence;

    // Simple task tracking (no Qdrant)
    const trackingDirs = [
      '.ai/progress',
      'bmad-core/agents/index.js' // working memory helpers
    ].filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'simple_task_tracking', name: 'Simple task tracking (no Qdrant)', present: trackingDirs.length > 0 });
    analysis.evidence.simple_task_tracking = trackingDirs;

    // Deprecated: Qdrant usage (should be false)
    const usesQdrant = fs.existsSync(path.join(this.rootDir, 'qdrant_storage'));
    analysis.features.push({ key: 'qdrant', name: 'Qdrant-based vector DB', present: usesQdrant, deprecated: true });
    analysis.evidence.qdrant = usesQdrant ? ['qdrant_storage/'] : [];

    // Observability (metrics/logging/reporting)
    const observabilityCandidates = [
      'tools/metrics',
      'bmad-core/utils/verbose-logger.js',
      'bmad-core/utils/memory-health.js',
      '.ai/reports'
    ];
    const observabilityFound = observabilityCandidates.filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'observability', name: 'Observability & Metrics', present: observabilityFound.length > 0 });
    analysis.evidence.observability = observabilityFound;

    // Error handling (heuristics: atomic updates, backups, try/catch in orchestrator)
    const errHandlingCandidates = [
      'tools/workflow-orchestrator.js',
      'tools/orchestrator/gates'
    ];
    const errFound = errHandlingCandidates.filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'error_handling', name: 'Error handling & recovery patterns', present: errFound.length > 0 });
    analysis.evidence.error_handling = errFound;

    // Data flow (heuristics: orchestrator, bmad-core, docs, .ai exist)
    const dataFlowCandidates = [
      'tools/workflow-orchestrator.js',
      'bmad-core',
      'docs',
      '.ai'
    ];
    const dataFlowFound = dataFlowCandidates.filter(rel => fs.existsSync(path.join(this.rootDir, rel)));
    analysis.features.push({ key: 'data_flow', name: 'Data flow orchestration', present: dataFlowFound.length === dataFlowCandidates.length });
    analysis.evidence.data_flow = dataFlowFound;

    // package.json extraction (tooling, versions, scripts)
    const pkgPath = path.join(this.rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw);
        const depKeys = Object.keys(pkg.dependencies || {});
        const devDepKeys = Object.keys(pkg.devDependencies || {});
        const pick = (obj, keys) => keys.reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});
        analysis.pkg = {
          name: pkg.name,
          version: pkg.version,
          engines: pkg.engines || {},
          dependencies: pick(pkg.dependencies || {}, depKeys.slice(0, 50)),
          devDependencies: pick(pkg.devDependencies || {}, devDepKeys.slice(0, 50)),
          scripts: pkg.scripts || {},
          bin: pkg.bin || {}
        };
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const has = dep => Object.prototype.hasOwnProperty.call(allDeps, dep);
        analysis.toolsDetected = {
          jest: has('jest'),
          eslint: has('eslint'),
          prettier: has('prettier'),
          commander: has('commander'),
          inquirer: has('inquirer'),
          chalk: has('chalk'),
          ora: has('ora'),
          'js-yaml': has('js-yaml'),
          react: has('react') || has('react-dom'),
          next: has('next'),
          vue: has('vue'),
          angular: has('@angular/core')
        };

        // Workspaces indicator (monorepo hint)
        const workspaces = pkg.workspaces;
        analysis.repo.workspaces = Array.isArray(workspaces) ? workspaces : (workspaces && typeof workspaces === 'object' ? workspaces.packages : undefined);
      } catch (_) {
        // ignore parse issues, keep defaults
      }
    }

    // Monorepo detection via packages/ folder
    const packagesDir = path.join(this.rootDir, 'packages');
    let monorepo = false;
    if (fs.existsSync(packagesDir)) {
      try {
        const subs = fs.readdirSync(packagesDir);
        monorepo = subs.some(s => fs.existsSync(path.join(packagesDir, s, 'package.json')));
      } catch (_) {}
    }
    analysis.repo.monorepo = monorepo || !!analysis.repo.workspaces;
    analysis.repo.packagesDir = fs.existsSync(packagesDir);

    // ===== Minimal entity extractors: APIs and Modules (tools/, scripts/, src/)
    try {
      const defaultRoots = ['tools', 'scripts', 'src'];
      const roots = (Array.isArray(options.roots) && options.roots.length
        ? options.roots
        : defaultRoots)
        .map(d => path.join(this.rootDir, d))
        .filter(p => fs.existsSync(p));
      const exts = new Set(['.js', '.ts', '.tsx', '.mjs', '.cjs']);
      const toPosix = (p) => p.split(path.sep).join('/');
      const apiRegex = /(GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_\-\/:{}]+/g;
      const importRegexes = [
        /import\s+[^'";]+\s+from\s+['"]([^'\"]+)['"]/g,
        /import\s*\(\s*['"]([^'\"]+)['"]\s*\)/g,
        /require\(\s*['"]([^'\"]+)['"]\s*\)/g,
        /export\s+\*\s+from\s+['"]([^'\"]+)['"]/g,
        /export\s+\{[^}]*\}\s+from\s+['"]([^'\"]+)['"]/g
      ];
      const exportRegexes = [
        /export\s+function\s+(\w+)/g,
        /export\s+class\s+(\w+)/g,
        /export\s+const\s+(\w+)/g,
        /export\s+\{\s*([\w\s,]+)\s*\}/g,
        /exports\.(\w+)\s*=\s*/g,
        /module\.exports\s*=\s*\{?\s*(\w+)?/g
      ];
      const entities = new Map(); // id -> entity
      const relations = [];
      const onlyPaths = options.onlyPaths instanceof Set ? options.onlyPaths : null;
      const tryResolve = (fromFile, spec) => {
        // Only resolve relative specs
        if (!spec || !spec.startsWith('.')) return null;
        const baseDir = path.dirname(fromFile);
        const cand = path.resolve(baseDir, spec);
        const candidates = [];
        const extList = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
        // direct file with extension
        candidates.push(cand);
        for (const e of extList) candidates.push(cand + e);
        // index files
        for (const e of extList) candidates.push(path.join(cand, 'index' + e));
        for (const pth of candidates) {
          if (fs.existsSync(pth) && fs.statSync(pth).isFile()) return pth;
        }
        return null;
      };

      const walk = (dir) => {
        const ents = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of ents) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          const ext = path.extname(full);
          if (!exts.has(ext)) continue;
          const rel = toPosix(path.relative(this.rootDir, full));
          if (onlyPaths && !onlyPaths.has(rel)) continue;
          let text = '';
          try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
          // Ensure file-level module entity exists
          const fileModId = `${rel}#*`;
          if (!entities.has(fileModId)) {
            entities.set(fileModId, {
              id: fileModId,
              type: 'module',
              name: `${rel}`,
              description: '',
              sourcePaths: [rel],
              symbols: ['*'],
              tests: [],
              labels: [],
              lifecycle: 'active',
              confidence: 0.5,
              evidence: [rel],
              lastSeen: new Date().toISOString()
            });
          }
          // APIs
          const seenApi = new Set();
          let m;
          while ((m = apiRegex.exec(text)) !== null) {
            const token = m[0].trim();
            const [method, ...rest] = token.split(/\s+/);
            const route = rest.join(' ');
            const id = `api:${route}#${method.toUpperCase()}`;
            if (!seenApi.has(id)) {
              seenApi.add(id);
              if (!entities.has(id)) {
                entities.set(id, {
                  id,
                  type: 'api',
                  name: `${method.toUpperCase()} ${route}`,
                  description: '',
                  sourcePaths: [rel],
                  symbols: [],
                  tests: [],
                  labels: [],
                  lifecycle: 'active',
                  confidence: 0.6,
                  evidence: [rel],
                  lastSeen: new Date().toISOString()
                });
              } else {
                const ent = entities.get(id);
                if (!ent.sourcePaths.includes(rel)) ent.sourcePaths.push(rel);
                if (!ent.evidence.includes(rel)) ent.evidence.push(rel);
              }
              relations.push({ type: 'uses', fromId: id, toId: fileModId, evidencePath: rel });
            }
          }
          // Import-based module relations (depends_on)
          for (const ire of importRegexes) {
            let im;
            const rx = new RegExp(ire.source, 'g');
            while ((im = rx.exec(text)) !== null) {
              const spec = im[1];
              const resolved = tryResolve(full, spec);
              if (!resolved) continue;
              const tgtRel = toPosix(path.relative(this.rootDir, resolved));
              const tgtModId = `${tgtRel}#*`;
              if (!entities.has(tgtModId)) {
                entities.set(tgtModId, {
                  id: tgtModId,
                  type: 'module',
                  name: `${tgtRel}`,
                  description: '',
                  sourcePaths: [tgtRel],
                  symbols: ['*'],
                  tests: [],
                  labels: [],
                  lifecycle: 'active',
                  confidence: 0.5,
                  evidence: [tgtRel],
                  lastSeen: new Date().toISOString()
                });
              }
              relations.push({ type: 'depends_on', fromId: fileModId, toId: tgtModId, evidencePath: rel });
            }
          }
          // Module exports
          const foundSymbols = new Set();
          for (const re of exportRegexes) {
            let mm;
            const rx = new RegExp(re.source, 'g');
            while ((mm = rx.exec(text)) !== null) {
              let names = [];
              if (mm[1]) {
                // Handle export { a, b }
                if (re.source.includes('\\{')) {
                  names = String(mm[1]).split(',').map(s => s.trim()).filter(Boolean);
                } else {
                  names = [String(mm[1]).trim()].filter(Boolean);
                }
              }
              for (const sym of names) {
                if (!sym) continue;
                if (foundSymbols.has(sym)) continue;
                foundSymbols.add(sym);
                const id = `${rel}#${sym}`;
                if (!entities.has(id)) {
                  entities.set(id, {
                    id,
                    type: 'module',
                    name: sym,
                    description: '',
                    sourcePaths: [rel],
                    symbols: [sym],
                    tests: [],
                    labels: [],
                    lifecycle: 'active',
                    confidence: 0.6,
                    evidence: [rel],
                    lastSeen: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
      };
      for (const r of roots) walk(r);
      analysis.entities = Array.from(entities.values());
      analysis.relations = relations;
    } catch (_) {}

    // Decisions/observations (if present)
    try {
      const obsDir = path.join(this.rootDir, '.ai', 'observations');
      if (fs.existsSync(obsDir)) {
        const files = fs.readdirSync(obsDir).filter(f => f.endsWith('.json'));
        const decisions = [];
        for (const f of files) {
          try {
            const obj = JSON.parse(fs.readFileSync(path.join(obsDir, f), 'utf8'));
            if (obj && (obj.decision || obj.action)) decisions.push(obj);
          } catch (_) {}
        }
        if (decisions.length) {
          analysis.decisions = decisions;
          analysis.features.push({ key: 'implementation_decisions', name: 'Implementation decisions captured', present: true });
          analysis.evidence.implementation_decisions = files.map(f => path.join('.ai/observations', f));
        }
      }
    } catch (_) {}

    // Lifecycle classification via dep-report (if available)
    try {
      const depReportPath = path.join(this.rootDir, '.ai', 'dep-report.json');
      const minimatch = require('glob').minimatch;
      if (fs.existsSync(depReportPath)) {
        const dep = JSON.parse(fs.readFileSync(depReportPath, 'utf8')) || {};
        const unreachable = new Set((dep.unreachable || []).map(String));
        const isUnreachable = (p) => unreachable.has(p) || Array.from(unreachable).some(u => minimatch(p, u));
        for (const f of analysis.features) {
          const ev = analysis.evidence?.[f.key] || [];
          if (ev.length > 0 && ev.every(isUnreachable)) {
            f.lifecycle = 'unused';
          } else if (f.deprecated) {
            f.lifecycle = 'deprecated';
          } else if (f.present) {
            f.lifecycle = 'active';
          } else {
            f.lifecycle = 'planned';
          }
        }
      } else {
        for (const f of analysis.features) {
          if (f.deprecated) f.lifecycle = 'deprecated';
          else f.lifecycle = f.present ? 'active' : 'planned';
        }
      }
    } catch (_) {
      for (const f of analysis.features) {
        if (!f.lifecycle) f.lifecycle = f.present ? 'active' : (f.deprecated ? 'deprecated' : 'planned');
      }
    }

    // Entity extractors (Manifest v1)
    try {
      const { extractEntities } = require('./extractors');
      const res = await extractEntities(this.rootDir, options || {});
      if (res && Array.isArray(res.entities)) analysis.entities = res.entities;
      if (res && Array.isArray(res.relations)) analysis.relations = res.relations;
    } catch (e) {
      // Non-fatal; continue without entities
    }

    // Save analysis
    const fsExtra = require('fs-extra');
    await fsExtra.writeJson(path.join(this.reverseDir, 'analysis.json'), analysis, { spaces: 2 });
    this.logger.taskComplete('Reverse analysis', `Found ${analysis.features.filter(f => f.present).length} implemented feature areas`);
    return analysis;
  }

  async rewriteArchitectureFromImplementation(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const archPath = path.join(this.rootDir, 'docs', 'architecture', 'architecture.md');
    const codingStandardsPath = path.join(this.rootDir, 'docs', 'architecture', 'coding-standards.md');
    const techStackPath = path.join(this.rootDir, 'docs', 'architecture', 'tech-stack.md');
    const sourceTreePath = path.join(this.rootDir, 'docs', 'architecture', 'source-tree.md');
    const lines = [];
    lines.push('# Architecture');
    lines.push('');
    lines.push('This document is reverse-engineered from the current implementation. It summarizes real systems, tooling, and workflows discovered in the repository.');
    lines.push('');
    // Change Log
    lines.push('## Change Log');
    lines.push('| Date | Version | Description | Author |');
    lines.push('|---|---|---|---|');
    lines.push(`| ${new Date().toISOString().slice(0,10)} | 1.0 | Reverse-aligned architecture refresh | Orchestrator |`);
    lines.push('');
    // Introduction / Context
    const proj = analysis.pkg?.name ? ` for ${analysis.pkg.name}` : '';
    lines.push('## Introduction');
    lines.push(`This reverse-aligned architecture${proj} is generated from code evidence (files, package.json, CI). It aims to be accurate, stable, and free of assumptions.`);
    lines.push('');
    // High-Level Overview + Diagram
    lines.push('## High-Level Overview');
    lines.push('- tools/: CLI, orchestrator, builders, QA and gates');
    lines.push('- bmad-core/: agents, templates, utilities, workflows');
    lines.push('- scripts/: validation and preflight scripts');
    lines.push('- docs/: PRD, architecture, stories, guides');
    lines.push('- .github/workflows/: CI/CD pipelines');
    lines.push('- .ai/: reports, manifests, reverse analysis');
    lines.push('');
    lines.push('### System Diagram');
    lines.push('```mermaid');
    lines.push('graph TD');
    lines.push('  User[Developer/User] --> ORCH[Tools/Orchestrator CLI]');
    lines.push('  ORCH --> CORE[bmad-core utils/agents]');
    lines.push('  ORCH --> DOCS[docs/* PRD, Architecture, Stories]');
    lines.push('  ORCH --> SCRIPTS[scripts/* validators]');
    lines.push('  ORCH --> AI[.ai/* reports, manifests]');
    lines.push('  CI[.github/workflows] --> ORCH');
    lines.push('```');
    lines.push('');
    // Component Breakdown
    lines.push('## Component Breakdown');
    lines.push('- Orchestrator CLI: `tools/workflow-orchestrator.js` (also exposed as `bmad-orchestrator`)');
    lines.push('- Core Utilities and Agents: `bmad-core/*`');
    lines.push('- Validators and Gates: `tools/orchestrator/gates/*`, `tools/reference-checker/*`');
    lines.push('- QA and Reports: `.ai/reports/*`');
    lines.push('- Story Artifacts: `docs/stories/*` with embedded StoryContracts');
    lines.push('');
    // Tech Stack Table
    const deps = { ...(analysis.pkg?.dependencies || {}), ...(analysis.pkg?.devDependencies || {}) };
    const techEntries = [];
    const addTech = (category, tech, version, purpose) => techEntries.push({ category, tech, version, purpose });
    const versionOf = (name) => deps[name] || '—';
    if (Object.keys(deps).length) {
      addTech('Runtime', 'Node.js', analysis.pkg?.engines?.node || 'LTS', 'CLI tools, orchestrator, scripts');
      if (analysis.toolsDetected.commander) addTech('CLI', 'commander', versionOf('commander'), 'Command parsing');
      if (analysis.toolsDetected.inquirer) addTech('CLI', 'inquirer', versionOf('inquirer'), 'Interactive prompts');
      if (analysis.toolsDetected.chalk) addTech('CLI', 'chalk', versionOf('chalk'), 'Terminal styling');
      if (analysis.toolsDetected.ora) addTech('CLI', 'ora', versionOf('ora'), 'Spinners/progress');
      if (analysis.toolsDetected['js-yaml']) addTech('Parsing', 'js-yaml', versionOf('js-yaml'), 'YAML config');
      if (analysis.toolsDetected.jest) addTech('Testing', 'jest', versionOf('jest'), 'Unit tests');
      if (analysis.toolsDetected.eslint) addTech('Quality', 'eslint', versionOf('eslint'), 'Linting');
      if (analysis.toolsDetected.prettier) addTech('Quality', 'prettier', versionOf('prettier'), 'Formatting');
      if (analysis.toolsDetected.react) addTech('Frontend', 'react', versionOf('react') || versionOf('react-dom'), 'UI library');
      if (analysis.toolsDetected.next) addTech('Frontend', 'next', versionOf('next'), 'React framework');
      if (analysis.toolsDetected.vue) addTech('Frontend', 'vue', versionOf('vue'), 'UI framework');
      if (analysis.toolsDetected.angular) addTech('Frontend', 'angular', versionOf('@angular/core'), 'UI framework');
    }
    lines.push('## Tech Stack');
    if (techEntries.length) {
      lines.push('| Category | Technology | Version | Purpose |');
      lines.push('|---|---|---|---|');
      for (const e of techEntries) {
        lines.push(`| ${e.category} | ${e.tech} | ${e.version} | ${e.purpose} |`);
      }
    } else {
      lines.push('- Node.js-based toolchain with CLI orchestrator and validation scripts');
    }
    lines.push('');
    // Coding Standards and Source Tree sections to support sharding
    lines.push('## Coding Standards');
    lines.push('- See coding-standards.md for detailed conventions. This section summarizes key rules that influence architecture and code structure.');
    lines.push('- Prefer small modules, explicit artifacts, and low complexity functions.');
    lines.push('');
    lines.push('## Source Tree');
    lines.push('- High-level overview of directories and responsibilities. See source-tree.md for details.');
    lines.push('- tools/: CLI, orchestrator, gates, utilities');
    lines.push('- bmad-core/: agents, templates, utilities, structured tasks');
    lines.push('- scripts/: validation and preflight scripts');
    lines.push('- docs/: PRD, architecture, stories, guides');
    lines.push('');
    // Systems with Evidence
    lines.push('## Systems and Evidence');
    for (const f of analysis.features) {
      if (f.deprecated) continue;
      lines.push(`- ${f.name}: ${f.present ? 'present' : 'not found'}`);
      const ev = analysis.evidence[f.key] || [];
      if (ev.length) lines.push(`  - Evidence: ${ev.join(', ')}`);
    }
    lines.push('');
    // Data Flow (if detected)
    if (analysis.features.find(f => f.key === 'data_flow' && f.present)) {
      lines.push('## Data Flow');
      lines.push('- User invokes orchestrator CLI which coordinates analysis and document generation.');
      lines.push('- Outputs are written to docs/ (PRD, architecture, stories) and .ai/ (reports, manifest).');
      lines.push('- CI workflows invoke gates/validators to ensure alignment.');
      lines.push('');
    }
    // Error Handling (if detected)
    if (analysis.features.find(f => f.key === 'error_handling' && f.present)) {
      lines.push('## Error Handling');
      lines.push('- Orchestrator uses try/catch with atomic file updates (temp + backup) for safe writes.');
      lines.push('- Gate and validation steps fail-fast with clear console output and reports under .ai/reports.');
      lines.push('- Non-interactive modes provide defaults and degrade gracefully.');
      lines.push('');
    }
    // Observability (if detected)
    if (analysis.features.find(f => f.key === 'observability' && f.present)) {
      lines.push('## Observability');
      lines.push('- Verbose logger and memory health status provide runtime diagnostics.');
      lines.push('- Alignment and coverage reports emitted to .ai/reports for inspection.');
      lines.push('- Console summaries highlight key findings and recommendations.');
      lines.push('');
    }
    // Implementation Decisions & Deviations
    if (Array.isArray(analysis.decisions) && analysis.decisions.length) {
      lines.push('## Implementation Decisions & Deviations');
      const max = Math.min(10, analysis.decisions.length);
      for (let i = 0; i < max; i++) {
        const d = analysis.decisions[i];
        const who = d.agent || 'unknown-agent';
        const what = d.decision || d.action || 'decision';
        const why = d.rationale || d.reason || '';
        lines.push(`- [${who}] ${what}${why ? ' — ' + why : ''}`);
      }
      if (analysis.decisions.length > 10) lines.push(`- ... ${analysis.decisions.length - 10} more (see .ai/observations/)`);
      lines.push('');
    }
    // Patterns / Decisions
    lines.push('## Architectural Patterns & Decisions');
    lines.push('- CLI Orchestrator coordinates Dev↔QA workflows and epic loops');
    lines.push('- File-based working memory and artifacts (no external vector DB)');
    lines.push('- Documents-as-contracts: PRD, Architecture, Stories drive development');
    lines.push('');
    // Operations / Security / CI
    lines.push('## Operations & Quality');
    if (analysis.ciWorkflows?.length) lines.push(`- CI/CD: ${analysis.ciWorkflows.join(', ')}`);
    if (analysis.toolsDetected.jest) lines.push('- Testing: Jest configured for unit tests');
    if (analysis.toolsDetected.eslint) lines.push('- Linting: ESLint configured');
    if (analysis.toolsDetected.prettier) lines.push('- Formatting: Prettier configured');
    lines.push('- Validation: Reference checks, gates, and alignment reports generated under .ai/');
    lines.push('');
    lines.push('## Security & Compliance');
    const envFiles = ['.env', '.env.local', '.env.local.example'].filter(p => fs.existsSync(path.join(this.rootDir, p)));
    if (envFiles.length) lines.push(`- Environment files detected: ${envFiles.join(', ')}`);
    lines.push('- No external secret managers detected in dependencies.');
    lines.push('');
    lines.push('## Deprecated/Excluded');
    lines.push('- Qdrant integration is not used (file-based memory preferred)');

    await fs.promises.mkdir(path.dirname(archPath), { recursive: true });
    await fs.promises.writeFile(archPath, lines.join('\n'), 'utf8');

    // Ensure sharded architecture docs that Dev agent expects exist (can be minimal if not derivable from analysis)
    const ensureFile = async (p, content) => {
      if (!fs.existsSync(p)) {
        await fs.promises.writeFile(p, content.trim() + '\n', 'utf8');
      }
    };

    await ensureFile(codingStandardsPath, `# Coding Standards\n\nThis document captures coding conventions enforced in this repo.\n\n- Prefer small, single-responsibility modules.\n- Keep functions under the configured complexity thresholds.\n- Use explicit, auditable artifacts for workflows.\n`);
    await ensureFile(techStackPath, `# Tech Stack\n\n- Node.js (>=20)\n- Jest for testing\n- BMad Method core utilities under bmad-core/\n- Orchestrator and scripts under tools/\n`);
    await ensureFile(sourceTreePath, `# Source Tree\n\n- tools/: CLI, orchestrator, gates, utilities\n- bmad-core/: agents, templates, utilities, structured tasks\n- scripts/: validation and preflight scripts\n- docs/: PRD, architecture, stories, guides\n`);
    return archPath;
  }

  async updatePRDFromImplementation(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const prdPath = path.join(this.rootDir, 'docs', 'prd', 'PRD.md');
    const lines = [];
    lines.push('# Product Requirements Document (Reverse-Aligned)');
    lines.push('');
    lines.push('This PRD is generated from the current implementation to reflect what exists today. It is intended to realign documentation with code.');
    lines.push('');
    // Goals & Background
    lines.push('## Goals and Background');
    lines.push('- Keep documentation aligned with the actual implementation.');
    lines.push('- Provide a reliable baseline for planning and QA.');
    lines.push('- Reduce drift by grounding statements in repository evidence.');
    lines.push('');
    // Change Log (single entry)
    lines.push('## Change Log');
    lines.push('| Date | Version | Description | Author |');
    lines.push('|---|---|---|---|');
    lines.push(`| ${new Date().toISOString().slice(0,10)} | 1.0 | Reverse-aligned from implementation | Orchestrator |`);
    lines.push('');
    // Requirements
    lines.push('## Requirements');
    lines.push('');
    lines.push('### Functional (FR)');
    const implemented = analysis.features.filter(f => f.present && !f.deprecated);
    if (implemented.length) {
      let idx = 1;
      for (const f of implemented) {
        lines.push(`- FR${idx}: ${f.name} is present with supporting evidence.`);
        idx++;
      }
    } else {
      lines.push('- FR1: Reverse alignment pipeline is available.');
    }
    lines.push('');
    lines.push('### Non-Functional (NFR)');
    lines.push('- NFR1: CI workflows must pass on pushes and PRs.');
    if (analysis.toolsDetected.jest) lines.push('- NFR2: Unit tests (Jest) should be maintained and pass locally and in CI.');
    lines.push('- NFR3: Docs-code alignment and reference checks must succeed.');
    if (analysis.toolsDetected.eslint) lines.push('- NFR4: Codebase adheres to linting rules (ESLint).');
    if (analysis.toolsDetected.prettier) lines.push('- NFR5: Markdown and code formatting via Prettier.');
    lines.push('');
    // Technical Assumptions
    lines.push('## Technical Assumptions');
    const nodeEng = analysis.pkg?.engines?.node || 'Node.js (LTS)';
    lines.push(`- Runtime: ${nodeEng}`);
    lines.push('- Orchestration via CLI under tools/ with bmad-orchestrator alias.');
    lines.push(`- Repository Structure: ${analysis.repo.monorepo ? 'Monorepo (workspaces/packages detected)' : 'Single repository'}`);
    if (analysis.toolsDetected.react || analysis.toolsDetected.next || analysis.toolsDetected.vue || analysis.toolsDetected.angular) {
      lines.push('- UI Framework: Detected (see Architecture Tech Stack table).');
    } else {
      lines.push('- UI Framework: None detected in dependencies.');
    }
    lines.push('- File-based artifacts (stories, PRD, architecture, reports under .ai/).');
    lines.push('');
    // Implemented vs Out of Scope
    lines.push('## Implemented Features');
    for (const f of implemented) {
      lines.push(`- ${f.name}`);
    }
    lines.push('');
    const notPresent = analysis.features.filter(f => !f.present && !f.deprecated);
    lines.push('## Out of Scope / Not Implemented');
    if (notPresent.length) {
      for (const f of notPresent) lines.push(`- ${f.name}`);
    } else {
      lines.push('- None detected');
    }
    lines.push('');
    lines.push('## Removed/Deprecated');
    lines.push('- Qdrant integration and vector search are not part of this build');
    lines.push('');
    // Epics overview (coarse grouping)
    lines.push('## Epics Overview');
    lines.push('- Epic: Reverse Alignment Pipeline — Cleanup, analyze, rewrite docs, recreate stories, validate, manifest.');
    lines.push('- Epic: Validation & Reporting — Coverage, alignment report, gates.');
    lines.push('- Epic: Orchestrator UX — Developer CLI, non-interactive use, status.');
    lines.push('');
    // Epic summaries based on story files
    try {
      const summaries = await this.extractStorySummaries();
      if (summaries.total > 0) {
        lines.push('## Epic Summaries (from Implemented Stories)');
        for (const [epic, items] of Object.entries(summaries.perEpic)) {
          lines.push(`### Epic: ${epic}`);
          for (const s of items) {
            lines.push(`- [${s.title}](${s.path}) — Status: ${s.status || 'Unknown'}`);
          }
          lines.push('');
        }
      }
    } catch (_) {}
    lines.push('');
    // Acceptance Criteria
    lines.push('## Acceptance Criteria (System-Level)');
    lines.push('- CI workflows run and pass for pushes and PRs.');
    lines.push('- Orchestrator runs reverse alignment end-to-end without errors.');
    lines.push('- Docs and stories are consistent with code; validation reports show adequate coverage.');
    lines.push('');
    // Decisions & Deviations
    if (Array.isArray(analysis.decisions) && analysis.decisions.length) {
      lines.push('## Decisions & Deviations');
      const max = Math.min(10, analysis.decisions.length);
      for (let i = 0; i < max; i++) {
        const d = analysis.decisions[i];
        const what = d.decision || d.action || 'decision';
        const why = d.rationale || d.reason || '';
        lines.push(`- ${what}${why ? ' — ' + why : ''}`);
      }
      if (analysis.decisions.length > 10) lines.push(`- ... ${analysis.decisions.length - 10} more (see .ai/observations/)`);
      lines.push('');
    }

    await fs.promises.mkdir(path.dirname(prdPath), { recursive: true });
    await fs.promises.writeFile(prdPath, lines.join('\n'), 'utf8');
    return prdPath;
  }

  // Shard PRD and Architecture into component files when sharding is enabled in core-config.yaml
  async shardDocuments() {
    await this.initialize();
    await this.ensureDirs();
    const fsExtra = require('fs-extra');

    // Helper: split a markdown by H2 sections (## ) retaining titles
    const splitByH2 = (text) => {
      const lines = text.split('\n');
      const sections = [];
      let current = { title: 'Preamble', body: [] };
      for (const line of lines) {
        if (/^##\s+/.test(line)) {
          if (current.body.length) sections.push(current);
          current = { title: line.replace(/^##\s+/, '').trim(), body: [] };
        } else {
          current.body.push(line);
        }
      }
      if (current.body.length) sections.push(current);
      return sections;
    };

    // PRD sharding
    if (this.filePathResolver.isPRDSharded()) {
      try {
        const prdDir = this.filePathResolver.getPRDShardedLocation(false) || path.join(this.rootDir, 'docs', 'prd');
        await fsExtra.ensureDir(prdDir);
        const prdFile = path.join(this.rootDir, 'docs', 'prd', 'PRD.md');
        if (fs.existsSync(prdFile)) {
          const txt = fs.readFileSync(prdFile, 'utf8');
          const sections = splitByH2(txt);
          for (const sec of sections) {
            const safe = sec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const out = path.join(prdDir, `${safe || 'section'}.md`);
            const content = [`# ${sec.title}`, '', ...sec.body].join('\n').trim() + '\n';
            await fs.promises.writeFile(out, content, 'utf8');
          }
          // Write per-epic summaries under docs/prd/epics/
          const epicSummaries = await this.extractStorySummaries();
          const epicsDir = path.join(prdDir, 'epics');
          await fsExtra.ensureDir(epicsDir);
          for (const [epic, items] of Object.entries(epicSummaries.perEpic)) {
            const epicIdSafe = String(epic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
            const epicFile = path.join(epicsDir, `epic-${epicIdSafe}.md`);
            const lines = [];
            lines.push(`# Epic: ${epic}`);
            lines.push('');
            lines.push(`Last updated: ${new Date().toISOString()}`);
            lines.push('');
            lines.push('## Stories');
            for (const s of items) {
              lines.push(`- [${s.title}](${path.relative(epicsDir, path.join(this.rootDir, s.path)).replace(/\\/g, '/')}) — Status: ${s.status || 'Unknown'}`);
            }
            lines.push('');
            await fs.promises.writeFile(epicFile, lines.join('\n'), 'utf8');
          }
        }
      } catch (e) {
        this.logger.warn('PRD sharding failed', e);
      }
    }

    // Architecture sharding
    if (this.filePathResolver.isArchitectureSharded()) {
      try {
        const archDir = this.filePathResolver.getArchitectureShardedLocation(false) || path.join(this.rootDir, 'docs', 'architecture');
        await fsExtra.ensureDir(archDir);
        const archFile = path.join(this.rootDir, 'docs', 'architecture', 'architecture.md');
        if (fs.existsSync(archFile)) {
          const txt = fs.readFileSync(archFile, 'utf8');
          const sections = splitByH2(txt);
          for (const sec of sections) {
            const safe = sec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // Map some known sections to canonical filenames
            const canonical = {
              'change log': 'change-log',
              'introduction': 'introduction',
              'high-level-overview': 'high-level-overview',
              'component-breakdown': 'component-breakdown',
              'tech-stack': 'tech-stack',
              'coding-standards': 'coding-standards',
              'systems-and-evidence': 'systems-and-evidence',
              'source-tree': 'source-tree',
              'data-flow': 'data-flow',
              'error-handling': 'error-handling',
              'observability': 'observability',
              'architectural-patterns-decisions': 'patterns-and-decisions',
              'operations-quality': 'operations-and-quality',
              'security-compliance': 'security-and-compliance',
              'deprecated-excluded': 'deprecated'
            };
            const key = safe.replace(/\s+/g, '');
            const fname = canonical[key] || safe || 'section';
            const out = path.join(archDir, `${fname}.md`);
            const content = [`# ${sec.title}`, '', ...sec.body].join('\n').trim() + '\n';
            await fs.promises.writeFile(out, content, 'utf8');
          }
        }
      } catch (e) {
        this.logger.warn('Architecture sharding failed', e);
      }
    }

    return true;
  }

  async recreateStoriesFromCode(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    const fsExtra = require('fs-extra');
    await fsExtra.remove(storiesDir); // Start fresh
    await fsExtra.ensureDir(storiesDir);

    const implemented = analysis.features.filter(f => f.present && !f.deprecated);
    const epicNum = Number.isInteger(this.reverseEpicId) ? this.reverseEpicId : 99;
    let idx = 1;
    const created = [];
    for (const feat of implemented) {
      // Use the same deterministic structure as the SM template (story-tmpl.yaml)
      // Compose IDs and filenames consistent with SM naming: story-<EPIC>-<N>.md
      const seq = idx; // 1-based
      const storyId = `${epicNum}-${seq}`;
      const filename = `story-${storyId}.md`;
      const file = path.join(storiesDir, filename);

      const now = new Date().toISOString();
      const evidence = (analysis.evidence[feat.key] || []).map(p => `- References: ${p}`);

      // Build StoryContract populated from PRD/Architecture and implementation evidence
      const scObj = await this.buildStoryContractFromDocsAndEvidence(analysis, feat, storyId, String(epicNum));
      const header = '---\n' + require('js-yaml').dump({ StoryContract: scObj }, { noRefs: true }).trimEnd() + '\n---\n\n';

      // SM-format body (aligned with story-tmpl.yaml structure)
      const acLines = Array.isArray(scObj.acceptanceCriteriaLinks) && scObj.acceptanceCriteriaLinks.length
        ? scObj.acceptanceCriteriaLinks.map((ac, i) => `${i + 1}. ${ac}`)
        : ['- Define at least 3 ACs.'];

      const filesToModifyLines = Array.isArray(scObj.filesToModify) && scObj.filesToModify.length
        ? scObj.filesToModify.map(f => `- \`${f.path}\`: ${f.reason || 'Modification required'}`)
        : ['- N/A'];

      const body = [
        `# Story ${storyId}: ${feat.name}`,
        '',
        '## Status',
        'Implemented',
        '',
        '## Priority',
        'Medium',
        '',
        '## Story',
        `As a maintainer, I want ${feat.name.toLowerCase()} so that documentation and implementation stay aligned.`,
        '',
        '## Context',
        'Reverse-aligned from repository evidence; not user-elicited.',
        '',
        '## Acceptance Criteria',
        ...acLines,
        '',
        '## Technical Requirements',
        '### Dependencies',
        '- package: bmad-method (runtime & orchestrator)',
        '',
        '### Performance Criteria',
        '- Define expected performance targets if applicable',
        '',
        '### Security Requirements',
        '- Note authentication/authorization implications if any',
        '',
        '## Implementation Plan',
        '### Files to Create',
        '- N/A',
        '',
        '### Files to Modify',
        ...filesToModifyLines,
        '',
        '### Test Requirements',
        '- Unit: Validate story references resolve',
        '- Integration: Validate docs-code coverage includes feature name',
        '',
        '## Risk Assessment',
        '**Risk Level**: Low',
        '',
        '### Identified Risks',
        '- Drift between implementation and docs if reverse-align not run regularly',
        '',
        '### Rollback Plan',
        'Re-run reverse-align and restore doc versions from VCS if needed.',
        '',
        '## Definition of Done',
        '- [ ] ACs pass',
        '- [ ] QA checks pass',
        '',
        '## Traceability',
        `- Epic: ${epicNum}`,
        '- Architecture: docs/architecture/architecture.md',
        '- PRD: docs/prd/PRD.md',
        '',
        '## Generation Metadata',
        '- Template Version: 1.0',
        `- Generated At: ${now}`,
        '- Generated By: orchestrator.reverse-align',
        '',
        '## Implementation Details',
        ...evidence,
        '',
        '## QA Findings',
        '_No findings yet_'
      ].join('\n');

      const content = header + body + '\n';
      await fs.promises.writeFile(file, content, 'utf8');
      created.push(file);
      idx++;
    }
    return created;
  }

  /**
   * Generate story candidates non-destructively, capped and with optional ignore list.
   * - Reads optional .ai/story-ignore.json (array of feature keys or names to skip)
   * - Skips creating a file if it already exists
   * - Writes/updates docs/stories/index.md
   */
  async generateStoryCandidates(analysis, options = { cap: 10, dryRun: false }) {
    await this.initialize();
    const fsExtra = require('fs-extra');
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    await fsExtra.ensureDir(storiesDir);

    // Load ignore list
    let ignore = new Set();
    try {
      const ignorePath = path.join(this.rootDir, '.ai', 'story-ignore.json');
      if (fs.existsSync(ignorePath)) {
        const arr = JSON.parse(fs.readFileSync(ignorePath, 'utf8'));
        if (Array.isArray(arr)) ignore = new Set(arr.map(x => String(x).toLowerCase()));
      }
    } catch (_) {}

    // Load critical allowlist for ranking
    let critical = new Set();
    try {
      const critPath = path.join(this.rootDir, '.ai', 'critical-entities.json');
      if (fs.existsSync(critPath)) {
        const arr = JSON.parse(fs.readFileSync(critPath, 'utf8'));
        if (Array.isArray(arr)) critical = new Set(arr.map(x => String(x).toLowerCase()));
      }
    } catch (_) {}

    // Build simple impact score from relations and evidence
    const degreeByPath = new Map();
    try {
      const ents = Array.isArray(analysis.entities) ? analysis.entities : [];
      const rels = Array.isArray(analysis.relations) ? analysis.relations : [];
      const idToPaths = new Map();
      for (const e of ents) {
        const paths = (e.sourcePaths || []).map(p => String(p));
        idToPaths.set(e.id, paths);
      }
      const bump = (p, n = 1) => {
        const k = String(p).toLowerCase();
        degreeByPath.set(k, (degreeByPath.get(k) || 0) + n);
      };
      for (const r of rels) {
        const fromPaths = idToPaths.get(r.fromId) || [];
        const toPaths = idToPaths.get(r.toId) || [];
        fromPaths.forEach(p => bump(p, 1));
        toPaths.forEach(p => bump(p, 1));
      }
    } catch (_) {}

    // Read existing stories to dedupe candidates by feature name/key
    const existingFeatureRefs = new Set();
    try {
      const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        try {
          const t = fs.readFileSync(path.join(storiesDir, f), 'utf8');
          // Title-based capture: '# Story X: <Name>'
          const title = (t.match(/^#\s+Story[^:]*:\s*(.+)$/m) || [])[1];
          if (title) existingFeatureRefs.add(title.toLowerCase());
          // Frontmatter StoryContract name-like fields
          const fm = t.match(/^---\n([\s\S]*?)\n---/m);
          if (fm) {
            const y = require('js-yaml').load(fm[1]) || {};
            const sc = y.StoryContract || {};
            const links = [];
            (sc.apiEndpoints || []).forEach(x => links.push(String(x)));
            (sc.filesToModify || []).forEach(x => links.push(String(x)));
            links.forEach(v => existingFeatureRefs.add(v.toLowerCase()));
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Derive docs coverage and missing mentions
    let coverage = null;
    try { coverage = await this.qaValidateDocsCodeAlignment(analysis); } catch (_) { coverage = null; }
    const missingNames = new Set(Array.isArray(coverage?.missing) ? coverage.missing.map(x => String(x).toLowerCase()) : []);

    // Candidate entities: active and either missing in docs or with zero tests
    const entities = Array.isArray(analysis.entities) ? analysis.entities : [];
    const active = entities.filter(e => (e.lifecycle || 'active') === 'active');
    const candEntities = active.filter(e => {
      const nameLc = String(e.name || e.id || '').toLowerCase();
      const idLc = String(e.id || '').toLowerCase();
      const hasNoTests = !(Array.isArray(e.tests) && e.tests.length);
      const missingInDocs = missingNames.has(nameLc) || missingNames.has(idLc);
      if (ignore.has(nameLc) || ignore.has(idLc)) return false;
      // Reduce noise: prefer API/route/model entities; allow modules only when both gaps present
      const preferredType = ['api','route','model'].includes(e.type);
      return missingInDocs || hasNoTests || (e.type === 'module' && hasNoTests && missingInDocs && !preferredType);
    });
    // Rank by critical-first, then impact (degree + evidence), then type, then name
    const typeScore = (t) => (t === 'api' ? 3 : t === 'route' ? 2 : t === 'model' ? 1 : 0);
    const scoreOfEnt = (e) => {
      const nameLc = String(e.name || e.id || '').toLowerCase();
      const idLc = String(e.id || '').toLowerCase();
      const isCritical = critical.has(nameLc) || critical.has(idLc);
      const evFiles = Array.isArray(e.evidence) ? e.evidence.map(x => String(x.file || x).toLowerCase()) : (Array.isArray(e.sourcePaths) ? e.sourcePaths.map(String) : []);
      const evCount = evFiles.length;
      let degree = 0; for (const p of evFiles) degree += (degreeByPath.get(p) || 0);
      return (isCritical ? 1000 : 0) + typeScore(e.type) * 100 + evCount * 10 + degree;
    };
    candEntities.sort((a, b) => {
      const sa = scoreOfEnt(a), sb = scoreOfEnt(b);
      if (sa !== sb) return sb - sa;
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
    const cap = Math.max(1, Number(options.cap) || 10);
    const picked = candEntities.slice(0, cap);

    const created = [];
    let seq = 1;
    const epicNum = Number.isInteger(this.reverseEpicId) ? this.reverseEpicId : 99;
    for (const ent of picked) {
      const storyId = `${epicNum}-${seq}`;
      const filename = `story-${storyId}.md`;
      const file = path.join(storiesDir, filename);
      if (fs.existsSync(file)) { seq++; continue; }

      const feat = { key: ent.id, name: ent.name || ent.id };
      const refs = [];
      const evList = Array.isArray(ent.evidence) ? ent.evidence.map(x => x.file).filter(Boolean) : [];
      const sp = Array.isArray(ent.sourcePaths) ? ent.sourcePaths : [];
      for (const p of [...new Set([...evList, ...sp])]) refs.push(`- References: ${p}`);
      const scObj = await this.buildStoryContractFromDocsAndEvidence(analysis, feat, storyId, String(epicNum));
      const header = '---\n' + require('js-yaml').dump({ StoryContract: scObj }, { noRefs: true }).trimEnd() + '\n---\n\n';
      const body = [
        `# Story ${storyId}: ${feat.name}`,
        '',
        '## Status',
        'Draft',
        '',
        '## Story',
        `As a maintainer, I want to align docs and tests for ${feat.name} so that they reflect implementation.`,
        '',
        '## Implementation Details',
        ...refs,
        ''
      ].join('\n');
      if (!options.dryRun) {
        await fs.promises.writeFile(file, header + body + '\n', 'utf8');
      }
      created.push(path.relative(this.rootDir, file));
      seq++;
    }

    // Update index
    try {
      const indexPath = path.join(storiesDir, 'index.md');
      const lines = [];
      lines.push('# Stories Index (Generated)');
      lines.push('');
      lines.push(`Updated: ${new Date().toISOString()}`);
      lines.push('');
      if (created.length) {
        lines.push('## New Story Candidates');
        for (const f of created) lines.push(`- ${f}`);
      } else {
        lines.push('No new story candidates created.');
      }
      if (!options.dryRun) {
        await fs.promises.writeFile(indexPath, lines.join('\n') + '\n', 'utf8');
      }
    } catch (_) {}

    return created;
  }

  // Simple quality gate: coverage threshold and optional delta-only check.
  async simpleQualityGate(threshold = 0.85, deltaOnly = false, options = { criticalOnly: false, criticalPath: null, baselineRef: null }) {
    await this.initialize();
    const analysis = await this.analyzeImplementation();
    const coverage = await this.qaValidateDocsCodeAlignment(analysis);
    const total = coverage.total ?? coverage.totalFeatures ?? 0;
    const ratio = total > 0 ? (coverage.mentioned / total) : 1;
    const missing = total - coverage.mentioned;

    const checks = [];
    if (!options.criticalOnly) {
      checks.push({ name: `Coverage >= ${threshold}`, ok: ratio >= threshold, details: `${coverage.mentioned}/${total}` });
    }

    let advisory = false;
    if (!options.criticalOnly && deltaOnly) {
      const fsExtra = require('fs-extra');
      const baselinePath = path.join(this.reportsDir, 'coverage-baseline.json');
      let baseMissing = null;
      try {
        if (fs.existsSync(baselinePath)) {
          const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
          baseMissing = typeof base.missing === 'number' ? base.missing : (typeof base.total === 'number' && typeof base.mentioned === 'number' ? (base.total - base.mentioned) : null);
        }
      } catch (_) {}
      // Optional: compute baseline from git ref if provided
      if (baseMissing === null && options.baselineRef) {
        try {
          const { execSync } = require('child_process');
          const show = (p) => {
            try { return execSync(`git show ${options.baselineRef}:"${p}"`, { cwd: this.rootDir, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }); } catch { return ''; }
          };
          const docs = [
            'docs/architecture/architecture.md',
            'docs/prd/PRD.md',
            'docs/brief.md',
            'docs/architecture.generated/architecture.generated.md',
            'docs/prd.generated/PRD.generated.md'
          ];
          let docsText = '';
          for (const d of docs) docsText += '\n' + show(d).toLowerCase();
          const implemented = (analysis.entities || []).filter(e => (e.lifecycle || 'active') === 'active');
          const mentioned = implemented.filter(e => docsText.includes(String(e.name || e.id || '').toLowerCase())).length;
          baseMissing = Math.max(0, implemented.length - mentioned);
        } catch (_) {}
      }
      if (baseMissing !== null) {
        const ok = missing <= baseMissing;
        checks.push({ name: 'Delta-only drift (missing not increased)', ok, details: `current ${missing} vs base ${baseMissing}` });
      } else {
        checks.push({ name: 'Delta-only baseline not found (advisory)', ok: true });
        advisory = true;
      }
      // Always write current snapshot for future comparisons
      try { await fsExtra.writeJson(baselinePath, { missing, total, mentioned: coverage.mentioned, generatedAt: new Date().toISOString() }, { spaces: 2 }); } catch (_) {}
    }

    // Critical allowlist enforcement
    let missingCritical = [];
    try {
      const fsExtra = require('fs-extra');
      const criticalPath = options.criticalPath || path.join(this.rootDir, '.ai', 'critical-entities.json');
      if (fs.existsSync(criticalPath)) {
        const raw = JSON.parse(fs.readFileSync(criticalPath, 'utf8'));
        const list = Array.isArray(raw) ? raw.map(x => String(x).toLowerCase()) : [];
        if (list.length) {
          // Build combined doc text (include both authored and generated docs if present)
          const docs = [
            path.join(this.rootDir, 'docs', 'architecture', 'architecture.md'),
            path.join(this.rootDir, 'docs', 'prd', 'PRD.md'),
            path.join(this.rootDir, 'docs', 'brief.md'),
            path.join(this.rootDir, 'docs', 'architecture.generated', 'architecture.generated.md'),
            path.join(this.rootDir, 'docs', 'prd.generated', 'PRD.generated.md')
          ];
          let docsText = '';
          for (const d of docs) {
            if (fs.existsSync(d)) {
              try { docsText += '\n' + fs.readFileSync(d, 'utf8').toLowerCase(); } catch (_) {}
            }
          }
          // Only consider active features for enforcement
          const implemented = (analysis.features || []).filter(f => f.present && !f.deprecated && f.lifecycle !== 'unused' && f.lifecycle !== 'deprecated');
          const isMentioned = (name) => docsText.includes((name || '').toLowerCase());
          for (const f of implemented) {
            const keyLc = String(f.key || '').toLowerCase();
            const nameLc = String(f.name || '').toLowerCase();
            if (list.includes(keyLc) || list.includes(nameLc)) {
              if (!isMentioned(f.name)) missingCritical.push(f.name || f.key || '(unknown)');
            }
          }
        }
      }
    } catch (_) {}

    if (missingCritical.length) {
      checks.push({ name: 'Critical allowlist covered', ok: false, details: missingCritical.join(', ') });
    } else {
      // Only add the check row when list present or criticalOnly
      const criticalPath = options.criticalPath || path.join(this.rootDir, '.ai', 'critical-entities.json');
      if (options.criticalOnly || fs.existsSync(criticalPath)) {
        checks.push({ name: 'Critical allowlist covered', ok: true, details: 'OK' });
      }
    }

    // Pass logic: if criticalOnly, only consider the critical check(s)
    const pass = options.criticalOnly ? checks.filter(c => /Critical allowlist/.test(c.name)).every(c => c.ok) : checks.every(c => c.ok);
    await require('fs-extra').writeJson(path.join(this.reportsDir, 'simple-quality-gate.json'), { pass, ratio, missing, total, checks, missingCritical, advisory }, { spaces: 2 });
    return { pass, ratio, missing, total, checks, missingCritical, advisory };
  }

  /**
   * Extract acceptance criteria and architecture data to populate StoryContract fields.
   */
  async buildStoryContractFromDocsAndEvidence(analysis, feature, storyId, epicId) {
    const prdPath = path.join(this.rootDir, 'docs', 'prd', 'PRD.md');
    const prdShardDir = path.join(this.rootDir, 'docs', 'prd');
    const archPath = path.join(this.rootDir, 'docs', 'architecture', 'architecture.md');
    const yaml = require('js-yaml');
    const sc = {
      version: '1.0',
      schemaVersion: '1.0',
      story_id: storyId || 'TBD',
      epic_id: epicId || '0',
      preConditions: [],
      postConditions: [],
      apiEndpoints: [],
      filesToModify: [],
      acceptanceCriteriaLinks: [],
      impactRadius: { components: [], symbols: [], breakageBudget: { allowedInterfaceChanges: false, migrationNotes: '', maxFilesAffected: 20 } },
      cleanupRequired: { removeUnused: true, deprecations: [], notes: [] },
      qualityGates: { typeErrors: 0, zeroUnused: true, coverageDeltaMax: 0.5, runImpactScan: true },
      linkedArtifacts: []
    };

    // Link artifacts
    if (fs.existsSync(prdPath)) sc.linkedArtifacts.push({ type: 'prd', path: 'docs/prd/PRD.md', version: '1.0' });
    if (fs.existsSync(archPath)) sc.linkedArtifacts.push({ type: 'architecture', path: 'docs/architecture/architecture.md', version: '1.0' });

    // Parse PRD frontmatter for acceptanceCriteria
    try {
      if (fs.existsSync(prdPath)) {
        const txt = fs.readFileSync(prdPath, 'utf8');
        const fm = txt.match(/^---\n([\s\S]*?)\n---/m);
        let candidates = [];
        if (fm) {
          const obj = yaml.load(fm[1]) || {};
          const acl = Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : [];
          candidates.push(...acl.map(a => `${a.id || 'AC'}: ${a.criteria || ''}`).filter(Boolean));
        }
        // Also gather body Acceptance Criteria list items (tolerate suffixes like '(System-Level)')
        const acBody = this.extractAcceptanceCriteriaFromText(txt);
        candidates.push(...acBody);
        // If PRD is sharded, scan all markdown files under docs/prd recursively as fallback
        if (fs.existsSync(prdShardDir)) {
          const files = this.walkMarkdownFiles(prdShardDir);
          for (const p of files) {
            try {
              const t = fs.readFileSync(p, 'utf8');
              const ac = this.extractAcceptanceCriteriaFromText(t);
              candidates.push(...ac);
            } catch (_) {}
          }
        }
        // Filter candidates to those relevant to this feature name; avoid cloning same ACs to all stories
        const fName = (feature?.name || '').toLowerCase();
        const tokens = fName.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
        const filtered = tokens.length
          ? candidates.filter(c => {
              const lc = (c || '').toLowerCase();
              return tokens.some(t => lc.includes(t));
            })
          : [];
        sc.acceptanceCriteriaLinks = [...new Set(filtered)].slice(0, 10);
      }
    } catch (_) {}

    // Parse Architecture for endpoints and components
    try {
      if (fs.existsSync(archPath)) {
        const atxt = fs.readFileSync(archPath, 'utf8');
        const lines = atxt.split('\n');
        const endpoints = [];
        for (const l of lines) {
          const m = l.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w\-\/:{}]+/i);
          if (m) endpoints.push(m[0]);
        }
        sc.apiEndpoints = [...new Set(endpoints)].slice(0, 20);

        // Components from Component Breakdown bullets
        const compSec = atxt.split(/\n##\s+Component Breakdown\s*\n/i)[1] || '';
        const comps = compSec.split('\n').filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, '').split(':')[0].trim());
        sc.impactRadius.components = [...new Set(comps)].slice(0, 20);
      }
    } catch (_) {}

    // Use analysis evidence to fill filesToModify and components
    const evidence = analysis?.evidence?.[feature.key] || [];
    for (const p of evidence) {
      sc.filesToModify.push({ path: p, reason: `Touchpoint for feature: ${feature.name}` });
      const top = p.split('/')[0];
      if (top && !sc.impactRadius.components.includes(top)) sc.impactRadius.components.push(top);
    }

    // Pre/Post conditions derived from repo state
    if (analysis?.features?.find(f => f.key === 'ci_cd' && f.present)) sc.preConditions.push('CI workflows configured');
    sc.preConditions.push('PRD and Architecture present');
    sc.postConditions.push(`Docs mention feature '${feature.name}'`);
    sc.postConditions.push('Coverage gate passes');

    return sc;
  }

  // Utility: recursively collect markdown files
  walkMarkdownFiles(dir) {
    const out = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...this.walkMarkdownFiles(full));
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full);
    }
    return out;
  }

  // Utility: extract AC bullets or enumerated items from a markdown text under an Acceptance Criteria section
  extractAcceptanceCriteriaFromText(txt) {
    const m = txt.match(/\n##\s+Acceptance Criteria[^\n]*\n([\s\S]*?)(\n##\s+|\n#\s+|\n$)/i);
    if (!m) return [];
    const block = m[1] || '';
    const lines = block.split('\n');
    const items = [];
    for (const line of lines) {
      const bullet = line.match(/^\s*-\s+(.+)/);
      const enumd = line.match(/^\s*(\d+)\.\s+(.+)/);
      if (bullet) items.push(bullet[1].trim());
      else if (enumd) items.push(enumd[2].trim());
    }
    return items.map((t, i) => `AC-${i + 1}: ${t}`);
  }

  /**
   * Validate that stories follow the canonical SM story template structure
   */
  async reviewStoriesAgainstTemplate() {
    await this.initialize();
    await this.ensureDirs();
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    const result = { checked: 0, compliant: 0, nonCompliant: 0, issues: [] };
    if (!fs.existsSync(storiesDir)) return result;
    const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md'));

    const requiredSections = [
      /^#\s+Story\s+.+?:\s+.+/m, // Title with Story ID and title
      /^##\s+Status\s*$/m,
      /^##\s+Priority\s*$/m,
      /^##\s+Story\s*$/m,
      /^##\s+Context\s*$/m,
      /^##\s+Acceptance Criteria\s*$/m,
      /^##\s+Technical Requirements\s*$/m,
      /^###\s+Dependencies\s*$/m,
      /^###\s+Performance Criteria\s*$/m,
      /^###\s+Security Requirements\s*$/m,
      /^##\s+Implementation Plan\s*$/m,
      /^###\s+Files to Create\s*$/m,
      /^###\s+Files to Modify\s*$/m,
      /^###\s+Test Requirements\s*$/m,
      /^##\s+Risk Assessment\s*$/m,
      /^###\s+Identified Risks\s*$/m,
      /^###\s+Rollback Plan\s*$/m,
      /^##\s+Definition of Done\s*$/m,
      /^##\s+Traceability\s*$/m,
      /^##\s+Generation Metadata\s*$/m,
      /^##\s+Implementation Details\s*$/m,
      /^##\s+QA Findings\s*$/m
    ];

    for (const f of files) {
      const full = path.join(storiesDir, f);
      const content = fs.readFileSync(full, 'utf8');
      result.checked++;

      // Check StoryContract YAML frontmatter presence with required keys
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/m);
      const fmIssues = [];
      let hasFrontmatter = false;
      if (fmMatch) {
        try {
          const obj = yaml.load(fmMatch[1]);
          hasFrontmatter = !!(obj && obj.StoryContract);
          if (!hasFrontmatter) fmIssues.push('Missing StoryContract in frontmatter');
          const sc = obj?.StoryContract || {};
          ['version', 'story_id', 'epic_id'].forEach(k => { if (!sc[k]) fmIssues.push(`StoryContract.${k} missing`); });
        } catch (e) {
          fmIssues.push('Invalid YAML frontmatter');
        }
      } else {
        fmIssues.push('Missing YAML frontmatter');
      }

      // Check required sections exist
      const missingSections = requiredSections.filter(re => !re.test(content)).map(re => re.toString());

      if (fmIssues.length === 0 && missingSections.length === 0) {
        result.compliant++;
      } else {
        result.nonCompliant++;
        result.issues.push({ file: full, frontmatter: fmIssues, missingSections });
      }
    }

    return result;
  }

  /**
   * Normalize a single story to conform to the SM template structure
   * - Ensures YAML frontmatter with StoryContract and required keys
   * - Ensures all required sections exist; appends missing ones with placeholders
   */
  async normalizeStoryFile(filePath, options = { dryRun: false, analysis: null }) {
    const content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    let body = content;

    // Extract or create frontmatter
    let fmMatch = body.match(/^---\n([\s\S]*?)\n---\n?/m);
    let front = null;
    if (fmMatch) {
      try {
        front = yaml.load(fmMatch[1]) || {};
      } catch (_) {
        front = {};
      }
    } else {
      front = {};
    }

    // Ensure StoryContract with required keys
    front = front || {};
    if (!front.StoryContract) {
      front.StoryContract = {};
      changed = true;
    }
    const sc = front.StoryContract;
    // Derive ids from filename if missing
    const fname = path.basename(filePath);
    const storyIdFromName = (() => {
      const a = fname.match(/^story-(\d+)-(\d+)\.md$/i);
      if (a) return `${a[1]}-${a[2]}`;
      const b = fname.match(/^(\d+)\.(\d+)\.story\.md$/i);
      if (b) return `${b[1]}-${parseInt(b[2], 10)}\n`;
      const c = fname.match(/^story-(\d+)\.md$/i);
      if (c) return `${c[1]}`;
      return null;
    })();
    const epicFromStoryId = (id) => id && String(id).split('-')[0];
    if (!sc.version) { sc.version = '1.0'; changed = true; }
    if (!sc.story_id || sc.story_id === 'TBD') { sc.story_id = storyIdFromName || 'TBD'; changed = true; }
    if (!sc.epic_id || sc.epic_id === 'TBD') { sc.epic_id = epicFromStoryId(sc.story_id) || '0'; changed = true; }
    // Fill standard blocks if missing
    sc.preConditions = Array.isArray(sc.preConditions) ? sc.preConditions : []; if (!Array.isArray(sc.preConditions)) changed = true;
    sc.postConditions = Array.isArray(sc.postConditions) ? sc.postConditions : []; if (!Array.isArray(sc.postConditions)) changed = true;
    sc.apiEndpoints = Array.isArray(sc.apiEndpoints) ? sc.apiEndpoints : []; if (!Array.isArray(sc.apiEndpoints)) changed = true;
    sc.filesToModify = Array.isArray(sc.filesToModify) ? sc.filesToModify : []; if (!Array.isArray(sc.filesToModify)) changed = true;
    sc.acceptanceCriteriaLinks = Array.isArray(sc.acceptanceCriteriaLinks) ? sc.acceptanceCriteriaLinks : []; if (!Array.isArray(sc.acceptanceCriteriaLinks)) changed = true;
    sc.impactRadius = sc.impactRadius || { components: [], symbols: [], breakageBudget: { allowedInterfaceChanges: false, migrationNotes: '', maxFilesAffected: 20 } }; changed = true;
    sc.cleanupRequired = sc.cleanupRequired || { removeUnused: true, deprecations: [], notes: [] }; changed = true;
    sc.qualityGates = sc.qualityGates || { typeErrors: 0, zeroUnused: true, coverageDeltaMax: 0.5, runImpactScan: true }; changed = true;
    sc.linkedArtifacts = Array.isArray(sc.linkedArtifacts) ? sc.linkedArtifacts : []; changed = true;

    // Ensure linked artifacts for PRD and Architecture
    const ensureArtifact = (type, pth) => {
      if (!fs.existsSync(path.join(this.rootDir, pth))) return;
      if (!sc.linkedArtifacts.find(a => a && a.type === type)) {
        sc.linkedArtifacts.push({ type, path: pth, version: '1.0' });
        changed = true;
      }
    };
    ensureArtifact('prd', 'docs/prd/PRD.md');
    ensureArtifact('architecture', 'docs/architecture/architecture.md');

    // Attempt to enrich StoryContract from docs/evidence if still sparse
    try {
      // Prefer provided analysis; otherwise load or compute it once
      let analysis = options.analysis;
      if (!analysis) {
        const analysisPath = path.join(this.rootDir, '.ai', 'reverse', 'analysis.json');
        analysis = fs.existsSync(analysisPath)
          ? JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
          : await this.analyzeImplementation();
      }
      // Try to match story to a known feature by name similarity
      const titleMatch = body.match(/^#\s+Story\s+.*?:\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath, '.md');
      const tokens = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      let best = null;
      let bestScore = 0;
      for (const f of (analysis.features || [])) {
        const nameTokens = (f.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const score = tokens.filter(t => nameTokens.includes(t)).length;
        if (score > bestScore) { bestScore = score; best = f; }
      }
      const featureForEnrich = bestScore > 0 ? best : { key: title.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: title };
      const enriched = await this.buildStoryContractFromDocsAndEvidence(analysis, featureForEnrich, sc.story_id, sc.epic_id);
      // Only merge fields that are empty/sparse
      const mergeArray = (dst, src) => (dst && dst.length ? dst : src || []);
      sc.acceptanceCriteriaLinks = mergeArray(sc.acceptanceCriteriaLinks, enriched.acceptanceCriteriaLinks);
      sc.apiEndpoints = mergeArray(sc.apiEndpoints, enriched.apiEndpoints);
      sc.filesToModify = mergeArray(sc.filesToModify, enriched.filesToModify);
      sc.impactRadius = sc.impactRadius || enriched.impactRadius; if (!sc.impactRadius) changed = true;
      if (!Array.isArray(sc.preConditions) || sc.preConditions.length === 0) sc.preConditions = enriched.preConditions;
      if (!Array.isArray(sc.postConditions) || sc.postConditions.length === 0) sc.postConditions = enriched.postConditions;
      if (!Array.isArray(sc.linkedArtifacts) || sc.linkedArtifacts.length === 0) sc.linkedArtifacts = enriched.linkedArtifacts;
      changed = true;
    } catch (_) {}

    // Rebuild frontmatter text
    const newFront = '---\n' + yaml.dump(front, { noRefs: true }).trimEnd() + '\n---\n';
    if (fmMatch) {
      body = body.replace(/^---\n([\s\S]*?)\n---\n?/m, newFront);
    } else {
      body = newFront + body;
    }

    // Ensure required sections exist
    const ensureSection = (re, insertText) => {
      if (!re.test(body)) {
        body = body.trimEnd() + '\n\n' + insertText + '\n';
        changed = true;
      }
    };
    const scId = sc.story_id || storyIdFromName || 'TBD';
    // Title with ID and feature name if possible
    const titleRe = /^#\s+Story\s+.+?:\s+.+/m;
    if (!titleRe.test(body)) {
      ensureSection(/\A\z/, `# Story ${scId}: Title`);
    }
    ensureSection(/^##\s+Status\s*$/m, '## Status\nDraft');
    ensureSection(/^##\s+Priority\s*$/m, '## Priority\nMedium');
    ensureSection(/^##\s+Story\s*$/m, '## Story\nAs a user, I want ..., so that ...');
    ensureSection(/^##\s+Context\s*$/m, '## Context\nAdd relevant background and constraints.');
    ensureSection(/^##\s+Acceptance Criteria\s*$/m, '## Acceptance Criteria\n1. Criterion one\n2. Criterion two\n3. Criterion three');
    ensureSection(/^##\s+Technical Requirements\s*$/m, '## Technical Requirements');
    ensureSection(/^###\s+Dependencies\s*$/m, '### Dependencies\n- package: <name>');
    ensureSection(/^###\s+Performance Criteria\s*$/m, '### Performance Criteria\n- Define expected performance targets');
    ensureSection(/^###\s+Security Requirements\s*$/m, '### Security Requirements\n- Note authentication/authorization implications');
    ensureSection(/^##\s+Implementation Plan\s*$/m, '## Implementation Plan');
    ensureSection(/^###\s+Files to Create\s*$/m, '### Files to Create\n- N/A');
    ensureSection(/^###\s+Files to Modify\s*$/m, '### Files to Modify\n- N/A');
    ensureSection(/^###\s+Test Requirements\s*$/m, '### Test Requirements\n- Unit: ...\n- Integration: ...');
    ensureSection(/^##\s+Risk Assessment\s*$/m, '## Risk Assessment\n**Risk Level**: Low');
    ensureSection(/^###\s+Identified Risks\s*$/m, '### Identified Risks\n- Describe risks and mitigations');
    ensureSection(/^###\s+Rollback Plan\s*$/m, '### Rollback Plan\nDescribe rollback strategy');
    ensureSection(/^##\s+Definition of Done\s*$/m, '## Definition of Done\n- [ ] ACs pass\n- [ ] QA checks pass');
    ensureSection(/^##\s+Traceability\s*$/m, '## Traceability\n- Epic: ' + (sc.epic_id || '0') + '\n- Architecture: docs/architecture/architecture.md\n- PRD: docs/prd/PRD.md');
    ensureSection(/^##\s+Generation Metadata\s*$/m, '## Generation Metadata\n- Template Version: 1.0\n- Normalized At: ' + new Date().toISOString());
    ensureSection(/^##\s+Implementation Details\s*$/m, '## Implementation Details\n- Add references and notes as work progresses');
    ensureSection(/^##\s+QA Findings\s*$/m, '## QA Findings\n_No findings yet_');

    if (!options.dryRun && changed) {
      fs.writeFileSync(filePath, body, 'utf8');
    }
    return { file: filePath, changed };
  }

  /**
   * Normalize all stories under docs/stories to match SM template
   */
  async normalizeStoriesAgainstTemplate(options = { dryRun: false, file: null }) {
    await this.initialize();
    await this.ensureDirs();
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    const result = { processed: 0, changed: 0, details: [] };
    if (!fs.existsSync(storiesDir)) return result;
    const targets = options.file ? [options.file] : fs.readdirSync(storiesDir).filter(f => f.endsWith('.md')).map(f => path.join(storiesDir, f));
    // Compute analysis once for enrichment
    let analysis = null;
    try { analysis = await this.analyzeImplementation(); } catch (_) { analysis = null; }
    for (const full of targets) {
      const res = await this.normalizeStoryFile(full, { dryRun: !!options.dryRun, analysis });
      result.processed++;
      if (res.changed) result.changed++;
      result.details.push(res);
    }
    return result;
  }

  async validateStoryConsistency(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    const result = { checked: 0, valid: 0, issues: [] };
    if (!fs.existsSync(storiesDir)) return result;
    const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const full = path.join(storiesDir, f);
      const content = fs.readFileSync(full, 'utf8');
      result.checked++;
      // Check each referenced path (very basic: lines starting with '- References: ')
      const refLines = content.split('\n').filter(l => l.startsWith('- References: '));
      let ok = true;
      for (const rl of refLines) {
        const rel = rl.replace('- References: ', '').trim();
        if (!fs.existsSync(path.join(this.rootDir, rel))) {
          ok = false;
          result.issues.push({ file: full, missing: rel });
        }
      }
      if (ok) result.valid++;
    }
    return result;
  }

  async qaValidateDocsCodeAlignment(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const docsToCheck = [
      path.join(this.rootDir, 'docs', 'architecture', 'architecture.md'),
      path.join(this.rootDir, 'docs', 'prd', 'PRD.md'),
      path.join(this.rootDir, 'docs', 'brief.md'),
      // Include generated shards for mention coverage
      path.join(this.rootDir, 'docs', 'architecture.generated', 'architecture.generated.md'),
      path.join(this.rootDir, 'docs', 'prd.generated', 'PRD.generated.md')
    ];
    const coverage = { total: 0, mentioned: 0, perDoc: {}, missing: [] };
    // Use entity-level active items for coverage
    const implemented = Array.isArray(analysis.entities) && analysis.entities.length
      ? analysis.entities.filter(e => (e.lifecycle || 'active') === 'active')
      : analysis.features.filter(f => f.present && !f.deprecated && f.lifecycle !== 'unused' && f.lifecycle !== 'deprecated').map(f => ({ key: f.key, name: f.name }));
    coverage.total = implemented.length;
    for (const doc of docsToCheck) {
      const exists = fs.existsSync(doc);
      const text = exists ? fs.readFileSync(doc, 'utf8').toLowerCase() : '';
      let count = 0;
      for (const f of implemented) {
        const name = String(f.name || f.id || f.key || '').toLowerCase();
        if (text.includes(name)) count++;
      }
      coverage.perDoc[doc] = { exists, mentions: count };
    }
    // Approximate mentioned if present in any doc
    const mentionedSet = new Set();
    for (const f of implemented) {
      const fname = String(f.name || f.id || f.key || '').toLowerCase();
      if (docsToCheck.some(doc => fs.existsSync(doc) && fs.readFileSync(doc, 'utf8').toLowerCase().includes(fname))) {
        mentionedSet.add(String(f.id || f.key || f.name));
      }
    }
    coverage.mentioned = mentionedSet.size;
    // Missing list
    const missing = [];
    for (const f of implemented) {
      const fname = String(f.name || f.id || f.key || '').toLowerCase();
      const isMentioned = docsToCheck.some(doc => fs.existsSync(doc) && fs.readFileSync(doc, 'utf8').toLowerCase().includes(fname));
      if (!isMentioned) missing.push(f.name || f.id || f.key);
    }
    coverage.missing = missing;
    const fsExtra = require('fs-extra');
    await fsExtra.writeJson(path.join(this.reportsDir, 'docs-code-alignment.json'), coverage, { spaces: 2 });
    // Alias for coverage.json expected by some consumers
    try {
      await fsExtra.writeJson(path.join(this.reportsDir, 'coverage.json'), coverage, { spaces: 2 });
    } catch (_) {}
    return coverage;
  }

  async generateAlignmentReport(analysis) {
    await this.initialize();
    await this.ensureDirs();
    const storyCheck = await this.validateStoryConsistency(analysis);
    const docsCoverage = await this.qaValidateDocsCodeAlignment(analysis);
    // Derive missing features (not mentioned in docs)
    let missing = [];
    try {
      const docs = [
        path.join(this.rootDir, 'docs', 'architecture', 'architecture.md'),
        path.join(this.rootDir, 'docs', 'prd', 'PRD.md')
      ].filter(p => fs.existsSync(p)).map(p => fs.readFileSync(p, 'utf8').toLowerCase()).join('\n');
      const implemented = analysis.features.filter(f => f.present && !f.deprecated);
      missing = implemented.filter(f => !docs.includes((f.name || '').toLowerCase())).map(f => f.name);
    } catch (_) {}

    const report = {
      generatedAt: new Date().toISOString(),
      stories: storyCheck,
      docsCoverage,
      missingFeatures: missing,
      decisions: analysis.decisions || []
    };
    await require('fs-extra').writeJson(path.join(this.reportsDir, 'alignment-report.json'), report, { spaces: 2 });
    // Maintain coverage alias alongside alignment report for consumers
    try {
      const cov = docsCoverage;
      await require('fs-extra').writeJson(path.join(this.reportsDir, 'coverage.json'), cov, { spaces: 2 });
    } catch (_) {}
    return report;
  }

  async createDocumentationManifest(analysis) {
    await this.initialize();
    await this.ensureDirs();
    // Attach latest coverage if exists
    let coverage = null;
    try {
      const covPath = path.join(this.reportsDir, 'docs-code-alignment.json');
      if (fs.existsSync(covPath)) coverage = JSON.parse(fs.readFileSync(covPath, 'utf8'));
    } catch (_) {}

    // Determine tool version from package.json if available
    let toolVersion = 'unknown';
    try {
      const pkgPath = path.join(this.rootDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        toolVersion = pkg.version || toolVersion;
      }
    } catch (_) {}

    // Mark PRD-only (not-present) features as planned for lifecycle visibility
    try {
      if (Array.isArray(analysis.features)) {
        analysis.features = analysis.features.map(f => {
          const ff = { ...f };
          if (!('lifecycle' in ff)) {
            if (ff.present === false) ff.lifecycle = 'planned';
            else if (ff.present === true) ff.lifecycle = ff.lifecycle || 'active';
          }
          return ff;
        });
      }
    } catch (_) {}

    // Extractor version (for determinism and auditability)
    let extractorVersion = 'unknown';
    try {
      const { EXTRACTOR_VERSION } = require('./extractors');
      extractorVersion = EXTRACTOR_VERSION || extractorVersion;
    } catch (_) {}

    // Build relation summaries per-entity for better utilization of relations in manifest
    const relationSummary = {};
    try {
      const rels = Array.isArray(analysis.relations) ? analysis.relations : [];
      for (const r of rels) {
        const from = r.fromId; const to = r.toId; const type = r.type || 'rel';
        if (from) {
          const s = (relationSummary[from] = relationSummary[from] || { out: 0, in: 0, types: {} });
          s.out++; s.types[type] = (s.types[type] || 0) + 1;
        }
        if (to) {
          const s2 = (relationSummary[to] = relationSummary[to] || { out: 0, in: 0, types: {} });
          s2.in++; s2.types[type] = (s2.types[type] || 0) + 1;
        }
      }
    } catch (_) {}

    // Attach summaries onto entity objects without mutating analysis reference
    const entitiesWithRelations = (Array.isArray(analysis.entities) ? analysis.entities : []).map(e => {
      const rel = relationSummary[e.id] || { in: 0, out: 0, types: {} };
      return { ...e, relationSummary: rel };
    });

    const manifest = {
      schemaVersion: '1.0',
      toolVersion,
      extractorVersion,
      generatedAt: new Date().toISOString(),
      coreDocs: {
        prd: fs.existsSync(path.join(this.rootDir, 'docs', 'prd', 'PRD.md')),
        architecture: fs.existsSync(path.join(this.rootDir, 'docs', 'architecture', 'architecture.md')),
        brief: fs.existsSync(path.join(this.rootDir, 'docs', 'brief.md')),
        orchestrator: fs.existsSync(path.join(this.rootDir, 'docs', 'workflow-orchestrator.md'))
      },
      features: analysis.features,
      entities: entitiesWithRelations,
      relations: Array.isArray(analysis.relations) ? analysis.relations : [],
      evidence: analysis.evidence,
      decisions: analysis.decisions || [],
      toolsDetected: analysis.toolsDetected || {},
      repo: analysis.repo || {},
      coverage
    };
    const fsExtra = require('fs-extra');
    const outPath = path.join(this.rootDir, '.ai', 'documentation-manifest.json');
    // Compute manifest diff vs previous version (if any)
    let prev = null;
    try {
      if (fs.existsSync(outPath)) prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    } catch (_) { prev = null; }
    await fsExtra.writeJson(outPath, manifest, { spaces: 2 });
    // Also write alias for compatibility
    try {
      const aliasPath = path.join(this.rootDir, '.ai', 'evidence-manifest.json');
      await fsExtra.writeJson(aliasPath, manifest, { spaces: 2 });
    } catch (_) { /* non-fatal */ }
    // Write manifest diff (features + entities) with simple reasons
    try {
      const diff = { generatedAt: new Date().toISOString(), features: { added: [], removed: [], changed: [] }, entities: { added: [], removed: [], changed: [] }, relations: { added: 0, removed: 0 } };
      const prevMap = new Map();
      const currMap = new Map();
      const pFeatures = (prev && Array.isArray(prev.features)) ? prev.features : [];
      const cFeatures = Array.isArray(analysis.features) ? analysis.features : [];
      for (const f of pFeatures) prevMap.set(f.key, f);
      for (const f of cFeatures) currMap.set(f.key, f);
      for (const [k, f] of currMap) {
        if (!prevMap.has(k)) diff.features.added.push({ key: k, name: f.name, reason: 'new_feature' });
        else {
          const pf = prevMap.get(k);
          if ((pf.present !== f.present) || (pf.lifecycle !== f.lifecycle)) {
            const reason = pf.present !== f.present ? 'presence_changed' : 'lifecycle_changed';
            diff.features.changed.push({ key: k, reason, from: { present: pf.present, lifecycle: pf.lifecycle }, to: { present: f.present, lifecycle: f.lifecycle } });
          }
        }
      }
      for (const [k, f] of prevMap) {
        if (!currMap.has(k)) diff.features.removed.push({ key: k, name: f.name, reason: 'removed_feature' });
      }

      // Entity diffs by id
      const prevEnt = new Map((prev && Array.isArray(prev.entities) ? prev.entities : []).map(e => [e.id, e]));
      const currEnt = new Map((manifest.entities || []).map(e => [e.id, e]));
      for (const [id, e] of currEnt) {
        if (!prevEnt.has(id)) diff.entities.added.push({ id, type: e.type, name: e.name, reason: 'new_entity' });
        else {
          const pe = prevEnt.get(id);
          const changes = [];
          if ((pe.lifecycle || 'active') !== (e.lifecycle || 'active')) changes.push('lifecycle_changed');
          const pSrc = JSON.stringify((pe.sourcePaths || []).slice().sort());
          const cSrc = JSON.stringify((e.sourcePaths || []).slice().sort());
          if (pSrc !== cSrc) changes.push('source_paths_changed');
          if (changes.length) {
            diff.entities.changed.push({ id, type: e.type, name: e.name, reasons: changes });
          }
        }
      }
      for (const [id, e] of prevEnt) {
        if (!currEnt.has(id)) diff.entities.removed.push({ id, type: e.type, name: e.name, reason: 'removed_entity' });
      }
      // Simple relation delta by comparing counts when previous present
      try {
        const prevRel = Array.isArray(prev?.relations) ? prev.relations.length : 0;
        const currRel = Array.isArray(manifest.relations) ? manifest.relations.length : 0;
        if (currRel >= prevRel) { diff.relations.added = currRel - prevRel; diff.relations.removed = 0; }
        else { diff.relations.removed = prevRel - currRel; diff.relations.added = 0; }
      } catch (_) {}
      await fsExtra.writeJson(path.join(this.reportsDir, 'manifest-diff.json'), diff, { spaces: 2 });
    } catch (_) { /* ignore */ }
    return outPath;
  }

  // ======== Minimal Generators: G‑PRD / G‑ARCH (MVP) ========
  async generateGPRD(analysis) {
    await this.initialize();
    const fsExtra = require('fs-extra');
    const outDir = path.join(this.rootDir, 'docs', 'prd.generated');
    await fsExtra.ensureDir(outDir);
    const outPath = path.join(outDir, 'PRD.generated.md');

    const lines = [];
    // Idempotent generated block (no dynamic timestamp inside)
    lines.push('<!-- BEGIN GENERATED: PRD -->');
    lines.push('# Product Requirements (Generated)');
    lines.push('');
    lines.push('This file is generated from implementation evidence. Do not edit within BEGIN/END GENERATED blocks.');
    lines.push('');
    // Active entities summary (PRD-oriented: exclude low-level 'module' to reduce noise)
    const entitiesAll = Array.isArray(analysis.entities) ? analysis.entities.filter(e => (e.lifecycle || 'active') === 'active') : [];
    const allowedTypes = new Set(['api', 'route', 'model', 'ci_job', 'cli', 'config', 'env']);
    const entities = entitiesAll.filter(e => allowedTypes.has(e.type));
    lines.push('## Active Entities');
    if (!entities.length) {
      lines.push('- None detected');
    } else {
      for (const e of entities) {
        const ev = Array.isArray(e.evidence) ? e.evidence.map(x => x.file).filter(Boolean) : [];
        const evTxt = ev.length ? ' — Evidence: ' + Array.from(new Set(ev)).join(', ') : '';
        lines.push(`- [${e.type}] ${e.name} (id: ${e.id})${evTxt}`);
      }
    }
    lines.push('');
    lines.push('## Notes');
    lines.push('- Generated from repository state and tooling.');
    lines.push('- See .ai/documentation-manifest.json for structured details.');
    lines.push('');
    lines.push('<!-- END GENERATED -->');

    await fs.promises.writeFile(outPath, lines.join('\n') + '\n', 'utf8');
    return outPath;
  }

  async generateGArchitecture(analysis) {
    await this.initialize();
    const fsExtra = require('fs-extra');
    const outDir = path.join(this.rootDir, 'docs', 'architecture.generated');
    await fsExtra.ensureDir(outDir);
    const outPath = path.join(outDir, 'architecture.generated.md');

    const lines = [];
    // Idempotent generated block (no dynamic timestamp inside)
    lines.push('<!-- BEGIN GENERATED: ARCHITECTURE -->');
    lines.push('# Architecture (Generated)');
    lines.push('');
    lines.push('This file is generated from implementation evidence. Do not edit within BEGIN/END GENERATED blocks.');
    lines.push('');
    lines.push('## Systems and Evidence');
    const entities = Array.isArray(analysis.entities) ? analysis.entities : [];
    for (const e of entities) {
      const ev = Array.isArray(e.evidence) ? e.evidence.map(x => x.file).filter(Boolean) : [];
      lines.push(`- [${e.type}] ${e.name}: ${(e.lifecycle || 'active')}`);
      lines.push(`  - id: ${e.id}`);
      if (ev.length) lines.push(`  - Evidence: ${Array.from(new Set(ev)).join(', ')}`);
    }
    lines.push('');
    lines.push('<!-- END GENERATED -->');

    await fs.promises.writeFile(outPath, lines.join('\n') + '\n', 'utf8');
    return outPath;
  }

  // Generate a simple Graveyard doc for deprecated/unused items
  async generateGraveyard(analysis) {
    await this.initialize();
    const fsExtra = require('fs-extra');
    const outPath = path.join(this.rootDir, 'docs', 'graveyard.md');
    const ts = new Date().toISOString();
    // Load suppress patterns (reuse extractor suppress file)
    let suppress = [];
    try {
      const supPath = path.join(this.rootDir, '.ai', 'extractor-suppress.json');
      if (fs.existsSync(supPath)) suppress = JSON.parse(fs.readFileSync(supPath, 'utf8'));
    } catch (_) {}
    const minimatch = require('glob').minimatch;
    const isSuppressed = (p) => suppress.some(g => minimatch(p, g));
    const lines = [];
    lines.push('# Graveyard (Generated)');
    lines.push('');
    lines.push(`Updated: ${ts}`);
    lines.push('');
    const items = (analysis.features || []).filter(f => f.lifecycle === 'unused' || f.deprecated);
    if (!items.length) {
      lines.push('No deprecated or unused items detected.');
      await fsExtra.ensureFile(outPath);
      await fsExtra.writeFile(outPath, lines.join('\n') + '\n');
      return outPath;
    }
    for (const f of items) {
      const ev = (analysis.evidence?.[f.key] || []);
      // Skip if evidence suppressed
      if (ev.length && ev.every(isSuppressed)) continue;
      lines.push(`## ${f.name}`);
      lines.push(`- Lifecycle: ${f.lifecycle || (f.deprecated ? 'deprecated' : 'unknown')}`);
      if (ev.length) lines.push(`- Evidence: ${ev.join(', ')}`);
      lines.push('- Safe-Delete Checklist:');
      lines.push('  - [ ] Build passes without this code');
      lines.push('  - [ ] Tests pass (unit/integration)');
      lines.push('  - [ ] No recent commits or runtime references');
      lines.push('  - [ ] Migration notes captured if applicable');
      lines.push('');
    }
    await fsExtra.ensureFile(outPath);
    await fsExtra.writeFile(outPath, lines.join('\n') + '\n');
    return outPath;
  }

  // Append QA findings into the same story file (creates/updates a '## QA Findings' section)
  async appendQAFinding(storyPath, qaResult, iteration = 1) {
    if (!storyPath || !fs.existsSync(storyPath)) return false;
    const content = fs.readFileSync(storyPath, 'utf8');
    const lines = content.split('\n');
    const header = '## QA Findings';
    const idx = lines.findIndex(l => l.trim() === header);
    const block = [];
    const ts = new Date().toISOString();
    block.push(`### Review ${ts} (Iteration ${iteration})`);
    block.push(`- Approved: ${qaResult.approved ? 'Yes' : 'No'}`);
    if (qaResult.coverage !== undefined) block.push(`- Coverage: ${qaResult.coverage}`);
    if (qaResult.testsPassed !== undefined) block.push(`- Tests Passed: ${qaResult.testsPassed}`);
    if (Array.isArray(qaResult.issues) && qaResult.issues.length) {
      block.push('- Issues:');
      qaResult.issues.forEach((i, n) => block.push(`  ${n + 1}. ${i}`));
    }
    block.push('');
    if (idx === -1) {
      // Append new section
      lines.push('', header, ...block);
    } else {
      // Insert after header (find next section or end)
      let insertAt = lines.length;
      for (let i = idx + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) { insertAt = i; break; }
      }
      lines.splice(insertAt, 0, ...block);
    }
    fs.writeFileSync(storyPath, lines.join('\n'), 'utf8');
    return true;
  }

  // Run a lightweight pre-implementation dependency analysis using dev-guard
  // Attempts to read StoryContract.impactRadius.components; falls back to defaults.
  runPreImplementationDependencyAnalysis(story) {
    try {
      const cp = require('child_process');
      const yaml = require('js-yaml');
      let paths = ['tools', 'scripts', 'bmad-core'];
      if (story && story.file && this.rootDir && fs.existsSync(story.file)) {
        try {
          const raw = fs.readFileSync(story.file, 'utf8');
          const m = raw.match(/^---\n([\s\S]*?)\n---/m);
          if (m) {
            const doc = yaml.load(m[1]) || {};
            const sc = doc && doc.StoryContract ? doc.StoryContract : null;
            const comps = sc && sc.impactRadius && Array.isArray(sc.impactRadius.components) ? sc.impactRadius.components : [];
            if (comps.length) paths = comps;
          }
        } catch (_) { /* ignore parse errors */ }
      }
      console.log(chalk.blue('🛰️  Pre-implementation: running dependency impact scan (dev-guard)...'));
      const args = ['tools/dev-guard.js', '--impact-scan', '--report', '--paths', ...paths];
      const res = cp.spawnSync(process.execPath, args, { cwd: this.rootDir, stdio: 'inherit' });
      if ((res.status ?? res.code ?? 0) !== 0) {
        console.log(chalk.yellow('⚠️  dev-guard impact scan reported issues or failed. See .ai/reports/impact-map.json'));
      } else {
        console.log(chalk.green('✅ Dependency impact scan completed (see .ai/reports/impact-map.json)'));
      }
    } catch (e) {
      console.log(chalk.yellow(`⚠️  Could not run pre-implementation impact scan: ${e.message}`));
    }
  }

  // Extract story titles, status, and epic_id for PRD epic summaries
  async extractStorySummaries() {
    const storiesDir = path.join(this.rootDir, 'docs', 'stories');
    const result = { total: 0, perEpic: {} };
    if (!fs.existsSync(storiesDir)) return result;
    const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const full = path.join(storiesDir, f);
      let title = path.basename(f, '.md');
      let status = 'Unknown';
      let epic = 'General';
      try {
        const content = fs.readFileSync(full, 'utf8');
        // Title: first H1 or line starting with '# '
        const h1 = content.split('\n').find(l => /^#\s+/.test(l));
        if (h1) title = h1.replace(/^#\s+/, '').trim();
        // Status line: 'Status: ...'
        const sLine = content.split('\n').find(l => /^Status\s*:/i.test(l));
        if (sLine) status = sLine.split(':').slice(1).join(':').trim();
        // Epic ID: try to find epic_id in YAML-like header
        const epicMatch = content.match(/epic_id\s*:\s*"?([A-Za-z0-9_.\-\s]+)"?/i);
        if (epicMatch) epic = epicMatch[1].trim();
      } catch (_) {}
      if (!result.perEpic[epic]) result.perEpic[epic] = [];
      result.perEpic[epic].push({ title, status, path: `docs/stories/${f}` });
      result.total++;
    }
    return result;
  }

  // Reverse-Align Quality Gate: validate enriched docs presence and required sections
  async reverseAlignQualityGate(threshold = 0.8) {
    await this.initialize();
    await this.ensureDirs();
    const report = {
      generatedAt: new Date().toISOString(),
      checks: [],
      pass: true
    };

    const addCheck = (name, ok, details = '') => {
      report.checks.push({ name, ok, details });
      if (!ok) report.pass = false;
    };

    // Analysis JSON exists with enriched fields
    const analysisPath = path.join(this.reverseDir, 'analysis.json');
    const hasAnalysis = fs.existsSync(analysisPath);
    addCheck('analysis.json exists', hasAnalysis, analysisPath);
    if (hasAnalysis) {
      try {
        const aj = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
        addCheck('analysis has pkg info', !!aj.pkg && Object.keys(aj.pkg).length > 0);
        addCheck('analysis has toolsDetected', !!aj.toolsDetected && Object.keys(aj.toolsDetected).length > 0);
      } catch (e) {
        addCheck('analysis.json parseable', false, e.message);
      }
    }

    // Architecture checks
    const arch = path.join(this.rootDir, 'docs', 'architecture', 'architecture.md');
    const archExists = fs.existsSync(arch);
    addCheck('architecture.md exists', archExists, arch);
    if (archExists) {
      const txt = fs.readFileSync(arch, 'utf8');
      const mustHave = ['## Tech Stack', '## Systems and Evidence', '## Architectural Patterns & Decisions'];
      for (const h of mustHave) addCheck(`architecture has section: ${h}`, txt.includes(h));
      addCheck('architecture has diagram', txt.includes('```mermaid'));
    }

    // PRD checks
    const prd = path.join(this.rootDir, 'docs', 'prd', 'PRD.md');
    const prdExists = fs.existsSync(prd);
    addCheck('PRD.md exists', prdExists, prd);
    if (prdExists) {
      const txt = fs.readFileSync(prd, 'utf8');
      const mustHave = ['## Requirements', '### Functional', '### Non-Functional', '## Technical Assumptions', '## Epics Overview'];
      for (const h of mustHave) addCheck(`PRD has section: ${h}`, txt.includes(h));
      addCheck('PRD has Change Log', txt.includes('## Change Log'));
    }

    // Coverage checks (feature mentions across docs)
    try {
      const analysisPath2 = path.join(this.reverseDir, 'analysis.json');
      if (fs.existsSync(analysisPath2)) {
        const aj = JSON.parse(fs.readFileSync(analysisPath2, 'utf8'));
        const implemented = (aj.features || []).filter(f => f.present && !f.deprecated);
        const docsText = [archExists ? fs.readFileSync(arch, 'utf8').toLowerCase() : '', prdExists ? fs.readFileSync(prd, 'utf8').toLowerCase() : ''].join('\n');
        const missing = [];
        for (const f of implemented) {
          if (!docsText.includes((f.name || '').toLowerCase())) missing.push(f.name);
        }
        const total = implemented.length;
        const mentioned = total - missing.length;
        const coverageRatio = total ? mentioned / total : 1;
        addCheck(`feature coverage >= ${threshold}`, coverageRatio >= threshold, `coverage=${mentioned}/${total}`);
        report.coverage = { total, mentioned, missing };
      }
    } catch (e) {
      addCheck('coverage computation', false, e.message);
    }

    // Write report
    const out = path.join(this.reportsDir, 'reverse-align-gate.json');
    await require('fs-extra').writeJson(out, report, { spaces: 2 });
    return report;
  }

  /**
   * Initialize configuration and logger
   */
  async initialize() {
    try {
      this.config = await this.configLoader.loadConfig();
      this.logger.configure({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      
      // Configure simulator logger as well
      this.simulator.configureLogger({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      
      // Initialize shared context manager
      this.logger.taskStart('Initializing shared context manager', 'Setting up user interaction tracking');
      try {
        const contextInitialized = await this.contextManager.initialize();
        if (!contextInitialized) {
          this.logger.warn('SharedContextManager initialization failed, continuing with limited context tracking');
        } else {
          this.logger.taskComplete('Initializing shared context manager', 'Context tracking ready');
        }
      } catch (error) {
        this.logger.warn('SharedContextManager initialization error, continuing without context tracking', error);
      }
      
      // Initialize file path resolution
      this.logger.taskStart('Resolving file paths', 'Loading file locations from core-config.yaml');
      try {
        // Suppress noisy devLoadAlways warnings when requested (e.g., during reverse-align pre-rewrite)
        if (this.filePathResolver && typeof this.filePathResolver === 'object') {
          this.filePathResolver.quietDevLoadWarnings = !!this.suppressDevLoadWarnings;
        }
        this.resolvedPaths = this.filePathResolver.getAllResolvedPaths();
        
        // Validate paths
        const validation = this.filePathResolver.validatePaths();
        if (!validation.success) {
          throw new Error(`File path validation failed:\n${validation.errors.join('\n')}`);
        }
        
        if (validation.warnings.length > 0) {
          const filtered = validation.warnings.filter(w => {
            if (!this.suppressDevLoadWarnings) return true;
            const low = String(w).toLowerCase();
            return !(low.includes('devloadalwaysfiles') || low.includes('story location does not exist'));
          });
          filtered.forEach(warning => this.logger.warn(warning));
        }
        
        this.logger.taskComplete('Resolving file paths', `Resolved ${Object.keys(this.resolvedPaths).length} file paths`);
      } catch (error) {
        this.logger.error('Failed to resolve file paths', error);
        throw error;
      }
      
      // Only log after configuration is applied
      this.logger.taskStart('Loading core configuration', 'Initializing BMad orchestrator');
      this.logger.taskComplete('Loading core configuration', 'Configuration loaded successfully');
    } catch (error) {
      // Use defaults if config loading fails
      this.config = this.configLoader.getDefaultConfig();
      this.logger.configure({
        verbosity: this.config.verbosity,
        verbosityLevel: this.config.verbosityLevel
      });
      this.logger.error('Failed to load configuration', error);
      throw error; // Re-throw to prevent orchestrator from running with invalid paths
    }
  }

  /**
   * Load metadata for the current story/workflow
   */
  loadMetadata() {
    this.logger.taskStart('Loading orchestrator metadata', '', 'detailed');
    
    try {
      if (fs.existsSync(this.storyMetadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(this.storyMetadataPath, 'utf8'));
        this.logger.taskComplete('Loading orchestrator metadata', `Found metadata for story ${metadata.storyId || 'unknown'}`, 'detailed');
        return metadata;
      }
    } catch (error) {
      this.logger.warn('Failed to load metadata: ' + error.message, 'detailed');
    }
    
    this.logger.taskComplete('Loading orchestrator metadata', 'No existing metadata found', 'detailed');
    return {};
  }

  /**
   * Save metadata for the current story/workflow
   */
  saveMetadata(metadata) {
    try {
      fs.writeFileSync(this.storyMetadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to save metadata:', error.message);
    }
  }

  /**
   * Get available workflows
   */
  async getAvailableWorkflows() {
    this.logger.taskStart('Scanning for available workflows', '', 'detailed');
    
    try {
      const files = await fs.promises.readdir(this.workflowsDir);
      const workflows = files
        .filter(file => file.endsWith('.yaml'))
        .map(file => file.replace('.yaml', ''));
      
      this.logger.taskComplete('Scanning for available workflows', `Found ${workflows.length} workflows`, 'detailed');
      return workflows;
    } catch (error) {
      this.logger.error('Failed to read workflows directory', error);
      return [];
    }
  }

  /**
   * Load a workflow definition
   */
  async loadWorkflow(workflowId) {
    const workflowPath = path.join(this.workflowsDir, `${workflowId}.yaml`);
    try {
      const content = await fs.promises.readFile(workflowPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowId}: ${error.message}`);
    }
  }

  /**
   * Prompt user to select workflow mode and flow type
   */
  async selectWorkflowMode(nonInteractive = false, defaultMode = 'single', defaultFlowType = 'linear') {
    let workflowMode, flowType;
    
    if (nonInteractive) {
      workflowMode = defaultMode;
      flowType = defaultFlowType;
      console.log(chalk.dim(`Non-interactive mode: Using workflow mode '${workflowMode}' with flow type '${flowType}'`));
    } else {
      const { workflowMode: selectedMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'workflowMode',
          message: 'Select the workflow mode:',
          choices: [
            {
              name: 'Single Story Mode (Process one story)',
              value: 'single'
            },
            {
              name: 'Epic Loop Mode (Process all stories in an epic sequentially)',
              value: 'epic-loop'
            }
          ],
          default: 'single'
        }
      ]);
      workflowMode = selectedMode;
      
      flowType = 'linear';
      if (workflowMode === 'epic-loop') {
        const { epicFlowType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'epicFlowType',
            message: 'Select the development workflow flow type for each story in the epic:',
            choices: [
              {
                name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
                value: 'linear'
              },
              {
                name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
                value: 'iterative'
              }
            ],
            default: 'linear'
          }
        ]);
        flowType = epicFlowType;
      } else {
        const { singleFlowType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'singleFlowType',
            message: 'Select the development workflow flow type:',
            choices: [
              {
                name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
                value: 'linear'
              },
              {
                name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
                value: 'iterative'
              }
            ],
            default: 'linear'
          }
        ]);
        flowType = singleFlowType;
      }
    }
    
    return { workflowMode, flowType };
  }

  /**
   * Prompt user to select workflow flow type (legacy method for backwards compatibility)
   */
  async selectFlowType(nonInteractive = false, defaultFlowType = 'linear') {
    if (nonInteractive) {
      console.log(chalk.dim(`Non-interactive mode: Using flow type '${defaultFlowType}'`));
      return defaultFlowType;
    }
    
    const { flowType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'flowType',
        message: 'Select the development workflow flow type:',
        choices: [
          {
            name: 'Linear Dev→QA flow (Dev implements once, QA reviews once)',
            value: 'linear'
          },
          {
            name: 'Dev↔QA iterative flow (Dev and QA iterate until approved)',
            value: 'iterative'
          }
        ],
        default: 'linear'
      }
    ]);
    return flowType;
  }

  /**
   * Prompt user to select an epic for epic loop mode
   */
  async selectEpic(nonInteractive = false, defaultEpicId = null) {
    try {
      const allStories = this.getAllStoriesStatus();
      
      // Group stories by epic ID
      const epicGroups = {};
      allStories.forEach(story => {
        if (story.epicId) {
          if (!epicGroups[story.epicId]) {
            epicGroups[story.epicId] = {
              epicId: story.epicId,
              stories: [],
              hasApproved: false
            };
          }
          epicGroups[story.epicId].stories.push(story);
          if (story.status.toLowerCase() === 'approved') {
            epicGroups[story.epicId].hasApproved = true;
          }
        }
      });

      // Filter epics that have at least one approved story
      const availableEpics = Object.values(epicGroups)
        .filter(epic => epic.hasApproved)
        .map(epic => {
          const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
          const status = getEpicStatus(this.resolvedPaths.storyLocation, epic.epicId);
          return {
            name: `Epic ${epic.epicId} (${status.completedStories}/${status.totalStories} completed, ${status.pendingStories} pending)`,
            value: epic.epicId
          };
        });

      if (availableEpics.length === 0) {
        throw new Error('No epics with approved stories found. Please ensure at least one story in an epic has "Approved" status.');
      }

      if (nonInteractive) {
        const selectedEpic = defaultEpicId || availableEpics[0].value;
        console.log(chalk.dim(`Non-interactive mode: Using epic '${selectedEpic}'`));
        return selectedEpic;
      }

      const { selectedEpic } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedEpic',
          message: 'Select an epic to process:',
          choices: availableEpics
        }
      ]);

      return selectedEpic;
    } catch (error) {
      this.logger.error('Failed to select epic', error);
      throw error;
    }
  }

  /**
   * Get all stories status using resolved paths
   */
  getAllStoriesStatus() {
    const { getAllStoriesStatus } = require('../bmad-core/utils/find-next-story');
    return getAllStoriesStatus(this.resolvedPaths.storyLocation);
  }

  /**
   * Update story status in the story file using atomic operations
   */
  async updateStoryStatus(storyPath, newStatus) {
    const backupPath = `${storyPath}.backup.${Date.now()}`;
    const tempPath = `${storyPath}.tmp.${Date.now()}`;
    
    try {
      this.logger.taskStart('Updating story status', `Atomic update to: ${newStatus}`, 'detailed');
      
      // Create backup of original file
      await fs.promises.copyFile(storyPath, backupPath);
      
      // Read original content
      const content = await fs.promises.readFile(storyPath, 'utf8');
      
      // Validate the content has the expected status structure
      const statusRegex = /(##\s*Status\s*\n\s*)(.+)/i;
      const statusMatch = content.match(statusRegex);
      
      if (!statusMatch) {
        throw new Error(`Story file ${storyPath} does not have the expected Status section format`);
      }
      
      const oldStatus = statusMatch[2].trim();
      this.logger.taskStart('Status validation', `Changing from '${oldStatus}' to '${newStatus}'`, 'detailed');
      
      // Replace the status in the content
      const updatedContent = content.replace(statusRegex, `$1${newStatus}`);
      
      // Verify the replacement worked
      const verifyMatch = updatedContent.match(statusRegex);
      if (!verifyMatch || verifyMatch[2].trim() !== newStatus) {
        throw new Error(`Status replacement failed - could not update to '${newStatus}'`);
      }
      
      // Write to temporary file first
      await fs.promises.writeFile(tempPath, updatedContent, 'utf8');
      
      // Verify temporary file was written correctly
      const verifyContent = await fs.promises.readFile(tempPath, 'utf8');
      const verifyFinalMatch = verifyContent.match(statusRegex);
      if (!verifyFinalMatch || verifyFinalMatch[2].trim() !== newStatus) {
        throw new Error(`Temporary file verification failed - status not updated correctly`);
      }
      
      // Atomic move from temp to original (on most filesystems this is atomic)
      await fs.promises.rename(tempPath, storyPath);
      
      // Clean up backup file after successful update
      await fs.promises.unlink(backupPath);
      
      this.logger.taskComplete('Updating story status', `Status atomically updated to: ${newStatus}`, 'detailed');
      
    } catch (error) {
      this.logger.error('Failed to update story status', error);
      
      // Attempt to restore from backup if it exists
      try {
        const backupExists = await fs.promises.access(backupPath).then(() => true).catch(() => false);
        if (backupExists) {
          await fs.promises.copyFile(backupPath, storyPath);
          this.logger.taskComplete('Story status rollback', 'Restored from backup after error', 'detailed');
        }
      } catch (restoreError) {
        this.logger.error('Failed to restore backup after update error', restoreError);
      }
      
      // Clean up temporary and backup files
      try {
        await fs.promises.unlink(tempPath).catch(() => {});
        await fs.promises.unlink(backupPath).catch(() => {});
      } catch (cleanupError) {
        this.logger.warn('Failed to clean up temporary files', cleanupError);
      }
      
      throw new Error(`Atomic status update failed: ${error.message}`);
    }
  }

  /**
   * Execute epic loop workflow
   */
  async executeEpicLoop(epicId, flowType) {
    console.log(chalk.bold(`🔄 Starting Epic Loop for Epic ${epicId}\n`));
    
    this.logger.phaseStart('Epic Loop Workflow', `Processing all stories in Epic ${epicId} with ${flowType} flow`);
    
    const { getEpicStatus, findNextApprovedStoryInEpic } = require('../bmad-core/utils/find-next-story');
    
    let epicCompleted = false;
    let processedStories = 0;
    let totalIterations = 0;
    let maxEpicIterations = 50; // Prevent infinite loops
    let currentEpicIteration = 0;
    let storyAttempts = {}; // Track attempts per story
    let maxAttemptsPerStory = 3; // Maximum retry attempts per story
    let consecutiveFailures = 0;
    let maxConsecutiveFailures = 5;
    
    while (!epicCompleted && currentEpicIteration < maxEpicIterations) {
      currentEpicIteration++;
      this.logger.taskStart('Epic iteration', `Iteration ${currentEpicIteration}/${maxEpicIterations}`, 'detailed');
      // Get current epic status
      const epicStatus = getEpicStatus(this.resolvedPaths.storyLocation, epicId);
      
      this.logger.summary('Epic Progress', [
        `Epic ID: ${epicId}`,
        `Total Stories: ${epicStatus.totalStories}`,
        `Completed Stories: ${epicStatus.completedStories}`,
        `In Progress Stories: ${epicStatus.inProgressStories}`,
        `Pending Stories: ${epicStatus.pendingStories}`
      ]);
      
      // Check if epic is complete
      if (epicStatus.isComplete) {
        epicCompleted = true;
        this.logger.taskComplete('Epic iteration', 'Epic completed successfully');
        break;
      }
      
      // Check for consecutive failures
      if (consecutiveFailures >= maxConsecutiveFailures) {
        this.logger.error('Epic loop terminating', `Too many consecutive failures (${consecutiveFailures})`);
        console.log(chalk.red(`\n❌ Epic loop terminated after ${consecutiveFailures} consecutive failures`));
        break;
      }
      
      // Find next approved story
      let nextStoryResult;
      try {
        nextStoryResult = findNextApprovedStoryInEpic(this.resolvedPaths.storyLocation, epicId);
      } catch (error) {
        this.logger.error('Error finding next story', error);
        consecutiveFailures++;
        continue;
      }
      
      if (!nextStoryResult.found) {
        this.logger.warn(`No more approved stories found in Epic ${epicId}: ${nextStoryResult.error}`);
        // Check if this is because all stories are processed or there's an error
        if (epicStatus.pendingStories === 0) {
          this.logger.taskComplete('Epic iteration', 'No more pending stories to process');
          break;
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay before retry
          continue;
        }
      }
      
      const story = {
        id: nextStoryResult.fullStoryId,
        name: nextStoryResult.title,
        file: nextStoryResult.path,
        epicId: nextStoryResult.epicId,
        storyId: nextStoryResult.storyId,
        storyContract: nextStoryResult.storyContract
      };
      
      // Check story attempt count
      const storyKey = story.id;
      if (!storyAttempts[storyKey]) {
        storyAttempts[storyKey] = 0;
      }
      
      if (storyAttempts[storyKey] >= maxAttemptsPerStory) {
        this.logger.warn(`Story ${story.id} exceeded maximum attempts (${maxAttemptsPerStory}), skipping`);
        console.log(chalk.yellow(`⚠️  Story ${story.id} exceeded maximum attempts, skipping`));
        consecutiveFailures++;
        continue;
      }
      
      storyAttempts[storyKey]++;
      console.log(chalk.blue(`\n📖 Processing Story ${story.id}: ${story.name} (Attempt ${storyAttempts[storyKey]}/${maxAttemptsPerStory})`));
      
      try {
        // Update story status to InProgress
        await this.updateStoryStatus(story.file, 'InProgress');
      } catch (error) {
        this.logger.error(`Failed to update story status for ${story.id}`, error);
        console.log(chalk.red(`❌ Failed to update story status for ${story.id}: ${error.message}`));
        consecutiveFailures++;
        continue;
      }
      
      // Execute SM validation using actual agent simulator
      this.logger.agentAction('sm', 'Validating story draft', { storyId: story.id });
      const spinner = ora('Scrum Master validating story draft...').start();
      
      try {
        const smResult = await this.simulateAgentWork('sm', 'validate_story', {
          ...story,
          storyContract: story.storyContract,
          resolvedPaths: this.resolvedPaths
        });
        
        if (smResult.success && smResult.approved) {
          spinner.succeed('Scrum Master validation complete ✅');
          this.logger.agentAction('sm', 'Story validation approved', {
            storyId: story.id,
            validationChecks: smResult.validationChecks || [],
            recommendations: smResult.recommendations || []
          });
        } else {
          spinner.warn(`Scrum Master validation found issues: ${smResult.issues?.length || 0} concerns`);
          this.logger.agentAction('sm', 'Story validation found issues', {
            storyId: story.id,
            issues: smResult.issues || [],
            approved: false
          });
          
          // Log SM recommendations but continue processing 
          // (SM validation is advisory, not blocking)
          if (smResult.issues && smResult.issues.length > 0) {
            console.log('\nScrum Master Recommendations:');
            smResult.issues.forEach((issue, index) => {
              console.log(`  ${index + 1}. ${issue}`);
            });
            console.log(chalk.dim('Note: SM recommendations are advisory. Story will continue processing.\n'));
          }
        }
      } catch (error) {
        spinner.warn('Scrum Master validation encountered an error');
        this.logger.warn('SM validation error (continuing with story processing)', error);
        console.log(chalk.yellow('⚠️  SM validation error, continuing with story processing'));
      }
      
      let result;
      let storyProcessed = false;
      
      try {
        // Execute Dev→QA workflow
        result = await this.executeDevQAWorkflow(story, flowType);
        storyProcessed = true;
        
        // Update story status based on QA result
        const finalStatus = result?.qaResult?.approved ? 'Done' : 'Review';
        
        try {
          await this.updateStoryStatus(story.file, finalStatus);
        } catch (statusError) {
          this.logger.error(`Failed to update final status for ${story.id}`, statusError);
          console.log(chalk.red(`❌ Failed to update final status for ${story.id}: ${statusError.message}`));
          // Continue processing - status update failure shouldn't stop the epic
        }
        
        if (result?.qaResult?.approved) {
          console.log(chalk.green(`✅ Story ${story.id} completed successfully!`));
          processedStories++;
          consecutiveFailures = 0; // Reset on success
          delete storyAttempts[storyKey]; // Remove from retry tracking
        } else {
          console.log(chalk.yellow(`⚠️  Story ${story.id} needs further work`));
          consecutiveFailures++;
        }
        
        if (result?.iterations) {
          totalIterations += result.iterations;
        } else {
          totalIterations += 1;
        }
        
      } catch (error) {
        this.logger.error(`Error processing story ${story.id}`, error);
        console.log(chalk.red(`❌ Error processing story ${story.id}: ${error.message}`));
        
        // Try to reset story status to Approved for retry
        try {
          await this.updateStoryStatus(story.file, 'Approved');
        } catch (resetError) {
          this.logger.error(`Failed to reset story status for ${story.id}`, resetError);
        }
        
        consecutiveFailures++;
        storyProcessed = false;
      }
      
      // Update iteration counters and task completion
      this.logger.taskComplete('Epic iteration', 
        storyProcessed ? `Story ${story.id} processed` : `Story ${story.id} failed to process`);
      
      // Small delay before next story
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Handle loop termination conditions
    if (currentEpicIteration >= maxEpicIterations) {
      this.logger.warn('Epic loop terminated', `Maximum iterations reached (${maxEpicIterations})`);
      console.log(chalk.yellow(`\n⚠️  Epic loop terminated after reaching maximum iterations (${maxEpicIterations})`));
    }
    
    // Final epic status
    const finalEpicStatus = getEpicStatus(this.resolvedPaths.storyLocation, epicId);
    
    this.logger.phaseComplete('Epic Loop Workflow');
    
    console.log(chalk.bold('\n🎉 Epic Loop Complete!\n'));
    console.log(chalk.green(`Epic ${epicId} Status:`));
    console.log(`  Total Stories: ${finalEpicStatus.totalStories}`);
    console.log(`  Completed Stories: ${finalEpicStatus.completedStories}`);
    console.log(`  Stories Processed: ${processedStories}`);
    console.log(`  Total Iterations: ${totalIterations}`);
    
    if (finalEpicStatus.isComplete) {
      console.log(chalk.green('🎊 Epic fully completed!'));
    } else {
      console.log(chalk.yellow('⚠️  Epic has remaining stories to process'));
    }
    
    return {
      epicId,
      epicCompleted: finalEpicStatus.isComplete,
      processedStories,
      totalIterations,
      finalStatus: finalEpicStatus
    };
  }

  /**
   * Execute Dev→QA workflow based on flow type
   */
  async executeDevQAWorkflow(story, flowType) {
    const spinner = ora();
    
    this.logger.phaseStart('Dev↔QA Workflow', `Executing ${flowType} flow for story: ${story.name || story.id}`);
    
    this.logger.summary('Story Information', [
      `ID: ${story.id || 'N/A'}`,
      `Name: ${story.name || 'Unnamed Story'}`,
      `Flow Type: ${flowType === 'iterative' ? 'Dev↔QA Iterative' : 'Linear Dev→QA'}`
    ]);

    if (flowType === 'linear') {
      // Linear flow: Dev → QA (once)
      await this.executeLinearFlow(story, spinner);
    } else {
      // Iterative flow: Dev ↔ QA (loop until approved)
      await this.executeIterativeFlow(story, spinner);
    }
    
    this.logger.phaseComplete('Dev↔QA Workflow');
  }

  /**
   * Execute linear Dev→QA flow
   */
  async executeLinearFlow(story, spinner) {
    this.logger.workflowTransition('Start', 'Linear Dev→QA Flow', 'Single-pass implementation and review');

    // Dev Phase
    this.logger.agentAction('dev', 'Starting story implementation', { storyId: story.id });
    // Always run pre-implementation dependency analysis before code changes
    this.runPreImplementationDependencyAnalysis(story);
    spinner.start('Dev agent implementing story...');
    const devResult = await this.simulateAgentWork('dev', 'implement', story);
    spinner.succeed(`Dev implementation complete: ${devResult.filesModified} files modified`);
    this.logger.agentAction('dev', 'Implementation completed', {
      filesModified: devResult.filesModified,
      linesAdded: devResult.linesAdded,
      testsAdded: devResult.testsAdded
    });
    
    // QA Phase
    this.logger.agentAction('qa', 'Starting implementation review', { storyId: story.id });
    spinner.start('QA agent reviewing implementation...');
    const qaResult = await this.simulateAgentWork('qa', 'review', {
      ...story,
      implementation: devResult
    });
    
    // Append QA findings to the same story file if available
    try { if (story.file) await this.appendQAFinding(story.file, qaResult, 1); } catch (_) {}

    if (qaResult.approved) {
      spinner.succeed('QA review complete: Implementation approved ✅');
      this.logger.agentAction('qa', 'Review completed - Implementation approved', {
        coverage: qaResult.coverage,
        testsPassed: qaResult.testsPassed
      });
      this.logger.taskComplete('Story implementation', 'All acceptance criteria met');
      console.log(chalk.green('\n✨ Story completed successfully!'));
    } else {
      spinner.warn(`QA review complete: ${qaResult.issues.length} issues found`);
      this.logger.agentAction('qa', 'Review completed - Issues found', {
        issueCount: qaResult.issues.length,
        severity: qaResult.severity
      });
      this.logger.warn(`Story has ${qaResult.issues.length} QA findings that need Dev agent to address`);
      console.log('\nQA Recommendations for Dev Agent:');
      qaResult.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
      console.log(chalk.dim('\nNote: In linear flow, Dev agent must manually address these issues.'));
    }

    return { devResult, qaResult };
  }

  /**
   * Execute iterative Dev↔QA flow
   */
  async executeIterativeFlow(story, spinner) {
    console.log(chalk.blue('🔄 Executing Iterative Dev↔QA Flow\n'));

    let iteration = 1;
    let qaApproved = false;
    let devResult = null;
    let qaResult = null;

    while (!qaApproved) {
      this.logger.iteration(iteration, 'Starting iteration');

      // Dev Phase
      if (iteration === 1) {
        this.logger.agentAction('dev', 'Starting initial story implementation', { storyId: story.id });
        // Always run pre-implementation dependency analysis before code changes
        this.runPreImplementationDependencyAnalysis(story);
        spinner.start('Dev agent implementing story...');
        devResult = await this.simulateAgentWork('dev', 'implement', story);
      } else {
        this.logger.agentAction('dev', 'Implementing QA recommendations', {
          issueCount: qaResult.issues.length,
          previousIteration: iteration - 1
        });
        // Run dependency analysis again before applying QA fixes
        this.runPreImplementationDependencyAnalysis(story);
        spinner.start('Dev agent implementing QA recommendations...');
        devResult = await this.simulateAgentWork('dev', 'fix', {
          ...story,
          qaFeedback: qaResult.issues,
          qaReport: qaResult.report
        });
      }
      spinner.succeed(`Dev work complete: ${devResult.filesModified} files modified`);
      this.logger.agentAction('dev', 'Work completed', {
        filesModified: devResult.filesModified,
        issuesAddressed: devResult.issuesAddressed
      }, 'detailed');

      // QA Phase
      this.logger.agentAction('qa', 'Reviewing implementation', { iteration });
      spinner.start('QA agent reviewing implementation...');
      qaResult = await this.simulateAgentWork('qa', 'review', {
        ...story,
        implementation: devResult,
        iteration
      });
      // Append iteration QA findings to story file
      try { if (story.file) await this.appendQAFinding(story.file, qaResult, iteration); } catch (_) {}

      if (qaResult.approved) {
        spinner.succeed('QA review complete: Implementation approved ✅');
        this.logger.agentAction('qa', 'Review approved', {
          iteration,
          coverage: qaResult.coverage
        });
        qaApproved = true;
      } else {
        spinner.warn(`QA review complete: ${qaResult.issues.length} recommendations provided`);
        this.logger.agentAction('qa', 'Review found issues', {
          iteration,
          issueCount: qaResult.issues.length
        });
        this.logger.summary('QA Recommendations', qaResult.issues, 'detailed');
        console.log('\nQA Recommendations for Dev Agent:');
        qaResult.issues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue}`);
        });
        console.log(chalk.dim('\nDev agent will implement these recommendations in the next iteration.'));

        // Check if we should continue iterating
        if (iteration >= 5) {
          console.log(chalk.yellow('\n⚠️  Maximum iterations (5) reached'));
          
          // In non-interactive mode, automatically stop after 5 iterations
          if (this.nonInteractive) {
            console.log(chalk.dim('Non-interactive mode: Stopping after maximum iterations'));
            break;
          }
          
          const { continueIterating } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueIterating',
              message: 'Continue iterating?',
              default: false
            }
          ]);
          
          if (!continueIterating) {
            break;
          }
        }

        iteration++;
      }
    }

    if (qaApproved) {
      this.logger.taskComplete('Story implementation', `Approved after ${iteration} iteration(s)`);
      console.log(chalk.green('\n✨ Story completed successfully after ' + iteration + ' iteration(s)!'));
    } else {
      this.logger.warn(`Story implementation stopped after ${iteration} iterations with unresolved QA findings`);
      console.log(chalk.yellow('\n⚠️  Story implementation stopped with unresolved QA findings'));
    }

    return { devResult, qaResult, iterations: iteration };
  }

  /**
   * Consolidate context before agent handoff
   */
  async consolidateContextForHandoff(sourceAgent, targetAgent, workflowPhase, contextScope = {}) {
    try {
      this.logger.taskStart('Context consolidation', `${sourceAgent} → ${targetAgent}`, 'detailed');
      
      // Get user interactions summary for the handoff
      const userInteractionsSummary = await this.contextManager.getUserInteractionsSummary({
        ...contextScope,
        limit: 20 // Get recent interactions
      });
      
      // Get specific context for the target agent
      const targetContext = await this.contextManager.getContextForAgent(targetAgent, contextScope);
      
      // Create consolidated handoff package
      const handoffPackage = {
        sourceAgent,
        targetAgent,
        workflowPhase,
        timestamp: new Date().toISOString(),
        userInteractionsSummary,
        targetContext,
        contextScope,
        recommendations: this.generateHandoffRecommendations(sourceAgent, targetAgent, userInteractionsSummary)
      };
      
      // Update workflow state
      await this.contextManager.updateWorkflowState(
        `${workflowPhase}-${targetAgent}`,
        [`${workflowPhase}-${sourceAgent}`],
        [`${targetAgent}-work`]
      );
      
      this.logger.taskComplete('Context consolidation', 
        `${userInteractionsSummary?.totalInteractions || 0} interactions consolidated`, 'detailed');
      
      return handoffPackage;
    } catch (error) {
      this.logger.error('Context consolidation failed', error);
      // Return minimal handoff package on error
      return {
        sourceAgent,
        targetAgent,
        workflowPhase,
        timestamp: new Date().toISOString(),
        error: error.message,
        recommendations: [`Review context manually due to consolidation error: ${error.message}`]
      };
    }
  }

  /**
   * Generate recommendations for agent handoff based on context
   */
  generateHandoffRecommendations(sourceAgent, targetAgent, userInteractionsSummary) {
    const recommendations = [];
    
    if (!userInteractionsSummary) {
      recommendations.push('No user interaction context available - proceed with caution');
      return recommendations;
    }
    
    // Check for unconfirmed responses
    if (userInteractionsSummary.openQuestions?.length > 0) {
      recommendations.push(
        `${userInteractionsSummary.openQuestions.length} user responses need confirmation before proceeding`
      );
    }
    
    // Check for important responses
    if (userInteractionsSummary.importantResponses?.length > 0) {
      recommendations.push(
        `Review ${userInteractionsSummary.importantResponses.length} high-priority user requirements`
      );
    }
    
    // Agent-specific recommendations
    if (targetAgent === 'dev' && sourceAgent === 'po') {
      recommendations.push('Use retrieve-user-context task to check for specific technical requirements');
      recommendations.push('Confirm architectural constraints with user before implementation');
    } else if (targetAgent === 'qa' && sourceAgent === 'dev') {
      recommendations.push('Review user acceptance criteria from PO interactions');
      recommendations.push('Validate test scenarios against user requirements');
    } else if (targetAgent === 'po' && sourceAgent === 'analyst') {
      recommendations.push('Convert business insights into specific, testable requirements');
      recommendations.push('Confirm user priorities and MVP scope');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Context handoff complete - proceed with agent work');
    }
    
    return recommendations;
  }

  /**
   * Simulate agent work (delegates to AgentSimulator)
   * Enhanced to pass resolved file paths and consolidated context to agents
   * Includes memory health monitoring integration
   */
  async simulateAgentWork(agent, action, context) {
    // Consolidate context before agent work if this is a handoff scenario
    let consolidatedContext = null;
    if (context.handoffFromAgent) {
      consolidatedContext = await this.consolidateContextForHandoff(
        context.handoffFromAgent,
        agent,
        context.workflowPhase || 'development',
        context.contextScope || {}
      );
    }
    
    // Enhance context with resolved file paths and consolidated context
    const enhancedContext = {
      ...context,
      resolvedPaths: this.resolvedPaths,
      consolidatedContext,
      contextManager: this.contextManager, // Allow agents to access context manager
      filePathResolver: {
        storyLocation: this.resolvedPaths.storyLocation,
        prdFile: this.resolvedPaths.prdFile,
        prdShardedLocation: this.resolvedPaths.prdShardedLocation,
        architectureFile: this.resolvedPaths.architectureFile,
        architectureShardedLocation: this.resolvedPaths.architectureShardedLocation,
        devDebugLog: this.resolvedPaths.devDebugLog,
        devLoadAlwaysFiles: this.resolvedPaths.devLoadAlwaysFiles,
        isPRDSharded: this.resolvedPaths.isPRDSharded,
        isArchitectureSharded: this.resolvedPaths.isArchitectureSharded
      }
    };
    
    this.logger.taskStart(`Agent work: ${agent}`, `Action: ${action} with resolved paths and context`, 'detailed');
    
    // Use AgentRunner with memory health integration for actual agent execution
    const taskId = `${action}-${Date.now()}`;
    const agentResult = await this.agentRunner.executeWithMemory(
      agent, 
      taskId, 
      enhancedContext, 
      async (taskContext) => {
        // Execute the original simulator work
        const simulatorResult = await this.simulator.simulateAgentWork(agent, action, taskContext);
        return {
          success: true,
          ...simulatorResult
        };
      }
    );
    
    // Surface any memory health issues that occurred during execution
    if (agentResult.healthCheckResult && !agentResult.healthCheckResult.healthy) {
      this.agentRunner.surfaceMemoryHealthIssues(agent, agentResult.healthCheckResult);
    }
    
    this.logger.taskComplete(`Agent work: ${agent}`, `Action completed: ${action}`, 'detailed');
    
    // Return the original simulator result format for compatibility
    return agentResult.executionResult || agentResult;
  }

  /**
   * Get resolved file paths for agent use
   * @returns {Object} All resolved file paths
   */
  getResolvedPaths() {
    if (!this.resolvedPaths) {
      throw new Error('File paths not yet resolved. Call initialize() first.');
    }
    return this.resolvedPaths;
  }

  /**
   * Find next approved story using resolved paths
   * @returns {Object} Story information or null if none found
   */
  findNextApprovedStory() {
    const findNextStory = require('../bmad-core/utils/find-next-story');
    return findNextStory.findNextApprovedStory(this.resolvedPaths.storyLocation);
  }

  /**
   * Execute structured task with resolved file paths
   * @param {string} taskId - Task identifier
   * @param {Object} context - Execution context
   * @returns {Object} Task execution result
   */
  async executeTaskWithPaths(taskId, context = {}) {
    const enhancedContext = {
      ...context,
      resolvedPaths: this.resolvedPaths,
      filePathResolver: this.filePathResolver
    };
    
    this.logger.taskStart(`Executing task: ${taskId}`, 'With resolved file paths', 'detailed');
    
    // This would integrate with the actual task execution system
    // For now, we'll simulate task execution
    const result = {
      taskId,
      success: true,
      context: enhancedContext,
      message: `Task ${taskId} executed with centralized file paths`
    };
    
    this.logger.taskComplete(`Executing task: ${taskId}`, 'Task completed successfully', 'detailed');
    return result;
  }

  /**
   * Run the orchestrator
   */
  async run(options = {}) {
    console.log(chalk.bold('🎼 BMad Workflow Orchestrator\n'));

    try {
      // Initialize configuration and logger
      await this.initialize();
      
      // Set non-interactive mode
      this.nonInteractive = options.nonInteractive || false;
      
      // Apply command-line overrides after initialization
      if (options.verbose === false) {
        this.logger.configure({ verbosity: false });
        this.simulator.configureLogger({ verbosity: false });
      } else if (options.verbose && typeof options.verbose === 'string') {
        this.logger.configure({ 
          verbosity: true, 
          verbosityLevel: options.verbose 
        });
        this.simulator.configureLogger({ 
          verbosity: true, 
          verbosityLevel: options.verbose 
        });
      }
      
      this.logger.phaseStart('Orchestrator Initialization', 'Setting up workflow environment');
      
      // Display memory health status at the beginning of each workflow
      const memoryHealthStatus = await this.displayMemoryHealthStatus();

      // Load reverse-alignment context (manifest + alignment report) to inform agents
      try {
        const { loadReverseContext } = require('./orchestrator/reverse-context');
        const rev = loadReverseContext(this.rootDir);
        if (rev && (rev.manifest || rev.alignment)) {
          console.log(chalk.bold('\n📎 Reverse Context Loaded'));
          rev.summary.forEach(line => console.log(' - ' + line));
          console.log(chalk.dim(`Manifest: ${rev.manifestPath}`));
          console.log(chalk.dim(`Alignment: ${rev.alignmentReportPath}`));
          console.log(chalk.dim('Agents: consider deviations and missing mentions when drafting epics/stories.'));
        } else {
          console.log(chalk.dim('No reverse context found (.ai/documentation-manifest.json)')); 
        }
      } catch (e) {
        this.logger.warn('Failed to load reverse context', e);
      }
      
      // Load existing metadata
      const metadata = this.loadMetadata();

      // Get story information (from file or options)
      this.logger.taskStart('Loading story information');
      let story = {};
      if (options.storyFile) {
        // Use resolved path if it's a relative path, otherwise use as provided
        const storyPath = path.resolve(this.rootDir, options.storyFile);
        if (fs.existsSync(storyPath)) {
          this.logger.taskStart('Reading story file', storyPath, 'detailed');
          const storyContent = fs.readFileSync(storyPath, 'utf8');
          // Parse story file (simplified - in real implementation would parse properly)
          story = {
            id: options.storyId || 'STORY-001',
            name: options.storyName || 'Story from ' + path.basename(storyPath),
            file: storyPath,
            content: storyContent
          };
          this.logger.taskComplete('Reading story file', `Loaded story: ${story.name}`);
        } else {
          // Try to find story in the configured story location
          const storyFileName = path.basename(options.storyFile);
          const storyPathInLocation = path.join(this.resolvedPaths.storyLocation, storyFileName);
          if (fs.existsSync(storyPathInLocation)) {
            this.logger.taskStart('Reading story file from story location', storyPathInLocation, 'detailed');
            const storyContent = fs.readFileSync(storyPathInLocation, 'utf8');
            story = {
              id: options.storyId || 'STORY-001',
              name: options.storyName || 'Story from ' + storyFileName,
              file: storyPathInLocation,
              content: storyContent
            };
            this.logger.taskComplete('Reading story file from story location', `Loaded story: ${story.name}`);
          } else {
            throw new Error(`Story file not found: ${options.storyFile} (checked ${storyPath} and ${storyPathInLocation})`);
          }
        }
      } else {
        story = {
          id: options.storyId || 'STORY-001',
          name: options.storyName || 'Development Story'
        };
      }
      this.logger.taskComplete('Loading story information', `Story: ${story.name} (${story.id})`)

      // Select workflow mode and flow type if not provided
      let workflowMode = options.workflowMode || 'single';
      let flowType = options.flowType;
      let epicId = options.epicId;
      
      if (!flowType && metadata.workflowMode && metadata.flowType) {
        console.log(chalk.dim(`Using previously selected workflow: ${metadata.workflowMode} mode with ${metadata.flowType} flow`));
        workflowMode = metadata.workflowMode;
        flowType = metadata.flowType;
        epicId = metadata.epicId;
      } else if (!options.workflowMode && !options.flowType) {
        const selection = await this.selectWorkflowMode(options.nonInteractive, options.workflowMode, options.flowType);
        workflowMode = selection.workflowMode;
        flowType = selection.flowType;
        
        // If epic loop mode is selected, prompt for epic selection
        if (workflowMode === 'epic-loop') {
          epicId = await this.selectEpic(options.nonInteractive, options.epicId);
        }
      } else if (!flowType) {
        flowType = await this.selectFlowType(options.nonInteractive);
      }

      // Save metadata
      this.saveMetadata({
        ...metadata,
        workflowMode,
        flowType,
        epicId,
        storyId: story.id,
        lastRun: new Date().toISOString()
      });

      // Execute the workflow based on mode
      let result;
      if (workflowMode === 'epic-loop') {
        if (!epicId) {
          throw new Error('Epic ID is required for epic loop mode');
        }
        this.logger.phaseStart('Epic Loop Execution', `Starting epic loop for Epic ${epicId} with ${flowType} flow`);
        result = await this.executeEpicLoop(epicId, flowType);
      } else {
        this.logger.phaseStart('Single Story Execution', `Starting ${flowType} workflow for story ${story.id}`);
        result = await this.executeDevQAWorkflow(story, flowType);
      }

      // Save execution results to metadata
      const executionResult = {
        workflowMode,
        flowType,
        epicId,
        storyId: story.id,
        lastRun: new Date().toISOString(),
        lastResult: workflowMode === 'epic-loop' ? {
          success: result?.epicCompleted || false,
          processedStories: result?.processedStories || 0,
          totalIterations: result?.totalIterations || 0,
          epicId: result?.epicId
        } : {
          success: result?.qaResult?.approved || false,
          iterations: result?.iterations || 1
        }
      };

      this.saveMetadata({
        ...metadata,
        ...executionResult
      });

      this.logger.phaseComplete('Orchestrator Initialization');
      
    } catch (error) {
      this.logger.error('Orchestration failed', error);
      console.error(chalk.red('\n❌ Orchestration failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI Setup
const program = new Command();

program
  .name('bmad-orchestrator')
  .description('BMad Method Workflow Orchestrator - Choose between linear and iterative Dev↔QA flows')
  .version('1.0.0');

program
  .command('run')
  .description('Run the workflow orchestrator for a story or epic')
  .option('-s, --story-file <path>', 'Path to the story file')
  .option('--story-id <id>', 'Story ID')
  .option('--story-name <name>', 'Story name')
  .option('-m, --workflow-mode <mode>', 'Workflow mode: single or epic-loop')
  .option('--mode <mode>', 'Orchestration mode: greenfield, brownfield, etc.')
  .option('-e, --epic-id <id>', 'Epic ID for epic loop mode')
  .option('-f, --flow-type <type>', 'Flow type: linear or iterative')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-v, --verbose <level>', 'Verbosity level: minimal, normal, or detailed', 'normal')
  .option('--no-verbose', 'Disable verbose output')
  .option('--non-interactive', 'Run in non-interactive mode (no user prompts)')
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    await orchestrator.run(options);
  });

// Reverse-Alignment: Cleanup docs
program
  .command('cleanup-docs')
  .description('Clean up docs directory to core set (PRD, architecture, brief, workflow-orchestrator) and remove test/temporary docs')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const res = await orchestrator.cleanupDocs();
      console.log(chalk.green(`Removed ${res.removed.length} items; kept ${res.kept.length} core docs`));
    } catch (e) {
      console.error(chalk.red('Cleanup failed:'), e.message);
      process.exit(1);
    }
  });

// Reverse-Alignment: Analyze implementation (Analyst)
program
  .command('analyst-analyze')
  .description('Analyze codebase changes and extract implemented features')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    console.log(chalk.green(`Analysis complete. Features detected: ${analysis.features.filter(f => f.present).length}`));
    console.log(chalk.dim(path.join('.ai', 'reverse', 'analysis.json')));
  });

// Reverse-Alignment: Rewrite architecture (Architect)
program
  .command('architect-rewrite')
  .description('Reverse engineer architecture from implementation and rewrite docs/architecture/architecture.md')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const out = await orchestrator.rewriteArchitectureFromImplementation(analysis);
    console.log(chalk.green('Architecture updated:'), path.relative(process.cwd(), out));
  });

// Reverse-Alignment: Update PRD (PM)
program
  .command('pm-update-prd')
  .description('Update PRD from implementation and document missing requirements')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const out = await orchestrator.updatePRDFromImplementation(analysis);
    console.log(chalk.green('PRD updated:'), path.relative(process.cwd(), out));
  });

// Reverse-Alignment: Recreate stories (Scrum Master)
program
  .command('sm-recreate-stories')
  .description('Recreate all stories in docs/stories/ based on implemented features')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const files = await orchestrator.recreateStoriesFromCode(analysis);
    console.log(chalk.green(`Recreated ${files.length} stories in docs/stories/`));
  });

// (duplicate removed)

// SM: Normalize stories to SM template
program
  .command('sm-normalize-stories')
  .description('Auto-fix docs/stories/*.md to conform to SM story template; creates StoryContract and missing sections if needed')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-f, --file <path>', 'Normalize a single story file')
  .option('--dry-run', 'Do not write changes, just report if changes would be made', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const res = await orchestrator.normalizeStoriesAgainstTemplate({ dryRun: !!options.dryRun, file: options.file ? path.resolve(options.file) : null });
      const tag = options.dryRun ? 'would change' : 'changed';
      console.log(chalk.green(`Stories processed: ${res.processed}; ${res.changed} ${tag}`));
      if (res.details?.length) {
        res.details.forEach(d => {
          if (d.changed) console.log(`- ${path.relative(process.cwd(), d.file)} ${tag}`);
        });
      }
      if (options.dryRun && res.changed > 0) process.exitCode = 1; // signal changes needed
    } catch (e) {
      console.error(chalk.red('SM normalize failed:'), e.message);
      process.exit(1);
    }
  });

// SM: Review stories for template compliance
program
  .command('sm-review-stories')
  .description('Review all docs/stories/*.md and validate they follow the SM story template (frontmatter + required sections)')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const report = await orchestrator.reviewStoriesAgainstTemplate();
      console.log(chalk.bold('📋 Story Template Compliance Report'));
      console.log(`Checked: ${report.checked}`);
      console.log(chalk.green(`Compliant: ${report.compliant}`));
      const non = report.nonCompliant;
      if (non > 0) {
        console.log(chalk.yellow(`Non-compliant: ${non}`));
        report.issues.forEach(issue => {
          console.log(`- ${path.relative(process.cwd(), issue.file)}`);
          if (issue.frontmatter?.length) console.log(`  Frontmatter: ${issue.frontmatter.join('; ')}`);
          if (issue.missingSections?.length) console.log(`  Missing sections: ${issue.missingSections.length}`);
        });
        process.exitCode = 1;
      } else {
        console.log(chalk.green('All stories follow the SM template.'));
      }
    } catch (e) {
      console.error(chalk.red('SM review failed:'), e.message);
      process.exit(1);
    }
  });

// Reverse-Alignment: Validate story consistency (Orchestrator)
program
  .command('validate-story-consistency')
  .description('Validate recreated stories reference real files and align with implementation')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const res = await orchestrator.validateStoryConsistency(analysis);
    console.log(chalk.green(`Checked ${res.checked} stories; ${res.valid} valid`));
    if (res.issues.length) {
      console.log(chalk.yellow('Issues:'));
      res.issues.forEach(i => console.log(` - ${path.relative(process.cwd(), i.file)} → missing ${i.missing}`));
    }
  });

// Reverse-Alignment: QA validate and coverage report
program
  .command('qa-validate-alignment')
  .description('QA agent validates docs-code alignment and generates coverage report')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const coverage = await orchestrator.qaValidateDocsCodeAlignment(analysis);
    console.log(chalk.green('Coverage report written to .ai/reports/docs-code-alignment.json'));
    console.log(coverage);
  });

// Reverse-Alignment: Generate alignment report (Orchestrator)
program
  .command('generate-alignment-report')
  .description('Generate alignment report combining story checks and docs coverage')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    const report = await orchestrator.generateAlignmentReport(analysis);
    console.log(chalk.green('Alignment report written to .ai/reports/alignment-report.json'));
    console.log({ stories: report.stories, docsCoverage: report.docsCoverage });
  });

// Reverse-Alignment: Create documentation manifest
program
  .command('create-documentation-manifest')
  .description('Create .ai/documentation-manifest.json summarizing docs and features')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('--dry-run', 'Compute analysis but do not write files', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    const analysis = await orchestrator.analyzeImplementation();
    if (options.dryRun) {
      console.log(chalk.yellow('Dry run: would create .ai/documentation-manifest.json (and alias)'));
      console.log(chalk.dim(`Features detected: ${analysis.features?.length || 0}, entities: ${analysis.entities?.length || 0}`));
    } else {
      const out = await orchestrator.createDocumentationManifest(analysis);
      console.log(chalk.green('Documentation manifest created at'), path.relative(process.cwd(), out));
    }
  });

// Dev↔QA: Iterative flow with clean context per phase
program
  .command('dev-qa-iterative')
  .description('Run iterative Dev↔QA flow with orchestrated Dev and QA handoffs (no external bash script)')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-s, --story <pathOrId>', 'Story file path or Story ID (required)')
  .option('-m, --max <number>', 'Max iterations', (v) => parseInt(v, 10), 4)
  .option('--codex', 'Attempt to call Codex CLI for Dev steps', false)
  .action(async (options) => {
    const root = options.directory || process.cwd();
    if (!options.story) {
      console.error(chalk.red('Missing required option: --story <pathOrId>'));
      process.exit(1);
    }

    // Resolve story path and id
    function findStoryById(id) {
      const storiesDir = path.join(root, 'docs', 'stories');
      const matches = [];
      function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.isFile() && p.endsWith('.md')) {
            const txt = fs.readFileSync(p, 'utf8');
            if (new RegExp(`(^|\n)\s*StoryContract:\\s*[\s\S]*?story_id:\\s*\"?${id}\"?`, 'm').test(txt)) {
              matches.push(p);
            }
          }
        }
      }
      if (fs.existsSync(storiesDir)) walk(storiesDir);
      return matches[0] || null;
    }

    const storyArg = String(options.story);
    const storyPath = fs.existsSync(path.isAbsolute(storyArg) ? storyArg : path.join(root, storyArg))
      ? path.resolve(root, storyArg)
      : findStoryById(storyArg);

    if (!storyPath) {
      console.error(chalk.red(`Could not resolve story from: ${storyArg}`));
      process.exit(1);
    }

    console.log(chalk.blue('\n🔄 Starting iterative Dev↔QA flow (in-session handoffs) ...\n'));
    console.log(`📖 Story: ${path.relative(root, storyPath)}`);

    // Helpers to get/update story status
    function getStoryStatus(filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const m = content.match(/##\s*Status\s*\n\s*([^\n]+)/i);
        return m ? m[1].trim() : 'Unknown';
      } catch (_) { return 'Unknown'; }
    }
    function setStoryStatus(filePath, status) {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        const re = /(##\s*Status\s*\n\s*)(.+)/i;
        if (re.test(content)) {
          content = content.replace(re, `$1${status}`);
          fs.writeFileSync(filePath, content, 'utf8');
          return true;
        }
        return false;
      } catch (_) { return false; }
    }

    const RunnerClass = AgentRunner || require('./orchestrator/agent-runner-shim');
    const runner = new RunnerClass({ memoryEnabled: true, healthMonitoringEnabled: true });

    // Execute a structured task via TaskRunner if available
    async function execStructuredTask(agentName, taskFile, context) {
      try {
        const TaskRunner = require('./task-runner');
        const tr = new TaskRunner(root);
        const result = await tr.executeTask(agentName, taskFile, {
          ...context,
          allowMissingUserInput: true
        });
        if (result && result.success) {
          console.log(chalk.dim(`Structured task completed: ${path.relative(root, taskFile)}`));
          return { success: true };
        }
        return { success: false, error: result?.error || 'unknown_error' };
      } catch (e) {
        console.log(chalk.yellow(`Structured task failed: ${path.relative(root, taskFile)} → ${e.message}`));
        return { success: false, error: e.message };
      }
    }

    // Utility: find core path (prefer hidden core in installed projects)
    function corePath(rel) {
      const p1 = path.join(root, '.bmad-core', rel);
      if (fs.existsSync(p1)) return p1;
      const p2 = path.join(root, 'bmad-core', rel);
      return p2;
    }

    // QA gate runner (strict) with fallbacks
    function packageHasScript(name) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        return !!(pkg.scripts && pkg.scripts[name]);
      } catch (_) { return false; }
    }

    async function runQAGate(storyId) {
      const qaGate = fs.existsSync(path.join(root, 'tools', 'orchestrator', 'gates', 'qa-gate.js'))
        ? path.join(root, 'tools', 'orchestrator', 'gates', 'qa-gate.js')
        : corePath(path.join('tools', 'orchestrator', 'gates', 'qa-gate.js'));
      try {
        if (fs.existsSync(qaGate)) {
          console.log(chalk.cyan(`[QA] Running QA gate via ${path.relative(root, qaGate)} for story ${storyId}`));
          require('child_process').execFileSync(process.execPath, [qaGate, String(storyId)], { stdio: 'inherit', cwd: root });
          return true;
        }
        if (packageHasScript('gate:qa')) {
          console.log(chalk.cyan('[QA] Running npm run gate:qa (fallback)'));
          require('child_process').execSync('npm run -s gate:qa', { stdio: 'inherit', cwd: root });
          return true;
        }
        if (packageHasScript('test')) {
          console.log(chalk.cyan('[QA] Running npm test (fallback)'));
          require('child_process').execSync('npm test --silent', { stdio: 'inherit', cwd: root });
          return true;
        }
        console.log(chalk.yellow('[QA] No QA gate found; cannot assert pass.'));
        return false;
      } catch (e) {
        console.log(chalk.yellow(`[QA] Gate execution failed: ${e.message}`));
        return false;
      }
    }

    // Fix verification (requires 100% completion)
    async function verifyFixes() {
      const scripts = [
        corePath(path.join('utils', 'verify-qa-fixes.js')),
        path.join(root, 'bmad-core', 'utils', 'verify-qa-fixes.js')
      ];
      const verifyScript = scripts.find(p => fs.existsSync(p));
      if (!verifyScript) {
        console.log(chalk.yellow('[Verify] verify-qa-fixes.js not found; treating verification as failed.'));
        return false;
      }
      try {
        console.log(chalk.cyan(`[Verify] Running ${path.relative(root, verifyScript)}`));
        require('child_process').execFileSync(process.execPath, [verifyScript], { stdio: 'inherit', cwd: root });
        return true;
      } catch (_) {
        return false;
      }
    }

    async function runDevPhase(iteration) {
      console.log(chalk.cyan(`\n🤖 Orchestrator: 🔄 Switching to Dev role (iteration ${iteration}).`));
      const context = { storyPath: storyPath, projectRoot: root };
      try {
        // Prefer structured task for addressing QA feedback when available
        const fixTask = corePath(path.join('structured-tasks', 'address-qa-feedback.yaml'));
        if (fs.existsSync(fixTask)) {
          console.log(chalk.blue('🩹 Addressing QA feedback via structured task...'));
          const res = await execStructuredTask('dev', fixTask, context);
          if (res && res.success) return true;
        }
        // As a fallback, try Codex CLI if explicitly enabled
        if (options.codex) {
          try {
            require('child_process').execSync(`codex "as dev agent, execute *address-qa-feedback @${path.relative(root, storyPath)}"`, { stdio: 'inherit', cwd: root, env: { ...process.env, NO_UPDATE_NOTIFIER: '1', BMAD_NONINTERACTIVE: '1' } });
            return true;
          } catch (e) {
            console.log(chalk.yellow('Codex CLI not available or failed; continuing without it.'));
          }
        }
        console.log(chalk.yellow('No automated Dev fix path succeeded; proceed to QA to gather findings.'));
        return true;
      } catch (e) {
        console.log(chalk.yellow(`⚠️  Dev phase encountered an issue: ${e.message}`));
        return false;
      }
    }

    const maxIters = Number(options.max) || 4;
    let iter = 1;
    while (iter <= maxIters) {
      console.log(chalk.magenta(`\n===== Iteration ${iter}/${maxIters}: DEV → QA =====`));

      await runDevPhase(iter);

      // Always verify fixes (requires 100% completion)
      const verified = await verifyFixes();

      console.log(chalk.cyan('\n🤖 Orchestrator: 🔄 Switching to QA role. Running QA review...'));
      const qaPassed = await runQAGate(path.basename(storyPath));
      if (qaPassed) {
        if (verified) {
          setStoryStatus(storyPath, 'Done');
          console.log(chalk.green(`\n✅ QA approved and all fixes verified on iteration ${iter}. Story marked as Done.`));
          process.exit(0);
        } else {
          console.log(chalk.yellow('\n⚠️  QA passed but fix verification is incomplete. Iterating again.'));
        }
      } else {
        console.log(chalk.yellow(`\n⚠️  QA found issues on iteration ${iter}. Returning to Dev...`));
      }
      iter++;
    }
    console.log(chalk.red(`\n✗ Reached max iterations (${maxIters}) without QA approval.`));
    process.exit(1);
  });

// Reverse-Alignment: Full pipeline
program
  .command('reverse-align')
  .description('Run reverse alignment pipeline: analyze → generate shards → (optional) rewrite human docs → validate → report → manifest')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-e, --epic-id <number>', 'Numeric epic ID to use for generated stories (default 99)', (v) => parseInt(v, 10))
  .option('--preserve-stories', 'Do not delete or recreate docs/stories', false)
  .option('--shard-only', 'Only shard PRD/Architecture per config and exit', false)
  .option('--rewrite-human', 'Also rewrite docs/architecture.md and docs/prd/PRD.md from implementation (destructive to human text)', false)
  .option('--handoff-human', 'Hand off to PM and Architect agents to write/update human PRD/Architecture from implementation', false)
  .option('--write', 'No-op; for CLI parity (writing is default)', false)
  .option('--dry-run', 'Compute analysis and reports only; do not write docs/manifest', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      if (options.epicId && !Number.isNaN(options.epicId)) {
        orchestrator.reverseEpicId = options.epicId;
      }
      orchestrator.preserveStories = !!options.preserveStories;
      // Suppress transient devLoad warnings until shards are ensured
      orchestrator.suppressDevLoadWarnings = true;
      // Precompute dep-report for lifecycle classification (unused/deprecated)
      try {
        const gen = require('./deps/generate-dep-report');
        const rep = gen.generate(orchestrator.rootDir);
        const outDir = require('path').join(orchestrator.rootDir, '.ai');
        const fsExtra = require('fs-extra');
        await fsExtra.ensureDir(outDir);
        await fsExtra.writeJson(require('path').join(outDir, 'dep-report.json'), rep, { spaces: 2 });
      } catch (_) { /* non-fatal */ }
      if (options.shardOnly) {
        await orchestrator.shardDocuments();
        console.log('Sharding complete.');
        return;
      }
      // Pre-analysis and pre-coverage on current docs
      const analysis = await orchestrator.analyzeImplementation();
      let preCoverage = await orchestrator.qaValidateDocsCodeAlignment(analysis);
      if (preCoverage.totalFeatures > 0 && preCoverage.mentioned < preCoverage.totalFeatures) {
        console.log(chalk.yellow(`Pre-cleanup coverage: ${preCoverage.mentioned}/${preCoverage.totalFeatures} features mentioned in docs`));
      }
      // If dry-run, skip all writes and just produce reports
      if (options.dryRun) {
        await orchestrator.generateAlignmentReport(analysis);
        console.log(chalk.green('Reverse-align (dry-run) complete: analysis and reports updated.'));
        console.log(chalk.dim('.ai/reports/alignment-report.json'));
        return;
      }
      // Default: do not modify human docs; ensure shards exist
      if (options.rewriteHuman) {
        await orchestrator.cleanupDocs();
        await orchestrator.rewriteArchitectureFromImplementation(analysis);
        await orchestrator.updatePRDFromImplementation(analysis);
      }
      await orchestrator.shardDocuments();
      // Re-enable warnings after shard
      orchestrator.suppressDevLoadWarnings = false;
      if (!orchestrator.preserveStories) {
        await orchestrator.recreateStoriesFromCode(analysis);
        await orchestrator.validateStoryConsistency(analysis);
      }
      // Ensure minimal generated PRD/Architecture shards exist before coverage
      try {
        await orchestrator.generateGArchitecture(analysis);
        await orchestrator.generateGPRD(analysis);
      } catch (_) { /* non-fatal */ }
      // Optional: Handoff to PM and Architect to write human docs from implementation (non-interactive agent steps)
      if (options.handoffHuman) {
        try {
          console.log(chalk.cyan('🔄 Switching to PM role to update PRD from implementation...'));
          await orchestrator.updatePRDFromImplementation(analysis);
          console.log(chalk.green('✅ PM updated PRD (docs/prd/PRD.md)'));
        } catch (e) {
          console.log(chalk.yellow(`PM handoff failed: ${e.message}`));
        }
        try {
          console.log(chalk.cyan('🔄 Switching to Architect role to rewrite Architecture from implementation...'));
          await orchestrator.rewriteArchitectureFromImplementation(analysis);
          console.log(chalk.green('✅ Architect updated Architecture (docs/architecture/architecture.md)'));
        } catch (e) {
          console.log(chalk.yellow(`Architect handoff failed: ${e.message}`));
        }
      }
      const postCoverage = await orchestrator.qaValidateDocsCodeAlignment(analysis);
      if (postCoverage.totalFeatures > 0 && postCoverage.mentioned < postCoverage.totalFeatures) {
        console.log(chalk.yellow(`Post-rewrite coverage: ${postCoverage.mentioned}/${postCoverage.totalFeatures} features mentioned. Some features are not referenced in docs.`));
        try {
          const implemented = analysis.features.filter(f => f.present && !f.deprecated);
          const arch = fs.existsSync(path.join(orchestrator.rootDir, 'docs', 'architecture', 'architecture.md')) ? fs.readFileSync(path.join(orchestrator.rootDir, 'docs', 'architecture', 'architecture.md'), 'utf8').toLowerCase() : '';
          const prd = fs.existsSync(path.join(orchestrator.rootDir, 'docs', 'prd', 'PRD.md')) ? fs.readFileSync(path.join(orchestrator.rootDir, 'docs', 'prd', 'PRD.md'), 'utf8').toLowerCase() : '';
          const docsText = (arch + '\n' + prd);
          const missing = implemented.filter(f => !docsText.includes((f.name || '').toLowerCase())).map(f => f.name);
          if (missing.length) {
            console.log(chalk.yellow('Not mentioned features:'));
            missing.forEach(n => console.log(' - ' + n));
          }
        } catch (_) {}
      } else {
        console.log(chalk.green('Docs mention all implemented features detected.'));
      }
      await orchestrator.generateAlignmentReport(analysis);
      await orchestrator.createDocumentationManifest(analysis);
      // Generate Graveyard for deprecated/unused
      try {
        const gy = await orchestrator.generateGraveyard(analysis);
        console.log(chalk.dim(' - ' + gy));
      } catch (_) { /* non-fatal */ }
      // Print paths of generated shards
      try {
        const garch = path.join(this.rootDir, 'docs', 'architecture.generated', 'architecture.generated.md');
        const gprd = path.join(this.rootDir, 'docs', 'prd.generated', 'PRD.generated.md');
        console.log(chalk.dim('Generated:'));
        console.log(chalk.dim(' - ' + garch));
        console.log(chalk.dim(' - ' + gprd));
      } catch (_) { /* non-fatal */ }
      console.log(chalk.green('Reverse alignment complete.'));
    } catch (e) {
      console.error(chalk.red('Reverse alignment failed:'), e.message);
      process.exit(1);
    }
  });

// Reverse-Alignment: PO sharding step
program
  .command('po-shard-docs')
  .description('Shard PRD and Architecture into component files based on core-config.yaml settings')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      await orchestrator.shardDocuments();
      console.log(chalk.green('Sharding complete (PRD/Architecture components created where enabled).'));
    } catch (e) {
      console.error(chalk.red('Sharding failed:'), e.message);
      process.exit(1);
    }
  });

// EpicContract validator shortcut
program
  .command('validate-epic <epic>')
  .description('Validate an EpicContract file and emit reports (.ai/adhoc, .ai/reports)')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (epic, options) => {
    const cwd = options.directory || process.cwd();
    try {
      const { spawnSync } = require('child_process');
      const res = spawnSync(process.execPath, ['scripts/validate-epic-contract.js', '--file', epic], {
        cwd,
        stdio: 'inherit'
      });
      const code = res.status == null ? 1 : res.status;
      if (code !== 0) process.exit(code);
    } catch (e) {
      console.error(chalk.red('Epic validation failed to execute:'), e.message);
      process.exit(1);
    }
  });

// Reverse-Alignment: Quality Gate
program
  .command('reverse-quality-gate')
  .description('Validate enriched reverse-aligned docs (architecture/PRD) and analysis, emit .ai/reports/reverse-align-gate.json')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('-t, --threshold <ratio>', 'Minimum feature mention coverage ratio (0-1), default 0.8', parseFloat, 0.8)
  .option('--dry-run', 'Report results without failing build', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const res = await orchestrator.reverseAlignQualityGate(options.threshold ?? 0.8);
      const status = res.pass ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`Reverse-Align Quality Gate: ${status}`);
      res.checks.forEach(c => console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.details ? ' — ' + c.details : ''}`));
      if (res.coverage) console.log(`Coverage: ${res.coverage.mentioned}/${res.coverage.total} (missing: ${res.coverage.missing.join(', ') || 'none'})`);
      console.log(chalk.dim('.ai/reports/reverse-align-gate.json'));
      if (!res.pass && !options.dryRun) process.exit(3);
    } catch (e) {
      console.error(chalk.red('Quality gate failed to execute:'), e.message);
      if (!options.dryRun) process.exit(3);
    }
  });

// Story candidates generator (capped)
program
  .command('generate-stories')
  .description('Generate capped story candidates from implementation evidence (non-destructive)')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('--cap <number>', 'Maximum number of candidates to create (default 10)', (v) => parseInt(v, 10), 10)
  .option('--dry-run', 'List candidates but do not write files', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const analysis = await orchestrator.analyzeImplementation();
      const created = await orchestrator.generateStoryCandidates(analysis, { cap: options.cap, dryRun: !!options.dryRun });
      console.log(chalk.green(`${options.dryRun ? 'Planned' : 'Created'} ${created.length} story candidate(s).`));
      created.forEach(p => console.log(chalk.dim(' - ' + p)));
    } catch (e) {
      console.error(chalk.red('Failed to generate stories:'), e.message);
      process.exit(1);
    }
  });

// Simple quality gate (coverage + optional delta-only)
program
  .command('quality-gate')
  .description('Enforce coverage threshold and optional delta-only drift check')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('--coverage <ratio>', 'Minimum coverage ratio (0-1), default 0.85', parseFloat, 0.85)
  .option('--delta-only', 'Fail only if drift (missing) increases vs baseline', false)
  .option('--critical-only', 'Check only critical allowlist coverage', false)
  .option('--critical-path <path>', 'Override path to critical entities JSON', null)
  .option('--baseline-ref <ref>', 'Git ref to compute delta baseline (advisory if unavailable)', null)
  .option('--dry-run', 'Produce report without failing build', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const res = await orchestrator.simpleQualityGate(options.coverage ?? 0.85, !!options.deltaOnly, { criticalOnly: !!options.criticalOnly, criticalPath: options.criticalPath, baselineRef: options.baselineRef });
      const status = res.pass ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`Quality Gate: ${status}`);
      res.checks.forEach(c => console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.details ? ' — ' + c.details : ''}`));
      console.log(`Coverage: ${res.ratio.toFixed(2)} (${res.mentioned ?? (res.total - res.missing)}/${res.total})`);
      if (!options.dryRun) {
        if (!res.pass) process.exit(3);
        if (res.advisory) process.exit(2);
      } else {
        console.log(chalk.dim('Dry-run: not failing build'));
      }
    } catch (e) {
      console.error(chalk.red('Quality gate failed to execute:'), e.message);
      process.exit(3);
    }
  });

// Normalize stories (non-destructive); ensures StoryContract frontmatter/sections
program
  .command('normalize-stories')
  .description('Normalize stories to ensure StoryContract frontmatter and required sections')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('--file <path>', 'Normalize a single story file path')
  .option('--dry-run', 'Do not write changes; report only', false)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      const res = await orchestrator.normalizeStoriesAgainstTemplate({ dryRun: !!options.dryRun, file: options.file || null });
      console.log(chalk.green(`Normalized ${res.processed} stor${res.processed === 1 ? 'y' : 'ies'}.`));
      if (res.changed && res.changed.length) {
        console.log(chalk.dim('Changed files:'));
        res.changed.forEach(f => console.log(chalk.dim(' - ' + f)));
      }
    } catch (e) {
      console.error(chalk.red('Failed to normalize stories:'), e.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show the current orchestrator status and metadata')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    
    try {
      await orchestrator.initialize();
      const metadata = orchestrator.loadMetadata();
      
      if (Object.keys(metadata).length === 0) {
        console.log(chalk.yellow('No orchestrator metadata found'));
      } else {
        console.log(chalk.bold('🎼 Orchestrator Status\n'));
        console.log(`Workflow Mode: ${metadata.workflowMode || 'single'}`);
        console.log(`Flow Type: ${metadata.flowType || 'Not set'}`);
        
        if (metadata.workflowMode === 'epic-loop' && metadata.epicId) {
          console.log(`Epic ID: ${metadata.epicId}`);
          
          // Show epic status if available
          try {
            const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
            const epicStatus = getEpicStatus(orchestrator.resolvedPaths.storyLocation, metadata.epicId);
            console.log(`Epic Progress: ${epicStatus.completedStories}/${epicStatus.totalStories} completed`);
            console.log(`Pending Stories: ${epicStatus.pendingStories}`);
          } catch (error) {
            console.log(chalk.dim('Epic status unavailable'));
          }
        }
        
        console.log(`Last Story ID: ${metadata.storyId || 'N/A'}`);
        console.log(`Last Run: ${metadata.lastRun || 'Never'}`);
        
        if (metadata.lastResult) {
          if (metadata.workflowMode === 'epic-loop') {
            console.log(`Last Result: ${metadata.lastResult.success ? 'Epic Completed' : 'Epic In Progress'}`);
            console.log(`Stories Processed: ${metadata.lastResult.processedStories || 0}`);
            console.log(`Total Iterations: ${metadata.lastResult.totalIterations || 0}`);
          } else {
            console.log(`Last Result: ${metadata.lastResult.success ? 'Success' : 'Failed'}`);
            if (metadata.lastResult.iterations) {
              console.log(`Iterations: ${metadata.lastResult.iterations}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error showing status:'), error.message);
    }
  });

// Manifest-only refresh command (Manifest v1)
program
  .command('refresh-manifest')
  .description('Extract code evidence and write .ai/documentation-manifest.json (and alias .ai/evidence-manifest.json)')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .option('--dry-run', 'Compute analysis but do not write files', false)
  .option('--since <ref>', 'Limit scan to files changed since git ref', null)
  .option('--paths <globs>', 'Comma-separated globs to limit scan paths', null)
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    try {
      // Build analyze options
      const analyzeOpts = {};
      const onlyPaths = new Set();
      if (options.paths) {
        try {
          const { globSync } = require('glob');
          const globs = String(options.paths).split(',').map(s => s.trim()).filter(Boolean);
          for (const g of globs) {
            const matches = globSync(g, { cwd: orchestrator.rootDir, dot: false, nodir: true });
            matches.forEach(m => onlyPaths.add(m.replace(/\\/g, '/')));
          }
        } catch (_) {}
      }
      if (options.since) {
        try {
          const { execSync } = require('child_process');
          const out = execSync(`git diff --name-only ${options.since}...HEAD`, { cwd: orchestrator.rootDir, encoding: 'utf8' });
          out.split(/\r?\n/).filter(Boolean).forEach(f => onlyPaths.add(f.replace(/\\/g, '/')));
        } catch (e) {
          console.log(chalk.yellow(`Could not compute --since diff: ${e.message}`));
        }
      }
      if (onlyPaths.size > 0) analyzeOpts.onlyPaths = onlyPaths;
      const analysis = await orchestrator.analyzeImplementation(analyzeOpts);
      if (options.dryRun) {
        console.log(chalk.yellow('Dry run: manifest would be written to .ai/documentation-manifest.json and .ai/evidence-manifest.json'));
        console.log(chalk.dim(`Features detected: ${analysis.features?.length || 0}`));
      } else {
        const out = await orchestrator.createDocumentationManifest(analysis);
        console.log(chalk.green('Manifest refreshed.'));
        console.log(chalk.dim(out));
      }
    } catch (e) {
      console.error(chalk.red('Manifest refresh failed:'), e.message);
      process.exit(1);
    }
  });

// Generate dep-report.json (reachability) for lifecycle classification
program
  .command('generate-dep-report')
  .description('Analyze local imports and write .ai/dep-report.json with unreachable modules')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const root = options.directory || process.cwd();
    try {
      const gen = require('./deps/generate-dep-report');
      const { unreachable } = gen.generate(root);
      console.log(chalk.green(`Generated dep-report.json with ${unreachable.length} unreachable item(s).`));
    } catch (e) {
      console.error(chalk.red('Failed to generate dep-report:'), e.message);
      process.exit(1);
    }
  });

program
  .command('list-epics')
  .description('List all available epics with their story counts and status')
  .option('-d, --directory <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    const orchestrator = new WorkflowOrchestrator(options.directory);
    
    try {
      await orchestrator.initialize();
      const allStories = orchestrator.getAllStoriesStatus();
      
      // Group stories by epic ID
      const epicGroups = {};
      allStories.forEach(story => {
        if (story.epicId) {
          if (!epicGroups[story.epicId]) {
            epicGroups[story.epicId] = [];
          }
          epicGroups[story.epicId].push(story);
        }
      });

      if (Object.keys(epicGroups).length === 0) {
        console.log(chalk.yellow('No epics found in the stories directory'));
        return;
      }

      console.log(chalk.bold('📚 Available Epics\n'));
      
      const { getEpicStatus } = require('../bmad-core/utils/find-next-story');
      
      Object.keys(epicGroups)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(epicId => {
          const status = getEpicStatus(orchestrator.resolvedPaths.storyLocation, epicId);
          const statusColor = status.isComplete ? chalk.green : 
                             status.pendingStories > 0 ? chalk.blue : 
                             chalk.yellow;
          
          console.log(statusColor(`Epic ${epicId}:`));
          console.log(`  Total Stories: ${status.totalStories}`);
          console.log(`  Completed: ${status.completedStories}`);
          console.log(`  In Progress: ${status.inProgressStories}`);
          console.log(`  Pending: ${status.pendingStories}`);
          console.log(`  Status: ${status.isComplete ? '✅ Complete' : status.pendingStories > 0 ? '🔄 Ready for processing' : '⏳ No approved stories'}`);
          console.log('');
        });
    } catch (error) {
      console.error(chalk.red('Error listing epics:'), error.message);
    }
  });

// Only parse arguments if this is the main module
if (require.main === module) {
  // Parse command line arguments
  program.parse(process.argv);

  // If no command specified, show help
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

module.exports = WorkflowOrchestrator;
