import {afterEach,describe,it,expect} from 'vitest';
import {fixture} from './fixture.js';
import {alchemistActions as a} from '../../src/studio/shared/contracts/actions.js';
import {HostResearchRuntimeAdapter} from '../../src/studio/server/runtime/host-research-runtime.js';
import type {AlchemistAiPort} from '../../src/studio/server/runtime/host-port.js';
let f:Awaited<ReturnType<typeof fixture>>;
afterEach(async()=>{await f?.close()});
const marker='PRIVATE-SOURCE-unique-29b17';
async function seed(){
  f=await fixture();const {plan}=await f.plan();const first=await f.run(plan.id);const report=first.workspace.lenses.market_space.report!;
  const method=await f.confirmMethod(report.id,report.summary);
  const {reference:publicRef}=await f.call(a.reusePublish,{reportId:report.id});
  const privateRef={artifact_id:'private-source',version:1};
  f.artifacts.commands.registerVersion({...privateRef,board_id:'board-test',actor_id:'actor-local',artifact_type_id:'alchemist.research',schema_version:1,
    producer:{plugin_id:'alchemist',plugin_version:'1',binding_signature:'fixture'},content:{kind:'inline',payload:marker},metadata:{title:marker}});
  return {method,publicRef,privateRef,reuse:{artifacts:[{reference:privateRef,reason:marker},{reference:publicRef,reason:'public reason'}],methodIds:[method.id]}};
}
function barrier(){let enter!:()=>void,release!:()=>void;return {entered:new Promise<void>(r=>{enter=r}),waiting:new Promise<void>(r=>{release=r}),enter:()=>enter(),release:()=>release()}}
describe('revocable source projections and final-dispatch business guards',{timeout:30000},()=>{
 it('redacts cached content on all snapshot reads while preserving real consumption and storage',async()=>{
  const {reuse,privateRef,publicRef}=await seed();const {plan}=await f.plan(reuse);const completed=await f.run(plan.id);
  const {plan:cost}=await f.plan({...reuse,methodIds:[]},'build_cost');
  await f.call(a.reuseFeedback,{planId:plan.id,explanation:marker,preparation:marker,corrections:marker,result:marker});
  const before=(await f.call(a.reuseReceipt,{planId:plan.id})).receipt!;expect(JSON.stringify(before)).toContain(marker);
  f.denyReference(privateRef);
  expect((await f.call(a.reuseCandidates,{intent:'next',directionId:f.direction.id})).artifacts.map(x=>x.reference)).toEqual([publicRef]);
  const receipt=(await f.call(a.reuseReceipt,{planId:plan.id})).receipt!;
  const recorded=(await f.call(a.reuseReconcile,{planId:plan.id})).receipt!;
  const feedback=(await f.call(a.reuseFeedback,{planId:plan.id,explanation:marker,preparation:'',corrections:'',result:marker})).receipt;
  const research=await f.call(a.researchGet,{id:f.idea.id,version:1});
  for(const output of [receipt,recorded,feedback,research])expect(JSON.stringify(output)).not.toContain(marker);
  expect(receipt).toMatchObject({runId:completed.run.id,consumedAt:before.consumedAt,relationState:'recorded',feedback:null});
  expect(receipt.artifacts[0]).toMatchObject({reference:privateRef,contentUnavailable:true});
  expect(receipt.artifacts[1]).toMatchObject({reference:publicRef,reason:'public reason',contentUnavailable:false});
  expect(research.lenses.build_cost.plan?.id).toBe(cost.id);
  for(const format of ['json','zip'] as const){
    const exported=await f.call(a.workspaceExport,{format});const bytes=Buffer.from(exported.content,'base64');
    expect(bytes.toString('utf8')).not.toContain(marker);expect(bytes.toString('utf8')).toContain('private-source');
  }
  expect(f.runtime.database.prepare('SELECT reuse_json FROM research_plans WHERE id=?').get(plan.id)).toMatchObject({reuse_json:expect.stringContaining(marker)});
  expect(f.ledger.query.list(f.access)).toHaveLength(2);
  f.denyReference(privateRef,false);
  const originalRead=f.host.readArtifact;
  f.host.readArtifact=async(caller,ref)=>caller.actor_id==='other-reader'?null:originalRead(caller,ref);
  expect(JSON.stringify(await f.runtime.actionsFor('other-reader').invoke(a.researchGet,{id:f.idea.id,version:1}))).not.toContain(marker);
  expect(JSON.stringify(await f.call(a.reuseReceipt,{planId:plan.id}))).toContain(marker);
 });
 it.each(['prepare','credentials'] as const)('stops assessment after revocation during %s without a model request',async phase=>{
  const {method,privateRef}=await seed();const gate=barrier();const before=f.requests.length;
  f.beforeDispatch(async(stage)=>{if(stage===phase){gate.enter();await gate.waiting}});
  const operation=f.call(a.reuseAssess,{intent:'assess',directionId:f.direction.id,references:[privateRef],methodIds:[method.id]});
  const rejected=expect(operation).rejects.toMatchObject({code:phase==='prepare'?'REUSE_SOURCE_UNAVAILABLE':'REUSE_METHOD_CHANGED'});
  await gate.entered;if(phase==='prepare')f.denyReference(privateRef);else await f.call(a.playbookDisable,{id:method.id});gate.release();await rejected;
  expect(f.requests.length).toBe(before);
 });
 it('stops cross-check at the credential barrier after caller authority is revoked',async()=>{
  const {reuse}=await seed();const {plan}=await f.plan(reuse);const gate=barrier(),before=f.requests.length;
  f.beforeDispatch(async(stage)=>{if(stage==='credentials'){gate.enter();await gate.waiting}});
  const operation=f.run(plan.id);await gate.entered;f.allowWrite(false);gate.release();const result=await operation;
  expect(result.workspace.lenses.market_space.run?.errorCode).toBe('REUSE_ACCESS_DENIED');expect(f.requests.length).toBe(before);
  expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt).toBeNull();
 });
 it('keeps the same source guard on the correction request and does not count it as sent',async()=>{
  const {reuse,privateRef}=await seed();const {plan}=await f.plan(reuse,'market_space',f.idea,4);const gate=barrier(),before=f.requests.length;
  f.transformOutput((input,text)=>input.operationId.endsWith(':cross_checking')?'invalid JSON':text);
  f.beforeDispatch(async(stage,input)=>{if(stage==='prepare'&&input.operationId.endsWith(':format_correction')){gate.enter();await gate.waiting}});
  const operation=f.run(plan.id);await gate.entered;f.denyReference(privateRef);gate.release();const result=await operation;
  expect(result.workspace.lenses.market_space.run?.errorCode).toBe('REUSE_SOURCE_UNAVAILABLE');expect(f.requests.length-before).toBe(1);
  expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt).toBeNull();
 });
 it('rechecks caller authority after asynchronous source reads at dispatch',async()=>{
  const {method,privateRef}=await seed();const before=f.requests.length;
  const read=f.host.readArtifact;
  f.beforeDispatch(async(stage)=>{if(stage==='credentials')f.host.readArtifact=async(caller,ref)=>{
    const artifact=await read(caller,ref);f.allowWrite(false);return artifact;
  }});
  await expect(f.call(a.reuseAssess,{intent:'assess',directionId:f.direction.id,references:[privateRef],methodIds:[method.id]})).rejects.toMatchObject({code:'REUSE_ACCESS_DENIED'});
  expect(f.requests.length).toBe(before);
 });
 it('preserves an existing research dispatch guard instead of replacing it',async()=>{
  f=await fixture();const {plan}=await f.plan();const {version}=await f.call(a.ideaGet,{id:f.idea.id,version:1});let sent=0;
  const ai:AlchemistAiPort={listModels:async()=>[],search:async()=>[],generate:async input=>{await input.beforeModelDispatch?.();sent++;return{text:'{}',runtimeLabel:'test'}}};
  const runtime=new HostResearchRuntimeAdapter({ai,resolvePlaybookMethods:()=>[]});
  await expect(runtime.crossCheck({plan,ideaVersion:version,idFactory:{next:()=>crypto.randomUUID()},now:new Date().toISOString(),evidence:[],beforeModelDispatch:async()=>{throw new Error('original guard denied')}})).rejects.toThrow('original guard denied');
  expect(sent).toBe(0);
 });
 it('binds the dispatch guard to the original caller even when invoked outside that caller context',async()=>{
  const {method,privateRef}=await seed();let captured:(()=>Promise<void>)|undefined;
  f.beforeDispatch(async(_stage,input)=>{captured=input.beforeModelDispatch});
  await f.runtime.actionsFor('original-caller').invoke(a.reuseAssess,{intent:'assess',directionId:f.direction.id,references:[privateRef],methodIds:[method.id]});
  const actors:string[]=[];const callerFor=f.host.callerFor;f.host.callerFor=async(actor,signal)=>{actors.push(actor);return callerFor(actor,signal)};
  await captured!();expect(new Set(actors)).toEqual(new Set(['original-caller']));
 });
});
