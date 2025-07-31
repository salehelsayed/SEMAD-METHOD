const { queryImpactedSymbols, querySymbolsInFile, searchSymbols } = require('./dependency-analyzer');
const { parseFile } = require('./dependency-parser');
const fs = require('fs');
const path = require('path');

/**
 * High-level dependency impact checking utilities for Dev and QA agents
 * Provides functions to analyze potential impacts of code changes
 */

/**
 * Check what symbols would be impacted by changes to a specific file
 */
async function checkFileImpact(filePath, rootDir = process.cwd()) {
  try {
    // Normalize file path to relative path
    const relativePath = path.isAbsolute(filePath) 
      ? path.relative(rootDir, filePath)
      : filePath;
    
    // Get symbols that depend on this file
    const impactedSymbols = await queryImpactedSymbols(relativePath);
    
    // Get symbols defined in this file
    const fileSymbols = await querySymbolsInFile(relativePath);
    
    // Group impacts by file
    const impactsByFile = {};
    impactedSymbols.forEach(symbol => {
      if (!impactsByFile[symbol.filePath]) {
        impactsByFile[symbol.filePath] = [];
      }
      impactsByFile[symbol.filePath].push(symbol);
    });
    
    return {
      targetFile: relativePath,
      symbolsInFile: fileSymbols,
      impactedSymbols,
      impactedFiles: Object.keys(impactsByFile),
      impactsByFile,
      totalImpacted: impactedSymbols.length
    };
  } catch (error) {
    console.error(`Error checking file impact for ${filePath}:`, error.message);
    return {
      targetFile: filePath,
      symbolsInFile: [],
      impactedSymbols: [],
      impactedFiles: [],
      impactsByFile: {},
      totalImpacted: 0,
      error: error.message
    };
  }
}

/**
 * Check impact of specific symbol changes
 */
async function checkSymbolImpact(filePath, symbolNames, rootDir = process.cwd()) {
  try {
    const relativePath = path.isAbsolute(filePath) 
      ? path.relative(rootDir, filePath)
      : filePath;
    
    // Query for symbols that depend on the specific symbols
    const impactedSymbols = await queryImpactedSymbols(relativePath, symbolNames);
    
    // Group by symbol and file
    const impactsBySymbol = {};
    symbolNames.forEach(symbolName => {
      impactsBySymbol[symbolName] = impactedSymbols.filter(symbol => 
        symbol.dependencies.some(dep => dep.includes(symbolName))
      );
    });
    
    const impactsByFile = {};
    impactedSymbols.forEach(symbol => {
      if (!impactsByFile[symbol.filePath]) {
        impactsByFile[symbol.filePath] = [];
      }
      impactsByFile[symbol.filePath].push(symbol);
    });
    
    return {
      targetFile: relativePath,
      targetSymbols: symbolNames,
      impactedSymbols,
      impactsBySymbol,
      impactsByFile,
      impactedFiles: Object.keys(impactsByFile),
      totalImpacted: impactedSymbols.length
    };
  } catch (error) {
    console.error(`Error checking symbol impact:`, error.message);
    return {
      targetFile: filePath,
      targetSymbols: symbolNames,
      impactedSymbols: [],
      impactsBySymbol: {},
      impactsByFile: {},
      impactedFiles: [],
      totalImpacted: 0,
      error: error.message
    };
  }
}

/**
 * Analyze the dependency impact of a list of files (e.g., from a git diff)
 */
async function analyzeBatchImpact(filePaths, rootDir = process.cwd()) {
  const results = {
    totalFiles: filePaths.length,
    analyzedFiles: 0,
    impactSummary: {
      totalImpactedSymbols: 0,
      totalImpactedFiles: new Set(),
      highRiskFiles: [], // Files with many dependencies
      criticalImpacts: [] // Impacts on important symbols
    },
    fileResults: []
  };
  
  for (const filePath of filePaths) {
    try {
      const impact = await checkFileImpact(filePath, rootDir);
      results.fileResults.push(impact);
      results.analyzedFiles++;
      
      // Update summary
      results.impactSummary.totalImpactedSymbols += impact.totalImpacted;
      impact.impactedFiles.forEach(file => 
        results.impactSummary.totalImpactedFiles.add(file)
      );
      
      // Identify high-risk files (> 10 impacted symbols)
      if (impact.totalImpacted > 10) {
        results.impactSummary.highRiskFiles.push({
          file: filePath,
          impactedSymbols: impact.totalImpacted,
          impactedFiles: impact.impactedFiles.length
        });
      }
      
      // Identify critical impacts (on classes or important functions)
      const criticalSymbols = impact.impactedSymbols.filter(symbol => 
        symbol.symbolType === 'class' || 
        symbol.symbolName.toLowerCase().includes('main') ||
        symbol.symbolName.toLowerCase().includes('init') ||
        symbol.dependencies.length > 5
      );
      
      if (criticalSymbols.length > 0) {
        results.impactSummary.criticalImpacts.push({
          file: filePath,
          criticalSymbols: criticalSymbols.map(s => ({
            name: s.symbolName,
            type: s.symbolType,
            file: s.filePath,
            dependencyCount: s.dependencies.length
          }))
        });
      }
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
      results.fileResults.push({
        targetFile: filePath,
        error: error.message,
        symbolsInFile: [],
        impactedSymbols: [],
        impactedFiles: [],
        totalImpacted: 0
      });
    }
  }
  
  // Convert set to array
  results.impactSummary.totalImpactedFiles = Array.from(results.impactSummary.totalImpactedFiles);
  
  return results;
}

/**
 * Generate a dependency impact report for Dev/QA review
 */
function generateImpactReport(impactResults, options = {}) {
  const { 
    includeDetails = true, 
    maxDetailsPerFile = 5,
    format = 'markdown' 
  } = options;
  
  let report = '';
  
  if (format === 'markdown') {
    report += '# Dependency Impact Analysis Report\n\n';
    
    if (impactResults.error) {
      report += `⚠️ **Error**: ${impactResults.error}\n\n`;
      return report;
    }
    
    // Summary section
    if (impactResults.impactSummary) {
      const summary = impactResults.impactSummary;
      report += '## Summary\n\n';
      report += `- **Files analyzed**: ${impactResults.analyzedFiles}/${impactResults.totalFiles}\n`;
      report += `- **Total impacted symbols**: ${summary.totalImpactedSymbols}\n`;
      report += `- **Total impacted files**: ${summary.totalImpactedFiles.length}\n`;
      
      if (summary.highRiskFiles.length > 0) {
        report += `- **High-risk changes**: ${summary.highRiskFiles.length} files\n`;
      }
      
      if (summary.criticalImpacts.length > 0) {
        report += `- **Critical impacts detected**: ${summary.criticalImpacts.length} files\n`;
      }
      
      report += '\n';
      
      // High-risk files
      if (summary.highRiskFiles.length > 0) {
        report += '## ⚠️ High-Risk Changes\n\n';
        summary.highRiskFiles.forEach(risk => {
          report += `- **${risk.file}**: ${risk.impactedSymbols} impacted symbols across ${risk.impactedFiles} files\n`;
        });
        report += '\n';
      }
      
      // Critical impacts
      if (summary.criticalImpacts.length > 0) {
        report += '## 🚨 Critical Impacts\n\n';
        summary.criticalImpacts.forEach(critical => {
          report += `### ${critical.file}\n`;
          critical.criticalSymbols.forEach(symbol => {
            report += `- **${symbol.name}** (${symbol.type}) in ${symbol.file} - ${symbol.dependencyCount} dependencies\n`;
          });
          report += '\n';
        });
      }
    } else {
      // Single file report
      report += '## File Impact Analysis\n\n';
      report += `**Target File**: ${impactResults.targetFile}\n\n`;
      
      if (impactResults.symbolsInFile && impactResults.symbolsInFile.length > 0) {
        report += `**Symbols in file**: ${impactResults.symbolsInFile.length}\n`;
      }
      
      report += `**Impacted symbols**: ${impactResults.totalImpacted}\n`;
      report += `**Impacted files**: ${impactResults.impactedFiles.length}\n\n`;
      
      if (impactResults.totalImpacted > 0) {
        report += '### Impacted Files\n\n';
        Object.entries(impactResults.impactsByFile).forEach(([file, symbols]) => {
          report += `- **${file}**: ${symbols.length} symbols\n`;
          if (includeDetails) {
            symbols.slice(0, maxDetailsPerFile).forEach(symbol => {
              report += `  - ${symbol.symbolName} (${symbol.symbolType}) at line ${symbol.lineNumber}\n`;
            });
            if (symbols.length > maxDetailsPerFile) {
              report += `  - ... and ${symbols.length - maxDetailsPerFile} more\n`;
            }
          }
        });
      }
    }
    
    // Recommendations
    report += '\n## Recommendations\n\n';
    
    if (impactResults.totalImpacted === 0) {
      report += '✅ No dependency impacts detected. Changes appear to be isolated.\n';
    } else if (impactResults.totalImpacted < 5) {
      report += '⚠️ Low impact detected. Review the affected symbols and consider updating tests.\n';
    } else if (impactResults.totalImpacted < 15) {
      report += '⚠️ Medium impact detected. Carefully review all affected files and ensure comprehensive testing.\n';
    } else {
      report += '🚨 High impact detected. Consider breaking changes into smaller pieces and ensure thorough testing of all affected components.\n';
    }
    
    report += '\n';
  }
  
  return report;
}

/**
 * Quick check for common risky changes
 */
async function quickRiskAssessment(filePaths, rootDir = process.cwd()) {
  const risks = {
    high: [],
    medium: [],
    low: []
  };
  
  for (const filePath of filePaths) {
    try {
      const impact = await checkFileImpact(filePath, rootDir);
      
      // Categorize risk based on impact count and file patterns
      const isConfigFile = filePath.includes('config') || filePath.includes('settings');
      const isUtilityFile = filePath.includes('util') || filePath.includes('helper') || filePath.includes('common');
      const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');
      
      if (isTestFile) {
        risks.low.push({ file: filePath, reason: 'Test file', impact: impact.totalImpacted });
      } else if (impact.totalImpacted > 20 || (isConfigFile && impact.totalImpacted > 5)) {
        risks.high.push({ file: filePath, reason: 'High dependency impact', impact: impact.totalImpacted });
      } else if (impact.totalImpacted > 5 || isUtilityFile) {
        risks.medium.push({ file: filePath, reason: 'Medium dependency impact', impact: impact.totalImpacted });
      } else {
        risks.low.push({ file: filePath, reason: 'Low dependency impact', impact: impact.totalImpacted });
      }
    } catch (error) {
      risks.high.push({ file: filePath, reason: `Analysis failed: ${error.message}`, impact: 0 });
    }
  }
  
  return risks;
}

module.exports = {
  checkFileImpact,
  checkSymbolImpact,
  analyzeBatchImpact,
  generateImpactReport,
  quickRiskAssessment
};