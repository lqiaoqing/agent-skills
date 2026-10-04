# agent-skills

给 **Claude Code** 和 **Codex** 用的 Agent Skills（智能体技能）合集，偏重中文场景和 Windows 笔记本（核显）。每个技能是
`skills/<skill名>/` 下的一个文件夹，入口是 `SKILL.md`（带 `name` / `description` 头信息），Claude Code 和 Codex 通用。
**skill 名就是文件夹名**，全部列在下面的 [Skill 清单](#skill-清单) 里。

## 一句话安装（推荐）

把下面这句粘贴到 **Claude Code / Codex / Cursor 等智能体**的对话框里，它会读取仓库根目录的安装说明并替你完成安装（Windows、macOS、Linux 都适用）：

```text
按 https://github.com/lqiaoqing/agent-skills 仓库里 INSTALL_FOR_AGENTS.md 的步骤，把 <skill名> 安装到我的 Claude Code。
```

- `<skill名>` 换成 [Skill 清单](#skill-清单) 里的名字；装多个就用 `、` 隔开，全都要就写“全部 skill”。
- “Claude Code” 可以换成 “Codex”，两个都装就写 “Claude Code 和 Codex”。

例如：

```text
按 https://github.com/lqiaoqing/agent-skills 仓库里 INSTALL_FOR_AGENTS.md 的步骤，把 painted-mv 安装到我的 Claude Code 和 Codex。
```

> 小提示：如果智能体打不开 GitHub 网页，可以把链接换成原始文件地址
> `https://raw.githubusercontent.com/lqiaoqing/agent-skills/main/INSTALL_FOR_AGENTS.md`。

智能体会：克隆仓库到 `~/.agent-skills/agent-skills` 并运行安装脚本（没有 git 就下载 zip 解压），检查 `SKILL.md` 是否到位；
名字写错时会列出可用的 skill 让你选；遇到同名的其他技能会先问你；它可以帮你检查依赖，但不会擅自安装系统软件。
装完重启 Claude Code / Codex 即可。说明原文：[INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md)。

Claude Code 也可以直接用斜杠命令安装：

```text
/plugin marketplace add lqiaoqing/agent-skills
/plugin install <skill名>@lqiaoqing-agent-skills
```

## Skill 清单

| skill 名 | 一句话说明 | 主要依赖 | 目录 |
|---|---|---|---|
| `painted-mv` | 水彩手绘风动画 / 歌词 MV：p5.js + p5.brush 逐帧作画，测节拍、对齐歌词、写分镜后出片，支持中文毛笔字卡拉 OK | Node ≥ 22.6、ffmpeg、Chrome/Edge；歌词对齐可选 uv（faster-whisper） | [skills/painted-mv](skills/painted-mv/) |
| `painted-story` | 水彩手绘风故事动画：给故事、剧本或只给主题（先写脚本），用 AI 配音（免费 edge-tts）+ 字幕、纯字幕或你自己的录音（whisper 自动对齐），可加背景音乐；同 painted-mv 的引擎，独立安装 | Node ≥ 22.6、ffmpeg、Chrome/Edge、uv（edge-tts / faster-whisper） | [skills/painted-story](skills/painted-story/) |
| `kinetic-lyric-mv` | three.js 卡点动态歌词 MV：着色器、逐字砸字、辉光与运动模糊，跟节拍同步，中文逐字排版，带核显低配预设 | Node ≥ 22.6、ffmpeg、Chrome/Edge、bun、uv / Python 3 | [skills/kinetic-lyric-mv](skills/kinetic-lyric-mv/) |

各技能的上游来源和许可证见文末“许可证与致谢”和各文件夹里的 `NOTICE.md`。

## 其他安装方式

两个安装脚本都会**自动发现** `skills/` 下所有带 `SKILL.md` 的文件夹，不需要改脚本。

### Windows（克隆 + 安装脚本）

```powershell
git clone https://github.com/lqiaoqing/agent-skills.git
cd agent-skills
powershell -ExecutionPolicy Bypass -File .\install.ps1                 # 安装全部 skill
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Only <skill名>  # 只装指定的，多个用逗号隔开
```

默认同时装到 Claude Code（`%USERPROFILE%\.claude\skills\`）和 Codex（`%USERPROFILE%\.codex\skills\`，设置了 `CODEX_HOME`
则装到 `%CODEX_HOME%\skills\`）。用的是**目录联接**（junction），不需要管理员权限，以后在克隆目录里 `git pull` 就自动更新。
克隆放在哪个目录都可以。

| 选项 | 作用 |
|---|---|
| `-Tool claude` / `-Tool codex` / `-Tool both`（默认） | 只装 Claude Code / 只装 Codex / 两个都装 |
| `-Only <skill名>,<skill名>` | 只装指定的 skill（默认全部） |
| `-List` | 列出可安装的 skill 名 |
| `-Copy` | 复制文件而不是建联接（更新时需重新运行一次） |
| `-Targets D:\别的\skills` | 装到自定义的 skills 目录 |
| `-Uninstall` | 卸载本脚本装的技能 |

目标位置已有同名文件夹时，会先改名为 `<名字>.bak-时间戳` 再安装。

### macOS / Linux / WSL

```bash
git clone https://github.com/lqiaoqing/agent-skills.git && cd agent-skills && bash install.sh
# bash install.sh --only <skill名>,<skill名>   只装指定的      bash install.sh --list     列出可安装的 skill
# bash install.sh --claude   只装 Claude Code             bash install.sh --codex    只装 Codex
# bash install.sh --copy     复制而不是软链接             bash install.sh --uninstall  卸载
```

### 手动安装

把 `skills/<skill名>` 整个文件夹复制到：

- Claude Code：`~/.claude/skills/`（Windows：`C:\Users\<用户名>\.claude\skills\`），或项目里的 `.claude/skills/`
- Codex：`~/.codex/skills/`（Windows：`C:\Users\<用户名>\.codex\skills\`）

复制后的结构应该是 `~/.claude/skills/<skill名>/SKILL.md`。

### Claude Code 插件市场

斜杠命令见上文；命令行写法：`claude plugin marketplace add lqiaoqing/agent-skills`，再
`claude plugin install <skill名>@lqiaoqing-agent-skills`。插件方式装的技能，名字会带插件前缀（例如 `<skill名>:<skill名>`）。

装好后**重启 Claude Code / Codex**。

## 更新

- 克隆 + 联接/软链接安装：`cd agent-skills && git pull`，立即生效（重启一下工具即可）。
- 用 `-Copy` / `--copy` / 手动复制安装的：`git pull` 后再运行一次安装脚本（或重新复制）。
- 插件市场：`/plugin marketplace update lqiaoqing-agent-skills`。

## 依赖

| 依赖 | 用途 | Windows 免管理员安装 | macOS |
|---|---|---|---|
| Node.js ≥ 22.6 | 渲染器（painted-mv、painted-story、kinetic-lyric-mv） | [nodejs.org](https://nodejs.org) 或 `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | 编码 MP4 | `winget install Gyan.FFmpeg --scope user` | `brew install ffmpeg` |
| Chrome 或 Edge | headless 渲染（WebGL 走 ANGLE；Windows 默认用 D3D11，Intel 核显可用） | Windows 自带 Edge 就行 | Chrome |
| bun | kinetic-lyric-mv 安装依赖和预览 | `winget install Oven-sh.Bun --scope user` | `brew install oven-sh/bun/bun` |
| uv | 音乐分析（librosa）、歌词/录音对齐（faster-whisper）、AI 配音（edge-tts，需联网），会自动下载 Python | `winget install astral-sh.uv --scope user` | `brew install uv` |
| Python 3 | 脚本入口（`new_project.py`、`beat_grid.py`） | python.org 或 `winget install Python.Python.3.12` | 系统自带 / brew |

网络慢或需要代理时，先设置 `$env:HTTPS_PROXY="http://127.0.0.1:<代理端口>"`（PowerShell；mac/Linux 用 `export HTTPS_PROXY=...`），
npm / bun / uv 下载都会走代理。whisper 模型在国内可以先设 `HF_ENDPOINT=https://hf-mirror.com`。
每个项目的 npm/Python 依赖在建项目时自动安装，不会装进本仓库。

## 快速上手（对 Claude Code / Codex 直接说）

- “用 painted-mv 给 `D:\music\song.mp3` 做一支水彩手绘风 MV，歌词在 `song.lrc`，先给我看分镜。”
- “我只有纯文本歌词 `lyrics.txt`，帮我对齐时间轴，然后做一段 30 秒的水彩动画歌词视频。”
- “做一个 10 秒的水彩小动画：小狐狸在雨里追一片叶子，不要文字。”
- “用 painted-story 把这个故事做成 40 秒左右的水彩绘本动画，AI 配音加中文字幕。”（它会先问你配音/字幕/背景音乐怎么选）
- “用 painted-story 写一个小机器人找星星的儿童故事，脚本先给我看，然后只配字幕和轻音乐。”
- “用 kinetic-lyric-mv 给这首歌做动态歌词卡点视频，中文逐字砸字，黑底橙色强调色，先出 720p 草稿。”
- “把 kinetic 草稿按 1080p 30fps 出成片。”

技能会按 `SKILL.md` 里的流程推进：建项目 → 对时 → 写分镜/方案（先给你过目）→ 逐镜头制作并看联系表 → 渲染出片。
手动用法见各技能的 `SKILL.md`，例如：

```powershell
node $HOME\.claude\skills\painted-mv\scripts\new_project.mjs my-mv --audio=song.mp3 --lyrics=song.lrc --title="歌名"
node $HOME\.claude\skills\painted-story\scripts\new_project.mjs my-story --story=story.md --mode=tts   # 或 --mode=subs / --mode=voice
python $HOME\.claude\skills\kinetic-lyric-mv\scripts\new_project.py my-kinetic --audio song.mp3 --lyrics song.lrc
```

## 核显性能参考

测试平台：Redmi Book Pro 14 2024，Intel Core Ultra 5 125H，**Intel Arc 核显**，Windows 11，插电。10 秒片段，120 BPM 合成音频 + 4 句中文歌词：

| 技能 | 设置 | 渲染耗时 |
|---|---|---|
| painted-mv | 1920×1080、24 fps、`--frames --workers=4` + `--encode` | 约 227 s 出帧（约 0.94 s/帧，4 路并行）+ 约 7 s 编码 |
| painted-story | 示例《豆豆和迷路的小星星》，34.3 s，1920×1080、24 fps、`--workers=4` | 约 600 s 出帧（约 0.73 s/帧）+ 约 20 s 编码 |
| kinetic-lyric-mv | `--profile low`（默认：1280×720、30 fps、2 个子帧） | 25 s |
| kinetic-lyric-mv | `--profile mid`（1920×1080、30 fps、12 个子帧） | 160 s |

WebGL 跑在 `ANGLE (Intel(R) Arc(TM) Graphics, Direct3D11)` 上（不是软件渲染）。建议：

- kinetic-lyric-mv：草稿用默认 `low`，成片用 `--profile mid`；`--profile high`（上游的 1080p60 + 最多 324 个子帧的自适应运动模糊）留给独立显卡。
- painted-mv：草稿用 `--fps=12`、`--range=a:b`；`--frames` 并行且可断点续渲，核显 `--workers=2..4` 就够了。
- 先检查用的是不是显卡：`node render.mjs --gpu`（painted）/ `node scripts/render.ts gpu`（kinetic），应显示你的 GPU，而不是 SwiftShader。
  有问题可以试 `--angle=d3d11on12` 或 `--angle=gl`。笔记本请插上电源。

## 新增 skill（贡献者）

1. 在 `skills/` 下新建文件夹 `skills/<skill名>/`，放入 `SKILL.md`，头信息里的 `name` 必须和文件夹名一致，并写好 `description`。
2. 在上面的 [Skill 清单](#skill-清单) 表格里加一行（这是 README 里唯一需要写单个 skill 信息的地方）。
3. 运行 `node scripts/sync-marketplace.mjs`，根据各 `SKILL.md` 头信息重新生成 `.claude-plugin/marketplace.json`
   （已有条目的 category / keywords 等手动字段会保留）；`node scripts/sync-marketplace.mjs --check` 可检查是否已同步。

安装脚本和 INSTALL_FOR_AGENTS.md 都会自动发现新文件夹，不用改。

## 许可证与致谢

**本仓库的改编部分**（Windows / 中文 / 低配适配、安装脚本、文档）使用 **MIT** 许可证，见 [`LICENSE`](LICENSE)。
上游代码保持各自的许可证。每个技能文件夹都保留了上游的 LICENSE 文件，并在 `NOTICE.md` 里逐项列出文件来源：

| 来源 | 用在哪里 | 许可证 |
|---|---|---|
| [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | painted-mv、painted-story 的引擎 `template/` | MIT（`skills/painted-mv/template/LICENSE`，painted-story 里有同一份） |
| [tuzhechen2005/opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) | painted-mv / painted-story 的技能结构、卡拉 OK、示例、`beat_grid.py` | MIT（仓库根目录有 LICENSE 文件；副本在 `skills/painted-mv/LICENSE`） |
| [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | painted-mv / painted-story 的 `analyze_audio.mjs`、`lyrics_to_ly.mjs`、`align_lyrics.py`，以及对时、分镜方法 | MIT（`skills/painted-mv/LICENSE.paint-mv-skills`） |
| [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（Giacomo Magnanini），由 [Dakota1-1/super-motion-graphics](https://github.com/Dakota1-1/super-motion-graphics) 打包成技能 | kinetic-lyric-mv 的引擎、场景、分析工具、文档 | MIT（`skills/kinetic-lyric-mv/LICENSE`） |
| 字体 Ma Shan Zheng、Shantell Sans、Noto Sans SC（子集化）、Archivo、Cormorant Garamond、IBM Plex Mono | 各技能的 `fonts/` | SIL OFL 1.1（随附 OFL 文本） |
| 字体 Permanent Marker | painted-mv、painted-story | Apache-2.0（随附） |
| [rany2/edge-tts](https://github.com/rany2/edge-tts) | painted-story 的 AI 配音（建项目时由 uv 按需安装，不随仓库分发；语音来自微软 Edge 在线服务） | LGPL-3.0 |
| Hershey / EMS 笔画字体（`template/app/public/fonts/stroke/*.svg`） | kinetic-lyric-mv | 授权写在每个 SVG 文件头里：EMS 字体（Sheldon B. Michaels）是 SIL OFL；Hershey 字体按其分发条款，任何人可用于任何用途（包括商用），条款文本也在文件头里 |

- **不包含** [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) 的任何代码（该仓库没有声明许可证）。paint-mv-skills 里用来下载并给 PDoomVideo 打补丁的 `fetch_upstream.mjs` / `template.patch` 特意没有带上；painted-mv 的引擎用的是同一作者以 MIT 发布的 ClaudeAnimationBase。
- P(doom) 等示例歌曲和歌词不包含在本仓库内，也不在 MIT 许可范围内。用这些技能制作视频时，歌曲、歌词、背景音乐和录音的版权由使用者自行负责。
- npm 依赖（p5.js、p5.brush、three.js、puppeteer-core、playwright-core 等）在建项目时安装，遵循各自的许可证。

感谢以上各位作者的开源工作。
