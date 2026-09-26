import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const repo=resolve(root,'../../../..');
const files=new Map(['index.html','style.css','app.js','data.js'].map(name=>['/'+name,resolve(root,name)]));
files.set('/',resolve(root,'index.html'));
for(const name of ['inter-latin-variable.woff2','noto-sans-sc-400.woff2']) files.set('/assets/'+name,resolve(repo,'packages/design-system/fonts',name));
for(const name of ['gmail','feishu']) files.set('/assets/'+name+'.svg',resolve(repo,'apps/workbench/src/assets/connector-icons',name+'.svg'));
files.set('/assets/lucide.min.js',resolve(repo,'node_modules/.pnpm/lucide@1.31.0/node_modules/lucide/dist/umd/lucide.min.js'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const port=Number(process.env.MOLIS_ONBOARDING_DEMO_PORT||4336);
createServer(async(req,res)=>{
  const file=files.get(new URL(req.url,'http://localhost').pathname);
  if(!file||req.method!=='GET'){res.writeHead(404);return res.end('Not found');}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Molis onboarding prototype: http://127.0.0.1:${port}`));
