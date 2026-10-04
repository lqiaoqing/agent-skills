# painted-story

水彩手绘风**故事动画**技能：给一个故事（剧本、故事文本，或者只给主题让 agent 先写脚本），用 AI 配音（edge-tts）+ 字幕、纯字幕或你自己的录音，
逐帧画成水彩绘本风的 MP4。引擎和画法与 [painted-mv](../painted-mv) 相同（p5.js + p5.brush，ffmpeg 合成），本技能自带一份，单独安装即可用；
也能做歌曲 MV。说明见 [SKILL.md](SKILL.md)，脚本格式见 [references/story-script.md](references/story-script.md)，来源与许可证见 [NOTICE.md](NOTICE.md)。

```powershell
# AI 配音 + 字幕（需要 uv；走代理时先 $env:HTTPS_PROXY="http://127.0.0.1:7890"）
node $HOME\.claude\skills\painted-story\scripts\new_project.mjs D:\work\my-story --story=story.md --mode=tts
# 纯字幕（可加 --bgm=music.mp3）/ 自己的录音（whisper 自动对齐）
node $HOME\.claude\skills\painted-story\scripts\new_project.mjs D:\work\my-story --story=story.md --mode=subs
node $HOME\.claude\skills\painted-story\scripts\new_project.mjs D:\work\my-story --story=story.md --mode=voice --voice-audio=rec.m4a
cd D:\work\my-story; node render.mjs --gpu; node render.mjs --frames --workers=4; node render.mjs --encode --out=out/story.mp4
```

例子：[examples/lost-star](examples/lost-star)（《豆豆和迷路的小星星》，约 35 秒，中文儿童故事）。
