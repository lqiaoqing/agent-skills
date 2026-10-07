// 小动物与小怪：史莱姆、蝙蝠、鸟（纸鸟 / 青鸟）、纸鸽、蜗牛、鸡、蝴蝶、萤火。
// 统一约定：o = { x, y, s=1, face=1(朝右), t, pose, expr, alpha, detail(1|0), joints, silhouette }；函数内 save/restore；返回锚点（世界坐标）。
// 光一律左上、投影右下；脸部统一画法：ink 竖椭圆眼 + 左上白高光、blush 腮红、ink 弧线嘴、ink 短弧眉。
import { PAL, ribbon, smooth as smoothPath, shade, glow, sparkle, rgba, mixHex } from '../core/paper.js';
import { clamp, lerp, TAU, hash1, hash2, noise1, fract, squash as squashOf, smoothstep } from '../core/util.js';
import { outBack, outQuad, inOutQuad, spring } from '../core/ease.js';

const D = Math.PI / 180;

// ———————————————————— 纸艺小工具（与 horse.js 同一套光照约定） ————————————————————
function dirOnScreen(g, sx, sy) {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  const lx = (m.d * sx - m.c * sy) / det, ly = (-m.b * sx + m.a * sy) / det;
  const L = Math.hypot(lx, ly) || 1;
  return [lx / L, ly / L];
}
const shadowDir = (g) => dirOnScreen(g, 0.36, 0.93);
const lightDir = (g) => dirOnScreen(g, -0.55, -0.83);
/** 一片剪纸：lift 暗色错位（只落在已画内容上）、rim 受光亮边、sh 背光渐变。 */
function piece(g, path, fill, o = {}) {
  const sd = shadowDir(g);
  if (o.lift) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(PAL.shadow, o.liftA ?? 0.2);
    g.translate(sd[0] * o.lift * 1.7, sd[1] * o.lift * 1.7);
    g.globalAlpha *= 0.45; g.fill(path);
    g.translate(-sd[0] * o.lift * 0.8, -sd[1] * o.lift * 0.8);
    g.globalAlpha /= 0.45; g.fill(path);
    g.restore();
  }
  g.fillStyle = fill;
  g.fill(path);
  if (o.sh) {
    const [cx, cy, r, a] = o.sh;
    shade(g, path, o.shC || PAL.shadow, cx - sd[0] * r, cy - sd[1] * r, cx + sd[0] * r, cy + sd[1] * r, 0, a);
  }
  if (o.rim) {
    const w = o.rimW ?? 2;
    g.save(); g.clip(path);
    g.translate(sd[0] * w * 0.95, sd[1] * w * 0.95);
    g.lineWidth = w * 1.6; g.strokeStyle = o.rim; g.globalAlpha *= o.rimA ?? 0.75; g.lineJoin = 'round';
    g.stroke(path);
    g.restore();
  }
}
function cutShape(pts, seed = 1, amp = 0.5) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  const q = pts.map((p, i) => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1, j = (hash2(seed, i) - 0.5) * 2 * amp; return [p[0] + (dx / d) * j, p[1] + (dy / d) * j]; });
  return smoothPath(q, { closed: true, tension: 0.5 });
}
const ell = (x, y, rx, ry, a = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), a, 0, TAU); return p; };
const fillEll = (g, x, y, rx, ry, a, c) => { g.fillStyle = c; g.fill(ell(x, y, rx, ry, a)); };
const strokePts = (g, pts, lw, c, closed = false) => {
  g.lineWidth = lw; g.strokeStyle = c; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (closed) g.closePath(); g.stroke();
};
const rotP = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const J = (o, k) => ((o.joints && o.joints[k]) || 0) * D;

/** 根变换参数（世界锚点换算）。 */
function R0(o) { const s = o.s ?? 1, f = o.face ?? 1; return { x: o.x ?? 0, y: o.y ?? 0, kx: s * f, ky: s, s, f }; }
const W = (R, p) => [R.x + p[0] * R.kx, R.y + p[1] * R.ky];
function begin(g, o, R) {
  g.save();
  if (o.alpha != null && o.alpha !== 1) g.globalAlpha *= clamp(o.alpha);
  g.translate(R.x, R.y); g.scale(R.kx, R.ky);
}
/** 姿态插值：{from,to,k} → 两个状态逐字段线性插值。 */
function poseBlend(o, fn) {
  const p = o.pose;
  if (p && typeof p === 'object') {
    const a = fn(p.from), b = fn(p.to), k = clamp(p.k ?? 0), out = {};
    for (const key of Object.keys(b)) out[key] = typeof b[key] === 'number' && typeof a[key] === 'number' ? lerp(a[key], b[key], k) : k < 0.5 ? a[key] ?? b[key] : b[key];
    return out;
  }
  return fn(p);
}

// ———————————————————— 统一的脸（w = 头宽） ————————————————————
function eyeInk(g, x, y, w, sc = 1) {
  const rx = 0.045 * w * sc, ry = 0.065 * w * sc;
  fillEll(g, x, y, rx, ry, 0, PAL.ink);
  const ld = lightDir(g);
  fillEll(g, x + ld[0] * rx * 0.42, y + ld[1] * ry * 0.42, Math.max(0.6, 0.018 * w * sc), Math.max(0.6, 0.018 * w * sc), 0, PAL.white);
}
/** 白眼仁 + 黑眼珠（乱转、惊吓用）。look = [dx,dy] ∈ [-1,1]。 */
function eyeWide(g, x, y, w, look = [0, 0], sc = 1) {
  const rx = 0.07 * w * sc, ry = 0.08 * w * sc;
  fillEll(g, x, y, rx, ry, 0, PAL.white);
  g.save(); g.lineWidth = 0.012 * w; g.strokeStyle = rgba(PAL.ink, 0.35); g.stroke(ell(x, y, rx, ry)); g.restore();
  const pr = rx * 0.55;
  const px = x + look[0] * (rx - pr) * 0.9, py = y + look[1] * (ry - pr) * 0.9;
  fillEll(g, px, py, pr, pr * 1.12, 0, PAL.ink);
  const ld = lightDir(g);
  fillEll(g, px + ld[0] * pr * 0.4, py + ld[1] * pr * 0.4, pr * 0.32, pr * 0.32, 0, PAL.white);
}
function eyeLine(g, x, y, w, kind) {
  const rx = 0.05 * w, ry = 0.065 * w, lw = 0.028 * w;
  g.save(); g.strokeStyle = PAL.ink; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'happy') g.arc(x, y + ry * 0.45, rx * 1.2, Math.PI * 1.15, Math.PI * 1.85);
  else if (kind === 'closed') g.arc(x, y - ry * 0.25, rx * 1.15, Math.PI * 0.18, Math.PI * 0.82);
  else if (kind === 'squeezeL') { g.moveTo(x - rx, y - ry * 0.55); g.lineTo(x + rx * 0.9, y); g.lineTo(x - rx, y + ry * 0.55); }
  else if (kind === 'squeezeR') { g.moveTo(x + rx, y - ry * 0.55); g.lineTo(x - rx * 0.9, y); g.lineTo(x + rx, y + ry * 0.55); }
  else if (kind === 'x') { g.moveTo(x - rx, y - rx); g.lineTo(x + rx, y + rx); g.moveTo(x + rx, y - rx); g.lineTo(x - rx, y + rx); }
  else if (kind === 'spiral') { g.lineWidth = lw * 0.6; for (let i = 0; i <= 30; i++) { const a = i * 0.36, r = 0.4 + (i / 30) * rx * 1.75; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x, y); } }
  g.stroke(); g.restore();
}
function blushAt(g, x, y, w) { fillEll(g, x, y, 0.085 * w, 0.05 * w, 0, rgba(PAL.blush, 0.45)); }
/** 嘴：smile / open / wavy / flat / grit。open = redDeep 口腔 + heart 舌头。 */
function mouth(g, x, y, w, kind = 'smile', open = 1) {
  const lw = 0.025 * w;
  g.save(); g.strokeStyle = PAL.ink; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'open' || kind === 'O') {
    const rx = (kind === 'O' ? 0.06 : 0.09) * w, ry = (kind === 'O' ? 0.07 : 0.06 + 0.04 * open) * w;
    const p = new Path2D();
    if (kind === 'O') p.ellipse(x, y, rx, ry, 0, 0, TAU);
    else { p.moveTo(x - rx, y - ry * 0.35); p.quadraticCurveTo(x, y - ry * 0.1, x + rx, y - ry * 0.35); p.quadraticCurveTo(x + rx * 0.7, y + ry * 1.1, x, y + ry); p.quadraticCurveTo(x - rx * 0.7, y + ry * 1.1, x - rx, y - ry * 0.35); }
    g.fillStyle = PAL.redDeep; g.fill(p);
    g.save(); g.clip(p); fillEll(g, x + rx * 0.1, y + ry * 0.85, rx * 0.65, ry * 0.5, 0, PAL.heart); g.restore();
  } else if (kind === 'wavy') {
    g.beginPath(); g.moveTo(x - 0.07 * w, y); g.quadraticCurveTo(x - 0.035 * w, y - 0.025 * w, x, y); g.quadraticCurveTo(x + 0.035 * w, y + 0.025 * w, x + 0.07 * w, y); g.stroke();
  } else if (kind === 'flat') {
    g.beginPath(); g.moveTo(x - 0.05 * w, y); g.lineTo(x + 0.05 * w, y); g.stroke();
  } else if (kind === 'grit') {
    const p = new Path2D(); p.roundRect(x - 0.08 * w, y - 0.025 * w, 0.16 * w, 0.05 * w, 0.02 * w);
    g.fillStyle = PAL.white; g.fill(p); g.stroke(p);
    g.beginPath(); g.moveTo(x, y - 0.025 * w); g.lineTo(x, y + 0.025 * w); g.stroke();
  } else {
    g.beginPath(); g.moveTo(x - 0.06 * w, y - 0.01 * w); g.quadraticCurveTo(x, y + 0.05 * w, x + 0.06 * w, y - 0.01 * w); g.stroke();
  }
  g.restore();
}
function brow(g, x, y, w, tilt = 0, lift = 0) {
  g.save(); g.strokeStyle = PAL.ink; g.lineWidth = 0.022 * w; g.lineCap = 'round';
  const hw = 0.055 * w;
  g.beginPath(); g.moveTo(x - hw, y - lift + tilt * hw); g.quadraticCurveTo(x, y - lift - 0.025 * w, x + hw, y - lift - tilt * hw); g.stroke();
  g.restore();
}

// ———————————————————— 史莱姆 ————————————————————
export const SLIME_EXPRS = ['normal', 'roll', 'angry', 'happy', 'scared', 'dizzy', 'x'];
const SLIME_PTS = [[-40, -3], [-42, -18], [-37, -35], [-25, -49], [-11, -58], [-1, -64], [6, -70], [9, -62], [22, -51], [36, -36], [42, -18], [40, -3], [22, 1.5], [0, 2.5], [-22, 1.5]];
let SLIME_SH = null;
const slimeShapes = () => SLIME_SH || (SLIME_SH = {
  body: cutShape(SLIME_PTS, 31, 0.5),
  core: cutShape([[-26, -18], [-24, -34], [-12, -46], [2, -52], [16, -44], [24, -30], [20, -16], [0, -10]], 32, 0.4),
  base: cutShape([[-42, -4], [-30, 4], [0, 6], [30, 4], [42, -4], [30, -1], [0, 0], [-30, -1]], 33, 0.3),
});

/**
 * 史莱姆（宽 80，s=1）。(x, y) = 底边中心（地面）。
 * o: pop 0..1（从草里弹出：跃起拉长 → 落地 spring 压扁 → 停稳）、hop（true 循环蹦 / 0..1 单次）、burst 0..1（炸成绿色水花）、
 *    eyes / expr：normal / roll（眼珠乱转；eyes: true 同 roll）/ angry / happy / scared / dizzy / x、hit 0..1（挨打压扁）、color（覆盖身体色）
 * 返回 { center, top, eyes:[[x,y],[x,y]], mouth, splash }。
 */
export function drawSlime(g, o = {}) {
  const R = R0(o);
  const t = o.t ?? 0, det = o.detail ?? 1;
  const pop = clamp(o.pop ?? 1), burst = clamp(o.burst ?? 0);
  const expr = o.eyes === true ? 'roll' : o.eyes || o.expr || 'normal'; // eyes: true = 眼珠乱转（assets.md 的写法）
  const S = slimeShapes();
  let lift = 0, sq = 0, tilt = J(o, 'tilt');
  // —— 弹出：0–0.45 跃起成弧，0.45 落地，之后 spring 回弹 ——
  if (pop < 1) {
    if (pop < 0.45) {
      const u = pop / 0.45;
      lift = 70 * (1 - u) ** 2 - 2 * 60 * u * (1 - u);
      sq = 0.32 * (1 - u) - 0.1 * u;
    } else {
      const e = ((pop - 0.45) / 0.55) * 0.9;
      sq = -0.34 * Math.exp(-e / 0.2) * Math.cos(TAU * 3.0 * e);
    }
  } else sq = 0.035 * Math.sin(t * 4.3) + 0.015 * Math.sin(t * 9.1);
  // —— 蹦跳 ——
  if (o.hop != null && o.hop !== false && pop >= 1) {
    const hp = o.hop === true ? fract(t / 0.62 + (o.seed || 0) * 0.37) : clamp(o.hop);
    if (hp < 0.18) sq = -0.22 * Math.sin((Math.PI * hp) / 0.18);
    else if (hp < 0.82) { const u = (hp - 0.18) / 0.64; lift = -36 * 4 * u * (1 - u); sq = 0.2 * (1 - u * 2) * (u < 0.5 ? 1 : 0.6); tilt += 0.12 * (0.5 - u); }
    else sq = -0.26 * Math.sin((Math.PI * (hp - 0.82)) / 0.18);
  }
  if (o.hit) sq -= 0.4 * clamp(o.hit);
  const [sx, sy] = squashOf(sq);
  const col = o.color || PAL.slime;
  const dark = mixHex(col, PAL.slimeDark, col === PAL.slime ? 1 : 0.6);
  const sil = !!o.silhouette;
  const out = { center: W(R, [0, -30 + lift]), top: W(R, [0, -66 * sy + lift]), eyes: [W(R, [-11, -30 + lift]), W(R, [13, -30 + lift])], mouth: W(R, [2, -18 + lift]), splash: W(R, [0, -26]) };
  begin(g, o, R);
  // —— 炸开 ——
  if (burst > 0) {
    drawSlimeBurst(g, burst, col, dark, t, o.seed || 0, sil);
    if (burst >= 0.12) { g.restore(); return out; }
  }
  const sw = burst > 0 ? 1 + 2.2 * burst : 1;
  g.save();
  if (pop < 0.6) { g.beginPath(); g.rect(-200, -400, 400, 403); g.clip(); }
  g.translate(0, lift);
  if (tilt) g.rotate(tilt);
  g.scale(sx * sw, sy / Math.sqrt(sw));
  if (sil) { g.fillStyle = o.silColor || PAL.ink; g.fill(S.body); g.restore(); g.restore(); return out; }
  // 半透明果冻：暗色底边 → 身体 → 亮芯 → 高光
  piece(g, S.body, col, { lift: det ? 2 : 0, sh: det ? [6, -26, 40, 0.38] : null, shC: dark, rim: det ? mixHex(col, PAL.white, 0.55) : null, rimW: 2.4 });
  if (det) {
    g.save(); g.clip(S.body);
    g.fillStyle = rgba(dark, 0.45); g.fill(S.base);
    g.globalAlpha *= 0.5; g.fillStyle = mixHex(col, PAL.leafLight, 0.6); g.fill(S.core);
    g.restore();
    fillEll(g, -19, -43, 9, 4.6, -0.75, rgba(PAL.white, 0.75));
    fillEll(g, -27, -33, 2.6, 2.6, 0, rgba(PAL.white, 0.7));
  }
  // 脸
  const w = 80;
  if (burst > 0) { eyeLine(g, -11, -30, w, 'x'); eyeLine(g, 13, -30, w, 'x'); mouth(g, 2, -16, w, 'O'); }
  else if (det === 0) { fillEll(g, -10, -30, 3.2, 4.6, 0, PAL.ink); fillEll(g, 12, -30, 3.2, 4.6, 0, PAL.ink); }
  else {
    if (expr !== 'dizzy' && expr !== 'x') { blushAt(g, -22, -20, w); blushAt(g, 25, -20, w); }
    if (expr === 'roll' || expr === 'scared') {
      const a = t * (expr === 'roll' ? 9 : 0);
      const l1 = expr === 'roll' ? [Math.cos(a), Math.sin(a)] : [0.2, -0.3];
      const l2 = expr === 'roll' ? [Math.cos(-a * 1.3 + 2), Math.sin(-a * 1.3 + 2)] : [0.2, -0.3];
      eyeWide(g, -11, -31, w, l1); eyeWide(g, 13, -31, w, l2);
      mouth(g, 2, -15, w, expr === 'roll' ? 'wavy' : 'O');
    } else if (expr === 'happy') { eyeLine(g, -11, -30, w, 'happy'); eyeLine(g, 13, -30, w, 'happy'); mouth(g, 2, -17, w, 'open', 0.6); }
    else if (expr === 'dizzy') { eyeLine(g, -11, -30, w, 'spiral'); eyeLine(g, 13, -30, w, 'spiral'); mouth(g, 2, -16, w, 'wavy'); }
    else if (expr === 'x') { eyeLine(g, -11, -30, w, 'x'); eyeLine(g, 13, -30, w, 'x'); mouth(g, 2, -16, w, 'flat'); }
    else if (expr === 'angry') {
      eyeInk(g, -11, -29, w, 1.15); eyeInk(g, 13, -29, w, 1.15);
      brow(g, -11, -39, w, -0.5); brow(g, 13, -39, w, 0.5);
      mouth(g, 2, -16, w, 'grit');
    } else { eyeInk(g, -11, -30, w, 1.15); eyeInk(g, 13, -30, w, 1.15); mouth(g, 2, -18, w, 'smile'); }
  }
  if (burst > 0) { g.globalAlpha *= clamp(burst / 0.12) * 0.6; g.fillStyle = PAL.white; g.fill(S.body); }
  g.restore();
  g.restore();
  return out;
}

function drawSlimeBurst(g, b, col, dark, t, seed, sil) {
  if (b < 0.12) return;
  const k = (b - 0.12) / 0.88, tau = k * 0.9;
  // 地上的一滩 + 溅起的水环
  g.save();
  const fade = (1 - k) ** 0.6;
  g.globalAlpha *= fade;
  g.fillStyle = sil ? PAL.ink : rgba(dark, 0.75);
  g.fill(cutShape([[-48 - 10 * k, -2], [-30, -9], [0, -11], [30, -9], [50 + 10 * k, -2], [30, 4], [0, 6], [-30, 4]], 34 + seed, 1));
  if (!sil) {
    g.lineWidth = 3 * (1 - k); g.strokeStyle = rgba(col, 0.9);
    g.beginPath(); g.ellipse(0, -2, 30 + 70 * outQuad(k), 7 + 12 * outQuad(k), 0, 0, TAU); g.stroke();
  }
  g.restore();
  // 水滴
  for (let i = 0; i < 16; i++) {
    const h1 = hash2(seed + 7, i), h2 = hash2(seed + 9, i), h3 = hash2(seed + 13, i);
    const a = -Math.PI / 2 + (h1 - 0.5) * 2.8;
    const v = 220 + 400 * h2;
    const x = Math.cos(a) * v * tau, y = -26 + Math.sin(a) * v * tau + 0.5 * 1500 * tau * tau;
    const r = (4 + 9 * h3) * (1 - k) ** 0.5;
    if (r < 0.5 || y > 4) continue;
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v + 1500 * tau;
    const ang = Math.atan2(vy, vx), stretch = 1 + Math.min(0.5, Math.hypot(vx, vy) / 1400);
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = sil ? PAL.ink : i % 4 === 0 ? dark : col; g.fill(ell(0, 0, r * stretch, r / Math.sqrt(stretch), 0));
    g.restore();
    if (!sil && r > 2.5) { const ld = lightDir(g); fillEll(g, x + ld[0] * r * 0.38, y + ld[1] * r * 0.38, r * 0.3, r * 0.3, 0, rgba(PAL.white, 0.85)); }
  }
  if (!sil && k < 0.25) sparkle(g, 0, -30, 26 * (1 - k / 0.25), { color: PAL.white, alpha: 1 - k / 0.25, rot: 0.3 });
}

// ———————————————————— 蝙蝠（正面） ————————————————————
export const BAT_POSES = ['fly', 'swoop', 'hang'];
let BAT_SH = null;
const batShapes = () => BAT_SH || (BAT_SH = {
  wing: cutShape([[0, -5], [10, -14], [24, -18], [37, -15], [47, -8], [41, -1], [35, 5], [29, 1], [23, 9], [17, 3], [9, 9], [1, 5]], 41, 0.4),
  body: cutShape([[-13, -4], [-11, -13], [-5, -17], [0, -16], [5, -17], [11, -13], [13, -4], [11, 8], [5, 14], [0, 15], [-5, 14], [-11, 8]], 42, 0.4),
  ear: cutShape([[-4, 0], [-2, -9], [1, -15], [3, -7], [4, 0]], 43, 0.2),
  face: cutShape([[-10, -2], [-7, -8], [0, -9], [7, -8], [10, -2], [7, 4], [0, 6], [-7, 4]], 44, 0.3),
});
/**
 * 蝙蝠（翼展 90，s=1）。(x, y) = 身体中心。pose：fly（扑翼）/ swoop（收翼俯冲）/ hang（倒挂）；flap = 扑翼相位（周期，默认 t·5.5）。
 * joints：{ wing（两翼抬起°）, tilt（身体倾斜°） }。返回 { center, mouth }。
 */
export function drawBat(g, o = {}) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = batShapes();
  const ph = o.flap ?? t * 5.5 + (o.seed || 0) * 0.37;
  const st = poseBlend(o, (p) => {
    if (p === 'swoop') return { wing: -38 + 6 * Math.sin(TAU * ph * 1.4), fold: 0.72, tilt: 32, bob: 0, ys: 0.95 };
    if (p === 'hang') return { wing: -70, fold: 0.5, tilt: 180, bob: Math.sin(t * 2) * 1.5, ys: 1 };
    return { wing: 34 * Math.sin(TAU * ph), fold: 1, tilt: 6 * Math.sin(TAU * ph + 1), bob: -3.5 * Math.sin(TAU * ph + Math.PI / 2), ys: 0.72 + 0.28 * Math.abs(Math.cos(TAU * ph)) };
  });
  const wingA = (st.wing + (o.joints?.wing || 0)) * D, tilt = (st.tilt + (o.joints?.tilt || 0)) * D;
  const sil = !!o.silhouette;
  const memb = sil ? PAL.ink : mixHex(PAL.bat, PAL.ink, 0.28), body = sil ? PAL.ink : PAL.bat;
  const out = { center: W(R, [0, st.bob]), mouth: W(R, rotP([0, 5], tilt).map((v, i) => v + [0, st.bob][i])) };
  begin(g, o, R);
  g.translate(0, st.bob); g.rotate(tilt);
  // 两翼（左翼镜像）
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * 10, -2); g.scale(side, 1); g.rotate(-wingA); g.scale(st.fold, st.ys);
    piece(g, S.wing, memb, { lift: det ? 1 : 0, rim: !sil && det ? mixHex(PAL.bat, PAL.magic, 0.5) : null, rimW: 1.4 });
    if (det && !sil) {
      g.strokeStyle = mixHex(PAL.bat, PAL.magic, 0.25); g.lineWidth = 1.3; g.lineCap = 'round';
      for (const q of [[35, 5], [23, 9], [9, 9]]) { g.beginPath(); g.moveTo(1, -3); g.lineTo(q[0], q[1] - 3); g.stroke(); }
    }
    g.restore();
  }
  // 耳朵、身体、脸
  for (const side of [-1, 1]) { g.save(); g.translate(side * 6.5, -13); g.rotate(side * 0.28); piece(g, S.ear, body, {}); if (det && !sil) fillEll(g, 0, -5, 1.3, 3.5, 0, mixHex(PAL.bat, PAL.blush, 0.45)); g.restore(); }
  piece(g, S.body, body, { lift: det ? 1.2 : 0, sh: det && !sil ? [0, 0, 16, 0.3] : null, rim: !sil && det ? mixHex(PAL.bat, PAL.magic, 0.55) : null, rimW: 1.6 });
  if (!sil) {
    g.save(); g.translate(0, -3);
    if (tilt > Math.PI / 2) g.rotate(Math.PI); // 倒挂时脸仍正着
    piece(g, S.face, mixHex(PAL.bat, PAL.magic, 0.6), {});
    const w = 40;
    if (det) {
      const ex = o.expr || (o.pose === 'swoop' ? 'angry' : 'normal');
      if (ex === 'happy') { eyeLine(g, -4.5, -2, w, 'happy'); eyeLine(g, 4.5, -2, w, 'happy'); }
      else { eyeInk(g, -4.5, -2, w, 1.1); eyeInk(g, 4.5, -2, w, 1.1); }
      if (ex === 'angry') { brow(g, -4.5, -6.6, w, -0.6); brow(g, 4.5, -6.6, w, 0.6); }
      blushAt(g, -7.5, 1.5, w); blushAt(g, 7.5, 1.5, w);
      mouth(g, 0, 2.6, w, 'smile');
      g.fillStyle = PAL.white;
      for (const sx of [-1.6, 1.6]) { g.beginPath(); g.moveTo(sx - 0.9, 3.2); g.lineTo(sx + 0.9, 3.2); g.lineTo(sx, 5.4); g.closePath(); g.fill(); }
    } else { fillEll(g, -4, -2, 1.6, 2.2, 0, PAL.ink); fillEll(g, 4, -2, 1.6, 2.2, 0, PAL.ink); }
    g.restore();
  }
  // 倒挂时的小脚爪
  if (o.pose === 'hang' && !sil) strokePts(g, [[-3, 14], [-3, 19], [-5, 21]], 1.4, mixHex(PAL.bat, PAL.ink, 0.4));
  g.restore();
  return out;
}

// ———————————————————— 鸟：纸鸟（挂线）/ 青鸟 ————————————————————
export const BIRD_POSES = ['fly', 'perch', 'hop', 'land', 'startle', 'glide'];
/** 青鸟（落脚点 → 身体中心）的偏移：身体中心在 (0, −BIRD_FEET·s)。 */
export const BIRD_FEET = 13;
let BIRD_SH = null;
const birdShapes = () => BIRD_SH || (BIRD_SH = {
  blueBody: cutShape([[-15, -6], [-12, -17], [-2, -24], [10, -25], [18, -18], [19, -8], [13, 1], [0, 4], [-12, 1]], 51, 0.4),
  belly: cutShape([[-6, -6], [2, -14], [12, -14], [17, -7], [12, 1], [0, 3], [-6, 0]], 52, 0.3),
  blueWing: cutShape([[3.5, 1], [5, -8], [3, -17], [-1, -25], [-4, -20], [-6, -11], [-5, -2]], 53, 0.3),
  tail: cutShape([[0, -2], [-10, -9], [-16, -10], [-14, -5], [-6, 2]], 54, 0.2),
  paperBody: (() => { const p = new Path2D(); p.moveTo(-24, -1); p.lineTo(-4, -8); p.lineTo(17, -3); p.lineTo(-2, 6); p.closePath(); return p; })(),
  paperNeck: (() => { const p = new Path2D(); p.moveTo(11, -5); p.lineTo(26, -19); p.lineTo(33, -15); p.lineTo(26, -14); p.lineTo(16, -1); p.closePath(); return p; })(),
  paperTail: (() => { const p = new Path2D(); p.moveTo(-14, -2); p.lineTo(-36, -15); p.lineTo(-20, 2); p.closePath(); return p; })(),
  paperWing: (() => { const p = new Path2D(); p.moveTo(-10, 0); p.lineTo(8, 0); p.lineTo(-4, -32); p.closePath(); return p; })(),
});
/**
 * 鸟。kind：'blue'（青鸟，长约 44；(x,y) = 落脚点）| 'paper'（挂线纸鸟，翼展约 60；(x,y) = 身体中心）。
 * pose：fly / perch / hop / land / startle / glide；flap 扑翼相位（默认 t 驱动）；thread（纸鸟吊线：true 画到画面上方，数字 = 线长 px）。
 * 返回 { center, feet, beak, threadTop }。
 */
export function drawBird(g, o = {}) {
  return (o.kind || 'blue') === 'paper' ? drawPaperBird(g, o) : drawBlueBird(g, o);
}

function drawBlueBird(g, o) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = birdShapes();
  const ph = o.flap ?? t * 7 + (o.seed || 0) * 0.31;
  const st = poseBlend(o, (p) => {
    // wing = 翅膀与“竖直向上”的夹角（°，向后为正）：上扬 20 → 平伸 90 → 下压 150；收拢时约 104
    if (p === 'fly') return { wing: 85 - 65 * Math.cos(TAU * ph), body: -8, lift: -10 + 2 * Math.sin(TAU * ph), puff: 1, feet: 0, head: 0 };
    if (p === 'glide') return { wing: 80, body: -4, lift: -10, puff: 1, feet: 0, head: 0 };
    if (p === 'land') return { wing: 22 + 12 * Math.sin(TAU * ph * 1.5), body: 14, lift: -4, puff: 1, feet: 1, head: 0 };
    if (p === 'startle') return { wing: 14 + 14 * Math.sin(TAU * ph * 2), body: -12, lift: -6, puff: 1.14, feet: 0.5, head: 0 };
    if (p === 'hop') { const h = fract(t / 0.5); return { wing: h < 0.6 ? 104 - 50 * Math.sin(Math.PI * h / 0.6) : 104, body: 0, lift: -14 * Math.sin(Math.PI * Math.min(1, h / 0.6)), puff: 1, feet: 1, head: 0 }; }
    // perch：偶尔低头啄一下、尾巴翘
    const k = Math.floor(t / 1.7), d = t - k * 1.7 - hash1(k + (o.seed || 0)) * 0.8;
    return { wing: 104, body: 0, lift: 0, puff: 1, feet: 1, head: d > 0 && d < 0.3 ? 22 * Math.sin(Math.PI * d / 0.3) : 0, tailUp: 6 * Math.sin(t * 3.1) };
  });
  const sil = !!o.silhouette;
  const C = (c) => (sil ? o.silColor || PAL.ink : c);
  const bodyA = (st.body + (o.joints?.body || 0)) * D;
  const out = { feet: W(R, [0, 0]), center: W(R, [0, -BIRD_FEET + st.lift]), beak: W(R, [21, -BIRD_FEET - 6 + st.lift]) };
  begin(g, o, R);
  g.translate(0, st.lift);
  // 脚
  if (st.feet > 0.05) {
    g.save(); g.globalAlpha *= clamp(st.feet);
    strokePts(g, [[-3, -3], [-4, 0], [-7, 1]], 1.6, C(PAL.goldDark)); strokePts(g, [[3, -3], [3, 0], [0, 1]], 1.6, C(PAL.goldDark));
    g.restore();
  }
  g.translate(0, -BIRD_FEET); g.rotate(bodyA); g.scale(st.puff, st.puff);
  // 尾、远翼、身体、肚皮、近翼、头部五官
  g.save(); g.translate(-12, -3); g.rotate(-((st.tailUp || 0) + 8) * D); piece(g, S.tail, C(PAL.roof), { lift: det ? 0.8 : 0 }); g.restore();
  const wing = (far) => {
    g.save(); g.translate(far ? 2 : -1, far ? -9 : -7);
    const a = (st.wing + (o.joints?.wing || 0) - (far ? 10 : 0)) * D;
    g.rotate(-a);
    const under = a > 120 * D;
    piece(g, S.blueWing, C(far ? mixHex(PAL.roof, PAL.ink, 0.25) : under ? mixHex(PAL.roof, PAL.skyDay, 0.45) : PAL.roof), { lift: far ? 0 : det ? 1 : 0, rim: far || sil || !det ? null : mixHex(PAL.roof, PAL.skyDay, 0.6), rimW: 1.2 });
    g.restore();
  };
  wing(true);
  piece(g, S.blueBody, C(PAL.skyDay), { lift: det ? 1.2 : 0, sh: det && !sil ? [2, -10, 16, 0.25] : null, shC: PAL.roof, rim: det && !sil ? PAL.white : null, rimW: 1.6 });
  if (!sil) { g.save(); g.clip(S.blueBody); g.fillStyle = PAL.white; g.fill(S.belly); g.restore(); }
  wing(false);
  g.save();
  g.translate(9, -14); g.rotate((st.head || 0) * D); g.translate(-9, 14);
  // 喙
  const bk = new Path2D(); bk.moveTo(17, -18); bk.lineTo(24, -15.5); bk.lineTo(17, -13.5); bk.closePath();
  g.fillStyle = C(PAL.gold); g.fill(bk);
  if (!sil) {
    const w = 30;
    if (det) {
      if (o.pose === 'startle') eyeWide(g, 10, -17, w, [0.3, -0.2], 1.3);
      else eyeInk(g, 10.5, -17, w, 1.25);
      blushAt(g, 12, -11, w);
    } else fillEll(g, 10.5, -17, 1.4, 2, 0, PAL.ink);
  }
  g.restore();
  g.restore();
  return out;
}

function drawPaperBird(g, o) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = birdShapes();
  const ph = o.flap ?? t * 2.6 + (o.seed || 0) * 0.29;
  const thread = o.thread;
  const sway = thread ? 0.12 * Math.sin(t * 1.7 + (o.seed || 0)) : 0;
  const sil = !!o.silhouette;
  const C = (c) => (sil ? o.silColor || PAL.ink : c);
  const wk = Math.sin(TAU * ph); // 1 = 翼向上，−1 = 向下（翻面露出背面）
  const len = thread === true ? 2000 : typeof thread === 'number' ? thread : 0;
  const out = { center: W(R, [0, 0]), beak: W(R, [33, -15]), threadTop: W(R, [0, -len]) };
  begin(g, o, R);
  if (len) {
    g.save(); g.strokeStyle = rgba(PAL.inkSoft, 0.7); g.lineWidth = 1.2 / (R.s || 1);
    g.beginPath(); g.moveTo(0, -len); g.lineTo(Math.sin(sway) * 4, -6); g.stroke(); g.restore();
    g.rotate(sway * 0.5);
  } else g.translate(0, -3 * wk);
  const wing = (far) => {
    g.save(); g.translate(far ? 3 : 0, -6);
    const k = far ? Math.sin(TAU * ph - 0.35) : wk;
    g.scale(1, k); g.rotate(far ? 0.15 : 0);
    const under = k < 0;
    piece(g, S.paperWing, C(under ? PAL.kraft : far ? PAL.paper2 : PAL.paper), { lift: det && !far ? 0.8 : 0 });
    if (det && !sil) { g.strokeStyle = rgba(PAL.kraftDark, 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-1, 0); g.lineTo(-4, -32); g.stroke(); }
    g.restore();
  };
  wing(true);
  piece(g, S.paperTail, C(PAL.paper2), { lift: det ? 0.6 : 0 });
  piece(g, S.paperBody, C(PAL.paper), { lift: det ? 1 : 0 });
  if (det && !sil) {
    g.save(); g.clip(S.paperBody); g.fillStyle = rgba(PAL.kraft, 0.55); g.beginPath(); g.moveTo(-24, -1); g.lineTo(17, -3); g.lineTo(-2, 6); g.closePath(); g.fill(); g.restore();
  }
  piece(g, S.paperNeck, C(PAL.paper), { lift: det ? 0.8 : 0 });
  if (!sil) {
    g.fillStyle = PAL.scarf; g.beginPath(); g.moveTo(30, -17); g.lineTo(33, -15); g.lineTo(29.5, -14.5); g.closePath(); g.fill();
    if (det) fillEll(g, 25.5, -16.5, 1.1, 1.5, 0, PAL.ink);
  }
  wing(false);
  g.restore();
  return out;
}

// ———————————————————— 纸鸽 ————————————————————
let DOVE_SH = null;
const doveShapes = () => DOVE_SH || (DOVE_SH = {
  body: cutShape([[-26, 2], [-20, -7], [-6, -12], [8, -12], [16, -16], [22, -22], [31, -20], [34, -13], [28, -6], [20, 3], [6, 9], [-12, 9]], 61, 0.4),
  tail: cutShape([[0, -3], [-14, -10], [-24, -10], [-28, -6], [-26, 0], [-28, 5], [-22, 8], [-12, 7], [0, 4]], 62, 0.3),
  wing: cutShape([[7, 3], [9, -10], [10, -24], [8, -38], [3, -53], [-2, -47], [-7, -42], [-7, -35], [-12, -31], [-11, -24], [-16, -20], [-14, -13], [-17, -8], [-10, -1], [-2, 5]], 63, 0.3),
});
/**
 * 纸鸽（翼展约 120，s=1）。(x, y) = 身体中心，朝右飞。flap 扑翼相位（默认 t·3.2）；
 * carry：叼着横幅的一端（true 或横幅底色），返回的 beak 就是横幅端点应接的点；carryColor/carryEdge 小纸条颜色。
 * joints：{ wing, body, head }。返回 { beak, center, tail }。
 */
export function drawDove(g, o = {}) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = doveShapes();
  const ph = o.flap ?? t * 3.2 + (o.seed || 0) * 0.41;
  // 翅膀与“竖直向上”的夹角（°，向后为正）：上扬 18 → 后平伸 90 → 下压 152（下拍快、上抬慢）
  const fp = fract(ph), down = fp < 0.42 ? inOutQuad(fp / 0.42) : 1 - inOutQuad((fp - 0.42) / 0.58);
  const wa = 18 + 134 * down + (o.joints?.wing || 0);
  const bob = -4 * Math.sin(TAU * ph + 0.6);
  const bodyA = ((o.joints?.body || 0) - 4 * Math.sin(TAU * ph + 0.2)) * D;
  const headA = (o.joints?.head || 0) * D;
  const sil = !!o.silhouette;
  const C = (c) => (sil ? o.silColor || PAL.ink : c);
  const beakL = rotP([35.5, -15], bodyA);
  const out = { beak: W(R, [beakL[0], beakL[1] + bob]), center: W(R, [0, bob]), tail: W(R, rotP([-27, 2], bodyA).map((v, i) => v + [0, bob][i])) };
  begin(g, o, R);
  g.translate(0, bob); g.rotate(bodyA);
  const wing = (far) => {
    g.save();
    g.translate(far ? 7 : 3, far ? -10 : -8);
    const a = (wa - (far ? 14 : 0)) * D;
    g.rotate(-a);
    const under = a > 112 * D;
    const fill = far ? mixHex(PAL.paper2, PAL.kraft, 0.25) : under ? mixHex(PAL.paper2, PAL.white, 0.45) : PAL.white;
    piece(g, S.wing, C(fill), { lift: det && !far ? 1 : 0, rim: !sil && det && !under && !far ? PAL.white : null, sh: det && !sil ? [0, -24, 26, far ? 0.2 : 0.1] : null, shC: PAL.kraftDark });
    if (det && !sil) {
      g.strokeStyle = rgba(PAL.kraftDark, 0.3); g.lineWidth = 0.9; g.lineCap = 'round';
      for (const q of [[-4, -44], [-9, -30], [-13, -16]]) { g.beginPath(); g.moveTo(2, -4); g.lineTo(q[0], q[1]); g.stroke(); }
    }
    g.restore();
  };
  wing(true);
  g.save(); g.translate(-18, 0); g.rotate(Math.sin(t * 2.3) * 0.06); g.translate(18, 0);
  piece(g, S.tail, C(PAL.paper), { lift: det ? 0.8 : 0, sh: det && !sil ? [-14, 0, 14, 0.18] : null, shC: PAL.kraftDark });
  g.restore();
  piece(g, S.body, C(PAL.white), { lift: det ? 1.2 : 0, sh: det && !sil ? [4, -2, 24, 0.22] : null, shC: PAL.kraftDark, rim: det && !sil ? PAL.paper : null, rimW: 1.4 });
  if (det && !sil) { g.strokeStyle = rgba(PAL.kraftDark, 0.3); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-20, 1); g.quadraticCurveTo(2, 6, 22, -6); g.stroke(); }
  // 头：喙、眼、腮红；叼着的纸条
  g.save(); g.translate(24, -14); g.rotate(headA); g.translate(-24, 14);
  const bk = new Path2D(); bk.moveTo(31, -17); bk.lineTo(37, -14.5); bk.lineTo(31, -12.5); bk.closePath();
  g.fillStyle = C(PAL.gold); g.fill(bk);
  if (!sil) {
    const w = 30;
    if (det) { eyeInk(g, 26, -17, w, 1.25); blushAt(g, 24, -10.5, w); }
    else fillEll(g, 26, -17, 1.3, 1.9, 0, PAL.ink);
  }
  if (o.carry) {
    const cc = typeof o.carry === 'string' ? o.carry : o.carryColor || PAL.skyDayLow;
    const tab = new Path2D(); tab.moveTo(33, -16.5); tab.lineTo(37, -15); tab.lineTo(36, -11); tab.lineTo(32, -12.5); tab.closePath();
    g.fillStyle = C(cc); g.fill(tab);
    g.strokeStyle = C(o.carryEdge || PAL.gold); g.lineWidth = 1; g.stroke(tab);
  }
  g.restore();
  wing(false);
  g.restore();
  return out;
}

// ———————————————————— 蜗牛（经验条） ————————————————————
let SNAIL_SH = null;
const snailShapes = () => SNAIL_SH || (SNAIL_SH = {
  shell: cutShape([[-18, 0], [-21, -12], [-16, -24], [-4, -31], [8, -29], [16, -20], [17, -8], [12, 0]], 71, 0.3),
});
/**
 * 小蜗牛（长约 64，s=1；屏幕 UI 里 s=1 就是 64px）。(x, y) = 腹足底边中心（压在经验条上沿）。
 * crawl 爬行相位（周期，默认 t·1.2）；crown true / 0..1（LV4 小王冠弹出）；expr normal / happy / effort / proud。
 * 返回 { head, crownTop, shellTop }。
 */
export function drawSnail(g, o = {}) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = snailShapes();
  const c = o.crawl ?? t * 1.2;
  const k = 0.5 - 0.5 * Math.cos(TAU * c); // 0 收拢 → 1 伸长
  const ext = 7 * k, bob = -1.6 * Math.sin(TAU * c);
  const sil = !!o.silhouette;
  const C = (cc) => (sil ? o.silColor || PAL.ink : cc);
  const bodyC = mixHex(PAL.sand, PAL.leafLight, 0.3), bodyD = mixHex(bodyC, PAL.earth, 0.35);
  const hx = 24 + ext, hy = -14;
  const crownK = o.crown === true ? 1 : clamp(o.crown || 0);
  const out = { head: W(R, [hx, hy]), crownTop: W(R, [hx + 1, hy - 29]), shellTop: W(R, [-4, -34 + bob]) };
  begin(g, o, R);
  // 腹足（伸缩）+ 头
  const foot = new Path2D();
  foot.moveTo(-30 + ext * 0.2, 0); foot.quadraticCurveTo(-32 + ext * 0.2, -6, -20, -8); foot.lineTo(hx - 8, -9);
  foot.quadraticCurveTo(hx - 6, hy - 10, hx + 2, hy - 10); foot.quadraticCurveTo(hx + 10, hy - 9, hx + 9, hy + 2);
  foot.quadraticCurveTo(hx + 8, -2, hx + 3, 0); foot.closePath();
  // 眼柄（远的先画）
  const stalk = (dx, len, far) => {
    const a = (-78 + (far ? 10 : -6) + 6 * Math.sin(t * 2.3 + (far ? 1 : 0))) * D;
    const bx = hx - 1 + dx, by = hy - 7;
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    strokePts(g, [[bx, by], [ex, ey]], 3, C(far ? bodyD : bodyC));
    return [ex, ey];
  };
  const eF = stalk(4, 15, true);
  piece(g, foot, C(bodyC), { lift: det ? 1 : 0, sh: det && !sil ? [0, -6, 24, 0.3] : null, shC: PAL.earth, rim: det && !sil ? PAL.white : null, rimW: 1.4 });
  const eN = stalk(-1, 17, false);
  // 壳（随爬行微微起伏）+ 螺纹
  g.save(); g.translate(-4, bob);
  piece(g, S.shell, C(PAL.kraft), { lift: det ? 1.4 : 0, sh: det && !sil ? [0, -14, 22, 0.35] : null, shC: PAL.earth, rim: det && !sil ? PAL.goldLight : null, rimW: 1.6 });
  if (!sil && det) {
    g.save(); g.strokeStyle = PAL.earth; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const a = -Math.PI * 0.5 + i * 0.32, r = 2 + i * 0.36; const x = -1 + Math.cos(a) * r, y = -15 + Math.sin(a) * r * 0.95; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  }
  g.restore();
  // 脸
  if (!sil) {
    const w = 52;
    const ex = o.expr || (crownK > 0.5 ? 'proud' : 'normal');
    for (const [e, far] of [[eF, true], [eN, false]]) {
      fillEll(g, e[0], e[1], 3.4, 3.4, 0, far ? bodyD : bodyC);
      if (ex === 'happy' || ex === 'proud') eyeLine(g, e[0], e[1] + 0.5, w, 'happy');
      else if (ex === 'effort') eyeLine(g, e[0], e[1], w, far ? 'squeezeL' : 'squeezeR');
      else if (det) eyeInk(g, e[0], e[1], w, 0.9); else fillEll(g, e[0], e[1], 1.6, 2.2, 0, PAL.ink);
    }
    if (det) { blushAt(g, hx + 2, hy - 1, w); mouth(g, hx + 5.5, hy + 1, w, ex === 'effort' ? 'flat' : 'smile'); }
  }
  // 小王冠（路径画）
  if (crownK > 0) {
    const sc = crownK >= 1 ? 1 : outBack(crownK, 2.4);
    g.save(); g.translate(hx + 1, hy - 18); g.scale(sc, sc); g.rotate(-0.12);
    const cr = new Path2D();
    cr.moveTo(-7, 0); cr.lineTo(-8, -9); cr.lineTo(-4, -4.5); cr.lineTo(0, -11); cr.lineTo(4, -4.5); cr.lineTo(8, -9); cr.lineTo(7, 0); cr.closePath();
    piece(g, cr, C(PAL.gold), { lift: 0.8, rim: sil ? null : PAL.goldLight, rimW: 1.2 });
    if (!sil) { fillEll(g, 0, -3, 1.6, 1.6, 0, PAL.red); for (const x of [-8, 0, 8]) fillEll(g, x, x ? -9.5 : -11.5, 1.3, 1.3, 0, PAL.goldLight); }
    g.restore();
  }
  g.restore();
  return out;
}

// ———————————————————— 鸡 ————————————————————
let CHICK_SH = null;
const chickShapes = () => CHICK_SH || (CHICK_SH = {
  body: cutShape([[-22, -24], [-18, -38], [-6, -46], [8, -48], [14, -58], [22, -62], [30, -56], [30, -46], [24, -38], [24, -24], [14, -14], [0, -11], [-14, -14]], 81, 0.4),
  tail: cutShape([[0, 0], [-6, -12], [-4, -22], [2, -14], [5, -24], [8, -12], [10, -2]], 82, 0.3),
  wing: cutShape([[0, 0], [-10, -3], [-18, 2], [-16, 9], [-6, 10], [2, 6]], 83, 0.3),
  comb: cutShape([[16, -60], [16, -66], [20, -65], [22, -70], [26, -66], [30, -67], [29, -60]], 84, 0.2),
});
/**
 * 鸡（高约 62，s=1）。(x, y) = 两脚中间的地面点，朝右。pose：walk / run（慌张扑翅）/ peck / idle；phase 步伐相位（默认 t 驱动）。
 * 返回 { head, beak }。
 */
export function drawChicken(g, o = {}) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = chickShapes();
  const pose = typeof o.pose === 'string' ? o.pose : 'walk';
  const rate = pose === 'run' ? 5.5 : pose === 'walk' ? 2.2 : 0;
  const ph = o.phase ?? t * rate;
  const st = poseBlend(o, (p) => {
    if (p === 'run') return { lean: 16, head: 2 * Math.sin(TAU * ph * 2), legA: 38, wing: 60 * Math.abs(Math.sin(TAU * ph * 1.6)), bob: -3 * Math.abs(Math.sin(TAU * ph)) };
    if (p === 'peck') { const k = fract(t / 0.9); return { lean: 30 * Math.sin(Math.PI * Math.min(1, k / 0.35)), head: 0, legA: 0, wing: 0, bob: 0 }; }
    if (p === 'idle') return { lean: 0, head: 1.5 * Math.sin(t * 2), legA: 0, wing: 0, bob: 0 };
    // walk：头“定住—前冲”
    const hk = fract(ph * 2);
    return { lean: 4, head: hk < 0.6 ? -3 + 6 * (hk / 0.6) : 3 - 6 * ((hk - 0.6) / 0.4), legA: 26, wing: 0, bob: -1.5 * Math.abs(Math.sin(TAU * ph)) };
  });
  const sil = !!o.silhouette;
  const C = (c) => (sil ? o.silColor || PAL.ink : c);
  const lean = (st.lean + (o.joints?.body || 0)) * D;
  const headP = rotP([22 + st.head, -52], lean);
  const out = { head: W(R, [headP[0], headP[1] + st.bob]), beak: W(R, rotP([35 + st.head, -50], lean).map((v, i) => v + [0, st.bob][i])) };
  begin(g, o, R);
  // 腿（两条交替）
  for (const [i, sgn] of [[0, 1], [1, -1]]) {
    const a = (sgn * st.legA * Math.sin(TAU * ph) + (o.joints?.[i ? 'legB' : 'legA'] || 0)) * D;
    const hipX = i ? 4 : -4, hipY = -14 + st.bob;
    const fx = hipX + Math.sin(a) * 14, fy = Math.min(0, hipY + Math.cos(a) * 14);
    const lift = Math.max(0, Math.sin(TAU * ph + (i ? Math.PI : 0))) * (pose === 'walk' || pose === 'run' ? 5 : 0);
    const col = C(i ? PAL.goldDark : mixHex(PAL.gold, PAL.goldDark, 0.3));
    strokePts(g, [[hipX, hipY], [fx, fy - lift]], 2.4, col);
    strokePts(g, [[fx - 5, fy - lift + 0.5], [fx, fy - lift], [fx + 6, fy - lift + 0.5]], 2, col);
  }
  g.translate(0, st.bob); g.rotate(lean);
  g.save(); g.translate(-18, -30); g.rotate(-0.4 + Math.sin(t * 3) * 0.05); piece(g, S.tail, C(PAL.paper2), { lift: det ? 0.8 : 0 }); g.restore();
  piece(g, S.body, C(PAL.white), { lift: det ? 1.2 : 0, sh: det && !sil ? [0, -30, 28, 0.22] : null, shC: PAL.kraftDark, rim: det && !sil ? PAL.paper : null, rimW: 1.4 });
  // 头部：鸡冠、肉垂、喙、眼
  g.save(); g.translate(st.head, 0);
  piece(g, S.comb, C(PAL.red), { lift: det ? 0.8 : 0, rim: sil ? null : mixHex(PAL.red, PAL.white, 0.4), rimW: 1 });
  fillEll(g, 31, -47, 2.6, 4, 0.2, C(PAL.red));
  const bk = new Path2D(); bk.moveTo(29, -55); bk.lineTo(37, -51); bk.lineTo(29, -48.5); bk.closePath();
  g.fillStyle = C(PAL.gold); g.fill(bk);
  if (!sil) {
    const w = 32;
    if (det) { if (pose === 'run') eyeWide(g, 24, -55, w, [0.4, -0.2], 1.2); else eyeInk(g, 24, -55, w, 1.15); blushAt(g, 22, -49, w); }
    else fillEll(g, 24, -55, 1.4, 2, 0, PAL.ink);
  }
  g.restore();
  // 翅膀
  g.save(); g.translate(2, -30); g.rotate(-st.wing * D); piece(g, S.wing, C(PAL.paper), { lift: det ? 1 : 0, rim: det && !sil ? PAL.white : null, rimW: 1.2 }); g.restore();
  g.restore();
  return out;
}

// ———————————————————— 纸蝴蝶 ————————————————————
let BFLY_SH = null;
const bflyShapes = () => BFLY_SH || (BFLY_SH = {
  up: cutShape([[0, -1], [5, -11], [14, -19], [21, -17], [21, -9], [14, -3], [4, 0]], 91, 0.3),
  low: cutShape([[0, 0], [10, 2], [16, 8], [13, 15], [6, 14], [1, 7]], 92, 0.3),
});
/**
 * 纸蝴蝶（翼展约 44，s=1）。(x, y) = 身体中心。color 翅膀主色（默认 princess），angle 航向（弧度），flap 扑翼相位（默认 t·5）。
 * 返回 { center }。
 */
export function drawButterfly(g, o = {}) {
  const R = R0(o), t = o.t ?? 0, det = o.detail ?? 1, S = bflyShapes();
  const ph = o.flap ?? t * 5 + (o.seed || 0) * 0.43;
  const k = 0.22 + 0.78 * Math.abs(Math.cos(Math.PI * ph));
  const col = o.color || PAL.princess;
  const sil = !!o.silhouette;
  const C = (c) => (sil ? o.silColor || PAL.ink : c);
  const out = { center: W(R, [0, 0]) };
  begin(g, o, R);
  g.rotate((o.angle || 0) + (o.joints?.body || 0) * D);
  for (const side of [-1, 1]) {
    g.save(); g.scale(side * k, 1);
    piece(g, S.low, C(mixHex(col, PAL.ink, 0.12)), { lift: det ? 0.6 : 0 });
    piece(g, S.up, C(col), { lift: det ? 0.8 : 0, rim: det && !sil ? mixHex(col, PAL.white, 0.5) : null, rimW: 1.1 });
    if (det && !sil) { fillEll(g, 13, -11, 3.6, 3, 0.4, rgba(PAL.white, 0.55)); fillEll(g, 9, 8, 2.2, 2, 0, rgba(PAL.white, 0.45)); }
    g.restore();
  }
  fillEll(g, 0, 1, 1.8, 8, 0, C(PAL.inkSoft));
  if (det) {
    g.strokeStyle = C(PAL.inkSoft); g.lineWidth = 0.9; g.lineCap = 'round';
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(side * 3, -12, side * 5, -14); g.stroke(); fillEll(g, side * 5, -14, 1, 1, 0, C(PAL.inkSoft)); }
  }
  g.restore();
  return out;
}

// ———————————————————— 萤火（给粒子 draw 回调） ————————————————————
/**
 * drawFirefly(g, x, y, s)：s 可为粒子状态（{size, age, p, r}，来自 burst/stream/field）或数字（缩放）。
 * magic 色光晕 + moon 色亮芯，按 age 闪烁、按 p 淡入淡出。
 */
export function drawFirefly(g, x, y, s = 1) {
  const st = typeof s === 'number' ? { size: 4 * s, age: 0, p: 0.5, r: 0.5 } : s;
  const size = st.size ?? 4, r = st.r ?? 0.5, age = st.age ?? st.depth ?? 0, p = st.p ?? 0.5;
  const tw = 0.55 + 0.45 * Math.sin(age * 8.5 + r * TAU) * Math.sin(age * 3.1 + r * 11);
  const fade = st.p == null ? 1 : Math.min(1, p * 6, (1 - p) * 4);
  const a = clamp(tw * fade);
  if (a <= 0.01) return;
  g.save();
  glow(g, x, y, size * 5.5, st.color || PAL.magic, 0.55 * a);
  g.globalAlpha *= a;
  g.fillStyle = PAL.moon; g.beginPath(); g.arc(x, y, size * 0.55, 0, TAU); g.fill();
  g.fillStyle = PAL.white; g.beginPath(); g.arc(x - size * 0.12, y - size * 0.12, size * 0.25, 0, TAU); g.fill();
  g.restore();
}
