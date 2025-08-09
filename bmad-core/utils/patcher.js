const fs = require('fs');
const path = require('path');

/**
 * Simple unified patcher with dry-run support.
 * Supports the project patch format with headers:
 *  - *** Add File: <path>
 *  - *** Update File: <path>
 *    hunks starting with @@ and lines: ' ', '+', '-'
 *  - *** Delete File: <path>
 */

function parsePatch(patchText) {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const ops = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\*\*\*\s+Add File:\s+/.test(line)) {
      const file = line.replace(/^\*\*\*\s+Add File:\s+/, '').trim();
      const content = [];
      i++;
      while (i < lines.length && !/^\*\*\*/.test(lines[i])) {
        const l = lines[i];
        if (l.startsWith('+')) content.push(l.slice(1));
        i++;
      }
      ops.push({ type: 'add', file, content: content.join('\n') + (content.length ? '\n' : '') });
      continue;
    }
    if (/^\*\*\*\s+Delete File:\s+/.test(line)) {
      const file = line.replace(/^\*\*\*\s+Delete File:\s+/, '').trim();
      ops.push({ type: 'delete', file });
      i++;
      continue;
    }
    if (/^\*\*\*\s+Update File:\s+/.test(line)) {
      const file = line.replace(/^\*\*\*\s+Update File:\s+/, '').trim();
      i++;
      const hunks = [];
      while (i < lines.length && !/^\*\*\*/.test(lines[i])) {
        if (/^@@/.test(lines[i])) {
          const h = { header: lines[i], lines: [] };
          i++;
          while (i < lines.length && !/^@@/.test(lines[i]) && !/^\*\*\*/.test(lines[i])) {
            h.lines.push(lines[i]);
            i++;
          }
          hunks.push(h);
        } else {
          i++;
        }
      }
      ops.push({ type: 'update', file, hunks });
      continue;
    }
    i++;
  }
  return ops;
}

function dryRunApplyUpdate(originalContent, hunks) {
  const orig = originalContent.replace(/\r\n/g, '\n').split('\n');
  let ptr = 0;
  const out = [];
  for (const h of hunks) {
    for (const l of h.lines) {
      if (!l) continue;
      const tag = l[0];
      const body = l.slice(1);
      if (tag === ' ') {
        // context: must match
        if (orig[ptr] !== body) {
          return { ok: false, error: `Context mismatch near: '${body}'` };
        }
        out.push(orig[ptr]);
        ptr += 1;
      } else if (tag === '-') {
        // deletion: must match then skip
        if (orig[ptr] !== body) {
          return { ok: false, error: `Deletion mismatch near: '${body}'` };
        }
        ptr += 1;
      } else if (tag === '+') {
        // insertion
        out.push(body);
      }
    }
  }
  // Append the rest (not strictly correct for multiple hunks but acceptable for our format)
  while (ptr < orig.length) {
    out.push(orig[ptr++]);
  }
  return { ok: true, content: out.join('\n') };
}

async function applyUnifiedDiff(patchText, { dryRun = true, baseDir = process.cwd() } = {}) {
  const ops = parsePatch(patchText);
  const operations = [];
  const errors = [];
  for (const op of ops) {
    const filePath = path.isAbsolute(op.file) ? op.file : path.join(baseDir, op.file);
    if (op.type === 'add') {
      if (!dryRun) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, op.content, 'utf8');
      }
      operations.push({ type: 'add', file: op.file });
    } else if (op.type === 'delete') {
      const exists = fs.existsSync(filePath);
      if (!exists) {
        errors.push(`Delete target not found: ${op.file}`);
      } else if (!dryRun) {
        fs.unlinkSync(filePath);
      }
      operations.push({ type: 'delete', file: op.file });
    } else if (op.type === 'update') {
      if (!fs.existsSync(filePath)) {
        errors.push(`Update target not found: ${op.file}`);
        continue;
      }
      const original = fs.readFileSync(filePath, 'utf8');
      const res = dryRunApplyUpdate(original, op.hunks);
      if (!res.ok) {
        errors.push(`Failed to apply update to ${op.file}: ${res.error}`);
        continue;
      }
      if (!dryRun) {
        fs.writeFileSync(filePath, res.content, 'utf8');
      }
      operations.push({ type: 'update', file: op.file });
    }
  }
  return { success: errors.length === 0, operations, errors };
}

module.exports = {
  parsePatch,
  applyUnifiedDiff
};

