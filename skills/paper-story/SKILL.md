---
name: paper-story
description: Create paper-cut, layered pop-up storybook animations and music videos as MP4 with a deterministic Canvas 2D engine, articulated characters, paper shadows, parallax, animated typography and motivated transitions. Use for 纸艺动画, 剪纸动画, 立体绘本, paper-craft story videos, or paper-cut MVs from a theme, script, narration or song. Audio is optional. Do not use for watercolour painting, raster image generation, or a typography-only WebGL MV.
---

# Paper Story

把故事做成有角色表演、空间层次和镜头节奏的纸艺动画，交付 MP4 与可复现项目。使用随包的 Canvas 2D 引擎、Playwright 和 FFmpeg；不需要 Canva 订阅。首次安装依赖需要网络，安装后无音频/字幕动画可离线制作；在线 TTS 单独依赖服务可用性。

## 输入与工作选择

- 只有主题：写一个适合目标时长的短故事，再拆分镜。已有脚本：保留情节与文字意图。
- 没有音频：默认 `subs`，按阅读和动作节奏排时间；明确纯画面时用 `silent`。
- 想要 AI 旁白：用 `tts`，先按句合成、测实际长度，再确定镜头时间。不能把字幕估时当配音时长。
- 提供录音：`voice`；提供歌曲和歌词：`music`。音频必须有明确时间戳，现成 SRT/LRC 或对齐工具的结果可整理进 `story.json`。本包不内置自动 Whisper 对齐。
- 用户要求口型、精细舞蹈或高精度真人动作时，说明当前角色是关节纸偶，按实际需要扩展姿态；不要承诺自动完成这些动作。

从现有上下文获取主题、长度、语言、音频意图和用途。只询问会明显改变作品或造成返工的缺失信息，普通可逆细节自行决定。沿用已经授权的范围，先做可审查样片；不要在每个阶段重复索要许可。

## 建项目

使用新的目标目录，避免覆盖已有文件。`<skill>` 为本 Skill 的绝对路径：

```powershell
node "<skill>/scripts/new_project.mjs" "<project>" --pack fantasy --install
```

基础引擎不需要 `--pack`。`fantasy` 加入可选人类、马、龙、城堡及 RPG 道具；新题材可以写自己的角色和环境。完整可运行的教学示例：

```powershell
node "<skill>/scripts/new_project.mjs" "<example-project>" --example postal --install
```

`postal` 是《星星的回信》32 秒字幕样片，展示新故事如何使用继承的纸艺能力。它供研究和冒烟测试；用户要求新故事时，必须创作对应场景，不能只改标题交付示例。

进入项目后：

```powershell
npm run doctor
npm run timeline
npm run preview
```

预览网址为 `http://127.0.0.1:8765`。使用系统 Chrome 或 Edge；特殊路径设置 `CHROME_PATH`。FFmpeg 默认使用 `ffmpeg-static`，也可设 `FFMPEG_BIN`。安装器将 npm 缓存放在项目 `.cache/npm`。若 npm 明确阻止包的安装脚本，检查后按当前平台要求允许 `esbuild` 和 `ffmpeg-static`，再运行 doctor；不要把安装警告当作成功证据。

## 从故事到画面

1. 先建立脚本和 `STORYBOARD.md`。每个场景写清时间、叙事目的、前/中/后景、主体动作、机位、文字、转场。镜头围绕动作变化安排，避免全片只有同一角色来回漂移。
2. 编辑 `project.json`（标题、调色、角色名）和 `story.json`。运行 timeline，生成 `src/project.js`、`src/timeline.js`、`assets/story.srt`。旁白或音乐确定后再冻结主要时间点。
3. 先实现一个有代表性的完整镜头，检查纸边、投影、人物比例和字幕。需要统一人物时建立 `src/cast.js`，环境共用 `src/world.js`；题材不合适时替换可选素材。
4. 在 `src/scenes/index.js` 导出 shots，使用 `SCENE(id)` 获取时间，不把叙事时刻散落成常量。转场通过镜头重叠实现；前镜头一直画到重叠结束，后镜头先画完整背景再被遮罩揭示。
5. 生成关键帧和转场帧，实际看图，纠正遮挡、留白、动作读不清、错字或转场跳变。只对失败点迭代，不设置固定轮数。
6. 跑必要检查，再出成片。交付时明确是否含音频、分辨率/时长、项目位置及实际验证结果。

## 引擎约定

所有绘制是时间 `T` 的纯函数，逻辑坐标固定 `1920×1080`。`draw(g,T,lt,ctx)` 中禁止 `Math.random()`、系统时间、跨帧积分和累积位置；用稳定的 `hash2/noise1` 及时间表达式。画面必须支持任意拖动、分块和续渲。Canvas 状态用 `save/restore` 管理。

纸艺由路径、错位纸边、右下投影、局部纸纹和多层视差共同构成，不能仅加全屏纹理。优先复用已有绘制 primitives 和 rig；明确姿态、表情、动作预备、落点与停顿。缓冲图层按视觉平面分组，避免为每个小部件创建全屏离屏画布。

用中文字符数组 `[...text]` 做逐字排版；名称来自项目配置，时间来自 `TIMELINE.words`。不要沿用原歌曲的人名、17 个章节、长名字固定字槽或事件号作为新故事契约。

按需要读取参考，避免一次加载全部旧素材文档：

- 时间轴、音频、逐字节奏：`references/story-format.md`
- 绘制与引擎 API、缓冲与调色：`references/engine.md`
- 风格、表演、视觉检查：`references/visual-style.md`
- 揭示/翻页/甩纸转场的准确参数：`references/transitions.md`
- 可选角色与环境的入口及旧 API 的边界：`references/asset-pack.md`

## 验证与出片

```powershell
npm run test
npm run check
npm run render -- --mode sheet --out out/contact-sheet.jpg --width 1280
npm run render -- --mode stills --times 3.45,3.7,3.95,4.01 --out out/transition-frames --width 1280
```

查看联系表和实际 PNG，不能仅依靠无异常通过。`check` 检查源文件、覆盖、边界和抽样绘制；不会自动判断构图、动作是否精彩或同步是否准确。

先用短范围、低分辨率验证镜头与机器负载：

```powershell
npm run render -- --start 0 --end 4 --width 1280 --workers 1 --out out/sample.mp4
```

最终默认 `1920×1080 / 30fps`，H.264 + yuv420p；字幕有且仅有一层。集显或内存紧张先降低 worker 数，保持画面设计。较快动作可用 `--samples 2` 子帧模糊，有需求再用 `--dpr 2` 超采样；这些选项会明显增加出片时间。

```powershell
npm run render -- --out out/story.mp4
npm run build
```

渲染器按 6 秒分块、校验源文件摘要，并在编码后完整解码验证帧数。失败后保留 work 目录，同一输出和参数可续渲；`--keep-work` 保留成功缓存，`--fresh` 强制重算。默认成功后清理本次 work。成片旁有 `.mp4.json` 记录。`build` 生成含字体和音频的单文件 `out/player.html`；它是交互预览，不能代替 MP4。新增外部图片等资源时，需要自行补入单文件构建，否则交付完整项目。

交付 MP4、脚本/分镜、时间轴、可运行源码及相关许可。无音频版本明确写“字幕版”或“无声版”；TTS 失败时保留字幕时间轴并说明具体限制，不宣称已生成旁白。不要对机器渲染耗时或艺术效果作无法验证的保证。
