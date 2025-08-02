#!/usr/bin/env node

/**
 * Utility to prepare implementation details for safe use in dev-save-memory task
 * Ensures all string values are properly escaped to prevent JSON parsing errors
 */

/**
 * Escapes a string value to be safe for use in YAML/JSON contexts
 * @param {*} value - The value to escape
 * @returns {*} - The escaped value (strings are escaped, other types returned as-is)
 */
function escapeValue(value) {
  if (typeof value !== 'string') {
    return value;
  }
  
  // For strings, we need to escape special characters that could break JSON/YAML
  // Note: Since YAML handles the outer quotes, we just need to escape internal quotes and newlines
  return value
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')       // Escape double quotes
    .replace(/\n/g, '\\n')      // Escape newlines
    .replace(/\r/g, '\\r')      // Escape carriage returns
    .replace(/\t/g, '\\t');     // Escape tabs
}

/**
 * Prepares implementation details object for safe use in memory tasks
 * @param {object} details - Raw implementation details
 * @returns {object} - Safely escaped implementation details
 */
function prepareImplementationDetails(details) {
  const safeDetails = {
    // Ensure all required fields exist with safe defaults
    decision: escapeValue(details.decision || 'Implementation completed'),
    rationale: escapeValue(details.rationale || 'Standard implementation approach'),
    pattern: escapeValue(details.pattern || 'Standard pattern'),
    description: escapeValue(details.description || 'Task completed'),
    codeSnippet: escapeValue(details.codeSnippet || ''),
    techStack: escapeValue(details.techStack || 'TypeScript, React, Node.js'),
    challenges: escapeValue(details.challenges || 'None encountered'),
    solutions: escapeValue(details.solutions || 'Standard implementation'),
    
    // Arrays should be passed as-is (YAML will handle them)
    files: Array.isArray(details.files) ? details.files : [],
    tags: Array.isArray(details.tags) ? details.tags : [],
    
    // Other fields
    importance: details.importance || 'medium',
    
    // For story completion
    completedTasks: Array.isArray(details.completedTasks) ? details.completedTasks : [],
    decisions: Array.isArray(details.decisions) ? details.decisions.map(d => escapeValue(d)) : [],
    filesCreated: Array.isArray(details.filesCreated) ? details.filesCreated : [],
    filesModified: Array.isArray(details.filesModified) ? details.filesModified : [],
    lessons: escapeValue(details.lessons || '')
  };
  
  return safeDetails;
}

/**
 * Command-line interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: prepare-memory-data.js <implementation-details-json>');
    console.error('       prepare-memory-data.js --example');
    process.exit(1);
  }
  
  if (args[0] === '--example') {
    const example = {
      decision: 'Use JWT tokens with "Bearer" authentication',
      rationale: 'It\'s the industry standard and well-supported',
      pattern: 'Authentication: JWT-based',
      description: 'Implemented JWT auth with:\n- Bearer tokens\n- 24h expiry',
      files: ['src/auth/jwt.ts', 'src/middleware/auth.ts'],
      techStack: 'Node.js, Express, jsonwebtoken',
      challenges: 'Had to handle "edge cases" and refresh logic',
      solutions: 'Used refresh tokens with 7-day expiry',
      tags: ['auth', 'jwt', 'security'],
      importance: 'high'
    };
    
    console.log('Example input:');
    console.log(JSON.stringify(example, null, 2));
    console.log('\nPrepared output:');
    console.log(JSON.stringify(prepareImplementationDetails(example), null, 2));
    process.exit(0);
  }
  
  try {
    const inputJson = args.join(' ');
    const details = JSON.parse(inputJson);
    const safeDetails = prepareImplementationDetails(details);
    
    // Output the safe details as JSON for the task runner
    console.log(JSON.stringify(safeDetails));
  } catch (error) {
    console.error('Error preparing implementation details:', error.message);
    
    // If JSON parsing fails, create a minimal safe object
    const fallback = prepareImplementationDetails({
      description: args.join(' '),
      decision: 'See description',
      rationale: 'Error parsing input - saved raw content'
    });
    
    console.log(JSON.stringify(fallback));
  }
}

module.exports = {
  escapeValue,
  prepareImplementationDetails
};