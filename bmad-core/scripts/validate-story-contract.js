#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Try to use the module resolver if available
let StoryContractValidator;
try {
  const ModuleResolver = require('../utils/module-resolver');
  const validatorPath = ModuleResolver.resolveModule('utils/story-contract-validator', '../utils/story-contract-validator', __dirname);
  StoryContractValidator = require(validatorPath);
} catch (e) {
  // Fallback to direct path
  try {
    StoryContractValidator = require('../utils/story-contract-validator');
  } catch (err) {
    console.error('Could not find StoryContractValidator module');
    process.exit(1);
  }
}

/**
 * Script to validate StoryContract in story files
 * Usage: node validate-story-contract.js <story-file-path>
 */

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node validate-story-contract.js <story-file-path>');
    process.exit(1);
  }

  const storyFilePath = path.resolve(args[0]);
  
  if (!fs.existsSync(storyFilePath)) {
    console.error(`Story file not found: ${storyFilePath}`);
    process.exit(1);
  }

  const validator = new StoryContractValidator();
  
  console.log(`Validating StoryContract in: ${storyFilePath}`);
  console.log('---');
  
  const result = validator.validateStoryFile(storyFilePath);
  
  if (result.valid) {
    console.log('✅ StoryContract is valid!');
    console.log('\nContract details:');
    console.log(`  Version: ${result.contract.version}`);
    console.log(`  Story ID: ${result.contract.story_id}`);
    console.log(`  Epic ID: ${result.contract.epic_id}`);
    console.log(`  API Endpoints: ${result.contract.apiEndpoints.length}`);
    console.log(`  Files to Modify: ${result.contract.filesToModify.length}`);
    console.log(`  Acceptance Criteria Links: ${result.contract.acceptanceCriteriaLinks.length}`);
  } else {
    console.error('❌ StoryContract validation failed!');
    console.error('\nErrors:');
    console.error(validator.formatErrors(result.errors));
    process.exit(1);
  }
}

// Run the script
main();