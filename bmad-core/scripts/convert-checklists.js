#!/usr/bin/env node
/*
 * Script to convert checklist markdown files to structured YAML.
 *
 * This script scans the `checklists` directory (and optionally a common checklists
 * directory) for markdown files, parses them into a structured JavaScript
 * object, validates that critical annotations and code blocks are preserved,
 * and writes the result as YAML into a parallel `structured-checklists` directory.
 *
 * It shares much of its design with the `convert-tasks-v2.js` script used for
 * task conversion, but is tailored to the structure and nuances of checklists.
 */

const fs = require('fs');
const path = require('path');

// Attempt to require js-yaml; if unavailable, fall back to JSON serialization.
let yaml;
try {
  yaml = require('js-yaml');
} catch (err) {
  yaml = {
    dump: function (obj, options) {
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

// Parse markdown checklist file into structured format with preservation of special notes and code blocks
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
  let capturingCodeBlock = false;
  let codeBlockLines = [];
  let llmNotes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code blocks and preserve them either at top level or within a category
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
        // Preserve the entire code block
        const codeBlockContent = codeBlockLines.join('\n');
        if (!currentCategory) {
          checklist.metadata.preservedContent.push({
            type: 'code-block',
            content: codeBlockContent,
            lineNumber: i + 1 - codeBlockLines.length + 1
          });
        } else {
          // Append code block to category notes
          currentCategory.notes = (currentCategory.notes || '') + codeBlockContent + '\n';
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
      checklist.name = trimmed.substring(2).trim();
      continue;
    }

    // Category headers (## level)
    if (trimmed.startsWith('## ') && !inCodeBlock) {
      const categoryName = trimmed.substring(3).trim();

      // Detect result sections by name
      if (categoryName.toLowerCase().includes('result') ||
          categoryName.toLowerCase().includes('assessment')) {
        inResultSection = true;
        continue;
      }
      inResultSection = false;

      // Skip numeric prefixes in category names (e.g., '1. Requirements')
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
      llmNotes = [];
      continue;
    }

    // Collect LLM instruction blocks. Treat the entire block as a special note so that important lines inside are preserved.
    if (line.includes('[[LLM:') && !inCodeBlock) {
      // Start of an LLM instruction block. Capture the entire block including following lines until closing ']]'.
      const blockLines = [];
      blockLines.push(line);
      let endIndex = i;
      // If the opening line does not contain the closing ']]', continue gathering lines
      if (!line.includes(']]')) {
        let j = i + 1;
        while (j < lines.length) {
          blockLines.push(lines[j]);
          if (lines[j].includes(']]')) {
            endIndex = j;
            break;
          }
          j++;
        }
        i = endIndex; // Advance outer loop to end of block
      }
      // Push the entire block as a single preserved content entry
      checklist.metadata.preservedContent.push({
        type: 'special-note',
        content: blockLines.join('\n'),
        lineNumber: i + 1 - blockLines.length + 1
      });
      // Also capture content into category notes if applicable
      // Remove the opening tag [[LLM: and closing ]] for notes
      const innerContentLines = blockLines
        .map((l) => {
          // Remove outer [[LLM: prefix and closing ]] suffix
          return l
            .replace(/\[\[LLM:\s*/, '')
            .replace(/\]\]$/, '')
            .replace(/\]\]$/, '');
        })
        .join('\n');
      if (currentCategory) {
        // Append to existing notes (if any)
        currentCategory.notes = (currentCategory.notes || '') + innerContentLines.trim() + '\n';
      }
      // Move to next line after closing tag
      continue;
    }

    // Detect special notes (CRITICAL, IMPORTANT, WARNING, NOTE) outside of code blocks
    // Strip markdown emphasis characters and normalize diacritics
    const clean = line.replace(/[\*_`]/g, '');
    const normalized = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasCritical = /\bCRITICAL\b/i.test(normalized);
    const hasImportant = /\bIMPORTANT\b/i.test(normalized);
    const hasWarning = /\bWARNING\b/i.test(normalized);
    const hasNote = /\bNOTE\b/i.test(normalized);
    if (hasCritical || hasImportant || hasWarning || hasNote) {
      checklist.metadata.preservedContent.push({
        type: 'special-note',
        content: line,
        lineNumber: i + 1
      });
    }

    // Checklist items (unchecked). Only capture if within a category and not in result or code block
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

  // Clean up notes for categories
  checklist.categories.forEach((cat) => {
    cat.notes = (cat.notes || '').trim();
    if (!cat.notes) delete cat.notes;
    // Warn if category has no items
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

// Validate converted content can be restored by checking for important patterns
function validateConversion(original, converted, filename) {
  const importantPatterns = [
    /CRITICAL/i,
    /IMPORTANT/i,
    /WARNING/i,
    /NOTE/i,
    /\[\[LLM:/,
    /```[\s\S]*?```/
  ];
  importantPatterns.forEach((pattern) => {
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

// Convert a single checklist file with error handling
async function convertFile(sourceFile, outputFile) {
  try {
    log.verbose(`Converting ${path.basename(sourceFile)}...`);
    const content = await safeReadFile(sourceFile);
    const parsed = parseChecklistMarkdown(content, path.basename(sourceFile));
    // Validate conversion
    validateConversion(content, parsed, path.basename(sourceFile));
    // Dump YAML
    const yamlContent = yaml.dump(parsed, {
      lineWidth: 120,
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

// Main conversion function
async function convertChecklists() {
  // Determine directories relative to script location
  const checklistsDir = path.join(__dirname, '..', 'checklists');
  const structuredChecklistsDir = path.join(__dirname, '..', 'structured-checklists');
  const commonChecklistsDir = path.join(__dirname, '..', '..', 'common', 'checklists');
  const commonStructuredChecklistsDir = path.join(__dirname, '..', '..', 'common', 'structured-checklists');

  log.info('Starting conversion of checklists to YAML format...');
  if (dryRun) {
    log.info('[DRY RUN MODE] No files will be modified\n');
  }

  const stats = { total: 0, success: 0, failed: 0 };

  // Convert primary checklists
  try {
    log.info('Converting checklists...');
    const files = fs.existsSync(checklistsDir)
      ? fs.readdirSync(checklistsDir).filter((f) => f.toLowerCase().endsWith('.md'))
      : [];
    stats.total += files.length;
    for (const file of files) {
      const result = await convertFile(
        path.join(checklistsDir, file),
        path.join(structuredChecklistsDir, file.replace(/\.md$/i, '.yaml'))
      );
      if (result.success) {
        stats.success++;
      } else {
        stats.failed++;
      }
    }
  } catch (error) {
    log.error(`Failed to process checklists directory: ${error.message}`);
  }

  // Convert common checklists if directory exists
  if (fs.existsSync(commonChecklistsDir)) {
    try {
      log.info('\nConverting common checklists...');
      const commonFiles = fs
        .readdirSync(commonChecklistsDir)
        .filter((f) => f.toLowerCase().endsWith('.md'));
      stats.total += commonFiles.length;
      for (const file of commonFiles) {
        const result = await convertFile(
          path.join(commonChecklistsDir, file),
          path.join(commonStructuredChecklistsDir, file.replace(/\.md$/i, '.yaml'))
        );
        if (result.success) {
          stats.success++;
        } else {
          stats.failed++;
        }
      }
    } catch (error) {
      log.error(`Failed to process common checklists: ${error.message}`);
    }
  }

  // Print summary
  log.info('\n=== Conversion Summary ===');
  log.info(`Checklists: ${stats.success}/${stats.total} converted successfully`);
  if (validationResults.errors.length > 0) {
    log.info('\n=== Validation Errors ===');
    validationResults.errors.forEach((err) => log.error(err));
  }
  if (validationResults.warnings.length > 0) {
    log.info('\n=== Validation Warnings ===');
    validationResults.warnings.forEach((warn) => log.warn(warn));
  }
  if (validationResults.dataLoss.length > 0) {
    log.info('\n=== Potential Data Loss ===');
    validationResults.dataLoss.forEach((loss) => {
      log.warn(`${loss.file}: ${loss.lost} instances of ${loss.pattern} may be lost`);
    });
  }
  if (stats.failed > 0) {
    log.error(`\nConversion completed with ${stats.failed} failures`);
    process.exit(1);
  } else if (validationResults.errors.length > 0) {
    log.warn('\nConversion completed with validation errors');
    process.exit(2);
  } else {
    log.success('\nConversion completed successfully!');
  }
}

// Show usage information
function showUsage() {
  console.log(`\nUsage: node convert-checklists-v2.js [options]

Options:
  --dry-run     Preview changes without modifying files
  --verbose     Show detailed logging
  --no-backup   Skip creating backup files
  --help        Show this help message

Examples:
  node convert-checklists-v2.js                     # Convert all checklist files
  node convert-checklists-v2.js --dry-run          # Preview conversion
  node convert-checklists-v2.js --verbose          # Show detailed output
`);
}

// Entry point
if (require.main === module) {
  if (args.includes('--help')) {
    showUsage();
    process.exit(0);
  }
  convertChecklists().catch((error) => {
    log.error(`Unexpected error: ${error.message}`);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { parseChecklistMarkdown, validateConversion };