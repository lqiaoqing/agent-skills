# 时间轴与声音

`project.json`：`title`、`names`、`palette`（覆盖 PAL 中的键）、`fps`、`width`、`height`。引擎始终按 1920×1080 设计，目前渲染输出限 16:9。

`story.json` 的秒数是绝对时间。推荐以生成器结果为场景起止权威，镜头代码调用 SCENE，不手动编辑生成文件。

```json
{
  "mode": "subs", "gap": 0.2, "sceneTail": 0.3,
  "scenes": [
    {"id":"letter","notes":"打开信封，星星出现", "lines":[
      {"id":"find","text":"信里藏着一颗迷路的星星。","duration":3.5}
    ]},
    {"id":"road","lines":[{"text":"他带着星星走进森林。","duration":4}]}
  ]
}
```

scene 的 `start` 默认衔接上一个 end；`end` 或 `duration` 可覆盖自动估时，但必须覆盖内部行及停顿。line 可指定 `start/end/duration/pause`，字幕模式未给时长时按默认每秒 4.5 字加余量估计。`lead/tail` 是额外时段，镜头仍需覆盖；生成器不会替你画片头尾。ID 必须唯一，scene id 为小写字母开头的 ASCII 标识。

`silent` 隐藏字幕，不阻止背景音乐。`subs` 默认只有字幕；`subtitles:false` 可隐藏字幕。`cuts:[秒数]` 表示硬切，子帧运动模糊不会跨越这些点。

## TTS

```json
{"mode":"tts","voice":"zh-CN-XiaoxiaoNeural","rate":"+0%","gap":0.18,"sceneTail":0.4,"scenes":[{"id":"opening","lines":[{"text":"一封信，开启一场冒险。"}]}]}
```

先运行 `npm run timeline`。工具用 `uv run --with edge-tts`，默认 Python 3.12；可 `npm run timeline -- --python <python-executable>` 或在 story.json 指定 `python`。uv 与首次依赖安装需可用，缓存默认位于项目 `.cache`。

逐句合成以文字、voice、rate 的 hash 缓存 MP3，FFmpeg 测实际时长后写入时间轴，最后延时混成 WAV。首次 TTS 不要给每句固定 end 或过短 scene duration，防止旁白越界。服务失败会报错，不自动替用户改成无声交付。

## 已有录音或歌曲

```json
{
  "mode":"voice", "audio":"input/narration.wav",
  "scenes":[{"id":"opening","start":0,"end":6,"lines":[
    {"id":"hello","text":"一封信，开启一场冒险。","start":0.5,"end":4.1}
  ]}]
}
```

`music` 的格式相同。每行必须给 start/end。工具验证音频时长、复制音频进 `assets/audio`，但不识别人声或提取节拍。已有 SRT/LRC 要先整理；LRC 下一行的开始可以作为上一行结束的初始值，最后一句结束须试听决定。逐字歌词时间仍需要对齐或手工精修。

长音频末尾的空白也需有镜头覆盖；可在最后一幕 hold 到音频结尾。`duration` 默认实际音频长度，不能短于最后场景。

`bgm` 指本地音乐路径，`bgmDb` 默认 -20。有旁白时使用 sidechain ducking；无旁白则循环/裁切并淡入淡出。仅使用用户提供或明确有适用授权的音乐，记录来源，不能把“网上可下载”当许可。

## 逐字事件和整体变速

```json
{"words":{"wish":{"text":"回家","times":[12.1,12.45]}},"warp":{"road":7.2,"END":28}}
```

`words` 的键供 `segChars/NAME_TIMES` 使用，可用 `start/end` 均匀分配作为初稿，但准确卡点用 `times`。`names` 只控制名称文本，不自动创建字时刻。

`warp` 为 cue id 到真实音频秒的映射；也支持 `[{"real":0,"default":0},{"real":8,"default":7}]`。真实和故事时间两列都必须严格递增，不允许倒序。前后采用斜率 1 延展。引擎把真实播放时间映到故事时间；优先直接用音频时间写 story，只有重定时已有镜头时用 warp。生成音频时不要叠加第二套不同步的 warp。
