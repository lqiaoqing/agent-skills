# 转场调用

准确实现见 `src/fx/transitions.js`。各转场参数并不统一：不能把 p 传给只认 size 的函数。

## 形状揭示

```js
import {shapeReveal,coverSize} from '../fx/transitions.js';
import {seg} from '../core/util.js';
import {inOutCubic} from '../core/ease.js';
const p=inOutCubic(seg(T,start,end));
shapeReveal(ctx,g,'circle',{
  cx:960,cy:540,size:coverSize('circle')*p
},drawCompleteNextScene);
```

`shapeReveal(ctx,g,shape,options,drawNext)` 用大小 `size` 或圆的 `r`，不是进度 `p`。`shapeGeom/coverSize` 支持的具体形状查源码；改变中心后把相同 cx/cy 传给 coverSize 才能确保覆盖四角。默认硬边 clip；feather 会用额外缓冲。

后镜头 start 设为场景 start 减去重叠时长；前镜头 end 是该重叠结束。drawNext 先铺满自己的背景。p=0 时只见前镜头，p=1 时完整后镜头；必须检查这两个状态和边界前后。

## 其他效果

- `whipCurtain(ctx,g,T,options,drawNext)`：纸幕甩动，options 含起止、方向等，先看函数源码。
- `pageTurn(ctx,g,T,options,drawNext)`：翻页与页背投影，需要起止与纸面方向；不要假设与 shapeReveal 同签名。
- `paperTear(g,pts,p,options)`：路径撕纸边；`burnEdge`：烧边；这些是绘制效果，是否揭示下一镜头由调用者实现。
- `impact(ctx,T,at,'S'|'M'|'L'|'MAX',options)`：短震动/闪光，可附 speedLines/impactRays。安静故事用低强度或不用。

原 API 注释可能包含达拉崩吧示例秒数，这些只是原实现说明。新项目事件取自 SCENE/LINE/cues，不能搬入旧事件号作为新时间轴。
