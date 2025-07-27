#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { program } = require('commander');

program
  .option('--file <path>', 'Path to search tools file to validate', 'search-tools.yaml')
  .parse(process.argv);

const options = program.opts();

function validateSearchTool(tool, index) {
  const errors = [];
  
  // Required fields
  if (!tool.name) {
    errors.push(`Tool at index ${index} is missing required field 'name'`);
  }
  if (!tool.query) {
    errors.push(`Tool at index ${index} is missing required field 'query'`);
  }
  if (!tool.description) {
    errors.push(`Tool at index ${index} is missing required field 'description'`);
  }
  
  // Type validation
  if (tool.name && typeof tool.name !== 'string') {
    errors.push(`Tool at index ${index}: 'name' must be a string`);
  }
  if (tool.query && typeof tool.query !== 'string') {
    errors.push(`Tool at index ${index}: 'query' must be a string`);
  }
  if (tool.description && typeof tool.description !== 'string') {
    errors.push(`Tool at index ${index}: 'description' must be a string`);
  }
  if (tool.repository && typeof tool.repository !== 'string') {
    errors.push(`Tool at index ${index}: 'repository' must be a string`);
  }
  
  return errors;
}

function validateSearchTools(data) {
  const errors = [];
  
  // If data is an array, it's the metadata-less format
  if (Array.isArray(data)) {
    data.forEach((tool, index) => {
      errors.push(...validateSearchTool(tool, index));
    });
    return { searchTools: data, errors };
  }
  
  // Otherwise, it should have the metadata format
  if (!data.version) {
    errors.push("Missing 'version' field");
  }
  if (!data.generated) {
    errors.push("Missing 'generated' field");
  }
  if (!data.searchTools) {
    errors.push("Missing 'searchTools' field");
  } else if (!Array.isArray(data.searchTools)) {
    errors.push("'searchTools' must be an array");
  } else {
    data.searchTools.forEach((tool, index) => {
      errors.push(...validateSearchTool(tool, index));
    });
  }
  
  return { searchTools: data.searchTools || [], errors };
}

async function main() {
  try {
    const filePath = path.resolve(options.file);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    
    // Read and parse YAML
    let data;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      data = yaml.load(content);
    } catch (e) {
      console.error(`❌ Invalid YAML in ${filePath}: ${e.message}`);
      process.exit(1);
    }
    
    // Validate structure
    const { searchTools, errors } = validateSearchTools(data);
    
    if (errors.length > 0) {
      console.error(`❌ Validation failed with ${errors.length} error(s):`);
      errors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }
    
    console.log(`✅ Validation passed for ${filePath}`);
    console.log(`   Found ${searchTools.length} valid search tool(s)`);
    
  } catch (error) {
    console.error('Error validating search tools:', error);
    process.exit(1);
  }
}

main();