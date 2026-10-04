// Starter scene: kinetic type. One word per beat slams full-frame (Archivo condensing from width 125 as
// it lands) over an engraved contour field. Replace or copy it; it shows the scene API end to end.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, fitSize } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse } from '../engine/util';

export default class Slam extends Scene {
  private words: string[] = this.ctx.params.words ?? ['Every', 'frame', 'is', 'a', 'function', 'of', 'time.'];
  /** Indices of words set in the signal colour. */
  private accent: number[] = this.ctx.params.accent ?? [4];

  private bg = new FSPass(/* glsl */ `
    uniform float t; uniform float hit;
    void main() {
      vec2 p = FRAG_PX / 1080.0;
      float h = fbm(p * 1.4 + vec2(0.0, t * 0.04), 4) * 7.0;
      // contour lines of the noise height: a topographic engraving, hairline at every output scale
      float d = abs(fract(h) - 0.5) / max(fwidth(h), 1e-4);
      float line = pxLine(d, 0.4, 1.4);
      vec3 col = C_INK + (C_GRAPHITE * 0.22 + C_SIGNAL * 0.08 * hit) * line;
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, hit: { value: 0 } });
  private text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio } = this.ctx;
    const b0 = Math.round(audio.beatAt(this.ctx.start));
    const i = clamp(Math.floor(f.beat + 1e-4) - b0, 0, this.words.length - 1);
    const landed = audio.timeOfBeat(b0 + i);
    const k = prog(f.t, landed, landed + 0.32, ease.outExpo);
    const hit = pulse(f.t, landed, 0.12);

    this.bg.u.t!.value = f.t;
    this.bg.u.hit!.value = hit;
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    const word = this.words[i]!.toUpperCase();
    const fam = F.archivo(lerp(125, 87.5, k), 900);
    const size = fitSize(word, fam, W - 260, 380);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(lerp(1.28, 1, k), lerp(1.28, 1, k));
    c.font = font(fam, size);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = this.accent.includes(i) ? rgba('signal') : rgba('bone');
    c.globalAlpha = clamp(k * 3);
    c.fillText(word, 0, size * 0.04);
    c.restore();
    // small mono annotation: the Swiss-grid voice next to the display type
    c.font = font(F.mono(500), 15);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('ash', 0.8);
    c.fillText(`${String(i + 1).padStart(2, '0')} / ${String(this.words.length).padStart(2, '0')}   BEAT ${f.beat.toFixed(2)}`, 96, H - 96);
    c.letterSpacing = '0px';
    comp.draw(renderer, this.text.upload(), out);

    const j = frameIdx(f.t);
    return { bloom: 0.6, shake: [(hash(j, 1) - 0.5) * 10 * hit, (hash(j, 2) - 0.5) * 10 * hit], flash: 0.06 * hit };
  }
}
