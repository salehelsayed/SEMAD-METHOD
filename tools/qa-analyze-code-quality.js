#!/usr/bin/env node
/**
 * Static quality scanner used by starter projects (e.g. mknoon/p2p-chat).
 *
 * Provides heuristics for:
 *  - file size, function length, cyclomatic complexity, nesting depth
 *  - comment density and duplication signals
 *  - per-file quality scoring + markdown/json reports
 *
 * Configuration follows .semad-core/core-config.yaml->codeQuality.
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const yaml = require('js-yaml');
const { globSync } = require('glob');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join('.ai', 'quality-reports');
const CODE_EXTS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'cts', 'mts', 'mjs', 'cjs',
  'java', 'kt', 'kts', 'groovy', 'cs', 'go', 'rs', 'swift', 'scala', 'dart',
  'c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'm', 'mm',
  'rb', 'py', 'php', 'fs', 'fsx', 'sql', 'lua', 'sh', 'bash', 'zsh'
]);
const COMPLEXITY_REGEX = /\b(if|else\s+if|for|while|case|catch|switch|when|guard|except|elif|foreach|loop|try)\b|\?|&&|\|\|/g;
const EXCLUDE_DEFAULT = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.ai/**',
  '**/.semad-core/**',
  '**/semad-core/**',
  '**/bmad-core/**'
];
const DUP_MIN_WINDOW = 6;
const INDENT_SIZE = 4;

(async function main() {
  const program = new Command();
  program
    .option('--target <path>', 'File or directory to analyze')
    .option('--files <paths...>', 'Specific files or glob patterns to include')
    .option('--all', 'Analyze all code files in repository')
    .option('--modified', 'Analyze git modified files (default fallback)')
    .option('--scope <name>', 'Override analysis scope label')
    .option('--out <dir>', 'Output directory for reports')
    .option('--format <fmt>', 'Report format (markdown|json|both)', 'markdown')
    .option('--json', 'Alias for --format json')
    .option('--force-pass', 'Do not exit with non-zero status on critical issues')
    .option('--debug', 'Verbose logging')
    .allowUnknownOption(true)
    .parse(process.argv);
  const opts = program.opts();

  if (opts.json) opts.format = 'json';
  opts.format = (opts.format || 'markdown').toLowerCase();
  if (!['markdown', 'json', 'both'].includes(opts.format)) {
    console.error(`Unsupported format: ${opts.format}`);
    process.exit(1);
  }

  const config = loadCoreConfig(opts.debug);
  const codeQuality = config?.codeQuality || {};
  const skipFailure = opts.forcePass || opts.fail === false;

  if (!codeQuality.enabled && !skipFailure) {
    console.error('Code quality analysis disabled in core-config.yaml (codeQuality.enabled = false).');
    process.exit(1);
  }

  const files = collectTargetFiles(opts, codeQuality, opts.debug);
  if (files.length === 0) {
    console.error('No source files found for analysis. Use --target, --files, --all, or stage files.');
    process.exit(1);
  }

  const reports = files.map((file) => analyzeFile(file, codeQuality));
  detectDuplicates(reports, codeQuality);
  const summary = buildSummary(reports, codeQuality, opts.scope);

  const outputDir = path.resolve(ROOT, opts.out || codeQuality.reporting?.outputDirectory || DEFAULT_OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  const baseName = `quality-report-${timestamp}`;

  const markdownPath = path.join(outputDir, `${baseName}.md`);
  const jsonPath = path.join(outputDir, `${baseName}.json`);

  if (opts.format === 'markdown' || opts.format === 'both') {
    fs.writeFileSync(markdownPath, toMarkdown(summary));
  }
  if (opts.format === 'json' || opts.format === 'both') {
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  }

  if (opts.debug) {
    console.log('Analyzed files:\n' + files.map((f) => `  • ${f}`).join('\n'));
  }

  console.log('Code quality analysis complete');
  if (opts.format === 'json') {
    console.log(`Report: ${path.relative(ROOT, jsonPath)}`);
  } else if (opts.format === 'markdown') {
    console.log(`Report: ${path.relative(ROOT, markdownPath)}`);
  } else {
    console.log(`Reports:\n  - ${path.relative(ROOT, markdownPath)}\n  - ${path.relative(ROOT, jsonPath)}`);
  }

  if (!skipFailure && summary.counts.critical > 0 && codeQuality.qualityGates?.blockOnCritical !== false) {
    console.error('Critical quality issues detected. Failing with exit code 1.');
    process.exit(1);
  }
})();

function loadCoreConfig(debug) {
  const candidates = [
    path.join(ROOT, '.semad-core', 'core-config.yaml'),
    path.join(ROOT, 'semad-core', 'core-config.yaml'),
    path.join(ROOT, 'bmad-core', 'core-config.yaml')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const doc = yaml.load(fs.readFileSync(candidate, 'utf8'));
        if (debug) console.log(`Loaded codeQuality config from ${candidate}`);
        return doc || {};
      } catch (err) {
        console.warn(`Failed to parse ${candidate}: ${err.message}`);
      }
    }
  }
  return {};
}

function collectTargetFiles(opts, codeQuality, debug) {
  const files = new Set();
  const exclude = [...EXCLUDE_DEFAULT, ...(codeQuality.excludePatterns || [])];

  const addFile = (absPath) => {
    if (!absPath) return;
    const rel = path.relative(ROOT, absPath);
    if (!rel || rel.startsWith('..')) return;
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (!CODE_EXTS.has(ext)) return;
    files.add(rel);
  };

  const globAdd = (cwd) => {
    const matches = globSync('**/*', {
      cwd,
      nodir: true,
      absolute: true,
      ignore: exclude
    });
    matches.forEach(addFile);
  };

  if (opts.all) {
    globAdd(ROOT);
  }

  if (Array.isArray(opts.files)) {
    for (const pattern of opts.files) {
      const candidate = path.isAbsolute(pattern) ? pattern : path.resolve(ROOT, pattern);
      if (fs.existsSync(candidate)) {
        const stat = fs.statSync(candidate);
        if (stat.isDirectory()) globAdd(candidate);
        else addFile(candidate);
      } else {
        const matches = globSync(pattern, { cwd: ROOT, nodir: true, absolute: true, ignore: exclude });
        matches.forEach(addFile);
      }
    }
  }

  if (opts.target) {
    const targetPath = path.isAbsolute(opts.target) ? opts.target : path.resolve(ROOT, opts.target);
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) globAdd(targetPath);
      else addFile(targetPath);
    } else if (debug) {
      console.warn(`Target not found: ${opts.target}`);
    }
  }

  const useModified = opts.modified || (!opts.all && !opts.target && (!opts.files || opts.files.length === 0));
  if (useModified) {
    try {
      const output = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
      output.split('\n').forEach((line) => {
        if (!line.trim()) return;
        const filePath = line.slice(3).trim();
        if (!filePath) return;
        addFile(path.resolve(ROOT, filePath));
      });
    } catch (err) {
      if (debug) console.warn(`git status failed: ${err.message}`);
    }
  }

  return Array.from(files).sort();
}

function analyzeFile(relPath, codeQuality) {
  const absPath = path.resolve(ROOT, relPath);
  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const ext = path.extname(relPath).slice(1).toLowerCase();

  const commentStyle = getCommentStyle(ext);
  const structureStyle = getStructureStyle(ext);

  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let complexity = 0;
  let braceDepth = 0;
  let maxBraceDepth = 0;
  let maxIndentDepth = 0;
  let inBlockComment = false;
  const normalizedLines = [];
  const trimmedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    trimmedLines.push(trimmed);

    if (!trimmed) {
      blankLines++;
      normalizedLines.push('');
      continue;
    }

    if (commentStyle === 'slash') {
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) inBlockComment = false;
        normalizedLines.push('');
        continue;
      }
      const blockIdx = trimmed.indexOf('/*');
      if (blockIdx === 0) {
        commentLines++;
        if (!trimmed.includes('*/', blockIdx + 2)) inBlockComment = true;
        normalizedLines.push('');
        continue;
      }
      const slashIdx = trimmed.indexOf('//');
      if (slashIdx === 0) {
        commentLines++;
        normalizedLines.push('');
        continue;
      }
      if (blockIdx > 0) {
        const before = trimmed.slice(0, blockIdx).trim();
        if (!trimmed.includes('*/', blockIdx + 2)) inBlockComment = true;
        if (!before) {
          commentLines++;
          normalizedLines.push('');
          continue;
        }
      }
      if (slashIdx > 0) {
        const before = trimmed.slice(0, slashIdx).trim();
        if (!before) {
          commentLines++;
          normalizedLines.push('');
          continue;
        }
      }
    } else if (commentStyle === 'hash') {
      if (trimmed.startsWith('#')) {
        commentLines++;
        normalizedLines.push('');
        continue;
      }
    } else if (commentStyle === 'sql') {
      if (trimmed.startsWith('--')) {
        commentLines++;
        normalizedLines.push('');
        continue;
      }
      if (trimmed.startsWith('/*')) {
        commentLines++;
        if (!trimmed.includes('*/')) inBlockComment = true;
        normalizedLines.push('');
        continue;
      }
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) inBlockComment = false;
        normalizedLines.push('');
        continue;
      }
    } else if (commentStyle === 'html') {
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('-->')) inBlockComment = false;
        normalizedLines.push('');
        continue;
      }
      if (trimmed.startsWith('<!--')) {
        commentLines++;
        if (!trimmed.includes('-->')) inBlockComment = true;
        normalizedLines.push('');
        continue;
      }
    }

    codeLines++;
    const normalized = trimmed.replace(/\s+/g, ' ');
    normalizedLines.push(normalized);

    const withoutStrings = normalized.replace(/(".*?"|'.*?'|`.*?`)/g, '');
    const matches = withoutStrings.match(COMPLEXITY_REGEX);
    if (matches) complexity += matches.length;

    if (structureStyle === 'brace') {
      for (const ch of withoutStrings) {
        if (ch === '{') {
          braceDepth++;
          if (braceDepth > maxBraceDepth) maxBraceDepth = braceDepth;
        } else if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
        }
      }
    } else if (structureStyle === 'indent') {
      const indent = raw.match(/^\s*/)[0].length;
      const depth = Math.floor(indent / INDENT_SIZE);
      if (depth > maxIndentDepth) maxIndentDepth = depth;
    }
  }

  const commentDensity = (commentLines === 0 && codeLines === 0)
    ? 0
    : commentLines / Math.max(1, commentLines + codeLines);

  const functions = findFunctionCandidates(trimmedLines, relPath);
  const functionMetrics = computeFunctionMetrics(functions, trimmedLines.length);
  const classes = findClassCandidates(trimmedLines);

  const report = {
    filePath: relPath,
    totalLines: lines.length,
    codeLines,
    commentLines,
    blankLines,
    commentDensity,
    complexity,
    averageComplexity: codeLines ? complexity / codeLines : 0,
    maxNestingDepth: structureStyle === 'brace' ? maxBraceDepth : maxIndentDepth,
    functions: functionMetrics,
    classes,
    normalizedLines,
    violations: [],
    suggestions: []
  };

  applyQualityRules(report, codeQuality);
  return report;
}

function getCommentStyle(ext) {
  if (['py', 'rb', 'sh', 'bash', 'zsh', 'toml', 'yml', 'yaml', 'ini'].includes(ext)) return 'hash';
  if (['sql'].includes(ext)) return 'sql';
  if (['html', 'xml', 'vue', 'svelte'].includes(ext)) return 'html';
  return 'slash';
}

function getStructureStyle(ext) {
  if (['py', 'rb', 'sh', 'bash', 'zsh'].includes(ext)) return 'indent';
  if (['yml', 'yaml'].includes(ext)) return 'none';
  return 'brace';
}

function findFunctionCandidates(lines, filePath) {
  const candidates = [];
  const patterns = [
    { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, name: 1 },
    { regex: /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(.*\)\s*=>/, name: 1 },
    { regex: /^\s*(?:export\s+)?let\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(.*\)\s*=>/, name: 1 },
    { regex: /^\s*(?:async\s+)?([A-Za-z0-9_$]+)\s*=\s*function\b/, name: 1 },
    { regex: /^\s*(?:public|protected|private)?\s*(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$<>\[\]]+)\s+([A-Za-z0-9_$]+)\s*\(.*\)\s*\{?/, name: 2 },
    { regex: /^\s*def\s+([A-Za-z0-9_]+)/, name: 1 },
    { regex: /^\s*async\s+def\s+([A-Za-z0-9_]+)/, name: 1 },
    { regex: /^\s*fn\s+([A-Za-z0-9_]+)/, name: 1 },
    { regex: /^\s*func\s+([A-Za-z0-9_]+)/, name: 1 },
    { regex: /^\s*([A-Za-z0-9_]+)\s*:\s*function\b/, name: 1 }
  ];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line) continue;
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = match[pattern.name] || `anonymous@${idx + 1}`;
        candidates.push({ line: idx, name });
        break;
      }
    }
  }
  return candidates;
}

function computeFunctionMetrics(candidates, totalLines) {
  if (candidates.length === 0) {
    return {
      count: 0,
      maxLength: 0,
      averageLength: 0,
      overThreshold: [],
      entries: []
    };
  }
  const entries = candidates.map((candidate, idx) => {
    const next = candidates[idx + 1] ? candidates[idx + 1].line : totalLines;
    const length = Math.max(1, next - candidate.line);
    return { name: candidate.name, line: candidate.line + 1, length };
  });
  const maxLength = Math.max(...entries.map((e) => e.length));
  const avgLength = entries.reduce((sum, e) => sum + e.length, 0) / entries.length;
  return {
    count: entries.length,
    maxLength,
    averageLength: avgLength,
    overThreshold: [],
    entries
  };
}

function findClassCandidates(lines) {
  const classes = [];
  const patterns = [
    /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/,
    /^\s*class\s+([A-Za-z0-9_]+)/,
    /^\s*data\s+class\s+([A-Za-z0-9_]+)/,
    /^\s*struct\s+([A-Za-z0-9_]+)/,
    /^\s*interface\s+([A-Za-z0-9_]+)/
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        classes.push({ name: match[1], line: i + 1 });
        break;
      }
    }
  }
  return {
    count: classes.length,
    entries: classes
  };
}

function applyQualityRules(report, codeQuality) {
  const metrics = codeQuality.metrics || {};
  const maxFileLines = metrics.maxFileLines || 500;
  const maxFunctionLines = metrics.maxFunctionLines || 50;
  const maxComplexity = metrics.maxCyclomaticComplexity || 10;
  const maxClassLines = metrics.maxClassLines || 300;
  const maxNestingDepth = metrics.maxNestingDepth || 4;
  const minComment = metrics.commentDensityMin ?? 0.1;
  const maxComment = metrics.commentDensityMax ?? 0.4;

  let score = 100;

  if (report.totalLines > maxFileLines) {
    const severity = report.totalLines > maxFileLines * 1.5 ? 'critical' : 'major';
    const penalty = severity === 'critical' ? 20 : 10;
    report.violations.push({
      severity,
      metric: 'file-size',
      message: `File has ${report.totalLines} lines (threshold ${maxFileLines}).`
    });
    score -= penalty;
  }

  if (report.functions.count > 0) {
    const over = report.functions.entries.filter((fn) => fn.length > maxFunctionLines);
    if (over.length) {
      const severity = over.some((fn) => fn.length > maxFunctionLines * 1.5) ? 'critical' : 'major';
      const penalty = severity === 'critical' ? 15 : 8;
      report.violations.push({
        severity,
        metric: 'function-length',
        message: `${over.length} function(s) exceed ${maxFunctionLines} lines.`
      });
      report.functions.overThreshold = over.map((fn) => ({ name: fn.name, line: fn.line, length: fn.length }));
      score -= penalty;
    }
  }

  if (report.averageComplexity > maxComplexity) {
    const severity = report.averageComplexity > maxComplexity * 1.5 ? 'major' : 'minor';
    const penalty = severity === 'major' ? 8 : 4;
    report.violations.push({
      severity,
      metric: 'complexity',
      message: `Average complexity ${report.averageComplexity.toFixed(2)} exceeds ${maxComplexity}.`
    });
    score -= penalty;
  }

  if (report.maxNestingDepth > maxNestingDepth) {
    const severity = report.maxNestingDepth > maxNestingDepth + 2 ? 'major' : 'minor';
    const penalty = severity === 'major' ? 6 : 3;
    report.violations.push({
      severity,
      metric: 'nesting-depth',
      message: `Max nesting depth ${report.maxNestingDepth} exceeds ${maxNestingDepth}.`
    });
    score -= penalty;
  }

  if (report.commentDensity < minComment) {
    report.violations.push({
      severity: 'minor',
      metric: 'comment-density',
      message: `Comment density ${(report.commentDensity * 100).toFixed(1)}% below minimum ${(minComment * 100).toFixed(0)}%.`
    });
    score -= 3;
  }
  if (report.commentDensity > maxComment && maxComment > 0) {
    report.violations.push({
      severity: 'minor',
      metric: 'comment-density',
      message: `Comment density ${(report.commentDensity * 100).toFixed(1)}% above maximum ${(maxComment * 100).toFixed(0)}%.`
    });
    score -= 2;
  }

  if (report.classes.count > 0 && report.totalLines / report.classes.count > maxClassLines) {
    report.violations.push({
      severity: 'major',
      metric: 'class-size',
      message: `Average lines per class ${(report.totalLines / report.classes.count).toFixed(1)} exceeds ${maxClassLines}.`
    });
    score -= 6;
  }

  if (report.normalizedLines.filter(Boolean).length === 0) {
    score -= 5;
    report.violations.push({ severity: 'minor', metric: 'empty-file', message: 'File has no code lines after filtering comments.' });
  }

  report.qualityScore = Math.max(0, Math.min(100, Math.round(score)));
  report.grade = gradeFromScore(report.qualityScore);
}

function detectDuplicates(reports, codeQuality) {
  const threshold = codeQuality.metrics?.duplicateCodeThreshold || 30;
  const window = Math.max(DUP_MIN_WINDOW, Math.min(20, Math.floor(threshold / 2)));
  const map = new Map();

  reports.forEach((report) => {
    const lines = report.normalizedLines;
    for (let i = 0; i <= lines.length - window; i++) {
      const slice = lines.slice(i, i + window);
      if (slice.every((line) => line && line.length > 2)) {
        const key = slice.join('\n');
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ file: report.filePath, start: i + 1, end: i + window });
      }
    }
  });

  const duplicates = [];
  for (const [snippet, occurrences] of map.entries()) {
    if (occurrences.length < 2) continue;
    duplicates.push({
      snippet: snippet.split('\n').slice(0, window).join('\n'),
      occurrences
    });
  }

  reports.forEach((report) => {
    const matches = duplicates.filter((dup) => dup.occurrences.some((occ) => occ.file === report.filePath));
    if (matches.length) {
      report.violations.push({
        severity: 'major',
        metric: 'duplication',
        message: `${matches.length} duplicated block(s) detected`
      });
      report.duplication = matches;
      report.qualityScore = Math.max(0, report.qualityScore - 8);
      report.grade = gradeFromScore(report.qualityScore);
    }
  });
}

function buildSummary(reports, codeQuality, scopeOverride) {
  const totals = reports.reduce(
    (acc, report) => {
      acc.score += report.qualityScore;
      acc.lines += report.totalLines;
      report.violations.forEach((v) => acc.bySeverity[v.severity]++);
      return acc;
    },
    { score: 0, lines: 0, bySeverity: { critical: 0, major: 0, minor: 0 } }
  );

  const overallScore = reports.length ? totals.score / reports.length : 0;
  const grade = gradeFromScore(overallScore);

  return {
    generatedAt: new Date().toISOString(),
    scope: scopeOverride || inferScope(reports, codeQuality),
    totals: {
      files: reports.length,
      lines: totals.lines,
      overallScore: Number(overallScore.toFixed(1)),
      grade
    },
    counts: {
      critical: totals.bySeverity.critical,
      major: totals.bySeverity.major,
      minor: totals.bySeverity.minor
    },
    reports: reports.sort((a, b) => a.filePath.localeCompare(b.filePath))
  };
}

function inferScope(reports, codeQuality) {
  if (!reports.length) return 'empty';
  if (codeQuality?.analysisScope) return codeQuality.analysisScope;
  if (reports.length <= 5) return 'targeted';
  return 'repository';
}

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function toMarkdown(summary) {
  const lines = [];
  lines.push('# Code Quality Analysis Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Analysis Scope: ${summary.scope}`);
  lines.push(`Files Analyzed: ${summary.totals.files}`);
  lines.push(`Overall Quality Score: ${summary.totals.overallScore}/100`);
  lines.push(`Grade: ${summary.totals.grade}`);
  lines.push('');
  lines.push('## Issue Summary');
  lines.push('');
  lines.push(`- Critical issues: ${summary.counts.critical}`);
  lines.push(`- Major issues: ${summary.counts.major}`);
  lines.push(`- Minor issues: ${summary.counts.minor}`);
  lines.push('');
  lines.push('## File Scores');
  lines.push('');
  lines.push('| File | Score | Grade | Lines | Functions | Max Function | Max Nesting | Issues |');
  lines.push('|------|-------|-------|-------|-----------|--------------|-------------|--------|');
  summary.reports.forEach((report) => {
    const issues = report.violations.length ? report.violations.map((v) => v.severity[0].toUpperCase()).join(',') : '—';
    lines.push(`| ${report.filePath} | ${report.qualityScore} | ${report.grade} | ${report.totalLines} | ${report.functions.count} | ${report.functions.maxLength} | ${report.maxNestingDepth} | ${issues} |`);
  });
  lines.push('');
  summary.reports.forEach((report) => {
    lines.push(`### ${report.filePath}`);
    lines.push('');
    lines.push(`- Lines: ${report.totalLines} (code ${report.codeLines}, comments ${report.commentLines})`);
    lines.push(`- Comment density: ${(report.commentDensity * 100).toFixed(1)}%`);
    lines.push(`- Complexity: ${report.complexity} total, avg ${report.averageComplexity.toFixed(2)}`);
    lines.push(`- Functions: ${report.functions.count} (max length ${report.functions.maxLength})`);
    lines.push(`- Classes: ${report.classes.count}`);
    lines.push(`- Max nesting depth: ${report.maxNestingDepth}`);
    lines.push(`- Quality score: ${report.qualityScore} (${report.grade})`);
    if (report.violations.length) {
      lines.push('');
      lines.push('**Violations:**');
      report.violations.forEach((v) => {
        lines.push(`- [${v.severity.toUpperCase()}] ${v.message}`);
      });
    }
    if (report.functions.overThreshold?.length) {
      lines.push('');
      lines.push('**Long functions:**');
      report.functions.overThreshold.forEach((fn) => {
        lines.push(`- ${fn.name} (line ${fn.line}) — ${fn.length} lines`);
      });
    }
    if (report.duplication) {
      lines.push('');
      lines.push('**Duplicated blocks detected:**');
      report.duplication.forEach((dup, index) => {
        lines.push(`- Block ${index + 1} (${dup.occurrences.length} occurrences)`);
        dup.occurrences.forEach((occ) => {
          lines.push(`  - ${occ.file}:${occ.start}-${occ.end}`);
        });
      });
    }
    lines.push('');
  });
  return lines.join('\n');
}
