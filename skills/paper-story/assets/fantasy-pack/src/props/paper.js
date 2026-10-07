// 纸制品：告示、卷轴、圣旨、大纸卷、纸卷塔、无限卷轴、片尾贴签（docs/assets.md 9.3）。
// 约定：drawXxx(g, o)，o.x/o.y 为锚点（每个函数写明锚在哪），o.s 缩放，o.rot 弧度，o.t 秒。
// 纯函数：只由参数决定画面；内部 save/restore；不调 ctx.layer/ctx.mask（图层投影与纸纹由镜头给）。
// 另导出路径工具 samplePath / pathAt / pathSlice（横幅、无限卷轴、圣旨下垂共用）。
import { PAL, blob, poly, rr, ribbon, cut, shade, lin, glow, sparkle, line, scaleOf } from '../core/paper.js';
import { clamp, lerp, seg, TAU, hash2, noise1, rgba, mixHex, hit, fract } from '../core/util.js';
import { outBack, outCubic, inOutCubic, outQuad, inQuad } from '../core/ease.js';
import { paperGlyph, glyphRow, glyphWidth } from '../ui/type.js';
import { NAMES } from '../cues.js';
import { PROJECT } from '../project.js';

// ———————————————————— 路径工具 ————————————————————
function crPoint(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
  const out = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
  if (p1.length > 2) out.push(lerp(p1[2], p2[2] ?? p1[2], u));
  return out;
}
/**
 * 控制点 → 按约 step 像素重采样的平滑折线（Catmull-Rom，过每个控制点）。
 * 控制点可带第三个分量（如宽度 w），会线性插值保留。返回 { pts, L(累计弧长), total }。
 */
export function samplePath(ctrl, step = 10) {
  const n = ctrl.length;
  if (n < 2) return { pts: ctrl.map((p) => [...p]), L: n ? [0] : [], total: 0 };
  const get = (i) => ctrl[Math.max(0, Math.min(n - 1, i))];
  const pts = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = get(i), p2 = get(i + 1);
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) pts.push(crPoint(get(i - 1), p1, p2, get(i + 2), j / k));
  }
  pts.push([...ctrl[n - 1]]);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, L, total: L[L.length - 1] };
}
/** 弧长 s 处：[x, y, 切线角, (w)]。 */
export function pathAt(sp, s) {
  const { pts, L } = sp;
  if (pts.length === 1) return [pts[0][0], pts[0][1], 0, pts[0][2]];
  s = clamp(s, 0, sp.total);
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  const k = (s - L[lo]) / (L[hi] - L[lo] || 1);
  const out = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.atan2(b[1] - a[1], b[0] - a[0])];
  if (a.length > 2) out.push(lerp(a[2], b[2], k));
  return out;
}
/** 截取弧长 [s0, s1] 的折线（端点插值）。 */
export function pathSlice(sp, s0, s1) {
  s0 = clamp(s0, 0, sp.total); s1 = clamp(s1, 0, sp.total);
  if (s1 <= s0) return [];
  const a = pathAt(sp, s0), b = pathAt(sp, s1);
  const out = [a.length > 3 ? [a[0], a[1], a[3]] : [a[0], a[1]]];
  for (let i = 0; i < sp.pts.length; i++) if (sp.L[i] > s0 + 0.5 && sp.L[i] < s1 - 0.5) out.push(sp.pts[i]);
  out.push(b.length > 3 ? [b[0], b[1], b[3]] : [b[0], b[1]]);
  return out;
}

// ———————————————————— 小部件 ————————————————————
const HALF_PI = Math.PI / 2;
const begin = (g, o) => {
  g.save();
  g.translate(o.x || 0, o.y || 0);
  if (o.rot) g.rotate(o.rot);
  const s = o.s ?? 1;
  if (s !== 1) g.scale(s, s);
  if (o.alpha !== undefined && o.alpha !== 1) g.globalAlpha *= clamp(o.alpha);
};
/** 局部点 → 父坐标（只计平移/旋转/缩放）。 */
const toParent = (o, lx, ly) => {
  const s = o.s ?? 1, r = o.rot || 0, c = Math.cos(r), sn = Math.sin(r);
  return [(o.x || 0) + s * (lx * c - ly * sn), (o.y || 0) + s * (lx * sn + ly * c)];
};

/** 图钉（俯视）：p 0..1 按下进度（大→小、淡入）。 */
function pushPin(g, x, y, p = 1, col = PAL.red) {
  if (p <= 0) return;
  const k = 1 + 0.7 * (1 - outCubic(clamp(p)));
  g.save();
  g.globalAlpha *= clamp(p * 3);
  g.translate(x, y); g.scale(k, k);
  g.fillStyle = rgba(PAL.shadow, 0.28);
  g.beginPath(); g.ellipse(3.2, 4.2, 9.5, 8, 0, 0, TAU); g.fill();
  cut(g, blob(0, 0, 9.5, 9.5, { seed: 41, amp: 0.02, n: 24 }), col);
  shade(g, blob(0, 0, 9.5, 9.5, { seed: 41, amp: 0.02, n: 24 }), PAL.redDeep, -6, -6, 7, 8, 0, 0.55);
  g.fillStyle = rgba(PAL.white, 0.85);
  g.beginPath(); g.ellipse(-3, -3.2, 3.2, 2.4, -0.6, 0, TAU); g.fill();
  g.restore();
}

/** 金币图标（正面）。 */
function coinIcon(g, x, y, r) {
  cut(g, blob(x, y, r, r, { seed: 9, amp: 0.012, n: 28 }), PAL.coin, { rim: PAL.goldLight, rimW: r * 0.12 });
  g.save();
  g.lineWidth = r * 0.14; g.strokeStyle = PAL.coinDark;
  g.beginPath(); g.arc(x, y, r * 0.68, 0, TAU); g.stroke();
  g.fillStyle = PAL.coinDark;
  g.beginPath();
  g.moveTo(x, y - r * 0.36); g.lineTo(x + r * 0.22, y); g.lineTo(x, y + r * 0.36); g.lineTo(x - r * 0.22, y); g.closePath();
  g.fill();
  g.restore();
}

/** 横放的纸卷筒（圆柱，轴沿 x）：中心 (cx, cy)，长 w，半径 r，spin 转角（端面螺旋转）。 */
function rollH(g, cx, cy, w, r, spin = 0, o = {}) {
  const { body = PAL.paper, dark = PAL.kraftDark, band = null, caps = true } = o;
  const body2 = mixHex(body, PAL.kraft, 0.18);
  const p = rr(cx - w / 2, cy - r, w, r * 2, r * 0.55);
  g.save();
  g.fillStyle = lin(g, 0, cy - r, 0, cy + r, [[0, mixHex(body, PAL.white, 0.6)], [0.25, body], [0.62, mixHex(body, PAL.kraft, 0.35)], [1, mixHex(dark, PAL.ink, 0.1)]]);
  g.fill(p);
  if (band) {
    g.save(); g.clip(p);
    g.fillStyle = rgba(band, 0.85);
    g.fillRect(cx - w / 2 + 7, cy - r, 4, r * 2);
    g.fillRect(cx + w / 2 - 11, cy - r, 4, r * 2);
    g.restore();
  }
  // 卷层细线（随转角滚动）
  g.save(); g.clip(p);
  g.strokeStyle = rgba(dark, 0.28); g.lineWidth = Math.max(0.8, r * 0.06);
  for (let k = 0; k < 4; k++) {
    const a = fract(spin / TAU + k / 4) * Math.PI - HALF_PI;
    if (Math.abs(a) > 1.35) continue;
    const yy = cy + Math.sin(a) * r;
    g.globalAlpha = 0.6 * Math.cos(a);
    g.beginPath(); g.moveTo(cx - w / 2 + 4, yy); g.lineTo(cx + w / 2 - 4, yy); g.stroke();
  }
  g.restore();
  if (caps) {
    for (const sx of [-1, 1]) {
      const ex = cx + sx * (w / 2 - r * 0.18);
      g.fillStyle = mixHex(body, PAL.kraft, 0.45);
      g.beginPath(); g.ellipse(ex, cy, r * 0.26, r * 0.96, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(PAL.kraftDark, 0.6); g.lineWidth = Math.max(0.8, r * 0.022);
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = spin * sx + (i / 40) * TAU * 2.3, rr_ = (i / 40) * 0.9;
        const px = ex + Math.cos(a) * r * 0.23 * rr_, py = cy + Math.sin(a) * r * 0.9 * rr_;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  g.restore();
}

/** 竖放的纸卷筒（轴沿 y，从侧上方看得到顶端螺旋）。 */
function rollV(g, cx, cy, h, r, spin = 0, o = {}) {
  const { body = PAL.paper, dark = PAL.kraftDark, band = null } = o;
  const body2 = mixHex(body, PAL.kraft, 0.18);
  const p = rr(cx - r, cy - h / 2, r * 2, h, r * 0.7);
  g.save();
  g.fillStyle = lin(g, cx - r, 0, cx + r, 0, [[0, mixHex(body, PAL.white, 0.45)], [0.3, body], [0.75, body2], [1, dark]]);
  g.fill(p);
  g.save(); g.clip(p);
  if (band) {
    g.fillStyle = rgba(band, 0.85);
    g.fillRect(cx - r, cy - h / 2 + 7, r * 2, 4);
    g.fillRect(cx - r, cy + h / 2 - 11, r * 2, 4);
  }
  g.strokeStyle = rgba(dark, 0.3); g.lineWidth = Math.max(0.8, r * 0.07);
  for (let k = 0; k < 4; k++) {
    const a = fract(spin / TAU + k / 4) * Math.PI - HALF_PI;
    if (Math.abs(a) > 1.35) continue;
    const xx = cx + Math.sin(a) * r;
    g.globalAlpha = 0.6 * Math.cos(a);
    g.beginPath(); g.moveTo(xx, cy - h / 2 + 4); g.lineTo(xx, cy + h / 2 - 4); g.stroke();
  }
  g.restore();
  // 顶端螺旋
  const ty = cy - h / 2 + r * 0.25;
  g.fillStyle = mixHex(body2, dark, 0.3);
  g.beginPath(); g.ellipse(cx, ty, r * 0.98, r * 0.32, 0, 0, TAU); g.fill();
  g.strokeStyle = rgba(PAL.inkSoft, 0.45); g.lineWidth = Math.max(0.8, r * 0.07);
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = spin + (i / 40) * TAU * 2.3, k = (i / 40) * 0.9;
    const px = cx + Math.cos(a) * r * 0.9 * k, py = ty + Math.sin(a) * r * 0.28 * k;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
  g.restore();
}

/** 木轴 + 两端金球（横向，中心 (cx,cy)，总长 w）。 */
function rodH(g, cx, cy, w, th = 14) {
  cut(g, rr(cx - w / 2, cy - th / 2, w, th, th / 2), PAL.woodDark, { rim: PAL.wood, rimW: 2 });
  for (const sx of [-1, 1]) {
    const bx = cx + sx * (w / 2 + th * 0.35);
    cut(g, blob(bx, cy, th * 0.82, th * 0.82, { seed: 7 + sx, amp: 0.02, n: 22 }), PAL.gold, { rim: PAL.goldLight, rimW: 2 });
    shade(g, blob(bx, cy, th * 0.82, th * 0.82, { seed: 7 + sx, amp: 0.02, n: 22 }), PAL.goldDark, bx - th, cy - th, bx + th, cy + th, 0, 0.5);
  }
}
function rodV(g, cx, cy, h, th = 14) {
  cut(g, rr(cx - th / 2, cy - h / 2, th, h, th / 2), PAL.woodDark, { rim: PAL.wood, rimW: 2 });
  for (const sy of [-1, 1]) {
    const by = cy + sy * (h / 2 + th * 0.35);
    cut(g, blob(cx, by, th * 0.82, th * 0.82, { seed: 9 + sy, amp: 0.02, n: 22 }), PAL.gold, { rim: PAL.goldLight, rimW: 2 });
    shade(g, blob(cx, by, th * 0.82, th * 0.82, { seed: 9 + sy, amp: 0.02, n: 22 }), PAL.goldDark, cx - th, by - th, cx + th, by + th, 0, 0.5);
  }
}

/** 蜡笔线：两遍 + 蜡质空隙。 */
function crayon(g, pts, col, o = {}) {
  const { lw = 4.5, seed = 1, amp = 1.4, alpha = 0.9, p = 1 } = o;
  line(g, pts, { seed, amp, lw, color: col, alpha, p });
  line(g, pts, { seed: seed + 5, amp: amp * 1.2, lw: lw * 0.55, color: col, alpha: alpha * 0.55, p });
  line(g, pts, { seed: seed + 9, amp, lw: lw * 0.45, color: PAL.paper, alpha: 0.35, dash: [2, 6], p });
}

/** 写字揭示：每字从左往右被“写”出来（裁剪擦出），p 0..1 为整行进度。返回行宽。 */
function writeRow(g, chars, cx, cy, size, p, o = {}) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  const fam = o.family || 'display';
  const gap = o.gap ?? size * 0.04;
  const ws = arr.map((c) => glyphWidth(g, c, size, fam));
  const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, arr.length - 1);
  let x = o.align === 'left' ? cx : cx - total / 2;
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    const q = clamp(p * n - i);
    const w = ws[i];
    if (q > 0) {
      const gx = x + w / 2;
      g.save();
      if (q < 1) { g.beginPath(); g.rect(x - size * 0.2, cy - size, (w + size * 0.4) * q, size * 2); g.clip(); }
      if (o.under) paperGlyph(g, arr[i], gx + size * 0.02, cy + size * 0.03, size, { family: fam, fill: o.under, edge: null });
      paperGlyph(g, arr[i], gx, cy, size, { family: fam, fill: o.fill || PAL.ink, edge: o.edge ?? null, edgeW: o.edgeW ?? 0.06 });
      g.restore();
      if (q < 1 && o.pen !== false) {
        // 笔尖墨点
        g.fillStyle = rgba(o.under || PAL.ink, 0.7);
        g.beginPath(); g.arc(x + (w + size * 0.2) * q - size * 0.1, cy + size * 0.18, size * 0.05, 0, TAU); g.fill();
      }
    }
    x += w + gap;
  }
  return total;
}

/** writeRow 同口径的行宽（不画）。 */
function rowWidth(g, chars, size, family = 'display', gap = size * 0.04) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  return arr.reduce((a, c) => a + glyphWidth(g, c, size, family), 0) + gap * Math.max(0, arr.length - 1);
}

// ———————————————————— 告示 ————————————————————
export const NOTICE = { w: 280, h: 200 };

/** 丑丑的蜡笔龙（告示正面），局部坐标中心 (cx, cy)。 */
function uglyDragon(g, cx, cy, k = 1, t = 0) {
  g.save();
  g.translate(cx, cy); g.scale(k, k);
  const D = PAL.dragon, F = PAL.fire;
  // 火（蜡笔锯齿）
  crayon(g, [[-46, -10], [-58, -18], [-54, -6], [-68, -12], [-62, 0], [-76, -4]], F, { seed: 31, lw: 4 });
  crayon(g, [[-48, -4], [-60, 2], [-56, 8]], PAL.fire2, { seed: 32, lw: 3.5 });
  // 身体
  const body = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU; body.push([8 + Math.cos(a) * 34, 6 + Math.sin(a) * 17 + Math.sin(a * 3) * 2]); }
  crayon(g, body, D, { seed: 33 });
  // 头
  const head = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * TAU; head.push([-34 + Math.cos(a) * 14, -10 + Math.sin(a) * 12]); }
  crayon(g, head, D, { seed: 34 });
  crayon(g, [[-24, 2], [-14, 6]], D, { seed: 35, lw: 4 });           // 脖子
  crayon(g, [[-40, -21], [-44, -33], [-34, -23]], D, { seed: 36, lw: 3.5 }); // 角
  crayon(g, [[-30, -22], [-27, -34], [-24, -21]], D, { seed: 37, lw: 3.5 });
  // 眼（大白眼 + 墨点）
  g.fillStyle = PAL.white; g.beginPath(); g.ellipse(-36, -12, 5.5, 5, 0, 0, TAU); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(-37.5, -11.5, 2.6, 0, TAU); g.fill();
  crayon(g, [[-44, -19], [-31, -17]], PAL.ink, { seed: 38, lw: 2.5, alpha: 0.8 }); // 怒眉
  // 背刺
  crayon(g, [[-14, -8], [-8, -18], [-2, -9], [4, -20], [10, -10], [17, -20], [22, -9], [28, -16], [34, -4]], D, { seed: 39, lw: 3.5 });
  // 翅膀
  crayon(g, [[0, -6], [-2, -30], [10, -22], [14, -32], [22, -18]], PAL.dragonWing, { seed: 40, lw: 3.5 });
  // 腿
  for (const lx of [-12, 2, 18, 30]) crayon(g, [[lx, 20], [lx - 2, 32], [lx + 4, 32]], D, { seed: 41 + lx, lw: 3.5 });
  // 尾巴 + 黑桃尖
  crayon(g, [[40, 8], [52, 2], [58, -8], [64, -14]], D, { seed: 60, lw: 4 });
  crayon(g, [[60, -12], [66, -24], [72, -12], [64, -14]], PAL.ink, { seed: 61, lw: 3 });
  g.restore();
}

/**
 * 告示（锚在纸中心，280×200）。
 * o: { x, y, s, rot, t, face:'front'|'back', flip 0..1（绕竖轴翻面 scaleX 1→0→−1，过半露另一面）,
 *      unroll 0..1（从上往下展开，下沿带纸卷）, pins 0..2（或 [p1,p2] 每颗按下进度）, corners（只剩两个纸角 + 图钉）,
 *      squash（拍上去的挤压，>0 压扁）, back:(g,{w,h})=>{}（背面内容回调，已裁到纸内、原点在纸中心、不镜像）, alpha, seed }
 * 返回 { pins:[[x,y],[x,y]], w, h }（父坐标）。
 */
export function drawNotice(g, o = {}) {
  const { t = 0, face = 'front', flip = 0, unroll = 1, pins = 2, corners = false, squash = 0, back = null, seed = 3 } = o;
  const W = NOTICE.w, H = NOTICE.h;
  const pinPos = [[-W / 2 + 22, -H / 2 + 19], [W / 2 - 22, -H / 2 + 19]];
  const pinP = Array.isArray(pins) ? pins : [clamp(pins), clamp(pins - 1)];
  const ret = { pins: pinPos.map(([px, py]) => toParent(o, px, py)), w: W * (o.s ?? 1), h: H * (o.s ?? 1) };
  if ((o.alpha ?? 1) <= 0) return ret;
  begin(g, o);
  if (squash) { g.translate(0, -H / 2); g.scale(1 + squash * 0.35, 1 - squash * 0.5); g.translate(0, H / 2); }

  if (corners) {
    for (const sx of [-1, 1]) {
      const cx = sx * W / 2, cy = -H / 2;
      const pts = [[cx, cy], [cx - sx * 62, cy]];
      for (let i = 1; i < 7; i++) {
        const u = i / 7;
        pts.push([cx - sx * 62 * (1 - u) + (hash2(seed + sx, i) - 0.5) * 7, cy + 50 * u + (hash2(seed + 4 + sx, i) - 0.5) * 7]);
      }
      pts.push([cx, cy + 50]);
      const tri = poly(pts, { seed: seed + sx, amp: 0.6 });
      cut(g, tri, PAL.paper, { shadow: 2, rim: PAL.white, rimW: 1.5 });
      shade(g, tri, PAL.kraft, cx, cy, cx - sx * 40, cy + 40, 0.1, 0.45);
      g.save(); g.clip(tri);
      g.strokeStyle = rgba(PAL.ink, 0.8); g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - sx * 11, cy + 60); g.lineTo(cx - sx * 11, cy + 11); g.lineTo(cx - sx * 70, cy + 11); g.stroke();
      g.restore();
    }
    pinPos.forEach(([px, py], i) => pushPin(g, px, py, pinP[i]));
    g.restore();
    return ret;
  }

  const fx = Math.cos(Math.PI * clamp(flip));
  const showBack = (face === 'back') !== (fx < 0);
  g.scale(Math.max(0.003, Math.abs(fx)), 1);
  const u = clamp(unroll);
  const vis = H * u;
  const rollR = lerp(15, 5, u);
  const sheet = poly([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]], { seed, amp: 1.3, step: 24 });

  g.save();
  if (u < 1) { g.beginPath(); g.rect(-W / 2 - 10, -H / 2 - 10, W + 20, vis + 10); g.clip(); }
  cut(g, sheet, showBack ? PAL.kraft : PAL.paper, { rim: showBack ? mixHex(PAL.kraft, PAL.white, 0.4) : PAL.white, rimW: 2 });
  g.save();
  g.clip(sheet);
  if (!showBack) {
    shade(g, sheet, PAL.paper2, -W / 2, -H / 2, W / 2, H / 2, 0.0, 0.75);
    // 卷过的折痕
    g.strokeStyle = rgba(PAL.kraft, 0.35); g.lineWidth = 1.2;
    for (const yy of [-H / 6, H / 6]) { g.beginPath(); g.moveTo(-W / 2, yy); g.lineTo(W / 2, yy + 2); g.stroke(); }
    // 墨框（双线）
    g.strokeStyle = PAL.ink; g.lineWidth = 3.4; g.lineJoin = 'round';
    g.stroke(poly([[-W / 2 + 11, -H / 2 + 11], [W / 2 - 11, -H / 2 + 11], [W / 2 - 11, H / 2 - 11], [-W / 2 + 11, H / 2 - 11]], { seed: seed + 2, amp: 0.9, step: 30 }));
    g.strokeStyle = rgba(PAL.inkSoft, 0.55); g.lineWidth = 1.2;
    g.strokeRect(-W / 2 + 18, -H / 2 + 18, W - 36, H - 36);
    // 标题「勇者招募」（印刷红字 + 暗红错位）
    glyphRow(g, '勇者招募', 1.6, -49 + 2.2, 52, { align: 'center', fill: rgba(PAL.redDeep, 0.55), edge: null, gap: 4 });
    glyphRow(g, '勇者招募', 0, -49, 52, { align: 'center', fill: PAL.red, edge: null, gap: 4 });
    for (const sx of [-1, 1]) sparkle(g, sx * 112, -50, 9, { color: PAL.goldDark, thin: 0.3 });
    // 分隔线 + 菱形
    g.strokeStyle = PAL.ink; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-104, -16); g.lineTo(-10, -16); g.moveTo(10, -16); g.lineTo(104, -16); g.stroke();
    g.fillStyle = PAL.red; g.beginPath(); g.moveTo(0, -22); g.lineTo(6, -16); g.lineTo(0, -10); g.lineTo(-6, -16); g.closePath(); g.fill();
    // 丑龙涂鸦
    uglyDragon(g, -50, 42, 0.95, t);
    // 「金币 ×999」
    coinIcon(g, 40, 20, 14);
    glyphRow(g, '金币', 92, 21, 30, { align: 'center', family: 'play', fill: PAL.ink, edge: null, gap: 1 });
    glyphRow(g, '×999', 80, 60, 36, { align: 'center', family: 'latin', fill: PAL.redDark, edge: null, gap: 0 });
  } else {
    shade(g, sheet, PAL.kraftDark, -W / 2, -H / 2, W / 2, H / 2, 0.05, 0.5);
    g.strokeStyle = rgba(PAL.kraftDark, 0.35); g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const yy = -H / 2 + (i + 0.5) * (H / 9) + (hash2(seed, i) - 0.5) * 6;
      g.beginPath(); g.moveTo(-W / 2, yy); g.bezierCurveTo(-40, yy + 3, 40, yy - 3, W / 2, yy + 1); g.stroke();
    }
    if (back) { g.save(); back(g, { w: W, h: H }); g.restore(); }
  }
  // 翻面时的明暗
  if (Math.abs(fx) < 0.999) shade(g, sheet, PAL.ink, -W / 2, 0, W / 2, 0, 0.45 * (1 - Math.abs(fx)), 0.15 * (1 - Math.abs(fx)));
  g.restore();
  g.restore();
  // 展开中的下沿纸卷
  if (u < 1) rollH(g, 0, -H / 2 + vis, W + 6, rollR, vis / rollR, { body: showBack ? PAL.kraft : PAL.paper });
  if (!showBack) pinPos.forEach(([px, py], i) => { if (py < -H / 2 + vis) pushPin(g, px, py, pinP[i]); });
  g.restore();
  return ret;
}

// ———————————————————— 卷轴 ————————————————————
/** 涂鸦：勇者举剑 + 龙（墨线），中心 (cx,cy)，p 0..1 画出进度。 */
function doodle(g, cx, cy, k = 1, p = 1, seed = 70) {
  if (p <= 0) return;
  g.save();
  g.translate(cx, cy); g.scale(k, k);
  const L = (pts, i, col = PAL.ink, lw = 3) => line(g, pts, { seed: seed + i, amp: 0.8, lw, color: col, alpha: 0.85, p: clamp(p * 6 - i * 0.45) });
  // 勇者
  const head = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * TAU; head.push([-62 + Math.cos(a) * 11, -16 + Math.sin(a) * 11]); }
  L(head, 0);
  L([[-62, -5], [-62, 20]], 1);
  L([[-62, 20], [-72, 38]], 2); L([[-62, 20], [-52, 38]], 2);
  L([[-62, 4], [-50, -10], [-44, -26]], 3);
  L([[-46, -18], [-30, -58]], 4, PAL.ink, 3.4);           // 剑
  L([[-48, -28], [-36, -22]], 4);                          // 护手
  L([[-62, -3], [-74, 0], [-86, -6], [-96, -2]], 5, PAL.red, 3.2); // 围巾
  L([[-62, 4], [-74, 12]], 5);
  // 龙
  L([[8, 14], [20, -4], [40, 2], [56, 18], [74, 8], [86, -10], [96, -18]], 6, PAL.ink, 3.4);
  L([[8, 14], [-4, 8], [-10, -4], [2, -12], [12, -6], [20, -4]], 7);
  L([[0, -12], [-2, -22]], 8); L([[8, -10], [12, -20]], 8);
  L([[-10, -2], [-18, 0], [-10, 4]], 8);
  L([[28, -2], [32, -10], [38, -2], [44, -8], [48, 4]], 9);
  L([[92, -16], [100, -26], [104, -14], [96, -16]], 9);
  g.fillStyle = rgba(PAL.ink, 0.85 * clamp(p * 4 - 2));
  g.beginPath(); g.arc(2, -5, 2.4, 0, TAU); g.fill();
  g.restore();
}

/** 红色大叉章（路径画）：p 0..1 砸下进度。 */
function stampCross(g, cx, cy, size, p, seed = 80) {
  if (p <= 0) return;
  const k = p < 1 ? lerp(1.9, 1, outCubic(clamp(p))) : 1;
  g.save();
  g.translate(cx, cy); g.scale(k, k); g.rotate(-0.08);
  g.globalAlpha *= clamp(p * 2.5);
  const w = size * 0.2, L = size * 0.62;
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    g.save(); g.rotate(a);
    const bar = poly([[-L, -w / 2], [L, -w / 2 - 2], [L + 3, w / 2], [-L - 2, w / 2 + 1]], { seed: seed + (a > 0 ? 1 : 2), amp: 2.2, step: 14 });
    cut(g, bar, rgba(PAL.red, 0.92));
    shade(g, bar, PAL.redDeep, -L, 0, L, 0, 0.0, 0.35);
    g.restore();
  }
  g.restore();
}

/** 页边旧笔记：潦草墨线 + 一行划掉的小字。区域 rect = [x0,y0,w,h]。 */
function marginNotes(g, rect, a, seed = 90) {
  if (a <= 0) return;
  const [x0, y0, w, h] = rect;
  g.save();
  g.globalAlpha *= a;
  const rows = Math.max(1, Math.floor(h / 16));
  for (let i = 0; i < rows; i++) {
    if (hash2(seed, i) < 0.25) continue;
    const yy = y0 + 8 + i * 16;
    const ww = w * (0.45 + hash2(seed + 1, i) * 0.5);
    const pts = [];
    for (let j = 0; j <= 10; j++) pts.push([x0 + (ww * j) / 10, yy + Math.sin(j * 2.1 + i) * 2.2]);
    line(g, pts, { seed: seed + i, amp: 0.6, lw: 1.3, color: PAL.inkSoft, alpha: 0.45 });
  }
  // 划掉的名字
  const sz = Math.min(18, w / 4.6);
  const cy = y0 + h * 0.55;
  glyphRow(g, NAMES.hero, x0 + 2, cy, sz, { family: 'play', fill: rgba(PAL.inkSoft, 0.75), edge: null, gap: 1 });
  line(g, [[x0 - 2, cy + 1], [x0 + sz * 1.6, cy - 2], [x0 + sz * 3.4, cy + 2], [x0 + sz * 4.3, cy - 1]], { seed: seed + 50, amp: 0.8, lw: 1.6, color: PAL.ink, alpha: 0.7 });
  g.restore();
}

/**
 * 卷轴。两种朝向：
 *  - orient 'v'（竖挂，传令官念捷报）：锚 = 顶轴中心；纸向 +y 展开 len，宽 width；rows = 横排的行，逐字“写”出。
 *  - orient 'h'（平铺，在地上向右滚）：锚 = 起点端中心；纸向 +x 展开 len，高 width；items 沿纸带排布（被卷筒盖住的部分不显示）。
 *    dir=-1 时纸向 −x 展开（向左滚）：几何镜像，文字 / 涂鸦 / 叉章各自保持正读；item.at 仍是沿展开方向距起点的距离，
 *    text 的 at 对应文字靠近木轴的一端（向左滚时字从右往左露出）。
 * o: { x, y, s, rot, t, orient='v', len, width, rollR=18, handle=true（起点木轴）, roll=true（末端纸卷）, spin（默认 len/rollR）, dir=1（仅 'h'）,
 *      rows:[{ chars, p 0..1, size=60, family, fill=PAL.gold, y }]（'v'）,
 *      items:[{ kind:'text', at, chars, size, fill, family, p, y } | { kind:'doodle', at, p, size, y } | { kind:'cross', at, p, size, y } | { kind:'dots', at, to }]（'h'）,
 *      text / textP（'v' 的单行简写）, notes 0..1（页边旧笔记）, doodle（'v'：{y, p, stampX}）, stampX（与 doodle 同用的红叉 0..1）,
 *      edge=PAL.red（红边）, alpha }
 * 返回 { end:[x,y]（纸卷/末端，父坐标）, start:[x,y] }。
 */
export function drawScroll(g, o = {}) {
  const { t = 0, orient = 'v', len = 320, width = 300, rollR = 18, handle = true, roll = true, notes = 0, edge = PAL.red, seed = 5 } = o;
  const L = Math.max(0, len);
  const spin = o.spin ?? L / Math.max(4, rollR);
  const dir = orient === 'h' && o.dir === -1 ? -1 : 1;
  const ret = orient === 'v' ? { start: toParent(o, 0, 0), end: toParent(o, 0, L) } : { start: toParent(o, 0, 0), end: toParent(o, dir * L, 0) };
  if ((o.alpha ?? 1) <= 0) return ret;
  begin(g, o);
  const W2 = width / 2;
  if (orient === 'v') {
    const sheet = poly([[-W2, -4], [W2, -4], [W2, L], [-W2, L]], { seed, amp: 1.0, step: 30 });
    cut(g, sheet, PAL.paper, { rim: PAL.white, rimW: 2 });
    g.save(); g.clip(sheet);
    shade(g, sheet, PAL.paper2, -W2, 0, W2, 0, 0.55, 0.0);
    shade(g, sheet, PAL.paper2, W2, 0, W2 - 60, 0, 0.6, 0.0);
    for (const sx of [-1, 1]) {
      g.fillStyle = edge; g.fillRect(sx * (W2 - 14) - 3, 0, 6, L);
      g.fillStyle = rgba(PAL.redDeep, 0.5); g.fillRect(sx * (W2 - 14) + 3, 0, 1.5, L);
    }
    if (notes > 0) {
      marginNotes(g, [-W2 + 21, 30, 24, Math.max(0, L - 60)], notes, seed + 100);
      marginNotes(g, [W2 - 45, 60, 24, Math.max(0, L - 90)], notes * 0.8, seed + 200);
    }
    const rows = o.rows || (o.text ? [{ chars: o.text, p: o.textP ?? 1 }] : []);
    rows.forEach((r, i) => {
      const size = r.size || 60;
      const cy = r.y ?? 72 + i * size * 1.28;
      if (cy > L + size * 0.2) return;
      writeRow(g, r.chars, r.x ?? 0, cy, size, r.p ?? 1, { family: r.family || 'display', fill: r.fill || PAL.gold, under: r.under ?? PAL.goldDark, gap: size * 0.05 });
    });
    if (o.doodle) {
      const d = o.doodle;
      doodle(g, 0, d.y ?? L - 90, d.size ?? 1, d.p ?? 1, seed + 300);
      stampCross(g, 50, (d.y ?? L - 90) - 4, 110 * (d.size ?? 1), d.stampX ?? o.stampX ?? 0);
    }
    g.restore();
    if (roll) rollH(g, 0, L, width + 6, rollR, spin, { band: edge });
    if (handle) rodH(g, 0, -2, width + 30, 16);
  } else {
    // dir = −1：纸向 −x 展开；只镜像几何坐标，文字 / 涂鸦 / 叉章不镜像（保持正读）
    const X = (v) => dir * v;
    const sheet = poly([[X(-2), -W2], [X(L), -W2], [X(L), W2], [X(-2), W2]], { seed, amp: 1.0, step: 30 });
    cut(g, sheet, PAL.paper, { rim: PAL.white, rimW: 2 });
    g.save(); g.clip(sheet);
    shade(g, sheet, PAL.paper2, 0, -W2, 0, W2, 0.0, 0.6);
    const x0 = dir > 0 ? 0 : -L;
    for (const sy of [-1, 1]) {
      g.fillStyle = edge; g.fillRect(x0, sy * (W2 - 11) - 2.5, L, 5);
      g.fillStyle = rgba(PAL.redDeep, 0.45); g.fillRect(x0, sy * (W2 - 11) + 2.5, L, 1.4);
    }
    if (notes > 0) {
      const nw = Math.max(0, L - 80);
      marginNotes(g, [dir > 0 ? 40 : -40 - nw, -W2 + 18, nw, 16], notes * 0.7, seed + 100);
    }
    const vis = L - (roll ? rollR * 0.3 : 0);
    g.beginPath(); g.rect(dir > 0 ? -4 : -vis, -W2 - 40, vis + 4, width + 80); g.clip();
    for (const it of o.items || []) {
      if (it.kind === 'text') {
        const size = it.size || Math.min(60, width * 0.6);
        const opt = { align: 'left', family: it.family || 'display', fill: it.fill || PAL.gold, under: it.under ?? PAL.goldDark, gap: size * 0.06, pen: false };
        const tx = dir > 0 ? it.at : -it.at - rowWidth(g, it.chars, size, opt.family, opt.gap);
        writeRow(g, it.chars, tx, it.y ?? 0, size, it.p ?? 1, opt);
      } else if (it.kind === 'doodle') {
        const k = it.size ?? width / 140;
        doodle(g, X(it.at), it.y ?? 2, k, it.p ?? 1, seed + 300);
      } else if (it.kind === 'cross') {
        stampCross(g, X(it.at), it.y ?? 0, it.size ?? width * 0.9, it.p ?? 1);
      } else if (it.kind === 'dots') {
        g.fillStyle = rgba(PAL.inkSoft, 0.5);
        for (let xx = it.at; xx < (it.to ?? L); xx += 18) { g.beginPath(); g.arc(X(xx), 0, 3, 0, TAU); g.fill(); }
      }
    }
    g.restore();
    if (handle) rodV(g, 0, 0, width + 26, 14);
    if (roll) {
      g.fillStyle = rgba(PAL.shadow, 0.22);
      g.beginPath(); g.ellipse(X(L) + rollR * 0.6, W2 + 6, rollR * 1.4, 6, 0, 0, TAU); g.fill();
      rollV(g, X(L), 0, width + 8, rollR, dir * spin, { band: edge });
    }
  }
  g.restore();
  return ret;
}

// ———————————————————— 圣旨 ————————————————————
/**
 * 圣旨：奶油长卷 + 红边，三段金印字（勇者名 4 / 4 / 5 字）。锚 = 左端中心，向 +x 展开。
 * o: { x, y, s, rot, t, len=900, width=180, unroll 0..1（右端卷筒随之右移）, prints:[t1,t2,t3]（三段金印砸下时刻，默认 N4a/b/c）,
 *      printDur=0.22, hung 0..1（吊成横幅：两端木轴 + 吊绳 + 下垂）, sag=26（吊起时中部下垂 px）, ropeH=160（吊绳高）,
 *      sweep 0..1（从左到右扫过金字的闪光，<0 不画）, charSize（默认按 len/width 自适应）,
 *      parts（分段文字，默认 NAMES.heroParts；段数须与 prints 一致）, alpha }
 * prints 是默认秒（与 o.t 同一时间轴）：镜头必须传 t: T，否则 t=0 早于所有印时、一个字都不出。
 * 返回 { chars:[[x,y]×13]（父坐标）, end:[x,y] }。
 */
export function drawDecree(g, o = {}) {
  const { t = 0, len = 900, width = 180, unroll = 1, prints = [0], printDur = 0.22, hung = 0, sag = 26, ropeH = 160, sweep = -1, seed = 12 } = o;
  const parts = o.parts || NAMES.heroParts || [NAMES.hero];
  const all = parts.map((p) => [...p]);
  const n = all.reduce((a, b) => a + b.length, 0);
  const size = o.charSize ?? Math.min(width * 0.5, (len * 0.84) / (n * 0.8 + 1.4));
  const vis = len * clamp(unroll);
  const hk = clamp(hung);
  const sagAt = (xx) => hk * sag * Math.sin(Math.PI * clamp(xx / len));
  const W2 = width / 2;
  // 字位：三段之间留 0.7 字空
  const adv = size * 0.8, segGap = size * 0.7;
  const totalW = n * adv + (parts.length - 1) * segGap;
  let cx = (len - totalW) / 2 + adv / 2;
  const slots = [];
  all.forEach((chars, si) => { chars.forEach((ch, j) => { slots.push({ ch, si, j, x: cx }); cx += adv; }); cx += segGap; });
  const ret = { chars: slots.map((sl) => toParent(o, sl.x, sagAt(sl.x))), end: toParent(o, vis, sagAt(vis)) };
  if ((o.alpha ?? 1) <= 0) return ret;
  begin(g, o);
  // 吊绳
  if (hk > 0) {
    g.save();
    g.globalAlpha *= clamp(hk * 2);
    g.strokeStyle = PAL.kraftDark; g.lineWidth = 4; g.lineCap = 'round';
    for (const ex of [-10, len + 10]) {
      g.beginPath(); g.moveTo(ex, -W2 - 4); g.lineTo(ex + (ex < 0 ? -30 : 30), -W2 - ropeH * hk); g.stroke();
    }
    g.restore();
  }
  // 纸带（下垂时为曲带）
  const cl = [];
  const N = 24;
  for (let i = 0; i <= N; i++) { const xx = (vis * i) / N; cl.push([xx, sagAt(xx)]); }
  if (vis > 2) {
    const band = ribbon(cl, W2);
    cut(g, band, PAL.paper, { rim: PAL.white, rimW: 2 });
    g.save(); g.clip(band);
    shade(g, band, PAL.paper2, 0, -W2, 0, W2, 0.0, 0.65);
    // 红边（两道）+ 内金线
    g.lineCap = 'butt';
    for (const sy of [-1, 1]) {
      const off = sy * (W2 - 12);
      g.strokeStyle = PAL.red; g.lineWidth = 7;
      g.beginPath(); cl.forEach(([xx, yy], i) => (i ? g.lineTo(xx, yy + off) : g.moveTo(xx, yy + off))); g.stroke();
      g.strokeStyle = rgba(PAL.goldDark, 0.7); g.lineWidth = 1.6;
      g.beginPath(); cl.forEach(([xx, yy], i) => (i ? g.lineTo(xx, yy + off - sy * 8) : g.moveTo(xx, yy + off - sy * 8))); g.stroke();
    }
    // 金印字
    slots.forEach((sl) => {
      if (sl.x > vis - size * 0.3) return;
      const tp = t - prints[sl.si] - sl.j * 0.04;
      if (tp < 0) return;
      const q = clamp(tp / printDur);
      const yy = sagAt(sl.x);
      const ang = hk * Math.atan2(sagAt(sl.x + 4) - sagAt(sl.x - 4), 8);
      const k = q < 1 ? lerp(1.35, 1, outBack(q, 2)) : 1;
      const sw = sweep >= 0 ? Math.exp(-(((sl.x / len - sweep) / 0.05) ** 2)) : 0;
      paperGlyph(g, sl.ch, sl.x + 1.2, yy + 2.2, size, { fill: rgba(PAL.goldDark, 0.8), edge: null, rot: ang, scale: k, alpha: q });
      paperGlyph(g, sl.ch, sl.x, yy, size, { fill: lin(g, 0, -size * 0.45, 0, size * 0.45, [mixHex(PAL.goldLight, PAL.white, sw * 0.6), PAL.gold, PAL.goldDark]), edge: null, rot: ang, scale: k, alpha: q });
      if (q < 1) {
        g.save();
        g.globalAlpha *= (1 - q) * 0.8;
        g.strokeStyle = PAL.goldLight; g.lineWidth = 3;
        g.strokeRect(sl.x - size * 0.48 * k, yy - size * 0.48 * k, size * 0.96 * k, size * 0.96 * k);
        g.restore();
      }
    });
    // 印框（每段一圈淡金方框）
    parts.forEach((p, si) => {
      const tp = t - prints[si];
      if (tp < 0) return;
      const a = clamp(tp / 0.3);
      const segSlots = slots.filter((sl) => sl.si === si);
      const x0 = segSlots[0].x - adv * 0.62, x1 = segSlots[segSlots.length - 1].x + adv * 0.62;
      if (x1 > vis) return;
      g.save();
      g.globalAlpha *= 0.55 * a;
      g.strokeStyle = PAL.goldDark; g.lineWidth = 2; g.setLineDash([7, 5]);
      g.strokeRect(x0, sagAt((x0 + x1) / 2) - size * 0.62, x1 - x0, size * 1.24);
      g.restore();
    });
    if (sweep >= 0 && sweep <= 1) glow(g, sweep * len, sagAt(sweep * len), size * 1.6, PAL.goldLight, 0.55);
    g.restore();
  }
  // 两端：左端木轴；右端未展开时为卷筒，吊起时为木轴
  rodV(g, -6, 0, width + 22, 14);
  const ey = sagAt(vis);
  if (unroll < 1) rollV(g, vis + 4, ey, width + 10, lerp(30, 14, unroll), vis / 20, { band: PAL.red });
  else rodV(g, len + 6, ey, width + 22, 14);
  g.restore();
  return ret;
}

// ———————————————————— 大纸卷 ————————————————————
/**
 * 碾过镜头的纸卷在进度 p（0..1）时的屏幕位置：{ y（卷心）, top, bottom }。与 drawPaperRoll({ overCamera: p }) 同一公式，
 * 只算不画——镜头先用它做遮罩（卷下方 = 下一画面），再在最上层画纸卷，不必把纸卷画两遍。
 */
export function rollOverCameraY(p) {
  const r = 80, y = lerp(1080 + r + 30, -r - 30, inOutCubic(clamp(p)));
  return { y, top: y - r, bottom: y + r };
}

/**
 * 大纸卷（横幅卷成的大卷）。锚 = 卷心。
 * o: { x, y, s, rot, t, r=110, len=360, view:'side'|'end', spin（转角，表面金字随之转过）, chars（默认勇者名）,
 *      bounceAt:[秒…]（落台阶时刻，按 t 自动挤压，以卷底为锚）, squash, alpha,
 *      overCamera 0..1（屏幕空间：一根横贯全屏、高 160 的纸卷从下沿滚到上沿；忽略 x/y/s；返回卷心 y 供遮罩用） }
 * 返回 { y, top, bottom }（卷心与上下沿，父坐标；overCamera 时为屏幕坐标）。
 */
export function drawPaperRoll(g, o = {}) {
  const { t = 0, view = 'side', bounceAt = [], seed = 21 } = o;
  const chars = [...(o.chars || NAMES.hero)];
  if (o.overCamera !== undefined && o.overCamera !== null) {
    const p = clamp(o.overCamera);
    const r = 80, cy = rollOverCameraY(p).y;
    g.save();
    // 卷筒下方纸面的接触阴影
    g.fillStyle = lin(g, 0, cy, 0, cy + r * 1.6, [rgba(PAL.shadow, 0.45), rgba(PAL.shadow, 0)]);
    g.fillRect(-20, cy, 1960, r * 1.6);
    g.fillStyle = lin(g, 0, cy - r * 1.4, 0, cy, [rgba(PAL.shadow, 0), rgba(PAL.shadow, 0.25)]);
    g.fillRect(-20, cy - r * 1.4, 1960, r * 1.4);
    sideRoll(g, 960, cy, 2100, r, (1080 + 2 * r) * p / r, chars, { band: PAL.red, rows: 9, size: 54 });
    g.restore();
    return { y: cy, top: cy - r, bottom: cy + r };
  }
  const r = o.r ?? 110, len = o.len ?? 360;
  const spin = o.spin ?? 0;
  const sq = clamp((o.squash || 0) + bounceAt.reduce((a, b) => a + hit(t, b, 0.11) * (t >= b ? 1 : 0), 0) * 0.22, -0.5, 0.5);
  const ret = { y: o.y || 0, top: (o.y || 0) - r * (o.s ?? 1), bottom: (o.y || 0) + r * (o.s ?? 1) };
  if ((o.alpha ?? 1) <= 0) return ret;
  begin(g, o);
  if (sq) { g.translate(0, r); g.scale(1 + sq * 0.6, 1 - sq); g.translate(0, -r); }
  if (view === 'end') {
    const disk = blob(0, 0, r, r, { seed, amp: 0.01, n: 48 });
    cut(g, disk, PAL.paper, { rim: PAL.white, rimW: 3 });
    g.save(); g.clip(disk);
    g.fillStyle = lin(g, -r, -r, r, r, [rgba(PAL.white, 0.25), rgba(PAL.paper2, 0), rgba(PAL.kraft, 0.55)]);
    g.fillRect(-r, -r, 2 * r, 2 * r);
    // 卷层螺旋（随 spin 旋转）
    g.strokeStyle = rgba(PAL.kraftDark, 0.55); g.lineWidth = Math.max(1.2, r * 0.018);
    g.beginPath();
    const turns = 6.5;
    for (let i = 0; i <= 260; i++) {
      const u = i / 260, a = spin + u * TAU * turns, rr_ = r * (0.1 + 0.88 * u);
      const px = Math.cos(a) * rr_, py = Math.sin(a) * rr_;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    g.strokeStyle = rgba(PAL.red, 0.75); g.lineWidth = Math.max(1.5, r * 0.03);
    g.beginPath(); g.arc(0, 0, r * 0.96, 0, TAU); g.stroke();
    g.restore();
    cut(g, blob(0, 0, r * 0.1, r * 0.1, { seed: seed + 1, n: 16 }), PAL.kraftDark);
    // 外层松开的纸尾
    const a0 = spin + TAU * turns;
    const tail = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const a = a0 + u * 0.55;
      const rr_ = r * (0.98 + u * 0.12) + Math.sin(t * 9 + u * 3) * r * 0.02 * u;
      tail.push([Math.cos(a) * rr_, Math.sin(a) * rr_]);
    }
    g.strokeStyle = PAL.paper; g.lineWidth = r * 0.05; g.lineCap = 'round';
    g.beginPath(); tail.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  } else {
    sideRoll(g, 0, 0, len, r, spin, chars, { band: PAL.red, rows: 7, size: Math.min(r * 0.42, (len * 0.85) / (chars.length * 0.8)) });
  }
  g.restore();
  return ret;
}

/** 侧视圆柱纸卷：表面金字成行绕卷心，转角 spin（正值 = 顶面朝镜头滚来）。 */
function sideRoll(g, cx, cy, len, r, spin, chars, o = {}) {
  const { band = null, rows = 7 } = o;
  const caps = len < 1600;
  rollH(g, cx, cy, len, r, spin, { band, caps });
  const bodyP = rr(cx - len / 2, cy - r, len, r * 2, r * 0.55);
  g.save();
  g.clip(bodyP);
  g.save();
  const inset = caps ? r * 0.5 : 0;
  g.beginPath(); g.rect(cx - len / 2 + inset, cy - r, len - inset * 2, 2 * r); g.clip();
  const n = chars.length;
  const avail = len - (caps ? r * 1.0 : 0);
  const size = Math.min(o.size ?? 40, (avail * 0.94) / (n * 0.82));
  const adv = size * 0.82;
  const rowW = n * adv;
  const reps = Math.max(1, Math.floor((len * 0.9) / (rowW + adv * 2)));
  for (let k = 0; k < rows; k++) {
    let a = fract((spin / TAU) + k / rows) * TAU - Math.PI; // -π..π，0 = 正对镜头
    const c = Math.cos(a);
    if (c <= 0.08) continue;
    const yy = cy - r * Math.sin(-a) * 0.96;
    for (let rep = 0; rep < reps; rep++) {
      const x0 = cx - (reps * (rowW + adv * 2) - adv * 2) / 2 + rep * (rowW + adv * 2) + adv / 2 + (k % 2) * adv * 0.5;
      for (let i = 0; i < n; i++) {
        g.save();
        g.translate(x0 + i * adv, yy);
        g.scale(1, c);
        paperGlyph(g, chars[i], 0, 0, size, { fill: mixHex(PAL.goldDark, PAL.gold, c), edge: null, alpha: clamp(c * 1.6) });
        g.restore();
      }
    }
  }
  g.restore();
  // 圆柱高光与暗部
  g.fillStyle = lin(g, 0, cy - r, 0, cy + r, [[0, rgba(PAL.white, 0.35)], [0.22, rgba(PAL.white, 0)], [0.7, rgba(PAL.shadow, 0)], [1, rgba(PAL.shadow, 0.3)]]);
  g.fillRect(cx - len / 2, cy - r, len, 2 * r);
  g.restore();
}

// ———————————————————— 纸卷塔 ————————————————————
const TOWER = (() => {
  const items = [];
  let y = 0;
  for (let k = 0; k < 9; k++) {
    const r = 13 + hash2(5, k) * 6;
    const len = 70 + hash2(6, k) * 50;
    y -= r;
    items.push({ r, len, y, dx: (hash2(7, k) - 0.5) * 22, rot: (hash2(8, k) - 0.5) * 0.24, tint: hash2(9, k) });
    y -= r;
  }
  return { items, height: -y };
})();

/**
 * 纸卷塔（书记官背的一摞卷轴）。锚 = 塔底中心。
 * o: { x, y, s, rot, t, tilt 0..1（摇晃幅度）, lean（静态倾角，弧度）, topple 0..1（倒塌：先整体倾倒再散落滚地）,
 *      groundY=110（倒塌落地线，相对锚点向下 px）, alpha }
 */
export function drawScrollTower(g, o = {}) {
  const { t = 0, tilt = 0.4, lean = 0, topple = 0, groundY = 110, seed = 31 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  begin(g, o);
  const H = TOWER.height;
  const sway = lean + tilt * (0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 3.7 + 1));
  const tp = clamp(topple);
  const fallA = inQuad(clamp(tp / 0.35)) * 0.9 * (sway >= 0 ? 1 : -1);
  const scatter = clamp((tp - 0.3) / 0.7);
  // 绳子（散落前）
  const items = TOWER.items.map((it, k) => {
    const h = -it.y / H;
    const bend = sway * h * h * H * 0.9 + sway * h * 20;
    // 倾倒：绕塔底旋转
    const bx = it.dx * (1 - scatter) + bend, by = it.y;
    const ca = Math.cos(fallA), sa = Math.sin(fallA);
    let px = bx * ca - by * sa, py = bx * sa + by * ca, rot = it.rot + sway * 0.6 + fallA;
    if (scatter > 0) {
      const d = clamp(scatter * 1.25 - k * 0.025);
      const ex = (hash2(seed, k) - 0.35) * 320 + Math.sign(fallA || 1) * k * 28;
      const ey = groundY - it.r;
      const e = outCubic(d);
      const hop = Math.sin(Math.PI * clamp(d * 1.4)) * 60 * (1 - d) ;
      px = lerp(px, ex, e);
      py = lerp(py, ey, e) - hop;
      rot = lerp(rot, (hash2(seed + 3, k) - 0.5) * 0.4, e) + (1 - e) * d * 4;
    }
    return { ...it, px, py, rot, k };
  });
  items.forEach((it) => {
    g.save();
    g.translate(it.px, it.py); g.rotate(it.rot);
    const body = mixHex(PAL.paper, PAL.paper2, it.tint);
    rollH(g, 0, 0, it.len, it.r, it.k * 1.3 + t * 0.2 * tilt, { body, band: it.k % 3 === 0 ? PAL.red : it.k % 3 === 1 ? PAL.goldDark : null });
    // 系带
    g.fillStyle = it.k % 2 ? PAL.red : PAL.heroBlue;
    g.fillRect(-3, -it.r, 6, it.r * 2);
    g.restore();
  });
  if (scatter <= 0.02) {
    // 捆绳
    g.save();
    g.strokeStyle = PAL.kraftDark; g.lineWidth = 3;
    const ca = Math.cos(fallA), sa = Math.sin(fallA);
    const pts = items.filter((_, k) => k % 2 === 0).map((it) => [it.px - 30 * ca, it.py - 30 * sa]);
    line(g, pts, { seed: seed + 7, amp: 0.6, lw: 3, color: PAL.kraftDark, alpha: 0.9 });
    g.restore();
  }
  g.restore();
}

// ———————————————————— 无限卷轴 ————————————————————
const SEQ = (() => {
  const out = [];
  out.push({ chars: [...NAMES.child], big: true });
  for (const k of ['hero', 'princess', 'city', 'dragon']) out.push({ chars: [...NAMES[k]] });
  return out;
})();

/**
 * 沿路径展开的无限卷轴（王浩然 + 四个长名字循环，名字之间路径画圆点）。
 * path：控制点 [[x,y] | [x,y,w]…]（从起点到卷头，w = 该处纸宽，省略用 o.width；远处变窄即透视）。
 * o: { p 0..1（展开到路径的哪里，卷头带小纸卷）, width=90, offset（文字整体后移 px，跨镜头接续用）, t, alpha,
 *      minPx=6（屏幕字高低于它改画点纹纸带）, maxSteep=0.78（路径陡于此处不写字、画点纹）, edge=PAL.red }
 * 文字沿路径从起点往卷头方向排（路径应从左往右走才可读）。返回 { head:[x,y,ang] }。
 */
export function drawInfiniteScroll(g, path, o = {}) {
  const { p = 1, width = 90, offset = 0, t = 0, minPx = 6, maxSteep = 0.78, edge = PAL.red, seed = 44 } = o;
  const sp = samplePath(path, 8);
  if (sp.total <= 0) return { head: [path[0][0], path[0][1], 0] };
  const Lv = sp.total * clamp(p);
  const head = pathAt(sp, Lv);
  if (Lv < 2 || (o.alpha ?? 1) <= 0) return { head };
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const wAt = (pt) => (pt.length > 2 ? pt[2] : width);
  const pts = pathSlice(sp, 0, Lv);
  const hw = pts.map((pt) => wAt(pt) / 2);
  const band = ribbon(pts.map((pt) => [pt[0], pt[1]]), hw);
  const sc = scaleOf(g);
  cut(g, band, PAL.paper, { rim: PAL.white, rimW: 2 });
  g.save(); g.clip(band);
  // 红边（随透视变细：两条细带）
  for (const side of [-1, 1]) {
    const edgePts = pts.map((pt, i) => {
      const nb = pts[Math.min(pts.length - 1, i + 1)], pb = pts[Math.max(0, i - 1)];
      const ang = Math.atan2(nb[1] - pb[1], nb[0] - pb[0]);
      const off = side * wAt(pt) * 0.36;
      return [pt[0] - Math.sin(ang) * off, pt[1] + Math.cos(ang) * off];
    });
    g.fillStyle = edge;
    g.fill(ribbon(edgePts, pts.map((pt) => Math.max(0.4, wAt(pt) * 0.03))));
  }
  // 文字 / 点纹
  let s = 6 - offset;
  let idx = 0;
  const seqLen = SEQ.length;
  let guard = 0;
  while (s < Lv && guard++ < 4000) {
    const item = SEQ[idx % seqLen];
    // 名字
    for (let i = 0; i < item.chars.length && s < Lv; i++) {
      const at = pathAt(sp, Math.max(0, s));
      const w = at.length > 3 ? at[3] : width;
      const size = w * (item.big ? 0.78 : 0.6);
      const advC = size * 0.82;
      const cs = s + advC / 2;
      if (cs > Lv - w * 0.4) { s = Lv; break; }
      if (cs >= 0) {
        const pc = pathAt(sp, cs);
        let ang = pc[2];
        while (ang > Math.PI) ang -= TAU;
        while (ang < -Math.PI) ang += TAU;
        const steep = Math.abs(Math.sin(ang)) > maxSteep || Math.abs(ang) > HALF_PI + 0.3;
        if (size * sc < minPx || steep) {
          g.fillStyle = rgba(PAL.inkSoft, 0.45);
          g.beginPath(); g.arc(pc[0], pc[1], Math.max(0.6, size * 0.13), 0, TAU); g.fill();
        } else {
          const rot = clamp(ang, -0.26, 0.26);
          paperGlyph(g, item.chars[i], pc[0], pc[1], size, { fill: item.big ? PAL.red : PAL.ink, edge: null, rot });
        }
      }
      s += advC;
    }
    // 圆点分隔
    const at = pathAt(sp, Math.max(0, s + width * 0.2));
    const w = at.length > 3 ? at[3] : width;
    if (s + w * 0.25 < Lv - w * 0.4 && s >= -w) {
      g.fillStyle = PAL.goldDark;
      g.beginPath(); g.arc(at[0], at[1], Math.max(0.8, w * 0.07), 0, TAU); g.fill();
    }
    s += w * 0.5;
    idx++;
  }
  g.restore();
  // 卷头小纸卷
  const hwHead = wAt(pts[pts.length - 1]) / 2;
  g.save();
  g.translate(head[0], head[1]); g.rotate(head[2]);
  const rr_ = Math.max(2, hwHead * 0.42);
  rollV(g, 0, 0, hwHead * 2 + 6, rr_, Lv / rr_ + t, { band: edge });
  g.restore();
  g.restore();
  return { head };
}

// ———————————————————— 片尾贴签 ————————————————————
export const CREDIT_LINES = PROJECT.credits || [PROJECT.title || '纸艺故事', '纸艺代码动画'];

/**
 * 片尾奶油贴签（paper 底、ink 框、缝线角）。锚 = 贴签中心。
 * o: { x, y, s, rot=-0.02, p 0..1（从下方滑上来贴住，outBack + 落定挤压）, slide=220（滑入距离 px）,
 *      lines：数字 0..4（逐行出现，小数为当前行进度）或 [0..1]×4, text=CREDIT_LINES, w=560, h=170, alpha }
 */
export function drawCreditLabel(g, o = {}) {
  const { p = 1, slide = 220, w = 560, h = 170, seed = 61 } = o;
  const text = o.text || CREDIT_LINES;
  const lp = Array.isArray(o.lines) ? o.lines : text.map((_, i) => clamp((o.lines ?? text.length) - i));
  if (p <= 0 || (o.alpha ?? 1) <= 0) return;
  const pe = clamp(p);
  const dy = (1 - outBack(pe, 1.4)) * slide;
  g.save();
  g.translate(o.x || 0, (o.y || 0) + dy);
  g.rotate(o.rot ?? -0.02);
  const s = o.s ?? 1; if (s !== 1) g.scale(s, s);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.globalAlpha *= clamp(pe * 4);
  const card = poly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { seed, amp: 1.0, step: 26 });
  cut(g, card, PAL.paper, { shadow: 3, rim: PAL.white, rimW: 2 });
  shade(g, card, PAL.paper2, -w / 2, -h / 2, w / 2, h / 2, 0, 0.7);
  // 墨框
  g.save();
  g.strokeStyle = PAL.ink; g.lineWidth = 2.6; g.lineJoin = 'round';
  g.stroke(poly([[-w / 2 + 10, -h / 2 + 10], [w / 2 - 10, -h / 2 + 10], [w / 2 - 10, h / 2 - 10], [-w / 2 + 10, h / 2 - 10]], { seed: seed + 1, amp: 0.7, step: 30 }));
  // 缝线角
  g.strokeStyle = PAL.kraftDark; g.lineWidth = 2; g.setLineDash([6, 5]); g.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx * (w / 2 - 20), cy = sy * (h / 2 - 20);
    g.beginPath(); g.moveTo(cx, cy - sy * 34); g.lineTo(cx, cy); g.lineTo(cx - sx * 44, cy); g.stroke();
  }
  g.setLineDash([]);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx * (w / 2 - 10), cy = sy * (h / 2 - 10);
    g.fillStyle = PAL.gold;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - sx * 14, cy); g.lineTo(cx, cy - sy * 14); g.closePath(); g.fill();
  }
  g.restore();
  // 文字
  const sizes = [32, 25, 25, 25];
  const ys = [-46, -12, 20, 52];
  text.forEach((str, i) => {
    const q = clamp(lp[i] ?? 0);
    if (q <= 0) return;
    const sz = sizes[i] ?? 25;
    const arr = [...str];
    glyphRow(g, arr, 0, (ys[i] ?? (-46 + i * 33)) + (1 - outCubic(q)) * 8, sz, {
      align: 'center', family: 'serif', fill: i === 0 ? PAL.redDark : PAL.ink, edge: null, gap: sz * 0.06,
      perChar: (k) => ({ alpha: clamp(q * (arr.length + 3) / 3 - k / 3) }),
    });
  });
  g.restore();
}

export { writeRow as _writeRow, rollH as _rollH, rollV as _rollV, pushPin as _pushPin, coinIcon as _coinIcon };
