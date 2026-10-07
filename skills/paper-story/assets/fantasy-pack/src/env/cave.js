// 龙洞布景（CAVE，storyboard 4.7 / assets 8.7）：分层剪纸山洞 + 五种光照 + 剧场背景片（flat）+ D3 名字墙 + 水晶簇。
// 约定：drawCave(g, T, cam, o) 按 o.layer 分层画（back / mid / main / fg），函数内部自己 applyCam，镜头只负责把每层包进 ctx.layer：
//   ctx.layer(g, { shadow: 6, texture: 0.3 }, (lg) => drawCave(lg, T, c, { layer: 'back', light: 'lit' }));
// 世界坐标 = 各层自己的坐标（cam(960,540,1) 时所有层与屏幕重合）。布局常量 CAVE / STANDOFF / CAMS 只读。
// 纯函数：只读参数（含 T），不存跨帧状态；只用 PAL；不调 ctx.layer / ctx.mask。
import { PAL, blob, poly, rr, smooth as smoothPath, ribbon, cut, shade, lin, rad, glow, sparkle, scaleOf } from '../core/paper.js';
import { cam, applyCam, toScreen } from '../core/camera.js';
import { clamp, lerp, seg, smoothstep, hash2, noise1, TAU, rgba, mixHex, fract, hit, wobble } from '../core/util.js';
import { burst } from '../core/particles.js';
import { outCubic, inQuad } from '../core/ease.js';
import { paperGlyph, NAME_TIMES, charsOf } from '../ui/type.js';
import { drawCoinPile, coinPileShape, drawCoin, drawStoneTablet, drawChain, dimc, CAGE } from '../props/cave.js';

const DEG = Math.PI / 180;

// ———————————————————— 布局 ————————————————————
/** 地面线（世界 x → y），900 ± 20 起伏。 */
export function groundAt(x) {
  return 900 + 10 * Math.sin(x * 0.0043 + 0.6) + 6 * Math.sin(x * 0.0121 + 2.2) + 3 * Math.sin(x * 0.029 + 0.4);
}

export const CAVE = {
  groundY: 900, groundAt,
  x0: -200, x1: 2800,
  entrance: { x0: -200, x1: 140, depth: 0.5 },
  depth: { back: 0.5, backCrystal: 0.6, coins: 0.8, pillar: 0.85, main: 1, fg: 1.4 },
  pillar: { x: 1640, w: 110, depth: 0.85 },
  coinPile: { x0: 1250, x1: 2100, peak: [1700, 780], depth: 0.8, x: 1675, y: 900, w: 850, h: 120, peakRel: (1700 - 1250) / 850 },
  /** 鸟笼：吊点 (1320,0)，笼心 (1320,330)，180×240，门在左，挂锁 (1232,352)。公主在笼里建议 s≈0.78（笼高 240 装不下 s=1 的 250）。
   *  landed = 吊链松脱后笼子直落到地面时的笼心（底座下沿贴 groundAt(1320)），配 drawCage({ onFloor:true })。 */
  cage: { x: 1320, y: 330, w: 180, h: 240, hook: [1320, 0], ring: [1320, 330 + CAGE.ringTop], lock: [1232, 352], door: 'left', floor: [1320, 330 + CAGE.floorY], princessS: 0.78, landed: [1320, +(groundAt(1320) - CAGE.baseBot).toFixed(1)] },
  crystals: { fg: [140, 960, 1.4], back: [1880, 300, 0.6], ground: [[560, 900], [1100, 905]] },
  hero: { x: 420, y: 900, face: 1 },
  /** 巨龙关键姿态的落点（供 dragon.js 与镜头参考，storyboard 4.7）。 */
  dragon: {
    coil: { head: [1150, 600] }, rise: { head: [1150, 470] }, wall: { head: [1180, 250] },
    name: { head: [960, 440], spine: [[1080, 500], [1400, 640], [1750, 540], [2100, 700], [2450, 820]] },
  },
};

/** 预设机位（storyboard 4.7；CV_LOW_END = b10 结尾 / b11 开头的共享机位）。 */
export const CAMS = {
  CV_W: cam(960, 540, 1.0),
  CV_WIDE: cam(1300, 520, 0.85),
  CV_2S: cam(900, 580, 1.15),
  CU_H_CAVE: cam(500, 720, 3.4),
  CU_D: cam(1120, 470, 2.4),
  CV_CAGE: cam(1320, 340, 2.2),
  CV_LOW: cam(1000, 420, 0.8, -3 * DEG),
  CV_LOW_END: cam(1000, 420, 0.9, -5 * DEG),
};

/** 屏幕点 → 某深度层的世界坐标（toScreen 的逆）。 */
export function fromScreen(c, depth, sx, sy) {
  const z = 1 + (c.zoom - 1) * depth;
  let dx = sx - 960, dy = sy - 540;
  if (c.rot) { const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; }
  return [960 + (c.x - 960) * depth + dx / z, 540 + (c.y - 540) * depth + dy / z];
}

// ———————————————————— 对峙构图（b11 结尾 = b12 剧场 137.40） ————————————————————
function solveStandoff() {
  // 机位 (cx, cy, z)：勇者脚底（站在地面上）→ 屏幕 (520,840)；笼心 (1320,330) → 屏幕 (1480,330)。
  let hx = 260, z = 0.9, cx = 740, cy = 560;
  for (let k = 0; k < 12; k++) {
    const gy = groundAt(hx);
    z = (840 - 330) / (gy - 330);
    cy = 330 + 210 / z;
    cx = 1320 - 520 / z;
    hx = cx + (520 - 960) / z;
  }
  return { c: cam(+cx.toFixed(2), +cy.toFixed(2), +z.toFixed(5)), hx };
}
const SO = solveStandoff();
/**
 * STANDOFF：对峙全景（b11 136.80 起、b12 137.40 接管）。screen 为屏幕坐标（= 剧场木偶落点），world 为 depth 1 世界坐标。
 * cam 由“勇者脚底 (520,840) 落在地面上、笼心 (1320,330) 落在屏幕 (1480,330)”反解。caveOpts = 两块共用的 drawCave 参数。
 */
export const STANDOFF = {
  cam: SO.c,
  hero: [520, 840], dragonHead: [1350, 520], dragonBody: [1700, 760], cage: [1480, 330],
  world: {
    hero: [+SO.hx.toFixed(1), +groundAt(SO.hx).toFixed(1)],
    dragonHead: fromScreen(SO.c, 1, 1350, 520).map((v) => +v.toFixed(1)),
    dragonBody: fromScreen(SO.c, 1, 1700, 760).map((v) => +v.toFixed(1)),
    cage: [1320, 330],
  },
  face: { hero: 1, dragon: -1 },
  pose: { hero: 'stance', dragon: 'standoff', princess: 'caged' },
  letterbox: 138.3,
  caveOpts: { light: 'battle', rubble: { at: 120.97, cooled: 0.6 } },
};
CAMS.STANDOFF = STANDOFF.cam;

// ———————————————————— 层变换（含 flat 冻结视差） ————————————————————
const refOf = (o) => o.flatRef || STANDOFF.cam;
function enter(g, c, depth, o) {
  if (o.flat) { applyCam(g, c, 1); applyCam(g, refOf(o), depth); } else applyCam(g, c, depth);
}
/** 世界点（某深度）→ drawCave 调用坐标系（通常 = 屏幕）。 */
function proj(c, depth, x, y, o) {
  if (o.flat) { const [a, b] = toScreen(refOf(o), depth, x, y); return toScreen(c, 1, a, b); }
  return toScreen(c, depth, x, y);
}
/** 调用坐标系的点 → 某深度世界点（proj 的逆）。 */
function unproj(c, depth, sx, sy, o) {
  if (o.flat) { const [a, b] = fromScreen(c, 1, sx, sy); return fromScreen(refOf(o), depth, a, b); }
  return fromScreen(c, depth, sx, sy);
}
/** 屏幕点 → drawCave 某层的世界坐标（镜头挂特效用；flat 时传同一个 o）。 */
export const caveToLayer = (c, depth, sx, sy, o = {}) => unproj(c, depth, sx, sy, o);
/** 某层世界点 → 屏幕（flat 时传同一个 o）。 */
export const caveToScreen = (c, depth, x, y, o = {}) => proj(c, depth, x, y, o);

// ———————————————————— 水晶登记表（glint 点亮顺序按到中心的距离） ————————————————————
export const CRYSTALS = [
  { id: 'w1', layer: 'back', x: 230, y: 578, s: 0.55, n: 4, seed: 21, rot: 0.55, tw: 0.0 },
  { id: 'w2', layer: 'back', x: 720, y: 335, s: 0.5, n: 4, seed: 22, rot: -0.2 },
  { id: 'w3', layer: 'back', x: 1010, y: 640, s: 0.45, n: 3, seed: 23, rot: 0.15 },
  { id: 'w4', layer: 'back', x: 1470, y: 455, s: 0.5, n: 4, seed: 24, rot: 0.35 },
  { id: 'w5', layer: 'back', x: 2240, y: 520, s: 0.6, n: 5, seed: 25, rot: -0.5 },
  { id: 'w6', layer: 'back', x: 2720, y: 395, s: 0.55, n: 4, seed: 26, rot: -0.3 },
  { id: 'w7', layer: 'back', x: -130, y: 760, s: 0.5, n: 3, seed: 27, rot: 0.45 },
  { id: 'w8', layer: 'back', x: 3200, y: 610, s: 0.6, n: 4, seed: 28, rot: -0.4 },
  { id: 'bc', layer: 'backC', x: 1880, y: 330, s: 1.2, n: 7, seed: 29, rot: -0.14, tw: 0.37 },
  { id: 'pl', layer: 'pillar', x: 1640, y: 450 },
  { id: 'g1', layer: 'main', x: 560, y: 903, s: 0.85, n: 5, seed: 31, rot: 0.05 },
  { id: 'g2', layer: 'main', x: 1100, y: 907, s: 0.62, n: 4, seed: 32, rot: -0.12 },
  { id: 'g3', layer: 'main', x: 2380, y: 905, s: 0.9, n: 6, seed: 33, rot: 0.1 },
  { id: 'g4', layer: 'main', x: -90, y: 906, s: 0.7, n: 4, seed: 34, rot: 0.22 },
  { id: 'g5', layer: 'main', x: 2960, y: 903, s: 0.75, n: 5, seed: 35, rot: -0.15 },
  { id: 'f1', layer: 'fg', x: 140, y: 990, s: 1.55, n: 6, seed: 36, rot: 0.12 },
  { id: 'f2', layer: 'fg', x: 2950, y: 1005, s: 1.3, n: 5, seed: 37, rot: -0.1 },
];
const CRYS_BY_ID = Object.fromEntries(CRYSTALS.map((c) => [c.id, c]));

// ———————————————————— 光照 ————————————————————
// 光照状态是数值：amb 环境亮度、lev(id) 每簇水晶亮度、warm/cool 战斗左冷右暖、dawn 黎明、ring(id) glint 的扩散光环进度。
function lightOf(name, o, T) {
  if (name === 'dark') {
    return {
      amb: 0.05, warm: 0, cool: 0, dawn: 0,
      lev: (id) => { const c = CRYS_BY_ID[id]; if (c && c.tw !== undefined) { const p = 0.5 + 0.5 * Math.sin(T * 2.4 + c.tw * TAU); return 0.08 + 0.42 * Math.pow(p, 5); } return 0.03; },
      ring: () => -1,
    };
  }
  if (name === 'glint') {
    const at = o.glintAt ?? 0, [gx, gy] = o.glintC || [1320, 330], sp = o.glintSpeed ?? 1600;
    const tOn = (id) => { const c = CRYS_BY_ID[id]; return at + Math.hypot(c.x - gx, c.y - gy) / sp; };
    const lev = (id) => 0.06 + 0.94 * smoothstep(tOn(id), tOn(id) + 0.35, T);
    let s = 0; for (const c of CRYSTALS) s += lev(c.id);
    return { amb: 0.06 + 0.5 * (s / CRYSTALS.length), warm: 0, cool: 0, dawn: 0, lev, ring: (id) => (T - tOn(id)) / 0.9 };
  }
  if (name === 'battle') {
    return { amb: 0.92, warm: 1, cool: 1, dawn: 0, lev: () => 0.9, ring: () => -1 };
  }
  if (name === 'dawn') {
    const d = clamp(o.dawnP ?? 1);
    return { amb: 1, warm: 0, cool: 0, dawn: d, lev: () => 1 - 0.45 * d, ring: () => -1 };
  }
  return { amb: 1, warm: 0, cool: 0, dawn: 0, lev: () => 1, ring: () => -1 }; // lit
}
function lightState(o, T) {
  const L = o.light ?? 'lit';
  if (L && typeof L === 'object') {
    const a = lightOf(L.from, o, T), b = lightOf(L.to, o, T), k = clamp(L.k ?? 0);
    return {
      amb: lerp(a.amb, b.amb, k), warm: lerp(a.warm, b.warm, k), cool: lerp(a.cool, b.cool, k), dawn: lerp(a.dawn, b.dawn, k),
      lev: (id) => lerp(a.lev(id), b.lev(id), k), ring: (id) => (k < 0.5 ? a.ring(id) : b.ring(id)),
    };
  }
  return lightOf(L, o, T);
}
/** 某组参数下的环境亮度 0..1（镜头给鸟笼 / 角色传 light 用）。 */
export const caveAmbient = (o = {}, T = 0) => lightState(o, T).amb;

/** 材质色：按环境亮度压暗、黎明时转柔粉。 */
function palette(LS) {
  const a = LS.amb, w = LS.dawn;
  const pink = mixHex(PAL.princessDark, PAL.dragonWing, 0.45);
  const m = (c, k = 1) => {
    let x = mixHex(c, PAL.shadow, clamp((1 - a) * 0.9 * k));
    if (w > 0) x = mixHex(mixHex(x, pink, 0.42 * w), PAL.princessLight, 0.08 * w);
    return x;
  };
  return {
    rock0: m(mixHex(PAL.dragonDeep, PAL.ink, 0.5)),
    rock1: m(mixHex(PAL.dragonDeep, PAL.dragonDark, 0.42)),
    rock2: m(mixHex(PAL.dragonDark, PAL.dragonDeep, 0.3)),
    rock3: m(mixHex(PAL.dragonDark, PAL.dragon, 0.25)),
    ceil: m(mixHex(PAL.dragonDeep, PAL.ink, 0.5)),
    stal: m(mixHex(PAL.dragonDeep, PAL.dragonDark, 0.5)),
    stalHi: m(mixHex(PAL.dragonDark, PAL.dragonWing, 0.35)),
    rim: m(mixHex(PAL.dragonWing, PAL.crystal, 0.35)),
    ground: m(mixHex(PAL.dragonDark, PAL.dragonDeep, 0.45)),
    groundTop: m(mixHex(PAL.dragonDark, PAL.dragonWing, 0.3)),
    groundLo: m(mixHex(PAL.dragonDeep, PAL.ink, 0.45)),
    fg: m(mixHex(PAL.dragonDeep, PAL.ink, 0.62), 0.6),
    vein: PAL.crystal,
  };
}

// ———————————————————— 小工具 ————————————————————
function under(g, path, d, a = 0.3) { g.save(); g.translate(d * 0.35, d * 0.85); g.fillStyle = rgba(PAL.shadow, a); g.fill(path); g.restore(); }
/** 剪纸片：暗色错位 + 填色 + 顶部切口亮边 + 左上亮右下暗。 */
function piece(g, path, fill, o = {}) {
  const { lift = 4, rim = null, rimW = 2.4, box = null, shadeA = 0.32, alpha = 1 } = o;
  if (lift > 0) under(g, path, lift, 0.28 * alpha);
  cut(g, path, fill, { rim, rimW, alpha });
  if (box) shade(g, path, PAL.shadow, box[2], box[3], box[0], box[1], shadeA * alpha, 0);
}
/** 暗处压暗：在 path 内正片叠底一层 ink（能压到比 PAL.shadow 更黑）；x = 该物的有效亮度。 */
const darkK = (x) => 0.88 * clamp((0.6 - x) / 0.55);
function darken(g, path, x) {
  const k = darkK(x);
  if (k <= 0.005) return;
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = rgba(PAL.ink, k); g.fill(path); g.restore();
}
function ellGlow(g, x, y, rx, ry, color, alpha) {
  if (alpha <= 0) return;
  g.save(); g.translate(x, y); g.scale(1, ry / rx); glow(g, 0, 0, rx, color, alpha); g.restore();
}
const H = (a, b) => hash2(a, b);

// ———————————————————— 几何（首次绘制时按固定种子建好，之后只换颜色） ————————————————————
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const P = (pts, seed, o = {}) => poly(pts, { seed, amp: o.amp ?? 5, step: o.step ?? 36, round: o.round ?? 0.55 });
  // —— back（depth 0.5）——
  const masses = [
    { tone: 'rock1', p: P([[-1500, -400], [560, -400], [610, 90], [470, 300], [565, 520], [420, 770], [520, 980], [-1500, 980]], 101), box: [-1500, -400, 610, 980] },
    { tone: 'rock1', p: P([[1975, -400], [4200, -400], [4200, 980], [2120, 980], [2235, 760], [2040, 560], [2185, 330], [1935, 110]], 102), box: [1935, -400, 4200, 980] },
    { tone: 'rock2', p: P([[-1500, 250], [215, 215], [335, 405], [245, 625], [365, 845], [300, 1000], [-1500, 1000]], 103), box: [-1500, 215, 365, 1000] },
    { tone: 'rock2', p: P([[2385, 185], [4200, 140], [4200, 1000], [2290, 1000], [2425, 705], [2310, 470]], 104), box: [2290, 140, 4200, 1000] },
    { tone: 'rock2', p: P([[400, 1000], [430, 835], [640, 790], [830, 772], [1040, 800], [1240, 786], [1450, 760], [1640, 748], [1850, 772], [2060, 792], [2290, 812], [2520, 826], [2560, 1000]], 105, { amp: 4, round: 0.7 }), box: [400, 748, 2560, 1000] },
  ];
  const strata = [
    [[-900, 120], [-500, 150], [-150, 130], [200, 170], [420, 160]],
    [[-1000, 960], [-600, 930], [-300, 945], [90, 925]],
    [[2050, 260], [2400, 230], [2800, 260], [3300, 235]],
    [[2150, 640], [2600, 610], [3000, 640], [3500, 620]],
    [[2400, 820], [2800, 790], [3300, 810]],
    [[-1100, 470], [-700, 440], [-380, 470]],
  ].map((pts) => smoothPath(pts, { closed: false, tension: 0.5 }));
  const veins = [
    [[230, 578], [160, 500], [190, 420], [120, 340]], [[230, 578], [330, 520], [350, 455]], [[230, 578], [260, 680], [210, 760]],
    [[720, 335], [640, 300], [610, 230]], [[720, 335], [800, 380], [860, 360], [930, 410]],
    [[1010, 640], [940, 700], [900, 760]], [[1010, 640], [1090, 600], [1160, 630]],
    [[1470, 455], [1400, 400], [1420, 330]], [[1470, 455], [1560, 500], [1610, 580]],
    [[2240, 520], [2320, 450], [2300, 380], [2380, 320]], [[2240, 520], [2160, 600], [2190, 680]],
    [[2720, 395], [2650, 330], [2700, 250]], [[2720, 395], [2820, 450], [2900, 430]],
    [[-130, 760], [-60, 690], [-90, 600]], [[3200, 610], [3120, 540], [3160, 470]],
  ].map((pts) => {
    const jit = pts.map(([x, y], i) => [x + (i ? (H(x, y) - 0.5) * 18 : 0), y]);
    // 细分后做成由粗到细的条带（从水晶处往外变细）
    const dense = [];
    for (let i = 0; i < jit.length - 1; i++) for (let k = 0; k < 6; k++) { const t = k / 6; dense.push([lerp(jit[i][0], jit[i + 1][0], t), lerp(jit[i][1], jit[i + 1][1], t)]); }
    dense.push(jit[jit.length - 1]);
    return { path: smoothPath(jit, { closed: false, tension: 0.4 }), band: ribbon(dense, (t) => 3.6 * (1 - t) + 0.5), mid: pts[Math.floor(pts.length / 2)] };
  });
  const veinOwner = (v) => CRYSTALS.filter((c) => c.layer === 'back').reduce((b, c) => (Math.hypot(c.x - v.mid[0], c.y - v.mid[1]) < Math.hypot(b.x - v.mid[0], b.y - v.mid[1]) ? c : b)).id;
  veins.forEach((v) => (v.owner = veinOwner(v)));
  // 入口：杏仁形破口透出夜空
  const holePts = [[-310, 905], [-335, 650], [-268, 440], [-150, 335], [-10, 345], [92, 440], [146, 610], [138, 905]];
  const hole = poly(holePts, { seed: 111, amp: 7, step: 30, round: 0.65 });
  const treeline = (() => {
    const p = new Path2D(); p.moveTo(-420, 1000);
    for (let x = -420; x <= 220; x += 18) { const h = 70 + H(x, 3) * 70 + (Math.floor(x / 18) % 3 === 0 ? 40 : 0); p.lineTo(x, 905 - h * 0.55); p.lineTo(x + 9, 905 - h); p.lineTo(x + 18, 905 - h * 0.55); }
    p.lineTo(220, 1000); p.closePath(); return p;
  })();
  const hills = poly([[-420, 1000], [-420, 800], [-250, 740], [-80, 780], [60, 720], [220, 790], [220, 1000]], { seed: 112, amp: 4, round: 0.8 });
  const stars = [[-190, 420], [-80, 395], [40, 470], [-250, 560], [-120, 520], [80, 560], [-40, 640], [-220, 680], [110, 650], [-150, 610]];
  // 洞顶带 + 钟乳石
  const ceilY = (x) => 42 + 26 * Math.sin(x * 0.0045 + 1.1) + 14 * Math.sin(x * 0.013 + 0.3) + 8 * noise1(x * 0.02, 5);
  const ceilPts = [];
  for (let x = -1500; x <= 4200; x += 30) ceilPts.push([x, ceilY(x) + (H(x, 9) - 0.5) * 6]);
  const ceiling = new Path2D();
  ceiling.moveTo(-1500, -1600);
  for (const [x, y] of ceilPts) ceiling.lineTo(x, y);
  ceiling.lineTo(4200, -1600); ceiling.closePath();
  const ceilEdge = smoothPath(ceilPts, { closed: false, tension: 0.3 });
  const stalBody = new Path2D(), stalLit = new Path2D(), stalDark = new Path2D();
  const stalTips = [];
  for (let k = 0, x0 = -1460; x0 < 4150; k++, x0 += 90) {
    const x = x0 + (H(k, 1) - 0.5) * 36;
    const len = 60 + H(k, 2) * 100, w = 20 + H(k, 3) * 22, top = ceilY(x) - 14;
    const addStal = (sx, sl, sw, seed) => {
      const tipx = sx + (H(seed, 4) - 0.5) * sw * 0.35;
      const pts = [[sx - sw / 2, top], [sx + sw / 2, top], [sx + sw * 0.16, top + sl * 0.72], [tipx, top + sl], [sx - sw * 0.14, top + sl * 0.66]];
      stalBody.addPath(poly(pts, { seed, amp: 1.5, step: 22, round: 0.55 }));
      stalLit.addPath(poly([[sx - sw / 2, top], [sx - sw * 0.05, top], [tipx - sw * 0.02, top + sl * 0.95], [sx - sw * 0.14, top + sl * 0.66]], { seed: seed + 1, amp: 1, step: 22, round: 0.5 }));
      stalDark.addPath(poly([[sx + sw * 0.18, top], [sx + sw / 2, top], [sx + sw * 0.16, top + sl * 0.72], [tipx + sw * 0.02, top + sl * 0.92]], { seed: seed + 2, amp: 1, step: 22, round: 0.5 }));
      stalTips.push([tipx, top + sl, seed]);
    };
    addStal(x, len, w, 200 + k * 3);
    if (H(k, 5) > 0.68) addStal(x + (H(k, 6) > 0.5 ? 1 : -1) * (w * 0.75 + 6), len * (0.35 + H(k, 7) * 0.25), w * 0.55, 600 + k * 3);
  }
  // 后景水晶簇的岩架（depth 0.6）
  const ledge = poly([[1770, 360], [1820, 318], [1950, 300], [2100, 312], [2290, 300], [2320, 400], [2120, 392], [1950, 380], [1820, 386]], { seed: 121, amp: 3, step: 24, round: 0.6 });
  // 嵌在后墙上的石碑碎块（depth 0.5）
  const wallRubble = [[300, 430, 54, 0.3], [690, 268, 46, -0.4], [1160, 470, 60, 0.9], [1590, 350, 50, 2.1], [2060, 520, 62, -1.2], [2520, 300, 48, 0.5]];
  // —— mid：水晶柱（depth 0.85）：从石笋座里长出来、顶部并进洞顶的一根晶柱 ——
  const px = CAVE.pillar.x, pw = CAVE.pillar.w / 2;
  const pillarCap = P([[px - 380, -1700], [px + 400, -1700], [px + 300, -170], [px + 190, -30], [px + 118, 64], [px + pw + 8, 126], [px + 14, 108], [px - pw - 6, 130], [px - 108, 58], [px - 172, -36], [px - 290, -176]], 131, { amp: 5, round: 0.6 });
  const pillarBase = P([[px - 150, 940], [px - 118, 890], [px - 86, 838], [px - pw - 8, 776], [px - 6, 786], [px + pw + 10, 770], [px + 88, 830], [px + 122, 888], [px + 160, 940]], 132, { amp: 2.5, step: 20, round: 0.75 });
  const baseCoins = [[-112, 905, 0.2], [-70, 868, -0.3], [96, 878, 0.25], [128, 912, -0.15], [40, 842, 0.1], [-28, 846, -0.2]].map(([dx, y, r]) => [px + dx, y, r]);
  const yT = 96, yB = 806;
  const flare = (y) => Math.pow((y - 451) / 355, 2) * 9;
  const edgeL = (y) => px - pw - 3 * Math.sin((y - yT) * 0.012 + 0.6) - flare(y) + (H(Math.round(y), 61) - 0.5) * 3;
  const edgeR = (y) => px + pw + 4 * Math.sin((y - yT) * 0.01 + 2) + flare(y) + (H(Math.round(y), 62) - 0.5) * 3;
  const ridgeA = (y) => px - 15 + 6 * Math.sin(y * 0.013 + 0.5);
  const ridgeB = (y) => px + 21 + 5 * Math.sin(y * 0.011 + 1.7);
  const ys = []; for (let y = yT; y <= yB; y += 22) ys.push(y);
  const band = (fa, fb) => { const p = new Path2D(); p.moveTo(fa(ys[0]), ys[0]); for (const y of ys) p.lineTo(fa(y), y); for (let i = ys.length - 1; i >= 0; i--) p.lineTo(fb(ys[i]), ys[i]); p.closePath(); return p; };
  const shaft = band(edgeL, edgeR), facetL = band(edgeL, ridgeA), facetM = band(ridgeA, ridgeB), facetR = band(ridgeB, edgeR);
  const joints = new Path2D();
  for (const [y0, dy] of [[262, 18], [478, -14], [664, 16]]) { joints.moveTo(edgeL(y0), y0); joints.lineTo(ridgeA(y0 + dy * 0.4), y0 + dy * 0.4); joints.lineTo(ridgeB(y0 + dy), y0 + dy); joints.lineTo(edgeR(y0 + dy * 0.6), y0 + dy * 0.6); }
  const growths = [[-1, 214, 74, -0.62], [-1, 532, 58, -0.82], [-1, 724, 88, -0.52], [1, 168, 62, 0.62], [1, 408, 92, 0.72], [1, 642, 54, 0.56]].map(([sd, y, L, a], i) => {
    const w = L * 0.3, hw = w / 2;
    const out = poly([[-hw, 12], [-hw * 0.95, -L * 0.74], [0, -L], [hw, -L * 0.72], [hw * 0.95, 12]], { seed: 160 + i, amp: 0.5, step: 30, round: 0.05 });
    const lit = poly([[-hw, 12], [-hw * 0.95, -L * 0.74], [0, -L], [hw * 0.08, -L * 0.7], [hw * 0.1, 12]], { seed: 170 + i, amp: 0.4, step: 30, round: 0.05 });
    return { x: sd < 0 ? edgeL(y) + 6 : edgeR(y) - 6, y, a, out, lit, L };
  });
  const patches = [
    P([[px + 6, 306], [px + pw + 16, 284], [px + pw + 24, 352], [px + pw + 8, 404], [px + 28, 392], [px + 2, 344]], 141, { amp: 2, step: 16, round: 0.7 }),
    P([[px - pw - 20, 584], [px - 16, 568], [px - 4, 612], [px - 24, 654], [px - pw - 16, 662]], 142, { amp: 2, step: 16, round: 0.7 }),
  ];
  const pVeins = [
    [[px - 30, 120], [px - 24, 220], [px - 36, 330], [px - 26, 450], [px - 34, 560], [px - 28, 700], [px - 34, 790]],
    [[px + 4, 140], [px + 10, 280], [px + 0, 400], [px + 12, 540], [px + 4, 660], [px + 10, 790]],
    [[px + 34, 200], [px + 40, 320]], [[px + 38, 520], [px + 32, 600]], [[px - 6, 230], [px + 2, 300]],
  ].map((pts) => smoothPath(pts, { closed: false, tension: 0.4 }));
  const pSpark = [[px - 26, 250], [px + 30, 440], [px - 20, 610], [px + 8, 160], [px + 36, 720]];
  const capEdge = P([[px - 190, -60], [px + 200, -60], [px + 140, 60], [px + pw + 10, 132], [px + 18, 116], [px - 10, 140], [px - pw - 8, 124], [px - 120, 56]], 133, { amp: 3, step: 18, round: 0.7 });
  // —— main（depth 1）——
  const gTop = [];
  for (let x = -1500; x <= 4300; x += 24) gTop.push([x, groundAt(x) + (H(x, 11) - 0.5) * 5]);
  const ground = new Path2D(); ground.moveTo(-1500, 2000); for (const [x, y] of gTop) ground.lineTo(x, y); ground.lineTo(4300, 2000); ground.closePath();
  const strips = [0, 1, 2].map((k) => {
    const p = new Path2D(); p.moveTo(-1500, 2000);
    for (let x = -1500; x <= 4300; x += 40) p.lineTo(x, groundAt(x) + 38 + k * 52 + 9 * Math.sin(x * (0.006 + k * 0.002) + k * 1.7) + (H(x, 20 + k) - 0.5) * 6);
    p.lineTo(4300, 2000); p.closePath(); return p;
  });
  const pebbles = new Path2D(), pebHi = new Path2D();
  for (let k = 0; k < 46; k++) {
    const x = -1400 + H(k, 31) * 5600, y = groundAt(x) + 8 + H(k, 32) * 70, r = 4 + H(k, 33) * 9;
    pebbles.addPath(blob(x, y, r * 1.4, r, { seed: 300 + k, amp: 0.12, n: 14 }));
    pebHi.addPath(blob(x - r * 0.25, y - r * 0.3, r * 0.8, r * 0.38, { seed: 400 + k, amp: 0.1, n: 10 }));
  }
  const cracks = new Path2D();
  for (let k = 0; k < 12; k++) {
    let x = -1200 + H(k, 41) * 5000, y = groundAt(x) + 14 + H(k, 42) * 40;
    cracks.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += 30 + H(k, 50 + j) * 50; y += (H(k, 60 + j) - 0.45) * 16; cracks.lineTo(x, y); }
  }
  const stalags = [[-170, 130, 120], [770, 62, 74], [1525, 46, 58], [2290, 96, 96], [3000, 140, 124]].map(([x, h, w], i) => {
    const b = groundAt(x) + 12, tx = x + (H(i, 1) - 0.5) * w * 0.12;
    return {
      body: poly([[x - w / 2, b], [x - w * 0.34, b - h * 0.36], [x - w * 0.14, b - h * 0.78], [tx, b - h], [x + w * 0.16, b - h * 0.74], [x + w * 0.36, b - h * 0.32], [x + w / 2, b]], { seed: 500 + i, amp: 1.5, step: 16, round: 0.8 }),
      lit: poly([[x - w / 2, b], [x - w * 0.34, b - h * 0.36], [x - w * 0.14, b - h * 0.78], [tx, b - h], [x - w * 0.04, b - h * 0.5], [x - w * 0.12, b]], { seed: 510 + i, amp: 1, step: 16, round: 0.7 }),
      box: [x - w / 2, b - h, x + w / 2, b],
    };
  });
  const floorCoins = [];
  for (let k = 0; k < 15; k++) {
    const x = 1150 + H(k, 71) * 1250;
    floorCoins.push({ x, y: groundAt(x) + 4 + H(k, 72) * 18, stand: H(k, 73) > 0.8, rot: (H(k, 74) - 0.5) * 0.5, spin: 0.3 + H(k, 75) * 1.0, r: 7 + H(k, 76) * 3 });
  }
  const floorRubble = [];
  for (let k = 0; k < 14; k++) {
    const x = 160 + ((k + H(k, 81) * 0.8) / 14) * 2000;
    floorRubble.push({ x, size: 26 + H(k, 82) * 46, rot: (H(k, 83) - 0.5) * 1.4, seed: 700 + k, frag: H(k, 84) > 0.55 });
  }
  // —— fg（depth 1.4）——
  const fgRocks = [
    { p: P([[-400, -1600], [380, -1600], [300, -240], [190, -60], [100, 150], [40, 60], [-60, 20], [-400, 120]], 151, { amp: 5 }), box: [-400, -1600, 380, 150] },
    { p: P([[1760, -1600], [2600, -1600], [2600, 200], [2010, 110], [1930, 130], [1870, -40], [1820, -220]], 152, { amp: 5 }), box: [1760, -1600, 2600, 200] },
    { p: P([[1880, 1400], [1915, 1090], [1962, 930], [1990, 860], [2040, 935], [2085, 1120], [2140, 1400]], 153, { amp: 3, step: 26, round: 0.6 }), box: [1880, 860, 2140, 1400] },
    { p: P([[1760, 1400], [1800, 1190], [1840, 1050], [1880, 1130], [1910, 1400]], 154, { amp: 2, round: 0.6 }), box: [1760, 1050, 1910, 1400] },
    { p: blob(170, 1060, 230, 78, { seed: 155, amp: 0.05 }), box: [-60, 980, 400, 1140] },
    { p: blob(2950, 1070, 240, 80, { seed: 156, amp: 0.05 }), box: [2710, 990, 3190, 1150] },
    { p: P([[-400, 1400], [-300, 1120], [-160, 1080], [-60, 1140], [10, 1400]], 157, { amp: 3, round: 0.6 }), box: [-400, 1080, 10, 1400] },
  ];
  GEO = { masses, strata, veins, hole, holePts, treeline, hills, stars, ceiling, ceilEdge, ceilY, stalBody, stalLit, stalDark, stalTips, ledge, wallRubble, pillarCap, capEdge, pillarBase, baseCoins, shaft, facetL, facetM, facetR, joints, growths, patches, pVeins, pSpark, ground, gTop, strips, pebbles, pebHi, cracks, stalags, floorCoins, floorRubble, fgRocks };
  return GEO;
}

// ———————————————————— 水晶簇 ————————————————————
const crysCache = new Map();
function crystalGeom(n, seed) {
  const key = n + '|' + seed;
  let G = crysCache.get(key);
  if (G) return G;
  const mid = (n - 1) / 2, prisms = [];
  for (let k = 0; k < n; k++) {
    const d = k - mid;
    const big = 1 - Math.min(1, Math.abs(d) / (mid + 1)) * 0.6;
    const L = 110 * big * (0.78 + 0.34 * H(seed, k));
    const W = L * (0.25 + 0.09 * H(seed + 1, k));
    const a = d * 0.3 + (H(seed + 2, k) - 0.5) * 0.28;
    const bx = d * 15 + (H(seed + 3, k) - 0.5) * 8;
    const hw = W / 2, sh = -L * (0.72 + 0.1 * H(seed + 4, k)), tx = (H(seed + 5, k) - 0.5) * hw * 0.5;
    const rx = tx * 0.35 + hw * 0.1;
    const outline = poly([[-hw, 10], [-hw * 0.97, sh], [tx, -L], [hw, sh + L * 0.04], [hw * 0.95, 10]], { seed: seed * 7 + k, amp: 0.6, step: 30, round: 0.08 });
    const left = poly([[-hw, 10], [-hw * 0.97, sh], [tx, -L], [rx, sh * 0.96], [hw * 0.08, 10]], { seed: seed * 7 + k + 50, amp: 0.4, step: 30, round: 0.05 });
    const ridge = new Path2D(); ridge.moveTo(tx, -L); ridge.lineTo(rx, sh * 0.96); ridge.lineTo(hw * 0.08, 8);
    const edge = new Path2D(); edge.moveTo(-hw * 0.94, 4); edge.lineTo(-hw * 0.92, sh); edge.lineTo(tx - 0.5, -L + 2);
    prisms.push({ a, bx, L, W, outline, left, ridge, edge, order: Math.abs(d), tip: [tx, -L] });
  }
  prisms.sort((p, q) => q.order - p.order);
  const tall = prisms.reduce((b, p) => (p.L > b.L ? p : b));
  const base = blob(0, 6, n * 11 + 16, 13, { seed: seed + 99, amp: 0.08, n: 20 });
  G = { prisms, tall, base };
  crysCache.set(key, G);
  return G;
}

/**
 * 水晶簇。锚点 = 底座中心（落在地 / 墙上的点）。s=1 时最高一根约 110px。
 * o: { x, y, s=1, n=5（晶柱数）, seed, rot（整簇倾斜，弧度）, lit 0..1（自身发光 / 明度）, glow（光晕强度，默认 = lit）,
 *      color=PAL.crystal, light（环境亮度，压暗底座岩石）, ring（-1 无；0..1 = glint 扩散光环进度）, t, base=true, alpha }
 */
export function drawCrystal(g, o = {}) {
  const { x = 0, y = 0, s = 1, n = 5, seed = 1, rot = 0, lit = 1, color = PAL.crystal, light = 1, ring = -1, t = 0, base = true, alpha = 1 } = o;
  const gl = clamp(o.glow ?? lit);
  const G = crystalGeom(n, seed);
  const L1 = clamp(lit);
  const ambC = Math.max(light, L1);
  const lf = dimc(mixHex(mixHex(color, PAL.dragonDeep, 0.8), mixHex(color, PAL.white, 0.45), L1), ambC);
  const df = dimc(mixHex(mixHex(color, PAL.dragonDeep, 0.9), mixHex(color, PAL.dragonDeep, 0.38), L1), ambC);
  const rockC = dimc(mixHex(PAL.dragonDeep, PAL.dragonDark, 0.45), Math.max(light, L1 * 0.5));
  g.save();
  g.translate(x, y);
  if (alpha !== 1) g.globalAlpha *= alpha;
  g.scale(s, s);
  if (gl > 0.02) glow(g, 0, -G.tall.L * 0.45, G.tall.L * 1.35, color, 0.42 * gl);
  g.save();
  g.rotate(rot);
  for (const p of G.prisms) {
    g.save();
    g.translate(p.bx, 0);
    g.rotate(p.a);
    under(g, p.outline, 3, 0.32);
    g.fillStyle = df; g.fill(p.outline);
    g.fillStyle = lf; g.fill(p.left);
    if (L1 > 0.05) {
      g.fillStyle = lin(g, 0, 10, 0, -p.L, [[0, rgba(PAL.white, 0.0)], [0.55, rgba(PAL.white, 0.0)], [1, rgba(PAL.white, 0.35 * L1)]]);
      g.fill(p.outline);
      g.fillStyle = lin(g, 0, 10, 0, -p.L * 0.6, [[0, rgba(color, 0.55 * L1)], [1, rgba(color, 0)]]);
      g.fill(p.outline);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 1.4; g.strokeStyle = rgba(PAL.white, (0.25 + 0.45 * L1) * ambC); g.stroke(p.ridge);
    g.lineWidth = 1.8; g.strokeStyle = rgba(PAL.white, (0.15 + 0.5 * L1) * ambC); g.stroke(p.edge);
    g.restore();
  }
  g.restore();
  if (base === 'socket') {
    // 墙上的晶簇：只在根部压一道暗色石缝
    g.fillStyle = rgba(PAL.shadow, 0.5); g.fill(blob(2, 8, n * 9 + 10, 8, { seed: seed + 98, amp: 0.15, n: 16 }));
  } else if (base) {
    under(g, G.base, 3, 0.35);
    cut(g, G.base, rockC, { rim: dimc(mixHex(PAL.dragonWing, color, 0.4), Math.max(light, L1)), rimW: 1.8 });
  }
  if (gl > 0.3) {
    const tw = Math.pow(Math.max(0, Math.sin(t * 1.7 + seed * 2.3)), 14);
    if (tw > 0.02) {
      const tp = G.tall;
      const ca = Math.cos(rot + tp.a), sa = Math.sin(rot + tp.a);
      const tx = tp.bx * Math.cos(rot) + tp.tip[0] * ca - tp.tip[1] * sa, ty = tp.bx * Math.sin(rot) + tp.tip[0] * sa + tp.tip[1] * ca;
      sparkle(g, tx, ty, 13 * tw * gl, { color: PAL.white, alpha: tw * gl, rot: 0.3 });
    }
  }
  if (ring >= 0 && ring < 1) {
    for (const [k, d] of [[0, 0], [1, 0.22]]) {
      const p = clamp((ring - d) / (1 - d));
      if (p <= 0 || p >= 1) continue;
      g.lineWidth = 6 * (1 - p) + 1; g.strokeStyle = rgba(color, 0.65 * (1 - p) * (k ? 0.6 : 1));
      g.beginPath(); g.ellipse(0, -40, 40 + p * 360, (40 + p * 360) * 0.8, 0, 0, TAU); g.stroke();
    }
  }
  g.restore();
}

/** 单根钟乳石（洞顶掉落用）。锚点 = 顶部挂点。o: { x, y, len=120, w=34, seed, light, alpha, rot } */
export function drawStalactite(g, o = {}) {
  const { x = 0, y = 0, len = 120, w = 34, seed = 1, light = 1, alpha = 1, rot = 0 } = o;
  const tip = (H(seed, 4) - 0.5) * w * 0.35;
  const body = poly([[-w / 2, 0], [w / 2, 0], [w * 0.16, len * 0.72], [tip, len], [-w * 0.14, len * 0.66]], { seed, amp: 1.4, step: 22, round: 0.55 });
  const lit = poly([[-w / 2, 0], [-w * 0.05, 0], [tip - w * 0.02, len * 0.95], [-w * 0.14, len * 0.66]], { seed: seed + 1, amp: 1, step: 22, round: 0.5 });
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (alpha !== 1) g.globalAlpha *= alpha;
  under(g, body, 3, 0.35);
  g.fillStyle = dimc(mixHex(PAL.dragonDeep, PAL.dragonDark, 0.5), light); g.fill(body);
  g.fillStyle = dimc(mixHex(PAL.dragonDark, PAL.dragonWing, 0.35), light); g.fill(lit);
  g.restore();
}

// ———————————————————— 各层 ————————————————————
function crysLayer(g, T, list, LS, P, light) {
  for (const c of list) {
    const lev = LS.lev(c.id);
    drawCrystal(g, { x: c.x, y: c.y, s: c.s, n: c.n, seed: c.seed, rot: c.rot, lit: lev, glow: lev, light, ring: LS.ring(c.id), t: T, base: c.layer === 'back' ? 'socket' : true });
  }
}

function rubbleChunk(g, x, y, size, rot, seed, heat, T, o = {}) {
  const pts = [];
  const n = 5 + Math.floor(H(seed, 1) * 2);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (H(seed, i + 2) - 0.5) * 0.7; const r = size * (0.38 + H(seed, i + 9) * 0.2); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.78]); }
  const p = poly(pts, { seed, amp: size * 0.03, step: size * 0.3, round: 0.15 });
  const face = mixHex(PAL.stone2, PAL.dragonDark, 0.4);
  const fl = 0.8 + 0.2 * noise1(T * 4 + seed, 3);
  g.save(); g.translate(x, y); g.rotate(rot);
  under(g, p, size * 0.08, 0.4);
  g.fillStyle = dimc(face, o.light ?? 1); g.fill(p);
  shade(g, p, PAL.dragonDeep, size * 0.4, size * 0.3, -size * 0.3, -size * 0.4, 0.45, 0);
  g.save(); g.clip(p); g.translate(0, size * 0.03); g.lineWidth = size * 0.05; g.strokeStyle = rgba(mixHex(PAL.stone, PAL.white, 0.2), 0.5 * (o.light ?? 1)); g.stroke(p); g.restore();
  if (o.frag) {
    g.save(); g.clip(p);
    paperGlyph(g, o.frag, size * (H(seed, 30) - 0.5) * 0.6, size * (H(seed, 31) - 0.5) * 0.5, size * 1.15, { style: 'stone', glow: heat * fl, fill: PAL.dragonDeep });
    g.restore();
  }
  // 裂缝里的余烬
  const hotC = mixHex(PAL.redDeep, PAL.fire2, heat), lw = size * 0.05;
  g.save(); g.clip(p); g.lineCap = 'round';
  const q = (k) => (H(seed, 40 + k) - 0.5) * size;
  g.beginPath(); g.moveTo(-size * 0.34, q(1) * 0.4); g.lineTo(q(2) * 0.3, q(3) * 0.3); g.lineTo(size * 0.12 + q(4) * 0.2, -size * 0.12 + q(5) * 0.2); g.lineTo(size * 0.34, q(6) * 0.4);
  if (H(seed, 47) > 0.4) { g.moveTo(q(2) * 0.3, q(3) * 0.3); g.lineTo(q(7) * 0.3, size * 0.3); }
  g.strokeStyle = rgba(PAL.shadow, 0.8); g.lineWidth = lw * 1.6; g.stroke();
  g.strokeStyle = rgba(hotC, (0.45 + 0.55 * heat) * fl); g.lineWidth = lw * 0.8; g.stroke();
  g.restore();
  glow(g, 0, 0, size * (0.8 + heat * 0.9), heat > 0.4 ? PAL.fire : PAL.fireDeep, (0.18 + 0.4 * heat) * fl);
  g.restore();
}

function rubbleState(o, T) {
  const r = o.rubble;
  if (!r) return null;
  const at = r.at ?? 120.97;
  if (T < at + 0.4) return null;
  return { at, heat: 1 - clamp(r.cooled ?? 0) };
}
const DRAGON_CHARS = charsOf('dragon');

function scorchMarks(g, T, c, o) {
  for (const sc of o.scorch || []) {
    const life = T - sc.at;
    if (life < 0 || life > 2.4) continue;
    const [x, y] = sc.screen ? unproj(c, 0.5, sc.x, sc.y, o) : [sc.x, sc.y];
    const size = sc.size ?? 110;
    const flash = 1 - seg(life, 0.05, 0.45), fade = 1 - seg(life, 0.6, 2.4);
    g.save();
    glow(g, x, y, size * 1.6, PAL.fire, 0.75 * flash);
    paperGlyph(g, sc.ch, x + 3, y + 4, size, { family: 'display', fill: rgba(PAL.shadow, 0.55 * fade), edge: null, rot: sc.rot || 0 });
    if (flash > 0) paperGlyph(g, sc.ch, x, y, size, { style: 'fire', alpha: flash, rot: sc.rot || 0 });
    else paperGlyph(g, sc.ch, x, y, size, { family: 'display', fill: rgba(mixHex(PAL.fireDeep, PAL.redDeep, seg(life, 0.45, 1.6)), 0.85 * fade), edge: null, rot: sc.rot || 0 });
    g.restore();
  }
}

function backLayer(g, T, c, o, LS, C) {
  const G = geo();
  g.save();
  enter(g, c, 0.5, o);
  // 洞底最深处
  g.fillStyle = lin(g, 0, -300, 0, 1100, [[0, C.ceil], [0.35, C.rock0], [0.75, mixHex(C.rock0, C.rock1, 0.5)], [1, C.rock0]]);
  g.fillRect(-1700, -1700, 6200, 3600);
  // 洞心更深：笼子后面压暗，让金笼与龙从暗处跳出来
  g.fillStyle = rad(g, 1260, 460, 0, 820, [[0, rgba(PAL.shadow, 0.28 * LS.amb)], [1, rgba(PAL.shadow, 0)]]);
  g.fillRect(300, -400, 1900, 1500);
  // 夜空洞口（先画天，再画四周岩体）
  g.save();
  g.clip(G.hole);
  const w = LS.dawn;
  g.fillStyle = lin(g, 0, 330, 0, 905, w > 0
    ? [[0, mixHex(PAL.skyNight, PAL.princessLight, w)], [0.55, mixHex(PAL.skyNight, PAL.goldLight, w)], [1, mixHex(PAL.mountainDark, PAL.skyDusk, w)]]
    : [[0, PAL.skyNightHigh], [0.6, PAL.skyNight], [1, mixHex(PAL.skyNight, PAL.mountainDark, 0.6)]]);
  g.fillRect(-400, 300, 600, 650);
  if (w < 1) for (const [i, [sx, sy]] of G.stars.entries()) sparkle(g, sx, sy, 3 + 3 * H(i, 1), { color: PAL.moon, alpha: (0.5 + 0.5 * Math.sin(T * 1.3 + i * 2.1)) * (1 - w), rot: 0.4 });
  if (w > 0) glow(g, -60, 900, 520, PAL.goldLight, 0.9 * w);
  g.fillStyle = mixHex(PAL.mountainDark, PAL.skyNightHigh, 0.35); g.fill(G.hills);
  g.fillStyle = mixHex(PAL.forestDeep, PAL.skyNightHigh, 0.45); g.fill(G.treeline);
  g.restore();
  // 岩体（挖掉洞口）
  g.save();
  const outsideHole = new Path2D(); outsideHole.rect(-1700, -1700, 6200, 3600); outsideHole.addPath(G.hole);
  g.clip(outsideHole, 'evenodd');
  for (const m of G.masses) piece(g, m.p, C[m.tone], { lift: 8, rim: rgba(C.rim, 0.32), rimW: 3, box: m.box, shadeA: 0.28 });
  // 洞口岩框（压住岩体，内缘一道月光 / 晨光）
  g.lineJoin = 'round';
  g.lineWidth = 84; g.strokeStyle = C.rock2; g.stroke(G.hole);
  g.lineWidth = 12; g.strokeStyle = rgba(w > 0 ? mixHex(PAL.moonGlow, PAL.goldLight, w) : mixHex(PAL.moonGlow, PAL.skyDayLow, 0.5), 0.35 + 0.45 * w); g.stroke(G.hole);
  g.save(); g.clip(G.hole); g.lineWidth = 10; g.strokeStyle = rgba(PAL.shadow, 0.35); g.translate(4, 8); g.stroke(G.hole); g.restore();
  // 岩层纹
  g.lineCap = 'round';
  for (const s of G.strata) { g.lineWidth = 3; g.strokeStyle = rgba(C.rim, 0.22); g.stroke(s); g.save(); g.translate(2, 4); g.strokeStyle = rgba(PAL.shadow, 0.25); g.stroke(s); g.restore(); }
  // 石碑碎块嵌在后墙上
  const rb = rubbleState(o, T);
  if (rb) G.wallRubble.forEach(([x, y, sz, rot], k) => {
    const tk = rb.at + 0.45 + k * 0.03;
    if (T < tk) return;
    const pop = 1 + 0.25 * hit(T, tk, 0.08);
    g.save(); g.translate(x, y); g.scale(pop, pop);
    g.fillStyle = rgba(PAL.shadow, 0.45); g.fill(blob(4, 6, sz * 0.75, sz * 0.6, { seed: 800 + k, amp: 0.12 }));
    rubbleChunk(g, 0, 0, sz, rot, 820 + k, rb.heat, T, { frag: DRAGON_CHARS[(k * 5) % 13], light: LS.amb });
    g.restore();
  });
  scorchMarks(g, T, c, o);
  g.restore();
  // 洞顶 + 钟乳石
  under(g, G.ceiling, 10, 0.35);
  g.fillStyle = C.ceil; g.fill(G.ceiling);
  g.lineWidth = 4; g.strokeStyle = rgba(C.rim, 0.28); g.save(); g.translate(0, -3); g.stroke(G.ceilEdge); g.restore();
  under(g, G.stalBody, 5, 0.35);
  g.fillStyle = C.stal; g.fill(G.stalBody);
  g.fillStyle = C.stalHi; g.fill(G.stalLit);
  g.fillStyle = rgba(PAL.shadow, 0.3); g.fill(G.stalDark);
  if (LS.amb > 0.3) {
    for (const [x, y, sd] of G.stalTips) if (H(sd, 7) > 0.72) { g.fillStyle = rgba(PAL.crystal, 0.55 * LS.amb); g.beginPath(); g.ellipse(x, y + 4, 2.2, 3, 0, 0, TAU); g.fill(); }
  }
  // 暗：整层正片叠底压到近黑（后墙层不透明，可以整片叠）；水晶在这之后画，保持自发光
  if (LS.amb < 0.6) {
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgba(PAL.ink, darkK(LS.amb)); g.fillRect(-1700, -1700, 6200, 3600);
    g.restore();
  }
  // 晶脉 + 墙上水晶
  g.save(); g.clip(outsideHole);
  g.lineCap = 'round';
  for (const v of G.veins) {
    const lev = LS.lev(v.owner);
    g.lineWidth = 14; g.strokeStyle = rgba(PAL.crystal, 0.07 * lev); g.stroke(v.path);
    g.save(); g.translate(1.5, 2.5); g.fillStyle = rgba(PAL.shadow, 0.35 * Math.max(LS.amb, lev)); g.fill(v.band); g.restore();
    g.fillStyle = rgba(mixHex(PAL.crystal, PAL.dragonDeep, 0.8 - 0.55 * lev), (0.3 + 0.45 * lev) * Math.max(LS.amb, lev)); g.fill(v.band);
  }
  crysLayer(g, T, CRYSTALS.filter((k) => k.layer === 'back'), LS, null, LS.amb);
  g.restore();
  // 光：战斗左冷右暖 / 黎明洞口光
  if (LS.cool > 0) { glow(g, -150, 480, 1300, PAL.magic, 0.3 * LS.cool); glow(g, -100, 560, 650, PAL.crystal, 0.14 * LS.cool); }
  if (LS.warm > 0) {
    const fl = 0.85 + 0.15 * noise1(T * 6.3, 9);
    glow(g, 2150, 620, 1350, PAL.fire, 0.34 * LS.warm * fl); glow(g, 2050, 760, 700, PAL.fire2, 0.16 * LS.warm * fl);
  }
  if (w > 0) { glow(g, 0, 620, 900, PAL.princessLight, 0.45 * w); glow(g, 900, 700, 1500, PAL.goldLight, 0.12 * w); }
  g.restore();
  // 后景水晶簇（depth 0.6，长在右上岩架上）
  g.save();
  enter(g, c, 0.6, o);
  piece(g, G.ledge, C.rock2, { lift: 6, rim: rgba(C.rim, 0.55), rimW: 3, box: [1770, 300, 2320, 400] });
  crysLayer(g, T, [CRYS_BY_ID.bc], LS, null, LS.amb);
  g.restore();
}

function pillar(g, T, LS, C) {
  const G = geo();
  const lev = LS.lev('pl');
  const px = CAVE.pillar.x;
  const amb = Math.max(LS.amb, lev);
  if (lev > 0.02) glow(g, px, 450, 470, PAL.crystal, 0.16 * lev);
  // 顶部岩体（先画大块，晶柱顶端再被下沿压住）
  piece(g, G.pillarCap, C.ceil, { lift: 8, box: [px - 400, -1700, px + 420, 150], shadeA: 0.3 });
  // 晶体三面（左亮、中、右暗），偏深的青色，和紫色洞壁调和
  const k = lev;
  const lt = dimc(mixHex(mixHex(PAL.crystal, PAL.dragonDeep, 0.84), mixHex(PAL.crystal, PAL.dragonDark, 0.26), k), amb);
  const md = dimc(mixHex(mixHex(PAL.crystal, PAL.dragonDeep, 0.88), mixHex(PAL.crystal, PAL.dragonDark, 0.5), k), amb);
  const dk = dimc(mixHex(mixHex(PAL.crystal, PAL.dragonDeep, 0.92), mixHex(PAL.crystal, PAL.dragonDeep, 0.7), k), amb);
  for (const gr of G.growths) {
    g.save(); g.translate(gr.x, gr.y); g.rotate(gr.a);
    under(g, gr.out, 3, 0.3);
    g.fillStyle = dk; g.fill(gr.out); g.fillStyle = lt; g.fill(gr.lit);
    g.strokeStyle = rgba(PAL.white, (0.12 + 0.35 * k) * amb); g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -gr.L); g.lineTo(0, 10); g.stroke();
    g.restore();
  }
  under(g, G.shaft, 8, 0.35);
  g.fillStyle = md; g.fill(G.facetM);
  g.fillStyle = lt; g.fill(G.facetL);
  g.fillStyle = dk; g.fill(G.facetR);
  g.save(); g.clip(G.shaft);
  g.fillStyle = lin(g, 0, 96, 0, 806, [[0, rgba(PAL.dragonDeep, 0.35)], [0.25, rgba(PAL.crystal, 0)], [0.75, rgba(PAL.crystal, 0.12 * k)], [1, rgba(PAL.crystal, 0.3 * k)]]);
  g.fillRect(px - 120, 80, 240, 740);
  g.lineCap = 'round';
  for (const v of G.pVeins) { g.lineWidth = 9; g.strokeStyle = rgba(PAL.crystal, 0.08 * k); g.stroke(v); g.lineWidth = 2; g.strokeStyle = rgba(mixHex(PAL.crystal, PAL.white, 0.45), (0.1 + 0.5 * k) * amb); g.stroke(v); }
  g.lineWidth = 3; g.strokeStyle = rgba(PAL.shadow, 0.35); g.save(); g.translate(1, 3); g.stroke(G.joints); g.restore();
  g.lineWidth = 1.8; g.strokeStyle = rgba(mixHex(PAL.crystal, PAL.white, 0.5), (0.2 + 0.4 * k) * amb); g.stroke(G.joints);
  g.restore();
  g.save(); g.clip(G.shaft); g.translate(3, 0); g.lineWidth = 2.2; g.strokeStyle = rgba(PAL.white, (0.15 + 0.35 * k) * amb); g.stroke(G.facetL); g.restore();
  // 晶体部分按自身亮度压暗（glint 时先亮的晶柱不被环境暗压住）
  const crysP = new Path2D(); crysP.addPath(G.shaft);
  for (const gr of G.growths) crysP.addPath(gr.out, new DOMMatrix().translate(gr.x, gr.y).rotate((gr.a * 180) / Math.PI));
  darken(g, crysP, amb);
  // 顶端压一圈岩体下沿、底部石笋座（座上撒几枚金币）
  piece(g, G.capEdge, C.ceil, { lift: 6, rim: rgba(C.rim, 0.35), rimW: 2.4, box: [px - 190, -60, px + 200, 140], shadeA: 0.25 });
  piece(g, G.pillarBase, C.rock3, { lift: 6, rim: rgba(C.rim, 0.55), rimW: 2.6, box: [px - 150, 770, px + 160, 940], shadeA: 0.45 });
  const rockP = new Path2D(); rockP.addPath(G.pillarCap); rockP.addPath(G.capEdge); rockP.addPath(G.pillarBase);
  darken(g, rockP, LS.amb);
  for (const [i, [x, y]] of G.pSpark.entries()) {
    const tw = Math.pow(Math.max(0, Math.sin(T * 1.3 + i * 2.17)), 10) * k;
    if (tw > 0.03) sparkle(g, x, y, 12 * tw, { color: PAL.white, alpha: tw, rot: 0.3 });
  }
  if (k > 0.05) ellGlow(g, px, 778, 80, 20, PAL.crystal, 0.3 * k);
  const cl = Math.max(0.03, LS.amb);
  for (const [x, y, r] of G.baseCoins) drawCoin(g, { x, y, r: 9, spin: 1.15 + r, rot: r, light: cl });
  if (LS.warm > 0) { const fl = 0.85 + 0.15 * noise1(T * 6.3, 9); glow(g, px + 70, 520, 260, PAL.fire, 0.28 * LS.warm * fl); }
}

function midLayer(g, T, c, o, LS, C) {
  // 金币堆（depth 0.8）
  g.save();
  enter(g, c, CAVE.coinPile.depth, o);
  const cp = CAVE.coinPile;
  drawCoinPile(g, { x: cp.x, y: cp.y, w: cp.w, h: cp.h, peak: cp.peakRel, seed: 7, sparkleT: T, light: Math.max(0.04, LS.amb * (1 - 0.1 * LS.dawn)), glint: 0.25 + 0.75 * LS.amb });
  darken(g, coinPileShape({ x: cp.x, y: cp.y, w: cp.w, h: cp.h, peak: cp.peakRel, seed: 7 }), LS.amb);
  if (LS.warm > 0) glow(g, 1900, 820, 420, PAL.fire, 0.22 * LS.warm);
  g.restore();
  // 水晶柱（depth 0.85）
  g.save();
  enter(g, c, CAVE.pillar.depth, o);
  pillar(g, T, LS, C);
  g.restore();
  // 黎明光束：从洞口（depth 0.5）斜射到地面（depth 1），在屏幕坐标里画
  if (LS.dawn > 0) dawnBeam(g, T, c, o, LS.dawn);
}

function dawnBeam(g, T, c, o, d) {
  const sweep = outCubic(clamp(d));
  const A = proj(c, 0.5, 60, 395, o), B = proj(c, 0.5, 140, 760, o);
  const xa = 260 + 320 * sweep, xb = 700 + 1900 * sweep;
  const F1 = proj(c, 1, xa, groundAt(xa), o), F2 = proj(c, 1, xb, groundAt(xb), o);
  g.save();
  g.globalCompositeOperation = 'screen';
  const quad = (k, a) => {
    const lerpP = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
    const cA = lerpP(A, B, -k * 0.25), cB = lerpP(B, A, -k * 0.25), cF1 = lerpP(F1, F2, -k * 0.18), cF2 = lerpP(F2, F1, -k * 0.18);
    const p = new Path2D(); p.moveTo(cA[0], cA[1]); p.lineTo(cF2[0], cF2[1]); p.lineTo(cF1[0], cF1[1]); p.lineTo(cB[0], cB[1]); p.closePath();
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], far = [(F1[0] + F2[0]) / 2, (F1[1] + F2[1]) / 2];
    g.fillStyle = lin(g, mid[0], mid[1], far[0], far[1], [[0, rgba(PAL.princessLight, a)], [0.55, rgba(PAL.goldLight, a * 0.6)], [1, rgba(PAL.goldLight, 0)]]);
    g.fill(p);
  };
  const k0 = o._beamK ?? 1;
  for (let q = 0; q < 7; q++) quad(1.4 - q * 0.22, 0.1 * d * k0);
  // 光束里的浮尘
  for (let i = 0; i < (k0 < 1 ? 0 : 26); i++) {
    const u = fract(H(i, 1) + T * (0.02 + 0.03 * H(i, 2))), v = H(i, 3);
    const top = [lerp(A[0], F2[0], u), lerp(A[1], F2[1], u)], bot = [lerp(B[0], F1[0], u), lerp(B[1], F1[1], u)];
    const x = lerp(top[0], bot[0], v) + Math.sin(T * 0.7 + i) * 6, y = lerp(top[1], bot[1], v) + Math.cos(T * 0.5 + i * 1.3) * 6;
    const tw = 0.5 + 0.5 * Math.sin(T * 2 + i * 2.7);
    g.fillStyle = rgba(PAL.goldLight, 0.6 * d * tw * (1 - u * 0.6));
    g.beginPath(); g.arc(x, y, 1.6 + H(i, 4) * 2.2, 0, TAU); g.fill();
  }
  g.restore();
}

function mainLayer(g, T, c, o, LS, C) {
  const G = geo();
  g.save();
  enter(g, c, 1, o);
  // 地面
  under(g, G.ground, 8, 0.3);
  g.fillStyle = lin(g, 0, 880, 0, 1300, [[0, C.groundTop], [0.12, C.ground], [1, C.groundLo]]);
  g.fill(G.ground);
  g.save(); g.clip(G.ground); g.translate(0, 3); g.lineWidth = 5; g.strokeStyle = rgba(C.rim, 0.55); g.stroke(G.ground); g.restore();
  G.strips.forEach((p, k) => {
    under(g, p, 5, 0.3);
    g.fillStyle = mixHex(C.ground, C.groundLo, 0.25 + k * 0.25); g.fill(p);
    g.save(); g.clip(p); g.translate(0, 2.5); g.lineWidth = 3; g.strokeStyle = rgba(C.rim, 0.16 - k * 0.04); g.stroke(p); g.restore();
  });
  g.lineWidth = 2; g.strokeStyle = rgba(PAL.shadow, 0.4); g.lineJoin = 'round'; g.stroke(G.cracks);
  g.save(); g.translate(1.5, 3); g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(G.pebbles); g.restore();
  g.fillStyle = mixHex(C.ground, C.groundTop, 0.55); g.fill(G.pebbles);
  g.fillStyle = rgba(C.rim, 0.35); g.fill(G.pebHi);
  // 小石笋
  for (const s of G.stalags) { piece(g, s.body, mixHex(C.ground, C.groundTop, 0.6), { lift: 4, box: s.box, shadeA: 0.4 }); g.fillStyle = rgba(C.rim, 0.3); g.fill(s.lit); }
  if (LS.amb < 0.6) { const sol = new Path2D(); sol.addPath(G.ground); for (const s of G.stalags) sol.addPath(s.body); darken(g, sol, LS.amb); }
  // 散落的金币
  const coinL = Math.max(0.03, LS.amb);
  for (const k of G.floorCoins) {
    if (k.stand) { drawCoin(g, { x: k.x, y: k.y - k.r * 0.9, r: k.r * 1.1, spin: k.spin, rot: k.rot, light: coinL }); continue; }
    g.fillStyle = rgba(PAL.shadow, 0.35); g.beginPath(); g.ellipse(k.x + 1.5, k.y + 2.5, k.r * 1.25, k.r * 0.42, k.rot * 0.2, 0, TAU); g.fill();
    g.fillStyle = dimc(mixHex(PAL.coinDark, PAL.woodDark, 0.3), coinL); g.beginPath(); g.ellipse(k.x, k.y + 1.6, k.r * 1.25, k.r * 0.42, k.rot * 0.2, 0, TAU); g.fill();
    g.fillStyle = dimc(PAL.coin, coinL); g.beginPath(); g.ellipse(k.x, k.y, k.r * 1.25, k.r * 0.42, k.rot * 0.2, 0, TAU); g.fill();
    g.strokeStyle = dimc(PAL.goldLight, coinL); g.lineWidth = 1.2; g.beginPath(); g.ellipse(k.x, k.y, k.r, k.r * 0.3, k.rot * 0.2, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  }
  // 地面水晶
  crysLayer(g, T, CRYSTALS.filter((k) => k.layer === 'main'), LS, null, LS.amb);
  for (const k of CRYSTALS.filter((q) => q.layer === 'main')) ellGlow(g, k.x, k.y + 6, 220 * k.s, 46 * k.s, PAL.crystal, 0.3 * LS.lev(k.id));
  // 鸟笼吊链
  if (o.chain !== false) {
    const sw = o.cageSwing || 0;
    const [hx, hy] = CAVE.cage.hook;
    const ringRel = [0, CAVE.cage.ring[1] - hy];
    const end = [hx + ringRel[0] * Math.cos(sw) - ringRel[1] * Math.sin(sw), hy + ringRel[0] * Math.sin(sw) + ringRel[1] * Math.cos(sw)];
    const tops = [unproj(c, 1, 0, 0, o)[1], unproj(c, 1, 1920, 0, o)[1], unproj(c, 1, 960, 0, o)[1]];
    const top = Math.max(-1400, Math.min(...tops) - 40);
    const pts = top < hy ? [[hx, top], [hx, hy], end] : [[hx, hy], end];
    drawChain(g, pts, { light: Math.max(0.15, LS.amb) });
  }
  // 地上的石碑碎块
  const rb = rubbleState(o, T);
  if (rb) G.floorRubble.forEach((r, k) => {
    const tk = rb.at + 0.4 + k * 0.025;
    if (T < tk) return;
    const fall = 1 - clamp((T - tk) / 0.22);
    const y = groundAt(r.x) - r.size * 0.28 - 380 * fall * fall;
    rubbleChunk(g, r.x, y, r.size, r.rot + fall * 2, r.seed, rb.heat, T, { frag: r.frag ? DRAGON_CHARS[k % 13] : null, light: LS.amb });
  });
  // 地面光
  if (LS.cool > 0) glow(g, 250, 930, 700, PAL.magic, 0.22 * LS.cool);
  if (LS.warm > 0) { const fl = 0.85 + 0.15 * noise1(T * 6.3, 9); glow(g, 1750, 930, 800, PAL.fire, 0.26 * LS.warm * fl); }
  g.restore();
  if (LS.dawn > 0) {
    // 地上的晨光光斑（屏幕坐标里画成跟光束同宽的椭圆）
    const d = LS.dawn, sweep = outCubic(d);
    const xa = 260 + 320 * sweep, xb = 700 + 1900 * sweep;
    const F1 = proj(c, 1, xa, groundAt(xa), o), F2 = proj(c, 1, xb, groundAt(xb), o);
    const cx = (F1[0] + F2[0]) / 2, cy = (F1[1] + F2[1]) / 2, rx = Math.abs(F2[0] - F1[0]) * 0.6 + 60;
    ellGlow(g, cx, cy + 10, rx, Math.max(40, rx * 0.12), PAL.goldLight, 0.4 * d);
    ellGlow(g, F1[0] + 80, F1[1] + 6, 260, 40, PAL.princessLight, 0.35 * d);
  }
}

function fgLayer(g, T, c, o, LS, C) {
  const G = geo();
  g.save();
  enter(g, c, 1.4, o);
  for (const r of G.fgRocks) {
    piece(g, r.p, C.fg, { lift: 0, box: r.box, shadeA: 0.3 });
    g.save(); g.clip(r.p); g.translate(0, 3); g.lineWidth = 4; g.strokeStyle = rgba(C.rim, 0.25 * Math.max(0.3, LS.amb)); g.stroke(r.p); g.restore();
  }
  if (LS.amb < 0.6) { const sol = new Path2D(); for (const r of G.fgRocks) sol.addPath(r.p); darken(g, sol, LS.amb); }
  crysLayer(g, T, CRYSTALS.filter((k) => k.layer === 'fg'), LS, null, Math.min(1, LS.amb * 0.7));
  if (LS.warm > 0) glow(g, 1990, 950, 380, PAL.fire, 0.2 * LS.warm);
  if (LS.dawn > 0) glow(g, 300, 900, 600, PAL.princessLight, 0.16 * LS.dawn);
  g.restore();
  if (LS.dawn > 0) dawnBeam(g, T, c, { ...o, _beamK: 0.45 }, LS.dawn);
}

/** flat 模式整体降饱和到 0.9（只在一次画全部层时做；背景片全屏不透明，所以可以整屏 saturation 混合）。 */
function flatWash(g, c, o) {
  g.save();
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = rgba(PAL.stone2, 0.1);
  const a = unproj(c, 1, -40, -40, { flat: false }), b = unproj(c, 1, 1960, 1120, { flat: false });
  applyCam(g, c, 1);
  g.fillRect(Math.min(a[0], b[0]) - 200, Math.min(a[1], b[1]) - 200, Math.abs(b[0] - a[0]) + 400, Math.abs(b[1] - a[1]) + 400);
  g.restore();
}

/**
 * 龙洞。g 为调用坐标系（通常 = 屏幕，镜头不要先 applyCam）；c 为机位（默认 CV_W）。
 * o: { layer:'back'|'mid'|'main'|'fg'（不传 = 四层一起画，flat 时就是“合成一层”的背景片）,
 *      light:'dark'|'glint'|'lit'|'battle'|'dawn' 或 {from,to,k}, glintAt, glintC:[x,y], glintSpeed, dawnP 0..1,
 *      flat（冻结视差：各层按 flatRef 机位（默认 STANDOFF.cam）摆好后当成一张平面卡，再按 c 的 depth 1 整体变换；sat 0.9）, flatRef,
 *      rubble:{ at=120.97, cooled 0..1 }, scorch:[{ ch, x, y, at, size=110, rot, screen }], chain=true（鸟笼吊链）, cageSwing（弧度）, fg（flat 时是否含前景层，默认 false：前景晶簇在 STANDOFF 机位下会落到勇者脚边） }
 * 返回 { cage, ring, lock, hook, pilePeak, pillarX, hero }：关键点在调用坐标系里的位置。
 */
export function drawCave(g, T, c = CAMS.CV_W, o = {}) {
  const LS = lightState(o, T);
  const C = palette(LS);
  const layers = o.layer ? [o.layer] : o.flat && !o.fg ? ['back', 'mid', 'main'] : ['back', 'mid', 'main', 'fg'];
  g.save();
  for (const L of layers) {
    if (L === 'back') backLayer(g, T, c, o, LS, C);
    else if (L === 'mid') midLayer(g, T, c, o, LS, C);
    else if (L === 'main') mainLayer(g, T, c, o, LS, C);
    else if (L === 'fg') fgLayer(g, T, c, o, LS, C);
  }
  if (o.flat && !o.layer) flatWash(g, c, o);
  g.restore();
  return {
    cage: proj(c, 1, CAVE.cage.x, CAVE.cage.y, o), ring: proj(c, 1, CAVE.cage.ring[0], CAVE.cage.ring[1], o), lock: proj(c, 1, CAVE.cage.lock[0], CAVE.cage.lock[1], o),
    hook: proj(c, 1, CAVE.cage.hook[0], CAVE.cage.hook[1], o), pilePeak: proj(c, 0.8, CAVE.coinPile.peak[0], CAVE.coinPile.peak[1], o),
    pillarX: proj(c, 0.85, CAVE.pillar.x, 500, o)[0], hero: proj(c, 1, CAVE.hero.x, CAVE.hero.y, o),
  };
}

// ———————————————————— D3 名字墙 ————————————————————
/** 名字墙槽位（世界坐标，depth 1）。CV_LOW（不计滚转）下正好是屏幕 8 块 160×160（底 y≈925，x 320–1600）+ 5 块 230×230（底 y=765，x 385–1535）。 */
export const NAME_WALL = (() => {
  const chars = charsOf('dragon');
  const slots = [];
  for (let i = 0; i < 8; i++) slots.push({ i, x: 300 + 200 * i, y: 900, size: 200, ch: chars[i], row: 0 });
  for (let j = 0; j < 5; j++) slots.push({ i: 8 + j, x: 281.25 + 287.5 * (j + 0.5), y: 700, size: 287.5, ch: chars[8 + j], row: 1 });
  return { slots, row1: { x0: 200, x1: 1800, bottom: 900, size: 200 }, row2: { x0: 281.25, x1: 1718.75, bottom: 700, size: 287.5 }, impact: [1180, 520] };
})();
const DEFAULT_DROP = () => [...NAME_TIMES('D3a'), ...NAME_TIMES('D3b')];

// 碎片：每块石碑 4–5 片楔形（单位坐标，底边中心为原点，边长 1）
const SHARDS = NAME_WALL.slots.map((s, si) => {
  const cx = (H(si, 1) - 0.5) * 0.3, cy = -0.5 + (H(si, 2) - 0.5) * 0.3;
  const per = [[-0.5, -1], [0.5, -1], [0.5, 0], [-0.5, 0]];
  const n = 4 + (H(si, 3) > 0.5 ? 1 : 0);
  const cutsT = [];
  for (let k = 0; k < n; k++) cutsT.push((k + 0.2 + H(si, 10 + k) * 0.6) / n);
  const perim = (t) => { const e = Math.floor(t * 4) % 4, f = t * 4 - Math.floor(t * 4); const a = per[e], b = per[(e + 1) % 4]; return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)]; };
  const out = [];
  for (let k = 0; k < n; k++) {
    const t0 = cutsT[k], t1 = cutsT[(k + 1) % n] + (k === n - 1 ? 1 : 0);
    const pts = [[cx, cy], perim(t0)];
    for (let q = Math.ceil(t0 * 4); q < t1 * 4; q++) pts.push(per[q % 4]);
    pts.push(perim(t1 % 1));
    const ctr = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    out.push({ pts, ctr, seed: si * 10 + k });
  }
  return out;
});

/**
 * D3 石碑名字墙。世界坐标（depth 1）：传 o.cam 时内部 applyCam(g, o.cam, 1)；不传则按当前变换直接画（调用方已 applyCam）。
 * o: { dropAt[13]（落地时刻，默认 NAME_TIMES('D3a')+('D3b')）, glow 0..1（熔岩光，默认 1）, burst（撞碎时刻，默认不撞；b11 传 120.97）,
 *      impact:[x,y]（撞击点，碎片从这里向外、向左飞）, cam, light, t }
 * 每块下落 0.15s（inQuad）、落地即该字时刻；落地挤压 + 地面裂纹；burst 后 13 块各碎成 4–5 片带着发光字飞散（朝镜头放大）+ 60 粒碎石。
 * 返回 [{ x, y, size, top, landed }]（每块当前底边中心与顶边，调用坐标系）。
 */
export function drawNameWall(g, T, o = {}) {
  const dropAt = o.dropAt || DEFAULT_DROP();
  const gk = clamp(o.glow ?? 1);
  const light = o.light ?? 1;
  const burstAt = o.burst ?? Infinity;
  const [ix, iy] = o.impact || NAME_WALL.impact;
  const out = [];
  g.save();
  if (o.cam) applyCam(g, o.cam, 1);
  const tFl = 0.8 + 0.2 * noise1(T * 2.2, 4);
  if (T < burstAt) {
    // 熔岩光在地面上的反光
    const landedN = dropAt.filter((t) => T >= t).length;
    if (landedN > 0) ellGlow(g, 1000, 915, 900, 70, PAL.fire, 0.3 * gk * (landedN / 13) * tFl);
    for (const s of NAME_WALL.slots) {
      const tl = dropAt[s.i];
      if (T < tl - 0.15) { out.push({ x: s.x, y: s.y, size: s.size, top: s.y - s.size, landed: false, hidden: true }); continue; }
      const p = clamp((T - (tl - 0.15)) / 0.15);
      const yOff = T < tl ? -(s.y + 700) * (1 - p * p) : 0;
      const sq = T >= tl ? 0.16 * hit(T, tl, 0.06) - 0.04 * hit(T, tl + 0.06, 0.08) : -0.06;
      const rot = T >= tl ? 0.035 * wobble(T, tl, 5, 0.12) * (H(s.i, 5) > 0.5 ? 1 : -1) : 0;
      const g0 = gk * (0.3 + 0.7 * seg(T, tl, tl + 0.45)) + 0.5 * gk * hit(T, tl, 0.18);
      // 地面裂纹
      if (s.row === 0 && T >= tl) {
        const cp = seg(T, tl, tl + 0.3);
        g.save(); g.lineCap = 'round';
        for (const side of [-1, 1]) {
          const x0 = s.x + side * s.size * 0.42, y0 = s.y + 2;
          const pts = [[x0, y0], [x0 + side * 40 * cp, y0 + 12 * cp], [x0 + side * 75 * cp, y0 + 8 * cp + 14 * cp], [x0 + side * 110 * cp, y0 + 30 * cp]];
          const pth = smoothPath(pts, { closed: false });
          g.strokeStyle = rgba(PAL.shadow, 0.7); g.lineWidth = 5; g.stroke(pth);
          g.strokeStyle = rgba(PAL.fire, 0.6 * gk * tFl); g.lineWidth = 1.8; g.stroke(pth);
        }
        g.restore();
      }
      drawStoneTablet(g, { x: s.x, y: s.y + yOff, size: s.size, char: s.ch, glow: Math.min(1, g0), seed: 40 + s.i, rot, squash: sq, light, t: T + s.i });
      out.push({ x: s.x, y: s.y + yOff, size: s.size, top: s.y + yOff - s.size, landed: T >= tl });
    }
  } else {
    const age = T - burstAt;
    glow(g, ix, iy, 900 * (1 - age * 0.6), PAL.fire2, 0.6 * (1 - seg(age, 0, 0.5)));
    for (const s of NAME_WALL.slots) {
      for (const sh of SHARDS[s.i]) {
        const wx = s.x + sh.ctr[0] * s.size, wy = s.y + sh.ctr[1] * s.size;
        let dx = wx - ix, dy = wy - iy;
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const sp = 900 + H(sh.seed, 1) * 1100;
        const vx = dx * sp - 520 - H(sh.seed, 2) * 300, vy = dy * sp * 0.6 - 520 - H(sh.seed, 3) * 500;
        const k = (1 - Math.exp(-1.1 * age)) / 1.1;
        const x = wx + vx * k, y = wy + vy * k + 0.5 * 2100 * age * age;
        const spin = (H(sh.seed, 4) - 0.5) * 9 * age;
        const grow = 1 + 0.38 * outCubic(clamp(age / 0.9)) * H(sh.seed, 5);
        const a = 1 - seg(age, 0.6, 1.05);
        if (a <= 0) continue;
        const clip = new Path2D();
        sh.pts.forEach(([px, py], q) => (q ? clip.lineTo(px * s.size, py * s.size) : clip.moveTo(px * s.size, py * s.size)));
        clip.closePath();
        g.save();
        g.translate(x, y); g.rotate(spin); g.scale(grow, grow);
        g.translate(-sh.ctr[0] * s.size, -sh.ctr[1] * s.size);
        drawStoneTablet(g, { x: 0, y: 0, size: s.size, char: s.ch, glow: 1, seed: 40 + s.i, crack: 0, light, t: T + s.i, clip, alpha: a });
        g.restore();
      }
    }
    burst(g, T, { at: burstAt, seed: 77, count: 60, x: ix - 100, y: iy + 150, spread: 380, speed: [500, 1500], angle: [-Math.PI * 0.95, -Math.PI * 0.15], gravity: 2000, drag: 0.8, life: [0.7, 1.4], size: [6, 18] }, (gg, x, y, st) => {
      gg.save(); gg.translate(x, y); gg.rotate(st.rot);
      const hot = st.r > 0.7;
      gg.fillStyle = hot ? rgba(PAL.fire2, 1 - st.p) : rgba(mixHex(PAL.stone2, PAL.dragonDark, 0.4), 1 - st.p * 0.6);
      gg.beginPath(); gg.moveTo(-st.size * 0.5, -st.size * 0.3); gg.lineTo(st.size * 0.45, -st.size * 0.4); gg.lineTo(st.size * 0.3, st.size * 0.45); gg.lineTo(-st.size * 0.35, st.size * 0.3); gg.closePath(); gg.fill();
      if (hot) glow(gg, 0, 0, st.size * 2, PAL.fire, 0.6 * (1 - st.p));
      gg.restore();
    });
  }
  g.restore();
  return out;
}
