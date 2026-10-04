// Starter scene: the end card on bone paper (the light/dark rhythm), with the crop-mark frame flying in.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, fitSize } from '../engine/type';
import { clamp, ease, prog } from '../engine/util';

export default class EndCard extends Scene {
  private title: string = this.ctx.params.title ?? 'SUPER MOTION';
  private tagline: string = this.ctx.params.tagline ?? 'every frame a function of time';
  private footer: string = this.ctx.params.footer ?? 'RENDERED IN CODE · 60 FPS · MOTION BLUR';
  private bg = new FSPass(/* glsl */ `
    void main() {
      vec2 g = abs(fract(FRAG_PX / 64.0 + 0.5) - 0.5) * 64.0;
      float line = pxLine(min(g.x, g.y), 0.4, 1.2);
      fragColor = vec4(mix(C_BONE, C_INK, 0.07 * line), 1.0);
    }`);
  private text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    this.bg.render(renderer, out);
    const c = this.text.ctx;
    this.text.clear();
    const a = prog(f.lt, 0.05, 0.6, ease.outExpo), b = prog(f.lt, 0.35, 0.9, ease.outExpo), r = prog(f.lt, 0.6, 1.2, ease.outExpo);
    const fam = F.archivo(125, 900);
    const size = fitSize(this.title, fam, W - 360, 240);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.font = font(fam, size);
    c.fillStyle = rgba('ink', clamp(a * 2));
    c.letterSpacing = `${(1 - a) * 60}px`;
    c.fillText(this.title, W / 2, H * 0.5);
    c.letterSpacing = '0px';
    c.font = font(F.serif(400, true), 64);
    c.fillStyle = rgba('blood', b);
    c.fillText(this.tagline, W / 2, H * 0.5 + 92 + (1 - b) * 20);
    // hairline rule drawing in, then the mono footer
    c.fillStyle = rgba('ink', 0.8);
    c.fillRect(W / 2 - 560 * r, H * 0.5 + 150, 1120 * r, 1.5);
    c.font = font(F.mono(500), 16);
    c.letterSpacing = '4px';
    c.fillStyle = rgba('ink', 0.7 * r);
    c.fillText(this.footer, W / 2, H * 0.5 + 190);
    c.letterSpacing = '0px';
    comp.draw(renderer, this.text.upload(), out);
    // paper: the HUD draws in ink; frame: crop marks fly in; low bloom so bone type stays crisp
    return { paper: 1, frame: prog(f.lt, 0.2, 0.9, ease.outCubic), bloom: 0.15, vignette: 0.2 };
  }
}
