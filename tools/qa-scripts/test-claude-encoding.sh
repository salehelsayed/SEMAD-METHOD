#!/bin/bash

# Test script to diagnose Claude output encoding
echo "Testing Claude output encoding..."
echo "================================="
echo ""

# Simple test
echo "Test 1: Basic Claude call"
claude -p "Reply with: Hello World" > /tmp/claude_raw.txt 2>&1

echo "Raw output (first 200 bytes):"
xxd -l 200 /tmp/claude_raw.txt 2>/dev/null || od -c /tmp/claude_raw.txt | head -10

echo ""
echo "Cleaned output:"
cat /tmp/claude_raw.txt | tr -cd '[:print:]\n\t'

echo ""
echo "================================="
echo "If you see bytes like 'c2 a0' (non-breaking space) or 'e2 80' (various dashes/quotes),"
echo "these are UTF-8 encoded special characters that need to be filtered."

rm -f /tmp/claude_raw.txt