import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import type {PluginStartContext,PluginCapabilityClient,PluginRouteBinding} from '@molis-ai/molis-work-contracts/platform/plugin';
import {builderManifest} from '../plugins/native/plugin-builder/src/manifest.js';
import {BuilderWorkflow} from '../plugins/native/plugin-builder/src/workflow.js';
import {createGeneratedPlugin,type GeneratedPluginControl} from '../plugins/native/plugin-builder/src/generated.js';
import type {Design,UiNode} from '../plugins/native/plugin-builder/src/model.js';

const design:Design={id:'orders',title:'订单统计',description:'记录订单总额',journey:['录入总额','查看订单'],acceptance:['刷新保留总额'],fields:[{id:'total',label:'总额',type:'number',required:true}],calculations:[],layout:'table',allowImport:true,allowExport:true};
const nodes:UiNode[]=['heading','form','collection','actions'].map(kind=>({id:kind,kind:kind as UiNode['kind'],label:kind}));

test('publication validates installed records before activation and preserves the usable release on failure',async()=>{
 const db=new Database(':memory:');
 try{
  const privateStorage=new SqlitePluginPrivateStorage(db);
  const context={board_id:'board',plugin_id:builderManifest.plugin_id,version:'1.0.0',install_id:'builder',deployment:'local',grants:['storage:private'],requireGrant(){}} as PluginStartContext;
  const storage=privateStorage.forPlugin(context,builderManifest);
  let control:GeneratedPluginControl|undefined;let afterValidation:(()=>void)|undefined;
  const workflow=new BuilderWorkflow({...context,services:{storage,capabilities:{async invoke(){throw Error('No runtime call expected');}} as PluginCapabilityClient} as PluginStartContext['services']},{async ready(){},async models(){return[];},async publicationValidator(){assert.ok(control);return (design,behavior)=>{control!.validateRecords(design,behavior);afterValidation?.();};}});
  let draft=workflow.store.create('订单统计');
  draft=workflow.store.update(draft.id,draft.revision,doc=>{doc.design=structuredClone(design);doc.nodes=structuredClone(nodes);doc.behavior={calculations:[],allowImport:true,allowExport:true};doc.phase='ready';});
  const v1=await workflow.publish(draft.id,draft.revision);
  const definition=createGeneratedPlugin(v1,()=>workflow.store.releases()[0]!,value=>{control=value;});
  const generatedContext={...context,plugin_id:v1.pluginId,install_id:'generated'};
  const generatedStorage=privateStorage.forPlugin(generatedContext,definition.manifest);
  const app=await definition.start({...generatedContext,services:{storage:generatedStorage} as PluginStartContext['services']});
  assert.equal(app.kind,'app');if(app.kind!=='app')return;
  const route=(id:string)=>{const binding=app.routes!.find(r=>r.route_id===id);assert.ok(binding);return binding;};
  const request=async(binding:PluginRouteBinding,body?:unknown)=>binding.handle({method:body?'POST':'GET',pathname:'',params:{},query:{},actor_id:'actor',body});
  assert.equal((await request(route('generated.mutate'),{releaseVersion:1,action:'save',values:{total:100}})).status,200);
  draft=workflow.store.update(draft.id,workflow.require(draft.id).revision,doc=>{
   doc.design!.fields.push({id:'units',label:'数量',type:'number',required:false});
   doc.design!.calculations=[{id:'average',label:'均价',expression:{op:'divide',left:{op:'field',id:'total'},right:{op:'field',id:'units'}}}];
   doc.behavior!.calculations=structuredClone(doc.design!.calculations);
  });
  await assert.rejects(workflow.publish(draft.id,draft.revision),/原版本继续使用.*除数不能为/);
  assert.equal(workflow.store.releases()[0]!.version,1);
  assert.equal(workflow.store.versions(draft.id).length,1);
  const oldRows=await request(route('generated.records'));
  assert.equal(oldRows.status,200);assert.equal((oldRows.body as {rows:Array<{values:{total:number}}>}).rows[0]!.values.total,100);
  draft=workflow.store.update(draft.id,draft.revision,doc=>{
   doc.design!.calculations[0]!.expression={op:'if',condition:{op:'gt',left:{op:'field',id:'units'},right:{op:'literal',value:0}},then:{op:'divide',left:{op:'field',id:'total'},right:{op:'field',id:'units'}},else:{op:'literal',value:0}};
   doc.behavior!.calculations=structuredClone(doc.design!.calculations);
  });
  assert.equal((await workflow.publish(draft.id,draft.revision)).version,2);
  const newRows=await request(route('generated.records'));assert.equal(newRows.status,200);
  assert.deepEqual((newRows.body as {rows:Array<{values:unknown}>}).rows[0]!.values,{total:100,units:0,average:0});
  assert.equal((await request(route('generated.mutate'),{releaseVersion:1,action:'save',values:{total:200}})).status,400,'stale editor cannot write after successful activation');
  // A queued write must either precede validation, or see the new release and be rejected.
  const existing=(newRows.body as {rows:Array<{id:string;revision:number}>}).rows[0]!;
  assert.equal((await request(route('generated.mutate'),{releaseVersion:2,action:'save',id:existing.id,revision:existing.revision,values:{total:100,units:2}})).status,200);
  draft=workflow.store.update(draft.id,workflow.require(draft.id).revision,doc=>{doc.design!.calculations[0]!.expression={op:'divide',left:{op:'field',id:'total'},right:{op:'field',id:'units'}};doc.behavior!.calculations=structuredClone(doc.design!.calculations);});
  let queuedWrite:Promise<{status:number}>|undefined;
  afterValidation=()=>{queuedWrite=Promise.resolve().then(()=>request(route('generated.mutate'),{releaseVersion:2,action:'save',id:existing.id,revision:existing.revision+1,values:{total:100,units:0}}));};
  assert.equal((await workflow.publish(draft.id,draft.revision)).version,3);
  assert.equal((await queuedWrite)!.status,400,'no asynchronous write window between validation and activation');
  const finalRows=await request(route('generated.records'));assert.equal(finalRows.status,200);
  assert.equal((finalRows.body as {rows:Array<{values:{average:number}}>}).rows[0]!.values.average,50);
 }finally{db.close();}
});
