export const TIMELINE = {"duration":6,"audio":null,"subtitles":true,"scenes":[{"id":"opening","start":0,"end":6,"lines":[{"id":"opening_0","start":0,"end":6,"text":"一封小小的信，也能开启一场冒险。"}]}],"cues":{"opening":0,"opening_0":0,"END":6},"words":{},"warp":{},"cuts":[]};
export const SCENE=id=>{const s=TIMELINE.scenes.find(s=>s.id===id);if(!s)throw new Error(`Unknown scene ${id}`);return s;};
export const LINE=(scene,index)=>{const l=SCENE(scene).lines[index];if(!l)throw new Error(`Unknown line ${scene}/${index}`);return l;};
