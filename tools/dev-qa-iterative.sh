#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper to the canonical flow script, keeping args intact
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLOW_SCRIPT="$SCRIPT_DIR/flows/dev-qa-iterative.sh"
if [[ ! -x "$FLOW_SCRIPT" ]]; then
  echo "Error: Expected flow script at $FLOW_SCRIPT" >&2
  exit 1
fi
exec "$FLOW_SCRIPT" "$@"

