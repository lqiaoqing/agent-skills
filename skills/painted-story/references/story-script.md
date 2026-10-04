# 故事脚本格式（story.md）

`scripts/story_timeline.mjs` 读的是一份普通 Markdown，人写着顺手，也方便给用户过目。完整例子：`examples/lost-star/story.md`。

```markdown
---
title: 豆豆和迷路的小星星
lang: zh-CN                       # zh-CN / en-US …（TTS 默认音色、whisper 语言）
voice: zh-CN-XiaoxiaoNeural       # 旁白音色（TTS 模式）
voices:                           # 角色 → 音色；在这里声明过的名字，“名字：台词”才算角色台词
  豆豆: zh-CN-YunxiaNeural
  小星星: zh-CN-XiaoyiNeural
rate: "-5%"                       # 语速（edge-tts 写法：-10% / +0% / +15%）；pitch: "+0Hz"
style: subtitle                   # subtitle（整句出现，默认）| karaoke（随朗读填色）| none（不出字）
speaker_tags: true                # 角色台词在字幕条左上角挂名字
lead_in: 1.5                      # 开场留白（建立镜头），秒
scene_lead: 0.9                   # 每场开头留白（给新场景一个建立镜头）
gap: 0.4                          # 句间停顿
scene_tail: 0.5                   # 每场最后一句之后的停顿
tail: 2.2                         # 片尾留白（最后一个画面落定）
cps: 4.5                          # 纯字幕模式：中文每秒字数（儿童片 3.5–4.5，成人 5–7）
wps: 2.6                          # 纯字幕模式：英文每秒词数
min: 1.8                          # 纯字幕模式：每句最短 / 最长停留
max: 7
bgm: music/track.mp3              # 可选背景音乐（务必确认许可证）；bgm_db: -18；duck: false 关闭闪避
bpm: 90                           # 没有 BGM 时，角色呼吸/摆动用的节奏
---

# 1 · 废品山的夜 {mood: calm, lead: 2}
> 画面说明：不念、不出字，写给分镜和作画用（会进 STORY.scenes[i].notes）。
旁白：废品山顶上，住着一个小机器人，叫豆豆。 | On top of Junk Hill lived a little robot named Doudou.
豆豆：哎呀，你没事吧？ {pause: 0.8} | Oh no, are you okay?
**路人甲**：粗体名字总算角色（不必在 voices 里声明）。
没有前缀的行也是旁白。
```

规则：

- `#`/`##`/`###` 开一场（scene）。标题里的“1 ·”“场景 1：”编号会被去掉。花括号是这场的选项：
  `lead`（这场开头留白秒数）、`tail`（这场结尾停顿）、`hold`（额外停留），其余键（`mood`、`palette`…）原样进 `STORY`，供分镜参考。
- `>` 开头：画面说明。`<!-- -->`：注释。
- `名字：台词`：只有名字在 `voices`/`speakers` 里声明过、或是“旁白/narrator”时才拆成角色（避免把“他说：”当成角色）。`**名字**：` 总是角色。
- ` | ` 之后：第二行字幕（翻译，双语字幕），不朗读。
- 行内 `{…}` 选项：`pause`（这句之后停多久，替代 `gap`）、`voice`、`rate`、`pitch`（这句单独换音色/语速）。
- 一句太长（字幕条装不下，约 > 23 个汉字）会在最靠近中间的标点处自动拆成两条字幕；更好的做法是在脚本里写短句。

## 输出（写进项目）

| 文件 | 内容 |
|---|---|
| `src/config.js` | `duration`（全片长度）、`bpm/offset`（来自 BGM，没有就是 `bpm`）、`audio: assets/soundtrack.wav` |
| `src/lyrics.js` | `LY_STYLE` + `LY`：每条字幕 `[start, end, text, {speaker, sub, sing, words}]`，`karaoke.js` 画 |
| `src/story.js` | `STORY`（每场 `t0/t1/mood/notes`、每句 `t0/end/show/text/speaker`）+ `SCENE(n)`、`LINE(n, k)` |
| `assets/story.srt` | 同一份字幕（可作软字幕/上传平台用） |
| `assets/timeline.json` | 全部时间 + 警告 |
| `assets/narration.wav`、`assets/soundtrack.wav` | 旁白轨；混好 BGM 的成品音轨（`render.mjs` 自动合进 MP4） |
| `assets/tts/` | 每句 TTS 的 mp3 + 词边界（按文本哈希缓存，改一句只重合成那一句） |

**镜头时间一律写成 `SCENE(n).t0 + …` / `LINE(n, k).t0 - .3` 这种相对写法**：改了台词、换了音色或换成真人录音后重跑
`story_timeline.mjs`，所有镜头跟着走，不用改场景文件。
