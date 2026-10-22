import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDesktopWebHost} from '@molis-ai/molis-work-app-desktop';
import {NATIVE_SESSION_FILE,NATIVE_SESSION_HEADER} from '@molis-ai/molis-work-app-local-host';
import {resetSecretStoreCache} from '@molis-ai/molis-work-storage';
import {createTrialAuthServer} from '../examples/personal-trial-tools/mock-auth.mjs';

async function listen(server:Server,port=0){await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a==='object');return 'http://127.0.0.1:'+a.port;}
const close=(server:Server)=>new Promise<void>(resolve=>server.close(()=>resolve()));

// PTR-02: all content is written through actual HTTP/actions. Auth is the explicitly requested local substitute.
test('PTR-02 local trial login creates a personal project, saves full text and attachment, restarts and continues offline',{timeout:60000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'personal-trial-flow-')),home=join(root,'home');
 const reserve=createServer(),origin=await listen(reserve),port=Number(new URL(origin).port);await close(reserve);
 let auth=createTrialAuthServer({webOrigin:origin,stateFile:join(root,'mock-auth.json')}),authOrigin=await listen(auth);
 const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID','MOLIS_WORK_SYNC_ORIGIN','MOLIS_WORK_SYNC_LOCAL','MOLIS_WORK_CLOUD_ORIGIN','MOLIS_WORK_SECRET_BACKEND'];
 const previous=names.map(name=>process.env[name]);names.forEach(name=>delete process.env[name]);
 Object.assign(process.env,{MOLIS_WORK_AUTH_ORIGIN:authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:'molis-work-personal-trial',MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID:'molis-work-personal-trial-desktop',MOLIS_WORK_SECRET_BACKEND:'file'});
 const factory=createDesktopWebHost({ptyClientFilePath:()=>'/unused-for-http-test'}),rootToken='synthetic-personal-trial-control-0123456789';
 let server=factory({homeDirectory:home,controlToken:rootToken}),token=rootToken,sequence=0;await listen(server,port);
 const proof=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
 const request=(path:string,body?:unknown)=>fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Connection:'close',Origin:origin,[NATIVE_SESSION_HEADER]:proof,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'trial-flow-'+(++sequence)},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
 const json=async(path:string,body?:unknown)=>{const r=await request(path,body),value=await r.json();assert.ok(r.status<400,JSON.stringify({path,status:r.status,value}));return value;};
 try{
  const login=await json('/api/personal/login',{}),redirect=await fetch(login.loginUrl,{redirect:'manual'});assert.equal(redirect.status,303);
  const callback=await fetch(redirect.headers.get('location')!,{redirect:'manual'});assert.equal(callback.status,303);
  const signed=await json('/api/personal/status?attempt='+login.loginAttempt);assert.equal(signed.identity.displayName,'个人试用用户（本机模拟）');
  await json('/api/personal/space?kind=personal',{});token=(await json('/api/personal/status')).viewToken;
  assert.equal((await json('/api/spaces')).current.kind,'personal');
  const created=await json('/api/settings/projects',{display_name:'个人首用验证',user_confirmed:true}),id=created.project.project_id,prefix='/projects/'+id;
  await json('/api/settings/projects/'+id+'/plugins',{plugin_id:'pages'});
  const text='完整正文🌲\r\n'+('离线保存与重启\n'.repeat(7000));
  const page=(await json(prefix+'/api/plugins/io.molis.work.pages/pages',{title:'首用文档',markdown:text})).document;assert.ok(page.id);
  const attachment=Buffer.from(Array.from({length:300007},(_,i)=>(i*29)%256));
  const item=(await json(prefix+'/api/shelf/items',{filename:'完整附件.bin',mime:'application/octet-stream',bytes_base64:attachment.toString('base64')})).item;assert.ok(item.item_id);
  const saved=(await json(prefix+'/api/plugins/io.molis.work.pages/pages/'+page.id)).document;assert.match(JSON.stringify(saved.body),/离线保存与重启/);
  const attachmentPath=prefix+'/api/shelf/items/'+item.item_id+'/file';assert.deepEqual(Buffer.from(await(await request(attachmentPath)).arrayBuffer()),attachment);
  await close(server);resetSecretStoreCache();
  // Stop the identity substitute too: no network identity or cloud service is required to retain local work.
  await close(auth);server=factory({homeDirectory:home,controlToken:rootToken});await listen(server,port);
  const offline=await json('/api/personal/status');assert.equal(offline.identity.userId,'local-personal-trial-user');assert.equal(offline.offline,true);token=offline.viewToken;
  assert.equal((await json('/api/spaces')).current.kind,'local','restart begins at the local surface until the person chooses their account space');
  await json('/api/personal/space?kind=personal',{});token=(await json('/api/personal/status')).viewToken;
  assert.equal((await json('/api/spaces')).current.kind,'personal');
  assert.ok((await json('/api/settings/projects')).projects.some((p:{project_id:string})=>p.project_id===id));
  assert.deepEqual((await json(prefix+'/api/plugins/io.molis.work.pages/pages/'+page.id)).document.body,saved.body);
  assert.deepEqual(Buffer.from(await(await request(attachmentPath)).arrayBuffer()),attachment);
  const edited=(await json(prefix+'/api/plugins/io.molis.work.pages/pages/'+page.id,{markdown:'离线后继续编辑',expected_version:saved.version})).document;
  assert.match(JSON.stringify(edited.body),/离线后继续编辑/);
  const sync=await json('/api/sync');assert.equal(sync.available,false,'no mock identity is represented as actual cloud synchronization');
 }finally{
  if(server.listening)await close(server);if(auth.listening)await close(auth);resetSecretStoreCache();names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});rmSync(root,{recursive:true,force:true});
 }
});
