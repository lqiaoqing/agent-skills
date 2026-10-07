# 绘制与引擎 API

源代码是准确 API 的最终依据，复制调用前阅读对应函数；旧素材文档中的歌曲例子不是项目时间约定。

```js
import {SCENE} from '../timeline.js';
import {PAL,blob,cut} from '../core/paper.js';
import {clamp} from '../core/util.js';
const s=SCENE('opening');
export default [{id:'opening',start:s.start,end:s.end,draw(g,T,lt,ctx){
  const u=clamp((T-s.start)/(s.end-s.start));
  g.fillStyle=PAL.paper;g.fillRect(0,0,1920,1080);
  ctx.layer(g,{shadow:8,texture:0.25},lg=>{
    cut(lg,blob(600+500*u,540,120,100,{seed:12}),PAL.gold);
  });
}}];
```

shots 的区间 `[start,end)`；相同 z 按数组顺序，后者覆盖前者。T 是经过 warp 的故事秒，lt=T-shot.start。`ctx.active/errors/poolPeak` 可供探针检查，`window.renderFrame(realSeconds)` 供浏览器和渲染器调用。

## 基本图形

- `rr(x,y,w,h,r)`、`blob(cx,cy,rx,ry,{seed,amp,n})`、`poly(points,{seed,amp,round})`、`smooth(points,opts)`、`ribbon(points,widths)` 返回 Path2D。
- `cut(g,path,fill,{rim,rimW,shadow,...})` 画纸片及纸边，准确可选键见 core/paper.js。
- `shade(g,path,color,x0,y0,x1,y1,a0,a1)`、`lin(g,x0,y0,x1,y1,stops)`、`glow(g,x,y,r,color,alpha,mode)` 控制局部照明；透明 glow 属于表现效果，不能代替实心纸片。
- `PAL` 是共享配色，project.palette 在字体载入前合并。部分旧模块在 import 时缓存颜色常量；大幅换色时检查这些局部常量。

## 分层与机位

`ctx.layer(g,options,fn)` 将 fn 画到透明离屏后合成回 g。options 包括 alpha、blend、blur、sat、bright、contrast、filter、shadow、texture、texOffset、tint。

shadow 为数字时换算成纸厚度的右下投影；或 `{blur,dx,dy,color}`。texture 为 0..1，随移动物体用 `texOffset:[x,y]`。tint 为 `{color,alpha,mode}`，默认 source-atop；附带透明遮罩避免 blend fill 污染外部区域。半透明边缘的调色需要视觉检查。

离屏图层开始为屏幕逻辑坐标，不自动继承外层 g 的变换。要画世界物体，在 fn 内调用 applyCam；要嵌套任意变换则复制 `g.getTransform()` 给 lg。按背景/主体/前景组织，默认层池不需要手工管理。

`ctx.mask(g,maskFn,drawFn,{feather,invert,alpha,blend})`；maskFn 只填路径，不自行改合成模式。可优先使用 transitions 的硬边裁剪，节省全屏画布。

`applyCam(g,{x,y,zoom,rot},depth)` 的机位中心为 `(960,540)`。depth<1 为远景，=1 为主体，>1 为前景。用 `lerpCam` 移机位，用 `toScreen` 取得物体的屏幕位置。

ctx.fx 每个渲染帧复位：shake/zoom/rot、sat/bright/contrast/hue/blur、tint/tintAlpha/tintMode、flash/flashColor、fade/fadeColor、paper/vignette/grain/letterbox。普通温暖绘本避免持续晃动和强闪；冲击效果服务动作。

## 文字与角色

`paperGlyph(g,ch,x,y,size,options)` 的默认原点居中；`glyphRow/typeOn/scrollInk/titleGlyphs` 等准确签名见 ui/type.js。字幕已由 main.js 绘制，不能再叠同一句字幕。长字幕适度拆句；当前单行字体缩放只是兜底。

Fantasy rigs 绘制函数每次返回当前骨点（head/hand 等），挂载道具使用本帧返回值。不要缓存前一帧手部位置。具体见 asset-pack.md 及对应 API 文件。

`engine.render(t,{samples,fps})` 支持子帧累加，cuts 限制采样范围。`renderProbe(t,fn)` 可代替镜头绘制合成测试图。time.test 验证双向时间映射，regression 验证图层边界与不同取帧顺序下画面一致性。
