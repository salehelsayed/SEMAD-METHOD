#!/usr/bin/env bash
set -euo pipefail

# Codex-driven Dev↔QA loop: dev(develop-story) → qa(review) → dev(address-qa-feedback)
# Repeats until QA sets story status to "Done".
# Usage: tools/flows/dev-qa-codex-loop.sh -s <story-file|story-id> [-m <max-iterations>] [--no-codex]

MAX_ITERS=5
STORY_ARG=""
USE_CODEX=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--story) STORY_ARG="$2"; shift 2 ;;
    -m|--max)   MAX_ITERS="$2"; shift 2 ;;
    --no-codex) USE_CODEX=0; shift ;;
    -h|--help)  echo "Usage: $0 -s <story-file|story-id> [-m <iters>] [--no-codex]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "${STORY_ARG}" ]]; then echo "Error: -s|--story is required" >&2; exit 1; fi

have_codex() { command -v codex >/dev/null 2>&1; }

# Resolve project root
resolve_root() {
  local script_dir script_root cwd candidate
  script_dir="$(cd "$(dirname "$0")" && pwd)"; script_root="$(cd "$script_dir/../.." && pwd)"; cwd="$(pwd)"
  candidate="$script_dir"
  while [[ "$candidate" != "/" ]]; do
    if [[ -f "$candidate/package.json" && ( -d "$candidate/bmad-core" || -d "$candidate/.bmad-core" ) ]]; then echo "$candidate"; return 0; fi
    candidate="$(dirname "$candidate")"
  done
  if [[ -f "$script_root/package.json" && ( -d "$script_root/bmad-core" || -d "$script_root/.bmad-core" ) ]]; then echo "$script_root"; return 0; fi
  if [[ -f "$cwd/package.json" && ( -d "$cwd/bmad-core" || -d "$cwd/.bmad-core" ) ]]; then echo "$cwd"; return 0; fi
  echo "$script_root"
}

PROJECT_ROOT="$(resolve_root)"; cd "$PROJECT_ROOT"

# Determine stories directory
resolve_stories_dir() {
  node -e '
    const fs=require("fs"), path=require("path");
    const root=process.cwd();
    const c1=path.join(root,"bmad-core","core-config.yaml"), c2=path.join(root,"core-config.yaml");
    let p=null; if(fs.existsSync(c1)) p=c1; else if(fs.existsSync(c2)) p=c2;
    let dir="docs/stories";
    if(p){ try{ const yaml=require("js-yaml"); const cfg=yaml.load(fs.readFileSync(p,"utf8"))||{}; dir=(cfg.devStoryLocation||cfg.stories?.storyLocation||dir);}catch(e){} }
    if(!path.isAbsolute(dir)) dir=path.join(root,dir);
    process.stdout.write(dir);
  '
}
STORIES_DIR="$(resolve_stories_dir)"

# Resolve story id from path or accept direct id
resolve_story_id() {
  local arg="$1"
  if [[ -f "$arg" ]]; then
    node -e '
      const fs=require("fs"); const p=process.argv[1];
      const c=fs.readFileSync(p,"utf8");
      const m=c.match(/^---\n([\s\S]*?)\n---/)||c.match(/##\s*Story Contract\s*\n\s*---\n([\s\S]*?)\n---/);
      if(!m){ process.stderr.write("No StoryContract YAML in "+p+"\n"); process.exit(2);} 
      const y=m[1]; const mid=y.match(/\bstory_id\s*:\s*\"?([^\"\n]+)\"?/);
      if(!mid){ process.stderr.write("No story_id for "+p+"\n"); process.exit(3);} 
      console.log(String(mid[1]).trim());
    ' "$arg"
  else
    echo "$arg"
  fi
}
STORY_ID="$(resolve_story_id "$STORY_ARG" || true)"; if [[ -z "$STORY_ID" ]]; then echo "Could not resolve story_id" >&2; exit 1; fi

resolve_story_file() {
  local arg="$1"
  if [[ -f "$arg" ]]; then echo "$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")"; return 0; fi
  if [[ -d "$STORIES_DIR" ]]; then
    local cand; cand="$(ls -1 "$STORIES_DIR" 2>/dev/null | grep -E "^${STORY_ID//./\\.}\\..*\\.md$" | head -n 1 || true)"
    if [[ -n "$cand" ]]; then echo "$STORIES_DIR/$cand"; return 0; fi
  fi
  return 1
}

get_story_status() {
  local f; f="$(resolve_story_file "$STORY_ARG" || true)"
  if [[ -z "$f" || ! -f "$f" ]]; then echo ""; return 0; fi
  awk '/^##[[:space:]]*Status[[:space:]]*$/{getline; print tolower($0); exit}' "$f" | tr -d '\r' | sed 's/^ *//; s/ *$//'
}

clean_context() {
  local phase="$1"; local TS; TS="$(date +%s)"
  mkdir -p .ai/archive .ai/reports
  if [[ -d .ai/history ]]; then mv .ai/history ".ai/archive/history-${phase}-${TS}" || true; fi
  rm -f .ai/dev_context.json .ai/dev_tasks.json .ai/qa_findings.json .ai/qa_fixes_checklist.json
}

run_dev() {
  local mode="$1" # develop | fix
  if [[ "$USE_CODEX" -eq 1 ]] && have_codex; then
    local cmd
    if [[ "$mode" == "develop" ]]; then cmd="*develop-story"; else cmd="*address-qa-feedback"; fi
    NO_UPDATE_NOTIFIER=1 codex "as dev agent, execute ${cmd} @${STORY_ARG}" || true
  else
    echo "[INFO] Manual Dev mode; skipping codex dev step."
  fi
}

run_qa() {
  if [[ "$USE_CODEX" -eq 1 ]] && have_codex; then
    NO_UPDATE_NOTIFIER=1 codex "as qa agent, execute *review @${STORY_ARG}" || true
  else
    local sf; sf="$(resolve_story_file "$STORY_ARG" || true)"
    if [[ -n "$sf" && -f "$sf" && -f tools/qa-review.js ]]; then node tools/qa-review.js "$sf" || true; fi
  fi
}

echo "Codex Dev↔QA loop root: $PROJECT_ROOT"
SF="$(resolve_story_file "$STORY_ARG" || true)"; if [[ -n "$SF" ]]; then echo "Story file: $SF"; fi
echo "Story id: $STORY_ID  Max iters: $MAX_ITERS"

iter=1
while [[ $iter -le $MAX_ITERS ]]; do
  echo "\n===== Iteration $iter/$MAX_ITERS: DEV ====="
  if [[ $iter -eq 1 ]]; then run_dev develop; else run_dev fix; fi
  echo "Cleaning Dev context..."; clean_context dev

  echo "Running QA review..."; run_qa
  status_after_qa="$(get_story_status)"
  if [[ "${status_after_qa}" == "done" ]]; then
    echo "\n✅ QA marked the story as Done on iteration $iter."
    exit 0
  fi

  echo "Cleaning QA context..."; clean_context qa
  iter=$((iter+1))
done

echo "\n✗ Reached max iterations ($MAX_ITERS) without QA marking the story Done for $STORY_ID."
echo "  - Next: run 'codex \"as dev agent, execute *address-qa-feedback @${STORY_ARG}\"' and re-run this script."
exit 1

