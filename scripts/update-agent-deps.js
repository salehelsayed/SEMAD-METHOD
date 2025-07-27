#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Update agent files to use YAML task and checklist files
function updateAgentDependencies() {
  const agentsDir = path.join(__dirname, '..', 'bmad-core', 'agents');
  const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  
  console.log('Updating agent dependencies to use YAML files...\n');
  
  for (const file of agentFiles) {
    const filePath = path.join(agentsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Find the dependencies section
    const depsMatch = content.match(/dependencies:\s*\n([\s\S]*?)(?=\n```|$)/);
    if (!depsMatch) {
      console.log(`  ⚠️  No dependencies found in ${file}`);
      continue;
    }
    
    let hasChanges = false;
    
    // Update task references from .md to .yaml
    content = content.replace(/(tasks:\s*\n(?:[\s]*-[^\n]*\n)*)/g, (match) => {
      const updatedMatch = match.replace(/\.md(?=\s*$)/gm, '.yaml');
      if (updatedMatch !== match) {
        hasChanges = true;
      }
      return updatedMatch;
    });
    
    // Update checklist references from .md to .yaml
    content = content.replace(/(checklists:\s*\n(?:[\s]*-[^\n]*\n)*)/g, (match) => {
      const updatedMatch = match.replace(/\.md(?=\s*$)/gm, '.yaml');
      if (updatedMatch !== match) {
        hasChanges = true;
      }
      return updatedMatch;
    });
    
    // Also update any references in commands section
    content = content.replace(/(Execute task [^\s]+)\.md/g, '$1.yaml');
    content = content.replace(/(with checklist [^\s]+)\.md/g, '$1.yaml');
    
    if (hasChanges) {
      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Updated ${file}`);
    } else {
      console.log(`  - No changes needed for ${file}`);
    }
  }
  
  console.log('\nAgent dependency update complete!');
}

// Run the update
if (require.main === module) {
  updateAgentDependencies();
}

module.exports = { updateAgentDependencies };