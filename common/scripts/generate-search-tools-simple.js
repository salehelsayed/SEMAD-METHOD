#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Simple argument parsing
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};

const prdPath = getArg('--prd') || 'docs/prd.md';
const mappingsPath = getArg('--mappings') || '.bmad-core/data/tool-mappings.yaml';
const outputPath = getArg('--output') || 'search-tools.yaml';

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'should', 'could',
  'would', 'have', 'must', 'can', 'may', 'might', 'shall', 'should'
]);

function extractKeywords(text) {
  // Convert to lowercase and split into words
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);

  // Count word frequency
  const wordCount = {};
  words.forEach(word => {
    if (!STOP_WORDS.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });

  // Sort by frequency and return top keywords
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word]) => word);
}

function generateSearchQueries(keywords, mappingsData) {
  const searchToolsMap = new Map();
  
  // Handle the actual structure from tool-mappings.yaml
  const keywordMappings = mappingsData?.mappings?.keywordMappings || {};
  const defaultMappings = mappingsData?.mappings?.defaultMappings || [];
  
  // Check each keyword against the mappings
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    // Check if keyword matches any specific mapping
    let foundMapping = false;
    
    for (const [mappingKey, toolConfigs] of Object.entries(keywordMappings)) {
      if (lowerKeyword.includes(mappingKey) || mappingKey.includes(lowerKeyword)) {
        foundMapping = true;
        
        // Apply each tool configuration for this keyword
        toolConfigs.forEach(toolConfig => {
          const toolName = toolConfig.name;
          const query = toolConfig.queryTemplate.replace(/\{\{keyword\}\}/g, keyword);
          
          if (!searchToolsMap.has(toolName)) {
            searchToolsMap.set(toolName, {
              tool: toolName,
              queries: []
            });
          }
          
          searchToolsMap.get(toolName).queries.push(query);
        });
      }
    }
    
    // If no specific mapping found, use default mappings
    if (!foundMapping && defaultMappings.length > 0) {
      defaultMappings.forEach(toolConfig => {
        const toolName = toolConfig.name;
        const query = toolConfig.queryTemplate.replace(/\{\{keyword\}\}/g, keyword);
        
        if (!searchToolsMap.has(toolName)) {
          searchToolsMap.set(toolName, {
            tool: toolName,
            queries: []
          });
        }
        
        searchToolsMap.get(toolName).queries.push(query);
      });
    }
  });
  
  // Convert map to array and limit queries
  const searchTools = Array.from(searchToolsMap.values()).map(tool => ({
    ...tool,
    queries: [...new Set(tool.queries)].slice(0, 10) // Unique queries, max 10 per tool
  }));
  
  return searchTools;
}

async function main() {
  try {
    // Read PRD file
    if (!fs.existsSync(prdPath)) {
      console.error(`PRD file not found: ${prdPath}`);
      process.exit(1);
    }

    const prdContent = fs.readFileSync(prdPath, 'utf8');
    
    // Read mappings file
    let mappings = {};
    if (fs.existsSync(mappingsPath)) {
      try {
        mappings = yaml.load(fs.readFileSync(mappingsPath, 'utf8'));
      } catch (e) {
        console.error(`Error: Could not parse mappings file: ${e.message}`);
        process.exit(1);
      }
    } else {
      console.error(`Error: Mappings file not found: ${mappingsPath}`);
      process.exit(1);
    }

    // Extract keywords
    const keywords = extractKeywords(prdContent);
    console.log(`Extracted ${keywords.length} keywords from PRD`);

    // Generate search queries
    const searchTools = generateSearchQueries(keywords, mappings);
    
    // Create output
    const output = {
      version: '1.0',
      generated: new Date().toISOString(),
      tools: searchTools
    };

    // Write output
    fs.writeFileSync(outputPath, yaml.dump(output, { lineWidth: -1 }));
    
    console.log(`Generated ${searchTools.length} search tools in ${outputPath}`);
    console.log(`Total queries: ${searchTools.reduce((sum, tool) => sum + tool.queries.length, 0)}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();