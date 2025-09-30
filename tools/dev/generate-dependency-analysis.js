#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const {
  loadStoryContract,
  normalizeStoryId,
  deriveWorkItems
} = require('../../semad-core/utils/story-contract');

const {
  analyzeBatchImpact,
  generateImpactReport
} = require('../../semad-core/utils/dependency-impact-checker');

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(token);
    }
  }
  return result;
}

function ensureDir(targetFile) {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyArg = args.story || args._[0];
  if (!storyArg) {
    console.error('Usage: generate-dependency-analysis --story <path-to-story.md>');
    process.exit(2);
  }

  const rootDir = process.cwd();
  const storyPath = path.isAbsolute(storyArg) ? storyArg : path.join(rootDir, storyArg);

  if (!fs.existsSync(storyPath)) {
    console.error(chalk.red(`Story not found: ${storyPath}`));
    process.exit(2);
  }

  let contract;
  try {
    ({ contract } = loadStoryContract(storyPath));
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(3);
  }

  const workItems = deriveWorkItems(contract);
  const filesToAnalyze = workItems
    .map(item => item.path)
    .filter(Boolean)
    .map(filePath => path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath));

  if (filesToAnalyze.length === 0) {
    console.error(chalk.red('No filesToModify defined in StoryContract; cannot produce dependency analysis.'));
    process.exit(4);
  }

  const storyId = contract?.story?.storyId || normalizeStoryId(contract, storyPath);
  const relativeStoryPath = path.relative(rootDir, storyPath);

  console.log(chalk.blue('🔍 Running dependency impact analysis for develop-story automation...'));

  let analysis;
  try {
    analysis = await analyzeBatchImpact(filesToAnalyze, rootDir);
  } catch (error) {
    console.error(chalk.red(`Failed to analyze dependencies: ${error.message}`));
    process.exit(5);
  }

  const impactedFiles = Array.isArray(analysis?.impactSummary?.totalImpactedFiles)
    ? analysis.impactSummary.totalImpactedFiles
    : [];
  const highRisk = Array.isArray(analysis?.impactSummary?.highRiskFiles)
    ? analysis.impactSummary.highRiskFiles
    : [];

  if (highRisk.length) {
    console.warn(chalk.yellow(`⚠️  High-risk dependency fan-out detected (${highRisk.length} files). Review dependency impact report before proceeding.`));
  }

  const outputDir = path.join(rootDir, '.ai');
  ensureDir(path.join(outputDir, 'dependency_analysis.json'));

  const payload = {
    storyId,
    storyPath: relativeStoryPath,
    generatedAt: new Date().toISOString(),
    filesAnalyzed: filesToAnalyze.map(filePath => path.relative(rootDir, filePath)),
    impactSummary: analysis?.impactSummary || {},
    analysis
  };

  const jsonPath = path.join(outputDir, 'dependency_analysis.json');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const report = generateImpactReport(analysis, { format: 'markdown' });
  const reportPath = path.join(outputDir, 'dependency_impact_report.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  console.log(chalk.green('✅ Legacy dependency analysis generated.'));
  console.log(`  JSON: ${path.relative(rootDir, jsonPath)}`);
  console.log(`  Report: ${path.relative(rootDir, reportPath)}`);
  console.log(`  Impacted files: ${impactedFiles.length}`);

  process.exit(0);
}

main().catch(error => {
  console.error(chalk.red(error.message));
  process.exit(1);
});
