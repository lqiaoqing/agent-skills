// 最快的白马：纸艺关节木偶（剪纸部件绕枢轴转 + 两段 IK 腿 + 拖尾链鬃毛/尾巴）。
// 坐标：(x, y) = 站立时四蹄着地的脚底中心；face 1 朝右；s=1 时全长约 300（尾尖到鼻尖）、高约 230（到耳尖）。
// 步态相位 phase = 世界 x ÷ (280·s)：内部按各步态自己的步幅换算成周期，支撑期蹄子在世界坐标里一动不动（不打滑）。
// 纯函数：画面只由参数决定（含 t），不存跨帧状态；拖尾用“在过去时刻重新求姿态”的方法算。
import { PAL, ribbon, smooth as smoothPath, shade, glow, sparkle, rgba, mixHex } from '../core/paper.js';
import { clamp, lerp, TAU, hash1, hash2, noise1, fract, wobble, squash as squashOf, smoothstep } from '../core/util.js';
import { outBack, outCubic, inOutQuad, inOutCubic, outQuad, ez } from '../core/ease.js';

const D = Math.PI / 180;

// ———————————————————— 公共常量 ————————————————————
/** 标准步幅（s=1）：phase = 世界 x ÷ (HORSE_STRIDE·s)。 */
export const HORSE_STRIDE = 280;
export const HORSE_POSES = ['gallop', 'trot', 'walk', 'limp', 'skid', 'rear', 'tossMane', 'pawGround', 'headwind', 'biteCoin', 'hideRock', 'leap', 'stand', 'speedLines'];
export const HORSE_EXPRS = ['normal', 'proud', 'happy', 'scared', 'effort', 'hurt', 'neigh', 'chomp'];
/** o.joints 可用的键（度；bodyX/bodyY 为 px）。 */
export const HORSE_JOINTS = ['body', 'bodyX', 'bodyY', 'neck', 'head', 'jaw', 'earN', 'earF', 'tail', 'fnU', 'fnL', 'fnH', 'ffU', 'ffL', 'ffH', 'hnU', 'hnL', 'hnH', 'hfU', 'hfL', 'hfH'];
/** 世界 x → phase 的换算（任何步态都这样传）。 */
export const horsePhase = (worldX, s = 1) => worldX / (HORSE_STRIDE * s);

// ———————————————————— 骨架尺寸（s=1，身体系相对身体中心） ————————————————————
const BODY_C = [0, -108];
const HIP = [-48, 14], SHO = [46, 12];
const L1 = 43, L2 = 41, FET = 13; // 上段、下段、球节离地高（蹄子高）
const NECK_BASE = [50, -22], NECK_LEN = 52;
const TAIL_ROOT = [-77, -30];
const SEAT = [-4, -54], SEAT_BACK = [-46, -46];
const STIRRUP_TOP = [-4, -42];
const HS = 1.12; // 头部整体放大（Q 版大头）
const HEAD_W = 86 * HS; // 脸部统一画法的“头宽”
const LEGS = ['hf', 'ff', 'hn', 'fn']; // 远后、远前、近后、近前
const STAND = { hf: [-55, -FET], hn: [-47, -FET], ff: [52, -FET], fn: [44, -FET] };

// ———————————————————— 步态（关键：支撑期蹄子 x = 着地点 − 步幅·相位，不打滑） ————————————————————
// 摆动期蹄子轨迹：[u, xFrac(0=离地点,1=着地点), 抬高 px]
const FORE_GALLOP = [[0, 0, 0], [0.12, -0.14, 15], [0.3, 0.12, 37], [0.5, 0.58, 42], [0.7, 1.08, 27], [0.86, 1.16, 11], [1, 1, 0]];
const HIND_GALLOP = [[0, 0, 0], [0.18, -0.42, 15], [0.36, -0.3, 28], [0.56, 0.25, 35], [0.78, 0.95, 22], [0.9, 1.08, 7], [1, 1, 0]];
const FORE_TROT = [[0, 0, 0], [0.2, -0.06, 22], [0.5, 0.52, 40], [0.78, 1.1, 20], [0.92, 1.05, 6], [1, 1, 0]];
const HIND_TROT = [[0, 0, 0], [0.2, -0.12, 14], [0.5, 0.48, 28], [0.8, 1.05, 11], [1, 1, 0]];
const FORE_WALK = [[0, 0, 0], [0.25, 0.08, 16], [0.55, 0.6, 22], [0.85, 1.04, 6], [1, 1, 0]];
const HIND_WALK = [[0, 0, 0], [0.3, 0.14, 13], [0.62, 0.66, 13], [0.88, 1.03, 4], [1, 1, 0]];

/** 步态表。stride 为 s=1 的步幅；speed 为未传 phase 时的默认速度（px/s，s=1）。 */
export const HORSE_GAITS = {
  gallop: {
    // 飞驰式：前、前、后、后着地，后蹄蹬地后四肢舒展腾空（读起来最快、最好看）
    stride: 280, speed: 900, duty: 0.26, td: { ff: 0, fn: 0.08, hf: 0.36, hn: 0.44 }, ctr: { h: 6, f: -4 }, sw: { f: FORE_GALLOP, h: HIND_GALLOP },
    by: 8, bob: [[0, 2], [0.15, 7], [0.3, 3], [0.4, 3], [0.55, 6], [0.68, 2], [0.84, -9]],
    pitch: [[0, -2], [0.15, -5], [0.3, -2], [0.45, 3], [0.6, 4], [0.75, 2], [0.9, 0]],
    neck: 46, neckK: [[0, 4], [0.15, 7], [0.4, 0], [0.6, -4], [0.85, -2]], head: -4, tail: 38, tailK: [[0, -4], [0.5, 6]], ears: 16,
  },
  trot: {
    stride: 160, speed: 380, duty: 0.42, td: { hf: 0, fn: 0, hn: 0.5, ff: 0.5 }, ctr: { h: 0, f: 0 }, sw: { f: FORE_TROT, h: HIND_TROT },
    by: 8.5, bob: [[0, -1], [0.21, 3], [0.42, -2], [0.5, -1], [0.71, 3], [0.92, -2]],
    pitch: [[0, 0], [0.21, -1.2], [0.5, 0], [0.71, 1.2]],
    neck: 34, neckK: [[0, -1], [0.21, 3], [0.5, -1], [0.71, 3]], head: -10, tail: 20, tailK: [[0, -3], [0.25, 3], [0.5, -3], [0.75, 3]], ears: 4,
  },
  walk: {
    stride: 90, speed: 150, duty: 0.62, td: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 }, ctr: { h: 0, f: 0 }, sw: { f: FORE_WALK, h: HIND_WALK },
    by: 4.5, bob: [[0, 0], [0.25, 1.5], [0.5, 0], [0.75, 1.5]],
    pitch: [[0, 0.6], [0.25, -0.6], [0.5, 0.6], [0.75, -0.6]],
    neck: 30, neckK: [[0, -2], [0.25, 3], [0.5, -2], [0.75, 3]], head: -12, tail: 4, tailK: [[0, -4], [0.5, 4]], ears: 0,
  },
};
HORSE_GAITS.limp = HORSE_GAITS.trot; // limp 的腿基于 o.gait（默认 trot），伤腿另行修改

// ———————————————————— 数学 ————————————————————
const hermite = (a, b, m1, m2, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * m2;
};
/** 周期样条：keys = [[p, v], ...]，p ∈ [0,1) 升序且第一个为 0。 */
function periodic(keys, p) {
  const n = keys.length;
  p = fract(p);
  let i = 0;
  for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  const p1 = k1[0];
  let p2 = k2[0]; if (p2 <= p1) p2 += 1;
  let p0 = k0[0]; if (p0 >= p1) p0 -= 1;
  let p3 = k3[0]; while (p3 <= p2) p3 += 1;
  const h = p2 - p1;
  const u = (p - p1) / h;
  const m1 = ((k2[1] - k0[1]) / (p2 - p0)) * h, m2 = ((k3[1] - k1[1]) / (p3 - p1)) * h;
  return hermite(k1[1], k2[1], m1, m2, u);
}
/** 开放样条（摆动轨迹）：keys = [[u, x, y], ...]；m0/m1 为两端 dx/du（null 用差分）。 */
function pathSpline(keys, u, m0x, m1x) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && u > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], h = b[0] - a[0];
  const s = clamp((u - a[0]) / h);
  const tan = (j, c) => {
    if (j === 0) return c === 1 && m0x != null ? m0x : (keys[1][c] - keys[0][c]) / (keys[1][0] - keys[0][0]);
    if (j === n - 1) return c === 1 && m1x != null ? m1x : (keys[j][c] - keys[j - 1][c]) / (keys[j][0] - keys[j - 1][0]);
    return (keys[j + 1][c] - keys[j - 1][c]) / (keys[j + 1][0] - keys[j - 1][0]);
  };
  return [hermite(a[1], b[1], tan(i, 1) * h, tan(i + 1, 1) * h, s), hermite(a[2], b[2], tan(i, 2) * h, tan(i + 1, 2) * h, s)];
}
/** 身体系点 → 根坐标（c 为身体中心，a 为画布旋转角）。 */
const xf = (c, a, p) => [c[0] + p[0] * Math.cos(a) - p[1] * Math.sin(a), c[1] + p[0] * Math.sin(a) + p[1] * Math.cos(a)];
/** 两段 IK：返回上段、下段的画布绝对角。bend=+1 关节朝前（前腿膝），−1 朝后（后腿飞节）。 */
function ik2(px, py, tx, ty, bend) {
  const dx = tx - px, dy = ty - py;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
  const th0 = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const th1 = th0 - bend * a;
  const kx = px + Math.cos(th1) * L1, ky = py + Math.sin(th1) * L1;
  const th2 = Math.atan2(py + Math.sin(th0) * d - ky, px + Math.cos(th0) * d - kx);
  return [th1, th2];
}
const wrapPulse = (p, c, w) => { let d = fract(p - c + 0.5) - 0.5; return Math.exp(-((d / w) ** 2)); };

// ———————————————————— 姿态状态 ————————————————————
function baseState() {
  return {
    bx: 0, by: 0, pitch: 0, neck: 26, head: -14, jaw: 0, earN: 0, earF: 0, tail: 0, swish: 0,
    legs: { hf: { tgt: [...STAND.hf], c: 1 }, hn: { tgt: [...STAND.hn], c: 1 }, ff: { tgt: [...STAND.ff], c: 1 }, fn: { tgt: [...STAND.fn], c: 1 } },
    expr: 'normal', wind: [0, 0], gleam: 0, shiver: 0, moving: 0, coin: 0, coinBite: 0, cheek: 0,
  };
}

function cycleOf(o, G) {
  const face = o.face ?? 1;
  if (o.phase != null) return (o.phase * face * HORSE_STRIDE) / G.stride;
  return ((o.t ?? 0) * (o.speed ?? G.speed)) / G.stride;
}

/** 一条腿在步态里的球节目标点（根坐标）。mod：跛脚修改 {leg, duty, lift}。 */
function gaitLeg(G, leg, cyc, mod) {
  const type = leg[0];
  const piv = type === 'f' ? SHO : HIP;
  const span = G.stride * G.duty;
  const xTD = piv[0] + G.ctr[type] + span / 2;
  let duty = G.duty, lift = 1;
  if (mod && mod.leg === leg) { duty *= mod.duty; lift *= mod.lift; }
  const xLO = xTD - G.stride * duty;
  const lp = fract(cyc - G.td[leg]);
  if (lp < duty) return { tgt: [xTD - G.stride * lp, -FET], c: 1, push: lp / duty, u: -1 };
  const u = (lp - duty) / (1 - duty);
  const back = (G.stride * (1 - duty)) / (xTD - xLO);
  const [xf_, lf] = pathSpline(G.sw[type], u, -back, -back * 0.6);
  return { tgt: [xLO + xf_ * (xTD - xLO), -FET - Math.max(0, lf) * lift], c: 0, push: 0, u };
}

function locomotion(st, G, cyc, mod) {
  st.by = G.by + periodic(G.bob, cyc);
  st.pitch = periodic(G.pitch, cyc);
  st.neck = G.neck + periodic(G.neckK, cyc);
  st.head = G.head;
  st.tail = G.tail + periodic(G.tailK, cyc);
  st.earN = G.ears; st.earF = G.ears + 4;
  for (const leg of LEGS) st.legs[leg] = gaitLeg(G, leg, cyc, mod);
  st.moving = 1;
  if (mod) {
    // 伤腿着地瞬间身体和头往上一抽（不敢吃重）
    const k = wrapPulse(cyc, G.td[mod.leg] + 0.04, 0.07) * (mod.k ?? 1);
    st.by -= 4 * k; st.neck -= 12 * k; st.head += 6 * k;
  }
}

/** 合法步态名（gallop / trot / walk），否则用 def。 */
const gaitOf = (g, def) => (g === 'gallop' || g === 'trot' || g === 'walk' ? g : def);
/**
 * 跛行修改：o.limp 0..1（true = 1）可叠加在任何移动步态上，pose 'limp' 未传时按 1。
 * 伤腿 = bandageLeg 的腿名字符串，默认 fn。强度 k 线性缩放“支撑期变短、抬得更高、着地一抽”。
 */
function limpMod(o, def = 0) {
  const k = clamp(o.limp === true ? 1 : typeof o.limp === 'number' ? o.limp : def);
  if (!(k > 0)) return null;
  const leg = LEGS.includes(o.bandageLeg) ? o.bandageLeg : 'fn';
  return { leg, duty: lerp(1, 0.55, k), lift: lerp(1, 1.35, k), k };
}

/** 站立时的呼吸、眨耳、甩尾（只由 t 决定）。 */
function idle(st, t) {
  st.by += Math.sin(t * TAU * 0.33) * 1.2;
  st.neck += Math.sin(t * TAU * 0.33 + 0.6) * 1.2;
  st.swish = Math.sin(t * 1.3) * 7 + noise1(t * 0.7, 5) * 5;
  const k = Math.floor(t / 2.7), ft = t - k * 2.7 - hash1(k * 3.1 + 0.5) * 1.6;
  st.earN += 18 * Math.max(0, wobble(ft, 0, 3.2, 0.18)) * (hash1(k + 0.3) > 0.4 ? 1 : 0);
  st.earF += 14 * Math.max(0, wobble(ft - 0.4, 0, 3.2, 0.18)) * (hash1(k + 0.7) > 0.5 ? 1 : 0);
}

/** 抬近前腿“踏一下/刨地”：ts = 落蹄时刻数组；drag 为刨地（落下后向后拖）。 */
function hoofStrikes(st, t, ts, drag) {
  let best = null;
  for (const ti of ts) { const d = t - ti; if (d > -0.26 && d < 0.34 && (best === null || Math.abs(d) < Math.abs(best))) best = d; }
  if (best === null) return 0;
  const d = best, base = STAND.fn;
  let x = base[0], y = base[1], c = 1;
  if (d < -0.08) { const k = inOutQuad(seg(d, -0.26, -0.08)); x = lerp(base[0], base[0] + 22, k); y = lerp(base[1], base[1] - 34, k); c = 0; }
  else if (d < 0) { const k = seg(d, -0.08, 0) ** 2; x = base[0] + 22 - 2 * k; y = base[1] - 34 * (1 - k); c = k > 0.95 ? 1 : 0; }
  else if (drag && d < 0.16) { const k = outQuad(seg(d, 0, 0.16)); x = lerp(base[0] + 20, base[0] - 6, k); }
  else { const k = inOutQuad(seg(d, drag ? 0.16 : 0.06, 0.34)); x = lerp(drag ? base[0] - 6 : base[0] + 20, base[0], k); y = base[1] - 6 * Math.sin(Math.PI * k); c = k > 0.98 || k < 0.02 ? 1 : 0; }
  st.legs.fn = { tgt: [x, y], c, push: 0, u: c ? -1 : 0.4 };
  return d;
}
const seg = (t, a, b) => clamp((t - a) / (b - a));

/** 把身体放到让髋部落在 hip 处（按俯仰角反解身体中心）。 */
function placeByHip(st, hip) {
  const c = [hip[0] - (HIP[0] * Math.cos(-st.pitch * D) - HIP[1] * Math.sin(-st.pitch * D)), hip[1] - (HIP[0] * Math.sin(-st.pitch * D) + HIP[1] * Math.cos(-st.pitch * D))];
  st.bx = c[0] - BODY_C[0]; st.by = c[1] - BODY_C[1];
}

// 各动作：写入 st（单个动作的“完整形态”，过渡交给 {from,to,k}）
const POSE = {
  stand(st, o, t) {
    idle(st, t);
    if (o.stamp != null) hoofStrikes(st, t, [].concat(o.stamp), false);
  },
  gallop(st, o, t, cyc) { locomotion(st, HORSE_GAITS.gallop, cyc.gallop, limpMod(o)); },
  trot(st, o, t, cyc) { locomotion(st, HORSE_GAITS.trot, cyc.trot, limpMod(o)); },
  walk(st, o, t, cyc) { locomotion(st, HORSE_GAITS.walk, cyc.walk, limpMod(o)); },
  speedLines(st, o, t, cyc) { locomotion(st, HORSE_GAITS.gallop, cyc.gallop, limpMod(o)); st.lines = 1; },
  limp(st, o, t, cyc) {
    const gn = gaitOf(o.gait, 'trot');
    locomotion(st, HORSE_GAITS[gn], cyc[gn], limpMod(o, 1));
    st.expr = 'hurt';
  },
  headwind(st, o, t, cyc) {
    const gn = gaitOf(o.gait, 'trot');
    locomotion(st, HORSE_GAITS[gn], cyc[gn], limpMod(o));
    st.pitch -= 5; st.by += 5; st.neck = 74 + (st.neck - HORSE_GAITS[gn].neck) * 0.4; st.head = 8;
    st.earN = 38; st.earF = 42; st.tail -= 10;
    st.wind = [-520, -30];
    st.expr = 'effort';
  },
  pawGround(st, o, t) {
    idle(st, t);
    st.pitch = -3; st.by += 3; st.neck = 40; st.head = -8; st.earN = -4; st.earF = 0;
    st.swish = Math.sin(t * 4.2) * 12;
    const ts = o.paw != null ? [].concat(o.paw) : [Math.floor(t / 0.62) * 0.62 + 0.3, Math.floor(t / 0.62) * 0.62 + 0.92];
    const d = hoofStrikes(st, t, ts, true);
    st.pawDust = d > -0.01 && d < 0.18 ? 1 - d / 0.18 : 0;
  },
  tossMane(st, o, t) {
    idle(st, t);
    const at = o.at ?? Math.floor((t + 0.4) / 2.4) * 2.4 + 0.6;
    const tt = t - at;
    const a = ez(tt, -0.26, 0, inOutQuad), w = ez(tt, 0, 0.17, outCubic);
    const wb = wobble(tt, 0.17, 2.4, 0.32);
    st.neck += 16 * a * (1 - w) - 36 * w + 7 * wb;
    st.head += -12 * a * (1 - w) + 40 * w - 7 * wb;
    st.pitch += 4 * w - 1.5 * wb;
    st.by -= 3 * w;
    st.earN = 6 * w; st.earF = 8 * w;
    st.tail += 10 * w;
    if (tt > -0.02) st.expr = 'proud';
    st.gleam = tt > 0.12 ? Math.exp(-(((tt - 0.42) / 0.2) ** 2)) : 0;
    st.toss = clamp(tt / 0.17);
  },
  rear(st, o, t) {
    const q = t * 2.3;
    st.pitch = 50 + 2.5 * Math.sin(t * TAU * 1.15);
    placeByHip(st, [-46, -88 + 1.5 * Math.sin(t * TAU * 1.15 + 1)]);
    st.legs.hf = { tgt: [-38, -FET], c: 1 }; st.legs.hn = { tgt: [-30, -FET], c: 1 };
    st.legs.fn = { ang: [62 + 26 * Math.sin(TAU * q), -96 + 46 * Math.sin(TAU * q + 1.3), -30], c: 0 };
    st.legs.ff = { ang: [52 + 26 * Math.sin(TAU * q + 2.6), -90 + 46 * Math.sin(TAU * q + 3.9), -30], c: 0 };
    st.neck = 44; st.head = 6 + 4 * Math.sin(t * TAU * 1.15); st.jaw = 24;
    st.earN = 14; st.earF = 18; st.tail = -26; st.swish = Math.sin(t * 3) * 6;
    st.expr = 'neigh';
  },
  skid(st, o, t) {
    st.pitch = 16;
    const sh = o.at != null ? Math.exp(-Math.max(0, t - o.at) / 0.35) : 1;
    placeByHip(st, [-46, -58 + 1.2 * sh * noise1(t * 40, 3)]);
    st.legs.hf = { tgt: [-18, -FET], c: 1, push: 1 }; st.legs.hn = { tgt: [-10, -FET], c: 1, push: 1 };
    st.legs.ff = { tgt: [75, -FET], c: 1, push: 1 }; st.legs.fn = { tgt: [81, -FET], c: 1, push: 1 };
    st.neck = 8; st.head = 2; st.jaw = 6; st.earN = 26; st.earF = 30; st.tail = 40;
    st.wind = [520, -420]; // 急停：鬃毛往前上方甩，尾巴翘起（不往肚子下钻）
    st.expr = 'effort'; st.skid = 1;
  },
  biteCoin(st, o, t, cyc) {
    const gn = gaitOf(o.gait, 'gallop');
    locomotion(st, HORSE_GAITS[gn], cyc[gn], limpMod(o));
    const at = o.at ?? Math.floor(t / 1.6) * 1.6 + 0.3;
    const tt = t - at;
    const lunge = ez(tt, -0.22, 0, outQuad) * (1 - ez(tt, 0.05, 0.25, inOutQuad));
    const chomp = Math.exp(-(((tt - 0.32) / 0.06) ** 2));
    const spit = ez(tt, 0.6, 0.7, outQuad) * (1 - ez(tt, 0.72, 0.95, inOutQuad));
    st.neck += -22 * lunge + 6 * spit;
    st.head += 16 * lunge + 6 * chomp + 14 * spit;
    st.jaw = Math.max(26 * ez(tt, -0.2, -0.05, outQuad) * (1 - ez(tt, -0.02, 0.06, inOutQuad)), 18 * spit) + 2 * chomp;
    st.coin = tt >= -0.02 && tt < 0.63 ? 1 : 0;
    st.coinBite = tt >= 0.32 ? 1 : 0;
    st.cheek = chomp;
    st.expr = tt > 0.2 && tt < 0.45 ? 'chomp' : tt >= 0.45 && tt < 0.62 ? 'proud' : 'normal';
    st.spitAt = at + 0.63;
  },
  hideRock(st, o, t) {
    st.pitch = -3;
    // 卧倒在岩石后：身体贴地，脖子半抬、鼻子朝下，只有耳朵和翘起的尾巴高过岩石（岩顶约 y = −135·s）
    st.by = 52 + Math.sin(t * TAU * 0.4) * 1;
    st.legs.ff = { tgt: [60, -11], c: 1 }; st.legs.fn = { tgt: [53, -11], c: 1 };
    st.legs.hf = { tgt: [-28, -11], c: 1 }; st.legs.hn = { tgt: [-20, -11], c: 1 };
    st.neck = 30; st.head = -8;
    const k = Math.floor(t / 1.9);
    st.earN = 34 - 16 * Math.max(0, wobble(t - k * 1.9, 0.35 + hash1(k) * 0.5, 3, 0.2));
    st.earF = 40 - 16 * Math.max(0, wobble(t - k * 1.9, 0.9 + hash1(k + 9) * 0.5, 3, 0.2));
    st.tail = 150; st.swish = Math.sin(t * 2.6) * 10 + Math.sin(t * 7.1) * 3; st.tailStiff = 0.85;
    st.expr = 'scared';
  },
  leap(st, o) {
    const a = clamp(o.air ?? 0.5);
    // 0 起跳 · 0.5 腾空舒展 · 1 落地前
    const K = [
      { pitch: 20, by: -6, neck: 40, head: -6, tail: 30, fn: [74, -128, -40], ff: [64, -118, -40], hn: [-38, 22, -10], hf: [-46, 26, -10] },
      { pitch: 2, by: -4, neck: 44, head: -4, tail: 44, fn: [68, -134, -46], ff: [56, -120, -44], hn: [-52, 32, -24], hf: [-62, 36, -24] },
      { pitch: -12, by: 0, neck: 34, head: -14, tail: 26, fn: [32, -14, 6], ff: [24, -26, 0], hn: [36, 58, -30], hf: [26, 64, -30] },
    ];
    const i = a < 0.5 ? 0 : 1, k = inOutQuad(a < 0.5 ? a * 2 : a * 2 - 1);
    const A = K[i], B = K[i + 1];
    for (const f of ['pitch', 'by', 'neck', 'head', 'tail']) st[f] = lerp(A[f], B[f], k);
    for (const leg of LEGS) st.legs[leg] = { ang: A[leg].map((v, j) => lerp(v, B[leg][j], k)), c: 0 };
    st.earN = 12; st.earF = 16; st.moving = 1; st.air = 1;
    st.expr = a < 0.8 ? 'happy' : 'normal';
  },
};
POSE.idle = POSE.stand;

function rawState(name, o, t, cyc) {
  const st = baseState();
  (POSE[name] || POSE.stand)(st, o, t, cyc);
  return st;
}

/** 腿：目标点 → 关节角（相对身体，度，正 = 往前）。 */
function resolveLegs(st) {
  const c = [BODY_C[0] + st.bx, BODY_C[1] + st.by], pb = -st.pitch * D;
  for (const leg of LEGS) {
    const L = st.legs[leg];
    if (!L.tgt) continue;
    const P = xf(c, pb, leg[0] === 'f' ? SHO : HIP);
    const [th1, th2] = ik2(P[0], P[1], L.tgt[0], L.tgt[1], leg[0] === 'f' ? 1 : -1);
    let habs = Math.PI / 2;
    if (!(L.c >= 1) && L.u != null && L.u >= 0) {
      const flex = (leg[0] === 'f' ? 70 : 40) * D * Math.sin(Math.PI * clamp(L.u * 1.12));
      habs = lerp(th2 + flex, Math.PI / 2, smoothstep(0.8, 1, L.u));
    } else if (!(L.c >= 1)) habs = th2 + 20 * D;
    L.ang = [(Math.PI / 2 + pb - th1) / D, (th1 - th2) / D, (th2 - habs) / D];
  }
}

const NUM = ['bx', 'by', 'pitch', 'neck', 'head', 'jaw', 'earN', 'earF', 'tail', 'swish', 'gleam', 'moving', 'coin', 'coinBite', 'cheek', 'lines', 'skid', 'pawDust', 'air', 'tailStiff'];
function blendState(a, b, k) {
  const st = baseState();
  for (const f of NUM) st[f] = lerp(a[f] || 0, b[f] || 0, k);
  st.wind = [lerp(a.wind[0], b.wind[0], k), lerp(a.wind[1], b.wind[1], k)];
  st.expr = k < 0.5 ? a.expr : b.expr;
  st.spitAt = k < 0.5 ? a.spitAt : b.spitAt;
  st.toss = k < 0.5 ? a.toss : b.toss;
  for (const leg of LEGS) {
    const A = a.legs[leg], B = b.legs[leg];
    if (A.tgt && B.tgt) st.legs[leg] = { tgt: [lerp(A.tgt[0], B.tgt[0], k), lerp(A.tgt[1], B.tgt[1], k)], c: Math.min(A.c, B.c), push: lerp(A.push || 0, B.push || 0, k), u: k < 0.5 ? A.u : B.u };
    else st.legs[leg] = { ang: A.ang.map((v, j) => lerp(v, B.ang[j], k)), c: lerp(A.c || 0, B.c || 0, k) };
  }
  return st;
}

function poseName(p) { return typeof p === 'string' ? p : 'stand'; }

/** 求某一时刻的完整姿态状态（含 {from,to,k} 与 joints）。 */
function stateAt(o, t, cyc) {
  const p = o.pose ?? 'stand';
  let st;
  if (p && typeof p === 'object') {
    const a = rawState(poseName(p.from), o, t, cyc), b = rawState(poseName(p.to), o, t, cyc);
    resolveLegs(a); resolveLegs(b);
    st = blendState(a, b, clamp(p.k ?? 0));
  } else st = rawState(p, o, t, cyc);
  if (o.expr) st.expr = o.expr;
  if (o.tremble) {
    const k = o.tremble;
    st.bx += noise1(t * 31, 2) * 1.6 * k; st.by += noise1(t * 29, 4) * 1.2 * k;
    st.neck += noise1(t * 27, 6) * 2.5 * k; st.head += noise1(t * 33, 8) * 2 * k;
    st.shiver = k;
  }
  const J = o.joints;
  if (J) {
    if (J.bodyX) st.bx += J.bodyX;
    if (J.bodyY) st.by += J.bodyY;
    if (J.body) st.pitch += J.body;
    for (const f of ['neck', 'head', 'jaw', 'earN', 'earF', 'tail']) if (J[f]) st[f] += J[f];
  }
  resolveLegs(st);
  if (J) for (const leg of LEGS) { const L = st.legs[leg]; L.ang = [L.ang[0] + (J[leg + 'U'] || 0), L.ang[1] + (J[leg + 'L'] || 0), L.ang[2] + (J[leg + 'H'] || 0)]; }
  return st;
}

/** 正向运动学：身体、脖子、头、尾根、四条腿各点（根坐标，s=1，朝右）。 */
function skeleton(st) {
  const c = [BODY_C[0] + st.bx, BODY_C[1] + st.by];
  const pb = -st.pitch * D;
  const nb = xf(c, pb, NECK_BASE);
  const pn = pb + st.neck * D;
  const hp = [nb[0] + Math.sin(pn) * NECK_LEN, nb[1] - Math.cos(pn) * NECK_LEN];
  const ph = pn - st.head * D;
  const tr = xf(c, pb, TAIL_ROOT);
  const pt = pb + (st.tail + st.swish) * D;
  const legs = {};
  for (const leg of LEGS) {
    const L = st.legs[leg];
    const P = xf(c, pb, leg[0] === 'f' ? SHO : HIP);
    const a1 = Math.PI / 2 + pb - L.ang[0] * D;
    const a2 = a1 - L.ang[1] * D;
    const a3 = a2 - L.ang[2] * D;
    const K = [P[0] + Math.cos(a1) * L1, P[1] + Math.sin(a1) * L1];
    const F = [K[0] + Math.cos(a2) * L2, K[1] + Math.sin(a2) * L2];
    // 蹄底（蹄子坐标系 +y 向下 12）
    const B = [F[0] + Math.cos(a3) * FET, F[1] + Math.sin(a3) * FET];
    legs[leg] = { P, K, F, B, a1, a2, a3, c: L.c || 0, push: L.push || 0 };
  }
  return { c, pb, nb, pn, hp, ph, tr, pt, legs };
}

// ———————————————————— 拖尾（鬃毛、尾巴） ————————————————————
const HAIR_DT = 0.035;
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
// 鬃毛：脖子系（脖子沿 −y，鬃脊在 −x 侧）。[rx, ry, 方向°(画布角，脖子系), 长, 根宽, 前/后层]
// 静止时顺着脖子侧面垂下（方向偏向 +y = 沿脖子往下），奔跑时被拖尾吹向后方。
const MANE = [
  [-4, -58, 150, 30, 10, 0], [-13, -50, 146, 38, 11.5, 1], [-21, -38, 142, 42, 12.5, 0],
  [-26, -25, 140, 42, 12.5, 1], [-29, -12, 140, 36, 11, 0], [-30, 1, 144, 28, 9.5, 1],
];
const MANE0 = [MANE[1], MANE[3], MANE[5]];
// 额毛：头系
const FORELOCK = [[2 * HS, -27 * HS, 58, 28, 8.5], [8 * HS, -27 * HS, 78, 21, 6.5]];
// 尾巴：尾根末端（尾根系）[方向偏移°, 长, 根宽]
// 尾巴：一片宽大的暗色“羽状”底片 + 三缕亮色发束（纸片叠层出体积）。[方向偏移°, 长, 根宽, 层, 形状]
const TAIL = [[0, 84, 21, 0, 'plume'], [-12, 76, 10, 1, 'lock'], [2, 90, 12, 1, 'lock'], [15, 72, 9.5, 1, 'lock']];
const TAIL0 = [[0, 84, 24, 0, 'plume'], [4, 76, 12, 1, 'lock']];
const DOCK = 14;

function hairChain(snaps, offs, rootFn, dirFn, len, n, o) {
  const sl = len / n;
  const r0 = rootFn(snaps[0]), a0 = dirFn(snaps[0]);
  const pts = [r0];
  for (let j = 1; j <= n; j++) {
    const sn = snaps[Math.min(j, snaps.length - 1)];
    const r = rootFn(sn), a = dirFn(sn) + o.curl * j;
    const of = offs[Math.min(j, offs.length - 1)];
    let qx = r[0] + Math.cos(a) * sl * j + of[0], qy = r[1] + Math.sin(a) * sl * j + of[1];
    const ac = a0 + o.curl * j;
    const k = o.stiff[j - 1] ?? 0;
    qx = lerp(qx, r0[0] + Math.cos(ac) * sl * j, k); qy = lerp(qy, r0[1] + Math.sin(ac) * sl * j, k);
    qy += o.grav * (j / n) ** 2 * len;
    const prev = pts[j - 1];
    let dx = qx - prev[0], dy = qy - prev[1];
    const d = Math.hypot(dx, dy) || 1;
    const fl = o.flutter * (j / n) * noise1(o.t * 7.3 + o.seed * 3.1 + j * 0.9, o.seed);
    dx = dx / d - (dy / d) * fl * 0.35; dy = dy / d + (dx / d) * fl * 0.35;
    const d2 = Math.hypot(dx, dy) || 1;
    pts.push([prev[0] + (dx / d2) * sl, prev[1] + (dy / d2) * sl]);
  }
  return pts;
}

// ———————————————————— 纸艺绘制小工具（光一律左上，投影右下） ————————————————————
/** 局部坐标里指向“屏幕右下（背光/投影方向）”的单位向量（自动处理镜像、旋转）。 */
function shadowDir(g) {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  const sx = 0.36, sy = 0.93;
  const lx = (m.d * sx - m.c * sy) / det, ly = (-m.b * sx + m.a * sy) / det;
  const L = Math.hypot(lx, ly) || 1;
  return [lx / L, ly / L];
}
/** 局部坐标里指向“屏幕左上”的单位向量（高光位置）。 */
function lightDir(g) {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  const sx = -0.55, sy = -0.83;
  const lx = (m.d * sx - m.c * sy) / det, ly = (-m.b * sx + m.a * sy) / det;
  const L = Math.hypot(lx, ly) || 1;
  return [lx / L, ly / L];
}
/**
 * 一片剪纸：lift = 压在下面部件上的暗色错位（只落在已画内容上）；rim = 受光切口亮边；
 * sh = [中心x, 中心y, 半径, 暗部 alpha] 背光渐变。
 */
function piece(g, path, fill, o = {}) {
  const sd = shadowDir(g);
  if (o.lift) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(PAL.shadow, o.liftA ?? 0.2);
    g.translate(sd[0] * o.lift * 1.7, sd[1] * o.lift * 1.7);
    g.globalAlpha *= 0.45;
    g.fill(path);
    g.translate(-sd[0] * o.lift * 0.8, -sd[1] * o.lift * 0.8);
    g.globalAlpha /= 0.45;
    g.fill(path);
    g.restore();
  }
  g.fillStyle = fill;
  g.fill(path);
  if (o.sh) {
    const [cx, cy, r, a] = o.sh;
    shade(g, path, o.shC || PAL.shadow, cx - sd[0] * r, cy - sd[1] * r, cx + sd[0] * r, cy + sd[1] * r, 0, a);
  }
  if (o.rim) {
    const w = o.rimW ?? 2.4;
    g.save();
    g.clip(path);
    g.translate(sd[0] * w * 0.95, sd[1] * w * 0.95);
    g.lineWidth = w * 1.6; g.strokeStyle = o.rim; g.globalAlpha *= o.rimA ?? 0.75;
    g.lineJoin = 'round';
    g.stroke(path);
    g.restore();
  }
}
/** 两端半径不同的圆头锥形（腿段）。 */
function taper(ax, ay, ra, bx, by, rb) {
  const d = Math.hypot(bx - ax, by - ay), th = Math.atan2(by - ay, bx - ax);
  const b = Math.asin(clamp((ra - rb) / d, -1, 1));
  const p = new Path2D();
  p.arc(ax, ay, ra, th + Math.PI / 2 - b, th - Math.PI / 2 + b);
  p.arc(bx, by, rb, th - Math.PI / 2 + b, th + Math.PI / 2 - b);
  p.closePath();
  return p;
}
/** 手剪平滑闭合形：点沿离心方向做稳定的轻微起伏。 */
function cutShape(pts, seed = 1, amp = 0.7) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  const q = pts.map((p, i) => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1, j = (hash2(seed, i) - 0.5) * 2 * amp; return [p[0] + (dx / d) * j, p[1] + (dy / d) * j]; });
  return smoothPath(q, { closed: true, tension: 0.5 });
}
const ell = (x, y, rx, ry, a = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, a, 0, TAU); return p; };
/** Catmull-Rom 重采样（拖尾链变平滑）。 */
function resample(pts, m) {
  const n = pts.length, out = [];
  for (let i = 0; i <= m; i++) {
    const f = (i / m) * (n - 1), k = Math.min(n - 2, Math.floor(f)), u = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(n - 1, k + 2)];
    out.push([0, 1].map((c) => hermite(p1[c], p2[c], (p2[c] - p0[c]) * 0.5, (p3[c] - p1[c]) * 0.5, u)));
  }
  return out;
}

// ———————————————————— 颜色 ————————————————————
const COL = {
  coat: PAL.horse, coatShade: PAL.horseShade,
  far: mixHex(PAL.horse, PAL.horseShade, 0.82),
  farLeg: mixHex(PAL.horseShade, PAL.stoneDark, 0.18),
  muzzle: mixHex(PAL.horseShade, PAL.blush, 0.2),
  muzzleFar: mixHex(PAL.horseShade, PAL.stoneDark, 0.2),
  hoof: mixHex(PAL.horseShade, PAL.stoneDark, 0.55),
  hoofFar: mixHex(PAL.horseShade, PAL.stoneDark, 0.8),
  mane: PAL.mane, maneDark: mixHex(PAL.mane, PAL.goldDark, 0.55), maneLight: PAL.goldLight,
  innerEar: mixHex(PAL.blush, PAL.horse, 0.3),
  nostril: mixHex(PAL.horseShade, PAL.inkSoft, 0.6),
  cloth: PAL.red, clothDark: PAL.redDark, trim: PAL.gold,
  leather: PAL.leather, leatherDark: mixHex(PAL.leather, PAL.woodDark, 0.55), leatherLight: mixHex(PAL.leather, PAL.kraft, 0.45),
  mouth: PAL.redDeep, tongue: PAL.heart, teeth: PAL.white,
  bandage: PAL.white, bandageLine: PAL.paper2, plaster: mixHex(PAL.sand, PAL.paper, 0.35), plasterPad: PAL.paper, plasterDot: PAL.kraftDark,
  ice: PAL.ice, snow: PAL.snow, sweat: PAL.skyDay,
};

// ———————————————————— 静态形状（懒加载，Path2D 只在浏览器里建） ————————————————————
let SH = null;
function shapes() {
  if (SH) return SH;
  SH = {
    body: cutShape([[-62, -36], [-34, -46], [-6, -43], [24, -47], [52, -40], [74, -22], [82, 2], [72, 28], [42, 42], [4, 46], [-36, 42], [-62, 30], [-80, 8], [-80, -18]], 3, 0.6),
    neck: cutShape([[16, -52], [20, -36], [25, -18], [31, -2], [30, 16], [14, 28], [-10, 28], [-28, 16], [-33, -2], [-32, -22], [-26, -40], [-16, -54], [-3, -61], [9, -59]], 5, 0.5),
    head: cutShape([[-8, -26], [16, -31], [36, -26], [52, -16], [63, -6], [70, 5], [67, 13], [58, 15], [44, 14], [30, 15], [18, 20], [4, 25], [-8, 23], [-15, 12], [-18, -4], [-16, -18]], 7, 0.45),
    jaw: cutShape([[24, 11], [44, 12], [60, 13], [66, 16], [62, 22], [48, 25], [30, 24], [16, 20]], 8, 0.3),
    muzzle: ell(57, 4, 17, 18, 0.2),
    ear: cutShape([[-7, 0], [-8.5, -12], [-5, -24], [0, -32], [5, -24], [8.5, -12], [7, 0], [0, 3]], 9, 0.3),
    earIn: cutShape([[-3.5, -3], [-4.2, -12], [-2, -21], [0, -26], [2, -21], [4.2, -12], [3.5, -3]], 10, 0.2),
    upperH: taper(-3, -6, 24, 0, L1, 9),
    upperF: taper(0.5, -3, 15.5, 0, L1, 8.4),
    lower: taper(0, 0, 8, 0, L2 - 2, 6.8),
    fetlock: ell(0.6, L2 - 1.5, 7.3, 7),
    hoof: cutShape([[-7.5, -1.5], [7, -1.5], [11.5, 10.5], [11, 13], [-9, 13], [-9.5, 11]], 11, 0.25),
    shoe: (() => { const p = new Path2D(); p.roundRect(-9.4, 11.2, 20.4, 1.9, 0.9); return p; })(),
    cloth: cutShape([[-37, -46], [-8, -44], [24, -48], [31, -41], [32, -18], [27, -11], [-32, -11], [-38, -17], [-40, -38]], 12, 0.4),
    saddle: cutShape([[-31, -45], [-29, -53], [-23, -60], [-17, -55], [-4, -52], [12, -53], [19, -59], [25, -56], [28, -47], [23, -40], [-23, -40]], 13, 0.3),
    dock: taper(0, 0, 8.5, 0, DOCK, 7),
  };
  return SH;
}

// ———————————————————— 部件绘制 ————————————————————
function drawLeg(g, L, far, kind, o) {
  const S = shapes();
  const sil = o.sil;
  const coat = sil ? o.silC : far ? COL.farLeg : COL.coat;
  const hoofC = sil ? o.silC : far ? COL.hoofFar : COL.hoof;
  const det = o.detail;
  const sc = far ? 0.94 : 1;
  // 蹄
  g.save();
  g.translate(L.F[0], L.F[1]); g.rotate(L.a3 - Math.PI / 2); g.scale(sc, 1);
  piece(g, S.hoof, hoofC, { rim: !sil && det ? mixHex(hoofC, PAL.white, 0.5) : null, rimW: 1.4 });
  if (det && !sil) { g.fillStyle = far ? PAL.goldDark : mixHex(PAL.gold, PAL.goldDark, 0.4); g.fill(S.shoe); }
  g.restore();
  // 下段 + 球节
  g.save();
  g.translate(L.K[0], L.K[1]); g.rotate(L.a2 - Math.PI / 2); g.scale(sc, 1);
  piece(g, S.lower, coat, { lift: det && !sil ? 1.4 : 0, rim: !sil && det ? PAL.white : null, rimW: 1.8, sh: !sil && det ? [0, 20, 22, far ? 0.18 : 0.08] : null });
  piece(g, S.fetlock, coat, {});
  if (o.bandage && !sil) drawLegBandage(g, o.t, far);
  g.restore();
  // 上段
  g.save();
  g.translate(L.P[0], L.P[1]); g.rotate(L.a1 - Math.PI / 2); g.scale(sc, 1);
  const up = kind === 'h' ? S.upperH : S.upperF;
  piece(g, up, coat, { lift: det && !sil ? (far ? 0 : 2) : 0, rim: !sil && det ? PAL.white : null, rimW: 2, sh: !sil && det ? [0, 12, 34, far ? 0.2 : 0.11] : null });
  g.restore();
}

function drawLegBandage(g, t, far) {
  // 绷带：缠在下段上的几圈纸条 + 一个随风抖的结头
  g.save();
  const c = far ? mixHex(COL.bandage, PAL.horseShade, 0.5) : COL.bandage;
  for (let i = 0; i < 4; i++) {
    const y = 10 + i * 7.5;
    const p = new Path2D();
    p.moveTo(-9, y - 3); p.lineTo(9, y - 6); p.lineTo(9, y); p.lineTo(-9, y + 3); p.closePath();
    piece(g, p, c, { lift: 0.8, liftA: 0.15 });
    g.strokeStyle = rgba(PAL.stone2, 0.8); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-9, y + 3); g.lineTo(9, y); g.stroke();
  }
  const fl = Math.sin(t * 11) * 4;
  const tie = new Path2D();
  tie.moveTo(7, 14); tie.quadraticCurveTo(15, 12 + fl * 0.4, 21, 9 + fl); tie.lineTo(19, 15 + fl); tie.quadraticCurveTo(14, 17, 8, 19); tie.closePath();
  piece(g, tie, c, { lift: 0.8 });
  g.restore();
}

function drawBody(g, sk, o) {
  const S = shapes();
  g.save();
  g.translate(sk.c[0], sk.c[1]); g.rotate(sk.pb);
  if (o.sil) { g.fillStyle = o.silC; g.fill(S.body); g.restore(); return; }
  piece(g, S.body, COL.coat, { lift: o.detail ? 2.5 : 0, rim: PAL.white, rimW: 2.6, sh: o.detail ? [10, 6, 70, 0.22] : null, shC: PAL.stoneDark });
  if (o.detail) {
    // 腹下暗部 + 胸口一道轻轻的肌理线
    shade(g, S.body, PAL.horseShade, 0, 8, 0, 47, 0, 0.55);
    g.strokeStyle = rgba(PAL.horseShade, 0.9); g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(63, 8); g.quadraticCurveTo(67, 20, 59, 31); g.stroke();
  }
  if (o.snow > 0) {
    const k = o.snow;
    const p = cutShape([[-72, -28 - 3 * k], [-56, -42 - 9 * k], [-40, -46 - 8 * k], [-30, -44 - 2 * k], [-34, -40], [-50, -36], [-66, -26]], 21, 0.6);
    g.save(); g.translate(0.6, 2.2); g.fillStyle = PAL.snowShade; g.fill(p); g.restore();
    piece(g, p, COL.snow, { rim: PAL.white, sh: [-50, -40, 14, 0.25], shC: PAL.snowShade });
  }
  g.restore();
}

function drawSaddle(g, sk, o) {
  const S = shapes();
  g.save();
  g.translate(sk.c[0], sk.c[1]); g.rotate(sk.pb);
  if (o.sil) { g.fillStyle = o.silC; g.fill(S.cloth); g.fill(S.saddle); g.restore(); return; }
  // 肚带
  if (o.detail) {
    const girth = new Path2D(); girth.roundRect(10, -14, 8, 59, 3);
    piece(g, girth, COL.leatherDark, { lift: 1 });
  }
  // 鞍褥（红底金边、扇贝花边、流苏）
  piece(g, S.cloth, COL.cloth, { lift: o.detail ? 2 : 0, rim: mixHex(PAL.red, PAL.goldLight, 0.55), rimW: 2, sh: o.detail ? [0, -16, 34, 0.3] : null, shC: PAL.redDeep });
  if (o.detail) {
    g.save(); g.clip(S.cloth);
    g.fillStyle = COL.trim; g.fillRect(-44, -17, 82, 7);
    g.fillStyle = PAL.goldLight; g.fillRect(-44, -17, 82, 1.4);
    g.restore();
    g.fillStyle = COL.trim;
    for (let x = -33; x <= 27; x += 7.5) { g.beginPath(); g.arc(x, -10.8, 3, 0, Math.PI); g.fill(); }
    // 流苏
    const sw = Math.sin((o.t || 0) * 6 + 1) * 2 * (o.moving ? 1 : 0.3);
    const ts = new Path2D(); ts.moveTo(-38, -14); ts.lineTo(-35 + sw, 0); ts.lineTo(-42 + sw, 0); ts.closePath();
    piece(g, ts, PAL.gold, { lift: 1 });
    g.fillStyle = PAL.goldDark; g.beginPath(); g.arc(-38.5, -14, 2.6, 0, TAU); g.fill();
  }
  // 鞍座
  piece(g, S.saddle, COL.leather, { lift: o.detail ? 2.2 : 0, rim: COL.leatherLight, rimW: 2.2, sh: o.detail ? [0, -40, 20, 0.28] : null, shC: PAL.woodDark });
  if (o.detail) {
    g.strokeStyle = rgba(PAL.woodDark, 0.6); g.lineWidth = 1.1; g.setLineDash([2.5, 2.5]);
    g.beginPath(); g.moveTo(-22, -43); g.quadraticCurveTo(0, -41, 22, -43); g.stroke();
    g.setLineDash([]);
  }
  g.restore();
  // 马镫（按世界重力下垂，或挂到骑手脚上）
  if (o.detail && !o.noStirrup) {
    const top = xf(sk.c, sk.pb, STIRRUP_TOP);
    // 'ride'：勇者 ride 系姿势的外侧脚在鞍点下方约 (3, 31)，马镫收短托在靴底
    const bot = o.stirrupAt || (o.stirrupRide ? xf(sk.c, sk.pb, [SEAT[0] + 3, SEAT[1] + 33]) : [top[0] + Math.sin((o.t || 0) * 5) * 1.5 * (o.moving ? 1 : 0), top[1] + 50]);
    g.save();
    g.strokeStyle = COL.leatherDark; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(bot[0], bot[1] - 6); g.stroke();
    const ir = new Path2D(); ir.moveTo(bot[0] - 4, bot[1] - 8); ir.lineTo(bot[0] + 4, bot[1] - 8); ir.lineTo(bot[0] + 7, bot[1] + 2); ir.lineTo(bot[0] - 7, bot[1] + 2); ir.closePath();
    g.lineWidth = 2.6; g.strokeStyle = PAL.goldDark; g.lineJoin = 'round'; g.stroke(ir);
    g.lineWidth = 1.2; g.strokeStyle = PAL.goldLight; g.stroke(ir);
    g.restore();
  }
}

function drawNeck(g, sk, o) {
  const S = shapes();
  g.save();
  g.translate(sk.nb[0], sk.nb[1]); g.rotate(sk.pn);
  if (o.sil) { g.fillStyle = o.silC; g.fill(S.neck); g.restore(); return; }
  piece(g, S.neck, COL.coat, { lift: o.detail ? 2.4 : 0, rim: PAL.white, rimW: 2.4, sh: o.detail ? [6, -20, 46, 0.18] : null, shC: PAL.stoneDark });
  if (o.detail) {
    g.strokeStyle = rgba(PAL.horseShade, 0.85); g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(19, -32); g.quadraticCurveTo(14, -12, 21, 10); g.stroke();
  }
  g.restore();
}

function drawEar(g, sk, far, o) {
  const S = shapes();
  g.save();
  g.translate(sk.hp[0], sk.hp[1]); g.rotate(sk.ph); g.scale(HS, HS);
  const base = far ? [-5, -22] : [4, -25];
  const ang = (far ? -14 : -6) * D - (far ? o.st.earF : o.st.earN) * D;
  g.translate(base[0], base[1]); g.rotate(ang);
  if (far) g.scale(0.92, 0.95);
  if (o.sil) { g.fillStyle = o.silC; g.fill(S.ear); g.restore(); return; }
  piece(g, S.ear, far ? COL.far : COL.coat, { lift: far ? 0 : 1.4, rim: far ? null : PAL.white, rimW: 1.6 });
  if (o.detail) g.fillStyle = far ? mixHex(COL.innerEar, PAL.horseShade, 0.5) : COL.innerEar, g.fill(S.earIn);
  if (o.icicles > 0 && !far) { g.fillStyle = rgba(COL.ice, 0.8); g.beginPath(); g.ellipse(0, -28, 3.5, 2.2, 0, 0, TAU); g.fill(); }
  g.restore();
}

function drawHead(g, sk, o) {
  const S = shapes();
  const st = o.st;
  g.save();
  g.translate(sk.hp[0], sk.hp[1]); g.rotate(sk.ph); g.scale(HS, HS);
  const jawA = st.jaw * D;
  const sil = o.sil;
  // 张嘴：口腔、舌头、门牙
  if (jawA > 0.01 && !sil) {
    const jp = rot([64, 16], jawA), jh = [20, 14];
    const m = new Path2D();
    m.moveTo(jh[0], jh[1]); m.lineTo(64, 13); m.quadraticCurveTo(68, 15, jh[0] + jp[0] - 20 + 2, jh[1] + jp[1] - 14);
    m.lineTo(jh[0] + rot([30 - 20, 24 - 14], jawA)[0], jh[1] + rot([30 - 20, 24 - 14], jawA)[1]); m.closePath();
    g.fillStyle = COL.mouth; g.fill(m);
    g.save(); g.clip(m);
    g.fillStyle = COL.tongue; g.beginPath(); g.ellipse(...[20, 14].map((v, i) => v + rot([28, 8], jawA)[i]), 16, 6, jawA * 0.6, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = COL.teeth;
    g.beginPath(); g.roundRect(56, 12.5, 5.5, 5.5, 1.5); g.fill();
    g.beginPath(); g.roundRect(61.5, 12.5, 4.5, 5, 1.5); g.fill();
  }
  // 下颌
  g.save();
  g.translate(20, 14); g.rotate(jawA); g.translate(-20, -14);
  if (sil) { g.fillStyle = o.silC; g.fill(S.jaw); }
  else {
    piece(g, S.jaw, COL.coat, { lift: jawA > 0.05 ? 1.4 : 0 });
    if (o.detail) { g.save(); g.clip(S.jaw); g.fillStyle = COL.muzzle; g.fill(S.muzzle); g.restore(); }
    if (jawA > 0.08 && o.detail) { g.fillStyle = COL.teeth; g.beginPath(); g.roundRect(55, 11, 6, 4.5, 1.5); g.fill(); }
  }
  g.restore();
  // 头
  if (sil) { g.fillStyle = o.silC; g.fill(S.head); g.restore(); return; }
  piece(g, S.head, COL.coat, { lift: o.detail ? 2.2 : 0, rim: PAL.white, rimW: 2.4, sh: o.detail ? [22, 0, 52, 0.16] : null, shC: PAL.stoneDark });
  if (o.detail) {
    g.save(); g.clip(S.head);
    g.fillStyle = COL.muzzle; g.fill(S.muzzle);
    g.restore();
    // 鼻孔
    g.fillStyle = COL.nostril;
    g.beginPath(); g.ellipse(61, 0, 2.3, 3.4, -0.5, 0, TAU); g.fill();
    // 腮红
    g.fillStyle = rgba(PAL.blush, 0.45);
    g.beginPath(); g.ellipse(36 + (st.cheek ? 2 : 0), 8, 7.2 + st.cheek * 1.5, 4.6 + st.cheek * 1.2, 0, 0, TAU); g.fill();
  }
  drawFace(g, st, o);
  if (o.detail) drawBridle(g, o);
  if (o.noseBandage) drawPlaster(g, o.noseBandage === true ? 1 : o.noseBandage);
  if (st.coin > 0) drawCoin(g, st, o);
  if (o.snow > 0) {
    const k = o.snow;
    const p = cutShape([[-8, -24], [4, -32 - 6 * k], [20, -35 - 8 * k], [36, -29 - 4 * k], [34, -24], [16, -28], [0, -23]], 23, 0.5);
    g.save(); g.translate(0.5, 2); g.fillStyle = PAL.snowShade; g.fill(p); g.restore();
    piece(g, p, COL.snow, { rim: PAL.white, sh: [14, -28, 12, 0.25], shC: PAL.snowShade });
  }
  g.restore();
}

function drawFace(g, st, o) {
  const ex = 27, ey = -9;
  const ld = lightDir(g);
  // 头部坐标系已放大 HS 倍，这里按未放大的 86 计算，实际 = HEAD_W 的统一比例
  const lw = 86 * 0.025;
  const eRx = 86 * 0.045, eRy = 86 * 0.065;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = PAL.ink; g.fillStyle = PAL.ink;
  const expr = st.expr;
  const blink = o.blink;
  if (o.detail === 0) {
    g.beginPath(); g.ellipse(ex, ey, eRx * 1.1, eRy * (blink ? 0.2 : 1.05), 0, 0, TAU); g.fill();
    g.restore();
    return;
  }
  // 眼睛
  const openEye = (sc = 1, hl = 1) => {
    g.beginPath(); g.ellipse(ex, ey, eRx * sc, eRy * sc, 0, 0, TAU); g.fill();
    g.fillStyle = PAL.white;
    g.beginPath(); g.arc(ex + ld[0] * eRx * 0.42 * sc, ey + ld[1] * eRy * 0.42 * sc, 1.55 * hl * sc, 0, TAU); g.fill();
    g.fillStyle = PAL.ink;
  };
  g.lineWidth = lw * 1.15;
  if (expr === 'proud') {
    g.beginPath(); g.moveTo(ex - 5, ey - 1); g.quadraticCurveTo(ex, ey + 4.5, ex + 5.5, ey - 1.5); g.stroke();
    g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(ex - 4.5, ey + 0.5); g.lineTo(ex - 8, ey + 2.5); g.moveTo(ex - 2.5, ey + 2.2); g.lineTo(ex - 5, ey + 5.3); g.stroke();
  } else if (expr === 'happy' || expr === 'neigh') {
    g.beginPath(); g.moveTo(ex - 5, ey + 2); g.quadraticCurveTo(ex, ey - 5, ex + 5, ey + 2); g.stroke();
  } else if (expr === 'effort' || expr === 'chomp') {
    g.beginPath(); g.moveTo(ex - 5, ey - 4.5); g.lineTo(ex + 4, ey); g.lineTo(ex - 5, ey + 4.5); g.stroke();
  } else if (expr === 'hurt') {
    g.beginPath(); g.moveTo(ex - 5, ey - 3.5); g.lineTo(ex + 4, ey); g.lineTo(ex - 5, ey + 3.5); g.stroke();
  } else if (blink) {
    g.beginPath(); g.moveTo(ex - 4.5, ey + 1); g.quadraticCurveTo(ex, ey + 3.5, ex + 4.5, ey + 1); g.stroke();
  } else if (expr === 'scared') openEye(1.25, 0.8);
  else openEye(1, 1);
  // 眉毛
  g.lineWidth = lw * 0.95;
  const brow = { normal: [0, 0], proud: [-3, 0], happy: [-2, 0], scared: [2, -5], effort: [2, 4], hurt: [1, -4], neigh: [-2, 0], chomp: [1, 4] }[expr] || [0, 0];
  g.beginPath(); g.moveTo(ex - 6, ey - 12 + brow[0] - brow[1] * 0.5); g.quadraticCurveTo(ex, ey - 15 + brow[0], ex + 6, ey - 12 + brow[0] + brow[1] * 0.5); g.stroke();
  // 嘴（闭嘴时的小弧线）
  if (st.jaw < 3) {
    g.lineWidth = lw;
    if (expr === 'scared' || expr === 'hurt') {
      g.beginPath(); g.moveTo(47, 17); g.quadraticCurveTo(50, 15, 53, 17); g.quadraticCurveTo(56, 19, 59, 17); g.stroke();
    } else if (expr === 'chomp' || expr === 'effort') {
      g.beginPath(); g.moveTo(46, 15.5); g.lineTo(60, 15.5); g.stroke();
      if (expr === 'chomp') { g.fillStyle = PAL.white; g.fillRect(52, 13.4, 6, 3.4); }
    } else {
      g.beginPath(); g.moveTo(47, 15); g.quadraticCurveTo(53, 19.5, 60, 16); g.stroke();
    }
  }
  g.restore();
}

function drawBridle(g, o) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const strap = (pts, w) => {
    const path = smoothPath(pts, { closed: false });
    g.lineWidth = w + 1.1; g.strokeStyle = PAL.goldDark; g.stroke(path);
    g.lineWidth = w; g.strokeStyle = PAL.gold; g.stroke(path);
    g.save(); g.translate(-0.5, -0.7); g.lineWidth = w * 0.35; g.strokeStyle = PAL.goldLight; g.stroke(path); g.restore();
  };
  strap([[-5, -21], [3, -25], [12, -28]], 2.4);
  strap([[-9, -15], [-3, 1], [12, 10], [30, 13], [46, 14.5]], 2.5);
  strap([[42, -21], [43, -4], [46, 13]], 2.7);
  // 圆花饰 + 小红宝石、衔铁环
  g.fillStyle = PAL.goldDark; g.beginPath(); g.arc(-2.5, 1.5, 5.2, 0, TAU); g.fill();
  g.fillStyle = PAL.gold; g.beginPath(); g.arc(-3, 1, 4.4, 0, TAU); g.fill();
  g.fillStyle = PAL.red; g.beginPath(); g.arc(-3, 1, 2, 0, TAU); g.fill();
  g.fillStyle = PAL.white; g.beginPath(); g.arc(-3.7, 0.2, 0.7, 0, TAU); g.fill();
  g.lineWidth = 1.8; g.strokeStyle = PAL.goldDark; g.beginPath(); g.arc(48, 15.5, 3.6, 0, TAU); g.stroke();
  g.lineWidth = 0.9; g.strokeStyle = PAL.goldLight; g.beginPath(); g.arc(47.6, 15, 3.4, Math.PI * 1.0, Math.PI * 1.7); g.stroke();
  g.restore();
}

function drawPlaster(g, k) {
  if (k <= 0) return;
  const sc = k >= 1 ? 1 : outBack(k, 2.4);
  g.save();
  g.translate(48, -12); g.rotate(-0.55); g.scale(sc, sc);
  const p = new Path2D(); p.roundRect(-13, -5, 26, 10, 5);
  piece(g, p, COL.plaster, { lift: 1.2 });
  g.fillStyle = COL.plasterPad; g.fillRect(-4.5, -3.6, 9, 7.2);
  g.fillStyle = COL.plasterDot;
  for (const [x, y] of [[-9, -1.6], [-9, 1.6], [-6.5, 0], [6.5, 0], [9, -1.6], [9, 1.6]]) { g.beginPath(); g.arc(x, y, 0.65, 0, TAU); g.fill(); }
  g.restore();
}

function drawCoin(g, st, o) {
  g.save();
  g.translate(72, 13);
  g.rotate(-0.25);
  const r = 12.5;
  const bite = [9.5, -8.5, 5.4];
  if (st.coinBite) {
    const clipP = new Path2D();
    clipP.rect(-40, -40, 80, 80);
    clipP.moveTo(bite[0] + bite[2], bite[1]); clipP.arc(bite[0], bite[1], bite[2], 0, TAU);
    g.save();
    g.clip(clipP, 'evenodd');
  }
  g.fillStyle = PAL.coinDark; g.beginPath(); g.arc(1, 1.2, r, 0, TAU); g.fill();
  g.fillStyle = PAL.coin; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = PAL.coinDark; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, r * 0.68, 0, TAU); g.stroke();
  g.fillStyle = PAL.goldLight; g.beginPath(); g.ellipse(-4, -5, 3.2, 1.6, -0.6, 0, TAU); g.fill();
  if (st.coinBite) {
    g.restore();
    // 牙印：缺口边上两道小齿痕
    g.strokeStyle = PAL.coinDark; g.lineWidth = 1.1; g.lineCap = 'round';
    for (const a of [2.35, 3.3]) { const x = bite[0] + Math.cos(a) * (bite[2] + 1.6), y = bite[1] + Math.sin(a) * (bite[2] + 1.6); g.beginPath(); g.arc(x, y, 1.4, a - 1.2, a + 1.2); g.stroke(); }
  }
  g.restore();
}

const WIDTH = {
  lock: (u) => (1 - u) ** 0.85 * (0.85 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.4))),
  plume: (u) => (0.34 + 0.66 * smoothstep(0, 0.62, u)) * (1 - 0.88 * smoothstep(0.78, 1, u)),
};
function hairPath(pts, w0, shape = 'lock') {
  const sm = resample(pts, 14);
  // 根部往回伸一点，埋进皮肤里，不露缝
  const a = sm[0], b = sm[1];
  const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) || 1;
  sm.unshift([a[0] + (dx / d) * 4, a[1] + (dy / d) * 4]);
  const wf = WIDTH[shape] || WIDTH.lock;
  return ribbon(sm, (u) => w0 * wf(u));
}

function drawHairSet(g, locks, o, layer) {
  for (const L of locks) {
    if (L.layer !== layer) continue;
    const path = hairPath(L.pts, L.w, L.shape);
    if (o.sil) { g.fillStyle = o.silC; g.fill(path); continue; }
    const back = layer === 0;
    const col = mixHex(back ? COL.maneDark : COL.mane, COL.ice, (o.icicles || 0) * 0.3);
    piece(g, path, col, { lift: o.detail ? (back ? 0.8 : 1.6) : 0, rim: back ? mixHex(COL.maneDark, PAL.goldLight, 0.35) : mixHex(PAL.goldLight, PAL.white, 0.2), rimW: back ? 1.2 : 1.6 });
    if (!back && o.detail) {
      const hl = resample(L.pts, 8).slice(1, 7).map((p, i) => [p[0] - 1.2, p[1] - 1.2 + i * 0.1]);
      g.save(); g.lineCap = 'round'; g.strokeStyle = rgba(PAL.goldLight, 0.85); g.lineWidth = L.w * 0.22;
      g.stroke(smoothPath(hl, { closed: false })); g.restore();
    }
    if (o.icicles > 0 && o.detail) drawIcicles(g, L.pts, o.icicles, L.seed);
    if (o.snow > 0 && !back && o.detail) {
      const p = L.pts[1], q = L.pts[0];
      const cap = ell((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 3, 6 + 5 * o.snow, 3 + 2.5 * o.snow, Math.atan2(p[1] - q[1], p[0] - q[0]));
      g.save(); g.translate(0.4, 1.6); g.fillStyle = PAL.snowShade; g.fill(cap); g.restore();
      g.fillStyle = COL.snow; g.fill(cap);
    }
  }
}

function drawIcicles(g, pts, k, seed) {
  g.save();
  for (let i = 1; i < pts.length; i++) {
    if (hash2(seed, i) > 0.65) continue;
    const p = pts[i], len = (5 + 7 * hash2(seed + 3, i)) * k;
    const ic = new Path2D(); ic.moveTo(p[0] - 2.4, p[1]); ic.lineTo(p[0] + 2.4, p[1]); ic.lineTo(p[0] + 0.3, p[1] + len); ic.closePath();
    g.fillStyle = rgba(COL.ice, 0.95); g.fill(ic);
    g.fillStyle = rgba(PAL.white, 0.9); g.fillRect(p[0] - 1.2, p[1] + 0.5, 0.9, len * 0.5);
  }
  g.restore();
}

function drawSpeedLines(g, t, k, sk) {
  g.save();
  for (let i = 0; i < 7; i++) {
    const y = -50 - i * 26 + (hash2(41, i) - 0.5) * 14;
    const sp = 2.2 + hash2(43, i) * 1.6;
    const ph = fract(t * sp + hash2(47, i));
    const x0 = -100 - ph * 260 - hash2(49, i) * 40;
    const len = (80 + hash2(53, i) * 140) * (0.4 + 0.6 * Math.sin(Math.PI * ph));
    const w = 2.2 + hash2(57, i) * 2.6;
    const p = new Path2D();
    p.moveTo(x0, y - w); p.lineTo(x0 - len, y); p.lineTo(x0, y + w); p.quadraticCurveTo(x0 + w * 2, y, x0, y - w);
    g.fillStyle = rgba(i % 3 === 0 ? PAL.goldLight : PAL.white, 0.8 * k * Math.sin(Math.PI * ph));
    g.fill(p);
  }
  g.restore();
}

function drawBreath(g, sk, t, k) {
  // 每 0.5 s 一团白气，从鼻孔往前上方飘散
  const nose = xf(sk.hp, sk.ph, [66 * HS, 2 * HS]);
  g.save();
  for (let j = 0; j < 2; j++) {
    const born = Math.floor(t / 0.5) * 0.5 - j * 0.5;
    const age = t - born;
    if (age < 0 || age > 0.9) continue;
    const p = age / 0.9;
    const x = nose[0] + 26 * p + 10 * j, y = nose[1] - 6 * p - 4;
    g.globalAlpha = k * 0.8 * (1 - p) * Math.min(1, age * 10);
    const puff = new Path2D();
    for (let i = 0; i < 3; i++) { const cx = x + i * 5.5 * (0.6 + p), cy = y - (i % 2) * 3, rr_ = (4 + 7 * p) * (1 - i * 0.18); puff.moveTo(cx + rr_, cy); puff.arc(cx, cy, rr_, 0, TAU); }
    g.save(); g.translate(0.8, 1.6); g.fillStyle = rgba(PAL.snowShade, 0.8); g.fill(puff); g.restore();
    g.fillStyle = PAL.white; g.fill(puff);
  }
  g.restore();
}

function drawSweat(g, sk, k) {
  const p = xf(sk.hp, sk.ph, [8 * HS, -38 * HS]);
  g.save();
  g.translate(p[0], p[1]); g.scale(k, k);
  const d = new Path2D(); d.moveTo(0, -9); d.bezierCurveTo(5, -2, 6, 3, 0, 5.5); d.bezierCurveTo(-6, 3, -5, -2, 0, -9);
  g.fillStyle = COL.sweat; g.fill(d);
  g.fillStyle = PAL.white; g.beginPath(); g.ellipse(-1.5, 0.5, 1.2, 2, 0.3, 0, TAU); g.fill();
  g.restore();
}

function drawShiver(g, sk, k, t) {
  g.save();
  g.strokeStyle = rgba(PAL.inkSoft, 0.7 * k); g.lineWidth = 1.8; g.lineCap = 'round';
  const j = Math.sin(t * 40) * 1.5;
  for (const [x, y, s] of [[-92, -150, -1], [-98, -126, -1], [96, -96, 1], [102, -74, 1]]) {
    g.beginPath(); g.moveTo(x + j, y); g.quadraticCurveTo(x + 4 * s + j, y + 6, x + j, y + 12); g.stroke();
  }
  g.restore();
}

// ———————————————————— 主函数 ————————————————————
function buildRig(o) {
  const t = o.t ?? 0;
  const cyc = {};
  for (const k of ['gallop', 'trot', 'walk']) cyc[k] = cycleOf(o, HORSE_GAITS[k]);
  const st = stateAt(o, t, cyc);
  const sk = skeleton(st);
  return { st, sk, t, cyc };
}

/** 世界坐标换算用的根变换参数（angle = 整体转角，弧度，正 = 顺时针 / 向右下，绕脚底 (x,y)）。 */
function rootXf(o) {
  const s = o.s ?? 1, face = o.face ?? 1;
  const [sqx, sqy] = o.squash ? squashOf(o.squash) : [1, 1];
  const a = o.angle || 0;
  return { x: o.x ?? 0, y: o.y ?? 0, kx: s * face * sqx, ky: s * sqy, s, face, a, ca: Math.cos(a), sa: Math.sin(a) };
}
/** 根坐标（s=1、朝右）→ 世界坐标（含 s、face、squash、angle）。 */
const toW = (R, p) => { const u = p[0] * R.kx, v = p[1] * R.ky; return [R.x + u * R.ca - v * R.sa, R.y + u * R.sa + v * R.ca]; };

function anchorsOf(rig, o) {
  const { st, sk } = rig;
  const R = rootXf(o);
  const H = (p) => toW(R, xf(sk.hp, sk.ph, [p[0] * HS, p[1] * HS]));
  const legs = {}, contact = {};
  for (const leg of LEGS) { legs[leg] = toW(R, sk.legs[leg].B); contact[leg] = sk.legs[leg].c >= 0.99; }
  const dust = [];
  for (const leg of LEGS) {
    const L = sk.legs[leg];
    const k = st.skid ? 1 : L.c >= 0.99 ? clamp((L.push - 0.55) / 0.45) : 0;
    const pk = leg === 'fn' && st.pawDust ? st.pawDust : 0;
    if (k > 0 || pk > 0) { const w = toW(R, L.B); dust.push({ x: w[0], y: w[1], k: Math.max(k, pk), leg }); }
  }
  const tailTip = rig.tailTip ? toW(R, rig.tailTip) : toW(R, xf(sk.tr, sk.pt, [0, DOCK + 70]));
  const out = {
    saddle: toW(R, xf(sk.c, sk.pb, SEAT)),
    saddleBack: toW(R, xf(sk.c, sk.pb, SEAT_BACK)),
    saddleAngle: sk.pb * R.face + R.a, // 世界（屏幕）里的鞍面转角（含 angle）
    saddleRot: sk.pb + R.a * R.face, // 直接传给 drawHero 的 rot（drawHero 在镜像前的局部系里转）
    stirrup: toW(R, [xf(sk.c, sk.pb, STIRRUP_TOP)[0], xf(sk.c, sk.pb, STIRRUP_TOP)[1] + 50]),
    withers: toW(R, xf(sk.c, sk.pb, [28, -42])),
    head: H([24, -2]), eye: H([27, -9]), earTip: H([2, -56]),
    mouth: H([66, 15]), nose: H([64, 0]), bit: H([48, 15.5]),
    hoofFront: legs.fn, hooves: legs, contact, dust,
    tail: tailTip, tailRoot: toW(R, sk.tr),
    bob: (st.by) * R.ky,
  };
  if (st.coin > 0) out.coin = H([72, 13]);
  if (st.spitAt != null) out.spitAt = st.spitAt;
  return out;
}

/** 只求锚点不画（粒子 emit 回调、镜头预先算位置用）。参数同 drawHorse。 */
export function horseRig(o = {}) {
  return anchorsOf(buildRig(o), o);
}

/**
 * 画白马。o 见 docs/api/horse.md：x, y, s, face, t, angle, pose, phase, speed, gait, limp, expr, alpha, silhouette, keepColor, silColor,
 * squash, detail, joints, mane:{trail, vel, wind}, trail, vel, wind, bandageLeg, noseBandage, icicles, snow, breath, sweat,
 * tremble, shiver, speedLines, reins, stirrup, stirrupAt, at, paw, stamp, air, seed。返回锚点。
 */
export function drawHorse(g, o = {}) {
  const rig = buildRig(o);
  const { st, sk, t } = rig;
  const R = rootXf(o);
  const detail = o.detail ?? 1;
  const sil = !!o.silhouette;
  const keep = new Set(o.keepColor || []);
  const silC = o.silColor || PAL.ink;
  const ctx = {
    st, t, detail, icicles: o.icicles || 0, snow: o.snow || 0, moving: st.moving,
    sil, silC, noseBandage: o.noseBandage || 0,
    blink: blinkAt(t, o.seed || 0) && !['proud', 'happy', 'neigh', 'effort', 'chomp', 'hurt'].includes(st.expr),
  };
  const silFor = (name) => (sil && !keep.has(name));

  // —— 拖尾：在过去时刻重新求姿态（鬃毛、额毛、尾巴共用） ——
  const N = 5;
  const snaps = [sk];
  const rate = {};
  for (const k of ['gallop', 'trot', 'walk']) rate[k] = (o.phase != null ? (o.speed ?? HORSE_GAITS[k].speed) : (o.speed ?? HORSE_GAITS[k].speed)) / HORSE_GAITS[k].stride;
  for (let j = 1; j <= N; j++) {
    const dt = j * HAIR_DT, cyc2 = {};
    for (const k of ['gallop', 'trot', 'walk']) cyc2[k] = rig.cyc[k] - dt * rate[k];
    snaps.push(skeleton(stateAt(o, t - dt, cyc2)));
  }
  const mo = o.mane || {};
  const num = (v) => (typeof v === 'number' && v ? [v, 0] : v); // vel / wind 也接受单个数字（= 水平分量）
  const v0 = st.moving ? R.face * ((o.speed ?? (HORSE_GAITS[o.pose === 'walk' ? 'walk' : o.pose === 'trot' || o.pose === 'limp' || o.pose === 'headwind' ? (o.gait || 'trot') : 'gallop'] || HORSE_GAITS.gallop).speed)) * R.s : 0;
  const vel = num(mo.vel) || num(o.vel) || [v0 * R.ca, v0 * R.sa];
  const wind = num(mo.wind) || num(o.wind) || [0, 0];
  const trail = mo.trail || o.trail;
  const offs = [];
  for (let j = 0; j <= N; j++) {
    const dt = j * HAIR_DT;
    let wx, wy;
    if (trail && trail[j]) { wx = trail[j][0]; wy = trail[j][1]; } else { wx = -vel[0] * dt; wy = -vel[1] * dt; }
    wx += wind[0] * dt; wy += wind[1] * dt;
    // 世界偏移 → 根坐标（先反转 angle，再除缩放）
    const u = wx * R.ca + wy * R.sa, v = -wx * R.sa + wy * R.ca;
    offs.push([u / R.kx + st.wind[0] * dt, v / R.ky + st.wind[1] * dt]);
  }
  const air = Math.hypot(vel[0] - wind[0], vel[1] - wind[1]) / R.s + Math.hypot(st.wind[0], st.wind[1]);
  const flutter = clamp(air / 900) * 1.0 + 0.08;
  const hairO = (seed, stiff, grav, curl) => ({ t, seed, stiff, grav, curl, flutter });
  const locks = [];
  const maneSet = detail ? MANE : MANE0;
  maneSet.forEach((m, i) => {
    const pts = hairChain(snaps, offs, (s) => [s.nb[0] + rot([m[0], m[1]], s.pn)[0], s.nb[1] + rot([m[0], m[1]], s.pn)[1]], (s) => s.pn + m[2] * D, m[3], 4, hairO(i + 1, [0.5, 0.26, 0.1, 0.03], 0.42, 9 * D));
    locks.push({ pts, w: m[4] * (m[5] === 0 ? 1.25 : 1), layer: m[5], seed: i + 3 });
  });
  const fore = [];
  (detail ? FORELOCK : FORELOCK.slice(0, 1)).forEach((m, i) => {
    const pts = hairChain(snaps, offs, (s) => [s.hp[0] + rot([m[0], m[1]], s.ph)[0], s.hp[1] + rot([m[0], m[1]], s.ph)[1]], (s) => s.ph + m[2] * D, m[3], 3, hairO(i + 11, [0.6, 0.35, 0.15], 0.25, -5 * D));
    fore.push({ pts, w: m[4], layer: 1, seed: i + 13 });
  });
  const tails = [];
  const tStiff = st.tailStiff || 0;
  const tOffs = offs.map((q) => [q[0] * (1 - 0.6 * tStiff), q[1] * (1 - 0.6 * tStiff)]);
  (detail ? TAIL : TAIL0).forEach((m, i) => {
    const stiff = [0.45, 0.22, 0.1, 0.04, 0].map((v) => lerp(v, 0.9, tStiff));
    const pts = hairChain(snaps, tOffs, (s) => xf(s.tr, s.pt, [0, DOCK - 2]), (s) => s.pt + Math.PI / 2 + m[0] * D, m[1], 5, hairO(i + 21, stiff, 0.42 * (1 - tStiff), (7 - 3 * tStiff) * D));
    tails.push({ pts, w: m[2], layer: m[3], seed: i + 23, shape: m[4] });
  });
  const mid = tails.find((L) => L.layer === 1) || tails[0];
  rig.tailTip = mid.pts[mid.pts.length - 1];

  g.save();
  if (o.alpha != null && o.alpha !== 1) g.globalAlpha *= clamp(o.alpha);
  g.translate(R.x, R.y);
  if (R.a) g.rotate(R.a);
  g.scale(R.kx, R.ky);
  const base = { ...ctx, sil: false };
  const P = (name) => (silFor(name) ? { ...ctx, sil: true } : base);

  if (st.lines || o.speedLines) drawSpeedLines(g, t, o.speedLines ?? 1, sk);
  // 尾巴（身后）
  g.save();
  g.translate(sk.tr[0], sk.tr[1]); g.rotate(sk.pt);
  piece(g, shapes().dock, silFor('tail') ? silC : COL.coat, { rim: silFor('tail') ? null : PAL.white, rimW: 1.4 });
  g.restore();
  drawHairSet(g, tails, P('tail'), 0);
  drawHairSet(g, tails, P('tail'), 1);
  // 远侧两条腿
  drawLeg(g, sk.legs.hf, true, 'h', { ...P('legs'), bandage: legBand(o, 'hf') });
  drawLeg(g, sk.legs.ff, true, 'f', { ...P('legs'), bandage: legBand(o, 'ff') });
  // 远耳、远侧鬃毛
  drawEar(g, sk, true, P('head'));
  drawHairSet(g, locks, P('mane'), 0);
  // 身体、鞍
  drawBody(g, sk, P('body'));
  drawSaddle(g, sk, { ...P('saddle'), stirrupAt: Array.isArray(o.stirrup) ? fromW(R, o.stirrup) : o.stirrupAt ? fromW(R, o.stirrupAt) : null, stirrupRide: o.stirrup === 'ride', noStirrup: o.stirrup === false });
  // 近后腿、脖子、鬃毛、近前腿
  drawLeg(g, sk.legs.hn, false, 'h', { ...P('legs'), bandage: legBand(o, 'hn') });
  drawNeck(g, sk, P('body'));
  drawHairSet(g, locks, P('mane'), 1);
  drawLeg(g, sk.legs.fn, false, 'f', { ...P('legs'), bandage: legBand(o, 'fn') });
  // 头、近耳、额毛
  drawHead(g, sk, P('head'));
  drawEar(g, sk, false, P('head'));
  drawHairSet(g, fore, P('mane'), 1);
  // 缰绳
  if (o.reins && !sil) {
    const bit = xf(sk.hp, sk.ph, [48 * HS, 15.5 * HS]);
    const hand = Array.isArray(o.reins) ? fromW(R, o.reins) : xf(sk.c, sk.pb, [30, -78]);
    g.save();
    g.strokeStyle = COL.leatherDark; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bit[0], bit[1]);
    g.quadraticCurveTo((bit[0] + hand[0]) / 2, Math.max(bit[1], hand[1]) + 14, hand[0], hand[1]); g.stroke();
    g.restore();
  }
  // 附加：闪光、白气、冷汗、发抖线
  if (st.gleam > 0.02 && !sil) {
    const L = locks.find((q) => q.layer === 1 && q.seed === 6) || locks[0];
    const p = L.pts[2];
    sparkle(g, p[0], p[1], 15 * st.gleam, { rot: t * 2, color: PAL.white, alpha: st.gleam });
    glow(g, p[0], p[1], 34 * st.gleam, PAL.goldLight, 0.7 * st.gleam);
  }
  if (o.breath > 0 && !sil) drawBreath(g, sk, t, o.breath);
  if ((o.sweat > 0 || st.expr === 'scared' || st.expr === 'hurt') && !sil && detail) drawSweat(g, sk, o.sweat ?? 0.85);
  if ((st.shiver || o.shiver) && !sil) drawShiver(g, sk, st.shiver || o.shiver, t);
  g.restore();
  return anchorsOf(rig, o);
}

/**
 * 缰绳：从马的 bit（衔铁环）到骑手手里的一点（都是世界坐标），画在骑手之后。
 * o: { s=1, sag（下垂 px，默认 14·s）, color, lw }
 */
export function drawReins(g, bit, hand, o = {}) {
  const s = o.s ?? 1;
  g.save();
  g.strokeStyle = o.color || COL.leatherDark; g.lineWidth = (o.lw ?? 2.6) * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bit[0], bit[1]);
  g.quadraticCurveTo((bit[0] + hand[0]) / 2, Math.max(bit[1], hand[1]) + (o.sag ?? 14) * s, hand[0], hand[1]);
  g.stroke();
  g.restore();
}

function legBand(o, leg) {
  const b = o.bandageLeg;
  if (!b) return false;
  if (b === true) return leg === 'fn';
  return [].concat(b).includes(leg);
}
/** 世界坐标 → 根坐标（toW 的逆）。 */
const fromW = (R, p) => { const dx = p[0] - R.x, dy = p[1] - R.y; return [(dx * R.ca + dy * R.sa) / R.kx, (-dx * R.sa + dy * R.ca) / R.ky]; };

function blinkAt(t, seed) {
  const per = 3.3;
  const k = Math.floor(t / per);
  const at = k * per + 0.4 + hash1(k * 7.7 + seed * 1.3 + 0.21) * 2.2;
  return t >= at && t < at + 0.12;
}
