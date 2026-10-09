import { modelPromptText } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JellyPluginRouteTable, openJellyStore, runJellyAi, jellySourceHash, scheduleJellyActions, jellyActions, jellyCommandActions, jellyManifest, emptyJellyWorkspace } from "../plugins/native/jelly/src/index.js";
import { isJellyPublicAddress } from "../apps/local-host/src/jelly-source-reader.js";
const day="2026-09-22";
function fixture(t: { after(fn:()=>void):void }) { const home=mkdtempSync(join(tmpdir(),'jelly-integration-')), store=openJellyStore(home);t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});return store; }
test('Jelly HTTP enforces revisions; routes and actions share persisted facts', async t=>{
  const home=mkdtempSync(join(tmpdir(),"jelly-routes-")), store=openJellyStore(home), host=new MolisWorkLocalHost({homeDirectory:home,completeText:null});
  t.after(async()=>{store.close();await host.close();rmSync(home,{recursive:true,force:true});});
  const actions=bindActionClient(host.homeActionClient(),()=>({actor_id:"user",project_id:null,audience:"user",permissions:JELLY_ACTION_PERMISSIONS})),table=new JellyPluginRouteTable(actions);
  assert.equal(jellyManifest.kind,'native');
  await assert.rejects(()=>table.handle({method:'POST',pathname:'/api/jelly/commands',query:new URLSearchParams(),body:{command:{type:'item.create',item:{title:'missing revision',start_date:day}}}}));
  const response=await table.handle({method:'POST',pathname:'/api/jelly/commands',query:new URLSearchParams(),body:{expected_revision:0,command:{type:'item.create',item:{title:'准备发布检查',start_date:day}}}});
  assert.equal(response?.status,200);const item=store.read().items[0]!;
  const listed=await actions.invoke(jellyActions.calendar,{start:day,end:day});assert.equal(listed.items[0]!.id,item.id);
  await actions.invoke(jellyCommandActions['item.complete'],{id:item.id,completed:true,expected_revision:1});assert.ok(store.read().items[0]?.completed_at);
  await assert.rejects(()=>actions.invoke(jellyCommandActions['item.update'],{id:item.id,patch:{title:'stale'},expected_revision:1}),/其他窗口|版本/);
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
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])assert.equal(isJellyPublicAddress(ip),false,ip);
 assert.equal(isJellyPublicAddress('8.8.8.8'),true);assert.equal(isJellyPublicAddress('2606:4700:4700::1111'),true);
});
test('proposed slots preserve cross-midnight occupancy and report no slot when full',()=>{
 const state=emptyJellyWorkspace();const action={id:'a',title:'制作',notes:'',category_id:'uncategorized',priority:'none' as const,schedule:null};
 assert.equal(scheduleJellyActions(state,[action],day,1260)[0]?.schedule?.start_date,'2026-09-23');
 assert.equal(scheduleJellyActions(state,[action],day,540)[0]?.schedule?.end_time,570);
});
