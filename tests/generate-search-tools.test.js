const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

describe('Generate Search Tools', () => {
  const testDir = path.join(__dirname, 'test-outputs');
  const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-search-tools.js');
  const samplePrdPath = path.join(testDir, 'sample-prd.md');
  const outputPath = path.join(testDir, 'search-tools.yaml');
  const customMappingsPath = path.join(testDir, 'custom-mappings.yaml');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should generate search tools from a PRD with known keywords', () => {
    // Create sample PRD with known keywords
    const samplePrd = `
# Product Requirements Document

## Overview
We are building an authentication system with OAuth support and JWT tokens.
The system will integrate with Stripe for payment processing and use Redis for caching.
The backend will be built with Express and TypeScript, while the frontend uses React.

## Technical Requirements
- PostgreSQL database for user data
- Redis cache for session management
- Stripe integration for payments
- JWT authentication with refresh tokens
- OAuth providers (Google, GitHub)
- Express middleware for authorization
- React components with TypeScript
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run the script
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Verify output exists
    expect(fs.existsSync(outputPath)).toBe(true);

    // Parse and verify output
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    expect(output).toHaveProperty('version', '1.0');
    expect(output).toHaveProperty('generated');
    expect(output).toHaveProperty('searchTools');
    expect(Array.isArray(output.searchTools)).toBe(true);
    expect(output.searchTools.length).toBeGreaterThan(0);

    // Verify specific keywords were found and mapped
    const queries = output.searchTools.map(tool => tool.query);
    expect(queries.some(q => q.includes('authentication'))).toBe(true);
    expect(queries.some(q => q.includes('stripe'))).toBe(true);
    expect(queries.some(q => q.includes('redis'))).toBe(true);
    expect(queries.some(q => q.includes('jwt'))).toBe(true);
    expect(queries.some(q => q.includes('oauth'))).toBe(true);
    expect(queries.some(q => q.includes('express'))).toBe(true);
    expect(queries.some(q => q.includes('react'))).toBe(true);
    expect(queries.some(q => q.includes('typescript'))).toBe(true);
    expect(queries.some(q => q.includes('postgresql'))).toBe(true);

    // Verify structure of search tools
    output.searchTools.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('query');
      expect(tool).toHaveProperty('description');
    });
  });

  test('should handle missing mappings file with defaults', () => {
    // Create simple PRD
    const samplePrd = `
# PRD
Building a simple API with authentication features.
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run script with non-existent mappings file
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --mappings /non/existent/file.yaml --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Should still generate output with defaults
    expect(fs.existsSync(outputPath)).toBe(true);
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    expect(output.searchTools.length).toBeGreaterThan(0);
  });

  test('should handle sharded PRDs in directory', () => {
    // Create a PRD directory with multiple files
    const prdDir = path.join(testDir, 'prd-shards');
    fs.mkdirSync(prdDir, { recursive: true });
    
    // Create multiple PRD shard files
    fs.writeFileSync(path.join(prdDir, '01-overview.md'), `
# Overview
We're building a microservices architecture with Kubernetes.
`);
    
    fs.writeFileSync(path.join(prdDir, '02-auth.md'), `
# Authentication Service
Using OAuth and JWT for authentication.
`);
    
    fs.writeFileSync(path.join(prdDir, '03-payments.md'), `
# Payment Service
Integrating with Stripe for payment processing.
`);

    // Run script with directory path
    execSync(`node ${scriptPath} --prd ${prdDir} --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Verify output contains keywords from all shards
    expect(fs.existsSync(outputPath)).toBe(true);
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    const queries = output.searchTools.map(tool => tool.query);
    
    expect(queries.some(q => q.includes('kubernetes'))).toBe(true);
    expect(queries.some(q => q.includes('oauth'))).toBe(true);
    expect(queries.some(q => q.includes('stripe'))).toBe(true);
  });

  test('should handle custom mappings', () => {
    // Create custom mappings
    const customMappings = {
      keywordMappings: {
        api: [
          {
            name: 'custom-docs',
            queryTemplate: 'custom {{keyword}} docs'
          }
        ]
      }
    };

    fs.writeFileSync(customMappingsPath, yaml.dump(customMappings));

    // Create PRD with api keyword
    const samplePrd = `
# PRD
Building an API service.
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run with custom mappings
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --mappings ${customMappingsPath} --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Verify custom mapping was used
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    const customTool = output.searchTools.find(tool => tool.name === 'custom-docs');
    expect(customTool).toBeDefined();
    expect(customTool.query).toBe('custom api docs');
  });

  test('should handle PRD without technical keywords', () => {
    // Create PRD with no technical keywords
    const samplePrd = `
# PRD
This is a simple document with no technical keywords.
Just some general text about a project.
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run the script
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Should still create output file
    expect(fs.existsSync(outputPath)).toBe(true);
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    expect(output).toHaveProperty('searchTools');
    // May have few or no tools, but structure should be valid
    expect(Array.isArray(output.searchTools)).toBe(true);
  });

  test('should avoid duplicate queries', () => {
    // Create PRD with repeated keywords
    const samplePrd = `
# PRD
Authentication authentication authentication.
We need authentication for our authentication system.
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run the script
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --output ${outputPath}`, {
      encoding: 'utf8'
    });

    // Check for duplicates
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    const queries = output.searchTools.map(tool => tool.query);
    const uniqueQueries = [...new Set(queries)];
    expect(queries.length).toBe(uniqueQueries.length);
  });

  test('should throw error if PRD file does not exist', () => {
    expect(() => {
      execSync(`node ${scriptPath} --prd /non/existent/prd.md --output ${outputPath}`, {
        encoding: 'utf8'
      });
    }).toThrow();
  });

  test('should omit metadata when --no-metadata flag is used', () => {
    // Create simple PRD
    const samplePrd = `
# PRD
Building authentication with OAuth and JWT tokens.
`;

    fs.writeFileSync(samplePrdPath, samplePrd);

    // Run script with --no-metadata flag
    execSync(`node ${scriptPath} --prd ${samplePrdPath} --output ${outputPath} --no-metadata`, {
      encoding: 'utf8'
    });

    // Verify output is just an array without metadata
    expect(fs.existsSync(outputPath)).toBe(true);
    const output = yaml.load(fs.readFileSync(outputPath, 'utf8'));
    
    // Should be an array, not an object with version/generated/searchTools
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    
    // Each item should have the search tool structure
    output.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('query');
      expect(tool).toHaveProperty('description');
    });
  });
});