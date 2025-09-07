#!/bin/bash

# Safe QA Auto Review - Completely avoids encoding issues
# Usage: ./qa-auto-review-safe.sh <story-file>

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Validate arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <story-file>"
    echo "Example: $0 docs/stories/story-1.md"
    exit 1
fi

STORY_FILE="$1"

# Check if story file exists
if [ ! -f "$STORY_FILE" ]; then
    echo -e "${RED}Error: Story file not found: $STORY_FILE${NC}"
    exit 1
fi

# Safe file update function
safe_sed() {
    local pattern="$1"
    local file="$2"
    local temp="${file}.tmp$$"
    
    sed "$pattern" "$file" > "$temp" && mv "$temp" "$file" || {
        rm -f "$temp"
        return 1
    }
}

echo "═══════════════════════════════════════════════════════════════"
echo "         🤖 Safe Automated QA Review System"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📅 Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Extract basic info
STORY_ID=$(grep "story_id:" "$STORY_FILE" 2>/dev/null | head -1 | sed 's/.*story_id:[[:space:]]*//' || echo "Unknown")
STORY_TITLE=$(grep "story_title:" "$STORY_FILE" 2>/dev/null | head -1 | sed 's/.*story_title:[[:space:]]*//' || echo "Unknown")

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo ""

# Update status to In QA
echo -n "📝 Updating status to 'In QA'... "
safe_sed '/^storyContract:/,/^---/s/status:.*/status: In QA/' "$STORY_FILE"
echo -e "${GREEN}✅${NC}"

# Run simplified Claude review
echo ""
echo "🔍 Running QA Review..."
echo ""

# Create a simple, safe prompt
REVIEW_PROMPT="Review this story file for QA. Check if acceptance criteria are met and security issues are fixed. Reply with only: PASS or FAIL followed by a brief reason. Keep response under 50 words. No special characters or formatting."

# Extract just the essential story content for review
STORY_CONTENT=$(sed -n '/acceptanceCriteria:/,/securityVulnerabilities:/p' "$STORY_FILE" | head -50)

# Try to get Claude's decision, with fallback
echo "Analyzing story implementation..."
TEMP_OUTPUT=$(mktemp)

# Run claude and capture just the first line of clean text
if claude -p "Story content: $STORY_CONTENT

$REVIEW_PROMPT" 2>/dev/null | head -5 | tr -cd '[:alnum:][:space:]-.' > "$TEMP_OUTPUT"; then
    DECISION_LINE=$(cat "$TEMP_OUTPUT" | head -1)
else
    DECISION_LINE="FAIL Unable to complete automated review"
fi

rm -f "$TEMP_OUTPUT"

# Parse decision
if echo "$DECISION_LINE" | grep -qi "^PASS"; then
    DECISION="PASS"
    STATUS="QA Approved"
    echo -e "${GREEN}✅ QA PASSED${NC}"
else
    DECISION="FAIL"
    STATUS="QA Failed"
    echo -e "${RED}❌ QA FAILED${NC}"
fi

echo "   Decision: $DECISION_LINE"
echo ""

# Update final status
echo -n "📝 Updating story status to: $STATUS... "
safe_sed "/^storyContract:/,/^---/s/status:.*/status: $STATUS/" "$STORY_FILE"
echo -e "${GREEN}✅${NC}"

# Add minimal QA results (without problematic content)
echo -n "📝 Adding QA results... "

# Create clean QA section WITHOUT the problematic blocking issues
QA_SECTION="

## QA Results

### Review $(date +%Y-%m-%dT%H:%M:%S)
**Status:** $STATUS
**Reviewer:** Automated QA

**Decision:** $DECISION
**Summary:** $DECISION_LINE

---
*Note: For detailed review, please run manual QA or use the interactive review tool.*"

# Check if QA Results section exists
if grep -q "^## QA Results" "$STORY_FILE"; then
    # Remove old QA Results section and add new one
    # Find the line number
    QA_LINE=$(grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)
    
    # Find next section
    NEXT_LINE=$(awk "NR>$QA_LINE && /^##[^#]/ {print NR; exit}" "$STORY_FILE")
    
    if [ -n "$NEXT_LINE" ]; then
        # Delete old section
        sed -i.bak "${QA_LINE},$((NEXT_LINE-1))d" "$STORY_FILE"
    else
        # Delete to end of file
        sed -i.bak "${QA_LINE},\$d" "$STORY_FILE"
    fi
    
    # Add new section
    echo "$QA_SECTION" >> "$STORY_FILE"
    
    # Clean up backup
    rm -f "${STORY_FILE}.bak"
else
    # Just append
    echo "$QA_SECTION" >> "$STORY_FILE"
fi

echo -e "${GREEN}✅${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Review Complete (Safe Mode)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📝 Story status updated to: $STATUS"
echo "📋 Basic QA results added to story file"
echo ""
if [ "$DECISION" = "FAIL" ]; then
    echo "⚠️  For detailed feedback, please run manual QA review"
fi