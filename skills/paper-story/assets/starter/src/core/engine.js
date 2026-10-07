// 引擎：镜头调度、时间映射（warp）、离屏图层、遮罩、整帧后期、子帧运动模糊。
//
// 镜头（shot）约定 —— 每个 src/scenes/*.js 默认导出一个 shot 数组：
//   { id, start, end, z?, draw(g, T, lt, ctx) }
//   start/end 为“默认时间轴”秒（见 cues.js），激活区间 [start, end)，相邻镜头可重叠做转场。
//   z 越大越靠上（默认 0；相同 z 按 story 中的顺序）。
//   draw 必须是 T 的纯函数：禁止 Math.random / Date.now / 跨帧状态。g 已设为逻辑坐标 1920×1080。
import { makeWarp } from './time.js';
import { buildPaperTexture, buildPaperDetail, buildGrain } from './texture.js';

export const W = 1920, H = 1080;

const FX_DEFAULT = () => ({
  // 整帧“机位”：震动（逻辑像素）、推近（>=1）、滚转（弧度）
  shake: [0, 0], zoom: 1, rot: 0,
  // 调色（CSS filter，1 为原样）
  sat: 1, bright: 1, contrast: 1, hue: 0, blur: 0,
  // 叠色：tint 为颜色，tintAlpha 0..1，tintMode 为混合模式
  tint: null, tintAlpha: 0, tintMode: 'multiply',
  // 闪白/闪色、淡入淡出
  flash: 0, flashColor: '#fff7e0', fade: 0, fadeColor: '#120c10',
  // 固定质感层：纸纹、暗角、颗粒
  paper: 0.22, vignette: 0.3, vignetteColor: '#2a1520', grain: 0.045,
  // 宽银幕黑边 0..1（1 = 2.39:1）
  letterbox: 0,
});

export function createEngine({ canvas, dpr = 1, story, stamp = false, noGrain = false }) {
  const CW = Math.round(W * dpr), CH = Math.round(H * dpr);
  canvas.width = CW; canvas.height = CH;
  const mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; };
  const out = canvas.getContext('2d', { alpha: false });
  const sceneBuf = mk(), frameBuf = mk();
  const sg = sceneBuf.getContext('2d', { alpha: false });
  const fg = frameBuf.getContext('2d', { alpha: false });

  // 离屏画布池（图层 / 遮罩用）
  const pool = [];
  let inUse = 0;
  const acquire = () => {
    if (inUse >= pool.length) pool.push(mk());
    const c = pool[inUse++];
    if (typeof ctx !== 'undefined') ctx.poolPeak = Math.max(ctx.poolPeak, inUse);
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.clearRect(0, 0, CW, CH);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  };
  const release = () => { inUse--; };

  const paperTex = buildPaperTexture(512, 7);
  const paperDetail = buildPaperDetail(512, 17);
  const grainTexs = [0, 1, 2, 3].map((i) => buildGrain(256, 101 + i));

  let warp = makeWarp({}, story.cues || {}, story.duration);
  const shots = story.shots.map((s, i) => ({ z: 0, ...s, _i: i }));
  const cuts = [...new Set([0, ...(story.cuts || []), story.duration])].sort((a, b) => a - b);

  const ctx = {
    W, H, dpr, T: 0, t: 0, fx: FX_DEFAULT(), story,
    /** 当前活跃镜头 id（调试用） */
    active: [], errors: [], poolPeak: 0,
    /**
     * 离屏图层：fn(lg) 在独立画布上绘制（逻辑坐标），再整体合成回 g。
     * o: { alpha, blend, blur(px), sat / bright / contrast（只作用于本图层的调色，1 为原样）, filter（任意 CSS filter 串）,
     *      shadow:{blur,dx,dy,color} 或 数字(纸张厚度 px),
     *      texture: 0..1 纸纹强度, texOffset:[x,y] 纸纹随图层平移, tint:{color, alpha, mode} }
     */
    layer(g, o, fn) {
      const c = acquire();
      const lg = c.getContext('2d');
      try { fn(lg); } finally {
        if (o.tint) {
          // Keep an untouched alpha mask: a blend fill makes transparent pixels opaque.
          const mask = o.tint.mode ? acquire() : null;
          if (mask) {
            const mg = mask.getContext('2d');
            mg.setTransform(1, 0, 0, 1, 0, 0);
            mg.drawImage(c, 0, 0);
          }
          try {
            lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0);
            lg.globalCompositeOperation = o.tint.mode || 'source-atop';
            lg.globalAlpha = o.tint.alpha ?? 0.5;
            lg.fillStyle = o.tint.color; lg.fillRect(0, 0, CW, CH);
            if (mask) {
              lg.globalCompositeOperation = 'destination-in'; lg.globalAlpha = 1;
              lg.drawImage(mask, 0, 0);
            }
            lg.restore();
          } finally { if (mask) release(); }
        }
        if (o.texture) texturize(lg, o.texture, o.texOffset);
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
        if (o.blend) g.globalCompositeOperation = o.blend;
        const flt = [];
        if (o.blur) flt.push(`blur(${o.blur * dpr}px)`);
        if (o.sat !== undefined && o.sat !== 1) flt.push(`saturate(${o.sat})`);
        if (o.bright !== undefined && o.bright !== 1) flt.push(`brightness(${o.bright})`);
        if (o.contrast !== undefined && o.contrast !== 1) flt.push(`contrast(${o.contrast})`);
        if (o.filter) flt.push(o.filter);
        if (flt.length) g.filter = flt.join(' ');
        const sh = typeof o.shadow === 'number' ? paperShadow(o.shadow) : o.shadow;
        if (sh) {
          g.shadowColor = sh.color || 'rgba(43,26,36,0.32)';
          g.shadowBlur = (sh.blur ?? 10) * dpr;
          g.shadowOffsetX = (sh.dx ?? 4) * dpr;
          g.shadowOffsetY = (sh.dy ?? 8) * dpr;
        }
        g.drawImage(c, 0, 0);
        g.restore();
        release();
      }
    },
    /**
     * 遮罩绘制：drawFn(lg) 的内容只保留 maskFn(mg) 填充到的区域。
     * maskFn 在同一画布上以 destination-in 方式填充形状（请只 fill，不要改合成模式）。
     * o: { feather(px): 边缘羽化, invert: true 为挖洞, alpha, blend }
     */
    mask(g, maskFn, drawFn, o = {}) {
      const c = acquire();
      const lg = c.getContext('2d');
      try {
        drawFn(lg);
        lg.save();
        lg.globalCompositeOperation = o.invert ? 'destination-out' : 'destination-in';
        if (o.feather) lg.filter = `blur(${o.feather * dpr}px)`;
        lg.fillStyle = '#000';
        maskFn(lg);
        lg.restore();
      } finally {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
        if (o.blend) g.globalCompositeOperation = o.blend;
        g.drawImage(c, 0, 0);
        g.restore();
        release();
      }
    },
    /** 纸纹图案（CanvasPattern），可用于任意 fill。 */
    paperPattern(g) { return g.createPattern(paperDetail, 'repeat'); },
  };

  function paperShadow(d) {
    return { blur: d * 1.5, dx: d * 0.35, dy: d * 0.85, color: 'rgba(43,26,36,0.30)' };
  }

  function texturize(lg, strength, off = [0, 0]) {
    lg.save();
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-atop';
    lg.globalAlpha = Math.min(1, strength * 1.6);
    const pat = lg.createPattern(paperDetail, 'repeat');
    pat.setTransform(new DOMMatrix().translate(off[0] * dpr, off[1] * dpr).scale(dpr, dpr));
    lg.fillStyle = pat;
    lg.fillRect(0, 0, CW, CH);
    lg.restore();
  }

  function errorCard(g, s, e) {
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgba(160,20,30,0.85)'; g.fillRect(40, 40, 1100, 120);
    g.fillStyle = '#fff'; g.font = '28px Menlo, monospace';
    g.fillText(`[${s.id}] ${String(e && e.message || e).slice(0, 70)}`, 60, 110);
    g.restore();
  }

  let probeShots = null; // renderProbe 期间临时替换镜头表（验收工具用）
  function drawShots(T) {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalAlpha = 1; sg.globalCompositeOperation = 'source-over'; sg.filter = 'none';
    sg.fillStyle = '#120c10'; sg.fillRect(0, 0, CW, CH);
    const act = (probeShots || shots).filter((s) => T >= s.start && T < s.end).sort((a, b) => a.z - b.z || a._i - b._i);
    ctx.active = act.map((s) => s.id);
    if (!act.length) {
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      sg.fillStyle = '#3a2a33'; sg.font = '36px Menlo, monospace';
      sg.fillText(`NO SHOT @ ${T.toFixed(2)}s`, 80, 540);
    }
    for (const s of act) {
      sg.save();
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      try { s.draw(sg, T, T - s.start, ctx); } catch (e) { ctx.errors.push({ shot: s.id, message: String(e.message || e) }); console.error(`[shot ${s.id}]`, e); sg.restore(); errorCard(sg, s, e); continue; }
      sg.restore();
      if (inUse !== 0) { ctx.errors.push({shot:s.id,message:'layer pool leak'});console.error(`[shot ${s.id}] layer pool leak`); inUse = 0; }
    }
    if (story.post) {
      sg.save(); sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      try { story.post(sg, T, ctx); } catch (e) { ctx.errors.push({shot:'post',message:String(e.message || e)});console.error('[post]', e); }
      sg.restore();
    }
  }

  /** 场景缓冲 → 目标：机位（震动/推近/滚转）、调色、叠色、闪白、淡出。 */
  function compose(target, fx) {
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1; target.globalCompositeOperation = 'source-over';
    target.fillStyle = '#120c10'; target.fillRect(0, 0, CW, CH);
    const sx = fx.shake[0] || 0, sy = fx.shake[1] || 0;
    const zoom = Math.max(fx.zoom, 1 + (2 * Math.hypot(sx, sy)) / W + Math.abs(fx.rot) * 0.6);
    target.save();
    target.translate(CW / 2 + sx * dpr, CH / 2 + sy * dpr);
    if (fx.rot) target.rotate(fx.rot);
    target.scale(zoom, zoom);
    target.translate(-CW / 2, -CH / 2);
    const f = [];
    if (fx.sat !== 1) f.push(`saturate(${fx.sat})`);
    if (fx.bright !== 1) f.push(`brightness(${fx.bright})`);
    if (fx.contrast !== 1) f.push(`contrast(${fx.contrast})`);
    if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
    if (fx.blur) f.push(`blur(${fx.blur * dpr}px)`);
    target.filter = f.length ? f.join(' ') : 'none';
    target.drawImage(sceneBuf, 0, 0);
    target.restore();
    target.filter = 'none';
    if (fx.tint && fx.tintAlpha > 0) {
      target.globalAlpha = fx.tintAlpha; target.globalCompositeOperation = fx.tintMode || 'multiply';
      target.fillStyle = fx.tint; target.fillRect(0, 0, CW, CH);
      target.globalAlpha = 1; target.globalCompositeOperation = 'source-over';
    }
    if (fx.flash > 0) {
      target.globalAlpha = Math.min(1, fx.flash); target.globalCompositeOperation = 'screen';
      target.fillStyle = fx.flashColor; target.fillRect(0, 0, CW, CH);
      target.globalAlpha = 1; target.globalCompositeOperation = 'source-over';
    }
  }

  /** 固定质感层 + 淡出 + 黑边：每个输出帧只加一次。 */
  function finish(target, fx, T) {
    target.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.paper > 0) {
      target.save();
      target.globalAlpha = fx.paper; target.globalCompositeOperation = 'multiply';
      const pat = target.createPattern(paperTex, 'repeat');
      pat.setTransform(new DOMMatrix().scale(dpr, dpr));
      target.fillStyle = pat; target.fillRect(0, 0, CW, CH);
      target.restore();
    }
    if (fx.vignette > 0) {
      target.save();
      const r = Math.hypot(CW, CH) / 2;
      const grd = target.createRadialGradient(CW / 2, CH / 2, r * 0.45, CW / 2, CH / 2, r * 1.02);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, fx.vignetteColor);
      target.globalAlpha = fx.vignette; target.globalCompositeOperation = 'multiply';
      target.fillStyle = grd; target.fillRect(0, 0, CW, CH);
      target.restore();
    }
    if (fx.grain > 0 && !noGrain) { // noGrain：逐帧像素对比（接缝验收）时关掉颗粒
      target.save();
      const k = Math.floor(T * 12) & 3; // 每秒 12 次换颗粒（胶片感，不闪）
      const pat = target.createPattern(grainTexs[k], 'repeat');
      pat.setTransform(new DOMMatrix().scale(dpr, dpr));
      target.globalAlpha = fx.grain; target.globalCompositeOperation = 'overlay';
      target.fillStyle = pat; target.fillRect(0, 0, CW, CH);
      target.restore();
    }
    if (fx.fade > 0) {
      target.globalAlpha = Math.min(1, fx.fade); target.fillStyle = fx.fadeColor; target.fillRect(0, 0, CW, CH); target.globalAlpha = 1;
    }
    if (fx.letterbox > 0) {
      const bar = ((CH - CW / 2.39) / 2) * Math.min(1, fx.letterbox);
      target.fillStyle = '#0d0a0c'; target.fillRect(0, 0, CW, bar); target.fillRect(0, CH - bar, CW, bar);
    }
  }

  function renderOnce(T, target) {
    ctx.T = T; ctx.fx = FX_DEFAULT(); ctx.errors = []; ctx.poolPeak = 0;
    drawShots(T);
    compose(target, ctx.fx);
    return ctx.fx;
  }

  function segOf(T) {
    let a = 0, b = story.duration;
    for (const c of cuts) { if (c <= T + 1e-9) a = c; else { b = c; break; } }
    return [a, b];
  }

  /**
   * 渲染真实时间 t（秒）的一帧。samples>1 时在快门区间内取子帧平均做运动模糊，
   * 子帧不跨越 story.cuts 里的硬切点。
   */
  function render(t, { samples = 1, shutter = 0.5, fps = 30 } = {}) {
    ctx.t = t;
    const T = warp.toDefault(t);
    let fx;
    if (samples <= 1) {
      fx = renderOnce(T, out);
    } else {
      const [a, b] = segOf(T);
      const span = (shutter / fps) * (warp.toDefault(t + 0.01) - T) / 0.01;
      for (let i = 0; i < samples; i++) {
        let Ti = T + ((i + 0.5) / samples - 0.5) * span;
        Ti = Math.min(Math.max(Ti, a), b - 1e-4);
        const f = renderOnce(Ti, fg);
        if (i === Math.floor(samples / 2)) fx = f;
        out.setTransform(1, 0, 0, 1, 0, 0);
        out.globalCompositeOperation = 'source-over';
        out.globalAlpha = 1 / (i + 1);
        out.drawImage(frameBuf, 0, 0);
      }
      out.globalAlpha = 1;
      ctx.T = T;
    }
    finish(out, fx, T);
    if (stamp) {
      out.setTransform(dpr, 0, 0, dpr, 0, 0);
      out.fillStyle = 'rgba(0,0,0,0.55)'; out.fillRect(16, 16, 760, 44);
      out.fillStyle = '#fff'; out.font = '22px Menlo, monospace';
      out.fillText(`T ${T.toFixed(2)}  ${ctx.active.join(' + ')}`.slice(0, 60), 28, 46);
    }
  }

  return {
    ctx, render,
    /** 验收工具用：只用给定的镜头（draw 函数）渲染默认时间 T 的一帧，其余管线（后期、颗粒）照常。 */
    renderProbe(T, draw) {
      probeShots = [{ id: 'probe', start: -1e9, end: 1e9, z: 0, _i: 0, draw }];
      const saved = warp;
      warp = makeWarp({}, story.cues || {}, story.duration);
      try { render(T); } finally { probeShots = null; warp = saved; }
    },
    setWarp(anchors) { warp = makeWarp(anchors, story.cues || {}, story.duration); },
    get warp() { return warp; },
    get duration() { return warp.toReal(story.duration); },
  };
}
