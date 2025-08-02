#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { program } = require('commander');

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'should', 'could',
  'would', 'have', 'must', 'can', 'may', 'might', 'shall', 'should',
  'will', 'would', 'been', 'being', 'having', 'do', 'does', 'did',
  'done', 'make', 'makes', 'made', 'making', 'get', 'gets', 'got',
  'getting', 'go', 'goes', 'went', 'going', 'know', 'knows', 'knew',
  'knowing', 'see', 'sees', 'saw', 'seeing', 'say', 'says', 'said',
  'saying', 'give', 'gives', 'gave', 'giving', 'take', 'takes', 'took',
  'taking', 'come', 'comes', 'came', 'coming', 'want', 'wants', 'wanted',
  'wanting', 'look', 'looks', 'looked', 'looking', 'use', 'uses', 'used',
  'using', 'find', 'finds', 'found', 'finding', 'tell', 'tells', 'told',
  'telling', 'ask', 'asks', 'asked', 'asking', 'work', 'works', 'worked',
  'working', 'seem', 'seems', 'seemed', 'seeming', 'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'beginning', 'show', 'shows', 'showed',
  'showing', 'hear', 'hears', 'heard', 'hearing', 'play', 'plays', 'played',
  'playing', 'run', 'runs', 'ran', 'running', 'move', 'moves', 'moved',
  'moving', 'live', 'lives', 'lived', 'living', 'bring', 'brings', 'brought',
  'bringing', 'write', 'writes', 'wrote', 'writing', 'provide', 'provides',
  'provided', 'providing', 'sit', 'sits', 'sat', 'sitting', 'stand', 'stands',
  'stood', 'standing', 'lose', 'loses', 'lost', 'losing', 'pay', 'pays',
  'paid', 'paying', 'meet', 'meets', 'met', 'meeting', 'include', 'includes',
  'included', 'including', 'continue', 'continues', 'continued', 'continuing',
  'set', 'sets', 'setting', 'learn', 'learns', 'learned', 'learning',
  'change', 'changes', 'changed', 'changing', 'lead', 'leads', 'led',
  'leading', 'understand', 'understands', 'understood', 'understanding',
  'watch', 'watches', 'watched', 'watching', 'follow', 'follows', 'followed',
  'following', 'stop', 'stops', 'stopped', 'stopping', 'create', 'creates',
  'created', 'creating', 'speak', 'speaks', 'spoke', 'speaking', 'read',
  'reads', 'reading', 'allow', 'allows', 'allowed', 'allowing', 'add',
  'adds', 'added', 'adding', 'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'growing', 'open', 'opens', 'opened', 'opening',
  'walk', 'walks', 'walked', 'walking', 'win', 'wins', 'won', 'winning',
  'offer', 'offers', 'offered', 'offering', 'remember', 'remembers',
  'remembered', 'remembering', 'love', 'loves', 'loved', 'loving',
  'consider', 'considers', 'considered', 'considering', 'appear', 'appears',
  'appeared', 'appearing', 'buy', 'buys', 'bought', 'buying', 'wait',
  'waits', 'waited', 'waiting', 'serve', 'serves', 'served', 'serving',
  'die', 'dies', 'died', 'dying', 'send', 'sends', 'sent', 'sending',
  'expect', 'expects', 'expected', 'expecting', 'build', 'builds', 'built',
  'building', 'stay', 'stays', 'stayed', 'staying', 'fall', 'falls', 'fell',
  'falling', 'cut', 'cuts', 'cutting', 'reach', 'reaches', 'reached',
  'reaching', 'kill', 'kills', 'killed', 'killing', 'remain', 'remains',
  'remained', 'remaining', 'suggest', 'suggests', 'suggested', 'suggesting',
  'raise', 'raises', 'raised', 'raising', 'pass', 'passes', 'passed',
  'passing', 'sell', 'sells', 'sold', 'selling', 'require', 'requires',
  'required', 'requiring', 'report', 'reports', 'reported', 'reporting',
  'decide', 'decides', 'decided', 'deciding', 'pull', 'pulls', 'pulled',
  'pulling'
]);

// Domain-specific technical terms that are important
const DOMAIN_KEYWORDS = new Set([
  'authentication', 'authorization', 'api', 'database', 'payment',
  'messaging', 'cache', 'queue', 'storage', 'cdn', 'webhook',
  'graphql', 'rest', 'grpc', 'websocket', 'oauth', 'jwt',
  'microservice', 'kubernetes', 'docker', 'redis', 'postgresql',
  'mongodb', 'elasticsearch', 'rabbitmq', 'kafka', 'stripe',
  'twilio', 'sendgrid', 'aws', 'azure', 'gcp', 'firebase',
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'gatsby',
  'express', 'nestjs', 'fastify', 'django', 'flask', 'rails',
  'laravel', 'spring', 'serverless', 'lambda', 'function',
  'typescript', 'javascript', 'python', 'java', 'golang',
  'rust', 'swift', 'kotlin', 'flutter', 'reactnative'
]);

// Load core-config to get PRD settings
let coreConfig = {};
try {
  const configPath = path.join(__dirname, '..', 'bmad-core', 'core-config.yaml');
  if (fs.existsSync(configPath)) {
    coreConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // Fallback to defaults
}

// Determine default PRD path from core-config, with fallback
const defaultPrdPath = coreConfig.prd && coreConfig.prd.prdSharded && coreConfig.prd.prdShardedLocation
  ? coreConfig.prd.prdShardedLocation
  : (fs.existsSync('docs/prd') && fs.statSync('docs/prd').isDirectory() 
    ? 'docs/prd' 
    : 'docs/prd.md');

// Get default mappings and output paths from core-config
const defaultMappingsPath = coreConfig.searchTools?.toolMappingsFile || 'bmad-core/data/tool-mappings.yaml';
const defaultOutputPath = coreConfig.searchTools?.defaultOutputFile || 'search-tools.yaml';

program
  .option('--prd <path>', 'Path to PRD file or directory', defaultPrdPath)
  .option('--mappings <path>', 'Path to tool mappings file', defaultMappingsPath)
  .option('--output <path>', 'Path to output search tools file', defaultOutputPath)
  .option('--no-metadata', 'Omit version and generated fields from output')
  .parse(process.argv);

const options = program.opts();

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

  // Extract technical terms and high-frequency words
  const keywords = new Set();
  
  // Add domain keywords found in text
  words.forEach(word => {
    if (DOMAIN_KEYWORDS.has(word)) {
      keywords.add(word);
    }
  });

  // Add high-frequency words (appearing more than 3 times)
  Object.entries(wordCount)
    .filter(([word, count]) => count > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([word]) => keywords.add(word));

  return Array.from(keywords);
}

function generateSearchTools(prdContent, mappings) {
  const keywords = extractKeywords(prdContent);
  const searchTools = [];
  const seenQueries = new Set();

  keywords.forEach(keyword => {
    // Check if keyword has specific mappings
    if (mappings.keywordMappings && mappings.keywordMappings[keyword]) {
      mappings.keywordMappings[keyword].forEach(mapping => {
        const query = mapping.queryTemplate.replace('{{keyword}}', keyword);
        
        // Avoid duplicate queries
        if (!seenQueries.has(query)) {
          seenQueries.add(query);
          searchTools.push({
            name: mapping.name,
            query: query,
            ...(mapping.repository && { repository: mapping.repository }),
            description: `Search for ${keyword} on ${mapping.name}`
          });
        }
      });
    } else if (mappings.defaultMappings) {
      // Use default mappings for keywords without specific mappings
      mappings.defaultMappings.forEach(mapping => {
        const query = mapping.queryTemplate.replace('{{keyword}}', keyword);
        
        if (!seenQueries.has(query)) {
          seenQueries.add(query);
          searchTools.push({
            name: mapping.name,
            query: query,
            ...(mapping.repository && { repository: mapping.repository }),
            description: `Search for ${keyword} on ${mapping.name}`
          });
        }
      });
    }
  });

  return searchTools;
}

async function main() {
  try {
    // Read PRD file(s)
    const prdPath = path.resolve(options.prd);
    let prdContent = '';
    
    // Check if it's a directory (sharded PRDs)
    if (fs.existsSync(prdPath) && fs.statSync(prdPath).isDirectory()) {
      console.log(`Reading sharded PRDs from directory: ${prdPath}`);
      const prdFiles = fs.readdirSync(prdPath)
        .filter(file => file.endsWith('.md'))
        .sort(); // Ensure consistent ordering
      
      if (prdFiles.length === 0) {
        console.error(`No .md files found in PRD directory: ${prdPath}`);
        process.exit(1);
      }
      
      // Concatenate all PRD files
      for (const file of prdFiles) {
        const filePath = path.join(prdPath, file);
        console.log(`  Reading: ${file}`);
        prdContent += fs.readFileSync(filePath, 'utf8') + '\n\n';
      }
    } else if (fs.existsSync(prdPath) && fs.statSync(prdPath).isFile()) {
      // Single PRD file
      prdContent = fs.readFileSync(prdPath, 'utf8');
    } else {
      console.error(`PRD path not found: ${prdPath}`);
      process.exit(1);
    }

    // Read mappings file
    const mappingsPath = path.resolve(options.mappings);
    let mappings = {};
    if (fs.existsSync(mappingsPath)) {
      const mappingsContent = fs.readFileSync(mappingsPath, 'utf8');
      mappings = yaml.load(mappingsContent);
    } else {
      console.warn(`Mappings file not found: ${mappingsPath}, using defaults`);
      mappings = {
        defaultMappings: [
          {
            name: 'github',
            queryTemplate: '{{keyword}} implementation'
          },
          {
            name: 'npmjs',
            queryTemplate: '{{keyword}}'
          }
        ]
      };
    }

    // Generate search tools
    const searchTools = generateSearchTools(prdContent, mappings);

    // Write output
    const outputPath = path.resolve(options.output);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputData = options.metadata === false 
      ? searchTools 
      : {
          version: '1.0',
          generated: new Date().toISOString(),
          searchTools: searchTools
        };
    
    const outputContent = yaml.dump(outputData);

    fs.writeFileSync(outputPath, outputContent, 'utf8');
    console.log(`✅ Generated search tools file: ${outputPath}`);
    console.log(`   Found ${searchTools.length} search queries from ${extractKeywords(prdContent).length} keywords`);

  } catch (error) {
    console.error('Error generating search tools:', error);
    process.exit(1);
  }
}

main();