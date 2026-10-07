# 巨龙与小蜥蜴（dragon）API

> 源码：`src/rigs/dragon.js`（单文件：巨龙 + 小蜥蜴 + 龙头 / 龙眼 / 龙爪单件）。规格：`docs/assets.md` 第 5 节。
> 本文每个参数名、默认值都按源码核对过；与 assets.md 不一致处以本文（= 代码）为准，差异列在第 6 节。
> 状态：定稿（2026-10-01 收尾）。

---

## 1. 模块与导出一览

```js
import { drawDragon, dragonSpine, DRAGON_POSES, DRAGON_HEAD_W,
         drawDragonHead, drawDragonEye, drawDragonClaw,
         drawLizard, LIZARD_POSES } from '../rigs/dragon.js';
```

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawDragon(g, o)` | 函数 | 画整条巨龙（13 节身体 + 背板字 + 头 + 双翼 + 前爪），返回锚点对象 |
| `dragonSpine(pose, t)` | 函数 | 只算不画：某姿态在 t 秒的 64 点脊线（做自定义脊线、预判头尾位置） |
| `DRAGON_POSES` | 常量对象 | 15 个巨龙姿态的只读元数据（头心、头部转角、默认翅膀/张嘴/前爪/表情、说明） |
| `DRAGON_HEAD_W` | 常量 | 巨龙头宽 360（s = 1，世界 px） |
| `drawDragonHead(g, o)` | 函数 | 只画龙头（默认带一截脖子）：角色卡头像、裂口撞出的龙头、黑暗里只露头 |
| `drawDragonEye(g, o)` | 函数 | 单只龙眼（巨龙、小蜥蜴共用）；`shape:'almond'` = b09 黑暗里与洞口同形的杏仁巨眼 |
| `drawDragonClaw(g, o)` | 函数 | 单只龙爪 + 一截从画外伸来的手臂（b02 勾鸟笼环） |
| `drawLizard(g, o)` | 函数 | 小蜥蜴（B12 由巨龙缩成，之后一直跟着勇者） |
| `LIZARD_POSES` | 常量对象 | 小蜥蜴姿态名 → 中文说明 |

---

## 2. 坐标、尺寸与锚点约定

### 2.1 巨龙（drawDragon）—— 与统一木偶签名不同，务必看清

- **原生朝向 = 朝左**（头在左、尾在右），所以 `face` 默认 **−1**；`face: 1` 以头心为轴整体镜像成朝右。
- **锚点 = 头心**（不是脚底）。姿态预设直接写在 CAVE 世界坐标里（depth 1 层；`standoff / puppet / shrink` 三个写的是 STANDOFF 屏幕坐标）。
  - 不传 `x / y`：按预设坐标原地画（头心 = `DRAGON_POSES[pose].head`）。
  - 传了 `x / y`：把头心平移到 (x, y)，整条龙跟着走。
- `s` 以头心为中心缩放；`rot`（**度**）以头心为中心整体旋转；`face` 镜像也以头心为轴。
- s = 1 尺寸：头宽 360；身体每节背板 100×100（半径 50，背板中心在背线外 36px）；身体粗 118→134（约 20% 处最粗）→ 尾端 34；预设脊线弧长约 1350–1900（含藏在头后的 100）。
- **脊线**：64 点，从脖根插座（头局部 (100, 52)）到黑桃尾尖；前 100px 弧长藏在头后，其余按弧长等分 13 节，第 13 节就是黑桃尾尖（挂第 13 个字「松」）。
- 光从画面左上来、投影一律落在右下；`face` / `rot` 变化时内部会反算，投影方向不变。
- 背板上的字由 `type.glyph13` 画，**永远正立**（旋转夹在 ±15°），镜像时字不镜像。
- 描边与切口亮边的线宽按当前变换反算（`scaleOf`），CU-D（zoom 2.4）不会变粗成一坨，远景也不会细到消失。

### 2.2 小蜥蜴（drawLizard）—— 走统一木偶签名

- `x, y` = 脚底中心（或趴附点：`ride` 时 = 肩线，`hideScarf` 时 = 围巾上沿，`climb` 时 = 爪子抓着的点）。
- `s = 1` 全长 60（内部设计单位 240 × 0.25）；头宽约 22。模型图里常用 s = 4–6。
- `face` 默认 **1 朝右**；B12 诞生时传 −1（朝左），E02 爬上勇者肩头之后一直 1。

### 2.3 返回的锚点

全部是**调用方坐标**（即调用时 g 的当前坐标系，通常是已 `applyCam` 的世界坐标），可直接当道具 / 特效的落点。字段含义见第 3 节各函数的“返回值”。

---

## 3. 函数详解

### 3.1 `drawDragon(g, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `pose` | `'rise'` | 姿态名（见第 4.1 节），或 `{from, to, k, stagger}`：64 点逐点插值；`stagger` 0..1，>0 尾先动、<0 头先动 |
| `spine` | — | 直接给脊线（覆盖 `pose` 的形状；姿态默认参数仍取自 `pose`）。64 点数组（其他点数会按弧长重采样到 64）；可挂 `.rot`（头部转角，度，默认 0）与 `.depth`（64 个数，>0 = 在柱前） |
| `t` | `0` | 秒；驱动待机起伏、飞行行波、扇翅、眨眼、呼吸、尾巴摆动。传 `T` |
| `x`, `y` | 预设头心 | 把头心平移到这里 |
| `s` | `1` | 缩放（以头心为中心） |
| `face` | `-1` | −1 朝左（原生）/ 1 朝右 |
| `rot` | `0` | 整体转角（度，以头心为中心） |
| `pivot` | 姿态的 `pivot`，否则头心 | `popped > 0` 时的缩小中心（原生预设坐标）；`shrink` 姿态 = (1467, 860) |
| `plates` | `[]` | 13 项 `{ lit, pop, char, state }`，见下 |
| `spikes` | `0` | 0..1 背刺竖起；也可传 13 项数组逐节控制（R1 错峰炸刺）。数字或 `spikes[0]` 同时控制头后的 4 根刺 |
| `puff` | `0` | 0..1 鼓起：身体加粗 1.5 倍、整体放大到 1.2 倍、头放大 1.06 倍 |
| `redden` | `0` | 0..1 脸红（头部叠 fireDeep 团 + 腮红加深 + 三道斜线） |
| `jaw` | 姿态默认 | 0..1 张嘴（下颚绕铰链 0→60°；再加 `joints.jaw`，总角度夹在 0–75°）。张嘴时自动画嘴角颊皮与喉皮（下颚腹面连到脖子），不会露出楔形缝 |
| `eyes` | 姿态默认 | `{ open, pupil, look, state, red, glow, twitch, blink, one }`，见下 |
| `wings` | 姿态默认 | 0..1 翅膀张开（0 = 收拢贴背） |
| `flap` | 姿态默认（`fly`/`shadow` 1，其余 0） | 扇翅幅度，周期 0.7s |
| `arms` | 姿态默认 | 0..1 前爪前伸 |
| `grip` | `0` | 0..1 前爪勾紧 |
| `tailFlick` | — | 甩尾时刻（秒）或时刻数组；每次尾段甩 42° 后阻尼回弹 |
| `popped` | `0` | 0..13 已弹飞的节数（可带小数 = 正在弹的那一节的进度），见 4.4 |
| `order` | 姿态默认（`coil` 为 `'tailTop'`，其余 `'neckTop'`） | 节与节的压叠顺序：`'neckTop'` 靠头的节压在上面；`'tailTop'` 靠尾的压在上面 |
| `silhouette` | 姿态默认（`shadow` 为 true） | 剪影：全部填 `silColor` |
| `keepColor` | `[]` | 剪影时保留原色的部件：`'eye'`、`'plates'`（背板 + 字 + 黑桃） |
| `silColor` | `PAL.ink` | 剪影色 |
| `chestSwell` | `0` | 0..1 吸气鼓胸（V16）：胸口那几节加粗 30%、脖子与头上抬 |
| `steam` | — | 鼻孔喷蒸汽的时刻（秒）或时刻数组；每次两股白汽，持续 1.1s |
| `vein` | `0` | 0..1 额头青筋（红色“井”字，会跳） |
| `nostril` | 姿态默认（`breathe` 1） | 0..1 鼻孔张大 |
| `joints` | `{}` | 关节附加角（度）：`head`、`jaw`、`neck`、`body`、`tail`、`wing`、`wingFar`、`arm`、`armFar`、`spade` |
| `detail` | `1` | 0 = 远景简化（不画暗面、切口亮边、纸片错位、背板字） |
| `flat` | 姿态默认（`puppet`/`shrink` true） | 剪纸木偶平面版：奶油纸边 + 黄铜两脚钉 |
| `rod` | 姿态默认（`puppet` 1，`shrink` 0） | 木杆：true / false / 0..1（透明度）。只有带 `rods` 的姿态（`puppet`、`shrink`）才画 |
| `part` | `'all'` | `'front'` / `'back'`：只画柱前 / 柱后的部分（盘柱分层，见 4.3） |
| `alpha` | `1` | 整体透明度 |
| `seed` | `1` | 眨眼相位种子（两条龙同屏时错开） |

**`plates[i]`**（i = 0 脖子 → 12 黑桃尾尖）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `lit` | 0 | 0..1 点亮：背板金边变亮、底色变亮、背后 dragonEye 光晕、字从 off 叠化到 `state` |
| `pop` | 0 | 0..1 弹起：背板放大 1.15 倍、外移 8px，那一节身体向背侧拱起 10px（踩跳台 / 逐节亮时的弹跳） |
| `char` | 龙名第 i 字 | 换字（默认取 `NAMES.dragon` 逐字） |
| `state` | `'lit'` | 传给 `glyph13` 的字槽状态：`'off' / 'lit' / 'fire' / 'gold' / 'steel' / 'stone'`，或任一 `STYLES` 名 |

**`eyes`**：

| 字段 | 默认 | 说明 |
|---|---|---|
| `open` | 1 | 0..1 睁眼程度（眼皮从上往下盖） |
| `pupil` | 姿态默认（0.3） | 0..1 竖瞳宽；`popped` 越大越自动变圆（→0.78，像小蜥蜴） |
| `look` | `[0, 0]` | 视线 [dx, dy]，−1..1 |
| `state` | 姿态默认 | 见 4.2 |
| `red` | 0 | 0..1 虹膜发红 |
| `glow` | 0 | 0..1 眼睛自发光（黑暗 / 剪影里用） |
| `twitch` | 0 | 0..1 近眼眼角抽搐（M1） |
| `blink` | true | false = 关掉自动眨眼（normal / angry / smug 时每 3.6–4.4s 眨一次） |
| `one` | false | true = 只睁近侧一只眼：远眼闭着（剪影时远眼不画），发光只给近眼；近眼若 `state` 是闭眼类（closed / happy / x）则按 `normal` 睁开（与小蜥蜴同一语义，所以 `coil` 默认闭眼也能直接 `eyes:{one:true}`） |

**返回值**（调用方坐标）：

| 字段 | 含义 |
|---|---|
| `mouth` | 嘴心 [x, y]（上唇前端与下颚尖之间），发火焰字 / 火柱 / 烟圈的出口 |
| `mouthAng` | 出口方向（弧度，调用方坐标；朝左约 π，张嘴越大越朝下） |
| `eyeL`, `eyeR` | 屏幕上偏左 / 偏右的那只眼的中心 |
| `head` | 头心（= 传入的 x, y；缩小时随 pivot 缩放移动） |
| `horn`, `hornFar` | 近侧 / 远侧角尖（B11 勇者落在龙角上、围巾挂角） |
| `nose` | 鼻孔（踢鼻子、喷蒸汽） |
| `jawTip` | 下颚尖 |
| `plates` | `[[x, y, ang] × 13]` 背板中心与该处身体切线角（弧度）；挂字、跳台用。已弹飞的节锚点留在脖根 |
| `segments` | `[[x, y, ang] × 13]` 每节在脊线上的中心与切线角 |
| `front` | `[bool × 13]` 每节是否在柱前（只有 `coilPillar` 有意义，其余全 true） |
| `headFront` | 头是否在柱前 |
| `tailTip` | 尾尖（黑桃尖再往外 10px） |
| `claw`, `clawFar` | 近 / 远前爪三爪尖的平均点（没画时为 null） |
| `wingTip` | 近翼最前端翼尖（没画时为 null） |
| `rods` | 木杆顶端（接身体处）坐标数组（只有 `puppet` / `shrink`） |
| `root` | [x, y] 实际锚点 |
| `scale` | 实际缩放（含 puff 与 popped 缩小） |
| `spine` | 本帧 64 点脊线（调用方坐标，已含关节弯曲） |

### 3.2 `dragonSpine(pose = 'rise', t = 0)`

返回 64 个 `[x, y]`（原生朝左、预设坐标、已含待机起伏 / 飞行行波），附加属性：`.rot`（头部转角，度）、`.depth`（只有盘柱：每点朝镜头分量，>0 在柱前，否则 null）、`.head`（头心）。`pose` 同样可传 `{from, to, k, stagger}`。不含 `joints`、`chestSwell`、`plates.pop` 的形变（这些在 `drawDragon` 里叠加）。

### 3.3 `drawDragonHead(g, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 头心 |
| `s` | 1 | 缩放 |
| `face` | −1 | 同巨龙 |
| `rot` | 0 | 头部转角（度，正 = 抬头） |
| `neck` | true | 画一截往右下的脖子（false = 只有头） |
| `jaw` | 0 | 0..1 |
| `eyes` | `{}` | 同 `drawDragon` 的 `eyes`（`state` 默认 `'normal'`） |
| `redden`、`vein`、`steam`、`nostril`、`spikes` | — | 同 `drawDragon`（spikes 只控制头后 4 根刺） |
| `silhouette`、`keepColor`、`silColor`、`detail`、`flat`、`alpha`、`seed`、`t` | — | 同 `drawDragon` |

返回：`{ mouth, mouthAng, head, eyeL, eyeR, horn, hornFar, nose, jawTip }`（`mouthAng` 同 drawDragon；`head` = [x, y]）。`neck: true` 且张嘴时同样画喉皮。

### 3.4 `drawDragonEye(g, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 眼心 |
| `w`, `h` | 66, 78 | 眼球（竖椭圆）宽高；`shape:'almond'` 时 = 杏仁眼全睁时的包围盒 |
| `rot` | 0 | **弧度**（注意：其余函数的 rot 都是度） |
| `open` | 1 | 0..1 |
| `pupil` | 0.3 | 0..1 竖瞳宽 |
| `look` | `[0, 0]` | −1..1 |
| `state` | `'normal'` | 见 4.2 |
| `red` | 0 | 0..1 虹膜发红 |
| `glow` | 0 | 0..1 眼光外溢（`screen` 混合，半径 1.5w） |
| `inner` | −1 | 内眼角在哪一侧（−1 左 / 1 右），决定怒眉压眼皮的方向 |
| `lid` | `PAL.dragon` | 眼皮颜色 |
| `twitch` | 0 | 0..1 眼角抽搐 |
| `hl` | `[-0.6, -0.8]` | 高光方向 |
| `lw` | `max(0.8, w × 0.05)` | 眼皮墨线宽 |
| `sil` | false | 只画虹膜 + 竖瞳（剪影版） |
| `shape` | — | `'almond'`：杏仁形巨眼，眼睑从中线横着裂开（只用 open / pupil / look / red / glow / hl） |
| `t` | 0 | 秒（dizzy 转圈、抽搐） |

无返回值。

### 3.5 `drawDragonClaw(g, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 爪掌心 |
| `s` | 1 | 缩放 |
| `rot` | 0 | 度；0 = 手臂从右边伸来、爪尖朝左 |
| `face` | −1 | 1 = 以 (x, y) 为轴水平镜像（手臂从左边伸来、爪朝右，rot 随之镜像） |
| `grip` | 0.5 | 0..1 勾紧 |
| `reach` | 420 | 手臂长度（原生 px） |
| `t` | 0 | 手臂轻晃 |
| `alpha`、`silhouette`、`silColor`、`detail` | — | 同上 |

返回：`{ hook, elbow }`——`hook` = 中爪尖（勾笼环的点），`elbow` = 手臂中段。

### 3.6 `drawLizard(g, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 脚底中心 / 趴附点 |
| `s` | 1 | 1 = 全长 60 |
| `face` | 1 | 1 朝右 / −1 朝左 |
| `t` | 0 | 秒（窜、点头、舞、呼吸、尾巴摆、眨眼、名字牌滚动） |
| `pose` | `'sit'` | 见 4.5；可传 `{from, to, k}` |
| `eyes` | 姿态默认 | `{ open, pupil(默认 0.78 圆瞳), look, state, glow, one, blink }`；自动眨眼只在 normal / smug |
| `mouth` | 姿态默认 | `'smile' / 'grin' / 'open' / 'o' / 'pout' / 'flat' / 'wavy'`，null = 不画嘴 |
| `joints` | `{}` | 附加角（度）：`tilt`、`head`、`armN`、`armF`、`legN`、`legF`、`wing`、`tail:[4]` |
| `miniPlate` | — | true 或 `{ chars, period }`：头顶迷你名字牌（默认滚龙全名，`period` 一圈秒数，默认 4.2） |
| `squash` | 0 | >0 拉长、<0 压扁（保面积，以脚底为锚） |
| `silhouette`、`keepColor`、`silColor`、`alpha`、`detail`、`seed` | — | 同巨龙 |

返回：`{ head, eye, mouth, paw, foot, tailTip, top, plate }`——`paw` 近侧前爪（扒边沿 / 举高）、`foot` 近侧后脚、`top` 头顶、`plate` 迷你名字牌中心（没开为 null）；`hideScarf` 只画头，`paw / foot / tailTip` 为 null。

---

## 4. 枚举全表

### 4.1 巨龙 `DRAGON_POSES`（头心 / 尾尖为 t = 0 时的预设坐标；用在哪个块）

| pose | 头心 | 尾尖 | 头转角 | 默认参数 | 用途 / 块 |
|---|---|---|---|---|---|
| `fly` | (420, 430) | ≈(2320, 497) | 0 | wings 1、flap 1、jaw 0.06 | 波浪飞行（行波 + 扇翅）；b02 L02–L04 俯冲、提笼飞向龙山（face 1） |
| `shadow` | (420, 430) | ≈(2316, 557) | 0 | 同 fly + 剪影、波幅更大 | b02 L02 龙影（ink；透明度 / 模糊交给图层） |
| `coil` | (1150, 600) | (1253, 759) | −16 | wings 0、eyes closed、order tailTop | 盘在金币堆上闭眼；b09 V14；b06 片名页剪影 |
| `rise` | (1150, 470) | (2244, 447) | 6 | wings 1、arms 0.2 | 昂首立起；b09 V15–V16（CU-D）、b10 Q1 后、D2 起手 |
| `name` | (960, 440) | (2450, 820) | −4 | wings 0.3、eyes smug | D1 报名：S 形身体，13 块背板依次亮；b09 105.36–108.90 |
| `breathe` | (1520, 470) | (3050, 709) | 9 | jaw 1、nostril 1、eyes angry | D2 喷火字，嘴约 (1380, 520)；b10 |
| `puffer` | (1200, 300) | (1700, 404) | 2 | jaw 0.55、eyes angry | R1 河豚（配 spikes / puff）；b10 117.03 |
| `wall` | (1180, 250) | (2123, 429) | −6 | wings 1、arms 0.6、jaw 0.3 | D3 直立在名字墙后；b10 117.66–120.97 |
| `lunge` | (840, 610) | (2342, 704) | −10 | jaw 0.95、arms 0.8 | 向左扑咬；b11 第一拍 123.00 |
| `coilPillar` | (1407, 783) | (1780, −161) | 6 | jaw 0.25、eyes angry | 绕 x = 1640 水晶柱螺旋，头在下、尾在上；b11 第二拍（配 part） |
| `clash` | (1120, 430) | (1922, 297) | 4 | wings 1、arms 1、jaw 0.6 | 张翼伸爪对撞；b11 第三拍 127.80–129.40 |
| `charge` | (1100, 620) | ≈(2900, 653) | 2 | jaw 0.4、行波 1.6Hz | 贴地向左游动冲锋；b11 120.97、133.60 |
| `standoff` | (1350, 520) | (2849, 665) | 0 | jaw 0.04、eyes angry | STANDOFF 构图，身体经 (1700, 760) 出画右；b11 136.80 |
| `puppet` | (1350, 520) | 同上 | 0 | flat、rod 1、双签 x 1300 / 1600 | 纸剧场木偶；b12 全段、b13 B08–B11 |
| `shrink` | (1350, 520) | 同上 | 0 | flat、无杆、pivot (1467, 860) | B12 逐节弹飞缩小（配 popped）；b13 157.80–160.20 |

`DRAGON_POSES[name]` 字段：`head`、`rot`、`desc`、`wings`、`jaw`、`arms`、`eyes`、`flat`、`rods`、`pivot`、`wave`（行波参数 {amp, len, hz} 或 null）。

### 4.2 眼睛 `eyes.state`（巨龙、龙头、龙眼、小蜥蜴共用）

| state | 说明 | 用在 |
|---|---|---|
| `normal` | 圆睁，竖瞳，自动眨眼 | b09 V15、b12 木偶 |
| `angry` | 内眼角眼皮下压、竖瞳收窄、怒眉 | b10 D2–D3、b11、b12 B05 起 |
| `smug` | 上眼皮半垂、得意眉 | b09 D1（name 姿态默认）、V16 105.10 |
| `dizzy` | 蚊香眼（随 t 转） | b11 132.60 |
| `closed` | 闭眼弧 + 外眼角两根睫毛 | b09 V14 盘卧、V16 闭眼抬下巴 |
| `happy` | ^ 形笑眼 | 小蜥蜴 ride / lead / nod |
| `x` | 叉叉眼 | b13 B11 受击定格 |
| `worried` | 只改巨龙眉形（八字眉），眼睛同 normal | 可选 |

### 4.3 盘柱分层 `part`

`coilPillar` 的脊线带每点 `depth`，每节、头、肩（翅膀 + 前爪）各自判断在柱前还是柱后。用法：同一参数画两次，`part:'back'` 包进 depth 0.9 图层 → 画水晶柱 → `part:'front'` 包进 depth 1.1 图层。其余姿态没有 depth，全部算“柱前”（`part:'back'` 什么都不画）。

### 4.4 B12 逐节弹飞 `popped`

- 从脖子那节开始依次弹飞：`popped = n` 表示前 n 节已经飞走，小数部分是第 n+1 节正在弹（背板外飞 34px 并淡出，那节身体变短）。
- 整体以 `pivot`（shrink 姿态 = (1467, 860)）为中心从 1 缩到 0.15；翅膀缩到 0.42；竖瞳自动变圆。
- 黑桃尾尖永远保留（最后变成小蜥蜴的尾巴）；`popped = 13` 时只剩头 + 黑桃，背板与字全部消失。
- 已弹飞节的 `plates[j]` 锚点留在脖根 —— 场景从这里放飞小纸字。

### 4.5 小蜥蜴 `LIZARD_POSES`

| pose | 说明 | 默认嘴 / 眼 | 用在 |
|---|---|---|---|
| `sit` | 坐，静止时尾巴卷成问号 | smile / normal | b13 160.20 诞生 |
| `peek` | 后腿站立前倾、两爪扒着边沿（`paw` 锚点） | o / 视线右 | b13 162.40 金币堆后探头；b16 190.80 扒摇篮 |
| `scurry` | 四爪交替窜（0.3s 一步） | grin | b13 163.20 窜到靴边；b17 204.80 |
| `climb` | scurry 斜转 −62°，顺着往上爬 | grin | b13 163.50 爬上勇者；b17 爬上封面 |
| `ride` | 蹲在肩上（y = 肩线），尾巴垂在身后 | smile / happy | b13 E02 起、b14 E03 归程（face −1） |
| `hideScarf` | 缩进围巾只露头顶和眼睛（y = 围巾上沿） | 无嘴 | b14 173.50；176.40 探头 |
| `lead` | 舞龙领舞：一爪高举、踮脚、尾巴甩 | open / happy | b15 179.60 |
| `nod` | 跟拍子点头（0.5s 一下），坐姿 | smile / happy | b15 186.20 |
| `coverEyes` | 用尾巴捂眼（黑桃尖盖住眼睛），冒汗 | wavy / closed | b16 195.00 |
| `flat` | 趴平（瘪下去） | flat / closed | b16 196.80 |
| `pout` | 撅嘴生闷气：鼓腮、抱臂、斜眼 | pout / smug | b13 160.50 |
| `sleep` | 蜷成一团睡觉（呼吸起伏） | smile / closed | b17 205.80 |
| `eyeOpen` | 睡着时睁开一只发光的眼 | smile / one + glow | b17 206.60 |

---

## 5. 推荐用法

**① 洞内主体层（投影 / 纸纹 / 机位），返回值发火焰字（b10 D2）**

```js
import { drawDragon } from '../rigs/dragon.js';
import { cam, applyCam } from '../core/camera.js';

const c = cam(960, 540, 1);                                   // CV-W
let A;
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  A = drawDragon(lg, { pose: 'breathe', t: T, eyes: { state: 'angry', pupil: 0.14 }, nostril: 1,
    redden: 0.3, plates: Array.from({ length: 13 }, () => ({ lit: 0.4 })) });
});
// A.mouth ≈ (1380, 520)、A.mouthAng ≈ π（朝左）：火焰字从 A.mouth 出发，沿 A.mouthAng 方向飞
```

**② D1 背板逐字点亮 + 弹一下 + 尾尖一甩（b09 105.36–108.90）**

```js
import { NAME_TIMES } from '../ui/type.js';
const times = NAME_TIMES('D1a').concat(NAME_TIMES('D1b'));      // 13 个字的时刻
const plates = times.map((tt) => ({
  lit: clamp((T - tt) / 0.12),                                    // 0→1 点亮（字从 off 叠化到 lit）
  pop: Math.max(0, Math.sin(clamp((T - tt) / 0.35) * Math.PI)),  // 亮的瞬间弹一下（背板放大、那节拱起）
}));
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  drawDragon(lg, { pose: 'name', t: T, plates, tailFlick: 108.9 });
});
// 换字体 / 换材质：plates[i].state = 'fire' | 'stone' | 'gold' …；换字：plates[i].char = '名'
```

**③ 姿态插值 + 错峰：从盘卧解开到昂首（b09 102.40–103.60）**

```js
import { ez, glide } from '../core/ease.js';
const k = ez(T, 102.4, 103.6, glide);
drawDragon(lg, { pose: { from: 'coil', to: 'rise', k, stagger: 0.5 },   // stagger>0：尾先抬、头最后
  t: T, eyes: { state: k < 0.5 ? 'closed' : 'normal' } });
```

**④ 盘柱前后分层（b11 第二拍）+ 自定义脊线（咬自己尾巴）**

```js
import { drawDragon, dragonSpine } from '../rigs/dragon.js';
const sp = dragonSpine('coilPillar', T);              // 64 点，原生朝左、CAVE 世界坐标
const spine = sp.map(([x, y], i) => [x, y]);          // 在这里改点；pts[0] = 脖根，改它头会跟着走
spine.rot = sp.rot; spine.depth = sp.depth;           // map 会丢掉附加属性，记得挂回去
const o = { pose: 'coilPillar', spine, t: T, plates };
ctx.layer(g, { shadow: 6, texture: 0.3 }, (lg) => { applyCam(lg, c, 0.9); drawDragon(lg, { ...o, part: 'back' }); });
ctx.layer(g, { shadow: 6, texture: 0.3 }, (lg) => { applyCam(lg, c, 0.85); drawCrystalPillar(lg); });  // 布景组的水晶柱
let A;
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => { applyCam(lg, c, 1.1); A = drawDragon(lg, { ...o, part: 'front' }); });
// A.plates[i] = [x, y, ang]：勇者踩的跳台（两次调用返回的锚点相同；A.front[i] 告诉你那节在柱前还是柱后）
```

**⑤ 纸剧场木偶 + B12 逐节弹飞（b12–b13，屏幕坐标）**

```js
// puppet / shrink 的预设就是 STANDOFF 屏幕构图：剧场里直接画在屏幕层，不套 applyCam
ctx.layer(g, { shadow: 8, texture: 0.25 }, (lg) => {
  drawDragon(lg, { pose: 'puppet', t: T, jaw: biteK, eyes: { state: 'angry', red: redK }, x: 1350 - slide });
});
// B12：tPop[i] = 第 i 个字滚过名字牌窗口中线的时刻（场景按 theaterState 算）
const popped = tPop.reduce((n, tp) => n + clamp((T - tp) / 0.15), 0);   // 0..13，可带小数
const A = drawDragon(lg, { pose: 'shrink', t: T, popped, plates });     // 以 (1467,860) 为心缩到 0.15，落在台面 y=840
// 已弹飞的节 A.plates[j] 停在脖根：小纸字从这里飘走；popped=13 后换成 drawLizard（同位置、face −1）
```

**⑥ 单件：b09 杏仁巨眼、b06 剪影单眼、小蜥蜴上肩**

```js
// 101.20 黑暗里睁开第一只眼（轮廓 = b08 洞口杏仁形，屏幕中心约 (1250,520)，560×300）
ctx.layer(g, { blur: 0 }, (lg) => drawDragonEye(lg, { shape: 'almond', x: 1250, y: 520, w: 560, h: 300,
  open: ez(T, 101.2, 101.45, outBack), pupil: 0.22, look: [-0.4, 0.05], glow: 0.8, t: T }));
// 片名页盘龙剪影只亮一只黄眼（面朝左）
drawDragon(lg, { pose: 'coil', t: T, x, y, s: 0.5, silhouette: true, keepColor: ['eye'], eyes: { one: true, glow: 0.8 } });
// 小蜥蜴蹲在勇者肩上，头顶迷你名字牌一直在滚（E02 起朝右）
drawLizard(lg, { pose: 'ride', x: shoulderX, y: shoulderY, face: 1, t: T, miniPlate: true });
```

---

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际（代码） |
|---|---|---|
| 锚点 | 统一签名 `x, y` = 脚底中心，`face` 默认 1 | 巨龙 `x, y` = **头心**，`face` 默认 **−1**（原生朝左）；不传 x / y 就按预设坐标画。小蜥蜴仍走统一签名 |
| 姿态 | 15 个预设 | 15 个全有，名字一致；`shadow` 默认剪影，`puppet` / `shrink` 默认平面版，`coilPillar` 返回 `front[]` 与 `headFront` |
| 插值 | `{from, to, k}` | 另有 `stagger`（>0 尾先动、<0 头先动） |
| `eyes.state` | normal / angry / dizzy / closed / x | 另有 `smug`、`happy`（`worried` 只改巨龙眉形）；`eyes` 另有 `red`、`glow`、`twitch`、`blink`、`one` |
| `spikes` | 0..1 | 也可传 13 项数组逐节控制 |
| `jaw` | 0→60° | 另可叠 `joints.jaw`（总角度 ≤ 75°）；张嘴自动画颊皮 + 喉皮 |
| `plates[i]` | `{ lit, pop, char }` | 另有 `state`（glyph13 字槽状态） |
| `squash` / `expr` / `trail` | 统一签名里有 | 巨龙不支持：鼓胀用 `puff` / `chestSwell`，表情用 `eyes` / `jaw` / `redden` / `vein` / `steam`，尾巴动作用待机摆动 + `tailFlick` + `joints.tail`（飞行 / 冲锋自带行波）。小蜥蜴支持 `squash` |
| 新增参数 | — | `t, x, y, s, face, rot, pivot, flap, arms, grip, order, keepColor, silColor, nostril, joints, detail, flat, rod, part, alpha, seed` |
| 返回值 | `mouth, eyeL, eyeR, head, horn, plates, tailTip, segments, front` | 另有 `mouthAng, hornFar, nose, jawTip, headFront, claw, clawFar, wingTip, rods, root, scale, spine`；`horn` = 近侧角尖 |
| 导出 | `drawDragon`、`dragonSpine`、`DRAGON_POSES`、`drawLizard` | 另有 `DRAGON_HEAD_W`、`drawDragonHead`、`drawDragonEye`、`drawDragonClaw`、`LIZARD_POSES` |
| 小蜥蜴 | 13 个 pose + miniPlate | 13 个全有；`miniPlate` 可传 `{ chars, period }`；另有 `mouth`、`joints`、`eyes.one`；返回 `{ head, eye, mouth, paw, foot, tailTip, top, plate }` |

---

## 7. 已知限制与注意事项

- **性能**：一条完整巨龙 ≈ 13 节（剪纸片 + 腹甲 + 横纹 + 鳞弧 + 明暗）+ 13 个 glyph13 字 + 头 + 双翼，是全片最重的单个角色。同屏最多 1–2 条；远景、小尺寸（如 b02 飞向龙山 s < 0.3）传 `detail: 0`；背板字屏幕字高 < 7px 时自动换成光点。盘柱分层要画两次，开销翻倍。
- **透明度**：`alpha` 是逐片相乘，重叠处会透出接缝；整条龙淡入淡出请用 `ctx.layer(g, { alpha }, …)`。
- **剪影**：`silhouette` 只是把颜色换成 `silColor`；龙影的半透明与模糊交给图层（`{ alpha: 0.55, blur: 8 }`）。`keepColor: ['eye']` 的眼睛画全彩，配 `eyes.glow` 当发光眼。
- **插值**：`{from, to, k}` 是 64 点逐点插值，形状差太多（如 `coilPillar ↔ name`）中间帧会缩短或自交，用 `stagger` 或加一个中间姿态；`eyes.state`、`flat`、`order`、`depth` 在 k = 0.5 处切换，数值参数（wings / jaw / arms / eyes.open / pupil）线性插值。
- **`part`** 只对带 `depth` 的脊线（`coilPillar` 或自定义 spine 挂 `.depth`）有意义；其余姿态全算“柱前”，`part: 'back'` 什么都不画。
- **`popped`**：已弹飞节的 `plates[j]` 停在脖根；正在弹的那节（小数部分）给真实位置。缩小中心用 `pivot`，非 `shrink` 姿态默认以头心缩。
- **坐标系**：`standoff / puppet / shrink` 的预设是 STANDOFF **屏幕**坐标；在洞里用 `STANDOFF.cam` 拍时，要么不套 applyCam 直接画在屏幕层，要么 `x, y = STANDOFF.world.dragonHead` 并按机位 zoom 换算 `s`。`face: 1` 以头心镜像，尾巴会跑到头的左边。
- **`drawDragonEye` 的 `rot` 是弧度**，其余函数的 `rot` / `joints` 都是度。
- **杏仁巨眼**：轮廓是上下两段二次曲线（两端尖），与 b08 `caveMouthPath`（超椭圆式）在尖角处略有差异；严格的“洞口 = 龙眼”匹配转场，请用同一个遮罩形状（`fx/transitions.js` 的 `shapeGeom('almond')` 或 `caveMouthPath`）把眼睛和洞口一起框住。`shape: 'almond'` 不认 `state / lid / twitch / sil`，`open = 0` 时只画一道金色细缝。
- **喉皮**画在脖子之前、被脖子与下颚压住，只露出两者之间那块；`drawDragonHead({ neck: false })` 不画喉皮（没有脖子可接）。
- **木杆**只在带 `rods` 的姿态（`puppet`、`shrink`）画，从接点竖直向下 900px（调用方坐标）。
- **小蜥蜴**：`hideScarf` 只画头（围巾上沿以下裁掉），`paw / foot / tailTip` 返回 null；姿态插值时 `only:'head'`、`cycle`、`eyes` 在 k = 0.5 切换。“打哈欠”可用 `pose: 'sleep', mouth: 'open'`；肩上点头可用 `pose: 'ride'` + `joints.head` 跟拍子摆。迷你名字牌屏幕字高 < 6px 时画成点纹纸带。
- 纯函数：所有动态（待机起伏、行波、扇翅、自动眨眼、甩尾、蒸汽、走马灯）只由参数 `t` 决定，无跨帧状态。

---

## 8. 模型图清单

| 模型图 | 页（秒） | final 图 |
|---|---|---|
| `src/sheets/dragon.js` | [0,1) 样条预设一 · [1,2) 样条预设二 + face=1 · [2,3) D1 点亮 / 河豚 / 盘柱分层 · [3,4) popped 0/6/13、puppet jaw 0/1、龙爪 · [4,5) CU-D jaw 0 / 0.5 / 1 · [5,6) 表情与状态 · [6,8) 动态 · [8,9) 实拍构图核对 · [9,10) 杏仁巨眼 / eyes.one / 镜像龙爪 | `out/review/sheets/dragon/final_t0.50.png`、`final_t1.50.png`、`final_t2.50.png`、`final_t3.50.png`、`final_t4.15.png`（jaw 0）、`final_t4.50.png`（jaw 0.5）、`final_t4.85.png`（jaw 1）、`final_t5.50.png`、`final_t6.50.png`、`final_t8.50.png`、`final_t9.50.png` |
| `src/sheets/lizard.js` | [0,1) 全部姿态 · [1,2) 朝左 / 迷你名字牌 / 与 popped=13 对比 · [2,4) 动态循环 | `out/review/sheets/lizard/final_t0.50.png`、`final_t1.50.png`、`final_t2.50.png` |

自检命令：

```bash
./tools/lint.sh src/rigs/dragon.js src/sheets/dragon.js src/sheets/lizard.js docs/api/dragon.md
node tools/check.mjs sheets --list dragon,lizard
node tools/render.mjs stills --sheet dragon --times 4.15,4.5,4.85 --outdir out/review/sheets/dragon --prefix final_
```
