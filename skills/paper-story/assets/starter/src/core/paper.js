// 纸艺绘图原语：调色板、带纸边抖动的路径、剪纸填充（投影/描边/切口高光）、渐变、光效。
// 约定：所有函数只用传入的 g，不改全局状态（内部 save/restore）；路径返回 Path2D，可复用。
import { hash2, TAU, clamp, lerp, rgba, mixHex } from './util.js';

// ———————————————————— 调色板（改动须全片统一） ————————————————————
export const PAL = {
  // 纸与墨
  paper: '#F6EDDA', paper2: '#EADCBF', kraft: '#D5BC8E', kraftDark: '#B39565',
  ink: '#2C2233', inkSoft: '#56495E', shadow: '#2B1A24', white: '#FFFDF7',
  // 皇家红金
  red: '#D8473D', redDark: '#9F2C2C', redDeep: '#6E1F24', gold: '#F2B634', goldDark: '#C98A1B', goldLight: '#FFE28E',
  // 天空（昼 / 黄昏 / 夜 / 危急）
  skyDay: '#8FD0F2', skyDayLow: '#DDF1F7', skyDusk: '#F4A26F', skyDuskHigh: '#7E5C9F',
  skyNight: '#28325F', skyNightHigh: '#131937', skyDoom: '#6B2B4A', skyDoomLow: '#E0674A',
  // 自然
  meadow: '#93CF72', grass: '#62AE5E', grassDark: '#3E8A4F', forest: '#2F6B52', forestDeep: '#1E4A3C', leafLight: '#B9E08A',
  earth: '#B57D4C', wood: '#8C5B3C', woodDark: '#5F3C28', sand: '#E6C892', path: '#E9D3A4',
  stone: '#CFC6B6', stone2: '#ABA192', stoneDark: '#71685D', roof: '#4E6FA8', roofRed: '#C3533F',
  water: '#58AACB', waterDeep: '#2F6F99', snow: '#F8FBFF', ice: '#C3E5F3', snowShade: '#B9CFE6',
  mountain: '#7C8FB8', mountainFar: '#A9B8D6', mountainDark: '#4F5F86',
  // 角色
  skin: '#F8CDA6', skinShade: '#E7A985', blush: '#F2918C',
  heroBlue: '#3F70B8', heroBlueDark: '#2B4F87', scarf: '#E2493E', scarfDark: '#A9302D', heroHair: '#7B4A2B', boot: '#6A4431',
  steel: '#E0E9EF', steelDark: '#9BADB9', leather: '#9B6A42',
  princess: '#F39DB8', princessDark: '#D86C94', princessLight: '#FFD3E0', hairGold: '#F5C744', hairGoldDark: '#D39A22',
  robe: '#C8413B', robeDark: '#8E2A2A', ermine: '#FFF8EC', beard: '#F6F2EA',
  horse: '#FAF6EE', horseShade: '#DCD3C4', mane: '#E9C46A',
  dragon: '#6C4E9C', dragonDark: '#473271', dragonDeep: '#2E2050', dragonBelly: '#72D3C3', dragonWing: '#8E6CC0', dragonEye: '#FFD24A',
  fire: '#FF8B3D', fire2: '#FFD65E', fireDeep: '#E2462B', ember: '#FFB347',
  moon: '#FFF5D8', moonGlow: '#FFE7A3', magic: '#C2AEFF', crystal: '#7FE3E0',
  slime: '#8FDB6B', slimeDark: '#4FA24B', bat: '#5A4A7A',
  coin: '#F7C443', coinDark: '#D0922A', heart: '#F25C6E',
};

// ———————————————————— 路径 ————————————————————
/** 圆角矩形 Path2D。r 可为数字或 [tl,tr,br,bl]。 */
export function rr(x, y, w, h, r = 12) {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}

/** 纸边抖动的半径函数：θ → 1 + 起伏（由种子决定，稳定不闪）。 */
function edgeFn(seed, amp, freq = 3) {
  const k = [];
  for (let i = 0; i < 5; i++) k.push([freq + i * 1.7 + hash2(seed, i) * 1.3, hash2(seed + 11, i) * TAU, 1 / (1 + i * 0.8)]);
  const norm = k.reduce((s, q) => s + q[2], 0);
  return (a) => 1 + (amp * k.reduce((s, [f, ph, w]) => s + w * Math.sin(a * f + ph), 0)) / norm;
}

/**
 * 手剪椭圆：cx,cy 中心，rx,ry 半径。o: { seed, amp(相对抖动，默认 0.025), n(点数), rot(弧度), freq }
 */
export function blob(cx, cy, rx, ry = rx, o = {}) {
  const { seed = 1, amp = 0.025, n = 56, rot = 0, freq = 3 } = o;
  const f = edgeFn(seed, amp, freq);
  const p = new Path2D();
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, r = f(a);
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  smoothInto(p, pts, true);
  return p;
}

/**
 * 手剪多边形：points 为 [[x,y],...]。o: { seed, amp(像素，默认 1.6), step(细分步长), round(0..1 角部圆滑), closed }
 * 直边会被细分并沿法线轻微起伏，像剪刀剪出来的边。
 */
export function poly(points, o = {}) {
  const { seed = 1, amp = 1.6, step = 26, round = 0, closed = true } = o;
  const pts = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const k = Math.max(1, Math.round(len / step));
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const d = j === 0 ? 0 : amp * (hash2(seed * 13 + i, j) * 2 - 1);
      pts.push([lerp(x1, x2, t) + nx * d, lerp(y1, y2, t) + ny * d]);
    }
  }
  if (!closed) pts.push(points[n - 1]);
  const p = new Path2D();
  if (round > 0) smoothInto(p, pts, closed, round * 0.5);
  else { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); if (closed) p.closePath(); }
  return p;
}

/** 平滑曲线（Catmull-Rom → 三次贝塞尔）。o: { closed, tension(0..1，默认 0.5) } */
export function smooth(points, o = {}) {
  const p = new Path2D();
  smoothInto(p, points, o.closed ?? true, o.tension ?? 0.5);
  return p;
}

function smoothInto(p, pts, closed, tension = 0.5) {
  const n = pts.length;
  if (n < 2) return;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const s = tension / 3;
  p.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * s, p1[1] + (p2[1] - p0[1]) * s, p2[0] - (p3[0] - p1[0]) * s, p2[1] - (p3[1] - p1[1]) * s, p2[0], p2[1]);
  }
  if (closed) p.closePath();
}

/** 粗细变化的笔触（毛发、火焰须、藤蔓）：沿折线生成带宽度的闭合 Path2D。widths 为每点半宽或函数 (t)=>w */
export function ribbon(points, widths) {
  const n = points.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const w = typeof widths === 'function' ? widths(i / (n - 1)) : Array.isArray(widths) ? widths[i] : widths;
    const nx = (-dy / len) * w, ny = (dx / len) * w;
    L.push([points[i][0] + nx, points[i][1] + ny]);
    R.push([points[i][0] - nx, points[i][1] - ny]);
  }
  return smooth([...L, ...R.reverse()], { closed: true, tension: 0.4 });
}

// ———————————————————— 填充 ————————————————————
/** 当前变换的等效缩放（投影/描边在屏幕空间需要乘它）。 */
export function scaleOf(g) {
  const m = g.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

/**
 * 剪纸：填充 path。
 * o: { shadow: 纸片离底面的高度(px，0 不投影), shadowAlpha, stroke: 描边色, lw: 描边宽,
 *      rim: 切口高光色（顶部受光的一道细亮边）, rimW, alpha, blend }
 * fill 可为颜色、渐变或图案。
 */
export function cut(g, path, fill, o = {}) {
  const { shadow = 0, shadowAlpha = 0.3, stroke = null, lw = 3, rim = null, rimW = 3, alpha = 1, blend = null } = o;
  g.save();
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (blend) g.globalCompositeOperation = blend;
  if (shadow > 0) {
    const s = scaleOf(g);
    g.shadowColor = rgba(PAL.shadow, shadowAlpha);
    g.shadowBlur = shadow * 1.5 * s;
    g.shadowOffsetX = shadow * 0.35 * s;
    g.shadowOffsetY = shadow * 0.85 * s;
  }
  g.fillStyle = fill;
  g.fill(path);
  g.shadowColor = 'transparent';
  if (rim) {
    g.save();
    g.clip(path);
    g.translate(0, rimW * 0.9);
    g.lineWidth = rimW * 1.6;
    g.strokeStyle = rim;
    g.globalAlpha *= 0.7;
    g.stroke(path);
    g.restore();
  }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(path); }
  g.restore();
}

/** 在 path 内部画一层阴影色（受光面/背光面分色）：从 (x0,y0) 到 (x1,y1) 的线性渐变遮罩。 */
export function shade(g, path, color, x0, y0, x1, y1, a0 = 0.35, a1 = 0) {
  g.save();
  g.clip(path);
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, rgba(color, a0));
  grd.addColorStop(1, rgba(color, a1));
  g.fillStyle = grd;
  g.fill(path);
  g.restore();
}

// ———————————————————— 渐变 ————————————————————
const stopsOf = (stops) => (typeof stops[0] === 'string' ? stops.map((c, i) => [i / (stops.length - 1 || 1), c]) : stops);
/** 线性渐变。stops：['#a','#b',...] 均分，或 [[0,'#a'],[0.6,'#b'],...] */
export function lin(g, x0, y0, x1, y1, stops) {
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stopsOf(stops)) grd.addColorStop(clamp(o), c);
  return grd;
}
export function rad(g, x, y, r0, r1, stops) {
  const grd = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stopsOf(stops)) grd.addColorStop(clamp(o), c);
  return grd;
}

// ———————————————————— 光效 ————————————————————
/** 柔光斑（默认 screen 叠加）。 */
export function glow(g, x, y, r, color, alpha = 1, mode = 'screen') {
  if (alpha <= 0 || r <= 0) return;
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha *= clamp(alpha);
  g.fillStyle = rad(g, x, y, 0, r, [[0, rgba(color, 1)], [0.35, rgba(color, 0.45)], [1, rgba(color, 0)]]);
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

/** 放射光芒（圣光/爆点/升级）。o: { n, width(弧度), rot, color, alpha, r0, seed, jitter } */
export function rays(g, x, y, r, o = {}) {
  const { n = 12, width = 0.09, rot = 0, color = PAL.goldLight, alpha = 0.5, r0 = 0, seed = 3, jitter = 0.35, mode = 'screen' } = o;
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha *= clamp(alpha);
  g.fillStyle = rad(g, x, y, r0, r, [[0, rgba(color, 0.9)], [1, rgba(color, 0)]]);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (hash2(seed, i) - 0.5) * jitter * (TAU / n);
    const w = width * (0.6 + hash2(seed + 5, i) * 0.8);
    const rr_ = r * (0.7 + hash2(seed + 9, i) * 0.3);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    g.lineTo(x + Math.cos(a - w) * rr_, y + Math.sin(a - w) * rr_);
    g.lineTo(x + Math.cos(a + w) * rr_, y + Math.sin(a + w) * rr_);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** 四角星闪光。 */
export function sparkle(g, x, y, size, o = {}) {
  const { rot = 0, color = PAL.white, alpha = 1, thin = 0.22 } = o;
  if (size <= 0 || alpha <= 0) return;
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    g.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    const b = a + TAU / 8;
    g.lineTo(Math.cos(b) * size * thin, Math.sin(b) * size * thin);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** 手绘感线条（虚线路线、速度线、裂纹）。o: { seed, amp, lw, color, dash, cap, p(0..1 画到哪) } */
export function line(g, pts, o = {}) {
  const { seed = 1, amp = 1.2, lw = 4, color = PAL.ink, dash = null, cap = 'round', p = 1, alpha = 1 } = o;
  if (p <= 0) return;
  const jit = pts.map(([x, y], i) => [x + (hash2(seed, i) - 0.5) * amp * 2, y + (hash2(seed + 3, i) - 0.5) * amp * 2]);
  const path = smooth(jit, { closed: false, tension: 0.5 });
  g.save();
  g.globalAlpha *= alpha;
  g.lineWidth = lw; g.strokeStyle = color; g.lineCap = cap; g.lineJoin = 'round';
  if (dash) g.setLineDash(dash);
  if (p < 1) {
    // 按长度裁切：用虚线技巧（总长估算）
    let L = 0;
    for (let i = 1; i < jit.length; i++) L += Math.hypot(jit[i][0] - jit[i - 1][0], jit[i][1] - jit[i - 1][1]);
    L *= 1.05;
    if (dash) {
      // 虚线 + 生长：先裁剪到可见长度（用 clip 近似：沿路线的前 p 段点集）
      const k = Math.max(2, Math.ceil(jit.length * p));
      g.stroke(smooth(jit.slice(0, k), { closed: false }));
    } else {
      g.setLineDash([L * p, L * 2]);
      g.stroke(path);
    }
  } else g.stroke(path);
  g.restore();
}

/** 颜色工具（转出）：混色、带透明度。 */
export { rgba, mixHex };
