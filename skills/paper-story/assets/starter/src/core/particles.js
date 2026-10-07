// 无状态粒子：每个粒子的位置都由 (种子, 序号, 当前时间) 解析算出，可任意跳帧/倒放。
import { hash2, TAU, lerp, fract } from './util.js';

const R = (seed, i, k) => hash2(seed * 97 + k * 13.37, i);
const range = (r, v) => (Array.isArray(v) ? lerp(v[0], v[1], r) : v);

/**
 * 一次性爆发（金币、纸屑、火星、碎片）。
 * o: { at, seed, count, x, y, spread(发射点半径), speed:[a,b], angle:[a,b](弧度，0=向右，-π/2=向上),
 *      gravity(px/s²), drag(1/s), life:[a,b], spin:[a,b](rad/s), size:[a,b] }
 * draw(g, x, y, s) —— s: { i, age, p(0..1 寿命进度), rot, size, r(0..1 随机), vx, vy }
 */
export function burst(g, T, o, draw) {
  const { at = 0, seed = 1, count = 24, x = 960, y = 540, spread = 0, speed = [200, 600], angle = [0, TAU], gravity = 900, drag = 1.2, life = [0.8, 1.4], spin = [-6, 6], size = [8, 16] } = o;
  const age = T - at;
  if (age < 0) return;
  for (let i = 0; i < count; i++) {
    const L = range(R(seed, i, 1), life);
    if (age > L) continue;
    const a = range(R(seed, i, 2), angle), v = range(R(seed, i, 3), speed);
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    const k = drag > 0 ? (1 - Math.exp(-drag * age)) / drag : age;
    const ox = spread ? (R(seed, i, 6) - 0.5) * 2 * spread : 0, oy = spread ? (R(seed, i, 7) - 0.5) * 2 * spread : 0;
    const px = x + ox + vx * k, py = y + oy + vy * k + 0.5 * gravity * age * age;
    draw(g, px, py, { i, age, p: age / L, rot: range(R(seed, i, 4), spin) * age + R(seed, i, 8) * TAU, size: range(R(seed, i, 5), size), r: R(seed, i, 9), vx, vy: vy + gravity * age });
  }
}

/**
 * 持续发射（火焰、尾尘、烟）：[start, end) 内按 rate 个/秒出生。
 * o: { start, end, rate, seed, life:[a,b], emit(tBorn, i, r) => {x, y, vx, vy}, gravity, drag, size:[a,b], spin }
 */
export function stream(g, T, o, draw) {
  const { start = 0, end = Infinity, rate = 20, seed = 1, life = [0.6, 1.2], gravity = 0, drag = 0.8, size = [8, 16], spin = [-2, 2] } = o;
  const maxL = Array.isArray(life) ? life[1] : life;
  const i0 = Math.max(0, Math.floor((T - maxL - start) * rate)), i1 = Math.floor((Math.min(T, end) - start) * rate);
  for (let i = i0; i <= i1; i++) {
    const tb = start + i / rate;
    if (tb > T || tb >= end) continue;
    const age = T - tb, L = range(R(seed, i, 1), life);
    if (age > L) continue;
    const e = o.emit(tb, i, R(seed, i, 2));
    const k = drag > 0 ? (1 - Math.exp(-drag * age)) / drag : age;
    draw(g, e.x + (e.vx || 0) * k, e.y + (e.vy || 0) * k + 0.5 * gravity * age * age, { i, age, p: age / L, size: range(R(seed, i, 5), size), rot: range(R(seed, i, 4), spin) * age, r: R(seed, i, 9) });
  }
}

/**
 * 循环飘落场（雪、花瓣、灰尘、萤火）：粒子在矩形区域内匀速漂移并首尾循环。
 * o: { seed, count, x, y, w, h, vx, vy, sway(左右摆幅 px), swayFreq, size:[a,b] }
 */
export function field(g, T, o, draw) {
  const { seed = 1, count = 60, x = 0, y = 0, w = 1920, h = 1080, vx = 0, vy = 60, sway = 20, swayFreq = 0.4, size = [3, 8] } = o;
  for (let i = 0; i < count; i++) {
    const sp = 0.6 + R(seed, i, 3) * 0.8;
    const px = x + fract(R(seed, i, 1) + (vx * sp * T) / w) * w + Math.sin(T * swayFreq * TAU * sp + R(seed, i, 4) * TAU) * sway;
    const py = y + fract(R(seed, i, 2) + (vy * sp * T) / h) * h;
    draw(g, px, py, { i, size: range(R(seed, i, 5), size), r: R(seed, i, 6), rot: T * (R(seed, i, 7) - 0.5) * 4 + R(seed, i, 8) * TAU, depth: sp });
  }
}
