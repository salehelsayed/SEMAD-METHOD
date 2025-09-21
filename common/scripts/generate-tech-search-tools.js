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
const outputPath = getArg('--output') || 'tech-search-tools.yaml';

// Technical patterns to look for
const TECH_PATTERNS = {
  frameworks: /\b(react|vue|angular|svelte|nextjs|nuxtjs|gatsby|express|fastify|nestjs|koa|django|flask|fastapi|rails|spring|laravel)\b/gi,
  databases: /\b(postgresql|postgres|mysql|mongodb|redis|elasticsearch|dynamodb|cassandra|neo4j|influxdb|sqlite)\b/gi,
  languages: /\b(javascript|typescript|python|java|golang|rust|ruby|php|csharp|kotlin|swift)\b/gi,
  cloud: /\b(aws|azure|gcp|google cloud|kubernetes|docker|terraform|ansible|jenkins|circleci|github actions)\b/gi,
  messaging: /\b(rabbitmq|kafka|redis pub|sqs|sns|eventbridge|nats|zeromq)\b/gi,
  auth: /\b(oauth|jwt|saml|ldap|active directory|cognito|auth0|firebase auth|keycloak)\b/gi,
  api: /\b(rest|graphql|grpc|websocket|socket\.io|webhook|openapi|swagger)\b/gi,
  testing: /\b(jest|mocha|cypress|playwright|selenium|pytest|unittest|testng|junit)\b/gi,
  monitoring: /\b(prometheus|grafana|datadog|new relic|sentry|elk stack|cloudwatch|splunk)\b/gi,
  patterns: /\b(microservices|serverless|event-driven|cqrs|saga|circuit breaker|api gateway|service mesh)\b/gi
};

// Documentation sources with specific search strategies
const DOC_SOURCES = {
  official_docs: {
    react: 'https://react.dev/learn',
    vue: 'https://vuejs.org/guide/',
    angular: 'https://angular.io/docs',
    express: 'https://expressjs.com/en/4x/api.html',
    postgresql: 'https://www.postgresql.org/docs/current/',
    mongodb: 'https://www.mongodb.com/docs/',
    aws: 'https://docs.aws.amazon.com/',
    kubernetes: 'https://kubernetes.io/docs/'
  },
  github_repos: {
    baseUrl: 'https://github.com/search?type=repositories&q=',
    queryTemplate: '{{tech}} {{context}} stars:>100 sort:stars'
  },
  github_code: {
    baseUrl: 'https://github.com/search?type=code&q=',
    queryTemplate: '{{tech}} {{pattern}} language:{{language}} size:>1000'
  },
  stackoverflow: {
    baseUrl: 'https://stackoverflow.com/search?tab=votes&q=',
    queryTemplate: '[{{tech}}] {{problem}} is:answer score:10'
  },
  medium: {
    baseUrl: 'https://medium.com/search?q=',
    queryTemplate: '{{tech}} {{year}} tutorial implementation'
  },
  dev_to: {
    baseUrl: 'https://dev.to/search?q=',
    queryTemplate: '{{tech}} {{pattern}} {{year}}'
  }
};

function extractTechnicalContext(content) {
  const techStack = {
    frameworks: new Set(),
    databases: new Set(),
    languages: new Set(),
    cloud: new Set(),
    messaging: new Set(),
    auth: new Set(),
    api: new Set(),
    testing: new Set(),
    monitoring: new Set(),
    patterns: new Set(),
    // Extract specific technical requirements
    features: [],
    integrations: []
  };

  // Extract technologies mentioned
  Object.entries(TECH_PATTERNS).forEach(([category, pattern]) => {
    const matches = content.match(pattern) || [];
    matches.forEach(match => techStack[category].add(match.toLowerCase()));
  });

  // Extract feature requirements (look for patterns like "must have", "should support", etc.)
  const featurePatterns = [
    /must (?:have|support|implement) ([^.]+)/gi,
    /should (?:have|support|implement) ([^.]+)/gi,
    /requires? ([^.]+)/gi,
    /needs? to ([^.]+)/gi
  ];

  featurePatterns.forEach(pattern => {
    const matches = [...content.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1] && match[1].length < 100) {
        techStack.features.push(match[1].trim());
      }
    });
  });

  // Extract integration requirements
  const integrationPattern = /integrat\w+ with ([^.]+)/gi;
  const integrationMatches = [...content.matchAll(integrationPattern)];
  integrationMatches.forEach(match => {
    if (match[1]) {
      techStack.integrations.push(match[1].trim());
    }
  });

  return techStack;
}

function generateDocumentationQueries(techStack) {
  const queries = {
    documentation_searches: [],
    code_examples: [],
    best_practices: [],
    troubleshooting: []
  };

  const currentYear = new Date().getFullYear();

  // Generate targeted documentation searches
  techStack.frameworks.forEach(framework => {
    queries.documentation_searches.push({
      query: `${framework} official documentation ${currentYear}`,
      source: 'google',
      intent: 'Find latest official docs'
    });
    
    queries.code_examples.push({
      query: `${framework} production ready example ${currentYear}`,
      source: 'github',
      intent: 'Find real-world implementations'
    });

    // If we have specific features, create targeted queries
    techStack.features.slice(0, 5).forEach(feature => {
      queries.best_practices.push({
        query: `${framework} ${feature} best practices`,
        source: 'stackoverflow',
        intent: 'Find implementation patterns'
      });
    });
  });

  // Database-specific queries
  techStack.databases.forEach(db => {
    queries.documentation_searches.push({
      query: `${db} schema design patterns`,
      source: 'official_docs',
      intent: 'Database design guidance'
    });
    
    if (techStack.frameworks.size > 0) {
      const framework = Array.from(techStack.frameworks)[0];
      queries.code_examples.push({
        query: `${db} ${framework} connection pooling example`,
        source: 'github',
        intent: 'Database integration patterns'
      });
    }
  });

  // Integration-specific queries
  techStack.integrations.forEach(integration => {
    queries.documentation_searches.push({
      query: `${integration} API documentation`,
      source: 'google',
      intent: 'Integration API reference'
    });
    
    queries.code_examples.push({
      query: `${integration} integration example ${Array.from(techStack.languages)[0] || 'javascript'}`,
      source: 'github',
      intent: 'Integration implementation'
    });
  });

  // Architecture pattern queries
  techStack.patterns.forEach(pattern => {
    queries.best_practices.push({
      query: `${pattern} implementation guide ${currentYear}`,
      source: 'medium',
      intent: 'Architecture patterns'
    });
  });

  return queries;
}

function generateLocalIngestionPlan(queries) {
  return {
    output_directory: '.ai/doc-ingestion',
    suggested_sources: {
      documentation: queries.documentation_searches.map(q => q.query),
      code_examples: queries.code_examples.map(q => q.query),
      best_practices: queries.best_practices.map(q => q.query)
    },
    tasks: [
      {
        task: 'ingest-documentation',
        description: 'Fetch and normalize documentation into .ai/doc-ingestion',
        inputs: {
          searchToolsPath: 'tech-search-tools.yaml',
          outputDirectory: '.ai/doc-ingestion',
          ingestionReport: 'documentation-ingestion-report.md'
        }
      },
      {
        task: 'query-technical-docs',
        description: 'Search the local documentation cache for answers during development',
        inputs: {
          searchPaths: 'docs,data/kb,.ai/doc-ingestion'
        }
      }
    ]
  };
}

async function main() {
  try {
    // Read PRD file
    if (!fs.existsSync(prdPath)) {
      console.error(`PRD file not found: ${prdPath}`);
      process.exit(1);
    }

    const prdContent = fs.readFileSync(prdPath, 'utf8');
    
    // Extract technical context
    const techStack = extractTechnicalContext(prdContent);
    
    console.log('Extracted Technical Context:');
    console.log(`- Frameworks: ${Array.from(techStack.frameworks).join(', ') || 'none'}`);
    console.log(`- Databases: ${Array.from(techStack.databases).join(', ') || 'none'}`);
    console.log(`- Languages: ${Array.from(techStack.languages).join(', ') || 'none'}`);
    console.log(`- Features: ${techStack.features.length}`);
    console.log(`- Integrations: ${techStack.integrations.length}`);
    
    // Generate documentation queries
    const queries = generateDocumentationQueries(techStack);
    
    // Generate local ingestion plan
    const ingestionPlan = generateLocalIngestionPlan(queries);
    
    // Create output
    const output = {
      version: '2.0',
      generated: new Date().toISOString(),
      project_context: {
        frameworks: Array.from(techStack.frameworks),
        databases: Array.from(techStack.databases),
        languages: Array.from(techStack.languages),
        patterns: Array.from(techStack.patterns),
        features: techStack.features.slice(0, 10),
        integrations: techStack.integrations
      },
      documentation_queries: queries,
      local_ingestion_plan: ingestionPlan,
      usage_instructions: {
        search: 'Use documentation_queries to drive manual or automated searches',
        ingest: 'Run the ingest-documentation structured task to capture docs into .ai/doc-ingestion',
        query: 'Use the query-technical-docs structured task to search the local documentation cache'
      }
    };

    // Write output
    fs.writeFileSync(outputPath, yaml.dump(output, { lineWidth: -1 }));
    
    console.log(`\nGenerated enhanced search tools in ${outputPath}`);
    console.log(`- Documentation queries: ${queries.documentation_searches.length}`);
    console.log(`- Code examples: ${queries.code_examples.length}`);
    console.log(`- Best practices: ${queries.best_practices.length}`);
    console.log(`\nNext steps:`);
    console.log(`1. Review the generated queries in ${outputPath}`);
    console.log(`2. Run the documentation searches to gather content`);
    console.log(`3. Execute the ingest-documentation task to normalize results into .ai/doc-ingestion/`);
    console.log(`4. Use query-technical-docs to search the local documentation cache from agents`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
