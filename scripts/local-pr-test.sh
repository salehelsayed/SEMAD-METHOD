#!/bin/bash

# Local PR Testing Script
# This script mimics the GitHub Actions PR testing workflow for local development

set -e

echo "🚀 Starting Local PR Testing..."
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Error: Node.js 20+ required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version check passed: $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm ci
fi

echo ""
echo "🧪 Running Examples..."
echo "======================"
if npm run examples:run; then
    echo "✅ Examples passed"
    EXAMPLES_STATUS="PASSED"
else
    echo "❌ Examples failed"
    EXAMPLES_STATUS="FAILED"
    OVERALL_FAILED=true
fi

echo ""
echo "🔍 Running Preflight Checks..."
echo "==============================="
if npm run preflight:all; then
    echo "✅ Preflight checks passed"
    PREFLIGHT_STATUS="PASSED"
else
    echo "❌ Preflight checks failed"
    PREFLIGHT_STATUS="FAILED"
    OVERALL_FAILED=true
fi

echo ""
echo "📊 Collecting Metrics..."
echo "========================"
if npm run metrics:collect; then
    echo "✅ Metrics collection completed"
    METRICS_STATUS="PASSED"
else
    echo "⚠️ Metrics collection failed (non-blocking)"
    METRICS_STATUS="WARNING"
fi

echo ""
echo "📋 Test Summary"
echo "==============="
echo "Examples:        $EXAMPLES_STATUS"
echo "Preflight:       $PREFLIGHT_STATUS"
echo "Metrics:         $METRICS_STATUS"
echo ""

if [ "${OVERALL_FAILED:-false}" = "true" ]; then
    echo "❌ Some critical tests failed. Please fix the issues before creating a PR."
    exit 1
else
    echo "🎉 All critical tests passed! Your changes are ready for PR."
    exit 0
fi