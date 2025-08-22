#!/bin/bash

# Security Guardrails - Secret Scanning
# Detects common secret patterns in the codebase

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p .ai
LOG_FILE=".ai/security-scan.log"

# Initialize log
echo "Security Secret Scan - $(date)" > "$LOG_FILE"
echo "======================================" >> "$LOG_FILE"

VIOLATIONS_FOUND=0

echo -e "${YELLOW}🔍 Running secret scanning...${NC}"

# Define secret patterns to search for (description:pattern pairs)
SECRET_CHECKS=(
    "AWS Access Key:AKIA[0-9A-Z]{16}"
    "AWS Secret Key:[A-Za-z0-9/+=]{40}"
    "GitHub Token:ghp_[A-Za-z0-9]{36}"
    "GitHub Fine-grained Token:github_pat_[A-Za-z0-9_]{82}"
    "API Key (Generic):[aA][pP][iI][_-]?[kK][eE][yY][_-]?['\"]?[A-Za-z0-9]{16,}"
    "Private Key:-----BEGIN [A-Z]+ PRIVATE KEY-----"
    "JWT Token:eyJ[A-Za-z0-9_/+-]*\.eyJ[A-Za-z0-9_/+-]*\.[A-Za-z0-9_/+-]*"
    "Password in Code:[pP][aA][sS][sS][wW][oO][rR][dD][_-]?[=:][_-]?['\"][^'\"]{8,}"
    "Database URL:(mysql|postgres|mongodb)://[^\\s\"']*"
    "Docker Registry Token:[Dd][Cc][Rr]_[A-Za-z0-9_]{32,}"
    "Slack Token:xox[baprs]-[A-Za-z0-9-]+"
    "Terraform Token:[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9-_]{60,}"
)

# Files and directories to exclude from scanning
EXCLUDE_PATTERNS=(
    "node_modules"
    ".git"
    "dist"
    "build"
    "coverage"
    "*.min.js"
    "*.bundle.js"
    "package-lock.json"
    "*.log"
    "qdrant_storage"
    ".ai"
    "CHANGELOG.md"
    "*.test.js"
    "*.spec.js"
)

# Build exclude arguments for grep
EXCLUDE_ARGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$pattern"
done

echo "Scanning for secrets in codebase..." | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Scan for each secret pattern
for check in "${SECRET_CHECKS[@]}"; do
    description="${check%%:*}"
    pattern="${check#*:}"
    
    echo "Checking for: $description" | tee -a "$LOG_FILE"
    
    # Use grep to find matches, excluding npm integrity hashes and other false positives
    if matches=$(grep -r -n -E "$pattern" . $EXCLUDE_ARGS 2>/dev/null | grep -v "integrity.*sha512" | grep -v "hashedPassword.*\$2b" || true); then
        if [[ -n "$matches" ]]; then
            echo -e "${RED}❌ VIOLATION: $description detected${NC}" | tee -a "$LOG_FILE"
            echo "$matches" | while IFS= read -r line; do
                # Mask the actual secret value for security
                masked_line=$(echo "$line" | sed -E 's/[A-Za-z0-9/+=]{16,}/***MASKED***/g')
                echo "  $masked_line" | tee -a "$LOG_FILE"
            done
            echo "" | tee -a "$LOG_FILE"
            VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
        fi
    fi
done

# Check for common secret-containing files that shouldn't be committed
echo "Checking for secret-containing files..." | tee -a "$LOG_FILE"

SECRET_FILES=(
    ".env"
    ".env.local"
    ".env.production" 
    ".env.development"
    "secrets.yml"
    "secrets.yaml"
    "credentials.json"
    "auth.json"
    "private.key"
    "id_rsa"
    "id_dsa"
    "id_ecdsa"
    "id_ed25519"
)

for secret_file in "${SECRET_FILES[@]}"; do
    if find . -name "$secret_file" -not -path "./node_modules/*" -not -path "./.git/*" | grep -q .; then
        echo -e "${RED}❌ VIOLATION: Secret file detected: $secret_file${NC}" | tee -a "$LOG_FILE"
        find . -name "$secret_file" -not -path "./node_modules/*" -not -path "./.git/*" | tee -a "$LOG_FILE"
        VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    fi
done

# Check for hardcoded localhost URLs with authentication
echo "Checking for hardcoded URLs with credentials..." | tee -a "$LOG_FILE"
if url_matches=$(grep -r -n -E "https?://[^:@\s]+:[^:@\s]+@" . $EXCLUDE_ARGS 2>/dev/null || true); then
    if [[ -n "$url_matches" ]]; then
        echo -e "${RED}❌ VIOLATION: URLs with embedded credentials detected${NC}" | tee -a "$LOG_FILE"
        echo "$url_matches" | while IFS= read -r line; do
            # Mask credentials in URLs
            masked_line=$(echo "$line" | sed -E 's/(https?:\/\/)[^:@]+:[^:@]+@/\1***:***@/g')
            echo "  $masked_line" | tee -a "$LOG_FILE"
        done
        echo "" | tee -a "$LOG_FILE"
        VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    fi
fi

# Final result
echo "======================================" | tee -a "$LOG_FILE"
if [[ $VIOLATIONS_FOUND -eq 0 ]]; then
    echo -e "${GREEN}✅ PASS: No secrets detected${NC}" | tee -a "$LOG_FILE"
    echo "Secret scan completed successfully" | tee -a "$LOG_FILE"
    exit 0
else
    echo -e "${RED}❌ FAIL: $VIOLATIONS_FOUND secret violation(s) detected${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    echo "REMEDIATION REQUIRED:" | tee -a "$LOG_FILE"
    echo "1. Remove or encrypt detected secrets" | tee -a "$LOG_FILE"
    echo "2. Use environment variables for secrets" | tee -a "$LOG_FILE"
    echo "3. Add secret files to .gitignore" | tee -a "$LOG_FILE"
    echo "4. Consider using secret management tools" | tee -a "$LOG_FILE"
    echo "5. See docs/validation-system.md for detailed remediation guidance" | tee -a "$LOG_FILE"
    exit 1
fi