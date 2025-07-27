#!/usr/bin/env node
/**
 * Verification script for checklist Markdown to YAML conversions.
 *
 * Usage:
 *   node verifyChecklists.js <original.md> <converted.yaml>
 *     Verifies a single Markdown/YAML pair and reports potential data loss.
 *
 *   node verifyChecklists.js
 *     In this mode, the script automatically locates all Markdown files in
 *     the "checklists" directory (relative to this script) and matches them
 *     with corresponding YAML files in the "structured-checklists" directory.
 *     It reports whether critical content is preserved in each conversion.
 *
 * This verification focuses on ensuring that critical annotations and content
 * remain intact after conversion. Specifically, it checks occurrences of:
 *   - The keywords CRITICAL, IMPORTANT, WARNING, NOTE (case-insensitive)
 *   - LLM instructions marked with [[LLM:
 *   - Fenced code blocks (``` ... ```)
 * For each pattern, if the converted YAML representation contains fewer
 * occurrences than the original Markdown, a warning is printed. Otherwise,
 * the file passes verification.
 */

const fs = require('fs');
const path = require('path');

// Attempt to require js-yaml; fall back to JSON parsing if unavailable.
let yaml;
try {
  yaml = require('js-yaml');
} catch (err) {
  yaml = {
    load: function (str) {
      return JSON.parse(str);
    }
  };
}

/**
 * Count the number of matches for a given regular expression in a string.
 * @param {string} text The text to search.
 * @param {RegExp} pattern The regular expression pattern.
 * @returns {number} Number of matches.
 */
function countPatternMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Verify a single Markdown/YAML pair for potential data loss of critical patterns.
 * @param {string} mdPath Path to the original Markdown file.
 * @param {string} yamlPath Path to the converted YAML file.
 * @returns {Promise<boolean>} Returns true if no data loss detected, false otherwise.
 */
async function verifyFile(mdPath, yamlPath) {
  try {
    const original = await fs.promises.readFile(mdPath, 'utf8');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    let converted;
    try {
      converted = yaml.load(yamlContent);
    } catch (err) {
      console.error(`  Error parsing YAML for ${path.basename(mdPath)}: ${err.message}`);
      return false;
    }
    const convertedStr = JSON.stringify(converted);
    // Define critical patterns to compare
    const patterns = [
      /CRITICAL/i,
      /IMPORTANT/i,
      /WARNING/i,
      /NOTE/i,
      /\[\[LLM:/,
      /```[\s\S]*?```/
    ];
    let hasLoss = false;
    patterns.forEach((pattern) => {
      const originalCount = countPatternMatches(original, pattern);
      const convertedCount = countPatternMatches(convertedStr, pattern);
      if (originalCount > convertedCount) {
        console.log(
          `  ❌ Pattern ${pattern} appears ${originalCount - convertedCount} more time(s) in the original than in the YAML.`
        );
        hasLoss = true;
      }
    });
    return !hasLoss;
  } catch (err) {
    console.error(`  Error verifying ${path.basename(mdPath)}: ${err.message}`);
    return false;
  }
}

/**
 * Automatic verification for all checklist files.
 * Scans the "checklists" directory relative to this script and attempts to
 * find matching YAML files in "structured-checklists". Reports on any
 * mismatches or data loss.
 */
async function verifyAll() {
  const scriptDir = __dirname;
  /*
   * Determine where to look for Markdown and YAML files. By default we expect
   * checklist markdown files in a sibling "checklists" directory and their
   * converted YAML counterparts in "structured-checklists". However, the
   * BMad repository places these directories under "bmad-core". To support
   * both layouts, we check for the presence of a "bmad-core/checklists"
   * directory first. If it exists, we use that along with
   * "bmad-core/structured-checklists"; otherwise we fall back to the
   * top-level locations.
   */
  let mdDir = path.resolve(scriptDir, '..', 'checklists');
  let yamlDir = path.resolve(scriptDir, '..', 'structured-checklists');
  // Check for bmad-core subdirectory
  const bmadMdDir = path.resolve(scriptDir, '..', 'bmad-core', 'checklists');
  const bmadYamlDir = path.resolve(scriptDir, '..', 'bmad-core', 'structured-checklists');
  if (fs.existsSync(bmadMdDir)) {
    mdDir = bmadMdDir;
    yamlDir = bmadYamlDir;
  }
  let overallPass = true;
  // Collect Markdown files
  let mdFiles = [];
  if (fs.existsSync(mdDir)) {
    mdFiles = fs.readdirSync(mdDir).filter((f) => f.toLowerCase().endsWith('.md'));
  }
  if (mdFiles.length === 0) {
    console.log('No Markdown files found in checklists directory:', mdDir);
    return;
  }
  for (const file of mdFiles) {
    const mdPath = path.join(mdDir, file);
    const yamlPath = path.join(yamlDir, file.replace(/\.md$/i, '.yaml'));
    console.log(`Checking ${file}...`);
    if (!fs.existsSync(yamlPath)) {
      console.log(`  ⚠️  Corresponding YAML file not found: ${yamlPath}`);
      overallPass = false;
      continue;
    }
    const ok = await verifyFile(mdPath, yamlPath);
    if (ok) {
      console.log('  ✅  No data loss detected for critical patterns.');
    } else {
      overallPass = false;
    }
  }
  if (overallPass) {
    console.log('\nSummary: All files passed verification.');
  } else {
    console.log('\nSummary: Some files have potential data loss.');
  }
}

// Entry point: determine mode based on arguments
async function main() {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    // Verify specific file pair
    const [mdPath, yamlPath] = args;
    const success = await verifyFile(mdPath, yamlPath);
    if (success) {
      console.log('✅  No data loss detected for critical patterns.');
    }
    return;
  }
  // Auto mode
  await verifyAll();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Unexpected error during verification:', err.message);
  });
}

module.exports = { verifyFile, verifyAll };