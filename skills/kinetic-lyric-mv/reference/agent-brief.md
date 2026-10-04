# Scene agent brief (template for the lead)

Copy, fill in the <…>, and send as the Agent prompt. Paste the plate paragraphs in full: agents start cold.

---

You are building scene module(s) for a code-rendered motion graphics video. Project: `<abs path>/video`.
The engine is a three.js web app in `app/`; every frame is a pure function of time.

**Read first:** `docs/ENGINE.md` (the scene API, toolbox and rules) and `docs/TREATMENT.md` (the style
bible: palette, type, tone, not-slop list, sync rules, motifs). For the quality bar, read
`<skill path>/examples/pdoom/scenes/<one or two relevant reference scenes>.ts`.

**You own:** `app/src/scenes/<name>.ts` (and helpers named `scenes/<name>-*.ts`), for the timeline entry(ies) `<id(s)>`,
window `<start>–<end> s`. Don't edit any other file: not `src/timeline.ts`, not `src/engine/*`, not
`_motifs.ts`. If you need an engine change, say what and why in your final message.

**The plate** (from the treatment, verbatim):
> <paste the plate's shot-by-shot paragraph(s)>

**Words / beats to hit:** <the lyric or voice lines in this window with how to find them (`lyrics.get('…')`),
the downbeats or hits that must land>.

**Hand-offs:** it enters from `<previous plate: what's on screen at the cut>` and must hand off to `<next
plate>` by `<shape/colour/position the cut matches on>`.

**Rules:**
- Deterministic: a pure function of `f.t` only (seeded `hash`/`mulberry32`, `frameIdx(t)` for per-frame jitter; no `Math.random`, `Date.now` or state that counts renders).
- Colours: linear, palette constants only. Only signal/ember glow.
- Type: `F.archivo(width, weight)`, `F.mono()`, `F.serif(weight, italic)`, using `layout()`/`glyphX()` for glyph-by-glyph drawing. No outlined or haloed type. Keep text inside the title-safe area.
- Performance under 25 ms/frame at `--samples 1` (`node scripts/render.ts perf --only <id>`).

**Check your work before reporting:**
- `cd app && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/<name>`;
- `node scripts/render.ts stills --t <5–8 times across the window, incl. every beat/word you hit> --only <id> --out ../out/wip/<id>`, then **Read every PNG**;
- a `sheet` over the whole window;
- iterate until it matches the plate and the taste bar.

**Report:** what you built, the times of your best stills, anything you couldn't do, and any engine change you need.
