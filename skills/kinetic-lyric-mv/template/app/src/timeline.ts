// The edit: which scene plays when. Cut on the beat grid (data/audio.json), or on lyric/voice words
// (data/lyrics.json) when the project has them: never hard-code seconds inside scenes.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import { Readout } from './engine/hud';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Time of beat i (0 = first beat of the grid). Hard cuts: consecutive entries share a boundary. */
  const beat = (i: number) => au.timeOfBeat(i);
  /** Last beat at/before the first word of a line (use when the project has lyrics/voice timings). */
  const cut = (q: string, nth = 0) => au.timeOfBeat(Math.floor(au.beatAt(ly.get(q, nth).words[0]!.start + 0.02)));
  void cut;

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  // kinetic-lyric-mv: with word-timed lyrics (data/lyrics.json) the starter edit is one Chinese kinetic-lyric scene
  // over the whole track; replace it with your own plates (treatment first). Without lyrics: the upstream demo edit.
  if (ly.lines.length) return [E('lyrics', 'lyric-cjk', 0, au.duration, { params: { maxPerRow: 9 } })];

  return [
    E('slam', 'slam', 0, beat(8), { params: { words: ['Every', 'frame', 'is', 'a', 'function', 'of', 'time.'], accent: [4] } }),
    E('signal', 'signal', beat(8), beat(16)),
    E('end', 'endcard', beat(16), au.duration, { params: { title: 'SUPER MOTION', tagline: 'every frame a function of time' } }),
  ];
}

/** The optional corner readout (hud.ts): a labelled 0..1 value stepping at chosen times. Shown only
 * while a scene returns `readout: 1` in its post overrides. */
export function makeReadout(_ly: Lyrics, au: AudioData): Readout {
  return new Readout('PROGRESS', [{ t: au.timeOfBeat(8), v: 0.5 }, { t: au.timeOfBeat(16), v: 1 }], 0.05);
}
