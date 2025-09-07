#!/bin/bash

# Automated QA Review - Runs all Claude commands in sequence
# Usage: ./qa-auto-review.sh <story-file>

# Detect OS for proper sed syntax
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - use backup with .bak extension
    SED_INPLACE() {
        sed -i.bak "$@"
        # Remove backup files after successful update
        find . -name "*.bak" -type f -delete 2>/dev/null || true
    }
    export LC_ALL=C  # Use C locale to avoid illegal byte sequence
else
    # Linux/Unix
    SED_INPLACE() {
        sed -i "$@"
    }
fi

STORY_FILE="$1"

if [ -z "$STORY_FILE" ]; then
    echo "Usage: $0 <story-file>"
    exit 1
fi

if [ ! -f "$STORY_FILE" ]; then
    echo "❌ Story file not found: $STORY_FILE"
    exit 1
fi

# Spinner function
spin() {
    local pid=$1
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " %c  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Function to run Claude with spinner
run_claude_with_spinner() {
    local prompt="$1"
    local tempfile=$(mktemp)
    
    # Run Claude in background
    claude -p "$prompt" > "$tempfile" 2>&1 &
    local pid=$!
    
    # Show spinner while waiting
    spin $pid
    
    # Wait for process to finish
    wait $pid
    
    # Clean the output by removing non-printable characters
    # Use tr to keep only printable ASCII, newlines, and tabs
    local result=$(cat "$tempfile" | tr -cd '[:print:]\n\t' | sed 's/^[[:space:]]*$//')
    rm -f "$tempfile"
    
    # Return the cleaned result
    echo "$result"
}

echo "═══════════════════════════════════════════════════════════════"
echo "         🤖 Automated QA Review System"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📅 Date: $(date +%Y-%m-%d\ %H:%M:%S)"
echo ""

# Extract story info (use LC_ALL=C to avoid encoding issues)
STORY_ID=$(LC_ALL=C grep "story_id:" "$STORY_FILE" | head -1 | LC_ALL=C sed 's/.*story_id: *//')
STORY_TITLE=$(LC_ALL=C grep "story_title:" "$STORY_FILE" | head -1 | LC_ALL=C sed 's/.*story_title: *//')
CURRENT_STATUS=$(LC_ALL=C grep "^  status:" "$STORY_FILE" | head -1 | LC_ALL=C sed 's/.*status: *//')

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo "🏷️  Current Status: $CURRENT_STATUS"
echo ""
echo "───────────────────────────────────────────────────────────────"

# Step 1: Update status to In QA (only in the storyContract section)
echo -n "📝 Updating status to 'In QA'..."
# Use simpler sed pattern to avoid issues
SED_INPLACE 's/status: .*/status: In QA/' "$STORY_FILE"
echo " ✅"

# Step 2: Check acceptance criteria
echo -n "🔍 Checking acceptance criteria"
CRITERIA=$(LC_ALL=C sed -n '/acceptanceCriteria:/,/^[^ ]/p' "$STORY_FILE" | LC_ALL=C grep -E "description:" | LC_ALL=C sed 's/.*description: *//')

RESULT_CRITERIA=$(run_claude_with_spinner "Context: Review Code Implementation
Task: Check code against acceptance criteria to verify all requirements are met

Acceptance Criteria:
$CRITERIA

Provide a brief summary of which criteria are met (✅) and which are not (❌).
Format as a bulleted list. Be concise.")

echo " ✅"
echo ""
echo "   Acceptance Criteria Review: Completed"
echo ""

# Step 3: Security review
echo -n "🔒 Reviewing security issues"
SECURITY=$(LC_ALL=C sed -n '/securityVulnerabilities:/,/^[^ ]/p' "$STORY_FILE" | head -15)

RESULT_SECURITY=$(run_claude_with_spinner "Context: Security Analysis
Task: Check if these security issues are properly fixed:
$SECURITY

Provide a brief status for each security issue (FIXED/PARTIALLY FIXED/NOT FIXED).
Be concise - 2-3 lines per issue maximum.")

echo " ✅"
echo ""
echo "   Security Review: Completed"
echo ""

# Step 4: Final decision
echo -n "🎯 Making final QA decision"
FINAL_DECISION=$(run_claude_with_spinner "Based on these review results:
Acceptance Criteria: $RESULT_CRITERIA

Security Review: $RESULT_SECURITY

Should this QA review PASS or FAIL? 
If FAIL, provide 2-3 key blocking issues.
Start your response with either PASS or FAIL.")

echo " ✅"
echo ""

# Parse decision
if [[ "$FINAL_DECISION" == PASS* ]] || [[ "$FINAL_DECISION" == *"PASS"* && "$FINAL_DECISION" != *"FAIL"* ]]; then
    DECISION="PASS"
    STATUS="QA Approved"
    EMOJI="✅"
else
    DECISION="FAIL"
    STATUS="QA Failed"
    EMOJI="❌"
fi

echo "───────────────────────────────────────────────────────────────"
echo ""
echo "$EMOJI Decision: $DECISION"
echo ""

# Extract key points from decision
if [[ "$DECISION" == "FAIL" ]]; then
    echo "   Issues Found:"
    echo "$FINAL_DECISION" | LC_ALL=C grep -v "FAIL" | LC_ALL=C sed 's/^/   /'
fi

# Step 5: Update status in storyContract section only
echo ""
echo -n "📝 Updating story status to: $STATUS..."
SED_INPLACE "s/status: .*/status: $STATUS/" "$STORY_FILE"
echo " ✅"

# Step 6: Add/Update QA Results section
# First, find the FIRST QA Results section (there might be duplicates)
QA_LINE=$(LC_ALL=C grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)

if [ -n "$QA_LINE" ]; then
    echo -n "📝 Adding new QA review entry to existing section..."
    
    # Create the new review entry in a temp file
    TEMP_REVIEW=$(mktemp)
    cat > "$TEMP_REVIEW" << EOF

### Review $(date +%Y-%m-%dT%H:%M:%S)
**Status:** $STATUS
**Reviewer:** Automated QA via Claude CLI

**Acceptance Criteria:**
$(echo "$RESULT_CRITERIA" | tr -cd '[:print:]\n\t' | sed 's/^/  /' | head -10)

**Security Review:**
$(echo "$RESULT_SECURITY" | tr -cd '[:print:]\n\t' | sed 's/^/  /' | head -10)

**Decision:** $DECISION
EOF

    # Don't include blocking issues - they're causing corruption
    # The decision and reviews above are enough for the dev to understand what needs fixing
    
    # Use awk to insert the review after ## QA Results
    awk -v line="$QA_LINE" 'NR==line {print; system("cat '"$TEMP_REVIEW"'"); next} 1' "$STORY_FILE" > "${STORY_FILE}.tmp"
    mv "${STORY_FILE}.tmp" "$STORY_FILE"
    rm -f "$TEMP_REVIEW"
    
    echo " ✅"
else
    echo -n "📝 Creating QA Results section..."
    
    # Create QA section in temp file
    TEMP_QA=$(mktemp)
    cat > "$TEMP_QA" << EOF

## QA Results

### Review $(date +%Y-%m-%dT%H:%M:%S)
**Status:** $STATUS
**Reviewer:** Automated QA via Claude CLI

**Acceptance Criteria:**
$(echo "$RESULT_CRITERIA" | tr -cd '[:print:]\n\t' | sed 's/^/  /' | head -10)

**Security Review:**
$(echo "$RESULT_SECURITY" | tr -cd '[:print:]\n\t' | sed 's/^/  /' | head -10)

**Decision:** $DECISION
EOF

    # Don't include blocking issues - they're causing corruption
    # The decision and reviews above are enough
    
    # Find where to insert (before Implementation or at end)
    IMPL_LINE=$(LC_ALL=C grep -n "^## Implementation" "$STORY_FILE" | head -1 | cut -d: -f1)
    
    if [ -n "$IMPL_LINE" ]; then
        # Insert before Implementation section
        awk -v line="$IMPL_LINE" 'NR==line {system("cat '"$TEMP_QA"'"); print; next} 1' "$STORY_FILE" > "${STORY_FILE}.tmp"
        mv "${STORY_FILE}.tmp" "$STORY_FILE"
    else
        # Append to end of file
        cat "$TEMP_QA" >> "$STORY_FILE"
    fi
    
    rm -f "$TEMP_QA"
    echo " ✅"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                    ✨ QA Review Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "   • Story Status: $STATUS"
echo "   • Decision: $DECISION"
echo "   • Results saved to: $STORY_FILE"
echo ""

if [[ "$STATUS" == "QA Failed" ]]; then
    echo "📋 Next Steps:"
    echo "   1. Dev agent should review the QA feedback"
    echo "   2. Fix the identified issues"
    echo "   3. Re-run QA review after fixes"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════"