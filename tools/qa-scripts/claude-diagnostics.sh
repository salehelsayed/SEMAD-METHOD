#!/bin/bash

# Claude CLI Diagnostic Script for macOS
# Checks for common issues with Claude CLI

echo "═══════════════════════════════════════════════════════════════"
echo "         🔍 Claude CLI Diagnostic Tool"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if a process is waiting for input
check_process_state() {
    local pid=$1
    if [[ -n "$pid" ]]; then
        # Use lsof to check if process has open stdin
        echo -e "${BLUE}Checking process $pid state...${NC}"
        
        # Check file descriptors
        lsof -p $pid 2>/dev/null | grep -E "0[ur]|1[uw]|2[uw]" | head -5
        
        # Check process status
        ps aux | grep -E "^[^ ]*[ ]*$pid" | grep -v grep
        
        # Check if process is in interruptible sleep (waiting for input)
        local state=$(ps -o state= -p $pid 2>/dev/null | tr -d ' ')
        case "$state" in
            "S") echo -e "${YELLOW}Process is sleeping (possibly waiting for input)${NC}" ;;
            "R") echo -e "${GREEN}Process is running${NC}" ;;
            "T") echo -e "${RED}Process is stopped${NC}" ;;
            "Z") echo -e "${RED}Process is zombie${NC}" ;;
            *) echo -e "${YELLOW}Process state: $state${NC}" ;;
        esac
    fi
}

# 1. Check if Claude CLI is installed
echo -e "${BLUE}1. Checking Claude CLI installation...${NC}"
if command -v claude &> /dev/null; then
    echo -e "${GREEN}✅ Claude CLI is installed${NC}"
    claude --version 2>&1 | head -1
else
    echo -e "${RED}❌ Claude CLI is not installed or not in PATH${NC}"
    exit 1
fi
echo ""

# 2. Check for stuck Claude processes
echo -e "${BLUE}2. Checking for existing Claude processes...${NC}"
CLAUDE_PIDS=$(pgrep -f "claude" | grep -v $$)
if [[ -n "$CLAUDE_PIDS" ]]; then
    echo -e "${YELLOW}⚠️  Found existing Claude processes:${NC}"
    for pid in $CLAUDE_PIDS; do
        echo "---"
        echo "PID: $pid"
        check_process_state $pid
    done
    echo ""
    echo -e "${YELLOW}You may want to kill these with: kill $CLAUDE_PIDS${NC}"
else
    echo -e "${GREEN}✅ No stuck Claude processes found${NC}"
fi
echo ""

# 3. Test Claude CLI responsiveness
echo -e "${BLUE}3. Testing Claude CLI responsiveness...${NC}"
echo "Running simple test command with 10-second timeout..."

# Create a test with timeout using background process
(
    claude -p "Say 'test successful' in 3 words exactly" 2>&1
) &
TEST_PID=$!

# Wait for up to 10 seconds
SECONDS=0
while kill -0 $TEST_PID 2>/dev/null && [ $SECONDS -lt 10 ]; do
    sleep 1
    echo -n "."
done
echo ""

if kill -0 $TEST_PID 2>/dev/null; then
    echo -e "${RED}❌ Claude CLI did not respond within 10 seconds${NC}"
    kill -9 $TEST_PID 2>/dev/null
    echo "Process was killed"
else
    wait $TEST_PID
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Claude CLI responded successfully${NC}"
    else
        echo -e "${RED}❌ Claude CLI returned error code: $EXIT_CODE${NC}"
    fi
fi
echo ""

# 4. Check network connectivity
echo -e "${BLUE}4. Checking network connectivity...${NC}"
if ping -c 1 -t 2 8.8.8.8 &> /dev/null; then
    echo -e "${GREEN}✅ Internet connection is working${NC}"
else
    echo -e "${RED}❌ No internet connection detected${NC}"
fi

# Check DNS resolution
if host anthropic.com &> /dev/null; then
    echo -e "${GREEN}✅ DNS resolution is working${NC}"
else
    echo -e "${YELLOW}⚠️  DNS resolution might have issues${NC}"
fi

# Check HTTPS connectivity to Anthropic
if curl -s -m 5 --head https://anthropic.com > /dev/null; then
    echo -e "${GREEN}✅ Can reach Anthropic servers${NC}"
else
    echo -e "${RED}❌ Cannot reach Anthropic servers${NC}"
fi
echo ""

# 5. Check Claude CLI configuration
echo -e "${BLUE}5. Checking Claude CLI configuration...${NC}"
CONFIG_DIR="$HOME/Library/Application Support/Claude"
if [[ -d "$CONFIG_DIR" ]]; then
    echo -e "${GREEN}✅ Claude config directory exists${NC}"
    
    # Check for config files
    if ls "$CONFIG_DIR"/*.json &> /dev/null; then
        echo "Found config files:"
        ls -la "$CONFIG_DIR"/*.json 2>/dev/null | tail -5
    fi
else
    echo -e "${YELLOW}⚠️  Claude config directory not found at expected location${NC}"
fi
echo ""

# 6. Check environment variables
echo -e "${BLUE}6. Checking environment variables...${NC}"
if [[ -n "$ANTHROPIC_API_KEY" ]]; then
    echo -e "${GREEN}✅ ANTHROPIC_API_KEY is set${NC}"
else
    echo -e "${YELLOW}⚠️  ANTHROPIC_API_KEY not found in environment${NC}"
fi

if [[ -n "$CLAUDE_MODEL" ]]; then
    echo "CLAUDE_MODEL: $CLAUDE_MODEL"
fi
echo ""

# 7. Test with explicit non-interactive mode
echo -e "${BLUE}7. Testing non-interactive mode...${NC}"
echo "Testing with echo pipe to force non-interactive..."

# Try piping input to avoid interactive mode
echo "Reply with 'OK' only" | claude 2>&1 &
PIPE_PID=$!

SECONDS=0
while kill -0 $PIPE_PID 2>/dev/null && [ $SECONDS -lt 5 ]; do
    sleep 1
    echo -n "."
done
echo ""

if kill -0 $PIPE_PID 2>/dev/null; then
    echo -e "${RED}❌ Piped command also hangs${NC}"
    kill -9 $PIPE_PID 2>/dev/null
else
    wait $PIPE_PID
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Piped command works${NC}"
    else
        echo -e "${YELLOW}⚠️  Piped command returned error${NC}"
    fi
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "📊 Diagnostic Summary:"
echo "═══════════════════════════════════════════════════════════════"

if [[ -n "$CLAUDE_PIDS" ]]; then
    echo -e "${RED}• Found stuck Claude processes that should be killed${NC}"
fi

echo ""
echo "Recommendations:"
echo "1. Kill any stuck processes: killall claude"
echo "2. For scripts, use: echo 'prompt' | claude"
echo "3. Or use timeout wrapper: gtimeout 30 claude -p 'prompt'"
echo "   (Install with: brew install coreutils)"
echo "4. Check Claude CLI is logged in: claude auth status"
echo ""