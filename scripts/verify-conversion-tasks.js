#!/usr/bin/env node
/**
 * Verification script to compare an original Markdown file with its converted YAML representation.
 *
 * Usage:
 *   node verifyConversion.js <original.md> <converted.yaml>  // Verify a single pair
 *   node verifyConversion.js                                 // Auto-mode: verify all tasks
 *
 * The script checks for potential data loss by looking for important patterns
 * (e.g. "SEQUENTIAL", "CRITICAL", "IMPORTANT", "WARNING", LLM tags, and code blocks)
 * in the original markdown and ensuring they are preserved in the YAML output.
 */

const fs = require('fs');
const path = require('path');

// Try to require js-yaml; fall back to JSON parsing if unavailable
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

function countPatternMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Verify a single Markdown/YAML pair for data loss of critical patterns.
 * Returns true if no data loss detected, false otherwise.
 */
async function verifyFile(mdPath, yamlPath) {
  try {
    const original = await fs.promises.readFile(mdPath, 'utf8');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    const parsed = yaml.load(yamlContent);
    const convertedStr = JSON.stringify(parsed);
    const importantPatterns = [
      /SEQUENTIAL/i,
      /CRITICAL/i,
      /IMPORTANT/i,
      /WARNING/i,
      /\[\[LLM:/,
      /```[\s\S]*?```/
    ];
    let hasLoss = false;
    importantPatterns.forEach((pattern) => {
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
 * Main entry point. If two arguments are provided, verifies that specific file pair.
 * Otherwise, automatically verifies all Markdown files in bmad-core/tasks against their
 * corresponding YAML files in bmad-core/structured-tasks.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    const [mdPath, yamlPath] = args;
    const success = await verifyFile(mdPath, yamlPath);
    if (success) {
      console.log('✅  No data loss detected for critical patterns.');
    }
    return;
  }

  // Auto mode: scan tasks and structured-tasks directories relative to script location
  const scriptsDir = __dirname;
  const tasksDir = path.resolve(scriptsDir, '..', 'bmad-core', 'tasks');
  const structuredDir = path.resolve(scriptsDir, '..', 'bmad-core', 'structured-tasks');
  let overallPass = true;
  try {
    const mdFiles = fs
      .readdirSync(tasksDir)
      .filter((f) => f.toLowerCase().endsWith('.md'));
    if (mdFiles.length === 0) {
      console.log('No Markdown files found in tasks directory:', tasksDir);
      return;
    }
    for (const file of mdFiles) {
      const mdPath = path.join(tasksDir, file);
      const yamlPath = path.join(structuredDir, file.replace(/\.md$/i, '.yaml'));
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
  } catch (err) {
    console.error('Error during automatic verification:', err.message);
  }
}

if (require.main === module) {
  main();
}
