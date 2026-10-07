// 剪纸字与名字排版。
// 约定：名字一律逐字定格放置（不整串 fillText）；字的锚点是“字形视觉中心”。
// 核心版导出（NAME_TIMES / charsOf / segChars / paperGlyph / glyphWidth / glyphRow / typeOn / pointAt / glyphsOnPath /
// SLOT_STYLE / glyph13 / marquee）的签名与默认行为保持不变；界面组在此基础上扩充：
//   - style 材质预设（paperGlyph 的 o.style，glyphRow / typeOn / glyphsOnPath 透传）
//   - titleGlyphs（片名三层纸叠）、scrollInk（卷轴墨字）
//   - marquee 的 mode / pitch / state / stutter / slip / tremble
// 详见 docs/api/ui.md。
import { PAL, scaleOf, poly, rr } from '../core/paper.js';
import { NAMES } from '../cues.js';
import { TIMELINE } from '../timeline.js';
import { PROJECT } from '../project.js';
import { font } from '../core/fonts.js';
import { clamp, lerp, rgba, mixHex, hash2, noise1 } from '../core/util.js';
import { outBack } from '../core/ease.js';

// ———————————————————— 名字与逐字时刻 ————————————————————
/** Project-defined word event: {text, times} or {text, start, end}. */
export function segChars(id) {
  const event = TIMELINE.words?.[id];
  if (!event) throw new Error(`Unknown word event ${id}; define timeline.words or pass explicit characters/times`);
  return [...event.text];
}
export function NAME_TIMES(id) {
  const event = TIMELINE.words?.[id];
  if (!event) throw new Error(`Unknown word event ${id}; define timeline.words or pass explicit times`);
  const chars = [...event.text];
  return event.times || chars.map((_, i) => event.start + i * (event.end - event.start) / Math.max(1, chars.length));
}

/** NAMES 里某个名字的逐字数组。 */
export const charsOf = (name) => [...(NAMES[name] ?? name)];

// ———————————————————— 字形度量 ————————————————————
const metricCache = new Map();
/** 度量（按字体串 + 字缓存）。w 字宽；dy 让字形墨迹框竖直居中的基线偏移；h 墨迹高；ix 让墨迹框水平居中的偏移。 */
function metrics(g, f, ch) {
  const k = f + '|' + ch;
  let m = metricCache.get(k);
  if (!m) {
    g.save(); g.font = f; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const mm = g.measureText(ch);
    const asc = mm.actualBoundingBoxAscent, desc = mm.actualBoundingBoxDescent;
    m = { w: mm.width, dy: (asc - desc) / 2, h: asc + desc, ix: mm.width / 2 - (mm.actualBoundingBoxRight - mm.actualBoundingBoxLeft) / 2 };
    g.restore();
    if (metricCache.size > 5000) metricCache.clear();
    metricCache.set(k, m);
  }
  return m;
}

/** 共用基线：同一字体族里所有字按参考字（latin 用 'H'，其余用 '国'）的墨迹中心对齐，数字与标点不再各自居中。 */
function baseDy(g, f, family) { return metrics(g, f, family === 'latin' ? 'H' : '国').dy; }

// ———————————————————— 单字剪纸字 ————————————————————
/**
 * 单字剪纸字，(x, y) 为字形视觉中心。
 * o: { family='display', fill=PAL.red, edge=PAL.paper（纸边色，null 不画）, edgeW=0.12（纸边厚度/字号）,
 *      rot, scale, squashX, flipY, mirror, alpha, shadow(px，单字投影), stroke(墨线色), strokeW,
 *      weight(字重，latin 用 600–700), skew(斜体，弧度，正 = 顶部右倾), inkCenter(按墨迹框水平居中，「？」等标点用),
 *      baseline(共用基线：数字 / 拉丁串 / 带「.」「-」的界面字用；默认每字按自身墨迹框竖直居中),
 *      style（材质预设名，见 STYLES；给了 style 时其余选项覆盖预设） }
 * 返回字宽（未缩放）；style 带格子（tile/seal）时返回格宽。
 */
export function paperGlyph(g, ch, x, y, size, o = {}) {
  if (o.style) return styledGlyph(g, ch, x, y, size, o);
  const { family = 'display', fill = PAL.red, edge = PAL.paper, edgeW = 0.12, rot = 0, scale = 1, squashX = 1, flipY = false, mirror = false, alpha = 1, shadow = 0, stroke = null, strokeW = 0.04, weight = 400, skew = 0, inkCenter = false, baseline = false } = o;
  const f = font(size, family, weight);
  const m = metrics(g, f, ch);
  if (alpha <= 0 || scale <= 0) return m.w;
  const tx = inkCenter ? m.ix : 0;
  const dy = baseline ? baseDy(g, f, family) : m.dy;
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (skew) g.transform(1, 0, -Math.tan(skew), 1, 0, 0);
  g.scale(scale * squashX * (mirror ? -1 : 1), scale * (flipY ? -1 : 1));
  g.font = f;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  if (edge) {
    if (shadow > 0) {
      const s = scaleOf(g);
      g.shadowColor = rgba(PAL.shadow, 0.3);
      g.shadowBlur = shadow * 1.4 * s; g.shadowOffsetX = shadow * 0.35 * s; g.shadowOffsetY = shadow * 0.85 * s;
    }
    g.strokeStyle = edge;
    g.lineWidth = size * edgeW * 2;
    g.strokeText(ch, tx, dy);
    g.shadowColor = 'transparent';
  }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = size * strokeW * 2; g.strokeText(ch, tx, dy); }
  g.fillStyle = fill;
  g.fillText(ch, tx, dy);
  g.restore();
  return m.w;
}

/** 某字体下单字的字宽（用于排版）。 */
export const glyphWidth = (g, ch, size, family = 'display', weight = 400) => metrics(g, font(size, family, weight), ch).w;

// ———————————————————— 材质预设（style） ————————————————————
// 每个预设 = paperGlyph 的默认选项 + 可选 render(g, ch, L, size, o)。局部坐标原点 = 字形墨迹中心；
// L = { dy 基线偏移, h 墨迹高, w 字宽, tx 水平偏移 }。调用方传的选项覆盖预设（undefined 不覆盖）。

/** 竖向渐变（局部坐标，顶 → 底）。 */
function vgrad(g, h, stops) {
  const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1 || 1), c));
  return gr;
}
function fillOf(g, o, L) { return o.grad ? vgrad(g, L.h, o.grad) : o.fill; }

/** 斜向金箔扫光（只落在字形内）：o.foilX = 扫光带中心（调用方坐标的 x），o.foilW 半宽，o.foilColor。 */
function foilPass(g, ch, L, size, o, x, y) {
  if (o.foilX == null) return;
  const sc = (o.scale ?? 1) * (o.squashX ?? 1) || 1;
  const bx = (o.foilX - (o._x ?? 0)) / sc, bw = o.foilW ?? size * 0.26;
  if (Math.abs(bx) > bw + size) return;
  const a = 0.42, cx = Math.cos(a) * bw, cy = Math.sin(a) * bw;
  const gr = g.createLinearGradient(bx - cx, -cy, bx + cx, cy);
  const c = o.foilColor || PAL.goldLight, k = o.foilAlpha ?? 0.9;
  gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.3, rgba(c, k * 0.35)); gr.addColorStop(0.47, rgba(c, k * 0.85));
  gr.addColorStop(0.5, rgba(mixHex(c, PAL.white, 0.55), k)); gr.addColorStop(0.53, rgba(c, k * 0.85));
  gr.addColorStop(0.7, rgba(c, k * 0.35)); gr.addColorStop(1, rgba(c, 0));
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = gr;
  g.fillText(ch, x, y);
  g.restore();
}

/** 通用分层剪纸字：纸边 → 暗色错位底片（右下）→ 墨线 → 顶部切口亮边 → 主色 → 扫光。 */
function layered(g, ch, L, size, o) {
  const tx = L.tx, dy = L.dy;
  const d = size * (o.depth ?? 0.03), r = o.rim ? size * (o.lift ?? 0.022) : 0;
  if (o.edge) { g.strokeStyle = o.edge; g.lineWidth = size * (o.edgeW ?? 0.12) * 2; g.strokeText(ch, tx + d * 0.5, dy + (r + d) * 0.5); }
  if (o.under) { g.fillStyle = o.under; g.fillText(ch, tx + d, dy + r + d); }
  if (o.outline) { g.strokeStyle = o.outline; g.lineWidth = size * (o.outlineW ?? 0.025) * 2; g.strokeText(ch, tx, dy + r); }
  if (o.rim) { g.fillStyle = o.rim; g.fillText(ch, tx, dy); }
  g.fillStyle = fillOf(g, o, L);
  g.fillText(ch, tx, dy + r);
  foilPass(g, ch, L, size, o, tx, dy + r);
}

/** 字母牌（N2、O06）：厚纸板方牌 + 墨字。牌边长 = cell × 字号。 */
function renderTile(g, ch, L, size, o) {
  const s = size * (o.cell ?? 1.2), h = s / 2, cr = s * 0.15;
  const face = o.face || PAL.paper, side = o.side || PAL.kraftDark, line = o.line ?? PAL.ink;
  const dz = s * 0.06;
  g.fillStyle = mixHex(side, PAL.ink, 0.25);
  g.fill(rr(-h + dz * 0.5, -h + dz, s, s, cr));
  g.fillStyle = side;
  g.fill(rr(-h + dz * 0.25, -h + dz * 0.55, s, s, cr));
  const fp = rr(-h, -h, s, s, cr);
  g.fillStyle = face; g.fill(fp);
  const gr = g.createLinearGradient(0, -h, 0, h);
  gr.addColorStop(0, rgba(PAL.white, 0.6)); gr.addColorStop(0.22, rgba(PAL.white, 0));
  gr.addColorStop(0.7, rgba(side, 0)); gr.addColorStop(1, rgba(side, 0.32));
  g.fillStyle = gr; g.fill(fp);
  if (line) { g.strokeStyle = line; g.lineWidth = Math.max(1, s * 0.028); g.stroke(fp); }
  const cs = o.charScale ?? 0.86;
  g.save(); g.scale(cs, cs);
  g.fillStyle = rgba(side, 0.6); g.fillText(ch, L.tx + size * 0.022, L.dy + size * 0.03);
  g.fillStyle = o.fill || PAL.ink; g.fillText(ch, L.tx, L.dy);
  g.restore();
}

/** 印章字（N4）：红底方印 + 白字 + 内框 + 印泥斑驳。印边长 = cell × 字号，字 = 0.8 × 字号。 */
function renderSeal(g, ch, L, size, o) {
  const s = size * (o.cell ?? 1.12), h = s / 2;
  const seed = o.seed ?? (ch.codePointAt(0) % 997);
  const bg = o.bg || PAL.red;
  const p = poly([[-h, -h], [h, -h], [h, h], [-h, h]], { seed, amp: s * 0.012, step: s * 0.09, round: 0.15 });
  g.save(); g.translate(s * 0.022, s * 0.034); g.fillStyle = mixHex(bg, PAL.ink, 0.5); g.fill(p); g.restore();
  g.fillStyle = bg; g.fill(p);
  const gr = g.createLinearGradient(0, -h, 0, h);
  gr.addColorStop(0, rgba(PAL.white, 0.16)); gr.addColorStop(0.35, rgba(PAL.white, 0)); gr.addColorStop(1, rgba(PAL.redDeep, 0.28));
  g.fillStyle = gr; g.fill(p);
  const ins = s * 0.075;
  g.strokeStyle = rgba(o.fill || PAL.white, 0.9); g.lineWidth = s * 0.026;
  g.stroke(rr(-h + ins, -h + ins, s - ins * 2, s - ins * 2, s * 0.04));
  g.save(); g.scale(0.8, 0.8);
  g.fillStyle = o.fill || PAL.white; g.fillText(ch, L.tx, L.dy);
  g.restore();
  // 印泥斑驳：几粒底色小斑压在字与框上（固定种子）
  g.fillStyle = bg;
  for (let i = 0; i < 9; i++) {
    const rx = (hash2(seed, i) - 0.5) * s * 0.84, ry = (hash2(seed + 3, i) - 0.5) * s * 0.84, rd = s * (0.008 + hash2(seed + 7, i) * 0.016);
    g.beginPath(); g.ellipse(rx, ry, rd * 1.6, rd, hash2(seed + 9, i) * 3, 0, Math.PI * 2); g.fill();
  }
}

/**
 * 气球字（N3）：play 字形吹鼓（同色描边）+ 深色外缘 + 底部暗面 + 椭圆高光 + 小结。o.fill 粉彩色，o.puff 鼓起量（/字号），
 * o.ring 深色外缘宽（/字号），o.knot（false 不画小结）。
 * 鼓起与外缘按字号比例取得很薄（puff 0.006、ring 0.02，外缘最细 1px）：描边向字内的空隙也会长，
 * 太厚会把「鲁」「翁」「崩」这类多笔画字的内白糊死；简单字想更鼓可单独传大一点的 puff。
 */
function renderBalloon(g, ch, L, size, o) {
  const fill = o.fill || PAL.princessLight;
  const dark = mixHex(fill, PAL.ink, 0.45), deep = mixHex(fill, PAL.ink, 0.22);
  const puff = size * (o.puff ?? 0.006), ring = Math.max(1, size * (o.ring ?? 0.02)), tx = L.tx, dy = L.dy;
  if (o.knot !== false) {
    const ky = L.h / 2 + puff * 0.7;
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(-size * 0.05, ky + size * 0.07); g.lineTo(size * 0.05, ky + size * 0.07); g.lineTo(0, ky - size * 0.02); g.closePath(); g.fill();
  }
  g.strokeStyle = dark; g.lineWidth = puff * 2 + ring; g.strokeText(ch, tx, dy);
  g.strokeStyle = fill; g.lineWidth = puff * 2; g.strokeText(ch, tx, dy);
  g.fillStyle = fill; g.fillText(ch, tx, dy);
  const hh = L.h / 2 + puff;
  const gr = g.createLinearGradient(0, -hh, 0, hh);
  gr.addColorStop(0, rgba(PAL.white, 0.35)); gr.addColorStop(0.3, rgba(PAL.white, 0)); gr.addColorStop(0.7, rgba(deep, 0)); gr.addColorStop(1, rgba(deep, 0.6));
  g.strokeStyle = gr; g.lineWidth = puff * 2; g.strokeText(ch, tx, dy);
  g.fillStyle = gr; g.fillText(ch, tx, dy);
  g.fillStyle = rgba(PAL.white, 0.85);
  g.beginPath(); g.ellipse(-size * 0.2, -size * 0.27, size * 0.085, size * 0.035, -0.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(-size * 0.3, -size * 0.15, size * 0.018, 0, Math.PI * 2); g.fill();
}

/** 片名三层纸叠（达拉崩吧 300px）：底层 paper (+16,+16) / 中层 gold (+8,+8) / 顶层 red (0,0)，切口 goldLight 亮边，偏移随字号缩放。 */
function renderTitle3(g, ch, L, size, o) {
  const k = size / 300, o1 = 8 * k, o2 = 16 * k, tx = L.tx, dy = L.dy;
  g.fillStyle = rgba(PAL.shadow, 0.3); g.fillText(ch, tx + o2 + 5 * k, dy + o2 + 9 * k);
  const pc = o.paper || PAL.paper;
  g.strokeStyle = pc; g.lineWidth = 3 * k; g.strokeText(ch, tx + o2, dy + o2);
  g.fillStyle = pc; g.fillText(ch, tx + o2, dy + o2);
  g.fillStyle = vgrad(g, L.h, [PAL.goldLight, PAL.gold, PAL.goldDark]); g.fillText(ch, tx + o1, dy + o1);
  g.fillStyle = o.rim || PAL.goldLight; g.fillText(ch, tx, dy - 3.5 * k);
  g.fillStyle = vgrad(g, L.h, [mixHex(o.fill || PAL.red, PAL.white, 0.12), o.fill || PAL.red, mixHex(o.fill || PAL.red, PAL.redDark, 0.55)]);
  g.fillText(ch, tx, dy);
  foilPass(g, ch, L, size, o, tx, dy);
}

/** 龙背板字：lit 0 = 刻痕（几乎看不见），1 = 发光（goldLight + dragonDeep 边）；中间值两态叠化。 */
function renderPlate(g, ch, L, size, o) {
  const lit = clamp(o.lit ?? 1), tx = L.tx, dy = L.dy, d = size * 0.035;
  if (lit < 1) {
    const groove = lit <= 0 ? o.fill : (o.offFill || mixHex(PAL.dragonDark, PAL.ink, 0.4));
    g.save(); g.globalAlpha *= 1 - lit;
    g.fillStyle = rgba(PAL.dragonWing, 0.55); g.fillText(ch, tx + d, dy + d);
    g.fillStyle = groove || mixHex(PAL.dragonDark, PAL.ink, 0.4); g.fillText(ch, tx, dy);
    g.restore();
  }
  if (lit > 0) {
    g.save(); g.globalAlpha *= lit;
    const fill = lit >= 1 ? o.fill || PAL.goldLight : PAL.goldLight;
    if (o.edge !== null) { g.strokeStyle = o.edge || PAL.dragonDeep; g.lineWidth = size * (o.edgeW ?? 0.06) * 2; g.strokeText(ch, tx, dy); }
    g.fillStyle = mixHex(PAL.dragonEye, PAL.goldDark, 0.3); g.fillText(ch, tx + d * 0.7, dy + d * 0.7);
    g.fillStyle = fill; g.fillText(ch, tx, dy);
    g.fillStyle = vgrad(g, L.h, [rgba(PAL.white, 0.7), rgba(PAL.white, 0), rgba(PAL.white, 0)]); g.fillText(ch, tx, dy);
    g.restore();
  }
}

/** 火焰字字形（D2）：fire2 → fire → fireDeep 竖向渐变 + 暗红错位 + 亮芯；火舌由 props 另加。 */
function renderFire(g, ch, L, size, o) {
  const tx = L.tx, dy = L.dy, d = size * 0.032;
  if (o.edge) { g.strokeStyle = o.edge; g.lineWidth = size * (o.edgeW ?? 0.05) * 2; g.strokeText(ch, tx + d * 0.5, dy + d * 0.5); }
  g.fillStyle = PAL.fireDeep; g.fillText(ch, tx + d, dy + d);
  g.fillStyle = vgrad(g, L.h, o.grad || [PAL.fire2, PAL.fire, PAL.fireDeep]); g.fillText(ch, tx, dy);
  g.save(); g.globalAlpha *= 0.6;
  g.fillStyle = vgrad(g, L.h, [rgba(PAL.white, 0.95), rgba(PAL.fire2, 0.5), rgba(PAL.fire2, 0)]);
  g.fillText(ch, tx - d * 0.35, dy - d * 0.5);
  g.restore();
}

/** 石刻字（D3）：刻槽（左上暗壁、右下亮壁）+ glow 0..1 熔岩光透出。 */
function renderStone(g, ch, L, size, o) {
  const tx = L.tx, dy = L.dy, d = size * 0.03, gk = clamp(o.glow ?? 0);
  g.fillStyle = rgba(mixHex(PAL.stone, PAL.white, 0.35), 0.85); g.fillText(ch, tx + d, dy + d);
  g.fillStyle = rgba(PAL.ink, 0.55); g.fillText(ch, tx - d * 0.6, dy - d * 0.6);
  g.fillStyle = o.fill || PAL.dragonDeep; g.fillText(ch, tx, dy);
  if (gk > 0) {
    // 熔岩：亮橙填槽，再用槽色细描边把槽壁压暗（亮在中间、暗在边），最亮处一层 fire2 亮芯
    g.save();
    g.globalAlpha *= gk;
    g.fillStyle = vgrad(g, L.h, [PAL.fire2, PAL.fire, PAL.fireDeep]); g.fillText(ch, tx, dy);
    g.strokeStyle = o.fill || PAL.dragonDeep; g.lineWidth = size * 0.045; g.strokeText(ch, tx, dy);
    g.globalAlpha *= gk;
    g.fillStyle = rgba(PAL.fire2, 0.5); g.fillText(ch, tx, dy - d * 0.3);
    g.restore();
  }
}

/** 剑刃字牌上的墨字（刻在钢上）：右下一道亮边。 */
function renderSteel(g, ch, L, size, o) {
  const tx = L.tx, dy = L.dy, d = size * 0.028;
  g.fillStyle = rgba(PAL.white, 0.85); g.fillText(ch, tx + d, dy + d);
  g.fillStyle = o.fill || PAL.ink; g.fillText(ch, tx, dy);
  g.fillStyle = vgrad(g, L.h, [rgba(PAL.steelDark, 0.5), rgba(PAL.steelDark, 0), rgba(PAL.steelDark, 0)]); g.fillText(ch, tx, dy);
}

/** 卷轴墨字：o.reveal 0..1 从左往右“写”出（渐变遮罩 + 湿墨前沿 + 轻微晕墨）。 */
function renderInk(g, ch, L, size, o) {
  const rev = clamp(o.reveal ?? 1);
  if (rev <= 0) return;
  const tx = L.tx, dy = L.dy, col = o.fill || PAL.ink;
  const x0 = tx - L.w / 2 - size * 0.04, x1 = tx + L.w / 2 + size * 0.04, span = x1 - x0;
  const xr = lerp(x0, x1, rev), soft = size * 0.1;
  const mask = (c, a) => {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    const p2 = clamp((xr - x0) / span), p1 = Math.min(p2, clamp((xr - soft - x0) / span));
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(p1, rgba(c, a)); gr.addColorStop(p2, rgba(c, 0)); gr.addColorStop(1, rgba(c, 0));
    return rev >= 1 ? c : gr;
  };
  g.save();
  g.globalAlpha *= 0.22; g.strokeStyle = mask(col, 1); g.lineWidth = size * 0.035; g.strokeText(ch, tx + size * 0.01, dy + size * 0.01);
  g.restore();
  g.fillStyle = mask(col, 1); g.fillText(ch, tx, dy);
  if (rev < 1) {
    const gr = g.createLinearGradient(xr - soft * 2.2, 0, xr, 0);
    gr.addColorStop(0, rgba(PAL.ink, 0)); gr.addColorStop(0.8, rgba(PAL.ink, 0.55)); gr.addColorStop(1, rgba(PAL.ink, 0));
    g.fillStyle = gr; g.fillText(ch, tx, dy);
  }
}

/** 全部材质预设（键 = style 名）。 */
export const STYLES = {
  cut: { family: 'display', fill: PAL.red, edge: PAL.paper, edgeW: 0.12, under: PAL.redDeep, rim: mixHex(PAL.red, PAL.white, 0.38) },
  tile: { family: 'display', fill: PAL.ink, edge: null, cell: 1.2, face: PAL.paper, side: PAL.kraftDark, render: renderTile },
  balloon: { family: 'play', fill: PAL.princessLight, edge: null, render: renderBalloon },
  seal: { family: 'display', fill: PAL.white, bg: PAL.red, edge: null, cell: 1.12, render: renderSeal },
  gold: { family: 'display', grad: [PAL.goldLight, PAL.gold, PAL.goldDark], fill: PAL.gold, edge: null, under: mixHex(PAL.goldDark, PAL.ink, 0.3), outline: PAL.goldDark, outlineW: 0.016, rim: PAL.goldLight, lift: 0.016 },
  title3: { family: 'display', fill: PAL.red, render: renderTitle3 },
  plate: { family: 'display', fill: PAL.goldLight, edge: PAL.dragonDeep, edgeW: 0.06, lit: 1, render: renderPlate },
  fire: { family: 'display', edge: mixHex(PAL.fireDeep, PAL.redDeep, 0.4), edgeW: 0.05, render: renderFire },
  stone: { family: 'display', fill: PAL.dragonDeep, edge: null, glow: 0, render: renderStone },
  steel: { family: 'display', fill: PAL.ink, edge: null, render: renderSteel },
  petal: { family: 'display', fill: PAL.princessDark, edge: PAL.princessLight, edgeW: 0.06, under: mixHex(PAL.princessDark, PAL.ink, 0.4), depth: 0.022 },
  flag: { family: 'display', fill: PAL.ink, edge: PAL.paper, edgeW: 0.07, under: rgba(PAL.shadow, 0.35), depth: 0.025 },
  ink: { family: 'display', fill: PAL.ink, edge: null, reveal: 1, render: renderInk },
  banner: { family: 'display', fill: PAL.heroBlueDark, edge: null, under: mixHex(PAL.heroBlueDark, PAL.ink, 0.5), rim: mixHex(PAL.heroBlueDark, PAL.white, 0.32), depth: 0.024 },
  // 内部：走马灯暗窗里的灯字
  lamp: { family: 'display', fill: PAL.paper, edge: null, under: rgba(PAL.shadow, 0.65), depth: 0.035 },
};
export const STYLE_NAMES = Object.keys(STYLES).filter((k) => k !== 'lamp');

function styledGlyph(g, ch, x, y, size, o0) {
  const st = STYLES[o0.style] || STYLES.cut;
  const o = { ...st };
  for (const k in o0) if (o0[k] !== undefined) o[k] = o0[k];
  const f = font(size, o.family || 'display', o.weight || 400);
  const m = metrics(g, f, ch);
  const adv = o.cell ? Math.max(m.w, o.cell * size) : m.w;
  const alpha = o.alpha ?? 1, scale = o.scale ?? 1;
  if (alpha <= 0 || scale <= 0) return adv;
  o._x = x;
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.skew) g.transform(1, 0, -Math.tan(o.skew), 1, 0, 0);
  g.scale(scale * (o.squashX ?? 1) * (o.mirror ? -1 : 1), scale * (o.squashY ?? 1) * (o.flipY ? -1 : 1));
  g.font = f; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.miterLimit = 2;
  const L = { dy: o.baseline ? baseDy(g, f, o.family || 'display') : m.dy, h: m.h, w: m.w, tx: o.inkCenter ? m.ix : 0 };
  if (o.shadow > 0) {
    // 单字投影：先画一个带 canvas 投影的剪影，后面的层盖住它，只留下投影
    const s = scaleOf(g);
    g.save();
    g.shadowColor = rgba(PAL.shadow, 0.3); g.shadowBlur = o.shadow * 1.4 * s; g.shadowOffsetX = o.shadow * 0.35 * s; g.shadowOffsetY = o.shadow * 0.85 * s;
    g.fillStyle = o.edge || (typeof o.fill === 'string' ? o.fill : PAL.ink);
    if (o.edge) { g.strokeStyle = o.edge; g.lineWidth = size * (o.edgeW ?? 0.12) * 2; g.strokeText(ch, L.tx, L.dy); }
    else g.fillText(ch, L.tx, L.dy);
    g.restore();
  }
  (o.render || layered)(g, ch, L, size, o);
  g.restore();
  return adv;
}

/** 排版用的字宽：考虑 style 的字体族与格宽（tile/seal）。 */
export function glyphAdvance(g, ch, size, o = {}) {
  const st = o.style ? STYLES[o.style] : null;
  const fam = o.family || (st && st.family) || 'display';
  const w = glyphWidth(g, ch, size, fam, o.weight || 400);
  const cell = o.cell ?? (st && st.cell);
  return cell ? Math.max(w, cell * size) : w;
}

// ———————————————————— 一行 ————————————————————
/**
 * 逐字定格排一行。chars 为数组或字符串；(x, y) 为行的左端/中心（align）+ 字形中线。
 * o: { appear:[0..1]（每字出现进度，内部套 outBack，过冲约 1.15）, gap(px), pitch(固定字距，给了则忽略 gap),
 *      align:'left'|'center'|'right', perChar(i, ch) => 覆盖项 {dx, dy, rot, scale, alpha, fill, edge, squashX, flipY, mirror, skip},
 *      以及 paperGlyph 的其它选项（含 style） }
 * 返回每个字的中心位置 [{x, y, w}]。
 */
export function glyphRow(g, chars, x, y, size, o = {}) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  const gap = o.pitch ? 0 : o.gap ?? size * 0.02;
  const ws = arr.map((c) => (o.pitch ? o.pitch : glyphAdvance(g, c, size, o)));
  const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, arr.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const w = ws[i];
    const px = cx + w / 2;
    out.push({ x: px, y, w });
    cx += w + gap;
    const ov = o.perChar ? o.perChar(i, arr[i]) || {} : {};
    if (ov.skip) continue;
    const a = o.appear ? clamp(o.appear[i] ?? 1) : 1;
    if (a <= 0) continue;
    const pop = a >= 1 ? 1 : outBack(a, 2.2);
    paperGlyph(g, arr[i], px + (ov.dx || 0), y + (ov.dy || 0), size, { ...o, ...ov, scale: (ov.scale ?? 1) * pop, alpha: (ov.alpha ?? 1) * Math.min(1, a * 3) });
  }
  return out;
}

/** 打字机：逐字出现并轻弹一下（对白、界面）。p 0..1 为整句进度。返回行宽。 */
export function typeOn(g, text, x, y, size, p, o = {}) {
  const arr = [...text];
  const n = arr.length;
  const appear = arr.map((_, i) => clamp(p * n - i) * 1);
  return glyphRow(g, arr, x, y, size, { family: 'play', fill: PAL.ink, edge: null, ...o, appear });
}

// ———————————————————— 沿路径 ————————————————————
/** 折线弧长表。 */
function arcTable(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}
/** 弧长 s 处的点与切线角。 */
export function pointAt(pts, L, s) {
  s = clamp(s, 0, L[L.length - 1]);
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const k = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
  const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
  return [lerp(x1, x2, k), lerp(y1, y2, k), Math.atan2(y2 - y1, x2 - x1)];
}

/**
 * 沿折线按弧长排字（旋转跟切线但夹在 ±maxRot，永远正立）。
 * o: { size, start(弧长起点), gap, pitch(固定字距), grow 0..1（显示到第几个字）, vertical（竖排：沿路径放、字不转）,
 *      maxRot=15°, perChar, 以及 paperGlyph 选项（含 style） }
 * 返回每字 {x, y, ang}。
 */
export function glyphsOnPath(g, chars, pts, o = {}) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  const size = o.size || 72;
  const L = arcTable(pts);
  const maxRot = o.maxRot ?? (15 * Math.PI) / 180;
  const gap = o.pitch ? 0 : o.gap ?? size * 0.05;
  let s = o.start ?? 0;
  const shown = o.grow === undefined ? arr.length : o.grow * arr.length;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const w = o.pitch ? o.pitch : o.vertical ? size : glyphAdvance(g, arr[i], size, o);
    const [px, py, ang] = pointAt(pts, L, s + w / 2);
    s += w + gap;
    let a = o.vertical ? 0 : ang;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
    a = clamp(a, -maxRot, maxRot);
    out.push({ x: px, y: py, ang: a });
    const vis = clamp(shown - i);
    if (vis <= 0) continue;
    const ov = o.perChar ? o.perChar(i, arr[i]) || {} : {};
    if (ov.skip) continue;
    paperGlyph(g, arr[i], px + (ov.dx || 0), py + (ov.dy || 0), size, { ...o, ...ov, rot: (ov.rot ?? 0) + a, scale: (ov.scale ?? 1) * (vis >= 1 ? 1 : outBack(vis, 2.2)) });
  }
  return out;
}

// ———————————————————— 13 格字槽 ————————————————————
/** 各状态的字面样式（fill/edge 同核心版；style 指向材质预设）。 */
export const SLOT_STYLE = {
  off: { fill: mixHex(PAL.dragonDark, PAL.ink, 0.4), edge: null, alpha: 0.55, style: 'plate', lit: 0 },
  lit: { fill: PAL.goldLight, edge: PAL.dragonDeep, edgeW: 0.06, style: 'plate', lit: 1 },
  fire: { fill: PAL.fire2, edge: PAL.fireDeep, edgeW: 0.07, style: 'fire' },
  gold: { fill: PAL.gold, edge: PAL.goldDark, edgeW: 0.05, style: 'gold' },
  steel: { fill: PAL.ink, edge: null, style: 'steel' },
  stone: { fill: mixHex(PAL.stoneDark, PAL.ink, 0.35), edge: null, style: 'stone' },
};
const SLOT_GLOW = { lit: PAL.dragonEye, fire: PAL.fire, gold: PAL.goldLight, stone: PAL.fire, steel: PAL.white };
function softGlow(g, x, y, r, color, a) {
  if (a <= 0) return;
  g.save();
  g.globalCompositeOperation = 'screen';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, 0.75 * a)); gr.addColorStop(0.45, rgba(color, 0.3 * a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}
/**
 * 13 格字槽：anchors[i] = {x, y, ang}（每槽中心与朝向）。
 * o: { size, state:'lit' 或数组（off / lit / fire / gold / steel / stone，也可直接写任一 style 名如 'flag'、'petal'）,
 *      appear:[0..1], pop:[0..1] 额外弹跳, maxRot=15°,
 *      lit: 数字或数组 0..1（off ↔ 该槽状态的叠化，用于逐节点亮）, glow: 数字或数组 0..1（字后光晕，默认 0）,
 *      glyph: 额外传给 paperGlyph 的选项（如 { glow } 给 stone 熔岩光） }
 * 字永远正立（角度夹在 ±maxRot）。
 */
export function glyph13(g, chars, anchors, o = {}) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  const size = o.size || 72;
  const maxRot = o.maxRot ?? (15 * Math.PI) / 180;
  const pick = (v, i, d) => (Array.isArray(v) ? v[i] ?? d : v ?? d);
  for (let i = 0; i < arr.length && i < anchors.length; i++) {
    const an = anchors[i];
    const st = Array.isArray(o.state) ? o.state[i] : o.state || 'lit';
    const style = SLOT_STYLE[st] || (STYLES[st] ? { style: st } : SLOT_STYLE.lit);
    const a = o.appear ? clamp(o.appear[i] ?? 1) : 1;
    if (a <= 0) continue;
    let ang = an.ang || 0;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    ang = clamp(ang, -maxRot, maxRot);
    const pop = (a >= 1 ? 1 : outBack(a, 2.2)) * (1 + 0.25 * (o.pop ? o.pop[i] || 0 : 0));
    const fade = Math.min(1, a * 3);
    const gl = clamp(pick(o.glow, i, 0)) * fade;
    const k = o.lit === undefined ? 1 : clamp(pick(o.lit, i, 1));
    if (gl > 0 && SLOT_GLOW[st]) softGlow(g, an.x, an.y, size * 0.95 * pop, SLOT_GLOW[st], gl * k);
    const base = { family: 'display', ...(o.glyph || {}), rot: ang, scale: pop };
    if (k < 1 && st !== 'off') {
      const off = SLOT_STYLE.off;
      paperGlyph(g, arr[i], an.x, an.y, size, { ...base, ...off, alpha: off.alpha * fade * (1 - k) });
    }
    if (k > 0) paperGlyph(g, arr[i], an.x, an.y, size, { ...base, ...style, alpha: (style.alpha ?? 1) * fade * (st === 'off' ? 1 : k) });
  }
}

// ———————————————————— 走马灯 ————————————————————
/**
 * 状态预设（假定窗口是暗底，marqueePlate 会画）：idle 暗淡静止｜active 奶油字 + 中线金字｜hit 红闪哆嗦｜
 * angry 红字粗边右倾｜cracked 卡顿跳格 + 偶尔下滑｜empty 不画字。
 */
export const MARQUEE_STATES = {
  idle: { style: 'lamp', fill: mixHex(PAL.paper, PAL.ink, 0.5) },
  active: { style: 'lamp', fill: PAL.paper, centerGold: true },
  hit: { style: 'lamp', fill: mixHex(PAL.paper, PAL.heart, 0.45), tremble: 4 },
  angry: { style: 'lamp', fill: PAL.heart, under: PAL.redDeep, edge: PAL.redDeep, edgeW: 0.07, skew: 0.2, tremble: 1.6 },
  cracked: { style: 'lamp', fill: mixHex(PAL.paper, PAL.ink, 0.18), stutter: true, slip: true, centerGold: true },
  empty: { empty: true },
};

/**
 * 在 rect 窗口里横向滚动一串字（用 rect 裁剪）。
 * 偏移（默认 mode 'fit'，同核心版）= (总宽 − 窗宽) × progress：0 显示开头，1 显示结尾。
 * o: { size, gap, family, fill, edge, centerGold（经过窗口中线的字变 goldLight）, shake(px),
 *      pitch（固定字距，如剧场名字牌 63）,
 *      mode: 'fit' | 'pass'（跨度 = 总宽 + 窗宽：0 时首字刚从右边进窗，1 时末字刚出左边）|
 *            'center'（0 时首字在中线，1 时末字在中线）, span / lead（自定义：偏移 = −lead + span × progress）,
 *      state: MARQUEE_STATES 的键, stutter（逐格跳 + 跳后一抖）, slip（个别字往下滑一截）, tremble(px，逐字哆嗦，配 t),
 *      skew, t（秒，驱动哆嗦）, seed, glyph（额外 paperGlyph 选项） }
 * 返回 { centerIndex（当前位于中线的字序号）, centerX, offset, passed（已越过中线的字数）, items:[{i,x,y}] }。
 */
export function marquee(g, chars, rect, progress, o0 = {}) {
  const arr = Array.isArray(chars) ? chars : [...chars];
  const o = o0.state ? { ...(MARQUEE_STATES[o0.state] || {}), ...o0 } : o0;
  const size = o.size || 72, fam = o.family || 'display', gap = o.pitch ? 0 : o.gap ?? size * 0.05;
  const ws = arr.map((c) => (o.pitch ? o.pitch : glyphWidth(g, c, size, fam)));
  const total = ws.reduce((a, b) => a + b, 0) + gap * (arr.length - 1);
  const p = clamp(progress);
  const centers = [];
  { let acc = 0; for (let i = 0; i < arr.length; i++) { centers.push(acc + ws[i] / 2); acc += ws[i] + gap; } }
  let off;
  if (o.span !== undefined || o.lead !== undefined) off = -(o.lead ?? 0) + (o.span ?? total + rect.w) * p;
  else if (o.mode === 'pass') off = -rect.w + (total + rect.w) * p;
  else if (o.mode === 'center') { const c0 = centers[0] ?? 0, c1 = centers[centers.length - 1] ?? 0; off = c0 - rect.w / 2 + (c1 - c0) * p; }
  else off = Math.max(0, total - rect.w) * p;
  const cell = o.pitch || (arr.length ? total / arr.length : size);
  let jolt = 0;
  if (o.stutter) {
    const u = off / cell, n = Math.floor(u + 1e-6), f = u - n;
    off = n * cell;
    jolt = Math.exp(-f * 5) * Math.sin(f * 38);
  }
  const mid = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const t = o.t ?? p * 6;
  const seed = o.seed ?? 7;
  let centerIndex = -1, passed = 0;
  const items = [];
  g.save();
  g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip();
  for (let i = 0; i < arr.length; i++) {
    const cx = rect.x - off + centers[i];
    if (Math.abs(cx - mid) <= ws[i] / 2 + gap / 2) centerIndex = i;
    if (cx < mid) passed++;
    items.push({ i, x: cx, y: cy });
    if (o.empty) continue;
    if (cx > rect.x - size && cx < rect.x + rect.w + size) {
      const gold = o.centerGold && (o.style ? Math.abs(cx - mid) <= cell / 2 : Math.abs(cx - mid) < ws[i] * 0.6);
      let dx = o.shake ? Math.sin(i * 7.3 + progress * 90) * o.shake : 0, dy = 0, rot = 0;
      if (o.tremble) { dx += noise1(t * 26 + i * 3.1, seed) * o.tremble; dy += noise1(t * 24 + i * 5.7, seed + 9) * o.tremble * 0.8; rot += noise1(t * 20 + i, seed + 4) * 0.05; }
      if (jolt) { dx += jolt * size * 0.06 * (hash2(seed, i) - 0.5) * 2; dy += jolt * size * 0.05; }
      if (o.slip && hash2(seed + 21, i) < 0.3) {
        const k = clamp((mid + rect.w * 0.45 - cx) / rect.w);
        dy += k * size * (0.12 + hash2(seed + 5, i) * 0.12); rot += k * (hash2(seed + 6, i) - 0.5) * 0.35;
      }
      const fill = gold ? PAL.goldLight : o.fill || PAL.ink;
      if (o.style) {
        paperGlyph(g, arr[i], cx + dx, cy + dy, size, { family: fam, ...(o.glyph || {}), style: o.style, fill, edge: o.edge ?? null, edgeW: o.edgeW, under: gold ? PAL.goldDark : o.under, skew: o.skew, rot });
        if (gold) softGlow(g, cx, cy, size * 0.8, PAL.goldLight, 0.35);
      } else {
        paperGlyph(g, arr[i], cx + dx, cy + dy, size, { family: fam, fill, edge: o.edge ?? null, skew: o.skew, rot });
      }
    }
  }
  g.restore();
  return { centerIndex, centerX: mid, offset: off, passed, items };
}

// ———————————————————— 片名 ————————————————————
/**
 * 片名「达拉崩吧」三层纸叠（storyboard 4.9：display 300px，基线 y=560，中心 x=960）。
 * o: { x=960（行中心）, y=560（基线）, size=300, chars='达拉崩吧', gap,
 *      rise:[4]（每字 scaleY 0→1 的线性进度，内部套 outBack，以基线为锚）,
 *      foil 0..1（金箔扫光从左到右；null 不画）, starAt（四角星闪的时刻）, t（秒）, alpha }
 * 返回每字 {x, y（墨迹中心）, w, top（字顶 y）}。
 */
export function titleGlyphs(g, o = {}) {
  const chars = [...(o.chars ?? PROJECT.title ?? '纸艺故事')];
  const size = o.size ?? 300, x = o.x ?? 960, y = o.y ?? 560, gap = o.gap ?? size * 0.035;
  const f = font(size, 'display');
  const ms = chars.map((c) => metrics(g, f, c));
  const total = ms.reduce((a, m) => a + m.w, 0) + gap * (chars.length - 1);
  const x0 = x - total / 2;
  const foilX = o.foil == null ? null : lerp(x0 - size * 0.6, x0 + total + size * 0.6, clamp(o.foil));
  const out = [];
  let cx = x0;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  for (let i = 0; i < chars.length; i++) {
    const m = ms[i], px = cx + m.w / 2;
    cx += m.w + gap;
    out.push({ x: px, y: y - m.dy, w: m.w, top: y - m.dy - m.h / 2 });
    const r = o.rise ? clamp(o.rise[i] ?? 1) : 1;
    if (r <= 0) continue;
    const sy = r >= 1 ? 1 : Math.max(0.001, outBack(r, 1.9));
    const sx = 1 + (1 - Math.min(1, sy)) * 0.1;
    g.save();
    g.translate(px, y);
    g.scale(sx, sy);
    g.translate(0, -m.dy);
    g.font = f; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    const opt = { ...STYLES.title3, scale: 1, squashX: sx, _x: px, foilX, foilW: size * 0.34 };
    renderTitle3(g, chars[i], { dy: m.dy, h: m.h, w: m.w, tx: 0 }, size, opt);
    g.restore();
  }
  if (o.starAt != null && o.t != null) {
    const k = (o.t - o.starAt) / 0.65;
    if (k >= 0 && k <= 1 && out.length) {
      const last = out[out.length - 1];
      const sx = last.x + last.w * 0.42, sy = last.top + size * 0.04, s = size * 0.2 * Math.sin(Math.PI * k);
      softGlow(g, sx, sy, s * 2.4, PAL.goldLight, Math.sin(Math.PI * k));
      starPath(g, sx, sy, s, k * 1.4, PAL.white);
    }
  }
  g.restore();
  return out;
}
/** 四角星（type.js 内部用；界面的符号统一走 kit.glyphIcon('sparkle4')）。 */
function starPath(g, x, y, s, rot, color) {
  if (s <= 0) return;
  g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? s * 0.2 : s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.restore();
}

// ———————————————————— 卷轴墨字 ————————————————————
/**
 * 卷轴墨字从左往右“写”出。text：字符串（'\n' 分行）或行数组；rect：{x, y, w, h} 书写区。
 * p 0..1：整段书写进度（逐字依次写，每字内部从左往右显影）。
 * o: { size（默认按行数撑满 rect 高的 78%）, family='display', fill=PAL.ink（金墨传 PAL.goldDark）, align:'left'|'center',
 *      lineHeight, gap, alpha }
 * 返回 { pen:[x,y]（当前笔尖，供鹅毛笔跟随）, chars:[{x,y,ch,line}], size }。
 */
export function scrollInk(g, text, rect, p, o = {}) {
  const lines = (Array.isArray(text) ? text : String(text).split('\n')).map((s) => [...s]);
  const n = lines.reduce((a, l) => a + l.length, 0);
  const fam = o.family || 'display';
  const size = o.size ?? Math.min((rect.h / lines.length) * 0.78, rect.w / Math.max(1, ...lines.map((l) => l.length)) / 0.8);
  const lh = o.lineHeight ?? size * 1.22, gap = o.gap ?? size * 0.04;
  const y0 = rect.y + rect.h / 2 - (lh * (lines.length - 1)) / 2;
  const prog = clamp(p) * n;
  const chars = [];
  let k = 0;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  lines.forEach((line, li) => {
    const ws = line.map((c) => glyphWidth(g, c, size, fam));
    const tot = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, line.length - 1);
    let cx = o.align === 'center' ? rect.x + rect.w / 2 - tot / 2 : rect.x;
    const cy = y0 + li * lh;
    line.forEach((ch, i) => {
      const px = cx + ws[i] / 2;
      cx += ws[i] + gap;
      const rev = clamp(prog - k);
      chars.push({ x: px, y: cy, w: ws[i], ch, line: li });
      if (rev > 0) paperGlyph(g, ch, px, cy, size, { style: 'ink', family: fam, fill: o.fill || PAL.ink, reveal: rev });
      k++;
    });
  });
  g.restore();
  // 笔尖：正在写的那个字的显影前沿（写完停在末字右侧）
  let pen = [rect.x, y0 + size * 0.15];
  if (chars.length) {
    const c = Math.min(chars.length - 1, Math.floor(prog)), r = prog >= n ? 1 : clamp(prog - c), q = chars[c];
    pen = [q.x - q.w / 2 + q.w * r, q.y + size * 0.15];
  }
  return { pen, chars, size };
}
