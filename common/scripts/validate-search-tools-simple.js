#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');

// Simple argument parsing
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};

const filePath = getArg('--file') || 'search-tools.yaml';

try {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const data = yaml.load(content);

  // Count tools and queries
  let toolCount = 0;
  let queryCount = 0;

  if (data && data.tools && Array.isArray(data.tools)) {
    toolCount = data.tools.length;
    data.tools.forEach(tool => {
      if (tool.queries && Array.isArray(tool.queries)) {
        queryCount += tool.queries.length;
      }
    });
  }

  console.log(`✅ Validation passed for ${filePath}`);
  console.log(`   Found ${toolCount} search tool(s) with ${queryCount} total queries`);

  // Show summary if tools exist
  if (toolCount > 0) {
    console.log('\nTools summary:');
    data.tools.forEach(tool => {
      console.log(`   - ${tool.tool}: ${tool.queries ? tool.queries.length : 0} queries`);
    });
  }

} catch (error) {
  console.error(`❌ Validation failed: ${error.message}`);
  process.exit(1);
}