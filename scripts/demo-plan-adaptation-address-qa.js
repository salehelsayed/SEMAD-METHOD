#!/usr/bin/env node
/**
 * Demo: Show dynamic planner behavior on the real address-qa-feedback task
 * before vs after rule changes.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RULES_PATH = path.join(__dirname, '..', 'bmad-core', 'structured-tasks', 'dynamic-plan-rules.yaml');
const TASK_PATH = path.join(__dirname, '..', 'bmad-core', 'structured-tasks', 'address-qa-feedback.yaml');
const PLANNER_PATH = path.join(__dirname, '..', 'bmad-core', 'tools', 'dynamic-planner.js');

function loadPlannerFresh() {
  delete require.cache[require.resolve(PLANNER_PATH)];
  return require(PLANNER_PATH);
}

function loadTask() {
  const raw = fs.readFileSync(TASK_PATH, 'utf8');
  const data = yaml.load(raw);
  // Normalize to expected shape
  const task = {
    title: data.name || data.id || 'address-qa-feedback',
    description: data.purpose || data.description || '',
    steps: Array.isArray(data.steps) ? data.steps : []
  };
  return task;
}

function estimateTokens(task) {
  let text = `${task.title} ${task.description}`;
  for (const step of task.steps) {
    if (step.name) text += ` ${step.name}`;
    if (step.description) text += ` ${step.description}`;
    if (Array.isArray(step.actions)) {
      for (const a of step.actions) {
        if (a && typeof a.description === 'string') text += ` ${a.description}`;
      }
    }
  }
  return Math.ceil(text.length / 4);
}

function runScenario(planner, label, task) {
  const memory = { taskId: 'address-qa-feedback', plan: [], subTasks: [] };
  const tokenCount = estimateTokens(task);
  const adapted = planner.planAdaptation({ ...memory }, task, { tokenCount });

  console.log(`\n=== ${label} ===`);
  console.log(`Token estimate: ${tokenCount}`);
  console.log(`Total steps: ${task.steps.length}`);
  const count = adapted.subTasks?.length || 0;
  console.log(`Sub-tasks created: ${count}`);
  if (count) {
    adapted.subTasks.forEach((st, i) => {
      console.log(`  ${i + 1}. ${st.title} (steps: ${st.steps.length})`);
    });
  }
}

function main() {
  const originalRules = fs.readFileSync(RULES_PATH, 'utf8');
  const beforeRules = originalRules
    .replace(/maxSteps:\s*\d+/g, 'maxSteps: 5')
    .replace(/domains:\s*\[[^\]]+\]/g, 'domains: ["frontend", "backend", "database", "infrastructure", "testing"]');

  const task = loadTask();

  // BEFORE
  fs.writeFileSync(RULES_PATH, beforeRules, 'utf8');
  let planner = loadPlannerFresh();
  console.log(`Dynamic planner loaded with BEFORE rules`);
  runScenario(planner, 'BEFORE (maxSteps=5, narrow domains)', task);

  // AFTER
  fs.writeFileSync(RULES_PATH, originalRules, 'utf8');
  planner = loadPlannerFresh();
  console.log(`Dynamic planner loaded with AFTER rules`);
  runScenario(planner, 'AFTER (maxSteps from file, expanded domains)', task);
}

main();

