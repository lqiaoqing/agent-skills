// 纸艺 RPG 界面组件（assets.md 第 10 节；storyboard b04–b17）。
// 材质：paper 卡纸 + 4px ink 墨线（手剪抖动 1.2px）+ kraftDark 2px 缝线（虚线 [10,8]，内缩 12px）+ gold 包角；名签红底奶油字。
// 投影与纸纹由镜头的图层给（shadow 8–14、texture 0.3）；组件内部只用“暗色错位底片 + 顶边切口亮边”分层。
// 约定：纯函数（只读参数，含 t 秒）；内部 save/restore；不调 ctx.layer / ctx.mask；所有符号走 glyphIcon（路径画，不用字体字形）；
// 界面字 play、数字 / LV / HP / VS / EXP 用 latin 600–700，统一走 type.js；所有界面元素 y ≤ 900。
// 进度类参数（pop / drop / flip / typed / p …）一律传线性 0..1，组件内部自己套缓动。详见 docs/api/ui.md。
import { PAL, rr, blob, poly, ribbon, cut, shade, glow, rays } from '../core/paper.js';
import { clamp, lerp, hash2, noise1, rgba, mixHex, TAU } from '../core/util.js';
import { outBack, outCubic, outQuad, inQuad, inOutSine, inCubic } from '../core/ease.js';
import { NAMES } from '../cues.js';
import { paperGlyph, glyphRow, typeOn, glyphAdvance, glyphWidth, marquee, charsOf } from './type.js';

const P = PAL;
/** 界面上出现的全部自拟文字（集中在这里，便于检查乱码）。 */
export const TXT = {
  king: '国王', unknown: '？？？', naming: '取名', over: '字数超限！', fullName: '全名', items: '道具',
  menu: ['攻击', '技能', '道具', '逃跑'], heroTurn: '勇者的回合', enemyTurn: '敌方回合', victory: '胜利！',
  crit: '暴击！', nameSword: '名字之剑', ellipsis: '…',
  mishear: { card: '昆特牌', violin: '提琴', eggtart: '烤蛋挞', soda: '苏打', marathon: '马拉松' },
};

// ———————————————————— 小工具 ————————————————————
const ease = (f, x, ...a) => f(clamp(x), ...a);
const lerpRect = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
/** 眨眼：约 3.4s 一次，0.13s 闭合（确定性）。 */
export const blinkAt = (t, seed = 1) => { const k = (t + hash2(seed, 3) * 3.4) % 3.4; return k < 0.13 ? Math.sin((k / 0.13) * Math.PI) : 0; };
const pathOf = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
/** 用 type.js 写一行界面字（默认 play、墨色、无纸边、共用基线）。返回每字位置。 */
function uiText(g, text, x, y, size, o = {}) {
  return glyphRow(g, [...text], x, y, size, { family: 'play', fill: P.ink, edge: null, baseline: true, gap: 0, ...o });
}
function uiWidth(g, text, size, o = {}) {
  const arr = [...text];
  const gap = o.gap ?? 0;
  return arr.reduce((a, c) => a + glyphAdvance(g, c, size, { family: 'play', ...o }), 0) + gap * Math.max(0, arr.length - 1);
}

// ———————————————————— 纸边轮廓 ————————————————————
/**
 * 圆角矩形纸边轮廓点：手剪抖动（noise，尺寸变化时连续不跳）、整体鼓成气球（bulge 0..1）、右边单独鼓出（bulgeR px）、
 * 右边撕口（tear 0..1，中心 tearY）。返回 { pts, notch }。
 */
function outlinePts(x, y, w, h, o = {}) {
  const amp = o.amp ?? 1.2, seed = o.seed ?? 1, step = o.step ?? 12;
  const bul = clamp(o.bulge ?? 0);
  const r = Math.max(2, Math.min((o.r ?? 16) + bul * Math.min(w, h) * 0.24, w / 2 - 1, h / 2 - 1));
  const bR = o.bulgeR || 0;
  const tear = clamp(o.tear ?? 0), tearY = o.tearY ?? y + h / 2, th = tear * h * 0.3, dep = 14 + tear * 46;
  const bowOf = (len) => bul * Math.min(70, len * 0.16);
  const pts = [];
  let s = 0;
  const add = (px, py, nx, ny, jit = 1) => { const d = amp * noise1(s / 19, seed) * jit; pts.push([px + nx * d, py + ny * d]); };
  const side = (x0, y0, x1, y1, nx, ny, bow) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(len / step));
    for (let i = 0; i < n; i++) { const u = i / n, b = bow * Math.sin(Math.PI * u); add(lerp(x0, x1, u) + nx * b, lerp(y0, y1, u) + ny * b, nx, ny); s += len / n; }
  };
  const corner = (cx, cy, a0) => {
    const n = Math.max(3, Math.ceil((r * 1.571) / step));
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * (Math.PI / 2); add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.cos(a), Math.sin(a)); s += (r * 1.571) / n; }
  };
  side(x + r, y, x + w - r, y, 0, -1, bowOf(w - 2 * r));
  corner(x + w - r, y + r, -Math.PI / 2);
  // 右边：鼓出 + 撕口
  let notch = null;
  {
    const y0 = y + r, y1 = y + h - r, len = y1 - y0, bow = bowOf(len);
    let py = y0;
    while (py < y1) {
      const u = (py - y0) / len, b = bow * Math.sin(Math.PI * u) + bR * Math.sin(Math.PI * u);
      const v = th > 0 ? (py - tearY) / th : 9;
      if (Math.abs(v) < 1) {
        const k = 1 - Math.abs(v) ** 1.6;
        const jag = (hash2(seed + 7, Math.round(py / 5)) - 0.5) * 16 * tear;
        add(x + w + b - dep * k + jag * k, py, 1, 0, 0.3);
        if (!notch) notch = { x: x + w + b, y0: tearY - th, y1: tearY + th, depth: dep, tearY };
        py += 5; s += 5;
      } else { add(x + w + b, py, 1, 0); py += step; s += step; }
    }
  }
  corner(x + w - r, y + h - r, 0);
  side(x + w - r, y + h, x + r, y + h, 0, 1, bowOf(w - 2 * r));
  corner(x + r, y + h - r, Math.PI / 2);
  side(x, y + h - r, x, y + r, -1, 0, bowOf(h - 2 * r));
  corner(x + r, y + r, Math.PI);
  return { pts, notch, r };
}

/** gold 包角：沿圆角盖住的一片金纸 + 一颗铆钉。(x,y) 为矩形角点，dir 0..3 = 左上 / 右上 / 右下 / 左下。 */
function goldCorner(g, x, y, dir, size, r) {
  g.save();
  g.translate(x, y);
  g.rotate((dir * Math.PI) / 2);
  const s = size, rr_ = Math.min(r, s * 0.8);
  const p = new Path2D();
  p.moveTo(0, s);
  p.lineTo(0, rr_);
  p.quadraticCurveTo(0, 0, rr_, 0);
  p.lineTo(s, 0);
  p.quadraticCurveTo(s * 0.42, s * 0.42, 0, s);
  p.closePath();
  g.save(); g.translate(1.5, 2.2); g.fillStyle = rgba(P.goldDark, 0.9); g.fill(p); g.restore();
  cut(g, p, P.gold, { rim: P.goldLight, rimW: 1.6 });
  g.strokeStyle = P.goldDark; g.lineWidth = 1.4; g.stroke(p);
  g.fillStyle = P.goldDark; g.beginPath(); g.arc(s * 0.26, s * 0.26, s * 0.075, 0, TAU); g.fill();
  g.fillStyle = P.goldLight; g.beginPath(); g.arc(s * 0.245, s * 0.24, s * 0.03, 0, TAU); g.fill();
  g.restore();
}

/**
 * 红底奶油字名签（「国王」「？？？」「取名」…）。(x, y) = 名签左端中点（anchor:'right' 时为右端）。
 * o: { size=30, anchor:'left'|'right'|'center', color=red, text2 + flip 0..1（翻牌换字：前半旧字压扁、后半新字展开）, rot }
 * 返回 { x, y, w, h }。
 */
export function nameTab(g, text, x, y, o = {}) {
  const size = o.size ?? 30, flip = clamp(o.flip ?? 0);
  const showNew = flip >= 0.5 || o.text2 == null;
  const txt = showNew ? text : o.text2;
  const sy = flip > 0 && flip < 1 ? Math.abs(Math.cos(flip * Math.PI)) : 1;
  const tw = uiWidth(g, txt, size), pad = size * 0.55, w = tw + pad * 2, h = size * 1.42;
  const x0 = o.anchor === 'right' ? x - w : o.anchor === 'center' ? x - w / 2 : x;
  const col = o.color ?? P.red;
  g.save();
  g.translate(x0 + w / 2, y);
  if (o.rot) g.rotate(o.rot);
  g.scale(1, Math.max(0.02, sy));
  const p = poly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { seed: 31, amp: 0.8, step: 20, round: 0 });
  g.save(); g.translate(2, 3); g.fillStyle = mixHex(col, P.ink, 0.5); g.fill(p); g.restore();
  cut(g, p, col, { rim: mixHex(col, P.white, 0.4), rimW: 2 });
  g.setLineDash([5, 4]); g.strokeStyle = rgba(P.paper, 0.55); g.lineWidth = 1.5;
  g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10); g.setLineDash([]);
  uiText(g, txt, -tw / 2, 0, size, { fill: P.paper });
  g.restore();
  return { x: x0, y: y - h / 2, w, h };
}

/**
 * 基础卡纸面板。rect {x,y,w,h}。
 * o: { stitch=true, corners=true, cornerSize=26, tag:{text, side:'left'|'right', size, text2, flip, color},
 *      bulge 0..1（整体鼓成气球）, bulgeR(px，右边鼓出), tear 0..1 + tearY（右边撕口）, r=16, fill=paper, line=ink, lw=4,
 *      alpha, seed, content(g)（裁在面板内画的内容，画在缝线之下） }
 * 返回 { path, notch, rect }。
 */
export function paperPanel(g, rect, o = {}) {
  const { x, y, w, h } = rect;
  const seed = o.seed ?? 3, r = o.r ?? 16;
  const { pts, notch, r: rEff } = outlinePts(x, y, w, h, { r, amp: o.amp ?? 1.2, seed, bulge: o.bulge, bulgeR: o.bulgeR, tear: o.tear, tearY: o.tearY });
  const path = pathOf(pts);
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.lineJoin = 'round'; g.lineCap = 'round';
  cut(g, path, o.fill ?? P.paper, { rim: o.rim === undefined ? P.white : o.rim, rimW: 2.5 });
  shade(g, path, P.kraftDark, 0, y, 0, y + h, 0, 0.18);
  if (o.content) { g.save(); g.clip(path); o.content(g); g.restore(); }
  if (o.stitch !== false && w > 60 && h > 60) {
    const ins = 12;
    const sp = outlinePts(x + ins, y + ins, w - ins * 2, h - ins * 2, { r: Math.max(4, r - 9), amp: 0.5, seed: seed + 5, bulge: o.bulge, bulgeR: (o.bulgeR || 0) * 0.9 }).pts;
    g.save(); g.clip(path);
    g.setLineDash([10, 8]); g.strokeStyle = o.stitchColor ?? P.kraftDark; g.lineWidth = 2; g.stroke(pathOf(sp));
    g.restore();
  }
  g.strokeStyle = o.line ?? P.ink; g.lineWidth = o.lw ?? 4; g.stroke(path);
  const ca = 1 - clamp((o.bulge ?? 0) * 2.4);
  if (o.corners !== false && ca > 0) {
    // 鼓成气球时包角随之脱落（淡出 + 向外弹开）
    const cs = o.cornerSize ?? 26, b = (1 - ca) * 18;
    g.save(); g.globalAlpha *= ca;
    goldCorner(g, x - b, y - b, 0, cs, rEff); goldCorner(g, x + w + b, y - b, 1, cs, rEff);
    goldCorner(g, x + w + b, y + h + b, 2, cs, rEff); goldCorner(g, x - b, y + h + b, 3, cs, rEff);
    g.restore();
  }
  if (o.tag) {
    const tg = o.tag, ts = tg.size ?? 30;
    if (tg.side === 'right') nameTab(g, tg.text, x + w - 30, y + 2, { size: ts, anchor: 'right', text2: tg.text2, flip: tg.flip, color: tg.color });
    else nameTab(g, tg.text, x + 30, y + 2, { size: ts, text2: tg.text2, flip: tg.flip, color: tg.color });
  }
  g.restore();
  return { path, notch, rect };
}

// ———————————————————— 符号（路径画） ————————————————————
/** 分层填一个路径：纸边（奶油描边）→ 暗色错位底片 → 主色 → 顶边亮边 → 墨线。 */
function iconCut(g, path, s, o, d) {
  const pick = (k) => (o[k] === undefined ? d[k] : o[k]);
  const fill = pick('fill'), edge = o.flat ? null : pick('edge'), under = o.flat ? null : pick('under'), rim = o.flat ? null : pick('rim'), line = pick('line');
  const dz = s * 0.05;
  if (edge) { g.save(); g.translate(dz * 0.3, dz * 0.5); g.strokeStyle = edge; g.lineWidth = s * (o.edgeW ?? d.edgeW ?? 0.13); g.stroke(path); g.fill(path); g.restore(); }
  if (under) { g.save(); g.translate(dz * 0.6, dz); g.fillStyle = under; g.fill(path); g.restore(); }
  g.fillStyle = fill; g.fill(path);
  if (rim) { g.save(); g.clip(path); g.translate(0, s * 0.055); g.globalAlpha *= 0.85; g.strokeStyle = rim; g.lineWidth = s * 0.075; g.stroke(path); g.restore(); }
  if (line) { g.strokeStyle = line; g.lineWidth = Math.max(1, s * (o.lineW ?? d.lineW ?? 0.04)); g.stroke(path); }
}
/** 粗笔画符号（对勾、叉、问号钩）：同样的分层，用描边宽度代替面积。 */
function iconStroke(g, path, s, wid, o, d) {
  const pick = (k) => (o[k] === undefined ? d[k] : o[k]);
  const fill = pick('fill'), edge = o.flat ? null : pick('edge'), under = o.flat ? null : pick('under'), rim = o.flat ? null : pick('rim');
  const dz = s * 0.05, W = s * wid;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (edge) { g.save(); g.translate(dz * 0.3, dz * 0.5); g.strokeStyle = edge; g.lineWidth = W + s * 0.13; g.stroke(path); g.restore(); }
  if (under) { g.save(); g.translate(dz * 0.6, dz); g.strokeStyle = under; g.lineWidth = W; g.stroke(path); g.restore(); }
  g.strokeStyle = fill; g.lineWidth = W; g.stroke(path);
  if (rim) { g.save(); g.translate(0, -W * 0.22); g.globalAlpha *= 0.55; g.strokeStyle = rim; g.lineWidth = W * 0.32; g.stroke(path); g.restore(); }
}
function starPath(R, r, n = 5, rot = -Math.PI / 2) {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? r : R; i ? p.lineTo(Math.cos(a) * q, Math.sin(a) * q) : p.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
  p.closePath();
  return p;
}
function heartPts(s, n = 56) {
  const k = (0.47 * s) / 16, pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([16 * Math.sin(t) ** 3 * k, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k - 2.4 * k]); }
  return pts;
}
const heartPath = (s) => pathOf(heartPts(s));
function sparklePath(s, thin = 0.13) {
  const p = new Path2D(), R = s * 0.5, q = s * thin;
  p.moveTo(0, -R);
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2, b = a + Math.PI / 4, c = a + Math.PI / 2;
    p.quadraticCurveTo(Math.cos(b) * q, Math.sin(b) * q, Math.cos(c) * R, Math.sin(c) * R);
  }
  p.closePath();
  return p;
}
const DIGIT = {
  1: (s) => { const p = new Path2D(); p.moveTo(-0.11 * s, -0.12 * s); p.lineTo(0.03 * s, -0.24 * s); p.lineTo(0.03 * s, 0.25 * s); return p; },
  2: (s) => { const p = new Path2D(); p.moveTo(-0.16 * s, -0.1 * s); p.bezierCurveTo(-0.14 * s, -0.3 * s, 0.18 * s, -0.3 * s, 0.17 * s, -0.08 * s); p.bezierCurveTo(0.16 * s, 0.04 * s, -0.05 * s, 0.14 * s, -0.17 * s, 0.25 * s); p.lineTo(0.18 * s, 0.25 * s); return p; },
  3: (s) => { const p = new Path2D(); p.moveTo(-0.15 * s, -0.19 * s); p.bezierCurveTo(-0.05 * s, -0.3 * s, 0.2 * s, -0.25 * s, 0.14 * s, -0.08 * s); p.bezierCurveTo(0.11 * s, 0.0, 0.0, 0.01 * s, -0.04 * s, 0.01 * s); p.moveTo(-0.04 * s, 0.01 * s); p.bezierCurveTo(0.24 * s, 0.0, 0.22 * s, 0.3 * s, 0.0, 0.26 * s); p.bezierCurveTo(-0.08 * s, 0.25 * s, -0.14 * s, 0.22 * s, -0.17 * s, 0.17 * s); return p; },
  4: (s) => { const p = new Path2D(); p.moveTo(0.08 * s, 0.26 * s); p.lineTo(0.08 * s, -0.25 * s); p.lineTo(-0.18 * s, 0.1 * s); p.lineTo(0.2 * s, 0.1 * s); return p; },
};

const ICONS = {
  star(g, s, o) {
    const p = starPath(s * 0.5, s * 0.21);
    g.save(); g.lineJoin = 'round';
    iconCut(g, p, s, o, { fill: P.gold, edge: P.paper, under: P.goldDark, rim: P.goldLight });
    if (!o.flat) { g.fillStyle = rgba(P.white, 0.55); g.beginPath(); g.ellipse(-s * 0.08, -s * 0.12, s * 0.05, s * 0.025, -0.6, 0, TAU); g.fill(); }
    g.restore();
  },
  heart(g, s, o) {
    const p = heartPath(s);
    const fr = o.fillFrac ?? 1, crack = clamp(o.crack ?? 0);
    if (crack > 0.35) {
      // 裂成两半：各自旋开、下坠、淡出
      const k = (crack - 0.35) / 0.65;
      for (const sd of [-1, 1]) {
        g.save();
        g.globalAlpha *= 1 - k * 0.9;
        g.translate(sd * s * 0.12 * k, s * 0.5 * k * k);
        g.rotate(sd * 0.5 * k);
        g.beginPath(); g.rect(sd < 0 ? -s : 0, -s, s, s * 2); g.clip();
        iconCut(g, p, s, o, { fill: P.heart, edge: P.paper, under: P.redDark, rim: mixHex(P.heart, P.white, 0.45) });
        g.restore();
      }
      return {};
    }
    if (fr < 1) {
      iconCut(g, p, s, { ...o, fill: o.emptyFill ?? P.paper2 }, { fill: P.paper2, edge: P.paper, under: P.kraft, rim: null, line: rgba(P.inkSoft, 0.55), lineW: 0.035 });
      if (fr > 0) { g.save(); g.beginPath(); g.rect(-s, -s, s * (0.53 + 0.94 * fr), s * 2); g.clip(); iconCut(g, p, s, { ...o, edge: null }, { fill: P.heart, under: P.redDark, rim: mixHex(P.heart, P.white, 0.45) }); g.restore(); }
    } else iconCut(g, p, s, o, { fill: P.heart, edge: P.paper, under: P.redDark, rim: mixHex(P.heart, P.white, 0.45) });
    if (crack > 0) {
      const z = new Path2D(); z.moveTo(0, -s * 0.3);
      const n = 4, len = (s * 0.62) * Math.min(1, crack / 0.35);
      for (let i = 1; i <= n; i++) z.lineTo((i % 2 ? 0.07 : -0.06) * s, -s * 0.3 + (len * i) / n);
      g.strokeStyle = P.paper; g.lineWidth = s * 0.07; g.lineJoin = 'miter'; g.stroke(z);
    }
    if (!o.flat && fr >= 1) { g.fillStyle = rgba(P.white, 0.6); g.beginPath(); g.ellipse(-s * 0.2, -s * 0.16, s * 0.07, s * 0.04, -0.7, 0, TAU); g.fill(); }
    return {};
  },
  note(g, s, o) {
    const p = new Path2D();
    p.ellipse(-s * 0.13, s * 0.26, s * 0.17, s * 0.12, -0.42, 0, TAU);
    const p2 = new Path2D();
    p2.moveTo(s * 0.01, s * 0.24); p2.lineTo(s * 0.01, -s * 0.42); p2.lineTo(s * 0.09, -s * 0.42);
    p2.bezierCurveTo(s * 0.12, -s * 0.24, s * 0.36, -s * 0.22, s * 0.3, s * 0.02);
    p2.bezierCurveTo(s * 0.28, -s * 0.1, s * 0.2, -s * 0.18, s * 0.09, -s * 0.18); p2.lineTo(s * 0.09, s * 0.24); p2.closePath();
    const all = new Path2D(); all.addPath(p); all.addPath(p2);
    iconCut(g, all, s, o, { fill: P.ink, edge: P.paper, under: null, rim: P.inkSoft });
  },
  check(g, s, o) {
    const p = new Path2D(); p.moveTo(-s * 0.32, s * 0.02); p.lineTo(-s * 0.08, s * 0.26); p.lineTo(s * 0.34, -s * 0.28);
    iconStroke(g, p, s, 0.16, o, { fill: P.grass, edge: P.paper, under: P.grassDark, rim: P.leafLight });
  },
  cross(g, s, o) {
    const p = new Path2D(); p.moveTo(-s * 0.28, -s * 0.28); p.lineTo(s * 0.28, s * 0.28); p.moveTo(s * 0.28, -s * 0.28); p.lineTo(-s * 0.28, s * 0.28);
    iconStroke(g, p, s, 0.16, o, { fill: P.red, edge: P.paper, under: P.redDark, rim: mixHex(P.red, P.white, 0.4) });
  },
  triDown(g, s, o) {
    const p = poly([[-s * 0.36, -s * 0.22], [s * 0.36, -s * 0.22], [0, s * 0.3]], { amp: 0, round: 0 });
    g.lineJoin = 'round'; g.strokeStyle = o.fill ?? P.ink; g.lineWidth = s * 0.08; g.stroke(p);
    iconCut(g, p, s, o, { fill: P.ink, edge: null, under: null, rim: null });
  },
  triRight(g, s, o) {
    const p = poly([[-s * 0.22, -s * 0.36], [s * 0.3, 0], [-s * 0.22, s * 0.36]], { amp: 0, round: 0 });
    g.lineJoin = 'round'; g.strokeStyle = o.fill ?? P.ink; g.lineWidth = s * 0.08; g.stroke(p);
    iconCut(g, p, s, o, { fill: P.ink, edge: null, under: null, rim: null });
  },
  sparkle4(g, s, o) {
    const p = sparklePath(s, o.thin ?? 0.12);
    iconCut(g, p, s, o, { fill: P.goldLight, edge: null, under: rgba(P.gold, 0.8), rim: null });
    if (!o.flat) { g.fillStyle = rgba(P.white, 0.9); g.fill(sparklePath(s * 0.45, 0.16)); }
  },
  dot(g, s, o) {
    const p = new Path2D(); p.arc(0, 0, s * 0.2, 0, TAU);
    iconCut(g, p, s, o, { fill: P.ink, edge: null, under: null, rim: null });
  },
  exclaim(g, s, o) {
    const bar = clamp(o.bar ?? 1);
    const dot = new Path2D(); dot.arc(0, s * 0.34, s * 0.1, 0, TAU);
    iconCut(g, dot, s, o, { fill: P.red, edge: P.paper, under: P.redDark, rim: mixHex(P.red, P.white, 0.45) });
    if (bar > 0) {
      const k = bar >= 1 ? 1 : outBack(bar, 2.2);
      g.save(); g.translate(0, s * 0.16); g.scale(lerp(0.6, 1, Math.min(1, k)), k); g.translate(0, -s * 0.16);
      const p = new Path2D();
      p.moveTo(-s * 0.13, -s * 0.4); p.quadraticCurveTo(0, -s * 0.5, s * 0.13, -s * 0.4);
      p.lineTo(s * 0.05, s * 0.14); p.quadraticCurveTo(0, s * 0.19, -s * 0.05, s * 0.14); p.closePath();
      iconCut(g, p, s, o, { fill: P.red, edge: P.paper, under: P.redDark, rim: mixHex(P.red, P.white, 0.45) });
      g.restore();
    }
    return { dot: [0, s * 0.34] };
  },
  question(g, s, o) {
    const p = new Path2D();
    p.moveTo(-s * 0.2, -s * 0.16);
    p.bezierCurveTo(-s * 0.2, -s * 0.42, s * 0.24, -s * 0.44, s * 0.22, -s * 0.16);
    p.bezierCurveTo(s * 0.2, -s * 0.02, 0, -s * 0.02, 0, s * 0.12);
    iconStroke(g, p, s, 0.14, o, { fill: P.ink, edge: P.paper, under: null, rim: P.inkSoft });
    const dot = new Path2D(); dot.arc(0, s * 0.34, s * 0.09, 0, TAU);
    iconCut(g, dot, s, o, { fill: P.ink, edge: P.paper, under: null, rim: null });
    return { dot: [0, s * 0.34] };
  },
  sword(g, s, o) {
    // 指向右：剑首 ← 握柄 ← 护手 → 剑刃 → 剑尖
    const blade = new Path2D();
    blade.moveTo(-s * 0.06, -s * 0.085); blade.lineTo(s * 0.33, -s * 0.085); blade.lineTo(s * 0.5, 0); blade.lineTo(s * 0.33, s * 0.085); blade.lineTo(-s * 0.06, s * 0.085); blade.closePath();
    const guard = rr(-s * 0.15, -s * 0.24, s * 0.1, s * 0.48, s * 0.04);
    const grip = rr(-s * 0.36, -s * 0.06, s * 0.23, s * 0.12, s * 0.04);
    const pom = new Path2D(); pom.arc(-s * 0.41, 0, s * 0.085, 0, TAU);
    if (!o.flat) {
      g.save(); g.translate(s * 0.015, s * 0.025); g.strokeStyle = o.edge ?? P.paper; g.lineWidth = s * 0.1; g.lineJoin = 'round';
      for (const q of [blade, guard, grip, pom]) { g.stroke(q); g.fill(q); }
      g.restore();
    }
    iconCut(g, blade, s, { ...o, edge: null }, { fill: o.fill ?? P.steel, under: P.steelDark, rim: P.white, line: rgba(P.inkSoft, 0.5), lineW: 0.02 });
    g.strokeStyle = rgba(o.fill ? mixHex(o.fill, P.ink, 0.35) : P.steelDark, 0.8); g.lineWidth = s * 0.024; g.beginPath(); g.moveTo(-s * 0.02, 0); g.lineTo(s * 0.32, 0); g.stroke();
    iconCut(g, grip, s, { edge: null }, { fill: P.leather, under: P.woodDark, rim: null });
    g.strokeStyle = rgba(P.woodDark, 0.8); g.lineWidth = s * 0.018;
    for (let i = 0; i < 4; i++) { const xx = -s * 0.33 + i * s * 0.055; g.beginPath(); g.moveTo(xx, -s * 0.06); g.lineTo(xx + s * 0.035, s * 0.06); g.stroke(); }
    iconCut(g, guard, s, { edge: null }, { fill: P.gold, under: P.goldDark, rim: P.goldLight });
    iconCut(g, pom, s, { edge: null }, { fill: P.red, under: P.redDeep, rim: mixHex(P.red, P.white, 0.5), line: P.goldDark, lineW: 0.025 });
  },
  lock(g, s, o) {
    const open = clamp(o.open ?? 0);
    const sh = new Path2D();
    sh.moveTo(-s * 0.18, -s * 0.02); sh.lineTo(-s * 0.18, -s * 0.18); sh.arc(0, -s * 0.18, s * 0.18, Math.PI, 0); sh.lineTo(s * 0.18, -s * 0.02 - open * s * 0.12);
    g.save(); g.translate(0, -open * s * 0.16);
    iconStroke(g, sh, s, 0.085, o, { fill: P.steelDark, edge: P.paper, under: P.stoneDark, rim: P.steel });
    g.restore();
    const body = rr(-s * 0.3, -s * 0.06, s * 0.6, s * 0.48, s * 0.08);
    iconCut(g, body, s, o, { fill: P.gold, edge: P.paper, under: P.goldDark, rim: P.goldLight, line: P.goldDark, lineW: 0.025 });
    g.fillStyle = P.ink; g.beginPath(); g.arc(0, s * 0.13, s * 0.065, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-s * 0.035, s * 0.15); g.lineTo(s * 0.035, s * 0.15); g.lineTo(s * 0.02, s * 0.3); g.lineTo(-s * 0.02, s * 0.3); g.closePath(); g.fill();
  },
  circledNum(g, s, o) {
    const n = clamp(Math.round(o.n ?? 1), 1, 4);
    const c = new Path2D(); c.arc(0, 0, s * 0.46, 0, TAU);
    iconCut(g, c, s, o, { fill: P.red, edge: P.paper, under: P.redDark, rim: mixHex(P.red, P.white, 0.4) });
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = o.digit ?? P.paper; g.lineWidth = s * 0.1; g.stroke(DIGIT[n](s));
  },
  arrow(g, s, o) {
    const dir = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[o.dir ?? 'right'] ?? 0;
    g.rotate(dir);
    const p = poly([[-s * 0.44, -s * 0.09], [s * 0.04, -s * 0.09], [s * 0.04, -s * 0.3], [s * 0.46, 0], [s * 0.04, s * 0.3], [s * 0.04, s * 0.09], [-s * 0.44, s * 0.09]], { amp: 0, round: 0 });
    g.lineJoin = 'round'; g.strokeStyle = o.fill ?? P.red; g.lineWidth = s * 0.05;
    iconCut(g, p, s, o, { fill: P.red, edge: P.paper, under: P.redDark, rim: mixHex(P.red, P.white, 0.4) });
  },
  coin(g, s, o) {
    const sx = o.spin === undefined ? 1 : Math.cos(o.spin);
    g.scale(Math.abs(sx) < 0.04 ? 0.04 : sx, 1);
    const c = new Path2D(); c.arc(0, 0, s * 0.44, 0, TAU);
    iconCut(g, c, s, o, { fill: P.coin, edge: P.paper, under: P.coinDark, rim: P.goldLight, line: P.coinDark, lineW: 0.03 });
    g.strokeStyle = rgba(P.coinDark, 0.85); g.lineWidth = s * 0.035; g.beginPath(); g.arc(0, 0, s * 0.31, 0, TAU); g.stroke();
    g.fillStyle = rgba(P.coinDark, 0.75); g.fill(starPath(s * 0.17, s * 0.075));
    g.fillStyle = rgba(P.white, 0.55); g.beginPath(); g.ellipse(-s * 0.16, -s * 0.18, s * 0.08, s * 0.04, -0.7, 0, TAU); g.fill();
  },
  bag(g, s, o) {
    const b = new Path2D();
    b.moveTo(-s * 0.12, -s * 0.2);
    b.bezierCurveTo(-s * 0.46, -s * 0.05, -s * 0.48, s * 0.42, 0, s * 0.42);
    b.bezierCurveTo(s * 0.48, s * 0.42, s * 0.46, -s * 0.05, s * 0.12, -s * 0.2); b.closePath();
    const top = new Path2D();
    top.moveTo(-s * 0.12, -s * 0.2); top.lineTo(-s * 0.2, -s * 0.38); top.quadraticCurveTo(0, -s * 0.3, s * 0.2, -s * 0.38); top.lineTo(s * 0.12, -s * 0.2); top.closePath();
    iconCut(g, top, s, o, { fill: mixHex(P.leather, P.white, 0.15), edge: P.paper, under: P.woodDark, rim: null });
    iconCut(g, b, s, o, { fill: P.leather, edge: P.paper, under: P.woodDark, rim: mixHex(P.leather, P.white, 0.35) });
    g.strokeStyle = P.scarf; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.15, -s * 0.2); g.quadraticCurveTo(0, -s * 0.14, s * 0.15, -s * 0.2); g.stroke();
    g.fillStyle = P.gold; g.beginPath(); g.arc(0, s * 0.1, s * 0.06, 0, TAU); g.fill();
  },
};
/** 所有可用符号名。 */
export const ICON_NAMES = Object.keys(ICONS);

/**
 * 路径画符号（全片唯一的符号来源，四套字体都没有这些字形）。(x, y) 为符号中心，size 为外框边长。
 * name：star / heart / note / check / cross / triDown / triRight / sparkle4 / dot / exclaim / question / sword / lock /
 *       circledNum / arrow / coin / bag。
 * o: { fill（主色）, edge（奶油纸边色，null 不要）, under（暗色错位底片）, rim（顶边亮边）, line（墨线）, flat（只画主色）,
 *      rot（弧度）, scale, alpha,
 *      heart: fillFrac 0..1（半颗心 .5）、crack 0..1（裂开 → 两半分开坠落）, emptyFill ｜ exclaim: bar 0..1（竖杠弹出）｜
 *      circledNum: n 1..4、digit 颜色 ｜ arrow: dir 'right'|'left'|'up'|'down' ｜ lock: open 0..1 ｜ coin: spin（弧度，scaleX = cos）｜
 *      sparkle4: thin }
 * 返回 { x, y, size, dot?:[x,y] }（exclaim / question 返回圆点中心，L05「！」圆点对位用）。
 */
export function glyphIcon(g, name, x, y, size, o = {}) {
  const fn = ICONS[name];
  const a = o.alpha ?? 1;
  if (!fn || a <= 0 || size <= 0) return null;
  g.save();
  g.globalAlpha *= clamp(a);
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  const sc = o.scale ?? 1;
  if (sc !== 1) g.scale(sc, sc);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const res = fn(g, size, o) || {};
  g.restore();
  const out = { x, y, size };
  if (res.dot) {
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), [dx, dy] = [res.dot[0] * sc, res.dot[1] * sc];
    out.dot = [x + dx * c - dy * s, y + dx * s + dy * c];
  }
  return out;
}

// ———————————————————— 头像（默认 Q 版小头，镜头可用木偶头部回调替换） ————————————————————
/** 统一脸部画法（全片共用规则）：skin 脸；ink 竖椭圆眼 + 左上白高光；blush 腮红 α0.45；ink 弧线嘴；ink 短弧眉。 */
function drawFace(g, cx, cy, hw, o = {}) {
  const ex = hw * 0.17, ey = cy - hw * 0.02, ew = hw * 0.09, eh = hw * 0.13;
  const blink = clamp(o.blink ?? 0), lw = hw * 0.025;
  g.lineCap = 'round';
  if (o.brows !== false) {
    g.strokeStyle = o.browColor ?? P.ink; g.lineWidth = o.browW ?? lw * 1.1;
    for (const sd of [-1, 1]) { g.beginPath(); g.arc(cx + sd * ex, ey - hw * 0.07, hw * 0.07, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); }
  }
  for (const sd of [-1, 1]) {
    const x = cx + sd * ex;
    if (o.eyes === 'star') { glyphIcon(g, 'star', x, ey, hw * 0.2, { edge: null, under: null }); continue; }
    if (o.eyes === 'x') { g.strokeStyle = P.ink; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(x - ew * 0.6, ey - ew * 0.6); g.lineTo(x + ew * 0.6, ey + ew * 0.6); g.moveTo(x + ew * 0.6, ey - ew * 0.6); g.lineTo(x - ew * 0.6, ey + ew * 0.6); g.stroke(); continue; }
    if (blink > 0.85 || o.eyes === 'closed') { g.strokeStyle = P.ink; g.lineWidth = lw * 1.1; g.beginPath(); g.arc(x, ey - eh * 0.1, ew * 0.7, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); continue; }
    g.fillStyle = o.eyeColor ?? P.ink;
    g.beginPath(); g.ellipse(x, ey, ew / 2, (eh / 2) * (1 - blink * 0.9), 0, 0, TAU); g.fill();
    if (o.pupil) { g.fillStyle = P.ink; g.beginPath(); g.ellipse(x, ey, ew * 0.12, (eh / 2) * 0.85 * (1 - blink), 0, 0, TAU); g.fill(); }
    if (blink < 0.5) { g.fillStyle = P.white; g.beginPath(); g.arc(x - ew * 0.18, ey - eh * 0.2, hw * 0.022, 0, TAU); g.fill(); }
    if (o.lashes) { g.strokeStyle = P.ink; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(x + sd * ew * 0.45, ey - eh * 0.35); g.lineTo(x + sd * ew * 0.9, ey - eh * 0.55); g.stroke(); }
  }
  if (o.blush !== false) {
    g.fillStyle = rgba(P.blush, 0.45);
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(cx + sd * hw * 0.27, cy + hw * 0.1, hw * 0.075, hw * 0.045, 0, 0, TAU); g.fill(); }
  }
  if (o.mouth === 'open') {
    g.fillStyle = P.redDeep; g.beginPath(); g.ellipse(cx, cy + hw * 0.15, hw * 0.07, hw * 0.06, 0, 0, Math.PI); g.fill();
    g.fillStyle = P.heart; g.beginPath(); g.ellipse(cx, cy + hw * 0.18, hw * 0.035, hw * 0.022, 0, 0, TAU); g.fill();
    g.strokeStyle = P.ink; g.lineWidth = lw; g.beginPath(); g.moveTo(cx - hw * 0.07, cy + hw * 0.15); g.lineTo(cx + hw * 0.07, cy + hw * 0.15); g.stroke();
  } else if (o.mouth !== false) {
    g.strokeStyle = P.ink; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy + hw * 0.09, hw * 0.07, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  }
}

/**
 * 默认 Q 版头像（与木偶统一画风的简化头部，用于头像框、角色卡；正式镜头可传木偶头部回调替换）。
 * who：'hero' | 'king' | 'princess' | 'dragon' | 'baby' | 'unknown'。(x, y) 为头部中心，size ≈ 头宽。
 * o: { t（眨眼、呆毛弹动）, expr:'smile'|'open'|'closed'|'star', silhouette（剪影：dragon 只留两只黄眼睛）, blink }
 */
export function portraitHead(g, who, x, y, size, o = {}) {
  const t = o.t ?? 0, s = size;
  const bl = o.blink ?? blinkAt(t, who.length);
  const fo = { blink: bl, mouth: o.expr === 'open' ? 'open' : true, eyes: o.expr === 'closed' ? 'closed' : o.expr === 'star' ? 'star' : undefined };
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (who === 'hero') {
    cut(g, blob(0, -s * 0.06, s * 0.47, s * 0.45, { seed: 41, amp: 0.05 }), P.heroHair);
    cut(g, blob(0, s * 0.05, s * 0.38, s * 0.36, { seed: 42, amp: 0.012 }), P.skin, { rim: mixHex(P.skin, P.white, 0.5), rimW: s * 0.02 });
    shade(g, blob(0, s * 0.05, s * 0.38, s * 0.36, { seed: 42, amp: 0.012 }), P.skinShade, 0, -s * 0.1, 0, s * 0.42, 0, 0.5);
    const bangs = poly([[-s * 0.42, -s * 0.02], [-s * 0.4, -s * 0.3], [-s * 0.1, -s * 0.44], [s * 0.24, -s * 0.4], [s * 0.42, -s * 0.16], [s * 0.4, 0], [s * 0.3, -s * 0.12],
      [s * 0.2, -s * 0.06], [s * 0.12, -s * 0.18], [0, -s * 0.08], [-s * 0.1, -s * 0.2], [-s * 0.2, -s * 0.06], [-s * 0.3, -s * 0.16]], { seed: 43, amp: s * 0.01, round: 0.35 });
    cut(g, bangs, P.heroHair, { rim: mixHex(P.heroHair, P.white, 0.28), rimW: s * 0.025 });
    const wob = Math.sin(t * 7) * 0.12 + noise1(t * 2, 5) * 0.1;
    const ah = [[s * 0.02, -s * 0.4], [s * 0.04 + wob * s * 0.1, -s * 0.56], [s * 0.16 + wob * s * 0.2, -s * 0.66], [s * 0.26 + wob * s * 0.25, -s * 0.6]];
    cut(g, ribbon(ah, (u) => s * (0.045 * (1 - u) + 0.008)), P.heroHair);
    drawFace(g, 0, s * 0.08, s * 0.76, fo);
    if (o.scarf !== false) {
      cut(g, blob(0, s * 0.47, s * 0.34, s * 0.08, { seed: 44, amp: 0.03 }), P.scarfDark);
      cut(g, blob(-s * 0.02, s * 0.44, s * 0.32, s * 0.075, { seed: 45, amp: 0.03 }), P.scarf, { rim: mixHex(P.scarf, P.white, 0.35), rimW: s * 0.02 });
    }
  } else if (who === 'king') {
    for (const sd of [-1, 1]) cut(g, blob(sd * s * 0.36, s * 0.05, s * 0.07, s * 0.09, { seed: 50 + sd }), P.skinShade);
    cut(g, blob(0, s * 0.02, s * 0.36, s * 0.34, { seed: 51, amp: 0.012 }), P.skin, { rim: mixHex(P.skin, P.white, 0.5), rimW: s * 0.02 });
    drawFace(g, 0, s * 0.02, s * 0.72, { ...fo, mouth: false, browColor: P.beard, browW: s * 0.035 });
    const beard = poly([[-s * 0.38, s * 0.06], [-s * 0.3, s * 0.36], [-s * 0.16, s * 0.5], [0, s * 0.56], [s * 0.16, s * 0.5], [s * 0.3, s * 0.36], [s * 0.38, s * 0.06], [s * 0.2, s * 0.18], [0, s * 0.16], [-s * 0.2, s * 0.18]], { seed: 52, amp: s * 0.012, round: 0.5 });
    cut(g, beard, P.beard, { rim: P.white, rimW: s * 0.02 });
    shade(g, beard, P.stone2, 0, s * 0.1, 0, s * 0.56, 0, 0.55);
    for (const sd of [-1, 1]) cut(g, blob(sd * s * 0.1, s * 0.17, s * 0.12, s * 0.055, { seed: 53 + sd, rot: sd * -0.25 }), P.beard, { rim: P.white, rimW: s * 0.015 });
    const crown = poly([[-s * 0.42, -s * 0.22], [-s * 0.46, -s * 0.62], [-s * 0.22, -s * 0.4], [0, -s * 0.72], [s * 0.22, -s * 0.4], [s * 0.46, -s * 0.62], [s * 0.42, -s * 0.22]], { seed: 54, amp: s * 0.006, round: 0.12 });
    g.save(); g.translate(s * 0.02, s * 0.03); g.fillStyle = P.goldDark; g.fill(crown); g.restore();
    cut(g, crown, P.gold, { rim: P.goldLight, rimW: s * 0.025 });
    cut(g, rr(-s * 0.44, -s * 0.3, s * 0.88, s * 0.1, s * 0.03), P.goldDark, { rim: P.gold, rimW: s * 0.015 });
    for (const [gx, gy, c] of [[0, -s * 0.25, P.red], [-s * 0.26, -s * 0.25, P.crystal], [s * 0.26, -s * 0.25, P.crystal], [0, -s * 0.6, P.red]]) {
      cut(g, blob(gx, gy, s * 0.045, s * 0.045, { seed: 55 }), c, { rim: P.white, rimW: s * 0.012 });
    }
  } else if (who === 'princess') {
    cut(g, blob(0, -s * 0.02, s * 0.48, s * 0.47, { seed: 61, amp: 0.03 }), P.hairGold);
    for (let i = 0; i < 4; i++) cut(g, blob(s * (0.36 + i * 0.03), s * (0.2 + i * 0.13), s * 0.08, s * 0.075, { seed: 62 + i }), i % 2 ? P.hairGoldDark : P.hairGold);
    cut(g, blob(0, s * 0.06, s * 0.36, s * 0.35, { seed: 66, amp: 0.012 }), P.skin, { rim: mixHex(P.skin, P.white, 0.5), rimW: s * 0.02 });
    const bang = poly([[-s * 0.4, s * 0.0], [-s * 0.38, -s * 0.3], [0, -s * 0.44], [s * 0.38, -s * 0.3], [s * 0.4, 0], [s * 0.18, -s * 0.18], [-s * 0.04, -s * 0.12], [-s * 0.24, -s * 0.14]], { seed: 67, amp: s * 0.008, round: 0.45 });
    cut(g, bang, P.hairGold, { rim: mixHex(P.hairGold, P.white, 0.4), rimW: s * 0.025 });
    drawFace(g, 0, s * 0.1, s * 0.72, { ...fo, lashes: true });
    if (o.tiara !== false) {
      const tia = poly([[-s * 0.16, -s * 0.36], [-s * 0.14, -s * 0.5], [-s * 0.06, -s * 0.42], [0, -s * 0.56], [s * 0.06, -s * 0.42], [s * 0.14, -s * 0.5], [s * 0.16, -s * 0.36]], { seed: 68, amp: 0, round: 0.1 });
      cut(g, tia, P.gold, { rim: P.goldLight, rimW: s * 0.015, stroke: P.goldDark, lw: s * 0.012 });
      cut(g, blob(0, -s * 0.42, s * 0.03, s * 0.03, { seed: 69 }), P.princess);
    }
  } else if (who === 'dragon') {
    const sil = !!o.silhouette;
    const body = sil ? P.ink : P.dragon, dark = sil ? P.ink : P.dragonDark;
    for (const sd of [-1, 1]) {
      // 两只向后上方弯的角：根部粗、尖端细，象牙色 + 暗色错位底片
      const horn = ribbon([[sd * s * 0.18, -s * 0.12], [sd * s * 0.26, -s * 0.33], [sd * s * 0.37, -s * 0.48], [sd * s * 0.51, -s * 0.55], [sd * s * 0.6, -s * 0.49]], (u) => s * (0.075 * (1 - u) ** 0.6 + 0.012));
      if (!sil) { g.save(); g.translate(s * 0.014, s * 0.022); g.fillStyle = P.dragonDeep; g.fill(horn); g.restore(); }
      cut(g, horn, sil ? P.ink : mixHex(P.paper2, P.kraft, 0.35), { rim: sil ? null : P.white, rimW: s * 0.02, stroke: sil ? null : P.dragonDeep, lw: s * 0.014 });
      if (!sil) { g.strokeStyle = rgba(P.kraftDark, 0.8); g.lineWidth = s * 0.012; for (let k = 1; k <= 2; k++) { const u = k * 0.3; g.beginPath(); g.arc(sd * s * (0.2 + u * 0.3), -s * (0.18 + u * 0.36), s * 0.05 * (1 - u), 0, Math.PI); g.stroke(); } }
    }
    cut(g, blob(0, 0, s * 0.46, s * 0.36, { seed: 71, amp: 0.02 }), body, { rim: sil ? null : P.dragonWing, rimW: s * 0.025 });
    cut(g, blob(0, s * 0.2, s * 0.32, s * 0.14, { seed: 72, amp: 0.02 }), sil ? P.ink : P.dragonBelly);
    if (!sil) {
      shade(g, blob(0, 0, s * 0.46, s * 0.36, { seed: 71, amp: 0.02 }), P.dragonDeep, 0, -s * 0.1, 0, s * 0.36, 0, 0.45);
      g.fillStyle = dark; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * s * 0.07, s * 0.12, s * 0.025, s * 0.016, 0, 0, TAU); g.fill(); }
      g.strokeStyle = P.ink; g.lineWidth = s * 0.02; g.beginPath(); g.arc(s * 0.02, s * 0.14, s * 0.13, Math.PI * 0.2, Math.PI * 0.75); g.stroke();
    }
    for (const sd of [-1, 1]) {
      const ex = sd * s * 0.19, ey = -s * 0.06, k = 1 - bl * 0.92;
      cut(g, blob(ex, ey, s * 0.085, s * 0.075 * k + 0.5, { seed: 73 + sd }), P.dragonEye);
      if (k > 0.2) { g.fillStyle = P.ink; g.beginPath(); g.ellipse(ex, ey, s * 0.017, s * 0.06 * k, 0, 0, TAU); g.fill(); g.fillStyle = P.white; g.beginPath(); g.arc(ex - s * 0.03, ey - s * 0.03, s * 0.013, 0, TAU); g.fill(); }
      if (!sil) { g.strokeStyle = P.ink; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(ex - sd * s * 0.1, ey - s * 0.12); g.lineTo(ex + sd * s * 0.06, ey - s * 0.09); g.stroke(); }
    }
    if (sil) glow(g, 0, -s * 0.06, s * 0.5, P.dragonEye, 0.25);
  } else if (who === 'baby') {
    // 呆毛（栗色带一缕金）从头顶后面长出来，卷成小圈；小王冠斜戴在头顶
    const curl = ribbon([[-s * 0.02, -s * 0.24], [-s * 0.04, -s * 0.42], [s * 0.04, -s * 0.54], [s * 0.15, -s * 0.5], [s * 0.13, -s * 0.4], [s * 0.05, -s * 0.42]], (u) => s * (0.045 * (1 - u) + 0.012));
    cut(g, curl, P.heroHair);
    cut(g, ribbon([[s * 0.0, -s * 0.46], [s * 0.06, -s * 0.52], [s * 0.13, -s * 0.5]], s * 0.012), P.hairGold);
    cut(g, blob(0, s * 0.05, s * 0.4, s * 0.37, { seed: 81, amp: 0.012 }), P.skin, { rim: mixHex(P.skin, P.white, 0.5), rimW: s * 0.02 });
    shade(g, blob(0, s * 0.05, s * 0.4, s * 0.37, { seed: 81, amp: 0.012 }), P.skinShade, 0, -s * 0.1, 0, s * 0.42, 0, 0.45);
    cut(g, ribbon([[-s * 0.22, -s * 0.28], [-s * 0.1, -s * 0.33], [s * 0.04, -s * 0.31]], s * 0.03), P.heroHair);
    drawFace(g, 0, s * 0.12, s * 0.78, { ...fo, brows: false });
    g.save(); g.translate(s * 0.17, -s * 0.27); g.rotate(0.28);
    const cr = poly([[-s * 0.11, s * 0.04], [-s * 0.13, -s * 0.08], [-s * 0.05, -s * 0.02], [0, -s * 0.12], [s * 0.05, -s * 0.02], [s * 0.13, -s * 0.08], [s * 0.11, s * 0.04]], { amp: 0 });
    cut(g, cr, P.gold, { rim: P.goldLight, rimW: s * 0.015, stroke: P.goldDark, lw: s * 0.012 });
    cut(g, blob(0, -s * 0.01, s * 0.022, s * 0.022, { seed: 82 }), P.red);
    g.restore();
  } else {
    cut(g, blob(0, 0, s * 0.42, s * 0.42, { seed: 91, amp: 0.02 }), P.inkSoft);
    glyphIcon(g, 'question', 0, 0, s * 0.62, { fill: P.paper, edge: null, rim: null });
  }
  g.restore();
}

/** 头像圆框：天色底 + 头像（回调或默认头）+ 金框。portrait = 'hero' 等字符串或 (g,x,y,size)=>{} 回调。 */
export function portraitFrame(g, x, y, r, portrait, o = {}) {
  const t = o.t ?? 0;
  g.save();
  const ring = new Path2D(); ring.arc(x, y, r, 0, TAU);
  g.save(); g.translate(2, 3); g.fillStyle = rgba(P.shadow, 0.35); g.fill(ring); g.restore();
  g.fillStyle = P.gold; g.fill(ring);
  const inner = new Path2D(); inner.arc(x, y, r * 0.86, 0, TAU);
  g.save();
  g.clip(inner);
  const bgc = o.bg ?? P.skyDayLow;
  const grd = g.createLinearGradient(x, y - r, x, y + r);
  grd.addColorStop(0, mixHex(bgc, P.white, 0.4)); grd.addColorStop(1, bgc);
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  if (typeof portrait === 'function') portrait(g, x, y + r * 0.08, r * 1.5);
  else if (portrait) portraitHead(g, portrait, x, y + r * 0.12, r * 1.25, { t, expr: o.expr });
  g.restore();
  g.strokeStyle = P.goldDark; g.lineWidth = 2; g.stroke(inner);
  g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(ring);
  g.save(); g.clip(ring); g.strokeStyle = rgba(P.goldLight, 0.9); g.lineWidth = r * 0.07; g.beginPath(); g.arc(x, y + r * 0.04, r * 0.93, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.restore();
  g.restore();
}

// ———————————————————— 对话框 ————————————————————
/** 撕口两片外翻的纸瓣 + 纸纤维（纸背 paper2）。 */
function tearFlaps(g, notch, tear, t, seed) {
  if (!notch || tear <= 0) return;
  const { x, y0, y1, depth } = notch;
  const flap = Math.sin(t * 13 + seed) * 0.12 * tear + noise1(t * 3, seed) * 0.08 * tear;
  for (const [yy, sd] of [[y0, -1], [y1, 1]]) {
    const L = 22 + 30 * tear;
    const a = sd * (0.55 + flap * sd) * tear;
    const hx = x - depth * 0.22, hy = yy + sd * 2;
    const tip = [hx + Math.cos(a) * L + 8 * tear, hy + Math.sin(a) * L];
    const p = poly([[hx - 6, hy], [x + 2, hy - sd * 1], tip, [hx + L * 0.35, hy + sd * L * 0.3]], { seed: seed + (sd > 0 ? 3 : 1), amp: 1.4, step: 8 });
    g.save(); g.translate(2, 3); g.fillStyle = rgba(P.shadow, 0.3); g.fill(p); g.restore();
    g.fillStyle = P.paper2; g.fill(p);
    g.strokeStyle = rgba(P.inkSoft, 0.85); g.lineWidth = 2; g.stroke(p);
  }
  g.strokeStyle = rgba(P.paper, 0.9); g.lineWidth = 1.3; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const v = hash2(seed + 11, i) * 2 - 1, k = 1 - Math.abs(v) ** 1.6;
    const yy = lerp(y0, y1, (v + 1) / 2), xx = x - depth * k + 2;
    g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 5 + hash2(seed, i) * 8, yy + (hash2(seed + 2, i) - 0.5) * 6); g.stroke();
  }
}

/**
 * RPG 对话框（b04、b05）。
 * o: { rect（默认 (420,690)–(1500,900)）, speaker:'king'|'hero'（头像在说话人一侧：国王右端、勇者左端）, from（翻牌前的说话人）,
 *      tag（名签字，默认 king→「国王」、hero→「？？？」）, tagFrom（翻牌前的名签字）, tagFlip 0..1（翻牌：名签与头像前半压扁、后半展开；
 *      from 与 speaker 不同则头像换边）, portrait（'hero' 等或 (g,x,y,size)=>{} 回调；false 不画）,
 *      text + typed 0..1（打字机，play，每字弹一下）, textSize=64, erase 0..1（字逐个弹走）, cursor（闪烁小三角，周期 0.4s）,
 *      textArea {x, w}（文字区，N1 为 x 600–1384）, bulgeRight 0..1（右框鼓出 40px，可过冲 >1）, tear 0..1 + tearY（右框撕开）,
 *      pop 0..1（outBack 弹起，自下而上）, t（秒）, seed }
 * 返回 { rect, textArea:{x,y,w,h}, portrait:[x,y,r], tear:{x,y0,y1,depth,tearY}|null, cursor:[x,y] }。
 */
export function dialogBox(g, o = {}) {
  const R = o.rect ?? { x: 420, y: 690, w: 1080, h: 210 };
  const t = o.t ?? 0, pop = o.pop ?? 1;
  if (pop <= 0) return null;
  const k = pop >= 1 ? 1 : outBack(clamp(pop), 1.8);
  const speaker = o.speaker ?? 'king';
  const flip = clamp(o.tagFlip ?? 0);
  const from = o.from ?? speaker;
  const cur = flip > 0 && flip < 0.5 ? from : speaker;
  const right = (s) => s === 'king';
  const tagOf = (s, txt) => txt ?? (s === 'king' ? TXT.king : TXT.unknown);
  const pr = 70;
  const portraitAt = (s) => [right(s) ? R.x + R.w - 102 : R.x + 102, R.y + R.h / 2 + 6];
  const ta = o.textArea ? { x: o.textArea.x, w: o.textArea.w } : right(speaker) ? { x: R.x + 70, w: R.w - 290 } : { x: R.x + 220, w: R.w - 290 };
  const textArea = { ...ta, y: R.y + 26, h: R.h - 52 };
  g.save();
  g.globalAlpha *= Math.min(1, pop * 3);
  const cx = R.x + R.w / 2, by = R.y + R.h;
  g.translate(cx, by); g.scale(lerp(0.9, 1, Math.min(1, k)), k); g.translate(-cx, -by);
  const tearY = o.tearY ?? R.y + R.h * 0.5;
  const pan = paperPanel(g, R, { seed: o.seed ?? 11, bulgeR: (o.bulgeRight ?? 0) * 40, tear: o.tear, tearY, cornerSize: 28 });
  tearFlaps(g, pan.notch, clamp(o.tear ?? 0), t, o.seed ?? 11);
  // 头像 + 名签（翻牌）
  const fk = flip > 0 && flip < 1 ? Math.abs(Math.cos(flip * Math.PI)) : 1;
  const [px, py] = portraitAt(cur);
  if (o.portrait !== false) {
    g.save(); g.translate(px, py); g.scale(Math.max(0.02, fk), 1); g.translate(-px, -py);
    const pv = typeof o.portrait === 'function' ? o.portrait : o.portrait ?? (cur === 'king' ? 'king' : 'hero');
    portraitFrame(g, px, py, pr, pv, { t, bg: cur === 'king' ? P.princessLight : P.skyDayLow });
    g.restore();
  }
  const tagTxt = flip > 0 && flip < 0.5 ? tagOf(from, o.tagFrom) : tagOf(speaker, o.tag);
  g.save();
  const tx = right(cur) ? R.x + R.w - 36 : R.x + 36;
  g.translate(tx, R.y + 2); g.scale(1, Math.max(0.02, fk)); g.translate(-tx, -(R.y + 2));
  nameTab(g, tagTxt, tx, R.y + 2, { size: 34, anchor: right(cur) ? 'right' : 'left' });
  g.restore();
  // 文字
  if (o.text) {
    const size = o.textSize ?? 64, arr = [...o.text], n = arr.length;
    const typed = clamp(o.typed ?? 1), er = clamp(o.erase ?? 0);
    const yy = R.y + R.h / 2 + 8;
    glyphRow(g, arr, textArea.x, yy, size, {
      family: 'play', fill: P.ink, edge: null, gap: 2,
      appear: arr.map((_, i) => clamp(typed * n - i)),
      perChar: (i) => { const e = clamp(er * (n + 1) - i); return e > 0 ? { scale: 1 + e * 0.6, alpha: 1 - e, dy: -e * 60, rot: (hash2(i, 7) - 0.5) * e * 1.2 } : {}; },
    });
  }
  let cursorAt = [R.x + R.w - 58, R.y + R.h - 38];
  if (right(speaker) && o.portrait !== false) cursorAt = [R.x + R.w - 200, R.y + R.h - 34];
  if (o.cursor) {
    const ph = (t % 0.4) / 0.4;
    if (ph < 0.62) glyphIcon(g, 'triDown', cursorAt[0], cursorAt[1] + Math.sin(ph * Math.PI) * 4, 26, { fill: P.red });
  }
  g.restore();
  return { rect: R, textArea, portrait: [px, py, pr], tear: pan.notch, cursor: cursorAt };
}

// ———————————————————— 气泡 ————————————————————
function bubbleBody(shape, cx, cy, w, h, seed, t) {
  const rx = w / 2, ry = h / 2;
  if (shape === 'round') return blob(cx, cy, rx, ry, { seed, amp: 0.014, n: 64 });
  if (shape === 'soft') return blob(cx, cy, rx, ry, { seed, amp: 0.045 + 0.01 * Math.sin(t * 3), n: 56, freq: 2 });
  const pts = [];
  if (shape === 'cloud') {
    const n = Math.max(7, Math.round((w + h) / 70));
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, b = Math.abs(Math.sin((a * n) / 2 + seed)) ** 0.55;
      const k = 0.84 + 0.16 * b;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pathOf(pts);
  }
  if (shape === 'jagged') {
    const n = Math.max(12, Math.round((w + h) / 38));
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU + 0.12;
      const fl = noise1(t * 2.2 + i * 0.7, seed) * 0.03;
      const k = i % 2 ? 0.8 + hash2(seed, i) * 0.05 : 1.0 + hash2(seed + 1, i) * 0.16 + fl;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pathOf(pts);
  }
  // flame：向上飘的火舌边
  const n = Math.max(10, Math.round((w + h) / 46));
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU;
    const fl = noise1(t * 4 + i * 1.3, seed);
    const lean = -0.55;
    const tipR = 1.12 + 0.08 * hash2(seed, i) + 0.06 * fl;
    const tip = [cx + Math.cos(a1) * rx * tipR + Math.sin(lean) * rx * 0.05, cy + Math.sin(a1) * ry * tipR - ry * 0.1 * (1 + fl * 0.5) * (Math.sin(a1) < 0 ? 1.4 : 0.4)];
    const v0 = [cx + Math.cos(a0) * rx * 0.88, cy + Math.sin(a0) * ry * 0.88];
    if (i === 0) { p.moveTo(v0[0], v0[1]); continue; }
    const aPrev = ((i - 0.5) / n) * TAU;
    const tipPrev = [cx + Math.cos(aPrev) * rx * tipR, cy + Math.sin(aPrev) * ry * tipR - ry * 0.1 * (Math.sin(aPrev) < 0 ? 1.4 : 0.4)];
    p.quadraticCurveTo(lerp(tipPrev[0], v0[0], 0.3), lerp(tipPrev[1], v0[1], 0.1), v0[0], v0[1]);
    if (i < n) p.quadraticCurveTo(lerp(v0[0], tip[0], 0.75), lerp(v0[1], tip[1], 0.25), tip[0], tip[1]);
  }
  p.closePath();
  return p;
}
function bubbleTail(shape, cx, cy, w, h, tip, seed) {
  if (!tip) return null;
  const rx = w / 2, ry = h / 2;
  const ang = Math.atan2((tip[1] - cy) / ry, (tip[0] - cx) / rx);
  const half = shape === 'jagged' || shape === 'flame' ? 0.16 : 0.2;
  const b1 = [cx + Math.cos(ang - half) * rx * 0.85, cy + Math.sin(ang - half) * ry * 0.85];
  const b2 = [cx + Math.cos(ang + half) * rx * 0.85, cy + Math.sin(ang + half) * ry * 0.85];
  const p = new Path2D();
  if (shape === 'jagged' || shape === 'flame') {
    const mid = [lerp(b1[0], tip[0], 0.55), lerp(b1[1], tip[1], 0.55)];
    const nx = -(tip[1] - cy), ny = tip[0] - cx, nl = Math.hypot(nx, ny) || 1;
    p.moveTo(b1[0], b1[1]); p.lineTo(mid[0] + (nx / nl) * 12, mid[1] + (ny / nl) * 12); p.lineTo(tip[0], tip[1]); p.lineTo(b2[0], b2[1]); p.closePath();
    return p;
  }
  const mx = (b1[0] + b2[0]) / 2, my = (b1[1] + b2[1]) / 2;
  const dx = tip[0] - mx, dy = tip[1] - my, L = Math.hypot(dx, dy) || 1;
  const bend = 0.18 * L, nx = -dy / L, ny = dx / L;
  p.moveTo(b1[0], b1[1]);
  p.quadraticCurveTo(mx + dx * 0.55 + nx * bend, my + dy * 0.55 + ny * bend, tip[0], tip[1]);
  p.quadraticCurveTo(mx + dx * 0.45 + nx * bend * 0.4, my + dy * 0.45 + ny * bend * 0.4, b2[0], b2[1]);
  p.closePath();
  return p;
}

/**
 * 对白气泡（全片）。
 * o: { x, y（泡心）, w=360, h=190, shape:'round'|'jagged'|'cloud'|'flame'|'soft', text（≤5 字）, tail:[x,y]（泡尾指向的点）,
 *      pop 0..1（outBack，从泡尾长出）, mirror（K1 / Q1 镜像：泡形左右翻转，字不翻）, t（锯齿 / 火焰抖动）, seed,
 *      fill / line / lw（泡色、墨线）, textSize, textFamily（默认 round/soft/cloud 用 play，jagged/flame 用 display）, textFill, textEdge }
 * 返回 { x, y, w, h, tail }。
 */
export function bubble(g, o = {}) {
  const pop = o.pop ?? 1;
  if (pop <= 0) return null;
  const shape = o.shape ?? 'round', t = o.t ?? 0, seed = o.seed ?? 5;
  const w = o.w ?? 360, h = o.h ?? 190, cx = o.x ?? 960, cy = o.y ?? 400;
  const tail = o.tail ?? null;
  const k = pop >= 1 ? 1 : outBack(clamp(pop), 2);
  const loud = shape === 'jagged' || shape === 'flame';
  const fill = o.fill ?? (shape === 'flame' ? P.fire2 : P.paper);
  const line = o.line ?? (shape === 'flame' ? P.fireDeep : shape === 'soft' ? P.inkSoft : P.ink);
  const lw = o.lw ?? (shape === 'soft' ? 3 : loud ? 5 : 4);
  const ax = tail ? tail[0] : cx, ay = tail ? tail[1] : cy + h / 2;
  g.save();
  g.globalAlpha *= Math.min(1, pop * 4);
  g.translate(ax, ay); g.scale(k, k); g.translate(-ax, -ay);
  g.save();
  let tl = tail;
  if (o.mirror) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); if (tail) tl = [2 * cx - tail[0], tail[1]]; }
  const body = bubbleBody(shape, cx, cy, w, h, seed, t);
  const tp = shape === 'cloud' ? null : bubbleTail(shape, cx, cy, w, h, tl, seed);
  g.lineJoin = 'round'; g.lineCap = 'round';
  // 暗色错位底片
  g.save(); g.translate(4, 6); g.fillStyle = rgba(P.shadow, 0.22); g.fill(body); if (tp) g.fill(tp); g.restore();
  // 云朵尾巴：三颗小圆
  if (shape === 'cloud' && tl) {
    for (let i = 0; i < 3; i++) {
      const u = 0.45 + i * 0.22, r = (Math.min(w, h) * 0.13) * (1 - i * 0.28);
      const ex = cx + (tl[0] - cx) * u, ey = cy + (tl[1] - cy) * u;
      const c = blob(ex, ey, r, r * 0.9, { seed: seed + i });
      g.strokeStyle = line; g.lineWidth = lw * 2; g.stroke(c); g.fillStyle = fill; g.fill(c);
    }
  }
  g.strokeStyle = line; g.lineWidth = lw * 2;
  g.stroke(body); if (tp) g.stroke(tp);
  g.fillStyle = fill; if (tp) g.fill(tp); g.fill(body);
  if (shape === 'flame') { g.save(); g.clip(body); g.fillStyle = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55); const gr = g.fillStyle; gr.addColorStop(0, rgba(P.white, 0.55)); gr.addColorStop(0.6, rgba(P.fire2, 0)); gr.addColorStop(1, rgba(P.fire, 0.55)); g.fillRect(cx - w, cy - h, w * 2, h * 2); g.restore(); }
  else { g.save(); g.clip(body); g.fillStyle = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); const gr = g.fillStyle; gr.addColorStop(0, rgba(P.white, 0.45)); gr.addColorStop(0.3, rgba(P.white, 0)); gr.addColorStop(1, rgba(P.kraft, 0.25)); g.fillRect(cx - w, cy - h, w * 2, h * 2); g.restore(); }
  g.restore();
  if (o.text) {
    const arr = [...o.text], n = arr.length;
    const fam = o.textFamily ?? (loud ? 'display' : 'play');
    const adv = fam === 'display' ? 0.78 : 0.93;
    const size = o.textSize ?? Math.min(h * (loud ? 0.42 : 0.38), (w * (loud ? 0.62 : 0.72)) / (n * adv));
    const ap = arr.map((_, i) => clamp((pop - 0.25 - i * 0.07) / 0.35));
    const opt = loud
      ? { style: 'cut', fill: o.textFill ?? (shape === 'flame' ? P.redDeep : P.red), edge: o.textEdge ?? (shape === 'flame' ? P.goldLight : P.paper), under: shape === 'flame' ? P.fireDeep : P.redDeep }
      : { family: fam, fill: o.textFill ?? P.ink, edge: o.textEdge ?? null };
    glyphRow(g, arr, cx, cy + (loud ? 0 : size * 0.02), size, { ...opt, family: fam, align: 'center', gap: size * 0.02, appear: pop >= 1 ? undefined : ap,
      perChar: loud ? (i) => ({ rot: (hash2(seed + 3, i) - 0.5) * 0.18, dy: noise1(t * 9 + i * 2, seed) * 2.5 }) : undefined });
  }
  g.restore();
  return { x: cx, y: cy, w, h, tail };
}

/**
 * 思考泡：云朵泡 + 三个路径圆点依次弹出（b04 38.40 / 38.70 / 39.00）。
 * o: { x, y, w=240, h=150, tail:[x,y], pop 0..1, dots:[p0,p1,p2]（各自 0..1）或 t + at:[t0,t1,t2], mirror, seed }
 */
export function thinkDots(g, o = {}) {
  const w = o.w ?? 240, h = o.h ?? 150, x = o.x ?? 960, y = o.y ?? 400;
  const res = bubble(g, { ...o, shape: 'cloud', text: null, w, h, x, y });
  if (!res) return null;
  const k = (o.pop ?? 1) >= 1 ? 1 : outBack(clamp(o.pop ?? 1), 2);
  const dots = o.dots ?? (o.at ? o.at.map((a) => clamp(((o.t ?? 0) - a) / 0.2)) : [1, 1, 1]);
  const ax = o.tail ? o.tail[0] : x, ay = o.tail ? o.tail[1] : y + h / 2;
  g.save();
  g.translate(ax, ay); g.scale(k, k); g.translate(-ax, -ay);
  for (let i = 0; i < 3; i++) {
    const d = clamp(dots[i] ?? 0);
    if (d <= 0) continue;
    glyphIcon(g, 'dot', x + (i - 1) * w * 0.22, y - Math.sin(d * Math.PI) * 6, w * 0.2, { scale: outBack(d, 2.6) });
  }
  g.restore();
  return res;
}

// ———————————————————— 取名面板 ————————————————————
/** 一块字母牌（N2、O06 用；面板内外共用，K2 背景里飘落的牌也用它）。(x,y) 牌中心；size = 字号（牌边 1.2×）。 */
export function nameTile(g, ch, x, y, size = 86, o = {}) {
  return paperGlyph(g, ch, x, y, size, { style: 'tile', ...o });
}

/**
 * 吊线取名面板（b05 N2、b16 O05–O06、b17 O07）。
 * o: { rect（默认 (440,250)–(1480,620)）, label（「取名」）, slots=8, tiles:[{ch, p（落入进度 0..1）, squashX}] 或字符串,
 *      counter（数字或「13/8」字符串；默认按已落下的牌数；超出格数变红）, counterPop 0..1,
 *      full 0..1（满格泛金光）, overTag 0..1（「字数超限！」闪三次后常亮）, bulge 0..1（外框鼓成气球）,
 *      strings:{left, right}（断绳时刻，配 t）, swing（度，左绳断后绕右吊点甩下，正 = 左端下坠）, drop 0..1（坠出画面）,
 *      popFrames 0..（格框像扣子一样崩飞 + 牌弹回原宽散开；>1 继续慢慢下落）, popSwing（崩飞瞬间的 swing，默认当前）,
 *      foldEmpty 0..1（空格从右往左折起收走）, contract 0..1（外框收拢到 keep=3 格并居中）, glowOk 0..1（meadow + gold 光）,
 *      cursor（光标所在格序号，闪烁）, tagBelow（「全名」小签 + 小三角，true 或 {text}）, yank 0..1, ropeTop（吊线上端 y，默认 −40）, t, seed }
 * 返回 { rect（当前外框，未含甩动变换）, slots:[{x,y}], tiles:[{x,y,sx}], pivot:[x,y], tag:[x,y]|null }。
 */
export function namePanel(g, o = {}) {
  const R0 = o.rect ?? { x: 440, y: 250, w: 1040, h: 370 };
  const t = o.t ?? 0, seed = o.seed ?? 17;
  const NS = o.slots ?? 8, keep = o.keep ?? 3, SW = 112, SH = 124, SG = 12;
  const rowW = NS * SW + (NS - 1) * SG;
  const cxP = R0.x + R0.w / 2;
  const ck = ease(inOutSine, o.contract ?? 0);
  const keepW = keep * SW + (keep - 1) * SG + 64;
  const W = lerp(R0.w, keepW, ck), X = cxP - W / 2, Y = R0.y, H = R0.h;
  const rowX0 = R0.x + (R0.w - rowW) / 2, rowY = R0.y + 150;
  const slotX = (i) => {
    const a = rowX0 + SW / 2 + i * (SW + SG);
    const b = cxP + (i - (keep - 1) / 2) * (SW + SG);
    return i < keep ? lerp(a, b, ck) : a;
  };
  const tiles = (typeof o.tiles === 'string' ? [...o.tiles].map((ch) => ({ ch, p: 1 })) : o.tiles ?? []);
  const nT = tiles.length;
  // 绳与甩动
  const brokeL = o.strings && o.strings.left != null && t >= o.strings.left;
  const brokeR = o.strings && o.strings.right != null && t >= o.strings.right;
  const attachL = [X + 70, Y], attachR = [X + W - 70, Y];
  const pivot = attachR;
  const swing = ((o.swing ?? 0) * Math.PI) / 180;
  const drop = clamp(o.drop ?? 0);
  const ropeTop = o.ropeTop ?? -40;
  g.save();
  // —— 绳子（不随面板转：上端固定）
  const rope = (x0, y0, x1, y1, sway) => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(lerp(x0, x1, 0.5) + sway, lerp(y0, y1, 0.5), x1, y1); g.stroke(); };
  g.strokeStyle = P.inkSoft; g.lineWidth = 3; g.lineCap = 'round';
  const swayT = Math.sin(t * 2.1) * 3;
  if (!brokeL) rope(attachL[0], ropeTop, attachL[0], attachL[1], swayT);
  else { const k = clamp((t - o.strings.left) / 0.5); rope(attachL[0], ropeTop, attachL[0] + Math.sin(k * 9) * 30 * (1 - k), ropeTop + 120 + 90 * k, 20 * (1 - k)); }
  if (!brokeR) {
    if (drop <= 0) rope(attachR[0], ropeTop, attachR[0], attachR[1], swayT);
  } else { const k = clamp((t - o.strings.right) / 0.5); rope(attachR[0], ropeTop, attachR[0] + Math.sin(k * 9) * 30 * (1 - k), ropeTop + 120 + 90 * k, -20 * (1 - k)); }
  // —— 面板整体变换：绕右吊点甩动 + 坠落
  const panelTf = (gg) => {
    gg.translate(pivot[0], pivot[1]);
    gg.rotate(-swing);
    if (drop > 0) { gg.translate(-W / 2, H / 2); gg.translate(0, inQuad(drop) * 1300); gg.rotate(-drop * 1.1); gg.translate(W / 2, -H / 2); }
    gg.translate(-pivot[0], -pivot[1]);
  };
  const pf = Math.max(0, o.popFrames ?? 0);
  const foldE = clamp(o.foldEmpty ?? 0);
  const full = clamp(o.full ?? 0);
  g.save();
  panelTf(g);
  // —— 外框
  const bul = clamp(o.bulge ?? 0);
  const glowOk = clamp(o.glowOk ?? 0);
  if (glowOk > 0) { glow(g, cxP, Y + H / 2, W * 0.75, P.meadow, glowOk * 0.5); glow(g, cxP, Y + H / 2, W * 0.5, P.goldLight, glowOk * 0.6); }
  paperPanel(g, { x: X, y: Y, w: W, h: H }, { seed, bulge: bul, cornerSize: 30 });
  if (glowOk > 0) { g.save(); g.strokeStyle = rgba(P.gold, glowOk); g.lineWidth = 6; g.stroke(rr(X + 6, Y + 6, W - 12, H - 12, 14)); g.restore(); }
  // 吊环
  for (const a of [attachL, attachR]) { g.fillStyle = P.goldDark; g.beginPath(); g.arc(a[0], a[1] + 14, 9, 0, TAU); g.fill(); g.fillStyle = P.gold; g.beginPath(); g.arc(a[0], a[1] + 13, 6, 0, TAU); g.fill(); g.fillStyle = P.paper; g.beginPath(); g.arc(a[0], a[1] + 13, 2.6, 0, TAU); g.fill(); }
  // 标签与计数
  nameTab(g, o.label ?? TXT.naming, X + 34, Y + 70, { size: 42 });
  const nLanded = tiles.filter((q) => (q.p ?? 1) >= 0.55).length;
  const cnt = o.counter ?? nLanded;
  const cTxt = typeof cnt === 'string' ? cnt : `${cnt}/${NS}`;
  const over = typeof cnt === 'number' ? cnt > NS : parseInt(cTxt, 10) > NS;
  const cp = clamp(o.counterPop ?? 0);
  const csz = 54 * (1 + 0.35 * Math.sin(cp * Math.PI));
  const cw = uiWidth(g, cTxt, csz, { family: 'latin', weight: 700 });
  const shakeX = over ? noise1(t * 30, seed) * 3 : 0;
  uiText(g, cTxt, X + W - 44 - cw + shakeX, Y + 70, csz, { family: 'latin', weight: 700, fill: over ? P.red : P.ink, style: 'cut', edge: P.paper, edgeW: 0.08, under: over ? P.redDeep : rgba(P.shadow, 0.35), rim: null });
  // 分隔缝线
  g.save(); g.setLineDash([6, 6]); g.strokeStyle = rgba(P.kraftDark, 0.8); g.lineWidth = 2;
  g.beginPath(); g.moveTo(X + 40, Y + 120); g.lineTo(X + W - 40, Y + 120); g.stroke(); g.restore();
  // —— 格框（可折起；崩飞后改在世界坐标里画）
  const drawSlot = (sx, sy, rot, fx, a, cur) => {
    g.save();
    g.globalAlpha *= a;
    g.translate(sx - (fx < 1 ? (SW / 2) * (1 - fx) : 0), sy);
    g.rotate(rot);
    g.scale(fx, 1);
    const fr = rr(-SW / 2, -SH / 2, SW, SH, 10);
    g.fillStyle = mixHex(P.kraft, P.paper2, 0.4); g.fill(fr);
    shade(g, fr, P.kraftDark, 0, -SH / 2, 0, -SH / 2 + 26, 0.55, 0);
    if (fx < 1) shade(g, fr, P.ink, -SW / 2, 0, SW / 2, 0, 0.05, 0.4 * (1 - fx));
    g.strokeStyle = P.kraftDark; g.lineWidth = 3; g.stroke(fr);
    g.strokeStyle = rgba(P.ink, 0.5); g.lineWidth = 1.5; g.stroke(rr(-SW / 2 + 5, -SH / 2 + 5, SW - 10, SH - 10, 7));
    if (full > 0) { g.strokeStyle = rgba(P.gold, full); g.lineWidth = 5; g.stroke(fr); glow(g, 0, 0, SW * 0.9, P.goldLight, full * 0.45); }
    if (cur) { g.fillStyle = P.red; g.fillRect(-SW * 0.3, SH * 0.3, SW * 0.6, 6); }
    g.restore();
  };
  const slotsOut = [];
  const popSlots = [];
  for (let i = 0; i < NS; i++) {
    const sx = slotX(i), sy = rowY + SH / 2;
    let a = 1, fx = 1;
    if (i >= keep && foldE > 0) fx = 1 - inOutSine(clamp(foldE * (NS - keep) - (NS - 1 - i)));
    if (i >= keep && ck > 0) a = 1 - ck;
    slotsOut.push({ x: sx, y: sy });
    if (fx <= 0.01 || a <= 0) continue;
    if (pf > 0) { popSlots.push([i, sx, sy]); continue; }
    drawSlot(sx, sy, 0, fx, a, o.cursor === i && t % 0.5 < 0.3);
  }
  // —— 字母牌：≤ 格数时一格一块；超出时全部按比例挤进格排（scaleX 压扁），新牌从右端硬挤进来
  let extra = 0;
  for (let i = NS; i < nT; i++) extra += clamp((tiles[i].p ?? 1) * 1.6);
  const eff = NS + extra;
  const pitch = (rowW + SG) / eff;
  const tilesOut = [];
  const popTiles = [];
  for (let i = 0; i < nT; i++) {
    const q = tiles[i], p = clamp(q.p ?? 1);
    if (p <= 0) { tilesOut.push(null); continue; }
    let tx, sxq;
    if (nT > NS && extra > 0) { tx = rowX0 - SG / 2 + pitch * (i + 0.5); sxq = Math.min(1, pitch / (SW + SG)); }
    else { tx = slotX(i); sxq = 1; }
    if (q.squashX != null) sxq = q.squashX;
    // 落入：0..0.55 加速下落并按进格里 10px，之后带阻尼弹回；落地瞬间压扁
    const u1 = clamp(p / 0.55), u2 = clamp((p - 0.55) / 0.45);
    const off = p < 0.55 ? lerp(-200, 10, inQuad(u1)) : 10 * (1 - u2) * Math.cos(u2 * Math.PI * 2.5);
    const ty = rowY + SH / 2 + off;
    const land = p >= 0.55 ? Math.exp(-u2 * 5) : 0;
    const sy = 1 - 0.16 * land, sxx = sxq * (1 + 0.1 * land), a = Math.min(1, p * 4);
    tilesOut.push({ x: tx, y: ty, sx: sxx });
    if (pf > 0) { popTiles.push([i, q.ch, tx, ty, sxq]); continue; }
    nameTile(g, q.ch, tx, ty, 86, { squashX: sxx, squashY: sy, alpha: a });
  }
  // —— 「字数超限！」闪三次后常亮
  const ov = clamp(o.overTag ?? 0);
  if (ov > 0) {
    const on = ov >= 1 || (ov * 3) % 1 < 0.62;
    if (on) {
      const k2 = ov >= 1 ? 1 : 1 + 0.15 * Math.sin(((ov * 3) % 1) * Math.PI);
      g.save(); g.translate(X + W * 0.6, Y + 66); g.rotate(-0.05); g.scale(k2, k2);
      const lab = TXT.over, sz = 40, tw = uiWidth(g, lab, sz);
      const st = poly([[-tw / 2 - 26, -36], [tw / 2 + 26, -32], [tw / 2 + 20, 34], [-tw / 2 - 22, 30]], { seed: seed + 9, amp: 2.5, step: 14 });
      g.save(); g.translate(3, 4); g.fillStyle = P.redDeep; g.fill(st); g.restore();
      cut(g, st, P.red, { rim: mixHex(P.red, P.white, 0.4), rimW: 2 });
      g.strokeStyle = P.paper; g.lineWidth = 3; g.setLineDash([7, 5]); g.stroke(st); g.setLineDash([]);
      uiText(g, lab, -tw / 2, 2, sz, { fill: P.paper });
      g.restore();
    }
  }
  // —— 「全名」下拉小签
  let tagPos = null;
  if (o.tagBelow) {
    const yk = clamp(o.yank ?? 0);
    const pull = Math.sin(yk * Math.PI) * 46;
    const sw_ = Math.sin(t * 2.4) * 4;
    const tx = cxP, ty0 = Y + H, len = 70 + pull;
    g.strokeStyle = P.inkSoft; g.lineWidth = 2.5; g.beginPath(); g.moveTo(tx, ty0); g.lineTo(tx + sw_, ty0 + len); g.stroke();
    const txt = (o.tagBelow && o.tagBelow.text) || TXT.fullName;
    const r = nameTab(g, txt, tx + sw_, ty0 + len + 26, { size: 34, anchor: 'center', rot: sw_ * 0.012 });
    tagPos = [tx, ty0 + len + 26];
    glyphIcon(g, 'triDown', tx + sw_, r.y + r.h + 22 + Math.sin(t * 5) * 3, 26, { fill: P.red });
  }
  g.restore();
  // —— 崩飞：格框与字母牌脱离面板，在世界坐标里按崩飞瞬间的甩角起飞（重力向下）
  if (pf > 0) {
    const a0 = ((o.popSwing ?? o.swing ?? 0) * Math.PI) / 180;
    const c0 = Math.cos(-a0), s0 = Math.sin(-a0);
    const toW = (lx, ly) => { const dx = lx - pivot[0], dy = ly - pivot[1]; return [pivot[0] + dx * c0 - dy * s0, pivot[1] + dx * s0 + dy * c0]; };
    const cen = toW(cxP, rowY + SH / 2);
    const tau = pf * 0.9;
    for (const [i, sx, sy] of popSlots) {
      const [wx, wy] = toW(sx, sy);
      const dx = wx - cen[0], dy = wy - cen[1], dl = Math.hypot(dx, dy) || 1;
      const vx = (dx / dl) * 300 + (hash2(seed, i) - 0.5) * 180, vy = (dy / dl) * 140 - 380 - hash2(seed + 1, i) * 240;
      const a = clamp(1.6 - pf * 0.6);
      if (a > 0) drawSlot(wx + vx * tau, wy + vy * tau + 0.5 * 1500 * tau * tau, -a0 + (hash2(seed + 2, i) - 0.5) * 9 * tau, 1, a, false);
    }
    const spr = clamp(1 - Math.exp(-pf * 7) * Math.cos(pf * 16));
    const tau2 = Math.max(0, pf - 0.15) * 0.8;
    for (const [i, ch, tx, ty, sxq] of popTiles) {
      const fullX = cxP + (i - (nT - 1) / 2) * (SW + SG) * 0.98;
      const [wx, wy] = toW(lerp(tx, fullX, spr), ty);
      const px = wx + (hash2(seed + 5, i) - 0.5) * 140 * tau2;
      const py = wy + (-120 - hash2(seed + 6, i) * 90) * tau2 + 0.5 * 300 * tau2 * tau2;
      nameTile(g, ch, px, py, 86, { squashX: lerp(sxq, 1, clamp(spr * 1.1)), rot: -a0 + (hash2(seed + 7, i) - 0.5) * 1.6 * tau2 });
    }
  }
  g.restore();
  return { rect: { x: X, y: Y, w: W, h: H }, slots: slotsOut, tiles: tilesOut, pivot, tag: tagPos };
}

// ———————————————————— 旅途 HUD ————————————————————
/** HUD 布局常量（屏幕坐标）。expBarBig 默认从 exp 矩形弹出。 */
export const HUD_LAYOUT = {
  card: { x: 96, y: 72, w: 504, h: 160 },
  portrait: [178, 152, 58],
  name: { x: 248, y: 90, w: 340, h: 48 },
  hearts: { x: 268, y: 168, pitch: 38, size: 34 },
  bag: [566, 168],
  lv: [256, 208],
  exp: { x: 330, y: 202, w: 130, h: 12 },
  coin: [482, 208],
};

/**
 * 金币翻页计数牌：coin 图标 + 「×」 + 翻页数字牌。
 * o: { x, y（左端中点）, value（不给则 = flipAt 里 ≤ t 的个数）, flipAt:[]（每枚到达时翻一格）, t, size=34（数字高）,
 *      bounceAt（大弹一下 1.6→1 + 一圈火花的时刻）, icon=true, alpha }
 * 返回 { coin:[x,y]（图标中心：飞来的金币对准这里）, w }。
 */
export function coinCounter(g, o = {}) {
  const t = o.t ?? 0, size = o.size ?? 34, x = o.x ?? 482, y = o.y ?? 208;
  const flips = o.flipAt ?? [];
  const value = o.value ?? flips.filter((f) => t >= f).length;
  let lastFlip = -1;
  for (const f of flips) if (t >= f) lastFlip = Math.max(lastFlip, f);
  const fp = lastFlip >= 0 ? clamp((t - lastFlip) / 0.16) : 1;
  const prev = o.value != null ? Math.max(0, value - 1) : flips.filter((f) => t >= f && f < lastFlip).length;
  const digits = String(value).split(''), pdig = String(prev).padStart(digits.length, ' ').split('');
  const cw = size * 0.72, ch = size * 1.12, gap = 3;
  const iconS = size * 1.05;
  const xs = o.icon === false ? 0 : iconS + 6;
  const timesW = size * 0.56;
  const totalW = xs + timesW + digits.length * (cw + gap);
  const bk = o.bounceAt != null && t >= o.bounceAt ? Math.exp(-(t - o.bounceAt) / 0.18) : 0;
  const sc = 1 + 0.6 * bk * Math.cos((t - (o.bounceAt ?? 0)) * 14) * (bk > 0 ? 1 : 0);
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.translate(x + totalW / 2, y); g.scale(Math.max(0.3, sc), Math.max(0.3, sc)); g.translate(-(x + totalW / 2), -y);
  const coinPos = [x + iconS / 2, y];
  if (o.icon !== false) glyphIcon(g, 'coin', coinPos[0], y, iconS, { spin: fp < 1 ? (1 - fp) * Math.PI * 2 : 0 });
  uiText(g, '×', x + xs, y + size * 0.06, size * 0.78, { family: 'latin', weight: 700, fill: P.ink });
  let dx = x + xs + timesW;
  for (let i = 0; i < digits.length; i++) {
    const cxD = dx + cw / 2;
    const changed = fp < 1 && digits[i] !== pdig[i];
    const card = rr(dx, y - ch / 2, cw, ch, 5);
    g.save(); g.translate(1.5, 2.5); g.fillStyle = rgba(P.shadow, 0.4); g.fill(card); g.restore();
    g.fillStyle = mixHex(P.ink, P.redDeep, 0.2); g.fill(card);
    const drawD = (d, half, sy = 1) => {
      if (d === ' ') return;
      g.save();
      g.beginPath(); g.rect(dx - 2, half < 0 ? y - ch / 2 - 2 : y, cw + 4, ch / 2 + 2); g.clip();
      g.translate(cxD, y); g.scale(1, sy); g.translate(-cxD, -y);
      paperGlyph(g, d, cxD, y, size * 0.92, { family: 'latin', weight: 700, fill: P.paper, edge: null });
      g.restore();
    };
    if (!changed) { drawD(digits[i], -1); drawD(digits[i], 1); }
    else {
      drawD(digits[i], -1);
      drawD(pdig[i], 1);
      if (fp < 0.5) drawD(pdig[i], -1, 1 - fp * 2);
      else drawD(digits[i], 1, (fp - 0.5) * 2);
    }
    g.strokeStyle = rgba(P.ink, 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(dx, y); g.lineTo(dx + cw, y); g.stroke();
    g.fillStyle = rgba(P.white, 0.12); g.fill(rr(dx + 2, y - ch / 2 + 2, cw - 4, ch * 0.22, 3));
    dx += cw + gap;
  }
  g.restore();
  if (bk > 0.02) {
    const age = t - o.bounceAt;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3, d = 20 + age * 260, cxs = x + totalW / 2;
      glyphIcon(g, 'sparkle4', cxs + Math.cos(a) * d * 1.3, y + Math.sin(a) * d * 0.8, 18 * bk + 4, { alpha: bk, rot: age * 4 });
    }
  }
  return { coin: coinPos, w: totalW };
}

/**
 * 旅途 HUD：左上角色卡 x 96–600、y 72–232（不画小地图，小地图交给 map.drawMiniMap）。
 * state（= journey.hudState(T)，并可附加动画字段）：
 *   { show 0..1（从左滑入 / 滑出）, lv, nameReveal（露几个字，6..13）, hearts（0..5，可 .5）, coins, bag（道具数）,
 *     exp（0..1，或 {v, big}；big 0..1 = 已弹出到 expBarBig 的程度，小条随之隐去）,
 *     t（秒）, crackAt:[5]（各颗心裂开时刻）, coinFlipAt:[], coinBounceAt, heartFlashAt（全部心闪一下）, shiverAt（心打哆嗦起始时刻）,
 *     lvPopAt（LV 数字弹一下）, revealAt（名字牌刚多露一字的时刻：新字弹入）, bagAt:[]（背包鼓一下的时刻）, portrait（'hero' 或回调）, expr }
 *   也直接认 journey.hudState(T) 的字段：coinAt / coinBounce / expBig / heartFlash / heartShiver（0..1 强度）/ levelUpAt；
 *   crackAt 长度 < 5 时按时间先后从右往左作用（hudState 的 4 次受伤）。用法：drawHUD(g, { ...hudState(T), t: T })。
 * 返回锚点 { portrait:[x,y], coin:[x,y], bag:[x,y], hearts:[[x,y]×5], exp:{x,y,w,h}, name:{x,y,w,h} }。
 */
export function drawHUD(g, state = {}) {
  const s = state, t = s.t ?? 0;
  const show = s.show ?? 1;
  const L = HUD_LAYOUT, C = L.card;
  const anchors = { portrait: [L.portrait[0], L.portrait[1]], coin: [L.coin[0] + 18, L.coin[1]], bag: L.bag, hearts: [], exp: L.exp, name: L.name };
  for (let i = 0; i < 5; i++) anchors.hearts.push([L.hearts.x + i * L.hearts.pitch, L.hearts.y]);
  if (show <= 0) return anchors;
  const k = show >= 1 ? 1 : outBack(clamp(show), 1.3);
  const dx = -(C.x + C.w + 40) * (1 - k);
  g.save();
  g.translate(dx, 0);
  paperPanel(g, C, { seed: 21, r: 18, cornerSize: 20 });
  portraitFrame(g, L.portrait[0], L.portrait[1], L.portrait[2], s.portrait ?? 'hero', { t, expr: s.expr });
  // 名字牌：露 nameReveal 个字 + 省略号（路径三点）
  const NR = L.name;
  const plate = poly([[NR.x, NR.y], [NR.x + NR.w, NR.y], [NR.x + NR.w, NR.y + NR.h], [NR.x, NR.y + NR.h]], { seed: 23, amp: 0.8, step: 22 });
  g.save(); g.translate(2, 3); g.fillStyle = P.redDeep; g.fill(plate); g.restore();
  cut(g, plate, P.red, { rim: mixHex(P.red, P.white, 0.4), rimW: 2 });
  g.save(); g.setLineDash([5, 4]); g.strokeStyle = rgba(P.paper, 0.5); g.lineWidth = 1.5; g.strokeRect(NR.x + 5, NR.y + 5, NR.w - 10, NR.h - 10); g.restore();
  const hero = charsOf('hero');
  const nr = clamp(Math.round(s.nameReveal ?? 6), 0, hero.length);
  const nsz = 44, nadv = glyphWidth(g, hero[0], nsz);
  // 兼容 journey.hudState(T) 的字段名：levelUpAt → revealAt / lvPopAt，coinAt / coinBounce，heartFlash / heartShiver（0..1 强度），expBig
  const revealAt = s.revealAt ?? s.levelUpAt;
  const pop = revealAt != null && t >= revealAt ? Math.exp(-(t - revealAt) / 0.22) : 0;
  g.save(); g.clip(plate);
  glyphRow(g, hero.slice(0, nr), NR.x + 12, NR.y + NR.h / 2 + 1, nsz, {
    fill: P.paper, edge: null, gap: 0,
    perChar: (i) => (i === nr - 1 && pop > 0 ? { scale: 1 + 0.16 * pop * Math.cos((t - revealAt) * 18), fill: mixHex(P.paper, P.goldLight, pop) } : {}),
  });
  g.restore();
  if (pop > 0.05) glow(g, NR.x + 12 + (nr - 0.5) * nadv, NR.y + NR.h / 2, 40, P.goldLight, pop * 0.7);
  if (nr < hero.length) {
    const ex = NR.x + 12 + nr * nadv + 8;
    for (let i = 0; i < 3; i++) glyphIcon(g, 'dot', ex + i * 10, NR.y + NR.h / 2 + 12, 16, { fill: P.paper });
  }
  // 心
  const hv = s.hearts ?? 5;
  const shiver = Math.max(s.shiverAt != null && t >= s.shiverAt ? Math.exp(-(t - s.shiverAt) / 0.5) : 0, clamp(s.heartShiver ?? 0));
  // heartFlash（强度）：hearts > 1.5 时全部心闪金；≤ 1.5 时改为驱动最后一颗的闪红（替代内置脉动）
  const hf = s.heartFlash == null ? null : clamp(s.heartFlash);
  const flash = Math.max(s.heartFlashAt != null && t >= s.heartFlashAt ? Math.exp(-(t - s.heartFlashAt) / 0.2) : 0, hf != null && hv > 1.5 ? hf : 0);
  // crackAt：长度 ≥ 5 → 按心序号（crackAt[i] = 第 i 颗心）；长度 < 5（如 hudState 的 4 次受伤）→ 按时间先后从右往左（第 k 次 → 第 4−k 颗）
  const cr = s.crackAt, byEvent = !!cr && cr.length < 5;
  const crackOf = (i) => (!cr ? null : byEvent ? cr[4 - i] : cr[i]);
  const lastIdx = Math.ceil(hv) - 1;
  for (let i = 0; i < 5; i++) {
    const [hx, hy] = anchors.hearts[i];
    const ci = crackOf(i), ca = ci != null && t >= ci ? clamp((t - ci) / 0.45) : 0;
    const fr = clamp(hv - i);
    const jx = shiver * noise1(t * 40 + i * 3, 4) * 5;
    if (ca > 0 && ca < 1) {
      glyphIcon(g, 'heart', hx + jx, hy, L.hearts.size, { fillFrac: byEvent ? fr : 0, alpha: ca });
      glyphIcon(g, 'heart', hx + jx, hy, L.hearts.size, { crack: ca });
      continue;
    }
    let sc = 1;
    if (i === lastIdx && hv <= 1.5 && hv > 0) { const b = hf ?? Math.max(0, Math.sin(t * 9)); sc = 1 + 0.18 * b; glow(g, hx, hy, 34, P.heart, 0.5 * b); }
    glyphIcon(g, 'heart', hx + jx, hy, L.hearts.size, { fillFrac: fr, scale: sc * (1 + 0.25 * flash) });
    if (flash > 0.05 && fr > 0) glow(g, hx, hy, 30, P.goldLight, flash * 0.8);
  }
  // 背包
  const bagN = s.bag ?? 0;
  let bagK = 0;
  if (s.bagAt) for (const b of s.bagAt) if (t >= b) bagK = Math.max(bagK, Math.exp(-(t - b) / 0.15));
  glyphIcon(g, 'bag', L.bag[0], L.bag[1], 38, { scale: 1 + 0.35 * bagK });
  if (bagN > 0) {
    const bx = L.bag[0] + 15, by = L.bag[1] + 12;
    g.fillStyle = P.redDark; g.beginPath(); g.arc(bx + 1, by + 1.5, 11, 0, TAU); g.fill();
    g.fillStyle = P.red; g.beginPath(); g.arc(bx, by, 11, 0, TAU); g.fill();
    uiText(g, String(bagN), bx - glyphWidth(g, String(bagN), 16, 'latin', 700) / 2, by + 1, 16, { family: 'latin', weight: 700, fill: P.paper });
  }
  // LV + EXP 细条
  const lvAt = s.lvPopAt ?? s.levelUpAt;
  const lvp = lvAt != null && t >= lvAt ? Math.exp(-(t - lvAt) / 0.25) : 0;
  const lvTxt = `LV ${s.lv ?? 1}`;
  g.save(); g.translate(L.lv[0], L.lv[1]); g.scale(1 + 0.4 * lvp, 1 + 0.4 * lvp); g.translate(-L.lv[0], -L.lv[1]);
  uiText(g, lvTxt, L.lv[0], L.lv[1], 30, { family: 'latin', weight: 700, fill: lvp > 0.1 ? P.goldDark : P.ink });
  g.restore();
  const ex = s.exp ?? 0, ev = typeof ex === 'object' ? ex.v ?? 0 : ex, big = clamp((typeof ex === 'object' ? ex.big : undefined) ?? s.expBig ?? 0);
  const E = L.exp;
  g.save();
  g.globalAlpha *= 1 - big;
  g.fillStyle = P.ink; g.fill(rr(E.x - 2, E.y - 2, E.w + 4, E.h + 4, 7));
  g.fillStyle = mixHex(P.kraftDark, P.ink, 0.35); g.fill(rr(E.x, E.y, E.w, E.h, 5));
  if (ev > 0) { g.fillStyle = P.gold; g.fill(rr(E.x, E.y, Math.max(E.h, E.w * clamp(ev)), E.h, 5)); g.fillStyle = rgba(P.goldLight, 0.8); g.fillRect(E.x + 3, E.y + 2, Math.max(0, E.w * clamp(ev) - 6), 3); }
  g.restore();
  // 金币
  coinCounter(g, { x: L.coin[0], y: L.coin[1], value: s.coinFlipAt ? undefined : s.coins ?? 0, flipAt: s.coinFlipAt ?? s.coinAt, t, size: 30, bounceAt: s.coinBounceAt ?? s.coinBounce });
  g.restore();
  return anchors;
}

/**
 * V08 放大经验条（画面上方中央 x 560–1360、y 140–170），fill 跟着蜗牛爬（蜗牛由 monsters.drawSnail 画在返回的 snail 锚点上）。
 * o: { fill 0..1, k 0..1（从 HUD 小条弹到大条，outBack；1 = 大条，反向即缩回）, from（起始矩形，默认 HUD_LAYOUT.exp）, lv, t, alpha }
 * 返回 { rect, snail:[x,y]（填充前沿、条顶）, fillX }。
 */
export function expBarBig(g, o = {}) {
  const big = o.rect ?? { x: 560, y: 140, w: 800, h: 30 };
  const k = clamp(o.k ?? 1);
  if (k <= 0) return null;
  const R = lerpRect(o.from ?? HUD_LAYOUT.exp, big, outBack(k, 1.25));
  const t = o.t ?? 0, f = clamp(o.fill ?? 0);
  const sc = R.h / big.h;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  const pad = 7 * sc;
  const frame = rr(R.x - pad, R.y - pad, R.w + pad * 2, R.h + pad * 2, (R.h + pad * 2) / 2);
  g.save(); g.translate(3 * sc, 5 * sc); g.fillStyle = rgba(P.shadow, 0.3); g.fill(frame); g.restore();
  cut(g, frame, P.paper, { rim: P.white, rimW: 2 });
  g.strokeStyle = P.ink; g.lineWidth = 3.5 * sc; g.stroke(frame);
  const track = rr(R.x, R.y, R.w, R.h, R.h / 2);
  g.fillStyle = mixHex(P.kraftDark, P.ink, 0.35); g.fill(track);
  const fx = R.x + R.w * f;
  if (f > 0) {
    const fp = rr(R.x, R.y, Math.max(R.h, R.w * f), R.h, R.h / 2);
    g.fillStyle = g.createLinearGradient(0, R.y, 0, R.y + R.h);
    const gr = g.fillStyle; gr.addColorStop(0, P.goldLight); gr.addColorStop(0.5, P.gold); gr.addColorStop(1, P.goldDark);
    g.fill(fp);
    g.save(); g.clip(fp); g.strokeStyle = rgba(P.white, 0.28); g.lineWidth = R.h * 0.35;
    const off = (t * 40) % (R.h * 1.6);
    for (let x = R.x - R.h * 2 + off; x < R.x + R.w * f + R.h; x += R.h * 1.6) { g.beginPath(); g.moveTo(x, R.y + R.h + 2); g.lineTo(x + R.h, R.y - 2); g.stroke(); }
    g.restore();
  }
  g.strokeStyle = rgba(P.ink, 0.35); g.lineWidth = 2 * sc;
  for (let i = 1; i < 10; i++) { const x = R.x + (R.w * i) / 10; g.beginPath(); g.moveTo(x, R.y + 3 * sc); g.lineTo(x, R.y + R.h - 3 * sc); g.stroke(); }
  if (k > 0.6) {
    const a = clamp((k - 0.6) / 0.4);
    g.save(); g.globalAlpha *= a;
    nameTab(g, 'EXP', R.x + 6, R.y - pad - 18 * sc, { size: 26 * sc, color: P.heroBlue });
    if (o.lv != null) uiText(g, `LV ${o.lv}`, R.x + R.w + pad + 14, R.y + R.h / 2, 34 * sc, { family: 'latin', weight: 700, fill: P.ink, style: 'cut', edge: P.paper, edgeW: 0.08, under: rgba(P.shadow, 0.3), rim: null });
    g.restore();
  }
  g.restore();
  return { rect: R, snail: [fx, R.y], fillX: fx };
}

/**
 * 「LV UP」金色纸徽章：像气球一样慢慢鼓起（p 0..1 对应约 0.35s），鼓好后轻轻浮动。
 * o: { x, y, p 0..1, s=1（缩放：越升越小的变体传 0.8 / 0.65…）, t, alpha }
 * 返回 { x, y, r }。
 */
export function lvUpBadge(g, o = {}) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return null;
  const t = o.t ?? 0, S = o.s ?? 1, x = o.x ?? 960, y = (o.y ?? 300) + (p >= 1 ? Math.sin(t * 3) * 4 : 0);
  const k = outBack(p, 1.5), sc = lerp(0.18, 1, k) * S;
  const st = Math.sin(Math.PI * p);
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y);
  g.scale(sc * (1 - 0.1 * st), sc * (1 + 0.14 * st));
  const R = 78;
  // 线 + 结
  g.strokeStyle = P.inkSoft; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, R + 8); g.bezierCurveTo(14, R + 40, -14, R + 70, 6, R + 104); g.stroke();
  g.fillStyle = P.goldDark; g.beginPath(); g.moveTo(-9, R + 14); g.lineTo(9, R + 14); g.lineTo(0, R - 2); g.closePath(); g.fill();
  // 红绶带
  for (const sd of [-1, 1]) {
    const tail = poly([[sd * 18, 30], [sd * 54, R + 46], [sd * 40, R + 36], [sd * 30, R + 54], [sd * 2, 40]], { seed: 70 + sd, amp: 1 });
    g.save(); g.translate(2, 3); g.fillStyle = P.redDeep; g.fill(tail); g.restore();
    cut(g, tail, P.red, { rim: mixHex(P.red, P.white, 0.35), rimW: 2 });
  }
  // 花边圆章
  const sc14 = new Path2D();
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU, r = R * (0.93 + 0.07 * Math.cos(a * 16)); i ? sc14.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sc14.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  sc14.closePath();
  g.save(); g.translate(3, 5); g.fillStyle = P.goldDark; g.fill(sc14); g.restore();
  cut(g, sc14, P.gold, { rim: P.goldLight, rimW: 3 });
  g.strokeStyle = P.goldDark; g.lineWidth = 2.5; g.stroke(sc14);
  const inner = new Path2D(); inner.arc(0, 0, R * 0.72, 0, TAU);
  g.fillStyle = g.createRadialGradient(-R * 0.25, -R * 0.3, 0, 0, 0, R * 0.75);
  const gr = g.fillStyle; gr.addColorStop(0, P.goldLight); gr.addColorStop(0.7, P.gold); gr.addColorStop(1, P.goldDark);
  g.fill(inner);
  g.strokeStyle = rgba(P.goldDark, 0.9); g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.arc(0, 0, R * 0.64, 0, TAU); g.stroke(); g.setLineDash([]);
  uiText(g, 'LV', -24 * 1.0 - 4, -16, 40, { family: 'latin', weight: 700, style: 'cut', fill: P.redDeep, edge: P.goldLight, edgeW: 0.07, under: P.goldDark, rim: null });
  uiText(g, 'UP', -30, 24, 46, { family: 'latin', weight: 700, style: 'cut', fill: P.red, edge: P.goldLight, edgeW: 0.07, under: P.redDeep, rim: null });
  g.fillStyle = rgba(P.white, 0.7); g.beginPath(); g.ellipse(-R * 0.42, -R * 0.42, R * 0.16, R * 0.07, -0.75, 0, TAU); g.fill();
  g.restore();
  if (p >= 1) for (let i = 0; i < 3; i++) glyphIcon(g, 'sparkle4', x + Math.cos(i * 2.1 + t) * 96 * S, y - 20 + Math.sin(i * 2.1 + t * 1.3) * 60 * S, (14 + 8 * Math.abs(Math.sin(t * 4 + i))) * S, {});
  return { x, y, r: R * sc };
}

// ———————————————————— 纸剧场：名字牌 / 菜单 / 横幅 / 伤害数字 ————————————————————
/** 剧场名字牌布局（storyboard 4.8）。 */
export const THEATER_PLATES = { hero: { x: 150, y: 176, w: 600, h: 86 }, dragon: { x: 1170, y: 176, w: 600, h: 86 } };

/**
 * 剧场名字牌（走马灯，b12、b13）。勇者牌 x 150–750；巨龙牌镜像 x 1170–1770；窗口 5 字（display 72px、字距 63、窗宽 315）。
 * o: { side:'hero'|'dragon', name（默认对应全名）, progress 0..1（= 本 cue 已过时间 / 本 cue 时长）, mode='pass'（见 type.marquee）,
 *      state:'idle'|'active'|'hit'|'angry'|'cracked'|'empty', centerGold（默认 active / cracked 时开）, hp 0..1, hpLag（滞后白条，默认 = hp）,
 *      hpText（如 'HP 1'；默认按 hp 显示百分比整数）, crack 0..1（裂缝，默认 cracked 时 1）, peeled（前几个字已被剥走，不画）,
 *      drop 0..1（从顶幕吊下，outBack）, beat 0..1（随心跳脉动）, shrink 0..1（随龙缩小）, tf:{dx,dy,rot,s}（整体变换，如砸到地上）,
 *      portrait（'hero'/'dragon' 或回调）, ropeTop=120, t, seed }
 * 返回 { window:{x,y,w,h}, centerX, centerIndex, passed（已越过中线的字数：B12 弹飞节数）, items, portrait:[x,y] }。
 */
export function marqueePlate(g, o = {}) {
  const side = o.side ?? 'hero', R = o.rect ?? THEATER_PLATES[side], mir = side === 'dragon';
  const t = o.t ?? 0, seed = o.seed ?? (mir ? 41 : 31);
  const state = o.state ?? 'active';
  const chars = o.name ? [...o.name] : charsOf(mir ? 'dragon' : 'hero');
  const drop = clamp(o.drop ?? 1);
  if (drop <= 0) return null;
  const win = mir ? { x: R.x + 165, y: R.y + 4, w: 315, h: 70 } : { x: R.x + 120, y: R.y + 4, w: 315, h: 70 };
  const hpBar = mir ? { x: R.x + 100, y: R.y + 77, w: 380, h: 7 } : { x: R.x + 120, y: R.y + 77, w: 380, h: 7 };
  const pc = mir ? [R.x + R.w - 50, R.y + R.h / 2] : [R.x + 50, R.y + R.h / 2];
  const numX = mir ? R.x + 18 : R.x + 452;
  const dy = -320 * (1 - outBack(drop, 1.6));
  const beat = o.beat ? clamp(o.beat) * (Math.max(0, Math.sin(t * TAU * 1.3)) ** 6 + 0.6 * Math.max(0, Math.sin(t * TAU * 1.3 - 0.9)) ** 6) * 0.08 : 0;
  const shr = lerp(1, 0.35, clamp(o.shrink ?? 0));
  const tf = o.tf ?? {};
  const hitShake = state === 'hit' ? noise1(t * 22, seed) * 5 : 0;
  const cxp = R.x + R.w / 2, cyp = R.y + R.h / 2;
  const ropeTop = o.ropeTop ?? 120;
  g.save();
  g.translate((tf.dx ?? 0) + hitShake, dy + (tf.dy ?? 0));
  // 吊绳（不随缩放）
  g.strokeStyle = P.gold; g.lineWidth = 3;
  for (const ax of [R.x + 60, R.x + R.w - 60]) { g.beginPath(); g.moveTo(lerp(cxp, ax, shr), ropeTop - dy); g.lineTo(lerp(cxp, ax, shr), lerp(cyp, R.y, shr)); g.stroke(); }
  g.translate(cxp, cyp); if (tf.rot) g.rotate(tf.rot); const S = shr * (tf.s ?? 1) * (1 + beat); g.scale(S, S); g.translate(-cxp, -cyp);
  // 外框光：active 金边、hit 红、angry 红闪
  const angryOn = state === 'angry' && (t * 6) % 1 < 0.55;
  const rimCol = state === 'active' ? P.gold : state === 'hit' || angryOn ? P.heart : null;
  if (rimCol) glow(g, cxp, cyp, R.w * 0.46, rimCol, state === 'active' ? 0.22 : 0.32);
  paperPanel(g, R, { seed, stitch: false, cornerSize: 18, r: 14, line: rimCol ?? P.ink, lw: rimCol ? 5 : 4 });
  // 头像
  portraitFrame(g, pc[0], pc[1], 36, o.portrait ?? (mir ? 'dragon' : 'hero'), { t, bg: mir ? P.dragonDeep : P.skyDayLow });
  // 窗口
  const wp = rr(win.x - 4, win.y - 3, win.w + 8, win.h + 6, 8);
  g.fillStyle = P.ink; g.fill(wp);
  g.fillStyle = mixHex(P.ink, P.redDeep, 0.28); g.fill(rr(win.x, win.y, win.w, win.h, 6));
  const res = marquee(g, chars.map((c, i) => (i < (o.peeled ?? 0) ? ' ' : c)), win, o.progress ?? 0, {
    pitch: 63, size: 72, mode: o.mode ?? (state === 'idle' ? 'fit' : 'pass'), state, t, seed,
    centerGold: o.centerGold ?? (state === 'active' || state === 'cracked'),
  });
  // 玻璃反光 + 内阴影
  g.save(); g.clip(rr(win.x, win.y, win.w, win.h, 6));
  const gl = g.createLinearGradient(0, win.y, 0, win.y + win.h);
  gl.addColorStop(0, rgba(P.ink, 0.55)); gl.addColorStop(0.18, rgba(P.ink, 0)); gl.addColorStop(0.85, rgba(P.ink, 0)); gl.addColorStop(1, rgba(P.ink, 0.4));
  g.fillStyle = gl; g.fillRect(win.x, win.y, win.w, win.h);
  g.fillStyle = rgba(P.white, 0.06); g.beginPath(); g.moveTo(win.x + 30, win.y); g.lineTo(win.x + 90, win.y); g.lineTo(win.x + 40, win.y + win.h); g.lineTo(win.x - 20, win.y + win.h); g.closePath(); g.fill();
  g.restore();
  // 中线小刻度
  g.fillStyle = rgba(P.goldLight, 0.7);
  g.beginPath(); g.moveTo(res.centerX - 6, win.y - 3); g.lineTo(res.centerX + 6, win.y - 3); g.lineTo(res.centerX, win.y + 5); g.closePath(); g.fill();
  // 裂缝
  const crack = clamp(o.crack ?? (state === 'cracked' ? 1 : 0));
  if (crack > 0) {
    const pts = [];
    const n = 16, x0 = win.x - 6, x1 = win.x + win.w + 6;
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u), win.y + win.h * (0.42 + 0.22 * (hash2(seed + 3, i) - 0.5)) + (i % 2 ? 6 : -6)]); }
    const m = Math.max(2, Math.round(pts.length * crack));
    const cp = new Path2D(); cp.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < m; i++) cp.lineTo(pts[i][0], pts[i][1]);
    g.lineJoin = 'miter'; g.strokeStyle = rgba(P.ink, 0.9); g.lineWidth = 6; g.stroke(cp);
    g.strokeStyle = P.paper; g.lineWidth = 2.2; g.stroke(cp);
    for (let i = 2; i < m; i += 4) { g.strokeStyle = rgba(P.paper, 0.8); g.lineWidth = 1.5; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0] + 8, pts[i][1] + (i % 8 ? 14 : -12)); g.stroke(); }
  }
  // HP 条
  const hp = clamp(o.hp ?? 1), lag = clamp(o.hpLag ?? hp);
  g.fillStyle = P.ink; g.fill(rr(hpBar.x - 2, hpBar.y - 2, hpBar.w + 4, hpBar.h + 4, 5));
  g.fillStyle = mixHex(P.ink, P.inkSoft, 0.5); g.fill(rr(hpBar.x, hpBar.y, hpBar.w, hpBar.h, 4));
  const fromR = mir ? (w) => hpBar.x + hpBar.w - w : () => hpBar.x;
  if (lag > hp) { g.fillStyle = P.paper; const w = hpBar.w * lag; g.fill(rr(fromR(w), hpBar.y, w, hpBar.h, 4)); }
  const low = hp <= 0.12;
  const hpCol = hp > 0.5 ? P.meadow : hp > 0.2 ? P.gold : low && (t * 4) % 1 < 0.5 ? P.paper : P.heart;
  if (hp > 0) { const w = Math.max(hpBar.h, hpBar.w * hp); g.fillStyle = hpCol; g.fill(rr(fromR(w), hpBar.y, w, hpBar.h, 4)); g.fillStyle = rgba(P.white, 0.4); g.fillRect(fromR(w) + 3, hpBar.y + 1.5, Math.max(0, w - 6), 2.5); }
  // HP 数字
  const hpTxt = o.hpText ?? `HP ${Math.round(hp * 100)}`;
  uiText(g, hpTxt, numX, R.y + 38, 30, { family: 'latin', weight: 700, fill: low ? P.red : P.ink });
  g.restore();
  return { window: win, centerX: res.centerX, centerIndex: res.centerIndex, passed: res.passed, items: res.items, portrait: pc };
}

/**
 * 回合指令菜单 2×2「攻击 / 技能 / 道具 / 逃跑」（台口内左下 x 150–560、y 640–830）。
 * o: { rect, items, cursor（0..3，可为小数：光标在两项之间滑动）, blink 0..1（光标项闪亮）, press 0..1（光标项按下）,
 *      locked 0..1（变灰 + 小锁）, lockPop 0..1（小锁弹飞）, submenu:{ text（默认「名字之剑」）, p 0..1（滑出）, sel 0..1（选中闪光）},
 *      pop 0..1（从左下弹出）, t }
 * 返回 { rect, buttons:[{x,y,w,h}], cursor:[x,y], submenu:{x,y,w,h}|null }。
 */
/** battleMenu 的 cursor 也可写项名（theater.theaterState 的写法）：attack / skill / item / flee = 0..3。 */
const MENU_KEYS = ['attack', 'skill', 'item', 'flee'];
export function battleMenu(g, o = {}) {
  const R = o.rect ?? { x: 150, y: 640, w: 410, h: 190 };
  const t = o.t ?? 0, pop = o.pop ?? 1;
  if (pop <= 0) return null;
  const items = o.items ?? TXT.menu;
  const lk = clamp(o.locked ?? 0);
  const k = pop >= 1 ? 1 : outBack(clamp(pop), 1.7);
  const bw = (R.w - 44 - 14) / 2, bh = (R.h - 44 - 14) / 2;
  const btn = (i) => ({ x: R.x + 22 + (i % 2) * (bw + 14), y: R.y + 22 + Math.floor(i / 2) * (bh + 14), w: bw, h: bh });
  const buttons = [0, 1, 2, 3].map(btn);
  const cur = clamp(typeof o.cursor === 'string' ? MENU_KEYS.indexOf(o.cursor) : o.cursor ?? 0, 0, 3);
  const ci = Math.round(cur);
  g.save();
  g.globalAlpha *= Math.min(1, pop * 3);
  g.translate(R.x, R.y + R.h); g.scale(k, k); g.translate(-R.x, -(R.y + R.h));
  // 子菜单卡（在面板后面滑出）
  let sub = null;
  if (o.submenu && (o.submenu.p ?? 0) > 0) {
    const sp = outBack(clamp(o.submenu.p), 1.4), sw = 330, sh = 100;
    const sx = lerp(R.x + R.w - sw, R.x + R.w + 18, sp), sy = R.y + 30;
    sub = { x: sx, y: sy, w: sw, h: sh };
    const sel = clamp(o.submenu.sel ?? o.submenu.select ?? 0);
    const sr = rr(sx, sy, sw, sh, 14);
    g.save(); g.translate(3, 5); g.fillStyle = rgba(P.shadow, 0.3); g.fill(sr); g.restore();
    g.fillStyle = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
    const gr = g.fillStyle; gr.addColorStop(0, P.goldLight); gr.addColorStop(0.5 + 0.4 * Math.sin(t * 2), mixHex(P.goldLight, P.white, 0.5)); gr.addColorStop(1, P.gold);
    g.fill(sr);
    g.strokeStyle = P.goldDark; g.lineWidth = 4; g.stroke(sr);
    g.strokeStyle = rgba(P.white, 0.7); g.lineWidth = 2; g.setLineDash([8, 6]); g.stroke(rr(sx + 8, sy + 8, sw - 16, sh - 16, 9)); g.setLineDash([]);
    glyphIcon(g, 'sword', sx + 52, sy + sh / 2, 64, { rot: -0.6 });
    uiText(g, o.submenu.text ?? TXT.nameSword, sx + 98, sy + sh / 2 + 2, 46, { fill: P.redDeep });
    if (sel > 0) glow(g, sx + sw / 2, sy + sh / 2, sw * 0.7, P.white, Math.sin(sel * Math.PI) * 0.9);
    for (let i = 0; i < 3; i++) glyphIcon(g, 'sparkle4', sx + 40 + ((i * 113 + t * 60) % (sw - 60)), sy + 14 + ((i * 37) % 70), 12 + 6 * Math.abs(Math.sin(t * 5 + i)), { fill: P.white });
  }
  paperPanel(g, R, { seed: 51, cornerSize: 22 });
  for (let i = 0; i < 4; i++) {
    const b = buttons[i];
    const isCur = i === ci && lk < 0.5;
    const pr = isCur ? clamp(o.press ?? 0) : 0;
    const bl = isCur ? clamp(o.blink ?? o.flash ?? 0) : 0;
    const by = b.y + pr * 4;
    const bp = rr(b.x, by, b.w, b.h, 12);
    if (pr < 1) { g.fillStyle = mixHex(P.kraftDark, P.ink, 0.2); g.fill(rr(b.x + 2, b.y + 5, b.w, b.h, 12)); }
    let face = isCur ? mixHex(P.goldLight, P.white, 0.25 * bl) : P.paper2;
    face = mixHex(face, P.stone2, lk * 0.75);
    cut(g, bp, face, { rim: P.white, rimW: 2 });
    shade(g, bp, P.kraftDark, 0, by, 0, by + b.h, 0, 0.22 + pr * 0.2);
    g.strokeStyle = isCur ? P.goldDark : rgba(P.ink, 0.8 - lk * 0.4); g.lineWidth = isCur ? 3.5 : 2.5; g.stroke(bp);
    const tw = uiWidth(g, items[i], 48);
    uiText(g, items[i], b.x + b.w / 2 - tw / 2 + 16, by + b.h / 2 + 2, 48, { fill: lk > 0.5 ? rgba(P.inkSoft, 0.55) : P.ink });
  }
  // 光标小剑（可在两项之间滑动）
  const c0 = buttons[Math.floor(cur)], c1 = buttons[Math.min(3, Math.floor(cur) + 1)], cf = cur - Math.floor(cur);
  const cx = lerp(c0.x, c1.x, inOutSine(cf)) + 26 + Math.sin(t * 7) * 4, cy = lerp(c0.y, c1.y, inOutSine(cf)) + bh / 2 + clamp(o.press ?? 0) * 4;
  if (lk < 1) glyphIcon(g, 'sword', cx, cy, 60, { alpha: 1 - lk, fill: P.goldLight, under: P.goldDark, rim: P.white });
  // 小锁
  if (lk > 0 || (o.lockPop ?? 0) > 0) {
    const lp = clamp(o.lockPop ?? 0);
    const lx = R.x + R.w - 6 + lp * 120, ly = R.y + 8 - lp * 180 + lp * lp * 120;
    g.strokeStyle = P.steelDark; g.lineWidth = 3; g.beginPath(); g.moveTo(R.x + R.w - 6, R.y - 12); g.lineTo(lx, ly - 20); g.stroke();
    glyphIcon(g, 'lock', lx, ly + 6, 64 * (lp > 0 ? 1 : outBack(lk, 2)), { rot: lp * 5 + Math.sin(t * 3) * 0.08 * (1 - lp), alpha: 1 - lp, open: lp });
  }
  g.restore();
  return { rect: R, buttons, cursor: [cx, cy], submenu: sub };
}

const TURN_KIND = {
  hero: { band: P.heroBlue, tail: P.heroBlueDark, text: P.paper, edge: P.gold },
  enemy: { band: P.dragon, tail: P.dragonDark, text: P.paper, edge: P.gold },
  victory: { band: P.gold, tail: P.goldDark, text: P.red, edge: P.goldLight },
};
const kindOf = (txt) => (txt === TXT.victory ? 'victory' : txt === TXT.enemyTurn ? 'enemy' : 'hero');
/**
 * 回合横幅（绸带）：「勇者的回合 / 敌方回合 / 胜利！」，中心 (960,215)，宽 420（胜利 640，display 110px）。
 * o: { text, kind:'hero'|'enemy'|'victory'（默认按文字判断）, textFrom + flip 0..1（翻牌换字）, drop 0..1（从上方落下）, x, y, w, t }
 * 返回 { x, y, w, h }。
 */
export function turnBanner(g, o = {}) {
  const drop = o.drop ?? 1;
  if (drop <= 0) return null;
  const flip = clamp(o.flip ?? 0);
  const textFrom = o.textFrom ?? o.prev; // prev = theaterState.banner 的写法
  const showNew = !(flip > 0 && flip < 0.5) || textFrom == null;
  const text = showNew ? o.text ?? TXT.heroTurn : textFrom;
  const kind = showNew ? o.kind ?? kindOf(text) : o.kindFrom ?? kindOf(textFrom);
  const K = TURN_KIND[kind] ?? TURN_KIND.hero;
  const vic = kind === 'victory';
  const t = o.t ?? 0, x = o.x ?? 960, y0 = o.y ?? 215;
  const w = o.w ?? (vic ? 640 : 420), h = vic ? 132 : 76;
  const y = y0 - 300 * (1 - outBack(clamp(drop), 1.6));
  const sy = flip > 0 && flip < 1 ? Math.abs(Math.cos(flip * Math.PI)) : 1;
  g.save();
  g.translate(x, y); g.scale(1, Math.max(0.02, sy));
  const wave = (u) => Math.sin(u * Math.PI * 2 + t * 2.4) * 3;
  // 燕尾（在后，整条横幅含燕尾不超过 w：中心 (960,215) 宽 420 时正好夹在两块名字牌之间）
  const tl = vic ? 74 : 56, bw = w - tl * 2;
  for (const sd of [-1, 1]) {
    const ex = sd * (bw / 2 - 14), tx = sd * (w / 2);
    const tail = poly([[ex, -h / 2 + 14], [tx, -h / 2 + 14], [tx - sd * tl * 0.42, 14 / 2], [tx, h / 2 + 14], [ex, h / 2 + 14]], { seed: 80 + sd, amp: 1.2, step: 18 });
    g.save(); g.translate(2, 4); g.fillStyle = rgba(P.shadow, 0.35); g.fill(tail); g.restore();
    cut(g, tail, K.tail, { rim: mixHex(K.tail, P.white, 0.25), rimW: 2 });
    const fold = poly([[sd * bw / 2, h / 2], [sd * bw / 2, h / 2 + 14], [sd * (bw / 2 - 18), h / 2]], { amp: 0 });
    g.fillStyle = mixHex(K.tail, P.ink, 0.45); g.fill(fold);
  }
  // 主带
  const pts = [];
  for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([-bw / 2 + u * bw, -h / 2 + wave(u)]); }
  for (let i = 20; i >= 0; i--) { const u = i / 20; pts.push([-bw / 2 + u * bw, h / 2 + wave(u)]); }
  const band = pathOf(pts);
  g.save(); g.translate(3, 5); g.fillStyle = rgba(P.shadow, 0.3); g.fill(band); g.restore();
  g.fillStyle = vic ? (() => { const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, P.goldLight); gr.addColorStop(0.55, P.gold); gr.addColorStop(1, P.goldDark); return gr; })() : K.band;
  g.fill(band);
  shade(g, band, P.ink, 0, -h / 2, 0, h / 2, 0, 0.25);
  g.save(); g.clip(band); g.strokeStyle = rgba(P.white, 0.35); g.lineWidth = 3; g.beginPath(); g.moveTo(-bw / 2, -h / 2 + 5); g.lineTo(bw / 2, -h / 2 + 5); g.stroke(); g.restore();
  g.strokeStyle = K.edge; g.lineWidth = 3;
  for (const sd of [-1, 1]) { g.beginPath(); for (let i = 0; i <= 20; i++) { const u = i / 20, px = -bw / 2 + u * bw, py = sd * (h / 2 - 8) + wave(u); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
  g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(band);
  // 字
  const arr = [...text];
  if (vic) glyphRow(g, arr, 0, 4, 110, { style: 'cut', fill: K.text, edge: P.paper, under: P.redDeep, align: 'center', gap: 4, perChar: (i) => ({ dy: wave(0.5 + (i - 1) * 0.12) }) });
  else glyphRow(g, arr, 0, 2, 50, { family: 'play', fill: K.text, edge: null, align: 'center', gap: 2, baseline: true, perChar: (i) => ({ dy: wave(0.5 + (i - 2) * 0.1) }) });
  g.restore();
  return { x, y, w, h };
}

/**
 * 伤害 / 奖励数字：「-999」「HP 1」「EXP +9999」「-8」。latin 700，heart 红或 gold，奶油描边；pop 弹出 → 上飘 → 淡出。
 * o: { text, x, y, size=120, color:'red'|'gold'|色值, p 0..1（寿命进度）, label（小标签如「暴击！」）, rise=70 }
 */
export function damageNumber(g, o = {}) {
  const p = clamp(o.p ?? 0.3);
  if (p <= 0 || p >= 1) return null;
  const text = [...(o.text ?? '-999')], size = o.size ?? 120;
  const gold = o.color === 'gold';
  const fill = o.color && !['red', 'gold'].includes(o.color) ? o.color : gold ? P.gold : P.heart;
  const under = gold ? P.goldDark : P.redDeep;
  const x = o.x ?? 960, y = (o.y ?? 400) - (o.rise ?? 70) * outCubic(p);
  const a = 1 - clamp((p - 0.72) / 0.28);
  g.save();
  g.globalAlpha *= a;
  const n = text.length;
  glyphRow(g, text, x, y, size, {
    style: 'cut', family: 'latin', weight: 700, fill, edge: P.paper, edgeW: 0.1, under, rim: mixHex(fill, P.white, 0.45), align: 'center', gap: 0, baseline: true,
    perChar: (i) => { const k = clamp((p - i * 0.018) / 0.16); return { scale: k >= 1 ? 1 : Math.max(0.01, outBack(k, 2.6) * 1.0), dy: -Math.sin(k * Math.PI) * size * 0.08 }; },
  });
  if (o.label) {
    const lk = clamp((p - 0.06) / 0.12);
    if (lk > 0) {
      const lw_ = n * size * 0.5;
      g.save(); g.translate(x - lw_ * 0.5, y - size * 0.72); g.rotate(-0.1); g.scale(outBack(lk, 2.2), outBack(lk, 2.2));
      nameTab(g, o.label, 0, 0, { size: size * 0.3, anchor: 'center', color: gold ? P.goldDark : P.red });
      g.restore();
    }
  }
  g.restore();
  return { x, y };
}

// ———————————————————— 道具栏（听岔） ————————————————————
/** 听岔五件的占位图标（正式由 props/village.drawMishearIcon 提供，通过 itemBar 的 drawIcon 回调接入）。 */
function mishearPlaceholder(g, kind, x, y, s) {
  g.save(); g.translate(x, y);
  if (kind === 'card') {
    const c = rr(-s * 0.3, -s * 0.4, s * 0.6, s * 0.8, s * 0.06);
    g.save(); g.rotate(-0.12); cut(g, c, P.paper, { stroke: P.red, lw: s * 0.04, rim: P.white }); g.strokeStyle = P.gold; g.lineWidth = s * 0.02; g.stroke(rr(-s * 0.25, -s * 0.35, s * 0.5, s * 0.7, s * 0.04));
    glyphIcon(g, 'sword', 0, s * 0.05, s * 0.5, { rot: -0.8 }); glyphIcon(g, 'sword', 0, s * 0.05, s * 0.5, { rot: -2.35 });
    const cr = poly([[-s * 0.12, -s * 0.12], [-s * 0.14, -s * 0.26], [-s * 0.05, -s * 0.19], [0, -s * 0.3], [s * 0.05, -s * 0.19], [s * 0.14, -s * 0.26], [s * 0.12, -s * 0.12]], { amp: 0 });
    cut(g, cr, P.gold, { stroke: P.goldDark, lw: s * 0.012 });
    g.restore();
  } else if (kind === 'violin') {
    g.rotate(0.35);
    cut(g, rr(-s * 0.03, -s * 0.48, s * 0.06, s * 0.4, s * 0.02), P.woodDark);
    cut(g, blob(0, s * 0.02, s * 0.2, s * 0.14, { seed: 3 }), P.wood, { rim: mixHex(P.wood, P.white, 0.3) });
    cut(g, blob(0, s * 0.24, s * 0.25, s * 0.17, { seed: 4 }), P.wood, { rim: mixHex(P.wood, P.white, 0.3) });
    g.strokeStyle = P.woodDark; g.lineWidth = s * 0.02; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * s * 0.09, s * 0.14, s * 0.05, -1.2, 1.2); g.stroke(); }
    g.strokeStyle = P.paper; g.lineWidth = 1; for (let i = -1.5; i <= 1.5; i++) { g.beginPath(); g.moveTo(i * s * 0.012, -s * 0.44); g.lineTo(i * s * 0.02, s * 0.33); g.stroke(); }
    g.rotate(-0.9); g.strokeStyle = P.woodDark; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(-s * 0.42, s * 0.05); g.lineTo(s * 0.42, s * 0.05); g.stroke();
  } else if (kind === 'eggtart') {
    const crust = new Path2D();
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, r = s * 0.36 * (1 + 0.06 * Math.cos(a * 14)); const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.55 + s * 0.1; i ? crust.lineTo(px, py) : crust.moveTo(px, py); }
    crust.closePath();
    cut(g, crust, P.sand, { stroke: P.earth, lw: s * 0.02, rim: P.white });
    cut(g, blob(0, s * 0.06, s * 0.27, s * 0.13, { seed: 6 }), P.coin, { rim: P.goldLight });
    g.fillStyle = rgba(P.earth, 0.7); for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-s * 0.1 + i * s * 0.09, s * 0.05 + (i % 2) * s * 0.03, s * 0.035, s * 0.02, 0, 0, TAU); g.fill(); }
    g.strokeStyle = rgba(P.stone2, 0.9); g.lineWidth = s * 0.025; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * s * 0.1, -s * 0.08); g.bezierCurveTo(i * s * 0.1 + s * 0.06, -s * 0.18, i * s * 0.1 - s * 0.06, -s * 0.26, i * s * 0.1, -s * 0.38); g.stroke(); }
  } else if (kind === 'soda') {
    const bt = poly([[-s * 0.06, -s * 0.44], [s * 0.06, -s * 0.44], [s * 0.06, -s * 0.26], [s * 0.18, -s * 0.12], [s * 0.18, s * 0.42], [-s * 0.18, s * 0.42], [-s * 0.18, -s * 0.12], [-s * 0.06, -s * 0.26]], { amp: 0, round: 0.2 });
    cut(g, bt, rgba(P.ice, 0.95), { stroke: P.waterDeep, lw: s * 0.02, rim: P.white });
    g.save(); g.clip(bt); g.fillStyle = rgba(P.water, 0.7); g.fillRect(-s * 0.2, -s * 0.02, s * 0.4, s * 0.46); g.restore();
    g.strokeStyle = P.heart; g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(s * 0.02, s * 0.1); g.lineTo(s * 0.02, -s * 0.52); g.lineTo(s * 0.14, -s * 0.58); g.stroke();
    g.strokeStyle = P.white; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-s * 0.08 + (i % 3) * s * 0.07, s * 0.3 - i * s * 0.07, s * 0.022, 0, TAU); g.stroke(); }
  } else {
    const shoe = poly([[-s * 0.34, s * 0.04], [-s * 0.3, -s * 0.18], [-s * 0.08, -s * 0.2], [s * 0.04, -s * 0.06], [s * 0.36, s * 0.02], [s * 0.38, s * 0.16], [-s * 0.34, s * 0.16]], { amp: 0, round: 0.35 });
    cut(g, shoe, P.heroBlue, { rim: mixHex(P.heroBlue, P.white, 0.35) });
    cut(g, rr(-s * 0.36, s * 0.14, s * 0.76, s * 0.08, s * 0.03), P.paper, { stroke: P.inkSoft, lw: 1.5 });
    g.strokeStyle = P.paper; g.lineWidth = s * 0.02; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.18 + i * s * 0.06, -s * 0.14); g.lineTo(-s * 0.12 + i * s * 0.06, -s * 0.04); g.stroke(); }
    // 被冲断的终点线：左半截垂下、右半截向右上飞起；鞋后几道速度线
    g.lineCap = 'round';
    g.strokeStyle = P.red; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(-s * 0.48, -s * 0.3); g.quadraticCurveTo(-s * 0.3, -s * 0.28, -s * 0.2, -s * 0.12); g.stroke();
    g.beginPath(); g.moveTo(s * 0.18, -s * 0.26); g.quadraticCurveTo(s * 0.32, -s * 0.36, s * 0.48, -s * 0.46); g.stroke();
    g.strokeStyle = P.paper; g.lineWidth = s * 0.015; g.setLineDash([s * 0.03, s * 0.03]);
    g.beginPath(); g.moveTo(-s * 0.48, -s * 0.3); g.quadraticCurveTo(-s * 0.3, -s * 0.28, -s * 0.2, -s * 0.12); g.stroke(); g.setLineDash([]);
    g.strokeStyle = rgba(P.inkSoft, 0.7); g.lineWidth = s * 0.02;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.46, s * (-0.02 + i * 0.07)); g.lineTo(-s * (0.36 - i * 0.03), s * (-0.02 + i * 0.07)); g.stroke(); }
  }
  g.restore();
}

/**
 * 道具栏「道具」5 格（x 880–1720、y 200–560；每格 150×200，名称 play 40px 在格下）。
 * o: { rect, items:[{kind:'card'|'violin'|'eggtart'|'soda'|'marathon', p（入格进度 0..1）, rarity（星数 1..5）, name（默认按 kind）, burst 0..1（马拉松五星炸开）}],
 *      drawIcon(g, kind, x, y, size)（默认用内置占位图标）, burn 0..1（燃烧边从右往左：边后的部分不画，返回 edge 交给 fx.burnEdge 画亮边与灰片）,
 *      slide 0..1（从右上滑入）, t, label（默认「道具」） }
 * 返回 { rect, slots:[{x,y,w,h}], edgeX（燃烧线 x）, edge:[[x,y]…]（燃烧线折线） }。
 */
export function itemBar(g, o = {}) {
  const R = o.rect ?? { x: 880, y: 200, w: 840, h: 360 };
  const t = o.t ?? 0, slide = o.slide ?? 1;
  if (slide <= 0) return null;
  const k = slide >= 1 ? 1 : outBack(clamp(slide), 1.3);
  const SW = 150, SH = 200, gap = (R.w - 5 * SW) / 6;
  const slots = [0, 1, 2, 3, 4].map((i) => ({ x: R.x + gap + i * (SW + gap), y: R.y + 54, w: SW, h: SH }));
  const burn = clamp(o.burn ?? 0);
  const ex = lerp(R.x + R.w + 40, R.x - 40, burn);
  const edge = [];
  for (let i = 0; i <= 24; i++) { const yy = lerp(R.y - 30, R.y + R.h + 30, i / 24); edge.push([ex + noise1(yy / 40 + t * 2, 13) * 34 + noise1(yy / 13, 14) * 9, yy]); }
  g.save();
  g.translate((1 - k) * 700, -(1 - k) * 260);
  g.globalAlpha *= Math.min(1, slide * 3);
  if (burn > 0) {
    const cp = new Path2D(); cp.moveTo(R.x - 200, R.y - 200); for (const [px, py] of edge) cp.lineTo(px, py); cp.lineTo(R.x - 200, R.y + R.h + 200); cp.closePath();
    g.clip(cp);
  }
  paperPanel(g, R, { seed: 61, cornerSize: 28, tag: { text: o.label ?? TXT.items, size: 36 } });
  const items = o.items ?? [];
  for (let i = 0; i < 5; i++) {
    const S = slots[i], it = items[i];
    const legend = it && (it.rarity ?? 0) >= 5;
    const sp = rr(S.x, S.y, S.w, S.h, 14);
    g.fillStyle = legend && (it.p ?? 1) > 0.5 ? mixHex(P.goldLight, P.paper2, 0.4) : mixHex(P.paper2, P.kraft, 0.35); g.fill(sp);
    shade(g, sp, P.kraftDark, 0, S.y, 0, S.y + 34, 0.5, 0);
    g.strokeStyle = P.kraftDark; g.lineWidth = 3; g.stroke(sp);
    if (!it) continue;
    const p = clamp(it.p ?? 1);
    if (p <= 0) continue;
    const pk = outBack(p, 2.2), cx = S.x + S.w / 2, cy = S.y + S.h * 0.46;
    const fx = lerp(R.x - 500, cx, outCubic(p)), fy = lerp(R.y + R.h + 160, cy, outCubic(p)) - Math.sin(p * Math.PI) * 120;
    const glowK = legend ? 0.9 : 0.55;
    glow(g, fx, fy, 120, legend ? P.goldLight : P.crystal, glowK * Math.min(1, p * 2));
    if (legend) rays(g, fx, fy, 160, { n: 12, rot: t * 0.6, alpha: 0.35 * p, color: P.goldLight });
    g.save(); g.translate(fx, fy); g.scale(pk, pk); g.translate(-fx, -fy);
    (o.drawIcon || mishearPlaceholder)(g, it.kind, fx, fy, 120);
    g.restore();
    if (p > 0.6) {
      const na = clamp((p - 0.6) / 0.3);
      const name = it.name ?? TXT.mishear[it.kind] ?? '';
      const tw = uiWidth(g, name, 40);
      g.save(); g.globalAlpha *= na;
      uiText(g, name, cx - tw / 2, S.y + S.h + 34, 40, { fill: P.ink });
      const nStar = it.rarity ?? 1, bk = clamp(it.burst ?? (legend ? 1 : 0));
      const bs = Math.sin(bk * Math.PI);
      if (bs > 0.02) glow(g, cx, S.y + S.h + 82, 90, P.goldLight, bs * 0.8);
      for (let j = 0; j < nStar; j++) {
        // 传说级：五颗星从星位向外下方扇形炸开再落回（不盖住名字）
        const base = [cx + (j - (nStar - 1) / 2) * 26, S.y + S.h + 82];
        const ang = Math.PI / 2 - (j - (nStar - 1) / 2) * 0.6;
        const bx = base[0] + Math.cos(ang) * 30 * bs - (j - (nStar - 1) / 2) * 14 * bs * -1, by = base[1] + Math.sin(ang) * 26 * bs;
        glyphIcon(g, 'star', bx, by, 26 * (1 + 0.55 * bs), { rot: Math.sin(t * 3 + j) * 0.15 + bs * (j - 2) * 0.4 });
      }
      g.restore();
    }
  }
  // 焦边：燃烧线左侧一条焦黑渐变
  if (burn > 0) {
    g.save();
    const gr = g.createLinearGradient(ex - 90, 0, ex + 30, 0);
    gr.addColorStop(0, rgba(P.ink, 0)); gr.addColorStop(0.7, rgba(P.ink, 0.55)); gr.addColorStop(1, rgba(P.ink, 0.95));
    g.fillStyle = gr; g.fillRect(ex - 100, R.y - 40, 160, R.h + 80);
    g.restore();
  }
  g.restore();
  return { rect: R, slots, edgeX: ex, edge };
}

// ———————————————————— 角色卡 · 敌人吊牌 · VS · 名签 ————————————————————
function compassRose(g, cx, cy, r) {
  g.save();
  g.strokeStyle = rgba(P.inkSoft, 0.75); g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.setLineDash([4, 5]); g.beginPath(); g.arc(cx, cy, r * 0.78, 0, TAU); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2, L = i % 2 ? r * 0.55 : r * 0.95, wv = i % 2 ? 0.16 : 0.22;
    const p = new Path2D(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a - wv) * r * 0.22, cy + Math.sin(a - wv) * r * 0.22); p.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); p.lineTo(cx + Math.cos(a + wv) * r * 0.22, cy + Math.sin(a + wv) * r * 0.22); p.closePath();
    g.fillStyle = i === 0 ? P.red : i % 2 ? rgba(P.inkSoft, 0.55) : P.inkSoft; g.fill(p);
  }
  g.fillStyle = P.gold; g.beginPath(); g.arc(cx, cy, r * 0.09, 0, TAU); g.fill();
  g.restore();
}

/**
 * 角色卡 300×420（I1 发牌、翻牌；中心 x = 480 / 800 / 1120 / 1440，y = 640）。
 * o: { x, y（卡心）, face:'back'|'front', flip 0..1（0 = 卡背、1 = 正面，scaleX 翻转；给了 flip 就忽略 face）, rot（弧度）, s,
 *      portrait（'hero'/'princess'/'dragon'/'king' 或 (g,x,y,size)=>{} 回调，画在卡面头像窗里）, portraitBg,
 *      nameStrip（名字条文字：勇者全名会绕过卡边弯到背面；「？？？」「国王」）, extras:{ scroll（小卷轴挂在名字条下）, lv（如「LV ??」）, stars }, t }
 * 返回 { x, y, w, h, portrait:{x,y,w,h} }。
 */
export function characterCard(g, o = {}) {
  const x = o.x ?? 960, y = o.y ?? 640, W = 300, H = 420, t = o.t ?? 0;
  const flip = o.flip ?? (o.face === 'front' ? 1 : 0);
  const front = flip >= 0.5;
  const sx = Math.abs(Math.cos(flip * Math.PI));
  const S = o.s ?? 1;
  const pw = { x: -W / 2 + 22, y: -H / 2 + 22, w: W - 44, h: 236 };
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  g.scale(S * Math.max(0.02, sx), S);
  const R = { x: -W / 2, y: -H / 2, w: W, h: H };
  if (!front) {
    paperPanel(g, R, { seed: 71, fill: P.kraft, stitchColor: P.kraftDark, cornerSize: 24, r: 18,
      content: (lg) => {
        lg.strokeStyle = rgba(P.kraftDark, 0.5); lg.lineWidth = 1.5;
        for (let i = -6; i <= 6; i++) { lg.beginPath(); lg.moveTo(i * 50 - 200, -H / 2); lg.lineTo(i * 50 + 200, H / 2); lg.stroke(); }
        compassRose(lg, 0, 0, 92);
      } });
    shade(g, rr(-W / 2, -H / 2, W, H, 18), P.ink, -W / 2, 0, W / 2, 0, 0.25 * (1 - sx), 0);
  } else {
    paperPanel(g, R, { seed: 72, cornerSize: 24, r: 18 });
    const pp = rr(pw.x, pw.y, pw.w, pw.h, 12);
    g.save(); g.clip(pp);
    const bgc = o.portraitBg ?? P.skyDayLow;
    const gr = g.createLinearGradient(0, pw.y, 0, pw.y + pw.h); gr.addColorStop(0, mixHex(bgc, P.white, 0.45)); gr.addColorStop(1, bgc);
    g.fillStyle = gr; g.fillRect(pw.x, pw.y, pw.w, pw.h);
    rays(g, 0, pw.y + pw.h * 0.55, 220, { n: 10, rot: t * 0.1, alpha: 0.18, color: P.white, mode: 'source-over' });
    if (typeof o.portrait === 'function') o.portrait(g, 0, pw.y + pw.h * 0.58, 190);
    else if (o.portrait) portraitHead(g, o.portrait, 0, pw.y + pw.h * 0.56, 170, { t, silhouette: o.silhouette });
    g.restore();
    g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(pp);
    g.strokeStyle = rgba(P.gold, 0.9); g.lineWidth = 2; g.stroke(rr(pw.x + 5, pw.y + 5, pw.w - 10, pw.h - 10, 8));
    // 名字条（太长就绕过右边卡边弯到背面）
    const ny = 92, nh = 54;
    const txt = o.nameStrip ?? '';
    const arr = [...txt], nsz = 40, adv = glyphWidth(g, arr[0] || '国', nsz) + 1;
    const fullW = arr.length * adv + 28;
    const fits = fullW <= W + 10;
    const sw_ = fits ? Math.max(150, fullW) : W + 16;
    const sx0 = fits ? -sw_ / 2 : -W / 2 - 8;
    const strip = poly([[sx0, ny - nh / 2], [sx0 + sw_, ny - nh / 2], [sx0 + sw_, ny + nh / 2], [sx0, ny + nh / 2]], { seed: 74, amp: 0.8, step: 24 });
    g.save(); g.translate(2, 3); g.fillStyle = P.redDeep; g.fill(strip); g.restore();
    cut(g, strip, P.red, { rim: mixHex(P.red, P.white, 0.4), rimW: 2 });
    g.save(); g.setLineDash([5, 4]); g.strokeStyle = rgba(P.paper, 0.5); g.lineWidth = 1.5; g.strokeRect(sx0 + 4, ny - nh / 2 + 5, sw_ - 8, nh - 10); g.restore();
    if (fits) glyphRow(g, arr, 0, ny, nsz, { fill: P.paper, edge: null, align: 'center', gap: 1 });
    else {
      // 卡面上能放下的字正常排；越过右边的字压扁变暗，像绕到了卡背
      const edgeX = W / 2 + 8;
      let px = sx0 + 16 + adv / 2;
      for (let i = 0; i < arr.length; i++) {
        const over = px - (edgeX - adv * 0.5);
        if (over <= 0) paperGlyph(g, arr[i], px, ny, nsz, { fill: P.paper, edge: null });
        else {
          const k = clamp(over / (adv * 2.4));
          if (k < 1) paperGlyph(g, arr[i], edgeX - adv * 0.5 + adv * 0.5 * Math.sin(k * Math.PI / 2), ny, nsz, { fill: mixHex(P.paper, P.redDeep, k * 0.7), edge: null, squashX: Math.max(0.05, Math.cos(k * Math.PI / 2)) });
        }
        px += adv;
      }
      // 绕到背面：名字条最后一段像绕过圆柱一样变暗，卡边外露出一小截折回的暗红条
      shade(g, strip, P.redDeep, edgeX - 70, 0, edgeX, 0, 0, 0.75);
      const wrap = poly([[edgeX, ny - nh / 2], [edgeX + 12, ny - nh / 2 + 7], [edgeX + 12, ny + nh / 2 - 7], [edgeX, ny + nh / 2]], { amp: 0 });
      g.fillStyle = mixHex(P.redDeep, P.ink, 0.3); g.fill(wrap);
    }
    // 底部：星级 / LV 小牌
    const ex = o.extras ?? {};
    if (ex.lv) {
      const r = nameTab(g, ex.lv, 0, 158, { size: 32, anchor: 'center', color: P.inkSoft });
      void r;
    } else {
      const ns = ex.stars ?? 3;
      for (let i = 0; i < ns; i++) glyphIcon(g, 'star', (i - (ns - 1) / 2) * 34, 158, 30, {});
    }
    if (ex.scroll) {
      const sy = H / 2 + 10 + Math.sin(t * 2) * 3;
      g.strokeStyle = P.princessDark; g.lineWidth = 3; g.beginPath(); g.moveTo(-20, H / 2 - 6); g.quadraticCurveTo(-24, sy - 6, -8, sy); g.stroke();
      cut(g, rr(-58, sy, 116, 38, 18), P.paper2, { stroke: P.kraftDark, lw: 2, rim: P.white });
      cut(g, rr(-66, sy - 3, 18, 44, 8), P.paper, { stroke: P.kraftDark, lw: 2 });
      cut(g, rr(48, sy - 3, 18, 44, 8), P.paper, { stroke: P.kraftDark, lw: 2 });
      cut(g, rr(-8, sy - 2, 16, 42, 3), P.princess, { stroke: P.princessDark, lw: 1.5 });
      cut(g, blob(0, sy + 19, 12, 8, { seed: 9 }), P.princessDark);
    }
  }
  g.restore();
  return { x, y, w: W * S, h: H * S, portrait: { x: x + pw.x * S, y: y + pw.y * S, w: pw.w * S, h: pw.h * S } };
}

/**
 * 敌人吊牌「？？？ LV 99」（b09；与 HUD 名字牌同材质：红牌奶油字，吊在两根绳上）。
 * o: { x, y（牌心）, text（默认「？？？」）, lv（默认 'LV 99'）, drop 0..1（吊下来，带摆动）, ropeTop, t }
 */
export function enemyPlate(g, o = {}) {
  const drop = o.drop ?? 1;
  if (drop <= 0) return null;
  const t = o.t ?? 0, x = o.x ?? 1300, y0 = o.y ?? 260;
  const k = outBack(clamp(drop), 1.8);
  const y = lerp(y0 - 380, y0, k);
  const sway = Math.sin(t * 2.2) * 0.03 + (1 - clamp(drop)) * 0.1;
  const txt = o.text ?? TXT.unknown, lv = o.lv ?? 'LV 99';
  const ts = 54, tw = uiWidth(g, txt, ts, { family: 'display' }), lw_ = uiWidth(g, lv, 40, { family: 'latin', weight: 700 });
  const W = tw + lw_ + 96, H = 78;
  const ropeTop = o.ropeTop ?? -20;
  g.save();
  g.strokeStyle = P.inkSoft; g.lineWidth = 3;
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x + sd * (W / 2 - 30), ropeTop); g.lineTo(x + sd * (W / 2 - 30) + Math.sin(sway) * (y - ropeTop) * 0.05, y - H / 2 + 6); g.stroke(); }
  g.translate(x, y - H / 2); g.rotate(sway); g.translate(-x, -(y - H / 2));
  const p = poly([[x - W / 2, y - H / 2], [x + W / 2, y - H / 2], [x + W / 2, y + H / 2], [x - W / 2, y + H / 2]], { seed: 91, amp: 1, step: 22 });
  g.save(); g.translate(3, 5); g.fillStyle = P.redDeep; g.fill(p); g.restore();
  cut(g, p, P.red, { rim: mixHex(P.red, P.white, 0.4), rimW: 2.5 });
  g.strokeStyle = P.ink; g.lineWidth = 3.5; g.stroke(p);
  g.save(); g.setLineDash([6, 5]); g.strokeStyle = rgba(P.paper, 0.55); g.lineWidth = 1.6; g.strokeRect(x - W / 2 + 7, y - H / 2 + 7, W - 14, H - 14); g.restore();
  for (const sd of [-1, 1]) { g.fillStyle = P.gold; g.beginPath(); g.arc(x + sd * (W / 2 - 30), y - H / 2 + 10, 6, 0, TAU); g.fill(); }
  uiText(g, txt, x - W / 2 + 28, y + 2, ts, { family: 'display', fill: P.paper, inkCenter: true });
  uiText(g, lv, x + W / 2 - 28 - lw_, y + 4, 40, { family: 'latin', weight: 700, fill: P.goldLight });
  g.restore();
  return { x, y, w: W, h: H };
}

/**
 * 「VS」红金纸徽章（b09 103.50 砸在两人中间）。o: { x, y, size=180, drop 0..1（从上方砸下，落地挤压），t }
 */
export function vsBadge(g, o = {}) {
  const drop = o.drop ?? 1;
  if (drop <= 0) return null;
  const t = o.t ?? 0, x = o.x ?? 960, y0 = o.y ?? 420, S = (o.size ?? 180) / 180;
  const d = clamp(drop);
  const fall = d < 0.55 ? inQuad(d / 0.55) : 1;
  const y = lerp(y0 - 520, y0, fall);
  const land = d >= 0.55 ? Math.sin(Math.PI * clamp((d - 0.55) / 0.45)) * Math.exp(-((d - 0.55) / 0.45) * 2) : 0;
  g.save();
  g.translate(x, y + 70 * S); g.scale(S * (1 + 0.28 * land), S * (1 - 0.26 * land)); g.translate(0, -70 * S / S);
  g.rotate(-0.08 + Math.sin(t * 2) * 0.02);
  const burst = new Path2D();
  for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU, r = i % 2 ? 76 : 98 + (hash2(5, i) - 0.5) * 10; i ? burst.lineTo(Math.cos(a) * r, Math.sin(a) * r) : burst.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  burst.closePath();
  g.save(); g.translate(4, 6); g.fillStyle = P.goldDark; g.fill(burst); g.restore();
  cut(g, burst, P.gold, { rim: P.goldLight, rimW: 3 });
  g.strokeStyle = P.goldDark; g.lineWidth = 2.5; g.stroke(burst);
  const disc = new Path2D(); disc.arc(0, 0, 70, 0, TAU);
  g.save(); g.translate(3, 4); g.fillStyle = P.redDeep; g.fill(disc); g.restore();
  g.fillStyle = (() => { const gr = g.createRadialGradient(-20, -24, 0, 0, 0, 72); gr.addColorStop(0, mixHex(P.red, P.white, 0.25)); gr.addColorStop(0.75, P.red); gr.addColorStop(1, P.redDark); return gr; })();
  g.fill(disc);
  g.strokeStyle = P.goldLight; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.stroke();
  g.strokeStyle = P.ink; g.lineWidth = 3.5; g.stroke(disc);
  glyphRow(g, ['V', 'S'], 0, 4, 92, { style: 'cut', family: 'latin', weight: 700, fill: P.paper, edge: P.redDeep, edgeW: 0.07, under: P.ink, rim: P.goldLight, align: 'center', gap: -4, baseline: true, perChar: (i) => ({ dy: i ? 6 : -6, rot: -0.06 }) });
  g.fillStyle = rgba(P.white, 0.55); g.beginPath(); g.ellipse(-30, -38, 18, 7, -0.6, 0, TAU); g.fill();
  g.restore();
  return { x, y, r: 98 * S };
}

/**
 * 小名签。kind 'head'：头顶小纸签（「？？？」→ 全名时字从两头溢出）；'chest'：胸前别针名签（「达拉崩吧」「米娅」）。
 * o: { x, y（签心）, text, kind='head', size（字号，head 40 / chest 36）, textFrom + flip 0..1（翻牌换字）, spill 0..1（全名从两头溢出的进度）,
 *      pop 0..1（弹出）, t }
 * 返回 { x, y, w, h }。
 */
export function nameTagSmall(g, o = {}) {
  const pop = o.pop ?? 1;
  if (pop <= 0) return null;
  const kind = o.kind ?? 'head', t = o.t ?? 0;
  const x = o.x ?? 960, y = o.y ?? 400;
  const flip = clamp(o.flip ?? 0);
  const showNew = !(flip > 0 && flip < 0.5) || o.textFrom == null;
  const text = showNew ? o.text ?? TXT.unknown : o.textFrom;
  const sy = flip > 0 && flip < 1 ? Math.abs(Math.cos(flip * Math.PI)) : 1;
  const k = pop >= 1 ? 1 : outBack(clamp(pop), 2.2);
  g.save();
  g.translate(x, y); g.scale(k, k * Math.max(0.02, sy));
  if (kind === 'chest') {
    const size = o.size ?? 36, arr = [...text];
    const tw = arr.reduce((a, c) => a + glyphWidth(g, c, size), 0) + 2 * (arr.length - 1);
    const W = tw + size * 0.9, H = size * 1.5;
    const p = poly([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]], { seed: 101, amp: 0.8, step: 16, round: 0 });
    g.save(); g.translate(2, 3); g.fillStyle = rgba(P.shadow, 0.35); g.fill(p); g.restore();
    cut(g, p, P.paper, { rim: P.white, rimW: 2 });
    g.strokeStyle = P.red; g.lineWidth = size * 0.12; g.stroke(rr(-W / 2 + size * 0.12, -H / 2 + size * 0.12, W - size * 0.24, H - size * 0.24, 4));
    g.strokeStyle = P.ink; g.lineWidth = 2.5; g.stroke(p);
    glyphRow(g, arr, 0, 2, size, { fill: P.red, edge: null, align: 'center', gap: 2 });
    g.strokeStyle = P.goldDark; g.lineWidth = 3; g.beginPath(); g.moveTo(-W * 0.22, -H / 2 - 2); g.lineTo(W * 0.18, -H / 2 - 2); g.stroke();
    g.fillStyle = P.gold; g.beginPath(); g.arc(W * 0.2, -H / 2 - 2, 5, 0, TAU); g.fill();
    g.restore();
    return { x, y, w: W * k, h: H * k };
  }
  const size = o.size ?? 40;
  const tagW = o.w ?? size * 3.6, H = size * 1.45;
  const p = poly([[-tagW / 2, -H / 2], [tagW / 2, -H / 2], [tagW / 2, H / 2], [-tagW / 2, H / 2]], { seed: 103, amp: 0.9, step: 14 });
  g.save(); g.translate(2, 4); g.fillStyle = rgba(P.shadow, 0.35); g.fill(p); g.restore();
  cut(g, p, P.paper, { rim: P.white, rimW: 2 });
  g.strokeStyle = P.ink; g.lineWidth = 3; g.stroke(p);
  g.fillStyle = P.ink; g.beginPath(); g.moveTo(-10, H / 2 - 1); g.lineTo(10, H / 2 - 1); g.lineTo(0, H / 2 + 12); g.closePath(); g.fill();
  const arr = [...text];
  const adv = glyphWidth(g, arr[0] || '国', size, 'play');
  const tw = arr.length * adv;
  if (tw <= tagW - size * 0.4) glyphRow(g, arr, 0, 2, size, { family: 'play', fill: P.ink, edge: null, align: 'center', gap: 0, inkCenter: true });
  else {
    // 全名从签的两头溢出去：签内的字正常，签外的字带纸边、微微下垂旋转
    const sp = clamp(o.spill ?? 1);
    const full = (i) => (i - (arr.length - 1) / 2) * adv;
    for (let i = 0; i < arr.length; i++) {
      const fx = full(i) * lerp(0.15, 1, outCubic(sp));
      const outside = Math.abs(fx) > tagW / 2 - adv * 0.5;
      const dd = outside ? (Math.abs(fx) - (tagW / 2 - adv * 0.5)) / adv : 0;
      paperGlyph(g, arr[i], fx, 2 + (outside ? dd * 3 + Math.sin(t * 3 + i) * 2 : 0), size, {
        family: 'play', fill: outside ? P.red : P.ink, edge: outside ? P.paper : null, edgeW: 0.12, rot: outside ? Math.sign(fx) * Math.min(0.25, dd * 0.06) : 0,
      });
    }
  }
  g.restore();
  return { x, y, w: tagW * k, h: H * k };
}
