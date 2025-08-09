# Agent IO Troubleshooting

Issues
- Model adds commentary around JSON
- Missing required fields or wrong types

Fixes
- Preface with: "Return ONLY JSON that matches this schema" and specify `additionalProperties: false`.
- Ask the agent to restate the schema back first (optional) then output JSON only.
- If still noisy, instruct: "Do not wrap in code fences; output plain JSON only."

Validation
- Confirm against schemas in `bmad-core/schemas/`.
- Use smaller examples and build up.

