# <Title> — treatment & style bible

> Written by the lead before any scene code, approved by the client (the user), then kept current: every
> review round is logged as a **Revision N** note inside the section it changed, so scene agents always build
> against the latest decision. Model: `examples/pdoom/TREATMENT.md` in the skill.

## The idea in one paragraph

What the piece *is*, framed as one concept that makes every scene part of a whole (the reference framed a
music video as "plates from an illustrated treatise on the end of the world"). Name the **through-line
motif** (the reference's single orange spark that writes the first word, draws the chart, becomes the fuse
and finally detonates), and the rule that lets the look change scene to scene while staying one piece
("every plate has its own idiom… but shares one palette, one type system, one grain, one sense of humour").

## Tone

- Dynamic: something always moves; big changes land **on the beat** (cuts on downbeats, hits on kicks and
  snares, camera moves easing *into* downbeats). Strong eases (`outExpo`, `inOutCubic`, springs), holds,
  then snaps. No floaty screensaver motion.
- Impressive, not cute: precise hairlines, high-contrast type, restraint in colour, depth through light,
  bloom only on the signal colour.
- Humour (if any): what kind — deadpan, visual puns, tiny footnotes — and what's off-limits.
- **Not slop** (write the project's own list): no purple/cyan neon, no glowing brains, no lens-flare soup,
  no generic particle nebulae, no stock imagery of the subject, nothing that looks AI-generated.
- Originality: don't copy existing artworks, logos or other videos. Real product names only as words.

## Palette (`app/src/engine/palette.ts`)

- **ink** `#......` background · **ink2** `#......` panels · **graphite** / **ash** greys · **bone** `#......`
  paper and type · **signal** `#......` THE accent (the motif, the key word, highlights) · **ember** hotter
  signal · **blood** deep signal · **acid** `#......` one rare moment, or never.
- Which scenes invert to **bone paper with ink lines** (the light/dark rhythm of the edit).
- Only signal/ember exceed ~0.85 linear (glow). Bone type stays crisp.

## Typography

- **Archivo** (width 62–125, weight 300–900): the voice. Animate width and weight for expression.
- **IBM Plex Mono**: the machine voice — labels, HUD, data, footnotes.
- **Cormorant Garamond** (italic): the rare, elevated register.
- **Single-stroke fonts** for text that is *written* by a pen or the motif.
- Swiss-grid layout, asymmetric, generous negative space, hairline rules, small mono annotations beside big
  display type. Kerned, typographic punctuation, no outlined or haloed type.

## Sync rules

- Music: cuts on downbeats (`au.timeOfBeat`, `au.downbeats`), hits on `f.a.kick/snare`, sections from
  `au.sections`. Silent projects: the beat grid from `beatgrid.py` still sets the rhythm.
- Words (lyrics / voiceover, if any): every line readable and **synced per word** (`Lyrics.wordProgress`);
  anticipation OK (dim ~0.4 s early), highlighting never runs ahead of the voice. Each scene integrates the
  words *graphically and differently* — never subtitles on top.
- Title-safe: text ≥ 96 px from the edges, clear of the HUD corners.

## Motifs

1. **<The through-line>**: what it is, how it's drawn (`_motifs.ts`), where it appears.
2. **<A recurring object or mark>**
3. **<A recurring data element>** (a counter via `Readout`, a probability, a score) — staged inside scenes.
4. **<A recurring typographic slam>** whose look escalates each time.

## Plates (scene modules)

Approximate windows; exact ones come from `src/timeline.ts` (beat/word anchored). One module per plate.

| id | window | content / words | owner |
|---|---|---|---|
| `open` | 0 → … | … | A1 |
| … | … | … | … |
| `outro` | … → end | end card / loop | lead |

### `open` — "<name>"
Shot by shot: what's on screen, what moves on which beat or word, the camera, the joke, and the hand-off
into the next plate (what shape/colour/position the cut matches on).

### …

## Technical conventions

See `docs/ENGINE.md`. Deterministic (pure function of `f.t`), per-word sync, beat-synced motion, hard cuts on
downbeats, < 25 ms/frame in preview.

## Revision log

- Revision 1 (date): what the client said → what changed, in which plates.
