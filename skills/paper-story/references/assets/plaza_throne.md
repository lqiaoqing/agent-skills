# 城下广场与王座厅（plaza_throne）API

> 源码：`src/env/plaza.js`、`src/env/throne.js`；玫瑰窗/圆窗共用 `src/env/roundwindow.js`（共享文件，本组只读）。
> 规格：`docs/assets.md` 8.3、8.5；布局：`docs/storyboard.md` 4.3、4.5。所有参数名均按源码核对。

## 1. 模块与导出一览

### src/env/plaza.js

| 名称 | 类型 | 用途 |
|---|---|---|
| `drawPlaza(g, T, cam, o)` | 函数 | 画广场的一层（sky / far / mid / main / fg / light） |
| `drawGateArch(g, T, o)` | 函数 | V04 换景用的前景城门拱（屏幕空间、盖满全高） |
| `PLAZA` | 常量 | 布局坐标（地面线、告示板、水井、城门、光圈、人群站位…） |
| `CAMS` | 常量 | 预设机位 PL_W / PL_BOARD / PL_HERO / PL_HERO_CU / PL_GATE + 附加 PL_TOP / PL_CROWD / PL_SCARF / PL_HOPE |
| `PLAZA_DEPTH` | 常量 | 各层视差深度 |
| `plazaDepth(layer, flat)` | 函数 | 某层在 flat 下的实际深度 |
| `plazaToScreen(c, layer, x, y, flat)` | 函数 | 某层世界坐标 → 屏幕坐标 |
| `PLAZA_LAYER` | 常量 | 推荐的 `ctx.layer` 参数（far / mid / main / fg） |
| `PAL` | 再导出 | 同 `core/paper.js` 的 PAL（历史遗留，场景请直接从 paper.js 导入） |

### src/env/throne.js

| 名称 | 类型 | 用途 |
|---|---|---|
| `drawThroneRoom(g, T, cam, o)` | 函数 | 画王座厅的一层（back / mid / main / fg / glow） |
| `THRONE` | 常量 | 布局坐标（地面、红毯、门、窗、玫瑰窗、月亮、柱、台阶、王座、站位…） |
| `CAMS` | 常量 | 预设机位 TR_W / TR_2S / TR_HERO / TR_KING / CU_H / CU_K / TR_HIGH / TR_ROSE / TR_NIGHT / TR_RULER + 附加 TR_NAME / TR_KING2S / TR_SEAL / TR_SEAL2 / TR_LOW / TR_HERALD / TR_SCROLL |
| `THRONE_DEPTH` | 常量 | 各层视差深度 |
| `throneDepth(layer, flat)` | 函数 | 某层在 flat 下的实际深度 |
| `throneToScreen(c, layer, x, y, flat)` | 函数 | 某层世界坐标 → 屏幕坐标 |
| `roseCam(sx, sy, r, flat)` | 函数 | 反解机位：让玫瑰窗落在屏幕 (sx,sy)、屏幕半径 r |
| `throneMoonScreen(c, flat)` | 函数 | 右尖拱窗月亮在机位 c 下的屏幕 [x, y, r] |
| `rulerY(h)` | 函数 | 身高刻度：孩子身高 h 在 TR_RULER 下对应柱上（mid 层）的 y |
| `THRONE_LAYER` | 常量 | 推荐的 `ctx.layer` 参数（back / mid / main / fg） |
| `throneLayer(layer, light)` | 函数 | 按光照给图层参数（夜景纸纹降到 0.1、投影更实） |

### src/env/roundwindow.js（共享，只读）

| 名称 | 类型 | 用途 |
|---|---|---|
| `drawRoundWindow(g, {x, y, r, face, glow, t, seed})` | 函数 | 8 瓣圆窗；王城主堡圆窗（face:'out'）与王座厅玫瑰窗（face:'in'）共用，保证 E05 / b14→b15 / O07 内外匹配。storyboard 里写的 `drawRoseWindow` 指的就是它 |

## 2. 坐标、尺寸与锚点约定

- **世界坐标 = 该地点主体层（main，depth 1）坐标**；`cam(960,540,1)` 时与屏幕重合。各层函数内部自己 `applyCam(g, cam, depth)`，镜头只负责把每层包进 `ctx.layer`。
- **深度**：
  - PLAZA：`sky 0.05`（天空渐变）、`cloud 0.2`（云，属 sky 层）、`far 0.4`、`mid 0.8`、`main 1`、`fg 1.35`；`light` 为屏幕空间。
  - THRONE：`back 0.55`、`mid 0.8`、`main 1`、`fg 1.38`；`glow` 为屏幕空间。
- **flat**：`true` 或 0..1，把所有层的深度朝 1 拉平（1 = 完全冻结视差）。`throneDepth/plazaDepth(layer, flat)` 给出实际深度；`throneToScreen/plazaToScreen` 已考虑 flat。
- **角色比例**：PLAZA、THRONE 里角色一律 `s = 1`（勇者 260、国王 220+王冠 45…）。脚底线：PLAZA `groundY = 860`；THRONE `floorY = 880`（国王站在台阶顶 (1500,790)、坐在王座 (1580,660)）。
- **镜像**：布景不做 face 镜像；`rose.face` 是玻璃“朝里 in / 朝外 out”，不是左右翻转。
- **返回值**（每次调用都返回，坐标都是当前机位下的**屏幕坐标**）：
  - `drawPlaza` → `{ balcony:[x,y], light:[x,y], board:[x,y,w,h], gate:[x0,y0,x1,y1] }`：远景阳台小国王位置（脚底上方约 40 个 CASTLE 单位）、光圈中心、告示板板面矩形、城门拱洞外接框。
  - `drawGateArch` → `{ seam, left:[x0,x1], opening:[x0,x1], right:[x0,x1] }`（屏幕 x）：换景接缝（左墩中线）、左墩、拱洞、右墩的范围。
  - `drawThroneRoom` → `{ rose:[x,y,r], moon:[x,y,r], star:[x,y], decree? }`：玫瑰窗中心与屏幕半径、右窗月亮（不管窗里画不画月亮都返回）、王座星形顶饰；传了 `o.decree` 时多一个 `decree:{ chars:[[x,y]×13], end:[x,y] }`（圣旨 13 个字位与右端，屏幕坐标）。
- 返回值只由机位与参数算出，与“这次画的是哪一层”无关；镜头可以只取其中一层调用的返回值。


## 3. 函数详解

### 3.1 drawPlaza(g, T, cam, o) → `{ balcony, light, board, gate }`

镜头先把每层包进 `ctx.layer`，函数内部自己 `applyCam`。`sky`、`light` 两层直接画在 `g` 上（sky 整屏不透明，当底；light 是屏幕空间的加光）。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `layer` | `'main'` | `'sky'`（天空 0.05 + 云 0.2）/ `'far'`（0.4）/ `'mid'`（0.8）/ `'main'`（1）/ `'fg'`（1.35）/ `'light'`（屏幕空间）。未知值按 main 画 |
| `time` | `'morning'` | `'gray'` / `'beam'` / `'morning'`，未知值按 morning |
| `beamAt` | `22.11` | beam 时云缝裂开的时刻（**与 T 比较**）：云 0.7s 分开，光柱 0.6s 淡入 |
| `notice` | `'none'` | `'none'`（只剩旧告示残角 + 图钉孔）/ `'full'`（整张告示「勇者招募」）/ `'corners'`（只剩两个纸角） |
| `noticeOpts` | `{}` | 原样并入 `props/paper.js` 的 `drawNotice` 参数：`unroll` 0..1（从上往下展开）、`pins` 0..2、`squash`（拍上去的挤压）、`flip` 0..1、`face`、`back` 等 |
| `farKing` | 按 time：gray→`'holdHead'`、beam→`'leanForward'`、morning→`'idle'` | 远景阳台小国王姿势；`null` 或 `'none'` 不画；`{from,to,k}` 时 k<0.5 取 from，否则取 to（不插值） |
| `lightCircle` | `0` | 0..1，地面光圈（中心 x=520，main 层） |
| `shockAt` | 无 | L08 喊声冲击时刻（与 `t` 比较）：彩旗猛甩（0.6s 衰减）、左下木桶 +0.08s 翻倒后滚开、右下花箱花瓣 +0.05s 吹飞、水井吊桶晃 |
| `alarm` | `time !== 'morning'` | 远景王城告急：阳台红灯笼脉冲、4/5 号塔烽火、塔旗发灰 |
| `beaconAt` | 无（=一直点着） | `[t4, t5]`：4、5 号塔烽火点燃时刻（**与 T 比较**，0.3s 长成） |
| `flat` | `0` | `true` 或 0..1，冻结视差 |
| `t` | `T` | 次级运动秒（云飘、炊烟、旗、吊桶、火苗） |

返回值见第 2 节。

### 3.2 drawGateArch(g, T, o) → `{ seam, left, opening, right }`

前景城门拱，**屏幕空间**（不吃机位），盖满全高（y −80…1180）。建议包进 `ctx.layer(g, { blur: 3, shadow: 14 }, …)`。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x` | `960` | 左墩中线（= 换景接缝）的屏幕 x；给了 `x` 就忽略 `p` |
| `p` | — | 0..1 扫过进度：`x = lerp(2300, −1900, p)`；p=0 完全在右侧画外，p=1 完全在左侧画外；p≈0.32 时接缝过屏幕中线，p≈0.46 时整座拱居中 |
| `s` | `1` | 缩放 |
| `time` | `'morning'` | 色调（同 drawPlaza） |
| `alpha` | `1` | ≤0 不画 |
| `t` | `T` | 长幡摆动 |

形状：左墩宽 `440·s`（实心全高，挂红底金盾长幡）+ 半圆拱洞宽 `760·s`（拱顶 y≈`140·s`）+ 右墩宽 `440·s`（挂铁灯）。整座宽 `1640·s`，左缘 = `x − 220·s`。
返回（屏幕 x）：`seam`（接缝）、`left:[x0,x1]`、`opening:[x0,x1]`、`right:[x0,x1]`。拱整个在画外时直接返回、不画。

### 3.3 plazaDepth(layer, flat) / plazaToScreen(c, layer, x, y, flat)

`plazaDepth` 返回 `PLAZA_DEPTH[layer]` 朝 1 拉平后的深度（未知 layer 按 1）。`plazaToScreen` = `toScreen(c, plazaDepth(layer, flat), x, y)`，layer 可用 `'sky' | 'cloud' | 'far' | 'mid' | 'main' | 'fg'`。

### 3.4 drawThroneRoom(g, T, cam, o) → `{ rose, moon, star, decree? }`

`glow` 层直接画在 `g` 上（屏幕空间加光：彩窗光柱 + 浮尘、烛光晕、月光），建议放在角色之后、fg 之前。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `layer` | `'main'` | `'back'`（0.55）/ `'mid'`（0.8）/ `'main'`（1）/ `'fg'`（1.38）/ `'glow'`（屏幕空间）。未知值按 main |
| `light` | `'sunny'` | `'sunny'` / `'festive'` / `'gray'` / `'night'`，未知值按 sunny |
| `windowL`、`windowR` | 按光照：sunny/festive→`'day'`，gray→`'gray'`，night→`'night'` | 尖拱窗里的“窗外”，见第 4 节；也可 `{from, to, k}`：窗框内小翻页（旧页绕左铰链翻走，k 0→1） |
| `moonPhase` | `0` | 0 满月 → 1 细月牙（`'moon'` 窗） |
| `rose` | `{}` | `{ face:'in'(默认)|'out', glow, tracery }`；glow 默认按光照 sunny 0.6 / festive 0.85 / gray 0.18 / night 0.08；`tracery:false` 关掉室内窗花（只对 in） |
| `decree` | 无 | 圣旨：`{ hung, chars, sweep, unroll, prints, printDur, layer }`，见下表 |
| `aisle` | `0` | 0..1，纸卷通道沿 `THRONE.aisle` 按弧长铺出（地上宽 48、台阶上 16；画在台阶之上、王座之下）；纸上只是墨迹纹理，不承担阅读 |
| `confettiFloor` | `0` | 0..1，地上与台阶上的彩纸（共 320 片，按比例出现） |
| `door` | `0` | 0..1，左门两扇向里开，门洞里亮起暖光 |
| `lectern` | `false` | 书记官讲台 (1150,880)：摊开的书 + 墨水瓶 + 鹅毛笔 |
| `candles` | `light === 'night'` | 柱上壁烛点火（mid 画火苗；只有 night 光照时 glow 层才画烛光晕） |
| `garland` | `light === 'festive'` | 柱间花环（玫瑰窗那一跨改为两束短花串） |
| `ruler` | 无 | 身高刻度 `[{ h, at }]`：x=780 柱上，`t ≥ at` 起 0.25s 弹出一道刻度 + 一颗金星，y = `rulerY(h)` |
| `fgPillars` | 自动 | 前景虚化立柱：默认在柱子滑进画面中部（离中线 <560px）时淡出，只在宽景当画框；`true` 强制显示，`false` 不画 |
| `beams` | `1` | 0..1，晴 / 节日的彩窗光柱 + 地面四色光斑强度 |
| `moonlight` | `1` | 0..1，夜里地上的月光斑 + 月光柱 |
| `flat` | `0` | `true` 或 0..1，冻结视差（玫瑰窗特写用 1） |
| `t` | `T` | 次级运动秒（烛火、长幡、流苏、浮尘、窗外云/雨/落叶、四季飘落物、星星闪） |

`decree` 子参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `hung` | `1` | 0 = 地上展开态（`THRONE.decree.from`：中心 (1140,730)、长 870、宽 180，即世界 x 705–1575、y 640–820）；1 = 挂成横幅（x 260–1880、y 218–322，两端吊绳）；中间线性过渡 |
| `chars` | `13` | 按段整段印好：≥4 印第一段、≥8 第二段、≥13 第三段（无砸印动画） |
| `prints` | — | `[t1, t2, t3]` 三段金印砸下的时刻（与 `t` 比较，带 0.22s 砸印动画、字间错峰 0.04s）；给了就忽略 `chars`。b05 用 `[cue('N4a'), cue('N4b'), cue('N4c')]` |
| `printDur` | `0.22` | 砸印动画时长 |
| `sweep` | `-1` | 0..1 从左到右扫过金字的闪光；<0 不画 |
| `unroll` | `1` | 0..1 展开程度（左端木轴固定，右端卷筒随之右移；未展开处的字不画） |
| `layer` | `'mid'` | `'mid'`：画在 mid 层（柱子同平面、在王座之后）；`'main'`：画在 main 层最上面（在王座、台阶之前），视在深度随 hung 从 1（与角色同平面）滑到 0.8（与柱对齐）。**b05 N4 地上那段必须用 `'main'`**，否则右端被王座挡住、金印位置随机位漂移 |

返回值：见第 2 节；`decree.chars` 的深度与 `layer`/`hung` 一致，可直接当“印章字飞回圣旨”的落点。

### 3.5 roseCam(sx = 960, sy = 540, r = 675, flat = 1) → cam

反解机位，使玫瑰窗中心落在屏幕 `(sx, sy)`、屏幕半径 `r`；`flat` 必须与同一帧传给 `drawThroneRoom` 的 `flat` 相同。默认值即 `CAMS.TR_ROSE`（flat 1，窗心屏幕中心、半径 675）。

### 3.6 throneMoonScreen(c, flat) → `[x, y, r]`

月亮（back 层世界 (1150.2, 302.1)、r≈60.1）在机位 c 下的屏幕位置与半径。`TR_NIGHT`（flat 0）下恰为 `(1220, 250, 70)` = O02 夕阳的屏幕位置与半径（翻页交接用）。

### 3.7 rulerY(h) → y

孩子（脚底 y=880，main 层）身高 h 的头顶，在 `TR_RULER` 下对应到 x=780 柱（mid 层）上的 y。`ruler` 参数内部就用它；只在 TR_RULER 机位下严格对齐。

### 3.8 throneDepth(layer, flat) / throneToScreen(c, layer, x, y, flat)

同 3.3。layer 可用 `'back' | 'mid' | 'main' | 'fg'`。

### 3.9 THRONE_LAYER / throneLayer(layer, light = 'sunny')

| 层 | THRONE_LAYER（晴/节日/阴） | throneLayer(layer, 'night') |
|---|---|---|
| back | `{ texture: 0.22 }` | `{ texture: 0.1 }` |
| mid | `{ shadow: 10, texture: 0.28 }` | `{ shadow: { blur: 15, dx: 3.5, dy: 8.5, color: rgba(PAL.shadow, 0.5) }, texture: 0.1 }` |
| main | `{ shadow: 8, texture: 0.28 }` | `{ shadow: { blur: 12, dx: 2.8, dy: 6.8, color: … }, texture: 0.1 }` |
| fg | `{ shadow: 12, texture: 0.2, blur: 4 }` | `{ shadow: { blur: 18, dx: 4.2, dy: 10.2, color: … }, texture: 0.1, blur: 4 }` |
| glow | — | — （不进图层，直接画在 g 上；`throneLayer('glow')` 返回 `{}`，night 时 `{ texture: 0 }`） |

夜景纸纹降到 0.1，是因为浅色纸纤维压在深色上会发灰起雾。返回的是新对象，可以再改（如加 `texOffset`）。

PLAZA 对应的是 `PLAZA_LAYER`：`far { shadow: 6, texture: 0.25 }`、`mid { shadow: 10, texture: 0.3 }`、`main { shadow: 8, texture: 0.3 }`、`fg { shadow: 14, texture: 0.2, blur: 3 }`；sky、light 直接画在 g 上。

### 3.10 布局常量

**PLAZA**（main 层，除注明外）

| 键 | 值 | 说明 |
|---|---|---|
| `groundY` / `groundTop` | 860 / 846 | 角色脚底线 / 石板地面远边 |
| `board` | `{ x:1080, cx:1080, cy:560, w:300, h:220, posts:[955,1205], roofY:400 }` | 告示板，告示锚在板心 (1080,560) |
| `well` | `{ x:700, y:860 }` | 水井 |
| `gate` | `{ x0:1660, x1:1900, y0:480, y1:860, cx:1780, cy:600, r:120 }` | 城门拱洞（通往城外，门洞里画城外） |
| `gatehouse` / `wall` | `{ x0:1606, x1:1954, top:290 }` / `{ x0:1954, x1:3400, top:472 }` | 城门楼、向右延伸的城墙 |
| `path` | `{ x1: 200 }` | 画左进城小路 |
| `lightX`, `lightY` | 520, 866 | 光圈中心 |
| `crowdL` / `crowdR` / `herald` | [620,900] / [1220,1500] / 1000 | 人群左右组 x 范围、传令官 x |
| `housesL` / `housesR` | [0,380] / [1380,1640] | 木筋屋（mid） |
| `castle` | `{ x:1500, y:190, s:0.55, ref:[960,575] }` | far：CASTLE 世界 (960,575)（阳台栏杆中点）摆到 far (1500,190)，缩放 0.55 |
| `balconyKing` | [994, 590, 0.3] | 小国王：CASTLE 坐标脚底 + 缩放 |
| `bunting` | `{ y0:40, y1:120 }` | 彩旗串（fg） |
| `cloudGap` | [430, 70] | 云缝（cloud 层坐标） |
| `depth` | = `PLAZA_DEPTH` | |

**THRONE**（main 层，除注明外）

| 键 | 值 | 说明 |
|---|---|---|
| `floorY` / `wallBase` | 880 / 852 | 角色脚底线 / 后墙墙脚（back） |
| `carpet` | `{ x0:−200, x1:1300, y0:868, y1:960 }` | 红毯（远边抬到 868 盖住柱础，脚底 880 踩在毯上） |
| `door` | `{ x:150, x0:60, x1:240, y0:520, y1:852 }` | 左门拱（back，门槛与墙脚齐平） |
| `windows` | `L:{ x:600, w:150, y0:180, y1:540 }`、`R:{ x:1150, … }` | 尖拱窗（back） |
| `rose` | `{ x:1580, y:250, r:150 }` | 玫瑰窗（back），王座正上方 |
| `moon` | `{ x≈1150.2, y≈302.1, r≈60.1 }` | 右窗月亮（back；由 TR_NIGHT 下屏幕 (1220,250) r70 反解） |
| `cols` / `colW` / `colY0` / `colY1` | [260,780,1300,1880] / 96 / 80 / 880 | 柱（mid） |
| `bannerCols` / `bannerY0` / `bannerY1` | [780,1300] / 120 / 420 | 红底金盾长幡（mid） |
| `sconceY` | 540 | 壁烛杯口高度（mid） |
| `steps` | `{ xs:[1300,1360,1420], tops:[850,820,790], x1:1900 }` | 三级台阶：第 k 级从 xs[k] 起、顶 tops[k] |
| `throne` | `{ x:1580, seatY:660, backTop:430, w:220, star:[1580,404] }` | 王座 |
| `lectern` | `{ x:1150, y:880 }` | 讲台 |
| `fgCols` / `drapeY1` | [−60, 1980] / 80 | 前景虚化立柱 / 顶部帷幔下沿（fg） |
| `decree` | `{ x0:260, x1:1880, y0:218, y1:322, cx:1070, cy:270, from:{ cx:1140, cy:730, len:870, width:180 } }` | 圣旨横幅挂起位置 + 地上展开位置 |
| `lightSpots` | [[470,760],[1010,1290]] | 晴天两块彩窗光斑的 x 范围 |
| `aisle` | 折线 (980,920)→(1300,920)→台阶→(1530,800) | 纸通道中线 |
| `spots` | 见下 | 站位（脚底） |
| `depth` | = `THRONE_DEPTH` | |

`THRONE.spots`：`hero [620,880]`、`kingStand [1500,790]`、`kingSit [1580,660]`、`scribe [1150,880]`、`herald [980,880]`、`guardL [1240,880]`、`guardR [1880,790]`、`princess [760,880]`、`cradle [1100,880]`、`courtiers [300,700,0.9]`（朝臣 x 300–700，depth 0.9）。

## 4. 枚举全表

### 4.1 PLAZA

**layer**

| 值 | 内容 | 深度 |
|---|---|---|
| `sky` | 天空渐变 + 云（灰天三排云带；beam 时从云缝裂开；晴晨几朵白云慢飘） | 0.05 / 0.2 |
| `far` | 远山、城丘、山坡小城、广场后沿行道树与矮护墙、缩小的王城（13 塔 + 主堡圆窗 + 阳台 + 小国王 + 红灯笼 + 烽火） | 0.4 |
| `mid` | 左右木筋屋（招牌、橱窗、遮阳篷、炊烟、小阳台花） | 0.8 |
| `main` | 城门楼 + 城墙 + 门洞里的城外、石板地面 + 进城小路、光圈、水井、告示板 + 告示 | 1 |
| `fg` | 顶部彩旗串、左下木桶、右下花箱 | 1.35 |
| `light` | beam：云缝光柱 + 浮尘 + 光圈晕；morning：左上晨光放射线 | 屏幕 |

**time**

| 值 | 说明 | storyboard |
|---|---|---|
| `gray` | 灰蓝阴天，压低饱和；默认 alarm 开 | b03 L06（19.95–22.11） |
| `beam` | 同灰蓝，`beamAt` 起云缝裂开、光柱落到 x=520 | b03 L07–L08（22.11 起） |
| `morning` | 晴晨，蓝天白云、晨光放射线；alarm 默认关 | b07 V01–V04（74.30–81.00） |

**notice**：`none`（b03 告示拍上去之前，板上只有旧残角）｜`full`（b03 20.10 拍上板 → 24.60 扑向镜头之前；拍板动画用 `noticeOpts`）｜`corners`（b07 V01 起，只剩 L08 撕走后的两个纸角）。

**farKing**

| 值 | 说明 | storyboard |
|---|---|---|
| `idle` | 站着，手放两侧（morning 默认） | — |
| `holdHead` | 抱头，左右慌跑（gray 默认） | b03 L06 |
| `leanForward` | 探出栏杆（beam 默认） | b03 L07 23.10 |
| `beardFlip` | 大胡子被掀起盖住脸、王冠后歪、双手乱挥 | b03 L08 24.25–24.50 |
| `wave` | 挥手帕 | b07 V03 78.14 |

**CAMS**

| 名 | 值 | 用途 / storyboard |
|---|---|---|
| `PL_W` | `cam(960,540,1.0)` | 全景；b03 19.95–20.15 落镜收尾、24.25–24.50 甩回 |
| `PL_BOARD` | `cam(1080,560,1.8)` | 告示板近景（4.3 预设） |
| `PL_HERO` | `cam(560,600,1.6)` | 勇者中景；b03 22.11–22.40 摇向、b07 74.45–75.20 |
| `PL_HERO_CU` | `cam(560,640,3.4)` | 勇者特写；b03 24.05–24.11 snap（L08 喊） |
| `PL_GATE` | `cam(1500,560,1.2)` | 城门方向；b07 V04 80.30 跟拍 |
| `PL_TOP` | `cam(960,240,1.0)` | 附加：b03 19.95 甩镜帘后的起幅 |
| `PL_CROWD` | `cam(1000,560,1.3)` | 附加：b03 20.10–20.60 推近告示与人群 |
| `PL_SCARF` | `cam(560,420,4.0)` | 附加：b07 74.30 围巾特写 |
| `PL_HOPE` | `cam(1060,600,1.45)` | 附加：b07 78.10–80.20 众人的希望 |

### 4.2 THRONE

**layer**

| 值 | 内容 | 深度 |
|---|---|---|
| `back` | 后墙灰泥 + 石砖、檐壁、护墙、两扇尖拱窗（窗里画“窗外”）、玫瑰窗、左门、墙脚远地面 | 0.55 |
| `mid` | 四根柱 + 壁烛、红底金盾长幡、节日花环、身高刻度、圣旨（默认） | 0.8 |
| `main` | 方砖地面、红毯、彩窗光斑 / 月光斑、三级台阶 + 王座台垂毯、纸通道、王座、讲台、地上彩纸、圣旨（layer:'main' 时） | 1 |
| `fg` | 两根虚化立柱（x −60、1980）、顶部帷幔 + 金流苏 | 1.38 |
| `glow` | 彩窗光柱 + 浮尘、窗口与玫瑰窗光晕、节日金粉、夜里烛光晕与月光柱 | 屏幕 |

**light**

| 值 | 说明 | storyboard |
|---|---|---|
| `sunny` | 晴：窗外蓝天，彩窗在地上投两块四色光斑（随 fbm 轻移）+ 光柱浮尘 | b04、b05、b06 开头（33.60–60.50） |
| `festive` | 节日金：比晴更亮更暖，墙面整体提金、花环、金粉飘落、玫瑰窗 glow 0.85 | b14 E05–E08（169.00–177.20） |
| `gray` | 阴：窗灰 + 雨丝、整体压灰 | 第 5 节未用（预留） |
| `night` | 夜：窗外星空、柱上烛光、地上月光斑、玻璃发暗 | b16 189.40 起、b17 197.77–198.50 |

**windowL / windowR**

| 值 | 内容 | storyboard |
|---|---|---|
| `day` | 蓝天、慢飘白云、远山 | sunny / festive 默认 |
| `gray` | 灰天、乌云、雨丝 | gray 默认 |
| `sunset` | 黄昏渐变、金色落日光、云 | 第 5 节未用（预留） |
| `night` | 星空（闪烁） | night 默认；b16 左窗四季翻牌前 |
| `moon` | 星空 + 月亮（右窗月亮在 `THRONE.moon`；左窗也可用，月亮按同一偏移画），`moonPhase` 控月相 | b16 189.40 起右窗（与 O02 太阳同屏位）、b17 |
| `spring` | 粉花枝 + 飘落花瓣 | b16 O04 191.66 |
| `summer` | 绿叶枝 + 日光 | b16 192.15 |
| `autumn` | 橙叶枝 + 落叶 | b16 192.65 |
| `winter` | 积雪枝 + 雪花 | b16 193.15 |
| `{from,to,k}` | 两种之间的小翻页 | b16 O04 四季翻牌 |

**rose.face**：`in`（默认，室内逆光 + 窗花；b14 圆窗推入后、b17 推到玫瑰窗）｜`out`（受光、偏暗，与王城外景圆窗同款；b14→b15、b17 圆窗拉出的外侧）。

**CAMS**

| 名 | 值 | 用途 / storyboard |
|---|---|---|
| `TR_W` | `cam(1000,540,1.0)` | 全景；b04 33.60–35.20、b14 169.00–169.80 从玫瑰窗拉到 |
| `TR_2S` | `cam(1060,600,1.35)` | 双人；b04 35.20 起、b04→b05 接缝 41.90、b05 45.30–45.90 |
| `TR_HERO` | `cam(700,640,1.7)` | 勇者中景（4.5 预设，第 5 节未点名） |
| `TR_KING` | `cam(1480,600,1.7)` | 国王中景（4.5 预设，第 5 节未点名） |
| `CU_H` | `cam(700,690,3.4)` | 勇者格：头在左半屏约 (690,480)，气泡在右上；b04 38.11–38.60、b05 H1 53.10–53.25 |
| `CU_K` | `cam(1400,640,3.3)` | 国王格：头在右半屏约 (1290,490)，气泡在左上；b05 K1 45.00–45.12、K2 49.20–49.31 |
| `TR_HIGH` | `cam(1000,470,0.85)` | 高位大全景；b05 56.00–56.80、b05→b06 接缝 56.89 |
| `TR_ROSE` | `cam(1580,250,4.5)` | 玫瑰窗特写，**配 `flat:1`**（= `roseCam()`）；b14 169.00、176.50–176.80（铺满全屏用 `roseCam(960,540,1150)`）、b17 198.05–198.50 |
| `TR_NIGHT` | `cam(900,560,1.3)` | 夜景；b16 189.40 翻页后、193.60–193.90；b16→b17 接缝 197.77 |
| `TR_RULER` | `cam(800,600,1.9)` | 身高尺，**锁死不加 drift**；b16 191.50–193.60 |
| `TR_NAME` | `cam(1080,640,1.42)` | 附加：b05 41.90–43.80 由 TR_2S 缓推到 |
| `TR_KING2S` | `cam(1300,560,1.45)` | 附加：b05 49.83–50.40 偏国王的双人 |
| `TR_SEAL` | `cam(1000,600,1.3)` | 附加：b05 N4a 54.00 急拉 |
| `TR_SEAL2` | `cam(1080,580,1.15)` | 附加：b05 N4b 54.68 后拉一级 |
| `TR_LOW` | `cam(1000,720,1.2)` | 附加：b06 57.80–58.40 贴地低机位 |
| `TR_HERALD` | `cam(1000,560,1.2)` | 附加：b14 169.80–170.60 推向传令官 |
| `TR_SCROLL` | `cam(1400,600,1.2)` | 附加：b14 173.8–176.0 跟纸卷右移 |

## 5. 推荐用法

### 5.1 王座厅一帧的标准分层（≤ 6 个缓冲）

```js
import { cam, applyCam, drift, lerpCam } from '../core/camera.js';
import { ez, glide } from '../core/ease.js';
import { drawThroneRoom, CAMS, THRONE, throneLayer } from '../env/throne.js';

draw(g, T, lt, ctx) {
  const base = lerpCam(CAMS.TR_W, CAMS.TR_2S, ez(T, 35.20, 36.11, glide));
  const [dx, dy] = drift(T, { amp: 5 });
  const c = cam(base.x + dx, base.y + dy, base.zoom);
  const o = { light: 'sunny', lectern: true };
  for (const L of ['back', 'mid', 'main']) ctx.layer(g, throneLayer(L, o.light), (lg) => drawThroneRoom(lg, T, c, { ...o, layer: L }));
  ctx.layer(g, { shadow: 10, texture: 0.28 }, (lg) => { applyCam(lg, c, 1); /* 角色：THRONE.spots.hero 等，s = 1 */ });
  drawThroneRoom(g, T, c, { ...o, layer: 'glow' });                       // 光效直接画在 g 上
  ctx.layer(g, throneLayer('fg', o.light), (lg) => drawThroneRoom(lg, T, c, { ...o, layer: 'fg' }));
}
```

### 5.2 b05 N4：圣旨地上展开 + 金印 → 吊成横幅（b06 接缝用同一组参数）

```js
const decree = {
  layer: 'main',                                   // 地上那段必须在王座之前
  unroll: ez(T, 53.95, 55.9, glide),               // 书记官展开
  prints: [cue('N4a'), cue('N4b'), cue('N4c')],    // 三段金印砸下（带动画）
  hung: ez(T, 56.20, 56.80, glide),                // 吊成横幅
  sweep: T >= 56.60 ? (T - 56.60) / 0.3 : -1,      // 56.60 扫光
};
const r = drawThroneRoom(lg, T, c, { light: 'sunny', layer: 'main', decree });
// r.decree.chars[i]：第 i 个字（0..12）的屏幕坐标 → 屏幕空间印章字飞回圣旨的落点
```

### 5.3 玫瑰窗：推近时 flat 跟着插值；圆窗内外匹配

```js
const k = ez(T, 176.50, 176.80, glide);
const c = lerpCam(CAMS.TR_SCROLL, roseCam(960, 540, 1150, 1), k);
const o = { light: 'festive', flat: k, rose: { face: 'in' } };     // flat 与机位一起 0→1，不然前景柱会挡在窗前
// E05 内外匹配：外景圆窗此刻在屏幕 (sx, sy)、半径 r → roseCam(sx, sy, r, 1) 让内侧那扇严丝合缝地对上
```

### 5.4 夜景：四季翻牌 + 月相 + 身高刻度（O04，机位锁死）

```js
const S = ['spring', 'summer', 'autumn', 'winter'], at = [191.66, 192.15, 192.65, 193.15];
const i = Math.max(0, at.findLastIndex((x) => T >= x));
const windowL = i === 0 ? 'spring' : { from: S[i - 1], to: S[i], k: ez(T, at[i], at[i] + 0.3) };
const o = { light: 'night', windowL, windowR: 'moon', moonPhase: ez(T, 191.66, 193.4) * 0.8,
  ruler: [{ h: 110, at: 191.66 }, { h: 160, at: 192.30 }, { h: 200, at: 192.95 }] };
for (const L of ['back', 'mid', 'main']) ctx.layer(g, throneLayer(L, 'night'), (lg) => drawThroneRoom(lg, T, CAMS.TR_RULER, { ...o, layer: L }));
// 翻页交接：throneMoonScreen(CAMS.TR_NIGHT) === [1220, 250, 70]
```

### 5.5 广场：灰蓝 → 光柱 → 喊声冲击（b03）

```js
import { drawPlaza, CAMS, PLAZA, PLAZA_LAYER } from '../env/plaza.js';
const o = { time: T < 22.11 ? 'gray' : 'beam', beamAt: 22.11, notice: 'full',
  noticeOpts: { unroll: ez(T, 20.08, 20.18), pins: ez(T, 20.12, 20.18) * 2 },
  farKing: T < 23.10 ? 'holdHead' : T < 24.25 ? 'leanForward' : 'beardFlip',
  lightCircle: ez(T, 22.4, 23.0), shockAt: 24.11, beaconAt: [20.4, 20.6] };
drawPlaza(g, T, c, { ...o, layer: 'sky' });
for (const L of ['far', 'mid', 'main']) ctx.layer(g, PLAZA_LAYER[L], (lg) => drawPlaza(lg, T, c, { ...o, layer: L }));
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => { applyCam(lg, c, 1); /* 人群 PLAZA.crowdL/crowdR、传令官 PLAZA.herald，脚底 y=860 */ });
drawPlaza(g, T, c, { ...o, layer: 'light' });
ctx.layer(g, PLAZA_LAYER.fg, (lg) => drawPlaza(lg, T, c, { ...o, layer: 'fg' }));
```

### 5.6 城门拱当前景遮挡物换景（b07 V04）

```js
const x = 960 + (81.00 - T) * 9000;   // 左墩中线 = 换景接缝；81.00 时正好过屏幕中线，约 81.27 完全出画
ctx.mask(g, (mg) => mg.fillRect(-10, -10, x + 10, 1100), (lg) => drawPlazaFrame(lg, T));     // 接缝以左：PLAZA
ctx.mask(g, (mg) => mg.fillRect(x, -10, 1940 - x, 1100), (lg) => drawJourneyFrame(lg, T));   // 接缝以右（含拱洞）：JOURNEY
ctx.layer(g, { blur: 3, shadow: 14 }, (lg) => drawGateArch(lg, T, { x, time: 'morning' })); // 返回 { seam: x, left, opening, right }
```
接缝就是 `x`（返回值 `seam` 同值），左墩宽 440 把接缝整个盖住；拱洞正好框住城外的 JOURNEY。`drawPlazaFrame` / `drawJourneyFrame` 指镜头自己的整帧绘制函数；遮罩里再开图层也计入缓冲，交接 0.4s 内可把广场合并成 1–2 层。

## 6. 与 assets.md 的差异

**PLAZA（8.3）**
- 层：多一个 `light`（屏幕空间光效）；`sky` 内部含天空 0.05 + 云 0.2 两个深度。
- `CAMS` 多四个附加机位 `PL_TOP / PL_CROWD / PL_SCARF / PL_HOPE`（storyboard 第 5 节写死的机位）。
- 告示由 `props/paper.js` 的 `drawNotice` 画（assets 写的 `props/notice.js` 不存在）；新增 `noticeOpts` 透传其参数（本轮收尾新增）。
- `farKing` 姿势名：抱头 `holdHead`、探身 `leanForward`、胡子被掀 `beardFlip`、挥手帕 `wave`，另有 `idle`；`null/'none'` 不画。
- 新增参数：`beamAt`、`shockAt`、`alarm`、`beaconAt`、`flat`、`t`；新增导出 `PLAZA_DEPTH`、`plazaDepth`、`plazaToScreen`、`PLAZA_LAYER`；`drawPlaza` / `drawGateArch` 有返回值。
- 远景王城是模块内自绘的简化版（13 塔 + 主堡 + 圆窗 + 阳台，布局对齐 CASTLE，缩放 0.55），**没有调用** `castle.drawCastle`。
- `drawGateArch` 是屏幕空间、自带几何（`x` / `p` / `s`），不吃机位与 depth。

**THRONE（8.5）**
- 层：多一个 `glow`（屏幕空间）；fg 深度取 1.38。
- 布局微调（为接缝与遮挡）：红毯远边 y=868（规格 880）；左门门槛 y=852 与墙脚齐平（规格 880）；三级台阶起点 x 1300 / 1360 / 1420（顶 850 / 820 / 790）；晴天光斑落在 x 470–760、1010–1290（规格 400–1300 范围内）；月亮位置由 TR_NIGHT 反解。
- 玫瑰窗调共享的 `env/roundwindow.js` 的 `drawRoundWindow`（assets 写 `castle.drawRoundWindow`，storyboard 写 `drawRoseWindow`，都是指它）；`rose` 多一个 `tracery`。
- `decree` 多 `unroll`、`prints`、`printDur`、`layer`（本轮收尾新增，默认值保持原行为）。
- 新增参数：`moonPhase`、`door`、`lectern`、`candles`、`garland`、`ruler`、`fgPillars`、`beams`、`moonlight`、`flat`、`t`。
- `CAMS` 多七个附加机位 `TR_NAME / TR_KING2S / TR_SEAL / TR_SEAL2 / TR_LOW / TR_HERALD / TR_SCROLL`（本轮收尾新增）。
- 新增导出 `THRONE_DEPTH`、`throneDepth`、`throneToScreen`、`roseCam`、`throneMoonScreen`、`rulerY`、`THRONE_LAYER`、`throneLayer`；`drawThroneRoom` 有返回值（`decree` 字段本轮新增）。

## 7. 已知限制与注意事项

- **首帧开销**：两模块各有一次性静态几何缓存（按固定种子预建，之后每帧复用；调色按光照/时段缓存）。不影响确定性，但第一帧稍慢。
- **缓冲预算**：王座厅标准用法 = back / mid / main / fg 4 个图层 + 角色层；广场 = far / mid / main / fg 4 个 + 角色层。sky、light、glow 直接画在 g 上不占缓冲。
- **glow / light 用 screen、lighter 合成**，必须画在不透明底之上；放进遮罩时也要在同一缓冲里先画好布景。
- **时间基准不同**：`beamAt`、`beaconAt` 与 `T` 比较；`shockAt`、`ruler[].at`、`decree.prints` 与 `t`（默认 = T）比较。改了 `o.t` 时注意。
- **圣旨换层会跳**：`decree.layer` 在一段戏里不要中途切换（z 序与视差都会跳一下）。b05 N4 用 `'main'`，b05→b06 的隐形接缝两侧必须同样 `'main'`、同样的 hung / sweep。
- **TR_ROSE 必须配 flat:1**（或用 `roseCam(..., flat)` 并把同一个 flat 传给布景），否则 x=1880 的柱会挡在窗前、位置也对不上。
- **夜景 TR_NIGHT 烛光晕较大**：三根柱的光晕会连成一片，画面偏柔；要更强的“夜与烛光对比”时在镜头里加 `ctx.fx.contrast` / `vignette`，或 `candles:false` 后自行补光。
- **前景立柱默认自动淡出**（离中线 < 560px 时）；推镜时如出现立柱“消失”是这个原因，需要时传 `fgPillars:true`。
- **纸通道 aisle 只是纹理**：b14 地上纸卷要读得清的名字、简笔画、红叉章由镜头用 `props/paper.js` 自己画，aisle 用来表现最后“铺成通道”的状态。
- **farKing 的 {from,to,k} 是硬切**（k 0.5 处换姿势），远景小国王只有约 30px，硬切看不出来。
- **窗外细节**：夜窗里没有远处城楼（storyboard 196.80“窗外城楼旗子耷拉”无法用参数表现，需镜头自行补画）。
- **广场远景王城不是 CASTLE 本体**：只在“小、远”时成立，不能拿它推近到 CASTLE 交接。
- `plaza.js` 末尾 `export { PAL }` 是历史遗留，请从 `core/paper.js` 导入 PAL。

## 8. 模型图清单

| 模型图 | 内容 | 定稿渲染 |
|---|---|---|
| `src/sheets/plaza.js` | [0,1) 三时段同机位 PL-W + 远景小国王四姿势（放大 / 原尺寸）｜[1,2) 城门拱扫过中线三帧 + PL-BOARD / PL-HERO-CU / PL-GATE｜[2,3) PL-W 站位标注｜[3,6) 动态：落镜 → 告示拍板（noticeOpts）→ 光柱 → PL-HERO → 喊声冲击 | `out/review/sheets/plaza/final_t0.50.png`、`final_t1.50.png`、`final_t2.50.png`、`final_t3.45.png`、`final_t3.60.png`、`final_t4.80.png`、`final_t5.10.png` |
| `src/sheets/throne.js` | [0,1) 四种光照同机位 TR-W｜[1,2) CU-H / CU-K / TR-ROSE 内外 / TR-NIGHT 月亮 / TR-RULER 四季 + 刻度｜[2,3) TR-W 站位标注｜[3,4) 圣旨吊起、节日纸通道、TR-LOW、TR-KING、N4 展开 + 金印（红点 = 返回字位）、夜里开门｜[4,7) 动态 TR-W → TR-2S → CU-H → 玫瑰窗（flat 0→1）｜[7,8) 全幅夜景 TR-NIGHT｜[8,9) 全幅节日 TR-HERALD | `out/review/sheets/throne/final_t0.50.png`、`final_t1.50.png`、`final_t2.50.png`、`final_t3.30.png`、`final_t3.70.png`、`final_t5.00.png`、`final_t6.90.png`、`final_t7.50.png`、`final_t8.50.png` |

渲染命令（各模型图文件头里也有）：

```bash
node tools/render.mjs stills --sheet plaza  --times 0.5,1.5,2.5,3.45,3.6,4.8,5.1 --outdir out/review/sheets/plaza  --prefix final_
node tools/render.mjs stills --sheet throne --times 0.5,1.5,2.5,3.3,3.7,5.0,6.9,7.5,8.5 --outdir out/review/sheets/throne --prefix final_
node tools/check.mjs sheets --list plaza,throne
```
