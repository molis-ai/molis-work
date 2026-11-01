import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionProviderRegistration } from '@molis-ai/molis-work-contracts/platform/actions';
import { SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginBackgroundExecution, type PluginExecutionControl, type PluginExecutor } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { currentPluginAction, signPluginPackage, createPluginModelClient, type PluginModelPort } from '@molis-ai/molis-work-plugin-runtime';
import { SandboxBroker, SandboxError, assertContract, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { effectsFromContract, sandboxOperationActions, sandboxPackageBuildId, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { CONNECTOR_MANAGEMENT_WRITE, connectorPluginSlotActions, pluginInstallActions, readSandboxPackage, withConnectorConnections } from '@molis-ai/molis-work-app-local-host';
import { mac, operationsOf, person, ref } from './fixtures/home-sandbox.js';
import { newPublisher } from './fixtures/sandbox-package.js';
import { signedResourceHttps } from './fixtures/signed-resource-https.js';
import { BACKGROUND_ID, BACKGROUND_PERMISSIONS, backgroundRig, signedBackgroundPackage } from './fixtures/signed-background.js';

type Job = {job_id:string;state:string;last_state:string;execution_id:string;cancelled:boolean};
const processGone = (pid: number) => {try{process.kill(pid,0);return false}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error}};

/** Observe and optionally hold the actual reduced Host client; work, controls, results and cancellation all reach the real Runtime. */
function observeBackground(t:test.TestContext) {
  const results:Array<Promise<{value?:SandboxJson;error?:unknown}>>=[],controls:PluginExecutionControl[]=[],clients=new WeakSet<object>(),targetStarts:string[]=[];
  const hooks:{accepted?:(execution:PluginBackgroundExecution<SandboxJson>)=>Promise<void>;cancels:number}={cancels:0};
  const invoke=SandboxBroker.prototype.invoke;
  t.mock.method(SandboxBroker.prototype,'invoke',function(this:SandboxBroker,...args:Parameters<SandboxBroker['invoke']>){
    if(args[0].id==='job.work'&&args[2]==='homeDatabase.transaction'){
      const statements=args[3][0] as Array<{sql?:string;parameters?:SandboxJson[]}>;
      if(statements[0]?.sql?.includes('pid=?'))targetStarts.push(String(statements[0].parameters![1]));
    }
    const background=(Reflect.get(this,'services') as SandboxServices).background;
    if(args[2]==='background.start'&&background&&!clients.has(background.client)){
      clients.add(background.client);const start=background.client.start;
      t.mock.method(background.client,'start',async(work,options)=>{
        const execution=await start(control=>{controls.push(control);return work(control)},options);
        results.push(execution.result.then(value=>({value}),error=>({error})));
        await hooks.accepted?.(execution);
        return Object.freeze({result:execution.result,cancel(){hooks.cancels++;execution.cancel()}});
      });
    }
    return Reflect.apply(invoke,this,args);
  });
  return {results,controls,hooks,targetStarts};
}

/** The actual Runtime/kernel dependency; its provider can be replaced while the signed target is waiting. */
function dependency() {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const action: ActionDefinition = {capability_id:'fixture.bgwait',version:1,operation:'command',action:{title:'Held effect',description:'Controlled real dependency',kind:'operation',scope:'home',
    scheduling:'concurrent',permissions:['fixture:write'],audiences:['user','plugin'],subject_kinds:[],input_schema:{type:'string'},output_schema:{type:'string'},execution:{cost:'none',timeout_ms:60000}}};
  const definition: PluginDefinition = {manifest:{schema_version:2,host_api_version:2,plugin_id:'io.molis.work.example.bgdependency398',version:'1.0.0',name:'Dependency',kind:'app',
    publisher:{publisher_id:'fixture',signature:'fixture-background398'},entrypoints:[{deployment:'local',entrypoint:'./entry.mjs'}],permissions:[{permission:'fixture:write',required:true,reason:'Controlled fixture effect'}],
    capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},ui:{contributions:[]},actions:[action]},
    async start(){return {kind:'app',actions:[{...action,async handle(caller,input){entered.resolve();await release.promise;await caller.beforeEffect();return input}}]}}};
  return {definition,action,entered,release};
}

test('RAC2871 RAC2877 signed install returns a persistent job, a second process finishes before acceptance returns, and the atomic acceptance write preserves done',mac,async t=>{
  const r=await backgroundRig(t),pkg=signedBackgroundPackage();
  const initialManifest=JSON.stringify(pkg.payload.manifest), registrations:ActionDefinition[]=[], scopes:ActionDefinition[]=[];
  const register=ActionService.prototype.registerProvider;
  t.mock.method(ActionService.prototype,'registerProvider',function(this:ActionService,registration:ActionProviderRegistration){
    if(registration.provider.plugin_id===BACKGROUND_ID) registrations.push(...registration.definitions);
    return register.call(this,registration);
  });
  await r.h.install(pkg);await r.approve();
  const invoke=SandboxBroker.prototype.invoke, entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
  t.after(()=>release.resolve());
  t.mock.method(SandboxBroker.prototype,'invoke',async function(this:SandboxBroker,...args:Parameters<SandboxBroker['invoke']>){
    if(args[2]==='background.start') {
      scopes.push(currentPluginAction()!.definition);
      const id=await Reflect.apply(invoke,this,args);entered.resolve();await release.promise;return id;
    }
    if(args[0].id==='job.work') scopes.push(currentPluginAction()!.definition);
    return Reflect.apply(invoke,this,args);
  });
  const launched=r.launch('race') as Promise<Job>;
  await entered.promise;
  await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='race'")[0]?.state==='done');
  release.resolve();const answer=await launched;
  assert.equal(answer.state,'done');assert.equal(answer.job_id,'race');assert.notEqual(answer.execution_id,answer.job_id);
  assert.ok(answer.execution_id.length>8);assert.equal((await r.status('race')).state,'done');
  const proof=JSON.parse(await r.call('job.inspect',{}) as string) as {jobs:Array<{pid:number}>;results:unknown[];pid:number};
  assert.notEqual(proof.jobs[0]!.pid,proof.pid,'the installed target used a second actual sandbox process');assert.equal(proof.results.length,2);
  assert.equal(scopes.every(scope=>scope===scopes[0]),true,'the accepted work retains the launchers actual finalDefinition');
  assert.ok(registrations.includes(scopes[0]!),'registration and running scope share the same actual finalDefinition object');
  assert.deepEqual(scopes[0]!.action.permissions,BACKGROUND_PERMISSIONS.filter(permission=>permission!=='owner-files:read'&&permission!=='fixture:write'));
  assert.ok(scopes[0]!.action.background_job);assert.equal(scopes[0]!.action.execution?.cost,'unknown');
  assert.equal(JSON.stringify(pkg.payload.manifest),initialManifest,'runtime policy never rewrites signed static data');
  assert.deepEqual(readSandboxPackage(pkg.payload).manifest,pkg.payload.manifest);
  // The kernel clones its directory snapshot; the Host scope still retains the exact object it supplied for registration.
  await r.reopen();await r.launch('fresh');await r.until(async()=> (await r.status('fresh')).state==='done');
  assert.ok(registrations.some(definition=>definition.action.local_id==='notes.add'));
});

test('RAC2871 RAC2872 RAC2876 a quick query stays responsive during a real target, closure grants refuse before pending, and restart reports only confirmed business state',mac,async t=>{
  const r=await backgroundRig(t),observed=observeBackground(t);await r.h.install(signedBackgroundPackage());
  await assert.rejects(r.launch('unapproved'));
  assert.deepEqual(r.read('SELECT * FROM jobs'),[],'declared target resources alone do not grant admission');
  await r.approve();
  await assert.rejects(r.launch('no-caller','fast',r.caller({permissions:BACKGROUND_PERMISSIONS.filter(permission=>permission!=='owner-files:write')})));
  assert.deepEqual(r.read('SELECT * FROM jobs'),[]);
  const run=await r.launch('waiting','hold') as Job;
  await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='waiting'")[0]?.state==='running');
  const started=Date.now();await r.call('notes.list',{});assert.ok(Date.now()-started<3000,'quick lane answers while background waits');
  const pending=await r.launch('pending','pending') as Job;assert.equal(pending.state,'pending');
  const oldPid=r.read("SELECT pid FROM jobs WHERE job_id='waiting'")[0]!.pid;
  assert.equal((await r.status('waiting')).state,'待核对');assert.equal((await r.status('waiting')).last_state,'running');
  await r.reopen();
  for(const [id,last] of [['waiting','running'],['pending','pending']]){
    const status=await r.status(id!);assert.equal(status.state,'待核对');assert.equal(status.last_state,last);
  }
  assert.equal((await r.call('job.cancel',{job_id:'waiting',execution_id:run.execution_id}) as Job).cancelled,false,'old broker ids do not survive restart');
  assert.equal(r.read('SELECT * FROM results').length,0,'no task was replayed or marked failed');
  await r.call('job.release',{job_id:'waiting'});await r.call('job.release',{job_id:'pending'});
  await r.launch('done');await r.until(async()=> (await r.status('done')).state==='done');await r.reopen();assert.equal((await r.status('done')).state,'done');
  assert.deepEqual(observed.targetStarts,['waiting','done'],'after restart ready and a released/processed background queue, old running/pending jobs never re-entered the target');
  assert.equal(r.read("SELECT pid FROM jobs WHERE job_id='waiting'")[0]!.pid,oldPid);assert.equal(r.read("SELECT pid FROM jobs WHERE job_id='pending'")[0]!.pid,null);
  assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'waiting:%' OR id LIKE 'pending:%'").length,0);
  assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);
});

test('RAC2873 static package reconstruction rejects invalid local metadata and an installed query cannot borrow another operations start/cancel permission',mac,async t=>{
  const publisher=newPublisher(),pkg=signedBackgroundPackage(publisher),original=readSandboxPackage(pkg.payload),contract=original.contract;
  const mutations:Array<(value:SandboxPluginContract)=>void>=[
    value=>{delete value.operations[1]!.background_job},
    value=>{value.operations[1]!.background_job!.status='other.package.status'},
    value=>{value.operations[1]!.background_job!.status='job.work'},
    value=>{value.operations[1]!.background_job!.id='missing'},
    value=>{value.operations[1]!.background_job!.done=['failed']},
    value=>{value.operations[1]!.kind='query'},
    value=>{value.operations.find(item=>item.id==='job.work')!.effects.background=['job.work']},
    value=>{value.operations[1]!.effects.background=['missing']},
  ];
  const r=await backgroundRig(t);
  for(const mutate of mutations){
    const changed=structuredClone(contract);mutate(changed);assert.throws(()=>assertContract(changed));
    const payload=structuredClone(pkg.payload);payload.files.find(file=>file.path===SANDBOX_PACKAGE_FILES.contract)!.content_base64=Buffer.from(JSON.stringify(changed)).toString('base64');
    const wrong=signPluginPackage({payload,signature:null,publisher_key:null},publisher.signer);
    await assert.rejects(r.h.projectClient().invoke(person(),ref(pluginInstallActions.preview),{bundle:wrong}));
  }
  const tampered=structuredClone(pkg.payload);tampered.manifest.actions![1]!.action.background_job!.status.version=99;
  assert.throws(()=>readSandboxPackage(tampered),'a hand-written Manifest cannot replace the SDK projection');
  await r.h.install(pkg);await r.approve();
  assert.equal(await r.call('job.query-start',{job_id:'query'}),'sandbox.not_authorized');
  assert.equal(await r.call('job.query-cancel',{execution_id:'any'}),'sandbox.not_authorized');
  await assert.rejects(r.launch('bad-input','fast',r.caller(),{bad_input:7}));
  assert.equal(r.read('SELECT * FROM results').length,0);
});

test('RAC2872 a real native dependency permission is part of the launcher, same-cost provider replacement revokes its old authority, and unrelated operations retain theirs',mac,async t=>{
  const dep=dependency();t.after(()=>dep.release.resolve());const r=await backgroundRig(t,{dependencies:[dep.definition]});
  await r.h.install(signedBackgroundPackage(newPublisher(),{dependency:true}));await r.approve();
  const client=r.h.homeClient(),views=await operationsOf(client,r.caller(),BACKGROUND_ID),launch=views.find(view=>view.action.local_id==='notes.add')!;
  assert.ok(launch.action.permissions.includes('fixture:write'));
  await assert.rejects(client.invoke(r.caller({permissions:BACKGROUND_PERMISSIONS.filter(permission=>permission!=='fixture:write')}),ref(launch),{text:'{"job_id":"caller-denied","mode":"dependency"}'}));
  assert.deepEqual(r.read('SELECT * FROM jobs'),[]);
  let registry:ActionService|undefined;const register=ActionService.prototype.registerProvider;
  t.mock.method(ActionService.prototype,'registerProvider',function(this:ActionService,registration:ActionProviderRegistration){
    if(registration.provider.plugin_id===BACKGROUND_ID) registry=this;
    return register.call(this,registration);
  });
  // Regrant exercises the real activation replacement that previously left refresh connected to the disposed exposure.
  await r.set('materials:read',false);await r.set('materials:read',true);
  assert.ok(registry);const token=(view:typeof launch)=>registry!.registry.registrationToken({...view,action_provider:view.provider});
  const stable=(await operationsOf(client,r.caller(),BACKGROUND_ID)).find(view=>view.action.local_id==='job.status')!, oldLaunch=token(launch),oldStatus=token(stable);
  const run=await r.launch('dependency','dependency') as Job;await dep.entered.promise;
  const heldPid=Number(r.read("SELECT pid FROM jobs WHERE job_id='dependency'")[0]!.pid);
  const platform=await r.h.host.homePlugins!.ready(),record=r.h.host.homePlugins!.installation(dep.definition.manifest.plugin_id)!;
  await platform.runtime.stop(record.install_id);
  const replacement={...dep.action,action:{...dep.action.action}};
  const remove=r.h.host.actionRegistry().registerProvider({provider:{provider_id:'replacement398',title:'Replacement',kind:'system'},definitions:[replacement],handlers:[{...replacement,handle:(_caller,input)=>input}]});t.after(remove);
  await client.discover(r.caller());assert.notEqual(token(launch),oldLaunch,'same-cost provider change replaces the launcher token');assert.equal(token(stable),oldStatus,'unrelated query keeps its token');dep.release.resolve();
  await r.until(()=>processGone(heldPid));assert.equal((await r.call('job.cancel',{job_id:'dependency',execution_id:run.execution_id}) as Job).cancelled,false);
  assert.equal(r.read('SELECT * FROM results').length,0,'stale provider cannot finish a held target');
  assert.equal((await r.status('dependency')).last_state,'running');assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);
  await r.launch('new-provider','dependency');await r.until(async()=> (await r.status('new-provider')).state==='done');
});

test('RAC2874 a true signed acceptance stopped before its real handle returns cancels that late handle and leaves no terminal repair',mac,async t=>{
  const r=await backgroundRig(t),observed=observeBackground(t),entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();t.after(()=>release.resolve());
  await r.h.install(signedBackgroundPackage());await r.approve();
  observed.hooks.accepted=async()=>{entered.resolve();await release.promise};
  const launch=assert.rejects(r.launch('accept-stop','hold'));await entered.promise;
  await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='accept-stop'")[0]?.state==='running');
  const pid=Number(r.read("SELECT pid FROM jobs WHERE job_id='accept-stop'")[0]!.pid);
  await r.control('disable');release.resolve();await launch;await r.until(()=>observed.hooks.cancels===1);
  assert.ok((await observed.results[0]!).error);assert.equal(observed.controls[0]!.signal!.aborted,true);await r.until(()=>processGone(pid));
  assert.equal(r.read('SELECT * FROM results').length,0);assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);
  await r.control('enable');assert.equal((await r.status('accept-stop')).state,'待核对');
});

test('RAC2874 RAC2876 actual project deletion and a fresh installation generation stop signed background processes without replaying their persistent jobs',mac,async t=>{
  const r=await backgroundRig(t),observed=observeBackground(t),pkg=signedBackgroundPackage();await r.h.install(pkg);await r.approve();
  const project=await r.project('Background deletion'),client=r.h.host.actionClient(project.reference),who=r.caller({project_id:project.project_id});
  const views=await operationsOf(client,who,BACKGROUND_ID),launch=views.find(view=>view.action.local_id==='notes.add')!;
  await client.invoke(who,ref(launch),{text:'{"job_id":"project","mode":"hold"}'});
  await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='project'")[0]?.state==='running');
  const projectPid=Number(r.read("SELECT pid FROM jobs WHERE job_id='project'")[0]!.pid);
  assert.equal(observed.controls[0]!.project_id,project.project_id);await r.deleteProject(project.project_id);
  assert.ok((await observed.results[0]!).error);await r.until(()=>processGone(projectPid));
  const run=await r.launch('generation','hold') as Job;await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='generation'")[0]?.state==='running');
  const generation=r.record().installation_generation,pid=Number(r.read("SELECT pid FROM jobs WHERE job_id='generation'")[0]!.pid);
  await r.control('uninstall',true);await r.until(()=>processGone(pid));await r.h.install(pkg);await r.approve();
  assert.notEqual(r.record().installation_generation,generation);assert.equal((await r.call('job.cancel',{job_id:'generation',execution_id:run.execution_id}) as Job).cancelled,false);
  assert.equal((await r.status('generation')).state,'待核对');assert.equal(r.read('SELECT * FROM results').length,0);
  await r.launch('independent');await r.until(async()=> (await r.status('independent')).state==='done');
});

test('RAC2875 a true background request whose controlled HTTPS acknowledgement is lost retains trusted unknown and the already committed DB/files',mac,async t=>{
  const tls=await signedResourceHttps(t),r=await backgroundRig(t),observed=observeBackground(t);await r.h.install(signedBackgroundPackage());await r.approve();
  const connection=withConnectorConnections(r.h.home,store=>store.createToken({serviceId:'github',displayName:'Lost HTTPS reply',token:'dummy-t397-resource-credential'}));
  await r.h.homeClient().invoke({...person(null),permissions:[CONNECTOR_MANAGEMENT_WRITE]},ref(connectorPluginSlotActions.bind),{
    install_id:r.record().install_id,plugin_id:BACKGROUND_ID,slot_id:'github',service_id:'github',connection_id:connection.connection_id});
  tls.server.prependListener('request',(_request,response)=>{
    t.mock.method(response,'end',function(){this.write('{"login":"partial');const socket=this.socket;setImmediate(()=>socket?.destroy());return this});
  });
  await r.launch('lost-https','https-catch');await r.until(()=>observed.results.length===1);const result=await observed.results[0]!;
  assert.equal(tls.seen.length,1);assert.ok(result.error instanceof SandboxError);assert.equal(result.error.outcome,'unknown');
  assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'lost-https:%'").length,2);
  assert.equal(readFileSync(join(r.h.home,'plugin-files',r.record().install_id,'files','data','lost-https.txt'),'utf8'),'done');
  assert.equal((await r.status('lost-https')).state,'待核对');assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);assert.equal(tls.seen.length,1);
  await r.launch('before-https','https-denied');await r.until(()=>observed.results.length===2);const denied=await observed.results[1]!;
  assert.ok(denied.error instanceof SandboxError);assert.equal(denied.error.outcome,undefined,'a pre-dispatch origin refusal is not unknown');assert.equal(tls.seen.length,1);
});

test('RAC2872 RAC2874 repeated enable keeps Runtime grant admission, and regrant restores the same signed package without duplicate registrations',mac,async t=>{
  const r=await backgroundRig(t);await r.h.install(signedBackgroundPackage());await r.approve();await r.set('owner-files:write',false);
  await r.control('enable');await r.control('enable');await assert.rejects(r.launch('grant-denied'));
  assert.deepEqual(r.read('SELECT * FROM jobs'),[],'target grant refusal precedes pending even after repeated expose');
  await r.set('owner-files:write',true);await r.launch('regranted');await r.until(async()=> (await r.status('regranted')).state==='done');
});

test('RAC2872 RAC2874 a real signed launcher carries a controlled model result into background work and rechecks that producer after the launcher returned',mac,async t=>{
  const r=await backgroundRig(t),observed=observeBackground(t),platform=await r.h.host.homePlugins!.ready();
  const executor=Reflect.get(platform.runtime,'executor') as PluginExecutor,start=executor.start,wrapped=new WeakSet<PluginDefinition>();let revision=1,calls=0;
  const port:PluginModelPort={choices:()=>[],availability:()=>({available:true}),decodeJson:()=>({ok:false}),async complete(_owner,_prompt,dispatch){
    await dispatch.beforeDispatch();calls++;const version=revision;
    return {text:'controlled model answer',validateResult(){if(version!==revision)throw new ActionError('actions.configuration_changed','Controlled producer configuration changed')}};
  }};
  t.mock.method(executor,'start',function(this:PluginExecutor,definition,context){
    if(definition.manifest.plugin_id===BACKGROUND_ID&&!wrapped.has(definition)){
      wrapped.add(definition);const original=definition.start;
      t.mock.method(definition,'start',given=>original({...given,services:{...given.services,model:createPluginModelClient(definition.manifest,port,{
        install_id:given.install_id,installation_generation:given.installation_generation,assertActive:()=>given.requireGrant('storage:private'),requireGrant:permission=>given.requireGrant(permission)})}}));
    }
    return start.call(this,definition,context);
  });
  await r.h.install(signedBackgroundPackage(newPublisher(),{model:true}));await r.approve();const caller=r.caller({permissions:[...BACKGROUND_PERMISSIONS,'model:invoke']});
  await r.launch('model-valid','model-hold',caller);await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='model-valid'")[0]?.state==='running');
  await r.call('job.release',{job_id:'model-valid'});assert.equal((await observed.results[0]!).error,undefined,'a valid held result survives the natural launcher return');
  assert.equal((await r.status('model-valid')).state,'done');assert.equal(r.read("SELECT text FROM results WHERE id='model-valid:a'")[0]!.text,'controlled model answer');
  await r.launch('model-invalid','model-hold',caller);await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='model-invalid'")[0]?.state==='running');revision++;
  await r.call('job.release',{job_id:'model-invalid'});assert.ok((await observed.results[1]!).error);
  assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'model-invalid:%'").length,0);
  assert.equal(existsSync(join(r.h.home,'plugin-files',r.record().install_id,'files','data','model-invalid.txt')),false);
  assert.equal((await r.status('model-invalid')).state,'待核对');assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);assert.equal(calls,2);
});

test('RAC2874 real cancellation, grant withdrawal and disable stop installed workers without late records; the next explicitly authorized run uses a new process',mac,async t=>{
  const r=await backgroundRig(t);await r.h.install(signedBackgroundPackage());await r.approve();
  const first=await r.launch('cancel','hold') as Job;await r.until(()=>r.read("SELECT pid FROM jobs WHERE job_id='cancel'")[0]?.pid!==null);
  const pid=r.read("SELECT pid FROM jobs WHERE job_id='cancel'")[0]!.pid;
  assert.equal((await r.call('job.cancel',{job_id:'cancel',execution_id:first.execution_id}) as Job).cancelled,true);
  await r.until(async()=>!(await r.call('job.cancel',{job_id:'cancel',execution_id:first.execution_id}) as Job).cancelled);
  await r.call('job.release',{job_id:'cancel'});assert.equal(r.read('SELECT * FROM results').length,0);
  const second=await r.launch('revoke','hold') as Job;void second;
  await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='revoke'")[0]?.state==='running');
  await r.set('owner-files:write',false);await r.call('job.release',{job_id:'revoke'});await r.set('owner-files:write',true);
  await r.launch('disable','hold');await r.until(()=>r.read("SELECT state FROM jobs WHERE job_id='disable'")[0]?.state==='running');
  await r.control('disable');await r.control('enable');
  assert.equal(r.read('SELECT * FROM results').length,0);assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);
  await r.launch('new');await r.until(async()=> (await r.status('new')).state==='done');
  assert.notEqual(r.read("SELECT pid FROM jobs WHERE job_id='new'")[0]!.pid,pid);
});

test('RAC2875 actual background cancellation before COMMIT rolls back, explicit COMMIT failure rolls back, and lost replies retain trusted unknown through the background handle and expose',mac,async t=>{
  const observed=observeBackground(t),r=await backgroundRig(t);await r.h.install(signedBackgroundPackage());await r.approve();
  const emit=ChildProcess.prototype.emit,transactions=new WeakMap<ChildProcess,{job?:string;lastInsert?:number;commits:Map<number,string>}>();
  const dropped=new Set<string>();let beforeCommits=0,cancelled=false,cancelBeforeCommit:(()=>void)|undefined;
  t.mock.method(ChildProcess.prototype,'emit',function(this:ChildProcess,event:string,...args:unknown[]){
    if(event==='spawn'&&this.spawnargs.some(arg=>arg.endsWith('/project-statement-worker.js'))){
      const send=this.send,trace={commits:new Map<number,string>()} as {job?:string;lastInsert?:number;commits:Map<number,string>};transactions.set(this,trace);
      t.mock.method(this,'send',function(this:ChildProcess,...values:Parameters<ChildProcess['send']>){
        const message=values[0] as {op?:string;id?:number;sql?:string;parameters?:SandboxJson[]};
        if(message.op==='begin'){trace.job=undefined;trace.lastInsert=undefined}
        if(message.op==='run'&&message.sql?.startsWith('INSERT INTO results')){
          const key=String(message.parameters![0]);trace.job=key.slice(0,key.lastIndexOf(':'));
          if(key.endsWith(':b'))trace.lastInsert=message.id;
        }
        if(message.op==='commit'&&trace.job){trace.commits.set(message.id!,trace.job);if(trace.job==='before')beforeCommits++}
        return Reflect.apply(send,this,values);
      });
    }
    const reply=args[0] as {id?:number;ok?:boolean},trace=transactions.get(this);
    if(event==='message'&&reply?.ok&&trace){
      if(trace.job==='before'&&reply.id===trace.lastInsert&&!cancelled){
        assert.ok(cancelBeforeCommit);cancelled=true;cancelBeforeCommit();
      }
      const job=trace.commits.get(reply.id!);
      if(job?.startsWith('unknown')&&!dropped.has(job)){
        assert.equal(r.read('SELECT * FROM results WHERE id LIKE ?',[job+':%']).length,2,'SQLite committed both rows before its real IPC acknowledgement is lost');
        dropped.add(job);this.kill('SIGKILL');return true;
      }
    }
    return Reflect.apply(emit,this,[event,...args]);
  });
  // Only observe actual IPC. The last INSERT has succeeded in the real transaction, but its reply has not released the Host's next COMMIT check.
  await r.control('disable');await r.control('enable');
  observed.hooks.accepted=async execution=>{cancelBeforeCommit=()=>execution.cancel()};
  const before=r.launch('before').then(value=>({value}),error=>({error}));
  await r.until(()=>observed.results.length===1);assert.ok((await observed.results[0]!).error);await before;
  assert.equal(cancelled,true);assert.equal(beforeCommits,0);assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'before:%'").length,0);
  assert.equal(existsSync(join(r.h.home,'plugin-files',r.record().install_id,'files','data','before.txt')),false);
  observed.hooks.accepted=undefined;
  await r.launch('failed','commit-fail');await r.until(()=>observed.results.length===2);assert.ok((await observed.results[1]!).error);
  assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'failed:%'").length,0,'an explicit COMMIT failure rolls back both real background writes');
  await r.launch('unknown-bg');await r.until(()=>observed.results.length===3);const unknown=await observed.results[2]!;
  assert.ok(unknown.error instanceof SandboxError);assert.equal(unknown.error.outcome,'unknown');assert.equal(dropped.has('unknown-bg'),true);
  assert.equal((await r.status('unknown-bg')).state,'待核对');assert.equal((await r.status('unknown-bg')).last_state,'running');
  await r.launch('unknown','pending');await assert.rejects(r.call('job.work',{job_id:'unknown',mode:'fast'}),{code:'actions.outcome_unknown'});
  assert.equal(dropped.has('unknown'),true);assert.equal(r.read("SELECT * FROM results WHERE id LIKE 'unknown:%'").length,2);
  assert.equal((await r.status('unknown')).state,'待核对');assert.equal((await r.status('unknown')).last_state,'running');
  await r.launch('forged','pending');await assert.rejects(r.call('job.work',{job_id:'forged',mode:'forge'}),error=>(error as {code?:string}).code!=='actions.outcome_unknown');
  // A committed DB write and owner file precede an unbound real connection. They are retained; no cross-service rollback or failed repair exists.
  await r.launch('partial','https');await r.until(()=>r.read("SELECT * FROM results WHERE id LIKE 'partial:%'").length===2);
  await r.until(async()=>!(await r.call('job.cancel',{job_id:'partial',execution_id:(await r.status('partial')).execution_id}) as Job).cancelled);
  assert.equal((await r.status('partial')).state,'待核对');assert.equal((await r.status('partial')).last_state,'running');
  assert.equal(r.read("SELECT * FROM jobs WHERE state='failed'").length,0);
  for(const id of ['unknown','unknown-bg'])assert.equal(r.read('SELECT * FROM results WHERE id LIKE ?',[id+':%']).length,2,'no automatic replay');
});

test('RAC2877 the signed five-service composition reaches controlled TLS and materials, then keep/restore preserves facts and discard removes owner files under the existing Home-library policy',mac,async t=>{
  const tls=await signedResourceHttps(t),r=await backgroundRig(t);const pkg=signedBackgroundPackage();
  const installed=await r.h.install(pkg);assert.equal(installed.preview.runtime_scope,'home');await r.approve();
  const connection=withConnectorConnections(r.h.home,store=>store.createToken({serviceId:'github',displayName:'Background TLS',token:'dummy-t397-resource-credential'}));
  await r.h.homeClient().invoke({...person(null),permissions:[CONNECTOR_MANAGEMENT_WRITE]},ref(connectorPluginSlotActions.bind),{
    install_id:r.record().install_id,plugin_id:BACKGROUND_ID,slot_id:'github',service_id:'github',connection_id:connection.connection_id});
  await r.launch('tls','https');await r.until(async()=> (await r.status('tls')).state==='done');assert.equal(tls.seen.length,1);assert.equal(tls.seen[0]!.authorized,true);
  await r.launch('material','materials');await r.until(async()=> (await r.status('material')).state==='done');
  assert.match(String(r.read("SELECT text FROM results WHERE id='material:material'")[0]!.text),/Background material works/);
  const file=join(r.h.home,'plugin-files',r.record().install_id,'files','data','tls.txt');assert.equal(readFileSync(file,'utf8'),'done');
  await r.control('uninstall',true);await r.h.install(pkg);await r.approve();assert.equal((await r.status('tls')).state,'done');
  assert.equal(readFileSync(file,'utf8'),'done');await r.control('uninstall',false);assert.equal(existsSync(file),false);
  // Current Home-library policy retains plugin-owned libraries on uninstall (PG-022); keep/discard controls private KV and owner files.
  await r.h.install(pkg);await r.approve();assert.equal((await r.status('tls')).state,'done');
});
