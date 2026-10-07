// 巨龙 昆图库塔卡提考特苏瓦西拉松 / 小蜥蜴 —— 纸艺关节木偶（docs/assets.md 第 5 节，接口文档 docs/api/dragon.md）。
//
// 坐标约定：
//   · 巨龙的姿态预设直接写在 CAVE 世界坐标里（storyboard 4.7 / 各块描述），原生朝向 = 朝左（头在左、尾在右）。
//   · 不传 x / y 就按预设坐标原地画；传了就把 root（= 头心）平移到 (x, y)。s 以 root 为中心缩放，face = 1 以 root 为轴镜像成朝右。
//   · 脊线 = 64 个点（脖根插座 → 黑桃尾尖），每帧按弧长加密；前 S0 段藏在头后，余下等分 13 节，第 13 节就是黑桃尾尖。
//   · 小蜥蜴 drawLizard 走统一木偶签名：x, y = 脚底（或趴附点）中心，face 默认 1（朝右）。
// 纯函数：只由参数（含 t）决定画面；内部 save/restore；不调用 ctx.layer / ctx.mask。
import { PAL, blob, smooth as smoothPath, glow, rad, scaleOf } from '../core/paper.js';
import { clamp, lerp, TAU, hash2, noise1, wobble, rgba, mixHex, smoothstep } from '../core/util.js';
import { outBack } from '../core/ease.js';
import { glyph13, marquee } from '../ui/type.js';
import { NAMES } from '../cues.js';

const D2R = Math.PI / 180;
const N = 64, NSEG = 13;
/** 巨龙头宽（s = 1，世界 px）。 */
export const DRAGON_HEAD_W = 360;
const S0 = 100;                 // 藏在头后的脊线长度（插座 → 第 1 节起点）
const SOCKET = [100, 52];       // 头局部坐标里的脖根插座
const PLATE_R = 50;             // 背板半径（100×100）
const PLATE_GAP = 36;           // 背板中心超出背线的距离
const SPADE_C = 54;             // 黑桃中心距尾尖
const WING_K = 1.22;            // 小蝙蝠翼整体缩放
const DRAGON_CHARS = [...NAMES.dragon];

// ———————————————————— 向量 / 矩阵 ————————————————————
const rotV = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mixP = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/** 2×3 仿射矩阵 [a,b,c,d,e,f]（与 canvas transform 同序）。 */
const mMul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const mT = (x, y) => [1, 0, 0, 1, x, y];
const mS = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
const mR = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const mApply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
const mDir = (M, v) => [M[0] * v[0] + M[2] * v[1], M[1] * v[0] + M[3] * v[1]];
const angOf = (v) => Math.atan2(v[1], v[0]);
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerpAng = (a, b, k) => a + wrapA(b - a) * k;

// ———————————————————— 样条 ————————————————————
/** 向心 Catmull-Rom：过所有点的开放曲线，每段 per 个采样。 */
function catmull(pts, per = 12) {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [p[0], p[1]]);
  const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
  const P = [ext(pts[0], pts[1]), ...pts, ext(pts[n - 1], pts[n - 2])];
  const kn = (a, b) => Math.max(1e-3, Math.sqrt(dist(a, b)));
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < n; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t1 = kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
    for (let k = 1; k <= per; k++) {
      const t = t1 + (t2 - t1) * (k / per);
      const A1 = mixP(p0, p1, t / t1), A2 = mixP(p1, p2, (t - t1) / (t2 - t1)), A3 = mixP(p2, p3, (t - t2) / (t3 - t2));
      const B1 = mixP(A1, A2, t / t2), B2 = mixP(A2, A3, (t - t1) / (t3 - t1));
      out.push(mixP(B1, B2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}
function arcLen(pts) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i])); return L; }
/** 按弧长重采样成 n 点。 */
function resample(pts, n = N) {
  const L = arcLen(pts), tot = L[L.length - 1] || 1;
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (tot * k) / (n - 1);
    while (j < L.length - 1 && L[j] < s) j++;
    out.push(mixP(pts[j - 1], pts[j], clamp((s - L[j - 1]) / (L[j] - L[j - 1] || 1))));
  }
  return out;
}
/** 64 点 → 加密的绘制脊线（带弧长表）。 */
function dense(pts) {
  const d = catmull(pts, 5);
  const L = arcLen(d);
  return { d, L, tot: L[L.length - 1] };
}
/** 弧长 s 处的位置、切线（指向尾巴）、法线（指向腹侧）。 */
function frameAt(D, s) {
  const { d, L } = D, n = d.length;
  if (s < 0 || s > D.tot) {
    const e = s < 0 ? frameAt(D, 0) : frameAt(D, D.tot);
    const ds = s < 0 ? s : s - D.tot;
    return { ...e, x: e.x + e.tx * ds, y: e.y + e.ty * ds };
  }
  let lo = 1, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < s) lo = m + 1; else hi = m; }
  const i = Math.max(1, lo);
  const f = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
  const x = d[i - 1][0] + (d[i][0] - d[i - 1][0]) * f, y = d[i - 1][1] + (d[i][1] - d[i - 1][1]) * f;
  const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 1);
  let tx = d[b][0] - d[a][0], ty = d[b][1] - d[a][1];
  const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  return { x, y, tx, ty, nx: -ty, ny: tx, a: Math.atan2(ty, tx) };
}
const fp = (f, along, out) => [f.x + f.tx * along + f.nx * out, f.y + f.ty * along + f.ny * out];

// ———————————————————— 身体粗细（按弧长比例 u） ————————————————————
const WTAB = [[0, 118], [0.07, 122], [0.2, 134], [0.36, 130], [0.52, 116], [0.66, 98], [0.78, 78], [0.88, 58], [0.95, 44], [1, 34]];
function wProf(u) {
  u = clamp(u);
  for (let i = 1; i < WTAB.length; i++) if (u <= WTAB[i][0]) return lerp(WTAB[i - 1][1], WTAB[i][1], smoothstep(WTAB[i - 1][0], WTAB[i][0], u));
  return WTAB[WTAB.length - 1][1];
}

// ———————————————————— 姿态预设（CAVE 世界坐标，原生朝左） ————————————————————
// head = 头心，rot = 头部转角（度，正 = 抬头），path = 脖根之后的脊线引导点（最后一点 = 尾尖）。
const POSE_DEF = {
  fly: { head: [420, 430], rot: 0, path: [[650, 505], [930, 470], [1230, 492], [1530, 466], [1830, 490], [2130, 470], [2320, 478]], wings: 1, flap: 1, arms: 0, jaw: 0.06, wave: { amp: 44, len: 740, hz: 0.85 }, eyes: { state: 'normal', pupil: 0.3 }, desc: '波浪飞行（L02–L04），翅膀自动扇动' },
  shadow: { like: 'fly', wave: { amp: 66, len: 820, hz: 0.85 }, silhouette: true, desc: '龙影：fly 的整片剪影（ink，透明度与模糊交给图层）' },
  coil: { head: [1150, 600], rot: -16, path: [[1400, 690], [1625, 652], [1850, 662], [1992, 742], [1942, 838], [1742, 870], [1500, 868], [1336, 828], [1252, 760]], wings: 0, arms: 0, jaw: 0, order: 'tailTop', eyes: { state: 'closed' }, desc: '盘在金币堆上、闭眼（V14）' },
  rise: { head: [1150, 470], rot: 6, path: [[1310, 640], [1390, 770], [1560, 850], [1800, 868], [2040, 840], [2240, 770], [2330, 660], [2310, 540], [2240, 450]], wings: 1, arms: 0.2, jaw: 0, eyes: { state: 'normal' }, desc: '昂首立起，头 (1150,470)（V15–V16、Q1 后）' },
  name: { head: [960, 440], rot: -4, path: [[1230, 582], [1400, 630], [1570, 612], [1750, 548], [1930, 600], [2100, 700], [2280, 780], [2450, 820]], wings: 0.3, arms: 0, jaw: 0, eyes: { state: 'smug' }, desc: 'D1 报名：头 (960,440) 朝左，S 形到尾尖 (2450,820)' },
  breathe: { head: [1520, 470], rot: 9, path: [[1700, 650], [1850, 722], [2050, 742], [2250, 702], [2450, 742], [2650, 702], [2850, 742], [3050, 704]], wings: 0.75, arms: 0.3, jaw: 1, nostril: 1, eyes: { state: 'angry', pupil: 0.14 }, desc: 'D2 喷火：嘴约 (1380,520)，脖子前探' },
  puffer: { head: [1200, 300], rot: 2, path: [[1400, 480], [1380, 660], [1500, 820], [1750, 880], [1980, 800], [2080, 620], [2000, 440], [1840, 370], [1700, 400]], wings: 1, arms: 0.5, jaw: 0.55, eyes: { state: 'angry', pupil: 0.12 }, desc: 'R1 河豚：头 (1200,300) 高过道具栏，身体卷成一团（配 spikes / puff）' },
  wall: { head: [1180, 250], rot: -6, path: [[1330, 420], [1320, 560], [1350, 700], [1440, 820], [1600, 880], [1820, 880], [2020, 820], [2140, 700], [2170, 560], [2120, 430]], wings: 1, arms: 0.6, jaw: 0.3, eyes: { state: 'angry', pupil: 0.15 }, desc: 'D3 直立在名字墙后，头 (1180,250)' },
  lunge: { head: [840, 610], rot: -10, path: [[1120, 660], [1300, 620], [1440, 540], [1600, 520], [1740, 600], [1820, 720], [1960, 800], [2160, 790], [2340, 700]], wings: 0.55, arms: 0.8, jaw: 0.95, eyes: { state: 'angry', pupil: 0.12 }, desc: '向左扑咬（I2）' },
  coilPillar: { helix: { cx: 1640, r: 140, yb: 846, turns: 1.5, len: 1660 }, rot: 6, wings: 0.4, arms: 0.3, jaw: 0.25, eyes: { state: 'angry' }, desc: 'I2 盘柱：绕 x=1640 水晶柱的螺旋，头在下、尾在上；返回 front[]' },
  clash: { head: [1120, 430], rot: 4, path: [[1300, 600], [1290, 730], [1380, 840], [1560, 880], [1760, 860], [1940, 780], [2060, 650], [2080, 500], [2020, 380], [1920, 300]], wings: 1, arms: 1, jaw: 0.6, eyes: { state: 'angry', pupil: 0.12 }, desc: 'I2 对撞：张翼、伸爪、张嘴' },
  charge: { head: [1100, 620], rot: 2, path: [[1450, 700], [1700, 690], [1950, 705], [2200, 695], [2450, 700], [2700, 700], [2900, 702]], wings: 0.45, flap: 0, arms: 0.25, jaw: 0.4, wave: { amp: 46, len: 640, hz: 1.6 }, eyes: { state: 'angry' }, desc: 'I2 冲锋：贴地向左游动（行波）' },
  standoff: { head: [1350, 520], rot: 0, path: [[1560, 690], [1700, 760], [1880, 740], [2060, 664], [2250, 622], [2450, 660], [2650, 620], [2850, 660]], wings: 0.6, arms: 0.15, jaw: 0.04, eyes: { state: 'angry', pupil: 0.2 }, desc: 'STANDOFF 构图：头 (1350,520)，身体经 (1700,760) 延出画右' },
  puppet: { like: 'standoff', flat: true, rod: 1, rods: [1300, 1600], wings: 0.5, eyes: { state: 'normal' }, desc: '纸剧场木偶：剪纸平面版 + 双签 x 1300 / 1600' },
  shrink: { like: 'standoff', flat: true, rod: 0, rods: [1300, 1600], pivot: [1467, 860], wings: 0.4, eyes: { state: 'normal' }, desc: 'B12 缩小：配 popped，以 (1467,860) 为缩放中心，缩完正好落在台面 y=840' },
};
for (const k in POSE_DEF) { const d = POSE_DEF[k]; if (d.like) POSE_DEF[k] = { ...POSE_DEF[d.like], ...d }; }

/** 姿态元数据（只读）：头心 head、头部转角 rot、默认参数、说明。 */
export const DRAGON_POSES = Object.fromEntries(Object.entries(POSE_DEF).map(([k, d]) => [k, {
  head: d.head ? [...d.head] : null, rot: d.rot, desc: d.desc, wings: d.wings, jaw: d.jaw ?? 0, arms: d.arms ?? 0,
  eyes: d.eyes, flat: !!d.flat, rods: d.rods || null, pivot: d.pivot || null, wave: d.wave || null,
}]));

/** 螺旋（盘柱）：头在下、尾在上；depth = 朝镜头分量（>0 在柱前）。 */
function helixBase(h) {
  const { cx, r, yb, turns, len } = h;
  const pitch = Math.sqrt(Math.max(1, (len / turns) ** 2 - (TAU * r) ** 2));
  const pts = [], depth = [];
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1), ph = Math.PI + u * turns * TAU;
    pts.push([cx + r * Math.cos(ph), yb - u * turns * pitch]);
    depth.push(-Math.sin(ph));
  }
  return { pts, depth };
}

const BASE = {};
function baseSpine(name) {
  if (BASE[name]) return BASE[name];
  const def = POSE_DEF[name];
  if (!def) throw new Error('drawDragon: unknown pose ' + name);
  let pts, depth = null, head;
  const hr = def.rot * D2R;
  const so = rotV(SOCKET[0], SOCKET[1], hr);
  if (def.helix) {
    ({ pts, depth } = helixBase(def.helix));
    head = [pts[0][0] - so[0], pts[0][1] - so[1]];
    def.head = head;
    DRAGON_POSES[name].head = [...head];
  } else {
    head = def.head;
    pts = resample(catmull([[head[0] + so[0], head[1] + so[1]], ...def.path], 18), N);
  }
  BASE[name] = { pts, depth, rot: def.rot };
  return BASE[name];
}

// 盘柱的头心由螺旋反推：模块加载时先算好，DRAGON_POSES.coilPillar.head 一开始就有值
for (const k in POSE_DEF) if (POSE_DEF[k].helix) baseSpine(k);

/** 沿法线叠一条行波（飞行、游动、待机起伏）。 */
function addWave(pts, amp, len, hz, t, env) {
  const L = arcLen(pts), tot = L[L.length - 1] || 1;
  const out = pts.map((p) => [p[0], p[1]]);
  for (let i = 0; i < pts.length; i++) {
    const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1);
    let tx = pts[b][0] - pts[a][0], ty = pts[b][1] - pts[a][1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = L[i] / tot;
    const o = amp * env(u) * Math.sin(TAU * (L[i] / len - hz * t));
    out[i][0] += -ty * o; out[i][1] += tx * o;
  }
  return out;
}

function resolveSpine(pose, t) {
  if (pose && typeof pose === 'object' && !Array.isArray(pose)) {
    const A = resolveSpine(pose.from, t), B = resolveSpine(pose.to, t);
    const k = clamp(pose.k ?? 0), st = pose.stagger || 0, sa = Math.abs(st);
    const pts = A.map((p, i) => {
      const u = i / (N - 1);
      const dl = st >= 0 ? st * (1 - u) : sa * u;   // stagger>0：尾先动；<0：头先动
      const ki = clamp(k * (1 + sa) - dl);
      return mixP(p, B[i], ki);
    });
    pts.rot = lerp(A.rot, B.rot, k);
    if (A.depth && B.depth) pts.depth = A.depth.map((d, i) => lerp(d, B.depth[i], k));
    else pts.depth = (k < 0.5 ? A.depth : B.depth) || null;
    return pts;
  }
  const name = pose || 'rise';
  const def = POSE_DEF[name];
  const base = baseSpine(name);
  let pts;
  if (def.wave) {
    const w = def.wave;
    pts = resample(addWave(base.pts, w.amp, w.len, w.hz, t, (u) => smoothstep(0.03, 0.3, u) * (1 + 0.25 * u)), N);
  } else {
    // 待机：很轻的慢行波（盘卧更轻）
    const amp = def.helix || def.order === 'tailTop' ? 2.5 : 5;
    pts = addWave(base.pts, amp, 680, 0.22, t, (u) => smoothstep(0.08, 0.4, u));
  }
  pts.rot = def.rot + Math.sin(t * 1.3 + 0.7) * 1.2;
  pts.depth = base.depth ? base.depth.slice() : null;
  return pts;
}

/**
 * 某姿态在 t 秒时的 64 点脊线（原生朝左、CAVE 世界坐标；已含待机起伏 / 飞行行波）。
 * pose 可为名字或 {from, to, k, stagger}（逐点插值；stagger>0 尾先动、<0 头先动，0..1）。
 * 返回数组，附带属性 rot（头部转角，度）、depth（仅盘柱：每点朝镜头分量）、head（头心）。
 */
export function dragonSpine(pose = 'rise', t = 0) {
  const pts = resolveSpine(pose, t);
  const so = rotV(SOCKET[0], SOCKET[1], pts.rot * D2R);
  pts.head = [pts[0][0] - so[0], pts[0][1] - so[1]];
  return pts;
}

/** 姿态的默认参数（翅膀、张嘴、表情……），{from,to,k} 时数值线性插值。 */
function poseParams(pose) {
  if (pose && typeof pose === 'object' && !Array.isArray(pose)) {
    const A = poseParams(pose.from), B = poseParams(pose.to), k = clamp(pose.k ?? 0);
    const out = { ...(k < 0.5 ? A : B) };
    for (const key of ['wings', 'flap', 'arms', 'jaw', 'nostril', 'rod']) out[key] = lerp(A[key], B[key], k);
    out.eyes = { ...(k < 0.5 ? A.eyes : B.eyes), open: lerp(A.eyes.open ?? 1, B.eyes.open ?? 1, k), pupil: lerp(A.eyes.pupil ?? 0.3, B.eyes.pupil ?? 0.3, k) };
    out.pivot = A.pivot && B.pivot ? mixP(A.pivot, B.pivot, k) : A.pivot || B.pivot;
    out.flat = k < 0.5 ? A.flat : B.flat;
    return out;
  }
  const d = POSE_DEF[pose || 'rise'] || POSE_DEF.rise;
  return {
    wings: d.wings ?? 0.5, flap: d.flap ?? 0, arms: d.arms ?? 0, jaw: d.jaw ?? 0, nostril: d.nostril ?? 0,
    eyes: { open: 1, pupil: 0.3, ...(d.eyes || {}) }, order: d.order || 'neckTop', flat: !!d.flat, rod: d.rod ?? 0,
    rods: d.rods || null, pivot: d.pivot || null, silhouette: !!d.silhouette,
  };
}

// ———————————————————— 绘制上下文 ————————————————————
/** 统一的“画风上下文”：剪影、细节级别、平面木偶、线宽反算、光与投影方向（都换算到原生坐标）。 */
function makeS(g, o, mx = 1, rotAll = 0) {
  const dpr = g.canvas && g.canvas.width ? g.canvas.width / 1920 : 1;
  const px = scaleOf(g) / dpr;
  const toN = (dx, dy) => { const r = rotV(dx, dy, -rotAll); return [r[0] * mx, r[1]]; };
  const keep = new Set(o.keepColor || []);
  return {
    px, mx, rotAll, t: o.t ?? 0, seed: o.seed ?? 1,
    detail: o.detail ?? 1, sil: !!o.silhouette, silC: o.silColor || PAL.ink, keep,
    flat: !!o.flat,
    ld: toN(-0.55, -0.835),   // 指向光源（画面左上）
    dd: toN(0.38, 0.925),     // 投影方向（画面右下）
    /** 线宽反算：返回原生单位宽度，使屏幕线宽夹在 [min, max] px。 */
    lw(w, min = 0.7, max = 1e9) { const sw = clamp(w * this.px, min, max); return sw / this.px; },
    c(col, part) { return this.sil && !this.keep.has(part) ? this.silC : col; },
  };
}
/** 某局部坐标系（相对原生旋转 a）里的光 / 投影方向。 */
const inFrame = (S, a) => ({ ...S, ld: rotV(S.ld[0], S.ld[1], -a), dd: rotV(S.dd[0], S.dd[1], -a) });

function rimEdge(g, path, col, w, ld, a = 0.7) {
  g.save();
  g.clip(path);
  g.translate(-ld[0] * w * 0.9, -ld[1] * w * 0.9);
  g.lineWidth = w * 1.6; g.strokeStyle = col; g.globalAlpha *= a; g.lineJoin = 'round';
  g.stroke(path);
  g.restore();
}
/** 形体明暗：沿光向从亮面（a=0）到暗面（a）。 */
function formShade(g, S, path, cx, cy, r, col = PAL.dragonDeep, a = 0.3) {
  if (S.sil || !S.detail) return;
  g.save();
  g.clip(path);
  const gr = g.createLinearGradient(cx + S.ld[0] * r, cy + S.ld[1] * r, cx - S.ld[0] * r, cy - S.ld[1] * r);
  gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, a));
  g.fillStyle = gr;
  g.fill(path);
  g.restore();
}
/**
 * 一片剪纸：（木偶版奶油纸边）→ 暗色错位底片（右下）→ 主色 → 切口亮边。
 * o: { drop(原生 px), dropA, dropC, rim, rimW, part（剪影时保留原色的部件名）, noEdge }
 */
function piece(g, S, path, fill, o = {}) {
  if (S.sil && !S.keep.has(o.part)) { g.fillStyle = S.silC; g.fill(path); return; }
  if (S.flat && !o.noEdge) {
    g.save(); g.lineJoin = 'round'; g.lineWidth = S.lw(9, 1.4, 9 * S.px); g.strokeStyle = PAL.paper; g.stroke(path); g.restore();
  }
  if (o.drop && S.detail) {
    g.save(); g.translate(S.dd[0] * o.drop, S.dd[1] * o.drop);
    g.fillStyle = rgba(o.dropC || PAL.dragonDeep, o.dropA ?? 0.3); g.fill(path); g.restore();
  }
  g.fillStyle = fill;
  g.fill(path);
  if (o.rim && S.detail) rimEdge(g, path, o.rim, o.rimW ?? S.lw(2.6, 1, 4.5), S.ld, o.rimA ?? 0.7);
}
function strokeLine(g, pts, lw, col, a = 1, closed = false) {
  g.save();
  g.globalAlpha *= a; g.lineWidth = lw; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  g.stroke(smoothPath(pts, { closed, tension: 0.5 }));
  g.restore();
}
/** 自动眨眼：每 3.6–4.4s 一次（0.16s），偶尔连眨。 */
function blinkAmt(t, seed) {
  const P = 3.6 + hash2(seed, 3) * 0.8, ph = hash2(seed, 7) * P;
  const u = (((t + ph) % P) + P) % P;
  const b = (x) => (x >= 0 && x < 0.16 ? Math.sin((Math.PI * x) / 0.16) : 0);
  return Math.max(b(u), hash2(seed, Math.floor((t + ph) / P)) < 0.3 ? b(u - 0.24) : 0);
}

// ———————————————————— 眼睛 ————————————————————
/** 闭眼类状态（eyes.one 时近眼遇到这些会改成 normal 睁开）。 */
const CLOSED_LIKE = new Set(['closed', 'happy', 'x']);
/**
 * 杏仁形巨眼（b09 101.20：黑暗里睁开、轮廓 = 洞口杏仁形）。open 0..1 = 上下眼睑从中线横着裂开。
 * 虹膜 dragonEye 径向到 goldDark，竖瞳贯穿，月牙高光。
 */
function almondEye(g, rx, ry, o, open, pupil, look, red, hl, t) {
  const k = clamp(open);
  if (k <= 0.002) {
    g.strokeStyle = rgba(PAL.dragonEye, 0.55); g.lineWidth = Math.max(1, ry * 0.04); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-rx, 0); g.lineTo(rx, 0); g.stroke();
    return;
  }
  const al = new Path2D();
  al.moveTo(-rx, 0); al.quadraticCurveTo(0, -2 * ry * k, rx, 0); al.quadraticCurveTo(0, 2 * ry * k, -rx, 0); al.closePath();
  // 眼眶暗边（压在虹膜外一圈）
  g.save(); g.lineJoin = 'round'; g.lineWidth = ry * 0.16; g.strokeStyle = rgba(PAL.dragonDeep, 0.9); g.stroke(al); g.restore();
  g.save();
  g.clip(al);
  const cx = look[0] * rx * 0.25, cy = look[1] * ry * 0.18;
  const R = ry * 1.02;
  const irisC = mixHex(PAL.dragonEye, PAL.fire, red * 0.6);
  const gr = g.createRadialGradient(cx + hl[0] * R * 0.2, cy + hl[1] * R * 0.2, 0, cx, cy, R);
  gr.addColorStop(0, mixHex(irisC, PAL.goldLight, 0.5)); gr.addColorStop(0.55, irisC); gr.addColorStop(1, mixHex(PAL.goldDark, PAL.fireDeep, red * 0.6));
  g.fillStyle = mixHex(PAL.goldDark, PAL.dragonDeep, 0.35); g.fill(al);
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.strokeStyle = rgba(PAL.goldDark, 0.45); g.lineWidth = R * 0.05; g.beginPath(); g.arc(cx, cy, R * 0.8, 0, TAU); g.stroke();
  const pw = R * lerp(0.12, 0.5, pupil), ph = R * 0.98;
  g.fillStyle = PAL.ink;
  g.beginPath(); g.moveTo(cx, cy - ph); g.quadraticCurveTo(cx + pw, cy, cx, cy + ph); g.quadraticCurveTo(cx - pw, cy, cx, cy - ph); g.fill();
  // 月牙高光
  const hx = cx + hl[0] * R * 0.45, hy = cy + hl[1] * R * 0.42, hr_ = R * 0.3;
  g.fillStyle = PAL.white;
  g.beginPath(); g.arc(hx, hy, hr_, Math.PI * 0.65, Math.PI * 1.85); g.arc(hx + hr_ * 0.28, hy + hr_ * 0.22, hr_ * 0.82, Math.PI * 1.85, Math.PI * 0.65, true); g.fill();
  g.globalAlpha *= 0.8; g.beginPath(); g.arc(cx - hl[0] * R * 0.38, cy - hl[1] * R * 0.36, R * 0.07, 0, TAU); g.fill();
  g.restore();
  // 上下眼睑的墨线
  g.strokeStyle = PAL.ink; g.lineWidth = Math.max(1, ry * 0.05); g.lineCap = 'round';
  g.beginPath(); g.moveTo(-rx, 0); g.quadraticCurveTo(0, -2 * ry * k, rx, 0); g.stroke();
  void t;
}

/**
 * 龙眼（巨龙、小蜥蜴、b09 黑暗里的巨眼、b11 分屏竖瞳共用）。中心 (x, y)，竖椭圆 w×h。
 * o: { open 0..1, pupil 0..1（竖瞳宽）, look:[dx,dy]（−1..1）, state:'normal'|'angry'|'smug'|'dizzy'|'closed'|'happy'|'x',
 *      red 0..1（虹膜发红）, glow 0..1（自发光）, inner(−1/1 内眼角方向), lid（眼皮色）, rot（弧度）, t, twitch 0..1（眼角抽搐）,
 *      hl:[x,y]（高光方向，默认左上）, sil（剪影时只画轮廓）, lw（眼皮墨线宽）,
 *      shape:'almond'（b09 杏仁形巨眼：w×h = 全睁时包围盒，眼睑从中线横着裂开；只用 open/pupil/look/red/glow/hl） }
 */
export function drawDragonEye(g, o = {}) {
  const { x = 0, y = 0, w = 66, h = 78, rot = 0, open = 1, pupil = 0.3, look = [0, 0], state = 'normal', red = 0, inner = -1,
    lid = PAL.dragon, t = 0, twitch = 0, sil = false } = o;
  const gl = o.glow ?? 0;
  const hl = o.hl || [-0.6, -0.8];
  const rx = w / 2, ry = h / 2;
  const lwI = o.lw ?? Math.max(0.8, w * 0.05);
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (gl > 0 && !sil) glow(g, 0, 0, w * 1.5, PAL.dragonEye, 0.55 * gl);
  if (o.shape === 'almond') { almondEye(g, rx, ry, o, open, pupil, look, red, hl, t); g.restore(); return; }
  let sy = 1;
  if (twitch > 0) sy = 1 - twitch * 0.2 * Math.abs(Math.sin(t * 43));
  g.scale(1, sy);
  const ball = blob(0, 0, rx, ry, { seed: 3, amp: 0.008, n: 40 });
  const closedLike = state === 'closed' || state === 'happy' || state === 'x';
  if (sil) {
    if (!closedLike && open > 0.05) {
      g.fillStyle = PAL.dragonEye; g.fill(ball);
      g.save(); g.clip(ball);
      const pw = w * lerp(0.1, 0.46, pupil);
      g.fillStyle = PAL.ink;
      g.beginPath(); g.moveTo(0, -ry * 0.82); g.quadraticCurveTo(pw, 0, 0, ry * 0.82); g.quadraticCurveTo(-pw, 0, 0, -ry * 0.82); g.fill();
      g.fillStyle = PAL.ink;
      g.fillRect(-rx - 2, -ry - 2, w + 4, (1 - open) * h + 2);
      g.restore();
    }
    g.restore();
    return;
  }
  // 眼窝（下一层纸，向右下错位）
  g.save(); g.translate(w * 0.035, h * 0.04);
  g.fillStyle = rgba(PAL.dragonDeep, 0.6); g.fill(blob(0, 0, rx * 1.1, ry * 1.08, { seed: 9, amp: 0.012, n: 40 }));
  g.restore();
  if (closedLike || open <= 0.04) {
    g.fillStyle = lid; g.fill(ball);
    g.save(); g.clip(ball);
    g.fillStyle = rgba(PAL.dragonDeep, 0.22); g.fillRect(-rx, ry * 0.2, w, ry);
    g.restore();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = w * 0.085;
    g.beginPath();
    if (state === 'happy') { g.moveTo(-rx * 0.82, ry * 0.22); g.quadraticCurveTo(0, -ry * 0.55, rx * 0.82, ry * 0.22); }
    else if (state === 'x') {
      const k = Math.min(rx, ry) * 0.62;
      g.moveTo(-k, -k); g.lineTo(k, k); g.moveTo(k, -k); g.lineTo(-k, k);
    } else {
      g.moveTo(-rx * 0.86, -ry * 0.02); g.quadraticCurveTo(0, ry * 0.5, rx * 0.86, -ry * 0.02);
      // 两根小睫毛（外眼角）
      const ox = -inner;
      g.moveTo(ox * rx * 0.78, ry * 0.08); g.lineTo(ox * rx * 1.02, ry * 0.26);
    }
    g.stroke();
    g.restore();
    return;
  }
  // 虹膜
  const irisC = mixHex(PAL.dragonEye, PAL.fire, red * 0.6);
  const edgeC = mixHex(PAL.goldDark, PAL.fireDeep, red * 0.7);
  const gr = g.createRadialGradient(hl[0] * rx * 0.25, hl[1] * ry * 0.2, 0, 0, 0, Math.max(rx, ry) * 1.02);
  gr.addColorStop(0, mixHex(irisC, PAL.goldLight, 0.55)); gr.addColorStop(0.55, irisC); gr.addColorStop(1, edgeC);
  g.fillStyle = gr;
  g.fill(ball);
  g.save();
  g.clip(ball);
  // 虹膜内环（深度）
  g.strokeStyle = rgba(PAL.goldDark, 0.35); g.lineWidth = w * 0.05;
  g.beginPath(); g.ellipse(0, 0, rx * 0.8, ry * 0.82, 0, 0, TAU); g.stroke();
  const px = look[0] * rx * 0.32, py = look[1] * ry * 0.2;
  if (state === 'dizzy') {
    g.strokeStyle = PAL.ink; g.lineWidth = w * 0.075; g.lineCap = 'round';
    g.beginPath();
    const R = Math.min(rx, ry) * 0.86, turns = 2.4;
    for (let k = 0; k <= 60; k++) {
      const u = k / 60, a = u * turns * TAU + t * 7, r = R * u;
      const X = Math.cos(a) * r, Y = Math.sin(a) * r * (ry / rx);
      if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke();
  } else {
    const pw = w * lerp(0.1, 0.46, pupil) * (state === 'angry' ? 0.8 : 1), ph = ry * 0.84;
    g.fillStyle = PAL.ink;
    g.beginPath(); g.moveTo(px, py - ph); g.quadraticCurveTo(px + pw, py, px, py + ph); g.quadraticCurveTo(px - pw, py, px, py - ph); g.fill();
  }
  // 高光：左上一大一小
  g.fillStyle = PAL.white;
  g.beginPath(); g.arc(hl[0] * rx * 0.42 + px * 0.3, hl[1] * ry * 0.44 + py * 0.3, rx * 0.25, 0, TAU); g.fill();
  g.globalAlpha *= 0.85;
  g.beginPath(); g.arc(-hl[0] * rx * 0.34 + px * 0.3, -hl[1] * ry * 0.4 + py * 0.3, rx * 0.1, 0, TAU); g.fill();
  g.globalAlpha /= 0.85;
  // 眼皮：盖住上沿（按 open 与 state）
  let c0, c1;                       // 内眼角 / 外眼角处的遮盖比例
  if (state === 'angry') { c0 = 0.4; c1 = 0.06; }
  else if (state === 'smug') { c0 = 0.44; c1 = 0.4; }
  else { c0 = 0.02; c1 = 0.0; }
  const cov = (k) => 1 - (1 - k) * open;  // open 越小越盖
  const e0 = cov(c0), e1 = cov(c1);
  const edge = (u) => {             // u: −1..1（x / rx），内眼角在 inner 一侧
    const k = (u * inner + 1) / 2;  // 0 = 外眼角，1 = 内眼角
    const c = lerp(e1, e0, k);
    return -ry + 2 * ry * c + ry * 0.14 * (1 - u * u) * clamp(c * 5);
  };
  const lidPts = [];
  for (let k = 0; k <= 12; k++) { const u = -1.05 + (2.1 * k) / 12; lidPts.push([u * rx, edge(clamp(u, -1, 1))]); }
  const lp = new Path2D();
  lp.moveTo(-rx * 1.2, -ry * 1.2); lp.lineTo(rx * 1.2, -ry * 1.2);
  for (let k = lidPts.length - 1; k >= 0; k--) lp.lineTo(lidPts[k][0], lidPts[k][1]);
  lp.closePath();
  g.fillStyle = lid; g.fill(lp);
  g.fillStyle = rgba(PAL.dragonDeep, 0.18); g.fill(lp);
  // 下眼睑一抹暗
  g.fillStyle = rgba(PAL.goldDark, 0.25);
  g.beginPath(); g.ellipse(0, ry * 1.02, rx * 1.1, ry * 0.2, 0, 0, TAU); g.fill();
  g.restore();
  // 眼皮墨线
  g.strokeStyle = PAL.ink; g.lineWidth = lwI * (state === 'angry' || state === 'smug' || open < 0.85 ? 1 : 0.7); g.lineCap = 'round'; g.lineJoin = 'round';
  const lineP = lidPts.filter((p) => Math.abs(p[0]) <= rx * 0.98);
  g.beginPath(); lineP.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  if (twitch > 0) {
    const ox = -inner * rx * 1.15;
    g.lineWidth = lwI * 0.8;
    g.globalAlpha *= clamp(twitch * 1.5);
    for (let k = 0; k < 3; k++) {
      const a = -0.7 + k * 0.6 + Math.sin(t * 31 + k) * 0.08;
      g.beginPath(); g.moveTo(ox + Math.cos(a) * rx * 0.2 * -inner, Math.sin(a) * ry * 0.3); g.lineTo(ox + Math.cos(a) * rx * 0.5 * -inner, Math.sin(a) * ry * 0.62); g.stroke();
    }
  }
  g.restore();
}

// ———————————————————— 头（头局部坐标：头心为原点，吻部朝 −x） ————————————————————
const HEAD_UP = [
  [-186, 32], [-191, 8], [-180, -16], [-152, -31], [-114, -42], [-78, -60], [-48, -94], [-8, -126], [44, -145], [100, -142],
  [146, -114], [174, -66], [183, -12], [172, 40], [140, 78], [98, 100], [62, 98], [34, 80], [-8, 71], [-60, 63], [-110, 57], [-158, 48],
];
const JAW_PIVOT = [50, 80];
const JAW = [
  [16, -16], [-20, -9], [-70, -18], [-112, -26], [-152, -32], [-186, -38], [-204, -40], [-215, -26], [-211, -4],
  [-190, 14], [-150, 28], [-96, 34], [-40, 30], [6, 20], [24, 2],
];
const LIP = [[50, 80], [34, 80], [-8, 71], [-60, 63], [-110, 57], [-158, 48], [-186, 32]];
const JAW_TOP = [[-203, -39], [-186, -37], [-152, -31], [-112, -25], [-70, -17], [-20, -8], [14, -12]];
const EYE_NEAR = { x: 34, y: -40, w: 66, h: 78, rot: -0.06, inner: -1 };
const EYE_FAR = { x: -52, y: -36, w: 46, h: 70, rot: 0.08, inner: 1 };
let HEAD_PATH = null, JAW_PATH = null;
function headPaths() {
  if (!HEAD_PATH) { HEAD_PATH = smoothPath(HEAD_UP, { closed: true, tension: 0.5 }); JAW_PATH = smoothPath(JAW, { closed: true, tension: 0.5 }); }
  return { up: HEAD_PATH, jaw: JAW_PATH };
}

/** 角：沿中心线的变宽条带，分 4 节纸片（根深尖浅）。 */
const HORN_C = [[0, 0], [2, -42], [20, -84], [58, -116], [104, -130], [142, -126], [164, -134]];
function hornBand(cl, w0, w1, a, b) {
  const pts = [];
  const n = 10;
  const L = arcLen(cl), tot = L[L.length - 1];
  const D = { d: cl, L, tot };
  const left = [], right = [];
  for (let k = 0; k <= n; k++) {
    const s = lerp(a, b, k / n) * tot;
    const f = frameAt(D, s);
    const w = lerp(w0, w1, Math.pow(s / tot, 1.45));
    left.push([f.x - f.nx * w, f.y - f.ny * w]);
    right.push([f.x + f.nx * w, f.y + f.ny * w]);
  }
  if (b >= 0.999) { const f = frameAt(D, tot); left.push([f.x + f.tx * 4, f.y + f.ty * 4]); }
  pts.push(...left, ...right.reverse());
  return smoothPath(pts, { closed: true, tension: 0.35 });
}
let HORN_BANDS = null;
function hornBands() {
  if (HORN_BANDS) return HORN_BANDS;
  const cl = catmull(HORN_C, 8);
  const cuts = [0, 0.27, 0.5, 0.74, 1];
  HORN_BANDS = { whole: hornBand(cl, 28, 1.5, 0, 1), bands: [], seams: [] };
  const D = { d: cl, L: arcLen(cl) }; D.tot = D.L[D.L.length - 1];
  for (let i = 0; i < 4; i++) {
    HORN_BANDS.bands.push(hornBand(cl, 28, 1.5, Math.max(0, cuts[i] - (i ? 0.02 : 0)), cuts[i + 1]));
    if (i) {
      const f = frameAt(D, cuts[i] * D.tot);
      const w = lerp(28, 1.5, Math.pow(cuts[i], 1.45));
      HORN_BANDS.seams.push([[f.x - f.nx * w * 0.95, f.y - f.ny * w * 0.95], [f.x + f.tx * 3, f.y + f.ty * 3], [f.x + f.nx * w * 0.95, f.y + f.ny * w * 0.95]]);
    }
  }
  const ft = frameAt(D, D.tot);
  HORN_BANDS.tip = [ft.x + ft.tx * 4, ft.y + ft.ty * 4];
  return HORN_BANDS;
}
const HORN_COLS = [mixHex(PAL.kraft, PAL.kraftDark, 0.55), PAL.kraft, mixHex(PAL.kraft, PAL.paper2, 0.55), mixHex(PAL.paper2, PAL.paper, 0.5)];
function drawHorn(g, S, x, y, sc, ang, far) {
  const HB = hornBands();
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(sc, sc);
  const SF = inFrame(S, ang);
  const dk = far ? 0.32 : 0;
  const tipOut = mApply(mMul(mMul(mT(x, y), mR(ang)), mS(sc)), HB.tip);
  if (S.sil) { g.fillStyle = S.silC; g.fill(HB.whole); g.restore(); return tipOut; }
  if (S.flat) { g.save(); g.lineJoin = 'round'; g.lineWidth = S.lw(8, 1.4) / sc; g.strokeStyle = PAL.paper; g.stroke(HB.whole); g.restore(); }
  if (S.detail) { g.save(); g.translate(SF.dd[0] * 4, SF.dd[1] * 4); g.fillStyle = rgba(PAL.dragonDeep, 0.28); g.fill(HB.whole); g.restore(); }
  if (S.detail) {
    HB.bands.forEach((p, i) => {
      g.fillStyle = mixHex(HORN_COLS[i], PAL.dragonDeep, dk);
      g.fill(p);
    });
    g.save(); g.clip(HB.whole);
    HB.seams.forEach((sm) => { strokeLine(g, sm, S.lw(3.2, 0.8, 4) / sc, mixHex(PAL.kraftDark, PAL.dragonDeep, 0.3 + dk), 0.75); });
    g.restore();
    formShade(g, SF, HB.whole, 80, -80, 90, PAL.kraftDark, 0.45);
    rimEdge(g, HB.whole, PAL.white, S.lw(2.4, 1, 4) / sc, SF.ld, far ? 0.25 : 0.65);
  } else {
    g.fillStyle = mixHex(PAL.kraft, PAL.dragonDeep, dk); g.fill(HB.whole);
  }
  g.restore();
  return tipOut;
}

/** 耳鳍（小蝙蝠翼形）：根 (x,y)，三根鳍刺。 */
function drawFin(g, S, x, y, sc, ang, t, lift, far) {
  const tips = [[78, -50 - lift * 30], [96, -12 - lift * 16], [80, 22]];
  const fl = Math.sin(t * 2.3 + (far ? 1.2 : 0)) * 3;
  const pts = [[0, -10], ...tips.flatMap((tp, i) => {
    const nx = tips[i + 1];
    const tip = [tp[0], tp[1] + fl * (i + 1) * 0.5];
    if (!nx) return [tip];
    return [tip, [(tp[0] + nx[0]) * 0.42 + 4, (tp[1] + nx[1]) * 0.5 + fl * 0.4]];
  }), [10, 22]];
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(sc, sc);
  const SF = inFrame(S, ang);
  const path = smoothPath(pts, { closed: true, tension: 0.32 });
  const col = far ? mixHex(PAL.dragonWing, PAL.dragonDeep, 0.38) : PAL.dragonWing;
  piece(g, SF, path, S.c(col), { drop: 3, rim: mixHex(PAL.dragonWing, PAL.white, 0.45) });
  if (!S.sil && S.detail) {
    for (const tp of tips) strokeLine(g, [[2, 0], [tp[0] * 0.55, tp[1] * 0.55 + fl * 0.3], [tp[0], tp[1] + fl]], S.lw(4, 0.8, 5) / sc, mixHex(PAL.dragonDark, PAL.dragonDeep, far ? 0.5 : 0.1), 0.85);
  }
  g.restore();
}

/** 牙（三角剪纸片），方向 dir（弧度，牙尖朝向）。 */
function tooth(g, S, x, y, base, len, dir, curve = 0.15) {
  const c = Math.cos(dir), s = Math.sin(dir);
  const bx = -s * base / 2, by = c * base / 2;
  const tip = [x + c * len + bx * curve * 2, y + s * len + by * curve * 2];
  const p = new Path2D();
  p.moveTo(x + bx, y + by);
  p.quadraticCurveTo(x + bx * 0.6 + c * len * 0.6, y + by * 0.6 + s * len * 0.6, tip[0], tip[1]);
  p.quadraticCurveTo(x - bx * 0.7 + c * len * 0.5, y - by * 0.7 + s * len * 0.5, x - bx, y - by);
  p.closePath();
  if (S.sil) { g.fillStyle = S.silC; g.fill(p); return; }
  g.fillStyle = PAL.white; g.fill(p);
  if (S.detail) {
    g.save(); g.clip(p);
    g.fillStyle = rgba(PAL.paper2, 0.9);
    g.beginPath(); g.moveTo(x - bx, y - by); g.lineTo(tip[0], tip[1]); g.lineTo(x + c * len * 0.2, y + s * len * 0.2); g.closePath(); g.fill();
    g.restore();
  }
}

/** 怒筋（“井”字形四段弧）。 */
function veinMark(g, x, y, r, col, lw) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
  for (let q = 0; q < 4; q++) {
    g.save(); g.rotate(q * Math.PI / 2 + 0.2);
    g.beginPath(); g.moveTo(r * 0.28, -r * 0.95); g.quadraticCurveTo(r * 0.3, -r * 0.3, r * 0.95, -r * 0.28); g.stroke();
    g.restore();
  }
  g.restore();
}

/** 鼻孔旁的卷云纹（阿基米德螺线）。 */
function swirl(cx, cy, r0, r1, turns, a0, dir = 1) {
  const pts = [];
  for (let k = 0; k <= 26; k++) { const u = k / 26, a = a0 + dir * u * turns * TAU, r = lerp(r0, r1, u); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

/**
 * 头（头局部坐标）。H: { jaw 0..1, jawDeg, eyes, nostril, redden, vein, steam, spikes, t, seed, chew, tongue }
 * 返回头局部锚点：{ mouth, mouthDir, nose, eyeN, eyeF, hornN, hornF, jawTip }
 */
function drawHeadLocal(g, S, H) {
  const t = H.t ?? 0;
  const P = headPaths();
  const jawA = -(H.jawDeg ?? clamp(H.jaw ?? 0) * 60) * D2R;   // 张嘴 = 下颚绕铰链向下转
  const jo = clamp((H.jawDeg ?? (H.jaw ?? 0) * 60) / 60);
  const sp = clamp(H.spikes ?? 0);
  const E = H.eyes;
  const out = {};
  const bodyC = S.c(PAL.dragon), rimC = mixHex(PAL.dragon, PAL.white, 0.42);
  // —— 远侧角、远耳、后脑刺（都在头后） ——
  out.hornF = drawHorn(g, S, 22, -134, 0.86, -0.12, true);
  drawFin(g, S, 116, -112, 0.78, -0.55, t, sp, true);
  const spikesAt = [[124, -128, -0.75], [160, -92, -0.38], [180, -42, -0.06], [178, 10, 0.22]];
  for (const [x, y, a] of spikesAt) {
    const L = 24 + sp * 34, b = 32;
    const c = Math.cos(a), s = Math.sin(a);
    const p = new Path2D();
    p.moveTo(x - s * -b / 2 - c * 6, y + c * -b / 2 - s * 6);
    p.lineTo(x + c * L + s * 4, y + s * L - c * 4);
    p.lineTo(x + s * -b / 2 - c * 6, y - c * -b / 2 - s * 6);
    p.closePath();
    piece(g, S, p, S.c(PAL.dragonDark), { rim: mixHex(PAL.dragonDark, PAL.white, 0.3) });
  }
  // —— 口腔、舌、下颚 ——
  const jawM = mMul(mT(JAW_PIVOT[0], JAW_PIVOT[1]), mR(jawA));
  const jawTopH = JAW_TOP.map((p) => mApply(jawM, p));
  if (jo > 0.01) {
    const mouthPts = [...LIP, ...jawTopH];
    const mp = smoothPath(mouthPts, { closed: true, tension: 0.4 });
    if (S.sil) { g.fillStyle = S.silC; g.fill(mp); }
    else {
      g.fillStyle = PAL.redDeep; g.fill(mp);
      g.save(); g.clip(mp);
      g.fillStyle = rad(g, JAW_PIVOT[0] - 10, JAW_PIVOT[1] - 6, 10, 170, [[0, rgba(PAL.dragonDeep, 0.85)], [1, rgba(PAL.dragonDeep, 0)]]);
      g.fill(mp);
      g.restore();
    }
  }
  g.save();
  g.translate(JAW_PIVOT[0], JAW_PIVOT[1]); g.rotate(jawA);
  const SJ = inFrame(S, jawA);
  if (jo > 0.01) {
    // 舌：贴着下颚，张大时舌尖上翘
    const lift = jo * 32 + Math.sin(t * 5) * 3 * jo;
    const tc = [[8, -10], [-40, -21], [-86, -31], [-118, -40 - lift * 0.5], [-140, -50 - lift]];
    const tw = [20, 20, 18, 14, 9];
    const L2 = [], R2 = [];
    for (let i = 0; i < tc.length; i++) {
      const a = tc[Math.max(0, i - 1)], b = tc[Math.min(tc.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      L2.push([tc[i][0] - dy / l * tw[i], tc[i][1] + dx / l * tw[i]]);
      R2.push([tc[i][0] + dy / l * tw[i], tc[i][1] - dx / l * tw[i]]);
    }
    const tip = tc[tc.length - 1];
    const fork = [[tip[0] - 18, tip[1] - 12], [tip[0] - 8, tip[1] - 1], [tip[0] - 18, tip[1] + 8]];
    const tp = smoothPath([...L2, fork[0], fork[1], fork[2], ...R2.reverse()], { closed: true, tension: 0.35 });
    if (S.sil) { g.fillStyle = S.silC; g.fill(tp); }
    else {
      g.fillStyle = PAL.heart; g.fill(tp);
      strokeLine(g, tc.slice(0, 4).map((p) => [p[0], p[1]]), S.lw(3, 0.8, 4), mixHex(PAL.heart, PAL.redDeep, 0.45), 0.7);
      rimEdge(g, tp, mixHex(PAL.heart, PAL.white, 0.5), S.lw(2.2, 0.8, 3.5), SJ.ld, 0.6);
    }
  }
  if (jo > 0.03 && !S.sil) {
    // 嘴角颊皮：口腔里铰链附近的一小片皮（盖住嘴角最深处的暗色三角）
    const hJ = rotV(6, -6, -jawA), lJ = rotV(-60, -10, -jawA), eJ = [-42, -14];
    const mid = [(lJ[0] + eJ[0]) / 2, (lJ[1] + eJ[1]) / 2];
    const ctl = [lerp(mid[0], hJ[0], 0.45), lerp(mid[1], hJ[1], 0.45)];
    const ck = new Path2D(); ck.moveTo(hJ[0], hJ[1]); ck.lineTo(lJ[0], lJ[1]); ck.quadraticCurveTo(ctl[0], ctl[1], eJ[0], eJ[1]); ck.closePath();
    g.fillStyle = mixHex(PAL.dragon, PAL.dragonDeep, 0.32); g.fill(ck);
    strokeLine(g, [hJ, [lerp(ctl[0], hJ[0], 0.2), lerp(ctl[1], hJ[1], 0.2)]], S.lw(2.6, 0.8, 4), PAL.dragonDeep, 0.4);
  }
  piece(g, SJ, P.jaw, bodyC, { drop: 3, rim: rimC });
  if (!S.sil) {
    // 下巴腹甲（青绿）+ 横纹
    g.save(); g.clip(P.jaw);
        g.fillStyle = PAL.dragonBelly; g.fill(smoothPath([[-218, -2], [-160, 8], [-100, 12], [-30, 8], [32, -4], [32, 50], [-220, 50]], { closed: true, tension: 0.3 }));
    if (S.detail) {
      for (let k = 0; k < 5; k++) { const x = -178 + k * 40; strokeLine(g, [[x, 11], [x + 7, 33]], S.lw(2.4, 0.7, 3.5), mixHex(PAL.dragonBelly, PAL.dragonDark, 0.4), 0.6); }
      formShade(g, SJ, P.jaw, -100, 0, 60, PAL.dragonDeep, 0.35);
    }
    g.restore();
    // 下牙（只在张嘴时露出）
    if (jo > 0.02) {
      const tl = clamp(jo * 5);
      for (const [x, y, b, l] of [[-188, -37, 14, 18], [-154, -31, 11, 11], [-122, -27, 11, 11], [-90, -22, 11, 11], [-58, -15, 10, 10]]) tooth(g, S, x, y + 2, b, l * tl, -Math.PI / 2 + 0.1);
    }
  }
  g.restore();
  // —— 上头（颅 + 吻） ——
  const SH = S;
  piece(g, SH, P.up, bodyC, { drop: 3.5, rim: rimC, rimW: S.lw(3.2, 1, 5) });
  if (!S.sil) {
    g.save(); g.clip(P.up);
    // 吻背亮片 + 额顶亮片（纸片层次）
    if (S.detail) {
      g.fillStyle = rgba(mixHex(PAL.dragon, PAL.white, 0.3), 0.55);
      g.fill(blob(-124, -27, 56, 11, { seed: 4, rot: -0.22, amp: 0.02 }));
      g.fillStyle = rgba(mixHex(PAL.dragon, PAL.white, 0.25), 0.4);
      g.fill(blob(30, -118, 70, 18, { seed: 6, rot: -0.12, amp: 0.02 }));
      // 颅顶鳞片
      for (const [x, y, r] of [[78, -108, 13], [108, -84, 12], [132, -52, 11], [96, -56, 10], [148, -16, 10], [122, -16, 9]]) {
        g.strokeStyle = rgba(PAL.dragonDark, 0.32); g.lineWidth = S.lw(2.6, 0.7, 3.5);
        g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      // 下颌线下的暗面
      g.fillStyle = rgba(PAL.dragonDeep, 0.22);
      g.fill(smoothPath([[-190, 30], [-110, 48], [-20, 62], [60, 78], [150, 70], [190, 40], [190, 130], [-190, 130]], { closed: true, tension: 0.4 }));
    }
    g.restore();
    formShade(g, SH, P.up, 0, -20, 190, PAL.dragonDeep, 0.3);
  }
  // —— 上牙 ——
  if (!S.sil || jo > 0.05) {
    const small = clamp(jo * 6);
    if (small > 0) for (const x of [-138, -104, -70, -36]) { const y = lerp(57, 71, (x + 158) / 150); tooth(g, S, x, y - 2, 12, 12 * small, Math.PI / 2 - 0.08); }
    tooth(g, S, -168, 44, 17, 24 + jo * 4, Math.PI / 2 + 0.12);
    tooth(g, S, 4, 72, 14, 18 + jo * 3, Math.PI / 2 - 0.1);
  }
  // —— 闭嘴墨线（唇缝，嘴角上扬） ——
  if (!S.sil && jo < 0.08) {
    strokeLine(g, [[-176, 37], [-150, 48], [-104, 57], [-56, 63], [-6, 71], [34, 78], [52, 72], [60, 58]], 9, PAL.ink, clamp(1 - jo * 14));
  }
  // —— 眼、眉 ——
  const hlL = (r) => { const v = rotV(S.ld[0], S.ld[1], -r); const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const eyeKeep = S.sil && S.keep.has('eye');
  const st = E.state || 'normal';
  // eyes.one：只睁近侧一只眼——远眼闭着（剪影里干脆不画），近眼若给的是闭眼类状态则按 normal 睁开（与小蜥蜴同一语义）
  const nearSt = E.one && CLOSED_LIKE.has(st) ? 'normal' : st;
  for (const [EY, far] of [[EYE_FAR, true], [EYE_NEAR, false]]) {
    if (S.sil && !eyeKeep) continue;
    if (far && E.one && S.sil) continue;
    drawDragonEye(g, {
      x: EY.x, y: EY.y, w: EY.w, h: EY.h, rot: EY.rot, inner: EY.inner, open: E.open, pupil: E.pupil, look: E.look || [0, 0],
      state: E.one ? (far ? 'closed' : nearSt) : st, red: E.red || 0, glow: far && E.one ? 0 : E.glow || 0, t, twitch: far ? 0 : E.twitch || 0, hl: hlL(EY.rot),
      lid: far ? mixHex(PAL.dragon, PAL.dragonDeep, 0.12) : PAL.dragon, lw: S.lw(3.4, 0.8, 9 * S.px), sil: false,   // 剪影里保留的眼睛画全彩（发光眼）
    });
  }
  out.eyeN = [EYE_NEAR.x, EYE_NEAR.y]; out.eyeF = [EYE_FAR.x, EYE_FAR.y];
  if (!S.sil) {
    // 眉（ink 短弧）
    const browW = 9.5;
    let nb, fb;
    if (st === 'angry') { nb = [[2, -80], [34, -96], [70, -114]]; fb = [[-82, -106], [-56, -100], [-30, -84]]; }
    else if (st === 'smug') { nb = [[4, -100], [36, -118], [70, -116]]; fb = [[-82, -92], [-56, -100], [-30, -96]]; }
    else if (st === 'dizzy' || st === 'x') { nb = [[4, -104], [36, -112], [68, -100]]; fb = [[-82, -96], [-56, -104], [-30, -98]]; }
    else if (st === 'worried') { nb = [[4, -112], [36, -110], [68, -98]]; fb = [[-82, -94], [-56, -104], [-30, -110]]; }
    else { nb = [[4, -100], [36, -112], [68, -106]]; fb = [[-82, -92], [-56, -100], [-30, -96]]; }
    strokeLine(g, fb, browW * 0.85, PAL.ink, 0.95);
    strokeLine(g, nb, browW, PAL.ink, 1);
  }
  // —— 近侧角、近耳 ——
  out.hornN = drawHorn(g, S, 82, -126, 1, 0, false);
  drawFin(g, S, 150, -58, 1, -0.2, t, sp, false);
  // —— 鼻孔 + 卷云纹 ——
  const fl = 1 + clamp(H.nostril ?? 0) * 0.55;
  if (!S.sil) {
    g.save();
    // 鼻孔边：略亮的一片纸，压在吻部上（右下错位一点暗边）
    const rimP = blob(-160, -14, 20 + 6 * (fl - 1), 12 + 4 * (fl - 1), { seed: 12, rot: 0.42, amp: 0.035, n: 28 });
    if (S.detail) { g.save(); g.translate(S.dd[0] * 2.5, S.dd[1] * 2.5); g.fillStyle = rgba(PAL.dragonDeep, 0.35); g.fill(rimP); g.restore(); }
    g.fillStyle = mixHex(PAL.dragon, PAL.white, 0.2); g.fill(rimP);
    // 近鼻孔：逗号形缝（尾巴朝后上卷）
    g.save(); g.translate(-162, -13); g.rotate(0.42); g.scale(fl, fl);
    const nos = new Path2D();
    nos.moveTo(-11, 3); nos.bezierCurveTo(-12, -6, -2, -8, 7, -6); nos.bezierCurveTo(13, -5, 16, -10, 14, -15);
    nos.bezierCurveTo(20, -8, 16, 2, 6, 4); nos.bezierCurveTo(-2, 6, -9, 7, -11, 3); nos.closePath();
    g.fillStyle = PAL.dragonDeep; g.fill(nos);
    g.restore();
    // 远鼻孔（吻尖另一侧，只露一点）
    g.fillStyle = PAL.dragonDeep;
    g.beginPath(); g.ellipse(-188, -8, 4.5 * fl, 3.2 * fl, 0.5, 0, TAU); g.fill();
    if (S.detail) {
      // 鼻孔纹：卷云 + 两道吻背纹
      strokeLine(g, swirl(-128, -24, 2.5, 17, 1.35, Math.PI * 0.95, 1), S.lw(3.4, 0.9, 6), PAL.dragonDark, 0.8, false);
      strokeLine(g, [[-146, -2], [-122, 4], [-98, 0]], S.lw(3, 0.8, 5), PAL.dragonDark, 0.55);
      strokeLine(g, [[-112, -40], [-92, -46], [-72, -56]], S.lw(2.6, 0.7, 4.5), PAL.dragonDark, 0.4);
    }
    g.restore();
  }
  out.nose = [-172, -12];
  // —— 腮红 ——
  if (!S.sil) {
    const rd = clamp(H.redden ?? 0);
    g.save();
    g.globalAlpha *= 0.45 + rd * 0.35;
    g.fillStyle = PAL.blush;
    g.beginPath(); g.ellipse(64, 30, 31 * (1 + rd * 0.25), 15 * (1 + rd * 0.2), -0.12, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-100, 16, 17, 11, 0.1, 0, TAU); g.fill();
    g.restore();
    if (rd > 0) {
      // 脸红：以两腮之间为中心的一团 fireDeep，越往后脑越淡
      g.save();
      g.clip(P.up);
      g.fillStyle = rad(g, -10, 12, 20, 230, [[0, rgba(PAL.fireDeep, 0.5 * rd)], [0.55, rgba(PAL.fireDeep, 0.26 * rd)], [1, rgba(PAL.fireDeep, 0)]]);
      g.fill(P.up);
      g.restore();
      // 脸红斜线
      for (let k = 0; k < 3; k++) strokeLine(g, [[44 + k * 16, 38], [52 + k * 16, 22]], S.lw(3, 0.8, 5), PAL.redDark, 0.55 * rd);
    }
  }
  // —— 怒筋 ——
  if ((H.vein ?? 0) > 0 && !S.sil) {
    const v = clamp(H.vein);
    veinMark(g, 92, -96, 22 * v * (1 + 0.12 * Math.sin(t * 13)), PAL.red, 7.5 * v);
  }
  // —— 鼻孔蒸汽 ——
  const steams = H.steam == null ? [] : [].concat(H.steam);
  if (!S.sil) for (const te of steams) {
    const age = t - te;
    if (age < 0 || age > 1.1) continue;
    for (let k = 0; k < 4; k++) {
      const a2 = age - k * 0.07;
      if (a2 < 0) continue;
      for (const [nx, ny, sgn] of [[-166, -18, 1], [-188, -9, 0.7]]) {
        const d = 110 * (1 - Math.exp(-a2 * 3.2));
        const x = nx - d * 0.9 - k * 6, y = ny - d * 0.45 - a2 * 40 * sgn;
        const r = (9 + a2 * 34) * sgn;
        const al = Math.pow(clamp(1 - a2 / 1.1), 1.4) * 0.9;
        g.save(); g.globalAlpha *= al;
        g.fillStyle = PAL.white;
        g.fill(blob(x, y, r, r * 0.85, { seed: 20 + k * 3 + Math.round(sgn * 5), amp: 0.06, n: 24 }));
        g.fillStyle = rgba(PAL.paper2, 0.8);
        g.fill(blob(x + r * 0.25, y + r * 0.3, r * 0.6, r * 0.45, { seed: 31 + k, amp: 0.05, n: 20 }));
        g.restore();
      }
    }
  }
  // 锚点
  const jawTipH = mApply(jawM, [-206, -18]);
  out.jawTip = jawTipH;
  out.mouth = [lerp(-178, jawTipH[0], 0.5) + 6, lerp(46, jawTipH[1], 0.5)];
  out.mouthDir = Math.atan2(lerp(-0.25, 0.5, jo) * 0.6, -1);
  out.hinge = JAW_PIVOT;
  return out;
}

/**
 * 喉皮：张嘴时把下颚腹面和脖子腹侧连成一片（填掉嘴角到脖子之间露底色的楔形）。
 * 头局部坐标；必须画在脖子 / 身体之前——脖子与下颚都压在它上面，只露出楔形那一块。
 * edge = 脖子腹侧边线（头局部坐标，从脖根往外，已向内收进几 px）。
 */
function drawThroat(g, S, jawDeg, edge) {
  const jo = clamp(jawDeg / 60);
  if (jo < 0.02 || !edge || edge.length < 2) return;
  const P = JAW_PIVOT;
  const jawM = mMul(mT(P[0], P[1]), mR(-jawDeg * D2R));
  const Jp = [[22, 6], [6, 20], [-24, 27], [-52, 31], [-84, 33]].map((p) => mApply(jawM, p));
  const a = Jp[Jp.length - 1], rJ = dist(a, P);
  let i0 = 0, best = Infinity;
  edge.forEach((p, i) => { const d = dist(p, P); if (d < best) { best = d; i0 = i; } });
  const Np = [];
  for (let i = i0; i < edge.length; i++) { Np.push(edge[i]); if (dist(edge[i], P) > rJ * 1.2) break; }
  if (Np.length < 2) return;
  const b = Np[Np.length - 1];
  const ctl = mixP(mixP(a, b, 0.5), P, lerp(0.85, 0.32, jo));   // 下缘向铰链凹进去 = 绷紧的皮
  const path = new Path2D();
  path.moveTo(P[0] + 18, P[1] - 14);
  for (const p of Jp) path.lineTo(p[0], p[1]);
  path.quadraticCurveTo(ctl[0], ctl[1], b[0], b[1]);
  for (let i = Np.length - 2; i >= 0; i--) path.lineTo(Np[i][0], Np[i][1]);
  path.closePath();
  piece(g, S, path, S.c(mixHex(PAL.dragonBelly, PAL.dragonDeep, 0.2)), { part: 'throat', noEdge: true });
  if (S.sil || !S.detail) return;
  g.save(); g.clip(path);
  // 以铰链为心的拉伸纹 + 靠下颚一侧的暗面
  g.strokeStyle = rgba(BELLY_LINE, 0.7); g.lineWidth = S.lw(2.4, 0.7, 3.6);
  for (const k of [0.42, 0.66, 0.9]) { g.beginPath(); g.arc(P[0], P[1], rJ * k, 0, TAU); g.stroke(); }
  formShade(g, S, path, P[0], P[1] + rJ * 0.6, rJ, PAL.dragonDeep, 0.4);
  g.restore();
}

// ———————————————————— 翅膀与前爪 ————————————————————
/** 翅膀几何（翅根局部：x = 朝尾，y = 朝腹；向上 = −y）。 */
function wingGeom(open, flapA) {
  const armA = lerp(-14, -72, open) * D2R + flapA;
  const armL = lerp(96, 118, open);
  const wrist = [Math.cos(armA) * armL, Math.sin(armA) * armL];
  const fA = [lerp(-6, -38, open), lerp(3, -4, open), lerp(12, 30, open)].map((a, i) => a * D2R + flapA * (0.75 - i * 0.12));
  const fL = [lerp(108, 150, open), lerp(92, 132, open), lerp(70, 100, open)];
  const tips = fA.map((a, i) => [wrist[0] + Math.cos(a) * fL[i], wrist[1] + Math.sin(a) * fL[i]]);
  const back = [lerp(64, 92, open), lerp(-2, 8, open)];
  return { wrist, tips, back };
}
function drawWing(g, S, root, ang, open, flapA, far, k = 1) {
  const W = wingGeom(open, flapA);
  g.save();
  g.translate(root[0], root[1]); g.rotate(ang);
  g.scale(WING_K * k, WING_K * k);
  if (far) g.scale(0.86, 0.86);
  const SF = inFrame(S, ang);
  const memC = far ? mixHex(PAL.dragonWing, PAL.dragonDeep, 0.42) : PAL.dragonWing;
  const memC2 = far ? mixHex(PAL.dragonWing, PAL.dragonDeep, 0.52) : mixHex(PAL.dragonWing, PAL.dragonDark, 0.2);
  const boneC = far ? mixHex(PAL.dragonDark, PAL.dragonDeep, 0.5) : PAL.dragonDark;
  const sc = (a, b, k = 0.24) => { const m = mixP(a, b, 0.5); return [lerp(m[0], W.wrist[0], k), lerp(m[1], W.wrist[1], k)]; };
  // 三块翼膜（交替深浅 = 纸片层次）
  const panels = [
    [W.wrist, W.tips[0], W.tips[1]],
    [W.wrist, W.tips[1], W.tips[2]],
    [W.wrist, W.tips[2], W.back, [0, 6]],
  ];
  const whole = new Path2D();
  whole.moveTo(0, 6); whole.lineTo(W.wrist[0], W.wrist[1]); whole.lineTo(W.tips[0][0], W.tips[0][1]);
  for (let i = 0; i < 3; i++) {
    const a = W.tips[i], b = i < 2 ? W.tips[i + 1] : W.back;
    const c = sc(a, b, i < 2 ? 0.26 : 0.16);
    whole.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  }
  whole.closePath();
  if (S.sil) { g.fillStyle = S.silC; g.fill(whole); }
  else {
    if (S.flat) { g.save(); g.lineJoin = 'round'; g.lineWidth = S.lw(9, 1.4); g.strokeStyle = PAL.paper; g.stroke(whole); g.restore(); }
    if (S.detail) { g.save(); g.translate(SF.dd[0] * 4, SF.dd[1] * 4); g.fillStyle = rgba(PAL.dragonDeep, 0.3); g.fill(whole); g.restore(); }
    g.fillStyle = memC; g.fill(whole);
    if (S.detail) {
      g.save(); g.clip(whole);
      g.fillStyle = memC2;
      const p2 = new Path2D(); p2.moveTo(W.wrist[0], W.wrist[1]); p2.lineTo(W.tips[1][0], W.tips[1][1]); p2.lineTo(W.tips[2][0] + 40, W.tips[2][1] + 40); p2.lineTo(W.wrist[0] + 10, W.wrist[1] + 60); p2.closePath();
      g.fill(p2);
      g.fillStyle = rgba(PAL.white, far ? 0.04 : 0.12);
      g.fill(blob(W.wrist[0] + 50, W.wrist[1] - 30, 70, 26, { seed: 2, rot: -0.6, amp: 0.05 }));
      g.restore();
      rimEdge(g, whole, mixHex(PAL.dragonWing, PAL.white, 0.5), S.lw(2.4, 0.9, 4), SF.ld, far ? 0.25 : 0.6);
    }
    // 骨
    const bw = S.lw(7, 1.2, 12);
    strokeLine(g, [[0, 4], [W.wrist[0] * 0.5, W.wrist[1] * 0.5 - 2], W.wrist], bw * 1.2, boneC, 1);
    for (const tp of W.tips) strokeLine(g, [W.wrist, mixP(W.wrist, tp, 0.5), tp], bw * 0.8, boneC, 1);
    // 腕爪
    const c = W.wrist;
    const claw = new Path2D(); claw.moveTo(c[0] - 6, c[1] - 2); claw.quadraticCurveTo(c[0] - 18, c[1] - 26, c[0] - 4, c[1] - 30); claw.quadraticCurveTo(c[0] - 6, c[1] - 14, c[0] + 6, c[1] - 4); claw.closePath();
    g.fillStyle = far ? PAL.kraft : PAL.paper2; g.fill(claw);
  }
  g.restore();
  const M = mMul(mMul(mT(root[0], root[1]), mR(ang)), mS(WING_K * k * (far ? 0.86 : 1)));
  return { tip: mApply(M, W.tips[0]), wrist: mApply(M, W.wrist) };
}

/** 前爪（小短手 + 三根爪尖）。根 root，局部 x = 朝尾、y = 朝腹（前方 = −x）。reach 0 收在胸前 → 1 向前下方伸。返回爪尖（原生坐标）。 */
function drawArm(g, S, root, ang, reach, grip, far, scale = 1) {
  const r = clamp(reach);
  const a1 = lerp(102, 138, r) * D2R, l1 = 58;
  const elbow = [Math.cos(a1) * l1, Math.sin(a1) * l1];
  const a2 = lerp(206, 172, r) * D2R, l2 = 50;
  const hand = [elbow[0] + Math.cos(a2) * l2, elbow[1] + Math.sin(a2) * l2];
  g.save();
  g.translate(root[0], root[1]); g.rotate(ang); g.scale(scale, scale);
  if (far) g.scale(0.88, 0.88);
  const SF = inFrame(S, ang);
  const col = far ? mixHex(PAL.dragon, PAL.dragonDeep, 0.4) : PAL.dragon;
  const limb = (a, b, w0, w1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return smoothPath([[a[0] + nx * w0, a[1] + ny * w0], [b[0] + nx * w1, b[1] + ny * w1], [b[0] + dx / l * w1 * 0.8, b[1] + dy / l * w1 * 0.8], [b[0] - nx * w1, b[1] - ny * w1], [a[0] - nx * w0, a[1] - ny * w0], [a[0] - dx / l * w0 * 0.7, a[1] - dy / l * w0 * 0.7]], { closed: true, tension: 0.4 });
  };
  const up = limb([0, 0], elbow, 21, 16), fo = limb(elbow, hand, 16, 14);
  const rimC = mixHex(PAL.dragon, PAL.white, 0.35);
  piece(g, SF, up, S.c(col), { drop: 2.5, rim: rimC });
  piece(g, SF, fo, S.c(col), { drop: 2.5, rim: rimC });
  if (!S.sil && S.detail) {
    // 前臂内侧一条青绿腹甲
    g.save(); g.clip(fo);
    const dx = hand[0] - elbow[0], dy = hand[1] - elbow[1], l = Math.hypot(dx, dy) || 1;
    const nx = dy / l, ny = -dx / l;            // 指向下侧（腹侧）
    const sgn = ny > 0 ? 1 : -1;
    g.fillStyle = rgba(PAL.dragonBelly, far ? 0.45 : 0.9);
    g.fill(smoothPath([[elbow[0] + nx * 3 * sgn, elbow[1] + ny * 3 * sgn], [hand[0] + nx * 3 * sgn, hand[1] + ny * 3 * sgn], [hand[0] + nx * 22 * sgn, hand[1] + ny * 22 * sgn], [elbow[0] + nx * 22 * sgn, elbow[1] + ny * 22 * sgn]], { closed: true, tension: 0 }));
    g.restore();
    formShade(g, SF, up, elbow[0] * 0.5, elbow[1] * 0.5, 22, PAL.dragonDeep, 0.3);
  }
  // 爪掌 + 三根爪（向前，爪尖朝腹侧勾）
  const pa = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
  const palm = blob(hand[0], hand[1], 18, 15, { seed: far ? 4 : 5, rot: pa, amp: 0.03, n: 28 });
  piece(g, SF, palm, S.c(col), { drop: 2, rim: rimC });
  const gp = clamp(grip);
  let tipSum = [0, 0];
  for (let k = 0; k < 3; k++) {
    const spread = (k - 1) * 0.5;
    const base = [hand[0] + Math.cos(pa + spread) * 12, hand[1] + Math.sin(pa + spread) * 12];
    const cs = Math.cos(pa) < 0 ? 1 : -1;       // 朝腹侧（+y）卷
    const dir = pa + spread * 0.55 - cs * lerp(0.75, 0.25, r);
    const len = 23 - Math.abs(k - 1) * 3;
    const c = Math.cos(dir), s = Math.sin(dir);
    const curlA = dir - cs * (0.95 + gp * 0.85);
    const tip = [base[0] + c * len * 0.62 + Math.cos(curlA) * len * 0.5, base[1] + s * len * 0.62 + Math.sin(curlA) * len * 0.5];
    const p = new Path2D();
    p.moveTo(base[0] - s * 5.5, base[1] + c * 5.5);
    p.quadraticCurveTo(base[0] + c * len * 0.75 - s * 3, base[1] + s * len * 0.75 + c * 3, tip[0], tip[1]);
    p.quadraticCurveTo(base[0] + c * len * 0.5 + s * 4, base[1] + s * len * 0.5 - c * 4, base[0] + s * 5.5, base[1] - c * 5.5);
    p.closePath();
    if (S.sil) { g.fillStyle = S.silC; g.fill(p); }
    else {
      g.fillStyle = far ? PAL.kraft : PAL.paper2; g.fill(p);
      if (S.detail && !far) { g.save(); g.clip(p); g.fillStyle = rgba(PAL.kraft, 0.75); g.beginPath(); g.arc(base[0] + s * 6, base[1] - c * 6, 8, 0, TAU); g.fill(); g.restore(); }
    }
    tipSum = [tipSum[0] + tip[0] / 3, tipSum[1] + tip[1] / 3];
  }
  g.restore();
  const M = mMul(mMul(mMul(mT(root[0], root[1]), mR(ang)), mS(scale)), mS(far ? 0.88 : 1));
  return mApply(M, tipSum);
}

// ———————————————————— 身体部件 ————————————————————
/** 一节身体：[sa, sb] 段的剪纸片，capSide = 1 在尾侧收圆头（压在下一节上），−1 在头侧。 */
function piecePath(D, sa, sb, wOf, capSide) {
  const back = [], belly = [];
  const n = Math.max(4, Math.ceil((sb - sa) / 12));
  for (let k = 0; k <= n; k++) {
    const s = sa + ((sb - sa) * k) / n, f = frameAt(D, s), w = wOf(s) / 2;
    back.push(fp(f, 0, -w)); belly.push(fp(f, 0, w));
  }
  const cap = (s, dir) => {
    const f = frameAt(D, s), w = wOf(s) / 2, c = w * 0.62, pts = [];
    for (let j = 1; j < 7; j++) {
      const ph = -Math.PI / 2 + (Math.PI * j) / 7;
      pts.push(fp(f, Math.cos(ph) * c * dir, Math.sin(ph) * w * (dir > 0 ? 1 : -1)));
    }
    return pts;
  };
  let pts;
  if (capSide > 0) pts = [...back, ...cap(sb, 1), ...belly.reverse()];
  else if (capSide < 0) pts = [...back, ...belly.reverse(), ...cap(sa, -1)];
  else pts = [...back, ...belly.reverse()];
  return smoothPath(pts, { closed: true, tension: 0.42 });
}
/** 沿 [sa, sb] 的带状区（法向从 o0 到 o1，按半宽比例）。 */
function bandPath(D, sa, sb, wOf, o0, o1) {
  const A = [], B = [];
  const n = Math.max(3, Math.ceil((sb - sa) / 14));
  for (let k = 0; k <= n; k++) {
    const s = sa + ((sb - sa) * k) / n, f = frameAt(D, s), w = wOf(s) / 2;
    A.push(fp(f, 0, o0 * w)); B.push(fp(f, 0, o1 * w));
  }
  return smoothPath([...A, ...B.reverse()], { closed: true, tension: 0.3 });
}
/** 黑桃尾尖（局部：x 指向尾尖，中心在原点）。 */
function spadePath(k = 1, seed = 3) {
  const pts = [[64, 0], [36, -20], [12, -40], [-14, -54], [-40, -50], [-56, -32], [-52, -12], [-40, 0], [-52, 12], [-56, 32], [-40, 50], [-14, 54], [12, 40], [36, 20]];
  return smoothPath(pts.map(([x, y], i) => [x * k + (hash2(seed, i) - 0.5) * 1.2, y * k + (hash2(seed + 1, i) - 0.5) * 1.2]), { closed: true, tension: 0.45 });
}

const BELLY_LINE = mixHex(PAL.dragonBelly, PAL.dragonDark, 0.38);
const RIM_BODY = mixHex(PAL.dragon, PAL.white, 0.42);

/** 背板 / 黑桃上的字（正立框架里画）。 */
function drawPlateFace(g, S, R, plate, i, ang, isSpade) {
  const lit = clamp(plate.lit ?? 0);
  const ch = plate.char ?? DRAGON_CHARS[i];
  if (!isSpade) {
    const rimP = blob(0, 0, R, R, { seed: 40 + i, amp: 0.014, n: 36 });
    const faceP = blob(0, 0, R * 0.82, R * 0.82, { seed: 60 + i, amp: 0.012, n: 32 });
    if (S.sil && !S.keep.has('plates')) { g.fillStyle = S.silC; g.fill(rimP); return; }
    if (S.flat) { g.save(); g.lineWidth = S.lw(8, 1.4); g.strokeStyle = PAL.paper; g.stroke(rimP); g.restore(); }
    g.fillStyle = mixHex(PAL.gold, PAL.goldLight, lit * 0.8); g.fill(rimP);
    if (S.detail) {
      g.save(); g.clip(rimP);
      g.strokeStyle = rgba(PAL.goldDark, 0.8); g.lineWidth = S.lw(4, 1, 6);
      g.beginPath(); g.arc(R * 0.06, R * 0.08, R * 0.95, 0, TAU); g.stroke();
      g.restore();
      rimEdge(g, rimP, PAL.white, S.lw(2.6, 1, 4), [-0.55, -0.835], 0.65);
    }
    g.fillStyle = mixHex(PAL.dragonDeep, PAL.dragonDark, lit * 0.55); g.fill(faceP);
    if (S.detail) {
      g.save(); g.clip(faceP);
      g.fillStyle = rgba(PAL.ink, 0.25); g.beginPath(); g.arc(R * 0.1, R * 0.12, R * 0.82, 0, TAU); g.arc(-R * 0.04, -R * 0.04, R * 0.8, 0, TAU, true); g.fill();
      g.restore();
    }
  }
  if (S.sil && !S.keep.has('plates')) return;
  if (S.detail === 0 || S.px * 64 < 7) {
    if (lit > 0) { g.fillStyle = rgba(PAL.goldLight, lit); g.beginPath(); g.arc(0, 0, R * 0.3, 0, TAU); g.fill(); }
    return;
  }
  const st = plate.state || 'lit';
  glyph13(g, [ch], [{ x: 0, y: 0, ang }], { size: 64 * (isSpade ? 0.92 : 1), state: st, lit, glow: lit * 0.85 });
}

// ———————————————————— 巨龙 ————————————————————
/**
 * 巨龙。o（全部可选）:
 *   pose（名字或 {from,to,k,stagger}）, spine（64 点数组，覆盖 pose；可带 .rot）, t, x, y, s, face（默认 −1 朝左）, rot（整体转角，度）, pivot,
 *   plates:[{lit,pop,char,state}×13], spikes（0..1 或 13 项数组）, puff, redden, jaw, eyes:{open,pupil,look,state,red,glow,twitch,blink,one},
 *   wings, flap, arms, grip, tailFlick（秒）, popped 0..13, silhouette, keepColor:['eye'|'plates'], silColor, chestSwell, steam, vein, nostril,
 *   joints:{head,jaw,neck,body,tail,wing,wingFar,arm,armFar,spade}（度）, detail（1 / 0 远景）, flat（剪纸木偶平面版）, rod（木杆 0..1）,
 *   part:'all'|'front'|'back'（盘柱前后分层）, alpha, seed
 * 返回（调用方坐标）：{ mouth, mouthAng, eyeL, eyeR, head, horn, hornFar, nose, jawTip, plates:[[x,y,ang]×13], tailTip,
 *   segments:[[x,y,ang]×13], front:[bool×13], claw, clawFar, wingTip, rods, root, scale, spine }
 */
export function drawDragon(g, o = {}) {
  const t = o.t ?? 0;
  const pose = o.pose ?? 'rise';
  const PP = poseParams(pose);
  const J = o.joints || {};
  // —— 脊线 ——
  let src;
  if (o.spine) {
    src = o.spine.length === N ? o.spine : resample(o.spine, N);
    src = Object.assign(src.map((p) => [p[0], p[1]]), { rot: o.spine.rot ?? 0, depth: o.spine.depth || null });
  } else src = resolveSpine(pose, t);
  const pts = src.map((p) => [p[0], p[1]]);
  const depth = src.depth;
  const cs = clamp(o.chestSwell ?? 0);
  let headRot = (src.rot ?? 0) + (J.head ?? 0) + cs * 9;
  const idx = (u) => Math.round(clamp(u) * (N - 1));
  const Ltmp = arcLen(pts), totTmp = Ltmp[N - 1];
  const uOf = (s) => s / totTmp;
  const segL0 = (totTmp - S0) / NSEG;
  // 关节弯曲（脖子带动头；身体 / 尾巴以近端为锚）
  const bendFrom = (k0, k1, ang) => {
    if (!ang) return;
    const orig = pts.map((p) => [p[0], p[1]]);
    for (let k = k0; k < N - 1; k++) {
      const r = clamp((k + 0.5 - k0) / Math.max(1, k1 - k0));
      const v = rotV(orig[k + 1][0] - orig[k][0], orig[k + 1][1] - orig[k][1], ang * r);
      pts[k + 1] = [pts[k][0] + v[0], pts[k][1] + v[1]];
    }
  };
  const bendHead = (k1, ang) => {
    if (!ang) return;
    const orig = pts.map((p) => [p[0], p[1]]);
    for (let k = k1 - 1; k >= 0; k--) {
      const r = clamp((k1 - k - 0.5) / Math.max(1, k1));
      const v = rotV(orig[k][0] - orig[k + 1][0], orig[k][1] - orig[k + 1][1], ang * r);
      pts[k] = [pts[k + 1][0] + v[0], pts[k + 1][1] + v[1]];
    }
  };
  const neckA = ((J.neck ?? 0) + cs * 6) * D2R;
  bendHead(idx(uOf(S0 + 2.2 * segL0)), neckA);
  headRot += neckA / D2R;
  bendFrom(idx(uOf(S0 + 3 * segL0)), idx(uOf(S0 + 8 * segL0)), (J.body ?? 0) * D2R);
  const sway = Math.sin(t * 1.7 + 0.4) * 4 + Math.sin(t * 0.9) * 2;
  const flick = o.tailFlick != null ? [].concat(o.tailFlick).reduce((s, tf) => s + 42 * wobble(t, tf, 2.3, 0.32), 0) : 0;
  bendFrom(idx(uOf(S0 + 8 * segL0)), N - 1, ((J.tail ?? 0) + sway + flick) * D2R);
  // 背板弹起时那一节身体拱起 10px
  const plates = o.plates || [];
  if (plates.some((p) => p && p.pop)) {
    const L = arcLen(pts), tot = L[N - 1];
    const sl = (tot - S0) / NSEG;
    const orig = pts.map((p) => [p[0], p[1]]);
    for (let k = 0; k < N; k++) {
      const a = Math.max(0, k - 1), b = Math.min(N - 1, k + 1);
      let tx = orig[b][0] - orig[a][0], ty = orig[b][1] - orig[a][1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      let off = 0;
      for (let i = 0; i < NSEG; i++) {
        const pp = plates[i] && plates[i].pop;
        if (!pp) continue;
        const sc = S0 + (i + 0.5) * sl;
        off += 10 * pp * Math.exp(-(((L[k] - sc) / (0.62 * sl)) ** 2));
      }
      pts[k][0] += ty * off; pts[k][1] += -tx * off;   // −N = 背侧
    }
  }
  const so = rotV(SOCKET[0], SOCKET[1], headRot * D2R);
  const headC = [pts[0][0] - so[0], pts[0][1] - so[1]];
  const D = dense(pts);
  const tot = D.tot;
  // —— 节布局（含 popped 弹飞） ——
  const popped = clamp(o.popped ?? 0, 0, NSEG);
  const n0 = Math.min(NSEG - 1, Math.floor(popped + 1e-6)), fpop = popped >= NSEG ? 1 : popped - n0;
  const segL = (tot - S0) / NSEG;
  const bodyEnd = S0 + (NSEG - popped) * segL;
  const puff = clamp(o.puff ?? 0);
  const breath = 1 + 0.018 * Math.sin(t * 2.2);
  const wScale = (1 + puff * 0.5) * breath;
  const sOrig = (s) => (s < S0 ? s : s + popped * segL);
  const wBase = (s) => {
    if (s >= S0) return wProf(sOrig(s) / tot);
    return lerp(wProf(s / tot), wProf(sOrig(S0) / tot), smoothstep(0, S0, s));
  };
  const swell = (s) => 1 + cs * 0.3 * Math.exp(-(((sOrig(s) - (S0 + 1.6 * segL)) / (1.5 * segL)) ** 2));
  const wOf = (s) => wBase(s) * wScale * swell(s);
  const segStart = (j) => (j === n0 ? S0 : S0 + (1 - fpop) * segL + (j - n0 - 1) * segL);
  const segEnd = (j) => S0 + (1 - fpop) * segL + (j - n0) * segL;
  const alive = (j) => j === NSEG - 1 || j > n0 || (j === n0 && fpop < 1 && popped < NSEG);   // 黑桃尾尖永远保留（缩成小蜥蜴的尾巴）
  const spadeS = Math.max(bodyEnd - SPADE_C, S0 + 62);
  // —— 变换：native → 调用方 ——
  const s = o.s ?? 1;
  const face = o.face ?? -1;
  const mx = face === 1 ? -1 : 1;
  const rotAll = (o.rot ?? 0) * D2R;
  const root = headC;
  const X = o.x ?? root[0], Y = o.y ?? root[1];
  const kShrink = popped > 0 ? lerp(1, 0.15, popped / NSEG) : 1;
  const piv = o.pivot || PP.pivot || root;
  const sc = s * (1 + 0.2 * puff);
  let M = mMul(mT(X, Y), mR(rotAll));
  M = mMul(M, mS(sc * mx, sc));
  M = mMul(M, mT(-root[0], -root[1]));
  if (kShrink !== 1) M = mMul(M, mMul(mMul(mT(piv[0], piv[1]), mS(kShrink)), mT(-piv[0], -piv[1])));
  const flat = o.flat ?? PP.flat;
  const silhouette = o.silhouette ?? PP.silhouette;
  const part = o.part || 'all';
  // 每节中心与前后
  const segFrames = [];
  for (let j = 0; j < NSEG; j++) {
    const sc_ = j === NSEG - 1 ? bodyEnd - SPADE_C : alive(j) ? (segStart(j) + segEnd(j)) / 2 : S0;
    segFrames.push({ s: sc_, f: frameAt(D, sc_) });
  }
  const depthAt = (s_) => {
    if (!depth) return 1;
    const u = clamp(sOrig(s_) / tot) * (N - 1), k = Math.floor(u), f = u - k;
    return lerp(depth[k], depth[Math.min(N - 1, k + 1)], f);
  };
  const front = segFrames.map((sf) => depthAt(sf.s) > 0);
  const headFront = depthAt(0) > 0;
  const want = (isFront) => part === 'all' || (part === 'front' ? isFront : !isFront);

  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  // —— 木杆（调用方坐标里竖直向下，画在身体后面） ——
  const rodA = o.rod === true ? 1 : o.rod === false ? 0 : o.rod ?? PP.rod ?? 0;
  const rodsOut = [];
  if (PP.rods) {
    for (const rx of PP.rods) {
      // 木杆接在该 x 处身体的腹侧
      let best = null;
      for (let k = 0; k <= 80; k++) {
        const s_ = (bodyEnd * k) / 80;
        const f = frameAt(D, s_);
        if (!best || Math.abs(f.x - rx) < Math.abs(best.f.x - rx)) best = { f, s: s_ };
      }
      const nat = rx < root[0] - 20 || Math.abs(rx - root[0]) < 120 ? [root[0] - 30, root[1] + 70] : fp(best.f, 0, wOf(best.s) * 0.3);
      rodsOut.push(mApply(M, nat));
    }
    if (rodA > 0 && !silhouette && want(true)) {
      for (const [ax, ay] of rodsOut) {
        g.save();
        g.globalAlpha *= clamp(rodA);
        const sk = scaleOf(g) / (g.canvas && g.canvas.width ? g.canvas.width / 1920 : 1);
        const rw = 13 * Math.abs(sc) * kShrink;
        const p = new Path2D(); p.rect(ax - rw / 2, ay, rw, 900);
        g.fillStyle = PAL.wood; g.fill(p);
        g.fillStyle = rgba(PAL.woodDark, 0.6); g.fillRect(ax + rw * 0.12, ay, rw * 0.38, 900);
        g.fillStyle = PAL.woodDark; g.fill(blob(ax, ay + rw * 0.4, rw * 0.9, rw * 0.7, { seed: 8, amp: 0.03 }));
        g.restore();
        void sk;
      }
    }
  }
  g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
  const S = makeS(g, { ...o, flat, silhouette }, mx, rotAll);
  // —— 翅膀（都在身体后：远翼 → 近翼） ——
  const wings = clamp(o.wings ?? PP.wings);
  const flapAmp = o.flap ?? PP.flap ?? 0;
  const flapA = flapAmp ? Math.sin(t * TAU / 0.7) * 0.42 * flapAmp : 0;
  const wingS = S0 + 0.62 * segL;
  const wS = Math.min(wingS, bodyEnd * 0.5);
  const wf = frameAt(D, wS);
  const ww = wOf(wS) / 2;
  const wRootN = fp(wf, 0, -ww * 0.45), wRootF = fp(wf, -16, -ww * 0.6);
  const wA = Math.abs(wrapA(wf.a)) > 1.75 ? wf.a : lerpAng(wf.a, 0, 0.55);
  let wingTip = null;
  const shoulderFront = front[0];
  if (want(shoulderFront) && wings >= 0) {
    const wk = lerp(1, 0.42, popped / NSEG);
    drawWing(g, S, wRootF, wA + (J.wingFar ?? 0) * D2R - 0.05, wings, flapA * 0.85 + 0.06, true, wk);
    wingTip = drawWing(g, S, wRootN, wA + (J.wing ?? 0) * D2R, wings, flapA, false, wk).tip;
  }
  // —— 远侧前爪 ——
  const arms = clamp(o.arms ?? PP.arms);
  const grip = clamp(o.grip ?? 0);
  const armS = Math.min(S0 + 0.32 * segL, bodyEnd * 0.4);
  const af = frameAt(D, armS);
  const aw = wOf(armS) / 2;
  const aA = Math.abs(wrapA(af.a)) > 1.75 ? af.a : lerpAng(af.a, 0, 0.75);
  let claw = null, clawFar = null;
  if (want(shoulderFront)) clawFar = drawArm(g, S, fp(af, -14, aw * 0.5), aA + (J.armFar ?? 0) * D2R, arms * 0.9, grip, true);
  // —— 喉皮（张嘴时连住下颚与脖子；画在身体之前，被脖子和下颚压住） ——
  const jawV = clamp(o.jaw ?? PP.jaw ?? 0);
  const jawDeg = clamp(jawV * 60 + (J.jaw ?? 0), 0, 75);
  const hr = headRot * D2R;
  const hs = 1 + puff * 0.06;
  if (jawDeg > 1 && want(headFront)) {
    const toHead = (p) => rotV((p[0] - headC[0]) / hs, (p[1] - headC[1]) / hs, -hr);
    const edge = [];
    const sEnd = Math.min(S0 + 0.9 * segL, bodyEnd);
    for (let k = 0; k <= 10; k++) { const s_ = (sEnd * k) / 10, f = frameAt(D, s_); edge.push(toHead(fp(f, 0, wOf(s_) / 2 - 8))); }
    g.save();
    g.translate(headC[0], headC[1]); g.rotate(hr); g.scale(hs, hs);
    drawThroat(g, inFrame(S, hr), jawDeg, edge);
    g.restore();
  }
  // —— 身体 13 节 ——
  const spikesV = o.spikes ?? 0;
  const spikeOf = (j) => clamp(Array.isArray(spikesV) ? spikesV[j] ?? 0 : spikesV);
  const order = [];
  for (let j = 0; j < NSEG; j++) order.push(j);
  const tailTop = (o.order || PP.order) === 'tailTop';
  if (!tailTop) order.reverse();
  const capSide = tailTop ? -1 : 1;
  const plateOut = [], segOut = [];
  const outAng = (a) => { const v = mDir(M, [Math.cos(a), Math.sin(a)]); return angOf(v); };
  const rimBody = S.sil ? null : RIM_BODY;
  const bodyCol = S.c(PAL.dragon);
  const bellyCol = PAL.dragonBelly;
  const drawPlateAt = (j, pc, f, popK, isSpade) => {
    const pl = plates[j] || {};
    const pop = clamp(pl.pop ?? 0) + (popK || 0);
    g.save();
    g.translate(pc[0], pc[1]);
    g.scale(mx, 1); g.rotate(-rotAll);
    const ps = (1 + 0.15 * pop) * (plateK[j] ?? 1);
    g.scale(ps, ps);
    if (popK) g.globalAlpha *= clamp(1 - popK);
    const lit = clamp(pl.lit ?? 0);
    if (lit > 0 && !S.sil && S.detail) glow(g, 0, 0, PLATE_R * 2.1, PAL.dragonEye, 0.5 * lit);
    drawPlateFace(g, S, PLATE_R, pl, j, outAng(f.a), isSpade);
    g.restore();
  };
  // 背板中心：沿背侧法线外移；凹弯处相邻背板会挤在一起 → 迭代推开（像扇面一样散开）
  const plateC = [];
  for (let j = 0; j < NSEG; j++) {
    const sf = segFrames[j];
    if (j === NSEG - 1) { plateC[j] = [sf.f.x, sf.f.y]; continue; }
    const popK = j === n0 && fpop > 0 ? fpop : 0;
    const pw = wOf(sf.s) / 2;
    plateC[j] = fp(sf.f, 0, -(pw + PLATE_GAP + popK * 34 + clamp((plates[j] || {}).pop ?? 0) * 8));
  }
  {
    const minD = PLATE_R * 2 * 0.97;
    const first = Math.max(0, n0);
    for (let it = 0; it < 18; it++) {
      const fwd = it % 2 === 0;
      for (let q = 0; q < NSEG - 1 - first; q++) {
        const j = fwd ? first + q : NSEG - 2 - q;
        const a = plateC[j], b = plateC[j + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
        const need = j + 1 === NSEG - 1 ? minD * 1.02 : minD;
        if (d >= need || d < 1e-3) continue;
        const push = need - d, ux = dx / d, uy = dy / d;
        const pinA = j === first, pinB = j + 1 === NSEG - 1;   // 第 1 块（紧挨着头）和黑桃不动
        const ka = pinA ? 0 : pinB ? 1 : 0.5, kb = pinB ? 0 : pinA ? 1 : 0.5;
        a[0] -= ux * push * ka; a[1] -= uy * push * ka; b[0] += ux * push * kb; b[1] += uy * push * kb;
      }
    }
  }
  // 推不开的地方（整段背线都是凹的）把背板略缩小（≥ 0.8），保证字不被邻板盖住
  const plateK = plateC.map((c, j) => {
    if (j === NSEG - 1 || !c) return 1;
    let dmin = Infinity;
    for (const k of [j - 1, j + 1]) if (k >= Math.max(0, n0) && k < NSEG && plateC[k]) dmin = Math.min(dmin, dist(c, plateC[k]));
    return clamp(dmin / (PLATE_R * 2 * 0.97), 0.8, 1);
  });
  // 锚点先全部算好（part 分层时没画的那几节也给真实位置，两次调用拿到的 plates / segments 一致）
  for (let j = 0; j < NSEG; j++) {
    if (!alive(j) && !(j === n0 && fpop > 0 && fpop < 1)) continue;
    const pf = segFrames[j].f;
    if (j < NSEG - 1) plateOut[j] = [...mApply(M, plateC[j]), outAng(pf.a)];
    else { const f = frameAt(D, spadeS); plateOut[j] = [...mApply(M, [f.x, f.y]), outAng(f.a)]; }
    segOut[j] = [...mApply(M, [pf.x, pf.y]), outAng(pf.a)];
  }
  for (const j of order) {
    if (!alive(j) && !(j === n0 && fpop > 0 && fpop < 1)) continue;
    if (!want(front[j])) continue;
    const isLast = j === NSEG - 1;
    const sa = j === 0 || j === n0 ? 0 : segStart(j) - 3;
    const sb = isLast ? Math.max(bodyEnd, S0 + 62 + SPADE_C) - SPADE_C * 0.9 : segEnd(j);
    if (sb <= sa + 1 && !isLast) continue;
    const fc = frameAt(D, (sa + sb) / 2);
    // 尖刺（在身体后）
    const spk = spikeOf(j);
    if (spk > 0.01 && j >= n0) {
      const sMid = (segStart(j) + segEnd(j)) / 2;
      const marks = [[segStart(j), -1, 1], [sMid, -1, 0.75], [segStart(j) + segL * 0.18, 1, 0.8], [sMid + segL * 0.16, 1, 0.8]];
      if (isLast) marks.length = 2;
      for (const [sx_, side, k] of marks) {
        const f = frameAt(D, sx_), w = wOf(sx_) / 2;
        const hgt = spk * (w * 0.75 + 14) * k, b = w * 0.32;
        const p = new Path2D();
        const A = fp(f, -b, side * (w - 6)), B = fp(f, b * 0.35, side * (w + hgt)), C = fp(f, b, side * (w - 6));
        p.moveTo(A[0], A[1]); p.quadraticCurveTo(...fp(f, -b * 0.2, side * (w + hgt * 0.45)), B[0], B[1]); p.lineTo(C[0], C[1]); p.closePath();
        piece(g, S, p, S.c(side < 0 ? PAL.dragonDark : mixHex(PAL.dragonBelly, PAL.dragonDark, 0.5)), { rim: side < 0 ? RIM_BODY : null });
      }
    }
    // 背板（藏在身体后，黑桃那节例外）
    const pf = segFrames[j].f;
    if (!isLast) {
      const popK = j === n0 && fpop > 0 ? fpop : 0;
      const pc = plateC[j];
      if (!(popped >= NSEG)) drawPlateAt(j, pc, pf, popK, false);
      plateOut[j] = [...mApply(M, pc), outAng(pf.a)];
    }
    // 身体片
    const path = piecePath(D, sa, Math.max(sb, sa + 2), wOf, isLast ? 0 : capSide);
    piece(g, S, path, j === n0 && fpop > 0 ? mixHex(PAL.dragon, PAL.dragonDark, 0.15) : bodyCol, { drop: 3.2, dropA: 0.32, rim: rimBody });
    if (!S.sil) {
      g.save(); g.clip(path);
      const ext = 26;
      g.fillStyle = bellyCol;
      g.fill(bandPath(D, sa - ext, sb + ext, wOf, 0.06, 1.3));
      if (S.detail) {
        g.fillStyle = rgba(PAL.dragonDark, 0.4);
        g.fill(bandPath(D, sa - ext, sb + ext, wOf, -1.3, -0.74));
        // 腹甲横纹
        g.strokeStyle = rgba(BELLY_LINE, 0.75); g.lineWidth = S.lw(2.4, 0.7, 3.6); g.lineCap = 'round';
        const step = 24;
        for (let s_ = Math.ceil((sa - ext) / step) * step; s_ <= sb + ext; s_ += step) {
          const f = frameAt(D, s_), w = wOf(s_) / 2;
          const a1 = fp(f, -3, w * 0.14), a2 = fp(f, 3, w * 0.58), a3 = fp(f, -2, w * 1.05);
          g.beginPath(); g.moveTo(a1[0], a1[1]); g.quadraticCurveTo(a2[0], a2[1], a3[0], a3[1]); g.stroke();
        }
        // 鳞片小弧
        g.strokeStyle = rgba(PAL.dragonDeep, 0.28); g.lineWidth = S.lw(2.2, 0.6, 3.2);
        for (let s_ = Math.ceil(sa / 30) * 30; s_ <= sb; s_ += 30) {
          const f = frameAt(D, s_), w = wOf(s_) / 2;
          for (const [dz, off] of [[0, -0.42], [15, -0.12]]) {
            const c = fp(f, dz, off * w * 2 * 0.5);
            const r = w * 0.17;
            g.beginPath(); g.arc(c[0], c[1], r, f.a + 0.3, f.a + Math.PI - 0.3); g.stroke();
          }
        }
        formShade(g, S, path, fc.x, fc.y, wOf((sa + sb) / 2) * 0.62, PAL.dragonDeep, 0.34);
      }
      g.restore();
    }
    if (S.flat && j % 3 === 0 && j > 0 && !S.sil) {
      const f = frameAt(D, segStart(j));
      fastener(g, S, f.x, f.y);
    }
    segOut[j] = [...mApply(M, [pf.x, pf.y]), outAng(pf.a)];
    // 黑桃尾尖 + 第 13 块字
    if (isLast) {
      const f = frameAt(D, spadeS);
      const ang = f.a + (J.spade ?? 0) * D2R;
      g.save(); g.translate(f.x, f.y); g.rotate(ang);
      const SF = inFrame(S, ang);
      const outer = spadePath(1, 3), inner = spadePath(0.8, 4);
      if (S.sil && !S.keep.has('plates')) { g.fillStyle = S.silC; g.fill(outer); }
      else {
        if (S.flat) { g.save(); g.lineWidth = S.lw(9, 1.4); g.lineJoin = 'round'; g.strokeStyle = PAL.paper; g.stroke(outer); g.restore(); }
        if (S.detail) { g.save(); g.translate(SF.dd[0] * 4, SF.dd[1] * 4); g.fillStyle = rgba(PAL.dragonDeep, 0.35); g.fill(outer); g.restore(); }
        const lit = clamp((plates[12] || {}).lit ?? 0);
        g.fillStyle = mixHex(PAL.gold, PAL.goldLight, lit * 0.8); g.fill(outer);
        if (S.detail) rimEdge(g, outer, PAL.white, S.lw(2.6, 1, 4), SF.ld, 0.6);
        g.fillStyle = mixHex(PAL.dragonDeep, PAL.dragonDark, lit * 0.55); g.fill(inner);
      }
      g.restore();
      drawPlateAt(12, [f.x, f.y], f, clamp(popped - (NSEG - 1)), true);
      plateOut[12] = [...mApply(M, [f.x, f.y]), outAng(f.a)];
    }
  }
  // 已弹飞的节：锚点留在脖根（场景从这里放飞小纸字）
  const jn = frameAt(D, S0);
  for (let j = 0; j < NSEG; j++) {
    if (!plateOut[j]) plateOut[j] = [...mApply(M, fp(jn, 0, -(wOf(S0) / 2 + PLATE_GAP))), outAng(jn.a)];
    if (!segOut[j]) segOut[j] = [...mApply(M, [jn.x, jn.y]), outAng(jn.a)];
  }
  // —— 近侧前爪 ——
  if (want(shoulderFront)) claw = drawArm(g, S, fp(af, 4, aw * 0.42), aA + (J.arm ?? 0) * D2R, arms, grip, false);
  // —— 头 ——
  const E = { open: 1, pupil: 0.3, look: [0, 0], state: 'normal', ...PP.eyes, ...(o.eyes || {}) };
  if (popped > 0) E.pupil = lerp(E.pupil, 0.78, popped / NSEG);   // 越缩越像小蜥蜴的圆瞳
  if (E.blink !== false && (E.state === 'normal' || E.state === 'angry' || E.state === 'smug')) E.open = (E.open ?? 1) * (1 - blinkAmt(t, o.seed ?? 1));
  let HA = null;
  if (want(headFront)) {
    g.save();
    g.translate(headC[0], headC[1]); g.rotate(hr); g.scale(hs, hs);
    const SHd = inFrame(S, hr);
    HA = drawHeadLocal(g, SHd, {
      t, jawDeg, eyes: E, nostril: o.nostril ?? PP.nostril, redden: o.redden, vein: o.vein, steam: o.steam, spikes: Array.isArray(spikesV) ? spikesV[0] : spikesV,
    });
    if (S.flat && !S.sil) { fastener(g, SHd, JAW_PIVOT[0], JAW_PIVOT[1]); fastener(g, SHd, SOCKET[0] - 6, SOCKET[1] - 8); }
    g.restore();
  }
  g.restore();
  // —— 锚点 ——
  const HM = mMul(M, mMul(mMul(mT(headC[0], headC[1]), mR(hr)), mS(hs)));
  const hp = (p) => mApply(HM, p);
  const headLocal = HA || { mouth: [-180, 50], nose: [-172, -12], eyeN: [EYE_NEAR.x, EYE_NEAR.y], eyeF: [EYE_FAR.x, EYE_FAR.y], hornN: [200, -230], hornF: [150, -240], jawTip: [-180, 100], mouthDir: Math.PI };
  const eA = hp(headLocal.eyeN), eB = hp(headLocal.eyeF);
  const mouthAng = angOf(mDir(HM, [Math.cos(headLocal.mouthDir ?? Math.PI), Math.sin(headLocal.mouthDir ?? Math.PI)]));
  const tipF = frameAt(D, bodyEnd);
  return {
    mouth: hp(headLocal.mouth), mouthAng, eyeL: eA[0] < eB[0] ? eA : eB, eyeR: eA[0] < eB[0] ? eB : eA,
    head: mApply(M, headC), horn: hp(headLocal.hornN), hornFar: hp(headLocal.hornF), nose: hp(headLocal.nose), jawTip: hp(headLocal.jawTip),
    plates: plateOut, segments: segOut, front, headFront, tailTip: mApply(M, [tipF.x + tipF.tx * 10, tipF.y + tipF.ty * 10]),
    claw: claw ? mApply(M, claw) : null, clawFar: clawFar ? mApply(M, clawFar) : null, wingTip: wingTip ? mApply(M, wingTip) : null,
    rods: rodsOut, root: [X, Y], scale: sc * kShrink, spine: pts.map((p) => mApply(M, p)),
  };
}

/** 木偶的黄铜两脚钉。 */
function fastener(g, S, x, y) {
  const r = S.lw(7.5, 2, 30);
  g.save();
  g.fillStyle = rgba(PAL.dragonDeep, 0.35); g.beginPath(); g.arc(x + r * 0.2, y + r * 0.3, r, 0, TAU); g.fill();
  g.fillStyle = PAL.gold; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = PAL.goldDark; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.15, r * 0.45, 0, TAU); g.fill();
  g.fillStyle = PAL.goldLight; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU); g.fill();
  g.restore();
}

/**
 * 只画龙头（角色卡头像、CU 特写测试、黑暗里只露头）。(x, y) = 头心，s 缩放，face 默认 −1 朝左，rot 度（正 = 抬头）。
 * 其余同 drawDragon：jaw, eyes, redden, vein, steam, nostril, spikes, silhouette, keepColor, silColor, detail, flat, alpha, t, seed, neck（默认 true 画一截脖子）。
 * 返回 { mouth, mouthAng, head, eyeL, eyeR, horn, hornFar, nose, jawTip }。
 */
export function drawDragonHead(g, o = {}) {
  const { x = 0, y = 0, s = 1, face = -1, t = 0 } = o;
  const mx = face === 1 ? -1 : 1;
  const hr = (o.rot ?? 0) * D2R;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y); g.scale(s * mx, s);
  const S = makeS(g, o, mx, 0);
  if (o.neck !== false) {
    const so = rotV(SOCKET[0], SOCKET[1], hr);
    const nk = [[so[0], so[1]], [so[0] + 60, so[1] + 90], [so[0] + 70, so[1] + 230]];
    const D = dense(resample(catmull(nk, 10), 16));
    const path = piecePath(D, 0, D.tot, () => 122, 0);
    // 喉皮在脖子之前画（张嘴时填掉下颚与脖子之间的楔形）
    const jd = clamp(o.jaw ?? 0) * 60;
    if (jd > 1) {
      const edge = [];
      for (let k = 0; k <= 10; k++) { const f = frameAt(D, (D.tot * 0.75 * k) / 10); edge.push(rotV(...fp(f, 0, 61 - 8), -hr)); }
      g.save(); g.rotate(hr); drawThroat(g, inFrame(S, hr), jd, edge); g.restore();
    }
    piece(g, S, path, S.c(PAL.dragon), { drop: 3, rim: RIM_BODY });
    if (!S.sil) { g.save(); g.clip(path); g.fillStyle = PAL.dragonBelly; g.fill(bandPath(D, -10, D.tot + 10, () => 122, 0.06, 1.3)); formShade(g, S, path, so[0] + 60, so[1] + 120, 80); g.restore(); }
  }
  g.rotate(hr);
  const SH = inFrame(S, hr);
  const E = { open: 1, pupil: 0.3, look: [0, 0], state: 'normal', ...(o.eyes || {}) };
  if (E.blink !== false && (E.state === 'normal' || E.state === 'angry' || E.state === 'smug')) E.open = (E.open ?? 1) * (1 - blinkAmt(t, o.seed ?? 1));
  const HA = drawHeadLocal(g, SH, { t, jawDeg: clamp(o.jaw ?? 0) * 60, eyes: E, nostril: o.nostril, redden: o.redden, vein: o.vein, steam: o.steam, spikes: o.spikes });
  if (S.flat && !S.sil) fastener(g, SH, JAW_PIVOT[0], JAW_PIVOT[1]);
  g.restore();
  const M = mMul(mMul(mMul(mT(x, y), mS(s * mx, s)), mR(hr)), mS(1));
  const a = mApply(M, HA.eyeN), b = mApply(M, HA.eyeF);
  const mouthAng = angOf(mDir(M, [Math.cos(HA.mouthDir), Math.sin(HA.mouthDir)]));
  return { mouth: mApply(M, HA.mouth), mouthAng, head: [x, y], eyeL: a[0] < b[0] ? a : b, eyeR: a[0] < b[0] ? b : a, horn: mApply(M, HA.hornN), hornFar: mApply(M, HA.hornF), nose: mApply(M, HA.nose), jawTip: mApply(M, HA.jawTip) };
}

/**
 * 单独的龙爪（b02 15.95 从画外探入勾鸟笼环）。(x, y) = 爪掌心，rot（度）= 手臂伸来的方向的反向（0 = 手臂从右边伸来、爪朝左），
 * s, grip 0..1（勾紧）, reach（手臂长度，世界 px，默认 420）, face（默认 −1；1 = 以 (x, y) 为轴水平镜像，手臂从左边伸来、爪朝右，rot 随之镜像）, t。
 * 返回 { hook:[x,y]（勾爪点）, elbow }。
 */
export function drawDragonClaw(g, o = {}) {
  const { x = 0, y = 0, s = 1, grip = 0.5, t = 0 } = o;
  const reach = o.reach ?? 420;
  const a = (o.rot ?? 0) * D2R;
  const mx = o.face === 1 ? -1 : 1;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y); g.scale(mx, 1); g.rotate(a); g.scale(s, s);
  const S = makeS(g, o, mx, 0);
  const S2 = inFrame(S, a);
  // 手臂：从右侧画外伸到爪掌（局部 x 正方向 = 手臂来处）
  const sway = Math.sin(t * 2) * 6;
  const pts = [[reach, -30 + sway], [reach * 0.6, -10 + sway * 0.6], [reach * 0.28, 4], [36, 0]];
  const D = dense(resample(catmull(pts, 10), 20));
  const wOf = (s_) => lerp(84, 46, s_ / D.tot);
  const path = piecePath(D, 0, D.tot, wOf, 1);
  piece(g, S2, path, S.c(PAL.dragon), { drop: 3, rim: RIM_BODY });
  if (!S.sil) {
    g.save(); g.clip(path);
    g.fillStyle = PAL.dragonBelly; g.fill(bandPath(D, -10, D.tot + 20, wOf, 0.1, 1.3));
    g.strokeStyle = rgba(BELLY_LINE, 0.75); g.lineWidth = S.lw(2.4, 0.7, 3.6);
    for (let s_ = 20; s_ < D.tot; s_ += 26) { const f = frameAt(D, s_), w = wOf(s_) / 2; const a1 = fp(f, 0, w * 0.14), a3 = fp(f, -3, w * 1.05); g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a3[0], a3[1]); g.stroke(); }
    formShade(g, S2, path, reach * 0.5, 0, 60);
    g.restore();
  }
  // 爪掌与三爪（朝 −x）
  const hook = drawArmHand(g, S2, grip);
  g.restore();
  const M = mMul(mMul(mMul(mT(x, y), mS(mx, 1)), mR(a)), mS(s));
  return { hook: mApply(M, hook), elbow: mApply(M, [reach * 0.5, 0]) };
}
function drawArmHand(g, S, grip) {
  const gp = clamp(grip);
  const col = S.c(PAL.dragon);
  const digits = [0, 1, 2].map((k) => {
    const base = [-4, (k - 1) * 24];
    const dir = Math.PI + (k - 1) * 0.3;
    const kn = [base[0] + Math.cos(dir) * 34, base[1] + Math.sin(dir) * 34];
    return { k, base, dir, kn };
  });
  const limb = (a, b, w0, w1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return smoothPath([[a[0] + nx * w0, a[1] + ny * w0], [b[0] + nx * w1, b[1] + ny * w1], [b[0] + dx / l * w1, b[1] + dy / l * w1], [b[0] - nx * w1, b[1] - ny * w1], [a[0] - nx * w0, a[1] - ny * w0]], { closed: true, tension: 0.4 });
  };
  for (const d of digits) piece(g, S, limb(d.base, d.kn, 15, 12), col, { drop: 3, rim: RIM_BODY });
  piece(g, S, blob(14, 0, 40, 36, { seed: 5, amp: 0.03, n: 30 }), col, { drop: 3.5, rim: RIM_BODY });
  if (!S.sil && S.detail) {
    g.save(); g.fillStyle = rgba(PAL.dragonBelly, 0.85);
    g.fill(blob(6, 16, 22, 13, { seed: 6, amp: 0.04, rot: 0.2 }));
    g.restore();
  }
  let hook = [0, 0];
  for (const d of digits) {
    const len = 56 - Math.abs(d.k - 1) * 8;
    const curl = 0.85 + gp * 1.05;
    const c = Math.cos(d.dir), s = Math.sin(d.dir);
    const ca = d.dir - curl;
    const tip = [d.kn[0] + c * len * 0.58 + Math.cos(ca) * len * 0.55, d.kn[1] + s * len * 0.58 + Math.sin(ca) * len * 0.55];
    const p = new Path2D();
    p.moveTo(d.kn[0] - s * 11, d.kn[1] + c * 11);
    p.quadraticCurveTo(d.kn[0] + c * len * 0.8 - s * 6, d.kn[1] + s * len * 0.8 + c * 6, tip[0], tip[1]);
    p.quadraticCurveTo(d.kn[0] + c * len * 0.5 + s * 9, d.kn[1] + s * len * 0.5 - c * 9, d.kn[0] + s * 11, d.kn[1] - c * 11);
    p.closePath();
    if (S.sil) { g.fillStyle = S.silC; g.fill(p); }
    else {
      if (S.detail) { g.save(); g.translate(S.dd[0] * 4, S.dd[1] * 4); g.fillStyle = rgba(PAL.dragonDeep, 0.4); g.fill(p); g.restore(); }
      g.fillStyle = PAL.paper2; g.fill(p);
      if (S.detail) {
        g.save(); g.clip(p);
        g.fillStyle = rgba(PAL.kraftDark, 0.7); g.beginPath(); g.arc(d.kn[0], d.kn[1], 14, 0, TAU); g.fill();
        g.fillStyle = rgba(PAL.kraft, 0.6); g.beginPath(); g.arc(d.kn[0] + c * 10 + s * 6, d.kn[1] + s * 10 - c * 6, 16, 0, TAU); g.fill();
        g.restore();
        rimEdge(g, p, PAL.white, S.lw(2.2, 0.8, 4), S.ld, 0.7);
      }
    }
    if (d.k === 1) hook = tip;
  }
  return hook;
}

// ———————————————————— 小蜥蜴（B12 由巨龙缩成；设计单位 240 = 世界 60px） ————————————————————
const LZ_K = 0.25;
// 关节角（度，设计空间绝对角：0 右、90 下、−90 上）：tilt 身体相对直立的倾角（90 = 水平趴着），lift 胯高，
// head 头部转角（正 = 低头），armN/armF 近 / 远前爪方向，legN/legF 近 / 远后腿方向，tail = [根部方向, 三段弯曲]
const LZ_POSE = {
  sit: { tilt: 0, lift: -9, head: 0, armN: 96, armF: 84, legN: 26, legF: 34, tail: [196, 24, 48, 56], wing: 0.25, eyes: { state: 'normal' }, mouth: 'smile', desc: '坐（静止时尾巴卷成问号）' },
  peek: { tilt: 22, lift: -6, head: 8, armN: -14, armF: -30, legN: 40, legF: 50, tail: [200, 10, 20, 30], wing: 0.2, eyes: { state: 'normal', look: [0.9, 0.1], pupil: 0.9 }, mouth: 'o', desc: '探头：后腿站立前倾、两爪扒着边沿（paw 锚点）' },
  scurry: { tilt: 82, lift: 18, head: -6, armN: 90, armF: 90, legN: 90, legF: 90, tail: [184, 4, 4, -6], wing: 0.15, eyes: { state: 'normal', look: [0.7, 0] }, mouth: 'grin', cycle: 'run', desc: '窜：四爪交替（0.3s 一步）' },
  climb: { like: 'scurry', rot: -62, head: 16, cycle: 'run', eyes: { state: 'normal', look: [0.5, -0.4] }, desc: '顺着往上爬（scurry 斜转 −62°，头朝右上）' },
  ride: { tilt: 74, lift: 7, head: -12, armN: 118, armF: 106, legN: 120, legF: 112, tail: [150, -30, -36, -16], wing: 0.2, eyes: { state: 'happy' }, mouth: 'smile', tuck: 1, desc: '蹲在肩上（y = 肩线），尾巴垂在身后' },
  hideScarf: { only: 'head', tilt: 0, lift: 0, head: 6, eyes: { state: 'normal', look: [0.2, 0.3], pupil: 0.9 }, mouth: null, desc: '缩进围巾只露头顶和眼睛（y = 围巾上沿）' },
  lead: { tilt: -6, lift: -4, head: 0, armN: -38, armF: -62, legN: 30, legF: 50, tail: [200, 30, 40, 40], wing: 0.7, eyes: { state: 'happy' }, mouth: 'open', cycle: 'dance', desc: '舞龙领舞：一爪高举、踮脚、尾巴甩' },
  nod: { like: 'sit', eyes: { state: 'happy' }, cycle: 'nod', desc: '跟拍子点头（0.5s 一下）' },
  coverEyes: { tilt: 2, lift: -9, head: 8, armN: -20, armF: -34, legN: 26, legF: 34, tail: [-88, 4, 12, 22], tailLen: 0.8, spadeK: 1.25, tailFront: true, wing: 0.1, eyes: { state: 'closed' }, mouth: 'wavy', sweat: 1, desc: '用尾巴捂眼（黑桃尖盖住眼睛）' },
  flat: { tilt: 90, lift: 6, sq: -0.32, head: 10, armN: 8, armF: 172, legN: 12, legF: 168, tail: [180, 0, 2, 0], wing: 0, eyes: { state: 'closed' }, mouth: 'flat', desc: '趴平（瘪下去）' },
  pout: { tilt: -4, lift: -9, head: -8, armN: 168, armF: 14, legN: 26, legF: 34, tail: [196, 30, 50, 40], wing: 0.1, eyes: { state: 'smug', look: [-0.8, -0.3] }, mouth: 'pout', cheeks: 1, brows: 'angry', desc: '撅嘴生闷气：鼓腮、抱臂、斜眼' },
  sleep: { tilt: 90, lift: 6, head: 22, armN: 110, armF: 100, legN: 120, legF: 120, tail: [186, 52, 84, 66], tailFront: true, wing: 0, eyes: { state: 'closed' }, mouth: 'smile', cycle: 'breathe', desc: '蜷成一团睡觉（呼吸起伏）' },
  eyeOpen: { like: 'sleep', eyes: { state: 'closed', one: true, glow: 1 }, desc: '睡着时睁开一只发光的眼' },
};
for (const k in LZ_POSE) { const d = LZ_POSE[k]; if (d.like) LZ_POSE[k] = { ...LZ_POSE[d.like], ...d, like: undefined }; }
/** 小蜥蜴的姿态名与说明。 */
export const LIZARD_POSES = Object.fromEntries(Object.entries(LZ_POSE).map(([k, d]) => [k, d.desc]));

function lzParams(pose) {
  if (pose && typeof pose === 'object') {
    const A = lzParams(pose.from), B = lzParams(pose.to), k = clamp(pose.k ?? 0);
    const out = { ...(k < 0.5 ? A : B) };
    for (const key of ['tilt', 'lift', 'head', 'armN', 'armF', 'legN', 'legF', 'wing', 'sq', 'rot', 'cheeks']) out[key] = lerp(A[key] ?? 0, B[key] ?? 0, k);
    out.tail = A.tail.map((v, i) => lerp(v, B.tail[i], k));
    out.eyes = { ...(k < 0.5 ? A.eyes : B.eyes) };
    return out;
  }
  const d = LZ_POSE[pose || 'sit'] || LZ_POSE.sit;
  return { tilt: 0, lift: 0, head: 0, armN: 96, armF: 84, legN: 26, legF: 34, tail: [196, 24, 48, 56], wing: 0.2, sq: 0, rot: 0, cheeks: 0, ...d, eyes: { ...(d.eyes || {}) } };
}
function lzCycle(P, t) {
  const Q = { ...P, tail: P.tail.slice() };
  if (P.cycle === 'run') {
    const ph = (TAU * t) / 0.3;
    Q.legN = 90 + 36 * Math.sin(ph); Q.legF = 90 + 36 * Math.sin(ph + Math.PI);
    Q.armN = 90 + 36 * Math.sin(ph + Math.PI); Q.armF = 90 + 36 * Math.sin(ph);
    Q.lift += 4 * Math.abs(Math.sin(ph));
    Q.tail = Q.tail.map((v, i) => v + (i ? 10 * Math.sin(ph - i * 0.9) : 0));
    Q.head += 2 * Math.sin(ph * 2);
  } else if (P.cycle === 'dance') {
    const ph = (TAU * t) / 0.55;
    Q.armN += 26 * Math.sin(ph); Q.armF += 16 * Math.sin(ph + 1);
    Q.legF += 30 * Math.max(0, Math.sin(ph));
    Q.lift += 6 * Math.abs(Math.sin(ph));
    Q.head += 8 * Math.sin(ph);
    Q.tail = Q.tail.map((v, i) => v + (i ? 16 * Math.sin(ph - i * 0.8) : 0));
  } else if (P.cycle === 'nod') {
    const ph = (TAU * t) / 0.5;
    Q.head += 11 * Math.max(0, Math.sin(ph)) - 2;
    Q.lift += 2 * Math.max(0, Math.sin(ph));
    Q.tail = Q.tail.map((v, i) => v + (i ? 7 * Math.sin(ph - i) : 0));
  } else if (P.cycle === 'breathe') {
    Q.sq = (Q.sq || 0) + 0.045 * Math.sin((TAU * t) / 2.6);
  } else {
    Q.sq = (Q.sq || 0) + 0.025 * Math.sin((TAU * t) / 2.2);
    Q.tail = Q.tail.map((v, i) => v + (i === 3 ? 7 * Math.sin(t * 2.1) : i === 2 ? 3 * Math.sin(t * 2.1 - 0.6) : 0));
  }
  return Q;
}
const mirS = (S) => ({ ...S, ld: [-S.ld[0], S.ld[1]], dd: [-S.dd[0], S.dd[1]] });
const LZ_HEAD = [[48, 6], [44, -9], [31, -19], [15, -31], [-6, -37], [-26, -33], [-38, -19], [-41, 2], [-33, 20], [-15, 31], [10, 33], [31, 28], [44, 19]];
const LZ_EYE_N = { x: -4, y: -9, w: 25, h: 30, inner: 1 };
const LZ_EYE_F = { x: 23, y: -12, w: 16, h: 26, inner: -1 };
let LZ_HEAD_PATH = null;

/**
 * 小蜥蜴。o: { x, y（脚底 / 趴附点）, s（1 = 全长 60）, face（默认 1 朝右）, t, pose（名字或 {from,to,k}）,
 *   eyes:{open,pupil,look,state,glow,one,blink}, mouth（'smile'|'grin'|'open'|'o'|'pout'|'flat'|'wavy'|null）, joints:{tilt,head,armN,armF,legN,legF,wing,tail:[4]},
 *   miniPlate（true 或 { chars, period（滚完一遍的秒数，默认 4.2） }）, squash, silhouette, keepColor, silColor, alpha, detail, seed }
 * 返回 { head, eye, mouth, paw, foot, tailTip, top, plate }。
 */
export function drawLizard(g, o = {}) {
  const t = o.t ?? 0;
  const P0 = lzParams(o.pose ?? 'sit');
  const J = o.joints || {};
  const P = lzCycle(P0, t);
  for (const k of ['tilt', 'head', 'armN', 'armF', 'legN', 'legF', 'wing']) if (J[k] != null) P[k] += J[k];
  if (J.tail) P.tail = P.tail.map((v, i) => v + (J.tail[i] ?? 0));
  const s = (o.s ?? 1) * LZ_K;
  const face = o.face ?? 1;
  const mx = face === -1 ? -1 : 1;
  const E = { open: 1, pupil: 0.78, look: [0, 0], state: 'normal', ...P.eyes, ...(o.eyes || {}) };
  if (E.blink !== false && (E.state === 'normal' || E.state === 'smug')) E.open = (E.open ?? 1) * (1 - blinkAmt(t, (o.seed ?? 1) + 5));
  const sqv = (o.squash ?? 0) + (P.sq ?? 0);
  const sxq = 1 / Math.sqrt(1 + sqv), syq = 1 + sqv;
  const lift = P.lift ?? 0;
  const H = [0, -18 - lift];
  const a = (-90 + P.tilt) * D2R;
  const ax = [Math.cos(a), Math.sin(a)], nB = [-ax[1], ax[0]];
  const at = (al, ac) => [H[0] + ax[0] * al + nB[0] * ac, H[1] + ax[1] * al + nB[1] * ac];
  const rotL = (P.rot ?? 0) * D2R;
  let M = mMul(mT(o.x ?? 0, o.y ?? 0), mS(s * mx, s));
  M = mMul(M, mS(sxq, syq));
  if (rotL) M = mMul(M, mMul(mMul(mT(H[0], H[1] - 20), mR(rotL)), mT(-H[0], -(H[1] - 20))));
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
  const S = makeS(g, o, mx, rotL * mx);
  const col = S.c(PAL.dragon), colFar = S.c(mixHex(PAL.dragon, PAL.dragonDeep, 0.38));
  const rimC = RIM_BODY;
  const headOnly = P.only === 'head';
  const neck = at(46, 2);
  const headC = headOnly ? [0, -16] : [neck[0] + ax[0] * 22, neck[1] + ax[1] * 22];
  const hr = (P.head ?? 0) * D2R;
  const out = {};
  if (headOnly) { g.save(); const cl = new Path2D(); cl.rect(-200, -400, 400, 400); g.clip(cl); }
  // —— 远侧后腿、远侧前爪 ——
  const leg = (base, ang, far) => {
    const c = far ? colFar : col;
    const th = blob(base[0], base[1], 17, 14, { seed: far ? 31 : 32, rot: a, amp: 0.03, n: 26 });
    const fa = ang * D2R, foot = [base[0] + Math.cos(fa) * 15, base[1] + Math.sin(fa) * 15 + 4];
    const fr = (ang - 90) * D2R * 0.45;
    const fp_ = blob(foot[0] + 3, foot[1], 10, 5, { seed: far ? 33 : 34, rot: fr, amp: 0.04, n: 22 });
    piece(g, S, th, c, { drop: 2, rim: far ? null : rimC });
    piece(g, S, fp_, c, { drop: 1.5 });
    if (!S.sil && S.detail) {
      g.fillStyle = far ? PAL.kraft : PAL.paper2;
      for (let k = 0; k < 3; k++) { const tx = foot[0] + 10 + Math.cos(fr + (k - 1) * 0.5) * 3, ty = foot[1] + Math.sin(fr + (k - 1) * 0.5) * 3 + (k - 1) * 2; g.beginPath(); g.arc(tx, ty, 1.8, 0, TAU); g.fill(); }
    }
    return foot;
  };
  const arm = (base, ang, far) => {
    const c = far ? colFar : col;
    const fa = ang * D2R, hand = [base[0] + Math.cos(fa) * 18, base[1] + Math.sin(fa) * 18];
    const dx = hand[0] - base[0], dy = hand[1] - base[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 5.5, ny = dx / l * 5.5;
    const p = smoothPath([[base[0] + nx, base[1] + ny], [hand[0] + nx * 0.8, hand[1] + ny * 0.8], [hand[0] - nx * 0.8, hand[1] - ny * 0.8], [base[0] - nx, base[1] - ny]], { closed: true, tension: 0.3 });
    piece(g, S, p, c, { drop: 1.5 });
    piece(g, S, blob(hand[0], hand[1], 6, 5.5, { seed: far ? 35 : 36, amp: 0.04, n: 20 }), c, { drop: 1.5, rim: far ? null : rimC });
    if (!S.sil && S.detail) { g.fillStyle = far ? PAL.kraft : PAL.paper2; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(hand[0] + Math.cos(fa + (k - 1) * 0.6) * 6, hand[1] + Math.sin(fa + (k - 1) * 0.6) * 6, 1.6, 0, TAU); g.fill(); } }
    return hand;
  };
  // —— 尾巴 ——
  const tailPts = (() => {
    let p = at(4, -14), ang = P.tail[0];
    const pts = [p];
    const sl = 24 * (P.tailLen ?? 1);
    for (let i = 0; i < 4; i++) { if (i) ang += P.tail[i]; const r = ang * D2R; p = [p[0] + Math.cos(r) * sl, p[1] + Math.sin(r) * sl]; pts.push(p); }
    return pts;
  })();
  const drawTail = () => {
    const Dt = dense(resample(catmull(tailPts, 8), 24));
    const wOf = (s_) => lerp(19, 7, s_ / Dt.tot);
    const path = piecePath(Dt, -6, Dt.tot - 6, wOf, 0);
    piece(g, S, path, col, { drop: 2, rim: rimC });
    if (!S.sil && S.detail) {
      g.save(); g.clip(path);
      g.fillStyle = PAL.dragonBelly; g.fill(bandPath(Dt, -10, Dt.tot + 4, wOf, -1.3, -0.25));
      formShade(g, S, path, tailPts[2][0], tailPts[2][1], 40, PAL.dragonDeep, 0.3);
      g.restore();
    }
    const f = frameAt(Dt, Dt.tot);
    const spk = 0.24 * (P.spadeK ?? 1);
    g.save(); g.translate(f.x + f.tx * 6, f.y + f.ty * 6); g.rotate(f.a); g.scale(spk, spk);
    const SF = inFrame(S, f.a);
    const sp = spadePath(1, 9);
    if (S.sil) { g.fillStyle = S.silC; g.fill(sp); }
    else {
      if (S.detail) { g.save(); g.translate(SF.dd[0] * 6, SF.dd[1] * 6); g.fillStyle = rgba(PAL.dragonDeep, 0.35); g.fill(sp); g.restore(); }
      g.fillStyle = PAL.gold; g.fill(sp);
      g.fillStyle = PAL.dragonDark; g.fill(spadePath(0.78, 10));
      if (S.detail) rimEdge(g, sp, PAL.white, 4, SF.ld, 0.6);
    }
    g.restore();
    out.tailTip = [f.x + f.tx * (6 + 64 * spk), f.y + f.ty * (6 + 64 * spk)];
  };
  if (!headOnly) {
    leg(at(10, -4), P.legF, true);
    arm(at(36, 7), P.armF, true);
    if (!P.tailFront) drawTail();
    // 小翅膀（背上）
    if ((P.wing ?? 0) > 0.01) {
      const wr = at(36, -12);
      g.save(); g.translate(wr[0], wr[1]); g.scale(-0.2, 0.2);
      const ang = (P.tilt * 0.6) * D2R;
      drawWing(g, mirS(S), [0, 0], -ang, P.wing, Math.sin(t * 9) * 0.12 * P.wing, false);
      g.restore();
    }
    // 身体
    const bc = at(24, 0);
    const body = blob(bc[0], bc[1], 31, 24, { seed: 37, rot: a, amp: 0.025, n: 36 });
    piece(g, S, body, col, { drop: 2.5, rim: rimC });
    if (!S.sil) {
      g.save(); g.clip(body);
      const bp = at(22, 11);
      g.fillStyle = PAL.dragonBelly; g.fill(blob(bp[0], bp[1], 26, 15, { seed: 38, rot: a, amp: 0.03 }));
      if (S.detail) {
        g.strokeStyle = rgba(BELLY_LINE, 0.7); g.lineWidth = S.lw(1.6, 0.6, 2.5);
        for (let k = -1; k <= 2; k++) { const c0 = at(14 + k * 10, 4), c1 = at(14 + k * 10 + 2, 22); g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.stroke(); }
        formShade(g, S, body, bc[0], bc[1], 30, PAL.dragonDeep, 0.3);
      }
      g.restore();
      // 背脊小刺
      if (S.detail) for (let k = 0; k < 3; k++) {
        const b0 = at(14 + k * 11, -21), tip = at(19 + k * 11, -29), b1 = at(23 + k * 11, -21);
        const p = new Path2D(); p.moveTo(b0[0], b0[1]); p.lineTo(tip[0], tip[1]); p.lineTo(b1[0], b1[1]); p.closePath();
        g.fillStyle = PAL.dragonDark; g.fill(p);
      }
    }
    out.foot = leg(at(6, 5), P.legN, false);
  }
  // —— 头 ——
  if (!LZ_HEAD_PATH) LZ_HEAD_PATH = smoothPath(LZ_HEAD, { closed: true, tension: 0.5 });
  g.save();
  g.translate(headC[0], headC[1]); g.rotate(hr);
  const SH = inFrame(S, hr);
  // 远角、远鳍
  g.save(); g.translate(2, -34); g.scale(-1, 1); drawHorn(g, mirS(SH), 0, 0, 0.17, -0.2, true); g.restore();
  g.save(); g.translate(-34, -10); g.scale(-1, 1); drawFin(g, mirS(SH), 0, 0, 0.22, -0.3, t, 0, true); g.restore();
  // 鼓腮
  const ck = clamp(P.cheeks ?? 0);
  piece(g, SH, LZ_HEAD_PATH, col, { drop: 2.5, rim: rimC });
  if (!S.sil) {
    if (ck > 0) piece(g, SH, blob(10, 14, 15 * ck + 4, 12 * ck + 3, { seed: 39, amp: 0.03 }), col, { rim: rimC });
    g.save(); g.clip(LZ_HEAD_PATH);
    g.fillStyle = PAL.dragonBelly; g.fill(smoothPath([[-20, 22], [6, 26], [30, 22], [48, 14], [50, 40], [-30, 40]], { closed: true, tension: 0.4 }));
    if (S.detail) {
      g.fillStyle = rgba(mixHex(PAL.dragon, PAL.white, 0.3), 0.5); g.fill(blob(8, -27, 20, 5, { seed: 40, rot: 0.15 }));
      formShade(g, SH, LZ_HEAD_PATH, 4, 0, 44, PAL.dragonDeep, 0.28);
    }
    g.restore();
  }
  // 眼
  const hlL = (r) => { const v = rotV(SH.ld[0], SH.ld[1], -r); const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const eyeKeep = S.sil && S.keep.has('eye');
  if (!S.sil || eyeKeep) {
    const st = E.state;
    const nearSt = E.one && CLOSED_LIKE.has(st) ? 'normal' : st;
    for (const [EY, far] of [[LZ_EYE_F, true], [LZ_EYE_N, false]]) {
      if (far && E.one && S.sil) continue;
      const thisSt = E.one ? (far ? 'closed' : nearSt) : st;
      drawDragonEye(g, { x: EY.x, y: EY.y, w: EY.w, h: EY.h, inner: EY.inner, open: E.open, pupil: E.pupil, look: E.look || [0, 0], state: thisSt,
        glow: E.one && !far ? E.glow : E.glow && !E.one ? E.glow : 0, t, hl: hlL(0), lid: far ? mixHex(PAL.dragon, PAL.dragonDeep, 0.12) : PAL.dragon, lw: S.lw(1.6, 0.6, 3) });
    }
  }
  out.eye = [LZ_EYE_N.x, LZ_EYE_N.y];
  if (!S.sil) {
    // 眉
    const bw = S.lw(2.6, 0.7, 6);
    if (P.brows === 'angry' || E.state === 'angry') { strokeLine(g, [[-16, -31], [-6, -28], [4, -23]], bw, PAL.ink); strokeLine(g, [[16, -25], [22, -29], [30, -31]], bw * 0.85, PAL.ink); }
    else { strokeLine(g, [[-15, -29], [-5, -33], [5, -30]], bw, PAL.ink); strokeLine(g, [[16, -31], [23, -33], [30, -30]], bw * 0.85, PAL.ink); }
    // 腮红、鼻孔
    g.save(); g.globalAlpha *= 0.45 + ck * 0.2; g.fillStyle = PAL.blush;
    g.beginPath(); g.ellipse(-6 + ck * 4, 13, 9 + ck * 3, 5.5 + ck * 2, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(31, 10, 5.5, 3.5, 0, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = PAL.dragonDeep; g.beginPath(); g.ellipse(43, -2, 2.2, 1.6, 0.4, 0, TAU); g.fill();
    // 嘴
    const mouth = o.mouth !== undefined ? o.mouth : P.mouth;
    const mw = S.lw(2.4, 0.7, 6);
    if (mouth === 'smile') strokeLine(g, [[18, 11], [23, 17], [33, 20], [44, 16]], mw, PAL.ink);
    else if (mouth === 'grin' || mouth === 'open') {
      const mp = new Path2D();
      if (mouth === 'grin') { mp.moveTo(18, 13); mp.quadraticCurveTo(32, 30, 45, 15); mp.quadraticCurveTo(32, 20, 18, 13); }
      else { mp.ellipse(33, 19, 8, 7, 0, 0, TAU); }
      g.fillStyle = PAL.redDeep; g.fill(mp);
      g.save(); g.clip(mp); g.fillStyle = PAL.heart; g.beginPath(); g.ellipse(33, mouth === 'open' ? 26 : 25, 7, 4.5, 0, 0, TAU); g.fill(); g.restore();
      if (mouth === 'grin') { g.fillStyle = PAL.white; g.beginPath(); g.moveTo(24, 16); g.lineTo(27, 20); g.lineTo(30, 17); g.fill(); }
    } else if (mouth === 'o') { g.fillStyle = PAL.redDeep; g.beginPath(); g.ellipse(36, 19, 3.6, 4.4, 0, 0, TAU); g.fill(); }
    else if (mouth === 'pout') {
      g.fillStyle = PAL.heart; g.beginPath(); g.ellipse(46, 17, 3.6, 3, 0, 0, TAU); g.fill();
      strokeLine(g, [[34, 18], [40, 15], [45, 14]], mw * 0.9, PAL.ink);
    } else if (mouth === 'flat') strokeLine(g, [[22, 19], [32, 20], [43, 18]], mw, PAL.ink);
    else if (mouth === 'wavy') strokeLine(g, [[20, 18], [25, 15], [30, 19], [35, 15], [40, 19], [44, 16]], mw * 0.9, PAL.ink);
    out.mouth = [36, 19];
  }
  // 近鳍、近角
  g.save(); g.translate(-30, 0); g.scale(-1, 1); drawFin(g, mirS(SH), 0, 0, 0.26, -0.2, t, 0, false); g.restore();
  g.save(); g.translate(-14, -30); g.scale(-1, 1); drawHorn(g, mirS(SH), 0, 0, 0.19, -0.15, false); g.restore();
  g.restore();
  if (headOnly) g.restore();
  // —— 近侧前爪、前置尾巴 ——
  if (!headOnly) {
    out.paw = arm(at(36, 13), P.armN, false);
    if (P.tailFront) drawTail();
    if (P.sweat && !S.sil) {
      const sx = headC[0] - 30, sy = headC[1] - 34 + Math.sin(t * 3) * 2;
      g.fillStyle = PAL.ice; g.beginPath(); g.moveTo(sx, sy - 9); g.quadraticCurveTo(sx + 7, sy + 2, sx, sy + 5); g.quadraticCurveTo(sx - 7, sy + 2, sx, sy - 9); g.fill();
      g.fillStyle = PAL.white; g.beginPath(); g.arc(sx - 1.5, sy + 0.5, 1.6, 0, TAU); g.fill();
    }
  }
  // —— 迷你名字牌（头顶，字极小、一直在滚） ——
  let plateC = null;
  if (o.miniPlate) {
    const mp = typeof o.miniPlate === 'object' ? o.miniPlate : {};
    const pc = [headC[0] + 4, headC[1] - 66 + Math.sin(t * 2.6) * 2.5];
    plateC = pc;
    g.save();
    g.translate(pc[0], pc[1]); g.scale(mx, 1);
    const w = 122, h = 34;
    const fr = new Path2D(); fr.roundRect(-w / 2, -h / 2, w, h, 9);
    const win = new Path2D(); win.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 6);
    if (S.sil) { g.fillStyle = S.silC; g.fill(fr); }
    else {
      g.save(); g.translate(1.5, 3); g.fillStyle = rgba(PAL.shadow, 0.3); g.fill(fr); g.restore();
      g.fillStyle = PAL.gold; g.fill(fr);
      g.fillStyle = PAL.dragonDeep; g.fill(win);
      const chars = mp.chars ? [...mp.chars] : DRAGON_CHARS;
      const sz = 19;
      if (S.px * sz >= 6 && S.detail) {
        const per = mp.period ?? 4.2;
        marquee(g, chars, { x: -w / 2 + 6, y: -h / 2 + 5, w: w - 12, h: h - 10 }, ((t / per) % 1 + 1) % 1, { size: sz, family: 'display', mode: 'pass', fill: PAL.goldLight, edge: null, gap: 1 });
      } else {
        const off = (t * 22) % 14;
        g.save(); g.clip(win); g.fillStyle = PAL.goldLight;
        for (let x = -w / 2 + 2 - off; x < w / 2; x += 14) { g.beginPath(); g.arc(x, 0, 2.6, 0, TAU); g.fill(); }
        g.restore();
      }
      rimEdge(g, fr, PAL.white, 2, [-0.55, -0.835], 0.5);
    }
    g.restore();
  }
  g.restore();
  // 锚点
  const HM = mMul(M, mMul(mT(headC[0], headC[1]), mR(hr)));
  const ap = (p) => (p ? mApply(M, p) : null);
  return {
    head: mApply(M, headC), eye: mApply(HM, out.eye), mouth: mApply(HM, out.mouth || [36, 19]), paw: ap(out.paw), foot: ap(out.foot),
    tailTip: ap(out.tailTip), top: mApply(HM, [0, -44]), plate: ap(plateC),
  };
}
