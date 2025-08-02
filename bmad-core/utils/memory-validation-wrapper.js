/**
 * Memory Validation Wrapper
 * 
 * This module provides wrapper functions for memory operation validation
 * that can be used by structured tasks and workflow orchestrators.
 * It bridges the gap between the class-based MemoryOperationValidator
 * and the function-based structured task execution system.
 */

const fs = require('fs');
const path = require('path');
const MemoryOperationValidator = require('./memory-operation-validator');
const MemoryAuditCLI = require('./memory-audit-cli');
const { logTaskMemory } = require('./memory-usage-logger');

/**
 * Execute memory validation for a specific story
 * @param {Object} params - Validation parameters
 * @param {string} params.storyId - Story identifier to validate
 * @param {string} params.validationType - Type of validation (comprehensive, dev-only, qa-only)
 * @param {boolean} params.verbose - Whether to include verbose output
 * @returns {Object} Validation results
 */
async function executeMemoryValidation(params) {
  const { storyId, validationType = 'comprehensive', verbose = false } = params;
  
  if (!storyId) {
    throw new Error('storyId is required for memory validation');
  }

  const validator = new MemoryOperationValidator({
    verbose,
    reportFormat: 'json'
  });

  try {
    // Find the story file
    const storyPath = findStoryPath(storyId);
    
    if (!storyPath) {
      throw new Error(`Story file not found for ID: ${storyId}`);
    }

    // Execute validation based on type
    let validationResult;
    
    if (validationType === 'comprehensive') {
      validationResult = await validator.validateStory(storyId, storyPath);
    } else if (validationType === 'dev-only') {
      validationResult = await validator.validateStory(storyId, storyPath);
      // Filter to only dev-related errors
      validationResult.errors = validationResult.errors.filter(e => 
        e.type.includes('DEV') || e.type.includes('TASK')
      );
    } else if (validationType === 'qa-only') {
      validationResult = await validator.validateStory(storyId, storyPath);
      // Filter to only QA-related errors
      validationResult.errors = validationResult.errors.filter(e => 
        e.type.includes('QA') || e.type.includes('REVIEW')
      );
    } else {
      throw new Error(`Unsupported validation type: ${validationType}`);
    }

    return {
      success: true,
      validationResult,
      storyId,
      validationType,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      storyId,
      validationType,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Analyze validation results and categorize issues
 * @param {Object} params - Analysis parameters
 * @param {Object} params.validationResults - Results from executeMemoryValidation
 * @param {string} params.storyId - Story identifier
 * @returns {Object} Analysis results
 */
function analyzeValidationResults(params) {
  const { validationResults, storyId } = params;
  
  if (!validationResults || !validationResults.validationResult) {
    return {
      success: false,
      error: 'Invalid validation results provided',
      storyId
    };
  }

  const result = validationResults.validationResult;
  
  const analysis = {
    storyId,
    passed: result.passed,
    totalErrors: result.errors.length,
    totalWarnings: result.warnings.length,
    criticalErrors: result.errors.filter(e => e.severity === 'critical').length,
    highErrors: result.errors.filter(e => e.severity === 'high').length,
    mediumWarnings: result.warnings.filter(w => w.severity === 'medium').length,
    lowWarnings: result.warnings.filter(w => w.severity === 'low').length,
    devMemoryOperations: result.devMemoryOperations.length,
    qaMemoryOperations: result.qaMemoryOperations.length,
    errorsByType: {},
    warningsByType: {},
    riskLevel: 'low',
    needsRemediation: false,
    blocksDeployment: false
  };

  // Categorize errors by type
  result.errors.forEach(error => {
    if (!analysis.errorsByType[error.type]) {
      analysis.errorsByType[error.type] = 0;
    }
    analysis.errorsByType[error.type]++;
  });

  // Categorize warnings by type
  result.warnings.forEach(warning => {
    if (!analysis.warningsByType[warning.type]) {
      analysis.warningsByType[warning.type] = 0;
    }
    analysis.warningsByType[warning.type]++;
  });

  // Determine risk level and remediation needs
  if (analysis.criticalErrors > 0) {
    analysis.riskLevel = 'critical';
    analysis.needsRemediation = true;
    analysis.blocksDeployment = true;
  } else if (analysis.highErrors > 0) {
    analysis.riskLevel = 'high';
    analysis.needsRemediation = true;
    analysis.blocksDeployment = true;
  } else if (analysis.totalErrors > 0) {
    analysis.riskLevel = 'medium';
    analysis.needsRemediation = true;
  } else if (analysis.mediumWarnings > 2) {
    analysis.riskLevel = 'medium';
    analysis.needsRemediation = true;
  }

  return {
    success: true,
    analysis,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate validation report with findings
 * @param {Object} params - Report parameters
 * @param {Object} params.analysisResults - Results from analyzeValidationResults
 * @param {string} params.storyId - Story identifier
 * @param {boolean} params.includeRemediation - Whether to include remediation suggestions
 * @returns {Object} Generated report
 */
function generateValidationReport(params) {
  const { analysisResults, storyId, includeRemediation = true } = params;
  
  if (!analysisResults || !analysisResults.analysis) {
    return {
      success: false,
      error: 'Invalid analysis results provided',
      storyId
    };
  }

  const analysis = analysisResults.analysis;
  
  let report = `# Memory Operation Validation Report\n\n`;
  report += `**Story ID:** ${storyId}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Status:** ${analysis.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
  report += `**Risk Level:** ${analysis.riskLevel.toUpperCase()}\n\n`;

  // Summary section
  report += `## Summary\n\n`;
  report += `- **Total Errors:** ${analysis.totalErrors}\n`;
  report += `- **Total Warnings:** ${analysis.totalWarnings}\n`;
  report += `- **Critical Errors:** ${analysis.criticalErrors}\n`;
  report += `- **High Priority Errors:** ${analysis.highErrors}\n`;
  report += `- **Dev Memory Operations:** ${analysis.devMemoryOperations}\n`;
  report += `- **QA Memory Operations:** ${analysis.qaMemoryOperations}\n`;
  report += `- **Blocks Deployment:** ${analysis.blocksDeployment ? 'Yes' : 'No'}\n\n`;

  // Error details
  if (analysis.totalErrors > 0) {
    report += `## Issues Found\n\n`;
    
    Object.entries(analysis.errorsByType).forEach(([errorType, count]) => {
      const formattedType = errorType.replace(/_/g, ' ').toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());
      report += `- **${formattedType}:** ${count} occurrence${count > 1 ? 's' : ''}\n`;
    });
    report += `\n`;
  }

  // Warning details
  if (analysis.totalWarnings > 0) {
    report += `## Warnings\n\n`;
    
    Object.entries(analysis.warningsByType).forEach(([warningType, count]) => {
      const formattedType = warningType.replace(/_/g, ' ').toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());
      report += `- **${formattedType}:** ${count} occurrence${count > 1 ? 's' : ''}\n`;
    });
    report += `\n`;
  }

  // Remediation recommendations
  if (includeRemediation && analysis.needsRemediation) {
    report += `## Recommended Actions\n\n`;
    
    if (analysis.criticalErrors > 0) {
      report += `🚨 **IMMEDIATE ACTION REQUIRED**\n\n`;
      report += `This story has critical memory operation issues that must be resolved before deployment.\n\n`;
    }
    
    if (Object.keys(analysis.errorsByType).includes('MISSING_DEV_MEMORY_OPERATIONS')) {
      report += `- Execute missing dev-save-memory operations for completed tasks\n`;
    }
    
    if (Object.keys(analysis.errorsByType).includes('MISSING_QA_MEMORY_OPERATIONS')) {
      report += `- Execute missing qa-save-memory operations for QA reviews\n`;
    }
    
    if (Object.keys(analysis.errorsByType).includes('INVALID_DEV_MEMORY_PARAMETERS')) {
      report += `- Fix invalid parameters in dev-save-memory operations\n`;
    }
    
    if (Object.keys(analysis.errorsByType).includes('INVALID_QA_MEMORY_PARAMETERS')) {
      report += `- Fix invalid parameters in qa-save-memory operations\n`;
    }
    
    if (Object.keys(analysis.errorsByType).includes('MISSING_QA_FINAL_MEMORY_OPERATION')) {
      report += `- Execute final QA memory operation for completed story\n`;
    }
    
    report += `\nFor detailed remediation steps, run:\n`;
    report += `\`\`\`bash\n`;
    report += `node bmad-core/utils/memory-audit-cli.js remediate ${storyId}\n`;
    report += `\`\`\`\n\n`;
  }

  return {
    success: true,
    report,
    summary: {
      passed: analysis.passed,
      totalIssues: analysis.totalErrors + analysis.totalWarnings,
      riskLevel: analysis.riskLevel,
      blocksDeployment: analysis.blocksDeployment
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Check validation status and return simple pass/fail result
 * @param {Object} params - Status check parameters
 * @param {Object} params.validationResults - Results from executeMemoryValidation
 * @returns {Object} Status check result
 */
function checkValidationStatus(params) {
  const { validationResults } = params;
  
  if (!validationResults || !validationResults.validationResult) {
    return {
      success: false,
      passed: false,
      error: 'Invalid validation results provided'
    };
  }

  const result = validationResults.validationResult;
  
  return {
    success: true,
    passed: result.passed,
    hasErrors: result.errors.length > 0,
    hasWarnings: result.warnings.length > 0,
    criticalErrors: result.errors.filter(e => e.severity === 'critical').length,
    highErrors: result.errors.filter(e => e.severity === 'high').length,
    totalIssues: result.errors.length + result.warnings.length
  };
}

/**
 * Generate remediation plan for validation failures
 * @param {Object} params - Remediation parameters
 * @param {Object} params.validationResults - Results from executeMemoryValidation
 * @param {string} params.storyId - Story identifier
 * @returns {Object} Remediation plan
 */
function generateRemediationPlan(params) {
  const { validationResults, storyId } = params;
  
  if (!validationResults || !validationResults.validationResult) {
    return {
      success: false,
      error: 'Invalid validation results provided',
      storyId
    };
  }

  const result = validationResults.validationResult;
  const cli = new MemoryAuditCLI();
  
  // Use the CLI's remediation plan generation
  const mockResults = {
    stories: [result],
    failedStories: result.passed ? 0 : 1
  };
  
  const remediationPlan = cli.generateRemediationPlan(mockResults);
  
  return {
    success: true,
    remediationPlan,
    storyId,
    totalIssues: result.errors.length,
    canAutoRemediate: result.errors.some(e => 
      e.type === 'INVALID_DEV_MEMORY_PARAMETERS' || 
      e.type === 'INVALID_QA_MEMORY_PARAMETERS'
    ),
    timestamp: new Date().toISOString()
  };
}

/**
 * Execute selected remediation option
 * @param {Object} params - Execution parameters
 * @param {string} params.selectedOption - Selected remediation option (1-4)
 * @param {Object} params.validationResults - Results from executeMemoryValidation
 * @param {string} params.storyId - Story identifier
 * @returns {Object} Execution result
 */
async function executeRemediationOption(params) {
  const { selectedOption, validationResults, storyId } = params;
  
  if (!validationResults || !validationResults.validationResult) {
    return {
      success: false,
      error: 'Invalid validation results provided',
      storyId
    };
  }

  const cli = new MemoryAuditCLI();
  
  try {
    switch (selectedOption) {
      case '1':
        // View detailed remediation plan
        const plan = await generateRemediationPlan(params);
        return {
          success: true,
          action: 'view_plan',
          result: plan.remediationPlan,
          storyId
        };
        
      case '2':
        // Attempt automated remediation
        return {
          success: false,
          action: 'auto_remediate',
          error: 'Automated remediation not yet implemented',
          storyId,
          message: 'Automated remediation is planned for future release. Please use manual remediation.'
        };
        
      case '3':
        // Generate manual remediation instructions
        const manualPlan = await generateRemediationPlan(params);
        return {
          success: true,
          action: 'manual_instructions',
          result: manualPlan.remediationPlan,
          storyId,
          message: 'Manual remediation instructions generated'
        };
        
      case '4':
        // Skip remediation
        return {
          success: true,
          action: 'skip',
          result: 'Remediation skipped by user',
          storyId
        };
        
      default:
        return {
          success: false,
          error: `Invalid option selected: ${selectedOption}`,
          storyId
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `Remediation execution failed: ${error.message}`,
      storyId
    };
  }
}

/**
 * Helper function to find story file path
 * @param {string} storyId - Story identifier
 * @returns {string|null} Story file path or null if not found
 */
function findStoryPath(storyId) {
  const possiblePaths = [
    path.join(process.cwd(), 'docs', 'stories', `${storyId}.md`),
    path.join(process.cwd(), 'stories', `${storyId}.md`),
    path.join(process.cwd(), `${storyId}.md`)
  ];
  
  for (const storyPath of possiblePaths) {
    if (fs.existsSync(storyPath)) {
      return storyPath;
    }
  }
  
  return null;
}

module.exports = {
  executeMemoryValidation,
  analyzeValidationResults,
  generateValidationReport,
  checkValidationStatus,
  generateRemediationPlan,
  executeRemediationOption,
  findStoryPath,
  logTaskMemory
};