#!/usr/bin/env bash
set -euo pipefail

# Iterative Dev↔QA runner with clean context between phases
# Usage: tools/flows/dev-qa-iterative.sh -s <story-file|story-id> [-m <max-iterations>] [--no-codex]

MAX_ITERS=3
STORY_ARG=""
USE_CODEX=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--story)
      STORY_ARG="$2"; shift 2 ;;
    -m|--max)
      MAX_ITERS="$2"; shift 2 ;;
    --no-codex)
      USE_CODEX=0; shift ;;
    -h|--help)
      echo "Usage: $0 -s <story-file|story-id> [-m <max-iterations>] [--no-codex]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "${STORY_ARG}" ]]; then
  echo "Error: story is required. Use -s <story-file|story-id>" >&2
  exit 1
fi

# Robust project root detection: walk up from script dir until package.json and bmad-core exist
# Resolve project root robustly
resolve_root() {
  local script_dir script_root cwd candidate
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  script_root="$(cd "$script_dir/../.." && pwd)"
  cwd="$(pwd)"

  # 1) Walk up from script_dir to find dir with package.json and bmad-core/.bmad-core
  candidate="$script_dir"
  while [[ "$candidate" != "/" ]]; do
    if [[ -f "$candidate/package.json" && ( -d "$candidate/bmad-core" || -d "$candidate/.bmad-core" ) ]]; then
      echo "$candidate"
      return 0
    fi
    candidate="$(dirname "$candidate")"
  done

  # 2) Use script_root if it contains bmad-core/.bmad-core
  if [[ -f "$script_root/package.json" && ( -d "$script_root/bmad-core" || -d "$script_root/.bmad-core" ) ]]; then
    echo "$script_root"; return 0
  fi

  # 3) Try current working directory
  if [[ -f "$cwd/package.json" && ( -d "$cwd/bmad-core" || -d "$cwd/.bmad-core" ) ]]; then
    echo "$cwd"; return 0
  fi

  # 4) As last resort, choose script_root regardless
  echo "$script_root"
}

locate_project_by_story() {
  local arg="$1"
  local dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/$arg" ]]; then
      echo "$dir"; return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

PROJECT_ROOT="$(locate_project_by_story "$STORY_ARG" || true)"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(resolve_root)"
fi
cd "$PROJECT_ROOT"
echo "Iterative Dev↔QA root: $PROJECT_ROOT"

# Resolve stories directory from core-config (default docs/stories)
resolve_stories_dir() {
  node -e '
    const fs=require("fs"), path=require("path");
    function findCfg(root){
      const c1=path.join(root,"bmad-core","core-config.yaml");
      const c2=path.join(root,"core-config.yaml");
      if(fs.existsSync(c1)) return c1; if(fs.existsSync(c2)) return c2; return null;
    }
    const root=process.cwd();
    const cfgPath=findCfg(root);
    let dir="docs/stories";
    if(cfgPath){
      try{
        const yaml=require("js-yaml");
        const cfg=yaml.load(fs.readFileSync(cfgPath,"utf8"))||{};
        dir=(cfg.devStoryLocation||cfg.stories?.storyLocation||"docs/stories");
      }catch(e){}
    }
    if(!path.isAbsolute(dir)) dir=path.join(root,dir);
    process.stdout.write(dir);
  '
}

STORIES_DIR="$(resolve_stories_dir)"

# Locate QA gate script if available
QA_GATE=""
if [[ -f "$PROJECT_ROOT/tools/orchestrator/gates/qa-gate.js" ]]; then
  QA_GATE="$PROJECT_ROOT/tools/orchestrator/gates/qa-gate.js"
elif [[ -f "$PROJECT_ROOT/.bmad-core/tools/orchestrator/gates/qa-gate.js" ]]; then
  QA_GATE="$PROJECT_ROOT/.bmad-core/tools/orchestrator/gates/qa-gate.js"
fi

# Resolve story id from path or accept direct id
resolve_story_id() {
  local arg="$1"
  if [[ -f "$arg" ]]; then
    node -e '
      const fs=require("fs");
      const p=process.argv[1];
      const c=fs.readFileSync(p,"utf8");
      const m=c.match(/^---\n([\s\S]*?)\n---/)||c.match(/##\s*Story Contract\s*\n\s*---\n([\s\S]*?)\n---/);
      if(!m){ console.error("No StoryContract YAML in "+p); process.exit(2);} 
      const y=m[1];
      const mid=y.match(/\bstory_id\s*:\s*\"?([^\"\n]+)\"?/);
      if(!mid){ console.error("No story_id in StoryContract for "+p); process.exit(3);} 
      console.log(String(mid[1]).trim());
    ' "$arg"
  else
    echo "$arg"
  fi
}

STORY_ID="$(resolve_story_id "$STORY_ARG" || true)"
if [[ -z "$STORY_ID" ]]; then
  echo "Error: unable to resolve story_id from '$STORY_ARG'" >&2
  exit 1
fi

# Validate that if a story file path was given, it exists under the resolved root
if [[ -f "$STORY_ARG" ]]; then
  : # ok
else
  # If the argument looks like a path (contains '/'), ensure it exists relative to PROJECT_ROOT
  if [[ "$STORY_ARG" == */* && ! -f "$PROJECT_ROOT/$STORY_ARG" ]]; then
    echo "Error: story file '$STORY_ARG' not found under PROJECT_ROOT=$PROJECT_ROOT" >&2
    exit 2
  fi
fi

have_codex() { command -v codex >/dev/null 2>&1; }

# Resolve story file path from STORY_ARG/ID
resolve_story_file() {
  local arg="$1"
  if [[ -f "$arg" ]]; then
    echo "$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")"; return 0
  fi
  # Lookup by id prefix under STORIES_DIR
  if [[ -d "$STORIES_DIR" ]]; then
    local cand
    cand="$(ls -1 "$STORIES_DIR" 2>/dev/null | grep -E "^${STORY_ID//./\\.}\\..*\\.md$" | head -n 1 || true)"
    if [[ -n "$cand" ]]; then
      echo "$STORIES_DIR/$cand"; return 0
    fi
  fi
  return 1
}

# Read story status from file (returns lowercase status or empty)
get_story_status() {
  local f
  f="$(resolve_story_file "$STORY_ARG" || true)"
  if [[ -z "$f" ]] || [[ ! -f "$f" ]]; then echo ""; return 0; fi
  # Extract the line after '## Status'
  awk '/^##[[:space:]]*Status[[:space:]]*$/{getline; print tolower($0); exit}' "$f" | tr -d '\r' | sed 's/^ *//; s/ *$//'
}

clean_context() {
  local phase="$1"
  local TS
  TS="$(date +%s)"
  mkdir -p .ai/archive .ai/reports
  if [[ -d .ai/history ]]; then
    mv .ai/history ".ai/archive/history-${phase}-${TS}" || true
  fi
  rm -f .ai/dev_context.json .ai/dev_tasks.json .ai/qa_findings.json .ai/qa_fixes_checklist.json
}

run_dev() {
  local mode="$1" # develop | fix
  if [[ "$USE_CODEX" -eq 1 ]]; then
    if have_codex; then
      if [[ "$mode" == "develop" ]]; then
        if ! NO_UPDATE_NOTIFIER=1 codex "as dev agent, execute *develop-story @${STORY_ARG}"; then
          echo "[WARN] codex failed or unavailable; falling back to manual Dev mode (--no-codex)." >&2
          USE_CODEX=0
        fi
      else
        if ! NO_UPDATE_NOTIFIER=1 codex "as dev agent, execute *address-qa-feedback @${STORY_ARG}"; then
          echo "[WARN] codex failed or unavailable; falling back to manual Dev mode (--no-codex)." >&2
          USE_CODEX=0
        fi
      fi
    else
      echo "[WARN] codex CLI not found; falling back to manual Dev mode (--no-codex)." >&2
      USE_CODEX=0
    fi
  fi

  if [[ "$USE_CODEX" -eq 0 ]]; then
    echo "[INFO] Skipping automated Dev step. Run Dev manually, then the script will proceed to QA gate."
    echo "       Examples:"
    echo "         - Implement story:   node tools/orchestrator/gates/dev-gate.js ${STORY_ID}"
    echo "         - Or address QA:     (open story) and run fixes, then re-run this script"
  fi
}

run_qa_review() {
  # Prefer Codex QA agent review
  if [[ "$USE_CODEX" -eq 1 ]] && have_codex; then
    if NO_UPDATE_NOTIFIER=1 codex "as qa agent, execute *review @${STORY_ARG}"; then
      return 0
    else
      echo "[WARN] codex QA review failed; falling back to local QA runner."
    fi
  fi
  # Fallback: local QA review helper (if available)
  local sf
  sf="$(resolve_story_file "$STORY_ARG" || true)"
  if [[ -n "$sf" && -f "$sf" ]]; then
    if [[ -f tools/qa-review.js ]]; then
      node tools/qa-review.js "$sf" || true
      return 0
    fi
  fi
  return 0
}

run_qa_gate() {
  if [[ -n "${QA_GATE}" && -f "${QA_GATE}" ]]; then
    echo "[QA] Running QA gate via ${QA_GATE} for story ${STORY_ID}"
    node "${QA_GATE}" "$STORY_ID"
    return $?
  fi

  # Fallback 1: npm script gate:qa if defined
  if grep -q '"gate:qa"' package.json 2>/dev/null; then
    echo "[QA] Running npm run gate:qa (fallback)"
    npm run -s gate:qa
    return $?
  fi

  # Fallback 2: run project tests if available
  if grep -q '"test"' package.json 2>/dev/null; then
    echo "[QA] Running npm test (fallback)"
    npm test --silent
    return $?
  fi

  # Fallback 3: no QA gate available → do NOT assert pass
  echo "[QA] No QA gate found; cannot assert pass. Marking QA as failed for this iteration."
  return 1
}

echo "Iterative Dev↔QA for story: $STORY_ID (arg: $STORY_ARG), max iterations: $MAX_ITERS"

iter=1
while [[ $iter -le $MAX_ITERS ]]; do
  echo "\n===== Iteration $iter/$MAX_ITERS: DEV ====="
  if [[ $iter -eq 1 ]]; then
    run_dev develop
  else
    run_dev fix
  fi

  # Always verify completion (treat missing tracker or script as incomplete)
  verification_failed=0
  echo "Verifying QA fix completion (requires 100% fixes)..."
  VERIFY_SCRIPT=""
  if [[ -f .bmad-core/utils/verify-qa-fixes.js ]]; then
    VERIFY_SCRIPT=".bmad-core/utils/verify-qa-fixes.js"
  elif [[ -f bmad-core/utils/verify-qa-fixes.js ]]; then
    VERIFY_SCRIPT="bmad-core/utils/verify-qa-fixes.js"
  fi
  if [[ -n "$VERIFY_SCRIPT" ]]; then
    if ! node "$VERIFY_SCRIPT"; then
      echo "[INFO] QA fix verification incomplete or tracking missing."
      verification_failed=1
    fi
  else
    echo "[WARN] Could not locate verify-qa-fixes.js under .bmad-core/ or bmad-core/. Treating verification as failed."
    verification_failed=1
  fi

  echo "Cleaning Dev context..."
  clean_context dev

  echo "Running QA gate..."
  qa_failed=0
  if ! run_qa_gate; then
    qa_failed=1
  fi

  if [[ $qa_failed -eq 0 && $verification_failed -eq 0 ]]; then
    echo "\n✅ QA gate passed and all tracked QA fixes are complete on iteration $iter. Story $STORY_ID ready to be marked Done."
    exit 0
  else
    if [[ $qa_failed -ne 0 ]]; then
      echo "\n❌ QA gate failed on iteration $iter. Preparing for next Dev fix cycle..."
    fi
    if [[ $verification_failed -ne 0 ]]; then
      echo "\n⚠️  QA fix verification indicates pending items. Looping for another Dev fix iteration..."
    fi
  fi

  echo "Cleaning QA context..."
  clean_context qa

  iter=$((iter+1))
done

echo "\n✗ Reached max iterations ($MAX_ITERS) without QA pass for story $STORY_ID."
echo "  - Next: run 'codex "as dev agent, execute *address-qa-feedback @${STORY_ARG}"' and re-run this script, or inspect .ai/test-logs/gates-${STORY_ID}.json"
exit 1
