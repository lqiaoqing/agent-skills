# 勇者（hero）API

> 本组文件：`src/rigs/hero.js`（勇者木偶）、`src/props/scarf.js`（围巾与红色道具 + 组内共用剪纸小工具）、`src/props/sword.js`（剑、名字之剑、小剑图标）。
> 规格出处：`docs/assets.md` 第 0、1、9.1、9.2 节；镜头出处：`docs/storyboard.md`。本文所有参数名、默认值、枚举都按源码逐项核对过（2026-10-01 收尾版）。
> 全部函数是纯函数：画面只由参数（含 `t`）决定，内部 `save/restore`，不调 `ctx.layer / ctx.mask`，图层、投影、纸纹、景深由镜头决定。

---

## 1. 模块与导出一览

### src/rigs/hero.js

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawHero(g, o)` | 函数 | 画勇者全身木偶，返回锚点对象 |
| `heroRig(o)` | 函数 | 参数同 `drawHero`，**只求锚点不画**（预先算位置、给马镫 / 粒子 / 道具定位） |
| `drawHeroHead(g, o)` | 函数 | 只画头（头像框、角色卡、HUD、CU 反应格），锚在头心 |
| `HERO_POSES` | string[] | 全部动作名（59 个，见第 4 节） |
| `HERO_EXPRS` | string[] | 全部表情名（16 个，见第 4 节） |
| `HERO_H` | number = 260 | s=1 时身高（脚底到发顶，不含呆毛） |
| `HERO_SEAT` | number = 49 | 站立时“臀底接触点”到脚底的高度：骑乘 / 上下马锚点 = 脚底 y − 49·s |
| `HERO_STRIDE` | number = 150 | walk 一个周期（两步）前进的局部像素：`phase = 走过的路程 ÷ (150·s)` 时脚不打滑 |

### src/props/scarf.js

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawScarf(g, pts, o)` | 函数 | 沿中心线画粗细渐变的围巾（流苏、V 形缺口、破洞、补丁、冻住、金边、沿围巾写字） |
| `scarfPoints(root, o)` | 函数 | 生成围巾中心线（垂挂 / 顺气流飘 / 拖地 / 时间回溯拖尾 / 拉直系到某点） |
| `scarfTrail(anchorFn, T, n, lag)` | 函数 | 时间回溯采样：第 k 点 = `anchorFn(T − k·lag)` |
| `drawScarfWipe(g, T, o)` | 函数 | b14 入场：巨型围巾从右往左擦屏 |
| `scarfWipeMask(T, o)` | 函数 | 擦屏的揭示区域 Path2D（给 `ctx.mask` 画后一镜） |
| `drawScarfBand(g, T, o)` | 函数 | b07 入场：红虚线合拢成满屏红带 |
| `drawBookmark(g, o)` | 函数 | scarf 色燕尾书签 |
| `drawScarfKnot(g, o)` | 函数 | b15：围巾缠住两人相握的手（红绳 + 蝴蝶结） |
| `paperFill(g, path, fill, o)` | 函数 | 组内共用：一片剪纸（右下错位投影 → 底色 → 左上受光 → 底边暗线 → 顶边亮线） |
| `rimLine(g, path, color, w=2, a=0.7, dir=1, rule)` | 函数 | 组内共用：切口亮边（dir 1）/ 底边暗线（dir −1），方向按屏幕算 |
| `sdir(g, sx, sy)` | 函数 | 组内共用：屏幕方向在当前变换下的局部单位向量（镜像 / 旋转后光照仍在左上） |
| `ribbonOf(pts, w0, w1=w0, end='flat', depth=0)` | 函数 | 沿点列的条带 Path2D（end：`flat / notch / round`） |
| `resample(pts, n, len=∞)` | 函数 | 按弧长等距重采样成 n 点 |
| `star4(g, x, y, size, color, alpha=1)` | 函数 | 永远正立的四角星（剑光、金边闪点、牙齿闪光） |

### src/props/sword.js

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawSword(g, o)` | 函数 | 立誓那把“最好的剑”：入鞘 / 出鞘 / 空鞘 / 剧场平面版 / 剑光 / 拔剑弧光 / 崩口 |
| `drawNameSword(g, o)` | 函数 | b13 名字之剑：13 块钢字牌飞入、剑尖、扫光、围巾缠柄 |
| `drawSwordIcon(g, o)` | 函数 | 地图与菜单用的小剑图标（彩色剪纸 + 墨线外描边） |
| `SWORD` | 常量 | 最好的剑尺寸：`{ pommel:-23, gripA:-15, gripB:14, guard:18, bladeA:22, tip:128, sheathTip:134, guardHalf:23.5, bladeW:15 }`（s=1，沿刃方向 u，握点 u=0） |
| `NAME_SWORD` | 常量 | 名字之剑尺寸：`{ tile:120, pitch:126, first:60, tipLen:160, gripA:-104, gripB:-14, pommel:-124, guardHalf:104 }` |

---

## 2. 坐标、尺寸与锚点约定

### 2.1 锚点 (x, y)

| 动作类别 | (x, y) 是什么 |
|---|---|
| 站立 / 走跑 / 表演 / 战斗 / 尾声 / 纸偶（`ground` 自动着地） | **脚底中心**：两只脚（及跪地的膝盖）里最低的点自动踩在 y 上 |
| 腾空类：`roll`、`vault`、`hop`（腾空段约 act 0.1–0.9）、`hangSwing`、`kick`、`puppetInMouth` | 不自动着地：髋部固定在 y − 58·s（站立时的髋高），四肢自由摆；跳多高由镜头改 y。`roll` 例外：自动把整团“球”的底贴在 y 上 |
| 骑乘：`ride / rideSlash / rideLean / rideHunch / sneeze / rideFront` | **马的 `saddle` 锚点（鞍顶中心）**，只画外侧一条腿（远侧腿被马身挡住） |
| 上下马：`mount / dismount` | **臀底接触点**（= 站立时脚底 y − `HERO_SEAT`·s；骑上去后 = 马的 saddle） |

### 2.2 尺寸（s = 1）

- 身高 260（`HERO_H`，脚底到发顶，不含呆毛）；头宽约 94、头高约 104；头心约在脚底上方 200。呆毛再高约 25–40。
- 站立时髋高 58、颈根（围巾结）约在脚底上方 150；臀底接触点在脚底上方 49（`HERO_SEAT`）。
- 局部单位 = s=1 时的像素；所有长度参数（`scarf.len / width`、`rodLen`、`nameTagSize`）都是 s=1 的局部值，随 s 等比缩放。
- 景别对照（storyboard 3.2）：全景 zoom 1 = 260px；中景 zoom 1.6 ≈ 420px；CU zoom 3.4 头 ≈ 360px。外景 CASTLE 用 s = 0.26 / 0.30（建议同时 `detail: 0`）。

### 2.3 朝向与镜像

- `face: 1` 朝右、`-1` 朝左：整体 scaleX 镜像。**胸前名签文字不镜像**；问号呆毛在 face=−1 时自动翻成正读的问号。
- 围巾拖尾在“不镜像的围巾坐标”里算：默认往身后（x 符号 = −face）飘 / 拖地，`scarf.vel / wind / trail / to / ground` 一律用世界坐标传。
- 以下角度都是**镜像前的局部角**（face=−1 时屏幕上看是反的）：`swordAngle`（0 = 朝前、−π/2 = 朝上）、`rot`（正 = 顺时针）、返回值里的 `swordAngle`。屏幕方向 = face>0 ? a : π − a（未计 `rot / turn`）。
- 光照与投影永远按屏幕算（左上受光、右下投影），镜像、旋转后不会反。

### 2.4 返回的锚点对象（`drawHero` 与 `heroRig` 相同，均为调用方坐标，即与 x, y 同一坐标系）

| 字段 | 含义 |
|---|---|
| `head` | 头心 |
| `mouth` | 嘴（气泡尾巴、喷嚏、吸气、说话粒子从这里发） |
| `eye` | 两眼中点 |
| `eyes` | `[近侧眼, 远侧眼]` |
| `neck` | 围巾结（围巾根，颈根） |
| `handR` | **近侧手**（持剑手；“R”不随 face 变，永远是靠镜头那只） |
| `handL` | 远侧手 |
| `hilt` | 剑柄握点（剑在手里时 = 手心；入鞘时 = 背上剑柄） |
| `swordTip` | 剑尖（入鞘时 = 鞘尖） |
| `swordAngle` | 手中剑 / 背剑的刃方向（弧度，镜像前局部角，见 2.3） |
| `scarfEnd` | 长围巾末端（婴儿啃围巾尾巴、粒子拖尾用） |
| `scarf` | 长围巾中心线点列（28 点，世界坐标；镜头可再沿它挂东西） |
| `seat` | 臀底接触点（骑乘时 ≈ 马的 saddle） |
| `chest` | 胸口中心 |
| `nameTag` | 胸前名签中心 |
| `ear` | 拢耳 / 放大的那只耳朵（`cupEar` 时 = 朝前那只；否则 = 后脑侧可见的那只） |
| `ahogeTip` | 呆毛尖（蜡烛火苗、问号弹起、头顶小名签挂点） |
| `foot` / `footB` | 近侧 / 远侧脚底（骑乘时 `foot` = 马镫位置，传给马的 `stirrupAt`） |
| `knee` | 近侧膝盖 |

`drawHeroHead` 只返回 `{ mouth, eyes:[近,远], ahogeTip }`。

---

## 3. 函数详解

### 3.1 `drawHero(g, o) → anchors`

**基础**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | 0, 0 | 锚点（见 2.1），调用方已 `applyCam` 的世界坐标 |
| `s` | 1 | 缩放（1 = 身高 260） |
| `face` | 1 | 1 朝右 / −1 朝左 |
| `t` | 0 | 秒；驱动呼吸、眨眼、呆毛摆、围巾飘、火苗、汗；传 `T` |
| `pose` | `'idle'` | 动作名（第 4.1 节），或 `{ from, to, k }` 在两个动作之间插值（关节角线性插值，`from/to` 可再嵌套）；未知名字按 `idle` 画 |
| `act` | 各动作代表帧 | 动作类 pose 的进度 0..1（`draw / slash / hop / roll …`）；不传时用代表帧（见 4.1 表“默认 act”），其余动作默认 0.5 |
| `phase` | 由 t 推算 | 循环类 pose（walk / run / charge / dance / ride 系）的相位，1 单位 = 1 个周期；**不随 face 翻转**（见 5.1、5.3） |
| `expr` | 动作自带 | 表情名（第 4.2 节）；覆盖动作自带表情 |
| `alpha` | 1 | 整体透明度 |
| `detail` | 1 | 0 = 平涂省略（无纸片投影 / 亮边 / 腮红 / 鼻子 / 眉，眼睛简化成豆豆）——远景 s ≤ 0.3 与人群用 |
| `seed` | 1 | 眨眼相位、呆毛摆相位、围巾飘动噪声的种子（同屏多个勇者时错开） |
| `blink` | 自动 | 0..1 强制眨眼程度（不传时约每 3.7s 眨一次） |
| `yaw` | 动作自带 | 头的朝向 −1..1（1 = 3/4 朝前，0 = 正对镜头，−1 = 回头） |
| `joints` | — | 关节表覆盖：`{ lean, nod, aF:[肩,肘,腕], aB, lF:[髋,膝,脚], lB, hF, hB, … }`（键见 hero.js `BASE` 注释），整体替换对应键 |
| `jointsAdd` | — | 关节表叠加：数值 / 数组逐项相加（如 `{ lean: 10, aF: [20, 0, 0] }` 在任意 pose 上再前倾 10°、抬臂 20°） |

**变形与特殊模式**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `squash` | 0 | 挤压拉伸（>0 拉长、<0 压扁，保持面积），以锚点为基准；人马同时挤压时传同一个值 |
| `turn` | 0 | 0..1 scaleX 翻面（0 正面朝 face，0.5 侧薄成一条线，1 = 翻到背面 ≡ face 取反）。只翻身体，围巾不跟（见第 7 节） |
| `rot` | 0 | 整体转角（弧度，镜像前局部角），绕 `pivot` 转；骑乘时传马的 `saddleRot` |
| `pivot` | `[0, 0]` | `rot` 的转心（局部坐标，相对锚点，s=1 单位，镜像前） |
| `silhouette` | false | 剪影：全部部件填 `silColor`，只留 `keepColor` 里的部件原色 |
| `silColor` | `PAL.ink` | 剪影色 |
| `keepColor` | `['scarf']` | 剪影时保留原色的部件：`'scarf' / 'sword' / 'skin' / 'hair' / 'body' / 'glove' / 'rod'`；传 `[]` = 连围巾也剪影 |
| `edge` | null（纸偶为 `{ color: PAL.paper, w: 6.5 }`） | 先把整个外轮廓描一遍 `{ color, w }`（贴纸边 / 剪影红边），再正常画；传 `null` 关掉纸偶默认白边 |
| `flat` | false | 剧场平面版画法（无明暗、薄投影）；纸偶动作与 `rod:true` 自动开启 |
| `rod` | false | 纸剧场木偶：脚下画一根木杆 + 金色杆头；纸偶类 pose 自带木杆，传 `rod: false` 可去掉木杆（铜钉保留） |
| `rodLen` | 520 | 木杆长度（局部单位） |
| `part` | `'all'` | `'body'` 只画身体（不画围巾）/ `'scarf'` 只画围巾（拖尾 + 颈部缠绕）——要把围巾放到别的图层（比如马前面、景深层）时分两次画 |

**勇者特有**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `scarf` | `{}` | 围巾子参数，见下表 |
| `ahoge` | `'normal'` | 呆毛：`normal / question / straight / heart / candle`；也可传 `{ from, to, k }` 曲线插值（任意两形之间，含 `heart`：k 由 0→1 时右半边弯成心、左半边从发根长出） |
| `curl` | 0 | 0..1，`normal` 呆毛卷起程度 |
| `flame` | 0 | 0..1，呆毛尖上的小火苗（配 `ahoge: 'candle'`，b10 D2b） |
| `ahogeAt` | null | 秒：在这一刻呆毛弹一下（5Hz 阻尼摆动，±28°）——“呆毛一弹想起来了”“开心地摆” |
| `sword` | 动作自带，否则 `'back'` | `'back'` 剑入鞘背在背上 / `'hand'` 出鞘在近侧手（背上留空鞘）/ `'shoulder'` 在手里扛在肩上（默认角 −160°）/ `'empty'` 背上只有空鞘、手里没剑（交出剑、握名字之剑时）/ `'none'` 剑和鞘都不画 |
| `swordAngle` | 动作自带 | 手中剑的刃方向（弧度，镜像前局部角：0 朝前、−π/2 朝上）；不传时用动作表的角，动作没写时按小臂方向自动算 |
| `swordGlint` | 0 | 0..1 剑光：四角星沿刃口跑到剑尖的进度（b09 V15 102.85） |
| `swordArc` | 动作自带 | 0..1 拔剑 / 挥砍的白色月牙弧光强度（只对带弧光的动作生效：`draw / slash / rideSlash / swingMiss`） |
| `chip` | false | 剑刃崩口 |
| `injury` | `{}` | `{ bandages: 0..4, bump: false, singed: false, torn: false }`，见下表 |
| `soot` | 0 | 0..1 满脸 / 头发 / 衣服黑灰；≥0.4 时眼睛变白眼珠、眉线变奶油色（b10 D2b–R1） |
| `inflate` | 0 | 0..1 吸气鼓胸鼓腮（1 = 身体横向 1.22 倍、脸颊鼓起、嘴变成噘起的小圆、>0.5 时闭眼） |
| `earScale` | 1 | 拢耳时那只耳朵的放大倍数（Q1 到 1.3）；`cupEar` 放大朝前（face 方向）那只，其它动作放大后脑侧可见的那只 |
| `nameTag` | null | 胸前名签文字（b16 O01 起「达拉崩吧」），奶油纸签 + 红色 display 字，不镜像，剪影 / 描边时不画 |
| `nameTagSize` | 24 | 名签字号（局部单位） |
| `nameTagPop` | 1 | 0..1 名签弹出进度（outBack 缩放），做“唰”地出现 |
| `blush` | 0 | 0..1 脸红（腮红加深 + 斜线红晕） |
| `sweat` | 0 | 0..1 一滴汗（太阳穴处，越大越往下滑；`worried` 表情自带 0.8） |
| `toothSparkle` | null | 秒：牙齿闪光（四角星 + 金光）在这一刻后 0.08s 最亮，前后共约 0.4s（b05 53.30） |

**`o.scarf` 子参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `len` | 780 | 长围巾总长（局部单位，s=1 ≈ 身高 3 倍） |
| `width` / `endWidth` | 22 / 8 | 根部 / 末端宽 |
| `glow` | 0 | 0..1 金边 + 沿边跑的金色四角星（V03 后 0.6） |
| `notch` | false | 末端 V 形缺口（V07 起） |
| `hole` | false | 中段破洞（透明，V07 起） |
| `patch` | false | 破洞上的粉色补丁（E09 起，与 `hole` 同时传） |
| `frozen` | 0 | 0..1 冻成硬板（变直 + 冰霜 + 冰凌，V11）；1 → 0 就是“喷嚏后裂开变软” |
| `wrapFace` | 0 | 0..1 在脸上缠一圈的进度（b03 23.05–23.30） |
| `vel` | `[face·动作标称速度, 0]` | 世界速度 px/s；气流 = wind − vel，越大围巾越平直地往后飘。**站着不动却用跑姿时要传 `[0,0]`** |
| `wind` | `[0, 0]` | 世界风速 px/s（b08 顶风 `[-500, 0]`，b13 自己飘起 `[0, -300]` 之类） |
| `trail` | null | 时间回溯拖尾（第 k 点 = 锚点在 T − k·lag 的世界位置 − 当前位置，k=0 为 [0,0]），见 5.4；传了就优先用它 |
| `lag` | 0.035 | `trail` 的采样间隔（秒） |
| `to` | null | `[x, y]` 世界点：围巾从结点拉直系到这一点，余下部分从那里垂下（b11 挂在龙角上荡秋千） |
| `ground` | 站姿 = y；骑乘 = 锚点下方 160·s | 地面世界 y：围巾落到这里就贴地往身后拖；悬空镜头传一个很大的值（如 1e5）就一直垂着 |
| `back` | −face | 身后方向的 x 符号（垂挂时根部朝哪边斜）；转身镜头里可自己连续传 −face·cos(π·turn) |
| `show` | true | false = 不画围巾（拖尾 + 颈部缠绕都不画），由镜头自己用 `drawScarf` 画 |

**`o.injury`**

| 字段 | 效果 |
|---|---|
| `bandages` ≥ 1 | 脸颊 X 形创可贴 |
| `bandages` ≥ 2 | 头顶十字贴（与 `bump` 同位置） |
| `bandages` ≥ 3 | 近侧小臂绷带 |
| `bandages` = 4 | 近侧膝盖创可贴（V07 遍体鳞伤；V08 每升一级减 1） |
| `bump` | 头顶肿包 |
| `singed` | 后脑焦了一撮（焦黑 + 卷曲焦发 + 一缕烟，烟随 t 飘） |
| `torn` | 近侧袖子撕破露出小臂 + 袍摆一个三角破口 |

**返回值**：锚点对象（第 2.4 节）。

### 3.2 `heroRig(o) → anchors`

参数与 `drawHero` 完全相同，只求姿态、骨架、围巾点列与锚点，不画任何东西（代价约为 `drawHero` 的一小部分）。用途：先求 `foot` 给马的 `stirrupAt`；先求 `handR` 反解 x,y 让手对准道具（名字之剑剑柄、相握的手）；粒子 `emit` 回调里取 `mouth / swordTip / scarfEnd`；镜头里预先算跟拍位置。

### 3.3 `drawHeroHead(g, o) → { mouth, eyes, ahogeTip }`

只画头，锚在**头心**（不是脚底）。s=1 时头宽约 94。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t` | 0, 0, 1, 1, 0 | 同 drawHero |
| `expr` | `'normal'` | 表情 |
| `yaw` | 1 | 头的朝向 −1..1 |
| `rot` | 0 | 头整体转角（弧度，镜像前） |
| `ahoge / curl / flame / ahogeAt` | `'normal'` / 0 / 0 / null | 同 drawHero |
| `soot / blush / inflate / sweat / toothSparkle` | 0 / 0 / 0 / 0 / null | 同 drawHero |
| `injury` | `{}` | 同 drawHero（头上能看到的：bandages ≥1、≥2、bump、singed） |
| `scarf` | `{}` | 只用 `scarf.wrapFace` |
| `earScale` / `earSide` | 1 / 0 | 放大哪只耳朵：`earSide` 1 = 朝前那只（拢耳，配 `yaw` ≈ −0.3 才看得见）、0 / −1 = 后脑侧那只 |
| `detail / seed / blink` | 1 / 1 / 自动 | 同 drawHero |
| `silhouette / silColor / keepColor / edge / flat` | — | 同 drawHero |

### 3.4 `drawSword(g, o) → { tip, hilt, pommel, guard }`

锚在剑柄握点。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s` | 0, 0, 1 | 握点、缩放（s=1 总长约 157） |
| `rot` | −π/2 | 刃的方向（弧度：0 向右、−π/2 向上） |
| `state` | `'bare'` | `'bare'` 出鞘 / `'sheathed'` 入鞘 / `'scabbard'` 空鞘 |
| `glint` | 0 | 0..1 四角星沿刃口跑到剑尖 |
| `chip` | false | 崩口 |
| `arc` | 0 | 0..1 白色月牙弧光强度（只对 bare） |
| `arcSpan` | 1.4 | 弧光张角（弧度，最大 5.4） |
| `arcDir` | 1 | +1 顺时针挥 / −1 逆时针 |
| `flat` | false | 剧场平面版 |
| `detail` | 1 | 0 = 平涂 |
| `alpha` | 1 | 透明度 |
| `sil` | null | 剪影色（整把只填这一色） |
| `edge` | null | `{ color, w }` 只描外轮廓（贴纸边） |

返回 `tip`（出鞘 = 剑尖，入鞘 = 鞘尖）、`hilt`（= x,y）、`pommel`、`guard`（调用方坐标）。勇者手里 / 背上的剑由 `drawHero` 内部调用它，镜头单独画剑（b03 剑之誓、掉落的剑）时直接用。

### 3.5 `drawNameSword(g, o) → { guard, grip, wrapStart, wrapEnd, pommel, tip, slots, length }`

b13 名字之剑。锚在**护手中心**（剧场 (600,560)）。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s` | 600, 560, 1 | 护手中心、缩放 |
| `angle` | 0 | 0 水平向右 → −π/2 竖直向上（b13 156.80） |
| `tiles` | 13 个 1 | 长 13 的 0..1：每块字牌从名字牌飞来的进度（1 = 落位）；第 i 块落位中心 u = 60 + 126·i |
| `from` | `[427, 219]` | 飞来的起点：一个 `[x,y]` 或 13 个 `[x,y]`（默认勇者名字牌窗口中心） |
| `tip` | 第 13 块落位即 1 | 0..1 剑尖出现（outBack） |
| `glow` | 0 | 0..1 沿刃跑的扫光，扫过的字常亮 goldLight |
| `scarfWrap` | 0 | 0..1 红围巾从剑首一侧螺旋缠到护手一侧；>0.85 后末端流苏飘起 |
| `notch / hole / patch` | true / true / false | 飘起的围巾末端状态 |
| `part` | `'all'` | `'back'` = 围巾末端 + 柄后半圈缠绳 + 剑首 / 柄 / 护手 + 刃与字（一切主体，先于木偶手画）；`'front'` = 柄前半圈缠绳（后于木偶手画） |
| `chars` | 勇者全名 | 13 个字 |
| `t, detail, alpha` | 0, 1, 1 | — |

字由 `type.glyph13` 画（state `'steel'`，96px），永远正立（倾角夹 ±15°）。返回调用方坐标：`guard`、`grip`（握柄中心，手对准它）、`wrapStart / wrapEnd`、`pommel`、`tip`、`slots`（13 个 `[x, y, angle]`）、`length`。

### 3.6 `drawSwordIcon(g, o)`

锚在剑的中心。`{ x=0, y=0, size=64（全长 px）, rot=−π/4（斜向右上）, ink=2.4（墨线外描边，0 不描）, glow=0, alpha=1 }`。无返回值。b03 地图、b13 技能菜单用。

### 3.7 `drawScarf(g, pts, o) → { end, hole, len, path }`

沿中心线 `pts`（≥2 点，调用方坐标）画围巾。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `width / endWidth` | 22 / 8 | 根宽 → 末端宽（按 u^1.6 收窄） |
| `notch / hole / patch` | false | V 形缺口 / 破洞（透明）/ 粉色补丁 |
| `holeAt` | 0.5 | 破洞在全长的位置 0..1 |
| `frozen` | 0 | 0..1 冰霜 + 冰凌（中心线要变直请用 `scarfPoints` 的 `frozen`） |
| `glow` | 0 | 0..1 金边 + 跑动四角星 |
| `fringe` / `fringeLen` | true / 15·width/22 | 末端流苏 / 流苏长 |
| `stripes` | true | 末端两道织纹 |
| `color / dark` | `PAL.scarf / PAL.scarfDark` | 主色 / 暗面色 |
| `lift` | 2 | 纸片投影高度（局部单位） |
| `t, seed, detail, alpha` | 0, 3, 1, 1 | — |
| `sil` | null | 剪影色（整条只填这一色） |
| `edge` | null | `{ color, w }` 只描外轮廓 |
| `text` 等 | — | 沿围巾写字（b06 片名下划线）：`text, textSize=width·0.72, textFamily='display', textFill=PAL.gold, textEdge, textStart=width·0.6, textGrow, textGap` |

返回 `end`（末端点）、`hole`（破洞中心或 null）、`len`（弧长）、`path`（外轮廓 Path2D）。

### 3.8 `scarfPoints(root, o) → [[x,y]…]` 与 `scarfTrail(anchorFn, T, n=24, lag=0.035)`

`scarfPoints`：等弧长 n 点，第 0 点 = `root`。`o: { len=780, n=28, t=0, vel=[0,0], wind=[0,0], back=-1, ground=null, trail=null, lag=0.035, frozen=0, to=null, seed=1, flutter=1, speedRef=650 }`，单位与 root 同一坐标系（px、px/s）。气流 = wind − vel，|气流| 达到 `speedRef` 时完全顺气流平飘；为 0 时垂下、碰到 `ground` 贴地往 `back` 方向拖。`trail` / `to` 含义同 3.1 围巾子参数。

`scarfTrail(anchorFn, T, n, lag)`：返回 n 个点，第 k 点 = `anchorFn(T − k·lag)`。再减去当前锚点就是 `drawHero` 的 `scarf.trail`（见 5.4）。

### 3.9 擦屏、红带、书签、红绳

- `drawScarfWipe(g, T, o) → { reveal, lead, hole }`：屏幕坐标。`o: { p 0..1（0 = 还在画右外，1 = 整条扫出画左）, y=540（中线）, w=1240（围巾宽）, len=1750（满宽段长）, notch=true, hole=true, patch=false, t=T, seed=41 }`。前端 V 形缺口 + 流苏，后段扭成侧面甩出右上；破洞透明。
- `scarfWipeMask(T, o) → Path2D`：同参数，前端轮廓右侧的揭示区域（后一镜用 `ctx.mask` 画在里面，见 5.6）。
- `drawScarfBand(g, T, o) → { angle, width, dir }`：屏幕坐标。`o: { p 0..1（1 = 完全合拢）, angle=-0.42, width=110, cx=960, cy=540, period=width·4.25, dash0=0.59, wave 0..1（开始像围巾一样起伏）, t=T, length=2900, seed=7 }`。
- `drawBookmark(g, o) → { tip }`：锚在丝带从书口伸出的上端。`o: { x=1560, y=880, len=120, width=34, s=1, t, wobbleAt（抽动时刻，4Hz 阻尼）, rot=0, detail=1, alpha=1 }`。
- `drawScarfKnot(g, o) → { bow }`：锚在两只手相握的中心。`o: { x, y, s=1, p 0..1（0–0.75 一圈圈缠上，0.75–1 顶上弹出蝴蝶结）, part:'back'|'front'|'all', t, turns=2.2, rx=30, ry=17, width=12, seed=13 }`；`'back'` 先于手画、`'front'` 后于手画。

---

## 4. 枚举全表

### 4.1 `pose`（`HERO_POSES`，59 个）

“循环”= 由 `phase`（或 t）驱动、1 单位 1 周期；“act”= 动作进度 0..1（括号里是不传 act 时的代表帧）。用到的块按 assets.md 第 1 节与 storyboard 第 5 节整理。

| 类别 | pose | 一句话说明 | 驱动 | 用在 |
|---|---|---|---|---|
| 站与走 | `idle` | 站立呼吸（3.4s）、眨眼、手臂轻摆 | t | 全片 |
| | `walk` | 走路，默认围巾速度 140 | 循环（0.8s；phase = 路程 ÷ 150·s） | b08 98.55 走向洞口、b13 |
| | `run` | 跑步，前倾，默认围巾速度 430 | 循环（0.5s） | b03 |
| | `kneeSlide` | 跪地滑行（后腿跪地、双手张开），默认围巾速度 380 | — | b03 22.30 跪滑进光圈 |
| | `brake` | 急停后仰、双臂乱挥（配 `squash`） | — | b03 23.05 停住、b11 135.50 被推回 |
| 表演 | `heroPose` | 一手叉腰、剑扛在肩上（sword 自动 `shoulder`） | — | b07 V01 亮相 |
| | `scratchHead` | 挠头（手 IK 到头顶，手腕抖） | t | b04 |
| | `think` | 一指抵下巴、眼珠右上翻 | — | b04 38.11 想名字 |
| | `inhale` | 深吸气后仰（配 `inflate` 0..1） | — | b04 41.x 吸气到最鼓 |
| | `shout` | 大喊（身体高频微抖） | t | b03 一声大喊、b05 四遍名字 |
| | `proud` | 叉腰得意、下巴抬起 | — | b05 N1a |
| | `thumbsUp` | 双手竖拇指 + 轻跳 | t | b05 H1 53.18「对对！」 |
| | `cupEar` | 拢耳探身（远侧手 IK 到耳朵，配 `earScale` 1.3） | — | b10 Q1（与国王 K1 镜像） |
| | `fingerUp` | 竖一根手指 | — | b10 Q2「是不是…」 |
| | `present` | 魔术师张臂一指 | — | b10 道具栏每出一件 |
| | `bow` | 深鞠躬 | — | b10 M3 传说级 |
| | `shieldFace` | 抬臂挡脸 | — | b10 D3 名字墙下 |
| | `sigh` | 叹气垂肩 | — | 尾声 |
| | `gulp` | 咽口水、双手缩在胸前 | — | b09 巨眼睁开 |
| | `turnHead` | 慢慢回头（yaw −0.65） | — | b09 101.20 |
| | `freeze` | 吓僵（微抖、不呼吸） | t | b09、b10 117.20 笑僵 |
| 骑乘（锚 = saddle） | `ride` | 马上随步态起伏 | 循环（0.42s） | b07 出城、b08、b14 |
| | `rideSlash` | 马上挥砍一刀（带弧光） | act（0.3） | b07 三刀砍史莱姆（act 0→1 连做三次） |
| | `rideLean` | 俯身用剑尖挑箱 | 循环 | b08 V10 |
| | `rideHunch` | 顶风弓身 | 循环 | b08 V11 |
| | `sneeze` | 马上打喷嚏（憋气 → 喷 → 松） | act（0.6） | b08 喷嚏震落积雪 |
| | `mount` | 跃上马鞍的弧线中段（锚 = 臀底） | — | b07 77.20 |
| | `dismount` | 下马（act 0 在鞍上 → 1 双脚落下） | act（0.5） | b08 98.30 |
| | `rideFront` | 前座（公主 `ridePillion` 在后座） | 循环 | b14 E03 |
| 战斗 | `gripHilt` | 反手握住背上剑柄（剑仍在鞘） | — | b09 V15 102.10 |
| | `draw` | 长弧拔剑（act 0 握柄 → 1 剑指前上方，带弧光） | act（1） | b09 102.40 |
| | `stance` | 剑尖指前戒备 | t | b09、b11 |
| | `roll` | 抱团翻滚，act 0→1 = 转一整圈 | act（0.25） | b11 121.30 |
| | `plantSword` | 双手竖剑劈火 | — | b11 121.70 |
| | `vault` | 撑着翻越（act 0→1 转一整圈） | act（0.5） | b11 128.60 从龙头上方翻过 |
| | `hop` | 起跳 → 腾空 → 落地（腾空段不自动着地） | act（0.5） | b11 124.30 踩名字跳、b10 110.30 跳起 |
| | `thrust` | 前刺 | act（0.4） | b11 127.80 对撞 |
| | `slash` | 挥砍（带弧光） | act（0.38） | b11 129.10 反砍 |
| | `hangSwing` | 双手抓着挂在头顶的围巾荡（配 `scarf.to`） | — | b11 131.50 |
| | `kick` | 腾空踢 | — | b11 |
| | `charge` | 剑尖朝前冲锋跑，默认围巾速度 520 | 循环（0.5s） | b11 133.60 |
| 躲闪（新增） | `duck` | 低头蹲躲、双手护头 | — | b10 D2a 110.00、b11 129.10 低头躲翼 |
| | `limbo` | 后仰下腰 | — | b10 D2a 110.60 |
| | `sidestep` | 侧身收腹：转向镜头、双手贴身、踮脚 | — | b10 D2a 110.90（110.30 跳起用 `hop`，111.30 转身用 `turn`） |
| 剧场纸偶（自带 `flat` + 白边 + 铜钉 + 木杆） | `puppetStand` | 持剑站 | — | b12 B01 |
| | `puppetLunge` | 弓步前刺 | — | b12 140.50 出招 |
| | `puppetSlash` | 跳起月牙斩 | act（0.5） | b12 B03 141.28 |
| | `puppetInMouth` | 只画两条乱蹬的腿（头在龙嘴里） | t | b12 149.80 |
| | `puppetKneel` | 单膝跪地 | — | b13 150.90 |
| | `puppetRise` | 握拳站起（背上空鞘） | — | b13 153.00–153.20 |
| | `puppetHoldSword` | 横握名字之剑剑柄（背上空鞘，剑由 `drawNameSword` 画） | — | b13 B10 起 |
| 尾声 | `swingMiss` | 潇洒一剑砍空、踉跄 | act（0.55） | b13 161.35 E01 |
| | `holdHands` | 牵手（远侧手向前平伸，牵住画右的公主） | — | b15 E11、b16 |
| | `dance` | 跳舞踏步（配 `turn` 翻面） | 循环（0.9s） | b16 186.20 |
| | `leanOver` | 俯身看摇篮 | — | b16 O03 |
| | `unrollScroll` | “唰”地摊开长名卷轴 | — | b16 O05 193.73 |
| | `tieScarf` | 弯腰系围巾 | — | b16 O06 |
| | `deflate` | 长出一口气瘪下去 | — | b16 196.80 |
| | `cheer` | 双手举高欢呼、跳 | t | b05 出场、b13 160.50、b16 |

### 4.2 `expr`（`HERO_EXPRS`，16 个）

| expr | 说明 | 用在 |
|---|---|---|
| `normal` | 豆豆眼带高光 + 微笑 | 全片 |
| `grin` | 眯眼咧嘴笑（露牙 + 心形舌） | b05、b07 上马、b10 张臂 |
| `smug` | 半睁眼 + 一边眉挑 + 坏笑 | b05 得意、b07 亮相、b10 Q2、b16 O05 |
| `determined` | 怒眉 + 一字嘴 | b07 骑行、b09 握剑拔剑、b11 撕纸分屏 |
| `shout` | 大嘴闭眼（> < 眼） | b03、b05、b07 砍怪、b11 |
| `shock` | 白眼圈小瞳孔 + O 嘴 | b09、b10 笑僵、b13 砍空 |
| `think` | 眼珠右上翻 + 抿嘴 | b04 |
| `squint` | 一只眼眯成线 | b10 Q1 拢耳 |
| `wink` | 远侧眼眨、咧嘴 | b06 勇者卡 |
| `hurt` | 闭眼咬牙 | b07 V07、b08 顶风、b10 D3、b11 翻滚 |
| `dizzy` | 蚊香眼（随 t 转）+ 波浪嘴 | b12–b13 被咬 / 吐出来 |
| `worried` | 八字眉 + 波浪嘴 + 自带汗 0.8 | b04 39.55、b09 |
| `laugh` | 大笑 | b05 H1、b16 跳舞 |
| `shy` | 眯眼 + 小嘴 + 脸红 0.7 | b13 163.00、b15 |
| `relieved` | 闭眼 + 小 o 嘴 | b16 196.80、鞠躬 |
| `sneeze` | 憋喷嚏（闭眼八字眉 + o 嘴；`sneeze` 动作内部用，也可直接用） | b08 |

叠加件（不是 expr，单独传）：`sweat` 0..1、`toothSparkle`（时刻）、`blush` 0..1、`soot`、`inflate`、`ahogeAt`。

### 4.3 其它枚举

| 参数 | 取值 |
|---|---|
| `ahoge` | `normal`（可配 `curl` 0..1）、`question`（b04）、`straight`（吓到竖直）、`heart`（b13 163.00）、`candle`（配 `flame`，b10 D2b）；或 `{ from, to, k }` |
| `sword` | `back`、`hand`、`shoulder`、`empty`、`none`（见 3.1） |
| `part` | `all`、`body`、`scarf` |
| `keepColor` 部件名 | `scarf`、`sword`、`skin`、`hair`、`body`、`glove`、`rod` |
| 手形（`joints.hF / hB`） | `fist`、`open`、`flat`、`point`、`thumb`、`cup` |
| `drawSword.state` | `bare`、`sheathed`、`scabbard` |
| `drawNameSword.part` / `drawScarfKnot.part` | `back`、`front`、`all` |

---

## 5. 推荐用法

以下片段假设镜头文件在 `src/scenes/` 下，常用 import：

```js
import { PAL } from '../core/paper.js';
import { lerp, wobble } from '../core/util.js';
import { ez, glide, outExpo, outCubic, inOutCubic } from '../core/ease.js';
import { applyCam, lerpCam } from '../core/camera.js';
import { drawHero, heroRig, drawHeroHead, HERO_SEAT, HERO_STRIDE } from '../rigs/hero.js';
import { scarfTrail, drawScarfWipe, scarfWipeMask } from '../props/scarf.js';
import { drawNameSword } from '../props/sword.js';
```

### 5.1 图层 + 机位 + 走路（phase 与 face）

```js

const c = lerpCam(camA, camB, ez(T, t0, t1, glide));            // 机位（camA / camB 用地点的预设机位）
// 勇者从右往左走：face = -1。phase 不随 face 翻转，所以要传“走过的路程”= face·x
const x = 1500 - 160 * lt, face = -1, s = 1;
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {           // 纸片投影 / 纸纹由图层给
  applyCam(lg, c, 1);                                           // 主体层 depth 1
  drawHero(lg, { x, y: 860, s, face, t: T, pose: 'walk', phase: (face * x) / (HERO_STRIDE * s), scarf: { vel: [face * 160, 0] } });
});
ctx.layer(g, { blur: 4 }, (lg) => { applyCam(lg, c, 1.4); drawForegroundGrass(lg, T); }); // 前景虚化
```

### 5.2 动作插值、动作进度、表情叠加件（b04 / b05）

```js
// b04：想名字 → 呆毛慢慢弯成问号，一滴汗；39.55 汗滑下
drawHero(lg, { x: 620, y: 860, t: T, pose: 'think', ahoge: { from: 'normal', to: 'question', k: ez(T, 39.2, 39.6, glide) }, sweat: ez(T, 39.5, 39.9) });
// 吸气：idle → inhale 插值，inflate 同步鼓起
const k = ez(T, 40.4, 41.9, glide);
drawHero(lg, { x: 620, y: 860, t: T, pose: { from: 'idle', to: 'inhale', k }, inflate: k });
// b05 H1：双拇指大笑 + 牙齿闪光 + 呆毛开心地弹
drawHero(lg, { x: 620, y: 860, t: T, pose: 'thumbsUp', expr: 'laugh', toothSparkle: 53.30, ahogeAt: 53.2 });
// 动作类：act 0..1 自己给缓动（拔剑 0.4s outExpo）
drawHero(lg, { x: 380, y: 860, t: T, pose: 'draw', act: ez(T, 102.4, 102.8, outExpo), swordGlint: ez(T, 102.85, 103.25) });
```

### 5.3 骑乘：马的 saddle + 马镫 + phase 合拍（b07 / b08 / b14）

```js
import { drawHorse, horseRig, horsePhase, HORSE_STRIDE, HORSE_GAITS } from '../rigs/horse.js';
import { drawHero, heroRig, HERO_SEAT } from '../rigs/hero.js';

const face = 1, s = 1, gait = 'gallop';
const hp = horsePhase(hx, s);                                  // 马：phase = 世界 x ÷ (280·s)，马内部会乘 face
const ho = { x: hx, y: 860, s, face, t: T, pose: gait, phase: hp };
const ha = horseRig(ho);
// 勇者：锚点 = saddle；rot 用 saddleRot（镜像前局部角）；phase 要乘 face，并换算成这个步态的周期数
const ro = { x: ha.saddle[0], y: ha.saddle[1], s, face, t: T, pose: 'ride', rot: ha.saddleRot,
             phase: face * hp * HORSE_STRIDE / HORSE_GAITS[gait].stride, scarf: { vel: [face * 600, 0] } };
drawHorse(lg, { ...ho, stirrupAt: heroRig(ro).foot });          // 马镫跟着勇者的脚
drawHero(lg, ro);                                               // 人画在马后面一步（同一图层）
// 人马一起挤压：两边传同一个 squash
// 上马（b07 77.20）：臀底从“站立脚底 − HERO_SEAT·s”沿弧线飞到 saddle，用 pose 'mount'
const k = ez(T, 77.2, 77.6, glide), p0 = [footX, 860 - HERO_SEAT * s], p1 = ha.saddle;
drawHero(lg, { x: lerp(p0[0], p1[0], k), y: lerp(p0[1], p1[1], k) - 120 * Math.sin(Math.PI * k), s, t: T, pose: k < 1 ? 'mount' : 'ride' });
```

马的 s 与勇者不同时，`scarf.ground` 要显式传地面世界 y（默认按 saddle 下方 160·s 估算）。

### 5.4 围巾拖尾：时间回溯 trail（推荐）/ vel / wind / to

```js
import { scarfTrail } from '../props/scarf.js';
// 勇者脚底在世界里的轨迹（必须是 T 的纯函数，镜头本来就这样算位置）
const pathAt = (tt) => [lerp(300, 1600, ez(tt, 22.3, 23.05, outCubic)), 860];
const now = pathAt(T);
const trail = scarfTrail(pathAt, T, 24, 0.035).map(([px, py]) => [px - now[0], py - now[1]]); // 第 0 点 = [0,0]
drawHero(lg, { x: now[0], y: now[1], t: T, pose: 'kneeSlide', squash: -0.15 * wobble(T, 23.05, 4, 0.5),
               scarf: { trail, wrapFace: ez(T, 23.0, 23.1) * (1 - ez(T, 23.3, 23.45)) } });

// 匀速赶路：不用 trail，直接给世界速度；站着摆跑姿（原地）时 vel 传 [0,0]
drawHero(lg, { x, y, t: T, pose: 'run', scarf: { vel: [420, 0] } });
// 顶风冻住（b08 V11）、冻板裂开变软（喷嚏后 frozen 1 → 0）
drawHero(lg, { ..., pose: 'rideHunch', scarf: { wind: [-500, 0], frozen: 1 - ez(T, 95.3, 95.8), notch: true, hole: true } });
// 挂在龙角上荡（b11）：围巾拉直系到龙角，人挂在下面
drawHero(lg, { x: hornX + 220 * Math.sin(w), y: hornY + 260, t: T, pose: 'hangSwing', scarf: { to: dragonHorn, ground: 1e5 } });
```

### 5.5 剪影、纸偶、CU 头

```js
// b11 剪影段：只有围巾有颜色；b06 片名剪影：连围巾也剪、外描红边
drawHero(lg, { ..., silhouette: true });                                         // keepColor 默认 ['scarf']
drawHero(lg, { ..., pose: 'stance', silhouette: true, keepColor: [], edge: { color: PAL.scarf, w: 5 } });
// b13 纸偶横握名字之剑：先用 heroRig 求手的位置，反解木偶 x，让手落在剑柄 grip 上
const probe = heroRig({ x: 0, y: 0, pose: 'puppetHoldSword' });
const ns = { x: 600, y: 560, angle, tiles, scarfWrap, t: T };
const grip = [600 - 59 * Math.cos(angle), 560 - 59 * Math.sin(angle)];          // = drawNameSword 返回的 grip
drawNameSword(lg, { ...ns, part: 'back' });
drawHero(lg, { x: grip[0] - probe.handR[0], y: grip[1] - probe.handR[1], t: T, pose: 'puppetHoldSword', rod: true });
drawNameSword(lg, { ...ns, part: 'front' });                                      // 缠绳前半圈压在手上
// CU 反应格：只画头，锚在头心（s=3.4 ≈ zoom 3.4 时头 360px）
drawHeroHead(lg, { x: 760, y: 520, s: 3.4, t: T, expr: 'squint', yaw: -0.32, earScale: 1.3, earSide: 1 });
```

### 5.6 b14 围巾擦屏（遮罩 + 上层围巾）

```js
import { drawScarfWipe, scarfWipeMask } from '../props/scarf.js';
const p = ez(T, 164.9, 165.6, inOutCubic);
// 前一镜照常画；这一镜：揭示区（前端右侧）里画新画面，再把围巾本体盖在最上面（破洞透出下层）
ctx.mask(g, (mg) => mg.fill(scarfWipeMask(T, { p })), (lg) => drawNextShot(lg, T));
ctx.layer(g, { shadow: 14 }, (lg) => drawScarfWipe(lg, T, { p }));
```

---

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际实现 |
|---|---|---|
| hero.js 导出 | `drawHero`、`HERO_POSES`、`HERO_EXPRS` | 另有 `heroRig`（只求锚点）、`drawHeroHead`（只画头）、`HERO_H`、`HERO_SEAT`、`HERO_STRIDE` |
| pose | 56 个 | 全部实现，另**新增** `duck`、`limbo`、`sidestep`（b10 D2a 左躲右闪、b11 低头躲翼；收尾时补） |
| expr | 15 个 | 全部实现，另有 `sneeze`（喷嚏憋气脸） |
| 呆毛 | 五形 + `flame` + `curl` | 另支持 `{ from, to, k }` 曲线插值（含 normal → heart，收尾时补齐）、`ahogeAt` 弹一下 |
| sword | `back / shoulder / hand / none` | 另有 `empty`（背上空鞘、手里没剑，纸偶握名字之剑时自动用）；另有 `swordArc` 覆盖弧光 |
| scarf 子参数 | `len, width, glow, notch, hole, patch, frozen, wrapFace, trail, vel, wind` | 另有 `endWidth`、`lag`、`to`、`ground`、`back`（收尾时补）、`show` |
| 通用参数 | `x,y,s,face,t,pose,expr,alpha,silhouette,rod,squash` | 另有 `act`、`phase`、`turn`、`rot`、`pivot`、`yaw`、`joints`、`jointsAdd`、`detail`、`seed`、`blink`、`edge`、`flat`、`silColor`、`keepColor`、`part`、`rodLen`、`nameTagSize`、`nameTagPop`、`sweat`、`toothSparkle`、`ahogeAt`、`curl`、`flame` |
| 返回锚点 | `head, mouth, eye, neck, handR, handL, swordTip, hilt, scarfEnd` | 另有 `eyes`、`swordAngle`、`scarf`、`seat`、`chest`、`nameTag`、`ear`、`ahogeTip`、`foot`、`footB`、`knee` |
| 骑乘锚点 | “调用方传马的 saddle 锚点” | 同；`mount / dismount` 的锚点是**臀底**（站立脚底 − 49·s），见 2.1 |
| `rod` | 只允许整体平移 / 倾斜 + 少数平面姿势 | 纸偶类 pose 本身就是平面版；`rod:true` 也可配任意 pose（会变平面版 + 白边 + 铜钉 + 木杆） |
| `drawSword` | `state: sheathed / bare`、`glint`、`chip`、`arc`、`flat` | 另有 `state: 'scabbard'`（空鞘）、`arcSpan`、`arcDir`、`detail`、`alpha`、`sil`、`edge`；返回 `{ tip, hilt, pommel, guard }`；导出 `SWORD` |
| `drawNameSword` | `tiles, angle, glow, scarfWrap, part` | 另有 `from`、`tip`、`chars`、`notch/hole/patch`、`detail`、`alpha`；返回锚点；导出 `NAME_SWORD` |
| `drawSwordIcon` | 小剑 | 参数 `size, rot, ink, glow, alpha`，锚在中心 |
| scarf.js | `drawScarf, scarfTrail, drawScarfWipe, drawScarfBand, drawBookmark, drawScarfKnot` | 另导出 `scarfPoints`、`scarfWipeMask` 与组内共用工具 `paperFill / rimLine / sdir / ribbonOf / resample / star4`；`drawScarf` 的签名是 `(g, pts, o)`（中心线由调用方或 `scarfPoints` 给） |

---

## 7. 已知限制与注意事项

- **phase 不随 face 翻转**（马会翻，勇者不会）：往左走 / 骑时传 `face × 路程 ÷ 步幅`，否则腿会“太空步”、骑乘起伏会倒放。骑乘起伏 1 单位 = 1 个马步周期：gallop 直接 `face × 马的 phase`；trot / walk 要乘 `280 / 步幅`（见 5.3）。
- **`turn` 只翻身体**：围巾拖尾仍按 `face` 往身后飘 / 拖地。完整转一圈 = 前半 `face=1, turn 0→1`，后半 `face=-1, turn 0→1`（两段交界处身体完全一致，但贴地的长围巾会换边跳一下）。转圈镜头建议用短围巾（`scarf.len` 200 左右）或 `scarf.back` 连续传 `−face·cos(π·turn)`，或 `scarf.show:false` 自己画（b16 “围巾把两人圈在一起”本来就要自己画）。
- 默认 `scarf.vel` = 动作标称速度（walk 140 / run 430 / ride 600 / charge 520 / kneeSlide 380 / brake 240 / roll 300）：原地摆跑姿、定格时记得传 `vel: [0, 0]`，否则围巾一直平飘。
- `scarf.ground` 默认 = 站立时的脚底线；人站在台阶 / 马上 / 半空时要显式传，否则围巾会贴在错误的“地面”上。
- `swordAngle`、`rot`、返回的 `swordAngle` 都是镜像前局部角；face=−1 时屏幕方向是反的。
- 骑乘只画外侧一条腿；不画马时（比如马被遮挡）会看到少一条腿。
- `hop` 腾空段、`vault`、`kick`、`hangSwing`、`puppetInMouth` 不自动着地，跳多高由镜头改 y；`roll` 自己贴地。
- `{ from, to, k }` 插值是关节角线性插值：手形、剑模式、`ground / seat` 这类开关在 k=0.5 处切换；骑乘 ↔ 站立之间不要直接插值（锚点含义不同），用 `mount / dismount` + `HERO_SEAT` 换算。
- 剪影 / 描边 / 纸偶模式下不画名签；`silhouette` 时剑默认也是剪影色（要留色加 `'sword'` 到 `keepColor`）。
- `inflate > 0.5` 会强制闭眼、>0.3 会把普通嘴换成噘嘴（`shout / laugh / grin / o` 除外）；`soot ≥ 0.4` 时眼睛只剩白眼珠。
- 性能（定性，未逐项计时）：每个部件是一次 `paperFill`（错位投影 + 填色 + clip 亮边 / 暗线），全身几十片；纸偶白边会再描一遍；`detail: 0` 只做纯填色，远景、人群（s ≤ 0.3）一律用它。围巾长度不影响片数（固定 28 点）。同屏多于 4 个全细节勇者时注意帧时间。
- 冻住的围巾用 `scarf.frozen` 控制中心线变直；单独用 `drawScarf` 时 `frozen` 只加冰霜冰凌，中心线变直要在 `scarfPoints` 里传 `frozen`。
- `src/env/book.js` 里有一个同名的本地 `drawBookmark`（书桌布景自己画的），与本组 `props/scarf.js` 的 `drawBookmark` 不是同一个函数，b01 / b17 以布景的为准。
- 纸偶白边宽度 6.5 是局部单位，s 很小（< 0.4）时会显得粗，可传 `edge: { color: PAL.paper, w: 4 }`。

---

## 8. 模型图清单

| 模型图 | 内容 | 最终出图（`out/review/sheets/<名>/`） |
|---|---|---|
| `src/sheets/hero.js` | 0–2s：s=1 六式 face ±1；2–4s：CU 头 s=3.4 + 伤痕 0/4、soot、inflate、剪影、剪影 + 红边、名签、s=0.26 / 0.52 远景 | `final_t0.50.png`、`final_t2.50.png` |
| `src/sheets/hero_poses.js` | 0–2s / 2–4s：全部动作（多个 act、`{from,to,k}`、face −1）；4–6s：细节 s=1.45；6–8s：躲闪 duck / hop / limbo / sidestep / turn | `final_t0.50.png`、`final_t2.50.png`、`final_t4.50.png`、`final_t6.50.png` |
| `src/sheets/hero_face.js` | 0–2s：16 表情、呆毛五形、叠加件；2–4s：呆毛插值 normal→question / normal→heart | `final_t0.50.png`、`final_t2.50.png` |
| `src/sheets/hero_ride.js` | 骑乘六式与马合拍、mount 中段 | `final_t0.50.png` |
| `src/sheets/hero_puppet.js` | 纸偶七式 + 握名字之剑 | `final_t0.50.png` |
| `src/sheets/hero_scarf.js` | 0–2s：围巾五态、沿围巾写字；2–4s：擦屏、红带、书签、红绳 | `final_t0.50.png`、`final_t2.50.png` |
| `src/sheets/hero_sword.js` | 0–2s：剑各状态、拔剑弧光、图标；2–4s：名字之剑 | `final_t0.50.png`、`final_t2.50.png` |
| `src/sheets/hero_anim.js` | 0–2s：walk / run / dance+turn 循环；2–4s：slash / draw act 循环 + 骑乘；4–6s：idle / cheer / charge | `final_t0.50.png`、`final_t2.50.png`、`final_t4.50.png` |

动画检查（联系表）：`node tools/render.mjs sheet --sheet hero_anim --from 0 --to 1.9 --every 0.1 --cols 5 --tile 384 --out out/review/sheets/hero_anim/final_loop_a.jpg`（另两段 `--from 2 --to 3.9`、`--from 4 --to 5.9`）。
