# 纸制品、村庄道具与杂项（props）API

> 文件：`src/props/paper.js`、`src/props/village.js`、`src/props/misc.js`；规格：`docs/assets.md` 9.3 / 9.6 / 9.7。
> 本文每个参数名都按源码核对过；与 assets.md 不一致处见第 6 节。时间一律是**默认秒**（`T`），cue 见 `src/cues.js`。

## 1. 模块与导出一览

### 1.1 `src/props/paper.js` —— 纸制品

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawNotice(g, o)` | 函数 | 「勇者招募」告示：正/背面、翻面、展开、图钉、只剩两个纸角 |
| `drawScroll(g, o)` | 函数 | 卷轴：竖挂（逐行写金墨字）/ 平铺在地向右（或向左）滚（涂鸦、红叉章、龙名） |
| `drawDecree(g, o)` | 函数 | 圣旨：奶油长卷 + 红边，三段金印字按时刻砸出，可吊成横幅 + 扫光 |
| `drawPaperRoll(g, o)` | 函数 | 大纸卷：侧视 / 端视、弹台阶挤压；`overCamera` 碾过镜头 |
| `rollOverCameraY(p)` | 函数 | 碾镜纸卷在进度 p 时的屏幕 y（给遮罩用，不画任何东西） |
| `drawScrollTower(g, o)` | 函数 | 书记官背的纸卷塔：摇晃 / 倒塌散落 |
| `drawInfiniteScroll(g, path, o)` | 函数 | 沿路径展开的无限卷轴（王浩然 + 四个长名字循环，远处变点纹） |
| `drawCreditLabel(g, o)` | 函数 | 片尾奶油贴签：滑入 + 署名逐行出现 |
| `samplePath(ctrl, step)` | 函数 | 控制点 → 等距重采样的平滑折线（带累计弧长） |
| `pathAt(sp, s)` | 函数 | 弧长 s 处的 `[x, y, 切线角, (w)]` |
| `pathSlice(sp, s0, s1)` | 函数 | 截取弧长 [s0, s1] 的折线 |
| `NOTICE` | 常量 | 告示尺寸 `{ w: 280, h: 200 }` |
| `CREDIT_LINES` | 常量 | 片尾署名四行（见 4.6） |
| `_writeRow / _rollH / _rollV / _pushPin / _coinIcon` | 内部 | 模块内部小部件，供 misc.js 复用；**场景不要依赖**（随时可能改） |

### 1.2 `src/props/village.js` —— 宝箱与容器、道具小图标、听岔图标

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawChest(g, o)` | 函数 | 宝箱（斜投影三维折纸盒，盖子绕后沿真的翻开）；`big` 大宝箱 |
| `drawPot(g, o)` | 函数 | 村民的陶罐：罐盖弹起歪倒 + 金光 |
| `drawBarrel(g, o)` | 函数 | 木桶：桶盖弹起翻转 + 金光 |
| `drawFlowerPot(g, o)` | 函数 | 花盆：整株连土拔起 + 金光 |
| `drawItemIcon(g, name, o)` | 函数 | 路径画小道具：potion / key / boots / shield / hat / bag |
| `drawMishearIcon(g, name, o)` | 函数 | 听岔五图标：card / violin / eggtart / soda / marathon |
| `MISHEAR_NAMES` | 常量 | 听岔图标 → 中文名（见 4.4） |

### 1.3 `src/props/misc.js` —— 其它

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawFireLetter(g, o)` | 函数 | D2 火焰字（渐变字 + 火舌 + 光晕 + 拖烟 + 散成火星） |
| `drawFireBreath(g, o)` | 函数 | 火柱/火流（可被剑劈成 V 字）；`wall` 模式 = 火墙擦屏 |
| `drawTumbleweed(g, o)` | 函数 | 纸风滚草（常态 / 烧焦） |
| `drawPetal(g, o)` | 函数 | 心形花瓣（可带一个字，可翻面） |
| `petalOrbit(T, o)` | 函数 | E02 花瓣环的纯计算：每片花瓣的位置、缩放、是否在身后 |
| `drawPetalOrbit(g, T, o)` | 函数 | 按 `petalOrbit` 画花瓣，`part` 分身前 / 身后两层 |
| `drawBanner(g, path, o)` | 函数 | 名字横幅 / 竖幅：沿路径排字、展开、卷尺式回弹、分段画 |
| `BANNER_STYLES` | 常量 | 横幅配色与默认字（见 4.5） |
| `drawBow(g, o)` | 函数 | 婚礼大蝴蝶结（左公主色 / 右勇者色），`pop` 弹出 |
| `drawFireworkShape(g, o)` | 函数 | 爱心 / 星形 / 圆形烟花（粒子炸开后排成形状） |
| `drawHand(g, o)` | 函数 | 讲故事人的纸手（slap / grab、press） |
| `drawShockRing(g, o)` | 函数 | 奶油纸冲击环（两圈墨线） |
| `drawSpeechWave(g, o)` | 函数 | 号声 / 钟声的声波弧线（随 t 循环涌出） |
| `drawBalloonString(g, o)` | 函数 | 气球线（N3 线缠成结） |
| `confettiDraw / sparkDraw / snowDraw / dustDraw / ashDraw / emberDraw` | 函数 | `burst / stream / field` 的粒子外观回调 |
| `heartPath(cx, cy, w, h, rot, round)` | 函数 | 心形 Path2D（花瓣、爱心） |
| `starPath(cx, cy, R, r, n, rot, round)` | 函数 | 圆角星形 Path2D |

## 2. 坐标、尺寸与锚点约定

- **通用**：`drawXxx(g, o)`；`o.x / o.y` 锚点（调用方已 `applyCam`，即世界坐标）；`o.s` 缩放；`o.rot` 弧度（绕锚点）；`o.t` 秒（次级运动，传 `T`）；`o.alpha` 0..1（≤0 直接不画）。函数内部 `save/restore`，不改调用方变换 / 合成模式 / alpha；**不调 `ctx.layer/ctx.mask`**，纸片投影与纸纹由镜头的图层给（`shadow`、`texture`）。少数部件自带很浅的右下错位底片（village 的部件分层底片、告示纸角、贴签、蝴蝶结环与结、纸手的 `cut` 小投影），与图层投影叠加方向一致（右下）。
- **没有 `face` 参数**：本组道具都不做整体镜像（文字类必须正读）。需要朝左的：卷轴用 `dir:-1`（文字仍正读），火流用 `from/to` 方向，火墙用 `dir`，其余道具对称或用 `rot`。
- **所有文字永远正读**：横幅 / 无限卷轴 / 花瓣环里的字旋转夹在 ±15°（0.26 rad）以内；告示、花瓣翻面时背面不显示字（或按纸背透墨镜像淡显）。
- 返回值里的坐标都是**父坐标**（即调用时的坐标系，已含 x/y/s/rot），可直接挂特效、接遮罩、喂 `toScreen`。

| 函数 | 锚点 | s=1 尺寸 | 返回 |
|---|---|---|---|
| `drawNotice` | 纸中心 | 280×200（`NOTICE`） | `{ pins:[[x,y],[x,y]], w, h }`（两颗图钉位置、缩放后宽高） |
| `drawScroll` 'v' | 顶轴中心 | 宽 `width`（300）× 长 `len`（320），木轴长 width+30 | `{ start, end }`（顶轴 / 末端纸卷中心） |
| `drawScroll` 'h' | 起点端（木轴）中心 | 长 `len` × 高 `width`，纸向 +x（`dir:-1` 向 −x） | `{ start, end }` |
| `drawDecree` | 左端中心（左木轴内侧） | `len`（900）× `width`（180），向 +x 展开 | `{ chars:[[x,y]×13], end:[x,y] }`（每个金字中心、右端） |
| `drawPaperRoll` | 卷心 | 半径 `r`（110），侧视长 `len`（360） | `{ y, top, bottom }`（卷心与上下沿 y） |
| `drawPaperRoll` overCamera | **屏幕空间**，忽略 x/y/s | 横贯 2100 宽、高 160 | `{ y, top, bottom }`（屏幕 y） |
| `drawScrollTower` | 塔底中心 | 9 卷，高约 290，卷长 70–120 | 无 |
| `drawInfiniteScroll` | 路径本身（无锚点） | 纸宽 = 每点 `w` 或 `width`（90） | `{ head:[x,y,ang] }`（卷头与切线角） |
| `drawCreditLabel` | 贴签中心 | 560×170 | 无 |
| `drawChest` | 前面底边中心（着地点） | 宽 124、箱体高 64、盖高约 40（big：168 / 84） | `{ mouth:[x,y], lid:[x,y] }`（箱口中心、盖顶） |
| `drawPot` | 底边中心 | 高约 96（罐盖另高 20） | 无 |
| `drawBarrel` | 底边中心 | 高约 110、宽约 96 | 无 |
| `drawFlowerPot` | 底边中心 | 盆高约 70，花再高约 70 | 无 |
| `drawItemIcon` | 图标中心 | 约 64×64 | 无 |
| `drawMishearIcon` | 图标中心 | 约 130×150（道具栏格子 150×200） | 无 |
| `drawFireLetter` | 字形视觉中心 | 字号 `size`（88）× `s` | `{ top:[x,y] }`（字顶，点呆毛用） |
| `drawFireBreath` 火流 | `from`（龙嘴）→ `to` | 半宽 `w0` 22 → `w1` 95 | `{ tip:[x,y], split:[x,y]\|null }` |
| `drawFireBreath` 火墙 | 前沿 `x` | 竖向 `y0..y1`，火幕深 `depth` | `{ edge:[[x,y]…], back, x }` |
| `drawTumbleweed` | 着地点（球底中心） | 半径 `r`（46） | 无 |
| `drawPetal` | 花瓣中心 | 宽 `size`（90）× 0.9 | 无 |
| `drawBanner` | 路径本身 | 带宽 `width`（= size×1.5） | `{ front:[x,y,ang], chars:[{x,y,rot,shown}] }` |
| `drawBow` | 结心 | 约 330×260 | 无 |
| `drawFireworkShape` | 炸点 | 外接宽 `size`（180） | 无 |
| `drawHand` | 手背中心 | 掌宽约 220、指尖到袖口约 480，袖子再向上伸 `sleeve` | `{ palm:[x,y], tips:[[x,y]×5] }`（拇指、小指→食指） |
| `drawShockRing` / `drawSpeechWave` | 圆心 / 发声点 | 半径 `r` / `r0 + gap·n` | 无 |
| `drawBalloonString` | `from`（手 / 嘴） | — | `{ knot:[x,y] }` |

## 3. 函数详解

### 3.1 paper.js

#### `drawNotice(g, o)` —— 告示（b03、b04、b07；`env/plaza.js` 已在调用）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | 0, 0, 1, 0, 1 | 通用 |
| `t` | 0 | 秒（目前只给丑龙涂鸦预留） |
| `face` | `'front'` | `'front'` 正面（勇者招募 + 丑龙 + 金币 ×999）/ `'back'` 牛皮纸背面 |
| `flip` | 0 | 0..1 绕竖轴翻面：scaleX = cos(π·flip)，过 0.5 露出另一面（不镜像），带明暗 |
| `unroll` | 1 | 0..1 从上往下展开，下沿带一根横向小纸卷（0 = 只剩卷着的一卷） |
| `pins` | 2 | 0..2 两颗图钉的按下进度（第 1 颗 = clamp(pins)，第 2 颗 = clamp(pins−1)）；或数组 `[p1, p2]`。只画在正面、已展开区域内 |
| `corners` | false | true = 只剩左右上角两块撕剩的纸角 + 图钉（V01 之后的告示板） |
| `squash` | 0 | 拍上去的挤压（>0 压扁、横向略胀），以上沿为锚 |
| `back` | null | 背面内容回调 `(g, {w, h}) => {}`：已裁到纸内、原点在纸中心、不镜像；交给 `map.drawCrayonMap` |
| `seed` | 3 | 纸边手剪噪声种子 |

返回 `{ pins, w, h }`。

#### `drawScroll(g, o)` —— 卷轴（b04/b05 书记官、b14 捷报、b16 长名卷轴）

两种朝向：
- `orient:'v'` 竖挂：锚 = 顶轴中心；纸向 +y 展开 `len`、宽 `width`；`rows` 横排逐字「写」出（金墨，带笔尖墨点）。
- `orient:'h'` 平铺：锚 = 起点端中心（竖向木轴）；纸向 +x（`dir:-1` 时向 −x）展开 `len`、高 `width`；`items` 沿纸带排布，被末端卷筒盖住的部分不显示。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha, t` | — | 通用 |
| `orient` | `'v'` | `'v'` 竖挂 / `'h'` 平铺 |
| `len` | 320 | 已展开长度（px）；动画就是改它 |
| `width` | 300 | 纸宽（'h' 时是纸高） |
| `dir` | 1 | 仅 'h'：1 向右滚，−1 向左滚（几何镜像，**文字与涂鸦仍正读**） |
| `rollR` | 18 | 末端纸卷半径 |
| `handle` | true | 起点木轴 + 金球 |
| `roll` | true | 末端纸卷 |
| `spin` | `len / rollR` | 纸卷转角（默认随长度滚动） |
| `edge` | `PAL.red` | 两侧红边色 |
| `notes` | 0 | 0..1 页边旧笔记（潦草墨线 + 一行划掉的「达拉崩吧」） |
| `rows` | [] | 'v'：`[{ chars, p=1, size=60, family='display', fill=PAL.gold, under=PAL.goldDark, x=0, y }]`；`y` 默认 72 + i·size·1.28；`p` 0..1 该行写出进度 |
| `text`, `textP` | — | 'v' 的单行简写：等价于 `rows:[{ chars:text, p:textP ?? 1 }]` |
| `doodle` | — | 'v'：`{ y=len−90, p=1, size=1, stampX }` 勇者举剑 + 龙涂鸦，`stampX` 0..1 红叉章砸下 |
| `stampX` | 0 | 'v'：`doodle.stampX` 缺省时用它 |
| `items` | [] | 'h'：见下表 |
| `seed` | 5 | — |

'h' 的 `items`（`at` = 沿展开方向距起点的距离 px）：

| kind | 字段 | 说明 |
|---|---|---|
| `'text'` | `at, chars, y=0, size=min(60, width·0.6), fill=PAL.gold, under=PAL.goldDark, family='display', p=1` | 左对齐从 `at` 开始写；`p` 写出进度 |
| `'doodle'` | `at, y=2, p=1, size=width/140` | 勇者举剑 + 龙涂鸦（`at` 为中心） |
| `'cross'` | `at, y=0, size=width·0.9, p=1` | 红色大叉章，`p` 0..1 砸下（1.9 倍 → 1） |
| `'dots'` | `at, to=len` | 每 18px 一个墨点 |

返回 `{ start, end }`（'v'：顶轴与 len 处；'h'：起点与末端纸卷中心）。

#### `drawDecree(g, o)` —— 圣旨（b05、b06；`env/throne.js` 的 `drawDecreeBanner` 已在调用）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 通用；锚 = 左端中心 |
| `t` | 0 | **必须传默认秒 `T`**：金印按 `t` 与 `prints` 比较出现 |
| `len` | 900 | 全长 |
| `width` | 180 | 纸宽 |
| `unroll` | 1 | 0..1 展开进度；<1 时右端是卷筒（半径 30→14），=1 时是木轴 |
| `parts` | `NAMES.heroParts` | 分段文字（默认 `['达拉崩吧','斑得贝迪','卜多比鲁翁']`）；段数须与 `prints` 一致 |
| `prints` | `[CUES.N4a, CUES.N4b, CUES.N4c]` | 每段金印砸下时刻（默认秒，取自 cues.js：54.00 / 54.68 / 55.71）；段内逐字错峰 0.04s |
| `printDur` | 0.22 | 每字砸下动画时长（1.35 倍 → 1，outBack + 金框闪） |
| `hung` | 0 | 0..1 吊成横幅：两端吊绳升起 + 中部下垂 |
| `sag` | 26 | 吊起后中部下垂 px |
| `ropeH` | 160 | 吊绳高 |
| `sweep` | −1 | 0..1 从左到右扫过金字的闪光位置；<0 不画 |
| `charSize` | 自适应 | 字号，默认 `min(width·0.5, len·0.84/(n·0.8+1.4))` |
| `seed` | 12 | — |

返回 `{ chars, end }`：13 个金字中心（含下垂）——「印章字跳离纸面」从这里起飞；`end` = 当前右端。

#### `drawPaperRoll(g, o)` / `rollOverCameraY(p)` —— 大纸卷（b06）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 通用；锚 = 卷心 |
| `t` | 0 | 秒（`bounceAt` 与端视纸尾飘动用它） |
| `r` | 110 | 半径 |
| `len` | 360 | 侧视长度 |
| `view` | `'side'` | `'side'` 侧视圆柱（表面金字成行绕卷心转）/ `'end'` 端视螺旋 + 松开的纸尾 |
| `spin` | 0 | 转角（rad）；侧视时表面金字随之转过 |
| `chars` | `NAMES.hero` | 表面文字 |
| `bounceAt` | [] | 落台阶时刻数组（秒）：每个时刻后 0.11s 衰减挤压，以卷底为锚 |
| `squash` | 0 | 额外挤压（−0.5..0.5） |
| `overCamera` | — | 0..1：屏幕空间横贯全屏、高 160 的纸卷从下沿滚到上沿（inOutCubic），忽略 x/y/s/r/len |
| `seed` | 21 | — |

`rollOverCameraY(p)` → `{ y, top, bottom }`：与 `overCamera:p` 完全同一公式，只算不画（先做遮罩再画纸卷，免得画两遍）。

#### `drawScrollTower(g, o)` —— 纸卷塔（b16）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 塔底中心 |
| `t` | 0 | 摇晃驱动 |
| `tilt` | **0.4** | 0..1 摇晃幅度（默认就会轻晃；要静止传 0） |
| `lean` | 0 | 静态倾角（rad） |
| `topple` | 0 | 0..1 倒塌：0–0.35 整体倾倒，0.3 起逐卷散落、弹跳、滚到地上 |
| `groundY` | 110 | 散落落地线（相对锚点向下 px） |
| `seed` | 31 | — |

#### `drawInfiniteScroll(g, path, o)` —— 无限卷轴（b17）

`path`：控制点 `[[x,y] | [x,y,w] …]`，从起点到卷头；`w` 为该处纸宽（远处给小值即透视）。内部 `samplePath(path, 8)`。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `p` | 1 | 0..1 展开到路径哪里（卷头带小纸卷，自转） |
| `width` | 90 | 控制点没有 w 时的纸宽 |
| `offset` | 0 | 文字整体沿路径后移 px（跨镜头接续：下一镜头传上一镜头已走过的弧长） |
| `t` | 0 | 卷头纸卷自转 |
| `minPx` | 6 | 屏幕字高（字号 × 当前变换缩放 `scaleOf(g)`）低于它改画点纹 |
| `maxSteep` | 0.78 | 切线 |sin| 超过它（太陡）或往左走的段落不写字、画点纹 |
| `edge` | `PAL.red` | 红边 |
| `alpha` | 1 | — |
| `seed` | 44 | — |

文字序列循环：**王浩然**（大字、red，字号 = 纸宽 0.78）→ 勇者全名 → 公主全名 → 城名 → 龙名（ink，纸宽 0.6）→ 王浩然…；名字之间 goldDark 小圆点。文字从路径起点往卷头排（路径应从左往右走才可读）。返回 `{ head:[x,y,ang] }`。

#### `drawCreditLabel(g, o)` —— 片尾贴签（b17）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s` | — | 锚 = 贴签中心 |
| `rot` | −0.02 | 略歪 |
| `p` | 1 | 0..1 从下方滑上来贴住（outBack 1.4 过冲 = 落定挤压感），≤0 不画 |
| `slide` | 220 | 滑入距离 |
| `lines` | `text.length` | 数字 0..4（逐行，小数 = 当前行进度）或数组 `[q0..q3]`（每行 0..1） |
| `text` | `CREDIT_LINES` | 行文本数组 |
| `w, h` | 560, 170 | 尺寸 |
| `alpha` | 1 | — |

行样式：第 1 行 32px redDark，其余 25px ink，serif，逐字淡入 + 上浮 8px。

#### `samplePath / pathAt / pathSlice` —— 路径工具

- `samplePath(ctrl, step=10)` → `{ pts, L, total }`：Catmull-Rom 过每个控制点，按约 `step` px 重采样；控制点第 3 分量（如宽度）线性插值保留。
- `pathAt(sp, s)` → `[x, y, ang, (w)]`：弧长 `s`（自动夹在 0..total）处的位置、切线角、宽度。
- `pathSlice(sp, s0, s1)` → `[[x,y(,w)] …]`：弧长区间折线（端点插值），s1 ≤ s0 返回 `[]`。

### 3.2 village.js

#### `drawChest(g, o)` —— 宝箱（b08；b06 地图村庄可缩小用）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 前面底边中心（着地点） |
| `t` | 0 | 金光放射线摆动、闪光上浮 |
| `open` | 0 | 0..1 盖子绕后沿翻开约 115°（2.0 rad）；>0 露出金币箱口 + 口部柔光 |
| `big` | false | 大宝箱：168 宽、偏红木、红丝绒内衬、宝石锁 + 爱心宝石 |
| `burst` | 0 | 0..1 金光迸出（光晕 + 11 条放射线 + 上浮闪光）。**不随 open 自动给**，镜头自己写 |
| `seed` | 3 | — |

#### `drawPot / drawBarrel / drawFlowerPot(g, o)` —— 陶罐 / 木桶 / 花盆（b08；木桶也给 b02、b03）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 底边中心 |
| `t` | 0 | 金光、花朵摆动 |
| `open` | 0 | 0..1：陶罐盖弹起 46px 歪倒；木桶盖弹起 52px 翻转；花盆整株连土拔起 58px |
| `burst` | 自动 | 不传时 = `openGlow(open)`（open 0.35 时最亮 1，全开留 0.55）；传数字覆盖 |
| `seed` | 5 / 7 / 9 | — |

#### `drawItemIcon(g, name, o)` —— 道具小图标（b08 飞进背包）

`name`：`'potion'` 药瓶（红药水晃动 + 气泡）/ `'key'` 金钥匙 / `'boots'` 一双靴子 / `'shield'` 蓝底金星盾 / `'hat'` 绿羽毛帽 / `'bag'` 皮背包（**未知名字也画 bag**）。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 中心，s=1 约 64px |
| `t` | 0 | 药水液面与气泡 |
| `glint` | 0 | 0..1 一道小四角星闪光从左上掠到右下 |

#### `drawMishearIcon(g, name, o)` —— 听岔五图标（b10）

`name`：`'card'` 昆特牌 / `'violin'` 提琴 / `'eggtart'` 烤蛋挞 / `'soda'` 苏打 / `'marathon'` 马拉松（未知名字不画）。只画图，名称文字由 `kit.itemBar` 写在格下。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 图标中心，s=1 约 130×150 |
| `t` | 0 | 热气、气泡、牌面光泽、彩带飘、音符闪光 |
| `glow` | 0 | 0..1 高饱和光晕（每件自己的色：card gold / violin ember / eggtart goldLight / soda crystal / marathon skyDay） |
| `pop` | 1 | 0..1 outBack(2.4) 弹入；≤0 不画 |

### 3.3 misc.js

#### `drawFireLetter(g, o)` —— 火焰字（b10）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | 0, 0 | 字形视觉中心 |
| `ch` | `'昆'` | 一个字 |
| `size` | 88 | 字号；最终字高 = size × s |
| `s` | 1 | 缩放 |
| `rot` | 0 | 字的旋转（拖烟不随之转） |
| `t` | 0 | 火舌、闪烁、火星 |
| `vel` | [0, 0] | 速度 px/s：决定拖烟方向（逆速度）与火舌后掠；速度 < 30 不拖烟 |
| `heat` | 1 | 0..1.5 火势（光晕与火舌长度） |
| `tongues` | 4 | 0..6 上沿火舌数 |
| `smoke` | 1 | 0..1 拖烟浓度 |
| `dissolve` | 0 | 0..1 散成火星淡出（113.20 起） |
| `family` | `'display'` | 字体 |
| `alpha, seed` | 1, 1 | 每个字给不同 seed，火舌才不同步 |

返回 `{ top }`。

#### `drawFireBreath(g, o)` —— 火柱 / 火流 / 火墙（b11）

火流模式（默认）：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `from` | [1400, 520] | 起点（龙嘴） |
| `to` | [600, 560] | 终点方向与长度 |
| `p` | 1 | 0..1 喷到哪 |
| `w0, w1` | 22, 95 | 嘴部 / 远端半宽 |
| `t` | 0 | 火焰流动 |
| `intensity` | 1 | 0..1.5 粗细与光晕 |
| `curve` | 0 | 中段弯曲 px（法向） |
| `rise` | 0.06 | 远端上浮比例 |
| `split` | 0 | 0..1 被剑劈开：在 `splitAt` 处分成 V 字两股，间隙随 split 变宽，劈点金光 + 放射线 + 火星 |
| `splitAt` | `to` | 剑刃位置（投影到火流轴上） |
| `splitAngle` | 0.62 | V 字最大半张角 |
| `alpha, seed` | 1, 5 | — |

返回 `{ tip, split }`（火头位置、劈点或 null）。

火墙模式：`o.wall = true`（参数直接写在 o 上）或 `o.wall = { … }`（`t/seed/alpha` 从 o 继承）：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x` | 960 | 火墙前沿 x（动画就是改它） |
| `y0, y1` | −120, 1200 | 竖向范围 |
| `depth` | 560 | 火幕厚度（前沿到 `back`） |
| `dir` | −1 | −1 向左推进（火舌朝左上舔），1 向右 |
| `intensity` | 1 | — |
| `bgY` | [0, 1080] | 火幕渐变 fire2→fire 的 y 范围；剪影段背景用同一渐变即无缝 |
| `t, seed, alpha` | 0, 7, 1 | — |

返回 `{ edge, back, x }`：`back` 以外（火墙身后）由镜头用遮罩接剪影画面。

#### `drawTumbleweed(g, o)` —— 风滚草（b03、b11）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, alpha` | — | 锚 = 着地点（球底中心）；**没有 rot**，转动用 `roll` |
| `r` | 46 | 半径 |
| `roll` | 0 | 滚过的角度 = 滚动距离 / r（朝右滚为正） |
| `t` | 0 | 烧焦版余烬闪烁、冒烟 |
| `charred` | 0 | 0..1 烧焦：焦黑配色 + 余烬 + 头顶黑烟 |
| `squash` | 0 | 0..0.4 落地压扁 |
| `shadow` | true | 脚下椭圆阴影 |
| `seed` | 2 | — |

#### `drawPetal(g, o)` / `petalOrbit(T, o)` / `drawPetalOrbit(g, T, o)` —— 花瓣（b13 E02）

`drawPetal`：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 花瓣中心 |
| `size` | 90 | 宽（高 = 0.9 倍） |
| `ch` | null | 一个字（paperGlyph，ink 色 + 白纸边）；背面不显示 |
| `charSize` | size × 0.64 | 字号 |
| `flip` | 0 | 0..1 绕竖轴翻面，过半露浅色背面 |
| `color / light / ink` | princess / princessLight / princessDark | 配色 |

`petalOrbit(T, o)` 只计算、不画：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `cx, cy` | 960, 620 | 轨道中心（她的腰部，世界坐标） |
| `rx, ry` | 320, 90 | 长 / 短半径 |
| `tilt` | 8°（0.14 rad） | 轨道倾斜 |
| `times` | `NAME_TIMES('E02')` | 每片诞生时刻（161.65 起，步长 0.3118s） |
| `chars` | `NAMES.princess` | 11 个字 |
| `omega` | 自动 | 角速度，默认 11 片铺满约 0.92 圈 |
| `crown` | `{ t0:164.3, t1:164.9, cx, cy:cy−250, Rx:300, Ry:130, scale:0.62 }` | 164.30–164.90 轨道上升收紧，随后各瓣按阅读顺序飞上头顶花环弧（左→右读） |

返回 `[{ i, ch, x, y, s, rot, behind, depth(−1..1), born(0..1), visible }]`（按 i）。诞生点 = 轨道最前方正中；`behind` = 在她身后（缩到 0.7）。

`drawPetalOrbit(g, T, o)`：同 `petalOrbit` 参数，另加 `part:'back'|'front'|'all'`（默认 all）、`size=90`；按 depth 由远到近画，返回画了的项。

#### `drawBanner(g, path, o)` —— 名字横幅 / 竖幅（b15、b16）

`path`：控制点（起点 = 被拿着 / 系着的一端；字从起点往末端按阅读顺序排）。竖直段（|cos(切线)| < 0.45）字不转、从上往下；其余段字跟切线但夹在 ±15°；路径朝左走的段落视为横幅背面。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `style` | `'hero'` | `'hero'` / `'princess'`（见 4.5） |
| `chars` | 该样式的名字 | 字数组或字符串 |
| `size` | 64 | 字号 |
| `width` | size × 1.5 | 带宽 |
| `gap` | size × 0.1 | 横排字距（竖排固定 size × 1.04 一格） |
| `grow` | 1 | 0..1 展开到路径的哪里；展开中末端是小卷筒，展开完是燕尾 |
| `appear` | — | `[0..1]×n` 每字单独出现进度（覆盖 grow 推导的露字），按 `NAME_TIMES` 卡字时用 |
| `retract` | 0 | 0..1 O01 卷尺式弹回起点 |
| `retractT` | retract × retractDur | 回弹开始后的秒数：脱落的字据此旋转飘落（传 `T − 185.47`） |
| `retractDur` | 0.28 | 回弹总时长（只用于脱落时刻推算） |
| `range` | [0, 1] | 只画路径的一段（绕尖塔前后分层） |
| `tail` | true | 末端燕尾（分段画时中间段传 false） |
| `backside` | true | 朝左段落的字淡显 + 镜像（透过纸背看到的墨） |
| `base / edge / ink` | 样式色 | 覆盖底色 / 边色 / 字色 |
| `t, alpha, seed` | 0, 1, 9 | — |

返回 `{ front:[x,y,ang], chars:[{x, y, rot, shown}] }`（front = 展开前沿，鸽子叼着的点）。

#### `drawBow(g, o)` —— 蝴蝶结（b15 184.70）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 结心，s=1 约 330×260 |
| `t` | 0 | 尾巴飘动、环呼吸 |
| `pop` | 1 | 0..1 弹出（outBack 2.8）；≤0 不画 |
| `left / right / edge` | red / skyDayLow / gold | 左环左尾（公主横幅色）/ 右环右尾（勇者横幅色）/ 金边 |
| `seed` | 3 | — |

#### `drawFireworkShape(g, o)` —— 形状烟花（b15、b14 旗顶）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, rot, alpha` | — | 锚 = 炸点 |
| `shape` | `'heart'` | `'heart'` / `'star'` / `'ring'` |
| `size` | 180 | 形状外接宽 |
| `at` | 0 | 炸开时刻（秒，和 `t` 同一时间轴） |
| `t` | 0 | 当前时刻（传 `T`） |
| `life` | 1.7 | 总时长（0.6s 炸开成形，之后下坠淡出） |
| `count` | 48 | 粒子数 |
| `colors` | heart：heart/princess/goldLight；其余：gold/goldLight/crystal | — |
| `seed` | 3 | — |

#### `drawHand(g, o)` —— 讲故事人的纸手（b17）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, rot, alpha` | — | 锚 = 手背中心；右手、手背朝上、从画面上方伸下来 |
| `pose` | `'slap'` | `'slap'` 五指微张按下 / `'grab'` 四指勾住封面边、拇指收在下面 |
| `press` | 0 | 0..1 按压：整体压扁 + 指缝张开 |
| `sleeve` | 700 | 袖长（向上伸出画面） |
| `t, seed` | 0, 15 | — |

返回 `{ palm, tips }`。

#### `drawShockRing(g, o)` —— 冲击环

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | 0, 0 | 圆心 |
| `r` | 200 | 外半径（动画改它；≤1 不画） |
| `width` | r × 0.1（夹 8–34） | 环宽 |
| `alpha` | 1 | — |
| `lw` | 3.2 | 外圈墨线宽（内圈 0.7 倍） |
| `color / ink` | paper / ink | 纸色 / 墨线色 |
| `squash` | 1 | 竖向压扁比（地面冲击用 0.3–0.5） |
| `seed` | 4 | 每圈给不同 seed |

#### `drawSpeechWave(g, o)` —— 声波弧线

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | 0, 0 | 发声点 |
| `dir` | 0 | 朝向（rad，0 朝右） |
| `spread` | 0.62 | 半张角 |
| `n` | 3 | 同时可见的弧数 |
| `r0, gap` | 30, 38 | 起始半径、弧间距 |
| `t, speed` | 0, 1.4 | 循环涌出（每秒 speed 轮） |
| `thick` | 9 | 弧厚 |
| `color / ink` | paper / ink | — |
| `alpha` | 1 | — |
| `alphaBase` | 1 | 额外整体透明度乘子 |

#### `drawBalloonString(g, o)` —— 气球线（b05 N3）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `from` | [0, 0] | 线的汇集端（国王嘴边 / 手） |
| `to` | [] | 每个气球底部 `[[x,y]…]` |
| `knot` | 0 | 0..1 所有线先汇到 `knotAt` 缠成一个结（N3b 50.57） |
| `knotAt` | from→气球重心 35% 处 | 结的位置 |
| `t` | 0 | 线摆动 |
| `color, lw, sag, seed` | inkSoft, 2.2, 0.1, 5 | — |

返回 `{ knot }`。

#### 粒子外观回调 `confettiDraw / sparkDraw / snowDraw / dustDraw / ashDraw / emberDraw`

签名都是 `(g, x, y, s)`，`s` 来自 `core/particles.js`：burst/stream 给 `{ i, age, p, rot, size, r }`（burst 另有 vx/vy），field 给 `{ i, size, r, rot, depth }`（**没有 p / age**）。

| 回调 | 外观 | 用到的 s 字段（缺省） | 适合 |
|---|---|---|---|
| `confettiDraw` | 彩纸（heart/gold/crystal/meadow 轮换，长条 / 方片 / 圆片，翻面露暗面） | i, r, rot, size(10), p（末 20% 淡出） | burst / field |
| `sparkDraw` | 四角星火花（goldLight / 白），随寿命缩小 | r, rot, size(10), p | burst |
| `snowDraw` | 白雪 + snowShade 错位 | size(6), p, depth | field |
| `dustDraw` | 变大变淡的纸色烟团 | size(12), p（缺省 0.3）, r, rot | burst / stream |
| `ashDraw` | 翻滚灰片，前 45% 寿命带焦橙边 | size(9), p, r, rot | burst |
| `emberDraw` | fire2 / goldLight 芯 + fire 光晕，闪烁 | size(4), p, age, i, r | burst / stream |

### 3.4 `heartPath` / `starPath`

- `heartPath(cx, cy, w, h = w·0.9, rot = 0, round = 0)` → Path2D：(cx,cy) 为外接框中心；`round` 0..1 往椭圆圆润化（花瓣用 0.3）。
- `starPath(cx, cy, R, r = R·0.48, n = 5, rot = −π/2, round = 0.16)` → Path2D：圆角星。

## 4. 枚举与常量全表

### 4.1 drawNotice `face`

| 值 | 说明 | 用在 |
|---|---|---|
| `'front'` | 奶油纸、墨框、红字「勇者招募」、丑蜡笔龙、「金币 ×999」 | b03 L06 20.08 拍上告示板 |
| `'back'` | 牛皮纸背面（`back` 回调画蜡笔地图） | b03 25.05–25.35 翻面成地图；b04 腋下卷着的告示 |

### 4.2 drawScroll `orient` / `items.kind`、drawPaperRoll `view`、drawFireworkShape `shape`、drawHand `pose`

| 枚举 | 值 | 说明 | 用在 |
|---|---|---|---|
| `orient` | `'v'` | 竖挂、逐行金墨字 | b14 E06 169.74（三行 169.80 / 170.80 / 171.80） |
| `orient` | `'h'` | 平铺在地滚动展开 | b14 172.60 向右滚、E07 173.05、E08 173.82；b16 O05 193.80 |
| `kind` | `'text' / 'doodle' / 'cross' / 'dots'` | 字 / 勇者 + 龙涂鸦 / 红叉章 / 墨点 | b14 E07 173.05 叉章砸在龙身上 |
| `view` | `'side'` / `'end'` | 侧视圆柱 / 端视螺旋 | b06 58.40–60.20 |
| `shape` | `'heart'` / `'star'` / `'ring'` | 爱心 / 星 / 圆 | b15 184.80–185.40；b14 旗顶小烟花、168.40 金色烟花 |
| `pose` | `'slap'` / `'grab'` | 按住书页 / 抓封面边 | b17 O08 199.66 slap；199.95–200.30 grab |

### 4.3 drawItemIcon `name`

| 值 | 说明 | 用在（b08 V10） |
|---|---|---|
| `'potion'` | 红药水瓶 | 宝箱 92.00 |
| `'key'` | 金钥匙（爱心宝石） | 陶罐 92.35 |
| `'boots'` | 一双靴子 | 木桶 92.70 |
| `'shield'` | 蓝底金星盾 | 花盆 93.05 |
| `'hat'` | 绿帽 + 红羽 | 大宝箱 93.40 |
| `'bag'` | 皮背包（金币扣） | HUD 小背包（道具飞进去、鼓一下） |

### 4.4 drawMishearIcon `name` 与 `MISHEAR_NAMES`

`MISHEAR_NAMES = { card:'昆特牌', violin:'提琴', eggtart:'烤蛋挞', soda:'苏打', marathon:'马拉松' }`

| 值 | 说明 | 用在（b10 `b10_mishear`） |
|---|---|---|
| `'card'` | 昆特牌：红边金框，王冠压交叉双剑，后面一张牌背 | M1 113.83 |
| `'violin'` | 提琴：漆木琴身、f 孔、四弦、琴弓 | 114.52 |
| `'eggtart'` | 烤蛋挞：花边酥皮、coin 蛋液、焦斑、三缕热气 | M2 115.21 |
| `'soda'` | 苏打：冰蓝玻璃瓶、柠檬标签、红白吸管、气泡 | 115.71 |
| `'marathon'` | 马拉松：heroBlue 跑鞋 + 被冲断的红色终点线（传说级） | M3 116.21 |

R1 117.20–117.60 烧掉道具栏由 `kit.itemBar` 的 `burn` 负责（边后不画），灰片用 `ashDraw`。

### 4.5 `BANNER_STYLES`

| 键 | base | edge | ink | 默认字 | 用在 |
|---|---|---|---|---|---|
| `hero` | skyDayLow | gold | heroBlueDark | `NAMES.hero`（13 字） | b15 E12 181.66 纸鸽拉开、184.40 绕尖塔、184.70 系结；b16 O01 回弹 |
| `princess` | red | gold | paper（奶油字） | `NAMES.princess`（11 字） | b15 E10 177.76 竖幅（竖排 → 落地横排、179.60 舞龙）；b16 O01 回弹 |

### 4.6 `CREDIT_LINES`（片尾署名四行）

| 行 | 内容 | 出现（b17） |
|---|---|---|
| 1 | `原曲《达拉崩吧》` | 203.30 |
| 2 | `词曲：ilem` | 203.60 |
| 3 | `演唱：洛天依 / 言和` | 203.90 |
| 4 | `纸艺代码动画` | 204.20 |

### 4.7 `NOTICE`

`{ w: 280, h: 200 }`：告示 s=1 尺寸（广场告示板板面 300×220，中心 (1080,560)）。

### 4.8 其它状态参数速查（块 / cue）

| 函数.参数 | 用在 |
|---|---|
| `drawNotice.unroll / pins / squash` | b03 L06 20.08–20.18 展开 + 两颗图钉 + 挤压，20.10 dustDraw burst |
| `drawNotice.flip / rot / s` | b03 L08 24.60 崩钉翻滚扑镜（rot −20°→+8°、放大 5 倍）、25.05–25.25 flip 0→1 |
| `drawNotice.corners` | b07 V01 74.40 告示板只剩两个纸角 |
| `drawDecree.unroll` | b05 53.95 书记官从右跑进来展开 |
| `drawDecree.prints`（默认值） | b05 N4a 54.00 / N4b 54.68 / N4c 55.71 |
| `drawDecree.hung / sweep` | b05 56.20–56.80 吊成横幅、56.60 扫光；b06 56.89–57.40 扫光走完 |
| `drawPaperRoll.bounceAt / spin` | b06 58.65 / 58.85 / 59.05 弹台阶，58.60–60.20 滚向镜头 |
| `drawPaperRoll.overCamera` | b06 60.20–60.50 碾过镜头 |
| `drawScrollTower.tilt / topple` | b16 194.70 背着进来（tilt）、196.80 塔倒（topple） |
| `drawInfiniteScroll.p` | b17 O07 198.05 射出、198.70–199.50 沿山路铺向天边；200.40–201.20 p 回落 = 卷回 |
| `drawCreditLabel.p / lines` | b17 202.80–203.20 滑上，203.30 起逐行 |
| `drawChest.open / burst / big` | b08 V10 92.00、93.40（big） |
| `drawFireLetter.vel / dissolve` | b10 D2a 109.76、D2b 111.69、113.20 起散成火星 |
| `drawFireBreath.split` | b11 121.60 火柱、121.70–122.40 劈成 V 字 |
| `drawFireBreath.wall` | b11 127.20–127.45 火墙擦屏 |
| `drawTumbleweed` / `.charred` | b03 21.30–22.00 常态从左往右；b11 136.90–137.60 烧焦版从右往左 |
| `petalOrbit` | b13 E02 161.65，164.30–164.90 收成花环 |
| `drawBanner.retract` | b16 O01 185.47–185.75 |
| `drawBow.pop` | b15 184.70 |
| `drawHand.press` | b17 O08 199.66 按下（shake 10） |
| `drawShockRing` | b03 L08 24.11 三圈冲击环 |
| `drawSpeechWave` | b14 E05 168.83 号声；b15 177.30 钟声；b05 55.75 传令官吹号 |
| `drawBalloonString.knot` | b05 N3 [49.83, 53.10)，N3b 50.57 缠成结 |

## 5. 推荐用法

### 5.1 告示拍上 → 崩钉扑镜 → 翻面成地图（b03）

```js
import { drawNotice } from '../props/paper.js';
import { dustDraw } from '../props/misc.js';
import { burst } from '../core/particles.js';
import { applyCam } from '../core/camera.js';
import { seg, hit } from '../core/util.js';
import { drawCrayonMap } from '../env/map.js';

ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const k = seg(T, 20.08, 20.18);                       // 展开
  drawNotice(lg, {
    x: 1080, y: 560, t: T,
    unroll: k, pins: seg(T, 20.12, 20.2) * 2,
    squash: hit(T, 20.10, 0.08) * 0.12,
    flip: seg(T, 25.05, 25.25),                          // 过半露出牛皮纸背面
    // 背面回调：原点在纸中心、已裁到纸内、不镜像。示意：把整屏蜡笔地图缩进 280×200 的纸面（地图坐标系以 env/map.js 为准）
    back: (bg, { w, h }) => { bg.scale(w / 1920, h / 1080); bg.translate(-960, -540); drawCrayonMap(bg, T); },
  });
});
ctx.layer(g, {}, (lg) => {
  applyCam(lg, c, 1);
  burst(lg, T, { at: 20.10, seed: 3, count: 18, x: 1080, y: 660, spread: 120, speed: [60, 200], angle: [-2.8, -0.3], gravity: -40, life: [0.6, 1.0], size: [14, 26] }, dustDraw);
});
```

### 5.2 圣旨三段金印 + 吊成横幅（b05；`t` 必须是默认秒）

```js
import { drawDecree } from '../props/paper.js';
import { ez, glide, inOutCubic } from '../core/ease.js';
import { applyCam, toScreen } from '../core/camera.js';
const res = { chars: [] };
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  Object.assign(res, drawDecree(lg, {
    x: 700, y: 730, len: 900, width: 180, t: T,          // prints 默认 = CUES.N4a / N4b / N4c
    unroll: ez(T, 53.95, 54.2, glide),
    hung: ez(T, 56.2, 56.8, inOutCubic),
    sweep: T >= 56.6 ? (T - 56.6) / 0.8 : -1,
  }));
});
// res.chars[i] 是第 i 个金字的世界坐标 → toScreen(c, 1, ...res.chars[i]) 作为印章字起飞点
```

### 5.3 纸卷弹台阶 → 碾过镜头（b06）

```js
import { drawPaperRoll, rollOverCameraY } from '../props/paper.js';
import { seg } from '../core/util.js';
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  drawPaperRoll(lg, { x: rollX, y: rollY, r: 110, len: 380, spin: rollX / 110, t: T, bounceAt: [58.65, 58.85, 59.05] });
});
// 碾镜：先按同一公式遮罩出纸卷下方的片名页，再在最上层画纸卷（屏幕空间，不 applyCam）
const p = seg(T, 60.2, 60.5);
const { y } = rollOverCameraY(p);
ctx.mask(g, (mg) => mg.fillRect(0, y, 1920, 1300), (lg) => drawTitlePage(lg, T));   // drawTitlePage = 片名页（book / type 组）
ctx.layer(g, { shadow: 10, texture: 0.25 }, (lg) => drawPaperRoll(lg, { overCamera: p, t: T }));
```

### 5.4 火焰字连珠炮 + 散成火星（b10）

```js
import { drawFireLetter } from '../props/misc.js';
import { NAME_TIMES } from '../ui/type.js';
import { ez, outExpo } from '../core/ease.js';
import { lerp, seg } from '../core/util.js';
const chars = [...'昆图库塔卡提考特'], times = NAME_TIMES('D2a');
ctx.layer(g, { texture: 0.15 }, (lg) => {            // 火焰字不给纸片投影，避免黑影压暗火光
  chars.forEach((ch, i) => {
    const k = ez(T, times[i], times[i] + 0.5, outExpo);
    if (T < times[i]) return;
    const x = lerp(1380, 150 + i * 92, k), y = lerp(520, 300, k);
    const vx = (150 + i * 92 - 1380) * (1 - k) * 2;     // 近似速度（px/s），驱动拖烟
    drawFireLetter(lg, { x, y, ch, size: 86, t: T, seed: i + 1, vel: [vx, 0], dissolve: seg(T, 113.2, 113.8) });
  });
});
```

### 5.5 粒子回调搭配 burst / stream / field

```js
import { burst, stream, field } from '../core/particles.js';
import { confettiDraw, sparkDraw, snowDraw, dustDraw, ashDraw, emberDraw } from '../props/misc.js';

ctx.layer(g, { shadow: 3 }, (lg) => {
  // N4c 55.75 礼炮彩纸（burst 120）
  burst(lg, T, { at: 55.75, seed: 11, count: 120, x: 300, y: 700, speed: [500, 1100], angle: [-1.4, -0.6], gravity: 700, drag: 1.6, life: [1.6, 2.4], spin: [-9, 9], size: [9, 15] }, confettiDraw);
  // 婚礼彩纸如雨（field，循环）
  field(lg, T, { seed: 5, count: 80, vy: 120, sway: 30, size: [8, 13] }, confettiDraw);
});
ctx.layer(g, {}, (lg) => {
  // V11 风雪（field，横吹）
  field(lg, T, { seed: 2, count: 140, vx: -500, vy: 60, sway: 6, size: [4, 9] }, snowDraw);
  // L03 火星（burst）+ 火雨尾烟（stream）
  burst(lg, T, { at: 14.18, seed: 4, count: 30, x: 1140, y: 420, speed: [120, 420], angle: [-2.9, -0.2], gravity: 300, life: [0.6, 1.2], size: [3, 6] }, emberDraw);
  stream(lg, T, { start: 14.3, end: 15.2, rate: 30, seed: 6, life: [0.4, 0.8], size: [12, 22],
    emit: (tb, i, r) => ({ x: 1700 - (tb - 14.3) * 900, y: 100 + (tb - 14.3) * 500, vx: -40, vy: -30 }) }, dustDraw);
  // R1 道具栏烧成灰片 / 200.30 合书喷纸灰 + 金色浮尘
  burst(lg, T, { at: 200.3, seed: 8, count: 40, x: 960, y: 620, spread: 300, speed: [80, 260], angle: [-3.0, -0.1], gravity: -20, life: [0.9, 1.5], size: [7, 12] }, ashDraw);
  burst(lg, T, { at: 200.3, seed: 9, count: 24, x: 960, y: 600, spread: 260, speed: [40, 140], angle: [-3.0, -0.1], gravity: -60, life: [1.0, 1.6], size: [8, 12] }, sparkDraw);
});
```

### 5.6 横幅 + 路径工具 + 无限卷轴（b15 / b16 / b17）

```js
import { drawBanner } from '../props/misc.js';
import { drawInfiniteScroll, samplePath, pathAt } from '../props/paper.js';
import { NAME_TIMES } from '../ui/type.js';
import { ez, glide } from '../core/ease.js';
import { seg } from '../core/util.js';

// E12 勇者横幅：鸽子叼着 front 飞；按附录 A 逐字露出（drawDove / drawSpire 是别组的函数，这里只示意调用位置）
const times = NAME_TIMES('E12');
const res = drawBanner(lg, heroPath, { style: 'hero', size: 60, grow: ez(T, 181.66, 184.3, glide),
  appear: times.map((tt) => seg(T, tt, tt + 0.2)), t: T });
drawDove(lg, { x: res.front[0], y: res.front[1] });   // 其它组的纸鸽

// 绕尖塔一圈：后半圈在尖塔层之前画、前半圈之后画
drawBanner(back, loopPath, { style: 'hero', size: 34, range: [0.25, 0.75], t: T });
drawSpire(mid);
drawBanner(front, loopPath, { style: 'hero', size: 34, range: [0, 0.25], tail: false, t: T });
drawBanner(front, loopPath, { style: 'hero', size: 34, range: [0.75, 1], t: T });

// O01 卷尺式回弹：字脱落飘下
drawBanner(lg, heroPath, { style: 'hero', size: 60, retract: seg(T, 185.47, 185.75), retractT: Math.max(0, T - 185.47), t: T });

// 无限卷轴沿山路铺向天边：第三个分量是纸宽（远处变窄 = 透视）
const road = [[960, 880, 120], [1180, 930, 90], [1400, 990, 60], [1700, 1080, 30], [2050, 1160, 8]];
const r2 = drawInfiniteScroll(lg, road, { p: ez(T, 198.7, 199.5, glide), t: T });
// 想在卷头挂东西：r2.head = [x, y, ang]；任意弧长取点：pathAt(samplePath(road, 8), s)
```

### 5.7 纸手合书 + 贴签（b17）

```js
import { drawHand, drawShockRing } from '../props/misc.js';
import { drawCreditLabel } from '../props/paper.js';
import { ez, inQuad } from '../core/ease.js';
import { lerp, seg, hit } from '../core/util.js';
ctx.layer(g, { shadow: 14, texture: 0.3 }, (lg) => {
  const slap = T < 199.95;
  drawHand(lg, { x: 980, y: slap ? lerp(-300, 420, ez(T, 199.55, 199.66, inQuad)) : 420, s: 0.9,
    pose: slap ? 'slap' : 'grab', press: hit(T, 199.66, 0.12) });
});
ctx.layer(g, { shadow: 4, texture: 0.3 }, (lg) => {
  const ln = [203.3, 203.6, 203.9, 204.2].map((tt) => seg(T, tt, tt + 0.3));
  drawCreditLabel(lg, { x: 960, y: 780, p: seg(T, 202.8, 203.2), lines: ln });
});
```

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际 |
|---|---|---|
| `drawScroll` | `len, dir, rollR, text, notes, doodle, stampX` | 增加 `orient:'v'\|'h'`；'v' 用 `rows`（`text/textP` 为单行简写），'h' 用 `items`（text/doodle/cross/dots）；`dir` 只对 'h' 生效；文字由内部逐字写出（不走 `type.scrollInk`） |
| `drawDecree` | `unroll, prints[3], hung` | 另有 `parts`（分段文字）、`printDur`、`sag`、`ropeH`、`sweep`、`charSize`、`len`、`width`；`prints` 默认取 `CUES.N4a/N4b/N4c`；返回 13 个金字坐标 |
| `drawPaperRoll` | `r, spin, bounceAt[], overCamera` | 另有 `len, view:'side'\|'end', chars, squash`；新增 `rollOverCameraY(p)` |
| `drawScrollTower` | `tilt, topple` | 另有 `lean, groundY`；`tilt` 默认 0.4（默认就会摇） |
| `drawInfiniteScroll` | `p`，字高 < 6px 改点纹 | 另有 `width, offset, minPx, maxSteep, edge`；路径太陡或朝左的段也画点纹 |
| `drawCreditLabel` | `p` | 另有 `lines, slide, text, w, h, rot` |
| `drawNotice` | `face, flip, unroll, pins, corners` | 另有 `squash, back`（背面内容回调）、`pins` 可传数组；返回图钉坐标 |
| `drawChest` 等 | `open, big, burst` | 陶罐 / 木桶 / 花盆也有 `burst`，且不传时随 `open` 自动迸光；宝箱的 `burst` 不自动 |
| `drawItemIcon` | 6 种 | 一致；另有 `glint`；未知名字画 bag |
| `drawMishearIcon` | 5 种 | 一致；另有 `glow, pop` |
| `petalOrbit` | 返回位置 / 缩放 / 是否在身后 | 一致；另导出 `drawPetalOrbit(g, T, o)` 直接画 |
| `drawBanner` | 沿路径排字走 `type.glyphsOnPath` | 内部自己排字（为了竖排 / 拐弯 / 背面 / 回弹脱落）；另有 `appear, range, tail, backside, retractT, retractDur, width, gap` |
| `drawFireBreath` | `split`、`wall` | 火流参数 `from/to/p/w0/w1/curve/rise/splitAt/splitAngle/intensity`；火墙返回 `edge/back` 供遮罩 |
| `drawFireworkShape` | 爱心 / 星形 | 另有 `'ring'`；时间用 `at` + `t` |
| `drawHand` | `pose, press` | 另有 `sleeve`；返回指尖坐标 |
| `drawShockRing` | `r, alpha` | 另有 `width, lw, color, ink, squash` |
| `drawSpeechWave` 透明度 | — | 收尾时修正：弧的透明度乘在调用方当前 `globalAlpha` 上（原来会覆盖成 a·alphaBase）；调用方 alpha=1 时画面不变 |
| 新增导出 | — | `samplePath / pathAt / pathSlice`、`heartPath / starPath`、`NOTICE`、`CREDIT_LINES`、`BANNER_STYLES`、`MISHEAR_NAMES`、`drawPetalOrbit`、`rollOverCameraY` |
| 颜色 | storyboard 第 2 节写「公主横幅 princessLight 底」 | 按 b15 E10 分镜正文用 red 底 / gold 边 / 奶油字（`BANNER_STYLES.princess`）；要粉彩版传 `base: PAL.princessLight, ink: PAL.princessDark` |

## 7. 已知限制与注意事项

- **时间轴**：`drawDecree.prints`、`drawPaperRoll.bounceAt`、`drawFireworkShape.at`、`petalOrbit.times/crown` 都是默认秒；镜头必须把 `T` 传给 `t`（模型图里用的是 lt 时要换算）。`drawDecree` 不传 `t` 时一个字都印不出来（t=0 早于所有印时）。
- **告示的几个中间态**：`unroll:0` = 卷成一卷（b04 勇者腋下夹着的就是它）；`pins` 从 2 回到 0 = 反向播放按下动画（图钉放大淡出），要「崩飞」的钉子请镜头另画一颗飞出去；`face:'back'` 时不画图钉。
- **`drawDecree` 段数**：`parts` 与 `prints` 要等长；字位按全长 `len` 排好再被 `unroll` 揭开（展开时字不会挤）。
- **`overCamera`** 是屏幕空间：画它的图层**不要** `applyCam`。纸卷宽 2100、x 居中 960，不随机位走。
- **性能**：`drawFireBreath`（每道约 4 层火焰带 + 6–20 条火舌 + 24 颗火星）与火墙（约 50 条火舌 + 40 颗火星 + 7 个光晕）是本组最重的；同屏两道劈开火流 ≈ 6 道火焰带，建议整组放进一个图层。`drawFireLetter` 每字 3 次 paperGlyph + 光晕，13 字同屏可以接受；拖烟每字 7 个 blob。`drawInfiniteScroll` 每帧重采样路径（O(路径长/8)），远处点纹很便宜。`drawTumbleweed` 22 条纸条，同屏 ≤ 5 个为宜。
- **光晕混合**：`glow` 默认 screen；火焰字 / 火流 / 宝箱金光在浅色纸底上会发白，暗底效果最好。火焰类不建议给图层 `shadow`（投影会压暗火光），给 `texture` 0.1–0.15 即可。
- **听岔图标烧毁**：`drawMishearIcon` 没有烧焦态；R1 由 `kit.itemBar({ burn, drawIcon })` 处理（边后不画），灰片用 `ashDraw`。接法：`drawIcon: (g, kind, x, y, size) => drawMishearIcon(g, kind, { x, y, s: size / 150, t: T, glow: 0.8 })`。
- **宝箱是斜投影假三维**：适合正面 ±15° 的机位，`rot` 大于约 0.3 会露出投影不一致；`face` 不支持（不要用负的 `s`）。
- **`drawScroll` 'h' 的 `dir:-1`**：几何镜像，文字 / 涂鸦 / 叉章各自保持正读；`text` item 的 `at` 对应文字的起点（靠近木轴的一端），文字向远离木轴方向延伸。
- **`drawInfiniteScroll`**：文字从路径**起点**开始排，`王浩然` 永远在起点那头；路径要从左往右走才能正读（朝左的段自动画点纹）。跨镜头接续用 `offset`。
- **`drawBanner` 竖排**：|cos(切线)| < 0.45 判为竖直段，路径接近 65° 的斜段会在横排 / 竖排之间切换，避免长时间停在那个角度；`backside` 段的字镜像淡显，`chars[i].shown` 为 false。
- **`drawBanner` 的 `retract`**：起点固定，前沿沿原路退回；脱落的字飘落轨迹由 `retractT` 驱动（不传则用 `retract × retractDur` 推算，只适合 retract 线性变化）。
- **花瓣环收花环的时长**：分镜写 164.30–164.90 结成花环，但附录 A 里最后一片「红」164.77 才诞生；`petalOrbit` 让每片至少在轨道上转 0.14s 再飞，所以「红」164.91 起飞、约 165.25 落位（b13 出场 165.35 之前、围巾擦屏期间完成）。要更早收齐就传 `crown:{ t0, t1 }` 往前挪，或给 `times` 压缩后的时刻。
- **`drawHand`** 只有右手、手背视角；`grab` 时四指缩短 38% 并下勾。
- **`drawSpeechWave`** 每道弧都要描边，n ≤ 5 为宜。
- **粒子回调**：`field` 不提供 `p/age`，`dustDraw/ashDraw` 会按 p=0.3 画（固定大小、不淡出），在 field 里请改用 `confettiDraw / snowDraw / sparkDraw`。

## 8. 模型图清单

| 模型图源码 | 镜头 id（区间秒） | 最终渲染（`out/review/sheets/<名>/`） |
|---|---|---|
| `src/sheets/props_paper.js` | `sheet_paper_notice`(0–2) / `sheet_paper_scroll`(2–4) / `sheet_paper_decree`(4–6) / `sheet_paper_overcam`(6–8) / `sheet_paper_tower`(8–10) | `final_t1.50.png` 告示全状态 · `final_t3.95.png` 卷轴（竖挂 / 平铺 / dir −1） · `final_t5.50.png` 圣旨印到第二段（N4b 后、N4c 前） · `final_t5.95.png` 三段全印 + 吊幅扫光 + 大纸卷 · `final_t7.00.png` 碾过镜头 · `final_t9.50.png` 纸卷塔 / 无限卷轴 / 贴签 |
| `src/sheets/props_village.js` | `sheet_village_icons`(0–2) / `sheet_village_containers`(2–4) / `sheet_village_anim`(4–6) | `final_t0.50.png` 听岔五图标 + 道具小图标 · `final_t2.50.png` 容器 open 各档 · `final_t4.50.png` 开箱循环 + 图标弹入 |
| `src/sheets/props_misc.js` | `sheet_misc_fireletter`(0–2) / `sheet_misc_firebreath`(2–4) / `sheet_misc_firewall`(4–6) / `sheet_misc_petals`(6–8) / `sheet_misc_banner`(8–10) / `sheet_misc_hand`(10–12) | `final_t0.50.png` 火焰字 · `final_t2.90.png` 火流 + 劈火 · `final_t5.00.png` 火墙擦屏 · `final_t6.90.png` 风滚草 / 花瓣 / 花瓣环 / 蝴蝶结 / 烟花 · `final_t7.95.png` 花瓣环收成花环 · `final_t9.50.png` 横幅 · `final_t10.80.png` 纸手 / 冲击环 / 声波 / 气球线 / 粒子回调 |

自检命令：

```bash
./tools/lint.sh src/props/paper.js src/props/village.js src/props/misc.js src/sheets/props_paper.js src/sheets/props_village.js src/sheets/props_misc.js docs/api/props.md
node tools/check.mjs sheets --list props_paper,props_village,props_misc
node tools/render.mjs stills --sheet props_paper   --times 1.5,3.95,5.5,5.95,7.0,9.5          --outdir out/review/sheets/props_paper   --prefix final_
node tools/render.mjs stills --sheet props_village --times 0.5,2.5,4.5                        --outdir out/review/sheets/props_village --prefix final_
node tools/render.mjs stills --sheet props_misc    --times 0.5,2.9,5.0,6.9,7.95,9.5,10.8      --outdir out/review/sheets/props_misc    --prefix final_
```
