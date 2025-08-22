#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

class DeterministicGenerator {
  constructor() {
    this.config = null;
    this.templates = {};
  }

  async initialize() {
    // Load generation configuration
    const configPath = path.join(__dirname, 'config.json');
    this.config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    
    // Load templates
    for (const [name, template] of Object.entries(this.config.templates)) {
      const templatePath = path.join(__dirname, '..', '..', template.path);
      this.templates[name] = {
        content: await fs.readFile(templatePath, 'utf-8'),
        config: template
      };
    }
    
    console.log('[GEN] Deterministic generator initialized');
  }

  async generateStory(storyData) {
    console.log(`[GEN] Generating story: ${storyData.storyId}`);
    
    const template = this.templates.story;
    if (!template) {
      throw new Error('Story template not loaded');
    }
    
    // Validate required placeholders
    this.validatePlaceholders(storyData, template.config.requiredPlaceholders);
    
    // Add generation metadata
    const enrichedData = {
      ...storyData,
      GENERATION_TIMESTAMP: new Date().toISOString(),
      TEMPLATE_VERSION: template.config.version,
      GENERATOR_AGENT: 'deterministic-generator',
      GENERATION_SEED: this.config.models.primary.seed,
      GENERATION_TEMPERATURE: this.config.models.primary.temperature
    };
    
    // Apply template
    let output = template.content;
    
    // Replace placeholders
    for (const [key, value] of Object.entries(enrichedData)) {
      if (Array.isArray(value)) {
        // Handle array placeholders
        const arrayPattern = new RegExp(`{{#${key}}}([\\s\\S]*?){{/${key}}}`, 'g');
        output = output.replace(arrayPattern, (match, itemTemplate) => {
          return value.map(item => {
            let itemOutput = itemTemplate;
            if (typeof item === 'object') {
              for (const [itemKey, itemValue] of Object.entries(item)) {
                itemOutput = itemOutput.replace(new RegExp(`{{${itemKey}}}`, 'g'), itemValue);
              }
            } else {
              itemOutput = itemOutput.replace(/{{.}}/g, item);
            }
            return itemOutput;
          }).join('\n');
        });
      } else {
        // Handle simple placeholders
        output = output.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }
    
    // Validate output
    this.validateOutput(output);
    
    return output;
  }

  async generateTest(testData) {
    console.log(`[GEN] Generating test: ${testData.testFilePath}`);
    
    const template = this.templates.test;
    if (!template) {
      throw new Error('Test template not loaded');
    }
    
    // Validate required placeholders
    this.validatePlaceholders(testData, template.config.requiredPlaceholders);
    
    // Add generation metadata
    const enrichedData = {
      ...testData,
      GENERATION_TIMESTAMP: new Date().toISOString(),
      TEMPLATE_VERSION: template.config.version
    };
    
    // Apply template (similar to story generation)
    let output = template.content;
    
    for (const [key, value] of Object.entries(enrichedData)) {
      if (Array.isArray(value)) {
        const arrayPattern = new RegExp(`{{#${key}}}([\\s\\S]*?){{/${key}}}`, 'g');
        output = output.replace(arrayPattern, (match, itemTemplate) => {
          return value.map(item => {
            let itemOutput = itemTemplate;
            if (typeof item === 'object') {
              for (const [itemKey, itemValue] of Object.entries(item)) {
                itemOutput = itemOutput.replace(new RegExp(`{{${itemKey}}}`, 'g'), itemValue);
              }
            } else {
              itemOutput = itemOutput.replace(/{{.}}/g, item);
            }
            return itemOutput;
          }).join('\n');
        });
      } else {
        output = output.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }
    
    return output;
  }

  validatePlaceholders(data, requiredPlaceholders) {
    const missing = requiredPlaceholders.filter(placeholder => 
      !data.hasOwnProperty(placeholder.replace(/{{|}}/g, ''))
    );
    
    if (missing.length > 0) {
      throw new Error(`Missing required placeholders: ${missing.join(', ')}`);
    }
  }

  validateOutput(output) {
    // Check for unfilled placeholders
    const unfilledPlaceholders = output.match(/{{[^}]+}}/g);
    
    if (unfilledPlaceholders && unfilledPlaceholders.length > 0) {
      console.warn(`[GEN] Warning: Unfilled placeholders found: ${unfilledPlaceholders.join(', ')}`);
    }
    
    // Ensure required metadata is present
    const requiredMetadata = this.config.generation.requiredMetadata;
    
    for (const metadata of requiredMetadata) {
      if (!output.includes(metadata)) {
        throw new Error(`Output missing required metadata: ${metadata}`);
      }
    }
  }

  getGenerationSettings() {
    return {
      temperature: this.config.models.primary.temperature,
      seed: this.config.models.primary.seed,
      deterministicMode: this.config.generation.deterministicMode,
      modelConfig: this.config.models.primary
    };
  }
}

module.exports = { DeterministicGenerator };

// CLI usage
if (require.main === module) {
  async function main() {
    const command = process.argv[2];
    const inputFile = process.argv[3];
    const outputFile = process.argv[4];

    if (!command || !inputFile) {
      console.error('Usage: node deterministic-generator.js [story|test] <input.json> [output-file]');
      process.exit(1);
    }

    const generator = new DeterministicGenerator();
    await generator.initialize();

    const inputData = JSON.parse(await fs.readFile(inputFile, 'utf-8'));
    let output;

    switch (command) {
      case 'story':
        output = await generator.generateStory(inputData);
        break;
      case 'test':
        output = await generator.generateTest(inputData);
        break;
      default:
        console.error('Unknown command. Use: story or test');
        process.exit(1);
    }

    if (outputFile) {
      await fs.writeFile(outputFile, output);
      console.log(`[GEN] Output written to ${outputFile}`);
    } else {
      console.log(output);
    }
  }

  main().catch(error => {
    console.error('[GEN] Error:', error.message);
    process.exit(1);
  });
}
