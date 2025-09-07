#!/bin/bash

# Clean Automated QA Review - Handles encoding issues properly
# Usage: ./qa-auto-review-clean.sh <story-file>

set -euo pipefail

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

# Function to aggressively clean text - remove ALL non-ASCII characters
clean_text_strict() {
    # Only keep basic ASCII: space, printable chars, newline, tab
    # This is more aggressive but ensures no corruption
    perl -pe 's/[^\x20-\x7E\x0A\x09]//g' | \
    sed 's/[[:cntrl:]]//g' | \
    tr -s ' ' | \
    sed 's/^[[:space:]]*$//' | \
    grep -v '^$' || true
}

# Function to extract clean text from a section
extract_section() {
    local section="$1"
    local file="$2"
    sed -n "/${section}:/,/^[^[:space:]]/p" "$file" | \
        grep -v "^${section}:" | \
        grep -v '^---' | \
        clean_text_strict | \
        head -20
}

# Function to run Claude and aggressively clean output
run_claude_clean() {
    local prompt="$1"
    local temp_file=$(mktemp)
    local clean_file=$(mktemp)
    
    # Run Claude
    if claude -p "$prompt" > "$temp_file" 2>/dev/null; then
        # Aggressively clean the output
        cat "$temp_file" | clean_text_strict > "$clean_file"
        
        # Check if we got valid output
        if [ -s "$clean_file" ]; then
            cat "$clean_file"
        else
            echo "No valid response received"
        fi
        
        rm -f "$temp_file" "$clean_file"
        return 0
    else
        echo "Failed to run Claude"
        rm -f "$temp_file" "$clean_file"
        return 1
    fi
}

# Function to safely update file
safe_update() {
    local pattern="$1"
    local file="$2"
    local temp_file="${file}.tmp$$"
    
    if sed "$pattern" "$file" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$file"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "         🤖 Clean Automated QA Review System"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📅 Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Extract story information
echo "───────────────────────────────────────────────────────────────"
STORY_ID=$(grep "story_id:" "$STORY_FILE" 2>/dev/null | head -1 | awk '{print $NF}' | clean_text_strict || echo "Unknown")
STORY_TITLE=$(grep "story_title:" "$STORY_FILE" 2>/dev/null | head -1 | cut -d: -f2- | clean_text_strict || echo "Unknown")
CURRENT_STATUS=$(grep "^[[:space:]]*status:" "$STORY_FILE" 2>/dev/null | head -1 | awk '{print $NF}' | clean_text_strict || echo "Unknown")

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo "🏷️  Current Status: $CURRENT_STATUS"
echo ""

# Update status to "In QA"
echo "───────────────────────────────────────────────────────────────"
echo -n "📝 Updating status to 'In QA'... "
if safe_update '/^storyContract:/,/^---/s/status:.*/status: In QA/' "$STORY_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${YELLOW}⚠️${NC}"
fi

# Check acceptance criteria
echo -n "🔍 Checking acceptance criteria... "
CRITERIA=$(extract_section "acceptanceCriteria" "$STORY_FILE")

if [ -z "$CRITERIA" ]; then
    CRITERIA_RESULT="No acceptance criteria found"
    echo -e "${YELLOW}(none found)${NC}"
else
    CRITERIA_PROMPT="Check these acceptance criteria. Reply with ONLY a short list of met/unmet items. No special characters:
$CRITERIA"
    
    CRITERIA_RESULT=$(run_claude_clean "$CRITERIA_PROMPT" || echo "Review failed")
    echo -e "${GREEN}✅${NC}"
fi

echo ""
echo "   Criteria Review:"
echo "$CRITERIA_RESULT" | head -10 | sed 's/^/   /'
echo ""

# Check security issues
echo -n "🔒 Reviewing security issues... "
SECURITY=$(extract_section "securityVulnerabilities" "$STORY_FILE")

if [ -z "$SECURITY" ]; then
    SECURITY_RESULT="No security issues found"
    echo -e "${GREEN}(none found)${NC}"
else
    SECURITY_PROMPT="Review these security issues. Reply ONLY with status (FIXED/NOT FIXED) for each. No special characters:
$SECURITY"
    
    SECURITY_RESULT=$(run_claude_clean "$SECURITY_PROMPT" || echo "Review failed")
    echo -e "${GREEN}✅${NC}"
fi

echo ""
echo "   Security Review:"
echo "$SECURITY_RESULT" | head -10 | sed 's/^/   /'
echo ""

# Make QA decision
echo -n "🎯 Making QA decision... "
DECISION_PROMPT="Based on the reviews, should QA PASS or FAIL? Start reply with PASS or FAIL then give 1 line reason. No special characters."

DECISION_OUTPUT=$(run_claude_clean "$DECISION_PROMPT" || echo "FAIL - Could not complete review")

# Parse decision
if echo "$DECISION_OUTPUT" | grep -q "^PASS"; then
    DECISION="PASS"
    NEW_STATUS="QA Approved"
    EMOJI="✅"
else
    DECISION="FAIL"  
    NEW_STATUS="QA Failed"
    EMOJI="❌"
fi

echo -e "${GREEN}✅${NC}"
echo ""
echo "$EMOJI Decision: $DECISION"
echo "   $(echo "$DECISION_OUTPUT" | head -1)"
echo ""

# Update final status
echo -n "📝 Updating story status to: $NEW_STATUS... "
if safe_update "/^storyContract:/,/^---/s/status:.*/status: $NEW_STATUS/" "$STORY_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${YELLOW}⚠️${NC}"
fi

# Add clean QA results to file
echo -n "📝 Adding QA results... "

# Prepare clean QA section
QA_TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
QA_SECTION="
## QA Results

### Review ${QA_TIMESTAMP}
**Status:** ${NEW_STATUS}
**Reviewer:** Automated QA

**Acceptance Criteria:**
$(echo "$CRITERIA_RESULT" | head -5 | sed 's/^/  /')

**Security Review:**  
$(echo "$SECURITY_RESULT" | head -5 | sed 's/^/  /')

**Decision:** ${DECISION}
$(echo "$DECISION_OUTPUT" | head -1 | sed 's/^/  /')
"

# Write QA section to temp file first (to ensure it's clean)
TEMP_QA=$(mktemp)
echo "$QA_SECTION" | clean_text_strict > "$TEMP_QA"

# Check if QA Results already exists
if grep -q "^## QA Results" "$STORY_FILE"; then
    # Replace existing QA Results section
    # Find line numbers
    START_LINE=$(grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)
    
    # Find next section or end of file
    NEXT_SECTION=$(awk "NR>${START_LINE} && /^##[^#]/ {print NR; exit}" "$STORY_FILE")
    
    if [ -n "$NEXT_SECTION" ]; then
        END_LINE=$((NEXT_SECTION - 1))
    else
        END_LINE=$(wc -l < "$STORY_FILE")
    fi
    
    # Create new file with replaced section
    TEMP_STORY=$(mktemp)
    head -n $((START_LINE - 1)) "$STORY_FILE" > "$TEMP_STORY"
    cat "$TEMP_QA" >> "$TEMP_STORY"
    tail -n +$((NEXT_SECTION)) "$STORY_FILE" 2>/dev/null >> "$TEMP_STORY" || true
    
    mv "$TEMP_STORY" "$STORY_FILE"
else
    # Append new QA section
    cat "$TEMP_QA" >> "$STORY_FILE"
fi

rm -f "$TEMP_QA"
echo -e "${GREEN}✅${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Review Complete - All output cleaned"
echo "═══════════════════════════════════════════════════════════════"