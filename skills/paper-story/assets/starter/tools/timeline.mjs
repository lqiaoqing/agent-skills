import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {options,ffmpegPath,mediaDuration,run} from './runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),opt=options();
const source=path.resolve(root,String(opt.story || 'story.json')),story=JSON.parse(fs.readFileSync(source,'utf8'));
const config=JSON.parse(fs.readFileSync(path.join(root,'project.json'),'utf8')),mode=opt.mode || story.mode || 'subs';
if(!['silent','subs','tts','voice','music'].includes(mode))throw new Error(`Unknown mode ${mode}`);
if(!Array.isArray(story.scenes)||!story.scenes.length)throw new Error('story.scenes must be nonempty');
const number=(x,label,min=0)=>{x=Number(x);if(!Number.isFinite(x)||x<min)throw new Error(`Invalid ${label}`);return x;};
const durationOf=line=>number(line.duration ?? Math.max(1.8,[...String(line.text||'')].length/(story.cps||4.5)+0.5),'line duration',0.01);
const scenes=[],cues={},words=story.words || {};let cursor=number(story.lead || 0,'lead'),audio=null;const audioSegments=[];
for(const [id,event] of Object.entries(words)){
  if(typeof event.text!=='string'||!event.text.length)throw new Error(`Invalid word text ${id}`);
  if(event.times){if(!Array.isArray(event.times)||event.times.length!==[...event.text].length||event.times.some((t,i)=>!Number.isFinite(t)||t<0||(i>0&&t<event.times[i-1])))throw new Error(`Invalid per-character times ${id}`);}
  else if(!Number.isFinite(event.start)||!Number.isFinite(event.end)||event.start<0||event.end<=event.start)throw new Error(`Provide times or start/end for word ${id}`);
}
let ff;
if(['tts','voice','music'].includes(mode))ff=ffmpegPath(opt.ffmpeg);
if(mode==='voice'||mode==='music'){
  const audioFile=opt.audio || story.audio;if(!audioFile)throw new Error(`${mode} mode requires audio and explicit line start/end cues`);
  const input=path.resolve(root,String(audioFile));if(!fs.existsSync(input))throw new Error(`Audio not found: ${input}`);
  fs.mkdirSync(path.join(root,'assets/audio'),{recursive:true});const copied=path.join(root,'assets/audio/source'+path.extname(input));if(input!==copied)fs.copyFileSync(input,copied);audio=path.relative(root,copied).replaceAll('\\','/');
}
const ids=new Set();
for(const raw of story.scenes){
  if(!/^[a-z][a-z0-9_-]*$/.test(raw.id)||ids.has(raw.id))throw new Error(`Invalid or duplicate scene id ${raw.id}`);ids.add(raw.id);
  const start=number(raw.start ?? cursor,'scene start');if(start<cursor-1e-6)throw new Error(`Overlapping scene ${raw.id}`);
  let next=start;const lines=[];
  for(let i=0;i<(raw.lines||[]).length;i++){
    const item=raw.lines[i],id=item.id || `${raw.id}_${i}`;if(ids.has(id))throw new Error(`Duplicate cue ${id}`);ids.add(id);
    let length=durationOf(item),file=null;
    if(mode==='tts'){
      const voice=item.voice || raw.voice || story.voice || 'zh-CN-XiaoxiaoNeural',rate=item.rate || story.rate || '+0%';
      const key=createHash('sha256').update(JSON.stringify([item.text,voice,rate])).digest('hex').slice(0,16);
      file=path.join(root,'assets/tts',key+'.mp3');fs.mkdirSync(path.dirname(file),{recursive:true});
      if(!fs.existsSync(file))await run('uv',['run','--python',String(opt.python || story.python || '3.12'),'--with','edge-tts','edge-tts','--voice',voice,'--rate='+rate,'--text',String(item.text),'--write-media',file],{timeout:90000,env:{...process.env,UV_CACHE_DIR:process.env.UV_CACHE_DIR || path.join(root,'.cache/uv'),UV_PYTHON_INSTALL_DIR:process.env.UV_PYTHON_INSTALL_DIR || path.join(root,'.cache/python')}});
      length=await mediaDuration(file,ff);
    }
    const at=number(item.start ?? next,'line start');if(at<next-1e-6)throw new Error(`Overlapping or backwards line ${id}`);
    if((mode==='voice'||mode==='music')&&(item.start===undefined||item.end===undefined))throw new Error(`Provide start/end for ${id}; use SRT/LRC to create explicit cues before rendering`);
    const end=number(item.end ?? at+length,'line end');if(end<=at)throw new Error(`Line ${id} must have positive duration`);
    lines.push({id,start:at,end,text:String(item.text || ''),speaker:item.speaker || ''});cues[id]=at;
    if(file)audioSegments.push({file,start:at});next=end+number(item.pause ?? story.gap ?? 0,'pause');
  }
  const end=number(raw.end ?? (raw.duration!==undefined?start+number(raw.duration,'scene duration',0.01):next+number(story.sceneTail||0,'scene tail')),'scene end');
  if(end<=start || end<next-1e-5)throw new Error(`Scene ${raw.id} ends before its lines/pause; increase duration`);
  scenes.push({id:raw.id,start,end,notes:raw.notes || '',lines});cues[raw.id]=start;cursor=end;
}
let duration=cursor+number(story.tail || 0,'tail');
if(mode==='voice'||mode==='music'){
  const media=await mediaDuration(path.join(root,audio),ff);if(duration>media+0.15)throw new Error(`Story ends ${duration}s but audio is ${media}s`);duration=number(story.duration ?? media,'duration');if(duration<cursor)throw new Error('Duration shorter than last scene');
}
if(audioSegments.length){
  fs.mkdirSync(path.join(root,'assets/audio'),{recursive:true});const dst=path.join(root,'assets/audio/narration.wav');
  const inputs=audioSegments.flatMap(s=>['-i',s.file]);const filters=audioSegments.map((s,i)=>`[${i}:a]aresample=48000,adelay=${Math.round(s.start*1000)}:all=1[a${i}]`);
  filters.push(audioSegments.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${audioSegments.length}:normalize=0,apad,atrim=0:${duration}[mix]`);
  await run(ff,['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex',filters.join(';'),'-map','[mix]','-ac','2','-c:a','pcm_s16le',dst]);audio='assets/audio/narration.wav';
}
if(story.bgm){
  ff ||= ffmpegPath(opt.ffmpeg);const bgm=path.resolve(root,story.bgm),dst=path.join(root,'assets/audio/soundtrack.wav');fs.mkdirSync(path.dirname(dst),{recursive:true});
  const volume=Number(story.bgmDb ?? -20);if(!Number.isFinite(volume))throw new Error('Invalid bgmDb');
  if(audio)await run(ff,['-hide_banner','-loglevel','error','-y','-i',path.join(root,audio),'-stream_loop','-1','-i',bgm,'-filter_complex',`[0:a]asplit[voice][side];[1:a]volume=${volume}dB[bg];[bg][side]sidechaincompress=threshold=0.02:ratio=6[duck];[voice][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:${duration}[mix]`,'-map','[mix]','-ac','2',dst]);
  else await run(ff,['-hide_banner','-loglevel','error','-y','-stream_loop','-1','-i',bgm,'-t',String(duration),'-af',`volume=${volume}dB,afade=t=in:d=0.5,afade=t=out:st=${Math.max(0,duration-0.7)}:d=0.7`,'-ac','2',dst]);audio='assets/audio/soundtrack.wav';
}
cues.END=duration;
const timeline={duration,audio,subtitles:mode!=='silent'&&story.subtitles!==false,scenes,cues,words,warp:story.warp || {},cuts:story.cuts || []};
fs.writeFileSync(path.join(root,'src/timeline.js'),`export const TIMELINE = ${JSON.stringify(timeline,null,2)};\nexport const SCENE=id=>{const s=TIMELINE.scenes.find(s=>s.id===id);if(!s)throw new Error('Unknown scene '+id);return s;};\nexport const LINE=(scene,index)=>{const l=SCENE(scene).lines[index];if(!l)throw new Error('Unknown line '+scene+'/'+index);return l;};\n`);
fs.writeFileSync(path.join(root,'src/project.js'),`export const PROJECT = ${JSON.stringify(config,null,2)};\n`);
fs.writeFileSync(path.join(root,'assets/timeline.json'),JSON.stringify(timeline,null,2));
const srt=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(root,'assets/story.srt'),scenes.flatMap(s=>s.lines).map((l,i)=>`${i+1}\n${srt(l.start)} --> ${srt(l.end)}\n${l.text}\n`).join('\n'));
console.log(JSON.stringify({mode,duration,audio,scenes:scenes.map(s=>({id:s.id,start:s.start,end:s.end})),lines:scenes.flatMap(s=>s.lines).length}));
