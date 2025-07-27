

# Story: Automated Validation & Testing Alignment

**Story Summary:**
To further reduce errors and enforce contract‑driven development, we will formalize validation and testing alignment across the project.  This involves creating JSON Schemas for all key artefacts, introducing a dedicated task for validating StoryContract blocks, extending the Dev agent to auto‑generate tests based on the contract, and integrating validation into the build process.

```yaml
---
StoryContract:
  version: 1.0
  story_id: "7.1"
  epic_id: "7"
  apiEndpoints: []
  filesToModify:
    - path: "bmad-core/schemas/story-contract-schema.json"
      reason: "Ensure the JSON schema is comprehensive and ready for validation."
    - path: "bmad-core/schemas/prd-schema.json"
      reason: "Define a JSON Schema for PRD structure (optional, future‑proofing)."
    - path: "bmad-core/schemas/architecture-schema.json"
      reason: "Define a JSON Schema for architecture documents (optional, future‑proofing)."
    - path: "bmad-core/structured-tasks/validate-story-contract.yaml"
      reason: "Create a task that validates StoryContracts using AJV and halts the workflow on failure."
    - path: "scripts/validate-story-contract.js"
      reason: "Implement a Node script that loads a story, extracts the StoryContract, and validates it against the schema."
    - path: "bmad-core/agents/dev.md"
      reason: "Update core principles and the develop‑story completion logic to generate tests directly from the StoryContract."
    - path: "package.json"
      reason: "Add a script npm run validate:contracts to run the validation across all stories."
    - path: "bmad-core/structured-tasks/create-next-story.yaml"
      reason: "Ensure that after generating a story, the validation task is called to check the StoryContract."
    - path: "docs/contributing.md"
      reason: "Document how to run validation scripts and the new npm scripts."
  acceptanceCriteriaLinks: []
---
```

## Story

Validating inputs and outputs reduces errors; industry guidance suggests building prompt evaluation harnesses and tests to ensure outputs meet requirements.  Our current workflow validates StoryContracts at creation time, but we lack automated validation of the contract itself and systematic test generation based on the contract.  To close this loop, we will:

1. **Create comprehensive JSON Schemas.**

   * Review and, if necessary, update `bmad-core/schemas/story-contract-schema.json` to ensure it covers every required field and nested structure (e.g. `dataModels` if present).
   * Optionally create `prd-schema.json` and `architecture-schema.json` under `bmad-core/schemas/` for future validation of PRD and architecture documents.  These can be basic for now (e.g. requiring `version` and `sections`), but provide a starting point.

2. **Implement a validation task.**

   * Define `bmad-core/structured-tasks/validate-story-contract.yaml` with fields `id`, `name`, `inputs` (e.g. `storyFilePath`), `outputs` (e.g. `validationResult`), and steps:

     1. Load the story file specified in `storyFilePath`.
     2. Extract the `StoryContract` YAML block.
     3. Use an npm library such as `ajv` via a Node script (`scripts/validate-story-contract.js`) to validate the contract against `story-contract-schema.json`.
     4. If validation fails, list missing or incorrect fields and halt the calling agent (SM or Dev) with an appropriate error message.  If validation passes, output a success flag.
   * This task will be invoked by the Scrum Master at the end of the story creation workflow and by the Dev agent before starting implementation.

3. **Update the Dev agent for test generation.**

   * In `bmad-core/agents/dev.md`, extend the develop‑story `completion` field:

     ```yaml
     completion: "For each item in StoryContract.apiEndpoints, write an integration test verifying the method, path, request body schema and success response schema → For each entry in StoryContract.filesToModify, implement the changes and write unit tests → If StoryContract includes a dataModels section, write unit tests to validate each schema’s required fields and types → Use validation scripts from core-config to ensure the implemented code adheres to these specifications → Mark tasks as complete when all tests pass → run execute-checklist for story-dod-checklist → set story status: 'Ready for Review' → HALT"
     ```
   * Add a note to `core_principles` reminding the Dev agent that tests must be derived from the contract and that it should never invent tests not specified by the contract.

4. **Integrate validation into the build process.**

   * In `package.json`, add a script `"validate:contracts": "node scripts/validate-story-contract.js --all"`.  This script should iterate over every `.story.md` file in `docs/stories/`, extract its `StoryContract`, validate it and return a non‑zero exit code if any contract is invalid.
   * Update `scripts/validate-story-contract.js` to support `--all` mode: if `--all` is passed, it scans the `docs/stories` folder; if a file is passed, it validates that single story.

5. **Update workflows.**

   * Insert a step in `create-next-story.yaml` after the story is generated and before finalising it:

     ```yaml
     - id: validate-contract
       name: Validate StoryContract
       description: "Validate the StoryContract against the schema; halt on failure"
       action: validate-story-contract
       inputs:
         storyFilePath: "{{storyFilePath}}"
       outputs:
         validationResult: boolean
     ```
   * Ensure the Dev agent calls the validation task at the very start of the `develop-story` execution, halting if the contract is invalid.

6. **Document the new process.**

   * Update `docs/contributing.md` or a similar file to explain how to run `npm run validate:contracts` and why contract validation is critical.
   * Provide instructions for adding new schemas and updating the validator when new fields are introduced.

### Acceptance Criteria

1. JSON schemas for `StoryContract` and (optionally) PRD and architecture documents reside under `bmad-core/schemas/`.
2. A new structured task `validate-story-contract.yaml` exists and can be invoked to validate a story’s `StoryContract` with AJV.
3. `scripts/validate-story-contract.js` supports validating single stories and all stories in bulk, outputting a summary and failing the process on any invalid contract.
4. The Dev agent’s `develop-story` instructions require tests to be generated based on each `apiEndpoints` entry and any `dataModels` in the contract.
5. A new npm script `validate:contracts` runs contract validation across all story files and fails if any are invalid.
6. Story creation workflows call the validation task before finalising the story, and the Dev agent calls it before starting implementation.
7. Documentation explains how to use the validation scripts and how to extend schemas.

By implementing this story, you ensure that contracts are machine‑verifiable, that tests derive directly from requirements, and that invalid stories never reach the implementation phase—all of which reduces hallucination and increases code accuracy.
