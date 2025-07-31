#!/usr/bin/env node

/**
 * Script to update all structured tasks with unified memory management
 * Adds load-memory actions at the beginning and save-and-clean-memory actions at the end
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const STRUCTURED_TASKS_DIR = path.join(__dirname, '..', 'bmad-core', 'structured-tasks');

// Tasks that should be skipped (already updated or don't need memory)
const SKIP_TASKS = [
  'load-memory-action.yaml',
  'save-and-clean-memory-action.yaml',
  'manage-memory.yaml',
  'update-working-memory.yaml',
  'create-next-story.yaml', // Already updated
  'review-story.yaml'       // Already updated
];

// Agent mapping based on task names
const AGENT_MAPPING = {
  'create-next-story': 'sm',
  'review-story': 'qa', 
  'validate-next-story': 'qa',
  'address-qa-feedback': 'dev',
  'qa-dev-handoff': 'qa',
  'brownfield-create-epic': 'pm',
  'brownfield-create-story': 'sm',
  'create-brownfield-story': 'sm',
  'document-project': 'analyst',
  'shard-doc': 'analyst',
  'facilitate-brainstorming-session': 'pm',
  'generate-ai-frontend-prompt': 'architect',
  'generate-datamodel-tests': 'dev',
  'execute-checklist': 'qa',
  'validate-story-contract': 'qa',
  'check-dependencies-before-commit': 'dev',
  'analyze-dependency-impacts-qa': 'qa'
};

function getAgentForTask(taskId) {
  return AGENT_MAPPING[taskId] || 'generic';
}

function getTaskTypeFromId(taskId) {
  if (taskId.includes('story')) return 'story-management';
  if (taskId.includes('review') || taskId.includes('validate')) return 'quality-assurance';
  if (taskId.includes('create') || taskId.includes('generate')) return 'content-creation';
  if (taskId.includes('epic')) return 'epic-management';
  if (taskId.includes('doc')) return 'documentation';
  if (taskId.includes('test')) return 'testing';
  if (taskId.includes('dev') || taskId.includes('implement')) return 'development';
  return 'general';
}

function createMemoryLoadStep(taskId) {
  const agent = getAgentForTask(taskId);
  const taskType = getTaskTypeFromId(taskId);
  
  return {
    id: 'load-memory',
    name: 'Load Memory and Initialize Context',
    description: 'Load agent working memory and relevant long-term context using unified memory system',
    actions: [
      {
        description: 'Load agent working memory and relevant long-term context',
        elicit: false,
        function: 'loadMemoryForTask',
        parameters: {
          agentName: agent,
          context: {
            taskId: taskId,
            taskType: taskType
          }
        },
        metadata: {
          memoryAction: true,
          executionOrder: 'first'
        }
      },
      {
        description: 'Apply memory context to task execution planning',
        elicit: false,
        metadata: {
          memoryAction: true,
          executionOrder: 'after-load'
        }
      }
    ]
  };
}

function createMemorySaveStep(taskId) {
  const agent = getAgentForTask(taskId);
  const taskType = getTaskTypeFromId(taskId);
  
  return {
    id: 'save-memory',
    name: 'Save Task Results and Clean Memory', 
    description: 'Save task completion and findings to memory with hygiene cleanup',
    actions: [
      {
        description: 'Save task completion and findings to working memory',
        elicit: false,
        function: 'saveAndCleanMemory',
        parameters: {
          agentName: agent,
          taskData: {
            observation: `Completed ${taskId} task successfully`,
            significantFinding: `{{TASK_SIGNIFICANT_FINDING}}`,
            taskCompleted: true,
            taskId: taskId,
            context: {
              taskType: taskType
            }
          }
        },
        metadata: {
          memoryAction: true,
          executionOrder: 'last'
        }
      }
    ]
  };
}

async function updateTaskFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const task = yaml.load(content);
    
    if (!task || !task.id || !task.steps) {
      console.warn(`Skipping ${path.basename(filePath)}: Invalid task structure`);
      return false;
    }
    
    console.log(`Updating task: ${task.id}`);
    
    // Check if already has memory actions
    const hasMemoryLoad = task.steps.some(step => 
      step.actions && step.actions.some(action => 
        action.function === 'loadMemoryForTask' || action.description?.includes('Load agent working memory')
      )
    );
    
    const hasMemorySave = task.steps.some(step =>
      step.actions && step.actions.some(action =>
        action.function === 'saveAndCleanMemory' || action.description?.includes('Save task completion')
      )
    );
    
    let modified = false;
    
    // Add memory load step at the beginning if not present
    if (!hasMemoryLoad) {
      const memoryLoadStep = createMemoryLoadStep(task.id);
      task.steps.unshift(memoryLoadStep);
      modified = true;
      console.log(`  ✓ Added memory load step`);
    }
    
    // Add memory save step at the end if not present
    if (!hasMemorySave) {
      const memorySaveStep = createMemorySaveStep(task.id);
      task.steps.push(memorySaveStep);
      modified = true;
      console.log(`  ✓ Added memory save step`);
    }
    
    if (modified) {
      // Write back to file
      const updatedContent = yaml.dump(task, { 
        lineWidth: -1, 
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });
      await fs.writeFile(filePath, updatedContent, 'utf8');
      console.log(`  ✓ Updated ${path.basename(filePath)}`);
    } else {
      console.log(`  - Already has memory actions, skipping`);
    }
    
    return modified;
  } catch (error) {
    console.error(`Error updating ${path.basename(filePath)}:`, error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('Updating structured tasks with unified memory management...\n');
    
    const files = await fs.readdir(STRUCTURED_TASKS_DIR);
    const yamlFiles = files.filter(file => 
      file.endsWith('.yaml') && !SKIP_TASKS.includes(file)
    );
    
    console.log(`Found ${yamlFiles.length} task files to process\n`);
    
    let updatedCount = 0;
    
    for (const file of yamlFiles) {
      const filePath = path.join(STRUCTURED_TASKS_DIR, file);
      const wasUpdated = await updateTaskFile(filePath);
      if (wasUpdated) {
        updatedCount++;
      }
    }
    
    console.log(`\n✅ Processing complete!`);
    console.log(`   Updated: ${updatedCount} files`);
    console.log(`   Skipped: ${yamlFiles.length - updatedCount} files (already had memory actions)`);
    console.log(`   Total processed: ${yamlFiles.length} files`);
    
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateTaskFile, createMemoryLoadStep, createMemorySaveStep };