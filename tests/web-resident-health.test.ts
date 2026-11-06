import {createServer,type ServerResponse} from 'node:http';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSpaceWebServer,createMcpResidentStarter} from '@molis-ai/molis-work-app-local-host';
import {serveTestHost} from './fixtures/test-home.js';

test('the public space listener proves a ready resident after catalog startup and stops proving it on close',async t=>{
  const home=await mkdtemp(join(tmpdir(),'web-resident-health-'));
  const starter=createMcpResidentStarter();
  const served=await serveTestHost(null,{home});
  t.after(async()=>{starter.close();await served.close();await rm(home,{recursive:true,force:true});});
  await served.createProject('Health readiness');
  const response=await fetch(served.origin+'/health?challenge='+randomBytes(32).toString('base64url'));
  assert.equal(response.status,200,'an embedded surface must use its public listener readiness');
  const health=await response.json() as {status:string;desktop_tui:boolean};
  assert.equal(health.status,'ok');assert.equal(health.desktop_tui,true);
  assert.ok(response.headers.get('x-molis-work-proof'),'readiness still carries this Home’s health proof');
  // The real resident startup path verifies probeMcpResident’s challenge, signature and payload.
  await starter.ensure(home,served.origin,AbortSignal.timeout(5000));
  await served.close();
  await assert.rejects(starter.ensure(home,served.origin,AbortSignal.timeout(5000)),{code:'mcp.startup_entry_missing'},'a closed public listener cannot be reused as a ready resident');
});


test('closing a space listener stops NDJSON streams while pending action responses can finish',async t=>{
 const home=await mkdtemp(join(tmpdir(),'space-close-stream-'));
 let pending:ServerResponse|undefined,stream:ServerResponse|undefined,entered!:()=>void;
 const reached=new Promise<void>(resolve=>{entered=resolve;});
 const server=createSpaceWebServer({homeDirectory:home,controlToken:'synthetic-stream-control-token-0123456789'},()=>createServer((request,response)=>{
  if(request.url==='/events'){stream=response;response.writeHead(200,{'content-type':'application/x-ndjson'});response.write('{"ready":true}\n');}
  else {pending=response;entered();}
 }));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const origin='http://127.0.0.1:'+address.port;
 t.after(async()=>{stream?.destroy();pending?.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(home,{recursive:true,force:true});});
 const events=await fetch(origin+'/events');await events.body!.getReader().read();
 const response=fetch(origin+'/pending',{headers:{connection:'close'}});await reached;
 const closed=new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 assert.equal(stream!.destroyed,true,'an open stream is terminated when closing begins');
 pending!.end('host closed');assert.equal(await(await response).text(),'host closed');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([closed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('stream prevented listener shutdown')),2000);})]);}
 finally{clearTimeout(timer);}
});
