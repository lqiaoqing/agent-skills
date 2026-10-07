// 纯函数工具：一切动画都是 t 的确定性函数，禁止 Math.random（逐帧渲染要可复现）。

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
/** 区间进度：t 在 [a,b] 内线性映射到 [0,1]，两端夹紧。 */
export const seg = (t, a, b) => clamp(invLerp(a, b, t));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;
/** 进入-停留-退出的包络：[a,b] 淡入，[c,d] 淡出。 */
export const envelope = (t, a, b, c, d, easeIn = (x) => x, easeOut = (x) => x) =>
  t < b ? easeIn(seg(t, a, b)) : t < c ? 1 : 1 - easeOut(seg(t, c, d));
/** 以 center 为中心、宽 width 的钟形脉冲（高斯），峰值 1。 */
export const pulse = (t, center, width) => Math.exp(-(((t - center) / width) ** 2));
/** 冲击后的指数衰减：t<at 为 0，at 处为 1，之后按 decay 秒衰减。 */
export const hit = (t, at, decay = 0.25) => (t < at ? 0 : Math.exp(-(t - at) / decay));

// ---------- 确定性随机 ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 整数/浮点输入 → [0,1) 的稳定哈希。 */
export function hash1(n) {
  let x = Math.floor(n * 1000003) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (a, b) => hash1(a * 374761.393 + b * 668265.263);
/** 平滑一维值噪声，输出 [-1,1]。 */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed) * 2 - 1, hash2(i + 1, seed) * 2 - 1, u);
}
/** 分形噪声（手持感抖动用）。 */
export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ---------- 颜色 ----------
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export const rgba = (hex, a = 1) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join('');
}

/** 把数字格式化为 00:00:00 时间码（帧位按 fps）。 */
export function timecode(t, fps = 60) {
  const f = Math.floor(t * fps + 1e-6);
  const s = Math.floor(f / fps), fr = f % fps;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}:${String(fr).padStart(2, '0')}`;
}
export const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

// ---------- 动画常用 ----------
/** 事件后的阻尼振荡（跟随/余振）：at 之前为 0，之后按 freq Hz 振荡、decay 秒衰减。 */
export const wobble = (t, at, freq = 3, decay = 0.35) => (t < at ? 0 : Math.exp(-(t - at) / decay) * Math.sin(TAU * freq * (t - at)));
/** 平滑往复（0..1..0），period 秒一周。 */
export const osc = (t, period = 1, phase = 0) => 0.5 - 0.5 * Math.cos(TAU * (t / period + phase));
/** 从 times（升序）里找出 t 所在的段号：t<times[0] 为 -1。 */
export const stepIndex = (t, times) => { let k = -1; for (let i = 0; i < times.length; i++) if (t >= times[i]) k = i; return k; };
/** 挤压拉伸：给定形变量 s（正=拉长），返回保持面积的 [sx, sy]。 */
export const squash = (s) => [1 / Math.sqrt(1 + s), 1 + s];
/** 多个事件时间点的冲击衰减之和（例如一串脚步/打击）。 */
export const hits = (t, ats, decay = 0.2) => ats.reduce((s, a) => s + hit(t, a, decay), 0);
