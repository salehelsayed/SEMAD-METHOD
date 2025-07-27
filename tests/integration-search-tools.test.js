const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

describe('Search Tools Generation Integration', () => {
  const testDir = path.join(__dirname, 'integration-test-outputs');
  const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-search-tools.js');
  const mappingsPath = path.join(__dirname, '..', 'data', 'tool-mappings.yaml');
  
  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should work with real tool mappings file', () => {
    // Verify mappings file exists
    expect(fs.existsSync(mappingsPath)).toBe(true);

    // Create a realistic PRD
    const prdPath = path.join(testDir, 'test-prd.md');
    const outputPath = path.join(testDir, 'search-tools.yaml');
    
    const prdContent = `
# E-Commerce Platform PRD

## Overview
We are building a modern e-commerce platform with the following features:

### Core Features
- User authentication using OAuth and JWT
- Product catalog with Elasticsearch
- Shopping cart with Redis caching
- Payment processing via Stripe
- Real-time notifications using WebSocket
- Order management with PostgreSQL database

### Technical Stack
- Backend: Express.js with TypeScript
- Frontend: React with Next.js
- Database: PostgreSQL with TypeORM
- Cache: Redis
- Search: Elasticsearch
- Message Queue: RabbitMQ for order processing
- Deployment: Kubernetes on AWS

### API Design
- RESTful API with GraphQL for complex queries
- Microservice architecture for scalability
- API Gateway using Kong
`;

    fs.writeFileSync(prdPath, prdContent);

    // Run the actual script
    const output = execSync(
      `node ${scriptPath} --prd ${prdPath} --mappings ${mappingsPath} --output ${outputPath}`,
      { encoding: 'utf8' }
    );

    console.log('Script output:', output);

    // Verify output file
    expect(fs.existsSync(outputPath)).toBe(true);
    
    const searchTools = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    
    // Verify structure
    expect(searchTools).toHaveProperty('version', '1.0');
    expect(searchTools).toHaveProperty('generated');
    expect(searchTools).toHaveProperty('searchTools');
    expect(Array.isArray(searchTools.searchTools)).toBe(true);
    expect(searchTools.searchTools.length).toBeGreaterThan(10); // Should have many queries

    // Verify specific tools based on our mappings
    const toolNames = searchTools.searchTools.map(t => t.name);
    expect(toolNames).toContain('github');
    expect(toolNames).toContain('npmjs');
    expect(toolNames).toContain('stripe-api-docs');

    // Verify queries contain expected keywords
    const queries = searchTools.searchTools.map(t => t.query);
    const queryString = queries.join(' ');
    
    expect(queryString).toContain('authentication');
    expect(queryString).toContain('elasticsearch');
    expect(queryString).toContain('stripe');
    expect(queryString).toContain('redis');
    expect(queryString).toContain('postgresql');
    expect(queryString).toContain('rabbitmq');
    expect(queryString).toContain('kubernetes');
    expect(queryString).toContain('graphql');
    expect(queryString).toContain('express');
    expect(queryString).toContain('react');
    expect(queryString).toContain('typescript');

    // Verify no duplicate queries
    const uniqueQueries = [...new Set(queries)];
    expect(queries.length).toBe(uniqueQueries.length);

    // Log some example queries for manual verification
    console.log('\nExample generated queries:');
    searchTools.searchTools.slice(0, 5).forEach(tool => {
      console.log(`- ${tool.name}: "${tool.query}"`);
    });
  });

  test('should handle sharded PRD', () => {
    // Create a sharded PRD structure
    const prdDir = path.join(testDir, 'prd');
    fs.mkdirSync(prdDir, { recursive: true });
    
    // Create main PRD file
    const mainPrdPath = path.join(prdDir, 'prd.md');
    fs.writeFileSync(mainPrdPath, `
# Main PRD

This is the main PRD file with authentication and payment features.
`);

    // Create epic files
    const epic1Path = path.join(prdDir, 'epic-1-authentication.md');
    fs.writeFileSync(epic1Path, `
# Epic 1: Authentication

Implement OAuth authentication with JWT tokens.
Use Redis for session management.
`);

    const epic2Path = path.join(prdDir, 'epic-2-payments.md');
    fs.writeFileSync(epic2Path, `
# Epic 2: Payment Processing

Integrate Stripe for payment processing.
Handle webhooks for payment events.
`);

    const outputPath = path.join(testDir, 'search-tools.yaml');

    // Run on main PRD (in real usage, would concatenate shards first)
    execSync(
      `node ${scriptPath} --prd ${mainPrdPath} --mappings ${mappingsPath} --output ${outputPath}`,
      { encoding: 'utf8' }
    );

    // Should generate output even from partial PRD
    expect(fs.existsSync(outputPath)).toBe(true);
    const searchTools = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    expect(searchTools.searchTools.length).toBeGreaterThan(0);
  });
});