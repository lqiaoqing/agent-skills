---
name: kinetic-lyric-mv
description: Beat-synced kinetic-typography lyric music videos (MP4) rendered from code with a real three.js/WebGL engine (mexicat/pdoom-video style) - shaders, engraved line fields, per-word / per-character type slams, bloom, grain, sub-frame motion blur - synced to a song's beats, downbeats, hits and word-level lyric timings. Adapted for Chinese lyrics (bundled Noto Sans SC, per-character timing and layout) and Windows laptops with integrated GPUs (ANGLE D3D11, 720p low-spec default profile, no shell scripts). Use when the user wants a kinetic lyric video, 动态歌词 / 歌词卡点视频, beat-synced motion graphics, a "P(doom) style" or "super motion graphics" MV, title sequence or launch film rendered from code.
---

# kinetic-lyric-mv（动态歌词 MV · three.js 卡点）

> Fork of **Dakota1-1/super-motion-graphics** (MIT), itself a port of the engine and method of
> **mexicat/pdoom-video** by Giacomo Magnanini (MIT, see `LICENSE`). Adapted in `agent-skills` for Chinese lyrics,
> Windows and low-spec GPUs: see "What this fork changed" at the end. Works from Claude Code and Codex alike:
> `$SKILL` below is this folder (e.g. `~/.claude/skills/kinetic-lyric-mv` or `~/.codex/skills/kinetic-lyric-mv`;
> on Windows `%USERPROFILE%\.claude\skills\kinetic-lyric-mv`).

## Quick start (Chinese lyric MV on a laptop)

```bash
python $SKILL/scripts/new_project.py ./mv --title "歌名" --audio song.mp3 --lyrics song.lrc   # timed LRC → per-character words
#   or: --words lyrics.txt --lang zh   (plain text, aligned by faster-whisper; first run downloads a model)
cd mv/app
node scripts/render.ts gpu                                   # must print your GPU (e.g. "ANGLE (Intel, Intel(R) Arc(TM) Graphics ... Direct3D11 ...)")
node scripts/render.ts stills --t 2,5,8 --out ../out/stills  # look at them (Read the PNGs)
node scripts/render.ts video --out ../out/draft.mp4          # --profile low (default): 1280x720, 30 fps, 2 sub-frames
node scripts/render.ts video --profile mid --out ../out/final.mp4   # 1920x1080 30 fps, adaptive blur up to 12 sub-frames
```

With lyrics present, the starter timeline is a single `lyric-cjk` scene (characters slam in on their own word times).
Replace it with real plates after writing the treatment (below). On Windows run commands in PowerShell; `python`
may be `py` or a full path; always use **node** (not bun) for `scripts/render.ts`.

## Chinese lyrics (中文歌词)

- **Fonts:** `F.cjk(400|900)` = bundled Noto Sans SC (OFL, GBK repertoire ≈ 22k chars, simplified + traditional).
  Every Latin family (`F.archivo()`, `F.mono()`, `F.serif()`) automatically falls back to the CJK face of matching
  weight, then to Microsoft YaHei / PingFang, so mixed lines never show tofu. `textPath2D()` outlines CJK too.
- **Timing:** one CJK character = one `word` in `lyrics.json`. `analysis/lyrics_tool.py` (LRC / TSV, no ML,
  standard library only) spreads each line over its characters; `analysis/words.py --lang zh` aligns plain text with
  faster-whisper character by character (traditional/simplified tolerant with zhconv). In mainland China set
  `HF_ENDPOINT=https://hf-mirror.com` or `HTTPS_PROXY` before the first whisper run.
- **Layout:** per-character cells (`isCJK()`, `measure()` per cell), no word spaces, wrap by character count
  (~8–10 per row at 1080p display sizes). Line-level text APIs: `Lyrics.find('爱')`, `findWords('爱')` work on CJK.
- **Typography rules for Chinese:** no faux-italic/condensing on hanzi (Archivo width animation only applies to Latin);
  emphasise with weight (400→900), scale, colour (signal), or position instead; keep ≥ 0.08 em between slammed
  characters; punctuation (，。！？) is dropped from timing and should usually not be shown big.

## Windows / low-spec notes

- Deps: Node ≥ 22.6, bun (install/preview only), ffmpeg, Chrome **or** Edge, uv (analysis only). No symlinks, no
  `.sh`: everything is node/python. If ffmpeg is not on PATH set `FFMPEG=C:\path\ffmpeg.exe`; pick a browser with
  `CHROME_PATH` or `--browser msedge`.
- GPU: default ANGLE D3D11 + `--enable-gpu` (works on Intel Arc/Iris Xe). If `gpu` prints SwiftShader or frames come
  out black, try `--angle d3d11on12` or `--angle gl`; plug in the charger (Windows throttles the iGPU on battery).
- Cost scales with pixels × sub-frames. Integrated GPUs: draft with `--profile low`, final with `--profile mid`;
  only use `--profile high` / `--samples auto` up to 324 / `--scale 2` on a discrete GPU. Use `perf` to measure ms/frame.
- Behind a proxy: `$env:HTTPS_PROXY="http://127.0.0.1:7890"` (your proxy port) before `bun install` / `uv run` / whisper downloads.
- `python` on a fresh Windows is often the Microsoft Store stub: run the scaffold as
  `uv run --python 3.12 python $SKILL/scripts/new_project.py …` (or `py`). A winget bun has no `bunx`: use `bun x vite`.
- Tempo: librosa can lock onto a relative of the real tempo (a 165 BPM drum'n'bass mix came out as 110). Compare with
  the song's stated BPM; rerun `analysis/analyze_music.py <track> --bpm 165` (or `new_project.py --audio … --bpm 165`).
- Sung lyrics: `words.py` prints `matched N/M known words`; below half, the timings are guesses (try `--model medium`
  or a dry vocal stem). It now keeps whisper's VAD off for singing (`--vad` only for clean voiceovers).

## Upstream guide (super-motion-graphics)

Everything below is the upstream skill, still valid (read `bun scripts/render.ts …` as `node scripts/render.ts …`).


# super motion graphics

A web app renders any time `t` of the video as a pure function of `t`: the same code drives a live
preview and an offline 1080p60 / 4K60 export through headless Chrome and ffmpeg. The look comes from
the engine (film post, motion blur, line/hatch/type toolkits). The results come from the method: a
written treatment first, one tight palette and type system, a recurring motif, scenes built and checked
one plate at a time, and many review rounds.

Credit: the engine, docs and example scenes come from *I'm Upping My P(doom)* by Giacomo Magnanini, made
with Claude (Opus 5.5) in Claude Code: github.com/mexicat/pdoom-video, MIT (see `LICENSE`). Its song and
lyrics are not included and not covered by that licence.

`$SKILL` below is this folder.

- `template/app/`: the engine (`src/engine/`), three starter scenes, `src/timeline.ts`, `scripts/render.ts`, fonts (OFL).
- `template/analysis/`: `analyze_music.py`, `beatgrid.py`, `words.py` (uv / Python).
- `reference/ENGINE.md`: the scene API and toolbox. Read it before writing a scene.
- `reference/TREATMENT-TEMPLATE.md`: the style bible you fill in first.
- `reference/workflow.md`: lead + scene agents, review loop, render.
- `reference/agent-brief.md`: the prompt for scene agents.
- `examples/pdoom/`: the reference project's `TREATMENT.md`, all 17 scene modules, its timeline and analysis. This is the quality bar. Read the treatment and 2–3 scenes before designing.

## Requirements

bun (install and preview), Node ≥ 22.6 (the offline renderer runs under Node: Playwright hangs under Bun
on Windows), Google Chrome (or `CHROME_PATH`), ffmpeg with libx264, uv (analysis only), and a GPU. Check the
GPU with `node scripts/render.ts gpu`: it must name your GPU, not SwiftShader.

## 1. Brief (one round of AskUserQuestion; skip anything already answered)

- **What it's for**: product, song, message. What must a stranger understand after one watch?
- **Sound**: a music track (best: everything syncs to it), a voiceover, both, or silent (fixed BPM grid).
- **Words**: lyrics or a script to sync per word? Get the text.
- **Length**: 15 s–3 min. Longer means more plates and much longer renders.
- **Look**: brand colours/fonts, or ask for a direction. Offer 2–3 concept pitches if they have none.
- Format is 16:9 (1920×1080, 4K with `--scale 2`). Vertical needs engine changes (W/H in `gl.ts`, `render.ts`, `index.html`): say so.

## 2. Scaffold

```bash
python $SKILL/scripts/new_project.py ./video --title "…" --audio path/to/track.mp3   # or --bpm 120 --duration 30 (silent)
```

This creates `video/{app,analysis,docs,out}`, runs `bun install`, and writes `app/public/data/audio.json`.
Add word timings with `cd video/analysis && uv run --extra words python words.py <audio> --text lines.txt`.
Check the beat grid: run the preview (`cd video/app && bun x vite`), play it and watch the beat counter
against the music. Add `--plot` to `analyze_music.py` for a QA chart.

## 3. Treatment (the step that makes it good)

Write `video/docs/TREATMENT.md` from the template before any scene code:
- **The concept:** one idea that frames the whole piece.
- **A through-line motif** that transforms scene to scene.
- **The tone and a project-specific "not slop" list.**
- **Palette and type rules.**
- **Sync rules.**
- **A plate table** with a shot-by-shot paragraph per plate: what is on screen, what lands on which beat or word, the joke, and the hand-off into the next plate.

Every scene should be a specific visual idea about its content (a pun, a transformation, an instrument or
idiom of its own), never a generic animation. Study `examples/pdoom/TREATMENT.md` for the level of detail.
**Show the treatment to the user and get approval or notes before building.**

## 4. Build

Follow `reference/workflow.md`:
- **The lead** sets the palette (`src/engine/palette.ts`), fonts, shared motifs (`src/scenes/_motifs.ts`) and the edit (`src/timeline.ts`, windows anchored to beats and words).
- **Scenes:** with more than about 3 plates, launch parallel scene agents (Agent tool, `general-purpose`), each owning plates, briefed with `reference/agent-brief.md`. Each agent renders stills and contact sheets of its own work and looks at them before reporting.
- **Integration:** the lead merges the scenes and checks every cut with `sheet --cuts`.

## 5. Review, revise, render

Show the user drafts: stills, sheets and a fast clip (`video --samples 4 --preset veryfast`). Log every note
as a Revision entry in the treatment and fix the plates it touches. Repeat; the reference went through five
rounds. Final:

```bash
cd video/app && node scripts/render.ts video --samples auto --shutter 0.2 --out ../out/final.mp4   # add --scale 2 for 4K
```

This is slow by design: every sub-frame re-renders every layer, so expect ~1–3 s per 1080p frame on a
laptop GPU. Run it in the background. Split long pieces with `--from/--to` and concatenate losslessly
(`ffmpeg -f concat -c copy`). Deliver the MP4, a poster still (`stills --t <best>`) and the treatment.

## Rules that keep it working

- **Deterministic:** output depends only on `f.t` (seeded `hash`/`mulberry32`, never `Math.random`/`Date.now`). Per-frame jitter uses `frameIdx(t)`.
- Cut on beats and words from the data; never hard-code seconds inside scenes.
- Colours are linear HDR; only the signal colour blooms. Keep bone type crisp.
- Look at every still you render (Read the PNG). Math that "should" look right often doesn't.


## What this fork changed (kinetic-lyric-mv vs super-motion-graphics)

- `template/app/public/fonts/NotoSansSC-{400,900}.ttf` (+ `OFL-NotoSansSC.txt`); `src/engine/type.ts`: CJK registry,
  `F.cjk()`, `isCJK()`, `hasCJK()`, CJK fallback in `font()`, CJK outlines in `textPathCommands()`.
- `src/engine/lyrics.ts`: Unicode-aware `norm()`; `lineCharProgress()` counts code points and no phantom spaces.
- `src/scenes/lyric-cjk.ts`: new starter scene (per-character kinetic lyrics); `src/timeline.ts` uses it when lyrics exist.
- `analysis/words.py`: CJK tokenisation, chunk splitting, `--lang`; new `analysis/lyrics_tool.py` (LRC/TSV → lyrics.json).
  All JSON written as UTF-8 (Windows' default code page would break Chinese). `pyproject.toml`: Python < 3.14 (librosa/numba).
- `src/engine/scale.ts`, `gl.ts`, `engine.ts`, `post.ts`, `glsl/common.ts`: fractional output scale < 1 (720p/540p).
- `scripts/render.ts`: `--profile low|mid|high` (default low), `--angle`, `--browser` with Edge fallback, `FFMPEG` env,
  ffmpeg spawn errors reported. `scripts/new_project.py`: `--lyrics`, `--words`, `--lang`, node-based next steps.
