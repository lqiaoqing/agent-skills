# painted-mv

水彩手绘风动画 / 歌词 MV 技能（p5.js + p5.brush，逐帧画，ffmpeg 合成）。说明见 [SKILL.md](SKILL.md)，来源与许可证见 [NOTICE.md](NOTICE.md)。

```powershell
node $HOME\.claude\skills\painted-mv\scripts\new_project.mjs D:\work\my-mv --audio=song.mp3 --lyrics=song.lrc --title="歌名"
cd D:\work\my-mv; node render.mjs --gpu; node render.mjs --sheet=1,3,5,7 --cols=4 --w=480 --out=out/check/a.jpg
node render.mjs --frames --workers=4; node render.mjs --encode --out=out/mv.mp4
```
