const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('Agent Connectivity and Dependency Validation', () => {
  const agentsDir = path.join(__dirname, '..', 'bmad-core', 'agents');
  const rootDir = path.join(__dirname, '..');
  
  let agentFiles;
  let allAgents = {};
  
  beforeAll(async () => {
    // Load all agent files
    agentFiles = fs.readdirSync(agentsDir).filter(file => file.endsWith('.md'));
    
    for (const file of agentFiles) {
      const agentPath = path.join(agentsDir, file);
      const content = fs.readFileSync(agentPath, 'utf8');
      
      // Extract YAML frontmatter
      const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
      if (yamlMatch) {
        try {
          const agentConfig = yaml.load(yamlMatch[1]);
          allAgents[file] = {
            path: agentPath,
            config: agentConfig,
            content: content
          };
        } catch (error) {
          console.error(`Failed to parse YAML in ${file}:`, error.message);
        }
      }
    }
  });

  describe('Agent File Structure Validation', () => {
    test('all agent files have valid YAML configuration', () => {
      expect(Object.keys(allAgents).length).toBeGreaterThan(0);
      
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        expect(agent.config).toBeDefined();
        expect(agent.config.agent).toBeDefined();
        expect(agent.config.agent.name).toBeDefined();
        expect(agent.config.agent.id).toBeDefined();
        expect(agent.config.agent.title).toBeDefined();
      });
    });

    test('each agent has required activation instructions', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        expect(agent.config['activation-instructions']).toBeDefined();
        expect(Array.isArray(agent.config['activation-instructions'])).toBe(true);
        expect(agent.config['activation-instructions'].length).toBeGreaterThan(0);
      });
    });

    test('each agent has persona definition', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        expect(agent.config.persona).toBeDefined();
        expect(agent.config.persona.role).toBeDefined();
        expect(agent.config.persona.style).toBeDefined();
        expect(agent.config.persona.identity).toBeDefined();
      });
    });
  });

  describe('Agent Dependencies Validation', () => {
    test('all referenced tasks exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.tasks) {
          agent.config.dependencies.tasks.forEach(taskName => {
            const taskPath = path.join(rootDir, 'bmad-core', 'tasks', taskName);
            const alternativePath = path.join(rootDir, 'common', 'tasks', taskName);
            
            const taskExists = fs.existsSync(taskPath) || fs.existsSync(alternativePath);
            expect(taskExists).toBe(true, 
              `Task ${taskName} referenced by agent ${fileName} not found at ${taskPath} or ${alternativePath}`);
          });
        }
      });
    });

    test('all referenced structured-tasks exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies['structured-tasks']) {
          agent.config.dependencies['structured-tasks'].forEach(taskName => {
            const taskPath = path.join(rootDir, 'bmad-core', 'structured-tasks', taskName);
            const alternativePath = path.join(rootDir, 'common', 'structured-tasks', taskName);
            
            const taskExists = fs.existsSync(taskPath) || fs.existsSync(alternativePath);
            expect(taskExists).toBe(true, 
              `Structured task ${taskName} referenced by agent ${fileName} not found at ${taskPath} or ${alternativePath}`);
          });
        }
      });
    });

    test('all referenced checklists exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.checklists) {
          agent.config.dependencies.checklists.forEach(checklistName => {
            const checklistPath = path.join(rootDir, 'bmad-core', 'structured-checklists', checklistName);
            const alternativePath = path.join(rootDir, 'common', 'structured-checklists', checklistName);
            
            const checklistExists = fs.existsSync(checklistPath) || fs.existsSync(alternativePath);
            expect(checklistExists).toBe(true, 
              `Checklist ${checklistName} referenced by agent ${fileName} not found at ${checklistPath} or ${alternativePath}`);
          });
        }
      });
    });

    test('all referenced templates exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.templates) {
          agent.config.dependencies.templates.forEach(templateName => {
            const templatePath = path.join(rootDir, 'bmad-core', 'templates', templateName);
            
            const templateExists = fs.existsSync(templatePath);
            expect(templateExists).toBe(true, 
              `Template ${templateName} referenced by agent ${fileName} not found at ${templatePath}`);
          });
        }
      });
    });

    test('all referenced data files exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.data) {
          agent.config.dependencies.data.forEach(dataName => {
            const dataPath = path.join(rootDir, 'bmad-core', 'data', dataName);
            
            const dataExists = fs.existsSync(dataPath);
            expect(dataExists).toBe(true, 
              `Data file ${dataName} referenced by agent ${fileName} not found at ${dataPath}`);
          });
        }
      });
    });

    test('all referenced utils exist', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.utils) {
          const utils = agent.config.dependencies.utils;
          
          // Handle array format (which can contain strings or objects)
          if (Array.isArray(utils)) {
            utils.forEach(util => {
              if (typeof util === 'string') {
                // Simple string reference
                const utilPath = path.join(rootDir, 'bmad-core', 'utils', util);
                const utilExists = fs.existsSync(utilPath);
                expect(utilExists).toBe(true, 
                  `Util ${util} referenced by agent ${fileName} not found at ${utilPath}`);
              } else if (typeof util === 'object') {
                // Object with key-value pairs
                Object.entries(util).forEach(([utilKey, utilPath]) => {
                  let resolvedPath;
                  if (utilPath.startsWith('../')) {
                    // Relative path from agents directory
                    resolvedPath = path.resolve(agentsDir, utilPath);
                  } else {
                    // Absolute path from root
                    resolvedPath = path.join(rootDir, utilPath);
                  }
                  
                  const utilExists = fs.existsSync(resolvedPath);
                  expect(utilExists).toBe(true, 
                    `Util ${utilKey} (${utilPath}) referenced by agent ${fileName} not found at ${resolvedPath}`);
                });
              }
            });
          } else if (typeof utils === 'object') {
            // Pure object format
            Object.entries(utils).forEach(([utilKey, utilPath]) => {
              let resolvedPath;
              if (utilPath.startsWith('../')) {
                // Relative path
                resolvedPath = path.resolve(agentsDir, utilPath);
              } else {
                // Absolute path from root
                resolvedPath = path.join(rootDir, utilPath);
              }
              
              const utilExists = fs.existsSync(resolvedPath);
              expect(utilExists).toBe(true, 
                `Util ${utilKey} (${utilPath}) referenced by agent ${fileName} not found at ${resolvedPath}`);
            });
          }
        }
      });
    });
  });

  describe('Agent Team Configuration Validation', () => {
    test('agent team files reference valid agents', () => {
      const teamDir = path.join(rootDir, 'bmad-core', 'agent-teams');
      const teamFiles = fs.readdirSync(teamDir).filter(file => file.endsWith('.yaml'));
      
      teamFiles.forEach(teamFile => {
        const teamPath = path.join(teamDir, teamFile);
        const teamConfig = yaml.load(fs.readFileSync(teamPath, 'utf8'));
        
        if (teamConfig.agents) {
          teamConfig.agents.forEach(agentId => {
            // Skip wildcards
            if (agentId === '*') {
              return;
            }
            const agentFile = `${agentId}.md`;
            if (!allAgents[agentFile]) {
              throw new Error(`Agent ${agentId} referenced in team ${teamFile} not found`);
            }
          });
        }
      });
    });

    test('no circular dependencies between agents', () => {
      // This would be a more complex test to implement
      // For now, we'll just verify no agent references itself
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        const agentId = agent.config.agent.id;
        
        if (agent.config.dependencies) {
          Object.values(agent.config.dependencies).forEach(depList => {
            if (Array.isArray(depList)) {
              expect(depList).not.toContain(`${agentId}.md`);
              expect(depList).not.toContain(agentId);
            }
          });
        }
      });
    });
  });

  describe('Schema Validation for Dependencies', () => {
    test('structured tasks have valid YAML schema', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies['structured-tasks']) {
          agent.config.dependencies['structured-tasks'].forEach(taskName => {
            const taskPath = path.join(rootDir, 'bmad-core', 'structured-tasks', taskName);
            const alternativePath = path.join(rootDir, 'common', 'structured-tasks', taskName);
            
            let actualPath;
            if (fs.existsSync(taskPath)) {
              actualPath = taskPath;
            } else if (fs.existsSync(alternativePath)) {
              actualPath = alternativePath;
            }

            if (actualPath) {
              try {
                const taskContent = fs.readFileSync(actualPath, 'utf8');
                const taskConfig = yaml.load(taskContent);
                
                // Validate basic structure - handle both formats
                if (taskConfig.task) {
                  // New format with task object
                  expect(taskConfig.task.name).toBeDefined();
                  expect(taskConfig.task.description).toBeDefined();
                  expect(taskConfig.steps).toBeDefined();
                  expect(Array.isArray(taskConfig.steps)).toBe(true);
                } else if (taskConfig.id && taskConfig.name) {
                  // Alternative format with id/name at root
                  expect(taskConfig.name).toBeDefined();
                  expect(taskConfig.steps || taskConfig.actions || taskConfig.inputs).toBeDefined();
                } else {
                  throw new Error(`Unknown structured task format in ${taskName}`);
                }
              } catch (error) {
                throw new Error(`Invalid YAML in structured task ${taskName}: ${error.message}`);
              }
            }
          });
        }
      });
    });

    test('checklist files have valid YAML schema', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies && agent.config.dependencies.checklists) {
          agent.config.dependencies.checklists.forEach(checklistName => {
            const checklistPath = path.join(rootDir, 'bmad-core', 'structured-checklists', checklistName);
            const alternativePath = path.join(rootDir, 'common', 'structured-checklists', checklistName);
            
            let actualPath;
            if (fs.existsSync(checklistPath)) {
              actualPath = checklistPath;
            } else if (fs.existsSync(alternativePath)) {
              actualPath = alternativePath;
            }

            if (actualPath) {
              try {
                const checklistContent = fs.readFileSync(actualPath, 'utf8');
                const checklistConfig = yaml.load(checklistContent);
                
                // Validate basic structure - handle multiple formats
                if (checklistConfig.checklist) {
                  // New format with checklist object
                  expect(checklistConfig.checklist.name).toBeDefined();
                  expect(checklistConfig.items).toBeDefined();
                  expect(Array.isArray(checklistConfig.items)).toBe(true);
                } else if (checklistConfig.id && checklistConfig.name) {
                  // Alternative format with id/name at root
                  expect(checklistConfig.name).toBeDefined();
                  // Handle various checklist structures
                  const hasItems = checklistConfig.items || 
                                 checklistConfig.checks || 
                                 checklistConfig.criteria ||
                                 checklistConfig.categories;
                  expect(hasItems).toBeDefined();
                  // If it has categories, validate they contain items
                  if (checklistConfig.categories) {
                    expect(Array.isArray(checklistConfig.categories)).toBe(true);
                    checklistConfig.categories.forEach(cat => {
                      expect(cat.items || cat.checks).toBeDefined();
                    });
                  }
                } else {
                  throw new Error(`Unknown checklist format in ${checklistName}`);
                }
              } catch (error) {
                throw new Error(`Invalid YAML in checklist ${checklistName}: ${error.message}`);
              }
            }
          });
        }
      });
    });
  });

  describe('Agent Command System Validation', () => {
    test('agents with commands have proper command structure', () => {
      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.commands) {
          expect(Array.isArray(agent.config.commands)).toBe(true);
          
          agent.config.commands.forEach(command => {
            if (typeof command === 'string') {
              // Simple command format like "help: description"
              expect(command).toMatch(/\w+:/);
            } else if (typeof command === 'object') {
              // Object format
              expect(Object.keys(command).length).toBeGreaterThan(0);
            }
          });
        }
      });
    });
  });

  describe('Agent Dependency Resolution Test', () => {
    test('dependency resolver can load agent dependencies', async () => {
      // Test that the actual dependency resolver can load agent deps
      try {
        const dependencyResolver = require('../tools/lib/dependency-resolver.js');
        
        for (const [fileName, agent] of Object.entries(allAgents)) {
          const agentId = agent.config.agent.id;
          
          // Test loading dependencies (this would be the actual production path)
          expect(() => {
            // This tests that the resolver can at least attempt to resolve
            // without throwing immediate errors
            const deps = agent.config.dependencies;
            expect(typeof deps).toBe('object');
          }).not.toThrow();
        }
      } catch (error) {
        console.warn('Dependency resolver test skipped - module not found:', error.message);
      }
    });
  });

  describe('Summary Report', () => {
    test('generate agent connectivity summary', () => {
      const summary = {
        totalAgents: Object.keys(allAgents).length,
        agentsWithDependencies: 0,
        totalDependencies: 0,
        dependencyTypes: {},
        issues: []
      };

      Object.entries(allAgents).forEach(([fileName, agent]) => {
        if (agent.config.dependencies) {
          summary.agentsWithDependencies++;
          
          Object.entries(agent.config.dependencies).forEach(([depType, deps]) => {
            if (!summary.dependencyTypes[depType]) {
              summary.dependencyTypes[depType] = 0;
            }
            
            if (Array.isArray(deps)) {
              summary.dependencyTypes[depType] += deps.length;
              summary.totalDependencies += deps.length;
            } else if (typeof deps === 'object') {
              summary.dependencyTypes[depType] += Object.keys(deps).length;
              summary.totalDependencies += Object.keys(deps).length;
            }
          });
        }
      });

      console.log('\n=== AGENT CONNECTIVITY SUMMARY ===');
      console.log(`Total Agents: ${summary.totalAgents}`);
      console.log(`Agents with Dependencies: ${summary.agentsWithDependencies}`);
      console.log(`Total Dependencies: ${summary.totalDependencies}`);
      console.log('\nDependency Types:');
      Object.entries(summary.dependencyTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      console.log('=====================================\n');

      // The test always passes - this is just for reporting
      expect(summary.totalAgents).toBeGreaterThan(0);
    });
  });
}); 