// 书桌与绘本、片名页（BOOK）。世界 = 屏幕（BK 机位在 cam(960,540,1) 时）。
// 立体件 = CASTLE 布景整套：书内坐标 = (960 + (x−960)·0.5, 800 + (y−880)·0.5)，用同一个 drawCastle，
// 全部立起时与 CASTLE 世界画面逐像素一致（机位经 bookToCastleCam 换算）。
// 约定：纯函数；内部 save/restore；不调 ctx.layer / ctx.mask；只用 PAL；文字走 type.js。
import { PAL, rr, blob, poly, smooth as smoothPath, cut, shade, lin, rad, glow, rays, sparkle } from '../core/paper.js';
import { clamp, lerp, seg, smoothstep, TAU, hash2, noise1, rgba, mixHex, wobble, fract } from '../core/util.js';
import { cam, applyCam, lerpCam } from '../core/camera.js';
import { outBack, outCubic, glide, ez } from '../core/ease.js';
import { field } from '../core/particles.js';
import { font } from '../core/fonts.js';
import { paperGlyph, glyphWidth } from '../ui/type.js';
import { drawCastle, paintSun } from './castle.js';
import { PROJECT } from '../project.js';

const M = mixHex;

// ———————————————————— 布局常量（书内坐标） ————————————————————
export const BOOK = {
  cover: { x0: 960, x1: 1840, y0: 200, y1: 880 },
  spine: { x0: 960, x1: 1000 },
  thick: 12,
  frame: { x0: 1006, x1: 1794, y0: 240, y1: 840, gap: 12 },
  sun: { x: 1400, y: 330, r: 64 },
  title: { x: 1400, y: 500, size: 150, text: PROJECT.title || '纸艺故事' },
  subtitle: { x: 1388, y: 640, size: 48, step: 58, knee: 1660, edge: 1792, text: PROJECT.subtitle || '一段纸上的冒险' },
  bookmark: { x: 1560, y0: 892, y1: 1000, w: 26 },
  spread: { x0: 80, x1: 1840, y0: 200, y1: 880, gutter: 960 },
  /** 印刷画框（两页跨缝的“印”上去的黎明天 + 远山） */
  print: { x0: 116, x1: 1804, y0: 236, y1: 844 },
  /** 天幕卡（立体件背景卡） */
  card: { x0: 300, x1: 1620, y0: 260, y1: 880 },
  lamp: { x: 200, y: 100, r: 900 },
  label: { x0: 1170, x1: 1630, y0: 694, y1: 848, lines: PROJECT.credits || [PROJECT.title || '纸艺故事', '纸艺代码动画'] },
  lizard: { x: 1712, y: 548 },
  /** 立体件映射：书内 = popOrigin + (城堡 − castleOrigin)·popScale */
  popScale: 0.5, popOrigin: [960, 800], castleOrigin: [960, 880],
};

export const CAMS = {
  BK_COVER: cam(1400, 540, 1.04),
  BK_SPREAD: cam(960, 560, 0.96),
  /** 推镜终点（= CASTLE 的 CA-MW） */
  BK_PUSH_END: cam(960, 640, 3.2),
  /** CASTLE 的 CA-W 在书内的等效机位（O07–O08 拉回的起点） */
  BK_CAW: cam(960, 630, 2.0),
};

/** 书内点 → 城堡世界点，及其逆。 */
export const bookToCastle = (x, y) => [960 + (x - 960) * 2, 880 + (y - 800) * 2];
export const castleToBook = (x, y) => [960 + (x - 960) * 0.5, 800 + (y - 880) * 0.5];

// ———————————————————— 机位 ————————————————————
// 推镜路径：参数 k（0 = BK_SPREAD，1 = BK_PUSH_END）。缩放按 k 几何插值（与 lerpCam 相同），
// 高度用一条单调缓出曲线，使路径恰好经过 CASTLE 的 CA-W (960,540,1)——在那一点视差与“压平”完全重合，
// flat 0↔1 的切换就放在那里，看不出接缝；b17 拉回走的也是这条曲线（反向）。
const Z0 = 0.48, Z1 = 1.6;
const K_CAW = Math.log(1 / Z0) / Math.log(Z1 / Z0);
const Y_EXP = Math.log(1 - 140 / 160) / Math.log(1 - K_CAW);
function pushPath(k) {
  const zc = Z0 * Math.pow(Z1 / Z0, k);
  const yc = 400 + 160 * (1 - Math.pow(1 - clamp(k), Y_EXP));
  return cam(960, 800 + (yc - 880) * 0.5, zc * 2);
}
/**
 * 书内推镜曲线：8.20–10.39 BK_SPREAD → BK_PUSH_END（glide），等效于 CASTLE 机位 cam(960,400,0.48) → CA-MW cam(960,560,1.6)，
 * 途中恰好经过 CA-W。O07–O08 反向用同一条曲线的镜像时段：199.30–199.66 从 CA-W 的等效点拉回 BK_SPREAD（glide）。
 * T 在两段之外时夹在端点上（T < 105 归推镜段，T ≥ 105 归拉回段）。
 */
export function bookPushCam(T) {
  if (T < 105) return pushPath(ez(T, 8.2, 10.39, glide));
  return pushPath(K_CAW * (1 - ez(T, 199.3, 199.66, glide)));
}
/**
 * 书内机位 → CASTLE 等效机位：cam(960 + (c.x−960)·2, 880 + (c.y−800)·2, 0.5·c.zoom)。
 * 另带两个字段：flat（城堡缩放 ≤0.93 时 1 = 视差冻结成立体书平面；≥1.07 时 0 = 正常视差，切换落在 CA-W 附近）、
 * strings（挂线可见度，缩放 0.62→0.97 淡出）。drawCastle 会读 cam.flat / cam.strings，所以 b01 与 b02 用同一个换算就能逐像素一致。
 */
export function bookToCastleCam(c) {
  const z = 0.5 * c.zoom;
  const out = cam(960 + (c.x - 960) * 2, 880 + (c.y - 800) * 2, z, c.rot || 0);
  out.flat = 1 - smoothstep(0.93, 1.07, z);
  out.strings = 1 - smoothstep(0.62, 0.97, z);
  return out;
}
/** CASTLE 机位 → 书内等效机位。 */
export function castleToBookCam(c) {
  return cam(960 + (c.x - 960) * 0.5, 800 + (c.y - 880) * 0.5, c.zoom * 2, c.rot || 0);
}
/** 便捷：推镜 / 拉回时刻的 CASTLE 等效机位（含 flat / strings）。 */
export const bookCastleCam = (T) => bookToCastleCam(bookPushCam(T));

const rectOn = (c, R) => {
  const z = c.zoom;
  const x = (R.x0 - c.x) * z + 960, y = (R.y0 - c.y) * z + 540;
  return { x, y, w: (R.x1 - R.x0) * z, h: (R.y1 - R.y0) * z };
};
/** 天幕卡（书内 x 300–1620、y 260–880）在当前书内机位下的屏幕矩形 {x,y,w,h}（b02 交接遮罩用）。 */
export function bookPageRect(T, c = bookPushCam(T)) { return rectOn(c, BOOK.card); }
/** 整个跨页（x 80–1840、y 200–880）的屏幕矩形。 */
export function bookSpreadRect(T, c = bookPushCam(T)) { return rectOn(c, BOOK.spread); }
/**
 * 天幕卡是否已盖满整屏（b01 推镜约 9.45 起为 true；b17 拉回段 199.30 起卡片下沿已在屏内，始终为 false）。
 * 为 true 时书桌、书体、书签都在画外，镜头可以省掉这几层（交接期两块合计缓冲 ≤ 8）；立体件照画。
 */
export function bookCardCovers(T, c = bookPushCam(T)) {
  const r = bookPageRect(T, c);
  return r.x <= 0 && r.y <= 0 && r.x + r.w >= 1920 && r.y + r.h >= 1080;
}

// ———————————————————— 立起时刻表 ————————————————————
/**
 * b01 的默认立起进度（storyboard b01）：返回 drawCastle 的 popup 对象（线性进度 0..1，内部再套 outBack）。
 * 5.00 天幕卡 → 5.20 城丘 → 5.45 城墙 → 5.70–6.36 13 塔 → 6.50 主堡 → 6.80 屋顶 → 7.00 花丛 → 7.20 太阳 → 7.50 纸鸟 → 7.70 云 → 7.90 公主。
 */
export function bookPopupAt(T) {
  return {
    card: seg(T, 5.0, 5.3),
    hill: seg(T, 5.2, 5.55),
    wall: seg(T, 5.45, 5.8),
    towers: Array.from({ length: 13 }, (_, i) => seg(T, 5.7 + 0.055 * i, 6.02 + 0.055 * i)),
    keep: seg(T, 6.5, 6.88),
    roofs: seg(T, 6.8, 7.12),
    flowers: seg(T, 7.0, 7.3),
    sun: seg(T, 7.2, 7.85),
    birds: seg(T, 7.5, 7.9),
    clouds: seg(T, 7.7, 8.1),
    princess: seg(T, 7.9, 8.2),
  };
}
// 折倒顺序（开场的反序）
const FOLD_ORDER = ['princess', 'clouds', 'birds', 'sun', 'flowers', 'roofs', 'keep', 'towers', 'wall', 'hill', 'card'];
function applyFold(P, p) {
  if (!(p > 0)) return P;
  const out = { ...P, towers: [...P.towers] };
  FOLD_ORDER.forEach((k, j) => {
    const kk = 1 - clamp((p - j * 0.075) / 0.25);
    if (k === 'towers') for (let i = 0; i < 13; i++) out.towers[i] = Math.min(out.towers[i], 1 - clamp((p - j * 0.075 - (12 - i) * 0.004) / 0.25));
    else out[k] = Math.min(out[k], kk);
  });
  return out;
}
function popupObj(p) {
  const P = { card: 1, hill: 1, wall: 1, towers: Array(13).fill(1), keep: 1, roofs: 1, flowers: 1, sun: 1, birds: 1, clouds: 1, princess: 1 };
  if (p === undefined || p === null) return P;
  if (typeof p === 'number') { for (const k of Object.keys(P)) if (k !== 'towers') P[k] = p; P.towers = Array(13).fill(p); return P; }
  if (Array.isArray(p)) {
    const v = (i) => (p[i] === undefined ? 1 : p[i]);
    return { card: v(0), hill: v(1), wall: v(2), towers: Array.from({ length: 13 }, (_, i) => v(3 + i)), keep: v(16), roofs: v(17), flowers: v(18), sun: v(19), birds: v(20), clouds: v(21), princess: v(22) };
  }
  const o = { ...P, ...p };
  o.towers = p.towers === undefined ? P.towers : Array.isArray(p.towers) ? Array.from({ length: 13 }, (_, i) => p.towers[i] ?? 1) : Array(13).fill(p.towers);
  return o;
}

// ════════════════════════════════ 书桌 ════════════════════════════════
/**
 * drawDesk(g, T, cam, o)：o.layer 'desk'（默认：木桌 + 台灯光斑）| 'dust'（光里浮尘，放前景层）
 * o.lamp 0..1（0 关灯；光斑半径 600→900、强度随之）
 */
export function drawDesk(g, T, c, o = {}) {
  const lamp = clamp(o.lamp ?? 1);
  g.save();
  applyCam(g, c, 1);
  if ((o.layer || 'desk') === 'dust') {
    if (lamp > 0) {
      const L = BOOK.lamp;
      field(g, T, { seed: 77, count: o.count ?? 40, x: -200, y: -200, w: 1500, h: 1200, vx: 6, vy: -10, sway: 26, swayFreq: 0.18, size: [1.6, 4] }, (g2, x, y, s) => {
        const d = Math.hypot(x - L.x, y - L.y) / (lerp(600, 900, lamp));
        const a = clamp(1 - d) * lamp * (0.5 + 0.5 * Math.sin(T * 1.3 + s.i * 1.7));
        if (a <= 0.02) return;
        g2.globalAlpha = a * 0.9;
        g2.fillStyle = s.i % 3 ? PAL.goldLight : PAL.white;
        g2.beginPath(); g2.arc(x, y, s.size, 0, TAU); g2.fill();
        g2.globalAlpha = 1;
      });
    }
    g.restore();
    return;
  }
  g.fillStyle = PAL.woodDark;
  g.fillRect(-1200, -900, 4400, 3000);
  // 木板与木纹
  g.save();
  for (let k = -6; k < 12; k++) {
    const y0 = -900 + k * 190;
    g.fillStyle = rgba(k % 2 ? PAL.wood : PAL.woodDark, k % 2 ? 0.16 : 0.08);
    g.fillRect(-1200, y0, 4400, 190);
    g.strokeStyle = rgba(PAL.shadow, 0.45);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(-1200, y0); g.lineTo(3200, y0 + 6); g.stroke();
    g.strokeStyle = rgba(PAL.wood, 0.28);
    g.lineWidth = 2;
    for (let j = 0; j < 5; j++) {
      const yy = y0 + 24 + j * 34 + hash2(k, j) * 10;
      g.beginPath();
      for (let x = -1200; x <= 3200; x += 80) {
        const y = yy + Math.sin(x * 0.004 + k * 1.7 + j) * 7 + noise1(x * 0.01, k * 9 + j) * 4;
        if (x === -1200) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // 木节
    const kx = -600 + hash2(k, 99) * 3200;
    g.fillStyle = rgba(PAL.shadow, 0.3);
    g.fill(blob(kx, y0 + 95, 26, 11, { seed: 300 + k, amp: 0.1 }));
    g.strokeStyle = rgba(PAL.wood, 0.3);
    g.lineWidth = 2;
    g.stroke(blob(kx, y0 + 95, 40, 18, { seed: 320 + k, amp: 0.08 }));
  }
  g.restore();
  // 台灯光斑
  if (lamp > 0) {
    const L = BOOK.lamp, r = lerp(600, L.r, lamp);
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= 0.35 * lamp;
    g.fillStyle = rad(g, L.x, L.y, 0, r * 1.25, [[0, PAL.goldLight], [0.45, rgba(PAL.goldLight, 0.55)], [1, rgba(PAL.goldLight, 0)]]);
    g.fillRect(L.x - r * 1.3, L.y - r * 1.3, r * 2.6, r * 2.6);
    g.restore();
    glow(g, L.x, L.y, r * 0.55, PAL.goldLight, 0.22 * lamp);
  }
  g.restore();
}

// ════════════════════════════════ 绘本 ════════════════════════════════
/**
 * drawBook(g, T, cam, o)
 * o.layer: 'book'（默认：书体、书页、封面）| 'popup'（立体件，o.pop 选 CASTLE 层）| 'bookmark'（书签 / 卷轴尾）| 'all'
 * o.open 0..1（θ = open·180°）；o.cover {foilSweep, star, subtitle, tremble, gleam}；o.bookmark {wobbleAt, extra:'scroll', roll}
 * o.popup / o.fold / o.castle（传给 drawCastle 的时段等选项）；o.label；o.lizard；o.lamp
 * 返回 { titleCenters, sun, cover, bookmarkTip }（书内坐标）。
 */
export function drawBook(g, T, c, o = {}) {
  const layer = o.layer || 'book';
  const open = clamp(o.open ?? 0);
  const th = open * Math.PI;
  const cv = o.cover || {};
  const st = { T, c, o, open, th, cv, lamp: clamp(o.lamp ?? 1) };
  g.save();
  const base = g.getTransform();
  st.base = base;
  applyCam(g, c, 1);
  // 发抖：整本书绕中心微转
  const trem = clamp(cv.tremble ?? 0);
  if (trem > 0) {
    const cx = open > 0.5 ? 960 : 1400;
    g.translate(cx, 540);
    g.rotate(((1.5 * Math.PI) / 180) * trem * Math.sin(T * TAU * 9.5));
    g.translate(-cx, -540);
  }
  st.bookT = g.getTransform();
  let info = {};
  try {
    if (layer === 'book' || layer === 'all') info = drawBookBody(g, st);
    if (layer === 'popup' || layer === 'all') drawPopup(g, st);
    if (layer === 'bookmark' || layer === 'all') drawBookmark(g, st);
  } finally {
    g.restore();
  }
  return info;
}

function drawBookBody(g, st) {
  const { th, open } = st;
  const C = BOOK.cover;
  // 底板（后封皮）+ 书页厚度
  const back = rr(C.x0 + 2, C.y0 + 4, C.x1 - C.x0 + 14, C.y1 - C.y0 + 14, [4, 12, 12, 4]);
  cut(g, back, M(PAL.redDeep, PAL.ink, 0.25));
  const block = rr(C.x0, C.y0 + 2, C.x1 - C.x0 + 12, C.y1 - C.y0 + 10, [2, 6, 6, 2]);
  cut(g, block, PAL.paper2);
  g.save();
  g.clip(block);
  g.strokeStyle = rgba(PAL.kraftDark, 0.5);
  g.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    g.beginPath(); g.moveTo(C.x1 + 2 + k * 2, C.y0 + 6); g.lineTo(C.x1 + 2 + k * 2, C.y1 + 8); g.stroke();
    g.beginPath(); g.moveTo(C.x0 + 4, C.y1 + 2 + k * 2); g.lineTo(C.x1 + 8, C.y1 + 2 + k * 2); g.stroke();
  }
  g.restore();
  let info = {};
  if (open <= 0.0005) {
    info = coverFace(g, st, 1);
  } else {
    // 右页（第一页）
    drawPage(g, st, 'right');
    // 封面翻起投在右页上的影子
    const sh = Math.sin(th);
    if (sh > 0.01) {
      const w = 60 + 380 * sh * (th < Math.PI / 2 ? Math.cos(th) * 0.6 + 0.4 : 0.6);
      g.save();
      g.beginPath(); g.rect(960, C.y0, C.x1 - 960, C.y1 - C.y0); g.clip();
      g.fillStyle = lin(g, 960, 0, 960 + w, 0, [[0, rgba(PAL.shadow, 0.42 * sh)], [1, rgba(PAL.shadow, 0)]]);
      g.fillRect(960, C.y0, w, C.y1 - C.y0);
      g.restore();
    }
    if (th < Math.PI / 2) {
      // 外皮：以书脊为铰链压缩
      const k = Math.cos(th);
      g.save();
      g.translate(960, 0); g.scale(Math.max(k, 0.002), 1); g.translate(-960, 0);
      info = coverFace(g, st, 1);
      g.fillStyle = rgba(PAL.ink, 0.5 * Math.sin(th));
      g.fill(rr(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0, [4, 14, 14, 4]));
      g.restore();
    } else {
      // 内侧：牛皮纸衬页（= 左页）
      const k = -Math.cos(th);
      g.save();
      g.translate(960, 0); g.scale(Math.max(k, 0.002), 1); g.translate(-960, 0);
      drawPage(g, st, 'left');
      if (th < Math.PI * 0.999) {
        g.fillStyle = rgba(PAL.ink, 0.42 * Math.sin(th));
        g.fill(rr(BOOK.spread.x0, C.y0, 880, C.y1 - C.y0, [14, 4, 4, 14]));
      }
      g.restore();
    }
    // 书缝
    if (th > Math.PI / 2) {
      g.save();
      g.fillStyle = lin(g, 920, 0, 1000, 0, [[0, rgba(PAL.shadow, 0)], [0.5, rgba(PAL.shadow, 0.34)], [1, rgba(PAL.shadow, 0)]]);
      g.fillRect(920, C.y0, 80, C.y1 - C.y0);
      g.strokeStyle = rgba(PAL.shadow, 0.5);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(960, C.y0 + 2); g.lineTo(960, C.y1 - 2); g.stroke();
      g.restore();
    }
  }
  return info;
}

// —— 封面外皮 ——
function coverFace(g, st, a) {
  const { T, cv, lamp } = st;
  const C = BOOK.cover;
  const face = rr(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0, [4, 14, 14, 4]);
  cut(g, face, lin(g, C.x0, C.y0, C.x1, C.y1, [M(PAL.redDeep, PAL.red, 0.2), PAL.redDeep, M(PAL.redDeep, PAL.ink, 0.15)]), { rim: rgba(M(PAL.red, PAL.goldLight, 0.3), 0.8), rimW: 3 });
  // 皮纹颗粒
  g.save();
  g.clip(face);
  for (let i = 0; i < 260; i++) {
    const x = C.x0 + hash2(i, 401) * (C.x1 - C.x0), y = C.y0 + hash2(i, 402) * (C.y1 - C.y0);
    g.fillStyle = hash2(i, 403) < 0.5 ? rgba(PAL.ink, 0.12) : rgba(PAL.red, 0.12);
    g.beginPath(); g.ellipse(x, y, 1.5 + hash2(i, 404) * 2.5, 1 + hash2(i, 405) * 1.5, hash2(i, 406) * 3, 0, TAU); g.fill();
  }
  // 台灯反光
  if (lamp > 0) {
    g.globalCompositeOperation = 'screen';
    g.fillStyle = rad(g, 1080, 260, 0, 640, [[0, rgba(PAL.goldLight, 0.16 * lamp)], [1, rgba(PAL.goldLight, 0)]]);
    g.fillRect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  shade(g, face, PAL.ink, C.x1, C.y1, C.x1 - 260, C.y1 - 260, 0.3, 0);
  // 书脊带
  const spine = rr(C.x0, C.y0, BOOK.spine.x1 - C.x0, C.y1 - C.y0, [4, 0, 0, 4]);
  cut(g, spine, M(PAL.redDark, PAL.redDeep, 0.35));
  shade(g, spine, PAL.ink, BOOK.spine.x1, 0, C.x0, 0, 0.35, 0);
  g.strokeStyle = rgba(PAL.shadow, 0.55);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(BOOK.spine.x1 + 1, C.y0 + 4); g.lineTo(BOOK.spine.x1 + 1, C.y1 - 4); g.stroke();
  for (const y of [258, 540, 822]) {
    goldLine(g, [[C.x0 + 6, y], [BOOK.spine.x1 - 6, y]], 2.6);
    goldLine(g, [[C.x0 + 6, y + 8], [BOOK.spine.x1 - 6, y + 8]], 1.6);
  }
  // 双线框 + 四角卷草
  const F = BOOK.frame;
  goldRect(g, F.x0, F.y0, F.x1, F.y1, 4);
  goldRect(g, F.x0 + F.gap, F.y0 + F.gap, F.x1 - F.gap, F.y1 - F.gap, 2);
  for (const [x, y, sx, sy] of [[F.x0 + F.gap, F.y0 + F.gap, 1, 1], [F.x1 - F.gap, F.y0 + F.gap, -1, 1], [F.x0 + F.gap, F.y1 - F.gap, 1, -1], [F.x1 - F.gap, F.y1 - F.gap, -1, -1]]) scrollCorner(g, x, y, sx, sy, 1);
  // 太阳徽章（= 立体书太阳的形状）
  const S = BOOK.sun;
  g.save();
  g.strokeStyle = PAL.goldDark;
  g.lineWidth = 3;
  g.beginPath(); g.arc(S.x, S.y, S.r * 1.62, 0, TAU); g.stroke();
  g.strokeStyle = rgba(PAL.goldLight, 0.6);
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(S.x, S.y, S.r * 1.62 - 3, 0, TAU); g.stroke();
  g.restore();
  paintSun(g, { T }, 'sun', S.x, S.y, S.r, a, 0, 0.12 * lamp);
  // 标题
  const titleCenters = coverTitle(g, st);
  // 副标题（逐字写，挤到金框边被压扁）
  if ((cv.subtitle ?? 0) > 0 && (cv.subtitleAlpha ?? 1) > 0) {
    g.save();
    g.globalAlpha *= clamp(cv.subtitleAlpha ?? 1);
    coverSubtitle(g, st, cv.subtitle);
    g.restore();
  }
  // 署名贴签、小蜥蜴
  if (st.o.label) drawLabel(g, st, st.o.label);
  if (st.o.lizard) drawLizardOn(g, st, st.o.lizard);
  return { titleCenters, sun: [S.x, S.y, S.r], cover: { ...C }, bookmarkTip: [BOOK.bookmark.x, BOOK.bookmark.y1] };
}

function goldLine(g, pts, w) {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = PAL.goldDark;
  g.lineWidth = w + 1.2;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + 0.8, y + 0.8) : g.moveTo(x + 0.8, y + 0.8))); g.stroke();
  g.strokeStyle = PAL.gold;
  g.lineWidth = w;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();
}
function goldRect(g, x0, y0, x1, y1, w) {
  g.save();
  g.lineJoin = 'round';
  g.strokeStyle = PAL.goldDark;
  g.lineWidth = w + 1.4;
  g.strokeRect(x0 + 1, y0 + 1, x1 - x0, y1 - y0);
  g.strokeStyle = PAL.gold;
  g.lineWidth = w;
  g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = rgba(PAL.goldLight, 0.7);
  g.lineWidth = Math.max(1, w * 0.35);
  g.strokeRect(x0 - w * 0.2, y0 - w * 0.2, x1 - x0, y1 - y0);
  g.restore();
}

/** 卷草角饰：角在 (x,y)，向 (sx,sy) 方向展开；s 缩放。 */
export function scrollCorner(g, x, y, sx, sy, s = 1, col = PAL.gold) {
  g.save();
  g.translate(x, y);
  g.scale(sx * s, sy * s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const spiral = (cx, cy, r0, turns, dir) => {
    const pts = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const a = dir * u * turns * TAU;
      const r = r0 * (1 - u * 0.78);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  };
  const strokes = [
    [[4, 4], [30, 10], [62, 8], [92, 16], [112, 12]],
    [[4, 4], [10, 30], [8, 62], [16, 92], [12, 112]],
  ];
  const draw = (w, c, dx = 0) => {
    g.strokeStyle = c;
    g.lineWidth = w;
    for (const p of strokes) g.stroke(smoothPath(p.map(([a, b]) => [a + dx, b + dx]), { closed: false }));
    g.stroke(smoothPath(spiral(30 + dx, 30 + dx, 20, 1.15, 1).map(([a, b]) => [a, b]), { closed: false }));
    g.stroke(smoothPath(spiral(112 + dx, 26 + dx, 11, 1.1, -1), { closed: false }));
    g.stroke(smoothPath(spiral(26 + dx, 112 + dx, 11, 1.1, 1), { closed: false }));
  };
  draw(5, PAL.goldDark, 1);
  draw(3.4, col);
  // 叶片
  for (const [lx, ly, ang] of [[56, 22, -0.5], [22, 56, 2.07], [84, 24, 0.4], [24, 84, 1.17], [44, 44, 0.78]]) {
    g.save();
    g.translate(lx, ly); g.rotate(ang);
    const leaf = smoothPath([[0, 0], [8, -5], [16, 0], [8, 5]], { closed: true, tension: 0.6 });
    g.fillStyle = PAL.goldDark; g.save(); g.translate(1, 1); g.fill(leaf); g.restore();
    g.fillStyle = col; g.fill(leaf);
    g.restore();
  }
  g.fillStyle = col;
  g.beginPath(); g.arc(4, 4, 5, 0, TAU); g.fill();
  g.restore();
}

function coverTitle(g, st) {
  const { cv } = st;
  const Tt = BOOK.title;
  const chars = [...Tt.text];
  const adv = glyphWidth(g, chars[0], Tt.size, 'display');
  const centers = chars.map((_, k) => [Tt.x + (k - (chars.length - 1) / 2) * adv, Tt.y]);
  const grad = lin(g, 0, Tt.y - Tt.size * 0.45, 0, Tt.y + Tt.size * 0.45, [PAL.gold, M(PAL.gold, PAL.goldLight, 0.5), PAL.goldLight]);
  for (const [k, ch] of chars.entries()) {
    const [x, y] = centers[k];
    // 压印的暗槽
    paperGlyph(g, ch, x + 2.5, y + 3.5, Tt.size, { fill: rgba(PAL.shadow, 0.55), edge: null });
    paperGlyph(g, ch, x, y, Tt.size, { fill: grad, edge: PAL.goldDark, edgeW: 0.035 });
    paperGlyph(g, ch, x - 1, y - 1.6, Tt.size, { fill: rgba(PAL.goldLight, 0.35), edge: null, scale: 0.985 });
  }
  // 金箔扫光（只落在字形里：用渐变再填一次字）
  const fs = cv.foilSweep ?? 0;
  if (fs > 0 && fs < 1) {
    const bx = lerp(Tt.x - 420, Tt.x + 420, fs);
    const band = lin(g, bx - 120, Tt.y - 120, bx + 120, Tt.y + 120, [[0, rgba(PAL.white, 0)], [0.42, rgba(PAL.white, 0)], [0.5, rgba(PAL.white, 0.95)], [0.58, rgba(PAL.white, 0)], [1, rgba(PAL.white, 0)]]);
    g.save();
    g.globalCompositeOperation = 'screen';
    for (const [k, ch] of chars.entries()) paperGlyph(g, ch, centers[k][0], centers[k][1], Tt.size, { fill: band, edge: null });
    g.restore();
  }
  if (cv.gleam) {
    g.save();
    g.globalCompositeOperation = 'screen';
    for (const [k, ch] of chars.entries()) paperGlyph(g, ch, centers[k][0], centers[k][1], Tt.size, { fill: rgba(PAL.goldLight, 0.35 * clamp(cv.gleam)), edge: null });
    g.restore();
  }
  // 「吧」右上的四角星
  const s = cv.star ?? 0;
  if (s > 0) {
    const [x, y] = centers[3];
    const k = s < 1 ? outBack(s, 2.4) : 1;
    const fade = 1 - smoothstep(0.7, 1, s);
    const sx = x + adv * 0.5, sy = y - Tt.size * 0.48;
    glow(g, sx, sy, 60 * k, PAL.goldLight, 0.6 * fade);
    sparkle(g, sx, sy, 34 * k, { color: PAL.white, alpha: Math.max(fade, 0.001), rot: s * 0.6, thin: 0.18 });
  }
  return centers;
}

function coverSubtitle(g, st, p) {
  const S = BOOK.subtitle;
  const chars = [...S.text];
  const n = clamp(p) * chars.length;
  const W = S.edge - S.knee;
  const adv = 0.765 * S.size;
  for (let k = 0; k < chars.length; k++) {
    const a = clamp(n - k);
    if (a <= 0) break;
    const nat = S.x + k * S.step;
    let x = nat, sq = 1;
    if (nat > S.knee) {
      const d = nat - S.knee;
      x = S.knee + W * (1 - Math.exp(-d / W));
      sq = Math.exp(-d / W);
    }
    const pop = a < 1 ? outBack(a, 2) : 1;
    const shiver = sq < 0.9 ? Math.sin(st.T * 37 + k) * 1.2 * (1 - sq) : 0;
    paperGlyph(g, chars[k], x + 1.5, S.y + 2, S.size, { fill: rgba(PAL.shadow, 0.5), edge: null, squashX: sq, scale: pop });
    paperGlyph(g, chars[k], x + shiver, S.y, S.size, { fill: PAL.gold, edge: PAL.goldDark, edgeW: 0.04, squashX: sq, scale: pop, alpha: Math.min(1, a * 2) });
    void adv;
  }
}

// —— 片尾署名贴签 ——
function drawLabel(g, st, lab) {
  const L = BOOK.label;
  const p = typeof lab === 'number' ? lab : clamp(lab.p ?? 1);
  const lines = typeof lab === 'number' ? [1, 1, 1, 1] : lab.lines || [1, 1, 1, 1];
  if (p <= 0) return;
  const dy = (1 - outBack(clamp(p), 1.4)) * 320;
  g.save();
  g.translate(0, dy);
  g.translate((L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2);
  g.rotate(-0.012);
  g.translate(-(L.x0 + L.x1) / 2, -(L.y0 + L.y1) / 2);
  const card = poly([[L.x0, L.y0], [L.x1, L.y0], [L.x1, L.y1], [L.x0, L.y1]], { seed: 501, amp: 1.2, step: 30 });
  g.save(); g.translate(5, 7); g.fillStyle = rgba(PAL.shadow, 0.4); g.fill(card); g.restore();
  cut(g, card, PAL.paper, { rim: PAL.white, rimW: 2.4 });
  g.save();
  g.strokeStyle = PAL.ink; g.lineWidth = 3; g.lineJoin = 'round';
  g.stroke(card);
  g.setLineDash([9, 7]);
  g.strokeStyle = PAL.kraftDark; g.lineWidth = 2;
  g.strokeRect(L.x0 + 11, L.y0 + 11, L.x1 - L.x0 - 22, L.y1 - L.y0 - 22);
  g.setLineDash([]);
  g.restore();
  // 缝线角（金色小三角）
  for (const [x, y, sx, sy] of [[L.x0, L.y0, 1, 1], [L.x1, L.y0, -1, 1], [L.x0, L.y1, 1, -1], [L.x1, L.y1, -1, -1]]) {
    const tri = new Path2D();
    tri.moveTo(x, y); tri.lineTo(x + sx * 26, y); tri.lineTo(x, y + sy * 26); tri.closePath();
    cut(g, tri, PAL.gold, { rim: PAL.goldLight, rimW: 1.4 });
  }
  const sizes = [34, 28, 28, 28];
  const ys = [L.y0 + 36, L.y0 + 70, L.y0 + 101, L.y0 + 132];
  const cx = (L.x0 + L.x1) / 2;
  BOOK.label.lines.forEach((text, i) => {
    const q = clamp(lines[i] ?? 0);
    if (q <= 0) return;
    const arr = [...text];
    const ws = arr.map((ch) => glyphWidth(g, ch, sizes[i], 'serif'));
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = cx - tot / 2;
    const shown = q * arr.length;
    arr.forEach((ch, j) => {
      const a = clamp(shown - j);
      if (a > 0) paperGlyph(g, ch, x + ws[j] / 2, ys[i], sizes[i], { family: 'serif', fill: PAL.ink, edge: null, alpha: a, scale: 0.9 + 0.1 * a });
      x += ws[j];
    });
  });
  g.restore();
}

// —— 小蜥蜴（占位：dragon 组的 drawLizard 就绪后可用 o.lizardFn 替换） ——
function drawLizardOn(g, st, lz) {
  const o = typeof lz === 'object' ? lz : {};
  const x = o.x ?? BOOK.lizard.x, y = o.y ?? BOOK.lizard.y;
  if (st.o.lizardFn) { g.save(); st.o.lizardFn(g, { x, y, s: o.s ?? 1, face: o.face ?? -1, sleep: o.pose !== 'crawl', eye: o.eye ?? 0, t: st.T }); g.restore(); return; }
  drawSleepyLizard(g, st.T, { ...o, x, y });
}
/** 睡着 / 爬行的小蜥蜴（长约 60）。o: {x, y, s, face, pose:'sleep'|'crawl', eye 0..1（睁开一只发光眼）, zzz 0..1} */
export function drawSleepyLizard(g, T, o = {}) {
  const { x = 0, y = 0, s = 1, face = -1, pose = 'sleep', eye = 0, zzz = 1 } = o;
  g.save();
  g.translate(x, y);
  g.scale(face * s, s);
  const breathe = 1 + 0.04 * Math.sin(T * 2.2);
  if (pose === 'sleep') {
    // 尾巴绕一圈
    const tail = [];
    for (let i = 0; i <= 18; i++) { const u = i / 18, a = -0.4 + u * 3.6; tail.push([8 + Math.cos(a) * (20 - u * 4), 4 + Math.sin(a) * (11 - u * 2)]); }
    g.lineCap = 'round';
    g.strokeStyle = PAL.dragonDark; g.lineWidth = 7;
    g.stroke(smoothPath(tail, { closed: false }));
    g.strokeStyle = PAL.dragon; g.lineWidth = 5;
    g.stroke(smoothPath(tail, { closed: false }));
    const tip = tail[tail.length - 1];
    g.fillStyle = PAL.ink;
    g.beginPath(); g.moveTo(tip[0] - 4, tip[1]); g.quadraticCurveTo(tip[0], tip[1] - 7, tip[0] + 4, tip[1]); g.lineTo(tip[0], tip[1] + 5); g.closePath(); g.fill();
    const body = blob(4, 0, 18 * breathe, 11 * breathe, { seed: 701, amp: 0.04 });
    cut(g, body, PAL.dragon, { rim: PAL.dragonWing, rimW: 2 });
    cut(g, blob(5, 4, 12, 5, { seed: 702, amp: 0.04 }), PAL.dragonBelly);
    // 背刺
    g.fillStyle = PAL.dragonDark;
    for (let k = 0; k < 4; k++) { const bx = -8 + k * 7; g.beginPath(); g.moveTo(bx - 3, -9); g.lineTo(bx, -15); g.lineTo(bx + 3, -9); g.fill(); }
    // 头
    const head = blob(-16, 2, 12, 9, { seed: 703, amp: 0.04 });
    cut(g, head, PAL.dragon, { rim: PAL.dragonWing, rimW: 2 });
    g.strokeStyle = PAL.ink; g.lineWidth = 1.6; g.lineCap = 'round';
    if (eye > 0.05) {
      glow(g, -19, 0, 10, PAL.dragonEye, 0.7 * eye);
      g.fillStyle = PAL.dragonEye;
      g.beginPath(); g.ellipse(-19, 0, 2.6, 2.6 * eye, 0, 0, TAU); g.fill();
      g.fillStyle = PAL.ink;
      g.beginPath(); g.ellipse(-19, 0, 0.8, 2.2 * eye, 0, 0, TAU); g.fill();
    } else { g.beginPath(); g.arc(-19, -0.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    g.fillStyle = rgba(PAL.blush, 0.45);
    g.beginPath(); g.ellipse(-14, 4, 3, 1.8, 0, 0, TAU); g.fill();
    // 头顶迷你名字牌（字太小，画带点纹的纸带）
    g.save();
    g.translate(-16, -9);
    g.rotate(-0.15);
    cut(g, rr(-10, -6, 20, 7, 2), PAL.paper, { rim: PAL.white, rimW: 1 });
    g.fillStyle = PAL.inkSoft;
    for (let k = 0; k < 4; k++) g.fillRect(-7 + k * 4.2, -3.5, 2.4, 2.2);
    g.restore();
    // zzz（字母不镜像）
    if (zzz > 0) {
      g.scale(face, 1);
      for (let k = 0; k < 3; k++) {
        const ph = fract(T * 0.45 + k / 3);
        const a = Math.sin(ph * Math.PI) * clamp(zzz);
        if (a <= 0.02) continue;
        paperGlyph(g, 'z', face * -6 + face * -(ph * 14) - 10 * face, -16 - ph * 30, 9 + ph * 7, { family: 'latin', fill: PAL.goldLight, edge: PAL.ink, edgeW: 0.12, alpha: a, rot: -0.2 });
      }
    }
  } else {
    const step = Math.sin(T * 12);
    const body = blob(0, 0, 20, 8, { seed: 704, amp: 0.04 });
    g.strokeStyle = PAL.dragonDark; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(18, 0); g.quadraticCurveTo(30, -2 + step * 3, 40, 4); g.stroke();
    for (const [lx, ph] of [[-10, 0], [10, Math.PI]]) {
      g.beginPath(); g.moveTo(lx, 4); g.lineTo(lx + Math.sin(T * 12 + ph) * 4, 11); g.stroke();
    }
    cut(g, body, PAL.dragon, { rim: PAL.dragonWing, rimW: 2 });
    cut(g, blob(-22, -2, 10, 7.5, { seed: 705, amp: 0.04 }), PAL.dragon, { rim: PAL.dragonWing, rimW: 2 });
    g.fillStyle = PAL.ink;
    g.beginPath(); g.ellipse(-25, -3, 1.4, 2, 0, 0, TAU); g.fill();
  }
  g.restore();
}

// —— 书页（右页 = 第一页；左页 = 封面内侧衬页），两页跨缝印着黎明天与远山 ——
function drawPage(g, st, side) {
  const S = BOOK.spread, C = BOOK.cover;
  const x0 = side === 'left' ? S.x0 : 960, x1 = side === 'left' ? 960 : S.x1;
  if (side === 'left') {
    // 封面板（翻边一圈皮）
    cut(g, rr(S.x0 - 2, C.y0 - 2, 964 - S.x0, C.y1 - C.y0 + 4, [14, 2, 2, 14]), M(PAL.redDeep, PAL.ink, 0.1));
  }
  const pad = side === 'left' ? [10, 10, 0, 10] : [0, 0, 0, 0];
  const page = rr(x0 + pad[3], C.y0 + pad[0], x1 - x0 - pad[3] - pad[1], C.y1 - C.y0 - pad[0] - pad[2] - (side === 'left' ? 10 : 0), side === 'left' ? [8, 0, 0, 8] : [0, 6, 6, 0]);
  cut(g, page, PAL.kraft, { rim: rgba(PAL.paper, 0.7), rimW: 2 });
  g.save();
  g.clip(page);
  // 牛皮纸纤维
  for (let i = 0; i < 120; i++) {
    const x = x0 + hash2(i, side === 'left' ? 511 : 512) * (x1 - x0), y = C.y0 + hash2(i, 513) * (C.y1 - C.y0);
    g.strokeStyle = rgba(i % 2 ? PAL.kraftDark : PAL.paper, 0.25);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + hash2(i, 514) * 14, y + (hash2(i, 515) - 0.5) * 6); g.stroke();
  }
  // 印刷画框
  const P = BOOK.print;
  g.save();
  g.beginPath(); g.rect(Math.max(P.x0, x0), P.y0, Math.min(P.x1, x1) - Math.max(P.x0, x0), P.y1 - P.y0); g.clip();
  g.translate(960, 800); g.scale(0.5, 0.5); g.translate(-960, -880);
  const castleO = st.o.castle || {};
  const pc = cam(960, 540, 1);
  pc.flat = 1;
  for (const layer of ['sky', 'far']) drawCastle(g, st.T, pc, { ...castleO, layer, popup: undefined, flat: 1, strings: 0, birds: false, clouds: false, sun: false, tear: undefined, split: undefined });
  g.restore();
  // “印刷”感：压一层纸色 + 网点
  g.save();
  g.beginPath(); g.rect(Math.max(P.x0, x0), P.y0, Math.min(P.x1, x1) - Math.max(P.x0, x0), P.y1 - P.y0); g.clip();
  // 印刷感：纸色罩一层 + 牛皮纸色相乘（比立起的天幕卡淡一档，天幕卡才“跳”出来）
  g.fillStyle = rgba(PAL.paper, 0.46);
  g.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = rgba(PAL.kraft, 0.32);
  g.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = rgba(PAL.inkSoft, 0.07);
  for (let yy = P.y0 + 3; yy < P.y1; yy += 7) for (let xx = P.x0 + ((yy / 7) % 2) * 3.5; xx < P.x1; xx += 7) g.fillRect(xx, yy, 1.4, 1.4);
  g.restore();
  g.strokeStyle = rgba(PAL.inkSoft, 0.65);
  g.lineWidth = 2;
  g.strokeRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  g.strokeStyle = rgba(PAL.kraftDark, 0.8);
  g.lineWidth = 1.2;
  g.strokeRect(P.x0 - 7, P.y0 - 7, P.x1 - P.x0 + 14, P.y1 - P.y0 + 14);
  // 外角的小罗盘纹
  const corners = side === 'left' ? [[S.x0 + 34, C.y0 + 30], [S.x0 + 34, C.y1 - 30]] : [[S.x1 - 34, C.y0 + 30], [S.x1 - 34, C.y1 - 30]];
  for (const [cx, cy] of corners) compass(g, cx, cy, 15);
  g.restore();
  // 书页弧度：近书缝处略暗
  shade(g, page, PAL.shadow, 960, 0, side === 'left' ? 900 : 1020, 0, 0.22, 0);
}

function compass(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = rgba(PAL.kraftDark, 0.95);
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.stroke();
  g.fillStyle = rgba(PAL.kraftDark, 0.95);
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate((i * TAU) / 4);
    g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r * 0.22, 0); g.lineTo(-r * 0.22, 0); g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = rgba(PAL.redDark, 0.9);
  g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r * 0.22, 0); g.lineTo(-r * 0.22, 0); g.closePath(); g.fill();
  g.restore();
}

// —— 立体件：天幕卡 + 城丘 + 王城 + 城下 + 花丛（同一个 drawCastle） ——
function drawPopup(g, st) {
  const { o, T } = st;
  if (st.open < 0.999) return;
  let P = popupObj(o.popup);
  P = applyFold(P, clamp(o.fold ?? 0));
  const castleCam = bookToCastleCam(st.c);
  const castleO = o.castle || {};
  const layers = o.pop || ['sky', 'far', 'mid', 'main', 'near', 'fg'];
  for (const layer of layers) {
    g.save();
    // 裁到天幕卡的横向范围、书页下沿以上（书内坐标）
    // 视差解冻（flat→0，即接近 CA-W 以上的机位）时下沿放开，地面带可以盖过书页下沿（b17 拉回起点与世界一致）
    g.setTransform(st.bookT);
    const bottom = BOOK.spread.y1 + (1 - castleCam.flat) * 3000;
    g.beginPath(); g.rect(BOOK.card.x0, -4000, BOOK.card.x1 - BOOK.card.x0, 4000 + bottom); g.clip();
    g.setTransform(st.base);
    drawCastle(g, T, castleCam, { ...castleO, layer, popup: P });
    g.restore();
  }
}

// —— 书签（+ 片尾多垂一截卷轴尾巴） ——
function drawBookmark(g, st) {
  const { T, o } = st;
  const bm = o.bookmark || {};
  const B = BOOK.bookmark;
  const wob = bm.wobbleAt !== undefined ? wobble(T, bm.wobbleAt, 4, 0.45) : 0;
  const ang = Math.sin(T * 1.25) * 0.03 + wob * 0.2;
  if (bm.extra === 'scroll') drawScrollTail(g, st, clamp(bm.roll ?? 0));
  g.save();
  g.translate(B.x, BOOK.cover.y1 - 6);
  g.rotate(ang);
  const L = B.y1 - BOOK.cover.y1 + 6, w = B.w / 2;
  const bend = Math.sin(T * 1.7) * 3 + wob * 10;
  const pts = [[-w, 0], [w, 0], [w + bend * 0.5, L * 0.5], [w + bend, L], [bend, L - 16], [-w + bend, L], [-w + bend * 0.5, L * 0.5]];
  const rib = poly(pts, { seed: 801, amp: 0.4, step: 30, round: 0.15 });
  g.save(); g.translate(4, 5); g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(rib); g.restore();
  cut(g, rib, PAL.scarf, { rim: M(PAL.scarf, PAL.white, 0.45), rimW: 2 });
  shade(g, rib, PAL.scarfDark, w, 0, -w * 0.2, 0, 0.55, 0);
  g.strokeStyle = rgba(PAL.scarfDark, 0.6);
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-w + 3, 4); g.quadraticCurveTo(-w + 3 + bend * 0.3, L * 0.5, -w + 3 + bend, L - 6); g.stroke();
  g.restore();
}
function drawScrollTail(g, st, roll) {
  const { T } = st;
  const x0 = 1640, y0 = BOOK.cover.y1 - 4;
  const len = lerp(190, 26, outCubic(roll));
  const w = 54;
  g.save();
  g.translate(x0, y0);
  g.rotate(-0.22 + Math.sin(T * 0.9) * 0.01);
  const strip = poly([[0, 0], [w, 0], [w + 2, len], [-2, len]], { seed: 811, amp: 0.6, step: 30 });
  g.save(); g.translate(4, 6); g.fillStyle = rgba(PAL.shadow, 0.35); g.fill(strip); g.restore();
  cut(g, strip, PAL.paper, { rim: PAL.white, rimW: 1.6 });
  g.strokeStyle = PAL.red; g.lineWidth = 2;
  g.beginPath(); g.moveTo(4, 2); g.lineTo(4, len); g.moveTo(w - 4, 2); g.lineTo(w - 4, len); g.stroke();
  g.fillStyle = rgba(PAL.ink, 0.55);
  for (let yy = 14; yy < len - 6; yy += 13) for (let xx = 12; xx < w - 10; xx += 9) if (hash2(xx, yy) > 0.25) g.fillRect(xx, yy, 5, 3);
  // 卷起的一端
  const r = lerp(14, 22, roll);
  const rl = rr(-6, len - r * 0.6, w + 12, r * 1.6, r * 0.8);
  cut(g, rl, PAL.paper2, { rim: PAL.white, rimW: 1.6 });
  shade(g, rl, PAL.kraftDark, 0, len + r, 0, len - r * 0.4, 0.45, 0);
  g.restore();
}

// ════════════════════════════════ 片名页 ════════════════════════════════
/**
 * drawTitlePage(g, T, o)：屏幕坐标满屏。redDeep 皮面 + 纸纹 + 内缩 60 的 gold 双线框 + 四角卷草。
 * o.title: true 或 { rise:[4]（每字 0..1，以基线为锚 scaleY outBack）, foil 0..1, star 0..1 }（片名三层纸叠）
 * o.rays 0..1（字后慢转光芒）；o.titleFn(g, opts) 可替换为 type.titleGlyphs。返回四个字的中心。
 */
export function drawTitlePage(g, T, o = {}) {
  g.save();
  g.fillStyle = lin(g, 0, 0, 1920, 1080, [M(PAL.redDeep, PAL.red, 0.16), PAL.redDeep, M(PAL.redDeep, PAL.ink, 0.2)]);
  g.fillRect(0, 0, 1920, 1080);
  for (let i = 0; i < 520; i++) {
    const x = hash2(i, 601) * 1920, y = hash2(i, 602) * 1080;
    g.fillStyle = hash2(i, 603) < 0.5 ? rgba(PAL.ink, 0.1) : rgba(PAL.red, 0.1);
    g.beginPath(); g.ellipse(x, y, 2 + hash2(i, 604) * 3, 1.2 + hash2(i, 605) * 2, hash2(i, 606) * 3, 0, TAU); g.fill();
  }
  g.fillStyle = rad(g, 960, 540, 300, 1150, [[0, rgba(PAL.ink, 0)], [1, rgba(PAL.ink, 0.42)]]);
  g.fillRect(0, 0, 1920, 1080);
  const raysA = clamp(o.rays ?? 0);
  if (raysA > 0) rays(g, 960, 470, 1100, { n: 18, width: 0.07, rot: T * 0.08, color: PAL.goldLight, alpha: 0.2 * raysA, r0: 60, seed: 611 });
  goldRect(g, 60, 60, 1860, 1020, 5);
  goldRect(g, 76, 76, 1844, 1004, 2.4);
  for (const [x, y, sx, sy] of [[76, 76, 1, 1], [1844, 76, -1, 1], [76, 1004, 1, -1], [1844, 1004, -1, -1]]) scrollCorner(g, x, y, sx, sy, 1.55);
  let centers = null;
  if (o.title) {
    const opts = o.title === true ? {} : o.title;
    centers = (o.titleFn || drawTitleGlyphs)(g, { T, ...opts });
  }
  g.restore();
  return centers;
}

/**
 * 片名「达拉崩吧」三层剪纸字（占位实现，等 type.titleGlyphs 就绪可替换）：
 * display 300px，基线 y=560，中心 x=960；底层 paper (+16,+16)、中层 gold (+8,+8)、顶层 red，goldLight 切口亮边。
 * o: { x=960, y=560, size=300, rise:[4], foil 0..1, star 0..1, T }
 */
export function drawTitleGlyphs(g, o = {}) {
  const { x = 960, y = 560, size = 300, rise = [1, 1, 1, 1], foil = 0, star = 0, T = 0 } = o;
  const chars = [...(o.chars || PROJECT.title || '纸艺故事')];
  const adv = glyphWidth(g, chars[0], size, 'display');
  g.save();
  g.font = font(size, 'display');
  const m = g.measureText(chars[0]);
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  g.restore();
  const cyOff = -(asc - desc) / 2; // 视觉中心相对基线
  const centers = [];
  chars.forEach((ch, k) => {
    const cx = x + (k - (chars.length-1)/2) * adv;
    centers.push([cx, y + cyOff]);
    const r = clamp(rise[k] ?? 1);
    if (r <= 0) return;
    const s = r < 1 ? outBack(r, 1.8) : 1;
    g.save();
    g.translate(cx, y);
    g.scale(1, Math.max(0.002, s));
    g.translate(-cx, -y);
    paperGlyph(g, ch, cx + 16, y + cyOff + 16, size, { fill: PAL.paper, edge: null });
    paperGlyph(g, ch, cx + 8, y + cyOff + 8, size, { fill: PAL.gold, edge: null });
    paperGlyph(g, ch, cx, y + cyOff - 3, size, { fill: PAL.goldLight, edge: null });
    paperGlyph(g, ch, cx, y + cyOff, size, { fill: PAL.red, edge: null });
    g.restore();
  });
  if (foil > 0 && foil < 1) {
    const bx = lerp(x - 620, x + 620, foil);
    const band = lin(g, bx - 160, y - 200, bx + 160, y + 120, [[0, rgba(PAL.white, 0)], [0.44, rgba(PAL.white, 0)], [0.5, rgba(PAL.goldLight, 0.95)], [0.56, rgba(PAL.white, 0)], [1, rgba(PAL.white, 0)]]);
    g.save();
    g.globalCompositeOperation = 'screen';
    chars.forEach((ch, k) => { if ((rise[k] ?? 1) >= 1) paperGlyph(g, ch, centers[k][0], centers[k][1], size, { fill: band, edge: null }); });
    g.restore();
  }
  if (star > 0) {
    const [sx0, sy0] = centers.at(-1);
    const sx = sx0 + adv * 0.48, sy = sy0 - size * 0.42;
    const k = star < 1 ? outBack(star, 2.4) : 1;
    const fade = 1 - smoothstep(0.75, 1, star);
    glow(g, sx, sy, 110 * k, PAL.goldLight, 0.6 * fade);
    sparkle(g, sx, sy, 56 * k, { color: PAL.white, alpha: Math.max(0.001, fade), rot: star * 0.5 + T * 0.1, thin: 0.18 });
  }
  return centers;
}
