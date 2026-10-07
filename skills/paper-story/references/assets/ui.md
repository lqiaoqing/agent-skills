# 字与界面（ui）API

> 模块：`src/ui/type.js`（剪纸字与名字排版）、`src/ui/kit.js`（纸艺 RPG 界面）。`src/ui/player.js` 属于播放器组，不在本文。
> 规格：`docs/assets.md` 第 10、11 节；镜头需求：`docs/storyboard.md` 3.5–3.7、4.8–4.9 节与第 5 节各块。
> 本文参数名、默认值均按源码逐项核对；与 assets.md 不一致处以源码为准（差异见第 6 节）。

---

## 1. 模块与导出一览

### 1.1 `src/ui/type.js`

| 名称 | 类型 | 用途 |
|---|---|---|
| `NAME_TIMES(seg)` | 函数 | 某段名字的逐字时刻（默认秒），全片名字计时的唯一来源 |
| `segChars(seg)` | 函数 | 某段对应的字（数组） |
| `charsOf(name)` | 函数 | `NAMES[name]` 的逐字数组；不是 `NAMES` 的键时按字符串本身拆字 |
| `paperGlyph(g, ch, x, y, size, o)` | 函数 | 单字剪纸字（可带 `style` 材质预设），返回字宽 |
| `glyphWidth(g, ch, size, family, weight)` | 函数 | 某字体下单字字宽 |
| `glyphAdvance(g, ch, size, o)` | 函数 | 考虑 `style` 字体族与格宽（tile / seal）的字宽 |
| `glyphRow(g, chars, x, y, size, o)` | 函数 | 逐字定格排一行（逐字出现 + 逐字覆盖） |
| `typeOn(g, text, x, y, size, p, o)` | 函数 | 打字机（play 墨字，每字弹一下） |
| `pointAt(pts, L, s)` | 函数 | 折线弧长 `s` 处的点与切线角 |
| `glyphsOnPath(g, chars, pts, o)` | 函数 | 沿折线按弧长排字（永远正立，可竖排） |
| `glyph13(g, chars, anchors, o)` | 函数 | 13 格字槽（龙背板 / 名字之剑 / 火焰字位 / 石碑） |
| `marquee(g, chars, rect, progress, o)` | 函数 | 走马灯（rect 裁剪横向滚动） |
| `titleGlyphs(g, o)` | 函数 | 片名「达拉崩吧」三层纸叠 |
| `scrollInk(g, text, rect, p, o)` | 函数 | 卷轴墨字从左往右“写”出，返回笔尖 |
| `STYLES` / `STYLE_NAMES` | 常量 | 材质预设表 / 对外 14 个 style 名（不含内部 `lamp`） |
| `SLOT_STYLE` | 常量 | `glyph13` 六种槽状态 |
| `MARQUEE_STATES` | 常量 | `marquee` 六种状态预设 |

### 1.2 `src/ui/kit.js`

| 名称 | 类型 | 用途 |
|---|---|---|
| `TXT` | 常量 | 界面自拟文字：`king` 国王、`unknown` ？？？、`naming` 取名、`over` 字数超限！、`fullName` 全名、`items` 道具、`menu[4]`、`heroTurn` / `enemyTurn` / `victory`、`crit` 暴击！、`nameSword` 名字之剑、`ellipsis`、`mishear{card,violin,eggtart,soda,marathon}` |
| `blinkAt(t, seed=1)` | 函数 | 确定性眨眼量 0..1（周期 3.4s，闭合 0.13s） |
| `nameTab(g, text, x, y, o)` | 函数 | 红底奶油字名签（可翻牌换字） |
| `paperPanel(g, rect, o)` | 函数 | 基础卡纸面板 |
| `ICON_NAMES` / `glyphIcon(g, name, x, y, size, o)` | 常量 / 函数 | 路径画符号（全片唯一符号来源） |
| `portraitHead(g, who, x, y, size, o)` | 函数 | 默认 Q 版小头像 |
| `portraitFrame(g, x, y, r, portrait, o)` | 函数 | 金色圆头像框 |
| `dialogBox(g, o)` | 函数 | RPG 对话框（b04、b05） |
| `bubble(g, o)` / `thinkDots(g, o)` | 函数 | 对白气泡 / 云朵思考泡 |
| `nameTile(g, ch, x, y, size, o)` | 函数 | 字母牌（= `paperGlyph` style `tile`） |
| `namePanel(g, o)` | 函数 | 吊线取名面板（b05、b16、b17） |
| `HUD_LAYOUT` / `drawHUD(g, state)` | 常量 / 函数 | 旅途 HUD（b07、b08、b14） |
| `coinCounter(g, o)` / `expBarBig(g, o)` / `lvUpBadge(g, o)` | 函数 | 金币翻页牌 / 放大经验条 / 「LV UP」徽章 |
| `THEATER_PLATES` / `marqueePlate(g, o)` | 常量 / 函数 | 剧场名字牌（b12、b13） |
| `battleMenu(g, o)` / `turnBanner(g, o)` / `damageNumber(g, o)` | 函数 | 指令菜单 / 回合横幅 / 伤害数字 |
| `itemBar(g, o)` | 函数 | 听岔道具栏（b10） |
| `characterCard(g, o)` | 函数 | 角色卡（b06） |
| `enemyPlate(g, o)` / `vsBadge(g, o)` | 函数 | 「？？？ LV 99」吊牌 / 「VS」徽章（b09） |
| `nameTagSmall(g, o)` | 函数 | 头顶小名签 / 胸前名签（b04、b05、b16） |

---

## 2. 坐标、尺寸与锚点约定

- **坐标系**：界面组件默认参数全是**屏幕坐标**（1920×1080，镜头里不 `applyCam` 直接画）；要跟随角色时用 `toScreen(c, depth, x, y)` 把世界坐标换成屏幕坐标再传。名字字形（`paperGlyph` 等）不区分，传什么坐标系就画在什么坐标系。
- **字幕带规则：所有界面在 y ≤ 900。** 默认布局都满足（对话框 690–900、菜单 640–830、取名面板 250–620（「全名」小签约到 y 830）、道具栏 200–560、角色卡 y=640 时 430–850（挂卷轴到约 898）、HUD 72–232、剧场名字牌 176–262）。自定义 `y` 的气泡、伤害数字、名签请自行保持在 900 以上。
- **没有 `s` / `face`**：界面不是木偶，尺寸固定为下表默认值；需要缩放时外面 `g.scale`（模型图用 `at()` 缩 0.5）。镜像只有：`bubble.mirror`（泡形翻、字不翻）、`paperGlyph.mirror`（字形镜像）、`marqueePlate.side:'dragon'`（布局镜像，不是 scaleX）。
- **字的锚点 = 字形墨迹中心**（`paperGlyph` 的 (x,y)）。`glyphRow` 的 (x,y) = 行左端（`align` 可改中/右）+ 字形中线。`baseline:true` 时整行按参考字（latin 用 `H`，其余用 `国`）的墨迹中心对齐，数字与标点不再各自居中。
- **进度参数一律传线性 0..1**（`pop / drop / flip / typed / p / show …`），组件内部自己套缓动（多为 `outBack`）；已经套过缓动的值传进来会二次缓动。
- **秒参数 `t`**：驱动眨眼、绳摆、抖动、闪烁等次级运动，传 `T` 即可；`…At` 结尾的参数都是与 `t` 同一时间轴的时刻。
- **纸艺分层**：组件内部只画“暗色错位底片（右下）+ 顶边切口亮边”，**投影与纸纹由镜头的图层给**（`ctx.layer(g, { shadow: 8–14, texture: 0.3 }, …)`）。函数内部 save/restore，不调 `ctx.layer / ctx.mask`。

| 组件 | 锚点 / 默认位置（s=1 尺寸） |
|---|---|
| `dialogBox` | `rect` (420,690)–(1500,900)；头像圆框 r=70，国王在右端 (R.x+R.w−102)、勇者在左端 (R.x+102) |
| `namePanel` | `rect` (440,250)–(1480,620)；格 112×124、间距 12，格排 x 470–1450、y 400–524（格心 y=462）；牌字号 86（牌边 103） |
| `drawHUD` | 角色卡 (96,72)–(600,232)，细节见 `HUD_LAYOUT` |
| `expBarBig` | (560,140)–(1360,170) |
| `marqueePlate` | 勇者 (150,176)–(750,262)，窗口 x 270–585（5 字：72px、字距 63、窗宽 315）；巨龙 (1170,176)–(1770,262)，窗口 x 1335–1650 |
| `battleMenu` | (150,640)–(560,830) |
| `turnBanner` | 中心 (960,215)，宽 420（胜利 640） |
| `itemBar` | (880,200)–(1720,560)，5 格各 150×200 |
| `characterCard` | 卡心 (x,y)，300×420 |
| `bubble` / `thinkDots` | 泡心 (x,y)，默认 360×190 / 240×150；`pop` 以泡尾点为缩放锚 |

---

## 3. 函数详解

### 3.1 type.js

#### `NAME_TIMES(seg)` → `number[]`
段首字 = 段 cue，步长 = 到下一个 cue 的时长 ÷ 字数（保留 3 位小数）；`N4*` 印章段全部字同一时刻；无分段 cue 的句子按附录 A 写死。未知段名抛错。全表见第 4.5 节。

#### `segChars(seg)` → `string[]`　｜　`charsOf(name)` → `string[]`
`charsOf` 的键：`hero` `heroParts`（数组，勿用）`heroShort` `dragon` `princess` `princessShort` `city` `child`；其它字符串按自身拆字。

#### `paperGlyph(g, ch, x, y, size, o = {})` → 字宽（未缩放；`style` 带格子时返回 `max(字宽, cell×size)`）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `family` | `'display'` | `display / play / serif / latin` |
| `weight` | `400` | latin 用 600–700 |
| `fill` | `PAL.red` | 字色 |
| `edge` | `PAL.paper` | 奶油纸边色，`null` 不画 |
| `edgeW` | `0.12` | 纸边**半宽**/字号（描边宽 = size×edgeW×2） |
| `rot` | `0` | 弧度 |
| `scale` / `squashX` | `1` / `1` | 整体缩放 / 横向压扁 |
| `squashY` | `1` | 纵向压扁（**只在给了 `style` 时生效**） |
| `flipY` / `mirror` | `false` | 上下颠倒 / 左右镜像 |
| `alpha` | `1` | |
| `shadow` | `0` | 单字投影 px（无 style 时只在有 `edge` 时生效）；成片的字请用图层投影 |
| `stroke` / `strokeW` | `null` / `0.04` | 额外墨线（无 style 路径） |
| `skew` | `0` | 斜体弧度，正 = 顶部右倾 |
| `inkCenter` | `false` | 按墨迹框水平居中（「？」等标点） |
| `baseline` | `false` | 共用基线（见第 2 节） |
| `style` | — | 材质预设名（第 4.1 节）；给了 style 时其余选项覆盖预设（`undefined` 不覆盖） |

各 style 额外读的键：`depth`（错位底片 /字号，默认 0.03）、`lift`（切口亮边上移，0.022）、`under`、`rim`、`outline`/`outlineW`、`grad`（竖向渐变色数组）、`foilX`（扫光带中心 x，调用方坐标）/`foilW`/`foilColor`/`foilAlpha`；`tile`：`cell` `face` `side` `line`（null 无框线）`charScale`(0.86)；`seal`：`cell` `bg` `seed`；`balloon`：`puff`(0.006) `ring`(0.02) `knot`(false 不画小结)；`title3`：`paper` `rim`；`plate`：`lit` `offFill`；`stone`：`glow`；`ink`：`reveal`。

#### `glyphWidth(g, ch, size, family='display', weight=400)` → number　｜　`glyphAdvance(g, ch, size, o={})` → number
`glyphAdvance` 读 `o.style / o.family / o.weight / o.cell`。

#### `glyphRow(g, chars, x, y, size, o = {})` → `[{x, y, w}]`（每字中心与字宽）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `appear` | 全 1 | 每字出现进度 0..1（内部 `outBack(a, 2.2)` 缩放 + `min(1, 3a)` 透明，过冲约 1.15） |
| `gap` | `size×0.02` | 字间距 px（给 `pitch` 时忽略） |
| `pitch` | — | 固定字距（N1 对话框 98） |
| `align` | `'left'` | `'left' / 'center' / 'right'` |
| `perChar(i, ch)` | — | 返回覆盖项 `{dx, dy, rot, scale, alpha, skip, …任意 paperGlyph 选项}` |
| 其余 | | 透传 `paperGlyph`（含 `style`） |

#### `typeOn(g, text, x, y, size, p, o = {})` → 同 `glyphRow` 的返回数组
默认 `family:'play', fill: ink, edge: null`；`appear[i] = clamp(p×n − i)`。（源码注释写“返回行宽”，实际返回逐字位置数组。）

#### `pointAt(pts, L, s)` → `[x, y, ang]`
`L` 为累计弧长表（`L[0]=0`，`L[i]` = 到 `pts[i]` 的折线长；arcTable 未导出，需自己算）。

#### `glyphsOnPath(g, chars, pts, o = {})` → `[{x, y, ang}]`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `size` | `72` | 字号 |
| `start` | `0` | 起点弧长 px |
| `gap` / `pitch` | `size×0.05` / — | 字距 |
| `grow` | 全显示 | 0..1 显示到第几个字（新字 outBack 弹出） |
| `vertical` | `false` | 竖排：每字占 `size` 弧长，字不转（E10 竖幅） |
| `maxRot` | `15°` | 切线角夹角，字永远正立 |
| `perChar` + paperGlyph 选项 | | 同 `glyphRow` |

#### `glyph13(g, chars, anchors, o = {})` → 无返回
`anchors[i] = {x, y, ang}`。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `size` | `72` | |
| `state` | `'lit'` | 字符串或逐槽数组：`off / lit / fire / gold / steel / stone`，也可直接写任一 style 名（`'flag'`、`'petal'`…） |
| `appear` / `pop` | 全 1 / 0 | 逐槽出现进度 / 额外弹跳（×(1+0.25·pop)） |
| `lit` | `1` | 数字或数组：off ↔ 本槽状态的叠化（逐节点亮） |
| `glow` | `0` | 数字或数组：字后光晕（lit/fire/gold/stone/steel 各有光色） |
| `maxRot` | `15°` | |
| `glyph` | — | 额外 paperGlyph 选项（如 `{ glow: 0.7 }` 给 stone 熔岩光） |

#### `marquee(g, chars, rect, progress, o = {})` → `{ centerIndex, centerX, offset, passed, items:[{i,x,y}] }`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `size` / `family` | `72` / `'display'` | |
| `gap` / `pitch` | `size×0.05` / — | 剧场名字牌用 `pitch: 63` |
| `fill` / `edge` | `PAL.ink` / `null` | |
| `mode` | `'fit'` | `'fit'`：偏移 = (总宽−窗宽)×p；`'pass'`：0 时首字刚进右边、1 时末字刚出左边；`'center'`：0 首字在中线、1 末字在中线 |
| `span` / `lead` | — | 自定义：偏移 = −lead + span×p（覆盖 mode） |
| `state` | — | `MARQUEE_STATES` 键（先铺预设，再被其它选项覆盖） |
| `centerGold` | `false` | 经过中线的字变 goldLight（有 style 时带光晕） |
| `shake` | `0` | 逐字横抖 px（按 progress） |
| `stutter` / `slip` / `tremble` | — | 逐格跳 + 跳后一抖 / 个别字下滑 / 逐字哆嗦 px（配 `t`） |
| `skew` / `under` / `edgeW` | — | 透传字形 |
| `t` | `progress×6` | 驱动哆嗦 |
| `seed` | `7` | |
| `glyph` | — | 额外 paperGlyph 选项 |

`centerIndex` = 当前在中线的字序号（−1 = 没有），`passed` = 已越过中线的字数（B12 弹飞节数）。

#### `titleGlyphs(g, o = {})` → `[{x, y（墨迹中心）, w, top（字顶 y）}]`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x` / `y` | `960` / `560` | 行中心 / **基线** |
| `size` | `300` | |
| `chars` | `NAMES.heroShort` | |
| `gap` | `size×0.035` | |
| `rise` | 全 1 | 4 个线性进度：scaleY 0→1（outBack 1.9）以基线为锚 |
| `foil` | `null` | 0..1 金箔扫光从左到右；`null` 不画 |
| `starAt` + `t` | — | 末字右上四角星闪（0.65s） |
| `alpha` | — | |

#### `scrollInk(g, text, rect, p, o = {})` → `{ pen:[x,y], chars:[{x,y,w,ch,line}], size }`
`text`：字符串（`\n` 分行）或行数组；`p` 0..1 整段书写进度。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `size` | 自动（行高撑满 rect 高 78%） | |
| `family` | `'display'` | |
| `fill` | `PAL.ink` | 金墨传 `PAL.goldDark`（E06） |
| `align` | `'left'` | `'left' / 'center'` |
| `lineHeight` / `gap` | `size×1.22` / `size×0.04` | |
| `alpha` | — | |

### 3.2 kit.js

#### `nameTab(g, text, x, y, o = {})` → `{x, y（顶边）, w, h}`
(x,y) = 名签左端中点（`anchor:'right'` 为右端，`'center'` 为中心）。`size`=30、`color`=red、`rot`、`text2`（**翻牌前的旧字**：给了 `text2` 时 `flip<0.5` 显示旧字）+ `flip` 0..1。

#### `paperPanel(g, rect, o = {})` → `{path, notch, rect}`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `stitch` / `stitchColor` | `true` / kraftDark | 内缩 12px 的 [10,8] 虚线缝线（面板 >60×60 才画） |
| `corners` / `cornerSize` | `true` / `26` | 金包角（`bulge` 增大时脱落淡出） |
| `tag` | — | `{text, side:'left'|'right', size=30, text2, flip, color}` 名签 |
| `bulge` | `0` | 0..1 整体鼓成气球 |
| `bulgeR` | `0` | 右边单独鼓出 px |
| `tear` / `tearY` | `0` / 中线 | 右边撕口 0..1；返回 `notch:{x,y0,y1,depth,tearY}` |
| `r` / `amp` / `seed` | `16` / `1.2` / `3` | 圆角 / 手剪抖动 px / 种子 |
| `fill` / `line` / `lw` / `rim` | paper / ink / 4 / white | 底色 / 墨线 / 线宽 / 顶边亮边（null 不画） |
| `alpha` / `content(g)` | — | 透明 / 裁在面板内、缝线之下画的内容 |

#### `glyphIcon(g, name, x, y, size, o = {})` → `{x, y, size, dot?:[x,y]}`（未知名或 alpha≤0 返回 `null`）
(x,y) = 符号中心，size = 外框边长。通用 `o`：`fill`、`edge`（奶油纸边，null 不要）、`under`（暗色错位底片）、`rim`（顶边亮边）、`line`（墨线）、`lineW`、`edgeW`、`flat`（只画主色）、`rot`、`scale`、`alpha`。符号全表与专用参数见第 4.2 节。

#### `portraitHead(g, who, x, y, size, o = {})` → 无返回
(x,y) = 头心，size ≈ 头宽。`who`：`hero / king / princess / dragon / baby / unknown`（其它值按 unknown 画）。`o`：`t`（眨眼、呆毛）、`expr`（`'smile'` 默认 / `'open'` / `'closed'` / `'star'`）、`blink`（覆盖眨眼量）、`silhouette`（仅 dragon：黑剪影只留黄眼）、`scarf:false`（hero 不画围巾）、`tiara:false`（princess 不画小冠）。

#### `portraitFrame(g, x, y, r, portrait, o = {})` → 无返回
`portrait`：who 字符串，或回调 `(g, x, y, size)`（头心 y + r×0.08，size = r×1.5，已裁在内圆里）。`o`：`t`、`bg`（skyDayLow）、`expr`。

#### `dialogBox(g, o = {})` → `{rect, textArea:{x,y,w,h}, portrait:[x,y,r], tear, cursor:[x,y]}`（`pop≤0` 返回 null）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `rect` | `{x:420, y:690, w:1080, h:210}` | |
| `speaker` | `'king'` | `'king'`（头像右端）/ `'hero'`（左端） |
| `from` | = speaker | 翻牌前的说话人（不同则翻牌时头像换边） |
| `tag` / `tagFrom` | king→「国王」，hero→「？？？」 | 名签字 / 翻牌前名签字 |
| `tagFlip` | `0` | 0..1 名签与头像翻牌（前半压扁旧的，后半展开新的） |
| `portrait` | 按说话人 | who 字符串 / 回调 / `false` 不画 |
| `text` / `typed` | — / `1` | 对白（play、墨色、字距 2）/ 打字机进度 |
| `textSize` | `64` | |
| `erase` | `0` | 0..1 字逐个弹走 |
| `cursor` | `false` | 闪烁小三角（周期 0.4s） |
| `textArea` | 国王 `{x: R.x+70, w: R.w−290}`，勇者 `{x: R.x+220, w: R.w−290}` | 文字区；N1 传 `{x:600, w:784}` |
| `bulgeRight` | `0` | 0..1（可 >1 过冲）右框鼓出 ×40px |
| `tear` / `tearY` | `0` / 框中线 | 右框撕开 + 纸瓣拍动 + 纤维 |
| `pop` | `1` | 0..1 自下而上弹起 |
| `t` / `seed` | `0` / `11` | |

N1 的 120px 剪纸大字不走 `text`，由镜头用 `glyphRow(g, chars, r.textArea.x, 795, 120, { style:'cut', pitch: 98 })` 画（见 5.1）。

#### `bubble(g, o = {})` → `{x, y, w, h, tail}`（`pop≤0` 返回 null）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `x` / `y` | `960` / `400` | 泡心 |
| `w` / `h` | `360` / `190` | |
| `shape` | `'round'` | 见第 4.3 节 |
| `text` | — | ≤5 字；round/soft/cloud 用 play 墨字，jagged/flame 用 display `cut` 红字 |
| `tail` | `null` | 泡尾指向的点（cloud 画三颗小圆） |
| `pop` | `1` | outBack，从泡尾长出；字错峰出现 |
| `mirror` | `false` | 泡形左右翻（字不翻），K1 / Q1 镜像 |
| `t` / `seed` | `0` / `5` | 锯齿、火焰、soft 抖动 |
| `fill` / `line` / `lw` | 按形状 | flame 填 fire2 线 fireDeep；soft 线 inkSoft、lw 3；jagged/flame lw 5；其余 lw 4 |
| `textSize` / `textFamily` / `textFill` / `textEdge` | 自动 | |

#### `thinkDots(g, o = {})` → bubble 返回值
`x=960, y=400, w=240, h=150, tail, pop, mirror, seed`；`dots:[p0,p1,p2]`（各 0..1）或 `t` + `at:[t0,t1,t2]`（每点 0.2s 弹出）。b04：`at: [38.40, 38.70, 39.00]`。

#### `nameTile(g, ch, x, y, size = 86, o = {})` → 字宽
= `paperGlyph(…, { style:'tile', ...o })`；可传 `squashX / squashY / rot / alpha`。

#### `namePanel(g, o = {})` → `{rect（当前外框）, slots:[{x,y}], tiles:[{x,y,sx}|null], pivot:[x,y], tag:[x,y]|null}`

| 参数 | 默认值 | 说明 |
|---|---|---|
| `rect` | `{x:440, y:250, w:1040, h:370}` | |
| `label` | 「取名」 | 左上名签 |
| `slots` / `keep` | `8` / `3` | 格数 / 收拢后保留格数 |
| `tiles` | `[]` | `[{ch, p（落入 0..1，≥0.55 算落下）, squashX}]`，或字符串（全部落定） |
| `counter` | 已落下牌数 | 数字或「13/8」字符串；超格数变红 + 抖 |
| `counterPop` | `0` | 计数弹一下 |
| `full` | `0` | 满格泛金光 |
| `overTag` | `0` | 「字数超限！」0..1 闪三次，1 常亮 |
| `bulge` | `0` | 外框鼓成气球 |
| `strings` | — | `{left, right}` 断绳**时刻**（与 `t` 比较） |
| `swing` | `0` | 度；绕右吊点甩（正 = 左端下坠） |
| `drop` | `0` | 坠出画面（inQuad，旋转） |
| `popFrames` / `popSwing` | `0` / = swing | 格框崩飞、牌弹回原宽散开（>1 继续下落）/ 崩飞瞬间甩角 |
| `foldEmpty` | `0` | 空格从右往左折起（O06） |
| `contract` | `0` | 外框收拢到 `keep` 格并居中 |
| `glowOk` | `0` | meadow + gold「刚刚好」光 |
| `cursor` | — | 光标所在格序号（红色下划线闪烁） |
| `tagBelow` / `yank` | — / `0` | `true` 或 `{text}`：面板下「全名」小签 + 小三角 / 拽一下 |
| `ropeTop` | `-40` | 吊线上端 y |
| `t` / `seed` | `0` / `17` | |

超出格数时全部牌按比例挤进格排（scaleX 压扁），新牌从右端硬挤入。

#### `drawHUD(g, state = {})` → 锚点 `{portrait, coin, bag, hearts:[[x,y]×5], exp:{x,y,w,h}, name:{x,y,w,h}}`
`show ≤ 0` 时不画、只返回锚点（锚点不随滑入平移）。小地图不在这里画（`map.drawMiniMap`）。

| state 字段 | 默认值 | 说明 |
|---|---|---|
| `show` | `1` | 0..1 从左滑入（outBack 1.3） |
| `t` | `0` | **必须传 `T`**，否则所有 `…At` 动画不触发 |
| `lv` | `1` | 「LV n」 |
| `nameReveal` | `6` | 名字牌露几个字（0..13），不满 13 字时补三点省略号 |
| `revealAt` / `levelUpAt` | — | 新字弹入时刻（`levelUpAt` 为 hudState 写法，二者取先给的） |
| `hearts` | `5` | 0..5，可 .5；≤1.5 时最后一颗自己闪红 |
| `crackAt` | — | **长度 ≥ 5**：`crackAt[i]` = 第 i 颗心裂开时刻（可含 null）；**长度 < 5**（hudState 的 4 次受伤）：按时间先后从右往左（第 k 次 → 第 4−k 颗），裂开时底下显示 `hearts` 的剩余量 |
| `heartFlashAt` | — | 全部心闪一下的时刻 |
| `heartFlash` | — | 0..1 强度（hudState）：hearts>1.5 → 全部心闪金；≤1.5 → 驱动最后一颗的闪红 |
| `shiverAt` / `heartShiver` | — | 心打哆嗦：起始时刻（0.5s 衰减）/ 0..1 强度（hudState），取大 |
| `coins` | `0` | 金币数 |
| `coinFlipAt` / `coinAt` | — | 每枚到达时翻一格的时刻表（`coinFlipAt` 时数字按表计数；`coinAt` 时数字用 `coins`、按表做翻页） |
| `coinBounceAt` / `coinBounce` | — | 计数牌大弹 + 火花的时刻 |
| `bag` / `bagAt` | `0` / — | 背包道具数（红点）/ 背包鼓一下的时刻表 |
| `lvPopAt` | = `levelUpAt` | LV 数字弹一下 |
| `exp` | `0` | 0..1，或 `{v, big}` |
| `expBig` | — | 0..1 已弹到大条的程度（小条随之隐去）；`exp.big` 优先 |
| `portrait` / `expr` | `'hero'` / — | 头像 who 或回调 / 头像表情 |

#### `coinCounter(g, o = {})` → `{coin:[x,y]（飞来金币对准这里）, w}`
`x=482, y=208`（左端中点）、`value`（不给 = `flipAt` 中 ≤t 的个数）、`flipAt[]`、`t`、`size=34`（数字高）、`bounceAt`、`icon=true`、`alpha`。

#### `expBarBig(g, o = {})` → `{rect, snail:[x,y]（填充前沿、条顶）, fillX}`（`k≤0` 返回 null）
`fill` 0..1、`k`=1（0..1 从 `from` 弹到大条，outBack 1.25；反向即缩回）、`from`=`HUD_LAYOUT.exp`、`rect`={560,140,800,30}、`lv`（右侧「LV n」）、`t`、`alpha`。k>0.6 时出现「EXP」签。

#### `lvUpBadge(g, o = {})` → `{x, y, r}`（`p≤0` 返回 null）
`x=960, y=300`、`p`=1（0..1 鼓起，约对应 0.35s）、`s`=1（越升越小传 0.8 / 0.65…）、`t`（鼓好后上下浮 + 3 颗闪星）、`alpha`。

#### `marqueePlate(g, o = {})` → `{window:{x,y,w,h}, centerX, centerIndex, passed, items, portrait:[x,y]}`（`drop≤0` 返回 null）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `side` | `'hero'` | `'hero' / 'dragon'`（布局镜像） |
| `rect` | `THEATER_PLATES[side]` | |
| `name` | 对应全名 | 字符串 |
| `progress` | `0` | 本 cue 已过时间 / 本 cue 时长 |
| `state` | `'active'` | 第 4.4 节 |
| `mode` | idle → `'fit'`，其余 `'pass'` | 见 `marquee` |
| `centerGold` | active / cracked 时 true | |
| `hp` / `hpLag` | `1` / = hp | HP 条 / 滞后白条 |
| `hpText` | `` `HP ${round(hp×100)}` `` | 如 `'HP 1'` |
| `crack` | cracked 时 1 | 0..1 窗口裂缝生长 |
| `peeled` | `0` | 前几个字已被剥走（画空格） |
| `drop` | `1` | 0..1 从顶幕吊下（outBack 1.6） |
| `beat` | `0` | 0..1 随心跳脉动（内部 1.3Hz） |
| `shrink` | `0` | 0..1 随龙缩小（1 → 0.35） |
| `tf` | `{}` | `{dx, dy, rot, s}` 整体变换 |
| `portrait` | 'hero' / 'dragon' | who 或回调（头像圆框 r=36） |
| `ropeTop` / `t` / `seed` | `120` / `0` / 31（龙 41） | |

#### `battleMenu(g, o = {})` → `{rect, buttons:[{x,y,w,h}×4], cursor:[x,y], submenu:{x,y,w,h}|null}`（`pop≤0` 返回 null）

| 参数 | 默认值 | 说明 |
|---|---|---|
| `rect` | `{x:150, y:640, w:410, h:190}` | |
| `items` | `TXT.menu` | 攻击 / 技能 / 道具 / 逃跑（play 48px） |
| `cursor` | `0` | 0..3，小数 = 在相邻两项间滑动；也可写 `'attack' / 'skill' / 'item' / 'flee'` |
| `blink` / `flash` | `0` | 光标项闪亮（`flash` 为 theaterState 写法） |
| `press` | `0` | 光标项按下 |
| `locked` | `0` | 0..1 变灰 + 小锁（≥0.5 时不再高亮光标项） |
| `lockPop` | `0` | 小锁弹飞 |
| `submenu` | — | `{text=「名字之剑」, p（滑出 0..1）, sel / select（选中闪光）}` |
| `pop` | `1` | 从左下弹出 |
| `t` | `0` | |

#### `turnBanner(g, o = {})` → `{x, y, w, h}`（`drop≤0` 返回 null）
`text`=「勇者的回合」、`kind`（`'hero' / 'enemy' / 'victory'`，默认按文字判断）、`textFrom` / `prev`（翻牌前的字，`prev` 为 theaterState 写法）+ `kindFrom`、`flip` 0..1、`drop`=1、`x=960, y=215`、`w`（420，胜利 640）、`t`（绸带波动）。胜利用 display `cut` 110px，其余 play 50px。

#### `damageNumber(g, o = {})` → `{x, y}`（`p≤0` 或 `p≥1` 返回 null，不画）
`text`='-999'、`x=960, y=400`、`size`=120、`color`（`'red'` 默认 heart 红 / `'gold'` / 任意色值）、`p`=0.3（寿命进度：逐字弹出 → 上飘 `rise` → 0.72 后淡出）、`label`（小名签，如「暴击！」）、`rise`=70。

#### `itemBar(g, o = {})` → `{rect, slots, edgeX, edge:[[x,y]…]}`（`slide≤0` 返回 null）
`rect`={880,200,840,360}、`items:[{kind, p（入格 0..1）, rarity（星数 1..5，5 = 传说：金格 + 放射线）, name（默认 `TXT.mishear[kind]`）, burst（五星炸开，传说默认 1）}]`、`drawIcon(g, kind, x, y, size)`（默认内置占位图标，正式接 `props/village.drawMishearIcon`）、`burn` 0..1（燃烧线从右往左，线左侧保留；亮边与灰片交给 `fx.burnEdge`）、`slide`=1（从右上滑入）、`t`、`label`=「道具」。kind：`card / violin / eggtart / soda / marathon`。

#### `characterCard(g, o = {})` → `{x, y, w, h, portrait:{x,y,w,h}}`
`x=960, y=640`、`face`（`'back'` 默认 / `'front'`）、`flip` 0..1（0 卡背、1 正面，给了就忽略 face）、`rot`、`s`=1、`portrait`（who 或回调 `(g,x,y,size)`）、`portraitBg`、`silhouette`、`nameStrip`（放不下时绕过右卡边弯到背面）、`extras:{scroll, lv, stars=3}`（有 `lv` 时显示小签代替星）、`t`。

#### `enemyPlate(g, o = {})` → `{x, y, w, h}`（`drop≤0` 返回 null）
`x=1300, y=260`、`text`=「？？？」、`lv`='LV 99'、`drop`=1（吊下 + 摆动）、`ropeTop`=−20、`t`。

#### `vsBadge(g, o = {})` → `{x, y, r}`（`drop≤0` 返回 null）
`x=960, y=420`、`size`=180、`drop`=1（0..0.55 下落，之后落地挤压）、`t`。

#### `nameTagSmall(g, o = {})` → `{x, y, w, h}`（`pop≤0` 返回 null）
`kind`（`'head'` 默认 / `'chest'`）、`x=960, y=400`（签心）、`text`=「？？？」、`size`（head 40 / chest 36）、`w`（head 签宽，默认 size×3.6）、`textFrom` + `flip`、`spill`=1（字多放不下时从两头溢出的进度）、`pop`=1、`t`。

---

## 4. 枚举全表

### 4.1 `style`（`STYLE_NAMES`，`paperGlyph / glyphRow / glyphsOnPath` 的 `o.style`）

| style | 说明 | 用在 |
|---|---|---|
| `cut` | 红字奶油纸边 + 暗红错位底片 + 切口亮边 | b05 N1 对话框大字；气泡 jagged/flame 字、胜利横幅、伤害数字 |
| `tile` | 厚纸板方牌 + 墨字（牌边 1.2×字号） | b05 N2 取名面板、b16 O06 王浩然（`nameTile`） |
| `balloon` | play 字形 + 粉彩填色 + 薄外缘 + 底部暗面 + 椭圆高光 + 小结 | b05 N3 国王吹气球字 |
| `seal` | 红底方印 + 白字 + 内框 + 印泥斑驳 | b05 N4 三行印章字 |
| `gold` | 金箔渐变 + 金墨线 + 扫光（`foilX`） | b05 N4 圣旨金字 / 横幅 13 金字、b06 片名页丝带名字 |
| `title3` | 三层纸叠 red/gold/paper（偏移 0/8/16 随字号缩放） | b06 片名（`titleGlyphs`）、b17 回扣 |
| `plate` | 龙背板：`lit` 0 刻痕 → 1 发光 | b09 D1 龙背板逐节点亮、b11–b13 龙身 |
| `fire` | 火焰字形（fire2→fire→fireDeep 渐变 + 亮芯），火舌由 props 加 | b10 D2 |
| `stone` | 石刻刻槽 + `glow` 熔岩光 | b10 D3 石碑墙 |
| `steel` | 剑刃字牌上的墨字（刻钢亮边） | b13 B10 名字之剑 |
| `petal` | 花瓣色字 + 浅粉边 | b13 E02 公主全名花瓣 |
| `flag` | 塔旗墨字 + 奶油边 | b14 E04 城名塔旗（b16 O02 远景旗） |
| `ink` | 卷轴墨字，`reveal` 0..1 从左往右写（`scrollInk` 用） | b05 书记官小卷轴、b14 E06 / E08 捷报卷轴 |
| `banner` | 深蓝字 + 暗底片 + 亮边 | b15 E12 婚礼横幅 |
| （`lamp`） | 内部：走马灯暗窗里的灯字，不在 `STYLE_NAMES` | `marquee` 的状态预设 |

### 4.2 `glyphIcon` 符号（`ICON_NAMES`，17 个，全部路径画）

| name | 说明 / 专用参数 | 用在 |
|---|---|---|
| `star` | 金色五角星 + 高光 | 角色卡星级、道具稀有度、b04/b11 头上绕星 |
| `heart` | 红心；`fillFrac` 0..1（半颗 .5）、`crack` 0..1（裂纹 → >0.35 两半分开坠落）、`emptyFill` | HUD（b07、b08）、b15 E11 爱心 |
| `note` | 音符 | 全片配乐点缀 |
| `check` | 绿色对勾 | 全片 |
| `cross` | 红叉（书记官划叉） | b05 N3 52.90 |
| `triDown` | 墨色下三角 | 对话框光标、「全名」小签 |
| `triRight` | 墨色右三角 | 菜单、提示 |
| `sparkle4` | 四角闪星；`thin` | b05 H1 牙闪、计数牌火花、LV UP |
| `dot` | 圆点（display / serif 里代替「·」） | 思考泡三点、名字牌省略号 |
| `exclaim` | 红色「！」；`bar` 0..1 竖杠弹出；返回 `dot` 圆点中心 | b02 L05「！」对位 |
| `question` | 墨色「？」；返回 `dot` | 头像 unknown |
| `sword` | 指向右的小剑（剑刃 `fill` 可改） | 菜单光标、名字之剑子菜单 |
| `lock` | 金锁；`open` 0..1 | b12 B05 菜单上锁、b13 解锁 |
| `circledNum` | 红圆数字；`n` 1..4、`digit` 颜色 | 全片 ①–④ |
| `arrow` | 红箭头；`dir`：`'right'`（默认）/`'left'`/`'up'`/`'down'` | 全片指示 |
| `coin` | 金币；`spin`（弧度，scaleX = cos） | HUD 计数牌、b07 V06 飞金币 |
| `bag` | 皮背包 | HUD |

### 4.3 `bubble.shape`

| shape | 说明 | 用在 |
|---|---|---|
| `round` | 圆角泡 + 弯泡尾，play 墨字 | b05 K1「再说一遍？」/ K2「是不是…」/ H1「对对！」、b06「达…」「别！」、b09「后面！」「咳」、b10 Q1/Q2（`mirror`）、b14「嘟嘟！」 |
| `jagged` | 锯齿泡（随 `t` 轻颤），display 红字 | b02 13.45「嗷——」、b03 L08「！！」、b10 120.70「嗷——」、b11「嗷！」 |
| `cloud` | 云朵泡 + 三颗小圆尾（`thinkDots` 用） | b04 想了想 |
| `flame` | 火焰边泡（fire2 填色） | b10 117.08「不对！」 |
| `soft` | 柔软呼吸泡（inkSoft 线） | b16 196.80「呼——」 |

### 4.4 走马灯 `state`（`MARQUEE_STATES`，`marquee` 与 `marqueePlate`）

| state | 说明 | 用在 |
|---|---|---|
| `idle` | 暗淡静止（marqueePlate 默认 fit：显示开头） | b12 B02 前、巨龙牌等待时「昆图库塔卡」 |
| `active` | 奶油灯字 + 中线金字 + 金边 | b12 B02 勇者牌滚全名；b13 160.4 后复原 |
| `hit` | 红闪 + 逐字哆嗦 + 牌整体抖 | b12 B04 巨龙中招 |
| `angry` | 红字粗边右倾 + 边框红闪 | b12 B06 龙名又快又凶 |
| `cracked` | 逐格跳 + 跳后一抖 + 个别字下滑（+ 窗口裂缝） | b13 B08 勇者牌卡顿；157.35 后巨龙牌 |
| `empty` | 不画字 | b13 B10 名字被剥空 |

### 4.5 `glyph13` 槽 `state`（`SLOT_STYLE`）

| state | 说明 | 用在 |
|---|---|---|
| `off` | 暗刻痕（α0.55） | b09 D1 点亮前的龙背板 |
| `lit` | goldLight 发光字 + dragonEye 光晕 | b09 D1a/D1b 逐节点亮、b10 120.70 全亮 |
| `fire` | 火焰字 | b10 D2 勇者头顶 13 格字位 |
| `gold` | 金箔字 | b05 圣旨横幅 13 金字 |
| `steel` | 剑刃字牌墨字 | b13 B10 名字之剑 13 块字牌 |
| `stone` | 石刻 + 熔岩（`glyph:{glow}`） | b10 D3 石块 |

### 4.6 其它枚举

| 参数 | 取值 | 用在 |
|---|---|---|
| `dialogBox.speaker` | `'king'`（头像右）/ `'hero'`（头像左） | b04 L13–L15 国王问名、L16 勇者；b05 N1 |
| `portraitHead who` | `hero / king / princess / dragon / baby / unknown` | 对话框、HUD、剧场牌、角色卡；baby = b16 |
| `portraitHead expr` | `smile`（默认）/ `open` / `closed` / `star` | |
| `turnBanner.kind` | `hero / enemy / victory` | b12 B01、B05；b13 160.30 |
| `nameTagSmall.kind` | `head` / `chest` | head：b04–b05 「？？？」→ 56.30 全名溢出；chest：b16 O01「达拉崩吧」「米娅」 |
| `characterCard.face` | `back` / `front` | b06 I1 发牌、64.30–65.35 翻牌 |
| `itemBar.items[].kind` | `card / violin / eggtart / soda / marathon` | b10 M1–M3 听岔 |
| `battleMenu.cursor` 名 | `attack / skill / item / flee` | b12、b13 |

### 4.7 `NAME_TIMES` 分段全表（源码实算，与 storyboard 附录 A 一致）

| 段 | 字 | 字数 | 首字 | 步长 | 逐字时刻 |
|---|---|---|---|---|---|
| `N1a` | 达拉崩吧 | 4 | 41.9 | 0.235 | 41.9 / 42.135 / 42.37 / 42.605 |
| `N1b` | 斑得贝迪 | 4 | 42.84 | 0.240 | 42.84 / 43.08 / 43.32 / 43.56 |
| `N1c` | 卜多比鲁翁 | 5 | 43.8 | 0.260 | 43.8 / 44.06 / 44.32 / 44.58 / 44.84 |
| `N2a` | 达拉崩吧 | 4 | 45.94 | 0.205 | 45.94 / 46.145 / 46.35 / 46.555 |
| `N2b` | 斑得贝迪 | 4 | 46.76 | 0.238 | 46.76 / 46.998 / 47.235 / 47.472 |
| `N2c` | 卜多比鲁翁 | 5 | 47.71 | 0.320 | 47.71 / 48.03 / 48.35 / 48.67 / 48.99 |
| `N3a` | 达拉崩吧 | 4 | 49.83 | 0.185 | 49.83 / 50.015 / 50.2 / 50.385 |
| `N3b` | 斑得贝迪 | 4 | 50.57 | 0.300 | 50.57 / 50.87 / 51.17 / 51.47 |
| `N3c` | 卜多比鲁翁 | 5 | 51.77 | 0.282 | 51.77 / 52.052 / 52.334 / 52.616 / 52.898 |
| `N4a` | 达拉崩吧 | 4 | 54 | 0（同时） | 54 ×4 |
| `N4b` | 斑得贝迪 | 4 | 54.68 | 0（同时） | 54.68 ×4 |
| `N4c` | 卜多比鲁翁 | 5 | 55.71 | 0（同时） | 55.71 ×5 |
| `D1a` | 昆图库塔卡提考特 | 8 | 105.36 | 0.316 | 105.36 / 105.676 / 105.993 / 106.309 / 106.625 / 106.941 / 107.257 / 107.574 |
| `D1b` | 苏瓦西拉松 | 5 | 107.89 | 0.252 | 107.89 / 108.142 / 108.394 / 108.646 / 108.898 |
| `D2a` | 昆图库塔卡提考特 | 8 | 109.76 | 0.241 | 109.76 / 110.001 / 110.243 / 110.484 / 110.725 / 110.966 / 111.207 / 111.449 |
| `D2b` | 苏瓦西拉松 | 5 | 111.69 | 0.324 | 111.69 / 112.014 / 112.338 / 112.662 / 112.986 |
| `D3a` | 昆图库塔卡提考特 | 8 | 117.66 | 0.249 | 117.66 / 117.909 / 118.157 / 118.406 / 118.655 / 118.904 / 119.153 / 119.401 |
| `D3b` | 苏瓦西拉松 | 5 | 119.65 | 0.264 | 119.65 / 119.914 / 120.178 / 120.442 / 120.706 |
| `B10a` | 达拉崩吧 | 4 | 153.78 | 0.255 | 153.78 / 154.035 / 154.29 / 154.545 |
| `B10b` | 斑得贝迪 | 4 | 154.8 | 0.250 | 154.8 / 155.05 / 155.3 / 155.55 |
| `B10c` | 卜多比鲁翁 | 5 | 155.8 | 0.200 | 155.8 / 156 / 156.2 / 156.4 / 156.6 |
| `E02` | 米娅莫拉苏娜丹妮谢莉红 | 11 | 161.65 | 0.312 | 161.65 起每 0.3118s（末字 164.768） |
| `E04` | 蒙达鲁克硫斯伯古比奇巴勒城 | 13 | 165.6 | 0.231 | 165.6 起每 0.2308s（末字 168.37） |
| `E06a` | 达拉崩吧 | 4 | 169.8 | 0.150 | 169.8 / 169.95 / 170.1 / 170.25 |
| `E06b` | 斑得贝迪 | 4 | 170.8 | 0.150 | 170.8 / 170.95 / 171.1 / 171.25 |
| `E06c` | 卜多比鲁翁 | 5 | 171.8 | 0.120 | 171.8 / 171.92 / 172.04 / 172.16 / 172.28 |
| `E08a` | 昆图库塔卡提考特 | 8 | 173.85 | 0.194 | 173.85 起每 0.194s（末字 175.208） |
| `E08b` | 苏瓦西拉松 | 5 | 175.6 | 0.180 | 175.6 / 175.78 / 175.96 / 176.14 / 176.32 |
| `E10` | 米娅莫拉苏娜丹妮谢莉红 | 11 | 177.76 | 0.294 | 177.76 起每 0.2936s（末字 180.696） |
| `E12` | 达拉崩吧斑得贝迪卜多比鲁翁 | 13 | 181.66 | 0.250 | 181.66 起每 0.25s（末字 184.66） |
| `O06` | 王浩然 | 3 | 195.72 | 0.200 | 195.72 / 195.92 / 196.12 |

模型图 `type` 第 4 页（T 3–4）把每段的全部数值印在图上。

---

## 5. 推荐用法

### 5.1 N1 对话框：逐字弹进 → 右框鼓出 → 撕开（b05）

```js
import { dialogBox } from '../ui/kit.js';
import { glyphRow, NAME_TIMES, charsOf } from '../ui/type.js';
const HERO = charsOf('hero');
const T1 = [...NAME_TIMES('N1a'), ...NAME_TIMES('N1b')];          // 前 8 字
// draw(g, T, lt, ctx)
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  const r = dialogBox(lg, { speaker: 'hero', textArea: { x: 600, w: 784 }, bulgeRight: seg(T, 43.56, 43.8), tear: seg(T, 43.8, 43.9), t: T });
  glyphRow(lg, HERO.slice(0, 8), r.textArea.x, 795, 120, {
    style: 'cut', pitch: 98,
    appear: T1.map((t0) => (T - t0) / 0.25),                        // 线性进度，内部 outBack 过冲 1.15
  });
  // r.tear = {x, y0, y1, depth} 撕口位置：N1c 的字从这里飞出
});
```

### 5.2 取名面板 N2：按牌 → 挤压 → 崩飞（b05）

```js
const times = ['N2a', 'N2b', 'N2c'].flatMap(NAME_TIMES);
const tiles = HERO.map((ch, i) => ({ ch, p: (T - times[i]) / 0.25 }));
ctx.layer(g, { shadow: 12, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1.1);                                              // 面板挂在 depth 1.1；或不 applyCam 直接按屏幕坐标
  namePanel(lg, {
    tiles, full: seg(T, 47.5, 47.6) * (1 - seg(T, 47.7, 47.9)), bulge: seg(T, 47.9, 48.6), overTag: seg(T, 48.3, 49.0),
    strings: { left: 48.6, right: 49.15 }, swing: 70 * seg(T, 48.6, 48.9), popFrames: Math.max(0, (T - 49.0) / 0.4),
    drop: seg(T, 49.15, 49.4), t: T,
  });
});
```

### 5.3 旅途 HUD：直接吃 `hudState(T)`（b07、b08、b14）

```js
import { hudState } from '../env/journey.js';
import { drawHUD, expBarBig, lvUpBadge } from '../ui/kit.js';
const st = hudState(T);
ctx.layer(g, { shadow: 8, texture: 0.3 }, (lg) => {
  const a = drawHUD(lg, { ...st, t: T });                            // coinAt / crackAt / heartFlash / expBig / levelUpAt 都认
  if (st.expBig > 0) { const eb = expBarBig(lg, { k: st.expBig, fill: st.exp, lv: st.lv, t: T }); drawSnail(lg, { x: eb.snail[0], y: eb.snail[1], crown: st.snailCrown, t: T }); }
  if (st.levelUpAt != null) lvUpBadge(lg, { x: 960, y: 330, p: (T - st.levelUpAt) / 0.35, t: T });
  // a.coin：飞来的金币对准这里；a.hearts[i]：心的位置
});
```

### 5.4 纸剧场：theaterState → 名字牌 / 菜单 / 横幅（b12、b13）

```js
const S = theaterState(T);
ctx.layer(g, { shadow: 10, texture: 0.25 }, (lg) => {
  const hp = S.hp, hero = S.heroPlate;
  const r = marqueePlate(lg, { side: 'hero', state: hero.state, progress: hero.progress, drop: hero.drop, crack: hero.crack,
    peeled: hero.peeled, hp: hp.hero, hpLag: hp.heroLag, hpText: `HP ${hp.heroNum}`, tf: { s: 1 + 0.08 * hero.pulse }, t: T });
  battleMenu(lg, { ...S.menu, pop: S.menu.show, locked: S.menu.gray, t: T });   // cursor 名 / flash / submenu.select 都认
  turnBanner(lg, { ...S.banner, t: T });                             // prev = 翻牌前的字
  // B12：r.passed 每 +1 弹飞一节龙身；r.centerIndex = 当前中线字
});
```

### 5.5 跟随木偶的名签 + 动作插值（b05 56.30）

```js
const c = lerpCam(TR_2S, TR_HIGH, ez(T, 56.0, 56.8, glide));
let head;
ctx.layer(g, { shadow: 10, texture: 0.3 }, (lg) => {
  applyCam(lg, c, 1);
  head = drawHero(lg, { x: 700, y: 840, s: 1, face: 1, t: T, pose: { from: 'idle', to: 'thumbsUp', k: seg(T, 56.2, 56.5) } }).head; // 锚点字段以 rigs/hero.js 为准
});
const [sx, sy] = toScreen(c, 1, head[0], head[1] - 90);              // 世界 → 屏幕
nameTagSmall(g, { x: sx, y: sy, text: charsOf('hero').join(''), textFrom: TXT.unknown, flip: seg(T, 56.3, 56.45), spill: seg(T, 56.45, 56.8), t: T });
```

### 5.6 片名 + 龙背板 + 远景虚化（b06、b09）

```js
ctx.layer(g, { shadow: 14, texture: 0.3 }, (lg) => titleGlyphs(lg, { rise: [0, 1, 2, 3].map((i) => (T - 60.2 - i * 0.15) / 0.4), foil: seg(T, 61.0, 61.6), starAt: 61.7, t: T }));
ctx.layer(g, { blur: 3, alpha: 0.9 }, (lg) => {                       // 景深：模糊交给图层
  applyCam(lg, c, 0.6);
  // plateAnchors：龙身 13 块背板中心 [{x, y, ang}]（由龙木偶的返回锚点给出，镜头自取）
  const lit = ['D1a', 'D1b'].flatMap(NAME_TIMES).map((t0) => (T - t0) / 0.2);
  glyph13(lg, charsOf('dragon'), plateAnchors, { size: 64, state: 'lit', lit, glow: lit, pop: lit.map((k) => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI)) });
});
```

---

## 6. 与 assets.md 的差异

1. `NAME_TIMES` 分段：assets 写 `'E06'`、`'E08'`，源码拆成 `E06a/E06b/E06c`（卷轴三行）与 `E08a/E08b`（八字 + 五字），与 storyboard 附录 A 的分行一致；`B10` 为 `B10a/b/c`。
2. `paperGlyph`：纸边参数是 `edgeW`=0.12（**半宽**，描边总宽 0.24×字号），对应 assets「字号 × 0.18」的视觉效果；返回值是实测字宽（display 约 0.77×字号），style 带格子时返回格宽。新增 `weight / skew / inkCenter / baseline / style / squashY`（squashY 仅 style 路径）。
3. `glyphRow`、`glyphsOnPath` 新增 `pitch`、`align`；`marquee` 新增 `mode / pitch / state / stutter / slip / tremble / skew / span / lead`，返回值增加 `centerX / offset / passed / items`（核心版只返回 `centerIndex`，旧调用不受影响）。`glyph13` 新增 `lit / glow / glyph`，状态可写任意 style 名；`SLOT_STYLE` 各状态现在带 `style` 键（off/lit→plate、fire、gold、steel、stone）。
4. `typeOn` 注释说返回行宽，实际返回逐字位置数组（同 `glyphRow`）。
5. **气球字减薄**（本次收尾）：`balloon` 的鼓起 `puff` 0.034→0.006、深色外缘 `max(2px, 0.034)`→`max(1px, 0.02)`（新增 `ring` 参数）。旧值会把「鲁」「翁」「崩」的内白糊死；只有模型图用到 balloon，其它模块不受影响。
6. `glyphIcon` 比 assets 多 `coin`、`bag`；`circledNum` 只有 1–4（超出夹到 1..4）。
7. `drawHUD`：assets 写“state 直接用 hudState(T)”，本次补齐了 hudState 的字段名（`coinAt / coinBounce / heartFlash / heartShiver / levelUpAt / expBig`，`crackAt` 长度 <5 按时间先后从右往左）；**hudState 不含 `t`，必须 `{ ...hudState(T), t: T }`**。头像圆框 r=58（d 116，assets 写 d 120）。
8. `battleMenu`：`cursor` 可写项名、`flash` 同 `blink`、`submenu.select` 同 `sel`；`turnBanner`：`prev` 同 `textFrom`（对齐 `theaterState`）。
9. `marqueePlate` 头像圆框 r=36（storyboard 写 r=38）；HP 条 y 253–260（storyboard 写 248–262 为外框范围）。
10. `characterCard` 的 `portrait` 回调签名 `(g, x, y, size)`，size=190；`extras` 多 `stars`。
11. 新增导出：`segChars / glyphAdvance / STYLES / STYLE_NAMES / MARQUEE_STATES / TXT / blinkAt / nameTab / ICON_NAMES / portraitHead / portraitFrame / nameTile / HUD_LAYOUT / THEATER_PLATES`。

---

## 7. 已知限制与注意事项

- **性能**：`paperGlyph` 每字 3–6 次 `fillText/strokeText`；`seal` 每字 9 个斑点、`title3` 5 层、`ink` 未写完的字带渐变遮罩。一屏几十个 style 字没问题；**上百个字（如远景字墙）改用无 style 的 `paperGlyph` 或按 storyboard 3.9 画纸带**。字形度量有缓存（5000 条满了清空）。
- 单字 `shadow` 用 canvas shadowBlur，成排字别用（engine.md：避免逐形状 shadowBlur），投影交给 `ctx.layer` 的 `shadow`。
- `balloon` 很薄之后，`puff` 想更鼓只适合「达」「拉」「吧」这类简单字；play 字体的「鲁」本身内白极窄，48px 以下仍偏糊（c 段爆点可接受）。
- `cracked` 走马灯按「滚动速度 ÷ 字距」自己跳格；theaterState 的 `progress` 已按 0.2s 阶梯化，两者叠加时跳格节奏由 progress 决定（若要严格每 0.2s 一格一抖，传连续 progress）。
- `marqueePlate.beat` 内置 1.3Hz 心跳；theaterState 的 `pulse` 已是脉冲序列，请用 `tf.s` 叠加（见 5.4），别再传 `beat`。
- `peeled` 只把字画成空格；B10 剥字飞走、160.4 字飞回需镜头另画（`items` / `window` 给出位置），theaterState 的 `peeled` 在 160.4 后仍为 13，复原段请传 0。
- `drawHUD` 里 `crackAt` 若用按心序号（长度 5）的写法，必须让裂开的心与 `hearts` 一致（从右往左），否则心裂完会弹回整颗。
- `damageNumber` 在 `p ≥ 1` 时直接不画（返回 null），长停留请把 p 停在 0.7 以下。
- `namePanel` 的 `strings` 是**时刻**（与 `t` 比较），`swing` 是**度**；`popFrames` > 0 后格框与牌改在世界坐标里画，不再随 `swing` 转。
- `bubble` 的字号自动按泡大小与字数算；超过 5 字会变得很小。jagged / flame / soft 的边缘随 `t` 抖动属设计（喊叫、火焰、呼吸），纸边（paperPanel 等）只由 seed 决定、逐帧稳定。
- 模型图 0.5 / 0.533 两帧对比已核：kit 面板页只有吊绳摆、超限计数抖、光标闪、「全名」小签摆在变；符号页只有 jagged/flame/soft 气泡在动；type 页只有气球字晃与走马灯滚动。
- `portraitHead` 是简化 Q 版头像（头像框 / 角色卡 / 剧场牌用），正式特写请传木偶头部回调（如 `drawHeroHead`）。

---

## 8. 模型图清单

| 模型图 | 页面（秒） | 最终渲染 |
|---|---|---|
| `src/sheets/type.js` | [0,1) 全部 style ｜ [1,2) glyphsOnPath（含竖排）/ glyph13 六态 / marquee 六态 ｜ [2,3) 片名 / 卷轴墨字 ｜ [3,4) NAME_TIMES 表 ｜ [4,8) 动态 | `out/review/sheets/type/final_t0.50.png` `final_t1.50.png` `final_t2.70.png` `final_t3.50.png` `final_t5.30.png` |
| `src/sheets/kit.js` | [0,1) 符号 / 面板 / 气泡 ｜ [1,2) 对话框 ｜ [2,3) 取名面板 ｜ [3,4) 剧场名字牌 ｜ [4,5) 菜单 / 横幅 / 数字 / 徽章 ｜ [5,6) HUD ｜ [6,7) 道具栏 / 角色卡 ｜ [7,8) 名签 / 头像 ｜ [8,16) 四个动态页 | `out/review/sheets/kit/final_t0.50.png` … `final_t7.50.png`、`final_t9.00.png` `final_t11.30.png` `final_t13.40.png` `final_t15.00.png` |

自检命令：

```bash
./tools/lint.sh src/ui/type.js src/ui/kit.js src/sheets/type.js src/sheets/kit.js docs/api/ui.md
node tools/check.mjs sheets --list type,kit
node tools/render.mjs stills --sheet kit --times 0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,9.0,11.3,13.4,15.0 --outdir out/review/sheets/kit --prefix final_
node tools/render.mjs stills --sheet type --times 0.5,1.5,2.7,3.5,5.3 --outdir out/review/sheets/type --prefix final_
```
