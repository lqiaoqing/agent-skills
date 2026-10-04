# Workflow: lead, scene agents, review loop

This is how the reference video was made (see `examples/pdoom/TREATMENT.md`, its revision notes and its
scene-agent rules in `ENGINE.md`): one **lead** owns the concept, engine, edit and integration; **scene
agents** own plates; the **client** (the user) reviews renders and gives notes, which become revisions.

## Lead responsibilities

1. **Treatment** (`docs/TREATMENT.md`): concept, motif, tone, not-slop list, palette, type, sync rules, plate
   table with owners (A1, A2 … for agents, `lead` for the bookends), a shot-by-shot paragraph per plate.
   Get it approved.
2. **Engine setup**, before agents start:
   - `src/engine/palette.ts`: the hex values (keep the keys).
   - `src/scenes/_motifs.ts`: every motif that recurs across plates (read-only for agents).
   - `src/timeline.ts`: one entry per plate, windows anchored to beats and words (`au.timeOfBeat`, `au.downbeats`, `cut('line text')`). Placeholder scenes are fine; a missing module renders red.
   - `makeReadout()` if the piece has a recurring number.
3. **Launch scene agents** in parallel (one message, several Agent calls). Give each one plate or a few related ones, briefed from `reference/agent-brief.md` with its plate paragraphs copied in full.
4. **Integrate**:
   - typecheck (`bunx tsc --noEmit -p tsconfig.json`);
   - `node scripts/render.ts sheet --cuts --out ../out/cuts.png` to see 4 frames around every boundary;
   - fix the hand-offs, so the cut matches on shape, colour or position;
   - check the bookends and loop.
5. **Review with the user**: sheets and stills first (cheap), then a draft clip (`video --samples 4 --preset veryfast`). Log each note as `Revision N` in the treatment section it changes, then send the affected plates back to their agents or fix them yourself.
6. **Final render** (`--samples auto --shutter 0.2`), in the background, in segments for long pieces.

## Checking work (everyone)

- `stills --t a,b,c --only <id> --out ../out/wip/<id>`, then **Read every PNG**.
- `sheet --from A --to B --n 16 --cols 4 --only <id>` for motion over a window.
- Short clip to judge motion: `video --from A --to B --only <id> --preset veryfast --samples 4`, then extract frames with ffmpeg and look at them.
- Check word sync against `data/lyrics.json` times and cuts against `f.beat`, not by eye in the preview.
- `perf --from A --to B --only <id>` should stay under ~25 ms/frame at `--samples 1`.

## Taste checklist (from the reference)

- One accent colour, used for exactly the things that matter. Everything else ink, bone and greys.
- Every plate has its own idiom (engraving, oscilloscope, paperwork, blueprint, UI, 3D), but all share palette, type, grain and humour.
- Words are part of the image (written by the motif, riding a curve, typed as tokens, stamped on a form), never subtitles.
- Big changes land on the beat: hard cuts on downbeats, hits on kicks and snares, moves that ease *into* downbeats. Hold, then snap.
- Specific, concrete subjects treated as visual puns and transformations, not literal illustrations of each line.
- Small mono annotations and footnotes beside huge display type: precision reads as craft.
- The motif carries continuity: the reference's spark writes, draws, bends, burns and detonates across the whole video.
