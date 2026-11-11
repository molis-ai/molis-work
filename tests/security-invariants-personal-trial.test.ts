import {createTrialAuthPeer,trialAccountConfig} from '../examples/personal-trial-tools/mock-auth.mjs';
import {completeInstallationLogin} from './fixtures/installation-login.js';
import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createDesktopWebHost,openMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createWebCatalogAccess,ProjectDeletionService,NATIVE_SESSION_FILE,NATIVE_SESSION_HEADER} from '@molis-ai/molis-work-app-local-host';

// PTR-01 / S-124: a forged confirmation cannot bypass the trusted personal Home policy.
test('PTR-01 S-124 personal permanent deletion retains unique database and attachment before any runtime release',async t=>{
 const root=mkdtempSync(join(tmpdir(),'trial-delete-')),home=join(root,'personal');ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice'));
 const access=createWebCatalogAccess(home,openMolisWorkProjectCatalog); const catalog=await access.withCatalog({homeDirectory:home},current=>current);t.after(async()=>{await access.close();rmSync(root,{recursive:true,force:true});});
 const project=await catalog.createProject({display_name:'唯一原件',actor_id:'alice'}),attachment=join(dirname(project.database_path),'unique.bin');writeFileSync(attachment,Buffer.from([0,255,13,10,67]));
 const db=readFileSync(project.database_path),bytes=readFileSync(attachment);let effects=0;
 const service=new ProjectDeletionService(access.withCatalog,{isPanelAlive(){effects++;return false;},async releaseProject(){effects++;}});
 await assert.rejects(service.deleteProject(home,{project_id:project.project_id,actor_id:'alice',delete_confirmed:true,idempotency_key:'trial-delete-refused'}),{code:'catalog.personal_deletion_unavailable'});
 assert.equal(effects,0);assert.deepEqual(readFileSync(project.database_path),db);assert.deepEqual(readFileSync(attachment),bytes);assert.equal(catalog.listProjectDeletions().length,0);
});

// PTR-01 / S-124: this is the actual HTTP entry, without credentials or a configured sync server.
test('PTR-01 S-124 HTTP refuses permanent cleanup without opening credentials',async()=>{
 const home=mkdtempSync(join(tmpdir(),'trial-http-')),token='synthetic-trial-control-token-0123456789';
 const server=createDesktopWebHost({ptyClientFilePath:()=>'/not-needed-for-this-test'})({homeDirectory:home,controlToken:token});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
 try{for(const [index,path] of ['/api/sync/purge-trash','/api/sync/history/purge'].entries()){
  const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'trial-http-'+index},body:JSON.stringify({namespace:'any',key:'original',revision:1,confirm:true})});
  assert.equal(response.status,409);assert.match((await response.json()).error,/永久清理暂未开放/);
 }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(home,{recursive:true,force:true});}
});


// ASR-02 / PTR-01: account selection and deletion refusal both run through the actual installation HTTP owner.
test('ASR-02 PTR-01 S-124 authenticated personal cleanup refuses while complete document and attachment remain readable',async t=>{
 const home=mkdtempSync(join(tmpdir(),'trial-personal-http-')),authOrigin='https://auth.example.test',rootToken='synthetic-trial-owner-control-0123456789';
 const env={MOLIS_WORK_ACCOUNT_CONFIG:'',MOLIS_WORK_SECRET_BACKEND:'file'};
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const original=fetch;let config:ReturnType<typeof trialAccountConfig>;
 const peer=createTrialAuthPeer({configuration:()=>config,user:()=> 'alice'});
 t.mock.method(globalThis,'fetch',(async(input,init)=>new URL(String(input)).origin===authOrigin?peer.fetch(input,init):original(input,init)) as typeof fetch);
 const server=createDesktopWebHost({ptyClientFilePath:()=>'/not-needed-for-this-test'})({homeDirectory:home,controlToken:rootToken});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
 config={...trialAccountConfig(authOrigin,origin,'work','trial-desktop'),environmentKind:'TEST'};process.env.MOLIS_WORK_ACCOUNT_CONFIG=JSON.stringify(config);
 const proof=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');let token=rootToken,sequence=0;
 const request=(path:string,body?:unknown,extra:Record<string,string>={})=>fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,[NATIVE_SESSION_HEADER]:proof,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'trial-original-'+(++sequence),...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
 const json=async(path:string,body?:unknown)=>{const response=await request(path,body),value=await response.json();assert.ok(response.status<400,JSON.stringify({path,status:response.status,value}));return value;};
 try{
  const begun=await json('/api/personal/login',{});assert.equal((await completeInstallationLogin((path,init)=>request(path,JSON.parse(String(init?.body)),Object.fromEntries(new Headers(init?.headers))),begun.loginUrl,'alice@example.test')).status,200);
  const current=(await json('/api/spaces')).current;token=readFileSync(join(home,'spaces',current.spaceId,'config/web-control-token'),'utf8').trim();
  const project=(await json('/api/settings/projects',{display_name:'唯一原件的个人项目',user_confirmed:true})).project,prefix='/projects/'+project.project_id;
  await json('/api/settings/projects/'+project.project_id+'/plugins',{plugin_id:'pages',expected_revision:await projectPluginRevision({get:path=>json(path)},project.project_id)});
  const markdown='唯一正文🌲\r\n'+('原件不可被清理\n'.repeat(1300));
  const document=(await json(prefix+'/api/plugins/io.molis.work.pages/pages',{title:'唯一正文',markdown})).document;
  const bytes=Buffer.from(Array.from({length:20017},(_,index)=>(index*31)%256)),items=prefix+'/api/plugins/io.molis.work.shelf/items';
  const item=(await json(items,{filename:'unique.bin',mime:'application/octet-stream',bytes_base64:bytes.toString('base64')})).item;
  const beforeDocument=(await json(prefix+'/api/plugins/io.molis.work.pages/pages/'+document.id)).document;
  for(const path of ['/api/sync/purge-trash','/api/sync/history/purge']){
   const refused=await request(path,{namespace:'any',key:'original',revision:1,confirm:true});assert.equal(refused.status,409);assert.match((await refused.json()).error,/永久清理暂未开放/);
  }
  const deletion=await request('/api/settings/projects/'+project.project_id+'/delete',{delete_confirmed:true,idempotency_key:'trial-personal-delete-original'});
  assert.equal(deletion.status,503);assert.equal((await deletion.json()).code,'catalog.personal_deletion_unavailable');
  assert.ok((await json('/api/settings/projects')).projects.some((row:{project_id:string})=>row.project_id===project.project_id));
  assert.deepEqual((await json(prefix+'/api/plugins/io.molis.work.pages/pages/'+document.id)).document,beforeDocument);
  const file=await request(items+'/'+encodeURIComponent(item.item_id)+'/file');assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(home,{recursive:true,force:true});
 }
});
