import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname,basename} from 'node:path';
const root=resolve('.impeccable/qa/folio-baseline/site'),fontDir=process.env.FOLIO_FONT_DIR??'/private/tmp/folio16-fonts';const port=Number(process.env.FOLIO_PORT??4436);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;let file;
if(pathname.startsWith('/fonts/'))file=resolve(fontDir,basename(pathname));else if(pathname.startsWith('/kit/'))file=resolve('docs/design/kit',basename(pathname));else file=resolve(root,pathname==='/'?'index.html':basename(pathname));
try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
