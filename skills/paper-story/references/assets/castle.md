# 王城外景与绘本（castle）API

> 覆盖两个模块：`src/env/castle.js`（王城外景 CASTLE）与 `src/env/book.js`（书桌、绘本、片名页 BOOK）。
> `drawRoundWindow` 的实现在集成负责人维护的共享文件 `src/env/roundwindow.js`，castle.js 只是转出。
> 规格来源 docs/assets.md 8.1 / 8.2，布局来源 docs/storyboard.md 4.1 / 4.2；**两者与代码不一致时以本文（= 代码）为准**，差异见第 6 节。

## 1. 模块与导出一览

### 1.1 `src/env/castle.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawCastle(g, T, cam, o)` | 函数 | 按 `o.layer` 分层画王城外景：七个时段、立体书 popup、火 / 烽火 / 字旗 / 婚礼装饰 / 纸天撕裂等状态 |
| `drawRoundWindow(g, o)` | 函数（转出） | 8 瓣彩色玻璃圆窗；外景圆窗与王座厅玫瑰窗共用 |
| `drawSpireWrap(g, T, cam, o)` | 函数 | 单独画婚礼横幅绕尖塔的某半圈（自带主体层机位），供场景插在自己的图层之间 |
| `spireWrapPoint(u)` | 函数 | 绕塔椭圆上比例 u 处的点 `{x, y, ang, front}`（纸鸽沿它飞） |
| `castleToScreen(cam, layer, x, y, o)` | 函数 | 某层世界点 → 屏幕坐标（已考虑 flat），挂特效 / 遮罩 / UI 用 |
| `roadPoint(u)` | 函数 | 山路上弧长比例 u（0 城门 → 1 出画）处的 `[x, y, 切线角]`（mid 层坐标） |
| `roadPoints()` | 函数 | 山路加密折线 `[[x, y]…]`（73 点，mid 层坐标），卷轴铺路用 |
| `hillTopY(x)` | 函数 | 城丘顶边在 x 处的 y（mid 层坐标） |
| `tearPath(tear, T)` | 函数 | L02 纸天撕口的 Path2D（sky 层坐标）；还没撕开时返回 `null` |
| `paintSun(g, st, kind, x, y, r, a, soft, glowK)` | 函数 | 太阳 / 夕阳 / 月亮圆盘（封面太阳徽章复用它，保证形状一致） |
| `CASTLE` | 常量 | 布局：塔、主堡、圆窗、阳台、城墙、城门、城丘、山路、屋顶、地面带、字旗、绕塔椭圆、天幕卡 |
| `CAMS` | 常量 | 预设机位 `CA_W / CA_MW / CA_BAL / CA_TOWN / CA_BAL_K` |
| `LAYER_FX` | 常量 | 六层（+ alarm）各自推荐的 `ctx.layer` 参数 |
| `LAYER_GROUPS` | 常量 | 三组合并版图层（缓冲紧张时用；b01 / b02 / b17 交接必须用它） |
| `CASTLE_TIMES` | 常量 | 七个时段名 `['dawn','doom','gray','spring','wedding','sunset','night']` |
| `POPUP_KEYS` | 常量 | popup 数组形式的 23 个下标名 |

### 1.2 `src/env/book.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawDesk(g, T, cam, o)` | 函数 | 木桌 + 台灯光斑（`layer:'desk'`），或光里浮尘（`layer:'dust'`） |
| `drawBook(g, T, cam, o)` | 函数 | 绘本：书体 / 封面 / 翻开 / 跨页（`'book'`）、立体件（`'popup'`）、书签与卷轴尾（`'bookmark'`） |
| `drawTitlePage(g, T, o)` | 函数 | 满屏片名页（皮面 + 金双线框 + 四角卷草 + 可选片名字与光芒） |
| `drawTitleGlyphs(g, o)` | 函数 | 片名「达拉崩吧」三层纸叠字（占位实现，可用 `titleFn` 换成 `type.titleGlyphs`） |
| `drawSleepyLizard(g, T, o)` | 函数 | 片尾睡着 / 爬行的小蜥蜴（占位实现，可用 `lizardFn` 换成 `drawLizard`） |
| `scrollCorner(g, x, y, sx, sy, s, col)` | 函数 | 金色卷草角饰（封面、片名页、b16 插画画框可复用） |
| `bookPushCam(T)` | 函数 | 书内推镜曲线（b01 8.20–10.39 推进；b17 199.30–199.66 拉回） |
| `bookToCastleCam(c)` | 函数 | 书内机位 → CASTLE 等效机位（另带 `flat`、`strings`） |
| `castleToBookCam(c)` | 函数 | CASTLE 机位 → 书内等效机位 |
| `bookCastleCam(T)` | 函数 | `bookToCastleCam(bookPushCam(T))`：b02 / b17 世界侧直接用这一个 |
| `bookPageRect(T, c?)` | 函数 | 天幕卡在当前书内机位下的屏幕矩形 `{x,y,w,h}`（交接遮罩） |
| `bookSpreadRect(T, c?)` | 函数 | 整个跨页的屏幕矩形 |
| `bookCardCovers(T, c?)` | 函数 | 天幕卡是否已盖满整屏（为真时可省掉书桌 / 书体 / 书签三层） |
| `bookPopupAt(T)` | 函数 | b01 立起时刻表 → popup 对象 |
| `bookToCastle(x, y)` / `castleToBook(x, y)` | 函数 | 书内点 ↔ 城堡世界点 |
| `BOOK` | 常量 | 书桌 / 绘本布局（书内坐标） |
| `CAMS` | 常量 | `BK_COVER / BK_SPREAD / BK_PUSH_END / BK_CAW` |

两个模块都导出 `CAMS`，同时用时改名：

```js
import { drawCastle, drawSpireWrap, spireWrapPoint, castleToScreen, roadPoint, tearPath, CASTLE, CAMS as CA, LAYER_FX, LAYER_GROUPS } from '../env/castle.js';
import { drawDesk, drawBook, bookPushCam, bookCastleCam, bookPageRect, bookCardCovers, bookPopupAt, CAMS as BK } from '../env/book.js';
```

## 2. 坐标、尺寸与锚点约定

### 2.1 CASTLE 世界坐标、深度与 flat
- 世界坐标 = 主体层（depth 1）坐标；`CA_W = cam(960,540,1)` 时世界 = 屏幕。地平线 y=620。
- `drawCastle` **内部自己 `applyCam`**（每层按自己的深度），镜头不要再 applyCam，只负责把每层包进 `ctx.layer`。函数内部 save/restore，不改调用方状态。
- 层深度 `CASTLE.depth`：`sky 0.05｜far 0.3｜mid 0.6｜main 1｜near 1.1｜fg 1.4｜alarm 1`。
- `flat`（冻结视差，0..1）：取 `o.flat`（`true`=1、`false`=0、数字），否则取 `cam.flat`（`bookToCastleCam` 会写），都没有为 0。实际深度 = `lerp(层深度, 1, flat)`。`drawCastle` 返回 `{ depth }` 就是这个实际深度，可直接喂 `applyCam / toScreen`。
- 坐标系分属：`CASTLE.hill`、`CASTLE.road`、`roadPoint`、`roadPoints`、`hillTopY` 是 **mid 层（0.6）坐标**；`CASTLE.houses`、`CASTLE.ground` 是 **near 层（1.1）坐标**；`snowPeak / dragonPeak` 是 far 层（0.3）坐标；`tear` 与云、鸟、星是 sky 层（0.05）坐标；`split` 是 depth 0 坐标（= 屏幕 x）；其余是主体层坐标。CA-W 下所有层都与屏幕重合。
- 角色缩放：阳台、城墙上 `s=0.26`（勇者世界高 68），城下地面带 `s=0.30`。CA-BAL（zoom 2.6）下 s=0.26 的勇者屏幕约 177px。

### 2.2 关键锚点

| 物件 | 坐标（主体层，除注明外） |
|---|---|
| 13 塔 `CASTLE.towers[i]` | x = 300 + 110·i，宽 70；塔高 h 按 [170,210,250,210] 循环；塔身顶 `top = 700 − h`；锥顶尖 `coneTip = top − 70`；旗杆顶 `poleTop = coneTip − 50`；`roof` 为 `'roofRed'`（偶数）/ `'roof'`（奇数）；`side` 旗飘向（i<6 为 −1 向左，i≥6 为 +1 向右）；`keep` 是否主堡 |
| 塔顶速查 | i: x / top / poleTop —— 0: 300/530/410 · 1: 410/490/370 · 2: 520/450/330 · 3: 630/490/370 · 4: 740/530/410 · 5: 850/490/370 · **6: 960/300/70（主堡，coneTip 120）** · 7: 1070/490/370 · 8: 1180/530/410 · 9: 1290/490/370 · 10: 1400/450/330 · 11: 1510/490/370 · 12: 1620/530/410 |
| 主堡 `CASTLE.keep` | x 840–1080、y 300–700，`cx` 960，尖顶 `spireY` 120，尖顶底 `spireBase` 306，半宽 `spireHalf` 108；两角小望楼在 x 838 / 1082 |
| 圆窗 `CASTLE.window` | (960,430) r=70（石框外缘 r×1.18 ≈ 83），`face:'out'` |
| 王家阳台 `CASTLE.balcony` | 平台 x 850–1070，地板 `floorY` 590，栏杆顶 `railY` 560；门拱 `door` x 925–995 / y 510–590；红灯笼 `lantern` (1062,548)；花箱 `boxes` x 860–922（花高到 y≈541，会挡住站在那里的人） |
| 城墙 `CASTLE.wall` | x 260–1660、y 700–880；垛口 `merlon` 40×30、每 60px（y 670–704） |
| 城门拱 `CASTLE.gate` | x 890–1030、y 740–880（引道铺到 y≈966） |
| 城丘 `CASTLE.hill`（mid） | `blob(960,1150, 1300,520)` |
| 山路 `CASTLE.road`（mid） | `[[960,880],[1180,930],[1400,990],[1700,1080],[2050,1160]]`，Catmull-Rom 加密 |
| 雪峰 / 龙山（far） | `snowPeak` (1260,330) 峰顶 scarf 小红旗；`dragonPeak` (1700,400) 紫色、洞口 (1718,560)、一缕细烟 |
| 城下屋顶 `CASTLE.houses[0..5]`（near） | x = 420 / 600 / 780 / 1140 / 1320 / 1500，`w` 宽，`base` 960，`eave` 檐 y，`ridge` 屋脊 y（836 / 830 / 840 / 828 / 844 / 832） |
| 地面带 `CASTLE.ground`（near） | y 960–1080（城门前石板路 x 900–1020 起向下变宽） |
| 字旗 `CASTLE.flag` | 80×64、字 52px（display），第 13 面（i=12）放大 `lastScale` 1.5 |
| 绕塔椭圆 `CASTLE.spireWrap` | 中心 (960,214)，rx 60、ry 15、倾角 −0.07，带宽 `w` 17 |
| 天幕卡 `CASTLE.card` | 城堡坐标 x −360–2280、y −200–1040（= 书内 x 300–1620、y 260–880）；书页下沿 `CASTLE.pageBottom` 1040 |

### 2.3 BOOK 书内坐标
- 书内坐标 = BK 机位为 `cam(960,540,1)` 时的屏幕坐标；`drawDesk / drawBook` 内部 `applyCam(g, cam, 1)`。`drawTitlePage` 直接是屏幕坐标、不吃机位。
- 合书封面 `BOOK.cover` x 960–1840、y 200–880，书脊带 `BOOK.spine` x 960–1000，右、下露 `BOOK.thick` 12px 书页厚度；金双线框 `BOOK.frame` x 1006–1794、y 240–840（内线再缩 12）；太阳徽章 `BOOK.sun` (1400,330) r=64；标题 `BOOK.title` 中心 (1400,500) 150px；副标题 `BOOK.subtitle` 起点 x 1388、基线 y 640、48px、步长 58，超过 `knee` 1660 开始挤扁、极限 `edge` 1792；书签 `BOOK.bookmark` x=1560 从 y 892 垂到 1000、宽 26；台灯 `BOOK.lamp` (200,100) r 900；署名贴签 `BOOK.label` x 1170–1630、y 694–848；小蜥蜴默认位 `BOOK.lizard` (1712,548)。
- 跨页 `BOOK.spread` x 80–1840、y 200–880，书缝 x=960；印刷画框 `BOOK.print` x 116–1804、y 236–844（印着 sky + far 两层，压平）；天幕卡 `BOOK.card` x 300–1620、y 260–880。
- 立体件映射：书内 = (960 + (x−960)·0.5, 800 + (y−880)·0.5)（`BOOK.popScale / popOrigin / castleOrigin`）。城墙底线 → 书内 y=800，主堡尖顶 → (960,420)，13 塔 x 630–1290；黎明的太阳（城堡 (960,−54) r139）→ 书内 (960,333)，BK-SPREAD 下屏幕约 (960,322)。
- 机位换算：`bookToCastleCam(c) = cam(960 + (c.x−960)·2, 880 + (c.y−800)·2, 0.5·c.zoom, c.rot)`，并带 `flat = 1 − smoothstep(0.93, 1.07, 城堡 zoom)`（远于 CA-W 时视差冻结成立体书平面）与 `strings = 1 − smoothstep(0.62, 0.97, 城堡 zoom)`（太阳铁丝、云和鸟的挂线可见度）。

### 2.4 面向 / 镜像
布景不镜像，没有 `face` 参数：旗的飘向由 `towers[i].side` 写死，山、城、屋的受光方向固定（左亮右暗，投影右下）。`drawRoundWindow` 的 `face` 是 `'out' | 'in'`（受光的外侧 / 逆光的内侧），不是左右镜像；`drawSleepyLizard` 的 `face`（默认 −1 朝左）只镜像身体，zzz 字母不镜像。

### 2.5 返回值
- `drawCastle` → `{ depth }`：该层实际视差深度（已含 flat）。
- `drawBook` → 画了封面外皮（合书或 θ<90°）时返回 `{ titleCenters: [[x,y]×4], sun: [x,y,r], cover: {x0,x1,y0,y1}, bookmarkTip: [x,y] }`（书内坐标，不含翻开压缩与发抖旋转）；θ≥90° 或只画 `'popup' / 'bookmark'` 时返回 `{}`。
- `drawTitlePage` → 片名四字中心（`o.title` 为假时 `null`）；`drawTitleGlyphs` → `[[cx,cy]×4]`。
- `bookPageRect / bookSpreadRect` → `{ x, y, w, h }`（屏幕逻辑像素）；`bookCardCovers` → boolean。
- `castleToScreen` → `[sx, sy]`；`roadPoint` → `[x, y, ang]`；`spireWrapPoint` → `{ x, y, ang, front }`。

## 3. 函数详解

### 3.1 `drawCastle(g, T, cam, o = {})` → `{ depth }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `g` | — | 画布上下文（通常是 `ctx.layer` 给的 `lg`） |
| `T` | — | 秒：驱动旗飘、烟、云、星闪、火、太阳光芒慢转等次级运动，以及 `fires / beacons / flags / tear` 的时刻判断 |
| `cam` | — | CASTLE 机位（`CAMS.*`、`cam()`、`bookCastleCam(T)`）；会读其中的 `flat`、`strings` 字段 |
| `o.layer` | `'main'` | `'sky' / 'far' / 'mid' / 'main' / 'near' / 'fg' / 'alarm'`，各层内容见下表 |
| `o.time` | `'dawn'` | 七个时段名之一（未知名按 dawn），或插值对象 `{ from, to, k, wipe }`：颜色、窗灯、星、鸟、花按 k 线性混合，太阳 / 月亮交叉淡化；`wipe:'down'` 时天空不是淡化而是从上往下擦换（擦线 y = lerp(−200, 900, k)） |
| `o.popup` | 不传（世界模式） | 立体书立起进度：数字（全部同值）、长度 23 的数组（顺序见 `POPUP_KEYS`，缺省项为 1）、或对象 `{card, hill, wall, towers(数字或 13 元数组), keep, roofs, flowers, sun, birds, clouds, princess}`（缺省项为 1）。**传了就进入立体书模式**：sky / far 两层裁在天幕卡里，各件以底边为轴 scaleY（outBack）立起，立起中带底部折角小片；全为 1 时与世界画面一致 |
| `o.flat` | `cam.flat ?? 0` | 冻结视差：`true`=1、`false`=0、或 0..1 渐变（b16 O02 压平成插画） |
| `o.strings` | `cam.strings ?? 0` | 挂线可见度 0..1（黎明太阳的细铁丝、云和纸鸟的吊线） |
| `o.detail` | `1` | 0 = 省掉石缝、草丛、瓦纹、车辙等细节（远景小图、性能紧张时） |
| `o.split` 或 `o.sky.split` | 无 | sky 层：L02 双天空分界线的屏幕 x；左侧照常（黎明），右侧 skyDoom + 火色地平线光 + 暗紫龙影拖尾；黎明的太阳、云、纸鸟只留在左侧，右侧换成危急色云 |
| `o.tear` | 无 | sky 层：纸天撕裂 `{ at, x, y, w = 300, h = 210, dur = 0.2 }`，sky 层坐标（CA-W 下 = 屏幕）；at 起 dur 秒内锯齿口按 outBack 张开，纸瓣向外翻出 paper2 背面，口内是 dragonDeep → ink |
| `o.sun` | 按时段 | `false` 不画日月；`{ x, y, r, kind }` **屏幕坐标**钉死的日月（不随机位动，O02 用 (1220,250) r70），`kind` 缺省取时段的种类（`'sun' / 'sunset' / 'moon'`） |
| `o.clouds` | `true` | `false` 不画四朵挂线云 |
| `o.birds` | 按时段 | 挂线纸鸟（3 只，原地滑翔）：`false / 0` 不画，数字 = 透明度；dawn / spring / wedding 默认画 |
| `o.fires` | 无 | near 层：屋顶着火 `[{ house, at }]`，house 0–5 对应 x 420 / 600 / 780 / 1140 / 1320 / 1500；at 起 0.3s 火舌 outBack 长大 + 爆点 burst 16 粒，之后烧焦、烟柱、火星；着火的房子烟囱不再冒白烟 |
| `o.beacons` | 无 | main 层：塔顶烽火 `[{ tower, at }]`；at 起该塔旗杆顶换成火盆 + 红火（0.25s outBack），旗不再画 |
| `o.redSeparate` | `false` | true 时 main 层不画灯笼光晕和烽火火焰，改由 `'alarm'` 层单独画（红色元素单独一层） |
| `o.lantern` | 关 | 阳台红灯笼：`true` 或 0..1 强度；开时 2Hz 脉冲发光 |
| `o.windows` | 按时段 | 窗灯 0..1（塔窗、主堡窗、老虎窗、城门内光、屋窗）；默认 dawn 0、doom 0.35、gray 0.15、spring 0、wedding 0、sunset 0.45、night 1 |
| `o.windowGlow` | `windows × 0.55` | 圆窗透光强度（传给 `drawRoundWindow` 的 glow） |
| `o.flags` | 无（空白小三角旗） | 写字方旗 `{ chars（或 text）, at:[13 个时刻], lastScale = 1.5, pops = true, finaleAt }`：塔 i 在 `at[i]` 起沿旗杆 spring 弹上去、0.08–0.42s 抖开、字淡入（`chars[i]`，display 52px，奶油底 scarf 边 ink 字），+0.22s 旗顶小纸烟花（`pops:false` 关）；第 13 面放大 `lastScale` 倍，`finaleAt` 时刻在它上方放金色光芒 + 烟花 |
| `o.deco` | 无 | 婚礼装饰翻折进度 0..1：尖顶放射彩旗串 → 塔间花环（由中间向两边 5 级）→ 城门花拱与阳台栏杆花环；每级错峰 0.115、各占 0.3，翻折时露 paper2 背面 |
| `o.bunting` | 按时段 | fg 层顶部两串彩旗 0..1；spring / wedding 默认 1，wedding 且传了 `deco` 时跟随 deco |
| `o.ribbonWrap` | 无 | 婚礼横幅绕尖塔一圈 `{ p, part, color = PAL.skyDayLow }`：p 是绕行进度 0..1（0–0.5 后半圈在尖顶后，0.5–1 前半圈在前）；`part:'back'` 只画后半、`'front'` 只画前半、不传两半都画（都在 main 层内） |
| `o.onBalcony` | 无 | 回调 `(g, { popup, floorY, railY, depth })`：在阳台门之前、栏杆之后画阳台上的人（主体层世界坐标，脚踩 `floorY` 590）；立体书里随 `popup.princess` 一起弹起 |
| `o.onWall` | 无 | 回调 `(g, { depth })`：在城墙之前画城墙上的人（被垛口挡住下半身，脚底建议 y≈700） |

各层内容与读取的参数：

| 层 | 深度 | 画什么 | 读哪些参数 |
|---|---|---|---|
| `sky` | 0.05（渐变 / split 在 0） | 天空渐变、地平线光、split 危急天、星（night）、日月、四朵云、三只挂线纸鸟、撕裂 | time, split, tear, sun, clouds, birds, popup.card/sun/clouds/birds, strings |
| `far` | 0.3 | 连绵远山、龙山（洞口 + 细烟）、雪峰（+ 小红旗）、近丘树丛、远田；立体书模式下天幕卡切口亮边 | time, popup.card |
| `mid` | 0.6 | 城丘、草纹、野花（dawn / spring / wedding）、两侧 6 棵树（春日 / 婚礼开樱花）、山路、花瓣（spring / wedding） | time, popup.hill, detail |
| `main` | 1.0 | （横幅后半圈）主堡（塔身、檐口、侧窗、尖顶、老虎窗、望楼、旗、圆窗、阳台门）→（横幅前半圈）→ 12 座塔（窗、锥顶、旗 / 字旗 / 火盆）→ 阳台（地板、托座、onBalcony、栏杆、花箱、灯笼、婚礼花环）→ onWall → 城墙（垛口、箭孔、勒脚、城门 + 吊闸、门旁红幡、引道）→ 婚礼装饰 | time, popup.keep/towers/wall/princess, flags, beacons, lantern, redSeparate, windows, windowGlow, deco, ribbonWrap, onBalcony, onWall, detail |
| `near` | 1.1 | 地面带（草、城门石板路、近段山路、灌木）、6 座房子、烟囱烟、着火 | time, popup.roofs, fires, windows, detail |
| `fg` | 1.4 | 左下 / 右下花丛（x −40 与 1960，y 1080 起）、顶部彩旗串、满屏花瓣（spring / wedding，立体书模式不画） | time, popup.flowers, bunting, deco |
| `alarm` | 1.0 | 只有灯笼红光与烽火火焰（配合 `redSeparate`） | lantern, beacons |

时段（`CASTLE_TIMES`）的固有差别：

| 时段 | 日 / 月（缺省位置） | 窗灯 | 纸鸟 | 樱花 / 彩旗 | 其它 |
|---|---|---|---|---|---|
| `dawn` | 太阳在**主体层** (960,−54) r139（= 立体书挂铁丝的那个） | 0 | 有 | 无（城丘上有淡野花） | goldLight 地平线光 |
| `doom` | 无 | 0.35 | 无 | 无 | 紫红天、火色云边、烟发暗 |
| `gray` | 无 | 0.15 | 无 | 无 | 灰蓝去饱和 |
| `spring` | 太阳 sky 层 (1220,250) r62（柔光） | 0 | 有 | 有 | 粉彩 |
| `wedding` | 同 spring | 0 | 有 | 有（彩旗跟随 deco） | 金粉色地平线 |
| `sunset` | 夕阳圆盘 sky 层 (1220,250) r70 | 0.45 | 无 | 无 | 屋脊勾 goldLight 边 |
| `night` | 月亮 sky 层 (1220,250) r56 | 1 | 无 | 无 | 星 90 颗 + 闪烁四角星 11 颗 |

### 3.2 `castleToScreen(cam, layer, x, y, o = {})` → `[sx, sy]`
| 参数 | 默认值 | 说明 |
|---|---|---|
| `cam` | — | 同 drawCastle 的机位（读 `flat`） |
| `layer` | — | 层名（取 `CASTLE.depth`），另有 `'skyFill'` = depth 0（split 坐标） |
| `x, y` | — | 该层世界坐标 |
| `o.flat` | `cam.flat ?? 0` | 与 drawCastle 相同语义 |

主体层上的长度换算：屏幕长度 = 世界长度 × `(1 + (zoom − 1)·depth)`，depth 1 时就是 `× zoom`（例：圆窗屏幕半径 = 70 × cam.zoom）。

### 3.3 山路与城丘
- `roadPoint(u)`：u 夹在 0..1，按弧长取点，返回 `[x, y, ang]`（mid 层坐标，ang 为切线角，弧度）。0 = 城门 (960,880)，1 = 右下出画 (2050,1160)。
- `roadPoints()`：返回新的点数组（73 点，可随意修改）。
- `hillTopY(x)`：城丘椭圆顶边 y；|x−960| ≥ 1300 时返回 1150。

### 3.4 `tearPath(tear, T)` → `Path2D | null`
`tear` 同 `o.tear`。返回撕口外轮廓（sky 层坐标）；场景裁剪龙头时先 `applyCam(lg, cam, CASTLE.depth.sky)`（flat 非 0 时用 `lerp(0.05, 1, flat)`）再 `lg.clip(path)`。

### 3.5 `spireWrapPoint(u)` 与 `drawSpireWrap(g, T, cam, o = {})`
- `spireWrapPoint(u)` → `{ x, y, ang, front }`：u=0 在椭圆左端，先绕到背面（`front:false`），u=0.5 回到右端转到正面（`front:true`），主体层坐标；ang 为切线角。
- `drawSpireWrap` 参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `o.p` | `1` | 绕行进度 0..1（与 `ribbonWrap.p` 相同） |
| `o.part` | `'front'` | `'front'`：画 u 0.5–p；`'back'`：画 u 0–min(0.5,p) |
| `o.color` | `PAL.skyDayLow` | 横幅底色（经时段染色；后半圈再压暗 22%） |
| `o.time` | `'dawn'` | 时段（决定染色），婚礼时传 `'wedding'` |
| `o.flat` | `cam.flat ?? 0` | 同上 |

横幅宽 17，带两道 gold 边线，白色切口亮边。

### 3.6 `drawRoundWindow(g, o = {})`（共享实现，只读）
| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | `0, 0` | 圆心（当前变换下的坐标；不吃机位） |
| `r` | `70` | 玻璃半径（石框外缘 r×1.18） |
| `face` | `'out'` | `'out'` 外侧受光（玻璃偏暗、石框亮边）；`'in'` 内侧逆光（透亮 + 放射光束） |
| `glow` | in 0.6 / out 0 | 光晕与光束强度 |
| `t` | `0` | 秒（光束微摆） |
| `seed` | `5` | 纸边种子（外景与玫瑰窗要匹配时保持一致） |

drawCastle 在 main 层用 `{ x:960, y:430, r:70, face:'out', t:T, glow: windowGlow }` 调它；night / doom / gray 时再压一层时段色。

### 3.7 `paintSun(g, st, kind, x, y, r, a = 1, soft = 0, glowK = 1)`
`st` 只需 `{ T }`（光芒以 T·0.12 慢转）；`kind`：`'sun'`（12 道长短交替纸光芒 + 圆盘）、`'sunset'`（goldLight→fire 渐变圆盘 + 横纹）、`'moon'`（月面 + 环形山）。`soft` 为真时光芒半透明；`glowK` 光晕倍率。在当前变换下画，不吃机位。

### 3.8 `drawDesk(g, T, cam, o = {})`
| 参数 | 默认值 | 说明 |
|---|---|---|
| `o.layer` | `'desk'` | `'desk'`：woodDark 桌面 + 木板 / 木纹 / 木节 + 台灯光斑（screen）；`'dust'`：台灯光里的浮尘（field 粒子，放前景层） |
| `o.lamp` | `1` | 0..1：0 关灯；光斑半径 600→900、亮度随之 |
| `o.count` | `40` | 浮尘粒数（只对 `'dust'`） |

### 3.9 `drawBook(g, T, cam, o = {})` → info
| 参数 | 默认值 | 说明 |
|---|---|---|
| `o.layer` | `'book'` | `'book'` 书体 / 书页 / 封面（含署名贴签与小蜥蜴）；`'popup'` 立体件；`'bookmark'` 书签 + 卷轴尾；`'all'` 三者依次画（只适合模型图，正式镜头分层包图层） |
| `o.open` | `0` | 0..1，封面翻开角 θ = open·180°，铰链 x=960；θ<90° 外皮按 cosθ 压缩并随 sinθ 变暗，θ>90° 画内侧 kraft 衬页（左页）；封面影子扫过右页 |
| `o.cover` | `{}` | `{ foilSweep, star, subtitle, subtitleAlpha = 1, tremble, gleam }`：foilSweep 0<x<1 时金箔高光从左扫过标题（只落在字形里）；star 0..1「吧」右上四角星（outBack 后淡出）；subtitle 0..1 副标题写到第 subtitle·9 个字，过 x 1660 指数挤扁并轻颤；subtitleAlpha 副标题整体淡出；tremble 0..1 整本书 9.5Hz ±1.5° 发抖（合书绕 (1400,540)，翻开后绕 (960,540)）；gleam 0..1 关灯后烫金字的微光 |
| `o.bookmark` | `{}` | `{ wobbleAt, extra, roll }`：wobbleAt 时刻起 4Hz 抽动；`extra:'scroll'` 书口右下多垂一截卷轴尾；roll 0..1 卷轴卷回成一小卷 |
| `o.popup` | 全部为 1 | 同 drawCastle 的 popup（数字 / 23 元数组 / 对象）。**注意：drawBook 不传 popup 时视为全部立起**（drawCastle 不传则是世界模式） |
| `o.fold` | `0` | 0..1 立体件按开场反序折倒（公主 → 云 → 纸鸟 → 太阳 → 花丛 → 屋顶 → 主堡 → 塔（从右到左）→ 城墙 → 城丘 → 天幕卡），与 popup 取较小值 |
| `o.castle` | `{}` | 原样转给 drawCastle 的选项（`time`、`onBalcony`、`flags`、`windows`…）；同时决定书页上“印刷”的天空与远山（印刷时强制 flat、不画云鸟日月） |
| `o.pop` | 六层全画 | 本次 `'popup'` 调用要画的 castle 层名数组，用来把立体件拆进不同图层（配合 `LAYER_GROUPS`） |
| `o.label` | 无 | 片尾署名贴签：数字 p（四行全显）或 `{ p, lines:[4] }`；p 0..1 从下方 outBack 滑上来贴住，lines 每行逐字写出进度（serif，ink） |
| `o.lizard` | 无 | 片尾小蜥蜴：真值即画；对象 `{ x = 1712, y = 548, s = 1, face = −1, pose:'sleep'/'crawl', eye = 0, zzz = 1 }` 转给 `drawSleepyLizard` |
| `o.lizardFn` | 无 | 替换小蜥蜴的钩子：`(g, { x, y, s, face, sleep, eye, t })`（sleep = pose 不是 `'crawl'`） |
| `o.lamp` | `1` | 只影响封面上的台灯反光与太阳徽章光晕（桌上光斑由 drawDesk 画） |

`'popup'` 只在 `open ≥ 0.999` 时画；内部按 `bookToCastleCam(cam)` 换算机位，所以 flat / strings 自动随推镜变化。立体件裁在天幕卡横向范围内；flat≈1 时下沿裁在书页下沿，flat→0（接近 CA-W 及更近）时放开，地面带可以盖过书页下沿。

### 3.10 `drawTitlePage(g, T, o = {})` 与 `drawTitleGlyphs(g, o = {})`
`drawTitlePage`：满屏 redDeep 皮面 + 皮纹颗粒 + 暗角 + gold 双线框（外框 60–1860 × 60–1020，内框 76–1844 × 76–1004）+ 四角卷草（s 1.55）。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `o.title` | 无（空页） | `true` 或选项对象，交给 `titleFn` 画片名 |
| `o.rays` | `0` | 0..1 字后慢转 goldLight 光芒（18 道，中心 (960,470)） |
| `o.titleFn` | `drawTitleGlyphs` | 片名绘制函数，调用为 `titleFn(g, { T, ...o.title })` |

`drawTitleGlyphs` 选项：`x = 960`（行中心）、`y = 560`（基线）、`size = 300`、`rise = [1,1,1,1]`（每字 0..1，以基线为锚 scaleY outBack）、`foil = 0`（0<x<1 扫光）、`star = 0`（0..1 四角星）、`T = 0`。三层纸叠：paper (+16,+16)、gold (+8,+8)、goldLight 亮边、red 顶层。

### 3.11 `drawSleepyLizard(g, T, o = {})` 与 `scrollCorner(g, x, y, sx, sy, s = 1, col = PAL.gold)`
- 小蜥蜴：`x = 0, y = 0, s = 1`（全长约 60）、`face = −1`、`pose = 'sleep' | 'crawl'`、`eye = 0`（0..1 睁开一只发光眼）、`zzz = 1`（zzz 字母强度）。头顶顶着迷你名字牌（画成点纹纸带）。
- 卷草角：角点在 (x,y)，向 (sx, sy) 象限展开（±1），s=1 时约 112px 见方。

### 3.12 机位函数
- `bookPushCam(T)`：`T < 105` 走推镜段：`k = ez(T, 8.2, 10.39, glide)`，从 BK_SPREAD `cam(960,560,0.96)` 推到 BK_PUSH_END `cam(960,640,3.2)`；缩放按 k 几何插值，高度用单调缓出曲线，使路径恰好经过 CA-W 的等效点 BK_CAW `cam(960,630,2.0)`。`T ≥ 105` 走拉回段：从 BK_CAW 沿同一路径拉回 BK_SPREAD（`ez(T, 199.3, 199.66, glide)`）。段外夹在端点：10.39 之后恒为 BK_PUSH_END，199.66 之后恒为 BK_SPREAD。
- 关键值（实测）：

| T | 书内机位 | 城堡等效机位 | flat | strings | `bookPageRect` |
|---|---|---|---|---|---|
| 8.20 | (960,560,0.960) | (960,400,0.480) | 1 | 1 | 326,252,1267×595 |
| 9.20 | (960,612,1.517) | (960,504,0.758) | 1 | 0.65 | −41,6,2002×940 |
| 9.50 | (960,636,2.327) | (960,552,1.164) | 0 | 0 | −576,−334,3072×1443 |
| 9.75 | (960,640,2.820) | (960,559,1.410) | 0 | 0 | −901,−530,3723×1748 |
| 9.99 | (960,640,3.073) | (960,560,1.536) | 0 | 0 | −1068,−628,4056×1905 |
| 10.39 | (960,640,3.200) | **CA_MW (960,560,1.6)** | 0 | 0 | −1152,−676,4224×1984 |
| 199.30 | (960,630,2.000) | **CA_W (960,540,1.0)** | 0.5 | 0 | −360,−200,2640×1240 |
| 199.66 | (960,560,0.960) | (960,400,0.480) | 1 | 1 | 326,252,1267×595 |

  flat 从 1 切到 0 落在城堡 zoom 0.93–1.07（b01 约 9.34–9.44、b17 约 199.30–199.40），此时机位就在 CA-W 附近，各层视差几乎重合，看不出接缝。`bookCardCovers(T)` 在 b01 从约 9.45 起为 true；b17 拉回段卡片下沿已在屏内（y 1040），始终为 false。
- `bookToCastleCam(c)` / `castleToBookCam(c)` / `bookCastleCam(T)`：见 2.3。注意 `bookCastleCam(T)` 在 10.39 ≤ T < 105 恒等于 `CA_MW`（外加 flat 0、strings 0），在 199.30 恰好等于 `CA_W`。
- `bookPageRect(T, c = bookPushCam(T))`：`BOOK.card` 在机位 c 下的屏幕矩形；`bookSpreadRect` 同理换成 `BOOK.spread`；`bookCardCovers(T, c)` = 卡片矩形完全包住 0–1920 × 0–1080。三者都可以传自己的书内机位 c（例如 b17 合书后的 lerpCam）。
- `bookPopupAt(T)`：b01 立起时刻表（线性进度，drawCastle 内部再套 outBack）：card 5.00–5.30、hill 5.20–5.55、wall 5.45–5.80、塔 i 在 5.70+0.055i 起 0.32s、keep 6.50–6.88、roofs 6.80–7.12、flowers 7.00–7.30、sun 7.20–7.85、birds 7.50–7.90、clouds 7.70–8.10、princess 7.90–8.20；8.20 起全部为 1。

## 4. 枚举全表

### 4.1 castle `layer`
| 值 | 说明 | 用在 |
|---|---|---|
| `sky` | 天空、日月、云、挂线纸鸟、split、撕裂 | b01（立体件）、b02、b14、b15、b16、b17 |
| `far` | 远山、雪峰红旗、龙山冒烟 | 同上 |
| `mid` | 城丘、树、山路 | 同上（b17 卷轴沿 `roadPoints` 铺路） |
| `main` | 城墙、13 塔、主堡、圆窗、阳台、城门、婚礼装饰 | 同上 |
| `near` | 地面带、城下屋顶、烟、火 | 同上（b02 L03 火雨） |
| `fg` | 角落花丛、彩旗串、花瓣 | 同上 |
| `alarm` | 灯笼红光 + 烽火（配合 `redSeparate`） | b02 L05 18.00–20.10 |

### 4.2 castle `time`
| 值 | 说明 | 用在 |
|---|---|---|
| `dawn` | 黎明，金色地平线，主体层挂铁丝的太阳 | b01 立体书 0–10.0；b02 b02_peace 9.50–12.11（L01） |
| `doom` | 危急紫红 | b02 b02_attack 12.11–17.00（L02 split 12.11–12.70 由 dawn 推过去；L03 火雨；L04 鸟笼） |
| `gray` | 灰蓝 | b02 17.00–20.10（`{from:'doom',to:'gray',k,wipe:'down'}` 17.00–18.00 从上往下褪色；L05 国王） |
| `spring` | 春日樱花、彩旗 | b14 b14_flags 165.45–169.00（E04 升旗） |
| `wedding` | 婚礼粉金 | b15 全块 176.80–185.47；b16 b16_short 185.47 起（O01） |
| `sunset` | 夕阳圆盘、长影 | b16 186.20–187.60 由 wedding 插值过去，O02 187.75–189.95 |
| `night` | 夜、窗灯、星、月 | b17 b17_fullname 198.50–199.66（O07 圆窗拉出 → 合书前）；也是 b17 书页印刷天空 |
| `{from,to,k,wipe}` | 两时段插值；`wipe:'down'` 天空从上往下擦换 | b02 L02 / 17.00–18.00、b16 O01→O02 |

### 4.3 popup 下标（`POPUP_KEYS`）
`0 card 天幕卡｜1 hill 城丘｜2 wall 城墙｜3–15 tower0–tower12｜16 keep 主堡（含阳台、圆窗）｜17 roofs 城下屋顶 + 地面带｜18 flowers 前景花丛｜19 sun 太阳（沿铁丝升起）｜20 birds 纸鸟（吊线落下）｜21 clouds 云（吊线落下）｜22 princess 阳台上的人（onBalcony 回调整体 scaleY）`。用在 b01 b01_popup 5.00–8.20（`bookPopupAt`）、b17 b17_slam 199.75–199.95（`fold`）。

### 4.4 其它枚举
| 枚举 | 值 | 说明 | 用在 |
|---|---|---|---|
| `drawBook` `layer` | `book / popup / bookmark / all` | 见 3.9 | b01、b17 |
| `drawDesk` `layer` | `desk / dust` | 桌面 / 浮尘 | b01、b17 |
| `cover` 字段 | `foilSweep / star / subtitle / subtitleAlpha / tremble / gleam` | 见 3.9 | b01 b01_cover（1.20–4.30）、b17 b17_endcard（202.20–206.60） |
| `bookmark.extra` | `'scroll'` | 书口多垂卷轴尾 | b17 200.30 起 |
| 小蜥蜴 `pose` | `sleep / crawl` | 蜷睡 / 爬行 | b17 204.80–205.80 爬、之后睡、206.60 睁眼 |
| `drawRoundWindow` `face` | `out / in` | 外侧受光 / 内侧逆光 | 外景圆窗 b02、b14（E05 推入前）、b15（拉出后）、b17（O07 拉出后）；王座厅玫瑰窗用 in |
| `paintSun` `kind` | `sun / sunset / moon` | 太阳 / 夕阳 / 月亮 | 各时段；封面太阳徽章（sun） |
| `ribbonWrap.part` | `back / front / 不传` | 只画后半 / 只画前半 / 两半 | b15 b15_gift 184.40–184.70 |
| castle `CAMS` | `CA_W` (960,540,1.0) | 全城 | b02 12.60–13.05 起（L02 看全天空）、b14 165.45–168.40、b16 O02 187.75–189.95、b17 198.50–199.30 |
| | `CA_MW` (960,560,1.6) | 主堡 + 阳台 + 邻塔 | b02 L01 10.39 推镜落定 |
| | `CA_BAL` (960,545,2.6) | 阳台中景 | b02 L04 15.20–15.41；b15 E11 180.85–181.66；b16 O01 185.60–187.75 |
| | `CA_TOWN` (960,900,1.8) | 城下屋顶 | b02 13.60–15.20（L03 火雨） |
| | `CA_BAL_K` (856,562,2.6) | L05 国王构图近似值（以「！」圆点 (1500,400) 反解为准） | b02 b02_king 18.00–20.10 |
| book `CAMS` | `BK_COVER` (1400,540,1.04) | 封面居中 | b01 0–3.70；b17 201.60 之后 |
| | `BK_SPREAD` (960,560,0.96) | 跨页全景 | b01 5.20–8.20；b17 199.66–200.60 |
| | `BK_PUSH_END` (960,640,3.2) | 推镜终点（= CA_MW） | b01 / b02 10.39 |
| | `BK_CAW` (960,630,2.0) | CA_W 的书内等效点（拉回起点） | b17 199.30 |

## 5. 推荐用法

### 5.1 王城六层 + LAYER_FX + 漂移 + 角色挂点（通用写法）
```js
import { drawCastle, castleToScreen, CAMS as CA, LAYER_FX } from '../env/castle.js';
import { applyCam, lerpCam, drift } from '../core/camera.js';
import { ez, glide } from '../core/ease.js';
// drawPrincess / drawCitizen 来自 src/rigs/princess.js、src/rigs/folk.js（参数见各组 API）

const LAYERS = ['sky', 'far', 'mid', 'main', 'near', 'fg'];
// 机位：预设之间 glide，再叠轻漂移（交接段、O02、O04 不叠）
const base = lerpCam(CA.CA_W, CA.CA_MW, ez(T, 12.6, 13.05, glide));
const [dx, dy] = drift(T, { amp: 5, speed: 0.35 });
const c = { ...base, x: base.x + dx, y: base.y + dy };
const o = {
  time: 'dawn',
  // 阳台上的人：主体层坐标，脚踩 a.floorY（590）；花箱在 x 860–922，三人站位建议 x≈935 / 985 / 1035
  onBalcony: (lg, a) => drawPrincess(lg, { x: 985, y: a.floorY, s: 0.26, t: T /* pose 见 princess API */ }),
};
for (const layer of LAYERS) {
  ctx.layer(g, LAYER_FX[layer], (lg) => {
    const { depth } = drawCastle(lg, T, c, { ...o, layer });
    if (layer === 'near') {            // 城下地面带的人（s=0.30）：同一图层里、画在房子与火之后
      lg.save(); applyCam(lg, c, depth);
      drawCitizen(lg, { x: 700, y: 1010, s: 0.30, t: T, face: -1 });
      lg.restore();
    }
  });
}
// 屏幕跟随：阳台上方挂气泡 / 闪光
const [sx, sy] = castleToScreen(c, 'main', 985, 520);
```
六层 = 6 个缓冲；本帧还要叠龙、遮罩等时改用 5.2 的 `LAYER_GROUPS`（3 个缓冲）。fg 层 `LAYER_FX.fg.blur` 为 3，近景（zoom>1.5）可加到 4。

### 5.2 b01：立体书开场 + 推镜（交接期精简）
```js
import { drawDesk, drawBook, bookPushCam, bookPopupAt, bookCardCovers, CAMS as BK } from '../env/book.js';
import { LAYER_GROUPS } from '../env/castle.js';
import { lerpCam } from '../core/camera.js';
import { ez, glide, inOutCubic, outQuad } from '../core/ease.js';
import { seg, hit } from '../core/util.js';
import { CASTLE_OPTS } from './b01/shared.js';   // { time:'dawn', onBalcony: 公主 }：与 b02 共用同一个对象 / 函数

draw(g, T, lt, ctx) {
  ctx.fx.fade = Math.max(ctx.fx.fade || 0, 1 - outQuad(seg(T, 0, 1.2)));
  const lamp = seg(T, 0, 1.2);
  const open = inOutCubic(seg(T, 3.7, 4.9));
  const c = T < 8.2 ? lerpCam(BK.BK_COVER, BK.BK_SPREAD, ez(T, 3.7, 5.2, glide)) : bookPushCam(T);
  const cover = { foilSweep: seg(T, 1.2, 2.4), star: seg(T, 2.4, 3.0), subtitle: seg(T, 2.4, 4.2), subtitleAlpha: 1 - seg(T, 4.3, 4.5), tremble: hit(T, 4.3, 0.22) };
  const castle = CASTLE_OPTS;
  const popup = bookPopupAt(T);
  const lean = T >= 8.2 && bookCardCovers(T, c);      // 约 9.45 起卡片盖满屏：书桌 / 书体 / 书签都在画外
  if (!lean) drawDesk(g, T, c, { lamp });
  if (!lean) ctx.layer(g, { shadow: 14, texture: 0.3 }, (lg) => drawBook(lg, T, c, { layer: 'book', open, cover, lamp, castle }));
  for (const [pop, fx] of LAYER_GROUPS) ctx.layer(g, fx, (lg) => drawBook(lg, T, c, { layer: 'popup', open, popup, castle, pop }));
  if (!lean) ctx.layer(g, { shadow: 6, blur: 2 }, (lg) => {
    drawBook(lg, T, c, { layer: 'bookmark', open, bookmark: { wobbleAt: 3.2 } });
    drawDesk(lg, T, c, { layer: 'dust', lamp: lamp * (1 - seg(T, 8.2, 9.2)) });
  });
  // 7.90 公主弹出的闪光：立体书里城堡点的屏幕位置
  // const [px, py] = castleToScreen(bookToCastleCam(c), 'main', 985, 560);
}
```
交接期 b01 精简后 3 个缓冲 + b02 遮罩 1 + 遮罩内 3 = 7 ≤ 8；不精简是 9，超预算。

### 5.3 b02：交接遮罩 → 推镜延续到 CA-MW → L02 / L03 / L05
```js
import { drawCastle, tearPath, LAYER_GROUPS, LAYER_FX, CASTLE, CAMS as CA } from '../env/castle.js';
import { bookCastleCam, bookPageRect } from '../env/book.js';
import { applyCam, drift } from '../core/camera.js';
import { seg, lerp } from '../core/util.js';
import { CASTLE_OPTS } from './b01/shared.js';   // 与 b01 同一份 { time:'dawn', onBalcony }（放块共享文件，不各写一份）

const world = (g, T, ctx, c, o) => {
  for (const [pop, fx] of LAYER_GROUPS) ctx.layer(g, fx, (lg) => { for (const layer of pop) drawCastle(lg, T, c, { ...o, layer }); });
};
// b02_peace [9.50, 12.11)
draw(g, T, lt, ctx) {
  const c0 = bookCastleCam(T);                       // 9.50–10.39 与 b01 同一条推镜；10.39 起恒等于 CA_MW
  const k = seg(T, 10.39, 11.2);                     // drift 只在推镜落定后淡入，交接段机位必须与 b01 完全相同
  const [dx, dy] = drift(T, { amp: 5 });
  const c = { ...c0, x: c0.x + dx * k, y: c0.y + dy * k };
  if (T < 10.0) ctx.mask(g, (mg) => { const r = bookPageRect(T); mg.fillRect(r.x, r.y, r.w, r.h); }, (lg) => world(lg, T, ctx, c, CASTLE_OPTS));
  else world(g, T, ctx, c, CASTLE_OPTS);
}
```
- 交接要点：同一 T、同一机位函数（`bookCastleCam`，不加 drift）、同一 `LAYER_GROUPS`、同一份 castle 选项（`time:'dawn'`、同一个 `onBalcony` 函数且同参数）；遮罩**不要羽化**（9.50 时卡片下沿只比屏幕下沿多 29px）。
- L02 双天空与撕裂（CA-W 下 sky 层坐标 = 屏幕）：
```js
const TEAR = { at: 13.10, x: 1320, y: 300 };
const o = {
  time: { from: 'dawn', to: 'doom', k: seg(T, 12.11, 12.7) },
  split: lerp(2300, -400, seg(T, 12.11, 12.7)),         // 龙影后缘：右侧露出 skyDoom，向左扩张
  tear: TEAR,
};
// 龙头从撕口钻出：在 sky 深度坐标里按撕口裁剪
ctx.layer(g, { shadow: 10 }, (lg) => {
  const hole = tearPath(TEAR, T);
  if (!hole) return;
  const base = lg.getTransform();
  lg.save();
  applyCam(lg, c, CASTLE.depth.sky); lg.clip(hole);   // 裁剪区按 sky 深度定下来
  lg.setTransform(base); applyCam(lg, c, 1);          // 再回到龙头自己的深度画（裁剪仍然有效）
  drawDragon(lg, { /* 龙头参数见 dragon API */ });
  lg.restore();
});
```
- L03 火雨：`fires: [{ house: 3, at: 14.18 }, { house: 5, at: 14.30 }, { house: 4, at: 14.42 }, { house: 2, at: 14.66 }, { house: 1, at: 14.78 }]`（1140 已在 14.18 点着，其余从右往左每 0.12s）。
- 17.00–18.00 褪成灰蓝：`time: { from: 'doom', to: 'gray', k: seg(T, 17, 18), wipe: 'down' }`。
- L05（CA_BAL_K）红色单独一层：
```js
const o = { time: 'gray', lantern: 1, redSeparate: true, beacons: [{ tower: 4, at: 18.40 }, { tower: 5, at: 18.60 }], onBalcony: drawKingOnBalcony };
world(g, T, ctx, c, o);
ctx.layer(g, LAYER_FX.alarm, (lg) => drawCastle(lg, T, c, { ...o, layer: 'alarm' }));
```

### 5.4 b17：O07–O08 夜景 → 拉回成书 → 折倒 → 合书 → 片尾卡
```js
import { drawDesk, drawBook, bookPushCam, CAMS as BK } from '../env/book.js';
import { drawCastle, LAYER_GROUPS, CAMS as CA } from '../env/castle.js';
import { lerpCam } from '../core/camera.js';
import { ez, glide, inExpo } from '../core/ease.js';
import { seg } from '../core/util.js';

draw(g, T, lt, ctx) {
  const castle = { time: 'night' };
  if (T < 199.3) {                                   // 198.90–199.30 夜景 CA-W：不加 drift（或在 199.30 前收到 0）
    for (const [pop, fx] of LAYER_GROUPS) ctx.layer(g, fx, (lg) => { for (const layer of pop) drawCastle(lg, T, CA.CA_W, { ...castle, layer }); });
    return;
  }
  // 199.30 起：bookPushCam 拉回段（同一路径反向），199.30 这一帧与上面的世界画面逐像素一致（已验）
  const open = T < 199.95 ? 1 : 1 - inExpo(seg(T, 199.95, 200.3));                 // θ 180→0
  const c = T < 200.6 ? bookPushCam(T) : lerpCam(BK.BK_SPREAD, BK.BK_COVER, ez(T, 200.6, 201.6, glide));
  const fold = seg(T, 199.75, 199.95);                                               // 反序折倒
  const lamp = T < 206.4 ? 1 : 0;
  const cover = {
    foilSweep: seg(T, 202.2, 202.9), star: seg(T, 202.85, 203.4),
    subtitle: T >= 206 ? Math.min(3, (T - 206) / 0.2 + 1) / 9 : 0,                  // 斑 206.00 / 得 206.20 / 贝 206.40
    tremble: T >= 206.2 && T < 206.5 ? 0.8 : 0, gleam: lamp ? 0 : 1,
  };
  const label = T < 202.8 ? 0 : { p: seg(T, 202.8, 203.2), lines: [203.3, 203.6, 203.9, 204.2].map((t0) => seg(T, t0, t0 + 0.3)) };
  const crawl = seg(T, 204.8, 205.8);
  const lizard = T < 204.8 ? null : crawl < 1
    ? { x: 1860 - 150 * crawl, y: 880 - 330 * crawl, pose: 'crawl' }
    : { pose: 'sleep', eye: T > 206.6 && T < 206.95 ? 1 : 0 };
  drawDesk(g, T, c, { lamp });
  ctx.layer(g, { shadow: 14, texture: 0.3 }, (lg) => drawBook(lg, T, c, { layer: 'book', open, cover, lamp, castle, label, lizard }));
  if (open >= 0.999) for (const [pop, fx] of LAYER_GROUPS) ctx.layer(g, fx, (lg) => drawBook(lg, T, c, { layer: 'popup', open, fold, castle, pop }));
  ctx.layer(g, { shadow: 6, blur: 2 }, (lg) => {
    drawBook(lg, T, c, { layer: 'bookmark', open, bookmark: { wobbleAt: 200.3, extra: T >= 200.3 ? 'scroll' : undefined, roll: seg(T, 200.4, 201.2) } });
    drawDesk(lg, T, c, { layer: 'dust', lamp: lamp * seg(T, 199.36, 199.66) });     // 浮尘随书页入画淡入，否则 199.30 会跳出来
  });
  if (!lamp) ctx.fx.bright = 0.55;
}
```
200.60 之后 `bookPushCam(T)` 恒为 BK_SPREAD，所以 lerpCam 从 BK_SPREAD 起步是连续的；书合上（open<0.999）后不再画 popup。

### 5.5 b14 / b16：E04 升旗、圆窗推入、O01→O02 时段插值与压平
```js
import { NAME_TIMES } from '../ui/type.js';
import { NAMES } from '../cues.js';
import { seg } from '../core/util.js';
import { drawCastle, castleToScreen, roadPoint, CASTLE, CAMS as CA, LAYER_FX } from '../env/castle.js';

// b14 E04：13 面旗按逐字时刻升起，第 13 面「城」自动放大 1.5 倍，168.40 金色烟花
const FLAGS = { chars: NAMES.city, at: NAME_TIMES('E04'), finaleAt: 168.40 };
const o = {
  time: 'spring', flags: FLAGS,
  onWall: (lg) => { for (const x of [470, 690, 1230, 1450]) drawCitizen(lg, { x, y: 700, s: 0.26, t: T }); },
};
const [hx, hy, ang] = roadPoint(1 - seg(T, 165.6, 168.8));     // 白马沿山路向左回城（mid 层坐标，CA-W 下 = 屏幕）
// 168.55–169.00 圆窗遮罩：圆窗在当前机位下的屏幕圆（含石框）
const [wx, wy] = castleToScreen(c, 'main', CASTLE.window.x, CASTLE.window.y);
const wr = CASTLE.window.r * 1.18 * c.zoom;

// b16：O01 婚礼 → 夕阳，O02 钉死太阳并压平成插画
const flat = seg(T, 188.8, 189.4);
const o2 = {
  time: { from: 'wedding', to: 'sunset', k: seg(T, 186.2, 187.6) },
  flags: { chars: NAMES.city, at: NAME_TIMES('E04') },          // 时刻都已过去 = 旗一直在飘
  sun: { x: 1220, y: 250, r: 70 },                               // 屏幕钉死（夕阳很远，全程钉住看不出）
  flat,
};
for (const layer of ['sky', 'far', 'mid', 'main', 'near', 'fg']) {
  const fx = { ...LAYER_FX[layer] };
  if (fx.shadow) fx.shadow *= 1 - flat;                          // 投影缩到 0
  ctx.layer(g, fx, (lg) => drawCastle(lg, T, c, { ...o2, layer }));
}
```

### 5.6 b15：婚礼装饰翻折 + 横幅绕尖塔（前后遮挡）+ 纸鸽
```js
import { drawCastle, drawSpireWrap, spireWrapPoint, LAYER_FX } from '../env/castle.js';
import { applyCam } from '../core/camera.js';
import { seg } from '../core/util.js';
// FLAGS_DONE（字旗，时刻都已过去）、drawTrio（阳台三人）、drawDove（纸鸽）是场景自己的常量 / 函数

const deco = seg(T, 176.95, 177.40);                 // 彩旗串 → 花环 → 花拱，内部错峰约 50ms
const wrapP = seg(T, 184.40, 184.70);                // 勇者横幅绕尖塔一圈
const o = { time: 'wedding', deco, flags: FLAGS_DONE, ribbonWrap: { p: wrapP, part: 'back' }, onBalcony: drawTrio };
const q = spireWrapPoint(wrapP);                     // 纸鸽位置（主体层坐标）
const dove = (lg) => { lg.save(); applyCam(lg, c, 1); drawDove(lg, q.x, q.y - 10, q.ang); lg.restore(); };
for (const layer of ['sky', 'far', 'mid', 'main', 'near', 'fg']) {
  ctx.layer(g, LAYER_FX[layer], (lg) => {
    drawCastle(lg, T, c, { ...o, layer });           // main 里只画后半圈（在尖顶后）
    if (layer === 'mid' && !q.front) dove(lg);       // 鸽子在背面：画在主体层之前，被尖塔挡住
  });
}
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  if (q.front) dove(lg);
  drawSpireWrap(lg, T, c, { p: wrapP, part: 'front', time: 'wedding' });   // 前半圈压在尖塔与鸽子之上
});
```
共 7 个缓冲。184.70 的蝴蝶结是单独道具，系在 `spireWrapPoint(1)` 附近的尖顶上（尖顶尖 (960,120)）。

## 6. 与 assets.md 的差异

**castle.js**
- 新增层 `'alarm'`（灯笼红光 + 烽火）与参数 `redSeparate`；新增机位 `CA_BAL_K`（L05）。
- 新增导出：`LAYER_FX`、`LAYER_GROUPS`、`CASTLE_TIMES`、`POPUP_KEYS`、`castleToScreen`、`roadPoint`、`roadPoints`、`hillTopY`、`tearPath`、`paintSun`、`spireWrapPoint`、`drawSpireWrap`。`drawRoundWindow` 实际实现在共享的 `roundwindow.js`，castle.js 转出（签名多了 `glow / t / seed`）。
- `time` 另接受插值对象 `{from, to, k, wipe:'down'}`。
- `split` 两种写法都认：`o.split` 或 assets 写的 `o.sky = { split }`；值是屏幕 x（depth 0）。
- `tear` 多了 `w / h / dur`；`sun` 多了 `kind`，并可传 `false` 隐藏；`lantern` 可传 0..1；`windows` 是 0..1 数值（不是开关），不传时按时段取默认。
- `flags` 多了 `text`（同 chars）、`lastScale`、`pops`、`finaleAt`；`ribbonWrap` 多了 `color`，`part` 不传时两半都画。
- 新增参数：`onBalcony`、`onWall`（角色挂点回调）、`bunting`、`windowGlow`、`clouds`、`birds`、`detail`、`flat`（数值 0..1，不只 true）、`strings`。
- `popup` 还接受对象形式；数组长度 23（13 座塔各占一位）。
- **黎明的太阳不在 depth 0.05**：它在主体层 (960,−54) r139（立体书里挂铁丝升到书内 (960,333) 的那个），其它时段的日月才在 sky 层 (1220,250)。
- 返回值 `{ depth }`（assets 未规定）。

**book.js**
- `drawBook` 多了 `o.layer`（`book / popup / bookmark / all`），立体件要单独调 `layer:'popup'`，并用 `o.pop` 选 castle 层分组；`o.castle` 转给 drawCastle。
- `drawBook` 不传 `popup` 时视为全部立起（与 drawCastle 相反）。
- `cover` 多了 `subtitleAlpha`、`gleam`；`bookmark` 多了 `roll`；`label` 可传数字。
- `o.lizard` 默认用本模块的占位 `drawSleepyLizard`，不是 dragon 组的 `drawLizard`；要换用 `o.lizardFn`（参数名不同，需包一层，见第 7 节）。
- `drawTitlePage` 的片名默认用占位 `drawTitleGlyphs`；要用 `type.titleGlyphs` 传 `o.titleFn`（参数名不同，见第 7 节）。另有 `o.rays`。
- `drawDesk` 多了 `o.layer:'dust'` 与 `o.count`。
- `bookPageRect(T, c?)` 是**天幕卡**矩形（与 assets 一致）；storyboard 4.1 写的“跨页矩形”对应新增的 `bookSpreadRect`。两者都可传自定义机位 c。
- 新增导出：`bookCastleCam`、`castleToBookCam`、`bookToCastle`、`castleToBook`、`bookSpreadRect`、`bookCardCovers`、`bookPopupAt`、`scrollCorner`、`drawSleepyLizard`、`drawTitleGlyphs`；`CAMS` 多了 `BK_PUSH_END`、`BK_CAW`。
- `bookToCastleCam` 的返回值多两个字段 `flat`、`strings`，drawCastle 会读，b01 / b02 / b17 用同一换算就能逐像素一致。

## 7. 已知限制与注意事项

- **逐像素交接的前提**（b01→b02、b17 199.30）：同一 T；同一机位函数（`bookPushCam / bookCastleCam`），交接段不加 drift、shake；同一 `LAYER_GROUPS`；同一份 castle 选项（尤其 `onBalcony` 要是同一个函数、同样的姿势参数）；b02 遮罩不羽化。任何一边单独加 `ctx.fx` 调色、换图层参数都会破坏一致。
- **核对交接时的时间对齐**：引擎后期颗粒按 `floor(T·12) & 3` 换贴图。模型图里把两个画面放在不同时间段比较时，时差必须是 1/3 秒的整数倍，否则整屏会有 ±10 的颗粒差（不是画面问题）。
- 性能：每层一个全屏缓冲。六层 + alarm = 7；立体书 b01 正常 5 个（书体 1 + 立体件 3 + 书签浮尘 1）。和别的块重叠或要叠龙 / 遮罩时用 `LAYER_GROUPS`（3 个）。`detail:0` 可省掉大量细线（石缝、瓦纹、草丛、车辙），远景缩略或地图小图用。
- 立体书模式（传了 popup）下 sky / far 裁在天幕卡里、立起中会露出卡外的书页；不要在立体书模式下用远离 `bookToCastleCam` 的机位（视差层会和卡片错开）。
- `o.sun = {x,y,r}` 是屏幕坐标，机位移动时它不动；只在锁机位或很远的太阳（夕阳）上用。
- `tear` 坐标在 sky 层（0.05）：只有 CA-W 或接近时才等于屏幕坐标；龙头裁剪务必在同一深度变换下用 `tearPath`。
- `split` 只影响 sky 层；山、城的颜色要配合 `time: {from:'dawn', to:'doom', k}` 一起推，否则 split 扫完后切 `'doom'` 会整城跳色。
- `ctx.fx.sat` 作用于整帧（alarm 层也会被压掉饱和）；L05 要“红色保持饱和”，请靠 gray 时段本身的去饱和 + alarm 层叠红光，不要整帧降饱和。
- `roadPoint / hillTopY` 是 mid 层坐标：在 CA-W 下与主体层重合，机位推近后要么在 mid 深度里画（`applyCam(lg, c, CASTLE.depth.mid)`），要么用 `castleToScreen(c, 'mid', …)` 换算。
- 阳台：`onBalcony` 在门之前、栏杆之后画，栏杆（y 548–590）会挡住腿；左段花箱（x 860–922）的花到 y≈541，会挡到站在那里的人的胸口。三人站位建议 x≈935 / 985 / 1035（CA-BAL 下相距约 130px）。
- 城墙上的人（`onWall`）画在城墙之前，垛口（y 670–704，每 60px 有 20px 缺口）会挡住下半身。
- 字旗：塔 i 用 `chars[i]`，按 13 个字设计；beacon 与字旗同塔时 beacon 生效后旗消失；`finaleAt` 只作用于第 13 面。
- `deco` 只控制翻折，彩旗串（fg）由时段决定：非 wedding / spring 时段传 deco 只有花环、花拱，没有顶部彩旗；`bunting` 可强制。
- 绕塔横幅只有一圈、椭圆尺寸固定（rx 60、ry 15，y=214）；横幅文字由场景自己画，绕塔时允许被挡（storyboard 风险 4）。
- 灯笼脉冲固定 2Hz；烽火、火的强度不可调。
- `drawBook` 的 `'popup'` 只在 `open ≥ 0.999` 时画；合书过程中立体件必须先折倒（`fold` 到 1）再翻封面。
- 片尾小蜥蜴与署名贴签画在 `'book'` 层里（封面上）；书签层在它们之上。
- 占位实现：`drawSleepyLizard`（没有打哈欠动作）、`drawTitleGlyphs`。换成正式版：
  - 小蜥蜴：`lizardFn: (g, q) => drawLizard(g, { x: q.x, y: q.y, s: q.s, face: q.face, t: q.t, pose: q.sleep ? (q.eye > 0.5 ? 'eyeOpen' : 'sleep') : 'scurry' })`（dragon.js 的 `drawLizard` 默认朝右、尺寸约定以 dragon 组 API 为准）。
  - 片名：`titleFn: titleGlyphs`，`o.title` 传 type.js 的参数名（`rise`、`foil`、`starAt`、`t`），返回值是 `[{x, y, w, top}]` 而不是 `[[x, y]]`。
- MEMO 缓存只存静态几何（Path2D / 点表），不影响确定性；全部函数是 T 的纯函数，没有 Math.random / Date.now。

## 8. 模型图清单与交接核对记录

### 8.1 模型图
| 文件 | 内容 | 输出 |
|---|---|---|
| `src/sheets/castle.js` | 0–2s 九宫格（CA-W 七时段、立起中、L02 双天空 + 撕裂）；2–13s 每秒一张全分辨率真实图层：dawn / doom（火 + 烽火）/ gray（alarm 分层）/ spring 字旗 / wedding（deco + 绕塔，zoom 0.9）/ sunset / night / CA_MW / CA_BAL 三人 s=0.26 / CA_TOWN 火雨 / CA_BAL_K 烽火 | `out/review/sheets/castle/final_t*.png`（0.50、1.50、2.50 … 12.50） |
| `src/sheets/book.js` | 0–2s 九宫格（合书 / θ60° / θ120° / 开书 / 立起中 / 全部立起 / 片尾 / 关灯 / 片名页）；2–12.39 b01 排练；20–30.39 b02 侧世界画面；40–49.1 b17 排练；50–51 b17 接缝前世界夜景；60–64 片名页；64–65 空片名页；70–72 `bookPageRect` 示意；81.5–82 b01→b02 交接排练（b01 精简 + b02 遮罩）；其余空档铺纸色底（`book_gap_*`，让 check.mjs 均匀取样不出空镜） | `out/review/sheets/book/final_t*.png` |

```bash
./tools/lint.sh src/env/castle.js src/env/book.js src/sheets/castle.js src/sheets/book.js
node tools/check.mjs sheets --list castle,book
node tools/render.mjs stills --sheet castle --times 0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5 --outdir out/review/sheets/castle --prefix final_
node tools/render.mjs stills --sheet book --times 0.5,1.5,3.0,7.0,9.4,11.5,29.5,40.3,41.0,46.0,47.5,50.3,61.5,64.5,71.0,81.75 --outdir out/review/sheets/book --prefix final_
```

### 8.2 交接逐像素核对（2026-10-01，PIL 逐像素比较 RGB）
| 核对 | 帧对 | 结果 |
|---|---|---|
| b01 立体书 vs b02 世界（同一 `bookCastleCam`、同一 `LAYER_GROUPS`） | book 11.50 / 11.75 / 11.99 ↔ 29.50 / 29.75 / 29.99（Tb 9.50 / 9.75 / 9.99） | 三对全部 0 差（最大差 0） |
| “只开 b01” vs “b01 + b02”（b01 精简掉书桌 / 书体 / 书签，b02 在 `bookPageRect` 遮罩里画世界） | book 11.50 / 11.75 / 11.99 ↔ 81.50 / 81.75 / 81.99 | 三对全部 0 差 |
| b17 199.30 接缝：世界夜景 CA-W vs 拉回首帧 | book 50.30 ↔ 40.30 | 0 差（前提：浮尘在 199.36 之后才淡入，见 5.4） |

结论：b01→b02 交接（storyboard 第 9 节 #1、风险 3）在 9.50 / 9.75 / 9.99 三帧逐像素一致，可以按 5.2 / 5.3 的写法实现；b17 拉回接缝同样一致。
