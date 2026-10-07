# 国王、公主与王室道具（royals）API

> 文件：`src/rigs/king.js`、`src/rigs/princess.js`、`src/props/royal.js`；规格见 `docs/assets.md` 第 2、3 节与 9.4。
> 本文逐项按代码核对（参数名、默认值、枚举都以代码为准）；与 assets.md 不一致处见第 6 节。
> 所有函数都是纯函数：只读参数、内部 save/restore、不调 `ctx.layer / ctx.mask`、只用 `PAL` 颜色；次级运动（呼吸、眨眼、辫梢、手帕、灯笼穗）全由 `t` 驱动，请传 `T`。

---

## 1. 模块与导出一览

### 1.1 `src/rigs/king.js`

| 名称 | 类型 | 一句话用途 | 性质 |
|---|---|---|---|
| `drawKing(g, o)` | 函数 | 画国王木偶，返回锚点对象 | **公开 API** |
| `drawKingCrown(g, o)` | 函数 | 只画国王头上的王冠，参数与 `drawKing` 相同、位置逐像素一致 | **公开 API** |
| `KING_POSES` | string[] | 国王动作名全表（29 个） | **公开 API** |
| `KING_EXPRS` | string[] | 国王推荐表情名（15 个） | **公开 API** |
| `FACE` | object | 全部角色共用的表情预设（23 个部件组合）；`expr` 传对象时可展开它再改 | 公开（只读查表） |
| `DEG` | number | π/180 | 工具 |
| `blinkAt(t, seed=0)` | 函数 | 眨眼闭合度 0..1（约 3.7s 一次，偶尔连眨） | 工具 |
| `ik2(S, P, l1, l2, bend=1)` / `armFK(S, a, e, l1, l2)` | 函数 | 两段臂 IK（返回 [上臂角, 肘角] 度）/ 正向运动学（返回 {elbow, hand}） | 工具 |
| `mixJoints(A, B, k)` / `poseKey(p)` / `resolvePose(table, pose, t, o, base, rig)` | 函数 | 关节表插值 / `{from,to,k}` 取主名字（k<0.5 取 from）/ 解析姿态 + IK + `o.joints` 叠加 | 工具 |
| `capsule(len, r0, r1)` / `drawHand(g, shape, r, fill, S)` / `drawArm(g, X, A, S, part)` / `ermineSpot(g, x, y, r)` | 函数 | 锥形肢体路径 / 手形（mitt fist point open cup flat）/ 两段臂 / 貂皮黑点 | 工具 |
| `drawFace(g, f)` / `drawMouth(g, f, ex, lw, t, det)` / `drawTears(...)` / `dizzyStars(g, cx, cy, r, t, k)` | 函数 | 统一脸部画法 / 嘴 / 瀑布泪 / 头顶转圈晕星 | 工具 |

“工具”只是给 `princess.js`（以及以后的王室角色）复用以保证同一画风，场景作者不要直接依赖，签名会随 rig 调整。场景里需要头顶晕星请用 `drawKing` 的 `stars` 参数，而不是直接调 `dizzyStars`。

### 1.2 `src/rigs/princess.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawPrincess(g, o)` | 函数 | 画公主米娅，返回锚点对象 |
| `drawWateringCan(g, o)` | 函数 | 单独画水壶（L02 12.45 水壶掉落弹一下；手里那只由 `drawPrincess` 自己画） |
| `PRINCESS_POSES` | string[] | 公主动作名全表（20 个） |
| `PRINCESS_EXPRS` | string[] | 公主推荐表情名（10 个） |

### 1.3 `src/props/royal.js`

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawCrown(g, o)` | 函数 | 国王大王冠（单独飞、滚、落回头上时用；`drawKing` 内部也用它） |
| `drawTiara(g, o)` | 函数 | 公主小皇冠（被磕飞、落地、被国王攥着时单独画） |
| `drawSeal(g, o)` | 函数 | 和国王一样大的金印（木柄 + 金底） |
| `drawStampMark(g, o)` | 函数 | 印迹：金箔印 / 红圈对勾 / 红色大叉 / 红圈「！」，带砸下过程 |
| `stampP(T, at, o)` | 函数 | 把“砸下时刻 at”换算成 `drawStampMark` 的进度 `p` |
| `drawScepter(g, o)` | 函数 | 星星权杖 |
| `drawBell(g, o)` | 函数 | 钟（声波弧线另画） |
| `drawGarland(g, o)` | 函数 | 花环 / 彩旗串 / 花拱，立体书式从铰链翻折下来 |
| `drawCradle(g, o)` | 函数 | 摇篮，立体书式立起 + 底部折角，可前后分层夹婴儿 |
| `drawLantern(g, o)` | 函数 | 红灯笼（内光脉冲） |
| `Xf` | class | 变换记录器：同时作用于 g 和一个仿射矩阵，用 `pt(x,y)` 把局部点换回调用坐标系 | 
| `piece / shadeBR / starPath / heartPath / ell` | 函数 | 纸片填充（右下错位暗影 + cut）/ 明暗层 / 五角星路径 / 爱心路径 / 椭圆路径 |
| `CROWN_SPEC` / `TIARA_SPEC` | object | 王冠 / 小皇冠的几何与配色（只读） |
| `smoothPath` | 函数 | `core/paper.js` 的 `smooth` 的转出口（rig 内部用） |

最后三行同属“工具”，rig 之间复用；场景里画星、心请优先用 `src/ui/kit.js` 的 `glyphIcon`。

---

## 2. 坐标、尺寸与锚点约定

通用：`(x, y)` 是调用时坐标系里的点（镜头已 `applyCam`，即世界坐标）；`s` 缩放；返回的锚点也都在同一坐标系里（已含 s、face、旋转、挤压）。角度：rig 的关节、`crown.tilt` 用**度**；`rot`、`spin`、`swing`、`rock` 用**弧度**。

### 2.1 国王 `drawKing`

| 项 | 约定 |
|---|---|
| 锚点 | 站姿 = **脚底中心**；`sit` / `slump` / `faint` 以及传了 `seated` 的任何动作 = **屁股落座点**（王座座面 y=660 直接传 `y: 660`）；`peek` = **裁切线中点**（贴画面下沿，只画裁切线以上） |
| s=1 尺寸 | 头顶约 224，王冠主尖顶珠约 275（= 220 + 王冠 45 的规格）；头宽 100；袍 + 披风宽约 156；手臂上臂 32 + 前臂 43 |
| face | 1 朝右，−1 朝左：整体 `scale(s·face, s)` 镜像。国王身上没有文字，不需要反镜像 |
| 左右手 | `handL` = 局部 −x 一侧（face 1 时是画面左、身后那只），`handR` = 局部 +x（面朝方向那只）。单手道具都拿在 **R 手** |
| 王冠 | 王冠在**头坐标**里（随 `joints.head`、lean、tilt 一起转）。锚点 = 前沿箍底中点，默认在头心上方 30。`crown.tilt` 正值 = 向面朝方向前倾 |
| squash | `scale(1/√(1+q), 1+q)`，以锚点为不动点；>0 拉长，<0 压扁 |

返回对象字段（`drawKing`）：

| 字段 | 含义 |
|---|---|
| `head` | 头心 |
| `eyes` | `[局部左眼, 局部右眼]`；face 1 时 `eyes[1]` 在面朝一侧 |
| `mouth` | 嘴（画在胡子上）；`puff` 吹气球时气球线从这里出发 |
| `ear` | 后侧那只耳朵（`earScale` 放大的就是它，K1 / E05 拢耳） |
| `neck` / `belly` | 领口中点 / 腰带扣 |
| `handL` / `handR` | 两只手的手心 |
| `crownBase` | 王冠锚点（前沿箍底中点）。`crown.off` 时也返回 |
| `crownTop` | 主尖顶珠上沿（K1「翁」卡在这里；N3 气球线汇到这里附近） |
| `crownRot` / `crownS` | 王冠局部系在调用坐标系里的转角（弧度，已含镜像、lean、head、tilt）与缩放，给单独飞的 `drawCrown` 接手用（见 3.2、5.3） |
| `sealBase` | 拿金印时：印面底边中点 |
| `scepterTip` | 拿权杖时：星心 |
| `tiara` | 拿小皇冠时：小皇冠底边中点（E09 交给公主时对位用） |
| `item` | 手帕下垂处 / 卷轴中心 / 小皇冠 / 金印握把 |

`drawKingCrown` 返回 `{ head, neck, belly, crownTop, crownBase, crownRot, crownS }`；`peek` 时 `drawKing` 返回 `{ head, eyes, crownTop, crownBase, crownRot, crownS }`，`drawKingCrown` 返回 `{ head, crownTop, crownBase, crownRot, crownS }`。

### 2.2 公主 `drawPrincess`

| 项 | 约定 |
|---|---|
| 锚点 | **脚底中心**；`ridePillion` = **后座落座点**（直接传 `drawHorse` 返回的 `saddleBack`，腰在锚点上方 20） |
| s=1 尺寸 | 头心在脚底上方 200；发顶约 262；小皇冠尖约 289；最外层裙摆半宽 75；麻花辫 11 节 × 15.5 = 约 170 长 |
| face | 1 朝右，−1 朝左：整体镜像；**文字不镜像**（名签「米娅」、「加油！」牌在 face −1 和 `turn` 翻到背面时都自动反镜像） |
| turn | 0..1：`scaleX = cos(2π·turn)`（转身翻面），|cos|<0.04 时夹到 0.04；同时自动给辫子加外甩 |
| rot | 弧度，绕锚点整体转；在**镜像后的局部系**里转（与 `drawHero` 的 `rot` 同义），画面上的转角 = face × rot。骑马时直接传 `drawHorse` 返回的 `saddleRot` |
| 左右手 | 同国王：`handR` 是面朝一侧，水壶 / 发卡 / 加油牌都在 R 手；花束在两手之间 |

返回对象字段（`drawPrincess`）：

| 字段 | 含义 |
|---|---|
| `head` / `eyes` / `mouth` / `neck` / `chest` / `waist` | 头心 / 两眼 / 嘴 / 颈 / 胸口 / 腰（E02 花瓣轨道圆心） |
| `handL` / `handR` | 手心 |
| `tiara` | 头上小皇冠的锚点（`tiara:false` 时也返回，用作小皇冠飞回 / 被戴回的落点） |
| `tiaraTop` | 小皇冠尖（只在戴着时返回；L01 10.90 青鸟落脚点） |
| `braid` / `braidTip` | 辫子链 12 个点（发根 → 发梢）/ 发梢 |
| `spout` | 拿水壶时：壶嘴（水流起点） |
| `sign` | 拿「加油！」牌时：牌心 |
| `item` | 发卡心 / 花束中心 |
| `foot` | `nudgeAway` 踢出去那只脚的脚尖 |
| `nameTag` | 名签中心附近（`only:'nameTag'` 时只返回这一项） |

### 2.3 道具锚点（royal.js 与水壶）

| 函数 | 锚点 | s=1 尺寸 | 返回 |
|---|---|---|---|
| `drawCrown` | 前沿箍底中点（戴在头上时贴头那条线） | 宽约 112，高约 64（到主尖顶珠） | `{ top, base, gem }` |
| `drawTiara` | 前沿箍底中点 | 宽约 46，高约 29 | `{ top, base, gem }` |
| `drawSeal` | 印面底边中点 | 高约 185（到木柄顶珠），底宽 132 | `{ grip, top, base, face:[左端点, 右端点] }` |
| `drawStampMark` | 印迹中心 | 圆印半径 `r`（默认 90）；金印框 `w×h`（默认 300×110） | `null`（p≤0）或 `{ center, impact, post? }` |
| `drawScepter` | 握点（手的位置），默认竖直、星在上 | 星心在握点上方 122，星尖约 149，杖尾下方 58 | `{ tip（星心）, bottom }` |
| `drawBell` | 吊点（绕它摆） | 钟口在吊点下方 104，口宽约 100 | `{ mouth, top }` |
| `drawGarland` | garland / bunting：两个挂点 (x0,y0)–(x1,y1)；arch：两个拱脚 | 由挂点决定 | `null`（fold≤0）或 `{ mid }`（垂弧最低点 / 拱顶） |
| `drawCradle` | 地面接触点中心 | 摇脚宽约 216，篮口在上方 96，篷顶约 160 | `null`（立起量为 0）或 `{ baby, rim, hood }` |
| `drawLantern` | 吊点（绳顶） | 灯身 54×56，灯心在下方 46，穗底 108 | `{ center, bottom }` |
| `drawWateringCan` | 提手握点 | 壶身 44×40 | `{ spout }` |

---

## 3. 函数详解

### 3.1 `drawKing(g, o) → anchors`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 锚点（见 2.1：站 = 脚底，坐 = 屁股，peek = 裁切线） |
| `s` | 1 | 缩放；CASTLE 阳台 0.26，城下 0.30，其余 1 |
| `face` | 1 | 1 朝右 / −1 朝左 |
| `t` | 0 | 秒（呼吸 2.8s 周期、眨眼、循环动作、胡子微动），传 `T` |
| `pose` | `'idle'` | 动作名，或 `{from, to, k}`（可嵌套）在两个动作之间插值：数值关节线性插值；手形、分层、默认手持物等离散项按 `k<0.5` 取 from、否则取 to |
| `expr` | `'smile'` | 表情名（`FACE` 的键，推荐 `KING_EXPRS`），或部件对象 `{eyes, brows, mouth, blush, sweat, lines, tears, cheeks, green, hatch}`（未写的部件取 `smile`） |
| `joints` | — | 关节增量：数值**相加**（度 / px），非数值**覆盖**。常用键：`lean`（躯干前倾，度）、`head`（点头）、`tilt`（全身倾）、`armL/elbowL/armR/elbowR`、`wristL/wristR`、`legL/legR/footL/footR`、`hipY`、`lift`（离地 px）、`bodyX`、`tip`（踮脚 0..1）、`handL/handR`（手形名）、`layL/layR`（`'back'/'mid'/'front'`）、`sealAng`（金印角度） |
| `detail` | 1 | 0 = 远景简化（不画纹理、貂皮点、明暗） |
| `alpha` | 1 | 整体透明度 |
| `silhouette` | false | 剪影：全部填 `PAL.ink`，`keepColor` 里的部件保留原色 |
| `keepColor` | `[]` | 部件名：`'robe' 'legs' 'skin' 'beard' 'crown' 'bandage' 'item' 'rod'` |
| `rod` | false | 纸剧场木杆（锚点上方 30 起往下 1400） |
| `squash` | 0 | 全身挤压拉伸（见 2.1） |
| `crown` | `{}` | 王冠状态，见下表 |
| `holding` | 动作自带 | `'tiara' 'seal' 'scepter' 'scroll' 'handkerchief'` 或 `null`（空手）。**不传**（undefined）时用动作自带：`wave`→手帕、`raiseScepter`→权杖、`sealRaise/sealSlam`→金印、`clutch/placeTiara`→小皇冠；插值姿态按 `poseKey`（k<0.5 取 from）决定 |
| `bandage` | false | 头上一圈绷带 + 小十字贴（E09 起） |
| `festive` | false | 节日长袍：披风金边加宽、前襟与下摆加金线、领口金边 |
| `cheeks` | 0 | 鼓腮 0..1（`expr:'puffed'` 自带 1）；>0.3 时嘴自动变成吹气的 `blow` |
| `beardFlip` | 0 | 胡子被吹翻 0..1：≥0.46 露出张大的嘴，>0.53 胡子翻过来盖住脸和王冠前沿（L08 远景） |
| `green` | 0 | 脸发青 0..1（`expr:'sick'` 自带 1）：肤色混 `skyDay` 30% |
| `earScale` | 1 | 后侧耳朵放大（K1 / E05 到 1.3） |
| `legsUp` | 0 | 两腿翘起 0..1（配 `faint`） |
| `wrapped` | 0 | 被纸卷从脚往上裹住 0..1（E08）；>0 时双臂收到身侧 |
| `seated` | false | `true` 或 0..1：下半身换成坐姿（任何上身动作都能坐着做，如 `cupEar`、`wipeTears`） |
| `look` | `[0,0]` | 眼珠方向 −1..1 |
| `blink` | 自动 | 0..1；不传时 `blinkAt(t, 1)` |
| `talk` | 0 | 0..1 说话张合（约 6.3Hz） |
| `sweat` | 0 | 0..1 汗滴 |
| `stars` | 0 | 0..1 头顶转圈晕星（透明度） |
| `peekCut` | 20 | 仅 `peek`：头心在裁切线上方多少（s=1 px） |
| `peekHands` | false | 仅 `peek`：裁切线上露出两只扒着的手 |
| `tiaraGlint` | 0.4 | 双手捧小皇冠（`clutch`）时的闪光 |

`crown` 子参数（全片情绪刻度，时间表见 4.5）：

| 键 | 默认 | 说明 |
|---|---|---|
| `tilt` | 0 | 度；正 = 向面朝方向歪（同时向前平移 sin(tilt)·10） |
| `slip` | 0 | 0..1（超出夹住）：下滑 47px，1 = 盖住眼睛 |
| `pop` | 0 | 沿头部“上”方向弹起的距离（s=1 px，随 s 缩放） |
| `squash` | 0 | 0..1 被线勒扁：横 ×(1+0.2q)、竖 ×(1−0.44q)，尖向外张，带勒痕 |
| `spin` | 0 | 弧度，绕竖轴转（尖、宝石跟着转） |
| `off` | false | 不画王冠（锚点照样返回）；交给 `drawKingCrown` / `drawCrown` 单独画 |
| `glint` | 0 | 0..1 主宝石闪光（正面朝前时可见） |
| `wraps` | squash>0.05 | 是否画勒痕 |

返回：见 2.1。

### 3.2 `drawKingCrown(g, o) → { head, neck, belly, crownTop, crownBase, crownRot, crownS }`

参数与 `drawKing` 完全相同（直接把同一个 `o` 传进来），只画王冠，且忽略 `crown.off`。用途：
- 王冠要放进单独图层（不同投影、在遮罩上面、在前景层）时：身体那次传 `crown.off: true`，再用同一个 `o` 调本函数——位置逐像素一致。
- 王冠相对头飞起再落回（L13 连蹦、E07 跳起、E09 落回）：只改本函数的 `crown.pop / tilt / spin / squash`。
- 交接给世界坐标里自由飞的 `drawCrown`（E08 飞出画面上沿、b06 国王卡王冠滚出）：在交接帧读返回值，按下式调用，与头上那顶逐像素重合：

```js
drawCrown(g, { x: a.crownBase[0], y: a.crownBase[1], rot: a.crownRot, s: a.crownS,
               spin: face * (crown.spin || 0), squash: crown.squash || 0, F: 1, t: T });
```

要点：`F: 1`（独立画时不镜像，光照方向由 F 保持左上受光）；`spin` 要乘 face；`crownRot` 已含镜像与身体、头、tilt 的全部转角；`crownS` = s × 头部那一轴的缩放（有全身 `squash` 时取竖轴）。之后在这个起点上叠加位移 / 转角即可。模型图 `king` 第 4 页第 6 格有对位校验（红色单色王冠与头上王冠重合）。

### 3.3 `drawPrincess(g, o) → anchors`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 锚点（脚底中心；`ridePillion` = 后座落座点） |
| `s` | 1 | 缩放；阳台 0.26 |
| `face` | 1 | 1 朝右 / −1 朝左 |
| `t` | 0 | 秒（呼吸 2.6s、眨眼、辫子与侧发摆动、裙摆、循环动作），传 `T` |
| `pose` | `'idle'` | 动作名或 `{from, to, k}`（同国王） |
| `expr` | `'smile'` | 表情名（`FACE` 的键，推荐 `PRINCESS_EXPRS`）或部件对象；公主自动带睫毛 |
| `joints` | — | 关节增量（同国王）；公主额外有 `headX`（头左右平移 px）、`flare`（裙摆张开 0..1）、`drag`（裙摆后拖 px）、`kick`（踢腿 0..1）、`step`（碎步相位）、`hipY` |
| `detail` | 1 | 0 = 远景简化 |
| `alpha` | 1 | 整体透明度 |
| `silhouette` | false | 剪影（同国王） |
| `keepColor` | `[]` | 部件名：`'braid' 'hair' 'dress' 'skin' 'veil' 'tiara' 'item' 'rod'` |
| `rod` | false | 纸剧场木杆（锚点上方 60 起往下 1400） |
| `squash` | 0 | 全身挤压拉伸 |
| `rot` | 0 | 弧度，绕锚点整体转（镜像后的局部系里转，同 `drawHero`）；骑马传 `saddleRot` |
| `turn` | 0 | 0..1 转身翻面（`dance` 用；0.25 侧面最窄、0.5 背面） |
| `tiara` | true | `false` = 不戴小皇冠（L04 被磕飞后到 E09 戴回前） |
| `tiaraGlint` | 0.25 | 头上小皇冠闪光 0..1 |
| `veil` | 0 | 婚礼头纱 0..1（或 `true`）：长度与发髻花随之变化 |
| `braid` | `{}` | 麻花辫拖尾：`{ trail, vel, wind, spin }`，见下表 |
| `item` | 动作自带 | 覆盖手持物：`'can' 'hairpin' 'sign' 'bouquet'` 或 `null`。不传时动作自带：`water`→水壶、`pickLock/stepOut`→发卡、`cheerSign/puppetCage`→加油牌、`bride`→花束；插值姿态按 `poseKey` 决定 |
| `hairpin` | — | 真值且没传 `item` 时 = `item:'hairpin'` |
| `sign` | — | 0..1：`cheerSign / puppetCage` 时是举牌高度（0 手放低，1 举过头顶）；其它没有自带道具的动作里 >0 会让 R 手拿上加油牌（不改手臂姿势） |
| `pour` | 0.8 | 拿水壶时的倾倒量 0..1（>0.15 出水） |
| `nameTag` | — | 胸前名签：`'米娅'` 或 `{ text, size }`（size 默认 78，s=0.26 × CA-BAL 2.6 下屏幕约 53px） |
| `only` | — | `'nameTag'`：只画名签（与完整绘制同位置），用于把名签放到栏杆前的图层；此时画身体的那次调用**不要**传 `nameTag` |
| `blush` | — | 数值：腮红 = max(表情自带, 1 + blush) |
| `look` / `blink` / `talk` / `sweat` | `[0,0]` / 自动 `blinkAt(t,2)` / 0 / 0 | 同国王 |

麻花辫 `braid`：

| 键 | 说明 |
|---|---|
| `trail` | 时间回溯采样（推荐，跑动最自然）：`trail[k] = 锚点(T − k·0.035) − 锚点(T)`，世界 px。用到 `trail[1..11]`（`trail[0]` 不用），建议给 12–14 个；不足 11 个时按最后一个外推 |
| `vel` | `[vx, vy]` px/s（世界）。没给 `trail` 时按 `−vel·k·0.035` 生成默认拖尾；无论有没有 `trail`，`vel` 都决定辫梢甩动幅度（|vel|/500）和裙摆后拖量（`vx·0.04`，限 ±26） |
| `wind` | `[wx, wy]`：第 k 节偏移 `wind·k·0.02`（世界 px） |
| `spin` | 外甩量（转圈时辫子向身后甩出）；`turn` 和 `flare` 会自动叠加（`|sin 2π·turn|·1.6 + 0.8·flare`） |

返回：见 2.2。

### 3.4 `drawWateringCan(g, o) → { spout }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 提手握点 |
| `s` | 1 | 缩放（公主手里那只是 0.9 × 公主 s） |
| `rot` | 0 | 弧度 |
| `pour` | 0 | 0..1 倾倒（壶身多转 0.55 弧度；>0.15 出水，水流世界向下） |
| `t` | 0 | 秒（水流虚线、水珠） |
| `F` | 1 | 面向（只影响受光方向） |
| `alpha`, `detail` | 1, 1 | |

### 3.5 `drawCrown(g, o)` / `drawTiara(g, o) → { top, base, gem }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 前沿箍底中点 |
| `s` | 1 | 缩放 |
| `rot` | 0 | 平面旋转，弧度（飞、滚） |
| `spin` | 0 | 绕竖轴转，弧度（尖与宝石按深度排序，背面的尖变暗） |
| `squash` | 0 | 0..1 勒扁（大王冠 N3；小皇冠也可用） |
| `wraps` | squash>0.05 | 勒痕 |
| `glint` | 0 | 0..1 主宝石闪光（大王冠红宝石 / 小皇冠中心粉钻），只在正面朝前时出现 |
| `t` | 0 | 秒（闪光闪烁） |
| `F` | 1 | 面向：只决定受光方向（独立画时一般给 1） |
| `mono` | null | 单色剪影色（如 `PAL.ink`） |
| `alpha`, `detail` | 1, 1 | |

返回：`top` 主尖顶珠上沿、`base` 锚点、`gem` 主宝石。大王冠带红丝绒帽；小皇冠没有。

### 3.6 `drawSeal(g, o) → { grip, top, base, face }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 印面底边中点 |
| `s`, `rot` | 1, 0 | |
| `lift` | 0 | 0..1：整体抬离纸面 0..110px，抬起中途略拉长，接触影变淡变小（影子留在原地） |
| `squash` | 0 | 砸下瞬间压扁（横 ×(1+0.12q)，竖 ×(1−0.16q)） |
| `inked` | true | 印面一条红泥 |
| `shadow` | true | 接触影 |
| `glint` | 0 | 0..1 金底闪光 |
| `t`, `F`, `alpha`, `detail` | 0, 1, 1, 1 | |

返回：`grip` 握把中点、`top` 顶珠上沿、`base` 印面底边中点（随 lift 抬起）、`face` 印面底边两端点。国王 `holding:'seal'` 时金印由 `drawKing` 自己画（角度跟 `sealAng`），不用另调。

### 3.7 `drawStampMark(g, o)` 与 `stampP(T, at, { pre, post })`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 印迹中心 |
| `s` | 1 | 缩放 |
| `rot` | −0.08 | 弧度（默认微微歪） |
| `kind` | `'check'` | `'gold' 'check' 'x' 'error'`，见 4.6 |
| `p` | 1 | 进度：0–0.25 印影从 1.6 倍压到 1.04 倍（multiply 暗影）；0.25 冲击（出现 + 回弹 + 14 条放射线 + 墨点）；→1 放射线消失、定格 |
| `r` | 90 | 圆印半径（check / x / error） |
| `color` | gold→`PAL.gold`，其余→`PAL.red` | 墨色 |
| `w`, `h` | 300, 110 | 金印框尺寸 |
| `chars` | — | 金印里的字（字符串或数组），走 `paperGlyph` 金字 |
| `charAppear` | 全 1 | 每个字 0..1（outBack 弹出），做逐字错峰 |
| `glyphSize` | 自动 | 默认 `min(h·0.6, ((w−40)/字数)/0.82)` |
| `sweep` | 0 | 0..1 金箔扫光（只在 0<sweep<1 时画） |
| `rays` | true | 放射线 |
| `seed` | 3 | 放射线 / 墨点 / 斑驳的随机种子（同一镜头多枚印迹给不同 seed） |
| `alpha`, `t` | 1, 0 | |

返回：`p≤0` 时 `null`；压下阶段 `{ center, impact:false }`；冲击后 `{ center, impact:true, post }`（post 0..1 为冲击后进度）。

`stampP(T, at, { pre = 0.12, post = 0.6 })`：`T < at−pre` → 0；`at−pre..at` → 0..0.25；`at..at+post` → 0.25..1。把 `at` 设成 cue 时刻，冲击正好落在 cue 上。

### 3.8 `drawScepter(g, o) → { tip, bottom }`

参数：`x, y`（握点）、`s`=1、`rot`=0（弧度，0 = 竖直星在上）、`t`=0、`glint`=0（0..1 星尖闪光）、`glow`=0（0..1 星发光）、`F`=1、`mono`=null、`alpha`=1、`detail`=1。国王 `holding:'scepter'` 时由 `drawKing` 自己画。

### 3.9 `drawBell(g, o) → { mouth, top }`

参数：`x, y`（吊点）、`s`=1、`swing`=0（弧度，当前摆角）、`clapper`（钟舌相对摆角，默认 `−0.55·swing` 表现滞后）、`t`=0、`F`=1、`alpha`=1、`detail`=1。没有 `rot`，摆角就是 `swing`。声波弧线用 `misc.drawSpeechWave` 另画，从 `mouth` 出发。

### 3.10 `drawGarland(g, o) → null | { mid }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `kind` | `'garland'` | `'garland' 'bunting' 'arch'`，见 4.7 |
| `x0, y0, x1, y1` | 0, 0, 400, 0 | garland / bunting：两个挂点（铰链线）；arch：两个拱脚 |
| `sag` | 跨度 × 0.18 | 垂弧下垂量（garland / bunting），随 t 轻摆 ±4% |
| `h` | 跨度 × 0.8 | 拱高（arch；铰链在拱顶） |
| `s` | 1 | 花、叶、旗的大小 |
| `fold` | 1 | 0..1 翻折：0 折起看不见（返回 null），1 挂好；中间 outBack 过冲 + 半折时变暗 |
| `t` | 0 | 秒（旗子、丝带轻摆） |
| `seed` | 7 | 花色 / 旗色顺序 |
| `F`, `alpha` | 1, 1 | |

### 3.11 `drawCradle(g, o) → null | { baby, rim, hood }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x`, `y` | 0, 0 | 地面接触点中心 |
| `s` | 1 | 缩放 |
| `rise` | 1 | 0..1 立起：scaleY 0→1（outBack 1.6）+ 底部折角纸片（立起中可见，立好压成细边） |
| `rock` | 0 | 弧度，摇摆 |
| `part` | `'all'` | `'back'`（内壁 + 毯子背面 + 折角）/ `'front'`（摇脚、篮身、毯边、篷）/ `'all'`；婴儿夹在 back 与 front 之间画 |
| `hood` | 1 | 篷在哪一侧：1 右 / −1 左 |
| `t`, `F`, `alpha` | 0, 1, 1 | |

返回：`baby` 婴儿屁股落点（篮内）、`rim` 篮口中点、`hood` 篷顶。

### 3.12 `drawLantern(g, o) → { center, bottom }`

参数：`x, y`（吊点）、`s`=1、`pulse`=0（0..1 内光脉冲：灯身变亮 + 外光晕）、`swing`=0（弧度）、`t`=0（穗子摆动）、`F`=1、`alpha`=1、`detail`=1。

---

## 4. 枚举全表

### 4.1 国王动作 `KING_POSES`（29）

| pose | 说明 | 用在 |
|---|---|---|
| `idle` | 站立，手臂微摆 | 全片 |
| `sit` | 坐姿（锚点 = 屁股；王座传 y=660） | b14 169.00 起、b16 王座上（要坐着做别的动作用 `seated`） |
| `hop` | 喜悦蹦起，双手高举 | b04 L13 连蹦三下（与 `crouch` 插值） |
| `pace` | 慌跑（循环步态，双手乱挥） | b02 19.30–19.95 来回慌跑 |
| `holdHead` | 双手抱头，头抖 | b02 19.20（配 `crown.slip` 0→1） |
| `stoop` | 弯腰捡东西（R 手够地面） | b02 18.30 看见小皇冠 |
| `clutch` | 双手把小皇冠攥在胸口（默认拿 tiara，两手捧） | b02 18.50 起 |
| `lookFar` | 手搭凉棚眺望 | b02 18.90 望向龙山 |
| `leanForward` | 探身 | b04 L14 前倾、40.60 朝勇者倾身；b03 24.25 远景（配 `beardFlip` 1） |
| `cupEar` | 一手拢在耳边探身 | b05 K1（face −1、`earScale` 1.3、`crown.tilt` 15）；b14 169.30（加 `seated`） |
| `fingerUp` | 竖起一根手指（循环微动） | b05 K2 |
| `puff` | 吹气（后仰、两手张开） | b05 N3a（配 `cheeks` 1） |
| `dangle` | 被气球吊起，两手抓线、两腿悬空摆 | b05 N3c |
| `sealRaise` | 抡起金印（默认拿 seal） | b05 N4 预备 |
| `sealSlam` | 金印砸下（默认拿 seal） | b05 N4a/b/c 冲击帧（与 `sealRaise` 插值） |
| `crouch` | 深蹲蓄力 | b05 55.45、b04 落地挤压 |
| `faint` | 向后仰倒（锚点 = 屁股，配 `legsUp`） | b14 E08 176.40 |
| `raiseScepter` | 高举星星权杖（默认拿 scepter） | b15 E09 177.00 |
| `placeTiara` | 举着小皇冠往前递（默认拿 tiara） | b15 177.45–177.55 戴回公主头上 |
| `giveHand` | 手心向上递出 | b15 E11 181.08 把公主的手放进勇者手里 |
| `clap` | 拍手（循环） | b16 O01 |
| `wipeTears` | 两拳轮流擦泪（循环） | b16 O03 王座上擦眼泪（加 `seated`，配 `waterfall`） |
| `biteNails` | 啃指甲（循环抖） | b16 O05 194.85 |
| `slump` | 瘫进椅子（锚点 = 屁股） | b16 196.80 |
| `wave` | 挥手帕（循环，默认拿 handkerchief） | b07 V03 远景阳台 |
| `bow` | 鞠躬 | b06 65.35 国王卡（王冠 `off` + `drawCrown` 滚出） |
| `peek` | 裁切版：只露王冠和眼睛（锚点 = 裁切线） | b03 画面下沿偷看（25.50–32.30） |
| `gasp` | 双手捂脸颊倒吸凉气 | b14 E07 173.30（配 `crown.pop`） |
| `leap` | 蹦进画面，双手高举、腿收起 | b03 33.60、b04 入场（跳在半空） |

### 4.2 国王表情 `KING_EXPRS`（15）

| expr | 说明 | 用在 |
|---|---|---|
| `smile` | 默认微笑 | 全片 |
| `joy` | 笑眯眼 + 大笑 | b04 L13、b05 N4 |
| `panic` | 瞪眼 + 尖叫嘴 + 汗 + 额头竖线 | b02 L05 |
| `squint` | 一眼眯一眼睁 + 坏笑 | b05 K1 / K2（N1b 眯眼） |
| `confident` | 半眯眼 + 平眉 + 坏笑 | 建议：b05 N4 抡印、b14 王座上（第 5 节未写表情） |
| `puffed` | 挤眼 + 鼓腮 + 吹气嘴（自带 `cheeks` 1） | b05 N3a |
| `sick` | 半眯 + 波浪嘴 + 脸发青（自带 `green` 1） | b05 N3c |
| `dizzy` | 螺旋眼 | 建议：b14 E08 晕倒余波（第 5 节未写） |
| `faint` | 叉叉眼 + 吐舌 | b14 E08 |
| `proud` | 笑眯眼 + 腮红 | 建议：b15 E09 举权杖 |
| `tearful` | 含泪大眼 + 抖嘴 | 建议：b02 攥小皇冠、b15 E11 交出公主的手 |
| `waterfall` | 两道小瀑布泪 | b03 32.30（peek 版）、b16 O03 |
| `starEyes` | 星星眼 | b03 30.30（peek） |
| `relieved` | 闭眼松口气 | b16 196.80 |
| `gasp` | 瞪眼 + O 形嘴 | b03 25.50（peek）、b14 E07 |

`FACE` 里另有 `shock eyeroll focused smug laugh shy loving tense` 等（公主用），国王也能传。部件可选值：eyes `dot wide half focus angry happy closed line squeeze x spiral star heart roll tear wink squintOne`；brows `normal up worried angry flat relaxed raised1 squint none`；mouth `smile flat frown smirk wavy wavySmall wobble grin open gasp scream cry blow tongue tongueOut teeth cat bigSmile`。b03 28.35「眉毛挑起」可传 `expr: { eyes: 'dot', brows: 'up', mouth: 'smile' }`。

### 4.3 公主动作 `PRINCESS_POSES`（20）

| pose | 说明 | 用在 |
|---|---|---|
| `idle` | 双手交叠站立 | b01 7.90（阳台 idle，拿着水壶：加 `item:'can', pour:0`） |
| `water` | 浇花（默认拿水壶） | b02 L01 |
| `wave` | 挥手 | b02 11.40、b09 100.60 |
| `lookUp` | 抬头握拳 | b02 12.35 |
| `caged` | 抱臂（笼中） | b02 15.80、b11 136.90 |
| `pickLock` | 发卡撬锁（默认拿发卡，手抖） | b09 V14、b11 131.20 |
| `pointBehind` | 指向勇者身后 | b09 100.95 |
| `cheerSign` | 举「加油！」牌、另一手敲（默认拿 sign，`sign` 控制举高） | b11 130.60 |
| `stepOut` | 转着发卡走出笼门（默认拿发卡，碎步） | b13 161.35 |
| `twirl` | 张开双臂转圈，裙摆张开 | 第 5 节未点名；可用于 b13 E02 花瓣环绕、b16 转圈 |
| `ridePillion` | 侧坐后座搂着前面的人（锚点 = 后座） | b14 E03 起（配 `rot: saddleRot`、`braid`） |
| `bride` | 双手捧花（默认拿 bouquet） | b15（配 `veil`） |
| `holdHands` | R 手伸出牵手 | b15 E11、b16 O01 |
| `coverFace` | 害羞捂脸（摇晃） | 第 5 节未点名（assets 列出的备用反应，配 `shy`） |
| `dance` | 跳舞（配 `turn`） | b16 O01 |
| `leanOver` | 俯身看（手扶在前方） | b16 O03 看摇篮 |
| `nudgeAway` | 用脚推开（`foot` 锚点是脚尖） | b16 O05 194.35 推开卷轴 |
| `shakeHead` | 摇头 | b16 O05 194.35 |
| `deflate` | 瘪下去 | b16 196.80 |
| `puppetCage` | 剧场笼中迷你偶（关节铆钉，默认拿 sign） | b12 / b13 152.80 举牌敲笼 |

### 4.4 公主表情 `PRINCESS_EXPRS`（10）

| expr | 说明 | 用在 |
|---|---|---|
| `smile` | 默认 | 全片 |
| `eyeroll` | 翻白眼 | b02 15.80、b09 V14 |
| `shock` | 瞪眼张嘴 + 额头竖线 | b02 12.35 |
| `focused` | 专注眯眼 + 咬舌尖 | b09 撬锁 |
| `smug` | 挑眉坏笑 | b13 161.35「一脸得意」 |
| `laugh` | 笑眯眼大笑 | b16 186.00 |
| `shy` | 闭眼 + 腮红斜线 | 第 5 节未点名，配 `coverFace` |
| `loving` | 爱心眼 | b14 E03、b15 E11 |
| `tense` | 瞪眼 + 咬牙 + 汗 | 建议：b11 / b13 举牌敲笼前（第 5 节未写表情） |
| `relieved` | 闭眼松口气 | b16 196.80 |

### 4.5 国王王冠状态时间表（storyboard 第 7 节，全片情绪刻度）

| 时刻 | 块 | 状态 | 写法（`crown` 参数） |
|---|---|---|---|
| ≤ 34.00 | b02–b04 | 端正 | `{}`（b02 19.20 抱头时例外：`{ slip: ez(T, 19.2, 19.4) }`，b02 出场仍盖眼） |
| L13 34.00–35.10 | b04 | 连蹦三下，每次飞起 80px 再落回乱颤，第三次落歪 10° | `{ pop: 80·4u(1−u), tilt: wobble(...)·8 }` → 定格 `{ tilt: 10 }`（写法见模型图 `king` 第 4 页第 1 格） |
| L14 36.11 | b04 | 前倾时再前滑 5° | `{ tilt: 15 }`（10 + 5，配 `leanForward`） |
| K1 45.10 | b05 | 歪 15°，尖上卡着「翁」 | `{ tilt: 15 }`；「翁」挂在返回的 `crownTop` |
| K2 49.35–49.55 | b05 | 滑下盖眼（「翁」掉下去） | `{ tilt: 15·(1−k), slip: k }`，k = `ez(T, 49.35, 49.55)`（可 `outBack`） |
| N3 52.20–53.10 | b05 | 被气球线勒扁 | `{ squash: 1, pop: 4–6 }`（勒痕自动），气球线汇到 `crownTop` |
| E07 173.30 | b14 | 跳起 40px | `{ pop: 40·bump }`（bump 用 `hit`/`wobble` 回落） |
| E08 176.45 | b14 | 晕倒时飞出画面上沿 | `drawKing` 传 `{ off: true }`，王冠用 `drawKingCrown`（加大 `pop`、`tilt`、`spin`）或交接给 `drawCrown`（3.2） |
| E09 177.05 | b15 | 从画面上沿落回头上（挤压「叮」） | `drawKingCrown` 的 `pop` 从大到 0，落定瞬间 `squash` 0.3 回弹 + `glint` |
| 177.05–197.00 | b15–b16 | 歪着度过尾声 | `{ tilt: θ }`，建议 b15 / b16 共用同一个值（如 12），避免块间跳变 |
| O06 197.00 | b16 | 自己回正，闪一下 | `{ tilt: θ·(1−k), glint: pulse(T, 197.05, 0.12) }`，k = `ez(T, 197.0, 197.25, outBack)` |

第 7 节没写 K2（盖眼）到 N3（吹气球）之间王冠何时推回，由 b05 自定（例如 N3a 鼓腮时用 `spring` 把 slip 弹回 0）。

### 4.6 道具状态枚举

| 枚举 | 值 | 说明 | 用在 |
|---|---|---|---|
| 国王 `holding` | `'tiara'` | 小皇冠（单手捏着；两手相距 <48px 时两手捧） | b02、b15 |
| | `'seal'` | 金印（跟 `sealAng` 转，`sealBase` 是印面） | b05 N4 |
| | `'scepter'` | 星星权杖 | b15 E09 |
| | `'scroll'` | 小卷轴 | 备用 |
| | `'handkerchief'` | 手帕（随 t 飘） | b07 V03 |
| | `null` | 空手（覆盖动作自带） | — |
| 公主 `item` | `'can'` | 水壶（`pour` 控制） | b01、b02 |
| | `'hairpin'` | 心形发卡 | b09、b13 |
| | `'sign'` | 「加油！」小牌（插在发卡上，字不镜像） | b11、b12/b13 |
| | `'bouquet'` | 花束（两手之间） | b15 |
| | `null` | 空手 | — |
| `drawStampMark` `kind` | `'gold'` | 金箔压印：双线圆角框 + 角星 + 可选金字 + 扫光 | b05 N4（金印印出名字） |
| | `'check'` | 红圈对勾 | b16 O06 196.60 |
| | `'x'` | 红色大叉章 | b14 E07 173.05 砸在龙身上 |
| | `'error'` | 红圈「！」警示 | storyboard 第 5 节未点名，备用 |
| `drawCradle` `part` | `'back' / 'front' / 'all'` | 婴儿夹在 back 与 front 之间 | b16 O03 |
| 手形（`joints.handL/handR`） | `mitt fist point open cup flat` | 连指手套 / 拳 / 伸食指 / 张开 / 拢耳 C 形 / 平摊 | 覆盖动作自带手形 |

### 4.7 婚礼装饰 `drawGarland` `kind` 与 `fold`

| kind | 说明 | 用在 |
|---|---|---|
| `'garland'` | 叶绳 + 花的垂弧，两端蝴蝶结 | b15 176.95–177.40 从塔顶翻折下来（错峰 60ms） |
| `'bunting'` | 彩旗串（细绳 + 三角旗，旗子随 t 轻摆） | 同上 |
| `'arch'` | 花拱（叶带 + 花 + 两条垂丝带），铰链在拱顶 | 同上 |

`fold`：0 折起（不画）→ 中途 `outBack(fold, 1.7)` 过冲、半折时整体变暗 → 1 挂好。错峰写法：`fold: ez(T, 176.95 + i * 0.06, 176.95 + i * 0.06 + 0.35)`。摇篮 `rise` 同理（O03 189.75）；红灯笼 `pulse` 2Hz 写法：`pulse: 0.5 + 0.5 * Math.sin(T * Math.PI * 4)`（b02 19.30–19.95）。

---

## 5. 推荐用法

### 5.1 王座厅：国王坐王座 + 图层投影 / 纸纹 + 机位深度

```js
import { applyCam, lerpCam, drift, addv } from '../core/camera.js';
import { drawKing } from '../rigs/king.js';

draw(g, T, lt, ctx) {
  const c = TR_KING; // 预设机位，叠 drift
  ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
    applyCam(lg, c, 1);                         // 主体层 depth 1
    drawKing(lg, {
      x: 1580, y: 660, s: 1, face: -1, t: T,    // 锚点 = 屁股（座面 y=660），朝左对着勇者
      pose: 'cupEar', seated: true, expr: 'squint',
      earScale: 1.3, festive: true, crown: { tilt: 15 },
    });
  });
}
```

### 5.2 金印砸下：pose 插值 {from,to,k} + stampP + 王冠余振（b05 N4）

```js
import { ez, inQuad } from '../core/ease.js';
import { hit } from '../core/util.js';
import { drawKing } from '../rigs/king.js';
import { drawStampMark, stampP } from '../props/royal.js';

const at = 54.00;                                   // N4a 冲击帧
const k = ez(T, at - 0.17, at, inQuad);             // 抡起 → 砸下
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  drawStampMark(lg, { x: 900, y: 730, kind: 'gold', w: 330, h: 110, rot: 0, seed: 11,
    chars: '达拉崩吧', charAppear: [0, 1, 2, 3].map((i) => (T - at) / 0.04 - i), p: stampP(T, at) });
  drawKing(lg, {
    x: 820, y: 790, s: 1, face: -1, t: T,           // 坐标示意
    pose: { from: 'sealRaise', to: 'sealSlam', k },  // 插值时金印照样拿在手里
    expr: k > 0.5 ? 'joy' : 'confident',
    squash: -0.2 * hit(T, at, 0.05),                 // 落地挤压
    crown: { pop: 20 * hit(T, at, 0.1) },            // 王冠被震起
  });
});
ctx.fx.flash = Math.max(ctx.fx.flash || 0, 0.7 * hit(T, at, 0.06));
```

### 5.3 王冠飞出与落回（E08 / E09）：off + drawKingCrown + 交接 drawCrown

```js
import { drawKing, drawKingCrown } from '../rigs/king.js';
import { drawCrown } from '../props/royal.js';

const KO = { x: 1580, y: 660, s: 1, face: -1, t: T, pose: 'faint', legsUp: 1, expr: 'faint', stars: 1 };
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const a = drawKing(lg, { ...KO, crown: { off: true } });   // 身体；锚点照样返回 crownBase / crownRot / crownS
  if (T < 176.45) { drawKingCrown(lg, KO); return; }          // 交接前：与头上逐像素一致
  // 交接后：从头上那一帧的位置角度出发，在世界里飞出画面上沿
  const u = T - 176.45;
  drawCrown(lg, { x: a.crownBase[0] + 60 * u, y: a.crownBase[1] - 1400 * u, s: a.crownS,
    rot: a.crownRot + 9 * u, spin: -1 * T * 8, F: 1, t: T, glint: 0.6 });
});
```

E09 落回同理：先算好落点 `a = drawKing(...)` 返回的 `crownBase/crownRot/crownS`，用 `drawCrown` 从画面上沿落到这个点，落定那一帧切回头上王冠（`crown` 正常画），再用 `crown.squash` 0.3→0 回弹。

### 5.4 公主：阳台名签放在栏杆前（O01）+ 跳舞转身 + 辫子拖尾

```js
import { drawPrincess } from '../rigs/princess.js';

const P = { x: 1010, y: 590, s: 0.26, face: 1, t: T, pose: 'dance', expr: 'laugh',
            turn: ez(T, 186.2, 187.6), braid: { spin: 2 } };
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => { applyCam(lg, c, 1); drawPrincess(lg, P); });   // 身体（不传 nameTag）
// …… 栏杆（castle.js 的分层由布景决定）……
ctx.layer(g, { shadow: 6 }, (lg) => {                                                            // 名签单独一层，压在栏杆前
  applyCam(lg, c, 1);
  drawPrincess(lg, { ...P, nameTag: '米娅', only: 'nameTag' });
});
```

### 5.5 公主骑马后座 + trail 时间回溯采样（E03）

```js
import { drawHorse } from '../rigs/horse.js';
import { drawPrincess } from '../rigs/princess.js';

const pos = (tt) => horsePath(tt);                 // 镜头自己的马位置函数（纯函数）
const p0 = pos(T);
const trail = Array.from({ length: 14 }, (_, k) => { const p = pos(T - k * 0.035); return [p[0] - p0[0], p[1] - p0[1]]; });
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const h = drawHorse(lg, { x: p0[0], y: p0[1], s: 1, face: -1, t: T, pose: 'gallop' });   // 马的参数见 horse 文档
  drawPrincess(lg, { x: h.saddleBack[0], y: h.saddleBack[1], s: 1, face: -1, t: T,
    pose: 'ridePillion', rot: h.saddleRot, expr: 'loving', braid: { trail, vel: [-900, 0] } });
  // 再画骑手 drawHero（见 hero / ride 模型图）
});
```

### 5.6 远景 / 景深与道具翻折（b15 阳台）

```js
ctx.layer(g, { shadow: 4, texture: 0.25, blur: 3 }, (lg) => {        // 塔顶装饰在中景，略虚
  applyCam(lg, c, 0.85);
  [[700, 260, 900, 270], [1020, 270, 1220, 262]].forEach(([x0, y0, x1, y1], i) =>
    drawGarland(lg, { kind: i ? 'bunting' : 'garland', x0, y0, x1, y1, s: 0.5, t: T, seed: 3 + i,
      fold: ez(T, 176.95 + i * 0.06, 177.3 + i * 0.06) }));
});
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  drawKing(lg, { x: 1040, y: 590, s: 0.26, face: -1, t: T, pose: 'raiseScepter', expr: 'proud', festive: true, bandage: true, detail: 1 });
});
```

---

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际实现 |
|---|---|---|
| king.js 导出 | `drawKing`、`drawKingCrown`、`KING_POSES`、`KING_EXPRS` | 另外导出王室木偶工具（`FACE`、`drawFace`、`ik2` 等，见 1.1），只供 rig 复用 |
| 国王锚点 | 统一“脚底中心” | `sit/slump/faint/seated` = 屁股落座点；`peek` = 裁切线中点 |
| 国王 `crown` | `tilt/slip/pop/squash/spin/off` | 另有 `glint`（主宝石闪光）、`wraps`（勒痕开关） |
| 国王新增参数 | — | `seated`、`stars`、`look`、`blink`、`talk`、`sweat`、`peekCut`、`peekHands`、`tiaraGlint`、`joints`、`detail`、`keepColor` |
| 国王返回 | `head, mouth, crownTop, handR, handL, ear` | 另有 `crownBase, crownRot, crownS, neck, belly, eyes, sealBase?, scepterTip?, tiara?, item?`（`crownRot/crownS` 为本轮收尾新增） |
| `holding` 默认 | null | 不传时按动作自带（`wave`→手帕等，见 3.1）；传 `null` 才是空手 |
| 公主新增参数 | `tiara, veil, braid{trail,vel,wind}, hairpin, sign, nameTag, blush` | 另有 `braid.spin`、`item`、`pour`、`turn`、`rot`（本轮新增）、`tiaraGlint`、`only:'nameTag'`、`look/blink/talk/sweat`；`nameTag` 可传 `{text, size}` |
| `hairpin` | “手里的发卡” | 只是 `item:'hairpin'` 的简写；`pickLock/stepOut` 本来就拿发卡 |
| 水壶 | 未列 | `princess.js` 导出 `drawWateringCan`（不在 royal.js） |
| royal.js | 9 个绘制函数 | 另导出 `stampP` 与工具（`Xf`、`piece` 等）；各函数参数比表里多（`drawSeal` 的 `squash/inked/shadow/glint`，`drawBell` 的 `clapper`，`drawCradle` 的 `part/rock/hood`，`drawLantern` 的 `swing`，`drawCrown/drawTiara` 的 `rot/glint/mono`） |
| 比例 | 国王 220 + 王冠 45；公主 250 | 国王头顶 224、王冠尖 275；公主发顶约 262、小皇冠尖约 289 |
| 插值姿态的离散项 | “关节角线性插值” | 手形、分层、默认手持物、公主坐姿 / 剧场偶开关按 `k<0.5` 取一侧（本轮修好：插值时默认手持物不再消失） |

---

## 7. 已知限制与注意事项

- **性能**：`drawKing` / `drawPrincess` 每次几百个路径填充，s≥1 特写没问题；同屏 10 个以上（远景人群、联系表）请给 `detail: 0`。本组函数不开图层，投影、纸纹请按图层给（一个角色一层即可）。
- **插值离散项**：`{from,to,k}` 时手形、`layL/layR`、`legLay`、默认手持物在 `k=0.5` 一跳。两端手持物不同（如 `idle`→`raiseScepter`）而又不想在中途冒出来时，显式传 `holding` / `item`。
- **`seated` 与站姿动作**：任何上身动作都能叠 `seated`，但 `pace`、`hop`、`leap` 这类腿部动作叠上会被拉回坐姿腿。
- **会穿帮的组合**：`wrapped` 与举手类动作（`hop`、`raiseScepter`）一起用时手臂被收回身侧（设计如此，裹住了）；`faint + legsUp + wrapped`（b14 176.40）可用：纸卷画在躯干坐标里跟着躺下，但翘起的腿会被纸卷盖住（实测 `wrapped` 0.6 / 1 都看不见腿，读作“裹成一卷”）；要让“两腿朝天”可见，就把两拍错开（先晕倒翘腿、纸卷后到，或纸卷先到再弹开），别在同一帧同时给满；`beardFlip > 0.53` 时胡子盖在王冠前沿上，此时 `crown.off + drawKingCrown` 分层会把王冠画到胡子上面。
- **剪影**：国王的金印（`drawSeal` 不支持单色）、公主的水壶与名签在 `silhouette` 下仍是彩色；国王手里的权杖、小皇冠一律变黑（`keepColor` 管不到）。
- **peek** 只支持 `expr / crown（不含 wraps）/ joints.head / look / blink / squash / alpha / detail / peekCut / peekHands`；不画身体、不支持剪影与 `rod`。
- **`rot`（公主）**：整体旋转，辫子的“重力方向”跟着身体转，适合马背俯仰这类小角度（±15°）；大角度翻滚请改用世界坐标里 `g.rotate` 并接受辫子一起转。
- **`only:'nameTag'`**：只画名签，不画身体；身体那次调用别再传 `nameTag`，否则栏杆后面还会有一张（被前面那张盖住，但投影会多一层）。名签不随 `silhouette` 变黑。
- **`turn`** 的辫子外甩是自动加的；`turn` 停在 0.25 / 0.75 附近时人物极窄（侧面纸片），只适合过渡帧。
- **金印尺寸**：`drawSeal` s=1 高约 185，比国王（220）略矮；国王 `holding:'seal'` 时手里那只已按国王比例摆好，不要再额外缩放。
- **红灯笼**：CASTLE 布景（`castle.js`）阳台右角自带一盏灯笼（有自己的点亮参数）；b02 全景里不要再在同一位置叠画 `drawLantern`，`drawLantern` 用于特写或单独的灯笼层。
- **确定性**：本组没有 `Math.random / Date.now` 与跨帧状态；`trail` 需要镜头用自己的位置函数在 `T − k·0.035` 回溯采样，不要缓存上一帧。

---

## 8. 模型图清单

| 模型图源码 | 内容 | 最终 PNG |
|---|---|---|
| `src/sheets/king.js` | [0,2) 动作全表；[2,4) 表情全表；[4,6) 王冠五态与特殊状态（puff 气球线、dangle、faint+legsUp、wrapped、beardFlip、peek、CU-K、s=0.26）；[6,8) 动态（连蹦 + 王冠飞起、慌跑、金印插值砸下、拍手 / 挥帕 / 擦泪 / 啃指甲、K2 盖眼、王冠 off + drawKingCrown + 交接 drawCrown 对位校验、bow 王冠滚出） | `out/review/sheets/king/final_t*.png` |
| `src/sheets/princess.js` | [0,2) 动作全表（含 face −1）；[2,4) 表情全表；[4,6) 验收页（辫子四种拖尾、caged / pickLock、bride+veil、s=0.26 阳台 + 名签 only、ridePillion、剧场偶、剪影、水壶、插值保留手持物 + rot 马背俯仰）；[6,8) 动态（来回奔跑 trail、dance+turn、举牌敲笼、stepOut / 摇头 / 浇花 / 捂脸） | `out/review/sheets/princess/final_t*.png` |
| `src/sheets/royal.js` | [0,2) 王冠 / 小皇冠 / 金印 / 权杖 / 钟 / 灯笼 / 印迹四种与砸下过程；[2,4) 花环三种 × fold、翻折循环、摇篮 rise 与前后分层、金箔扫光 | `out/review/sheets/royal/final_t*.png` |

出图命令：

```bash
node tools/render.mjs stills --sheet king --times 0.5,2.5,4.5,6.3 --outdir out/review/sheets/king --prefix final_
node tools/render.mjs stills --sheet princess --times 0.5,2.5,4.5,6.5 --outdir out/review/sheets/princess --prefix final_
node tools/render.mjs stills --sheet royal --times 0.5,2.5 --outdir out/review/sheets/royal --prefix final_
```
