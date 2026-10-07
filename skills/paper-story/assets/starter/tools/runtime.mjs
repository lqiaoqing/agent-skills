import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
export function options(argv=process.argv.slice(2)){const o={};for(let i=0;i<argv.length;i++){if(!argv[i].startsWith('--'))throw new Error(`Expected --option, got ${argv[i]}`);const k=argv[i].slice(2);o[k]=argv[i+1] && !argv[i+1].startsWith('--')?argv[++i]:true;}return o;}
export function chromePath(explicit){
  const candidates=[explicit,process.env.CHROME_PATH,process.platform==='win32' && path.join(process.env.PROGRAMFILES || 'C:/Program Files','Google/Chrome/Application/chrome.exe'),process.platform==='win32' && path.join(process.env.LOCALAPPDATA || '','Google/Chrome/Application/chrome.exe'),process.platform==='win32' && path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  const found=candidates.find(p=>fs.existsSync(p));if(!found)throw new Error('Chrome/Edge not found; set CHROME_PATH or --chrome');return found;
}
export function ffmpegPath(explicit){const p=explicit || process.env.FFMPEG_BIN || process.env.FFMPEG || require('ffmpeg-static');if(!p)throw new Error('FFmpeg not found; npm install or set FFMPEG_BIN');return p;}
export async function run(file,args,{input,timeout=120000,env=process.env}={}){
  return await new Promise((resolve,reject)=>{const p=spawn(file,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,env});let stdout='',stderr='',settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({stdout,stderr});};const timer=setTimeout(()=>{p.kill();finish(new Error(`${path.basename(file)} timed out`));},timeout);p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',finish);p.on('close',c=>finish(c===0?null:new Error(`${path.basename(file)} exit ${c}: ${stderr.slice(-3000)}`)));p.stdin.on('error',()=>{});p.stdin.end(input);});
}
export async function mediaDuration(file,ffmpeg){
  const result=await new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-hide_banner','-i',file],{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';p.stderr.on('data',b=>log+=b);p.on('error',reject);p.on('close',()=>resolve(log));});
  const m=result.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);if(!m)throw new Error(`Cannot read duration of ${file}`);return +m[1]*3600+ +m[2]*60+ +m[3];
}
