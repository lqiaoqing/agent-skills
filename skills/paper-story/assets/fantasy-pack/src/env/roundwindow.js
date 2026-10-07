// 圆形彩色玻璃窗（王城外景的圆窗与王座厅玫瑰窗共用，保证 E05/E09/O07 内外匹配）。
import { PAL, blob, cut, glow, rays, rad } from '../core/paper.js';
import { TAU, rgba, mixHex } from '../core/util.js';

const PETALS = [PAL.heart, PAL.gold, PAL.crystal, PAL.magic, PAL.heart, PAL.gold, PAL.crystal, PAL.magic];

/**
 * drawRoundWindow(g, { x, y, r, face:'out'|'in', glow:0..1, t, seed })
 * out = 从外面看（受光、玻璃偏暗、石框有亮边）；in = 从里面看（逆光透亮 + 放射光束）。
 */
export function drawRoundWindow(g, o = {}) {
  const { x = 0, y = 0, r = 70, face = 'out', t = 0, seed = 5 } = o;
  const lit = face === 'in' ? 1 : 0.35;
  const gl = o.glow ?? (face === 'in' ? 0.6 : 0);
  g.save();
  // 石框
  cut(g, blob(x, y, r * 1.18, r * 1.18, { seed, amp: 0.012 }), face === 'in' ? PAL.stoneDark : PAL.stone2, { shadow: 3, rim: face === 'in' ? null : PAL.white });
  cut(g, blob(x, y, r * 1.04, r * 1.04, { seed: seed + 1, amp: 0.01 }), PAL.inkSoft);
  // 8 瓣
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU - TAU / 16, a1 = a0 + TAU / 8;
    const p = new Path2D();
    p.moveTo(x + Math.cos(a0) * r * 0.36, y + Math.sin(a0) * r * 0.36);
    p.arc(x, y, r * 0.96, a0 + 0.04, a1 - 0.04);
    p.lineTo(x + Math.cos(a1) * r * 0.36, y + Math.sin(a1) * r * 0.36);
    p.closePath();
    const c = PETALS[i];
    g.fillStyle = rad(g, x, y, r * 0.3, r, [[0, mixHex(c, PAL.white, 0.35 * lit)], [1, mixHex(c, PAL.ink, 0.45 * (1 - lit))]]);
    g.fill(p);
  }
  // 金心
  cut(g, blob(x, y, r * 0.34, r * 0.34, { seed: seed + 2, amp: 0.02 }), PAL.gold, { rim: PAL.goldLight });
  cut(g, blob(x, y, r * 0.16, r * 0.16, { seed: seed + 3, amp: 0.02 }), PAL.goldLight);
  // 内侧：逆光光晕与光束
  if (gl > 0) {
    glow(g, x, y, r * 1.6, PAL.goldLight, 0.5 * gl);
    rays(g, x, y, r * 3.2, { n: 8, width: 0.11, rot: TAU / 16 + Math.sin(t * 0.2) * 0.02, color: PAL.goldLight, alpha: 0.22 * gl, r0: r * 0.9, seed });
  }
  g.restore();
}

export { rgba };
