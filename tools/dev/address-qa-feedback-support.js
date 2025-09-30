const fs = require('fs');
const path = require('path');

const { upsertStorySection } = require('./qa-feedback-utils');

function loadPreviousTrackerState(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn('Failed to read existing QA fix tracking, starting fresh:', error.message);
    return null;
  }
}

function restorePreviousCompletions(tracker, previousState) {
  if (!previousState || !previousState.workflow) {
    return;
  }

  const applied = new Set();

  if (Array.isArray(previousState.fixResults)) {
    for (const result of previousState.fixResults) {
      if (!result || !result.fixId) continue;
      const restored = tracker.completeFix(result.fixId, result.verification || { note: 'Restored from saved state' });
      if (restored) {
        applied.add(result.fixId);
      }
    }
  }

  if (Array.isArray(previousState.workflow.tasks)) {
    for (const task of previousState.workflow.tasks) {
      if (task.status === 'completed' && !applied.has(task.id)) {
        tracker.completeFix(task.id, { note: 'Restored completion status' });
      }
    }
  }
}

function applyCompletionFlags(tracker, completions) {
  const timestamp = new Date().toISOString();
  for (const completion of completions) {
    const verification = {
      note: completion.verification || 'Marked complete via --complete flag',
      recordedAt: timestamp
    };
    const result = tracker.completeFix(completion.fixId, verification);
    if (!result) {
      console.warn(`  • Fix ${completion.fixId} not found in tracker; verify the identifier.`);
    } else {
      console.log(`  • Fix ${completion.fixId} recorded.`);
    }
  }
}

function logChecklistSummary(fixReport) {
  console.log('📝 QA fix checklist summary');
  console.log(`  - Critical:   ${fixReport.fixedIssues.critical}/${fixReport.totalIssues.critical}`);
  console.log(`  - Major:      ${fixReport.fixedIssues.major}/${fixReport.totalIssues.major}`);
  console.log(`  - Minor:      ${fixReport.fixedIssues.minor}/${fixReport.totalIssues.minor}`);
  console.log(`  - Checklist:  ${fixReport.fixedIssues.checklist}/${fixReport.totalIssues.checklist}`);
  console.log(`  - Completion: ${fixReport.completionRate}%`);
}

function collectImpactedFiles(findings, storyContract, projectRoot) {
  const files = new Set();

  function addFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return;
    const trimmed = filePath.trim();
    if (!trimmed) return;
    const absolute = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(projectRoot, trimmed);
    const relative = path.relative(projectRoot, absolute);
    files.add(relative);
  }

  const severities = ['critical', 'major', 'minor'];
  for (const severity of severities) {
    const issues = findings.findings && findings.findings[severity];
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      addFile(issue.file);
    }
  }

  if (Array.isArray(findings.checklist)) {
    for (const item of findings.checklist) {
      addFile(item.file);
    }
  }

  if (storyContract && Array.isArray(storyContract.filesToModify)) {
    for (const entry of storyContract.filesToModify) {
      addFile(entry && entry.path);
    }
  }

  return Array.from(files).sort();
}

function appendBullet(content, sectionTitle, bullet) {
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`(^|\n)(##\s+${escapedTitle}\s*\n)([\s\S]*?)(?=\n##\s|\n#\s|$)`, 'i');

  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, (full, prefix, heading, body) => {
      const trimmedBody = body.trimEnd();
      const trailingNewline = trimmedBody.endsWith('\n') ? '' : '\n';
      return `${prefix}${heading}${trimmedBody}${trailingNewline}${bullet}\n`;
    });
  }

  return `${content.trimEnd()}\n\n## ${sectionTitle}\n${bullet}\n\n`;
}

function updateStoryFile(storyPath, originalContent, { testsPassed, fixReport, reportPath }) {
  let content = originalContent;
  const completionNote = `- QA fixes completed on ${new Date().toISOString()} (Completion ${fixReport.completionRate}%, Tests: ${testsPassed ? 'PASS' : 'FAIL'})`;
  const changeLogEntry = `- QA feedback addressed (see ${reportPath})`;

  content = upsertStorySection(content, 'Status', `${testsPassed ? 'Ready for Review' : 'Needs Fixes'}\n`);
  content = appendBullet(content, 'Completion Notes', completionNote);
  content = appendBullet(content, 'Change Log', changeLogEntry);

  if (content !== originalContent) {
    fs.writeFileSync(storyPath, content, 'utf8');
    return true;
  }

  return false;
}

function listPendingFixes(pending) {
  console.error('  Pending fixes:');
  for (const fix of pending) {
    console.error(`    • [${fix.severity.toUpperCase()}] ${fix.id}${fix.file ? ` (${fix.file})` : ''}`);
  }
}

module.exports = {
  loadPreviousTrackerState,
  restorePreviousCompletions,
  applyCompletionFlags,
  logChecklistSummary,
  collectImpactedFiles,
  appendBullet,
  updateStoryFile,
  listPendingFixes
};
