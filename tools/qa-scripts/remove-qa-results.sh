#!/bin/bash

# Script to completely remove QA Results section from a story file
# Usage: ./remove-qa-results.sh <story-file>

if [ $# -ne 1 ]; then
    echo "Usage: $0 <story-file>"
    echo "This will remove the entire QA Results section from the story file"
    exit 1
fi

STORY_FILE="$1"

if [ ! -f "$STORY_FILE" ]; then
    echo "Error: File not found: $STORY_FILE"
    exit 1
fi

echo "Removing QA Results section from: $STORY_FILE"

# Create backup
cp "$STORY_FILE" "${STORY_FILE}.backup-qa"
echo "Created backup: ${STORY_FILE}.backup-qa"

# Find QA Results section and remove it
if grep -q "^## QA Results" "$STORY_FILE"; then
    # Get line number of QA Results
    QA_LINE=$(grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)
    
    # Find next ## section (not ###)
    NEXT_LINE=$(awk "NR>$QA_LINE && /^##[^#]/ {print NR; exit}" "$STORY_FILE")
    
    if [ -n "$NEXT_LINE" ]; then
        # Delete from QA Results to line before next section
        sed -i.tmp "${QA_LINE},$((NEXT_LINE-1))d" "$STORY_FILE"
    else
        # Delete from QA Results to end of file
        sed -i.tmp "${QA_LINE},\$d" "$STORY_FILE"
    fi
    
    rm -f "${STORY_FILE}.tmp"
    echo "✅ QA Results section removed"
else
    echo "No QA Results section found"
fi

echo ""
echo "Now you can run the QA review again with:"
echo "./tools/qa-scripts/qa-auto-review.sh $STORY_FILE"