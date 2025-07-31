const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { parseFile, analyzeCrossFileDependencies, isFileSupported } = require('./dependency-parser');
const { storeSymbolDependency, removeFileSymbols, getDependencyStats } = require('./dependency-analyzer');\nconst { logger } = require('./logger');

/**
 * Repository scanner that analyzes the codebase and populates Qdrant
 * with dependency information for impact analysis
 */

/**
 * Default configuration for repository scanning
 */
const DEFAULT_CONFIG = {
  // Patterns to include
  include: [
    '**/*.js',
    '**/*.ts',
    '**/*.jsx',
    '**/*.tsx',
    '**/*.py',
    '**/*.java'
  ],
  
  // Patterns to exclude
  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    'coverage/**',
    '*.min.js',
    '*.test.js',
    '*.spec.js',
    '__pycache__/**',
    '*.pyc',
    'target/**',
    '.class'
  ],
  
  // Maximum file size to process (in bytes)
  maxFileSize: 1024 * 1024, // 1MB
  
  // Whether to process test files
  includeTests: false,
  
  // Whether to show progress during scanning
  showProgress: true,
  
  // Repository root directory
  rootDir: process.cwd(),
  
  // Streaming/chunking configuration for memory efficiency
  batchSize: 50, // Process files in batches
  pauseBetweenBatches: 100, // ms pause between batches
  memoryThreshold: 500 * 1024 * 1024, // 500MB memory threshold
  enableMemoryMonitoring: true
};

/**
 * Scan a single file and store its dependencies
 */
async function scanFile(filePath, config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    // Check file size
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (error) {
      const contextError = new Error(`Failed to get file stats for '${filePath}': ${error.message}`);
      contextError.originalError = error;
      console.error(contextError.message);
      return { success: false, reason: contextError.message };
    }
    
    if (stats.size > fullConfig.maxFileSize) {
      const message = `File too large: ${filePath} (${stats.size} bytes > ${fullConfig.maxFileSize} bytes)`;
      console.warn(message);
      return { success: false, reason: message };
    }
    
    // Check if file is supported
    if (!isFileSupported(filePath)) {
      return { success: false, reason: 'Unsupported file type' };
    }
    
    // Parse the file
    const relativePath = path.relative(fullConfig.rootDir, filePath);
    const { symbols, fileHash } = parseFile(filePath);
    
    if (!symbols || symbols.length === 0) {
      return { success: true, symbolCount: 0 };
    }
    
    // Store each symbol in Qdrant
    const storedIds = [];
    for (const symbol of symbols) {
      try {
        const id = await storeSymbolDependency({
          ...symbol,
          filePath: relativePath // Store relative path
        });
        storedIds.push(id);
      } catch (error) {
        const contextError = new Error(`Failed to store symbol '${symbol.symbolName}' from '${relativePath}' at line ${symbol.lineNumber}: ${error.message}`);
        contextError.originalError = error;
        contextError.context = { symbol, filePath: relativePath };
        console.error(contextError.message);
        // Continue with other symbols instead of failing completely
      }
    }
    
    return {
      success: true,
      symbolCount: symbols.length,
      storedIds,
      fileHash
    };
  } catch (error) {
    const contextError = new Error(`Critical error scanning file '${filePath}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { filePath, config: fullConfig };
    console.error(contextError.message);
    return { success: false, reason: contextError.message };
  }
}

/**
 * Get all files to scan based on include/exclude patterns
 */
async function getFilesToScan(config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const files = [];
  
  // Process include patterns
  for (const pattern of fullConfig.include) {
    try {
      const matches = await glob(pattern, {
        cwd: fullConfig.rootDir,
        ignore: fullConfig.exclude,
        absolute: true
      });
      files.push(...matches);
    } catch (error) {
      const contextError = new Error(`Failed to process glob pattern '${pattern}': ${error.message}`);
      contextError.originalError = error;
      contextError.context = { pattern, rootDir: fullConfig.rootDir };
      console.error(contextError.message);
      // Continue with other patterns
    }
  }
  
  // Remove duplicates and filter
  const uniqueFiles = [...new Set(files)];
  
  // Filter out test files if not included
  const filteredFiles = fullConfig.includeTests 
    ? uniqueFiles
    : uniqueFiles.filter(file => {
        const basename = path.basename(file);
        return !basename.includes('.test.') && 
               !basename.includes('.spec.') &&
               !basename.includes('test_') &&
               !file.includes('/tests/') &&
               !file.includes('/test/');
      });
  
  return filteredFiles.sort();
}

/**
 * Monitor memory usage during scanning
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss
  };
}

/**
 * Force garbage collection if available
 */
function forceGarbageCollection() {
  if (global.gc) {
    global.gc();
  }
}

/**
 * Process files in batches for memory efficiency
 */
async function processBatch(filesBatch, fullConfig, batchIndex) {
  const batchResults = {
    filesScanned: 0,
    filesSkipped: 0,
    symbolsStored: 0,
    errors: []
  };
  
  console.log(`Processing batch ${batchIndex + 1}: ${filesBatch.length} files`);
  
  for (let i = 0; i < filesBatch.length; i++) {
    const file = filesBatch[i];
    
    // Memory monitoring
    if (fullConfig.enableMemoryMonitoring && i % 10 === 0) {
      const memUsage = getMemoryUsage();
      if (memUsage.heapUsed > fullConfig.memoryThreshold) {
        console.warn(`High memory usage detected: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        forceGarbageCollection();
        await new Promise(resolve => setTimeout(resolve, 50)); // Brief pause
      }
    }
    
    const result = await scanFile(file, fullConfig);
    
    if (result.success) {
      batchResults.filesScanned++;
      batchResults.symbolsStored += result.symbolCount || 0;
    } else {
      batchResults.filesSkipped++;
      batchResults.errors.push({
        file: path.relative(fullConfig.rootDir, file),
        reason: result.reason
      });
    }
  }
  
  // Force garbage collection after each batch
  if (fullConfig.enableMemoryMonitoring) {
    forceGarbageCollection();
  }
  
  return batchResults;
}

/**
 * Scan the entire repository and populate dependency information
 * Uses streaming/chunked processing for memory efficiency
 */
async function scanRepository(config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  
  console.log('Starting repository dependency scan...');
  console.log(`Root directory: ${fullConfig.rootDir}`);
  console.log(`Batch size: ${fullConfig.batchSize}, Memory monitoring: ${fullConfig.enableMemoryMonitoring}`);
  
  try {
    // Get all files to scan
    const files = await getFilesToScan(fullConfig);
    console.log(`Found ${files.length} files to analyze`);
    
    if (files.length === 0) {
      console.log('No files found to scan');
      return { success: true, filesScanned: 0, symbolsStored: 0 };
    }
    
    // Initialize results
    const results = {
      filesScanned: 0,
      filesSkipped: 0,
      symbolsStored: 0,
      errors: [],
      memoryStats: []
    };
    
    // Process files in batches for memory efficiency
    const totalBatches = Math.ceil(files.length / fullConfig.batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * fullConfig.batchSize;
      const endIdx = Math.min(startIdx + fullConfig.batchSize, files.length);
      const filesBatch = files.slice(startIdx, endIdx);
      
      if (fullConfig.showProgress) {
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (files ${startIdx + 1}-${endIdx}/${files.length})`);
      }
      
      // Record memory usage before batch
      if (fullConfig.enableMemoryMonitoring) {
        const memBefore = getMemoryUsage();
        results.memoryStats.push({
          batch: batchIndex + 1,
          memoryBefore: memBefore,
          timestamp: new Date().toISOString()
        });
      }
      
      // Process the batch
      const batchResult = await processBatch(filesBatch, fullConfig, batchIndex);
      
      // Aggregate results
      results.filesScanned += batchResult.filesScanned;
      results.filesSkipped += batchResult.filesSkipped;
      results.symbolsStored += batchResult.symbolsStored;
      results.errors.push(...batchResult.errors);
      
      // Record memory usage after batch
      if (fullConfig.enableMemoryMonitoring) {
        const memAfter = getMemoryUsage();
        const lastStat = results.memoryStats[results.memoryStats.length - 1];
        lastStat.memoryAfter = memAfter;
        lastStat.memoryDelta = memAfter.heapUsed - lastStat.memoryBefore.heapUsed;
      }
      
      // Pause between batches to allow memory cleanup
      if (batchIndex < totalBatches - 1 && fullConfig.pauseBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, fullConfig.pauseBetweenBatches));
      }
    }
    
    // Perform cross-file dependency analysis (if enabled and memory allows)
    if (fullConfig.enableCrossFileAnalysis && results.symbolsStored < 10000) {
      console.log('Analyzing cross-file dependencies...');
      // Note: Only perform cross-file analysis for smaller codebases to avoid memory issues
      // This feature can be enhanced in future iterations
    } else {
      console.log('Skipping cross-file dependency analysis (large codebase or disabled)');
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('Repository scan completed!');
    console.log(`Files scanned: ${results.filesScanned}`);
    console.log(`Files skipped: ${results.filesSkipped}`);
    console.log(`Symbols stored: ${results.symbolsStored}`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    
    // Memory usage summary
    if (fullConfig.enableMemoryMonitoring && results.memoryStats.length > 0) {
      const maxMemory = Math.max(...results.memoryStats.map(s => s.memoryAfter?.heapUsed || 0));
      const avgMemory = results.memoryStats.reduce((sum, s) => sum + (s.memoryAfter?.heapUsed || 0), 0) / results.memoryStats.length;
      console.log(`\nMemory Usage:`);
      console.log(`  Peak: ${Math.round(maxMemory / 1024 / 1024)}MB`);
      console.log(`  Average: ${Math.round(avgMemory / 1024 / 1024)}MB`);
      console.log(`  Batches processed: ${results.memoryStats.length}`);
    }
    
    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.errors.slice(0, 10).forEach(error => { // Show first 10 errors
        console.log(`  ${error.file}: ${error.reason}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... and ${results.errors.length - 10} more errors`);
      }
    }
    
    // Show final stats
    const stats = await getDependencyStats();
    console.log('\nDependency Database Stats:');
    console.log(`Total symbols: ${stats.totalSymbols}`);
    console.log('Symbol types:', stats.typeDistribution);
    
    return {
      success: true,
      ...results,
      duration,
      stats
    };
    
  } catch (error) {
    const contextError = new Error(`Repository scan failed for directory '${fullConfig.rootDir}': ${error.message}`);
    contextError.originalError = error;
    contextError.context = { 
      rootDir: fullConfig.rootDir, 
      config: fullConfig,
      scanPhase: 'repository_scan'
    };
    console.error(contextError.message);
    return {
      success: false,
      error: contextError.message,
      context: contextError.context
    };
  }
}

/**
 * Scan only files that have changed since the last scan
 */
async function scanChangedFiles(changedFiles, config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  console.log(`Scanning ${changedFiles.length} changed files...`);
  
  const results = {
    filesScanned: 0,
    filesSkipped: 0,
    symbolsStored: 0,
    errors: []
  };
  
  for (const file of changedFiles) {
    const absolutePath = path.resolve(fullConfig.rootDir, file);
    
    // Remove old symbols for this file first
    await removeFileSymbols(file);
    
    // Scan the file if it still exists
    if (fs.existsSync(absolutePath)) {
      const result = await scanFile(absolutePath, fullConfig);
      
      if (result.success) {
        results.filesScanned++;
        results.symbolsStored += result.symbolCount || 0;
      } else {
        results.filesSkipped++;
        results.errors.push({
          file,
          reason: result.reason
        });
      }
    } else {
      // File was deleted, symbols already removed
      console.log(`File deleted: ${file}`);
    }
  }
  
  console.log(`Changed files scan completed: ${results.filesScanned} scanned, ${results.symbolsStored} symbols stored`);
  return results;
}

/**
 * Watch for file changes and update dependencies incrementally
 */
function watchRepository(config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const chokidar = require('chokidar');
  
  console.log('Starting repository watch for dependency updates...');
  
  const watcher = chokidar.watch(fullConfig.include, {
    ignored: fullConfig.exclude,
    cwd: fullConfig.rootDir,
    persistent: true
  });
  
  const changedFiles = new Set();
  let scanTimeout = null;
  
  const processBatch = async () => {
    if (changedFiles.size > 0) {
      const files = Array.from(changedFiles);
      changedFiles.clear();
      await scanChangedFiles(files, fullConfig);
    }
  };
  
  watcher
    .on('change', filePath => {
      if (isFileSupported(filePath)) {
        changedFiles.add(filePath);
        
        // Batch changes to avoid too frequent scans
        if (scanTimeout) {
          clearTimeout(scanTimeout);
        }
        scanTimeout = setTimeout(processBatch, 5000); // 5 second delay
      }
    })
    .on('unlink', filePath => {
      if (isFileSupported(filePath)) {
        removeFileSymbols(filePath);
      }
    });
  
  return watcher;
}

module.exports = {
  scanRepository,
  scanFile,
  scanChangedFiles,
  watchRepository,
  getFilesToScan,
  DEFAULT_CONFIG,
  processBatch, // Export for testing
  getMemoryUsage // Export for monitoring
};