import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const fonts = resolve(root, '../../../../packages/design-system/fonts');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
const allowed = new Set(['index.html','style.css','app.js','icons.svg','flow.js','flow.css']);
const port = Number(process.env.MOLIS_DESIGN_PORT || 4321);
createServer(async (req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file;
  if(pathname === '/proposal') file = resolve(root,'../proposal.md');
  else if(pathname === '/assets/inter-latin-variable.woff2' || pathname === '/assets/noto-sans-sc-400.woff2') file = resolve(fonts,pathname.split('/').pop());
  else {const name=pathname==='/'?'index.html':pathname.slice(1);if(allowed.has(name))file=resolve(root,name);}
  if(!file){res.writeHead(404);return res.end('Not found');}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Molis Work design demo: http://localhost:${port}`));
