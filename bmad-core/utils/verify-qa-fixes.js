#!/usr/bin/env node

/**
 * Verify QA Fixes Utility
 * Loads and displays the current status of QA fix tracking
 */

const QAFixTracker = require('./qa-fix-tracker');
const fs = require('fs');
const path = require('path');

/**
 * Load and display QA fix status
 * @param {string} directory - Directory containing tracking files (default: .ai)
 * @returns {Object|null} Fix report or null if no tracking found
 */
function verifyQAFixes(directory = '.ai') {
  const tracker = new QAFixTracker();
  
  console.log('\n=== QA Fix Verification ===\n');
  
  // Try to load existing tracking
  if (!tracker.loadFixTracking(directory)) {
    console.log('❌ No QA fix tracking found.');
    console.log('   Run the address-qa-feedback task first to initialize tracking.\n');
    return null;
  }
  
  // Generate current report
  const report = tracker.generateFixReport();
  
  // Display summary
  console.log('📊 QA Fix Summary');
  console.log('─'.repeat(50));
  console.log(`Original Quality Score: ${report.findings.qualityMetrics.score}/100 (Grade: ${report.findings.qualityMetrics.grade})`);
  console.log(`Review Date: ${report.findings.reviewDate || 'Unknown'}`);
  console.log(`Reviewed By: ${report.findings.reviewedBy || 'Unknown'}`);
  console.log('');
  
  // Display issue counts
  console.log('📋 Issue Status:');
  console.log(`   Critical: ${report.fixedIssues.critical}/${report.totalIssues.critical} fixed ${report.totalIssues.critical === report.fixedIssues.critical ? '✅' : '⚠️'}`);
  console.log(`   Major: ${report.fixedIssues.major}/${report.totalIssues.major} fixed`);
  console.log(`   Minor: ${report.fixedIssues.minor}/${report.totalIssues.minor} fixed`);
  console.log(`   Checklist: ${report.fixedIssues.checklist}/${report.totalIssues.checklist} completed`);
  console.log('');
  
  // Display completion rate
  const progressBar = generateProgressBar(report.completionRate);
  console.log(`📈 Overall Progress: ${progressBar} ${report.completionRate}%`);
  console.log('');
  
  // Show completed fixes
  if (report.completedFixes.length > 0) {
    console.log('✅ Completed Fixes:');
    report.completedFixes.forEach(fix => {
      console.log(`   - ${fix.id}: ${fix.description.substring(0, 60)}...`);
      if (fix.file) {
        console.log(`     File: ${fix.file}`);
      }
    });
    console.log('');
  }
  
  // Show pending fixes
  if (report.pendingFixes.length > 0) {
    console.log('⏳ Pending Fixes:');
    
    // Group by severity
    const critical = report.pendingFixes.filter(f => f.severity === 'critical');
    const major = report.pendingFixes.filter(f => f.severity === 'major');
    const minor = report.pendingFixes.filter(f => f.severity === 'minor');
    const checklist = report.pendingFixes.filter(f => f.severity === 'checklist');
    
    if (critical.length > 0) {
      console.log('   🔴 CRITICAL:');
      critical.forEach(fix => {
        console.log(`      - ${fix.id}: ${fix.description.substring(0, 50)}...`);
      });
    }
    
    if (major.length > 0) {
      console.log('   🟠 MAJOR:');
      major.forEach(fix => {
        console.log(`      - ${fix.id}: ${fix.description.substring(0, 50)}...`);
      });
    }
    
    if (minor.length > 0) {
      console.log('   🟡 MINOR:');
      minor.forEach(fix => {
        console.log(`      - ${fix.id}: ${fix.description.substring(0, 50)}...`);
      });
    }
    
    if (checklist.length > 0) {
      console.log('   📝 CHECKLIST:');
      checklist.forEach(fix => {
        console.log(`      - ${fix.id}: ${fix.description.substring(0, 50)}...`);
      });
    }
    console.log('');
  }
  
  // Critical issues warning
  const pendingCritical = tracker.getPendingCriticalIssues();
  if (pendingCritical.length > 0) {
    console.log('⚠️  WARNING: Critical issues remain unfixed!');
    console.log('   Story cannot be approved until all critical issues are resolved.\n');
  } else if (report.totalIssues.critical > 0) {
    console.log('✅ All critical issues have been resolved!\n');
  }
  
  // Recommendations
  console.log('💡 Recommendations:');
  if (pendingCritical.length > 0) {
    console.log('   1. Fix all critical issues immediately');
    console.log('   2. Run tests after each fix');
    console.log('   3. Update tracking with fix verification');
  } else if (report.completionRate < 100) {
    console.log('   1. Continue addressing remaining issues');
    console.log('   2. Focus on major issues next');
    console.log('   3. Complete checklist items for quality');
  } else {
    console.log('   1. All issues addressed! 🎉');
    console.log('   2. Run final validation suite');
    console.log('   3. Mark story as Ready for Review');
  }
  
  console.log('\n' + '─'.repeat(50) + '\n');
  
  return report;
}

/**
 * Generate a visual progress bar
 * @param {number} percentage - Completion percentage (0-100)
 * @returns {string} Visual progress bar
 */
function generateProgressBar(percentage) {
  const width = 20;
  const filled = Math.floor(width * percentage / 100);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// If run directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const directory = args[0] || '.ai';
  
  try {
    const report = verifyQAFixes(directory);
    process.exit(report && report.completionRate === 100 ? 0 : 1);
  } catch (error) {
    console.error('Error verifying QA fixes:', error.message);
    process.exit(2);
  }
}

module.exports = { verifyQAFixes };