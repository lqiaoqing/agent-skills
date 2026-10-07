// 村庄道具：宝箱与容器、道具小图标、听岔五图标（docs/assets.md 9.6）。
// 约定：drawXxx(g, o)，o.x/o.y 锚点（容器 = 底边中心着地点；图标 = 中心），o.s 缩放，o.rot 弧度，o.t 秒。
// 纸艺：每个部件一片剪纸（cut + 切口亮边 rim + shade 明暗），部件之间用暗色错位底片分层，投影一律右下。
import { PAL, blob, poly, rr, ribbon, smooth as smoothPath, cut, shade, lin, rad, glow, rays, sparkle, line } from '../core/paper.js';
import { clamp, lerp, TAU, hash2, noise1, rgba, mixHex, fract, wobble } from '../core/util.js';
import { outBack, outCubic, inOutCubic } from '../core/ease.js';
import { heartPath, starPath } from './misc.js';

const HALF_PI = Math.PI / 2;

/** 一片剪纸 + 右下暗色错位底片（部件分层）。 */
function piece(g, path, fill, o = {}) {
  const { under = 0.26, dx = 1.6, dy = 2.6, rim = null, rimW = 2 } = o;
  if (under > 0) {
    g.save();
    g.translate(dx, dy);
    g.fillStyle = rgba(PAL.shadow, under);
    g.fill(path);
    g.restore();
  }
  cut(g, path, fill, { rim, rimW });
}
const lighten = (c, k = 0.4) => mixHex(c, PAL.white, k);
const darken = (c, k = 0.3) => mixHex(c, PAL.ink, k);
const beginAt = (g, o) => {
  g.save();
  g.translate(o.x || 0, o.y || 0);
  if (o.rot) g.rotate(o.rot);
  const s = o.s ?? 1;
  if (s !== 1) g.scale(s, s);
  if (o.alpha !== undefined && o.alpha !== 1) g.globalAlpha *= clamp(o.alpha);
};

/** 开口进度 → 默认金光强度（迸一下，全开后留 0.55）。 */
const openGlow = (k) => (k <= 0 ? 0 : k < 0.35 ? k / 0.35 : 1 - 0.45 * clamp((k - 0.35) / 0.65));
/** 容器里迸出的金光：o 位于口部中心。 */
function treasureLight(g, x, y, k, w, t, seed = 1) {
  if (k <= 0) return;
  g.save();
  glow(g, x, y - w * 0.2, w * 1.6, PAL.gold, 0.55 * k);
  glow(g, x, y, w * 0.8, PAL.goldLight, 0.8 * k);
  g.beginPath(); g.rect(x - w * 4, y - w * 5, w * 8, w * 5); g.clip();
  rays(g, x, y, w * 3.2 * (0.7 + 0.3 * k), { n: 11, width: 0.1, rot: -HALF_PI + Math.sin(t * 0.8) * 0.05, color: PAL.goldLight, alpha: 0.55 * k, r0: w * 0.15, seed });
  g.restore();
  for (let i = 0; i < 6; i++) {
    const ph = fract(t * 0.9 + hash2(seed, i));
    const sx = x + (hash2(seed + 1, i) - 0.5) * w * 1.6, sy = y - ph * w * 2.2 - w * 0.2;
    sparkle(g, sx, sy, (5 + 5 * hash2(seed + 2, i)) * k * (1 - ph * 0.5), { color: i % 2 ? PAL.white : PAL.goldLight, alpha: k * (1 - ph) });
  }
}

// ———————————————————— 宝箱（简易三维折纸盒：盖子绕后沿铰链真的翻开） ————————————————————
const KX = -0.32, KY = 0.36;                       // 斜投影：x' = x + KX·z，y' = y − KY·z（z 向里）
const VIEW = [-KX, KY, 1];                         // 视线方向（向里）
const P3 = (x, y, z) => [x + KX * z, y - KY * z];
const quad = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };

/**
 * 宝箱。锚 = 前面底边中心（着地点）。s=1 宽 124（big 时 168）。
 * o: { x, y, s, rot, t, open 0..1（盖子绕后沿翻开约 115°）, big（大宝箱：更大、红丝绒内衬、宝石锁）, burst 0..1（金光迸出）, alpha }
 * 返回 { mouth:[x,y]（箱口中心，父坐标近似）, lid:[x,y] }。
 */
export function drawChest(g, o = {}) {
  const { t = 0, open = 0, big = false, burst = 0, seed = 3 } = o;
  const W = big ? 168 : 124, Hb = big ? 84 : 64, D = big ? 96 : 74, Hl = big ? 18 : 14, Hc = big ? 34 : 26;
  const th = clamp(open) * 2.0;                    // 弧度（约 115°）
  const s = o.s ?? 1;
  const mouth = [(o.x || 0) + s * (KX * D * 0.5), (o.y || 0) + s * (-Hb - KY * D * 0.5)];
  if ((o.alpha ?? 1) <= 0) return { mouth, lid: mouth };
  beginAt(g, o);
  const wood = big ? mixHex(PAL.wood, PAL.redDark, 0.2) : PAL.wood;
  const woodL = mixHex(wood, PAL.sand, 0.3), woodD = mixHex(wood, PAL.woodDark, 0.55);
  // 着地阴影
  g.fillStyle = rgba(PAL.shadow, 0.24);
  g.beginPath(); g.ellipse(KX * D * 0.5 + 8, -KY * D * 0.5 + 4, W * 0.62, D * 0.3, 0, 0, TAU); g.fill();

  // 盖子剖面（z, y），绕铰链 (D, −Hb) 转 th
  const prof = [[0, -Hb], [0, -Hb - Hl]];
  for (let j = 1; j < 8; j++) prof.push([D * j / 8, -Hb - Hl - Hc * Math.sin(Math.PI * j / 8)]);
  prof.push([D, -Hb - Hl], [D, -Hb]);
  const c = Math.cos(th), sn = Math.sin(th);
  const rp = prof.map(([z, y]) => { const dz = z - D, dy = y + Hb; return [D + dz * c - dy * sn, -Hb + dz * sn + dy * c]; });
  const drawLid = () => {
    const m = rp.length;
    for (let i = 0; i < m; i++) {
      const [z1, y1] = rp[i], [z2, y2] = rp[(i + 1) % m];
      const dz = z2 - z1, dy = y2 - y1;
      const nz = dy, ny = -dz, nl = Math.hypot(nz, ny) || 1;
      if (ny * VIEW[1] + nz * VIEW[2] >= 0) continue;
      const lit = clamp(0.55 + 0.45 * ((-ny / nl) * 0.8 + (-nz / nl) * 0.45));
      const under = i === m - 1;
      const front = i === 0;
      let col = under ? (big ? PAL.redDark : mixHex(PAL.woodDark, PAL.ink, 0.25)) : front ? mixHex(PAL.goldDark, PAL.goldLight, lit * 0.8) : mixHex(woodD, woodL, lit);
      const f = quad([P3(-W / 2, y1, z1), P3(W / 2, y1, z1), P3(W / 2, y2, z2), P3(-W / 2, y2, z2)]);
      g.fillStyle = col; g.fill(f);
      g.strokeStyle = col; g.lineWidth = 0.8; g.stroke(f);
      if (!under && !front) {
        // 金箍带
        for (const xs of [-W * 0.3, W * 0.3]) {
          const b = quad([P3(xs - 7, y1, z1), P3(xs + 7, y1, z1), P3(xs + 7, y2, z2), P3(xs - 7, y2, z2)]);
          g.fillStyle = mixHex(PAL.goldDark, PAL.goldLight, lit * 0.85); g.fill(b);
        }
      }
      if (under && big) {
        g.save(); g.clip(f); g.fillStyle = rgba(PAL.red, 0.35);
        g.fill(quad([P3(-W / 2 + 8, y1, z1), P3(W / 2 - 8, y1, z1), P3(W / 2 - 8, y2, z2), P3(-W / 2 + 8, y2, z2)])); g.restore();
      }
    }
    // 左端盖（剖面）
    const cap = quad(rp.map(([z, y]) => P3(-W / 2, y, z)));
    g.fillStyle = mixHex(woodD, PAL.woodDark, 0.35); g.fill(cap);
    g.strokeStyle = PAL.goldDark; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke(cap);
    // 搭扣（随盖子转）
    const hz = 0, hy = -Hb - Hl * 0.2;
    const hp = [[-7, hy], [7, hy], [6, hy + 14], [-6, hy + 14]].map(([x, y]) => {
      const dz = hz - D, dy = y + Hb; return P3(x, -Hb + dz * sn + dy * c, D + dz * c - dy * sn);
    });
    if (c > 0.15) { const hasp = quad(hp); g.fillStyle = PAL.gold; g.fill(hasp); g.strokeStyle = PAL.goldDark; g.lineWidth = 1.5; g.stroke(hasp); }
  };
  if (th > 1.65) drawLid();
  // —— 箱体 ——
  const side = quad([P3(-W / 2, 0, 0), P3(-W / 2, 0, D), P3(-W / 2, -Hb, D), P3(-W / 2, -Hb, 0)]);
  piece(g, side, woodD, { under: 0 });
  g.save(); g.clip(side);
  g.strokeStyle = rgba(PAL.woodDark, 0.7); g.lineWidth = 2;
  for (const yy of [-Hb / 3, (-2 * Hb) / 3]) { const a = P3(-W / 2, yy, 0), b = P3(-W / 2, yy, D); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.restore();
  const sideStrap = quad([P3(-W / 2, 0, 0), P3(-W / 2, 0, 9), P3(-W / 2, -Hb, 9), P3(-W / 2, -Hb, 0)]);
  g.fillStyle = PAL.goldDark; g.fill(sideStrap);
  // 箱口（开盖可见）
  if (th > 0.02) {
    const mouthP = quad([P3(-W / 2, -Hb, 0), P3(W / 2, -Hb, 0), P3(W / 2, -Hb, D), P3(-W / 2, -Hb, D)]);
    g.fillStyle = big ? PAL.redDeep : mixHex(PAL.woodDark, PAL.ink, 0.45); g.fill(mouthP);
    g.save(); g.clip(mouthP);
    const [mx, my] = P3(0, -Hb, D * 0.55);
    g.fillStyle = lin(g, 0, my - 30, 0, my + 30, [PAL.goldLight, PAL.coin, PAL.coinDark]);
    g.beginPath(); g.ellipse(mx + 4, my + 10, W * 0.46, D * 0.36, 0, 0, TAU); g.fill();
    for (let i = 0; i < 9; i++) {
      const cx = mx + (hash2(seed, i) - 0.5) * W * 0.7, cy = my + (hash2(seed + 1, i) - 0.3) * D * 0.3;
      g.fillStyle = PAL.coinDark; g.beginPath(); g.ellipse(cx + 1, cy + 1.5, 7, 4, 0, 0, TAU); g.fill();
      g.fillStyle = PAL.coin; g.beginPath(); g.ellipse(cx, cy, 7, 4, 0, 0, TAU); g.fill();
    }
    if (big) { sparkle(g, mx - 10, my + 2, 7, { color: PAL.crystal }); cut(g, blob(mx + 22, my + 4, 7, 6, { seed: 4, n: 16 }), PAL.heart, { rim: PAL.white }); }
    g.restore();
    glow(g, mx, my, W * 0.55, PAL.goldLight, 0.5 * clamp(open * 2));
  }
  const front = rr(-W / 2, -Hb, W, Hb, 3);
  piece(g, front, wood, { under: 0, rim: woodL, rimW: 2.5 });
  g.save(); g.clip(front);
  shade(g, front, PAL.woodDark, 0, -Hb, 0, 0, 0, 0.35);
  g.strokeStyle = rgba(PAL.woodDark, 0.75); g.lineWidth = 2;
  for (const yy of [-Hb / 3, (-2 * Hb) / 3]) { g.beginPath(); g.moveTo(-W / 2, yy); g.lineTo(W / 2, yy); g.stroke(); }
  for (let i = 0; i < 5; i++) { g.strokeStyle = rgba(PAL.woodDark, 0.25); g.beginPath(); g.moveTo(-W / 2 + 10 + i * 23, -Hb * 0.15 - (i % 3) * 14); g.lineTo(-W / 2 + 26 + i * 23, -Hb * 0.15 - (i % 3) * 14); g.stroke(); }
  g.restore();
  // 金箍带 + 铆钉 + 包角
  for (const xs of [-W * 0.3, W * 0.3]) {
    const band = rr(xs - 7, -Hb, 14, Hb, 2);
    cut(g, band, PAL.gold, { rim: PAL.goldLight, rimW: 2 });
    shade(g, band, PAL.goldDark, 0, -Hb, 0, 0, 0, 0.5);
    for (const yy of [-Hb + 8, -8]) { g.fillStyle = PAL.goldDark; g.beginPath(); g.arc(xs, yy, 2.2, 0, TAU); g.fill(); }
  }
  for (const sx of [-1, 1]) {
    g.fillStyle = PAL.goldDark;
    g.beginPath(); g.moveTo(sx * W / 2, 0); g.lineTo(sx * (W / 2 - 16), 0); g.lineTo(sx * W / 2, -16); g.closePath(); g.fill();
  }
  // 锁片
  const lock = big ? blob(0, -Hb + 15, 15, 17, { seed: 8, n: 26 }) : rr(-11, -Hb + 2, 22, 24, 6);
  cut(g, lock, PAL.gold, { rim: PAL.goldLight, rimW: 2 });
  shade(g, lock, PAL.goldDark, -10, -Hb, 10, -Hb + 26, 0, 0.5);
  g.fillStyle = PAL.ink;
  g.beginPath(); g.arc(0, -Hb + 12, 3.4, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-2, -Hb + 13); g.lineTo(2, -Hb + 13); g.lineTo(3, -Hb + 21); g.lineTo(-3, -Hb + 21); g.closePath(); g.fill();
  if (big) { cut(g, blob(0, -Hb + 32, 5, 5, { seed: 12, n: 14 }), PAL.heart, { rim: PAL.white, rimW: 1.5 }); }
  if (th <= 1.65) drawLid();
  const [mx, my] = P3(0, -Hb, D * 0.5);
  treasureLight(g, mx, my, clamp(burst), W * 0.5, t, seed);
  g.restore();
  const [lx, ly] = P3(0, -Hb - Hl - Hc, D * 0.5);
  return { mouth, lid: [(o.x || 0) + s * lx, (o.y || 0) + s * ly] };
}

// ———————————————————— 陶罐 / 木桶 / 花盆 ————————————————————
/**
 * 陶罐（村民的罐子）。锚 = 底边中心。s=1 高约 96。
 * o: { x, y, s, rot, t, open 0..1（罐盖弹起歪倒 + 金光）, burst（覆盖金光强度）, alpha }
 */
export function drawPot(g, o = {}) {
  const { t = 0, open = 0, seed = 5 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  beginAt(g, o);
  const R = [[21, 0], [33, -9], [42, -30], [41, -50], [33, -66], [21, -76], [17, -82], [22, -88], [25, -93]];
  const outline = smoothPath([...R, ...R.slice().reverse().map(([x, y]) => [-x, y])], { closed: true, tension: 0.45 });
  g.fillStyle = rgba(PAL.shadow, 0.22);
  g.beginPath(); g.ellipse(6, 1, 40, 7, 0, 0, TAU); g.fill();
  const body = PAL.earth;
  cut(g, outline, lin(g, -42, 0, 42, 0, [lighten(body, 0.25), body, darken(body, 0.2)]), { rim: lighten(body, 0.45), rimW: 2.5 });
  g.save(); g.clip(outline);
  // 腰带纹
  g.fillStyle = PAL.roofRed; g.fillRect(-50, -48, 100, 12);
  g.fillStyle = PAL.paper;
  for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(i * 9 - 4, -36); g.lineTo(i * 9, -44); g.lineTo(i * 9 + 4, -36); g.closePath(); g.fill(); }
  g.fillStyle = PAL.sand;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(i * 12, -24, 2.2, 0, TAU); g.fill(); }
  shade(g, outline, PAL.woodDark, -42, -94, 42, 0, 0, 0.35);
  g.restore();
  // 罐口
  g.fillStyle = mixHex(PAL.woodDark, PAL.ink, 0.4);
  g.beginPath(); g.ellipse(0, -92, 20, 4.5, 0, 0, TAU); g.fill();
  const k = clamp(open);
  treasureLight(g, 0, -92, clamp(o.burst ?? openGlow(k)), 34, t, seed);
  // 罐盖
  const lift = k > 0 ? outBack(k, 2) * 46 : 0;
  const tilt = k * 0.55 + wobble(k * 2, 0.5, 2, 0.25) * 0.15;
  g.save();
  g.translate(k * 14, -92 - lift); g.rotate(tilt);
  const lidBase = rr(-25, -4, 50, 8, 4);
  piece(g, lidBase, PAL.roofRed, { rim: lighten(PAL.roofRed, 0.4) });
  const dome = new Path2D(); dome.ellipse(0, -4, 21, 13, 0, Math.PI, TAU); dome.closePath();
  piece(g, dome, PAL.earth, { rim: lighten(PAL.earth, 0.45) });
  shade(g, dome, PAL.woodDark, -20, -16, 20, 0, 0, 0.3);
  piece(g, blob(0, -19, 6, 5.5, { seed: 6, n: 16 }), PAL.roofRed, { rim: lighten(PAL.roofRed, 0.5) });
  g.restore();
  g.restore();
}

/**
 * 木桶。锚 = 底边中心。s=1 高约 110。o: { x, y, s, rot, t, open 0..1（桶盖弹起翻转 + 金光）, burst, alpha }
 */
export function drawBarrel(g, o = {}) {
  const { t = 0, open = 0, seed = 7 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  beginAt(g, o);
  const H = 110, top = -H, rx = 40, bulge = 8;
  g.fillStyle = rgba(PAL.shadow, 0.22);
  g.beginPath(); g.ellipse(6, 1, 46, 8, 0, 0, TAU); g.fill();
  const bodyP = new Path2D();
  bodyP.moveTo(-rx, top); bodyP.quadraticCurveTo(-rx - bulge * 2, top / 2, -rx, 0);
  bodyP.ellipse(0, 0, rx, 9, 0, Math.PI, 0, true);
  bodyP.quadraticCurveTo(rx + bulge * 2, top / 2, rx, top);
  bodyP.closePath();
  cut(g, bodyP, lin(g, -rx - bulge, 0, rx + bulge, 0, [lighten(PAL.wood, 0.28), PAL.wood, darken(PAL.wood, 0.25)]), { rim: lighten(PAL.wood, 0.45) });
  g.save(); g.clip(bodyP);
  g.strokeStyle = rgba(PAL.woodDark, 0.7); g.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    const xb = i * 11.5;
    g.beginPath(); g.moveTo(xb, top); g.quadraticCurveTo(xb * 1.35, top / 2, xb, 0); g.stroke();
  }
  for (const yy of [-22, -88]) {
    const hoop = new Path2D();
    const w = rx + bulge * (1 - ((yy - top / 2) / (top / 2)) ** 2) * 1.4;
    hoop.ellipse(0, yy, w + 2, 7, 0, 0, Math.PI); hoop.ellipse(0, yy - 9, w + 2, 7, 0, Math.PI, 0, true); hoop.closePath();
    g.fillStyle = PAL.stoneDark; g.fill(hoop);
    g.fillStyle = rgba(PAL.white, 0.25); g.fillRect(-w, yy - 9, w * 2, 2);
    for (const sx of [-0.55, 0.55]) { g.fillStyle = PAL.stone2; g.beginPath(); g.arc(sx * w, yy - 2, 1.8, 0, TAU); g.fill(); }
  }
  shade(g, bodyP, PAL.woodDark, 0, top, 0, 0, 0, 0.3);
  g.restore();
  // 桶口
  const k = clamp(open);
  g.fillStyle = k > 0 ? mixHex(PAL.woodDark, PAL.ink, 0.5) : PAL.woodDark;
  g.beginPath(); g.ellipse(0, top, rx, 9, 0, 0, TAU); g.fill();
  treasureLight(g, 0, top, clamp(o.burst ?? openGlow(k)), 36, t, seed);
  // 桶盖（弹起翻转）
  const lift = k > 0 ? outBack(k, 1.8) * 52 : 0;
  const flip = Math.cos(k * Math.PI * 1.15);
  g.save();
  g.translate(k * -10, top - lift); g.rotate(-k * 0.4);
  g.scale(1, Math.max(0.08, Math.abs(flip)));
  const lid = new Path2D(); lid.ellipse(0, 0, rx - 2, 8, 0, 0, TAU);
  piece(g, lid, flip > 0 ? lighten(PAL.wood, 0.18) : PAL.woodDark, { rim: lighten(PAL.wood, 0.5) });
  g.save(); g.clip(lid); g.strokeStyle = rgba(PAL.woodDark, 0.6); g.lineWidth = 1.5;
  for (const xx of [-13, 0, 13]) { g.beginPath(); g.moveTo(xx, -9); g.lineTo(xx, 9); g.stroke(); }
  g.restore();
  g.restore();
  g.restore();
}

/**
 * 花盆。锚 = 底边中心。s=1 高约 70（花另高 70）。o: { x, y, s, rot, t, open 0..1（整株连土拔起 + 金光）, burst, alpha }
 */
export function drawFlowerPot(g, o = {}) {
  const { t = 0, open = 0, seed = 9 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  beginAt(g, o);
  const k = clamp(open);
  g.fillStyle = rgba(PAL.shadow, 0.22);
  g.beginPath(); g.ellipse(6, 1, 36, 6, 0, 0, TAU); g.fill();
  const potCol = PAL.roofRed;
  const pot = poly([[-26, 0], [26, 0], [34, -54], [-34, -54]], { seed, amp: 0.6, round: 0.15 });
  piece(g, pot, lin(g, -34, 0, 34, 0, [lighten(potCol, 0.2), potCol, darken(potCol, 0.2)]), { rim: lighten(potCol, 0.4) });
  // 口沿
  const rim = rr(-40, -68, 80, 16, 5);
  piece(g, rim, lighten(potCol, 0.08), { rim: lighten(potCol, 0.5), rimW: 2.5 });
  shade(g, rim, PAL.redDeep, 0, -68, 0, -52, 0, 0.3);
  g.fillStyle = rgba(PAL.paper, 0.75);
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(i * 12, -26, 3, 0, TAU); g.fill(); }
  // 盆口（拔起后露出）
  g.fillStyle = mixHex(PAL.woodDark, PAL.ink, 0.35);
  g.beginPath(); g.ellipse(0, -66, 34, 5, 0, 0, TAU); g.fill();
  treasureLight(g, 0, -66, clamp(o.burst ?? openGlow(k)), 32, t, seed);
  // 植株 + 土团
  const lift = k > 0 ? outBack(k, 1.6) * 58 : 0;
  const sw = Math.sin(t * 1.6) * 0.04 + wobble(k * 2, 0.4, 2.5, 0.3) * 0.12;
  g.save();
  g.translate(0, -66 - lift); g.rotate(sw + k * 0.12);
  if (k > 0.05) {
    g.strokeStyle = rgba(PAL.kraftDark, 0.9); g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-14 + i * 7, 6); g.quadraticCurveTo(-16 + i * 8, 16, -12 + i * 6 + (i % 2) * 6, 22 * k); g.stroke(); }
  }
  const soil = blob(0, 2, 33, 8, { seed: seed + 1, amp: 0.06, n: 26 });
  cut(g, soil, PAL.woodDark);
  // 叶
  for (const [lx, a, L] of [[-6, -0.9, 26], [6, 0.8, 24], [-2, -0.3, 20]]) {
    g.save(); g.translate(lx, -6); g.rotate(a);
    const leaf = blob(0, -L / 2, 7, L / 2, { seed: seed + lx + 30, amp: 0.05, n: 20 });
    piece(g, leaf, PAL.grass, { rim: PAL.leafLight, under: 0.18 });
    g.strokeStyle = rgba(PAL.grassDark, 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -L + 3); g.stroke();
    g.restore();
  }
  // 花茎 + 三朵花
  const FL = [[-16, -52, PAL.heart], [4, -66, PAL.gold], [18, -46, PAL.princess]];
  FL.forEach(([fx, fy, col], i) => {
    g.strokeStyle = PAL.grassDark; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(fx * 0.3, -4); g.quadraticCurveTo(fx * 0.5, fy * 0.5, fx, fy); g.stroke();
    const bob = Math.sin(t * 2 + i * 1.7) * 0.08;
    g.save(); g.translate(fx, fy); g.rotate(bob);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU - HALF_PI;
      piece(g, blob(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 6.5, 6.5, { seed: seed + i * 7 + p, amp: 0.05, n: 16 }), col, { rim: lighten(col, 0.5), under: 0.15 });
    }
    cut(g, blob(0, 0, 4.5, 4.5, { seed: seed + 50 + i, n: 14 }), i === 1 ? PAL.coinDark : PAL.goldLight);
    g.restore();
  });
  g.restore();
  g.restore();
}

// ———————————————————— 道具小图标（飞进背包） ————————————————————
/**
 * 路径画小道具：name = potion / key / boots / shield / hat / bag。锚 = 中心；s=1 约 64px 见方。
 * o: { x, y, s, rot, t, alpha, glint 0..1（掠过一道小闪光） }
 */
export function drawItemIcon(g, name, o = {}) {
  const { t = 0, glint = 0 } = o;
  if ((o.alpha ?? 1) <= 0) return;
  beginAt(g, o);
  switch (name) {
    case 'potion': {
      const flask = new Path2D();
      flask.arc(0, 10, 22, -1.2, Math.PI + 1.2);
      flask.lineTo(-7, -18); flask.lineTo(7, -18); flask.closePath();
      piece(g, flask, lighten(PAL.ice, 0.35), { rim: PAL.white });
      g.save(); g.clip(flask);
      g.fillStyle = lin(g, 0, -4, 0, 32, [PAL.heart, PAL.redDark]);
      g.fillRect(-24, -2 + Math.sin(t * 3) * 1.5, 48, 40);
      g.fillStyle = rgba(PAL.princessLight, 0.8); g.fillRect(-24, -3 + Math.sin(t * 3) * 1.5, 48, 2.5);
      for (let i = 0; i < 3; i++) { const ph = fract(t * 0.7 + i / 3); g.fillStyle = rgba(PAL.white, 0.7 * (1 - ph)); g.beginPath(); g.arc(-6 + i * 6, 26 - ph * 24, 2 + i * 0.5, 0, TAU); g.fill(); }
      g.restore();
      g.fillStyle = rgba(PAL.white, 0.7); g.beginPath(); g.ellipse(-11, 4, 3.5, 8, 0.4, 0, TAU); g.fill();
      piece(g, rr(-8, -24, 16, 7, 2.5), lighten(PAL.ice, 0.2), { rim: PAL.white, under: 0.15 });
      piece(g, rr(-6, -32, 12, 10, 3), PAL.wood, { rim: lighten(PAL.wood, 0.4), under: 0.15 });
      break;
    }
    case 'key': {
      g.rotate(-0.55);
      const bow = blob(-18, 0, 13, 13, { seed: 3, n: 24 });
      piece(g, bow, PAL.gold, { rim: PAL.goldLight });
      shade(g, bow, PAL.goldDark, -30, -12, -6, 12, 0, 0.5);
      cut(g, blob(-18, 0, 5.5, 5.5, { seed: 4, n: 18 }), PAL.heart, { rim: PAL.white, rimW: 1.5 });
      const shaft = rr(-7, -3.8, 36, 7.6, 3);
      piece(g, shaft, PAL.gold, { rim: PAL.goldLight, under: 0.2 });
      piece(g, rr(14, 2, 6, 10, 1.5), PAL.gold, { under: 0.2 });
      piece(g, rr(23, 2, 6, 13, 1.5), PAL.gold, { under: 0.2 });
      shade(g, shaft, PAL.goldDark, 0, -4, 0, 4, 0, 0.45);
      break;
    }
    case 'boots': {
      for (const [ox, oy, dk] of [[9, -4, 0.25], [-4, 2, 0]]) {
        g.save(); g.translate(ox, oy);
        const col = darken(PAL.boot, dk);
        const shaftP = poly([[-14, -28], [8, -28], [9, 2], [-14, 2]], { seed: 5 + ox, amp: 0.5, round: 0.2 });
        piece(g, shaftP, col, { rim: lighten(col, 0.35) });
        const foot = smoothPath([[-15, -6], [8, -6], [20, 0], [26, 8], [22, 14], [-15, 14]], { closed: true, tension: 0.4 });
        piece(g, foot, col, { rim: lighten(col, 0.35), under: 0.2 });
        piece(g, rr(-16, 12, 44, 6, 3), PAL.woodDark, { under: 0.15 });
        piece(g, rr(-17, -33, 28, 10, 4), lighten(PAL.leather, 0.15), { rim: lighten(PAL.leather, 0.5), under: 0.2 });
        piece(g, rr(-14, -12, 22, 5, 2), PAL.gold, { under: 0.1 });
        g.restore();
      }
      break;
    }
    case 'shield': {
      const sh = (k) => {
        const p = new Path2D();
        p.moveTo(-26 * k, -27 * k); p.quadraticCurveTo(0, -33 * k, 26 * k, -27 * k);
        p.lineTo(26 * k, -2 * k); p.quadraticCurveTo(23 * k, 20 * k, 0, 32 * k); p.quadraticCurveTo(-23 * k, 20 * k, -26 * k, -2 * k); p.closePath();
        return p;
      };
      piece(g, sh(1), PAL.gold, { rim: PAL.goldLight });
      cut(g, sh(0.8), lin(g, -20, -20, 20, 26, [lighten(PAL.heroBlue, 0.2), PAL.heroBlue, PAL.heroBlueDark]), { rim: lighten(PAL.heroBlue, 0.45) });
      piece(g, starPath(0, 0, 13, 6, 5), PAL.gold, { rim: PAL.goldLight, under: 0.2 });
      g.save(); g.clip(sh(0.8)); g.fillStyle = rgba(PAL.white, 0.22); g.beginPath(); g.moveTo(-26, -10); g.lineTo(-6, -30); g.lineTo(2, -30); g.lineTo(-26, -2); g.closePath(); g.fill(); g.restore();
      break;
    }
    case 'hat': {
      const brim = new Path2D(); brim.ellipse(0, 12, 31, 7, 0, 0, TAU);
      piece(g, brim, PAL.forest, { rim: PAL.grass });
      const cap = new Path2D();
      cap.moveTo(-24, 12); cap.quadraticCurveTo(-18, -18, 10, -28); cap.quadraticCurveTo(4, -10, 24, 12); cap.closePath();
      piece(g, cap, lin(g, -24, 0, 24, 0, [PAL.meadow, PAL.grass, PAL.grassDark]), { rim: PAL.leafLight });
      g.save(); g.clip(cap); g.fillStyle = PAL.gold; g.fillRect(-30, 3, 60, 6); g.restore();
      const fe = [[-10, 4], [-18, -10], [-30, -24], [-36, -34]];
      piece(g, ribbon(fe, (u) => 6 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1))), PAL.scarf, { rim: lighten(PAL.scarf, 0.4), under: 0.2 });
      g.strokeStyle = rgba(PAL.white, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(-11, 3); g.lineTo(-33, -29); g.stroke();
      break;
    }
    case 'bag':
    default: {
      const body = blob(0, 8, 25, 21, { seed: 8, amp: 0.04, n: 28 });
      piece(g, body, lin(g, -25, 0, 25, 0, [lighten(PAL.leather, 0.2), PAL.leather, darken(PAL.leather, 0.2)]), { rim: lighten(PAL.leather, 0.45) });
      const neck = poly([[-12, -14], [12, -14], [8, -6], [-8, -6]], { seed: 9, amp: 0.5, round: 0.3 });
      piece(g, neck, PAL.leather, { rim: lighten(PAL.leather, 0.45), under: 0.18 });
      g.strokeStyle = PAL.kraftDark; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-10, -8); g.quadraticCurveTo(0, -4, 10, -8); g.stroke();
      g.beginPath(); g.moveTo(2, -7); g.quadraticCurveTo(12, -16, 16, -10); g.moveTo(2, -7); g.quadraticCurveTo(-6, -18, -12, -12); g.stroke();
      cut(g, blob(0, 10, 8, 8, { seed: 10, n: 18 }), PAL.coin, { rim: PAL.goldLight });
      g.fillStyle = PAL.coinDark; g.beginPath(); g.arc(0, 10, 3, 0, TAU); g.fill();
    }
  }
  if (glint > 0) sparkle(g, lerp(-20, 22, glint), lerp(-18, 14, glint), 9 * Math.sin(Math.PI * glint), { color: PAL.white });
  g.restore();
}

// ———————————————————— 听岔五图标 ————————————————————
function iconCard(g, t) {
  // 后一张（牌背）
  g.save(); g.translate(22, -6); g.rotate(0.22);
  const bk = rr(-40, -58, 80, 116, 10);
  piece(g, bk, PAL.redDark, { rim: PAL.red, rimW: 2.5 });
  g.save(); g.clip(bk);
  g.strokeStyle = rgba(PAL.gold, 0.55); g.lineWidth = 1.6;
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(i * 12 - 60, -60); g.lineTo(i * 12 + 60, 60); g.moveTo(i * 12 + 60, -60); g.lineTo(i * 12 - 60, 60); g.stroke(); }
  g.restore();
  g.strokeStyle = PAL.gold; g.lineWidth = 2.5; g.stroke(rr(-33, -51, 66, 102, 6));
  g.restore();
  // 前一张（牌面）
  g.save(); g.translate(-10, 5); g.rotate(-0.1);
  const fr = rr(-46, -64, 92, 128, 11);
  piece(g, fr, PAL.red, { rim: lighten(PAL.red, 0.45), rimW: 2.5 });
  const face = rr(-38, -56, 76, 112, 7);
  cut(g, face, PAL.paper);
  shade(g, face, PAL.paper2, -38, -56, 38, 56, 0, 0.8);
  g.strokeStyle = PAL.gold; g.lineWidth = 3; g.stroke(rr(-33, -51, 66, 102, 5));
  g.strokeStyle = PAL.goldDark; g.lineWidth = 1; g.stroke(rr(-29, -47, 58, 94, 4));
  // 角标：红菱形
  for (const [cx, cy] of [[-24, -38], [24, 38]]) {
    g.fillStyle = PAL.red;
    g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 5, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 5, cy); g.closePath(); g.fill();
  }
  // 交叉双剑
  for (const a of [-0.62, 0.62]) {
    g.save(); g.translate(0, 14); g.rotate(a);
    const blade = poly([[-3.8, 20], [3.8, 20], [3.8, -40], [0, -49], [-3.8, -40]], { seed: 7, amp: 0.3 });
    piece(g, blade, PAL.steel, { rim: PAL.white, under: 0.2 });
    g.fillStyle = rgba(PAL.steelDark, 0.8); g.fillRect(0, -40, 3.8, 60);
    piece(g, rr(-11, 18, 22, 5, 2.5), PAL.gold, { under: 0.2 });
    piece(g, rr(-2.6, 23, 5.2, 11, 2), PAL.woodDark, { under: 0.15 });
    cut(g, blob(0, 36, 3.6, 3.6, { seed: 3, n: 12 }), PAL.gold);
    g.restore();
  }
  // 王冠压在交叉处
  g.save(); g.translate(0, -2);
  const crown = new Path2D();
  crown.moveTo(-17, 6); crown.lineTo(-19, -10); crown.lineTo(-9, -2); crown.lineTo(0, -15); crown.lineTo(9, -2); crown.lineTo(19, -10); crown.lineTo(17, 6); crown.closePath();
  piece(g, crown, PAL.gold, { rim: PAL.goldLight, rimW: 2 });
  shade(g, crown, PAL.goldDark, 0, -15, 0, 6, 0, 0.45);
  piece(g, rr(-18, 3, 36, 7, 3), PAL.goldDark, { under: 0.18 });
  for (const [bx, by, c] of [[-19, -11, PAL.goldLight], [0, -16, PAL.goldLight], [19, -11, PAL.goldLight]]) { g.fillStyle = c; g.beginPath(); g.arc(bx, by, 2.8, 0, TAU); g.fill(); }
  cut(g, blob(0, 6.5, 3.2, 2.6, { seed: 2, n: 12 }), PAL.red);
  cut(g, blob(-10, 6.5, 2.4, 2.1, { seed: 3, n: 12 }), PAL.crystal);
  cut(g, blob(10, 6.5, 2.4, 2.1, { seed: 4, n: 12 }), PAL.crystal);
  g.restore();
  // 光泽
  g.save(); g.clip(face);
  g.fillStyle = rgba(PAL.white, 0.28);
  const sh = (t * 0.35) % 1;
  g.beginPath(); g.moveTo(-70 + sh * 160, -64); g.lineTo(-50 + sh * 160, -64); g.lineTo(-110 + sh * 160, 64); g.lineTo(-130 + sh * 160, 64); g.closePath(); g.fill();
  g.restore();
  g.restore();
}

function iconViolin(g, t) {
  // 琴弓（在琴后）
  const drawBow = () => {
    g.save(); g.rotate(0.62); g.translate(4, 4);
    g.strokeStyle = rgba(PAL.paper, 0.95); g.lineWidth = 3;
    g.beginPath(); g.moveTo(-6, -74); g.lineTo(-6, 66); g.stroke();
    piece(g, rr(-1, -78, 4.2, 152, 2), PAL.woodDark, { under: 0.2 });
    piece(g, rr(-8, 58, 11, 13, 2), PAL.ink, { under: 0.2 });
    g.fillStyle = PAL.paper; g.beginPath(); g.arc(-2.5, 64, 2, 0, TAU); g.fill();
    piece(g, poly([[-8, -80], [3, -80], [3, -70]], { seed: 2, amp: 0.2 }), PAL.paper, { under: 0.15 });
    g.restore();
  };
  g.save(); g.rotate(-0.42); g.translate(0, 10);
  // 琴颈 + 琴头 + 涡卷
  piece(g, rr(-6, -104, 12, 40, 4), PAL.woodDark, { under: 0.2 });
  for (const [py, sx] of [[-96, -1], [-88, 1], [-80, -1], [-92, 1]]) piece(g, rr(sx > 0 ? 5 : -13, py - 2.5, 8, 5, 2.5), PAL.ink, { under: 0.12 });
  const scroll = blob(0, -110, 9.5, 9.5, { seed: 4, n: 20 });
  piece(g, scroll, mixHex(PAL.wood, PAL.ember, 0.3), { rim: lighten(PAL.wood, 0.5) });
  g.strokeStyle = PAL.woodDark; g.lineWidth = 1.6; g.beginPath();
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU * 1.6, r = 7.5 * (1 - i / 30); const px = Math.cos(a) * r, py = -110 + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.stroke();
  // 琴身
  const R = [[0, -47], [16, -45], [25, -37], [26, -25], [21, -15], [15, -8], [15, 1], [20, 7], [29, 17], [32, 30], [27, 43], [14, 50], [0, 52]];
  const body = smoothPath([...R, ...R.slice(1, -1).reverse().map(([x, y]) => [-x, y])], { closed: true, tension: 0.5 });
  const varnish = mixHex(PAL.wood, PAL.ember, 0.32);
  piece(g, body, rad(g, -6, -4, 4, 60, [lighten(varnish, 0.25), varnish, PAL.woodDark]), { rim: lighten(varnish, 0.5), rimW: 2.5 });
  g.save(); g.clip(body);
  g.strokeStyle = rgba(PAL.woodDark, 0.55); g.lineWidth = 1.4;
  g.save(); g.scale(0.88, 0.92); g.stroke(body); g.restore();
  g.restore();
  // f 孔
  g.strokeStyle = PAL.ink; g.lineWidth = 2.3; g.lineCap = 'round';
  for (const sx of [-1, 1]) {
    g.beginPath(); g.moveTo(sx * 9, -9); g.bezierCurveTo(sx * 16, -2, sx * 6, 9, sx * 13, 19); g.stroke();
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(sx * 9, -10, 1.8, 0, TAU); g.arc(sx * 13, 20, 1.8, 0, TAU); g.fill();
  }
  // 指板、琴码、拉弦板、腮托
  piece(g, poly([[-5, -66], [5, -66], [8, 6], [-8, 6]], { seed: 6, amp: 0.2 }), PAL.ink, { under: 0.2 });
  piece(g, poly([[-13, 17], [13, 17], [10, 11], [-10, 11]], { seed: 7, amp: 0.2 }), PAL.sand, { under: 0.2 });
  piece(g, poly([[-6, 22], [6, 22], [9, 44], [-9, 44]], { seed: 8, amp: 0.3, round: 0.3 }), PAL.ink, { under: 0.2 });
  piece(g, blob(-15, 44, 9, 6, { seed: 9, n: 16 }), mixHex(PAL.ink, PAL.woodDark, 0.4), { under: 0.15 });
  // 四根弦
  g.strokeStyle = rgba(PAL.goldLight, 0.95); g.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) { const xs = -3.3 + i * 2.2; g.beginPath(); g.moveTo(xs * 0.8, -68); g.lineTo(xs * 1.4, 24); g.stroke(); }
  g.restore();
  drawBow();
  // 小音符闪光（路径画，非字体）
  const ph = fract(t * 0.6);
  sparkle(g, 44, -40 - ph * 20, 6 * (1 - ph), { color: PAL.goldLight, alpha: 1 - ph });
}

function iconEggtart(g, t) {
  const cy = 10;
  // 侧壁（花边酥皮）
  const side = new Path2D();
  side.moveTo(-58, cy);
  side.lineTo(-48, cy + 20);
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - (i / 40) * Math.PI;
    const bump = 1 + 0.035 * Math.abs(Math.sin(a * 9));
    side.lineTo(Math.cos(a) * 48 * bump, cy + 20 + Math.sin(a) * 25 * bump);
  }
  side.lineTo(58, cy);
  side.ellipse(0, cy, 58, 34, 0, 0, Math.PI, true);
  side.closePath();
  const sideCol = mixHex(PAL.sand, PAL.earth, 0.5);
  piece(g, side, sideCol, { rim: null });
  g.save(); g.clip(side);
  g.strokeStyle = rgba(PAL.woodDark, 0.4); g.lineWidth = 2;
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(i * 7.2, cy + 26); g.lineTo(i * 6.6, cy + 52); g.stroke(); }
  shade(g, side, PAL.woodDark, 0, cy, 0, cy + 46, 0, 0.35);
  g.restore();
  // 口沿（褶边）
  const rimP = new Path2D();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU;
    const k = 1 + 0.05 * Math.sin(a * 18);
    const px = Math.cos(a) * 58 * k, py = cy + Math.sin(a) * 34 * k;
    if (i) rimP.lineTo(px, py); else rimP.moveTo(px, py);
  }
  rimP.closePath();
  cut(g, rimP, lin(g, 0, cy - 34, 0, cy + 34, [lighten(PAL.sand, 0.35), PAL.sand, mixHex(PAL.sand, PAL.earth, 0.3)]), { rim: PAL.goldLight, rimW: 2.5 });
  g.strokeStyle = rgba(PAL.earth, 0.45); g.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + 0.2; g.beginPath(); g.ellipse(0, cy, 52, 30, 0, a, a + 0.18); g.stroke(); }
  // 内壁 + 蛋液
  const well = new Path2D(); well.ellipse(0, cy + 1, 46, 26, 0, 0, TAU);
  g.fillStyle = mixHex(PAL.sand, PAL.earth, 0.4); g.fill(well);
  const custard = new Path2D(); custard.ellipse(0, cy + 3, 43, 23, 0, 0, TAU);
  g.fillStyle = rad(g, -6, cy - 2, 2, 46, [lighten(PAL.coin, 0.45), PAL.coin, PAL.coinDark]);
  g.fill(custard);
  // 焦斑
  g.save(); g.clip(custard);
  const SP = [[10, 4, 14, 8, 0.3], [-18, 8, 9, 5, -0.4], [24, 14, 7, 4, 0.6], [-4, 16, 6, 3.5, 0.1], [-26, -2, 5, 3, 0.4], [6, -8, 5, 3, -0.2]];
  SP.forEach(([sx, sy, rx, ry, a], i) => {
    const r0 = Math.max(rx, ry) * 1.25;
    g.fillStyle = rad(g, sx, cy + sy, 0, r0, [[0, rgba(PAL.woodDark, 0.62)], [0.4, rgba(PAL.earth, 0.55)], [0.75, rgba(PAL.coinDark, 0.35)], [1, rgba(PAL.coinDark, 0)]]);
    g.fill(blob(sx, cy + sy, rx * 1.25, ry * 1.25, { seed: 30 + i, amp: 0.2, n: 22, rot: a }));
  });
  for (let i = 0; i < 9; i++) {
    g.fillStyle = rgba(PAL.woodDark, 0.35);
    g.beginPath(); g.arc((hash2(51, i) - 0.5) * 66, cy + 3 + (hash2(52, i) - 0.5) * 30, 1 + hash2(53, i) * 1.4, 0, TAU); g.fill();
  }
  g.restore();
  g.fillStyle = rgba(PAL.white, 0.6);
  g.beginPath(); g.ellipse(-20, cy - 8, 10, 3.5, -0.25, 0, TAU); g.fill();
  // 三缕热气
  for (let k = 0; k < 3; k++) {
    const bx = -16 + k * 16;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      pts.push([bx + Math.sin(u * 5 - t * 3.4 + k * 1.9) * 7 * (0.3 + u), cy - 12 - u * (52 + k * 6)]);
    }
    g.fillStyle = rgba(PAL.white, 0.75);
    g.fill(ribbon(pts, (u) => 4.4 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) * (1 - u * 0.4)));
  }
}

function iconSoda(g, t) {
  const R = [[0, -66], [10, -66], [11, -61], [8, -56], [8, -38], [20, -20], [26, -4], [26, 44], [22, 56], [0, 58]];
  const bottle = smoothPath([...R, ...R.slice(1, -1).reverse().map(([x, y]) => [-x, y])], { closed: true, tension: 0.35 });
  const glass = mixHex(PAL.ice, PAL.white, 0.35);
  piece(g, bottle, glass, { rim: PAL.white, rimW: 2.5 });
  g.save(); g.clip(bottle);
  const lvl = -24 + Math.sin(t * 2.2) * 1.2;
  g.fillStyle = lin(g, 0, lvl, 0, 58, [lighten(PAL.crystal, 0.2), PAL.crystal, PAL.water]);
  g.fillRect(-30, lvl, 60, 90);
  g.fillStyle = rgba(PAL.white, 0.75); g.fillRect(-30, lvl - 1, 60, 3);
  // 瓶内气泡
  for (let k = 0; k < 10; k++) {
    const ph = fract(t * (0.45 + 0.25 * hash2(3, k)) + hash2(4, k));
    const bx = (hash2(5, k) - 0.5) * 38 + Math.sin(t * 3 + k) * 1.5, by = 54 - ph * (78);
    if (by < lvl + 3) continue;
    const r = 1.6 + hash2(6, k) * 2.4;
    g.strokeStyle = rgba(PAL.white, 0.9); g.lineWidth = 1.3;
    g.beginPath(); g.arc(bx, by, r, 0, TAU); g.stroke();
  }
  // 标签（柠檬片）
  g.fillStyle = PAL.paper; g.fillRect(-30, 6, 60, 26);
  g.fillStyle = PAL.heart; g.fillRect(-30, 6, 60, 3); g.fillRect(-30, 29, 60, 3);
  const lemon = blob(0, 19, 9.5, 9.5, { seed: 7, n: 20 });
  cut(g, lemon, PAL.gold); cut(g, blob(0, 19, 7.2, 7.2, { seed: 8, n: 20 }), PAL.goldLight);
  g.strokeStyle = rgba(PAL.gold, 0.9); g.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.moveTo(0, 19); g.lineTo(Math.cos(a) * 7, 19 + Math.sin(a) * 7); g.stroke(); }
  g.fillStyle = rgba(PAL.white, 0.6); g.fillRect(-20, -50, 5, 96);
  g.restore();
  // 吸管：白底红斜纹，弯头朝右上
  const strawP = new Path2D();
  strawP.moveTo(3, -44); strawP.lineTo(9, -84); strawP.quadraticCurveTo(11, -97, 24, -99); strawP.lineTo(34, -98);
  g.save();
  g.lineJoin = 'round';
  g.strokeStyle = rgba(PAL.shadow, 0.25); g.lineWidth = 10; g.translate(1.5, 2); g.stroke(strawP); g.translate(-1.5, -2);
  g.lineCap = 'butt';
  g.strokeStyle = PAL.white; g.lineWidth = 9; g.stroke(strawP);
  g.strokeStyle = PAL.scarf; g.lineWidth = 9; g.setLineDash([5, 5]); g.stroke(strawP);
  g.restore();
  g.fillStyle = rgba(PAL.white, 0.55);
  g.beginPath(); g.ellipse(0, -65, 10, 2.6, 0, 0, TAU); g.fill();
  // 瓶口外冒的气泡
  for (let k = 0; k < 5; k++) {
    const ph = fract(t * 0.8 + k / 5);
    const bx = -6 + Math.sin(t * 2 + k * 2.1) * 8 + (hash2(9, k) - 0.5) * 10, by = -70 - ph * 46;
    const r = 2.5 + hash2(10, k) * 3;
    g.strokeStyle = rgba(PAL.crystal, 1 - ph); g.lineWidth = 1.8;
    g.beginPath(); g.arc(bx, by, r, 0, TAU); g.stroke();
    g.fillStyle = rgba(PAL.white, 0.8 * (1 - ph)); g.beginPath(); g.arc(bx - r * 0.35, by - r * 0.35, r * 0.3, 0, TAU); g.fill();
  }
}

function iconMarathon(g, t) {
  // 被冲断的终点线：左半截从后方垂过来（被鞋挡住一段），右半截在鞋尖前被冲得翻起
  const tape = (pts, flipAt) => {
    const n = pts.length;
    const band = ribbon(pts, (u) => 4.2 * (1 - 0.15 * u));
    piece(g, band, PAL.scarf, { rim: lighten(PAL.scarf, 0.5), under: 0.22 });
    // 扭转处露出暗面
    if (flipAt) {
      const sub = pts.slice(Math.floor(n * flipAt[0]), Math.ceil(n * flipAt[1]));
      if (sub.length > 1) { g.fillStyle = PAL.scarfDark; g.fill(ribbon(sub, (u) => 4.2 * Math.sin(Math.PI * u))); }
    }
    // 撕开的毛边
    const e = pts[n - 1], pe = pts[n - 2];
    const a = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
    g.save(); g.translate(e[0], e[1]); g.rotate(a);
    g.fillStyle = PAL.scarf;
    g.beginPath(); g.moveTo(-2, -4.2); g.lineTo(5, -3); g.lineTo(2, -1); g.lineTo(7, 0.5); g.lineTo(2.5, 2); g.lineTo(5.5, 4); g.lineTo(-2, 4.2); g.closePath(); g.fill();
    g.restore();
  };
  const fl = (u, k) => Math.sin(t * 7 + u * 7 + k) * 3.2 * u;
  const L = [], Rr = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; L.push([-86 + u * 128, -50 + u * 30 + Math.sin(u * Math.PI) * 7 + fl(u, 0)]); }
  for (let i = 0; i <= 12; i++) { const u = i / 12; Rr.push([66 + u * 26 + Math.sin(u * 4) * 5, -14 - u * 50 + fl(u, 2) * 0.6]); }
  tape(L, [0.45, 0.62]);
  // 速度线 + 尘
  g.strokeStyle = rgba(PAL.inkSoft, 0.7); g.lineWidth = 3; g.lineCap = 'round';
  for (const [y0, l] of [[-12, 26], [2, 34], [16, 22]]) { g.beginPath(); g.moveTo(-64 - l, y0); g.lineTo(-64, y0); g.stroke(); }
  for (let k = 0; k < 3; k++) {
    const ph = fract(t * 1.2 + k / 3);
    g.fillStyle = rgba(PAL.paper2, 0.8 * (1 - ph));
    g.beginPath(); g.arc(-58 - ph * 30, 28 - ph * 6, 5 + ph * 6, 0, TAU); g.fill();
  }
  // 跑鞋
  g.save(); g.rotate(-0.1); g.translate(4, 6);
  const sole = new Path2D();
  sole.moveTo(-56, 10); sole.lineTo(-57, 22); sole.quadraticCurveTo(0, 30, 48, 26); sole.quadraticCurveTo(66, 22, 64, 8); sole.lineTo(-56, 10); sole.closePath();
  piece(g, sole, PAL.white, { rim: null });
  shade(g, sole, PAL.stone, 0, 10, 0, 28, 0, 0.6);
  g.strokeStyle = PAL.stone2; g.lineWidth = 2;
  g.beginPath(); for (let i = 0; i <= 12; i++) { const x = -52 + i * 9.5; g.lineTo(x, 25 + (i % 2) * 3 - (x > 40 ? (x - 40) * 0.2 : 0)); } g.stroke();
  g.fillStyle = PAL.scarf; g.fillRect(-56, 8, 120, 3);
  const upper = new Path2D();
  upper.moveTo(-55, 9); upper.lineTo(-54, -18); upper.quadraticCurveTo(-46, -26, -34, -20); upper.quadraticCurveTo(-26, -16, -20, -32);
  upper.quadraticCurveTo(-12, -38, -6, -30); upper.lineTo(30, -6); upper.quadraticCurveTo(58, -2, 63, 8); upper.closePath();
  piece(g, upper, lin(g, 0, -36, 0, 10, [lighten(PAL.heroBlue, 0.25), PAL.heroBlue, PAL.heroBlueDark]), { rim: lighten(PAL.heroBlue, 0.5), rimW: 2.5 });
  g.save(); g.clip(upper);
  g.fillStyle = lighten(PAL.heroBlue, 0.32); g.beginPath(); g.ellipse(52, 6, 22, 14, 0, 0, TAU); g.fill();
  g.fillStyle = PAL.scarf; g.fillRect(-60, -30, 12, 42);
  // 侧面闪电条
  g.fillStyle = PAL.goldLight;
  g.beginPath(); g.moveTo(-40, -2); g.lineTo(-8, -14); g.lineTo(-12, -6); g.lineTo(22, -12); g.lineTo(-14, 4); g.lineTo(-10, -3); g.closePath(); g.fill();
  g.restore();
  // 鞋带
  g.strokeStyle = PAL.white; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const x = -14 + i * 10, y = -28 + i * 7; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 6, y + 4); g.moveTo(x - 4, y + 4); g.lineTo(x + 6, y - 4); g.stroke(); }
  g.restore();
  tape(Rr, [0.3, 0.5]);
  // 冲断处的小闪光
  sparkle(g, 60, -22, 8 + Math.sin(t * 9) * 2, { color: PAL.goldLight });
  sparkle(g, 74, -40, 5, { color: PAL.white, alpha: 0.6 + 0.4 * Math.sin(t * 7) });
}

const MISHEAR = { card: [iconCard, PAL.gold], violin: [iconViolin, PAL.ember], eggtart: [iconEggtart, PAL.goldLight], soda: [iconSoda, PAL.crystal], marathon: [iconMarathon, PAL.skyDay] };
export const MISHEAR_NAMES = { card: '昆特牌', violin: '提琴', eggtart: '烤蛋挞', soda: '苏打', marathon: '马拉松' };

/**
 * 听岔五图标：name = card（昆特牌）/ violin（提琴）/ eggtart（烤蛋挞）/ soda（苏打）/ marathon（马拉松）。
 * 锚 = 图标中心；s=1 约 130×150（放进道具栏 150×200 的格子）。名称文字由 kit.itemBar 写在格下，本函数只画图。
 * o: { x, y, s, rot, t（热气、气泡、弦光、彩带飘动）, glow 0..1（高饱和光晕）, pop 0..1（outBack 弹入）, alpha }
 */
export function drawMishearIcon(g, name, o = {}) {
  const ent = MISHEAR[name];
  if (!ent || (o.alpha ?? 1) <= 0) return;
  const [fn, halo] = ent;
  const pop = o.pop === undefined ? 1 : clamp(o.pop);
  if (pop <= 0) return;
  const k = pop >= 1 ? 1 : outBack(pop, 2.4);
  g.save();
  g.translate(o.x || 0, o.y || 0);
  if (o.rot) g.rotate(o.rot);
  g.scale((o.s ?? 1) * k, (o.s ?? 1) * k);
  if (o.alpha !== undefined) g.globalAlpha *= clamp(o.alpha);
  if (o.glow) { glow(g, 0, 0, 105, halo, 0.6 * o.glow); glow(g, 0, 0, 60, PAL.white, 0.25 * o.glow); }
  fn(g, o.t || 0);
  g.restore();
}
