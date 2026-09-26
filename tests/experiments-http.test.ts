import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createMolisWorkWebServer} from "../apps/desktop/launchers/web/server.js";
import {closeExperiments} from "../apps/local-host/src/experiments-native-plugin-http.ts";
import {openFunctionsStore} from "@molis-ai/molis-work-module-functions";
import {resetSecretStoreCache} from "@molis-ai/molis-work-storage";
import {withConnectorConnections} from "../apps/local-host/src/connector-connection-store.ts";
import {capture} from "../apps/local-host/src/experiments-process.ts";
test("HTTP enforces host control, imports the actual function snapshot, and reuses SecretStore without echo",async()=>{
 const home=await mkdtemp(join(tmpdir(),'experiments-http-')),token='experiments-fixture-token-0123456789';
 const prev={backend:process.env.MOLIS_WORK_SECRET_BACKEND,key:process.env.MOLIS_WORK_ENCRYPTION_KEY};
 process.env.MOLIS_WORK_SECRET_BACKEND='file';process.env.MOLIS_WORK_ENCRYPTION_KEY=Buffer.alloc(32,17).toString('base64');resetSecretStoreCache();
 const server=createMolisWorkWebServer({homeDirectory:home,controlToken:token});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address() as {port:number},origin='http://127.0.0.1:'+addr.port;
 const headers=()=>({'content-type':'application/json',origin,'x-molis-work-control-token':token,'x-molis-work-idempotency-key':crypto.randomUUID()});
 const post=(path:string,body:unknown)=>fetch(origin+'/api/experiments'+path,{method:'POST',headers:headers(),body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(origin+'/api/experiments',{method:'POST',body:'{}'})).status,403);
  const f=openFunctionsStore(home);let fn;try{fn=f.createChoice({name:'fixture'});fn=f.updateDraft(fn.id,{instructions:'原始函数标准',criteria:[{key:'yes',description:'支持'},{key:'no',description:'不支持'}]});}finally{f.close();}
  const body={name:'函数快照 fixture',function_id:fn.id,task:{instructions:'伪造标准',criteria:[]},cases:[{id:'a',label:'fixture',input:'fixture',source:'fixture',reference:null,reference_status:'unlabeled',rationale:''}],participants:[{id:'jev',name:'Jev',kind:'jev',model:'jev-latest'}]};
  const created=await post('',body);assert.equal(created.status,201);const e=(await created.json()).experiment;
  assert.equal(e.task.instructions,'原始函数标准');assert.equal(e.task.function_snapshot.config_hash,fn.config_hash);
  assert.equal((await post('',{...body,function_id:undefined,task:{...e.task}})).status,400);
  assert.equal((await post('/credential',{key:'fixture-key-not-real'})).status,400);
  const createdConnection=await fetch(origin+'/api/settings/connectors/connections',{method:'POST',headers:headers(),body:JSON.stringify({service_id:'typesafe',display_name:'实验用 TypeSafe',token:'fixture-key-not-real'})});
  assert.equal(createdConnection.status,201);
  const connectionId=(await createdConnection.json()).connection.connection_id as string;
  const saved=await post('/credential',{connection_id:connectionId});assert.equal(saved.status,200);assert.doesNotMatch(await saved.text(),/fixture-key/);
  assert.equal(withConnectorConnections(home,store=>store.resolveToken(connectionId,'typesafe')),'fixture-key-not-real');
  const settings=await (await fetch(origin+'/api/functions/settings')).json();assert.equal(settings.has_credential,false);
  const models=await (await fetch(origin+'/api/experiments/models')).json();
  assert.equal(models.selected_connection_id,connectionId);
  assert.equal(models.status.find((row:{id:string})=>row.id==='jev')?.configured,true);
  assert.doesNotMatch(JSON.stringify(models),/fixture-key/);
  const reopened=await (await fetch(origin+'/api/experiments/'+e.id)).json();assert.equal(reopened.experiment.hash,e.hash);
  for (const alias of ['experiments','io.molis.work.experiments']) {
   const routed=await fetch(origin+'/api/plugins/'+alias+'/'+e.id);assert.equal(routed.status,200);assert.deepEqual(await routed.json(),reopened);
  }
  const exported=await fetch(origin+'/api/experiments/'+e.id+'/export');assert.match(exported.headers.get('content-disposition')!,/attachment; filename=/);assert.deepEqual(await exported.json(),reopened);
  const custom={id:'custom-fixture',name:'自建配置',kind:'jev',model:'jev-latest'};
  assert.equal((await post('/models',custom)).status,200);
  assert.ok((await (await fetch(origin+'/api/experiments/models')).json()).saved_ids.includes(custom.id));
  assert.equal((await fetch(origin+'/api/experiments/models/'+custom.id,{method:'DELETE'})).status,403);
  assert.equal((await fetch(origin+'/api/experiments/models/'+custom.id,{method:'DELETE',headers:headers()})).status,200);
  assert.ok(!(await (await fetch(origin+'/api/experiments/models')).json()).saved_ids.includes(custom.id));
  const builtin={id:'jev',name:'Jev 自定义',kind:'jev',model:'jev-latest'};
  assert.equal((await post('/models',builtin)).status,200);
  assert.equal((await (await fetch(origin+'/api/experiments/models')).json()).participants.find((p:{id:string})=>p.id==='jev')?.name,'Jev 自定义');
  assert.equal((await fetch(origin+'/api/experiments/models/jev',{method:'DELETE',headers:headers()})).status,200);
  const restored=await (await fetch(origin+'/api/experiments/models')).json();
  assert.equal(restored.participants.find((p:{id:string})=>p.id==='jev')?.name,'Jev · TypeSafe');
  assert.ok(!restored.saved_ids.includes('jev'));
  assert.equal((await fetch(origin+'/api/experiments/'+e.id,{method:'DELETE',headers:headers()})).status,200);
  assert.equal((await (await fetch(origin+'/api/experiments')).json()).experiments.length,0);
 }finally{
  await new Promise<void>(r=>server.close(()=>r()));await closeExperiments(home);resetSecretStoreCache();
  if(prev.backend===undefined)delete process.env.MOLIS_WORK_SECRET_BACKEND;else process.env.MOLIS_WORK_SECRET_BACKEND=prev.backend;
  if(prev.key===undefined)delete process.env.MOLIS_WORK_ENCRYPTION_KEY;else process.env.MOLIS_WORK_ENCRYPTION_KEY=prev.key;
  await rm(home,{recursive:true,force:true});
 }
});
test("runtime capture cancellation terminates the launched process and never prints stderr",async()=>{
 const controller=new AbortController();const promise=capture(process.execPath,['-e','process.stderr.write("secret fixture");setInterval(()=>{},1000)'],{cwd:tmpdir(),signal:controller.signal});setTimeout(()=>controller.abort(),60);
 await assert.rejects(promise,/已取消/);
 await assert.rejects(capture(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:tmpdir(),signal:new AbortController().signal,timeout:60}),/超过时限/);
});
