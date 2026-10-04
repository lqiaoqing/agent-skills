#!/usr/bin/env bash
# install.sh - install the skills in ./skills into Claude Code and/or Codex (macOS / Linux / WSL). Works from any clone.
#   ./install.sh                 both tools, symlinks (git pull updates them)
#   ./install.sh --claude        only ~/.claude/skills
#   ./install.sh --codex         only ~/.codex/skills (or $CODEX_HOME/skills)
#   ./install.sh --copy          copies instead of symlinks
#   ./install.sh --only a,b      only these skills (folder names under skills/); default: every folder with a SKILL.md
#   ./install.sh --list          list available skills
#   ./install.sh --uninstall     remove what this script installed
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode=link; tools="claude codex"; uninstall=0; only=""
available() { for s in "$here"/skills/*/; do [ -f "$s/SKILL.md" ] && basename "$s"; done; }
while [ $# -gt 0 ]; do
  a="$1"; shift
  case "$a" in
    --only) only="${1:-}"; shift || true ;;
    --only=*) only="${a#--only=}" ;;
    --list) available; exit 0 ;;
    --copy) mode=copy ;;
    --claude) tools="claude" ;;
    --codex) tools="codex" ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
only="$(printf '%s' "$only" | tr ',;、' '   ')"
for n in $only; do
  [ -f "$here/skills/$n/SKILL.md" ] || { echo "no skill named '$n'. Available: $(available | tr '\n' ' ')" >&2; exit 1; }
done
for tool in $tools; do
  if [ "$tool" = claude ]; then t="$HOME/.claude/skills"; else t="${CODEX_HOME:-$HOME/.codex}/skills"; fi
  mkdir -p "$t"
  for s in "$here"/skills/*/; do
    [ -f "$s/SKILL.md" ] || continue
    n="$(basename "$s")"; d="$t/$n"
    if [ -n "$only" ] && ! printf ' %s ' $only | grep -q " $n "; then continue; fi
    if [ -L "$d" ]; then rm "$d"; elif [ -e "$d" ]; then
      if [ "$uninstall" = 1 ]; then rm -rf "$d"; else mv "$d" "$d.bak-$(date +%s)"; echo "  existing folder moved to $d.bak-*"; fi
    fi
    if [ "$uninstall" = 1 ]; then echo "removed $d"; continue; fi
    if [ "$mode" = copy ]; then cp -R "${s%/}" "$d"; echo "copied  $d"; else ln -s "${s%/}" "$d"; echo "linked  $d -> ${s%/}"; fi
  done
done
echo "done. Restart Claude Code / Codex so they pick up the skills."
