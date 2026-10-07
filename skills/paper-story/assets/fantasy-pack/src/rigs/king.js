// 国王木偶：矮圆身材、过大的金王冠（全片情绪刻度）、大白胡子、红袍 + 白底黑点貂皮领、星星权杖。
// 坐标约定（docs/assets.md 0.2）：(x, y) = 脚底中心（坐姿 / 晕倒 / peek 例外，见下）；s=1 时身高 220 + 王冠约 42；face 1 朝右。
// 本文件同时导出“王室木偶工具”（统一脸部画法、两段臂 IK、手形、姿态插值），princess.js 复用，保证同一画风。
import { PAL, blob, shade, lin, glow, sparkle, ribbon, smooth as smoothPath } from '../core/paper.js';
import { clamp, lerp, TAU, hash1, hash2, noise1, rgba, mixHex } from '../core/util.js';
import { Xf, piece, starPath, heartPath, ell, drawCrown, drawTiara, drawSeal, drawScepter } from '../props/royal.js';

export const DEG = Math.PI / 180;

// =====================================================================
// 王室木偶工具（king / princess 共用）
// =====================================================================

/** 眨眼：返回闭合度 0..1（约每 3.7s 一次，偶尔连眨两下），由 t 决定。 */
export function blinkAt(t, seed = 0) {
  const P = 3.7;
  const u = t / P + seed * 0.37;
  const k = Math.floor(u);
  const local = (u - k) * P;
  const off = 0.35 + hash2(k, seed) * 2.6;
  const one = (d) => (d >= 0 && d < 0.16 ? Math.sin((Math.PI * d) / 0.16) : 0);
  let c = one(local - off);
  if (hash2(k, seed + 3) > 0.72) c = Math.max(c, one(local - off - 0.3));
  return c;
}

/** 两段臂 IK。S 肩、P 目标（同一坐标系），返回 [上臂角, 肘角]（度；0 = 垂直向下，+ = 朝面向一侧转）。bend = ±1 选肘的方向。 */
export function ik2(S, P, l1, l2, bend = 1) {
  const dx = P[0] - S[0], dy = P[1] - S[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const base = Math.atan2(dx, dy);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a = base + bend * A;
  const ex = S[0] + l1 * Math.sin(a), ey = S[1] + l1 * Math.cos(a);
  let e = Math.atan2(P[0] - ex, P[1] - ey) - a;
  while (e > Math.PI) e -= TAU;
  while (e < -Math.PI) e += TAU;
  return [a / DEG, e / DEG];
}

/** 正向运动学：肩 S、上臂角 a、肘角 e（度）→ { elbow, hand }。 */
export function armFK(S, a, e, l1, l2) {
  const A = a * DEG, E = (a + e) * DEG;
  const elbow = [S[0] + l1 * Math.sin(A), S[1] + l1 * Math.cos(A)];
  return { elbow, hand: [elbow[0] + l2 * Math.sin(E), elbow[1] + l2 * Math.cos(E)] };
}

/** 关节表插值：数值线性插值，其余取 k<0.5 的一侧。 */
export function mixJoints(A, B, k) {
  const out = {};
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[key], b = B[key];
    if (typeof a === 'number' && typeof b === 'number') out[key] = a + (b - a) * k;
    else if (Array.isArray(a) && Array.isArray(b)) out[key] = a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? v + (b[i] - v) * k : k < 0.5 ? v : b[i]));
    else out[key] = k < 0.5 ? (a ?? b) : (b ?? a);
  }
  return out;
}

/** 姿态的“主名字”：字符串直接返回；{from,to,k} 取 k<0.5 的一侧（用来决定默认手持物等离散项）。 */
export function poseKey(p) {
  while (p && typeof p === 'object') p = (p.k ?? 0) < 0.5 ? p.from : p.to;
  return p || 'idle';
}

/**
 * 解析姿态：pose 为名字或 {from, to, k}；表项是关节对象或 (t, o) => 关节对象。
 * 关节里可以写手的目标点 hL / hR（躯干坐标）或 hLp / hRp（骨盆坐标），在这里用 IK 解成臂角后再插值。
 * 最后叠加 o.joints：数值相加（度 / px），非数值直接覆盖。
 */
export function resolvePose(table, pose, t, o, base, rig) {
  const one = (name) => {
    const def = table[name] ?? table.idle;
    const j = { ...base, ...(typeof def === 'function' ? def(t, o) : def) };
    for (const side of ['L', 'R']) {
      let tgt = j['h' + side];
      if (!tgt && j['h' + side + 'p']) {
        const [px, py] = j['h' + side + 'p'], a = -(j.lean || 0) * DEG;
        tgt = [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)];
      }
      if (tgt) {
        const st = j['stretch' + side] ?? 1;
        const [a, e] = ik2(rig['shoulder' + side], tgt, rig.l1 * st, rig.l2 * st, j['bend' + side] ?? (side === 'L' ? -1 : 1));
        j['arm' + side] = a; j['elbow' + side] = e;
      }
      delete j['h' + side]; delete j['h' + side + 'p'];
    }
    return j;
  };
  const rec = (p) => (p && typeof p === 'object' ? mixJoints(rec(p.from), rec(p.to), clamp(p.k ?? 0)) : one(p || 'idle'));
  const J = rec(pose);
  if (o.joints) for (const k in o.joints) { const v = o.joints[k]; if (typeof v === 'number' && typeof J[k] === 'number') J[k] += v; else J[k] = v; }
  return J;
}

/** 沿 +y 的锥形胶囊（肢体）。r0 起点半径、r1 终点半径。 */
export function capsule(len, r0, r1) {
  const p = new Path2D();
  const sb = clamp((r0 - r1) / Math.max(len, 0.001), -0.95, 0.95);
  const b = Math.asin(sb), cb = Math.cos(b);
  p.moveTo(r0 * cb, r0 * sb);
  p.lineTo(r1 * cb, len + r1 * sb);
  p.arc(0, len, r1, b, Math.PI - b);
  p.lineTo(-r0 * cb, r0 * sb);
  p.arc(0, 0, r0, Math.PI - b, TAU + b);
  p.closePath();
  return p;
}

/**
 * 手（手坐标系：原点 = 腕，+y = 指向手指方向）。shape：mitt（默认连指手套）/ fist / point（伸食指）/ open（张开五指）/ cup（拢耳的 C 形）/ flat（平摊手掌）。
 * S: { F, detail, sil, ink }
 */
export function drawHand(g, shape, r, fill, S) {
  const dk = S.sil ? fill : mixHex(fill, PAL.ink, 0.22);
  const sh = S.detail && !S.sil ? 1.4 : 0;
  const rim = S.detail && !S.sil ? mixHex(fill, PAL.white, 0.5) : null;
  const F = S.F;
  const vol = (p, cx, cy, rr) => { if (S.detail && !S.sil) shade(g, p, mixHex(fill, PAL.ink, 0.3), cx + rr * 0.8 * F, cy + rr, cx - rr * 0.4 * F, cy - rr * 0.5, 0.42, 0); };
  const line = (pts, w) => { g.strokeStyle = rgba(dk, 0.7); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  switch (shape) {
    case 'fist': {
      { const p = ell(0, r * 0.75, r * 1.02, r * 0.95); piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, r * 0.75, r); }
      if (S.detail && !S.sil) { line([[-r * 0.5, r * 1.2], [-r * 0.15, r * 1.45]], r * 0.12); line([[r * 0.05, r * 1.25], [r * 0.4, r * 1.45]], r * 0.12); }
      break;
    }
    case 'point': {
      piece(g, capsule(r * 1.25, r * 0.33, r * 0.3), fill, { sh, F });
      g.save(); g.translate(0, r * 0.8);
      { const p = ell(0, 0, r * 0.95, r * 0.85); piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, 0, r); }
      g.restore();
      g.save(); g.translate(0, r * 1.1); piece(g, capsule(r * 1.15, r * 0.32, r * 0.28), fill, { F, rim, rimW: r * 0.1 }); g.restore();
      if (S.detail && !S.sil) line([[r * 0.35, r * 0.9], [r * 0.6, r * 1.1]], r * 0.12);
      break;
    }
    case 'open': {
      for (let i = 0; i < 4; i++) {
        const a = (-0.55 + i * 0.36);
        g.save(); g.translate(Math.sin(a) * r * 0.5, r * 0.9); g.rotate(-a);
        piece(g, capsule(r * 0.95, r * 0.3, r * 0.26), fill, { sh: sh * 0.6, F });
        g.restore();
      }
      g.save(); g.translate(r * 0.75 * F, r * 0.55); g.rotate(-1.0 * F);
      piece(g, capsule(r * 0.8, r * 0.3, r * 0.26), fill, { F });
      g.restore();
      { const p = ell(0, r * 0.65, r * 0.9, r * 0.82); piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, r * 0.65, r); }
      break;
    }
    case 'cup': {
      const p = new Path2D();
      p.moveTo(-r * 0.7, 0);
      p.bezierCurveTo(-r * 1.35, r * 0.6, -r * 1.1, r * 1.9, -r * 0.1, r * 2.0);
      p.bezierCurveTo(r * 0.6, r * 2.05, r * 0.95, r * 1.6, r * 0.7, r * 1.25);
      p.bezierCurveTo(r * 0.2, r * 1.5, -r * 0.4, r * 1.2, -r * 0.35, r * 0.7);
      p.bezierCurveTo(-r * 0.3, r * 0.35, r * 0.2, r * 0.1, r * 0.6, 0);
      p.closePath();
      piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, r, r);
      if (S.detail && !S.sil) line([[-r * 0.65, r * 1.35], [-r * 0.2, r * 1.55]], r * 0.1);
      break;
    }
    case 'flat': {
      { const p = ell(0, r * 0.95, r * 0.78, r * 1.15); piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, r * 0.95, r); }
      g.save(); g.translate(r * 0.62 * F, r * 0.45); g.rotate(-0.7 * F);
      piece(g, capsule(r * 0.7, r * 0.28, r * 0.25), fill, { F });
      g.restore();
      if (S.detail && !S.sil) { line([[-r * 0.3, r * 1.6], [-r * 0.3, r * 1.95]], r * 0.1); line([[r * 0.1, r * 1.65], [r * 0.1, r * 2.0]], r * 0.1); }
      break;
    }
    default: { // mitt
      { const p = ell(0, r * 0.8, r * 0.95, r * 1.02); piece(g, p, fill, { sh, F, rim, rimW: r * 0.09 }); vol(p, 0, r * 0.8, r); }
      g.save(); g.translate(r * 0.78 * F, r * 0.45); g.rotate(-0.55 * F);
      piece(g, ell(0, r * 0.35, r * 0.34, r * 0.5), fill, { F });
      g.restore();
    }
  }
}

/**
 * 两段臂（袖 + 袖口 + 手），在当前坐标系（躯干）里画。A：{ S:[x,y], a, e, wrist, l1, lf（前臂袖长）, ho（腕到手心偏移）,
 *   ru:[r0,r1], rf:[r0,r1], cuff:{len, r, color, spots}, hand, hr, cols:{u, f, hand}, item(g, X)（画在手之前、坐标轴已对齐躯干）, stretch }
 * part: 'all' | 'upper' | 'lower'。返回 { hand, elbow, wrist }（调用时坐标系里的点，经 X 换算）。
 */
export function drawArm(g, X, A, S, part = 'all') {
  const st = A.stretch ?? 1;
  const l1 = A.l1 * st, lf = A.lf * st;
  const out = {};
  X.save();
  X.translate(A.S[0], A.S[1]);
  X.rotate(-A.a * DEG);
  if (part !== 'lower') {
    const up = capsule(l1, A.ru[0], A.ru[1]);
    piece(g, up, A.cols.u, { sh: S.detail && !S.sil ? 1.8 : 0, F: S.F, rim: S.detail && !S.sil ? A.cols.uRim : null, rimW: 1.6 });
    if (S.detail && !S.sil && A.cols.uShade) shade(g, up, A.cols.uShade, A.ru[0] * S.F, l1, -A.ru[0] * 0.3 * S.F, 0, 0.35, 0);
  }
  X.translate(0, l1);
  out.elbow = X.pt(0, 0);
  X.rotate(-A.e * DEG);
  if (part !== 'upper') {
    const fp = capsule(lf, A.rf[0], A.rf[1]);
    piece(g, fp, A.cols.f, { sh: S.detail && !S.sil ? 1.8 : 0, F: S.F, rim: S.detail && !S.sil ? A.cols.fRim : null, rimW: 1.6 });
    if (S.detail && !S.sil && A.cols.fShade) shade(g, fp, A.cols.fShade, A.rf[1] * S.F, lf, -A.rf[1] * 0.3 * S.F, 0, 0.35, 0);
  }
  X.translate(0, lf);
  if (A.cuff) {
    if (part !== 'upper') {
      const cp = capsule(A.cuff.len, A.cuff.r, A.cuff.r * 0.97);
      piece(g, cp, A.cuff.color, { sh: S.detail && !S.sil ? 1.2 : 0, F: S.F, rim: S.detail && !S.sil ? PAL.white : null, rimW: 1.4 });
      if (A.cuff.spots && S.detail && !S.sil) ermineSpot(g, A.cuff.r * 0.2, A.cuff.len * 0.5, A.cuff.r * 0.15);
    }
    X.translate(0, A.cuff.len);
  }
  out.wrist = X.pt(0, 0);
  X.rotate(-(A.wrist || 0) * DEG);
  X.translate(0, A.ho ?? 0);
  out.hand = X.pt(0, 0);
  if (part !== 'upper') {
    if (A.item) {
      X.save();
      X.rotate((A.a + A.e + (A.wrist || 0)) * DEG);
      A.item(g, X);
      X.restore();
    }
    X.translate(0, -(A.ho ?? 0) * 0.55);
    drawHand(g, A.hand || 'mitt', A.hr, A.cols.hand, S);
  }
  X.restore();
  return out;
}

/** 貂皮黑点（小尾尖）。 */
export function ermineSpot(g, x, y, r) {
  g.fillStyle = PAL.ink;
  const p = new Path2D();
  p.moveTo(x, y - r * 1.6);
  p.quadraticCurveTo(x + r * 1.1, y, x, y + r * 1.3);
  p.quadraticCurveTo(x - r * 1.1, y, x, y - r * 1.6);
  g.fill(p);
  g.fillRect(x - r * 0.9, y - r * 0.3, r * 1.8, r * 0.45);
}

// —— 表情：所有角色共用的部件配置 ——
/** 统一表情预设（部件组合）。各角色在此基础上取名字。 */
export const FACE = {
  smile: { eyes: 'dot', brows: 'normal', mouth: 'smile' },
  joy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1.3 },
  panic: { eyes: 'wide', brows: 'worried', mouth: 'scream', sweat: 1, lines: 1 },
  squint: { eyes: 'squintOne', brows: 'squint', mouth: 'smirk' },
  confident: { eyes: 'half', brows: 'flat', mouth: 'smirk' },
  puffed: { eyes: 'squeeze', brows: 'up', mouth: 'blow', blush: 1.6, cheeks: 1 },
  sick: { eyes: 'half', brows: 'worried', mouth: 'wavy', green: 1, lines: 1, blush: 0 },
  dizzy: { eyes: 'spiral', brows: 'worried', mouth: 'wavy', blush: 0.6 },
  faint: { eyes: 'x', brows: 'none', mouth: 'tongueOut', blush: 0.5 },
  proud: { eyes: 'happy', brows: 'up', mouth: 'smile', blush: 1.1 },
  tearful: { eyes: 'tear', brows: 'worried', mouth: 'wobble', blush: 1.2 },
  waterfall: { eyes: 'squeeze', brows: 'worried', mouth: 'cry', tears: 1, blush: 1.2 },
  starEyes: { eyes: 'star', brows: 'up', mouth: 'grin', blush: 1.3 },
  relieved: { eyes: 'closed', brows: 'relaxed', mouth: 'smile', blush: 0.9 },
  gasp: { eyes: 'wide', brows: 'up', mouth: 'gasp' },
  eyeroll: { eyes: 'roll', brows: 'flat', mouth: 'flat' },
  shock: { eyes: 'wide', brows: 'up', mouth: 'open', lines: 1 },
  focused: { eyes: 'focus', brows: 'angry', mouth: 'tongue' },
  smug: { eyes: 'half', brows: 'raised1', mouth: 'smirk' },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1.3 },
  shy: { eyes: 'closed', brows: 'worried', mouth: 'wavySmall', blush: 2, hatch: 1 },
  loving: { eyes: 'heart', brows: 'relaxed', mouth: 'smile', blush: 1.6 },
  tense: { eyes: 'wide', brows: 'worried', mouth: 'teeth', sweat: 1 },
};

/**
 * 统一脸部画法。原点 = 两眼连线中点，hw = 头宽。
 * f: { hw, F, ex（表情部件对象）, blink, look:[dx,dy]（-1..1）, t, detail, skin（眼睑遮盖色）, eyeGap, browY, mouthX, mouthY,
 *      noseX, noseY, noseR, blushX, blushY, talk 0..1, cheeks, lashes（公主睫毛）, mouthOnly / noMouth（分开画嘴：国王的嘴在胡子上） }
 */
export function drawFace(g, f) {
  const hw = f.hw, F = f.F ?? 1, ex = f.ex || FACE.smile, t = f.t || 0, det = f.detail ?? 1;
  const rx = 0.045 * hw, ry = 0.065 * hw, lw = 0.025 * hw;
  const gap = f.eyeGap ?? 0.17 * hw;
  const ink = PAL.ink;
  const blink = f.blink ?? 0;
  const look = f.look || [0, 0];
  const strokeP = (pathFn, w = lw, col = ink) => { g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pathFn(); g.stroke(); g.restore(); };
  const skin = f.skin || PAL.skin;
  if (f.tearsOnly) { if (ex.tears && det) drawTears(g, f, gap, ry, lw, t); return; }
  if (!f.mouthOnly) {
    // 额头竖线（惊吓 / 发青）
    if (ex.lines && det) {
      g.save(); g.strokeStyle = rgba(PAL.inkSoft, 0.4 * ex.lines); g.lineWidth = lw * 0.7; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const x = (-0.12 + i * 0.09) * hw; g.beginPath(); g.moveTo(x, -0.44 * hw); g.lineTo(x, -0.3 * hw + (i % 2) * 0.03 * hw); g.stroke(); }
      g.restore();
    }
    // 腮红
    const bl = ex.blush ?? 1;
    if (bl > 0 && det) {
      const by = f.blushY ?? 0.12 * hw, bx = f.blushX ?? 0.27 * hw;
      g.fillStyle = rgba(PAL.blush, Math.min(0.75, 0.45 * bl));
      for (const sx of [-1, 1]) g.fill(ell(sx * bx + (sx > 0 ? 0.02 * hw : 0), by, 0.075 * hw * (0.9 + 0.1 * bl), 0.042 * hw * (0.9 + 0.1 * bl)));
      if (ex.hatch) {
        g.save(); g.strokeStyle = rgba(PAL.redDark, 0.45); g.lineWidth = lw * 0.55; g.lineCap = 'round';
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const x0 = sx * bx - 0.04 * hw + i * 0.03 * hw; g.beginPath(); g.moveTo(x0, by + 0.025 * hw); g.lineTo(x0 + 0.02 * hw, by - 0.02 * hw); g.stroke(); }
        g.restore();
      }
    }
    // 鼻
    if (det && f.noseR !== 0) {
      g.fillStyle = PAL.skinShade;
      g.fill(ell(f.noseX ?? 0.04 * hw, f.noseY ?? 0.075 * hw, f.noseR ?? 0.022 * hw, (f.noseR ?? 0.022 * hw) * 0.85));
    }
    // 眼
    const eye = (exx, side) => {
      const kind0 = ex.eyes || 'dot';
      let kind = kind0;
      if (kind0 === 'wink') kind = side ? 'happy' : 'dot';
      if (kind0 === 'squintOne') kind = side ? 'line' : 'dot';
      const ey = 0, wsc = side ? 0.9 : 1;
      const lx = look[0] * rx * 0.55, ly = look[1] * ry * 0.35;
      const dotEye = (sx = 1, sy = 1, hl = 1) => {
        const bs = 1 - blink * 0.92;
        if (bs < 0.3) { strokeP(() => { g.moveTo(exx - rx * 1.2, ey + ry * 0.15); g.quadraticCurveTo(exx, ey + ry * 0.45, exx + rx * 1.2, ey + ry * 0.15); }); return; }
        g.fillStyle = ink; g.fill(ell(exx + lx, ey + ly + ry * (1 - bs) * 0.3, rx * wsc * sx, ry * sy * bs));
        if (det && hl) {
          g.fillStyle = PAL.white;
          g.fill(ell(exx + lx - rx * 0.32 * F * sx, ey + ly - ry * 0.38 * sy * bs, rx * 0.36 * hl * sx, rx * 0.36 * hl * sx * Math.min(1, bs + 0.2)));
          if (hl > 1.05) g.fill(ell(exx + lx + rx * 0.35 * F * sx, ey + ly + ry * 0.4 * sy * bs, rx * 0.18 * sx, rx * 0.18 * sx));
        }
      };
      const lid = (slant, cover, col = skin) => {
        // 眼睑：在眼形里盖一块肤色；slant > 0 内低外高（凶 / 专注），< 0 外低（委屈）
        const sgn = side ? 1 : -1;
        const yl = ey - ry + cover * ry * 2;
        const xi = exx - sgn * rx * 1.45, xo = exx + sgn * rx * 1.45;
        const yi = yl + slant * rx, yo = yl - slant * rx;
        g.save();
        g.beginPath(); g.ellipse(exx + lx, ey + ly, rx * wsc * 1.6, ry * 1.25, 0, 0, TAU); g.clip();
        g.fillStyle = col;
        g.beginPath(); g.moveTo(xi, yi); g.lineTo(xo, yo); g.lineTo(xo, yo - ry * 5); g.lineTo(xi, yi - ry * 5); g.closePath(); g.fill();
        g.restore();
        strokeP(() => { g.moveTo(xi + sgn * rx * 0.1, yi); g.lineTo(xo, yo); }, lw * 0.95);
      };
      switch (kind) {
        case 'wide': dotEye(1.22, 1.22, 1.3); break;
        case 'half': dotEye(); lid(0, 0.48); break;
        case 'focus': dotEye(1, 0.95); lid(0.35, 0.42); break;
        case 'angry': dotEye(); lid(0.6, 0.3); break;
        case 'happy': strokeP(() => { g.moveTo(exx - rx * 1.25, ey + ry * 0.25); g.quadraticCurveTo(exx, ey - ry * 0.95, exx + rx * 1.25, ey + ry * 0.25); }, lw * 1.05); break;
        case 'closed': strokeP(() => { g.moveTo(exx - rx * 1.25, ey - ry * 0.05); g.quadraticCurveTo(exx, ey + ry * 0.75, exx + rx * 1.25, ey - ry * 0.05); }, lw * 1.05); break;
        case 'line': strokeP(() => { g.moveTo(exx - rx * 1.3, ey + ry * 0.1); g.lineTo(exx + rx * 1.3, ey - ry * 0.05); }, lw * 1.1); if (det) strokeP(() => { g.moveTo(exx + rx * 1.4, ey - ry * 0.5); g.lineTo(exx + rx * 1.9, ey - ry * 0.75); g.moveTo(exx + rx * 1.45, ey + ry * 0.35); g.lineTo(exx + rx * 1.95, ey + ry * 0.45); }, lw * 0.6); break;
        case 'squeeze': { const sgn = side ? -1 : 1; strokeP(() => { g.moveTo(exx - rx * 1.1 * sgn, ey - ry * 0.75); g.lineTo(exx + rx * 0.9 * sgn, ey); g.lineTo(exx - rx * 1.1 * sgn, ey + ry * 0.75); }, lw * 1.1); break; }
        case 'x': strokeP(() => { g.moveTo(exx - rx * 1.2, ey - ry * 0.8); g.lineTo(exx + rx * 1.2, ey + ry * 0.8); g.moveTo(exx + rx * 1.2, ey - ry * 0.8); g.lineTo(exx - rx * 1.2, ey + ry * 0.8); }, lw * 1.15); break;
        case 'spiral': {
          const R = ry * 1.25, rot = t * 6 * (side ? -1 : 1);
          strokeP(() => { for (let i = 0; i <= 40; i++) { const u = i / 40, a = rot + u * TAU * 2.4, r = R * u; const px = exx + Math.cos(a) * r, py = ey + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } }, lw * 0.85);
          break;
        }
        case 'star': {
          const R = ry * 1.75 * (1 + 0.08 * Math.sin(t * 9 + side));
          const sp = starPath(exx, ey, R, R * 0.48, 5, -Math.PI / 2 + 0.12 * Math.sin(t * 5 + side), R * 0.12);
          g.fillStyle = PAL.gold; g.fill(sp);
          g.save(); g.strokeStyle = PAL.goldDark; g.lineWidth = lw * 0.7; g.lineJoin = 'round'; g.stroke(sp); g.restore();
          if (det) { g.fillStyle = PAL.goldLight; g.fill(starPath(exx - R * 0.12 * F, ey - R * 0.12, R * 0.45, R * 0.22, 5, -Math.PI / 2)); sparkle(g, exx - R * 0.6 * F, ey - R * 0.7, R * 0.45, { rot: t * 2, alpha: 0.9 }); }
          break;
        }
        case 'heart': {
          const S = ry * 2.7 * (1 + 0.1 * Math.sin(t * 7));
          g.fillStyle = PAL.heart; g.fill(heartPath(exx, ey, S));
          if (det) { g.fillStyle = rgba(PAL.white, 0.85); g.fill(ell(exx - S * 0.2 * F, ey - S * 0.18, S * 0.1, S * 0.08)); }
          break;
        }
        case 'roll': {
          g.fillStyle = PAL.white; g.fill(ell(exx, ey, rx * 1.55, ry * 1.2));
          g.fillStyle = ink; g.fill(ell(exx + rx * 0.25 * F, ey - ry * 0.72, rx * 0.62, rx * 0.62));
          g.save(); g.strokeStyle = ink; g.lineWidth = lw * 0.6; g.stroke(ell(exx, ey, rx * 1.55, ry * 1.2)); g.restore();
          lid(0, 0.3, skin);
          break;
        }
        case 'tear': {
          dotEye(1.12, 1.1, 1.35);
          if (det) {
            g.fillStyle = rgba(PAL.water, 0.85);
            const tx = exx + (side ? 1 : -1) * rx * 0.9, ty = ey + ry * 1.05;
            const d = new Path2D(); d.moveTo(tx, ty - rx * 0.9); d.quadraticCurveTo(tx + rx * 0.7, ty + rx * 0.2, tx, ty + rx * 0.75); d.quadraticCurveTo(tx - rx * 0.7, ty + rx * 0.2, tx, ty - rx * 0.9); g.fill(d);
            strokeP(() => { g.moveTo(exx - rx * 1.1, ey + ry * 1.25); g.quadraticCurveTo(exx, ey + ry * 1.55, exx + rx * 1.1, ey + ry * 1.25); }, lw * 0.6, rgba(PAL.white, 0.9));
          }
          break;
        }
        default: dotEye();
      }
    };
    eye(-gap, 0);
    eye(gap, 1);
    // 眉
    const brow = (bx, side) => {
      const kind = ex.brows || 'normal';
      if (kind === 'none') return;
      const L = 0.115 * hw, by0 = f.browY ?? -0.16 * hw;
      let yi = 0, yo = 0.01 * hw, arch = 0.22, dy = 0;
      switch (kind) {
        case 'up': dy = -0.05 * hw; arch = 0.3; break;
        case 'worried': yi = -0.045 * hw; yo = 0.02 * hw; arch = 0.08; break;
        case 'angry': yi = 0.035 * hw; yo = -0.03 * hw; arch = 0.05; break;
        case 'flat': dy = 0.018 * hw; arch = 0; yo = 0; break;
        case 'relaxed': dy = -0.025 * hw; arch = 0.32; break;
        case 'raised1': if (side) { dy = -0.06 * hw; arch = 0.3; } else { dy = 0.015 * hw; arch = 0; yo = 0; } break;
        case 'squint': if (side) { dy = 0.035 * hw; yi = 0.01 * hw; yo = -0.012 * hw; arch = 0.05; } break;
        default: break;
      }
      const sgn = side ? 1 : -1;
      const xi = bx - sgn * L * 0.45, xo = bx + sgn * L * 0.55;
      const y1 = by0 + dy + yi, y2 = by0 + dy + yo;
      g.save();
      g.fillStyle = ink;
      const pts = [[xo, y2], [(xi + xo) / 2, (y1 + y2) / 2 - arch * L], [xi, y1]];
      const pp = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8; const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pp.push([a * pts[0][0] + b * pts[1][0] + c * pts[2][0], a * pts[0][1] + b * pts[1][1] + c * pts[2][1]]); }
      g.fill(ribbon(pp, (u) => lw * (0.55 + 0.5 * u)));
      g.restore();
    };
    brow(-gap, 0);
    brow(gap, 1);
    // 汗
    const sw = Math.max(ex.sweat || 0, f.sweat || 0);
    if (sw > 0 && det) {
      const sx = gap + 0.24 * hw, sy = -0.2 * hw + 0.03 * hw * Math.sin(t * 3);
      const d = new Path2D(); const r = 0.045 * hw * (0.6 + 0.4 * sw);
      d.moveTo(sx, sy - r * 1.9); d.quadraticCurveTo(sx + r * 1.1, sy, sx, sy + r); d.quadraticCurveTo(sx - r * 1.1, sy, sx, sy - r * 1.9);
      g.fillStyle = rgba(PAL.skyDay, 0.95 * sw); g.fill(d);
      g.fillStyle = rgba(PAL.white, 0.9 * sw); g.fill(ell(sx - r * 0.3, sy - r * 0.2, r * 0.25, r * 0.4));
    }
    // 睫毛
    if (f.lashes && det && !['happy', 'closed', 'x', 'spiral', 'star', 'heart', 'squeeze'].includes(ex.eyes)) {
      for (const [exx, side] of [[-gap, 0], [gap, 1]]) {
        const sgn = side ? 1 : -1, wsc = side ? 0.9 : 1;
        strokeP(() => { g.moveTo(exx + sgn * rx * 0.75 * wsc, -ry * 0.75); g.lineTo(exx + sgn * rx * 1.45 * wsc, -ry * 1.05); g.moveTo(exx + sgn * rx * 0.35 * wsc, -ry * 0.95); g.lineTo(exx + sgn * rx * 0.75 * wsc, -ry * 1.35); }, lw * 0.6);
      }
    }
  }
  if (f.noMouth) return;
  drawMouth(g, f, ex, lw, t, det);
  if (ex.tears && det) drawTears(g, f, gap, ry, lw, t);
}

/** 瀑布泪（两道小瀑布，水流纹随 t 下流）。原点 = 两眼连线中点。 */
export function drawTears(g, f, gap, ry, lw, t) {
  const hw = f.hw;
  for (const [exx, sgn] of [[-gap, -1], [gap, 1]]) {
    const len = f.tearLen ?? 0.85 * hw;
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([exx + sgn * (0.05 * hw + 0.16 * hw * Math.sin(u * 1.4)), ry * 0.6 + u * len]); }
    const st = ribbon(pts, (u) => 0.03 * hw + 0.035 * hw * u);
    g.fillStyle = rgba(PAL.water, 0.9); g.fill(st);
    g.save(); g.clip(st);
    g.strokeStyle = rgba(PAL.white, 0.85); g.lineWidth = lw * 0.7; g.setLineDash([0.08 * hw, 0.1 * hw]); g.lineDashOffset = -t * hw * 1.6;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x - sgn * 0.01 * hw, y) : g.moveTo(x, y))); g.stroke();
    g.restore();
    const [tx, ty] = pts[pts.length - 1];
    for (let k = 0; k < 4; k++) {
      const ph = (t * 2.2 + k * 0.25) % 1;
      g.fillStyle = rgba(PAL.water, 0.85 * (1 - ph));
      g.fill(ell(tx + sgn * (0.04 + k * 0.03) * hw * ph * 3, ty - 0.12 * hw * Math.sin(ph * Math.PI), 0.022 * hw, 0.022 * hw));
    }
  }
}

/** 嘴（drawFace 内部用，也给国王单独画在胡子上）。 */
export function drawMouth(g, f, ex, lw, t, det = 1) {
  const hw = f.hw;
  const mx = f.mouthX ?? 0.035 * hw, my = f.mouthY ?? 0.2 * hw, mw = (f.mouthW ?? 0.13) * hw;
  let kind = ex.mouth || 'smile';
  const talk = f.talk || 0;
  let openK = 0;
  if (talk > 0) { const o = 0.5 + 0.5 * Math.sin(t * TAU * 6.3); openK = o * talk; if (openK > 0.3) kind = 'talk'; }
  const ink = PAL.ink;
  const S = (fn, w = lw) => { g.save(); g.strokeStyle = ink; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); fn(); g.stroke(); g.restore(); };
  const open = (path, tongue = true) => {
    g.fillStyle = PAL.redDeep; g.fill(path);
    if (tongue && det) { g.save(); g.clip(path); g.fillStyle = PAL.heart; const b = path._b; g.fill(ell(b[0], b[1], b[2], b[3])); g.restore(); }
    g.save(); g.strokeStyle = ink; g.lineWidth = lw * 0.85; g.lineJoin = 'round'; g.stroke(path); g.restore();
  };
  const ovalP = (cx, cy, rx, ry) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); p._b = [cx + rx * 0.1, cy + ry * 0.75, rx * 0.75, ry * 0.5]; return p; };
  switch (kind) {
    case 'flat': S(() => { g.moveTo(mx - mw * 0.4, my); g.lineTo(mx + mw * 0.4, my + mw * 0.03); }); break;
    case 'frown': S(() => { g.moveTo(mx - mw * 0.45, my + mw * 0.12); g.quadraticCurveTo(mx, my - mw * 0.22, mx + mw * 0.45, my + mw * 0.12); }); break;
    case 'smirk': S(() => { g.moveTo(mx - mw * 0.42, my + mw * 0.02); g.quadraticCurveTo(mx + mw * 0.05, my + mw * 0.26, mx + mw * 0.5, my - mw * 0.14); }); if (det) S(() => { g.moveTo(mx + mw * 0.5, my - mw * 0.24); g.lineTo(mx + mw * 0.56, my - mw * 0.04); }, lw * 0.6); break;
    case 'wavy': case 'wavySmall': case 'wobble': {
      const k = kind === 'wavy' ? 1 : 0.65;
      S(() => { for (let i = 0; i <= 16; i++) { const u = i / 16; const x = mx + (u - 0.5) * mw * 1.05 * k, y = my + Math.sin(u * TAU * (kind === 'wobble' ? 1 : 1.5) + (kind === 'wobble' ? Math.PI : 0)) * mw * 0.08 + (kind === 'wobble' ? -Math.sin(u * Math.PI) * mw * 0.1 : 0); i ? g.lineTo(x, y) : g.moveTo(x, y); } });
      break;
    }
    case 'grin': {
      const p = new Path2D();
      p.moveTo(mx - mw * 0.62, my - mw * 0.06); p.quadraticCurveTo(mx, my + mw * 0.06, mx + mw * 0.62, my - mw * 0.06);
      p.quadraticCurveTo(mx + mw * 0.45, my + mw * 0.8, mx, my + mw * 0.8); p.quadraticCurveTo(mx - mw * 0.45, my + mw * 0.8, mx - mw * 0.62, my - mw * 0.06); p.closePath();
      p._b = [mx + mw * 0.05, my + mw * 0.72, mw * 0.32, mw * 0.24];
      open(p);
      break;
    }
    case 'open': case 'talk': { const k = kind === 'talk' ? 0.55 + 0.45 * openK : 1; open(ovalP(mx, my + mw * 0.15, mw * 0.32, mw * 0.36 * k)); break; }
    case 'gasp': open(ovalP(mx, my + mw * 0.2, mw * 0.26, mw * 0.46)); break;
    case 'scream': {
      const p = new Path2D(); const w = mw * (1 + 0.04 * Math.sin(t * 40));
      p.moveTo(mx - w * 0.4, my); for (let i = 0; i <= 6; i++) { const u = i / 6; p.lineTo(mx - w * 0.4 + u * w * 0.8, my + (i % 2 ? -1 : 1) * mw * 0.05); }
      p.quadraticCurveTo(mx + w * 0.52, my + mw * 0.85, mx, my + mw * 0.85); p.quadraticCurveTo(mx - w * 0.52, my + mw * 0.85, mx - w * 0.4, my); p.closePath();
      p._b = [mx, my + mw * 0.75, mw * 0.3, mw * 0.22];
      open(p);
      break;
    }
    case 'cry': {
      const w = mw * (1.05 + 0.06 * Math.sin(t * 20)), h = mw * (0.6 + 0.06 * Math.sin(t * 13));
      const p = new Path2D(); p.moveTo(mx - w * 0.5, my + h * 0.15); p.quadraticCurveTo(mx, my - h * 0.35, mx + w * 0.5, my + h * 0.15); p.quadraticCurveTo(mx + w * 0.42, my + h, mx, my + h); p.quadraticCurveTo(mx - w * 0.42, my + h, mx - w * 0.5, my + h * 0.15); p.closePath();
      p._b = [mx, my + h * 0.85, w * 0.3, h * 0.28];
      open(p);
      break;
    }
    case 'blow': {
      const p = ovalP(mx + mw * 0.05, my + mw * 0.05, mw * 0.17, mw * 0.2);
      g.fillStyle = PAL.redDeep; g.fill(p);
      g.save(); g.strokeStyle = ink; g.lineWidth = lw * 1.1; g.stroke(p); g.restore();
      if (det) S(() => { g.moveTo(mx + mw * 0.35, my - mw * 0.12); g.lineTo(mx + mw * 0.45, my - mw * 0.2); g.moveTo(mx + mw * 0.36, my + mw * 0.2); g.lineTo(mx + mw * 0.47, my + mw * 0.27); }, lw * 0.6);
      break;
    }
    case 'tongue': {
      S(() => { g.moveTo(mx - mw * 0.35, my); g.quadraticCurveTo(mx, my + mw * 0.22, mx + mw * 0.35, my - mw * 0.02); });
      const tp = new Path2D(); tp.ellipse(mx + mw * 0.3, my + mw * 0.12, mw * 0.12, mw * 0.16, -0.4, 0, Math.PI * 1.2);
      g.fillStyle = PAL.heart; g.fill(tp);
      g.save(); g.strokeStyle = ink; g.lineWidth = lw * 0.6; g.stroke(tp); g.restore();
      break;
    }
    case 'tongueOut': {
      open(ovalP(mx, my + mw * 0.08, mw * 0.3, mw * 0.2), false);
      const tp = new Path2D(); tp.moveTo(mx - mw * 0.15, my + mw * 0.12); tp.quadraticCurveTo(mx - mw * 0.2, my + mw * 0.62, mx + mw * 0.05, my + mw * 0.62); tp.quadraticCurveTo(mx + mw * 0.25, my + mw * 0.6, mx + mw * 0.18, my + mw * 0.12); tp.closePath();
      g.fillStyle = PAL.heart; g.fill(tp);
      g.save(); g.strokeStyle = ink; g.lineWidth = lw * 0.6; g.stroke(tp); g.beginPath(); g.moveTo(mx + mw * 0.02, my + mw * 0.2); g.lineTo(mx + mw * 0.02, my + mw * 0.45); g.stroke(); g.restore();
      break;
    }
    case 'teeth': {
      const p = new Path2D(); p.roundRect(mx - mw * 0.5, my - mw * 0.12, mw, mw * 0.36, mw * 0.12);
      g.fillStyle = PAL.white; g.fill(p);
      g.save(); g.strokeStyle = ink; g.lineWidth = lw * 0.8; g.stroke(p);
      g.lineWidth = lw * 0.5; g.beginPath(); g.moveTo(mx - mw * 0.5, my + mw * 0.06); g.lineTo(mx + mw * 0.5, my + mw * 0.06);
      for (const k of [-0.2, 0.05, 0.28]) { g.moveTo(mx + k * mw, my - mw * 0.12); g.lineTo(mx + k * mw, my + mw * 0.24); }
      g.stroke(); g.restore();
      break;
    }
    case 'cat': S(() => { g.moveTo(mx - mw * 0.4, my); g.quadraticCurveTo(mx - mw * 0.2, my + mw * 0.25, mx, my); g.quadraticCurveTo(mx + mw * 0.2, my + mw * 0.25, mx + mw * 0.4, my); }); break;
    case 'bigSmile': S(() => { g.moveTo(mx - mw * 0.6, my - mw * 0.05); g.quadraticCurveTo(mx, my + mw * 0.65, mx + mw * 0.6, my - mw * 0.05); }, lw * 1.1); break;
    default: S(() => { g.moveTo(mx - mw * 0.42, my); g.quadraticCurveTo(mx, my + mw * 0.38, mx + mw * 0.42, my); }); // smile
  }
}

/** 头顶转圈的小星（晕）。 */
export function dizzyStars(g, cx, cy, r, t, k = 1) {
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + (i * TAU) / 3;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.32;
    const sc = 0.75 + 0.25 * Math.sin(a);
    g.fillStyle = rgba(PAL.gold, k); g.fill(starPath(x, y, r * 0.2 * sc, r * 0.09 * sc, 5, -Math.PI / 2 + a));
    g.save(); g.strokeStyle = rgba(PAL.goldDark, k); g.lineWidth = r * 0.025; g.stroke(starPath(x, y, r * 0.2 * sc, r * 0.09 * sc, 5, -Math.PI / 2 + a)); g.restore();
  }
}

// =====================================================================
// 国王
// =====================================================================

const KR = {
  hipY: 44, legX: 15, legLen: 26,
  shoulderL: [-46, -95], shoulderR: [46, -95],
  l1: 32, l2: 43, lf: 27, ho: 8,
  head: [3, -134], hw: 100, hrx: 50, hry: 46,
};

const KB = {
  hipY: 44, legLay: 'back', legY: -2, tilt: 0, lean: 0, head: 0, armL: -18, elbowL: 14, armR: 18, elbowR: -14, legL: 0, legR: 0, footL: 0, footR: 0,
  tip: 0, lift: 0, bodyX: 0, handL: 'mitt', handR: 'mitt', wristL: 0, wristR: 0, layL: 'mid', layR: 'mid', breath: 1,
  stretchL: 1, stretchR: 1, sealAng: 0,
};

const sin = Math.sin;
/** 国王动作表（关节角为度；hL/hR 为躯干坐标里的手目标点，自动 IK）。 */
const KING_TABLE = {
  idle: (t) => ({ armL: -17 + 2 * sin(t * 1.7), elbowL: 16, armR: 17 - 2 * sin(t * 1.7 + 1), elbowR: -16 }),
  sit: (t) => ({ hipY: 13, legLay: 'front', legY: 9, legL: 8 + 4 * sin(t * 2.1), legR: -4 + 4 * sin(t * 2.1 + 1.3), footL: 6, footR: -4, armL: -8, elbowL: 34, armR: 10, elbowR: -32, breath: 1.2 }),
  hop: { armL: -150, elbowL: -16, armR: 150, elbowR: 16, handL: 'open', handR: 'open', legL: -34, legR: 28, footL: 28, footR: 22, lean: -5, head: -7 },
  pace: (t) => {
    const ph = TAU * t * 3.4, s1 = sin(ph);
    return { legL: 32 * s1, legR: -32 * s1, footL: 10 * s1, footR: -10 * s1, armL: -140 + 22 * sin(ph + 1), elbowL: -34, armR: 140 + 22 * sin(ph), elbowR: 34, handL: 'open', handR: 'open', lean: 10, lift: 7 * Math.abs(sin(ph)), head: 3 * sin(ph * 2) };
  },
  holdHead: (t) => ({ hL: [-48, -146], hR: [54, -146], bendL: 1, bendR: -1, layL: 'front', layR: 'front', handL: 'open', handR: 'open', wristL: 10, wristR: -10, lean: 5, head: 2.5 * sin(t * 19), hipY: 38 }),
  stoop: { hipY: 33, lean: 27, head: 20, hRp: [64, 26], bendR: 1, handR: 'open', wristR: 20, armL: -58, elbowL: 40, legL: -26, legR: 30, footL: 10, footR: -12 },
  clutch: (t) => ({ hL: [8, -70], hR: [22, -72], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', lean: 7, head: 7 + 1.5 * sin(t * 2.2) }),
  lookFar: { lean: 10, head: -5, tip: 1, hR: [46, -150], bendR: -1, layR: 'front', handR: 'flat', wristR: -60, hL: [-62, -36], bendL: -1, handL: 'fist' },
  leanForward: { lean: 21, head: 9, armL: -48, elbowL: -54, armR: -36, elbowR: -64, layR: 'back', legL: -8, legR: 7 },
  cupEar: { lean: 16, head: -9, hL: [-64, -142], bendL: 1, layL: 'ear', handL: 'cup', wristL: 25, armR: 16, elbowR: -22, legL: -6, legR: 8 },
  fingerUp: (t) => ({ hR: [40, -140], bendR: -1, layR: 'front', handR: 'point', wristR: 172 + 4 * sin(t * 3), armL: -30, elbowL: 58, lean: -2, head: -5 }),
  puff: { lean: -9, head: -7, armL: -72, elbowL: -34, armR: 72, elbowR: 34, handL: 'open', handR: 'open', tip: 0.6, legL: -6, legR: 6 },
  dangle: (t) => ({ hL: [-46, -178], hR: [52, -178], bendL: 1, bendR: -1, stretchL: 1.12, stretchR: 1.12, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', legL: 7 * sin(TAU * t * 1.1), legR: -6 * sin(TAU * t * 1.1 + 0.7), footL: 42, footR: 36, lean: 2.5 * sin(TAU * t * 0.55), head: -3 }),
  sealRaise: { lean: -10, head: -6, armR: 168, elbowR: 10, handR: 'fist', layR: 'back', armL: 58, elbowL: 40, handL: 'open', legL: -16, legR: 18, tip: 0.3, sealAng: 158 },
  sealSlam: { lean: 6, head: 6, armR: 80, elbowR: 2, handR: 'fist', layR: 'front', armL: -110, elbowL: -40, handL: 'open', legL: -18, legR: 14, sealAng: -2 },
  crouch: { hipY: 29, legL: -34, legR: 36, footL: 14, footR: -12, lean: 15, head: 5, armL: -52, elbowL: 32, armR: -26, elbowR: 48 },
  faint: (t) => ({ hipY: 15, tilt: -76, legLay: 'front', legY: 9, legL: 40 + 3 * sin(t * 3), legR: 52 + 3 * sin(t * 3 + 1), footL: -10, footR: -6, armL: -128, elbowL: -22, armR: 118, elbowR: 36, handL: 'open', handR: 'open', head: -12, breath: 0.4 }),
  raiseScepter: { armR: 150, elbowR: 16, handR: 'fist', hL: [-62, -30], bendL: -1, handL: 'fist', lean: -6, head: -8 },
  placeTiara: { armR: 126, elbowR: 32, handR: 'fist', hL: [10, -80], bendL: -1, layL: 'front', handL: 'flat', wristL: -70, tip: 1, lean: 5, head: -8 },
  giveHand: { armR: 74, elbowR: 14, handR: 'flat', wristR: 70, armL: -26, elbowL: 62, lean: 6, head: 5 },
  clap: (t) => {
    const c = Math.pow(Math.abs(sin(Math.PI * t * 2.6)), 0.7);
    return { hL: [12 - 18 * c, -80 - 4 * c], hR: [24 + 18 * c, -82 - 4 * c], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'flat', handR: 'flat', wristL: -60, wristR: 60, lean: 3, head: -3 + 2 * (1 - c) };
  },
  wipeTears: (t) => {
    const a = sin(TAU * t * 2.2), b = sin(TAU * t * 2.2 + Math.PI);
    return { hL: [-14 + 7 * a, -126 + 3 * a], hR: [30 + 7 * b, -126 + 3 * b], bendL: 1, bendR: -1, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', head: 7, lean: 5 };
  },
  biteNails: (t) => {
    const j = sin(TAU * t * 7) * 1.6;
    return { hL: [2, -104 + j], hR: [16, -106 - j], bendL: -1, bendR: 1, layL: 'front', layR: 'front', handL: 'fist', handR: 'fist', head: 5, lean: 5 + j * 0.3 };
  },
  slump: { hipY: 10, tilt: -12, lean: -16, head: 16, armL: -14, elbowL: 2, armR: 16, elbowR: -2, legLay: 'front', legY: 9, legL: 26, legR: 34, footL: 10, footR: 6, handL: 'open', handR: 'open', breath: 0.5 },
  wave: (t) => ({ armR: 158, elbowR: 16 + 24 * sin(TAU * t * 2.4), handR: 'fist', wristR: 10 * sin(TAU * t * 2.4 - 0.6), armL: -18, elbowL: 18, lean: 2, head: -3 }),
  bow: { hipY: 41, lean: 30, head: 24, hL: [12, -46], bendL: -1, layL: 'front', handL: 'flat', wristL: -80, armR: -70, elbowR: -26, legL: -8, legR: 8 },
  peek: {},
  gasp: { lean: -12, head: -9, hL: [-38, -126], hR: [46, -126], bendL: 1, bendR: -1, layL: 'front', layR: 'front', handL: 'open', handR: 'open', wristL: 160, wristR: -160, tip: 0.4 },
  leap: { armL: -162, elbowL: -10, armR: 164, elbowR: 10, handL: 'open', handR: 'open', legL: -44, legR: 18, footL: 40, footR: 24, lean: -8, head: -10 },
};

export const KING_POSES = Object.keys(KING_TABLE);
export const KING_EXPRS = ['joy', 'panic', 'squint', 'confident', 'puffed', 'sick', 'dizzy', 'faint', 'proud', 'tearful', 'waterfall', 'starEyes', 'relieved', 'gasp', 'smile'];
const DEFAULT_HOLD = { wave: 'handkerchief', raiseScepter: 'scepter', sealRaise: 'seal', sealSlam: 'seal', clutch: 'tiara', placeTiara: 'tiara' };

// —— 国王的部件路径（躯干坐标：原点 = 胯，上为 −y） ——
const kingBody = () => smoothPath([[-31, -101], [0, -107], [31, -101], [50, -85], [59, -60], [63, -36], [61, -14], [55, 6], [38, 13], [0, 16], [-38, 13], [-55, 6], [-61, -14], [-63, -36], [-59, -60], [-50, -85]], { closed: true, tension: 0.5 });
const kingCape = () => smoothPath([[-36, -104], [36, -104], [56, -76], [70, -30], [78, 8], [70, 18], [0, 22], [-70, 18], [-78, 8], [-70, -30], [-56, -76]], { closed: true, tension: 0.45 });

function kingHem(F, sil) {
  const p = new Path2D();
  p.moveTo(-58, -6);
  p.quadraticCurveTo(0, 3, 58, -6);
  p.lineTo(56, 6);
  for (let i = 0; i <= 10; i++) { const u = i / 10, x = lerp(56, -56, u); p.quadraticCurveTo(x + 5.6, 15 + 4 * Math.sin(u * Math.PI) + 3, x, 12 + 4 * Math.sin(u * Math.PI)); }
  p.closePath();
  return p;
}

function kingCollar() {
  const p = new Path2D();
  p.moveTo(-58, -94);
  p.bezierCurveTo(-50, -114, -20, -118, 0, -117);
  p.bezierCurveTo(20, -118, 50, -114, 58, -94);
  p.quadraticCurveTo(64, -84, 58, -77);
  for (let i = 0; i <= 8; i++) { const u = i / 8, x = lerp(58, -58, u); const y = -78 + 8 * Math.sin(u * Math.PI); p.quadraticCurveTo(x + 7.2, y + 7, x, y); }
  p.quadraticCurveTo(-64, -84, -58, -94);
  p.closePath();
  return p;
}

function kingBeard(t) {
  // 头坐标（原点 = 头心）。胡子从两颊垂到胸口，底边三片波浪。
  const w = 1 + 0.01 * Math.sin(t * 1.3);
  const p = new Path2D();
  p.moveTo(-44, 6);
  p.bezierCurveTo(-56, 24, -60, 44, -52 * w, 58);
  p.quadraticCurveTo(-48, 70, -36, 66);
  p.quadraticCurveTo(-30, 82, -14, 76);
  p.quadraticCurveTo(-4, 92, 10, 82);
  p.quadraticCurveTo(24, 90, 32, 74);
  p.quadraticCurveTo(48, 74, 50 * w, 58);
  p.bezierCurveTo(60, 42, 58, 22, 48, 6);
  p.quadraticCurveTo(30, 14, 2, 14);
  p.quadraticCurveTo(-26, 14, -44, 6);
  p.closePath();
  return p;
}

function kingMustache() {
  const p = new Path2D();
  for (const s of [-1, 1]) {
    p.moveTo(6, 16);
    p.bezierCurveTo(6 + s * 8, 8, 6 + s * 24, 9, 6 + s * 33, 18);
    p.quadraticCurveTo(6 + s * 40, 23, 6 + s * 41, 16);
    p.quadraticCurveTo(6 + s * 44, 28, 6 + s * 32, 29);
    p.bezierCurveTo(6 + s * 22, 30, 6 + s * 10, 26, 6, 22);
    p.closePath();
  }
  return p;
}

/**
 * 画国王。
 * o: { x, y, s, face, t, pose（名字或 {from,to,k}）, expr（名字或部件对象）, joints（关节角增量，度）, detail（1 / 0 远景简化）,
 *      alpha, silhouette, keepColor[], rod, squash,
 *      crown:{ tilt（度）, slip 0..1（1 盖住眼睛）, pop（向上弹起 px，s=1）, squash 0..1（被线勒扁）, spin（弧度）, off（不画）, glint, wraps },
 *      holding:'tiara'|'seal'|'scepter'|'scroll'|'handkerchief'|null（不传时部分动作自带）, bandage, festive, cheeks 0..1, beardFlip 0..1,
 *      green 0..1, earScale, legsUp 0..1, wrapped 0..1, seated（任何上身动作 + 坐姿下身）, look:[dx,dy], blink, talk 0..1, sweat, stars 0..1（头顶晕星）,
 *      peekCut（peek 裁切线在头心下方的距离，默认 20）, peekHands（peek 时露出扒着下沿的两只手）, tiaraGlint（双手捧小皇冠时的闪光，默认 0.4） }
 * 锚点：站立 = 脚底中心；sit / slump / faint / seated = 屁股落座点（王座座面 y=660 直接传）；peek = 裁切线中点（贴画面下沿）。
 * 返回 { head, mouth, crownTop, crownBase, crownRot（弧度，王冠在调用坐标系里的转角）, crownS（王冠缩放）, handR, handL, ear, neck, belly, eyes, sealBase?, scepterTip?, item?, tiara? }。
 */
export function drawKing(g, o = {}) {
  return kingImpl(g, o, false);
}

/**
 * 只画国王的王冠（与 drawKing 同参数，位置与 drawKing 里完全一致）：配合 crown.off 把王冠放进单独的图层或遮罩上方。
 * 忽略 crown.off；返回 { head, neck, belly, crownTop, crownBase, crownRot, crownS }（peek 时为 { head, crownTop, crownBase, crownRot, crownS }）。
 */
export function drawKingCrown(g, o = {}) {
  return kingImpl(g, o, true);
}

function kingImpl(g, o, onlyCrown) {
  const { x = 0, y = 0, s = 1, face = 1, t = 0, alpha = 1, detail = 1, silhouette = false, rod = false } = o;
  const F = face < 0 ? -1 : 1;
  const pose = o.pose || 'idle';
  if (pose === 'peek') return kingPeek(g, o, onlyCrown);
  const sil = !!silhouette;
  const keep = new Set(o.keepColor || []);
  const C = (c, part) => (sil && !keep.has(part) ? PAL.ink : c);
  const det = sil ? 0 : detail;
  const S = { F, detail: det, sil };
  const exprName = typeof o.expr === 'string' ? o.expr : 'smile';
  const ex = typeof o.expr === 'object' && o.expr ? { ...FACE.smile, ...o.expr } : FACE[exprName] || FACE.smile;
  const cheeks = Math.max(o.cheeks || 0, ex.cheeks || 0);
  const green = Math.max(o.green || 0, ex.green || 0);
  const holding = o.holding === undefined ? DEFAULT_HOLD[poseKey(pose)] || null : o.holding;
  const wrapped = clamp(o.wrapped || 0);
  const J = resolvePose(KING_TABLE, pose, t, o, KB, KR);
  if (o.seated) {
    const k = typeof o.seated === 'number' ? clamp(o.seated) : 1;
    J.hipY = lerp(J.hipY, 13, k); J.legL = lerp(J.legL, 8, k); J.legR = lerp(J.legR, -4, k); J.footL = lerp(J.footL, 6, k); J.footR = lerp(J.footR, -4, k); J.tip = lerp(J.tip, 0, k);
    J.legY = lerp(J.legY, 9, k); if (k > 0.5) J.legLay = 'front';
  }
  if (wrapped > 0) {
    const k = clamp(wrapped * 1.6);
    J.armL = lerp(J.armL, -6, k); J.elbowL = lerp(J.elbowL, 4, k); J.armR = lerp(J.armR, 6, k); J.elbowR = lerp(J.elbowR, -4, k);
    J.legL = lerp(J.legL, 0, k); J.legR = lerp(J.legR, 0, k);
    if (k > 0.5) { J.layL = 'mid'; J.layR = 'mid'; }
  }
  const legsUp = clamp(o.legsUp || 0);
  if (legsUp > 0) { J.legL = lerp(J.legL, 150 + J.tilt, legsUp); J.legR = lerp(J.legR, 166 + J.tilt, legsUp); J.footL = lerp(J.footL, -34, legsUp); J.footR = lerp(J.footR, -28, legsUp); J.legY = lerp(J.legY, 9, legsUp); if (legsUp > 0.3) J.legLay = 'front'; }
  const br = sin((TAU * t) / 2.8) * J.breath;
  const blink = o.blink ?? blinkAt(t, 1);
  const crown = o.crown || {};
  const skinC = mixHex(PAL.skin, PAL.skyDay, 0.3 * green);
  const festive = !!o.festive;
  const fkL0 = armFK(KR.shoulderL, J.armL, J.elbowL, KR.l1 * J.stretchL, KR.l2 * J.stretchL), fkR0 = armFK(KR.shoulderR, J.armR, J.elbowR, KR.l1 * J.stretchR, KR.l2 * J.stretchR);
  const twoHand = holding === 'tiara' && Math.hypot(fkL0.hand[0] - fkR0.hand[0], fkL0.hand[1] - fkR0.hand[1]) < 48;

  const X = new Xf(g);
  const out = {};
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y);
  X.scale(s * F, s);
  if (o.squash) { const q = o.squash; X.scale(1 / Math.sqrt(1 + q), 1 + q); }
  // 木杆（剧场）
  if (rod && !onlyCrown) {
    const rp = new Path2D(); rp.roundRect(-5, -30, 10, 1400, 4);
    piece(g, rp, C(PAL.wood, 'rod'), { sh: 0, F });
    shade(g, rp, PAL.woodDark, 5, 0, -2, 0, 0.5, 0);
  }
  X.translate(J.bodyX, -J.lift - J.tip * 7);
  X.rotate(J.tilt * DEG);
  X.translate(0, -J.hipY);
  // ———— 骨盆坐标（原点 = 胯） ————
  const legs = () => {
    for (const side of [-1, 1]) {
      const a = side < 0 ? J.legL : J.legR, fa = side < 0 ? J.footL : J.footR;
      X.save();
      X.translate(side * KR.legX, J.legY);
      X.rotate(-a * DEG);
      const lp = capsule(KR.legLen, 8.6, 7.6);
      piece(g, lp, C(mixHex(PAL.robeDark, PAL.ink, 0.45), 'legs'), { sh: det ? 1.4 : 0, F });
      X.translate(0, KR.legLen);
      X.rotate((fa - J.tip * 32) * DEG);
      const shoe = new Path2D();
      shoe.moveTo(-9, -6); shoe.bezierCurveTo(-11, 6, -4, 9, 6, 9); shoe.bezierCurveTo(15, 9, 22, 7, 22, 1); shoe.bezierCurveTo(22, -5, 12, -7, 4, -8); shoe.closePath();
      piece(g, shoe, C(PAL.boot, 'legs'), { sh: det ? 1.6 : 0, F, rim: det ? mixHex(PAL.boot, PAL.white, 0.35) : null, rimW: 1.5 });
      if (det) {
        g.fillStyle = mixHex(PAL.boot, PAL.ink, 0.45); g.fill(ell(4, 8, 13, 2.2));
        g.fillStyle = PAL.gold; g.fill(ell(8, -3, 3.4, 3.4));
        g.fillStyle = PAL.goldLight; g.fill(ell(7.4, -3.8, 1.3, 1.3));
      }
      X.restore();
    }
  };
  // ———— 躯干 ————
  X.save();
  X.rotate(J.lean * DEG);
  X.scale(1, 1 + 0.012 * br);
  const arm = (side) => {
    const L = side === 'L';
    const st = L ? J.stretchL : J.stretchR;
    const handShape = L ? J.handL : J.handR;
    const item = (!L && holding && !(holding === 'tiara' && twoHand)) ? holding : null;
    return {
      S: L ? KR.shoulderL : KR.shoulderR, a: L ? J.armL : J.armR, e: L ? J.elbowL : J.elbowR, wrist: L ? J.wristL : J.wristR,
      l1: KR.l1, lf: KR.lf, ho: KR.ho, ru: [12.5, 11.2], rf: [11.2, 13.2], stretch: st,
      cuff: { len: 6, r: 13, color: C(PAL.ermine, 'robe'), spots: true },
      hand: handShape, hr: 10.8,
      cols: { u: C(festive ? PAL.robe : PAL.robe, 'robe'), f: C(PAL.robe, 'robe'), hand: C(PAL.skin, 'skin'), uRim: mixHex(PAL.robe, PAL.white, 0.35), fRim: mixHex(PAL.robe, PAL.white, 0.3), uShade: PAL.robeDark, fShade: PAL.robeDark },
      item: item ? (gg, XX) => heldItem(gg, XX, item, J, S, t, out, C) : null,
    };
  };
  const drawArmLay = (side, lay, part) => {
    if (onlyCrown) return;
    const L = side === 'L';
    const want = L ? J.layL : J.layR;
    if (want !== lay) return;
    const A = arm(side);
    const r = drawArm(g, X, A, S, part);
    if (part !== 'upper') out[L ? 'handL' : 'handR'] = r.hand;
  };
  // 1) 背后的手臂
  drawArmLay('L', 'back', 'all');
  drawArmLay('R', 'back', 'all');
  if (!onlyCrown) {
    // 2) 披风
    const cape = kingCape();
    piece(g, cape, C(PAL.robeDark, 'robe'), { sh: det ? 2 : 0, F });
    if (det) {
      g.save(); g.strokeStyle = PAL.gold; g.lineWidth = festive ? 7 : 3.6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-56, -76); g.quadraticCurveTo(-72, -30, -78, 8); g.quadraticCurveTo(-70, 19, 0, 22); g.quadraticCurveTo(70, 19, 78, 8); g.quadraticCurveTo(72, -30, 56, -76); g.stroke();
      g.restore();
    }
  }
  X.restore();
  // 3) 腿（骨盆坐标，在袍子下面；坐姿 / 翘腿时改在袍子前面画）
  if (!onlyCrown && J.legLay !== 'front') legs();
  X.save();
  X.rotate(J.lean * DEG);
  X.scale(1, 1 + 0.012 * br);
  if (!onlyCrown) {
    // 4) 袍身
    const body = kingBody();
    piece(g, body, C(PAL.robe, 'robe'), { sh: det ? 2.4 : 0, F, rim: det ? mixHex(PAL.robe, PAL.white, 0.32) : null, rimW: 2.4 });
    if (det) {
      shade(g, body, PAL.robeDark, 60 * F, 10, -20 * F, -90, 0.55, 0);
      g.save(); g.clip(body);
      g.fillStyle = rgba(PAL.white, 0.12); g.fill(ell(-24 * F, -62, 20, 30, 0.2 * F));
      g.restore();
      // 前襟貂皮条
      const strip = new Path2D(); strip.roundRect(2, -96, 13, 108, 5);
      g.save(); g.clip(body);
      piece(g, strip, PAL.ermine, { sh: 1.2, F });
      for (let i = 0; i < 6; i++) ermineSpot(g, 8.5 + (i % 2 ? 2 : -2), -82 + i * 17, 2);
      if (festive) { g.fillStyle = PAL.gold; g.fillRect(-1, -96, 3, 110); g.fillRect(15, -96, 3, 110); }
      g.restore();
      // 腰带
      const belt = new Path2D();
      belt.moveTo(-61, -40); belt.quadraticCurveTo(0, -28, 61, -40); belt.lineTo(62, -29); belt.quadraticCurveTo(0, -17, -62, -29); belt.closePath();
      g.save(); g.clip(body);
      piece(g, belt, PAL.gold, { sh: 1.4, F, rim: PAL.goldLight, rimW: 1.6 });
      shade(g, belt, PAL.goldDark, 60 * F, -28, -10 * F, -40, 0.5, 0);
      g.restore();
      const buckle = new Path2D(); buckle.roundRect(-1, -39, 20, 17, 4);
      piece(g, buckle, PAL.gold, { sh: 1.4, F, rim: PAL.goldLight, rimW: 1.6 });
      g.fillStyle = PAL.goldDark; g.fill(ell(9, -30.5, 5.6, 4.6));
      g.fillStyle = PAL.red; g.fill(ell(9, -30.5, 4.2, 3.4));
      g.fillStyle = PAL.white; g.fill(ell(7.6 - 0.8 * F + 0.8, -31.8, 1.2, 1));
    }
    // 下摆貂皮
    const hem = kingHem(F, sil);
    piece(g, hem, C(PAL.ermine, 'robe'), { sh: det ? 1.6 : 0, F, rim: det ? PAL.white : null });
    if (det) {
      shade(g, hem, PAL.stone, 56 * F, 14, -20 * F, -4, 0.45, 0);
      for (let i = 0; i < 7; i++) ermineSpot(g, -45 + i * 15, 4 + (i % 2) * 3 + 2 * Math.sin((i / 6) * Math.PI), 1.9);
      if (festive) { g.save(); g.strokeStyle = PAL.gold; g.lineWidth = 3; g.beginPath(); g.moveTo(-58, -6); g.quadraticCurveTo(0, 3, 58, -6); g.stroke(); g.restore(); }
    }
  }
  if (!onlyCrown && J.legLay === 'front') { X.save(); X.scale(1, 1 / (1 + 0.012 * br)); X.rotate(-J.lean * DEG); legs(); X.restore(); }
  // 5) 中层手臂（领子盖住肩根）；front 手臂先画上臂
  drawArmLay('L', 'mid', 'all');
  drawArmLay('R', 'mid', 'all');
  drawArmLay('L', 'front', 'upper');
  drawArmLay('R', 'front', 'upper');
  drawArmLay('L', 'ear', 'upper');
  if (!onlyCrown) {
    // 6) 貂皮领
    const col = kingCollar();
    piece(g, col, C(PAL.ermine, 'robe'), { sh: det ? 2 : 0, F, rim: det ? PAL.white : null, rimW: 2 });
    if (det) {
      shade(g, col, PAL.stone, 58 * F, -76, -10 * F, -116, 0.5, 0);
      const spots = [[-46, -97], [-32, -88], [-18, -101], [-28, -108], [-48, -85], [32, -88], [46, -97], [20, -100], [28, -108], [48, -85], [-6, -88], [8, -110]];
      for (const [sx, sy] of spots) ermineSpot(g, sx, sy, 2.1);
      if (festive) { g.save(); g.strokeStyle = PAL.gold; g.lineWidth = 2.6; g.stroke(col); g.restore(); }
    }
  }
  out.belly = X.pt(8, -40);
  out.neck = X.pt(0, -108);
  // ———— 头 ————
  X.save();
  X.translate(KR.head[0], KR.head[1] + 22);
  X.rotate(J.head * DEG);
  X.translate(0, -22);
  out.head = X.pt(0, 0);
  const hw = KR.hw;
  const faceX = 7, faceY = 4;
  const crownP = crownPlacement(crown);
  const hairC = C(PAL.beard, 'beard');
  const flip = clamp(o.beardFlip || 0);
  const fsy = Math.cos(flip * Math.PI * 0.94);
  const beardBlock = () => {
    const hingeY = 9;
    X.save();
    X.translate(0, hingeY);
    X.scale(1, fsy);
    X.translate(0, -hingeY);
    const beardC = C(fsy < 0 ? mixHex(PAL.beard, PAL.stone, 0.22) : PAL.beard, 'beard');
    const beard = kingBeard(t + (fsy < 0 ? 0 : 0));
    piece(g, beard, beardC, { sh: det ? 2.2 : 0, F, rim: det ? PAL.white : null, rimW: 2 });
    if (det) {
      shade(g, beard, PAL.stone, 50 * F, 80, -10 * F, 20, 0.5, 0);
      g.save(); g.clip(beard); g.strokeStyle = rgba(PAL.stone2, 0.55); g.lineWidth = 1.8; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[-30, 30, -36, 58], [-14, 38, -16, 66], [22, 38, 26, 64], [36, 28, 42, 52], [4, 46, 6, 72]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2, x1, y1); g.stroke(); }
      g.restore();
      if (Math.abs(fsy) < 0.4) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = rgba(PAL.shadow, 0.35 * (1 - Math.abs(fsy) / 0.4)); g.fill(beard); g.restore(); }
    }
    if (!sil && fsy > 0.2) {
      X.save(); X.translate(faceX, faceY);
      drawMouth(g, { hw, mouthX: 0.025 * hw, mouthY: 0.275 * hw, mouthW: 0.17, talk: o.talk }, cheeks > 0.3 ? { ...ex, mouth: 'blow' } : ex, 0.025 * hw, t, det);
      out.mouth = X.pt(0.025 * hw, 0.275 * hw + 0.05 * hw);
      X.restore();
    }
    if (fsy > 0.2 || fsy < -0.2) {
      const mus = kingMustache();
      piece(g, mus, C(fsy < 0 ? mixHex(PAL.beard, PAL.stone, 0.22) : PAL.beard, 'beard'), { sh: det ? 1.6 : 0, F, rim: det ? PAL.white : null, rimW: 1.6 });
      if (det) shade(g, mus, PAL.stone, 40 * F, 30, 0, 10, 0.4, 0);
    }
    if (fsy > 0.2 && det) { const np = ell(faceX + 4, 13, 7.2, 6.2); piece(g, np, C(mixHex(skinC, PAL.skinShade, 0.55), 'skin'), { sh: 1, F }); g.fillStyle = rgba(PAL.white, 0.5); g.fill(ell(faceX + 2.4 - F * 1, 11, 2, 1.5)); }
    X.restore();
  };
  if (!onlyCrown) {
    // 后脑白发
    const backHair = blob(-36, -6, 22, 26, { seed: 31, amp: 0.06, freq: 4 });
    piece(g, backHair, hairC, { sh: det ? 1.5 : 0, F });
    // 拢耳的手（在耳朵后）
    if (J.layL === 'ear') { X.save(); X.translate(0, 22); X.rotate(-J.head * DEG); X.translate(-KR.head[0], -(KR.head[1] + 22)); drawArmLay('L', 'ear', 'lower'); X.restore(); }
    // 耳
    const es = o.earScale ?? 1;
    X.save(); X.translate(-45, 9); X.scale(es, es);
    const ear = ell(-5, 0, 10.5, 13.5);
    piece(g, ear, C(skinC, 'skin'), { sh: det ? 1.4 : 0, F, rim: det ? rgba(PAL.white, 0.6) : null });
    if (det) { g.save(); g.strokeStyle = PAL.skinShade; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.arc(-6, 0, 5.5, 1.3, 4.6); g.stroke(); g.restore(); }
    out.ear = X.pt(-10, 0);
    X.restore();
    // 头
    const headP = blob(0, 0, KR.hrx, KR.hry, { seed: 13, amp: 0.012 });
    piece(g, headP, C(skinC, 'skin'), { sh: det ? 2 : 0, F, rim: det ? rgba(PAL.white, 0.55) : null, rimW: 2.2 });
    if (det) shade(g, headP, PAL.skinShade, 50 * F, 44, 10 * F, 0, 0.32, 0);
    // 鼓腮
    if (cheeks > 0) {
      for (const sx of [-1, 1]) {
        const cp = ell(faceX + sx * 40, 20, 15 * cheeks, 14 * cheeks);
        piece(g, cp, C(skinC, 'skin'), { sh: det ? 1 : 0, F });
        if (det) { g.fillStyle = rgba(PAL.blush, 0.5 * cheeks); g.fill(ell(faceX + sx * 42, 22, 10 * cheeks, 7 * cheeks)); }
      }
    }
    // 脸（眼、眉、腮红、鼻；嘴另画在胡子上）
    out.eyes = [X.pt(faceX - 17, faceY), X.pt(faceX + 17, faceY)];
    if (!sil) {
      X.save(); X.translate(faceX, faceY);
      drawFace(g, { hw, F, ex: { ...ex, blush: (ex.blush ?? 1) * (cheeks > 0 ? 0.3 : 1), tears: 0 }, blink, look: o.look, t, detail: det, skin: skinC, noMouth: true, noseR: 0, blushY: 0.035 * hw, blushX: 0.31 * hw, sweat: o.sweat });
      X.restore();
    }
    // 胡子（可被吹翻盖住脸：翻过 90° 后改到王冠之后画，盖住脸和王冠前沿）
    if (fsy >= 0) beardBlock();
    if (fsy <= 0.2 && !sil) {
      // 胡子掀起：露出下巴与张大的嘴
      X.save(); X.translate(faceX, faceY);
      drawMouth(g, { hw, mouthX: 0.025 * hw, mouthY: 0.27 * hw, mouthW: 0.17 }, { mouth: 'gasp' }, 0.025 * hw, t, det);
      out.mouth = X.pt(0.025 * hw, 0.32 * hw);
      X.restore();
    }
    if (!out.mouth) out.mouth = X.pt(faceX + 2, faceY + 32);
    // 瀑布泪画在胡子上面
    if (!sil && ex.tears && fsy > 0.2) { X.save(); X.translate(faceX, faceY); drawFace(g, { hw, F, ex, t, detail: det, tearsOnly: true, tearLen: 0.95 * hw }); X.restore(); }
    // 两侧白发卷
    for (const [hx, hy, r, sd] of [[-45, -17, 13, 32], [-35, -29, 10, 35], [47, -13, 11, 34]]) {
      const hp = blob(hx, hy, r, r * 0.95, { seed: sd, amp: 0.08, freq: 3 });
      piece(g, hp, hairC, { sh: det ? 1.2 : 0, F, rim: det ? PAL.white : null, rimW: 1.4 });
      if (det) shade(g, hp, PAL.stone, hx + r * F, hy + r, hx - r * 0.3 * F, hy - r * 0.4, 0.4, 0);
    }
    // 绷带
    if (o.bandage) {
      const bd = new Path2D();
      bd.moveTo(-50, -18); bd.quadraticCurveTo(0, -6, 50, -18); bd.lineTo(48, -31); bd.quadraticCurveTo(0, -19, -49, -31); bd.closePath();
      piece(g, bd, C(PAL.paper, 'bandage'), { sh: det ? 1.4 : 0, F, rim: det ? PAL.white : null });
      if (det) {
        g.save(); g.clip(bd); g.strokeStyle = rgba(PAL.stone2, 0.7); g.lineWidth = 1.2; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(-50, -25); g.quadraticCurveTo(0, -13, 50, -25); g.stroke(); g.restore();
        // 结 + 两条尾巴
        piece(g, ell(-50, -25, 6, 5), PAL.paper, { sh: 1, F });
        g.fillStyle = PAL.paper2;
        g.fill(ribbon([[-52, -25], [-60, -19], [-64, -10]], (u) => 3 - u));
        g.fill(ribbon([[-52, -24], [-63, -27], [-70, -22]], (u) => 3 - u));
        // 一个小十字贴
        g.save(); g.translate(18, -38); g.rotate(0.3);
        const pl = new Path2D(); pl.roundRect(-9, -3.5, 18, 7, 3); pl.roundRect(-3.5, -9, 7, 18, 3);
        g.fillStyle = PAL.sand; g.fill(pl, 'nonzero'); g.restore();
      }
    }
  }
  // 王冠
  if (!crown.off || onlyCrown) {
    X.save();
    X.translate(crownP.x, crownP.y);
    X.rotate(crownP.rot);
    const cr = drawCrown(g, { x: 0, y: 0, s: 1, spin: crown.spin || 0, squash: crown.squash || 0, wraps: crown.wraps, glint: crown.glint || 0, t, F, detail: det, mono: sil && !keep.has('crown') ? PAL.ink : null });
    out.crownTop = X.pt(...cr.top); out.crownBase = X.pt(0, 0); crownFrame(X, out);
    X.restore();
  } else {
    X.save(); X.translate(crownP.x, crownP.y); X.rotate(crownP.rot); out.crownBase = X.pt(0, 0); out.crownTop = X.pt(0, -64.2); crownFrame(X, out); X.restore();
  }
  if (onlyCrown) { X.restore(); X.restore(); X.restore(); return out; }
  if (fsy < 0) beardBlock();
  if (o.stars) dizzyStars(g, 4, crownP.y - 72, 50, t, clamp(o.stars));
  X.restore(); // 头
  // 双手拿的东西（小皇冠）
  if (twoHand) {
    const fkL = armFK(KR.shoulderL, J.armL, J.elbowL, KR.l1 * J.stretchL, KR.l2 * J.stretchL);
    const fkR = armFK(KR.shoulderR, J.armR, J.elbowR, KR.l1 * J.stretchR, KR.l2 * J.stretchR);
    const mx = (fkL.hand[0] + fkR.hand[0]) / 2, my = (fkL.hand[1] + fkR.hand[1]) / 2;
    const r = drawTiara(g, { x: mx, y: my + 6, s: 1.05, rot: -J.lean * DEG * 0.5, t, F, glint: o.tiaraGlint ?? 0.4, detail: det, mono: sil ? PAL.ink : null });
    out.item = X.pt(mx, my);
    out.tiara = r.base;
  }
  // 7) 前层手臂（前臂 + 手）
  drawArmLay('L', 'front', 'lower');
  drawArmLay('R', 'front', 'lower');
  if (!out.handL) out.handL = X.pt(...armFK(KR.shoulderL, J.armL, J.elbowL, KR.l1 * J.stretchL, KR.l2 * J.stretchL).hand);
  if (!out.handR) out.handR = X.pt(...armFK(KR.shoulderR, J.armR, J.elbowR, KR.l1 * J.stretchR, KR.l2 * J.stretchR).hand);
  // 8) 纸卷裹身
  if (wrapped > 0) wrapBands(g, X, wrapped, J, S, t);
  X.restore(); // 躯干
  X.restore();
  return out;
}

/** 王冠在头坐标里的位置：基于 slip / pop / tilt。 */
function crownPlacement(c) {
  const slip = clamp(c.slip || 0), pop = c.pop || 0, tilt = (c.tilt || 0) * DEG;
  return { x: 3 + Math.sin(tilt) * 10, y: -30 + slip * 47 - pop, rot: tilt };
}

/**
 * 记下王冠局部系在调用坐标系里的转角与缩放（X 已平移到王冠锚点并转好），给单独飞的 drawCrown 无缝接手：
 * drawCrown(g, { x: a.crownBase[0], y: a.crownBase[1], rot: a.crownRot, s: a.crownS, spin: face * crown.spin, squash: crown.squash, F: 1 })
 * 与头上那顶逐像素重合。crownRot 已含镜像（face −1 时符号取反）、身体 lean / tilt / head 与王冠 tilt。
 */
function crownFrame(X, out) {
  const m = X.m;
  out.crownRot = Math.atan2(-m[2], m[3]);
  out.crownS = Math.hypot(m[2], m[3]);
}

/** 单手拿的道具（在手坐标里，坐标轴已与躯干对齐，原点 = 手心）。 */
function heldItem(g, X, item, J, S, t, out, C) {
  const F = S.F;
  if (item === 'scepter') {
    const r = drawScepter(g, { x: 0, y: 4, s: 0.95, rot: (J.sceptAng ?? 0) * DEG - J.lean * DEG, t, F, glint: 0.6, glow: 0.3, detail: S.detail, mono: S.sil ? PAL.ink : null });
    out.scepterTip = X.pt(...r.tip);
  } else if (item === 'seal') {
    X.save();
    X.rotate((J.sealAng || 0) * DEG - J.lean * DEG);
    X.translate(0, 120);
    const r = drawSeal(g, { x: 0, y: 0, s: 1, t, F, shadow: false, detail: S.detail });
    out.sealBase = X.pt(0, 0);
    out.item = X.pt(0, -120);
    void r;
    X.restore();
  } else if (item === 'tiara') {
    const r = drawTiara(g, { x: 2, y: 2, s: 1.05, rot: -0.25, t, F, glint: 0.4, detail: S.detail, mono: S.sil ? PAL.ink : null });
    out.tiara = X.pt(...r.base);
    out.item = X.pt(2, -8);
  } else if (item === 'handkerchief') {
    const w = 34, h = 30;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([-u * w * 0.25 + Math.sin(t * 9 + u * 3) * 4 * u, u * h * 1.3]); }
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(-w * 0.2, h * 0.3 + Math.sin(t * 9) * 3, -w * 0.9, h * 0.4 + Math.sin(t * 9 + 1) * 5, -w * 1.1, h * 0.95 + Math.sin(t * 9 + 2) * 6);
    p.bezierCurveTo(-w * 0.6, h * 1.3 + Math.sin(t * 9 + 2.5) * 5, -w * 0.1, h * 1.2 + Math.sin(t * 9 + 3) * 4, w * 0.25, h * 1.25 + Math.sin(t * 9 + 3.5) * 4);
    p.bezierCurveTo(w * 0.2, h * 0.8, w * 0.15, h * 0.3, 0, 0);
    p.closePath();
    piece(g, p, C(PAL.white, 'item'), { sh: S.detail ? 1.4 : 0, F });
    if (S.detail) {
      shade(g, p, PAL.stone, w * 0.3 * F, h * 1.2, -w * F, 0, 0.4, 0);
      g.save(); g.strokeStyle = rgba(PAL.princess, 0.8); g.lineWidth = 1.6; g.setLineDash([2.5, 2.5]); g.stroke(p); g.restore();
    }
    out.item = X.pt(-w * 0.5, h);
  } else if (item === 'scroll') {
    g.save(); g.rotate(-0.25);
    const body = new Path2D(); body.roundRect(-30, -8, 60, 16, 7);
    piece(g, body, C(PAL.paper, 'item'), { sh: S.detail ? 1.4 : 0, F, rim: S.detail ? PAL.white : null });
    if (S.detail) {
      shade(g, body, PAL.kraftDark, 0, 8, 0, -8, 0.4, 0);
      for (const ex2 of [-31, 31]) { g.fillStyle = PAL.redDark; g.fill(ell(ex2, 0, 4, 9)); }
      g.fillStyle = PAL.red; g.fillRect(-3, -9, 6, 18);
    }
    g.restore();
    out.item = X.pt(0, 0);
  }
}

/** 纸卷裹身（E08）：奶油纸带从脚往上缠，红边 + 墨字纹。 */
function wrapBands(g, X, w, J, S, t) {
  const top = lerp(10, -128, w);
  const bandH = 24;
  const n = Math.ceil((10 - top) / (bandH * 0.82));
  for (let i = 0; i < n; i++) {
    const yb = 12 - i * bandH * 0.82;
    if (yb - bandH < top - 4) break;
    const tl = (i % 2 ? 1 : -1) * 4;
    const halfW = 68 - Math.max(0, -yb - 90) * 0.35;
    const p = new Path2D();
    p.moveTo(-halfW, yb - tl); p.quadraticCurveTo(0, yb + 7, halfW, yb + tl);
    p.lineTo(halfW, yb + tl - bandH); p.quadraticCurveTo(0, yb + 7 - bandH, -halfW, yb - tl - bandH); p.closePath();
    piece(g, p, PAL.paper, { sh: S.detail ? 2 : 0, F: S.F, rim: S.detail ? PAL.white : null });
    if (S.detail) {
      shade(g, p, PAL.kraftDark, 0, yb, 0, yb - bandH, 0.35, 0);
      g.save(); g.clip(p);
      g.strokeStyle = PAL.red; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-halfW, yb - tl - 2.5); g.quadraticCurveTo(0, yb + 4.5, halfW, yb + tl - 2.5); g.stroke();
      g.strokeStyle = rgba(PAL.ink, 0.55); g.lineWidth = 2; g.lineCap = 'round';
      for (let k = 0; k < 5; k++) { const x0 = -halfW + 14 + k * (halfW * 2 - 28) / 5 + hash2(i, k) * 6; g.beginPath(); g.moveTo(x0, yb - bandH * 0.55); g.lineTo(x0 + 9 + hash2(i + 9, k) * 6, yb - bandH * 0.55 + (hash2(i, k + 3) - 0.5) * 3); g.stroke(); }
      g.restore();
    }
  }
  // 卷尾（最上面一圈翘起的纸角）
  const ty = top + 2;
  const tail = new Path2D();
  tail.moveTo(46, ty); tail.lineTo(70, ty - 6 + Math.sin(t * 3) * 2); tail.lineTo(76, ty + 16 + Math.sin(t * 3 + 1) * 2); tail.lineTo(54, ty + 20); tail.closePath();
  piece(g, tail, PAL.paper2, { sh: S.detail ? 1.6 : 0, F: S.F });
}

/** peek：只露王冠和眼睛的裁切版。锚点 = 裁切线中点。 */
function kingPeek(g, o, onlyCrown) {
  const { x = 0, y = 0, s = 1, face = 1, t = 0, alpha = 1, detail = 1 } = o;
  const F = face < 0 ? -1 : 1;
  const cut = o.peekCut ?? 20;
  const ex = typeof o.expr === 'object' && o.expr ? { ...FACE.smile, ...o.expr } : FACE[o.expr] || FACE.smile;
  const blink = o.blink ?? blinkAt(t, 1);
  const crown = o.crown || {};
  const X = new Xf(g);
  const out = {};
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.scale(s * F, s);
  if (o.squash) { const q = o.squash; X.scale(1 / Math.sqrt(1 + q), 1 + q); }
  g.save();
  g.beginPath(); g.rect(-400, -600, 800, 600); g.clip();
  X.save();
  X.translate(0, -cut);
  X.rotate(((o.joints && o.joints.head) || 0) * DEG);
  out.head = X.pt(0, 0);
  const S = { F, detail, sil: false };
  if (!onlyCrown) {
    piece(g, blob(-36, -6, 22, 26, { seed: 31, amp: 0.06, freq: 4 }), PAL.beard, { sh: 1.5, F });
    piece(g, ell(-50, 9, 10.5, 13.5), PAL.skin, { sh: 1.4, F });
    const headP = blob(0, 0, KR.hrx, KR.hry, { seed: 13, amp: 0.012 });
    piece(g, headP, PAL.skin, { sh: 2, F, rim: rgba(PAL.white, 0.55), rimW: 2.2 });
    shade(g, headP, PAL.skinShade, 46 * F, 40, -10 * F, -20, 0.45, 0);
    X.save(); X.translate(7, 4);
    drawFace(g, { hw: KR.hw, F, ex: { ...ex, tears: 0 }, blink, look: o.look, t, detail, noMouth: true, noseR: 0, blushX: 0.3 * KR.hw });
    out.eyes = [X.pt(-17, 0), X.pt(17, 0)];
    if (ex.tears) {
      // 瀑布泪：从眼睛下沿向两侧喷出、越过裁切线
      for (const [ex2, sgn] of [[-17, -1], [17, 1]]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([ex2 + sgn * (6 + 34 * u), 7 + 60 * u * u - 6 * u]); }
        const st = ribbon(pts, (u) => 3.2 + 3.5 * u);
        g.fillStyle = rgba(PAL.water, 0.92); g.fill(st);
        g.save(); g.clip(st); g.strokeStyle = rgba(PAL.white, 0.85); g.lineWidth = 1.8; g.setLineDash([7, 9]); g.lineDashOffset = -t * 160;
        g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); g.restore();
      }
    }
    X.restore();
    for (const [hx, hy, r, sd] of [[-45, -17, 13, 32], [-35, -29, 10, 35], [47, -13, 11, 34]]) piece(g, blob(hx, hy, r, r * 0.95, { seed: sd, amp: 0.08 }), PAL.beard, { sh: 1.2, F, rim: PAL.white, rimW: 1.4 });
  }
  const cp = crownPlacement(crown);
  if (!crown.off || onlyCrown) {
    X.save(); X.translate(cp.x, cp.y); X.rotate(cp.rot);
    const cr = drawCrown(g, { spin: crown.spin || 0, squash: crown.squash || 0, glint: crown.glint || 0, t, F, detail });
    out.crownTop = X.pt(...cr.top); out.crownBase = X.pt(0, 0); crownFrame(X, out);
    X.restore();
  } else {
    X.save(); X.translate(cp.x, cp.y); X.rotate(cp.rot); out.crownBase = X.pt(0, 0); out.crownTop = X.pt(0, -64.2); crownFrame(X, out); X.restore();
  }
  X.restore();
  g.restore();
  if (o.peekHands && !onlyCrown) {
    for (const sx of [-1, 1]) {
      X.save(); X.translate(sx * 52, 2); X.rotate(Math.PI);
      drawHand(g, 'mitt', 10.5, PAL.skin, S);
      X.restore();
    }
  }
  X.restore();
  return out;
}
