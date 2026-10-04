---
name: painted-story
description: Make hand-painted watercolour-and-ink animated videos (MP4) from a STORY - a script, a story text, or just a theme the agent first writes into a short script - with TTS narration (free edge-tts voices, Chinese and English), subtitles only, or the user's own recorded narration aligned by faster-whisper; optional licence-clean background music with ducking. Same engine as painted-mv (p5.js + p5.brush painted frame by frame in headless Chrome/Edge, ffmpeg): script → timeline → storyboard → per-scene painting → contact-sheet review → render. Also does song + lyrics MVs. Bilingual subtitles, bundled CJK brush font, Windows-friendly. Use when the user asks for a painted / watercolour / 水彩 / 手绘 story animation, 绘本动画, 故事动画, 童话/儿童故事视频, animated picture book, narrated cartoon, 配音动画, or a painted video from a story, script or theme.
---

# painted-story（水彩手绘故事动画）

Same engine and method as `painted-mv` (this skill carries its own copy, so it installs and works on its own): every
frame is a pure function of `t`; `studio.html` loads p5.js + p5.brush and your scene files; each shot paints the whole
1920×1080 frame with watercolour fills and boiling ink lines; `render.mjs` drives headless Chrome/Edge for contact sheets
or every frame; ffmpeg encodes the MP4 with the soundtrack. What this skill adds: a **story script → timeline** step
(`scripts/story_timeline.mjs`) with three audio modes, subtitle/narration display in `karaoke.js`, and narrative storyboard
rules. Sources and licences: `NOTICE.md`.

`$SKILL` = this folder (`~/.claude/skills/painted-story`, `~/.codex/skills/painted-story`, on Windows
`%USERPROFILE%\.claude\skills\painted-story`). `<P>` = the project folder. Requirements: Node ≥ 18, ffmpeg, Chrome or
Edge; **uv** for TTS (edge-tts) and whisper alignment (it installs the Python packages on demand). Windows: `python` may be
the Microsoft Store stub, so always go through `uv run --python 3.12 …` (the scripts already do).

## Input modes

| 用户给的 | 做法 |
|---|---|
| (a) 歌曲 + 歌词 | 走 MV 流程：`new_project.mjs <P> --audio=song.mp3 --lyrics=song.lrc`，其余照 `references/music-video.md`、`timing.md`、`storyboard.md`（与 painted-mv 相同）。 |
| (b) 故事文本 / 剧本 | 改写成 `story.md`（格式见 `references/story-script.md`）：分场、台词短句化（每句 ≤ ~20 个汉字 / 12 个英文词）、标出说话人、写画面说明。改写后给用户过目（尤其删改了原文时）。 |
| (c) 只有主题 / 大纲 | 先写一个短故事脚本：一句话梗概 → 4–6 场（30–60 s 约 8–12 句；按用户要的长度：中文 TTS 约 4–5 字/秒）→ `story.md`。**发给用户确认后再继续。** |

## Step 0 · Ask the user (required, before generating anything)

Ask these in ONE message (use the agent's question tool if there is one, e.g. Claude Code `AskUserQuestion`, Codex
`request_user_input`; otherwise ask in chat and **wait for the answer**). Skip only what the user already answered.

```
做这支水彩故事动画前，确认几件事：
1. 声音方式：
   A) AI 配音 + 字幕（推荐；免费 edge-tts，中文音色如 晓晓 Xiaoxiao（温柔女声）、云希 Yunxi（男声）、晓伊 Xiaoyi（活泼女声）、云夏 Yunxia（童声），英文如 Ana / Jenny / Guy；角色可以各用一个音色）
   B) 只有字幕（可加背景音乐；每句停留时间按阅读速度算，有音乐时卡在节拍上）
   C) 用你自己的录音（发我音频；我用 whisper 自动对齐到脚本，或者你给 SRT/LRC）
2. 背景音乐：不要 / 你提供（请确认可以使用）/ 我找一首 CC BY 或 CC0 的（会在片尾和说明里署名）
3. 字幕：中文 / 中英双语 / 其它语言；整句出现（默认）还是随朗读逐字变色（卡拉 OK）
4. 长度和画幅：约 __ 秒；1080p（慢，出片约每秒画面 15–20 s）还是 720p 草稿
```

Default if the user says "you decide": A (TTS), no BGM unless a licence-clean track is at hand, Chinese subtitles,
subtitle style, ~30–60 s, 1080p. Record the answers at the top of `STORYBOARD.md`.

## Workflow（照这个清单推进）

```
- [ ] 0 问清：输入模式 (a/b/c) + 声音方式 (A/B/C) + BGM + 字幕 + 长度
- [ ] 1 脚本：story.md（(c) 先写故事并确认；(b) 改写并确认）
- [ ] 2 建项目 + 时间轴：new_project.mjs --story（TTS/字幕/录音 → src/config.js、lyrics.js、story.js、soundtrack.wav）
- [ ] 3 听一遍：音轨 + 时间表（报告里每场每句的时间）；不满意改脚本重跑 story_timeline.mjs
- [ ] 4 分镜：STORYBOARD.md（references/narrative.md），给用户过目
- [ ] 5 角色与共享场景：src/cast.js + 模型表（LOOPS.cast）检查
- [ ] 6 逐场作画：一场一个 src/scenes/sNN_name.js，镜头时间用 SCENE()/LINE()，每个镜头出联系表自查
- [ ] 7 出片：--frames 并行可续渲 → --encode → 抽帧 + ffprobe 验收；交付时写明音色/BGM 署名
```

### 1–2 · Script → project

```bash
# A) TTS narration + subtitles (edge-tts needs internet; behind a proxy set HTTPS_PROXY first)
node $SKILL/scripts/new_project.mjs <P> --story=story.md --mode=tts [--bgm=music.mp3 --bgm-db=-18]
# B) subtitles only (reading speed: --cps=4.5 CJK chars/s, --wps=2.6 English words/s, --min=1.8 --max=7 s per line)
node $SKILL/scripts/new_project.mjs <P> --story=story.md --mode=subs [--bgm=music.mp3]
# C) the user's recording: whisper alignment (HF_ENDPOINT=https://hf-mirror.com in China) … or their SRT/LRC
node $SKILL/scripts/new_project.mjs <P> --story=story.md --mode=voice --voice-audio=rec.m4a [--voice-subs=rec.srt]
cd <P> && node render.mjs --gpu
```

Other flags: `--style=subtitle|karaoke|none`, `--voice=zh-CN-YunxiNeural` / `--rate=-10%` (override the script),
`--no-duck`, `--no-cache` (re-synthesise), `--lang=en --model=small` (whisper). List voices:
`uv run --python 3.12 --with edge-tts edge-tts --list-voices`.

After editing the script (or switching mode) re-run only the timeline:
`node $SKILL/scripts/story_timeline.mjs <P> story.md --mode=tts` (TTS lines are cached by text, so only changed lines are
re-synthesised). Read the printed timing report and warnings (too-wide lines, BGM tempo ambiguous, cue-count mismatch
in voice mode). In mode C check that every line got its own cue: lines whisper could not hear are interpolated and
flagged by `align_lyrics.py`; fix with `--voice-subs` or by editing `assets/voice_aligned.srt` and re-running with
`--voice-subs=assets/voice_aligned.srt`.

How each mode times the video:
- **tts**: each line is synthesised (one MP3 per line, `assets/tts/`), leading/trailing silence trimmed, and placed back
  to back: `lead_in` (opening establishing shot) / `scene_lead` (each scene) of silence, the line, `gap` or the line's
  `pause`, `scene_tail` after a scene's last line, `tail` at the end. Subtitles stay up 0.35 s after the speech.
  Word boundaries from edge-tts go into `opts.words` (karaoke style fills along them).
- **subs**: line length = reading time + 0.5 s, clamped to min/max. With `--bgm`: lines start on beats and scenes on bars
  (the BGM's tempo from `analyze_audio.mjs`; `PROJECT.bpm/offset` follow it so idles bounce to the music).
- **voice**: the cues from whisper/SRT give each line's time; scenes start `scene_lead` before their first line.
- BGM (any mode): looped/trimmed to the video, faded in/out, at `bgm_db` (default −18 dB), ducked under the voice with a
  side-chain compressor, limited, written to `assets/soundtrack.wav` (`PROJECT.audio`). **Only licence-clean music**
  (the user's own, CC0, CC BY with attribution); put the credit in the delivery notes / description, and say if it was edited.

Then **read `<P>/ANIMATION_GUIDE.md` in full** (rules, engine + Clawd API) and look at `docs/emotions.jpg`, `docs/views.jpg`.

### 3–4 · Storyboard

Write `<P>/STORYBOARD.md` following `references/narrative.md` (story structure, establishing shots, one shot per line,
speaker on screen, reaction shots, emotion beats, character consistency) with the table format of
`references/storyboard.md`. Times are written as `SCENE(n).t0`, `LINE(n, k).t0` from `src/story.js`; the scene notes
(`>` lines) and `mood` of the script are in `STORY.scenes[i]`. Show it to the user unless they said to just go ahead.

### 5–6 · Build scene by scene

- Characters / recurring sets in `src/cast.js` (+ `<script>` in `studio.html` before the scenes) with a model sheet
  `LOOPS.cast` (`node render.mjs --loop=cast --sheet=0.3,1.3,2.3,3.3 --cols=4 --out=out/check/cast.jpg`).
- One IIFE-wrapped file per scene `src/scenes/sNN_name.js`, ending with `shots([[SCENE(1).t0, establishing],
  [LINE(1, 0).t0 - .2, closeUp], …])`; add the `<script>` tags in order. **Never hard-code seconds**: re-timing the story
  must move the shots. Inside a shot use `lt` (time since the shot started) and `dur`.
- The speaker is on screen when they talk; change their face (`emotions()`) 0.1–0.3 s before the line starts. Spread
  `talk(t, n, k)` (from `src/story.js`) into `clawd()` for a mouth that flaps while LINE(n, k) plays; `speaking(t, n, k)`
  tells you whether it does (for a custom character's mouth).
- Subtitle bar covers y ≈ 975–1070 (two rows with a translation ≈ 930–1080): keep faces and key action above y ≈ 900.
- Long story + subagents: write the script, storyboard, `cast.js` and scene 1 yourself, then one subagent per scene
  ("read ANIMATION_GUIDE.md, STORYBOARD.md §N; only edit src/scenes/sNN_x.js; times from SCENE()/LINE(); contact sheets
  to out/check/sNN_*; slowest frame ≤ 4 s").

### Song MV mode (a)

Same as painted-mv: `node $SKILL/scripts/new_project.mjs <P> --audio=song.mp3 --lyrics=song.lrc --title="歌名"`; plain
lyrics → `uv run --python 3.12 --with faster-whisper --with zhconv python $SKILL/scripts/align_lyrics.py song.mp3 lyrics.txt
--out lyrics.srt --lang zh`; then `references/music-video.md`, `timing.md`, `storyboard.md` (beat grid, one shot per
lyric line, karaoke).

### Review: render and look at every shot, several times

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
2. **No text** except the subtitle / karaoke line and at most a few big SFX. Show, don't caption.
3. **Something happens in every shot**; **time for the viewer** (one read at a time; reads set shot length).
4. **Alive**: idles, drifting cameras, boil; faces change through `emotions()`; characters big; everything on the beat.
5. **Transitions at every seam**; **one piece** (one world, colour arc, ending rhymes with the opening).
6. **Content comes from the story / lyrics**: new idea, cast, sets every time; Clawd is only a default star.

## Engine gotchas

- Pure functions of `t`: no state across frames, no `Math.random()`; `hash(i)`, `jit()`; `boilSeed(key)` before each
  separate element. Don't name globals after p5's (`line`, `text`, `color`, `scale`…). Guard NaN geometry.
- Cost = number of fills/strokes; aim ≤ ~1.5–2.5 s/frame (log prints ms/frame).
- Subtitles / karaoke: `src/karaoke.js` draws `LY` from `src/lyrics.js` (`LY_STYLE.mode`: `subtitle` = whole line, no
  fill; `karaoke` = fill along `opts.sing` or the timed `opts.words`; `none`; `opts.speaker` = name tag) in the bundled **Ma Shan Zheng** brush font (OFL), falling
  back to KaiTi / Microsoft YaHei; lines without CJK (English…) use the bundled Shantell Sans. Per-line opts:
  `{ sing, hold, pun: { from, to, at }, sub }`. **Bilingual karaoke**: `sub` is a smaller translation row under the sung
  line; `lyrics_to_ly.mjs` fills it from an SRT/VTT cue with two text lines (one CJK, one not), from a second LRC line
  with the same timestamp, or from a TSV 4th column. SFX letters
  (`core.js` letters) fall back to Ma Shan Zheng for Chinese.

## Windows notes (this fork)

- Chrome is found in Program Files or `%LOCALAPPDATA%`, then Edge; or `--chrome=<path>` / `CHROME_PATH`.
  ffmpeg from PATH, `--ffmpeg=<path>` or `FFMPEG`. Install without admin: `winget install Gyan.FFmpeg --scope user`.
- WebGL backend: ANGLE D3D11 + `--enable-gpu` by default (Intel Arc / Iris Xe OK). Problems → `--angle=d3d11on12`,
  `--angle=gl`; last resort `--soft-gl` (very slow). Plug in the charger: iGPUs throttle on battery.
- Integrated GPU: use `--workers=2..4` (more workers do not help once the GPU is saturated) and draft at `--fps=12`.
- Behind a proxy: `$env:HTTPS_PROXY="http://127.0.0.1:7890"` (your proxy port) before `npm install` / `uv run`.
