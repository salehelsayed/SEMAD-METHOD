#!/usr/bin/env node

/**
 * Simple progress tracking CLI for agents
 * Replaces the complex persist-memory-cli.js
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const [operation, agent, ...args] = process.argv.slice(2);

// Ensure .ai directory exists
const aiDir = path.join(process.cwd(), '.ai');
if (!fs.existsSync(aiDir)) {
  fs.mkdirSync(aiDir, { recursive: true });
}

// Simple file-based tracking
const contextFile = path.join(aiDir, `${agent}_context.json`);
const logFile = path.join(aiDir, 'history', `${agent}_log.jsonl`);

// Ensure history directory exists
const historyDir = path.join(aiDir, 'history');
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

// Load current context
let context = {};
if (fs.existsSync(contextFile)) {
  try {
    context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  } catch (e) {
    context = {};
  }
}

// Process operation
const timestamp = new Date().toISOString();

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
    } catch (_) { /* keep raw string */ }
    // Update context
    context.lastObservation = observation;
    context.lastUpdated = timestamp;
    
    // Append to log
    const obsEntry = {
      timestamp,
      type: 'observation',
      agent,
      content: observation,
      meta
    };
    fs.appendFileSync(logFile, JSON.stringify(obsEntry) + '\n');
    
    console.log(`[${agent}] Observation recorded: ${observation}`);
    break; }
    
  case 'decision': {
    let decision = args[0];
    let rationale = args.slice(1).join(' ');
    try {
      const parsed = JSON.parse(args.join(' '));
      if (parsed && typeof parsed === 'object') {
        if (parsed.decision) decision = parsed.decision;
        if (parsed.rationale) rationale = parsed.rationale;
      }
    } catch (_) { /* keep raw pieces */ }
    
    // Update context
    if (!context.decisions) context.decisions = [];
    context.decisions.push({ decision, rationale, timestamp });
    context.lastUpdated = timestamp;
    
    // Append to log
    const decEntry = {
      timestamp,
      type: 'decision',
      agent,
      decision,
      rationale
    };
    fs.appendFileSync(logFile, JSON.stringify(decEntry) + '\n');
    
    console.log(`[${agent}] Decision recorded: ${decision}`);
    break; }
    
  case 'keyfact': {
    const raw = args.join(' ');
    let fact = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.fact) {
        fact = parsed.fact;
      }
    } catch (_) { /* keep raw string */ }
    
    // Append to log
    const factEntry = {
      timestamp,
      type: 'keyfact',
      agent,
      content: fact
    };
    fs.appendFileSync(logFile, JSON.stringify(factEntry) + '\n');
    
    console.log(`[${agent}] Key fact recorded: ${fact}`);
    break; }
    
  case 'show':
    console.log('Current context:', JSON.stringify(context, null, 2));
    break;
    
  default:
    console.log('Usage: track-progress.js <operation> <agent> [args...]');
    console.log('Operations: observation, decision, keyfact, show');
    process.exit(1);
}

// Save updated context
if (operation !== 'show') {
  fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
}
