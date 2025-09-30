#!/usr/bin/env node
/**
 * Feature Coverage Scanner - Full Traceability Implementation
 *
 * Purpose: Parse PRD, epics, stories, code, and tests to provide comprehensive
 * end-to-end traceability from PRD features → epics → stories → code → tests.
 * Supports FEAT-*, EPIC-*, ST-*, and AC-* ID patterns for complete coverage tracking.
 *
 * Usage:
 *   node tools/feature-coverage.js \
 *     [--prd docs/prd/PRD.md] \
 *     [--epics docs/epics] \
 *     [--stories docs/stories] \
 *     [--code src] \
 *     [--tests tests] \
 *     [--threshold 100] \
 *     [--report .ai/reports/feature-coverage.json] \
 *     [--markdown .ai/reports/feature-coverage.md] \
 *     [--manifest .ai/documentation-manifest.json] \
 *     [--min-test-coverage 80] \
 *     [--fail-on-below]
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');
const { loadStoryContract } = require('../semad-core/utils/story-contract');

function argMap(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

function findPrdReqs(prdPath) {
  const out = { 
    features: [], 
    featureMap: {}, 
    prdReqs: [], 
    acceptance: [],
    acceptanceMap: {} 
  };
  if (!prdPath) return out;
  const content = readSafe(prdPath);
  if (!content) return out;
  
  // Parse YAML front-matter block if present
  const fmMatch = content.match(/^---[\s\S]*?---/);
  if (fmMatch) {
    try {
      const fm = yaml.load(fmMatch[0].replace(/^---\n?|\n?---$/g, '')) || {};
      if (Array.isArray(fm.features)) {
        fm.features.forEach(f => {
          if (f.id) {
            out.features.push(f.id);
            out.featureMap[f.id] = f;
          }
        });
      }
      if (Array.isArray(fm.acceptanceCriteria)) {
        fm.acceptanceCriteria.forEach(ac => {
          if (ac.id) {
            out.acceptance.push(ac.id);
            out.acceptanceMap[ac.id] = ac;
          }
        });
      }
    } catch {}
  }
  
  // Enhanced pattern matching for new ID formats
  const featRe = /FEAT-[A-Za-z0-9_-]+/g;
  const acRe = /AC-[A-Za-z0-9_-]+/g;
  const prdRe = /PRD-REQ-[0-9]+/g;
  
  const feats = new Set();
  const acs = new Set();
  const prdReqs = new Set();
  
  let m;
  while ((m = featRe.exec(content))) feats.add(m[0]);
  while ((m = acRe.exec(content))) acs.add(m[0]);
  while ((m = prdRe.exec(content))) prdReqs.add(m[0]);
  
  // Merge found IDs with front-matter data
  feats.forEach(id => {
    if (!out.features.includes(id)) out.features.push(id);
  });
  acs.forEach(id => {
    if (!out.acceptance.includes(id)) out.acceptance.push(id);
  });
  
  out.prdReqs = Array.from(prdReqs);
  return out;
}

function scanEpics(epicsDir) {
  const res = { 
    count: 0, 
    prdLinks: new Set(), 
    featureLinks: new Set(),
    epicIds: new Set(),
    epicFeatureMap: {},
    files: [] 
  };
  if (!epicsDir || !exists(epicsDir)) return res;
  const files = glob.sync(path.join(epicsDir, '**/*.{yml,yaml,md,json}'), { nodir: true });
  res.files = files;
  res.count = files.length;
  
  for (const f of files) {
    const content = readSafe(f);
    const epicName = path.basename(f, path.extname(f));
    
    // Scan for various ID patterns
    const prdRe = /PRD-REQ-[0-9]+/g;
    const featRe = /FEAT-[A-Za-z0-9_-]+/g;
    const epicRe = /EPIC-[A-Za-z0-9_-]+/g;
    
    let m;
    while ((m = prdRe.exec(content))) res.prdLinks.add(m[0]);
    while ((m = featRe.exec(content))) {
      res.featureLinks.add(m[0]);
      if (!res.epicFeatureMap[epicName]) res.epicFeatureMap[epicName] = [];
      res.epicFeatureMap[epicName].push(m[0]);
    }
    while ((m = epicRe.exec(content))) res.epicIds.add(m[0]);
    
    // Try to extract featureId from YAML front-matter
    const fmMatch = content.match(/^---[\s\S]*?---/);
    if (fmMatch) {
      try {
        const fm = yaml.load(fmMatch[0].replace(/^---\n?|\n?---$/g, '')) || {};
        if (fm.featureId) {
          res.featureLinks.add(fm.featureId);
          if (!res.epicFeatureMap[epicName]) res.epicFeatureMap[epicName] = [];
          res.epicFeatureMap[epicName].push(fm.featureId);
        }
        if (fm.epicId) res.epicIds.add(fm.epicId);
      } catch {}
    }
  }
  return res;
}

function scanStories(storiesDir) {
  const res = { 
    count: 0, 
    prdRefs: new Set(), 
    epicLinks: new Set(),
    featureLinks: new Set(),
    storyIds: new Set(),
    acCovered: new Set(),
    storyAcMap: {},
    files: [] 
  };
  if (!storiesDir || !exists(storiesDir)) return res;
  const files = glob.sync(path.join(storiesDir, '**/*.{md,markdown,yml,yaml,json}'), { nodir: true });
  res.files = files;
  res.count = files.length;
  
  for (const f of files) {
    const content = readSafe(f);
    const storyName = path.basename(f, path.extname(f));
    
    // Scan for all ID patterns
    const prdRe = /PRD-REQ-[0-9]+/g;
    const epicRe = /EPIC-[A-Za-z0-9_-]+/g;
    const featRe = /FEAT-[A-Za-z0-9_-]+/g;
    const storyRe = /ST-[A-Za-z0-9_-]+/g;
    const acRe = /AC-[A-Za-z0-9_-]+/g;
    
    let m;
    while ((m = prdRe.exec(content))) res.prdRefs.add(m[0]);
    while ((m = epicRe.exec(content))) res.epicLinks.add(m[0]);
    while ((m = featRe.exec(content))) res.featureLinks.add(m[0]);
    while ((m = storyRe.exec(content))) res.storyIds.add(m[0]);
    
    const storyAcs = [];
    while ((m = acRe.exec(content))) {
      res.acCovered.add(m[0]);
      storyAcs.push(m[0]);
    }
    if (storyAcs.length) res.storyAcMap[storyName] = storyAcs;
    
    // Prefer unified contract loader (XML pointer or YAML)
    try {
      const { contract } = loadStoryContract(f);
      const storyId = contract?.story_id || contract?.story?.storyId;
      if (storyId) res.storyIds.add(String(storyId));
      const epicId = contract?.epic_id || contract?.story?.epicId;
      if (epicId) res.epicLinks.add(String(epicId));
      const featureId = contract?.traceability?.featureId || contract?.story?.featureId;
      if (featureId) res.featureLinks.add(String(featureId));
      const covered = Array.isArray(contract?.traceability?.acceptanceCriteriaCovered)
        ? contract.traceability.acceptanceCriteriaCovered
        : Array.isArray(contract?.acceptanceCriteriaLinks)
          ? contract.acceptanceCriteriaLinks.map(s => (String(s).split(':')[0] || '').trim()).filter(Boolean)
          : [];
      covered.forEach(ac => res.acCovered.add(String(ac)));
    } catch (_) { /* ignore */ }
  }
  return res;
}

function scanCode(codeDir) {
  const res = { 
    files: [], 
    featTags: new Set(), 
    epicTags: new Set(),
    storyTags: new Set(),
    codeTraceability: []
  };
  if (!codeDir || !exists(codeDir)) return res;
  const files = glob.sync(path.join(codeDir, '**/*.*'), { nodir: true, ignore: ['**/node_modules/**', '**/.git/**'] });
  res.files = files;
  
  for (const f of files) {
    const content = readSafe(f);
    const relativePath = path.relative(process.cwd(), f);
    
    // Enhanced patterns for annotations
    const rFeat = /(?:\/\/|\/\*|#)\s*FEAT\s*:\s*([A-Za-z0-9_-]+)/g;
    const rEpic = /(?:\/\/|\/\*|#)\s*EPIC\s*:\s*([A-Za-z0-9_-]+)/g;
    const rStory = /(?:\/\/|\/\*|#)\s*STORY\s*:\s*([A-Za-z0-9_-]+)/g;
    
    let m;
    const fileTags = { file: relativePath, feats: [], epics: [], stories: [] };
    
    while ((m = rFeat.exec(content))) {
      const tag = m[1].startsWith('FEAT-') ? m[1] : `FEAT-${m[1]}`;
      res.featTags.add(tag);
      fileTags.feats.push(tag);
    }
    while ((m = rEpic.exec(content))) {
      const tag = m[1].startsWith('EPIC-') ? m[1] : `EPIC-${m[1]}`;
      res.epicTags.add(tag);
      fileTags.epics.push(tag);
    }
    while ((m = rStory.exec(content))) {
      const tag = m[1].startsWith('ST-') ? m[1] : `ST-${m[1]}`;
      res.storyTags.add(tag);
      fileTags.stories.push(tag);
    }
    
    if (fileTags.feats.length || fileTags.epics.length || fileTags.stories.length) {
      res.codeTraceability.push(fileTags);
    }
  }
  return res;
}

function scanTests(testsDir) {
  const res = { 
    files: [], 
    acTags: new Set(),
    testAcMap: {},
    testEvidence: []
  };
  if (!testsDir || !exists(testsDir)) return res;
  const files = glob.sync(path.join(testsDir, '**/*.*'), { nodir: true, ignore: ['**/node_modules/**', '**/.git/**'] });
  res.files = files;
  
  for (const f of files) {
    const content = readSafe(f);
    const relativePath = path.relative(process.cwd(), f);
    
    // Scan for AC tags in test names, comments, and descriptions
    const rAC = /\bAC-[A-Za-z0-9_-]+/g;
    const testAcs = [];
    
    let m;
    while ((m = rAC.exec(content))) {
      res.acTags.add(m[0]);
      testAcs.push(m[0]);
    }
    
    if (testAcs.length) {
      res.testAcMap[relativePath] = testAcs;
      res.testEvidence.push({
        file: relativePath,
        acceptanceCriteria: testAcs,
        passed: true // Assume passing for now, can be enhanced with test results
      });
    }
  }
  return res;
}

async function ensureDir(p) {
  await fsp.mkdir(path.dirname(p), { recursive: true }).catch(() => {});
}

function pct(n, d) { return d === 0 ? 0 : Math.round((n / d) * 100); }

async function main() {
  const args = argMap(process.argv);
  const prdPath = args.prd || path.join('docs', 'prd', 'PRD.md');
  const epicsDir = args.epics || path.join('docs', 'epics');
  const storiesDir = args.stories || path.join('docs', 'stories');
  const codeDir = args.code || 'src';
  const testsDir = args.tests || 'tests';
  const threshold = Number(args.threshold != null ? args.threshold : 100);
  const minTestCoverage = Number(args['min-test-coverage'] || 80);
  const manifestPath = args.manifest || path.join('.ai', 'documentation-manifest.json');
  const jsonOut = args.report || path.join('.ai', 'reports', 'feature-coverage.json');
  const mdOut = args.markdown || path.join('.ai', 'reports', 'feature-coverage.md');
  const ignoreFile = args.ignore || path.join('.ai', 'coverage-ignore.json');
  const failOnBelow = !!args['fail-on-below'];
  
  // Load ignore list
  let ignoreList = { features: [], stories: [], tests: [] };
  if (fs.existsSync(ignoreFile)) {
    try {
      ignoreList = JSON.parse(fs.readFileSync(ignoreFile, 'utf8'));
      console.log(`Loaded ignore list from ${ignoreFile}`);
    } catch (e) {
      console.warn(`Warning: Failed to parse ${ignoreFile}: ${e.message}`);
    }
  }

  const prd = findPrdReqs(prdPath);
  const epics = scanEpics(epicsDir);
  const stories = scanStories(storiesDir);
  const code = scanCode(codeDir);
  const tests = scanTests(testsDir);

  // Apply ignore list filtering
  const activeFeatures = prd.features.filter(f => !ignoreList.features?.includes(f));
  const activeStories = Array.from(stories.storyIds).filter(s => !ignoreList.stories?.includes(s));
  const activeTests = Array.from(tests.acTags).filter(t => !ignoreList.tests?.includes(t));
  
  // Enhanced coverage calculations (with ignore list applied)
  const totalFeatures = activeFeatures.length;
  const featuresWithEpics = activeFeatures.filter(f => epics.featureLinks.has(f)).length;
  const featuresWithStories = activeFeatures.filter(f => stories.featureLinks.has(f)).length;
  const featuresWithCode = activeFeatures.filter(f => code.featTags.has(f)).length;
  
  // Legacy PRD-REQ coverage
  const totalReqs = prd.prdReqs.length;
  const epicCovers = new Set([...epics.prdLinks]);
  const storyCovers = new Set([...stories.prdRefs]);
  const prdCoveredByEpic = [...prd.prdReqs].filter(id => epicCovers.has(id)).length;
  const prdCoveredByStory = [...prd.prdReqs].filter(id => storyCovers.has(id)).length;

  // Acceptance criteria coverage
  const acTotal = prd.acceptance.length;
  const acCoveredByStories = [...stories.acCovered].filter(ac => prd.acceptance.includes(ac)).length;
  const acCoveredByTests = [...tests.acTags].filter(tag => prd.acceptance.includes(tag)).length;

  const metrics = {
    // Feature-level coverage
    featureTotal: totalFeatures,
    featureCoveredByEpics: featuresWithEpics,
    featureCoveredByStories: featuresWithStories,
    featureCoveredByCode: featuresWithCode,
    featureEpicCoveragePct: pct(featuresWithEpics, totalFeatures),
    featureStoryCoveragePct: pct(featuresWithStories, totalFeatures),
    featureCodeCoveragePct: pct(featuresWithCode, totalFeatures),
    
    // Legacy PRD-REQ coverage
    prdTotal: totalReqs,
    prdCoveredByEpics: prdCoveredByEpic,
    prdCoveredByStories: prdCoveredByStory,
    prdEpicCoveragePct: pct(prdCoveredByEpic, totalReqs),
    prdStoryCoveragePct: pct(prdCoveredByStory, totalReqs),
    
    // Acceptance criteria coverage
    acceptanceTotal: acTotal,
    acceptanceCoveredByStories: acCoveredByStories,
    acceptanceCoveredByTests: acCoveredByTests,
    acceptanceStoryCoveragePct: pct(acCoveredByStories, acTotal),
    acceptanceTestCoveragePct: pct(acCoveredByTests, acTotal),
    
    // Implementation tracking
    epicCount: epics.epicIds.size,
    storyCount: stories.storyIds.size,
    codeFeatTags: code.featTags.size,
    codeEpicTags: code.epicTags.size,
    codeStoryTags: code.storyTags.size,
    testAcTags: tests.acTags.size,
    
    artifacts: {
      prdPath,
      epicsDir,
      storiesDir,
      codeDir,
      testsDir,
      manifestPath
    }
  };

  // Calculate comprehensive coverage score
  const scoreParts = [];
  if (totalFeatures > 0) {
    scoreParts.push(metrics.featureEpicCoveragePct, metrics.featureStoryCoveragePct, metrics.featureCodeCoveragePct);
  }
  if (totalReqs > 0) {
    scoreParts.push(metrics.prdEpicCoveragePct, metrics.prdStoryCoveragePct);
  }
  if (acTotal > 0) {
    scoreParts.push(metrics.acceptanceStoryCoveragePct, metrics.acceptanceTestCoveragePct);
  }
  const overall = scoreParts.length ? Math.round(scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length) : 0;
  const pass = overall >= threshold && metrics.acceptanceTestCoveragePct >= minTestCoverage;

  // Build traceability manifest
  const traceabilityManifest = {
    features: prd.features.map(fId => ({
      id: fId,
      name: prd.featureMap[fId]?.name || fId,
      epics: Array.from(epics.epicIds).filter(eId => eId.includes(fId)),
      stories: Array.from(stories.storyIds).filter(sId => sId.includes(fId)),
      codePaths: code.codeTraceability.filter(t => t.feats.includes(fId)).map(t => t.file),
      testCases: Object.entries(tests.testAcMap)
        .filter(([_, acs]) => acs.some(ac => ac.includes(fId.replace('FEAT-', ''))))
        .map(([file, _]) => file)
    })),
    acceptanceCriteria: prd.acceptance.map(acId => ({
      id: acId,
      stories: Array.from(stories.storyIds).filter(sId => 
        stories.storyAcMap[sId]?.includes(acId)
      ),
      tests: Object.entries(tests.testAcMap)
        .filter(([_, acs]) => acs.includes(acId))
        .map(([file, _]) => file)
    }))
  };

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      overallPct: overall,
      threshold,
      minTestCoverage,
      status: pass ? 'pass' : 'fail',
      message: pass ? 'All coverage thresholds met' : 
        `Coverage below threshold: ${overall}% < ${threshold}% or test coverage ${metrics.acceptanceTestCoveragePct}% < ${minTestCoverage}%`
    },
    metrics,
    traceability: traceabilityManifest,
    gaps: {
      featuresWithoutEpics: prd.features.filter(f => !epics.featureLinks.has(f)),
      featuresWithoutStories: prd.features.filter(f => !stories.featureLinks.has(f)),
      featuresWithoutCode: prd.features.filter(f => !code.featTags.has(f)),
      orphanStories: Array.from(stories.storyIds).filter(sId => 
        !prd.features.some(f => sId.includes(f))
      ),
      orphanFeatures: prd.features.filter(f => 
        !Array.from(stories.storyIds).some(sId => sId.includes(f))
      ),
      prdMissingEpic: prd.prdReqs.filter(id => !epicCovers.has(id)),
      prdMissingStory: prd.prdReqs.filter(id => !storyCovers.has(id)),
      acceptanceMissingStories: prd.acceptance.filter(id => !stories.acCovered.has(id)),
      acceptanceMissingTests: prd.acceptance.filter(id => !tests.acTags.has(id))
    },
    evidence: {
      codeTraceability: code.codeTraceability,
      testEvidence: tests.testEvidence
    }
  };

  await ensureDir(jsonOut);
  await ensureDir(mdOut);
  await fsp.writeFile(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    `# Feature Coverage Report`,
    `Generated: ${report.timestamp}`,
    '',
    `## Summary`,
    `- **Overall Coverage**: ${report.summary.overallPct}% (threshold ${threshold}%) — ${report.summary.status.toUpperCase()}`,
    `- **Test Coverage**: ${metrics.acceptanceTestCoveragePct}% (minimum ${minTestCoverage}%)`,
    '',
    `## Feature Coverage`,
    `- Total features: ${metrics.featureTotal}`,
    `- Covered by epics: ${metrics.featureCoveredByEpics} (${metrics.featureEpicCoveragePct}%)`,
    `- Covered by stories: ${metrics.featureCoveredByStories} (${metrics.featureStoryCoveragePct}%)`,
    `- Covered by code: ${metrics.featureCoveredByCode} (${metrics.featureCodeCoveragePct}%)`,
    '',
    `## Acceptance Criteria Coverage`,
    `- Total AC: ${metrics.acceptanceTotal}`,
    `- Covered by stories: ${metrics.acceptanceCoveredByStories} (${metrics.acceptanceStoryCoveragePct}%)`,
    `- Covered by tests: ${metrics.acceptanceCoveredByTests} (${metrics.acceptanceTestCoveragePct}%)`,
    '',
    `## Implementation Metrics`,
    `- Epics: ${metrics.epicCount}`,
    `- Stories: ${metrics.storyCount}`,
    `- Code annotations — FEAT: ${metrics.codeFeatTags}, EPIC: ${metrics.codeEpicTags}, STORY: ${metrics.codeStoryTags}`,
    `- Test AC tags: ${metrics.testAcTags}`,
    '',
    `## Gaps Analysis`,
    `### Feature Gaps`,
    `- Features without epics: ${report.gaps.featuresWithoutEpics.length ? report.gaps.featuresWithoutEpics.join(', ') : 'none'}`,
    `- Features without stories: ${report.gaps.featuresWithoutStories.length ? report.gaps.featuresWithoutStories.join(', ') : 'none'}`,
    `- Features without code: ${report.gaps.featuresWithoutCode.length ? report.gaps.featuresWithoutCode.join(', ') : 'none'}`,
    `- Orphan stories: ${report.gaps.orphanStories.length ? report.gaps.orphanStories.join(', ') : 'none'}`,
    `- Orphan features: ${report.gaps.orphanFeatures.length ? report.gaps.orphanFeatures.join(', ') : 'none'}`,
    '',
    `### Acceptance Criteria Gaps`,
    `- AC missing stories: ${report.gaps.acceptanceMissingStories.length ? report.gaps.acceptanceMissingStories.join(', ') : 'none'}`,
    `- AC missing tests: ${report.gaps.acceptanceMissingTests.length ? report.gaps.acceptanceMissingTests.join(', ') : 'none'}`,
    '',
    `### Legacy PRD-REQ Gaps`,
    `- PRD missing epic: ${report.gaps.prdMissingEpic.length ? report.gaps.prdMissingEpic.join(', ') : 'none'}`,
    `- PRD missing story: ${report.gaps.prdMissingStory.length ? report.gaps.prdMissingStory.join(', ') : 'none'}`,
  ].join('\n');
  await fsp.writeFile(mdOut, md, 'utf8');

  // Write documentation manifest if requested
  if (args.manifest) {
    await ensureDir(manifestPath);
    await fsp.writeFile(manifestPath, JSON.stringify(traceabilityManifest, null, 2), 'utf8');
    console.log(`Manifest: ${path.resolve(manifestPath)}`);
  }

  console.log(`\nFeature Coverage Report:`);
  console.log(`========================`);
  console.log(`Overall: ${report.summary.overallPct}% (threshold ${threshold}%)`);
  console.log(`Test coverage: ${metrics.acceptanceTestCoveragePct}% (minimum ${minTestCoverage}%)`);
  console.log(`Status: ${report.summary.status.toUpperCase()}`);
  console.log(`\nJSON: ${path.resolve(jsonOut)}`);
  console.log(`Markdown: ${path.resolve(mdOut)}`);

  if (failOnBelow && !pass) {
    console.error(`\n❌ Coverage check failed: ${report.summary.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('feature-coverage failed:', err?.message || err);
  process.exit(1);
});
