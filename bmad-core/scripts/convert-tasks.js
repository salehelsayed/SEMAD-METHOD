#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Attempt to require js-yaml; if unavailable, fall back to JSON serialization.
let yaml;
try {
  yaml = require('js-yaml');
} catch (err) {
  yaml = {
    dump: function (obj, options) {
      // Fallback: return JSON string; indentation based on options
      const indent = options && options.indent ? options.indent : 2;
      return JSON.stringify(obj, null, indent);
    }
  };
}

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const BACKUP_SUFFIX = '.conversion-backup';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const createBackup = !args.includes('--no-backup');

// Logger
const log = {
  info: (msg) => console.log(msg),
  verbose: (msg) => verbose && console.log(`  [VERBOSE] ${msg}`),
  warn: (msg) => console.warn(`  ⚠️  ${msg}`),
  error: (msg) => console.error(`  ❌ ${msg}`),
  success: (msg) => console.log(`  ✓ ${msg}`)
};

// Validation results collector
const validationResults = {
  errors: [],
  warnings: [],
  dataLoss: []
};

// Parse markdown task file into structured format with better preservation
function parseTaskMarkdown(content, filename) {
  const lines = content.split('\n');
  const task = {
    id: path.basename(filename, '.md'),
    name: '',
    purpose: '',
    steps: [],
    inputs: {},
    outputs: {},
    metadata: {
      originalSections: [],
      preservedContent: []
    }
  };

  let currentSection = '';
  let currentStep = null;
  let stepNumber = 0;
  let collectingContent = [];
  let inCodeBlock = false;
  let capturingCodeBlock = false;
  let codeBlockLines = [];
  let sectionHeaders = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track code blocks and preserve them outside of steps
    if (trimmed.startsWith('```')) {
      // Toggle code block state
      if (!inCodeBlock) {
        // Starting a new code block
        capturingCodeBlock = true;
        codeBlockLines = [];
        codeBlockLines.push(line);
      } else {
        // Ending a code block
        codeBlockLines.push(line);
        // Preserve the entire code block if not part of a step
        if (!currentStep) {
          task.metadata.preservedContent.push({
            type: 'code-block',
            content: codeBlockLines.join('\n'),
            lineNumber: i + 1 - codeBlockLines.length + 1
          });
        } else {
          // If within a step, append to description preserving formatting
          codeBlockLines.forEach((cl) => {
            if (currentStep.description) {
              currentStep.description += '\n' + cl;
            } else {
              currentStep.description = cl;
            }
          });
        }
        capturingCodeBlock = false;
        codeBlockLines = [];
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    // Collect lines inside code blocks
    if (capturingCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }
    
    // Main title
    if (trimmed.startsWith('# ') && !inCodeBlock) {
      task.name = trimmed.substring(2).trim();
      continue;
    }
    
    // Section headers (## ...). Always check for important-like headers even inside code blocks.
    if (trimmed.startsWith('## ')) {
      const sectionName = trimmed.substring(3).trim();
      const normalizedSection = sectionName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isImportantSection = /IMPORTANT/i.test(normalizedSection);
      // Preserve 'Important' headers regardless of code block state
      if (isImportantSection) {
        task.metadata.preservedContent.push({
          type: 'section-header',
          content: sectionName,
          level: 2
        });
      }
      // Only process as a true section if not inside a code block
      if (!inCodeBlock) {
        // Save any collected content from previous section
        if (currentSection === 'purpose' && collectingContent.length > 0) {
          task.purpose = collectingContent.join('\n').trim();
          collectingContent = [];
        }
        sectionHeaders.push(sectionName);
        currentSection = sectionName.toLowerCase();
        // Preserve special section headers (SEQUENTIAL, CRITICAL, Task Execution, Important)
        const isSequential = /SEQUENTIAL/i.test(normalizedSection);
        const isCriticalSection = /CRITICAL/i.test(normalizedSection);
        const isTaskExecution = /Task Execution/i.test(normalizedSection);
        if (isSequential || isCriticalSection || isTaskExecution || isImportantSection) {
          task.metadata.preservedContent.push({
            type: 'section-header',
            content: sectionName,
            level: 2
          });
          // Extract execution mode if sequential
          if (isSequential) {
            task.metadata.executionMode = 'SEQUENTIAL';
          }
        }
      }
      // Skip further processing for header line
      continue;
    }
    
    // Handle numbered steps (both ### and #### levels)
    if (trimmed.match(/^#{3,4}\s+\d+/) && !inCodeBlock) {
      // Save any collected purpose content if leaving purpose section
      if (currentSection === 'purpose' && collectingContent.length > 0 && !task.purpose) {
        task.purpose = collectingContent.join('\n').trim();
        collectingContent = [];
      }
      // Save previous step if exists
      if (currentStep) {
        task.steps.push(currentStep);
      }
      // Determine heading level (### -> 3, #### -> 4)
      const levelMatch = trimmed.match(/^(#{3,4})/);
      const level = levelMatch ? levelMatch[1].length : 0;
      stepNumber++;
      // Extract the original step number, allowing for decimals (e.g., 1.1)
      const numMatch = trimmed.match(/^#{3,4}\s+([0-9]+(?:\.[0-9]+)*)/);
      const originalNumber = numMatch ? numMatch[1] : '';
      // Remove the numeric prefix (with optional trailing dot) and whitespace to get the step title
      const stepTitle = trimmed.replace(/^#{3,4}\s+[0-9]+(?:\.[0-9]+)*\.?\s+/, '').trim();
      currentStep = {
        id: `step${stepNumber}`,
        name: stepTitle,
        description: '',
        actions: [],
        notes: '',
        metadata: {
          level: level,
          originalNumber: originalNumber
        }
      };
      collectingContent = [];
      continue;
    }
    
    // Collect content based on current context
    if (currentSection === 'purpose' && !currentStep) {
      collectingContent.push(line);
    } else if (currentStep) {
      // Look for bullet points as actions
      if (trimmed.startsWith('- ') && !inCodeBlock) {
        const action = trimmed.substring(2).trim();
        // Check if this action requires user input
        const elicitKeywords = ['prompt', 'ask', 'confirm', 'verify', 'choose', 'select', 'decide', '?'];
        const needsElicit = elicitKeywords.some(keyword => action.toLowerCase().includes(keyword));
        
        currentStep.actions.push({
          description: action,
          elicit: needsElicit,
          metadata: {
            originalIndent: line.match(/^\s*/)[0].length
          }
        });
      } else if (trimmed.length > 0 || line.length > 0) {
        // Preserve formatting and empty lines in descriptions
        if (currentStep.description) {
          currentStep.description += '\n' + line;
        } else {
          currentStep.description = line;
        }
      }
    }
    
    // Extract and preserve special content (CRITICAL, IMPORTANT, WARNING, NOTE, LLM)
    // To handle markdown emphasis and accented characters, remove markdown tokens and normalize diacritics.
    const clean = line.replace(/[\*_`]/g, '');
    // Normalize unicode to remove diacritics (e.g., ï -> i) then test keywords case-insensitively
    const normalized = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasCritical = /\bCRITICAL\b/i.test(normalized);
    const hasImportant = /\bIMPORTANT\b/i.test(normalized);
    const hasWarning = /\bWARNING\b/i.test(normalized);
    const hasNote = /\bNOTE\b/i.test(normalized);
    const hasLLM = line.includes('[[LLM:');
    if (hasLLM || hasCritical || hasImportant || hasWarning || hasNote) {
      const noteContent = {
        type: 'special-note',
        content: line,
        lineNumber: i + 1
      };
      if (!currentStep) {
        task.metadata.preservedContent.push(noteContent);
        task.notes = (task.notes || '') + line + '\n';
      } else {
        currentStep.notes = (currentStep.notes || '') + line + '\n';
      }
    }
  }
  
  // Save final step if exists
  if (currentStep) {
    task.steps.push(currentStep);
  }
  
  // Save final purpose if collected
  if (currentSection === 'purpose' && collectingContent.length > 0) {
    task.purpose = collectingContent.join('\n').trim();
  }
  
  // Clean up step descriptions and notes
  task.steps.forEach(step => {
    step.description = (step.description || '').trim();
    step.notes = (step.notes || '').trim();
    if (!step.notes) delete step.notes;
    
    // Validate step has required fields
    if (!step.name) {
      validationResults.warnings.push(`Step ${step.id} in ${filename} has no name`);
    }
    if (step.actions.length === 0) {
      validationResults.warnings.push(`Step ${step.id} in ${filename} has no actions`);
    }
  });
  
  // Store section headers for validation
  task.metadata.originalSections = sectionHeaders;
  
  // Validate required fields
  if (!task.name) {
    validationResults.errors.push(`${filename}: Missing task name (# header)`);
  }
  if (!task.purpose) {
    validationResults.warnings.push(`${filename}: Missing purpose section`);
  }
  if (task.steps.length === 0) {
    validationResults.errors.push(`${filename}: No steps found`);
  }

  // As a safety net, ensure that any 'Important' section headers in the original content
  // are preserved even if our parsing missed them due to complex code block structures.
  try {
    // Check if we have already recorded any preserved content with 'Important'
    const hasImportantPreserved = task.metadata.preservedContent.some(item => {
      return /important/i.test(item.content || '');
    });
    if (!hasImportantPreserved) {
      // Find all level-2 headers that contain the word 'important' (case-insensitive)
      const contentLines = content.split(/\r?\n/);
      contentLines.forEach((origLine) => {
        const tl = origLine.trim();
        if (/^##\s+/.test(tl) && /important/i.test(tl)) {
          // Remove the leading '##' and any following space to get the header name
          const headerName = tl.replace(/^##\s+/, '').trim();
          task.metadata.preservedContent.push({
            type: 'section-header',
            content: headerName,
            level: 2
          });
        }
      });
    }
  } catch (err) {
    // If any error occurs during this fallback, ignore and proceed
  }
  
  return task;
}

// Parse markdown checklist file into structured format
function parseChecklistMarkdown(content, filename) {
  const lines = content.split('\n');
  const checklist = {
    id: path.basename(filename, '.md'),
    name: '',
    categories: [],
    result: {
      status: 'pending',
      notes: ''
    },
    metadata: {
      preservedContent: []
    }
  };
  
  let currentCategory = null;
  let inResultSection = false;
  let inCodeBlock = false;
  let llmNotes = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track code blocks
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    
    // Main title
    if (trimmed.startsWith('# ') && !inCodeBlock) {
      checklist.name = trimmed.substring(2).trim();
      continue;
    }
    
    // Category headers (## level)
    if (trimmed.startsWith('## ') && !inCodeBlock) {
      const categoryName = trimmed.substring(3).trim();
      
      if (categoryName.toLowerCase().includes('result') || 
          categoryName.toLowerCase().includes('assessment')) {
        inResultSection = true;
        continue;
      }
      
      inResultSection = false;
      
      // Skip numeric prefixes in category names
      const cleanName = categoryName.replace(/^\d+\.\s*/, '');
      
      currentCategory = {
        name: cleanName,
        items: [],
        notes: '',
        metadata: {
          originalName: categoryName
        }
      };
      checklist.categories.push(currentCategory);
      llmNotes = []; // Reset LLM notes for new category
      continue;
    }
    
    // Collect LLM instruction blocks
    if (line.includes('[[LLM:') && !inCodeBlock) {
      const match = line.match(/\[\[LLM:\s*([\s\S]*?)(?:\]\]|$)/);
      if (match) {
        llmNotes.push(match[1]);
      }
      // Continue collecting multi-line LLM blocks
      if (!line.includes(']]')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(']]')) {
          llmNotes.push(lines[j]);
          j++;
        }
        if (j < lines.length) {
          const endMatch = lines[j].match(/^(.*?)\]\]/);
          if (endMatch) {
            llmNotes.push(endMatch[1]);
          }
        }
        i = j; // Skip processed lines
      }
      
      if (currentCategory && llmNotes.length > 0) {
        currentCategory.notes = llmNotes.join('\n').trim();
      }
      continue;
    }
    
    // Checklist items
    if (trimmed.startsWith('- [ ] ') && currentCategory && !inResultSection && !inCodeBlock) {
      const itemText = trimmed.substring(6).trim();
      currentCategory.items.push({
        description: itemText,
        checked: false
      });
      continue;
    }
    
    // Result section content
    if (inResultSection && trimmed.length > 0 && !trimmed.startsWith('#')) {
      checklist.result.notes += line + '\n';
    }
  }
  
  // Clean up notes
  checklist.categories.forEach(cat => {
    cat.notes = (cat.notes || '').trim();
    if (!cat.notes) delete cat.notes;
    
    // Validate category
    if (cat.items.length === 0) {
      validationResults.warnings.push(`${filename}: Category "${cat.name}" has no items`);
    }
  });
  
  checklist.result.notes = checklist.result.notes.trim();
  
  // Validate checklist
  if (!checklist.name) {
    validationResults.errors.push(`${filename}: Missing checklist name (# header)`);
  }
  if (checklist.categories.length === 0) {
    validationResults.errors.push(`${filename}: No categories found`);
  }
  
  return checklist;
}

// Validate converted content can be restored
function validateConversion(original, converted, filename) {
  // Check for potential data loss
  const importantPatterns = [
    /SEQUENTIAL/i,
    /CRITICAL/i,
    /IMPORTANT/i,
    /WARNING/i,
    /\[\[LLM:/,
    /```[\s\S]*?```/
  ];
  
  importantPatterns.forEach(pattern => {
    const originalMatches = (original.match(pattern) || []).length;
    const convertedMatches = (JSON.stringify(converted).match(pattern) || []).length;
    
    if (originalMatches > convertedMatches) {
      validationResults.dataLoss.push({
        file: filename,
        pattern: pattern.toString(),
        lost: originalMatches - convertedMatches
      });
    }
  });
}

// Safe file operations with error handling
async function safeReadFile(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})`);
    }
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}

async function safeWriteFile(filePath, content) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    if (dryRun) {
      log.verbose(`[DRY RUN] Would write to: ${filePath}`);
      return;
    }
    
    // Create backup if requested
    if (createBackup && fs.existsSync(filePath)) {
      const backupPath = filePath + BACKUP_SUFFIX;
      await fs.promises.copyFile(filePath, backupPath);
      log.verbose(`Created backup: ${backupPath}`);
    }
    
    await fs.promises.writeFile(filePath, content);
  } catch (error) {
    throw new Error(`Failed to write ${filePath}: ${error.message}`);
  }
}

// Convert a single file with error handling
async function convertFile(sourceFile, outputFile, parseFunction, type) {
  try {
    log.verbose(`Converting ${path.basename(sourceFile)}...`);
    
    const content = await safeReadFile(sourceFile);
    const parsed = parseFunction(content, path.basename(sourceFile));
    
    // Validate conversion
    validateConversion(content, parsed, path.basename(sourceFile));
    
    const yamlContent = yaml.dump(parsed, { 
      lineWidth: 120, // Reasonable line width
      quotingType: '"',
      forceQuotes: false,
      noRefs: true
    });
    
    await safeWriteFile(outputFile, yamlContent);
    
    if (!dryRun) {
      log.success(`Converted ${path.basename(sourceFile)} -> ${path.basename(outputFile)}`);
    }
    
    return { success: true };
  } catch (error) {
    log.error(`Failed to convert ${path.basename(sourceFile)}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main conversion function with comprehensive error handling
async function convertFiles() {
  const tasksDir = path.join(__dirname, '..', 'tasks');
  const checklistsDir = path.join(__dirname, '..', 'checklists');
  const structuredTasksDir = path.join(__dirname, '..', 'structured-tasks');
  const structuredChecklistsDir = path.join(__dirname, '..', 'structured-checklists');
  
  // Also handle common folder
  const commonTasksDir = path.join(__dirname, '..', '..', 'common', 'tasks');
  const commonChecklistsDir = path.join(__dirname, '..', '..', 'common', 'checklists');
  const commonStructuredTasksDir = path.join(__dirname, '..', '..', 'common', 'structured-tasks');
  const commonStructuredChecklistsDir = path.join(__dirname, '..', '..', 'common', 'structured-checklists');
  
  log.info('Starting conversion of tasks and checklists to YAML format...');
  if (dryRun) {
    log.info('[DRY RUN MODE] No files will be modified\n');
  }
  
  const conversionStats = {
    tasks: { total: 0, success: 0, failed: 0 },
    checklists: { total: 0, success: 0, failed: 0 }
  };
  
  // Convert tasks
  try {
    log.info('Converting tasks...');
    const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md'));
    conversionStats.tasks.total = taskFiles.length;
    
    for (const file of taskFiles) {
      const result = await convertFile(
        path.join(tasksDir, file),
        path.join(structuredTasksDir, file.replace('.md', '.yaml')),
        parseTaskMarkdown,
        'task'
      );
      
      if (result.success) {
        conversionStats.tasks.success++;
      } else {
        conversionStats.tasks.failed++;
      }
    }
  } catch (error) {
    log.error(`Failed to process tasks directory: ${error.message}`);
  }
  
  // Convert checklists
  try {
    log.info('\nConverting checklists...');
    const checklistFiles = fs.readdirSync(checklistsDir).filter(f => f.endsWith('.md'));
    conversionStats.checklists.total = checklistFiles.length;
    
    for (const file of checklistFiles) {
      const result = await convertFile(
        path.join(checklistsDir, file),
        path.join(structuredChecklistsDir, file.replace('.md', '.yaml')),
        parseChecklistMarkdown,
        'checklist'
      );
      
      if (result.success) {
        conversionStats.checklists.success++;
      } else {
        conversionStats.checklists.failed++;
      }
    }
  } catch (error) {
    log.error(`Failed to process checklists directory: ${error.message}`);
  }
  
  // Convert common tasks if directory exists
  if (fs.existsSync(commonTasksDir)) {
    try {
      log.info('\nConverting common tasks...');
      const commonTaskFiles = fs.readdirSync(commonTasksDir).filter(f => f.endsWith('.md'));
      conversionStats.tasks.total += commonTaskFiles.length;
      
      for (const file of commonTaskFiles) {
        const result = await convertFile(
          path.join(commonTasksDir, file),
          path.join(commonStructuredTasksDir, file.replace('.md', '.yaml')),
          parseTaskMarkdown,
          'task'
        );
        
        if (result.success) {
          conversionStats.tasks.success++;
        } else {
          conversionStats.tasks.failed++;
        }
      }
    } catch (error) {
      log.error(`Failed to process common tasks: ${error.message}`);
    }
  }
  
  // Print summary
  log.info('\n=== Conversion Summary ===');
  log.info(`Tasks: ${conversionStats.tasks.success}/${conversionStats.tasks.total} converted successfully`);
  log.info(`Checklists: ${conversionStats.checklists.success}/${conversionStats.checklists.total} converted successfully`);
  
  if (validationResults.errors.length > 0) {
    log.info('\n=== Validation Errors ===');
    validationResults.errors.forEach(err => log.error(err));
  }
  
  if (validationResults.warnings.length > 0) {
    log.info('\n=== Validation Warnings ===');
    validationResults.warnings.forEach(warn => log.warn(warn));
  }
  
  if (validationResults.dataLoss.length > 0) {
    log.info('\n=== Potential Data Loss ===');
    validationResults.dataLoss.forEach(loss => {
      log.warn(`${loss.file}: ${loss.lost} instances of ${loss.pattern} may be lost`);
    });
  }
  
  const totalFailed = conversionStats.tasks.failed + conversionStats.checklists.failed;
  if (totalFailed > 0) {
    log.error(`\nConversion completed with ${totalFailed} failures`);
    process.exit(1);
  } else if (validationResults.errors.length > 0) {
    log.warn('\nConversion completed with validation errors');
    process.exit(2);
  } else {
    log.success('\nConversion completed successfully!');
  }
}

// Show usage
function showUsage() {
  console.log(`
Usage: node convert-tasks-v2.js [options]

Options:
  --dry-run     Preview changes without modifying files
  --verbose     Show detailed logging
  --no-backup   Skip creating backup files
  --help        Show this help message

Examples:
  node convert-tasks-v2.js                    # Convert all files
  node convert-tasks-v2.js --dry-run         # Preview conversion
  node convert-tasks-v2.js --verbose         # Show detailed output
`);
}

// Run the conversion
if (require.main === module) {
  if (args.includes('--help')) {
    showUsage();
    process.exit(0);
  }
  
  convertFiles().catch(error => {
    log.error(`Unexpected error: ${error.message}`);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { parseTaskMarkdown, parseChecklistMarkdown, validateConversion };