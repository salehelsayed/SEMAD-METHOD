const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function readStoryFrontmatter(storyPath) {
  const text = fs.readFileSync(storyPath, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { front: null, rest: text };
  const front = yaml.load(m[1]) || {};
  const rest = text.slice(m[0].length);
  return { front, rest, raw: text, fmRaw: m[1] };
}

function writeStoryFrontmatter(storyPath, frontObj, rest) {
  const newFm = yaml.dump(frontObj, { lineWidth: 120 });
  const content = `---\n${newFm}---${rest.startsWith('\n') ? '' : '\n'}${rest}`;
  fs.writeFileSync(storyPath, content, 'utf8');
}

function findMostRecentStory(storiesDir) {
  if (!fs.existsSync(storiesDir)) return null;
  let latest = null;
  let latestMTime = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith('.md')) {
        const st = fs.statSync(p);
        if (st.mtimeMs > latestMTime) { latest = p; latestMTime = st.mtimeMs; }
      }
    }
  };
  walk(storiesDir);
  return latest;
}

function nonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function isArrayNonEmpty(a) { return Array.isArray(a) && a.length > 0; }
function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function scoreCategory(present, fullPoints, partialRatio = 0) {
  if (!present) return 0;
  if (partialRatio > 0 && partialRatio < 1) return Math.round(fullPoints * partialRatio);
  return fullPoints;
}

function lintDoR(contract) {
  const report = {
    categories: {},
    missing: [],
    notes: [],
    score: 0,
    status: 'Blocked'
  };

  // 1) Objective
  const objective = contract?.objective;
  const objectiveOk = nonEmptyString(objective);
  if (!objectiveOk) report.missing.push('objective');
  report.categories.objective = { ok: objectiveOk };

  // 2) Interfaces
  const interfaces = contract?.interfaces;
  let intScore = 0;
  let interfacesOk = false;
  if (isObject(interfaces)) {
    const inbound = Array.isArray(interfaces.inbound) ? interfaces.inbound : [];
    const outbound = Array.isArray(interfaces.outbound) ? interfaces.outbound : [];
    const hasInbound = inbound.length > 0;
    const hasOutbound = outbound.length > 0;
    interfacesOk = hasInbound && hasOutbound;
    intScore = scoreCategory(interfacesOk, 20, interfacesOk ? 1 : (hasInbound || hasOutbound ? 0.5 : 0));
  }
  if (!interfacesOk) report.missing.push('interfaces');
  report.categories.interfaces = { ok: interfacesOk, points: intScore };

  // 3) Data contracts
  const dataContracts = contract?.data_contracts;
  let dcScore = 0; let dcOk = false;
  if (isObject(dataContracts)) {
    const keys = Object.keys(dataContracts);
    if (keys.length > 0) {
      // Check first model has at least 3 fields
      const anyModel = dataContracts[keys[0]];
      dcOk = isObject(anyModel) && Object.keys(anyModel).length >= 3;
      dcScore = scoreCategory(dcOk, 20, dcOk ? 1 : 0.5);
    }
  }
  if (!dcOk) report.missing.push('data_contracts');
  report.categories.data_contracts = { ok: dcOk, points: dcScore };

  // 4) State changes
  const stateChanges = contract?.state_changes;
  let scScore = 0; let scOk = false;
  if (isObject(stateChanges)) {
    const hasTables = isArrayNonEmpty(stateChanges.tables);
    const hasRules = isArrayNonEmpty(stateChanges.rules);
    scOk = hasTables;
    scScore = (hasTables ? 10 : 0) + (hasRules ? 5 : 0);
  }
  if (!scOk) report.missing.push('state_changes');
  report.categories.state_changes = { ok: scOk, points: scScore };

  // 5) Constraints
  const constraints = contract?.constraints;
  let conScore = 0; let conOk = false;
  if (isObject(constraints)) {
    const keys = Object.keys(constraints).filter(k => nonEmptyString(constraints[k]));
    conOk = keys.length >= 2; // require at least 2 constraint entries
    conScore = scoreCategory(conOk, 10, conOk ? 1 : (keys.length > 0 ? 0.5 : 0));
  }
  if (!conOk) report.missing.push('constraints');
  report.categories.constraints = { ok: conOk, points: conScore };

  // 6) Acceptance tests (5–8 black box)
  const ats = contract?.acceptance_tests;
  let atScore = 0; let atOk = false;
  if (Array.isArray(ats)) {
    const len = ats.length;
    atOk = len >= 5 && len <= 8;
    atScore = scoreCategory(atOk, 20, !atOk && len > 0 ? 0.6 : 0); // partial if some exist
  }
  if (!atOk) report.missing.push('acceptance_tests');
  report.categories.acceptance_tests = { ok: atOk, points: atScore };

  // 7) Assumptions (A1…)
  const assumptions = contract?.assumptions;
  let asScore = 0; let asOk = false;
  if (Array.isArray(assumptions)) {
    const labeled = assumptions.filter(s => /(^|\s)A\d+\s*[:\-]/i.test(String(s))).length;
    asOk = assumptions.length > 0;
    asScore = scoreCategory(asOk, 10, labeled > 0 ? 1 : 0.5);
  }
  if (!asOk) report.missing.push('assumptions');
  report.categories.assumptions = { ok: asOk, points: asScore };

  // 8) Done signals
  const doneSignals = contract?.done_signals;
  let dsScore = 0; let dsOk = false;
  if (Array.isArray(doneSignals)) {
    dsOk = doneSignals.length > 0;
    dsScore = scoreCategory(dsOk, 5, 0);
  }
  if (!dsOk) report.missing.push('done_signals');
  report.categories.done_signals = { ok: dsOk, points: dsScore };

  const total = intScore + dcScore + scScore + conScore + atScore + asScore + dsScore;
  report.score = Math.max(0, Math.min(100, total));

  // Binary gate + rubric
  const hasAll8 = objectiveOk && report.categories.interfaces.ok && report.categories.data_contracts.ok &&
    report.categories.state_changes.ok && report.categories.constraints.ok && report.categories.acceptance_tests.ok &&
    report.categories.assumptions.ok && report.categories.done_signals.ok;

  if (!hasAll8) {
    report.status = 'Blocked';
  } else if (report.score >= 90) {
    report.status = 'Ready';
  } else if (report.score >= 70) {
    report.status = 'Needs 1 pass';
  } else {
    report.status = 'Blocked';
  }

  return report;
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function applyGate(storyPath, options = {}) {
  const root = options.root || process.cwd();
  const { front, rest } = readStoryFrontmatter(storyPath);
  if (!front || !front.StoryContract) throw new Error('StoryContract not found in frontmatter');
  const sc = front.StoryContract;
  const report = lintDoR(sc);

  // Track readiness metadata on contract
  const passes = Number(sc.readiness_passes || 0);
  sc.readiness_score = report.score;
  sc.readiness_status = report.status;
  sc.readiness_updated_at = new Date().toISOString();

  if (report.status === 'Ready') {
    sc.readiness_passes = passes; // unchanged
    sc.readiness_lock = true;
    sc.readiness_lock_policy = {
      allowEdits: ['assumptions', 'notes'],
      message: 'Story locked on DoR pass; only Assumptions or Notes may change'
    };
    writeStoryFrontmatter(storyPath, front, rest);
    return { exitCode: 0, report };
  }

  if (report.status === 'Needs 1 pass') {
    if (passes >= 1) {
      // Second attempt still not ready → spike
      const spikesDir = path.join(root, 'docs', 'stories', 'spikes');
      ensureDir(spikesDir);
      const storyId = sc.story_id || path.basename(storyPath).replace(/\.md$/, '');
      const spkId = `SPK-${storyId}`;
      const spikePath = path.join(spikesDir, `${spkId}.md`);
      if (!fs.existsSync(spikePath)) {
        const spike = `# ${spkId}: Resolve DoR Gaps for ${storyId}\n\n- Timebox: 1 day\n- Goal: Collect missing information to satisfy DoR-Mini.\n- Scope: Clarify interfaces/data contracts/state changes/constraints/tests.\n\n## Open Questions\n- [ ] Interfaces gaps\n- [ ] Data contracts gaps\n- [ ] State changes gaps\n- [ ] Constraints gaps\n- [ ] Acceptance tests gaps\n- [ ] Assumptions to verify\n- [ ] Done signals definition\n`;
        fs.writeFileSync(spikePath, spike, 'utf8');
      }
      sc.readiness_passes = passes + 1;
      sc.readiness_status = 'Blocked';
      sc.readiness_blocked_reason = 'DoR < 90 after 2 passes; spawned spike';
      writeStoryFrontmatter(storyPath, front, rest);
      return { exitCode: 20, report, spike: path.relative(root, spikePath) };
    }
    // First pass: mark and stop
    sc.readiness_passes = passes + 1;
    sc.readiness_lock = false;
    sc.readiness_next_action = 'Single SM revision allowed; improve DoR categories';
    writeStoryFrontmatter(storyPath, front, rest);
    return { exitCode: 10, report };
  }

  // Blocked
  sc.readiness_passes = passes;
  sc.readiness_lock = false;
  sc.readiness_blocked_reason = 'Missing required DoR categories';
  writeStoryFrontmatter(storyPath, front, rest);
  return { exitCode: 20, report };
}

module.exports = {
  lintDoR,
  applyGate,
  readStoryFrontmatter,
  writeStoryFrontmatter,
  findMostRecentStory
};

