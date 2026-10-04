# INSTALL_FOR_AGENTS.md

Instructions for an AI coding agent (Claude Code, Codex, Cursor, etc.) asked to install skills from this repository.
Raw URL: https://raw.githubusercontent.com/lqiaoqing/agent-skills/main/INSTALL_FOR_AGENTS.md

Available skills: `painted-mv`, `kinetic-lyric-mv`. Install only the ones the user asked for; "all" or "both" means both.

## 1. Decide the targets

| Tool the user named | Skills dir (macOS / Linux) | Skills dir (Windows) |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `%USERPROFILE%\.claude\skills\` |
| Codex | `${CODEX_HOME:-~/.codex}/skills/` | `%CODEX_HOME%\skills\` if CODEX_HOME is set, else `%USERPROFILE%\.codex\skills\` |

If the user didn't name a tool, install for the tool you are running in. If they said both, or you can't tell, use both.
Each skill ends up at `<skills dir>/<name>/SKILL.md`.

**Before installing, check each `<skills dir>/<name>`.** If it is a symlink or junction into another agent-skills clone, it is
safe to replace. If it is a real folder that is not from this repo (its `SKILL.md` has a different `name:`), **ask the user
before touching it**. The install scripts never delete an existing folder; they rename it to `<name>.bak-<timestamp>`.

## 2. Preferred: clone + install script (updates later with `git pull`)

Use a stable clone location: `~/.agent-skills/agent-skills` (Windows `%USERPROFILE%\.agent-skills\agent-skills`).
If the clone already exists, run `git -C <clone> pull` instead of cloning again.

macOS / Linux / WSL:
```bash
git clone https://github.com/lqiaoqing/agent-skills.git ~/.agent-skills/agent-skills
cd ~/.agent-skills/agent-skills
bash install.sh --claude         # or --codex; no flag = both. Installs every skill as symlinks.
```
`install.sh` always installs all skills. To install only one, use symlinks yourself:
`ln -s ~/.agent-skills/agent-skills/skills/painted-mv ~/.claude/skills/painted-mv`.

Windows (PowerShell):
```powershell
git clone https://github.com/lqiaoqing/agent-skills.git "$env:USERPROFILE\.agent-skills\agent-skills"
cd "$env:USERPROFILE\.agent-skills\agent-skills"
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool claude -Only painted-mv
#   -Tool claude | codex | both (default both) · -Only painted-mv | kinetic-lyric-mv | painted-mv,kinetic-lyric-mv (default all)
#   -Copy = copies instead of junctions. Junctions need no admin rights.
```

## 3. Fallback without git: download the zip

macOS / Linux:
```bash
tmp="$(mktemp -d)" && curl -fsSL -o "$tmp/a.zip" https://github.com/lqiaoqing/agent-skills/archive/refs/heads/main.zip
unzip -q "$tmp/a.zip" -d "$tmp" && mkdir -p ~/.claude/skills && cp -R "$tmp/agent-skills-main/skills/painted-mv" ~/.claude/skills/
```
Windows (PowerShell):
```powershell
$tmp = Join-Path $env:TEMP "agent-skills-$(Get-Random)"; New-Item -ItemType Directory $tmp | Out-Null
Invoke-WebRequest https://github.com/lqiaoqing/agent-skills/archive/refs/heads/main.zip -OutFile "$tmp\a.zip"
Expand-Archive "$tmp\a.zip" $tmp; New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item "$tmp\agent-skills-main\skills\painted-mv" "$env:USERPROFILE\.claude\skills\" -Recurse
```
Repeat the copy for each requested skill and target dir, then delete the temp folder. Zip installs don't update
themselves; to update, repeat the download.

## 4. Verify and report

- Confirm `<skills dir>/<name>/SKILL.md` exists and its front matter says `name: <name>`.
- Tell the user where you installed it and that they must **restart Claude Code / Codex** (or start a new session)
  before the skill is picked up.
- Claude Code only, alternative: `/plugin marketplace add lqiaoqing/agent-skills` then `/plugin install <name>@lqiaoqing-agent-skills`.

## 5. Optional: dependency check (report it; don't install system software without the user's OK)

Check with `node -v` (need ≥ 22.6), `ffmpeg -version`, Chrome or Edge present, and, for kinetic-lyric-mv, `bun --version`
and `uv --version`. Report what is missing and suggest how to install it; only install after the user says yes:

| Missing | Windows (no admin) | macOS |
|---|---|---|
| Node.js | `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | `winget install Gyan.FFmpeg --scope user` | `brew install ffmpeg` |
| Chrome/Edge | Edge is preinstalled on Windows | install Chrome |
| bun | `winget install Oven-sh.Bun --scope user` | `brew install oven-sh/bun/bun` |
| uv | `winget install astral-sh.uv --scope user` | `brew install uv` |

Mainland China / slow network: if GitHub is slow, use the user's proxy (`git config --global http.https://github.com.proxy
http://127.0.0.1:<port>`, or set `HTTPS_PROXY` for npm, bun and uv). Whisper models: `HF_ENDPOINT=https://hf-mirror.com`.
Per-project npm and Python dependencies are installed later by each skill's `new_project` script, not now.
