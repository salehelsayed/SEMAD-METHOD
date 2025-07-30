Story 1 – Ensure all workflows that require user input always elicit it (not just greenfield)

- **User Story:** As a user interacting with any SEMAD workflow (e.g., greenfield, maintenance, bug‑fix), I want the system to ask me for necessary information rather than skipping over prompts, so that my answers guide the agents and hallucination is minimized.
    
- **Acceptance criteria:**
    
    1. For every structured task that involves user‑specific details, actions that depend on user input are marked with `elicit: true` so the orchestrator pauses until the user responds.
        
    2. The orchestrator respects the `elicit` flag across all workflows; it does not proceed automatically when input is required.
        
    3. User‑driven questions are phrased clearly and cover all fields where the agents would otherwise guess.
        
- **Development tasks:**
    
    - Audit all YAML files in `bmad‑core/structured‑tasks/` for actions that require user input (not limited to the greenfield workflow) and add `elicit: true` where it is missing.
        
    - Verify that the orchestrator enforces waiting for user replies whenever `elicit: true` is set.
        
    - Add unit tests that simulate missing user input and confirm the workflow does not proceed until the input is supplied.
        
- **Testing prompt:** Start various workflows (e.g., planning, architecture updates) and ensure the system always pauses to ask for your input on key decisions.