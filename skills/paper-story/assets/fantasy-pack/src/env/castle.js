// 王城外景 CASTLE：七个时段同一布局（坐标写死，见 docs/storyboard.md 4.2），按深度分层绘制。
// 立体书（book.js）用同一个 drawCastle 经 popup 画进跨页，全部立起时与世界画面逐像素一致。
// 约定：纯函数（只由参数与 T 决定）；内部 save/restore；不调 ctx.layer / ctx.mask；只用 PAL。
import { PAL, rr, blob, poly, smooth as smoothPath, ribbon, cut, shade, lin, rad, glow, rays, sparkle } from '../core/paper.js';
import { clamp, lerp, seg, smoothstep, TAU, hash2, noise1, rgba, mixHex, hit, fract } from '../core/util.js';
import { cam, applyCam, toScreen } from '../core/camera.js';
import { outBack, outCubic, spring } from '../core/ease.js';
import { burst } from '../core/particles.js';
import { paperGlyph } from '../ui/type.js';
import { drawRoundWindow } from './roundwindow.js';

export { drawRoundWindow };

const M = mixHex;

// ———————————————————— 布局常量（世界坐标 = depth 1） ————————————————————
const TOWER_H = [170, 210, 250, 210];
const TOWERS = Array.from({ length: 13 }, (_, i) => {
  const keep = i === 6;
  const x = 300 + 110 * i;
  const h = keep ? 400 : TOWER_H[i % 4];
  const top = keep ? 300 : 700 - h;
  const coneTip = keep ? 120 : top - 70;
  return { i, x, w: keep ? 240 : 70, h, top, coneTip, poleTop: coneTip - 50, roof: i % 2 ? 'roof' : 'roofRed', keep, side: i < 6 ? -1 : 1 };
});

const HOUSES = [
  { x: 420, w: 150, wallH: 66, roofH: 58, roof: 'roofRed', wall: 'paper2', timber: 1, chim: 0.3, seed: 31 },
  { x: 600, w: 128, wallH: 80, roofH: 50, roof: 'roof', wall: 'sand', timber: 0, chim: -0.3, seed: 32 },
  { x: 780, w: 136, wallH: 64, roofH: 56, roof: 'wood', wall: 'stone', timber: 0, chim: 0.28, seed: 33 },
  { x: 1140, w: 140, wallH: 72, roofH: 60, roof: 'roofRed', wall: 'paper2', timber: 1, chim: -0.28, seed: 34 },
  { x: 1320, w: 132, wallH: 64, roofH: 52, roof: 'roof', wall: 'sand', timber: 0, chim: 0.3, seed: 35 },
  { x: 1500, w: 150, wallH: 70, roofH: 58, roof: 'roofRed', wall: 'stone', timber: 1, chim: -0.3, seed: 36 },
].map((h) => ({ ...h, base: 960, eave: 960 - h.wallH, ridge: 960 - h.wallH - h.roofH }));

export const CASTLE = {
  horizon: 620,
  /** 各层视差深度（storyboard 3.1 / 4.2） */
  depth: { sky: 0.05, far: 0.3, mid: 0.6, main: 1, near: 1.1, fg: 1.4, alarm: 1 },
  /** 13 座塔（i=6 即主堡，x=960）：x, w, h, top(塔身顶), coneTip(锥顶尖), poleTop(旗杆顶), roof, side(旗飘向：左半 −1、右半 +1) */
  towers: TOWERS,
  keep: { x0: 840, x1: 1080, y0: 300, y1: 700, cx: 960, spireY: 120, spireBase: 306, spireHalf: 108 },
  window: { x: 960, y: 430, r: 70 },
  balcony: { x0: 850, x1: 1070, floorY: 590, railY: 560, door: { x0: 925, x1: 995, y0: 510, y1: 590 }, lantern: [1062, 548], boxes: { x0: 860, x1: 922 } },
  wall: { x0: 260, x1: 1660, y0: 700, y1: 880, merlon: { w: 40, h: 30, step: 60 } },
  gate: { x0: 890, x1: 1030, y0: 740, y1: 880 },
  /** 城丘与山路在 mid 层（depth 0.6）坐标 */
  hill: { cx: 960, cy: 1150, rx: 1300, ry: 520 },
  road: [[960, 880], [1180, 930], [1400, 990], [1700, 1080], [2050, 1160]],
  snowPeak: { x: 1260, y: 330 },
  dragonPeak: { x: 1700, y: 400 },
  /** 城下屋顶（near 层 depth 1.1）：x 中心、宽、墙高、屋顶高，底 y=960 */
  houses: HOUSES,
  ground: { y0: 960, y1: 1080 },
  flag: { w: 80, h: 64, size: 52, lastScale: 1.5 },
  /** 婚礼横幅绕尖塔一圈的椭圆（main 层）：中心、半径、倾角 */
  spireWrap: { cx: 960, cy: 214, rx: 60, ry: 15, tilt: -0.07, w: 17 },
  /** 立体书天幕卡在城堡坐标里的矩形（书内 x 300–1620、y 260–880） */
  card: { x0: -360, x1: 2280, y0: -200, y1: 1040 },
  /** 书页下沿（立体件的锚线，城堡坐标） */
  pageBottom: 1040,
};

/** 预设机位（storyboard 4.2）。CA_BAL_K 为 L05 国王构图的近似值（场景以「！」圆点落点反解为准）。 */
export const CAMS = {
  CA_W: cam(960, 540, 1.0),
  CA_MW: cam(960, 560, 1.6),
  CA_BAL: cam(960, 545, 2.6),
  CA_TOWN: cam(960, 900, 1.8),
  CA_BAL_K: cam(856, 562, 2.6),
};

/** 推荐的图层参数（b01 立体书与 b02 世界必须用同一套，才能逐像素一致）。 */
export const LAYER_FX = {
  sky: { texture: 0.18 },
  far: { shadow: 5, texture: 0.3 },
  mid: { shadow: 7, texture: 0.3 },
  main: { shadow: 10, texture: 0.32 },
  near: { shadow: 9, texture: 0.3 },
  fg: { shadow: 8, texture: 0.25, blur: 3 },
  alarm: {},
};
/**
 * 三组合并版图层（缓冲紧张时用：3 个缓冲代替 6 个）：[[castle 层名…], ctx.layer 参数]。只读。
 * b01 立体件、b02 世界、b17 拉回必须用同一份分组与参数，交接帧才能逐像素一致（book 模型图已验）。
 */
export const LAYER_GROUPS = [
  [['sky', 'far'], { shadow: 5, texture: 0.18 }],
  [['mid', 'main'], { shadow: 10, texture: 0.32 }],
  [['near', 'fg'], { shadow: 9, texture: 0.3 }],
];

// ———————————————————— 时段 ————————————————————
const TIMES = {
  dawn: {
    sky: [[0, M(PAL.skyDay, PAL.skyDayLow, 0.12)], [0.4, M(PAL.skyDay, PAL.skyDayLow, 0.58)], [0.72, PAL.skyDayLow], [0.9, M(PAL.skyDayLow, PAL.skyDusk, 0.4)], [1, M(PAL.skyDusk, PAL.goldLight, 0.42)]],
    tint: PAL.goldLight, tintAmt: 0.06, dark: 0,
    shadeCol: PAL.heroBlueDark, shadeA: 0.3, rim: PAL.goldLight,
    haze: M(PAL.skyDayLow, PAL.skyDusk, 0.2), hazeK: 1,
    cloud: PAL.white, cloudShade: M(PAL.princessLight, PAL.skyDusk, 0.35), cloudRim: PAL.goldLight,
    sun: { kind: 'sun', x: 960, y: -54, r: 139, depth: 1 }, hglow: [PAL.goldLight, 0.5],
    win: 0, stars: 0, birds: 1, smoke: PAL.white, smokeA: 0.7, grass: PAL.meadow, blossom: 0, bunting: 0,
  },
  doom: {
    sky: [[0, M(PAL.skyDoom, PAL.ink, 0.3)], [0.38, PAL.skyDoom], [0.74, M(PAL.skyDoom, PAL.skyDoomLow, 0.55)], [1, PAL.skyDoomLow]],
    tint: PAL.skyDoom, tintAmt: 0.3, dark: 0.1,
    shadeCol: PAL.dragonDeep, shadeA: 0.42, rim: M(PAL.fire2, PAL.skyDoomLow, 0.35),
    haze: M(PAL.skyDoom, PAL.skyDoomLow, 0.45), hazeK: 1,
    cloud: M(PAL.skyDoom, PAL.inkSoft, 0.4), cloudShade: M(PAL.skyDoom, PAL.ink, 0.5), cloudRim: PAL.fire,
    sun: null, hglow: [PAL.fire, 0.55],
    win: 0.35, stars: 0, birds: 0, smoke: PAL.inkSoft, smokeA: 0.85, grass: PAL.grass, blossom: 0, bunting: 0,
  },
  gray: {
    sky: [[0, M(M(PAL.skyDay, PAL.stone2, 0.6), PAL.inkSoft, 0.3)], [0.55, M(PAL.skyDay, PAL.stone2, 0.6)], [1, M(M(PAL.skyDay, PAL.stone2, 0.6), PAL.paper, 0.32)]],
    tint: M(PAL.skyDay, PAL.stone2, 0.6), tintAmt: 0.32, dark: 0.07,
    shadeCol: PAL.inkSoft, shadeA: 0.3, rim: PAL.paper,
    haze: M(M(PAL.skyDay, PAL.stone2, 0.6), PAL.paper, 0.25), hazeK: 1.15,
    cloud: M(PAL.stone, PAL.paper, 0.25), cloudShade: M(PAL.stone2, PAL.inkSoft, 0.2), cloudRim: PAL.paper,
    sun: null, hglow: null,
    win: 0.15, stars: 0, birds: 0, smoke: PAL.stone2, smokeA: 0.8, grass: PAL.grass, blossom: 0, bunting: 0,
  },
  spring: {
    sky: [[0, M(PAL.skyDay, PAL.heroBlue, 0.1)], [0.5, PAL.skyDay], [0.84, PAL.skyDayLow], [1, M(PAL.skyDayLow, PAL.princessLight, 0.5)]],
    tint: PAL.white, tintAmt: 0.05, dark: 0,
    shadeCol: PAL.heroBlueDark, shadeA: 0.26, rim: PAL.white,
    haze: M(PAL.skyDayLow, PAL.skyDay, 0.25), hazeK: 0.9,
    cloud: PAL.white, cloudShade: M(PAL.skyDayLow, PAL.princessLight, 0.45), cloudRim: PAL.white,
    sun: { kind: 'sun', x: 1220, y: 250, r: 62, soft: 1 }, hglow: [PAL.white, 0.35],
    win: 0, stars: 0, birds: 1, smoke: PAL.white, smokeA: 0.65, grass: M(PAL.meadow, PAL.leafLight, 0.25), blossom: 1, bunting: 1,
  },
  wedding: {
    sky: [[0, M(PAL.skyDay, PAL.heroBlue, 0.06)], [0.5, M(PAL.skyDay, PAL.skyDayLow, 0.3)], [0.84, PAL.skyDayLow], [1, M(PAL.princessLight, PAL.goldLight, 0.45)]],
    tint: PAL.goldLight, tintAmt: 0.06, dark: 0,
    shadeCol: PAL.heroBlueDark, shadeA: 0.24, rim: PAL.white,
    haze: M(PAL.skyDayLow, PAL.princessLight, 0.3), hazeK: 0.9,
    cloud: PAL.white, cloudShade: M(PAL.princessLight, PAL.goldLight, 0.3), cloudRim: PAL.white,
    sun: { kind: 'sun', x: 1220, y: 250, r: 62, soft: 1 }, hglow: [PAL.goldLight, 0.4],
    win: 0, stars: 0, birds: 1, smoke: PAL.white, smokeA: 0.6, grass: M(PAL.meadow, PAL.leafLight, 0.3), blossom: 1, bunting: 1,
  },
  sunset: {
    sky: [[0, M(PAL.skyDuskHigh, PAL.skyNight, 0.3)], [0.42, PAL.skyDuskHigh], [0.74, M(PAL.skyDuskHigh, PAL.skyDusk, 0.62)], [0.9, PAL.skyDusk], [1, M(PAL.skyDusk, PAL.goldLight, 0.5)]],
    tint: M(PAL.skyDusk, PAL.fire, 0.25), tintAmt: 0.2, dark: 0.04,
    shadeCol: PAL.skyDuskHigh, shadeA: 0.4, rim: PAL.goldLight,
    haze: M(PAL.skyDusk, PAL.skyDuskHigh, 0.45), hazeK: 1,
    cloud: M(PAL.skyDusk, PAL.princessLight, 0.45), cloudShade: M(PAL.skyDuskHigh, PAL.skyDusk, 0.3), cloudRim: PAL.goldLight,
    sun: { kind: 'sunset', x: 1220, y: 250, r: 70 }, hglow: [PAL.fire2, 0.55],
    win: 0.45, stars: 0, birds: 0, smoke: M(PAL.skyDusk, PAL.paper, 0.5), smokeA: 0.6, grass: PAL.grass, blossom: 0, bunting: 0,
  },
  night: {
    sky: [[0, PAL.skyNightHigh], [0.6, M(PAL.skyNightHigh, PAL.skyNight, 0.72)], [1, M(PAL.skyNight, PAL.mountainDark, 0.32)]],
    tint: PAL.skyNight, tintAmt: 0.5, dark: 0.12,
    shadeCol: PAL.skyNightHigh, shadeA: 0.42, rim: PAL.moon,
    haze: M(PAL.skyNight, PAL.mountainDark, 0.35), hazeK: 0.8,
    cloud: M(PAL.skyNight, PAL.mountainDark, 0.55), cloudShade: PAL.skyNightHigh, cloudRim: PAL.moonGlow,
    sun: { kind: 'moon', x: 1220, y: 250, r: 56 }, hglow: [PAL.mountainDark, 0.3],
    win: 1, stars: 1, birds: 0, smoke: M(PAL.skyNight, PAL.stone2, 0.45), smokeA: 0.45, grass: PAL.grass, blossom: 0, bunting: 0,
  },
};
export const CASTLE_TIMES = Object.keys(TIMES);

const lookCache = new Map();
function baseLook(name) {
  let L = lookCache.get(name);
  if (L) return L;
  const d = TIMES[name] || TIMES.dawn;
  const cc = new Map();
  L = {
    ...d, name,
    C(hex) { let v = cc.get(hex); if (!v) { v = M(M(hex, d.tint, d.tintAmt), PAL.ink, d.dark); cc.set(hex, v); } return v; },
  };
  lookCache.set(name, L);
  return L;
}
function makeLook(time) {
  if (!time || typeof time === 'string') return baseLook(time || 'dawn');
  const a = baseLook(time.from), b = baseLook(time.to), k = clamp(time.k ?? 0);
  if (k <= 0) return a;
  if (k >= 1) return b;
  const mx = (p) => (a[p] && b[p] ? M(a[p], b[p], k) : a[p] || b[p]);
  return {
    ...b, name: b.name, blend: { a, b, k, wipe: time.wipe },
    C: (hex) => M(a.C(hex), b.C(hex), k),
    shadeCol: mx('shadeCol'), shadeA: lerp(a.shadeA, b.shadeA, k), rim: mx('rim'), haze: mx('haze'), hazeK: lerp(a.hazeK, b.hazeK, k),
    cloud: mx('cloud'), cloudShade: mx('cloudShade'), cloudRim: mx('cloudRim'), smoke: mx('smoke'), smokeA: lerp(a.smokeA, b.smokeA, k),
    grass: mx('grass'), win: lerp(a.win, b.win, k), stars: lerp(a.stars, b.stars, k), birds: lerp(a.birds, b.birds, k),
    blossom: lerp(a.blossom, b.blossom, k), bunting: lerp(a.bunting, b.bunting, k),
  };
}

// ———————————————————— 通用工具 ————————————————————
const memo = new Map();
/** 静态几何缓存（只存不可变的 Path2D / 点表，不影响结果的确定性）。 */
function MEMO(key, fn) {
  let v = memo.get(key);
  if (v === undefined) { v = fn(); if (memo.size > 3000) memo.clear(); memo.set(key, v); }
  return v;
}
const flatOf = (c, o) => (o.flat === true ? 1 : o.flat === false ? 0 : clamp(o.flat ?? c.flat ?? 0));

function withDepth(g, st, d) {
  g.setTransform(st.base);
  applyCam(g, st.c, lerp(d, 1, st.flat));
}

/** 立体件立起：以 baseY 为底边 scaleY（outBack）。返回 false 表示完全倒伏（不画）。 */
function popRun(g, k, baseY) {
  if (k === undefined || k === null || k >= 1) return true;
  if (k <= 0.002) return false;
  const s = Math.max(0.002, outBack(clamp(k), 1.5));
  g.translate(0, baseY);
  g.scale(1, s);
  g.translate(0, -baseY);
  return true;
}

/** 立起过程中的底部折角小片 + 折痕阴影（k=1 时完全消失，保证与世界画面一致）。 */
function foldTab(g, k, x0, x1, baseY, st) {
  if (k === undefined || k === null || k >= 0.999 || k <= 0.002) return;
  const a = 1 - smoothstep(0.7, 1, k);
  if (a <= 0) return;
  g.save();
  g.globalAlpha *= a;
  const h = 14 * (1 - k * 0.5);
  const p = poly([[x0 + 6, baseY], [x1 - 6, baseY], [x1 - 14, baseY + h], [x0 + 14, baseY + h]], { seed: 7 + x0, amp: 0.8 });
  cut(g, p, st.L.C(PAL.kraft));
  shade(g, p, PAL.shadow, 0, baseY, 0, baseY + h, 0.35, 0.05);
  g.restore();
}

/** 暗色错位分层（剪纸厚度感，代替逐形状 shadowBlur）后再剪纸填充。 */
function dcut(g, path, fill, o = {}) {
  const { dx = 2, dy = 2.6, sh = 0.2, rim = null, rimW = 2.4, alpha = 1 } = o;
  if (sh > 0) {
    g.save();
    g.translate(dx, dy);
    g.globalAlpha *= sh * alpha;
    g.fillStyle = PAL.shadow;
    g.fill(path);
    g.restore();
  }
  cut(g, path, fill, { rim, rimW, alpha });
}

/** Catmull-Rom 加密成折线。 */
function catmull(pts, n = 14) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function arcLen(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}
function atLen(pts, L, s) {
  s = clamp(s, 0, L[L.length - 1]);
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const k = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
  const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
  return [lerp(x1, x2, k), lerp(y1, y2, k), Math.atan2(y2 - y1, x2 - x1)];
}

const ROAD = () => MEMO('road', () => { const p = catmull(CASTLE.road, 18); return { p, L: arcLen(p) }; });
/** 山路上弧长比例 u (0 城门 → 1 出画) 处的点 [x, y, 切线角]（mid 层坐标；CA-W 下与主体层重合）。 */
export function roadPoint(u) { const r = ROAD(); return atLen(r.p, r.L, clamp(u) * r.L[r.L.length - 1]); }
/** 山路加密折线（供卷轴铺路等沿路排布）。 */
export function roadPoints() { return ROAD().p.map((q) => [q[0], q[1]]); }
/** 某 x 处城丘顶边的 y（mid 层坐标）。 */
export function hillTopY(x) {
  const { cx, cy, rx, ry } = CASTLE.hill;
  const u = (x - cx) / rx;
  return Math.abs(u) >= 1 ? cy : cy - ry * Math.sqrt(1 - u * u);
}

/** 弧线（悬链近似）点表。 */
function swag(ax, ay, bx, by, sag, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(ax, bx, t), lerp(ay, by, t) + sag * 4 * t * (1 - t)]); }
  return out;
}

// ———————————————————— popup 归一化 ————————————————————
/** 立体书立起顺序（数组形式的下标）：0 天幕卡 1 城丘 2 城墙 3–15 塔 0–12 16 主堡 17 屋顶 18 花丛 19 太阳 20 纸鸟 21 云 22 公主 */
export const POPUP_KEYS = ['card', 'hill', 'wall', ...Array.from({ length: 13 }, (_, i) => `tower${i}`), 'keep', 'roofs', 'flowers', 'sun', 'birds', 'clouds', 'princess'];
function popupOf(p) {
  if (p === undefined || p === null) return null;
  const P = { card: 1, hill: 1, wall: 1, towers: Array(13).fill(1), keep: 1, roofs: 1, flowers: 1, sun: 1, birds: 1, clouds: 1, princess: 1 };
  if (typeof p === 'number') {
    for (const k of Object.keys(P)) if (k !== 'towers') P[k] = p;
    P.towers = Array(13).fill(p);
  } else if (Array.isArray(p)) {
    const v = (i) => (p[i] === undefined ? 1 : p[i]);
    P.card = v(0); P.hill = v(1); P.wall = v(2);
    for (let i = 0; i < 13; i++) P.towers[i] = v(3 + i);
    P.keep = v(16); P.roofs = v(17); P.flowers = v(18); P.sun = v(19); P.birds = v(20); P.clouds = v(21); P.princess = v(22);
  } else {
    for (const k of Object.keys(P)) if (k !== 'towers' && p[k] !== undefined) P[k] = p[k];
    if (p.towers !== undefined) P.towers = Array.isArray(p.towers) ? Array.from({ length: 13 }, (_, i) => p.towers[i] ?? 1) : Array(13).fill(p.towers);
  }
  return P;
}

// ———————————————————— 主函数 ————————————————————
/**
 * drawCastle(g, T, cam, o)
 * o.layer: 'sky' | 'far' | 'mid' | 'main' | 'near' | 'fg' | 'alarm'
 * o.time: 'dawn'|'doom'|'gray'|'spring'|'wedding'|'sunset'|'night' 或 {from, to, k, wipe:'down'}
 * 其余见 docs/api/castle.md。返回 { depth }（该层实际使用的视差深度，可配合 toScreen）。
 */
export function drawCastle(g, T, c, o = {}) {
  const layer = o.layer || 'main';
  const st = {
    T, c, o, layer,
    flat: flatOf(c, o),
    L: makeLook(o.time),
    P: popupOf(o.popup),
    detail: o.detail ?? 1,
    strings: clamp(o.strings ?? c.strings ?? 0),
    base: null,
  };
  g.save();
  st.base = g.getTransform();
  try {
    if (layer === 'sky') drawSkyLayer(g, st);
    else if (layer === 'far') drawFarLayer(g, st);
    else if (layer === 'mid') drawMidLayer(g, st);
    else if (layer === 'main') drawMainLayer(g, st);
    else if (layer === 'near') drawNearLayer(g, st);
    else if (layer === 'fg') drawFgLayer(g, st);
    else if (layer === 'alarm') drawAlarmLayer(g, st);
  } finally {
    g.restore();
  }
  return { depth: lerp(CASTLE.depth[layer] ?? 1, 1, st.flat) };
}

/** 某层某世界点在该机位下的屏幕坐标（已考虑 flat）。 */
export function castleToScreen(c, layer, x, y, o = {}) {
  const f = flatOf(c, o);
  const d = lerp(layer === 'skyFill' ? 0 : CASTLE.depth[layer] ?? 1, 1, f);
  return toScreen(c, d, x, y);
}

// 天幕卡裁剪（立体书模式）：在主体层坐标里裁出卡片矩形并随卡片立起
function clipCard(g, st) {
  if (!st.P) return;
  withDepth(g, st, 1);
  const { x0, x1, y0, y1 } = CASTLE.card;
  if (!popRun(g, st.P.card, y1)) { g.beginPath(); g.rect(0, 0, 0, 0); g.clip(); return; }
  g.beginPath();
  g.rect(x0, y0, x1 - x0, y1 - y0);
  g.clip();
}
function popCard(g, st) {
  if (st.P && st.flat > 0.999) popRun(g, st.P.card, CASTLE.card.y1);
}

// ════════════════════════════════ 天空 ════════════════════════════════
function paintSky(g, stops) {
  g.fillStyle = lin(g, 0, 0, 0, 640, stops);
  g.fillRect(-4000, -4000, 10000, 10000);
}

function drawSkyLayer(g, st) {
  const { o, L } = st;
  g.save();
  clipCard(g, st);
  withDepth(g, st, 0);
  popCard(g, st);
  // 渐变底
  if (L.blend) {
    paintSky(g, L.blend.a.sky);
    g.save();
    if (L.blend.wipe === 'down') {
      const y = lerp(-200, 900, L.blend.k);
      g.beginPath(); g.rect(-4000, -4000, 10000, 4000 + y); g.clip();
      paintSky(g, L.blend.b.sky);
      g.fillStyle = lin(g, 0, y - 160, 0, y, [[0, rgba(L.blend.b.sky[L.blend.b.sky.length - 1][1], 0)], [1, rgba(L.blend.a.sky[0][1], 0.6)]]);
      g.fillRect(-4000, y - 160, 10000, 160);
    } else {
      g.globalAlpha *= L.blend.k;
      paintSky(g, L.blend.b.sky);
    }
    g.restore();
  } else paintSky(g, L.sky);
  // 地平线光
  if (L.hglow) {
    const [hc, ha] = L.hglow;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= ha;
    const sx = L.sun ? L.sun.x : 960;
    g.fillStyle = rad(g, sx, 640, 0, 900, [[0, rgba(hc, 0.85)], [0.45, rgba(hc, 0.3)], [1, rgba(hc, 0)]]);
    g.fillRect(-2000, -400, 6000, 1600);
    g.restore();
  }
  // L02 双天空：split 右侧是 skyDoom
  const split = o.split ?? o.sky?.split;
  const splitP = split !== undefined && split !== null ? splitRegion(split) : null;
  if (splitP) paintSplit(g, st, splitP);
  // 星（印在天幕卡上）
  withDepth(g, st, CASTLE.depth.sky);
  popCard(g, st);
  if (L.stars > 0) drawStars(g, st, L.stars);
  g.restore();
  // 挂件：日月、云、鸟、撕裂（depth 0.05；不受天幕卡裁剪）
  withDepth(g, st, CASTLE.depth.sky);
  popCard(g, st);
  g.save();
  if (splitP) {
    // 黎明的太阳、云、鸟只留在 split 左侧
    withDepth(g, st, 0);
    const q = new Path2D();
    q.rect(-6000, -6000, 14000, 14000);
    q.addPath(splitP.path);
    g.clip(q, 'evenodd');
    withDepth(g, st, CASTLE.depth.sky);
  }
  drawSunMoon(g, st);
  drawClouds(g, st, L);
  const birds = o.birds ?? L.birds;
  if (birds) drawHangBirds(g, st, typeof birds === 'number' ? birds : 1);
  g.restore();
  if (splitP) {
    g.save();
    withDepth(g, st, 0);
    g.clip(splitP.path);
    withDepth(g, st, CASTLE.depth.sky);
    drawClouds(g, st, baseLook('doom'));
    g.restore();
  }
  if (o.tear) drawTear(g, st, o.tear);
}

function splitRegion(split) {
  const pts = [];
  for (let y = -300; y <= 1400; y += 50) pts.push([split + noise1(y * 0.011, 41) * 30 + Math.sin(y * 0.021) * 12, y]);
  const path = poly([[split + 6000, -300], ...pts, [split + 6000, 1400]], { seed: 9, amp: 5, step: 28 });
  return { pts, path };
}
function paintSplit(g, st, sp) {
  const D = baseLook('doom');
  g.save();
  g.clip(sp.path);
  paintSky(g, D.sky);
  g.globalCompositeOperation = 'screen';
  g.globalAlpha *= 0.55;
  const x0 = sp.pts[0][0];
  g.fillStyle = rad(g, x0 + 700, 640, 0, 900, [[0, rgba(PAL.fire, 0.8)], [1, rgba(PAL.fire, 0)]]);
  g.fillRect(-2000, -400, 6000, 1600);
  g.restore();
  // 后缘：一道暗紫的龙影拖尾 + 纸边亮线
  g.save();
  g.lineJoin = 'round';
  g.globalAlpha *= 0.4;
  g.strokeStyle = PAL.dragonDeep;
  g.lineWidth = 26;
  g.stroke(smoothPath(sp.pts.map(([x, y]) => [x + 10, y]), { closed: false }));
  g.globalAlpha = 0.55;
  g.strokeStyle = PAL.skyDoomLow;
  g.lineWidth = 3;
  g.stroke(smoothPath(sp.pts, { closed: false }));
  g.restore();
}

function drawStars(g, st, k) {
  const { T } = st;
  g.save();
  for (let i = 0; i < 90; i++) {
    const x = -260 + hash2(i, 3) * 2440;
    const y = -60 + Math.pow(hash2(i, 4), 1.35) * 640;
    const tw = 0.55 + 0.45 * Math.sin(T * (1.2 + hash2(i, 5) * 2.5) + hash2(i, 6) * TAU);
    const s = 1.2 + hash2(i, 7) * 2.4;
    g.globalAlpha = k * tw * (0.5 + 0.5 * hash2(i, 8));
    g.fillStyle = hash2(i, 9) < 0.3 ? PAL.moonGlow : PAL.white;
    g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
  }
  for (let i = 0; i < 11; i++) {
    const x = -100 + hash2(i, 13) * 2100, y = 30 + hash2(i, 14) * 360;
    const tw = 0.6 + 0.4 * Math.sin(T * 1.7 + i * 2.1);
    sparkle(g, x, y, (9 + hash2(i, 15) * 9) * tw, { color: PAL.moonGlow, alpha: k * 0.95, rot: 0.1 * Math.sin(T * 0.5 + i) });
  }
  g.restore();
}

// 太阳 / 月亮：位置不随 flat 变化（否则推镜切换视差时会跳）。黎明的太阳就是立体书里挂铁丝的那个：
// 城堡坐标 (960,−54) r139、depth 1（= 书内 (960,333)，BK-SPREAD 下屏幕约 (960,322)）；其它时段在 depth 0.05 的 (1220,250)。
function sunGeom(st, S) {
  return { x: S.x, y: S.y, r: S.r, depth: S.depth ?? CASTLE.depth.sky };
}
function drawSunMoon(g, st) {
  const { o, L, P } = st;
  if (o.sun === false) return;
  const list = [];
  if (L.blend) {
    if (L.blend.a.sun) list.push([L.blend.a.sun, 1 - L.blend.k]);
    if (L.blend.b.sun) list.push([L.blend.b.sun, L.blend.k]);
  } else if (L.sun) list.push([L.sun, 1]);
  if (o.sun && typeof o.sun === 'object') {
    // 屏幕坐标指定（O02 必须 (1220,250) r70）
    g.save();
    g.setTransform(st.base);
    const kind = o.sun.kind || (L.sun ? L.sun.kind : 'sun');
    paintSun(g, st, kind, o.sun.x, o.sun.y, o.sun.r, 1, L.sun?.soft);
    g.restore();
    return;
  }
  for (const [S, a] of list) {
    if (a <= 0.001) continue;
    let { x, y, r, depth } = sunGeom(st, S);
    const k = P ? P.sun : 1;
    if (k <= 0.002) continue;
    g.save();
    withDepth(g, st, depth);
    popCard(g, st);
    if (k < 1) y += (1 - outBack(clamp(k), 1.3)) * 620;
    // 细铁丝（立体书）
    if (st.strings > 0) {
      g.save();
      g.globalAlpha *= st.strings * a;
      g.strokeStyle = M(PAL.steelDark, PAL.inkSoft, 0.4);
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y + r * 0.6); g.quadraticCurveTo(x + 4, (y + CASTLE.pageBottom) / 2, x + 10, CASTLE.pageBottom); g.stroke();
      g.restore();
    }
    paintSun(g, st, S.kind, x, y, r, a, S.soft);
    g.restore();
  }
}

/** 太阳 / 月亮 / 夕阳圆盘（book.js 的封面太阳徽章也用它，保证形状匹配）。 */
export function paintSun(g, st, kind, x, y, r, a = 1, soft = 0, glowK = 1) {
  const T = st.T ?? 0;
  g.save();
  g.globalAlpha *= a;
  if (kind === 'moon') {
    glow(g, x, y, r * 3.2, PAL.moonGlow, 0.35 * glowK);
    const disk = blob(x, y, r, r, { seed: 61, amp: 0.012 });
    cut(g, disk, rad(g, x - r * 0.3, y - r * 0.3, 0, r * 1.3, [PAL.white, PAL.moon, M(PAL.moon, PAL.moonGlow, 0.6)]), { rim: PAL.white });
    for (const [dx, dy, rr_] of [[-0.3, -0.12, 0.2], [0.28, 0.22, 0.14], [0.05, 0.42, 0.1], [0.35, -0.36, 0.09]]) {
      g.fillStyle = rgba(M(PAL.moonGlow, PAL.stone2, 0.5), 0.45);
      g.fill(blob(x + dx * r, y + dy * r, rr_ * r, rr_ * r, { seed: 62 + dx * 10, amp: 0.05 }));
    }
    shade(g, disk, PAL.skyNight, x - r, y - r, x + r, y + r, 0, 0.3);
  } else if (kind === 'sunset') {
    glow(g, x, y, r * 4, PAL.fire2, 0.55 * glowK);
    glow(g, x, y, r * 2, PAL.goldLight, 0.5 * glowK);
    const disk = blob(x, y, r, r, { seed: 63, amp: 0.008 });
    cut(g, disk, lin(g, x, y - r, x, y + r, [PAL.goldLight, M(PAL.goldLight, PAL.fire2, 0.5), PAL.fire]), { rim: PAL.white, rimW: 3 });
    g.save(); g.clip(disk);
    g.fillStyle = rgba(PAL.fireDeep, 0.22);
    for (let i = 0; i < 3; i++) g.fillRect(x - r, y + r * (0.25 + i * 0.22), r * 2, r * 0.07);
    g.restore();
  } else {
    glow(g, x, y, r * (soft ? 3.6 : 3.2), PAL.goldLight, (soft ? 0.45 : 0.55) * glowK);
    // 纸剪光芒：长短交替的三角
    const rot = T * 0.12;
    const n = 12;
    const rayP = new Path2D();
    for (let i = 0; i < n; i++) {
      const ang = rot + (i / n) * TAU;
      const L1 = r * (i % 2 ? 1.3 : 1.46), w = 0.17;
      rayP.moveTo(x + Math.cos(ang - w) * r * 0.92, y + Math.sin(ang - w) * r * 0.92);
      rayP.lineTo(x + Math.cos(ang) * L1, y + Math.sin(ang) * L1);
      rayP.lineTo(x + Math.cos(ang + w) * r * 0.92, y + Math.sin(ang + w) * r * 0.92);
      rayP.closePath();
    }
    g.save();
    g.globalAlpha *= soft ? 0.55 : 1;
    cut(g, rayP, PAL.gold, { rim: PAL.goldLight, rimW: 2 });
    g.restore();
    const disk = blob(x, y, r, r, { seed: 64, amp: 0.01 });
    cut(g, disk, rad(g, x - r * 0.25, y - r * 0.3, 0, r * 1.1, [PAL.white, PAL.goldLight, M(PAL.goldLight, PAL.gold, 0.55)]), { rim: PAL.white, rimW: 3 });
    cut(g, blob(x, y, r * 0.72, r * 0.72, { seed: 65, amp: 0.012 }), rgba(PAL.white, 0.28));
  }
  g.restore();
}

// 云：整块剪纸剪影（后层偏暗错位 + 顶边切口亮带），挂线下坠（立体书）
const CLOUDS = [
  { x: 300, y: 180, w: 230, s: 1 },
  { x: 690, y: 92, w: 150, s: 2 },
  { x: 1560, y: 150, w: 250, s: 3 },
  { x: 1840, y: 330, w: 170, s: 4 },
];
function cloudPath(w, seed) {
  return MEMO(`cloud|${w}|${seed}`, () => {
    const p = new Path2D();
    const h = w * 0.36;
    const bumps = [[-0.36, 0.04, 0.2], [-0.15, -0.1, 0.28], [0.12, -0.05, 0.25], [0.34, 0.05, 0.19]];
    for (const [bx, by, br] of bumps) p.addPath(blob(bx * w, by * w, br * w * (0.92 + hash2(seed, bx * 10) * 0.16), br * w * 0.86, { seed: seed * 7 + bx * 13, amp: 0.03 }));
    p.addPath(poly([[-w * 0.5, 0.02 * w], [w * 0.5, 0.02 * w], [w * 0.46, h * 0.4], [-w * 0.46, h * 0.4]], { seed, amp: 1, round: 0.8 }));
    return p;
  });
}
function paintCloud(g, p, w, c) {
  g.save();
  g.translate(6, 7);
  g.fillStyle = c.cloudShade;
  g.fill(p);
  g.restore();
  g.save();
  g.clip(p);
  g.fillStyle = c.cloudRim;
  g.fillRect(-w, -w, w * 2, w * 2);
  g.translate(0.8, 3.4);
  g.fillStyle = c.cloud;
  g.fill(p);
  g.restore();
  shade(g, p, c.cloudShade, 0, -w * 0.16, 0, w * 0.15, 0, 0.62);
}
function drawClouds(g, st, c) {
  const { T, P } = st;
  if (st.o.clouds === false) return;
  const k = P ? P.clouds : 1;
  if (k <= 0.002) return;
  const drop = k < 1 ? (1 - outBack(clamp(k), 1.4)) * -520 : 0;
  for (const cl of CLOUDS) {
    const x = cl.x + Math.sin(T * 0.23 + cl.s * 1.7) * 9;
    const y = cl.y + Math.sin(T * 0.41 + cl.s * 2.3) * 3.5 + drop * (0.8 + cl.s * 0.08);
    if (st.strings > 0) {
      g.save();
      g.globalAlpha *= st.strings * 0.8;
      g.strokeStyle = M(PAL.inkSoft, PAL.paper2, 0.3);
      g.lineWidth = 1.8;
      for (const sx of [-0.22, 0.24]) { g.beginPath(); g.moveTo(x + sx * cl.w, CASTLE.card.y0); g.lineTo(x + sx * cl.w, y - cl.w * 0.12); g.stroke(); }
      g.restore();
    }
    g.save();
    g.translate(x, y);
    paintCloud(g, cloudPath(cl.w, cl.s), cl.w, c);
    g.restore();
  }
}

// 挂线纸鸟（滑翔、慢扇翅）
const BIRDS = [[452, 300, 1, 1.35], [566, 254, 2, 1.1], [1408, 206, 3, 1.22]];
function paperBird(g, L, s, T, seed) {
  const f1 = Math.sin(T * 3.1 + seed * 1.9), f2 = Math.sin(T * 3.1 + seed * 1.9 + 0.45);
  const wing = (k) => lerp(-0.45, 1, (k + 1) / 2);
  // 远翼
  g.save(); g.translate(0, -2); g.scale(1, wing(f1));
  cut(g, poly([[-6, 0], [8, 0], [-10, -26], [-22, -22]], { seed: seed + 1, amp: 0.5, round: 0.4 }), L.C(PAL.paper2));
  g.restore();
  // 尾
  cut(g, poly([[-16, -2], [-31, -10], [-27, 0], [-32, 9], [-16, 3]], { seed: seed + 2, amp: 0.4, round: 0.2 }), L.C(PAL.paper2));
  // 身
  const body = smoothPath([[-20, 0], [-8, -6.5], [9, -6], [19, -3], [23, 0.5], [16, 4.5], [0, 6.5], [-14, 4]], { closed: true, tension: 0.5 });
  cut(g, body, L.C(PAL.white), { rim: L.rim, rimW: 1.6 });
  shade(g, body, L.shadeCol, 0, 7, 0, -2, L.shadeA * 1.1, 0);
  cut(g, poly([[21, -2.2], [29, 0.2], [21, 2.4]], { seed: seed + 3, amp: 0.2 }), L.C(PAL.gold));
  g.fillStyle = L.C(PAL.ink);
  g.beginPath(); g.arc(15, -1.6, 1.5, 0, TAU); g.fill();
  // 近翼
  g.save(); g.translate(0, -3); g.scale(1, wing(f2));
  const nw = poly([[-8, 0], [10, 0], [-6, -32], [-20, -28]], { seed: seed + 4, amp: 0.5, round: 0.4 });
  cut(g, nw, L.C(PAL.white), { rim: L.rim, rimW: 1.4 });
  shade(g, nw, L.shadeCol, 0, 0, 0, -30, L.shadeA * 0.8, 0);
  g.restore();
  void s;
}
function drawHangBirds(g, st, a) {
  const { T, P, L } = st;
  const k = P ? P.birds : 1;
  if (k <= 0.002) return;
  const drop = k < 1 ? (1 - outBack(clamp(k), 1.6)) * -480 : 0;
  for (const [bx, by, s, sc] of BIRDS) {
    const x = bx + Math.sin(T * 0.5 + s * 2) * 14;
    const y = by + Math.sin(T * 0.8 + s) * 6 + drop;
    if (st.strings > 0) {
      g.save();
      g.globalAlpha *= st.strings * 0.8 * a;
      g.strokeStyle = M(PAL.inkSoft, PAL.paper2, 0.3);
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, CASTLE.card.y0); g.lineTo(x, y - 6); g.stroke();
      g.restore();
    }
    g.save();
    g.globalAlpha *= a;
    g.translate(x, y);
    g.rotate(Math.sin(T * 0.6 + s) * 0.07);
    g.scale(sc, sc);
    paperBird(g, L, sc, T, s);
    g.restore();
  }
}

// 纸天撕裂（L02）：锯齿口张开，纸瓣绕折线向外翻（正面是天、背面 paper2），口内是黑
function tearShape(tear, T) {
  const at = tear.at ?? 0;
  const p = clamp((T - at) / (tear.dur ?? 0.2));
  if (p <= 0) return null;
  const e = outBack(p, 1.3);
  const W = (tear.w ?? 300) * e, H = (tear.h ?? 210) * e;
  const n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.12;
    const jag = i % 2 ? 0.5 + hash2(i, 77) * 0.18 : 1 + hash2(i, 78) * 0.12;
    pts.push([tear.x + Math.cos(a) * W * 0.5 * jag, tear.y + Math.sin(a) * H * 0.5 * jag]);
  }
  return { pts, p, e, W, H };
}
/** 撕口路径（sky 层坐标，≈ CA-W 屏幕坐标），供场景裁剪龙头。null = 还没撕开。 */
export function tearPath(tear, T) {
  const s = tearShape(tear, T);
  if (!s) return null;
  const q = new Path2D();
  const outer = s.pts.filter((_, i) => i % 2 === 0);
  q.moveTo(outer[0][0], outer[0][1]);
  for (const v of outer.slice(1)) q.lineTo(v[0], v[1]);
  q.closePath();
  return q;
}
function drawTear(g, st, tear) {
  const s = tearShape(tear, st.T);
  if (!s) return;
  const { pts } = s;
  const n = pts.length;
  const hole = tearPath(tear, st.T);
  g.save();
  g.lineJoin = 'round';
  g.fillStyle = rad(g, tear.x, tear.y, 0, Math.max(s.W, s.H) * 0.62, [[0, M(PAL.dragonDeep, PAL.magic, 0.12)], [0.55, PAL.dragonDeep], [1, PAL.ink]]);
  g.fill(hole);
  g.save(); g.clip(hole); g.strokeStyle = rgba(PAL.ink, 0.7); g.lineWidth = 18; g.stroke(hole); g.restore();
  // 纸瓣：铰在相邻两个外角之间，尖端（内角）绕折线翻到外面
  const fold = clamp(s.p * 1.25);
  const ph = Math.PI * 0.9 * outCubic(fold);
  const skyFill = lin(g, 0, 0, 0, 640, st.L.sky);
  for (let i = 0; i < n; i += 2) {
    const a = pts[i], b = pts[(i + 1) % n], c2 = pts[(i + 2) % n];
    const dx = c2[0] - a[0], dy = c2[1] - a[1], ll = dx * dx + dy * dy || 1;
    const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / ll;
    const m = [a[0] + dx * t, a[1] + dy * t];
    const v = [b[0] - m[0], b[1] - m[1]];
    const k = Math.cos(ph + hash2(i, 81) * 0.25);
    const tip = [m[0] + v[0] * k * 1.08, m[1] + v[1] * k * 1.08];
    const flap = poly([a, tip, c2], { seed: i + 80, amp: 0.6 });
    if (k > 0) cut(g, flap, skyFill);
    else {
      cut(g, flap, PAL.paper2);
      shade(g, flap, PAL.kraftDark, m[0], m[1], tip[0], tip[1], 0.5, 0);
    }
    g.strokeStyle = rgba(PAL.white, 0.95);
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(tip[0], tip[1]); g.lineTo(c2[0], c2[1]); g.stroke();
    g.strokeStyle = rgba(PAL.kraftDark, 0.55);
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c2[0], c2[1]); g.stroke();
  }
  g.restore();
}

// ════════════════════════════════ 远景 ════════════════════════════════
function drawFarLayer(g, st) {
  clipCard(g, st);
  withDepth(g, st, CASTLE.depth.far);
  popCard(g, st);
  backRange(g, st);
  dragonMountain(g, st);
  snowPeak(g, st);
  frontHills(g, st);
  farGround(g, st);
  if (st.P) {
    // 天幕卡的切口亮边与底部折痕
    withDepth(g, st, 1);
    if (popRun(g, st.P.card, CASTLE.card.y1)) {
      const { x0, x1, y0, y1 } = CASTLE.card;
      g.strokeStyle = rgba(PAL.white, 0.85);
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(x0 + 3, y1); g.lineTo(x0 + 3, y0 + 3); g.lineTo(x1 - 3, y0 + 3); g.lineTo(x1 - 3, y1); g.stroke();
      g.strokeStyle = rgba(PAL.shadow, 0.35);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(x1 - 1, y0 + 6); g.lineTo(x1 - 1, y1); g.stroke();
    }
  }
}
const hz = (st, hex, k) => M(st.L.C(hex), st.L.haze, clamp(k * st.L.hazeK));

function facetMountain(g, st, peaks, base, lit, dark, seed) {
  const pts = [[peaks[0][0] - 300, base], ...peaks, [peaks[peaks.length - 1][0] + 300, base]];
  const body = poly(pts, { seed, amp: 2, step: 34 });
  cut(g, body, dark, { rim: rgba(st.L.rim, 0.55), rimW: 2 });
  // 每个峰的受光左坡
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    if (i > 1 && pts[i - 1][1] < py) continue;
    const lv = pts[i - 1], rv = pts[i + 1];
    const mid = [px + (rv[0] - px) * 0.18, lerp(py, base, 0.55)];
    const lp = poly([lv, [px, py], mid, [px + (rv[0] - px) * 0.08, base], [lv[0], base]], { seed: seed + i, amp: 1.4, step: 30 });
    g.save(); g.clip(body); cut(g, lp, lit); g.restore();
  }
  return body;
}

function backRange(g, st) {
  const peaks = [[-640, 520], [-420, 455], [-200, 515], [40, 448], [260, 520], [470, 472], [700, 540], [930, 494], [1150, 545], [1440, 500], [1660, 540], [1960, 465], [2200, 525], [2460, 470], [2700, 540]];
  facetMountain(g, st, peaks, 760, hz(st, PAL.mountainFar, 0.42), hz(st, M(PAL.mountainFar, PAL.mountain, 0.55), 0.48), 101);
}

function snowPeak(g, st) {
  const { L, T } = st;
  const { x, y } = CASTLE.snowPeak;
  const lit = hz(st, M(PAL.mountain, PAL.mountainFar, 0.35), 0.22), dk = hz(st, PAL.mountainDark, 0.25);
  const left = [[x - 330, 660], [x - 250, 560], [x - 196, 520], [x - 120, 430], [x - 64, 385], [x, y]];
  const right = [[x + 48, 372], [x + 94, 420], [x + 150, 452], [x + 214, 528], [x + 270, 560], [x + 340, 660]];
  const body = poly([...left, ...right], { seed: 111, amp: 1.6, step: 28 });
  cut(g, body, dk, { rim: L.rim, rimW: 2.2 });
  const litP = poly([...left, [x + 18, 470], [x - 30, 660]], { seed: 112, amp: 1.6, step: 28 });
  g.save(); g.clip(body); cut(g, litP, lit); g.restore();
  // 雪顶
  const snowL = poly([[x - 112, 438], [x - 64, 385], [x, y], [x + 48, 372], [x + 92, 418], [x + 62, 428], [x + 40, 412], [x + 18, 440], [x - 8, 418], [x - 36, 452], [x - 70, 430]], { seed: 113, amp: 1, step: 16 });
  cut(g, snowL, hz(st, PAL.snowShade, 0.1), { rim: L.rim, rimW: 2 });
  const snowLit = poly([[x - 112, 438], [x - 64, 385], [x, y], [x + 6, 420], [x - 8, 418], [x - 36, 452], [x - 70, 430]], { seed: 114, amp: 1, step: 16 });
  g.save(); g.clip(snowL); cut(g, snowLit, hz(st, PAL.snow, 0.06)); g.restore();
  // 峰顶小红旗（立誓之山）
  const fx = x + 2, fy = y + 2;
  g.save();
  g.strokeStyle = L.C(PAL.woodDark); g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 34); g.stroke();
  const wv = (u) => Math.sin(u * 5 - T * 6) * 2.4 * u;
  const flag = poly([[fx, fy - 34], [fx + 13, fy - 33 + wv(0.5)], [fx + 26, fy - 31 + wv(1)], [fx + 13, fy - 24 + wv(0.5)], [fx, fy - 20]], { seed: 115, amp: 0.4, round: 0.4 });
  cut(g, flag, L.C(PAL.scarf), { rim: PAL.white, rimW: 1.4 });
  g.restore();
}

function dragonMountain(g, st) {
  const { L, T } = st;
  const { x, y } = CASTLE.dragonPeak;
  const base = M(PAL.mountainDark, PAL.dragonDark, 0.6);
  const dk = hz(st, base, 0.2), lit = hz(st, M(base, PAL.dragon, 0.38), 0.2);
  const left = [[x - 270, 660], [x - 210, 560], [x - 150, 520], [x - 112, 470], [x - 70, 455], [x - 42, 420], [x - 18, 432], [x, y]];
  const right = [[x + 22, 418], [x + 40, 408], [x + 66, 446], [x + 104, 470], [x + 160, 532], [x + 240, 590], [x + 300, 660]];
  const body = poly([...left, ...right], { seed: 121, amp: 1.6, step: 26 });
  cut(g, body, dk, { rim: M(L.rim, PAL.magic, 0.4), rimW: 2 });
  const litP = poly([...left, [x + 10, 500], [x - 40, 660]], { seed: 122, amp: 1.5, step: 26 });
  g.save(); g.clip(body); cut(g, litP, lit); g.restore();
  // 洞口
  const cave = blob(x + 18, 560, 34, 22, { seed: 123, amp: 0.06 });
  cut(g, cave, M(PAL.dragonDeep, PAL.ink, 0.4));
  glow(g, x + 18, 562, 40, PAL.magic, 0.18);
  // 一缕细烟：一串慢慢上升、变大、变淡的烟团
  const sc = L.C(M(PAL.stone2, PAL.dragonWing, 0.25));
  g.save();
  for (let j = 0; j < 7; j++) {
    const ph = fract(T * 0.13 + j / 7);
    const yy = y - 4 - ph * 190;
    const xx = x + 4 + ph * 52 + Math.sin(ph * 5.5 + T * 0.45 + j) * 9;
    const r = 5 + ph * 21;
    g.globalAlpha = 0.55 * Math.pow(Math.sin(ph * Math.PI), 1.2) * (1 - ph * 0.35);
    g.fillStyle = sc;
    g.fill(blob(xx, yy, r, r * 0.78, { seed: 125 + j, amp: 0.09 }));
  }
  g.restore();
}

function frontHills(g, st) {
  const { L } = st;
  const col = hz(st, M(PAL.forest, PAL.mountainFar, 0.55), 0.3);
  const col2 = hz(st, M(PAL.forest, PAL.mountainFar, 0.4), 0.22);
  const pts = [];
  for (let x = -700; x <= 2700; x += 90) pts.push([x, 596 + Math.sin(x * 0.006 + 1.3) * 18 + Math.sin(x * 0.017) * 7]);
  const p = poly([[-700, 760], ...pts, [2700, 760]], { seed: 131, amp: 1.5, step: 40, round: 0.5 });
  cut(g, p, col, { rim: rgba(L.rim, 0.4), rimW: 1.6 });
  // 远处小树丛
  g.save();
  for (let i = 0; i < 46; i++) {
    const x = -600 + i * 72 + hash2(i, 132) * 40;
    const yb = 596 + Math.sin(x * 0.006 + 1.3) * 18 + Math.sin(x * 0.017) * 7 + 6;
    const r = 8 + hash2(i, 133) * 9;
    g.fillStyle = col2;
    g.fill(blob(x, yb - r * 0.6, r * 0.8, r, { seed: 134 + i, amp: 0.05 }));
  }
  g.restore();
}

function farGround(g, st) {
  const { L } = st;
  const base = hz(st, M(PAL.meadow, PAL.mountainFar, 0.4), 0.32);
  const p = poly([[-900, 628], [2800, 628], [2800, 1400], [-900, 1400]], { seed: 141, amp: 2, step: 60 });
  cut(g, p, base);
  // 远田条纹
  g.save();
  g.clip(p);
  const stripes = [hz(st, PAL.leafLight, 0.4), hz(st, PAL.grass, 0.36), hz(st, PAL.sand, 0.42)];
  for (let i = 0; i < 16; i++) {
    const x = -800 + hash2(i, 142) * 3400, y = 646 + hash2(i, 143) * 170, w = 120 + hash2(i, 144) * 260;
    g.fillStyle = rgba(stripes[i % 3], 0.55);
    g.fill(poly([[x, y], [x + w, y - 6], [x + w + 30, y + 16], [x + 20, y + 22]], { seed: 145 + i, amp: 1.2, round: 0.5 }));
  }
  g.restore();
}

// ════════════════════════════════ 中景：城丘 + 山路 ════════════════════════════════
function drawMidLayer(g, st) {
  withDepth(g, st, CASTLE.depth.mid);
  const k = st.P ? st.P.hill : 1;
  if (!popRun(g, k, CASTLE.pageBottom)) return;
  const { L, T } = st;
  const { cx, cy, rx, ry } = CASTLE.hill;
  const hillP = MEMO('hill', () => blob(cx, cy, rx, ry, { seed: 4, amp: 0.006, n: 120 }));
  const gcol = L.C(L.grass);
  // 后面一道暗肩（层次）
  g.save(); g.translate(14, 10); g.fillStyle = L.C(M(L.grass, PAL.grassDark, 0.45)); g.fill(hillP); g.restore();
  cut(g, hillP, gcol, { rim: L.C(PAL.leafLight), rimW: 3 });
  shade(g, hillP, L.shadeCol, cx + rx, 0, cx + 120, 0, L.shadeA * 1.1, 0);
  shade(g, hillP, L.shadeCol, 0, cy + ry * 0.4, 0, cy - ry * 0.75, L.shadeA * 0.9, 0);
  // 草丛 / 等高线
  if (st.detail > 0) {
    g.save();
    g.clip(hillP);
    g.strokeStyle = rgba(L.C(PAL.leafLight), 0.5);
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const yy = 700 + i * 46;
      const x0 = cx - Math.sqrt(Math.max(0, 1 - ((yy - cy) / ry) ** 2)) * rx * 0.92;
      g.beginPath(); g.moveTo(x0 + 30, yy + 18); g.quadraticCurveTo(x0 + 160, yy - 8, x0 + 340 - i * 18, yy + 4); g.stroke();
    }
    const tuft = L.C(M(L.grass, PAL.grassDark, 0.4));
    g.fillStyle = tuft;
    for (let i = 0; i < 70; i++) {
      const x = -300 + hash2(i, 151) * 2520;
      const top = hillTopY(x);
      const y = top + 26 + hash2(i, 152) * 300;
      if (y > 1300) continue;
      const s = 5 + hash2(i, 153) * 6;
      g.beginPath();
      g.moveTo(x - s, y); g.quadraticCurveTo(x - s * 0.6, y - s * 1.2, x - s * 0.9, y - s * 1.8);
      g.quadraticCurveTo(x - s * 0.2, y - s * 1.0, x, y - s * 2.2);
      g.quadraticCurveTo(x + s * 0.2, y - s * 1.0, x + s * 0.9, y - s * 1.7);
      g.quadraticCurveTo(x + s * 0.6, y - s * 1.1, x + s, y);
      g.closePath(); g.fill();
    }
    if (L.blossom > 0 || L.name === 'dawn') {
      const fl = [PAL.princessLight, PAL.white, PAL.goldLight, PAL.princess];
      for (let i = 0; i < 46; i++) {
        const x = -200 + hash2(i, 154) * 2320;
        const y = hillTopY(x) + 30 + hash2(i, 155) * 280;
        g.globalAlpha = 0.85 * (L.blossom > 0 ? 1 : 0.55);
        g.fillStyle = L.C(fl[i % 4]);
        g.beginPath(); g.arc(x, y, 3.2 + hash2(i, 156) * 2.2, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }
  // 树
  const TREES = [[30, 1.05], [148, 0.9], [236, 0.78], [1700, 0.8], [1806, 0.95], [1912, 1.08]];
  for (let i = 0; i < TREES.length; i++) {
    const [x, s] = TREES[i];
    drawTree(g, st, x, hillTopY(x) + 34 * s, s, i, L.blossom > 0.5);
  }
  // 山路（mid 层段：城门 → 地面带上沿）
  drawRoad(g, st, false);
  if (L.blossom > 0 && st.detail > 0) petals(g, st, -100, 560, 420, 300, 18, 157);
  if (L.blossom > 0 && st.detail > 0) petals(g, st, 1560, 560, 460, 300, 18, 158);
  void T;
}

function drawTree(g, st, x, y, s, i, blossom) {
  const { L, T } = st;
  const sway = Math.sin(T * 0.9 + i * 1.3) * 0.015;
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.scale(s, s);
  const trunk = poly([[-7, 0], [-5, -46], [-12, -60], [-3, -56], [0, -70], [4, -56], [12, -64], [6, -46], [8, 0]], { seed: 160 + i, amp: 0.8, round: 0.3 });
  dcut(g, trunk, L.C(PAL.wood), { sh: 0.18 });
  shade(g, trunk, PAL.shadow, 8, 0, -4, 0, 0.35, 0);
  const crown = blossom ? [PAL.princess, PAL.princessLight, PAL.white] : [PAL.forest, PAL.grass, PAL.leafLight];
  const parts = [[-22, -78, 30, 26], [20, -84, 32, 28], [0, -104, 36, 30], [-4, -76, 26, 20]];
  for (let j = 0; j < parts.length; j++) {
    const [cx_, cy_, rx_, ry_] = parts[j];
    const p = blob(cx_, cy_, rx_, ry_, { seed: 170 + i * 5 + j, amp: 0.06, freq: 5 });
    dcut(g, p, L.C(crown[j === 2 ? 1 : j === 3 ? 2 : 0]), { sh: 0.16, rim: L.C(crown[2]), rimW: 2.4 });
    shade(g, p, L.shadeCol, cx_ + rx_, 0, cx_ - rx_ * 0.2, 0, L.shadeA * 0.9, 0);
  }
  if (blossom) {
    g.fillStyle = L.C(PAL.white);
    for (let j = 0; j < 9; j++) { g.beginPath(); g.arc(-34 + hash2(i, j + 180) * 68, -120 + hash2(i, j + 190) * 60, 2.4, 0, TAU); g.fill(); }
  }
  g.restore();
}

function petals(g, st, x, y, w, h, n, seed) {
  const { T, L } = st;
  g.save();
  g.fillStyle = L.C(PAL.princessLight);
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + hash2(seed, i) * 0.8;
    const px = x + ((hash2(seed + 1, i) * w + T * 18 * sp) % w);
    const py = y + ((hash2(seed + 2, i) * h + T * 30 * sp) % h);
    const r = T * 2 * sp + i;
    g.save(); g.translate(px + Math.sin(T * 1.3 * sp + i) * 10, py); g.rotate(r); g.scale(1, 0.55 + 0.45 * Math.sin(r * 1.7));
    g.globalAlpha = 0.85; g.beginPath(); g.ellipse(0, 0, 4.2, 2.6, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.restore();
}

function drawRoad(g, st, near) {
  const { L } = st;
  const r = ROAD();
  const pts = r.p;
  const wfn = (u) => 17 + u * 30;
  const edge = ribbon(pts, (u) => wfn(u) + 6);
  const body = ribbon(pts, wfn);
  g.save();
  if (near) { g.beginPath(); g.rect(-2000, 952, 6000, 2000); g.clip(); }
  g.fillStyle = L.C(PAL.earth);
  g.fill(edge);
  cut(g, body, L.C(PAL.path), { rim: L.C(PAL.white), rimW: 2 });
  shade(g, body, L.shadeCol, 2050, 1160, 960, 880, L.shadeA * 0.6, 0);
  if (st.detail > 0) {
    // 车辙与小石子
    g.strokeStyle = rgba(L.C(PAL.sand), 0.9);
    g.lineWidth = 2.4;
    g.setLineDash([16, 14]);
    g.stroke(smoothPath(pts.map(([x, y], i) => [x, y + 2 - i * 0.01]), { closed: false }));
    g.setLineDash([]);
    g.fillStyle = L.C(PAL.stone2);
    for (let i = 0; i < 26; i++) {
      const [x, y, a] = atLen(pts, r.L, hash2(i, 201) * r.L[r.L.length - 1]);
      const off = (hash2(i, 202) - 0.5) * 30;
      g.beginPath(); g.ellipse(x - Math.sin(a) * off, y + Math.cos(a) * off, 3 + hash2(i, 203) * 3, 2, 0, 0, TAU); g.fill();
    }
  }
  g.restore();
}

// ════════════════════════════════ 主体：城墙、13 塔、主堡、圆窗、阳台、城门 ════════════════════════════════
function drawMainLayer(g, st) {
  withDepth(g, st, CASTLE.depth.main);
  const { o, P } = st;
  const base = g.getTransform();
  const reset = () => g.setTransform(base);
  // 婚礼横幅绕塔：后半圈
  if (o.ribbonWrap && o.ribbonWrap.part !== 'front') wrapRibbon(g, st, o.ribbonWrap, 'back');
  // 主堡（塔身、尖顶、圆窗、阳台门）
  const kk = P ? P.keep : 1;
  g.save();
  if (popRun(g, kk, 700)) drawKeepBody(g, st);
  g.restore();
  // 婚礼横幅：前半圈压在尖顶上
  if (o.ribbonWrap && o.ribbonWrap.part !== 'back') wrapRibbon(g, st, o.ribbonWrap, 'front');
  // 12 座塔（5、7 号压在主堡两侧之上）
  for (const tw of TOWERS) {
    if (tw.keep) continue;
    const k = P ? P.towers[tw.i] : 1;
    g.save();
    if (popRun(g, k, 700)) drawTower(g, st, tw);
    g.restore();
  }
  // 主堡阳台（在 5/7 号塔前面）+ 阳台上的角色
  g.save();
  if (popRun(g, kk, 700)) drawBalcony(g, st);
  g.restore();
  reset();
  // 城墙上的角色（在垛口后）
  if (o.onWall) { g.save(); o.onWall(g, { depth: lerp(1, 1, st.flat) }); g.restore(); }
  // 城墙 + 城门
  const kw = P ? P.wall : 1;
  foldTab(g, kw, CASTLE.wall.x0, CASTLE.wall.x1, CASTLE.wall.y1, st);
  g.save();
  if (popRun(g, kw, CASTLE.wall.y1)) drawWall(g, st);
  g.restore();
  // 婚礼装饰
  if (o.deco) drawDeco(g, st, clamp(o.deco));
}

// —— 塔 ——
function coneShape(x, top, tip, half, seed) {
  return MEMO(`cone|${x}|${top}|${tip}|${half}`, () => {
    const pts = [];
    const n = 6;
    for (let j = 0; j <= n; j++) { const u = j / n; pts.push([x - half * Math.pow(u, 0.86), lerp(tip, top, u)]); }
    // 下沿扇贝
    const sc = 7;
    for (let j = 0; j <= sc; j++) { const u = j / sc; pts.push([x - half + 2 * half * u, top + (j % 2 ? 5 : 1)]); }
    for (let j = n; j >= 0; j--) { const u = j / n; pts.push([x + half * Math.pow(u, 0.86), lerp(tip, top, u)]); }
    return poly(pts, { seed, amp: 0.7, step: 18, round: 0.35 });
  });
}

function drawTower(g, st, tw) {
  const { L, T, detail, o } = st;
  const { x, top, coneTip, i } = tw;
  const hw = 35;
  const stone = L.C(i % 3 === 1 ? M(PAL.stone, PAL.paper2, 0.35) : PAL.stone);
  const body = MEMO(`tbody|${i}`, () => poly([[x - hw, top + 2], [x + hw, top + 2], [x + hw, 712], [x - hw, 712]], { seed: 300 + i, amp: 1.1, step: 22 }));
  dcut(g, body, stone, { sh: 0.22, dx: 3, rim: L.rim, rimW: 2.2 });
  shade(g, body, L.shadeCol, x + hw, 0, x - 6, 0, L.shadeA * 1.25, 0);
  shade(g, body, PAL.white, x - hw, 0, x - hw + 16, 0, 0.18, 0);
  // 石缝
  if (detail > 0) {
    g.save();
    g.clip(body);
    g.strokeStyle = rgba(L.C(PAL.stone2), 0.7);
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let r = 0, yy = top + 30; yy < 700; yy += 22, r++) {
      const off = (r % 2) * 14;
      for (let xx = x - hw + 6 + off; xx < x + hw - 6; xx += 28) {
        const len = 10 + hash2(i * 31 + r, xx) * 8;
        g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + len / 2, yy + 1.5, xx + len, yy); g.stroke();
      }
    }
    g.restore();
  }
  // 顶部挑檐带
  const band = poly([[x - hw - 4, top + 1], [x + hw + 4, top + 1], [x + hw + 2, top + 13], [x - hw - 2, top + 13]], { seed: 320 + i, amp: 0.6 });
  cut(g, band, L.C(PAL.stone2), { rim: L.rim, rimW: 1.6 });
  if (detail > 0) {
    g.fillStyle = L.C(PAL.stoneDark);
    for (let k = 0; k < 5; k++) { const cx_ = x - hw + 7 + k * 14; g.beginPath(); g.arc(cx_, top + 13, 4.2, 0, Math.PI); g.fill(); }
  }
  // 窗（夜里亮）
  const win = o.windows ?? L.win;
  const wy = top + Math.min(64, tw.h * 0.32);
  drawArchWindow(g, st, x, wy, 14, 24, win, 330 + i);
  if (tw.h >= 210) drawSlit(g, st, x, top + tw.h * 0.66, win * 0.6, 340 + i);
  // 锥顶
  const cone = coneShape(x, top + 4, coneTip, hw + 8, 350 + i);
  g.fillStyle = rgba(PAL.shadow, 0.28);
  g.fillRect(x - hw, top + 13, hw * 2, 7);
  const rc = PAL[tw.roof];
  dcut(g, cone, L.C(rc), { sh: 0.2, dx: 2.5, rim: L.C(M(rc, PAL.white, 0.45)), rimW: 2.4 });
  shade(g, cone, L.shadeCol, x + hw, 0, x - 4, 0, L.shadeA * 1.5, 0);
  if (detail > 0) {
    g.save();
    g.clip(cone);
    g.strokeStyle = rgba(L.C(M(rc, PAL.ink, 0.35)), 0.55);
    g.lineWidth = 1.5;
    for (let r = 1; r <= 3; r++) {
      const yy = lerp(coneTip, top + 4, r / 4);
      const half = (hw + 8) * Math.pow(r / 4, 0.86);
      const nS = 2 + r;
      for (let s = 0; s < nS; s++) {
        const x0 = x - half + (2 * half * s) / nS, x1 = x - half + (2 * half * (s + 1)) / nS;
        g.beginPath(); g.moveTo(x0, yy); g.quadraticCurveTo((x0 + x1) / 2, yy + 6, x1, yy); g.stroke();
      }
    }
    g.restore();
  }
  // 塔尖金球 + 旗杆 + 旗
  drawPoleFlag(g, st, tw);
}

function drawArchWindow(g, st, x, y, w, h, lit, seed) {
  const { L } = st;
  const p = MEMO(`aw|${x}|${y}|${w}|${h}`, () => {
    const q = new Path2D();
    q.moveTo(x - w / 2, y + h / 2);
    q.lineTo(x - w / 2, y - h / 2 + w / 2);
    q.arc(x, y - h / 2 + w / 2, w / 2, Math.PI, 0);
    q.lineTo(x + w / 2, y + h / 2);
    q.closePath();
    return q;
  });
  g.save();
  g.translate(1.5, 1.5);
  g.fillStyle = rgba(L.C(PAL.stone), 0.9);
  g.fill(p);
  g.restore();
  const dark = L.C(M(PAL.ink, PAL.roof, 0.3));
  g.fillStyle = lit > 0 ? M(dark, PAL.goldLight, clamp(lit)) : dark;
  g.fill(p);
  if (lit > 0.05) glow(g, x, y, w * 2.2, PAL.goldLight, 0.55 * lit);
  // 窗台
  g.fillStyle = L.C(PAL.stone2);
  g.fillRect(x - w / 2 - 3, y + h / 2, w + 6, 3.5);
  void seed;
}
function drawSlit(g, st, x, y, lit, seed) {
  const { L } = st;
  const p = rr(x - 3, y - 11, 6, 22, 3);
  const dark = L.C(M(PAL.ink, PAL.roof, 0.3));
  g.fillStyle = lit > 0 ? M(dark, PAL.goldLight, clamp(lit)) : dark;
  g.fill(p);
  void seed;
}

// 旗杆与旗：默认空白小三角旗；o.flags 给出时按时刻升写字方旗
function drawPoleFlag(g, st, tw) {
  const { L, T, o } = st;
  const { x, coneTip, poleTop, i, side } = tw;
  const beacon = beaconOf(st, i);
  g.save();
  g.strokeStyle = L.C(PAL.woodDark);
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, coneTip + 2); g.lineTo(x, poleTop); g.stroke();
  cut(g, blob(x, poleTop - 2, 4, 4, { seed: 360 + i, amp: 0.02 }), L.C(PAL.gold), { rim: PAL.white, rimW: 1.2 });
  cut(g, blob(x, coneTip, 4.5, 4.5, { seed: 370 + i, amp: 0.02 }), L.C(PAL.gold), { rim: PAL.white, rimW: 1.2 });
  g.restore();
  if (beacon && st.T >= beacon.at) { drawBrazier(g, st, x, poleTop); return; }
  const F = o.flags;
  const at = F && F.at ? F.at[i] : undefined;
  if (F && (F.chars || F.text) && at !== undefined && T >= at - 0.02) {
    drawCharFlag(g, st, tw, F, at);
    return;
  }
  // 空白小三角旗
  const col = i % 2 ? PAL.red : PAL.gold;
  const len = 30, hgt = 17;
  const pts = [];
  for (let j = 0; j <= 6; j++) {
    const u = j / 6;
    const wv = Math.sin(u * 4.2 - T * 6.5 + i * 0.9) * 3.2 * u;
    pts.push([x + side * len * u, poleTop + 1 + wv + (hgt / 2) * u * 0.25]);
  }
  const bot = [];
  for (let j = 6; j >= 0; j--) {
    const u = j / 6;
    const wv = Math.sin(u * 4.2 - T * 6.5 + i * 0.9) * 3.2 * u;
    bot.push([x + side * len * u, poleTop + hgt - (hgt / 2) * u * 0.95 + wv]);
  }
  const flag = poly([...pts, ...bot], { seed: 380 + i, amp: 0.3, step: 40, round: 0.3 });
  cut(g, flag, L.C(col), { rim: L.C(M(col, PAL.white, 0.5)), rimW: 1.4 });
  shade(g, flag, PAL.shadow, x, 0, x + side * len, 0, 0, 0.25);
}

function drawCharFlag(g, st, tw, F, at) {
  const { L, T } = st;
  const { x, coneTip, poleTop, i, side } = tw;
  const chars = [...(F.chars || F.text)];
  const ch = chars[i] ?? '';
  const big = i === 12 ? F.lastScale ?? CASTLE.flag.lastScale : 1;
  const W = CASTLE.flag.w * big, H = CASTLE.flag.h * big;
  const t = T - at;
  // 沿旗杆弹上去
  const rise = clamp(spring(t, { freq: 2.6, damping: 0.42 }), 0, 1.15);
  const yTop = lerp(coneTip - 6, poleTop, rise);
  // 抖开
  const u = clamp(outCubic(seg(t, 0.08, 0.42)));
  const wv = (s) => Math.sin(s * 5.2 - T * 6.2 + i * 1.1) * (2.6 + 7 * (1 - u)) * big * Math.pow(s, 0.8);
  const n = 10;
  const top = [], bot = [];
  for (let j = 0; j <= n; j++) {
    const s = j / n;
    const xx = x + side * W * s * lerp(0.12, 1, u);
    top.push([xx, yTop + wv(s)]);
    bot.push([xx, yTop + H * lerp(0.45, 1, u) + wv(s) * 1.1]);
  }
  const shape = [...top, ...bot.reverse()];
  const outer = poly(shape, { seed: 400 + i, amp: 0.4, step: 60, round: 0.2 });
  dcut(g, outer, L.C(PAL.scarf), { sh: 0.25, dx: 2, dy: 2.5, rim: L.C(M(PAL.scarf, PAL.white, 0.5)), rimW: 1.6 });
  // 奶油底（内缩）
  const ins = 5 * big;
  const top2 = [], bot2 = [];
  for (let j = 0; j <= n; j++) {
    const s = j / n;
    const xx = x + side * (ins + (W - ins * 2) * s) * lerp(0.12, 1, u);
    top2.push([xx, yTop + ins + wv(s)]);
    bot2.push([xx, yTop + H * lerp(0.45, 1, u) - ins + wv(s) * 1.1]);
  }
  const inner = poly([...top2, ...bot2.reverse()], { seed: 410 + i, amp: 0.3, step: 60, round: 0.2 });
  cut(g, inner, L.C(PAL.paper));
  // 波浪明暗条
  g.save();
  g.clip(outer);
  for (let j = 0; j < 3; j++) {
    const s = (j + 0.5) / 3;
    const ph = Math.sin(s * 5.2 - T * 6.2 + i * 1.1 + Math.PI / 2);
    const xx = x + side * W * s * lerp(0.12, 1, u);
    g.fillStyle = rgba(PAL.shadow, 0.1 + 0.08 * ph);
    g.fillRect(xx - W * 0.09, yTop - 10, W * 0.18, H + 30);
  }
  g.restore();
  // 字
  if (ch && u > 0.35) {
    const cxF = x + side * W * 0.5 * lerp(0.12, 1, u);
    const slope = (wv(0.56) - wv(0.44)) / (W * 0.12);
    paperGlyph(g, ch, cxF, yTop + H / 2 + wv(0.5), CASTLE.flag.size * big, {
      family: 'display', fill: L.C(PAL.ink), edge: null, rot: clamp(slope * 0.6, -0.12, 0.12) * side,
      scale: 0.6 + 0.4 * outBack(seg(u, 0.35, 1), 2), alpha: seg(u, 0.35, 0.7),
    });
  }
  // 旗顶小纸烟花
  if (F.pops !== false) {
    const bx = x + side * W * 0.55, by = poleTop - 4;
    const cols = [PAL.heart, PAL.gold, PAL.crystal, PAL.princess, PAL.meadow];
    burst(g, T, { at: at + 0.22, seed: 430 + i, count: 12, x: bx, y: by, speed: [90, 210], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 420, drag: 2, life: [0.45, 0.8], size: [4, 7] }, (g2, px, py, s) => {
      g2.save(); g2.translate(px, py); g2.rotate(s.rot); g2.globalAlpha *= 1 - s.p * s.p;
      g2.fillStyle = cols[s.i % cols.length]; g2.fillRect(-s.size / 2, -s.size * 0.3, s.size, s.size * 0.6);
      g2.restore();
    });
    const fl = hit(T, at + 0.22, 0.12);
    if (fl > 0.02) sparkle(g, bx, by, 16 * fl * big, { color: PAL.white, alpha: fl });
  }
  if (i === 12 && F.finaleAt !== undefined) {
    const bx = x + side * W * 0.5, by = poleTop - 10;
    const fl = hit(T, F.finaleAt, 0.35);
    if (fl > 0.01) {
      rays(g, bx, by, 160 * (1.2 - fl * 0.2), { n: 14, color: PAL.goldLight, alpha: 0.5 * fl, rot: T * 0.4, seed: 441 });
      glow(g, bx, by, 120, PAL.goldLight, 0.7 * fl);
    }
    burst(g, T, { at: F.finaleAt, seed: 442, count: 34, x: bx, y: by, speed: [160, 420], angle: [0, TAU], gravity: 220, drag: 1.6, life: [0.7, 1.3], size: [6, 12] }, (g2, px, py, s) => {
      sparkle(g2, px, py, s.size * (1 - s.p * 0.6), { color: s.i % 3 ? PAL.gold : PAL.goldLight, alpha: 1 - s.p, rot: s.rot });
    });
  }
}

// —— 烽火 / 灯笼 ——
function beaconOf(st, i) {
  const b = st.o.beacons;
  if (!b) return null;
  for (const q of b) if (q.tower === i) return q;
  return null;
}
function drawBrazier(g, st, x, y) {
  const { L } = st;
  const bowl = poly([[x - 11, y - 2], [x + 11, y - 2], [x + 7, y + 8], [x - 7, y + 8]], { seed: 450 + x, amp: 0.5, round: 0.3 });
  cut(g, bowl, L.C(PAL.inkSoft), { rim: L.C(PAL.stone2), rimW: 1.4 });
  g.strokeStyle = L.C(PAL.inkSoft); g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 7, y + 8); g.lineTo(x - 4, y + 16); g.moveTo(x + 7, y + 8); g.lineTo(x + 4, y + 16); g.stroke();
  if (!st.o.redSeparate) beaconFlame(g, st, x, y);
}
function beaconFlame(g, st, x, y) {
  const { T } = st;
  let at = -Infinity;
  for (const q of st.o.beacons || []) if (Math.abs(CASTLE.towers[q.tower].x - x) < 1) at = q.at;
  const t = T - at;
  if (t < 0) return;
  const s = outBack(clamp(t / 0.25), 2.2);
  glow(g, x, y - 16, 70 * s, PAL.red, 0.6 + 0.2 * Math.sin(T * 13));
  glow(g, x, y - 12, 34 * s, PAL.fire2, 0.5);
  flame(g, x, y - 1, 15 * s, 40 * s, T, x * 0.01, [PAL.redDark, PAL.red, PAL.fire2]);
}
/** 火焰：几条噪声驱动的火舌 ribbon 叠成（外 → 内）。 */
function flame(g, x, y, w, h, T, seed, cols) {
  if (h <= 0.5) return;
  const tongues = [[-0.5, 0.62], [0.42, 0.7], [0, 1], [-0.18, 0.78], [0.22, 0.84]];
  for (let layer = 0; layer < 3; layer++) {
    const sc = 1 - layer * 0.3;
    g.fillStyle = cols[layer];
    for (let j = 0; j < tongues.length; j++) {
      const [dx, hh] = tongues[j];
      const n = 6;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const sway = noise1(T * 6 - u * 2.5 + j * 3.1, seed + j) * w * 0.55 * u;
        pts.push([x + dx * w * sc + sway, y - u * h * hh * sc * (0.85 + 0.25 * noise1(T * 4 + j, seed + 9))]);
      }
      g.fill(ribbon(pts, (u) => w * 0.42 * sc * (1 - u) ** 0.8 + 0.6));
    }
  }
}

// —— 主堡 ——
function drawKeepBody(g, st) {
  const { L, T, detail, o } = st;
  const K = CASTLE.keep;
  const win = o.windows ?? L.win;
  // 塔身
  const body = MEMO('kbody', () => poly([[K.x0, K.y0], [K.x1, K.y0], [K.x1, 712], [K.x0, 712]], { seed: 500, amp: 1.2, step: 24 }));
  dcut(g, body, L.C(PAL.stone), { sh: 0.22, dx: 3, rim: L.rim, rimW: 2.4 });
  shade(g, body, L.shadeCol, K.x1, 0, K.cx - 10, 0, L.shadeA * 1.15, 0);
  shade(g, body, PAL.white, K.x0, 0, K.x0 + 40, 0, 0.16, 0);
  if (detail > 0) {
    g.save();
    g.clip(body);
    // 砖缝
    g.strokeStyle = rgba(L.C(PAL.stone2), 0.62);
    g.lineWidth = 1.6;
    for (let r = 0, yy = 344; yy < 700; yy += 26, r++) {
      g.beginPath(); g.moveTo(K.x0 + 4, yy); g.lineTo(K.x1 - 4, yy); g.stroke();
      for (let xx = K.x0 + 22 + (r % 2) * 26; xx < K.x1 - 10; xx += 52) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 26); g.stroke(); }
    }
    // 隅石
    for (let r = 0, yy = 330; yy < 700; yy += 26, r++) {
      const wq = r % 2 ? 16 : 24;
      g.fillStyle = rgba(L.C(M(PAL.stone, PAL.white, 0.35)), 0.9);
      g.fillRect(K.x0 + 1, yy + 1, wq, 23);
      g.fillStyle = rgba(L.C(PAL.stone2), 0.85);
      g.fillRect(K.x1 - wq - 1, yy + 1, wq, 23);
    }
    g.restore();
  }
  // 檐口带 + 小托
  const cornice = poly([[K.x0 - 8, 296], [K.x1 + 8, 296], [K.x1 + 6, 318], [K.x0 - 6, 318]], { seed: 501, amp: 0.8 });
  dcut(g, cornice, L.C(PAL.stone2), { sh: 0.25, rim: L.rim, rimW: 2 });
  if (detail > 0) {
    g.fillStyle = L.C(PAL.stoneDark);
    for (let xx = K.x0 + 4; xx <= K.x1 - 4; xx += 19) { g.beginPath(); g.moveTo(xx - 6, 318); g.quadraticCurveTo(xx, 334, xx + 6, 318); g.fill(); }
  }
  // 两侧小窗
  drawArchWindow(g, st, 866, 362, 11, 30, win, 502);
  drawArchWindow(g, st, 1054, 362, 11, 30, win, 503);
  // 尖顶
  const S = K;
  const spire = MEMO('spire', () => {
    const pts = [];
    const n = 9;
    for (let j = 0; j <= n; j++) { const u = j / n; pts.push([S.cx - S.spireHalf * Math.pow(u, 0.9), lerp(S.spireY, S.spireBase, u)]); }
    for (let j = 0; j <= 9; j++) { const u = j / 9; pts.push([S.cx - S.spireHalf + 2 * S.spireHalf * u, S.spireBase + (j % 2 ? 6 : 1)]); }
    for (let j = n; j >= 0; j--) { const u = j / n; pts.push([S.cx + S.spireHalf * Math.pow(u, 0.9), lerp(S.spireY, S.spireBase, u)]); }
    return poly(pts, { seed: 504, amp: 0.8, step: 20, round: 0.35 });
  });
  dcut(g, spire, L.C(PAL.roofRed), { sh: 0.22, dx: 3, rim: L.C(M(PAL.roofRed, PAL.white, 0.45)), rimW: 2.8 });
  shade(g, spire, L.shadeCol, S.cx + S.spireHalf, 0, S.cx - 6, 0, L.shadeA * 1.5, 0);
  if (detail > 0) {
    g.save();
    g.clip(spire);
    g.strokeStyle = rgba(L.C(M(PAL.roofRed, PAL.ink, 0.35)), 0.5);
    g.lineWidth = 1.7;
    for (let r = 1; r <= 6; r++) {
      const yy = lerp(S.spireY, S.spireBase, r / 7);
      const half = S.spireHalf * Math.pow(r / 7, 0.9);
      const nS = 2 + r;
      for (let s = 0; s < nS; s++) {
        const x0 = S.cx - half + (2 * half * s) / nS, x1 = S.cx - half + (2 * half * (s + 1)) / nS;
        g.beginPath(); g.moveTo(x0, yy); g.quadraticCurveTo((x0 + x1) / 2, yy + 7, x1, yy); g.stroke();
      }
    }
    g.restore();
  }
  // 老虎窗
  const dm = poly([[944, 262], [976, 262], [976, 236], [960, 220], [944, 236]], { seed: 505, amp: 0.5, round: 0.2 });
  dcut(g, dm, L.C(PAL.stone), { sh: 0.25, rim: L.rim, rimW: 1.6 });
  const dmr = poly([[938, 238], [960, 214], [982, 238], [976, 240], [960, 224], [944, 240]], { seed: 506, amp: 0.4 });
  cut(g, dmr, L.C(PAL.roof));
  const dwin = blob(960, 246, 7.5, 7.5, { seed: 507, amp: 0.02 });
  const dk = L.C(M(PAL.ink, PAL.roof, 0.3));
  g.fillStyle = win > 0 ? M(dk, PAL.goldLight, clamp(win)) : dk;
  g.fill(dwin);
  if (win > 0.05) glow(g, 960, 246, 18, PAL.goldLight, 0.6 * win);
  // 两角小望楼
  for (const bx of [K.x0 - 2, K.x1 + 2]) drawBartizan(g, st, bx);
  // 尖顶金球 + 旗
  drawPoleFlag(g, st, TOWERS[6]);
  // 圆窗（外侧受光；夜里透出灯光）
  const rwGlow = o.windowGlow ?? win * 0.55;
  drawRoundWindow(g, { x: CASTLE.window.x, y: CASTLE.window.y, r: CASTLE.window.r, face: 'out', t: T, glow: rwGlow });
  if (L.dark > 0.05 || L.tintAmt > 0.25) {
    // 夜 / 危急 / 阴天：给窗玻璃压一层时段色，保持统一
    const wp = blob(CASTLE.window.x, CASTLE.window.y, CASTLE.window.r * 1.18, CASTLE.window.r * 1.18, { seed: 5, amp: 0.012 });
    g.save();
    g.globalAlpha *= clamp(L.tintAmt * 0.9 + L.dark) * (1 - 0.6 * clamp(rwGlow));
    g.fillStyle = M(L.tint, PAL.ink, 0.25);
    g.fill(wp);
    g.restore();
  }
  // 阳台门
  drawBalconyDoor(g, st, win);
}

function drawBartizan(g, st, bx) {
  const { L } = st;
  const w = 17;
  const b = poly([[bx - w, 302], [bx + w, 302], [bx + w, 350], [bx, 374], [bx - w, 350]], { seed: 510 + bx, amp: 0.6, round: 0.2 });
  dcut(g, b, L.C(PAL.stone), { sh: 0.22, rim: L.rim, rimW: 1.8 });
  shade(g, b, L.shadeCol, bx + w, 0, bx - 4, 0, L.shadeA * 1.3, 0);
  g.fillStyle = L.C(M(PAL.ink, PAL.roof, 0.3));
  g.fillRect(bx - 2.5, 316, 5, 16);
  const cn = coneShape(bx, 304, 246, w + 6, 512 + bx);
  dcut(g, cn, L.C(PAL.roof), { sh: 0.2, rim: L.C(M(PAL.roof, PAL.white, 0.45)), rimW: 1.8 });
  shade(g, cn, L.shadeCol, bx + w, 0, bx - 3, 0, L.shadeA * 1.4, 0);
  cut(g, blob(bx, 246, 3.5, 3.5, { seed: 514, amp: 0.02 }), L.C(PAL.gold));
}

function drawBalconyDoor(g, st, win) {
  const { L } = st;
  const D = CASTLE.balcony.door;
  const cx = (D.x0 + D.x1) / 2, r = (D.x1 - D.x0) / 2;
  const arch = (pad) => {
    const q = new Path2D();
    q.moveTo(D.x0 - pad, D.y1);
    q.lineTo(D.x0 - pad, D.y0 + r);
    q.arc(cx, D.y0 + r, r + pad, Math.PI, 0);
    q.lineTo(D.x1 + pad, D.y1);
    q.closePath();
    return q;
  };
  const frame = arch(7);
  dcut(g, frame, L.C(PAL.stone2), { sh: 0.25, rim: L.rim, rimW: 2 });
  const inner = arch(0);
  const dk = L.C(M(PAL.ink, PAL.woodDark, 0.4));
  g.fillStyle = lin(g, 0, D.y0, 0, D.y1, [dk, M(dk, PAL.goldLight, 0.18 + 0.4 * clamp(win))]);
  g.fill(inner);
  glow(g, cx, D.y1 - 10, 46, PAL.goldLight, 0.22 + 0.4 * win);
  // 打开的门扇
  const leafL = poly([[D.x0, D.y1], [D.x0, D.y0 + r * 0.9], [D.x0 + 12, D.y0 + r * 0.55 + 6], [D.x0 + 12, D.y1 - 4]], { seed: 520, amp: 0.4 });
  const leafR = poly([[D.x1, D.y1], [D.x1, D.y0 + r * 0.9], [D.x1 - 12, D.y0 + r * 0.55 + 6], [D.x1 - 12, D.y1 - 4]], { seed: 521, amp: 0.4 });
  cut(g, leafL, L.C(PAL.wood), { rim: L.C(PAL.earth), rimW: 1.4 });
  cut(g, leafR, L.C(PAL.woodDark));
  // 拱石
  if (st.detail > 0) {
    g.save();
    g.strokeStyle = rgba(L.C(PAL.stoneDark), 0.6);
    g.lineWidth = 1.6;
    for (let k = 1; k < 7; k++) {
      const a = Math.PI + (k / 7) * Math.PI;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r, D.y0 + r + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * (r + 7), D.y0 + r + Math.sin(a) * (r + 7)); g.stroke();
    }
    g.restore();
  }
}

// —— 阳台（压在 5/7 号塔之前；onBalcony 回调在门与栏杆之间画角色） ——
function drawBalcony(g, st) {
  const { L, T, o, P, detail } = st;
  const B = CASTLE.balcony;
  // 地板与托座
  const slab = poly([[B.x0 - 7, B.floorY - 1], [B.x1 + 7, B.floorY - 1], [B.x1 + 5, B.floorY + 14], [B.x0 - 5, B.floorY + 14]], { seed: 530, amp: 0.7 });
  dcut(g, slab, L.C(PAL.stone), { sh: 0.3, dy: 3.5, rim: L.rim, rimW: 2.2 });
  shade(g, slab, L.shadeCol, B.x1, 0, B.x0 + 60, 0, L.shadeA, 0);
  g.fillStyle = rgba(L.C(PAL.stone2), 0.9);
  g.fillRect(B.x0 - 5, B.floorY + 9, B.x1 - B.x0 + 10, 3);
  for (const cx of [868, 914, 960, 1006, 1052]) {
    const y0 = B.floorY + 13;
    const steps = [[9, 0, 7], [7, 7, 6], [5, 13, 6]];
    for (let q = 0; q < steps.length; q++) {
      const [hw, dy, hh] = steps[q];
      const blk = MEMO(`corb|${cx}|${q}`, () => poly([[cx - hw, y0 + dy], [cx + hw, y0 + dy], [cx + hw, y0 + dy + hh], [cx - hw, y0 + dy + hh]], { seed: 531 + cx + q, amp: 0.3, round: q === 2 ? 0.6 : 0.2 }));
      dcut(g, blk, L.C(q === 1 ? PAL.stone2 : PAL.stone), { sh: 0.22, dx: 1.6, dy: 2 });
      shade(g, blk, L.shadeCol, cx + hw, 0, cx - 2, 0, L.shadeA * 1.1, 0);
    }
  }
  // 阳台上的人（在门前、栏杆后）
  if (o.onBalcony) {
    const k = P ? P.princess : 1;
    if (k > 0.002) {
      g.save();
      if (k < 1) { g.translate(0, B.floorY); g.scale(1, Math.max(0.002, outBack(clamp(k), 2))); g.translate(0, -B.floorY); }
      o.onBalcony(g, { popup: k, floorY: B.floorY, railY: B.railY, depth: 1 });
      g.restore();
    }
  }
  // 栏杆
  const stoneC = L.C(PAL.stone), lite = L.C(M(PAL.stone, PAL.white, 0.25));
  if (detail > 0) {
    const y0 = B.railY + 4, y1 = B.floorY - 9;
    for (let xx = 867; xx <= 1054; xx += 23.4) {
      const bp = MEMO(`bal|${Math.round(xx)}`, () => {
        const h = y1 - y0, f = (u) => y0 + h * u;
        return smoothPath([[xx - 3.4, f(0)], [xx + 3.4, f(0)], [xx + 1.7, f(0.2)], [xx + 4.3, f(0.62)], [xx + 2, f(0.86)], [xx + 3.6, f(1)], [xx - 3.6, f(1)], [xx - 2, f(0.86)], [xx - 4.3, f(0.62)], [xx - 1.7, f(0.2)]], { closed: true, tension: 0.42 });
      });
      dcut(g, bp, lite, { sh: 0.3, dx: 1.6, dy: 1.8 });
      shade(g, bp, L.shadeCol, xx + 4.3, 0, xx - 1, 0, L.shadeA * 1.3, 0);
    }
  }
  const rail = poly([[B.x0 + 2, B.railY - 4], [B.x1 - 2, B.railY - 4], [B.x1 - 2, B.railY + 4], [B.x0 + 2, B.railY + 4]], { seed: 532, amp: 0.5 });
  dcut(g, rail, stoneC, { sh: 0.28, rim: L.rim, rimW: 2 });
  const rail2 = poly([[B.x0 + 2, B.floorY - 9], [B.x1 - 2, B.floorY - 9], [B.x1 - 2, B.floorY - 1], [B.x0 + 2, B.floorY - 1]], { seed: 533, amp: 0.5 });
  dcut(g, rail2, L.C(PAL.stone2), { sh: 0.2 });
  for (const px of [B.x0 + 2, B.x1 - 2]) {
    const post = poly([[px - 7, B.railY - 7], [px + 7, B.railY - 7], [px + 6, B.floorY], [px - 6, B.floorY]], { seed: 534 + px, amp: 0.4 });
    dcut(g, post, stoneC, { sh: 0.3, rim: L.rim, rimW: 2 });
    shade(g, post, L.shadeCol, px + 7, 0, px - 2, 0, L.shadeA * 1.2, 0);
    cut(g, poly([[px - 9, B.railY - 12], [px + 9, B.railY - 12], [px + 8, B.railY - 6], [px - 8, B.railY - 6]], { seed: 536 + px, amp: 0.3 }), lite, { rim: L.rim, rimW: 1.6 });
  }
  // 左段花箱
  drawFlowerBox(g, st);
  // 红灯笼
  drawLantern(g, st);
  // 婚礼：栏杆花环
  if (o.deco) balconyGarland(g, st, clamp(o.deco));
  void T;
}

function drawFlowerBox(g, st) {
  const { L, T } = st;
  const { x0, x1 } = CASTLE.balcony.boxes;
  const y = CASTLE.balcony.railY + 7;
  // 叶与花（先画，箱子压住根部）
  const leaves = [PAL.grassDark, PAL.grass, PAL.leafLight];
  for (let j = 0; j < 9; j++) {
    const lx = x0 + 4 + j * ((x1 - x0 - 8) / 8);
    const sw = Math.sin(T * 1.4 + j) * 1.5;
    cut(g, blob(lx + sw, y - 6 - (j % 3) * 2, 6.5, 8.5, { seed: 540 + j, amp: 0.08, rot: (j % 2 ? 0.4 : -0.4) }), L.C(leaves[j % 3]));
  }
  const fc = [PAL.princess, PAL.heart, PAL.goldLight, PAL.white, PAL.princess, PAL.heart];
  for (let j = 0; j < 6; j++) {
    const fx = x0 + 8 + j * ((x1 - x0 - 16) / 5) + Math.sin(T * 1.2 + j * 2) * 1.2;
    const fy = y - 14 - (j % 2) * 5;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU + j;
      g.fillStyle = L.C(fc[j]);
      g.beginPath(); g.ellipse(fx + Math.cos(a) * 3.6, fy + Math.sin(a) * 3.6, 3.4, 2.6, a, 0, TAU); g.fill();
    }
    g.fillStyle = L.C(PAL.gold);
    g.beginPath(); g.arc(fx, fy, 2, 0, TAU); g.fill();
  }
  const box = poly([[x0, y], [x1, y], [x1 - 3, y + 14], [x0 + 3, y + 14]], { seed: 549, amp: 0.4 });
  dcut(g, box, L.C(PAL.wood), { sh: 0.3, rim: L.C(PAL.earth), rimW: 1.6 });
  g.fillStyle = rgba(L.C(PAL.woodDark), 0.8);
  g.fillRect(x0 + 2, y + 5, x1 - x0 - 4, 2.4);
}

function drawLantern(g, st) {
  const { L, T, o } = st;
  const [lx, ly] = CASTLE.balcony.lantern;
  // 铁钩
  g.save();
  g.strokeStyle = L.C(PAL.inkSoft);
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(1070, 548); g.lineTo(1070, 528); g.quadraticCurveTo(1069, 523, lx, 525); g.lineTo(lx, 534); g.stroke();
  g.restore();
  const on = o.lantern ? (typeof o.lantern === 'number' ? o.lantern : 1) : 0;
  if (on > 0 && !o.redSeparate) lanternGlow(g, st, on);
  const body = blob(lx, ly, 9.5, 11.5, { seed: 550, amp: 0.02 });
  const pulse = on > 0 ? 0.5 + 0.5 * Math.sin(T * TAU * 2) : 0;
  cut(g, body, M(L.C(PAL.red), PAL.fire2, 0.35 * on * pulse), { rim: M(PAL.red, PAL.white, 0.5), rimW: 1.6 });
  g.save();
  g.clip(body);
  g.strokeStyle = rgba(PAL.redDark, 0.7);
  g.lineWidth = 1.3;
  for (const dx of [-5, 0, 5]) { g.beginPath(); g.ellipse(lx, ly, Math.abs(dx) + 0.5, 11.5, 0, 0, TAU); g.stroke(); }
  g.restore();
  shade(g, body, PAL.shadow, lx - 9, 0, lx + 9, 0, 0, 0.3);
  g.fillStyle = L.C(PAL.gold);
  g.fillRect(lx - 5.5, ly - 13.5, 11, 3.4);
  g.fillRect(lx - 5.5, ly + 10, 11, 3.4);
  g.strokeStyle = L.C(PAL.gold);
  g.lineWidth = 1.6;
  const sw = Math.sin(T * 2.2) * 1.5;
  g.beginPath(); g.moveTo(lx, ly + 13); g.lineTo(lx + sw, ly + 22); g.stroke();
}
function lanternGlow(g, st, on) {
  const { T } = st;
  const [lx, ly] = CASTLE.balcony.lantern;
  const pulse = 0.5 + 0.5 * Math.sin(T * TAU * 2);
  glow(g, lx, ly, 46 + 18 * pulse, PAL.red, (0.35 + 0.45 * pulse) * on);
  glow(g, lx, ly, 18, PAL.fire2, (0.3 + 0.4 * pulse) * on);
}

// —— 城墙 ——
function drawWall(g, st) {
  const { L, detail } = st;
  const W = CASTLE.wall;
  const body = MEMO('wall', () => poly([[W.x0, W.y0], [W.x1, W.y0], [W.x1, W.y1], [W.x0, W.y1]], { seed: 600, amp: 1.5, step: 30 }));
  // 垛口
  const merlons = MEMO('merlons', () => {
    const p = new Path2D();
    for (let j = -11; j <= 11; j++) {
      let a = 960 + 60 * j - 20, b = a + 40;
      if (j === -11) a = W.x0;
      if (j === 11) b = W.x1;
      p.addPath(poly([[a, W.y0 - 30], [b, W.y0 - 30], [b, W.y0 + 4], [a, W.y0 + 4]], { seed: 610 + j, amp: 0.8 }));
    }
    return p;
  });
  dcut(g, merlons, L.C(PAL.stone), { sh: 0.25, dx: 3, rim: L.rim, rimW: 2.2 });
  g.save();
  g.clip(merlons);
  for (let j = -11; j <= 11; j++) {
    const b = j === 11 ? W.x1 : 960 + 60 * j + 20;
    g.fillStyle = rgba(L.shadeCol, L.shadeA * 0.9);
    g.fillRect(b - 9, W.y0 - 30, 9, 34);
  }
  g.restore();
  dcut(g, body, L.C(PAL.stone), { sh: 0.25, dx: 3, dy: 3, rim: L.rim, rimW: 2.4 });
  shade(g, body, L.shadeCol, 0, W.y1, 0, W.y0 + 40, L.shadeA * 0.9, 0);
  shade(g, body, L.shadeCol, W.x1, 0, W.x1 - 300, 0, L.shadeA * 0.5, 0);
  if (detail > 0) {
    g.save();
    g.clip(body);
    g.strokeStyle = rgba(L.C(PAL.stone2), 0.75);
    g.lineWidth = 1.7;
    for (let r = 0, yy = W.y0 + 30; yy < W.y1 - 10; yy += 30, r++) {
      g.beginPath(); g.moveTo(W.x0, yy + Math.sin(r) * 1.2); g.lineTo(W.x1, yy - Math.sin(r) * 1.2); g.stroke();
      for (let xx = W.x0 + 18 + (r % 2) * 32; xx < W.x1; xx += 64) {
        if (xx > 880 && xx < 1040 && yy > 730) continue;
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + (hash2(r, xx) - 0.5) * 3, yy + 30); g.stroke();
      }
    }
    // 几块颜色略不同的石头
    for (let i = 0; i < 26; i++) {
      const r = Math.floor(hash2(i, 620) * 5), xx = W.x0 + 40 + hash2(i, 621) * (W.x1 - W.x0 - 80);
      if (xx > 870 && xx < 1050) continue;
      g.fillStyle = rgba(L.C(i % 2 ? M(PAL.stone, PAL.white, 0.3) : PAL.stone2), 0.55);
      g.fillRect(xx, W.y0 + 31 + r * 30, 30, 28);
    }
    g.restore();
    // 箭孔
    for (let k = 0; k < 12; k++) {
      if (k === 5 || k === 6) continue;
      const xx = 355 + 110 * k;
      g.fillStyle = L.C(M(PAL.ink, PAL.roof, 0.25));
      g.fill(rr(xx - 3.5, 748, 7, 30, 3.5));
      g.fillStyle = rgba(L.C(PAL.white), 0.4);
      g.fillRect(xx - 3.5, 778, 7, 2);
    }
  }
  // 勒脚
  const plinth = poly([[W.x0 - 6, W.y1 - 18], [W.x1 + 6, W.y1 - 18], [W.x1 + 6, W.y1 + 2], [W.x0 - 6, W.y1 + 2]], { seed: 601, amp: 0.8, step: 40 });
  cut(g, plinth, L.C(PAL.stone2), { rim: L.C(M(PAL.stone, PAL.white, 0.3)), rimW: 2 });
  drawGate(g, st);
  drawGateBanners(g, st);
  // 城门引道（墙脚 → 地面带上沿，CA-W 下与 near 层石板路对齐）
  const apron = MEMO('apron', () => poly([[904, 876], [1016, 876], [1022, 966], [898, 966]], { seed: 603, amp: 1.2, step: 30 }));
  cut(g, apron, L.C(M(PAL.path, PAL.stone, 0.35)));
  shade(g, apron, L.shadeCol, 0, 876, 0, 966, L.shadeA * 0.9, 0);
  if (detail > 0) {
    g.save();
    g.clip(apron);
    const stones = [PAL.stone, M(PAL.stone, PAL.path, 0.5), PAL.stone2, M(PAL.stone, PAL.white, 0.3)];
    for (let r = 0, yy = 880; yy < 970; yy += 9, r++) {
      for (let xx = 896 + (r % 2) * 8; xx < 1030; xx += 16) {
        g.fillStyle = L.C(stones[(r * 5 + Math.round(xx / 7)) % 4]);
        g.fill(blob(xx, yy + 4, 7, 3.8, { seed: 604 + r * 17 + Math.round(xx), amp: 0.08 }));
      }
    }
    shade(g, apron, L.shadeCol, 0, 876, 0, 940, L.shadeA * 0.8, 0);
    g.restore();
  }
}

function drawGate(g, st) {
  const { L, o, detail } = st;
  const G = CASTLE.gate;
  const cx = (G.x0 + G.x1) / 2, r = (G.x1 - G.x0) / 2, cy = G.y0 + r;
  const arch = (pad) => {
    const q = new Path2D();
    q.moveTo(G.x0 - pad, G.y1);
    q.lineTo(G.x0 - pad, cy);
    q.arc(cx, cy, r + pad, Math.PI, 0);
    q.lineTo(G.x1 + pad, G.y1);
    q.closePath();
    return q;
  };
  const ring = arch(15);
  dcut(g, ring, L.C(M(PAL.stone, PAL.white, 0.12)), { sh: 0.3, dx: 3, rim: L.rim, rimW: 2.2 });
  shade(g, ring, L.shadeCol, G.x1 + 15, 0, cx, 0, L.shadeA, 0);
  const inner = arch(0);
  const win = o.windows ?? L.win;
  const dk = L.C(M(PAL.ink, PAL.stoneDark, 0.25));
  g.fillStyle = lin(g, 0, G.y0, 0, G.y1, [M(dk, PAL.ink, 0.3), dk, M(dk, PAL.goldLight, 0.12 + 0.3 * win)]);
  g.fill(inner);
  glow(g, cx, G.y1 - 6, 80, PAL.goldLight, 0.18 + 0.35 * win);
  // 升起的吊闸
  g.save();
  g.clip(inner);
  const gy = G.y0 + 26;
  g.strokeStyle = L.C(M(PAL.woodDark, PAL.ink, 0.3));
  g.lineWidth = 4;
  for (let xx = G.x0 + 14; xx < G.x1; xx += 19) { g.beginPath(); g.moveTo(xx, G.y0 - 10); g.lineTo(xx, gy); g.stroke(); }
  g.lineWidth = 3.4;
  for (let yy = G.y0 + 6; yy <= gy - 4; yy += 12) { g.beginPath(); g.moveTo(G.x0, yy); g.lineTo(G.x1, yy); g.stroke(); }
  g.fillStyle = L.C(M(PAL.woodDark, PAL.ink, 0.3));
  for (let xx = G.x0 + 14; xx < G.x1; xx += 19) { g.beginPath(); g.moveTo(xx - 3.5, gy); g.lineTo(xx, gy + 9); g.lineTo(xx + 3.5, gy); g.fill(); }
  g.restore();
  // 拱石分块 + 拱心石
  if (detail > 0) {
    g.save();
    g.strokeStyle = rgba(L.C(PAL.stoneDark), 0.55);
    g.lineWidth = 1.8;
    for (let k = 1; k < 9; k++) {
      const a = Math.PI + (k / 9) * Math.PI;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * (r + 15), cy + Math.sin(a) * (r + 15)); g.stroke();
    }
    for (const yy of [cy + 24, cy + 48]) {
      g.beginPath(); g.moveTo(G.x0 - 15, yy); g.lineTo(G.x0, yy); g.moveTo(G.x1, yy); g.lineTo(G.x1 + 15, yy); g.stroke();
    }
    g.restore();
  }
  const ks = poly([[cx - 10, G.y0 - 18], [cx + 10, G.y0 - 18], [cx + 7, G.y0 + 4], [cx - 7, G.y0 + 4]], { seed: 640, amp: 0.4 });
  cut(g, ks, L.C(M(PAL.stone, PAL.white, 0.3)), { rim: L.rim, rimW: 1.8 });
  // 小金冠浮雕
  const cr = poly([[cx - 11, 724], [cx - 13, 712], [cx - 6, 718], [cx, 708], [cx + 6, 718], [cx + 13, 712], [cx + 11, 724]], { seed: 641, amp: 0.3 });
  cut(g, cr, L.C(PAL.gold), { rim: PAL.goldLight, rimW: 1.4 });
}

function drawGateBanners(g, st) {
  const { L, T } = st;
  for (const [bx, s] of [[852, 1], [1068, 2]]) {
    const sw = Math.sin(T * 1.3 + s) * 1.6;
    const pts = [[bx - 13, 708], [bx + 13, 708], [bx + 13 + sw, 772], [bx + sw, 762], [bx - 13 + sw, 772]];
    const p = poly(pts, { seed: 650 + s, amp: 0.4 });
    dcut(g, p, L.C(PAL.red), { sh: 0.3, rim: M(PAL.red, PAL.white, 0.4), rimW: 1.6 });
    shade(g, p, PAL.shadow, bx + 13, 0, bx - 4, 0, 0.25, 0);
    g.fillStyle = L.C(PAL.gold);
    g.fillRect(bx - 13, 712, 26, 3);
    sparkle(g, bx + sw * 0.5, 738, 7.5, { color: L.C(PAL.gold), thin: 0.32 });
    g.strokeStyle = L.C(PAL.woodDark);
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(bx - 17, 707); g.lineTo(bx + 17, 707); g.stroke();
  }
}

// —— 婚礼装饰：从塔顶翻折下来（scaleY −1 → 1，背面 paper2） ——
const DECO_SWAGS = [[4, 5], [7, 8], [3, 4], [8, 9], [2, 3], [9, 10], [1, 2], [10, 11], [0, 1], [11, 12]];
function flipK(p, j) { return clamp((p - j * 0.115) / 0.3); }
function flipRun(g, k, hingeY) {
  const s = Math.cos((1 - outBack(k, 1.4)) * Math.PI);
  g.translate(0, hingeY);
  g.scale(1, Math.abs(s) < 0.002 ? 0.002 : s);
  g.translate(0, -hingeY);
  return s;
}
function drawDeco(g, st, p) {
  const { L, T } = st;
  // ① 尖顶放射彩旗串
  const k0 = flipK(p, 0);
  if (k0 > 0) {
    const tip = [960, 132];
    for (const ti of [2, 4, 8, 10]) {
      const tw = TOWERS[ti];
      const end = [tw.x, tw.coneTip + 2];
      const pts = swag(tip[0], tip[1], end[0], end[1], 34, 18);
      const grow = Math.max(2, Math.ceil(pts.length * outCubic(k0)));
      const vis = pts.slice(0, grow);
      g.save();
      g.strokeStyle = L.C(PAL.inkSoft);
      g.lineWidth = 1.6;
      g.beginPath(); vis.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.restore();
      const cols = [PAL.heart, PAL.goldLight, PAL.crystal, PAL.princessLight, PAL.meadow, PAL.white];
      for (let j = 1; j < vis.length - 1; j += 2) {
        const [x, y] = vis[j];
        const kk = clamp(k0 * pts.length / 2 - j * 0.35);
        if (kk <= 0) continue;
        g.save();
        g.translate(x, y);
        g.rotate(Math.sin(T * 2 + j + ti) * 0.08);
        const s = flipRun(g, kk, 0);
        const tri = poly([[-7, 0], [7, 0], [0, 15]], { seed: 700 + j + ti * 20, amp: 0.3 });
        cut(g, tri, s < 0 ? L.C(PAL.paper2) : L.C(cols[(j + ti) % cols.length]));
        g.restore();
      }
    }
  }
  // ② 塔间花环
  for (let q = 0; q < DECO_SWAGS.length; q++) {
    const k = flipK(p, 1 + Math.floor(q / 2));
    if (k <= 0) continue;
    const [a, b] = DECO_SWAGS[q];
    const A = TOWERS[a], B = TOWERS[b];
    const ay = A.top + 16, by = B.top + 16;
    g.save();
    const s = flipRun(g, k, Math.min(ay, by));
    garland(g, st, A.x + 30, ay, B.x - 30, by, 26, s < 0, 720 + q);
    g.restore();
  }
  // ③ 城门花拱
  const k6 = flipK(p, 6);
  if (k6 > 0) {
    const G = CASTLE.gate;
    const cx = (G.x0 + G.x1) / 2, r = (G.x1 - G.x0) / 2 + 22, cy = G.y0 + r - 22;
    g.save();
    const s = flipRun(g, k6, G.y0 - 30);
    const n = 22;
    const cols = [PAL.princessLight, PAL.heart, PAL.white, PAL.goldLight, PAL.princess];
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      let x, y;
      if (t < 0.25) { x = G.x0 - 22; y = lerp(G.y1 - 6, cy, t / 0.25); }
      else if (t > 0.75) { x = G.x1 + 22; y = lerp(cy, G.y1 - 6, (t - 0.75) / 0.25); }
      else { const a = Math.PI + ((t - 0.25) / 0.5) * Math.PI; x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; }
      cut(g, blob(x + 3, y + 2, 9, 7, { seed: 760 + j, amp: 0.1, rot: j }), L.C(j % 2 ? PAL.grass : PAL.leafLight));
      const fc = s < 0 ? PAL.paper2 : cols[j % cols.length];
      cut(g, blob(x, y, 7.5, 7.5, { seed: 780 + j, amp: 0.12, freq: 5 }), L.C(fc), { rim: PAL.white, rimW: 1.4 });
      g.fillStyle = L.C(PAL.gold);
      g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
    }
    g.restore();
  }
}
function garland(g, st, ax, ay, bx, by, sag, back, seed) {
  const { L } = st;
  const pts = swag(ax, ay, bx, by, sag, 14);
  const cols = [PAL.princessLight, PAL.heart, PAL.white, PAL.goldLight];
  for (let j = 0; j < pts.length; j++) {
    const [x, y] = pts[j];
    cut(g, blob(x, y + 1, 7, 5.5, { seed: seed * 3 + j, amp: 0.12, rot: j * 0.7 }), L.C(back ? PAL.paper2 : j % 2 ? PAL.grass : PAL.leafLight));
  }
  if (back) return;
  for (let j = 1; j < pts.length; j += 2) {
    const [x, y] = pts[j];
    cut(g, blob(x, y, 5.5, 5.5, { seed: seed * 5 + j, amp: 0.14, freq: 5 }), L.C(cols[(j + seed) % cols.length]), { rim: PAL.white, rimW: 1.2 });
  }
  // 两端垂穗
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    g.strokeStyle = L.C(PAL.heart);
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 18); g.stroke();
  }
}
function balconyGarland(g, st, p) {
  const { L } = st;
  const k = flipK(p, 6);
  if (k <= 0) return;
  const B = CASTLE.balcony;
  g.save();
  const s = flipRun(g, k, B.railY - 4);
  const segs = [[B.x0 + 4, 925], [925, 995], [995, B.x1 - 4]];
  for (let q = 0; q < 3; q++) {
    const [a, b] = segs[q];
    const pts = swag(a, B.railY - 2, b, B.railY - 2, 14, 10);
    for (let j = 0; j < pts.length; j++) cut(g, blob(pts[j][0], pts[j][1] + 1, 5, 4, { seed: 800 + q * 20 + j, amp: 0.12 }), L.C(s < 0 ? PAL.paper2 : j % 2 ? PAL.leafLight : PAL.grass));
    for (let j = 1; j < pts.length; j += 3) if (s > 0) cut(g, blob(pts[j][0], pts[j][1], 4.2, 4.2, { seed: 830 + q * 20 + j, amp: 0.14 }), L.C(j % 2 ? PAL.heart : PAL.princessLight));
  }
  g.restore();
}

// —— 婚礼横幅绕尖塔一圈（后半圈在尖顶后、前半圈在前） ——
/** 绕塔椭圆上比例 u（0 = 左端起点，先绕到背面）处的点 {x, y, ang, front}。 */
export function spireWrapPoint(u) {
  const S = CASTLE.spireWrap;
  const a = Math.PI + u * TAU;
  const ex = Math.cos(a) * S.rx, ey = Math.sin(a) * S.ry;
  const cs = Math.cos(S.tilt), sn = Math.sin(S.tilt);
  const x = S.cx + ex * cs - ey * sn, y = S.cy + ex * sn + ey * cs;
  const dx = -Math.sin(a) * S.rx, dy = Math.cos(a) * S.ry;
  return { x, y, ang: Math.atan2(dx * sn + dy * cs, dx * cs - dy * sn), front: Math.sin(a) > 0 };
}
function wrapRibbon(g, st, rw, part) {
  const { L } = st;
  const p = clamp(rw.p ?? 1);
  if (p <= 0) return;
  const S = CASTLE.spireWrap;
  const u0 = part === 'back' ? 0 : 0.5, u1 = part === 'back' ? Math.min(0.5, p) : p;
  if (u1 <= u0) return;
  const n = 24;
  const pts = [];
  for (let j = 0; j <= n; j++) { const q = spireWrapPoint(lerp(u0, u1, j / n)); pts.push([q.x, q.y]); }
  const fill = L.C(rw.color || PAL.skyDayLow);
  const band = ribbon(pts, S.w / 2);
  g.save();
  if (part === 'back') g.globalAlpha *= 0.95;
  cut(g, band, part === 'back' ? M(fill, PAL.inkSoft, 0.22) : fill, { rim: PAL.white, rimW: 1.6 });
  g.strokeStyle = L.C(PAL.gold);
  g.lineWidth = 2.4;
  for (const off of [-S.w / 2 + 1.5, S.w / 2 - 1.5]) {
    g.beginPath();
    pts.forEach(([x, y], j) => (j ? g.lineTo(x, y + off) : g.moveTo(x, y + off)));
    g.stroke();
  }
  g.restore();
}
/** 只画绕塔横幅的某半圈（自带主体层机位），供场景在自己的图层里叠画。 */
export function drawSpireWrap(g, T, c, o = {}) {
  const st = { T, c, o, flat: flatOf(c, o), L: makeLook(o.time), P: null, detail: 1, strings: 0, base: null };
  g.save();
  st.base = g.getTransform();
  withDepth(g, st, 1);
  wrapRibbon(g, st, o, o.part || 'front');
  g.restore();
}

// ════════════════════════════════ 警报红色层（灯笼光、烽火） ════════════════════════════════
function drawAlarmLayer(g, st) {
  withDepth(g, st, 1);
  const { o } = st;
  const on = o.lantern ? (typeof o.lantern === 'number' ? o.lantern : 1) : 0;
  if (on > 0) lanternGlow(g, st, on);
  for (const b of o.beacons || []) {
    const tw = TOWERS[b.tower];
    if (!tw || st.T < b.at) continue;
    beaconFlame(g, st, tw.x, tw.poleTop);
  }
}

// ════════════════════════════════ 近景：城下屋顶 + 地面带 ════════════════════════════════
function drawNearLayer(g, st) {
  withDepth(g, st, CASTLE.depth.near);
  const k = st.P ? st.P.roofs : 1;
  if (!popRun(g, k, CASTLE.pageBottom)) return;
  const { L } = st;
  groundBand(g, st);
  for (let i = 0; i < HOUSES.length; i++) drawHouse(g, st, HOUSES[i], i);
  for (let i = 0; i < HOUSES.length; i++) houseSmoke(g, st, HOUSES[i], i);
  for (const f of st.o.fires || []) drawHouseFire(g, st, f);
  void L;
}

function groundBand(g, st) {
  const { L, detail, T } = st;
  const top = [];
  for (let x = -900; x <= 2900; x += 70) top.push([x, 958 + Math.sin(x * 0.013) * 4 + Math.sin(x * 0.041) * 2]);
  const band = MEMO('band', () => poly([...top, [2900, 1500], [-900, 1500]], { seed: 900, amp: 1.6, step: 40 }));
  const gTop = L.C(M(L.grass, PAL.meadow, 0.25)), gBot = L.C(M(L.grass, PAL.grassDark, 0.3));
  cut(g, band, lin(g, 0, 960, 0, 1320, [gTop, gBot]), { rim: L.C(PAL.leafLight), rimW: 2.4 });
  shade(g, band, L.shadeCol, 2300, 0, 1200, 0, L.shadeA * 0.5, 0);
  if (detail > 0) {
    g.save();
    g.clip(band);
    // 暗草斑（打破大面积平涂）
    for (let i = 0; i < 16; i++) {
      const x = -500 + hash2(i, 903) * 2900, y = 1000 + hash2(i, 904) * 320;
      if (x > 640 && x < 1300) continue;
      g.fillStyle = rgba(L.C(M(L.grass, PAL.grassDark, 0.5)), 0.35);
      g.fill(blob(x, y, 90 + hash2(i, 908) * 120, 22 + hash2(i, 909) * 18, { seed: 930 + i, amp: 0.12, freq: 4 }));
    }
    // 草浪（浅色弧线）
    g.strokeStyle = rgba(L.C(PAL.leafLight), 0.45);
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = -400 + hash2(i, 905) * 2700, y = 985 + hash2(i, 906) * 300, w = 50 + hash2(i, 907) * 90;
      if (x > 700 && x < 1250) continue;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 7, x + w, y); g.stroke();
    }
    // 小草丛
    g.fillStyle = L.C(M(L.grass, PAL.grassDark, 0.45));
    for (let i = 0; i < 90; i++) {
      const x = -300 + hash2(i, 910) * 2500;
      if (x > 700 && x < 1250) continue;
      const y = 975 + hash2(i, 911) * 320;
      const s = 4 + hash2(i, 912) * 6 + (y - 975) * 0.02;
      g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * 0.3, y - s * 2); g.lineTo(x, y - s * 0.6); g.lineTo(x + s * 0.5, y - s * 2.2); g.lineTo(x + s, y); g.closePath(); g.fill();
    }
    // 野花点
    const fl = [PAL.white, PAL.goldLight, PAL.princessLight];
    for (let i = 0; i < 40; i++) {
      const x = -300 + hash2(i, 913) * 2500;
      if (x > 690 && x < 1260) continue;
      const y = 978 + hash2(i, 914) * 320;
      g.fillStyle = L.C(fl[i % 3]);
      g.globalAlpha = 0.9;
      g.beginPath(); g.arc(x, y, 2.4 + hash2(i, 915) * 1.6, 0, TAU); g.fill();
    }
    g.restore();
  }
  // 城门前的石板小路（向镜头变宽）
  const lane = MEMO('lane', () => poly([[900, 954], [1020, 954], [1092, 1080], [1170, 1330], [750, 1330], [828, 1080]], { seed: 902, amp: 2.2, step: 26, round: 0.5 }));
  g.save(); g.translate(3, 3); g.fillStyle = rgba(PAL.shadow, 0.16); g.fill(lane); g.restore();
  cut(g, lane, L.C(M(PAL.path, PAL.stone, 0.35)), { rim: L.C(PAL.white), rimW: 1.6 });
  if (detail > 0) {
    g.save();
    g.clip(lane);
    const stones = [PAL.stone, M(PAL.stone, PAL.path, 0.5), PAL.stone2, M(PAL.stone, PAL.white, 0.3)];
    let y = 960, r = 0;
    while (y < 1330) {
      const sz = 9 + (y - 960) * 0.085;
      const off = (r % 2) * sz * 0.9;
      for (let x = 700 + off; x < 1230; x += sz * 1.8) {
        const q = blob(x, y + sz * 0.5, sz * 0.82, sz * 0.48, { seed: 920 + r * 31 + Math.round(x), amp: 0.08 });
        g.fillStyle = L.C(stones[(r * 7 + Math.round(x / 9)) % 4]);
        g.fill(q);
      }
      y += sz * 1.05;
      r++;
    }
    shade(g, lane, L.shadeCol, 0, 1330, 0, 960, L.shadeA * 0.45, 0);
    g.restore();
  }
  drawRoad(g, st, true);
  // 房子之间的小灌木（把房子“种”在地面带上）
  for (const [x, w, j] of [[512, 34, 0], [690, 28, 1], [1232, 30, 2], [1412, 32, 3], [1612, 36, 4], [322, 30, 5]]) {
    const sw = Math.sin(T * 1.2 + j) * 1.2;
    const b1 = blob(x + sw, 952, w, w * 0.62, { seed: 940 + j, amp: 0.1, freq: 5 });
    dcut(g, b1, L.C(PAL.grassDark), { sh: 0.2, dx: 2, dy: 2, rim: L.C(PAL.grass), rimW: 2.2 });
    cut(g, blob(x - w * 0.25 + sw, 946, w * 0.55, w * 0.42, { seed: 950 + j, amp: 0.1 }), L.C(PAL.grass), { rim: L.C(PAL.leafLight), rimW: 2 });
  }
}

function drawHouse(g, st, H, i) {
  const { L, o, detail, T } = st;
  const { x, w, base, eave, ridge } = H;
  const win = o.windows ?? L.win;
  const hw = w / 2;
  const wallC = L.C(PAL[H.wall]);
  const wall = MEMO(`hw|${i}`, () => poly([[x - hw, eave], [x + hw, eave], [x + hw, base + 4], [x - hw, base + 4]], { seed: H.seed, amp: 1, step: 24 }));
  dcut(g, wall, wallC, { sh: 0.25, dx: 3, rim: L.rim, rimW: 1.8 });
  shade(g, wall, L.shadeCol, x + hw, 0, x, 0, L.shadeA, 0);
  if (H.timber && detail > 0) {
    g.save();
    g.clip(wall);
    g.strokeStyle = L.C(PAL.woodDark);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - hw, eave + 4); g.lineTo(x + hw, eave + 4);
    g.moveTo(x - hw + 4, eave); g.lineTo(x - hw + 4, base);
    g.moveTo(x + hw - 4, eave); g.lineTo(x + hw - 4, base);
    g.moveTo(x, eave); g.lineTo(x, base);
    g.moveTo(x - hw + 4, eave + 6); g.lineTo(x - 4, eave + (base - eave) * 0.55);
    g.moveTo(x + hw - 4, eave + 6); g.lineTo(x + 4, eave + (base - eave) * 0.55);
    g.stroke();
    g.restore();
  }
  // 窗
  const dk = L.C(M(PAL.ink, PAL.roof, 0.3));
  for (const dx of [-0.28, 0.28]) {
    const wx = x + dx * w, wy = eave + (base - eave) * 0.38;
    const wp = rr(wx - 9, wy - 9, 18, 17, 3);
    g.fillStyle = win > 0 ? M(dk, PAL.goldLight, clamp(win)) : dk;
    g.fill(wp);
    if (win > 0.05) glow(g, wx, wy, 26, PAL.goldLight, 0.45 * win);
    g.strokeStyle = L.C(PAL.woodDark);
    g.lineWidth = 2;
    g.stroke(wp);
    g.beginPath(); g.moveTo(wx, wy - 9); g.lineTo(wx, wy + 8); g.stroke();
    g.fillStyle = L.C(PAL.wood);
    g.fillRect(wx - 11, wy + 8, 22, 3);
  }
  // 门
  const dx = H.chim > 0 ? -0.02 : 0.02;
  const door = rr(x + dx * w - 10, base - 30, 20, 30, [9, 9, 0, 0]);
  g.fillStyle = L.C(PAL.woodDark);
  g.fill(door);
  g.fillStyle = L.C(PAL.gold);
  g.beginPath(); g.arc(x + dx * w + 5, base - 14, 1.6, 0, TAU); g.fill();
  // 屋顶
  const ov = 12;
  const roofP = MEMO(`hr|${i}`, () => poly([[x - hw - ov, eave + 4], [x, ridge], [x + hw + ov, eave + 4], [x + hw + ov - 4, eave + 10], [x - hw - ov + 4, eave + 10]], { seed: H.seed + 50, amp: 1, step: 20, round: 0.15 }));
  // 烟囱（在屋顶之前画，被屋面压住根部）
  const chx = x + H.chim * w;
  const chTop = lerp(eave, ridge, 0.72) - 14;
  const chim = poly([[chx - 8, chTop], [chx + 8, chTop], [chx + 8, eave + 4], [chx - 8, eave + 4]], { seed: H.seed + 60, amp: 0.5 });
  dcut(g, chim, L.C(PAL.stoneDark), { sh: 0.25, rim: L.rim, rimW: 1.4 });
  g.fillStyle = L.C(PAL.stone2);
  g.fillRect(chx - 10, chTop - 3, 20, 5);
  const rc = PAL[H.roof];
  dcut(g, roofP, L.C(rc), { sh: 0.25, dx: 3, rim: L.C(M(rc, PAL.white, 0.45)), rimW: 2.4 });
  shade(g, roofP, L.shadeCol, x + hw, 0, x, 0, L.shadeA * 1.3, 0);
  if (L.name === 'sunset' || L.blend?.b.name === 'sunset') {
    g.save(); g.strokeStyle = rgba(PAL.goldLight, 0.8); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x - hw - ov + 2, eave + 3); g.lineTo(x, ridge + 1.5); g.stroke(); g.restore();
  }
  if (detail > 0) {
    g.save();
    g.clip(roofP);
    g.strokeStyle = rgba(L.C(M(rc, PAL.ink, 0.35)), 0.5);
    g.lineWidth = 1.6;
    for (let r = 1; r <= 3; r++) {
      const yy = lerp(ridge, eave + 4, r / 4);
      const half = (hw + ov) * (r / 4);
      for (let xx = x - half; xx < x + half - 4; xx += 14) { g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + 7, yy + 5, xx + 14, yy); g.stroke(); }
    }
    g.restore();
  }
  void T;
}

function houseSmoke(g, st, H, i) {
  const { L, T } = st;
  if (L.smokeA <= 0) return;
  const chx = H.x + H.chim * H.w;
  const chTop = lerp(H.eave, H.ridge, 0.72) - 16;
  for (const f of st.o.fires || []) if (f.house === i && T >= f.at) return;
  g.save();
  g.fillStyle = L.C(L.smoke);
  for (let j = 0; j < 5; j++) {
    const ph = fract(T * 0.2 + j / 5 + i * 0.17);
    const y = chTop - 4 - ph * 120;
    const x = chx + ph * 40 + Math.sin(ph * 5 + T * 0.7 + i) * 7;
    const r = 4 + ph * 17 + hash2(i, j) * 3;
    g.globalAlpha = L.smokeA * 0.62 * Math.pow(Math.sin(ph * Math.PI), 1.3);
    g.fill(blob(x, y, r, r * 0.82, { seed: 950 + j + i * 7, amp: 0.09 }));
  }
  g.restore();
}

function drawHouseFire(g, st, f) {
  const { T, L } = st;
  const H = HOUSES[f.house];
  if (!H || T < f.at) return;
  const t = T - f.at;
  const s = outBack(clamp(t / 0.3), 1.8);
  const x = H.x, y = H.ridge + 6;
  // 屋面烧焦
  g.save();
  g.globalAlpha *= clamp(t / 1.5) * 0.45;
  g.fillStyle = PAL.ink;
  g.fill(poly([[x - H.w / 2 - 12, H.eave + 4], [x, H.ridge], [x + H.w / 2 + 12, H.eave + 4]], { seed: H.seed + 50, amp: 1, step: 20 }));
  g.restore();
  // 烟柱
  for (let j = 0; j < 9; j++) {
    const ph = (T * 0.4 + j / 9) % 1;
    const age = t - ph * 2.5;
    if (age < 0.3) continue;
    const yy = y - 40 - ph * 260;
    const xx = x + Math.sin(ph * 3 + T * 0.6 + f.house) * 18 + ph * 40;
    const r = 14 + ph * 46;
    g.save();
    g.globalAlpha *= clamp((age - 0.3) / 0.6) * Math.sin(ph * Math.PI) * 0.7;
    g.fillStyle = M(L.C(PAL.inkSoft), PAL.ink, 0.3);
    g.fill(blob(xx, yy, r, r * 0.85, { seed: 960 + j, amp: 0.1 }));
    g.restore();
  }
  // 光、火
  glow(g, x, y - 10, 170 * s, PAL.fire, 0.6 + 0.12 * Math.sin(T * 11 + f.house));
  glow(g, x, y + 20, 80 * s, PAL.fire2, 0.4);
  for (const dx of [-0.38, -0.14, 0.12, 0.36]) flame(g, x + dx * H.w, y + 8 + Math.abs(dx) * 40, 30 * s, (78 + 26 * (0.4 - Math.abs(dx))) * s, T, f.house * 7 + dx * 10, [PAL.fireDeep, PAL.fire, PAL.fire2]);
  // 火星
  for (let j = 0; j < 14; j++) {
    const ph = (T * 0.9 + hash2(j, f.house) ) % 1;
    const yy = y - 30 - ph * 180;
    const xx = x + (hash2(j, f.house + 3) - 0.5) * H.w + Math.sin(T * 3 + j) * 10;
    g.globalAlpha = (1 - ph) * clamp(t * 3);
    g.fillStyle = j % 2 ? PAL.fire2 : PAL.ember;
    g.beginPath(); g.arc(xx, yy, 2.4 * (1 - ph * 0.5), 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // 点燃瞬间：爆点
  burst(g, T, { at: f.at, seed: 970 + f.house, count: 16, x, y: y - 6, speed: [160, 380], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 600, drag: 1.4, life: [0.4, 0.8], size: [3, 6] }, (g2, px, py, q) => {
    g2.save(); g2.globalAlpha *= 1 - q.p; g2.fillStyle = q.i % 2 ? PAL.fire2 : PAL.fire; g2.beginPath(); g2.arc(px, py, q.size * 0.6, 0, TAU); g2.fill(); g2.restore();
  });
}

// ════════════════════════════════ 前景：花丛 + 彩旗串 ════════════════════════════════
function drawFgLayer(g, st) {
  withDepth(g, st, CASTLE.depth.fg);
  const { L, o, T, P } = st;
  const kf = P ? P.flowers : 1;
  g.save();
  if (popRun(g, kf, CASTLE.pageBottom)) {
    bush(g, st, -40, 1080, 1, 1);
    bush(g, st, 1960, 1080, -1, 2);
  }
  g.restore();
  const bunt = o.bunting ?? (L.bunting > 0 ? (L.name === 'wedding' && o.deco !== undefined ? clamp(o.deco) : 1) : 0);
  if (bunt > 0) {
    // 两串在中间留出空当，不挡主堡尖顶的旗
    fgBunting(g, st, [[-70, 4], [430, 76], [880, -4]], bunt, 0);
    fgBunting(g, st, [[1040, -4], [1490, 80], [1990, 2]], bunt, 1);
  }
  if (L.blossom > 0 && st.detail > 0 && !P) petals(g, st, -100, -100, 2100, 1300, 22, 990);
  void T;
}

function bush(g, st, x, y, dir, s) {
  const { L, T } = st;
  const leaves = [PAL.grassDark, PAL.grass, PAL.grass, PAL.leafLight];
  const parts = [[0, -40, 150, 90], [120, -20, 120, 70], [60, -96, 110, 74], [210, 10, 110, 60], [-30, -140, 70, 60], [170, -70, 80, 60]];
  for (let j = 0; j < parts.length; j++) {
    const [dx, dy, rx_, ry_] = parts[j];
    const sw = Math.sin(T * 1.1 + j + s) * 3;
    const p = blob(x + dir * dx + sw, y + dy, rx_, ry_, { seed: 1000 + s * 10 + j, amp: 0.07, freq: 6 });
    dcut(g, p, L.C(leaves[(j + s) % 4 === 0 ? 0 : j % 4]), { sh: 0.2, dx: 4, dy: 4, rim: L.C(PAL.leafLight), rimW: 3 });
    shade(g, p, L.shadeCol, x + dir * (dx + rx_), 0, x + dir * dx, 0, L.shadeA * 0.8, 0);
  }
  const fc = [PAL.princess, PAL.white, PAL.goldLight, PAL.heart, PAL.princessLight];
  for (let j = 0; j < 9; j++) {
    const fx = x + dir * (-40 + hash2(j, 1010 + s) * 250) + Math.sin(T * 1.3 + j) * 2;
    const fy = y - 30 - hash2(j, 1020 + s) * 150;
    const r = 9 + hash2(j, 1030 + s) * 6;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU + j + T * 0.2;
      g.fillStyle = L.C(fc[j % fc.length]);
      g.beginPath(); g.ellipse(fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, r * 0.55, r * 0.4, a, 0, TAU); g.fill();
    }
    g.fillStyle = L.C(PAL.gold);
    g.beginPath(); g.arc(fx, fy, r * 0.28, 0, TAU); g.fill();
  }
}

function fgBunting(g, st, pts3, p, seed) {
  const { L, T } = st;
  const [a, m, b] = pts3;
  const pts = catmull([a, m, b], 14);
  g.save();
  g.strokeStyle = L.C(PAL.inkSoft);
  g.lineWidth = 2.6;
  g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  const cols = [PAL.heart, PAL.goldLight, PAL.crystal, PAL.meadow, PAL.princessLight, PAL.skyDay];
  const Ls = arcLen(pts);
  const tot = Ls[Ls.length - 1];
  const n = Math.floor(tot / 62);
  for (let j = 0; j < n; j++) {
    const kk = clamp(p * (n + 6) / 6 - j * 0.16);
    if (kk <= 0) continue;
    const [x, y, ang] = atLen(pts, Ls, (j + 0.5) * (tot / n));
    g.save();
    g.translate(x, y);
    g.rotate(ang + Math.sin(T * 1.8 + j * 0.9 + seed) * 0.07);
    const s = flipRun(g, kk, 0);
    const tri = poly([[-18, 0], [18, 0], [0, 44]], { seed: 1100 + j + seed * 40, amp: 0.6 });
    cut(g, tri, s < 0 ? L.C(PAL.paper2) : L.C(cols[(j + seed * 3) % cols.length]), { rim: PAL.white, rimW: 1.6 });
    shade(g, tri, PAL.shadow, 18, 0, -6, 0, 0.22, 0);
    g.restore();
  }
  g.restore();
}
