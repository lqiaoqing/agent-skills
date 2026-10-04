# 示例：豆豆和迷路的小星星

原创中文儿童故事（5 场 9 句，约 34 秒），用来演示 painted-story 的三种声音方式。

```powershell
$SKILL = "$HOME\.claude\skills\painted-story"
# A) AI 配音 + 字幕（+ 可选 BGM）
node $SKILL\scripts\new_project.mjs D:\work\lost-star --story=$SKILL\examples\lost-star\story.md --mode=tts [--bgm=uke_bgm.wav]
# B) 纯字幕（有 BGM 时卡拍）
node $SKILL\scripts\new_project.mjs D:\work\lost-star-subs --story=$SKILL\examples\lost-star\story.md --mode=subs --bgm=uke_bgm.wav
# 然后把 src\cast.js 和 src\scenes\*.js 复制进项目的 src\，在 studio.html 里按顺序加 <script>，再出片：
cd D:\work\lost-star; node render.mjs --frames --workers=4; node render.mjs --encode --out=out/lost-star.mp4
```

场景代码里的镜头时间全部写成 `SCENE(n).t0` / `LINE(n, k).t0`，所以同一套 `src/` 用在 TTS、纯字幕、真人录音三种时间轴上都能对上。

BGM 不随仓库分发。演示用的是 “Age of AI” 的尤克里里分轨（Kara Square (mindmapthat)，ccMixter，CC BY 3.0，
<https://ccmixter.org/files/mindmapthat/57559>），截取约 40 秒并做了淡入淡出、响度归一和闪避；使用时请照此署名并注明改动。
