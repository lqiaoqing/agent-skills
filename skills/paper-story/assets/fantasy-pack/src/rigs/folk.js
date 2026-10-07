// 群众与孩子（folk）：豆形市民 12 变体、卫兵、书记官、传令官、孩子王浩然。
// 约定（docs/assets.md 第 0、6 节；用法见 docs/api/folk.md）：
//   x, y = 脚底中心（调用方已 applyCam）；s = 1 为标准身高；face 1 朝右 / −1 朝左（整体镜像）；
//   t 秒驱动呼吸、眨眼与循环动作；pose = 名字或 {from, to, k}（数值关节线性插值，道具在 k=0.5 切换）；
//   joints = 关节增量（角度单位：度，叠在 pose 之后）、jointsSet = 绝对覆盖；detail 0 = 远景简化版。
//   纯函数：只由参数决定画面；内部 save/restore；不调 ctx.layer / ctx.mask；只用 PAL（深浅用 mixHex / rgba）。
//   画风：角色不描黑边，每个部件是一片剪纸——右下暗色错位分层 + 顶边切口亮边 + 右下 shade；投影方向按屏幕右下。
import { PAL, smooth as smoothPath, ribbon } from '../core/paper.js';
import { clamp, lerp, TAU, hash1, hash2, noise1, fract, rgba, mixHex, squash as squashOf } from '../core/util.js';
import { outBack, outCubic, inOutSine, inQuad, outQuad } from '../core/ease.js';

// ———————————————————— 向量 / 角度 ————————————————————
// 关节角约定（度）：0 = 竖直向下，90 = 水平朝前（朝 face 方向），180 = 竖直向上，−90 = 朝后。
const D = Math.PI / 180;
const dirv = (a) => [Math.sin(a * D), Math.cos(a * D)];
const angOf = (v) => Math.atan2(v[0], v[1]) / D;
const vadd = (p, q) => [p[0] + q[0], p[1] + q[1]];
const vsub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const vmul = (p, k) => [p[0] * k, p[1] * k];
const vlerp = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
/** 正角 = 屏幕上顺时针（y 向下），与 canvas rotate 一致。 */
const vrot = (p, a) => { const c = Math.cos(a * D), s = Math.sin(a * D); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const sstep = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

// 极简仿射（与 canvas 的 a,b,c,d,e,f 同序），用于把局部点换算成调用方坐标（返回锚点）。
const M0 = () => [1, 0, 0, 1, 0, 0];
const mMul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const mT = (m, x, y) => mMul(m, [1, 0, 0, 1, x, y]);
const mS = (m, sx, sy) => mMul(m, [sx, 0, 0, sy, 0, 0]);
const mR = (m, a) => { const c = Math.cos(a), s = Math.sin(a); return mMul(m, [c, s, -s, c, 0, 0]); };
const mP = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** 两段肢体解析 IK：肩 S 到目标 T，返回 [肩角, 肘角]（度）。bend = 1 肘在下 / 后，−1 肘在上 / 前。 */
function ik2(S, T, l1, l2, bend = 1) {
  const v = vsub(T, S);
  const d = clamp(Math.hypot(v[0], v[1]), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const at = angOf(v);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / D;
  const be = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1)) / D;
  return [at - bend * al, bend * (180 - be)];
}

// ———————————————————— 颜色 ————————————————————
const lighten = (c, k = 0.45) => mixHex(c, PAL.white, k);
const darken = (c, k = 0.3) => mixHex(c, PAL.ink, k);
/** 五种粉彩身体色（市民）。 */
export const FOLK_PASTELS = {
  rose: mixHex(PAL.princess, PAL.princessLight, 0.42),
  sky: mixHex(PAL.skyDay, PAL.skyDayLow, 0.28),
  mint: mixHex(PAL.crystal, PAL.leafLight, 0.5),
  lilac: mixHex(PAL.magic, PAL.princessLight, 0.22),
  butter: mixHex(PAL.goldLight, PAL.sand, 0.3),
};
const SKIN = {
  light: PAL.skin,
  tan: mixHex(PAL.skin, PAL.earth, 0.3),
  deep: mixHex(PAL.skin, PAL.wood, 0.58),
};

// ———————————————————— 纸片绘制 ————————————————————
/** 屏幕方向 (sx, sy) 在当前局部坐标里的单位向量（镜像 / 旋转后光向仍按屏幕左上）。 */
function unitLocal(g, sx, sy) {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c || 1e-9;
  const x = (m.d * sx - m.c * sy) / det, y = (-m.b * sx + m.a * sy) / det;
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
/** 顶边切口亮边：沿屏幕“上”方向的内侧细亮边。 */
function rimEdge(g, path, color, w, a = 0.7) {
  const [dx, dy] = unitLocal(g, 0, 1);
  g.save();
  g.clip(path);
  g.translate(dx * w * 0.9, dy * w * 0.9);
  g.globalAlpha *= a;
  g.lineWidth = w * 1.6; g.strokeStyle = color; g.lineJoin = 'round';
  g.stroke(path);
  g.restore();
}
/** 形状内右下暗部（c = [cx, cy, r] 局部单位）。 */
function shadeIn(g, path, color, c, a0 = 0.3) {
  const [ux, uy] = unitLocal(g, 0.6, 0.8);
  const [cx, cy, r] = c;
  g.save();
  g.clip(path);
  const grd = g.createLinearGradient(cx - ux * r * 0.15, cy - uy * r * 0.15, cx + ux * r, cy + uy * r);
  grd.addColorStop(0, rgba(color, 0));
  grd.addColorStop(1, rgba(color, a0));
  g.fillStyle = grd;
  g.fill(path);
  g.restore();
}
/**
 * 一片剪纸：右下暗色错位（层次）→ 填色 → 右下 shade → 顶边亮边。
 * o: { part（剪影模式 keepColor 用）, under(false 关), underA, underK, shade:[cx,cy,r], shadeA, shadeColor, rim(false 关), rimColor, rimW, rimA, flat }
 */
function piece(R, path, color, o = {}) {
  const g = R.g;
  const sil = R.sil && !(o.part && R.keep.has(o.part));
  const fill = sil ? R.silColor : color;
  const fancy = R.detail > 0 && !sil && !o.flat;
  if (fancy && o.under !== false && R.ul > 0) {
    const [ux, uy] = unitLocal(g, 0.5, 0.86);
    const k = (o.underK ?? 1) * R.ul;
    g.save();
    g.translate(ux * k, uy * k);
    g.fillStyle = rgba(PAL.shadow, o.underA ?? 0.2);
    g.fill(path);
    g.restore();
  }
  g.fillStyle = fill;
  g.fill(path);
  if (fancy && o.shade) shadeIn(g, path, o.shadeColor || darken(color, 0.55), o.shade, o.shadeA ?? 0.3);
  if (fancy && o.rim !== false) rimEdge(g, path, o.rimColor || lighten(color, 0.5), o.rimW ?? R.rimW, o.rimA ?? 0.65);
}
const colorOf = (R, c, part) => (R.sil && !(part && R.keep.has(part)) ? R.silColor : c);
function ellPath(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; }
function rectPath(x, y, w, h) { const p = new Path2D(); p.rect(x, y, w, h); return p; }
function fillEll(g, x, y, rx, ry, rot, color) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); g.fill(); }
function strokePts(g, pts, lw, color, o = {}) {
  if (pts.length < 2) return;
  g.save();
  g.lineWidth = lw; g.strokeStyle = color; g.lineCap = o.cap || 'round'; g.lineJoin = 'round';
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.smooth) g.stroke(smoothPath(pts, { closed: false, tension: 0.5 }));
  else { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  g.restore();
}
/** 在 clip 内描线（滚边、条纹不溢出形状）。 */
function strokeIn(g, clip, pts, lw, color, o = {}) { g.save(); g.clip(clip); strokePts(g, pts, lw, color, { smooth: true, ...o }); g.restore(); }
/** 手剪：点位稳定抖动后平滑闭合（种子固定，逐帧不闪）。 */
function jitPath(points, seed, amp, closed = true, tension = 0.5) {
  const pts = points.map(([x, y], i) => [x + (hash2(seed, i) - 0.5) * amp, y + (hash2(seed + 9, i) - 0.5) * amp]);
  return smoothPath(pts, { closed, tension });
}
const U = (pts, k) => pts.map(([x, y]) => [x * k, y * k]);

/** 胶囊（两端不同半径），所有胶囊同向绕行 → 同一 Path2D 里非零填充自动并集。 */
function capsule(p, a, ra, b, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  if (d < 1e-3) { const r = Math.max(ra, rb); p.moveTo(a[0] + r, a[1]); p.arc(a[0], a[1], r, 0, TAU); return p; }
  const ang = Math.atan2(dy, dx), th = Math.acos(clamp((ra - rb) / d, -1, 1));
  p.moveTo(a[0] + ra * Math.cos(ang + th), a[1] + ra * Math.sin(ang + th));
  p.lineTo(b[0] + rb * Math.cos(ang + th), b[1] + rb * Math.sin(ang + th));
  p.arc(b[0], b[1], rb, ang + th, ang - th, true);
  p.lineTo(a[0] + ra * Math.cos(ang - th), a[1] + ra * Math.sin(ang - th));
  p.arc(a[0], a[1], ra, ang - th, ang + th, true);
  p.closePath();
  return p;
}
function limbPath(pts, rs) { const p = new Path2D(); for (let i = 0; i < pts.length - 1; i++) capsule(p, pts[i], rs[i], pts[i + 1], rs[i + 1]); return p; }
/**
 * 软管肢体：沿 Catmull-Rom 中线按半径外扩成“一条”闭合轮廓（无内部接缝，切口亮边不会在关节处出圈）。
 * per = 每段采样数；内侧急弯处防打结（回退的点贴住上一个点）。
 */
function hosePath(pts, rs, per = 6) {
  const n = pts.length;
  if (n === 2) return limbPath(pts, rs);
  const get = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const C = [], RR = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < per; j++) {
      const u = j / per, u2 = u * u, u3 = u2 * u;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
      C.push([f(0), f(1)]);
      RR.push(lerp(rs[i], rs[i + 1], u));
    }
  }
  C.push(pts[n - 1]); RR.push(rs[n - 1]);
  const L = [], Rt = [], TA = [];
  for (let k = 0; k < C.length; k++) {
    const a = C[Math.max(0, k - 1)], b = C[Math.min(C.length - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    TA.push(Math.atan2(ty, tx));
    let pl = [C[k][0] - ty * RR[k], C[k][1] + tx * RR[k]], pr = [C[k][0] + ty * RR[k], C[k][1] - tx * RR[k]];
    if (k > 0) {
      if ((pl[0] - L[k - 1][0]) * tx + (pl[1] - L[k - 1][1]) * ty < 0) pl = L[k - 1];
      if ((pr[0] - Rt[k - 1][0]) * tx + (pr[1] - Rt[k - 1][1]) * ty < 0) pr = Rt[k - 1];
    }
    L.push(pl); Rt.push(pr);
  }
  const m = C.length - 1;
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (let k = 1; k <= m; k++) p.lineTo(L[k][0], L[k][1]);
  p.arc(C[m][0], C[m][1], RR[m], TA[m] + Math.PI / 2, TA[m] - Math.PI / 2, true);
  for (let k = m; k >= 0; k--) p.lineTo(Rt[k][0], Rt[k][1]);
  p.arc(C[0][0], C[0][1], RR[0], TA[0] - Math.PI / 2, TA[0] + Math.PI / 2, true);
  p.closePath();
  return p;
}

// ———————————————————— 身体与头的形状 ————————————————————
/** 豆形身子（身体空间：髋心为原点，向上为负）。belly 前凸，flare 下摆外扩。 */
function beanPath(bw, top, below, o = {}) {
  const { flare = 1.04, belly = 0, seed = 1 } = o;
  const fm = lerp(1, flare, 0.55);
  const P = [
    [0.08 * bw, -top], [0.48 * bw, -top * 0.975], [0.76 * bw, -top * 0.88], [(0.93 + belly * 0.04) * bw, -top * 0.64],
    [(1.02 + belly * 0.15) * bw, -top * 0.32], [(1.02 + belly * 0.1) * bw * fm, -top * 0.02 + below * 0.1], [0.9 * bw * flare, below * 0.76],
    [0.56 * bw * flare, below], [-0.56 * bw * flare, below], [-0.9 * bw * flare, below * 0.76], [-1.0 * bw * fm, -top * 0.02 + below * 0.1],
    [-1.0 * bw, -top * 0.32], [-0.92 * bw, -top * 0.64], [-0.75 * bw, -top * 0.88], [-0.46 * bw, -top * 0.975], [-0.08 * bw, -top],
  ];
  return jitPath(P, seed, Math.min(bw, top) * 0.035, true, 0.5);
}
/** 头（头局部：头心为原点）。jaw 为下巴下掉的像素。 */
function headPath(hr, jaw, seed, wide = 1.03) {
  const n = 30, P = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + 0.012 * Math.sin(3 * a + seed) + 0.007 * Math.sin(5 * a + seed * 1.7);
    let x = Math.cos(a) * hr * wide * r, y = Math.sin(a) * hr * 0.97 * r;
    if (y > 0 && jaw > 0) { const k = y / (hr * 0.97); y += jaw * Math.pow(k, 1.4); x *= 1 - 0.1 * Math.min(1, jaw / hr) * k; }
    P.push([x, y]);
  }
  return smoothPath(P, { closed: true, tension: 0.5 });
}

// ———————————————————— 表情 ————————————————————
/** 表情表：eyes / mouth / brows + 腮红倍率 blush、默认汗 sweat、鼓腮 cheeks、瞳孔 pupil。所有木偶共用。 */
export const FOLK_EXPRS = {
  normal: { eyes: 'dot', mouth: 'smile', brows: 'normal' },
  smile: { eyes: 'happy', mouth: 'smile', brows: 'normal' },
  happy: { eyes: 'happy', mouth: 'grin', brows: 'up', blush: 1.3 },
  laugh: { eyes: 'squeeze', mouth: 'laugh', brows: 'up', blush: 1.5 },
  surprise: { eyes: 'wide', mouth: 'o', brows: 'up' },
  shock: { eyes: 'wide', mouth: 'O', brows: 'high', pupil: 0.75 },
  scared: { eyes: 'wide', mouth: 'wavy', brows: 'worried', sweat: 0.6 },
  worried: { eyes: 'dot', mouth: 'wavy', brows: 'worried' },
  curious: { eyes: 'squint', mouth: 'o', brows: 'quirk' },
  hope: { eyes: 'dot', mouth: 'smile', brows: 'up' },
  determined: { eyes: 'dot', mouth: 'open', brows: 'angry' },
  stern: { eyes: 'dot', mouth: 'flat', brows: 'angry' },
  grumpy: { eyes: 'squint', mouth: 'frown', brows: 'angry' },
  blown: { eyes: 'squeeze', mouth: 'open', brows: 'worried' },
  dizzy: { eyes: 'spiral', mouth: 'wavy', brows: 'none' },
  faint: { eyes: 'x', mouth: 'o', brows: 'none' },
  relieved: { eyes: 'half', mouth: 'o', brows: 'worried', blush: 0.8 },
  whistle: { eyes: 'dot', mouth: 'whistle', brows: 'up' },
  jawdrop: { eyes: 'wide', mouth: 'O', brows: 'high', pupil: 0.6 },
  strain: { eyes: 'squeeze', mouth: 'wavy', brows: 'worried', sweat: 0.7 },
  pant: { eyes: 'half', mouth: 'pant', brows: 'worried', sweat: 0.8 },
  puff: { eyes: 'closed', mouth: 'puff', brows: 'up', cheeks: 1 },
  focused: { eyes: 'dot', mouth: 'tongue', brows: 'angry' },
  proud: { eyes: 'closed', mouth: 'smile', brows: 'up' },
  calm: { eyes: 'closed', mouth: 'smile', brows: 'normal' },
  pout: { eyes: 'dot', mouth: 'pout', brows: 'angry', cheeks: 0.45 },
  giggle: { eyes: 'happy', mouth: 'grin', brows: 'up', blush: 1.6 },
  chew: { eyes: 'happy', mouth: 'chew', brows: 'up', blush: 1.3 },
  sleepy: { eyes: 'closed', mouth: 'o', brows: 'normal' },
};
const exprOf = (name) => (typeof name === 'object' && name ? { ...FOLK_EXPRS.normal, ...name } : FOLK_EXPRS[name] || FOLK_EXPRS.normal);

const blinkAt = (t, seed) => { const per = 2.7 + hash1(seed * 3.1 + 0.5) * 1.9; return fract(t / per + hash1(seed * 7.7 + 0.3)) < 0.05; };

/** 五官（头局部，朝 +x）：统一画法——ink 竖椭圆眼 + 左上白高光、blush 腮红、ink 弧线嘴、ink 短弧眉、skinShade 鼻点。 */
function drawFace(R, F, hr, E) {
  if (R.sil) return;
  const g = R.g, det = R.detail;
  const J = F.J, sp = F.sp;
  const fx = F.fx, hs = F.hs;
  const look = J.look || 0, lookY = J.lookY || 0;
  const lx = look * 0.07 * hr, ly = lookY * 0.06 * hr;
  const ink = PAL.ink, lw = 0.05 * hr;
  const ey = 0.07 * hr;
  const eyes = F.blink && (E.eyes === 'dot' || E.eyes === 'wide' || E.eyes === 'squint') ? 'closed' : E.eyes;
  const EB = [fx - 0.3 * hr, ey], EF = [fx + 0.28 * hr, ey];
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  // —— 腮红 ——
  const bk = 0.45 * (E.blush ?? 1) * (sp.blushK ?? 1);
  if (bk > 0) {
    const ca = Math.min(0.9, bk);
    fillEll(g, fx - 0.5 * hr, 0.33 * hr, 0.15 * hr, 0.085 * hr, 0, rgba(PAL.blush, ca));
    fillEll(g, fx + 0.47 * hr, 0.33 * hr, 0.13 * hr, 0.08 * hr, 0, rgba(PAL.blush, ca));
  }
  if (det <= 0) {
    // 远景简化：豆豆眼 + 必要时一张小嘴
    for (const [e, k] of [[EB, 1], [EF, 0.9]]) {
      const x = e[0] + lx, y = e[1] + ly;
      if (eyes === 'happy' || eyes === 'closed' || eyes === 'squeeze' || eyes === 'half') strokePts(g, [[x - 0.09 * hr, y], [x + 0.09 * hr, y]], lw * 1.4, ink);
      else if (eyes === 'x') strokePts(g, [[x - 0.08 * hr, y - 0.08 * hr], [x + 0.08 * hr, y + 0.08 * hr]], lw * 1.3, ink);
      else fillEll(g, x, y, (eyes === 'wide' ? 0.12 : 0.1) * hr * k, (eyes === 'wide' ? 0.14 : 0.13) * hr, 0, eyes === 'wide' ? PAL.white : ink);
      if (eyes === 'wide') fillEll(g, x, y, 0.06 * hr, 0.07 * hr, 0, ink);
    }
    const open = ['O', 'o', 'open', 'grin', 'laugh', 'pant'].includes(E.mouth);
    if (open) fillEll(g, fx + 0.05 * hr, 0.42 * hr + (J.jaw || 0) * sp.jawPx * 0.35, 0.09 * hr, (0.07 + (E.mouth === 'O' ? 0.05 : 0)) * hr + (J.jaw || 0) * sp.jawPx * 0.3, 0, PAL.redDeep);
    g.restore();
    return;
  }
  // —— 眼 ——
  const eyeOne = (c, k, side) => {
    const x = c[0] + lx, y = c[1] + ly;
    const rx = 0.09 * hr * k, ry = 0.13 * hr;
    switch (eyes) {
      case 'wide': {
        fillEll(g, x, y, rx * 1.55, ry * 1.22, 0, PAL.white);
        const pr = rx * 0.78 * (E.pupil ?? 1);
        fillEll(g, x + lx * 0.5, y + ly * 0.5 + ry * 0.06, pr, pr * 1.15, 0, ink);
        fillEll(g, x + lx * 0.5 - pr * 0.35 * hs, y + ly * 0.5 - pr * 0.3, pr * 0.32, pr * 0.32, 0, PAL.white);
        break;
      }
      case 'happy': g.lineWidth = lw * 1.25; g.strokeStyle = ink; g.beginPath(); g.arc(x, y + ry * 0.45, rx * 1.25, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); break;
      case 'closed': g.lineWidth = lw * 1.2; g.strokeStyle = ink; g.beginPath(); g.arc(x, y - ry * 0.25, rx * 1.2, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); break;
      case 'squeeze': {
        const s2 = side; // −1 后眼画 >，+1 前眼画 <
        strokePts(g, [[x - rx * 1.1 * s2, y - ry * 0.55], [x + rx * 1.0 * s2, y], [x - rx * 1.1 * s2, y + ry * 0.55]], lw * 1.25, ink);
        break;
      }
      case 'squint':
        fillEll(g, x, y + ry * 0.18, rx * 1.08, ry * 0.5, 0, ink);
        fillEll(g, x - rx * 0.3 * hs, y + ry * 0.05, rx * 0.3, rx * 0.25, 0, PAL.white);
        break;
      case 'half': {
        fillEll(g, x, y, rx, ry, 0, ink);
        fillEll(g, x - rx * 0.35 * hs, y + ry * 0.1, rx * 0.36, rx * 0.36, 0, PAL.white);
        g.save(); g.beginPath(); g.rect(x - rx * 2, y - ry * 2, rx * 4, ry * 1.95); g.clip();
        fillEll(g, x, y, rx * 1.25, ry * 1.15, 0, F.skin);
        g.restore();
        strokePts(g, [[x - rx * 1.25, y - ry * 0.02], [x + rx * 1.25, y - ry * 0.02]], lw, ink);
        break;
      }
      case 'x':
        strokePts(g, [[x - rx, y - rx], [x + rx, y + rx]], lw * 1.2, ink);
        strokePts(g, [[x + rx, y - rx], [x - rx, y + rx]], lw * 1.2, ink);
        break;
      case 'spiral': {
        const pts = [];
        for (let i = 0; i <= 22; i++) { const a = i * 0.62 + (F.t || 0) * 6 * side; const r = rx * 1.3 * (i / 22); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
        strokePts(g, pts, lw * 0.9, ink);
        break;
      }
      default:
        fillEll(g, x, y, rx, ry, 0, ink);
        fillEll(g, x - rx * 0.36 * hs, y - ry * 0.4, rx * 0.42, rx * 0.42, 0, PAL.white);
    }
    if (sp.lashes && (eyes === 'dot' || eyes === 'wide')) {
      const ox = (side < 0 ? -1 : 1) * rx * (eyes === 'wide' ? 1.5 : 1.0);
      strokePts(g, [[x + ox * 0.75, y - ry * 0.75], [x + ox * 1.45, y - ry * 1.05]], lw * 0.85, ink);
    }
  };
  eyeOne(EB, 1, -1);
  eyeOne(EF, 0.88, 1);
  // —— 眉 ——
  if (E.brows !== 'none') {
    const by = ey - 0.27 * hr - (E.brows === 'up' ? 0.05 * hr : E.brows === 'high' ? 0.11 * hr : 0) - (eyes === 'wide' ? 0.04 * hr : 0);
    const bl = 0.085 * hr;
    const one = (e, side) => {
      let rot = 0, dy = 0;
      if (E.brows === 'worried') rot = -0.38 * side;
      else if (E.brows === 'angry') { rot = 0.38 * side; dy = 0.03 * hr; }
      else if (E.brows === 'quirk' && side > 0) { rot = -0.25; dy = -0.06 * hr; }
      const x = e[0] + lx * 0.6, y = by + dy + ly * 0.4;
      const c = Math.cos(rot), s = Math.sin(rot);
      const pts = [[-bl, 0.012 * hr], [0, -0.022 * hr], [bl, 0.012 * hr]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
      strokePts(g, pts, lw * (sp.browW ?? 1.1), sp.browC || ink, { smooth: true });
    };
    one(EB, -1);
    one(EF, 1);
  }
  // —— 鼻 ——
  if (sp.nose !== false) fillEll(g, fx + 0.1 * hr, 0.24 * hr, 0.045 * hr, 0.035 * hr, 0, PAL.skinShade);
  // —— 嘴 ——
  const jaw = (J.jaw || 0) * sp.jawPx;
  const mx = fx + 0.05 * hr + lx * 0.25, my = 0.42 * hr;
  const mouthFill = (path) => {
    g.fillStyle = PAL.redDeep; g.fill(path);
    g.save(); g.clip(path);
    const b = path.__b || [mx, my + 0.1 * hr, 0.08 * hr];
    fillEll(g, b[0], b[1], b[2], b[2] * 0.7, 0, PAL.heart);
    g.restore();
  };
  const Dm = (w, d, up = 0.03) => {
    const p = new Path2D();
    p.moveTo(mx - w, my - up * hr);
    p.quadraticCurveTo(mx, my - (up + 0.04) * hr, mx + w, my - up * hr);
    p.bezierCurveTo(mx + w * 0.85, my + d * 0.9, mx - w * 0.85, my + d * 0.9, mx - w, my - up * hr);
    p.closePath();
    p.__b = [mx, my + d * 0.62, w * 0.55];
    return p;
  };
  switch (E.mouth) {
    case 'grin': mouthFill(Dm(0.15 * hr, 0.17 * hr)); break;
    case 'laugh': mouthFill(Dm(0.2 * hr, 0.26 * hr, 0.05)); break;
    case 'open': { const p = ellPath(mx, my + 0.03 * hr, 0.1 * hr, 0.085 * hr); p.__b = [mx, my + 0.1 * hr, 0.07 * hr]; mouthFill(p); break; }
    case 'o': { const p = ellPath(mx, my + 0.02 * hr, 0.055 * hr, 0.07 * hr); p.__b = [mx, my + 0.08 * hr, 0.04 * hr]; mouthFill(p); break; }
    case 'O': { const ry = 0.1 * hr + jaw * 0.42; const p = ellPath(mx, my + 0.02 * hr + jaw * 0.36, 0.08 * hr + jaw * 0.04, ry); p.__b = [mx, my + 0.02 * hr + jaw * 0.36 + ry * 0.7, 0.07 * hr + jaw * 0.04]; mouthFill(p); break; }
    case 'pant': {
      mouthFill(Dm(0.13 * hr, 0.16 * hr));
      const tw = Math.sin((F.t || 0) * 18) * 0.02 * hr;
      const tp = new Path2D(); tp.ellipse(mx + 0.02 * hr, my + 0.17 * hr + tw, 0.07 * hr, 0.1 * hr, 0, 0, TAU);
      g.fillStyle = PAL.heart; g.fill(tp);
      strokePts(g, [[mx + 0.02 * hr, my + 0.12 * hr + tw], [mx + 0.02 * hr, my + 0.21 * hr + tw]], lw * 0.6, darken(PAL.heart, 0.3));
      break;
    }
    case 'wavy': {
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push([mx - 0.13 * hr + (i / 8) * 0.26 * hr, my + 0.02 * hr + Math.sin(i * Math.PI * 0.5) * 0.025 * hr]);
      strokePts(g, pts, lw, ink, { smooth: true });
      break;
    }
    case 'flat': strokePts(g, [[mx - 0.08 * hr, my + 0.02 * hr], [mx + 0.08 * hr, my + 0.02 * hr]], lw, ink); break;
    case 'frown': g.lineWidth = lw; g.strokeStyle = ink; g.beginPath(); g.arc(mx, my + 0.13 * hr, 0.1 * hr, Math.PI * 1.22, Math.PI * 1.78); g.stroke(); break;
    case 'pout': g.lineWidth = lw; g.strokeStyle = ink; g.beginPath(); g.arc(mx, my + 0.09 * hr, 0.06 * hr, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); break;
    case 'whistle': {
      fillEll(g, mx + 0.02 * hr, my + 0.02 * hr, 0.045 * hr, 0.05 * hr, 0, PAL.redDeep);
      g.lineWidth = lw * 0.9; g.strokeStyle = ink; g.beginPath(); g.ellipse(mx + 0.02 * hr, my + 0.02 * hr, 0.055 * hr, 0.06 * hr, 0, 0, TAU); g.stroke();
      break;
    }
    case 'puff': strokePts(g, [[mx - 0.04 * hr, my + 0.02 * hr], [mx + 0.04 * hr, my + 0.02 * hr]], lw * 1.1, ink); break;
    case 'tongue': {
      g.lineWidth = lw; g.strokeStyle = ink; g.beginPath(); g.arc(mx, my - 0.06 * hr, 0.11 * hr, Math.PI * 0.22, Math.PI * 0.8); g.stroke();
      fillEll(g, mx + 0.08 * hr, my + 0.05 * hr, 0.035 * hr, 0.045 * hr, 0.4, PAL.heart);
      break;
    }
    case 'chew': {
      const c = Math.sin((F.t || 0) * 13) > 0;
      if (c) { const p = ellPath(mx, my + 0.03 * hr, 0.07 * hr, 0.075 * hr); p.__b = [mx, my + 0.08 * hr, 0.05 * hr]; mouthFill(p); }
      else { g.lineWidth = lw; g.strokeStyle = ink; g.beginPath(); g.arc(mx, my - 0.03 * hr, 0.08 * hr, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
      break;
    }
    case 'none': break;
    default: g.lineWidth = lw; g.strokeStyle = ink; g.beginPath(); g.arc(mx, my - 0.07 * hr, 0.12 * hr, Math.PI * 0.22, Math.PI * 0.78); g.stroke();
  }
  // —— 胡子 ——
  if (sp.stache) drawStache(R, sp.stache, mx, my, hr, sp.colors.hair);
  // —— 眼镜 ——
  if (sp.glasses) {
    const rim = PAL.goldDark;
    for (const e of [EB, EF]) {
      fillEll(g, e[0], e[1], 0.17 * hr, 0.17 * hr, 0, rgba(PAL.skyDayLow, 0.28));
      g.lineWidth = lw * 0.95; g.strokeStyle = rim; g.beginPath(); g.ellipse(e[0], e[1], 0.17 * hr, 0.17 * hr, 0, 0, TAU); g.stroke();
      g.lineWidth = lw * 0.7; g.strokeStyle = rgba(PAL.white, 0.9); g.beginPath(); g.arc(e[0], e[1], 0.12 * hr, Math.PI * 1.08, Math.PI * 1.38); g.stroke();
    }
    strokePts(g, [[EB[0] + 0.17 * hr, EB[1] - 0.02 * hr], [EF[0] - 0.17 * hr, EF[1] - 0.02 * hr]], lw * 0.9, rim);
    strokePts(g, [[EB[0] - 0.17 * hr, EB[1] - 0.03 * hr], [-0.62 * hr, ey - 0.06 * hr]], lw * 0.9, rim);
  }
  g.restore();
}

function drawStache(R, kind, mx, my, hr, color) {
  const g = R.g;
  const y = my - 0.09 * hr;
  let pts;
  if (kind === 'curl') pts = [[-0.24, 0.0], [-0.17, -0.07], [-0.06, -0.06], [0.0, -0.02], [0.06, -0.06], [0.17, -0.07], [0.25, 0.0], [0.2, 0.04], [0.12, 0.0], [0.0, 0.03], [-0.12, 0.0], [-0.2, 0.04]];
  else if (kind === 'walrus') pts = [[-0.3, 0.12], [-0.25, -0.06], [-0.1, -0.1], [0.0, -0.06], [0.1, -0.1], [0.26, -0.06], [0.31, 0.12], [0.18, 0.08], [0.0, 0.06], [-0.18, 0.08]];
  else pts = [[-0.2, 0.02], [-0.16, -0.05], [0.0, -0.06], [0.17, -0.05], [0.21, 0.02], [0.0, 0.03]];
  const p = smoothPath(pts.map(([x, yy]) => [mx + x * hr, y + yy * hr]), { closed: true, tension: 0.45 });
  piece(R, p, color, { part: 'hair', underK: 0.6, rimW: 0.9 });
}

// ———————————————————— 头发 ————————————————————
// 头局部，单位 hr；外缘弧 a0→a1（度，后下 → 头顶 → 前上），然后刘海 fringe（前 → 后），后颈 nape（回到起点）。
const HAIR = {
  tuft: { puff: 1.07, a0: 152, a1: 336, fringe: [[0.86, -0.4], [0.66, -0.26], [0.5, -0.4], [0.3, -0.24], [0.1, -0.4], [-0.12, -0.28], [-0.34, -0.4]], nape: [[-0.5, -0.18], [-0.58, 0.2], [-0.76, 0.46]], ear: true, sprout: true },
  short: { puff: 1.05, a0: 155, a1: 334, fringe: [[0.88, -0.4], [0.6, -0.34], [0.3, -0.45], [-0.05, -0.41], [-0.36, -0.35]], nape: [[-0.5, -0.14], [-0.56, 0.2], [-0.76, 0.42]], ear: true },
  curls: { puff: 1.12, a0: 138, a1: 342, edge: 'curl', amp: 0.08, m: 10, fringe: [[0.9, -0.36], [0.72, -0.24], [0.55, -0.38], [0.36, -0.23], [0.15, -0.37], [-0.06, -0.24], [-0.28, -0.36]], nape: [[-0.46, -0.08], [-0.56, 0.36], [-0.6, 0.64], [-0.84, 0.62]], ear: false },
  bun: { puff: 1.04, a0: 150, a1: 335, fringe: [[0.88, -0.42], [0.55, -0.52], [0.22, -0.62], [0.04, -0.52], [-0.2, -0.43], [-0.45, -0.25]], nape: [[-0.55, 0.1], [-0.74, 0.42]], ear: true, bun: true },
  bob: { puff: 1.1, a0: 112, a1: 340, fringe: [[0.9, -0.3], [0.62, -0.22], [0.32, -0.25], [0.02, -0.22], [-0.3, -0.25], [-0.38, 0.02], [-0.36, 0.52]], nape: [[-0.42, 0.68], [-0.66, 0.74]], ear: false },
  pigtails: { puff: 1.05, a0: 152, a1: 336, fringe: [[0.88, -0.36], [0.66, -0.24], [0.44, -0.36], [0.2, -0.23], [-0.04, -0.36], [-0.3, -0.3]], nape: [[-0.48, -0.1], [-0.56, 0.22], [-0.76, 0.44]], ear: true, pigtails: true },
  spiky: { puff: 1.06, a0: 150, a1: 338, edge: 'spike', amp: 0.17, m: 7, fringe: [[0.9, -0.36], [0.72, -0.2], [0.56, -0.36], [0.38, -0.19], [0.2, -0.36], [0.0, -0.21], [-0.22, -0.36]], nape: [[-0.48, -0.12], [-0.56, 0.22], [-0.76, 0.44]], ear: true },
  afro: { noShine: true, puff: 1.36, cx: -0.12, cy: -0.3, a0: 122, a1: 352, edge: 'curl', amp: 0.1, m: 13, fringe: [[0.86, -0.36], [0.62, -0.27], [0.4, -0.38], [0.16, -0.26], [-0.08, -0.38], [-0.36, -0.26]], nape: [[-0.5, 0.0], [-0.58, 0.42], [-0.96, 0.52]], ear: true },
  braids: { puff: 1.05, a0: 150, a1: 336, fringe: [[0.88, -0.42], [0.5, -0.5], [0.2, -0.62], [0.02, -0.53], [-0.25, -0.45], [-0.45, -0.28]], nape: [[-0.55, 0.08], [-0.74, 0.4]], ear: true, braids: true },
  bald: { none: true, ear: true, tufts: true },
  messy: { puff: 1.09, a0: 150, a1: 339, edge: 'spike', amp: 0.1, m: 10, fringe: [[0.9, -0.33], [0.72, -0.18], [0.58, -0.34], [0.4, -0.17], [0.22, -0.34], [0.02, -0.19], [-0.18, -0.34], [-0.38, -0.25]], nape: [[-0.52, 0.04], [-0.6, 0.3], [-0.8, 0.44]], ear: true },
};

function hairCapPath(hr, st, seed) {
  const P = [];
  const cx = st.cx || 0, cy = st.cy || 0;
  const n = st.edge ? Math.max(24, (st.m || 8) * 4) : 20;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = lerp(st.a0, st.a1, u) * D;
    let r = st.puff;
    if (st.edge === 'curl') r += (st.amp || 0.08) * Math.abs(Math.sin(u * Math.PI * (st.m || 8)));
    else if (st.edge === 'spike') r += (st.amp || 0.12) * (i % 4 === 2 ? 1 : i % 4 === 0 ? -0.15 : 0.35) * (0.7 + 0.3 * hash2(seed, i));
    else r += 0.025 * Math.sin(i * 1.9 + seed);
    P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (const q of st.fringe) P.push(q);
  for (const q of st.nape) P.push(q);
  return jitPath(U(P, hr), seed, hr * 0.02, true, st.edge === 'spike' ? 0.3 : 0.5);
}

/** 头发后层（头皮之前）：辫子、马尾、发髻底、秃顶的远侧鬓毛。 */
function drawHairBack(R, F, hr, style, color) {
  const st = HAIR[style];
  if (!st) return;
  const g = R.g, t = F.t || 0;
  const sw = Math.sin(t * 2.1 + F.sp.seed) * 0.03 * hr;
  if (st.pigtails) {
    for (const side of [-1, 1]) {
      const sw2 = sw * (side < 0 ? 1 : 0.8);
      const pts = side < 0
        ? U([[-0.78, -0.46], [-1.12, -0.36], [-1.36, -0.08], [-1.44, 0.3], [-1.38, 0.56]], hr)
        : U([[0.64, -0.66], [0.98, -0.6], [1.2, -0.36], [1.3, 0.0], [1.26, 0.24]], hr);
      const pp = ribbon(pts.map((q, i) => [q[0] + sw2 * i * 0.6, q[1]]), [0.1 * hr, 0.2 * hr, 0.23 * hr, 0.17 * hr, 0.04 * hr]);
      piece(R, pp, side < 0 ? color : darken(color, 0.12), { part: 'hair', rimW: 1.1, shade: [pts[2][0], pts[2][1], 0.4 * hr] });
      if (R.detail && !R.sil) strokeIn(g, pp, [pts[1], pts[2], pts[3]].map((q) => [q[0] + 0.05 * hr * side, q[1]]), 0.04 * hr, rgba(darken(color, 0.3), 0.6));
      const tie = side < 0 ? U([[-0.98, -0.42]], hr)[0] : U([[0.86, -0.64]], hr)[0];
      piece(R, ellPath(tie[0], tie[1], 0.09 * hr, 0.13 * hr, side < 0 ? 1.1 : -1.0), F.sp.colors.accent || PAL.red, { part: 'hair', rimW: 0.8 });
    }
  }
  if (st.braids) {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -0.72 : 0.62, y0 = side < 0 ? 0.25 : 0.32;
      const n = 7;
      for (let i = n - 1; i >= 0; i--) {
        const u = i / (n - 1);
        const x = (x0 + side * 0.1 * u) * hr + sw * u * 2, y = (y0 + 0.2 * i) * hr;
        const r = (0.15 - 0.035 * u) * hr;
        const col = side < 0 ? color : darken(color, 0.12);
        piece(R, ellPath(x + (i % 2 ? 0.03 : -0.03) * hr, y, r * 1.12, r * 0.82, (i % 2 ? 0.55 : -0.55)), i % 2 ? col : lighten(col, 0.08), { part: 'hair', rimW: 0.8, underK: 0.5 });
      }
      const ty = (y0 + 0.2 * n) * hr, tx = (x0 + side * 0.11) * hr + sw * 2;
      piece(R, ellPath(tx, ty, 0.09 * hr, 0.07 * hr), F.sp.colors.accent || PAL.princessDark, { part: 'hair', rimW: 0.6 });
      strokePts(R.g, [[tx, ty], [tx - 0.04 * hr, ty + 0.2 * hr]], 0.06 * hr, colorOf(R, color, 'hair'));
    }
  }
  if (st.none && st.tufts) {
    piece(R, jitPath(U([[0.84, -0.18], [1.08, -0.08], [1.1, 0.18], [0.9, 0.24]], hr), 3, hr * 0.03), darken(color, 0.06), { part: 'hair', rimW: 0.9 });
  }
  void g;
}

/** 头发前层（头皮之后）：发帽 + 发髻、呆毛、秃顶两鬓与反光。hairBack 0..1 被风吹向后。 */
function drawHairFront(R, F, hr, style, color) {
  const st = HAIR[style];
  if (!st) return;
  const g = R.g;
  const hb = clamp(F.J.hairBack || 0);
  g.save();
  if (hb > 0) { g.translate(0, -0.2 * hr); g.transform(1, 0, hb * 0.5, 1, 0, 0); g.scale(1 + hb * 0.12, 1); g.translate(0, 0.2 * hr); }
  if (!st.none) {
    if (st.bun) {
      const bx = -0.18 * hr, by = -1.08 * hr;
      piece(R, ellPath(bx, by, 0.36 * hr, 0.32 * hr, -0.2), darken(color, 0.04), { part: 'hair', shade: [bx, by, 0.4 * hr] });
      if (R.detail && !R.sil) strokePts(g, [[bx - 0.42 * hr, by - 0.22 * hr], [bx + 0.3 * hr, by + 0.12 * hr]], 0.05 * hr, PAL.goldDark);
    }
    const cap = hairCapPath(hr, st, F.sp.seed + 41);
    piece(R, cap, color, { part: 'hair', shade: [0.1 * hr, -0.5 * hr, 1.2 * hr], shadeA: 0.25, rimColor: lighten(color, 0.45) });
    if (R.detail && !R.sil && !st.noShine) {
      // 一道发丝高光
      strokeIn(g, cap, U([[-0.5, -0.78], [-0.1, -0.94], [0.32, -0.9]], hr), 0.06 * hr, rgba(lighten(color, 0.55), 0.7));
    }
    if (st.sprout) {
      const w = Math.sin((F.t || 0) * 3 + F.sp.seed) * 0.05;
      const sp = smoothPath(U([[-0.02, -1.0], [0.04 + w, -1.36], [0.26 + w, -1.42], [0.2 + w, -1.3], [0.1, -1.24], [0.1, -1.0]], hr), { closed: true, tension: 0.5 });
      piece(R, sp, color, { part: 'hair', rimW: 1 });
    }
  } else {
    // 秃顶：两鬓 + 头顶反光
    piece(R, jitPath(U([[-0.62, -0.42], [-0.98, -0.3], [-1.1, 0.06], [-0.98, 0.34], [-0.7, 0.3], [-0.6, 0.0]], hr), 5, hr * 0.04), color, { part: 'hair', rimW: 1 });
    if (R.detail && !R.sil) fillEll(g, -0.25 * hr, -0.66 * hr, 0.24 * hr, 0.09 * hr, -0.35, rgba(PAL.white, 0.45));
  }
  g.restore();
  if (hb > 0.05 && !st.none) {
    // 被风扯出的几缕
    for (let i = 0; i < 3; i++) {
      const y0 = (-0.9 + i * 0.32) * hr;
      const len = (0.55 + 0.2 * hash2(F.sp.seed, i)) * hr * hb;
      const wv = Math.sin((F.t || 0) * 14 + i * 2) * 0.06 * hr;
      const p = new Path2D();
      p.moveTo(-0.8 * hr, y0 - 0.06 * hr);
      p.quadraticCurveTo(-0.8 * hr - len * 0.6, y0 - 0.12 * hr + wv, -0.8 * hr - len, y0 + wv);
      p.quadraticCurveTo(-0.8 * hr - len * 0.6, y0 + 0.02 * hr + wv, -0.8 * hr, y0 + 0.08 * hr);
      p.closePath();
      piece(R, p, color, { part: 'hair', under: false, rimW: 0.8 });
    }
  }
}

// ———————————————————— 帽子 ————————————————————
// 头局部，单位 hr；back = 头皮之前画（帽子在头后面的部分），front = 五官之后画。
// top：帽顶离头心的高度（hr 单位，锚点 top 用）；cover：盖住耳朵；fly：能被吹飞。
function hatShape(R, pts, hr, color, seedOff, o = {}) {
  const p = jitPath(U(pts, hr), R.seed + seedOff, hr * 0.025, true, o.tension ?? 0.5);
  piece(R, p, color, { part: 'hat', ...o });
  return p;
}
function bowAt(R, x, y, w, color, rot = 0) {
  const g = R.g;
  g.save(); g.translate(x, y); g.rotate(rot);
  piece(R, jitPath([[0, 0], [-w * 0.35, w * 0.55], [-w * 0.15, w * 0.62], [0, 0.1 * w]], 3, w * 0.03), darken(color, 0.12), { part: 'hat', rimW: 0.7 });
  piece(R, jitPath([[0, 0], [w * 0.3, w * 0.58], [w * 0.5, w * 0.5], [0.05 * w, 0.05 * w]], 4, w * 0.03), darken(color, 0.12), { part: 'hat', rimW: 0.7 });
  piece(R, ellPath(-w * 0.42, -w * 0.06, w * 0.42, w * 0.27, 0.35), color, { part: 'hat', rimW: 0.9 });
  piece(R, ellPath(w * 0.42, -w * 0.06, w * 0.42, w * 0.27, -0.35), color, { part: 'hat', rimW: 0.9 });
  if (R.detail && !R.sil) { fillEll(g, -w * 0.45, -w * 0.04, w * 0.16, w * 0.09, 0.35, darken(color, 0.25)); fillEll(g, w * 0.45, -w * 0.04, w * 0.16, w * 0.09, -0.35, darken(color, 0.25)); }
  piece(R, ellPath(0, -w * 0.02, w * 0.15, w * 0.17), darken(color, 0.08), { part: 'hat', rimW: 0.7 });
  g.restore();
}
function flower(R, x, y, r, color) {
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - 0.3; fillEll(R.g, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, r * 0.48, 0, colorOf(R, color, 'hat')); }
  fillEll(R.g, x, y, r * 0.38, r * 0.38, 0, colorOf(R, PAL.gold, 'hat'));
}

const HATS = {
  beret: {
    top: 1.24, fly: true,
    front(R, hr, C) {
      const p = hatShape(R, [[-1.2, -0.56], [-1.04, -0.86], [-0.56, -1.12], [0.04, -1.2], [0.62, -1.08], [0.98, -0.86], [1.02, -0.7], [0.5, -0.62], [-0.1, -0.6], [-0.72, -0.54]], hr, C.main, 1, { shade: [0.2 * hr, -0.7 * hr, 1.1 * hr] });
      if (R.detail && !R.sil) strokeIn(R.g, p, U([[-1.0, -0.52], [-0.3, -0.6], [0.45, -0.62], [1.05, -0.7]], hr), 0.16 * hr, darken(C.main, 0.22));
      piece(R, ellPath(0.06 * hr, -1.22 * hr, 0.07 * hr, 0.11 * hr, 0.35), C.main, { part: 'hat', under: false, rimW: 0.8 });
    },
  },
  bonnet: {
    top: 1.28, fly: true, cover: true,
    back(R, hr, C) {
      hatShape(R, [[0.72, -0.96], [0.0, -1.26], [-0.86, -0.98], [-1.2, -0.3], [-1.1, 0.44], [-0.72, 0.8], [-0.46, 0.56], [-0.3, -0.2], [0.2, -0.56]], hr, darken(C.main, 0.08), 2, { rim: false });
    },
    front(R, hr, C) {
      const p = hatShape(R, [[0.88, -0.6], [0.74, -0.92], [0.2, -1.22], [-0.52, -1.13], [-1.02, -0.7], [-1.12, 0.0], [-0.86, 0.56], [-0.56, 0.64], [-0.53, 0.12], [-0.44, -0.42], [0.0, -0.68], [0.5, -0.72]], hr, C.main, 3, { shade: [-0.3 * hr, -0.2 * hr, 1.1 * hr] });
      if (R.detail && !R.sil) {
        strokeIn(R.g, p, U([[-0.95, -0.2], [-0.4, -0.95], [0.5, -1.0]], hr), 0.05 * hr, darken(C.main, 0.12));
        const fr = [[0.84, -0.64], [0.6, -0.74], [0.32, -0.73], [0.04, -0.7], [-0.24, -0.6], [-0.42, -0.4], [-0.52, -0.14], [-0.53, 0.14], [-0.55, 0.42]];
        for (const [x, y] of fr) piece(R, ellPath(x * hr, y * hr, 0.1 * hr, 0.1 * hr), C.frill || PAL.white, { part: 'hat', under: false, rimW: 0.7 });
      }
      // 下巴系带 + 蝴蝶结
      const rb = C.second || PAL.princessDark;
      strokePts(R.g, U([[-0.62, 0.56], [-0.42, 0.9], [-0.14, 1.04]], hr), 0.1 * hr, colorOf(R, rb, 'hat'), { smooth: true });
      bowAt(R, -0.1 * hr, 1.04 * hr, 0.36 * hr, rb, 0.15);
    },
  },
  cap: {
    top: 1.14, fly: true,
    front(R, hr, C) {
      const p = hatShape(R, [[-1.06, -0.42], [-0.94, -0.86], [-0.42, -1.12], [0.3, -1.13], [0.82, -0.92], [1.02, -0.64], [0.6, -0.58], [0.0, -0.56], [-0.6, -0.5]], hr, C.main, 4, { shade: [0.1 * hr, -0.6 * hr, hr] });
      if (R.detail && !R.sil) {
        strokeIn(R.g, p, U([[-0.1, -1.12], [0.05, -0.8], [0.12, -0.56]], hr), 0.04 * hr, darken(C.main, 0.25));
        strokeIn(R.g, p, U([[-0.9, -0.48], [0.0, -0.6], [0.95, -0.66]], hr), 0.08 * hr, darken(C.main, 0.18));
      }
      hatShape(R, [[0.5, -0.64], [0.98, -0.7], [1.36, -0.58], [1.3, -0.46], [0.9, -0.46], [0.5, -0.52]], hr, darken(C.main, 0.22), 5, { rimW: 1 });
      piece(R, ellPath(-0.08 * hr, -1.12 * hr, 0.08 * hr, 0.06 * hr), darken(C.main, 0.15), { part: 'hat', under: false, rimW: 0.6 });
    },
  },
  hood: {
    top: 1.24, fly: false, cover: true,
    back(R, hr, C) {
      hatShape(R, [[0.6, -0.95], [-0.2, -1.22], [-0.95, -1.12], [-1.5, -1.2], [-1.98, -0.92], [-2.08, -0.42], [-1.88, -0.5], [-1.62, -0.78], [-1.22, -0.62], [-1.14, 0.3], [-1.0, 0.92], [-0.2, 1.12], [0.62, 1.06], [0.92, 0.86], [0.4, 0.62], [-0.3, 0.56]], hr, darken(C.main, 0.14), 6, { rim: false });
    },
    front(R, hr, C) {
      const p = hatShape(R, [[0.96, -0.46], [0.8, -0.86], [0.2, -1.2], [-0.6, -1.16], [-1.1, -0.76], [-1.14, 0.1], [-0.92, 0.72], [-0.58, 0.74], [-0.56, 0.15], [-0.48, -0.4], [-0.05, -0.66], [0.56, -0.68]], hr, C.main, 7, { shade: [-0.4 * hr, -0.2 * hr, 1.1 * hr] });
      strokeIn(R.g, p, U([[0.98, -0.48], [0.56, -0.68], [-0.05, -0.66], [-0.48, -0.4], [-0.56, 0.15], [-0.58, 0.74]], hr), 0.17 * hr, colorOf(R, mixHex(C.main, PAL.paper, 0.55), 'hat'));
    },
  },
  bow: {
    top: 1.42, fly: true,
    front(R, hr, C) { bowAt(R, -0.16 * hr, -1.02 * hr, 0.62 * hr, C.main, -0.12); },
  },
  tall: {
    top: 1.78, fly: true,
    front(R, hr, C) {
      const body = hatShape(R, [[-0.6, -0.78], [-0.66, -1.7], [-0.3, -1.76], [0.3, -1.78], [0.68, -1.74], [0.62, -0.82]], hr, C.main, 8, { tension: 0.2, shade: [0.2 * hr, -1.2 * hr, 0.9 * hr] });
      if (!R.sil) { R.g.save(); R.g.clip(body); R.g.fillStyle = colorOf(R, C.second || PAL.redDark, 'hat'); R.g.fillRect(-hr, -1.06 * hr, 2 * hr, 0.18 * hr); R.g.restore(); }
      hatShape(R, [[-1.0, -0.74], [-0.62, -0.9], [0.62, -0.92], [1.02, -0.78], [0.62, -0.64], [-0.62, -0.62]], hr, darken(C.main, 0.12), 9, { rimW: 1 });
      piece(R, (() => { const p = new Path2D(); p.roundRect(0.12 * hr, -1.08 * hr, 0.24 * hr, 0.22 * hr, 0.04 * hr); return p; })(), PAL.gold, { part: 'hat', under: false, rimW: 0.7 });
    },
  },
  kerchief: {
    top: 1.14, fly: true,
    front(R, hr, C) {
      const g = R.g;
      const wv = Math.sin((R.t || 0) * 6 + R.seed) * 0.06;
      hatShape(R, [[-0.92, -0.32], [-1.4, -0.52 + wv], [-1.36, -0.2 + wv], [-1.0, -0.14]], hr, darken(C.main, 0.12), 11, { rimW: 0.8 });
      hatShape(R, [[-0.92, -0.32], [-1.32, 0.0 - wv], [-1.12, 0.12 - wv], [-0.9, -0.1]], hr, darken(C.main, 0.18), 12, { rimW: 0.8 });
      const p = hatShape(R, [[0.98, -0.44], [0.76, -0.88], [0.1, -1.13], [-0.6, -1.03], [-1.02, -0.62], [-1.06, -0.2], [-0.8, -0.24], [-0.4, -0.46], [0.2, -0.52], [0.6, -0.5]], hr, C.main, 10, { shade: [0.0, -0.6 * hr, 1.1 * hr] });
      if (R.detail && !R.sil) {
        g.save(); g.clip(p);
        for (let i = 0; i < 9; i++) fillEll(g, (-0.75 + (i % 3) * 0.55 + (Math.floor(i / 3) % 2) * 0.27) * hr, (-0.62 - Math.floor(i / 3) * 0.2) * hr, 0.06 * hr, 0.06 * hr, 0, rgba(PAL.paper, 0.9));
        g.restore();
      }
      piece(R, ellPath(-0.98 * hr, -0.3 * hr, 0.13 * hr, 0.12 * hr), darken(C.main, 0.08), { part: 'hat', rimW: 0.7 });
    },
  },
  wreath: {
    top: 1.2, fly: true,
    front(R, hr, C) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = lerp(198, 342, i / 12) * D; pts.push([Math.cos(a) * 1.0 * hr, Math.sin(a) * 0.98 * hr - 0.06 * hr]); }
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const a = Math.atan2(y, x) + Math.PI / 2 + (i % 2 ? 0.6 : -0.6);
        piece(R, ellPath(x, y, 0.15 * hr, 0.07 * hr, a), i % 2 ? PAL.grass : PAL.leafLight, { part: 'hat', underK: 0.5, rimW: 0.6 });
      }
      const fc = [PAL.heart, PAL.goldLight, PAL.princessLight, PAL.white, PAL.crystal];
      [1, 4, 6, 8, 11].forEach((k, j) => { const [x, y] = pts[k]; flower(R, x, y - 0.03 * hr, 0.13 * hr, fc[j]); });
    },
  },
  toque: {
    top: 1.86, fly: true,
    front(R, hr, C) {
      const puff = hatShape(R, [[-0.8, -0.98], [-0.98, -1.26], [-0.86, -1.56], [-0.5, -1.7], [-0.24, -1.9], [0.18, -1.92], [0.44, -1.72], [0.8, -1.64], [0.98, -1.34], [0.84, -0.98]], hr, C.main, 24, { shade: [0.3 * hr, -1.2 * hr, 0.9 * hr], shadeColor: PAL.stone2, shadeA: 0.4 });
      if (R.detail && !R.sil) {
        strokeIn(R.g, puff, U([[-0.42, -1.12], [-0.5, -1.4], [-0.44, -1.62]], hr), 0.05 * hr, rgba(PAL.stone2, 0.8));
        strokeIn(R.g, puff, U([[0.36, -1.12], [0.44, -1.4], [0.4, -1.66]], hr), 0.05 * hr, rgba(PAL.stone2, 0.8));
      }
      hatShape(R, [[-0.8, -0.66], [-0.84, -1.04], [0.0, -1.1], [0.84, -1.06], [0.8, -0.68], [0.0, -0.62]], hr, C.second || PAL.paper, 13, { tension: 0.25, shade: [0.2 * hr, -0.8 * hr, 0.9 * hr], shadeColor: PAL.stone2, shadeA: 0.25 });
    },
  },
  straw: {
    top: 1.32, fly: true,
    front(R, hr, C) {
      const g = R.g;
      const brim = hatShape(R, [[-1.62, -0.6], [-1.22, -0.86], [0.0, -0.98], [1.22, -0.9], [1.66, -0.62], [1.12, -0.5], [0.0, -0.46], [-1.1, -0.47]], hr, C.main, 14, { shade: [0.4 * hr, -0.6 * hr, 1.5 * hr], shadeColor: PAL.earth });
      if (R.detail && !R.sil) for (let i = 0; i < 2; i++) strokeIn(g, brim, U([[-1.45 + i * 0.2, -0.6], [0, -0.78 + i * 0.12], [1.48 - i * 0.2, -0.64]], hr), 0.03 * hr, rgba(PAL.earth, 0.55));
      const crown = hatShape(R, [[-0.76, -0.72], [-0.74, -1.12], [-0.32, -1.32], [0.34, -1.32], [0.76, -1.1], [0.8, -0.74]], hr, lighten(C.main, 0.08), 15, { shade: [0.3 * hr, -0.9 * hr, 0.8 * hr], shadeColor: PAL.earth });
      if (!R.sil) {
        g.save(); g.clip(crown); g.fillStyle = colorOf(R, C.second || PAL.redDark, 'hat'); g.fillRect(-hr, -0.92 * hr, 2 * hr, 0.17 * hr); g.restore();
        if (R.detail) for (let i = 0; i < 4; i++) strokeIn(g, crown, U([[-0.7 + i * 0.4, -1.3], [-0.6 + i * 0.4, -0.95]], hr), 0.025 * hr, rgba(PAL.earth, 0.45));
      }
    },
  },
  headscarf: {
    top: 1.18, fly: true, cover: true,
    back(R, hr, C) {
      hatShape(R, [[-0.2, -1.15], [-0.96, -0.92], [-1.2, -0.2], [-1.02, 0.5], [-0.62, 0.76], [-0.42, 0.2], [-0.32, -0.6]], hr, darken(C.main, 0.12), 16, { rim: false });
    },
    front(R, hr, C) {
      const g = R.g;
      const p = hatShape(R, [[0.9, -0.5], [0.76, -0.9], [0.15, -1.17], [-0.6, -1.09], [-1.07, -0.62], [-1.12, 0.12], [-0.84, 0.68], [-0.5, 0.86], [-0.46, 0.4], [-0.52, -0.08], [-0.34, -0.5], [0.12, -0.63], [0.56, -0.6]], hr, C.main, 17, { shade: [-0.2 * hr, 0.0, 1.2 * hr] });
      if (R.detail && !R.sil) {
        g.save(); g.clip(p);
        for (let i = 0; i < 14; i++) fillEll(g, (-1.0 + (i % 5) * 0.48 + (Math.floor(i / 5) % 2) * 0.24) * hr, (-0.95 + Math.floor(i / 5) * 0.42 + (i % 2) * 0.1) * hr, 0.055 * hr, 0.055 * hr, 0, rgba(PAL.paper, 0.85));
        g.restore();
      }
      piece(R, jitPath(U([[-0.42, 0.86], [-0.6, 1.2], [-0.4, 1.24], [-0.26, 0.96]], hr), 18, hr * 0.02), darken(C.main, 0.1), { part: 'hat', rimW: 0.7 });
      piece(R, jitPath(U([[-0.3, 0.9], [-0.06, 1.18], [0.08, 1.06], [-0.18, 0.86]], hr), 19, hr * 0.02), darken(C.main, 0.04), { part: 'hat', rimW: 0.7 });
      piece(R, ellPath(-0.34 * hr, 0.9 * hr, 0.12 * hr, 0.1 * hr), C.main, { part: 'hat', rimW: 0.6 });
    },
  },
  busby: {
    top: 2.42, fly: true,
    front(R, hr, C) {
      const g = R.g;
      const sway = Math.sin((R.t || 0) * 2.3 + R.seed) * 2;
      // 白羽饰（侧后方）
      const pl = smoothPath(U([[-0.72, -1.2], [-0.95, -1.62], [-0.98, -2.2], [-0.8, -2.62 + sway * 0.01], [-0.66, -2.2], [-0.6, -1.62]], hr), { closed: true, tension: 0.5 });
      piece(R, pl, C.plume || PAL.ermine, { part: 'hat', rimW: 0.9, shade: [-0.8 * hr, -1.9 * hr, 0.5 * hr], shadeColor: PAL.stone2 });
      const p = hatShape(R, [[-0.88, -0.48], [-0.98, -1.2], [-0.88, -1.9], [-0.46, -2.3], [0.2, -2.38], [0.72, -2.12], [0.94, -1.55], [0.94, -0.82], [0.84, -0.48], [0.3, -0.44], [-0.4, -0.43]], hr, C.main, 20, { shade: [0.3 * hr, -1.4 * hr, 1.3 * hr], shadeColor: PAL.shadow, shadeA: 0.35, rimColor: mixHex(C.main, PAL.white, 0.3) });
      if (R.detail && !R.sil) {
        g.save(); g.clip(p);
        g.strokeStyle = rgba(PAL.inkSoft, 0.85); g.lineWidth = 0.05 * hr; g.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
          const x = (-0.85 + (i % 7) * 0.29 + (Math.floor(i / 7) % 2) * 0.14) * hr, y = (-0.75 - Math.floor(i / 7) * 0.42 - hash2(5, i) * 0.12) * hr;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 0.06 * hr, y - 0.12 * hr, x + 0.02 * hr, y - 0.24 * hr); g.stroke();
        }
        g.restore();
      }
      // 金徽章（星形）
      const bx = 0.4 * hr, by = -1.0 * hr, br = 0.2 * hr;
      const star = new Path2D();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU; const r = i % 2 ? br * 0.45 : br; i ? star.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r) : star.moveTo(bx + Math.cos(a) * r, by + Math.sin(a) * r); }
      star.closePath();
      piece(R, star, PAL.gold, { part: 'hat', underK: 0.6, rimW: 0.8, rimColor: PAL.goldLight });
      // 下颏带（飞起来时只剩两小截）
      if (!R.flying) strokePts(g, U([[-0.86, -0.46], [-0.7, 0.3], [-0.2, 0.92], [0.42, 0.88], [0.84, 0.4], [0.86, -0.46]], hr), 0.07 * hr, colorOf(R, PAL.goldDark, 'hat'), { smooth: true });
      else for (const sx of [-1, 1]) strokePts(g, U([[0.86 * sx, -0.48], [0.8 * sx, -0.2]], hr), 0.07 * hr, colorOf(R, PAL.goldDark, 'hat'));
    },
  },
  skullcap: {
    top: 1.14, fly: true,
    front(R, hr, C) {
      hatShape(R, [[-0.8, -0.66], [-0.64, -0.98], [0.0, -1.14], [0.64, -0.98], [0.82, -0.68], [0.3, -0.75], [-0.3, -0.75]], hr, C.main, 21, { shade: [0.2 * hr, -0.8 * hr, 0.8 * hr] });
      strokePts(R.g, U([[0, -1.12], [-0.3, -1.08], [-0.52, -0.92]], hr), 0.05 * hr, colorOf(R, PAL.gold, 'hat'), { smooth: true });
      piece(R, jitPath(U([[-0.5, -0.94], [-0.62, -0.62], [-0.44, -0.62]], hr), 22, hr * 0.02), PAL.gold, { part: 'hat', rimW: 0.6, underK: 0.5 });
    },
  },
  plumeCap: {
    top: 2.1, fly: true,
    front(R, hr, C) {
      const g = R.g;
      const sw = Math.sin((R.t || 0) * 2.6 + R.seed) * 0.08;
      const fpts = [[-0.25, -1.0], [-0.55, -1.5], [-0.75 + sw, -1.95], [-1.0 + sw * 1.4, -2.18]];
      const L = [], Rr = [];
      const wd = [0.06, 0.2, 0.17, 0.02];
      for (let i = 0; i < 4; i++) {
        const a = fpts[Math.max(0, i - 1)], b = fpts[Math.min(3, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        L.push([fpts[i][0] - (dy / l) * wd[i], fpts[i][1] + (dx / l) * wd[i]]);
        Rr.push([fpts[i][0] + (dy / l) * wd[i], fpts[i][1] - (dx / l) * wd[i]]);
      }
      const fp = smoothPath(U([...L, ...Rr.reverse()], hr), { closed: true, tension: 0.45 });
      piece(R, fp, C.feather || PAL.goldLight, { part: 'hat', rimW: 0.9, shade: [-0.6 * hr, -1.7 * hr, 0.6 * hr], shadeColor: PAL.goldDark });
      if (R.detail && !R.sil) {
        strokeIn(g, fp, U(fpts, hr), 0.035 * hr, PAL.goldDark);
        for (let i = 1; i < 6; i++) { const u = i / 6; const p = vlerp(fpts[1], fpts[3], u); strokeIn(g, fp, U([p, [p[0] + 0.16, p[1] + 0.06]], hr), 0.02 * hr, rgba(PAL.goldDark, 0.6)); }
      }
      const cap = hatShape(R, [[-1.06, -0.6], [-0.96, -0.92], [-0.4, -1.1], [0.35, -1.12], [0.9, -0.95], [1.08, -0.68], [0.6, -0.6], [-0.2, -0.56]], hr, C.main, 23, { shade: [0.2 * hr, -0.7 * hr, 1.0 * hr] });
      if (!R.sil) strokeIn(g, cap, U([[-1.0, -0.6], [-0.2, -0.64], [0.6, -0.66], [1.05, -0.7]], hr), 0.14 * hr, PAL.gold);
      piece(R, ellPath(-0.26 * hr, -0.98 * hr, 0.1 * hr, 0.1 * hr), PAL.heart, { part: 'hat', under: false, rimW: 0.6, rimColor: PAL.white });
    },
  },
  crown: {
    top: 1.42, fly: true,
    front(R, hr, C) {
      const g = R.g;
      g.save(); g.translate(-0.14 * hr, 0.02 * hr); g.rotate(-0.16);
      const pts = [[-0.44, -0.86], [-0.48, -1.32], [-0.26, -1.1], [0.0, -1.42], [0.26, -1.1], [0.48, -1.32], [0.44, -0.86]];
      const p = jitPath(U(pts, hr), 7, hr * 0.015, true, 0.12);
      piece(R, p, C.main || PAL.gold, { part: 'hat', shade: [0.1 * hr, -1.0 * hr, 0.6 * hr], shadeColor: PAL.goldDark, rimColor: PAL.goldLight });
      for (const [x, y] of [[-0.48, -1.32], [0, -1.42], [0.48, -1.32]]) piece(R, ellPath(x * hr, y * hr, 0.08 * hr, 0.08 * hr), PAL.goldLight, { part: 'hat', under: false, rim: false });
      piece(R, ellPath(0, -0.98 * hr, 0.09 * hr, 0.1 * hr), PAL.heart, { part: 'hat', under: false, rimColor: PAL.white, rimW: 0.5 });
      g.restore();
    },
  },
};

/** 帽子在头上的“帽冠点”（头局部，hr 单位）：飞帽时以此为锚。 */
const HAT_ANCHOR = [0, -0.9];

function drawHatAt(R, hr, type, C, layer) {
  const h = HATS[type];
  if (!h) return;
  if (layer === 'back' && h.back) h.back(R, hr, C);
  if (layer === 'front' && h.front) h.front(R, hr, C);
  if (layer === 'both') { if (h.back) h.back(R, hr, C); h.front(R, hr, C); }
}

// ———————————————————— 通用木偶 ————————————————————
const J0 = {
  dx: 0, bob: 0, tilt: 0, tiltX: 0, wob: 0, lean: 0, head: 0, headX: 0, headY: 0, turn: 0, look: 0, lookY: 0, jaw: 0, sq: 0,
  shF: 14, elF: 10, shB: -14, elB: -10, hipF: 4, knF: 0, hipB: -4, knB: 0, armsFront: 0, strF: 1, strB: 1,
  hairBack: 0, plant: 1, sweat: 0, item: 0, hatOff: 0, cheeks: 0, shUpF: 0, shUpB: 0, gy: 0,
};
const cyc = (c, rate) => TAU * (c.cycle != null ? c.cycle : c.t * rate * c.speed + c.phase);
/** 步态：walk（倒摆，站立中段最高）/ run（腾空）。返回腿角与 bob。 */
function gait(p, A, K, B, run = false) {
  const kn = (q) => -K * Math.pow(Math.max(0, Math.cos(q + 0.7)), 1.3) - (run ? 5 : 2);
  return { hipF: A * Math.sin(p), knF: kn(p), hipB: A * Math.sin(p + Math.PI), knB: kn(p + Math.PI), bob: B * (run ? Math.abs(Math.sin(p)) : Math.abs(Math.cos(p))) };
}
const actP = (c, period = 1.6) => (c.p != null ? clamp(c.p) : fract(c.t / period + c.phase));

function poseCtx(o, sp) {
  const c = { t: o.t ?? 0, phase: o.phase ?? 0, cycle: o.cycle, speed: o.speed ?? 1, seed: sp.seed, p: o.p, sp, o };
  c.SF = [sp.shX, -sp.shY];
  c.SB = [-sp.shX * 0.94, -sp.shY + 1.5];
  c.ikF = (T, bend = 1, st = 1, up = 0) => ik2([c.SF[0], c.SF[1] - up], T, sp.arm.l1 * st, sp.arm.l2 * st, bend);
  c.ikB = (T, bend = 1, st = 1, up = 0) => ik2([c.SB[0], c.SB[1] - up], T, sp.arm.l1 * st, sp.arm.l2 * st, bend);
  /** 头局部点（hr 单位）在身体空间的位置（给定头倾角）。 */
  c.headPt = (local, head = 0, lean = 0) => {
    void lean;
    const N = [0, -sp.bodyTop + 3];
    const H0 = [sp.headX, -(sp.bodyTop + 0.82 * sp.hr)];
    const Hc = vadd(N, vrot(vsub(H0, N), head));
    return vadd(Hc, vrot([local[0] * sp.hr, local[1] * sp.hr], head));
  };
  return c;
}
function evalPose(table, name, c) { const f = table[name] || table.idle || table.stand || table.attention; return { ...J0, ...f(c) }; }
function resolvePose(table, pose, c) {
  if (pose && typeof pose === 'object') {
    const a = evalPose(table, pose.from, c), b = evalPose(table, pose.to, c), k = clamp(pose.k ?? 0);
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const va = a[key], vb = b[key];
      out[key] = typeof va === 'number' && typeof vb === 'number' ? lerp(va, vb, k) : k < 0.5 ? va : vb;
    }
    out._pose = k < 0.5 ? pose.from : pose.to;
    out._k = k;
    return out;
  }
  const j = evalPose(table, pose || 'idle', c);
  j._pose = pose || 'idle';
  return j;
}
/** 群演个体差异：按 seed 给手臂、身体、头加几度稳定偏差（o.jitter = 0 关闭）。 */
function jitterJ(J, c, o) {
  const k = o.jitter ?? 1;
  if (!k) return;
  const r = (i) => (hash2(c.seed * 1.37 + 11, i) - 0.5) * 2 * k;
  J.shF += r(1) * 4; J.shB += r(2) * 4; J.elF += r(3) * 5; J.elB += r(4) * 5; J.head += r(5) * 3; J.lean += r(6) * 1.5;
}
function applyJoints(J, add, set) {
  if (add) for (const k in add) J[k] = (typeof J[k] === 'number' ? J[k] : 0) + add[k];
  if (set) for (const k in set) J[k] = set[k];
}

function legFK(top, hip, knee, sp) {
  const k = vadd(top, vmul(dirv(hip), sp.leg.l1));
  const a2 = hip + knee;
  const ank = vadd(k, vmul(dirv(a2), sp.leg.l2));
  return { top, knee: k, ankle: ank, a2, footAng: a2 * 0.5, sole: ank[1] };
}
/** 手臂 FK。st = 橡皮管拉长倍数（举手类动作用，Q 版短手才够得到头顶）。 */
function armFK(S, sh, el, sp, st = 1) {
  const e = vadd(S, vmul(dirv(sh), sp.arm.l1 * st));
  const ang = sh + el;
  const h = vadd(e, vmul(dirv(ang), sp.arm.l2 * st));
  return { s: S, e, h, ang };
}

function drawLegPart(R, F, L, color, part) {
  const sp = F.sp, g = R.g;
  const r = sp.leg.r;
  const path = hosePath([L.top, L.knee, L.ankle], [r * 1.05, r * 0.98, r * 0.9]);
  piece(R, path, color, { part, rimW: 1.1, shade: [L.knee[0], L.knee[1], sp.leg.l1 * 1.4], shadeA: 0.2 });
  if (sp.legStripe && R.detail && !R.sil) strokeIn(g, path, [vadd(L.top, [-r * 0.45, 0]), vadd(L.knee, [-r * 0.45, 0]), vadd(L.ankle, [-r * 0.45, 0])], r * 0.35, sp.legStripe);
  // 鞋
  const [fl, fh] = sp.leg.foot;
  const fa = L.footAng * -1;
  const c = vadd(L.ankle, vrot([fl * 0.24, -fh * 0.42], fa));
  const shoe = jitPath([[-fl * 0.42, fh * 0.42], [-fl * 0.5, -fh * 0.15], [-fl * 0.2, -fh * 0.5], [fl * 0.18, -fh * 0.48], [fl * 0.5, -fh * 0.12], [fl * 0.52, fh * 0.42]].map((p) => vadd(c, vrot(p, fa))), sp.seed + (part === 'legF' ? 3 : 7), fl * 0.03, true, 0.45);
  piece(R, shoe, part === 'legB' ? darken(sp.colors.shoes, 0.1) : sp.colors.shoes, { part, rimW: 1, underK: 0.7 });
}

function drawArmPart(R, F, A, part) {
  const sp = F.sp;
  const back = part === 'armB';
  const col = back ? darken(sp.colors.sleeve, 0.1) : sp.colors.sleeve;
  const a = sp.arm;
  const wrist = vsub(A.h, vmul(dirv(A.ang), a.hand * 0.55));
  const path = hosePath([A.s, A.e, wrist], [a.r0, a.r1, a.r2]);
  piece(R, path, col, { part, rimW: 1.2, shade: [A.e[0], A.e[1], a.l1 * 1.3], shadeA: 0.22 });
  if (a.cuff && !R.sil) {
    const c0 = vsub(wrist, vmul(dirv(A.ang), a.r2 * 0.9));
    piece(R, limbPath([c0, wrist], [a.r2 * 1.02, a.r2 * 1.04]), back ? darken(a.cuff, 0.1) : a.cuff, { part, under: false, rimW: 0.8 });
  }
  if (a.puff) {
    const pr = a.r0 * 1.55;
    const pp = ellPath(A.s[0], A.s[1] + pr * 0.15, pr, pr * 0.92);
    piece(R, pp, back ? darken(a.puff, 0.1) : a.puff, { part, rimW: 1, shade: [A.s[0], A.s[1], pr] });
    if (a.puffStripe && R.detail && !R.sil) for (const dx of [-0.45, 0.1, 0.62]) strokeIn(R.g, pp, [[A.s[0] + dx * pr, A.s[1] - pr], [A.s[0] + dx * pr + 0.1 * pr, A.s[1] + pr * 1.1]], pr * 0.24, back ? darken(a.puffStripe, 0.1) : a.puffStripe);
  }
}
function drawHandPart(R, F, A, part) {
  const sp = F.sp, a = sp.arm;
  const back = part === 'armB';
  const skin = back ? darken(sp.colors.skin, 0.06) : sp.colors.skin;
  const hr = a.hand;
  const th = vadd(A.h, vmul(dirv(A.ang + 75), hr * 0.72));
  const p = new Path2D();
  p.ellipse(A.h[0], A.h[1], hr, hr * 0.94, 0, 0, TAU);
  p.ellipse(th[0], th[1], hr * 0.42, hr * 0.42, 0, 0, TAU);
  piece(R, p, skin, { part, rimW: 0.9, underK: 0.7, rimColor: lighten(sp.colors.skin, 0.6) });
}

/** 汗珠（头局部）。 */
function drawSweat(R, hr, amt, t, seed) {
  if (amt <= 0 || R.sil) return;
  const g = R.g;
  const drops = amt > 0.55 ? 2 : 1;
  for (let i = 0; i < drops; i++) {
    const per = 1.1 + i * 0.3;
    const u = fract(t / per + hash1(seed + i * 3));
    const x = (i ? 0.92 : -0.86) * hr, y = (-0.2 + u * 0.45) * hr;
    const a = Math.min(1, amt * 1.5) * (u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15);
    const r = 0.11 * hr;
    const p = new Path2D();
    p.moveTo(x, y - r * 1.9);
    p.bezierCurveTo(x + r * 0.9, y - r * 0.4, x + r, y + r * 0.8, x, y + r);
    p.bezierCurveTo(x - r, y + r * 0.8, x - r * 0.9, y - r * 0.4, x, y - r * 1.9);
    g.save(); g.globalAlpha *= a;
    g.fillStyle = PAL.skyDayLow; g.fill(p);
    g.lineWidth = 0.035 * hr; g.strokeStyle = rgba(PAL.water, 0.8); g.stroke(p);
    fillEll(g, x - r * 0.3, y, r * 0.22, r * 0.3, 0, PAL.white);
    g.restore();
  }
}

/**
 * 通用渲染：腿 → 后手 → 身体 → 头（后发/帽后 → 脸 → 发帽/耳/五官 → 帽前）→ 前手 → 前景道具。
 * hk 钩子：behind / backHand / legs / bodyDeco(clip 内) / bodyOver / afterBody / headBack / headFront / afterHead / frontHand / front / overlay / anchors
 */
function renderPuppet(g, o, sp, J, E, hk = {}) {
  const s = o.s ?? 1, face = o.face === -1 ? -1 : 1;
  const detail = o.detail ?? 1;
  const t = o.t ?? 0;
  const R = { g, detail, face, t, seed: sp.seed, sil: !!o.silhouette, silColor: o.silColor || PAL.ink, keep: new Set(o.keepColor || []), ul: detail > 0 ? sp.ul ?? 2.1 : 0, rimW: sp.rimW ?? 1.7 };
  const hr = sp.hr;
  // —— 骨架（图形空间：脚底中心为原点，朝 +x，y 向下） ——
  const hipC = [J.dx, -sp.L];
  const bf = (p) => vadd(hipC, vrot(p, J.lean));
  let legF = null, legB = null;
  if (sp.L > 0) {
    legF = legFK(vadd(hipC, vrot([sp.legSep, 0], J.lean)), J.hipF, J.knF, sp);
    legB = legFK(vadd(hipC, vrot([-sp.legSep, 0], J.lean)), J.hipB, J.knB, sp);
  }
  let oy = -J.bob;
  if (J.plant && legF) oy -= Math.max(legF.sole, legB.sole);
  const N_b = [0, -sp.bodyTop + 3];
  const H0_b = [sp.headX + J.headX, -(sp.bodyTop + 0.82 * hr) + J.headY];
  const Hc = bf(vadd(N_b, vrot(vsub(H0_b, N_b), J.head)));
  const headAng = J.lean + J.head;
  const tr = clamp(J.turn);
  const hsgn = tr < 0.5 ? 1 : -1;
  const hsx = hsgn * (1 - 0.22 * Math.sin(Math.PI * tr));
  const hf = (p) => vadd(Hc, vrot([p[0] * hsx, p[1]], headAng));
  const toFig = (A) => ({ s: bf(A.s), e: bf(A.e), h: bf(A.h), ang: A.ang - J.lean });
  const armF = toFig(armFK([sp.shX, -sp.shY - J.shUpF], J.shF, J.elF, sp, J.strF));
  const armB = toFig(armFK([-sp.shX * 0.94, -sp.shY + 1.5 - J.shUpB], J.shB, J.elB, sp, J.strB));
  const F = {
    sp, J, E, R, o, t, s, face, hipC, legF, legB, armF, armB, Hc, headAng, hsx, hsgn, bf, hf, oy, N: bf(N_b),
    fx: 0.14 * hr * Math.abs(1 - 2 * tr), hs: face * hsgn, skin: sp.colors.skin,
    blink: !o.noBlink && blinkAt(t, sp.seed), anchors: {},
  };
  // —— 世界矩阵（与 canvas 同步，算锚点） ——
  let M = mT(M0(), o.x ?? 0, o.y ?? 0);
  M = mS(M, face * s, s);
  if (J.gy) M = mT(M, 0, J.gy);
  const tilt = J.tilt + J.wob;
  if (tilt) { M = mT(M, J.tiltX, 0); M = mR(M, tilt * D); M = mT(M, -J.tiltX, 0); }
  const sqv = J.sq + (o.squash || 0);
  const [sqx, sqy] = sqv ? squashOf(sqv) : [1, 1];
  M = mS(M, sqx, sqy);
  const Mpre = M;
  M = mT(M, 0, oy);
  F.M = M;
  F.W = (p) => mP(M, p);
  // —— 绘制 ——
  g.save();
  if ((o.alpha ?? 1) < 1) g.globalAlpha *= clamp(o.alpha);
  g.transform(Mpre[0], Mpre[1], Mpre[2], Mpre[3], Mpre[4], Mpre[5]);
  if (J.clipGround) { g.beginPath(); g.rect(-4000, -6000, 8000, 6000 + (J.clipGround === true ? 0 : J.clipGround)); g.clip(); }
  g.translate(0, oy);
  if (o.rod) {
    const rp = limbPath([vadd(hipC, [0, -sp.bodyTop * 0.4]), [hipC[0], 1400 / Math.max(0.2, s)]], [3.2, 3.2]);
    piece(R, rp, PAL.woodDark, { part: 'rod', rimW: 1, rimColor: PAL.wood });
  }
  hk.behind?.(R, F);
  const backFront = !!J.armsFront;
  if (!backFront) {
    drawArmPart(R, F, armB, 'armB');
    hk.backHand?.(R, F);
    drawHandPart(R, F, armB, 'armB');
  }
  if (legF) {
    drawLegPart(R, F, legB, darken(sp.colors.legsB || sp.colors.legs, 0.08), 'legB');
    drawLegPart(R, F, legF, sp.colors.legs, 'legF');
  }
  hk.legs?.(R, F);
  // 身体（身体空间）
  g.save();
  g.translate(hipC[0], hipC[1]);
  g.rotate(J.lean * D);
  const bodyPath = hk.bodyShape ? hk.bodyShape(R, F) : beanPath(sp.bw, sp.bodyTop, sp.below, { flare: sp.flare, belly: sp.belly, seed: sp.seed });
  piece(R, bodyPath, sp.colors.body, { part: 'body', shade: [sp.bw * 0.25, -sp.bodyTop * 0.3, (sp.bodyTop + sp.below) * 0.7], shadeA: 0.26, rimColor: lighten(sp.colors.body, 0.55) });
  if (!R.sil && hk.bodyDeco) { g.save(); g.clip(bodyPath); hk.bodyDeco(R, F, bodyPath); g.restore(); }
  hk.bodyOver?.(R, F);
  g.restore();
  hk.afterBody?.(R, F);
  // 头（头局部）
  g.save();
  g.translate(Hc[0], Hc[1]);
  g.rotate(headAng * D);
  g.scale(hsx, 1);
  hk.headBack?.(R, F);
  const jawPx = J.jaw * sp.jawPx;
  if (!sp.noEar && hk.earUnder) drawEar(R, F, hr);
  const hp = headPath(hr, jawPx, sp.seed);
  piece(R, hp, sp.colors.skin, { part: 'head', shade: [0.25 * hr, 0.1 * hr, hr * 1.1], shadeA: 0.24, rimColor: lighten(sp.colors.skin, 0.6) });
  const ck = Math.max(J.cheeks, E.cheeks || 0);
  if (ck > 0) for (const sx of [-1, 1]) piece(R, ellPath(F.fx + sx * 0.5 * hr, 0.3 * hr, 0.3 * hr * ck, 0.27 * hr * ck), sp.colors.skin, { part: 'head', under: false, rimW: 0.8, shade: [F.fx + sx * 0.5 * hr, 0.3 * hr, 0.3 * hr], shadeA: 0.15 });
  hk.hairCap?.(R, F);
  if (!sp.noEar && !hk.earUnder && hk.showEar?.(F) !== false) drawEar(R, F, hr);
  drawFace(R, F, hr, E);
  hk.headFront?.(R, F);
  drawSweat(R, hr, Math.max(o.sweat ?? 0, J.sweat, E.sweat || 0) * (o.sweat === 0 ? 0 : 1), t, sp.seed);
  g.restore();
  hk.afterHead?.(R, F);
  if (backFront) {
    drawArmPart(R, F, armB, 'armB');
    hk.backHand?.(R, F);
    drawHandPart(R, F, armB, 'armB');
  }
  drawArmPart(R, F, armF, 'armF');
  hk.frontHand?.(R, F);
  drawHandPart(R, F, armF, 'armF');
  hk.front?.(R, F);
  hk.overlay?.(R, F);
  g.restore();
  // —— 锚点（调用方坐标） ——
  const W = F.W;
  const mouthL = [F.fx + 0.05 * hr, 0.42 * hr + jawPx * 0.4];
  const topH = (hk.topH ? hk.topH(F) : 1.1) * hr;
  const out = {
    head: W(Hc), neck: W(F.N), mouth: W(hf(mouthL)), eye: W(hf([F.fx, 0.07 * hr])), top: W(hf([0, -topH])),
    handF: W(armF.h), handB: W(armB.h), handR: W(armF.h), handL: W(armB.h), hand: W((J.main === 'B' ? armB : armF).h),
    feet: W([J.dx, -oy]), hip: W(hipC), scale: s, face,
    ...F.anchors,
  };
  hk.anchors?.(F, out);
  return out;
}
function drawEar(R, F, hr) {
  const x = -0.64 * hr, y = 0.14 * hr;
  piece(R, ellPath(x, y, 0.19 * hr, 0.21 * hr), F.sp.colors.skin, { part: 'head', rimW: 0.9, underK: 0.6 });
  if (R.detail && !R.sil) fillEll(R.g, x + 0.02 * hr, y + 0.02 * hr, 0.09 * hr, 0.12 * hr, 0, rgba(PAL.skinShade, 0.9));
}

/** 飞帽：在图形空间画一顶脱离头部的帽子。fly 0..1；mode 'blow'（向后吹走）/ 'toss'（向上抛起再落回头上）。 */
function flyingHat(R, F, type, C, fly, mode) {
  const g = R.g, hr = F.sp.hr;
  const start = F.hf(U([HAT_ANCHOR], hr)[0]);
  let off, rot, alpha = 1;
  if (mode === 'toss') {
    const h = 4 * fly * (1 - fly);
    off = [-10 * fly, -240 * h];
    rot = -TAU * 2 * outQuad(fly);
  } else {
    off = [-300 * fly - 60 * fly * fly, -200 * fly + 120 * fly * fly];
    rot = -TAU * 1.6 * fly;
    alpha = 1 - sstep((fly - 0.82) / 0.18);
  }
  const p = vadd(start, off);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(p[0], p[1]);
  g.rotate(F.headAng * D + rot);
  g.scale(F.hsgn, 1);
  g.translate(-HAT_ANCHOR[0] * hr, -HAT_ANCHOR[1] * hr);
  R.flying = true;
  drawHatAt(R, hr, type, C, 'both');
  R.flying = false;
  g.restore();
  F.anchors.hat = [...F.W(p), F.headAng * D + rot];
}

// ———————————————————— 市民 ————————————————————
/**
 * 12 个市民变体（5 种粉彩身体色 × 高矮 × 帽子 / 发型）。H = 头顶高度（不含帽子，s=1）。
 * 任何变体都可叠 courtier（褶领 + 金饰带）/ villager（草帽 + 小领巾）/ grandma（头巾 + 拐杖 + 驼背）。
 */
export const FOLK_VARIANTS = [
  { key: 'beret', name: '贝雷帽高个', body: 'rose', H: 186, bw: 30, belly: 0.25, hat: 'beret', hatC: PAL.redDark, hair: 'tuft', hairC: PAL.heroHair, stache: 'curl', acc: ['belt'], legs: PAL.woodDark, shoes: PAL.boot, skin: 'light' },
  { key: 'bonnet', name: '软帽小姑娘', body: 'sky', H: 150, bw: 34, hat: 'bonnet', hatC: PAL.paper, hat2: PAL.princessDark, hair: 'curls', hairC: PAL.hairGold, lashes: true, acc: ['apron'], legs: PAL.paper2, shoes: PAL.redDark, skin: 'light', nose: false },
  { key: 'cap', name: '鸭舌帽杂货商', body: 'mint', H: 174, bw: 38, belly: 0.7, hat: 'cap', hatC: PAL.wood, hair: 'short', hairC: PAL.woodDark, acc: ['apron', 'buttons'], legs: PAL.inkSoft, shoes: PAL.woodDark, skin: 'tan' },
  { key: 'bun', name: '盘发阿姨', body: 'lilac', H: 158, bw: 36, belly: 0.35, flare: 1.12, hat: null, hair: 'bun', hairC: PAL.stone2, lashes: true, acc: ['shawl'], legs: PAL.inkSoft, shoes: PAL.redDeep, skin: 'light' },
  { key: 'hood', name: '尖兜帽青年', body: 'butter', H: 182, bw: 29, hat: 'hood', hatC: PAL.roof, hair: 'bob', hairC: PAL.heroHair, acc: ['belt'], legs: PAL.heroBlueDark, shoes: PAL.boot, skin: 'light' },
  { key: 'bow', name: '蝴蝶结女孩', body: 'rose', H: 150, bw: 32, flare: 1.14, hat: 'bow', hatC: PAL.red, hair: 'pigtails', hairC: PAL.earth, lashes: true, acc: ['collar'], legs: PAL.paper, shoes: PAL.woodDark, skin: 'tan', nose: false },
  { key: 'tophat', name: '高帽绅士', body: 'sky', H: 178, bw: 30, belly: 0.2, hat: 'tall', hatC: PAL.inkSoft, hat2: PAL.redDark, hair: 'short', hairC: PAL.ink, stache: 'flat', acc: ['vest'], legs: PAL.inkSoft, shoes: PAL.ink, skin: 'light' },
  { key: 'kerchief', name: '头巾男孩', body: 'mint', H: 150, bw: 33, hat: 'kerchief', hatC: mixHex(PAL.skyDusk, PAL.fire, 0.35), hair: 'spiky', hairC: PAL.earth, acc: ['patch'], legs: PAL.wood, shoes: PAL.woodDark, skin: 'tan', nose: false },
  { key: 'curly', name: '卷发大叔', body: 'lilac', H: 184, bw: 37, belly: 0.8, hat: null, hair: 'afro', hairC: PAL.ink, beard: true, acc: ['belt'], legs: PAL.woodDark, shoes: PAL.boot, skin: 'deep' },
  { key: 'wreath', name: '花环姑娘', body: 'butter', H: 156, bw: 32, flare: 1.14, hat: 'wreath', hair: 'braids', hairC: PAL.hairGold, lashes: true, acc: ['apron'], legs: PAL.paper, shoes: PAL.princessDark, skin: 'light', nose: false },
  { key: 'bald', name: '秃顶老爷爷', body: 'sky', H: 170, bw: 36, belly: 0.55, hat: null, hair: 'bald', hairC: PAL.beard, stache: 'walrus', acc: ['vest'], legs: PAL.inkSoft, shoes: PAL.woodDark, skin: 'light' },
  { key: 'baker', name: '面包师', body: 'butter', H: 176, bw: 36, belly: 0.6, hat: 'toque', hatC: PAL.white, hat2: PAL.paper, hair: 'short', hairC: PAL.heroHair, acc: ['apron'], legs: PAL.woodDark, shoes: PAL.boot, skin: 'tan' },
];

function citizenSpec(o) {
  const vi = (((o.variant ?? 0) % 12) + 12) % 12;
  const v = FOLK_VARIANTS[vi];
  const grandma = !!o.grandma;
  const H = Math.round(v.H * (grandma ? 0.92 : 1));
  const hr = 32 + (v.H - 150) * 0.09;
  const L = Math.round(H * (0.1 + (v.H - 150) * 0.0012));
  const bodyTop = H - L - 1.82 * hr;
  const body = FOLK_PASTELS[v.body];
  const seed = (o.seed ?? vi * 7 + 3) + 1;
  let hat = v.hat, hatC = v.hatC, hat2 = v.hat2, hair = v.hair, hairC = v.hairC;
  if (o.villager) { hat = 'straw'; hatC = PAL.sand; hat2 = PAL.redDark; }
  if (grandma) { hat = 'headscarf'; hatC = mixHex(PAL.princessDark, PAL.dragonWing, 0.35); hair = 'bun'; hairC = PAL.stone; }
  const acc = [...(v.acc || [])];
  if (grandma && !acc.includes('shawl')) acc.push('shawl');
  const skin = SKIN[v.skin] || PAL.skin;
  return {
    kind: 'citizen', v, vi, seed, H, hr, L, bodyTop, below: L * 0.45, bw: v.bw, flare: v.flare ?? 1.04, belly: v.belly ?? 0,
    shX: v.bw * 0.8, shY: bodyTop * 0.78, headX: 1.5, legSep: v.bw * 0.36, jawPx: 30,
    arm: { l1: bodyTop * 0.2 + 3, l2: bodyTop * 0.22 + 4, r0: 6.8, r1: 5.8, r2: 5.1, hand: 6.4 },
    leg: { l1: L * 0.5, l2: L * 0.5, r: 6.2, foot: [19, 9] },
    hat, hair, acc, grandma, courtier: !!o.courtier, villager: !!o.villager,
    stache: v.stache, beard: v.beard, lashes: v.lashes, nose: v.nose,
    colors: {
      body, trim: darken(body, 0.22), sleeve: body, legs: v.legs, shoes: v.shoes, skin, hair: hairC,
      hat: hatC, hat2, accent: v.key === 'bow' ? PAL.red : v.key === 'wreath' ? PAL.princessDark : PAL.redDark,
    },
  };
}

const CIT_POSES = {
  idle: (c) => { const b = Math.sin(TAU * (c.t / 2.7 + c.phase)); return { sq: 0.012 * b, shF: 13 + 2 * b, shB: -13 - 2 * b, look: 0.25 * noise1(c.t * 0.25, c.seed) }; },
  sweep: (c) => {
    const p = cyc(c, 0.8), s = Math.sin(p);
    const tF = [c.sp.bw * 1.2 + 12 * s, -c.sp.bodyTop * 0.3], tB = [c.sp.bw * 0.55 + 10 * s, -c.sp.bodyTop * 0.7];
    const [shF, elF] = c.ikF(tF, 1), [shB, elB] = c.ikB(tB, 1);
    return { prop: 'broom', lean: 9 + 3 * s, head: 5, lookY: 0.55, look: 0.4, shF, elF, shB, elB, hipF: 12, hipB: -14, knB: -6, item: s, armsFront: 1, expr: 'normal' };
  },
  push: (c) => {
    const p = cyc(c, 1.0), w = gait(p, 20, 26, 2.5);
    const G = [c.sp.bw + 20, -c.sp.bodyTop * 0.42];
    const [shF, elF] = c.ikF(G, 1), [shB, elB] = c.ikB(vadd(G, [-4, 3]), 1);
    return { ...w, prop: 'cart', lean: 13, head: -5, shF, elF, shB, elB, item: p, armsFront: 1, expr: 'normal' };
  },
  flee: (c) => {
    const p = cyc(c, 2.1), r = gait(p, 42, 70, 7, true);
    return { ...r, lean: 16, head: -8, shF: 150 + 22 * Math.sin(2 * p), elF: 28 + 22 * Math.sin(2 * p + 1), shB: -146 + 22 * Math.sin(2 * p + 2), elB: -26, expr: 'scared', sweat: 0.9 };
  },
  lean: (c) => {
    const chin = c.headPt([0.42, 0.86], 8);
    const [shF, elF] = c.ikF(chin, 1);
    return { lean: 20, head: 8, look: 0.75, lookY: 0.12, shF, elF, shB: -34, elB: 78, hipF: 8, hipB: -12, knB: -6, expr: 'curious' };
  },
  stepBack: (c) => ({ dx: -16, lean: -12, head: -9, shF: 62, elF: 76, shB: 52, elB: 86, hipF: 22, knF: -2, hipB: -20, knB: -8, expr: 'scared', sweat: 0.75 }),
  turnHead: (c) => ({ turn: 1, head: -6, lean: -3, shF: 18, shB: -10, look: 0.3, expr: 'surprise' }),
  blown: (c) => { const w = Math.sin(c.t * 9 + c.seed); return { lean: -18, head: -12, hairBack: 1, shF: -55 + 4 * w, elF: -26, shB: -72 + 4 * w, elB: -14, hipF: 24, hipB: -12, knB: -10, expr: 'blown', hatOff: 1 }; },
  cheer: (c) => { const p = cyc(c, 1.6), s = Math.sin(p); return { bob: 10 * Math.abs(s), sq: -0.05 * Math.cos(2 * p), shF: 150 + 10 * s, elF: 12, shB: -150 - 10 * s, elB: -12, shUpF: 5, shUpB: 5, strF: 1.15, strB: 1.15, head: -6, expr: 'happy' }; },
  raiseHand: (c) => {
    const b = Math.sin(TAU * (c.t / 2.2 + c.phase)), reach = (c.sp.arm.l1 + c.sp.arm.l2) * 1.32;
    const [shF, elF] = c.ikF([c.SF[0] + reach * 0.36, c.SF[1] - 9 - reach * (0.9 + 0.02 * b)], -1, 1.32, 9);
    return { shF, elF, shUpF: 9, strF: 1.32, shB: -18, elB: -8, head: -12, lookY: -0.85, look: 0.3, lean: -6, expr: 'hope', main: 'F' };
  },
  jawDrop: () => ({ jaw: 1, shF: 5, elF: 0, shB: -5, elB: 0, sq: 0.03, head: -4, expr: 'jawdrop' }),
  faintBack: (c) => ({ tilt: -88, tiltX: -c.sp.bw * 0.3, gy: -c.sp.bw * 0.82, shF: 40, elF: 6, shB: -40, elB: -6, hipF: 10, hipB: 4, head: -8, expr: 'faint', plant: 1 }),
  hugPot: (c) => {
    const w = Math.sin(c.t * 7 + c.seed) * 0.8;
    const sp = c.sp, r = sp.bw * 0.66, pc = [sp.bw * 0.62, -sp.bodyTop * 0.4];
    const [shF, elF] = c.ikF([pc[0] - 0.15 * r, pc[1] + 0.05 * r], 1);
    const [shB, elB] = c.ikB([pc[0] + 0.55 * r, pc[1] - 0.55 * r], 1);
    return { prop: 'pot', lean: -8 + w, head: -6, turn: 0.3, shF, elF, shB, elB, hipF: 8, hipB: -10, expr: 'grumpy' };
  },
  carryOverhead: (c) => {
    const p = cyc(c, 0.9), s = Math.sin(p), lift = 0.5 + 0.5 * s;
    const sp = c.sp, reach = sp.arm.l1 + sp.arm.l2;
    const up = [c.SF[0] + 16, c.SF[1] - reach * (0.74 + 0.16 * lift)];
    const lo = [up[0] - 1, up[1] + reach * 0.42];
    if (c.o.pole === false) return { bob: 4 + 7 * s, shF: 150 + 22 * lift, elF: -42 * (1 - lift), shUpF: 6, shB: -150 - 22 * lift, elB: 42 * (1 - lift), shUpB: 6, head: -12, lookY: -0.6, hipF: 6 + 8 * s, hipB: -6 + 8 * s, expr: 'happy' };
    const [shF, elF] = c.ikF(up, -1), [shB, elB] = c.ikB(lo, 1);
    return { prop: 'pole', poleUp: up, poleLo: lo, bob: 3 + 6 * s, shF, elF, shB, elB, head: -10, lookY: -0.7, look: 0.4, hipF: 6 + 8 * s, hipB: -6 + 8 * s, armsFront: 1, expr: 'happy' };
  },
  wave: (c) => {
    const p = cyc(c, 2.2), s = Math.sin(p), reach = c.sp.arm.l1 + c.sp.arm.l2;
    const [shF, elF] = c.ikF([c.SF[0] + reach * 1.12 * (0.42 + 0.22 * s), c.SF[1] - 7 - reach * 1.12 * (0.82 - 0.08 * Math.abs(s))], -1, 1.12, 7);
    return { shF, elF, shUpF: 7, strF: 1.12, shB: -16, elB: -10, head: -6, lean: -5, expr: 'smile', main: 'F' };
  },
  clap: (c) => {
    const p = cyc(c, 2.6), s = 0.5 + 0.5 * Math.sin(p);
    const T = [c.sp.bw * 0.95 + 6 * (1 - s), -c.sp.bodyTop * 0.62];
    const [shF, elF] = c.ikF(vadd(T, [5 * (1 - s), 0]), 1), [shB, elB] = c.ikB(vadd(T, [-5 * (1 - s) - 4, 0]), 1);
    return { shF, elF, shB, elB, bob: 2 * s, armsFront: 1, expr: 'happy' };
  },
  hideBarrel: (c) => ({ prop: 'barrel', shF: 6, elF: 0, shB: -6, elB: 0, look: 0.45 + 0.25 * Math.sin(c.t * 1.3 + c.seed), plant: 0, clipGround: true, expr: (c.o.peek ?? 1) > 0.5 ? 'scared' : { eyes: 'squint', mouth: 'flat', brows: 'worried' } }),
  pounce: () => ({ bob: 30, lean: 62, head: -34, shF: 172, elF: 4, shB: 164, elB: 10, hipF: -40, knF: -45, hipB: -62, knB: -30, plant: 0, expr: 'determined' }),
  deflate: () => ({ sq: -0.1, lean: 8, head: 14, shF: 4, elF: 0, shB: -4, elB: 0, hipF: 8, hipB: -8, knF: -6, knB: -6, lookY: 0.5, expr: 'relieved' }),
};
export const CITIZEN_POSES = Object.keys(CIT_POSES);

function hatColors(sp) { return { main: sp.colors.hat, second: sp.colors.hat2 }; }

/** 市民身体装饰（身体空间，已 clip 在身体内）。 */
function citizenBodyDeco(R, F) {
  const { sp } = F; const g = R.g;
  const bw = sp.bw, top = sp.bodyTop, below = sp.below;
  // 下摆滚边
  piece(R, rectPath(-2 * bw, below - 6, 4 * bw, 14), sp.courtier ? PAL.gold : sp.colors.trim, { part: 'body', under: false, rim: false });
  for (const a of sp.acc) {
    if (a === 'apron') {
      const p = jitPath([[-0.4 * bw, -0.47 * top], [0.95 * bw, -0.5 * top], [1.05 * bw, below + 4], [-0.5 * bw, below + 4]], sp.seed + 5, 1.5, true, 0.2);
      piece(R, p, PAL.white, { part: 'body', shade: [0.3 * bw, -0.1 * top, top * 0.5], shadeColor: PAL.stone2, rimW: 1.2 });
      piece(R, (() => { const q = new Path2D(); q.roundRect(0.2 * bw, -0.28 * top, 0.5 * bw, 0.2 * top, 3); return q; })(), PAL.paper2, { part: 'body', under: false, rimW: 0.8 });
      if (R.detail) strokePts(g, [[0.22 * bw, -0.255 * top], [0.68 * bw, -0.255 * top]], 1, rgba(PAL.stoneDark, 0.6), { cap: 'butt' });
      piece(R, rectPath(-2 * bw, -0.53 * top, 4 * bw, 0.06 * top), PAL.paper2, { part: 'body', under: false, rim: false });
    } else if (a === 'belt') {
      piece(R, rectPath(-2 * bw, -0.34 * top, 4 * bw, 0.09 * top), PAL.woodDark, { part: 'body', under: false, rimW: 0.8 });
      piece(R, (() => { const q = new Path2D(); q.roundRect(0.26 * bw, -0.355 * top, 0.24 * bw, 0.13 * top, 2); return q; })(), PAL.gold, { part: 'body', rimW: 0.7, rimColor: PAL.goldLight });
    } else if (a === 'vest') {
      const vc = mixHex(sp.colors.trim, PAL.ink, 0.12);
      piece(R, jitPath([[-1.3 * bw, -top * 1.1], [0.14 * bw, -top * 1.1], [0.1 * bw, -0.05 * top], [-0.1 * bw, below * 0.4], [-1.3 * bw, below * 0.4]], sp.seed + 7, 1.2, true, 0.15), vc, { part: 'body', rimW: 1, shade: [-0.5 * bw, -0.3 * top, top * 0.7] });
      piece(R, jitPath([[0.42 * bw, -top * 1.1], [1.4 * bw, -top * 1.1], [1.4 * bw, below * 0.4], [0.62 * bw, below * 0.4], [0.44 * bw, -0.05 * top]], sp.seed + 8, 1.2, true, 0.15), vc, { part: 'body', rimW: 1 });
      for (let i = 0; i < 3; i++) piece(R, ellPath(0.55 * bw, (-0.62 + i * 0.22) * top, 2.2, 2.2), PAL.gold, { part: 'body', under: false, rimW: 0.5 });
    } else if (a === 'shawl') {
      const shc = sp.grandma ? mixHex(PAL.princessLight, PAL.paper, 0.4) : mixHex(PAL.princessDark, FOLK_PASTELS[sp.v.body], 0.45);
      const p = jitPath([[-1.2 * bw, -top * 1.05], [1.2 * bw, -top * 1.05], [1.05 * bw, -0.66 * top], [0.35 * bw, -0.3 * top], [-0.4 * bw, -0.58 * top], [-1.1 * bw, -0.7 * top]], sp.seed + 9, 1.4, true, 0.45);
      piece(R, p, shc, { part: 'body', rimW: 1.1, shade: [0, -0.7 * top, top * 0.5] });
      if (R.detail) for (let i = 0; i < 7; i++) { const u = i / 6; const q = vlerp([-0.4 * bw, -0.58 * top], [0.35 * bw, -0.3 * top], u * 0.5); const q2 = vlerp([0.35 * bw, -0.3 * top], [1.05 * bw, -0.66 * top], u); strokePts(g, [vadd(i < 4 ? q : q2, [0, 0]), vadd(i < 4 ? q : q2, [0, 4])], 1.4, darken(shc, 0.2)); }
    } else if (a === 'collar') {
      for (const sx of [-1, 1]) piece(R, ellPath(sx * 0.32 * bw + 0.08 * bw, -0.93 * top, 0.36 * bw, 0.17 * top, sx * 0.25), PAL.white, { part: 'body', rimW: 0.9 });
    } else if (a === 'patch') {
      g.save(); g.translate(0.25 * bw, -0.4 * top); g.rotate(0.14);
      const q = new Path2D(); q.roundRect(-0.22 * bw, -0.22 * bw, 0.44 * bw, 0.44 * bw, 2);
      piece(R, q, PAL.kraft, { part: 'body', rimW: 0.8 });
      if (R.detail) { g.setLineDash([2.2, 2]); g.lineWidth = 0.9; g.strokeStyle = PAL.woodDark; g.strokeRect(-0.17 * bw, -0.17 * bw, 0.34 * bw, 0.34 * bw); g.setLineDash([]); }
      g.restore();
    } else if (a === 'buttons') {
      for (let i = 0; i < 2; i++) piece(R, ellPath(0.3 * bw, (-0.8 + i * 0.16) * top, 2.2, 2.2), PAL.paper, { part: 'body', under: false, rimW: 0.5 });
    }
  }
  if (sp.courtier) {
    const p = jitPath([[-1.2 * bw, -0.95 * top], [-0.8 * bw, -1.1 * top], [1.25 * bw, -0.15 * top], [1.1 * bw, 0.05 * top]], sp.seed + 13, 1, true, 0.3);
    piece(R, p, PAL.gold, { part: 'body', rimColor: PAL.goldLight, rimW: 1, shade: [0.5 * bw, -0.3 * top, top * 0.4], shadeColor: PAL.goldDark });
  }
  if (sp.villager) {
    piece(R, jitPath([[-0.3 * bw, -top], [0.62 * bw, -top], [0.18 * bw, -0.72 * top]], sp.seed + 14, 1, true, 0.3), PAL.grass, { part: 'body', rimW: 0.8 });
  }
}
function citizenBodyOver(R, F) {
  const { sp } = F;
  if (sp.courtier) {
    const top = sp.bodyTop, hr = sp.hr;
    const p = new Path2D();
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const r = 1 + 0.09 * Math.abs(Math.sin(a * 6.5));
      const x = Math.cos(a) * hr * 1.0 * r + 1.5, y = -top + 2 + Math.sin(a) * hr * 0.3 * r;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    piece(R, p, PAL.white, { part: 'body', rimW: 1, shade: [0, -top, hr], shadeColor: PAL.stone2, shadeA: 0.35 });
    if (R.detail && !R.sil) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.2; strokePts(R.g, [[1.5 + Math.cos(a) * hr * 0.3, -top + 2 + Math.sin(a) * hr * 0.09], [1.5 + Math.cos(a) * hr * 0.98, -top + 2 + Math.sin(a) * hr * 0.29]], 0.9, rgba(PAL.stoneDark, 0.35)); }
  }
}

function drawBroom(R, F) {
  const a = F.armB.h, b = F.armF.h;
  const d = vsub(b, a), l = Math.hypot(d[0], d[1]) || 1, u = [d[0] / l, d[1] / l];
  const ground = -F.oy;
  const k = u[1] > 0.2 ? (ground - 2 - 25 * u[1] - a[1]) / u[1] : 120;
  const top = vsub(a, vmul(u, 18)), end = vadd(a, vmul(u, Math.max(40, k)));
  piece(R, limbPath([top, end], [2.4, 2.4]), PAL.wood, { part: 'item', rimW: 0.8 });
  const n = [-u[1], u[0]];
  const head = [vadd(end, vmul(n, 6)), vadd(end, vmul(n, -6)), vadd(vadd(end, vmul(u, 24)), vmul(n, -15)), vadd(vadd(end, vmul(u, 26)), vmul(n, 14))];
  const hp = jitPath(head, 31, 1.5, true, 0.25);
  piece(R, hp, PAL.sand, { part: 'item', rimW: 1, shade: [end[0], end[1], 22], shadeColor: PAL.earth });
  if (R.detail && !R.sil) {
    for (let i = -2; i <= 2; i++) strokeIn(R.g, hp, [vadd(end, vmul(n, i * 3)), vadd(vadd(end, vmul(u, 26)), vmul(n, i * 5.5))], 0.8, rgba(PAL.earth, 0.7));
    piece(R, limbPath([vadd(end, vmul(n, 7)), vadd(end, vmul(n, -7))], [2.2, 2.2]), PAL.redDark, { part: 'item', under: false, rimW: 0.6 });
  }
}
function drawCart(R, F) {
  const sp = F.sp;
  const G = F.bf([sp.bw + 20, -sp.bodyTop * 0.42]);
  const ground = -F.oy;
  const bx0 = G[0] + 16, bx1 = G[0] + 92, by1 = ground - 18, by0 = by1 - 30;
  const wheel = [bx0 + 52, ground - 14];
  // 把手
  piece(R, limbPath([G, [bx0 + 4, by0 + 6]], [2.4, 2.6]), PAL.wood, { part: 'item', rimW: 0.8 });
  // 苹果
  const ap = [[bx0 + 14, by0 - 4], [bx0 + 30, by0 - 7], [bx0 + 46, by0 - 5], [bx0 + 62, by0 - 3], [bx0 + 22, by0 - 16], [bx0 + 38, by0 - 18], [bx0 + 54, by0 - 14]];
  ap.forEach(([x, y], i) => { piece(R, ellPath(x, y, 8, 7.6), i % 3 === 1 ? PAL.heart : PAL.red, { part: 'item', rimW: 0.9, underK: 0.5 }); if (R.detail && !R.sil) strokePts(R.g, [[x, y - 7], [x + 1.5, y - 10]], 1.3, PAL.woodDark); });
  // 车斗
  const box = jitPath([[bx0, by0], [bx1, by0 - 2], [bx1 - 4, by1], [bx0 + 4, by1]], 33, 1.2, true, 0.1);
  piece(R, box, PAL.wood, { part: 'item', rimW: 1.2, shade: [bx1, by1, 50] });
  if (R.detail && !R.sil) for (let i = 1; i < 3; i++) strokeIn(R.g, box, [[bx0, by0 + i * 10], [bx1, by0 + i * 10 - 1]], 1.2, rgba(PAL.woodDark, 0.6));
  // 轮子
  const rot = (F.J.item || 0) * 1.4;
  piece(R, ellPath(wheel[0], wheel[1], 14, 14), PAL.woodDark, { part: 'item', rimW: 1, rimColor: PAL.wood });
  if (!R.sil) {
    piece(R, ellPath(wheel[0], wheel[1], 9.5, 9.5), PAL.wood, { part: 'item', under: false, rim: false });
    for (let i = 0; i < 4; i++) { const a = rot + (i * Math.PI) / 4; strokePts(R.g, [[wheel[0] - Math.cos(a) * 9, wheel[1] - Math.sin(a) * 9], [wheel[0] + Math.cos(a) * 9, wheel[1] + Math.sin(a) * 9]], 1.8, PAL.woodDark); }
    fillEll(R.g, wheel[0], wheel[1], 3, 3, 0, PAL.gold);
  }
}
function drawPotAt(R, x, y, r, seed = 3) {
  const col = mixHex(PAL.earth, PAL.roofRed, 0.35);
  const p = jitPath([[-0.36 * r, -1.08 * r], [0.36 * r, -1.08 * r], [0.32 * r, -0.86 * r], [0.95 * r, -0.4 * r], [1.0 * r, 0.2 * r], [0.7 * r, 0.82 * r], [0, 0.98 * r], [-0.7 * r, 0.82 * r], [-1.0 * r, 0.2 * r], [-0.95 * r, -0.4 * r], [-0.32 * r, -0.86 * r]].map(([px, py]) => [x + px, y + py]), seed, r * 0.03, true, 0.5);
  piece(R, p, col, { part: 'item', shade: [x + 0.2 * r, y, r * 1.2], rimColor: lighten(col, 0.4) });
  if (R.detail && !R.sil) {
    const zz = [];
    for (let i = 0; i <= 10; i++) zz.push([x + (-0.92 + i * 0.184) * r, y + (-0.12 + (i % 2) * 0.14) * r]);
    strokeIn(R.g, p, zz, r * 0.07, PAL.paper2);
  }
  piece(R, ellPath(x, y - 1.06 * r, 0.42 * r, 0.1 * r), darken(col, 0.12), { part: 'item', under: false, rimW: 0.8 });
  fillEll(R.g, x, y - 1.06 * r, 0.3 * r, 0.06 * r, 0, colorOf(R, PAL.woodDark, 'item'));
}
function drawBarrelAt(R, x, ground, w, h, seed = 9) {
  const g = R.g;
  const p = jitPath([[-0.46 * w, -h], [0.46 * w, -h], [0.52 * w, -h * 0.5], [0.46 * w, 0], [-0.46 * w, 0], [-0.52 * w, -h * 0.5]].map(([px, py]) => [x + px, ground + py]), seed, 1.2, true, 0.35);
  piece(R, p, PAL.wood, { part: 'item', shade: [x + 0.2 * w, ground - h * 0.4, w], rimColor: lighten(PAL.wood, 0.35) });
  if (!R.sil) {
    if (R.detail) for (let i = -2; i <= 2; i++) strokeIn(g, p, [[x + i * 0.2 * w, ground - h], [x + i * 0.23 * w, ground - h * 0.5], [x + i * 0.2 * w, ground]], 1.2, rgba(PAL.woodDark, 0.55));
    for (const fy of [0.2, 0.78]) strokeIn(g, p, [[x - 0.6 * w, ground - h * fy], [x + 0.6 * w, ground - h * fy - 1]], h * 0.07, PAL.stoneDark);
  }
  piece(R, ellPath(x, ground - h, 0.47 * w, 0.09 * w), darken(PAL.wood, 0.1), { part: 'item', under: false, rimW: 1 });
  fillEll(g, x, ground - h + 0.01 * w, 0.4 * w, 0.065 * w, 0, colorOf(R, darken(PAL.woodDark, 0.25), 'item'));
}
/** 苹果篮（锚在篮底中心）。spill 0..1：倾倒程度（苹果滚出），rot 弧度。 */
export function drawAppleBasket(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, spill = 0, detail = 1, t = 0 } = o;
  const R = { g, detail, face: 1, t, seed: 77, sil: false, silColor: PAL.ink, keep: new Set(), ul: detail ? 1.6 : 0, rimW: 1.2 };
  g.save();
  g.translate(x, y); g.scale(s, s);
  // 滚出的苹果（地面上，篮子之外）
  for (let i = 0; i < 5; i++) {
    const k = clamp(spill * 1.4 - i * 0.12);
    if (k <= 0) continue;
    const ax = (-26 - i * 16 - hash2(3, i) * 8) * outCubic(k), ay = -7 - 30 * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k) * 0.6;
    piece(R, ellPath(ax, ay, 7, 6.6, k * 6), i % 2 ? PAL.heart : PAL.red, { part: 'item', rimW: 0.8 });
  }
  g.rotate(rot - spill * 1.2);
  const body = jitPath([[-20, -24], [20, -24], [16, 0], [-16, 0]], 41, 1, true, 0.25);
  if (spill < 0.5) for (let i = 0; i < 4; i++) piece(R, ellPath(-12 + i * 8, -26 - (i % 2) * 5, 7, 6.6), i % 2 ? PAL.heart : PAL.red, { part: 'item', rimW: 0.8, underK: 0.5 });
  piece(R, body, PAL.sand, { part: 'item', shade: [6, -6, 26], shadeColor: PAL.earth });
  if (detail) for (let i = 1; i < 4; i++) strokeIn(g, body, [[-20, -24 + i * 6], [20, -24 + i * 6]], 1.2, rgba(PAL.earth, 0.7));
  const hp = new Path2D(); hp.ellipse(0, -24, 16, 18, 0, Math.PI, TAU);
  g.lineWidth = 2.6; g.strokeStyle = PAL.earth; g.stroke(hp);
  g.restore();
}

function drawCane(R, F) {
  const h = F.armB.h, ground = -F.oy;
  const tip = [h[0] - 4, ground];
  piece(R, limbPath([[h[0] + 2, h[1] - 4], tip], [2.4, 2.2]), PAL.woodDark, { part: 'item', rimW: 0.8, rimColor: PAL.wood });
  const hook = new Path2D(); hook.arc(h[0] + 8, h[1] - 4, 6, Math.PI, TAU);
  R.g.save(); R.g.lineWidth = 4.6; R.g.strokeStyle = colorOf(R, PAL.woodDark, 'item'); R.g.lineCap = 'round'; R.g.stroke(hook); R.g.restore();
}

/** 豆形市民。见 FOLK_VARIANTS / CITIZEN_POSES 与 docs/api/folk.md。 */
export function drawCitizen(g, o = {}) {
  const sp = citizenSpec(o);
  const c = poseCtx(o, sp);
  const J = resolvePose(CIT_POSES, o.pose || 'idle', c);
  jitterJ(J, c, o);
  if (sp.grandma) { J.lean += 7; J.head -= 4; }
  // 手里的篮子（flee 时常用）：持篮的前手放下来
  const drop = o.dropItem;
  if (drop === true || (typeof drop === 'number' && drop < 0.35)) {
    const k = drop === true ? 1 : 1 - drop / 0.35;
    J.shF = lerp(J.shF, 28, k); J.elF = lerp(J.elF, 18, k);
  }
  // 躲桶：下沉到桶里，只露头顶（peek 0..1）
  let barrel = null;
  if (J.prop === 'barrel') {
    const peek = clamp(o.peek ?? 1);
    const bh = sp.H * 0.56, bwid = sp.bw * 2 + 22;
    const headY = -(sp.H - sp.hr);
    const target = -bh - sp.hr * (0.05 + 0.75 * peek);
    J.bob = -(target - headY);
    barrel = { bh, bwid, peek };
  }
  applyJoints(J, o.joints, o.jointsSet);
  const E = exprOf(o.expr || J.expr || (sp.grandma ? 'smile' : 'normal'));
  const hat = o.hat === false ? null : sp.hat;
  const st = HAIR[sp.hair] || {};
  const hatDef = hat ? HATS[hat] : null;
  const hatC = hatColors(sp);
  // 兜帽（fly:false）不会飞：hatFly > 0 时改为被吹落、垂在脖子后（与 hat:false 同一画法），不再整顶消失
  const canFly = !!(hatDef && hatDef.fly);
  const hoodDown = sp.hat === 'hood' && (o.hat === false || (!canFly && o.hatFly > 0));
  const hatOn = hat && !hoodDown && !(canFly && o.hatFly > 0) && !(J.hatOff > 0.5 && canFly && o.hatFly == null);
  const hk = {
    bodyDeco: citizenBodyDeco,
    bodyOver: citizenBodyOver,
    afterBody: (R, F) => {
      // 兜帽放下：垂在脖子后
      if (hoodDown) {
        const n = F.N;
        piece(R, jitPath([[n[0] - 26, n[1] - 4], [n[0] + 18, n[1] - 8], [n[0] + 24, n[1] + 6], [n[0] - 6, n[1] + 14], [n[0] - 30, n[1] + 10]], sp.seed + 3, 1.5, true, 0.5), darken(sp.colors.hat, 0.1), { part: 'hat', rimW: 1 });
      }
    },
    backHand: (R, F) => { if (sp.grandma && J.prop !== 'pot') drawCane(R, F); },
    headBack: (R, F) => {
      drawHairBack(R, F, sp.hr, sp.hair, sp.colors.hair);
      if (hatOn && hatDef.back) drawHatAt(R, sp.hr, hat, hatC, 'back');
    },
    hairCap: (R, F) => drawHairFront(R, F, sp.hr, sp.hair, sp.colors.hair),
    showEar: () => !(st.ear === false || (hatOn && hatDef.cover)),
    headFront: (R, F) => {
      if (sp.v.beard) {
        // 络腮胡：沿下颌的一道月牙，嘴留在外面
        const hr = sp.hr, jw = F.J.jaw * sp.jawPx / hr;
        const bp = jitPath(U([[-0.66, 0.02], [-0.7, 0.5], [-0.38, 0.96 + jw], [0.2, 1.1 + jw], [0.72, 0.86 + jw * 0.8], [0.98, 0.32], [0.98, 0.06], [0.82, 0.3], [0.56, 0.6 + jw * 0.6], [0.2, 0.66 + jw * 0.9], [-0.18, 0.6 + jw * 0.6], [-0.46, 0.3]], hr), sp.seed + 2, hr * 0.03, true, 0.5);
        piece(R, bp, sp.colors.hair, { part: 'hair', rimW: 1, rimColor: lighten(sp.colors.hair, 0.3) });
      }
      if (hatOn) drawHatAt(R, sp.hr, hat, hatC, 'front');
    },
    frontHand: (R, F) => {
      if (J.prop === 'broom') drawBroom(R, F);
      if (J.prop === 'pole') {
        const a = F.bf(J.poleUp), b = F.bf(J.poleLo);
        const d = vsub(a, b), l = Math.hypot(d[0], d[1]) || 1, u = [d[0] / l, d[1] / l];
        const top = vadd(a, vmul(u, 62)), bot = vsub(b, vmul(u, 30));
        piece(R, hosePath([bot, top], [2.6, 2.4]), PAL.wood, { part: 'item', rimW: 0.8 });
        piece(R, ellPath(top[0], top[1], 4.2, 4.2), PAL.gold, { part: 'item', rimW: 0.6, rimColor: PAL.goldLight });
        F.anchors.carry = F.W(top);
      }
      if (drop === true || (typeof drop === 'number' && drop < 0.999)) {
        const h = F.armF.h;
        const p = drop === true ? 0 : clamp(drop);
        const fall = clamp(p / 0.6);
        const bx = h[0] - 70 * outQuad(fall) - 30 * Math.max(0, p - 0.6);
        const gy = -F.oy;
        const by = lerp(h[1] + 30, gy, inQuad(fall));
        drawAppleBasket(R.g, { x: bx, y: by, s: 0.85, rot: -fall * 0.9, spill: Math.max(0, (p - 0.55) / 0.45), detail: R.detail, t: F.t });
        F.anchors.item = F.W([bx, by]);
      }
    },
    afterHead: (R, F) => {
      if (J.prop === 'pot') {
        const sp2 = F.sp;
        const c2 = F.bf([sp2.bw * 0.62, -sp2.bodyTop * 0.4]);
        drawPotAt(R, c2[0], c2[1], sp2.bw * 0.66);
      }
    },
    front: (R, F) => {
      if (J.prop === 'cart') drawCart(R, F);
      if (barrel) {
        const ground = -F.oy;
        drawBarrelAt(R, J.dx + 4, ground, barrel.bwid, barrel.bh, sp.seed);
        if (barrel.peek > 0.35) {
          const a = clamp((barrel.peek - 0.35) / 0.3);
          for (const sx of [-1, 1]) {
            const hp = [J.dx + 4 + sx * barrel.bwid * 0.28, ground - barrel.bh - 2];
            R.g.save(); R.g.globalAlpha *= a;
            piece(R, ellPath(hp[0], hp[1], sp.arm.hand, sp.arm.hand * 0.86), sp.colors.skin, { part: 'armF', rimW: 0.8 });
            R.g.restore();
          }
        }
      }
    },
    overlay: (R, F) => {
      if (hat && hatDef.fly) {
        if (o.hatFly != null && o.hatFly > 0 && o.hatFly < 1) flyingHat(R, F, hat, hatC, o.hatFly, o.hatMode || 'blow');
        else if (J.hatOff > 0.5 && o.hatFly == null && o.hat !== false) flyingHat(R, F, hat, hatC, 0.12, 'blow');
      }
    },
    topH: () => (hatOn ? hatDef.top : st.none ? 1.0 : st.bun ? 1.42 : (st.puff || 1.05) + (st.cy ? -st.cy : 0)),
    anchors: (F, out) => { if (hatOn && !out.hat) { const p = F.hf(U([HAT_ANCHOR], sp.hr)[0]); out.hat = [...F.W(p), F.headAng * D]; } },
  };
  return renderPuppet(g, o, sp, J, E, hk);
}

// ———————————————————— 卫兵 ————————————————————
const GUARD_SKIN = [PAL.skin, SKIN.tan, SKIN.deep];
function guardSpec(o) {
  const vi = (((o.variant ?? 0) % 3) + 3) % 3;
  const H = 156, hr = 32, L = 24;
  const bodyTop = H - L - 1.82 * hr;
  return {
    kind: 'guard', vi, seed: (o.seed ?? vi * 11 + 5) + 101, H, hr, L, bodyTop, below: 10, bw: 33, flare: 1.02, belly: 0.15,
    shX: 33 * 0.86, shY: bodyTop * 0.82, headX: 1.5, legSep: 12, jawPx: 30,
    arm: { l1: 19, l2: 21, r0: 7.2, r1: 6.2, r2: 5.4, hand: 6.6, cuff: PAL.gold },
    leg: { l1: 12, l2: 12, r: 6.8, foot: [21, 10] }, legStripe: PAL.red,
    stache: vi === 1 ? null : vi === 2 ? 'walrus' : 'curl', nose: true, browW: 1.3,
    colors: { body: PAL.red, trim: PAL.redDark, sleeve: PAL.red, legs: PAL.heroBlueDark, shoes: PAL.ink, skin: GUARD_SKIN[vi], hair: vi === 2 ? PAL.woodDark : PAL.heroHair },
  };
}
const GUARD_POSES = {
  attention: (c) => { const b = Math.sin(TAU * (c.t / 3 + c.phase)); return { shF: 26, elF: 62, shB: -4, elB: -4, head: -3, sq: 0.008 * b, spear: 0, expr: 'stern' }; },
  idle: (c) => { const b = Math.sin(TAU * (c.t / 3 + c.phase)); return { shF: 26, elF: 62, shB: -8, elB: -6, sq: 0.01 * b, spear: 0, expr: 'normal' }; },
  cheer: (c) => { const p = cyc(c, 1.7), s = Math.sin(p); return { bob: 9 * Math.abs(s), sq: -0.04 * Math.cos(2 * p), shF: 158 + 8 * s, elF: 8, shB: -150 - 8 * s, elB: -18, spear: 6 * s, grip: 0.42, head: -6, expr: 'happy' }; },
  whistle: (c) => { const b = Math.sin(c.t * 1.7 + c.seed); return { turn: 0.86, head: -10 + 2 * b, lookY: -0.7, look: 0.5, shF: 26, elF: 60, shB: -14, elB: -8, spear: -9, lean: -3, expr: 'whistle' }; },
  lean: () => ({ lean: 12, head: 6, shF: 32, elF: 58, shB: -6, elB: -6, spear: 10, expr: 'curious' }),
  stepBack: () => ({ dx: -14, lean: -10, head: -8, shF: 52, elF: 48, shB: 46, elB: 70, hipF: 20, hipB: -18, knB: -6, spear: -30, grip: 0.4, armsFront: 1, expr: 'scared', sweat: 0.7 }),
  blown: (c) => { const w = Math.sin(c.t * 9 + c.seed); return { lean: -16, head: -10, hairBack: 1, shF: 8 + 3 * w, elF: 44, shB: -64 + 3 * w, elB: -18, hipF: 22, hipB: -12, knB: -8, spear: -24, expr: 'blown', hatOff: 1 }; },
  tossHat: () => ({ shF: 168, elF: 8, shUpF: 6, shB: 24, elB: 58, head: -12, lookY: -0.85, look: 0.3, spear: 0, spearHand: 'B', expr: 'laugh', main: 'F' }),
  // —— 收尾补充（storyboard 用到、assets.md 未列）——
  /** 举手（b07 V03 市民 / 传令官 / 卫兵一起举手放光点）：持矛的前手顺着矛杆举高（矛尾仍拄地，从 attention 插值过来矛不换手），hand = 前手。 */
  raiseHand: (c) => {
    const b = Math.sin(TAU * (c.t / 2.2 + c.phase)), reach = (c.sp.arm.l1 + c.sp.arm.l2) * 1.4;
    const [shF, elF] = c.ikF([c.SF[0] + reach * 0.4, c.SF[1] - 8 - reach * (0.95 + 0.02 * b)], -1, 1.4, 8);
    return { shF, elF, shUpF: 8, strF: 1.4, shB: -8, elB: -6, spear: 0, head: -10, lookY: -0.85, look: 0.3, lean: -5, expr: 'hope', main: 'F' };
  },
  /** 扑上去捂嘴（b06 57.60 所有人扑向国王）：整个人前扑腾空，长矛扔掉（spear:false 不画矛）。 */
  pounce: () => ({ bob: 30, lean: 62, head: -34, shF: 172, elF: 4, shB: 164, elB: 10, hipF: -40, knF: -45, hipB: -62, knB: -30, plant: 0, spear: false, expr: 'determined' }),
  /** 下巴掉下来（b17 O07 全场下巴掉地），长矛照常立着。 */
  jawDrop: () => ({ jaw: 1, shF: 26, elF: 62, shB: -5, elB: 0, sq: 0.03, head: -4, spear: 0, expr: 'jawdrop' }),
};
export const GUARD_POSES_LIST = Object.keys(GUARD_POSES);

function drawSpear(R, F) {
  const J = F.J, sp = F.sp;
  const h = J.spearHand === 'B' ? F.armB.h : F.armF.h;
  const a = (J.spear || 0) + (F.o.spearAngle || 0);
  const u = [Math.sin(a * D), -Math.cos(a * D)];
  const Ls = 250;
  let gp = J.grip;
  if (gp == null || gp === 0) gp = clamp((-F.oy - h[1]) / (Ls * Math.max(0.3, Math.cos(a * D))), 0.06, 0.7);
  const butt = vsub(h, vmul(u, Ls * gp)), tip = vadd(h, vmul(u, Ls * (1 - gp)));
  piece(R, limbPath([butt, tip], [2.8, 2.6]), PAL.woodDark, { part: 'item', rimW: 1, rimColor: PAL.wood });
  const n = [-u[1], u[0]];
  // 小旗（在杆后侧，随风抖）
  const fb = vsub(tip, vmul(u, 26));
  const wv = Math.sin(F.t * 7 + sp.seed) * 3;
  const fl = jitPath([fb, vadd(fb, vmul(u, -1)), vadd(vadd(fb, vmul(n, -30)), vmul(u, -4 + wv)), vadd(vadd(fb, vmul(n, -22)), vmul(u, -11 + wv * 0.5)), vadd(vadd(fb, vmul(n, -30)), vmul(u, -18 + wv)), vsub(fb, vmul(u, 19))], sp.seed + 4, 0.8, true, 0.2);
  piece(R, fl, PAL.redDark, { part: 'item', rimW: 0.8 });
  piece(R, limbPath([vsub(tip, vmul(u, 4)), vsub(tip, vmul(u, 0))], [4.2, 4.2]), PAL.gold, { part: 'item', rimW: 0.6, under: false });
  const blade = jitPath([tip, vadd(vadd(tip, vmul(u, 11)), vmul(n, 6)), vadd(tip, vmul(u, 30)), vadd(vadd(tip, vmul(u, 11)), vmul(n, -6))], sp.seed + 6, 0.5, true, 0.25);
  piece(R, blade, PAL.steel, { part: 'item', rimW: 0.8, rimColor: PAL.white });
  if (!R.sil) { R.g.save(); R.g.clip(blade); R.g.fillStyle = rgba(PAL.steelDark, 0.6); R.g.beginPath(); R.g.moveTo(tip[0], tip[1]); R.g.lineTo(...vadd(tip, vmul(u, 30))); R.g.lineTo(...vadd(vadd(tip, vmul(u, 11)), vmul(n, -7))); R.g.closePath(); R.g.fill(); R.g.restore(); }
  F.anchors.spearTip = F.W(vadd(tip, vmul(u, 30)));
}
function guardBodyDeco(R, F) {
  const { sp } = F; const bw = sp.bw, top = sp.bodyTop, below = sp.below;
  piece(R, rectPath(-2 * bw, below - 8, 4 * bw, 16), PAL.redDark, { part: 'body', under: false, rim: false });
  // 白色斜挎带
  piece(R, jitPath([[-1.0 * bw, -1.05 * top], [-0.62 * bw, -1.1 * top], [1.15 * bw, -0.12 * top], [0.82 * bw, -0.02 * top]], sp.seed + 2, 1, true, 0.2), PAL.paper, { part: 'body', rimW: 0.9, shade: [0.5 * bw, -0.2 * top, top * 0.4], shadeColor: PAL.stone2 });
  // 腰带
  piece(R, rectPath(-2 * bw, -0.3 * top, 4 * bw, 0.1 * top), PAL.ink, { part: 'body', under: false, rimW: 0.8, rimColor: PAL.inkSoft });
  piece(R, (() => { const q = new Path2D(); q.roundRect(0.18 * bw, -0.32 * top, 0.3 * bw, 0.14 * top, 2); return q; })(), PAL.gold, { part: 'body', rimW: 0.7, rimColor: PAL.goldLight });
  for (let i = 0; i < 3; i++) piece(R, ellPath(0.3 * bw, (-0.86 + i * 0.18) * top, 2.6, 2.6), PAL.gold, { part: 'body', under: false, rimW: 0.6, rimColor: PAL.goldLight });
}
function guardBodyOver(R, F) {
  const { sp } = F;
  for (const sx of [-1, 1]) {
    const x = sx > 0 ? sp.shX : -sp.shX * 0.94, y = -sp.shY - 6;
    const p = ellPath(x, y, 10, 5.5, sx * 0.25);
    piece(R, p, sx > 0 ? PAL.gold : darken(PAL.gold, 0.12), { part: 'body', rimW: 0.8, rimColor: PAL.goldLight });
    if (R.detail && !R.sil) for (let i = -2; i <= 2; i++) strokePts(R.g, [[x + i * 3.6, y + 4], [x + i * 3.8, y + 9]], 1.3, PAL.goldDark);
  }
}

/** 卫兵：高帽 + 长矛。hat:false = 不戴帽（L08 后的王座厅）。 */
export function drawGuard(g, o = {}) {
  const sp = guardSpec(o);
  const c = poseCtx(o, sp);
  const J = resolvePose(GUARD_POSES, o.pose || 'attention', c);
  jitterJ(J, c, { jitter: (o.jitter ?? 1) * 0.5 });
  applyJoints(J, o.joints, o.jointsSet);
  const E = exprOf(o.expr || J.expr || 'stern');
  const hatC = { main: mixHex(PAL.ink, PAL.dragonDeep, 0.2), plume: PAL.ermine };
  const tossing = J._pose === 'tossHat' && o.hatFly != null && o.hatFly > 0 && o.hatFly < 1;
  const hatOn = o.hat !== false && !(o.hatFly > 0 && o.hatFly < 1) && !(J.hatOff > 0.5 && o.hatFly == null);
  const hk = {
    bodyDeco: guardBodyDeco,
    bodyOver: guardBodyOver,
    headBack: (R, F) => drawHairBack(R, F, sp.hr, 'short', sp.colors.hair),
    hairCap: (R, F) => drawHairFront(R, F, sp.hr, 'short', sp.colors.hair),
    showEar: () => true,
    headFront: (R) => { if (hatOn) drawHatAt(R, sp.hr, 'busby', hatC, 'front'); },
    backHand: (R, F) => { if (J.spearHand === 'B' && J.spear !== false) drawSpear(R, F); },
    frontHand: (R, F) => { if (J.spearHand !== 'B' && J.spear !== false) drawSpear(R, F); },
    overlay: (R, F) => {
      if (o.hat === false) return;
      if (o.hatFly != null && o.hatFly > 0 && o.hatFly < 1) flyingHat(R, F, 'busby', hatC, o.hatFly, tossing || J._pose === 'tossHat' ? 'toss' : o.hatMode || 'blow');
      else if (J.hatOff > 0.5 && o.hatFly == null) flyingHat(R, F, 'busby', hatC, 0.12, 'blow');
    },
    topH: () => (hatOn ? 2.42 : 1.05),
    anchors: (F, out) => {
      out.note = F.W(F.hf([F.fx + 0.4 * sp.hr, 0.2 * sp.hr]));
      if (hatOn && !out.hat) { const p = F.hf(U([HAT_ANCHOR], sp.hr)[0]); out.hat = [...F.W(p), F.headAng * D]; }
    },
  };
  return renderPuppet(g, o, sp, J, E, hk);
}

// ———————————————————— 书记官 ————————————————————
function scribeSpec(o) {
  const H = 174, hr = 32, L = 18;
  const bodyTop = H - L - 1.82 * hr;
  const robe = mixHex(PAL.forest, PAL.crystal, 0.22);
  return {
    kind: 'scribe', seed: (o.seed ?? 3) + 201, H, hr, L, bodyTop, below: 14, bw: 29, flare: 1.3, belly: 0.1,
    shX: 29 * 0.84, shY: bodyTop * 0.8, headX: 2, legSep: 8, jawPx: 28,
    arm: { l1: 22, l2: 23, r0: 6.6, r1: 6.4, r2: 9.2, hand: 6.2, cuff: PAL.paper },
    leg: { l1: 9, l2: 9, r: 5.2, foot: [20, 8] },
    glasses: true, nose: true,
    colors: { body: robe, trim: darken(robe, 0.25), sleeve: robe, legs: PAL.inkSoft, shoes: PAL.redDeep, skin: PAL.skin, hair: PAL.stone, hat: PAL.inkSoft },
  };
}
const SCRIBE_POSES = {
  idle: (c) => { const b = Math.sin(TAU * (c.t / 2.9 + c.phase)); return { lean: 4, shF: 30, elF: 70, shB: 40, elB: 64, hold: 'notebook', sq: 0.01 * b, armsFront: 1, expr: 'normal' }; },
  write: (c) => {
    const k = c.t * 7;
    const sc = [Math.sin(k) * 4 + Math.sin(k * 2.3) * 2, Math.cos(k * 1.7) * 2];
    const desk = !!c.o.desk;
    const T = desk ? [c.sp.bw + 14 + sc[0], -c.sp.bodyTop * 0.48 + sc[1]] : [c.sp.bw * 0.7 + sc[0], -c.sp.bodyTop * 0.6 + sc[1]];
    const [shF, elF] = c.ikF(T, 1);
    const [shB, elB] = desk ? c.ikB([c.sp.bw + 2, -c.sp.bodyTop * 0.46], 1) : [40, 64];
    return { lean: 9, head: 14, lookY: 0.75, look: 0.4, shF, elF, shB, elB, hold: desk ? null : 'notebook', armsFront: 1, expr: 'focused' };
  },
  crossOut: (c) => {
    const p = actP(c, 1.6);
    const sp = c.sp;
    const A1 = [sp.bw * 0.35, -sp.bodyTop * 0.98], B1 = [sp.bw * 1.6, -sp.bodyTop * 0.22];
    const A2 = [sp.bw * 1.55, -sp.bodyTop * 0.98], B2 = [sp.bw * 0.3, -sp.bodyTop * 0.22];
    const T = p < 0.45 ? vlerp(A1, B1, outCubic(p / 0.45)) : p < 0.55 ? vlerp(B1, A2, inOutSine((p - 0.45) / 0.1)) : vlerp(A2, B2, outCubic((p - 0.55) / 0.45));
    const [shF, elF] = c.ikF(T, 1);
    return { lean: 6, head: 4, look: 0.6, shF, elF, shB: 40, elB: 64, hold: 'notebook', armsFront: 1, expr: 'determined' };
  },
  quillSnap: (c) => ({ shF: 62, elF: 72, shB: 48, elB: 70, head: 4, lean: -4, hold: 'notebook', snap: actP(c, 1.4), armsFront: 1, expr: 'shock', sweat: 0.6 }),
  run: (c) => { const p = cyc(c, 2.0), r = gait(p, 30, 50, 6, true); return { ...r, lean: 14, head: -8, shF: -28 * Math.sin(p) + 30, elF: 70, shB: 70, elB: 62, hold: 'roll', expr: 'worried', sweat: 0.5, quill: false }; },
  unrollDecree: (c) => {
    const T = [c.sp.bw * 1.05, -c.sp.bodyTop * 0.58];
    const [shF, elF] = c.ikF(vadd(T, [4, 0]), 1), [shB, elB] = c.ikB(vadd(T, [-8, 2]), 1);
    return { lean: -10, head: -4, shF, elF, shB, elB, hold: 'roll', hipF: 16, hipB: -14, knB: -6, armsFront: 1, expr: 'proud' };
  },
  backAway: (c) => {
    const p = cyc(c, 1.2), w = gait(-p, 18, 24, 2.5);
    const T = [c.sp.bw * 1.05, -c.sp.bodyTop * 0.58];
    const [shF, elF] = c.ikF(vadd(T, [4, 0]), 1), [shB, elB] = c.ikB(vadd(T, [-8, 2]), 1);
    return { ...w, lean: -8, head: -6, shF, elF, shB, elB, hold: 'roll', armsFront: 1, expr: 'proud' };
  },
  carryTower: (c) => {
    const p = cyc(c, 0.9), w = gait(p, 14, 20, 2);
    const sp = c.sp;
    const [shF, elF] = c.ikF([sp.bw * 0.55, -sp.bodyTop * 0.86], 1), [shB, elB] = c.ikB([sp.bw * 0.1, -sp.bodyTop * 0.82], 1);
    return { ...w, lean: 22, head: -20, look: 0.5, shF, elF, shB, elB, armsFront: 1, expr: 'strain', sweat: 0.8, tower: 1, quill: false };
  },
  deflate: () => ({ sq: -0.1, lean: 10, head: 14, shF: 4, elF: 0, shB: -4, elB: 0, lookY: 0.5, expr: 'relieved', quill: false }),
  // —— 收尾补充（storyboard 用到、assets.md 未列）——
  /** 扑上去捂嘴（b06 57.60）：前扑腾空，空着手（不画笔和本子）。 */
  pounce: () => ({ bob: 26, lean: 60, head: -32, shF: 172, elF: 4, shB: 164, elB: 10, hipF: -36, knF: -40, hipB: -58, knB: -28, plant: 0, quill: false, expr: 'determined' }),
  /** 下巴掉下来（b17 O07 全场下巴掉地）：本子和笔还拿着。 */
  jawDrop: () => ({ jaw: 1, lean: -3, head: -4, shF: 30, elF: 70, shB: 40, elB: 64, hold: 'notebook', sq: 0.03, armsFront: 1, expr: 'jawdrop' }),
};
export const SCRIBE_POSES_LIST = Object.keys(SCRIBE_POSES);

function drawQuill(R, F) {
  const J = F.J, sp = F.sp, g = R.g;
  const h = F.armF.h;
  const a = F.armF.ang + 150;
  const u = dirv(a);
  const snap = J.snap || 0;
  const tip = vsub(h, vmul(u, 10));
  const top = vadd(h, vmul(u, 40));
  F.anchors.quill = F.W(tip);
  const featherPath = (p0, p1, w) => {
    const d = vsub(p1, p0), l = Math.hypot(d[0], d[1]) || 1, n = [-d[1] / l, d[0] / l];
    return jitPath([p0, vadd(vlerp(p0, p1, 0.35), vmul(n, w * 0.4)), vadd(vlerp(p0, p1, 0.75), vmul(n, w)), p1, vadd(vlerp(p0, p1, 0.6), vmul(n, -w * 0.45))], sp.seed + 3, 0.6, true, 0.45);
  };
  if (snap < 0.15) {
    piece(R, featherPath(vadd(h, vmul(u, 6)), top, 9), PAL.white, { part: 'item', rimW: 0.7, shade: [top[0], top[1], 20], shadeColor: PAL.stone2 });
    strokePts(g, [tip, top], 1.3, colorOf(R, PAL.stoneDark, 'item'));
    strokePts(g, [tip, vadd(tip, vmul(u, 4))], 2, colorOf(R, PAL.ink, 'item'));
  } else {
    // 断成两截：下半截还在手里，上半截打着转飞走
    const mid = vadd(h, vmul(u, 14));
    strokePts(g, [tip, mid], 1.4, colorOf(R, PAL.stoneDark, 'item'));
    strokePts(g, [tip, vadd(tip, vmul(u, 4))], 2, colorOf(R, PAL.ink, 'item'));
    const k = clamp((snap - 0.15) / 0.85);
    const fly = vadd(vadd(mid, [-40 * k, -60 * k + 70 * k * k]), [0, 0]);
    g.save(); g.translate(fly[0], fly[1]); g.rotate(-k * 9);
    piece(R, featherPath([0, 0], vmul(u, 26), 8), PAL.white, { part: 'item', rimW: 0.7 });
    strokePts(g, [[0, 0], vmul(u, 26)], 1.2, colorOf(R, PAL.stoneDark, 'item'));
    g.restore();
    if (!R.sil && k < 0.6) for (let i = 0; i < 4; i++) { const a2 = i * 1.6 + 0.4; fillEll(g, mid[0] + Math.cos(a2) * 8 * (0.5 + k), mid[1] + Math.sin(a2) * 8 * (0.5 + k), 1.4, 1.4, 0, rgba(PAL.ink, 1 - k)); }
  }
}
function drawNotebook(R, F) {
  const h = F.armB.h, sp = F.sp;
  const c = vadd(h, [10, -6]);
  const g = R.g;
  g.save(); g.translate(c[0], c[1]); g.rotate(-0.25 + F.J.lean * D * 0.3);
  const cover = (() => { const p = new Path2D(); p.roundRect(-15, -19, 30, 38, 3); return p; })();
  piece(R, cover, PAL.kraftDark, { part: 'item', rimW: 0.9 });
  const page = (() => { const p = new Path2D(); p.roundRect(-12, -17, 25, 33, 2); return p; })();
  piece(R, page, PAL.paper, { part: 'item', under: false, rimW: 0.6 });
  if (R.detail && !R.sil) for (let i = 0; i < 5; i++) strokePts(g, [[-8, -11 + i * 5.5], [8 - (i === 4 ? 7 : 0), -11 + i * 5.5]], 1, rgba(PAL.inkSoft, 0.55));
  g.restore();
  void sp;
}
function drawDecreeRoll(R, F) {
  const a = F.armB.h, b = F.armF.h;
  const c = vlerp(a, b, 0.5);
  const sp = F.sp;
  const r = 7.5, half = 34;
  const p0 = [c[0], c[1] - half], p1 = [c[0], c[1] + half];
  piece(R, limbPath([p0, p1], [r, r]), PAL.paper, { part: 'item', rimW: 1, shade: [c[0] + 4, c[1], 12], shadeColor: PAL.stone2 });
  for (const q of [p0, p1]) piece(R, ellPath(q[0], q[1], r * 1.15, 3, 0), PAL.red, { part: 'item', under: false, rimW: 0.6 });
  F.anchors.roll = F.W(c);
  F.anchors.rollEnd = F.W([c[0] + r, c[1]]);
  void sp;
}
function drawDesk(R, F) {
  const sp = F.sp, ground = -F.oy;
  const x = sp.bw + 30, topY = -sp.L - sp.bodyTop * 0.46;
  const post = limbPath([[x, topY + 6], [x, ground - 4]], [5, 5]);
  piece(R, post, PAL.woodDark, { part: 'item', rimW: 1 });
  piece(R, jitPath([[x - 26, ground], [x + 26, ground], [x + 20, ground - 8], [x - 20, ground - 8]], 3, 0.8, true, 0.2), PAL.woodDark, { part: 'item', rimW: 0.8 });
  const top = jitPath([[x - 38, topY + 8], [x + 36, topY - 8], [x + 38, topY - 2], [x - 36, topY + 14]], 5, 0.8, true, 0.15);
  piece(R, top, PAL.wood, { part: 'item', rimW: 1.2, shade: [x, topY, 40] });
  piece(R, jitPath([[x - 26, topY + 4], [x + 22, topY - 7], [x + 24, topY - 4], [x - 24, topY + 7]], 7, 0.5, true, 0.1), PAL.paper, { part: 'item', under: false, rimW: 0.6 });
  piece(R, (() => { const p = new Path2D(); p.roundRect(x + 24, topY - 18, 10, 12, 2); return p; })(), PAL.ink, { part: 'item', rimW: 0.7, rimColor: PAL.inkSoft });
  fillEll(R.g, x + 29, topY - 18, 5, 1.6, 0, colorOf(R, PAL.gold, 'item'));
}
/** 书记官背的纸卷塔（身体空间在身后）；tower 0..1：0 直立轻晃 → 0.5 危险倾斜 → 1 倒塌散落一地。 */
function drawTower(R, F) {
  const sp = F.sp, o = F.o, g = R.g;
  const topple = clamp(o.tower ?? 0);
  const n = o.towerN ?? 9;
  const base = F.bf([-sp.bw * 0.62, -sp.bodyTop * 0.34]);
  const ground = -F.oy;
  const sway = Math.sin(F.t * 2.4 + sp.seed) * (2.5 + 5 * topple) + 30 * Math.pow(Math.min(topple, 0.6) / 0.6, 1.3) * (topple < 0.6 ? 1 : 1);
  // 背架：一块木托板 + 两根背带（背带画在身体前面，见 bodyOver）
  if (topple < 0.9) {
    const a0 = F.bf([-sp.bw * 1.05, -sp.bodyTop * 0.3]), a1 = F.bf([-sp.bw * 0.05, -sp.bodyTop * 0.3]);
    piece(R, hosePath([a0, a1], [3.4, 3.4]), PAL.woodDark, { part: 'item', rimW: 0.8, rimColor: PAL.wood });
    piece(R, hosePath([F.bf([-sp.bw * 0.7, -sp.bodyTop * 0.3]), F.bf([-sp.bw * 0.7, -sp.bodyTop * 1.0])], [2.6, 2.6]), PAL.woodDark, { part: 'item', rimW: 0.7, rimColor: PAL.wood });
  }
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const len = 30 + hash2(sp.seed, i) * 22;
    const stackAng = (sway * u + (hash2(sp.seed + 1, i) - 0.5) * 8) * D;
    const sx = base[0] + Math.sin(stackAng) * i * 15 - 10 + (hash2(sp.seed + 2, i) - 0.5) * 6;
    const sy = base[1] - Math.cos(stackAng) * i * 15 + 24;
    const fk = clamp((topple - 0.55) / 0.45 * 1.4 - u * 0.4);
    const gx = base[0] - 30 + (hash2(sp.seed + 3, i) - 0.5) * 120 - i * 6, gy = ground - 7 - (i % 3 === 2 ? 12 : 0);
    const x = lerp(sx, gx, outCubic(fk)), y = lerp(sy, gy, fk) - Math.sin(Math.PI * fk) * 60 * (1 - u * 0.5);
    const rot = lerp(stackAng + (hash2(sp.seed + 4, i) - 0.5) * 0.3, (hash2(sp.seed + 5, i) - 0.5) * 1.2, fk) + fk * (i % 2 ? 3 : -3) * (1 - fk);
    g.save(); g.translate(x, y); g.rotate(rot);
    const p = limbPath([[-len / 2, 0], [len / 2, 0]], [7, 7]);
    piece(R, p, i % 3 === 1 ? PAL.paper2 : PAL.paper, { part: 'item', rimW: 0.8, shade: [0, 2, 9], shadeColor: PAL.stone2 });
    if (!R.sil) { fillEll(g, len / 2, 0, 3, 7, 0, PAL.stone2); fillEll(g, len / 2, 0, 1.3, 2.5, 0, PAL.stoneDark); piece(R, rectPath(-3, -7.2, 6, 14.4), i % 2 ? PAL.red : PAL.redDark, { part: 'item', under: false, rim: false }); }
    g.restore();
  }
  F.anchors.towerTop = F.W([base[0] + Math.sin(sway * D) * n * 15 - 10, base[1] - n * 15 + 24]);
}

/** 书记官：眼镜 + 鹅毛笔 + 小讲台（desk:true）+ 纸卷塔（tower 0..1）。 */
export function drawScribe(g, o = {}) {
  const sp = scribeSpec(o);
  const c = poseCtx(o, sp);
  const J = resolvePose(SCRIBE_POSES, o.pose || 'idle', c);
  jitterJ(J, c, { jitter: (o.jitter ?? 1) * 0.4 });
  applyJoints(J, o.joints, o.jointsSet);
  const E = exprOf(o.expr || J.expr || 'normal');
  const towerOn = J.tower || o.tower != null;
  const hatOn = o.hat !== false;
  const hk = {
    behind: (R, F) => { if (towerOn) drawTower(R, F); },
    bodyOver: (R) => {
      if (!towerOn || clamp(o.tower ?? 0) >= 0.9) return;
      const bw = sp.bw, top = sp.bodyTop;
      piece(R, hosePath([[-0.55 * bw, -top * 0.97], [0.05 * bw, -top * 0.8], [0.3 * bw, -top * 0.5]], [2.6, 2.6, 2.6]), PAL.kraftDark, { part: 'item', rimW: 0.7 });
    },
    bodyDeco: (R, F) => {
      const bw = sp.bw, top = sp.bodyTop, below = sp.below;
      piece(R, rectPath(-2 * bw, below - 8, 4 * bw, 16), sp.colors.trim, { part: 'body', under: false, rim: false });
      strokePts(R.g, [[0.32 * bw, -top], [0.36 * bw, -0.3 * top], [0.45 * bw, below]], 1.6, rgba(sp.colors.trim, 0.9));
      piece(R, jitPath([[-0.5 * bw, -top * 1.02], [0.95 * bw, -top * 1.02], [0.36 * bw, -0.62 * top]], sp.seed + 3, 1, true, 0.3), PAL.paper, { part: 'body', rimW: 0.9 });
      piece(R, rectPath(-2 * bw, -0.34 * top, 4 * bw, 0.08 * top), PAL.kraftDark, { part: 'body', under: false, rimW: 0.8 });
      // 墨水瓶 + 腰间插着的小卷
      piece(R, (() => { const p = new Path2D(); p.roundRect(0.55 * bw, -0.28 * top, 0.32 * bw, 0.17 * top, 2); return p; })(), PAL.ink, { part: 'body', rimW: 0.6, rimColor: PAL.inkSoft });
      piece(R, rectPath(0.6 * bw, -0.3 * top, 0.22 * bw, 0.04 * top), PAL.gold, { part: 'body', under: false, rim: false });
      piece(R, limbPath([[-0.85 * bw, -0.42 * top], [-0.35 * bw, -0.2 * top]], [4, 4]), PAL.paper, { part: 'body', rimW: 0.7 });
    },
    headBack: (R, F) => drawHairBack(R, F, sp.hr, 'bald', sp.colors.hair),
    hairCap: (R, F) => drawHairFront(R, F, sp.hr, 'bald', sp.colors.hair),
    headFront: (R) => { if (hatOn) drawHatAt(R, sp.hr, 'skullcap', { main: sp.colors.hat }, 'front'); },
    afterHead: (R, F) => { if (J.hold === 'notebook') drawNotebook(R, F); if (J.hold === 'roll') drawDecreeRoll(R, F); },
    frontHand: (R, F) => { if (J.quill !== false && J.hold !== 'roll') drawQuill(R, F); },
    front: (R, F) => { if (o.desk) drawDesk(R, F); },
    topH: () => (hatOn ? 1.14 : 1.0),
  };
  return renderPuppet(g, o, sp, J, E, hk);
}

// ———————————————————— 传令官 ————————————————————
function heraldSpec(o) {
  const H = 158, hr = 32, L = 24;
  const bodyTop = H - L - 1.82 * hr;
  return {
    kind: 'herald', seed: (o.seed ?? 5) + 301, H, hr, L, bodyTop, below: 10, bw: 31, flare: 1.08, belly: 0.1,
    shX: 31 * 0.86, shY: bodyTop * 0.8, headX: 1.5, legSep: 11, jawPx: 30,
    arm: { l1: 19, l2: 21, r0: 6.4, r1: 5.8, r2: 5.2, hand: 6.4, puff: PAL.gold, puffStripe: PAL.red },
    leg: { l1: 12, l2: 12, r: 6, foot: [21, 9] },
    nose: true,
    colors: { body: PAL.gold, trim: PAL.goldDark, sleeve: PAL.red, legs: PAL.red, legsB: PAL.gold, shoes: PAL.woodDark, skin: PAL.skin, hair: PAL.woodDark },
  };
}
/** 号的姿态：返回 {base(身体空间), ang(度，0 = 水平朝前，正 = 抬头), grip(base 在号身上的比例)}。 */
const HERALD_POSES = {
  idle: (c) => { const b = Math.sin(TAU * (c.t / 2.8 + c.phase)); return { shF: 18, elF: 34, shB: -12, elB: -6, sq: 0.01 * b, horn: 'side', expr: 'normal' }; },
  slapNotice: (c) => {
    const p = actP(c, 1.3);
    const k = p < 0.42 ? 0 : outCubic(clamp((p - 0.42) / 0.16));
    const wind = p < 0.42 ? inOutSine(p / 0.42) : 1;
    return { shF: lerp(lerp(40, 168, wind), 96, k), elF: lerp(lerp(20, -30, wind), -6, k), lean: lerp(-6 * wind, 14, k), head: lerp(-6 * wind, 4, k), shB: -18, elB: -8, horn: 'belt', hipF: lerp(4, 20, k), hipB: lerp(-4, -14, k), slap: k, expr: 'determined', main: 'F' };
  },
  blow: (c) => {
    const head = -12;
    const m = c.headPt([0.14 + 0.05, 0.42], head);
    const ang = 16;
    const u = [Math.cos(ang * D), -Math.sin(ang * D)];
    const Lh = 86;
    const [shF, elF] = c.ikF(vadd(m, vmul(u, Lh * 0.62)), 1), [shB, elB] = c.ikB(vadd(m, vmul(u, Lh * 0.3)), 1);
    const b = Math.sin(c.t * 5.5 + c.seed) * 0.03;
    return { head, lean: -6, shF, elF, shB, elB, horn: 'mouth', hornBase: m, hornAng: ang, cheeks: 1 + b * 3, sq: b, armsFront: 1, expr: 'puff' };
  },
  bentHorn: (c) => ({ shF: 58, elF: 58, shB: 50, elB: 66, head: 12, lookY: 0.7, look: 0.4, horn: 'front', bend: 1, armsFront: 1, expr: 'shock', sweat: 0.6 }),
  jawDrop: () => ({ jaw: 1, shF: 10, elF: 4, shB: -6, elB: -2, sq: 0.03, horn: 'hang', expr: 'jawdrop' }),
  unrollScroll: (c) => {
    const T = [c.sp.bw * 0.95, -c.sp.bodyTop * 0.98];
    const [shF, elF] = c.ikF(vadd(T, [20, 0]), 1), [shB, elB] = c.ikB(vadd(T, [-14, 0]), 1);
    return { shF, elF, shB, elB, head: -4, lean: -4, horn: 'belt', scroll: 1, armsFront: 1, expr: 'proud' };
  },
  kneel: () => ({ hipF: 88, knF: -92, hipB: -24, knB: -118, bob: -6, lean: 14, head: 20, shF: 26, elF: 52, shB: -8, elB: -6, horn: 'staff', expr: 'calm' }),
  run: (c) => { const p = cyc(c, 2.0), r = gait(p, 38, 60, 7, true); return { ...r, lean: 14, head: -8, shF: 120 + 10 * Math.sin(p), elF: 20, shB: 30 * Math.sin(p) - 20, elB: 50, horn: 'raised', expr: 'happy' }; },
  pant: (c) => {
    const b = Math.sin(c.t * 9 + c.seed);
    const sp = c.sp;
    const [shF, elF] = c.ikF([sp.bw * 0.5, sp.below + 4], 1), [shB, elB] = c.ikB([-sp.bw * 0.15, sp.below + 2], 1);
    return { lean: 34 + b * 2, head: -26, shF, elF, shB, elB, hipF: 16, knF: -18, hipB: -10, knB: -14, bob: -2, sq: 0.02 * b, horn: 'belt', armsFront: 1, expr: 'pant', sweat: 1 };
  },
  // —— 收尾补充（storyboard 用到、assets.md 未列）——
  /** 举手（b07 V03 一起举手放光点）：号挂回背后（与 idle 插值时号在 k=0.5 从手里换到背后），前手空手举高，hand = 前手。 */
  raiseHand: (c) => {
    const b = Math.sin(TAU * (c.t / 2.2 + c.phase)), reach = (c.sp.arm.l1 + c.sp.arm.l2) * 1.4;
    const [shF, elF] = c.ikF([c.SF[0] + reach * 0.4, c.SF[1] - 8 - reach * (0.95 + 0.02 * b)], -1, 1.4, 8);
    return { shF, elF, shUpF: 8, strF: 1.4, shB: -16, elB: -8, head: -10, lookY: -0.85, look: 0.3, lean: -5, horn: 'belt', expr: 'hope', main: 'F' };
  },
  /** 扑上去捂嘴（b06 57.60）：前扑腾空，号挂在背后。 */
  pounce: () => ({ bob: 30, lean: 62, head: -34, shF: 172, elF: 4, shB: 164, elB: 10, hipF: -40, knF: -45, hipB: -62, knB: -30, plant: 0, horn: 'belt', expr: 'determined' }),
};
export const HERALD_POSES_LIST = Object.keys(HERALD_POSES);

function trumpetGeom(F) {
  const J = F.J;
  const mode = J.horn || 'side';
  if (mode === 'mouth') return { base: F.bf(J.hornBase || [0, 0]), ang: (J.hornAng || 0) - J.lean, grip: 0 };
  const h = F.armF.h;
  if (mode === 'side') return { base: h, ang: -58, grip: 0.42 };
  if (mode === 'hang') return { base: h, ang: -42, grip: 0.12 };
  if (mode === 'staff') return { base: h, ang: 88, grip: 0.4 };
  if (mode === 'raised') return { base: h, ang: 24, grip: 0.45 };
  if (mode === 'front') return { base: vlerp(F.armF.h, F.armB.h, 0.4), ang: 6, grip: 0.4 };
  if (mode === 'belt') return { base: F.bf([-F.sp.bw * 0.72, -F.sp.bodyTop * 0.26]), ang: -146 - F.J.lean, grip: 0.42, belt: true };
  return { base: h, ang: -58, grip: 0.42 };
}
/** 带小旗的长号（图形空间）。bend 0..1 号身被吹弯。返回号口中心与朝向。 */
function drawTrumpet(R, F) {
  const J = F.J, sp = F.sp, g = R.g;
  const { base, ang, grip } = trumpetGeom(F);
  const Lh = 86;
  const bend = clamp(J.bend || 0);
  const pts = [];
  const n = 10;
  let a = ang, p = vsub(base, vmul([Math.cos(ang * D), -Math.sin(ang * D)], Lh * grip));
  for (let i = 0; i <= n; i++) {
    pts.push(p);
    const u = i / n;
    a = ang - bend * (u < 0.45 ? 10 : 10 + 120 * Math.pow((u - 0.45) / 0.55, 1.4));
    p = vadd(p, vmul([Math.cos(a * D), -Math.sin(a * D)], Lh / n));
  }
  const end = pts[n], pre = pts[n - 1];
  const d = vsub(end, pre), l = Math.hypot(d[0], d[1]) || 1, u = [d[0] / l, d[1] / l], nn = [-u[1], u[0]];
  // 小旗（挂在号身下）
  const q0 = pts[3], q1 = pts[7];
  const fd = vsub(q1, q0), fl = Math.hypot(fd[0], fd[1]) || 1, fu = [fd[0] / fl, fd[1] / fl];
  let down = [-fu[1], fu[0]];
  if (down[1] < 0) down = [fu[1], -fu[0]];
  const wv = Math.sin(F.t * 6 + sp.seed) * 2.5;
  const flagH = 30;
  const flag = jitPath([q0, q1, vadd(vadd(q1, vmul(down, flagH)), vmul(fu, wv)), vadd(vadd(vlerp(q0, q1, 0.5), vmul(down, flagH * 0.78)), vmul(fu, wv)), vadd(vadd(q0, vmul(down, flagH)), vmul(fu, wv))], sp.seed + 9, 0.6, true, 0.15);
  piece(R, flag, PAL.red, { part: 'item', rimW: 0.9, shade: [q1[0], q1[1] + 10, 30] });
  if (R.detail && !R.sil) {
    strokeIn(g, flag, [vadd(q0, vmul(down, flagH - 3)), vadd(vlerp(q0, q1, 0.5), vmul(down, flagH * 0.78 - 3)), vadd(q1, vmul(down, flagH - 3))], 3, PAL.gold);
    const cc = vadd(vlerp(q0, q1, 0.5), vmul(down, flagH * 0.38));
    const sh = jitPath([vadd(cc, vmul(down, -7)), vadd(vadd(cc, vmul(fu, 6)), vmul(down, -5)), vadd(vadd(cc, vmul(fu, 5)), vmul(down, 3)), vadd(cc, vmul(down, 8)), vadd(vadd(cc, vmul(fu, -5)), vmul(down, 3)), vadd(vadd(cc, vmul(fu, -6)), vmul(down, -5))], 3, 0.3, true, 0.3);
    piece(R, sh, PAL.gold, { part: 'item', under: false, rimW: 0.5 });
  }
  // 号身
  const tube = hosePath(pts, pts.map((_, i) => 2.6 + (i / n) * 0.8), 2);
  piece(R, tube, PAL.gold, { part: 'item', rimW: 0.9, rimColor: PAL.goldLight });
  // 号口
  const bell = jitPath([vadd(pre, vmul(nn, 3)), vadd(vadd(end, vmul(nn, 11)), vmul(u, 6)), vadd(vadd(end, vmul(nn, -11)), vmul(u, 6)), vadd(pre, vmul(nn, -3))], sp.seed + 5, 0.4, true, 0.35);
  piece(R, bell, PAL.gold, { part: 'item', rimW: 0.9, rimColor: PAL.goldLight, shade: [end[0], end[1], 14], shadeColor: PAL.goldDark });
  const mouthC = vadd(end, vmul(u, 6));
  piece(R, ellPath(mouthC[0], mouthC[1], 2.6, 10.5, Math.atan2(u[1], u[0])), PAL.goldDark, { part: 'item', under: false, rim: false });
  piece(R, ellPath(pts[0][0], pts[0][1], 3.6, 3.6), PAL.goldDark, { part: 'item', under: false, rimW: 0.5 });
  F.anchors.bell = F.W(vadd(mouthC, vmul(u, 3)));
  const w2 = F.W(vadd(mouthC, vmul(u, 13)));
  F.anchors.bellDir = Math.atan2(w2[1] - F.anchors.bell[1], w2[0] - F.anchors.bell[0]);
}
function drawHeraldScroll(R, F) {
  const a = F.armB.h, b = F.armF.h, sp = F.sp;
  const len = F.o.scrollLen ?? 0;
  const g = R.g;
  const c = vlerp(a, b, 0.5);
  const half = Math.max(30, Math.abs(b[0] - a[0]) / 2 + 12);
  if (len > 0) {
    const sh = jitPath([[c[0] - half + 6, c[1]], [c[0] + half - 6, c[1]], [c[0] + half - 8, c[1] + len], [c[0] - half + 8, c[1] + len]], sp.seed + 2, 0.8, true, 0.08);
    piece(R, sh, PAL.paper, { part: 'item', rimW: 0.8, shade: [c[0], c[1] + len, len], shadeColor: PAL.stone2 });
    if (!R.sil) { g.save(); g.clip(sh); g.fillStyle = PAL.red; g.fillRect(c[0] - half, c[1], 5, len); g.fillRect(c[0] + half - 5, c[1], 5, len); g.restore(); }
    piece(R, limbPath([[c[0] - half + 4, c[1] + len], [c[0] + half - 4, c[1] + len]], [6, 6]), PAL.paper2, { part: 'item', rimW: 0.8 });
    F.anchors.scrollRect = [...F.W([c[0] - half + 12, c[1] + 8]), ...F.W([c[0] + half - 12, c[1] + len - 6])];
  }
  piece(R, limbPath([[c[0] - half, c[1]], [c[0] + half, c[1]]], [4.2, 4.2]), PAL.woodDark, { part: 'item', rimW: 0.9, rimColor: PAL.wood });
  for (const x of [c[0] - half - 3, c[0] + half + 3]) piece(R, ellPath(x, c[1], 5, 5), PAL.gold, { part: 'item', rimW: 0.6, rimColor: PAL.goldLight });
  F.anchors.scrollTop = F.W(c);
}

/** 传令官：高羽毛帽 + 挂小旗的长号。blow 返回 bell（号口）与 bellDir（弧度）给声波。 */
export function drawHerald(g, o = {}) {
  const sp = heraldSpec(o);
  const c = poseCtx(o, sp);
  const J = resolvePose(HERALD_POSES, o.pose || 'idle', c);
  jitterJ(J, c, { jitter: (o.jitter ?? 1) * 0.4 });
  if (o.bend != null) J.bend = o.bend;
  applyJoints(J, o.joints, o.jointsSet);
  const E = exprOf(o.expr || J.expr || 'normal');
  const hatOn = o.hat !== false;
  const hk = {
    bodyDeco: (R, F) => {
      const bw = sp.bw, top = sp.bodyTop, below = sp.below, gg = R.g;
      // 四分纹章罩袍（锯齿下摆）
      const tab = new Path2D();
      const x0 = -0.72 * bw, x1 = 0.98 * bw, y0 = -top * 0.96, y1 = below + 2;
      tab.moveTo(x0, y0); tab.lineTo(x1, y0); tab.lineTo(x1, y1 - 6);
      const nz = 6;
      for (let i = 0; i <= nz; i++) { const x = lerp(x1, x0, i / nz); tab.lineTo(x, y1 - (i % 2 ? 0 : 6)); }
      tab.closePath();
      piece(R, tab, PAL.red, { part: 'body', rimW: 1, shade: [0.4 * bw, -0.3 * top, top * 0.6] });
      gg.save(); gg.clip(tab);
      const mx = 0.18 * bw, my = -0.45 * top;
      gg.fillStyle = colorOf(R, PAL.gold, 'body');
      gg.fillRect(x0 - 2, y0 - 2, mx - x0 + 2, my - y0 + 2);
      gg.fillRect(mx, my, x1 - mx + 2, y1 - my + 4);
      gg.restore();
      if (R.detail) {
        strokeIn(gg, tab, [[x0 + 1.5, y0], [x0 + 1.5, y1]], 3, PAL.goldDark);
        const cc = [mx, my];
        const sh = jitPath([[cc[0] - 7, cc[1] - 9], [cc[0] + 7, cc[1] - 9], [cc[0] + 7, cc[1] + 2], [cc[0], cc[1] + 10], [cc[0] - 7, cc[1] + 2]], 3, 0.3, true, 0.25);
        piece(R, sh, PAL.white, { part: 'body', rimW: 0.6 });
        strokePts(gg, [[cc[0] - 5, cc[1] + 1], [cc[0], cc[1] - 4], [cc[0] + 5, cc[1] + 1]], 2.2, PAL.red);
      }
      piece(R, rectPath(-2 * bw, -0.34 * top, 4 * bw, 0.07 * top), PAL.woodDark, { part: 'body', under: false, rimW: 0.7 });
    },
    headBack: (R, F) => drawHairBack(R, F, sp.hr, 'short', sp.colors.hair),
    hairCap: (R, F) => drawHairFront(R, F, sp.hr, 'short', sp.colors.hair),
    headFront: (R) => { if (hatOn) drawHatAt(R, sp.hr, 'plumeCap', { main: PAL.redDark, feather: PAL.goldLight }, 'front'); },
    behind: (R, F) => { if (J.horn === 'belt') drawTrumpet(R, F); },
    afterHead: (R, F) => { if (J.scroll) drawHeraldScroll(R, F); if (J.horn === 'front') drawTrumpet(R, F); },
    frontHand: (R, F) => { if (J.horn !== 'belt' && J.horn !== 'front') drawTrumpet(R, F); },
    topH: () => (hatOn ? 2.1 : 1.05),
    anchors: (F, out) => { if (J.slap != null) out.slap = out.handF; },
  };
  return renderPuppet(g, o, sp, J, E, hk);
}

// ———————————————————— 孩子 王浩然 ————————————————————
/** 四个阶段：baby 70（襁褓）/ toddler 110 / kid 160 / older 200。 */
export const CHILD_STAGES = {
  baby: { H: 70, hr: 22, L: 0, bw: 21, curl: 0.25, len: 0.55 },
  toddler: { H: 110, hr: 27, L: 17, bw: 22, curl: 0.45, len: 0.75 },
  kid: { H: 160, hr: 31, L: 36, bw: 24, curl: 0.7, len: 0.95 },
  older: { H: 200, hr: 35, L: 54, bw: 26, curl: 1.0, len: 1.15 },
};
function childSpec(o) {
  const stage = CHILD_STAGES[o.stage] ? o.stage : 'toddler';
  const st = CHILD_STAGES[stage];
  const { H, hr, L, bw } = st;
  const baby = stage === 'baby';
  const bodyTop = baby ? H - 1.82 * hr + 4 : H - L - 1.82 * hr;
  const k = hr / 31;
  return {
    kind: 'child', stage, baby, seed: (o.seed ?? 2) + 401, H, hr, L, bodyTop, below: baby ? 0 : Math.min(L * 0.4, 12), bw, flare: baby ? 1.0 : 1.08, belly: baby ? 0.2 : 0.2,
    shX: bw * (baby ? 0.78 : 0.82), shY: bodyTop * (baby ? 0.8 : 0.8), headX: 1, legSep: bw * 0.36, jawPx: 18 * k,
    arm: baby ? { l1: 9, l2: 10, r0: 4.4, r1: 4.1, r2: 3.8, hand: 5 } : { l1: bodyTop * 0.22 + 2, l2: bodyTop * 0.24 + 2, r0: 5.6 * k + 0.6, r1: 5 * k + 0.5, r2: 4.6 * k + 0.4, hand: 5.4 * k + 0.6 },
    leg: { l1: L * 0.5, l2: L * 0.5, r: stage === 'toddler' ? 5.6 : 5.4 * k + 0.5, foot: [16 * k + 3, 8 * k + 1] },
    nose: false, lashes: false, blushK: 1.25, ul: 1.8, rimW: 1.5,
    curl: o.curl ?? st.curl, ahogeLen: st.len, noEar: false,
    colors: {
      body: baby ? mixHex(PAL.skyDayLow, PAL.paper, 0.35) : PAL.heroBlue, trim: PAL.heroBlueDark, sleeve: baby ? mixHex(PAL.skyDayLow, PAL.paper, 0.2) : PAL.heroBlue,
      legs: stage === 'toddler' ? PAL.skin : mixHex(PAL.heroBlueDark, PAL.ink, 0.2), shoes: PAL.boot, skin: PAL.skin, hair: PAL.heroHair,
    },
  };
}
const CHILD_POSES = {
  stand: (c) => { const b = Math.sin(TAU * (c.t / 2.4 + c.phase)); return { sq: 0.015 * b, shF: 14 + 3 * b, shB: -14 - 3 * b, look: 0.3 * noise1(c.t * 0.3, c.seed), expr: 'normal' }; },
  popUp: (c) => { const b = Math.sin(c.t * 5 + c.seed); return { shF: 146 + 8 * b, elF: 18, shB: -146 - 8 * b, elB: -18, strF: 1.25, strB: 1.25, shUpF: 3, shUpB: 3, sq: 0.06, head: -8, expr: 'laugh' }; },
  giggle: (c) => {
    const w = Math.sin(c.t * 16 + c.seed);
    const m = c.headPt([0.3, 0.62], 6);
    const [shF, elF] = c.ikF([m[0] + 4, m[1] + 4], 1), [shB, elB] = c.ikB([m[0] - 6, m[1] + 8], 1);
    return { shF, elF, shB, elB, wob: 3 * w, head: 6 + 3 * w, armsFront: 1, expr: 'giggle' };
  },
  grabScarf: (c) => { const b = Math.sin(c.t * 4 + c.seed); return { shF: 78 + 4 * b, elF: 26, shB: 72 + 4 * b, elB: 30, lean: 6, head: 6, look: 0.6, armsFront: 1, expr: 'chew', main: 'F' }; },
  hop: (c) => {
    const p = actP(c, 1.2);
    const crouch = p < 0.25 ? sstep(p / 0.25) : 0;
    const air = p >= 0.25 && p < 0.85 ? Math.sin(Math.PI * (p - 0.25) / 0.6) : 0;
    const land = p >= 0.85 ? 1 - (p - 0.85) / 0.15 : 0;
    return { bob: 46 * air, sq: -0.14 * crouch + 0.12 * air - 0.12 * land, shF: lerp(30, 160, air) - 10 * crouch, elF: 10, shB: lerp(-30, -160, air) + 10 * crouch, elB: -10, hipF: 8 + 18 * crouch, knF: -30 * crouch, hipB: -8 + 18 * crouch, knB: -30 * crouch, head: -8 * air, expr: air > 0.1 ? 'laugh' : 'happy' };
  },
  frown: (c) => {
    const b = Math.sin(c.t * 2 + c.seed), sp = c.sp;
    const [shF, elF] = c.ikF([-sp.bw * 0.3, -sp.bodyTop * 0.6], 1), [shB, elB] = c.ikB([sp.bw * 0.75, -sp.bodyTop * 0.52], 1);
    return { shF, elF, shB, elB, head: 8 + b, lean: -3, look: 0.4, turn: 0.18, armsFront: 1, expr: 'pout' };
  },
  yank: (c) => {
    const p = actP(c, 1.2);
    const k = p < 0.5 ? 0 : outBack(clamp((p - 0.5) / 0.3));
    return { shF: lerp(160, 122, k), elF: lerp(4, 14, k), shB: lerp(174, 136, k), elB: lerp(4, 14, k), strF: 1.28, strB: 1.28, shUpF: 6, shUpB: 6, lean: lerp(-4, -14, k), head: lerp(-14, -6, k), hipF: lerp(4, 22, k), hipB: lerp(-4, -16, k), knB: -8 * k, lookY: -0.9, expr: k > 0.3 ? 'determined' : 'curious', main: 'F' };
  },
  laugh: (c) => {
    const w = Math.sin(c.t * 14 + c.seed), sp = c.sp;
    const [shF, elF] = c.ikF([sp.bw * 0.75, -sp.bodyTop * 0.32], 1), [shB, elB] = c.ikB([sp.bw * 0.05, -sp.bodyTop * 0.36], 1);
    return { shF, elF, shB, elB, head: -10 + 2 * w, wob: 1.5 * w, sq: 0.02 * w, armsFront: 1, expr: 'laugh' };
  },
};
export const CHILD_POSES_LIST = Object.keys(CHILD_POSES);

function drawAhoge(R, F) {
  const sp = F.sp, hr = sp.hr;
  const curl = clamp(sp.curl), len = sp.ahogeLen;
  const t = F.t;
  const wob = Math.sin(t * 3.2 + sp.seed) * 0.08 + Math.sin(t * 7.1) * 0.03;
  const pts = [];
  const n = 14;
  let a = -80 * D + wob, p = [0.3 * hr, -0.94 * hr], step = (0.85 * len * hr) / n;
  for (let i = 0; i <= n; i++) {
    pts.push(p);
    const u = i / n;
    a += (0.06 + curl * 0.42 * u * u) * (1 + curl);
    p = vadd(p, [Math.cos(a) * step, Math.sin(a) * step]);
  }
  const L = [], Rr = [];
  for (let i = 0; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    const w = (0.13 * (1 - u) * (1 - u * 0.3) + 0.018) * hr;
    const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(pts.length - 1, i + 1)];
    const dx = q1[0] - q0[0], dy = q1[1] - q0[1], l = Math.hypot(dx, dy) || 1;
    L.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    Rr.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  const path = smoothPath([...L, ...Rr.reverse()], { closed: true, tension: 0.4 });
  piece(R, path, sp.colors.hair, { part: 'hair', rimW: 0.9, underK: 0.6 });
  if (!R.sil) strokeIn(R.g, path, pts.slice(Math.floor(n * 0.35)), 0.05 * hr, PAL.hairGold, { smooth: true });
  F.anchors.ahoge = F.W(F.hf(pts[pts.length - 1]));
}
function drawShortScarf(R, F) {
  const sp = F.sp;
  const n = F.N;
  const w = sp.bw;
  const wv = Math.sin(F.t * 5 + sp.seed) * 3;
  const tail = jitPath([[n[0] - w * 0.4, n[1] + 6], [n[0] - w * 1.1, n[1] + 12 + wv], [n[0] - w * 1.6, n[1] + 4 + wv * 1.4], [n[0] - w * 1.55, n[1] + 14 + wv * 1.4], [n[0] - w * 1.05, n[1] + 22 + wv], [n[0] - w * 0.3, n[1] + 14]], sp.seed + 4, 0.8, true, 0.4);
  piece(R, tail, PAL.scarfDark, { part: 'scarf', rimW: 0.9 });
  const band = jitPath([[n[0] - w * 0.82, n[1] - 2], [n[0] + w * 0.86, n[1] - 4], [n[0] + w * 0.9, n[1] + 9], [n[0] - w * 0.8, n[1] + 11]], sp.seed + 5, 1, true, 0.5);
  piece(R, band, PAL.scarf, { part: 'scarf', rimW: 1.1, shade: [n[0], n[1] + 6, w] });
  piece(R, jitPath([[n[0] + w * 0.3, n[1] + 4], [n[0] + w * 0.55, n[1] + 4], [n[0] + w * 0.62, n[1] + 24 + wv * 0.5], [n[0] + w * 0.36, n[1] + 22 + wv * 0.5]], sp.seed + 6, 0.6, true, 0.3), PAL.scarf, { part: 'scarf', rimW: 0.8 });
}

/** 孩子王浩然：stage baby / toddler / kid / older；呆毛随阶段变长变卷；小王冠；shortScarf（O06 起）。 */
export function drawChild(g, o = {}) {
  const sp = childSpec(o);
  const c = poseCtx(o, sp);
  const J = resolvePose(CHILD_POSES, o.pose || 'stand', c);
  jitterJ(J, c, { jitter: (o.jitter ?? 1) * 0.4 });
  applyJoints(J, o.joints, o.jointsSet);
  const E = exprOf(o.expr || J.expr || 'normal');
  const crownOn = o.crown !== false;
  const hk = {
    bodyShape: sp.baby ? (R, F) => {
      // 襁褓：圆鼓鼓的被包（身体空间，底边贴地）
      const w = sp.bw, top = sp.bodyTop;
      const p = jitPath([[0, -top - 2], [0.9 * w, -top * 0.8], [1.12 * w, -top * 0.3], [1.0 * w, 0], [0.5 * w, 6], [-0.5 * w, 6], [-1.0 * w, 0], [-1.12 * w, -top * 0.3], [-0.9 * w, -top * 0.8]], sp.seed + 1, 1.2, true, 0.55);
      return p;
    } : null,
    bodyDeco: (R, F) => {
      const bw = sp.bw, top = sp.bodyTop, below = sp.below, gg = R.g;
      if (sp.baby) {
        // 被角斜搭过胸口（荷叶边）+ 粉色绑带 + 小金星别针
        const flap = jitPath([[-1.3 * bw, -top * 1.1], [0.6 * bw, -top * 1.1], [1.25 * bw, -top * 0.7], [0.4 * bw, -top * 0.3], [-1.3 * bw, -top * 0.05]], sp.seed + 3, 1, true, 0.4);
        piece(R, flap, PAL.white, { part: 'body', rimW: 1, shade: [0.3 * bw, -top * 0.5, top * 0.6], shadeColor: PAL.skyDay, shadeA: 0.25 });
        if (R.detail) for (let i = 0; i < 6; i++) { const q = vlerp([1.2 * bw, -top * 0.68], [-1.2 * bw, -top * 0.06], i / 5); fillEll(gg, q[0], q[1], 2.6, 2.6, 0, rgba(PAL.princessLight, 0.95)); }
        piece(R, rectPath(-2 * bw, -top * 0.42, 4 * bw, top * 0.15), PAL.princessLight, { part: 'body', under: false, rimW: 0.8 });
        bowAt(R, 0.45 * bw, -top * 0.36, 9, PAL.princess, 0.1);
        const star = new Path2D();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 1.6 : 3.8; const x = -0.35 * bw + Math.cos(a) * r, y = -top * 0.72 + Math.sin(a) * r; i ? star.lineTo(x, y) : star.moveTo(x, y); }
        star.closePath();
        piece(R, star, PAL.gold, { part: 'body', under: false, rimW: 0.4, rimColor: PAL.goldLight });
        return;
      }
      piece(R, rectPath(-2 * bw, below - 5, 4 * bw, 12), sp.colors.trim, { part: 'body', under: false, rim: false });
      piece(R, rectPath(-2 * bw, -0.3 * top, 4 * bw, 0.1 * top), PAL.leather, { part: 'body', under: false, rimW: 0.7 });
      piece(R, (() => { const q = new Path2D(); q.roundRect(0.22 * bw, -0.32 * top, 0.32 * bw, 0.14 * top, 1.5); return q; })(), PAL.gold, { part: 'body', rimW: 0.6, rimColor: PAL.goldLight });
      for (const sx of [-1, 1]) piece(R, ellPath(sx * 0.3 * bw + 0.08 * bw, -0.95 * top, 0.34 * bw, 0.14 * top, sx * 0.25), PAL.white, { part: 'body', rimW: 0.7 });
    },
    afterBody: (R, F) => { if (o.shortScarf) drawShortScarf(R, F); },
    headBack: (R, F) => drawHairBack(R, F, sp.hr, 'messy', sp.colors.hair),
    hairCap: (R, F) => {
      drawHairFront(R, F, sp.hr, 'messy', sp.colors.hair);
      if (!R.sil) {
        const hr = sp.hr;
        const lock = jitPath(U([[0.3, -0.98], [0.52, -0.9], [0.62, -0.62], [0.5, -0.34], [0.42, -0.6], [0.3, -0.8]], hr), sp.seed + 8, hr * 0.02, true, 0.5);
        piece(R, lock, PAL.hairGold, { part: 'hair', under: false, rimW: 0.8, rimColor: PAL.goldLight });
      }
    },
    headFront: (R, F) => {
      drawAhoge(R, F);
      if (crownOn) drawHatAt(R, sp.hr, 'crown', { main: PAL.gold }, 'front');
    },
    topH: () => (crownOn ? 1.42 : 1.1) + sp.ahogeLen * 0.3,
  };
  if (sp.baby) { J.hipF = 0; J.hipB = 0; }
  return renderPuppet(g, o, sp, J, E, hk);
}

// ———————————————————— 飞帽 / 单独的帽子 ————————————————————
/**
 * 单独画一顶帽子（被吹飞、抛起、落地时用）。锚点 (x, y) = 帽冠点（帽子戴在头上时与头顶的接触点）。
 * o: { type（帽型名）或 variant（取该市民变体的帽子）、guard:true（卫兵高帽）、s, rot（弧度）, face, t, detail, villager, grandma }
 */
export function drawFolkHat(g, o = {}) {
  let type = o.type, C = { main: PAL.redDark };
  if (!type && o.guard) { type = 'busby'; C = { main: mixHex(PAL.ink, PAL.dragonDeep, 0.2), plume: PAL.ermine }; }
  if (!type) { const sp = citizenSpec(o); type = sp.hat; C = hatColors(sp); }
  if (!type || !HATS[type]) return;
  if (o.colors) C = { ...C, ...o.colors };
  const hr = o.hr ?? 33;
  const R = { g, detail: o.detail ?? 1, face: o.face === -1 ? -1 : 1, t: o.t ?? 0, seed: o.seed ?? 7, sil: !!o.silhouette, silColor: o.silColor || PAL.ink, keep: new Set(), ul: (o.detail ?? 1) > 0 ? 2.1 : 0, rimW: 1.7, flying: o.flying ?? true };
  g.save();
  g.translate(o.x ?? 0, o.y ?? 0);
  g.rotate(o.rot ?? 0);
  g.scale((o.s ?? 1) * R.face, o.s ?? 1);
  g.translate(-HAT_ANCHOR[0] * hr, -HAT_ANCHOR[1] * hr);
  drawHatAt(R, hr, type, C, 'both');
  g.restore();
}

// ———————————————————— 群演批量 ————————————————————
/** 错峰进度：第 i 个成员在 t0 + i·step（± jitter）起、dur 秒内由 0 到 1（ease）。 */
export function folkStagger(T, t0, i, o = {}) {
  const { step = 0.05, dur = 0.3, ease = outCubic, jitter = 0, seed = 7 } = o;
  const a = t0 + i * step + (jitter ? (hash2(seed, i) - 0.5) * 2 * jitter : 0);
  return ease(clamp((T - a) / dur));
}
/**
 * 生成一排群演参数：均匀分布在 x0..x1，变体依次轮换（相邻不同色），相位、seed 各不相同。
 * o: { x0, x1, y, s, face, faceMix(0..1 反向比例), variants（指定变体序列）, start（起始变体）, xJit, yJit, seed, phaseStep }
 * 返回 [{ i, x, y, s, face, variant, phase, seed }]，可直接展开进 drawCitizen 的 o。
 */
export function folkCrowd(n, o = {}) {
  const { x0 = 0, x1 = 600, y = 0, s = 1, face = 1, faceMix = 0, variants = null, start = 0, xJit = 0.25, yJit = 0, seed = 1, phaseStep = 0.137 } = o;
  const out = [];
  const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    out.push({
      i, x: lerp(x0, x1, u) + (hash2(seed, i) - 0.5) * 2 * xJit * gap, y: y + (hash2(seed + 5, i) - 0.5) * 2 * yJit, s,
      face: faceMix && hash2(seed + 7, i) < faceMix ? -face : face,
      variant: variants ? variants[i % variants.length] : (start + i) % 12,
      phase: fract(i * phaseStep + hash2(seed + 9, i) * 0.3), seed: seed * 31 + i * 7,
    });
  }
  return out;
}
/**
 * 批量画群演（按 y 从后往前）。common 为所有成员共用参数（t、pose…）；common.each(m) 返回单个成员的覆盖项。
 * 成员可带 kind:'guard'|'scribe'|'herald'|'child'（默认市民）。返回按 i 排列的锚点数组。
 */
export function drawCrowd(g, members, common = {}) {
  const { each, ...base } = common;
  const list = [...members].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const res = [];
  for (const m of list) {
    const o = { ...base, ...m, ...(each ? each(m) || {} : {}) };
    const kind = o.kind || 'citizen';
    const fn = kind === 'guard' ? drawGuard : kind === 'scribe' ? drawScribe : kind === 'herald' ? drawHerald : kind === 'child' ? drawChild : drawCitizen;
    res[m.i ?? res.length] = fn(g, o);
  }
  return res;
}

/** 各角色 s = 1 时的标称高度（assets.md 0.3：市民为各变体头顶 H，卫兵含高帽，其余到头顶 / 帽顶）。精确值用返回的 top / head 锚点。 */
export const FOLK_HEIGHTS = {
  citizen: FOLK_VARIANTS.map((v) => v.H), guard: 200, scribe: 180, herald: 185,
  child: { baby: 70, toddler: 110, kid: 160, older: 200 },
};
/** 别名（集成说明里写作 FOLK_HEIGHT，两个名字都可 import）。 */
export const FOLK_HEIGHT = FOLK_HEIGHTS;
