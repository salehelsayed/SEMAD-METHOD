const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class PatchPlanValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.schema = null;
    this.taskBundle = null;
    this.storyContract = null;
  }

  async initialize() {
    // Load patch plan schema
    const schemaPath = path.join(__dirname, '..', '..', 'bmad-core', 'schemas', 'patch-plan-schema.json');
    this.schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
    this.validator = this.ajv.compile(this.schema);
    
    console.log('[PATCH-PLAN] Validator initialized');
  }

  async loadTaskBundle(bundlePath) {
    try {
      this.taskBundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
      console.log(`[PATCH-PLAN] Loaded task bundle: ${this.taskBundle.id}`);
    } catch (error) {
      throw new Error(`Failed to load task bundle: ${error.message}`);
    }
  }

  async loadStoryContract(contractPath) {
    try {
      const yaml = require('js-yaml');
      const content = await fs.readFile(contractPath, 'utf-8');
      // Extract YAML frontmatter block if present
      const fm = content.match(/^---\n([\s\S]*?)\n---/m);
      const toParse = fm ? fm[1] : content;
      this.storyContract = yaml.load(toParse);
      console.log(`[PATCH-PLAN] Loaded story contract: ${this.storyContract.StoryContract.story_id}`);
    } catch (error) {
      throw new Error(`Failed to load story contract: ${error.message}`);
    }
  }

  async validatePatchPlan(patchPlanPath, options = {}) {
    console.log(`[PATCH-PLAN] Validating patch plan: ${patchPlanPath}`);
    
    const results = {
      schemaValid: false,
      bundleValid: false,
      contractValid: false,
      errors: [],
      warnings: []
    };

    try {
      // Load patch plan
      const patchPlan = JSON.parse(await fs.readFile(patchPlanPath, 'utf-8'));
      
      // 1. Schema validation
      const schemaValid = this.validator(patchPlan);
      results.schemaValid = schemaValid;
      
      if (!schemaValid) {
        results.errors.push({
          type: 'schema',
          message: 'Patch plan does not conform to schema',
          details: this.validator.errors
        });
      }

      // 2. Bundle validation (if bundle provided)
      if (this.taskBundle && options.validateBundle !== false) {
        const bundleValidation = this.validateAgainstBundle(patchPlan);
        results.bundleValid = bundleValidation.valid;
        
        if (!bundleValidation.valid) {
          results.errors.push(...bundleValidation.errors);
        }
        results.warnings.push(...bundleValidation.warnings);
      }

      // 3. Story contract validation (if contract provided)
      if (this.storyContract && options.validateContract !== false) {
        const contractValidation = this.validateAgainstContract(patchPlan);
        results.contractValid = contractValidation.valid;
        
        if (!contractValidation.valid) {
          results.errors.push(...contractValidation.errors);
        }
        results.warnings.push(...contractValidation.warnings);
      }

      // 4. Cross-reference validation
      const crossRefValidation = this.validateCrossReferences(patchPlan);
      if (!crossRefValidation.valid) {
        results.errors.push(...crossRefValidation.errors);
      }

      // Overall validation result
      results.valid = results.schemaValid && 
                     (results.bundleValid || !this.taskBundle) && 
                     (results.contractValid || !this.storyContract) &&
                     crossRefValidation.valid;

      return results;

    } catch (error) {
      results.errors.push({
        type: 'fatal',
        message: `Failed to validate patch plan: ${error.message}`
      });
      return results;
    }
  }

  validateAgainstBundle(patchPlan) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (!this.taskBundle) {
      result.warnings.push({
        type: 'bundle',
        message: 'No task bundle loaded for validation'
      });
      return result;
    }

    // Check if patch plan story ID matches bundle
    if (patchPlan.bundleId && patchPlan.bundleId !== this.taskBundle.id) {
      result.valid = false;
      result.errors.push({
        type: 'bundle',
        message: `Patch plan bundle ID '${patchPlan.bundleId}' does not match loaded bundle '${this.taskBundle.id}'`
      });
    }

    // Validate file references against bundle
    const bundleFiles = new Set(this.taskBundle.files ? this.taskBundle.files.map(f => f.path) : []);
    
    for (const change of patchPlan.changes) {
      if (!bundleFiles.has(change.path)) {
        result.warnings.push({
          type: 'bundle',
          message: `File '${change.path}' is not in the task bundle but will be modified`
        });
      }
    }

    return result;
  }

  validateAgainstContract(patchPlan) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (!this.storyContract) {
      result.warnings.push({
        type: 'contract',
        message: 'No story contract loaded for validation'
      });
      return result;
    }

    const contract = this.storyContract.StoryContract;
    
    // Check story ID match
    if (patchPlan.storyId !== contract.story_id) {
      result.valid = false;
      result.errors.push({
        type: 'contract',
        message: `Patch plan story ID '${patchPlan.storyId}' does not match contract '${contract.story_id}'`
      });
    }

    // Validate acceptance criteria references
    const contractACs = new Set(contract.acceptanceCriteriaLinks || []);
    
    for (const change of patchPlan.changes) {
      for (const ac of change.mappedACs) {
        if (!contractACs.has(ac)) {
          result.warnings.push({
            type: 'contract',
            message: `Acceptance criteria '${ac}' referenced in change but not found in story contract`
          });
        }
      }
    }

    // Check if all contract ACs are addressed
    const patchACs = new Set();
    patchPlan.changes.forEach(change => {
      change.mappedACs.forEach(ac => patchACs.add(ac));
    });

    for (const contractAC of contractACs) {
      if (!patchACs.has(contractAC)) {
        result.warnings.push({
          type: 'coverage',
          message: `Acceptance criteria '${contractAC}' from contract is not addressed in patch plan`
        });
      }
    }

    return result;
  }

  validateCrossReferences(patchPlan) {
    const result = { valid: true, errors: [] };
    
    // Check that tests cover changes
    const changePaths = new Set(patchPlan.changes.map(c => c.path));
    const testedPaths = new Set();
    
    patchPlan.tests.forEach(test => {
      if (test.coveredChanges) {
        test.coveredChanges.forEach(path => testedPaths.add(path));
      }
    });

    const untestedChanges = [...changePaths].filter(path => !testedPaths.has(path));
    if (untestedChanges.length > 0) {
      result.errors.push({
        type: 'coverage',
        message: `Changes in files [${untestedChanges.join(', ')}] are not covered by tests`
      });
      result.valid = false;
    }

    // Validate risk level matches change complexity
    const highRiskOperations = patchPlan.changes.filter(change => 
      change.operations.some(op => op.type === 'delete') ||
      change.symbols.length > 5 ||
      change.impact?.breakingChange
    );

    if (highRiskOperations.length > 0 && patchPlan.riskLevel === 'low') {
      result.errors.push({
        type: 'risk',
        message: 'Risk level is marked as low but changes include high-risk operations'
      });
      result.valid = false;
    }

    return result;
  }

  generateReport(validationResults, outputPath) {
    const report = {
      timestamp: new Date().toISOString(),
      valid: validationResults.valid,
      summary: {
        schemaValid: validationResults.schemaValid,
        bundleValid: validationResults.bundleValid,
        contractValid: validationResults.contractValid,
        errorCount: validationResults.errors.length,
        warningCount: validationResults.warnings.length
      },
      errors: validationResults.errors,
      warnings: validationResults.warnings
    };

    return fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  }
}

module.exports = { PatchPlanValidator };

// CLI usage
if (require.main === module) {
  async function main() {
    const patchPlanPath = process.argv[2];
    const bundlePath = process.argv[3];
    const contractPath = process.argv[4];

    if (!patchPlanPath) {
      console.error('Usage: node validate-patch-plan.js <patch-plan.json> [bundle.json] [contract.yaml]');
      process.exit(1);
    }

    const validator = new PatchPlanValidator();
    await validator.initialize();

    if (bundlePath) {
      await validator.loadTaskBundle(bundlePath);
    }

    if (contractPath) {
      await validator.loadStoryContract(contractPath);
    }

    const results = await validator.validatePatchPlan(patchPlanPath);

    // Output results
    if (results.valid) {
      console.log('[PATCH-PLAN] ✓ Patch plan is valid');
    } else {
      console.error('[PATCH-PLAN] ✗ Patch plan validation failed');
      results.errors.forEach(error => {
        console.error(`  [${error.type.toUpperCase()}] ${error.message}`);
      });
    }

    if (results.warnings.length > 0) {
      console.warn('[PATCH-PLAN] Warnings:');
      results.warnings.forEach(warning => {
        console.warn(`  [${warning.type.toUpperCase()}] ${warning.message}`);
      });
    }

    // Generate report
    const reportPath = path.join(process.cwd(), '.ai', 'patch-plan-validation.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await validator.generateReport(results, reportPath);
    console.log(`[PATCH-PLAN] Report saved to ${reportPath}`);

    process.exit(results.valid ? 0 : 1);
  }

  main().catch(error => {
    console.error('[PATCH-PLAN] Fatal error:', error.message);
    process.exit(1);
  });
}
