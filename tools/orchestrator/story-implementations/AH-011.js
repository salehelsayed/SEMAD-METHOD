#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// AH-011: Concurrency Control
async function execute() {
  console.log('[AH-011] Implementing Advanced Concurrency Control with File Locking...');
  
  // The main locks.js implementation is already created at tools/orchestrator/locks.js
  // This story implementation validates the integration and creates demonstration
  
  const locksPath = path.join(__dirname, '..', 'locks.js');
  const { lockManager } = require(locksPath);
  
  try {
    // Test the lock manager functionality
    console.log('[AH-011] Testing lock manager functionality...');
    
    // Test acquire and release
    const testFile = path.join(__dirname, '..', '..', '..', '.ai', 'test-lock-file.tmp');
    
    // Ensure test file exists
    await fs.writeFile(testFile, 'test content for locking');
    
    // Test lock acquisition
    const lock = await lockManager.acquire(testFile, 'AH-011-test');
    console.log('[AH-011] ✓ Lock acquisition test passed');
    
    // Test status
    const status = await lockManager.status();
    console.log(`[AH-011] ✓ Status check passed - ${status.totalLocks} active locks`);
    
    // Test release
    await lockManager.release(testFile, 'AH-011-test');
    console.log('[AH-011] ✓ Lock release test passed');
    
    // Cleanup test file
    await fs.unlink(testFile).catch(() => {});
    
    // Create integration documentation
    const docsDir = path.join(__dirname, '..', '..', '..', 'docs', 'concurrency');
    await fs.mkdir(docsDir, { recursive: true });
    
    const integrationDoc = `# Concurrency Control Integration (AH-011)

## Overview

The orchestrator now includes atomic file locking to prevent concurrent modifications during patch operations.

## Key Components

### LockManager (\`tools/orchestrator/locks.js\`)

Provides three main functions:
- \`acquire(path, storyId)\` - Acquire exclusive lock on file
- \`release(path, storyId)\` - Release lock on file  
- \`status()\` - Get current lock status

### Lock Storage

- **Lock Files**: \`.ai/locks/<hashed-path>.lock\`
- **Lock State**: \`.ai/progress/locks.json\`
- **Atomic Operations**: Uses temp files + rename for atomic lock creation

### Integration Points

The lock manager integrates with:
1. **Patch Apply Operations** - All file modifications are wrapped with locks
2. **Story Execution** - Each story gets exclusive access to its target files
3. **Cleanup** - Automatic lock cleanup on story completion/failure

## Usage Examples

\`\`\`bash
# Acquire lock via CLI
node tools/orchestrator/locks.js acquire src/example.js AH-011

# Check lock status
node tools/orchestrator/locks.js status

# Release lock
node tools/orchestrator/locks.js release src/example.js AH-011

# Cleanup all locks for a story
node tools/orchestrator/locks.js cleanup AH-011
\`\`\`

## Programmatic Usage

\`\`\`javascript
const { lockManager } = require('./tools/orchestrator/locks.js');

// In patch apply operations
async function applyPatchWithLocking(filePath, storyId, patchContent) {
  const lock = await lockManager.acquire(filePath, storyId);
  try {
    // Apply patch safely
    await fs.writeFile(filePath, patchContent);
    console.log('Patch applied successfully');
  } finally {
    await lockManager.release(filePath, storyId);
  }
}
\`\`\`

## Error Handling

- **Lock Conflicts**: Thrown when file is already locked by another story
- **Stale Locks**: Automatically cleaned up after timeout (default: 30s)
- **Graceful Degradation**: Failed lock operations don't crash the orchestrator

## Monitoring

The lock manager provides comprehensive status including:
- Active locks with timestamps
- Lock ownership by story ID
- Stale lock detection and cleanup
- Persistent state tracking
`;

    await fs.writeFile(path.join(docsDir, 'concurrency-integration.md'), integrationDoc);
    
    console.log('[AH-011] ✓ Created integration documentation');
    console.log('[AH-011] ✓ Concurrency Control implementation complete');
    
  } catch (error) {
    console.error('[AH-011] ✗ Implementation failed:', error.message);
    throw error;
  }
}

module.exports = { execute };