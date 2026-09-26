import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/continuity':'continuity.html','/continuity/style.css':'style.css','/continuity/client.js':'client.js'};
createServer(async(req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404).end();return}res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(new URL(file,import.meta.url)))}).listen(4188,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4188/continuity?preview=1'));
