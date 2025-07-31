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
    console.log('Usage: node validate-story-contract.js <story-file-path>');
    console.log('');
    console.log('No story file provided. Searching for stories to validate...');
    
    // Try to find story files in common locations
    const possiblePaths = [
      'docs/stories',
      'stories',
      'story.md',
      'docs/story.md'
    ];
    
    let foundStories = [];
    
    for (const searchPath of possiblePaths) {
      const fullPath = path.resolve(searchPath);
      
      if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
          // Search for .md files in directory
          const storyFiles = fs.readdirSync(fullPath)
            .filter(file => file.endsWith('.md'))
            .map(file => path.join(fullPath, file));
          foundStories.push(...storyFiles);
        } else if (fullPath.endsWith('.md')) {
          foundStories.push(fullPath);
        }
      }
    }
    
    if (foundStories.length === 0) {
      console.error('No story files found in common locations.');
      console.error('Please provide a story file path as an argument.');
      process.exit(1);
    }
    
    console.log(`Found ${foundStories.length} story file(s):`);
    foundStories.forEach(file => console.log(`  - ${path.relative(process.cwd(), file)}`));
    console.log('');
    console.log('Validating all found stories...');
    console.log('');
    
    // Validate all found stories
    let allValid = true;
    foundStories.forEach(storyPath => {
      console.log(`Validating: ${path.relative(process.cwd(), storyPath)}`);
      const result = validateSingleStory(storyPath);
      if (!result) allValid = false;
      console.log('');
    });
    
    if (allValid) {
      console.log('✅ All story files are valid!');
      process.exit(0);
    } else {
      console.log('❌ Some story files have validation errors.');
      process.exit(1);
    }
    
    return;
  }

  const storyFilePath = path.resolve(args[0]);
  
  if (!fs.existsSync(storyFilePath)) {
    console.error(`Story file not found: ${storyFilePath}`);
    process.exit(1);
  }
  
  const result = validateSingleStory(storyFilePath);
  process.exit(result ? 0 : 1);
}

function validateSingleStory(storyFilePath) {
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
    return true;
  } else {
    // Check if the error is just about missing StoryContract
    const noContractError = result.errors.some(err => 
      err.message && err.message.includes('No StoryContract found'));
    
    if (noContractError && result.errors.length === 1) {
      console.log('⚠️  No StoryContract found in story file (this is acceptable for some story types)');
      console.log('    Story files without contracts will use default processing rules.');
      return true; // Treat as success since this is acceptable
    } else {
      console.error('❌ StoryContract validation failed!');
      console.error('\nErrors:');
      console.error(validator.formatErrors(result.errors));
      return false;
    }
  }
}

// Run the script
main();