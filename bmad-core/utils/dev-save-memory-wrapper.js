#!/usr/bin/env node

/**
 * Wrapper for dev-save-memory task that ensures proper JSON escaping
 * This prevents JSON parsing errors when implementation details contain quotes or special characters
 */

const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

// Function to safely escape strings for JSON
function jsonSafeString(str) {
  if (str === null || str === undefined) {
    return '';
  }
  
  // Convert to string and escape special characters
  return String(str)
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')       // Escape double quotes
    .replace(/\n/g, '\\n')      // Escape newlines
    .replace(/\r/g, '\\r')      // Escape carriage returns
    .replace(/\t/g, '\\t');     // Escape tabs
}

// Function to process implementation details
function processImplementationDetails(details) {
  if (!details || typeof details !== 'object') {
    return {};
  }
  
  const processed = {};
  
  // Process each field, ensuring proper escaping
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) {
      processed[key] = '';
    } else if (typeof value === 'string') {
      processed[key] = jsonSafeString(value);
    } else if (Array.isArray(value)) {
      // For arrays, process each element
      processed[key] = value.map(item => 
        typeof item === 'string' ? jsonSafeString(item) : item
      );
    } else if (typeof value === 'object') {
      // Recursively process nested objects
      processed[key] = processImplementationDetails(value);
    } else {
      // Numbers, booleans, etc. can be used as-is
      processed[key] = value;
    }
  }
  
  return processed;
}

// Main execution
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.error('Usage: dev-save-memory-wrapper.js <story_id> <task_name> <implementation_details_json>');
      process.exit(1);
    }
    
    const storyId = args[0];
    const taskName = args[1];
    let implementationDetails = {};
    
    // Parse implementation details
    try {
      if (args[2]) {
        implementationDetails = JSON.parse(args[2]);
      }
    } catch (e) {
      console.error('Error parsing implementation details JSON:', e.message);
      // Try to extract meaningful data even if JSON is malformed
      implementationDetails = {
        description: args[2],
        error: 'Failed to parse JSON, saved raw content'
      };
    }
    
    // Process the implementation details to ensure JSON safety
    const safeDetails = processImplementationDetails(implementationDetails);
    
    // Add default values if missing
    safeDetails.decision = safeDetails.decision || 'Implementation completed';
    safeDetails.rationale = safeDetails.rationale || 'Standard implementation approach';
    safeDetails.pattern = safeDetails.pattern || `Implementation: ${taskName}`;
    safeDetails.description = safeDetails.description || `Completed task ${taskName} for story ${storyId}`;
    safeDetails.files = safeDetails.files || [];
    safeDetails.techStack = safeDetails.techStack || 'TypeScript, React, Node.js';
    safeDetails.challenges = safeDetails.challenges || 'None encountered';
    safeDetails.solutions = safeDetails.solutions || 'Standard implementation';
    safeDetails.importance = safeDetails.importance || 'medium';
    safeDetails.tags = safeDetails.tags || [taskName, storyId];
    
    // Load and execute the actual task
    const taskPath = path.join(__dirname, '..', 'structured-tasks', 'dev-save-memory.yaml');
    const taskContent = fs.readFileSync(taskPath, 'utf8');
    const task = yaml.load(taskContent);
    
    console.log('✅ Successfully processed implementation details for dev-save-memory');
    console.log('Story ID:', storyId);
    console.log('Task Name:', taskName);
    console.log('Processed Details:', JSON.stringify(safeDetails, null, 2));
    
    // Return the safe details for the task runner to use
    process.stdout.write('\n--- SAFE_DETAILS ---\n');
    process.stdout.write(JSON.stringify({
      story_id: storyId,
      task_name: taskName,
      implementation_details: safeDetails,
      current_timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('❌ Error in dev-save-memory wrapper:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the wrapper
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});