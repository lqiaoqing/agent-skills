// Starter scene: the signal. One glowing point drags a hairline across a drafting grid (GPU LineBatch,
// additive, so the head blooms), ticking the grid on every beat. A pure function of time: it re-draws the
// whole trail each frame instead of accumulating state, so it seeks and motion-blurs correctly.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog } from '../engine/util';

const scale3 = (c: [number, number, number], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

export default class Signal extends Scene {
  private label: string = this.ctx.params.label ?? 'SIGNAL — ONE ACCENT, ONE LINE';
  private bg = new FSPass(/* glsl */ `
    uniform float grid;
    void main() {
      vec2 p = FRAG_PX;
      vec2 g = abs(fract(p / 96.0 + 0.5) - 0.5) * 96.0;
      float line = pxLine(min(g.x, g.y), 0.4, 1.3) * grid;
      fragColor = vec4(C_INK + C_GRAPHITE * 0.16 * line, 1.0);
    }`, { grid: { value: 0 } });
  private lines = new LineBatch(8000, { blend: 'add' });
  private text = new Layer2D();

  /** The path: a damped wave across the frame, param s in 0..1. */
  private at(s: number, t: number) {
    const x = lerp(-60, W + 60, s);
    const y = H * 0.56 + Math.sin(s * 11 + t * 0.6) * 150 * (1 - s * 0.6) + Math.sin(s * 37) * 18;
    return { x, y };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const head = prog(f.lt, 0, this.ctx.end - this.ctx.start, ease.inOutCubic);
    this.bg.u.grid!.value = prog(f.lt, 0, 0.6, ease.outCubic);
    this.bg.render(renderer, out);

    const L = this.lines;
    L.clear();
    const N = 600, n = Math.floor(N * head);
    let prev = this.at(0, f.t);
    for (let k = 1; k <= n; k++) {
      const p = this.at(k / N, f.t);
      const age = (n - k) / N; // 0 at the head
      L.seg2(prev.x, prev.y, p.x, p.y, 1.6, scale3(LIN.bone, 0.55 + 0.45 * Math.exp(-age * 20)), 1);
      prev = p;
    }
    // the hot head: stacked capsules brighter than 1.0 linear, so bloom picks them up
    const h = this.at(n / N, f.t);
    const beatHit = Math.exp(-f.beatPhase * 7);
    L.seg2(h.x - 2, h.y, h.x + 2, h.y, 10 + 8 * beatHit, scale3(LIN.signal, 3 + 4 * beatHit), 1);
    L.seg2(h.x - 1, h.y, h.x + 1, h.y, 4, scale3(LIN.ember, 6), 1);
    // one tick per elapsed beat on a baseline (taller on downbeats): the beat grid made visible
    const b0 = Math.round(this.ctx.audio.beatAt(this.ctx.start));
    for (let b = b0; b <= Math.floor(f.beat + 1e-4) && b - b0 < 36; b++) {
      const x = 96 + (b - b0) * 48, tall = (b - b0) % 4 === 0;
      L.seg2(x, H - 150, x, H - 150 - (tall ? 22 : 10), 1.3, scale3(tall ? LIN.signal : LIN.ash, tall ? 1.4 : 0.7), 1);
    }
    L.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    c.font = font(F.mono(500), 15);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('ash', 0.85 * clamp(f.lt * 3));
    c.fillText(this.label, 96, 120);
    c.fillStyle = rgba('signal', 0.95);
    c.fillText(`x ${h.x.toFixed(0).padStart(4, '0')}  y ${h.y.toFixed(0).padStart(4, '0')}`, Math.min(h.x + 24, W - 300), h.y - 28);
    c.letterSpacing = '0px';
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.9, halation: 0.35 };
  }
}
