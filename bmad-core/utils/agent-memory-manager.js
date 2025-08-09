/**
 * Agent Memory Manager (stub)
 * This module is intentionally minimal so Jest can auto-mock it.
 * Tests call jest.mock(...) and then configure the mocked functions.
 */

async function loadWorkingMemory() {}
async function initializeWorkingMemory() {}
async function retrieveRelevantMemories() {}
async function updateWorkingMemory() {}
async function storeMemorySnippetWithContext() {}
async function archiveTaskMemory() {}
async function getMemorySummary() {}

module.exports = {
  loadWorkingMemory,
  initializeWorkingMemory,
  retrieveRelevantMemories,
  updateWorkingMemory,
  storeMemorySnippetWithContext,
  archiveTaskMemory,
  getMemorySummary
};

