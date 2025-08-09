# Agent Output Validation and Retry

This project validates agent outputs against JSON Schemas to reduce hallucination and enforce structure.

## How it works

- Schemas live under `bmad-core/schemas/agents/`.
- `AgentRunner.executeWithMemory` accepts `context.outputSchemaId` and optional `context.validationOptions.retries`.
- After the agent (or callback) returns, the result is validated via Ajv.
- On failure, we log details to `.ai/validation-logs/` and optionally retry once with feedback (`validationFeedback` in context).

## Available Schemas

- `agents/dev.implement_story.output`: Dev implement step must return:
  - `success: boolean`
  - `files: [{ path: string, content?: string }]`
  - `summary?: string`
- `agents/qa.review_implementation.output`: QA review must return:
  - `success: boolean`
  - `approved: boolean`
  - `issues?: [{ path?: string, message: string, severity: 'low'|'medium'|'high' }]`
- `agents/analyst.prd.output`: Analyst PRD must return:
  - `success: boolean`
  - `data: { title?: string, goals?: string[], summary?: string, ... }`

## Wiring schemas in workflows

`WorkflowExecutor` automatically injects `outputSchemaId` for common steps:

- Dev implement: `agents/dev.implement_story.output`
- QA review: `agents/qa.review_implementation.output`
- Analyst PRD: `agents/analyst.prd.output`

You can also set it manually when invoking `AgentRunner` or your own executors.

## Example usage with AgentRunner

```js
const AgentRunner = require('../bmad-core/utils/agent-runner');
const runner = new AgentRunner();

const result = await runner.executeWithMemory(
  'dev',
  'implement-story-ABC-123',
  {
    storyId: 'ABC-123',
    outputSchemaId: 'agents/dev.implement_story.output',
    validationOptions: { retries: 1 }
  },
  async (ctx) => {
    // Return a JSON object; if returning a string, wrap it as fenced JSON
    return {
      success: true,
      files: [{ path: 'src/feature.js', content: '// code' }],
      summary: 'Implemented feature'
    };
  }
);
```

On invalid output, the runner retries once with:

```js
ctx.validationFeedback = { schemaId, errors: ['/.files is required', ...] }
```

Your executor can use this feedback to regenerate a corrected response.

