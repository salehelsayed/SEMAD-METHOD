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
const yaml = require('js-yaml');

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function loadCommandsManifest(agentId) {
  const candidates = [
    path.join(process.cwd(), '.semad-core', 'agents', 'commands-manifest.json'),
    path.join(process.cwd(), 'semad-core', 'agents', 'commands-manifest.json'),
    path.join(process.cwd(), 'bmad-core', 'agents', 'commands-manifest.json')
  ];
  for (const p of candidates) {
    const raw = readFileSafe(p);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (j && j[agentId]) return j[agentId];
    } catch {}
  }
  return null;
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
  const candidates = [
    path.join(process.cwd(), '.semad-core', 'agents', 'intent-manifest.json'),
    path.join(process.cwd(), 'semad-core', 'agents', 'intent-manifest.json'),
    path.join(process.cwd(), 'bmad-core', 'agents', 'intent-manifest.json')
  ];
  for (const p of candidates) {
    const raw = readFileSafe(p);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (j && j[agentId]) return j[agentId];
    } catch {}
  }
  return null;
}

function loadAgentYamlCommands(agentId) {
  const candidates = [
    path.join(process.cwd(), '.semad-core', 'agents', `${agentId}.md`),
    path.join(process.cwd(), 'semad-core', 'agents', `${agentId}.md`),
    path.join(process.cwd(), 'bmad-core', 'agents', `${agentId}.md`)
  ];

  for (const filePath of candidates) {
    const md = readFileSafe(filePath);
    if (!md) continue;

    const matches = md.matchAll(/```yaml([\s\S]*?)```/gi);
    for (const match of matches) {
      if (!match?.[1]) continue;
      try {
        const parsed = yaml.load(match[1]);
        if (!parsed?.commands) continue;
        const commands = [];
        for (const entry of parsed.commands) {
          if (!entry) continue;
          if (typeof entry === 'string') {
            const command = entry.trim();
            if (command) commands.push({ command, description: '' });
            continue;
          }
          if (typeof entry === 'object') {
            const [rawKey] = Object.keys(entry || {});
            if (!rawKey) continue;
            let description = entry[rawKey];
            if (Array.isArray(description)) description = description.join(' ');
            if (typeof description !== 'string') description = '';
            commands.push({ command: rawKey.trim(), description: description.trim() });
          }
        }
        if (commands.length) return commands;
      } catch (_) {
        // Ignore parse errors and continue searching other blocks/files
      }
    }
  }

  return [];
}

function main() {
  const agentId = (process.argv[2] || '').replace(/^\//,'').trim();
  if (!agentId) {
    console.log('Usage: node tools/agent-help.js <agent>');
    process.exit(1);
  }
  const manifest = loadCommandsManifest(agentId);
  const cmds = parseAgentCommandsFromDocs(agentId);
  const yamlCommands = loadAgentYamlCommands(agentId);
  const intents = loadIntentManifest(agentId);
  console.log(`\nAgent '/${agentId}' available commands:`);
  const docMap = new Map();
  cmds.forEach(c => {
    const base = c.command.replace(/\s+.*/, '').toLowerCase();
    if (!docMap.has(base)) docMap.set(base, c.description);
  });
  const yamlMap = new Map();
  yamlCommands.forEach(c => {
    const display = c.command.startsWith('*') ? c.command : `*${c.command}`;
    const base = display.replace(/\s+.*/, '').toLowerCase();
    if (!yamlMap.has(base)) yamlMap.set(base, { display, description: c.description });
  });
  const unionMap = new Map(yamlMap);
  cmds.forEach(c => {
    const base = c.command.replace(/\s+.*/, '').toLowerCase();
    if (!unionMap.has(base)) {
      unionMap.set(base, { display: c.command, description: c.description });
    } else if (!unionMap.get(base).description && c.description) {
      unionMap.get(base).description = c.description;
    }
  });
  const printed = new Set();
  if (manifest?.categories?.length) {
    for (const cat of manifest.categories) {
      console.log(`\n${cat.name}`);
      cat.commands.forEach(rawCmd => {
        const cmd = typeof rawCmd === 'string' ? rawCmd.trim() : '';
        if (!cmd) return;
        const commandName = cmd.replace(/\s+.*/, '');
        const base = commandName.toLowerCase();
        printed.add(base);
        const remainder = cmd.slice(commandName.length).trim();

        const primaryDesc = docMap.get(base) || yamlMap.get(base)?.description;
        const descParts = [];
        if (primaryDesc) descParts.push(primaryDesc);
        if (remainder) {
          const usage = remainder.startsWith('<') || remainder.startsWith('[')
            ? remainder
            : remainder.replace(/\s+/g, ' ').trim();
          if (usage) descParts.push(`Usage: ${commandName} ${usage}`.trim());
        }

        const suffix = descParts.length ? `: ${descParts.join(' ')}` : '';
        console.log(`- ${commandName}${suffix}`);
      });
    }
  } else if (cmds.length) {
    cmds.forEach(c => {
      const base = c.command.replace(/\s+.*/, '').toLowerCase();
      printed.add(base);
      console.log(`- ${c.command}: ${c.description}`);
    });
  } else {
    console.log('- (No structured commands found)');
  }
  const additional = [];
  unionMap.forEach((value, base) => {
    if (!printed.has(base)) additional.push({ base, ...value });
  });
  if (additional.length) {
    console.log('\nAdditional commands');
    additional.sort((a, b) => a.display.localeCompare(b.display)).forEach(entry => {
      const desc = entry.description ? `: ${entry.description}` : '';
      console.log(`- ${entry.display}${desc}`);
    });
  }
  if (intents?.aliases) {
    console.log('\nNatural language triggers (examples):');
    intents.aliases.forEach(a => console.log(`- ${a.phrase}  → ${a.command}`));
  }
}

if (require.main === module) main();
