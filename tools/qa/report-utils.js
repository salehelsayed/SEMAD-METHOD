const fs = require('fs');
const path = require('path');

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeQaReport(name, payload, options = {}) {
  const root = options.root || process.cwd();
  const dir = path.join(root, '.ai', 'reports', 'qa');
  ensure(dir);
  const stamp = options.timestamp || ts();
  const base = `${name}-${stamp}`;
  const jsonPath = path.join(dir, `${base}.json`);
  const mdPath = path.join(dir, `${base}.md`);
  const meta = {
    generatedAt: new Date().toISOString(),
    name,
    version: options.version || '1',
    context: options.context || {}
  };
  const data = { meta, ...payload };
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  const md = [];
  md.push(`# QA Report: ${name}`);
  md.push('');
  md.push(`Generated: ${meta.generatedAt}`);
  if (options.context && Object.keys(options.context).length) {
    md.push('');
    md.push('## Context');
    Object.entries(options.context).forEach(([k, v]) => md.push(`- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`));
  }
  if (Array.isArray(payload.issues)) {
    md.push('');
    md.push('## Issues');
    if (payload.issues.length === 0) md.push('- None');
    else payload.issues.forEach(i => md.push(`- ${i.file || i.target || 'n/a'}: ${i.issue || i.msg}`));
  }
  if (Array.isArray(payload.warnings)) {
    md.push('');
    md.push('## Warnings');
    if (payload.warnings.length === 0) md.push('- None');
    else payload.warnings.forEach(w => md.push(`- ${w.file || w.target || 'n/a'}: ${w.warn || w.msg}`));
  }
  fs.writeFileSync(mdPath, md.join('\n'));
  return { jsonPath, mdPath };
}

module.exports = { writeQaReport };

