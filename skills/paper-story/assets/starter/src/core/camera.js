// 多层视差机位（纸艺立体书的“多平面摄影台”）+ 震动/手持漂移。
// 世界坐标：机位在 (960,540)、zoom=1、rot=0 时，任何深度的图层都与屏幕坐标重合。
// depth（视差系数）：1 = 主体层（角色所在平面）；<1 远景（移动更慢、缩放更弱）；>1 前景（更快、更强）。
import { noise1, fbm1 } from './util.js';

export const cam = (x = 960, y = 540, zoom = 1, rot = 0) => ({ x, y, zoom, rot });

/** 把 g 的坐标系设为某深度图层在该机位下的世界坐标（在当前变换上叠加）。 */
export function applyCam(g, c, depth = 1) {
  const z = 1 + (c.zoom - 1) * depth;
  g.translate(960, 540);
  if (c.rot) g.rotate(c.rot);
  g.scale(z, z);
  g.translate(-(960 + (c.x - 960) * depth), -(540 + (c.y - 540) * depth));
}

/** 世界坐标（某深度）→ 屏幕坐标，便于在屏幕空间叠 UI/文字跟随角色。 */
export function toScreen(c, depth, x, y) {
  const z = 1 + (c.zoom - 1) * depth;
  let dx = (x - (960 + (c.x - 960) * depth)) * z, dy = (y - (540 + (c.y - 540) * depth)) * z;
  if (c.rot) { const cs = Math.cos(c.rot), sn = Math.sin(c.rot); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; }
  return [960 + dx, 540 + dy];
}

/** 两个机位插值（镜头运动）。 */
export const lerpCam = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: a.zoom * Math.pow(b.zoom / a.zoom, t), rot: a.rot + (b.rot - a.rot) * t });

/** 冲击震动：at 时刻起按 decay 秒衰减，返回 [dx,dy]（逻辑像素）。 */
export function shake(T, at, { amp = 18, decay = 0.3, freq = 24, seed = 1 } = {}) {
  if (T < at) return [0, 0];
  const k = Math.exp(-(T - at) / decay) * amp;
  return [noise1((T - at) * freq, seed) * k, noise1((T - at) * freq, seed + 7) * k];
}

/** 手持呼吸感漂移（很轻，让画面永远“活着”）。 */
export function drift(T, { amp = 6, speed = 0.35, seed = 3 } = {}) {
  return [fbm1(T * speed, seed) * amp, fbm1(T * speed, seed + 5) * amp * 0.7];
}

/** 叠加多个 [dx,dy]。 */
export const addv = (...vs) => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);
