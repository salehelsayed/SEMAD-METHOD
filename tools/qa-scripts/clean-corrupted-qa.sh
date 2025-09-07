#!/bin/bash

# Script to clean up corrupted QA results from story files
# Usage: ./clean-corrupted-qa.sh <story-file>

if [ $# -ne 1 ]; then
    echo "Usage: $0 <story-file>"
    echo "This will remove corrupted QA Results sections from the story file"
    exit 1
fi

STORY_FILE="$1"

if [ ! -f "$STORY_FILE" ]; then
    echo "Error: File not found: $STORY_FILE"
    exit 1
fi

echo "Cleaning corrupted QA results from: $STORY_FILE"

# Create backup
cp "$STORY_FILE" "${STORY_FILE}.backup"
echo "Created backup: ${STORY_FILE}.backup"

# Remove lines with corruption characters (the � symbols)
# These appear as bytes EF BF BD in UTF-8
TEMP_FILE="${STORY_FILE}.clean"

# Process the file
perl -ne '
    # Skip lines that are mostly corruption (more than 5 replacement chars)
    $count = () = /\x{FFFD}/g;  # Count Unicode replacement character
    $count += () = /[\xEF][\xBF][\xBD]/g;  # Count UTF-8 bytes for replacement char
    
    # Also skip lines with excessive spaces followed by special chars
    if (/^\s{3,}[\x{FFFD}\xEF\xBF\xBD]/ || $count > 5) {
        # Skip this line
        next;
    }
    
    # Remove any remaining replacement characters
    s/[\x{FFFD}]+//g;
    s/[\xEF][\xBF][\xBD]//g;
    
    # Remove "Blocking Issues:" if followed by nothing useful
    next if /^\*\*Blocking Issues:\*\*\s*$/;
    
    # Clean up excessive whitespace
    s/\s+$//;
    
    print;
' "$STORY_FILE" > "$TEMP_FILE"

# Check if QA Results section exists and is corrupted
if grep -q "^## QA Results" "$TEMP_FILE"; then
    echo "Found QA Results section, checking for corruption..."
    
    # Extract QA Results section
    QA_START=$(grep -n "^## QA Results" "$TEMP_FILE" | head -1 | cut -d: -f1)
    
    if [ -n "$QA_START" ]; then
        # Find next section
        NEXT_SECTION=$(awk "NR>$QA_START && /^##[^#]/ {print NR; exit}" "$TEMP_FILE")
        
        # Check if section has useful content
        if [ -n "$NEXT_SECTION" ]; then
            SECTION_CONTENT=$(sed -n "${QA_START},$((NEXT_SECTION-1))p" "$TEMP_FILE")
        else
            SECTION_CONTENT=$(sed -n "${QA_START},\$p" "$TEMP_FILE")
        fi
        
        # Count useful lines (not empty, not just headers)
        USEFUL_LINES=$(echo "$SECTION_CONTENT" | grep -v "^#" | grep -v "^\*\*" | grep -v "^---" | grep -v "^$" | wc -l)
        
        if [ "$USEFUL_LINES" -lt 3 ]; then
            echo "QA Results section appears corrupted or empty, removing it..."
            
            # Remove the corrupted section
            if [ -n "$NEXT_SECTION" ]; then
                sed -i "${QA_START},$((NEXT_SECTION-1))d" "$TEMP_FILE"
            else
                sed -i "${QA_START},\$d" "$TEMP_FILE"
            fi
            
            echo "Removed corrupted QA Results section"
        else
            echo "QA Results section appears valid"
        fi
    fi
fi

# Replace original file with cleaned version
mv "$TEMP_FILE" "$STORY_FILE"

echo "✅ Cleaning complete!"
echo ""
echo "To view changes:"
echo "  diff ${STORY_FILE}.backup $STORY_FILE"
echo ""
echo "To restore original:"
echo "  mv ${STORY_FILE}.backup $STORY_FILE"