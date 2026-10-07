import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {chromium} from 'playwright-core';import {startServer} from './server.mjs';import {options,chromePath,ffmpegPath,run} from './runtime.mjs';import {TIMELINE} from '../src/timeline.js';import {PROJECT} from '../src/project.js';
import {makeWarp} from '../src/core/time.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),opt=options(),mode=opt.mode || 'video';
if(!['video','sheet','stills'].includes(mode))throw new Error('Mode must be video, sheet or stills');
const width=Number(opt.width || PROJECT.width || 1920),height=width*9/16,fps=Number(opt.fps || PROJECT.fps || 30),dpr=Number(opt.dpr || width/1920),samples=Number(opt.samples || 1),workers=Number(opt.workers || 2),chunkSeconds=Number(opt['chunk-seconds'] || 6);
if(!Number.isInteger(width)||!Number.isInteger(height)||width%2||height%2||!Number.isFinite(fps)||fps<=0||!Number.isFinite(dpr)||dpr<=0||!Number.isInteger(samples)||samples<1||!Number.isInteger(workers)||workers<1||!Number.isFinite(chunkSeconds)||chunkSeconds<=0)throw new Error('Invalid render dimensions, fps, samples or workers');
const output=path.resolve(root,String(opt.out || (mode==='video'?'out/story.mp4':mode==='sheet'?'out/contact-sheet.jpg':'out/stills')));
if(mode==='video'&&!output.toLowerCase().endsWith('.mp4'))throw new Error('Video output must end in .mp4');
const ffmpeg=ffmpegPath(opt.ffmpeg),chrome=chromePath(opt.chrome),started=Date.now(),browsers=[],errors=[];
let aborted=false,server;
const encoder=args=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve(stdout):reject(new Error(`FFmpeg exit ${c}: ${stderr.slice(-3000)}`)));});finished.catch(()=>{});child.stdin.on('error',()=>{});return {child,finished};};
const launch=async()=>{const b=await chromium.launch({executablePath:chrome,headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});browsers.push(b);return b;};
const open=async b=>{const page=await b.newPage({viewport:{width,height}});page.on('pageerror',e=>{errors.push(e.message);aborted=true;});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());aborted=true;}});const q=new URLSearchParams({capture:'1',dpr:String(dpr),samples:String(samples),fps:String(fps)});if(opt.nograin)q.set('nograin','1');if(opt.nosubs)q.set('nosubs','1');await page.goto(`http://127.0.0.1:${server.port}/?${q}`);await page.waitForFunction(()=>window.ready===true,null,{timeout:60000});if(aborted)throw new Error(errors.join('\n'));return page;};
const png=async(page,t)=>{if(aborted)throw new Error(errors.join('\n'));return Buffer.from(await page.evaluate(t=>{window.renderFrame(t);if(!window.engine.ctx.active.length||window.engine.ctx.errors.length)throw new Error(`Invalid frame ${t}: ${JSON.stringify(window.engine.ctx.errors)}`);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},t),'base64');};
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const safeRemove=dir=>{const resolved=path.resolve(dir);if(path.dirname(resolved)!==path.dirname(output)||!path.basename(resolved).startsWith(path.basename(output)+'.'))throw new Error(`Unsafe temporary directory: ${resolved}`);fs.rmSync(resolved,{recursive:true,force:true});};
try{
  server=await startServer(root);const probeBrowser=await launch(),probe=await open(probeBrowser),duration=await probe.evaluate(()=>window.duration);
  const start=Number(opt.start || 0),end=Number(opt.end || duration);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+1e-5)throw new Error('Invalid start/end range');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  if(mode==='stills'||mode==='sheet'){
    const warp=makeWarp(TIMELINE.warp,TIMELINE.cues,TIMELINE.duration);
    const times=opt.times?String(opt.times).split(',').map(Number):TIMELINE.scenes.map(s=>warp.toReal((s.start+s.end)/2)).filter(t=>t>=start&&t<end);
    if(!times.length||times.some(t=>!Number.isFinite(t)||t<start||t>=end))throw new Error('Frame times must be inside the requested range');
    const dir=mode==='stills'?output:output+'.frames';fs.mkdirSync(dir,{recursive:true});
    for(let i=0;i<times.length;i++){
      const buffer=await png(probe,times[i]);fs.writeFileSync(path.join(dir,mode==='sheet'?`${String(i).padStart(4,'0')}.png`:`t${times[i].toFixed(3)}.png`),buffer);
    }
    if(mode==='sheet'){
      const cols=Math.max(1,Number(opt.cols||3)),tile=Number(opt.tile||480),rows=Math.ceil(times.length/cols);
      await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-framerate','1','-i',path.join(dir,'%04d.png'),'-vf',`scale=${tile}:-1,tile=${cols}x${rows}:padding=8:color=0x271f2b`,'-frames:v','1','-update','1','-q:v','2',output]);safeRemove(dir);
    }
    console.log(JSON.stringify({mode,output,times,errors,seconds:(Date.now()-started)/1000}));
  }else{
    await probeBrowser.close();const hash=createHash('sha256');for(const file of [...walk(path.join(root,'src')),...walk(path.join(root,'assets/fonts'))].sort()){hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));}
    const config={width,height,fps,dpr,samples,start,end,grain:!opt.nograin,subtitles:!opt.nosubs,sourceHash:hash.digest('hex')};
    const work=output+'.work';fs.mkdirSync(work,{recursive:true});const first=Math.round(start*fps),last=Math.round(end*fps),total=last-first,per=Math.max(1,Math.round(chunkSeconds*fps));
    const chunks=Array.from({length:Math.ceil(total/per)},(_,i)=>{const a=first+i*per,b=Math.min(last,a+per),file=path.join(work,`chunk-${String(i).padStart(4,'0')}.mp4`),manifest=file+'.json',expected={...config,a,b};let complete=false;try{complete=!opt.fresh&&fs.statSync(file).size>0&&JSON.stringify(JSON.parse(fs.readFileSync(manifest,'utf8')))===JSON.stringify(expected);}catch{}return {a,b,file,manifest,expected,complete};});
    let next=0,rendered=chunks.filter(c=>c.complete).reduce((n,c)=>n+c.b-c.a,0),lastProgress=0;const cachedFrames=rendered;
    console.log(JSON.stringify({mode,output,duration:end-start,total,cachedFrames,workers,chrome,ffmpeg}));
    const jobs=Array.from({length:Math.min(workers,chunks.length)},()=> (async()=>{
      const browser=await launch(),page=await open(browser);
      while(!aborted&&next<chunks.length){const chunk=chunks[next++];if(chunk.complete)continue;
        const {child,finished}=encoder(['-f','image2pipe','-framerate',String(fps),'-c:v','png','-i','pipe:0','-vf',`scale=${width}:${height}:flags=lanczos`,'-an','-c:v','libx264','-preset','veryfast','-crf',String(opt.crf || 18),'-pix_fmt','yuv420p','-threads','2','-g',String(Math.round(fps*2)),chunk.file]);
        try{for(let f=chunk.a;f<chunk.b;f++){
          const image=await png(page,f/fps);if(!child.stdin.write(image))await Promise.race([once(child.stdin,'drain'),finished.then(()=>{throw new Error('Encoder ended early');})]);rendered++;
          if(Date.now()-lastProgress>15000){lastProgress=Date.now();console.log(`frames ${rendered}/${total} | ${Math.round((Date.now()-started)/1000)}s`);}
        }child.stdin.end();await finished;fs.writeFileSync(chunk.manifest,JSON.stringify(chunk.expected));chunk.complete=true;console.log(`ready ${path.basename(chunk.file)}`);
        }catch(e){aborted=true;child.kill();await finished.catch(()=>{});throw e;}
      }
    })());
    const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    if(aborted||chunks.some(c=>!c.complete))throw new Error('Incomplete render: '+errors.join('\n'));
    await Promise.allSettled(browsers.map(b=>b.close()));
    const list=path.join(work,'concat.txt');fs.writeFileSync(list,chunks.map(c=>`file '${c.file.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
    const part=output.replace(/\.mp4$/i,'.partial.mp4'),audio=opt.audio?path.resolve(root,String(opt.audio)):TIMELINE.audio?path.resolve(root,TIMELINE.audio):null;
    const args=['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list];
    if(audio){args.push('-ss',String(start),'-i',audio,'-map','0:v:0','-map','1:a:0','-af','apad','-c:a','aac','-b:a','192k');}else args.push('-an');
    args.push('-c:v','copy','-t',String(total/fps),'-movflags','+faststart',part);await run(ffmpeg,args,{timeout:300000});
    const decode=await run(ffmpeg,['-hide_banner','-loglevel','error','-i',part,'-map','0:v:0','-f','null','-','-progress','pipe:1','-nostats'],{timeout:300000});
    const decoded=[...decode.stdout.matchAll(/^frame=(\d+)$/gm)].map(m=>+m[1]).at(-1);if(decoded!==total)throw new Error(`Decoded ${decoded} frames; expected ${total}`);
    if(audio)await run(ffmpeg,['-hide_banner','-loglevel','error','-i',part,'-map','0:a:0','-f','null','-']);
    if(fs.existsSync(output))fs.unlinkSync(output);fs.renameSync(part,output);
    const report={...config,frames:decoded,duration:decoded/fps,audio:!!audio,cachedFrames,bytes:fs.statSync(output).size,seconds:(Date.now()-started)/1000,errors};
    fs.writeFileSync(output+'.json',JSON.stringify(report,null,2));if(!opt['keep-work'])safeRemove(work);console.log('complete '+JSON.stringify(report));
  }
}finally{aborted=true;await Promise.allSettled(browsers.map(b=>b.close()));if(server)await new Promise(r=>server.srv.close(r));}
