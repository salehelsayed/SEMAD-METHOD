# Qdrant Documentation Setup Guide

## Quick Setup

This guide explains how to configure BMAD to search your Qdrant documentation collections.

## Step 1: Configure Your Collections

Edit `bmad-core/data/qdrant-collections.yaml` to add your Qdrant collections:

```yaml
collections:
  # Your React documentation collection
  my_react_docs:
    name: my_react_docs  # Actual collection name in Qdrant
    description: React 18 documentation
    content_type: documentation
    topics:
      - react
      - hooks
      - components
    search_when:
      - keyword contains "react"
      - keyword contains "hook"
      - keyword contains "useState"
      
  # Your API documentation
  api_docs:
    name: api_docs
    description: Backend API documentation
    content_type: documentation
    topics:
      - api
      - rest
      - endpoints
    search_when:
      - keyword contains "api"
      - keyword contains "endpoint"
      - query contains "how to call"
```

## Step 2: Generate Tech Search Tools (Optional)

Use the SM agent to analyze your PRD and generate search queries:

```bash
# Launch SM agent
node tools/cli.js agent sm

# In SM agent:
*generate-tech-search-tools
```

This creates `tech-search-tools.yaml` with:
- Extracted technologies from your PRD
- Suggested search queries
- Documentation sources to explore

## Step 3: Use Documentation Search

All agents (SM, Dev, QA) can now search your Qdrant collections:

```bash
# In any agent:
*query-docs
# Enter your query: How to implement React hooks?
# Optional technology: react
# Limit: 5
```

## How It Works

1. **Query Analysis**: When you search, the system:
   - Checks your query against `search_when` conditions
   - Identifies relevant collections
   - Searches only those collections

2. **Smart Matching**: For example:
   - Query: "React useState tutorial" → Searches `my_react_docs`
   - Query: "API authentication" → Searches `api_docs`
   - Query: "database schema" → Searches `postgres_docs` (if configured)

3. **Results**: Returns:
   - Relevant documentation snippets
   - Collection source
   - Relevance scores

## Example Workflow

1. **Developer searching for React help**:
   ```
   *query-docs
   Query: How to use useEffect with cleanup?
   Technology: react
   ```
   → Searches your React documentation collection

2. **QA checking best practices**:
   ```
   *query-docs
   Query: Testing React components best practices
   ```
   → Searches React docs and best practices collections

## Tips

- **Collection Names**: Must match exactly what's in Qdrant
- **Search Conditions**: Use simple patterns like "keyword contains X"
- **Topics**: Help identify what's in each collection
- **Multiple Collections**: System searches all matching collections

## What You DON'T Need to Do

- No need to modify agent code
- No need to create ingestion scripts
- No need to handle embeddings

Just configure your collections and start searching!