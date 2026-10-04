# INSTALL_FOR_AGENTS.md

Instructions for an AI coding agent (Claude Code, Codex, Cursor, etc.) asked to install one or more skills from
**https://github.com/lqiaoqing/agent-skills**. This file sits at the repository root:

- GitHub page: https://github.com/lqiaoqing/agent-skills/blob/main/INSTALL_FOR_AGENTS.md
- Raw text (use this if you can't browse GitHub pages): https://raw.githubusercontent.com/lqiaoqing/agent-skills/main/INSTALL_FOR_AGENTS.md

## 0. Work out which skills to install

- **A skill's name is its folder name under `skills/`.** Every folder `skills/<name>/` that contains a `SKILL.md` is an
  installable skill. This list grows over time, so never rely on a hard-coded list; discover it:
  - after cloning: list `skills/` (or run `bash install.sh --list` / `install.ps1 -List`);
  - without a clone: read the "Skill 清单" table in the
    [README](https://raw.githubusercontent.com/lqiaoqing/agent-skills/main/README.md), or the `plugins[].name` values in
    [`.claude-plugin/marketplace.json`](https://raw.githubusercontent.com/lqiaoqing/agent-skills/main/.claude-plugin/marketplace.json),
    or the GitHub API `https://api.github.com/repos/lqiaoqing/agent-skills/contents/skills`.
- Match the user's request against those names. Users may separate several names with `、`, `,`, `和` or `and`; matching
  is case-insensitive. **"全部" / "全部 skill" / "所有" / "all"** means every available skill.
- If a requested name doesn't exist, **don't guess silently**: tell the user it wasn't found, list the available names
  (with the one-line descriptions from the README table if you have them), and ask which they meant. If one name is an
  obvious near-match (typo, missing hyphen), you may propose it, but confirm before installing.
- Install only what was asked for.

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
If the clone already exists, run `git -C <clone> pull` instead of cloning again. Both scripts discover skills from
`skills/` automatically and reject unknown names with the list of available ones.

macOS / Linux / WSL:
```bash
git clone https://github.com/lqiaoqing/agent-skills.git ~/.agent-skills/agent-skills
cd ~/.agent-skills/agent-skills
bash install.sh --list                          # available skill names
bash install.sh --claude --only <name1>,<name2> # --claude | --codex (no flag = both); omit --only for all skills
#   --copy = copies instead of symlinks
```

Windows (PowerShell):
```powershell
git clone https://github.com/lqiaoqing/agent-skills.git "$env:USERPROFILE\.agent-skills\agent-skills"
cd "$env:USERPROFILE\.agent-skills\agent-skills"
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -List
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool claude -Only <name1>,<name2>
#   -Tool claude | codex | both (default both) · omit -Only for all skills
#   -Copy = copies instead of junctions. Junctions need no admin rights.
```

## 3. Fallback without git: download the zip

macOS / Linux (repeat the `cp` per skill and per target dir):
```bash
tmp="$(mktemp -d)" && curl -fsSL -o "$tmp/a.zip" https://github.com/lqiaoqing/agent-skills/archive/refs/heads/main.zip
unzip -q "$tmp/a.zip" -d "$tmp" && ls "$tmp/agent-skills-main/skills"     # available names
mkdir -p ~/.claude/skills && cp -R "$tmp/agent-skills-main/skills/<name>" ~/.claude/skills/
```
Windows (PowerShell):
```powershell
$tmp = Join-Path $env:TEMP "agent-skills-$(Get-Random)"; New-Item -ItemType Directory $tmp | Out-Null
Invoke-WebRequest https://github.com/lqiaoqing/agent-skills/archive/refs/heads/main.zip -OutFile "$tmp\a.zip"
Expand-Archive "$tmp\a.zip" $tmp; Get-ChildItem "$tmp\agent-skills-main\skills" -Name   # available names
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item "$tmp\agent-skills-main\skills\<name>" "$env:USERPROFILE\.claude\skills\" -Recurse
```
Delete the temp folder afterwards. Zip installs don't update themselves; to update, repeat the download.

## 4. Verify and report

- Confirm `<skills dir>/<name>/SKILL.md` exists for every requested skill and its front matter says `name: <name>`.
- Tell the user what you installed and where, and that they must **restart Claude Code / Codex** (or start a new
  session) before the skills are picked up.
- Claude Code only, alternative: `/plugin marketplace add lqiaoqing/agent-skills` then `/plugin install <name>@lqiaoqing-agent-skills`.

## 5. Optional: dependency check (report it; don't install system software without the user's OK)

Each skill's requirements are in the "主要依赖" column of the README table and in its `SKILL.md`. Check
them (e.g. `node -v`, `ffmpeg -version`, `bun --version`, `uv --version`, `python --version`, Chrome/Edge present),
report what is missing and suggest how to install it; only install after the user says yes. Common ones:

| Missing | Windows (no admin) | macOS |
|---|---|---|
| Node.js | `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | `winget install Gyan.FFmpeg --scope user` | `brew install ffmpeg` |
| Chrome/Edge | Edge is preinstalled on Windows | install Chrome |
| bun | `winget install Oven-sh.Bun --scope user` | `brew install oven-sh/bun/bun` |
| uv | `winget install astral-sh.uv --scope user` | `brew install uv` |
| Python 3 | `winget install Python.Python.3.12` | preinstalled / `brew install python` |

Mainland China / slow network: if GitHub is slow, use the user's proxy (`git config --global http.https://github.com.proxy
http://127.0.0.1:<port>`, or set `HTTPS_PROXY` for npm, bun and uv). Whisper models: `HF_ENDPOINT=https://hf-mirror.com`.
Per-project npm and Python dependencies are installed later by each skill's own scripts, not now.
