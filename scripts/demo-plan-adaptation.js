#!/usr/bin/env node
/**
 * Demo: Show dynamic planner behavior before vs after rule changes.
 * - Temporarily writes a "before" version of dynamic-plan-rules.yaml
 * - Loads planner and runs planAdaptation on a sample task
 * - Restores original rules and runs again
 */
const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '..', 'bmad-core', 'structured-tasks', 'dynamic-plan-rules.yaml');
const PLANNER_PATH = path.join(__dirname, '..', 'bmad-core', 'tools', 'dynamic-planner.js');

function loadPlannerFresh() {
  delete require.cache[require.resolve(PLANNER_PATH)];
  return require(PLANNER_PATH);
}

function runScenario(planner, label) {
  // Sample task with 4 steps (below 5), multi-domain terms, and long text
  const task = {
    title: 'Implement feature touching backend and devops then update docs',
    description: 'Add API endpoint and configure CI then update documentation. Also includes async processing and awaits external service.',
    steps: [
      { name: 'Design API', description: 'Define backend API and data model' },
      { name: 'Implement endpoint', description: 'Implement backend controller and service; depends on data model' },
      { name: 'CI config', description: 'Update devops CI pipeline; requires secrets and infrastructure changes' },
      { name: 'Docs', description: 'Update documentation and README then add examples' }
    ]
  };

  const memory = { taskId: 'demo', plan: [], subTasks: [] };
  const tokenCount = 3000; // exceed default 2000 threshold
  const before = Date.now();
  const adapted = planner.planAdaptation(memory, task, { tokenCount });
  const after = Date.now();

  console.log(`\n=== ${label} ===`);
  console.log(`Sub-tasks created: ${adapted.subTasks?.length || 0}`);
  if (adapted.subTasks?.length) {
    console.log('Sub-task titles:');
    adapted.subTasks.forEach((st, i) => console.log(`  ${i + 1}. ${st.title} (steps: ${st.steps.length})`));
  }
  console.log(`Elapsed: ${after - before}ms`);
}

function main() {
  const original = fs.readFileSync(RULES_PATH, 'utf8');

  // BEFORE rules: maxSteps=5, default domains only
  const beforeRules = original
    .replace(/maxSteps:\s*\d+/g, 'maxSteps: 5')
    .replace(/domains:\s*\[[^\]]+\]/g, 'domains: ["frontend", "backend", "database", "infrastructure", "testing"]');

  // Write BEFORE, run
  fs.writeFileSync(RULES_PATH, beforeRules, 'utf8');
  let planner = loadPlannerFresh();
  runScenario(planner, 'BEFORE (maxSteps=5, narrow domains)');

  // Restore AFTER (original), run
  fs.writeFileSync(RULES_PATH, original, 'utf8');
  planner = loadPlannerFresh();
  runScenario(planner, 'AFTER (maxSteps per file, expanded domains)');
}

main();

