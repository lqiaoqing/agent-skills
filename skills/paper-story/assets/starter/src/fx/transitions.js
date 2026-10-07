// 转场与冲击（docs/assets.md 第 12 节）：纸艺 × 复古 RPG —— 每一道转场都像一张纸被甩开、被剪开、被翻过、被烧掉、被撕开。
//
// 约定
// - 纯函数：画面只由参数（含 T / p）决定；随机一律 hash，噪声 noise1 / fbm1；函数内部 save/restore。
// - 坐标：屏幕逻辑坐标 1920×1080。所有函数在任意外层变换下都成立（模型图把整帧缩成小格也照样对）：
//   需要离屏缓冲时把 g 的当前变换抄进缓冲，羽化与投影按外层缩放换算。
// - 揭示类（whipCurtain / shapeReveal / pageTurn / splitScreen）：硬边用 g.clip（不占全屏缓冲），
//   羽化时用 ctx.mask（1 个缓冲）；pageTurn 的页背用 1 个 ctx.layer。drawNext(g2) 在揭示区里画“后一块画面”（自己先铺满背景，
//   内部可以再开 ctx.layer）。
// - 只用 PAL 颜色（深浅用 mixHex / rgba）。光从左上来，投影一律右下。
import { PAL, blob, ribbon, cut, shade, glow, scaleOf, smooth as smoothPath } from '../core/paper.js';
import { clamp, lerp, seg, hash2, noise1, fbm1, fract, TAU, rgba, mixHex } from '../core/util.js';
import { whip, outBack, outCubic, inCubic, inOutCubic, inOutSine, outExpo, inQuad } from '../core/ease.js';
import { shake as camShake } from '../core/camera.js';
import { burst } from '../core/particles.js';

const W = 1920, H = 1080;
const FULL = { x: 0, y: 0, w: W, h: H };
const DEG = Math.PI / 180;
/** 稳定随机：同一 (seed, i, k) 永远同一个值。 */
const R = (seed, i, k = 0) => hash2(seed * 131.7 + k * 17.31, i);

// ———————————————————— 公共小工具 ————————————————————
/** 外层缩放：正式镜头里 = 1；模型图缩略格里 = 缩略比例（canvas 的投影/羽化不吃变换，要手动乘）。 */
const outerScale = (g, ctx) => scaleOf(g) / ((ctx && ctx.dpr) || 1);
const pathOf = (pts, closed = true) => {
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
};
/** 形状之外（配 'evenodd' 用）。 */
function outsideOf(path) {
  const p = new Path2D();
  p.rect(-W * 4, -H * 4, W * 9, H * 9);
  p.addPath(path);
  return p;
}
function pointInPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** 整帧边界上的 16 个采样点都在多边形里 = 盖满全屏。 */
function polyCoversFrame(pts, m = 2) {
  for (let i = 0; i <= 4; i++) {
    const x = lerp(-m, W + m, i / 4);
    if (!pointInPoly(pts, x, -m) || !pointInPoly(pts, x, H + m)) return false;
  }
  for (let j = 1; j < 4; j++) {
    const y = lerp(-m, H + m, j / 4);
    if (!pointInPoly(pts, -m, y) || !pointInPoly(pts, W + m, y)) return false;
  }
  return true;
}
/**
 * 两头尖、一头略胖的细纸条（速度线、放射线的基本笔画）：从 (x0,y0) 到 (x1,y1)，最粗处半宽 w 位于 at（0..1）。
 * 只建路径，调用方 fill。
 */
function sliver(g, x0, y0, x1, y1, w, at = 0.6) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * w * 2, ny = (dx / L) * w * 2;
  const mx = x0 + dx * at, my = y0 + dy * at;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(mx + nx, my + ny, x1, y1);
  g.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  g.closePath();
}
/** 在当前裁剪区里画“上面那层纸”投下的影子：caster 是上层纸的形状（本体被裁剪掉，只剩右下方的影子）。 */
function castShadow(g, caster, rule, o = {}) {
  const s = scaleOf(g);
  g.save();
  g.shadowColor = rgba(PAL.shadow, o.alpha ?? 0.4);
  g.shadowBlur = (o.blur ?? 16) * s;
  g.shadowOffsetX = (o.dx ?? 5) * s;
  g.shadowOffsetY = (o.dy ?? 11) * s;
  g.fillStyle = PAL.shadow;
  g.fill(caster, rule);
  g.restore();
}
/** 纸条描边：右下暗色错位 + 本色 + 左上一道亮边。 */
function paperStroke(g, path, lw, color) {
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = lw;
  g.save(); g.translate(lw * 0.16 + 1, lw * 0.3 + 2); g.strokeStyle = rgba(PAL.shadow, 0.3); g.stroke(path); g.restore();
  g.strokeStyle = color; g.stroke(path);
  g.save(); g.translate(-lw * 0.13, -lw * 0.2); g.lineWidth = lw * 0.26; g.strokeStyle = rgba(mixHex(color, PAL.white, 0.55), 0.8); g.stroke(path); g.restore();
  g.restore();
}
/**
 * 用 path 揭示 drawFn 画的内容。无羽化：g.clip（零缓冲，抗锯齿边）；有羽化：ctx.mask（1 个缓冲，变换照抄）。
 * o: { feather(px), invert（画在形状之外）}
 */
function reveal(ctx, g, path, drawFn, o = {}) {
  const { feather = 0, invert = false } = o;
  if (feather > 0 && ctx) {
    const M = g.getTransform();
    ctx.mask(g, (mg) => { mg.setTransform(M); mg.fill(path); },
      (lg) => { lg.save(); lg.setTransform(M); drawFn(lg); lg.restore(); },
      { feather: feather * outerScale(g, ctx), invert });
    return;
  }
  g.save();
  if (invert) g.clip(outsideOf(path), 'evenodd'); else g.clip(path);
  drawFn(g);
  g.restore();
}

// ———————————————————— 冲击帧 ————————————————————
/** 冲击四级：震动振幅（px，噪声峰值）/ 闪白 / 闪白保持帧数 / 震动衰减（秒）/ 放射线条数、伸展半径、粗细、寿命。 */
export const IMPACT = {
  S: { shake: 8, flash: 0.25, frames: 1, decay: 0.22, rays: 10, reach: 430, rayW: 8, life: 0.24 },
  M: { shake: 14, flash: 0.5, frames: 1, decay: 0.3, rays: 14, reach: 640, rayW: 11, life: 0.3 },
  L: { shake: 22, flash: 0.8, frames: 1, decay: 0.4, rays: 18, reach: 880, rayW: 14, life: 0.38 },
  MAX: { shake: 32, flash: 1.0, frames: 2, decay: 0.5, rays: 26, reach: 1180, rayW: 18, life: 0.48 },
};

/**
 * 冲击帧：at 时刻打一下。写 ctx.fx（震动 / 闪白，多处同时写时取大者），可选同时画放射线。
 * level 'S' | 'M' | 'L' | 'MAX'（震动 8/14/22/32，闪白 0.25/0.5/0.8/1.0；MAX 闪白保持两帧）。
 * o: { g（给了就在 g 上画放射线，位置 x,y）, x, y, rays:false（不画线）, flashColor（默认 PAL.white）, shake / flash / decay（覆盖预设）,
 *      frames（闪白保持帧数，覆盖预设；例 b11 135.40「flash 1.0 持续 2 帧、shake 26」写 'L' + {shake:26, flash:1, frames:2}）,
 *      seed, fps（帧长，默认 30）, punch（推近量，例 0.03 → fx.zoom 1.03 并衰减）, apply:false（只算不写 fx，模型图用）,
 *      以及 impactRays 的选项 }
 * 返回 { k（0..1 衰减包络）, flash, shake:[dx,dy] }。
 */
export function impact(ctx, T, at, level = 'M', o = {}) {
  const L = IMPACT[level] || IMPACT.M;
  const age = T - at + 1e-4; // 正好落在帧上的 at 也算命中（浮点误差）
  if (age < 0) return { k: 0, flash: 0, shake: [0, 0] };
  const fd = 1 / (o.fps || 30);
  const amp = o.shake ?? L.shake, peak = o.flash ?? L.flash, decay = o.decay ?? L.decay;
  const sh = camShake(T, at, { amp, decay, freq: o.freq ?? 22, seed: o.seed ?? 1 });
  const hold = (o.frames ?? L.frames) * fd;
  const fl = age < hold ? peak : peak * 0.4 * Math.exp(-(age - hold) / 0.05);
  if (ctx && o.apply !== false) {
    const fx = ctx.fx;
    const cur = fx.shake || [0, 0];
    if (Math.hypot(sh[0], sh[1]) > Math.hypot(cur[0], cur[1])) fx.shake = sh;
    if (fl > (fx.flash || 0)) { fx.flash = fl; fx.flashColor = o.flashColor || PAL.white; }
    if (o.punch) fx.zoom = Math.max(fx.zoom || 1, 1 + o.punch * Math.exp(-age / 0.12));
  }
  if (o.g && o.rays !== false) impactRays(o.g, T, at, level, o);
  return { k: Math.exp(-age / decay), flash: fl, shake: sh };
}

/**
 * 冲击放射线（纸条式集中线）：从 (x, y) 向外射出、逐渐变细、尾巴追上头部后消失。
 * o: { x, y, seed, n（条数）, reach（px）, color（默认 PAL.white）, edge（暗色错位色，默认 PAL.ink；null 关）, r0（中心留空半径）, rot, alpha }
 */
export function impactRays(g, T, at, level = 'M', o = {}) {
  const L = IMPACT[level] || IMPACT.M;
  const age = T - at + 1e-4, life = o.life ?? L.life;
  if (age < 0 || age > life) return;
  const q = age / life;
  const { x = 960, y = 540, seed = 17, color = PAL.white, rot = 0, alpha = 1 } = o;
  const edge = o.edge === undefined ? PAL.ink : o.edge;
  const n = o.n ?? L.rays, reach = o.reach ?? L.reach, r0 = o.r0 ?? reach * 0.11;
  const head = outExpo(clamp(q * 1.25)), tail = inQuad(q);
  g.save();
  g.globalAlpha *= alpha * (1 - inQuad(q) * 0.4);
  for (let i = 0; i < n; i++) {
    const a = rot + ((i + 0.6 * R(seed, i, 1)) / n) * TAU;
    const len = reach * (0.42 + 0.58 * R(seed, i, 2));
    const ri = r0 + len * 0.15 * R(seed, i, 3) + (len - r0) * tail;
    const ro = r0 + len * head;
    if (ro - ri < 4) continue;
    const w = L.rayW * (0.45 + 0.9 * R(seed, i, 4)) * (1 - q * 0.55);
    const ca = Math.cos(a), sa = Math.sin(a);
    // 粗头在内（靠近冲击点），尖尾朝外
    if (edge) {
      g.fillStyle = rgba(edge, 0.3);
      sliver(g, x + ca * ri + 2, y + sa * ri + 4, x + ca * ro + 2, y + sa * ro + 4, w, 0.25);
      g.fill();
    }
    g.fillStyle = i % 5 === 2 ? PAL.goldLight : color;
    sliver(g, x + ca * ri, y + sa * ri, x + ca * ro, y + sa * ro, w, 0.25);
    g.fill();
  }
  g.restore();
}

// ———————————————————— 速度线 ————————————————————
/**
 * 手画速度线（引擎不做运动模糊，甩镜 / 奔跑用它）。
 * dir 'h' 横线 / 'v' 竖线；rect {x,y,w,h}（默认全屏，线被裁在里面）。
 * o: { t（秒；给了就沿走向流动）, density（每 100px 横截面的条数，默认 2.2）, alpha 0.7, color / colors[], len:[a,b]（占走向长度比例）,
 *      lw:[a,b]（最粗处半宽 px，默认 [1.5,5.5]）, speed（px/s）, sign（+1 朝 x/y 增大方向流动，-1 反向；粗头朝流动方向）, fade（横截面两侧渐隐 0..0.5）,
 *      ends（走向两端渐隐比例，默认 0.08）,
 *      mask:(c 0..1)=>强度（横截面分布）, shadow（暗色错位强度 0..1，默认 0）, seed, clip:false }
 */
export function speedLines(g, dir = 'h', rect = FULL, o = {}) {
  const rc = rect || FULL;
  const { density = 2.2, alpha = 0.75, seed = 3, speed = 2400, sign = 1, fade = 0.1, ends = 0.08, shadow = 0 } = o;
  const len = o.len || [0.16, 0.55], lw = o.lw || [1.5, 5.5];
  const colors = o.colors || [o.color || PAL.white];
  const horiz = dir !== 'v';
  const A = horiz ? rc.w : rc.h, C = horiz ? rc.h : rc.w;
  const n = Math.max(1, Math.round((C / 100) * density));
  const P = horiz ? (a, c) => [rc.x + a, rc.y + c] : (a, c) => [rc.x + c, rc.y + a];
  g.save();
  const ga = g.globalAlpha;
  if (o.clip !== false) { g.beginPath(); g.rect(rc.x, rc.y, rc.w, rc.h); g.clip(); }
  for (let i = 0; i < n; i++) {
    const c = (i + 0.15 + 0.7 * R(seed, i, 1)) / n;
    const a = alpha * (0.35 + 0.65 * R(seed, i, 6)) * (o.mask ? o.mask(c) : 1) * (fade > 0 ? clamp(Math.min(c, 1 - c) / fade) : 1);
    if (a < 0.01) continue;
    const Ln = lerp(len[0], len[1], R(seed, i, 2)) * A;
    const w = lerp(lw[0], lw[1], R(seed, i, 3) ** 1.6);
    const span = A + Ln;
    let tail = R(seed, i, 4) * span;
    if (o.t !== undefined) tail += sign * o.t * speed * (0.7 + 0.6 * R(seed, i, 5));
    tail = (((tail % span) + span) % span) - Ln;
    const [s0, s1] = sign >= 0 ? [tail, tail + Ln] : [tail + Ln, tail];
    // 走向两端渐隐：线快出 rect 时变淡，不被硬裁
    const mid = tail + Ln / 2, ef = ends > 0 ? clamp(Math.min(mid + Ln * 0.25, A - mid + Ln * 0.25) / (ends * A + Ln * 0.25)) : 1;
    if (ef <= 0.01) continue;
    g.globalAlpha = ga * ef;
    const cc = c * C, tilt = (R(seed, i, 7) - 0.5) * 0.02 * Ln;
    const p0 = P(s0, cc), p1 = P(s1, cc + tilt);
    if (shadow > 0) {
      g.fillStyle = rgba(PAL.ink, a * shadow * 0.5);
      sliver(g, p0[0] + 1.5, p0[1] + 3, p1[0] + 1.5, p1[1] + 3, w, 0.72);
      g.fill();
    }
    g.fillStyle = rgba(colors[i % colors.length], a);
    sliver(g, p0[0], p0[1], p1[0], p1[1], w, 0.72);
    g.fill();
  }
  g.restore();
}

// ———————————————————— 甩镜帘 ————————————————————
/**
 * 把 g 里沿走向坐标 src 处的一行（竖向带）/ 一列（横向带）像素拉长，铺到 [d0, d1] 区间（整帧宽）。
 * 读的是 g 自己的画布（之前画上去的老画面 / 新画面），只在变换没有旋转时做。
 */
function smearStrip(g, vert, src, d0, d1) {
  const cv = g.canvas;
  if (!cv) return;
  const M = g.getTransform();
  if (Math.abs(M.b) > 1e-6 || Math.abs(M.c) > 1e-6 || M.a <= 0 || M.d <= 0) return;
  const lo = Math.min(d0, d1), hi = Math.max(d0, d1);
  const sA = clamp(src, 2, (vert ? H : W) - 4);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (vert) {
    const x0 = Math.max(0, M.e), x1 = Math.min(cv.width, M.e + M.a * W);
    const sy = M.d * sA + M.f, sh = Math.max(1, M.d * 2);
    const y0 = M.d * lo + M.f, y1 = M.d * hi + M.f;
    if (x1 > x0 && y1 - y0 >= 1 && sy >= 0 && sy + sh <= cv.height) g.drawImage(cv, x0, sy, x1 - x0, sh, x0, y0, x1 - x0, y1 - y0);
  } else {
    const y0 = Math.max(0, M.f), y1 = Math.min(cv.height, M.f + M.d * H);
    const sx = M.a * sA + M.e, sw = Math.max(1, M.a * 2);
    const x0 = M.a * lo + M.e, x1 = M.a * hi + M.e;
    if (y1 > y0 && x1 - x0 >= 1 && sx >= 0 && sx + sw <= cv.width) g.drawImage(cv, sx, y0, sw, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }
  g.restore();
}

/** dir = 机位甩动方向 → 速度线带从哪条边出发（新画面从这一侧进来）。 */
export const WHIP_FROM = { down: 'bottom', up: 'top', left: 'left', right: 'right' };

/**
 * 甩镜帘：一条速度线带（默认 160px）从一边扫到另一边；带扫过的一侧是后一块画面（drawNext），带前方保持原画面。
 * o: { t0, t1（扫过的时间段）, dir:'down'|'up'|'left'|'right'（机位甩动方向，见 WHIP_FROM）, from:'bottom'|'top'|'left'|'right'（直接指定带的出发边，优先）,
 *      band 160, colors:[老画面颜色桥, 新画面颜色桥], ease（带的走位缓动，默认 inOutSine：0.15s 里每帧都看得见带；机位自己用 whip）,
 *      p（直接给进度 0..1，跳过 T）, density（带内条纹密度，默认 7）, smear（默认 true：把带两侧的画面像素拉成拖影；false 只画纯色带）,
 *      trail（整帧拖影线 0..1，默认 0.6）, seed }
 * 返回进度 p。p ≥ 1 时整帧画 drawNext。
 */
export function whipCurtain(ctx, g, T, o = {}, drawNext) {
  const { t0 = 0, t1 = 0.15, dir = 'down', band = 160, seed = 7, trail = 0.6 } = o;
  const p = clamp(o.p ?? (o.ease || inOutSine)(seg(T, t0, t1)));
  if (p <= 0) return 0;
  if (p >= 1) { if (drawNext) drawNext(g); return 1; }
  const from = o.from || WHIP_FROM[dir] || 'bottom';
  const vert = from === 'bottom' || from === 'top';
  const ext = vert ? H : W, cross = vert ? W : H;
  const fwd = from === 'bottom' || from === 'right' ? -1 : 1; // 带沿轴移动的方向
  const reach = band / 2 + band * 1.25;
  const c = lerp(fwd < 0 ? ext + reach : -reach, fwd < 0 ? -reach : ext + reach, p);
  const [cOld, cNew] = o.colors || [PAL.paper, PAL.inkSoft];
  const P = vert ? (a, k) => [k, a] : (a, k) => [a, k];
  // 1) 新画面：带已经扫过的一侧
  if (drawNext) {
    const a0 = fwd < 0 ? c : -80, a1 = fwd < 0 ? ext + 80 : c;
    g.save();
    g.beginPath();
    if (vert) g.rect(-80, a0, W + 160, a1 - a0); else g.rect(a0, -80, a1 - a0, H + 160);
    g.clip();
    drawNext(g);
    g.restore();
  }
  const e = 40, hb = band / 2;
  // 2) 拖影：把带两侧紧挨着的一行像素沿走向拉长铺进带里（老画面一半、新画面一半），像真甩镜的运动模糊
  if (o.smear !== false) {
    // 老画面拖影铺满整条带；新画面拖影从带的后缘铺到中线略过一点，分 14 级渐隐，两边自然混在一起（不留硬接缝）
    smearStrip(g, vert, c + fwd * (hb + 3), c + fwd * hb, c - fwd * hb);
    const n = 14, a0 = c - fwd * hb, a1 = c + fwd * hb * 0.35;
    for (let k = 0; k < n; k++) {
      g.save();
      g.globalAlpha *= 1 - k / n;
      smearStrip(g, vert, c - fwd * (hb + 3), lerp(a0, a1, k / n), lerp(a0, a1, (k + 1) / n));
      g.restore();
    }
  }
  g.save();
  // 3) 带底：老画面颜色 → 新画面颜色，两缘软（压在拖影上统一色调）
  const gOld = P(c + fwd * (hb + e), 0), gNew = P(c - fwd * (hb + e), 0);
  const grd = g.createLinearGradient(gOld[0], gOld[1], gNew[0], gNew[1]);
  const k0 = e / (band + 2 * e);
  const sm = o.smear !== false;
  grd.addColorStop(0, rgba(cOld, 0));
  grd.addColorStop(k0, rgba(cOld, sm ? 0.4 : 0.8));
  grd.addColorStop(0.5, rgba(mixHex(cOld, cNew, 0.5), sm ? 0.62 : 0.96));
  grd.addColorStop(1 - k0, rgba(cNew, sm ? 0.4 : 0.8));
  grd.addColorStop(1, rgba(cNew, 0));
  g.fillStyle = grd;
  const b0 = P(c - hb - e, -80), b1 = P(c + hb + e, cross + 80);
  g.fillRect(Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.abs(b1[0] - b0[0]), Math.abs(b1[1] - b0[1]));
  // 4) 带内条纹：沿走向的纸条，长短粗细不一，向带后方拖尾
  const n = Math.round((cross / 100) * (o.density ?? 7));
  const dark = mixHex(mixHex(cOld, cNew, 0.5), PAL.ink, 0.5);
  for (let i = 0; i < n; i++) {
    const k = ((i + R(seed, i, 1)) / n) * cross;
    const h = R(seed, i, 2);
    const Ln = band * (0.45 + 2.2 * h * h);
    const mid = c + (R(seed, i, 3) - 0.5) * band * 0.85 - fwd * Ln * 0.22;
    const w = 1.1 + 5.4 * R(seed, i, 4) ** 3;
    const pick = R(seed, i, 5);
    const col = pick < 0.34 ? cOld : pick < 0.68 ? cNew : pick < 0.86 ? PAL.white : dark;
    const a = (0.42 + 0.55 * R(seed, i, 6)) * (1 - 0.35 * h);
    const p0 = P(mid - (fwd * Ln) / 2, k), p1 = P(mid + (fwd * Ln) / 2, k + (R(seed, i, 7) - 0.5) * 3);
    g.fillStyle = rgba(col, a);
    sliver(g, p0[0], p0[1], p1[0], p1[1], w, 0.62);
    g.fill();
  }
  // 5) 整帧拖影：几条很长的淡线跟着带走，离带越远越淡
  if (trail > 0) {
    const m = Math.round((cross / 100) * 1.7);
    for (let i = 0; i < m; i++) {
      const k = ((i + R(seed + 3, i, 1)) / m) * cross;
      const Ln = ext * (0.22 + 0.45 * R(seed + 3, i, 2));
      const mid = c - fwd * (R(seed + 3, i, 3) - 0.35) * ext * 0.9;
      const fall = Math.exp(-Math.abs(mid - c) / (ext * 0.45));
      const a = trail * (0.08 + 0.2 * R(seed + 3, i, 4)) * fall;
      if (a < 0.01) continue;
      const p0 = P(mid - (fwd * Ln) / 2, k), p1 = P(mid + (fwd * Ln) / 2, k);
      g.fillStyle = rgba(i % 3 === 1 ? dark : PAL.white, a);
      sliver(g, p0[0], p0[1], p1[0], p1[1], 0.8 + 2.4 * R(seed + 3, i, 5), 0.6);
      g.fill();
    }
  }
  g.restore();
  return p;
}

// ———————————————————— 形状遮罩 ————————————————————
/** 参数心形的包围盒：x ∈ [−16, 16]，y ∈ [−17, 11.95]（y 向上）。 */
const HEART_H = 28.95, HEART_YC = -2.525;

/**
 * 遮罩形状的轮廓点（屏幕坐标）与 Path2D。shape: 'circle' | 'heart' | 'almond' | 'rect' | 'star' | 'keyhole'。
 * o: { cx, cy, size（包围盒高度；circle 为直径）, r（circle 半径，优先）, w, h（almond / rect 的宽高，优先）, rot（弧度）, radius（rect 圆角） }
 * 默认宽高比：heart 1.105、almond 1.444（洞口 520×360）、rect 16:9、star 1.05、keyhole 0.62。
 */
export function shapeGeom(shape = 'circle', o = {}) {
  const { cx = 960, cy = 540, rot = 0 } = o;
  const size = o.size ?? (o.r !== undefined ? o.r * 2 : o.h ?? 300);
  const pts = [];
  let smoothIt = false, circleR = 0;
  if (shape === 'circle') {
    circleR = o.r ?? size / 2;
    const n = 96;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([Math.cos(a) * circleR, Math.sin(a) * circleR]); }
  } else if (shape === 'heart') {
    const sc = size / HEART_H, n = 88;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU, s = Math.sin(t);
      const x = 16 * s * s * s;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([x * sc, -(y - HEART_YC) * sc]);
    }
    smoothIt = true;
  } else if (shape === 'almond') {
    const h = o.h ?? size, w = o.w ?? size * 1.444, k = h * 0.6667, n = 40;
    const bez = (t, y1) => { const u = 1 - t; return [-w / 2 * u * u * u + -w / 4 * 3 * u * u * t + (w / 4) * 3 * u * t * t + (w / 2) * t * t * t, y1 * 3 * u * t]; };
    for (let i = 0; i < n; i++) pts.push(bez(i / n, -k));
    for (let i = 0; i < n; i++) { const [x, y] = bez(1 - i / n, k); pts.push([x, y]); }
  } else if (shape === 'rect') {
    const h = o.h ?? size, w = o.w ?? size * (16 / 9);
    const rr_ = Math.min(o.radius ?? 0, w / 2, h / 2);
    if (rr_ <= 0.5) pts.push([-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]);
    else {
      const cs = [[w / 2 - rr_, -h / 2 + rr_, -Math.PI / 2], [w / 2 - rr_, h / 2 - rr_, 0], [-w / 2 + rr_, h / 2 - rr_, Math.PI / 2], [-w / 2 + rr_, -h / 2 + rr_, Math.PI]];
      for (const [x, y, a0] of cs) for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push([x + Math.cos(a) * rr_, y + Math.sin(a) * rr_]); }
    }
  } else if (shape === 'star') {
    // 五角星（尖朝上），尖端修圆：每个尖用一小段弧代替
    const ro = size / 1.809, ri = ro * 0.47, yc = -0.0955 * ro, tipR = ro * 0.1;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? ri : ro;
      if (i % 2) { pts.push([Math.cos(a) * r, Math.sin(a) * r - yc]); continue; }
      const ax = Math.cos(a) * (r - tipR * 1.6), ay = Math.sin(a) * (r - tipR * 1.6) - yc;
      for (let j = -3; j <= 3; j++) { const b = a + (j / 3) * 1.15; pts.push([ax + Math.cos(b) * tipR, ay + Math.sin(b) * tipR]); }
    }
  } else if (shape === 'keyhole') {
    const r = size * 0.3, ccy = -size * 0.2, th = Math.acos(0.42), bw = size * 0.25, n = 44;
    for (let i = 0; i <= n; i++) { const a = th - (i / n) * (TAU - 2 * th) ; pts.push([Math.cos(a) * r, ccy + Math.sin(a) * r]); }
    pts.push([-bw, size / 2], [bw, size / 2]);
  } else {
    return shapeGeom('circle', o);
  }
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const tp = pts.map(([x, y]) => [cx + x * cr - y * sr, cy + x * sr + y * cr]);
  let path;
  if (shape === 'circle') { path = new Path2D(); path.arc(cx, cy, Math.max(0, circleR), 0, TAU); }
  else path = smoothIt ? smoothPath(tp, { closed: true, tension: 0.5 }) : pathOf(tp);
  const covers = () => (shape === 'circle'
    ? [[0, 0], [W, 0], [0, H], [W, H]].every(([x, y]) => Math.hypot(x - cx, y - cy) <= circleR - 2)
    : polyCoversFrame(tp));
  return { pts: tp, path, size: shape === 'circle' ? circleR * 2 : size, covers };
}

/**
 * 让 shape 以 (cx, cy) 为中心盖满全屏所需的最小 size（二分），给“放大到满屏”的动画当终点。o 同 shapeGeom（w/h 会按比例缩放）。
 */
export function coverSize(shape = 'circle', o = {}) {
  const { cx = 960, cy = 540 } = o;
  if (shape === 'circle') return 2 * Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 8;
  const base = o.size ?? o.h ?? 300;
  const geo = (s) => shapeGeom(shape, { ...o, size: s, h: o.h !== undefined ? (o.h * s) / base : undefined, w: o.w !== undefined ? (o.w * s) / base : undefined, r: undefined });
  let lo = 1, hi = 400;
  while (!geo(hi).covers() && hi < 60000) hi *= 2;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (geo(mid).covers()) hi = mid; else lo = mid; }
  return hi * 1.01;
}

/**
 * 形状遮罩揭示：形状里面画 drawNext（invert:true 时画在形状外面，用于“圆窗拉出”）。
 * 硬边时，形状之外那层纸在洞里投一道右下的影子；可加纸条描边（heart 默认 heart 色、宽 = size × 0.04，跟着放大）。
 * shape 与 o 见 shapeGeom；另有 o: { feather（羽化 px，走 ctx.mask，不画投影）, invert, outline（true / 宽度 px / false）,
 *      outlineColor, shadow:false }
 * 返回 { full（新画面已盖满全屏）, path }。尺寸 ≤ 0 时什么也不画（invert 时整帧画 drawNext）。
 */
export function shapeReveal(ctx, g, shape = 'circle', o = {}, drawNext) {
  const { feather = 0, invert = false } = o;
  const geo = shapeGeom(shape, o);
  if (!(geo.size > 0.5)) { if (invert && drawNext) drawNext(g); return { full: !!invert, path: null }; }
  if (geo.covers()) {
    if (!invert && drawNext) drawNext(g);
    return { full: !invert, path: geo.path };
  }
  const k = clamp(geo.size / 300, 0.3, 1.6);
  const sh = o.shadow ?? !feather;
  reveal(ctx, g, geo.path, (lg) => {
    if (drawNext) drawNext(lg);
    if (sh) castShadow(lg, invert ? geo.path : outsideOf(geo.path), invert ? 'nonzero' : 'evenodd', { alpha: 0.42, blur: 18 * k, dx: 6 * k, dy: 12 * k });
  }, { feather, invert });
  const ol = o.outline ?? shape === 'heart';
  if (ol) {
    const lw = typeof ol === 'number' ? ol : geo.size * 0.04;
    paperStroke(g, geo.path, lw, o.outlineColor || (shape === 'heart' ? PAL.heart : PAL.paper));
  }
  return { full: false, path: geo.path };
}

// ———————————————————— 翻页 ————————————————————
function clipHalf(poly, F, n) { // 保留 (P−F)·n ≥ 0 的部分
  const out = [];
  const d = (P) => (P[0] - F[0]) * n[0] + (P[1] - F[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const da = d(A), db = d(B);
    if (da >= 0) out.push(A);
    if (da >= 0 !== db >= 0) { const t = da / (da - db); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
  }
  return out;
}
/** 翻起部分 → 页背的位置：沿折线反射，再朝折线压缩到 k 倍（透视里竖起来的纸看起来更窄）。 */
function foldMatrix(F, n, k) {
  const c = 1 + k, nx = n[0], ny = n[1];
  const s = c * (F[0] * nx + F[1] * ny);
  return new DOMMatrix([1 - c * nx * nx, -c * nx * ny, -c * nx * ny, 1 - c * ny * ny, s * nx, s * ny]);
}
const apply = (M, P) => [M.a * P[0] + M.c * P[1] + M.e, M.b * P[0] + M.d * P[1] + M.f];

/**
 * 翻页：折线从右往左扫过（dir 'left'；'right' 反向），右下角先掀起；折线右侧露出下一页（drawNext），
 * 翻起的部分折到左侧，画页背（paper2，隐约透出镜像的正面）+ 卷页亮带 + 投影；折线处在新页上投一道影子。
 * o: { t0, t1, p（直接给进度）, ease（默认 inOutSine）, dir:'left'|'right', rect（页面矩形，默认全屏；跨页右页翻完时页背正好落在左页上）,
 *      back（页背色，默认 PAL.paper2）, see（透出正面 0..1，默认 0.2）, tilt（起始倾角°，默认 14）, k0（起始压缩，默认 0.5） }
 * 需要 ctx（页背用 1 个图层）；返回进度 p。
 */
export function pageTurn(ctx, g, T, o = {}, drawNext) {
  const { t0 = 0, t1 = 0.55, dir = 'left', back = PAL.paper2, see = 0.2 } = o;
  const rc = o.rect || FULL;
  const p = clamp(o.p ?? (o.ease || inOutSine)(seg(T, t0, t1)));
  const pagePath = new Path2D(); pagePath.rect(rc.x, rc.y, rc.w, rc.h);
  if (p <= 0) return 0;
  if (p >= 1) { if (drawNext) { g.save(); g.clip(pagePath); drawNext(g); g.restore(); } return 1; }
  const tilt = (o.tilt ?? 14) * DEG * (1 - p);
  const k = lerp(o.k0 ?? 0.5, 1, inQuad(p));
  const half = rc.h / 2, tn = Math.tan(tilt);
  const xf = lerp(rc.x + rc.w + half * tn + 4, rc.x, p);
  // 先在“向左翻”的坐标里算，再按需镜像
  const F0 = [xf, rc.y + half], n0 = [Math.cos(tilt), Math.sin(tilt)];
  const rectPts = [[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x + rc.w, rc.y + rc.h], [rc.x, rc.y + rc.h]];
  const lifted0 = clipHalf(rectPts, F0, n0);
  if (lifted0.length < 3) return p;
  const A0 = foldMatrix(F0, n0, k);
  const flap0 = lifted0.map((P) => apply(A0, P));
  const D = Math.max(...lifted0.map((P) => (P[0] - F0[0]) * n0[0] + (P[1] - F0[1]) * n0[1]));
  const mir = dir === 'right';
  const mx = (P) => (mir ? [2 * rc.x + rc.w - P[0], P[1]] : P);
  const Mir = new DOMMatrix([-1, 0, 0, 1, 2 * rc.x + rc.w, 0]);
  const A = mir ? Mir.multiply(A0).multiply(Mir) : A0;
  const F = mx(F0), n = mir ? [-n0[0], n0[1]] : n0;
  const u = [-n[1], n[0]];
  const lifted = lifted0.map(mx), flap = flap0.map(mx);
  const flapPath = pathOf(flap);
  const s = outerScale(g, ctx);
  const M = g.getTransform();
  const kD = k * D;
  // 1) 页背（图层：自带右下投影）。先画它——它读的是 g 里还没被新页盖掉的老页。
  const drawFlap = (lg) => {
    lg.fillStyle = back;
    lg.fill(flapPath);
    if (see > 0 && g.canvas) {
      lg.save();
      lg.clip(flapPath);
      lg.setTransform(M.multiply(A).multiply(M.inverse()));
      lg.globalAlpha = see;
      lg.globalCompositeOperation = 'multiply';
      lg.drawImage(g.canvas, 0, 0);
      lg.restore();
    }
    if (kD > 1) {
      const e = [F[0] - n[0] * kD, F[1] - n[1] * kD];
      const hl = clamp(kD * 0.16, 10, 64) / kD;
      const grd = lg.createLinearGradient(F[0], F[1], e[0], e[1]);
      grd.addColorStop(0, rgba(PAL.ink, 0.2));
      grd.addColorStop(Math.min(0.3, hl * 0.35), rgba(PAL.white, 0.3));
      grd.addColorStop(Math.min(0.45, hl), rgba(PAL.white, 0.6));
      grd.addColorStop(Math.min(0.75, hl * 2.6), rgba(PAL.white, 0));
      grd.addColorStop(0.85, rgba(PAL.ink, 0));
      grd.addColorStop(1, rgba(PAL.ink, 0.14));
      lg.fillStyle = grd;
      lg.fill(flapPath);
    }
  };
  if (ctx) {
    ctx.layer(g, { shadow: { blur: 22 * s, dx: 7 * s, dy: 14 * s, color: rgba(PAL.shadow, 0.34) } }, (lg) => { lg.setTransform(M); drawFlap(lg); });
  }
  // 2) 新页：折线右侧（往页背方向多放 1px，避免接缝漏底）
  const liftedPad = clipHalf(rectPts.map(mx), [F[0] - n[0] * 1.2, F[1] - n[1] * 1.2], n);
  g.save();
  g.clip(pathOf(liftedPad));
  if (drawNext) drawNext(g);
  const sw = 26 + 90 * Math.sin(Math.PI * p);
  const sg = g.createLinearGradient(F[0], F[1], F[0] + n[0] * sw, F[1] + n[1] * sw);
  sg.addColorStop(0, rgba(PAL.shadow, 0.5));
  sg.addColorStop(0.35, rgba(PAL.shadow, 0.2));
  sg.addColorStop(1, rgba(PAL.shadow, 0));
  g.fillStyle = sg;
  g.fillRect(rc.x - 10, rc.y - 10, rc.w + 20, rc.h + 20);
  g.restore();
  if (!ctx) { g.save(); g.translate(5, 10); g.fillStyle = rgba(PAL.shadow, 0.25); g.fill(flapPath); g.restore(); drawFlap(g); }
  // 3) 折线上一道亮细线（卷起的圆边）
  g.save();
  g.clip(pagePath);
  g.beginPath();
  g.moveTo(F[0] - u[0] * 3000, F[1] - u[1] * 3000);
  g.lineTo(F[0] + u[0] * 3000, F[1] + u[1] * 3000);
  g.strokeStyle = rgba(PAL.white, 0.55);
  g.lineWidth = 2;
  g.stroke();
  g.restore();
  return p;
}

// ———————————————————— 燃烧边 ————————————————————
/**
 * 燃烧边：一条被噪声扰动的亮橙前沿推进；前沿之前纸面先烤黄，之后是焦黑卷曲的纸，再往后碎成灰片飞散（burst）。
 * rect：被烧的面板 {x,y,w,h}；p：0..1 前沿走完全程（可 >1，让最后的灰片飞完：p = (T − t0) / dur）。
 * 两种用法：
 *   ① o.draw(lg) 给出面板画法 → 本函数自己开 1 个 ctx.layer（o.layer 选项，默认 {shadow:10, texture:0.3}），在层里画面板再烧掉；
 *   ② 不给 o.draw → g 必须是“只有这块面板”的图层（例如 kit.itemBar 在镜头给的图层里画完后调用），本函数直接在 g 上擦除。
 * o: { dir:'left'（从右往左烧，默认）|'right'|'up'|'down', t（秒，火舌闪动）, dur（前沿扫过时长，默认 0.4s，用于灰片的飞行时间）,
 *      char（焦黑带宽 px）, flakes（灰片簇数）, glow（光晕强度，默认 1）, seed }
 * 返回 { u（前沿推进量 px）, edge:[x,y]（前沿中点，给火焰吐息对位）}。
 */
export function burnEdge(ctx, g, rect, p, o = {}) {
  const rc = rect || FULL;
  const { dir = 'left', t = 0, dur = 0.4, seed = 9 } = o;
  const glowAmt = o.glow ?? 1;
  const horiz = dir === 'left' || dir === 'right';
  const U = horiz ? rc.w : rc.h, V = horiz ? rc.h : rc.w;
  const charW = o.char ?? clamp(U * 0.06 + 22, 26, 62);
  const m = 34, span = U + charW + 2 * m;
  const u0 = -m + p * span;
  const G = horiz
    ? dir === 'left' ? (uu, v) => [rc.x + rc.w - uu, rc.y + v] : (uu, v) => [rc.x + uu, rc.y + v]
    : dir === 'up' ? (uu, v) => [rc.x + v, rc.y + rc.h - uu] : (uu, v) => [rc.x + v, rc.y + uu];
  const travel = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] || [-1, 0];
  const jag = (v) => fbm1(v / 70 + seed * 3.1, seed) * 28 + noise1(v / 17 + seed * 1.7, seed + 4) * 3 + noise1(v / 37 + t * 2.4, seed + 9) * 3;
  const cw = (v) => charW * (0.65 + 0.7 * (0.5 + 0.5 * noise1(v / 46 + 3.3, seed + 2)));
  const vs = [];
  for (let v = -16; v < V + 16; v += 7) vs.push(v);
  vs.push(V + 16);
  const eU = vs.map((v) => u0 + jag(v));
  const E = vs.map((v, j) => G(eU[j], v));
  const B = vs.map((v, j) => G(eU[j] - cw(v) - Math.abs(noise1(v / 8 + 1.3, seed + 6)) * 9, v));
  const erase = pathOf([...B, G(-900, vs[vs.length - 1]), G(-900, vs[0])]);
  const charP = pathOf([...E, ...B.slice().reverse()]);
  const edgeLine = pathOf(E, false);
  const live = clamp((u0 + 10) / 40) * clamp((U + charW * 0.6 - u0) / 50); // 前沿在面板内才有火
  if (p <= 0) { if (o.draw && ctx) { const M = g.getTransform(); ctx.layer(g, layerOpt(o.layer, g, ctx), (lg) => { lg.setTransform(M); o.draw(lg); }); } return { u: u0, edge: G(u0, V / 2) }; }

  const ops = (pl) => {
    pl.save();
    pl.lineJoin = 'round'; pl.lineCap = 'round';
    pl.globalCompositeOperation = 'destination-out';
    pl.fillStyle = PAL.ink;
    pl.fill(erase);
    pl.globalCompositeOperation = 'source-atop';
    // 前沿之前：纸被烤黄
    pl.strokeStyle = rgba(PAL.woodDark, 0.16); pl.lineWidth = 150; pl.stroke(edgeLine);
    pl.strokeStyle = rgba(PAL.earth, 0.3); pl.lineWidth = 70; pl.stroke(edgeLine);
    pl.strokeStyle = rgba(PAL.fire2, 0.38 * live); pl.lineWidth = 34; pl.stroke(edgeLine);
    // 焦黑带 + 带里的余烬裂纹
    pl.fillStyle = mixHex(PAL.ink, PAL.woodDark, 0.22);
    pl.fill(charP);
    pl.strokeStyle = rgba(PAL.fireDeep, 0.55 * live);
    pl.lineWidth = 1.6;
    for (let j = 2; j < vs.length - 2; j += 5) {
      const v = vs[j], d = cw(v) * (0.35 + 0.4 * R(seed, j, 3));
      const a = G(eU[j] - 3, v), b = G(eU[j] - d, v + (R(seed, j, 4) - 0.5) * 16);
      pl.beginPath(); pl.moveTo(a[0], a[1]); pl.lineTo(b[0], b[1]); pl.stroke();
    }
    // 前沿：外红 → 橙 → 亮芯
    pl.strokeStyle = rgba(PAL.fireDeep, 0.9); pl.lineWidth = 16; pl.stroke(edgeLine);
    pl.strokeStyle = PAL.fire; pl.lineWidth = 8.5; pl.stroke(edgeLine);
    pl.strokeStyle = PAL.fire2; pl.lineWidth = 3.4; pl.stroke(edgeLine);
    pl.restore();
    // 碎裂线外侧翘起的焦边（小卷片，属于面板层，跟着面板投影）
    pl.save();
    const back = [-travel[0], -travel[1]];
    for (let j = 1; j < vs.length - 1; j += 2) {
      if (R(seed, j, 5) < 0.35) continue;
      const P0 = B[j], v = vs[j];
      if (v < 0 || v > V) continue;
      const sz = 5 + 7 * R(seed, j, 6);
      const side = [-back[1], back[0]];
      const a = [P0[0] + side[0] * sz * 0.6, P0[1] + side[1] * sz * 0.6], b = [P0[0] - side[0] * sz * 0.6, P0[1] - side[1] * sz * 0.6];
      const tip = [P0[0] + back[0] * sz * 1.1 - side[0] * sz * 0.4, P0[1] + back[1] * sz * 1.1 - side[1] * sz * 0.4 - sz * 0.3];
      pl.beginPath();
      pl.moveTo(a[0], a[1]);
      pl.quadraticCurveTo(tip[0], tip[1], b[0], b[1]);
      pl.quadraticCurveTo(P0[0] + back[0] * sz * 0.3, P0[1] + back[1] * sz * 0.3, a[0], a[1]);
      pl.fillStyle = j % 3 ? PAL.ink : mixHex(PAL.ink, PAL.woodDark, 0.4);
      pl.fill();
    }
    pl.restore();
  };

  if (o.draw && ctx) {
    const M = g.getTransform();
    ctx.layer(g, layerOpt(o.layer, g, ctx), (lg) => { lg.setTransform(M); o.draw(lg); ops(lg); });
  } else ops(g);

  // —— 面板之外：光晕、火舌、火星、灰片 ——
  g.save();
  if (live > 0) {
    const mid = E[Math.floor(E.length / 2)];
    glow(g, mid[0], mid[1], V * 0.62, PAL.fire, 0.2 * glowAmt * live);
    for (let j = 0; j < E.length; j += 5) {
      const f = 0.75 + 0.25 * noise1(t * 6 + j * 0.7, seed + 11);
      glow(g, E[j][0], E[j][1], 62 * f, PAL.fire2, 0.26 * glowAmt * live);
    }
    // 火舌：三层剪纸火（外 fireDeep → fire → 内 fire2），基本朝上、略向推进方向倾，高矮交替、随 t 摇曳
    const fdx = travel[0] * 0.7, fdy = travel[1] * 0.7 - 0.72;
    const fl = Math.hypot(fdx, fdy), dx = fdx / fl, dy = fdy / fl;
    for (let j = 2; j < E.length - 2; j += 5) {
      const v = vs[j];
      if (v < 10 || v > V - 10) continue;
      const f = 0.6 + 0.4 * (0.5 + 0.5 * noise1(t * 7.5 + j * 1.31, seed + 13));
      const tall = j % 10 === 2;
      const hgt = (tall ? 46 + 34 * R(seed, j, 7) : 24 + 18 * R(seed, j, 7)) * f * live;
      if (hgt < 6) continue;
      const b0 = E[j];
      const sway = noise1(t * 5 + j * 0.9, seed + 17) * hgt * 0.32;
      const w0 = (9 + 6 * R(seed, j, 8)) * (0.75 + 0.25 * f);
      for (const [col, hk, wk, al] of [[PAL.fireDeep, 1, 1, 0.92], [PAL.fire, 0.82, 0.72, 1], [PAL.fire2, 0.52, 0.42, 1]]) {
        const h = hgt * hk;
        // 火舌：底宽尖细，尖端 S 形甩开
        const pts = [0, 0.25, 0.5, 0.75, 1].map((k) => {
          const off = sway * (Math.sin(Math.PI * k) * 0.55 + k * k);
          return [b0[0] + dx * h * k - dy * off, b0[1] + dy * h * k + dx * off];
        });
        cut(g, ribbon(pts, (q) => w0 * wk * (1 - q) ** 0.6 * Math.min(1, 0.6 + q * 4) + 0.3), col, { alpha: al });
      }
    }
    // 火星：从前沿往上飘
    for (let i = 0; i < 16; i++) {
      const ph = fract(t * 1.5 + R(seed + 5, i, 1));
      const v = R(seed + 5, i, 2) * V;
      const b0 = G(u0 + jag(v) - 4, v);
      const x = b0[0] - travel[0] * ph * 26 + Math.sin(t * 9 + i) * 4, y = b0[1] - ph * (50 + 70 * R(seed + 5, i, 3));
      g.globalAlpha = (1 - ph) * live;
      g.fillStyle = i % 2 ? PAL.fire2 : PAL.goldLight;
      g.beginPath(); g.arc(x, y, 1.6 + 2 * (1 - ph), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  // 灰片：每一簇在碎裂线经过它的那一刻炸开（虚拟时间 = p × dur）
  const tau = p * dur;
  const nc = o.flakes ?? clamp(Math.round(U / 26), 8, 40);
  const backA = Math.atan2(-travel[1], -travel[0]);
  for (let ci = 0; ci < nc; ci++) {
    const uc = ((ci + R(seed + 7, ci, 1)) / nc) * U;
    const vc = (0.06 + 0.88 * R(seed + 7, ci, 2)) * V;
    const pc = (uc + m + charW) / span;
    if (pc > p) continue;
    const [bx, by] = G(uc, vc);
    burst(g, tau, {
      at: pc * dur, seed: seed * 97 + ci, count: 6, x: bx, y: by, spread: 9,
      speed: [40, 170], angle: [backA - 1.25, backA + 0.35], gravity: -60, drag: 1.5, life: [0.45, 1.05], spin: [-7, 7], size: [4, 11],
    }, drawAsh);
  }
  g.restore();
  return { u: u0, edge: G(u0 + jag(V / 2), V / 2) };
}
function layerOpt(lo = { shadow: 10, texture: 0.3 }, g, ctx) {
  const s = outerScale(g, ctx);
  const sh = typeof lo.shadow === 'number' ? { blur: lo.shadow * 1.5 * s, dx: lo.shadow * 0.35 * s, dy: lo.shadow * 0.85 * s, color: rgba(PAL.shadow, 0.3) } : lo.shadow;
  return { ...lo, shadow: sh };
}
/** 灰片：不规则的小纸片，焦黑或灰，个别还带着一圈暗红余烬。给 burst/stream 当 draw 回调也行。 */
export function drawAsh(g, x, y, s) {
  const a = (1 - s.p) ** 0.8;
  if (a <= 0.02) return;
  g.save();
  g.translate(x, y);
  g.rotate(s.rot);
  g.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(s.rot * 1.7)));
  const r = s.size * 0.5;
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * TAU + hash2(s.i, k) * 0.9;
    const rr_ = r * (0.6 + 0.5 * hash2(s.i + 5, k));
    if (k) g.lineTo(Math.cos(ang) * rr_, Math.sin(ang) * rr_); else g.moveTo(Math.cos(ang) * rr_, Math.sin(ang) * rr_);
  }
  g.closePath();
  g.globalAlpha *= a;
  g.fillStyle = s.r < 0.5 ? PAL.ink : s.r < 0.8 ? PAL.inkSoft : mixHex(PAL.stoneDark, PAL.ink, 0.35);
  g.fill();
  if (s.r > 0.55 && s.p < 0.5) {
    g.strokeStyle = rgba(PAL.fire, (1 - s.p * 2) * 0.9);
    g.lineWidth = 1.4;
    g.stroke();
  }
  g.restore();
}

// ———————————————————— 撕纸 ————————————————————
/**
 * 撕口几何：沿 pts（折线，≥2 点）的锯齿裂口。p 0..1：先从 origin 处沿线裂开（grow），再张开（open）。
 * o: { origin（0..1，从哪儿开始裂，默认 0.5）, width（最大半宽 px，默认 0.2 × 线长）, tooth（齿距 px，默认 13）, grow, open（直接覆盖）, seed }
 * 返回 { hole:Path2D, holePts, sideA, sideB, normals, center, ws, open, grow, len }。
 */
export function tearGeom(pts, p, o = {}) {
  const { seed = 4, origin = 0.5, tooth = 13 } = o;
  const Ls = [0];
  for (let i = 1; i < pts.length; i++) Ls.push(Ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = Ls[Ls.length - 1] || 1;
  const at = (s) => {
    let i = 1;
    while (i < Ls.length - 1 && Ls[i] < s) i++;
    const k = clamp((s - Ls[i - 1]) / (Ls[i] - Ls[i - 1] || 1));
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const tx = x2 - x1, ty = y2 - y1, tl = Math.hypot(tx, ty) || 1;
    return { x: lerp(x1, x2, k), y: lerp(y1, y2, k), nx: -ty / tl, ny: tx / tl, tx: tx / tl, ty: ty / tl };
  };
  const grow = clamp(o.grow ?? p / 0.35);
  const open = clamp(o.open ?? outCubic(clamp((p - 0.1) / 0.9)));
  const wMax = o.width ?? L * 0.2;
  const sO = origin * L, sa = sO * (1 - grow), sb = sO + grow * (L - sO);
  const step = tooth * 0.8;
  const n = Math.max(2, Math.round((sb - sa) / step));
  const sideA = [], sideB = [], normals = [], center = [], ws = [];
  for (let j = 0; j <= n; j++) {
    const s = lerp(sa, sb, j / n), uu = j / n;
    const P = at(s);
    const env = Math.sin(Math.PI * uu) ** 0.6;
    const w = wMax * open * env * (1 + 0.22 * fbm1(s / 90 + seed * 2.3, seed + 3));
    // 撕边：不规则的齿（交替 + 随机 + 偶尔崩掉一大块），齿号按弧长取，口子长大时齿不跳
    const id = Math.round(s / step), zig = id % 2 ? 1 : -1;
    const amp = (1.2 + 0.16 * w) * Math.sqrt(env);
    const chipA = R(seed, id, 3) > 0.86 ? 2.2 : 1, chipB = R(seed, id, 4) > 0.86 ? 2.2 : 1;
    const wa = Math.max(0, w + amp * chipA * (0.55 * zig + 0.9 * (R(seed, id, 1) - 0.5)));
    const wb = Math.max(0, w + amp * chipB * (-0.55 * zig + 0.9 * (R(seed, id, 2) - 0.5)));
    sideA.push([P.x + P.nx * wa, P.y + P.ny * wa]);
    sideB.push([P.x - P.nx * wb, P.y - P.ny * wb]);
    normals.push([P.nx, P.ny, P.tx, P.ty]);
    center.push([P.x, P.y]);
    ws.push(w);
  }
  const holePts = [...sideA, ...sideB.slice(1, -1).reverse()];
  return { hole: pathOf(holePts), holePts, sideA, sideB, normals, center, ws, open, grow, len: L };
}

/**
 * 纸面撕裂：锯齿口随 p 扩大；口子两侧的纸一片片向外翻卷（露纸背、尖边是白色纤维、右下投影），口子里是 inside。
 * pts：撕裂线（折线）。o: tearGeom 的选项 + { inside（颜色，或 (g, holePath) => 画口子里的东西，已裁剪；默认 PAL.ink）,
 *      back（纸背色，默认 PAL.paper2；丝绒幕可给 PAL.redDeep）, fiber（纤维色，默认 PAL.white）, curl（翻卷深度比例，默认 0.6）, crack（裂纹色）}
 * 返回 tearGeom 的结果（hole 可给镜头做遮罩，例如龙头从口子里撞出来）。
 */
export function paperTear(g, pts, p, o = {}) {
  const geo = tearGeom(pts, p, o);
  if (p <= 0 || geo.grow <= 0) return geo;
  const { seed = 4, curl = 0.6 } = o;
  const back = o.back || PAL.paper2, fiber = o.fiber || PAL.white;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // 1) 口子里
  if (geo.open > 0.01) {
    g.save();
    g.clip(geo.hole);
    if (typeof o.inside === 'function') o.inside(g, geo.hole);
    else { g.fillStyle = o.inside || PAL.ink; g.fill(geo.hole); }
    castShadow(g, outsideOf(geo.hole), 'evenodd', { alpha: 0.55, blur: 10, dx: 4, dy: 8 });
    g.restore();
  }
  // 2) 细裂纹（还没张开时最明显）
  const crackA = clamp(1 - geo.open * 2.5);
  if (crackA > 0.02) {
    g.strokeStyle = rgba(o.crack || PAL.ink, 0.85 * crackA);
    g.lineWidth = 2.2;
    g.stroke(pathOf(geo.sideA, false));
  }
  if (geo.open > 0.02) {
    // 3) 翻卷的纸片：一段撕边一片，底边贴着口子、外缘毛糙；少数段不翻，只露白纤维
    const flaps = [], bare = [];
    for (const [side, sgn, sd] of [[geo.sideA, 1, seed], [geo.sideB, -1, seed + 50]]) {
      let j = 0, c = 0;
      while (j < side.length - 1) {
        const j1 = Math.min(side.length - 1, j + 5 + Math.floor(R(sd, c, 3) * 5));
        const base = side.slice(j, j1 + 1);
        if (R(sd, c, 6) < 0.22 || base.length < 3) { bare.push(base); j = j1; c++; continue; }
        const jm = Math.round((j + j1) / 2);
        const [nx, ny, tx, ty] = geo.normals[jm];
        const chord = Math.hypot(base[base.length - 1][0] - base[0][0], base[base.length - 1][1] - base[0][1]);
        const D = Math.min(chord * 0.85, geo.ws[jm] * curl * (0.55 + 0.6 * R(sd, c, 4)) + 4) * geo.open ** 0.6;
        const skew = (R(sd, c, 5) - 0.5) * 0.8;
        const outer = base.map((q, k) => {
          const u = k / (base.length - 1);
          const d = D * Math.sin(Math.PI * u) ** 0.65 * (0.85 + 0.3 * R(sd * 7 + c, k, 1));
          const jx = (R(sd * 7 + c, k, 2) - 0.5) * 4;
          return [q[0] + (nx * sgn + tx * skew) * d + tx * jx, q[1] + (ny * sgn + ty * skew) * d + ty * jx];
        });
        if (D > 3) flaps.push({ base, outer, b: base[Math.floor(base.length / 2)], o: outer[Math.floor(outer.length / 2)] });
        else bare.push(base);
        j = j1; c++;
      }
    }
    const shapes = flaps.map((f) => pathOf([...f.base, ...f.outer.slice().reverse()]));
    shapes.forEach((sh) => { g.save(); g.translate(3, 6); g.fillStyle = rgba(PAL.shadow, 0.28); g.fill(sh); g.restore(); });
    flaps.forEach((f, i) => {
      g.fillStyle = back;
      g.fill(shapes[i]);
      const grd = g.createLinearGradient(f.b[0], f.b[1], f.o[0], f.o[1]);
      grd.addColorStop(0, rgba(PAL.ink, 0.32));
      grd.addColorStop(0.45, rgba(PAL.ink, 0.04));
      grd.addColorStop(1, rgba(PAL.white, 0.3));
      g.fillStyle = grd;
      g.fill(shapes[i]);
    });
    // 4) 纤维：翻卷片的外缘 + 没翻的撕边都是白毛边；口子边缘一道折痕暗线
    g.strokeStyle = rgba(fiber, 0.95);
    g.lineWidth = 2.2;
    for (const f of flaps) g.stroke(pathOf(f.outer, false));
    g.lineWidth = 3;
    for (const b of bare) g.stroke(pathOf(b, false));
    g.strokeStyle = rgba(PAL.ink, 0.32);
    g.lineWidth = 1.4;
    for (const f of flaps) g.stroke(pathOf(f.base, false));
  }
  g.restore();
  return geo;
}

// ———————————————————— 撕纸分屏 ————————————————————
/**
 * 撕纸分屏：左右两张“照片”各画一块画面（各用一台机位），中间一道斜的撕纸边：左片压在右片上，撕边露白色纸芯并在右片上投影。
 * o: { x（分界中心，默认 960）, angle（倾角，弧度，默认 6°；正 = 上端偏右）, enter（0..1，两片从左右两侧滑进来，默认 1）, seed, strip（纸芯平均宽 px，默认 10）}
 * drawL(g, info) / drawR(g, info)：在各自的区域里画（已裁剪）；info = { side:'L'|'R', dx（这一片当前的滑入偏移，想让画面跟着片走就加到机位上）}。
 * 返回 { seam:[[x,y],...] }（左片右边缘的折线）。
 */
export function splitScreen(ctx, g, o = {}, drawL, drawR) {
  const { x = 960, angle = 6 * DEG, seed = 11, strip = 10 } = o;
  const e = clamp(o.enter ?? 1);
  if (e <= 0) return { seam: [] };
  const dxL = -(1 - e) * (x + 260), dxR = (1 - e) * (W - x + 260);
  const tn = Math.tan(angle);
  const seam = [];
  for (let y = -40, j = 0; y <= H + 40; y += 11, j++) {
    // 撕边：低频的弯 + 中频的抖 + 不规则的小齿（偶尔崩一大口）
    const chip = R(seed, j, 6) > 0.86 ? 2.1 : 1;
    const zig = ((j % 2 ? 0.5 : -0.5) + (R(seed, j, 1) - 0.5)) * (3 + 5 * R(seed, j, 7)) * chip;
    seam.push([x - (y - H / 2) * tn + zig + fbm1(y / 170, seed) * 20 + noise1(y / 46, seed + 2) * 6, y]);
  }
  const sh = (pts, dx) => pts.map(([a, b]) => [a + dx, b]);
  const leftPts = [[-W, -40], ...seam, [-W, H + 40]];
  // 右片比撕边多垫 30px，压在左片下面，接缝不漏底
  const rightPts = [...seam.map(([a, b]) => [a - 30, b]), [W * 2, H + 40], [W * 2, -40]];
  // 1) 右片（底层）
  g.save();
  g.clip(pathOf(sh(rightPts, dxR)));
  if (drawR) drawR(g, { side: 'R', dx: dxR });
  // 左片撕边投在右片上的影子
  const shPts = sh(seam, dxL);
  const band = pathOf([...shPts, ...shPts.slice().reverse().map(([a, b]) => [a + 46, b + 10])]);
  const g0 = shPts[Math.floor(shPts.length / 2)];
  const sgrd = g.createLinearGradient(g0[0], g0[1], g0[0] + 46 * Math.cos(angle), g0[1] + 46 * Math.sin(angle));
  sgrd.addColorStop(0, rgba(PAL.shadow, 0.5));
  sgrd.addColorStop(1, rgba(PAL.shadow, 0));
  g.fillStyle = sgrd;
  g.fill(band);
  g.restore();
  // 2) 左片（上层）
  g.save();
  g.clip(pathOf(sh(leftPts, dxL)));
  if (drawL) drawL(g, { side: 'L', dx: dxL });
  g.restore();
  // 3) 左片的撕边纸芯（白色、毛边）
  const inner = seam.map(([a, b], j) => [a - strip * (0.45 + 1.1 * (0.5 + 0.5 * noise1(b / 58, seed + 5))) - 2.5 * R(seed, j, 2), b]);
  g.save();
  g.translate(dxL, 0);
  g.fillStyle = PAL.white;
  g.fill(pathOf([...seam, ...inner.slice().reverse()]));
  shade(g, pathOf([...seam, ...inner.slice().reverse()]), PAL.kraft, x - 20, 0, x + 20, 0, 0, 0.35);
  g.strokeStyle = rgba(PAL.white, 0.9);
  g.lineWidth = 1.2;
  for (let j = 0; j < seam.length; j++) {
    if (R(seed, j, 3) < 0.45) continue;
    const [a, b] = seam[j];
    const l = 3 + 6 * R(seed, j, 4), an = (R(seed, j, 5) - 0.5) * 1.4;
    g.beginPath(); g.moveTo(a - 1, b); g.lineTo(a + Math.cos(an) * l, b + Math.sin(an) * l); g.stroke();
  }
  g.restore();
  return { seam: sh(seam, dxL) };
}

// ———————————————————— 冷暖分色 ————————————————————
/** 冷色默认 = magic 掺三成 crystal（偏蓝紫的月光冷；纯 magic 显灰、纯 crystal 偏绿）。 */
export const COLD = mixHex(PAL.magic, PAL.crystal, 0.3);
/**
 * 左冷右暖：两块半屏渐变各叠一次 'color'（统一色相）和 'soft-light'（加对比与色偏），不逐形状滤镜、不开缓冲。
 * 在镜头内容画完后（界面之前）调用。x：分界（撞击点）。
 * o: { y（分界线经过的点，默认 540）, angle（分界线相对竖直的倾角，弧度）, cold（默认 COLD）, warm（默认 PAL.fire）, alpha（0..1，默认 0.5）,
 *      soft（过渡宽 px，默认 140）, seam（分界亮线 0..1，默认 0）, modes（默认 [['color',0.7],['soft-light',1]]：[混合模式, 强度系数] 依次叠）}
 */
export function colorSplit(ctx, g, x = 960, o = {}) {
  const { y = 540, angle = 0, cold = COLD, warm = PAL.fire, alpha = 0.5, soft = 140, seam = 0 } = o;
  const modes = o.modes || [['color', 0.7], ['soft-light', 1]];
  if (alpha <= 0) return;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const a0 = [x - (nx * soft) / 2, y - (ny * soft) / 2], a1 = [x + (nx * soft) / 2, y + (ny * soft) / 2];
  g.save();
  for (const [mode, k] of modes) {
    g.globalCompositeOperation = mode;
    for (const [col, from, to] of [[cold, 1, 0], [warm, 0, 1]]) {
      const grd = g.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
      grd.addColorStop(0, rgba(col, alpha * k * from));
      grd.addColorStop(1, rgba(col, alpha * k * to));
      g.fillStyle = grd;
      g.fillRect(-W, -H, W * 3, H * 3);
    }
  }
  if (seam > 0) {
    g.globalCompositeOperation = 'screen';
    const ux = -ny, uy = nx;
    const grd = g.createLinearGradient(x - nx * 14, y - ny * 14, x + nx * 14, y + ny * 14);
    grd.addColorStop(0, rgba(PAL.goldLight, 0));
    grd.addColorStop(0.5, rgba(PAL.goldLight, 0.8 * seam));
    grd.addColorStop(1, rgba(PAL.goldLight, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - nx * 14 - ux * 2000, y - ny * 14 - uy * 2000);
    g.lineTo(x + nx * 14 - ux * 2000, y + ny * 14 - uy * 2000);
    g.lineTo(x + nx * 14 + ux * 2000, y + ny * 14 + uy * 2000);
    g.lineTo(x - nx * 14 + ux * 2000, y - ny * 14 + uy * 2000);
    g.fill();
  }
  g.restore();
}

// ———————————————————— 灰烟擦屏 ————————————————————
/**
 * 灰烟擦屏：一团剪纸烟从 (x, y) 翻滚着涌出，在 tFull 盖满全屏，再从中间向左右两边散开。
 * 每朵烟是三层纸：暗色底片（右下露出一道暗月牙）→ 烟身 → 左上一片亮的“顶盖”，偶尔带一道漩涡纹；新冒出来的烟压在老烟上面。
 * 镜头在 full（盖满）之前画老机位、之后画新机位，最后调用本函数盖在最上层。
 * o: { t0, t1, tFull（默认中点）, p（直接给进度：0..0.5 涌出、0.5 盖满、0.5..1 散开）, x, y（起点）, color（默认 PAL.dragonDeep）,
 *      grid（烟团间距，默认 210）, seed }
 * 返回 { cover（0..1 覆盖程度）, full（此刻整屏被盖住）, phase:'in'|'full'|'out' }。
 */
export function smokeWipe(g, T, o = {}) {
  const { t0 = 0, t1 = 0.3, x = 960, y = 600, color = PAL.dragonDeep, seed = 5, grid = 210 } = o;
  const tf = o.tFull ?? (t0 + t1) / 2;
  let q, s, tt;
  if (o.p !== undefined) { q = clamp(o.p * 2); s = clamp(o.p * 2 - 1); tt = o.p * (t1 - t0); }
  else { q = seg(T, t0, tf); s = seg(T, tf, t1); tt = T - t0; }
  if (q <= 0 || s >= 1) return { cover: 0, full: false, phase: q <= 0 ? 'in' : 'out' };
  const se = inOutCubic(s);
  const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
  const ramp = grid * 1.4;
  const front = q * (far + ramp + grid * 0.6);
  const base = mixHex(color, PAL.ink, 0.3);
  const bodies = [mixHex(color, PAL.stone2, 0.1), mixHex(color, PAL.stone2, 0.2)];
  const cap = mixHex(color, PAL.stone2, 0.36), curlC = mixHex(color, PAL.stone, 0.5);
  const puffs = [];
  const add = (id, px0, py0, r0, rampK, lift) => {
    const d = Math.hypot(px0 - x, py0 - y);
    const gr = clamp((front - d) / (ramp * rampK));
    if (gr <= 0) return;
    const side = px0 + (R(seed, id, 4) - 0.5) * grid * 0.5 < x ? -1 : 1;
    const dx = side * se * (W * 0.62 + 420 * R(seed, id, 5)) * (0.7 + (0.6 * Math.abs(px0 - x)) / W);
    const dy = -se * (40 + 90 * R(seed, id, 6));
    const r = r0 * (0.1 + 0.9 * outBack(gr, 1.5)) * (1 - 0.15 * se);
    const wob = Math.sin(tt * 3.1 + id * 1.7) * 6;
    // 越靠近起点越新，压在上面；同距离按种子打散；小烟团再往上抬一层
    puffs.push({ id, x: px0 + dx + wob, y: py0 + dy - wob * 0.6, r, z: -d + R(seed, id, 11) * grid * 0.8 + lift, rot: tt * (R(seed, id, 7) - 0.5) * 2.4 + R(seed, id, 8) * TAU, a: 1 - clamp((se - 0.82) / 0.18) });
  };
  // 大烟团铺成错位网格：半径 ≥ 0.95 格距，保证 tFull 那一刻盖满全屏
  const nx = Math.ceil((W + 2 * grid) / grid) + 1, ny = Math.ceil((H + 2 * grid) / (grid * 0.87)) + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      add(id, -grid + i * grid + (j % 2) * grid * 0.5 + (R(seed, id, 1) - 0.5) * grid * 0.4, -grid * 0.8 + j * grid * 0.87 + (R(seed, id, 2) - 0.5) * grid * 0.34,
        grid * (0.95 + 0.3 * R(seed, id, 3)), 1, 0);
    }
  }
  // 小烟团：大小不一，散在大烟团之上（只加层次，不影响盖满）
  for (let k = 0; k < 34; k++) {
    const id = 1000 + k;
    add(id, -60 + R(seed, id, 1) * (W + 120), -60 + R(seed, id, 2) * (H + 120), grid * (0.32 + 0.3 * R(seed, id, 3)), 0.7, grid * 0.6);
  }
  puffs.sort((a, b) => a.z - b.z || a.id - b.id);
  g.save();
  for (const pf of puffs) {
    if (pf.r < 2) continue;
    const bs = { seed: seed * 7 + pf.id, amp: 0.06, freq: 4, rot: pf.rot };
    const body = blob(pf.x, pf.y, pf.r, pf.r * 0.9, bs);
    g.globalAlpha = pf.a;
    // 投在下面那层烟上的影子（右下错位）
    g.save(); g.translate(pf.r * 0.05 + 4, pf.r * 0.08 + 8); g.fillStyle = rgba(PAL.ink, 0.2); g.fill(body); g.restore();
    // 暗底片 → 烟身（往左上缩一点，右下留出暗月牙）→ 顶盖
    g.fillStyle = base; g.fill(body);
    const b2 = blob(pf.x - pf.r * 0.07, pf.y - pf.r * 0.09, pf.r * 0.88, pf.r * 0.79, bs);
    g.fillStyle = bodies[pf.id % 2]; g.fill(b2);
    if (pf.r > 24) {
      g.save();
      g.clip(b2);
      g.fillStyle = rgba(cap, 0.92);
      g.fill(blob(pf.x - pf.r * 0.3, pf.y - pf.r * 0.33, pf.r * 0.58, pf.r * 0.5, { ...bs, seed: bs.seed + 3 }));
      g.restore();
    }
    if (R(seed, pf.id, 9) < 0.4 && pf.r > 36) {
      // 漩涡纹：翻滚感（跟着烟团转）
      g.save();
      g.strokeStyle = rgba(curlC, 0.75);
      g.lineWidth = Math.max(1.5, pf.r * 0.05);
      g.lineCap = 'round';
      g.beginPath();
      const ph = pf.rot * 1.3, cr = pf.r * 0.34;
      const ox = pf.x + pf.r * 0.08, oy = pf.y + pf.r * 0.06;
      for (let k = 0; k <= 24; k++) {
        const tk = k / 24, a = ph + tk * TAU * 1.15, rr_ = cr * (0.12 + 0.88 * tk);
        const X = ox + Math.cos(a) * rr_, Y = oy + Math.sin(a) * rr_ * 0.85;
        if (k) g.lineTo(X, Y); else g.moveTo(X, Y);
      }
      g.stroke();
      g.restore();
    }
  }
  g.restore();
  const full = q >= 1 && s <= 0;
  return { cover: s > 0 ? 1 - se : q, full, phase: s > 0 ? 'out' : q >= 1 ? 'full' : 'in' };
}
