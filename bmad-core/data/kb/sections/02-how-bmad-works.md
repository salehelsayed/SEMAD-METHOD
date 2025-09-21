## How BMad Works

### The Core Method

BMad transforms you into a "Vibe CEO" - directing a team of specialized AI agents through structured workflows. Here's how:

1. **You Direct, AI Executes**: You provide vision and decisions; agents handle implementation details
2. **Specialized Agents**: Each agent masters one role (PM, Developer, Architect, etc.)
3. **Structured Workflows**: Proven patterns guide you from idea to deployed code
4. **Clean Handoffs**: Fresh context windows ensure agents stay focused and effective

### The Two-Phase Approach

#### Phase 1: Planning (Web UI - Cost Effective)

- Use large context windows (Gemini's 1M tokens)
- Generate comprehensive documents (PRD, Architecture)
- Leverage multiple agents for brainstorming
- Create once, use throughout development

#### Phase 2: Development (IDE - Implementation)

- Shard documents into manageable pieces
- Execute focused SM → Dev cycles
- One story at a time, sequential progress
- Real-time file operations and testing

### The Development Loop

```text
1. SM Agent (New Chat) → Creates next story from sharded docs
2. You → Review and approve story
3. Dev Agent (New Chat) → Implements approved story
4. QA Agent (New Chat) → Reviews and refactors code
5. You → Verify completion
6. Repeat until epic complete
```

### Why This Works

- **Context Optimization**: Clean chats = better AI performance
- **Role Clarity**: Agents don't context-switch = higher quality
- **Incremental Progress**: Small stories = manageable complexity
- **Human Oversight**: You validate each step = quality control
- **Document-Driven**: Specs guide everything = consistency
