#!/usr/bin/env node

/**
 * Initialize task tracker for agent sessions
 * This script creates a tracker instance that persists for the session
 */

const path = require('path');
const fs = require('fs');

// Determine if we're in a project directory or the framework directory
const isProjectDir = fs.existsSync('.bmad-core');
const trackerPath = isProjectDir 
  ? path.join(process.cwd(), '.bmad-core', 'utils', 'simple-task-tracker')
  : path.join(__dirname, 'simple-task-tracker');

const TaskTracker = require(trackerPath);

// Get agent name from command line
const agentName = process.argv[2] || 'unknown';
const action = process.argv[3] || 'init';
const message = process.argv.slice(4).join(' ');

// Create or get tracker instance
global.tracker = global.tracker || new TaskTracker();

switch (action) {
  case 'init':
    global.tracker.setAgent(agentName);
    console.log(`Task tracker initialized for ${agentName} agent`);
    // Save tracker state to temp file for session persistence
    const trackerState = {
      agent: agentName,
      initialized: new Date().toISOString()
    };
    fs.writeFileSync(`.ai/.tracker_${agentName}_session.json`, JSON.stringify(trackerState, null, 2));
    break;
    
  case 'log':
    global.tracker.setAgent(agentName);
    global.tracker.log(message || 'Agent action', 'info');
    console.log('Logged:', message || 'Agent action');
    break;
    
  case 'status':
    const progress = global.tracker.getProgress();
    console.log(JSON.stringify(progress, null, 2));
    break;
    
  default:
    console.log('Usage: init-tracker.js <agent> [init|log|status] [message]');
}