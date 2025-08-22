#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-015: Instruction Hierarchy & Structured Outputs
async function execute() {
  console.log('[AH-015] Implementing Instruction Hierarchy & Structured Outputs...');
  
  const toolsDir = path.join(__dirname, '..', '..');
  const instructionDir = path.join(toolsDir, 'instruction-hierarchy');
  const bmadCoreDir = path.join(__dirname, '..', '..', '..', 'bmad-core');
  
  await fs.mkdir(instructionDir, { recursive: true });
  
  // Create instruction-hierarchy-manager.js
  const instructionManager = `const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class InstructionHierarchyManager {
  constructor() {
    this.hierarchyConfig = path.join(process.cwd(), '.ai', 'instruction-hierarchy.yaml');
    this.outputSchemas = path.join(process.cwd(), '.ai', 'output-schemas.json');
    this.defaultHierarchy = {
      global: {
        priority: 1,
        scope: 'all-agents',
        overridable: false,
        instructions: [
          'Follow SEMAD methodology principles',
          'Maintain context throughout workflows',
          'Use structured outputs for all communications'
        ]
      },
      framework: {
        priority: 2,
        scope: 'bmad-framework',
        overridable: true,
        instructions: [
          'Reference bmad-core templates and workflows',
          'Maintain agent dependency integrity',
          'Follow expansion pack conventions'
        ]
      },
      team: {
        priority: 3,
        scope: 'agent-team',
        overridable: true,
        instructions: []
      },
      agent: {
        priority: 4,
        scope: 'individual-agent',
        overridable: true,
        instructions: []
      },
      task: {
        priority: 5,
        scope: 'current-task',
        overridable: true,
        instructions: []
      }
    };
  }
  
  async initializeHierarchy() {
    console.log('[HIERARCHY] Initializing instruction hierarchy...');
    
    await fs.mkdir(path.dirname(this.hierarchyConfig), { recursive: true });
    
    // Create hierarchy config if it doesn't exist
    try {
      await fs.access(this.hierarchyConfig);
      console.log('[HIERARCHY] Using existing hierarchy configuration');
    } catch (error) {
      await fs.writeFile(this.hierarchyConfig, yaml.dump(this.defaultHierarchy));
      console.log('[HIERARCHY] Created default hierarchy configuration');
    }
    
    // Initialize output schemas
    await this.initializeOutputSchemas();
    
    return this.loadHierarchy();
  }
  
  async loadHierarchy() {
    try {
      const content = await fs.readFile(this.hierarchyConfig, 'utf-8');
      return yaml.load(content);
    } catch (error) {
      console.error(\`[HIERARCHY] Failed to load hierarchy: \${error.message}\`);
      return this.defaultHierarchy;
    }
  }
  
  async updateHierarchy(level, instructions, options = {}) {
    console.log(\`[HIERARCHY] Updating \${level} level instructions...\`);
    
    const hierarchy = await this.loadHierarchy();
    
    if (!hierarchy[level]) {
      hierarchy[level] = {
        priority: options.priority || 10,
        scope: options.scope || level,
        overridable: options.overridable !== false,
        instructions: []
      };
    }
    
    if (options.replace) {
      hierarchy[level].instructions = instructions;
    } else {
      hierarchy[level].instructions.push(...instructions);
    }
    
    await fs.writeFile(this.hierarchyConfig, yaml.dump(hierarchy));
    console.log(\`[HIERARCHY] Updated \${level} instructions\`);
    
    return hierarchy;
  }
  
  async resolveInstructions(context = {}) {
    const hierarchy = await this.loadHierarchy();
    const resolvedInstructions = [];
    
    // Sort levels by priority
    const sortedLevels = Object.entries(hierarchy)
      .sort(([,a], [,b]) => a.priority - b.priority);
    
    for (const [level, config] of sortedLevels) {
      if (this.isLevelApplicable(level, config, context)) {
        resolvedInstructions.push({
          level,
          priority: config.priority,
          scope: config.scope,
          overridable: config.overridable,
          instructions: config.instructions
        });
      }
    }
    
    return this.mergeInstructions(resolvedInstructions, context);
  }
  
  isLevelApplicable(level, config, context) {
    switch (config.scope) {
      case 'all-agents':
        return true;
      case 'bmad-framework':
        return context.framework === 'bmad' || context.agent?.includes('bmad');
      case 'agent-team':
        return context.team && config.instructions.length > 0;
      case 'individual-agent':
        return context.agent && config.instructions.length > 0;
      case 'current-task':
        return context.task && config.instructions.length > 0;
      default:
        return true;
    }
  }
  
  mergeInstructions(instructionLevels, context) {
    const finalInstructions = [];
    const overrides = new Map();
    
    // Process in priority order
    for (const level of instructionLevels) {
      for (const instruction of level.instructions) {
        const key = this.normalizeInstruction(instruction);
        
        if (!overrides.has(key) || level.overridable) {
          overrides.set(key, {
            instruction,
            level: level.level,
            priority: level.priority
          });
        }
      }
    }
    
    // Convert back to array, sorted by priority
    return Array.from(overrides.values())
      .sort((a, b) => a.priority - b.priority)
      .map(item => item.instruction);
  }
  
  normalizeInstruction(instruction) {
    return instruction.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  async initializeOutputSchemas() {
    const schemas = {
      story: {
        type: 'object',
        required: ['id', 'title', 'description', 'context', 'acceptance_criteria'],
        properties: {
          id: { type: 'string', pattern: '^[A-Z]{2}-\\\\d{3}$' },
          title: { type: 'string', minLength: 10, maxLength: 100 },
          description: { type: 'string', minLength: 50 },
          context: {
            type: 'object',
            required: ['background', 'dependencies', 'constraints'],
            properties: {
              background: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
              constraints: { type: 'array', items: { type: 'string' } }
            }
          },
          acceptance_criteria: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' }
          },
          implementation_notes: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
        }
      },
      architecture_decision: {
        type: 'object',
        required: ['decision_id', 'title', 'status', 'context', 'decision', 'consequences'],
        properties: {
          decision_id: { type: 'string', pattern: '^ADR-\\\\d{3}$' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['proposed', 'accepted', 'deprecated', 'superseded'] },
          context: { type: 'string' },
          decision: { type: 'string' },
          consequences: {
            type: 'object',
            properties: {
              positive: { type: 'array', items: { type: 'string' } },
              negative: { type: 'array', items: { type: 'string' } },
              neutral: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      },
      progress_report: {
        type: 'object',
        required: ['timestamp', 'phase', 'completed_tasks', 'current_tasks', 'next_tasks'],
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          phase: { type: 'string', enum: ['planning', 'development', 'testing', 'deployment'] },
          completed_tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                completion_time: { type: 'string', format: 'date-time' }
              }
            }
          },
          current_tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                progress: { type: 'number', minimum: 0, maximum: 100 },
                estimated_completion: { type: 'string', format: 'date-time' }
              }
            }
          },
          next_tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
              }
            }
          },
          blockers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                assigned_to: { type: 'string' }
              }
            }
          }
        }
      },
      validation_result: {
        type: 'object',
        required: ['validated_item', 'status', 'checks', 'timestamp'],
        properties: {
          validated_item: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'failed', 'warning'] },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'status'],
              properties: {
                name: { type: 'string' },
                status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
                message: { type: 'string' },
                details: { type: 'object' }
              }
            }
          },
          timestamp: { type: 'string', format: 'date-time' },
          metadata: {
            type: 'object',
            properties: {
              validator: { type: 'string' },
              version: { type: 'string' },
              environment: { type: 'string' }
            }
          }
        }
      }
    };
    
    await fs.writeFile(this.outputSchemas, JSON.stringify(schemas, null, 2));
    console.log('[HIERARCHY] Initialized output schemas');
  }
  
  async validateOutput(outputType, data) {
    try {
      const schemas = JSON.parse(await fs.readFile(this.outputSchemas, 'utf-8'));
      const schema = schemas[outputType];
      
      if (!schema) {
        return { valid: false, errors: [\`Unknown output type: \${outputType}\`] };
      }
      
      const errors = [];
      const valid = this.validateAgainstSchema(data, schema, errors);
      
      return { valid, errors };
    } catch (error) {
      return { valid: false, errors: [\`Schema validation error: \${error.message}\`] };
    }
  }
  
  validateAgainstSchema(data, schema, errors, path = '') {
    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null) {
        errors.push(\`\${path}: Expected object, got \${typeof data}\`);
        return false;
      }
      
      // Check required properties
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in data)) {
            errors.push(\`\${path}: Missing required property '\${required}'\`);
            return false;
          }
        }
      }
      
      // Validate properties
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in data) {
            this.validateAgainstSchema(data[prop], propSchema, errors, \`\${path}.\${prop}\`);
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(data)) {
        errors.push(\`\${path}: Expected array, got \${typeof data}\`);
        return false;
      }
      
      if (schema.minItems && data.length < schema.minItems) {
        errors.push(\`\${path}: Array must have at least \${schema.minItems} items\`);
        return false;
      }
      
      if (schema.items) {
        data.forEach((item, index) => {
          this.validateAgainstSchema(item, schema.items, errors, \`\${path}[\${index}]\`);
        });
      }
    } else if (schema.type === 'string') {
      if (typeof data !== 'string') {
        errors.push(\`\${path}: Expected string, got \${typeof data}\`);
        return false;
      }
      
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(\`\${path}: String must be at least \${schema.minLength} characters\`);
        return false;
      }
      
      if (schema.maxLength && data.length > schema.maxLength) {
        errors.push(\`\${path}: String must be at most \${schema.maxLength} characters\`);
        return false;
      }
      
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push(\`\${path}: String does not match pattern \${schema.pattern}\`);
        return false;
      }
      
      if (schema.enum && !schema.enum.includes(data)) {
        errors.push(\`\${path}: Value must be one of: \${schema.enum.join(', ')}\`);
        return false;
      }
    }
    
    return errors.length === 0;
  }
  
  async generateInstructionContext(agent, team, task) {
    const context = {
      agent,
      team,
      task,
      framework: 'bmad'
    };
    
    const instructions = await this.resolveInstructions(context);
    
    return {
      context,
      instructions,
      hierarchy: await this.loadHierarchy(),
      schemas: JSON.parse(await fs.readFile(this.outputSchemas, 'utf-8'))
    };
  }
}

module.exports = { InstructionHierarchyManager };

if (require.main === module) {
  const manager = new InstructionHierarchyManager();
  const command = process.argv[2];
  
  switch (command) {
    case 'init':
      manager.initializeHierarchy().then(() => {
        console.log('[HIERARCHY] Instruction hierarchy initialized');
      });
      break;
    case 'resolve':
      const context = {
        agent: process.argv[3],
        team: process.argv[4],
        task: process.argv[5]
      };
      manager.resolveInstructions(context).then(instructions => {
        console.log('Resolved instructions:');
        instructions.forEach((inst, i) => console.log(\`  \${i + 1}. \${inst}\`));
      });
      break;
    case 'validate':
      const outputType = process.argv[3];
      const dataFile = process.argv[4];
      if (dataFile) {
        require('fs').readFile(dataFile, 'utf-8', (err, data) => {
          if (err) {
            console.error(\`Error reading file: \${err.message}\`);
            return;
          }
          try {
            const parsedData = JSON.parse(data);
            manager.validateOutput(outputType, parsedData).then(result => {
              if (result.valid) {
                console.log('✓ Output validation passed');
              } else {
                console.error('✗ Output validation failed:');
                result.errors.forEach(error => console.error(\`  - \${error}\`));
              }
            });
          } catch (parseError) {
            console.error(\`JSON parse error: \${parseError.message}\`);
          }
        });
      }
      break;
    default:
      console.log('Usage: node instruction-hierarchy-manager.js [init|resolve|validate] [args...]');
  }
}`;
  
  await fs.writeFile(path.join(instructionDir, 'instruction-hierarchy-manager.js'), instructionManager);
  
  // Create structured output validator
  const outputValidator = `const fs = require('fs').promises;
const path = require('path');
const { InstructionHierarchyManager } = require('./instruction-hierarchy-manager');

class StructuredOutputValidator {
  constructor() {
    this.hierarchyManager = new InstructionHierarchyManager();
    this.validationResults = [];
  }
  
  async validateAgentOutput(agentName, outputType, outputData, context = {}) {
    console.log(\`[VALIDATOR] Validating \${outputType} output from \${agentName}\`);
    
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
      console.error(\`[VALIDATOR] ✗ Validation failed for \${agentName} \${outputType}\`);
      validation.errors.forEach(error => console.error(\`  - \${error}\`));
    } else {
      console.log(\`[VALIDATOR] ✓ Validation passed for \${agentName} \${outputType}\`);
    }
    
    return result;
  }
  
  checkInstructionCompliance(outputData, instructions) {
    const compliance = {
      score: 0,
      checkedInstructions: [],
      violations: []
    };
    
    // Check for SEMAD methodology compliance
    const semadInstructions = instructions.filter(inst => 
      inst.toLowerCase().includes('semad') || 
      inst.toLowerCase().includes('context') ||
      inst.toLowerCase().includes('structured')
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
    
    console.log(\`[VALIDATOR] Validation report saved to \${reportPath}\`);
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
    // Test validation with sample data
    const sampleStory = {
      id: 'US-001',
      title: 'Sample User Story',
      description: 'This is a sample user story for testing validation functionality',
      context: {
        background: 'Testing validation',
        dependencies: ['none'],
        constraints: ['test environment']
      },
      acceptance_criteria: ['Story validates successfully']
    };
    
    validator.validateAgentOutput('test-agent', 'story', sampleStory).then(result => {
      console.log('Test validation result:', result.overallStatus);
      return validator.generateValidationReport();
    }).then(report => {
      console.log(\`Generated report with \${report.totalValidations} validations\`);
    });
  }
}`;
  
  await fs.writeFile(path.join(instructionDir, 'structured-output-validator.js'), outputValidator);
  
  // Create hierarchy updater utility
  const hierarchyUpdater = `const fs = require('fs').promises;
const path = require('path');
const { InstructionHierarchyManager } = require('./instruction-hierarchy-manager');

class HierarchyUpdater {
  constructor() {
    this.manager = new InstructionHierarchyManager();
  }
  
  async updateFromAgent(agentPath) {
    console.log(\`[UPDATER] Updating hierarchy from agent: \${agentPath}\`);
    
    try {
      const agentConfig = await this.loadAgentConfig(agentPath);
      const instructions = this.extractInstructionsFromAgent(agentConfig);
      
      if (instructions.length > 0) {
        await this.manager.updateHierarchy('agent', instructions, {
          scope: 'individual-agent',
          priority: 4,
          overridable: true
        });
        
        console.log(\`[UPDATER] Added \${instructions.length} instructions from \${path.basename(agentPath)}\`);
      }
    } catch (error) {
      console.error(\`[UPDATER] Failed to update from agent: \${error.message}\`);
    }
  }
  
  async updateFromTeam(teamPath) {
    console.log(\`[UPDATER] Updating hierarchy from team: \${teamPath}\`);
    
    try {
      const teamConfig = await this.loadTeamConfig(teamPath);
      const instructions = this.extractInstructionsFromTeam(teamConfig);
      
      if (instructions.length > 0) {
        await this.manager.updateHierarchy('team', instructions, {
          scope: 'agent-team',
          priority: 3,
          overridable: true
        });
        
        console.log(\`[UPDATER] Added \${instructions.length} team instructions from \${path.basename(teamPath)}\`);
      }
    } catch (error) {
      console.error(\`[UPDATER] Failed to update from team: \${error.message}\`);
    }
  }
  
  async scanAndUpdateAll() {
    console.log('[UPDATER] Scanning all agents and teams for instructions...');
    
    const bmadCore = path.join(process.cwd(), 'bmad-core');
    
    // Scan agents
    const agentsDir = path.join(bmadCore, 'agents');
    try {
      const agentFiles = await fs.readdir(agentsDir);
      for (const file of agentFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await this.updateFromAgent(path.join(agentsDir, file));
        }
      }
    } catch (error) {
      console.log('[UPDATER] No agents directory found');
    }
    
    // Scan teams
    const teamsDir = path.join(bmadCore, 'agent-teams');
    try {
      const teamFiles = await fs.readdir(teamsDir);
      for (const file of teamFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await this.updateFromTeam(path.join(teamsDir, file));
        }
      }
    } catch (error) {
      console.log('[UPDATER] No teams directory found');
    }
    
    console.log('[UPDATER] Scan complete');
  }
  
  async loadAgentConfig(agentPath) {
    const content = await fs.readFile(agentPath, 'utf-8');
    return this.parseYaml(content);
  }
  
  async loadTeamConfig(teamPath) {
    const content = await fs.readFile(teamPath, 'utf-8');
    return this.parseYaml(content);
  }
  
  parseYaml(content) {
    // Simple YAML parsing for instructions
    const lines = content.split('\\n');
    const config = {};
    let currentSection = null;
    let currentArray = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes(':') && !trimmed.startsWith('-')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        if (value) {
          config[key] = value;
        } else {
          currentSection = key;
          config[key] = {};
        }
      } else if (trimmed.startsWith('-') && currentSection) {
        const value = trimmed.substring(1).trim();
        if (!currentArray) {
          currentArray = [];
          config[currentSection] = currentArray;
        }
        currentArray.push(value);
      } else if (trimmed === '' || trimmed.startsWith('#')) {
        currentArray = null;
      }
    }
    
    return config;
  }
  
  extractInstructionsFromAgent(agentConfig) {
    const instructions = [];
    
    // Look for common instruction fields
    const instructionFields = [
      'instructions',
      'guidelines',
      'rules',
      'constraints',
      'requirements'
    ];
    
    for (const field of instructionFields) {
      if (agentConfig[field]) {
        if (Array.isArray(agentConfig[field])) {
          instructions.push(...agentConfig[field]);
        } else if (typeof agentConfig[field] === 'string') {
          instructions.push(agentConfig[field]);
        }
      }
    }
    
    return instructions.filter(inst => inst && inst.length > 10); // Filter meaningful instructions
  }
  
  extractInstructionsFromTeam(teamConfig) {
    const instructions = [];
    
    // Look for team-level instructions
    if (teamConfig.collaboration_rules) {
      if (Array.isArray(teamConfig.collaboration_rules)) {
        instructions.push(...teamConfig.collaboration_rules);
      }
    }
    
    if (teamConfig.workflow_rules) {
      if (Array.isArray(teamConfig.workflow_rules)) {
        instructions.push(...teamConfig.workflow_rules);
      }
    }
    
    return instructions.filter(inst => inst && inst.length > 10);
  }
}

module.exports = { HierarchyUpdater };

if (require.main === module) {
  const updater = new HierarchyUpdater();
  const command = process.argv[2];
  
  switch (command) {
    case 'scan':
      updater.scanAndUpdateAll().then(() => {
        console.log('[UPDATER] Hierarchy update complete');
      });
      break;
    case 'agent':
      const agentPath = process.argv[3];
      if (agentPath) {
        updater.updateFromAgent(agentPath).then(() => {
          console.log('[UPDATER] Agent hierarchy update complete');
        });
      }
      break;
    case 'team':
      const teamPath = process.argv[3];
      if (teamPath) {
        updater.updateFromTeam(teamPath).then(() => {
          console.log('[UPDATER] Team hierarchy update complete');
        });
      }
      break;
    default:
      console.log('Usage: node hierarchy-updater.js [scan|agent|team] [path]');
  }
}`;
  
  await fs.writeFile(path.join(instructionDir, 'hierarchy-updater.js'), hierarchyUpdater);
  
  // Update bmad-core configuration to include instruction hierarchy
  const configDir = path.join(bmadCoreDir, 'config');
  await fs.mkdir(configDir, { recursive: true });
  
  const instructionHierarchyConfig = `# Instruction Hierarchy Configuration
# This file defines the instruction hierarchy and structured output requirements

global:
  priority: 1
  scope: all-agents
  overridable: false
  instructions:
    - "Follow SEMAD methodology principles throughout all workflows"
    - "Maintain context integrity across agent interactions"
    - "Use structured outputs for all formal communications"
    - "Document decisions and rationale transparently"
    - "Validate outputs against defined schemas before submission"

framework:
  priority: 2
  scope: bmad-framework
  overridable: true
  instructions:
    - "Reference bmad-core templates and workflows consistently"
    - "Maintain agent dependency integrity during builds"
    - "Follow expansion pack conventions for domain extensions"
    - "Use semantic versioning for all releases"
    - "Ensure backward compatibility when possible"

team:
  priority: 3
  scope: agent-team
  overridable: true
  instructions:
    - "Coordinate through story context and handoff protocols"
    - "Share knowledge through structured documentation"
    - "Escalate blockers through defined channels"

agent:
  priority: 4
  scope: individual-agent
  overridable: true
  instructions:
    - "Specialize in assigned domain while maintaining broader context"
    - "Validate inputs and outputs according to agent specifications"
    - "Document assumptions and limitations clearly"

task:
  priority: 5
  scope: current-task
  overridable: true
  instructions:
    - "Focus on task-specific requirements while maintaining system coherence"
    - "Include traceability to parent requirements"
    - "Verify completion criteria before marking complete"

# Output Schema Enforcement
schema_enforcement:
  enabled: true
  validation_level: strict  # strict, warning, disabled
  required_schemas:
    - story
    - architecture_decision
    - progress_report
    - validation_result
  
# Compliance Monitoring
compliance:
  enabled: true
  thresholds:
    minimum_compliance_score: 0.8
    critical_violation_threshold: 3
  reporting:
    generate_reports: true
    report_frequency: daily
    alert_on_violations: true`;
  
  await fs.writeFile(path.join(configDir, 'instruction-hierarchy-config.yaml'), instructionHierarchyConfig);
  
  console.log('[AH-015] ✓ Instruction Hierarchy & Structured Outputs implementation complete');
}

module.exports = { execute };