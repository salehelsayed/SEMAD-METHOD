#!/bin/bash

# Security Guardrails - Dependency Audit
# Scans for known vulnerabilities in npm dependencies

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p .ai
LOG_FILE=".ai/deps-audit.log"

# Initialize log
echo "Security Dependency Audit - $(date)" > "$LOG_FILE"
echo "======================================" >> "$LOG_FILE"

echo -e "${YELLOW}🔍 Running dependency security audit...${NC}"

# Function to check if npm is available
check_npm() {
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ FAIL: npm is not installed or not in PATH${NC}" | tee -a "$LOG_FILE"
        exit 1
    fi
}

# Function to check if package.json exists
check_package_json() {
    if [[ ! -f "package.json" ]]; then
        echo -e "${RED}❌ FAIL: package.json not found${NC}" | tee -a "$LOG_FILE"
        exit 1
    fi
}

# Function to run npm audit and parse results
run_audit() {
    echo "Running npm audit..." | tee -a "$LOG_FILE"
    
    # Run npm audit and capture both output and exit code
    if audit_output=$(npm audit --json 2>/dev/null); then
        audit_exit_code=0
    else
        audit_exit_code=$?
        # Try to get output even if audit failed
        audit_output=$(npm audit --json 2>/dev/null || echo '{"vulnerabilities":{}}')
    fi
    
    echo "npm audit exit code: $audit_exit_code" >> "$LOG_FILE"
    echo "Raw audit output:" >> "$LOG_FILE"
    echo "$audit_output" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    # Parse JSON output to extract vulnerability summary
    if command -v jq &> /dev/null; then
        parse_with_jq "$audit_output"
    else
        parse_with_grep "$audit_output"
    fi
    
    return $audit_exit_code
}

# Function to parse audit output using jq (preferred)
parse_with_jq() {
    local output="$1"
    
    echo "Parsing audit results with jq..." >> "$LOG_FILE"
    
    # Extract vulnerability counts
    local critical=$(echo "$output" | jq -r '.metadata.vulnerabilities.critical // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    local high=$(echo "$output" | jq -r '.metadata.vulnerabilities.high // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    local moderate=$(echo "$output" | jq -r '.metadata.vulnerabilities.moderate // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    local low=$(echo "$output" | jq -r '.metadata.vulnerabilities.low // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    local info=$(echo "$output" | jq -r '.metadata.vulnerabilities.info // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    local total=$(echo "$output" | jq -r '.metadata.vulnerabilities.total // 0' 2>/dev/null | head -1 | tr -d '\n' || echo "0")
    
    # Display summary
    echo "Vulnerability Summary:" | tee -a "$LOG_FILE"
    echo "  Critical: $critical" | tee -a "$LOG_FILE"
    echo "  High: $high" | tee -a "$LOG_FILE"
    echo "  Moderate: $moderate" | tee -a "$LOG_FILE"
    echo "  Low: $low" | tee -a "$LOG_FILE"
    echo "  Info: $info" | tee -a "$LOG_FILE"
    echo "  Total: $total" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Check for high-severity vulnerabilities (critical or high)
    high_severity=$((critical + high))
    if [[ $high_severity -gt 0 ]]; then
        echo -e "${RED}❌ FAIL: $high_severity high-severity vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        
        # List specific vulnerabilities
        echo "High-severity vulnerabilities:" | tee -a "$LOG_FILE"
        echo "$output" | jq -r '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high") | "  - \(.key): \(.value.severity) - \(.value.title)"' 2>/dev/null | tee -a "$LOG_FILE" || true
        
        return 1
    elif [[ $total -gt 0 ]]; then
        echo -e "${YELLOW}⚠️ WARNING: $total low/moderate vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        
        # List moderate vulnerabilities
        if [[ $moderate -gt 0 ]]; then
            echo "Moderate vulnerabilities:" | tee -a "$LOG_FILE"
            echo "$output" | jq -r '.vulnerabilities | to_entries[] | select(.value.severity == "moderate") | "  - \(.key): \(.value.severity) - \(.value.title)"' 2>/dev/null | tee -a "$LOG_FILE" || true
        fi
        
        return 0
    else
        echo -e "${GREEN}✅ PASS: No vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        return 0
    fi
}

# Function to parse audit output using grep (fallback)
parse_with_grep() {
    local output="$1"
    
    echo "Parsing audit results with grep (jq not available)..." >> "$LOG_FILE"
    
    # Extract vulnerability counts using grep and basic text processing
    local critical=$(echo "$output" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' | head -1 | tr -d '\n' || echo "0")
    local high=$(echo "$output" | grep -o '"high":[0-9]*' | grep -o '[0-9]*' | head -1 | tr -d '\n' || echo "0")
    local moderate=$(echo "$output" | grep -o '"moderate":[0-9]*' | grep -o '[0-9]*' | head -1 | tr -d '\n' || echo "0")
    local low=$(echo "$output" | grep -o '"low":[0-9]*' | grep -o '[0-9]*' | head -1 | tr -d '\n' || echo "0")
    local total=$((critical + high + moderate + low))
    
    # Display summary
    echo "Vulnerability Summary:" | tee -a "$LOG_FILE"
    echo "  Critical: $critical" | tee -a "$LOG_FILE"
    echo "  High: $high" | tee -a "$LOG_FILE"
    echo "  Moderate: $moderate" | tee -a "$LOG_FILE"
    echo "  Low: $low" | tee -a "$LOG_FILE"
    echo "  Total: $total" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Check for high-severity vulnerabilities
    high_severity=$((critical + high))
    if [[ $high_severity -gt 0 ]]; then
        echo -e "${RED}❌ FAIL: $high_severity high-severity vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        return 1
    elif [[ $total -gt 0 ]]; then
        echo -e "${YELLOW}⚠️ WARNING: $total low/moderate vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        return 0
    else
        echo -e "${GREEN}✅ PASS: No vulnerabilities detected${NC}" | tee -a "$LOG_FILE"
        return 0
    fi
}

# Function to provide remediation guidance
provide_remediation() {
    echo "" | tee -a "$LOG_FILE"
    echo "REMEDIATION GUIDANCE:" | tee -a "$LOG_FILE"
    echo "1. Run 'npm audit fix' to automatically fix fixable vulnerabilities" | tee -a "$LOG_FILE"
    echo "2. Run 'npm audit fix --force' for more aggressive fixes (may introduce breaking changes)" | tee -a "$LOG_FILE"
    echo "3. For manual fixes, run 'npm audit' for detailed vulnerability information" | tee -a "$LOG_FILE"
    echo "4. Update specific packages: 'npm update <package-name>'" | tee -a "$LOG_FILE"
    echo "5. Consider using 'npm audit fix --dry-run' to preview changes" | tee -a "$LOG_FILE"
    echo "6. For unfixable vulnerabilities, consider finding alternative packages" | tee -a "$LOG_FILE"
    echo "7. Use 'npm audit --audit-level=moderate' to ignore low-severity issues" | tee -a "$LOG_FILE"
    echo "8. See docs/validation-system.md for detailed security remediation guidance" | tee -a "$LOG_FILE"
}

# Main execution
echo "Starting dependency security audit..." | tee -a "$LOG_FILE"

# Pre-flight checks
check_npm
check_package_json

# Run the audit
if run_audit; then
    echo "======================================" | tee -a "$LOG_FILE"
    echo "Dependency audit completed successfully" | tee -a "$LOG_FILE"
    exit 0
else
    provide_remediation
    echo "======================================" | tee -a "$LOG_FILE"
    echo "Dependency audit failed - remediation required" | tee -a "$LOG_FILE"
    exit 1
fi