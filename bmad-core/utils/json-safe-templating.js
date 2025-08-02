/**
 * JSON-safe templating utilities
 * 
 * Ensures template variables are properly escaped for JSON serialization
 * to prevent parsing errors when templates contain quotes, newlines, or other special characters
 */

/**
 * Escapes a string value for safe inclusion in JSON
 * @param {*} value - The value to escape
 * @returns {string} - JSON-safe escaped string
 */
function escapeForJson(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  // If it's already a string representation of JSON, return as-is
  if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
    try {
      JSON.parse(value);
      return value;
    } catch (e) {
      // Not valid JSON, continue with escaping
    }
  }
  
  // Convert to string and escape
  const str = String(value);
  
  // Escape special characters for JSON
  return str
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')       // Escape double quotes
    .replace(/\n/g, '\\n')      // Escape newlines
    .replace(/\r/g, '\\r')      // Escape carriage returns
    .replace(/\t/g, '\\t')      // Escape tabs
    .replace(/\f/g, '\\f')      // Escape form feeds
    .replace(/\b/g, '\\b');     // Escape backspaces
}

/**
 * Processes a template string and escapes all template variables for JSON safety
 * @param {string} template - The template string containing {{variables}}
 * @param {object} context - The context object containing variable values
 * @returns {string} - The processed template with escaped values
 */
function processJsonTemplate(template, context) {
  if (!template || typeof template !== 'string') {
    return template;
  }
  
  // Find all template variables
  const variablePattern = /\{\{([^}]+)\}\}/g;
  
  return template.replace(variablePattern, (match, variablePath) => {
    // Trim whitespace from variable path
    const path = variablePath.trim();
    
    // Navigate through the context object
    const pathParts = path.split('.');
    let value = context;
    
    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        // Variable not found, return empty string
        return '""';
      }
    }
    
    // Handle different value types
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      // For arrays, JSON stringify but escape quotes in string elements
      const escapedArray = value.map(item => {
        if (typeof item === 'string') {
          return `"${escapeForJson(item)}"`;
        }
        return JSON.stringify(item);
      });
      return `[${escapedArray.join(',')}]`;
    }
    
    if (typeof value === 'object') {
      // For objects, stringify but be careful with nested strings
      try {
        return JSON.stringify(value);
      } catch (e) {
        return '{}';
      }
    }
    
    // For strings, wrap in quotes and escape
    return `"${escapeForJson(value)}"`;
  });
}

/**
 * Validates that a processed template will produce valid JSON
 * @param {string} jsonString - The JSON string to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateJsonString(jsonString) {
  try {
    JSON.parse(jsonString);
    return { valid: true };
  } catch (e) {
    return { 
      valid: false, 
      error: e.message,
      position: e.message.match(/position (\d+)/)?.[1] || 'unknown'
    };
  }
}

/**
 * Safely processes YAML content with JSON templates
 * @param {string} yamlContent - The YAML content with templates
 * @param {object} context - The context for template replacement
 * @returns {object} - The parsed YAML with processed templates
 */
function processYamlWithJsonTemplates(yamlContent, context) {
  // First pass: identify JSON-like structures in YAML
  const jsonBlockPattern = /^(\s*)([a-zA-Z_]+):\s*(\{[^}]*\}|\[[^\]]*\])$/gm;
  
  let processedYaml = yamlContent;
  
  // Process each potential JSON block
  processedYaml = processedYaml.replace(jsonBlockPattern, (match, indent, key, jsonBlock) => {
    // Process the JSON block with our template processor
    const processedJson = processJsonTemplate(jsonBlock, context);
    
    // Validate the result
    const validation = validateJsonString(processedJson);
    if (!validation.valid) {
      console.warn(`Warning: Invalid JSON in ${key}: ${validation.error}`);
      // Return original if processing fails
      return match;
    }
    
    return `${indent}${key}: ${processedJson}`;
  });
  
  // Parse the YAML
  try {
    return yaml.load(processedYaml);
  } catch (e) {
    throw new Error(`Failed to parse YAML after template processing: ${e.message}`);
  }
}

module.exports = {
  escapeForJson,
  processJsonTemplate,
  validateJsonString,
  processYamlWithJsonTemplates
};