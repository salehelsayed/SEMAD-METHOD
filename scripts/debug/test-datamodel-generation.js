#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const DataModelTestGenerator = require('../bmad-core/utils/datamodel-test-generator');
const StoryContractValidator = require('../bmad-core/utils/story-contract-validator');

async function testDataModelGeneration() {
  console.log('🧪 Testing DataModel Test Generation\n');
  
  try {
    // 1. Load and validate the test story
    const storyPath = path.join(__dirname, 'test-story-with-datamodels.md');
    console.log(`1. Loading story from: ${storyPath}`);
    
    const validator = new StoryContractValidator();
    const validationResult = validator.validateStoryFile(storyPath);
    
    if (!validationResult.valid) {
      console.error('❌ Story validation failed:');
      console.error(validator.formatErrors(validationResult.errors));
      process.exit(1);
    }
    
    console.log('✅ Story contract is valid');
    console.log(`   - Story ID: ${validationResult.contract.story_id}`);
    console.log(`   - Epic ID: ${validationResult.contract.epic_id}`);
    
    // 2. Check for dataModels
    if (!validationResult.contract.dataModels) {
      console.error('❌ No dataModels found in story contract');
      process.exit(1);
    }
    
    const modelNames = Object.keys(validationResult.contract.dataModels);
    console.log(`\n2. Found ${modelNames.length} data models: ${modelNames.join(', ')}`);
    
    // 3. Generate tests
    console.log('\n3. Generating tests...');
    const generator = new DataModelTestGenerator();
    const result = generator.generateDataModelTests(validationResult.contract, 'jest');
    
    // Handle both old and new return formats
    const generatedTests = result.tests || result;
    const schemaFiles = result.schemaFiles || {};
    
    const testFileNames = Object.keys(generatedTests);
    console.log(`✅ Generated ${testFileNames.length} test files:`);
    testFileNames.forEach(name => console.log(`   - ${name}`));
    
    if (Object.keys(schemaFiles).length > 0) {
      console.log(`\n   Generated ${Object.keys(schemaFiles).length} schema files:`);
      Object.keys(schemaFiles).forEach(name => console.log(`   - ${name}`));
    }
    
    // 4. Write tests to output directory
    const outputDir = path.join(__dirname, 'generated-tests');
    console.log(`\n4. Writing tests to: ${outputDir}`);
    
    // Use the writeTestsToFiles method which handles both tests and schema files
    generator.writeTestsToFiles(result, outputDir);
    
    // 5. Verify test content
    console.log('\n5. Verifying generated test content...');
    
    for (const [fileName, content] of Object.entries(generatedTests)) {
      console.log(`\n   Checking ${fileName}:`);
      
      // Check for essential test components
      const checks = [
        { pattern: /describe\(['"].*Data Model Validation/, name: 'Test suite declaration' },
        { pattern: /beforeAll\(\(\) =>/, name: 'Test setup' },
        { pattern: /ajv\.compile\(schema\)/, name: 'Schema compilation' },
        { pattern: /should validate.*valid/, name: 'Valid object tests' },
        { pattern: /should fail validation/, name: 'Invalid object tests' },
        { pattern: /required.*fields/, name: 'Required field tests' },
        { pattern: /expect\(isValid\)\.toBe/, name: 'Jest assertions' }
      ];
      
      checks.forEach(check => {
        if (check.pattern.test(content)) {
          console.log(`     ✅ ${check.name}`);
        } else {
          console.log(`     ❌ Missing: ${check.name}`);
        }
      });
    }
    
    console.log('\n✅ DataModel test generation completed successfully!');
    console.log(`\nGenerated tests can be found in: ${outputDir}`);
    
    // 6. Show a sample of the generated code
    console.log('\n6. Sample generated test (first 50 lines of product.test.js):');
    const productTestPath = path.join(outputDir, 'product.test.js');
    const productTestContent = fs.readFileSync(productTestPath, 'utf8');
    const lines = productTestContent.split('\n').slice(0, 50);
    console.log('```javascript');
    console.log(lines.join('\n'));
    console.log('```');
    console.log('... (truncated)');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testDataModelGeneration();