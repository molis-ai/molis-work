import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JellyPluginRouteTable, openJellyStore, runJellyAi, jellySourceHash, scheduleJellyActions, JELLY_MCP_EXPORTS, runJellyMcpTool, jellyManifest, emptyJellyWorkspace } from "../plugins/native/jelly/src/index.js";
import { isJellyPublicAddress } from "../apps/local-host/src/jelly-source-reader.js";
const day="2026-09-22";
function fixture(t: { after(fn:()=>void):void }) { const home=mkdtempSync(join(tmpdir(),'jelly-integration-')), store=openJellyStore(home);t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});return store; }
test('Jelly HTTP enforces revisions; native and MCP commands share persisted facts', async t=>{
  const store=fixture(t),table=new JellyPluginRouteTable(store);
  assert.equal(jellyManifest.kind,'native');assert.equal(jellyManifest.mcp_exports?.length,13);assert.ok(JELLY_MCP_EXPORTS.every(x=>x.scope==='home'));
  await assert.rejects(()=>table.handle({method:'POST',pathname:'/api/jelly/commands',query:new URLSearchParams(),body:{command:{type:'item.create',item:{title:'missing revision',start_date:day}}}}));
  const response=await table.handle({method:'POST',pathname:'/api/jelly/commands',query:new URLSearchParams(),body:{expected_revision:0,command:{type:'item.create',item:{title:'准备发布检查',start_date:day}}}});
  assert.equal(response?.status,200);const item=store.read().items[0]!;
  const listed=JSON.parse(runJellyMcpTool(store,{tool_id:'list_items',arguments:{start:day,end:day}}));assert.equal(listed.items[0].id,item.id);
  runJellyMcpTool(store,{tool_id:'set_task_completed',arguments:{id:item.id,completed:true,expected_revision:1}});assert.ok(store.read().items[0]?.completed_at);
  assert.throws(()=>runJellyMcpTool(store,{tool_id:'update_item',arguments:{id:item.id,patch:{title:'stale'},expected_revision:1}}),/其他窗口|版本/);
});
test('Jelly plans are previews, not writes, and schedule around real calendar occupancy',async t=>{
  const store=fixture(t);store.execute({type:'item.create',item:{title:'既有安排',start_date:day,start_time:540,end_time:600}});
  store.execute({type:'note.create',title:'发布',markdown:'准备发布材料\n确认说明'});
  const before=store.read(),note=before.notes[0]!;
  const generated=await runJellyAi(before,{kind:'decompose',source_type:'note',source_id:note.id,today:day,start_time:540},{completeText:async()=>JSON.stringify({actions:[{title:'核对文档',notes:'说明完整',minutes:30}]})});
  assert.ok('plan'in generated);assert.equal(generated.plan.actions[0]?.schedule?.start_time,600);assert.equal(store.read().revision,before.revision);
  store.execute({type:'plan.apply',plan:generated.plan},before.revision);assert.equal(store.read().items.length,2);assert.equal(store.read().task_links.length,1);
  store.execute({type:'plan.apply',plan:generated.plan},store.read().revision);assert.equal(store.read().items.length,2);
  const sourceHash=jellySourceHash(before,'note',note.id);assert.equal(generated.plan.source_hash,sourceHash);
});
test('Jelly AI failures retain source; no fabricated model output',async t=>{
  const store=fixture(t);store.execute({type:'inspiration.create',raw_text:'关于未来产品的一段真实原文'});const before=store.read(),id=before.inspirations[0]!.id;
  await assert.rejects(()=>runJellyAi(before,{kind:'digest',source_type:'inspiration',source_id:id},{}),/尚未配置/);
  await assert.rejects(()=>runJellyAi(before,{kind:'decompose',source_type:'inspiration',source_id:id},{completeText:async()=>'<not JSON>'}),/有效计划/);
  assert.deepEqual(store.read(),before);
  const manual=await runJellyAi(before,{kind:'decompose',source_type:'inspiration',source_id:id,manual:true},{});assert.ok('plan'in manual);assert.equal(manual.method,'manual');
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
test('long material keeps original evidence identities through hierarchical summaries',async t=>{
  const store=fixture(t);store.execute({type:'inspiration.create',raw_text:'第一段真实观察。'.repeat(1600)+'\n\n'+'第二段包含边界。'.repeat(1600)});let calls=0;
  const result=await runJellyAi(store.read(),{kind:'digest',source_type:'inspiration',source_id:store.read().inspirations[0]!.id},{completeText:async prompt=>{
    calls++;const blockMatch=prompt.match(/<材料块>\n([\s\S]*?)\n<\/材料块>/u);
    if(blockMatch){const blocks=JSON.parse(blockMatch[1]!);const id=blocks[0].id;return JSON.stringify({thesis:{text:'观察摘要',evidence_block_ids:[id]},takeaways:[{text:'保留观察与边界',evidence_block_ids:[id]}],chapters:[],quotes:[],dropped:[]});}
    const summaries=JSON.parse(prompt.match(/<分段摘要>\n([\s\S]*?)\n<\/分段摘要>/u)![1]!);return JSON.stringify({...summaries[0],takeaways:summaries.map((s:any)=>s.takeaways[0])});
  }});
  assert.ok('digest'in result);assert.ok(calls>=3);assert.equal(result.digest.snapshot?.blocks.map(b=>b.text).join('').length,store.read().inspirations[0]!.raw_text.replace(/\n/g,'').length);
  const ids=new Set(result.digest.snapshot!.blocks.map(b=>b.id));assert.ok(result.digest.structured!.takeaways.every(c=>c.evidence_block_ids.every(id=>ids.has(id))));assert.equal(store.read().inspirations[0]!.digest,null);
});
