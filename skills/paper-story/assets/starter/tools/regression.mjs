import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright-core';import {startServer} from './server.mjs';import {chromePath} from './runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),{srv,port}=await startServer(root);let browser;
try{browser=await chromium.launch({executablePath:chromePath(),headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/?capture=1&dpr=0.25&nograin=1&nosubs=1`);await page.waitForFunction(()=>window.ready===true);
  const result=await page.evaluate(()=>{
    const g=document.querySelector('canvas').getContext('2d');
    const probe=mode=>window.engine.renderProbe(0,(g,T,lt,ctx)=>{ctx.fx.paper=ctx.fx.grain=ctx.fx.vignette=0;g.fillStyle='#fff';g.fillRect(0,0,1920,1080);ctx.layer(g,mode?{tint:{color:'#000',alpha:0.5,mode}}:{},lg=>{lg.fillStyle='#f00';lg.fillRect(100,100,200,200);});});
    const rows=['multiply','screen','soft-light'].map(mode=>{probe(mode);return {mode,outside:[...g.getImageData(200,200,1,1).data],inside:[...g.getImageData(50,50,1,1).data]};});
    const grab=t=>{window.renderFrame(t);return g.getImageData(0,0,g.canvas.width,g.canvas.height).data.slice();};const t=window.duration*0.4,A=grab(t);grab(window.duration*0.8);const B=grab(t);let max=0,changed=0;for(let i=0;i<A.length;i++){const d=Math.abs(A[i]-B[i]);max=Math.max(max,d);if(d)changed++;}
    return {rows,maxDifference:max,changedChannels:changed};
  });
  for(const r of result.rows)assert.deepEqual(r.outside,[255,255,255,255],`${r.mode} tint escaped layer`);
  assert.ok(result.maxDifference<=1 && result.changedChannels<=32,'Rendering must be independent of intervening frames');
  console.log('PASS layer tint isolation and frame-order determinism',JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>srv.close(r));}
