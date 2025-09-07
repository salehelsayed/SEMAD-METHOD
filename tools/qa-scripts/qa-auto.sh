#!/usr/bin/env bash
#
# Automated QA Review - Runs Claude CLI steps and writes results into a story .md
# Usage: ./qa-auto-review.sh <story-file>
#
# You can set:
#   CLAUDE_CMD   (default: claude)
#   CLAUDE_FLAGS (e.g. --no-ansi --output text --no-stream)
#   HEAD_LIMIT   (default: 10) lines to include per section

set -u

CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:-}"
HEAD_LIMIT="${HEAD_LIMIT:-10}"

# -------- sed -i portability ----------
if [[ "$OSTYPE" == "darwin"* ]]; then
  # BSD sed needs a backup extension; avoid negative-index bashisms
  SED_INPLACE() {
    local args=("$@")
    local file="${args[${#args[@]}-1]}"
    sed -i.bak "${args[@]}"
    rm -f "${file}.bak"
  }
else
  SED_INPLACE() { sed -i "$@"; }
fi

# -------- helpers ----------
# Spinner -> **stderr** only so command substitution doesn't capture it
spin() {
  local pid="$1"
  local chars='-\|/'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % 4 ))
    printf "\r%c " "${chars:$i:1}" >&2
    sleep 0.1
  done
  printf "\r   \r" >&2
}

# Remove ANSI escape sequences (CSI + OSC) and carriage returns; keep Unicode
strip_ansi_cr() {
  # Remove CSI: ESC [ ... final-byte
  # Remove OSC: ESC ] ... BEL
  # Then drop CR and some stray control bytes (BEL \a, BS \b)
  sed -E $'s/\x1B\\[[0-9;?]*[ -\\/]*[@-~]//g; s/\x1B\\][^\x07]*\x07//g' \
  | tr -d '\r\a\b'
}

# Run Claude with spinner; capture only **stdout**
run_claude_with_spinner() {
  local prompt="$1"
  local out err
  out="$(mktemp)"
  err="$(mktemp)"

  NO_COLOR=1 LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
    "$CLAUDE_CMD" $CLAUDE_FLAGS -p "$prompt" >"$out" 2>"$err" &
  local pid=$!

  # Show spinner only if stderr is a TTY
  if [ -t 2 ]; then spin "$pid"; fi
  wait "$pid"
  local rc=$?

  # Clean the stdout stream (keep Unicode)
  local cleaned
  cleaned="$(cat "$out" | strip_ansi_cr)"

  if [[ $rc -ne 0 ]]; then
    printf "\n⚠️  Claude command exited with code %d\n" "$rc" >&2
    if [[ -s "$err" ]]; then
      printf "---- Claude stderr (last 8 lines) ----\n" >&2
      tail -n 8 "$err" | strip_ansi_cr >&2
      printf "--------------------------------------\n" >&2
    fi
  fi

  rm -f "$out" "$err"
  printf '%s\n' "$cleaned"
}

# Update `status:` ONLY within the storyContract block
update_status_in_story_contract() {
  local new_status="$1"
  local escaped="${new_status//\//\\/}"
  SED_INPLACE "/^storyContract:/,/^[^ ]/ s/^  status: .*/  status: ${escaped}/" "$STORY_FILE"
}

indent_two() { sed 's/^/  /'; }

# -------- args & preflight ----------
STORY_FILE="${1-}"
if [[ -z "$STORY_FILE" ]]; then
  echo "Usage: $0 <story-file>"
  exit 1
fi
if [[ ! -f "$STORY_FILE" ]]; then
  echo "❌ Story file not found: $STORY_FILE"
  exit 1
fi

# -------- banner ----------
echo "═══════════════════════════════════════════════════════════════"
echo "         🤖 Automated QA Review System"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Story: $STORY_FILE"
echo "📅 Date: $(date +%Y-%m-%d\ %H:%M:%S)"
echo ""

# Extract basic info (C locale only for these greps)
STORY_ID=$(LC_ALL=C grep -m1 "story_id:" "$STORY_FILE" | LC_ALL=C sed 's/.*story_id: *//')
STORY_TITLE=$(LC_ALL=C grep -m1 "story_title:" "$STORY_FILE" | LC_ALL=C sed 's/.*story_title: *//')
CURRENT_STATUS=$(LC_ALL=C awk '/^storyContract:/{flag=1;next} flag && /^[^ ]/{flag=0} flag && /^  status:/{print $0; exit}' "$STORY_FILE" | LC_ALL=C sed 's/.*status: *//')

echo "📌 Story ID: $STORY_ID"
echo "📝 Title: $STORY_TITLE"
echo "🏷️  Current Status: ${CURRENT_STATUS:-N/A}"
echo ""
echo "───────────────────────────────────────────────────────────────"

# -------- Step 1: set In QA within storyContract only ----------
echo -n "📝 Updating status to 'In QA'..."
update_status_in_story_contract "In QA"
echo " ✅"

# -------- Step 2: Acceptance criteria review ----------
echo -n "🔍 Checking acceptance criteria"
CRITERIA=$(
  LC_ALL=C sed -n '/^acceptanceCriteria:/,/^[^ ]/p' "$STORY_FILE" \
  | LC_ALL=C grep -E "^[[:space:]-]*description:" \
  | LC_ALL=C sed 's/.*description:[[:space:]]*//'
)

RESULT_CRITERIA=$(run_claude_with_spinner "Context: Review Code Implementation.
Task: Check code against acceptance criteria to verify all requirements are met.

Acceptance Criteria:
$CRITERIA

Provide a brief summary of which criteria are met (✅) and which are not (❌).
Format as a bulleted list. Limit to 8 concise bullets. Be direct and unambiguous.")

echo " ✅"
echo ""
echo "   Acceptance Criteria Review: Completed"
echo ""

# -------- Step 3: Security review ----------
echo -n "🔒 Reviewing security issues"
SECURITY=$(
  LC_ALL=C sed -n '/^securityVulnerabilities:/,/^[^ ]/p' "$STORY_FILE"
)

RESULT_SECURITY=$(run_claude_with_spinner "Context: Security Analysis.
Task: Check if these security issues are properly fixed:

$SECURITY

Provide a brief status for each issue (FIXED / PARTIALLY FIXED / NOT FIXED),
and one short justification each. Max 3 lines per issue.")

echo " ✅"
echo ""
echo "   Security Review: Completed"
echo ""

# -------- Step 4: Final decision ----------
echo -n "🎯 Making final QA decision"
FINAL_DECISION=$(run_claude_with_spinner "Based on these review results:

Acceptance Criteria:
$RESULT_CRITERIA

Security Review:
$RESULT_SECURITY

Should this QA review PASS or FAIL?
If FAIL, provide 2–3 blocking issues.
Start your response with either PASS or FAIL on the first line only.")

echo " ✅"
echo ""

# Decide PASS/FAIL
if echo "$FINAL_DECISION" | LC_ALL=C grep -qiE '^\s*PASS\b'; then
  DECISION="PASS"; STATUS="QA Approved"; EMOJI="✅"
else
  DECISION="FAIL"; STATUS="QA Failed"; EMOJI="❌"
fi

echo "───────────────────────────────────────────────────────────────"
echo ""
echo "$EMOJI Decision: $DECISION"
echo ""

if [[ "$DECISION" == "FAIL" ]]; then
  echo "   Issues Found:"
  echo "$FINAL_DECISION" | LC_ALL=C sed '1{/^\s*FAIL\b/I d;}' | indent_two
fi

# -------- Step 5: Update final status ----------
echo ""
echo -n "📝 Updating story status to: $STATUS..."
update_status_in_story_contract "$STATUS"
echo " ✅"

# -------- Step 6: Add/Update QA Results section ----------
QA_LINE=$(LC_ALL=C grep -n "^## QA Results" "$STORY_FILE" | head -1 | cut -d: -f1)

TEMP_REVIEW="$(mktemp)"
{
  printf '\n### Review %s\n' "$(date +%Y-%m-%dT%H:%M:%S)"
  printf '**Status:** %s\n' "$STATUS"
  printf '**Reviewer:** Automated QA via Claude CLI\n\n'
  printf '**Acceptance Criteria:**\n'
  printf '%s\n' "$RESULT_CRITERIA" | strip_ansi_cr | head -n "$HEAD_LIMIT" | indent_two
  printf '\n'
  printf '**Security Review:**\n'
  printf '%s\n' "$RESULT_SECURITY" | strip_ansi_cr | head -n "$HEAD_LIMIT" | indent_two
  printf '\n'
  printf '**Decision:** %s\n' "$DECISION"
} > "$TEMP_REVIEW"

if [[ -n "${QA_LINE:-}" ]]; then
  echo -n "📝 Adding new QA review entry to existing section..."
  awk -v insert_line="$QA_LINE" -v review_file="$TEMP_REVIEW" '
    NR==insert_line {
      print
      while ((getline L < review_file) > 0) print L
      close(review_file)
      next
    }
    {print}
  ' "$STORY_FILE" > "${STORY_FILE}.tmp" && mv "${STORY_FILE}.tmp" "$STORY_FILE"
  echo " ✅"
else
  echo -n "📝 Creating QA Results section..."
  TEMP_QA="$(mktemp)"
  { printf '\n## QA Results\n\n'; cat "$TEMP_REVIEW"; } > "$TEMP_QA"

  IMPL_LINE=$(LC_ALL=C grep -n "^## Implementation" "$STORY_FILE" | head -1 | cut -d: -f1)
  if [[ -n "${IMPL_LINE:-}" ]]; then
    awk -v insert_line="$IMPL_LINE" -v review_file="$TEMP_QA" '
      NR==insert_line {
        while ((getline L < review_file) > 0) print L
        close(review_file)
        print
        next
      }
      {print}
    ' "$STORY_FILE" > "${STORY_FILE}.tmp" && mv "${STORY_FILE}.tmp" "$STORY_FILE"
  else
    cat "$TEMP_QA" >> "$STORY_FILE"
  fi
  rm -f "$TEMP_QA"
  echo " ✅"
fi

rm -f "$TEMP_REVIEW"

# -------- summary ----------
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
