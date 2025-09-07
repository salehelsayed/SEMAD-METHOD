#!/bin/bash

# Enhanced Automated QA Review with proper encoding and file handling
# Usage: ./qa-auto-review-fixed.sh <story-file>

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Set proper locale for UTF-8 support
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

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

# Function to safely update file with sed (cross-platform)
safe_sed_update() {
    local pattern="$1"
    local file="$2"
    local temp_file="${file}.tmp$$"
    
    # Create a temporary file with the changes
    sed "$pattern" "$file" > "$temp_file"
    
    # Only replace if sed succeeded
    if [ $? -eq 0 ]; then
        mv "$temp_file" "$file"
    else
        rm -f "$temp_file"
        return 1
    fi
}

# Function to clean text output (remove non-printable characters)
clean_text() {
    # Keep only printable ASCII and common whitespace
    # This preserves tabs (9), newlines (10), carriage returns (13), and printable chars (32-126)
    tr -cd '\t\n\r\040-\176'
}

# Function to run Claude and capture output
run_claude() {
    local prompt="$1"
    local temp_file=$(mktemp)
    
    # Run Claude with UTF-8 encoding
    if LC_ALL=en_US.UTF-8 claude -p "$prompt" > "$temp_file" 2>&1; then
        # Clean the output to remove any encoding issues
        cat "$temp_file" | clean_text
        rm -f "$temp_file"
        return 0
    else
        echo -e "${RED}Failed to run Claude${NC}" >&2
        rm -f "$temp_file"
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "         🤖 Enhanced Automated QA Review System"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📅 Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Extract story information safely
echo "───────────────────────────────────────────────────────────────"
STORY_ID=$(grep -E "story_id:" "$STORY_FILE" | head -1 | sed 's/.*story_id:[[:space:]]*//' | clean_text || echo "Unknown")
STORY_TITLE=$(grep -E "story_title:" "$STORY_FILE" | head -1 | sed 's/.*story_title:[[:space:]]*//' | clean_text || echo "Unknown")
CURRENT_STATUS=$(grep -E "^[[:space:]]*status:" "$STORY_FILE" | head -1 | sed 's/.*status:[[:space:]]*//' | clean_text || echo "Unknown")

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo "🏷️  Current Status: $CURRENT_STATUS"
echo ""

# Update status to "In QA"
echo "───────────────────────────────────────────────────────────────"
echo -n "📝 Updating status to 'In QA'... "
if safe_sed_update '/^storyContract:/,/^---/s/^[[:space:]]*status:.*/  status: In QA/' "$STORY_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${YELLOW}⚠️  Could not update status${NC}"
fi

# Extract acceptance criteria
echo -n "🔍 Checking acceptance criteria "
CRITERIA=$(sed -n '/acceptanceCriteria:/,/^[^[:space:]]/p' "$STORY_FILE" | grep -E "description:" | sed 's/.*description:[[:space:]]*//' | clean_text)

if [ -z "$CRITERIA" ]; then
    echo -e "${YELLOW}(none found)${NC}"
    CRITERIA_RESULT="No acceptance criteria found in story file"
else
    CRITERIA_PROMPT="Review the acceptance criteria and provide a brief status for each criterion. Be concise.

Acceptance Criteria:
$CRITERIA

Format your response as a bulleted list with ✅ for met and ❌ for not met."

    if CRITERIA_RESULT=$(run_claude "$CRITERIA_PROMPT"); then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌${NC}"
        CRITERIA_RESULT="Failed to review acceptance criteria"
    fi
fi

echo ""
echo "   Acceptance Criteria Review:"
echo "$CRITERIA_RESULT" | sed 's/^/   /'
echo ""

# Extract and review security issues
echo -n "🔒 Reviewing security issues "
SECURITY=$(sed -n '/securityVulnerabilities:/,/^[^[:space:]]/p' "$STORY_FILE" | head -15 | clean_text)

if [ -z "$SECURITY" ]; then
    echo -e "${GREEN}(none found)${NC}"
    SECURITY_RESULT="No security vulnerabilities listed"
else
    SECURITY_PROMPT="Review these security issues and check their resolution status:

$SECURITY

Provide a brief status for each security issue (FIXED/PARTIALLY FIXED/NOT FIXED).
Be concise - 2-3 lines per issue maximum."

    if SECURITY_RESULT=$(run_claude "$SECURITY_PROMPT"); then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌${NC}"
        SECURITY_RESULT="Failed to review security issues"
    fi
fi

echo ""
echo "   Security Review:"
echo "$SECURITY_RESULT" | sed 's/^/   /'
echo ""

# Make QA decision
echo "🎯 Making final QA decision"
DECISION_PROMPT="Based on these review results:

Acceptance Criteria Review:
$CRITERIA_RESULT

Security Review:
$SECURITY_RESULT

Should this story PASS or FAIL QA? Reply with only 'PASS' or 'FAIL' followed by a one-line reason."

if DECISION=$(run_claude "$DECISION_PROMPT"); then
    echo ""
    if echo "$DECISION" | grep -q "PASS"; then
        echo -e "${GREEN}✅ QA PASSED${NC}"
        NEW_STATUS="QA Approved"
        echo "$DECISION" | sed 's/^/   /'
    else
        echo -e "${RED}❌ QA FAILED${NC}"
        NEW_STATUS="QA Failed"
        echo "$DECISION" | sed 's/^/   /'
    fi
else
    echo -e "${RED}❌ Could not determine QA status${NC}"
    NEW_STATUS="QA Review Error"
fi

# Update final status
echo ""
echo -n "📝 Updating story status to: $NEW_STATUS... "
if safe_sed_update "/^storyContract:/,/^---/s/^[[:space:]]*status:.*/  status: $NEW_STATUS/" "$STORY_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${YELLOW}⚠️  Could not update final status${NC}"
fi

# Add QA Results section
echo -n "📝 Adding QA results to story file... "

# Create QA results section
QA_SECTION="

## QA Results

### Review $(date +%Y-%m-%dT%H:%M:%S)
**Status:** $NEW_STATUS
**Reviewer:** Automated QA via Claude CLI

**Acceptance Criteria:**
$(echo "$CRITERIA_RESULT" | sed 's/^/  /')

**Security Review:**
$(echo "$SECURITY_RESULT" | sed 's/^/  /')

**Decision:** $(echo "$DECISION" | head -1)"

# Check if QA Results section exists
if grep -q "^## QA Results" "$STORY_FILE"; then
    # Insert after existing QA Results header
    QA_LINE=$(grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)
    
    # Create temp file with new review
    TEMP_FILE=$(mktemp)
    head -n "$QA_LINE" "$STORY_FILE" > "$TEMP_FILE"
    echo "$QA_SECTION" >> "$TEMP_FILE"
    tail -n +$((QA_LINE + 1)) "$STORY_FILE" >> "$TEMP_FILE"
    
    mv "$TEMP_FILE" "$STORY_FILE"
    echo -e "${GREEN}✅${NC}"
else
    # Append QA Results section at end
    echo "$QA_SECTION" >> "$STORY_FILE"
    echo -e "${GREEN}✅${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Review Complete"
echo "═══════════════════════════════════════════════════════════════"