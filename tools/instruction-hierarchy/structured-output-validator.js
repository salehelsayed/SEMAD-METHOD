const fs = require('fs').promises;
const path = require('path');
const { InstructionHierarchyManager } = require('./instruction-hierarchy-manager');

class StructuredOutputValidator {
  constructor() {
    this.hierarchyManager = new InstructionHierarchyManager();
    this.validationResults = [];
  }
  
  async validateAgentOutput(agentName, outputType, outputData, context = {}) {
    console.log(`[VALIDATOR] Validating ${outputType} output from ${agentName}`);
    
    const validation = await this.hierarchyManager.validateOutput(outputType, outputData);
    const instructions = await this.hierarchyManager.resolveInstructions({
      agent: agentName,
      ...context
    });
    
    const result = {
      agent: agentName,
      outputType,
      timestamp: new Date().toISOString(),
      schemaValidation: validation,
      instructionCompliance: this.checkInstructionCompliance(outputData, instructions),
      overallStatus: validation.valid ? 'passed' : 'failed'
    };
    
    this.validationResults.push(result);
    
    if (!validation.valid) {
      console.error(`[VALIDATOR] ✗ Validation failed for ${agentName} ${outputType}`);
      validation.errors.forEach(error => console.error(`  - ${error}`));
    } else {
      console.log(`[VALIDATOR] ✓ Validation passed for ${agentName} ${outputType}`);
    }
    
    return result;
  }
  
  checkInstructionCompliance(outputData, instructions) {
    const compliance = {
      score: 0,
      checkedInstructions: [],
      violations: [],
      hierarchy_violations: []
    };
    
    // Check instruction hierarchy compliance
    const hierarchyCheck = this.validateInstructionHierarchy(outputData);
    if (!hierarchyCheck.valid) {
      compliance.hierarchy_violations = hierarchyCheck.violations;
    }
    
    // Check for SEMAD methodology compliance
    const semadInstructions = instructions.filter(inst => 
      inst.toLowerCase().includes('semad') || 
      inst.toLowerCase().includes('context') ||
      inst.toLowerCase().includes('structured') ||
      inst.toLowerCase().includes('no-invention') ||
      inst.toLowerCase().includes('hierarchy')
    );
    
    for (const instruction of semadInstructions) {
      const check = this.evaluateInstruction(instruction, outputData);
      compliance.checkedInstructions.push(check);
      
      if (check.compliant) {
        compliance.score += 1;
      } else {
        compliance.violations.push(check.violation);
      }
    }
    
    compliance.score = semadInstructions.length > 0 ? 
      compliance.score / semadInstructions.length : 1;
    
    return compliance;
  }
  
  evaluateInstruction(instruction, outputData) {
    const lowerInst = instruction.toLowerCase();
    
    if (lowerInst.includes('context')) {
      const hasContext = outputData.context || outputData.background || 
                        outputData.description?.length > 50;
      return {
        instruction,
        compliant: !!hasContext,
        violation: hasContext ? null : 'Missing context information'
      };
    }
    
    if (lowerInst.includes('structured')) {
      const isStructured = typeof outputData === 'object' && 
                          Object.keys(outputData).length > 2;
      return {
        instruction,
        compliant: isStructured,
        violation: isStructured ? null : 'Output is not properly structured'
      };
    }
    
    if (lowerInst.includes('semad')) {
      const followsSemad = outputData.id || outputData.title || outputData.description;
      return {
        instruction,
        compliant: !!followsSemad,
        violation: followsSemad ? null : 'Does not follow SEMAD conventions'
      };
    }
    
    return {
      instruction,
      compliant: true,
      violation: null
    };
  }
  
  validateInstructionHierarchy(outputData) {
    const violations = [];
    
    // Check if decisions reference instruction levels
    if (outputData.decisions && Array.isArray(outputData.decisions)) {
      for (const decision of outputData.decisions) {
        if (decision.instruction_level) {
          const validLevels = ['system', 'gate_rule', 'story_contract', 'prd_architecture', 'template'];
          if (!validLevels.includes(decision.instruction_level)) {
            violations.push(`Invalid instruction level: ${decision.instruction_level}`);
          }
        }
      }
    }
    
    // Check for no-invention rule compliance
    if (outputData.assumptions && Array.isArray(outputData.assumptions)) {
      const unvalidatedAssumptions = outputData.assumptions.filter(
        assumption => assumption.validation_needed === true && !assumption.validation_method
      );
      if (unvalidatedAssumptions.length > 0) {
        violations.push('No-invention rule violation: Assumptions require validation methods');
      }
    }
    
    // Check for proper escalation documentation
    if (outputData.decisions && Array.isArray(outputData.decisions)) {
      const conflictingDecisions = outputData.decisions.filter(
        decision => decision.alternatives && decision.alternatives.length > 2
      );
      for (const decision of conflictingDecisions) {
        if (!decision.rationale || decision.rationale.length < 20) {
          violations.push('Instruction conflict not properly documented in decision rationale');
        }
      }
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
  
  async generateValidationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalValidations: this.validationResults.length,
      passed: this.validationResults.filter(r => r.overallStatus === 'passed').length,
      failed: this.validationResults.filter(r => r.overallStatus === 'failed').length,
      averageCompliance: this.calculateAverageCompliance(),
      results: this.validationResults,
      summary: this.generateSummary()
    };
    
    const reportPath = path.join(process.cwd(), '.ai', 'validation-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`[VALIDATOR] Validation report saved to ${reportPath}`);
    return report;
  }
  
  calculateAverageCompliance() {
    if (this.validationResults.length === 0) return 0;
    
    const totalCompliance = this.validationResults.reduce((sum, result) => {
      return sum + (result.instructionCompliance?.score || 0);
    }, 0);
    
    return totalCompliance / this.validationResults.length;
  }
  
  generateSummary() {
    const summary = {
      topViolations: {},
      agentPerformance: {},
      outputTypeIssues: {}
    };
    
    for (const result of this.validationResults) {
      // Track violations
      if (result.instructionCompliance?.violations) {
        for (const violation of result.instructionCompliance.violations) {
          summary.topViolations[violation] = (summary.topViolations[violation] || 0) + 1;
        }
      }
      
      // Track agent performance
      if (!summary.agentPerformance[result.agent]) {
        summary.agentPerformance[result.agent] = { passed: 0, failed: 0 };
      }
      summary.agentPerformance[result.agent][result.overallStatus]++;
      
      // Track output type issues
      if (result.overallStatus === 'failed') {
        summary.outputTypeIssues[result.outputType] = 
          (summary.outputTypeIssues[result.outputType] || 0) + 1;
      }
    }
    
    return summary;
  }
}

module.exports = { StructuredOutputValidator };

if (require.main === module) {
  const validator = new StructuredOutputValidator();
  const command = process.argv[2];
  
  if (command === 'test') {
    // Test validation with sample structured output
    const sampleStructuredOutput = {
      type: 'story',
      storyId: 'AH-015',
      inputs: {
        sources: [
          {
            type: 'prd',
            identifier: 'project-brief.md',
            version: '2024-01-15T10:00:00Z',
            relevance: 'primary'
          }
        ],
        context: {
          agent: 'test-agent',
          workflow_phase: 'development',
          dependencies: ['AH-014'],
          constraints: ['Must maintain backward compatibility']
        }
      },
      outputs: {
        primary: {
          title: 'Test structured output',
          description: 'Testing structured output validation',
          content: 'Sample content for testing',
          format: 'markdown'
        },
        artifacts: [],
        validation_status: {
          schema_valid: true,
          instruction_compliant: true,
          quality_checks: []
        }
      },
      decisions: [
        {
          decision: 'Use structured output format',
          rationale: 'Ensures consistency across all agent outputs',
          alternatives: ['Free-form output', 'YAML format'],
          impact: 'medium',
          reversible: true,
          instruction_level: 'template'
        }
      ],
      assumptions: [
        {
          assumption: 'All agents will adopt this format',
          basis: 'Framework requirements',
          risk_if_wrong: 'Inconsistent outputs',
          validation_needed: true,
          validation_method: 'Agent compliance testing'
        }
      ],
      risks: [
        {
          risk: 'Performance impact from validation',
          category: 'technical',
          probability: 'low',
          impact: 'low',
          mitigation: 'Optimize validation logic',
          contingency: 'Make validation optional',
          owner: 'framework-team'
        }
      ],
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    
    validator.validateAgentOutput('test-agent', 'structured_output', sampleStructuredOutput).then(result => {
      console.log('Test validation result:', result.overallStatus);
      return validator.generateValidationReport();
    }).then(report => {
      console.log(`Generated report with ${report.totalValidations} validations`);
    });
  }
}