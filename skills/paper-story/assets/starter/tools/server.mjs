import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.png':'image/png'};
export async function startServer(root,port=0){root=path.resolve(root);return await new Promise((resolve,reject)=>{
  const srv=http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
    if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name),rel=path.relative(root,file);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)){res.writeHead(403).end();return;}
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}const start=0,end=stat.size-1;let a=start,b=end,status=200;const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if(range){a=+range[1];b=range[2]?Math.min(+range[2],end):end;if(a>b||a>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}status=206;}
      res.writeHead(status,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes','Content-Length':b-a+1,...(range?{'Content-Range':`bytes ${a}-${b}/${stat.size}`}:{})});fs.createReadStream(file,{start:a,end:b}).on('error',()=>res.destroy()).pipe(res);
    });
  });srv.on('error',reject);srv.listen(port,'127.0.0.1',()=>resolve({srv,port:srv.address().port}));
});}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const {port}=await startServer(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),Number(process.argv[2]||8765));console.log(`Preview: http://127.0.0.1:${port}/`);}
