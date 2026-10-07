// 公主米娅木偶：金色大麻花辫（软拖尾链）、粉色三层长裙、小皇冠；不是花瓶——撬锁、翻白眼、举牌敲笼。
// 坐标约定（docs/assets.md 0.2）：(x, y) = 脚底中心（ridePillion = 后座落座点 saddleBack）；s=1 身高 250（含发顶），face 1 朝右。
// 复用 king.js 导出的王室木偶工具（统一脸部画法、IK、手形、姿态插值），与国王同一画风。
import { PAL, blob, shade, glow, sparkle, ribbon, smooth as smoothPath } from '../core/paper.js';
import { clamp, lerp, TAU, hash2, noise1, rgba, mixHex } from '../core/util.js';
import { outBack } from '../core/ease.js';
import { paperGlyph, glyphWidth } from '../ui/type.js';
import { Xf, piece, starPath, heartPath, ell, drawTiara } from '../props/royal.js';
import { DEG, blinkAt, armFK, resolvePose, poseKey, capsule, drawArm, drawHand, FACE, drawFace } from './king.js';

const NOOP = { save() {}, restore() {}, translate() {}, rotate() {}, scale() {} };

const PR = {
  hipY: 118, shoulderL: [-22, -35], shoulderR: [22, -35], l1: 31, l2: 33, lf: 27, ho: 6,
  head: [3, -82], hw: 94, hrx: 47, hry: 44,
  braidRoot: [-36, 16], braidN: 11, braidSeg: 15.5,
};

const PB = {
  hipY: 118, tilt: 0, lean: 0, head: 0, headX: 0, armL: -10, elbowL: 16, armR: 10, elbowR: -16,
  handL: 'mitt', handR: 'mitt', wristL: 0, wristR: 0, layL: 'mid', layR: 'mid', lift: 0, bodyX: 0, tip: 0,
  flare: 0, drag: 0, kick: 0, step: 0, breath: 1, seat: 0, stretchL: 1, stretchR: 1, puppet: 0,
};

const sin = Math.sin;
/** 公主动作表（度；hL / hR 为躯干坐标里的手目标点，躯干原点 = 腰）。 */
const PRINCESS_TABLE = {
  idle: (t) => ({ hL: [2, 24], hR: [14, 22], bendL: -1, bendR: 1, layL: 'front', layR: 'front', head: 3 * sin(t * 0.9), lean: 1.5 * sin(t * 0.7) }),
  water: (t) => ({ armR: 66, elbowR: -6, wristR: 0, handR: 'fist', hL: [-4, 18], bendL: -1, layL: 'front', head: 12, lean: 6, pourT: t }),
  wave: (t) => ({ armR: 150, elbowR: 20 + 26 * sin(TAU * t * 2.3), handR: 'open', wristR: 8 * sin(TAU * t * 2.3), hL: [6, -14], bendL: -1, layL: 'front', handL: 'flat', wristL: -60, head: -4, lean: 2 }),
  lookUp: (t) => ({ hL: [6, -20], hR: [16, -22], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', head: -18, lean: -5, tip: 0.5 + 0 * t }),
  caged: (t) => ({ hL: [22, -16], hR: [-10, -12], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'mitt', handR: 'mitt', head: 8 + 1.5 * sin(t * 1.3), tilt: 2, lean: -3 }),
  pickLock: (t) => { const j = sin(TAU * t * 5.5); return { hR: [46 + 2 * j, -28], hL: [38, -18 + 1.5 * j], bendL: -1, bendR: 1, layL: 'front', layR: 'mid', handR: 'fist', handL: 'mitt', lean: 12, head: 10 }; },
  pointBehind: (t) => ({ armR: 104, elbowR: 6 + 3 * sin(t * 11), handR: 'point', wristR: -90, hL: [10, -62], bendL: 1, layL: 'front', handL: 'fist', lean: 9, head: -2 }),
  cheerSign: (t, o) => { const k = clamp(o.sign ?? 1); const bang = Math.abs(sin(Math.PI * t * 3)); return { armR: lerp(60, 162, k), elbowR: lerp(-30, 6, k), handR: 'fist', armL: 64 + 26 * bang, elbowL: 40 - 30 * bang, handL: 'fist', lean: 4, head: -6 }; },
  stepOut: (t) => ({ step: t * 1.6, hR: [34, -42], bendR: -1, layR: 'front', handR: 'fist', hL: [-30, 0], bendL: -1, handL: 'fist', lean: 4, head: -6, tilt: 2 * sin(TAU * t * 1.6) }),
  twirl: (t) => ({ armL: -98, elbowL: -14, armR: 102, elbowR: 16, handL: 'open', handR: 'open', flare: 1, head: -8, lean: -2 + 0 * t }),
  ridePillion: (t) => ({ hipY: 20, seat: 1, hR: [60, -6], hL: [52, 2], bendL: -1, bendR: 1, layL: 'front', layR: 'mid', handL: 'mitt', handR: 'mitt', lean: 16, head: 12 + 2 * sin(t * 3), stretchL: 1.12 }),
  bride: (t) => ({ hL: [6, 10], hR: [18, 8], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', head: 6 + 1.5 * sin(t * 0.8), lean: 1 }),
  holdHands: (t) => ({ armR: 34, elbowR: 4, handR: 'mitt', wristR: -10, hL: [6, -10], bendL: -1, layL: 'front', handL: 'flat', wristL: -60, head: 4 + 1.5 * sin(t), lean: 3 }),
  coverFace: (t) => ({ hL: [-12, -64], hR: [30, -64], bendL: 1, bendR: -1, layL: 'front', layR: 'front', handL: 'flat', handR: 'flat', wristL: 160, wristR: -160, head: 8 + 3 * sin(TAU * t * 0.9), tilt: 3 * sin(TAU * t * 0.9), lean: 4 }),
  dance: (t) => ({ armR: 140 + 10 * sin(TAU * t * 1.2), elbowR: 30, armL: -78 + 10 * sin(TAU * t * 1.2 + 1), elbowL: -24, handL: 'open', handR: 'open', flare: 0.55, head: -6 + 4 * sin(TAU * t * 1.2), tilt: 4 * sin(TAU * t * 1.2), step: t * 1.2 }),
  leanOver: (t) => ({ lean: 30, head: 16, hRp: [44, 34], hLp: [30, 40], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'mitt', handR: 'mitt', hipY: 114 + 0 * t }),
  nudgeAway: (t) => ({ kick: 0.8 + 0.2 * sin(TAU * t * 1.5), hL: [-30, 0], hR: [32, 0], bendL: -1, bendR: 1, handL: 'fist', handR: 'fist', head: -10, lean: -6, tilt: -4 }),
  shakeHead: (t) => ({ head: 12 * sin(TAU * t * 2.6), headX: 3 * sin(TAU * t * 2.6), hL: [-30, 0], hR: [32, 0], bendL: -1, bendR: 1, handL: 'fist', handR: 'fist', lean: 1 }),
  deflate: (t) => ({ lift: -5, lean: 7, head: 12, armL: -6, elbowL: 6, armR: 6, elbowR: -6, handL: 'open', handR: 'open', breath: 0.3 + 0 * t }),
  puppetCage: (t, o) => { const k = clamp(o.sign ?? 1); const bang = Math.abs(sin(Math.PI * t * 3)); return { armR: lerp(60, 158, k), elbowR: lerp(-30, 4, k), handR: 'fist', armL: 60 + 30 * bang, elbowL: 30 - 30 * bang, handL: 'fist', head: -4, puppet: 1 }; },
};

export const PRINCESS_POSES = Object.keys(PRINCESS_TABLE);
export const PRINCESS_EXPRS = ['smile', 'eyeroll', 'shock', 'focused', 'smug', 'laugh', 'shy', 'loving', 'tense', 'relieved'];
const DEFAULT_ITEM = { water: 'can', pickLock: 'hairpin', stepOut: 'hairpin', cheerSign: 'sign', puppetCage: 'sign', bride: 'bouquet' };

// ———————————————————— 部件路径 ————————————————————
/** 裙层（骨盆坐标，原点 = 腰）：腰宽 w0、下摆半宽 w1、下摆 y=h、n 个荷叶褶；drag 向后拖、flare 张开。 */
function skirtTier(w0, w1, h, n, sway, drag, flare, seed) {
  const W = w1 * (1 + 0.42 * flare), H = h * (1 - 0.14 * flare);
  const p = new Path2D();
  const sx = (u) => sway * u * u + drag * u * u;
  p.moveTo(-w0, -2);
  p.bezierCurveTo(-w0 - 6, H * 0.35, -W * 0.92 + sx(0.7), H * 0.72, -W + sx(1), H);
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    const x0 = lerp(-W, W, u0) + sx(1), x1 = lerp(-W, W, u1) + sx(1);
    const y0 = H + Math.sin(u0 * Math.PI) * 4, y1 = H + Math.sin(u1 * Math.PI) * 4;
    const dip = 7 + 2 * hash2(seed, i) + 6 * flare;
    p.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + dip, x1, y1);
  }
  p.bezierCurveTo(W * 0.92 + sx(0.7), H * 0.72, w0 + 6, H * 0.35, w0, -2);
  p.closePath();
  return p;
}

/** 坐姿裙摆（ridePillion：侧坐在马背后座，裙子盖过膝盖向下垂成一片宽摆）。腰 = 原点，座面在 y≈+20。 */
function skirtSeated(sway) {
  const p = new Path2D();
  p.moveTo(-20, -2);
  p.bezierCurveTo(-30, 14, -54, 40, -62 + sway * 0.3, 92);
  const N = 8, x0 = -62 + sway * 0.3, x1 = 78 + sway;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const ax = lerp(x0, x1, u0), bx = lerp(x1 > x0 ? x0 : x1, x1, u1);
    const ay = 92 + Math.sin(u0 * Math.PI) * 10, by = 92 + Math.sin(u1 * Math.PI) * 10;
    p.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 9, bx, by);
  }
  p.bezierCurveTo(80 + sway, 60, 70, 30, 52, 20);
  p.quadraticCurveTo(36, 14, 20, -2);
  p.closePath();
  return p;
}

function bodice() {
  return smoothPath([[-18, 2], [-21, -16], [-25, -30], [-21, -40], [0, -37], [22, -40], [26, -30], [22, -16], [18, 2], [0, 5]], { closed: true, tension: 0.42 });
}

/** 刘海 + 头顶发片（头坐标）：圆润的帘式刘海（四绺圆弧发梢，额头留出眉毛）。 */
function bangs() {
  const p = new Path2D();
  p.moveTo(-50, 12);
  p.bezierCurveTo(-60, -24, -38, -62, 2, -62);
  p.bezierCurveTo(40, -62, 60, -28, 52, 10);
  p.quadraticCurveTo(48, -10, 38, -24);
  // 圆弧发梢：凹口（高）→ 圆弧（低）→ 凹口
  const notches = [[38, -24], [21, -27], [4, -29], [-13, -27], [-30, -22]];
  const depth = [13, 15, 15, 12];
  for (let i = 0; i < notches.length - 1; i++) {
    const [ax, ay] = notches[i], [bx, by] = notches[i + 1];
    p.bezierCurveTo(ax - 2, ay + depth[i] * 1.25, bx + 2, by + depth[i] * 1.25, bx, by);
  }
  p.quadraticCurveTo(-42, -14, -46, 2);
  p.quadraticCurveTo(-48, 8, -50, 12);
  p.closePath();
  return p;
}
/** 两侧垂到下颌的发绺（头坐标，圆润的发梢）。side = 1 前侧 / −1 后侧。 */
function sideLock(side, sway) {
  const x0 = side > 0 ? 42 : -42;
  const p = new Path2D();
  p.moveTo(x0 - side * 12, -26);
  p.bezierCurveTo(x0 + side * 6, -16, x0 + side * 9 + sway, 10, x0 + side * 5 + sway, 32);
  p.bezierCurveTo(x0 + side * 3 + sway, 41, x0 - side * 6 + sway, 41, x0 - side * 6 + sway * 0.7, 30);
  p.bezierCurveTo(x0 - side * 5, 12, x0 - side * 8, -6, x0 - side * 18, -20);
  p.closePath();
  return p;
}

// ———————————————————— 麻花辫（软拖尾链） ————————————————————
/**
 * 算辫子的点链（根坐标系 = drawPrincess 的局部坐标：已镜像、已缩放，+y 向下）。
 * braid: { trail:[[dx,dy]...]（世界 px，第 k 点 = 锚点在 T − k·0.035 的位置 − 当前位置）, vel:[vx,vy]（px/s）, wind:[wx,wy], spin（转圈速度，rad/s，向外甩） }
 */
function braidChain(root, br, t, F, s, extra) {
  const N = PR.braidN, L = PR.braidSeg;
  const vel = br.vel || [0, 0], wind = br.wind || [0, 0];
  const lag = 0.035;
  const pts = [root.slice()];
  let prev = [-0.32, 0.95];
  for (let k = 1; k <= N; k++) {
    let off;
    if (br.trail && br.trail.length) {
      const tr = br.trail[Math.min(k, br.trail.length - 1)] || [0, 0];
      const ext = k >= br.trail.length ? (k - br.trail.length + 1) / Math.max(1, br.trail.length - 1) : 0;
      const last = br.trail[br.trail.length - 1] || [0, 0];
      off = [(tr[0] + last[0] * ext) * F / s, (tr[1] + last[1] * ext) / s];
    } else {
      off = [-vel[0] * F / s * k * lag, -vel[1] / s * k * lag];
    }
    off[0] += wind[0] * F / s * k * 0.02 - (br.spin || 0) * k * 3.2 - k * (extra || 0);
    off[1] += wind[1] / s * k * 0.02;
    const spd = clamp(Math.hypot(vel[0], vel[1]) / 500 + Math.abs(br.spin || 0) * 0.15);
    const sw = noise1(t * 0.75 - k * 0.13, 7) * Math.pow(k / N, 1.6) * 16 + Math.sin(t * 1.3 - k * 0.35) * Math.pow(k / N, 2) * 4 + Math.sin(t * 11 - k * 0.8) * Math.pow(k / N, 1.3) * 9 * spd;
    const target = [root[0] + off[0] - k * 4.2 + sw, root[1] + off[1] + k * L * 0.97 + Math.cos(t * 11 - k * 0.8) * Math.pow(k / N, 1.3) * 7 * spd];
    let d = [target[0] - pts[k - 1][0], target[1] - pts[k - 1][1]];
    const dl = Math.hypot(d[0], d[1]) || 1;
    d = [d[0] / dl, d[1] / dl];
    // 软：方向向上一段混合（越靠近发根越硬）
    const stiff = 0.55 - 0.35 * (k / N);
    d = [lerp(d[0], prev[0], stiff), lerp(d[1], prev[1], stiff)];
    const d2 = Math.hypot(d[0], d[1]) || 1;
    d = [d[0] / d2, d[1] / d2];
    prev = d;
    pts.push([pts[k - 1][0] + d[0] * L, pts[k - 1][1] + d[1] * L]);
  }
  return pts;
}

function drawBraid(g, pts, S, C) {
  const N = pts.length - 1;
  const F = S.F;
  const wFn = (u) => lerp(14, 9, u);
  const body = ribbon(pts, (u) => wFn(u));
  const hairC = C(PAL.hairGold, 'braid'), dark = C(PAL.hairGoldDark, 'braid');
  piece(g, body, hairC, { sh: S.detail ? 2 : 0, F });
  if (S.detail && !S.sil) {
    // 编结：沿链交替的斜向发束
    const L = [0];
    for (let i = 1; i <= N; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = L[N];
    const at = (sArc) => {
      let i = 1; while (i < N && L[i] < sArc) i++;
      const k = (sArc - L[i - 1]) / (L[i] - L[i - 1] || 1);
      const p = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
      return [p, Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
    };
    const step = 11.5;
    let j = 0;
    g.save(); g.clip(body);
    for (let sArc = 6; sArc < total - 16; sArc += step, j++) {
      const [p, th] = at(sArc);
      const u = sArc / total, w = wFn(u);
      const side = j % 2 ? 1 : -1;
      g.save(); g.translate(p[0], p[1]); g.rotate(th);
      // 局部 +x = 沿辫子向下，+y = 侧向
      const lobe = new Path2D();
      lobe.ellipse(0, side * w * 0.26, step * 0.85, w * 0.78, side * 0.62, 0, TAU);
      g.fillStyle = hairC; g.fill(lobe);
      g.strokeStyle = rgba(dark, 0.85); g.lineWidth = 1.4; g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, side * w * 0.26, step * 0.85, w * 0.78, side * 0.62, side > 0 ? -0.2 : Math.PI - 0.6, side > 0 ? Math.PI * 0.75 : TAU - 0.3); g.stroke();
      g.fillStyle = rgba(PAL.goldLight, 0.55); g.fill(ell(-step * 0.2, side * w * 0.12 - w * 0.22, step * 0.32, w * 0.16, side * 0.5));
      g.restore();
    }
    g.restore();
  }
  // 蝴蝶结 + 发尾
  const tie = pts[N - 1], end = pts[N];
  const th = Math.atan2(end[1] - tie[1], end[0] - tie[0]);
  g.save(); g.translate(tie[0], tie[1]); g.rotate(th - Math.PI / 2);
  const tuft = new Path2D();
  tuft.moveTo(-8, 0);
  tuft.quadraticCurveTo(-14, 16, -10, 30); tuft.quadraticCurveTo(-5, 22, -2, 32);
  tuft.quadraticCurveTo(2, 22, 6, 33); tuft.quadraticCurveTo(10, 22, 13, 28);
  tuft.quadraticCurveTo(14, 12, 8, 0); tuft.closePath();
  piece(g, tuft, hairC, { sh: S.detail ? 1.4 : 0, F });
  if (S.detail && !S.sil) { g.strokeStyle = rgba(dark, 0.7); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-2, 4); g.quadraticCurveTo(-4, 16, -6, 26); g.moveTo(4, 4); g.quadraticCurveTo(5, 16, 6, 27); g.stroke(); }
  const bowC = C(PAL.princessDark, 'braid');
  for (const sx of [-1, 1]) {
    const lp = new Path2D(); lp.moveTo(0, -1); lp.bezierCurveTo(sx * 6, -12, sx * 17, -9, sx * 15, 0); lp.bezierCurveTo(sx * 16, 6, sx * 6, 6, 0, -1); lp.closePath();
    piece(g, lp, C(PAL.princess, 'braid'), { sh: S.detail ? 1 : 0, F });
  }
  piece(g, ell(0, -1, 4.5, 4), bowC, { F });
  g.restore();
}

// ———————————————————— 手持物 ————————————————————
/**
 * 水壶（公主浇花用，也可单独画：12.45 掉落弹一下）。锚点 = 提手握点。
 * o: { x, y, s, rot, pour 0..1（倾倒角 + 水流）, t, F, alpha, detail }
 * 返回 { spout（喷头）}。
 */
export function drawWateringCan(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, pour = 0, t = 0, F = 1, alpha = 1, detail = 1 } = o;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.scale(s, s); X.rotate(rot + pour * 0.55);
  // 提手
  g.save(); g.strokeStyle = PAL.roof; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, 14); g.quadraticCurveTo(0, -8, 16, 14); g.stroke(); g.restore();
  // 壶嘴
  const sp = new Path2D(); sp.moveTo(14, 36); sp.lineTo(42, 14); sp.lineTo(46, 19); sp.lineTo(20, 44); sp.closePath();
  piece(g, sp, PAL.roof, { sh: detail ? 1.2 : 0, F });
  const rose = new Path2D(); rose.ellipse(46, 15, 5, 8, -0.7, 0, TAU);
  piece(g, rose, PAL.waterDeep, { F });
  // 壶身
  const body = new Path2D();
  body.moveTo(-20, 12); body.lineTo(20, 12); body.quadraticCurveTo(24, 30, 22, 46); body.quadraticCurveTo(0, 52, -22, 46); body.quadraticCurveTo(-24, 30, -20, 12); body.closePath();
  piece(g, body, PAL.roof, { sh: detail ? 1.8 : 0, F, rim: detail ? PAL.skyDay : null, rimW: 2 });
  if (detail) {
    shade(g, body, PAL.waterDeep, 22 * F, 46, -10 * F, 12, 0.45, 0);
    g.fillStyle = rgba(PAL.skyDayLow, 0.7); g.fill(ell(-10 * F, 26, 3, 9));
    g.fillStyle = PAL.heart; g.fill(heartPath(4, 30, 11));
  }
  const spout = X.pt(48, 14);
  X.restore();
  // 水流（世界向下）
  if (pour > 0.15) {
    const a = clamp((pour - 0.15) / 0.5);
    g.save();
    g.strokeStyle = rgba(PAL.water, 0.8 * a); g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.lineWidth = 2 * s;
      g.setLineDash([6 * s, 7 * s]); g.lineDashOffset = -t * 120 * s - i * 5;
      g.beginPath(); g.moveTo(spout[0] + i * 2 * s, spout[1]);
      g.quadraticCurveTo(spout[0] + (14 + i * 4) * s, spout[1] + 12 * s, spout[0] + (18 + i * 6) * s, spout[1] + 60 * s); g.stroke();
    }
    g.setLineDash([]);
    for (let i = 0; i < 5; i++) {
      const ph = (t * 1.8 + i * 0.2) % 1;
      g.fillStyle = rgba(PAL.skyDayLow, 0.9 * a * (1 - ph));
      g.fill(ell(spout[0] + (12 + i * 5) * s, spout[1] + (10 + ph * 50) * s, 2.2 * s, 3 * s));
    }
    g.restore();
  }
  return { spout };
}

function hairpin(g, ang, S, C) {
  g.save(); g.rotate(ang);
  const pin = capsule(30, 1.6, 1.2);
  piece(g, pin, C(PAL.gold, 'item'), { sh: S.detail ? 0.8 : 0, F: S.F });
  piece(g, heartPath(0, -4, 11), C(PAL.heart, 'item'), { sh: S.detail ? 0.8 : 0, F: S.F });
  if (S.detail) { g.fillStyle = rgba(PAL.white, 0.7); g.fill(ell(-2 * S.F, -6, 1.6, 1.2)); }
  g.restore();
}

/** 「加油！」小牌（插在发卡上）。在手坐标（已对齐躯干）里画，返回牌心。 */
function cheerCard(g, X, S, t, C, unflip) {
  const pole = capsule(46, 1.8, 1.5);
  g.save(); g.translate(0, 8); g.rotate(Math.PI); piece(g, pole, C(PAL.gold, 'item'), { F: S.F }); g.restore();
  const cy = -52;
  const card = new Path2D(); card.roundRect(-40, cy - 22, 80, 44, 7);
  g.save(); g.translate(0, cy); g.rotate(0.06 * Math.sin(t * 6)); g.translate(0, -cy);
  piece(g, card, C(PAL.paper, 'item'), { sh: S.detail ? 2 : 0, F: S.F, rim: S.detail ? PAL.white : null });
  if (!S.sil) {
    g.save(); g.strokeStyle = PAL.red; g.lineWidth = 2; g.setLineDash([4, 3]);
    const inner = new Path2D(); inner.roundRect(-35, cy - 17, 70, 34, 5); g.stroke(inner); g.restore();
    g.save(); g.translate(0, cy); g.scale(unflip, 1);
    const chars = ['加', '油', '！'];
    const sz = 23;
    let xx = -31;
    for (const ch of chars) { const w = glyphWidth(g, ch, sz, 'play'); paperGlyph(g, ch, xx + w / 2, 1, sz, { family: 'play', fill: PAL.red, edge: null }); xx += w + 1; }
    g.restore();
  }
  g.restore();
  return X.pt(0, cy);
}

function bouquet(g, S, C) {
  const F = S.F;
  const wrap = new Path2D(); wrap.moveTo(-14, -6); wrap.lineTo(14, -6); wrap.lineTo(3, 30); wrap.lineTo(-3, 30); wrap.closePath();
  piece(g, wrap, C(PAL.white, 'item'), { sh: S.detail ? 1.4 : 0, F });
  if (S.detail) shade(g, wrap, PAL.stone, 12 * F, 20, -8 * F, -4, 0.35, 0);
  const lv = [[-20, -14, -0.8], [20, -16, 0.8], [-8, -28, -0.3], [12, -30, 0.4]];
  for (const [lx, ly, a] of lv) { g.save(); g.translate(lx, ly); g.rotate(a); g.fillStyle = C(PAL.grass, 'item'); g.fill(ell(0, 0, 5, 11)); g.restore(); }
  const fl = [[-10, -14, PAL.heart], [8, -16, PAL.princessLight], [0, -26, PAL.white], [-14, -26, PAL.goldLight], [14, -28, PAL.princess], [2, -8, PAL.princess]];
  for (const [fx, fy, c] of fl) {
    g.fillStyle = C(c, 'item');
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.fill(ell(fx + Math.cos(a) * 4.2, fy + Math.sin(a) * 4.2, 4, 4)); }
    g.fillStyle = C(c === PAL.goldLight ? PAL.heart : PAL.gold, 'item'); g.fill(ell(fx, fy, 2.4, 2.4));
  }
  g.fillStyle = C(PAL.princess, 'item'); g.fill(ell(-7, 8, 6, 4, -0.5)); g.fill(ell(7, 8, 6, 4, 0.5));
  g.fillStyle = C(PAL.princessDark, 'item'); g.fill(ell(0, 8, 3, 3));
}

// ———————————————————— 名签 ————————————————————
function nameTagDraw(g, text, size, S, unflip, t) {
  const chars = [...text];
  const ws = chars.map((c) => glyphWidth(g, c, size, 'display'));
  const tw = ws.reduce((a, b) => a + b, 0) + size * 0.04 * (chars.length - 1);
  const W = tw + size * 0.55, H = size * 1.3;
  g.save();
  g.rotate(-0.05 + 0.02 * Math.sin(t * 1.7));
  g.scale(unflip, 1);
  // 别针
  // 挂绳
  g.save(); g.strokeStyle = PAL.redDark; g.lineWidth = Math.max(1.2, size * 0.035); g.beginPath(); g.moveTo(-W * 0.22, -H * 0.15); g.lineTo(-size * 0.12, -size * 0.42); g.moveTo(W * 0.22, -H * 0.15); g.lineTo(size * 0.12, -size * 0.42); g.stroke(); g.restore();
  const card = new Path2D(); card.roundRect(-W / 2, -H * 0.2, W, H, size * 0.16);
  piece(g, card, PAL.red, { sh: S.detail ? 2.4 : 0, F: 1, rim: S.detail ? mixHex(PAL.red, PAL.white, 0.4) : null, rimW: 2.4 });
  if (S.detail) {
    g.save(); g.strokeStyle = rgba(PAL.paper, 0.85); g.lineWidth = Math.max(1.5, size * 0.03); g.setLineDash([size * 0.09, size * 0.07]);
    const inner = new Path2D(); inner.roundRect(-W / 2 + size * 0.1, -H * 0.2 + size * 0.1, W - size * 0.2, H - size * 0.2, size * 0.1); g.stroke(inner); g.restore();
  }
  let xx = -tw / 2;
  for (let i = 0; i < chars.length; i++) { paperGlyph(g, chars[i], xx + ws[i] / 2, H * 0.45, size, { family: 'display', fill: PAL.paper, edge: null }); xx += ws[i] + size * 0.04; }
  piece(g, ell(0, -H * 0.2, size * 0.1, size * 0.1), PAL.gold, { sh: 1, F: 1, rim: PAL.goldLight });
  g.restore();
}

// ———————————————————— 主函数 ————————————————————
/**
 * 画公主。
 * o: { x, y, s, face, t, pose（名字或 {from,to,k}）, expr（名字或部件对象）, joints（关节角增量，度）, detail（1 / 0 远景简化）,
 *      alpha, silhouette, keepColor[], rod, squash, rot（弧度，绕锚点转；骑马时传 drawHorse 的 saddleRot）, turn 0..1（dance 转身：scaleX = cos 2π·turn）,
 *      tiara（默认 true）, tiaraGlint, veil 0..1（婚礼头纱）, braid:{ trail, vel, wind, spin }, hairpin（手里的发卡，默认随动作）, sign 0..1（举「加油！」牌的高度）,
 *      item（覆盖手持物：'can'|'hairpin'|'sign'|'bouquet'|null）, pour 0..1（水壶倾倒）, nameTag（'米娅' 或 {text, size}，默认字号 78 = CA-BAL 下屏幕约 53px）,
 *      only:'nameTag'（只画名签，位置与完整绘制一致，用来把名签放到栏杆前的图层；此时画身体的那次调用不要再传 nameTag）, blush, look, blink, talk, sweat }
 * 返回 { head, mouth, handR, handL, neck, waist, chest, tiara, tiaraTop?, braidTip, braid[], eyes, spout?, sign?, item?, foot?, nameTag? }（only:'nameTag' 时只有 nameTag）。
 */
export function drawPrincess(g, o = {}) {
  const { x = 0, y = 0, s = 1, face = 1, t = 0, alpha = 1, detail = 1, silhouette = false, rod = false } = o;
  const F = face < 0 ? -1 : 1;
  const pose = o.pose || 'idle';
  const sil = !!silhouette;
  const keep = new Set(o.keepColor || []);
  const C = (c, part) => (sil && !keep.has(part) ? PAL.ink : c);
  const J = resolvePose(PRINCESS_TABLE, pose, t, o, PB, PR);
  const puppet = J.puppet > 0.5;
  const det = sil ? 0 : puppet ? Math.min(detail, 1) : detail;
  const S = { F, detail: det, sil };
  const exprName = typeof o.expr === 'string' ? o.expr : 'smile';
  const ex0 = typeof o.expr === 'object' && o.expr ? { ...FACE.smile, ...o.expr } : FACE[exprName] || FACE.smile;
  const ex = o.blush !== undefined ? { ...ex0, blush: Math.max(ex0.blush ?? 1, 1 + o.blush) } : ex0;
  const pk = poseKey(pose);
  const item = o.item !== undefined ? o.item : o.hairpin ? 'hairpin' : (o.sign ?? 0) > 0 && !DEFAULT_ITEM[pk] ? 'sign' : DEFAULT_ITEM[pk] || null;
  const br = o.braid || {};
  const blink = o.blink ?? blinkAt(t, 2);
  const breath = sin((TAU * t) / 2.6) * J.breath;
  const turn = o.turn ?? 0;
  const tc = Math.cos(TAU * turn);
  const spinFromTurn = Math.abs(Math.sin(TAU * turn)) * (o.turn !== undefined ? 1.6 : 0);

  const X = new Xf(g);
  const out = {};
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y);
  X.scale(s * F, s);
  if (turn) X.scale(Math.abs(tc) < 0.04 ? 0.04 * Math.sign(tc || 1) : tc, 1);
  if (o.squash) { const q = o.squash; X.scale(1 / Math.sqrt(1 + q), 1 + q); }
  // rot：绕锚点整体转（弧度，镜像后的局部系里转，与 drawHero 同义；ridePillion 直接传 drawHorse 返回的 saddleRot）
  if (o.rot) X.rotate(o.rot);
  const unflip = F * (tc < 0 && turn ? -1 : 1);
  if (o.only === 'nameTag') {
    // 只画名签（同一位置），给镜头把名签放到栏杆前面的图层
    if (o.nameTag) {
      const text = typeof o.nameTag === 'string' ? o.nameTag : o.nameTag.text;
      const size = typeof o.nameTag === 'object' && o.nameTag.size ? o.nameTag.size : 78;
      X.translate(J.bodyX, -J.lift - J.tip * 6); X.rotate(J.tilt * DEG); X.translate(0, -J.hipY); X.rotate(J.lean * DEG); X.scale(1, 1 + 0.01 * breath);
      X.translate(2, -30);
      nameTagDraw(g, text, size, S, unflip, t);
      out.nameTag = X.pt(0, size * 0.45);
    }
    X.restore();
    return out;
  }
  if (rod) {
    const rp = new Path2D(); rp.roundRect(-5, -60, 10, 1400, 4);
    piece(g, rp, C(PAL.wood, 'rod'), { F });
  }
  // —— 预算头的位置（辫根、头纱根）——
  const M = new Xf(NOOP);
  const chainTo = (Mx) => { Mx.translate(J.bodyX, -J.lift - J.tip * 6); Mx.rotate(J.tilt * DEG); Mx.translate(0, -J.hipY); Mx.rotate(J.lean * DEG); Mx.translate(PR.head[0] + J.headX, PR.head[1] + 30); Mx.rotate(J.head * DEG); Mx.translate(0, -30); };
  chainTo(M);
  const root = M.pt(...PR.braidRoot);
  const veilRoot = M.pt(-18, -30);
  const braidPts = braidChain(root, { ...br, spin: (br.spin || 0) + spinFromTurn + J.flare * 0.8 }, t, F, s, 0);
  // 1) 头纱（后片）
  const veil = clamp(o.veil === true ? 1 : o.veil || 0);
  const drawVeilBack = () => {
    if (veil <= 0) return;
    const sw = Math.sin(t * 1.1) * 6, len = 220 * veil;
    const v = new Path2D();
    v.moveTo(veilRoot[0] + 16, veilRoot[1] - 4);
    v.bezierCurveTo(veilRoot[0] - 10, veilRoot[1] + 30, veilRoot[0] - 70 + sw, veilRoot[1] + len * 0.55, veilRoot[0] - 86 + sw * 1.4, veilRoot[1] + len);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const xa = lerp(veilRoot[0] - 86 + sw * 1.4, veilRoot[0] + 14 + sw, u1), ya = veilRoot[1] + len + Math.sin(u1 * Math.PI) * 6;
      v.quadraticCurveTo(lerp(veilRoot[0] - 86 + sw * 1.4, veilRoot[0] + 14 + sw, (u0 + u1) / 2), veilRoot[1] + len + 10, xa, ya);
    }
    v.bezierCurveTo(veilRoot[0] + 4, veilRoot[1] + len * 0.6, veilRoot[0] + 10, veilRoot[1] + 30, veilRoot[0] + 16, veilRoot[1] - 4);
    v.closePath();
    g.save(); g.globalAlpha *= 0.8;
    piece(g, v, C(mixHex(PAL.white, PAL.princessLight, 0.25), 'veil'), { sh: det ? 2 : 0, F, rim: det ? PAL.white : null, rimW: 2 });
    if (det) {
      g.save(); g.clip(v); g.strokeStyle = rgba(PAL.princessLight, 0.8); g.lineWidth = 1.6;
      for (const k of [0.3, 0.55, 0.8]) { g.beginPath(); g.moveTo(veilRoot[0] + 8, veilRoot[1]); g.quadraticCurveTo(veilRoot[0] - 40 * k + sw, veilRoot[1] + len * 0.5, veilRoot[0] - 80 * k + 10 + sw * 1.4, veilRoot[1] + len); g.stroke(); }
      g.fillStyle = rgba(PAL.white, 0.95);
      for (let i = 0; i < 12; i++) { const u = i / 11; g.fill(ell(lerp(veilRoot[0] - 84 + sw * 1.4, veilRoot[0] + 12 + sw, u), veilRoot[1] + len - 1 + Math.sin(u * Math.PI) * 6, 2.2, 2.2)); }
      g.restore();
    }
    g.restore();
  };
  drawVeilBack();
  // 2) 麻花辫（身后）
  drawBraid(g, braidPts, S, C);
  out.braid = braidPts.map((p) => X.pt(p[0], p[1]));
  out.braidTip = out.braid[out.braid.length - 1];
  X.translate(J.bodyX, -J.lift - J.tip * 6);
  X.rotate(J.tilt * DEG);
  X.translate(0, -J.hipY);
  out.waist = X.pt(0, 0);
  // —— 手臂 ——
  const arm = (side) => {
    const L = side === 'L';
    return {
      S: L ? PR.shoulderL : PR.shoulderR, a: L ? J.armL : J.armR, e: L ? J.elbowL : J.elbowR, wrist: L ? J.wristL : J.wristR,
      l1: PR.l1, lf: PR.lf, ho: PR.ho, ru: [5.8, 5.2], rf: [5.2, 4.7], stretch: L ? J.stretchL : J.stretchR, cuff: null,
      hand: L ? J.handL : J.handR, hr: 6.6,
      cols: { u: C(PAL.skin, 'skin'), f: C(PAL.skin, 'skin'), hand: C(PAL.skin, 'skin'), uRim: mixHex(PAL.skin, PAL.white, 0.5), fRim: mixHex(PAL.skin, PAL.white, 0.5), uShade: PAL.skinShade, fShade: PAL.skinShade },
      item: !L ? heldFn() : null,
    };
  };
  const heldFn = () => {
    if (!item || item === 'bouquet') return null;
    return (gg, XX) => {
      if (item === 'can') { const r = drawWateringCan(gg, { x: 0, y: -2, s: 0.9, pour: o.pour ?? 0.8, t, F, detail: det, rot: -J.lean * DEG * 0.5 }); out.spout = XX.pt(...r.spout); }
      else if (item === 'hairpin') { const ang = pk === 'stepOut' ? t * 9 : pk === 'pickLock' ? 0.9 + 0.12 * sin(t * 30) : 0.5; hairpin(gg, ang, S, C); out.item = XX.pt(0, 0); }
      else if (item === 'sign') { out.sign = cheerCard(gg, XX, S, t, C, unflip); }
    };
  };
  const drawArmLay = (side, lay, part) => {
    const L = side === 'L';
    if ((L ? J.layL : J.layR) !== lay) return;
    const r = drawArm(g, X, arm(side), S, part);
    if (part !== 'upper') out[L ? 'handL' : 'handR'] = r.hand;
  };
  const puffs = (sides) => {
    for (const side of sides) {
      const [sx, sy] = side === 'L' ? PR.shoulderL : PR.shoulderR;
      const pf = blob(sx + (side === 'L' ? -2 : 2), sy - 1, 12.5, 11, { seed: side === 'L' ? 51 : 52, amp: 0.05, freq: 4 });
      piece(g, pf, C(PAL.princessLight, 'dress'), { sh: det ? 1.6 : 0, F, rim: det ? PAL.white : null, rimW: 1.6 });
      if (det) {
        shade(g, pf, PAL.princess, sx + 12 * F, sy + 10, sx - 6 * F, sy - 8, 0.5, 0);
        g.save(); g.clip(pf); g.strokeStyle = rgba(PAL.princess, 0.7); g.lineWidth = 1.3;
        for (const k of [-5, 0, 5]) { g.beginPath(); g.moveTo(sx + k, sy - 11); g.quadraticCurveTo(sx + k * 1.4, sy, sx + k, sy + 10); g.stroke(); }
        g.restore();
      }
    }
  };
  // 3) 后层手臂
  X.save(); X.rotate(J.lean * DEG);
  drawArmLay('L', 'back', 'all'); drawArmLay('R', 'back', 'all');
  X.restore();
  // 4) 脚 / 踢出去的腿（骨盆坐标）
  const stepA = Math.sin(J.step * TAU), stepB = Math.sin(J.step * TAU + Math.PI);
  const seated = J.seat > 0.5; // {from,to,k} 插值时与 poseKey 一样按 k<0.5 取一侧
  if (!seated) {
    for (const [sx, ph] of [[-11, stepA], [12, stepB]]) {
      const lift = Math.max(0, ph) * 6;
      const sh = new Path2D(); sh.ellipse(sx + 4 + ph * 4, J.hipY - 4 - lift, 11, 6.5, 0, 0, TAU);
      piece(g, sh, C(PAL.princessDark, 'dress'), { sh: det ? 1.4 : 0, F, rim: det ? PAL.princess : null });
    }
  }
  const kickLeg = () => {
    if (!(J.kick > 0)) return;
    X.save(); X.translate(24, 64); X.rotate(-lerp(10, 62, J.kick) * DEG);
    const leg = capsule(54, 6.4, 5.4);
    piece(g, leg, C(PAL.skin, 'skin'), { sh: det ? 1.6 : 0, F, rim: det ? mixHex(PAL.skin, PAL.white, 0.5) : null });
    if (det) shade(g, leg, PAL.skinShade, 6 * F, 54, -3 * F, 0, 0.35, 0);
    X.translate(0, 54); X.rotate(-0.5);
    const sh = new Path2D(); sh.moveTo(-6, -5); sh.bezierCurveTo(-8, 6, 0, 8, 10, 8); sh.bezierCurveTo(20, 8, 22, 2, 18, -3); sh.bezierCurveTo(12, -7, 2, -8, -6, -5); sh.closePath();
    piece(g, sh, C(PAL.princessDark, 'dress'), { sh: det ? 1.4 : 0, F, rim: det ? PAL.princess : null });
    out.foot = X.pt(18, 2);
    X.restore();
  };
  // 5) 裙（三层；坐姿换成搭在腿上的裙摆）
  const sway = Math.sin(t * 1.6) * 3 + (J.flare > 0 ? Math.sin(t * 7) * 3 * J.flare : 0);
  const velX = br.vel ? (br.vel[0] * F) / s : 0;
  const drag = clamp(-velX * 0.04, -26, 26) + J.drag;
  if (seated) {
    for (const [sx2, sy2] of [[54, 104], [68, 100]]) { const sh = new Path2D(); sh.ellipse(sx2 + sway * 0.5, sy2, 10, 6, 0.35, 0, TAU); piece(g, sh, C(PAL.princessDark, 'dress'), { sh: det ? 1 : 0, F }); }
    const sk = skirtSeated(sway * 0.5);
    piece(g, sk, C(PAL.princess, 'dress'), { sh: det ? 2.4 : 0, F, rim: det ? PAL.princessLight : null, rimW: 2 });
    if (det) {
      shade(g, sk, PAL.princessDark, 70 * F, 100, -20 * F, 10, 0.45, 0);
      g.save(); g.clip(sk); g.strokeStyle = rgba(PAL.princessDark, 0.35); g.lineWidth = 1.8; g.lineCap = 'round';
      for (const [x0, x1] of [[-14, -40], [4, -6], [24, 30], [46, 62]]) { g.beginPath(); g.moveTo(x0 + 10, 16); g.quadraticCurveTo((x0 + x1) / 2, 60, x1 + sway * 0.4, 100); g.stroke(); }
      g.strokeStyle = rgba(PAL.princessLight, 0.9); g.lineWidth = 2.2; g.setLineDash([2, 5]); g.beginPath(); g.moveTo(-64, 90); g.quadraticCurveTo(8, 112, 80, 92); g.stroke();
      g.restore();
      const knee = new Path2D(); knee.moveTo(30, 22); knee.quadraticCurveTo(54, 18, 62, 34); g.save(); g.strokeStyle = rgba(PAL.princessLight, 0.8); g.lineWidth = 2.6; g.lineCap = 'round'; g.stroke(knee); g.restore();
    }
  } else {
    const tiers = [
      [20, 75, 114, 9, PAL.princess, PAL.princessDark, 3],
      [20, 61, 76, 7, PAL.princessLight, PAL.princess, 5],
      [20, 46, 40, 5, PAL.princess, PAL.princessDark, 8],
    ];
    tiers.forEach(([w0, w1, h, n, c, cd, seed], i) => {
      if (i === 1) kickLeg();
      const p = skirtTier(w0, w1, h, n, sway * (1 - i * 0.25), drag * (1 - i * 0.2), J.flare, seed);
      piece(g, p, C(c, 'dress'), { sh: det ? 2.6 - i * 0.4 : 0, F, rim: det ? mixHex(c, PAL.white, 0.45) : null, rimW: 2 });
      if (det) {
        shade(g, p, cd, w1 * 0.9 * F, h, -w1 * 0.3 * F, 0, 0.5, 0);
        g.save(); g.clip(p);
        g.strokeStyle = rgba(cd, 0.35); g.lineWidth = 1.6; g.lineCap = 'round';
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * w0 * 0.4, 4); g.quadraticCurveTo(k * w1 * 0.3, h * 0.5, k * w1 * 0.48 + sway, h + 2); g.stroke(); }
        if (i === 1) { g.strokeStyle = rgba(PAL.white, 0.8); g.lineWidth = 2.2; g.setLineDash([2, 5]); g.beginPath(); g.moveTo(-w1 * 1.1, h - 3); g.quadraticCurveTo(0, h + 7, w1 * 1.1, h - 3); g.stroke(); g.setLineDash([]); }
        g.restore();
      }
    });
  }
  // ———— 躯干 ————
  X.save();
  X.rotate(J.lean * DEG);
  X.scale(1, 1 + 0.01 * breath);
  const bd = bodice();
  piece(g, bd, C(PAL.princess, 'dress'), { sh: det ? 2 : 0, F, rim: det ? PAL.princessLight : null, rimW: 2 });
  if (det) {
    shade(g, bd, PAL.princessDark, 24 * F, 4, -10 * F, -36, 0.5, 0);
    // 领口花边
    g.save(); g.strokeStyle = PAL.princessLight; g.lineWidth = 3.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-20, -37); g.quadraticCurveTo(0, -30, 21, -37); g.stroke();
    g.strokeStyle = PAL.white; g.lineWidth = 1.4; g.setLineDash([1.5, 3.5]); g.stroke(); g.restore();
    // 项链 + 心形坠
    g.save(); g.strokeStyle = PAL.gold; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-9, -39); g.quadraticCurveTo(2, -27, 12, -39); g.stroke(); g.restore();
    piece(g, heartPath(2, -27, 7.5), PAL.heart, { sh: 0.8, F, rim: PAL.princessLight, rimW: 1 });
  }
  // 腰带 + 蝴蝶结
  const sash = new Path2D(); sash.moveTo(-20, -4); sash.quadraticCurveTo(0, 0, 20, -4); sash.lineTo(20, 4); sash.quadraticCurveTo(0, 8, -20, 4); sash.closePath();
  piece(g, sash, C(PAL.princessLight, 'dress'), { sh: det ? 1 : 0, F, rim: det ? PAL.white : null });
  if (!puppet || det) {
    X.save(); X.translate(-19, 1);
    for (const sx of [-1, 1]) { const lp = new Path2D(); lp.moveTo(0, 0); lp.bezierCurveTo(sx * 6, -11, sx * 18, -8, sx * 15, 1); lp.bezierCurveTo(sx * 15, 7, sx * 5, 6, 0, 0); lp.closePath(); piece(g, lp, C(PAL.princessLight, 'dress'), { sh: det ? 1.2 : 0, F }); }
    g.fillStyle = C(PAL.princessLight, 'dress'); g.fill(ribbon([[0, 2], [-4, 14], [-2, 26]], (u) => 3.4 - u)); g.fill(ribbon([[0, 2], [5, 14], [8, 24]], (u) => 3.4 - u));
    piece(g, ell(0, 0, 4.4, 4), C(PAL.princess, 'dress'), { F });
    X.restore();
  }
  // 6) 中层手臂 + 泡泡袖
  drawArmLay('L', 'mid', 'all'); drawArmLay('R', 'mid', 'all');
  drawArmLay('L', 'front', 'upper'); drawArmLay('R', 'front', 'upper');
  puffs(['L', 'R']);
  // 颈
  const neck = capsule(17, 6.6, 6.4);
  X.save(); X.translate(2, -56); piece(g, neck, C(PAL.skin, 'skin'), { F }); X.restore();
  out.neck = X.pt(2, -42);
  out.chest = X.pt(2, -18);
  // ———— 头 ————
  X.save();
  X.translate(PR.head[0] + J.headX, PR.head[1] + 30);
  X.rotate(J.head * DEG);
  X.translate(0, -30);
  out.head = X.pt(0, 0);
  const hw = PR.hw;
  const fx = 8, fy = 8;
  const hairC = C(PAL.hairGold, 'hair'), hairD = C(PAL.hairGoldDark, 'hair');
  // 后发
  const back = blob(-4, -2, 54, 50, { seed: 71, amp: 0.025 });
  piece(g, back, hairC, { sh: det ? 2 : 0, F });
  if (det) shade(g, back, PAL.hairGoldDark, 40 * F, 40, -20 * F, -30, 0.45, 0);
  // 头纱发髻（婚礼）
  if (veil > 0) piece(g, blob(-34, -26, 18 * veil, 16 * veil, { seed: 72, amp: 0.08, freq: 5 }), C(PAL.white, 'veil'), { sh: det ? 1.2 : 0, F, rim: det ? PAL.princessLight : null });
  // 脸
  const headP = blob(2, 2, PR.hrx, PR.hry, { seed: 73, amp: 0.012 });
  piece(g, headP, C(PAL.skin, 'skin'), { sh: det ? 1.6 : 0, F, rim: det ? rgba(PAL.white, 0.5) : null, rimW: 2 });
  if (det) shade(g, headP, PAL.skinShade, 46 * F, 46, 12 * F, 4, 0.26, 0);
  out.eyes = [X.pt(fx - 16, fy), X.pt(fx + 16, fy)];
  if (!sil) {
    X.save(); X.translate(fx, fy);
    drawFace(g, { hw, F, ex, blink, look: o.look, t, detail: det, skin: PAL.skin, lashes: true, mouthY: 0.215 * hw, browY: -0.17 * hw, blushY: 0.115 * hw, blushX: 0.27 * hw, noseY: 0.09 * hw, talk: o.talk, sweat: o.sweat });
    X.restore();
  }
  out.mouth = X.pt(fx + 3, fy + 0.23 * hw);
  // 刘海 + 侧发
  const bg = bangs();
  piece(g, bg, hairC, { sh: det ? 1.8 : 0, F, rim: det ? PAL.goldLight : null, rimW: 2.2 });
  if (det) {
    shade(g, bg, PAL.hairGoldDark, 40 * F, 6, -6 * F, -40, 0.42, 0);
    g.save(); g.clip(bg); g.strokeStyle = rgba(hairD, 0.6); g.lineWidth = 1.5; g.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [[-30, -40, -24, -14], [-6, -48, -4, -18], [18, -46, 20, -14], [38, -30, 40, 0]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2, x1, y1); g.stroke(); }
    // 光环
    g.strokeStyle = rgba(PAL.goldLight, 0.9); g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.ellipse(2, -26, 40, 22, 0, Math.PI * 1.1, Math.PI * 1.36); g.stroke();
    g.beginPath(); g.ellipse(2, -26, 40, 22, 0, Math.PI * 1.44, Math.PI * 1.7); g.stroke();
    g.restore();
  }
  for (const side of [-1, 1]) {
    const sl = sideLock(side, Math.sin(t * 1.4 + side) * 1.5);
    piece(g, sl, hairC, { sh: det ? 1.4 : 0, F, rim: det ? PAL.goldLight : null, rimW: 1.6 });
    if (det) shade(g, sl, PAL.hairGoldDark, side * 50 * F, 40, side * 36 * F, -20, 0.45, 0);
  }
  // 小皇冠
  const tiaraOn = o.tiara !== false;
  if (tiaraOn) {
    X.save(); X.translate(6, -53); X.rotate(0.1);
    const tr = drawTiara(g, { s: 1.12, t, F, glint: o.tiaraGlint ?? 0.25, detail: det, mono: sil && !keep.has('tiara') ? PAL.ink : null });
    out.tiara = X.pt(0, 0); out.tiaraTop = X.pt(...tr.top);
    X.restore();
  } else { X.save(); X.translate(6, -53); out.tiara = X.pt(0, 0); X.restore(); }
  X.restore(); // 头
  // 7) 名签
  if (o.nameTag) {
    const text = typeof o.nameTag === 'string' ? o.nameTag : o.nameTag.text;
    const size = typeof o.nameTag === 'object' && o.nameTag.size ? o.nameTag.size : 78;
    X.save(); X.translate(2, -30);
    nameTagDraw(g, text, size, S, unflip, t);
    out.nameTag = X.pt(0, size * 0.45);
    X.restore();
  }
  // 8) 双手的花束
  if (item === 'bouquet') {
    const fkL = armFK(PR.shoulderL, J.armL, J.elbowL, PR.l1 * J.stretchL, PR.l2 * J.stretchL), fkR = armFK(PR.shoulderR, J.armR, J.elbowR, PR.l1 * J.stretchR, PR.l2 * J.stretchR);
    X.save(); X.translate((fkL.hand[0] + fkR.hand[0]) / 2, (fkL.hand[1] + fkR.hand[1]) / 2 - 2);
    bouquet(g, S, C);
    out.item = X.pt(0, 0);
    X.restore();
  }
  // 9) 前层手臂
  drawArmLay('L', 'front', 'lower'); drawArmLay('R', 'front', 'lower');
  if (!out.handL) out.handL = X.pt(...armFK(PR.shoulderL, J.armL, J.elbowL, PR.l1, PR.l2).hand);
  if (!out.handR) out.handR = X.pt(...armFK(PR.shoulderR, J.armR, J.elbowR, PR.l1, PR.l2).hand);
  // 剧场纸偶：关节铆钉
  if (puppet && !sil) {
    for (const p of [PR.shoulderL, PR.shoulderR, [0, 2]]) { g.fillStyle = PAL.goldDark; g.fill(ell(p[0], p[1], 3, 3)); g.fillStyle = PAL.goldLight; g.fill(ell(p[0] - 0.8, p[1] - 0.8, 1.1, 1.1)); }
  }
  X.restore(); // 躯干
  X.restore();
  return out;
}
