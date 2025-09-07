#!/bin/bash

# QA Review using actual QA Agent workflow definitions
# This script extracts the real QA agent tasks and converts them to Claude commands

STORY_FILE="$1"
PROJECT_ROOT="$(pwd)"
WORKFLOW_FILE=".semad-core/structured-tasks/review-story.yaml"

if [ -z "$STORY_FILE" ]; then
    echo "Usage: $0 <story-file>"
    echo "Example: $0 docs/stories/story-0.1-emergency-security-fixes.md"
    exit 1
fi

if [ ! -f "$STORY_FILE" ]; then
    echo "❌ Story file not found: $STORY_FILE"
    exit 1
fi

if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ QA workflow not found at: $WORKFLOW_FILE"
    echo "Make sure you're in the project root directory"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "    🔍 QA Review Using Official QA Agent Workflow"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📋 Workflow: $WORKFLOW_FILE"
echo ""

# Extract story information
STORY_TITLE=$(grep "story_title:" "$STORY_FILE" | head -1 | sed 's/.*story_title: *//')
STORY_ID=$(grep "story_id:" "$STORY_FILE" | head -1 | sed 's/.*story_id: *//')
CURRENT_STATUS=$(grep "status:" "$STORY_FILE" | head -1 | sed 's/.*status: *//')

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo "🏷️  Current Status: $CURRENT_STATUS"
echo ""

# Extract implementation files from story
echo "📂 Implementation Files to Review:"
grep -E "^\s+- (lib|src|app|test)/" "$STORY_FILE" | head -10
echo ""

# Extract acceptance criteria
echo "✅ Acceptance Criteria to Verify:"
sed -n '/acceptanceCriteria:/,/^[^ ]/p' "$STORY_FILE" | grep "description:" | sed 's/.*description: */  - /'
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "    📋 QA AGENT WORKFLOW STEPS (from review-story.yaml)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Parse the workflow file and extract steps that need Claude (elicit: true)
echo "The QA Agent performs these steps that require LLM analysis:"
echo ""

# Step 1: Update Status
echo "──────────────────────────────────────────────────────────"
echo "STEP 1: Update Status to 'In QA'"
echo "──────────────────────────────────────────────────────────"
echo "Run this command to update status:"
echo ""
echo "sed -i '' 's/status: .*/status: In QA/' $STORY_FILE"
echo ""

# Step 2: Code Implementation Review
echo "──────────────────────────────────────────────────────────"
echo "STEP 2: Review Code Implementation"
echo "──────────────────────────────────────────────────────────"
echo "From workflow: 'Perform comprehensive code quality review'"
echo ""
echo "🔸 Action: Check code against acceptance criteria"
echo "Run this Claude command:"
echo ""
cat << 'EOF'
claude -p "Context: Review Code Implementation - Perform comprehensive code quality review

Task: Check code against acceptance criteria to verify all requirements are met

Acceptance Criteria to verify:
EOF
sed -n '/acceptanceCriteria:/,/^[^ ]/p' "$STORY_FILE" | grep -E "description:|id:" | head -20
cat << 'EOF'

Review the implementation and confirm each criterion is met.
Provide a concise, practical response."
EOF
echo ""

# Step 3: Security Analysis
echo "──────────────────────────────────────────────────────────"
echo "STEP 3: Security and Performance Analysis"
echo "──────────────────────────────────────────────────────────"
echo "From workflow: 'Review for security vulnerabilities'"
echo ""
echo "Run this Claude command:"
echo ""
cat << 'EOF'
claude -p "Context: Security and Performance Analysis

Task: Check for common security issues like SQL injection, XSS, or authentication bypasses

Review these specific security concerns from the story:
EOF
sed -n '/securityVulnerabilities:/,/^[^ ]/p' "$STORY_FILE" | grep -E "title:|severity:|impact:" | head -10
cat << 'EOF'

Focus on: security vulnerabilities, input validation, data sanitization, authentication.
Provide specific, actionable recommendations."
EOF
echo ""

# Step 4: Final QA Decision
echo "──────────────────────────────────────────────────────────"
echo "STEP 4: Final QA Decision"
echo "──────────────────────────────────────────────────────────"
echo "From workflow: 'Update Story File QA Section and Final Status'"
echo ""
echo "🔸 Action: Determine if implementation is approved"
echo "Run this Claude command:"
echo ""
cat << 'EOF'
claude -p "Context: Update Story File QA Section and Final Status

Task: Determine if implementation is approved based on review findings and quality thresholds

Consider:
- Were all acceptance criteria met?
- Were security issues properly addressed?
- Is the code quality acceptable?
- Are there any blocking issues?

Final decision: Should this story be approved (QA Approved) or rejected (QA Failed)?
List specific issues if rejecting.

Provide a concise, practical response."
EOF
echo ""

# Step 5: Update Final Status
echo "──────────────────────────────────────────────────────────"
echo "STEP 5: Update Final Story Status"
echo "──────────────────────────────────────────────────────────"
echo ""
echo "Based on Claude's decision, run ONE of these commands:"
echo ""
echo "✅ TO APPROVE:"
echo "sed -i '' 's/status: .*/status: QA Approved/' $STORY_FILE"
echo ""
echo "❌ TO REJECT:"
echo "sed -i '' 's/status: .*/status: QA Failed/' $STORY_FILE"
echo ""

# Optional: Add QA notes to story
echo "──────────────────────────────────────────────────────────"
echo "OPTIONAL: Add QA Review Notes to Story"
echo "──────────────────────────────────────────────────────────"
echo ""
echo "Add your review findings to the story file:"
echo "echo '## QA Results' >> $STORY_FILE"
echo "echo '- Review Date: $(date +%Y-%m-%d)' >> $STORY_FILE"
echo "echo '- Reviewer: Manual QA via Claude CLI' >> $STORY_FILE"
echo "echo '- Decision: [APPROVED/FAILED]' >> $STORY_FILE"
echo "echo '- Issues Found: [List any issues]' >> $STORY_FILE"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "    ✨ Ready to perform QA review!"
echo "    Copy and run the Claude commands above in sequence."
echo "═══════════════════════════════════════════════════════════════"