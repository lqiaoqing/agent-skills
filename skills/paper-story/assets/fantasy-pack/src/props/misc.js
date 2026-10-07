// 杂项道具：风滚草、花瓣与花瓣环、名字横幅、蝴蝶结、火焰字、火柱/火墙、形状烟花、讲故事人的手、
// 冲击环、声波、气球线、粒子外观回调（docs/assets.md 9.7）。另导出路径画符号 heartPath / starPath。
// 约定：drawXxx(g, o)，o.x/o.y 为锚点（各函数注明），o.s 缩放，o.rot 弧度，o.t 秒；纯函数、内部 save/restore。
import { PAL, blob, poly, rr, ribbon, smooth as smoothPath, cut, shade, lin, rad, glow, rays, sparkle, scaleOf } from '../core/paper.js';
import { clamp, lerp, TAU, hash2, noise1, fbm1, rgba, mixHex, fract, smoothstep, wobble } from '../core/util.js';
import { outBack, outExpo, outCubic, inOutCubic, inQuad, ez } from '../core/ease.js';
import { paperGlyph, glyphWidth, NAME_TIMES } from '../ui/type.js';
import { NAMES } from '../cues.js';
import { samplePath, pathAt, pathSlice, _rollV } from './paper.js';

const HALF_PI = Math.PI / 2;

// ———————————————————— 路径画符号 ————————————————————
const HEART_UNIT = (() => {
  const n = 96, raw = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    raw.push([16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]);
  }
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return raw.map(([x, y]) => [(x - (x0 + x1) / 2) / (x1 - x0), (y - (y0 + y1) / 2) / (y1 - y0)]);
})();
/** 心形 Path2D：(cx,cy) 为外接框中心，w×h，rot 弧度；round 0..1 往椭圆圆润化（花瓣用 0.3）。 */
export function heartPath(cx, cy, w, h = w * 0.9, rot = 0, round = 0) {
  const p = new Path2D();
  const c = Math.cos(rot), s = Math.sin(rot);
  const n = HEART_UNIT.length;
  HEART_UNIT.forEach(([ux, uy], i) => {
    const a = (i / n) * TAU;
    const ex = Math.sin(a) * 0.5, ey = -Math.cos(a) * 0.5 * 0.96 + 0.02;
    const x = lerp(ux, ex, round) * w, y = lerp(uy, ey, round) * h;
    const px = cx + x * c - y * s, py = cy + x * s + y * c;
    if (i) p.lineTo(px, py); else p.moveTo(px, py);
  });
  p.closePath();
  return p;
}
/** 圆角星形 Path2D：R 外半径，r 内半径，n 角，rot 第一个尖的方向（默认朝上），round 圆角 0..0.4。 */
export function starPath(cx, cy, R, r = R * 0.48, n = 5, rot = -HALF_PI, round = 0.16) {
  const P = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU, rr_ = i % 2 ? r : R;
    P.push([cx + Math.cos(a) * rr_, cy + Math.sin(a) * rr_]);
  }
  const p = new Path2D();
  const m = P.length;
  for (let i = 0; i < m; i++) {
    const a = P[(i - 1 + m) % m], b = P[i], c = P[(i + 1) % m];
    const k = round * (i % 2 ? 0.6 : 1);
    const p1 = [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k];
    const p2 = [b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k];
    if (i === 0) p.moveTo(p1[0], p1[1]); else p.lineTo(p1[0], p1[1]);
    p.quadraticCurveTo(b[0], b[1], p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

// ———————————————————— 火 ————————————————————
/** 小火星：芯 + 光晕。 */
function emberAt(g, x, y, r, a, col = PAL.fire2) {
  if (a <= 0.01 || r <= 0.15) return;
  g.save();
  g.globalAlpha *= clamp(a);
  g.fillStyle = rgba(PAL.fire, 0.32);
  g.beginPath(); g.arc(x, y, r * 2.6, 0, TAU); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.restore();
}

/** 一条摇曳的火舌（外 fire + 内 fire2），根部 (bx,by)，朝 ang 方向长 len。 */
function flameTongue(g, bx, by, len, w, ang, t, seed, outer = PAL.fire, inner = PAL.fire2) {
  if (len <= 1 || w <= 0.2) return;
  const n = 8, pts = [];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1);
    const sway = (noise1(t * 3.3 - u * 2.4 + seed * 1.37, seed) * 0.34 + Math.sin(t * 8.5 + seed * 2.1 - u * 4) * 0.08) * len * u;
    const d = len * u;
    pts.push([bx + ca * d - sa * sway, by + sa * d + ca * sway]);
  }
  const wf = (u) => w * Math.pow(1 - u, 0.9) * (0.72 + 0.28 * Math.sin(Math.min(1, u * 2.5) * HALF_PI));
  g.fillStyle = outer;
  g.fill(ribbon(pts, wf));
  const pts2 = pts.map(([px, py]) => [bx + (px - bx) * 0.68, by + (py - by) * 0.68]);
  g.fillStyle = inner;
  g.fill(ribbon(pts2, (u) => wf(u) * 0.5));
}

/**
 * 火焰字（D2）：display 字形 + 竖向渐变 fire2→fire→fireDeep + 上沿 3–5 条火舌 + screen 光晕 + 身后拖烟。
 * 锚 = 字形视觉中心。o: { x, y, ch, size=88（字号）, s, rot, t, vel:[vx,vy]（px/s，决定拖烟方向与火舌后掠）,
 *   heat 0..1.5（火势）, tongues=4, smoke 0..1, dissolve 0..1（散成火星淡出）, alpha, seed, family }
 * 返回 { top:[x,y] }（字顶，点呆毛用）。
 */
export function drawFireLetter(g, o = {}) {
  const { x = 0, y = 0, ch = '昆', size = 88, s = 1, rot = 0, t = 0, vel = [0, 0], heat = 1, seed = 1, smoke = 1, dissolve = 0, tongues = 4, family = 'display' } = o;
  const S = size * s;
  const top = [x, y - S * 0.5];
  const al = clamp(o.alpha ?? 1);
  if (al <= 0 || S <= 0) return { top };
  const d = clamp(dissolve);
  const sp = Math.hypot(vel[0], vel[1]);
  const fl = 1 + 0.07 * noise1(t * 11 + seed * 3.7, seed) + 0.04 * Math.sin(t * 27 + seed);
  const h = clamp(heat, 0, 1.5) * (1 - d * 0.75);
  g.save();
  g.translate(x, y);
  g.globalAlpha *= al;
  // 拖烟（世界方向，逆速度）
  if (smoke > 0 && sp > 30) {
    const ux = -vel[0] / sp, uy = -vel[1] / sp;
    const k = Math.min(1, sp / 900);
    const col = mixHex(PAL.inkSoft, PAL.stone2, 0.35);
    for (let j = 7; j >= 1; j--) {
      const dist = (0.25 + j * 0.27) * S * (0.45 + 0.55 * k);
      const px = ux * dist + noise1(t * 1.6 + j * 0.9, seed + 20) * S * 0.03 * j;
      const py = uy * dist - j * j * S * 0.009;
      const r = S * (0.13 + j * 0.042);
      g.fillStyle = rgba(col, 0.42 * (1 - j / 8.5) * smoke * Math.min(1, k * 1.4) * (1 - d));
      g.fill(blob(px, py, r, r * 0.86, { seed: seed * 7 + j, amp: 0.1, n: 20, rot: t * 0.8 + j }));
    }
  }
  g.rotate(rot);
  glow(g, 0, -S * 0.12, S * 1.3 * fl, PAL.fire, 0.5 * h);
  glow(g, 0, -S * 0.05, S * 0.72, PAL.fire2, 0.32 * h);
  // 火舌（先画，字压住根部）
  const lean = clamp(-vel[0] / 900, -0.9, 0.9);
  const nT = Math.round(clamp(tongues, 0, 6));
  for (let k = 0; k < nT; k++) {
    const u = nT === 1 ? 0.5 : k / (nT - 1);
    const bx = (u - 0.5) * S * 0.6 + (hash2(seed, k) - 0.5) * S * 0.08;
    const by = -S * 0.26 + Math.abs(u - 0.5) * S * 0.14;
    const len = S * (0.36 + 0.32 * hash2(seed + 3, k)) * fl * h * (0.82 + 0.18 * noise1(t * 4 + k * 3, seed + k));
    const ang = -HALF_PI + lean * 0.85 + (u - 0.5) * 0.55;
    flameTongue(g, bx, by, len, S * (0.1 + 0.035 * hash2(seed + 5, k)), ang, t + k * 0.37, seed * 13 + k);
  }
  // 字：深红纸边（底下更厚）→ 顶部亮边 → 渐变字面
  const ga = 1 - d;
  paperGlyph(g, ch, 0, S * 0.035, S, { family, fill: PAL.redDeep, edge: PAL.redDeep, edgeW: 0.075, alpha: ga });
  paperGlyph(g, ch, 0, -S * 0.022, S, { family, fill: PAL.goldLight, edge: null, alpha: ga });
  paperGlyph(g, ch, 0, 0, S, { family, fill: lin(g, 0, -S * 0.42, 0, S * 0.42, [[0, PAL.fire2], [0.45, PAL.fire], [1, PAL.fireDeep]]), edge: null, alpha: ga });
  glow(g, 0, -S * 0.1, S * 0.5, PAL.fire2, 0.2 * h * ga);
  // 上飘火星
  for (let j = 0; j < 5; j++) {
    const ph = fract(t * (0.7 + 0.3 * hash2(seed + 9, j)) + hash2(seed + 7, j));
    const ex = (hash2(seed + 8, j) - 0.5) * S * 0.8 + Math.sin(t * 3 + j) * S * 0.06 + lean * ph * S * 0.5;
    const ey = -S * 0.35 - ph * S * 0.95;
    emberAt(g, ex, ey, S * 0.03 * (1 - ph * 0.6), (1 - ph) * h);
  }
  // 散成火星
  if (d > 0) {
    for (let j = 0; j < 18; j++) {
      const q = clamp(d * 1.5 - hash2(seed + 32, j) * 0.5);
      if (q <= 0) continue;
      const sx0 = (hash2(seed + 30, j) - 0.5) * S * 0.7, sy0 = (hash2(seed + 31, j) - 0.5) * S * 0.7;
      emberAt(g, sx0 + (hash2(seed + 33, j) - 0.5) * S * 0.6 * q, sy0 - q * S * (0.5 + hash2(seed + 34, j) * 0.7), S * 0.032 * (1.2 - q), Math.sin(Math.PI * q));
    }
  }
  g.restore();
  return { top };
}

const FIRE_LAYERS = [
  // [颜色, 宽度比, 不透明度, 长度比, 边缘起伏]
  [PAL.fireDeep, 1.0, 0.96, 1.0, 0.34],
  [PAL.fire, 0.74, 1, 0.94, 0.3],
  [PAL.fire2, 0.46, 1, 0.8, 0.28],
  [PAL.goldLight, 0.2, 0.92, 0.45, 0.22],
];

/** 沿中线 cl 的多层火焰带（hw 每点半宽）；外缘是随火流前移的圆鼓包（扇贝边）；tipK 控制末端圆头伸出量（劈火时用小值）。 */
function flameBand(g, cl, hw, t, seed, mul = 1, tipK = 1) {
  const n = cl.length;
  if (n < 2) return;
  const nrm = cl.map((p, i) => {
    const a = cl[Math.max(0, i - 1)], b = cl[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  });
  const dist = [0], ph = [0];
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(cl[i][0] - cl[i - 1][0], cl[i][1] - cl[i - 1][1]);
    dist.push(dist[i - 1] + d);
    ph.push(ph[i - 1] + d / (44 + hw[i] * 0.95));
  }
  const SC = [0.24, 0.2, 0.14, 0.08];
  FIRE_LAYERS.forEach(([col, k, al, lf, amp], li) => {
    const m = Math.max(2, Math.round(n * lf));
    const top = [], bot = [];
    for (let i = 0; i < m; i++) {
      const u = i / (n - 1);
      const f = dist[i] / 90 - t * 4.6 + li * 1.7;
      const taper = li >= 2 ? Math.min(1, (m - 1 - i) / (m * 0.35) + 0.25) : 1;
      const w = hw[i] * k * mul * taper;
      const grow = 0.3 + 0.7 * Math.min(1, u * 1.6);
      const sct = Math.sqrt(Math.max(0, Math.sin(Math.PI * fract(ph[i] - t * 2.1 + li * 0.27 + seed * 0.13)))) * SC[li] * grow;
      const scb = Math.sqrt(Math.max(0, Math.sin(Math.PI * fract(ph[i] - t * 2.1 + li * 0.27 + 0.5 + seed * 0.13)))) * SC[li] * grow;
      const wt = w * (1 + amp * 0.7 * fbm1(f, seed + li * 7) * (0.4 + u) + sct);
      const wb = w * (1 + amp * 0.7 * fbm1(f + 9.1, seed + li * 7 + 3) * (0.4 + u) + scb);
      top.push([cl[i][0] + nrm[i][0] * wt, cl[i][1] + nrm[i][1] * wt]);
      bot.push([cl[i][0] - nrm[i][0] * wb, cl[i][1] - nrm[i][1] * wb]);
    }
    const e = m - 1;
    const tg = [nrm[e][1], -nrm[e][0]];
    const tipLen = hw[e] * k * mul * (0.7 + 0.4 * noise1(t * 5 + li * 2.3, seed + 40)) * (li >= 2 ? 1.3 : tipK);
    const tip = [cl[e][0] + tg[0] * tipLen, cl[e][1] + tg[1] * tipLen];
    g.fillStyle = rgba(col, al);
    g.fill(smoothPath([...top, tip, ...bot.reverse()], { closed: true, tension: 0.5 }));
  });
}

/** 沿中线外缘舔出的火舌（随火流向前漂、生长后熄灭），画在火焰带之前（根部被带子压住）。 */
function edgeTongues(g, center, hwAt, L, ux, uy, t, seed, count, scale = 1) {
  for (let j = 0; j < count; j++) {
    const ph = fract(t * (0.85 + 0.3 * hash2(seed + 90, j)) + hash2(seed + 91, j));
    const dd = L * clamp(0.06 + ph * 0.96 + (hash2(seed + 92, j) - 0.5) * 0.08);
    const c = center(dd), w = hwAt(dd);
    const side = j % 2 ? 1 : -1;
    const nx = -uy * side, ny = ux * side;
    let dx = nx * 0.8 - ux * 0.55, dy = ny * 0.8 - uy * 0.55 - 0.3;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const life = Math.sin(Math.PI * ph);
    const len = w * (0.55 + 0.6 * hash2(seed + 93, j)) * life * scale;
    flameTongue(g, c[0] + nx * w * 0.7, c[1] + ny * w * 0.7, len, w * 0.34 * scale * (0.6 + 0.4 * life), Math.atan2(dy, dx), t + j * 0.3, seed * 7 + j, j % 3 ? PAL.fire : PAL.fireDeep, PAL.fire2);
  }
}

/** 火流末端翻滚的火团（向前漂、上浮、膨胀后熄灭）。 */
function flamePuffs(g, tip, ux, uy, w, t, seed, n = 4) {
  for (let i = 0; i < n; i++) {
    const ph = fract(t * 1.4 + i / n + hash2(seed, i) * 0.2);
    const side = (hash2(seed + 1, i) - 0.5) * 1.4;
    const fwd = w * (0.1 + ph * 0.95);
    const px = tip[0] + ux * fwd - uy * side * w * 0.8, py = tip[1] + uy * fwd + ux * side * w * 0.8 - ph * w * 0.7;
    const r = w * (0.42 + 0.36 * Math.sin(Math.PI * ph));
    const a = 1 - ph * ph;
    [[PAL.fireDeep, 1], [PAL.fire, 0.74], [PAL.fire2, 0.45]].forEach(([c, k], li) => {
      g.fillStyle = rgba(c, a);
      g.fill(blob(px, py, r * k, r * k * 0.9, { seed: seed + i * 3 + li, amp: 0.1, n: 20, rot: t + i }));
    });
  }
}

/** 火墙（剪影段擦屏）：前沿一排向前上方舔的大火舌 + 身后渐变火幕。 */
function fireWall(g, o) {
  const { x = 960, y0 = -120, y1 = 1200, depth = 560, dir = -1, t = 0, seed = 7, intensity = 1 } = o;
  const back = x - dir * depth;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const edge = [];
  for (let yy = y0; yy <= y1 + 20; yy += 20) edge.push([x + dir * 26 * noise1(yy / 120 + t * 1.3, seed + 3), yy]);
  const tongue = (scale, outer, inner, sd) => {
    for (let yy = y0 - 30, j = 0; yy <= y1 + 60; yy += 52, j++) {
      const ty = yy + (hash2(seed + sd, j) - 0.5) * 30;
      const fl = 0.72 + 0.28 * noise1(t * 3.1 + j * 1.7, seed + sd);
      const len = (130 + 110 * hash2(seed + sd + 1, j)) * fl * scale * intensity;
      const ang = dir < 0 ? Math.PI + 0.62 + 0.12 * Math.sin(t * 2.3 + j) : -0.62 - 0.12 * Math.sin(t * 2.3 + j);
      flameTongue(g, x + dir * 6, ty, len, (34 + 14 * hash2(seed + sd + 2, j)) * scale, ang, t + j * 0.41, seed * 11 + j + sd, outer, inner);
    }
  };
  tongue(1, PAL.fireDeep, PAL.fire, 0);
  const body = new Path2D();
  edge.forEach(([ex, ey], i) => (i ? body.lineTo(ex, ey) : body.moveTo(ex, ey)));
  const tail = back - dir * 100;             // 火幕比 back 再多铺 100px，镜头在 back 处羽化遮罩也不会露底
  body.lineTo(tail, y1 + 20); body.lineTo(tail, y0); body.closePath();
  const [gy0, gy1] = o.bgY || [0, 1080];
  g.fillStyle = lin(g, 0, gy0, 0, gy1, [PAL.fire2, PAL.fire]);
  g.fill(body);
  g.fillStyle = lin(g, x, 0, x - dir * depth * 0.55, 0, [rgba(PAL.fire, 1), rgba(PAL.ember, 0.65), rgba(PAL.ember, 0)]);
  g.fill(body);
  tongue(0.55, PAL.fire, PAL.fire2, 40);
  g.fillStyle = lin(g, x, 0, x - dir * 160, 0, [rgba(PAL.goldLight, 0.0), rgba(PAL.goldLight, 0.55), rgba(PAL.goldLight, 0)]);
  g.fillRect(Math.min(x, x - dir * 160), y0, 160, y1 - y0);
  for (let k = 0; k < 7; k++) glow(g, x + dir * 60, lerp(y0, y1, (k + 0.5) / 7), 240, PAL.fire, 0.3 * intensity);
  for (let j = 0; j < 40; j++) {
    const ph = fract(t * 0.9 + hash2(seed + 70, j));
    const yy = lerp(y0, y1, hash2(seed + 71, j)) - ph * 160;
    const xx = x + dir * (60 + ph * 300 * (0.5 + hash2(seed + 72, j)));
    emberAt(g, xx, yy, 3 + hash2(seed + 73, j) * 3, (1 - ph) * intensity);
  }
  g.restore();
  return { edge, back, x };
}

/**
 * 火柱 / 火流 / 火墙。
 * 火流（默认）：从 from（龙嘴）喷向 to；o: { from:[x,y], to:[x,y], p 0..1（喷到哪）, w0=22（嘴部半宽）, w1=95（远端半宽）,
 *   t, seed, intensity 0..1.5, curve（中段弯曲 px）, rise=0.06（远端上浮比例）, split 0..1（被剑劈开：在 splitAt 处分成 V 字两股，间隙随 split 变宽）,
 *   splitAt:[x,y]（剑刃位置，默认 to）, splitAngle=0.62（最大张角弧度）, alpha }
 * 火墙：o.wall = true 或 { x（前沿）, y0, y1, depth=560, dir=−1（往左推进）, t, intensity, bgY=[0,1080] }；火幕身后 = lin(0,bgY0→0,bgY1,[fire2,fire])，
 *   剪影段背景用同一渐变即与火幕无缝。
 * 返回：火流 { tip:[x,y], split:[x,y]|null }；火墙 { edge:[[x,y]…]（火幕前沿折线）, back（火幕止于此 x，遮罩从这里接剪影画面）, x }。
 */
export function drawFireBreath(g, o = {}) {
  if (o.wall) return fireWall(g, o.wall === true ? o : { t: o.t, seed: o.seed, alpha: o.alpha, ...o.wall });
  const { from = [1400, 520], to = [600, 560], p = 1, w0 = 22, w1 = 95, t = 0, seed = 5, intensity = 1, split = 0, splitAngle = 0.62, curve = 0, rise = 0.06 } = o;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const D = Math.hypot(dx, dy) || 1, ux = dx / D, uy = dy / D, nx = -uy, ny = ux;
  const reach = D * clamp(p);
  const hwAt = (dd) => lerp(w0, w1, Math.pow(clamp(dd / D), 0.7)) * (0.85 + 0.15 * intensity);
  const center = (dd) => {
    const u = clamp(dd / D);
    const wig = noise1(dd / 170 - t * 2.4, seed) * hwAt(dd) * 0.22 + curve * Math.sin(Math.PI * u);
    return [from[0] + ux * dd + nx * wig, from[1] + uy * dd + ny * wig - rise * D * u * u];
  };
  const sp = o.splitAt || to;
  const sk = clamp(split);
  const ds = sk > 0 ? clamp((sp[0] - from[0]) * ux + (sp[1] - from[1]) * uy, 0, D) : Infinity;
  const mainLen = Math.min(reach, ds);
  if (reach <= 1 || (o.alpha ?? 1) <= 0) return { tip: from, split: null };
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  for (let k = 0; k < 6; k++) {
    const c = center(mainLen * (k + 0.5) / 6);
    glow(g, c[0], c[1], hwAt(mainLen * (k + 0.5) / 6) * 2.8, PAL.fire, 0.22 * intensity);
  }
  const N = Math.max(12, Math.min(110, Math.round(mainLen / 14)));
  const cl = [], hw = [];
  for (let i = 0; i < N; i++) { const dd = (mainLen * i) / (N - 1); cl.push(center(dd)); hw.push(hwAt(dd)); }
  edgeTongues(g, center, hwAt, mainLen, ux, uy, t, seed, Math.max(6, Math.round(mainLen / 55)));
  if (!(sk > 0 && reach > ds)) flamePuffs(g, center(mainLen), ux, uy, hwAt(mainLen), t, seed + 5);
  flameBand(g, cl, hw, t, seed, 1, sk > 0 && reach > ds ? 0.15 : 1);
  let splitPt = null;
  if (sk > 0 && reach > ds) {
    const Lb = (reach - ds) * (1 + 0.3 * sk);
    const c0 = center(ds), w = hwAt(ds);
    splitPt = c0;
    for (const side of [-1, 1]) {
      const gap = sk * w * 0.8;
      const bcl = [], bhw = [];
      const M = Math.max(12, Math.min(80, Math.round(Lb / 14)));
      const a0 = side * splitAngle * sk;
      const bdir = (u) => { const a = a0 * (0.55 + 0.45 * u); return [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)]; };
      for (let i = 0; i < M; i++) {
        const u = i / (M - 1);
        const [bx, by] = bdir(u);
        const dd = Lb * u;
        const wig = noise1(dd / 120 - t * 2.6 + side * 3, seed + 11) * w * 0.25;
        bcl.push([c0[0] + nx * side * gap + bx * dd - by * wig, c0[1] + ny * side * gap + by * dd + bx * wig - rise * Lb * u * u]);
        bhw.push(lerp(w * 0.6, w1 * 0.72, Math.pow(u, 0.8)));
      }
      const [bx1, by1] = bdir(0.6);
      const bc = (dd) => bcl[Math.min(M - 1, Math.round((dd / Lb) * (M - 1)))];
      const bw = (dd) => bhw[Math.min(M - 1, Math.round((dd / Lb) * (M - 1)))];
      edgeTongues(g, bc, bw, Lb, bx1, by1, t + side, seed + 30 + side, Math.max(4, Math.round(Lb / 60)), 0.9);
      const [bxe, bye] = bdir(1);
      flamePuffs(g, bcl[M - 1], bxe, bye, bhw[M - 1], t + side, seed + 40 + side, 3);
      flameBand(g, bcl, bhw, t + side * 0.37, seed + 20 + side);
    }
    glow(g, c0[0], c0[1], w * 2.6, PAL.goldLight, 0.8 * sk);
    rays(g, c0[0], c0[1], w * 2.4, { n: 9, width: 0.08, rot: t * 0.6, color: PAL.goldLight, alpha: 0.5 * sk, r0: w * 0.3, seed: seed + 3 });
    for (let j = 0; j < 14; j++) {
      const ph = fract(t * 2.2 + hash2(seed + 80, j));
      const a = Math.atan2(-uy, -ux) + (hash2(seed + 81, j) - 0.5) * 2.6;
      const r = w * (0.4 + ph * 2.2);
      emberAt(g, c0[0] + Math.cos(a) * r, c0[1] + Math.sin(a) * r - ph * 20, 2.5 + hash2(seed + 82, j) * 2.5, (1 - ph) * sk);
    }
  }
  for (let j = 0; j < 24; j++) {
    const ph = fract(t * 1.15 + hash2(seed + 60, j));
    const dd = mainLen * (0.08 + ph * 1.0);
    const c = center(Math.min(dd, mainLen)), w = hwAt(dd);
    const spread = (hash2(seed + 61, j) - 0.5) * 2;
    emberAt(g, c[0] + nx * spread * w * (1.1 + ph), c[1] + ny * spread * w * (1.1 + ph) - ph * 34, 2 + hash2(seed + 62, j) * 2.6, (1 - ph) * 0.95 * intensity);
  }
  g.restore();
  return { tip: center(mainLen), split: splitPt };
}

// ———————————————————— 风滚草 ————————————————————
const TW = Array.from({ length: 22 }, (_, i) => {
  // 随机大圆：法线 n → 圆上正交基 u, v
  const z = hash2(71, i) * 2 - 1, a = hash2(72, i) * TAU, q = Math.sqrt(1 - z * z);
  const n = [q * Math.cos(a), q * Math.sin(a), z];
  const h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [n[1] * h[2] - n[2] * h[1], n[2] * h[0] - n[0] * h[2], n[0] * h[1] - n[1] * h[0]];
  const ul = Math.hypot(...u); u = u.map((c) => c / ul);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { u, v, a0: hash2(74, i) * TAU, span: 3.4 + hash2(75, i) * 2.4, rr: 0.72 + hash2(76, i) * 0.3, w: 0.05 + hash2(78, i) * 0.03, col: i % 5 };
});
const TW_COL = [PAL.kraft, PAL.sand, PAL.paper2, PAL.earth, PAL.kraftDark];
const TW_BURNT = [PAL.inkSoft, PAL.ink, mixHex(PAL.woodDark, PAL.ink, 0.4), PAL.woodDark, mixHex(PAL.inkSoft, PAL.stoneDark, 0.5)];

/**
 * 纸风滚草（一团纸条缠成的球，前后两层有深浅）。锚 = 着地点（球底中心）。
 * o: { x, y, s, r=46, roll（滚过的角度，= 滚动距离 / r）, t, charred 0..1（I2 烧焦版：焦黑 + 余烬 + 冒烟）, squash（落地压扁 0..0.4）, shadow=true }
 */
export function drawTumbleweed(g, o = {}) {
  const { x = 0, y = 0, s = 1, r = 46, roll = 0, t = 0, charred = 0, squash = 0, seed = 2 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  const ch = clamp(charred);
  g.save();
  g.translate(x, y); g.scale(s, s);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  if (o.shadow !== false) {
    g.fillStyle = rgba(PAL.shadow, 0.22);
    g.beginPath(); g.ellipse(r * 0.12, 0, r * 0.85, r * 0.13, 0, 0, TAU); g.fill();
  }
  g.translate(0, -r * (1 - squash * 0.5));
  if (squash) g.scale(1 + squash * 0.6, 1 - squash);
  const col = (i) => mixHex(TW_COL[i % 5], TW_BURNT[i % 5], ch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // 每条纸条按大圆采样，切成后半（z<0）与前半两组
  const runs = [[], []];
  TW.forEach((st, i) => {
    let cur = null, curF = null;
    for (let j = 0; j <= 22; j++) {
      const th = st.a0 + (st.span * j) / 22;
      const px = (Math.cos(th) * st.u[0] + Math.sin(th) * st.v[0]) * r * st.rr;
      const py = (Math.cos(th) * st.u[1] + Math.sin(th) * st.v[1]) * r * st.rr;
      const pz = Math.cos(th) * st.u[2] + Math.sin(th) * st.v[2];
      const front = pz >= 0;
      if (front !== curF) { if (cur && cur.pts.length > 1) runs[curF ? 1 : 0].push(cur); cur = { pts: cur ? [cur.pts[cur.pts.length - 1]] : [], i }; curF = front; }
      cur.pts.push([px * cr - py * sr, px * sr + py * cr]);
    }
    if (cur && cur.pts.length > 1) runs[curF ? 1 : 0].push(cur);
  });
  const strip = (run, back) => {
    const st = TW[run.i];
    g.fillStyle = back ? mixHex(col(run.i), PAL.ink, 0.3 + ch * 0.1) : col(run.i);
    g.fill(ribbon(run.pts, (u) => st.w * r * (back ? 0.6 : 1) * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.05)))));
  };
  runs[0].forEach((rn) => strip(rn, true));
  g.fillStyle = rgba(mixHex(PAL.kraftDark, PAL.ink, ch), 0.3);
  g.fill(blob(0, 0, r * 0.66, r * 0.64, { seed: seed + 3, amp: 0.1, n: 26 }));
  runs[1].forEach((rn) => strip(rn, false));
  // 戳出来的小枝（带小叉）
  g.strokeStyle = mixHex(PAL.kraftDark, PAL.ink, ch); g.lineWidth = 1.8; g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = hash2(seed + 9, k) * TAU + roll, l0 = r * 0.72, l1 = r * (1.04 + hash2(seed + 10, k) * 0.2);
    const ex = Math.cos(a) * l1, ey = Math.sin(a) * l1;
    g.beginPath(); g.moveTo(Math.cos(a) * l0, Math.sin(a) * l0); g.lineTo(ex, ey);
    g.moveTo(Math.cos(a) * (l0 + l1) / 2, Math.sin(a) * (l0 + l1) / 2); g.lineTo(Math.cos(a + 0.3) * l1 * 0.98, Math.sin(a + 0.3) * l1 * 0.98);
    g.stroke();
  }
  if (ch > 0) {
    for (let k = 0; k < 9; k++) {
      const rn = runs[1][(k * 3) % Math.max(1, runs[1].length)];
      if (!rn) break;
      const pt = rn.pts[Math.floor(hash2(seed + 20, k) * rn.pts.length)];
      emberAt(g, pt[0], pt[1], 1.6 + hash2(seed + 21, k) * 1.4, ch * (0.5 + 0.5 * Math.sin(t * (5 + k) + k * 2)), k % 2 ? PAL.fire : PAL.ember);
    }
  }
  g.restore();
  if (ch > 0) {
    g.save();
    g.translate(x, y - r * s); g.scale(s, s);
    for (let k = 0; k < 4; k++) {
      const ph = fract(t * 0.55 + k / 4);
      const rr_ = r * (0.2 + ph * 0.35);
      g.fillStyle = rgba(PAL.inkSoft, 0.28 * ch * Math.sin(Math.PI * ph));
      g.fill(blob(Math.sin(t * 1.3 + k) * r * 0.2 + ph * r * 0.3, -r * 0.7 - ph * r * 1.5, rr_, rr_ * 0.85, { seed: seed + 30 + k, amp: 0.1, n: 18 }));
    }
    g.restore();
  }
}

// ———————————————————— 花瓣 ————————————————————
/**
 * 心形花瓣（可带一个字）。锚 = 花瓣中心。
 * o: { x, y, s, rot, size=90（宽）, ch, t, flip 0..1（绕竖轴翻转，过半露背面、字不镜像且隐去）, alpha,
 *      color=PAL.princess, light=PAL.princessLight, ink=PAL.princessDark, charSize（默认 size×0.64） }
 */
export function drawPetal(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, size = 90, ch = null, flip = 0, color = PAL.princess, light = PAL.princessLight, ink = PAL.princessDark } = o;
  if ((o.alpha ?? 1) <= 0 || s <= 0) return;
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot); g.scale(s, s);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const fx = Math.cos(Math.PI * clamp(flip));
  const backSide = fx < 0;
  g.scale(Math.max(0.02, Math.abs(fx)), 1);
  const w = size, h = size * 0.9;
  const heart = heartPath(0, 0, w, h, 0, 0.3);
  // 暗色错位底片（纸片厚度）
  g.fillStyle = rgba(mixHex(ink, PAL.shadow, 0.3), 0.35);
  g.save(); g.translate(w * 0.025, h * 0.04); g.fill(heart); g.restore();
  cut(g, heart, lin(g, 0, -h / 2, 0, h / 2, backSide ? [mixHex(light, PAL.white, 0.3), light] : [light, color]), { rim: PAL.white, rimW: size * 0.028 });
  shade(g, heart, ink, -w / 2, -h / 2, w / 2, h / 2, 0, backSide ? 0.12 : 0.3);
  g.strokeStyle = rgba(ink, 0.28); g.lineWidth = size * 0.022; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -h * 0.3); g.quadraticCurveTo(w * 0.04, h * 0.05, 0, h * 0.36); g.stroke();
  if (Math.abs(fx) < 0.999) shade(g, heart, PAL.ink, -w / 2, 0, w / 2, 0, 0.25 * (1 - Math.abs(fx)), 0);
  if (ch && !backSide) {
    const cs = o.charSize ?? size * 0.64;
    paperGlyph(g, ch, 0, -h * 0.05, cs, { fill: ink, edge: PAL.white, edgeW: 0.07 });
  }
  g.restore();
}

/**
 * E02 花瓣环：每片花瓣在轨道最前方正中诞生（顺序即阅读顺序），沿前沿向左转；后半圈缩到 0.7 并标记在身后；
 * crown 段轨道上升收紧，随后各瓣按阅读顺序飞到头顶一道从左往右读的弧上（花环）。
 * o: { cx, cy（轨道中心 = 她的腰部，世界坐标）, rx=320, ry=90, tilt=8°, times（默认 NAME_TIMES('E02')）, chars（默认公主全名）,
 *      omega（角速度，默认按 11 片铺满约 0.92 圈）, crown:{ t0=164.3, t1=164.9, cx, cy（花环弧心，默认 cy−250）, Rx=300, Ry=130（椭圆拱），scale=0.62 } }
 * 返回 [{ i, ch, x, y, s, rot, behind, depth(-1..1), born 0..1, visible }]（按 i 排序）。
 */
export function petalOrbit(T, o = {}) {
  const chars = o.chars ? [...o.chars] : [...NAMES.princess];
  const n = chars.length;
  const times = o.times || NAME_TIMES('E02');
  const { cx = 960, cy = 620, rx = 320, ry = 90, tilt = (8 * Math.PI) / 180 } = o;
  const step = n > 1 ? (times[n - 1] - times[0]) / (n - 1) : 0.3;
  const omega = o.omega ?? (TAU / (n * step)) * 0.92;
  const cr = { t0: 164.3, t1: 164.9, cx, cy: cy - 250, Rx: 300, Ry: 130, scale: 0.62, ...(o.crown || {}) };
  const kR = ez(T, cr.t0, cr.t1, inOutCubic);
  const ccx = lerp(cx, cr.cx, kR), ccy = lerp(cy, cr.cy + cr.Ry * 0.4, kR);
  const rxx = lerp(rx, cr.Rx * 0.9, kR), ryy = lerp(ry, cr.Ry * 0.3, kR), tl = lerp(tilt, 0, kR);
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = times[i];
    if (T < b) { out.push({ i, ch: chars[i], x: cx, y: cy + ry, s: 0, rot: 0, behind: false, depth: 1, born: 0, visible: false }); continue; }
    const age = T - b;
    const born = clamp(age / 0.3);
    const phi = HALF_PI + omega * age;
    const ox = rxx * Math.cos(phi), oy = ryy * Math.sin(phi);
    const rX = ccx + ox * Math.cos(tl) - oy * Math.sin(tl), rY = ccy + ox * Math.sin(tl) + oy * Math.cos(tl);
    const depth = Math.sin(phi);
    const st = Math.max(cr.t0 + 0.1 + i * 0.035, b + 0.14);
    const m = ez(T, st, st + 0.34, inOutCubic);
    const th = Math.PI + 0.22 + (Math.PI - 0.44) * (n > 1 ? i / (n - 1) : 0.5);
    const ax = cr.cx + cr.Rx * Math.cos(th), ay = cr.cy + cr.Ry * Math.sin(th);
    const lift = Math.sin(Math.PI * m) * 46;
    const sDepth = lerp(0.7, 1, (depth + 1) / 2);
    const pop = born >= 1 ? 1 : outBack(born, 2.4);
    out.push({
      i, ch: chars[i],
      x: lerp(rX, ax, m), y: lerp(rY, ay, m) - lift,
      s: lerp(sDepth, cr.scale, m) * pop,
      rot: lerp(Math.sin(T * 2.1 + i * 1.7) * 0.12, Math.atan2(cr.Ry * Math.cos(th), -cr.Rx * Math.sin(th)) * 0.45, m),
      behind: m < 0.5 && depth < 0,
      depth: lerp(depth, 1, m), born, visible: true,
    });
  }
  return out;
}

/** 按 petalOrbit 画花瓣：o.part 'back'（身后的）/ 'front' / 'all'；o.size=90；其余同 petalOrbit。 */
export function drawPetalOrbit(g, T, o = {}) {
  const items = petalOrbit(T, o).filter((it) => it.visible && (o.part === 'back' ? it.behind : o.part === 'front' ? !it.behind : true));
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) drawPetal(g, { x: it.x, y: it.y, s: it.s, rot: it.rot, ch: it.ch, size: o.size ?? 90, t: T, flip: 0 });
  return items;
}

// ———————————————————— 名字横幅 ————————————————————
export const BANNER_STYLES = {
  hero: { base: PAL.skyDayLow, edge: PAL.gold, ink: PAL.heroBlueDark, chars: NAMES.hero },
  princess: { base: PAL.red, edge: PAL.gold, ink: PAL.paper, chars: NAMES.princess },
};

/**
 * 名字横幅 / 竖幅：沿路径排字（竖直段字不转、从上往下；其余段旋转跟切线但夹在 ±15°，永远正立）。
 * path：控制点（起点 = 被拿着的一端；字从起点往末端按阅读顺序排）。
 * o: { style:'hero'|'princess', chars, size=64（字号）, width（带宽，默认 size×1.5）, grow 0..1（展开到哪，字随之露出）,
 *      appear:[0..1]（每字单独出现进度，覆盖 grow 推导）, retract 0..1（O01 卷尺式弹回起点），retractT（回弹开始后的秒数，脱落的字据此飘落）,
 *      retractDur=0.28, range:[u0,u1]（只画路径的一段：绕塔前后分层用）, gap, t, base/edge/ink（覆盖配色）, tail=true（末端燕尾）,
 *      backside=true（路径朝左走的段落视为横幅背面：字淡、镜像，像透过纸背看到的墨） }
 * 返回 { front:[x,y,ang]（展开前沿）, chars:[{x,y,rot,shown}] }。
 */
export function drawBanner(g, path, o = {}) {
  const st = BANNER_STYLES[o.style || 'hero'] || BANNER_STYLES.hero;
  const chars = [...(o.chars || st.chars)];
  const { size = 64, grow = 1, retract = 0, retractDur = 0.28, range = [0, 1], t = 0, seed = 9 } = o;
  const width = o.width ?? size * 1.5;
  const base = o.base || st.base, edge = o.edge || st.edge, ink = o.ink || st.ink;
  const gap = o.gap ?? size * 0.1;
  const sp = samplePath(path, 8);
  if (sp.total <= 0) return { front: [path[0][0], path[0][1], 0], chars: [] };
  const Lf = sp.total;
  const rk = clamp(retract);
  const front = Lf * clamp(grow) * (1 - rk);
  const rT = o.retractT ?? rk * retractDur;
  const s0 = Lf * clamp(range[0]), s1 = Math.min(Lf * clamp(range[1]), front);
  const hw = width / 2;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  // 带子
  if (s1 - s0 > 1) {
    const pts = pathSlice(sp, s0, s1).map((p) => [p[0], p[1]]);
    cut(g, ribbon(pts, hw + 5), edge, { rim: PAL.goldLight, rimW: 2 });
    const band = ribbon(pts, hw - 1);
    cut(g, band, base, { rim: mixHex(base, PAL.white, 0.45), rimW: 2.5 });
    g.save(); g.clip(band);
    // 缝线
    g.setLineDash([9, 7]); g.lineWidth = 2; g.strokeStyle = rgba(edge, 0.85);
    for (const side of [-1, 1]) {
      g.beginPath();
      pts.forEach((p, i) => {
        const nb = pts[Math.min(pts.length - 1, i + 1)], pb = pts[Math.max(0, i - 1)];
        const a = Math.atan2(nb[1] - pb[1], nb[0] - pb[0]);
        const off = side * (hw - 9);
        const xx = p[0] - Math.sin(a) * off, yy = p[1] + Math.cos(a) * off;
        if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
      });
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    // 末端：展开中 = 小卷筒；展开完 = 燕尾
    const fe = pathAt(sp, s1);
    if (s1 >= front - 0.5 && Lf * clamp(range[1]) >= front - 0.5) {
      if (grow < 1 && rk === 0) {
        g.save(); g.translate(fe[0], fe[1]); g.rotate(fe[2]);
        _rollV(g, 0, 0, width + 10, Math.max(6, width * 0.14), front / 12, { body: base, dark: mixHex(base, PAL.ink, 0.35), band: edge });
        g.restore();
      } else if (o.tail !== false) {
        g.save(); g.translate(fe[0], fe[1]); g.rotate(fe[2]);
        const L = width * 0.62;
        const sw = poly([[-2, -hw - 5], [L, -hw - 5], [L * 0.45, 0], [L, hw + 5], [-2, hw + 5]], { seed, amp: 0.8 });
        cut(g, sw, edge);
        const sw2 = poly([[-2, -hw + 1], [L - 8, -hw + 1], [L * 0.45 - 6, 0], [L - 8, hw - 1], [-2, hw - 1]], { seed: seed + 1, amp: 0.8 });
        cut(g, sw2, base);
        shade(g, sw2, PAL.ink, 0, 0, L, 0, 0, 0.2);
        g.restore();
      }
    }
  }
  // 字
  const out = [];
  let s = width * 0.42;
  for (let i = 0; i < chars.length; i++) {
    const a0 = pathAt(sp, s);
    const vert = Math.abs(Math.cos(a0[2])) < 0.45;
    const adv = vert ? size * 1.04 : glyphWidth(g, chars[i], size) + gap;
    const sc = s + adv / 2;
    s += adv;
    const pc = pathAt(sp, sc);
    let ang = pc[2];
    while (ang > Math.PI) ang -= TAU;
    while (ang < -Math.PI) ang += TAU;
    const v2 = Math.abs(Math.cos(ang)) < 0.45;
    let rot = 0;
    if (!v2) { if (ang > HALF_PI) ang -= Math.PI; else if (ang < -HALF_PI) ang += Math.PI; rot = clamp(ang, -0.26, 0.26); }
    const inRange = sc >= s0 && sc <= Lf * clamp(range[1]);
    const attached = sc <= front - size * 0.35;
    let q = o.appear ? clamp(o.appear[i] ?? 0) : clamp((front - sc) / (size * 0.9));
    if (rk > 0 && !attached) {
      // 回弹时脱落、旋转飘下
      const tau = retractDur * clamp(1 - sc / (Lf * clamp(grow) || 1));
      const age = rT - tau;
      if (age >= 0 && inRange) {
        const fx = pc[0] + (hash2(seed + 40, i) - 0.5) * 150 * age + Math.sin(age * 5 + i) * 18;
        const fy = pc[1] - 90 * age + 0.5 * 900 * age * age;
        const fr = rot + (hash2(seed + 41, i) - 0.5) * 9 * age;
        const fa = 1 - clamp((age - 0.7) / 0.6);
        paperGlyph(g, chars[i], fx, fy, size, { fill: ink, edge: base, edgeW: 0.1, rot: fr, alpha: fa, scale: Math.cos(age * (3 + hash2(seed + 42, i) * 5)) * 0.25 + 0.75 });
      }
      out.push({ x: pc[0], y: pc[1], rot, shown: false });
      continue;
    }
    if (!inRange || q <= 0 || !attached) { out.push({ x: pc[0], y: pc[1], rot, shown: false }); continue; }
    const pop = q >= 1 ? 1 : outBack(q, 2.2);
    const backSide = o.backside !== false && !v2 && Math.cos(pc[2]) < -0.3;
    if (backSide) paperGlyph(g, chars[i], pc[0], pc[1], size, { fill: mixHex(ink, base, 0.7), edge: null, rot, scale: pop, alpha: clamp(q * 3) * 0.55, mirror: true });
    else paperGlyph(g, chars[i], pc[0], pc[1], size, { fill: ink, edge: null, rot, scale: pop, alpha: clamp(q * 3) });
    out.push({ x: pc[0], y: pc[1], rot, shown: !backSide });
  }
  g.restore();
  return { front: pathAt(sp, front), chars: out };
}

// ———————————————————— 蝴蝶结 ————————————————————
/**
 * 婚礼大蝴蝶结（两条横幅系成）：左环 + 左尾 = 公主色，右环 + 右尾 = 勇者色。锚 = 结心。
 * o: { x, y, s, rot, t, pop 0..1（弹出：内部 outBack + 余振）, left=PAL.red, right=PAL.skyDayLow, edge=PAL.gold, alpha }
 * s=1 时约 330×260。
 */
export function drawBow(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, t = 0, pop = 1, left = PAL.red, right = PAL.skyDayLow, edge = PAL.gold, seed = 3 } = o;
  const pk = clamp(pop);
  if (pk <= 0 || (o.alpha ?? 1) <= 0) return;
  const k = pk >= 1 ? 1 : outBack(pk, 2.8);
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot); g.scale(s * k, s * k);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  // 尾巴（在环后）
  for (const side of [-1, 1]) {
    const col = side < 0 ? left : right;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const fl = Math.sin(t * 3.2 + u * 3.5 + side) * 10 * u + noise1(t * 1.4 + u * 2, seed + side) * 8 * u;
      pts.push([side * (10 + u * 52) + fl, 12 + u * 150]);
    }
    const w = (u) => 21 + u * 7;
    cut(g, ribbon(pts, (u) => w(u) + 4), edge);
    cut(g, ribbon(pts, w), col, { rim: mixHex(col, PAL.white, 0.4) });
    // 燕尾
    const e = pts[pts.length - 1], pe = pts[pts.length - 2];
    const a = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
    g.save(); g.translate(e[0], e[1]); g.rotate(a);
    cut(g, poly([[-4, -32], [22, -32], [8, 0], [22, 32], [-4, 32]], { seed: seed + side, amp: 0.6 }), col);
    g.restore();
  }
  // 两个环
  for (const side of [-1, 1]) {
    const col = side < 0 ? left : right;
    const br = 1 + 0.03 * Math.sin(t * 2.4 + side);
    const P = (px, py) => [side * px * br, py];
    const loop = smoothPath([P(6, -14), P(52, -78), P(128, -92), P(166, -36), P(150, 30), P(90, 40), P(30, 16)], { closed: true, tension: 0.55 });
    cut(g, loop, edge, { shadow: 3 });
    g.save(); g.translate(side * -3, 3); g.scale(0.94, 0.9);
    const inner = smoothPath([P(6, -14), P(52, -78), P(128, -92), P(166, -36), P(150, 30), P(90, 40), P(30, 16)], { closed: true, tension: 0.55 });
    cut(g, inner, col, { rim: mixHex(col, PAL.white, 0.45), rimW: 3 });
    shade(g, inner, PAL.ink, side * 20, -60, side * 150, 40, 0, 0.18);
    g.restore();
    // 环里的折痕（内侧暗面）
    const fold = smoothPath([P(26, -10), P(70, -46), P(120, -48), P(112, -6), P(68, 8)], { closed: true, tension: 0.5 });
    g.fillStyle = rgba(mixHex(col, PAL.ink, 0.45), 0.55);
    g.fill(fold);
  }
  // 结
  const knot = rr(-38, -38, 76, 74, 22);
  cut(g, knot, edge, { shadow: 3 });
  const knot2 = rr(-31, -32, 62, 62, 17);
  cut(g, knot2, mixHex(left, right, 0.5), { rim: PAL.white });
  g.fillStyle = left; g.fill(rr(-31, -32, 31, 62, [17, 0, 0, 17]));
  g.fillStyle = right; g.fill(rr(0, -32, 31, 62, [0, 17, 17, 0]));
  shade(g, knot2, PAL.ink, 0, -32, 0, 30, 0, 0.25);
  g.strokeStyle = rgba(PAL.ink, 0.25); g.lineWidth = 2;
  g.beginPath(); g.moveTo(-14, -22); g.quadraticCurveTo(-4, 0, -14, 20); g.moveTo(14, -22); g.quadraticCurveTo(4, 0, 14, 20); g.stroke();
  g.restore();
}

// ———————————————————— 形状烟花 ————————————————————
function shapePoint(shape, u) {
  if (shape === 'heart') {
    const a = u * TAU;
    const x = 16 * Math.sin(a) ** 3, y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    return [x / 34, (y + 2.5) / 32];
  }
  if (shape === 'star') {
    const n = 5, k = u * n * 2, i = Math.floor(k), f = k - i;
    const pt = (j) => { const a = -HALF_PI + (j / (n * 2)) * TAU, r = j % 2 ? 0.21 : 0.5; return [Math.cos(a) * r, Math.sin(a) * r]; };
    const a = pt(i), b = pt(i + 1);
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  }
  return [Math.cos(u * TAU) * 0.5, Math.sin(u * TAU) * 0.5];
}

/**
 * 爱心形 / 星形 / 圆形烟花：粒子从中心炸开后正好排成形状轮廓，再下坠淡出。锚 = 炸点。
 * o: { x, y, size=180（形状外接宽）, shape:'heart'|'star'|'ring', at（炸开时刻，与 t 同一时间轴）, t, count=48, colors, seed, rot, life=1.7, alpha }
 */
export function drawFireworkShape(g, o = {}) {
  const { x = 0, y = 0, size = 180, shape = 'heart', at = 0, t = 0, count = 48, seed = 3, rot = 0, life = 1.7 } = o;
  const colors = o.colors || (shape === 'heart' ? [PAL.heart, PAL.princess, PAL.goldLight] : [PAL.gold, PAL.goldLight, PAL.crystal]);
  const age = t - at;
  if (age < 0 || age > life + 0.2) return;
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const k = outExpo(clamp(age / 0.6));
  const fade = 1 - smoothstep(life * 0.55, life, age);
  if (age < 0.25) {
    glow(g, 0, 0, size * 0.6, PAL.goldLight, (1 - age / 0.25) * 0.9);
    sparkle(g, 0, 0, size * 0.25 * (1 - age / 0.25), { color: PAL.white });
  }
  const fall = 0.5 * 140 * Math.max(0, age - 0.45) ** 2;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5 * hash2(seed, i)) / count;
    const [sx, sy] = shapePoint(shape, u);
    const px = sx * size * k, py = sy * size * k + fall * (0.7 + 0.6 * hash2(seed + 1, i));
    const col = colors[i % colors.length];
    // 拖尾
    const k2 = outExpo(clamp((age - 0.07) / 0.6));
    const qx = sx * size * k2, qy = sy * size * k2 + fall * 0.8;
    g.strokeStyle = rgba(col, 0.7 * fade); g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(qx, qy); g.lineTo(px, py); g.stroke();
    const tw = 0.7 + 0.3 * Math.sin(t * 17 + i * 2.3);
    const sz = (10 + 6 * hash2(seed + 2, i)) * tw;
    g.fillStyle = rgba(col, 0.35 * fade);
    g.beginPath(); g.arc(px, py, sz * 0.75, 0, TAU); g.fill();
    sparkle(g, px, py, sz, { color: col, alpha: fade, rot: hash2(seed + 3, i), thin: 0.3 });
    g.fillStyle = rgba(PAL.white, 0.9 * fade);
    g.beginPath(); g.arc(px, py, 2.4, 0, TAU); g.fill();
  }
  g.restore();
}

// ———————————————————— 讲故事人的手 ————————————————————
const FINGERS = [
  // 小指 → 食指（屏幕左 → 右；拇指在右侧）：[基点 x, 基点 y, 长, 根宽, 张角]
  [-72, 50, 122, 44, -0.11],
  [-25, 64, 160, 49, -0.035],
  [24, 68, 174, 51, 0.025],
  [71, 54, 154, 48, 0.09],
];

/** 一根手指（手背视角，指尖朝 +y）：圆头渐细 + 指节纹 + 指甲；curl 0..1 指尖向下勾（grab）。 */
function finger(g, L, w, curl, skin, sh) {
  const wt = w * 0.86;
  const vl = L * (1 - curl * 0.48);
  const p = new Path2D();
  p.moveTo(-w / 2, -w * 0.5);
  p.bezierCurveTo(-w / 2 - 1.5, vl * 0.4, -wt / 2, vl * 0.72, -wt / 2, vl - wt / 2);
  p.arc(0, vl - wt / 2, wt / 2, Math.PI, 0, true);
  p.bezierCurveTo(wt / 2, vl * 0.72, w / 2 + 1.5, vl * 0.4, w / 2, -w * 0.5);
  p.closePath();
  cut(g, p, skin, { shadow: 2, rim: mixHex(skin, PAL.white, 0.45), rimW: 2 });
  shade(g, p, sh, -w / 2, 0, w / 2, vl, 0, 0.42);
  g.strokeStyle = rgba(sh, 0.7); g.lineWidth = 2.4; g.lineCap = 'round';
  if (curl > 0.3) {
    const cap = rr(-wt / 2 + 1, vl - wt * 0.95, wt - 2, wt * 0.95, wt * 0.45);
    cut(g, cap, mixHex(skin, sh, 0.55));
    g.beginPath(); g.arc(0, vl - wt * 0.95, wt * 0.36, 0.25, Math.PI - 0.25); g.stroke();
  } else {
    for (const k of [0.34, 0.62]) { g.beginPath(); g.arc(0, vl * k - w * 0.22, w * 0.24, 0.55, Math.PI - 0.55); g.stroke(); }
    cut(g, rr(-wt * 0.3, vl - wt * 0.98, wt * 0.6, wt * 0.62, wt * 0.27), mixHex(skin, PAL.white, 0.42), { rim: PAL.white, rimW: 1.5 });
  }
  return vl;
}

/**
 * 讲故事人的纸手（右手，手背朝上，从画面上方伸下来；inkSoft 袖口）。锚 = 手背中心；s=1 掌宽约 220、指尖到袖口约 480。
 * o: { x, y, s, rot, t, pose:'slap'（五指微张按下）|'grab'（四指勾住封面边、拇指收在下面）, press 0..1（按压：压扁 + 指缝张开）,
 *      sleeve=700（袖长，向上伸出画面）, alpha }
 * 返回 { palm, tips:[[x,y]…]（拇指 + 小指→食指，父坐标近似） }。
 */
export function drawHand(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, pose = 'slap', press = 0, sleeve = 700, seed = 15 } = o;
  const ret = { palm: [x, y], tips: [] };
  if ((o.alpha ?? 1) <= 0) return ret;
  const pr = clamp(press);
  const grab = pose === 'grab';
  const skin = PAL.skin, sh = PAL.skinShade;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const tp = (lx, ly) => [x + s * (lx * cr - ly * sr), y + s * (lx * sr + ly * cr)];
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot); g.scale(s, s);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.scale(1 + pr * 0.05, 1 - pr * 0.07);
  // 袖子
  const slv = mixHex(PAL.inkSoft, PAL.ink, 0.35);
  const sleeveP = poly([[-126, -196], [126, -196], [148, -196 - sleeve], [-148, -196 - sleeve]], { seed, amp: 1.5, step: 40 });
  cut(g, sleeveP, slv);
  shade(g, sleeveP, PAL.ink, -150, 0, 150, 0, 0, 0.35);
  // 拇指（压在掌下）
  {
    const [bx, by, L, w, a] = grab ? [86, -40, 96, 56, 1.25] : [86, -56, 132, 56, 0.88 + pr * 0.08];
    g.save(); g.translate(bx, by); g.rotate(-a);
    const vl = finger(g, L, w, grab ? 0.6 : 0, skin, sh);
    g.restore();
    ret.tips.push(tp(bx + Math.sin(a) * vl, by + Math.cos(a) * vl));
  }
  // 四指
  FINGERS.forEach(([bx, by, L, w, a0]) => {
    const a = a0 * (1 + pr * 0.7);
    g.save(); g.translate(bx, by); g.rotate(-a);
    const vl = finger(g, grab ? L * 0.62 : L, w, grab ? 1 : 0, skin, sh);
    g.restore();
    ret.tips.push(tp(bx + Math.sin(a) * vl, by + Math.cos(a) * vl));
  });
  // 手背（含手腕）
  const palm = smoothPath([[-74, -186], [74, -186], [90, -126], [110, -54], [108, 14], [98, 52], [56, 78], [2, 86], [-50, 78], [-92, 56], [-106, 14], [-102, -58], [-88, -128]], { closed: true, tension: 0.5 });
  cut(g, palm, skin, { shadow: 3, rim: mixHex(skin, PAL.white, 0.5), rimW: 3 });
  shade(g, palm, sh, -110, -186, 110, 86, 0, 0.5);
  // 指节高光 + 掌背筋
  FINGERS.forEach(([bx, by]) => {
    g.fillStyle = rgba(PAL.white, 0.22); g.beginPath(); g.ellipse(bx * 0.95, by - 12, 14, 9, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(sh, 0.55); g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.arc(bx * 0.95, by - 10, 11, 0.5, Math.PI - 0.5); g.stroke();
  });
  g.strokeStyle = rgba(sh, 0.3); g.lineWidth = 3;
  FINGERS.forEach(([bx, by]) => { g.beginPath(); g.moveTo(bx * 0.3, -140); g.quadraticCurveTo(bx * 0.6, -50, bx * 0.9, by - 26); g.stroke(); });
  // 袖口（压在手腕上）
  const cuff = rr(-138, -238, 276, 66, 24);
  cut(g, cuff, PAL.inkSoft, { shadow: 3, rim: mixHex(PAL.inkSoft, PAL.white, 0.35), rimW: 3 });
  g.save(); g.strokeStyle = rgba(PAL.paper2, 0.55); g.lineWidth = 2; g.setLineDash([8, 6]);
  g.beginPath(); g.moveTo(-126, -184); g.lineTo(126, -184); g.stroke(); g.restore();
  cut(g, blob(100, -205, 10, 10, { seed: seed + 2, n: 18 }), PAL.gold, { rim: PAL.goldLight, rimW: 2 });
  g.restore();
  return ret;
}

// ———————————————————— 冲击环 / 声波 / 气球线 ————————————————————
/**
 * 奶油纸冲击环（两圈墨线）。锚 = 圆心。o: { x, y, r=200, width（环宽，默认 r×0.1 夹 8–34）, alpha, lw=3.2, color=PAL.paper, ink=PAL.ink, squash=1（竖向压扁比） }
 */
export function drawShockRing(g, o = {}) {
  const { x = 0, y = 0, r = 200, alpha = 1, lw = 3.2, color = PAL.paper, ink = PAL.ink, squash = 1, seed = 4 } = o;
  if (alpha <= 0 || r <= 1) return;
  const wd = Math.min(o.width ?? clamp(r * 0.1, 8, 34), r * 0.9);
  const outer = blob(x, y, r, r * squash, { seed, amp: 0.016, n: 64 });
  const inner = blob(x, y, r - wd, (r - wd) * squash, { seed: seed + 1, amp: 0.02, n: 64 });
  const ring = new Path2D(); ring.addPath(outer); ring.addPath(inner);
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.fillStyle = rgba(PAL.shadow, 0.18);
  g.save(); g.translate(3, 5); g.fill(ring, 'evenodd'); g.restore();
  g.fillStyle = color; g.fill(ring, 'evenodd');
  g.strokeStyle = ink; g.lineWidth = lw; g.lineJoin = 'round';
  g.stroke(outer); g.lineWidth = lw * 0.7; g.stroke(inner);
  g.restore();
}

/**
 * 号声 / 钟声的声波弧线：n 道纸弧从发声点向 dir 方向一圈圈涌出（随 t 循环）。锚 = 发声点。
 * o: { x, y, dir（弧度，0 朝右）, spread=0.62（半张角）, n=3, r0=30, gap=38, t, speed=1.4, thick=9, color=PAL.paper, ink=PAL.ink, alpha, alphaBase=1 }
 * 透明度乘在调用方当前 globalAlpha 上（不覆盖）。
 */
export function drawSpeechWave(g, o = {}) {
  const { x = 0, y = 0, dir = 0, spread = 0.62, n = 3, r0 = 30, gap = 38, t = 0, speed = 1.4, thick = 9, color = PAL.paper, ink = PAL.ink, alpha = 1 } = o;
  if (alpha <= 0) return;
  const ph = fract(t * speed);
  g.save();
  const ga = g.globalAlpha;
  g.translate(x, y); g.rotate(dir);
  for (let k = 0; k < n; k++) {
    const q = (k + ph) / n;
    const r = r0 + gap * n * q;
    const a = alpha * Math.sin(Math.PI * clamp(q * 1.15));
    if (a <= 0.01) continue;
    const th = thick * (1 - q * 0.35);
    const sp2 = spread * (0.75 + 0.25 * q);
    const p = new Path2D();
    p.arc(0, 0, r + th / 2, -sp2, sp2);
    p.arc(0, 0, r - th / 2, sp2, -sp2, true);
    p.closePath();
    g.globalAlpha = ga * a * (o.alphaBase ?? 1);
    g.fillStyle = color; g.fill(p);
    g.strokeStyle = ink; g.lineWidth = 2.4; g.lineJoin = 'round'; g.stroke(p);
  }
  g.restore();
}

/**
 * 气球线：从 from 连到每个 to[i]（略下垂 + 随 t 摆动）；knot 0..1 让所有线先汇到 knotAt 缠成一个结。
 * o: { from:[x,y], to:[[x,y]…], knot 0..1, knotAt:[x,y]（默认 from 与气球群重心之间 35%）, t, color=PAL.inkSoft, lw=2.2, sag=0.1 }
 * 返回 { knot:[x,y] }。
 */
export function drawBalloonString(g, o = {}) {
  const { from = [0, 0], to = [], knot = 0, t = 0, color = PAL.inkSoft, lw = 2.2, sag = 0.1, seed = 5 } = o;
  if (!to.length) return { knot: from };
  const mx = to.reduce((a, p) => a + p[0], 0) / to.length, my = to.reduce((a, p) => a + p[1], 0) / to.length;
  const kp = o.knotAt || [lerp(from[0], mx, 0.35), lerp(from[1], my, 0.35)];
  const kk = clamp(knot);
  g.save();
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  to.forEach((p, i) => {
    const sw = Math.sin(t * 1.7 + i * 1.3) * 10;
    const L = Math.hypot(p[0] - from[0], p[1] - from[1]);
    const via = [lerp((from[0] + p[0]) / 2, kp[0], kk), lerp((from[1] + p[1]) / 2, kp[1], kk)];
    g.beginPath();
    g.moveTo(from[0], from[1]);
    if (kk > 0.02) {
      g.quadraticCurveTo(lerp(from[0], via[0], 0.5) + sw * 0.3, lerp(from[1], via[1], 0.5) + L * sag * 0.3, via[0], via[1]);
      g.quadraticCurveTo(lerp(via[0], p[0], 0.5) + sw, lerp(via[1], p[1], 0.5) + L * sag * 0.5, p[0], p[1]);
    } else {
      g.quadraticCurveTo((from[0] + p[0]) / 2 + sw, (from[1] + p[1]) / 2 + L * sag, p[0], p[1]);
    }
    g.stroke();
  });
  if (kk > 0.05) {
    const R = 5 + 9 * kk;
    g.lineWidth = lw * 1.1;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.ellipse(kp[0] + (hash2(seed, k) - 0.5) * R * 0.5, kp[1] + (hash2(seed + 1, k) - 0.5) * R * 0.5, R * (0.6 + hash2(seed + 2, k) * 0.4), R * (0.35 + hash2(seed + 3, k) * 0.3), hash2(seed + 4, k) * TAU + t * 0.3, 0, TAU);
      g.stroke();
    }
  }
  g.restore();
  return { knot: kp };
}

// ———————————————————— 粒子外观回调（给 burst / stream / field） ————————————————————
const CONF = [PAL.heart, PAL.gold, PAL.crystal, PAL.meadow];
const lifeA = (s, a = 0.8) => (s.p === undefined ? 1 : 1 - smoothstep(a, 1, s.p));
/** 彩纸：heart/gold/crystal/meadow，长条/方片/圆片，翻面时露出暗面。 */
export function confettiDraw(g, x, y, s) {
  const a = lifeA(s);
  if (a <= 0) return;
  const col = CONF[s.i % 4];
  const kind = Math.floor((s.r ?? 0.5) * 3);
  const sz = s.size || 10;
  const flipv = Math.cos((s.rot || 0) * 1.7 + s.i);
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y); g.rotate(s.rot || 0); g.scale(1, Math.max(0.12, Math.abs(flipv)));
  g.fillStyle = flipv < 0 ? mixHex(col, PAL.ink, 0.28) : col;
  if (kind === 0) g.fillRect(-sz * 0.65, -sz * 0.22, sz * 1.3, sz * 0.44);
  else if (kind === 1) g.fillRect(-sz * 0.4, -sz * 0.4, sz * 0.8, sz * 0.8);
  else { g.beginPath(); g.arc(0, 0, sz * 0.42, 0, TAU); g.fill(); }
  g.restore();
}
/** 火花 / 闪光：四角星（goldLight/白），随寿命缩小。 */
export function sparkDraw(g, x, y, s) {
  const a = lifeA(s, 0.5);
  if (a <= 0) return;
  const sz = (s.size || 10) * (s.p === undefined ? 1 : 1 - s.p * 0.6);
  sparkle(g, x, y, sz, { color: (s.r ?? 0) < 0.5 ? PAL.goldLight : PAL.white, alpha: a, rot: s.rot || 0 });
}
/** 雪：白点 + 右下 snowShade 错位（纸片感）。 */
export function snowDraw(g, x, y, s) {
  const a = lifeA(s);
  if (a <= 0) return;
  const r = (s.size || 6) * 0.5;
  g.save();
  g.globalAlpha *= a * (s.depth ? 0.6 + 0.4 * clamp(s.depth - 0.6) : 1);
  g.fillStyle = PAL.snowShade; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.35, r, 0, TAU); g.fill();
  g.fillStyle = PAL.snow; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.restore();
}
/** 灰尘：变大变淡的纸色烟团。 */
export function dustDraw(g, x, y, s) {
  const p = s.p ?? 0.3;
  const a = (1 - p) * 0.55;
  if (a <= 0) return;
  const r = (s.size || 12) * (0.6 + p * 1.2);
  g.save();
  g.fillStyle = rgba(mixHex(PAL.paper2, PAL.stone, (s.r ?? 0.5) * 0.6), a);
  g.beginPath(); g.ellipse(x, y, r, r * 0.8, s.rot || 0, 0, TAU); g.fill();
  g.restore();
}
/** 纸灰：翻滚的灰片，早期带一道焦橙边。 */
export function ashDraw(g, x, y, s) {
  const p = s.p ?? 0.3;
  const a = 1 - smoothstep(0.6, 1, p);
  if (a <= 0) return;
  const sz = s.size || 9;
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y); g.rotate(s.rot || 0); g.scale(Math.max(0.15, Math.abs(Math.cos((s.rot || 0) * 1.3))), 1);
  g.fillStyle = mixHex(PAL.inkSoft, PAL.stoneDark, s.r ?? 0.5);
  g.beginPath(); g.moveTo(-sz * 0.6, -sz * 0.3); g.lineTo(sz * 0.4, -sz * 0.5); g.lineTo(sz * 0.6, sz * 0.25); g.lineTo(-sz * 0.2, sz * 0.5); g.closePath(); g.fill();
  if (p < 0.45) {
    g.strokeStyle = rgba(PAL.fire, (0.45 - p) * 2); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(sz * 0.4, -sz * 0.5); g.lineTo(sz * 0.6, sz * 0.25); g.stroke();
  }
  g.restore();
}
/** 火星：fire2 芯 + fire 光晕，闪烁。 */
export function emberDraw(g, x, y, s) {
  const a = lifeA(s, 0.4) * (0.75 + 0.25 * Math.sin((s.age ?? 0) * 30 + s.i));
  emberAt(g, x, y, (s.size || 4) * 0.5 * (s.p === undefined ? 1 : 1 - s.p * 0.5), a, (s.r ?? 0) < 0.3 ? PAL.goldLight : PAL.fire2);
}
