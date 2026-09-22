import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {createMolisWorkLocalHost,molisWorkHostProjectReference,initializeBoardCapability,createGoalIntentCapability,MolisWorkCasebookIntegration} from '@molis-ai/molis-work-app-local-host';
import {submitGoalEventClosureCapability,readGoalEventStateCapability} from '@molis-ai/molis-work-plugin-goals';
import {createMolisWorkWebServer} from '../apps/desktop/launchers/web/server.js';
import {MolisWorkCasebookClient} from '../apps/local-host/src/casebook/client.js';
import {PURPOSE,CONTEXT_PURPOSE,VERSION} from '../apps/local-host/src/casebook/contract.js';
import {conforms} from '../apps/local-host/src/casebook/schema.js';

async function fixture(t:test.TestContext){
 const dir=mkdtempSync(join(tmpdir(),'casebook-current-'));const host=createMolisWorkLocalHost();
 const ref=molisWorkHostProjectReference({databasePath:join(dir,'test.db'),boardId:'board'});const client=host.client(ref);
 await client.invoke(initializeBoardCapability,{board_id:'board',title:'项目与目标名称不同',actor_id:'user',idempotency_key:'init'});
 const api=new MolisWorkCasebookIntegration({client,verifyUserAction:()=>true});
 const action=(action:'join'|'pause'|'resume'|'remove',key=action)=>api.setInteractionAuthorization({project_ref:'board',purpose:PURPOSE,include_goal_context:true,action,actor_ref:'test-user',user_action_ref:'isolated-fixture',user_confirmed:true,idempotency_key:key});
 const read=async()=>{const auth=await api.readInteractionAuthorization({project_ref:'board',purpose:PURPOSE}) as {authorization_epoch:string};return api.readInteractionFacts({project_ref:'board',schema_version:VERSION,authorization_epoch:auth.authorization_epoch,after_cursor:0,limit:100});};
 const create=(id:string)=>client.invoke(createGoalIntentCapability,{board_id:'board',goal_id:id,title:'目标秘密标题',actor_id:'user',idempotency_key:'create-'+id});
 t.after(async()=>{await host.close();rmSync(dir,{recursive:true,force:true});});return {dir,host,ref,client,api,action,read,create};
}
test('current event capabilities record attempt/result/state and real refused closure without business text',async t=>{
 const f=await fixture(t);await f.create('before');await assert.rejects(f.read(),{code:'not_authorized'});await f.action('join');
 await f.create('work');
 const state=await f.client.invoke(readGoalEventStateCapability,{board_id:'board',goal_id:'work'});
 const result=await f.client.invoke(submitGoalEventClosureCapability,{board_id:'board',goal_id:'work',actor_id:'user',idempotency_key:'close',kind:'complete',reason:'秘密理由',expected_config_version:state.config.version,expected_agreement_version:state.agreement.version});
 assert.equal(result.completion_applied,false);assert.ok(result.unmet_reasons.length>0);
 const batch=await f.read();assert.equal(batch.schema_version,'2.0.0');assert.equal(batch.facts.length,6);assert.ok(conforms(batch));
 const fact=batch.facts.at(-1)!;assert.equal(fact.accepted,false);assert.equal(fact.outcome,'returned');
 assert.deepEqual(fact.result_reasons.map(x=>x.code),result.unmet_reasons.map(x=>x.code));
 assert.equal(fact.event_state?.work_status,'open');assert.equal(fact.saved?.event_refs.length,1);
 assert.equal(JSON.stringify(batch).includes('秘密'),false);
 const contextAuth=await f.api.readInteractionAuthorization({project_ref:'board',purpose:CONTEXT_PURPOSE}) as {authorization_epoch:string};
 const context=await f.api.readGoalContexts({project_ref:'board',schema_version:VERSION,authorization_epoch:batch.authorization_epoch,context_authorization_epoch:contextAuth.authorization_epoch,operation_ids:[fact.operation_id]});
 assert.equal(context.contexts[0]?.goal_title,'目标秘密标题');
 await f.action('pause');await assert.rejects(f.read(),{code:'not_authorized'});await f.action('resume');assert.equal((await f.read()).facts.length,6);
 await f.action('remove');await f.action('join','rejoin');assert.equal((await f.read()).facts.length,0);
});
test('discovery returns only granted catalog identity/name and never opens a project or joins it',async t=>{
 const {openMolisWorkProjectCatalog}=await import('@molis-ai/molis-work-app-desktop');
 const homeDirectory=mkdtempSync(join(tmpdir(),'casebook-discovery-'));const catalog=await openMolisWorkProjectCatalog({homeDirectory});
 const a=await catalog.createProject({display_name:'项目 A',actor_id:'fixture'});const b=await catalog.createProject({display_name:'不允许暴露 B',actor_id:'fixture'});catalog.close();
 const host=createMolisWorkLocalHost();const token=randomBytes(32).toString('hex');
 const server=createMolisWorkWebServer({homeDirectory,localHost:host,casebook:{grants:[{token,project_ref:a.project_id}],restoreProjects:[a.project_id]}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await host.close();rmSync(homeDirectory,{recursive:true,force:true});});
 const address=server.address();assert.ok(address&&typeof address!=='string');const baseUrl=`http://127.0.0.1:${address.port}`;
 const consumer=new MolisWorkCasebookClient({baseUrl,token});const list=await consumer.listProjects();
 assert.deepEqual(list.projects,[{project_ref:a.project_id,project_name:'项目 A'}]);assert.equal(JSON.stringify(list).includes(b.project_id),false);assert.equal(host.status().projects.length,0);
 const wrong=new MolisWorkCasebookClient({baseUrl,token:'wrong00000000000000000000000000000'});await assert.rejects(wrong.listProjects(),{code:'not_authorized'});
 const scoped=new MolisWorkCasebookClient({baseUrl,token,projectRef:a.project_id});const auth=await scoped.readInteractionAuthorization({project_ref:a.project_id,purpose:PURPOSE}) as {state:string};assert.equal(auth.state,'not_joined');
});
test('startup config is absent by default, strict, private and requires separate proof credentials',async()=>{
 const {loadCasebookConfiguration}=await import('../apps/local-host/src/casebook/config.js');
 const dir=mkdtempSync(join(tmpdir(),'casebook-config-'));try{
  assert.equal(loadCasebookConfiguration(dir),undefined);
  const file=join(dir,'config.json');const token=randomBytes(32).toString('hex');const secret=randomBytes(32).toString('hex');
  writeFileSync(file,JSON.stringify({version:1,grants:[{token,project_ref:'board'}],restoreProjects:['board'],proof:{secret,audience:'owner'}}),{mode:0o600});
  const options=loadCasebookConfiguration(dir,file)!;assert.deepEqual(options.restoreProjects,['board']);assert.equal(typeof options.verifyUserAction,'function');
  chmodSync(file,0o644);assert.throws(()=>loadCasebookConfiguration(dir,file));chmodSync(file,0o600);
  writeFileSync(file,JSON.stringify({version:1,grants:[{token,project_ref:'board'}],proof:{secret:token,audience:'owner'}}));assert.throws(()=>loadCasebookConfiguration(dir,file));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('real Web creation uses the existing owner and records the synchronous event path',async t=>{
 const f=await fixture(t);await f.action('join');const controlToken=randomBytes(32).toString('hex');
 const server=createMolisWorkWebServer({databasePath:f.ref.storage_key,boardId:'board',homeDirectory:join(f.dir,'home'),localHost:f.host,controlToken});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(r=>server.close(()=>r())));
 const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
 const response=await fetch(url+'/api/goals',{method:'POST',headers:{'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'web-create',origin:url},body:JSON.stringify({title:'Web真实目标',idempotency_key:'web-create'})});
 assert.equal(response.status,201);const batch=await f.read();assert.equal(batch.facts.length,2);assert.ok(batch.facts.every(x=>x.channel==='web.goal-events.v1'));assert.equal(f.host.status().projects.length,1);
});

test('typed report links selected requirements to owner-saved events, while reads do not claim new saves',async t=>{
 const {configureGoalEventsCapability,reportGoalEventsCapability,readGoalEventCapability}=await import('@molis-ai/molis-work-plugin-goals');
 const f=await fixture(t);await f.action('join');
 await f.client.invoke(createGoalIntentCapability,{board_id:'board',goal_id:'report',title:'报告目标',actor_id:'user',idempotency_key:'intent',requirements:[{requirement_id:'req',statement:'存在可验收结果'}]});
 await f.client.invoke(configureGoalEventsCapability,{board_id:'board',goal_id:'report',actor_id:'user',expected_version:0,idempotency_key:'cfg',types:[{type_id:'delivery',version:1,name:'交付',purpose:'记录交付',fields:[{field_id:'result',name:'结果',purpose:'说明',format:'longtext',required:true}]}]});
 const result=await f.client.invoke(reportGoalEventsCapability,{board_id:'board',goal_id:'report',actor_id:'user',idempotency_key:'report',events:[{type_id:'delivery',type_version:1,title:'私密报告',fields:{result:'私密结果'},judgments:[{requirement_id:'req',verdict:'supports'}]}]});
 const saved=(await f.read()).facts.at(-1)!;assert.equal(saved.saved?.event_refs.length,1);assert.equal(saved.selection.requirement_refs.length,1);
 await f.client.invoke(readGoalEventCapability,{board_id:'board',goal_id:'report',event_id:result.events[0]!.event_id});
 assert.equal((await f.read()).facts.at(-1)!.saved,null);
 assert.equal(JSON.stringify(await f.read()).includes('私密'),false);
});

test('official Web launcher loads private home configuration in a fresh process',async t=>{
 const {openMolisWorkProjectCatalog}=await import('@molis-ai/molis-work-app-desktop');
 const {mkdirSync}=await import('node:fs');const {spawn}=await import('node:child_process');const {createServer}=await import('node:net');const {setTimeout:delay}=await import('node:timers/promises');
 const home=mkdtempSync(join(tmpdir(),'casebook-cli-'));const catalog=await openMolisWorkProjectCatalog({homeDirectory:home});const project=await catalog.createProject({display_name:'CLI 项目',actor_id:'fixture'});catalog.close();
 const token=randomBytes(32).toString('hex');mkdirSync(join(home,'config'),{recursive:true});writeFileSync(join(home,'config','casebook.json'),JSON.stringify({version:1,grants:[{token,project_ref:project.project_id}]}),{mode:0o600});
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const address=reservation.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>(r=>reservation.close(()=>r()));
 const child=spawn(process.execPath,[join(process.cwd(),'dist/web/server.js'),'--home',home,'--port',String(port)],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',chunk=>{output+=String(chunk);});
 t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}rmSync(home,{recursive:true,force:true});});
 for(let i=0;i<100&&!output.includes('Molis Work Web:');i++){if(child.exitCode!==null)throw new Error(output);await delay(25);}
 assert.ok(output.includes('Molis Work Web:'),output);
 const client=new MolisWorkCasebookClient({baseUrl:`http://127.0.0.1:${port}`,token});assert.deepEqual((await client.listProjects()).projects,[{project_ref:project.project_id,project_name:'CLI 项目'}]);
});
