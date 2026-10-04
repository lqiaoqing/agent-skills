# super-motion-graphics: a Claude Code skill

A [Claude Code](https://claude.com/claude-code) skill for **film-grade, code-rendered motion graphics and music
videos**. It uses a real WebGL engine (three.js) with shaders, raymarched 3D, engraving and hatching, GPU line
fields, kerned kinetic type, bloom, halation, grain and adaptive sub-frame motion blur. Everything is synced to
a soundtrack's beats, downbeats, kicks, snares and sections, and optionally to every sung or spoken word. The
same code drives a live preview and an offline 1080p60 / 4K60 export through headless Chrome and ffmpeg.

It packages the **engine and the method** behind the Claude-made music video *I'm Upping My P(doom)*:
- write a treatment first;
- set one tight palette and type system;
- carry a recurring motif through the whole piece;
- build scenes as plates with parallel agents, each checking its own stills;
- go through several review rounds.

## Credit where credit's due

I was scrolling on Instagram and came across an insane visual for an AI song called
**"I'm Upping My P(doom)"**. After researching it, I found it was generated entirely by **Claude Opus 5.5**, so
I dug deeper into how. After finding the creator's YouTube video about it
([watch](https://www.youtube.com/watch?v=5EoO5413dBY)), I found they had put the project in a public repo:
**[github.com/mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)** by **mexicat** (Giacomo Magnanini).

I took that repo and sent it to Claude in my terminal to turn it into this reusable skill. **All of the engine
and the reference project are mexicat's work** (MIT, see [`LICENSE`](LICENSE)). The skill generalises it:
the soundtrack and lyrics are optional, the readout is generic, and it adds a Node-based offline renderer with
per-OS GPU flags, starter scenes, portable analysis tools and docs. Claude wrote those changes.

**Made with it:** [nuts-lyric-video](https://github.com/Dakota1-1/nuts-lyric-video) is a 3D terminal-style
lyric video for Lil Peep's "nuts". I sent Claude only the song MP3 and the lyrics and let Opus 5.5 make
every creative decision, apart from a few revisions.

## Install

```bash
git clone https://github.com/Dakota1-1/super-motion-graphics ~/.claude/skills/super-motion-graphics
```

Then in Claude Code, run `/super-motion-graphics` (or ask for "super motion graphics") and describe the piece.

**Requirements:** bun (install and preview), Node ≥ 22.6 (the offline renderer), Google Chrome (or set
`CHROME_PATH`), ffmpeg with libx264, uv (analysis only) and a GPU. Check that the GPU is picked up with
`node scripts/render.ts gpu`, run inside a project's `app/`.

## What's inside

| path | what |
|---|---|
| `SKILL.md` | the workflow Claude follows: brief → scaffold → treatment → build → review → render |
| `template/app/` | the engine (`src/engine/`), starter scenes, `timeline.ts`, `scripts/render.ts`, fonts (OFL) |
| `template/analysis/` | `analyze_music.py` (beats, downbeats, sections, stems), `beatgrid.py`, `words.py` (word timings) |
| `reference/` | `ENGINE.md` (scene API), `TREATMENT-TEMPLATE.md`, `workflow.md`, `agent-brief.md` |
| `scripts/new_project.py` | scaffolds a project and analyses the track |
| `examples/pdoom/` | the reference project's treatment, all 17 scenes, timeline and analysis: the quality bar |

## Licence

MIT: © 2026 Giacomo Magnanini (engine and reference project), and the skill's modifications under the same
terms (see [`LICENSE`](LICENSE)). Fonts are under the SIL Open Font License (`template/app/public/fonts/src/OFL.txt`).
The P(doom) song and its lyrics aren't included and aren't covered by this licence.
