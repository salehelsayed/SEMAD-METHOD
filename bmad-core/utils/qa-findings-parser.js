/**
 * QA Findings Parser
 * Parses QA Results section from story files into structured JSON format
 */

class QAFindingsParser {
  /**
   * Parse QA Results section from story content
   * @param {string} storyContent - Full story file content
   * @returns {Object} Structured QA findings
   */
  parseQAResults(storyContent) {
    const findings = {
      reviewDate: '',
      reviewedBy: '',
      qualityMetrics: {
        score: 0,
        grade: '',
        criticalIssues: 0,
        majorIssues: 0,
        minorIssues: 0
      },
      findings: {
        critical: [],
        major: [],
        minor: []
      },
      checklist: [],
      refactoring: [],
      security: [],
      performance: [],
      approved: false
    };

    // Handle null/undefined/empty content
    if (!storyContent || typeof storyContent !== 'string') {
      console.log('Invalid story content provided to parser');
      return findings;
    }

    // Extract QA Results section - match until end of content or next ## header
    const qaResultsMatch = storyContent.match(/##\s*QA Results([\s\S]*?)$/i);
    if (!qaResultsMatch) {
      console.log('No QA Results section found in story');
      return findings;
    }

    const qaSection = qaResultsMatch[1];

    // Parse review date
    const dateMatch = qaSection.match(/Review Date:\s*(.+)/i);
    if (dateMatch) {
      findings.reviewDate = dateMatch[1].trim();
    }

    // Parse reviewer
    const reviewerMatch = qaSection.match(/Reviewed By:\s*(.+)/i);
    if (reviewerMatch) {
      findings.reviewedBy = reviewerMatch[1].trim();
    }

    // Parse quality metrics
    const scoreMatch = qaSection.match(/Overall Quality Score:\s*(\d+)\/100/i);
    if (scoreMatch) {
      findings.qualityMetrics.score = parseInt(scoreMatch[1]);
    }

    const gradeMatch = qaSection.match(/Quality Grade:\s*([A-F])/i);
    if (gradeMatch) {
      findings.qualityMetrics.grade = gradeMatch[1];
    }

    const criticalMatch = qaSection.match(/Critical Issues:\s*(\d+)/i);
    if (criticalMatch) {
      findings.qualityMetrics.criticalIssues = parseInt(criticalMatch[1]);
    }

    const majorMatch = qaSection.match(/Major Issues:\s*(\d+)/i);
    if (majorMatch) {
      findings.qualityMetrics.majorIssues = parseInt(majorMatch[1]);
    }

    const minorMatch = qaSection.match(/Minor Issues:\s*(\d+)/i);
    if (minorMatch) {
      findings.qualityMetrics.minorIssues = parseInt(minorMatch[1]);
    }

    // Parse findings by severity
    this.parseSeverityFindings(qaSection, findings);

    // Parse checklist items
    this.parseChecklist(qaSection, findings);

    // Check if approved
    findings.approved = qaSection.toLowerCase().includes('approved') && 
                       !qaSection.toLowerCase().includes('not approved');

    return findings;
  }

  /**
   * Parse findings by severity level
   * @private
   */
  parseSeverityFindings(qaSection, findings) {
    // Parse critical issues
    const criticalSection = qaSection.match(/####?\s*Critical Issues([\s\S]*?)(?=####?\s*|$)/i);
    if (criticalSection) {
      findings.findings.critical = this.parseIssueList(criticalSection[1]);
    }

    // Parse major issues
    const majorSection = qaSection.match(/####?\s*Major Issues([\s\S]*?)(?=####?\s*|$)/i);
    if (majorSection) {
      findings.findings.major = this.parseIssueList(majorSection[1]);
    }

    // Parse minor issues
    const minorSection = qaSection.match(/####?\s*Minor Issues([\s\S]*?)(?=####?\s*|$)/i);
    if (minorSection) {
      findings.findings.minor = this.parseIssueList(minorSection[1]);
    }
  }

  /**
   * Parse issue list from section content
   * @private
   */
  parseIssueList(sectionContent) {
    const issues = [];
    const issuePattern = /\d+\.\s*\*\*(.+?)\*\*[\s\S]*?(?=\d+\.\s*\*\*|$)/g;
    let match;

    while ((match = issuePattern.exec(sectionContent)) !== null) {
      const issueBlock = match[0];
      const issue = {
        title: match[1].trim(),
        file: '',
        line: '',
        description: '',
        fix: ''
      };

      // Extract file
      const fileMatch = issueBlock.match(/File:\s*`?(.+?)`?(?:\n|$)/i);
      if (fileMatch) {
        issue.file = fileMatch[1].trim();
      }

      // Extract line numbers
      const lineMatch = issueBlock.match(/Line:\s*(\d+(?:-\d+)?)/i);
      if (lineMatch) {
        issue.line = lineMatch[1];
      }

      // Extract issue description
      const issueDescMatch = issueBlock.match(/Issue:\s*(.+?)(?=\n\s*-|$)/is);
      if (issueDescMatch) {
        issue.description = issueDescMatch[1].trim();
      }

      // Extract fix recommendation
      const fixMatch = issueBlock.match(/Fix:\s*(.+?)(?=\n\d+\.|$)/is);
      if (fixMatch) {
        issue.fix = fixMatch[1].trim();
      }

      issues.push(issue);
    }

    return issues;
  }

  /**
   * Parse checklist items
   * @private
   */
  parseChecklist(qaSection, findings) {
    // Look for improvements checklist section
    const checklistSection = qaSection.match(/####?\s*Improvements? Checklist([\s\S]*?)(?=####?\s*|$)/i);
    if (!checklistSection) return;

    const content = checklistSection[1];
    
    // Parse structured checklist items (with ID format)
    const structuredPattern = /- \[([ x])\]\s*ID:([^\s|]+)\s*\|\s*File:([^\s|]+)\s*\|\s*(.+)/g;
    let match;

    while ((match = structuredPattern.exec(content)) !== null) {
      findings.checklist.push({
        id: match[2].trim(),
        description: match[4].trim(),
        file: match[3].trim(),
        completed: match[1] === 'x'
      });
    }

    // Also parse unstructured checklist items (but avoid duplicating structured ones)
    const unstructuredPattern = /- \[([ x])\]\s*(?!ID:)(.+)/g;
    let unstructuredMatch;
    let unstructuredId = 0;

    while ((unstructuredMatch = unstructuredPattern.exec(content)) !== null) {
      const description = unstructuredMatch[2].trim();
      
      // Skip if this looks like it might be a duplicate of a structured item
      const isDuplicate = findings.checklist.some(item => 
        description.includes(item.description) || item.description.includes(description)
      );
      
      if (!isDuplicate) {
        const fileMatch = description.match(/`(.+?)`/);
        
        findings.checklist.push({
          id: `item-${++unstructuredId}`,
          description: description,
          file: fileMatch ? fileMatch[1] : '',
          completed: unstructuredMatch[1] === 'x'
        });
      }
    }

    // Parse refactoring suggestions
    if (content.includes('Refactoring')) {
      const refactoringItems = content.match(/(?:refactor|extract|move|rename).+/gi) || [];
      findings.refactoring = refactoringItems.map(item => item.trim());
    }

    // Parse security concerns
    if (content.includes('Security')) {
      const securityItems = content.match(/(?:security|vulnerability|sanitize|validate).+/gi) || [];
      findings.security = securityItems.map(item => item.trim());
    }

    // Parse performance issues
    if (content.includes('Performance')) {
      const performanceItems = content.match(/(?:performance|optimize|cache|memory).+/gi) || [];
      findings.performance = performanceItems.map(item => item.trim());
    }
  }
}

module.exports = QAFindingsParser;