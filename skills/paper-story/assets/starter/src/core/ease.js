// 缓动库。品牌曲线来自站点 CSS：cubic-bezier(0.22, 1, 0.36, 1)。

export const linear = (t) => t;
export const inQuad = (t) => t * t;
export const outQuad = (t) => 1 - (1 - t) * (1 - t);
export const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - (1 - t) ** 3;
export const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const inQuart = (t) => t ** 4;
export const outQuart = (t) => 1 - (1 - t) ** 4;
export const inOutQuart = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
export const inQuint = (t) => t ** 5;
export const outQuint = (t) => 1 - (1 - t) ** 5;
export const inOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
export const inExpo = (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10));
export const outExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
export const inOutExpo = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2);
export const inSine = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const outSine = (t) => Math.sin((t * Math.PI) / 2);
export const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const inCirc = (t) => 1 - Math.sqrt(1 - t * t);
export const outCirc = (t) => Math.sqrt(1 - (t - 1) ** 2);
export const inOutCirc = (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2);
export const outBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
export const inBack = (t, s = 1.70158) => (s + 1) * t ** 3 - s * t * t;
export const inOutBack = (t, s = 1.70158 * 1.525) =>
  t < 0.5 ? ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2 : ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
export const outElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

/** CSS cubic-bezier 求解（牛顿迭代 + 二分兜底），返回 t→y 的函数。 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1; u = x;
    for (let i = 0; i < 30; i++) { const v = sx(u); if (Math.abs(v - x) < 1e-6) return u; if (x > v) lo = u; else hi = u; u = (lo + hi) / 2; }
    return u;
  };
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sy(solve(t)));
}

/** 上一版站点主曲线（遮罩上浮、滚动揭示）。强烈的快出慢收。 */
export const brand = cubicBezier(0.22, 1, 0.36, 1);
/** 线上纪念碑版站点的 --ease：cubic-bezier(.22,.61,.36,1)，更克制的出入。 */
export const site = cubicBezier(0.22, 0.61, 0.36, 1);
/** 网站转动空间/桥梁用的 smoothstep。 */
export const smooth = (t) => t * t * (3 - 2 * t);
/** 动效设计常用的“快进慢出”强曲线。 */
export const snap = cubicBezier(0.16, 1, 0.3, 1);
/** 对称的平滑加减速（镜头运动）。 */
export const glide = cubicBezier(0.65, 0, 0.35, 1);
/** 蓄力后甩出（whip）。 */
export const whip = cubicBezier(0.7, 0, 0.2, 1);

/** 阻尼弹簧（归一化到 0→1，带过冲），t 单位秒。 */
export function spring(t, { freq = 2.2, damping = 0.35 } = {}) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq, z = damping;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** 把缓动函数应用到区间 [a,b]：返回 ease(seg(t,a,b))。 */
export const ez = (t, a, b, fn = brand) => fn(t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
