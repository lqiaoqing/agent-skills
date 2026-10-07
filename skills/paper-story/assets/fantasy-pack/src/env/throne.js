// 王座厅 THRONE —— docs/assets.md 8.5、docs/storyboard.md 4.5（坐标写死，镜头只读不改）。接口说明：docs/api/plaza_throne.md
// 分层（每层由镜头包进自己的 ctx.layer，函数内部自己 applyCam）：
//   back  后墙：灰泥 + 石砖、檐壁、尖拱窗（窗里画“窗外”）、玫瑰窗、左门、墙脚远地面（depth 0.55）
//   mid   四根柱、红底金盾长幡、壁烛、节日花环、圣旨横幅、身高刻度（0.8）
//   main  地面方砖、红毯、彩窗光斑、三级台阶、王座、讲台、纸通道、地上彩纸（1.0）
//   fg    两根虚化立柱、顶部帷幔 + 金流苏（1.38）
//   glow  光效（屏幕空间：彩窗光柱 + 浮尘、烛光晕、月光；直接画在 g 上，不进图层；建议放在角色之后、fg 之前）
// 纯函数：画面只由参数决定；内部 save/restore；不调 ctx.layer / ctx.mask。只用 PAL（深浅用 mixHex / rgba）。
import { PAL, blob, poly, rr, smooth as smoothPath, ribbon, cut, shade, lin, rad, glow, rays, sparkle } from '../core/paper.js';
import { cam, applyCam, toScreen } from '../core/camera.js';
import { clamp, lerp, hash2, noise1, fbm1, rgba, mixHex, TAU, fract } from '../core/util.js';
import { outBack } from '../core/ease.js';
import { field } from '../core/particles.js';
import { charsOf } from '../ui/type.js';
import { drawDecree } from '../props/paper.js';
import { drawRoundWindow } from './roundwindow.js';

// ———————————————————— 深度、机位 ————————————————————
/** 各层视差深度。flat（true 或 0..1）把所有层朝 depth 1 拉平：1 = 完全冻结视差（剧场背景片 / 插画页 / 玫瑰窗特写）。 */
export const THRONE_DEPTH = { back: 0.55, mid: 0.8, main: 1, fg: 1.38 };
const flatK = (f) => (f === true ? 1 : f ? clamp(+f) : 0);
/** 某层在 flat 下的实际深度。 */
export const throneDepth = (layer, flat) => { const d = THRONE_DEPTH[layer] ?? 1; return d + (1 - d) * flatK(flat); };
const zOf = (c, d) => 1 + (c.zoom - 1) * d;
/** 王座厅某层的世界坐标 → 屏幕坐标（考虑 flat）。 */
export const throneToScreen = (c, layer, x, y, flat) => toScreen(c, throneDepth(layer, flat), x, y);
function fromScreen(c, d, sx, sy) { const z = zOf(c, d); return [960 + (c.x - 960) * d + (sx - 960) / z, 540 + (c.y - 540) * d + (sy - 540) / z]; }

/** 预设机位（storyboard 4.5）。所有机位使用时叠 drift（O02、O04 除外）。 */
export const CAMS = {
  TR_W: cam(1000, 540, 1.0),
  TR_2S: cam(1060, 600, 1.35),
  TR_HERO: cam(700, 640, 1.7),
  TR_KING: cam(1480, 600, 1.7),
  CU_H: cam(700, 690, 3.4),     // 勇者头在左半，屏幕约 (690,480)，气泡在右上
  CU_K: cam(1400, 640, 3.3),    // 国王头在右半，屏幕约 (1290,490)，气泡在左上
  TR_HIGH: cam(1000, 470, 0.85),
  TR_ROSE: cam(1580, 250, 4.5), // 玫瑰窗特写：配 flat:1 时窗心正好在屏幕中心、半径 675（见 roseCam）
  TR_NIGHT: cam(900, 560, 1.3),
  TR_RULER: cam(800, 600, 1.9),
  // 附加（storyboard 第 5 节写死的固定机位，集中在这里，接缝两侧共用同一常量）
  TR_NAME: cam(1080, 640, 1.42),   // b05 41.90–43.80 由 TR_2S 缓推到这里（N1）
  TR_KING2S: cam(1300, 560, 1.45), // b05 49.83–50.40 偏国王的双人（K2 之后）
  TR_SEAL: cam(1000, 600, 1.3),    // b05 N4a 54.00 急拉
  TR_SEAL2: cam(1080, 580, 1.15),  // b05 N4b 54.68 后拉一级
  TR_LOW: cam(1000, 720, 1.2),     // b06 57.80–58.40 贴地低机位（对着红毯）
  TR_HERALD: cam(1000, 560, 1.2),  // b14 169.80–170.60 推向传令官（E06）
  TR_SCROLL: cam(1400, 600, 1.2),  // b14 173.8–176.0 跟着纸卷右移（E08）
};

// ———————————————————— 布局常量 ————————————————————
// 月亮：TR_NIGHT 下右尖拱窗里的月亮必须落在屏幕 (1220,250)、半径 70（= O02 夕阳），这里直接反解。
const [MOON_X, MOON_Y] = fromScreen(CAMS.TR_NIGHT, THRONE_DEPTH.back, 1220, 250);
const MOON_R = 70 / zOf(CAMS.TR_NIGHT, THRONE_DEPTH.back);

export const THRONE = {
  floorY: 880,                                        // 地面线（角色脚底，main）
  wallBase: 852,                                      // 后墙墙脚（back），其下是远地面
  carpet: { x0: -200, x1: 1300, y0: 868, y1: 960 },   // 红毯带（main）：远边抬到 868，盖住柱础，角色脚底 880 正好踩在毯上
  door: { x: 150, x0: 60, x1: 240, y0: 520, y1: 852 }, // 左门拱（back；门槛与墙脚齐平）
  windows: { L: { x: 600, w: 150, y0: 180, y1: 540 }, R: { x: 1150, w: 150, y0: 180, y1: 540 } }, // 尖拱窗（back）
  rose: { x: 1580, y: 250, r: 150 },                  // 玫瑰窗（back），在王座正上方
  moon: { x: MOON_X, y: MOON_Y, r: MOON_R },          // windowR:'moon' 的月亮（back）
  cols: [260, 780, 1300, 1880], colW: 96, colY0: 80, colY1: 880, // 柱（mid）
  bannerCols: [780, 1300], bannerY0: 120, bannerY1: 420,         // 红底金盾长幡（mid）
  sconceY: 540,                                       // 壁烛杯口高度（mid，每根柱正面）
  steps: { xs: [1300, 1360, 1420], tops: [850, 820, 790], x1: 1900 }, // 三级台阶（main）：第 k 级从 xs[k] 起，顶 tops[k]
  throne: { x: 1580, seatY: 660, backTop: 430, w: 220, star: [1580, 404] }, // 王座（main）
  lectern: { x: 1150, y: 880 },                       // 讲台（main，lectern:true 时画）
  fgCols: [-60, 1980], drapeY1: 80,                   // 前景（fg）
  decree: { x0: 260, x1: 1880, y0: 218, y1: 322, cx: 1070, cy: 270, from: { cx: 1140, cy: 730, len: 870, width: 180 } }, // 圣旨横幅（mid）
  lightSpots: [[470, 760], [1010, 1290]],             // 晴天彩窗光斑（main 地面 x 范围）
  aisle: [[980, 920], [1300, 920], [1300, 868], [1360, 856], [1360, 838], [1420, 826], [1420, 808], [1530, 800]], // 纸通道中线（main）
  spots: {                                            // 站位（脚底，main；朝臣 depth 0.9）
    hero: [620, 880], kingStand: [1500, 790], kingSit: [1580, 660], scribe: [1150, 880], herald: [980, 880],
    guardL: [1240, 880], guardR: [1880, 790], princess: [760, 880], cradle: [1100, 880], courtiers: [300, 700, 0.9],
  },
  depth: THRONE_DEPTH,
};

/**
 * 玫瑰窗定位机位：让玫瑰窗中心落在屏幕 (sx, sy)、屏幕半径 r。flat 为同时传给 drawThroneRoom 的 flat 值。
 * 默认 = TR_ROSE（flat:1，窗心 (960,540)、半径 675）。E05 圆窗内外匹配、176.80 铺满全屏（r≈1150）都用它反解。
 * 建议做法：从普通机位推向玫瑰窗时把 flat 0→1 与机位一起插值，落到 roseCam() 时视差正好冻结（不然 x=1880 的柱会挡在窗前）。
 */
export function roseCam(sx = 960, sy = 540, r = 675, flat = 1) {
  const d = throneDepth('back', flat), R = THRONE.rose;
  const z = r / R.r, Z = 1 + (z - 1) / d;
  return cam(960 + (R.x - 960 - (sx - 960) / z) / d, 540 + (R.y - 540 - (sy - 540) / z) / d, Z);
}
/** 尖拱窗里月亮在机位 c 下的屏幕位置与半径 [x, y, r]。 */
export function throneMoonScreen(c, flat) {
  const d = throneDepth('back', flat);
  const [x, y] = toScreen(c, d, THRONE.moon.x, THRONE.moon.y);
  return [x, y, THRONE.moon.r * zOf(c, d)];
}
/** 身高刻度：main 层身高 h（脚底 y=880 的孩子）在 TR_RULER 下对应的柱上（mid 层）y。 */
export function rulerY(h) {
  const c = CAMS.TR_RULER;
  const sy = toScreen(c, 1, 780, THRONE.floorY - h)[1];
  return fromScreen(c, THRONE_DEPTH.mid, 960, sy)[1];
}

// ———————————————————— 光照色调 ————————————————————
const GRAY = mixHex(PAL.skyDay, PAL.stone2, 0.6); // 灰蓝（storyboard 第 2 节）
const GRAY_TO = mixHex(GRAY, PAL.stoneDark, 0.25);
const NIGHT_TO = mixHex(PAL.skyNight, PAL.heroBlueDark, 0.3);
const LIGHTS = {
  sunny: (c) => c,
  festive: (c) => mixHex(c, PAL.goldLight, 0.1),
  gray: (c) => mixHex(c, GRAY_TO, 0.42),
  night: (c) => mixHex(mixHex(c, NIGHT_TO, 0.8), PAL.ink, 0.14),
};
const TONES = {};
/** 某光照下整张调色板（PAL 键 → 调过色的颜色），缓存。 */
function toneOf(light) {
  let t = TONES[light];
  if (!t) {
    const f = LIGHTS[light] || LIGHTS.sunny;
    t = {};
    for (const k in PAL) t[k] = f(PAL[k]);
    TONES[light] = t;
  }
  return t;
}
const LIGHT_NAMES = ['sunny', 'festive', 'gray', 'night'];
const DEF_WINDOW = { sunny: 'day', festive: 'day', gray: 'gray', night: 'night' };
const GLASS = [PAL.crystal, PAL.heart, PAL.gold, PAL.magic];

// ———————————————————— 几何工具 ————————————————————
/**
 * 尖拱轮廓点（等边尖拱的同心偏移）：两段圆弧圆心在 (cx ± c, spring)、半径 R；开口半宽 = R − c；从左下角逆时针到右下角。
 */
function archPts(cx, spring, c, R, bot, n = 12) {
  const aL = TAU - Math.acos(-c / R), aR = -Math.acos(c / R);
  const pts = [[cx + c - R, bot], [cx + c - R, spring]];
  for (let i = 1; i <= n; i++) { const a = Math.PI + (i / n) * (aL - Math.PI); pts.push([cx + c + R * Math.cos(a), spring + R * Math.sin(a)]); }
  for (let i = 1; i <= n; i++) { const a = aR + (i / n) * -aR; pts.push([cx - c + R * Math.cos(a), spring + R * Math.sin(a)]); }
  pts.push([cx - c + R, bot]);
  return pts;
}
/** 折线按弧长重采样（闭合）。 */
function resample(pts, step) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const L = Math.hypot(x2 - x1, y2 - y1);
    let s = carry;
    while (s < L) { out.push([lerp(x1, x2, s / L), lerp(y1, y2, s / L)]); s += step; }
    carry = s - L;
  }
  return out;
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pcut = (pts, seed, amp = 1, step = 22, round = 0) => poly(pts, { seed, amp, step, round });
/** 五角星路径。 */
function starPath(cx, cy, R, r, rot = -Math.PI / 2) {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr_ = i % 2 ? r : R;
    if (i) p.lineTo(cx + Math.cos(a) * rr_, cy + Math.sin(a) * rr_); else p.moveTo(cx + Math.cos(a) * rr_, cy + Math.sin(a) * rr_);
  }
  p.closePath();
  return p;
}
/** 盾形路径（中心 cx,cy，半宽 w，半高 h）。 */
function shieldPath(cx, cy, w, h) {
  return smoothPath([[cx - w, cy - h], [cx, cy - h * 0.86], [cx + w, cy - h], [cx + w * 0.98, cy + h * 0.1], [cx + w * 0.55, cy + h * 0.7], [cx, cy + h], [cx - w * 0.55, cy + h * 0.7], [cx - w * 0.98, cy + h * 0.1]], { closed: true, tension: 0.35 });
}
/** 二维凸包（单调链）。 */
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const pathOfPts = (pts, closed = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (closed) p.closePath(); return p; };

// ———————————————————— 静态几何（首次绘制时按固定种子预建，之后每帧复用） ————————————————————
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const G = {};
  // —— 后墙石缝与色块 ——
  const joints = new Path2D(), tint = new Path2D(), tint2 = new Path2D();
  for (let row = -9; row < 8; row++) {
    const y0 = 136 + row * 62;
    if (y0 >= 632) break;
    const y1 = Math.min(y0 + 62, 632);
    joints.moveTo(-1400, y0); joints.lineTo(3400, y0);
    const off = ((row + 9) % 2) * 70;
    for (let x = -1400 + off; x < 3400; x += 140) {
      joints.moveTo(x, y0); joints.lineTo(x, y1);
      const h = hash2(row * 7 + 3, x * 0.37 + 11);
      if (h < 0.17) tint.addPath(pcut(rectPts(x + 4, y0 + 4, x + 136, y1 - 4), (row + 20) * 131 + x, 1.3, 36));
      else if (h > 0.9) tint2.addPath(pcut(rectPts(x + 5, y0 + 5, x + 135, y1 - 5), (row + 40) * 71 + x, 1.3, 36));
    }
  }
  G.joints = joints; G.tint = tint; G.tint2 = tint2;
  // —— 檐壁（y 92–140）菱形 ——
  const dia = new Path2D(), dots = new Path2D();
  for (let x = -1400; x < 3400; x += 64) {
    dia.moveTo(x, 116 - 13); dia.lineTo(x + 11, 116); dia.lineTo(x, 116 + 13); dia.lineTo(x - 11, 116); dia.closePath();
    dots.moveTo(x + 32 + 4, 116); dots.arc(x + 32, 116, 4, 0, TAU);
  }
  G.frieze = { band: pcut(rectPts(-1400, 92, 3400, 140), 77, 0.8, 60), dia, dots };
  // —— 护墙（y 632–852）——
  const panels = [];
  for (let x = -1400; x < 3400; x += 200) panels.push(rr(x + 22, 668, 156, 132, 8));
  G.dado = {
    course: pcut(rectPts(-1400, 630, 3400, 650), 81, 0.9, 50),
    band: pcut(rectPts(-1400, 650, 3400, 824), 82, 0.8, 60),
    plinth: pcut(rectPts(-1400, 824, 3400, 853), 83, 0.8, 60),
    panels,
  };
  // —— 尖拱窗 ——
  G.win = {};
  for (const key of ['L', 'R']) {
    const W = THRONE.windows[key], cx = W.x;
    const sp = W.y0 + Math.sqrt(W.w * W.w - (W.w / 2) ** 2); // 等边尖拱：起拱线
    const glassPts = archPts(cx, sp, 75, 150, 540, 14);
    const ring = resample(glassPts, 26);
    G.win[key] = {
      sp, glassPts, ring,
      glass: pathOfPts(glassPts),
      inner: pathOfPts(archPts(cx, sp, 75, 139, 529, 14)),
      reveal: pcut(archPts(cx, sp, 75, 164, 548, 14), 90 + cx, 0.7, 18),
      frame: pcut(archPts(cx, sp, 75, 186, 548, 14), 91 + cx, 1.0, 18),
      hood: archPts(cx, sp, 75, 197, sp + 40, 14),
      sill: pcut(rectPts(cx - 118, 538, cx + 118, 556), 92 + cx, 0.8, 30),
      sillUnder: pcut(rectPts(cx - 108, 556, cx + 108, 564), 93 + cx, 0.6, 30),
    };
  }
  // —— 左门 ——
  {
    const D = THRONE.door, cx = D.x, cy = 610, r = 90;
    const open = new Path2D();
    open.moveTo(D.x0, D.y1); open.lineTo(D.x0, cy); open.arc(cx, cy, r, Math.PI, TAU); open.lineTo(D.x1, D.y1); open.closePath();
    const vous = [];
    for (let i = 0; i < 9; i++) {
      const a0 = Math.PI + (i / 9) * Math.PI, a1 = Math.PI + ((i + 1) / 9) * Math.PI, R1 = r + (i === 4 ? 40 : 34);
      vous.push(pcut([[cx + Math.cos(a0) * (r + 1), cy + Math.sin(a0) * (r + 1)], [cx + Math.cos(a0) * R1, cy + Math.sin(a0) * R1], [cx + Math.cos(a1) * R1, cy + Math.sin(a1) * R1], [cx + Math.cos(a1) * (r + 1), cy + Math.sin(a1) * (r + 1)]], 300 + i, 0.6, 14));
    }
    const jambs = [];
    for (let k = 0; k < 5; k++) {
      const y0 = cy + k * 49, y1 = Math.min(cy + (k + 1) * 49, D.y1);
      jambs.push(pcut(rectPts(D.x0 - 34 - (k % 2) * 6, y0 + 1, D.x0, y1 - 1), 320 + k, 0.6, 20));
      jambs.push(pcut(rectPts(D.x1, y0 + 1, D.x1 + 34 + (k % 2) * 6, y1 - 1), 330 + k, 0.6, 20));
    }
    G.door = { open, vous, jambs, cy, r };
  }
  // —— 玫瑰窗外圈装饰 ——
  {
    const R = THRONE.rose;
    G.rose = {
      ring: blob(R.x, R.y, R.r * 1.38, R.r * 1.38, { seed: 41, amp: 0.006, n: 72 }),
      foils: Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU; return blob(R.x + Math.cos(a) * R.r * 1.28, R.y + Math.sin(a) * R.r * 1.28, 12.5, 12.5, { seed: 50 + i, amp: 0.03, n: 20 }); }),
    };
  }
  // —— 柱 ——
  G.cols = THRONE.cols.map((x, i) => ({
    x,
    shaft: pcut(rectPts(x - 48, -760, x + 48, 834), 400 + i, 0.8, 40),
    abacus: pcut(rectPts(x - 66, 66, x + 66, 90), 410 + i, 0.8, 22),
    echinus: smoothPath([[x - 60, 90], [x + 60, 90], [x + 52, 106], [x + 48, 120], [x - 48, 120], [x - 52, 106]], { closed: true, tension: 0.3 }),
    neck: pcut(rectPts(x - 50, 120, x + 50, 127), 420 + i, 0.5, 30),
    band: pcut(rectPts(x - 50, 826, x + 50, 833), 430 + i, 0.5, 30),
    torus: rr(x - 57, 833, 114, 20, 10),
    plinth: pcut(rectPts(x - 64, 852, x + 64, 912), 440 + i, 0.8, 30),
    upper: pcut(rectPts(x - 60, -760, x + 60, 66), 450 + i, 0.8, 40),
  }));
  // —— 节日花环（柱间垂花）——
  {
    const leafA = new Path2D(), leafB = new Path2D(), flA = new Path2D(), flB = new Path2D(), flC = new Path2D(), ctr = new Path2D();
    const spans = [[-400, 212], [308, 732], [828, 1252], [1928, 2400]]; // 1300–1880 是玫瑰窗那一跨，不挂（会横穿玫瑰窗）
    spans.forEach(([a, b], si) => {
      const n = Math.round((b - a) / 10);
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = lerp(a, b, u), y = 152 + 86 * Math.sin(Math.PI * u) ** 0.9;
        const dy = 86 * Math.PI * Math.cos(Math.PI * u) / (b - a);
        const ang = Math.atan2(dy, 1);
        const side = i % 2 ? 1 : -1;
        const lf = blob(x + Math.cos(ang + side * 1.3) * 12, y + Math.sin(ang + side * 1.3) * 12, 16, 7.5, { seed: 500 + si * 50 + i, amp: 0.05, n: 16, rot: ang + side * 0.9 });
        (hash2(si, i) < 0.5 ? leafA : leafB).addPath(lf);
        if (i % 3 === 1) {
          const k = Math.floor(hash2(si + 9, i) * 3), fl = [flA, flB, flC][k];
          for (let q = 0; q < 5; q++) { const qa = (q / 5) * TAU + i; fl.addPath(blob(x + Math.cos(qa) * 6, y + 2 + Math.sin(qa) * 6, 5.5, 5.5, { seed: 600 + i * 5 + q, amp: 0.04, n: 12 })); }
          ctr.moveTo(x + 3.2, y + 2); ctr.arc(x, y + 2, 3.2, 0, TAU);
        }
      }
    });
    G.garland = { leafA, leafB, flA, flB, flC, ctr, ties: [260, 780, 1300, 1880] };
    // 玫瑰窗那一跨改成两根柱上各垂一束短花串
    for (const [x, dir] of [[1348, 1], [1832, -1]]) {
      for (let i = 0; i < 9; i++) {
        const y = 156 + i * 13, xx = x + dir * (4 + Math.sin(i * 0.9) * 3);
        (i % 2 ? leafA : leafB).addPath(blob(xx + dir * 7, y, 12, 6, { seed: 640 + x + i, n: 16, rot: dir * 0.9 + (i % 2 ? 0.5 : -0.5) }));
        if (i % 3 === 1) { for (let q = 0; q < 5; q++) { const qa = (q / 5) * TAU; flA.addPath(blob(xx + Math.cos(qa) * 6, y + Math.sin(qa) * 6, 5.5, 5.5, { seed: 660 + x + i * 5 + q, n: 12 })); } ctr.moveTo(xx + 3.2, y); ctr.arc(xx, y, 3.2, 0, TAU); }
      }
    }
  }
  // —— 地面方砖（透视）——
  {
    const VP = [1000, 360], Y = [880, 902, 928, 960, 998, 1044, 1100, 1168, 1250, 1350, 1472, 1620, 1800];
    const x0s = Array.from({ length: 50 }, (_, k) => -1900 + 115 * k);
    const xs = (x0, y) => VP[0] + (x0 - VP[0]) * (y - VP[1]) / (880 - VP[1]);
    const dark = new Path2D(), grout = new Path2D(), gloss = new Path2D();
    for (let r = 0; r < Y.length - 1; r++) {
      grout.moveTo(xs(x0s[0], Y[r]), Y[r]); grout.lineTo(xs(x0s[x0s.length - 1], Y[r]), Y[r]);
      for (let k = 0; k < x0s.length - 1; k++) {
        const q = [[xs(x0s[k], Y[r]), Y[r]], [xs(x0s[k + 1], Y[r]), Y[r]], [xs(x0s[k + 1], Y[r + 1]), Y[r + 1]], [xs(x0s[k], Y[r + 1]), Y[r + 1]]];
        if ((k + r) % 2) dark.addPath(pathOfPts(q));
        else if (hash2(r, k) < 0.25) {
          // 浅砖上偶尔一道斜向反光
          const m = 0.3 + hash2(r + 7, k) * 0.3;
          gloss.addPath(pathOfPts([[lerp(q[0][0], q[1][0], m), q[0][1]], [lerp(q[0][0], q[1][0], m + 0.12), q[0][1]], [lerp(q[3][0], q[2][0], m - 0.05), q[3][1]], [lerp(q[3][0], q[2][0], m - 0.17), q[3][1]]]));
        }
      }
    }
    for (const x0 of x0s) { grout.moveTo(x0, 880); grout.lineTo(xs(x0, 1800), 1800); }
    G.tiles = { dark, grout, gloss };
  }
  // —— 红毯 ——
  {
    const C = THRONE.carpet;
    const body = pcut(rectPts(C.x0, C.y0, C.x1, C.y1 - 2), 700, 0.7, 50);
    const dia = new Path2D(), dots = new Path2D(), fringe = new Path2D();
    for (let x = C.x0 + 60; x < C.x1 - 40; x += 96) {
      dia.moveTo(x, 902); dia.lineTo(x + 18, 914); dia.lineTo(x, 926); dia.lineTo(x - 18, 914); dia.closePath();
      dots.moveTo(x + 48 + 3.5, 914); dots.arc(x + 48, 914, 3.5, 0, TAU);
    }
    for (let y = C.y0 + 4; y < C.y1 - 4; y += 5) { fringe.moveTo(C.x1, y); fringe.lineTo(C.x1 + 10 + (y % 3), y + 1); fringe.moveTo(C.x0, y); fringe.lineTo(C.x0 - 10 - (y % 3), y + 1); }
    G.carpet = { body, dia, dots, fringe, edge: pcut(rectPts(C.x0, C.y1 - 6, C.x1, C.y1 + 4), 701, 0.5, 50) };
  }
  // —— 台阶 ——
  {
    const S = THRONE.steps, X1 = 3000;
    G.steps = S.xs.map((x, k) => {
      const top = S.tops[k], bot = k ? S.tops[k - 1] : THRONE.floorY;
      const panels = [];
      for (let px = x + 30; px < X1 - 60; px += 104) panels.push(rr(px, top + 8, 82, bot - top - 14, 4));
      return {
        face: pcut([[x + 3, top], [X1, top], [X1, bot + 2], [x, bot + 2], [x, top + 3]], 800 + k, 0.7, 40),
        nose: pcut(rectPts(x - 2, top - 3, X1, top + 4), 810 + k, 0.5, 40),
        panels, x, top, bot,
      };
    });
    const runFr = new Path2D();
    for (let x = 1424; x < X1; x += 6) { runFr.moveTo(x, 812); runFr.lineTo(x + 1, 820); }
    G.dais = { runner: pcut(rectPts(1422, 790, X1, 812), 820, 0.6, 40), runFr };
  }
  // —— 王座 ——
  {
    const T = THRONE.throne, x = T.x;
    const tufts = new Path2D(), buttons = new Path2D();
    for (let r = 0; r < 7; r++) for (let c = -3; c <= 3; c++) {
      const bx = x + c * 26 + (r % 2) * 13, by = 492 + r * 24;
      if (Math.abs(bx - x) > 76 || by > 640) continue;
      buttons.moveTo(bx + 2.6, by); buttons.arc(bx, by, 2.6, 0, TAU);
      tufts.moveTo(bx, by); tufts.lineTo(bx + 13, by + 12); tufts.moveTo(bx, by); tufts.lineTo(bx - 13, by + 12);
    }
    G.throne = {
      pedestal: pcut(rectPts(x - 136, 768, x + 136, 791), 900, 0.6, 30),
      pedTop: pcut(rectPts(x - 140, 762, x + 140, 770), 901, 0.5, 30),
      skirt: pcut([[x - 112, 676], [x + 112, 676], [x + 120, 764], [x - 120, 764]], 902, 0.7, 26),
      feet: [blob(x - 112, 765, 15, 10, { seed: 903 }), blob(x + 112, 765, 15, 10, { seed: 904 })],
      frame: smoothPath([[x - 110, 664], [x - 110, 470], [x - 104, 455], [x - 60, 448], [x - 24, 438], [x, 426], [x + 24, 438], [x + 60, 448], [x + 104, 455], [x + 110, 470], [x + 110, 664]], { closed: true, tension: 0.25 }),
      velvet: smoothPath([[x - 92, 652], [x - 92, 482], [x - 86, 472], [x - 50, 466], [x - 20, 458], [x, 448], [x + 20, 458], [x + 50, 466], [x + 86, 472], [x + 92, 482], [x + 92, 652]], { closed: true, tension: 0.25 }),
      knobs: [blob(x - 112, 452, 11, 11, { seed: 905 }), blob(x + 112, 452, 11, 11, { seed: 906 })],
      cushion: rr(x - 124, 646, 248, 34, 16),
      armL: rr(x - 142, 590, 46, 80, 14), armR: rr(x + 96, 590, 46, 80, 14),
      padL: rr(x - 146, 582, 54, 17, 8), padR: rr(x + 92, 582, 54, 17, 8),
      scrollL: blob(x - 130, 664, 14, 14, { seed: 907 }), scrollR: blob(x + 130, 664, 14, 14, { seed: 908 }),
      star: starPath(T.star[0], T.star[1], 25, 11),
      starIn: starPath(T.star[0], T.star[1] + 1, 15, 6.5),
      medal: blob(x, 718, 17, 17, { seed: 909 }),
      tufts, buttons,
    };
  }
  // —— 帷幔 ——
  {
    const swags = [], folds = new Path2D(), fringe = new Path2D(), stripes = new Path2D();
    const step = 300;
    for (let i = 0; i < 18; i++) {
      const a = -1600 + i * step, b = a + step;
      const top = [], bot = [];
      for (let k = 0; k <= 20; k++) { const u = k / 20; const x = lerp(a, b, u); top.push([x, 8]); bot.push([x, 26 + 56 * Math.sin(Math.PI * u) ** 0.85]); }
      swags.push(pcut([...top, ...bot.reverse()], 1000 + i, 0.6, 30));
      for (const f of [0.35, 0.62, 0.84]) {
        for (let k = 0; k <= 20; k++) { const u = k / 20; const x = lerp(a + 20, b - 20, u); const y = 18 + (8 + 56 * f) * Math.sin(Math.PI * u) ** 0.85; k ? folds.lineTo(x, y) : folds.moveTo(x, y); }
      }
      for (let x = a + 4; x < b - 2; x += 5) { const u = (x - a) / step; const y = 26 + 56 * Math.sin(Math.PI * u) ** 0.85; fringe.moveTo(x, y - 1); fringe.lineTo(x + 0.5, y + 9); }
    }
    for (let x = -1600; x < 3800; x += 46) { stripes.moveTo(x, -1600); stripes.lineTo(x + 8, 10); }
    G.drape = { swags, folds, fringe, stripes, band: pcut(rectPts(-1700, -1700, 3900, 14), 1100, 0.6, 80), rope: pcut(rectPts(-1700, 10, 3900, 19), 1101, 0.5, 60) };
  }
  // —— 地上彩纸 ——
  {
    const cols = ['heart', 'gold', 'crystal', 'meadow'];
    const pieces = [];
    for (let i = 0; i < 320; i++) {
      const r = hash2(i, 1);
      let x, y;
      if (r < 0.8) { x = -260 + hash2(i, 2) * 2560; y = 886 + hash2(i, 3) ** 1.6 * 360; if (x > 1290 && y < 900) y += 16; }
      else { const k = Math.floor(hash2(i, 4) * 3); x = THRONE.steps.xs[k] + 8 + hash2(i, 5) * 1000; y = THRONE.steps.tops[k] - 2 + hash2(i, 6) * 3; }
      pieces.push({ x, y, rot: hash2(i, 7) * TAU, c: cols[Math.floor(hash2(i, 8) * 4)], k: Math.floor(hash2(i, 9) * 3), s: 0.7 + hash2(i, 10) * 0.6, ord: hash2(i, 11) });
    }
    G.confetti = pieces;
  }
  GEO = G;
  return G;
}

// ———————————————————— 窗外（尖拱窗里画的“窗外”） ————————————————————
function cloudShape(g, x, y, s, color, seed) {
  const p = new Path2D();
  p.addPath(blob(x, y, 26 * s, 13 * s, { seed, amp: 0.05, n: 24 }));
  p.addPath(blob(x - 18 * s, y + 3 * s, 15 * s, 10 * s, { seed: seed + 1, amp: 0.05, n: 20 }));
  p.addPath(blob(x + 20 * s, y + 4 * s, 14 * s, 9 * s, { seed: seed + 2, amp: 0.05, n: 20 }));
  p.addPath(blob(x + 2 * s, y - 9 * s, 14 * s, 11 * s, { seed: seed + 3, amp: 0.05, n: 20 }));
  cut(g, p, color);
}
function branch(g, pts, w0, color) {
  g.fillStyle = color;
  g.fill(ribbon(pts, (u) => lerp(w0, w0 * 0.25, u)));
}
const SEASON_BRANCH = (x) => [[x - 92, 338], [x - 58, 318], [x - 22, 314], [x + 12, 296], [x + 46, 284]];
const SEASON_TWIG = (x) => [[x - 40, 316], [x - 30, 288], [x - 16, 270]];

function viewSky(g, x, top, bottom) {
  g.fillStyle = lin(g, 0, 176, 0, 548, top.length ? top : [top, bottom]);
  g.fillRect(x - 90, 170, 180, 380);
}
function drawStars(g, x, t, n = 16, seed = 3) {
  for (let i = 0; i < n; i++) {
    const sx = x - 68 + hash2(i, seed) * 136, sy = 196 + hash2(i, seed + 4) ** 1.2 * 320;
    const tw = 0.55 + 0.45 * Math.sin(t * (1.3 + hash2(i, seed + 7) * 1.7) + i * 2.1);
    const sz = 1.4 + hash2(i, seed + 9) * 2.4;
    if (sz > 3.2) sparkle(g, sx, sy, sz * 2.4, { color: PAL.moon, alpha: tw, thin: 0.2 });
    else { g.fillStyle = rgba(PAL.moon, 0.45 + 0.5 * tw); g.beginPath(); g.arc(sx, sy, sz * 0.6, 0, TAU); g.fill(); }
  }
}
function drawMoon(g, mx, my, r, phase, skyCol, t) {
  glow(g, mx, my, r * 2.4, PAL.moonGlow, 0.55);
  const body = blob(mx, my, r, r, { seed: 61, amp: 0.008, n: 48 });
  cut(g, body, PAL.moon, { rim: PAL.white, rimW: Math.max(2, r * 0.05) });
  g.save(); g.clip(body);
  g.fillStyle = rgba(PAL.moonGlow, 0.55);
  for (const [dx, dy, rr_] of [[-0.32, -0.2, 0.2], [0.28, 0.18, 0.15], [-0.05, 0.42, 0.11], [0.36, -0.36, 0.08]]) { g.beginPath(); g.ellipse(mx + dx * r, my + dy * r, rr_ * r, rr_ * r * 0.86, 0.4, 0, TAU); g.fill(); }
  shade(g, body, PAL.moonGlow, mx - r, my - r, mx + r, my + r, 0, 0.5);
  if (phase > 0.001) {
    // 月相：同半径的夜色圆从右侧压上来（0 满月 → 1 细月牙）
    g.fillStyle = skyCol;
    g.beginPath(); g.arc(mx + r * 2 * (1 - clamp(phase) * 0.86), my - r * 0.06, r * 1.02, 0, TAU); g.fill();
  }
  g.restore();
}
function windowView(g, kind, key, t, o) {
  const x = THRONE.windows[key].x;
  switch (kind) {
    case 'gray': {
      viewSky(g, x, [[0, mixHex(GRAY, PAL.stoneDark, 0.35)], [0.6, GRAY], [1, mixHex(GRAY, PAL.skyDayLow, 0.5)]]);
      cloudShape(g, x - 40 + Math.sin(t * 0.1) * 8, 236, 1.5, mixHex(GRAY, PAL.stoneDark, 0.25), 70);
      cloudShape(g, x + 50, 300, 1.2, mixHex(GRAY, PAL.paper2, 0.3), 74);
      cut(g, blob(x, 562, 140, 46, { seed: 76 }), mixHex(GRAY, PAL.mountainDark, 0.35));
      g.strokeStyle = rgba(PAL.skyDayLow, 0.55); g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 26; i++) {
        const rx = x - 86 + hash2(i, 31) * 172, ry = 170 + fract(hash2(i, 33) + t * 1.45) * 400;
        g.moveTo(rx, ry); g.lineTo(rx - 7, ry + 24);
      }
      g.stroke();
      break;
    }
    case 'sunset': {
      viewSky(g, x, [[0, PAL.skyDuskHigh], [0.55, PAL.skyDusk], [1, PAL.goldLight]]);
      glow(g, x + 20, 520, 120, PAL.goldLight, 0.7);
      cloudShape(g, x - 30 + Math.sin(t * 0.12) * 6, 268, 1.3, mixHex(PAL.skyDuskHigh, PAL.skyDusk, 0.4), 80);
      cut(g, blob(x, 568, 150, 50, { seed: 82 }), mixHex(PAL.skyDuskHigh, PAL.ink, 0.35));
      break;
    }
    case 'night': case 'moon': {
      viewSky(g, x, [[0, PAL.skyNightHigh], [1, PAL.skyNight]]);
      drawStars(g, x, t, 18, key === 'L' ? 3 : 13);
      if (kind === 'moon') {
        const mx = key === 'R' ? THRONE.moon.x : x + (THRONE.moon.x - THRONE.windows.R.x);
        drawMoon(g, mx, THRONE.moon.y, THRONE.moon.r, o.moonPhase || 0, PAL.skyNight, t);
      }
      cut(g, blob(x - 20, 572, 150, 52, { seed: 84 }), mixHex(PAL.skyNight, PAL.ink, 0.45));
      break;
    }
    case 'spring': {
      viewSky(g, x, [[0, mixHex(PAL.skyDay, PAL.skyDayLow, 0.4)], [1, PAL.skyDayLow]]);
      cut(g, blob(x + 10, 566, 150, 48, { seed: 86 }), PAL.leafLight);
      branch(g, SEASON_BRANCH(x), 9, PAL.wood); branch(g, SEASON_TWIG(x), 5, PAL.wood);
      [[-70, 316], [-48, 308], [-24, 304], [4, 296], [30, 284], [46, 270], [-32, 282], [-16, 262], [-6, 320], [22, 304]].forEach(([dx, dy], i) => {
        const fx = x + dx, fy = dy + Math.sin(t * 1.4 + i) * 1.2;
        for (let q = 0; q < 5; q++) { const a = (q / 5) * TAU + i; cut(g, blob(fx + Math.cos(a) * 5.5, fy + Math.sin(a) * 5.5, 5, 5, { seed: 900 + i * 5 + q, n: 12 }), q % 2 ? PAL.princessLight : mixHex(PAL.princessLight, PAL.white, 0.4)); }
        g.fillStyle = PAL.princessDark; g.beginPath(); g.arc(fx, fy, 2.4, 0, TAU); g.fill();
      });
      field(g, t, { seed: 21, count: 7, x: x - 80, y: 170, w: 160, h: 380, vx: 14, vy: 34, sway: 10, size: [4, 6] }, (gg, px, py, s) => {
        gg.save(); gg.translate(px, py); gg.rotate(s.rot); gg.fillStyle = PAL.princessLight; gg.beginPath(); gg.ellipse(0, 0, s.size, s.size * 0.55, 0, 0, TAU); gg.fill(); gg.restore();
      });
      break;
    }
    case 'summer': {
      viewSky(g, x, [[0, PAL.skyDay], [1, mixHex(PAL.skyDay, PAL.skyDayLow, 0.6)]]);
      glow(g, x + 50, 230, 90, PAL.goldLight, 0.6);
      cut(g, blob(x, 566, 150, 50, { seed: 88 }), PAL.grass);
      branch(g, SEASON_BRANCH(x), 9, PAL.woodDark); branch(g, SEASON_TWIG(x), 5, PAL.woodDark);
      [[-74, 324], [-60, 304], [-40, 326], [-28, 300], [-8, 316], [4, 290], [22, 306], [36, 280], [52, 290], [-34, 274], [-20, 256], [-6, 266], [14, 322], [44, 268]].forEach(([dx, dy], i) => {
        const a = hash2(i, 5) * TAU + Math.sin(t * 1.1 + i) * 0.08;
        cut(g, blob(x + dx, dy, 13, 6.5, { seed: 950 + i, rot: a, n: 16 }), i % 3 ? PAL.grass : PAL.leafLight);
      });
      break;
    }
    case 'autumn': {
      viewSky(g, x, [[0, mixHex(PAL.skyDusk, PAL.goldLight, 0.45)], [1, mixHex(PAL.paper, PAL.skyDusk, 0.25)]]);
      cut(g, blob(x, 566, 150, 50, { seed: 90 }), mixHex(PAL.earth, PAL.gold, 0.3));
      branch(g, SEASON_BRANCH(x), 9, PAL.woodDark); branch(g, SEASON_TWIG(x), 5, PAL.woodDark);
      const AC = [PAL.fire, PAL.earth, PAL.gold, PAL.fireDeep];
      [[-66, 322], [-30, 300], [6, 300], [40, 278], [-20, 262], [18, 316]].forEach(([dx, dy], i) => cut(g, blob(x + dx, dy, 11, 6, { seed: 970 + i, rot: hash2(i, 6) * TAU, n: 16 }), AC[i % 4]));
      field(g, t, { seed: 23, count: 6, x: x - 80, y: 170, w: 160, h: 380, vx: 20, vy: 42, sway: 16, size: [6, 9] }, (gg, px, py, s) => {
        gg.save(); gg.translate(px, py); gg.rotate(s.rot); gg.fillStyle = AC[s.i % 4]; gg.beginPath(); gg.ellipse(0, 0, s.size, s.size * 0.5, 0, 0, TAU); gg.fill(); gg.restore();
      });
      break;
    }
    case 'winter': {
      viewSky(g, x, [[0, PAL.snowShade], [1, mixHex(PAL.skyDayLow, PAL.white, 0.4)]]);
      cut(g, blob(x, 566, 150, 52, { seed: 92 }), PAL.snow, { rim: PAL.white });
      branch(g, SEASON_BRANCH(x), 9, PAL.woodDark); branch(g, SEASON_TWIG(x), 5, PAL.woodDark);
      g.fillStyle = PAL.snow;
      [[-80, 332, 14], [-56, 313, 16], [-24, 309, 15], [10, 291, 15], [40, 279, 11], [-32, 283, 8]].forEach(([dx, dy, w], i) => g.fill(blob(x + dx, dy - 4, w, 4.5, { seed: 990 + i, n: 16 })));
      field(g, t, { seed: 25, count: 16, x: x - 80, y: 170, w: 160, h: 380, vx: 6, vy: 30, sway: 8, size: [1.5, 3.2] }, (gg, px, py, s) => {
        gg.fillStyle = rgba(PAL.white, 0.95); gg.beginPath(); gg.arc(px, py, s.size, 0, TAU); gg.fill();
      });
      break;
    }
    default: { // 'day'
      viewSky(g, x, [[0, PAL.skyDay], [0.7, mixHex(PAL.skyDay, PAL.skyDayLow, 0.55)], [1, PAL.skyDayLow]]);
      cloudShape(g, x - 110 + fract(t * 0.018 + (key === 'L' ? 0.2 : 0.65)) * 240, key === 'L' ? 262 : 300, 1.15, PAL.white, key === 'L' ? 95 : 97);
      cut(g, blob(x - 40, 566, 120, 54, { seed: 98 }), mixHex(PAL.mountainFar, PAL.skyDayLow, 0.25));
      cut(g, blob(x + 50, 580, 120, 50, { seed: 99 }), mixHex(PAL.meadow, PAL.mountainFar, 0.35));
    }
  }
}
/** 窗里画什么：字符串，或 {from, to, k}（窗框内的小翻页：旧页绕左边铰链翻走，露出新页）。 */
function drawView(g, spec, key, t, o) {
  if (spec && typeof spec === 'object') {
    const k = clamp(spec.k ?? 0);
    windowView(g, spec.to, key, t, o);
    if (k < 1) {
      const x0 = THRONE.windows[key].x - 75, sx = Math.cos(k * Math.PI * 0.5);
      g.save();
      g.translate(x0, 0); g.scale(sx, 1); g.translate(-x0, 0);
      windowView(g, spec.from, key, t, o);
      g.fillStyle = lin(g, x0, 0, x0 + 150, 0, [[0, rgba(PAL.ink, 0.0)], [1, rgba(PAL.ink, 0.45 * Math.sin(k * Math.PI * 0.5))]]);
      g.fillRect(x0, 170, 152, 380);
      g.restore();
      // 翻页的纸边 + 新页上的阴影
      const ex = x0 + 150 * sx;
      g.fillStyle = lin(g, ex, 0, ex + 26, 0, [[0, rgba(PAL.ink, 0.3 * (1 - k))], [1, rgba(PAL.ink, 0)]]);
      g.fillRect(ex, 170, 26, 380);
      g.strokeStyle = rgba(PAL.paper, 0.9); g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(ex, 172); g.lineTo(ex, 548); g.stroke();
    }
  } else windowView(g, spec || 'day', key, t, o);
}

// ———————————————————— back：后墙 ————————————————————
function drawBack(g, t, o, light, P) {
  const G = geo();
  const night = light === 'night';
  // 墙面：灰泥，下部略深；左右两端渐暗
  g.fillStyle = lin(g, 0, -300, 0, 860, [[0, mixHex(P.paper2, P.stone2, 0.35)], [0.35, mixHex(P.paper2, P.paper, 0.25)], [0.7, P.paper2], [1, mixHex(P.paper2, P.stone2, 0.45)]]);
  g.fillRect(-1500, -1200, 5000, 2900);
  // 石块
  g.fillStyle = rgba(mixHex(P.stone, P.paper2, 0.3), 0.55); g.fill(G.tint);
  g.fillStyle = rgba(mixHex(P.paper, P.paper2, 0.4), 0.7); g.fill(G.tint2);
  g.strokeStyle = rgba(P.stoneDark, 0.16); g.lineWidth = 1.6; g.stroke(G.joints);
  // 窗边的暖光（晴 / 节日）
  if (light === 'sunny' || light === 'festive') {
    const k = light === 'festive' ? 1.7 : 1;
    for (const key of ['L', 'R']) glow(g, THRONE.windows[key].x, 420, 470 * (light === 'festive' ? 1.2 : 1), PAL.goldLight, 0.2 * k);
    glow(g, THRONE.rose.x, THRONE.rose.y + 40, 460 * (light === 'festive' ? 1.3 : 1), PAL.goldLight, 0.16 * k);
  }
  // 檐壁
  cut(g, G.frieze.band, P.redDark, { shadow: 2.5, rim: mixHex(P.redDark, P.red, 0.6), rimW: 2 });
  g.fillStyle = P.gold; g.fill(G.frieze.dia);
  g.fillStyle = rgba(P.goldLight, 0.85); g.fill(G.frieze.dots);
  g.strokeStyle = P.gold; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(-1400, 97); g.lineTo(3400, 97); g.moveTo(-1400, 135); g.lineTo(3400, 135); g.stroke();
  // 护墙
  const D = G.dado;
  cut(g, D.band, mixHex(P.stone, P.paper2, 0.25));
  for (const p of D.panels) {
    g.fillStyle = mixHex(P.stone, P.stone2, 0.4); g.fill(p);
    g.save(); g.clip(p);
    g.strokeStyle = rgba(P.stoneDark, 0.35); g.lineWidth = 6; g.translate(-2, -2); g.stroke(p);
    g.restore();
    g.save(); g.clip(p); g.strokeStyle = rgba(P.white, 0.25); g.lineWidth = 4; g.translate(2.5, 2.5); g.stroke(p); g.restore();
  }
  cut(g, D.course, P.stone2, { shadow: 3, rim: mixHex(P.stone2, P.white, 0.5), rimW: 2.5 });
  cut(g, D.plinth, mixHex(P.stone2, P.stoneDark, 0.3), { rim: mixHex(P.stone2, P.white, 0.25), rimW: 2 });
  // 墙脚远地面（被 main 层地面盖住大部分，机位上下移时露出一条）
  g.fillStyle = lin(g, 0, 852, 0, 1000, [[0, mixHex(mixHex(P.stone, P.paper2, 0.4), P.shadow, 0.35)], [0.3, mixHex(P.stone, P.paper2, 0.45)], [1, mixHex(P.stone, P.paper2, 0.3)]]);
  g.fillRect(-1500, 852, 5000, 900);
  g.strokeStyle = rgba(P.stoneDark, 0.18); g.lineWidth = 1.5;
  g.beginPath(); for (const y of [864, 880, 900, 926]) { g.moveTo(-1500, y); g.lineTo(3500, y); } g.stroke();
  // 尖拱窗
  for (const key of ['L', 'R']) drawLancet(g, key, t, o, light, P);
  // 玫瑰窗
  drawRose(g, t, o, light, P);
  // 左门
  drawDoor(g, t, o, light, P);
  // 夜：墙面整体再压一点、左右更暗
  if (night) {
    g.fillStyle = rad(g, 1000, 520, 300, 1500, [[0, rgba(PAL.skyNightHigh, 0)], [1, rgba(PAL.skyNightHigh, 0.45)]]);
    g.fillRect(-1500, -1200, 5000, 2900);
  } else {
    g.fillStyle = rad(g, 1000, 480, 500, 1700, [[0, rgba(P.shadow, 0)], [1, rgba(P.shadow, light === 'gray' ? 0.3 : 0.22)]]);
    g.fillRect(-1500, -1200, 5000, 2900);
  }
}

function drawLancet(g, key, t, o, light, P) {
  const W = geo().win[key], x = THRONE.windows[key].x;
  const view = key === 'L' ? o.windowL ?? DEF_WINDOW[light] : o.windowR ?? DEF_WINDOW[light];
  // 石框 + 拱石缝 + 滴水线
  cut(g, W.frame, mixHex(P.stone, P.paper2, 0.2), { shadow: 3.5, rim: mixHex(P.stone, P.white, 0.45), rimW: 2.5 });
  g.save();
  g.strokeStyle = rgba(P.stoneDark, 0.28); g.lineWidth = 1.6;
  g.beginPath();
  for (let i = 1; i < 12; i++) {
    const side = i < 6 ? -1 : 1, k = i < 6 ? i : i - 6;
    const a = side < 0 ? Math.PI + (k / 6) * (Math.PI / 3) : -Math.PI / 3 + (k / 6) * (Math.PI / 3);
    const ccx = x + (side < 0 ? 75 : -75);
    g.moveTo(ccx + Math.cos(a) * 165, W.sp + Math.sin(a) * 165); g.lineTo(ccx + Math.cos(a) * 185, W.sp + Math.sin(a) * 185);
  }
  for (let y = W.sp + 30; y < 540; y += 46) { g.moveTo(x - 107, y); g.lineTo(x - 88, y); g.moveTo(x + 88, y); g.lineTo(x + 107, y); }
  g.stroke();
  g.strokeStyle = mixHex(P.stone2, P.stoneDark, 0.2); g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); W.hood.slice(1, -1).forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  g.strokeStyle = rgba(P.white, 0.35); g.lineWidth = 2;
  g.beginPath(); W.hood.slice(1, -1).forEach(([px, py], i) => (i ? g.lineTo(px, py - 2) : g.moveTo(px, py - 2))); g.stroke();
  g.restore();
  // 窗洞侧壁（左亮右暗）
  cut(g, W.reveal, mixHex(P.stone2, P.stoneDark, 0.35));
  shade(g, W.reveal, P.shadow, x - 90, 0, x + 90, 0, 0, 0.35);
  // 玻璃：窗外 + 彩色边框 + 铅条
  const glass = W.glass;
  g.save();
  g.clip(glass);
  drawView(g, view, key, t, o);
  const dim = light === 'night' ? 0.55 : light === 'gray' ? 0.7 : 1;
  g.lineWidth = 23; g.lineCap = 'butt';
  const ring = W.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    g.strokeStyle = rgba(mixHex(GLASS[i % 4], PAL.white, light === 'night' ? 0 : 0.12), 0.92 * dim);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // 玻璃反光（白天一道斜光，夜里几乎没有）
  if (light !== 'night') {
    g.fillStyle = lin(g, x - 75, 200, x + 30, 330, [[0, rgba(PAL.white, 0.0)], [0.45, rgba(PAL.white, 0.16 * dim)], [0.55, rgba(PAL.white, 0.0)]]);
    g.fillRect(x - 80, 170, 160, 380);
  }
  g.restore();
  // 铅条
  g.save();
  g.strokeStyle = mixHex(P.inkSoft, P.stoneDark, 0.3); g.lineWidth = 2.6; g.lineJoin = 'round';
  g.stroke(W.inner);
  g.beginPath();
  for (let i = 0; i < ring.length; i++) {
    const [px, py] = ring[i];
    const nx = x - px, ny = (W.sp + 40) - py, L = Math.hypot(nx, ny) || 1;
    g.moveTo(px, py); g.lineTo(px + (nx / L) * 12, py + (ny / L) * 12);
  }
  for (const yy of [404, 472]) { g.moveTo(x - 64, yy); g.lineTo(x + 64, yy); }
  g.stroke();
  g.lineWidth = 3.2; g.stroke(glass);
  g.restore();
  // 窗台
  cut(g, W.sillUnder, mixHex(P.stone2, P.stoneDark, 0.45));
  cut(g, W.sill, mixHex(P.stone, P.paper2, 0.25), { shadow: 3, rim: mixHex(P.stone, P.white, 0.5), rimW: 2.5 });
}

function drawRose(g, t, o, light, P) {
  const G = geo().rose, R = THRONE.rose, ro = o.rose || {};
  cut(g, G.ring, mixHex(P.stone2, P.paper2, 0.25), { shadow: 4, rim: mixHex(P.stone2, P.white, 0.45), rimW: 3 });
  shade(g, G.ring, P.shadow, R.x - 200, R.y - 200, R.x + 200, R.y + 200, 0, 0.22);
  for (const f of G.foils) { cut(g, f, mixHex(P.stone, P.paper2, 0.2), { rim: rgba(PAL.white, 0.5), rimW: 1.5 }); shade(g, f, P.stoneDark, R.x - 210, R.y - 210, R.x + 210, R.y + 210, 0.05, 0.2); }
  g.save();
  g.strokeStyle = P.gold; g.lineWidth = 5;
  g.beginPath(); g.arc(R.x, R.y, R.r * 1.205, 0, TAU); g.stroke();
  g.strokeStyle = rgba(P.goldLight, 0.7); g.lineWidth = 1.5;
  g.beginPath(); g.arc(R.x, R.y, R.r * 1.19, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
  g.restore();
  const defGlow = { sunny: 0.6, festive: 0.85, gray: 0.18, night: 0.08 }[light] ?? 0.6;
  const face = ro.face || 'in';
  drawRoundWindow(g, { x: R.x, y: R.y, r: R.r, face, glow: ro.glow ?? defGlow, t, seed: 5 });
  if (face === 'in' && ro.tracery !== false) roseTracery(g, R, P, light);
  // 阴天 / 夜里玻璃发暗
  if (light === 'night' || light === 'gray') {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = light === 'night' ? rgba(mixHex(NIGHT_TO, PAL.magic, 0.12), 0.82) : rgba(GRAY_TO, 0.5);
    g.beginPath(); g.arc(R.x, R.y, R.r * 1.06, 0, TAU); g.fill();
    g.restore();
    if (light === 'night') glow(g, R.x, R.y, R.r * 1.1, PAL.moonGlow, 0.12);
  }
}

/** 室内一侧的窗花（tracery:false 可关，与外侧完全同款）：雕花暖石圈、玻璃斑驳、每瓣外段一枚尖拱花格、瓣间小圆花、内圈分格、金心八角星。 */
function roseTracery(g, R, P, light) {
  const { x, y, r } = R;
  const night = light === 'night';
  const pol = (rr_, a) => [x + Math.cos(a) * rr_ * r, y + Math.sin(a) * rr_ * r];
  g.save();
  // 石圈（替换 in 面偏黑的石框）
  const ringP = new Path2D();
  ringP.arc(x, y, r * 1.18, 0, TAU); ringP.arc(x, y, r * 1.035, 0, TAU, true);
  g.fillStyle = mixHex(P.stone2, P.stoneDark, 0.28); g.fill(ringP);
  g.save(); g.clip(ringP);
  g.fillStyle = rad(g, x - r * 0.4, y - r * 0.5, r * 0.6, r * 1.5, [[0, rgba(PAL.white, 0.22)], [1, rgba(P.shadow, 0.28)]]);
  g.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
  g.strokeStyle = rgba(P.shadow, 0.35); g.lineWidth = r * 0.012;
  g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + 0.07; g.moveTo(...pol(1.04, a)); g.lineTo(...pol(1.18, a)); } g.stroke();
  g.restore();
  g.strokeStyle = P.gold; g.lineWidth = r * 0.02; g.beginPath(); g.arc(x, y, r * 1.04, 0, TAU); g.stroke();
  const lead = mixHex(PAL.inkSoft, PAL.ink, 0.35);
  for (let i = 0; i < 8; i++) {
    const ac = (i / 8) * TAU, a0 = ac - TAU / 16 + 0.04, a1 = ac + TAU / 16 - 0.04;
    const sec = new Path2D(); sec.arc(x, y, r * 0.96, a0, a1); sec.arc(x, y, r * 0.36, a1, a0, true); sec.closePath();
    // 手工玻璃的斑驳：几块浅、几块深
    g.save(); g.clip(sec);
    for (let k = 0; k < 5; k++) {
      const aa = lerp(a0, a1, hash2(i, k)), rk = lerp(0.42, 0.92, hash2(i + 5, k));
      const [ex, ey] = pol(rk, aa);
      g.fillStyle = k % 2 ? rgba(PAL.white, night ? 0.05 : 0.16) : rgba(PAL.ink, 0.07);
      g.beginPath(); g.ellipse(ex, ey, r * (0.07 + hash2(i, k + 9) * 0.06), r * 0.045, aa + 1.2, 0, TAU); g.fill();
    }
    // 尖拱花格：外段里一枚更亮的尖拱窗格
    const arch = new Path2D();
    arch.moveTo(...pol(0.67, ac - 0.25)); arch.lineTo(...pol(0.79, ac - 0.25));
    arch.quadraticCurveTo(...pol(0.9, ac - 0.22), ...pol(0.925, ac));
    arch.quadraticCurveTo(...pol(0.9, ac + 0.22), ...pol(0.79, ac + 0.25));
    arch.lineTo(...pol(0.67, ac + 0.25)); arch.arc(x, y, r * 0.67, ac + 0.25, ac - 0.25, true); arch.closePath();
    g.fillStyle = rgba(PAL.white, night ? 0.06 : 0.2); g.fill(arch);
    g.strokeStyle = rgba(lead, 0.9); g.lineWidth = r * 0.02; g.lineJoin = 'round'; g.stroke(arch);
    // 尖拱里的小三叶
    const [tx, ty] = pol(0.83, ac);
    g.fillStyle = rgba(mixHex(GLASS[(i + 1) % 4], PAL.white, 0.25), night ? 0.5 : 0.95);
    for (const da of [-0.075, 0.075]) { const [qx, qy] = pol(0.79, ac + da); g.beginPath(); g.arc(qx, qy, r * 0.032, 0, TAU); g.fill(); g.stroke(); }
    g.beginPath(); g.arc(tx, ty, r * 0.034, 0, TAU); g.fill(); g.stroke();
    g.restore();
    // 内圈分格：瓣中线把内段分成两格
    g.strokeStyle = rgba(lead, 0.9); g.lineWidth = r * 0.022; g.lineCap = 'round';
    g.beginPath(); g.moveTo(...pol(0.37, ac)); g.lineTo(...pol(0.64, ac)); g.stroke();
    // 瓣间小圆花（落在两瓣之间的铅缝上）
    const [rx, ry] = pol(0.87, ac + TAU / 16);
    g.fillStyle = mixHex(i % 2 ? PAL.crystal : PAL.gold, PAL.white, night ? 0 : 0.2);
    g.lineWidth = r * 0.016;
    g.beginPath(); g.arc(rx, ry, r * 0.058, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = rgba(PAL.white, night ? 0.25 : 0.7); g.beginPath(); g.arc(rx - r * 0.014, ry - r * 0.014, r * 0.016, 0, TAU); g.fill();
  }
  g.strokeStyle = rgba(lead, 0.9); g.lineWidth = r * 0.026; g.beginPath(); g.arc(x, y, r * 0.645, 0, TAU); g.stroke();
  // 金心：八角星 + 一圈小珠
  const st = new Path2D();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU - Math.PI / 2, rr_ = i % 2 ? 0.14 : 0.27; const [px, py] = pol(rr_, a); i ? st.lineTo(px, py) : st.moveTo(px, py); }
  st.closePath();
  cut(g, st, mixHex(P.goldLight, PAL.white, night ? 0 : 0.25), { rim: PAL.white, rimW: r * 0.01 });
  g.fillStyle = P.goldDark;
  for (let i = 0; i < 16; i++) { const [px, py] = pol(0.31, (i / 16) * TAU); g.beginPath(); g.arc(px, py, r * 0.012, 0, TAU); g.fill(); }
  // 逆光玻璃的左上高光
  if (!night) {
    g.globalCompositeOperation = 'screen';
    g.fillStyle = rad(g, x - r * 0.35, y - r * 0.4, 0, r * 0.9, [[0, rgba(PAL.white, 0.2)], [1, rgba(PAL.white, 0)]]);
    g.beginPath(); g.arc(x, y, r * 0.96, 0, TAU); g.fill();
  }
  g.restore();
}

function drawDoor(g, t, o, light, P) {
  const G = geo().door, D = THRONE.door;
  const k = clamp(o.door ?? 0);
  // 门洞里：昏暗走廊，尽头一点暖光
  g.save();
  g.clip(G.open);
  g.fillStyle = lin(g, 0, D.y0, 0, D.y1, [[0, mixHex(P.ink, P.shadow, 0.5)], [1, mixHex(P.inkSoft, P.shadow, 0.3)]]);
  g.fillRect(D.x0 - 10, D.y0 - 10, D.x1 - D.x0 + 20, D.y1 - D.y0 + 20);
  if (k > 0) {
    glow(g, D.x + 6, 742, 86, PAL.goldLight, 0.35 * k);
    g.fillStyle = rgba(mixHex(P.stone, P.shadow, 0.5), 0.8);
    g.fillRect(D.x0, 818, D.x1 - D.x0, 40);
  }
  // 两扇门：以门框为铰链向里开（宽度按开度收窄）
  const leaf = (x0, dir) => {
    const w = 90 * (1 - 0.84 * k);
    const xl = dir > 0 ? x0 : x0 - w;
    g.save();
    g.beginPath(); g.rect(xl, D.y0 - 2, w, D.y1 - D.y0 + 4); g.clip();
    g.fillStyle = lin(g, xl, 0, xl + w, 0, [[0, mixHex(P.wood, P.woodDark, k * 0.4)], [1, mixHex(P.wood, P.woodDark, 0.35 + k * 0.3)]]);
    g.fillRect(xl, D.y0 - 2, w, D.y1 - D.y0 + 4);
    g.strokeStyle = rgba(P.woodDark, 0.7); g.lineWidth = 2;
    g.beginPath();
    for (let i = 1; i < 4; i++) { const px = xl + (w * i) / 4; g.moveTo(px, D.y0); g.lineTo(px, D.y1); }
    g.stroke();
    for (const by of [640, 734, 818]) {
      g.fillStyle = mixHex(P.inkSoft, P.stoneDark, 0.3); g.fillRect(xl, by, w, 9);
      g.fillStyle = rgba(P.stone, 0.8);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(xl + w * (0.2 + 0.3 * i), by + 4.5, 2, 0, TAU); g.fill(); }
    }
    const hx = dir > 0 ? xl + w - 14 * (1 - 0.84 * k) : xl + 14 * (1 - 0.84 * k);
    g.strokeStyle = P.gold; g.lineWidth = 3; g.beginPath(); g.arc(hx, 732, 8 * (1 - 0.6 * k) + 2, 0, TAU); g.stroke();
    g.restore();
  };
  leaf(D.x0, 1); leaf(D.x1, -1);
  // 门缝阴影
  if (k < 0.05) { g.strokeStyle = rgba(P.shadow, 0.55); g.lineWidth = 2; g.beginPath(); g.moveTo(D.x, D.y0 + 2); g.lineTo(D.x, D.y1); g.stroke(); }
  g.restore();
  // 门框：拱石 + 侧石 + 拱心石
  for (const j of G.jambs) cut(g, j, mixHex(P.stone, P.paper2, 0.2), { rim: rgba(PAL.white, 0.4), rimW: 2 });
  G.vous.forEach((v, i) => { cut(g, v, i === 4 ? mixHex(P.stone2, P.gold, 0.25) : mixHex(P.stone, P.paper2, 0.15), { shadow: 2, rim: rgba(PAL.white, 0.45), rimW: 2 }); shade(g, v, P.stoneDark, D.x - 130, 480, D.x + 130, 640, 0.0, 0.25); });
  g.fillStyle = P.gold; g.beginPath(); g.arc(D.x, G.cy - G.r - 20, 5, 0, TAU); g.fill();
}

// ———————————————————— mid：柱、长幡、壁烛、花环、圣旨 ————————————————————
function drawMid(g, t, o, light, P) {
  const G = geo();
  const night = light === 'night';
  const candles = o.candles ?? night;
  const garland = o.garland ?? light === 'festive';
  for (const C of G.cols) drawColumn(g, C, P, light);
  for (const C of G.cols) drawSconce(g, C.x, t, candles, P);
  if (garland) drawGarland(g, t, P);
  THRONE.bannerCols.forEach((x, i) => drawBanner(g, x, t, i, P));
  if (o.ruler) drawRuler(g, t, o.ruler, P);
  if (o.decree && o.decree.layer !== 'main') drawDecreeBanner(g, t, o.decree);
}

function drawColumn(g, C, P, light) {
  const x = C.x, stone = mixHex(P.stone, P.paper2, 0.15);
  cut(g, C.shaft, stone);
  // 竖向凹槽 + 右侧背光
  g.save();
  g.clip(C.shaft);
  g.strokeStyle = rgba(P.stoneDark, 0.16); g.lineWidth = 3;
  g.beginPath(); for (const dx of [-28, -9, 10, 29]) { g.moveTo(x + dx, -760); g.lineTo(x + dx, 834); } g.stroke();
  g.strokeStyle = rgba(P.white, 0.18); g.lineWidth = 2;
  g.beginPath(); for (const dx of [-25, -6, 13]) { g.moveTo(x + dx, -760); g.lineTo(x + dx, 834); } g.stroke();
  g.fillStyle = lin(g, x - 48, 0, x + 48, 0, [[0, rgba(PAL.white, 0.22)], [0.12, rgba(PAL.white, 0.0)], [0.55, rgba(P.shadow, 0.0)], [1, rgba(P.shadow, 0.36)]]);
  g.fillRect(x - 50, -760, 100, 1600);
  g.restore();
  // 柱头
  cut(g, C.echinus, mixHex(P.stone2, P.paper2, 0.3), { rim: rgba(PAL.white, 0.5), rimW: 2 });
  shade(g, C.echinus, P.shadow, x - 60, 0, x + 60, 0, 0, 0.3);
  cut(g, C.abacus, mixHex(P.stone2, P.paper2, 0.2), { shadow: 2.5, rim: rgba(PAL.white, 0.55), rimW: 2.5 });
  shade(g, C.abacus, P.shadow, x - 66, 0, x + 66, 0, 0, 0.3);
  cut(g, C.neck, P.gold, { rim: P.goldLight, rimW: 1.5 });
  // 柱础
  cut(g, C.band, P.gold, { rim: P.goldLight, rimW: 1.5 });
  cut(g, C.torus, mixHex(P.stone2, P.paper2, 0.3), { shadow: 2, rim: rgba(PAL.white, 0.5), rimW: 2.5 });
  shade(g, C.torus, P.shadow, x - 57, 0, x + 57, 0, 0, 0.32);
  cut(g, C.plinth, mixHex(P.stone2, P.stoneDark, 0.15), { shadow: 2.5, rim: rgba(PAL.white, 0.4), rimW: 2.5 });
  shade(g, C.plinth, P.shadow, x - 64, 0, x + 64, 0, 0, 0.32);
}

function drawSconce(g, x, t, lit, P) {
  const y = THRONE.sconceY;
  // 壁板（钉在柱面的金色长圆牌）+ 托杯 + 接蜡盘
  const plate = blob(x, y + 30, 9, 24, { seed: 1210 + x, n: 24 });
  cut(g, plate, P.goldDark, { shadow: 2, rim: P.gold, rimW: 2 });
  g.fillStyle = P.gold; g.beginPath(); g.arc(x, y + 30, 3.5, 0, TAU); g.fill();
  cut(g, blob(x, y + 9, 19, 4.5, { seed: 1200 + x, n: 20 }), P.gold, { rim: P.goldLight, rimW: 1.5 });
  cut(g, rr(x - 10, y - 4, 20, 12, 4), P.gold, { rim: P.goldLight, rimW: 1.5 });
  shade(g, rr(x - 10, y - 4, 20, 12, 4), P.goldDark, x - 10, 0, x + 10, 0, 0, 0.5);
  // 蜡烛
  const cand = rr(x - 6, y - 44, 12, 42, 3);
  cut(g, cand, mixHex(P.paper, P.white, 0.5), { rim: rgba(PAL.white, 0.8), rimW: 1.5 });
  shade(g, cand, P.shadow, x - 6, 0, x + 6, 0, 0, 0.25);
  g.fillStyle = mixHex(P.paper, P.white, 0.6); g.beginPath(); g.ellipse(x + 4, y - 30, 2.2, 6, 0, 0, TAU); g.fill();
  g.strokeStyle = P.ink; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y - 44); g.lineTo(x + 0.5, y - 50); g.stroke();
  if (!lit) return;
  // 火苗（纸片火：外焰 fire2、内焰 goldLight，随 t 摇曳）
  const fl = 1 + 0.14 * noise1(t * 7 + x * 0.01, 3) + 0.06 * Math.sin(t * 23 + x);
  const lean = noise1(t * 3 + x * 0.02, 9) * 0.18;
  g.save();
  g.translate(x, y - 48); g.rotate(lean); g.scale(1, fl);
  const outer = new Path2D(); outer.moveTo(0, -24); outer.bezierCurveTo(8, -12, 8, -2, 0, 3); outer.bezierCurveTo(-8, -2, -8, -12, 0, -24);
  const inner = new Path2D(); inner.moveTo(0, -14); inner.bezierCurveTo(4.5, -7, 4.5, -1, 0, 2); inner.bezierCurveTo(-4.5, -1, -4.5, -7, 0, -14);
  g.fillStyle = PAL.fire2; g.fill(outer);
  g.fillStyle = PAL.goldLight; g.fill(inner);
  g.restore();
}

function drawBanner(g, x, t, i, P) {
  const top = THRONE.bannerY0, bot = THRONE.bannerY1, hw = 56;
  const sway = Math.sin(t * 0.8 + i * 2.1) * 3.2 + noise1(t * 0.5, 40 + i) * 3;
  const pts = [];
  for (let k = 0; k <= 8; k++) { const u = k / 8, y = lerp(top + 4, bot, u); pts.push([x + hw + sway * u ** 1.4 + Math.sin(u * 5 + t * 1.3 + i) * 1.2, y]); }
  pts.push([x + sway * 0.98, bot - 36]);
  for (let k = 8; k >= 0; k--) { const u = k / 8, y = lerp(top + 4, bot, u); pts.push([x - hw + sway * u ** 1.4 + Math.sin(u * 5 + t * 1.3 + i + 1.7) * 1.2, y]); }
  const path = poly(pts, { seed: 1300 + i, amp: 0.6, step: 30 });
  cut(g, path, P.red, { shadow: 3.5 });
  g.save();
  g.clip(path);
  g.lineWidth = 17; g.strokeStyle = P.gold; g.stroke(path);
  g.lineWidth = 8; g.strokeStyle = P.red; g.stroke(path);
  g.lineWidth = 2; g.strokeStyle = rgba(P.goldLight, 0.6); g.stroke(path);
  g.fillStyle = lin(g, x - hw, 0, x + hw, 0, [[0, rgba(PAL.white, 0.12)], [0.3, rgba(PAL.white, 0)], [0.65, rgba(P.redDark, 0)], [1, rgba(P.redDeep, 0.45)]]);
  g.fillRect(x - hw - 10, top, hw * 2 + 30, bot - top + 10);
  // 竖向布褶
  g.strokeStyle = rgba(P.redDeep, 0.25); g.lineWidth = 3;
  g.beginPath(); for (const dx of [-24, 18]) { g.moveTo(x + dx, top + 20); g.quadraticCurveTo(x + dx + sway * 0.4, (top + bot) / 2, x + dx + sway * 0.8, bot - 30); } g.stroke();
  g.restore();
  // 金盾：金边、深红底、小王冠
  const sx = x + sway * 0.35, sy = 262;
  const sh = shieldPath(sx, sy, 30, 38);
  cut(g, sh, P.gold, { shadow: 2, rim: P.goldLight, rimW: 2 });
  shade(g, sh, P.goldDark, sx - 30, sy - 38, sx + 30, sy + 38, 0, 0.55);
  const shIn = shieldPath(sx, sy + 1, 22.5, 29);
  cut(g, shIn, P.redDark);
  g.fillStyle = P.gold;
  g.beginPath();
  g.moveTo(sx - 13, sy + 8); g.lineTo(sx - 15, sy - 9); g.lineTo(sx - 7, sy - 1); g.lineTo(sx, sy - 13); g.lineTo(sx + 7, sy - 1); g.lineTo(sx + 15, sy - 9); g.lineTo(sx + 13, sy + 8); g.closePath();
  g.fill();
  g.fillRect(sx - 13, sy + 10, 26, 4);
  g.fillStyle = P.goldLight; for (const dx of [-15, 0, 15]) { g.beginPath(); g.arc(sx + dx, sy + (dx ? -10 : -14), 2.4, 0, TAU); g.fill(); }
  // 横杆 + 两端金球
  cut(g, rr(x - 74, top - 5, 148, 9, 4.5), P.goldDark, { rim: P.gold, rimW: 2 });
  for (const ex of [-80, 80]) cut(g, blob(x + ex, top - 0.5, 8.5, 8.5, { seed: 1310 + ex, n: 18 }), P.gold, { rim: P.goldLight, rimW: 1.5 });
}

function drawGarland(g, t, P) {
  const G = geo().garland;
  g.save();
  g.translate(0, Math.sin(t * 0.7) * 1.2);
  // 先画一层暗色错位，再画本体（纸片分层）
  g.save(); g.translate(2.5, 3.5); g.fillStyle = rgba(P.shadow, 0.25); g.fill(G.leafA); g.fill(G.leafB); g.restore();
  g.fillStyle = P.grass; g.fill(G.leafA);
  g.fillStyle = P.leafLight; g.fill(G.leafB);
  g.fillStyle = P.princessLight; g.fill(G.flA);
  g.fillStyle = mixHex(P.heart, P.princessLight, 0.35); g.fill(G.flB);
  g.fillStyle = mixHex(P.goldLight, P.white, 0.3); g.fill(G.flC);
  g.fillStyle = P.gold; g.fill(G.ctr);
  g.restore();
  // 系结处的玫瑰结
  for (const x of G.ties) {
    for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU; cut(g, blob(x + Math.cos(a) * 10, 152 + Math.sin(a) * 8, 10, 8, { seed: 1400 + x + q, n: 16 }), q % 2 ? P.heart : P.princess); }
    cut(g, blob(x, 152, 8, 8, { seed: 1450 + x }), P.gold, { rim: P.goldLight, rimW: 1.5 });
    g.strokeStyle = P.heart; g.lineWidth = 5; g.lineCap = 'round';
    const sw = Math.sin(t * 1.1 + x) * 4;
    g.beginPath(); g.moveTo(x - 4, 160); g.quadraticCurveTo(x - 10 + sw * 0.5, 190, x - 6 + sw, 222); g.moveTo(x + 4, 160); g.quadraticCurveTo(x + 12 + sw * 0.5, 186, x + 10 + sw, 214); g.stroke();
  }
}

function drawRuler(g, t, marks, P) {
  const x = 780;
  for (const m of marks) {
    const age = t - (m.at ?? -Infinity);
    if (age < 0) continue;
    const y = rulerY(m.h);
    const k = clamp(age / 0.25);
    const w = 46 * outBack(k, 2);
    g.save();
    g.strokeStyle = rgba(P.inkSoft, 0.85); g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - w * 0.5, y + 1); g.lineTo(x + w * 0.5, y - 1); g.stroke();
    g.restore();
    const ss = 13 * outBack(clamp((age - 0.08) / 0.25), 2.5);
    if (ss > 0) { cut(g, starPath(x + 34, y - 2, ss, ss * 0.45), P.gold, { rim: P.goldLight, rimW: 1.2 }); sparkle(g, x + 34, y - 2, ss * 1.6 * Math.exp(-age * 3), { color: PAL.goldLight, alpha: 0.9 }); }
  }
}

/** 圣旨横幅的 drawDecree 参数（mid 层坐标）。prints 数组优先（三段金印砸下时刻，带砸印动画）；否则按 chars 阈值整段印好。 */
function decreeOpts(t, d) {
  const D = THRONE.decree, F = D.from;
  const k = clamp(d.hung ?? 1);
  const len = lerp(F.len, D.x1 - D.x0, k), width = lerp(F.width, D.y1 - D.y0, k);
  const cx = lerp(F.cx, D.cx, k), cy = lerp(F.cy, D.cy, k);
  const parts = charsOf('hero').length;
  const n = typeof d.chars === 'number' ? d.chars : parts;
  // chars 为数字时按段印出：≥4 印第一段、≥8 第二段、≥13 第三段（与 N4 金印三段一致）
  const prints = Array.isArray(d.prints) ? d.prints : [n >= 4 ? -1e6 : 1e6, n >= 8 ? -1e6 : 1e6, n >= 13 ? -1e6 : 1e6];
  return { x: cx - len / 2, y: cy, len, width, unroll: d.unroll ?? 1, hung: k, sag: 16 * k, ropeH: lerp(60, 140, k), sweep: d.sweep ?? -1, charSize: 64, prints, printDur: d.printDur ?? 0.22, t, seed: 12 };
}
function drawDecreeBanner(g, t, d) {
  return drawDecree(g, decreeOpts(t, d));
}
/** 圣旨的视在深度：默认 mid（0.8）；layer:'main' 时随 hung 从 1（地上，与角色同平面）滑到 0.8（挂成横幅，与柱对齐）。 */
function decreeDepth(d, flat) {
  const da = d.layer === 'main' ? lerp(THRONE_DEPTH.main, THRONE_DEPTH.mid, clamp(d.hung ?? 1)) : THRONE_DEPTH.mid;
  return da + (1 - da) * flatK(flat);
}
/** 在深度 dl 的图层里按视在深度 da 画：Q = C_l + (z_a / z_l)(P − C_a)（旋转绕屏幕中心，两层相同，互相抵消）。 */
function atDepth(g, c, dl, da) {
  const k = zOf(c, da) / zOf(c, dl);
  g.translate(960 + (c.x - 960) * dl - (960 + (c.x - 960) * da) * k, 540 + (c.y - 540) * dl - (540 + (c.y - 540) * da) * k);
  g.scale(k, k);
}

// ———————————————————— main：地面、红毯、光斑、台阶、王座 ————————————————————
function drawMain(g, t, o, light, P, c) {
  const G = geo();
  // 地面：方砖（浅：奶油石；深：暖灰石）
  const tileA = mixHex(P.paper, P.stone, 0.35), tileB = mixHex(P.stone2, P.kraftDark, 0.28);
  g.fillStyle = tileA; g.fillRect(-1800, 878, 5600, 1100);
  g.fillStyle = tileB; g.fill(G.tiles.dark);
  g.fillStyle = rgba(PAL.white, light === 'night' ? 0.04 : 0.13); g.fill(G.tiles.gloss);
  g.strokeStyle = rgba(P.stoneDark, 0.22); g.lineWidth = 1.6; g.stroke(G.tiles.grout);
  g.fillStyle = lin(g, 0, 878, 0, 1500, [[0, rgba(P.shadow, 0.18)], [0.12, rgba(P.shadow, 0)], [0.5, rgba(P.shadow, 0.12)], [1, rgba(P.shadow, 0.4)]]);
  g.fillRect(-1800, 878, 5600, 1100);
  // 红毯
  drawCarpet(g, t, P, light);
  // 彩窗光斑
  if (light === 'sunny' || light === 'festive') drawLightSpots(g, t, light === 'festive' ? 1.25 : 1, o.beams ?? 1);
  if (light === 'night' && (o.moonlight ?? 1) > 0) drawMoonSpot(g, t, o.moonlight ?? 1);
  // 台阶 + 王座台
  drawSteps(g, P);
  // 纸通道（在台阶之上、王座之下）
  if (o.aisle) drawAisle(g, t, o.aisle, P);
  drawThrone(g, t, P, light);
  if (o.lectern) drawLectern(g, P);
  if (o.confettiFloor) drawConfetti(g, o.confettiFloor, P);
  // 圣旨放在 main（在王座、台阶之前；地上展开时与角色同平面）
  if (o.decree && o.decree.layer === 'main') {
    g.save(); atDepth(g, c, throneDepth('main', o.flat), decreeDepth(o.decree, o.flat)); drawDecreeBanner(g, t, o.decree); g.restore();
  }
}

function drawCarpet(g, t, P, light) {
  const G = geo().carpet, C = THRONE.carpet;
  // 近侧厚度与落在地上的阴影
  g.fillStyle = rgba(P.shadow, 0.3); g.fillRect(C.x0 + 4, C.y1 + 2, C.x1 - C.x0, 9);
  cut(g, G.edge, mixHex(P.redDeep, P.redDark, 0.3));
  cut(g, G.body, P.red, { rim: mixHex(P.red, P.goldLight, 0.45), rimW: 2 });
  g.save();
  g.clip(G.body);
  g.fillStyle = lin(g, 0, C.y0, 0, C.y1, [[0, rgba(PAL.white, 0.1)], [0.35, rgba(PAL.white, 0)], [1, rgba(P.redDeep, 0.38)]]);
  g.fillRect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0);
  g.strokeStyle = P.gold; g.lineWidth = 3.2;
  g.beginPath(); g.moveTo(C.x0, 877); g.lineTo(C.x1, 877); g.moveTo(C.x0, 950); g.lineTo(C.x1, 950); g.stroke();
  g.strokeStyle = rgba(P.goldDark, 0.8); g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(C.x0, 883); g.lineTo(C.x1, 883); g.moveTo(C.x0, 944); g.lineTo(C.x1, 944); g.stroke();
  g.fillStyle = mixHex(P.gold, P.red, 0.15); g.fill(G.dia);
  g.fillStyle = rgba(P.goldLight, 0.7); g.fill(G.dots);
  g.restore();
  g.strokeStyle = P.gold; g.lineWidth = 2; g.stroke(G.fringe);
}

/** 晴天彩窗光斑：两个斜投的尖拱形，四色竖条 + 金色柔光；随时间轻移。 */
function spotPts(i, t) {
  const [a, b] = THRONE.lightSpots[i];
  const W = (b - a) * 0.62, SH = (b - a) * 0.38, cx = a + W / 2;
  const dx = fbm1(t * 0.11, 70 + i) * 12, dy = fbm1(t * 0.09, 80 + i) * 3;
  const map = (u, v) => [cx + dx + u * W * (1 + 0.32 * v) + v * SH, 880 + dy + v * 112];
  return { map, W, SH };
}
const SPOT_LANCET = (() => archPts(0, 0.866, 0.5, 1, 2.6, 10).map(([x, y]) => [x, 1 - y / 2.6]))(); // (u, v)：v 0 远端窗台、1 近端拱尖
function drawLightSpots(g, t, k, beams) {
  const a = k * beams;
  if (a <= 0) return;
  for (let i = 0; i < 2; i++) {
    const { map } = spotPts(i, t);
    const path = pathOfPts(SPOT_LANCET.map(([u, v]) => map(u, v)));
    const strip = (s0) => pathOfPts([map(-0.5 + s0 / 4, -0.1), map(-0.25 + s0 / 4, -0.1), map(-0.25 + s0 / 4, 1.1), map(-0.5 + s0 / 4, 1.1)]);
    g.save();
    // 柔光晕
    g.globalCompositeOperation = 'screen';
    g.shadowColor = rgba(PAL.goldLight, 0.4 * a); g.shadowBlur = 26;
    g.fillStyle = rgba(PAL.goldLight, 0.08 * a); g.fill(path);
    g.shadowColor = 'transparent';
    g.clip(path);
    // 四色玻璃投下的色条：先提亮（screen）再留一点本色（source-over），浅色地砖上也看得出颜色
    for (let q = 0; q < 4; q++) { g.fillStyle = rgba(GLASS[(q + i) % 4], 0.4 * a); g.fill(strip(q)); }
    g.globalCompositeOperation = 'source-over';
    for (let q = 0; q < 4; q++) { g.fillStyle = rgba(GLASS[(q + i) % 4], 0.13 * a); g.fill(strip(q)); }
    // 铅条投下的细暗线
    g.strokeStyle = rgba(PAL.shadow, 0.12 * a); g.lineWidth = 2;
    g.beginPath(); for (let q = 1; q < 4; q++) { const [x0, y0] = map(-0.5 + q / 4, 0), [x1, y1] = map(-0.5 + q / 4, 1); g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke();
    g.restore();
  }
}
function drawMoonSpot(g, t, a) {
  const W = THRONE.windows.R;
  const map = (u, v) => [W.x + 70 + u * 150 * (1 + 0.3 * v) + v * 50, 884 + v * 100];
  g.save();
  g.globalCompositeOperation = 'screen';
  // 三层渐小的半透明月光（纸片叠出来的柔边）
  for (const [k, al] of [[1.18, 0.05], [1.0, 0.07], [0.78, 0.08]]) {
    g.fillStyle = rgba(mixHex(PAL.moon, PAL.skyDayLow, 0.5), al * a);
    g.fill(pathOfPts(SPOT_LANCET.map(([u, v]) => map(u * k, 0.5 + (v - 0.5) * k))));
  }
  g.restore();
}

function drawSteps(g, P) {
  const G = geo();
  const stone = mixHex(P.stone, P.paper2, 0.2);
  for (const S of G.steps) {
    cut(g, S.face, stone, { shadow: 3, rim: mixHex(P.stone, P.white, 0.4), rimW: 2.5 });
    g.save(); g.clip(S.face);
    g.fillStyle = lin(g, 0, S.top, 0, S.bot, [[0, rgba(PAL.white, 0.12)], [0.3, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.3)]]);
    g.fillRect(S.x - 10, S.top, 3200, S.bot - S.top + 4);
    g.strokeStyle = rgba(P.stoneDark, 0.3); g.lineWidth = 1.5;
    for (const p of S.panels) g.stroke(p);
    // 左端立面受光
    g.fillStyle = rgba(PAL.white, 0.25); g.fillRect(S.x, S.top, 5, S.bot - S.top + 2);
    g.restore();
    cut(g, S.nose, P.gold, { rim: P.goldLight, rimW: 1.5 });
  }
  // 王座台顶层垂下的红毯（金边 + 流苏）
  cut(g, G.dais.runner, P.red, { shadow: 2.5, rim: mixHex(P.red, P.goldLight, 0.4), rimW: 2 });
  g.save(); g.clip(G.dais.runner);
  g.fillStyle = rgba(P.redDeep, 0.3); g.fillRect(1420, 804, 1600, 10);
  g.strokeStyle = P.gold; g.lineWidth = 2.5; g.beginPath(); g.moveTo(1422, 795); g.lineTo(3000, 795); g.stroke();
  g.restore();
  g.strokeStyle = P.gold; g.lineWidth = 1.8; g.stroke(G.dais.runFr);
}

function drawThrone(g, t, P, light) {
  const H = geo().throne, T = THRONE.throne, x = T.x;
  const gold = P.gold, goldD = P.goldDark, goldL = P.goldLight;
  // 底座
  cut(g, H.pedestal, mixHex(P.stone2, P.goldDark, 0.25), { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 2 });
  cut(g, H.pedTop, gold, { rim: goldL, rimW: 1.5 });
  // 靠背：金框 → 丝绒 → 拉扣
  cut(g, H.frame, gold, { shadow: 4, rim: goldL, rimW: 2.5 });
  shade(g, H.frame, goldD, x - 110, 0, x + 110, 0, 0, 0.55);
  cut(g, H.velvet, P.redDark);
  g.save(); g.clip(H.velvet);
  g.fillStyle = lin(g, x - 92, 0, x + 92, 0, [[0, rgba(PAL.white, 0.08)], [0.4, rgba(PAL.white, 0)], [1, rgba(P.redDeep, 0.5)]]);
  g.fillRect(x - 95, 440, 190, 220);
  g.strokeStyle = rgba(P.redDeep, 0.55); g.lineWidth = 2; g.stroke(H.tufts);
  g.fillStyle = gold; g.fill(H.buttons);
  g.restore();
  // 靠背顶：两侧金球 + 星形顶饰（红宝石心）
  for (const k of H.knobs) { cut(g, k, gold, { rim: goldL, rimW: 1.5 }); shade(g, k, goldD, x - 120, 440, x + 120, 465, 0, 0.5); }
  g.save(); g.strokeStyle = goldD; g.lineWidth = 5; g.beginPath(); g.moveTo(x, 428); g.lineTo(x, 418); g.stroke(); g.restore();
  cut(g, H.star, gold, { shadow: 2.5, rim: goldL, rimW: 2 });
  shade(g, H.star, goldD, x - 25, 380, x + 25, 428, 0, 0.5);
  cut(g, H.starIn, mixHex(gold, goldL, 0.5));
  cut(g, blob(x, T.star[1] + 1, 5.5, 5.5, { seed: 921, n: 16 }), P.red, { rim: mixHex(P.red, PAL.white, 0.5), rimW: 1.2 });
  if (light !== 'gray') sparkle(g, x - 9, T.star[1] - 8, 9 * (0.4 + 0.6 * Math.max(0, Math.sin(t * 1.7))), { color: PAL.white, alpha: light === 'night' ? 0.4 : 0.85, rot: 0.2 });
  // 扶手
  for (const [arm, pad, sc, sx] of [[H.armL, H.padL, H.scrollL, -1], [H.armR, H.padR, H.scrollR, 1]]) {
    cut(g, arm, gold, { shadow: 2.5, rim: goldL, rimW: 2 });
    shade(g, arm, goldD, x + sx * 96, 0, x + sx * 142, 0, sx < 0 ? 0.35 : 0, sx < 0 ? 0 : 0.5);
    cut(g, pad, P.red, { rim: mixHex(P.red, PAL.white, 0.35), rimW: 2 });
    cut(g, sc, goldD, { rim: gold, rimW: 2 });
  }
  // 坐垫
  cut(g, H.cushion, P.red, { shadow: 2.5, rim: mixHex(P.red, PAL.white, 0.35), rimW: 2.5 });
  shade(g, H.cushion, P.redDeep, 0, 646, 0, 680, 0, 0.45);
  g.save(); g.strokeStyle = P.gold; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 118, 676); g.lineTo(x + 118, 676); g.stroke(); g.restore();
  // 前裙板 + 金框 + 徽章 + 狮爪脚
  cut(g, H.skirt, P.redDark, { shadow: 2 });
  g.save(); g.clip(H.skirt); g.lineWidth = 14; g.strokeStyle = gold; g.stroke(H.skirt); g.lineWidth = 6; g.strokeStyle = P.redDark; g.stroke(H.skirt);
  g.fillStyle = lin(g, x - 120, 0, x + 120, 0, [[0, rgba(PAL.white, 0.06)], [1, rgba(P.redDeep, 0.45)]]); g.fillRect(x - 125, 670, 250, 100);
  g.restore();
  cut(g, H.medal, gold, { rim: goldL, rimW: 1.5 });
  cut(g, starPath(x, 719, 10, 4.5), mixHex(gold, goldL, 0.5));
  for (const f of H.feet) cut(g, f, goldD, { rim: gold, rimW: 2 });
}

function drawLectern(g, P) {
  const L = THRONE.lectern, x = L.x;
  cut(g, pcut([[x - 40, 882], [x + 40, 882], [x + 30, 866], [x - 30, 866]], 1500, 0.6), P.woodDark, { shadow: 2.5, rim: P.wood, rimW: 2 });
  cut(g, rr(x - 8, 760, 16, 108, 5), P.wood, { shadow: 2, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 2 });
  shade(g, rr(x - 8, 760, 16, 108, 5), P.shadow, x - 8, 0, x + 8, 0, 0, 0.4);
  const desk = pcut([[x - 64, 742], [x + 62, 722], [x + 66, 736], [x - 60, 758]], 1501, 0.6);
  cut(g, desk, P.woodDark, { shadow: 2.5, rim: P.wood, rimW: 2.5 });
  // 摊开的书 + 墨水瓶 + 鹅毛笔
  cut(g, pcut([[x - 52, 734], [x - 2, 726], [x + 2, 734], [x - 48, 744]], 1502, 0.4), mixHex(P.paper, PAL.white, 0.3), { rim: PAL.white, rimW: 1.5 });
  cut(g, pcut([[x + 2, 724], [x + 50, 716], [x + 52, 724], [x + 4, 732]], 1503, 0.4), P.paper, { rim: PAL.white, rimW: 1.5 });
  g.strokeStyle = rgba(P.inkSoft, 0.5); g.lineWidth = 1.2; g.beginPath();
  for (let k = 0; k < 3; k++) { g.moveTo(x - 44, 734 + k * 3 - k * 0.3); g.lineTo(x - 10, 728 + k * 3); g.moveTo(x + 10, 724 + k * 2.6); g.lineTo(x + 44, 718 + k * 2.6); }
  g.stroke();
  cut(g, blob(x + 56, 714, 7, 6, { seed: 1504 }), P.ink, { rim: P.inkSoft, rimW: 1.2 });
  g.fillStyle = mixHex(P.paper, PAL.white, 0.5);
  g.fill(ribbon([[x + 56, 712], [x + 66, 690], [x + 80, 674]], (u) => 1 + 6 * Math.sin(Math.PI * u)));
}

function drawAisle(g, t, p, P) {
  const pts = THRONE.aisle;
  const k = clamp(p);
  if (k <= 0) return;
  // 按弧长截取
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const end = L[L.length - 1] * k;
  const vis = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (L[i] <= end) vis.push(pts[i]);
    else { const u = (end - L[i - 1]) / (L[i] - L[i - 1]); vis.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); break; }
  }
  if (vis.length < 2) return;
  // 地上一段宽（48），上台阶后窄（16，侧看只见一窄条）
  const wAt = (pt) => (pt[0] <= 1300 ? 24 : 8);
  const band = ribbon(vis, vis.map(wAt));
  cut(g, band, P.paper, { shadow: 2, rim: PAL.white, rimW: 2 });
  g.save(); g.clip(band);
  g.strokeStyle = P.red; g.lineWidth = 4;
  g.beginPath(); g.moveTo(980, 900); g.lineTo(Math.min(1300, vis[vis.length - 1][0]), 900); g.moveTo(980, 940); g.lineTo(Math.min(1300, vis[vis.length - 1][0]), 940); g.stroke();
  // 墨迹字行（远看是纹理，不承担阅读）
  g.strokeStyle = rgba(P.ink, 0.55); g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath();
  for (let x = 996; x < Math.min(1288, end + 980); x += 22) { const h = 6 + hash2(x, 3) * 8; g.moveTo(x, 920 - h); g.lineTo(x + 10 + hash2(x, 5) * 6, 920 - h + 2); g.moveTo(x + 2, 922); g.lineTo(x + 12, 921 + hash2(x, 7) * 6); }
  g.stroke();
  g.restore();
}

function drawConfetti(g, amt, P) {
  const k = clamp(amt);
  g.save();
  for (const c of geo().confetti) {
    if (c.ord > k) continue;
    g.save();
    g.translate(c.x, c.y);
    g.scale(1, 0.48);
    g.rotate(c.rot);
    g.fillStyle = P[c.c];
    if (c.k === 0) g.fillRect(-7 * c.s, -4 * c.s, 14 * c.s, 8 * c.s);
    else if (c.k === 1) { g.beginPath(); g.arc(0, 0, 4.5 * c.s, 0, TAU); g.fill(); }
    else g.fillRect(-10 * c.s, -2.2 * c.s, 20 * c.s, 4.4 * c.s);
    g.restore();
  }
  g.restore();
}

// ———————————————————— fg：虚化立柱、帷幔 ————————————————————
function drawFg(g, t, o, light, P, c) {
  const G = geo().drape;
  if (o.fgPillars !== false) {
    for (const [i, x] of THRONE.fgCols.entries()) {
      // 'auto'（默认）：立柱滑进画面中部（离中线 < 560px）时淡出，只在宽景里当画框；true 强制显示
      const sx = toScreen(c, throneDepth('fg', o.flat), x, 540)[0];
      const fa = o.fgPillars === true ? 1 : clamp((Math.abs(sx - 960) - 560) / 220);
      if (fa <= 0) continue;
      g.save();
      g.globalAlpha *= fa;
      const p = pcut(rectPts(x - 78, -2400, x + 78, 2800), 1600 + i, 1, 60);
      const base = mixHex(mixHex(P.stoneDark, P.stone2, 0.25), P.redDeep, 0.1);
      cut(g, p, base);
      g.save(); g.clip(p);
      g.fillStyle = lin(g, x - 78, 0, x + 78, 0, [[0, rgba(mixHex(P.stone, PAL.white, 0.2), 0.45)], [0.18, rgba(P.stone, 0.08)], [1, rgba(P.ink, 0.4)]]);
      g.fillRect(x - 80, -2400, 160, 5200);
      g.fillStyle = mixHex(P.goldDark, P.ink, 0.25);
      g.fillRect(x - 80, 70, 160, 16); g.fillRect(x - 80, 880, 160, 18);
      g.fillStyle = rgba(P.goldLight, 0.4); g.fillRect(x - 80, 70, 160, 3); g.fillRect(x - 80, 880, 160, 3);
      g.restore();
      g.restore();
    }
  }
  // 顶部帷幔：上沿横带 → 一排垂花 → 金流苏 → 系结流苏
  const red = P.redDark;
  cut(g, G.band, mixHex(red, P.redDeep, 0.25));
  g.strokeStyle = rgba(P.redDeep, 0.5); g.lineWidth = 9; g.stroke(G.stripes);
  for (const s of G.swags) cut(g, s, red, { shadow: 3, rim: mixHex(red, P.red, 0.6), rimW: 3 });
  g.strokeStyle = rgba(P.redDeep, 0.55); g.lineWidth = 3; g.stroke(G.folds);
  g.strokeStyle = rgba(mixHex(red, P.red, 0.7), 0.5); g.lineWidth = 1.5; g.save(); g.translate(0, -3); g.stroke(G.folds); g.restore();
  g.strokeStyle = P.gold; g.lineWidth = 2.2; g.stroke(G.fringe);
  cut(g, G.rope, P.gold, { rim: P.goldLight, rimW: 1.5 });
  for (let i = 0; i <= 18; i++) {
    const x = -1600 + i * 300, sw = Math.sin(t * 1.2 + i * 1.7) * 0.05;
    g.save();
    g.translate(x, 16); g.rotate(sw);
    g.strokeStyle = P.goldDark; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 52); g.stroke();
    cut(g, blob(0, 52, 7, 7, { seed: 1700 + i, n: 14 }), P.gold, { rim: P.goldLight, rimW: 1.5 });
    const tas = new Path2D(); tas.moveTo(-5, 58); tas.lineTo(5, 58); tas.lineTo(12, 96); tas.quadraticCurveTo(0, 101, -12, 96); tas.closePath();
    cut(g, tas, P.gold, { rim: P.goldLight, rimW: 1.5 });
    g.strokeStyle = rgba(P.goldDark, 0.6); g.lineWidth = 1.2; g.beginPath(); for (const dx of [-6, -2, 2, 6]) { g.moveTo(dx * 0.6, 62); g.lineTo(dx * 1.6, 96); } g.stroke();
    g.restore();
  }
}

// ———————————————————— glow：光效（屏幕空间） ————————————————————
/** 柔边光柱：A → B，两端半宽 hwA / hwB；分段画，每段横向渐变（两边透明、中间亮），两端淡出。 */
function softBeam(g, A, B, hwA, hwB, color, aMax, slices = 10) {
  g.save();
  g.globalCompositeOperation = 'lighter'; // 相邻段共用边：加色混合下抗锯齿覆盖率正好相加，不出接缝
  const ax = B[0] - A[0], ay = B[1] - A[1], L = Math.hypot(ax, ay) || 1;
  const px = -ay / L, py = ax / L;
  for (let i = 0; i < slices; i++) {
    const s0 = i / slices, s1 = (i + 1) / slices, sm = (s0 + s1) / 2;
    const h0 = lerp(hwA, hwB, s0), h1 = lerp(hwA, hwB, s1), hm = lerp(hwA, hwB, sm);
    const c0 = [A[0] + ax * s0, A[1] + ay * s0], c1 = [A[0] + ax * s1, A[1] + ay * s1], cm = [A[0] + ax * sm, A[1] + ay * sm];
    const env = Math.sin(Math.PI * clamp(sm * 1.05)) ** 0.6;
    const gr = g.createLinearGradient(cm[0] - px * hm, cm[1] - py * hm, cm[0] + px * hm, cm[1] + py * hm);
    gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.5, rgba(color, aMax * env)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fill(pathOfPts([[c0[0] - px * h0, c0[1] - py * h0], [c0[0] + px * h0, c0[1] + py * h0], [c1[0] + px * h1, c1[1] + py * h1], [c1[0] - px * h1, c1[1] - py * h1]]));
  }
  g.restore();
}
function drawGlow(g, T, c, o, light, t) {
  const f = o.flat;
  const S = (layer, x, y) => throneToScreen(c, layer, x, y, f);
  const zB = zOf(c, throneDepth('back', f)), zM = zOf(c, throneDepth('main', f)), zMid = zOf(c, throneDepth('mid', f));
  g.save();
  if (light === 'sunny' || light === 'festive') {
    const k = (light === 'festive' ? 1.6 : 1) * (o.beams ?? 1);
    if (k > 0) {
      ['L', 'R'].forEach((key, i) => {
        const W = THRONE.windows[key];
        const top = [S('back', W.x - 70, 300), S('back', W.x + 70, 300), S('back', W.x - 72, 530), S('back', W.x + 72, 530)];
        const { map } = spotPts(i, t);
        const bot = [map(-0.5, 0), map(0.5, 0), map(-0.5, 0.75), map(0.5, 0.75), map(0, 1)].map(([x, y]) => S('main', x, y));
        const a = [(top[0][0] + top[1][0]) / 2, (top[0][1] + top[2][1]) / 2], b = S('main', ...map(0, 0.55));
        g.save();
        g.globalCompositeOperation = 'screen';
        softBeam(g, a, b, 96 * zB, 160 * zM, PAL.goldLight, 0.2 * k);
        softBeam(g, a, b, 42 * zB, 76 * zM, PAL.goldLight, 0.1 * k);
        void bot;
        // 光柱里的浮尘
        const perp = [-(b[1] - a[1]), b[0] - a[0]], pl = Math.hypot(...perp) || 1;
        for (let q = 0; q < 16; q++) {
          const s = fract(hash2(q, 11 + i) + t * (0.012 + hash2(q, 13) * 0.02));
          const w = (hash2(q, 17 + i) - 0.5) * 1.5 + Math.sin(t * 0.5 + q) * 0.08;
          const hw = lerp(75 * zB, 120 * zM, s);
          const px = lerp(a[0], b[0], s) + (perp[0] / pl) * w * hw, py = lerp(a[1], b[1], s) + (perp[1] / pl) * w * hw;
          const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash2(q, 19)) + q * 2.3);
          g.fillStyle = rgba(PAL.goldLight, 0.55 * tw * Math.sin(Math.PI * s));
          g.beginPath(); g.arc(px, py, (1.3 + hash2(q, 23) * 1.6) * zM, 0, TAU); g.fill();
        }
        g.restore();
        const wc = S('back', W.x, 380);
        glow(g, wc[0], wc[1], 150 * zB, PAL.goldLight, 0.22 * k);
      });
      const rc = S('back', THRONE.rose.x, THRONE.rose.y);
      glow(g, rc[0], rc[1], 260 * zB, PAL.goldLight, 0.18 * k);
    }
    if (light === 'festive') {
      g.save();
      g.globalCompositeOperation = 'screen';
      const top = S('back', 1000, -100), bot = S('back', 1000, 900);
      g.fillStyle = lin(g, 0, top[1], 0, bot[1], [[0, rgba(PAL.goldLight, 0.28)], [0.55, rgba(PAL.goldLight, 0.08)], [1, rgba(PAL.goldLight, 0)]]);
      g.fillRect(-200, -200, 2320, 1480);
      g.restore();
      field(g, t, { seed: 77, count: 44, x: -40, y: -40, w: 2000, h: 1000, vx: 6, vy: 22, sway: 24, size: [4, 9] }, (gg, x, y, s) => {
        const tw = Math.max(0, Math.sin(t * 2.2 + s.i * 1.9));
        sparkle(gg, x, y, s.size * 2.2 * tw * zM, { color: PAL.goldLight, alpha: 0.85 * tw, rot: s.rot * 0.2 });
        gg.fillStyle = rgba(PAL.goldLight, 0.35 * (1 - tw)); gg.beginPath(); gg.arc(x, y, s.size * 0.35 * zM, 0, TAU); gg.fill();
      });
    }
  } else if (light === 'night') {
    const candles = o.candles ?? true;
    if (candles) {
      for (const x of THRONE.cols) {
        const [sx, sy] = S('mid', x, THRONE.sconceY - 58);
        const fl = 0.86 + 0.14 * noise1(t * 6 + x * 0.01, 3);
        glow(g, sx, sy + 80 * zMid, 520 * zMid, PAL.fire, 0.16 * fl);
        glow(g, sx, sy, 300 * zMid, PAL.goldLight, 0.34 * fl);
        glow(g, sx, sy, 90 * zMid, PAL.fire2, 0.6 * fl);
        const [bx, by] = S('mid', x, 900);
        glow(g, bx, by, 260 * zMid, PAL.fire, 0.12 * fl);
      }
    }
    const wR = o.windowR ?? 'night';
    const moonish = wR === 'moon' || (wR && wR.to === 'moon');
    if ((o.moonlight ?? 1) > 0) {
      const W = THRONE.windows.R;
      const A = S('back', W.x, 400), B = S('main', W.x + 110, 940);
      g.save();
      g.globalCompositeOperation = 'screen';
      softBeam(g, A, B, 82 * zB, 150 * zM, mixHex(PAL.moon, PAL.skyDayLow, 0.45), (moonish ? 0.07 : 0.035) * (o.moonlight ?? 1));
      g.restore();
    }
    if (moonish) {
      const [mx, my, mr] = throneMoonScreen(c, f);
      glow(g, mx, my, mr * 3.2, PAL.moonGlow, 0.22);
    }
  } else if (light === 'gray') {
    ['L', 'R'].forEach((key) => {
      const W = THRONE.windows[key];
      const wc = S('back', W.x, 380);
      glow(g, wc[0], wc[1], 170 * zB, PAL.skyDayLow, 0.12);
    });
  }
  g.restore();
}

// ———————————————————— 入口 ————————————————————
/**
 * drawThroneRoom(g, T, cam, o) —— 王座厅一层。
 * o: { layer:'back'|'mid'|'main'|'fg'|'glow', light:'sunny'|'festive'|'gray'|'night',
 *      windowL, windowR（'gray'|'day'|'sunset'|'night'|'moon'|'spring'|'summer'|'autumn'|'winter' 或 {from,to,k}）, moonPhase 0..1,
 *      rose:{face,glow,tracery}, decree:{hung,chars,sweep,unroll,prints,printDur,layer:'mid'|'main'}, aisle 0..1, confettiFloor 0..1, door 0..1, lectern, candles, garland,
 *      ruler:[{h,at}], fgPillars, beams 0..1, moonlight 0..1, flat(true|0..1), t（次级运动秒，默认 T） }
 * 返回 { rose:[x,y,r], moon:[x,y,r], star:[x,y], decree?:{chars:[[x,y]×13], end:[x,y]} }（当前机位下的屏幕坐标；decree 仅在传了 o.decree 时有）。
 */
export function drawThroneRoom(g, T, c, o = {}) {
  const layer = o.layer || 'main';
  const light = LIGHT_NAMES.includes(o.light) ? o.light : 'sunny';
  const P = toneOf(light);
  const t = o.t ?? T;
  g.save();
  if (layer === 'glow') drawGlow(g, T, c, o, light, t);
  else {
    applyCam(g, c, throneDepth(layer, o.flat));
    if (layer === 'back') drawBack(g, t, o, light, P);
    else if (layer === 'mid') drawMid(g, t, o, light, P);
    else if (layer === 'fg') drawFg(g, t, o, light, P, c);
    else drawMain(g, t, o, light, P, c);
  }
  g.restore();
  const dB = throneDepth('back', o.flat);
  const rs = toScreen(c, dB, THRONE.rose.x, THRONE.rose.y);
  const ret = { rose: [rs[0], rs[1], THRONE.rose.r * zOf(c, dB)], moon: throneMoonScreen(c, o.flat), star: toScreen(c, throneDepth('main', o.flat), ...THRONE.throne.star) };
  if (o.decree) {
    // 圣旨 13 个字位（mid 层）→ 屏幕：印章字飞回圣旨、金印砸在哪个字上都用它（alpha:0 只算版面不画）
    const L = drawDecree(g, { ...decreeOpts(t, o.decree), alpha: 0 }), dD = decreeDepth(o.decree, o.flat);
    ret.decree = { chars: L.chars.map(([x, y]) => toScreen(c, dD, x, y)), end: toScreen(c, dD, ...L.end) };
  }
  return ret;
}

/** 推荐的图层参数（镜头可直接用）：ctx.layer(g, THRONE_LAYER.mid, (lg) => drawThroneRoom(lg, T, c, {layer:'mid', ...})) */
export const THRONE_LAYER = {
  back: { texture: 0.22 },
  mid: { shadow: 10, texture: 0.28 },
  main: { shadow: 8, texture: 0.28 },
  fg: { shadow: 12, texture: 0.2, blur: 4 },
};
/** 按光照给图层参数：夜景纸纹降到 0.1（浅色纸纤维压在深色上会发灰起雾），投影更实。 */
export function throneLayer(layer, light = 'sunny') {
  const o = { ...(THRONE_LAYER[layer] || {}) };
  if (light === 'night') { o.texture = Math.min(o.texture ?? 0, 0.1); if (o.shadow) o.shadow = { blur: o.shadow * 1.5, dx: o.shadow * 0.35, dy: o.shadow * 0.85, color: rgba(PAL.shadow, 0.5) }; }
  return o;
}
