// 剑道具（勇者组）：最好的剑（入鞘 / 出鞘 / 空鞘 / 剧场平面版）、名字之剑（13 块钢字牌 + 围巾缠柄）、小剑图标。
// 纯函数：只由参数决定画面；内部 save/restore；不调 ctx.layer / ctx.mask。
import { PAL, rr, smooth as smoothPath, glow as glowFx } from '../core/paper.js';
import { clamp, lerp, TAU, rgba, mixHex } from '../core/util.js';
import { outCubic, outBack } from '../core/ease.js';
import { glyph13, paperGlyph, charsOf } from '../ui/type.js';
import { sdir, paperFill, drawScarf, scarfPoints, ribbonOf, star4 } from './scarf.js';

/** 最好的剑的尺寸（s = 1，沿刃方向 u，握点 u = 0，刃朝 +u）。总长约 157。 */
export const SWORD = { pommel: -23, gripA: -15, gripB: 14, guard: 18, bladeA: 22, tip: 128, sheathTip: 134, guardHalf: 23.5, bladeW: 15 };

// ———————————————————— 部件路径（模块加载时预建，稳定不闪） ————————————————————
const circle = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; };
function bladePath(chip) {
  const p = new Path2D();
  const w = 7.5;
  p.moveTo(21, -w);
  if (chip) { p.lineTo(69, -w); p.lineTo(73.5, -w + 4.4); p.lineTo(78, -w); }
  p.lineTo(106, -w);
  p.quadraticCurveTo(119, -w * 0.72, 128, 0);
  p.quadraticCurveTo(119, w * 0.72, 106, w);
  p.lineTo(21, w);
  p.closePath();
  return p;
}
const BLADE = bladePath(false), BLADE_CHIP = bladePath(true);
const GRIP = rr(-15.5, -4.7, 30, 9.4, 3.6);
const GUARD = smoothPath([[15.2, -5], [14, -13], [14.6, -20], [17.2, -22.6], [20.8, -22], [22.2, -17], [21.6, -10], [22, -4], [22, 4], [21.6, 10], [22.2, 17], [20.8, 22], [17.2, 22.6], [14.6, 20], [14, 13], [15.2, 5]], { closed: true, tension: 0.5 });
const BALL_A = circle(18.2, -23.4, 4.1), BALL_B = circle(18.2, 23.4, 4.1);
const BOSS = circle(18.4, 0, 5.6), BOSS_GEM = circle(18.4, 0, 2.6);
const POMMEL = circle(-23, 0, 7.6), GEM = circle(-23.4, 0, 5.4), COLLAR = rr(-18.5, -6.2, 4.6, 12.4, 1.6);
function scabPath() {
  const p = new Path2D();
  p.moveTo(20, -9.6); p.lineTo(117, -9.6);
  p.quadraticCurveTo(133, -7.6, 135, 0);
  p.quadraticCurveTo(133, 7.6, 117, 9.6);
  p.lineTo(20, 9.6); p.closePath();
  return p;
}
const SCAB = scabPath();
const LOCKET = rr(19.5, -10.8, 10, 21.6, 2.4);
const CHAPE = (() => { const p = new Path2D(); p.moveTo(118, -9.7); p.lineTo(121, -9.7); p.quadraticCurveTo(133.4, -7.6, 135.6, 0); p.quadraticCurveTo(133.4, 7.6, 121, 9.7); p.lineTo(118, 9.7); p.closePath(); return p; })();
const BANDS = [rr(55, -10.2, 5, 20.4, 1.6), rr(91, -10.2, 5, 20.4, 1.6)];

/** 根据模式返回“剪一片纸”的函数：edge = 只描边（贴纸边），sil = 剪影单色，flat = 剧场平面版，detail 0 = 平涂。 */
function painter(g, m) {
  return (path, fill, op = {}) => {
    if (m.edge) { g.save(); g.lineJoin = 'round'; g.strokeStyle = m.edge.color; g.lineWidth = m.edge.w; g.stroke(path); g.restore(); return; }
    if (m.sil) { g.fillStyle = m.sil; g.fill(path); return; }
    if (!m.detail) { g.fillStyle = fill; g.fill(path); return; }
    if (m.flat) { paperFill(g, path, fill, { rim: op.rim, rimW: 1.2, rimA: 0.6, under: op.under, underW: 1.2, underA: 0.3 }); return; }
    paperFill(g, path, fill, { lift: op.lift ?? 1.3, liftA: 0.22, cx: op.cx ?? 0, cy: op.cy ?? 0, r: op.r ?? 0, shadeA: op.shadeA ?? 0, rim: op.rim, rimW: op.rimW ?? 1.2, rimA: 0.75, under: op.under, underW: op.underW ?? 1.2, underA: op.underA ?? 0.4 });
  };
}
/** 哪一半刃面朝屏幕下方（+1 = v>0 那一半）。 */
function downSide(g) {
  const [, dy] = sdir(g, 0, 1);
  if (Math.abs(dy) > 0.3) return Math.sign(dy);
  return Math.sign(sdir(g, 1, 0)[1]) || 1;
}

function paintBlade(g, F, full, chip, detail, flat) {
  const path = chip ? BLADE_CHIP : BLADE;
  F(path, PAL.steel, { rim: PAL.white, under: PAL.steelDark, cx: 75, r: 60, shadeA: 0.1 });
  if (!full || !detail) return;
  const side = downSide(g);
  g.save();
  g.clip(path);
  g.fillStyle = rgba(PAL.steelDark, flat ? 0.5 : 0.4);
  g.fillRect(18, side > 0 ? 0 : -10, 114, 10);
  g.lineCap = 'round';
  g.strokeStyle = rgba(PAL.steelDark, 0.75); g.lineWidth = 2;
  g.beginPath(); g.moveTo(27, side * 0.6); g.lineTo(95, side * 0.6); g.stroke();
  g.strokeStyle = rgba(PAL.white, 0.9); g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(25, -side * 6); g.lineTo(104, -side * 6); g.stroke();
  g.fillStyle = rgba(PAL.shadow, 0.22); g.fillRect(21, -9, 5, 18);
  g.restore();
}
function paintHilt(g, F, full, detail) {
  F(GRIP, PAL.leather, { under: PAL.boot, rim: mixHex(PAL.leather, PAL.white, 0.3) });
  if (full && detail) {
    g.save(); g.clip(GRIP);
    g.strokeStyle = rgba(PAL.woodDark, 0.6); g.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) { const u = -13 + i * 6.1; g.beginPath(); g.moveTo(u, -5); g.lineTo(u + 4.2, 5); g.stroke(); }
    g.restore();
  }
  F(COLLAR, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark });
  F(POMMEL, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark });
  F(GEM, PAL.red, { rim: mixHex(PAL.red, PAL.white, 0.5), under: PAL.redDark, underA: 0.7 });
  if (full && detail) {
    g.save(); g.clip(GEM);
    g.fillStyle = rgba(PAL.redDeep, 0.45);
    g.beginPath(); g.moveTo(-29, 6); g.lineTo(-17, -6); g.lineTo(-17, 6); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = rgba(PAL.white, 0.9);
    g.beginPath(); g.ellipse(-25, -1.8, 1.7, 1.2, -0.5, 0, TAU); g.fill();
  }
  F(GUARD, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, cx: 18, r: 24, shadeA: 0.12 });
  F(BALL_A, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 0.8 });
  F(BALL_B, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 0.8 });
  F(BOSS, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 0.8 });
  F(BOSS_GEM, PAL.red, { lift: 0 });
}
function paintScabbard(g, F, full, detail) {
  F(SCAB, PAL.woodDark, { rim: PAL.wood, under: mixHex(PAL.woodDark, PAL.ink, 0.5), cx: 75, r: 60, shadeA: 0.15 });
  if (full && detail) {
    g.save(); g.clip(SCAB);
    g.strokeStyle = rgba(PAL.wood, 0.55); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(32, -2.5); g.lineTo(114, -2.5); g.stroke();
    g.restore();
  }
  for (const b of BANDS) F(b, PAL.leather, { under: PAL.boot, lift: 0.8 });
  F(LOCKET, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 0.8 });
  F(CHAPE, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 0.8 });
}
/** 白色月牙弧光：贴着剑尖的一弯细月牙，从刃后 span 弧度处（尾，细而透明）扫到刃上（头，最厚最亮）。dir = +1 顺时针挥。 */
function paintArc(g, a, span, dir) {
  span = clamp(span, 0.05, 5.4);
  const R1 = 140, TH = 46, N = 36;
  const angAt = (f) => -dir * span * (1 - f);
  const p = new Path2D();
  for (let i = 0; i <= N; i++) { const an = angAt(i / N); const X = Math.cos(an) * R1, Y = Math.sin(an) * R1; if (i) p.lineTo(X, Y); else p.moveTo(X, Y); }
  for (let i = N; i >= 0; i--) {
    const f = i / N, an = angAt(f), r = R1 - TH * Math.pow(f, 1.35) * (1 - 0.35 * Math.pow(f, 8));
    p.lineTo(Math.cos(an) * r, Math.sin(an) * r);
  }
  p.closePath();
  const edge = new Path2D();
  for (let i = 0; i <= N; i++) { const an = angAt(i / N); const X = Math.cos(an) * (R1 - 1.5), Y = Math.sin(an) * (R1 - 1.5); if (i) edge.lineTo(X, Y); else edge.moveTo(X, Y); }
  const grad = (aHead, aMid) => {
    if (!g.createConicGradient) return rgba(PAL.white, aHead * 0.8);
    const s01 = span / TAU;
    let gr;
    if (dir > 0) {
      gr = g.createConicGradient(-span, 0, 0);
      gr.addColorStop(0, rgba(PAL.white, 0)); gr.addColorStop(s01 * 0.6, rgba(PAL.white, aMid)); gr.addColorStop(s01 * 0.999, rgba(PAL.white, aHead)); gr.addColorStop(s01 + 0.001, rgba(PAL.white, 0)); gr.addColorStop(1, rgba(PAL.white, 0));
    } else {
      gr = g.createConicGradient(0, 0, 0);
      gr.addColorStop(0, rgba(PAL.white, aHead)); gr.addColorStop(s01 * 0.4, rgba(PAL.white, aMid)); gr.addColorStop(s01, rgba(PAL.white, 0)); gr.addColorStop(1, rgba(PAL.white, 0));
    }
    return gr;
  };
  g.save();
  g.globalAlpha *= clamp(a);
  g.globalCompositeOperation = 'screen';
  g.fillStyle = grad(0.55, 0.12);
  g.fill(p);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = grad(0.95, 0.35);
  g.save(); g.clip(p);
  g.lineWidth = 9; g.strokeStyle = grad(1, 0.5); g.stroke(edge);
  g.restore();
  g.lineWidth = 2.4; g.lineCap = 'round'; g.strokeStyle = grad(1, 0.6); g.stroke(edge);
  g.restore();
}
function paintGlint(g, k, chip) {
  k = clamp(k);
  const e = 1 - (1 - k) * (1 - k);
  const u = lerp(26, 128, e);
  const side = downSide(g);
  const v = u < 106 ? -side * 7 : -side * 7 * (1 - (u - 106) / 22);
  const hump = Math.sin(Math.PI * k);
  g.save();
  g.clip(chip ? BLADE_CHIP : BLADE);
  const gr = g.createLinearGradient(u - 18, 0, u + 18, 0);
  gr.addColorStop(0, rgba(PAL.white, 0)); gr.addColorStop(0.5, rgba(PAL.white, 0.9 * Math.pow(hump, 0.5))); gr.addColorStop(1, rgba(PAL.white, 0));
  g.fillStyle = gr;
  g.fillRect(u - 18, -10, 36, 20);
  g.restore();
  const size = 7 + 8 * hump + (k > 0.88 ? (16 * (k - 0.88)) / 0.12 : 0);
  glowFx(g, u, v, size * 2.4, PAL.goldLight, 0.55);
  star4(g, u, v, size, PAL.white, 1);
}

/**
 * drawSword(g, o)：立誓那把“最好的剑”。锚在剑柄握点。
 * o: { x, y, s=1, rot（刃的方向，弧度：0 向右、−π/2 向上）, state:'bare'|'sheathed'|'scabbard'（空鞘）,
 *      glint 0..1（四角星沿刃口跑到剑尖）, chip（崩口）, arc 0..1（白色弧光强度）, arcSpan（弧光张角，弧度）, arcDir（+1 顺时针挥）,
 *      flat（剧场平面版）, detail=1, alpha, sil（剪影色）, edge:{color,w}（只描边） }
 * 返回 { tip, hilt, pommel, guard }（调用方坐标）。
 */
export function drawSword(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = -Math.PI / 2, state = 'bare', glint = 0, chip = false, arc = 0, arcSpan = 1.4, arcDir = 1, flat = false, detail = 1, alpha = 1, sil = null, edge = null } = o;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const W = (u, v = 0) => [x + (u * ca - v * sa) * s, y + (u * sa + v * ca) * s];
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  const F = painter(g, { sil, edge, detail, flat });
  const full = !sil && !edge;
  if (arc > 0 && state === 'bare' && full) paintArc(g, arc, arcSpan, arcDir);
  if (state === 'sheathed' || state === 'scabbard') paintScabbard(g, F, full, detail);
  if (state !== 'scabbard') {
    if (state === 'bare') paintBlade(g, F, full, chip, detail, flat);
    paintHilt(g, F, full, detail);
  }
  if (glint > 0 && state === 'bare' && full && detail) paintGlint(g, glint, chip);
  g.restore();
  return { tip: W(state === 'bare' ? SWORD.tip : SWORD.sheathTip), hilt: [x, y], pommel: W(SWORD.pommel), guard: W(SWORD.guard) };
}

// ———————————————————— 名字之剑 ————————————————————
/** 名字之剑尺寸（s = 1，剧场坐标）：字牌 120，间距 126，第 i 块中心 u = 60 + 126·i，剑尖长 160。 */
export const NAME_SWORD = { tile: 120, pitch: 126, first: 60, tipLen: 160, gripA: -104, gripB: -14, pommel: -124, guardHalf: 104 };
const NS_TILE = rr(-60, -60, 120, 120, 13), NS_FACE = rr(-53, -53, 106, 106, 8), NS_BEVEL = rr(-46, -46, 92, 92, 5);
const NS_GRIP = rr(-106, -16, 94, 32, 9);
const NS_GUARD = smoothPath([[-12, -16], [-15, -60], [-9, -90], [3, -101], [15, -97], [17, -80], [12, -42], [14, -14], [14, 14], [12, 42], [17, 80], [15, 97], [3, 101], [-9, 90], [-15, 60], [-12, 16]], { closed: true, tension: 0.5 });
const NS_BALLS = [circle(4, -104, 14), circle(4, 104, 14)];
const NS_BOSS = circle(1, 0, 22), NS_BOSS_GEM = circle(1, 0, 12);
const NS_POMMEL = circle(-126, 0, 25), NS_GEM = circle(-127, 0, 17), NS_COLLAR = rr(-108, -21, 10, 42, 4);
const clampRot = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
  return clamp(a, (-15 * Math.PI) / 180, (15 * Math.PI) / 180);
};

function paintNameTile(g, F, full, detail, lit = 0) {
  F(NS_TILE, PAL.gold, { rim: PAL.goldLight, rimW: 2.4, under: PAL.goldDark, underW: 2.6, lift: 3 });
  F(NS_FACE, lit > 0 ? mixHex(PAL.steel, PAL.goldLight, 0.35 * lit) : PAL.steel, { rim: PAL.white, rimW: 2.2, under: PAL.steelDark, underW: 2.4, cx: 0, cy: 0, r: 80, shadeA: 0.22, lift: 1.5 });
  if (full && detail) {
    g.save();
    g.strokeStyle = rgba(PAL.steelDark, 0.5); g.lineWidth = 1.6;
    g.stroke(NS_BEVEL);
    g.restore();
  }
}

/**
 * drawNameSword(g, o)：b13 名字之剑。锚在护手中心（剧场 (600,560)）。
 * o: { x=600, y=560, s=1, angle（0 水平向右 → −π/2 竖直向上）, tiles（长 13 的 0..1：每块字牌从名字牌飞来的进度，1 = 落位）,
 *      from（飞来的起点：[x,y] 或 13 个 [x,y]，默认勇者名字牌窗口中心 (427,219)）, glow 0..1（沿刃跑的扫光，扫过的字常亮 goldLight）,
 *      scarfWrap 0..1（红围巾从剑首一侧螺旋缠到护手一侧，缠满后末端流苏飘起）, part:'back'|'front'|'all',
 *      tip（剑尖出现 0..1，默认第 13 块落位即出现）, chars（默认勇者全名）, notch/hole/patch（围巾末端状态）, t, detail, alpha }
 * 'back' = 围巾末端 + 柄后半圈缠绳 + 剑首/柄/护手 + 刃与字（一切主体）；'front' = 柄前半圈缠绳（叠在木偶手上）。
 * 字由 type.glyph13 画（state 'steel'，96px），永远正立（倾角夹 ±15°）。
 * 返回 { guard, grip, wrapStart, wrapEnd, pommel, tip, slots:[[x,y,ang]×13], length }（调用方坐标）。
 */
export function drawNameSword(g, o = {}) {
  const { x = 600, y = 560, s = 1, angle = 0, glow = 0, scarfWrap = 0, part = 'all', t = 0, notch = true, hole = true, patch = false, alpha = 1, detail = 1 } = o;
  const chars = o.chars ? [...o.chars] : charsOf('hero');
  const tiles = o.tiles ?? Array(13).fill(1);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const W = (u, v = 0) => [x + (u * ca - v * sa) * s, y + (u * sa + v * ca) * s];
  const slotU = (i) => NAME_SWORD.first + NAME_SWORD.pitch * i;
  const kOf = (i) => clamp(tiles[i] ?? 0);
  let last = -1;
  for (let i = 0; i < 13; i++) if (kOf(i) >= 1) last = i;
  const tipK = clamp(o.tip ?? (kOf(12) >= 1 ? 1 : 0));
  const tipU = slotU(12) + 60;
  const total = tipU + NAME_SWORD.tipLen + 126;
  const gu = lerp(-160, tipU + NAME_SWORD.tipLen * tipK + 160, clamp(glow));
  const litOf = (i) => (glow > 0 ? clamp((gu - slotU(i)) / 150 + 0.35) * clamp(glow * 6) : 0);
  const srcOf = (i) => { const f = o.from; if (!f) return [427, 219]; return Array.isArray(f[0]) ? f[i] || f[0] : f; };
  const back = part !== 'front', front = part !== 'back';
  const F = painter(g, { detail });
  const full = true;
  const wrapK = clamp(scarfWrap);
  const thMax = 3.5 * TAU, thEnd = wrapK * thMax;
  const helix = (th) => [-100 + (82 * th) / thMax, 19 * Math.cos(th)];
  const wrapRuns = (wantFront) => {
    const runs = [];
    let cur = null;
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * thMax;
      if (th > thEnd) break;
      const f = Math.sin(th) > 0;
      if (!cur || cur.f !== f) { if (cur) cur.pts.push(helix(th)); cur = { f, pts: [] }; runs.push(cur); }
      cur.pts.push(helix(th));
    }
    if (cur && thEnd < thMax) cur.pts.push(helix(thEnd));
    return runs.filter((r) => r.f === wantFront && r.pts.length > 1);
  };

  g.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  if (back) {
    // 围巾末端（缠满后从护手一侧飘起，带缺口 / 破洞 / 补丁）
    if (wrapK > 0.85) {
      const k = clamp((wrapK - 0.85) / 0.15);
      const root = W(-18, 19 * Math.cos(thMax));
      const pts = scarfPoints(root, { len: 240 * s * k, n: 14, t, back: -1, wind: [-420 * s, -170 * s], speedRef: 650 * s, seed: 5 });
      drawScarf(g, pts, { width: 22 * s, endWidth: 13 * s, notch, hole, patch, t, holeAt: 0.5, detail });
    }
    g.save();
    g.translate(x, y); g.rotate(angle); g.scale(s, s);
    for (const r of wrapRuns(false)) F(ribbonOf(r.pts, 14), mixHex(PAL.scarf, PAL.scarfDark, 0.6), { lift: 0 });
    // 剑首、柄
    F(NS_GRIP, PAL.leather, { rim: mixHex(PAL.leather, PAL.white, 0.3), under: PAL.boot, underW: 2.4, cx: -60, r: 50, shadeA: 0.18, lift: 2.4 });
    if (detail) {
      g.save(); g.clip(NS_GRIP);
      g.strokeStyle = rgba(PAL.woodDark, 0.55); g.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const u = -100 + i * 12; g.beginPath(); g.moveTo(u, -17); g.lineTo(u + 9, 17); g.stroke(); }
      g.restore();
    }
    F(NS_COLLAR, PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 1.5 });
    F(NS_POMMEL, PAL.gold, { rim: PAL.goldLight, rimW: 2.4, under: PAL.goldDark, underW: 2.4, lift: 2.4 });
    F(NS_GEM, PAL.red, { rim: mixHex(PAL.red, PAL.white, 0.5), rimW: 2, under: PAL.redDark, underW: 2.4, underA: 0.7 });
    if (detail) {
      g.fillStyle = rgba(PAL.white, 0.9);
      g.beginPath(); g.ellipse(-132, -6, 4.5, 3, -0.5, 0, TAU); g.fill();
    }
    // 刃脊（字牌之间的缝里露出）
    if (last >= 0) {
      const end = last >= 12 ? tipU + 4 : slotU(last) + 54;
      F(rr(6, -24, end - 6, 48, 6), PAL.steelDark, { lift: 1.5 });
    }
    // 落位的字牌
    for (let i = 0; i < 13; i++) {
      if (kOf(i) < 1) continue;
      g.save(); g.translate(slotU(i), 0);
      paintNameTile(g, F, full, detail, litOf(i));
      g.restore();
    }
    // 剑尖
    if (tipK > 0) {
      const L = NAME_SWORD.tipLen * outBack(tipK, 1.6);
      const tp = new Path2D();
      tp.moveTo(tipU - 4, -56); tp.lineTo(tipU + L * 0.62, -40); tp.lineTo(tipU + L, 0); tp.lineTo(tipU + L * 0.62, 40); tp.lineTo(tipU - 4, 56); tp.closePath();
      F(tp, PAL.steel, { rim: PAL.white, rimW: 2.2, under: PAL.steelDark, underW: 2.6, lift: 2 });
      if (detail) {
        g.save(); g.clip(tp);
        const side = downSide(g);
        g.fillStyle = rgba(PAL.steelDark, 0.4); g.fillRect(tipU - 6, side > 0 ? 0 : -60, L + 10, 60);
        g.restore();
        F(rr(tipU - 9, -58, 10, 116, 3), PAL.gold, { rim: PAL.goldLight, under: PAL.goldDark, lift: 1 });
      }
    }
    // 护手（盖住第 1 块字牌的左缘）
    F(NS_GUARD, PAL.gold, { rim: PAL.goldLight, rimW: 2.6, under: PAL.goldDark, underW: 2.8, cx: 0, r: 100, shadeA: 0.14, lift: 3 });
    for (const b of NS_BALLS) F(b, PAL.gold, { rim: PAL.goldLight, rimW: 2, under: PAL.goldDark, underW: 2.2, lift: 2 });
    F(NS_BOSS, PAL.gold, { rim: PAL.goldLight, rimW: 2, under: PAL.goldDark, underW: 2.2, lift: 2 });
    F(NS_BOSS_GEM, PAL.red, { rim: mixHex(PAL.red, PAL.white, 0.5), rimW: 1.6, under: PAL.redDark, lift: 0 });
    // 扫光（沿刃跑）
    if (glow > 0 && glow < 1 && last >= 0) {
      const clip = new Path2D();
      for (let i = 0; i <= last; i++) if (kOf(i) >= 1) clip.addPath(rr(slotU(i) - 60, -60, 120, 120, 13));
      if (tipK > 0) clip.rect(tipU - 6, -58, NAME_SWORD.tipLen * tipK + 6, 116);
      g.save(); g.clip(clip);
      g.globalCompositeOperation = 'screen';
      const gr = g.createLinearGradient(gu - 130, 0, gu + 130, 0);
      gr.addColorStop(0, rgba(PAL.goldLight, 0)); gr.addColorStop(0.42, rgba(PAL.goldLight, 0.7)); gr.addColorStop(0.5, rgba(PAL.white, 0.95)); gr.addColorStop(0.58, rgba(PAL.goldLight, 0.7)); gr.addColorStop(1, rgba(PAL.goldLight, 0));
      g.fillStyle = gr; g.fillRect(gu - 130, -70, 260, 140);
      g.restore();
    }
    g.restore();
    // 字（不随剑旋转，永远正立）
    const an = [], ch = [], gl = [];
    for (let i = 0; i < 13; i++) {
      if (kOf(i) < 1) continue;
      const p = W(slotU(i));
      an.push({ x: p[0], y: p[1], ang: angle });
      ch.push(chars[i] ?? '');
      gl.push(litOf(i));
      if (litOf(i) > 0) glowFx(g, p[0], p[1], 92 * s, PAL.goldLight, 0.55 * litOf(i));
    }
    if (an.length) glyph13(g, ch, an, { size: 96 * s, state: 'steel' });
    // 飞行中的字牌
    for (let i = 0; i < 13; i++) {
      const k = kOf(i);
      if (k <= 0 || k >= 1) continue;
      const e = outCubic(k);
      const S0 = srcOf(i), E0 = W(slotU(i));
      const C0 = [(S0[0] + E0[0]) / 2, Math.min(S0[1], E0[1]) - 190 * s];
      const P = [(1 - e) * (1 - e) * S0[0] + 2 * (1 - e) * e * C0[0] + e * e * E0[0], (1 - e) * (1 - e) * S0[1] + 2 * (1 - e) * e * C0[1] + e * e * E0[1]];
      const ang = lerp(0, angle, e) + Math.sin(Math.PI * e) * 0.35;
      const sc = lerp(0.6, 1, e) * s;
      glowFx(g, P[0], P[1], 110 * sc, PAL.goldLight, 0.45 * (1 - e) + 0.15);
      g.save(); g.translate(P[0], P[1]); g.rotate(ang); g.scale(sc, sc);
      paintNameTile(g, F, full, detail, 0.6 * (1 - e));
      g.restore();
      paperGlyph(g, chars[i] ?? '', P[0], P[1], 96 * sc, { style: 'steel', rot: clampRot(ang) });
    }
  }
  if (front && wrapK > 0) {
    g.save();
    g.translate(x, y); g.rotate(angle); g.scale(s, s);
    for (const r of wrapRuns(true)) F(ribbonOf(r.pts, 14), PAL.scarf, { rim: mixHex(PAL.scarf, PAL.white, 0.38), rimW: 1.4, under: PAL.scarfDark, underW: 1.4, lift: 1.6 });
    g.restore();
  }
  g.restore();
  const slots = [];
  for (let i = 0; i < 13; i++) { const p = W(slotU(i)); slots.push([p[0], p[1], angle]); }
  return { guard: [x, y], grip: W(-59), wrapStart: W(-100, 19), wrapEnd: W(-18, 19 * Math.cos(thMax)), pommel: W(-126), tip: W(tipU + NAME_SWORD.tipLen * tipK), slots, length: total };
}

// ———————————————————— 小剑图标 ————————————————————
/**
 * drawSwordIcon(g, o)：地图与菜单用的小剑（kit.glyphIcon('sword') 的道具版：彩色剪纸 + 墨线外描边）。锚在剑的中心。
 * o: { x, y, size=64（全长 px）, rot（刃的方向，默认 −π/4 斜向右上）, ink=2.4（外描边屏幕粗细，0 不描）, glow 0..1, alpha }
 */
export function drawSwordIcon(g, o = {}) {
  const { x = 0, y = 0, size = 64, rot = -Math.PI / 4, ink = 2.4, glow = 0, alpha = 1 } = o;
  const k = size / 158;
  g.save();
  g.translate(x, y);
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  if (glow > 0) glowFx(g, 0, 0, size * 0.8, PAL.goldLight, glow);
  g.rotate(rot);
  g.scale(k, k);
  g.translate(-52, 0);
  if (ink > 0) {
    g.save();
    g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = (ink / k) * 2;
    for (const p of [BLADE, GRIP, POMMEL, GUARD, BALL_A, BALL_B, COLLAR]) g.stroke(p);
    g.restore();
  }
  const F = painter(g, { flat: true, detail: 1 });
  paintBlade(g, F, true, false, 1, true);
  paintHilt(g, F, true, 1);
  g.restore();
}

