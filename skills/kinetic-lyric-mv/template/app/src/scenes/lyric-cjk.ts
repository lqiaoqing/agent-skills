// kinetic-lyric-mv starter scene: word-synced CHINESE (CJK) kinetic lyrics. Each character is one word in
// data/lyrics.json (analysis/words.py or lyrics_tool.py split Chinese per character); it slams in on its own
// start time (scale + blur-free snap, signal colour while sung, then bone), the line breathes on the beat over an
// engraved contour field, and leaves upward when the next line arrives. Lines longer than `maxPerRow`
// characters wrap onto two rows. Mixed lines ("我们的 AI 时代") work: Latin words are laid out as single cells.
// params: { maxPerRow?: number (default 9), size?: number (max px, default 210), accent?: string[] (chars always in signal) }
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, measure, isCJK } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse } from '../engine/util';

type Cell = { w: Word; x: number; y: number; size: number; width: number };

export default class LyricCJK extends Scene {
  private maxPerRow: number = this.ctx.params.maxPerRow ?? 9;
  private maxSize: number = this.ctx.params.size ?? 210;
  private accent: string[] = this.ctx.params.accent ?? [];
  private cache = new Map<number, Cell[]>();

  private bg = new FSPass(/* glsl */ `
    uniform float t; uniform float hit; uniform float beat;
    void main() {
      vec2 p = FRAG_PX / 1080.0;
      float h = fbm(p * 1.2 + vec2(t * 0.03, -t * 0.05), 4) * 6.0 + beat * 0.15;
      float d = abs(fract(h) - 0.5) / max(fwidth(h), 1e-4);
      float line = pxLine(d, 0.4, 1.4);
      float vig = smoothstep(1.25, 0.2, length(p - vec2(0.889, 0.5)));
      vec3 col = C_INK + (C_GRAPHITE * 0.18 + C_SIGNAL * 0.10 * hit) * line * vig;
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, hit: { value: 0 }, beat: { value: 0 } });
  private text = new Layer2D();

  /** Per-character layout of a line (cached): rows of cells centred on the frame. */
  private layoutLine(l: Line): Cell[] {
    const hit = this.cache.get(l.i);
    if (hit) return hit;
    const fam = F.cjk(900);
    const words = l.words;
    const rows: Word[][] = [];
    let cur: Word[] = [], n = 0;
    for (const w of words) {
      const units = isCJK(w.w) ? 1 : Math.max(1, Math.ceil(Array.from(w.w).length / 2.2));
      if (n + units > this.maxPerRow && cur.length) { rows.push(cur); cur = []; n = 0; }
      cur.push(w); n += units;
    }
    if (cur.length) rows.push(cur);
    const gap = 0.08; // fraction of size between cells
    const widthAt = (r: Word[], s: number) => r.reduce((a, w) => a + measure(w.w, fam, s), 0) + (r.length - 1) * gap * s;
    const widest = rows.reduce((m, r) => Math.max(m, widthAt(r, 100)), 1);
    const size = Math.min(this.maxSize, (100 * (W - 280)) / widest, rows.length > 1 ? 190 : 260);
    const lh = size * 1.22, top = H / 2 - ((rows.length - 1) * lh) / 2;
    const cells: Cell[] = [];
    rows.forEach((r, ri) => {
      let x = W / 2 - widthAt(r, size) / 2;
      for (const w of r) {
        const width = measure(w.w, fam, size);
        cells.push({ w, x: x + width / 2, y: top + ri * lh, size, width });
        x += width + gap * size;
      }
    });
    this.cache.set(l.i, cells);
    return cells;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio, lyrics } = this.ctx;
    const line = lyrics.lastLine(f.t + 0.25); // show a line slightly before its first character lands
    const next = line ? lyrics.nextLine(f.t + 0.25) : null;
    const lastHit = lyrics.lastWord(f.t);
    const hit = lastHit ? pulse(f.t, lastHit.start, 0.1) : 0;

    this.bg.u.t!.value = f.t;
    this.bg.u.hit!.value = hit;
    this.bg.u.beat!.value = f.beat;
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    if (line) {
      const cells = this.layoutLine(line);
      // the whole line leaves upward in the 0.25 s before the next line takes over (or 0.4 s after it ends)
      const leaveAt = next ? next.start - 0.25 : line.end + 0.4;
      const leave = prog(f.t, leaveAt, leaveAt + 0.25, ease.inCubic);
      const breathe = 1 + 0.025 * pulse(f.t, audio.timeOfBeat(Math.floor(f.beat + 1e-4)), 0.18);
      c.save();
      c.translate(W / 2, H / 2 - leave * 160);
      c.scale(breathe, breathe);
      c.translate(-W / 2, -H / 2);
      c.globalAlpha = 1 - leave;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const cell of cells) {
        const { w } = cell;
        const k = prog(f.t, w.start - 0.03, w.start + 0.2, ease.outExpo); // slam
        const sung = f.t >= w.start && f.t < w.end; // only the character being sung glows
        const s = lerp(1.7, 1, k);
        const jx = (hash(w.gi, 3) - 0.5) * 14 * (1 - k), jy = (hash(w.gi, 5) - 0.5) * 14 * (1 - k);
        c.save();
        c.translate(cell.x + jx, cell.y + jy);
        c.rotate((hash(w.gi, 7) - 0.5) * 0.18 * (1 - k));
        c.scale(s, s);
        c.font = font(F.cjk(k > 0.02 ? 900 : 400), cell.size);
        if (k <= 0.02) {
          // not sung yet: a hairline ghost of the character
          c.lineWidth = 1.2; c.strokeStyle = rgba('graphite', 0.55); c.strokeText(w.w, 0, 0);
        } else {
          c.globalAlpha = (1 - leave) * clamp(k * 2.5);
          c.fillStyle = sung || this.accent.includes(w.w) ? rgba('signal') : rgba('bone');
          c.fillText(w.w, 0, 0);
        }
        c.restore();
      }
      c.restore();
      // the Swiss-grid voice: a small mono annotation
      c.font = font(F.mono(500), 15);
      c.letterSpacing = '3px';
      c.fillStyle = rgba('ash', 0.8);
      c.textAlign = 'left';
      c.fillText(`LINE ${String(line.i + 1).padStart(2, '0')} / ${String(lyrics.lines.length).padStart(2, '0')}   BEAT ${f.beat.toFixed(2)}`, 96, H - 96);
      c.letterSpacing = '0px';
    }
    comp.draw(renderer, this.text.upload(), out);

    const j = frameIdx(f.t);
    return { bloom: 0.55, shake: [(hash(j, 1) - 0.5) * 8 * hit, (hash(j, 2) - 0.5) * 8 * hit], flash: 0.04 * hit };
  }
}
