#!/usr/bin/env node
/**
 * Agent Help Printer
 *
 * Usage:
 *   node tools/agent-help.js <agent>
 *
 * Prints available commands for the given agent.
 * Order of precedence:
 *   1) .semad-core/agents/commands-manifest.json (categorized)
 *   2) AGENTS.md (flat list with descriptions)
 *   3) intent-manifest.json (natural language aliases)
 */
const fs = require('fs');
const path = require('path');

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function loadCommandsManifest(agentId) {
  const p = path.join(process.cwd(), '.semad-core', 'agents', 'commands-manifest.json');
  const raw = readFileSafe(p);
  if (!raw) return null;
  try { const j = JSON.parse(raw); return j[agentId] || null; } catch { return null; }
}

function parseAgentCommandsFromDocs(agentId) {
  const md = readFileSafe(path.join(process.cwd(), 'AGENTS.md'));
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const header = `### ${agentId.toUpperCase()} (`; // e.g., ### 6. Developer (`/dev`)
  const idx = lines.findIndex(l => l.toLowerCase().includes('`/'+agentId+'`'));
  if (idx === -1) return [];
  const cmds = [];
  for (let i = idx; i < Math.min(lines.length, idx + 120); i++) {
    const line = lines[i].trim();
    const m = line.match(/^\-\s*`\*([^`]+)`\s*\-\s*(.+)$/); // - `*adhoc` - One-off tasks
    if (m) cmds.push({ command: `*${m[1].trim()}`, description: m[2].trim() });
    if (/^\s*\*\*Workflow Position\*\*/i.test(line)) break;
  }
  return cmds;
}

function loadIntentManifest(agentId) {
  const manifestPath = path.join(process.cwd(), '.semad-core', 'agents', 'intent-manifest.json');
  const raw = readFileSafe(manifestPath);
  if (!raw) return null;
  try { const j = JSON.parse(raw); return j[agentId] || null; } catch { return null; }
}

function main() {
  const agentId = (process.argv[2] || '').replace(/^\//,'').trim();
  if (!agentId) {
    console.log('Usage: node tools/agent-help.js <agent>');
    process.exit(1);
  }
  const manifest = loadCommandsManifest(agentId);
  const cmds = parseAgentCommandsFromDocs(agentId);
  const intents = loadIntentManifest(agentId);
  console.log(`\nAgent '/${agentId}' available commands:`);
  if (manifest?.categories?.length) {
    for (const cat of manifest.categories) {
      console.log(`\n${cat.name}`);
      cat.commands.forEach(cmd => {
        const found = cmds.find(c => c.command.toLowerCase() === cmd.replace(/\s+.*/, '').toLowerCase());
        const desc = found?.description ? `: ${found.description}` : '';
        console.log(`- ${cmd}${desc}`);
      });
    }
  } else if (cmds.length) {
    cmds.forEach(c => console.log(`- ${c.command}: ${c.description}`));
  } else {
    console.log('- (No structured commands found)');
  }
  if (intents?.aliases) {
    console.log('\nNatural language triggers (examples):');
    intents.aliases.forEach(a => console.log(`- ${a.phrase}  → ${a.command}`));
  }
}

if (require.main === module) main();
