# Schema Validation Playbook

Symptoms
- "Output validation failed" or schema errors during runs

Quick Checks
- Confirm the output matches the expected schema: field names, types, required properties.
- Remove extra properties if `additionalProperties: false` is set.

Fix Steps
1) Prompt agents to "Respond with JSON only; no commentary".
2) Provide the schema inline or a concise version; avoid ambiguous instructions.
3) If failures persist, reduce output size and complexity; iterate with repair passes enabled.

Tips
- Use arrays-of-strings for summaries/decisions where possible.
- Keep top-level object shallow; nest only when necessary.

