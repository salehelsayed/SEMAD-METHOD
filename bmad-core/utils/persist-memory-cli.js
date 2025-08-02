#!/usr/bin/env node

/**
 * CLI wrapper for memory persistence functions
 * Allows agents to persist memory through command-line execution
 */

const {
    persistObservation,
    persistDecision,
    persistBlocker,
    persistKeyFact,
    loadWorkingMemory
} = require('./agent-memory-manager');

const { closeConnections, storeContextualMemory } = require('./qdrant');

// Parse command line arguments
const [,, command, agentName, ...args] = process.argv;

async function main() {
    try {
        if (!command || !agentName) {
            console.error('Usage: persist-memory-cli.js <command> <agentName> [args...]');
            console.error('Commands:');
            console.error('  observation <agentName> <observation>');
            console.error('  decision <agentName> <decision> <rationale>');
            console.error('  blocker <agentName> <blocker>');
            console.error('  keyfact <agentName> <fact>');
            console.error('  implementation <agentName> <implementation>');
            console.error('  show <agentName>');
            process.exit(1);
        }

        switch (command) {
            case 'observation':
                const observation = args.join(' ');
                if (!observation) {
                    console.error('Error: observation text required');
                    process.exit(1);
                }
                await persistObservation(agentName, observation);
                console.log(`✓ Observation persisted for ${agentName}`);
                // Small delay to prevent lock conflicts
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'decision':
                const decision = args[0];
                const rationale = args.slice(1).join(' ') || '';
                if (!decision) {
                    console.error('Error: decision text required');
                    process.exit(1);
                }
                await persistDecision(agentName, decision, rationale);
                console.log(`✓ Decision persisted for ${agentName}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'blocker':
                const blocker = args.join(' ');
                if (!blocker) {
                    console.error('Error: blocker text required');
                    process.exit(1);
                }
                await persistBlocker(agentName, blocker);
                console.log(`✓ Blocker persisted for ${agentName}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'keyfact':
                const fact = args.join(' ');
                if (!fact) {
                    console.error('Error: key fact text required');
                    process.exit(1);
                }
                const factKey = await persistKeyFact(agentName, fact);
                console.log(`✓ Key fact persisted for ${agentName} with key: ${factKey}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'show':
                const memory = await loadWorkingMemory(agentName);
                console.log(JSON.stringify(memory, null, 2));
                break;

            case 'implementation':
                const implementation = args.join(' ');
                if (!implementation) {
                    console.error('Error: implementation text required');
                    process.exit(1);
                }
                await storeContextualMemory(agentName, implementation, {
                    type: 'implementation',
                    timestamp: new Date().toISOString()
                });
                console.log(`✓ Implementation stored for ${agentName}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }

        await closeConnections();
        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        await closeConnections();
        process.exit(1);
    }
}

main();