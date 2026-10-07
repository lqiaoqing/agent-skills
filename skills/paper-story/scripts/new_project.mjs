import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2),target=argv.shift();if(!target)throw new Error('Usage: node new_project.mjs <directory> [--example postal] [--pack fantasy] [--install]');
const opt={};for(let i=0;i<argv.length;i++){const k=argv[i].replace(/^--/,'');opt[k]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}
if(opt.pack&&opt.pack!=='fantasy')throw new Error(`Unknown pack ${opt.pack}`);
if(opt.example&&opt.example!=='postal')throw new Error(`Unknown example ${opt.example}`);
const dest=path.resolve(target);if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw new Error(`Target must be new or empty: ${dest}`);
function copyTree(source,target){fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source,{withFileTypes:true})){const from=path.join(source,entry.name),to=path.join(target,entry.name);if(entry.isDirectory())copyTree(from,to);else fs.writeFileSync(to,fs.readFileSync(from));}}
fs.mkdirSync(dest,{recursive:true});copyTree(path.join(skill,'assets/starter'),dest);
fs.writeFileSync(path.join(dest,'NOTICE.md'),fs.readFileSync(path.join(skill,'NOTICE.md')));
const pack=opt.pack || (opt.example==='postal'?'fantasy':null);
if(pack){if(pack!=='fantasy')throw new Error(`Unknown pack ${pack}`);copyTree(path.join(skill,'assets/fantasy-pack/src'),path.join(dest,'src'));}
if(opt.example){if(opt.example!=='postal')throw new Error(`Unknown example ${opt.example}`);copyTree(path.join(skill,'examples/postal/project'),dest);}
const timeline=spawnSync(process.execPath,[path.join(dest,'tools/timeline.mjs')],{cwd:dest,stdio:'inherit'});if(timeline.status)throw new Error('Timeline generation failed');
if(opt.install){const npm=process.platform==='win32'?'npm.cmd':'npm';const result=spawnSync(npm,['install','--no-audit','--no-fund','--cache','.cache/npm'],{cwd:dest,stdio:'inherit',shell:process.platform==='win32'});if(result.status)throw new Error('npm install failed; project is preserved');}
console.log(`Created ${dest}\nNext: npm install, npm run doctor, npm run check, npm run preview`);
