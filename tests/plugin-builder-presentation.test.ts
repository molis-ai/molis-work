import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import Database from 'better-sqlite3';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import type {PluginCapabilityClient,PluginRouteBinding,PluginStartContext} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {BuildDocument,Design,RecordRow,Release} from '../plugins/native/plugin-builder/src/model.js';
import {builderManifest} from '../plugins/native/plugin-builder/src/manifest.js';
import {builderRoutes} from '../plugins/native/plugin-builder/src/routes.js';
import {BuilderWorkflow} from '../plugins/native/plugin-builder/src/workflow.js';
import {createGeneratedPlugin} from '../plugins/native/plugin-builder/src/generated.js';
import {parseCandidates,parseDesign} from '../plugins/native/plugin-builder/src/validation.js';

const design:Design={
 id:'notes',title:'笔记',description:'随时记录',journey:['新增笔记'],acceptance:['刷新后保留'],
 fields:[
  {id:'name',label:'标题',type:'text',required:true},
  {id:'url',label:'链接',type:'url',required:false},
  {id:'tags',label:'标签',type:'tags',required:false},
  {id:'count',label:'数量',type:'number',required:false},
 ],calculations:[],layout:'cards',allowImport:true,allowExport:true,
};
function fixture(db:Database.Database){
 const privateStorage=new SqlitePluginPrivateStorage(db);
 const base={board_id:'board',plugin_id:builderManifest.plugin_id,version:builderManifest.version,install_id:'builder',deployment:'local',grants:['storage:private'],requireGrant(){}} as PluginStartContext;
 const storage=privateStorage.forPlugin(base,builderManifest);
 const context={...base,services:{storage,capabilities:{async invoke(){throw new Error('A built-in example must not invoke a model');}} as PluginCapabilityClient}} as PluginStartContext;
 const workflow=new BuilderWorkflow(context,{async ready(){},async models(){return[];}});
 const routes=builderRoutes(context,workflow);
 const route=(id:string)=>{const binding=routes.find(r=>r.route_id===id);assert.ok(binding);return binding;};
 return {base,context,privateStorage,workflow,route};
}
const request=(route:PluginRouteBinding,id?:string,body?:unknown,query:Record<string,string>={})=>route.handle({method:body===undefined?'GET':'POST',pathname:'',params:id?{id}:{},query,actor_id:'actor',body});

test('presentation is optional and preserves only typed field bindings through design and candidate parsing',()=>{
 assert.deepEqual(parseDesign(design),design,'existing first-field designs remain unchanged');
 const presented={...design,presentation:{title:'name',description:'url',image:'url',metadata:'name',link:'url',tags:'tags',addLabel:'收集灵感'}};
 assert.deepEqual(parseDesign(presented),presented);
 const candidates=parseCandidates([{...presented,id:'cards',rationale:'图片浏览'},{...presented,id:'list',layout:'list',rationale:'集中回顾'}]);
 assert.deepEqual(candidates[1]!.presentation,presented.presentation);
 assert.deepEqual(parseDesign({...design,presentation:{title:'name',tags:'',image:null}}).presentation,{title:'name'},'an empty binding is the same as no binding');
 for(const key of ['title','description','image','metadata','link','tags']){
  assert.throws(()=>parseDesign({...design,presentation:{[key]:'missing'}}),/引用未知字段/);
  assert.throws(()=>parseDesign({...design,presentation:{[key]:'count'}}),/字段类型必须/);
 }
 for(const key of ['image','link','tags'])assert.throws(()=>parseDesign({...design,presentation:{[key]:'name'}}),/字段类型必须/);
 assert.throws(()=>parseDesign({...design,presentation:{title:'name',script:'alert(1)'}}),/不支持的属性 script/);
 assert.throws(()=>parseCandidates([{...presented,id:'cards',rationale:'图片',presentation:{html:'x'}},{...presented,id:'list',rationale:'列表'}]),/不支持的属性 html/);
 assert.throws(()=>parseDesign({...design,presentation:null}),/必须为对象/);
 for(const addLabel of ['', '   ', '字'.repeat(31)])assert.throws(()=>parseDesign({...design,presentation:{addLabel}}),/非空文字|超过 30 字/);
 assert.equal(parseDesign({...design,presentation:{addLabel:'字'.repeat(30)}}).presentation!.addLabel!.length,30);
});

test('explicit inspiration starter saves real preview records, survives reload and publishes an empty independent plugin',async()=>{
 const db=new Database(':memory:');
 try{
  const f=fixture(db);
  const response=await request(f.route('builder.create'),undefined,{starter:'inspiration'});
  assert.equal(response.status,201);
  let build=(response.body as {build:BuildDocument}).build;
  assert.equal(build.phase,'ready');assert.equal(build.example,'inspiration');assert.equal(build.title,'灵感库');
  assert.equal(build.design!.description,'把好想法留在这里。');
  assert.deepEqual(build.candidates.map(candidate=>candidate.layout),['cards','list','table']);
  assert.equal(build.active,null);assert.equal(build.runs,undefined);assert.equal(build.configuration,undefined);
  assert.match(build.messages.at(-1)!.text,/内置.*没有运行模型/);
  assert.deepEqual(build.design!.presentation,{title:'title',description:'note',image:'cover',tags:'tags',metadata:'source',link:'url',addLabel:'收集灵感'});
  const preview=await request(f.route('builder.preview'),build.id);
  const rows=(preview.body as {rows:RecordRow[]}).rows;
  assert.deepEqual(rows.map(row=>row.values.title),['空间里的秩序','少，但更好','自然的节奏','在路上，看见更大的自己']);
  assert.deepEqual(rows.map(row=>row.values.cover),['architecture','book','nature','lake'].map(name=>`https://molis.example/plugin-builder/samples/${name}`));
  for(const row of rows)assert.match(String(row.values.source),/^示例来源：.+ · 2026-09-\d{2}$/);
  const reloaded=fixture(db);
  assert.equal(reloaded.workflow.require(build.id).example,'inspiration');
  assert.deepEqual((await request(reloaded.route('builder.preview'),build.id)).body,preview.body);
  const filtered=await request(reloaded.route('builder.preview'),build.id,undefined,{tag:'设计'});
  assert.deepEqual((filtered.body as {rows:RecordRow[]}).rows.map(row=>row.values.title),['空间里的秩序','自然的节奏']);
  const changed=await request(reloaded.route('builder.record'),build.id,{action:'save',id:rows[0]!.id,revision:rows[0]!.revision,values:{...rows[0]!.values,note:'我在预览里写下的笔记'}});
  assert.equal(changed.status,200);
  assert.equal((changed.body as {record:RecordRow}).record.revision,2);
  const published=await request(reloaded.route('builder.action'),build.id,{action:'publish',revision:build.revision});
  assert.equal(published.status,200);
  const release=(published.body as {release:Release}).release;
  assert.deepEqual(release.design.presentation,build.design!.presentation);
  const generated=createGeneratedPlugin(release,()=>reloaded.workflow.store.releases()[0]!);
  const generatedContext={...f.base,plugin_id:release.pluginId,version:generated.manifest.version,install_id:'generated-inspiration'};
  const generatedStorage=f.privateStorage.forPlugin(generatedContext,generated.manifest);
  const app=await generated.start({...generatedContext,services:{storage:generatedStorage} as PluginStartContext['services']});
  assert.equal(app.kind,'app');if(app.kind!=='app')return;
  const read=app.routes!.find(r=>r.route_id==='generated.records')!;
  const mutate=app.routes!.find(r=>r.route_id==='generated.mutate')!;
  assert.deepEqual((await request(read)).body,{rows:[],summary:{count:0,totals:{}}});
  const saved=await request(mutate,undefined,{releaseVersion:1,action:'save',values:{title:'正式收藏',tags:['工作']}});
  assert.equal(saved.status,200);
  assert.deepEqual(((await request(read)).body as {rows:RecordRow[]}).rows.map(row=>row.values.title),['正式收藏']);
  assert.equal(((await request(reloaded.route('builder.preview'),build.id)).body as {rows:RecordRow[]}).rows.length,4);
  build=reloaded.workflow.require(build.id);
  assert.equal(build.example,'inspiration');assert.equal(build.phase,'ready');
 }finally{db.close();}
});

test('normal drafts stay empty and unmarked; unsupported starters are rejected without creating a draft',async()=>{
 const db=new Database(':memory:');
 try{
  const f=fixture(db);
  assert.equal((await request(f.route('builder.create'),undefined,{starter:'unknown'})).status,400);
  assert.deepEqual(f.workflow.store.list(),[]);
  const created=await request(f.route('builder.create'),undefined,{brief:'记录销售额'});
  assert.equal(created.status,201);
  const build=(created.body as {build:BuildDocument}).build;
  assert.equal(build.phase,'draft');assert.equal(build.design,null);assert.equal(build.example,undefined);
  assert.equal(build.messages.length,1);assert.equal(build.candidates.length,0);
 }finally{db.close();}
});

test('inspiration asset route serves the approved PNG bytes with its image content type',async()=>{
 const db=new Database(':memory:');
 try{
  const f=fixture(db);
  assert.ok(builderManifest.routes!.some(route=>route.method==='GET'&&route.path==='/assets/inspiration-atlas.png'&&route.route_id==='builder.inspiration-asset'));
  const response=await request(f.route('builder.inspiration-asset'));
  assert.equal(response.status,200);assert.equal(response.mime,'image/png');assert.equal(response.headers!['content-type'],'image/png');
  assert.ok(response.bytes instanceof Uint8Array);
  assert.deepEqual(Buffer.from(response.bytes!),await readFile(new URL('../specs/plugin-builder/ui/assets/inspiration-atlas.png',import.meta.url)));
  assert.equal(response.body,undefined,'image bytes are not encoded into JSON');
 }finally{db.close();}
});
