import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ExperimentsService, experimentsManifest, summarize, EXPERIMENTS_CLIENT_FACTORY_SCRIPT, type ExperimentInput, type ModelAnswer, type ExecutionPort } from "@molis-ai/molis-work-plugin-experiments";
const input = (): ExperimentInput => ({ name:"工程 fixture，不是真实模型结果",task:{instructions:"仅根据材料判断",criteria:[{key:"yes",description:"足以支持"},{key:"no",description:"直接反驳"},{key:"unknown",description:"证据不足"}],positive_key:"yes",insufficient_key:"unknown"},cases:[{id:"a",label:"A",input:"只看到了标题",source:"fixture",reference:"unknown",reference_status:"agent",rationale:"不是人工金标"}],participants:[{id:"a",name:"Jev fixture",kind:"jev",model:"jev-latest"},{id:"b",name:"Grok fixture",kind:"grok",model:"grok-4.6",effort:"xhigh",executable:"/fixture/grok"}] });
const answer = (choice="unknown"): ModelAnswer => ({choice,model:"fixture",input_tokens:10,output_tokens:1,model_ms:null,startup_ms:null,reported_cost_usd:null,cost_basis:"fixture"});
function fixture(executor:()=>ExecutionPort) {
 const db=new DatabaseSync(":memory:");const storage=new SqlitePluginPrivateStorage(db).forPlugin({install_id:"fixture",plugin_id:experimentsManifest.plugin_id,version:experimentsManifest.version,deployment:"local",grants:["storage:private"],requireGrant(){}},experimentsManifest);
 return {db,storage,service:new ExperimentsService(storage,executor)};
}
test("frozen dataset is isolated from callers; labels and peer answers never reach executors; results reopen",async()=>{
 const requests:unknown[]=[];const f=fixture(()=>({async evaluate(p,r){requests.push(r);return answer(p.id==='a'?'unknown':'yes');},close(){}}));
 try{const original=input();const e=f.service.create(original);original.cases[0]!.input="mutated";e.task.instructions="mutated";
 assert.equal(f.service.get(e.id).task.instructions,"仅根据材料判断");const hash=e.hash;
 f.service.start(e.id);await f.service.idle();const done=f.service.get(e.id);assert.equal(done.status,"completed");assert.equal(done.hash,hash);
 assert.deepEqual(requests,[{task:{instructions:"仅根据材料判断",criteria:input().task.criteria},input:"只看到了标题"},{task:{instructions:"仅根据材料判断",criteria:input().task.criteria},input:"只看到了标题"}]);
 const summary=summarize(done);assert.equal(summary[0]!.accuracy,null);assert.equal(summary[0]!.agent_agreement,1);assert.equal(summary[0]!.disagreements,1);assert.equal(summary[0]!.reported_cost_usd,null);
 const reopened=new ExperimentsService(f.storage,()=>{throw Error("not called")});assert.deepEqual(reopened.get(e.id),done);
 assert.throws(()=>reopened.start(e.id),/复制/);
 }finally{f.db.close();}
});
test("one active experiment, cancellation stops pending work and preserves completed cells",async()=>{
 let entered!:()=>void;const started=new Promise<void>(r=>entered=r);let calls=0;
 const f=fixture(()=>({async evaluate(p,r,signal){calls++;entered();await new Promise<void>((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));return answer();},close(){}}));
 try{const e=f.service.create(input());f.service.start(e.id);await started;assert.throws(()=>f.service.start(e.id),/正在运行/);f.service.cancel(e.id);await f.service.idle();const done=f.service.get(e.id);assert.equal(calls,1);assert.equal(done.status,"cancelled");assert.deepEqual(done.cells.map(c=>c.status),['cancelled','cancelled']);assert.equal(done.cells[1]!.attempts,0);}finally{f.db.close();}
});
test("invalid output and failures are not correct; human review is separate append-only evidence",async()=>{
 const f=fixture(()=>({async evaluate(p){if(p.id==='a')return answer('invalid');return answer('yes');},close(){}}));
 try{const i=input();i.cases[0]!.reference_status="human";const e=f.service.create(i);assert.throws(()=>f.service.review(e.id,'a','yes','checked'),/运行结束/);f.service.start(e.id);await f.service.idle();let done=f.service.get(e.id);assert.equal(done.cells[0]!.status,'failed');assert.equal(summarize(done)[0]!.accuracy,0);assert.equal(summarize(done)[0]!.labeled_failures,1);assert.equal(summarize(done)[1]!.false_positive,1);
 f.service.review(e.id,'a','yes','用户核对后的结论');done=f.service.get(e.id);assert.equal(done.cases[0]!.reference,'unknown');assert.equal(done.hash,e.hash);assert.equal(summarize(done)[1]!.accuracy,1);assert.equal(done.reviews.length,1);
 assert.throws(()=>f.service.review(e.id,'other','yes','checked'),/无效/);
 }finally{f.db.close();}
});
test("restart marks running and pending interrupted without replaying calls",()=>{
 const f=fixture(()=>{throw Error('unused')});try{const e=f.service.create(input());const data=JSON.parse(f.storage.get('experiments.v1')!);data.experiments[0].status='running';data.experiments[0].cells[0].status='running';f.storage.set('experiments.v1',JSON.stringify(data));const recovered=new ExperimentsService(f.storage,()=>{throw Error('must not invoke')});assert.equal(recovered.get(e.id).status,'interrupted');assert.ok(recovered.get(e.id).cells.every(c=>c.status==='failed'));}finally{f.db.close();}
});
test("reject invalid input, changing Grok constraints, duplicate arms and fake reference states",()=>{
 const f=fixture(()=>({async evaluate(){return answer();},close(){}}));try{let i=input();i.participants[1]!.effort=undefined;assert.throws(()=>f.service.create(i),/xhigh/);i=input();i.cases[0]!.reference_status='unlabeled';assert.throws(()=>f.service.create(i),/不一致/);i=input();i.participants[1]!.id='a';assert.throws(()=>f.service.create(i),/重复/);i=input();i.cases[0]!.input='x'.repeat(8001);assert.throws(()=>f.service.create(i),/8000/);}finally{f.db.close();}
});
test("client script parses without executing browser globals",()=>{assert.equal(typeof new Function('return ('+EXPERIMENTS_CLIENT_FACTORY_SCRIPT+')')(),'function');});
