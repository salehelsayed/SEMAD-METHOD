#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Keywords that indicate user input is required
const ELICIT_KEYWORDS = [
  'ask',
  'prompt',
  'confirm',
  'verify',
  'choose',
  'select',
  'decide',
  'question',
  'input',
  'provide',
  'specify',
  'enter',
  'type',
  'user.*input',
  'user.*response',
  'user.*selection',
  'user.*choice',
  'await.*response',
  'await.*input',
  'elicitation',
  '\\?$', // ends with question mark
  'what.*should',
  'which.*should',
  'do you',
  'would you',
  'can you',
  'should I',
  'preference',
  'option'
];

// Keywords that might be false positives
const FALSE_POSITIVE_KEYWORDS = [
  'check if',
  'verify that',
  'confirm the',
  'ask yourself',
  'internal check',
  'system verify',
  'auto-confirm'
];

class ElicitAuditor {
  constructor() {
    this.results = {
      totalFiles: 0,
      totalActions: 0,
      actionsNeedingElicit: [],
      actionsWithElicitTrue: 0,
      actionsWithElicitFalse: 0,
      filesModified: []
    };
  }

  async auditDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const filePath = path.join(dirPath, file);
        await this.auditFile(filePath);
      }
    }
    
    return this.results;
  }

  async auditFile(filePath) {
    console.log(`\nAuditing: ${path.basename(filePath)}`);
    this.results.totalFiles++;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(content);
      
      if (!data || !data.steps) {
        console.log('  - No steps found');
        return;
      }
      
      let fileModified = false;
      
      for (const step of data.steps) {
        if (!step.actions) continue;
        
        for (let i = 0; i < step.actions.length; i++) {
          const action = step.actions[i];
          this.results.totalActions++;
          
          const needsElicit = this.checkIfNeedsElicit(action.description);
          
          // Current state
          if (action.elicit === true) {
            this.results.actionsWithElicitTrue++;
          } else if (action.elicit === false) {
            this.results.actionsWithElicitFalse++;
          }
          
          // Check if we need to update
          if (needsElicit && action.elicit !== true) {
            console.log(`  ⚠️  Action needs elicit=true: "${action.description.substring(0, 60)}..."`);
            this.results.actionsNeedingElicit.push({
              file: path.basename(filePath),
              step: step.name || step.id,
              action: action.description,
              currentElicit: action.elicit,
              suggestedElicit: true
            });
            
            // Update the action
            action.elicit = true;
            fileModified = true;
          } else if (!needsElicit && action.elicit === true) {
            // Log cases where elicit might be unnecessarily true
            console.log(`  ℹ️  Action has elicit=true but might not need it: "${action.description.substring(0, 60)}..."`);
          }
        }
      }
      
      // Save the file if modified
      if (fileModified) {
        const updatedYaml = yaml.dump(data, {
          lineWidth: -1,
          noRefs: true,
          sortKeys: false
        });
        fs.writeFileSync(filePath, updatedYaml);
        this.results.filesModified.push(path.basename(filePath));
        console.log(`  ✅ File updated with elicit flags`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing file: ${error.message}`);
    }
  }

  checkIfNeedsElicit(description) {
    if (!description) return false;
    
    const lowerDesc = description.toLowerCase();
    
    // Check for false positives first
    for (const keyword of FALSE_POSITIVE_KEYWORDS) {
      if (new RegExp(keyword, 'i').test(lowerDesc)) {
        return false;
      }
    }
    
    // Check for elicit keywords
    for (const keyword of ELICIT_KEYWORDS) {
      if (new RegExp(keyword, 'i').test(lowerDesc)) {
        return true;
      }
    }
    
    return false;
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total files scanned: ${this.results.totalFiles}`);
    console.log(`Total actions found: ${this.results.totalActions}`);
    console.log(`Actions with elicit=true: ${this.results.actionsWithElicitTrue}`);
    console.log(`Actions with elicit=false: ${this.results.actionsWithElicitFalse}`);
    console.log(`Actions needing elicit=true: ${this.results.actionsNeedingElicit.length}`);
    console.log(`Files modified: ${this.results.filesModified.length}`);
    
    if (this.results.actionsNeedingElicit.length > 0) {
      console.log('\nActions that were updated:');
      console.log('-'.repeat(60));
      
      for (const item of this.results.actionsNeedingElicit) {
        console.log(`\nFile: ${item.file}`);
        console.log(`Step: ${item.step}`);
        console.log(`Action: ${item.action.substring(0, 100)}...`);
        console.log(`Changed: elicit: ${item.currentElicit} → ${item.suggestedElicit}`);
      }
    }
    
    if (this.results.filesModified.length > 0) {
      console.log('\nFiles modified:');
      this.results.filesModified.forEach(file => console.log(`  - ${file}`));
    }
  }
}

// Main execution
async function main() {
  const auditor = new ElicitAuditor();
  const tasksDir = path.join(__dirname, '..', 'bmad-core', 'structured-tasks');
  
  console.log('Starting elicit flag audit...');
  console.log(`Directory: ${tasksDir}`);
  
  await auditor.auditDirectory(tasksDir);
  auditor.printSummary();
}

main().catch(console.error);