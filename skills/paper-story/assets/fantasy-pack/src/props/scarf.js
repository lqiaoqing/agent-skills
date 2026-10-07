// 围巾道具（勇者组）：沿点列画的长围巾、时间回溯拖尾、b14 巨型围巾擦屏、b07 红虚线合拢成红带、书签、缠手红绳。
// 另导出勇者组共用的剪纸小工具（sdir / rimLine / paperFill），sword.js 与 rigs/hero.js 复用。
// 全部纯函数：只由参数（含 t）决定画面；内部 save/restore；不调 ctx.layer / ctx.mask。
import { PAL } from '../core/paper.js';
import { clamp, lerp, TAU, rgba, mixHex, hash2, noise1, wobble } from '../core/util.js';
import { outBack } from '../core/ease.js';
import { glyphsOnPath } from '../ui/type.js';

// ———————————————————— 剪纸小工具（勇者组共用） ————————————————————
/** 屏幕方向 (sx, sy) 在当前变换下对应的局部单位向量：镜像、旋转之后光照仍在左上、投影仍在右下。 */
export function sdir(g, sx, sy) {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  const vx = (m.d * sx - m.c * sy) / det, vy = (-m.b * sx + m.a * sy) / det;
  const L = Math.hypot(vx, vy) || 1;
  return [vx / L, vy / L];
}

/** 切口亮边（dir = 1，顶边一道亮线）/ 底边暗线（dir = −1）。方向按屏幕算。 */
export function rimLine(g, path, color, w = 2, a = 0.7, dir = 1, rule = 'nonzero') {
  const [dx, dy] = sdir(g, 0, dir);
  g.save();
  g.clip(path, rule);
  g.translate(dx * w, dy * w);
  g.lineWidth = w * 1.7;
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.globalAlpha *= a;
  g.stroke(path);
  g.restore();
}

/**
 * 一片剪纸：暗色错位投影（lift，局部单位，方向恒为屏幕右下）→ 底色 → 左上受光明暗（shadeA / hi）→ 底边暗线（under）→ 顶边亮线（rim）。
 * o: { lift, liftA, cx, cy, r（明暗渐变中心与半径）, shadeA, shadeCol, hi, under, underW, underA, rim, rimW, rimA, rule, alpha }
 */
export function paperFill(g, path, fill, o = {}) {
  const { lift = 0, liftA = 0.22, cx = 0, cy = 0, r = 0, shadeA = 0, shadeCol = PAL.ink, hi = 0, under = null, underW = 2, underA = 0.35, rim = null, rimW = 2, rimA = 0.7, rule = 'nonzero', alpha = 1 } = o;
  g.save();
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (lift > 0) {
    const [dx, dy] = sdir(g, 0.38, 0.92);
    g.save();
    g.translate(dx * lift, dy * lift);
    g.fillStyle = rgba(PAL.shadow, liftA);
    g.fill(path, rule);
    g.restore();
  }
  g.fillStyle = fill;
  g.fill(path, rule);
  if (r > 0 && (shadeA > 0 || hi > 0)) {
    const [dx, dy] = sdir(g, 0.6, 0.8);
    g.save();
    g.clip(path, rule);
    if (shadeA > 0) {
      const gr = g.createLinearGradient(cx - dx * r * 0.15, cy - dy * r * 0.15, cx + dx * r, cy + dy * r);
      gr.addColorStop(0, rgba(shadeCol, 0)); gr.addColorStop(1, rgba(shadeCol, shadeA));
      g.fillStyle = gr; g.fill(path, rule);
    }
    if (hi > 0) {
      const gr = g.createLinearGradient(cx - dx * r, cy - dy * r, cx - dx * r * 0.1, cy - dy * r * 0.1);
      gr.addColorStop(0, rgba(PAL.white, hi)); gr.addColorStop(1, rgba(PAL.white, 0));
      g.fillStyle = gr; g.fill(path, rule);
    }
    g.restore();
  }
  if (under) rimLine(g, path, under, underW, underA, -1, rule);
  if (rim) rimLine(g, path, rim, rimW, rimA, 1, rule);
  g.restore();
}

// ———————————————————— 几何 ————————————————————
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function arcLens(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
  return L;
}
/** 按弧长等距重采样成 n 点（只取前 len 长）。 */
export function resample(pts, n, len = Infinity) {
  if (pts.length < 2) return Array.from({ length: n }, () => pts[0].slice());
  const L = arcLens(pts), total = Math.min(len, L[L.length - 1]);
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1);
    while (j < L.length - 1 && L[j] < s) j++;
    const k = clamp((s - L[j - 1]) / (L[j] - L[j - 1] || 1));
    out.push([lerp(pts[j - 1][0], pts[j][0], k), lerp(pts[j - 1][1], pts[j][1], k)]);
  }
  return out;
}
/** Catmull-Rom 开放曲线追加到 Path2D。 */
function curveThrough(p, pts, move = true, tension = 0.5) {
  const n = pts.length;
  if (!n) return;
  if (move) p.moveTo(pts[0][0], pts[0][1]); else p.lineTo(pts[0][0], pts[0][1]);
  const s = tension / 3;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * s, p1[1] + (p2[1] - p0[1]) * s, p2[0] - (p3[0] - p1[0]) * s, p2[1] - (p3[1] - p1[1]) * s, p2[0], p2[1]);
  }
}
/** 中心线 → 左右边、切线、法线、弧长比例。wfn(u) 返回全宽。 */
function edges(pts, wfn) {
  const n = pts.length, Ls = arcLens(pts), tot = Ls[n - 1] || 1;
  const L = [], R = [], T = [], N = [], U = [], W = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, u = Ls[i] / tot, w = wfn(u) / 2;
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    T.push([tx, ty]); N.push([nx, ny]); U.push(u); W.push(w * 2);
  }
  return { P: pts, L, R, T, N, U, W, len: tot };
}
/** 在 u 处插值：中心、左右边、切线、宽。 */
function edgeAt(E, u) {
  const n = E.U.length;
  let i = 1;
  while (i < n - 1 && E.U[i] < u) i++;
  const k = clamp((u - E.U[i - 1]) / (E.U[i] - E.U[i - 1] || 1));
  const lp = (A) => [lerp(A[i - 1][0], A[i][0], k), lerp(A[i - 1][1], A[i][1], k)];
  return { c: lp(E.P), l: lp(E.L), r: lp(E.R), t: lp(E.T), w: lerp(E.W[i - 1], E.W[i], k) };
}
/** 条带外轮廓：end 'flat' | 'notch'（V 形缺口，深 depth）| 'round'。 */
function ribbonPath(E, end = 'flat', depth = 0) {
  const p = new Path2D();
  const n = E.L.length;
  curveThrough(p, E.L, true, 0.5);
  const tl = E.T[n - 1];
  if (end === 'notch') {
    p.lineTo((E.L[n - 1][0] + E.R[n - 1][0]) / 2 - tl[0] * depth, (E.L[n - 1][1] + E.R[n - 1][1]) / 2 - tl[1] * depth);
  } else if (end === 'round') {
    const m = [(E.L[n - 1][0] + E.R[n - 1][0]) / 2 + tl[0] * depth, (E.L[n - 1][1] + E.R[n - 1][1]) / 2 + tl[1] * depth];
    p.quadraticCurveTo(E.L[n - 1][0] + tl[0] * depth, E.L[n - 1][1] + tl[1] * depth, m[0], m[1]);
    p.quadraticCurveTo(E.R[n - 1][0] + tl[0] * depth, E.R[n - 1][1] + tl[1] * depth, E.R[n - 1][0], E.R[n - 1][1]);
  }
  const Rr = E.R.slice().reverse();
  curveThrough(p, Rr, false, 0.5);
  p.closePath();
  return p;
}
/** 抖边椭圆（破洞、补丁用），沿 ang 方向。 */
function jagged(cx, cy, rx, ry, ang, seed, amp = 0.2, n = 14) {
  const p = new Path2D();
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, r = 1 + amp * (hash2(seed, i) * 2 - 1);
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    const X = cx + x * ca - y * sa, Y = cy + x * sa + y * ca;
    if (i) p.lineTo(X, Y); else p.moveTo(X, Y);
  }
  p.closePath();
  return p;
}
/** 细条（流苏、冰凌、穗）：从 a 沿 dir 画长 len、根宽 w0 → 尖宽 w1 的弯条，bend 弧度。 */
function strand(a, dir, len, w0, w1, bend = 0) {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const u = i / 4, ang = Math.atan2(dir[1], dir[0]) + bend * u * u;
    const prev = pts.length ? pts[pts.length - 1] : a;
    pts.push(i ? [prev[0] + Math.cos(ang) * len / 4, prev[1] + Math.sin(ang) * len / 4] : a.slice());
  }
  return ribbonPath(edges(pts, (u) => lerp(w0, w1, u)), 'flat');
}
/** 两端圆头的等宽条带（虚线段、胶囊）。 */
function capsuleAlong(pts, w) {
  const E = edges(pts, () => w);
  const n = E.L.length, r = w / 2;
  const p = new Path2D();
  curveThrough(p, E.L, true, 0.5);
  const a1 = Math.atan2(E.T[n - 1][1], E.T[n - 1][0]);
  p.arc(pts[n - 1][0], pts[n - 1][1], r, a1 + Math.PI / 2, a1 - Math.PI / 2, true);
  curveThrough(p, E.R.slice().reverse(), false, 0.5);
  const a0 = Math.atan2(E.T[0][1], E.T[0][0]);
  p.arc(pts[0][0], pts[0][1], r, a0 - Math.PI / 2, a0 + Math.PI / 2, true);
  p.closePath();
  return p;
}
/** 沿点列的条带 Path2D（宽 w0 → w1；end 'flat' | 'notch' | 'round'）。 */
export function ribbonOf(pts, w0, w1 = w0, end = 'flat', depth = 0) {
  return ribbonPath(edges(pts, (u) => lerp(w0, w1, u)), end, depth);
}
const lerpAng = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * k;
};

// ———————————————————— 中心线生成 ————————————————————
/** 时间回溯采样：第 k 点 = anchorFn(T − k·lag)。镜头自算拖尾时用（再减去当前锚点就是 hero 的 scarf.trail）。 */
export function scarfTrail(anchorFn, T, n = 24, lag = 0.035) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(anchorFn(T - k * lag));
  return out;
}

/**
 * 围巾中心线（纯函数，等弧长 n 点，第 0 点 = root 结点）。
 * o: { len=780, n=28, t, vel:[vx,vy]（px/s，与 root 同一坐标系）, wind:[wx,wy], back=-1（身后方向的 x 符号）,
 *      ground（地面 y，null = 无地面）, trail（相对 root 的历史偏移，第 k 点 = 锚点在 T−k·lag 的位置 − 当前位置）, lag=0.035,
 *      frozen 0..1（变直成硬板）, to:[x,y]（拉直系到某点，余下部分从那里垂下）, seed, flutter=1（飘动幅度倍率）, speedRef=650 }
 * 气流 = wind − vel：越大越平直地顺气流飘出；为 0 时垂下拖地。
 */
export function scarfPoints(root, o = {}) {
  const { len = 780, n = 28, t = 0, vel = [0, 0], wind = [0, 0], back = -1, ground = null, trail = null, lag = 0.035, frozen = 0, to = null, seed = 1, flutter = 1, speedRef = 650 } = o;
  const air = [wind[0] - vel[0], wind[1] - vel[1]];
  const a = Math.hypot(air[0], air[1]);
  const k = clamp(a / speedRef);
  const sAng = a > 1 ? Math.atan2(air[1], air[0]) : back < 0 ? Math.PI : 0;
  // 垂挂方向：根部先朝身后斜下，越往下越竖直（像真的布一样有弧度）；快到地面时顺势弯下去贴地往身后拖
  const hangAt = (d) => Math.PI / 2 - back * (0.55 * Math.exp(-d / 45) + 0.06);
  const gAng = back < 0 ? Math.PI : 0;
  const freq = 0.8 + 2.2 * k;
  const sstep = (f) => f * f * (3 - 2 * f);

  // 从 p0 开始按方向场积分出 m 段（每段 step），u0 为起点的弧长比例（只算平滑的基础形，飘动另加）
  const integrate = (p0, ang0, m, step, u0) => {
    const out = [];
    let x = p0[0], y = p0[1], th = ang0;
    for (let i = 1; i <= m; i++) {
      const u = u0 + (i / m) * (1 - u0);
      const gk = ground == null ? 0 : sstep(clamp((y - (ground - 44)) / 44));
      const target = lerpAng(lerpAng(hangAt(u * len), gAng, gk), sAng, k);
      th = lerpAng(th, target, 0.6);
      x += Math.cos(th) * step; y += Math.sin(th) * step;
      if (ground != null && y > ground) y = ground;
      out.push([x, y]);
    }
    return out;
  };
  // 沿法线叠加行波（像素幅度，越往末端越大；贴地的段几乎不动）
  const wave = (P) => {
    const m = P.length, out = [P[0]];
    for (let i = 1; i < m; i++) {
      const u = i / (m - 1);
      const a = P[i - 1], b = P[Math.min(m - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const onG = ground != null && P[i][1] >= ground - 2 ? 1 : 0;
      const amp = flutter * (1 - clamp(frozen)) * (3 + 34 * k) * Math.pow(u, 1.15) * (1 - 0.85 * onG);
      const off = amp * Math.sin(TAU * (freq * t - (u * len) / 230) + seed) + flutter * (1 - clamp(frozen)) * (1.5 + 8 * k) * u * noise1(t * 1.3 + u * 4, seed + 3);
      let nx = P[i][0] - (ty / tl) * off, ny = P[i][1] + (tx / tl) * off;
      if (ground != null && ny > ground) ny = ground - 0.5 * Math.max(0, Math.sin(u * 19 + seed));
      out.push([nx, ny]);
    }
    return out;
  };

  let pts;
  const step = len / (n - 1);
  if (to) {
    const d = dist(root, to);
    const span = Math.min(len, d);
    const m = Math.max(2, Math.round((n * span) / len));
    const dir = [(to[0] - root[0]) / (d || 1), (to[1] - root[1]) / (d || 1)];
    pts = [];
    for (let i = 0; i < m; i++) {
      const f = i / (m - 1);
      const sag = Math.sin(Math.PI * f) * Math.min(18, span * 0.06);
      pts.push([root[0] + dir[0] * span * f, root[1] + dir[1] * span * f + sag]);
    }
    const rest = len - span;
    if (rest > 4 && n - m > 0) pts.push(...integrate(pts[m - 1], Math.PI / 2, n - m, rest / (n - m), span / len));
    pts = resample(pts, n, len);
    const keep = Math.max(2, m);
    const w = wave(pts);
    pts = pts.map((p, i) => (i < keep ? p : w[i]));
  } else if (trail && trail.length > 1) {
    const P = [root.slice()];
    for (let i = 1; i < trail.length; i++) {
      const tau = i * lag;
      P.push([root[0] + trail[i][0] + wind[0] * tau * 0.35, root[1] + trail[i][1] + wind[1] * tau * 0.35 + 150 * tau * tau]);
    }
    const Ls = arcLens(P), have = Ls[Ls.length - 1];
    if (have < len) {
      const last = P[P.length - 1], prev = P[P.length - 2];
      const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      const m = Math.max(3, Math.round((n * (len - have)) / len));
      P.push(...integrate(last, ang, m, (len - have) / m, have / len));
    }
    pts = resample(P, n, len);
    pts = wave(pts);
  } else {
    pts = wave([root.slice(), ...integrate(root, lerpAng(hangAt(0), sAng, k), n - 1, step, 0)]);
  }
  if (frozen > 0) {
    const fa = a > 1 ? sAng : back < 0 ? Math.PI + 0.1 : -0.1;
    const f = clamp(frozen);
    pts = pts.map((p, i) => [lerp(p[0], root[0] + Math.cos(fa) * step * i, f), lerp(p[1], root[1] + Math.sin(fa) * step * i, f)]);
  }
  return pts;
}

// ———————————————————— 围巾本体 ————————————————————
/**
 * drawScarf(g, pts, o)：沿中心线画粗细渐变的围巾（宽 width → endWidth，末端流苏）。
 * o: { width=22, endWidth=8, notch, hole, patch, frozen 0..1, glow 0..1, fringe=true, stripes=true, t, seed, detail=1,
 *      color=PAL.scarf, dark=PAL.scarfDark, lift=2, holeAt=0.56, alpha,
 *      sil（剪影色：整条只填这一色）, edge:{color,w}（只描外轮廓，用于纸偶贴纸边）,
 *      text, textSize, textFill, textEdge, textGrow, textStart, textFamily, fringeLen }
 * 返回 { end, hole（破洞中心或 null）, len, path }。
 */
export function drawScarf(g, pts, o = {}) {
  const { width = 22, endWidth = 8, notch = false, hole = false, patch = false, frozen = 0, glow = 0, fringe = true, stripes = true, t = 0, seed = 3, detail = 1,
    color = PAL.scarf, dark = PAL.scarfDark, lift = 2, holeAt = 0.5, alpha = 1, sil = null, edge = null } = o;
  if (!pts || pts.length < 2) return null;
  const sc = width / 22;
  const E = edges(pts, (u) => lerp(width, endWidth, Math.pow(u, 1.6)));
  const n = E.L.length;
  const depth = notch ? Math.max(E.W[n - 1] * 1.15, 6 * sc) : 0;
  const path = ribbonPath(E, notch ? 'notch' : 'flat', depth);
  const ice = clamp(frozen);
  const base = ice > 0 ? mixHex(color, PAL.ice, 0.16 * ice) : color;
  const fr = clamp(frozen) > 0.5 ? 0.3 : 1;

  // 流苏（有 V 形缺口时只长在两个燕尾尖附近的斜边上）
  const fringes = [];
  if (fringe && detail) {
    const tl = E.T[n - 1], le = E.L[n - 1], re = E.R[n - 1];
    const fl = o.fringeLen ?? Math.min(15 * sc, 160);
    const apex = [(le[0] + re[0]) / 2 - tl[0] * depth, (le[1] + re[1]) / 2 - tl[1] * depth];
    const bases = notch
      ? [[le, 0.08], [le, 0.3], [re, 0.08], [re, 0.3]].map(([tip, f]) => [lerp(tip[0], apex[0], f), lerp(tip[1], apex[1], f)])
      : [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => [lerp(le[0], re[0], f), lerp(le[1], re[1], f)]);
    bases.forEach((b0, j) => {
      const b = [b0[0] - tl[0] * 1.5 * sc, b0[1] - tl[1] * 1.5 * sc];
      const sway = Math.sin(t * 7 + j * 1.9 + seed) * 0.35 * fr;
      fringes.push(strand(b, [tl[0], tl[1]], fl * (0.85 + 0.3 * hash2(seed, j)), 2.6 * sc, 1.1 * sc, sway));
    });
  }
  // 破洞
  let holeP = null, holeC = null;
  if (hole) {
    const H = edgeAt(E, holeAt);
    holeC = H.c;
    holeP = jagged(H.c[0], H.c[1], H.w * 0.44, H.w * 0.3, Math.atan2(H.t[1], H.t[0]), seed + 17, 0.2);
  }

  g.save();
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (edge) {
    g.lineJoin = 'round'; g.strokeStyle = edge.color; g.lineWidth = edge.w;
    g.stroke(path);
    for (const f of fringes) g.stroke(f);
    g.restore();
    return { end: pts[n - 1], hole: holeC, len: E.len, path };
  }
  if (holeP && !patch) {
    const cp = new Path2D();
    cp.rect(-1e5, -1e5, 2e5, 2e5);
    cp.addPath(holeP);
    g.clip(cp, 'evenodd');
  }
  if (sil) {
    g.fillStyle = sil;
    g.fill(path);
    for (const f of fringes) g.fill(f);
    g.restore();
    return { end: pts[n - 1], hole: holeC, len: E.len, path };
  }
  // 流苏在本体下面
  for (const f of fringes) paperFill(g, f, mixHex(base, dark, 0.25), { lift: detail ? lift * 0.6 : 0 });
  if (!detail) {
    g.fillStyle = base; g.fill(path);
  } else {
    paperFill(g, path, base, { lift, liftA: 0.24 });
    // 翻面：噪声决定的几段露出暗面（纸带在扭）
    g.save();
    g.clip(path);
    for (let i = 0; i < n - 1; i++) {
      const tw = noise1(E.U[i] * 6 + t * 0.55, seed + 5);
      if (tw < 0.2) continue;
      const q = new Path2D();
      q.moveTo(E.L[i][0], E.L[i][1]); q.lineTo(E.L[i + 1][0], E.L[i + 1][1]); q.lineTo(E.R[i + 1][0], E.R[i + 1][1]); q.lineTo(E.R[i][0], E.R[i][1]); q.closePath();
      g.fillStyle = rgba(dark, Math.min(0.55, (tw - 0.2) * 1.1));
      g.fill(q);
    }
    // 末端两道织纹
    if (stripes) {
      for (const u0 of [0.86, 0.915]) {
        if (u0 > 0.99) continue;
        const a = edgeAt(E, u0), b = edgeAt(E, u0 + 0.022);
        const q = new Path2D();
        q.moveTo(a.l[0], a.l[1]); q.lineTo(b.l[0], b.l[1]); q.lineTo(b.r[0], b.r[1]); q.lineTo(a.r[0], a.r[1]); q.closePath();
        g.fillStyle = rgba(dark, 0.75);
        g.fill(q);
      }
    }
    g.restore();
    rimLine(g, path, dark, 1.6 * Math.min(sc, 3), 0.55, -1);
    rimLine(g, path, mixHex(base, PAL.white, ice > 0 ? 0.75 : 0.38), 1.5 * Math.min(sc, 3), 0.8, 1);
  }
  // 破洞的毛边
  if (holeP && !patch && detail) {
    g.save();
    g.lineWidth = 1.2 * Math.min(sc, 3);
    g.strokeStyle = rgba(dark, 0.9);
    g.stroke(holeP);
    g.restore();
  }
  // 补丁
  if (patch && holeC) {
    const H = edgeAt(E, holeAt);
    const ang = Math.atan2(H.t[1], H.t[0]) + 0.18;
    const sz = H.w * 0.82;
    g.save();
    g.translate(H.c[0], H.c[1]); g.rotate(ang);
    const pp = jagged(0, 0, sz * 0.62, sz * 0.5, 0, seed + 29, 0.05, 10);
    paperFill(g, pp, PAL.princessLight, { lift: detail ? lift * 0.7 : 0, rim: PAL.white, rimW: 1.2, under: PAL.princess, underW: 1.4, underA: 0.6 });
    if (detail) {
      g.strokeStyle = PAL.princessDark; g.lineWidth = Math.max(0.8, sz * 0.05); g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3, cx = Math.cos(a) * sz * 0.48, cy = Math.sin(a) * sz * 0.37;
        g.beginPath(); g.moveTo(cx * 0.8, cy * 0.8); g.lineTo(cx * 1.12, cy * 1.12); g.stroke();
      }
    }
    g.restore();
  }
  // 冻住：冰霜 + 冰凌
  if (ice > 0 && detail) {
    g.save();
    g.clip(path);
    g.fillStyle = rgba(PAL.ice, 0.18 * ice);
    g.fill(path);
    for (let i = 1; i < n - 1; i++) {
      if (hash2(seed + 3, i) > 0.7) continue;
      const f = hash2(seed + 4, i);
      const px = lerp(E.L[i][0], E.R[i][0], f), py = lerp(E.L[i][1], E.R[i][1], f);
      g.fillStyle = rgba(PAL.white, 0.75 * ice);
      g.beginPath(); g.arc(px, py, (0.9 + hash2(seed + 6, i) * 1.4) * Math.min(sc, 3), 0, TAU); g.fill();
    }
    g.restore();
    const [dx, dy] = sdir(g, 0, 1);
    const m = Math.max(4, Math.round(E.len / (34 * sc)));
    for (let j = 0; j < m; j++) {
      const u = 0.1 + (0.85 * (j + 0.5)) / m;
      const A = edgeAt(E, u);
      const lower = (A.l[0] * dx + A.l[1] * dy) > (A.r[0] * dx + A.r[1] * dy) ? A.l : A.r;
      const L = (6 + 11 * hash2(seed + 9, j)) * sc * ice;
      const w = 2.6 * sc;
      const ip = new Path2D();
      ip.moveTo(lower[0] - A.t[0] * w, lower[1] - A.t[1] * w);
      ip.lineTo(lower[0] + dx * L, lower[1] + dy * L);
      ip.lineTo(lower[0] + A.t[0] * w, lower[1] + A.t[1] * w);
      ip.closePath();
      paperFill(g, ip, PAL.ice, { rim: PAL.white, rimW: 0.9 * sc, rimA: 0.9 });
    }
  }
  // 金边
  if (glow > 0) {
    g.save();
    g.lineJoin = 'round';
    g.globalAlpha *= clamp(glow);
    g.strokeStyle = PAL.gold; g.lineWidth = 3.6 * Math.min(sc, 4);
    g.stroke(path);
    g.strokeStyle = PAL.goldLight; g.lineWidth = 1.5 * Math.min(sc, 4);
    g.stroke(path);
    g.restore();
    if (detail) {
      for (let j = 0; j < 3; j++) {
        const u = (t * 0.33 + j / 3) % 1;
        const A = edgeAt(E, u);
        const k = Math.sin(Math.PI * ((t * 1.7 + j * 0.37) % 1));
        if (k <= 0.05) continue;
        star4(g, A.l[0], A.l[1], 6 * sc * k * glow, PAL.goldLight, glow * k);
      }
    }
  }
  // 沿围巾写字
  if (o.text) {
    glyphsOnPath(g, [...o.text], pts, {
      size: o.textSize ?? width * 0.72, family: o.textFamily ?? 'display', fill: o.textFill ?? PAL.gold, edge: o.textEdge ?? null,
      start: o.textStart ?? width * 0.6, grow: o.textGrow, gap: o.textGap,
    });
  }
  g.restore();
  return { end: pts[n - 1], hole: holeC, len: E.len, path };
}

/** 四角星（不随所在变换旋转，永远正立；size 按当前缩放）。 */
export function star4(g, x, y, size, color, alpha = 1) {
  if (size <= 0.2 || alpha <= 0) return;
  g.save();
  g.translate(x, y);
  const m = g.getTransform();
  const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  g.setTransform(sc, 0, 0, sc, m.e, m.f);
  g.globalAlpha *= clamp(alpha);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU - Math.PI / 2;
    g.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    const b = a + TAU / 8;
    g.lineTo(Math.cos(b) * size * 0.24, Math.sin(b) * size * 0.24);
  }
  g.closePath();
  g.fill();
  g.restore();
}

// ———————————————————— b14：巨型围巾擦屏 ————————————————————
function wipeGeom(T, o) {
  const { p = 0, y = 540, w = 1240, len = 1750, notch = true, hole = true, t = T, seed = 41 } = o;
  const twist = 640;
  const lead = lerp(2000 + 260, -len - twist - 200, clamp(p));
  const n = 46;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);                      // 0 = 扭转段尾（右上），1 = 前端（左）
    const d = (1 - u) * (len + twist);          // 离前端的距离
    const tw = clamp((d - len) / twist);
    raw.push([lead + d, y + Math.sin(d / 420 - t * 3.2 + seed) * 38 - tw * tw * 900]);
  }
  const wfn = (u) => {
    const d = (1 - u) * (len + twist);
    const tw = clamp((d - len) / twist);
    return w * Math.max(0.03, Math.cos((tw * Math.PI) / 2));
  };
  const E = edges(raw, wfn);
  const depth = notch ? w * 0.26 : 0;
  const path = ribbonPath(E, notch ? 'notch' : 'flat', depth);
  const H = edgeAt(E, 1 - (len * 0.42) / (len + twist));
  const holeP = hole ? jagged(H.c[0], H.c[1], 150, 105, 0.15, seed + 3, 0.18, 16) : null;
  const tl = E.T[n - 1], le = E.L[n - 1], re = E.R[n - 1];
  const reveal = new Path2D();
  const top = le[1] < re[1] ? le : re, bot = le[1] < re[1] ? re : le;
  const apex = [(le[0] + re[0]) / 2 - tl[0] * depth, (le[1] + re[1]) / 2 - tl[1] * depth];
  reveal.moveTo(top[0], -600); reveal.lineTo(top[0], top[1]); reveal.lineTo(apex[0], apex[1]); reveal.lineTo(bot[0], bot[1]);
  reveal.lineTo(bot[0], 1700); reveal.lineTo(4200, 1700); reveal.lineTo(4200, -600); reveal.closePath();
  return { E, n, path, depth, H, holeP, tl, le, re, lead, len, twist, reveal, seed, t, w, y };
}
/** 擦屏的揭示区域（Path2D，屏幕坐标）：前端轮廓右侧。镜头用它做 ctx.mask 画后一镜，再在上面画 drawScarfWipe（破洞与扭转段自然透出）。 */
export function scarfWipeMask(T, o = {}) {
  return wipeGeom(T, o).reveal;
}
/**
 * drawScarfWipe(g, T, o)：几乎占满画面高度的巨大红围巾从右往左横扫（屏幕坐标）。
 * o: { p 0..1（0 = 还在画右外，1 = 已整条扫出画左）, y=540（中线）, w=1240（围巾宽）, len=1750（满宽段长度）,
 *      notch=true, hole=true, patch=false, t=T, seed }
 * 前端是 V 形缺口 + 流苏，后段扭成侧面（变窄、露暗面）向右上甩出画面；破洞透明。
 * 返回 { reveal（同 scarfWipeMask）, lead（前端 x）, hole:[x,y] }。
 */
export function drawScarfWipe(g, T, o = {}) {
  const G = wipeGeom(T, o);
  const { E, path, holeP, H, tl, le, re, lead, len, twist, seed, t, w, y } = G;
  const notch = o.notch ?? true, patch = !!o.patch;
  g.save();
  if (holeP && !patch) {
    const cp = new Path2D();
    cp.rect(-1e5, -1e5, 2e5, 2e5);
    cp.addPath(holeP);
    g.clip(cp, 'evenodd');
  }
  const apex = [(le[0] + re[0]) / 2 - tl[0] * G.depth, (le[1] + re[1]) / 2 - tl[1] * G.depth];
  const bases = notch
    ? [[le, 0.06], [le, 0.22], [le, 0.38], [re, 0.06], [re, 0.22], [re, 0.38]].map(([tip, f]) => [lerp(tip[0], apex[0], f), lerp(tip[1], apex[1], f)])
    : [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => [lerp(le[0], re[0], f), lerp(le[1], re[1], f)]);
  bases.forEach((b0, j) => {
    const b = [b0[0] - tl[0] * 40, b0[1] - tl[1] * 40];
    paperFill(g, strand(b, tl, 200 + 60 * hash2(seed, j), 40, 16, Math.sin(t * 6 + j) * 0.25), PAL.scarf, { lift: 8, liftA: 0.25 });
  });
  paperFill(g, path, PAL.scarf, { lift: 14, liftA: 0.3 });
  g.save();
  g.clip(path);
  const x0 = lead + len;
  const gr = g.createLinearGradient(x0 - 80, 0, x0 + twist * 0.7, 0);
  gr.addColorStop(0, rgba(PAL.scarfDark, 0)); gr.addColorStop(0.35, rgba(PAL.scarfDark, 0.7)); gr.addColorStop(1, rgba(PAL.redDeep, 0.85));
  g.fillStyle = gr;
  g.fillRect(x0 - 80, -400, twist + 600, 2000);
  for (const d0 of [len * 0.12, len * 0.17]) { g.fillStyle = rgba(PAL.scarfDark, 0.8); g.fillRect(lead + d0, -400, 34, 2000); }
  for (let i = 0; i < 9; i++) {
    const yy = y - w * 0.42 + (w * 0.84 * (i + 0.5)) / 9;
    g.strokeStyle = rgba(PAL.scarfDark, 0.18); g.lineWidth = 6;
    g.beginPath(); g.moveTo(lead, yy); g.lineTo(lead + len, yy + 20 * Math.sin(i)); g.stroke();
  }
  g.restore();
  rimLine(g, path, mixHex(PAL.scarf, PAL.white, 0.4), 6, 0.8, 1);
  rimLine(g, path, PAL.scarfDark, 6, 0.6, -1);
  if (holeP && !patch) { g.lineWidth = 5; g.strokeStyle = PAL.scarfDark; g.stroke(holeP); }
  if (holeP && patch) paperFill(g, jagged(H.c[0], H.c[1], 190, 150, 0.2, seed + 9, 0.05, 10), PAL.princessLight, { lift: 8, rim: PAL.white, rimW: 4, under: PAL.princess, underW: 5 });
  g.restore();
  return { reveal: G.reveal, lead, hole: holeP ? H.c : null };
}

// ———————————————————— b07：红虚线合拢成红带 ————————————————————
/**
 * drawScarfBand(g, T, o)：一条斜穿画面的粗红虚线，间隔随 p 合拢成连续红带（屏幕坐标）。
 * o: { p 0..1（1 = 完全合拢）, angle=-0.42（弧度）, width=110, cx=960, cy=540, period（默认 width·4.25，= 地图虚线 [20,14]、lw 8 等比放大）,
 *      dash0=0.59（p=0 时的实线占比）, wave 0..1（开始像围巾一样起伏）, t=T, length=2900 }
 * 返回 { angle, width, dir:[cos,sin] }。
 */
export function drawScarfBand(g, T, o = {}) {
  const { p = 0, angle = -0.42, width = 110, cx = 960, cy = 540, dash0 = 0.59, wave = 0, t = T, length = 2900, seed = 7 } = o;
  const period = o.period ?? width * 4.25;
  const frac = lerp(dash0, 1, clamp(p));
  const amp = wave * width * 0.32;
  const yOf = (x) => amp * Math.sin(x / (width * 2.6) - t * 5.4);
  const piece = (xa, xb, ends) => {
    const m = Math.max(3, Math.ceil((xb - xa) / (width * 0.35)));
    const pts = [];
    for (let i = 0; i <= m; i++) { const xx = lerp(xa, xb, i / m); pts.push([xx, yOf(xx)]); }
    return ends ? capsuleAlong(pts, width) : ribbonPath(edges(pts, () => width), 'flat');
  };
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);
  const half = length / 2;
  const paths = [];
  if (frac >= 0.999) paths.push(piece(-half, half, false));
  else {
    const K = Math.ceil(half / period) + 1;
    for (let k = -K; k <= K; k++) {
      const c = k * period, hl = (period * frac) / 2 - width * 0.5 * (1 - clamp(p) * 0.8);
      if (hl <= 0) continue;
      paths.push(piece(c - hl, c + hl, true));
    }
  }
  for (const path of paths) {
    paperFill(g, path, PAL.scarf, { lift: width * 0.06, liftA: 0.26, rim: mixHex(PAL.scarf, PAL.white, 0.38), rimW: Math.max(2, width * 0.02), under: PAL.scarfDark, underW: Math.max(2, width * 0.03), underA: 0.5 });
  }
  if (wave > 0) {
    g.save();
    g.globalAlpha *= wave;
    for (const path of paths) {
      g.save();
      g.clip(path);
      for (let i = 0; i < 12; i++) {
        const xx = -half + ((i + 0.5) * length) / 12;
        if (noise1(i * 0.7 + t * 0.6, seed) < 0.15) continue;
        g.fillStyle = rgba(PAL.scarfDark, 0.3);
        g.fillRect(xx, -width, length / 24, width * 2);
      }
      g.restore();
    }
    g.restore();
  }
  g.restore();
  return { angle, width, dir: [Math.cos(angle), Math.sin(angle)] };
}

// ———————————————————— 书签 ————————————————————
/**
 * drawBookmark(g, o)：scarf 色燕尾丝带书签。锚在丝带从书口伸出的点（上端）。
 * o: { x=1560, y=880, len=120, width=34, s=1, t, wobbleAt（抽动时刻，4Hz 阻尼）, rot（整体偏角，弧度）, detail=1, alpha }
 * 返回 { tip:[x,y] }。
 */
export function drawBookmark(g, o = {}) {
  const { x = 1560, y = 880, len = 120, width = 34, s = 1, t = 0, wobbleAt = null, rot = 0, detail = 1, alpha = 1 } = o;
  const wb = wobbleAt == null ? 0 : wobble(t, wobbleAt, 4, 0.4) * 0.32;
  const sway = 0.035 * Math.sin(t * 1.3) + 0.03 * noise1(t * 0.6, 5) + wb;
  const pts = [[0, 0]];
  for (let i = 1; i <= 10; i++) {
    const u = i / 10, ang = rot + sway * u * 1.8 + 0.05 * Math.sin(u * 3 + 0.5);
    const pv = pts[i - 1];
    pts.push([pv[0] - Math.sin(ang) * (len / 10), pv[1] + Math.cos(ang) * (len / 10)]);
  }
  const E = edges(pts, () => width);
  const path = ribbonPath(E, 'notch', width * 0.55);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  if (alpha !== 1) g.globalAlpha *= alpha;
  paperFill(g, path, PAL.scarf, detail ? { lift: 2.4, liftA: 0.26, cx: 0, cy: len / 2, r: len * 0.6, shadeA: 0.16, rim: mixHex(PAL.scarf, PAL.white, 0.38), rimW: 1.6, under: PAL.scarfDark, underW: 1.6, underA: 0.55 } : {});
  if (detail) {
    // 中线织纹
    g.save(); g.clip(path);
    const mid = new Path2D(); curveThrough(mid, pts.slice(0, 9), true);
    g.strokeStyle = rgba(PAL.scarfDark, 0.35); g.lineWidth = 1.2; g.setLineDash([3, 3]); g.stroke(mid);
    g.restore();
  }
  g.restore();
  const e = pts[pts.length - 1];
  return { tip: [x + e[0] * s, y + e[1] * s] };
}

// ———————————————————— b15：围巾缠住两人相握的手 ————————————————————
/**
 * drawScarfKnot(g, o)：红围巾自己绕上相握的手当红绳。锚在两只手相握的中心。
 * o: { x, y, s=1, p 0..1（0–0.75 一圈圈缠上，0.75–1 顶上弹出蝴蝶结）, part:'back'|'front'|'all', t, turns=2.2, rx=30, ry=17, width=12, patch }
 * 'back' 画绕到手后面的那几段（先于手画），'front' 画手前面的几段与蝴蝶结（后于手画）。
 * 返回 { bow:[x,y] }。
 */
export function drawScarfKnot(g, o = {}) {
  const { x = 0, y = 0, s = 1, p = 1, part = 'all', t = 0, turns = 2.2, rx = 30, ry = 17, width = 12, seed = 13 } = o;
  const total = turns * TAU;
  const thEnd = clamp(p / 0.75) * total;
  const N = Math.ceil(turns * 28);
  const at = (th) => [lerp(-rx, rx, th / total), ry * Math.sin(th - Math.PI / 2) * -1];
  const front = (th) => Math.cos(th - Math.PI / 2) >= 0;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // 分段（前 / 后）
  const runs = [];
  let cur = null;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * total;
    if (th > thEnd + 1e-6) break;
    const f = front(th);
    if (!cur || cur.f !== f) { if (cur) cur.pts.push(at(th)); cur = { f, pts: [] }; runs.push(cur); }
    cur.pts.push(at(th));
  }
  if (cur && thEnd < total) cur.pts.push(at(thEnd));
  for (const r of runs) {
    if (r.pts.length < 2) continue;
    if (r.f && part === 'back') continue;
    if (!r.f && part === 'front') continue;
    const E = edges(r.pts, () => width);
    const path = ribbonPath(E, 'flat');
    if (r.f) paperFill(g, path, PAL.scarf, { lift: 1.6, rim: mixHex(PAL.scarf, PAL.white, 0.38), rimW: 1.2, under: PAL.scarfDark, underW: 1.2 });
    else paperFill(g, path, mixHex(PAL.scarf, PAL.scarfDark, 0.65), {});
  }
  // 蝴蝶结
  const bk = clamp((p - 0.75) / 0.25);
  const bow = [x, y - ry * s - 6 * s];
  if (bk > 0 && part !== 'back') {
    const k = outBack(bk, 2.4);
    g.save();
    g.translate(0, -ry - 6);
    g.scale(k, k);
    const sway = Math.sin(t * 3 + seed) * 0.08;
    for (const side of [-1, 1]) {
      g.save();
      g.rotate(side * (0.5 + sway));
      paperFill(g, jagged(side * 13, 0, 13, 8, 0, seed + side, 0.06, 12), PAL.scarf, { lift: 1.4, rim: mixHex(PAL.scarf, PAL.white, 0.38), rimW: 1.1, under: PAL.scarfDark });
      g.restore();
      const tail = [[side * 2, 3], [side * 9, 14], [side * (14 + 2 * Math.sin(t * 4 + side)), 26]];
      paperFill(g, ribbonPath(edges(tail, () => 8), 'notch', 5), PAL.scarf, { lift: 1.2, under: PAL.scarfDark });
    }
    paperFill(g, jagged(0, 0, 6, 6, 0, seed + 7, 0.05, 10), mixHex(PAL.scarf, PAL.scarfDark, 0.3), { rim: mixHex(PAL.scarf, PAL.white, 0.3), rimW: 1 });
    g.restore();
  }
  g.restore();
  return { bow };
}
