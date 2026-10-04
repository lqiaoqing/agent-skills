# Reference project: *I'm Upping My P(doom)*

Source: github.com/mexicat/pdoom-video by Giacomo Magnanini (MIT, see the skill's `LICENSE`). Made with
Claude (Opus 5.5) in Claude Code. 4K video: https://www.youtube.com/watch?v=5EoO5413dBY

These files are **reading material and a quality bar**, not part of new projects:
- `TREATMENT.md`: the style bible and plate-by-plate treatment, including its revision notes.
- `scenes/`: all 17 plates (open, loss, prompt, hook, room, shoggoth, spacetime, ascent, bureau, leftturn, paperclips, fuse, stack, dense, loom, ilya, outro) and `_motifs.ts` (the spark, the mask).
- `timeline.ts`: the edit, with cuts anchored to lyric lines and snapped to beats.
- `analysis/`: the original song-specific pipeline (Demucs stems, CTC forced alignment + Whisper, beat/downbeat/onset analysis with a hand-written section map). The template's `analyze_music.py` / `words.py` are generalised, portable versions.
- `ENGINE.original.md`, `README.original.md`: the original docs.

The scenes import `PDoom`/`formatPDoom` from `hud.ts` and read the song's lyrics. To reuse one in a new
project, copy it and replace those with `Readout`/`formatReadout` and your own words.

The song and lyrics are not included and are not covered by the MIT licence (see `README.original.md`, Credits).
