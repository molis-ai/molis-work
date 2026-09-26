import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import type {PluginStartContext,PluginCapabilityClient,PluginRouteBinding,PluginUpgradeContext} from '@molis-ai/molis-work-contracts/platform/plugin';
import {builderManifest} from '../plugins/native/plugin-builder/src/manifest.js';
import {BuilderWorkflow} from '../plugins/native/plugin-builder/src/workflow.js';
import {compatibleReleaseVersions,createGeneratedPlugin,migratableReleaseVersions,type GeneratedPluginControl} from '../plugins/native/plugin-builder/src/generated.js';
import type {Design,UiNode} from '../plugins/native/plugin-builder/src/model.js';

const design:Design={id:'orders',title:'订单统计',description:'记录订单总额',journey:['录入总额','查看订单'],acceptance:['刷新保留总额'],fields:[{id:'total',label:'总额',type:'number',required:true}],calculations:[],layout:'table',allowImport:true,allowExport:true};
const nodes:UiNode[]=['heading','form','collection','actions'].map(kind=>({id:kind,kind:kind as UiNode['kind'],label:kind}));

test('publication adds an update candidate without switching installed code; manual upgrade validates and can be retried',async()=>{
 const db=new Database(':memory:');
 try{
  const privateStorage=new SqlitePluginPrivateStorage(db);
  const context={board_id:'board',plugin_id:builderManifest.plugin_id,version:builderManifest.version,install_id:'builder',deployment:'local',grants:['storage:private'],requireGrant(){}} as PluginStartContext;
  const storage=privateStorage.forPlugin(context,builderManifest);let control:GeneratedPluginControl|undefined;let installed='1.0.0';const attempts:number[]=[];let workflow!:BuilderWorkflow;
  workflow=new BuilderWorkflow({...context,services:{storage,capabilities:{async invoke(){throw Error('No runtime call expected');}} as PluginCapabilityClient} as PluginStartContext['services']},{async ready(){},async models(){return[];},async installedVersions(){const release=workflow.store.releases()[0];return release?{[release.pluginId]:installed}:{};},async upgradePublished(release){attempts.push(release.version);if(release.version===2)throw new Error('旧数据校验失败');installed=`${release.version}.0.0`;}});
  let draft=workflow.store.create('订单统计');
  draft=workflow.store.update(draft.id,draft.revision,doc=>{doc.design=structuredClone(design);doc.nodes=structuredClone(nodes);doc.behavior={calculations:[],allowImport:true,allowExport:true};doc.phase='ready';});
  const v1=await workflow.publish(draft.id,draft.revision);
  assert.deepEqual(attempts,[],'the first release does not invoke the upgrade path');
  const definition=createGeneratedPlugin(v1,()=>v1,value=>{control=value;});
  const generatedContext={...context,plugin_id:v1.pluginId,version:definition.manifest.version,install_id:'generated'};
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
  const v2=await workflow.publish(draft.id,draft.revision,false);
  assert.equal(v2.version,2);assert.equal(v2.compatibleWithPrevious,false);
  assert.deepEqual(attempts,[],'publishing a candidate leaves the installed interpreter untouched');
  assert.equal(workflow.store.releases()[0]!.version,2);
  assert.equal(((await request(route('generated.state'))).body as {release:{version:number}}).release.version,1,'the running route still serves the installed release');
  const installedRows=await request(route('generated.records'));
  assert.equal(installedRows.status,200);assert.equal((installedRows.body as {rows:Array<{values:{total:number}}>}).rows[0]!.values.total,100);
  const versions=workflow.store.versions(draft.id);
  const target=createGeneratedPlugin(v2,()=>v2,undefined,compatibleReleaseVersions(versions,v2.version),migratableReleaseVersions(versions,v2.version));
  assert.deepEqual(target.manifest.upgrade_compatibility?.migratable_from_versions,['1.0.0']);
  assert.ok(control);
  await assert.rejects(target.validateUpgrade!({from:{} as never,context:{...generatedContext,version:'2.0.0',services:{storage:generatedStorage}} as PluginUpgradeContext}),/除数不能为 0/);
  await assert.rejects(workflow.upgrade(draft.id,workflow.require(draft.id).revision,2),/升级失败，仍保留 v1/);
  assert.equal(installed,'1.0.0');assert.deepEqual(attempts,[2]);
  const stillInstalled=await request(route('generated.records'));
  assert.equal(stillInstalled.status,200);assert.equal((stillInstalled.body as {rows:Array<{values:{total:number}}>}).rows[0]!.values.total,100);

  draft=workflow.store.update(draft.id,workflow.require(draft.id).revision,doc=>{
   doc.design!.calculations[0]!.expression={op:'if',condition:{op:'gt',left:{op:'field',id:'units'},right:{op:'literal',value:0}},then:{op:'divide',left:{op:'field',id:'total'},right:{op:'field',id:'units'}},else:{op:'literal',value:0}};
   doc.behavior!.calculations=structuredClone(doc.design!.calculations);
  });
  const v3=await workflow.publish(draft.id,draft.revision,true);
  const v3Definition=createGeneratedPlugin(v3,()=>v3,undefined,compatibleReleaseVersions(workflow.store.versions(draft.id),v3.version),migratableReleaseVersions(workflow.store.versions(draft.id),v3.version));
  assert.deepEqual(v3Definition.manifest.upgrade_compatibility?.compatible_from_versions,['2.0.0']);
  assert.deepEqual(v3Definition.manifest.upgrade_compatibility?.migratable_from_versions,['1.0.0']);
  await v3Definition.validateUpgrade!({from:{} as never,context:{...generatedContext,version:'3.0.0',services:{storage:generatedStorage}} as PluginUpgradeContext});
  await workflow.upgrade(draft.id,workflow.require(draft.id).revision,3);
  assert.equal(installed,'3.0.0');assert.deepEqual(attempts,[2,3]);
 }finally{db.close();}
});
