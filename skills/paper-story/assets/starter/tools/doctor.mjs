import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromePath,ffmpegPath,run } from './runtime.mjs';
const require=createRequire(import.meta.url);let failed=0;
for(const [name,check] of [['Node',async()=>{if(Number(process.versions.node.split('.')[0])<18)throw new Error('Node >=18 required');return process.version;}],['Playwright',async()=>require.resolve('playwright-core')],['Browser',async()=>chromePath()],['FFmpeg',async()=>{const ff=ffmpegPath();await run(ff,['-version']);return ff;}],['Fonts',async()=>{const dir=new URL('../assets/fonts/',import.meta.url);const n=fs.readdirSync(dir).filter(f=>f.endsWith('.ttf')).length;if(n<4)throw new Error('Bundled fonts missing');return `${n} fonts`;}]] )try{console.log(`OK ${name}: ${await check()}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}
process.exitCode=failed?1:0;
