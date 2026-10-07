// 王室道具：大王冠、小皇冠、金印、印迹（金箔 / 对勾 / 大叉 / 警示）、星星权杖、钟、花环 / 彩旗 / 花拱、摇篮、红灯笼。
// 约定（docs/assets.md 9 节）：drawXxx(g, o)，o.x / o.y 为锚点（每个函数注释里写明锚在哪），o.s 缩放，o.rot 弧度，o.t 秒。
// 全部是纯函数：只读参数、内部 save/restore、不调 ctx.layer / ctx.mask；只用 PAL 颜色；符号一律路径画。
// 返回值是锚点对象（调用时的坐标系），方便镜头挂特效。
import { PAL, blob, cut, shade, lin, rad, glow, sparkle, ribbon, smooth as smoothPath } from '../core/paper.js';
import { clamp, lerp, TAU, hash2, noise1, rgba, mixHex } from '../core/util.js';
import { outBack, inQuad, outCubic } from '../core/ease.js';
import { paperGlyph } from '../ui/type.js';

const DEG = Math.PI / 180;

// ———————————————————— 小工具（rigs 也会用） ————————————————————
/** 记录变换的包装：同时作用在 g 和一个 2D 仿射矩阵上，用来把局部点换算回调用时的坐标系（锚点返回值）。 */
export class Xf {
  constructor(g) { this.g = g; this.m = [1, 0, 0, 1, 0, 0]; this.st = []; }
  save() { this.g.save(); this.st.push(this.m.slice()); }
  restore() { this.g.restore(); this.m = this.st.pop(); }
  translate(x, y) { this.g.translate(x, y); const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  rotate(r) {
    if (!r) return;
    this.g.rotate(r);
    const c = Math.cos(r), s = Math.sin(r), m = this.m;
    const a = m[0] * c + m[2] * s, b = m[1] * c + m[3] * s, cc = -m[0] * s + m[2] * c, d = -m[1] * s + m[3] * c;
    m[0] = a; m[1] = b; m[2] = cc; m[3] = d;
  }
  scale(sx, sy = sx) { this.g.scale(sx, sy); const m = this.m; m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; }
  pt(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
}

/** 纸片：先画一层右下错位的暗色（纸片分层的“暗色错位”），再 cut（可带切口亮边）。F = 面向（镜像坐标系里保持投影朝屏幕右下）。 */
export function piece(g, path, fill, o = {}) {
  const { sh = 0, shA = 0.22, F = 1, rim = null, rimW = 2, stroke = null, lw = 2, alpha = 1 } = o;
  if (sh > 0) {
    g.save();
    if (alpha !== 1) g.globalAlpha *= alpha;
    g.translate(sh * 0.55 * F, sh);
    g.fillStyle = rgba(PAL.shadow, shA);
    g.fill(path);
    g.restore();
  }
  cut(g, path, fill, { rim, rimW, stroke, lw, alpha });
}

/** 右下暗、左上亮的明暗层（F 为面向，镜像时保持屏幕方向一致）。 */
export function shadeBR(g, path, cx, cy, rx, ry, color, a = 0.3, F = 1) {
  shade(g, path, color, cx + rx * 0.9 * F, cy + ry * 0.9, cx - rx * 0.3 * F, cy - ry * 0.4, a, 0);
}

/** 五角星 Path2D（路径画，字体里没有 ★）。R 外半径，ri 内半径，rot 起始角（默认尖朝上），rr 尖角圆滑半径。 */
export function starPath(cx, cy, R, ri = R * 0.47, n = 5, rot = -Math.PI / 2, rr = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? ri : R;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const p = new Path2D();
  if (rr > 0) {
    const m = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
    p.moveTo(m[0], m[1]);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; p.arcTo(a[0], a[1], b[0], b[1], i % 2 ? rr * 0.5 : rr); }
    p.closePath();
  } else { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); }
  return p;
}

/** 爱心 Path2D（宽 = size，中心在 (cx,cy)）。 */
export function heartPath(cx, cy, size) {
  const s = size, p = new Path2D();
  p.moveTo(cx, cy + 0.42 * s);
  p.bezierCurveTo(cx - 0.16 * s, cy + 0.28 * s, cx - 0.5 * s, cy + 0.08 * s, cx - 0.5 * s, cy - 0.15 * s);
  p.bezierCurveTo(cx - 0.5 * s, cy - 0.42 * s, cx - 0.13 * s, cy - 0.5 * s, cx, cy - 0.24 * s);
  p.bezierCurveTo(cx + 0.13 * s, cy - 0.5 * s, cx + 0.5 * s, cy - 0.42 * s, cx + 0.5 * s, cy - 0.15 * s);
  p.bezierCurveTo(cx + 0.5 * s, cy + 0.08 * s, cx + 0.16 * s, cy + 0.28 * s, cx, cy + 0.42 * s);
  p.closePath();
  return p;
}

/** 椭圆 Path2D（无抖动，用于小宝石、珠子）。 */
export function ell(cx, cy, rx, ry = rx, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  return p;
}

/** 宝石：底色 + 暗环 + 亮面 + 白高光。 */
function gem(g, x, y, rx, ry, color, o = {}) {
  const { F = 1, detail = 1, hl = PAL.white } = o;
  if (rx < 0.3) return;
  g.fillStyle = mixHex(color, PAL.ink, 0.35);
  g.fill(ell(x + 0.6 * F * Math.min(1, rx / 4), y + 0.8, rx, ry));
  g.fillStyle = color;
  g.fill(ell(x, y, rx, ry));
  if (detail > 0) {
    g.fillStyle = mixHex(color, PAL.white, 0.35);
    g.fill(ell(x - rx * 0.22 * F, y - ry * 0.25, rx * 0.55, ry * 0.5));
    g.fillStyle = hl;
    g.fill(ell(x - rx * 0.38 * F, y - ry * 0.42, Math.max(0.6, rx * 0.22), Math.max(0.6, ry * 0.2)));
  }
}

// ———————————————————— 王冠核心（大王冠与小皇冠共用：圆柱投影 + 绕竖轴 spin） ————————————————————
const CROWN_SPEC = {
  R: 56, band: 18, ry: 5.5, n: 5, hMain: 37, hOther: 28, wB: 14.5, ball: 6,
  main: PAL.gold, dark: PAL.goldDark, light: PAL.goldLight, inner: mixHex(PAL.goldDark, PAL.redDeep, 0.25),
  gem: PAL.red, gemMain: PAL.red, stud: PAL.goldLight, ballC: PAL.goldLight, cap: PAL.robeDark, capH: 21, capW: 0.74,
};
const TIARA_SPEC = {
  R: 23, band: 6.5, ry: 2.6, n: 5, hMain: 19, hOther: 11, wB: 6.8, ball: 2.9,
  main: PAL.gold, dark: PAL.goldDark, light: PAL.goldLight, inner: PAL.goldDark,
  gem: PAL.princess, gemMain: PAL.heart, stud: PAL.white, ballC: PAL.white, cap: null, capH: 0,
};

function crownCore(g, P, o) {
  const { spin = 0, squash = 0, t = 0, glint = 0, F = 1, mono = null, detail = 1, wraps } = o;
  const q = clamp(squash);
  const C = (c) => mono || c;
  const { R, band, ry, n } = P;
  const yb = (phi) => -ry * (1 - Math.cos(phi));
  const yt = (phi) => yb(phi) - band;
  g.save();
  const sx = 1 + 0.2 * q, sy = 1 - 0.44 * q;
  if (q) g.scale(sx, sy);
  // 尖：按深度排序
  const sp = [];
  for (let i = 0; i < n; i++) {
    const phi = spin + (TAU * i) / n;
    const c = Math.cos(phi), x = R * Math.sin(phi);
    sp.push({ i, phi, c, x, h: i === 0 ? P.hMain : P.hOther, main: i === 0 });
  }
  sp.sort((a, b) => a.c - b.c);
  const spike = (s, back) => {
    const w = P.wB * (0.38 + 0.62 * Math.abs(s.c)) * (s.main ? 1.08 : 1);
    const y0 = yt(s.phi) + (back ? 0 : 1.5);
    const splay = q * (s.x / R) * 26 * DEG;
    g.save();
    g.translate(s.x, y0);
    if (splay) g.rotate(splay);
    const h = s.h * (1 - 0.15 * q);
    const p = new Path2D();
    p.moveTo(-w, 3);
    p.quadraticCurveTo(-w * 0.32, -h * 0.42, 0, -h);
    p.quadraticCurveTo(w * 0.32, -h * 0.42, w, 3);
    p.closePath();
    if (back) {
      g.fillStyle = C(P.inner); g.fill(p);
      g.fillStyle = C(mixHex(P.dark, PAL.ink, 0.15));
      g.fill(ell(0, -h - P.ball * 0.55, P.ball * 0.9, P.ball * 0.9));
    } else {
      piece(g, p, C(P.main), { sh: detail ? 1.2 : 0, F, rim: mono || !detail ? null : P.light, rimW: 1.4 });
      if (!mono && detail) {
        shade(g, p, P.dark, w * F, 0, -w * 0.2 * F, -h * 0.5, 0.45, 0);
        // 中线压痕
        g.strokeStyle = rgba(P.dark, 0.55); g.lineWidth = 0.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, -h * 0.82); g.lineTo(0, 0); g.stroke();
      }
      const br = P.ball * (s.main ? 1.15 : 1) * (0.7 + 0.3 * Math.abs(s.c));
      g.fillStyle = C(mixHex(P.dark, PAL.ink, 0.2));
      g.fill(ell(0.6 * F, -h - br * 0.5 + 0.7, br, br));
      g.fillStyle = C(P.ballC);
      g.fill(ell(0, -h - br * 0.55, br, br));
      if (!mono && detail) { g.fillStyle = PAL.white; g.fill(ell(-br * 0.35 * F, -h - br * 0.85, br * 0.32, br * 0.32)); }
      s.top = [s.x, y0 - h - br * 1.55];
    }
    g.restore();
  };
  // 1) 背后的尖（内侧，暗）
  for (const s of sp) if (s.c < -0.05) spike(s, true);
  // 2) 开口内壁
  const open = new Path2D();
  open.ellipse(0, -band - ry, R, ry, 0, 0, TAU);
  g.fillStyle = C(P.inner); g.fill(open);
  // 3) 丝绒帽（大王冠）
  if (P.cap) {
    const cp = new Path2D();
    cp.ellipse(0, -band - ry, R * P.capW, P.capH * (1 - 0.3 * q), 0, Math.PI, TAU);
    cp.ellipse(0, -band - ry, R * P.capW, ry * 0.9, 0, 0, Math.PI);
    g.fillStyle = C(P.cap); g.fill(cp);
    if (!mono && detail) {
      shade(g, cp, PAL.ink, R * 0.6 * F, -band, -R * 0.3 * F, -band - P.capH, 0.35, 0);
      g.fillStyle = rgba(PAL.robe, 0.55);
      g.fill(ell(-R * 0.3 * F, -band - ry - P.capH * 0.55, R * 0.22, P.capH * 0.22, -0.4 * F));
    }
  }
  // 4) 前半圈箍
  const bandP = new Path2D();
  const N = 22;
  for (let k = 0; k <= N; k++) { const phi = -Math.PI / 2 + (Math.PI * k) / N; const x = R * Math.sin(phi); k ? bandP.lineTo(x, yb(phi)) : bandP.moveTo(x, yb(phi)); }
  for (let k = N; k >= 0; k--) { const phi = -Math.PI / 2 + (Math.PI * k) / N; bandP.lineTo(R * Math.sin(phi), yt(phi)); }
  bandP.closePath();
  if (mono) { g.fillStyle = mono; g.fill(bandP); }
  else {
    piece(g, bandP, lin(g, -R * F, 0, R * F, 0, [[0, P.light], [0.35, P.main], [1, P.dark]]), { sh: detail ? 1.4 : 0, F });
    if (detail) {
      // 上沿亮线 / 下沿暗线
      g.save(); g.lineCap = 'round';
      g.strokeStyle = rgba(PAL.white, 0.75); g.lineWidth = Math.max(0.8, band * 0.08);
      g.beginPath();
      for (let k = 0; k <= N; k++) { const phi = -Math.PI / 2 + (Math.PI * k) / N; const x = R * Math.sin(phi) * 0.97; k ? g.lineTo(x, yt(phi) + band * 0.12) : g.moveTo(x, yt(phi) + band * 0.12); }
      g.stroke();
      g.strokeStyle = rgba(P.dark, 0.9); g.lineWidth = Math.max(0.8, band * 0.1);
      for (const off of [0.24, 0.8]) {
        g.beginPath();
        for (let k = 0; k <= N; k++) { const phi = -Math.PI / 2 + (Math.PI * k) / N; const x = R * Math.sin(phi) * 0.98; const y = lerp(yt(phi), yb(phi), off); k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.globalAlpha = off < 0.5 ? 0.35 : 0.6;
        g.stroke();
      }
      g.restore();
    }
  }
  // 5) 前面的尖
  let mainTop = [0, yt(0) - P.hMain - P.ball * 2];
  for (const s of sp) if (s.c >= -0.05) { spike(s, false); if (s.main && s.top) mainTop = s.top; }
  // 6) 箍上的宝石与珠
  if (!mono && detail) {
    for (const s of sp) {
      if (s.c < 0.12) continue;
      const gy = (yb(s.phi) + yt(s.phi)) / 2;
      const r = (s.main ? band * 0.36 : band * 0.24);
      gem(g, s.x, gy, r * (0.3 + 0.7 * s.c), r * (s.main ? 1.18 : 1), s.main ? P.gemMain : P.gem, { F, detail });
    }
    for (let i = 0; i < n; i++) {
      const phi = spin + (TAU * (i + 0.5)) / n;
      const c = Math.cos(phi);
      if (c < 0.15) continue;
      const x = R * Math.sin(phi), y = (yb(phi) + yt(phi)) / 2;
      g.fillStyle = P.stud;
      g.fill(ell(x, y, band * 0.13 * (0.4 + 0.6 * c), band * 0.13));
    }
  }
  // 7) 勒痕（被线勒扁）
  const wr = wraps ?? q > 0.05;
  if (wr && q > 0) {
    g.save();
    g.strokeStyle = rgba(PAL.inkSoft, 0.85 * Math.min(1, q * 2)); g.lineWidth = 1.3; g.lineCap = 'round';
    for (const [k, off] of [[0, 0.35], [1, 0.62], [2, 0.5]]) {
      g.beginPath();
      for (let j = 0; j <= 16; j++) {
        const phi = -Math.PI / 2 + (Math.PI * j) / 16;
        const x = R * 1.02 * Math.sin(phi), y = lerp(yt(phi), yb(phi), off) + (k === 2 ? (j / 16 - 0.5) * band * 0.9 : 0);
        j ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }
  // 8) 闪光
  if (glint > 0 && !mono) {
    const gx = R * Math.sin(spin), gy = (yb(spin) + yt(spin)) / 2;
    if (Math.cos(spin) > 0) {
      glow(g, gx, gy, band * 1.6, PAL.goldLight, 0.6 * glint);
      sparkle(g, gx - band * 0.15, gy - band * 0.2, band * 0.9 * (0.75 + 0.25 * Math.sin(t * 7)), { rot: t * 0.8, alpha: glint, color: PAL.white });
    }
  }
  g.restore();
  return { top: [mainTop[0] * sx, mainTop[1] * sy], gem: [R * Math.sin(spin) * sx, ((yb(spin) + yt(spin)) / 2) * sy], h: (P.hMain + band + P.ball * 2) * sy };
}

/**
 * 国王的大王冠（单独飞、滚、落回头上时用；drawKing 内部也用它）。
 * 锚点 (x, y) = 前沿箍底中点（戴在头上时贴着头的那条线）。尺寸 s=1：宽约 112，高约 57。
 * o: { x, y, s, rot（弧度，平面旋转）, spin（绕竖轴转，弧度，宝石与尖跟着转）, squash 0..1（被线勒扁 + 勒痕）,
 *      wraps（是否画勒痕，默认 squash>0 时画）, glint 0..1（主宝石闪光）, t, F（面向，镜像时保持左上受光）, mono（单色剪影色）, alpha, detail }
 * 返回 { top（主尖顶珠的上沿）, base, gem }。
 */
export function drawCrown(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, alpha = 1 } = o;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.rotate(rot); X.scale(s);
  const r = crownCore(g, CROWN_SPEC, o);
  const out = { top: X.pt(...r.top), base: X.pt(0, 0), gem: X.pt(...r.gem) };
  X.restore();
  return out;
}

/**
 * 公主的小皇冠。锚点 = 前沿箍底中点。s=1 宽约 46，高约 28（戴在公主头上时由 drawPrincess 按头宽缩放）。
 * o: { x, y, s, rot, spin, glint 0..1（中心粉钻闪光）, t, F, mono, alpha, detail }
 */
export function drawTiara(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, alpha = 1 } = o;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.rotate(rot); X.scale(s);
  const r = crownCore(g, TIARA_SPEC, o);
  const out = { top: X.pt(...r.top), base: X.pt(0, 0), gem: X.pt(...r.gem) };
  X.restore();
  return out;
}

// ———————————————————— 金印 ————————————————————
/**
 * 和国王一样大的金印（木柄 + 金底），s=1 高约 180、底宽 132。
 * 锚点 (x, y) = 印面底边中点。o: { x, y, s, rot, lift 0..1（离开纸面的高度 0..110，并略微拉长 + 接触影变淡）,
 *   squash（砸下瞬间的挤压，>0 压扁）, inked（印面红泥，默认 true）, t, F, glint, alpha, shadow（接触影，默认 true）}
 * 返回 { grip（握把中点）, top（顶珠上沿）, base（印面底边中点，随 lift 抬起；lift 0 时 = 锚点）, face:[左端点, 右端点]（印面底边两端，各为 [x,y]） }。
 */
export function drawSeal(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, lift = 0, squash = 0, inked = true, t = 0, F = 1, glint = 0, alpha = 1, shadow = true, detail = 1 } = o;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.rotate(rot); X.scale(s);
  const L = clamp(lift);
  // 接触影（画在印的“地面”上，不随抬起移动）
  if (shadow) {
    const a = 0.28 * (1 - L * 0.8);
    g.fillStyle = rgba(PAL.shadow, a);
    g.fill(ell(4 * F, 2, 74 * (1 - 0.35 * L), 7 * (1 - 0.4 * L)));
  }
  X.translate(0, -L * 110);
  const st = L > 0 ? 1 + 0.06 * Math.sin(L * Math.PI) : 1;
  const [qx, qy] = squash ? [1 + 0.12 * squash, 1 - 0.16 * squash] : [1 / Math.sqrt(st), st];
  X.scale(qx, qy);
  // 印面红泥
  if (inked) {
    const ip = new Path2D(); ip.roundRect(-64, -7, 128, 7, [0, 0, 3, 3]);
    g.fillStyle = PAL.redDark; g.fill(ip);
    g.fillStyle = rgba(PAL.red, 0.8); g.fillRect(-62, -6.5, 124, 2.4);
  }
  // 方形底座
  const baseP = new Path2D(); baseP.roundRect(-66, -62, 132, 57, 9);
  piece(g, baseP, PAL.gold, { sh: 2.4, F, rim: PAL.goldLight, rimW: 2.5 });
  shade(g, baseP, PAL.goldDark, 66 * F, -5, -40 * F, -60, 0.6, 0);
  if (detail) {
    // 正面饰板 + 浮雕王冠
    const panel = new Path2D(); panel.roundRect(-55, -53, 110, 39, 6);
    g.strokeStyle = rgba(PAL.goldDark, 0.85); g.lineWidth = 2.2; g.stroke(panel);
    g.strokeStyle = rgba(PAL.goldLight, 0.7); g.lineWidth = 1; g.save(); g.translate(-0.8 * F, -0.8); g.stroke(panel); g.restore();
    g.save(); g.translate(0, -24); g.scale(0.36, 0.36);
    crownCore(g, CROWN_SPEC, { mono: mixHex(PAL.goldDark, PAL.gold, 0.25), F, detail: 0 });
    g.restore();
    g.fillStyle = rgba(PAL.goldDark, 0.7);
    for (const sx of [-44, 44]) g.fill(ell(sx, -33, 3.2, 3.2));
  }
  // 顶面（略可见）+ 台肩
  const top = new Path2D(); top.roundRect(-60, -70, 120, 10, 5);
  piece(g, top, mixHex(PAL.gold, PAL.goldLight, 0.45), { F });
  const sh = new Path2D();
  sh.moveTo(-44, -67); sh.quadraticCurveTo(-40, -86, -26, -90); sh.lineTo(26, -90); sh.quadraticCurveTo(40, -86, 44, -67); sh.closePath();
  piece(g, sh, PAL.gold, { sh: 1.5, F, rim: PAL.goldLight, rimW: 2 });
  shade(g, sh, PAL.goldDark, 40 * F, -70, -20 * F, -88, 0.55, 0);
  // 颈圈
  const col = new Path2D(); col.roundRect(-27, -99, 54, 11, 5);
  piece(g, col, PAL.goldDark, { sh: 1.2, F, rim: PAL.gold, rimW: 2 });
  // 木柄
  const hd = new Path2D();
  hd.moveTo(-14, -97); hd.bezierCurveTo(-12, -112, -11, -128, -16, -140); hd.lineTo(16, -140); hd.bezierCurveTo(11, -128, 12, -112, 14, -97); hd.closePath();
  piece(g, hd, PAL.wood, { sh: 1.5, F, rim: mixHex(PAL.wood, PAL.white, 0.35), rimW: 1.6 });
  shade(g, hd, PAL.woodDark, 14 * F, -110, -8 * F, -120, 0.6, 0);
  const ring = new Path2D(); ring.roundRect(-18, -146, 36, 8, 4);
  piece(g, ring, PAL.woodDark, { F });
  const knob = blob(0, -164, 23, 21, { seed: 41, amp: 0.012 });
  piece(g, knob, PAL.wood, { sh: 2, F, rim: mixHex(PAL.wood, PAL.white, 0.4), rimW: 2.2 });
  shade(g, knob, PAL.woodDark, 20 * F, -150, -12 * F, -180, 0.55, 0);
  if (detail) {
    g.strokeStyle = rgba(PAL.woodDark, 0.5); g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-8, -158); g.quadraticCurveTo(0, -150, 9, -160); g.stroke();
    g.beginPath(); g.moveTo(-3, -128); g.lineTo(-4, -104); g.stroke();
    g.fillStyle = rgba(PAL.white, 0.55); g.fill(ell(-8 * F, -172, 6, 3.5, -0.5 * F));
  }
  if (glint > 0) sparkle(g, -40 * F, -58, 16 * glint, { rot: t, alpha: glint });
  const out = { grip: X.pt(0, -120), top: X.pt(0, -185), base: X.pt(0, 0), face: [X.pt(-64, 0), X.pt(64, 0)] };
  X.restore();
  return out;
}

// ———————————————————— 印迹 ————————————————————
const STAMP_P0 = 0.25;
/** 印迹的进度换算：at = 砸下时刻（冲击帧），pre = 落下前影子扩大的时长，post = 放射线余波时长。返回 drawStampMark 的 p。 */
export function stampP(T, at, { pre = 0.12, post = 0.6 } = {}) {
  if (T < at - pre) return 0;
  if (T < at) return STAMP_P0 * (1 - (at - T) / pre);
  return Math.min(1, STAMP_P0 + ((1 - STAMP_P0) * (T - at)) / post);
}

/** 毛笔式粗细笔画（中间粗两头尖）。 */
function brush(pts, w, seed = 1) {
  return ribbon(pts, (u) => w * (0.42 + 0.58 * Math.sin(Math.PI * clamp(u * 0.92 + 0.06))) * (1 + 0.08 * noise1(u * 6, seed)));
}

/**
 * 印迹。kind: 'gold'（金箔印：双线圆角框 + 可选金字）| 'check'（红圈对勾）| 'x'（红色大叉）| 'error'（红圈「！」警示）。
 * 锚点 (x, y) = 印迹中心。p 0..1：0–0.25 印影压下（multiply 暗影缩小）→ 0.25 冲击（出现 + 挤压回弹 + 放射线 + 墨点）→ 1 定格。
 * 用 stampP(T, at) 把“砸下时刻”换算成 p。
 * o: { x, y, s, rot（默认 −0.08）, p, r（圆印半径，默认 90）, color（默认 red）, w, h（金印框尺寸，默认 300×110）,
 *      chars（金印里的字，数组或字符串）, charAppear[]（每字 0..1）, glyphSize, sweep 0..1（金箔扫光）, rays（放射线，默认 true）, seed, alpha }
 */
export function drawStampMark(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = -0.08, kind = 'check', p = 1, r = 90, seed = 3, alpha = 1, t = 0 } = o;
  if (p <= 0) return null;
  const isGold = kind === 'gold';
  const col = o.color || (isGold ? PAL.gold : PAL.red);
  const w = o.w ?? 300, h = o.h ?? 110;
  const ext = isGold ? Math.max(w, h) / 2 : r;
  const pre = clamp(p / STAMP_P0), post = clamp((p - STAMP_P0) / (1 - STAMP_P0));
  g.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  const outline = () => {
    if (isGold) { const q = new Path2D(); q.roundRect(-w / 2, -h / 2, w, h, 16); return q; }
    return ell(0, 0, r * 1.02, r * 1.02);
  };
  if (p < STAMP_P0) {
    // 印影：一块深色影子从大到小压下来
    const k = inQuad(pre);
    g.save();
    { const z = lerp(1.6, 1.04, k); g.scale(z, z); }
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgba(PAL.shadow, 0.08 + 0.32 * k);
    g.fill(outline());
    g.restore();
    g.restore();
    return { center: [x, y], impact: false };
  }
  // 冲击回弹
  const bounce = 1 + 0.12 * Math.exp(-post * 7) * Math.cos(post * 22);
  // 放射线
  if (o.rays !== false && post < 1) {
    const n = 14, a = Math.pow(1 - post, 1.4);
    g.save();
    g.strokeStyle = rgba(isGold ? PAL.goldDark : PAL.inkSoft, a);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + (hash2(seed, i) - 0.5) * 0.3;
      const r0 = ext * (1.12 + 0.55 * outCubic(post)) * (0.92 + 0.16 * hash2(seed + 1, i));
      const L = ext * (0.32 + 0.22 * hash2(seed + 2, i)) * (1 - post * 0.6);
      g.lineWidth = Math.max(1, ext * 0.035 * (1 - post * 0.5));
      g.beginPath();
      g.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0 * (isGold ? h / w * 1.4 : 1));
      g.lineTo(Math.cos(ang) * (r0 + L), Math.sin(ang) * (r0 + L) * (isGold ? h / w * 1.4 : 1));
      g.stroke();
    }
    g.restore();
  }
  g.scale(bounce, 2 - bounce);
  // 墨点（冲击溅出，之后留在纸上）
  if (!isGold) {
    g.fillStyle = rgba(col, 0.85);
    for (let i = 0; i < 7; i++) {
      const ang = hash2(seed + 7, i) * TAU, d = r * (1.12 + 0.3 * hash2(seed + 8, i));
      const rr = r * (0.018 + 0.03 * hash2(seed + 9, i)) * clamp(post * 6);
      g.fill(ell(Math.cos(ang) * d, Math.sin(ang) * d, rr, rr * 0.8));
    }
  }
  if (isGold) {
    // 金箔压印：底色淡金 + 双线框 + 角饰
    const fr = outline();
    g.fillStyle = rgba(PAL.goldLight, 0.22); g.fill(fr);
    g.save(); g.lineJoin = 'round';
    g.translate(1.2, 1.6); g.strokeStyle = rgba(PAL.goldDark, 0.65); g.lineWidth = 8; g.stroke(fr); g.restore();
    g.save(); g.lineJoin = 'round';
    g.strokeStyle = lin(g, -w / 2, -h / 2, w / 2, h / 2, [PAL.goldLight, PAL.gold, PAL.goldDark]); g.lineWidth = 8; g.stroke(fr);
    const inner = new Path2D(); inner.roundRect(-w / 2 + 13, -h / 2 + 13, w - 26, h - 26, 8);
    g.lineWidth = 2.4; g.strokeStyle = PAL.gold; g.stroke(inner);
    g.restore();
    g.fillStyle = PAL.gold;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const d = 0.0;
      g.fill(starPath(cx * (w / 2 - 13), cy * (h / 2 - 13) + d, 7, 3, 4, 0));
    }
    const chars = o.chars ? (Array.isArray(o.chars) ? o.chars : [...o.chars]) : [];
    if (chars.length) {
      const n = chars.length;
      const gs = o.glyphSize ?? Math.min(h * 0.6, ((w - 40) / n) / 0.82);
      const step = (w - 40) / n;
      for (let i = 0; i < n; i++) {
        const ap = o.charAppear ? clamp(o.charAppear[i] ?? 1) : 1;
        if (ap <= 0) continue;
        const cx = -w / 2 + 20 + step * (i + 0.5);
        paperGlyph(g, chars[i], cx, 2, gs, { style: 'gold', scale: ap < 1 ? outBack(ap, 2) : 1, alpha: Math.min(1, ap * 3) });
      }
    }
    const sw = o.sweep ?? 0;
    if (sw > 0 && sw < 1) {
      g.save(); g.clip(fr);
      g.globalCompositeOperation = 'screen';
      const sx = lerp(-w * 0.75, w * 0.75, sw);
      g.fillStyle = lin(g, sx - 40, 0, sx + 40, 0, [[0, rgba(PAL.goldLight, 0)], [0.5, rgba(PAL.white, 0.75)], [1, rgba(PAL.goldLight, 0)]]);
      g.translate(sx, 0); g.rotate(0.35); g.fillRect(-40, -h, 80, h * 2);
      g.restore();
      sparkle(g, sx + w * 0.05, -h * 0.32, 14, { rot: t * 2, alpha: Math.sin(sw * Math.PI) });
    }
  } else {
    // 红色印泥：双圈 + 符号（全部路径画）
    const ink = new Path2D();
    const ringO = new Path2D(); ringO.arc(0, 0, r, 0, TAU); ringO.arc(0, 0, r * 0.88, 0, TAU, true);
    const ringI = new Path2D(); ringI.arc(0, 0, r * 0.82, 0, TAU); ringI.arc(0, 0, r * 0.785, 0, TAU, true);
    ink.addPath(ringO); ink.addPath(ringI);
    if (kind === 'check') {
      ink.addPath(brush([[-0.46 * r, -0.04 * r], [-0.33 * r, 0.09 * r], [-0.17 * r, 0.3 * r], [0.03 * r, 0.1 * r], [0.24 * r, -0.16 * r], [0.47 * r, -0.44 * r]], r * 0.105, seed));
    } else if (kind === 'x') {
      ink.addPath(brush([[-0.44 * r, -0.44 * r], [-0.14 * r, -0.13 * r], [0.15 * r, 0.16 * r], [0.45 * r, 0.43 * r]], r * 0.11, seed));
      ink.addPath(brush([[0.43 * r, -0.45 * r], [0.12 * r, -0.12 * r], [-0.16 * r, 0.15 * r], [-0.44 * r, 0.42 * r]], r * 0.11, seed + 3));
    } else {
      // error：「！」
      const bar = new Path2D();
      bar.moveTo(-0.1 * r, -0.52 * r); bar.quadraticCurveTo(0, -0.58 * r, 0.1 * r, -0.52 * r);
      bar.lineTo(0.035 * r, 0.14 * r); bar.quadraticCurveTo(0, 0.18 * r, -0.035 * r, 0.14 * r); bar.closePath();
      ink.addPath(bar);
      ink.addPath(ell(0, 0.34 * r, 0.085 * r, 0.085 * r));
    }
    g.save();
    g.fillStyle = rgba(col, 0.92);
    g.fill(ink, 'nonzero');
    // 印泥斑驳（只在墨里画浅色斑，不擦掉底下的纸）
    g.clip(ink);
    g.fillStyle = rgba(mixHex(col, PAL.paper, 0.6), 0.55);
    for (let i = 0; i < 46; i++) {
      const ang = hash2(seed + 21, i) * TAU, d = Math.sqrt(hash2(seed + 22, i)) * r * 1.02;
      const rr = r * (0.012 + 0.03 * hash2(seed + 23, i));
      g.fill(ell(Math.cos(ang) * d, Math.sin(ang) * d, rr, rr * (0.5 + hash2(seed + 24, i) * 0.6), ang));
    }
    g.fillStyle = rgba(mixHex(col, PAL.ink, 0.3), 0.25);
    g.fill(ell(r * 0.2, r * 0.25, r * 0.9, r * 0.75));
    g.restore();
  }
  g.restore();
  return { center: [x, y], impact: true, post };
}

// ———————————————————— 星星权杖 ————————————————————
/**
 * 星星权杖。锚点 (x, y) = 握点（手的位置）；默认竖直、星在上。s=1 全长约 175（杖 135 + 星 50）。
 * o: { x, y, s, rot, t, glint 0..1（星尖闪光）, glow 0..1（星发光）, F, mono, alpha, detail }
 * 返回 { tip（星心）, bottom }。
 */
export function drawScepter(g, o = {}) {
  const { x = 0, y = 0, s = 1, rot = 0, t = 0, glint = 0, F = 1, mono = null, alpha = 1, detail = 1 } = o;
  const glowA = o.glow ?? 0;
  const C = (c) => mono || c;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.rotate(rot); X.scale(s);
  if (glowA > 0 && !mono) glow(g, 0, -112, 70, PAL.goldLight, 0.7 * glowA);
  // 杖身
  const rod = new Path2D(); rod.roundRect(-4.2, -92, 8.4, 142, 4);
  piece(g, rod, C(PAL.gold), { sh: 1.4, F, rim: mono ? null : PAL.goldLight, rimW: 1.3 });
  if (!mono && detail) {
    shade(g, rod, PAL.goldDark, 4 * F, 0, -2 * F, 0, 0.6, 0);
    g.save(); g.clip(rod);
    g.strokeStyle = rgba(PAL.goldDark, 0.7); g.lineWidth = 2;
    for (let yy = -84; yy < 48; yy += 11) { g.beginPath(); g.moveTo(-6, yy + 4); g.lineTo(6, yy - 3); g.stroke(); }
    g.restore();
  }
  piece(g, ell(0, 52, 7.2, 6.6), C(PAL.gold), { sh: 1.2, F, rim: mono ? null : PAL.goldLight });
  const collar = new Path2D(); collar.roundRect(-9, -98, 18, 9, 4);
  piece(g, collar, C(PAL.goldDark), { F, rim: mono ? null : PAL.gold });
  // 星
  const cy = -122;
  const st = starPath(0, cy, 27, 12.5, 5, -Math.PI / 2, 2.4);
  piece(g, st, C(PAL.gold), { sh: 2, F, rim: mono ? null : PAL.goldLight, rimW: 2 });
  if (!mono && detail) {
    shade(g, st, PAL.goldDark, 22 * F, cy + 22, -10 * F, cy - 10, 0.55, 0);
    g.fillStyle = rgba(PAL.goldLight, 0.85);
    g.fill(starPath(-2 * F, cy - 2, 14, 6.5, 5, -Math.PI / 2, 1.2));
    gem(g, 0, cy + 1, 5.6, 5.6, PAL.red, { F });
  }
  if (glint > 0 && !mono) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      const k = clamp(Math.sin(t * 5 + i * 1.7) * 0.5 + 0.5) * glint;
      if (k > 0.05) sparkle(g, Math.cos(a) * 29, cy + Math.sin(a) * 29, 9 * k, { rot: t, alpha: k });
    }
  }
  const out = { tip: X.pt(0, cy), bottom: X.pt(0, 58) };
  X.restore();
  return out;
}

// ———————————————————— 钟 ————————————————————
/**
 * 钟。锚点 (x, y) = 吊点（绕它摆）。s=1 高约 112、口宽 98。
 * o: { x, y, s, swing（弧度，当前摆角）, clapper（钟舌相对摆角，默认 −0.55·swing 表现滞后）, t, F, alpha, detail }
 * 声波弧线由镜头另画（misc.drawSpeechWave）。返回 { mouth（钟口中心）, top }。
 */
export function drawBell(g, o = {}) {
  const { x = 0, y = 0, s = 1, swing = 0, t = 0, F = 1, alpha = 1, detail = 1 } = o;
  const clap = o.clapper ?? -0.55 * swing;
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.scale(s); X.rotate(swing);
  // 吊环与钟钮
  g.save(); g.strokeStyle = PAL.goldDark; g.lineWidth = 4.5; g.beginPath(); g.arc(0, 7, 7, 0, TAU); g.stroke(); g.restore();
  const yoke = new Path2D(); yoke.roundRect(-13, 12, 26, 11, 4);
  piece(g, yoke, PAL.goldDark, { F, rim: PAL.gold });
  // 钟舌（在钟口里，先画）
  g.save();
  g.translate(0, 30); g.rotate(clap);
  g.strokeStyle = PAL.inkSoft; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 74); g.stroke();
  piece(g, ell(0, 80, 9.5, 9.5), mixHex(PAL.goldDark, PAL.ink, 0.35), { F });
  g.restore();
  // 钟体
  const body = new Path2D();
  body.moveTo(-25, 24);
  body.bezierCurveTo(-30, 24, -33, 40, -34, 58);
  body.bezierCurveTo(-35, 76, -40, 86, -50, 96);
  body.quadraticCurveTo(-52, 104, -44, 104);
  body.lineTo(44, 104);
  body.quadraticCurveTo(52, 104, 50, 96);
  body.bezierCurveTo(40, 86, 35, 76, 34, 58);
  body.bezierCurveTo(33, 40, 30, 24, 25, 24);
  body.closePath();
  piece(g, body, lin(g, -50 * F, 0, 50 * F, 0, [[0, PAL.goldLight], [0.3, PAL.gold], [1, PAL.goldDark]]), { sh: 2.5, F, rim: PAL.goldLight, rimW: 2 });
  if (detail) {
    g.save(); g.clip(body);
    g.strokeStyle = rgba(PAL.goldDark, 0.8); g.lineWidth = 2.2;
    for (const yy of [40, 46, 88]) { g.beginPath(); g.moveTo(-60, yy + (yy > 60 ? 0 : 0)); g.quadraticCurveTo(0, yy + 5, 60, yy); g.stroke(); }
    g.fillStyle = rgba(PAL.white, 0.5);
    g.fill(ell(-17 * F, 58, 4, 22, 0.06 * F));
    g.restore();
    g.fillStyle = rgba(PAL.goldDark, 0.85);
    g.fill(starPath(0, 67, 8, 3.6, 5));
  }
  // 钟口内侧阴影
  g.fillStyle = mixHex(PAL.goldDark, PAL.ink, 0.45);
  g.fill(ell(0, 103, 42, 4.5));
  const out = { mouth: X.pt(0, 104), top: X.pt(0, 0) };
  X.restore();
  return out;
}

// ———————————————————— 花环 / 彩旗串 / 花拱 ————————————————————
const FLOWER_C = [PAL.princess, PAL.goldLight, PAL.white, PAL.heart, PAL.princessLight, PAL.gold];
const FLAG_C = [PAL.princessLight, PAL.skyDayLow, PAL.leafLight, PAL.goldLight, PAL.heart, PAL.skyDay];

function flower(g, x, y, r, c, rot = 0, F = 1) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = rgba(PAL.shadow, 0.2);
  g.fill(ell(0.5 * F * r * 0.3, r * 0.3, r * 1.05, r * 1.05));
  g.fillStyle = c;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.fill(ell(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.5)); }
  g.fillStyle = c === PAL.goldLight || c === PAL.gold ? PAL.heart : PAL.gold;
  g.fill(ell(0, 0, r * 0.32, r * 0.32));
  g.fillStyle = rgba(PAL.white, 0.6); g.fill(ell(-r * 0.25 * F, -r * 0.35, r * 0.18, r * 0.14));
  g.restore();
}
function leaf(g, x, y, l, w, ang, c) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const p = new Path2D(); p.moveTo(0, 0); p.quadraticCurveTo(l * 0.5, -w, l, 0); p.quadraticCurveTo(l * 0.5, w, 0, 0); p.closePath();
  g.fillStyle = c; g.fill(p);
  g.strokeStyle = rgba(PAL.forestDeep, 0.35); g.lineWidth = 0.8; g.beginPath(); g.moveTo(l * 0.1, 0); g.lineTo(l * 0.85, 0); g.stroke();
  g.restore();
}

/**
 * 婚礼装饰，像立体书机关一样从上方铰链翻折下来。
 * kind: 'garland'（花环垂弧）| 'bunting'（彩旗串）| 'arch'（花拱）。
 * 锚点：garland / bunting 为两个挂点 (x0,y0)–(x1,y1)（铰链就是这条线），下垂 sag（默认跨度 0.18）；
 *       arch 为两个拱脚 (x0,y0)–(x1,y1)，拱高 h，铰链在拱顶。
 * o: { kind, x0, y0, x1, y1, sag, h, s（花与旗的大小），fold 0..1（0 折起看不见，1 挂好，带 outBack 过冲 + 半折时变暗），t（轻摆）, seed, F, alpha }
 * 返回 { mid（垂弧最低点 / 拱顶）}。
 */
export function drawGarland(g, o = {}) {
  const { kind = 'garland', x0 = 0, y0 = 0, x1 = 400, y1 = 0, s = 1, fold = 1, t = 0, seed = 7, F = 1, alpha = 1 } = o;
  const f = clamp(fold);
  if (f <= 0) return null;
  const k = f >= 1 ? 1 : outBack(f, 1.7);
  const span = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  g.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  let mid;
  if (kind === 'arch') {
    const h = o.h ?? span * 0.8;
    const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2 - h;
    mid = [ax, ay];
    g.translate(ax, ay); g.rotate(ang); g.scale(1, k);
    const pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40, a = Math.PI * (1 - u); pts.push([Math.cos(a) * span / 2, h - Math.sin(a) * h]); }
    // 叶带
    const band = ribbon(pts, () => 15 * s);
    g.save(); g.translate(1.5 * F, 2.5); g.fillStyle = rgba(PAL.shadow, 0.22); g.fill(band); g.restore();
    g.fillStyle = PAL.grass; g.fill(band);
    for (let i = 0; i <= 40; i++) {
      const [px, py] = pts[i];
      const a = Math.PI * (1 - i / 40) + Math.PI / 2;
      leaf(g, px, py, 18 * s, 6 * s, a + (hash2(seed, i) - 0.5) * 2.2, i % 3 ? PAL.leafLight : PAL.meadow);
    }
    for (let i = 1; i < 40; i += 3) {
      const [px, py] = pts[i];
      flower(g, px + (hash2(seed + 3, i) - 0.5) * 8 * s, py + (hash2(seed + 4, i) - 0.5) * 8 * s, (7 + 3 * hash2(seed + 5, i)) * s, FLOWER_C[i % FLOWER_C.length], hash2(seed + 6, i) * TAU, F);
    }
    // 两条垂下的丝带
    for (const sx of [-1, 1]) {
      const bx = sx * span * 0.5, by = h;
      const rp = [];
      for (let j = 0; j <= 8; j++) rp.push([bx + sx * j * 2 * s + Math.sin(t * 2.2 + j * 0.7 + sx) * j * 0.8 * s, by + j * 7 * s]);
      g.fillStyle = PAL.princess; g.fill(ribbon(rp, (u) => (5 - 2 * u) * s));
    }
  } else {
    const sag = (o.sag ?? span * 0.18) * (1 + 0.04 * Math.sin(t * 1.6 + seed));
    g.translate(x0, y0); g.rotate(ang); g.scale(1, k);
    mid = [(x0 + x1) / 2 - Math.sin(ang) * sag, (y0 + y1) / 2 + Math.cos(ang) * sag];
    const N = Math.max(8, Math.round(span / 14));
    const pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([u * span, 4 * sag * u * (1 - u)]); }
    if (kind === 'bunting') {
      g.save(); g.strokeStyle = PAL.inkSoft; g.lineWidth = 1.6 * s; g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); g.restore();
      const step = 46 * s, nf = Math.max(1, Math.floor(span / step));
      for (let i = 0; i < nf; i++) {
        const u = (i + 0.5) / nf;
        const px = u * span, py = 4 * sag * u * (1 - u);
        const slope = Math.atan(4 * sag * (1 - 2 * u) / span);
        const fl = Math.sin(t * 3 + i * 1.3 + seed) * 0.08;
        g.save(); g.translate(px, py); g.rotate(slope + fl);
        const fw = 17 * s, fh = 34 * s;
        const tri = new Path2D(); tri.moveTo(-fw, 0); tri.lineTo(fw, 0); tri.quadraticCurveTo(fw * 0.3, fh * 0.6, 0, fh); tri.quadraticCurveTo(-fw * 0.3, fh * 0.6, -fw, 0); tri.closePath();
        piece(g, tri, FLAG_C[(i + seed) % FLAG_C.length], { sh: 1.6 * s, F, rim: PAL.white, rimW: 1.5 * s });
        shade(g, tri, PAL.shadow, fw * F, fh, -fw * 0.3 * F, 0, 0.18, 0);
        g.fillStyle = rgba(PAL.white, 0.7); g.fill(ell(0, fh * 0.32, 3 * s, 3 * s));
        g.restore();
      }
    } else {
      // 叶绳 + 花
      const rope = ribbon(pts, () => 7 * s);
      g.save(); g.translate(1.5 * F, 2.4); g.fillStyle = rgba(PAL.shadow, 0.22); g.fill(rope); g.restore();
      g.fillStyle = PAL.grass; g.fill(rope);
      for (let i = 0; i <= N; i++) {
        const [px, py] = pts[i];
        leaf(g, px, py, 15 * s, 5 * s, (hash2(seed, i) - 0.5) * 2.8 + (i % 2 ? 0.6 : -0.6) + Math.PI / 2 * (i % 2 ? 1 : -1) * 0.4, i % 3 ? PAL.leafLight : PAL.meadow);
      }
      for (let i = 1; i < N; i += 2) {
        const [px, py] = pts[i];
        flower(g, px, py + 2 * s, (6.5 + 3 * hash2(seed + 2, i)) * s, FLOWER_C[(i + seed) % FLOWER_C.length], hash2(seed + 3, i) * TAU, F);
      }
      // 端点蝴蝶结
      for (const ex of [0, span]) {
        g.fillStyle = PAL.princess;
        g.fill(ell(ex - 7 * s, 2 * s, 7 * s, 4.5 * s, -0.4)); g.fill(ell(ex + 7 * s, 2 * s, 7 * s, 4.5 * s, 0.4));
        g.fillStyle = PAL.princessDark; g.fill(ell(ex, 2 * s, 3.2 * s, 3.2 * s));
      }
    }
  }
  // 半折时的背光
  if (k < 0.98) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(PAL.shadow, 0.35 * (1 - clamp(k)));
    g.fillRect(-5000, -5000, 10000, 10000);
  }
  g.restore();
  return { mid };
}

// ———————————————————— 摇篮 ————————————————————
/**
 * 摇篮（立体书机关）。锚点 (x, y) = 地面接触点中心。s=1：长 180、篮口高 96、篷顶约 150。
 * o: { x, y, s, rise 0..1（scaleY 0→1 outBack 立起 + 底部折角纸片）, rock（弧度，摇摆）, part:'back'|'front'|'all'（婴儿夹在中间）,
 *      hood（篷在哪一侧，1 右 / −1 左，默认 1）, t, F, alpha }
 * 返回 { baby（婴儿屁股落点，篮内）, rim（篮口中点）, hood（篷顶） }。
 */
export function drawCradle(g, o = {}) {
  const { x = 0, y = 0, s = 1, rise = 1, rock = 0, part = 'all', hood = 1, t = 0, F = 1, alpha = 1 } = o;
  const r = clamp(rise);
  const k = r >= 1 ? 1 : Math.max(0, outBack(r, 1.6));
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.scale(s);
  const back = part === 'back' || part === 'all', front = part === 'front' || part === 'all';
  // 底部折角纸片（立体书的粘贴脚）：立起过程中可见，立好后压平成一道细边
  if (back && r > 0) {
    const fold = 1 - k * 0.85;
    const tab = new Path2D();
    tab.moveTo(-96, 0); tab.lineTo(96, 0); tab.lineTo(104, 10 * fold + 3); tab.lineTo(-104, 10 * fold + 3); tab.closePath();
    g.fillStyle = PAL.paper2; g.fill(tab);
    g.strokeStyle = rgba(PAL.kraftDark, 0.7); g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(-96, 0.5); g.lineTo(96, 0.5); g.stroke(); g.setLineDash([]);
  }
  if (k <= 0.001) { X.restore(); return null; }
  X.scale(1, k);
  X.translate(0, -2);
  X.rotate(rock);
  X.scale(hood, 1);
  const dark = (1 - clamp(k)) * 0.4;
  const rimY = -96;
  if (back) {
    // 篮内壁
    const inner = ell(-4, rimY, 86, 13);
    g.fillStyle = mixHex(PAL.kraftDark, PAL.woodDark, 0.45); g.fill(inner);
    // 毯子背面（篮里）
    const bl = blob(-8, rimY - 2, 74, 9, { seed: 61, amp: 0.03 });
    g.fillStyle = mixHex(PAL.princessLight, PAL.princess, 0.25); g.fill(bl);
  }
  if (front) {
    // 摇脚
    const rk = new Path2D();
    rk.moveTo(-104, -28); rk.quadraticCurveTo(0, 14, 104, -28); rk.quadraticCurveTo(108, -24, 104, -18); rk.quadraticCurveTo(0, 26, -104, -18); rk.quadraticCurveTo(-108, -24, -104, -28); rk.closePath();
    piece(g, rk, PAL.woodDark, { sh: 2, F, rim: PAL.wood, rimW: 2 });
    for (const lx of [-56, 56]) {
      const leg = new Path2D(); leg.roundRect(lx - 6, -44, 12, 34, 4);
      piece(g, leg, PAL.wood, { F });
    }
    // 篮身（编织纹）
    const body = new Path2D();
    body.moveTo(-90, rimY); body.lineTo(82, rimY);
    body.bezierCurveTo(96, rimY + 8, 94, -54, 72, -38);
    body.quadraticCurveTo(0, -30, -72, -38);
    body.bezierCurveTo(-94, -54, -98, rimY + 8, -90, rimY);
    body.closePath();
    piece(g, body, PAL.kraft, { sh: 2.5, F, rim: mixHex(PAL.kraft, PAL.white, 0.4), rimW: 2.2 });
    g.save(); g.clip(body);
    g.strokeStyle = rgba(PAL.kraftDark, 0.75); g.lineWidth = 2.2;
    for (let i = -12; i <= 12; i++) {
      const bx = i * 8;
      g.beginPath(); g.moveTo(bx, rimY); g.quadraticCurveTo(bx + 4, -66, bx, -34); g.stroke();
    }
    g.strokeStyle = rgba(PAL.paper, 0.5); g.lineWidth = 3;
    for (const yy of [-82, -68, -54]) { g.beginPath(); g.moveTo(-100, yy); g.quadraticCurveTo(0, yy + 8, 100, yy); g.stroke(); }
    shade(g, body, PAL.woodDark, 90 * F, -36, -40 * F, rimY, 0.4, 0);
    g.restore();
    // 篮口边（木条）
    const rim = new Path2D(); rim.roundRect(-94, rimY - 6, 186, 12, 6);
    piece(g, rim, PAL.wood, { sh: 1.5, F, rim: mixHex(PAL.wood, PAL.white, 0.35), rimW: 2 });
    // 毯子翻边
    const bf = new Path2D();
    bf.moveTo(-80, rimY - 6);
    for (let i = 0; i <= 8; i++) { const bx = -80 + i * 17; bf.quadraticCurveTo(bx + 8.5, rimY + 12, bx + 17, rimY - 6); }
    bf.lineTo(-80, rimY - 12); bf.closePath();
    piece(g, bf, PAL.princessLight, { sh: 1.2, F, rim: PAL.white, rimW: 1.5 });
    for (let i = 0; i < 4; i++) { g.fillStyle = rgba(PAL.princess, 0.8); g.fill(heartPath(-58 + i * 34, rimY - 2, 8)); }
    // 篷（实心半穹顶，开口朝婴儿一侧，开口沿荷叶边）
    const hf = new Path2D();
    hf.moveTo(20, rimY + 4); hf.bezierCurveTo(16, -170, 110, -178, 114, rimY + 2); hf.closePath();
    piece(g, hf, PAL.princess, { sh: 2, F, rim: PAL.princessLight, rimW: 2.2 });
    g.save(); g.clip(hf);
    g.strokeStyle = rgba(PAL.princessDark, 0.45); g.lineWidth = 2.2; g.lineCap = 'round';
    for (const a of [0.18, 0.36, 0.54, 0.72]) {
      // 褶：从篷底右端放射到开口沿
      const ex = lerp(24, 70, a), ey = lerp(rimY - 10, -166, Math.sin(a * Math.PI * 0.62));
      g.beginPath(); g.moveTo(112, rimY + 2); g.quadraticCurveTo(lerp(112, ex, 0.5) + 6, lerp(rimY, ey, 0.5) - 10, ex, ey); g.stroke();
    }
    shade(g, hf, PAL.princessDark, 110 * F, rimY, 40 * F, -166, 0.42, 0);
    g.restore();
    // 开口沿的荷叶边（沿篷的左缘贝塞尔取点）
    const bz = (u) => {
      const p0 = [20, rimY + 4], p1 = [16, -170], p2 = [110, -178], p3 = [114, rimY + 2];
      const v = 1 - u;
      return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
    };
    const ruff = new Path2D();
    const NR = 9;
    for (let i = 0; i < NR; i++) {
      const [ax, ay] = bz(0.02 + (i / NR) * 0.5), [bx, by] = bz(0.02 + ((i + 1) / NR) * 0.5);
      const mx = (ax + bx) / 2 - 7, my = (ay + by) / 2 + 2;
      ruff.moveTo(ax, ay); ruff.quadraticCurveTo(mx, my, bx, by);
    }
    g.save(); g.strokeStyle = rgba(PAL.shadow, 0.25); g.lineWidth = 5; g.lineCap = 'round'; g.translate(1.2 * F, 2); g.stroke(ruff); g.restore();
    g.save(); g.strokeStyle = PAL.white; g.lineWidth = 4.5; g.lineCap = 'round'; g.stroke(ruff); g.restore();
    // 篷顶小星
    { const [hx, hy] = bz(0.5); g.fillStyle = PAL.gold; g.fill(starPath(hx + 4, hy - 4, 8, 3.6, 5)); }
    if (dark > 0) {
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = rgba(PAL.shadow, dark); g.fillRect(-200, -260, 400, 300); g.restore();
    }
  }
  const out = { baby: X.pt(-14, -72), rim: X.pt(0, rimY), hood: X.pt(70, -160) };
  X.restore();
  return out;
}

// ———————————————————— 红灯笼 ————————————————————
/**
 * 红灯笼。锚点 (x, y) = 吊点（绳顶）。s=1：灯身 52×56，含穗总高约 108。
 * o: { x, y, s, pulse 0..1（内光脉冲：灯身变亮 + 外光晕）, swing（弧度）, t, F, alpha, detail }
 * 返回 { center（灯心）, bottom }。
 */
export function drawLantern(g, o = {}) {
  const { x = 0, y = 0, s = 1, pulse = 0, swing = 0, t = 0, F = 1, alpha = 1, detail = 1 } = o;
  const P = clamp(pulse);
  const X = new Xf(g);
  X.save();
  if (alpha !== 1) g.globalAlpha *= clamp(alpha);
  X.translate(x, y); X.scale(s); X.rotate(swing);
  g.save(); g.strokeStyle = PAL.inkSoft; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 12); g.stroke(); g.restore();
  if (P > 0) glow(g, 0, 46, 92, PAL.fire, 0.55 * P);
  const capT = new Path2D(); capT.roundRect(-14, 11, 28, 9, 3);
  piece(g, capT, PAL.gold, { sh: 1, F, rim: PAL.goldLight, rimW: 1.4 });
  const body = blob(0, 46, 27, 28, { seed: 77, amp: 0.012 });
  const lit = mixHex(PAL.red, PAL.fire2, 0.45 * P);
  piece(g, body, rad(g, -6 * F, 40, 2, 34, [[0, mixHex(lit, PAL.fire2, 0.25 + 0.4 * P)], [0.55, lit], [1, mixHex(PAL.redDark, lit, 0.3 * P)]]), { sh: 2, F });
  if (detail) {
    g.save(); g.clip(body);
    g.strokeStyle = rgba(PAL.redDark, 0.75 - 0.25 * P); g.lineWidth = 1.6;
    for (const k of [-0.62, -0.25, 0.25, 0.62]) { g.beginPath(); g.ellipse(0, 46, Math.abs(k) * 27, 29, 0, -Math.PI / 2, Math.PI / 2, k < 0); g.stroke(); }
    g.strokeStyle = rgba(PAL.gold, 0.9); g.lineWidth = 2.4;
    for (const yy of [24, 68]) { g.beginPath(); g.moveTo(-30, yy); g.quadraticCurveTo(0, yy + (yy < 40 ? 5 : -5), 30, yy); g.stroke(); }
    g.fillStyle = rgba(PAL.white, 0.35 + 0.25 * P); g.fill(ell(-12 * F, 38, 4.5, 11, 0.15 * F));
    g.restore();
  }
  const capB = new Path2D(); capB.roundRect(-11, 71, 22, 7, 3);
  piece(g, capB, PAL.gold, { F, rim: PAL.goldLight, rimW: 1.2 });
  // 穗子
  piece(g, ell(0, 82, 4.2, 4.2), PAL.gold, { F });
  const sway = Math.sin(t * 2.4) * 2 - swing * 30;
  for (let i = -2; i <= 2; i++) {
    const pts = [[i * 1.6, 84], [i * 2.4 + sway * 0.5, 96], [i * 3 + sway, 108]];
    g.fillStyle = i % 2 ? PAL.redDark : PAL.red;
    g.fill(ribbon(pts, (u) => 1.6 - u * 0.6));
  }
  if (P > 0) glow(g, -4 * F, 42, 34, PAL.fire2, 0.45 * P);
  const out = { center: X.pt(0, 46), bottom: X.pt(0, 108) };
  X.restore();
  return out;
}

export { CROWN_SPEC, TIARA_SPEC, smoothPath };
