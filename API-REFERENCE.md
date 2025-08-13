# SEMAD-METHOD API Reference

## Overview

This document provides a comprehensive API reference for SEMAD-METHOD's programmatic interfaces, utilities, and core modules.

## Core Modules

### SimpleTaskTracker

**Location**: `bmad-core/utils/simple-task-tracker.js`

**Purpose**: Lightweight in-memory task tracking for agent workflows

#### Constructor
```javascript
const tracker = new SimpleTaskTracker(options);
```

**Parameters**:
- `options` (Object):
  - `projectName` (String): Project identifier
  - `workflowType` (String): 'linear' | 'iterative' | 'parallel'
  - `persistPath` (String): Path for persistence (default: '.ai/progress/')

#### Methods

##### `init(config)`
Initialize the tracker with configuration
```javascript
tracker.init({
  project: 'my-project',
  workflow: 'iterative',
  phase: 'development'
});
```

##### `startTask(taskId, description)`
Begin tracking a new task
```javascript
tracker.startTask('AUTH-001', 'Implement authentication');
```

##### `updateProgress(taskId, percentage)`
Update task progress
```javascript
tracker.updateProgress('AUTH-001', 75);
```

##### `completeTask(taskId, results)`
Mark task as complete
```javascript
tracker.completeTask('AUTH-001', {
  filesModified: ['auth.js', 'login.jsx'],
  testsAdded: 5
});
```

##### `getStatus()`
Get current tracker status
```javascript
const status = tracker.getStatus();
// Returns: { active: [...], completed: [...], pending: [...] }
```

##### `persist()`
Save current state to filesystem
```javascript
await tracker.persist();
```

---

### ProgressLogger

**Location**: `bmad-core/utils/track-progress.js`

**Purpose**: Persistent observation and decision logging

#### Constructor
```javascript
const logger = new ProgressLogger(options);
```

**Parameters**:
- `options` (Object):
  - `logPath` (String): Path for logs (default: '.ai/observations/')
  - `agent` (String): Agent identifier
  - `rotateDaily` (Boolean): Create daily log files

#### Methods

##### `observe(observation)`
Record an observation
```javascript
logger.observe({
  action: 'technology-choice',
  decision: 'PostgreSQL',
  rationale: 'ACID compliance required',
  impact: 'high'
});
```

##### `logDecision(decision)`
Log a specific decision
```javascript
logger.logDecision({
  type: 'architecture',
  choice: 'microservices',
  alternatives: ['monolith', 'serverless'],
  factors: ['scalability', 'team-size']
});
```

##### `getObservations(filter)`
Retrieve observations
```javascript
const observations = logger.getObservations({
  agent: 'developer',
  date: '2024-01-20',
  type: 'decision'
});
```

---

### StoryContractValidator

**Location**: `bmad-core/utils/story-contract-validator.js`

**Purpose**: Validate story contracts against schema

#### Methods

##### `validate(contract)`
Validate a story contract
```javascript
const validator = new StoryContractValidator();
const result = validator.validate(storyContract);
// Returns: { valid: boolean, errors: [...] }
```

##### `validateRequirements(requirements)`
Validate requirement format
```javascript
const valid = validator.validateRequirements({
  functional: ['FR001', 'FR002'],
  technical: ['TR001']
});
```

##### `checkCompleteness(contract, implementation)`
Check if implementation fulfills contract
```javascript
const complete = validator.checkCompleteness(
  storyContract,
  implementationFiles
);
```

---

### DynamicPlanner

**Location**: `bmad-core/tools/dynamic-planner.js`

**Purpose**: Automatic task decomposition for complex operations

#### Methods

##### `analyzePlan(plan)`
Analyze plan complexity
```javascript
const planner = new DynamicPlanner();
const analysis = planner.analyzePlan(projectPlan);
// Returns: { complexity: number, tasks: number, risk: 'low'|'medium'|'high' }
```

##### `decompose(plan, options)`
Break down complex plan
```javascript
const decomposed = planner.decompose(plan, {
  maxTaskSize: 5,
  prioritize: true
});
// Returns: Array of smaller task groups
```

##### `shouldAdapt(metrics)`
Check if adaptation needed
```javascript
const shouldAdapt = planner.shouldAdapt({
  taskCount: 10,
  fileCount: 15,
  complexity: 8
});
// Returns: boolean
```

---

### SearchToolsGenerator

**Location**: `scripts/generate-search-tools.js`

**Purpose**: Generate search queries from PRD

#### Methods

##### `extractKeywords(prd)`
Extract domain keywords from PRD
```javascript
const generator = new SearchToolsGenerator();
const keywords = generator.extractKeywords(prdContent);
// Returns: ['react', 'authentication', 'jwt', ...]
```

##### `generateQueries(keywords, options)`
Create search queries
```javascript
const queries = generator.generateQueries(keywords, {
  providers: ['github', 'npm', 'stackoverflow'],
  limit: 10
});
```

##### `createSearchConfig(prd, output)`
Generate complete search configuration
```javascript
await generator.createSearchConfig(
  'docs/prd.md',
  'outputs/search-tools.yaml'
);
```

---

## Validation APIs

### SchemaValidator

**Location**: `bmad-core/utils/schema-validator.js`

#### Methods

##### `validateTask(task)`
Validate task against schema
```javascript
const validator = new SchemaValidator();
const result = validator.validateTask(taskDefinition);
// Returns: { valid: boolean, errors: [...] }
```

##### `validateStory(story)`
Validate story structure
```javascript
const result = validator.validateStory(storyContent);
```

##### `validateAgent(agent)`
Validate agent configuration
```javascript
const result = validator.validateAgent(agentConfig);
```

---

## Workflow APIs

### WorkflowManager

**Location**: `bmad-core/utils/workflow-manager.js`

#### Methods

##### `createWorkflow(config)`
Create new workflow instance
```javascript
const manager = new WorkflowManager();
const workflow = manager.createWorkflow({
  type: 'iterative',
  phases: ['planning', 'development'],
  agents: ['analyst', 'pm', 'architect', 'dev', 'qa']
});
```

##### `transitionPhase(from, to)`
Transition between phases
```javascript
const success = await workflow.transitionPhase('planning', 'development');
```

##### `getCurrentPhase()`
Get current workflow phase
```javascript
const phase = workflow.getCurrentPhase();
// Returns: { name: 'development', status: 'active', progress: 60 }
```

---

## Agent APIs

### AgentManager

**Location**: `bmad-core/utils/agent-manager.js`

#### Methods

##### `loadAgent(name)`
Load agent configuration
```javascript
const manager = new AgentManager();
const agent = await manager.loadAgent('developer');
```

##### `activateAgent(name, context)`
Activate an agent with context
```javascript
const session = await manager.activateAgent('developer', {
  story: 'AUTH-001',
  workspace: './src'
});
```

##### `getAgentStatus(name)`
Get agent status
```javascript
const status = manager.getAgentStatus('developer');
// Returns: { active: boolean, currentTask: '...', progress: 50 }
```

---

## Template APIs

### TemplateEngine

**Location**: `bmad-core/utils/template-engine.js`

#### Methods

##### `loadTemplate(name)`
Load a template
```javascript
const engine = new TemplateEngine();
const template = await engine.loadTemplate('story-template');
```

##### `render(template, data)`
Render template with data
```javascript
const rendered = engine.render(template, {
  storyId: 'AUTH-001',
  title: 'User Authentication',
  requirements: [...]
});
```

##### `validateTemplate(template)`
Validate template syntax
```javascript
const valid = engine.validateTemplate(templateContent);
```

---

## Build APIs

### BundleBuilder

**Location**: `tools/builders/bundle-builder.js`

#### Methods

##### `buildAgent(agentName, options)`
Build agent bundle
```javascript
const builder = new BundleBuilder();
await builder.buildAgent('developer', {
  output: 'dist/agents/',
  includeDeps: true
});
```

##### `buildTeam(teamName, options)`
Build team bundle
```javascript
await builder.buildTeam('fullstack', {
  output: 'dist/teams/',
  minify: true
});
```

##### `buildExpansion(packName, options)`
Build expansion pack
```javascript
await builder.buildExpansion('game-dev', {
  output: 'dist/expansions/'
});
```

---

## Configuration APIs

### ConfigManager

**Location**: `bmad-core/utils/config-manager.js`

#### Methods

##### `loadConfig(path)`
Load configuration file
```javascript
const config = new ConfigManager();
const settings = await config.loadConfig('.bmad-config.yaml');
```

##### `updateConfig(key, value)`
Update configuration value
```javascript
config.updateConfig('workflow.type', 'iterative');
```

##### `validateConfig(config)`
Validate configuration
```javascript
const valid = config.validateConfig(settings);
```

---

## File System APIs

### FileManager

**Location**: `bmad-core/utils/file-manager.js`

#### Methods

##### `readStory(storyId)`
Read story file
```javascript
const manager = new FileManager();
const story = await manager.readStory('AUTH-001');
```

##### `writeArtifact(type, name, content)`
Write artifact file
```javascript
await manager.writeArtifact('story', 'AUTH-001', storyContent);
```

##### `ensureDirectories()`
Ensure project directories exist
```javascript
await manager.ensureDirectories();
// Creates: docs/, .ai/, src/, tests/, etc.
```

---

## Error Handling APIs

### ErrorHandler

**Location**: `bmad-core/utils/error-handler.js`

#### Methods

##### `handleError(error, context)`
Central error handling
```javascript
const handler = new ErrorHandler();
handler.handleError(error, {
  agent: 'developer',
  task: 'implementation',
  recoverable: true
});
```

##### `logError(error)`
Log error with context
```javascript
handler.logError({
  type: 'ValidationError',
  message: 'Contract validation failed',
  details: {...}
});
```

##### `attemptRecovery(error, strategy)`
Try to recover from error
```javascript
const recovered = await handler.attemptRecovery(error, 'retry');
```

---

## CLI APIs

### CLI Command Structure

```javascript
// Command registration
cli.registerCommand('generate:search-tools', {
  description: 'Generate search tools from PRD',
  options: [
    { name: 'prd', type: 'string', required: true },
    { name: 'output', type: 'string', default: 'search-tools.yaml' }
  ],
  action: generateSearchTools
});
```

### Available CLI Commands

```bash
# Validation commands
npm run validate               # Validate all
npm run validate:stories       # Validate stories
npm run validate:contracts     # Validate contracts
npm run validate:tasks        # Validate tasks

# Build commands
npm run build                 # Build all
npm run build:agents         # Build agents
npm run build:teams          # Build teams

# Generation commands
npm run generate:search-tools # Generate search tools
npm run generate:story        # Generate story template

# Workflow commands
npm run workflow:status       # Show workflow status
npm run workflow:start        # Start workflow
npm run workflow:transition   # Transition phase
```

---

## Event System

### EventEmitter

**Location**: `bmad-core/utils/event-emitter.js`

#### Events

```javascript
// Workflow events
emitter.on('workflow:phase-change', (data) => {
  console.log(`Phase changed to ${data.phase}`);
});

// Task events
emitter.on('task:started', (task) => {
  console.log(`Task ${task.id} started`);
});

emitter.on('task:completed', (task) => {
  console.log(`Task ${task.id} completed`);
});

// Agent events
emitter.on('agent:activated', (agent) => {
  console.log(`Agent ${agent.name} activated`);
});

// Error events
emitter.on('error:validation', (error) => {
  console.log(`Validation error: ${error.message}`);
});
```

---

## Hook System

### Hooks Configuration

```yaml
# .bmad-hooks.yaml
hooks:
  preTask:
    - validateRequirements
    - checkDependencies
  
  postTask:
    - updateProgress
    - notifyTeam
  
  onError:
    - logError
    - attemptRecovery
```

### Hook Registration

```javascript
const hooks = new HookManager();

// Register a hook
hooks.register('preTask', async (context) => {
  // Validate before task execution
  return validate(context);
});

// Execute hooks
await hooks.execute('preTask', taskContext);
```

---

## Testing APIs

### TestRunner

**Location**: `bmad-core/utils/test-runner.js`

#### Methods

##### `runTests(pattern)`
Run tests matching pattern
```javascript
const runner = new TestRunner();
const results = await runner.runTests('**/*.test.js');
```

##### `validateContracts()`
Validate all contracts
```javascript
const results = await runner.validateContracts();
```

##### `generateCoverage()`
Generate test coverage report
```javascript
const coverage = await runner.generateCoverage();
```

---

## Integration APIs

### External Service Integration

```javascript
// GitHub integration
const github = new GitHubIntegration(token);
await github.createPR(title, body);

// Slack integration  
const slack = new SlackIntegration(webhook);
await slack.notify('Build complete');

// JIRA integration
const jira = new JiraIntegration(config);
await jira.createTicket(story);
```

---

## Response Formats

### Standard Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Contract validation failed",
    "details": {}
  }
}
```

### Validation Response
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "info": {}
}
```

---

## Rate Limiting

### Configuration
```javascript
const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  keyGenerator: (req) => req.agent
});
```

---

## Authentication

### API Key Authentication
```javascript
const auth = new ApiKeyAuth({
  header: 'X-API-Key',
  keys: ['key1', 'key2']
});
```

---

## Versioning

### API Version Management
```javascript
// Version detection
const version = api.getVersion(); // Returns: '1.0.0'

// Version compatibility
const compatible = api.checkCompatibility('1.0.0');
```

---

## Migration Tools

### Data Migration
```javascript
const migrator = new Migrator();

// Migrate from v1 to v2
await migrator.migrate({
  from: '1.0.0',
  to: '2.0.0',
  data: oldData
});
```

---

## Performance Monitoring

### Metrics Collection
```javascript
const metrics = new MetricsCollector();

// Track operation
metrics.startTimer('task-execution');
// ... operation ...
metrics.endTimer('task-execution');

// Get metrics
const stats = metrics.getStats();
```

---

## Debugging Tools

### Debug Logging
```javascript
const debug = require('debug')('bmad:core');

debug('Starting workflow transition');
debug('Phase: %s -> %s', from, to);
```

### Profiling
```javascript
const profiler = new Profiler();
profiler.start('heavy-operation');
// ... operation ...
const profile = profiler.end('heavy-operation');
console.log(`Operation took ${profile.duration}ms`);
```

---

## Environment Variables

### Core Variables
```bash
BMAD_HOME=/path/to/bmad          # Framework location
BMAD_WORKSPACE=/path/to/project  # Project workspace
BMAD_LOG_LEVEL=debug            # Logging level
BMAD_CONFIG=/path/to/config     # Config file path
```

### Feature Flags
```bash
BMAD_ENABLE_CONTRACTS=true      # Enable story contracts
BMAD_ENABLE_TRACKING=true       # Enable task tracking
BMAD_ENABLE_VALIDATION=true     # Enable validation
BMAD_ENABLE_HOOKS=true          # Enable hook system
```

---

## Deprecation Notices

### Deprecated APIs
- `MemoryManager` - Replaced by `SimpleTaskTracker`
- `QdrantClient` - Removed in favor of file-based tracking
- `ComplexWorkflow` - Simplified to two-phase workflow

### Migration Guide
```javascript
// Old API
const memory = new MemoryManager();
memory.store(data);

// New API
const tracker = new SimpleTaskTracker();
tracker.startTask(taskId, data);
```

---

## Support

For API support and questions:
- Discord: [Join Community](https://discord.gg/gk8jAdXWmj)
- GitHub Issues: [Report Issues](https://github.com/your-repo/issues)
- Documentation: [Full Docs](https://your-docs-site.com)