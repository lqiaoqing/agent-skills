// 洞内道具：鸟笼（含剧场迷你偶）、金币、金币堆、石碑、铁链。
// 约定（docs/assets.md 9 节）：drawXxx(g, o)，o.x / o.y 为锚点（各函数注释写明锚在哪），o.s 缩放，o.rot 弧度，o.t 秒。
// 纯函数：只读参数、内部 save/restore、不调 ctx.layer / ctx.mask；只用 PAL；符号一律路径画。
// o.light 0..1 = 环境亮度（龙洞暗处 < 1 时颜色向 PAL.shadow 压暗；默认 1）。返回值是锚点对象（调用时的坐标系）。
import { PAL, blob, poly, rr, smooth as smoothPath, cut, shade, lin, rad, glow, sparkle, scaleOf } from '../core/paper.js';
import { clamp, lerp, seg, smoothstep, hash2, noise1, TAU, rgba, mixHex, fract } from '../core/util.js';
import { outBack, outCubic } from '../core/ease.js';
import { paperGlyph } from '../ui/type.js';

const DEG = Math.PI / 180;

// ———————————————————— 小工具 ————————————————————
/** 环境压暗：light 1 原色，0 几乎压到 PAL.shadow。 */
export const dimc = (c, light = 1) => (light >= 0.999 ? c : mixHex(c, PAL.shadow, clamp(1 - light) * 0.86));
/** 右下暗色错位（纸片分层），d = 纸片高度 px。 */
function under(g, path, d, a = 0.3) {
  g.save(); g.translate(d * 0.35, d * 0.85); g.fillStyle = rgba(PAL.shadow, a); g.fill(path); g.restore();
}
function ell(cx, cy, rx, ry = rx, rot = 0) { const p = new Path2D(); p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; }
/** 往 Path2D 里加一段（整圈或部分）椭圆，先 moveTo 起点开新子路径，避免和上一段连线。 */
function addEll(p, cx, cy, rx, ry, rot = 0, a0 = 0, a1 = TAU) {
  const c = Math.cos(rot), sn = Math.sin(rot), ex = rx * Math.cos(a0), ey = ry * Math.sin(a0);
  p.moveTo(cx + ex * c - ey * sn, cy + ex * sn + ey * c);
  p.ellipse(cx, cy, rx, ry, rot, a0, a1);
  if (a1 - a0 >= TAU - 1e-6) p.closePath();
}
function starPath(cx, cy, R, ri = R * 0.46, n = 5, rot = -Math.PI / 2) {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? ri : R;
    if (i) p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  p.closePath();
  return p;
}
/** 2D 仿射（换算锚点用）。 */
const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
  t: (x, y) => [1, 0, 0, 1, x, y],
  r: (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0],
  s: (sx, sy = sx) => [sx, 0, 0, sy, 0, 0],
  pt: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
};
const applyM = (g, m) => g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);

/** 折线按弧长重采样，返回 [{x,y,a}]（a 为切线角）。 */
function resample(pts, step) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const a = Math.atan2(y2 - y1, x2 - x1);
    let d = i === 1 ? 0 : step - acc;
    if (i === 1) { out.push({ x: x1, y: y1, a }); d = step; }
    while (d <= L) { out.push({ x: x1 + ((x2 - x1) * d) / L, y: y1 + ((y2 - y1) * d) / L, a }); d += step; }
    acc = L - (d - step);
  }
  return out;
}

// ———————————————————— 铁链 ————————————————————
/**
 * 铁链：沿折线 pts（调用方坐标）每节 9·s 交替画正面环与侧面环。
 * o: { s=1, light=1, gold=false（金链）, alpha=1 }。返回链节数。
 */
export function drawChain(g, pts, o = {}) {
  const { s = 1, light = 1, gold = false, alpha = 1 } = o;
  if (!pts || pts.length < 2) return 0;
  const links = resample(pts, 9 * s);
  const base = dimc(gold ? PAL.goldDark : mixHex(PAL.steelDark, PAL.inkSoft, 0.45), light);
  const hi = dimc(gold ? PAL.goldLight : PAL.steel, light);
  const dark = dimc(gold ? mixHex(PAL.goldDark, PAL.woodDark, 0.4) : PAL.ink, light);
  g.save();
  if (alpha !== 1) g.globalAlpha *= alpha;
  g.lineCap = 'round';
  for (let k = 0; k < links.length; k++) {
    const { x, y, a } = links[k];
    g.save(); g.translate(x, y); g.rotate(a);
    if (k % 2 === 0) {
      // 正面环：椭圆环（沿链方向长）
      g.lineWidth = 2.3 * s;
      g.strokeStyle = rgba(PAL.shadow, 0.35); g.beginPath(); g.ellipse(0.8 * s, 1.4 * s, 6.2 * s, 3.4 * s, 0, 0, TAU); g.stroke();
      g.strokeStyle = base; g.beginPath(); g.ellipse(0, 0, 6.2 * s, 3.4 * s, 0, 0, TAU); g.stroke();
      g.strokeStyle = hi; g.lineWidth = 0.9 * s; g.beginPath(); g.ellipse(0, 0, 6.2 * s, 3.4 * s, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    } else {
      // 侧面环：一根短条
      g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(rr(-6.6 * s + 0.8 * s, -1.4 * s + 1.4 * s, 13.2 * s, 2.8 * s, 1.4 * s));
      g.fillStyle = dark; g.fill(rr(-6.6 * s, -1.4 * s, 13.2 * s, 2.8 * s, 1.4 * s));
      g.fillStyle = hi; g.globalAlpha *= 0.8; g.fill(rr(-5.2 * s, -1.2 * s, 9 * s, 0.9 * s, 0.45 * s));
    }
    g.restore();
  }
  g.restore();
  return links.length;
}

// ———————————————————— 金币 ————————————————————
/** 咬口：以 (bx,by) 为心、半径 rb 的带牙印圆（扇贝边 = 一排牙印）。 */
function biteHole(bx, by, rb, sx = 1) {
  const p = new Path2D();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const r = rb * (1 + 0.13 * Math.abs(Math.sin(a * 4.5)));
    const px = bx + Math.cos(a) * r * sx, py = by + Math.sin(a) * r;
    if (i) p.lineTo(px, py); else p.moveTo(px, py);
  }
  p.closePath();
  return p;
}

/**
 * 金币。锚点 = 币心。
 * o: { x, y, s=1, r=18（s=1 半径）, rot, spin（弧度，绕竖轴自转：scaleX = cos，侧面露厚度）, bite 0..1（右上牙印咬口）,
 *      flash 0..1（左上四角星闪光 + 光晕）, light, alpha, t }
 * 返回 { x, y, r }。
 */
export function drawCoin(g, o = {}) {
  const { x = 0, y = 0, s = 1, r: R = 18, rot = 0, spin = 0, bite = 0, flash = 0, light = 1, alpha = 1, t = 0 } = o;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const sx = Math.max(0.035, Math.abs(cs));
  const th = R * 0.17, ex = sn * th;
  const cC = dimc(PAL.coin, light), cD = dimc(PAL.coinDark, light), cL = dimc(PAL.goldLight, light);
  const cE = dimc(mixHex(PAL.coinDark, PAL.woodDark, 0.3), light);
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(s, s);
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (bite > 0) {
    const bc = new Path2D();
    bc.rect(-R * 4, -R * 4, R * 8, R * 8);
    bc.addPath(biteHole(R * 0.72 * sx * Math.sign(cs || 1), -R * 0.6, R * 0.46 * clamp(bite), sx));
    g.clip(bc, 'evenodd');
  }
  // 厚度（边）
  if (sx < 0.995) {
    const ep = new Path2D();
    ep.ellipse(ex, th * 0.15, R * sx, R, 0, 0, TAU);
    ep.rect(Math.min(0, ex), -R, Math.abs(ex), R * 2);
    g.fillStyle = cE; g.fill(ep);
    g.save(); g.clip(ep);
    g.strokeStyle = rgba(PAL.goldLight, 0.35 * (light >= 0.5 ? 1 : light * 2)); g.lineWidth = 0.7;
    for (let k = -7; k <= 7; k++) { const yy = (k / 7.5) * R; g.beginPath(); g.moveTo(Math.min(0, ex) - R, yy); g.lineTo(Math.max(0, ex) + R, yy); g.stroke(); }
    g.restore();
  } else {
    g.fillStyle = rgba(PAL.shadow, 0.3); g.fill(ell(R * 0.06, R * 0.12, R, R));
  }
  // 正面（或背面）
  g.save();
  g.scale(sx, 1);
  const face = ell(0, 0, R, R);
  g.fillStyle = lin(g, -R, -R, R, R, [[0, mixHex(cC, cL, 0.35)], [0.55, cC], [1, mixHex(cC, cD, 0.55)]]);
  g.fill(face);
  g.lineWidth = R * 0.1; g.strokeStyle = cD;
  g.beginPath(); g.arc(0, 0, R * 0.84, 0, TAU); g.stroke();
  if (cs >= 0) {
    const st = starPath(0, 0, R * 0.44, R * 0.2);
    g.save(); g.translate(R * 0.05, R * 0.07); g.fillStyle = cD; g.fill(st); g.restore();
    g.fillStyle = mixHex(cC, cL, 0.55); g.fill(st);
  } else {
    // 背面：一圈小圆点 + 中心圆
    g.fillStyle = cD;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.beginPath(); g.arc(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58, R * 0.07, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU); g.fillStyle = mixHex(cC, cL, 0.5); g.fill();
  }
  g.lineWidth = R * 0.09; g.strokeStyle = cL; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, R * 0.93, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
  if (bite > 0) {
    // 咬口内沿一圈暗边（金币厚度）
    g.save();
    g.lineWidth = R * 0.12; g.strokeStyle = cE;
    g.stroke(biteHole(R * 0.72 * Math.sign(cs || 1), -R * 0.6, R * 0.46 * clamp(bite), 1));
    g.restore();
  }
  g.restore();
  if (flash > 0) {
    const f = clamp(flash);
    glow(g, -R * 0.35 * sx, -R * 0.45, R * 2.6 * f, PAL.goldLight, 0.75 * f);
    sparkle(g, -R * 0.35 * sx, -R * 0.45, R * 1.5 * f, { color: PAL.white, alpha: f, rot: t * 1.5 });
  }
  g.restore();
  return { x, y, r: R * s };
}

// ———————————————————— 金币堆 ————————————————————
const pileCache = new Map();
function pileGeom(w, h, peak, seed) {
  const key = `${w}|${h}|${peak}|${seed}`;
  let G = pileCache.get(key);
  if (G) return G;
  const px = -w / 2 + peak * w;
  const L = px + w / 2, Rr = w / 2 - px;
  const prof = (u) => {
    const v = u < px ? (px - u) / L : (u - px) / Rr;
    if (v >= 1) return 0;
    return h * Math.pow(1 - v * v, 1.35) * (1 + 0.06 * Math.sin(u * 0.031 + seed));
  };
  // 顶边上凸起的硬币边
  const bumps = [];
  for (let u = -w / 2 + 16, k = 0; u < w / 2 - 16; k++) {
    const pr = prof(u);
    if (pr > 10) bumps.push([u, 7 + hash2(seed, k) * 7, 2.5 + hash2(seed + 1, k) * 4.5]);
    u += 15 + hash2(seed + 2, k) * 12;
  }
  const topAt = (u) => {
    let y = prof(u);
    for (const [bu, br, bh] of bumps) { const d = (u - bu) / br; if (d > -1 && d < 1) y = Math.max(y, prof(bu) + bh * Math.sqrt(1 - d * d)); }
    return y;
  };
  const top = [];
  for (let u = -w / 2; u <= w / 2 + 0.01; u += 3) top.push([u, -topAt(u)]);
  const outline = new Path2D();
  outline.moveTo(-w / 2 - 6, 6);
  for (const [u, yy] of top) outline.lineTo(u, yy);
  outline.lineTo(w / 2 + 6, 6);
  outline.closePath();
  // 硬币鳞片：一行一行（后 → 前）
  const rows = [];
  let row = 0;
  for (let yy = -h + 5; yy < 4; yy += 8.2, row++) {
    const list = [];
    const off = (row % 2) * 10;
    for (let u = -w / 2 + off, k = 0; u < w / 2 + 10; u += 19.5, k++) {
      const j = hash2(seed * 7 + row, k);
      const uu = u + (j - 0.5) * 8;
      const surf = -prof(uu);
      if (yy < surf + 3) continue;
      const yj = yy + (hash2(seed + 5, row * 97 + k) - 0.5) * 3;
      const kind = j < 0.06 ? 'stand' : j > 0.95 ? 'face' : 'flat';
      list.push({ u: uu, y: yj, kind, rx: 12.5 + hash2(seed + 3, k + row * 13) * 4.5, ry: 5 + hash2(seed + 4, k + row * 7) * 2.4, rot: (hash2(seed + 6, k * 3 + row) - 0.5) * 0.38 });
    }
    if (!list.length) continue;
    const edge = new Path2D(), faceP = new Path2D(), hiP = new Path2D(), innerP = new Path2D();
    for (const c of list) {
      if (c.kind === 'stand') {
        addEll(edge, c.u + 2, c.y - 6, 4.2, 12.5, c.rot);
        addEll(faceP, c.u, c.y - 7, 4.2, 12.5, c.rot);
        hiP.moveTo(c.u - 1.2, c.y - 16); hiP.lineTo(c.u - 1.6, c.y - 2);
      } else if (c.kind === 'face') {
        addEll(edge, c.u + 1.5, c.y + 1.6, 12, 10, c.rot);
        addEll(faceP, c.u, c.y, 12, 10, c.rot);
        addEll(innerP, c.u, c.y, 8, 6.6, c.rot);
        addEll(hiP, c.u, c.y, 11, 9, c.rot, Math.PI * 1.1, Math.PI * 1.55);
      } else {
        addEll(edge, c.u, c.y + 2.6, c.rx, c.ry, c.rot);
        addEll(faceP, c.u, c.y, c.rx, c.ry, c.rot);
        addEll(hiP, c.u, c.y, c.rx * 0.82, c.ry * 0.7, c.rot, Math.PI * 1.08, Math.PI * 1.6);
      }
    }
    rows.push({ y: yy, edge, face: faceP, hi: hiP, inner: innerP, list });
  }
  // 宝石、高脚杯、珍珠串
  const gems = [];
  const gemCols = ['crystal', 'heart', 'magic', 'dragonBelly', 'crystal', 'heart', 'gold'];
  for (let k = 0; k < 7; k++) {
    const u = lerp(-w * 0.36, w * 0.4, (k + 0.3 + hash2(seed + 21, k) * 0.4) / 7);
    const surf = -prof(u);
    if (surf > -18) continue;
    gems.push({ u, y: surf + 10 + hash2(seed + 22, k) * Math.min(40, -surf * 0.5), r: 7 + hash2(seed + 23, k) * 5, col: gemCols[k], rot: (hash2(seed + 24, k) - 0.5) * 0.8 });
  }
  const gu = px - w * 0.15;
  const goblet = { u: gu, y: -prof(gu) + 4, rot: -0.22 };
  const pearls = [];
  for (let k = 0; k < 15; k++) {
    const u = px + w * 0.06 + k * 9.5;
    const sag = Math.sin((k / 14) * Math.PI) * 14;
    pearls.push([u, -prof(u) + 12 + sag]);
  }
  // 闪光点（挑上半部的硬币）
  const sparks = [];
  for (let k = 0; k < 14; k++) {
    const u = lerp(-w * 0.42, w * 0.42, hash2(seed + 31, k));
    const surf = -prof(u);
    if (surf > -12) continue;
    sparks.push({ u, y: surf + 6 + hash2(seed + 32, k) * Math.min(50, -surf * 0.7), per: 1.6 + hash2(seed + 33, k) * 1.6, ph: hash2(seed + 34, k), size: 9 + hash2(seed + 35, k) * 8 });
  }
  G = { px, prof, outline, rows, gems, goblet, pearls, sparks, w, h };
  pileCache.set(key, G);
  return G;
}

function gemPath(r) {
  const p = new Path2D();
  const n = 8;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + TAU / 16; const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.82; if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  p.closePath();
  return p;
}

/**
 * 金币堆。锚点 = 底边中心（落地点）。
 * o: { x, y, w=850, h=120, peak=0.53（峰在宽度上的相对位置）, s=1, seed=7, sparkleT（闪光时钟，传 T）, light=1, glint=1（闪光强度）,
 *      gems=true, alpha }
 * 龙洞里：x=1675, y=900, w=850, h=120, peak=0.53 → 峰 (1700,780)，depth 0.8（由 cave.js 调用）。
 * 返回 { peak:[x,y], left, right, top(u) }（top(u) = 相对 x 偏移 u 处的堆顶 y，调用方坐标）。
 */
export function drawCoinPile(g, o = {}) {
  const { x = 0, y = 0, w = 850, h = 120, peak = 0.53, s = 1, seed = 7, sparkleT = 0, light = 1, glint = 1, gems = true, alpha = 1 } = o;
  const G = pileGeom(w, h, peak, seed);
  const cC = dimc(PAL.coin, light), cD = dimc(PAL.coinDark, light), cL = dimc(PAL.goldLight, light);
  const cE = dimc(mixHex(PAL.coinDark, PAL.woodDark, 0.32), light);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  if (alpha !== 1) g.globalAlpha *= alpha;
  // 底片 + 投影
  under(g, G.outline, 6, 0.32);
  g.fillStyle = cE; g.fill(G.outline);
  g.save();
  g.clip(G.outline);
  for (const r of G.rows) {
    g.fillStyle = cE; g.fill(r.edge);
    g.fillStyle = cC; g.fill(r.face);
    g.fillStyle = cD; g.fill(r.inner);
    g.strokeStyle = cL; g.lineWidth = 1.6; g.lineCap = 'round'; g.stroke(r.hi);
  }
  // 整体明暗：左上受光、右下压暗、底部更暗
  g.fillStyle = lin(g, G.px - w * 0.3, -h, G.px + w * 0.45, 10, [[0, rgba(PAL.goldLight, 0.18)], [0.45, rgba(PAL.goldLight, 0)], [0.7, rgba(PAL.coinDark, 0)], [1, rgba(mixHex(PAL.coinDark, PAL.woodDark, 0.5), 0.45)]]);
  g.fillRect(-w / 2 - 10, -h - 20, w + 20, h + 30);
  g.fillStyle = lin(g, 0, -h * 0.35, 0, 6, [[0, rgba(PAL.shadow, 0)], [1, rgba(PAL.shadow, 0.42)]]);
  g.fillRect(-w / 2 - 10, -h * 0.35, w + 20, h * 0.35 + 8);
  g.restore();
  // 顶边切口亮边
  g.save(); g.clip(G.outline); g.translate(0, 2.4); g.lineWidth = 3; g.strokeStyle = rgba(cL, 0.7); g.stroke(G.outline); g.restore();
  if (gems) {
    // 珍珠串
    g.fillStyle = rgba(PAL.shadow, 0.3);
    for (const [u, yy] of G.pearls) { g.beginPath(); g.arc(u + 1, yy + 1.8, 3.6, 0, TAU); g.fill(); }
    for (const [u, yy] of G.pearls) {
      g.fillStyle = dimc(PAL.white, light); g.beginPath(); g.arc(u, yy, 3.6, 0, TAU); g.fill();
      g.fillStyle = dimc(PAL.stone, light); g.beginPath(); g.arc(u + 0.9, yy + 1.1, 2.2, 0, Math.PI); g.fill();
    }
    // 高脚杯（侧倒半埋）
    const gb = G.goblet;
    g.save(); g.translate(gb.u, gb.y); g.rotate(gb.rot);
    const cup = new Path2D();
    cup.moveTo(-17, -40); cup.lineTo(17, -40); cup.bezierCurveTo(17, -22, 10, -14, 3, -12); cup.lineTo(3, -2); cup.lineTo(11, 3); cup.lineTo(-11, 3); cup.lineTo(-3, -2); cup.lineTo(-3, -12); cup.bezierCurveTo(-10, -14, -17, -22, -17, -40); cup.closePath();
    under(g, cup, 3, 0.3);
    g.fillStyle = lin(g, -17, 0, 17, 0, [cL, cC, cD]); g.fill(cup);
    g.fillStyle = dimc(PAL.goldDark, light); g.fill(ell(0, -40, 17, 4.2));
    g.fillStyle = dimc(PAL.red, light); g.fill(ell(-1, -27, 3.6, 3.6));
    g.fillStyle = rgba(PAL.white, 0.6 * light); g.fill(ell(-2, -28.4, 1.2, 1.2));
    g.restore();
    // 宝石
    for (const gm of G.gems) {
      const col = dimc(PAL[gm.col], light);
      g.save(); g.translate(gm.u, gm.y); g.rotate(gm.rot);
      const gp = gemPath(gm.r);
      under(g, gp, 2.5, 0.35);
      g.fillStyle = col; g.fill(gp);
      g.fillStyle = rgba(PAL.white, 0.38 * light); g.fill(gemPath(gm.r * 0.5));
      g.save(); g.clip(gp);
      g.fillStyle = rgba(PAL.shadow, 0.35); g.beginPath(); g.moveTo(0, 0); g.lineTo(gm.r * 1.2, 0); g.lineTo(gm.r * 1.2, gm.r * 1.2); g.lineTo(0, gm.r * 1.2); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = rgba(PAL.white, 0.85 * light); g.fill(ell(-gm.r * 0.35, -gm.r * 0.32, gm.r * 0.22, gm.r * 0.12, -0.6));
      g.restore();
    }
  }
  // 金光反射与闪光
  if (light > 0.3) glow(g, G.px - w * 0.05, -h * 0.55, w * 0.42, PAL.goldLight, 0.13 * light * glint);
  if (glint > 0) {
    for (const sp of G.sparks) {
      const ph = fract(sparkleT / sp.per + sp.ph);
      if (ph > 0.16) continue;
      const k = Math.sin((ph / 0.16) * Math.PI);
      const a = glint * k * (0.35 + 0.65 * clamp(light * 1.4));
      sparkle(g, sp.u, sp.y, sp.size * k, { color: PAL.white, alpha: a, rot: 0.2 });
      glow(g, sp.u, sp.y, sp.size * 2.2 * k, PAL.goldLight, 0.5 * a);
    }
  }
  g.restore();
  const topY = (u) => y - G.prof(u / s) * s;
  return { peak: [x + G.px * s, y - h * s], left: [x - (w / 2) * s, y], right: [x + (w / 2) * s, y], top: topY };
}

/** 金币堆外轮廓（调用方坐标的 Path2D，参数同 drawCoinPile）：给镜头 / 布景做遮罩或压暗用。 */
export function coinPileShape(o = {}) {
  const { x = 0, y = 0, w = 850, h = 120, peak = 0.53, s = 1, seed = 7 } = o;
  const G = pileGeom(w, h, peak, seed);
  const p = new Path2D();
  p.addPath(G.outline, new DOMMatrix().translate(x, y).scale(s, s));
  return p;
}

// ———————————————————— 石碑 ————————————————————
const tabletCache = new Map();
function tabletGeom(S, seed) {
  const key = `${S}|${seed}`;
  let G = tabletCache.get(key);
  if (G) return G;
  const h = S / 2;
  const c = (k) => S * (0.035 + hash2(seed, k) * 0.085);
  const pts = [
    [-h + c(0), -S], [h - c(1) * 0.6, -S], [h, -S + c(1)], [h, -c(2) * 0.5], [h - c(2) * 0.6, 0], [-h + c(3) * 0.5, 0], [-h, -c(3) * 0.4], [-h, -S + c(0) * 1.1],
  ];
  // 中间多加几个崩口
  const body = poly(pts, { seed: seed * 3 + 1, amp: S * 0.011, step: S * 0.12, round: 0.18 });
  const inset = S * 0.1;
  const panel = rr(-h + inset, -S + inset, S - inset * 2, S - inset * 2, S * 0.05);
  // 裂纹：从顶边一点往下折线 + 两条分叉（局部坐标）
  const r = (k) => hash2(seed + 17, k);
  const x0 = (r(0) - 0.5) * S * 0.5;
  const main = [[x0, -S]];
  for (let k = 1; k <= 6; k++) main.push([x0 + (r(k) - 0.5) * S * 0.28 + (k * S * 0.02) * (r(9) > 0.5 ? 1 : -1), -S + (k / 6) * S * 0.86]);
  const b1 = [main[2], [main[2][0] - S * 0.22, main[2][1] + S * 0.14], [main[2][0] - S * 0.36, main[2][1] + S * 0.12]];
  const b2 = [main[4], [main[4][0] + S * 0.2, main[4][1] + S * 0.1], [main[4][0] + S * 0.34, main[4][1] + S * 0.22]];
  G = { body, panel, cracks: [main, b1, b2], S };
  tabletCache.set(key, G);
  return G;
}

function strokePart(g, pts, p) {
  // 折线前 p 部分
  if (p <= 0) return;
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = L * clamp(p);
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const k = Math.min(1, left / d);
    g.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k));
    left -= d;
  }
  g.stroke();
}

/**
 * D3 石碑（一块刻字石砖）。锚点 = 底边中心。
 * o: { x, y, size=200（边长）, char, glow 0..1（刻痕熔岩光）, crack 0..1（裂纹蔓延）, seed, rot, s, squash（落地挤压，>0 压扁）,
 *      light, alpha, t, clip（局部坐标 Path2D，碎片用：只画这块形状内）, charSize（默认 0.72·size） }
 * 字走 type.paperGlyph 的 'stone' 样式（刻槽 + 熔岩光）。返回 { top:[x,y], center:[x,y] }。
 */
export function drawStoneTablet(g, o = {}) {
  const { x = 0, y = 0, size: S = 200, char = '', glow: gk0 = 0, crack = 0, seed = 1, rot = 0, s = 1, squash = 0, light = 1, alpha = 1, t = 0, clip = null } = o;
  const G = tabletGeom(S, seed);
  const gk = clamp(gk0);
  const face = dimc(mixHex(PAL.stone2, PAL.dragonDark, 0.34), light);
  const faceHi = dimc(mixHex(PAL.stone, PAL.white, 0.12), light);
  const faceLo = dimc(mixHex(PAL.stoneDark, PAL.dragonDeep, 0.45), light);
  const side = dimc(mixHex(PAL.stoneDark, PAL.dragonDeep, 0.6), light);
  const flick = 0.85 + 0.15 * noise1(t * 3.1, seed);
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(s * (1 + squash * 0.5), s * (1 - squash));
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (clip) { g.clip(clip); g.clip(G.body); }
  else {
    // 厚度：右下错位的侧面 + 投影
    under(g, G.body, S * 0.05, 0.4);
    g.save(); g.translate(S * 0.035, S * 0.022); g.fillStyle = side; g.fill(G.body); g.restore();
  }
  // 正面
  g.fillStyle = lin(g, -S / 2, -S, S / 2, 0, [[0, mixHex(face, faceHi, 0.4)], [0.5, face], [1, mixHex(face, faceLo, 0.6)]]);
  g.fill(G.body);
  // 石纹：几道浅色斜纹
  g.save(); g.clip(G.body);
  g.strokeStyle = rgba(faceHi, 0.22); g.lineWidth = S * 0.012;
  for (let k = 0; k < 4; k++) {
    const yy = -S * (0.15 + 0.22 * k + hash2(seed + 40, k) * 0.08);
    g.beginPath(); g.moveTo(-S * 0.6, yy); g.bezierCurveTo(-S * 0.2, yy - S * 0.05, S * 0.15, yy + S * 0.06, S * 0.6, yy - S * 0.02); g.stroke();
  }
  // 斑点
  g.fillStyle = rgba(faceLo, 0.35);
  for (let k = 0; k < 9; k++) { const px = (hash2(seed + 50, k) - 0.5) * S * 0.86, py = -hash2(seed + 51, k) * S * 0.9 - S * 0.05; g.beginPath(); g.arc(px, py, S * (0.008 + hash2(seed + 52, k) * 0.014), 0, TAU); g.fill(); }
  g.restore();
  // 刻出的内框槽
  g.save();
  g.lineWidth = S * 0.018;
  g.translate(S * 0.006, S * 0.008); g.strokeStyle = rgba(faceHi, 0.55); g.stroke(G.panel);
  g.translate(-S * 0.012, -S * 0.014); g.strokeStyle = rgba(faceLo, 0.75); g.stroke(G.panel);
  g.restore();
  // 切口亮边 + 明暗
  g.save(); g.clip(G.body); g.translate(0, S * 0.014); g.lineWidth = S * 0.024; g.strokeStyle = rgba(faceHi, 0.65); g.stroke(G.body); g.restore();
  shade(g, G.body, PAL.dragonDeep, S * 0.5, 0, -S * 0.2, -S * 0.9, 0.35, 0);
  // 熔岩光从刻痕往外溢
  const cx = 0, cy = -S / 2;
  const cs = o.charSize ?? S * 0.72;
  if (char) {
    if (gk > 0) {
      g.save();
      g.shadowColor = rgba(PAL.fireDeep, 0.9 * gk * flick);
      g.shadowBlur = S * 0.08 * scaleOf(g);
      paperGlyph(g, char, cx, cy, cs, { family: 'display', fill: rgba(PAL.fire, 0.85 * gk), edge: null });
      g.restore();
    }
    paperGlyph(g, char, cx, cy, cs, { style: 'stone', glow: gk * flick, fill: dimc(PAL.dragonDeep, Math.max(light, 0.6)) });
    if (gk > 0) glow(g, cx, cy, S * 0.62, PAL.fire, 0.28 * gk * flick);
  }
  // 裂纹
  if (crack > 0) {
    g.save(); g.clip(G.body);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ps = [crack, clamp(crack * 1.6 - 0.4), clamp(crack * 1.6 - 0.6)];
    G.cracks.forEach((c, i) => {
      g.strokeStyle = rgba(PAL.shadow, 0.85); g.lineWidth = S * (i ? 0.012 : 0.018); strokePart(g, c, ps[i]);
      if (gk > 0) { g.strokeStyle = rgba(PAL.fire2, 0.9 * gk); g.lineWidth = S * (i ? 0.004 : 0.007); strokePart(g, c, ps[i]); }
    });
    g.restore();
  }
  if (clip) {
    // 碎片的断口：一道浅色石茬 + 熔岩光
    g.lineJoin = 'round';
    g.lineWidth = S * 0.035; g.strokeStyle = rgba(mixHex(PAL.stone, PAL.white, 0.25), 0.8 * Math.max(light, 0.4)); g.stroke(clip);
    g.lineWidth = S * 0.012; g.strokeStyle = rgba(PAL.fire, 0.7 * gk); g.stroke(clip);
  }
  g.restore();
  const k = s * (1 - squash);
  return { top: [x, y - S * k], center: [x, y - (S / 2) * k] };
}

// ———————————————————— 鸟笼 ————————————————————
/** 鸟笼几何（s=1，局部坐标，原点 = 笼心）。cave 布局：笼心 (1320,330)，吊环顶 = 笼心 + (0, ringTop)。 */
export const CAGE = {
  w: 180, h: 240, R: 90, apex: -120, shoulder: -40, mid: 30, baseTop: 96, baseBot: 120,
  ringC: -128, ringR: 7, ringTop: -135, lock: [-88, 22], floorY: 98,
  door: { top: -26, bot: 90, hinge: -75 * DEG, width: 2 * 90 * Math.sin(15 * DEG) },
  mini: { w: 120, h: 160, k: 120 / 180 },
};
const PERSP = 0.065; // 环的透视：环高 y 处，正面弧偏移 = PERSP·y·cosφ
const ringY = (yr, phi) => yr + PERSP * yr * Math.cos(phi);
const FRONT_PHI = [-80, -60, -40, -20, 0, 20, 40, 60, 80].map((d) => d * DEG);
const BACK_PHI = [110, 130, 150, 170, 190, 210, 230, 250].map((d) => d * DEG);

function barPoints(phi) {
  const R = CAGE.R, pts = [];
  const xs = R * Math.sin(phi);
  pts.push([xs, ringY(CAGE.baseTop, phi)]);
  pts.push([xs, lerp(ringY(CAGE.baseTop, phi), ringY(CAGE.shoulder, phi), 0.5)]);
  for (let k = 0; k <= 10; k++) {
    const b = (k / 10) * (Math.PI / 2), cb = Math.cos(b);
    pts.push([xs * cb, CAGE.shoulder - (CAGE.shoulder - CAGE.apex) * Math.sin(b) + PERSP * CAGE.shoulder * Math.cos(phi) * cb]);
  }
  return pts;
}
function ringArc(yr, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const p = lerp(a0, a1, i / n); pts.push([CAGE.R * Math.sin(p), ringY(yr, p)]); }
  return pts;
}
let cageGeomCache = null;
function cageGeom() {
  if (cageGeomCache) return cageGeomCache;
  const front = FRONT_PHI.map((p) => smoothPath(barPoints(p), { closed: false, tension: 0.5 }));
  const back = BACK_PHI.map((p) => smoothPath(barPoints(p), { closed: false, tension: 0.5 }));
  const ringF = [CAGE.shoulder, CAGE.mid].map((yr) => smoothPath(ringArc(yr, -Math.PI / 2, Math.PI / 2), { closed: false }));
  const ringB = [CAGE.shoulder, CAGE.mid].map((yr) => smoothPath(ringArc(yr, Math.PI / 2, Math.PI * 1.5), { closed: false }));
  // 底座前脸：上沿 = 底环正面弧，下沿 = 下环正面弧
  const top = ringArc(CAGE.baseTop, -Math.PI / 2, Math.PI / 2, 30), bot = ringArc(CAGE.baseBot, Math.PI / 2, -Math.PI / 2, 30);
  const band = new Path2D();
  band.moveTo(top[0][0], top[0][1]);
  for (const p of top) band.lineTo(p[0], p[1]);
  for (const p of bot) band.lineTo(p[0], p[1]);
  band.closePath();
  const floor = ell(0, CAGE.baseTop, CAGE.R, PERSP * CAGE.baseTop);
  // 底座下的扇贝裙边
  const skirt = new Path2D();
  for (let k = -6; k <= 6; k++) {
    const phi = (k / 6.6) * (Math.PI / 2);
    const cx = CAGE.R * Math.sin(phi), cy = ringY(CAGE.baseBot, phi);
    const rw = 7 * Math.cos(phi) + 1.5;
    skirt.moveTo(cx - rw, cy - 1); skirt.ellipse(cx, cy - 1, rw, 6.5, 0, 0, Math.PI); skirt.closePath();
  }
  cageGeomCache = { front, back, ringF, ringB, band, floor, skirt, top, bot };
  return cageGeomCache;
}

/** 金属丝笔触（纸条感）：右下暗色错位 + 主色 + 左上细高光。 */
function wire(g, path, lw, col, hi, dark, sh = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (sh > 0) { g.save(); g.translate(1.1 * sh, 2.1 * sh); g.lineWidth = lw * 1.08; g.strokeStyle = rgba(PAL.shadow, 0.34); g.stroke(path); g.restore(); }
  g.lineWidth = lw; g.strokeStyle = col; g.stroke(path);
  if (dark) { g.save(); g.translate(lw * 0.22, lw * 0.18); g.lineWidth = lw * 0.36; g.strokeStyle = dark; g.globalAlpha *= 0.55; g.stroke(path); g.restore(); }
  if (hi) { g.save(); g.translate(-lw * 0.24, -lw * 0.1); g.lineWidth = lw * 0.3; g.strokeStyle = hi; g.globalAlpha *= 0.9; g.stroke(path); g.restore(); }
}

/** 挂锁（局部坐标：锁体中心 (0,0)）。pins 0..3 已撬开的锁芯数，open 锁梁弹开。 */
function padlock(g, o) {
  const { pins = 0, open = false, light = 1, pinFlash = 0, k = 1 } = o;
  const gold = dimc(PAL.gold, light), dk = dimc(PAL.goldDark, light), lt = dimc(PAL.goldLight, light);
  const st = dimc(PAL.steel, light), stD = dimc(PAL.steelDark, light);
  g.save();
  g.scale(k, k);
  if (open) g.rotate(0.28);
  // 锁梁
  g.save();
  if (open) { g.translate(4, -5); g.rotate(-0.55); }
  const sh = new Path2D();
  sh.moveTo(-5.5, -6); sh.lineTo(-5.5, -12); sh.arc(0, -12, 5.5, Math.PI, 0); sh.lineTo(5.5, -6);
  g.lineCap = 'round';
  g.lineWidth = 3.4; g.strokeStyle = stD; g.stroke(sh);
  g.lineWidth = 1.2; g.strokeStyle = st; g.save(); g.translate(-0.8, -0.4); g.stroke(sh); g.restore();
  g.restore();
  // 锁体
  const body = rr(-11, -7, 22, 19, 4.5);
  under(g, body, 2.4, 0.4);
  g.fillStyle = lin(g, -11, -7, 11, 12, [lt, gold, dk]); g.fill(body);
  g.save(); g.clip(body); g.translate(0, 1.6); g.lineWidth = 2.2; g.strokeStyle = rgba(lt, 0.8); g.stroke(body); g.restore();
  // 锁孔
  g.fillStyle = dimc(PAL.ink, Math.max(light, 0.5));
  g.beginPath(); g.arc(0, 0.5, 2.6, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-1.4, 1.8); g.lineTo(1.4, 1.8); g.lineTo(2, 6.5); g.lineTo(-2, 6.5); g.closePath(); g.fill();
  // 三颗锁芯
  for (let i = 0; i < 3; i++) {
    const px = -6 + i * 6, py = 9;
    const on = i < pins;
    g.fillStyle = on ? PAL.goldLight : dk;
    g.beginPath(); g.arc(px, py, 1.7, 0, TAU); g.fill();
    if (on) glow(g, px, py, 6 + 6 * pinFlash, PAL.goldLight, 0.7);
  }
  g.restore();
}

/** “正”字刻痕：n 画（每 5 画一个正）。局部坐标 (x,y) 为第一个字框左上，box 字框边长。 */
function tally(g, n, x, y, box, light) {
  const strokes = [[[0.1, 0.08], [0.9, 0.08]], [[0.5, 0.08], [0.5, 0.94]], [[0.5, 0.5], [0.86, 0.5]], [[0.2, 0.46], [0.2, 0.94]], [[0.04, 0.94], [0.96, 0.94]]];
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const grp = Math.floor(i / 5), k = i % 5;
    const ox = x + grp * box * 1.32, oy = y;
    const [[a, b], [c, d]] = strokes[k];
    const jit = (hash2(i, 7) - 0.5) * box * 0.08;
    g.lineWidth = box * 0.13; g.strokeStyle = rgba(dimc(PAL.goldDark, light), 0.95);
    g.beginPath(); g.moveTo(ox + a * box + 0.6, oy + b * box + jit + 0.7); g.lineTo(ox + c * box + 0.6, oy + d * box - jit + 0.7); g.stroke();
    g.lineWidth = box * 0.075; g.strokeStyle = dimc(mixHex(PAL.goldLight, PAL.white, 0.45), light);
    g.beginPath(); g.moveTo(ox + a * box, oy + b * box + jit); g.lineTo(ox + c * box, oy + d * box - jit); g.stroke();
  }
  g.restore();
}

/**
 * 鸟笼。锚点 = 笼心（cave 里 (1320,330)）。s=1 时 180×240（含穹顶），吊环顶在笼心上方 135，笼底在下方 120；门在左侧。
 * o: { x, y, s=1, rot, part:'all'|'back'|'front'（back = 笼底 + 后排栏杆，front = 前排栏杆、环、底座、门、锁、刻痕；
 *        公主夹在两次调用之间画）, door 0..1（左侧门向外打开 0→115°）, lock:{ pins:0..3, open:false, flash:0..1 },
 *      tally（“正”字刻痕的笔画数，刻在笼底围带上）, onFloor（落地：接地投影 + 松垂的链子）, chain（吊环上方画多长的链，px，s=1）,
 *      swing（绕 pivot 摆动的弧度）, pivot:[x,y]（调用方坐标；默认链顶 / 吊环顶）, squash（落地挤压：>0 压扁、<0 拉长，以底座下沿为锚）,
 *      mini（剧场迷你偶 120×160，纸板镂空版）,
 *      stick（mini 的吊杆长度，默认 300）, light, alpha, t }
 * 返回 { ring:[x,y]（吊环顶）, floor:[x,y]（笼底中心 = 公主脚底）, lock:[x,y], door:[x,y]（门外沿中点）, center }。
 */
export function drawCage(g, o = {}) {
  if (o.mini) return drawCageMini(g, o);
  const { x = 0, y = 0, s = 1, rot = 0, part = 'all', door = 0, lock = {}, tally: nTally = 0, onFloor = false, chain = 0, swing = 0, squash = 0, light = 1, alpha = 1, t = 0 } = o;
  const G = cageGeom();
  const chainLen = chain === true ? 200 : chain || 0;
  // 变换：pivot 摆动 → 平移 → 旋转 → 缩放
  let m = M.t(x, y);
  if (swing) {
    const pv = o.pivot || [x, y + (CAGE.ringTop - chainLen) * s];
    m = M.mul(M.mul(M.mul(M.t(pv[0], pv[1]), M.r(swing)), M.t(-pv[0], -pv[1])), m);
  }
  if (rot) m = M.mul(m, M.r(rot));
  m = M.mul(m, M.s(s));
  if (squash) m = M.mul(M.mul(M.mul(m, M.t(0, CAGE.baseBot)), M.s(1 + squash * 0.5, 1 - squash)), M.t(0, -CAGE.baseBot));
  const gold = dimc(PAL.gold, light), gd = dimc(PAL.goldDark, light), gl = dimc(PAL.goldLight, light);
  const backCol = dimc(mixHex(PAL.goldDark, PAL.dragonDeep, 0.38), light);
  const th = clamp(door) * 115 * DEG;
  const xh = CAGE.R * Math.sin(CAGE.door.hinge);
  const xf = xh - CAGE.door.width * Math.sin(th);
  const lockPos = [lerp(CAGE.lock[0], xf - 2, clamp(door * 1.4)), CAGE.lock[1]];
  g.save();
  applyM(g, m);
  if (alpha !== 1) g.globalAlpha *= alpha;
  const doBack = part === 'all' || part === 'back', doFront = part === 'all' || part === 'front';
  if (doBack) {
    if (onFloor) { g.fillStyle = rgba(PAL.shadow, 0.38); g.fill(ell(6, CAGE.baseBot + 4, CAGE.R * 1.12, 9)); }
    // 笼底（上表面）
    g.fillStyle = dimc(mixHex(PAL.goldDark, PAL.dragonDeep, 0.5), light); g.fill(G.floor);
    g.fillStyle = rgba(PAL.shadow, 0.25); g.fill(ell(4, CAGE.baseTop + 1.5, CAGE.R * 0.8, PERSP * CAGE.baseTop * 0.7));
    // 后排环与栏杆
    for (const p of G.ringB) wire(g, p, 3.2, backCol, null, null, 0);
    for (const p of G.back) wire(g, p, 3.1, backCol, null, null, 0);
  }
  if (doFront) {
    // 前排栏杆（门所在的最左一根在开门时让位）
    G.front.forEach((p, i) => { if (i === 0 && door > 0.05) return; wire(g, p, 4.8, gold, gl, gd, 1); });
    // 环（肩环粗、中环细）
    wire(g, G.ringF[0], 6, gold, gl, gd, 1);
    wire(g, G.ringF[1], 4, gold, gl, gd, 1);
    // 底座围带
    under(g, G.band, 3, 0.35);
    g.fillStyle = lin(g, -CAGE.R, 0, CAGE.R, 0, [[0, gd], [0.2, gold], [0.36, mixHex(gold, gl, 0.6)], [0.62, gold], [1, gd]]);
    g.fill(G.band);
    g.save(); g.clip(G.band); g.translate(0, 2); g.lineWidth = 2.6; g.strokeStyle = rgba(gl, 0.85); g.stroke(G.band); g.restore();
    g.fillStyle = gd; g.fill(G.skirt);
    // 围带上的铆钉
    for (let k = -4; k <= 4; k++) {
      const phi = (k / 4.6) * (Math.PI / 2);
      const cx = CAGE.R * Math.sin(phi), cy = ringY(108, phi);
      const r = 2.4 * (0.55 + 0.45 * Math.cos(phi));
      g.fillStyle = gd; g.beginPath(); g.arc(cx + 0.6, cy + 0.8, r, 0, TAU); g.fill();
      g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    }
    if (nTally > 0) tally(g, Math.min(20, nTally), 14, 101.5, 11.5, light);
    // 穹顶尖饰 + 吊环
    const knob = blob(0, CAGE.apex - 1, 7.5, 6.5, { seed: 4, amp: 0.02 });
    under(g, knob, 2, 0.35);
    cut(g, knob, gold, { rim: gl, rimW: 1.6 });
    g.lineWidth = 3.4; g.strokeStyle = gd; g.beginPath(); g.arc(0.8, CAGE.ringC + 1.2, CAGE.ringR, 0, TAU); g.stroke();
    g.strokeStyle = gold; g.beginPath(); g.arc(0, CAGE.ringC, CAGE.ringR, 0, TAU); g.stroke();
    g.lineWidth = 1.1; g.strokeStyle = gl; g.beginPath(); g.arc(0, CAGE.ringC, CAGE.ringR, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    // 门
    const dTop = CAGE.door.top, dBot = CAGE.door.bot;
    if (door <= 0.05) {
      // 关着：左缘一道门框 + 两个合页
      const fr = new Path2D(); fr.moveTo(-86.6, dTop); fr.lineTo(-86.6, dBot);
      wire(g, fr, 3.2, gold, gl, gd, 1);
      for (const hy of [dTop + 8, dBot - 8]) { g.fillStyle = gd; g.fill(rr(-90.5, hy - 4, 8, 8, 2)); g.fillStyle = gl; g.fill(rr(-90, hy - 3.6, 3, 6.4, 1.5)); }
    } else {
      const wpx = xf - xh; // 负数：门板伸向左边
      const panel = new Path2D(); panel.rect(Math.min(xh, xf), dTop, Math.abs(wpx), dBot - dTop);
      g.fillStyle = rgba(PAL.shadow, 0.12); g.fill(panel);
      const fr = new Path2D();
      fr.moveTo(xh, dTop); fr.lineTo(xf, dTop + 3 * Math.sin(th)); fr.lineTo(xf, dBot - 3 * Math.sin(th)); fr.lineTo(xh, dBot);
      wire(g, fr, 3.6, gold, gl, gd, 1);
      for (let k = 1; k <= 2; k++) { const bx = lerp(xh, xf, k / 3); const b = new Path2D(); b.moveTo(bx, dTop + 2); b.lineTo(bx, dBot - 2); wire(g, b, 2.8, gold, gl, null, 1); }
      const hb = new Path2D(); hb.moveTo(xh, lerp(dTop, dBot, 0.5)); hb.lineTo(xf, lerp(dTop, dBot, 0.5)); wire(g, hb, 2.6, gold, null, null, 1);
      const hinge = new Path2D(); hinge.moveTo(xh, dTop - 2); hinge.lineTo(xh, dBot + 2); wire(g, hinge, 3.4, gold, gl, gd, 1);
    }
    // 锁扣 + 挂锁
    const [lx, ly] = lockPos;
    g.fillStyle = gd; g.fill(rr(lx - 3, ly - 15, 6, 9, 2));
    g.save(); g.translate(lx, ly); padlock(g, { pins: lock.pins || 0, open: !!lock.open, light, pinFlash: lock.flash || 0 }); g.restore();
  }
  // 链：吊着的直链 / 落地后松垂在一侧
  if (doFront && !onFloor && chainLen > 0) drawChain(g, [[0, CAGE.ringTop + 2], [0, CAGE.ringTop - chainLen]], { light });
  if (doFront && onFloor) drawChain(g, [[0, CAGE.ringTop + 1], [22, CAGE.ringTop - 6], [56, CAGE.ringTop + 14], [90, -70], [99, 20], [104, 108], [124, 121], [150, 119], [176, 122]], { light });
  g.restore();
  const P = (px, py) => M.pt(m, px, py);
  return { ring: P(0, CAGE.ringTop), floor: P(0, CAGE.floorY), lock: P(lockPos[0], lockPos[1]), door: P(xf, lerp(CAGE.door.top, CAGE.door.bot, 0.5)), center: P(0, 0) };
}

// 迷你偶几何（纸板镂空：7 根栏杆 = 卡纸上没剪掉的部分）
let miniCache = null;
function miniGeom() {
  if (miniCache) return miniCache;
  const R = 60, apex = -80, sh = -27, bt = 62, bb = 80, bw = 3.6;
  const xs = [-60, -40, -20, 0, 20, 40, 60];
  const sil = new Path2D();
  sil.moveTo(-R - 2, bb);
  sil.lineTo(-R - 2, sh);
  sil.ellipse(0, sh, R + 2, sh - apex + 2, 0, Math.PI, TAU);
  sil.lineTo(R + 2, bb);
  sil.closePath();
  // 镂空窗
  const win = new Path2D();
  const bands = [[sh + 5, 16], [22, bt - 3]];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i] + bw, b = xs[i + 1] - bw;
    for (const [y0, y1] of bands) { win.rect(a, y0, b - a, y1 - y0); }
    // 穹顶窗：两侧栏杆沿椭圆收拢
    const pts = [];
    const N = 10;
    let ok = true;
    for (let k = 0; k <= N; k++) {
      const be = (k / N) * 1.25;
      const cb = Math.cos(be), sb = Math.sin(be);
      const la = xs[i] * cb + bw, lb = xs[i + 1] * cb - bw;
      if (lb - la < 2.5) { ok = k > 1; break; }
      pts.push([la, lb, sh - 3 - (sh - apex) * sb]);
    }
    if (pts.length > 1 && ok) {
      win.moveTo(pts[0][0], pts[0][2]);
      for (const p of pts) win.lineTo(p[0], p[2]);
      for (let k = pts.length - 1; k >= 0; k--) win.lineTo(pts[k][1], pts[k][2]);
      win.closePath();
    }
  }
  const card = new Path2D();
  card.addPath(sil);
  card.addPath(win);
  const base = rr(-R - 6, bt, 2 * R + 12, bb - bt, 4);
  miniCache = { sil, win, card, base, R, apex, sh, bt, bb, xs };
  return miniCache;
}

function drawCageMini(g, o) {
  const { x = 0, y = 0, s = 1, rot = 0, part = 'all', door = 0, lock = {}, swing = 0, light = 1, alpha = 1, stick = 300 } = o;
  const G = miniGeom();
  let m = M.t(x, y);
  if (swing) { const pv = o.pivot || [x, y - (86 + stick) * s]; m = M.mul(M.mul(M.mul(M.t(pv[0], pv[1]), M.r(swing)), M.t(-pv[0], -pv[1])), m); }
  if (rot) m = M.mul(m, M.r(rot));
  m = M.mul(m, M.s(s));
  const gold = dimc(PAL.gold, light), gd = dimc(PAL.goldDark, light), gl = dimc(PAL.goldLight, light);
  const kraft = dimc(PAL.kraftDark, light);
  const th = clamp(door) * 115 * DEG;
  const dx0 = -60, dx1 = -26, dTop = -16, dBot = 58;
  g.save();
  applyM(g, m);
  if (alpha !== 1) g.globalAlpha *= alpha;
  const doBack = part === 'all' || part === 'back', doFront = part === 'all' || part === 'front';
  if (doBack) {
    // 吊杆（木签）+ 挂钩
    if (stick > 0) {
      g.fillStyle = rgba(PAL.shadow, 0.3); g.fill(rr(1.5, -86 - stick + 3, 5, stick, 2.5));
      g.fillStyle = dimc(PAL.wood, light); g.fill(rr(-2.5, -86 - stick, 5, stick, 2.5));
      g.fillStyle = dimc(mixHex(PAL.wood, PAL.white, 0.25), light); g.fill(rr(-2.2, -86 - stick, 1.6, stick, 0.8));
    }
    g.lineWidth = 2.6; g.strokeStyle = gd; g.beginPath(); g.arc(0, -86, 5, 0, TAU); g.stroke();
    // 笼内暗面（印着后排栏杆）
    g.fillStyle = rgba(dimc(mixHex(PAL.dragonDeep, PAL.ink, 0.3), light), 0.72); g.fill(G.sil);
    g.save(); g.clip(G.sil);
    g.strokeStyle = rgba(gd, 0.55); g.lineWidth = 2.2;
    for (const bx of [-50, -30, -10, 10, 30, 50]) { g.beginPath(); g.moveTo(bx, G.bt); g.lineTo(bx, G.sh); g.quadraticCurveTo(bx, G.apex + 4, 0, G.apex + 3); g.stroke(); }
    g.restore();
  }
  if (doFront) {
    // 门洞：开门后门板区域的栏杆被挪开
    g.save();
    if (door > 0.05) { const hole = new Path2D(); hole.rect(-400, -400, 800, 800); hole.rect(dx0 - 1, dTop, dx1 - dx0 + 1, dBot - dTop); g.clip(hole, 'evenodd'); }
    // 卡纸厚度（kraft 侧边）+ 投影
    g.save(); g.translate(1.6, 2.6); g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(G.card, 'evenodd'); g.restore();
    g.save(); g.translate(0.9, 1.4); g.fillStyle = kraft; g.fill(G.card, 'evenodd'); g.restore();
    g.fillStyle = lin(g, -G.R, G.apex, G.R, G.bb, [[0, mixHex(gold, gl, 0.45)], [0.5, gold], [1, gd]]);
    g.fill(G.card, 'evenodd');
    g.restore();
    // 门（关：印出的门框线；开：门板翻到左边）
    if (door <= 0.05) {
      g.strokeStyle = gd; g.lineWidth = 1.6; g.strokeRect(dx0 + 1.5, dTop, dx1 - dx0 - 1.5, dBot - dTop);
    } else {
      const wpx = (dx1 - dx0) * Math.sin(th);
      const dp = new Path2D(); dp.rect(dx0 - wpx, dTop, wpx, dBot - dTop);
      const dw = new Path2D(); dw.addPath(dp);
      for (let k = 0; k < 2; k++) dw.rect(dx0 - wpx + wpx * (0.1 + k * 0.48), dTop + 6, wpx * 0.34, dBot - dTop - 12);
      g.save(); g.translate(1.6, 2.6); g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(dw, 'evenodd'); g.restore();
      g.fillStyle = th > Math.PI / 2 ? kraft : gold; g.fill(dw, 'evenodd');
    }
    // 底座（单独一片厚卡纸）
    under(g, G.base, 3, 0.35);
    cut(g, G.base, lin(g, -G.R, 0, G.R, 0, [gd, gold, gd]), { rim: gl, rimW: 1.6 });
    for (let k = -3; k <= 3; k++) { g.fillStyle = gl; g.beginPath(); g.arc(k * 17, (G.bt + G.bb) / 2, 2, 0, TAU); g.fill(); }
    // 小挂锁
    const lx = door > 0.05 ? dx0 - (dx1 - dx0) * Math.sin(th) - 1 : dx0 + 1, ly = 18;
    g.save(); g.translate(lx, ly); padlock(g, { pins: lock.pins || 0, open: !!lock.open, light, pinFlash: lock.flash || 0, k: 0.8 }); g.restore();
  }
  g.restore();
  const P = (px, py) => M.pt(m, px, py);
  return { ring: P(0, -86), floor: P(0, G.bt), lock: P(dx0, 18), door: P(dx0, (dTop + dBot) / 2), center: P(0, 0), stickTop: P(0, -86 - stick) };
}
