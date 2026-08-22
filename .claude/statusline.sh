#!/usr/bin/env bash
# Claude Code status line: <branch> // <model> // <effort>
# Reads the session JSON Claude Code writes to stdin.
set -uo pipefail

input=$(cat)

dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
[ -n "$dir" ] || dir=$PWD

branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")

model=$(printf '%s' "$input" | jq -r '.model.display_name // .model.id // "unknown"')

# Effort: from the session payload when it carries one, otherwise the saved
# default (project settings win over user settings, as elsewhere in the config).
effort=$(printf '%s' "$input" | jq -r '.effort // .effortLevel // .model.effort // empty')
if [ -z "$effort" ]; then
  for f in "$dir/.claude/settings.local.json" "$dir/.claude/settings.json" "$HOME/.claude/settings.json"; do
    [ -f "$f" ] || continue
    effort=$(jq -r '.effortLevel // empty' "$f" 2>/dev/null)
    [ -n "$effort" ] && break
  done
fi
[ -n "$effort" ] || effort="default"

printf '%s // %s // %s' "$branch" "$model" "$effort"
