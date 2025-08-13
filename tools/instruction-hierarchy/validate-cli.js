#!/usr/bin/env node

const { program } = require('commander');
const { StructuredOutputValidator } = require('./structured-output-validator');
const { InstructionHierarchyManager } = require('./instruction-hierarchy-manager');
const fs = require('fs').promises;
const path = require('path');

program
  .name('validate-cli')
  .description('CLI tool for instruction hierarchy and structured output validation')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize instruction hierarchy configuration')
  .action(async () => {
    const manager = new InstructionHierarchyManager();
    await manager.initializeHierarchy();
    console.log('✓ Instruction hierarchy initialized');
  });

program
  .command('validate-file')
  .description('Validate a structured output file')
  .argument('<file>', 'JSON file containing structured output')
  .option('-t, --type <type>', 'Output type to validate against', 'structured_output')
  .option('-a, --agent <agent>', 'Agent name for validation context', 'unknown')
  .action(async (file, options) => {
    try {
      const validator = new StructuredOutputValidator();
      const content = await fs.readFile(file, 'utf-8');
      const data = JSON.parse(content);
      
      const result = await validator.validateAgentOutput(options.agent, options.type, data);
      
      if (result.overallStatus === 'passed') {
        console.log('✓ Validation passed');
      } else {
        console.log('✗ Validation failed');
        if (result.schemaValidation && result.schemaValidation.errors) {
          result.schemaValidation.errors.forEach(error => console.log(`  - ${error}`));
        }
      }
      
      const report = await validator.generateValidationReport();
      console.log(`Report saved to: ${path.join(process.cwd(), '.ai', 'validation-report.json')}`);
      
    } catch (error) {
      console.error('Validation error:', error.message);
      process.exit(1);
    }
  });

program
  .command('hierarchy')
  .description('Manage instruction hierarchy')
  .option('-r, --resolve', 'Resolve instructions for context')
  .option('-a, --agent <agent>', 'Agent name')
  .option('-t, --team <team>', 'Team name')
  .option('-k, --task <task>', 'Task name')
  .action(async (options) => {
    const manager = new InstructionHierarchyManager();
    
    if (options.resolve) {
      const context = {
        agent: options.agent,
        team: options.team,
        task: options.task,
        framework: 'bmad'
      };
      
      const instructions = await manager.resolveInstructions(context);
      console.log('Resolved instructions:');
      instructions.forEach((inst, i) => console.log(`  ${i + 1}. ${inst}`));
    } else {
      const hierarchy = await manager.loadHierarchy();
      console.log('Current instruction hierarchy:');
      console.log(JSON.stringify(hierarchy, null, 2));
    }
  });

program
  .command('test')
  .description('Run validation test with sample data')
  .action(async () => {
    const validator = new StructuredOutputValidator();
    
    const sampleData = {
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
          description: 'Testing structured output validation functionality',
          content: 'Sample content for testing the validation system',
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
          rationale: 'Ensures consistency across all agent outputs and enables validation',
          alternatives: ['Free-form output', 'YAML format'],
          impact: 'medium',
          reversible: true,
          instruction_level: 'template'
        }
      ],
      assumptions: [
        {
          assumption: 'All agents will adopt this format',
          basis: 'Framework requirements and consistency needs',
          risk_if_wrong: 'Inconsistent outputs across agents',
          validation_needed: true,
          validation_method: 'Agent compliance testing and gradual rollout'
        }
      ],
      risks: [
        {
          risk: 'Performance impact from validation overhead',
          category: 'technical',
          probability: 'low',
          impact: 'low',
          mitigation: 'Optimize validation logic and make validation optional for simple outputs',
          contingency: 'Implement validation caching',
          owner: 'framework-team'
        }
      ],
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    
    const result = await validator.validateAgentOutput('cli-test', 'structured_output', sampleData);
    console.log(`Test result: ${result.overallStatus}`);
    
    const report = await validator.generateValidationReport();
    console.log(`Report generated with ${report.totalValidations} validations`);
    console.log(`Compliance score: ${(report.averageCompliance * 100).toFixed(1)}%`);
  });

program.parse();