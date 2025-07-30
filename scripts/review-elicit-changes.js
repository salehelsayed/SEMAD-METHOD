#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Actions that should NOT have elicit=true (false positives from previous audit)
const FALSE_POSITIVE_ACTIONS = [
  // System initialization/memory operations
  /^initialize.*memory/i,
  /^retrieve.*context/i,
  /^execute.*task.*update-working-memory/i,
  /^execute.*task.*retrieve-context/i,
  /^apply.*dynamic.*plan/i,
  /^store.*in.*qdrant/i,
  /^archive.*to.*qdrant/i,
  /^run.*validation.*script/i,
  /^execute.*script/i,
  /^verify.*file.*exists/i,
  
  // Analysis and internal processing
  /^analyze.*build.*vs.*buy/i,
  /^note.*technical.*constraints/i,
  /^gather.*essential.*context.*through.*questions/i,
  /^central.*questions.*that.*must/i,
  /^priority.*ranking.*of.*questions/i,
  /^dependencies.*between.*questions/i,
  /^additional.*context-building.*questions/i,
  /^which.*team.*members.*should.*review/i,
  /^be.*specific.*rather.*than.*general/i,
  
  // Documentation and output generation
  /^type:.*\[monorepo/i,
  /^\*\*related.*types\*\*:/i,
  /^if.*prd.*provided:.*what.*needs.*to.*change/i,
  /^if.*prd.*provided:.*clear.*impact/i,
  /^for.*brownfield.*projects.*with.*prd:/i,
  /^provide.*summary.*to.*user.*including/i,
  
  // Internal checks and validations
  /^call.*retrieve-context.*task/i,
  /^provide.*finalized.*document/i,
  /^\*\*if.*analysis.*and.*proposed.*path/i,
  
  // Descriptive content that's not actually asking for input
  /^\*\*content.*type\*\*:.*technical.*specs/i,
  /^\*\*stay.*relevant\*\*:.*tie.*all.*elicitation/i,
  /^\*\*be.*explicit.*and.*detailed\*\*:/i,
  /^\*\*provide.*context.*first\*\*:/i,
  /^\*\*mobile-first.*approach\*\*:/i,
  /_example:.*"1\.*create.*new.*file/i,
  /^if.*user.*has.*design.*files/i,
];

// Actions that SHOULD have elicit=true
const SHOULD_ELICIT_PATTERNS = [
  // Direct questions to user
  /what.*is.*the.*primary.*purpose/i,
  /are.*there.*any.*specific.*areas/i,
  /what.*types.*of.*tasks.*do.*you.*expect/i,
  /are.*there.*any.*existing.*documentation/i,
  /what.*level.*of.*technical.*detail/i,
  /is.*there.*a.*specific.*feature/i,
  
  // User choice/selection requests
  /if.*they.*choose.*option/i,
  /ask.*user.*for.*preference/i,
  /\*\*how.*would.*you.*like.*to/i,
  /await.*simple.*numeric.*selection/i,
  /\*\*numbers.*0-8\*\*:.*execute/i,
  /individual.*items.*within.*section/i,
  
  // Direct user interaction
  /ask.*the.*user.*these.*elicitation.*questions/i,
  /"i.*see.*you're.*using.*\[technology/i,
  /"what.*are.*the.*most.*critical/i,
  /"are.*there.*any.*undocumented/i,
  /"what.*technical.*debt/i,
  /"which.*parts.*of.*the.*codebase/i,
  
  // User confirmation/review
  /ask.*user.*to.*review/i,
  /in.*the.*same.*message.*inform.*them/i,
  /present.*9.*intelligently.*selected/i,
  /1\.*section.*by.*section.*\(interactive/i,
  /offer.*to.*perform.*another/i,
  /this.*task.*creates.*one.*document/i,
];

class ElicitReviewer {
  constructor() {
    this.results = {
      totalFiles: 0,
      totalActions: 0,
      incorrectElicitTrue: [],
      correctElicitTrue: [],
      missingElicitTrue: [],
      filesNeedingFix: []
    };
  }

  async reviewDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const filePath = path.join(dirPath, file);
        await this.reviewFile(filePath);
      }
    }
    
    return this.results;
  }

  async reviewFile(filePath) {
    console.log(`\nReviewing: ${path.basename(filePath)}`);
    this.results.totalFiles++;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(content);
      
      if (!data || !data.steps) {
        console.log('  - No steps found');
        return;
      }
      
      let fileNeedsUpdate = false;
      
      for (const step of data.steps) {
        if (!step.actions) continue;
        
        for (let i = 0; i < step.actions.length; i++) {
          const action = step.actions[i];
          this.results.totalActions++;
          
          const shouldNotElicit = this.checkFalsePositive(action.description);
          const shouldElicit = this.checkShouldElicit(action.description);
          
          if (action.elicit === true) {
            if (shouldNotElicit) {
              // This is incorrectly set to true
              console.log(`  ❌ Incorrectly has elicit=true: "${action.description.substring(0, 60)}..."`);
              this.results.incorrectElicitTrue.push({
                file: path.basename(filePath),
                step: step.name || step.id,
                action: action.description
              });
              action.elicit = false;
              fileNeedsUpdate = true;
            } else {
              // Correctly has elicit=true
              this.results.correctElicitTrue.push({
                file: path.basename(filePath),
                step: step.name || step.id,
                action: action.description
              });
            }
          } else if (shouldElicit && !shouldNotElicit) {
            // Missing elicit=true
            console.log(`  ⚠️  Missing elicit=true: "${action.description.substring(0, 60)}..."`);
            this.results.missingElicitTrue.push({
              file: path.basename(filePath),
              step: step.name || step.id,
              action: action.description
            });
            action.elicit = true;
            fileNeedsUpdate = true;
          }
        }
      }
      
      if (fileNeedsUpdate) {
        const updatedYaml = yaml.dump(data, {
          lineWidth: -1,
          noRefs: true,
          sortKeys: false
        });
        fs.writeFileSync(filePath, updatedYaml);
        this.results.filesNeedingFix.push(path.basename(filePath));
        console.log(`  ✅ File corrected`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing file: ${error.message}`);
    }
  }

  checkFalsePositive(description) {
    if (!description) return false;
    
    for (const pattern of FALSE_POSITIVE_ACTIONS) {
      if (pattern.test(description)) {
        return true;
      }
    }
    
    return false;
  }

  checkShouldElicit(description) {
    if (!description) return false;
    
    for (const pattern of SHOULD_ELICIT_PATTERNS) {
      if (pattern.test(description)) {
        return true;
      }
    }
    
    return false;
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('ELICIT FLAG REVIEW SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total files reviewed: ${this.results.totalFiles}`);
    console.log(`Total actions reviewed: ${this.results.totalActions}`);
    console.log(`Correctly has elicit=true: ${this.results.correctElicitTrue.length}`);
    console.log(`Incorrectly has elicit=true: ${this.results.incorrectElicitTrue.length}`);
    console.log(`Missing elicit=true: ${this.results.missingElicitTrue.length}`);
    console.log(`Files corrected: ${this.results.filesNeedingFix.length}`);
    
    if (this.results.incorrectElicitTrue.length > 0) {
      console.log('\n❌ Actions incorrectly marked as elicit=true:');
      console.log('-'.repeat(60));
      
      for (const item of this.results.incorrectElicitTrue) {
        console.log(`\nFile: ${item.file}`);
        console.log(`Step: ${item.step}`);
        console.log(`Action: ${item.action.substring(0, 100)}...`);
      }
    }
    
    if (this.results.missingElicitTrue.length > 0) {
      console.log('\n⚠️  Actions missing elicit=true:');
      console.log('-'.repeat(60));
      
      for (const item of this.results.missingElicitTrue) {
        console.log(`\nFile: ${item.file}`);
        console.log(`Step: ${item.step}`);
        console.log(`Action: ${item.action.substring(0, 100)}...`);
      }
    }
    
    if (this.results.filesNeedingFix.length > 0) {
      console.log('\nFiles corrected:');
      this.results.filesNeedingFix.forEach(file => console.log(`  - ${file}`));
    }
  }
}

// Main execution
async function main() {
  const reviewer = new ElicitReviewer();
  const tasksDir = path.join(__dirname, '..', 'bmad-core', 'structured-tasks');
  
  console.log('Reviewing elicit flag changes...');
  console.log(`Directory: ${tasksDir}`);
  
  await reviewer.reviewDirectory(tasksDir);
  reviewer.printSummary();
}

main().catch(console.error);