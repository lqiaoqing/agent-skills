---
name: painted-mv
description: Make hand-painted watercolour-and-ink music videos and cartoons (MP4) with code, PDoomVideo style - p5.js + p5.brush painted frame by frame in headless Chrome/Edge, encoded with ffmpeg - from a song and its (Chinese) lyrics. Covers the song-driven MV workflow (beat grid, faster-whisper lyric alignment, storyboard from the lyrics, per-chapter painting, contact-sheet review, render) and short non-music cartoons. Bundled CJK brush font for karaoke; Windows-friendly. Use when the user asks for a painted / watercolour / 水彩 / 手绘 animation, cartoon, MV, lyric video, 歌词视频, 动画 MV, or mentions PDoomVideo, ClaudeAnimationBase or p5.brush videos.
---

# painted-mv（水彩手绘动画 MV）

Every frame is a pure function of time `t`: `studio.html` loads p5.js + p5.brush and your scene files, each shot paints
the whole 1920×1080 frame with watercolour fills and boiling ink lines, `render.mjs` drives headless Chrome (or Edge)
for contact sheets or every frame, and ffmpeg encodes the MP4 with the song.

Sources (all MIT; see `NOTICE.md`): the engine/kit is **JohnHeibel/ClaudeAnimationBase** (`template/`, via
**tuzhechen2005/opus-video-skills** `painted-animation`, which also contributes the karaoke, guide edits, the xiaozhen
example and `beat_grid.py`); the song→MV pipeline ideas and `analyze_audio.mjs`, `lyrics_to_ly.mjs`,
`align_lyrics.py` come from **lintsinghua/paint-mv-skills**. No code from JohnHeibel/PDoomVideo (unlicensed) is included
or downloaded.

`$SKILL` = this folder (`~/.claude/skills/painted-mv`, `~/.codex/skills/painted-mv`, on Windows
`%USERPROFILE%\.claude\skills\painted-mv`). `<P>` = the project folder. Requirements: Node ≥ 18, ffmpeg, Chrome or Edge,
(optional) uv for lyric alignment, Python 3 + numpy for `beat_grid.py`. Fonts are bundled locally (no Google Fonts CDN).

## Workflow（照这个清单推进）

```
- [ ] 0 素材：歌曲音频 + 歌词（最好是带时间轴的 LRC/SRT；只有纯文本就先对齐）
- [ ] 1 建项目：new_project.mjs（模板、节拍网格、歌词 → src/lyrics.js、npm install、环境检查）
- [ ] 2 对时确认：联系表 + 一段带声音的对拍短片
- [ ] 3 分镜：STORYBOARD.md（构思、角色、每章场景与调色、每句歌词一个镜头、转场），给用户过目
- [ ] 4 角色与共享场景：模型表（LOOPS）渲染检查
- [ ] 5 逐章作画：一章一个 src/scenes/cNN_name.js，每个镜头都出联系表自查（长片可并行子代理，一章一个）
- [ ] 6 统稿：检查章节交界、卡拉 OK 遮挡、性能（最慢帧）
- [ ] 7 出片：--frames 并行可续渲 → --encode 合成 MP4 → 抽帧验收
```

### 0–1 · Scaffold

```bash
# plain-text lyrics only? align them first (faster-whisper; model downloads on first use — in China set HF_ENDPOINT=https://hf-mirror.com)
uv run --python 3.12 --with faster-whisper --with zhconv python $SKILL/scripts/align_lyrics.py song.mp3 lyrics.txt --out lyrics.srt --lang zh --words words.json

node $SKILL/scripts/new_project.mjs <P> --audio=song.mp3 --lyrics=lyrics.srt --title="歌名"   # or .lrc/.vtt/.tsv/.json
cd <P> && node render.mjs --gpu                                   # which GPU WebGL landed on (must not be SwiftShader)
```

`new_project.mjs` copies `template/`, unhooks the demo scene (`--keep-demo` keeps it), copies the song to `assets/`,
measures BPM / first beat / drift / per-bar loudness (`assets/analysis.json`, printed report) into `src/config.js`,
converts lyrics into `src/lyrics.js` (`LY = [[start, end, "text"], …]`, warnings printed), runs `npm install` and checks
node / ffmpeg / Chrome. No song yet? `node $SKILL/scripts/new_project.mjs <P> --duration=11 --bpm=120`.
Then **read `<P>/ANIMATION_GUIDE.md` in full** (rules, principles, complete engine + Clawd API), and look at
`docs/emotions.jpg`, `docs/views.jpg`. For anything longer than ~20 s also read `references/music-video.md`;
for timing details `references/timing.md`; for the storyboard method `references/storyboard.md`.

Read the analysis report: a tempo marked `AMBIGUOUS`, `grid drift`, overlapping / too short / too wide lyric lines
must be fixed or noted. Cross-check the tempo with `python $SKILL/scripts/beat_grid.py song.mp3 --lrc=song.lrc`.
For a ballad set `bpm` in `src/config.js` to the half-time pulse.

### 2 · Timing check

`node render.mjs --sheet=<times of a few lines> --out=out/check/timing.jpg`, then a short clip with sound:
`node render.mjs --clip=<chorus start>:<+10> --fps=12 --out=out/check/timing.mp4`. The karaoke must sit on the
right line. Shift all lyrics with `node $SKILL/scripts/lyrics_to_ly.mjs assets/lyrics.srt --shift=-0.15 --out=src/lyrics.js`.
**Lock timing before painting**: changing bpm/offset/lyrics later moves every hit.

### 3 · Storyboard before code

Write `<P>/STORYBOARD.md` (format: `references/storyboard.md`; worked example: `examples/xiaozhen/`): song info,
one idea for the whole video taken from the lyrics with an ending that rhymes with the opening, a small cast from who
and what the lyrics sing about, one set + palette per chapter (= song section), a shot table per chapter
(`| 时间 | 歌词 | 镜头 | 出 |`, one shot per lyric line, 1.4–4 s, every shot has an event), and motivated transitions.
Show it to the user and let them react before building, unless they said to just go ahead.

### 4–5 · Build shot by shot

- Shared characters / recurring sets go in their own files loaded before the chapters (e.g. `src/characters.js`,
  `src/sets.js`, add `<script>` tags in `studio.html`) with a model-sheet loop (`LOOPS.cast = t => {…}; LOOPS.cast.len = 6;`):
  `node render.mjs --loop=cast --sheet=0.3,1.3,2.3,3.3 --cols=4 --out=out/check/cast.jpg`.
- One IIFE-wrapped file per chapter in `src/scenes/` ending with `shots([[t0, fn], …])`; add its `<script>` to
  `studio.html` in time order. Write the chapter's beat times at the top: `const B = n => OFF + n * BEAT;`.
- Block key poses first as stills, then the motion between them. Keep key action above y ≈ 960 while a karaoke line shows.
- Long video + subagents (Claude Code Task tool / Codex sub-agents): write the storyboard, shared files and one finished
  chapter yourself, then brief one subagent per chapter ("read ANIMATION_GUIDE.md, STORYBOARD.md §N; only edit
  src/scenes/cNN_x.js; pure functions of t; render contact sheets to out/check/cNN_*; slowest frame ≤ 4 s").

### 6 · Render and look — every shot, several times

```bash
node render.mjs --sheet=0.1,0.8,1.6,2.4 --cols=4 --w=480 --out=out/check/a.jpg        # key frames
node render.mjs --strip=2.1:2.6 --out=out/check/strip.jpg                             # every frame of a moment
node render.mjs --sheet=2.3 --crop=760,420,500,400 --w=500 --out=out/check/face.jpg   # full-res detail
```

Open each image (Read tool / image viewer) and check it against the guide's review list: event clear? character big
enough? reads timed for a first-time viewer? anticipation / follow-through? transitions at every seam? karaoke not
covering faces? no stray text, no 3D, no pure black/white? Fix and look again.

### 7 · Render the video

```bash
node render.mjs --clip --out=out/video.mp4                                        # short videos, one worker
node render.mjs --frames --workers=4 && node render.mjs --encode --out=out/mv.mp4  # long ones: parallel + resumable (PROJECT.audio is muxed)
```

Draft speed-ups: `--fps=12` (the linework boils at 12 fps anyway), `--range=a:b`, `--size=1280x720` (smaller MP4; the
page still paints 1920×1080). Report output path, length, ms/frame; check with `ffprobe` and a final contact sheet.

## Rules that matter most (the guide is authoritative)

1. **Handmade medium.** Only `paint()` / `inkLine()` (p5.brush), never plain p5 shapes. Flat 2D; turns via drawn key
   views. Light via `glow()`.
2. **No text** except the karaoke line and at most a few big SFX. Show, don't caption.
3. **Something happens in every shot**; **time for the viewer** (one read at a time; reads set shot length).
4. **Alive**: idles, drifting cameras, boil; faces change through `emotions()`; characters big; everything on the beat.
5. **Transitions at every seam**; **one piece** (one world, colour arc, ending rhymes with the opening).
6. **Content comes from the lyrics** — new idea, cast, sets for every song; Clawd is only a default star.

## Engine gotchas

- Pure functions of `t`: no state across frames, no `Math.random()`; `hash(i)`, `jit()`; `boilSeed(key)` before each
  separate element. Don't name globals after p5's (`line`, `text`, `color`, `scale`…). Guard NaN geometry.
- Cost = number of fills/strokes; aim ≤ ~1.5–2.5 s/frame (log prints ms/frame).
- Karaoke: `src/karaoke.js` draws `LY` from `src/lyrics.js` in the bundled **Ma Shan Zheng** brush font (OFL), falling
  back to KaiTi / Microsoft YaHei. Per-line opts: `{ sing, hold, pun: { from, to, at } }`. SFX letters
  (`core.js` letters) fall back to Ma Shan Zheng for Chinese.

## Windows notes (this fork)

- Chrome is found in Program Files or `%LOCALAPPDATA%`, then Edge; or `--chrome=<path>` / `CHROME_PATH`.
  ffmpeg from PATH, `--ffmpeg=<path>` or `FFMPEG`. Install without admin: `winget install Gyan.FFmpeg --scope user`.
- WebGL backend: ANGLE D3D11 + `--enable-gpu` by default (Intel Arc / Iris Xe OK). Problems → `--angle=d3d11on12`,
  `--angle=gl`; last resort `--soft-gl` (very slow). Plug in the charger: iGPUs throttle on battery.
- Integrated GPU: use `--workers=2..4` (more workers do not help once the GPU is saturated) and draft at `--fps=12`.
- Behind a proxy: `$env:HTTPS_PROXY="http://127.0.0.1:7897"` before `npm install` / `uv run`.
