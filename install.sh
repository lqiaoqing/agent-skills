#!/usr/bin/env bash
# install.sh - install the skills in ./skills into Claude Code and/or Codex (macOS / Linux / WSL). Works from any clone.
#   ./install.sh                 both tools, symlinks (git pull updates them)
#   ./install.sh --claude        only ~/.claude/skills
#   ./install.sh --codex         only ~/.codex/skills (or $CODEX_HOME/skills)
#   ./install.sh --copy          copies instead of symlinks
#   ./install.sh --uninstall     remove what this script installed
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode=link; tools="claude codex"; uninstall=0
for a in "$@"; do
  case "$a" in
    --copy) mode=copy ;;
    --claude) tools="claude" ;;
    --codex) tools="codex" ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
for tool in $tools; do
  if [ "$tool" = claude ]; then t="$HOME/.claude/skills"; else t="${CODEX_HOME:-$HOME/.codex}/skills"; fi
  mkdir -p "$t"
  for s in "$here"/skills/*/; do
    [ -f "$s/SKILL.md" ] || continue
    n="$(basename "$s")"; d="$t/$n"
    if [ -L "$d" ]; then rm "$d"; elif [ -e "$d" ]; then
      if [ "$uninstall" = 1 ]; then rm -rf "$d"; else mv "$d" "$d.bak-$(date +%s)"; echo "  existing folder moved to $d.bak-*"; fi
    fi
    if [ "$uninstall" = 1 ]; then echo "removed $d"; continue; fi
    if [ "$mode" = copy ]; then cp -R "${s%/}" "$d"; echo "copied  $d"; else ln -s "${s%/}" "$d"; echo "linked  $d -> ${s%/}"; fi
  done
done
echo "done. Restart Claude Code / Codex so they pick up the skills."
