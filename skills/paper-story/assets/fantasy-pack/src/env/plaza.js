// 城下广场 PLAZA —— docs/assets.md 8.3、docs/storyboard.md 4.3（坐标写死，镜头只读不改）。接口说明：docs/api/plaza_throne.md
// 分层（每层由镜头包进自己的 ctx.layer，函数内部自己 applyCam）：
//   sky    天空渐变（depth 0.05）+ 云层（0.2；beam 时从云缝裂开）
//   far    远景山丘、山坡上的小城、缩小的王城（0.55 倍，阳台在 PL-W 屏幕 (1500,190)）+ 阳台上的小国王（0.4）
//   mid    左右木筋屋（0.8）
//   main   石板地面 + 进城小路、水井、告示板（告示交给 props/paper.js 的 drawNotice）、右侧城门楼与城墙、光圈（1.0）
//   fg     顶部彩旗串、左下木桶、右下花箱（1.35）
//   light  光效（屏幕空间：云缝光柱、浮尘、晨光；直接画在 g 上，不进图层）
// 另导出 drawGateArch(g, T, o)：V04 换景用的前景城门拱（屏幕空间，盖满全高）。
// 纯函数：画面只由参数决定；内部 save/restore；不调 ctx.layer / ctx.mask。只用 PAL（深浅用 mixHex / rgba）。
import { PAL, blob, poly, rr, smooth as smoothPath, ribbon, cut, shade, lin, rad, glow, rays, sparkle } from '../core/paper.js';
import { cam, applyCam, toScreen } from '../core/camera.js';
import { clamp, lerp, hash2, noise1, fbm1, rgba, mixHex, TAU, fract, wobble } from '../core/util.js';
import { outBack, outCubic } from '../core/ease.js';
import { burst, stream } from '../core/particles.js';
import { drawNotice } from '../props/paper.js';
import { drawRoundWindow } from './roundwindow.js';

// ———————————————————— 深度、机位 ————————————————————
export const PLAZA_DEPTH = { sky: 0.05, cloud: 0.2, far: 0.4, mid: 0.8, main: 1, fg: 1.35 };
const flatK = (f) => (f === true ? 1 : f ? clamp(+f) : 0);
/** 某层在 flat 下的实际深度（flat 1 = 冻结视差，全部按 depth 1）。 */
export const plazaDepth = (layer, flat) => { const d = PLAZA_DEPTH[layer] ?? 1; return d + (1 - d) * flatK(flat); };
const zOf = (c, d) => 1 + (c.zoom - 1) * d;
/** 广场某层世界坐标 → 屏幕坐标。 */
export const plazaToScreen = (c, layer, x, y, flat) => toScreen(c, plazaDepth(layer, flat), x, y);

/** 预设机位（storyboard 4.3）+ 分镜里用到的几个固定机位（附加）。所有机位使用时叠 drift。 */
export const CAMS = {
  PL_W: cam(960, 540, 1.0),
  PL_BOARD: cam(1080, 560, 1.8),
  PL_HERO: cam(560, 600, 1.6),
  PL_HERO_CU: cam(560, 640, 3.4),
  PL_GATE: cam(1500, 560, 1.2),
  // 附加（storyboard 第 5 节 b03 / b07 用到的固定机位）
  PL_TOP: cam(960, 240, 1.0),      // b03 入场：甩镜帘后从这里落到 PL_W
  PL_CROWD: cam(1000, 560, 1.3),   // b03 L06 推近告示与人群
  PL_SCARF: cam(560, 420, 4.0),    // b07 V01 围巾特写
  PL_HOPE: cam(1060, 600, 1.45),   // b07 V03 众人的希望
};

// ———————————————————— 布局常量 ————————————————————
export const PLAZA = {
  groundY: 860,                                         // 地面线（角色脚底，main）；石板地面的远边在 846
  groundTop: 846,
  board: { x: 1080, cx: 1080, cy: 560, w: 300, h: 220, posts: [955, 1205], roofY: 400 }, // 告示板（main），告示锚在板心
  well: { x: 700, y: 860 },                             // 水井（main）
  gate: { x0: 1660, x1: 1900, y0: 480, y1: 860, cx: 1780, cy: 600, r: 120 }, // 城门拱洞（main）
  gatehouse: { x0: 1606, x1: 1954, top: 290 },          // 城门楼（main）
  wall: { x0: 1954, x1: 3400, top: 472 },               // 城墙向右延伸（main）
  path: { x1: 200 },                                    // 进城小路（画左，main 地面）
  lightX: 520, lightY: 866,                             // 光圈中心（main）
  crowdL: [620, 900], crowdR: [1220, 1500], herald: 1000, // 人群与传令官站位（main）
  housesL: [0, 380], housesR: [1380, 1640],             // 木筋屋（mid）
  castle: { x: 1500, y: 190, s: 0.55, ref: [960, 575] }, // far：CASTLE 世界 (960,575)（阳台栏杆中点）→ far (1500,190)，缩放 0.55
  balconyKing: [994, 590, 0.3],                          // 小国王：CASTLE 坐标脚底 + 缩放（站在阳台栏杆后）
  bunting: { y0: 40, y1: 120 },                         // 彩旗串（fg）
  cloudGap: [430, 70],                                  // 云缝（cloud 层坐标）
  depth: PLAZA_DEPTH,
};
const BEAM_AT = 22.11;

// ———————————————————— 时段色调 ————————————————————
const GRAY = mixHex(PAL.skyDay, PAL.stone2, 0.6); // 灰蓝（storyboard 第 2 节）
const TIMES = {
  morning: (c) => mixHex(c, PAL.goldLight, 0.04),
  gray: (c) => mixHex(c, mixHex(GRAY, PAL.stoneDark, 0.15), 0.4),
  beam: (c) => mixHex(c, mixHex(GRAY, PAL.stoneDark, 0.15), 0.4),
};
const TONES = {};
function toneOf(time, extra = 0, to = null) {
  const key = time + '|' + extra + '|' + (to || '');
  let t = TONES[key];
  if (!t) {
    const f = TIMES[time] || TIMES.morning;
    t = {};
    for (const k in PAL) { const c = f(PAL[k]); t[k] = extra ? mixHex(c, to, extra) : c; }
    TONES[key] = t;
  }
  return t;
}
const TIME_NAMES = ['gray', 'beam', 'morning'];
const skyLow = (time) => (time === 'morning' ? PAL.skyDayLow : mixHex(GRAY, PAL.skyDayLow, 0.35));

// ———————————————————— 小工具 ————————————————————
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pcut = (pts, seed, amp = 1, step = 22, round = 0) => poly(pts, { seed, amp, step, round });
const pathOfPts = (pts, closed = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (closed) p.closePath(); return p; };
/** 半圆拱门洞：左右 x0..x1，拱顶 y0，底 y1。 */
function archPath(x0, x1, y0, y1) {
  const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, cy = y0 + r;
  const p = new Path2D();
  p.moveTo(x0, y1); p.lineTo(x0, cy); p.arc(cx, cy, r, Math.PI, TAU); p.lineTo(x1, y1); p.closePath();
  return p;
}
/** 软光柱（屏幕空间）：A → B，两端半宽 hwA / hwB；分段横向渐变，两端淡出。 */
function softBeam(g, A, B, hwA, hwB, color, aMax, slices = 10, fadeTop = 0.15) {
  g.save();
  g.globalCompositeOperation = 'lighter'; // 相邻段共用边：加色混合下抗锯齿覆盖率正好相加，不出接缝
  const ax = B[0] - A[0], ay = B[1] - A[1], L = Math.hypot(ax, ay) || 1;
  const px = -ay / L, py = ax / L;
  for (let i = 0; i < slices; i++) {
    const s0 = i / slices, s1 = (i + 1) / slices, sm = (s0 + s1) / 2;
    const h0 = lerp(hwA, hwB, s0), h1 = lerp(hwA, hwB, s1), hm = lerp(hwA, hwB, sm);
    const c0 = [A[0] + ax * s0, A[1] + ay * s0], c1 = [A[0] + ax * s1, A[1] + ay * s1], cm = [A[0] + ax * sm, A[1] + ay * sm];
    const env = clamp(sm / fadeTop) * (1 - 0.3 * sm) * clamp((1 - sm) / 0.22); // 顶端从云缝淡入，底端溶进地上的光圈
    const gr = g.createLinearGradient(cm[0] - px * hm, cm[1] - py * hm, cm[0] + px * hm, cm[1] + py * hm);
    gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.5, rgba(color, aMax * env)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fill(pathOfPts([[c0[0] - px * h0, c0[1] - py * h0], [c0[0] + px * h0, c0[1] + py * h0], [c1[0] + px * h1, c1[1] + py * h1], [c1[0] - px * h1, c1[1] - py * h1]]));
  }
  g.restore();
}
/** 纸片小火苗（烽火 / 炊烟口），原点在火苗底部。 */
function flame(g, x, y, s, t, seed) {
  const fl = 1 + 0.18 * noise1(t * 8 + seed, 2);
  g.save();
  g.translate(x, y); g.rotate(noise1(t * 3 + seed, 5) * 0.2); g.scale(s, s * fl);
  const o = new Path2D(); o.moveTo(0, -30); o.bezierCurveTo(12, -14, 11, -2, 0, 3); o.bezierCurveTo(-11, -2, -12, -14, 0, -30);
  const i = new Path2D(); i.moveTo(0, -17); i.bezierCurveTo(6, -8, 6, -1, 0, 2); i.bezierCurveTo(-6, -1, -6, -8, 0, -17);
  g.fillStyle = PAL.fireDeep; g.fill(o);
  g.save(); g.scale(0.82, 0.86); g.fillStyle = PAL.fire; g.fill(o); g.restore();
  g.fillStyle = PAL.fire2; g.fill(i);
  g.restore();
}

// ———————————————————— 静态几何（首次绘制时按固定种子预建） ————————————————————
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const G = {};
  // —— 云（cloud 层坐标）：每朵 = 若干个 blob；open 时以云缝为界向两侧分开 ——
  const mkCloud = (cx, cy, w, h, seed, n = 5) => {
    const p = new Path2D(), top = new Path2D();
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const bx = cx + (u - 0.5) * w * 0.8 + (hash2(seed, i) - 0.5) * w * 0.12, by = cy - Math.sin(Math.PI * u) * h * 0.35 + (hash2(seed + 3, i) - 0.5) * h * 0.2;
      const rx = w * (0.18 + hash2(seed + 5, i) * 0.12), ry = h * (0.38 + hash2(seed + 7, i) * 0.2);
      p.addPath(blob(bx, by, rx, ry, { seed: seed * 10 + i, amp: 0.04, n: 28 }));
      if (i % 2 === 0) top.addPath(blob(bx - rx * 0.15, by - ry * 0.25, rx * 0.7, ry * 0.55, { seed: seed * 10 + i + 5, amp: 0.05, n: 22 }));
    }
    p.addPath(pcut(rectPts(cx - w * 0.42, cy, cx + w * 0.42, cy + h * 0.32), seed + 99, 1.5, 40, 0.5));
    return { p, top, cx, cy, w, h };
  };
  G.overcast = [
    // [cx, cy, w, h]：灰天的三排云带（远到近）
    ...[-500, -80, 340, 760, 1180, 1600, 2020, 2440].map((x, i) => mkCloud(x, 40 + (i % 2) * 30, 520, 150, 100 + i, 6)),
    ...[-300, 120, 560, 980, 1400, 1820, 2240].map((x, i) => mkCloud(x, 170 + (i % 2) * 26, 480, 130, 120 + i, 5)),
    ...[-420, 0, 440, 900, 1330, 1760, 2200].map((x, i) => mkCloud(x, 300 + (i % 2) * 20, 440, 110, 140 + i, 5)),
  ];
  G.fair = [mkCloud(260, 150, 300, 90, 160, 4), mkCloud(900, 90, 360, 100, 161, 5), mkCloud(1500, 210, 260, 80, 162, 4), mkCloud(2050, 120, 320, 90, 163, 5), mkCloud(-380, 230, 280, 80, 164, 4)];
  // —— 远景：山丘 + 山坡小城 ——
  G.hill = smoothPath([[-900, 1400], [-900, 560], [-300, 520], [200, 480], [620, 452], [980, 410], [1240, 360], [1520, 330], [1820, 344], [2200, 400], [2700, 470], [3100, 520], [3100, 1400]], { closed: true, tension: 0.4 });
  G.hill2 = smoothPath([[-900, 1400], [-900, 640], [-200, 600], [400, 590], [900, 600], [1400, 560], [2000, 600], [2600, 640], [3100, 650], [3100, 1400]], { closed: true, tension: 0.4 });
  const ridge = (x) => { // 山脊 y（近似）
    const P = [[-900, 560], [-300, 520], [200, 480], [620, 452], [980, 410], [1240, 360], [1520, 330], [1820, 344], [2200, 400], [2700, 470], [3100, 520]];
    for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const u = (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return lerp(P[i - 1][1], P[i][1], u); }
    return 520;
  };
  const town = { walls: [new Path2D(), new Path2D(), new Path2D(), new Path2D()], roofs: [new Path2D(), new Path2D(), new Path2D()], wins: new Path2D(), trees: [new Path2D(), new Path2D()] };
  for (let row = 0; row < 6; row++) {
    const drop = 46 + row * 58, sc = 0.62 + row * 0.08;
    let x = -880 + hash2(row, 1) * 60;
    while (x < 3050) {
      const w = (34 + hash2(row, x) * 22) * sc * 1.25, h = (28 + hash2(row + 4, x) * 22) * sc * 1.25, rh = (16 + hash2(row + 8, x) * 12) * sc * 1.25;
      const by = ridge(x + w / 2) + drop + (hash2(row + 12, x) - 0.5) * 10;
      const under = row < 3 && x > 1060 && x < 1920; // 王城脚下让出城墙
      if (!under) {
        if (hash2(row + 50, x) < 0.22) {
          // 一棵圆树（两层绿）
          const tr = w * 0.62;
          town.trees[0].addPath(blob(x + w / 2, by - tr * 0.8, tr, tr * 0.9, { seed: row * 500 + x, amp: 0.06, n: 22 }));
          town.trees[1].addPath(blob(x + w / 2 - tr * 0.25, by - tr * 1.05, tr * 0.55, tr * 0.5, { seed: row * 500 + x + 3, amp: 0.06, n: 18 }));
        } else {
          const wi = Math.floor(hash2(row + 20, x) * 4), ri = Math.floor(hash2(row + 24, x) * 3);
          town.walls[wi].addPath(pcut(rectPts(x, by - h, x + w, by + 30), row * 1000 + x, 0.7, 30));
          if (hash2(row + 30, x) < 0.7) town.roofs[ri].addPath(pcut([[x - 4, by - h + 1], [x + w / 2, by - h - rh], [x + w + 4, by - h + 1]], row * 1000 + x + 7, 0.5, 20));
          else town.roofs[ri].addPath(pcut([[x - 4, by - h + 1], [x + w * 0.22, by - h - rh * 0.8], [x + w * 0.78, by - h - rh * 0.8], [x + w + 4, by - h + 1]], row * 1000 + x + 9, 0.5, 20));
          const nw = w > 46 ? 2 : 1;
          for (let k = 0; k < nw; k++) { const wx = x + (w / (nw + 1)) * (k + 1) - 3; town.wins.addPath(rr(wx, by - h * 0.62, 6 * sc + 2, 8 * sc + 3, 2)); }
        }
      }
      x += w + 6 + hash2(row + 40, x) * 20;
    }
  }
  // 广场后沿：一排行道树 + 带拱的矮护墙（far 层最下沿，挡住角色身后的空当）
  const treeRow = [new Path2D(), new Path2D(), new Path2D()];
  for (let x = -900; x < 3100; x += 70 + hash2(x, 2) * 40) {
    const r = 58 + hash2(x, 3) * 30, y = 700 + hash2(x, 4) * 26;
    treeRow[0].addPath(blob(x, y, r, r * 0.92, { seed: 7000 + x, amp: 0.05, n: 26 }));
    treeRow[1].addPath(blob(x - r * 0.25, y - r * 0.32, r * 0.58, r * 0.5, { seed: 7100 + x, amp: 0.06, n: 20 }));
    treeRow[2].addPath(rr(x - 6, y + r * 0.6, 12, 110, 4));
  }
  G.treeRow = treeRow;
  const arches = new Path2D(), bal = new Path2D();
  for (let x = -900; x < 3100; x += 120) { arches.addPath(archPath(x + 26, x + 94, 790, 862)); }
  for (let x = -900; x < 3100; x += 22) bal.addPath(rr(x + 4, 748, 10, 26, 4));
  G.parapet = { body: pcut(rectPts(-900, 776, 3100, 900), 7200, 0.8, 60), cap: pcut(rectPts(-900, 732, 3100, 750), 7201, 0.6, 60), rail: pcut(rectPts(-900, 770, 3100, 782), 7202, 0.5, 60), arches, bal };
  G.town = town;
  // —— 王城（CASTLE 坐标，far 层内经 0.55 缩放摆到右上） ——
  {
    const C = {};
    const merl = new Path2D();
    for (let x = 270; x < 1650; x += 60) merl.addPath(pcut(rectPts(x, 670, x + 40, 702), 2000 + x, 0.6, 20));
    C.wall = pcut(rectPts(260, 700, 1660, 900), 2001, 1, 60);
    C.merl = merl;
    C.joints = new Path2D();
    for (let r = 0; r < 5; r++) { const y = 712 + r * 38; C.joints.moveTo(260, y); C.joints.lineTo(1660, y); for (let x = 260 + (r % 2) * 35; x < 1660; x += 70) { C.joints.moveTo(x, y); C.joints.lineTo(x, y + 38); } }
    C.gate = archPath(890, 1030, 740, 902);
    C.towers = [];
    for (let i = 0; i < 13; i++) {
      if (i === 6) continue;
      const x = 300 + 110 * i, h = [170, 210, 250, 210][i % 4], top = 700 - h;
      C.towers.push({ i, x, top, body: pcut(rectPts(x - 35, top, x + 35, 704), 2100 + i, 0.6, 20), roof: pcut([[x - 43, top + 6], [x, top - 70], [x + 43, top + 6]], 2200 + i, 0.6, 20), win: archPath(x - 9, x + 9, top + 34, top + 66) });
    }
    C.keep = pcut(rectPts(840, 300, 1080, 704), 2300, 0.8, 30);
    C.spire = pcut([[826, 306], [960, 120], [1094, 306]], 2301, 0.8, 30);
    C.keepMerl = new Path2D();
    for (let x = 846; x < 1080; x += 42) C.keepMerl.addPath(pcut(rectPts(x, 286, x + 26, 306), 2302 + x, 0.5, 20));
    C.balFloor = pcut(rectPts(844, 586, 1076, 602), 2310, 0.5, 30);
    C.balDoor = archPath(925, 995, 510, 590);
    C.balRail = pcut(rectPts(848, 552, 1072, 561), 2311, 0.4, 30);
    C.balusters = new Path2D();
    for (let x = 856; x < 1068; x += 15) C.balusters.addPath(rr(x, 561, 7, 26, 3));
    C.flowerBox = pcut(rectPts(856, 540, 922, 553), 2312, 0.4, 20);
    G.castle = C;
  }
  // —— 木筋屋（mid 层坐标） ——
  G.houses = [
    house(-170, 186, 330, 860, { roof: 'roofRed', peak: 96, seed: 3000, floors: 3, jetty: true, sign: 'pretzel', chimney: 118 }),
    house(176, 396, 430, 860, { roof: 'roof', peak: 286, seed: 3100, floors: 2, side: true, chimney: 340 }),
    house(1372, 1652, 372, 860, { roof: 'roof', peak: 242, seed: 3200, floors: 3, jetty: true, sign: 'mug', balcony: true }),
  ];
  // —— 地面石板（main 层坐标，透视排） ——
  {
    const Y = [846, 864, 886, 912, 944, 982, 1028, 1084, 1152, 1236, 1340, 1470, 1640];
    const VP = [960, 300];
    const k = (y) => (y - VP[1]) / (846 - VP[1]);
    const groups = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let r = 0; r < Y.length - 1; r++) {
      const y0 = Y[r], y1 = Y[r + 1], k0 = k(y0), k1 = k(y1);
      let u = -2600 + hash2(r, 3) * 60;
      while (u < 4400) {
        const w = 70 + hash2(r, u) * 70;
        const q = [[VP[0] + (u - VP[0]) * k0 + 2, y0 + 1.5], [VP[0] + (u + w - VP[0]) * k0 - 2, y0 + 1.5], [VP[0] + (u + w - VP[0]) * k1 - 2, y1 - 1.5], [VP[0] + (u - VP[0]) * k1 + 2, y1 - 1.5]];
        groups[Math.floor(hash2(r + 9, u) * 4)].addPath(pcut(q, r * 977 + Math.floor(u), 1.1, 26, 0.35));
        u += w;
      }
    }
    G.slabs = groups;
  }
  // —— 告示板、水井、城门楼（main） ——
  {
    const B = PLAZA.board;
    G.board = {
      posts: B.posts.map((x, i) => pcut(rectPts(x - 8, 404, x + 8, 862), 3300 + i, 0.6, 30)),
      frame: pcut(rectPts(922, 442, 1238, 678), 3302, 0.8, 30),
      panel: pcut(rectPts(934, 454, 1226, 666), 3303, 0.6, 30),
      roof: pcut([[900, 438], [1080, 386], [1260, 438], [1252, 448], [1080, 400], [908, 448]], 3304, 0.6, 20),
      beam: pcut(rectPts(918, 430, 1242, 442), 3305, 0.4, 30),
      scraps: [pcut([[948, 470], [984, 464], [978, 492], [952, 488]], 3306, 0.8, 10), pcut([[1186, 610], [1214, 604], [1212, 650], [1190, 640]], 3307, 0.8, 10), pcut([[1110, 462], [1150, 466], [1146, 476], [1114, 474]], 3308, 0.6, 10)],
    };
    const W = PLAZA.well;
    G.well = {
      body: pcut(rectPts(W.x - 74, 784, W.x + 74, 862), 3400, 0.8, 26, 0.2),
      rim: blob(W.x, 784, 80, 17, { seed: 3401, amp: 0.01, n: 40 }),
      hole: blob(W.x, 783, 62, 10, { seed: 3402, amp: 0.01, n: 32 }),
      posts: [pcut(rectPts(W.x - 70, 604, W.x - 58, 790), 3403, 0.5, 30), pcut(rectPts(W.x + 58, 604, W.x + 70, 790), 3404, 0.5, 30)],
      roof: pcut([[W.x - 104, 616], [W.x, 560], [W.x + 104, 616], [W.x + 96, 626], [W.x, 574], [W.x - 96, 626]], 3405, 0.6, 20),
      roofFace: pcut([[W.x - 96, 618], [W.x, 566], [W.x + 96, 618], [W.x + 90, 612], [W.x, 562], [W.x - 90, 612]], 3406, 0.4, 20),
      bar: rr(W.x - 64, 636, 128, 11, 5),
    };
    const blocks = new Path2D();
    for (let r = 0; r < 12; r++) {
      const y0 = 300 + r * 48;
      for (let x = 1606 + (r % 2) * 40; x < 3400; x += 80) blocks.moveTo(x, y0), blocks.lineTo(x, y0 + 48);
      blocks.moveTo(1606, y0); blocks.lineTo(3400, y0);
    }
    const gm = new Path2D();
    for (let x = 1612; x < 1950; x += 58) gm.addPath(pcut(rectPts(x, 256, x + 34, 292), 3500 + x, 0.6, 20));
    const wm = new Path2D();
    for (let x = 1966; x < 3400; x += 58) wm.addPath(pcut(rectPts(x, 440, x + 34, 474), 3600 + x, 0.6, 20));
    const vous = [];
    const Gt = PLAZA.gate;
    for (let i = 0; i < 11; i++) {
      const a0 = Math.PI + (i / 11) * Math.PI, a1 = Math.PI + ((i + 1) / 11) * Math.PI, R1 = Gt.r + (i === 5 ? 44 : 34);
      vous.push(pcut([[Gt.cx + Math.cos(a0) * (Gt.r + 1), Gt.cy + Math.sin(a0) * (Gt.r + 1)], [Gt.cx + Math.cos(a0) * R1, Gt.cy + Math.sin(a0) * R1], [Gt.cx + Math.cos(a1) * R1, Gt.cy + Math.sin(a1) * R1], [Gt.cx + Math.cos(a1) * (Gt.r + 1), Gt.cy + Math.sin(a1) * (Gt.r + 1)]], 3700 + i, 0.5, 14));
    }
    G.gate = {
      house: (() => { const p = pcut(rectPts(1606, 290, 1954, 864), 3800, 0.8, 40); p.addPath(archPath(Gt.x0, Gt.x1, Gt.y0, Gt.y1 + 6)); return p; })(),
      wall: pcut(rectPts(1950, 472, 3400, 864), 3801, 0.8, 50),
      gm, wm, blocks, vous,
      hole: archPath(Gt.x0, Gt.x1, Gt.y0, Gt.y1 + 6),
      slit: rr(1772, 330, 16, 52, 8),
      tower: pcut(rectPts(2340, 300, 2520, 864), 3802, 0.8, 40),
      towerRoof: pcut([[2322, 306], [2430, 150], [2538, 306]], 3803, 0.7, 30),
      towerM: (() => { const p = new Path2D(); for (let x = 2344; x < 2520; x += 44) p.addPath(pcut(rectPts(x, 286, x + 26, 304), 3804 + x, 0.5, 20)); return p; })(),
    };
  }
  // —— 彩旗串（fg）：两根绳，旗按弧长等距 ——
  {
    const strands = [];
    const mk = (anchors, seed) => {
      const pts = [];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [x0, y0] = anchors[i], [x1, y1] = anchors[i + 1];
        for (let k = 0; k < 24; k++) { const u = k / 24; pts.push([lerp(x0, x1, u), lerp(y0, y1, u) + 72 * Math.sin(Math.PI * u)]); }
      }
      pts.push(anchors[anchors.length - 1]);
      const flags = [];
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        acc += d;
        if (acc >= 58) { acc = 0; flags.push({ x: pts[i][0], y: pts[i][1], a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]), k: flags.length, seed: seed + flags.length }); }
      }
      return { pts, flags };
    };
    strands.push(mk([[-500, 34], [380, 40], [1260, 30], [2140, 42], [3000, 34]], 4000));
    strands.push(mk([[-260, 58], [700, 52], [1640, 60], [2580, 56]], 4100));
    G.bunting = strands;
  }
  GEO = G;
  return G;
}

/** 木筋屋几何（mid 层坐标）：x0..x1 墙宽，eave 檐口 y，base 地面 y。 */
function house(x0, x1, eave, base, o) {
  const H = { x0, x1, eave, base, ...o, roofKey: o.roof };
  const w = x1 - x0, cx = (x0 + x1) / 2, seed = o.seed;
  const groundTop = base - 170;
  H.ground = pcut(rectPts(x0 + 6, groundTop, x1 - 6, base + 30), seed, 0.8, 30);
  const jet = o.jetty ? 12 : 0;
  H.upper = pcut(rectPts(x0 - jet, eave, x1 + jet, groundTop + 6), seed + 1, 0.8, 30);
  H.jettyBeam = pcut(rectPts(x0 - jet - 4, groundTop - 4, x1 + jet + 4, groundTop + 8), seed + 2, 0.5, 30);
  // 木筋：竖、横、斜撑
  const beams = new Path2D();
  const fl = o.floors - 1, fh = (groundTop - eave) / Math.max(1, fl);
  const posts = Math.max(3, Math.round(w / 70));
  for (let i = 0; i <= posts; i++) { const x = lerp(x0 - jet + 6, x1 + jet - 14, i / posts); beams.addPath(rr(x, eave, 8, groundTop - eave, 1)); }
  for (let f = 0; f <= fl; f++) { const y = eave + f * fh; beams.addPath(rr(x0 - jet, y - 4, w + jet * 2, 8, 1)); }
  for (let f = 0; f < fl; f++) {
    for (let i = 0; i < posts; i += 2) {
      const xa = lerp(x0 - jet + 10, x1 + jet - 10, i / posts), xb = lerp(x0 - jet + 10, x1 + jet - 10, (i + 1) / posts);
      const y0 = eave + f * fh + 4, y1 = eave + (f + 1) * fh - 4;
      beams.addPath(pathOfPts([[xa, y1 - 6], [xa + 7, y1], [xb, y0 + 6], [xb - 7, y0]]));
    }
  }
  H.beams = beams;
  // 窗（每层两扇，在斜撑之间）
  H.wins = [];
  for (let f = 0; f < fl; f++) {
    const y = eave + f * fh + fh * 0.22;
    const ww = Math.min(52, w * 0.17), wh = fh * 0.5;
    for (const u of fl === 1 || w < 260 ? [0.5] : [0.3, 0.7]) H.wins.push({ x: lerp(x0, x1, u) - ww / 2, y, w: ww, h: wh });
  }
  // 屋顶
  if (o.side) {
    H.roof = pcut([[x0 - 22, eave + 6], [x0 + 26, o.peak], [x1 - 26, o.peak], [x1 + 22, eave + 6]], seed + 3, 0.8, 26);
  } else {
    H.roof = pcut([[x0 - jet - 24, eave + 8], [cx, o.peak], [x1 + jet + 24, eave + 8]], seed + 3, 0.8, 26);
    H.gable = pcut([[x0 - jet + 6, eave + 2], [cx, o.peak + 30], [x1 + jet - 6, eave + 2]], seed + 4, 0.6, 26);
  }
  // 屋瓦线
  const tiles = new Path2D();
  const ry0 = o.peak + 18, ry1 = eave;
  for (let y = ry0; y < ry1; y += 16) {
    const u = (y - o.peak) / (eave - o.peak);
    const hw = o.side ? lerp(w / 2 - 26, w / 2 + 22, u) : lerp(0, w / 2 + jet + 24, u);
    tiles.moveTo(cx - hw + 4, y); tiles.lineTo(cx + hw - 4, y);
  }
  H.tiles = tiles;
  if (o.chimney) { H.chim = pcut(rectPts(o.chimney - 14, o.peak + (o.side ? -26 : 40), o.chimney + 14, eave - 20), seed + 5, 0.6, 20); H.chimTop = [o.chimney, o.peak + (o.side ? -26 : 40)]; }
  // 一层：门 + 橱窗 + 遮阳篷
  H.door = archPath(cx - 30 + (o.sign ? -w * 0.18 : 0), cx + 30 + (o.sign ? -w * 0.18 : 0), base - 128, base + 2);
  H.shopWin = o.sign ? { x: cx + w * 0.06, y: base - 120, w: w * 0.3, h: 70 } : null;
  if (H.shopWin) {
    const s = H.shopWin, stripes = [];
    for (let i = 0; i < 6; i++) stripes.push(pcut([[s.x - 10 + (i * (s.w + 20)) / 6, s.y - 34], [s.x - 10 + ((i + 1) * (s.w + 20)) / 6, s.y - 34], [s.x - 16 + ((i + 1) * (s.w + 32)) / 6, s.y - 6], [s.x - 16 + (i * (s.w + 32)) / 6, s.y - 6]], seed + 10 + i, 0.4, 20));
    H.awning = stripes;
  }
  return H;
}

// ———————————————————— sky ————————————————————
function drawSky(g, T, c, o, time, P, t) {
  const flat = o.flat;
  g.save();
  applyCam(g, c, plazaDepth('sky', flat));
  const top = time === 'morning' ? PAL.skyDay : mixHex(GRAY, PAL.stoneDark, 0.32);
  const bot = skyLow(time);
  g.fillStyle = lin(g, 0, -600, 0, 900, [[0, mixHex(top, PAL.skyNight, time === 'morning' ? 0.08 : 0.15)], [0.45, top], [1, bot]]);
  g.fillRect(-1500, -1500, 5000, 3600);
  if (time === 'morning') glow(g, 180, 40, 700, PAL.goldLight, 0.55);
  g.restore();
  // 云
  const G = geo();
  g.save();
  applyCam(g, c, plazaDepth('cloud', flat));
  if (time === 'morning') {
    for (const C of G.fair) {
      const dx = fract((C.cx + 1100) / 3200 + t * 0.004) * 3200 - 1100 - C.cx; // 慢慢向右飘，循环
      g.save(); g.translate(dx, 0);
      g.fillStyle = mixHex(PAL.white, PAL.skyDayLow, 0.3); g.fill(C.p);
      g.fillStyle = rgba(PAL.white, 0.85); g.fill(C.top);
      shade(g, C.p, PAL.skyDay, 0, C.cy - C.h * 0.3, 0, C.cy + C.h * 0.45, 0, 0.4);
      g.restore();
    }
  } else {
    const open = time === 'beam' ? clamp((T - (o.beamAt ?? BEAM_AT)) / 0.7) : 0;
    const ease = open > 0 ? outCubic(open) : 0;
    const [gx, gy] = PLAZA.cloudGap;
    if (open > 0) {
      // 云缝后面的亮天
      glow(g, gx, gy + 40, 420 * (0.4 + 0.6 * ease), PAL.goldLight, 0.9 * ease);
      glow(g, gx, gy + 20, 180, PAL.white, 0.6 * ease);
    }
    const rows = [G.overcast.slice(0, 8), G.overcast.slice(8, 15), G.overcast.slice(15)];
    rows.forEach((row, ri) => {
      const base = mixHex(mixHex(GRAY, PAL.stoneDark, 0.35 - ri * 0.1), PAL.skyNight, 0.08);
      for (const C of row) {
        const side = C.cx < gx ? -1 : 1;
        const push = ease * (220 + ri * 60) * side * Math.exp(-Math.abs(C.cx - gx) / 1400);
        const drift = Math.sin(t * 0.07 + C.cx * 0.01) * 10;
        g.save(); g.translate(push + drift, 0);
        g.save(); g.translate(3, 5); g.fillStyle = rgba(PAL.shadow, 0.12); g.fill(C.p); g.restore();
        g.fillStyle = base; g.fill(C.p);
        g.fillStyle = rgba(mixHex(base, PAL.skyDayLow, 0.35), 0.8); g.fill(C.top);
        shade(g, C.p, PAL.stoneDark, 0, C.cy - C.h * 0.2, 0, C.cy + C.h * 0.5, 0, 0.4);
        if (ease > 0 && Math.abs(C.cx - gx) < 700) {
          // 靠近云缝的云边被金光勾亮
          g.save(); g.clip(C.p);
          g.fillStyle = rad(g, gx - push - drift, gy + 30, 40, 420, [[0, rgba(PAL.goldLight, 0.75 * ease)], [1, rgba(PAL.goldLight, 0)]]);
          g.fillRect(C.cx - C.w, C.cy - C.h * 2, C.w * 2, C.h * 4);
          g.restore();
        }
        g.restore();
      }
    });
  }
  g.restore();
}

// ———————————————————— far：山丘、山坡小城、缩小的王城 + 小国王 ————————————————————
function drawFar(g, T, o, time, t) {
  const G = geo();
  const haze = skyLow(time);
  const P = toneOf(time, time === 'morning' ? 0.28 : 0.32, haze);
  // 远山（最远一层淡蓝）
  cut(g, smoothPath([[-900, 900], [-900, 470], [-500, 420], [-120, 450], [260, 400], [560, 440], [900, 470], [900, 900]], { closed: true, tension: 0.4 }), mixHex(P.mountainFar, haze, 0.45));
  // 城丘
  cut(g, G.hill, mixHex(P.meadow, P.mountainFar, 0.4), { rim: mixHex(P.leafLight, haze, 0.3), rimW: 4 });
  shade(g, G.hill, P.grassDark, 0, 300, 0, 900, 0, 0.35);
  // 山坡小城（小、淡、偏冷；越往上越淡）
  const T_ = G.town;
  const Pt = toneOf(time, time === 'morning' ? 0.42 : 0.46, haze);
  const wallC = [Pt.paper, Pt.paper2, mixHex(Pt.paper, Pt.princessLight, 0.35), mixHex(Pt.paper, Pt.skyDayLow, 0.4)];
  const roofC = [Pt.roofRed, Pt.roof, mixHex(Pt.roofRed, Pt.earth, 0.4)];
  g.save(); g.translate(2, 3); g.fillStyle = rgba(P.shadow, 0.14); for (const w of T_.walls) g.fill(w); for (const r of T_.roofs) g.fill(r); g.restore();
  T_.walls.forEach((w, i) => { g.fillStyle = wallC[i]; g.fill(w); });
  T_.roofs.forEach((r, i) => { g.fillStyle = roofC[i]; g.fill(r); });
  g.fillStyle = rgba(mixHex(Pt.inkSoft, haze, 0.35), 0.6); g.fill(T_.wins);
  g.fillStyle = mixHex(Pt.grass, Pt.forest, 0.25); g.fill(T_.trees[0]);
  g.fillStyle = rgba(mixHex(Pt.leafLight, haze, 0.2), 0.8); g.fill(T_.trees[1]);
  // 广场后沿：行道树 + 矮护墙
  const Pw = toneOf(time, time === 'morning' ? 0.18 : 0.22, haze);
  g.fillStyle = mixHex(Pw.woodDark, Pw.forest, 0.3); g.fill(G.treeRow[2]);
  g.save(); g.translate(3, 4); g.fillStyle = rgba(P.shadow, 0.2); g.fill(G.treeRow[0]); g.restore();
  g.fillStyle = mixHex(Pw.grass, Pw.forest, 0.35); g.fill(G.treeRow[0]);
  g.fillStyle = mixHex(Pw.grass, Pw.leafLight, 0.35); g.fill(G.treeRow[1]);
  const pp = G.parapet, ps = mixHex(Pw.stone, Pw.paper2, 0.3);
  cut(g, pp.body, ps, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 2 });
  g.fillStyle = mixHex(Pw.stone2, Pw.inkSoft, 0.35); g.fill(pp.arches);
  g.fillStyle = mixHex(ps, Pw.stone2, 0.3); g.fill(pp.bal);
  cut(g, pp.rail, mixHex(ps, Pw.stone2, 0.2));
  cut(g, pp.cap, mixHex(ps, PAL.white, 0.15), { shadow: 2, rim: rgba(PAL.white, 0.5), rimW: 2 });
  // 王城
  const K = PLAZA.castle;
  g.save();
  g.translate(K.x, K.y); g.scale(K.s, K.s); g.translate(-K.ref[0], -K.ref[1]);
  drawMiniCastle(g, T, o, time, t, P);
  g.restore();
}

function drawMiniCastle(g, T, o, time, t, P) {
  const C = geo().castle;
  const alarm = o.alarm ?? time !== 'morning';
  const stone = mixHex(P.stone, P.paper2, 0.2), stoneD = mixHex(P.stone2, P.stoneDark, 0.2);
  // 塔（主堡两侧）
  for (const tw of C.towers) {
    cut(g, tw.body, stone, { shadow: 3, rim: rgba(PAL.white, 0.4), rimW: 3 });
    shade(g, tw.body, P.shadow, tw.x - 35, 0, tw.x + 35, 0, 0, 0.3);
    g.fillStyle = mixHex(P.inkSoft, P.stoneDark, 0.3); g.fill(tw.win);
    cut(g, tw.roof, tw.i % 2 ? P.roof : P.roofRed, { rim: rgba(PAL.white, 0.35), rimW: 3 });
    shade(g, tw.roof, P.shadow, tw.x - 43, 0, tw.x + 43, 0, 0, 0.3);
    // 旗杆 + 小三角旗
    g.strokeStyle = P.woodDark; g.lineWidth = 3;
    g.beginPath(); g.moveTo(tw.x, tw.top - 68); g.lineTo(tw.x, tw.top - 118); g.stroke();
    const fw = Math.sin(t * 3 + tw.i) * 4;
    g.fillStyle = alarm ? mixHex(P.scarf, P.stone2, 0.2) : P.scarf;
    g.beginPath(); g.moveTo(tw.x, tw.top - 118); g.lineTo(tw.x + 32, tw.top - 110 + fw); g.lineTo(tw.x, tw.top - 100); g.closePath(); g.fill();
    // 烽火（4、5 号塔）
    if (alarm && (tw.i === 4 || tw.i === 5)) {
      const k = clamp((T - (o.beaconAt?.[tw.i - 4] ?? -1e9)) / 0.3);
      if (k > 0) { glow(g, tw.x, tw.top - 84, 70, PAL.fire, 0.6 * k); flame(g, tw.x, tw.top - 66, 0.9 * k, t, tw.i); }
    }
  }
  // 城墙 + 垛口 + 石缝 + 城门
  const wallC = mixHex(stone, stoneD, 0.35);
  g.fillStyle = wallC; g.fill(C.merl);
  cut(g, C.wall, wallC, { shadow: 3, rim: rgba(PAL.white, 0.45), rimW: 4 });
  g.save(); g.clip(C.wall);
  g.strokeStyle = rgba(P.stoneDark, 0.3); g.lineWidth = 3; g.stroke(C.joints);
  g.fillStyle = lin(g, 0, 700, 0, 900, [[0, rgba(P.shadow, 0.25)], [0.12, rgba(P.shadow, 0)], [0.7, rgba(P.shadow, 0.08)], [1, rgba(P.shadow, 0.3)]]); g.fillRect(250, 690, 1420, 220);
  g.restore();
  g.fillStyle = mixHex(P.ink, P.stoneDark, 0.4); g.fill(C.gate);
  // 主堡
  cut(g, C.keep, stone, { shadow: 4, rim: rgba(PAL.white, 0.45), rimW: 3 });
  shade(g, C.keep, P.shadow, 840, 0, 1080, 0, 0, 0.32);
  g.fillStyle = stone; g.fill(C.keepMerl);
  cut(g, C.spire, P.roofRed, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 3 });
  shade(g, C.spire, P.shadow, 826, 0, 1094, 0, 0, 0.32);
  g.strokeStyle = P.woodDark; g.lineWidth = 4; g.beginPath(); g.moveTo(960, 122); g.lineTo(960, 52); g.stroke();
  g.fillStyle = P.scarf; g.beginPath(); g.moveTo(960, 52); g.lineTo(1010, 64 + Math.sin(t * 3) * 5); g.lineTo(960, 78); g.closePath(); g.fill();
  drawRoundWindow(g, { x: 960, y: 430, r: 70, face: 'out', t, seed: 5 });
  // 阳台：门洞 → 小国王 → 地板 → 栏杆 → 花箱 → 红灯笼
  g.fillStyle = mixHex(P.ink, P.inkSoft, 0.3); g.fill(C.balDoor);
  const [kx, ky, ks] = PLAZA.balconyKing;
  if (o.farKing !== null && o.farKing !== 'none') drawTinyKing(g, kx, ky, ks, o.farKing ?? (time === 'gray' ? 'holdHead' : time === 'beam' ? 'leanForward' : 'idle'), t, P, o);
  cut(g, C.balFloor, mixHex(P.stone2, P.paper2, 0.3), { shadow: 2, rim: rgba(PAL.white, 0.4), rimW: 2 });
  g.fillStyle = mixHex(P.stone2, P.paper2, 0.2); g.fill(C.balusters);
  cut(g, C.balRail, mixHex(P.stone, P.paper2, 0.3), { rim: rgba(PAL.white, 0.5), rimW: 2 });
  cut(g, C.flowerBox, P.woodDark);
  for (let i = 0; i < 6; i++) { g.fillStyle = [P.heart, P.princess, P.gold][i % 3]; g.beginPath(); g.arc(862 + i * 11, 538 - (i % 2) * 3, 5.5, 0, TAU); g.fill(); }
  const pulse = alarm ? 0.5 + 0.5 * Math.sin(t * TAU * 2) : 0.3;
  if (alarm) glow(g, 1062, 548, 60, PAL.red, 0.55 * pulse);
  g.strokeStyle = P.woodDark; g.lineWidth = 2.5; g.beginPath(); g.moveTo(1062, 530); g.lineTo(1062, 538); g.stroke();
  cut(g, blob(1062, 549, 11, 13, { seed: 2400, n: 20 }), alarm ? mixHex(PAL.red, PAL.fire, 0.2 * pulse) : P.red, { rim: mixHex(PAL.red, PAL.goldLight, 0.5), rimW: 2 });
}

/**
 * 远景小国王（CASTLE 坐标，脚底 (x,y)，缩放 s；s=1 时身高 220 + 王冠 45）。
 * pose：idle / holdHead（抱头，左右慌跑）/ leanForward（探出栏杆）/ beardFlip（胡子被掀起盖脸）/ wave（挥手帕）；也可 {from,to,k}（取 k<0.5 的那个）。
 */
function drawTinyKing(g, x, y, s, pose0, t, P, o) {
  const pose = pose0 && typeof pose0 === 'object' ? (pose0.k < 0.5 ? pose0.from : pose0.to) : pose0;
  g.save();
  let px = x, rot = 0, bob = 0;
  if (pose === 'holdHead') { px += Math.sin(t * 5.2) * 34; bob = -Math.abs(Math.sin(t * 10.4)) * 10; }
  if (pose === 'leanForward') rot = 0.0;
  if (pose === 'wave') bob = -Math.abs(Math.sin(t * 4)) * 4;
  g.translate(px, y + bob);
  g.scale(s, s);
  if (pose === 'leanForward') { g.translate(0, 36); g.scale(1.12, 1.12); }
  g.rotate(rot);
  const robe = P.robe, skin = P.skin, beard = mixHex(P.beard, PAL.white, 0.2), gold = P.gold;
  const arm = (x0, y0, x1, y1, x2, y2) => { g.strokeStyle = mixHex(robe, P.robeDark, 0.2); g.lineWidth = 30; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.fillStyle = skin; g.beginPath(); g.arc(x2, y2, 15, 0, TAU); g.fill(); };
  // 身体（红袍）+ 貂皮领
  g.fillStyle = robe; g.fill(blob(0, -72, 66, 74, { seed: 2500, amp: 0.02, n: 28 }));
  g.fillStyle = P.ermine; g.fill(blob(0, -138, 58, 20, { seed: 2501, amp: 0.03, n: 24 }));
  g.fillStyle = P.ink; for (const dx of [-30, -6, 20, 40]) { g.beginPath(); g.arc(dx, -136 + (dx % 3), 3.5, 0, TAU); g.fill(); }
  // 手臂（按姿势）
  if (pose === 'holdHead') { arm(-50, -128, -92, -176, -44, -206); arm(50, -128, 92, -176, 44, -206); }
  else if (pose === 'leanForward') { arm(-52, -124, -88, -96, -76, -64); arm(52, -124, 88, -96, 76, -64); }
  else if (pose === 'beardFlip') { const fl = Math.sin(t * 14) * 8; arm(-50, -128, -100, -160 + fl, -118, -206 + fl); arm(50, -128, 100, -160 - fl, 118, -206 - fl); }
  else if (pose === 'wave') { const w = Math.sin(t * 7) * 0.5; arm(-52, -124, -66, -86, -60, -54); arm(52, -128, 84, -170, 84 + Math.sin(w) * 40, -236);
    g.save(); g.translate(84 + Math.sin(w) * 40, -244); g.rotate(-0.5 + w * 1.2); g.fillStyle = PAL.white; g.fill(pathOfPts([[0, 0], [52, -10], [44, 30], [6, 34]])); g.restore(); }
  else { arm(-52, -124, -70, -90, -62, -56); arm(52, -124, 70, -90, 62, -56); }
  // 头、眼、胡子
  g.fillStyle = skin; g.beginPath(); g.arc(0, -176, 42, 0, TAU); g.fill();
  if (pose === 'beardFlip') {
    g.fillStyle = beard; g.fill(blob(0, -184, 46, 40, { seed: 2502, amp: 0.06, n: 24 }));
  } else {
    g.fillStyle = P.ink; for (const dx of [-14, 14]) { g.beginPath(); g.ellipse(dx, -184, 4.5, 6.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = beard; g.fill(blob(0, -148, 40, 32, { seed: 2503, amp: 0.05, n: 24 }));
  }
  // 王冠（被掀时向后歪）
  g.save();
  g.translate(0, -214);
  if (pose === 'beardFlip') { g.rotate(-0.45); g.translate(-10, -18); }
  if (pose === 'holdHead') g.rotate(0.12);
  g.fillStyle = gold;
  g.fill(pathOfPts([[-40, 8], [-46, -38], [-20, -14], [0, -46], [20, -14], [46, -38], [40, 8]]));
  g.fillStyle = P.red; g.beginPath(); g.arc(0, -6, 6, 0, TAU); g.fill();
  g.restore();
  g.restore();
}

// ———————————————————— mid：木筋屋 ————————————————————
function drawMid(g, T, o, time, t) {
  const P = toneOf(time);
  const G = geo();
  for (const H of G.houses) drawHouse(g, H, P, t, time, o);
}
function drawHouse(g, H, P, t, time, o) {
  const plaster = mixHex(P.paper, P.paper2, 0.35), timber = mixHex(P.woodDark, P.ink, 0.15);
  // 烟囱 + 炊烟
  if (H.chim) {
    cut(g, H.chim, mixHex(P.stone2, P.roofRed, 0.2), { shadow: 2, rim: rgba(PAL.white, 0.3), rimW: 2 });
    const [cx, cy] = H.chimTop;
    stream(g, t, { start: -30, end: 1e9, rate: 1.4, seed: Math.floor(cx), life: [3.2, 4.2], emit: () => ({ x: cx, y: cy - 6, vx: 10, vy: -26 }), drag: 0.15, size: [16, 26] }, (gg, sx, sy, s) => {
      gg.fillStyle = rgba(time === 'morning' ? PAL.white : mixHex(GRAY, PAL.paper, 0.4), 0.42 * (1 - s.p));
      gg.beginPath(); gg.arc(sx + Math.sin(s.age * 1.4 + s.i) * 6, sy, s.size * (0.6 + s.p * 0.9), 0, TAU); gg.fill();
    });
  }
  // 屋顶
  const roofC = P[H.roofKey] ?? P.roof;
  cut(g, H.roof, roofC, { shadow: 4, rim: rgba(PAL.white, 0.35), rimW: 3 });
  g.save(); g.clip(H.roof); g.strokeStyle = rgba(P.shadow, 0.28); g.lineWidth = 2.5; g.stroke(H.tiles); g.restore();
  shade(g, H.roof, P.shadow, H.x0, 0, H.x1, 0, 0, 0.3);
  if (H.gable) { cut(g, H.gable, plaster); g.save(); g.clip(H.gable); g.strokeStyle = timber; g.lineWidth = 7; g.beginPath(); const cx = (H.x0 + H.x1) / 2; g.moveTo(cx, H.peak + 30); g.lineTo(cx, H.eave); g.moveTo(cx - 40, H.eave); g.lineTo(cx, H.eave - 60); g.lineTo(cx + 40, H.eave); g.stroke(); g.restore(); }
  // 上层：灰泥 + 木筋 + 窗
  cut(g, H.upper, plaster, { shadow: 3, rim: rgba(PAL.white, 0.5), rimW: 2 });
  g.save(); g.clip(H.upper);
  g.fillStyle = timber; g.fill(H.beams);
  g.fillStyle = lin(g, H.x0, 0, H.x1, 0, [[0, rgba(PAL.white, 0.12)], [0.5, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.22)]]);
  g.fillRect(H.x0 - 30, H.eave, H.x1 - H.x0 + 60, H.base - H.eave);
  g.restore();
  for (const [i, W] of H.wins.entries()) drawHouseWindow(g, W, P, i + H.seed, time);
  // 二楼出挑梁
  cut(g, H.jettyBeam, timber, { shadow: 2 });
  // 一层：石砌底 + 门 + 橱窗 + 遮阳篷
  cut(g, H.ground, mixHex(P.stone, P.paper2, 0.3), { rim: rgba(PAL.white, 0.35), rimW: 2 });
  g.save(); g.clip(H.ground);
  g.strokeStyle = rgba(P.stoneDark, 0.22); g.lineWidth = 1.6;
  g.beginPath(); for (let y = H.base - 160; y < H.base; y += 32) { g.moveTo(H.x0, y); g.lineTo(H.x1, y); for (let x = H.x0 + ((y / 32) % 2) * 30; x < H.x1; x += 60) { g.moveTo(x, y); g.lineTo(x, y + 32); } } g.stroke();
  g.fillStyle = lin(g, H.x0, 0, H.x1, 0, [[0, rgba(PAL.white, 0.1)], [1, rgba(P.shadow, 0.25)]]); g.fillRect(H.x0, H.base - 180, H.x1 - H.x0, 220);
  g.restore();
  cut(g, H.door, mixHex(P.wood, P.woodDark, 0.3), { shadow: 2 });
  g.save(); g.clip(H.door); g.strokeStyle = rgba(P.woodDark, 0.8); g.lineWidth = 2; g.beginPath(); for (let k = -2; k <= 2; k++) { const dx = (H.x0 + H.x1) / 2 + (H.sign ? -(H.x1 - H.x0) * 0.18 : 0) + k * 12; g.moveTo(dx, H.base - 130); g.lineTo(dx, H.base); } g.stroke(); g.restore();
  if (H.shopWin) {
    const s = H.shopWin;
    cut(g, rr(s.x, s.y, s.w, s.h, 4), mixHex(P.skyDayLow, P.inkSoft, 0.45), { shadow: 2 });
    g.fillStyle = rgba(PAL.white, 0.22); g.fill(pathOfPts([[s.x + 8, s.y + 4], [s.x + 26, s.y + 4], [s.x + 10, s.y + s.h - 4], [s.x + 4, s.y + s.h - 4]]));
    g.strokeStyle = timber; g.lineWidth = 4; g.strokeRect(s.x, s.y, s.w, s.h);
    H.awning.forEach((st, i) => cut(g, st, i % 2 ? P.paper : P.red, { shadow: i === 0 ? 2 : 0 }));
  }
  // 招牌
  if (H.sign) {
    const sx = H.sign === 'mug' ? H.x0 - 6 : H.x1 + 6, sy = H.base - 240;
    const dir = H.sign === 'mug' ? -1 : 1;
    g.strokeStyle = mixHex(P.inkSoft, P.ink, 0.3); g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dir * 74, sy); g.moveTo(sx, sy + 24); g.quadraticCurveTo(sx + dir * 20, sy, sx + dir * 40, sy); g.stroke();
    const sw = Math.sin(t * 1.3 + H.seed) * 0.06;
    g.save(); g.translate(sx + dir * 56, sy); g.rotate(sw);
    g.strokeStyle = mixHex(P.inkSoft, P.ink, 0.3); g.lineWidth = 2; g.beginPath(); g.moveTo(-14, 0); g.lineTo(-14, 12); g.moveTo(14, 0); g.lineTo(14, 12); g.stroke();
    cut(g, blob(0, 40, 30, 30, { seed: H.seed + 50, n: 28 }), P.paper2, { shadow: 2, stroke: P.woodDark, lw: 4 });
    if (H.sign === 'pretzel') { g.strokeStyle = mixHex(P.earth, P.wood, 0.3); g.lineWidth = 6; g.beginPath(); g.arc(-7, 38, 10, 0.3, TAU - 0.6); g.moveTo(7 + 10, 38); g.arc(7, 38, 10, 0, TAU - 0.9); g.stroke(); }
    else { cut(g, rr(-12, 26, 22, 28, 4), P.gold, { rim: P.goldLight, rimW: 1.5 }); g.strokeStyle = P.gold; g.lineWidth = 4; g.beginPath(); g.arc(12, 40, 7, -1.2, 1.2); g.stroke(); g.fillStyle = PAL.white; g.fill(blob(-1, 25, 13, 6, { seed: 3, n: 16 })); }
    g.restore();
  }
  // 小阳台（右屋）
  if (H.balcony) {
    const y = H.eave + (H.base - 170 - H.eave) * 0.5 + 40, x0 = H.x0 + 40, x1 = H.x1 - 40;
    cut(g, pcut(rectPts(x0 - 10, y, x1 + 10, y + 10), H.seed + 60, 0.4, 30), mixHex(P.wood, P.woodDark, 0.3), { shadow: 2 });
    g.strokeStyle = mixHex(P.wood, P.woodDark, 0.3); g.lineWidth = 4; g.beginPath(); for (let x = x0; x <= x1; x += 16) { g.moveTo(x, y); g.lineTo(x, y - 30); } g.moveTo(x0 - 6, y - 32); g.lineTo(x1 + 6, y - 32); g.stroke();
    for (let i = 0; i < 9; i++) { g.fillStyle = [P.heart, P.princess, P.gold, P.leafLight][i % 4]; g.beginPath(); g.arc(x0 + 6 + i * ((x1 - x0 - 12) / 8), y - 36 - (i % 2) * 4, 7, 0, TAU); g.fill(); }
  }
}
function drawHouseWindow(g, W, P, seed, time) {
  const { x, y, w, h } = W;
  const glass = time === 'morning' ? mixHex(P.skyDayLow, P.skyDay, 0.4) : mixHex(P.inkSoft, P.skyDayLow, 0.3);
  cut(g, rr(x - 4, y - 4, w + 8, h + 8, 3), mixHex(P.woodDark, P.ink, 0.15));
  g.fillStyle = glass; g.fillRect(x, y, w, h);
  g.fillStyle = rgba(PAL.white, 0.3); g.fill(pathOfPts([[x + 4, y + 3], [x + 14, y + 3], [x + 5, y + h - 3], [x + 2, y + h - 3]]));
  g.strokeStyle = mixHex(P.woodDark, P.ink, 0.15); g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
  const sh = seed % 3 === 0 ? P.heroBlue : seed % 3 === 1 ? mixHex(P.grass, P.forest, 0.3) : P.redDark;
  cut(g, rr(x - 4 - w * 0.42, y - 2, w * 0.4, h + 4, 2), sh, { shadow: 1.5 });
  cut(g, rr(x + w + 4, y - 2, w * 0.4, h + 4, 2), sh, { shadow: 1.5 });
  cut(g, rr(x - 6, y + h + 2, w + 12, 10, 3), mixHex(P.wood, P.woodDark, 0.2), { shadow: 1.5 });
  for (let i = 0; i < 5; i++) { g.fillStyle = [P.heart, P.gold, P.princess][(i + seed) % 3]; g.beginPath(); g.arc(x + 2 + i * ((w - 4) / 4), y + h - 1 - (i % 2) * 3, 5, 0, TAU); g.fill(); }
}

// ———————————————————— main：地面、水井、告示板、城门楼、光圈 ————————————————————
function drawMain(g, T, o, time, t, c) {
  const P = toneOf(time);
  const G = geo();
  // 城门楼与城墙（先画，地面盖住它们的底边）
  drawGatehouse(g, T, o, time, t, P);
  // 地面：缝隙色 → 石板（四色）→ 小路 → 远近明暗
  g.fillStyle = mixHex(P.stone2, P.stoneDark, 0.35); g.fillRect(-2600, PLAZA.groundTop, 7200, 1300);
  const slabC = [mixHex(P.stone, P.paper2, 0.35), P.stone, mixHex(P.stone, P.stone2, 0.5), mixHex(P.paper2, P.stone, 0.5)];
  G.slabs.forEach((p, i) => { g.fillStyle = slabC[i]; g.fill(p); });
  g.save();
  // 进城小路：从画左边缘进来、越近越宽的一条暖色土路（软边）
  const path = smoothPath([[-700, 848], [150, 848], [330, 900], [470, 1010], [560, 1180], [600, 1400], [-700, 1400]], { closed: true, tension: 0.45 });
  g.fillStyle = lin(g, -200, 0, 620, 0, [[0, rgba(mixHex(P.path, P.sand, 0.4), 0.6)], [0.6, rgba(mixHex(P.path, P.sand, 0.4), 0.45)], [1, rgba(P.path, 0)]]);
  g.fill(path);
  g.restore();
  g.fillStyle = lin(g, 0, PLAZA.groundTop, 0, 1400, [[0, rgba(P.shadow, 0.16)], [0.06, rgba(P.shadow, 0)], [0.45, rgba(P.shadow, 0.08)], [1, rgba(P.shadow, 0.38)]]);
  g.fillRect(-2600, PLAZA.groundTop, 7200, 1300);
  g.fillStyle = rgba(PAL.white, 0.25); g.fillRect(-2600, PLAZA.groundTop, 7200, 2);
  // 光圈
  const lc = clamp(o.lightCircle ?? 0);
  if (lc > 0) {
    g.save();
    g.globalCompositeOperation = 'screen';
    g.translate(PLAZA.lightX, PLAZA.lightY + 14); g.scale(1, 0.2);
    g.fillStyle = rad(g, 0, 0, 0, 230, [[0, rgba(PAL.goldLight, 0.95 * lc)], [0.55, rgba(PAL.goldLight, 0.55 * lc)], [1, rgba(PAL.goldLight, 0)]]);
    g.beginPath(); g.arc(0, 0, 230, 0, TAU); g.fill();
    g.restore();
  }
  drawWell(g, T, o, time, t, P);
  drawBoard(g, T, o, time, t, P);
}

function drawGatehouse(g, T, o, time, t, P) {
  const G = geo().gate, Gt = PLAZA.gate;
  const stone = mixHex(P.stone, P.paper2, 0.15), stoneD = mixHex(P.stone2, P.stoneDark, 0.15);
  // 门洞里：城外（天、远山、田、出城的路）
  g.save();
  g.clip(G.hole);
  const morning = time === 'morning';
  g.fillStyle = lin(g, 0, Gt.y0, 0, 720, morning ? [PAL.skyDay, PAL.skyDayLow] : [mixHex(GRAY, PAL.stoneDark, 0.2), mixHex(GRAY, PAL.skyDayLow, 0.4)]);
  g.fillRect(Gt.x0 - 10, Gt.y0 - 10, Gt.x1 - Gt.x0 + 20, 420);
  const tone = (cc) => (morning ? cc : mixHex(cc, GRAY, 0.6));
  cut(g, blob(Gt.cx - 60, 760, 200, 70, { seed: 3900 }), tone(PAL.mountainFar));
  cut(g, blob(Gt.cx + 80, 790, 220, 70, { seed: 3901 }), tone(mixHex(PAL.meadow, PAL.mountainFar, 0.3)));
  cut(g, pcut([[Gt.x0 - 10, 800], [Gt.x1 + 10, 790], [Gt.x1 + 10, 870], [Gt.x0 - 10, 870]], 3902, 1, 30), tone(PAL.meadow));
  cut(g, pcut([[Gt.cx - 20, 802], [Gt.cx + 20, 802], [Gt.cx + 90, 870], [Gt.cx - 70, 870]], 3903, 1, 20), tone(PAL.path));
  if (morning) glow(g, Gt.cx + 60, 640, 160, PAL.goldLight, 0.5);
  g.restore();
  // 城墙（向右）+ 圆塔
  cut(g, G.wall, stoneD, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 3 });
  g.fillStyle = stoneD; g.fill(G.wm);
  cut(g, G.tower, stone, { shadow: 4, rim: rgba(PAL.white, 0.4), rimW: 3 });
  shade(g, G.tower, P.shadow, 2340, 0, 2520, 0, 0, 0.35);
  g.fillStyle = stone; g.fill(G.towerM);
  cut(g, G.towerRoof, P.roof, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 3 });
  g.strokeStyle = P.woodDark; g.lineWidth = 3; g.beginPath(); g.moveTo(2430, 152); g.lineTo(2430, 100); g.stroke();
  g.fillStyle = P.scarf; g.beginPath(); g.moveTo(2430, 100); g.lineTo(2470, 110 + Math.sin(t * 3.1) * 4); g.lineTo(2430, 122); g.closePath(); g.fill();
  // 城门楼（evenodd：拱洞透出城外）
  g.save();
  g.shadowColor = rgba(PAL.shadow, 0.3); g.shadowBlur = 8; g.shadowOffsetX = 2; g.shadowOffsetY = 4;
  g.fillStyle = stone; g.fill(G.house, 'evenodd');
  g.restore();
  g.fillStyle = stone; g.fill(G.gm);
  g.save(); g.clip(G.house, 'evenodd');
  g.strokeStyle = rgba(P.stoneDark, 0.2); g.lineWidth = 1.8; g.stroke(G.blocks);
  g.fillStyle = lin(g, 1606, 0, 1954, 0, [[0, rgba(PAL.white, 0.14)], [0.5, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.26)]]);
  g.fillRect(1600, 250, 360, 640);
  g.restore();
  g.save(); g.clip(G.wall); g.strokeStyle = rgba(P.stoneDark, 0.24); g.lineWidth = 1.8; g.stroke(G.blocks);
  g.fillStyle = lin(g, 0, 472, 0, 864, [[0, rgba(PAL.white, 0.1)], [1, rgba(P.shadow, 0.28)]]); g.fillRect(1950, 470, 1460, 400);
  g.fillStyle = mixHex(P.ink, P.stoneDark, 0.3); for (const x of [2120, 2660, 2900, 3180]) g.fill(rr(x, 560, 14, 46, 7));
  g.fillStyle = mixHex(P.grass, P.forest, 0.35); for (const [x, y, r] of [[2010, 840, 46], [2200, 520, 30], [2600, 700, 40], [2980, 820, 52]]) g.fill(blob(x, y, r, r * 0.6, { seed: x, amp: 0.12, n: 22 }));
  g.restore();
  // 门洞内壁（拱腹阴影）+ 收起的闸门齿
  g.save(); g.clip(G.hole);
  g.fillStyle = lin(g, 0, Gt.y0, 0, Gt.y0 + 90, [[0, rgba(P.ink, 0.55)], [1, rgba(P.ink, 0)]]);
  g.fillRect(Gt.x0, Gt.y0, Gt.x1 - Gt.x0, 90);
  g.fillStyle = lin(g, Gt.x0, 0, Gt.x0 + 40, 0, [[0, rgba(P.ink, 0.35)], [1, rgba(P.ink, 0)]]); g.fillRect(Gt.x0, Gt.y0, 40, 400);
  g.fillStyle = mixHex(P.inkSoft, P.ink, 0.3);
  for (let x = Gt.x0 + 10; x < Gt.x1; x += 22) { g.beginPath(); g.moveTo(x - 5, 470); g.lineTo(x + 5, 470); g.lineTo(x + 3, 516); g.lineTo(x, 526); g.lineTo(x - 3, 516); g.closePath(); g.fill(); }
  g.fillRect(Gt.x0, 494, Gt.x1 - Gt.x0, 7);
  g.restore();
  for (const [i, v] of G.vous.entries()) { cut(g, v, i === 5 ? mixHex(P.stone2, P.gold, 0.35) : mixHex(P.stone, P.paper2, 0.25), { shadow: 2, rim: rgba(PAL.white, 0.45), rimW: 2 }); }
  // 拱心石上的金盾
  const sx = Gt.cx, sy = Gt.y0 - 22;
  cut(g, smoothPath([[sx - 13, sy - 14], [sx + 13, sy - 14], [sx + 12, sy + 4], [sx, sy + 16], [sx - 12, sy + 4]], { closed: true, tension: 0.3 }), P.gold, { rim: P.goldLight, rimW: 1.5 });
  // 门楼正面的红底金盾长幡
  const bx = 1700, by0 = 318, by1 = 444, sw = Math.sin(t * 0.9) * 2;
  for (const bx_ of [bx, 1860]) {
    const pts = [[bx_ - 26, by0], [bx_ + 26, by0], [bx_ + 26 + sw, by1], [bx_ + sw, by1 - 18], [bx_ - 26 + sw, by1]];
    const p = pcut(pts, 3950 + bx_, 0.5, 20);
    cut(g, p, P.red, { shadow: 2.5 });
    g.save(); g.clip(p); g.lineWidth = 9; g.strokeStyle = P.gold; g.stroke(p); g.lineWidth = 4; g.strokeStyle = P.red; g.stroke(p); g.restore();
    cut(g, smoothPath([[bx_ - 13, 350], [bx_ + 13, 350], [bx_ + 12, 370], [bx_, 384], [bx_ - 12, 370]], { closed: true, tension: 0.3 }), P.gold, { rim: P.goldLight, rimW: 1.2 });
    cut(g, rr(bx_ - 34, by0 - 6, 68, 8, 4), P.goldDark, { rim: P.gold, rimW: 1.5 });
  }
  g.fillStyle = mixHex(P.ink, P.stoneDark, 0.3); g.fill(G.slit);
}

function drawWell(g, T, o, time, t, P) {
  const W = geo().well, x = PLAZA.well.x;
  const sh = o.shockAt ?? 1e9;
  const swing = wobble(t, sh + 0.1, 1.6, 0.9) * 0.5 + Math.sin(t * 1.1) * 0.03;
  for (const p of W.posts) { cut(g, p, P.wood, { shadow: 2, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 2 }); shade(g, p, P.shadow, x - 70, 0, x + 70, 0, 0, 0.3); }
  cut(g, W.bar, P.woodDark, { shadow: 2, rim: P.wood, rimW: 2 });
  // 绳 + 吊桶
  g.save();
  g.translate(x, 642); g.rotate(swing);
  g.strokeStyle = mixHex(P.kraftDark, P.woodDark, 0.3); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 66); g.stroke();
  cut(g, pcut([[-17, 66], [17, 66], [13, 100], [-13, 100]], 3410, 0.5, 10), P.wood, { shadow: 2, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 2 });
  g.strokeStyle = mixHex(P.inkSoft, P.stoneDark, 0.3); g.lineWidth = 2.5; g.beginPath(); g.moveTo(-16, 74); g.lineTo(16, 74); g.moveTo(-14, 92); g.lineTo(14, 92); g.moveTo(-17, 66); g.quadraticCurveTo(0, 50, 17, 66); g.stroke();
  g.restore();
  cut(g, W.roof, P.roofRed, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 2.5 });
  cut(g, W.roofFace, mixHex(P.roofRed, P.shadow, 0.25));
  // 井身：石块 + 顶沿 + 井口水面
  cut(g, W.body, mixHex(P.stone, P.paper2, 0.2), { shadow: 3 });
  g.save(); g.clip(W.body);
  g.strokeStyle = rgba(P.stoneDark, 0.3); g.lineWidth = 2;
  g.beginPath(); for (let y = 800; y < 862; y += 20) { g.moveTo(x - 80, y); g.lineTo(x + 80, y); for (let xx = x - 74 + ((y / 20) % 2) * 18; xx < x + 74; xx += 36) { g.moveTo(xx, y); g.lineTo(xx, y + 20); } } g.stroke();
  g.fillStyle = lin(g, x - 74, 0, x + 74, 0, [[0, rgba(PAL.white, 0.16)], [0.4, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.35)]]); g.fillRect(x - 80, 780, 160, 90);
  g.restore();
  cut(g, W.rim, mixHex(P.stone2, P.paper2, 0.4), { shadow: 2, rim: rgba(PAL.white, 0.55), rimW: 2.5 });
  g.fillStyle = mixHex(P.waterDeep, P.ink, 0.35); g.fill(W.hole);
  g.fillStyle = rgba(PAL.white, 0.25); g.beginPath(); g.ellipse(x - 20, 781, 18, 3, 0, 0, TAU); g.fill();
}

function drawBoard(g, T, o, time, t, P) {
  const B = geo().board, b = PLAZA.board;
  for (const p of B.posts) cut(g, p, P.wood, { shadow: 3, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 2 });
  B.posts.forEach((p, i) => shade(g, p, P.shadow, b.posts[i] - 8, 0, b.posts[i] + 8, 0, 0, 0.35));
  cut(g, B.frame, P.woodDark, { shadow: 4, rim: P.wood, rimW: 2.5 });
  cut(g, B.panel, mixHex(P.kraft, P.wood, 0.25));
  g.save(); g.clip(B.panel);
  g.strokeStyle = rgba(P.woodDark, 0.25); g.lineWidth = 2;
  g.beginPath(); for (let y = 476; y < 666; y += 24) { g.moveTo(934, y); g.lineTo(1226, y + ((y / 24) % 2) * 2); } g.stroke();
  g.fillStyle = lin(g, 934, 454, 1226, 666, [[0, rgba(PAL.white, 0.1)], [1, rgba(P.shadow, 0.25)]]); g.fillRect(930, 450, 300, 220);
  g.restore();
  // 旧告示的残角（none 时）+ 图钉孔
  const notice = o.notice || 'none';
  if (notice === 'none') {
    for (const [i, s] of B.scraps.entries()) cut(g, s, i === 1 ? mixHex(P.paper, P.kraft, 0.3) : P.paper2, { shadow: 1.5 });
  }
  g.fillStyle = rgba(P.ink, 0.35); for (const [px, py] of [[958, 474], [1202, 474], [1018, 640], [1150, 520]]) { g.beginPath(); g.arc(px, py, 2.2, 0, TAU); g.fill(); }
  // 横梁 + 小屋顶
  cut(g, B.beam, P.woodDark, { shadow: 2, rim: P.wood, rimW: 2 });
  cut(g, B.roof, P.roofRed, { shadow: 3, rim: rgba(PAL.white, 0.35), rimW: 2.5 });
  g.save(); g.clip(B.roof); g.strokeStyle = rgba(P.shadow, 0.3); g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 9; k++) { const x = 920 + k * 40; g.moveTo(x, 448); g.lineTo(lerp(x, 1080, 0.2), 420); } g.stroke(); g.restore();
  // 告示本体（props/paper.js；锚在板心，280×200）。noticeOpts 原样并入 drawNotice 参数（L06 拍上去：unroll / pins / squash；翻面：flip / back）
  const no = o.noticeOpts || {};
  if (notice === 'full') drawNotice(g, { x: b.cx, y: b.cy, t, face: 'front', pins: 2, ...no });
  else if (notice === 'corners') drawNotice(g, { x: b.cx, y: b.cy, t, corners: true, ...no });
}

// ———————————————————— fg：彩旗串、木桶、花箱 ————————————————————
function drawFg(g, T, o, time, t) {
  const P = toneOf(time);
  const G = geo();
  const sh = o.shockAt ?? 1e9;
  const blowK = t < sh ? 0 : Math.exp(-(t - sh) / 0.6);
  const COLS = [P.red, P.gold, P.heroBlue, P.meadow, P.princess];
  for (const [si, S] of G.bunting.entries()) {
    const lift = -blowK * 28;
    g.save();
    g.strokeStyle = mixHex(P.kraftDark, P.woodDark, 0.3); g.lineWidth = 3;
    g.beginPath(); S.pts.forEach(([x, y], i) => { const yy = y + lift * Math.sin((x / 300) % Math.PI); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }); g.stroke();
    for (const f of S.flags) {
      const flutter = noise1(t * 2.2 + f.seed * 0.37, si) * 0.22 + Math.sin(t * 3.1 + f.k) * 0.06;
      const whip = -blowK * (0.9 + 0.3 * Math.sin(t * 22 + f.k)) ;
      g.save();
      g.translate(f.x, f.y + lift * Math.sin((f.x / 300) % Math.PI));
      g.rotate(f.a + flutter + whip);
      const p = pathOfPts([[-16, 0], [16, 0], [1, 40]]);
      cut(g, p, COLS[(f.k + si * 2) % 5], { shadow: 2 });
      shade(g, p, P.shadow, -16, 0, 16, 40, 0, 0.3);
      g.restore();
    }
    g.restore();
  }
  // 左下木桶（喊声冲击时翻倒滚开）
  {
    const k = t < sh + 0.08 ? 0 : clamp((t - sh - 0.08) / 0.32);
    const tip = outBack(k, 1.6) * (Math.PI / 2);
    const roll = k >= 1 ? Math.min(1.2, (t - sh - 0.4) * 0.9) : 0;
    g.save();
    g.translate(60 - roll * 60, 1180);
    g.rotate(-tip - roll * 0.6);
    const body = smoothPath([[-2, 0], [-14, -120], [-2, -240], [196, -240], [208, -120], [196, 0]], { closed: true, tension: 0.35 });
    g.translate(0, 0);
    cut(g, body, P.wood, { shadow: 6, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 3 });
    g.save(); g.clip(body);
    g.strokeStyle = rgba(P.woodDark, 0.55); g.lineWidth = 3; g.beginPath(); for (let x = 20; x < 200; x += 30) { g.moveTo(x, 0); g.quadraticCurveTo(x + (x - 97) * 0.12, -120, x, -240); } g.stroke();
    g.fillStyle = mixHex(P.inkSoft, P.stoneDark, 0.3); for (const y of [-40, -200]) g.fillRect(-20, y - 8, 240, 16);
    g.fillStyle = lin(g, 0, 0, 200, 0, [[0, rgba(PAL.white, 0.15)], [0.35, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.4)]]); g.fillRect(-20, -250, 240, 260);
    g.restore();
    cut(g, blob(97, -240, 100, 16, { seed: 4200, amp: 0.01 }), mixHex(P.wood, P.woodDark, 0.4), { rim: mixHex(P.wood, PAL.white, 0.3), rimW: 2 });
    g.restore();
  }
  // 右下花箱（冲击时花瓣被吹飞）
  {
    const x0 = 1640, y0 = 1010;
    cut(g, pcut([[x0, y0], [x0 + 330, y0], [x0 + 316, y0 + 140], [x0 + 14, y0 + 140]], 4300, 0.8, 30), P.wood, { shadow: 6, rim: mixHex(P.wood, PAL.white, 0.3), rimW: 3 });
    g.strokeStyle = rgba(P.woodDark, 0.5); g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 8, y0 + 46); g.lineTo(x0 + 322, y0 + 46); g.moveTo(x0 + 12, y0 + 94); g.lineTo(x0 + 318, y0 + 94); g.stroke();
    const wind = blowK;
    for (let i = 0; i < 14; i++) {
      const fx = x0 + 18 + i * 22, sway = Math.sin(t * 1.6 + i) * 3 + wind * 30;
      g.strokeStyle = P.grass; g.lineWidth = 4; g.beginPath(); g.moveTo(fx, y0 + 4); g.quadraticCurveTo(fx + sway * 0.4, y0 - 30, fx + sway, y0 - 50 - (i % 3) * 12); g.stroke();
      cut(g, blob(fx + sway - 10, y0 - 30, 12, 6, { seed: 4310 + i, rot: -0.6, n: 14 }), P.leafLight);
      const col = [P.heart, P.princess, P.gold, P.princessLight][i % 4];
      for (let q = 0; q < 5; q++) { const a = (q / 5) * TAU + i; cut(g, blob(fx + sway + Math.cos(a) * 8, y0 - 54 - (i % 3) * 12 + Math.sin(a) * 8, 7, 7, { seed: 4330 + i * 5 + q, n: 12 }), col); }
      g.fillStyle = P.gold; g.beginPath(); g.arc(fx + sway, y0 - 54 - (i % 3) * 12, 4, 0, TAU); g.fill();
    }
    if (sh < 1e8) burst(g, t, { at: sh + 0.05, seed: 77, count: 36, x: x0 + 160, y: y0 - 60, spread: 140, speed: [300, 700], angle: [-0.6, 0.2], gravity: 400, drag: 1.4, life: [0.8, 1.6], size: [6, 11] }, (gg, x, y, s) => {
      gg.save(); gg.translate(x, y); gg.rotate(s.rot); gg.fillStyle = [P.heart, P.princess, P.princessLight, P.gold][s.i % 4]; gg.globalAlpha *= 1 - s.p * 0.6;
      gg.beginPath(); gg.ellipse(0, 0, s.size, s.size * 0.55, 0, 0, TAU); gg.fill(); gg.restore();
    });
  }
}

// ———————————————————— light：光柱、浮尘、晨光（屏幕空间） ————————————————————
function drawLight(g, T, c, o, time, t) {
  const f = o.flat;
  const S = (layer, x, y) => plazaToScreen(c, layer, x, y, f);
  g.save();
  g.globalCompositeOperation = 'screen';
  if (time === 'beam') {
    const k = clamp((T - (o.beamAt ?? BEAM_AT)) / 0.6);
    if (k > 0) {
      const e = outCubic(k);
      const A = S('cloud', ...PLAZA.cloudGap), B = S('main', PLAZA.lightX, PLAZA.lightY);
      const zC = zOf(c, plazaDepth('cloud', f)), zM = zOf(c, plazaDepth('main', f));
      softBeam(g, A, B, 70 * zC, 230 * zM, PAL.goldLight, 0.36 * e, 14, 0.08);
      softBeam(g, A, B, 30 * zC, 110 * zM, PAL.goldLight, 0.22 * e, 14, 0.08);
      // 光柱里的浮尘
      const ax = B[0] - A[0], ay = B[1] - A[1], L = Math.hypot(ax, ay) || 1, px = -ay / L, py = ax / L;
      for (let q = 0; q < 26; q++) {
        const s = 0.15 + fract(hash2(q, 3) + t * (0.01 + hash2(q, 5) * 0.015)) * 0.85;
        const hw = lerp(70 * zC, 230 * zM, s) * 0.8;
        const w = (hash2(q, 7) - 0.5) * 1.6 + Math.sin(t * 0.6 + q) * 0.05;
        const x = A[0] + ax * s + px * w * hw, y = A[1] + ay * s + py * w * hw;
        const tw = 0.5 + 0.5 * Math.sin(t * (1.4 + hash2(q, 9)) + q * 1.9);
        g.fillStyle = rgba(PAL.goldLight, 0.7 * tw * e);
        g.beginPath(); g.arc(x, y, (1.5 + hash2(q, 11) * 2) * zM, 0, TAU); g.fill();
      }
      glow(g, B[0], B[1], 260 * zM, PAL.goldLight, 0.3 * e);
    }
  } else if (time === 'morning') {
    const sun = S('sky', 180, 40);
    rays(g, sun[0], sun[1], 1500, { n: 9, width: 0.06, rot: 0.25 + Math.sin(t * 0.05) * 0.02, color: PAL.goldLight, alpha: 0.13, r0: 60, seed: 12 });
    glow(g, sun[0], sun[1], 600, PAL.goldLight, 0.25);
  }
  g.restore();
}

// ———————————————————— 入口 ————————————————————
/**
 * drawPlaza(g, T, cam, o) —— 城下广场一层。
 * o: { layer:'sky'|'far'|'mid'|'main'|'fg'|'light', time:'gray'|'beam'|'morning', beamAt（默认 22.11）,
 *      notice:'none'|'full'|'corners', noticeOpts（并入 drawNotice 的参数，如 {unroll, pins, squash}）, farKing（idle/holdHead/leanForward/beardFlip/wave，null 不画）, lightCircle 0..1,
 *      shockAt（L08 喊声冲击时刻：彩旗猛甩、木桶翻倒、花瓣吹飞、吊桶晃）, alarm（红灯笼脉冲 + 烽火，默认 gray/beam 开）,
 *      beaconAt:[t4, t5]（4、5 号塔烽火点燃时刻）, flat, t（次级运动秒，默认 T） }
 * 返回 { balcony:[x,y], light:[x,y], board:[x,y,w,h], gate:[x0,y0,x1,y1] }（当前机位下的屏幕坐标）。
 */
export function drawPlaza(g, T, c, o = {}) {
  const layer = o.layer || 'main';
  const time = TIME_NAMES.includes(o.time) ? o.time : 'morning';
  const t = o.t ?? T;
  g.save();
  if (layer === 'sky') drawSky(g, T, c, o, time, null, t);
  else if (layer === 'light') drawLight(g, T, c, o, time, t);
  else {
    applyCam(g, c, plazaDepth(layer, o.flat));
    if (layer === 'far') drawFar(g, T, o, time, t);
    else if (layer === 'mid') drawMid(g, T, o, time, t);
    else if (layer === 'fg') drawFg(g, T, o, time, t);
    else drawMain(g, T, o, time, t, c);
  }
  g.restore();
  const K = PLAZA.castle, [kx, ky] = PLAZA.balconyKing;
  const bal = plazaToScreen(c, 'far', K.x + (kx - K.ref[0]) * K.s, K.y + (ky - 40 - K.ref[1]) * K.s, o.flat);
  const B = PLAZA.board, Gt = PLAZA.gate;
  const b0 = plazaToScreen(c, 'main', B.cx - B.w / 2, B.cy - B.h / 2, o.flat), b1 = plazaToScreen(c, 'main', B.cx + B.w / 2, B.cy + B.h / 2, o.flat);
  const g0 = plazaToScreen(c, 'main', Gt.x0, Gt.y0, o.flat), g1 = plazaToScreen(c, 'main', Gt.x1, Gt.y1, o.flat);
  return { balcony: bal, light: plazaToScreen(c, 'main', PLAZA.lightX, PLAZA.lightY, o.flat), board: [b0[0], b0[1], b1[0] - b0[0], b1[1] - b0[1]], gate: [g0[0], g0[1], g1[0], g1[1]] };
}

/** 推荐的图层参数。sky 直接画在 g 上即可（整屏不透明），light 也直接画在 g 上。 */
export const PLAZA_LAYER = {
  far: { shadow: 6, texture: 0.25 },
  mid: { shadow: 10, texture: 0.3 },
  main: { shadow: 8, texture: 0.3 },
  fg: { shadow: 14, texture: 0.2, blur: 3 },
};

// ———————————————————— 前景城门拱（V04 换景） ————————————————————
/**
 * drawGateArch(g, T, o) —— 前景城门拱（屏幕空间，盖满全高；建议包进 ctx.layer({blur:3, shadow:14})）。
 * o: { x（左墩中线的屏幕 x，默认 960）或 p（0..1 扫过进度：左墩中线从 2300 扫到 −1900）, s（缩放，默认 1）, time, alpha, t }
 * 形状：左墩（宽 440·s，全高实心）+ 半圆拱洞（宽 760·s，拱顶 y≈140）+ 右墩（宽 440·s）。
 * 换景接缝放在左墩里：左墩以左画 PLAZA、以右（含拱洞里）画 JOURNEY——拱洞正好框住城外的新世界。
 * 返回 { seam, left:[x0,x1], opening:[x0,x1], right:[x0,x1] }（屏幕 x）。
 */
export function drawGateArch(g, T, o = {}) {
  const s = o.s ?? 1, t = o.t ?? T;
  const time = TIME_NAMES.includes(o.time) ? o.time : 'morning';
  const P = toneOf(time);
  const x = o.x ?? (o.p !== undefined ? lerp(2300, -1900, clamp(o.p)) : 960);
  const pw = 440 * s, ow = 760 * s;
  const L0 = x - pw / 2, L1 = x + pw / 2, R0 = L1 + ow, R1 = R0 + pw;
  const ret = { seam: x, left: [L0, L1], opening: [L1, R0], right: [R0, R1] };
  if ((o.alpha ?? 1) <= 0 || R1 < -50 || L0 > 1970) return ret;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const ocx = (L1 + R0) / 2, r = ow / 2, spring = 140 * s + r, top = -80, bot = 1180;
  const body = new Path2D();
  body.moveTo(L0, top); body.lineTo(R1, top); body.lineTo(R1, bot); body.lineTo(R0, bot); body.lineTo(R0, spring);
  body.arc(ocx, spring, r, 0, Math.PI, true); body.lineTo(L1, bot); body.lineTo(L0, bot); body.closePath();
  const stone = mixHex(P.stone2, P.stoneDark, 0.3), stoneL = mixHex(P.stone, P.stone2, 0.4);
  cut(g, body, stone);
  g.save(); g.clip(body);
  // 大块方石
  for (let row = 0; row < 14; row++) {
    const y0 = top + row * 92;
    for (let k = -1; k < 14; k++) {
      const bx0 = L0 + k * 150 * s + (row % 2) * 75 * s, bx1 = bx0 + 150 * s;
      const sh_ = hash2(row, k);
      g.fillStyle = sh_ < 0.3 ? mixHex(stone, stoneL, 0.5) : sh_ > 0.8 ? mixHex(stone, P.stoneDark, 0.25) : stone;
      g.fill(pcut(rectPts(bx0 + 5, y0 + 5, bx1 - 5, y0 + 87), row * 31 + k + 5000, 1.6, 40, 0.2));
    }
  }
  // 受光：左上亮、右下暗
  g.fillStyle = lin(g, L0, top, R1, bot, [[0, rgba(PAL.white, 0.12)], [0.5, rgba(PAL.white, 0)], [1, rgba(P.shadow, 0.35)]]);
  g.fillRect(L0 - 10, top - 10, R1 - L0 + 20, bot - top + 20);
  g.restore();
  // 拱券石 + 拱心石金盾 + 拱腹厚度
  const vous = new Path2D();
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI, R2 = r + (i === 6 ? 120 : 92) * s;
    const q = pcut([[ocx + Math.cos(a0) * r, spring + Math.sin(a0) * r], [ocx + Math.cos(a0) * R2, spring + Math.sin(a0) * R2], [ocx + Math.cos(a1) * R2, spring + Math.sin(a1) * R2], [ocx + Math.cos(a1) * r, spring + Math.sin(a1) * r]], 5200 + i, 1.2, 30);
    cut(g, q, i === 6 ? mixHex(stoneL, P.gold, 0.3) : stoneL, { shadow: 4, rim: rgba(PAL.white, 0.4), rimW: 4 });
    vous.addPath(q);
  }
  const kx = ocx, ky = spring - r - 64 * s;
  cut(g, smoothPath([[kx - 34 * s, ky - 34 * s], [kx + 34 * s, ky - 34 * s], [kx + 31 * s, ky + 10 * s], [kx, ky + 40 * s], [kx - 31 * s, ky + 10 * s]], { closed: true, tension: 0.3 }), P.gold, { shadow: 3, rim: P.goldLight, rimW: 3 });
  // 门洞内壁（左墩的右侧立面、拱腹）
  g.fillStyle = mixHex(P.stoneDark, P.ink, 0.25);
  g.fill(pathOfPts([[L1, bot], [L1, spring], [L1 + 60 * s, spring + 30 * s], [L1 + 60 * s, bot]]));
  g.save(); g.beginPath(); g.arc(ocx, spring, r, Math.PI, TAU); g.arc(ocx, spring + 30 * s, r - 60 * s, TAU, Math.PI, true); g.closePath(); g.fillStyle = mixHex(P.stoneDark, P.ink, 0.35); g.fill(); g.restore();
  // 收起的闸门齿
  g.fillStyle = mixHex(P.inkSoft, P.ink, 0.4);
  const ty = spring - r + 26 * s;
  for (let k = 0; k < 13; k++) {
    const tx = ocx - r * 0.66 + (k / 12) * r * 1.32, yy = spring - Math.sqrt(Math.max(0, r * r - (tx - ocx) ** 2)) + 30 * s;
    g.fillRect(tx - 7 * s, yy - 30 * s, 14 * s, 40 * s + (k % 2) * 12 * s);
    g.beginPath(); g.moveTo(tx - 7 * s, yy + 10 * s + (k % 2) * 12 * s); g.lineTo(tx + 7 * s, yy + 10 * s + (k % 2) * 12 * s); g.lineTo(tx, yy + 30 * s + (k % 2) * 12 * s); g.closePath(); g.fill();
  }
  void ty;
  // 左墩上的红底金盾长幡、右墩上的铁灯
  const bx = x, sw = Math.sin(t * 1.4) * 6 * s;
  const ban = pcut([[bx - 70 * s, 180 * s], [bx + 70 * s, 180 * s], [bx + 70 * s + sw, 640 * s], [bx + sw, 590 * s], [bx - 70 * s + sw, 640 * s]], 5300, 1.2, 40);
  cut(g, ban, P.red, { shadow: 6 });
  g.save(); g.clip(ban); g.lineWidth = 26 * s; g.strokeStyle = P.gold; g.stroke(ban); g.lineWidth = 12 * s; g.strokeStyle = P.red; g.stroke(ban);
  g.fillStyle = lin(g, bx - 70 * s, 0, bx + 70 * s, 0, [[0, rgba(PAL.white, 0.12)], [1, rgba(P.redDeep, 0.4)]]); g.fillRect(bx - 80 * s, 170 * s, 170 * s, 480 * s); g.restore();
  cut(g, smoothPath([[bx - 38 * s, 300 * s], [bx + 38 * s, 300 * s], [bx + 35 * s, 352 * s], [bx, 392 * s], [bx - 35 * s, 352 * s]], { closed: true, tension: 0.3 }), P.gold, { shadow: 3, rim: P.goldLight, rimW: 3 });
  cut(g, rr(bx - 92 * s, 166 * s, 184 * s, 18 * s, 9 * s), P.goldDark, { rim: P.gold, rimW: 3 });
  const lx = (R0 + R1) / 2;
  g.strokeStyle = mixHex(P.inkSoft, P.ink, 0.3); g.lineWidth = 8 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(lx - 60 * s, 380 * s); g.lineTo(lx, 380 * s); g.lineTo(lx, 420 * s); g.stroke();
  cut(g, rr(lx - 30 * s, 420 * s, 60 * s, 80 * s, 10 * s), mixHex(P.inkSoft, P.ink, 0.2), { shadow: 3 });
  cut(g, rr(lx - 20 * s, 432 * s, 40 * s, 56 * s, 6 * s), time === 'morning' ? mixHex(P.goldLight, P.fire2, 0.3) : P.fire2);
  // 苔藓
  g.fillStyle = mixHex(P.grass, P.forest, 0.4);
  for (let k = 0; k < 7; k++) { const mx = L0 + hash2(k, 1) * (R1 - L0), my = 980 + hash2(k, 2) * 160; if (mx > L1 && mx < R0) continue; g.fill(blob(mx, my, 40 * s, 14 * s, { seed: 5400 + k, amp: 0.1, n: 20 })); }
  g.restore();
  return ret;
}

export { PAL };
