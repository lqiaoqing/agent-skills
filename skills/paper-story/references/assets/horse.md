# 白马与小动物（horse）API

> 本组文件：`src/rigs/horse.js`（白马）、`src/rigs/monsters.js`（史莱姆、蝙蝠、鸟、纸鸽、蜗牛、鸡、蝴蝶、萤火）。
> 模型图：`src/sheets/horse.js`、`src/sheets/monsters.js`、`src/sheets/ride.js`（人马合拍）。
> 规格出处：`docs/assets.md` 第 0、4、7 节；镜头出处：`docs/storyboard.md` 第 5 节（b01、b02、b06、b07、b08、b14、b15、b16）。
> 本文所有参数名都按源码核对过；与 assets.md 不一致的地方见第 6 节。

---

## 1. 模块与导出一览

### 1.1 `src/rigs/horse.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawHorse(g, o)` | 函数 | 画白马，返回锚点对象（鞍座、马嘴、蹄子、扬尘点…） |
| `horseRig(o)` | 函数 | 参数同 `drawHorse`，只求锚点不画（预先算骑手位置、粒子发射点） |
| `drawReins(g, bit, hand, o)` | 函数 | 从马的 `bit`（衔铁环）到骑手手里画一根下垂的缰绳（画在骑手之后） |
| `horsePhase(worldX, s = 1)` | 函数 | 世界 x → 步态相位，`= worldX ÷ (280·s)`，马蹄不打滑的标准写法 |
| `HORSE_STRIDE` | 常量 `280` | 标准步幅（s=1）；`phase = 世界 x ÷ (HORSE_STRIDE·s)` |
| `HORSE_POSES` | 常量数组 | 全部动作名（见第 4 节） |
| `HORSE_EXPRS` | 常量数组 | 全部表情名 |
| `HORSE_JOINTS` | 常量数组 | `o.joints` 可用的键 |
| `HORSE_GAITS` | 常量对象 | 步态表 `gallop / trot / walk`（每种的真实步幅 `stride`、默认速度 `speed` 等） |

### 1.2 `src/rigs/monsters.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawSlime(g, o)` | 函数 | 史莱姆：弹出、蹦跳、7 种表情、挨打压扁、炸成水花 |
| `drawBat(g, o)` | 函数 | 正面蝙蝠：扑翼 / 俯冲 / 倒挂 |
| `drawBird(g, o)` | 函数 | 鸟：`kind:'blue'` 青鸟（落脚点锚）或 `kind:'paper'` 挂线纸鸟 |
| `drawDove(g, o)` | 函数 | 纸鸽：扑翼飞行，可叼横幅一端（返回喙锚点） |
| `drawSnail(g, o)` | 函数 | 经验条上的小蜗牛：爬行伸缩、LV4 小王冠 |
| `drawChicken(g, o)` | 函数 | 村庄的鸡：走 / 慌张跑 / 啄 / 站 |
| `drawButterfly(g, o)` | 函数 | 纸蝴蝶 |
| `drawFirefly(g, x, y, s)` | 函数 | 萤火一粒（给粒子 `draw` 回调用） |
| `SLIME_EXPRS` | 常量数组 | 史莱姆表情名 |
| `BAT_POSES` | 常量数组 | 蝙蝠动作名 |
| `BIRD_POSES` | 常量数组 | 青鸟动作名 |
| `BIRD_FEET` | 常量 `13` | 青鸟落脚点到身体中心的高度（s=1），身体中心 = `(x, y − 13·s)` |

---

## 2. 坐标、尺寸与锚点约定

### 2.1 通用

- 所有函数在调用方当前变换下画（镜头先 `applyCam`），`(x, y)` 就是世界坐标；函数内部 `save/restore`，不改调用方状态；**不调用 `ctx.layer / ctx.mask`**，投影、纸纹由镜头的图层给。
- `s`：缩放，1 = 全景标准尺寸；`face`：1 朝右、−1 朝左，整体 `scaleX` 镜像（光照方向在函数内按变换自动换算，镜像后高光仍在左上、投影仍在右下）。
- 返回的锚点全部是**与 `(x, y)` 同一坐标系**的点 `[x, y]`，已含 `s / face`。
- 纯函数：只由参数（含 `t`）决定；次级运动（呼吸、眨眼、鬃毛、扑翼）都由 `t` 驱动，传镜头的 `T` 即可。

### 2.2 白马

| 项 | 约定 |
|---|---|
| 锚点 `(x, y)` | **站立时四蹄着地的脚底中心**（地面线上，前后蹄中点） |
| s=1 尺寸 | 尾尖到鼻尖约 300，耳尖高约 230；骑上勇者合计约 330 |
| 步幅 | `HORSE_STRIDE = 280`；内部 gallop / trot / walk 的真实步幅分别 280 / 160 / 90，按 `phase` 自动换算成各自周期 |
| 部件层次（远→近） | 速度线 → 尾巴 → 远侧两腿 → 远耳、远侧鬃毛 → 身体 → 鞍褥 + 鞍座 + 马镫 → 近后腿 → 脖子 → 近侧鬃毛 → 近前腿 → 头 → 近耳 → 额毛 → 缰绳（`reins`）→ 闪光 / 白气 / 冷汗 / 发抖线 |
| 腿名 | `hf` 远后、`ff` 远前、`hn` 近后、`fn` 近前（“近” = 靠镜头的一侧） |

返回对象字段（世界坐标）：

| 字段 | 含义 |
|---|---|
| `saddle` | 鞍顶中心 = **骑手锚点**：`drawHero({ pose:'ride', x: saddle[0], y: saddle[1] })` |
| `saddleBack` | 后座（公主 `ridePillion` 的锚点） |
| `saddleRot` | 直接传给 `drawHero` 的 `rot`（勇者在镜像前的局部系里转，所以是局部角；已含 `angle × face`） |
| `saddleAngle` | 鞍面在屏幕上的转角（弧度，= 局部角 × face + `angle`），给不在局部系里转的东西用 |
| `stirrup` | 马镫自然下垂时的底端点 |
| `withers` | 马肩隆（鞍前、鬃毛根后） |
| `head` / `eye` / `earTip` | 头中心 / 眼 / 近耳尖 |
| `mouth` / `nose` / `bit` | 嘴角（叼东西的点）/ 鼻孔 / 衔铁环（缰绳起点） |
| `hoofFront` | 近前蹄蹄底（= `hooves.fn`） |
| `hooves` | `{ hf, ff, hn, fn }` 四个蹄底点 |
| `contact` | `{ hf, ff, hn, fn }` 布尔：该蹄此刻是否着地（支撑期） |
| `dust` | 扬尘发射点数组 `[{ x, y, k(0..1 强度), leg }]`：蹬地末段、`skid` 急停、`pawGround` 刨地时出现；没有时为空数组 |
| `tail` | 尾巴尖（`drawHorse` 返回的是实际画出的中缕尾尖；`horseRig` 返回的是按尾根方向估算的点） |
| `tailRoot` | 尾根 |
| `bob` | 身体相对静止站姿的下沉量（px，正 = 向下），给需要跟着马颠簸的东西用 |
| `coin` | 仅 `biteCoin` 叼着金币时存在：金币中心 |
| `spitAt` | 仅 `biteCoin`：金币吐出的时刻（秒），此后金币由镜头自己画飞出 |

### 2.3 小动物

| 函数 | 锚点 `(x, y)` | s=1 尺寸 | 返回 |
|---|---|---|---|
| `drawSlime` | 底边中心（地面） | 宽 80、高约 70 | `{ center, top, eyes:[左,右], mouth, splash }` |
| `drawBat` | 身体中心 | 翼展 90 | `{ center, mouth }` |
| `drawBird` blue | **落脚点**（脚底；身体中心在上方 `BIRD_FEET·s`） | 长约 44 | `{ feet, center, beak }` |
| `drawBird` paper | 身体中心（吊线挂点） | 翼展约 60 | `{ center, beak, threadTop }` |
| `drawDove` | 身体中心，朝右飞 | 翼展约 120 | `{ beak, center, tail }` |
| `drawSnail` | 腹足底边中心（压在经验条上沿） | 长约 64 | `{ head, crownTop, shellTop }` |
| `drawChicken` | 两脚中间的地面点，朝右 | 高约 62 | `{ head, beak }` |
| `drawButterfly` | 身体中心 | 翼展约 44 | `{ center }` |
| `drawFirefly` | 光点中心 | 亮芯直径 ≈ 0.55·size | 无 |

---

## 3. 函数详解

### 3.1 `drawHorse(g, o) → anchors`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | `0, 0` | 脚底中心（世界坐标） |
| `s` | `1` | 缩放（CASTLE 外景 0.26 / 0.30） |
| `angle` | `0` | **坡度**：整匹马绕脚底 `(x, y)` 转的角（弧度，正 = 顺时针 / 地面向右下，与 `journeyGroundAngle` 同号）；返回的锚点、`saddleRot / saddleAngle`、鬃毛拖尾都已含这个角。`heroJourneyState(T).horse.angle` 直接展开传进来即可 |
| `face` | `1` | 1 朝右（去程），−1 朝左（归程） |
| `t` | `0` | 秒；驱动呼吸、眨眼、甩尾、鬃毛飘动；未传 `phase` 时也驱动步态 |
| `pose` | `'stand'` | 动作名（第 4 节），或 `{ from, to, k }` 两个动作之间插值（k 0..1，关节与蹄位线性插值） |
| `phase` | — | 步态相位，**传 `horsePhase(世界x, s)`**；未传时按 `t × speed` 原地循环 |
| `speed` | 各步态默认（gallop 900 / trot 380 / walk 150） | 本地速度（s=1 的 px/s）。未传 `phase` 时决定原地循环快慢；传了 `phase` 时只用于鬃毛拖尾的回溯采样和默认 `vel`，建议传实际速度 ÷ s |
| `gait` | `limp/headwind` 用 `'trot'`，`biteCoin` 用 `'gallop'` | 只对 `limp / headwind / biteCoin` 生效：这几个动作下面跑哪种步态（只认 `gallop / trot / walk`，其它值按默认） |
| `limp` | pose `'limp'` 时 1，其它 0 | **跛行强度** 0..1（`true` = 1），可叠加在 `gallop / trot / walk / speedLines / headwind / biteCoin` 上：伤腿（`bandageLeg` 的腿名字符串，默认 `fn`）支撑期按强度缩短、抬得更高、着地时头身一抽。V08 每升一级减轻：`limp: 1 → 0.66 → 0.33 → 0`（`heroJourneyState` 已给出）。只有 pose `'limp'` 会自动换 `hurt` 表情 |
| `expr` | 动作自带 | 覆盖表情（第 4 节） |
| `alpha` | `1` | 整体透明度 |
| `silhouette` | `false` | 剪影：部件填 `silColor` |
| `keepColor` | `[]` | 剪影时保留原色的部件：`'tail' 'legs' 'head' 'mane' 'body' 'saddle'` |
| `silColor` | `PAL.ink` | 剪影色 |
| `squash` | `0` | 挤压拉伸（>0 拉长，<0 压扁），以脚底为锚、保持面积；返回的 `saddle` 已含挤压 |
| `detail` | `1` | 0 = 远景简化（鬃毛 3 缕、尾 2 缕、额毛 1 缕；无暗部渐变、压边暗影、腿的亮边、辔头、马镫、肚带与鞍褥花边、冷汗；眼睛只画墨点，没有眉毛和嘴）。s ≤ 0.35 时用 |
| `joints` | — | 关节微调（度；`bodyX/bodyY` 为 px），键见 `HORSE_JOINTS`：`body`（整身俯仰，+ 抬头）`bodyX bodyY neck head jaw earN earF tail`，四条腿各 `U/L/H`（上段/下段/蹄，如 `fnU`） |
| `mane` | — | `{ trail, vel, wind }`：`trail` = 锚点在 `T − k·0.035`（k=0..5）的位置减当前位置的数组（世界 px，6 个点）；`vel` / `wind` = `[vx, vy]`（世界 px/s，也可传单个数字 = 水平分量） |
| `trail` / `vel` / `wind` | `vel` 按步态速度 × face × s 自动（沿 `angle` 方向）；`wind` `[0,0]` | 同 `mane.trail / mane.vel / mane.wind`（`mane` 里的优先）。拖尾优先用 `trail`，没有时用 `vel` 反推 |
| `bandageLeg` | `false` | 绷带：`true`（= `'fn'`）/ 腿名 / 腿名数组；`limp` 的伤腿取这里的腿名字符串（`true`、数组或非法值时为 `'fn'`） |
| `noseBandage` | `false` | 鼻梁创可贴：`true` 或 0..1（贴上时 outBack 弹出） |
| `icicles` | `0` | 0..1 鬃毛尾巴挂冰凌、颜色偏冰 |
| `snow` | `0` | 0..1 背上、头顶积雪 |
| `breath` | `0` | 0..1 每 0.5s 从鼻孔呼一团白气 |
| `sweat` | 表情 `scared/hurt` 时自动 0.85 | 0..1 额头冷汗滴（传 0 可关掉自动汗滴） |
| `tremble` | `0` | 0..1 全身发抖（噪声抖动 + 发抖线） |
| `shiver` | `0` | 0..1 只画发抖线（不抖身体） |
| `speedLines` | `pose:'speedLines'` 时 1 | 0..1 身后速度线强度（任何动作都可加） |
| `reins` | `false` | 在马身内画缰绳：`true`（到马肩上方的默认点）或 `[x, y]` 世界坐标的手位置（会被后画的骑手盖住；要盖在骑手手上用 `drawReins`） |
| `stirrup` | 自然下垂 | `'ride'`：马镫收短托在勇者 ride 姿势的靴底附近；`false`：不画马镫；`[x, y]`：挂到这个世界坐标点 |
| `stirrupAt` | — | `[x, y]` 世界坐标，同 `stirrup:[x,y]`（勇者组的写法：`stirrupAt: heroRig(ro).foot`） |
| `at` | 自动循环 | 事件时刻（秒）：`tossMane` 甩头的瞬间、`skid` 急停开始（震颤衰减）、`biteCoin` 咬合的瞬间 |
| `paw` | 每 0.62s 两下 | `pawGround` 的落蹄时刻：数字或数组 |
| `stamp` | — | `stand` 下踏一下蹄的落蹄时刻：数字或数组 |
| `air` | `0.5` | `leap` 的腾空进度：0 起跳 · 0.5 腾空舒展 · 1 落地前 |
| `seed` | `0` | 眨眼节奏的种子（多匹马错开） |

返回值：第 2.2 节锚点对象。

### 3.2 `horseRig(o) → anchors`

参数同 `drawHorse`，不画，只返回锚点。用于：先求 `saddle` 再画骑手、先求骑手脚位再喂 `stirrupAt`、粒子 `emit` 回调里取 `dust / mouth / hoofFront`。代价约等于一次 `drawHorse` 的骨架计算（不含拖尾回溯）。

### 3.3 `drawReins(g, bit, hand, o = {})`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `bit` | — | 起点，一般传马返回的 `bit` |
| `hand` | — | 终点，一般传勇者返回的 `handL`（远侧手）或 `handR` |
| `o.s` | `1` | 缩放（线宽、下垂量跟着缩放） |
| `o.sag` | `14` | 下垂量（px，× s） |
| `o.color` | 深皮革色 | 线色 |
| `o.lw` | `2.6` | 线宽（× s） |

无返回值。画在骑手之后，缰绳压在手上。

### 3.4 `horsePhase(worldX, s = 1) → number`

`worldX / (HORSE_STRIDE · s)`。**任何步态都这样传**（内部按 gallop 280 / trot 160 / walk 90 的真实步幅换算周期），支撑期蹄子在世界坐标里一动不动。朝左跑（face −1，x 递减）也照样传，内部乘了 face。

### 3.5 小动物

#### `drawSlime(g, o) → { center, top, eyes, mouth, splash }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | `0, 0, 1, 1, 0, 1` | 通用；`(x, y)` = 底边中心 |
| `pop` | `1` | 0..1 从草里弹出：0–0.45 从地下跃起成弧（`pop < 0.6` 时地面以下被裁掉），0.45 落地后 spring 压扁回弹，1 停稳（之后有轻微果冻呼吸） |
| `hop` | — | `true` 每 0.62s 蹦一下（相位受 `seed` 错开）；数字 0..1 = 单次蹦跳进度。`pop < 1` 时无效 |
| `burst` | `0` | 0..1 炸开：0–0.12 身体白闪胀大，≥0.12 只剩地上一滩 + 溅起水环 + 16 颗水滴（纯 `t`/`burst` 函数） |
| `eyes` / `expr` | `'normal'` | 表情（`eyes` 优先）：见第 4 节 `SLIME_EXPRS`；`eyes: true` 等于 `'roll'`（眼珠乱转）；`burst > 0` 时强制 X 眼 + O 嘴 |
| `hit` | `0` | 0..1 挨打压扁 |
| `color` | `PAL.slime` | 身体色（暗部自动混 `slimeDark`） |
| `seed` | `0` | 蹦跳相位、水滴分布 |
| `detail` | `1` | 0 = 远景（只画身体 + 两个墨点眼） |
| `silhouette` / `silColor` | `false` / `PAL.ink` | 剪影 |
| `joints` | — | `{ tilt }`（度，身体歪头） |

#### `drawBat(g, o) → { center, mouth }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | 通用 | `(x, y)` = 身体中心 |
| `pose` | `'fly'` | `fly / swoop / hang` 或 `{from,to,k}` |
| `flap` | `t·5.5 + seed·0.37` | 扑翼相位（周期 1） |
| `expr` | `swoop` 时 `'angry'`，否则 `'normal'` | `normal / angry / happy` |
| `joints` | — | `{ wing（两翼抬起°）, tilt（身体倾斜°） }` |
| `seed` / `detail` / `silhouette` | `0` / `1` / `false` | 剪影固定 ink |

#### `drawBird(g, o)`

`kind`（默认 `'blue'`）决定画哪种：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `kind` | `'blue'` | `'blue'` 青鸟 / `'paper'` 挂线纸鸟 |
| `x, y, s, face, t, alpha` | 通用 | blue：`(x, y)` = 落脚点；paper：`(x, y)` = 身体中心 |
| `pose`（blue） | `'perch'` | `fly / perch / hop / land / startle / glide` 或 `{from,to,k}`；paper 忽略 |
| `flap` | blue `t·7 + seed·0.31`；paper `t·2.6 + seed·0.29` | 扑翼相位 |
| `thread`（paper） | 无 | `true` 吊线一直画到画面上方（2000px）；数字 = 线长 px；有线时随 `t` 轻摆，无线时上下浮动 |
| `joints`（blue） | — | `{ body, wing }`（度） |
| `seed` / `detail` / `silhouette` / `silColor` | | 通用 |

返回：blue `{ feet, center, beak }`；paper `{ center, beak, threadTop }`。

#### `drawDove(g, o) → { beak, center, tail }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | 通用 | `(x, y)` = 身体中心，朝右飞 |
| `flap` | `t·3.2 + seed·0.41` | 扑翼相位（下拍快、上抬慢） |
| `carry` | `false` | 叼着横幅端头的小纸条：`true` 或颜色字符串（作为纸条底色） |
| `carryColor` | `PAL.skyDayLow` | `carry: true` 时纸条底色 |
| `carryEdge` | `PAL.gold` | 纸条描边 |
| `joints` | — | `{ wing, body, head }`（度） |
| `seed` / `detail` / `silhouette` / `silColor` | | 通用 |

返回的 `beak` = 横幅端点应接的点（随扑翼的身体起伏与俯仰一起动；不含 `joints.head`）。

#### `drawSnail(g, o) → { head, crownTop, shellTop }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | 通用 | `(x, y)` = 腹足底边中心；屏幕 UI 里 s=1 就是 64px 长 |
| `crawl` | `t·1.2` | 爬行相位（周期 1：腹足伸缩、壳起伏） |
| `crown` | `0` | `true` 或 0..1（outBack 弹出）LV4 小王冠 |
| `expr` | `crown > 0.5` 时 `'proud'`，否则 `'normal'` | `normal / happy / effort / proud` |
| `detail` / `silhouette` / `silColor` | | 通用 |

#### `drawChicken(g, o) → { head, beak }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | 通用 | `(x, y)` = 两脚中间的地面点，朝右 |
| `pose` | `'walk'` | `walk / run / peck / idle` 或 `{from,to,k}` |
| `phase` | `t × (run 5.5 / walk 2.2)` | 步伐相位 |
| `joints` | — | `{ body, legA, legB }`（度） |
| `detail` / `silhouette` / `silColor` | | 通用 |

#### `drawButterfly(g, o) → { center }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y, s, face, t, alpha` | 通用 | `(x, y)` = 身体中心 |
| `color` | `PAL.princess` | 翅膀主色 |
| `angle` | `0` | 航向（弧度） |
| `flap` | `t·5 + seed·0.43` | 扑翼相位 |
| `joints` | — | `{ body }`（度） |
| `seed` / `detail` / `silhouette` / `silColor` | | 通用 |

#### `drawFirefly(g, x, y, s = 1)`

`s` 为数字时 = 缩放（size = 4·s）；为粒子状态对象时读取 `{ size(4), age, p, r, color }`：按 `age` 闪烁、按 `p`（寿命进度）淡入淡出，`r` 错开闪烁相位，`color` 默认 `PAL.magic`（光晕色，亮芯固定 moon + 白点）。无返回值。

---

## 4. 枚举全表

### 4.1 白马 `HORSE_POSES`

| pose | 说明 | 自带表情 | storyboard |
|---|---|---|---|
| `gallop` | 飞驰（前、前、后、后着地 + 腾空），步幅 280 | normal | b07 V02 奔入 / V04 冲出 / V06；b08 V12 全速；b14 E03 归程、E04 奔向城门 |
| `trot` | 小跑（对角步），步幅 160 | normal | b07 V05 放慢、V08 换小跑；b08 V11 前 |
| `walk` | 慢走（四拍），步幅 90 | normal | b08 V09 村庄放慢成走 |
| `limp` | 一瘸一拐：在 `gait`（默认 trot）上把伤腿（`bandageLeg` 字符串，默认 `fn`）支撑期缩短、抬得更高，着地时头身一抽 | hurt | b07 V07 绕树后（配 `bandageLeg`、`noseBandage`） |
| `skid` | 急停：后坐、四蹄前撑，鬃毛往前甩、尾巴翘，`dust` 四蹄全开 | effort | b07 76.75 急停；b08 V13 98.04 急刹扬尘 |
| `rear` | 人立：前腿交替刨空、嘶鸣张嘴 | neigh | b07 76.75 扬前蹄、V04 80.22 人立冲出；b08 V13 人立发抖（+ `tremble`、`expr:'scared'`） |
| `tossMane` | 骄傲甩头：先低头蓄力，`at` 时刻猛甩，鬃毛余振 + 一道闪光 | proud | b07 76.95 |
| `pawGround` | 刨地：近前蹄抬起落下再向后拖，落蹄时 `dust` 出一点 | normal | b07 79.80 / 80.05（`paw:[79.80, 80.05]`） |
| `headwind` | 顶风前倾：低头压耳、尾巴下压，鬃毛被逆风吹（在 `gait` 上跑，默认 trot） | effort | b08 V11（配 `icicles`、`snow`、`breath`） |
| `biteCoin` | 边跑边扑咬一枚金币：`at` 咬住 → 0.32s 咔嚓留牙印 → `spitAt` 吐出（在 `gait` 上跑，默认 gallop） | chomp → proud | b07 V06 84.90 |
| `hideRock` | 卧在岩石后：身体贴地，只有耳朵和翘起的尾巴高过岩顶（约 `y − 135·s`），耳朵偶尔转动 | scared | b08 98.70 起；b14 E03 跃出前 |
| `leap` | 跃出：`air` 0 起跳 · 0.5 腾空 · 1 落地前（位置弧线由镜头给） | happy | b14 E03 165.08 |
| `stand` | 站立：呼吸、转耳、甩尾；`stamp` 时刻踏一下蹄 | normal | b07 77.70 落鞍后踏蹄；b16 O02 城门口 |
| `speedLines` | `gallop` + 身后速度线 | normal | b07 V02 奔入；b14 E03 |
| `idle` | `stand` 的别名（不在 `HORSE_POSES` 里） | normal | — |

### 4.2 白马 `HORSE_EXPRS`

| expr | 说明 | 何时自动出现 |
|---|---|---|
| `normal` | 圆眼带高光、微笑嘴 | 默认 |
| `proud` | 闭眼弧 + 睫毛、眉上挑 | `tossMane`、`biteCoin` 吐出前 |
| `happy` | 笑眼弧 | `leap` |
| `scared` | 大圆眼、波浪嘴 + 冷汗 | `hideRock` |
| `effort` | `>` 形挤眼、平嘴 | `headwind`、`skid` |
| `hurt` | `>` 形眼、波浪嘴 + 冷汗 | `limp` |
| `neigh` | 笑眼弧（配张嘴） | `rear` |
| `chomp` | 挤眼、咬紧露牙 | `biteCoin` 咬合中 |

### 4.3 小动物

| 枚举 | 值 | 说明 | storyboard |
|---|---|---|---|
| `SLIME_EXPRS` | `normal` | 墨点眼 + 微笑 | b16 O02 城下那只 |
| | `roll` | 白眼仁、眼珠乱转 + 波浪嘴 | b07 V05 82.04 冒出（配 `pop`） |
| | `angry` | 皱眉、咬牙 | — |
| | `happy` | 笑眼 + 张嘴 | b06 69.30 地图上蹦（配 `hop`） |
| | `scared` | 白眼仁朝上看 + O 嘴 | b07 V05 挨刀前 |
| | `dizzy` | 螺旋眼 | — |
| | `x` | X 眼、平嘴 | 炸开时自动 |
| `BAT_POSES` | `fly` | 扑翼（翼面随相位压缩） | b07 82.30 惊起两只 |
| | `swoop` | 收翼俯冲，默认生气脸 | b07（扑向勇者时） |
| | `hang` | 倒挂（脸保持正立，画小脚爪） | 洞内装饰 |
| `BIRD_POSES`（blue） | `perch` | 站着，偶尔低头啄一下、尾巴翘 | b02 10.90 落在公主小皇冠上之后 |
| | `land` | 落下：翅膀上扬、身体后仰、脚伸出 | b02 10.90 |
| | `startle` | 受惊：缩身炸毛、白眼仁、急扑 | b02 12.45 |
| | `fly` | 扑翼飞行 | b02 12.45 之后飞走 |
| | `glide` | 平伸滑翔 | — |
| | `hop` | 原地小跳 | — |
| `drawBird` `kind` | `paper` | 折纸鸟（翻面露 kraft 背面），可挂线 | b01 7.50 挂线纸鸟；b02 11.40 三只飞过；b06 62.60 两只飞过 |
| `drawChicken` pose | `walk` / `run` / `peck` / `idle` | 走（头“定住—前冲”）/ 慌张跑（扑翅、白眼仁）/ 啄地 / 站 | b08 V09 一只鸡横穿 |
| `drawSnail` expr | `normal / happy / effort / proud` | 平常 / 笑眼 / 使劲挤眼 / 戴冠得意 | b07 V08 经验条（89.80 `crown`） |
| `drawBat` expr | `normal / angry / happy` | | |

其它小动物：纸鸽 b08 V09 一群飞起、b15 177.30 成群飞起 / E12 181.66 叼勇者横幅 / 184.30 第二只接公主竖幅 / 184.40 绕尖塔；蝴蝶 b08 V09；萤火 b08 V12 96.20–97.40（magic 色往上飘）。

---

## 5. 推荐用法

以下片段放在镜头的 `draw(g, T, lt, ctx)` 里；import 路径按 `src/scenes/<block>.js` 写。

### 5.1 奔跑不打滑：phase = 世界 x ÷ 步幅

```js
import { drawHorse, horsePhase } from '../rigs/horse.js';
import { applyCam } from '../core/camera.js';

const hx = horseX(T);                       // 马的世界 x（镜头自己的运动曲线；速度 = 它的导数）
const v = (horseX(T + 0.02) - horseX(T - 0.02)) / 0.04;
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {       // 主体层：纸片投影 + 纸纹由图层给
  applyCam(lg, c, 1);                                      // depth 1 = 主体
  drawHorse(lg, {
    x: hx, y: 860, s: 1, face: 1, t: T,
    pose: 'gallop',                                        // trot / walk 同样写法
    phase: horsePhase(hx, 1),                              // = hx / (HORSE_STRIDE · s)，归程 face −1 也这样传
    speed: Math.abs(v),                                    // 让鬃毛拖尾跟实际速度走（s≠1 时传 速度 ÷ s）
  });
});
```

旅途（b07 / b08）直接用 `src/env/journey.js` 给出的状态，里面已经是 `phase = x ÷ 280`、坡度 `angle`、跛行强度 `limp`：

```js
const st = heroJourneyState(T);
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, journeyCam(T), 1);
  const h = drawHorse(lg, { ...st.horse, t: T });          // x, y, angle, phase, speed, pose({from,to,k}), gait, limp, bandageLeg, noseBandage, icicles
  // 风雪段再加：breath: 1, snow: k；急刹段：tremble: k, expr: 'scared'
});
```

### 5.2 人马合拍：马先画、勇者画在 saddle 上、同一个 squash

```js
import { drawHorse, horseRig, horsePhase, drawReins } from '../rigs/horse.js';
import { drawHero, heroRig } from '../rigs/hero.js';

ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const sq = T > 77.70 ? -0.16 * Math.exp(-(T - 77.70) / 0.12) * Math.cos((T - 77.70) * 26) : 0; // 77.70 落鞍：人马同一个 squash
  const hO = { x: hx, y: gy, s: 1, face: 1, t: T, pose: 'gallop', phase: horsePhase(hx, 1), speed: v, squash: sq };
  const a = horseRig(hO);                                   // ① 先求鞍点（不画）
  const rO = { x: a.saddle[0], y: a.saddle[1], s: 1, face: 1, t: T, phase: hO.phase,
               pose: 'ride', rot: a.saddleRot, squash: sq };  // 骑乘类 pose 的 (x, y) = saddle，rot = saddleRot
  const h = drawHorse(lg, { ...hO, stirrupAt: heroRig(rO).foot }); // ② 马（马镫挂到靴底；省事可写 stirrup: 'ride'）
  // 后座：drawPrincess(lg, { x: h.saddleBack[0], y: h.saddleBack[1], s: 1, face: 1, t: T, pose: 'ridePillion', rot: h.saddleRot });
  const r = drawHero(lg, rO);                               // ③ 勇者
  drawReins(lg, h.bit, r.handL, { s: 1 });                  // ④ 缰绳最后画，压在手上
});
```

**前后层次**：勇者的骑乘类 pose（`ride / rideSlash / rideLean / rideHunch / sneeze / rideFront`）只画**外侧（靠镜头的）一条腿**，里侧腿被马身挡住、根本不画。所以只要“马 → 后座公主 → 勇者 → 缰绳”这个顺序画在同一图层里：外侧大腿压在鞍褥上、靴子盖住马镫顶（马镫是马的一部分，先画）、小腿垂在马肚子外侧；马的脖子、鬃毛都在勇者身后。不要把勇者画在马之前，也不要把马的任何部件再画到勇者之上（`reins: true` 画在马身里，会被勇者盖住；要压在手上的缰绳用 `drawReins`）。归程 `face: −1` 时人马都传同一个 `face`，`saddleRot` 已经按 face 换算好。

上马 / 下马：`mount` 的 `(x, y)` 是空中的臀底；从地面起跳时臀底 = 脚底 − `HERO_SEAT·s`，沿弧线插值到 `horseRig(...).saddle`（见 `src/sheets/ride.js` 第 2 页）。

### 5.3 动作串接：`{from, to, k}` + 事件时刻 `at / paw / stamp`

```js
import { clamp } from '../core/util.js';
import { inOutQuad } from '../core/ease.js';
const k = (a, b) => inOutQuad(clamp((T - a) / (b - a)));
let pose = 'speedLines', ex = {};
if (T >= 76.62) pose = { from: 'gallop', to: 'skid', k: k(76.62, 76.75) };
if (T >= 76.75) { pose = { from: 'skid', to: 'rear', k: k(76.75, 76.85) }; ex.at = 76.75; }   // skid 的 at = 急停开始
if (T >= 76.85) { pose = { from: 'rear', to: 'tossMane', k: k(76.85, 76.95) }; ex.at = 76.95; } // tossMane 的 at = 甩头瞬间
if (T >= 77.30) { pose = 'stand'; ex = { stamp: 77.72 }; }                                     // 落鞍后踏一下蹄
drawHorse(lg, { x: hx, y: gy, t: T, pose, ...ex, phase: horsePhase(hx), speed: v });
// 刨地两下：{ pose: 'pawGround', paw: [79.80, 80.05] }；叼金币：{ pose: 'biteCoin', gait: 'trot', at: 84.90 } → 返回 coin / spitAt
```

### 5.4 扬尘、白气等挂在锚点上的特效

```js
import { stream } from '../core/particles.js';
import { PAL, rgba } from '../core/paper.js';
import { TAU } from '../core/util.js';
const horseAt = (t) => ({ x: horseX(t), y: gy, t, pose: 'gallop', phase: horsePhase(horseX(t)) });
ctx.layer(g, { texture: 0.2 }, (lg) => {
  applyCam(lg, c, 1);
  stream(lg, T, { start: 80.30, end: 82.0, rate: 40, seed: 7, life: [0.4, 0.8],
    emit: (tb, i, r) => {
      const a = horseRig(horseAt(tb));                       // 出生时刻的蹄位（纯函数，可回溯）
      const d = a.dust.length ? a.dust[i % a.dust.length] : { x: a.hooves.hn[0], y: a.hooves.hn[1] };
      return { x: d.x, y: d.y - 4, vx: -160 - 120 * r, vy: -50 - 60 * r };
    } },
    (g2, x, y, s) => { g2.fillStyle = rgba(PAL.sand, 0.5 * (1 - s.p)); g2.beginPath(); g2.arc(x, y, 6 + 14 * s.p, 0, TAU); g2.fill(); });
});
```

### 5.5 小动物：史莱姆弹出 → 挨刀炸开；纸鸽叼横幅

```js
import { drawSlime, drawDove, drawFirefly } from '../rigs/monsters.js';
import { field } from '../core/particles.js';

// V05：三只史莱姆（pop 0.5s 弹出、眼珠乱转；挨刀后 burst 0.6s 炸成水花）
ctx.layer(g, { shadow: 6, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  [[82.04, 82.60], [82.12, 82.95], [82.20, 83.30]].forEach(([t0, hitT], i) => {
    if (T < t0) return;
    drawSlime(lg, { x: slimeX[i], y: gy, t: T, seed: i, pop: clamp((T - t0) / 0.5),
      eyes: T < hitT - 0.15 ? 'roll' : 'scared', burst: clamp((T - hitT) / 0.6) });
  });
});

// E12：纸鸽叼横幅一端——先空画一次（alpha 0）拿喙锚点，再画横幅，最后正式画鸽子压在横幅端头上
ctx.layer(g, { shadow: 8, texture: 0.25 }, (lg) => {
  applyCam(lg, c, 1);
  const dO = { x: dx, y: dy, s: 1.3, t: T, carry: PAL.skyDayLow, carryEdge: PAL.gold };
  const beak = drawDove(lg, { ...dO, alpha: 0 }).beak;
  drawBanner(lg, beak /* 横幅端点 = 喙 */);
  drawDove(lg, dO);
});

// V12 萤火：field 粒子没有 age，自己给一个错开的 age 才会闪
ctx.layer(g, { blend: 'screen' }, (lg) => field(lg, T, { seed: 7, count: 24, x: 0, y: 300, w: 1920, h: 600, vx: 10, vy: -26, size: [3, 6] },
  (g2, x, y, s) => drawFirefly(g2, x, y, { ...s, age: T + s.r * 5 })));
```

### 5.6 远景 / 外景小马

```js
// E04：CASTLE 外景 s = 0.30，detail 0，图层投影按 s 缩小
ctx.layer(g, { shadow: 4, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const x = roadX(T), y = roadY(x);
  drawHorse(lg, { x, y, s: 0.3, face: -1, t: T, pose: 'gallop', phase: horsePhase(x, 0.3), detail: 0, angle: roadAngle(x) });
});
```

---

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际实现 |
|---|---|---|
| `dust` | 列为参数（“返回扬尘发射点”） | 不是参数；返回值里**总有** `dust` 数组 `[{x, y, k, leg}]`（没扬尘时为空） |
| `gait` | `gallop / trot / walk` 通用参数 | gallop / trot / walk 直接用 **pose 名**；`gait` 只决定 `limp / headwind / biteCoin` 底下跑哪种步态 |
| `phase` | `= 世界 x ÷ 步幅`，步幅 280 | 相同；另导出 `horsePhase(worldX, s)` 与 `HORSE_STRIDE`。各步态真实步幅 280 / 160 / 90，内部换算，调用方永远除 280·s |
| `saddle` | “骑手脚底锚点” | **鞍顶中心** = 勇者骑乘类 pose 的 `(x, y)`（勇者组约定：骑乘类锚点是臀底 / 鞍顶，不是脚底）；另给 `saddleRot`（传 `drawHero` 的 `rot`）与 `saddleAngle` |
| `mane` | `{trail, vel, wind}` | 相同；另接受顶层 `trail / vel / wind`；`vel / wind` 是 `[vx, vy]`，也接受单个数字 |
| `bandageLeg` | 布尔 | `true`（= 近前腿 fn）/ 腿名 / 腿名数组 |
| `noseBandage` | 布尔 | `true` 或 0..1（弹出动画） |
| 新增参数 | — | `angle`（坡度）、`limp`（0..1 跛行强度）、`speed`、`snow`、`breath`、`sweat`、`tremble`、`shiver`、`speedLines`（也可作参数）、`reins`、`stirrup / stirrupAt`、`at`、`paw`、`stamp`、`air`、`seed`、`detail`、`joints`、`silColor` |
| 新增导出 | 只有 `drawHorse`、`HORSE_POSES` | 另有 `horseRig`、`drawReins`、`horsePhase`、`HORSE_STRIDE`、`HORSE_EXPRS`、`HORSE_JOINTS`、`HORSE_GAITS` |
| 新增锚点 | `saddle saddleBack head mouth hoofFront tail` | 另有 `saddleRot saddleAngle stirrup withers eye earTip nose bit hooves contact dust tailRoot bob`，`biteCoin` 时 `coin spitAt` |
| pose | 14 个 | 14 个全有；另有别名 `idle`（= stand） |
| `rod` | 0.2 统一参数 | 白马不支持（白马不进纸剧场） |
| `drawSlime` `eyes` | “乱转” | `eyes` 接表情名（`eyes` 优先于 `expr`），`eyes: true` = `'roll'`；另有 `hop`、`hit`、`color`、`seed`、`joints.tilt` |
| `drawBat` | `fly / swoop` | 另有 `hang`、`expr`、`joints {wing, tilt}` |
| `drawBird` | `kind`、`thread` 是否画线 | `thread` 也可传数字 = 线长；青鸟另有 6 个 pose（`BIRD_POSES`），锚点是落脚点（`BIRD_FEET`）；纸鸟忽略 pose |
| `drawDove` | `carry` 时返回喙的位置 | 任何时候都返回 `beak`；`carry` 可传颜色字符串，另有 `carryColor / carryEdge`、`joints {wing, body, head}` |
| `drawSnail` | `crown`、`crawl` | `crown` 可传 0..1（弹出）；另有 `expr` |
| 新增常量 | — | `SLIME_EXPRS`、`BAT_POSES`、`BIRD_POSES`、`BIRD_FEET` |

---

## 7. 已知限制与注意事项

- **一定画在自己的 `ctx.layer` 里**（白马、小动物都是）：部件的“压边暗影”用 `source-atop` 叠在已画内容上，直接画在铺了背景的主画布上会把暗影压到背景上。地面、岩石等最好也不要和马同层。
- **性能**：每次 `drawHorse` 要在 6 个时刻（当前 + 5 个过去时刻）重求骨架给鬃毛拖尾用，加上约 40 个剪纸部件；同屏 3 匹以内用 `detail: 1`，s ≤ 0.35 的远景用 `detail: 0`。`horseRig` 只求一次骨架，可以放心在粒子 `emit` 里调。
- **phase 只认世界 x**：永远传 `horsePhase(世界x, s)`，不要自己乘 face；s 变化（推拉镜不算，指参数 s 变）时相位会跳。传了 `phase` 而不传 `speed / vel` 时，鬃毛按步态默认速度飘（急停、起步时建议传实际速度）。
- **`{from, to, k}` 插值**：蹄位线性插值，移动步态 ↔ 静止动作之间插值时支撑蹄会滑一点，过渡控制在 0.15–0.3s；`expr` 和 `spitAt / toss` 在 k = 0.5 处切换。
- **`at` 被三个动作共用**（`tossMane` 甩头、`skid` 急停、`biteCoin` 咬合）：在它们之间插值时按当前主导的动作换 `at` 值（见 5.3）。`paw` 只给 `pawGround`、`stamp` 只给 `stand`。
- **`squash`** 把 x 方向乘 1/√(1+q)，挤压期间蹄子会微滑，只用于落鞍、落地等短促冲击；返回的 `saddle` 已含挤压，勇者传同一个 `squash` 即可贴合。
- **`angle`** 是整匹马刚性转动：旅途的坡是 smoothstep 曲线，弯处前后蹄会有几 px 偏差；|angle| ≤ 0.2 内看不出。沿坡走的实际路程比 x 长 1/cos(angle)，≤ 9° 时打滑 < 1.5%。
- **`rear`** 绕髋转，后蹄钉在局部 x −38 / −30：人立期间不要再移动 `x`。**`leap`** 只给身体姿势，腾空弧线（x, y）由镜头给。
- **`hideRock`**：岩石由 env 画、并且要画在马**之上**（后画）；马卧倒后只有耳朵和翘起的尾巴高过岩顶（约 `y − 135·s`，模型图里岩顶取 `y − 140·s`）。
- **`biteCoin`**：马只在 `[at − 0.02, spitAt)` 内画嘴里的金币；飞来之前、`spitAt` 之后飞走的金币由镜头从 `mouth / coin` 锚点接着画。
- **锚点精度**：`horseRig().tail` 是按尾根方向估算的点，要精确尾尖用 `drawHorse` 的返回值；小动物锚点不含 `joints` 带来的局部转动（青鸟啄食、纸鸽 `joints.head`、史莱姆 `tilt`），用这些参数时锚点会差几 px。
- **剪影**：白马 `keepColor` 部件名只有 `tail legs head mane body saddle`；剪影时不画缰绳、白气、冷汗、闪光。蝙蝠剪影固定 ink（不读 `silColor`）。
- **骑乘**：勇者只画外侧腿，所以人马不能分到两个图层再在中间插东西（会露出里侧没画的腿位）；`stirrup: 'ride'` 只是按勇者 ride 姿势估的靴底位置，`rideLean / rideHunch` 等前倾姿势请用 `stirrupAt: heroRig(rO).foot`。
- **小动物**：`drawSlime` 的 `hop` 在 `pop < 1` 时无效；`burst ≥ 0.12` 之后身体消失只剩水花（此时 `center / eyes` 锚点仍按原位给）。纸鸟 `kind:'paper'` 不读 `pose`。`drawFirefly` 用 screen 光晕，只适合夜景暗底。
- **纯函数**：两个文件都没有 `Math.random / Date.now`、不存跨帧状态；随机全用 `hash1 / hash2 / noise1` 固定种子，`seed` 参数只用来错开多只个体。

---

## 8. 模型图清单

| 模型图源码 | 页（时刻） | 定稿 PNG |
|---|---|---|
| `src/sheets/horse.js` | 1/6 gallop 8 帧连贴 + 着地辅助线 + 四种原地循环（0–1）；2/6 各动作（1–2）；3/6 归程 face −1 · 远景 detail 0 · 剪影 · s=1 比例尺与锚点 · 8 种表情（2–3）；4/6 动态串场（3–10）；5/6 细节特写：冰凌积雪白气、叼金币、绷带创可贴、刨地踏蹄、发抖（10–14）；6/6 坡度 `angle` + 骑手 `saddleRot`、跛行强度 `limp`（14–16） | `out/review/sheets/horse/final_t0.50.png`、`final_t1.50.png`、`final_t2.50.png`、`final_t3.50.png`、`final_t4.60.png`、`final_t10.75.png`、`final_t14.50.png` |
| `src/sheets/monsters.js` | 1/2 史莱姆 pop 5 帧、7 表情、burst 0→1、hop、detail 0、剪影；蝙蝠 fly 三相位 / swoop / hang（0–1）；2/2 青鸟、挂线纸鸟、纸鸽三相位 + 叼横幅锚点检验、蜗牛经验条 + 王冠、鸡、蝴蝶 5 色、萤火（1–2） | `out/review/sheets/monsters/final_t0.50.png`、`final_t1.50.png` |
| `src/sheets/ride.js` | 1/2 人马合拍：mount 中段、ride、rideSlash、rideFront + ridePillion、face −1 归程、walk + rideLean、headwind + rideHunch（0–1）；2/2 V02 缩略动态：奔入 → 急停人立 → 甩头 → 起跳落鞍（同 squash）→ 奔出挥刀（1–4.6） | `out/review/sheets/ride/final_t0.50.png`、`final_t1.30.png`、`final_t2.75.png`、`final_t3.00.png`、`final_t4.20.png` |

自检命令：

```bash
./tools/lint.sh src/rigs/horse.js src/rigs/monsters.js src/sheets/horse.js src/sheets/monsters.js src/sheets/ride.js docs/api/horse.md
node tools/check.mjs sheets --list horse,monsters,ride
node tools/render.mjs stills --sheet horse --times 0.5,1.5,2.5,3.5,4.6,10.75,14.5 --outdir out/review/sheets/horse --prefix final_
node tools/render.mjs stills --sheet monsters --times 0.5,1.5 --outdir out/review/sheets/monsters --prefix final_
node tools/render.mjs stills --sheet ride --times 0.5,1.3,2.75,3.0,4.2 --outdir out/review/sheets/ride --prefix final_
```
