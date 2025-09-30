#!/usr/bin/env node

const path = require('path');

const sessionLogger = require(path.join(__dirname, '../../semad-core/utils/session-summary'));

function usage() {
  console.log('Usage: node tools/dev/session-log.js <command> <agent> [options]');
  console.log('Commands:');
  console.log('  log-activation <agent> [--details JSON] [--message "text"]');
  console.log('  create-summary <agent> [--summary JSON] [--message "text"]');
  console.log('  log-summary <agent> [--summary JSON] [--details JSON] [--operation name] [--message "text"]');
}

function parseJson(input, label) {
  if (input === undefined) {
    throw new Error(`Missing value for ${label}`);
  }
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Failed to parse ${label} as JSON: ${error.message}`);
  }
}

function parseOptions(tokens) {
  const opts = {
    summary: {},
    details: {},
    operation: null,
    message: null,
    extras: []
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token) {
      case '--summary':
        i += 1;
        opts.summary = parseJson(tokens[i], '--summary');
        break;
      case '--details':
        i += 1;
        opts.details = parseJson(tokens[i], '--details');
        break;
      case '--operation':
        i += 1;
        if (tokens[i] === undefined) {
          throw new Error('Missing value for --operation');
        }
        opts.operation = tokens[i];
        break;
      case '--message':
        i += 1;
        if (tokens[i] === undefined) {
          throw new Error('Missing value for --message');
        }
        opts.message = tokens[i];
        break;
      default:
        opts.extras.push(token);
        break;
    }
  }

  return opts;
}

function mergeMessage(target, opts) {
  const merged = { ...target };
  const notes = [];
  if (opts.message) {
    merged.message = merged.message || opts.message;
  }
  if (opts.extras.length) {
    notes.push(...opts.extras);
  }
  if (notes.length) {
    merged.notes = Array.isArray(merged.notes) ? merged.notes.concat(notes) : notes;
  }
  return merged;
}

function main() {
  const [command, agentName, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || !agentName) {
    usage();
    process.exit(command ? 0 : 1);
  }

  try {
    const opts = parseOptions(rest);

    switch (command) {
      case 'log-activation': {
        const payload = mergeMessage(opts.details, opts);
        const entry = sessionLogger.logActivation(agentName, payload);
        console.log(JSON.stringify(entry, null, 2));
        break;
      }
      case 'create-summary': {
        const summaryInput = mergeMessage(opts.summary, opts);
        const summary = sessionLogger.createSessionSummary(agentName, summaryInput);
        console.log(JSON.stringify(summary, null, 2));
        break;
      }
      case 'log-summary': {
        const summaryInput = mergeMessage(opts.summary, opts);
        const entry = sessionLogger.logSessionSummary(
          agentName,
          opts.operation || 'session_summary',
          summaryInput,
          mergeMessage(opts.details, opts)
        );
        console.log(JSON.stringify(entry, null, 2));
        break;
      }
      default:
        usage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
