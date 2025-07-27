#!/usr/bin/env node

const path = require('path');
const { 
  initializeWorkingMemory,
  clearWorkingMemory 
} = require('../agents/index.js');

const agents = [
  'analyst',
  'pm',
  'architect',
  'ux-expert',
  'dev',
  'qa',
  'sm',
  'po',
  'bmad-master',
  'bmad-orchestrator'
];

async function initializeAllMemory() {
  console.log('Initializing working memory for all agents...\n');
  
  for (const agent of agents) {
    try {
      // Clear any existing memory first
      await clearWorkingMemory(agent);
      
      // Initialize fresh memory
      await initializeWorkingMemory(agent);
      console.log(`✓ Initialized memory for ${agent}`);
    } catch (error) {
      console.error(`✗ Failed to initialize memory for ${agent}:`, error.message);
    }
  }
  
  console.log('\nMemory initialization complete!');
  console.log(`Memory files created in: ${path.join(__dirname, '../ai/')}`);
}

// Run if called directly
if (require.main === module) {
  initializeAllMemory()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error during initialization:', error);
      process.exit(1);
    });
}

module.exports = { initializeAllMemory };