# agent-skills（私有技能仓库）

给 **Claude Code** 和 **Codex** 用的 Agent Skills。每个技能是 `skills/<名字>/` 下的一个文件夹，里面的 `SKILL.md`
（带 `name` / `description` 头信息）是入口，两种工具通用。

| 技能 | 做什么 | 基于 |
|---|---|---|
| [`painted-mv`](skills/painted-mv/) | 水彩手绘风动画 / 歌词 MV（PDoomVideo 风格）：p5.js + p5.brush 逐帧画，headless Chrome 渲染，ffmpeg 合成；歌曲驱动流程（测节拍、faster-whisper 对齐歌词、分镜、逐章作画、联系表检查、出片），中文毛笔字卡拉 OK | tuzhechen2005/opus-video-skills `painted-animation`（内含 JohnHeibel/ClaudeAnimationBase）+ lintsinghua/paint-mv-skills 的流程与脚本，均为 MIT |
| [`kinetic-lyric-mv`](skills/kinetic-lyric-mv/) | three.js 卡点动态歌词 MV（mexicat/pdoom-video 风格）：着色器、刻线、逐字砸字、辉光、颗粒、子帧运动模糊，和节拍/歌词逐字同步；中文逐字排版、思源黑体（Noto Sans SC），Windows + 核显低配预设 | Dakota1-1/super-motion-graphics（MIT，移植自 mexicat/pdoom-video，MIT） |

## 安装

### Windows（推荐：克隆 + 目录联接，`git pull` 即更新）

```powershell
cd D:\QWorkspace\Projects
git clone https://github.com/lqiaoqing/agent-skills.git
cd agent-skills
powershell -ExecutionPolicy Bypass -File .\install.ps1          # 在 ~/.claude/skills 和 ~/.codex/skills 下建联接（不需要管理员）
# 不想用联接：加 -Copy；只装一个：-Only painted-mv
```

装好后的位置：

- Claude Code：`C:\Users\<你>\.claude\skills\painted-mv\`、`...\kinetic-lyric-mv\`
- Codex：`C:\Users\<你>\.codex\skills\painted-mv\`、`...\kinetic-lyric-mv\`

重启 Claude Code / Codex 后，直接说“用 painted-mv 给这首歌做个水彩 MV”或“做一个动态歌词卡点视频”即可触发。

### macOS / Linux

```bash
git clone https://github.com/lqiaoqing/agent-skills.git && cd agent-skills && ./install.sh   # 软链接；--copy 为复制
```

## 依赖（Windows 免管理员装法）

| 依赖 | 用途 | 安装 |
|---|---|---|
| Node.js ≥ 22.6 | 两个技能的渲染器 | 官方安装包或已有的 node |
| ffmpeg | 编码 MP4 | `winget install Gyan.FFmpeg --scope user` |
| Chrome 或 Edge | headless 渲染（WebGL 走 ANGLE/D3D11，Intel 核显可用） | 系统自带 Edge 即可 |
| bun | kinetic-lyric-mv 安装依赖 / 预览 | `winget install Oven-sh.Bun --scope user` |
| uv | 音乐分析（librosa）、歌词对齐（faster-whisper） | `winget install astral-sh.uv --scope user` 或 `pip install uv` |

走代理时先 `$env:HTTPS_PROXY="http://127.0.0.1:7897"`（npm / bun / uv / whisper 模型下载都认）。whisper 模型也可以用
`$env:HF_ENDPOINT="https://hf-mirror.com"`。

## 核显（Intel Arc / Iris）建议

- kinetic-lyric-mv 默认 `--profile low`（1280×720、30 fps、2 个子帧），成片用 `--profile mid`（1080p30）；`high` 是上游的 1080p60 + 自适应运动模糊（独显再用）。
- painted-mv 草稿用 `--fps=12`，`--frames --workers=2..4` 并行可续渲。
- 插上电源再渲染；`node render.mjs --gpu`（painted）/ `node scripts/render.ts gpu`（kinetic）应显示 Intel 显卡而不是 SwiftShader。

## 许可证

- 本仓库的改编部分：MIT（`LICENSE`）。
- 每个技能文件夹保留上游 LICENSE，并在 `NOTICE.md` 写明哪些文件来自哪里：
  - painted-mv：ClaudeAnimationBase（MIT，`template/LICENSE`）、opus-video-skills（MIT，`LICENSE`）、paint-mv-skills（MIT，`LICENSE.paint-mv-skills`）；字体 Ma Shan Zheng / Shantell Sans（OFL）、Permanent Marker（Apache-2.0）。
  - kinetic-lyric-mv：pdoom-video / super-motion-graphics（MIT，`LICENSE`）；字体 Archivo 等（OFL）、Noto Sans SC（OFL，已子集化为 GBK 字符集）。
- **未包含** JohnHeibel/PDoomVideo 的任何代码（该仓库没有许可证）；paint-mv-skills 里下载并打补丁 PDoomVideo 的 `fetch_upstream.mjs` / `template.patch` 也特意没有带上。
- 歌曲、歌词等素材版权由使用者自行负责。

## 测试记录（2026-10-04，Redmi Book Pro 14 2024 · Intel Ultra 5 125H · Arc 核显 · Windows 11）

10 秒测试片段，合成的 120 BPM 节拍音频 + 4 句中文歌词：

| 技能 | 设置 | 渲染耗时 |
|---|---|---|
| painted-mv | 1920×1080、24 fps、`--frames --workers=4` + `--encode` | 约 227 s 出帧（约 0.94 s/帧）+ 7 s 编码 |
| kinetic-lyric-mv | `--profile low`（1280×720、30 fps、2 个子帧） | 25 s |
| kinetic-lyric-mv | `--profile mid`（1920×1080、30 fps、12 个子帧） | 160 s |

WebGL 跑在 `ANGLE (Intel(R) Arc(TM) Graphics, Direct3D11)` 上，不是软件渲染。
