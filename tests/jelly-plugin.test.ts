import { modelPromptText } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runJellyAi, jellySourceHash, scheduleJellyActions, jellyActions, jellyCommandActions, jellyManifest, emptyJellyWorkspace } from "@molis-ai/molis-work-plugin-jelly";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { isMaterialPublicAddress } from "../apps/local-host/dist/material-source-reader.js";
const day="2026-09-22";
function fixture(t: { after(fn:()=>void):void }) { const home=mkdtempSync(join(tmpdir(),'jelly-integration-')), store=openJellyStore(home);t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});return store; }
test('W5-01-JMC-01 Jelly Runtime HTTP enforces revisions; routes and actions share persisted facts', async t=>{
  const { home, host, request } = await serveHomeRuntime(t);
  const actions=bindActionClient(host.homeActionClient(),()=>person(JELLY_ACTION_PERMISSIONS));
  assert.equal(jellyManifest.kind,'native');
  const path='/api/plugins/io.molis.work.jelly/commands';
  assert.equal((await request(path,{method:'POST',body:{command:{type:'item.create',item:{title:'missing revision',start_date:day}}}})).status,400);
  const response=await request(path,{method:'POST',body:{expected_revision:0,command:{type:'item.create',item:{title:'准备发布检查',start_date:day}}}});
  assert.equal(response.status,200,await response.text());
  const store=openJellyStore(home);t.after(()=>store.close()); const item=store.read().items[0]!;
  const listed=await actions.invoke(jellyActions.calendar,{start:day,end:day});assert.equal(listed.items[0]!.id,item.id);
  await actions.invoke(jellyCommandActions['item.complete'],{id:item.id,completed:true,expected_revision:1});assert.ok(store.read().items[0]?.completed_at);
  await assert.rejects(()=>actions.invoke(jellyCommandActions['item.update'],{id:item.id,patch:{title:'stale'},expected_revision:1}),/其他窗口|版本/);
  const beforeRemoved=store.read(),removed=await request('/api/jelly'),unknown=await request('/api/no-such-route');
  assert.equal(unknown.ok,false);assert.equal(removed.status,unknown.status);assert.deepEqual(await removed.json(),await unknown.json());
  assert.deepEqual(store.read(),beforeRemoved,'the removed route has no Jelly effect');
});
test('Jelly plans are previews, not writes, and schedule around real calendar occupancy',async t=>{
  const store=fixture(t);store.execute({type:'item.create',item:{title:'既有安排',start_date:day,start_time:540,end_time:600}});
  store.execute({type:'note.create',title:'发布',markdown:'准备发布材料\n确认说明'});
  const before=store.read(),note=before.notes[0]!;
  const generated=await runJellyAi(before,{kind:'decompose',source_type:'note',source_id:note.id,today:day,start_time:540},{completeJson:async()=>({actions:[{title:'核对文档',notes:'说明完整',minutes:30}]})});
  assert.ok('plan'in generated);assert.equal(generated.plan.actions[0]?.schedule?.start_time,600);assert.equal(store.read().revision,before.revision);
  store.execute({type:'plan.apply',plan:generated.plan},before.revision);assert.equal(store.read().items.length,2);assert.equal(store.read().task_links.length,1);
  store.execute({type:'plan.apply',plan:generated.plan},store.read().revision);assert.equal(store.read().items.length,2);
  const sourceHash=jellySourceHash(before,'note',note.id);assert.equal(generated.plan.source_hash,sourceHash);
});
test('Jelly text-source plans apply even when the pasted text has surrounding whitespace',async t=>{
  const store=fixture(t);
  for(const text of ['写发布说明\n核对文档','写发布说明\n核对文档\n','  写发布说明\n核对文档\n\n']){
    const state=store.read(),before=state.revision;
    const manual=await runJellyAi(state,{kind:'decompose',source_type:'text',text,manual:true},{});
    assert.equal(manual.plan.source_text,text.trim());assert.equal(manual.plan.source_hash,jellySourceHash(state,'text',null,manual.plan.source_text));
    store.execute({type:'plan.apply',plan:manual.plan},before);
    assert.ok(store.read().applied_plan_ids.includes(manual.plan.id),JSON.stringify(text));
    const modeled=await runJellyAi(store.read(),{kind:'decompose',source_type:'text',text},{completeJson:async()=>({actions:[{title:'核对文档',notes:'',minutes:30}]})});
    store.execute({type:'plan.apply',plan:modeled.plan},store.read().revision);assert.ok(store.read().applied_plan_ids.includes(modeled.plan.id),JSON.stringify(text));
  }
  assert.equal(store.read().applied_plan_ids.length,6);
});
test('Jelly AI failures retain source; no fabricated model output',async t=>{
  const store=fixture(t);store.execute({type:'note.create',title:'原笔记',markdown:'关于未来产品的一段真实原文'});const before=store.read(),id=before.notes[0]!.id;
  await assert.rejects(()=>runJellyAi(before,{kind:'decompose',source_type:'note',source_id:id},{}),/尚未配置/);
  await assert.rejects(()=>runJellyAi(before,{kind:'decompose',source_type:'note',source_id:id},{completeJson:async()=>null}),/计划需要/);
  assert.deepEqual(store.read(),before);
  const manual=await runJellyAi(before,{kind:'decompose',source_type:'note',source_id:id,manual:true},{});assert.ok('plan'in manual);assert.equal(manual.method,'manual');
});
test('public material reader rejects loopback, private, mapped, and link-local addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])assert.equal(isMaterialPublicAddress(ip),false,ip);
 assert.equal(isMaterialPublicAddress('8.8.8.8'),true);assert.equal(isMaterialPublicAddress('2606:4700:4700::1111'),true);
});
test('proposed slots preserve cross-midnight occupancy and report no slot when full',()=>{
 const state=emptyJellyWorkspace();const action={id:'a',title:'制作',notes:'',category_id:'uncategorized',priority:'none' as const,schedule:null};
 assert.equal(scheduleJellyActions(state,[action],day,1260)[0]?.schedule?.start_date,'2026-09-23');
 assert.equal(scheduleJellyActions(state,[action],day,540)[0]?.schedule?.end_time,570);
});

// Jelly counts a plan's lengths in whole characters (an emoji is one): a cut never lands between its two halves, and a limit lets through exactly what it names.
const E='😀',manualPlan=(text:string)=>runJellyAi(emptyJellyWorkspace(),{kind:'decompose',source_type:'text',text,manual:true},{});
const modelPlan=(question:string,notes:string,title='核对来源')=>runJellyAi(emptyJellyWorkspace(),{kind:'decompose',source_type:'text',text:'准备发布说明'},{completeJson:async()=>({actions:[{title,notes,minutes:30}],clarification_questions:[question]})});
test('RAC-1897 a manual plan cuts the plan title to 100 and a task title to 200 whole characters',async t=>{
  for(const c of [
    {name:'the 100th character is a two-unit one',line:'a'.repeat(99)+E+'尾'.repeat(10),plan:'a'.repeat(99)+E,task:'a'.repeat(99)+E+'尾'.repeat(10)},
    {name:'the 200th character is a two-unit one',line:'b'.repeat(199)+E+'尾'.repeat(10),plan:'b'.repeat(100),task:'b'.repeat(199)+E},
    {name:'250 two-unit characters',line:E.repeat(250),plan:E.repeat(100),task:E.repeat(200)},
    {name:'short',line:'短标题',plan:'短标题',task:'短标题'},
  ])await t.test(c.name,async()=>{
    const {plan}=await manualPlan(c.line);
    assert.equal(plan.title,c.plan);assert.equal(plan.actions[0]!.title,c.task);
  });
});
test('RAC-1897 a model plan cuts a clarification question to 500 and a task note to 10,000 whole characters',async t=>{
  for(const c of [
    {name:'the 500th character of the question is a two-unit one',question:'q'.repeat(499)+E+'尾'.repeat(10),notes:'逐条核实',questionOut:'q'.repeat(499)+E,notesOut:'逐条核实'},
    {name:'600 two-unit characters in the question',question:E.repeat(600),notes:'逐条核实',questionOut:E.repeat(500),notesOut:'逐条核实'},
    {name:'the 10,000th character of the notes is a two-unit one',question:'范围是什么？',notes:'n'.repeat(9999)+E+'尾'.repeat(10),questionOut:'范围是什么？',notesOut:'n'.repeat(9999)+E},
    {name:'11,000 two-unit characters in the notes',question:'范围是什么？',notes:E.repeat(11000),questionOut:'范围是什么？',notesOut:E.repeat(10000)},
    {name:'short',question:'范围是什么？',notes:'逐条核实',questionOut:'范围是什么？',notesOut:'逐条核实'},
  ])await t.test(c.name,async()=>{
    const {plan}=await modelPlan(c.question,c.notes);
    assert.deepEqual(plan.clarification_questions,[c.questionOut]);assert.equal(plan.actions[0]!.notes,c.notesOut);
  });
});
test('RAC-1898 the source text limit is 80,000 characters and a model task title limit is 500, whatever their length in UTF-16 units',async t=>{
  for(const c of [
    {name:'80,000 two-unit characters',text:E.repeat(80000),fits:true},
    {name:'80,000 plain characters',text:'尾'.repeat(80000),fits:true},
    {name:'79,999 plain characters and one two-unit one',text:'尾'.repeat(79999)+E,fits:true},
    {name:'80,001 plain characters',text:'尾'.repeat(80001),fits:false},
    {name:'80,001 two-unit characters',text:E.repeat(80001),fits:false},
    {name:'40,000 two-unit and 40,001 plain characters',text:E.repeat(40000)+'尾'.repeat(40001),fits:false},
  ])await t.test('source text: '+c.name,async()=>{
    if(c.fits)assert.equal((await manualPlan(c.text)).method,'manual');
    else await assert.rejects(()=>manualPlan(c.text),{code:'jelly.invalid'});
  });
  for(const c of [
    {name:'500 two-unit characters',title:E.repeat(500),fits:true},
    {name:'499 plain characters and one two-unit one',title:'尾'.repeat(499)+E,fits:true},
    {name:'500 plain characters',title:'尾'.repeat(500),fits:true},
    {name:'501 plain characters',title:'尾'.repeat(501),fits:false},
    {name:'501 two-unit characters',title:E.repeat(501),fits:false},
    {name:'250 two-unit and 251 plain characters',title:E.repeat(250)+'尾'.repeat(251),fits:false},
  ])await t.test('task title: '+c.name,async()=>{
    if(c.fits)assert.equal((await modelPlan('范围是什么？','',c.title)).plan.actions[0]!.title,c.title);
    else await assert.rejects(()=>modelPlan('范围是什么？','',c.title),{code:'jelly.ai_invalid'});
  });
});
test('RAC-1899 plans that fit are kept as they are',async t=>{
  await t.test('a short manual plan',async()=>{
    const {plan}=await manualPlan('写发布说明');
    assert.equal(plan.title,'写发布说明');assert.deepEqual(plan.actions.map(a=>a.title),['写发布说明']);
  });
  await t.test('a manual plan at its limits',async()=>{
    const {plan}=await manualPlan('尾'.repeat(200));
    assert.equal(plan.title,'尾'.repeat(100));assert.equal(plan.actions[0]!.title,'尾'.repeat(200));
  });
  await t.test('a model plan at its limits',async()=>{
    const {plan}=await modelPlan('q'.repeat(500),'n'.repeat(10000),'尾'.repeat(500));
    assert.deepEqual(plan.clarification_questions,['q'.repeat(500)]);assert.equal(plan.actions[0]!.notes,'n'.repeat(10000));assert.equal(plan.actions[0]!.title,'尾'.repeat(500));
  });
});
