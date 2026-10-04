# painted-mv — attribution and licences

| Part | Source | Licence |
|---|---|---|
| `template/` (engine: `core.js`, `clawd.js`, `timeline.js`, `sheets.js`, `render.mjs`, `studio.html`, `gpu_probe.mjs`, `ANIMATION_GUIDE.md`, `docs/`) | [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | MIT, © 2026 John Heibel — `template/LICENSE` |
| skill packaging, `template/src/karaoke.js`, guide edits, `references/music-video.md`, `examples/xiaozhen/`, `scripts/beat_grid.py`, `docs/` sheets | [tuzhechen2005/opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) `skills/painted-animation` | MIT, © 2026 tuzhechen2005 — `LICENSE` |
| `scripts/analyze_audio.mjs`, `scripts/lyrics_to_ly.mjs`, `scripts/align_lyrics.py` (verbatim), `references/timing.md` (adapted), `references/storyboard.md` + workflow (method, rewritten) | [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | MIT, © 2026 lintsinghua — `LICENSE.paint-mv-skills` |
| `template/fonts/MaShanZheng-Regular.ttf`, `ShantellSans[…].ttf` | Google Fonts | SIL OFL 1.1 — `template/fonts/OFL-*.txt` |
| `template/fonts/PermanentMarker-Regular.ttf` | Google Fonts | Apache 2.0 — `template/fonts/LICENSE-PermanentMarker-Apache2.txt` |
| p5.js / p5.brush / puppeteer-core | npm (installed per project, not vendored) | LGPL-2.1 / MIT / Apache-2.0 |
| Windows / CJK adaptation (`scripts/new_project.mjs`, `render.mjs` + `studio.html` + `karaoke.js` + `core.js` edits, `src/lyrics.js`, `src/config.js`, `SKILL.md`) | agent-skills (lqiaoqing) | MIT |

**Not included:** nothing from [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) (no licence = all
rights reserved). paint-mv-skills' `fetch_upstream.mjs` / `template.patch`, which download and patch PDoomVideo, were
deliberately left out; the painted engine here is ClaudeAnimationBase (MIT), which John Heibel published as the
generalised kit of the same approach. Songs/lyrics used in videos are the user's responsibility.
