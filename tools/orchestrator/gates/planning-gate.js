#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

/**
 * Planning Gate: Validates artifacts against schemas before allowing progression to Development phase
 * Validates docs/brief.md, docs/prd/PRD.md, and docs/architecture/*.md against their respective schemas
 */
class PlanningGate {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.validators = {};
    this.results = {
      gate: 'planning',
      timestamp: new Date().toISOString(),
      passed: false,
      artifacts: [],
      errors: []
    };
  }

  /**
   * Load and compile JSON schemas for validation
   */
  async loadSchemas() {
    const schemasDir = path.resolve(__dirname, '..', '..', '..', 'bmad-core', 'schemas');
    
    const schemas = {
      'brief': 'brief-schema.json',
      'prd': 'prd-schema.json',
      'architecture': 'architecture-schema.json'
    };
    
    for (const [type, file] of Object.entries(schemas)) {
      try {
        const schemaPath = path.join(schemasDir, file);
        const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
        this.validators[type] = this.ajv.compile(schema);
        console.log(`✓ Loaded schema for ${type}`);
      } catch (error) {
        console.error(`✗ Failed to load schema ${type}: ${error.message}`);
        this.results.errors.push({
          type: 'schema_load_error',
          schema: type,
          message: error.message
        });
      }
    }
  }

  /**
   * Convert markdown to JSON for validation (extract frontmatter or JSON blocks)
   */
  async parseMarkdownArtifact(filePath, artifactType) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Try to extract JSON from frontmatter or code blocks
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const yaml = require('js-yaml');
        return yaml.load(frontmatterMatch[1]);
      }
      
      // Try to extract JSON code blocks
      const jsonBlockMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonBlockMatch) {
        return JSON.parse(jsonBlockMatch[1]);
      }

      // Look for structured content based on artifact type
      if (artifactType === 'brief') {
        return this.parseBriefMarkdown(content);
      } else if (artifactType === 'prd') {
        return this.parsePRDMarkdown(content);
      } else if (artifactType === 'architecture') {
        return this.parseArchitectureMarkdown(content);
      }

      throw new Error(`No structured data found in ${artifactType} artifact`);
    } catch (error) {
      throw new Error(`Failed to parse ${artifactType} artifact: ${error.message}`);
    }
  }

  /**
   * Parse brief markdown into structured data
   */
  parseBriefMarkdown(content) {
    const brief = {
      id: this.extractValue(content, /id:\s*(.+)/i) || 'brief-1',
      version: this.extractValue(content, /version:\s*(.+)/i) || '1.0.0',
      stakeholders: [],
      successCriteria: [],
      scope: { included: [], excluded: [] },
      nonFunctional: {}
    };

    // Extract stakeholders
    const stakeholdersSection = content.match(/## Stakeholders\s*([\s\S]*?)(?=##|$)/i);
    if (stakeholdersSection) {
      const stakeholderMatches = stakeholdersSection[1].match(/\*\*(.+?)\*\*.*?:\s*(.+)/g);
      if (stakeholderMatches) {
        brief.stakeholders = stakeholderMatches.map(match => {
          const [, name, role] = match.match(/\*\*(.+?)\*\*.*?:\s*(.+)/) || [];
          return { name: name || 'Unknown', role: role || 'Unknown', concerns: [] };
        });
      }
    }

    // Extract success criteria
    const successSection = content.match(/## Success Criteria\s*([\s\S]*?)(?=##|$)/i);
    if (successSection) {
      const criteria = successSection[1].match(/[-*]\s*(.+)/g);
      if (criteria) {
        brief.successCriteria = criteria.map(c => c.replace(/^[-*]\s*/, '').trim());
      }
    }

    return brief;
  }

  /**
   * Parse PRD markdown into structured data
   */
  parsePRDMarkdown(content) {
    return {
      id: this.extractValue(content, /id:\s*(.+)/i) || 'prd-1',
      version: this.extractValue(content, /version:\s*(.+)/i) || '1.0.0',
      title: this.extractValue(content, /# (.+)/i) || 'Product Requirements Document',
      description: this.extractValue(content, /## Description\s*([\s\S]*?)(?=##|$)/i) || '',
      features: [],
      requirements: []
    };
  }

  /**
   * Parse architecture markdown into structured data
   */
  parseArchitectureMarkdown(content) {
    return {
      id: this.extractValue(content, /id:\s*(.+)/i) || 'arch-1',
      version: this.extractValue(content, /version:\s*(.+)/i) || '1.0.0',
      title: this.extractValue(content, /# (.+)/i) || 'Architecture Document',
      components: [],
      technologies: [],
      patterns: []
    };
  }

  /**
   * Extract value from content using regex
   */
  extractValue(content, regex) {
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Validate a single artifact against its schema
   */
  async validateArtifact(artifactPath, artifactType) {
    const result = {
      artifact: artifactType,
      path: artifactPath,
      valid: false,
      errors: null
    };

    try {
      // Check if file exists
      await fs.access(artifactPath);
      
      // Parse the artifact
      let data;
      if (artifactPath.endsWith('.json')) {
        data = JSON.parse(await fs.readFile(artifactPath, 'utf-8'));
      } else {
        data = await this.parseMarkdownArtifact(artifactPath, artifactType);
      }

      // Validate against schema
      const validator = this.validators[artifactType];
      if (!validator) {
        throw new Error(`No validator available for ${artifactType}`);
      }

      const valid = validator(data);
      result.valid = valid;
      
      if (!valid) {
        result.errors = validator.errors;
      }

      console.log(`${valid ? '✓' : '✗'} ${artifactType} validation: ${valid ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      result.errors = [{ message: error.message }];
      console.log(`✗ ${artifactType} validation: ERROR - ${error.message}`);
    }

    return result;
  }

  /**
   * Check all planning artifacts
   */
  async checkPlanningGate() {
    console.log('🚪 Checking Planning → Development gate...');
    await this.loadSchemas();

    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    
    // Define artifact paths to check
    const artifacts = [
      { type: 'brief', paths: ['docs/brief.md', 'docs/brief.json'] },
      { type: 'prd', paths: ['docs/prd/PRD.md', 'docs/prd/PRD.json'] },
      { type: 'architecture', paths: ['docs/architecture/architecture.md', 'docs/architecture/architecture.json'] }
    ];

    // Validate each artifact
    for (const { type, paths } of artifacts) {
      let artifactFound = false;
      
      for (const relPath of paths) {
        const fullPath = path.join(projectRoot, relPath);
        try {
          await fs.access(fullPath);
          const result = await this.validateArtifact(fullPath, type);
          this.results.artifacts.push(result);
          artifactFound = true;
          break; // Use first found artifact
        } catch (error) {
          // File doesn't exist, try next path
          continue;
        }
      }

      if (!artifactFound) {
        console.log(`⚠️  ${type} artifact not found at any expected location`);
        this.results.artifacts.push({
          artifact: type,
          path: paths.join(' or '),
          valid: false,
          errors: [{ message: 'Artifact not found' }]
        });
      }
    }

    // Determine overall gate status
    const validArtifacts = this.results.artifacts.filter(a => a.valid);
    const invalidArtifacts = this.results.artifacts.filter(a => !a.valid);

    this.results.passed = invalidArtifacts.length === 0 && validArtifacts.length > 0;

    // Report results
    if (this.results.passed) {
      console.log('\n✅ Planning gate PASSED');
      console.log(`   Validated ${validArtifacts.length} artifacts successfully`);
    } else {
      console.log('\n❌ Planning gate FAILED');
      if (invalidArtifacts.length > 0) {
        console.log(`   ${invalidArtifacts.length} artifacts failed validation:`);
        invalidArtifacts.forEach(artifact => {
          console.log(`   - ${artifact.artifact}: ${artifact.errors?.[0]?.message || 'Unknown error'}`);
        });
      }
    }

    return this.results;
  }

  /**
   * Save gate results to file
   */
  async saveResults(storyId = 'planning') {
    const logsDir = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    const resultsPath = path.join(logsDir, `gates-${storyId}.json`);
    await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));
    
    console.log(`📄 Gate results saved to: ${resultsPath}`);
    return resultsPath;
  }
}

// CLI interface
if (require.main === module) {
  const storyId = process.argv[2] || 'planning';
  
  const gate = new PlanningGate();
  gate.checkPlanningGate()
    .then(async (results) => {
      await gate.saveResults(storyId);
      process.exit(results.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Planning gate error:', error.message);
      process.exit(1);
    });
}

module.exports = PlanningGate;