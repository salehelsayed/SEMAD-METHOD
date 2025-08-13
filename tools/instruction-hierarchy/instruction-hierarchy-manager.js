const fs = require('fs').promises;
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
      console.error(`[HIERARCHY] Failed to load hierarchy: ${error.message}`);
      return this.defaultHierarchy;
    }
  }
  
  async updateHierarchy(level, instructions, options = {}) {
    console.log(`[HIERARCHY] Updating ${level} level instructions...`);
    
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
    console.log(`[HIERARCHY] Updated ${level} instructions`);
    
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
      structured_output: {
        type: 'object',
        required: ['type', 'storyId', 'inputs', 'outputs', 'decisions', 'assumptions', 'risks'],
        properties: {
          type: { 
            type: 'string',
            enum: ['story', 'architecture_decision', 'progress_report', 'validation_result', 'project_brief', 'prd', 'technical_spec', 'test_plan', 'deployment_plan', 'handoff_document']
          },
          storyId: { 
            type: 'string', 
            pattern: '^[A-Z]{2,4}-\\d{3,4}$' 
          },
          inputs: {
            type: 'object',
            required: ['sources', 'context'],
            properties: {
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['type', 'identifier'],
                  properties: {
                    type: { type: 'string', enum: ['prd', 'architecture', 'story', 'template', 'user_input', 'external_doc'] },
                    identifier: { type: 'string' },
                    version: { type: 'string' },
                    relevance: { type: 'string', enum: ['primary', 'secondary', 'reference'] }
                  }
                }
              },
              context: {
                type: 'object',
                properties: {
                  agent: { type: 'string' },
                  workflow_phase: { type: 'string', enum: ['planning', 'development', 'testing', 'deployment', 'maintenance'] },
                  dependencies: { type: 'array', items: { type: 'string' } },
                  constraints: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          },
          outputs: {
            type: 'object',
            required: ['primary', 'artifacts'],
            properties: {
              primary: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  content: { type: 'string' },
                  format: { type: 'string', enum: ['markdown', 'yaml', 'json', 'text', 'code'] }
                }
              },
              artifacts: { type: 'array' },
              validation_status: { type: 'object' }
            }
          },
          decisions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['decision', 'rationale', 'alternatives'],
              properties: {
                decision: { type: 'string' },
                rationale: { type: 'string' },
                alternatives: { type: 'array', items: { type: 'string' } },
                impact: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                reversible: { type: 'boolean' },
                instruction_level: { type: 'string', enum: ['system', 'gate_rule', 'story_contract', 'prd_architecture', 'template'] }
              }
            }
          },
          assumptions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['assumption', 'basis', 'risk_if_wrong'],
              properties: {
                assumption: { type: 'string' },
                basis: { type: 'string' },
                risk_if_wrong: { type: 'string' },
                validation_needed: { type: 'boolean' },
                validation_method: { type: 'string' }
              }
            }
          },
          risks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['risk', 'probability', 'impact', 'mitigation'],
              properties: {
                risk: { type: 'string' },
                category: { type: 'string', enum: ['technical', 'business', 'schedule', 'resource', 'quality', 'security'] },
                probability: { type: 'string', enum: ['very_low', 'low', 'medium', 'high', 'very_high'] },
                impact: { type: 'string', enum: ['very_low', 'low', 'medium', 'high', 'very_high'] },
                mitigation: { type: 'string' },
                contingency: { type: 'string' },
                owner: { type: 'string' }
              }
            }
          },
          timestamp: { type: 'string', format: 'date-time' },
          version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' }
        }
      },
      story: {
        type: 'object',
        required: ['id', 'title', 'description', 'context', 'acceptance_criteria'],
        properties: {
          id: { type: 'string', pattern: '^[A-Z]{2}-\\d{3}$' },
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
          decision_id: { type: 'string', pattern: '^ADR-\\d{3}$' },
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
        return { valid: false, errors: [`Unknown output type: ${outputType}`] };
      }
      
      const errors = [];
      const valid = this.validateAgainstSchema(data, schema, errors);
      
      return { valid, errors };
    } catch (error) {
      return { valid: false, errors: [`Schema validation error: ${error.message}`] };
    }
  }
  
  validateAgainstSchema(data, schema, errors, path = '') {
    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null) {
        errors.push(`${path}: Expected object, got ${typeof data}`);
        return false;
      }
      
      // Check required properties
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in data)) {
            errors.push(`${path}: Missing required property '${required}'`);
            return false;
          }
        }
      }
      
      // Validate properties
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in data) {
            this.validateAgainstSchema(data[prop], propSchema, errors, `${path}.${prop}`);
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(data)) {
        errors.push(`${path}: Expected array, got ${typeof data}`);
        return false;
      }
      
      if (schema.minItems && data.length < schema.minItems) {
        errors.push(`${path}: Array must have at least ${schema.minItems} items`);
        return false;
      }
      
      if (schema.items) {
        data.forEach((item, index) => {
          this.validateAgainstSchema(item, schema.items, errors, `${path}[${index}]`);
        });
      }
    } else if (schema.type === 'string') {
      if (typeof data !== 'string') {
        errors.push(`${path}: Expected string, got ${typeof data}`);
        return false;
      }
      
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(`${path}: String must be at least ${schema.minLength} characters`);
        return false;
      }
      
      if (schema.maxLength && data.length > schema.maxLength) {
        errors.push(`${path}: String must be at most ${schema.maxLength} characters`);
        return false;
      }
      
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push(`${path}: String does not match pattern ${schema.pattern}`);
        return false;
      }
      
      if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${path}: Value must be one of: ${schema.enum.join(', ')}`);
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
        instructions.forEach((inst, i) => console.log(`  ${i + 1}. ${inst}`));
      });
      break;
    case 'validate':
      const outputType = process.argv[3];
      const dataFile = process.argv[4];
      if (dataFile) {
        require('fs').readFile(dataFile, 'utf-8', (err, data) => {
          if (err) {
            console.error(`Error reading file: ${err.message}`);
            return;
          }
          try {
            const parsedData = JSON.parse(data);
            manager.validateOutput(outputType, parsedData).then(result => {
              if (result.valid) {
                console.log('✓ Output validation passed');
              } else {
                console.error('✗ Output validation failed:');
                result.errors.forEach(error => console.error(`  - ${error}`));
              }
            });
          } catch (parseError) {
            console.error(`JSON parse error: ${parseError.message}`);
          }
        });
      }
      break;
    default:
      console.log('Usage: node instruction-hierarchy-manager.js [init|resolve|validate] [args...]');
  }
}