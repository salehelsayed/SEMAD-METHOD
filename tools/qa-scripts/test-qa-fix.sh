#!/bin/bash

# Test script to verify QA auto-review fixes

echo "Testing QA Auto-Review Text Cleaning"
echo "===================================="

# Create a test file with corrupted text (simulating bad Claude output)
CORRUPT_FILE=$(mktemp)
cat > "$CORRUPT_FILE" << 'EOF'
FAIL The implementation has issues:
   �   �   �   �   Some corrupt characters here
   • Bullet point with special char
   – Another special dash
Normal text should work fine
   �   �   �   More corruption
EOF

echo "Original corrupted text:"
echo "------------------------"
cat "$CORRUPT_FILE"
echo ""

echo "After cleaning with perl:"
echo "-------------------------"
cat "$CORRUPT_FILE" | perl -pe 's/[^\x20-\x7E\x0A\x09]//g' | sed '/^[[:space:]]*$/d'
echo ""

echo "Test complete!"
rm -f "$CORRUPT_FILE"