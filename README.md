# agent-skills

给 **Claude Code** 和 **Codex** 用的 Agent Skills（智能体技能），两款都是**用代码渲染音乐视频**，并针对**中文歌词**和
**Windows 笔记本（核显）**做了适配。每个技能是 `skills/<名字>/` 下的一个文件夹，入口是 `SKILL.md`（带 `name` /
`description` 头信息），Claude Code 和 Codex 通用。

| 技能 | 做什么 | 基于 |
|---|---|---|
| [`painted-mv`](skills/painted-mv/) | **水彩手绘风动画 / 歌词 MV**（PDoomVideo 风格）：p5.js + p5.brush 逐帧画水彩和墨线，headless Chrome 渲染，ffmpeg 合成。歌曲驱动流程：测节拍 → faster-whisper 对齐歌词 → 按歌词写分镜 → 逐章作画 → 联系表自查 → 出片；中文毛笔字卡拉 OK | [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)、[opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) `painted-animation`、[paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) 的流程与脚本 |
| [`kinetic-lyric-mv`](skills/kinetic-lyric-mv/) | **three.js 卡点动态歌词 MV**（[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) 风格）：着色器、刻线、逐字砸字、辉光、颗粒、子帧运动模糊，与节拍和逐字歌词同步；中文逐字排版（思源黑体 Noto Sans SC），核显低配预设 | [super-motion-graphics](https://github.com/Dakota1-1/super-motion-graphics)（移植自 pdoom-video） |

## 安装

### 方式一：Windows 一键（克隆 + 安装脚本）

```powershell
git clone https://github.com/lqiaoqing/agent-skills.git
cd agent-skills
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

默认同时装到 Claude Code（`%USERPROFILE%\.claude\skills\`）和 Codex（`%USERPROFILE%\.codex\skills\`，设置了 `CODEX_HOME`
则装到 `%CODEX_HOME%\skills\`）。用的是**目录联接**（junction），不需要管理员权限，以后在克隆目录里 `git pull` 就自动更新。
克隆放在哪个目录都可以。

| 选项 | 作用 |
|---|---|
| `-Tool claude` / `-Tool codex` / `-Tool both`（默认） | 只装 Claude Code / 只装 Codex / 两个都装 |
| `-Copy` | 复制文件而不是建联接（更新时需重新运行一次） |
| `-Only painted-mv` | 只装某一个技能 |
| `-Targets D:\别的\skills` | 装到自定义的 skills 目录 |
| `-Uninstall` | 卸载本脚本装的技能 |

目标位置已有同名文件夹时，会先改名为 `<名字>.bak-时间戳` 再安装。

### 方式二：macOS / Linux / WSL

```bash
git clone https://github.com/lqiaoqing/agent-skills.git && cd agent-skills && ./install.sh
# ./install.sh --claude   只装 Claude Code      ./install.sh --codex   只装 Codex
# ./install.sh --copy     复制而不是软链接      ./install.sh --uninstall  卸载
```

### 方式三：手动安装

把 `skills/painted-mv`、`skills/kinetic-lyric-mv` 整个文件夹复制到：

- Claude Code：`~/.claude/skills/`（Windows：`C:\Users\<用户名>\.claude\skills\`），或项目里的 `.claude/skills/`
- Codex：`~/.codex/skills/`（Windows：`C:\Users\<用户名>\.codex\skills\`）

复制后的结构应该是 `~/.claude/skills/painted-mv/SKILL.md`。

### 方式四：Claude Code 插件市场

在 Claude Code 里执行：

```
/plugin marketplace add lqiaoqing/agent-skills
/plugin install painted-mv@lqiaoqing-agent-skills
/plugin install kinetic-lyric-mv@lqiaoqing-agent-skills
```

命令行写法：`claude plugin marketplace add lqiaoqing/agent-skills`，再 `claude plugin install painted-mv@lqiaoqing-agent-skills`。
更新：`/plugin marketplace update lqiaoqing-agent-skills`。插件方式装的技能，名字会带插件前缀（例如 `painted-mv:painted-mv`）。

装好后**重启 Claude Code / Codex**。

## 更新

- 克隆 + 联接/软链接安装：`cd agent-skills && git pull`，立即生效（重启一下工具即可）。
- 用 `-Copy` / `--copy` / 手动复制安装的：`git pull` 后再运行一次安装脚本（或重新复制）。
- 插件市场：`/plugin marketplace update lqiaoqing-agent-skills`。

## 依赖

| 依赖 | 用途 | Windows 免管理员安装 | macOS |
|---|---|---|---|
| Node.js ≥ 22.6 | 两个技能的渲染器 | [nodejs.org](https://nodejs.org) 或 `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | 编码 MP4 | `winget install Gyan.FFmpeg --scope user` | `brew install ffmpeg` |
| Chrome 或 Edge | headless 渲染（WebGL 走 ANGLE；Windows 默认用 D3D11，Intel 核显可用） | Windows 自带 Edge 就行 | Chrome |
| bun | kinetic-lyric-mv 安装依赖和预览 | `winget install Oven-sh.Bun --scope user` | `brew install oven-sh/bun/bun` |
| uv | 音乐分析（librosa）、歌词对齐（faster-whisper），会自动下载 Python | `winget install astral-sh.uv --scope user` | `brew install uv` |
| Python 3 | 脚本入口（`new_project.py`、`beat_grid.py`） | python.org 或 `winget install Python.Python.3.12` | 系统自带 / brew |

网络慢或需要代理时，先设置 `$env:HTTPS_PROXY="http://127.0.0.1:<代理端口>"`（PowerShell；mac/Linux 用 `export HTTPS_PROXY=...`），
npm / bun / uv 下载都会走代理。whisper 模型在国内可以先设 `HF_ENDPOINT=https://hf-mirror.com`。
每个项目的 npm/Python 依赖在建项目时自动安装，不会装进本仓库。

## 快速上手（对 Claude Code / Codex 直接说）

- “用 painted-mv 给 `D:\music\song.mp3` 做一支水彩手绘风 MV，歌词在 `song.lrc`，先给我看分镜。”
- “我只有纯文本歌词 `lyrics.txt`，帮我对齐时间轴，然后做一段 30 秒的水彩动画歌词视频。”
- “做一个 10 秒的水彩小动画：小狐狸在雨里追一片叶子，不要文字。”
- “用 kinetic-lyric-mv 给这首歌做动态歌词卡点视频，中文逐字砸字，黑底橙色强调色，先出 720p 草稿。”
- “把 kinetic 草稿按 1080p 30fps 出成片。”

技能会按 `SKILL.md` 里的流程推进：建项目 → 对时 → 写分镜/方案（先给你过目）→ 逐镜头制作并看联系表 → 渲染出片。
手动用法见各技能的 `SKILL.md`，例如：

```powershell
node $HOME\.claude\skills\painted-mv\scripts\new_project.mjs my-mv --audio=song.mp3 --lyrics=song.lrc --title="歌名"
python $HOME\.claude\skills\kinetic-lyric-mv\scripts\new_project.py my-kinetic --audio song.mp3 --lyrics song.lrc
```

## 核显性能参考

测试平台：Redmi Book Pro 14 2024，Intel Core Ultra 5 125H，**Intel Arc 核显**，Windows 11，插电。10 秒片段，120 BPM 合成音频 + 4 句中文歌词：

| 技能 | 设置 | 渲染耗时 |
|---|---|---|
| painted-mv | 1920×1080、24 fps、`--frames --workers=4` + `--encode` | 约 227 s 出帧（约 0.94 s/帧，4 路并行）+ 约 7 s 编码 |
| kinetic-lyric-mv | `--profile low`（默认：1280×720、30 fps、2 个子帧） | 25 s |
| kinetic-lyric-mv | `--profile mid`（1920×1080、30 fps、12 个子帧） | 160 s |

WebGL 跑在 `ANGLE (Intel(R) Arc(TM) Graphics, Direct3D11)` 上（不是软件渲染）。建议：

- kinetic-lyric-mv：草稿用默认 `low`，成片用 `--profile mid`；`--profile high`（上游的 1080p60 + 最多 324 个子帧的自适应运动模糊）留给独立显卡。
- painted-mv：草稿用 `--fps=12`、`--range=a:b`；`--frames` 并行且可断点续渲，核显 `--workers=2..4` 就够了。
- 先检查用的是不是显卡：`node render.mjs --gpu`（painted）/ `node scripts/render.ts gpu`（kinetic），应显示你的 GPU，而不是 SwiftShader。
  有问题可以试 `--angle=d3d11on12` 或 `--angle=gl`。笔记本请插上电源。

## 许可证与致谢

**本仓库的改编部分**（Windows / 中文 / 低配适配、安装脚本、文档）使用 **MIT** 许可证，见 [`LICENSE`](LICENSE)。
上游代码保持各自的许可证。每个技能文件夹都保留了上游的 LICENSE 文件，并在 `NOTICE.md` 里逐项列出文件来源：

| 来源 | 用在哪里 | 许可证 |
|---|---|---|
| [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | painted-mv 的引擎 `template/` | MIT（`skills/painted-mv/template/LICENSE`） |
| [tuzhechen2005/opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) | painted-mv 的技能结构、卡拉 OK、示例、`beat_grid.py` | MIT（仓库根目录有 LICENSE 文件；副本在 `skills/painted-mv/LICENSE`） |
| [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | painted-mv 的 `analyze_audio.mjs`、`lyrics_to_ly.mjs`、`align_lyrics.py`，以及对时、分镜方法 | MIT（`skills/painted-mv/LICENSE.paint-mv-skills`） |
| [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（Giacomo Magnanini），由 [Dakota1-1/super-motion-graphics](https://github.com/Dakota1-1/super-motion-graphics) 打包成技能 | kinetic-lyric-mv 的引擎、场景、分析工具、文档 | MIT（`skills/kinetic-lyric-mv/LICENSE`） |
| 字体 Ma Shan Zheng、Shantell Sans、Noto Sans SC（子集化）、Archivo、Cormorant Garamond、IBM Plex Mono | 两个技能的 `fonts/` | SIL OFL 1.1（随附 OFL 文本） |
| 字体 Permanent Marker | painted-mv | Apache-2.0（随附） |
| Hershey / EMS 笔画字体（`template/app/public/fonts/stroke/*.svg`） | kinetic-lyric-mv | 授权写在每个 SVG 文件头里：EMS 字体（Sheldon B. Michaels）是 SIL OFL；Hershey 字体按其分发条款，任何人可用于任何用途（包括商用），条款文本也在文件头里 |

- **不包含** [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) 的任何代码（该仓库没有声明许可证）。paint-mv-skills 里用来下载并给 PDoomVideo 打补丁的 `fetch_upstream.mjs` / `template.patch` 特意没有带上；painted-mv 的引擎用的是同一作者以 MIT 发布的 ClaudeAnimationBase。
- P(doom) 等示例歌曲和歌词不包含在本仓库内，也不在 MIT 许可范围内。用这些技能制作视频时，歌曲和歌词的版权由使用者自行负责。
- npm 依赖（p5.js、p5.brush、three.js、puppeteer-core、playwright-core 等）在建项目时安装，遵循各自的许可证。

感谢以上各位作者的开源工作。
