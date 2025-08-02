#!/usr/bin/env node

/**
 * Test script to verify memory logging is working
 */

const path = require('path');

// Test in the current directory
process.chdir(__dirname);

// Load the memory logger
const memoryLogger = require('./bmad-core/utils/memory-usage-logger');

async function testMemoryLogging() {
    console.log('Testing memory logging functionality...\n');
    
    try {
        // Test 1: Initialize memory
        console.log('1. Testing memory initialization logging...');
        await memoryLogger.logMemoryInit('test-agent', 'test_init', {
            sessionId: '12345',
            testMode: true
        });
        console.log('✓ Memory init logged');
        
        // Test 2: Working memory update
        console.log('\n2. Testing working memory logging...');
        await memoryLogger.logWorkingMemory('test-agent', 'update_observation', 'test_observation', {
            observation: 'This is a test observation',
            context: { storyId: 'TEST-001' }
        });
        console.log('✓ Working memory update logged');
        
        // Test 3: Long-term memory save
        console.log('\n3. Testing long-term memory logging...');
        await memoryLogger.logLongTermMemory('test-agent', 'save_pattern', {
            pattern: 'test-pattern',
            description: 'Test pattern for memory logging'
        });
        console.log('✓ Long-term memory save logged');
        
        // Test 4: Memory retrieval
        console.log('\n4. Testing memory retrieval logging...');
        await memoryLogger.logMemoryRetrieval('test-agent', 'search_context', {
            query: 'test query',
            results: 3
        });
        console.log('✓ Memory retrieval logged');
        
        // Test 5: Error logging
        console.log('\n5. Testing error logging...');
        await memoryLogger.logMemoryError('test-agent', 'test_operation', new Error('Test error'));
        console.log('✓ Error logged');
        
        // Test 6: Get statistics
        console.log('\n6. Testing memory usage statistics...');
        const stats = await memoryLogger.getMemoryUsageStats(1);
        console.log('✓ Statistics retrieved:');
        console.log(`  - Total operations: ${stats.totalOperations}`);
        console.log(`  - Test agent operations: ${stats.byAgent['test-agent'] || 0}`);
        console.log(`  - Error count: ${stats.errors.length}`);
        
        console.log('\n✅ All memory logging tests passed!');
        console.log(`\n📁 Check the log file at: ${path.join(process.cwd(), '.ai', 'memory-usage.log')}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the tests
testMemoryLogging();