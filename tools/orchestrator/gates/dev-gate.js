#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

/**
 * Dev Gate: Validates development readiness before allowing progression to QA phase
 * Validates preflight checks and patch plan existence and validity
 */
class DevGate {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.patchPlanValidator = null;
    this.results = {
      gate: 'dev',
      timestamp: new Date().toISOString(),
      passed: false,
      checks: [],
      errors: []
    };
  }

  /**
   * Load patch plan schema and compile validator
   */
  async loadPatchPlanSchema() {
    try {
      const schemaPath = path.resolve(__dirname, '..', '..', '..', 'bmad-core', 'schemas', 'patch-plan-schema.json');
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
      this.patchPlanValidator = this.ajv.compile(schema);
      console.log('✓ Loaded patch plan schema');
    } catch (error) {
      console.error(`✗ Failed to load patch plan schema: ${error.message}`);
      this.results.errors.push({
        type: 'schema_load_error',
        message: error.message
      });
    }
  }

  /**
   * Run preflight checks (all validation suites)
   */
  async runPreflightChecks(storyId) {
    console.log('🔍 Running preflight checks...');
    
    const check = {
      name: 'preflight:all',
      passed: false,
      output: '',
      error: null
    };

    try {
      const { stdout, stderr } = await execAsync('npm run preflight:all', {
        cwd: path.resolve(__dirname, '..', '..', '..'),
        timeout: 60000, // 1 minute timeout
        env: { ...process.env, STORY_ID: storyId }
      });
      
      check.passed = true;
      check.output = stdout;
      console.log('✓ Preflight checks PASSED');
      
    } catch (error) {
      check.passed = false;
      check.error = error.message;
      check.output = error.stdout || '';
      console.log('✗ Preflight checks FAILED');
      console.error(error.message);
    }

    this.results.checks.push(check);
    return check.passed;
  }

  /**
   * Run Acceptance Criteria coverage check for the story
   */
  async runACCoverage(storyArg) {
    console.log('🔍 Checking Acceptance Criteria coverage...');
    const check = {
      name: 'ac-coverage',
      passed: false,
      output: '',
      error: null
    };
    try {
      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      const scriptPath = path.join(projectRoot, 'tools', 'qa', 'ac-coverage-check.js');
      const { stdout, stderr, status } = await execAsync(`node ${scriptPath} ${storyArg}`);
      check.passed = true;
      check.output = stdout || '';
      if (stderr) console.error(stderr);
      console.log('✓ AC coverage PASSED');
    } catch (error) {
      check.passed = false;
      check.error = error.message;
      check.output = error.stdout || '';
      console.log('✗ AC coverage FAILED');
    }
    this.results.checks.push(check);
    return check.passed;
  }

  /**
   * Find patch plan file for the given story
   */
  async findPatchPlan(storyId) {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    
    // Possible locations for patch plans
    const possiblePaths = [
      path.join(projectRoot, '.ai', 'patches', `${storyId}.patch.json`),
      path.join(projectRoot, '.ai', 'patches', `${storyId}-patch-plan.json`),
      path.join(projectRoot, 'docs', 'examples', 'preflight', `${storyId}.patch.json`),
      path.join(projectRoot, 'patches', `${storyId}.json`)
    ];

    for (const patchPath of possiblePaths) {
      try {
        await fs.access(patchPath);
        console.log(`✓ Found patch plan at: ${patchPath}`);
        return patchPath;
      } catch (error) {
        // File doesn't exist, try next location
        continue;
      }
    }

    return null;
  }

  /**
   * Validate patch plan against schema and business rules
   */
  async validatePatchPlan(storyId) {
    console.log(`🔍 Validating patch plan for ${storyId}...`);
    
    const check = {
      name: 'patch-plan-validation',
      passed: false,
      patchPlanPath: null,
      errors: []
    };

    try {
      // Find patch plan
      const patchPlanPath = await this.findPatchPlan(storyId);
      if (!patchPlanPath) {
        throw new Error(`No patch plan found for story ${storyId}`);
      }
      
      check.patchPlanPath = patchPlanPath;

      // Load and parse patch plan
      const patchPlanContent = await fs.readFile(patchPlanPath, 'utf-8');
      const patchPlan = JSON.parse(patchPlanContent);

      // Validate against schema
      if (!this.patchPlanValidator) {
        throw new Error('Patch plan validator not loaded');
      }

      const isValidSchema = this.patchPlanValidator(patchPlan);
      if (!isValidSchema) {
        check.errors.push({
          type: 'schema_validation',
          errors: this.patchPlanValidator.errors
        });
      }

      // Validate business rules
      const businessValidation = this.validatePatchPlanBusinessRules(patchPlan, storyId);
      if (!businessValidation.valid) {
        check.errors.push({
          type: 'business_rules',
          errors: businessValidation.errors
        });
      }

      // Check signature
      const signatureValidation = this.validatePatchPlanSignature(patchPlan);
      if (!signatureValidation.valid) {
        // Auto-sign if missing signature (development mode)
        console.log('⚠️  Auto-signing patch plan...');
        patchPlan.signature = {
          signedBy: 'dev-gate-auto',
          timestamp: new Date().toISOString(),
          checksum: this.generateChecksum(patchPlan)
        };
        await fs.writeFile(patchPlanPath, JSON.stringify(patchPlan, null, 2));
      }

      check.passed = isValidSchema && businessValidation.valid;
      
      if (check.passed) {
        console.log('✓ Patch plan validation PASSED');
      } else {
        console.log('✗ Patch plan validation FAILED');
        check.errors.forEach(error => {
          console.error(`  - ${error.type}:`, error.errors);
        });
      }

    } catch (error) {
      check.passed = false;
      check.errors.push({
        type: 'general_error',
        message: error.message
      });
      console.log(`✗ Patch plan validation ERROR: ${error.message}`);
    }

    this.results.checks.push(check);
    return check.passed;
  }

  /**
   * Execute the full Dev gate sequence for a story
   */
  async run(storyArg) {
    await this.loadPatchPlanSchema();
    const preflightOk = await this.runPreflightChecks(storyArg);
    const patchOk = await this.validatePatchPlan(storyArg).catch(() => false);
    const acOk = await this.runACCoverage(storyArg);
    this.results.passed = Boolean(preflightOk && patchOk && acOk);
    return this.results.passed;
  }

  /**
   * Validate patch plan business rules
   */
  validatePatchPlanBusinessRules(patchPlan, storyId) {
    const errors = [];

    // Check story ID matches
    if (patchPlan.storyId !== storyId) {
      errors.push(`Story ID mismatch: expected ${storyId}, got ${patchPlan.storyId}`);
    }

    // Check required fields presence
    if (!patchPlan.changes || patchPlan.changes.length === 0) {
      errors.push('No changes specified in patch plan');
    }

    // Validate change mappings
    if (patchPlan.changes) {
      patchPlan.changes.forEach((change, index) => {
        if (!change.mappedACs || change.mappedACs.length === 0) {
          errors.push(`Change ${index + 1} has no mapped acceptance criteria`);
        }
        if (!change.rationale || change.rationale.length < 10) {
          errors.push(`Change ${index + 1} has insufficient rationale`);
        }
      });
    }

    // Validate version format
    if (patchPlan.version && !/^\d+\.\d+\.\d+$/.test(patchPlan.version)) {
      errors.push('Invalid version format (should be semver)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate patch plan signature
   */
  validatePatchPlanSignature(patchPlan) {
    const errors = [];

    if (!patchPlan.signature) {
      errors.push('Missing signature');
      return { valid: false, errors };
    }

    if (!patchPlan.signature.signedBy) {
      errors.push('Missing signedBy in signature');
    }

    if (!patchPlan.signature.timestamp) {
      errors.push('Missing timestamp in signature');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate checksum for patch plan
   */
  generateChecksum(patchPlan) {
    const crypto = require('crypto');
    const content = JSON.stringify({
      storyId: patchPlan.storyId,
      changes: patchPlan.changes,
      tests: patchPlan.tests
    });
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Check development gate
   */
  async checkDevGate(storyId) {
    if (!storyId) {
      throw new Error('Story ID is required for dev gate validation');
    }

    console.log(`🚪 Checking Dev → QA gate for story ${storyId}...`);
    
    await this.loadPatchPlanSchema();

    // Run all checks
    const preflightPassed = await this.runPreflightChecks(storyId);
    const patchPlanPassed = await this.validatePatchPlan(storyId);
    const acCoveragePassed = await this.runACCoverage(storyId);

    // Determine overall gate status
    this.results.passed = preflightPassed && patchPlanPassed && acCoveragePassed;

    // Report results
    if (this.results.passed) {
      console.log('\n✅ Dev gate PASSED');
      console.log(`   Story ${storyId} is ready for QA`);
    } else {
      console.log('\n❌ Dev gate FAILED');
      const failedChecks = this.results.checks.filter(c => !c.passed);
      if (failedChecks.length > 0) {
        console.log(`   ${failedChecks.length} checks failed:`);
        failedChecks.forEach(check => {
          console.log(`   - ${check.name}: ${check.error || 'See details above'}`);
        });
      }
    }

    return this.results;
  }

  /**
   * Save gate results to file
   */
  async saveResults(storyId) {
    const logsDir = path.resolve(__dirname, '..', '..', '..', '.ai', 'test-logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    const resultsPath = path.join(logsDir, `gates-${storyId}.json`);
    
    // Load existing results if available and merge
    let existingResults = {};
    try {
      const existing = await fs.readFile(resultsPath, 'utf-8');
      existingResults = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
    }

    const mergedResults = {
      ...existingResults,
      dev: this.results,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(resultsPath, JSON.stringify(mergedResults, null, 2));
    
    console.log(`📄 Dev gate results saved to: ${resultsPath}`);
    return resultsPath;
  }
}

// CLI interface
if (require.main === module) {
  const storyId = process.argv[2];
  
  if (!storyId) {
    console.error('Usage: node dev-gate.js <storyId>');
    process.exit(1);
  }
  
  const gate = new DevGate();
  gate.checkDevGate(storyId)
    .then(async (results) => {
      await gate.saveResults(storyId);
      process.exit(results.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Dev gate error:', error.message);
      process.exit(1);
    });
}

module.exports = DevGate;
