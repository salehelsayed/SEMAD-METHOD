#!/usr/bin/env node
/**
 * QA: Validate brownfield integration safety across stories.
 * - If a story declares integrationPointIds, require integrationVerification and rollbackPlan sections.
 * - Enforce slice order warnings: int-flow without prior flag and probe for same epic.
 * - For flag/probe sliceType, require featureFlag.defaultState=off.
 *
 * Outputs:
 *  - .ai/reports/integration-safety.json
 *  - .ai/adhoc/integration-safety.md
 */
const fs = require('fs');
const path = require('path');
const { writeQaReport } = require('./report-utils');

function readStories(root) {
  const dir = path.join(root, 'docs', 'stories');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => path.join(dir, f));
}

function extract(field, text, re) {
  const m = text.match(re);
  return m ? m[1] : null;
}

function has(text, re) { return re.test(text); }

function parseStory(text) {
  const sliceType = extract('sliceType', text, /sliceType:\s*(\w+)/i);
  const epicId = extract('epicId', text, /epicId:\s*([\w\-]+)/i) || extract('epic_id', text, /epic_id\s*:\s*([\w\-]+)/i);
  const hasInt = has(text, /integrationPointIds\s*:/i);
  const hasIV = has(text, /integrationVerification\s*:/i) || has(text, /##\s*Integration Verification/i);
  const hasRollback = has(text, /rollbackPlan\s*:/i) || has(text, /##\s*Rollback Plan/i);
  const defaultOff = has(text, /featureFlag[\s\S]*?defaultState\s*:\s*off/i);
  return { sliceType, epicId, hasInt, hasIV, hasRollback, defaultOff };
}

function main() {
  const root = process.cwd();
  // Standardized QA reports directory and naming handled by report-utils
  const files = readStories(root);
  const perEpic = new Map();
  const issues = [];
  const warnings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const s = parseStory(text);
    if (!perEpic.has(s.epicId)) perEpic.set(s.epicId, { flag: 0, probe: 0, intFlow: 0 });
    const ep = perEpic.get(s.epicId);
    if (s.sliceType === 'flag') ep.flag++;
    if (s.sliceType === 'probe') ep.probe++;
    if (s.sliceType === 'int-flow') ep.intFlow++;

    if (s.hasInt) {
      if (!s.hasIV) issues.push({ file, issue: 'Missing integrationVerification section for INT story' });
      if (!s.hasRollback) issues.push({ file, issue: 'Missing rollbackPlan section for INT story' });
    }
    if ((s.sliceType === 'flag' || s.sliceType === 'probe') && !s.defaultOff) {
      issues.push({ file, issue: 'featureFlag.defaultState must be OFF for flag/probe slices' });
    }
  }
  // Slice order
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const s = parseStory(text);
    if (s.sliceType === 'int-flow' && s.epicId) {
      const ep = perEpic.get(s.epicId) || { flag: 0, probe: 0 };
      if (ep.flag === 0 || ep.probe === 0) {
        warnings.push({ file, warn: 'int-flow without preceding flag and/or probe slices for this epic' });
      }
    }
  }
  const report = { total: files.length, issues, warnings };
  const { jsonPath, mdPath } = writeQaReport('integration-safety', report, { context: { filesScanned: files.length } });
  console.log(`Integration safety report written to:\n- ${jsonPath}\n- ${mdPath}`);
  process.exit(issues.length ? 1 : 0);
}

main();
