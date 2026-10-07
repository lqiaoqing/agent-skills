// 勇者 达拉崩吧 —— 剪纸关节木偶（Q 版约 2.5 头身：s = 1 时身高 260、头约 104）。
// 坐标约定：(x, y) = 脚底中心；骑乘类 pose（ride / rideSlash / rideLean / rideHunch / sneeze / rideFront / mount / dismount）的
// (x, y) = 马的 saddle 锚点（鞍顶中心），只画外侧一条腿。局部单位 = s=1 时的像素；朝右画，face=-1 整体 scaleX 镜像（名签文字不镜像）。
// 纯函数：画面只由参数（含 t）决定；内部 save/restore；不调 ctx.layer / ctx.mask。
import { PAL, rr, blob, smooth as smoothPath, glow as glowFx } from '../core/paper.js';
import { clamp, lerp, TAU, rgba, mixHex, hash2, noise1, fract, wobble } from '../core/util.js';
import { outBack } from '../core/ease.js';
import { glyphRow } from '../ui/type.js';
import { sdir, paperFill, rimLine, drawScarf, scarfPoints, ribbonOf, star4 } from '../props/scarf.js';
import { drawSword } from '../props/sword.js';

const D = Math.PI / 180;
/** s = 1 时的身高（不含呆毛）。 */
export const HERO_H = 260;
/** 站立时“臀底接触点”到脚底的高度：骑乘锚点 = 脚底 − 49·s（上马 / 下马过渡时换算用）。 */
export const HERO_SEAT = 49;
/** walk 一个周期（两步）前进的局部像素：phase = 世界 x ÷ (150·s) 时脚不打滑。 */
export const HERO_STRIDE = 150;

// ———————————————————— 骨架（局部单位，朝右，y 向下） ————————————————————
const HIP = 58, TORSO = 92, NECK = 50, HRX = 47, HRY = 45;
const UA = 29, FA = 27, TH = 25, SH = 25, ANK = 8, HAND = 8.5;
const SHO_F = [-17, -84], SHO_B = [15, -84];
const HIP_F = [-8, 0], HIP_B = [8, 0];
const KNOT = [-23, -89];
const BACK_SWORD = { at: [-47, -106], ang: 54 };

// ———————————————————— 配色（全部取自 PAL） ————————————————————
const C = {
  skin: PAL.skin, skinS: PAL.skinShade, skinL: mixHex(PAL.skin, PAL.white, 0.5), blush: PAL.blush,
  hair: PAL.heroHair, hairL: mixHex(PAL.heroHair, PAL.goldLight, 0.32),
  blue: PAL.heroBlue, blueD: PAL.heroBlueDark, blueL: mixHex(PAL.heroBlue, PAL.white, 0.3),
  tights: mixHex(PAL.heroBlueDark, PAL.ink, 0.28),
  boot: PAL.boot, bootL: mixHex(PAL.boot, PAL.leather, 0.6), sole: mixHex(PAL.boot, PAL.ink, 0.5),
  glove: PAL.leather, gloveL: mixHex(PAL.leather, PAL.white, 0.3), gloveD: mixHex(PAL.leather, PAL.boot, 0.6),
  belt: PAL.wood, strap: PAL.leather,
  band: mixHex(PAL.skin, PAL.sand, 0.6), bandL: mixHex(PAL.skin, PAL.white, 0.55),
};

// ———————————————————— 小数学 ————————————————————
const rot = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mMul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const mApply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
const mRotAbout = (a, c) => { const co = Math.cos(a), si = Math.sin(a); return [co, si, -si, co, c[0] - co * c[0] + si * c[1], c[1] - si * c[0] - co * c[1]]; };
const sstep = (f) => f * f * (3 - 2 * f);

// ———————————————————— 部件路径（预建，稳定不闪） ————————————————————
const capCache = new Map();
/** 竖直锥形胶囊：从 (0,y0) 到 (0,y1)，两端宽 w0 / w1。 */
function capY(y0, y1, w0, w1) {
  const k = `${y0}|${y1}|${w0}|${w1}`;
  let p = capCache.get(k);
  if (!p) {
    p = new Path2D();
    const r0 = w0 / 2, r1 = w1 / 2;
    p.moveTo(r0, y0); p.lineTo(r1, y1); p.arc(0, y1, r1, 0, Math.PI); p.lineTo(-r0, y0); p.arc(0, y0, r0, Math.PI, TAU); p.closePath();
    capCache.set(k, p);
  }
  return p;
}
/** 任意方向锥形胶囊。 */
function capAB(a, b, w0, w1) {
  const p = new Path2D();
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const n = [-Math.sin(ang), Math.cos(ang)];
  p.moveTo(a[0] + n[0] * w0 / 2, a[1] + n[1] * w0 / 2);
  p.lineTo(b[0] + n[0] * w1 / 2, b[1] + n[1] * w1 / 2);
  p.arc(b[0], b[1], w1 / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  p.lineTo(a[0] - n[0] * w0 / 2, a[1] - n[1] * w0 / 2);
  p.arc(a[0], a[1], w0 / 2, ang - Math.PI / 2, ang + Math.PI / 2, true);
  p.closePath();
  return p;
}
/** 带尖角的平滑轮廓：sharp 里的点会被复制一份，形成剪刀剪出的尖。 */
function spiky(pts, sharp = [], tension = 0.5) {
  const out = [];
  pts.forEach((p, i) => { out.push(p); if (sharp.includes(i)) out.push(p); });
  return smoothPath(out, { closed: true, tension });
}
const TORSO_P = smoothPath([[-12, -93], [-21, -90], [-25, -80], [-25.5, -62], [-25.5, -44], [-27, -24], [-31, -4], [-35, 10], [-33.5, 16], [-21, 19.5], [-8, 17], [4, 20.5], [16, 17.5], [28, 19.5], [36, 14], [37.5, 6], [33, -14], [29, -34], [27.5, -56], [26.5, -78], [22, -90], [12, -93]], { closed: true, tension: 0.5 });
const HEM_BAND = (() => { const p = new Path2D(); p.rect(-50, 5, 100, 30); return p; })();
const BELT = (() => { const p = new Path2D(); p.moveTo(-27, -36); p.quadraticCurveTo(4, -30, 31, -35); p.lineTo(31.6, -25); p.quadraticCurveTo(4, -19, -27.6, -26); p.closePath(); return p; })();
const BUCKLE = rr(1.5, -35, 14.5, 13, 2.6), BUCKLE_HOLE = rr(5.6, -31.4, 6.2, 5.8, 1.2);
const STRAP = ribbonOf([[-21, -92], [-4, -72], [13, -52], [25, -39]], 7.6);
const WRAP = smoothPath([[-26, -97], [-13, -103.5], [3, -105.5], [18, -102.5], [27.5, -95.5], [28.5, -86], [16, -80.5], [0, -79], [-14, -80.5], [-26.5, -86]], { closed: true, tension: 0.5 });
const KNOT_P = blob(KNOT[0], KNOT[1], 9.6, 8.8, { seed: 31, amp: 0.05 });
const BOOT_SHIN = capY(-1, SH + 3, 16.6, 14.2);
const BOOT_CUFF = rr(-10.4, -3.5, 20.8, 8.4, 3.6);
const FOOT = smoothPath([[-7.5, -5], [-8.8, 3], [-6.8, 8.7], [15, 8.7], [19.8, 6.2], [19.6, 1.6], [13, -2.8], [4, -5.8]], { closed: true, tension: 0.45 });
const SLEEVE_UA = capY(0, UA, 16, 14.6), SLEEVE_FA = capY(0, FA, 14.6, 13), THIGH = capY(0, TH + 1, 17, 15.6);
const CUFF = rr(-8.4, FA - 6.5, 16.8, 8.6, 3.2);
const H_FIST = blob(0, 8.6, 9.6, 9.2, { seed: 21, amp: 0.025 });
const H_THUMB = blob(7.2, 4.2, 3.9, 5.6, { seed: 22, amp: 0.03, rot: -0.35 });
const H_PALM = blob(0, 9.8, 8.6, 10.8, { seed: 23, amp: 0.02 });
const H_THUMB_OPEN = capAB([5, 5], [12.5, -1.5], 6.4, 5.4);
const H_FLAT = blob(0, 10.8, 7.6, 12, { seed: 24, amp: 0.02 });
const H_FINGER = capAB([-1.6, 12], [-1.6, 26], 6.2, 5.2);
const H_THUMB_UP = capAB([5.5, 3.5], [16.5, 2], 6.6, 5.8);
const H_CUP = smoothPath([[-6, -1], [2, -2], [8, 2], [10.4, 9], [8, 16], [2, 20], [-6, 19], [-7, 15], [-1, 15], [3, 12], [4, 8], [2, 5], [-2, 4], [-7, 3]], { closed: true, tension: 0.5 });

// 头发（yaw = 1 的 3/4 朝右版本；头心为原点，脸 rx 47 / ry 45）
// 后发：四个发尖（第 4 / 7 / 10 / 13 点）不再复制成剪刀尖，统一走平滑曲线（tension 0.32）→ 尖头是圆钝的，CU 下不扎眼；前刘海仍保留剪刀尖。
const HAIR_BACK = [[34, -44], [16, -55], [-4, -58], [-19, -56], [-26, -65], [-33, -55], [-47, -47], [-61, -40], [-55, -29], [-57, -16], [-68, -7], [-55, 1], [-54, 12], [-58, 21], [-44, 24], [-36, 35], [-14, 38], [12, 30], [36, 10], [46, -14]];
const HAIR_BACK_TENSION = 0.32;
const FRONT_ARC = [[-49, -1], [-52, -22], [-44, -40], [-28, -53], [-6, -58.5], [16, -56.5], [34, -47], [46, -33], [51, -16], [50, 3]];
const FRONT_FRINGE = [[45, -9], [42, 1], [35, -15], [27, -5], [20, -21], [11, -10], [3, -23], [-6, -12], [-13, -25], [-22, -15], [-30, -26], [-37, -16], [-44, -22], [-48, -4]];
const FRONT_SHARP = [9, 11, 13, 15, 17, 19, 21, 23];
// 呆毛（相对发旋根部，8 点，可互相插值）
const AHOGE = {
  normal: [[0, 0], [-2.5, -6], [-3.2, -12.5], [-1.2, -19], [3.5, -24], [9.5, -26.5], [15, -25.5], [18.5, -21.5]],
  curled: [[0, 0], [-2.5, -6], [-3.6, -12.5], [-1.6, -19], [4, -23.5], [9.2, -23], [10.6, -18.5], [7.4, -15.6]],
  question: [[0, 0], [0, -6], [1.5, -11.5], [7, -15.5], [10.4, -21.5], [7.4, -28.5], [0, -30.5], [-5.4, -26.5]],
  straight: [[0, 0], [0, -6], [0.2, -12], [0.4, -18], [0.6, -24], [0.8, -30], [1, -36], [1.2, -41]],
  candle: [[0, 0], [0, -4], [0, -8], [0, -12], [0, -16], [0, -20], [0, -24], [0, -27]],
  // 心形的右半边（只给 {from, to:'heart', k} 插值用；字符串 'heart' 仍按下面的整颗心画）
  heart: [[0, 0], [3, -8], [9.5, -15], [12.5, -22], [11.8, -25.8], [9.5, -28.5], [3, -28.5], [0, -23]],
};
const AHOGE_W = { normal: [4.2, 1.2], curled: [4.2, 1.4], question: [3.9, 1.6], straight: [4, 1.3], candle: [4.4, 3.4], heart: [3.2, 2.2] };

// ———————————————————— 姿态 ————————————————————
/**
 * 关节表（度）：lean 躯干前倾（+ 前）；nod 头相对躯干（+ 低头）；yaw 头的朝向 −1..1（1 = 3/4 朝前，0 = 正对镜头，−1 = 回头）；
 * aF / aB = 近侧 / 远侧手臂 [肩, 肘, 腕]：肩 0 = 下垂，+ = 向前抬（90 水平向前、180 举过头顶）；肘 + = 小臂向前弯；
 * lF / lB = 近侧 / 远侧腿 [髋, 膝, 脚]：髋 + = 大腿向前；膝 + = 小腿向后弯；脚（绝对角）+ = 脚尖上翘；
 * hF / hB 手形（fist / open / flat / point / thumb / cup）；hFa / hBa 手的绝对角（度，null = 跟随小臂）；
 * x / y 整体偏移；lift 落地后再抬高（负 = 向上）；sw 手中剑的刃方向（局部画布角度，度：0 向前、−90 向上）；
 * ground 1 = 自动把最低的脚踩到 y=0；seat 1 = 骑乘锚点；oneLeg 只画外侧腿；rr 整体转角（度，绕 piv）。
 */
const BASE = {
  x: 0, y: 0, lift: 0, lean: 0, nod: 0, yaw: 1, neck: 0, chest: 0, sq: 0,
  aF: [-8, 16, 0], aB: [9, 14, 0], lF: [3, 2, 0], lB: [-3, 2, 0],
  hF: 'fist', hB: 'fist', hFa: null, hBa: null, ikF: null, ikB: null,
  sw: null, swMode: null, swLayer: 'hand',
  ground: 1, seat: 0, oneLeg: 0, legsOnly: 0, breathe: 1, farFront: 0, farHand: 0,
  rr: 0, piv: [0, -70], ball: 0, v: 0, ab: 0, arc: 0, arcFrom: null, puppet: 0, expr: null, earSide: 0,
};
function mixJ(A, B, k) {
  if (k <= 0) return A;
  if (k >= 1) return B;
  const out = {};
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = key in A ? A[key] : BASE[key], b = key in B ? B[key] : BASE[key];
    if (typeof a === 'number' && typeof b === 'number') out[key] = a + (b - a) * k;
    else if (Array.isArray(a) && Array.isArray(b)) out[key] = a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? v + (b[i] - v) * k : k < 0.5 ? v : b[i]));
    else out[key] = k < 0.5 ? a : b;
  }
  return out;
}
/** 动作关键帧：keys = [[act, 关节], ...]，段内 smoothstep。 */
function keyed(k, keys) {
  k = clamp(k);
  let i = 0;
  while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const [k0, A] = keys[i], [k1, B] = keys[i + 1];
  return mixJ(A, B, sstep(clamp((k - k0) / (k1 - k0 || 1))));
}
const cyc = (c, period) => TAU * (c.phase ?? c.t / period);
function rideBase(c, amt = 1) {
  const a = cyc(c, 0.42);
  return {
    seat: 1, oneLeg: 1, ground: 0, y: 2.4 * amt * Math.sin(a - 0.4), lean: 7 + 3 * amt * Math.sin(a - 0.7), nod: -3 - 3 * amt * Math.sin(a - 1.2),
    lF: [64, 96, 4 + 5 * amt * Math.sin(a)], aF: [42 + 4 * amt * Math.sin(a - 0.5), 52, 0], aB: [48 + 4 * amt * Math.sin(a - 0.5), 50, 0],
    v: 600, ab: 12 * amt * Math.sin(a - 1.6), expr: 'determined',
  };
}
function runJ(c) {
  const a = cyc(c, 0.5), s = Math.sin(a), co = Math.cos(a);
  const leg = (ss, cc) => [42 * ss + 4, 22 + 88 * Math.pow(Math.max(0, cc), 1.2), 20 * ss];
  return {
    lean: 14, nod: -5 + 3 * Math.cos(2 * a), lF: leg(s, co), lB: leg(-s, -co),
    aF: [-40 * s + 8, 88, 0], aB: [40 * s + 8, 88, 0], lift: -8 * s * s, v: 430, ab: 16 * Math.sin(2 * a - 1.2), expr: 'determined',
  };
}
const AKIMBO_B = [45, -68, 0];
const POSES = {
  // —— 站与走
  idle: (c) => { const b = Math.sin((TAU * c.t) / 3.4); return { aF: [-8 + 1.5 * b, 16, 0], aB: [9 - 1.5 * b, 14, 0], nod: 1.2 * b, expr: 'normal' }; },
  walk: (c) => {
    const a = cyc(c, 0.8), s = Math.sin(a), s2 = -s;
    const leg = (ss, cc) => [24 * ss, 5 + 46 * Math.pow(Math.max(0, cc), 1.6), 14 * ss];
    return { lean: 4, nod: -1.5 + 2 * Math.cos(2 * a), lF: leg(s, Math.cos(a)), lB: leg(s2, -Math.cos(a)), aF: [-24 * s - 4, 18 + 10 * Math.max(0, -s), 0], aB: [24 * s + 6, 18 + 10 * Math.max(0, s), 0], v: 140, ab: 7 * Math.sin(2 * a - 1), expr: 'normal' };
  },
  run: runJ,
  kneeSlide: () => ({ lean: -10, nod: -5, lF: [-2, 92, -38], lB: [78, 84, 0], aF: [-58, 26, 0], aB: [72, 28, 0], hF: 'open', hB: 'open', v: 380, ab: -18, expr: 'determined' }),
  brake: () => ({ lean: -16, nod: -10, lF: [36, 2, 24], lB: [-22, 44, -10], aF: [-122, 34, 0], aB: [136, 30, 0], hF: 'open', hB: 'open', v: 240, ab: 22, expr: 'shock' }),
  // —— 表演
  heroPose: () => ({ lean: -4, nod: -7, aF: [40, 149, 0], aB: AKIMBO_B, lF: [-9, 2, 0], lB: [13, 2, 0], sw: -160, swMode: 'shoulder', swLayer: 'mid', expr: 'smug' }),
  scratchHead: (c) => ({ lean: 2, nod: 9, ikF: [-34, -24], hF: 'open', hFa: 150 + 14 * Math.sin(TAU * c.t * 3.2), aB: [10, 14, 0], expr: 'shy' }),
  think: () => ({ lean: 2, nod: 10, yaw: 0.85, ikF: [12, 50], hF: 'point', hFa: 180, aB: [24, 80, 0], lF: [-4, 2, 0], lB: [6, 2, 0], expr: 'think' }),
  inhale: () => ({ lean: -9, nod: -12, chest: 1, aF: [-34, 18, 0], aB: [-16, 18, 0], lF: [-4, 0, 0], lB: [6, 0, 0], ab: -10, expr: 'normal' }),
  shout: (c) => ({ x: 0.7 * Math.sin(c.t * 61), lean: 9, nod: -8, aF: [-40, 28, 0], aB: [-22, 30, 0], lF: [-14, 6, 0], lB: [18, 8, 0], ab: -20, expr: 'shout' }),
  proud: () => ({ lean: -6, nod: -11, aF: [-44, 70, 0], aB: AKIMBO_B, lF: [-8, 0, 0], lB: [10, 0, 0], expr: 'smug' }),
  thumbsUp: (c) => ({ lean: -3, nod: -5, aF: [12, 140, 0], aB: [16, 143, 0], hF: 'thumb', hB: 'thumb', hFa: -90, hBa: -90, lF: [-8, 0, 0], lB: [10, 0, 0], lift: -3 * Math.abs(Math.sin(TAU * c.t * 1.6)), expr: 'grin' }),
  cupEar: () => ({ lean: 12, nod: -24, yaw: -0.32, aF: [-24, 22, 0], ikB: 'ear', hB: 'cup', hBa: 180, farHand: 1, earSide: 1, lF: [-10, 4, 0], lB: [14, 10, 0], expr: 'squint' }),
  fingerUp: () => ({ lean: -4, nod: -8, aF: [14, 153, 0], hF: 'point', hFa: 180, aB: AKIMBO_B, lF: [-6, 0, 0], lB: [8, 0, 0], expr: 'smug' }),
  present: () => ({ lean: -6, nod: -8, aF: [-64, 12, 0], hF: 'open', aB: [118, 8, 0], hB: 'flat', lF: [-9, 0, 0], lB: [14, 0, 0], expr: 'grin' }),
  bow: () => ({ x: -8, lean: 40, nod: 26, aF: [-12, 100, 0], aB: [-96, 14, 0], hB: 'open', lF: [10, 8, 0], lB: [12, 10, 0], ab: 30, expr: 'relieved' }),
  shieldFace: () => ({ lean: -12, nod: 14, aF: [129, 85, 0], aB: [140, 50, 0], lF: [-12, 22, 0], lB: [12, 26, 0], expr: 'hurt' }),
  sigh: () => ({ lean: 7, nod: 14, neck: 3, aF: [-3, 5, 0], aB: [4, 5, 0], lF: [2, 4, 0], lB: [-2, 4, 0], breathe: 0.4, ab: 14, expr: 'relieved' }),
  gulp: () => ({ lean: -3, nod: 5, neck: 5, aF: [28, 118, 0], aB: [34, 114, 0], lF: [-2, 4, 0], lB: [3, 4, 0], expr: 'worried' }),
  turnHead: () => ({ lean: -2, nod: 4, yaw: -0.65, neck: 3, aF: [-4, 3, 0], aB: [4, 3, 0], lF: [0, 0, 0], lB: [0, 0, 0], breathe: 0.2, expr: 'worried' }),
  freeze: (c) => ({ x: 0.6 * Math.sin(c.t * 70), lean: -3, nod: -4, neck: 4, aF: [-3, 0, 0], aB: [3, 0, 0], hF: 'open', hB: 'open', lF: [0, 0, 0], lB: [0, 0, 0], breathe: 0, ab: -6, expr: 'shock' }),
  // —— 骑乘（锚点 = 鞍顶）
  ride: (c) => rideBase(c),
  rideSlash: (c) => {
    const k = c.act;
    const J = keyed(k, [[0, { lean: -6, aF: [-150, 40, 0], sw: -150 }], [0.3, { lean: 16, aF: [80, 5, 0], sw: 10 }], [0.55, { lean: 20, aF: [35, -5, 0], sw: 55 }], [1, { lean: 8, aF: [42, 52, 0], sw: 60 }]]);
    return { ...rideBase(c, 0.6), ...J, swMode: 'hand', arcFrom: -150, arc: clamp((k - 0.08) / 0.12) * (1 - clamp((k - 0.5) / 0.2)), expr: k < 0.7 ? 'shout' : 'determined' };
  },
  rideLean: (c) => ({ ...rideBase(c, 0.5), lean: 36, nod: 12, aF: [8, 4, 0], sw: 50, swMode: 'hand', aB: [24, 60, 0], expr: 'grin' }),
  rideHunch: (c) => ({ ...rideBase(c, 0.6), lean: 24, nod: 16, neck: 5, aF: [36, 88, 0], aB: [40, 86, 0], ab: -30, expr: 'hurt' }),
  sneeze: (c) => {
    const k = c.act;
    const J = keyed(k, [[0, { lean: 4, nod: 0 }], [0.5, { lean: -14, nod: -24 }], [0.62, { lean: 24, nod: 20 }], [1, { lean: 7, nod: 2 }]]);
    return { ...rideBase(c, 0.4), ...J, aF: [40, 55, 0], aB: [46, 52, 0], expr: k < 0.55 ? 'sneeze' : k < 0.78 ? 'shout' : 'relieved' };
  },
  mount: () => ({ seat: 1, ground: 0, lean: 12, nod: -6, lF: [72, 30, 10], lB: [-60, 40, -10], aF: [150, 15, 0], aB: [158, 10, 0], hF: 'open', hB: 'open', ab: -24, expr: 'grin' }),
  dismount: (c) => ({ seat: 1, ground: 0, oneLeg: c.act < 0.25 ? 1 : 0, ...keyed(c.act, [[0, { lean: -8, lF: [64, 90, 0], lB: [80, 40, 0], aF: [40, 50, 0], aB: [120, 20, 0] }], [0.5, { lean: 4, lF: [10, 30, -10], lB: [-6, 34, -10], aF: [100, 10, 0], aB: [130, 10, 0] }], [1, { lean: 10, lF: [16, 40, 0], lB: [-8, 44, 0], aF: [40, 30, 0], aB: [60, 30, 0] }]]), expr: 'normal' }),
  rideFront: (c) => ({ ...rideBase(c), lean: 15, nod: -8, aF: [52, 40, 0], aB: [58, 38, 0], expr: 'grin' }),
  // —— 战斗
  gripHilt: () => ({ lean: 8, nod: 6, ikF: 'hilt', aB: [20, 30, 0], lF: [-10, 16, 0], lB: [14, 20, 0], swMode: 'back', expr: 'determined' }),
  draw: (c) => {
    const k = c.act;
    const J = keyed(k, [[0, { lean: 8, aF: [196, 60, 0], sw: 150 }], [0.25, { lean: 4, aF: [210, 34, 0], sw: 170 }], [0.55, { lean: 0, aF: [196, 8, 0], sw: 262 }], [1, { lean: 4, aF: [136, -4, 0], sw: 322 }]]);
    return { ...J, lF: [-14, 10, 0], lB: [20, 24, 0], aB: [24, 40, 0], swMode: k < 0.06 ? 'back' : 'hand', ikF: k < 0.06 ? 'hilt' : null, swLayer: k < 0.35 ? 'back' : 'hand',
      arcFrom: 180, arc: clamp((k - 0.3) / 0.15) * (1 - 0.7 * clamp((k - 0.8) / 0.2)), ab: -18 * Math.sin(Math.PI * k), expr: 'determined' };
  },
  stance: (c) => ({ lean: 8, nod: 3, aF: [74, 18, 0], sw: -12, swMode: 'hand', aB: [24, 74, 0], lF: [-22, 8, 0], lB: [26, 34, 0], lift: 0.8 * Math.sin((TAU * c.t) / 1.6) - 0.8, expr: 'determined' }),
  roll: (c) => ({ ground: 0, ball: 1, lean: 64, nod: 52, neck: 26, sq: -0.42, aF: [72, 100, 0], aB: [66, 104, 0], lF: [128, 150, 20], lB: [120, 156, 20], rr: 360 * c.act, v: 300, ab: -30, expr: 'hurt' }),
  plantSword: () => ({ lean: 10, nod: 4, aF: [62, 74, 0], ikB: 'grip', farFront: 1, sw: -90, swMode: 'hand', lF: [-24, 4, 0], lB: [26, 34, 0], expr: 'determined' }),
  vault: (c) => ({ ground: 0, piv: [0, -110], ...keyed(c.act, [[0, { lean: 30, aF: [60, 10, 0], aB: [64, 10, 0], lF: [20, 70, 0], lB: [10, 80, 0], rr: 0 }], [0.5, { lean: 10, aF: [170, 0, 0], aB: [172, 0, 0], lF: [-10, 20, 0], lB: [-20, 30, 0], rr: 150 }], [1, { lean: 20, aF: [90, 20, 0], aB: [100, 20, 0], lF: [30, 50, 0], lB: [20, 60, 0], rr: 360 }]]), expr: 'shout' }),
  hop: (c) => ({ ...keyed(c.act, [
    [0, { lean: 16, nod: 8, lF: [24, 58, 0], lB: [4, 64, 0], aF: [-48, 24, 0], aB: [-36, 24, 0], ground: 1 }],
    [0.22, { lean: 2, nod: -6, lF: [-2, 2, -30], lB: [-8, 4, -30], aF: [150, 10, 0], aB: [148, 14, 0], ground: 0 }],
    [0.5, { lean: 4, nod: -2, lF: [52, 86, 0], lB: [38, 92, 0], aF: [110, 30, 0], aB: [104, 34, 0], ground: 0 }],
    [0.8, { lean: 6, lF: [16, 12, 10], lB: [8, 16, 10], aF: [70, 20, 0], aB: [74, 24, 0], ground: 0 }],
    [1, { lean: 14, nod: 6, lF: [22, 50, 0], lB: [2, 56, 0], aF: [36, 28, 0], aB: [44, 28, 0], ground: 1 }],
  ]), ab: -20 * Math.sin(TAU * c.act), expr: 'grin' }),
  thrust: (c) => ({ ...keyed(c.act, [
    [0, { lean: -6, aF: [-24, 100, 0], sw: 2, lF: [-12, 12, 0], lB: [22, 22, 0] }],
    [0.35, { lean: 22, aF: [86, 2, 0], sw: 0, lF: [-36, 4, 0], lB: [46, 58, 0] }],
    [0.6, { lean: 20, aF: [84, 4, 0], sw: 0, lF: [-34, 4, 0], lB: [44, 56, 0] }],
    [1, { lean: 8, aF: [74, 18, 0], sw: -12, lF: [-22, 8, 0], lB: [26, 34, 0] }],
  ]), swMode: 'hand', aB: [-30, 40, 0], expr: 'shout' }),
  slash: (c) => ({ ...keyed(c.act, [
    [0, { lean: -10, nod: -6, aF: [168, 34, 0], sw: -158 }],
    [0.38, { lean: 18, nod: 6, aF: [76, 0, 0], sw: 18 }],
    [0.62, { lean: 22, nod: 8, aF: [22, 0, 0], sw: 72 }],
    [1, { lean: 8, nod: 3, aF: [74, 18, 0], sw: -12 }],
  ]), swMode: 'hand', swLayer: c.act < 0.12 ? 'back' : 'hand', aB: [-20, 40, 0], lF: [-26, 6, 0], lB: [30, 40, 0], arcFrom: -158, arc: clamp((c.act - 0.12) / 0.12) * (1 - clamp((c.act - 0.6) / 0.25)), expr: 'shout' }),
  hangSwing: () => ({ ground: 0, nod: -8, aF: [176, 6, 0], aB: [179, 4, 0], lF: [12, 22, 0], lB: [-4, 26, 0], expr: 'grin' }),
  kick: () => ({ ground: 0, lean: -22, nod: -6, lF: [96, 2, 20], lB: [36, 104, 0], aF: [-62, 34, 0], aB: [-36, 42, 0], expr: 'shout' }),
  charge: (c) => ({ ...runJ(c), lean: 20, aF: [72, 12, 0], sw: -6, swMode: 'hand', v: 520, expr: 'shout' }),
  // —— 躲闪（b10 D2a 左躲右闪：低头 duck → 跳起用 hop → 后仰下腰 limbo → 侧身 sidestep → 转身用 turn；b11 低头躲翼也用 duck）
  duck: () => ({ lean: 26, nod: 24, lF: [62, 104, 0], lB: [40, 110, 0], aF: [150, 74, 0], aB: [142, 80, 0], hF: 'open', hB: 'open', ab: 26, expr: 'shock' }),
  limbo: () => ({ lean: -38, nod: -16, lF: [58, 100, 0], lB: [30, 88, 0], aF: [-70, 24, 0], aB: [-52, 28, 0], hF: 'open', hB: 'open', ab: -30, expr: 'shock' }),
  sidestep: () => ({ lean: -4, nod: 8, yaw: 0.06, sq: 0.1, aF: [-5, 2, 0], aB: [5, 2, 0], hF: 'flat', hB: 'flat', lF: [-2, 0, -28], lB: [4, 0, -28], breathe: 0, ab: -18, expr: 'worried' }),
  // —— 剧场纸偶（配 rod:true；平面版 + 贴纸边 + 铜钉关节）
  puppetStand: () => ({ puppet: 1, aF: [14, 30, 0], sw: 70, swMode: 'hand', aB: [10, 14, 0], lF: [-4, 0, 0], lB: [6, 0, 0], expr: 'determined' }),
  puppetLunge: () => ({ puppet: 1, lean: 18, aF: [82, 4, 0], sw: -8, swMode: 'hand', aB: [-30, 30, 0], lF: [-30, 4, 0], lB: [34, 40, 0], expr: 'shout' }),
  puppetSlash: (c) => ({ puppet: 1, ...keyed(c.act, [[0, { lean: -8, aF: [165, 30, 0], sw: -150 }], [0.5, { lean: 16, aF: [70, 0, 0], sw: 20 }], [1, { lean: 18, aF: [26, 0, 0], sw: 70 }]]), swMode: 'hand', aB: [-20, 40, 0], lF: [-26, 6, 0], lB: [30, 40, 0], expr: 'shout' }),
  puppetInMouth: (c) => { const k = Math.sin(TAU * c.t * 4), k2 = Math.sin(TAU * c.t * 4 + 1.9); return { puppet: 1, legsOnly: 1, ground: 0, lF: [26 + 34 * k, 40 - 30 * k, 20 * k], lB: [-14 + 34 * k2, 44 - 30 * k2, 20 * k2] }; },
  puppetKneel: () => ({ puppet: 1, lean: 14, nod: 16, lF: [-2, 92, -38], lB: [74, 82, 0], aF: [40, 30, 0], sw: 85, swMode: 'hand', aB: [60, 40, 0], expr: 'hurt' }),
  puppetRise: () => ({ puppet: 1, lean: -4, nod: -10, aF: [40, 112, 0], hF: 'fist', aB: [16, 20, 0], lF: [-8, 2, 0], lB: [10, 2, 0], swMode: 'empty', expr: 'determined' }),
  puppetHoldSword: () => ({ puppet: 1, lean: 4, nod: -6, aF: [124, 4, 0], hF: 'fist', aB: [100, 30, 0], lF: [-18, 4, 0], lB: [22, 20, 0], swMode: 'empty', expr: 'determined' }),
  // —— 尾声
  swingMiss: (c) => ({ ...keyed(c.act, [
    [0, { lean: -10, aF: [166, 32, 0], sw: -150, aB: [20, 20, 0], lF: [-10, 6, 0], lB: [16, 10, 0] }],
    [0.3, { lean: 20, aF: [70, 0, 0], sw: 30, aB: [40, 20, 0], lF: [-20, 6, 0], lB: [30, 30, 0] }],
    [0.55, { lean: 38, nod: 14, aF: [40, -6, 0], sw: 80, aB: [130, 20, 0], lF: [-48, 62, 0], lB: [36, 40, 0] }],
    [1, { lean: 26, nod: 6, aF: [96, 20, 0], sw: 30, aB: [150, 30, 0], lF: [-30, 40, 0], lB: [24, 30, 0] }],
  ]), swMode: 'hand', arcFrom: -150, arc: clamp((c.act - 0.08) / 0.1) * (1 - clamp((c.act - 0.35) / 0.2)), expr: c.act < 0.4 ? 'shout' : 'shock' }),
  holdHands: () => ({ nod: 4, aF: [-6, 12, 0], aB: [34, 6, 0], hB: 'open', lF: [-2, 0, 0], lB: [4, 0, 0], expr: 'shy' }),
  dance: (c) => {
    const a = cyc(c, 0.9), s = Math.sin(a), up = Math.max(0, s), dn = Math.max(0, -s);
    return { lean: 5 * s, nod: -4 * s, lF: [44 * up - 6 * dn, 76 * up, 10 * up], lB: [-6 * up + 44 * dn, 76 * dn, 10 * dn], aF: [150 + 16 * s, 34, 0], aB: [140 - 16 * s, 34, 0], hF: 'open', hB: 'open', lift: -6 * Math.abs(Math.cos(a)), ab: 14 * s, expr: 'laugh' };
  },
  leanOver: () => ({ x: -10, lean: 34, nod: 18, aF: [-30, 10, 0], aB: [-24, 12, 0], hF: 'open', hB: 'open', lF: [16, 20, 0], lB: [20, 24, 0], ab: 20, expr: 'grin' }),
  unrollScroll: () => ({ lean: 12, nod: 2, aF: [70, -8, 0], hF: 'open', aB: [150, 34, 0], lF: [-18, 4, 0], lB: [24, 22, 0], expr: 'smug' }),
  tieScarf: () => ({ lean: 16, nod: 18, aF: [76, 32, 0], aB: [84, 28, 0], farFront: 1, lF: [22, 52, 0], lB: [-12, 60, 0], expr: 'grin' }),
  deflate: () => ({ lean: 10, nod: 18, neck: 6, aF: [-2, 2, 0], aB: [3, 2, 0], hF: 'open', hB: 'open', lF: [3, 12, 0], lB: [-3, 12, 0], sq: -0.1, breathe: 0, ab: 26, expr: 'relieved' }),
  cheer: (c) => { const b = Math.abs(Math.sin(TAU * c.t * 1.6)); return { lean: -6, nod: -10, aF: [166, 14, 0], aB: [160, 20, 0], lF: [-10 - 4 * b, 4, 0], lB: [12 + 4 * b, 4, 0], lift: -7 * b, ab: -16 * b, expr: 'laugh' }; },
};
/** 动作类 pose 的默认 act（不传 o.act 时用的代表帧）。 */
const DEFAULT_ACT = { rideSlash: 0.3, sneeze: 0.6, dismount: 0.5, draw: 1, roll: 0.25, vault: 0.5, hop: 0.5, thrust: 0.4, slash: 0.38, puppetSlash: 0.5, swingMiss: 0.55 };
/** 全部动作名。 */
export const HERO_POSES = Object.keys(POSES);
function poseOf(p, c) {
  if (p && typeof p === 'object') return mixJ(poseOf(p.from, c), poseOf(p.to, c), clamp(p.k ?? 0));
  const fn = POSES[p] || POSES.idle;
  return { ...BASE, ...fn({ ...c, act: clamp(c.act ?? DEFAULT_ACT[p] ?? 0.5) }) };
}

// ———————————————————— 表情 ————————————————————
const EXPR = {
  normal: { eyes: 'open', brows: 'neutral', mouth: 'smile' },
  grin: { eyes: 'happy', brows: 'up', mouth: 'grin' },
  smug: { eyes: 'half', brows: 'smug', mouth: 'smirk' },
  determined: { eyes: 'open', brows: 'angry', mouth: 'flat' },
  shout: { eyes: 'tight', brows: 'angry', mouth: 'shout' },
  shock: { eyes: 'shock', brows: 'high', mouth: 'o' },
  think: { eyes: 'look', brows: 'think', mouth: 'hmm' },
  squint: { eyes: 'squint', brows: 'squint', mouth: 'side' },
  wink: { eyes: 'wink', brows: 'up', mouth: 'grin' },
  hurt: { eyes: 'tight', brows: 'worried', mouth: 'grit' },
  dizzy: { eyes: 'spiral', brows: 'worried', mouth: 'wavy' },
  worried: { eyes: 'open', brows: 'worried', mouth: 'wavy', sweat: 0.8 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh' },
  shy: { eyes: 'happy', brows: 'worried', mouth: 'small', blush: 0.7 },
  relieved: { eyes: 'closed', brows: 'relaxed', mouth: 'sigh' },
  sneeze: { eyes: 'tight', brows: 'worried', mouth: 'o' },
};
/** 全部表情名（sneeze 为内部用的喷嚏前憋气脸，也可直接用）。 */
export const HERO_EXPRS = Object.keys(EXPR);

// ———————————————————— 骨架求解 ————————————————————
function legFK(P, hj, L) {
  const hp = [P[0] + hj[0], P[1] + hj[1]];
  const ta = -L[0] * D;
  const K = add(hp, rot([0, TH], ta));
  const sa = ta + L[1] * D;
  const A = add(K, rot([0, SH], sa));
  const fa = -(L[2] || 0) * D;
  return { hp, ta, K, sa, A, fa, heel: add(A, rot([-7.5, ANK], fa)), toe: add(A, rot([18.5, ANK], fa)) };
}
function armFK(S, tA, a, habs) {
  const ua = tA - a[0] * D;
  const E = add(S, rot([0, UA], ua));
  const fa = ua - a[1] * D;
  const W = add(E, rot([0, FA], fa));
  const ha = habs != null ? habs * D : fa - (a[2] || 0) * D;
  return { S, ua, E, fa, W, ha, C: add(W, rot([0, HAND], ha)) };
}
/** 两段 IK：返回 [肩, 肘]（度，相对躯干）。bend ±1 决定肘往哪边弯。 */
function ik2(S, W, tA, bend) {
  const dx = W[0] - S[0], dy = W[1] - S[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(UA - FA) + 0.5, UA + FA - 0.5);
  const base = Math.atan2(dx, dy);
  const A = Math.acos(clamp((UA * UA + d * d - FA * FA) / (2 * UA * d), -1, 1));
  const a1 = base + bend * A;
  const E = [S[0] + UA * Math.sin(a1), S[1] + UA * Math.cos(a1)];
  const a2 = Math.atan2(W[0] - E[0], W[1] - E[1]);
  return [(a1 + tA) / D, (a2 - a1) / D];
}
function solve(J, o, t) {
  const inf = clamp(o.inflate ?? 0);
  const br = (J.breathe ?? 1) * Math.sin((TAU * t) / 3.4);
  const tsx = (1 + 0.22 * inf + 0.04 * J.chest) / Math.sqrt(Math.max(0.2, 1 + J.sq));
  const tsy = (1 + 0.06 * inf + 0.012 * br) * (1 + J.sq);
  const seat = J.seat >= 0.5;
  let P = [J.x, (seat ? -9 : -HIP) + J.y];
  let legs = { F: legFK(P, HIP_F, J.lF), B: legFK(P, HIP_B, J.lB) };
  if (J.ground >= 0.5 && !seat) {
    let low = -Infinity;
    for (const k of J.oneLeg >= 0.5 ? ['F'] : ['F', 'B']) { const L = legs[k]; low = Math.max(low, L.heel[1], L.toe[1], L.K[1] + 7.5); }
    P = [P[0], P[1] - low];
  }
  P = [P[0], P[1] + (J.lift || 0)];
  legs = { F: legFK(P, HIP_F, J.lF), B: legFK(P, HIP_B, J.lB) };
  const tA = J.lean * D;
  const T = (u, v) => add(P, rot([u * tsx, v * tsy], tA));
  const N = T(0, -TORSO);
  const hA = tA + J.nod * D;
  const H = add(N, rot([0, -NECK + J.neck], hA));
  const arms = { F: armFK(T(...SHO_F), tA, J.aF, J.hFa), B: armFK(T(...SHO_B), tA, J.aB, J.hBa) };
  return { P, T, tA, N, H, hA, legs, arms, tsx, tsy };
}

// ———————————————————— 画家 ————————————————————
function makeF(g, R) {
  return (path, fill, part, op = {}) => {
    if (R.edge) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = R.edge.color; g.lineWidth = R.edge.w; g.stroke(path); g.restore(); return; }
    if (R.sil && !R.keep.has(part)) { g.fillStyle = R.sil; g.fill(path); return; }
    if (!R.detail) { g.fillStyle = fill; g.fill(path); return; }
    if (R.flat) { paperFill(g, path, fill, { lift: op.lift === 0 ? 0 : 1.2, liftA: 0.18, rim: op.rim, rimW: 1.4, rimA: 0.6, under: op.under, underW: 1.4, underA: 0.25 }); return; }
    paperFill(g, path, fill, {
      lift: op.lift ?? R.lift, liftA: op.liftA ?? 0.2, cx: op.c ? op.c[0] : 0, cy: op.c ? op.c[1] : 0, r: op.r ?? 0, shadeA: op.shade ?? 0.18,
      shadeCol: op.shadeCol ?? PAL.ink, hi: op.hi ?? 0, rim: op.rim, rimW: op.rimW ?? 1.7, rimA: op.rimA ?? 0.7, under: op.under, underW: op.underW ?? 1.5, underA: op.underA ?? 0.3,
    });
  };
}
const dark = (c, far) => (far ? mixHex(c, PAL.ink, 0.2) : c);

function paintLeg(g, F, full, L, far, knee) {
  const tights = dark(C.tights, far), boot = dark(C.boot, far), bootL = dark(C.bootL, far);
  g.save(); g.translate(L.hp[0], L.hp[1]); g.rotate(L.ta);
  F(THIGH, tights, 'body', { c: [0, TH / 2], r: 18, under: mixHex(tights, PAL.ink, 0.35) });
  g.restore();
  g.save(); g.translate(L.K[0], L.K[1]); g.rotate(L.sa);
  F(BOOT_SHIN, boot, 'body', { c: [0, SH / 2], r: 20, rim: far ? null : bootL, under: C.sole });
  F(BOOT_CUFF, bootL, 'body', { rim: far ? null : mixHex(bootL, PAL.white, 0.3), under: boot, lift: 1.2 });
  if (knee) bandaid(g, F, full, 0, 3, 0.35, 19, 7);
  g.restore();
  g.save(); g.translate(L.A[0], L.A[1]); g.rotate(L.fa);
  F(FOOT, boot, 'body', { c: [6, 2], r: 16, rim: far ? null : bootL, under: C.sole });
  if (full('body')) { g.save(); g.clip(FOOT); g.fillStyle = C.sole; g.fillRect(-12, 6, 36, 6); g.restore(); }
  g.restore();
}
function paintHand(g, F, full, kind, far) {
  const col = dark(C.glove, far);
  const op = { rim: far ? null : C.gloveL, rimW: 1.4, under: C.gloveD, c: [0, 9], r: 12, lift: 1.4 };
  switch (kind) {
    case 'open': F(H_PALM, col, 'glove', op); F(H_THUMB_OPEN, col, 'glove', op); break;
    case 'flat': F(H_FLAT, col, 'glove', op); F(H_THUMB, col, 'glove', { ...op, lift: 0.8 }); break;
    case 'point': F(H_FINGER, col, 'glove', op); F(H_FIST, col, 'glove', op); F(H_THUMB, col, 'glove', { ...op, lift: 0.8 }); break;
    case 'thumb': F(H_FIST, col, 'glove', op); F(H_THUMB_UP, col, 'glove', op); break;
    case 'cup': F(H_CUP, col, 'glove', op); break;
    default: F(H_FIST, col, 'glove', op); F(H_THUMB, col, 'glove', { ...op, lift: 0.8 });
  }
  if (full('glove') && (kind === 'open' || kind === 'flat')) {
    g.save(); g.strokeStyle = rgba(C.gloveD, 0.8); g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-2.6, 15.5); g.lineTo(-2.6, 20); g.moveTo(2.2, 16); g.lineTo(2.2, 20.5); g.stroke(); g.restore();
  }
}
function bandaid(g, F, full, cx, cy, ang, len = 20, w = 7) {
  g.save(); g.translate(cx, cy); g.rotate(ang);
  F(rr(-len / 2, -w / 2, len, w, w / 2), C.band, 'skin', { rim: C.bandL, rimW: 1, under: C.skinS, underW: 1, lift: 1 });
  if (full('skin')) {
    g.fillStyle = mixHex(C.band, PAL.white, 0.45); g.fill(rr(-len * 0.17, -w * 0.34, len * 0.34, w * 0.68, 1.4));
    g.fillStyle = rgba(C.skinS, 0.8);
    for (const sx of [-1, 1]) for (const k of [0.3, 0.4]) { g.beginPath(); g.arc(sx * len * k, 0, 0.7, 0, TAU); g.fill(); }
  }
  g.restore();
}
function paintArm(g, F, full, A, far, kind, opt = {}) {
  const sleeve = dark(C.blue, far), rim = far ? null : C.blueL;
  g.save(); g.translate(A.S[0], A.S[1]); g.rotate(A.ua);
  F(SLEEVE_UA, sleeve, 'body', { c: [0, UA / 2], r: 18, rim, under: C.blueD });
  g.restore();
  g.save(); g.translate(A.E[0], A.E[1]); g.rotate(A.fa);
  if (opt.torn) {
    F(capY(0, FA, 13.2, 12), C.skin, 'skin', { under: C.skinS, rim: C.skinL, rimW: 1.2 });
    const tp = new Path2D();
    tp.moveTo(-7.3, 0); tp.lineTo(7.3, 0); tp.lineTo(7.1, 12); tp.lineTo(4, 15.5); tp.lineTo(1.5, 11.5); tp.lineTo(-1.5, 16); tp.lineTo(-4.4, 12); tp.lineTo(-7.1, 14.5); tp.closePath();
    F(capY(0, 6, 14.6, 14.6), sleeve, 'body', { lift: 0 });
    F(tp, sleeve, 'body', { rim, under: C.blueD });
  } else F(SLEEVE_FA, sleeve, 'body', { c: [0, FA / 2], r: 16, rim, under: C.blueD });
  F(CUFF, dark(C.glove, far), 'glove', { rim: far ? null : C.gloveL, rimW: 1.2, under: C.gloveD, lift: 1.2 });
  if (opt.bandage) bandaid(g, F, full, 0, FA * 0.42, Math.PI / 2 + 0.25, 17, 6.5);
  g.restore();
}
function paintHandAt(g, F, full, A, far, kind) {
  g.save(); g.translate(A.W[0], A.W[1]); g.rotate(A.ha);
  paintHand(g, F, full, kind, far);
  g.restore();
}
function paintTorso(g, F, full, soot, torn) {
  F(TORSO_P, C.blue, 'body', { c: [0, -40], r: 75, shade: 0.24, rim: C.blueL, rimW: 2, under: C.blueD, underW: 1.8, lift: 2.2 });
  if (full('body')) {
    g.save();
    g.clip(TORSO_P);
    g.fillStyle = C.blueD; g.fill(HEM_BAND);
    g.strokeStyle = rgba(PAL.gold, 0.85); g.lineWidth = 1.3; g.setLineDash([3.6, 3]);
    g.beginPath(); g.moveTo(-40, 8.6); g.lineTo(40, 8.6); g.stroke(); g.setLineDash([]);
    g.strokeStyle = rgba(C.blueD, 0.85); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(8, -90); g.quadraticCurveTo(10.5, -62, 10.5, -36); g.stroke();
    if (soot > 0) {
      g.fillStyle = rgba(PAL.ink, 0.35 * soot);
      for (const [cx, cy, r] of [[-12, -64, 9], [14, -50, 7], [-4, 4, 10], [20, -76, 5]]) { g.beginPath(); g.ellipse(cx, cy, r, r * 0.7, 0.4, 0, TAU); g.fill(); }
    }
    if (torn) {
      const tp = new Path2D();
      tp.moveTo(-24, 22); tp.lineTo(-21, 9); tp.lineTo(-17, 15); tp.lineTo(-13, 6); tp.lineTo(-9, 22); tp.closePath();
      g.fillStyle = C.tights; g.fill(tp);
    }
    g.restore();
  }
  F(STRAP, C.strap, 'body', { rim: mixHex(C.strap, PAL.white, 0.3), rimW: 1.2, under: C.boot, lift: 1.4 });
  F(BELT, C.belt, 'body', { rim: mixHex(C.belt, PAL.white, 0.25), rimW: 1.2, under: PAL.woodDark, lift: 1.4 });
  F(BUCKLE, PAL.gold, 'body', { rim: PAL.goldLight, rimW: 1.2, under: PAL.goldDark, lift: 1.2 });
  if (full('body')) {
    g.fillStyle = C.belt; g.fill(BUCKLE_HOLE);
    g.strokeStyle = PAL.goldDark; g.lineWidth = 1.4; g.beginPath(); g.moveTo(8.7, -31); g.lineTo(13, -28.5); g.stroke();
  }
}
function scarfCols(sc) {
  const fz = clamp(sc.frozen ?? 0);
  const base = fz > 0 ? mixHex(PAL.scarf, PAL.ice, 0.16 * fz) : PAL.scarf;
  return { base, light: mixHex(base, PAL.white, fz > 0 ? 0.7 : 0.38), dark: PAL.scarfDark, glow: clamp(sc.glow ?? 0) };
}
function paintWrap(g, F, full, sc) {
  const k = scarfCols(sc);
  F(WRAP, k.base, 'scarf', { c: [0, -92], r: 30, shade: 0.2, rim: k.light, rimW: 1.6, under: k.dark, underW: 1.5, lift: 1.8 });
  if (full('scarf')) {
    g.save(); g.clip(WRAP);
    g.strokeStyle = rgba(k.dark, 0.7); g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-9, -101); g.quadraticCurveTo(-13, -92, -11, -81); g.moveTo(9, -102.5); g.quadraticCurveTo(5, -92, 7, -80); g.stroke();
    g.restore();
  }
  F(KNOT_P, k.base, 'scarf', { c: KNOT, r: 12, shade: 0.25, rim: k.light, rimW: 1.4, under: k.dark, lift: 1.5 });
  if (full('scarf')) {
    g.strokeStyle = rgba(k.dark, 0.75); g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(KNOT[0] - 5, KNOT[1] - 4); g.quadraticCurveTo(KNOT[0], KNOT[1] + 1, KNOT[0] + 4, KNOT[1] + 5); g.stroke();
  }
  if (k.glow > 0 && full('scarf')) {
    g.save(); g.globalAlpha *= k.glow; g.lineJoin = 'round';
    g.strokeStyle = PAL.gold; g.lineWidth = 3.2; g.stroke(WRAP); g.stroke(KNOT_P);
    g.strokeStyle = PAL.goldLight; g.lineWidth = 1.3; g.stroke(WRAP); g.stroke(KNOT_P);
    g.restore();
  }
}

// ———————————————————— 头 ————————————————————
function headGeom(yaw) {
  const ya = clamp(yaw, -1, 1) * 32 * D;
  const fx = (lam) => 0.75 * HRX * Math.sin(lam * D + ya);
  const fs = (lam) => 0.62 + 0.38 * Math.cos(lam * D + ya);
  return {
    ya, eyeN: [fx(-34), 7], eyeF: [fx(34), 7], sN: fs(-34), sF: fs(34),
    mouth: [fx(0) + 0.5, 25.5], nose: [fx(0) + 2, 16], ear: (side) => { const a = side * 100 * D + ya; return { x: 0.98 * HRX * Math.sin(a), vis: Math.cos(a) }; },
  };
}
function facePath(ys, inf) {
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    let x = Math.cos(a) * HRX, y = Math.sin(a) * HRY;
    if (y > 0) { const k = y / HRY; x += 4.5 * ys * k * k; x *= 1 + 0.14 * inf * k; }
    pts.push([x, y]);
  }
  return smoothPath(pts, { closed: true, tension: 0.5 });
}
function hairPaths(ys) {
  const mir = ys < 0 ? -1 : 1, ay = Math.abs(ys);
  const back = spiky(HAIR_BACK.map(([x, y]) => [mir * x * (0.5 + 0.5 * ay) - 4 * ys, y]), [], HAIR_BACK_TENSION);
  const shift = 9 * (ay - 1);
  const arc = FRONT_ARC.map(([x, y]) => [mir * x * (0.86 + 0.14 * ay), y]);
  const fr = FRONT_FRINGE.map(([x, y]) => [mir * (x + shift * (1 - Math.abs(x) / 70)), y]);
  const front = spiky([...arc, ...fr], FRONT_SHARP, 0.5);
  const hl = smoothPath([[-38, -41], [-25, -51.5], [-5, -55.5], [9, -54], [-6, -50], [-24, -45.5]].map(([x, y]) => [mir * x, y]), { closed: true, tension: 0.5 });
  return { back, front, hl, mir };
}
function ahogePts(shape, curl) {
  if (shape && typeof shape === 'object') {
    const A = ahogePts(shape.from, curl), B = ahogePts(shape.to, curl), k = clamp(shape.k ?? 0);
    return A.map((p, i) => [lerp(p[0], B[i][0], k), lerp(p[1], B[i][1], k)]);
  }
  if (shape === 'normal' || !AHOGE[shape]) return AHOGE.normal.map((p, i) => [lerp(p[0], AHOGE.curled[i][0], curl), lerp(p[1], AHOGE.curled[i][1], curl)]);
  return AHOGE[shape];
}
function eyeDraw(g, kind, x, y, sc, side, ink, white, blinkK, t) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = ink; g.fillStyle = ink;
  const arcLine = (y0, y1, w = 5.2) => { g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - w * sc, y + y0); g.quadraticCurveTo(x, y + y1, x + w * sc, y + y0); g.stroke(); };
  let k = kind;
  if (blinkK > 0.5 && (k === 'open' || k === 'look' || k === 'half' || k === 'shock' || k === 'white')) k = 'closed';
  switch (k) {
    case 'open': case 'look': {
      const dx = k === 'look' ? 2.2 * sc : 0, dy = k === 'look' ? -3 : 0, es = k === 'look' ? 0.9 : 1;
      if (k === 'look') { g.fillStyle = white; g.beginPath(); g.ellipse(x, y, 5.6 * sc, 7.4, 0, 0, TAU); g.fill(); g.lineWidth = 1.2; g.stroke(); g.fillStyle = ink; }
      g.beginPath(); g.ellipse(x + dx, y + dy, 4.3 * sc * es, 6.3 * es * (1 - 0.6 * blinkK), 0, 0, TAU); g.fill();
      g.fillStyle = white; g.beginPath(); g.arc(x + dx - 1.4 * sc, y + dy - 2.5, 1.75, 0, TAU); g.fill();
      break;
    }
    case 'white': {
      g.fillStyle = white; g.beginPath(); g.ellipse(x, y, 5.4 * sc, 7, 0, 0, TAU); g.fill();
      g.fillStyle = ink; g.beginPath(); g.arc(x + 0.6 * sc, y + 0.6, 2.5, 0, TAU); g.fill();
      break;
    }
    case 'happy': arcLine(2.4, -6); break;
    case 'closed': arcLine(-0.5, 4.2); break;
    case 'tight': {
      g.lineWidth = 2.6; g.beginPath();
      const d = -side;
      g.moveTo(x - d * 5 * sc, y - 4.6); g.lineTo(x + d * 3.6 * sc, y); g.lineTo(x - d * 5 * sc, y + 4.6); g.stroke();
      break;
    }
    case 'half': {
      g.save(); g.beginPath(); g.rect(x - 8, y - 1.6, 16, 12); g.clip();
      g.beginPath(); g.ellipse(x, y + 0.6, 4.3 * sc, 6, 0, 0, TAU); g.fill();
      g.fillStyle = white; g.beginPath(); g.arc(x - 1.3 * sc, y + 1.2, 1.5, 0, TAU); g.fill();
      g.restore();
      g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - 5.6 * sc, y - 1.2); g.lineTo(x + 5.6 * sc, y - 2.2); g.stroke();
      break;
    }
    case 'squintLine': g.lineWidth = 2.6; g.beginPath(); g.moveTo(x - 5.4 * sc, y + 1.4); g.quadraticCurveTo(x, y - 1.2, x + 5.4 * sc, y + 0.4); g.stroke(); break;
    case 'shock': {
      g.fillStyle = white; g.beginPath(); g.ellipse(x, y, 6.4 * sc, 8.2, 0, 0, TAU); g.fill();
      g.lineWidth = 1.6; g.stroke();
      g.fillStyle = ink; g.beginPath(); g.arc(x, y + 0.5, 2.4, 0, TAU); g.fill();
      break;
    }
    case 'spiral': {
      g.lineWidth = 1.7; g.beginPath();
      for (let i = 0; i <= 40; i++) { const a = (i / 40) * 3.3 * Math.PI, r = (i / 40) * 6.6; const X = x + Math.cos(a + t * 7 * side) * r * sc, Y = y + Math.sin(a + t * 7 * side) * r; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
      g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
}
function browDraw(g, kind, x, y, sc, side, ink) {
  const inner = side < 0 ? 1 : -1;
  let a = 0, lift = 0, arch = 1.3;
  switch (kind) {
    case 'up': lift = -3; break;
    case 'angry': a = 3.2; lift = 1.4; arch = 0.6; break;
    case 'worried': a = -3; lift = -1; arch = 0.8; break;
    case 'high': lift = -6.5; arch = 2.4; break;
    case 'smug': if (side > 0) { lift = -4; a = -1; } else { a = 1; } break;
    case 'think': lift = side > 0 ? -5 : -1; a = side > 0 ? -1 : 0.5; break;
    case 'squint': if (side < 0) { a = 2.2; lift = 2.2; } else { lift = -3.4; } break;
    case 'relaxed': lift = 1; arch = 0.6; break;
    default: break;
  }
  const L = 5.6 * sc;
  g.save();
  g.strokeStyle = ink; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - inner * L, y + lift - a);
  g.quadraticCurveTo(x, y + lift - arch * 1.6, x + inner * L, y + lift + a);
  g.stroke();
  g.restore();
}
function heartPath(cx, cy, s) {
  const p = new Path2D();
  p.moveTo(cx, cy + s * 0.9);
  p.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.35);
  p.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.9);
  p.closePath();
  return p;
}
function mouthDraw(g, kind, x, y, sc, ink, line) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = line; g.lineWidth = 2.4;
  const open = (path, teeth, tongue) => {
    g.fillStyle = PAL.redDeep; g.fill(path);
    g.save(); g.clip(path);
    if (teeth) { g.fillStyle = PAL.white; g.fillRect(x - 14, teeth[0], 28, teeth[1]); }
    if (tongue) { g.fillStyle = PAL.heart; g.fill(heartPath(tongue[0], tongue[1], tongue[2])); }
    g.restore();
  };
  switch (kind) {
    case 'smile': g.beginPath(); g.moveTo(x - 6.5 * sc, y - 1.5); g.quadraticCurveTo(x, y + 3.8, x + 6.5 * sc, y - 1.5); g.stroke(); break;
    case 'small': g.beginPath(); g.moveTo(x - 4 * sc, y - 0.6); g.quadraticCurveTo(x, y + 2.6, x + 4 * sc, y - 0.6); g.stroke(); break;
    case 'grin': {
      const p = new Path2D(); p.moveTo(x - 9 * sc, y - 3.4); p.quadraticCurveTo(x, y - 1.4, x + 9 * sc, y - 3.4); p.quadraticCurveTo(x + 7 * sc, y + 9, x, y + 9.4); p.quadraticCurveTo(x - 7 * sc, y + 9, x - 9 * sc, y - 3.4); p.closePath();
      open(p, [y - 4, 3.6], [x + 1, y + 7.6, 4.2]); break;
    }
    case 'laugh': {
      const p = new Path2D(); p.moveTo(x - 11 * sc, y - 4); p.quadraticCurveTo(x, y - 2, x + 11 * sc, y - 4); p.quadraticCurveTo(x + 9 * sc, y + 13, x, y + 13.4); p.quadraticCurveTo(x - 9 * sc, y + 13, x - 11 * sc, y - 4); p.closePath();
      open(p, [y - 4.5, 3.8], [x + 1, y + 10.5, 5.4]); break;
    }
    case 'shout': {
      const p = new Path2D(); p.ellipse(x, y + 5, 10.5 * sc, 13.5, 0, 0, TAU);
      open(p, [y - 9, 4.4], [x + 1, y + 13.5, 6]); break;
    }
    case 'o': { const p = new Path2D(); p.ellipse(x, y + 3, 4.3 * sc, 5.4, 0, 0, TAU); open(p); break; }
    case 'sigh': { const p = new Path2D(); p.ellipse(x, y + 2, 3.2 * sc, 3.7, 0, 0, TAU); open(p); break; }
    case 'puff': { const p = new Path2D(); p.ellipse(x + 1, y + 1.5, 2.6 * sc, 2.9, 0, 0, TAU); open(p); break; }
    case 'flat': g.beginPath(); g.moveTo(x - 6 * sc, y + 0.6); g.lineTo(x + 6 * sc, y - 0.4); g.stroke(); break;
    case 'smirk': g.beginPath(); g.moveTo(x - 6 * sc, y + 0.6); g.quadraticCurveTo(x + 1 * sc, y + 3, x + 7 * sc, y - 3.4); g.stroke(); break;
    case 'hmm': g.beginPath(); g.moveTo(x - 2 * sc, y + 1.4); g.quadraticCurveTo(x + 2 * sc, y - 1.2, x + 6 * sc, y + 0.6); g.stroke(); break;
    case 'side': g.beginPath(); g.moveTo(x - 3 * sc, y + 1.2); g.lineTo(x + 5.5 * sc, y - 1.2); g.stroke(); break;
    case 'wavy': g.beginPath(); for (let i = 0; i <= 10; i++) { const u = i / 10; const X = x + (u - 0.5) * 14 * sc, Y = y + 1.7 * Math.sin(u * 2 * TAU); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); } g.stroke(); break;
    case 'grit': {
      const p = rr(x - 8 * sc, y - 2, 16 * sc, 8, 3);
      g.fillStyle = PAL.white; g.fill(p); g.lineWidth = 1.5; g.strokeStyle = ink; g.stroke(p);
      g.beginPath(); g.moveTo(x - 7.4 * sc, y + 2); g.lineTo(x + 7.4 * sc, y + 2); g.moveTo(x - 2.6 * sc, y - 2); g.lineTo(x - 2.6 * sc, y + 6); g.moveTo(x + 2.6 * sc, y - 2); g.lineTo(x + 2.6 * sc, y + 6); g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
}
/** 在头坐标系里画整颗头（头心为原点）。h 见 drawHero 内部。返回 { ahogeTip, earX, gm }。 */
function paintHead(g, F, full, h) {
  const ys = clamp(h.yaw, -1, 1);
  const gm = headGeom(ys);
  const soot = clamp(h.soot ?? 0), inf = clamp(h.inflate ?? 0);
  const skin = soot > 0 ? mixHex(C.skin, PAL.ink, 0.8 * soot) : C.skin;
  const hairC = soot > 0 ? mixHex(C.hair, PAL.ink, 0.45 * soot) : C.hair;
  const hairDk = mixHex(hairC, PAL.ink, 0.38);
  const HP = hairPaths(ys);
  const mir = HP.mir;
  // 后发
  F(HP.back, hairC, 'hair', { c: [0, -20], r: 64, shade: 0.26, rim: C.hairL, rimW: 1.8, under: hairDk, lift: 2 });
  // 脸
  const faceP = facePath(ys, inf);
  F(faceP, skin, 'skin', { c: [0, 2], r: 62, shade: 0.24, shadeCol: soot ? PAL.ink : C.skinS, rim: soot ? null : C.skinL, rimW: 2, under: soot ? null : C.skinS, lift: 1.6 });
  // 耳朵（贴在脸的侧缘上，压住一点脸边）
  let earX = gm.ear(-1).x;
  for (const side of [-1, 1]) {
    const e = gm.ear(side);
    if (e.vis < -0.02) continue;
    const big = h.earSide === side || (h.earSide === 0 && side === -1) ? h.earScale ?? 1 : 1;
    if (big !== 1 || side === h.earSide) earX = e.x;
    const ex = e.x + Math.sign(e.x || 1) * (1.5 + 3 * (big - 1));
    g.save(); g.translate(ex, 6); g.scale(big * Math.sign(e.x || 1), big);
    const ep = blob(0, 0, 8.4, 11.2, { seed: 41, amp: 0.03 });
    F(ep, skin, 'skin', { rim: soot ? null : C.skinL, rimW: 1.3, under: C.skinS, lift: 1.2 });
    if (full('skin')) { g.strokeStyle = rgba(soot ? PAL.ink : C.skinS, 0.95); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(1.2, 0.5, 4.4, -1.9, 1.7); g.stroke(); }
    g.restore();
  }
  const ink = soot >= 0.4 ? PAL.paper : PAL.ink;
  const ex = EXPR[h.expr] || EXPR.normal;
  if (full('skin')) {
    // 刘海在额头上的影
    g.save(); g.clip(faceP);
    const [dx, dy] = sdir(g, 0.2, 1);
    g.translate(dx * 4.5, dy * 4.5);
    g.fillStyle = rgba(soot ? PAL.ink : C.skinS, soot ? 0.3 : 0.6);
    g.fill(HP.front);
    g.restore();
    // 腮红
    const bl = clamp(0.45 + (h.blush ?? 0) * 0.45 + (ex.blush ?? 0) * 0.3);
    if (soot < 0.5 && h.detail) {
      g.save(); g.clip(faceP);
      g.fillStyle = rgba(C.blush, bl * (1 - soot));
      const by = 20 + 2 * inf;
      g.beginPath(); g.ellipse(gm.eyeN[0] - 5 * gm.sN, by, 8.6 * gm.sN * (1 + 0.3 * inf), 5.2, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(gm.eyeF[0] + 4 * gm.sF, by, 8.6 * gm.sF * (1 + 0.3 * inf), 5.2, 0, 0, TAU); g.fill();
      if ((h.blush ?? 0) + (ex.blush ?? 0) > 0.45) {
        g.strokeStyle = rgba(mixHex(C.blush, PAL.red, 0.5), 0.8); g.lineWidth = 1.2; g.lineCap = 'round';
        for (const [cx, s0] of [[gm.eyeN[0] - 5 * gm.sN, gm.sN], [gm.eyeF[0] + 4 * gm.sF, gm.sF]]) for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + i * 3.4 * s0 - 1.2, by + 2); g.lineTo(cx + i * 3.4 * s0 + 1.2, by - 2); g.stroke(); }
      }
      g.restore();
    }
    // 鼻
    if (h.detail && soot < 0.5) { g.fillStyle = C.skinS; g.beginPath(); g.ellipse(gm.nose[0], gm.nose[1], 2.2, 1.7, 0, 0, TAU); g.fill(); }
    // 眼
    const blinkK = h.blink ?? 0;
    const sootEyes = soot >= 0.4;
    let kN = ex.eyes, kF = ex.eyes;
    if (ex.eyes === 'wink') { kN = 'open'; kF = 'happy'; }
    if (ex.eyes === 'squint') { kN = 'squintLine'; kF = 'open'; }
    if (sootEyes) { if (kN === 'open' || kN === 'look' || kN === 'half') kN = 'white'; if (kF === 'open' || kF === 'look' || kF === 'half') kF = 'white'; }
    if (inf > 0.5 && (kN === 'open')) { kN = 'closed'; kF = 'closed'; }
    if (h.detail) {
      eyeDraw(g, kN, gm.eyeN[0], gm.eyeN[1], gm.sN, -1, ink, PAL.white, blinkK, h.t);
      eyeDraw(g, kF, gm.eyeF[0], gm.eyeF[1], gm.sF, 1, ink, PAL.white, blinkK, h.t);
    } else {
      g.fillStyle = ink;
      for (const [p, s0] of [[gm.eyeN, gm.sN], [gm.eyeF, gm.sF]]) { g.beginPath(); g.ellipse(p[0], p[1], 4.3 * s0, 6.3, 0, 0, TAU); g.fill(); }
    }
    // 嘴
    const mk = inf > 0.3 && !['shout', 'laugh', 'grin', 'o'].includes(ex.mouth) ? 'puff' : ex.mouth;
    mouthDraw(g, mk, gm.mouth[0], gm.mouth[1], 0.62 + 0.38 * Math.cos(gm.ya), ink, ink);
  }
  // 前发
  F(HP.front, hairC, 'hair', { c: [0, -30], r: 52, shade: 0.2, rim: C.hairL, rimW: 1.8, under: hairDk, lift: 1.8 });
  if (full('hair') && h.detail) { g.fillStyle = rgba(C.hairL, 0.85); g.fill(HP.hl); }
  // 焦了一撮：后脑一小片焦黑 + 几根卷曲的焦发 + 一缕烟
  if (h.injury.singed && full('hair')) {
    const sx = -mir * 30, sy = -52;
    g.save();
    g.clip(HP.back);
    g.fillStyle = rgba(PAL.ink, 0.55);
    g.beginPath(); g.ellipse(sx, sy + 2, 13, 9, -0.5 * mir, 0, TAU); g.fill();
    g.restore();
    g.save();
    g.strokeStyle = mixHex(hairC, PAL.ink, 0.7); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const bx = sx + (i - 1) * 6 * mir, by = sy - 4 + Math.abs(i - 1) * 2;
      g.beginPath(); g.moveTo(bx, by);
      for (let k = 1; k <= 4; k++) g.lineTo(bx + mir * (k % 2 ? 3 : -2) + (i - 1) * k * 1.2, by - k * 3.4);
      g.stroke();
    }
    g.fillStyle = PAL.stone2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(sx + (i - 1) * 6 * mir + (i - 1) * 4.8, sy - 17 + Math.abs(i - 1) * 2, 1.6, 0, TAU); g.fill(); }
    g.restore();
    for (let i = 0; i < 2; i++) {
      const ph = fract(h.t * 0.7 + i * 0.5);
      g.save(); g.globalAlpha *= 0.32 * Math.sin(Math.PI * ph);
      g.strokeStyle = PAL.inkSoft; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.arc(sx + Math.sin(ph * 6 + i) * 3, sy - 22 - ph * 22, 3 + ph * 3, 0, Math.PI * 1.4); g.stroke();
      g.restore();
    }
  }
  // 眉（盖在刘海上）
  if (full('skin') && h.detail) {
    browDraw(g, ex.brows, gm.eyeN[0], gm.eyeN[1] - 13.5, gm.sN, -1, soot >= 0.4 ? PAL.paper : PAL.ink);
    browDraw(g, ex.brows, gm.eyeF[0], gm.eyeF[1] - 13.5, gm.sF, 1, soot >= 0.4 ? PAL.paper : PAL.ink);
  }
  // 包 + 十字贴
  if (h.injury.bump || (h.injury.bandages ?? 0) >= 2) {
    const bx = mir * 18, by = -56;
    if (h.injury.bump) F(blob(bx, by - 2, 9, 8, { seed: 51, amp: 0.04 }), mixHex(skin, C.blush, 0.35), 'skin', { rim: C.skinL, under: C.skinS, lift: 1.2 });
    if ((h.injury.bandages ?? 0) >= 2) { bandaid(g, F, full, bx, by - 2, 0, 15, 6); bandaid(g, F, full, bx, by - 2, Math.PI / 2, 15, 6); }
  }
  // 呆毛
  const shape = h.ahoge ?? 'normal';
  const base = [mir * 4 + 3 * ys, -56.5];
  const ang = (h.ahogeAng ?? 0) * D;
  const tf = (p) => { const q = rot([p[0] * (shape === 'question' && h.mirrorQ ? -1 : 1), p[1]], ang); return [base[0] + q[0], base[1] + q[1]]; };
  let tip;
  const hairInk = soot > 0.5 ? mixHex(hairC, PAL.ink, 0.3) : hairC;
  if (shape === 'heart') {
    const L = [[0, 0], [-3, -8], [-9.5, -15], [-12.5, -22], [-9.5, -28.5], [-3, -28.5], [0, -23]];
    for (const sgn of [-1, 1]) F(ribbonOf(L.map(([px, py]) => tf([px * sgn, py])), 3.4, 2.2), hairInk, 'hair', { rim: C.hairL, rimW: 1, lift: 1.2 });
    tip = tf([0, -26]);
  } else {
    const pts = ahogePts(shape, clamp(h.curl ?? 0)).map(tf);
    const key = typeof shape === 'string' ? shape : shape.to;
    const [w0, w1] = AHOGE_W[key] || AHOGE_W.normal;
    F(ribbonOf(pts, w0, w1), hairInk, 'hair', { rim: C.hairL, rimW: 1, under: hairDk, underW: 1, lift: 1.4 });
    tip = pts[pts.length - 1];
    // {from, to:'heart', k}：上面那根弯成心的右半边，左半边从发根长出来（k=1 时就是整颗心）
    const hk = typeof shape === 'object' ? (shape.to === 'heart' ? clamp(shape.k ?? 0) : shape.from === 'heart' ? 1 - clamp(shape.k ?? 0) : 0) : 0;
    if (hk > 0.01) F(ribbonOf(AHOGE.heart.map(([px, py]) => tf([-px * hk, py * hk])), w0, w1), hairInk, 'hair', { rim: C.hairL, rimW: 1, lift: 1.2 });
    if (key === 'candle' && full('hair')) {
      g.fillStyle = PAL.ink; g.beginPath(); g.arc(tip[0], tip[1], 2, 0, TAU); g.fill();
    }
  }
  const fl = clamp(h.flame ?? 0);
  if (fl > 0 && full('hair')) {
    const fx0 = tip[0] + noise1(h.t * 6, 3) * 1.6, fy0 = tip[1] - 2;
    const fh = (16 + 3 * noise1(h.t * 9, 7)) * fl, fw = 7 * fl;
    const flame = (w, hh, dy) => { const p = new Path2D(); p.moveTo(fx0, fy0 - hh + dy); p.bezierCurveTo(fx0 + w * 0.9, fy0 - hh * 0.45 + dy, fx0 + w, fy0 + dy, fx0, fy0 + w * 0.6 + dy); p.bezierCurveTo(fx0 - w, fy0 + dy, fx0 - w * 0.9, fy0 - hh * 0.45 + dy, fx0, fy0 - hh + dy); p.closePath(); return p; };
    glowFx(g, fx0, fy0 - fh * 0.4, fh * 1.6, PAL.fire2, 0.65 * fl);
    g.fillStyle = PAL.fireDeep; g.fill(flame(fw, fh, 0));
    g.fillStyle = PAL.fire; g.fill(flame(fw * 0.72, fh * 0.8, 0.5));
    g.fillStyle = PAL.fire2; g.fill(flame(fw * 0.42, fh * 0.52, 1));
  }
  // 脸上的 X 形创可贴
  if ((h.injury.bandages ?? 0) >= 1) {
    const cx = gm.eyeN[0] - 5 * gm.sN, cy = 24;
    bandaid(g, F, full, cx, cy, 0.7, 19, 6.6);
    bandaid(g, F, full, cx, cy, -0.7, 19, 6.6);
  }
  // 汗
  const sweat = clamp(Math.max(h.sweat ?? 0, ex.sweat ?? 0));
  if (sweat > 0 && full('skin')) {
    const sx = mir * 46, sy = -14 + 8 * sweat, sz = 4 + 3 * sweat;
    const dp = new Path2D(); dp.moveTo(sx, sy - sz * 1.6); dp.quadraticCurveTo(sx + sz, sy, sx, sy + sz); dp.quadraticCurveTo(sx - sz, sy, sx, sy - sz * 1.6); dp.closePath();
    paperFill(g, dp, mixHex(PAL.ice, PAL.water, 0.3), { lift: 1, rim: PAL.white, rimW: 1, under: PAL.water, underW: 1 });
    g.fillStyle = PAL.white; g.beginPath(); g.arc(sx - sz * 0.3, sy - sz * 0.1, sz * 0.25, 0, TAU); g.fill();
  }
  // 围巾在脸上缠一圈
  const wf = clamp(h.wrapFace ?? 0);
  if (wf > 0) {
    const xe = lerp(-58, 58, wf);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const xx = lerp(-58, xe, i / 10); pts.push([xx, 6 + (xx * xx) / 900 - 4]); }
    const k = scarfCols(h.scarf);
    F(ribbonOf(pts, 26, 24, 'round', 6), k.base, 'scarf', { rim: k.light, rimW: 1.5, under: k.dark, underW: 1.5, lift: 2 });
    if (full('scarf')) { g.strokeStyle = rgba(k.dark, 0.6); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-30, -2); g.quadraticCurveTo(lerp(-30, xe, 0.5), 8, xe - 6, 4); g.stroke(); }
  }
  // 牙齿闪光
  if (h.toothSparkle != null && full('skin')) {
    const k = Math.exp(-(((h.t - h.toothSparkle - 0.08) / 0.11) ** 2));
    if (k > 0.02) { glowFx(g, gm.mouth[0] + 4, gm.mouth[1] - 2, 14 * k, PAL.goldLight, 0.7 * k); star4(g, gm.mouth[0] + 4, gm.mouth[1] - 2, 11 * k, PAL.white, k); }
  }
  return { ahogeTip: tip, earX, gm };
}

// ———————————————————— 主函数 ————————————————————
/** 呆毛尖（头坐标）。 */
function ahogeTipOf(shape, curl, ang, ys, mirrorQ) {
  const mir = ys < 0 ? -1 : 1;
  const base = [mir * 4 + 3 * ys, -56.5];
  if (shape === 'heart') return add(base, rot([0, -26], ang));
  const pts = ahogePts(shape, curl);
  const p = pts[pts.length - 1];
  return add(base, rot([p[0] * (shape === 'question' && mirrorQ ? -1 : 1), p[1]], ang));
}

/** 求姿态 + 骨架 + 根变换 + 围巾点列 + 锚点（不画）。 */
function build(o) {
  const x = o.x ?? 0, y = o.y ?? 0, s = o.s ?? 1, face = (o.face ?? 1) < 0 ? -1 : 1, t = o.t ?? 0;
  const detail = o.detail ?? 1;
  const c = { t, act: o.act, phase: o.phase };
  let J = poseOf(o.pose ?? 'idle', c);
  if (o.joints) J = { ...J, ...o.joints };
  if (o.jointsAdd) for (const k in o.jointsAdd) { const a = J[k], b = o.jointsAdd[k]; J[k] = Array.isArray(a) ? a.map((v, i) => v + (b[i] || 0)) : (a || 0) + b; }
  if (o.yaw != null) J.yaw = o.yaw;
  const S = solve(J, o, t);
  const swMode = o.sword ?? J.swMode ?? 'back';
  const inHand = swMode === 'hand' || swMode === 'shoulder';
  const headPt = (p) => add(S.H, rot(p, S.hA));
  const backGrip = S.T(...BACK_SWORD.at), backAng = S.tA + BACK_SWORD.ang * D;
  // 近侧手 IK（挠头 / 托腮 / 握背后剑柄）
  if (J.ikF) {
    const target = J.ikF === 'hilt' ? backGrip : headPt(J.ikF);
    const ha = J.hFa != null ? J.hFa * D : J.ikF === 'hilt' ? backAng : 0;
    const [sa, ea] = ik2(S.arms.F.S, add(target, rot([0, -HAND], ha)), S.tA, J.ikF === 'hilt' ? -1 : 1);
    S.arms.F = armFK(S.arms.F.S, S.tA, [sa, ea, 0], ha / D);
  }
  let swDeg = J.sw;
  if (o.swordAngle != null) swDeg = o.swordAngle / D;
  if (inHand && swDeg == null) { const fa = S.arms.F.fa; swDeg = Math.atan2(Math.cos(fa), -Math.sin(fa)) / D - 55; }
  if (swMode === 'shoulder' && J.sw == null && o.swordAngle == null) swDeg = -160;
  const swRad = (swDeg ?? 0) * D;
  // 远侧手 IK（双手握剑 / 拢耳）
  if (J.ikB === 'grip' && inHand) {
    const target = add(S.arms.F.C, rot([-12, 0], swRad));
    const ha = S.arms.F.ha;
    const [sa, ea] = ik2(S.arms.B.S, add(target, rot([0, -HAND], ha)), S.tA, -1);
    S.arms.B = armFK(S.arms.B.S, S.tA, [sa, ea, 0], ha / D);
  } else if (J.ikB === 'ear') {
    const e = headGeom(J.yaw).ear(1);
    const target = headPt([e.x + 9 * (o.earScale ?? 1), 2]);
    const ha = (J.hBa ?? 180) * D;
    const [sa, ea] = ik2(S.arms.B.S, add(target, rot([0, -HAND], ha)), S.tA, 1);
    S.arms.B = armFK(S.arms.B.S, S.tA, [sa, ea, 0], ha / D);
  }
  // 根变换：挤压 → 翻面 → 用户转角 → 姿态转角（roll 自动找球心并贴地）
  let M = [1, 0, 0, 1, 0, 0];
  if (o.squash) { const q = o.squash; M = mMul(M, [1 / Math.sqrt(Math.max(0.05, 1 + q)), 0, 0, 1 + q, 0, 0]); }
  if (o.turn) { let k = Math.cos(Math.PI * clamp(o.turn)); if (Math.abs(k) < 0.04) k = 0.04 * (k < 0 ? -1 : 1); M = mMul(M, [k, 0, 0, 1, 0, 0]); }
  if (o.rot) M = mMul(M, mRotAbout(o.rot, o.pivot ?? [0, 0]));
  if (J.ball) {
    const pts = [S.P, S.H, S.legs.F.K, S.legs.B.K, S.N];
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const R0 = Math.max(Math.hypot(S.H[0] - cx, S.H[1] - cy) + HRX * 0.92, Math.hypot(S.legs.F.A[0] - cx, S.legs.F.A[1] - cy) + 9);
    M = mMul(M, [1, 0, 0, 1, 0, -R0 - cy]);
    M = mMul(M, mRotAbout(J.rr * D, [cx, cy]));
  } else if (J.rr) M = mMul(M, mRotAbout(J.rr * D, J.piv));
  const L2W = (p) => { const q = mApply(M, p); return [x + face * s * q[0], y + s * q[1]]; };
  // 围巾拖尾（不镜像的“围巾坐标”：原点 = (x,y)，单位 = 局部）
  const sc = o.scarf || {};
  const knotW = L2W(S.T(...KNOT));
  const frame = (p) => [(p[0] - x) / s, (p[1] - y) / s];
  const root = frame(knotW);
  const seat = J.seat >= 0.5;
  const vel = sc.vel ? [sc.vel[0] / s, sc.vel[1] / s] : [face * (J.v || 0), 0];
  const wind = sc.wind ? [sc.wind[0] / s, sc.wind[1] / s] : [0, 0];
  const groundY = sc.ground != null ? (sc.ground - y) / s : seat ? 160 : 0;
  const common = { t, vel, wind, back: sc.back ?? -face, ground: groundY, frozen: sc.frozen ?? 0, lag: sc.lag ?? 0.035 };
  const pts = scarfPoints(root, { ...common, len: sc.len ?? 780, n: 28, trail: sc.trail ? sc.trail.map((p) => [p[0] / s, p[1] / s]) : null, to: sc.to ? frame(sc.to) : null, seed: o.seed ?? 1 });
  const shortPts = scarfPoints([root[0] - 1, root[1] + 3], { ...common, len: 50, n: 7, t: t + 0.37, seed: (o.seed ?? 1) + 7, flutter: 0.8 });
  // 眨眼
  const seed = o.seed ?? 1;
  const bph = fract(t / 3.7 + seed * 0.31);
  const blink = o.blink ?? (bph < 0.035 ? Math.sin((bph / 0.035) * Math.PI) : 0);
  const ahogeAng = (J.ab || 0) + 4 * Math.sin(TAU * 0.8 * t + seed) + (o.ahogeAt != null ? 28 * wobble(t, o.ahogeAt, 5, 0.45) : 0);
  // 锚点
  const gm = headGeom(J.yaw);
  const hp = (p) => L2W(headPt(p));
  const swTip = inHand ? L2W(add(S.arms.F.C, rot([128, 0], swRad))) : L2W(add(backGrip, rot([134, 0], backAng)));
  const hilt = inHand ? L2W(S.arms.F.C) : L2W(backGrip);
  const earSide = J.earSide || ((o.earScale ?? 1) !== 1 ? (gm.ear(1).vis > -0.02 ? 1 : -1) : -1);
  const sole = (L) => add(L.A, rot([5, ANK], L.fa));
  const anchors = {
    head: L2W(S.H), mouth: hp(gm.mouth), eye: hp([(gm.eyeN[0] + gm.eyeF[0]) / 2, gm.eyeN[1]]), eyes: [hp(gm.eyeN), hp(gm.eyeF)], neck: knotW,
    handR: L2W(S.arms.F.C), handL: L2W(S.arms.B.C), swordTip: swTip, hilt, swordAngle: swRad,
    scarfEnd: [x + pts[pts.length - 1][0] * s, y + pts[pts.length - 1][1] * s], scarf: pts.map((p) => [x + p[0] * s, y + p[1] * s]),
    seat: L2W([S.P[0], S.P[1] + 9]), chest: L2W(S.T(5, -60)), nameTag: L2W(S.T(5, -58)),
    ear: hp([gm.ear(earSide).x, 6]), ahogeTip: hp(ahogeTipOf(o.ahoge ?? 'normal', clamp(o.curl ?? 0), ahogeAng * D, J.yaw, face < 0)),
    foot: L2W(sole(S.legs.F)), footB: L2W(sole(S.legs.B)), knee: L2W(S.legs.F.K),
  };
  const X = { J, S, M, x, y, s, face, t, o, sc, pts, shortPts, swMode, inHand, swRad, backGrip, backAng, blink, detail, ahogeAng };
  return { X, anchors };
}

/** 只求锚点不画（马的 stirrupAt、粒子发射点、镜头预先算位置用）。参数同 drawHero。 */
export function heroRig(o = {}) {
  return build(o).anchors;
}

/**
 * drawHero(g, o) —— 勇者木偶。参数见 docs/api/hero.md；返回锚点（调用方坐标）：
 * { head, mouth, eye, eyes, neck（围巾结）, handR（近侧手 = 持剑手）, handL（远侧手）, swordTip, hilt, swordAngle, scarfEnd, scarf（拖尾点列）,
 *   seat（臀底）, chest, nameTag, ear（拢耳 / 放大的那只耳朵）, ahogeTip, foot（近侧脚底）, footB, knee }
 */
export function drawHero(g, o = {}) {
  const { X, anchors } = build(o);
  const { J, detail } = X;
  const puppet = J.puppet >= 0.5 || !!o.rod;
  const edgeO = o.edge !== undefined ? o.edge : puppet ? { color: PAL.paper, w: 6.5 } : null;
  g.save();
  if (o.alpha != null && o.alpha !== 1) g.globalAlpha *= clamp(o.alpha);
  for (const ps of edgeO ? [{ edge: edgeO }, {}] : [{}]) {
    const R = { detail, edge: ps.edge || null, sil: o.silhouette ? o.silColor ?? PAL.ink : null, keep: new Set(o.keepColor ?? ['scarf']), flat: puppet || !!o.flat, lift: detail ? 1.8 : 0 };
    paintAll(g, R, X);
  }
  g.restore();
  return anchors;
}

function paintAll(g, R, X) {
  const { J, S, M, x, y, s, face, t, o, sc, swMode, inHand, swRad, backGrip, backAng } = X;
  const F = makeF(g, R);
  const full = (part) => !R.edge && !(R.sil && !R.keep.has(part));
  const part = o.part ?? 'all';
  const doScarf = part !== 'body' && sc.show !== false, doBody = part !== 'scarf';
  const inj = o.injury || {};
  const nb = inj.bandages ?? 0;
  const silScarf = R.sil && !R.keep.has('scarf') ? R.sil : null;
  const silSword = R.sil && !R.keep.has('sword') ? R.sil : null;
  const legsOnly = J.legsOnly >= 0.5;
  let headInfo = null;
  // 纸偶木杆（最后面）
  if (doBody && (o.rod || J.puppet >= 0.5) && o.rod !== false && !R.edge) {
    g.save(); g.translate(x, y); g.scale(face * s, s); g.transform(...M);
    const len = o.rodLen ?? 520;
    const rp = rr(-4.2, S.P[1] - 6, 8.4, len, 3);
    F(rp, PAL.wood, 'rod', { under: PAL.woodDark, rim: mixHex(PAL.wood, PAL.white, 0.25), lift: 1.4 });
    F(rr(-6.4, S.P[1] - 10, 12.8, 10, 2.5), PAL.goldDark, 'rod', { rim: PAL.gold, rimW: 1.2 });
    g.restore();
  }
  // 围巾两条尾巴（身后）
  if (doScarf && !legsOnly) {
    g.save(); g.translate(x, y); g.scale(s, s);
    const so = { width: sc.width ?? 22, endWidth: sc.endWidth ?? 8, notch: !!sc.notch, hole: !!sc.hole, patch: !!sc.patch, frozen: sc.frozen ?? 0, glow: sc.glow ?? 0, t, seed: o.seed ?? 1, detail: R.detail, sil: silScarf, edge: R.edge, lift: R.detail ? 2 : 0 };
    drawScarf(g, X.shortPts, { ...so, width: so.width * 0.86, endWidth: so.width * 0.6, notch: false, hole: false, patch: false, stripes: false, glow: so.glow * 0.8 });
    drawScarf(g, X.pts, so);
    g.restore();
  }
  g.save();
  g.translate(x, y); g.scale(face * s, s); g.transform(...M);
  const torsoFrame = () => { g.translate(S.P[0], S.P[1]); g.rotate(S.tA); g.scale(S.tsx, S.tsy); };
  const swordO = { s: 1, chip: !!o.chip, glint: o.swordGlint ?? 0, sil: silSword, edge: R.edge, detail: R.detail, flat: R.flat, t };
  const handSword = () => {
    if (!inHand || !doBody) return;
    let arc = o.swordArc ?? J.arc ?? 0, span = 0, dir = 1;
    if (arc > 0 && J.arcFrom != null) { const d = swRad / D - J.arcFrom; span = Math.min(Math.abs(d), 300) * D; dir = d >= 0 ? 1 : -1; }
    drawSword(g, { ...swordO, x: S.arms.F.C[0], y: S.arms.F.C[1], rot: swRad, state: 'bare', arc: span > 0.05 ? arc : 0, arcSpan: span, arcDir: dir });
  };
  if (doBody) {
    // 背上的剑 / 空鞘
    if (swMode !== 'none' && !legsOnly) drawSword(g, { ...swordO, glint: inHand ? 0 : swordO.glint, x: backGrip[0], y: backGrip[1], rot: backAng, state: swMode === 'back' ? 'sheathed' : 'scabbard' });
    if (J.swLayer === 'back') handSword();
    if (!legsOnly && J.farFront < 0.5) {
      paintArm(g, F, full, S.arms.B, true, J.hB);
      if (J.farHand < 0.5) paintHandAt(g, F, full, S.arms.B, true, J.hB);
    }
    if (J.oneLeg < 0.5) paintLeg(g, F, full, S.legs.B, true, false);
    paintLeg(g, F, full, S.legs.F, false, nb >= 4);
    g.save(); torsoFrame();
    if (legsOnly) { const cp = new Path2D(); cp.rect(-60, -24, 120, 60); g.clip(cp); }
    paintTorso(g, F, full, clamp(o.soot ?? 0), !!inj.torn);
    g.restore();
  }
  if (doScarf && !legsOnly) { g.save(); torsoFrame(); paintWrap(g, F, full, sc); g.restore(); }
  if (doBody && !legsOnly) {
    if (J.swLayer === 'mid') handSword();
    g.save(); g.translate(S.H[0], S.H[1]); g.rotate(S.hA);
    headInfo = paintHead(g, F, full, {
      t, yaw: J.yaw, expr: o.expr ?? J.expr ?? 'normal', blink: X.blink, soot: o.soot ?? 0, inflate: o.inflate ?? 0, blush: o.blush ?? 0,
      earScale: o.earScale ?? 1, earSide: J.earSide, ahoge: o.ahoge ?? 'normal', curl: o.curl ?? 0, flame: o.flame ?? 0,
      ahogeAng: X.ahogeAng, mirrorQ: face < 0, sweat: o.sweat ?? 0, toothSparkle: o.toothSparkle, injury: inj, wrapFace: sc.wrapFace ?? 0, scarf: sc, detail: R.detail,
    });
    g.restore();
    // 近侧手臂（+ 手中的剑 + 手）
    paintArm(g, F, full, S.arms.F, false, J.hF, { torn: !!inj.torn, bandage: nb >= 3 });
    if (J.swLayer === 'hand') handSword();
    paintHandAt(g, F, full, S.arms.F, false, J.hF);
    if (J.farFront >= 0.5) { paintArm(g, F, full, S.arms.B, true, J.hB); paintHandAt(g, F, full, S.arms.B, true, J.hB); }
    else if (J.farHand >= 0.5) paintHandAt(g, F, full, S.arms.B, true, J.hB);
  }
  // 纸偶铜钉
  if (doBody && (o.rod || J.puppet >= 0.5) && full('body')) {
    const pins = [S.arms.F.S, S.arms.F.E, S.legs.F.hp, S.legs.F.K];
    if (legsOnly) pins.splice(0, 2);
    for (const p of pins) {
      paperFill(g, blob(p[0], p[1], 3.4, 3.4, { seed: 61, amp: 0.02 }), PAL.gold, { lift: 1, rim: PAL.goldLight, rimW: 0.9, under: PAL.goldDark, underW: 0.9 });
      g.strokeStyle = PAL.goldDark; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0] - 1.8, p[1] - 1.2); g.lineTo(p[0] + 1.8, p[1] + 1.2); g.stroke();
    }
  }
  g.restore();
  // 胸前名签（不镜像）
  if (o.nameTag && doBody && !R.edge && !R.sil && !legsOnly) {
    const chars = [...o.nameTag];
    const size = o.nameTagSize ?? 24;
    const q = mApply(M, S.T(5, -58));
    const pc = [x + face * s * q[0], y + s * q[1]];
    const pop = o.nameTagPop != null ? outBack(clamp(o.nameTagPop), 2.2) : 1;
    if (pop > 0.01) {
      g.save();
      g.translate(pc[0], pc[1]); g.scale(s * pop, s * pop); g.rotate(-0.05 * face);
      const w = chars.length * size * 0.9 + size * 0.7, h = size * 1.42;
      paperFill(g, rr(-w / 2, -h / 2, w, h, size * 0.22), PAL.paper, { lift: 1.8, rim: PAL.white, rimW: 1.2, under: PAL.kraftDark, underW: 1.4 });
      g.strokeStyle = PAL.ink; g.lineWidth = Math.max(1.2, size * 0.06); g.lineJoin = 'round';
      g.stroke(rr(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, size * 0.16));
      paperFill(g, blob(-w / 2 + 6, -h / 2 + 6, 3.2, 3.2, { seed: 71 }), PAL.gold, { rim: PAL.goldLight, rimW: 0.8, under: PAL.goldDark, underW: 0.8 });
      glyphRow(g, chars, 0, 0, size, { align: 'center', family: 'display', fill: PAL.red, edge: null, gap: size * 0.06 });
      g.restore();
    }
  }
  return headInfo;
}

/**
 * drawHeroHead(g, o)：只画头（头像框 / 角色卡 / HUD 用）。锚在头心。
 * o: { x, y, s=1, face, t, expr, yaw=1, rot（弧度）, ahoge, curl, flame, soot, blush, inflate, sweat, injury, scarf（wrapFace 用）, detail, seed, blink }
 * 返回 { mouth, eyes, ahogeTip }。
 */
export function drawHeroHead(g, o = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, s = o.s ?? 1, face = (o.face ?? 1) < 0 ? -1 : 1, t = o.t ?? 0;
  const seed = o.seed ?? 1;
  const bph = fract(t / 3.7 + seed * 0.31);
  const R = { detail: o.detail ?? 1, edge: o.edge ?? null, sil: o.silhouette ? o.silColor ?? PAL.ink : null, keep: new Set(o.keepColor ?? ['scarf']), flat: !!o.flat, lift: (o.detail ?? 1) ? 1.8 : 0 };
  const F = makeF(g, R);
  const full = (part) => !R.edge && !(R.sil && !R.keep.has(part));
  g.save();
  g.translate(x, y); g.scale(face * s, s); if (o.rot) g.rotate(o.rot);
  const info = paintHead(g, F, full, {
    t, yaw: o.yaw ?? 1, expr: o.expr ?? 'normal', blink: o.blink ?? (bph < 0.035 ? Math.sin((bph / 0.035) * Math.PI) : 0), soot: o.soot ?? 0, inflate: o.inflate ?? 0, blush: o.blush ?? 0,
    earScale: o.earScale ?? 1, earSide: o.earSide ?? 0, ahoge: o.ahoge ?? 'normal', curl: o.curl ?? 0, flame: o.flame ?? 0,
    ahogeAng: 4 * Math.sin(TAU * 0.8 * t + seed) + (o.ahogeAt != null ? 28 * wobble(t, o.ahogeAt, 5, 0.45) : 0), mirrorQ: face < 0,
    sweat: o.sweat ?? 0, toothSparkle: o.toothSparkle, injury: o.injury || {}, wrapFace: (o.scarf && o.scarf.wrapFace) || 0, scarf: o.scarf || {}, detail: R.detail,
  });
  g.restore();
  const W = (p) => { const q = o.rot ? rot(p, o.rot) : p; return [x + face * s * q[0], y + s * q[1]]; };
  return { mouth: W(info.gm.mouth), eyes: [W(info.gm.eyeN), W(info.gm.eyeF)], ahogeTip: W(info.ahogeTip) };
}
