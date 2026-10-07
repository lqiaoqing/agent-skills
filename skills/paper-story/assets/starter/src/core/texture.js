// 程序化纹理：纸纤维底纹、胶片颗粒。只在启动时生成一次（固定种子，可复现）。
import { mulberry32 } from './util.js';

/** 纸纹：低频明暗斑 + 纤维短线 + 细颗粒，平均亮度接近白，用 multiply 叠加。 */
export function buildPaperTexture(size = 512, seed = 7) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  // 低频斑驳（可平铺：在 3×3 邻域重复绘制）
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 110;
    const a = 0.018 + rnd() * 0.03;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const grd = g.createRadialGradient(x + ox * size, y + oy * size, 0, x + ox * size, y + oy * size, r);
      grd.addColorStop(0, `rgba(120,95,70,${a})`);
      grd.addColorStop(1, 'rgba(120,95,70,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox * size - r, y + oy * size - r, r * 2, r * 2);
    }
  }
  // 纤维
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, len = 4 + rnd() * 18, ang = rnd() * Math.PI * 2;
    const dark = rnd() < 0.7;
    g.strokeStyle = dark ? `rgba(90,70,55,${0.05 + rnd() * 0.08})` : `rgba(255,255,255,${0.2 + rnd() * 0.3})`;
    g.lineWidth = 0.6 + rnd() * 0.9;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const bx = x + ox * size, by = y + oy * size;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + Math.cos(ang + 0.6) * len * 0.5, by + Math.sin(ang + 0.6) * len * 0.5, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
      g.stroke();
    }
  }
  // 细颗粒
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 胶片颗粒：以 50% 灰为中性，用 overlay 叠加。 */
export function buildGrain(size = 256, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * 图层用纸纹：透明底，只含暗纤维/亮纤维/斑驳/细颗粒，用 source-atop 叠在图层内容上（只影响有内容的地方）。
 */
export function buildPaperDetail(size = 512, seed = 17) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 120, dark = rnd() < 0.6;
    const a = 0.03 + rnd() * 0.05;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const grd = g.createRadialGradient(x + ox * size, y + oy * size, 0, x + ox * size, y + oy * size, r);
      grd.addColorStop(0, dark ? `rgba(70,50,40,${a})` : `rgba(255,252,240,${a * 1.4})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox * size - r, y + oy * size - r, r * 2, r * 2);
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * size, y = rnd() * size, len = 3 + rnd() * 16, ang = rnd() * Math.PI * 2, dark = rnd() < 0.55;
    g.strokeStyle = dark ? `rgba(60,42,32,${0.06 + rnd() * 0.1})` : `rgba(255,253,245,${0.12 + rnd() * 0.22})`;
    g.lineWidth = 0.5 + rnd() * 1.0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const bx = x + ox * size, by = y + oy * size;
      g.beginPath(); g.moveTo(bx, by);
      g.quadraticCurveTo(bx + Math.cos(ang + 0.6) * len * 0.5, by + Math.sin(ang + 0.6) * len * 0.5, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
      g.stroke();
    }
  }
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (rnd() < 0.5) { const v = rnd() < 0.5 ? 40 : 255; const a = rnd() * 22; const k = d[i + 3] / 255; d[i] = d[i] * k + v * (1 - k); d[i + 1] = d[i + 1] * k + v * (1 - k); d[i + 2] = d[i + 2] * k + v * (1 - k); d[i + 3] = Math.max(d[i + 3], a); }
  }
  g.putImageData(img, 0, 0);
  return c;
}
