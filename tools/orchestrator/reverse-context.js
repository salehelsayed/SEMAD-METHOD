const fs = require('fs');
const path = require('path');

function loadJSONSafe(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return null;
}

function summarizeContext(ctx) {
  const summary = [];
  const manifest = ctx.manifest || {};
  const report = ctx.alignment || {};
  const decisions = (manifest.decisions || []).length;
  const missingFeatures = (report.missingFeatures || []).length;
  const coverage = report.docsCoverage || manifest.coverage || null;
  summary.push(`Decisions captured: ${decisions}`);
  if (missingFeatures) summary.push(`Missing feature mentions: ${missingFeatures}`);
  if (coverage && coverage.totalFeatures !== undefined) {
    summary.push(`Coverage: ${coverage.mentioned || 0}/${coverage.totalFeatures} mentioned`);
  }
  return summary;
}

function loadReverseContext(rootDir) {
  const manifestPath = path.join(rootDir, '.ai', 'documentation-manifest.json');
  const alignmentReportPath = path.join(rootDir, '.ai', 'reports', 'alignment-report.json');
  const manifest = loadJSONSafe(manifestPath);
  const alignment = loadJSONSafe(alignmentReportPath);
  const ctx = { manifest, alignment, manifestPath, alignmentReportPath };
  ctx.summary = summarizeContext(ctx);
  return ctx;
}

module.exports = { loadReverseContext };

