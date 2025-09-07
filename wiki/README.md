# SEMAD Method Wiki Setup Guide

This wiki provides comprehensive documentation for the SEMAD Method framework.

## Viewing the Wiki

### Option 1: GitHub Wiki (Recommended for GitHub repos)
1. Copy the contents of this `wiki/` folder to your GitHub repository's wiki
2. Navigate to your repository's Wiki tab
3. The documentation will be automatically rendered

### Option 2: Local Docsify Server
1. Install docsify-cli:
   ```bash
   npm install -g docsify-cli
   ```

2. Serve the wiki locally:
   ```bash
   docsify serve wiki
   ```

3. Open http://localhost:3000 in your browser

### Option 3: GitBook
1. Import this folder into GitBook
2. The `_sidebar.md` provides navigation structure
3. Publish or serve locally

### Option 4: MkDocs
1. Install MkDocs:
   ```bash
   pip install mkdocs mkdocs-material
   ```

2. Create `mkdocs.yml` in the root:
   ```yaml
   site_name: SEMAD Method Wiki
   theme:
     name: material
   docs_dir: wiki
   ```

3. Serve locally:
   ```bash
   mkdocs serve
   ```

## Wiki Structure

```
wiki/
├── Home.md                    # Main landing page
├── _sidebar.md               # Navigation structure
├── README.md                 # This file
├── getting-started/          # Getting started guides
├── core-concepts/           # Core SEMAD concepts
├── agents/                  # Agent documentation
├── workflows/              # Workflow documentation
├── expansion-packs/        # Extension packs
├── api/                   # API reference
├── development/           # Development guides
└── troubleshooting/       # Help and debugging
```

## Contributing to the Wiki

1. Follow the existing structure and formatting
2. Use relative links for internal navigation
3. Include code examples where appropriate
4. Add diagrams using Mermaid syntax
5. Keep content concise and actionable

## Updating the Wiki

To update the wiki with new content:

1. Edit or add markdown files in the appropriate directory
2. Update `_sidebar.md` if adding new pages
3. Test locally using one of the viewing options above
4. Commit changes to version control

## Automated Documentation

Some documentation can be auto-generated from code:

```bash
# Generate API documentation
npm run docs:api

# Generate agent reference
npm run docs:agents

# Update changelog
npm run docs:changelog
```

## Templates

Use these templates for new pages:

### Concept Page Template
```markdown
# [Concept Name]

## Overview
Brief description of the concept

## Why It Matters
Explanation of importance

## How It Works
Detailed explanation with examples

## Best Practices
- Practice 1
- Practice 2

## Common Pitfalls
- Pitfall 1 and how to avoid
- Pitfall 2 and how to avoid

## Related Topics
- [Link 1](path/to/topic1.md)
- [Link 2](path/to/topic2.md)
```

### Guide Page Template
```markdown
# [Guide Title]

## Prerequisites
- Requirement 1
- Requirement 2

## Steps

### Step 1: [Action]
Description and code example

### Step 2: [Action]
Description and code example

## Troubleshooting
Common issues and solutions

## Next Steps
Where to go from here
```

## Support

For wiki-related issues or suggestions:
- Open an issue with the `documentation` label
- Submit a PR with proposed changes
- Join the documentation discussion channel