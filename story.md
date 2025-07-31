Story 19 – Memory hygiene: clean and maintain short‑term memory to prevent hallucination

- **User Story:** As a system maintainer, I want to manage the size and relevance of agents’ short‑term memory so that outdated or irrelevant context does not accumulate and cause hallucination or confusion, while still retaining useful information.
    
- **Acceptance criteria:**
    
    1. Each agent maintains a configurable size or time window for its working memory file; once the limit is reached, old entries are summarised or archived to long‑term memory (Qdrant) and then removed from the short‑term file.
        
    2. Agents periodically review their working memory and prune entries that are no longer relevant to the current epic or story (e.g., context from completed tasks).
        
    3. Before discarding information, the agent ensures that a summary is written to long‑term memory so that knowledge is not lost.
        
    4. Users can configure memory retention parameters (e.g., maximum entries, maximum age) in `core-config.yaml`, and default values provide a reasonable balance between context and brevity.
        
    5. Documentation explains how memory cleaning mitigates hallucination and how to adjust the settings if needed.
        
- **Development tasks:**
    
    - Define retention policies (by size or age) for the `.ai` working memory files and expose these settings in the core configuration.
        
    - Implement a memory‑cleanup routine that runs at the end of each agent action or at defined intervals: it summarises old messages into a long‑term record in Qdrant and removes them from short‑term storage.
        
    - Update the agent logic to query both short‑term memory and long‑term summaries when seeking context.
        
    - Document recommended settings and provide guidance on when to adjust them.
        
- **Testing prompt:** Configure a low retention threshold and run a long interaction; verify that the agent begins summarising and pruning its memory while still recalling necessary context. Adjust the threshold higher and confirm that more context is retained.
    