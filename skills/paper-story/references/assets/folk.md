# 群众与孩子（folk）API

> 源码：`src/rigs/folk.js`；模型图：`src/sheets/folk.js`；规格：`docs/assets.md` 第 6 节；分镜：`docs/storyboard.md`（b02 b03 b04 b05 b06 b07 b08 b14 b15 b16 b17）。
> 本文的参数名、默认值、枚举都按源码逐项核对过。与 assets.md 不一致的地方集中列在第 6 节。

## 1. 模块与导出一览

| 名称 | 类型 | 一句话用途 |
|---|---|---|
| `drawCitizen(g, o)` | 函数 → 锚点对象 | 豆形市民（12 变体，可叠 courtier / villager / grandma），群演主力 |
| `drawGuard(g, o)` | 函数 → 锚点对象 | 卫兵：熊皮高帽（busby）+ 带小旗的长矛 |
| `drawScribe(g, o)` | 函数 → 锚点对象 | 书记官：眼镜 + 鹅毛笔 + 小讲台 + 纸卷塔 |
| `drawHerald(g, o)` | 函数 → 锚点对象 | 传令官：高羽毛帽 + 挂小旗的长号 + 告示卷轴 |
| `drawChild(g, o)` | 函数 → 锚点对象 | 孩子王浩然，四个成长阶段 |
| `drawFolkHat(g, o)` | 函数 | 单独画一顶帽子（飞帽落地、交给镜头接管） |
| `drawAppleBasket(g, o)` | 函数 | 单独画苹果篮（flee 掉篮落地后交给镜头接管） |
| `folkCrowd(n, o)` | 函数 → 成员数组 | 生成一排群演参数：站位、变体轮换、相位、seed |
| `drawCrowd(g, members, common)` | 函数 → 锚点数组 | 批量画群演，按 y 从后往前画（前后遮挡） |
| `folkStagger(T, t0, i, o)` | 函数 → 0..1 | 错峰进度：第 i 个成员晚 i·step 秒开始 |
| `FOLK_VARIANTS` | 数组（12 项） | 市民变体表（见 4.1） |
| `FOLK_PASTELS` | 对象 | 5 种粉彩身体色 `rose sky mint lilac butter` |
| `FOLK_EXPRS` | 对象 | 表情表（所有 folk 木偶共用，见 4.7） |
| `FOLK_HEIGHTS`（别名 `FOLK_HEIGHT`） | 对象 | 各角色 s=1 的标称高度（见 2.1） |
| `CITIZEN_POSES` `GUARD_POSES_LIST` `SCRIBE_POSES_LIST` `HERALD_POSES_LIST` `CHILD_POSES_LIST` | 字符串数组 | 各角色的合法 pose 名 |
| `CHILD_STAGES` | 对象 | 孩子四阶段尺寸 `{H, hr, L, bw, curl, len}` |

```js
import {
  drawCitizen, drawGuard, drawScribe, drawHerald, drawChild, drawFolkHat, drawAppleBasket,
  folkCrowd, drawCrowd, folkStagger, FOLK_VARIANTS, FOLK_HEIGHTS,
} from '../rigs/folk.js';
```

## 2. 坐标、尺寸与锚点约定

- **锚点**：`(x, y)` = **脚底中心**，调用方已 `applyCam`（世界坐标）。木偶从脚底向上画。
- **s**：整体缩放。PLAZA / THRONE / 旅途 / 洞穴一律 s=1；CASTLE 外景阳台、城墙 s=0.26，城下地面带 s=0.30（storyboard 3.2）。
- **face**：`1` 朝右，`-1` 朝左。只有严格等于 `-1` 才镜像（整体 scaleX）；镜像后切口亮边仍在屏幕上方、暗部与投影仍在右下。
- **t**：秒，驱动呼吸、眨眼、循环动作、汗珠、旗子、头发摆动；传 `T`。纯函数，无跨帧状态。
- **关节角**（`joints` / `jointsSet`，单位度）：0 = 竖直向下，90 = 水平朝前（朝 face 方向），180 = 竖直向上，−90 = 朝后。
- 函数内部 `save/restore`；**不调 `ctx.layer / ctx.mask`**，投影、纸纹、虚化由镜头的图层给（见第 5 节）。

### 2.1 s = 1 的高度与 `FOLK_HEIGHTS`

| 角色 | 头顶（不含帽） | 最高点（返回的 `top`：含帽 / 王冠 / 呆毛） | `FOLK_HEIGHTS` |
|---|---|---|---|
| 市民 | 150–186（各变体的 `H`，grandma ×0.92） | 154–207 | `citizen[variant]` = 该变体 `H` |
| 卫兵 | 156 | 201（高帽）/ 158（`hat:false`） | `guard: 200` |
| 书记官 | 174 | 178.5（小圆帽）/ 174 | `scribe: 180` |
| 传令官 | 158 | 193（羽毛帽羽尖）/ 160（`hat:false`） | `herald: 185` |
| 孩子 | baby 73 / toddler 109 / kid 159 / older 199 | 87 / 127 / 182 / 227 | `child: {baby:70, toddler:110, kid:160, older:200}` |

**`FOLK_HEIGHTS` 的含义**：assets.md 0.3 / storyboard 3.2 规定的**标称身高**（s=1 世界 px），用来排版、算机位、估气泡位置；市民是数组，按 variant 取（不含帽子）。`FOLK_HEIGHT` 是同一个对象的别名。要贴东西到真实头顶，用返回的 `top` / `head` 锚点。参照：勇者 260，市民约为勇者的 0.58–0.72。

### 2.2 返回的锚点对象（所有木偶通用）

坐标都在**调用方坐标系**（与传入的 x, y 同一空间，已含 s、face、tilt、squash、bob）。

| 字段 | 含义 |
|---|---|
| `head` | 头心 |
| `neck` | 脖子根（身体顶） |
| `mouth` | 嘴（气泡、喷气、捂嘴落点；jaw 下掉时跟着下移） |
| `eye` | 前眼 |
| `top` | 头顶最高点（含帽子 / 王冠 / 呆毛的估算），挂气泡、名签 |
| `handF` / `handB` | 前手 / 后手（离镜头近 / 远）。`handR` / `handL` 是它们的别名（兼容 assets.md 签名，不代表解剖学左右） |
| `hand` | 主手：默认前手（raiseHand / wave / tossHat / yank / slapNotice 都是前手举起） |
| `feet` | 脚底接地点 |
| `hip` | 髋心 |
| `scale` / `face` | 回传 s 与 face |
| `hat` | `[x, y, rot]`：帽冠点 + 旋转（弧度，木偶图形空间角）。帽子戴着或正在飞时才有 |
| 角色特有 | 见第 3 节各函数“返回” |

## 3. 函数详解

### 3.0 所有木偶共用的参数（drawCitizen / drawGuard / drawScribe / drawHerald / drawChild）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x, y` | 0, 0 | 脚底中心 |
| `s` | 1 | 缩放 |
| `face` | 1 | 1 朝右 / −1 朝左 |
| `t` | 0 | 秒（传 T） |
| `pose` | 市民 `idle` / 卫兵 `attention` / 书记官 `idle` / 传令官 `idle` / 孩子 `stand` | 名字，或 `{from, to, k}`：数值关节线性插值；非数值项（手持道具、号的位置、矛在哪只手、pose 自带表情）在 **k=0.5 切换**；k 自动夹到 0..1。**未知名字静默回退到默认姿态，不报错** |
| `expr` | 由 pose 决定 | `FOLK_EXPRS` 的名字，或对象 `{eyes, mouth, brows, blush, sweat, cheeks, pupil}`（叠在 normal 上） |
| `phase` | 0 | 循环相位（圈）；群演错开用 |
| `speed` | 1 | 循环动作速度倍率 |
| `cycle` | — | 直接给循环进度（圈），给了就不再用 t·频率（例如按位移驱动步态） |
| `p` | — | 一次性动作进度 0..1（crossOut、quillSnap、slapNotice、hop、yank）；不给则按 t 自动循环 |
| `joints` | — | 关节增量，叠在 pose 之后，如 `{lean: 8, head: -5}` |
| `jointsSet` | — | 关节绝对覆盖 |
| `jitter` | 1 | 个体差异（按 seed 给手臂、身体、头几度稳定偏差）；0 关闭。卫兵内部再 ×0.5，书记官 / 传令官 / 孩子 ×0.4 |
| `seed` | 各角色固定 | 个体种子（jitter、眨眼时刻、纸边抖动、汗珠节奏） |
| `alpha` | 1 | 整体透明度 |
| `detail` | 1 | 0 = 远景简化版（见第 7 节） |
| `silhouette` | false | 剪影：全部填 `silColor`，不画五官 |
| `silColor` | `PAL.ink` | 剪影色 |
| `keepColor` | `[]` | 剪影里保留原色的部件：`hat` `hair` `head` `body` `armF` `armB` `legF` `legB` `item` `scarf` `rod` |
| `rod` | false | 纸剧场木杆（从髋部一直伸到画面下方） |
| `squash` | 0 | 挤压拉伸（>0 拉长、<0 压扁，保面积，脚底为锚） |
| `sweat` | 由 pose / 表情决定 | 汗珠量 0..1，取 pose、表情与本值的最大值；传 `0` 强制不出汗 |
| `noBlink` | false | 关眨眼（定帧特写用） |

**关节名**（`joints` / `jointsSet`）：`dx`（身体前后平移 px）`bob`（整体上移 px）`gy`（整体下移 px）`tilt` `tiltX`（整体绕脚底转，度 / 枢轴 x）`wob` `lean`（身体前倾）`head`（点头）`headX` `headY` `turn`（0..1 头转到背面）`look` `lookY`（眼珠 −1..1）`jaw`（1 = 下巴下掉 30px）`sq`（挤压）`shF` `elF` `shB` `elB`（前 / 后手 肩 / 肘）`hipF` `knF` `hipB` `knB`（腿）`strF` `strB`（手臂拉长倍数）`shUpF` `shUpB`（耸肩 px）`armsFront`（1 = 后手画到身前）`hairBack`（0..1 头发被风吹向后）`plant`（1 = 脚贴地）`cheeks`（鼓腮）`sweat` `hatOff`（>0.5 帽子被掀）。

### 3.1 `drawCitizen(g, o)` —— 豆形市民

| 参数 | 默认值 | 说明 |
|---|---|---|
| `variant` | 0 | 0–11（自动取模），见 4.1 |
| `courtier` | false | 朝臣：白色褶领 + 金色斜饰带 + 金色下摆（王座厅群臣） |
| `villager` | false | 村民：帽子换成草帽 `straw` + 绿色小领巾 |
| `grandma` | false | 老奶奶：头巾 + 灰发髻 + 披肩 + 拐杖（后手）+ 驼背 7°，身高 ×0.92，默认表情 smile |
| `hat` | 变体自带 | `false` = 不戴帽 / 帽子已不在（兜帽变体画成垂在脖子后的兜帽） |
| `hatFly` | — | 0..1 帽子飞行进度；≥1 = 帽子已飞走（不画）；0 或不给 = 戴着。兜帽不会飞：`hatFly>0` 时被吹落、垂在脖子后 |
| `hatMode` | `'blow'` | `'blow'` 向后吹走（0.82 起淡出）/ `'toss'` 向上抛起再落回 |
| `dropItem` | — | 苹果篮：`true` = 前手提篮；数字 0..1 = 掉落进度（0 在手里 → 0.6 落地 → 1 苹果滚出）；≥0.999 不再画（交给 `drawAppleBasket`） |
| `peek` | 1 | hideBarrel：0 全缩进桶里 → 1 露出眼睛和两只扒桶沿的手（>0.5 惊恐脸，否则眯眼） |
| `pole` | — | carryOverhead：`false` = 不画竿子，只双手上举 |

**返回**：通用锚点 + `hat`、`carry`（carryOverhead 竿顶的金球，横幅端点挂这里）、`item`（掉落中的篮底中心）。

### 3.2 `drawGuard(g, o)` —— 卫兵

| 参数 | 默认值 | 说明 |
|---|---|---|
| `variant` | 0 | 0–2（取模）：0 浅肤 + 卷八字胡；1 小麦肤、无胡；2 深肤 + 海象胡 + 深色头发 |
| `hat` | true | `false` = 不戴高帽（L08 之后的王座厅） |
| `hatFly` | — | 0..1 高帽飞行；pose 为 tossHat 时自动用 `'toss'`（抛起落回） |
| `hatMode` | `'blow'` | 同市民 |
| `spearAngle` | 0 | 长矛额外倾角（度，叠在 pose 的矛角上；正 = 矛尖朝前倒）。矛长 250，握点自动让矛尾拄地 |

**返回**：通用锚点 + `spearTip`（矛尖；pounce 时无矛则没有）、`note`（嘴前方，口哨音符发射点，任何姿态都返回）、`hat`。

### 3.3 `drawScribe(g, o)` —— 书记官

| 参数 | 默认值 | 说明 |
|---|---|---|
| `desk` | false | 身前的小讲台（write 时手落在台面上写） |
| `tower` | — | 纸卷塔 0..1：0 直立轻晃 → 0.5 危险倾斜 → 1 倒塌散落一地（≥0.9 背架消失）。**传了 tower 或 pose 为 carryTower 就画塔**（deflate + `tower:1` = 塔倒了人瘪了） |
| `towerN` | 9 | 纸卷数 |
| `hat` | true | `false` = 不戴小圆帽 |

**返回**：通用锚点 + `quill`（笔尖，写字 / 划叉的墨迹点）、`roll` / `rollEnd`（手里圣旨卷的中心 / 右端：unrollDecree、backAway、run）、`towerTop`（塔顶）。

### 3.4 `drawHerald(g, o)` —— 传令官

| 参数 | 默认值 | 说明 |
|---|---|---|
| `bend` | 由 pose 决定 | 0..1 号身被吹弯（覆盖 pose 值；bentHorn = 1） |
| `scrollLen` | 0 | unrollScroll：卷轴杆下垂的纸面长度 px（0 = 只有卷轴杆） |
| `hat` | true | `false` = 不戴羽毛帽 |

**返回**：通用锚点 + `bell`（号口中心）、`bellDir`（号口朝向，弧度，调用方坐标）、`slap`（slapNotice 时 = 拍告示的手）、`scrollTop`（卷轴杆中心）、`scrollRect`（`[x0, y0, x1, y1]`，scrollLen>0 时纸面可写字区域）。

### 3.5 `drawChild(g, o)` —— 孩子王浩然

| 参数 | 默认值 | 说明 |
|---|---|---|
| `stage` | `'toddler'` | `'baby'` 70（襁褓，无腿）/ `'toddler'` 110（光腿）/ `'kid'` 160 / `'older'` 200；非法值按 toddler |
| `shortScarf` | false | 短红围巾（O06 起，b16 197.10 系上） |
| `crown` | true | `false` = 不戴小王冠 |
| `curl` | 随 stage | 呆毛卷曲度 0..1（默认 0.25 / 0.45 / 0.7 / 1.0），呆毛长度也随 stage 变长 |

**返回**：通用锚点 + `ahoge`（呆毛尖，冒火花「叮」用）。头发栗色带一缕金（固定）。

### 3.6 `drawFolkHat(g, o)` —— 单独的帽子

| 参数 | 默认值 | 说明 |
|---|---|---|
| `type` | — | 帽型（见 4.6） |
| `variant` | 0 | 不给 type 时取该市民变体的帽子（可配 `villager` / `grandma`）；该变体没帽子则什么都不画 |
| `guard` | false | 不给 type 时画卫兵高帽 |
| `x, y` | 0, 0 | 帽冠点（戴在头上时与头顶的接触点，= 木偶返回的 `hat[0], hat[1]`） |
| `s` | 1 | 缩放（接管木偶的帽子时传木偶的 s） |
| `rot` | 0 | 旋转（弧度）。接管 face=1 木偶的帽子传 `hat[2]`；face=−1 传 `-hat[2]` |
| `face` | 1 | 镜像 |
| `colors` | 变体 / 卫兵色 | 覆盖颜色：`main` `second`（系带、帽带）`plume`（busby 帽缨）`feather`（plumeCap 羽毛）`frill`（bonnet 花边） |
| `hr` | 33 | 头半径（帽子尺寸基准；木偶的 hr 约 32–34） |
| `t` `detail` `seed` `silhouette` `silColor` | 0, 1, 7, false, ink | 同木偶 |
| `flying` | true | true = 脱离头部的画法（不画下巴系带） |

### 3.7 `drawAppleBasket(g, o)`

`{x = 0, y = 0, s = 1, rot = 0, spill = 0, detail = 1, t = 0}`：(x, y) = 篮底中心；`spill` 0..1 倾倒程度（苹果滚到左边地上）；`rot` 弧度。

### 3.8 群演批量

```js
folkStagger(T, t0, i, { step = 0.05, dur = 0.3, ease = outCubic, jitter = 0, seed = 7 })   // → 0..1
folkCrowd(n, { x0 = 0, x1 = 600, y = 0, s = 1, face = 1, faceMix = 0, variants = null, start = 0,
               xJit = 0.25, yJit = 0, seed = 1, phaseStep = 0.137 })                      // → [{i, x, y, s, face, variant, phase, seed}]
drawCrowd(g, members, common)                                                             // → 锚点数组（下标 = member.i）
```

- `folkStagger`：第 i 个成员在 `t0 + i·step (± jitter 秒)` 起，`dur` 秒内按 `ease` 从 0 到 1。`ease` 可传 `(x) => outBack(x, 1.4)` 做过冲（插值 k 会被夹到 1，过冲段停在终点）。
- `folkCrowd`：x 在 x0..x1 均匀分布再抖 `±xJit×间距`；y 抖 `±yJit` px；`faceMix` = 反向比例；变体按 `(start + i) % 12` 轮换（相邻不同色），或按 `variants` 序列循环取；`phase` 各不相同（`fract(i·phaseStep + 随机·0.3)`）；`seed = seed·31 + i·7`。返回值可直接展开进 `drawCitizen` 的 o。
- `drawCrowd`：成员按 `y` 从小到大（远 → 近）画，y 相同保持数组顺序；每个成员的参数 = `{...common(去掉 each), ...member, ...common.each(member)}`；成员可带 `kind: 'guard' | 'scribe' | 'herald' | 'child'`（默认市民）。返回数组下标是 `member.i`（没有 i 时按绘制顺序）。

## 4. 枚举全表

### 4.1 `FOLK_VARIANTS`（市民 12 变体，s=1）

| # | key | 名称 | 身体色 | 头顶 H | 帽子（`hat`） | 发型 | 其它特征 | 肤色 |
|---|---|---|---|---|---|---|---|---|
| 0 | beret | 贝雷帽高个 | rose 粉 | 186 | beret 深红贝雷帽 | tuft 栗色短发 + 翘毛 | 卷八字胡、腰带、微胖 | 浅 |
| 1 | bonnet | 软帽小姑娘 | sky 天蓝 | 150 | bonnet 奶白软帽（花边 + 紫红系带蝴蝶结，盖耳） | curls 金色卷发 | 睫毛、白围裙、无鼻 | 浅 |
| 2 | cap | 鸭舌帽杂货商 | mint 薄荷 | 174 | cap 木色鸭舌帽 | short 深棕短发 | 大肚、围裙 + 纽扣 | 小麦 |
| 3 | bun | 盘发阿姨 | lilac 淡紫 | 158 | 无（发髻） | bun 灰色发髻 | 睫毛、披肩、下摆外扩 | 浅 |
| 4 | hood | 尖兜帽青年 | butter 奶黄 | 182 | hood 蓝灰尖兜帽（不会飞，吹落后垂在脖子后） | bob 栗色 | 腰带、瘦高 | 浅 |
| 5 | bow | 蝴蝶结女孩 | rose 粉 | 150 | bow 大红蝴蝶结 | pigtails 双马尾（土棕） | 睫毛、白圆领、无鼻 | 小麦 |
| 6 | tophat | 高帽绅士 | sky 天蓝 | 178 | tall 黑灰高礼帽 + 深红帽带 | short 黑发 | 一字胡、马甲 | 浅 |
| 7 | kerchief | 头巾男孩 | mint 薄荷 | 150 | kerchief 橙红头巾 | spiky 刺头（土棕） | 衣服补丁、无鼻 | 小麦 |
| 8 | curly | 卷发大叔 | lilac 淡紫 | 184 | 无 | afro 黑色爆炸头 | 络腮胡、大肚、腰带 | 深 |
| 9 | wreath | 花环姑娘 | butter 奶黄 | 156 | wreath 花环 | braids 金色麻花辫 | 睫毛、围裙、无鼻 | 浅 |
| 10 | bald | 秃顶老爷爷 | sky 天蓝 | 170 | 无 | bald 秃顶 + 白鬓 | 海象胡、马甲、微胖 | 浅 |
| 11 | baker | 面包师 | butter 奶黄 | 176 | toque 白色厨师高帽 | short 栗色 | 围裙、胖 | 小麦 |

叠加：`courtier`（褶领 + 金饰带）、`villager`（草帽替换原帽 + 绿领巾）、`grandma`（头巾替换原帽、灰发髻、披肩、拐杖、驼背）。b08 老奶奶 = 任意变体 + `grandma:true`（模型图用 3 / 9）。

### 4.2 市民 pose（`CITIZEN_POSES`，19 个）

| pose | 说明 | 分镜 |
|---|---|---|
| `idle`（默认） | 呼吸 + 眼珠慢慢乱看 | 全片群演待机（b03 b07 b14 b15 b16 O02） |
| `sweep` | 扫地（自带扫帚，循环） | assets 列出；分镜未点名（b02 和平晨景 / b14 春天城下可用） |
| `push` | 推苹果车走（自带车，循环步态） | 同上 |
| `flee` | 奔跑逃命（惊恐 + 汗），朝 face 方向跑：向左逃传 `face:-1`；配 `dropItem` | b02 L03 14.30 城下 6 人向左逃、一人掉苹果篮 |
| `lean` | 前倾凑近看（curious） | b03 L06 20.40 七人凑近告示 |
| `stepBack` | 齐退一步（dx −16，惊恐 + 汗） | b03 20.95 全体后退 |
| `turnHead` | 头转到背后看（surprise） | b03 L07 23.10 人群齐刷刷转头 |
| `blown` | 被冲击波吹：后仰、头发向后、帽子被掀（配 `hatFly` 让帽子飞走） | b03 L08 24.25 |
| `cheer` | 双手上举欢呼（循环弹跳） | b04 L13、b05 56.89 全场欢呼、b15 |
| `raiseHand` | 前手高举（举到头侧，不挡脸），`hand` 锚点放光点 | b07 V03 78.14 |
| `jawDrop` | 下巴掉 30px（jawdrop） | b08 V10 容器主人、b17 O07 全场 |
| `faintBack` | 直挺挺向后倒地（tilt −88°） | b08 93.70 大宝箱主人 |
| `hugPot` | 死死抱住陶罐（自带罐，grumpy） | b08 92.45 老奶奶（配 `grandma:true`） |
| `carryOverhead` | 双手举竿舞龙（`carry` = 竿顶；`pole:false` 只举手） | b15 179.60 舞龙、184.30 上抛 |
| `wave` | 挥手 | b14 165.6 城墙上的市民、b02 L01 回应公主 |
| `clap` | 鼓掌 | b04 / b05 王座厅朝臣（`courtier:true`） |
| `hideBarrel` | 缩进自带木桶（`peek`） | b02 L03 14.90 一人躲进木桶 |
| `pounce` | 腾空前扑（bob 30，不贴地） | b06 57.60 所有人扑上去捂嘴 |
| `deflate` | 瘪下去、松口气（relieved） | b16 196.80 |

### 4.3 卫兵 pose（`GUARD_POSES_LIST`，11 个）

| pose | 说明 | 分镜 |
|---|---|---|
| `attention`（默认） | 立正持矛（stern） | b04 / b05 王座厅站岗 |
| `idle` | 放松站立（normal） | 待机 |
| `cheer` | 举矛欢呼 | b04 L13 34.00（`hat:false`） |
| `whistle` | 扭头吹口哨，`note` = 音符发射点 | b03 21.30 |
| `lean` | 前倾 12°（curious；集体倾 8° 用 `joints: {lean: -4}` 调） | b04 L16 40.60 |
| `stepBack` | 后退一步、矛斜（scared） | b03 20.95（小个子躲在卫兵身后） |
| `blown` | 被吹、帽子被掀（配 `hatFly`） | b02 L03 14.90 高帽被掀飞、b03 24.25 |
| `tossHat` | 抛帽（配 `hatFly` 0..1，自动 'toss' 抛起落回；矛换到后手） | b05 55.75 卫兵抛帽 |
| `raiseHand` | **收尾新增**：持矛的手顺着矛杆举到帽檐高（矛尾仍拄地，从 attention 插值不换手） | b07 V03 78.14 |
| `pounce` | **收尾新增**：腾空前扑，扔掉长矛（不画矛） | b06 57.60 |
| `jawDrop` | **收尾新增**：下巴掉下来，矛照常立着 | b17 O07 全场下巴掉地（如在场） |

### 4.4 书记官 pose（`SCRIBE_POSES_LIST`，11 个）

| pose | 说明 | 分镜 |
|---|---|---|
| `idle`（默认） | 拿着本子和鹅毛笔 | 待机 |
| `write` | 写字（`desk:true` 在讲台上写，否则在本子上） | b04 L16、b05 N1a 41.90 开始记 |
| `crossOut` | 笔走一个大叉（`p`：0–0.45 第一笔、0.45–0.55 提笔换位、0.55–1 第二笔）；墨迹由镜头按 `quill` 锚点画 | b05 N3c 52.90 |
| `quillSnap` | 笔断成两截（`p`：<0.15 完好，之后上半截打转飞走） | b05 N1c 44.40 |
| `run` | 抱着圣旨卷跑 | b05 53.95 从右边跑进来 |
| `unrollDecree` | 两手握卷、后仰准备横向展开（`roll` / `rollEnd` 接圣旨纸面） | b05 54.00 |
| `backAway` | 倒退着走、继续展开（倒放步态） | b05 N4b 54.68 |
| `carryTower` | 背纸卷塔弯腰走（strain + 汗），配 `tower` 0..1 | b16 O05 194.70 |
| `deflate` | 瘪下去（配 `tower:1` 塔倒） | b16 196.80 |
| `pounce` | **收尾新增**：腾空前扑，空着手 | b06 57.60 |
| `jawDrop` | **收尾新增**：下巴掉下来，本子和笔还拿着 | b17 O07 198.05 |

### 4.5 传令官 pose（`HERALD_POSES_LIST`，11 个）

| pose | 说明 | 分镜 |
|---|---|---|
| `idle`（默认） | 号拿在手里垂在身侧 | 待机 |
| `slapNotice` | 抡起来把告示拍上木板（`p`：<0.42 蓄力，0.42–0.58 拍下；`slap` = 拍的手） | b03 L06 20.10 |
| `blow` | 吹号鼓腮，`bell` / `bellDir` 发声波 | b05 55.75、b14 169.00 |
| `bentHorn` | 号被吹弯（bend 1，shock） | b03 L08 24.25 |
| `jawDrop` | 下巴掉下来，号垂下 | b03 L07 23.10 |
| `unrollScroll` | 双手举卷轴杆宣读（`scrollLen` 纸面、`scrollRect` 写字区） | b14 E06 169.74 |
| `kneel` | 单膝跪，号拄地 | 分镜未点名（宣读后行礼） |
| `run` | 举号跑 | 分镜未点名 |
| `pant` | 弯腰喘气、满头汗 | 分镜未点名 |
| `raiseHand` | **收尾新增**：号挂回背后，空手举高 | b07 V03 78.14 |
| `pounce` | **收尾新增**：腾空前扑，号在背后 | b06 57.60 |

### 4.6 孩子 `stage` / pose（`CHILD_POSES_LIST`，8 个）与帽型

| stage | 身高（s=1） | 说明 | 分镜 |
|---|---|---|---|
| `baby` | 70（头顶实测 73） | 襁褓：圆被包 + 粉绑带 + 小金星，无腿 | b16 O03 190.00 摇篮 |
| `toddler` | 110 | 光腿、呆毛开始卷 | b16 O04 191.66 |
| `kid` | 160 | | b16 O04 192.30 |
| `older` | 200 | 呆毛最长最卷，像爸爸 | b16 O04 192.95 起、b17 |

| pose | 说明 | 分镜 |
|---|---|---|
| `stand`（默认） | 站立呼吸 | |
| `popUp` | 双手高举的“弹起”姿态；弹起位移与挤压由镜头给 y 与 `squash` | b16 O03 190.00 |
| `giggle` | 捂嘴咯咯笑、抖 | b16 190.40 |
| `grabScarf` | 两手前伸抓、嚼（chew） | b16 190.60 啃围巾 |
| `hop` | 蹿高（`p`：0–0.25 下蹲、0.25–0.85 腾空 46px、之后落地） | b16 O04 每次长高 |
| `frown` | 抱臂撅嘴 | b16 O05 194.35 |
| `yank` | 双手上举抓签往下拽（`p`：0.5 后拽下，outBack） | b17 O07 197.95 |
| `laugh` | 大笑 | b16 197.10 系上短围巾后 |

帽型（`drawFolkHat` 的 `type`）：`beret` `bonnet` `cap` `hood`（不会飞）`bow` `tall` `kerchief` `wreath` `toque` `straw` `headscarf` `busby`（卫兵）`skullcap`（书记官）`plumeCap`（传令官）`crown`（孩子）。
`hatMode`：`blow` / `toss`。`drawCrowd` 的 `kind`：`citizen`（默认）`guard` `scribe` `herald` `child`。

### 4.7 表情 `FOLK_EXPRS`（29 个）

| expr | 样子 | 哪些 pose 默认用 |
|---|---|---|
| `normal` | 豆豆眼 + 微笑 | 大多数 idle |
| `smile` | 弯眼微笑 | wave、grandma 默认 |
| `happy` | 弯眼咧嘴、腮红加重 | cheer、clap、carryOverhead、卫兵 cheer、传令官 run |
| `laugh` | >< 眼大笑 | tossHat、孩子 popUp / laugh / hop 腾空 |
| `surprise` | 圆眼 + o 嘴 | turnHead |
| `shock` | 圆眼小瞳孔 + O 嘴、眉高挑 | quillSnap、bentHorn |
| `scared` | 圆眼 + 波浪嘴 + 汗 | flee、stepBack、hideBarrel |
| `worried` | 八字眉 + 波浪嘴 | 书记官 run |
| `curious` | 眯眼 + o 嘴 + 挑眉 | lean |
| `hope` | 微笑 + 眉上扬 | raiseHand |
| `determined` | 怒眉 + 张嘴 | pounce、crossOut、slapNotice、yank |
| `stern` | 怒眉 + 一字嘴 | 卫兵 attention |
| `grumpy` | 眯眼 + 撇嘴 | hugPot |
| `blown` | >< 眼 + 张嘴 + 八字眉 | blown |
| `dizzy` | 蚊香眼（随 t 转） | 镜头自用 |
| `faint` | ×× 眼 | faintBack |
| `relieved` | 半闭眼 + o 嘴 | deflate |
| `whistle` | 嘟嘴吹口哨 | 卫兵 whistle |
| `jawdrop` | 圆眼小瞳孔 + O 嘴（随 jaw 拉长） | jawDrop |
| `strain` | >< 眼 + 波浪嘴 + 汗 | carryTower |
| `pant` | 半闭眼 + 吐舌喘 + 汗 | 传令官 pant |
| `puff` | 闭眼鼓腮 | blow |
| `focused` | 吐舌 + 怒眉 | write |
| `proud` | 闭眼微笑 | unrollDecree、backAway、unrollScroll |
| `calm` | 闭眼微笑、平眉 | kneel |
| `pout` | 撅嘴 + 鼓腮 | 孩子 frown |
| `giggle` | 弯眼咧嘴、腮红最重 | 孩子 giggle |
| `chew` | 一张一合地嚼 | 孩子 grabScarf |
| `sleepy` | 闭眼 + o 嘴 | 镜头自用 |

自定义：`expr: { eyes, mouth, brows, blush, sweat, cheeks, pupil }`。eyes：`dot happy squeeze wide squint half closed x spiral`；mouth：`smile grin laugh open o O pant wavy flat frown pout whistle puff tongue chew none`；brows：`normal up high worried angry quirk none`。

## 5. 推荐用法

### 5.1 广场群演链（b03：凑近 → 齐退 → 转头 → 被吹 → 欢呼）

```js
import { cam, applyCam } from '../core/camera.js';
import { outBack, outCubic } from '../core/ease.js';
import { clamp } from '../core/util.js';
import { folkCrowd, drawCrowd, folkStagger } from '../rigs/folk.js';

const LEFT = folkCrowd(4, { x0: 620, x1: 900, y: 860, seed: 3 });            // 左组（storyboard 4.3）
const RIGHT = folkCrowd(3, { x0: 1220, x1: 1500, y: 860, seed: 8, start: 5, face: -1 });
const CROWD = [...LEFT, ...RIGHT.map((m) => ({ ...m, i: m.i + 4 }))];
const BACK = { dx: -16 };                                                  // 退的那一步之后一直保持
function plazaPose(T, i) {
  const st = (t0, step, dur, ease = outCubic) => folkStagger(T, t0, i, { step, dur, ease, jitter: 0.012, seed: 3 });
  const kLean = st(20.40, 0.04, 0.3), kBack = st(20.95, 0.045, 0.22, (x) => outBack(x, 1.4));
  const kTurn = st(23.10, 0.05, 0.25), kBlow = st(24.25, 0.05, 0.2);
  const hatFly = clamp((T - 24.25 - i * 0.05) / 0.9);                     // 帽子挨个飞，之后一直传下去
  if (kBlow > 0) return { pose: { from: 'turnHead', to: 'blown', k: kBlow }, hatFly, joints: BACK };
  if (kTurn > 0) return { pose: { from: 'stepBack', to: 'turnHead', k: kTurn }, joints: { dx: -16 * kTurn } };
  if (kBack > 0) return { pose: { from: 'lean', to: 'stepBack', k: kBack } };
  return { pose: { from: 'idle', to: 'lean', k: kLean } };
}
// draw(g, T, lt, ctx) 里：一层画全部群演（不要每人一层）
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  drawCrowd(lg, CROWD, { t: T, each: (m) => plazaPose(T, m.i) });
});
```
要点：链上每一段的起点 = 上一段的终点（`{from, to}` 首尾相接）；pose 自带的位移（stepBack 的 dx）要保持就用 `joints` 补偿；`hatFly` 一旦开始就一直传，否则帽子会回到头上。

### 5.2 CASTLE 外景远景（b02 L03：s=0.30、detail 0、逃跑掉篮、躲桶、高帽被掀）

```js
const FLEE = folkCrowd(6, { x0: 1150, x1: 1500, y: 1000, s: 0.3, face: -1, seed: 12 });
ctx.layer(g, { shadow: 3, texture: 0.2 }, (lg) => {
  applyCam(lg, c, 1.1);                                                    // 城下 depth 1.1
  drawCrowd(lg, FLEE.map((m) => ({ ...m, x: m.x - (T - 14.3) * 160 })), {   // 位移由镜头给
    t: T, detail: 0, pose: 'flee',
    each: (m) => (m.i === 2 ? { dropItem: clamp((T - 14.5) / 0.6) } : null),
  });
  drawCitizen(lg, { x: 980, y: 1000, s: 0.3, t: T, detail: 0, variant: 11, pose: 'hideBarrel', peek: clamp(1 - (T - 14.9) / 0.3) });
  const ga = drawGuard(lg, { x: 760, y: 1000, s: 0.3, t: T, detail: 0, pose: 'blown', hatFly: clamp((T - 14.9) / 0.8) });
});
```
跑动中的人掉篮：篮子画在木偶自己的坐标里会跟着人走。落地（`dropItem ≥ 0.6`）后在那一刻记下 `a.item` 的世界坐标，之后由镜头用 `drawAppleBasket(lg, {x, y, s: 0.3 * 0.85, spill})` 固定在地上画，并把该成员的 `dropItem` 设为 1（木偶不再画篮子）。

### 5.3 一起举手放光点（b07 V03：市民 + 卫兵 + 传令官错峰 50ms）

```js
import { glow, sparkle, PAL } from '../core/paper.js';
const V03 = [
  ...folkCrowd(6, { x0: 620, x1: 1100, y: 860, seed: 5 }),
  { i: 6, kind: 'guard', x: 1240, y: 860 }, { i: 7, kind: 'herald', x: 1000, y: 870 },
];
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  const A = drawCrowd(lg, V03, {
    t: T,
    each: (m) => ({ pose: { from: m.kind === 'guard' ? 'attention' : 'idle', to: 'raiseHand', k: folkStagger(T, 78.14, m.i, { step: 0.05 }) } }),
  });
  A.forEach((a, i) => {                                                    // hand = 举起的那只手
    const q = clamp((T - 78.3 - i * 0.06) / 0.7); if (q <= 0) return;
    glow(lg, a.hand[0], a.hand[1] - 12 - q * 110, 22, PAL.goldLight, Math.sin(Math.PI * q));
  });
});
```
光点要飞向围巾（别的图层 / 屏幕空间）时，用 `toScreen(c, 1, a.hand[0], a.hand[1])` 换成屏幕坐标。

### 5.4 职业动作的发射点（口哨音符、号的声波、划叉墨迹）

```js
const ga = drawGuard(lg, { x: 1240, y: 860, t: T, pose: 'whistle' });       // 音符从 ga.note 升起
const ha = drawHerald(lg, { x: 980, y: 880, t: T, pose: 'blow' });          // 声波：以 ha.bell 为圆心、朝 ha.bellDir 画弧
for (let k = 0; k < 3; k++) { const w = fract(T * 1.6 + k / 3); lg.beginPath(); lg.arc(ha.bell[0], ha.bell[1], 8 + w * 60, ha.bellDir - 0.55, ha.bellDir + 0.55); lg.stroke(); }
// 划叉墨迹（b05 52.90）：按进度回溯采样 quill 锚点（alpha:0 只算锚点不出图），跳过 0.45–0.55 的提笔段
const p = clamp((T - 52.9) / 0.8), ink = [];
for (let k = 0; k <= 24; k++) { const pk = (k / 24) * p; if (pk > 0.45 && pk < 0.55) { ink.push(null); continue; } ink.push(drawScribe(lg, { x: 1150, y: 880, t: T, pose: 'crossOut', p: pk, alpha: 0 }).quill); }
lg.beginPath(); let pen = false;
for (const q of ink) { if (!q) { pen = false; continue; } if (pen) lg.lineTo(q[0], q[1]); else lg.moveTo(q[0], q[1]); pen = true; }
lg.lineWidth = 3; lg.strokeStyle = PAL.ink; lg.stroke();
drawScribe(lg, { x: 1150, y: 880, t: T, pose: 'crossOut', p });
```

### 5.5 孩子长高（b16 O04）与前景虚化

```js
const STAGES = [['toddler', 191.66], ['kid', 192.30], ['older', 192.95]];
const idx = STAGES.findLastIndex(([, t0]) => T >= t0);
const [stage, t0] = STAGES[Math.max(0, idx)];
const k = clamp((T - t0) / 0.35);
drawChild(lg, { x: 780, y: 880, t: T, stage, pose: 'hop', p: 0.25 + 0.6 * k, squash: 0.15 * Math.sin(Math.PI * k) });
// 前景近处的人（depth 1.35）单独一层虚化
ctx.layer(g, { blur: 4, shadow: 6 }, (lg) => { applyCam(lg, c, 1.35); drawCitizen(lg, { x: 300, y: 1060, s: 1.3, t: T, variant: 8, pose: 'cheer' }); });
```

### 5.6 舞龙横幅（b15：同一 pose 相位错开 + carry 锚点连线）

```js
const DANCE = folkCrowd(8, { x0: 700, x1: 1300, y: 1010, s: 0.3, seed: 9, start: 3 });
const A = drawCrowd(lg, DANCE, { t: T, detail: 0, pose: 'carryOverhead', each: (m) => ({ phase: -m.i * 0.13 }) });
const pts = A.map((a) => a.carry).sort((a, b) => a[0] - b[0]);            // 竿顶连成横幅中线，正弦波自然沿队伍传开
```

## 6. 与 assets.md 的差异

| 项 | assets.md | 实际实现 |
|---|---|---|
| 导出 | 5 个函数 + `FOLK_VARIANTS` | 另有 `drawFolkHat` `drawAppleBasket` `folkCrowd` `drawCrowd` `folkStagger` `FOLK_PASTELS` `FOLK_EXPRS` `FOLK_HEIGHTS`（别名 `FOLK_HEIGHT`）、各角色 pose 列表、`CHILD_STAGES` |
| 市民 `hat` | “false 表示帽子已飞” | 一致；另加 `hatFly`（0..1 飞行过程）与 `hatMode` |
| 市民 `dropItem` | “苹果篮” | `true` = 提着；数字 = 掉落进度；≥0.999 不画（交给 `drawAppleBasket`） |
| `flee` | “向左逃” | 朝 face 方向跑，向左逃要传 `face:-1` |
| `raiseHand` | “举手放光点” | 木偶只举手并返回 `hand`；光点由镜头画 |
| `carryOverhead` | “举横幅舞龙” | 木偶只画竿子，返回 `carry`；横幅由镜头连线画 |
| `blown` | 帽子飞、头发向后 | 不传 `hatFly` 时帽子停在刚离头的位置；要飞走传 `hatFly` |
| 新增参数 | — | 市民 `peek`、`pole`、`hatFly`、`hatMode`；卫兵 `variant`、`hatFly`、`hatMode`、`spearAngle`；书记官 `tower` 之外的 `towerN`、`hat`；传令官 `bend`、`scrollLen`、`hat`；孩子 `crown`、`curl`；全体 `phase` `speed` `cycle` `p` `joints` `jointsSet` `jitter` `seed` `detail` `silColor` `noBlink` |
| 新增 pose | — | 卫兵 / 书记官 / 传令官 / 孩子都有 `idle`（孩子 `stand`）；**收尾补充**：卫兵 `raiseHand` `pounce` `jawDrop`，书记官 `pounce` `jawDrop`，传令官 `raiseHand` `pounce`（storyboard b06 / b07 / b17 用到，assets 未列） |
| 卫兵 `whistle` | 返回音符发射点 | 锚点名 `note`，任何姿态都返回 |
| 书记官 `crossOut` | 划大叉 | 只让笔走叉的轨迹（`p`）；墨迹由镜头按 `quill` 锚点画（见 5.4） |
| 书记官 `unrollDecree` | 横着展开圣旨 | 木偶拿着圣旨卷，返回 `roll` / `rollEnd`；展开的纸面由镜头 / props 画 |
| 传令官 `blow` | 返回声波发射点 | 锚点 `bell` + 方向 `bellDir`（弧度） |
| 传令官 `slapNotice` | — | 告示本身由镜头 / props 画，`slap` = 拍的手 |
| 孩子 `popUp` / `yank` | 从摇篮弹起 / 拽小签 | 只是姿态；弹起位移、摇篮、小签都由镜头画 |
| 孩子 `curl` | 随 stage 变卷 | 一致；另可用 `curl` 参数覆盖 |
| 通用 `trail` | 拖尾参数 | folk 没有长拖尾部件，不支持 `trail`（头发 / 小旗随 t 摆动） |
| 通用 `rod` | 关节只允许平移 / 倾斜 + 少数平面姿势 | 只画木杆，不限制姿态；纸剧场请自选简单 pose |
| 返回值 `handR` / `handL` | 右手 / 左手 | 是 `handF` / `handB`（前 / 后手）的别名 |
| 传令官身高 | 185 | `FOLK_HEIGHTS.herald` = 185；含羽毛实测 193 |

## 7. 已知限制与注意事项

- **性能**（本机无头 Chrome 粗测，每次调用）：市民 ≈0.5 ms（detail 1）/ ≈0.15–0.25 ms（detail 0）；卫兵 / 传令官 / 书记官（含纸卷塔）≈2 ms；孩子 ≈1.4 ms。一群人只开**一个** `ctx.layer`（投影 + 纸纹整层给），不要每人一层；30 人以上的远景用 detail 0。
- **detail 0 的适用距离**：屏幕上的有效缩放 `s × 机位 zoom ≤ 0.4`（人高 ≲ 75px）用 detail 0，与 detail 1 肉眼几乎无差别、快 2–4 倍。CASTLE 外景 s=0.30 / 0.26 配 CA-W（zoom 1）、CA-MW（1.6，0.30×1.6 = 0.48 已是临界，主角附近改 detail 1）；CA-TOWN（zoom 1.8，有效 0.54）与 CA-BAL 用 detail 1。detail 0 去掉错位暗层、shade、切口亮边、发丝高光与小装饰，眼睛变豆豆眼，只有张嘴类表情画嘴。
- **pose 插值 k=0.5 的离散切换**：手持道具（书记官 `hold`、传令官号的位置 `horn`、卫兵矛在哪只手 `spearHand` / 扔矛 `spear:false`）与 pose 自带表情都在 k=0.5 切换。已知会“跳一下”的组合：卫兵 attention ↔ tossHat / pounce（矛换手 / 消失），传令官 idle ↔ raiseHand / slapNotice / unrollScroll / pant / pounce（号从手里到背后），书记官 idle ↔ run / unrollDecree（本子换圣旨卷）。动作本身很快时看不出来；慢插值时请在 k≈0.5 处用遮挡或甩动掩护。
- **未知 pose 名不报错**：静默回退到默认姿态。`drawCrowd` 的 `common.pose` 对混编的 kind 一视同仁，某 kind 没有这个 pose 就会回退——混编时用 `each` 按 kind 给 pose。
- **跟着人走的附属物**：掉落的苹果篮、飞行中的帽子都画在木偶自己的坐标里，人移动它们也跟着移动。长距离移动时在合适时刻读取 `item` / `hat` 锚点，改由 `drawAppleBasket` / `drawFolkHat` 在世界坐标里接管（face=−1 时 `rot` 取反）。
- **`top` 锚点是估算**：帽子离头时会从帽顶跳到发顶（4–20px），不要把东西刚性挂在 `top` 上跨过掉帽时刻。
- **兜帽不会飞**：`hatFly>0` 时兜帽瞬间垂到脖子后（没有飞行过程）；不传 `hatFly` 的 blown 姿态里兜帽保持戴着。
- **会穿帮的组合**：`hideBarrel`、`faintBack`、`pounce` 不贴地（`plant:0` / 裁地），与 `squash`、大 `joints.bob` 叠用会穿地或浮空；`flee`、`push`、`run`、`backAway` 只有原地步态，位移要镜头按速度给 x（不给就是原地跑）；baby 没有腿，配 hop / flee 只会上下弹；`carryOverhead` 的竿子比人高出一截，成员站得太近竿子会互相穿插；cheer 时高瘦变体（4 号兜帽）的前手会挡到一点脸侧。
- **剪影**：`silhouette` 不画五官、汗珠；`keepColor` 只能保留整个部件。
- **个体差异**：`jitter` 默认开，同一 pose 的人手臂角度各差几度；要两人严格对称（反应格镜像构图）传 `jitter: 0`。
- **木杆 `rod`**：从髋部伸到 y = 1400/s 处，必须由镜头裁掉画面外部分（纸剧场台口自然遮住）。

## 8. 模型图清单

- 源码：`src/sheets/folk.js`（`node tools/render.mjs stills --sheet folk --times … --outdir out/review/sheets/folk --prefix final_`）。总时长 36.4s，时间窗：
  - [0, 1.2) 市民 12 变体 + courtier / villager / grandma / face −1 + s=0.30 外景 detail 0 / 1 对比 + 卫兵 / 书记官 / 传令官 / 孩子 s=0.30
  - [1.2, 2.4) 市民 19 个 pose（stepBack / blown 前后对比）
  - [2.4, 3.6) 卫兵（有帽 / 无帽、口哨音符）、书记官（纸卷塔 0 / 0.5 / 1）、传令官（声波）
  - [3.6, 4.8) 孩子四阶段 + 高度线 + 各 pose + 特写
  - [4.8, 6.0) 表情表
  - [6.0, 7.2) s=3.4 特写、剪影（keepColor）、木杆、挤压、单独帽子
  - [7.2, 11.2) 动态页；[11.2, 35.2) 6 个放大循环页（每页 4s：错峰群演链 / 口哨光点掉下巴 / 逃跑推车扫地挥手鼓掌 / 舞龙 / 抛帽声波跑写字 / 划叉纸卷塔蹿高拽签）
  - [35.2, 36.4) 收尾补充：卫兵 / 传令官 raiseHand、pounce、jawDrop，兜帽吹落，hideBarrel 低 peek，V03 混编一起举手
- 定稿图（1920×1080）：`out/review/sheets/folk/final_t0.50.png`（变体）、`final_t1.80.png`（群演动作）、`final_t3.00.png`（职员）、`final_t4.20.png`（孩子）、`final_t5.40.png`（表情）、`final_t6.60.png`（特写）、`final_t9.20.png`（动态）、`final_t13.80.png`（错峰群演链放大，帽子挨个飞、兜帽吹落）、`final_t36.00.png`（收尾补充）。
- 自检：`./tools/lint.sh src/rigs/folk.js src/sheets/folk.js docs/api/folk.md`；`node tools/check.mjs sheets --list folk`。
