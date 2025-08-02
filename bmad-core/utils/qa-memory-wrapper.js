#!/usr/bin/env node

/**
 * QA Memory Wrapper - Simplified memory operations for QA agent
 * 
 * This wrapper provides easy-to-use memory functions that the QA agent
 * can call during activation and review processes.
 */

const {
    initializeWorkingMemory,
    loadWorkingMemory,
    updateWorkingMemory,
    retrieveRelevantMemories,
    saveToLongTermMemory,
    persistObservation,
    persistDecision,
    persistKeyFact
} = require('./agent-memory-manager');

const { closeConnections } = require('./qdrant');

const {
    logMemoryInit,
    logWorkingMemory,
    logLongTermMemory,
    logMemoryRetrieval,
    logContextValidation,
    logMemoryError
} = require('./memory-usage-logger');

/**
 * Initialize QA agent memory
 */
async function initQAMemory() {
    try {
        await logMemoryInit('qa', 'activation_start');
        const memory = await initializeWorkingMemory('qa');
        await logMemoryInit('qa', 'activation_complete', { 
            sessionId: memory.sessionId,
            hasExistingMemory: !!memory.observations?.length 
        });
        console.log('QA memory initialized successfully');
        return memory;
    } catch (error) {
        console.error('Failed to initialize QA memory:', error.message);
        await logMemoryError('qa', 'init_failed', error);
        process.exit(1);
    }
}

/**
 * Load and retrieve relevant QA patterns
 */
async function loadQAPatterns(query = 'code quality review patterns') {
    try {
        await logMemoryRetrieval('qa', 'patterns_search_start', query, 0, {});
        const memories = await retrieveRelevantMemories('qa', query, { topN: 10 });
        await logMemoryRetrieval('qa', 'patterns_search_complete', query, memories.combined.length, {});
        
        // Format for display
        if (memories.combined.length > 0) {
            console.log(`Found ${memories.combined.length} relevant patterns`);
            memories.combined.forEach((memory, index) => {
                console.log(`\n[${index + 1}] ${memory.type}: ${memory.content || memory.observation || memory.decision}`);
            });
        } else {
            console.log('No previous QA patterns found - starting fresh');
        }
        
        return memories;
    } catch (error) {
        console.error('Failed to load QA patterns:', error.message);
        return { combined: [] };
    }
}

/**
 * Save QA review findings
 */
async function saveQAFindings(findings) {
    try {
        await logWorkingMemory('qa', 'save_findings_start', 'review', findings);
        
        // Update working memory
        await updateWorkingMemory('qa', {
            observation: findings.summary,
            keyFact: {
                key: `review_${findings.storyId}`,
                content: findings
            }
        });
        
        // Save important patterns to long-term memory
        if (findings.patterns && findings.patterns.length > 0) {
            for (const pattern of findings.patterns) {
                await saveToLongTermMemory('qa', {
                    content: pattern,
                    memoryType: 'qa-pattern',
                    metadata: {
                        storyId: findings.storyId,
                        severity: pattern.severity || 'medium'
                    }
                });
            }
        }
        
        await logWorkingMemory('qa', 'save_findings_complete', 'review', { 
            storyId: findings.storyId,
            patternCount: findings.patterns?.length || 0 
        });
        
        console.log('QA findings saved successfully');
    } catch (error) {
        console.error('Failed to save QA findings:', error.message);
    }
}

/**
 * Validate QA context
 */
async function validateQAContext() {
    try {
        const memory = await loadWorkingMemory('qa');
        const hasSufficientContext = !!(memory && memory.currentContext?.storyId);
        
        await logContextValidation('qa', 'validate_context', 'story_context', hasSufficientContext, {
            hasMemory: !!memory,
            hasStoryContext: !!memory?.currentContext?.storyId
        });
        
        if (hasSufficientContext) {
            console.log('QA context validation: Sufficient');
        } else {
            console.log('QA context validation: Need story assignment');
        }
        
        return hasSufficientContext;
    } catch (error) {
        console.error('Failed to validate context:', error.message);
        return false;
    }
}

// Command-line interface
if (require.main === module) {
    const command = process.argv[2];
    
    async function runCommand() {
        try {
            switch (command) {
                case 'init':
                    await initQAMemory();
                    break;
                    
                case 'load-patterns':
                    const query = process.argv[3] || 'code quality review patterns';
                    await loadQAPatterns(query);
                    break;
                    
                case 'save-findings':
                    const findings = process.argv[3] ? JSON.parse(process.argv[3]) : {
                        summary: 'Test findings',
                        storyId: 'TEST-001',
                        patterns: ['Test pattern']
                    };
                    await saveQAFindings(findings);
                    break;
                    
                case 'validate-context':
                    await validateQAContext();
                    break;
                    
                default:
                    console.log('QA Memory Wrapper - Available commands:');
                    console.log('  init              - Initialize QA memory');
                    console.log('  load-patterns     - Load relevant QA patterns');
                    console.log('  save-findings     - Save QA review findings');
                    console.log('  validate-context  - Validate QA context');
                    process.exit(0);
            }
            
            // Close connections and ensure clean exit
            await closeConnections();
            setTimeout(() => process.exit(0), 100);
        } catch (error) {
            console.error(`Command failed: ${error.message}`);
            await closeConnections();
            process.exit(1);
        }
    }
    
    runCommand();
}

module.exports = {
    initQAMemory,
    loadQAPatterns,
    saveQAFindings,
    validateQAContext
};