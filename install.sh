#!/usr/bin/env bash
# install.sh — symlink every skill in ./skills into ~/.claude/skills and ~/.codex/skills (macOS / Linux / WSL).
#   ./install.sh [--copy]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for t in "$HOME/.claude/skills" "$HOME/.codex/skills"; do
  mkdir -p "$t"
  for s in "$here"/skills/*/; do
    n="$(basename "$s")"; d="$t/$n"
    if [ -L "$d" ]; then rm "$d"; elif [ -e "$d" ]; then mv "$d" "$d.bak-$(date +%s)"; fi
    if [ "${1:-}" = "--copy" ]; then cp -R "$s" "$d"; echo "copied  $d"; else ln -s "${s%/}" "$d"; echo "linked  $d"; fi
  done
done
