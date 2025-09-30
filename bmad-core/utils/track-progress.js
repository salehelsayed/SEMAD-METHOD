#!/usr/bin/env node

/**
 * Simple progress tracking utility for agents.
 * Can be invoked as a CLI or required as a module.
 */

const fs = require('fs');
const path = require('path');

function ensureDirectories(rootDir) {
  const aiDir = path.join(rootDir, '.ai');
  const historyDir = path.join(aiDir, 'history');

  if (!fs.existsSync(aiDir)) {
    fs.mkdirSync(aiDir, { recursive: true });
  }
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  return { aiDir, historyDir };
}

function loadContext(contextFile) {
  if (!fs.existsSync(contextFile)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  } catch (_) {
    return {};
  }
}

function trackProgress(operation, agent, ...args) {
  if (!operation || !agent) {
    return {
      success: false,
      code: 1,
      message: 'Usage: track-progress.js <operation> <agent> [args...]',
      operations: ['observation', 'decision', 'keyfact', 'show']
    };
  }

  const rootDir = process.cwd();
  const { aiDir } = ensureDirectories(rootDir);
  const contextFile = path.join(aiDir, `${agent}_context.json`);
  const logFile = path.join(aiDir, 'history', `${agent}_log.jsonl`);
  const timestamp = new Date().toISOString();

  const context = loadContext(contextFile);
  let logEntry = null;

  switch (operation) {
    case 'observation': {
      const raw = args.join(' ');
      let observation = raw;
      let meta = {};
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed) {
          meta = parsed;
          if (typeof parsed.message === 'string') {
            observation = parsed.message;
          }
        }
      } catch (_) {
        // keep raw string
      }

      context.lastObservation = observation;
      context.lastUpdated = timestamp;
      logEntry = { timestamp, type: 'observation', agent, content: observation, meta };
      console.log(`[${agent}] Observation recorded: ${observation}`);
      break;
    }

    case 'decision': {
      let decision = args[0];
      let rationale = args.slice(1).join(' ');
      try {
        const parsed = JSON.parse(args.join(' '));
        if (parsed && typeof parsed === 'object') {
          if (parsed.decision) decision = parsed.decision;
          if (parsed.rationale) rationale = parsed.rationale;
        }
      } catch (_) {
        // keep raw values
      }

      if (!context.decisions) context.decisions = [];
      context.decisions.push({ decision, rationale, timestamp });
      context.lastUpdated = timestamp;
      logEntry = { timestamp, type: 'decision', agent, decision, rationale };
      console.log(`[${agent}] Decision recorded: ${decision}`);
      break;
    }

    case 'keyfact': {
      const raw = args.join(' ');
      let fact = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.fact) {
          fact = parsed.fact;
        }
      } catch (_) {
        // keep raw string
      }

      logEntry = { timestamp, type: 'keyfact', agent, content: fact };
      console.log(`[${agent}] Key fact recorded: ${fact}`);
      break;
    }

    case 'show':
      console.log('Current context:', JSON.stringify(context, null, 2));
      return { success: true, context };

    default:
      return {
        success: false,
        code: 1,
        message: 'Usage: track-progress.js <operation> <agent> [args...]',
        operations: ['observation', 'decision', 'keyfact', 'show']
      };
  }

  if (logEntry) {
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
  return { success: true, context };
}

if (require.main === module) {
  const [operation, agent, ...args] = process.argv.slice(2);
  const result = trackProgress(operation, agent, ...args);
  if (!result.success) {
    console.log(result.message);
    if (result.operations) {
      console.log(`Operations: ${result.operations.join(', ')}`);
    }
    process.exit(result.code || 1);
  }
}

module.exports = trackProgress;
