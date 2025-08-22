#!/usr/bin/env node
/**
 * Validate an EpicContract Markdown file (with YAML front matter) against required fields
 * Usage:
 *   node scripts/validate-epic-contract.js --file docs/prd/epics/epic-5.md
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function parseFrontMatter(md) {
  const fmStart = md.indexOf('---');
  if (fmStart !== 0) return { data: null, body: md };
  const fmEnd = md.indexOf('\n---', 3);
  if (fmEnd === -1) return { data: null, body: md };
  const yamlText = md.slice(3, fmEnd + 1); // include final newline
  const body = md.slice(fmEnd + 4); // skip "\n---"
  try {
    const data = yaml.load(yamlText);
    return { data, body };
  } catch (e) {
    return { data: { __parseError: String(e) }, body };
  }
}

function req(obj, pathArr) {
  return pathArr.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function validateEpic(epicData) {
  const issues = [];
  const warnings = [];
  const ok = [];

  if (!epicData) {
    issues.push('Missing YAML front matter. Ensure file starts with --- and contains EpicContract fields.');
    return { issues, warnings, ok };
  }

  // Basic identity
  if (req(epicData, ['type']) !== 'EpicContract') issues.push('type must be EpicContract');
  if (!req(epicData, ['schemaVersion'])) issues.push('schemaVersion missing');

  // Epic core
  if (!req(epicData, ['epic', 'epicId'])) issues.push('epic.epicId missing');
  if (!req(epicData, ['epic', 'title'])) issues.push('epic.title missing');
  if (!req(epicData, ['epic', 'goal'])) issues.push('epic.goal missing');

  // Success criteria
  const sc = req(epicData, ['successCriteria']);
  if (!Array.isArray(sc) || sc.length === 0) issues.push('successCriteria missing or empty');
  else {
    const missing = sc.filter(
      (s) => !s || !s.id || !s.metric || !s.target || !s.method
    );
    if (missing.length) issues.push('successCriteria entries must include id, metric, target, method');
  }

  // Requirements
  const reqs = req(epicData, ['requirements']);
  if (!Array.isArray(reqs) || reqs.length === 0) issues.push('requirements missing or empty');
  else if (reqs.some((r) => !r || !r.id)) issues.push('each requirement must include id');

  // Flows
  const flows = req(epicData, ['flows']);
  if (!Array.isArray(flows) || flows.length === 0) issues.push('flows missing or empty');
  else if (flows.some((f) => !f || !f.id)) issues.push('each flow must include id');

  // Integration Points
  const ints = req(epicData, ['integrationPoints']);
  if (!Array.isArray(ints) || ints.length === 0) issues.push('integrationPoints missing or empty');
  else if (ints.some((i) => !i || !i.id)) issues.push('each integrationPoint must include id');

  // Acceptance scenarios
  const e2e = req(epicData, ['acceptanceScenarios']);
  if (!Array.isArray(e2e) || e2e.length === 0) issues.push('acceptanceScenarios missing or empty');
  else if (e2e.some((s) => !s || !s.id || !Array.isArray(s.reqIds) || !Array.isArray(s.flowIds))) {
    issues.push('each acceptanceScenario must include id, reqIds[], flowIds[]');
  }

  // Validation gates
  const validation = req(epicData, ['validation']);
  if (!validation) issues.push('validation section missing');
  else {
    if (!Array.isArray(validation.epicDoR) || validation.epicDoR.length === 0)
      warnings.push('validation.epicDoR not specified');
    if (!validation.storyRules) warnings.push('validation.storyRules missing');
    if (!Array.isArray(validation.storyDoD) || validation.storyDoD.length === 0)
      warnings.push('validation.storyDoD not specified');
    if (!Array.isArray(validation.epicDoneCriteria) || validation.epicDoneCriteria.length === 0)
      issues.push('validation.epicDoneCriteria missing or empty');
  }

  // Ancillary (not hard-fail): nfrBudgets, rolloutPlan, observability, security, accessibility
  if (!req(epicData, ['nfrBudgets'])) warnings.push('nfrBudgets not defined');
  if (!req(epicData, ['rolloutPlan'])) warnings.push('rolloutPlan not defined');
  if (!req(epicData, ['observability'])) warnings.push('observability not defined');
  if (!req(epicData, ['security'])) warnings.push('security not defined');
  if (!req(epicData, ['assumptions'])) warnings.push('assumptions not defined');
  if (!req(epicData, ['risks'])) warnings.push('risks not defined');

  if (issues.length === 0) ok.push('EpicContract front matter matches required template fields.');
  return { issues, warnings, ok };
}

function writeReports(epicPath, results, epicData) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(epicPath).replace(/\.[^/.]+$/, '');
  const reportsDir = path.join('.ai', 'adhoc');
  const jsonDir = path.join('.ai', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(jsonDir, { recursive: true });

  const jsonPath = path.join(jsonDir, `epic-validate-${baseName}-${ts}.json`);
  const mdPath = path.join(reportsDir, `epic-validate-${baseName}-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify({ file: epicPath, results, epicId: req(epicData, ['epic','epicId']) }, null, 2));

  const md = [];
  md.push(`# Epic Validation Report: ${baseName}`);
  md.push('');
  md.push(`- File: ${epicPath}`);
  md.push(`- Epic ID: ${req(epicData, ['epic','epicId']) || 'n/a'}`);
  md.push('');
  if (results.ok.length) {
    md.push('## Passing Checks');
    results.ok.forEach((m) => md.push(`- ${m}`));
    md.push('');
  }
  if (results.issues.length) {
    md.push('## Issues (must fix)');
    results.issues.forEach((m) => md.push(`- ${m}`));
    md.push('');
  }
  if (results.warnings.length) {
    md.push('## Warnings (recommended)');
    results.warnings.forEach((m) => md.push(`- ${m}`));
    md.push('');
  }
  md.push('## Next Actions');
  md.push('- PO: Fill missing fields in EpicContract (use template at `docs/templates/epic-contract-template.md`).');
  md.push('- SM: Ensure StoryContracts reference `epicId`, `reqIds`, `flowIds`, and `integrationPointIds`.');
  md.push('- Orchestrator: Run `npm run reverse:align` to refresh docs-code alignment.');
  md.push('- QA: Re-run this validator and review reverse-alignment reports.');
  md.push('');
  md.push('## Agent Prompts (Codex CLI)');
  md.push('- `codex "as pm agent, review EP and fill missing sections per template"`');
  md.push('- `codex "as sm agent, *recreate-stories-from-code for EP-XXX and link REQ/FLOW/INT"`');

  fs.writeFileSync(mdPath, md.join('\n'));
  return { jsonPath, mdPath };
}

function main() {
  const args = process.argv.slice(2);
  const fileIdx = Math.max(args.indexOf('--file'), args.indexOf('-f'));
  const epicPath = fileIdx !== -1 ? args[fileIdx + 1] : args[0];
  if (!epicPath) {
    console.error('Usage: node scripts/validate-epic-contract.js --file <path-to-epic-md>');
    process.exit(2);
  }
  const full = path.resolve(process.cwd(), epicPath);
  if (!fs.existsSync(full)) {
    console.error(`Epic file not found: ${full}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(full, 'utf8');
  const { data } = parseFrontMatter(raw);
  const results = validateEpic(data);
  const { jsonPath, mdPath } = writeReports(epicPath, results, data || {});

  // Console summary
  if (results.issues.length) {
    console.log(`Epic validation FAILED for ${epicPath}`);
    results.issues.forEach((m) => console.log(`- ISSUE: ${m}`));
  } else {
    console.log(`Epic validation PASSED for ${epicPath}`);
  }
  if (results.warnings.length) {
    results.warnings.forEach((m) => console.log(`- WARN: ${m}`));
  }
  console.log(`\nReports written to:\n- ${jsonPath}\n- ${mdPath}`);

  process.exit(results.issues.length ? 1 : 0);
}

main();

