import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {SqlitePluginPrivateStorage,privateValueReplicaOwner,installPrivateValueReplicationJournal,validatePrivateValueReplication} from '@molis-ai/molis-work-plugin-runtime';
import {AgentBuilderStore,builderManifest,builderPrivateValueReplicationOwner,builderSyncProjection,BUILDER_CONTENT_REPLICA_ID,expandDesign,contractEffects,type AgentRelease,type AgentBuild} from '@molis-ai/molis-work-plugin-builder';
import {pluginComponentChoices} from '@molis-ai/molis-work-design-system';
import {createSqliteReplica,initializeReplica,namespacedReplicaDatabase,replicaMarkRowsSql,bindDatabaseSpace,personalStorageSpace,replicaSchemaSql} from '@molis-ai/molis-work-storage';
import {createSyncConflictState,createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {detail} from './fixtures/builder-workflow-design.js';
import {createPersonalSync} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {ensureStorageSpace} from '@molis-ai/molis-work-storage';

const KEY='plugin-builder:agent-built:v1',projectId='portable-builder';
function fixture(t:TestContext){
 const base=mkdtempSync(join(tmpdir(),'builder-sync-owner-')),homes=[join(base,'a'),join(base,'b')];homes.forEach(p=>mkdirSync(p,{recursive:true}));
 const databases=homes.map(home=>new DatabaseSync(join(home,'project.db'))),space=personalStorageSpace('https://auth.example.test','work','alice');
 t.after(()=>{databases.forEach(db=>db.close());rmSync(base,{recursive:true,force:true});});let active=true,busy=false;
 const authorize=()=>{if(!active)throw new Error('REVOKED');};
 const context={install_id:'agent-studio:'+projectId,plugin_id:builderManifest.plugin_id,version:builderManifest.version,deployment:'local' as const,grants:['storage:private'],project_id:projectId,requireGrant(){authorize();}};
 const storage=databases.map(db=>new SqlitePluginPrivateStorage(db).forPlugin(context,builderManifest));
 const stores=storage.map(s=>new AgentBuilderStore(s));
 const definitions=homes.map((home,index)=>builderPrivateValueReplicationOwner({home,authorize,assertIdle(){if(index===1&&busy)throw new Error('LOCAL_PREVIEW_BUSY');}}));
 const replicas=databases.map((db,index)=>{bindDatabaseSpace(db,space);db.exec(replicaSchemaSql('builder'));initializeReplica(namespacedReplicaDatabase(db,'builder'));installPrivateValueReplicationJournal(db,definitions[index]!,sql=>replicaMarkRowsSql(sql).replace(/\breplica_/g,'builder_replica_'));
  return createSqliteReplica(namespacedReplicaDatabase(db,'builder'),{...privateValueReplicaOwner(db,definitions[index]!,{spaceId:space.spaceId,projectId,title:'Builder owner',authorize}),conflictState:createSyncConflictState});});
 const create=()=>{
  const b=stores[0]!.create('完整创作需求'),pluginId='io.molis.work.generated.'+b.id;
  const design=expandDesign(JSON.parse(detail('可携带笔记')),{id:'board',title:'Portable',description:'Saved design',rationale:'Preserve content',journey:['Write','Read']},pluginId,'saved-r1',[]);
  const directory=join(homes[0]!,'plugin-builder',projectId,'builds',b.id,'saved-r1');mkdirSync(join(directory,'src','operations'),{recursive:true});mkdirSync(join(directory,'tests'),{recursive:true});
  for(const [name,text] of [['src/operations/0.ts','export default async()=>"中文🙂";'],['src/工具.ts','export const text="完整工具";'],['tests/empty.ts',''],['contract.json',JSON.stringify(design.contract)]])writeFileSync(join(directory,name!),text!);
  const saved=stores[0]!.update(b.id,b.revision,row=>{row.design=design;row.directory=directory;row.phase='paused';row.messages.push({role:'assistant',text:'保存的完整生成记录'});});return saved;
 };
 const send=(revision=1)=>{const op=replicas[0]!.next();assert.ok(op);replicas[1]!.receive({...op,revision});replicas[0]!.acknowledge(op.key,op.operationId,revision);return op;};
 return {base,homes,databases,space,storage,stores,definitions,replicas,create,send,revoke(){active=false;},allow(){active=true;},preview(on:boolean){busy=on;}};
}

test('S-67 PCSYNC-22/23 Builder uses its actual private owner and transfers complete authored bytes without native state or echo',t=>{
 const f=fixture(t),source=f.create();f.storage[0]!.set('plugin-builder:agent-studio:model','SOURCE_PRIVATE_MODEL');
 const op=f.send();assert.doesNotMatch(JSON.stringify(op.value),/SOURCE_PRIVATE_MODEL|\/builds\/|\/a\/plugin-builder/);
 const received=f.stores[1]!.require(source.id);assert.equal(received.active,null);assert.equal(received.phase,'paused');assert.equal(received.revision,1);
 assert.equal(readFileSync(join(received.directory!,'src','工具.ts'),'utf8'),'export const text="完整工具";');assert.equal(readFileSync(join(received.directory!,'tests','empty.ts')).length,0);
 assert.deepEqual(received.design,source.design);assert.deepEqual(received.messages,source.messages);assert.equal(f.storage[1]!.get('plugin-builder:agent-studio:model'),null);assert.equal(f.replicas[1]!.next(),null);
 f.stores[0]!.update(source.id,source.revision,row=>{row.title='Later title';});f.send(2);assert.equal(f.stores[1]!.require(source.id).revision,2);
 assert.throws(()=>f.stores[1]!.update(source.id,received.revision,()=>{}),/草稿已更新/);
});

test('S-67 PCSYNC-17/22 Builder tombstones retain editing floors and restoration does not revive an old editor',t=>{
 const f=fixture(t),source=f.create(),op=f.send(),key=op.key;
 f.replicas[1]!.receive({key,value:null,base:1,revision:2,operationId:'delete'});
 assert.deepEqual(f.stores[1]!.list(),[]);const deleted=JSON.parse(f.storage[1]!.get(KEY)!);assert.equal(deleted.revisions[source.id],2);
 f.replicas[1]!.receive({...op,base:2,revision:3,operationId:'restore'});const restored=f.stores[1]!.require(source.id);assert.equal(restored.revision,3);
 assert.throws(()=>f.stores[1]!.update(source.id,1,()=>{}),/草稿已更新/);assert.equal(f.replicas[1]!.next(),null);
});

test('S-67 PCSYNC-12/23 active work and the trusted composition guard reject replacement and deletion without clearing content',t=>{
 const f=fixture(t),source=f.create(),op=f.send();f.preview(true);
 f.replicas[1]!.receive({...op,base:1,revision:2,operationId:'preview-replace'});
 assert.equal(f.stores[1]!.require(source.id).revision,1);assert.equal(f.replicas[1]!.conflicts().length,1);
 assert.throws(()=>f.replicas[1]!.resolve(op.key,'remote',2),/LOCAL_PREVIEW_BUSY/);f.preview(false);f.replicas[1]!.resolve(op.key,'remote',2);
 f.stores[1]!.update(source.id,2,row=>{row.active={token:'target-only',stage:'build'};row.phase='building';});
 const current=f.storage[1]!.get(KEY);f.replicas[1]!.receive({key:op.key,value:null,base:1,revision:3,operationId:'active-delete'});
 assert.equal(f.storage[1]!.get(KEY),current);assert.ok(f.replicas[1]!.conflicts().length>0);
 assert.throws(()=>f.replicas[1]!.resolve(op.key,'remote',3),/创作执行尚未结束/);assert.equal(f.storage[1]!.get(KEY),current);
});

test('S-67 PCSYNC-01/14 Builder pure validation rejects native fields and corrupted authored bytes before target staging',t=>{
 const f=fixture(t);f.create();const op=f.replicas[0]!.next()!;
 const wire=structuredClone(op.value) as {content:Record<string,unknown>},original=wire.content;
 for(const mutate of [(v:Record<string,unknown>)=>{(v.builds as Record<string,unknown>[])[0]!.directory='/outside';},(v:Record<string,unknown>)=>{const files=v.files as Record<string,Array<{files:Array<{bytes:string}>}>>;Object.values(files)[0]![0]!.files[0]!.bytes='Y29ycnVwdA==';}]){
  const bad=structuredClone(original);mutate(bad);wire.content=bad;
  assert.throws(()=>validatePrivateValueReplication(wire,f.definitions[1]!,{spaceId:f.space.spaceId,projectId,title:'Builder owner',authorize(){}},op.key));
  assert.equal(existsSync(join(f.homes[1]!,'plugin-builder')),false);
 }
});

test('S-67 PCSYNC-11/14 an authored symlink refuses complete capture and never uploads its external target',t=>{
 const f=fixture(t),source=f.create();writeFileSync(join(f.base,'outside-secret'),'DO_NOT_UPLOAD');symlinkSync(join(f.base,'outside-secret'),join(source.directory!,'src','external.ts'));
 assert.throws(()=>f.replicas[0]!.next(),/文件内容或路径无效/);assert.equal(f.stores[0]!.require(source.id).directory,source.directory);
});

test('S-67 PCSYNC-01/14 design schemas, component bindings, observations and history are validated before target staging',t=>{
 const f=fixture(t);f.create();const op=f.replicas[0]!.next()!,before=f.storage[0]!.get(KEY);
 const mutations:Array<(row:AgentBuild)=>void>=[
  row=>{row.design!.contract.operations[0]!.input={type:'array'};},
  row=>{Reflect.set(row.design!.contract,'native_state',{directory:'/not-portable'});},
  row=>{row.design!.contract.operations[0]!.effects.storage=['write'];},
  row=>{row.design!.contract.operations[0]!.examples[0]!.input='not-the-declared-object';},
  row=>{row.design!.contract.pages[0]!.regions[0]!.operationIds=['absent-operation'];},
  row=>{row.design!.parts[0]!.pageId='absent-page';},
  row=>{row.design!.parts.find(p=>p.read)!.read!.operationId='absent-operation';},
  row=>{const plan=row.design!.parts[0]!;row.nodes=[{...plan,kind:pluginComponentChoices(plan,row.design!.contract)[0]!.kind,props:{...plan.props,title:'different from the frozen plan'}}];},
  row=>{row.connected=['absent-operation'];},
  row=>{row.checks['absent-operation']={passed:true,gates:[]};},
  row=>{row.chosen='absent-proposal';},
  row=>{row.pendingPart={id:'absent-part',candidates:['card'],reason:'saved decision'};},
  row=>{row.pendingPart={id:row.design!.parts[0]!.id,candidates:['not-a-renderer'],reason:'saved decision'};},
  row=>{row.rework={'absent-operation':'cannot resume this operation'};},
  row=>{row.browserResult={passed:true,cases:[{id:'absent-acceptance',passed:true,detail:'unbound'}],at:'2026-10-19T00:00:00Z'};},
  row=>{const design=structuredClone(row.design!);design.contract.pluginId='io.molis.work.generated.foreign';row.history=[{design,nodes:[],connected:[]}];},
  row=>{row.design!.acceptance[0]!.steps=[{action:'expect',componentId:'absent-component',text:'not there'}];},
  row=>{row.design!.contract.operations.push(structuredClone(row.design!.contract.operations[0]!));},
  row=>{const design=row.design!;row.candidates=[{id:'proposal',title:'proposal',description:'saved',rationale:'saved',journey:['read'],effects:contractEffects(design),preview:{contract:structuredClone(design.contract),parts:structuredClone(design.parts)}}];row.candidates[0]!.preview.parts[0]!.pageId='absent-page';},
 ];
 for(const mutate of mutations){const value=structuredClone(op.value) as {content:{builds:AgentBuild[]}};mutate(value.content.builds[0]!);
  assert.throws(()=>validatePrivateValueReplication(value,f.definitions[1]!,{spaceId:f.space.spaceId,projectId,title:'Builder owner',authorize(){}},op.key),/创作同步内容或归属无效/);
  assert.equal(existsSync(join(f.homes[1]!,'plugin-builder')),false);assert.equal(f.storage[0]!.get(KEY),before);
 }
});

test('S-67 PCSYNC-22/23 all five fixed release files survive and another body at the same version cannot replace them',t=>{
 const f=fixture(t),build=f.create(),design=build.design!,directory=join(f.homes[0]!,'plugin-builder',projectId,'releases',build.id,'v1');mkdirSync(directory,{recursive:true});
 const manifest={version:1 as const,pluginId:design.contract.pluginId,revision:design.contract.revision,effects:contractEffects(design)};
 const nodes=design.parts.map(plan=>({...plan,kind:pluginComponentChoices(plan,design.contract)[0]!.kind}));
 const bodies={'plugin.mjs':'globalThis.__DO_NOT_RUN_SYNC_IMPORT=true;export const operations={};','manifest.json':JSON.stringify(manifest),'contract.json':JSON.stringify(design.contract),'interface.json':JSON.stringify({nodes,acceptance:design.acceptance}),'prompts.json':'[]'};
 for(const [name,body] of Object.entries(bodies))writeFileSync(join(directory,name),body);
 const release:AgentRelease={buildId:build.id,pluginId:design.contract.pluginId,version:1,design,nodes,manifest,directory,bundlePath:join(directory,'plugin.mjs'),packagePath:directory,permissions:manifest.effects,publishedAt:'2026-10-19T00:00:00Z',prompts:[]};
 f.stores[0]!.release(release);const releaseOp=f.send();const copied=f.stores[1]!.versions(build.id)[0]!;
 for(const [name,body] of Object.entries(bodies))assert.equal(readFileSync(join(copied.directory,name),'utf8'),body);
 assert.equal(Reflect.get(globalThis,'__DO_NOT_RUN_SYNC_IMPORT'),undefined);assert.notEqual(copied.directory,directory);
 const forged=structuredClone(releaseOp.value) as {content:{files:Record<string,Array<{slot:string;files:Array<{path:string;bytes:string;size:number;digest:string}>}>>}};
 const file=forged.content.files[build.id]!.find(d=>d.slot==='release-1')!.files.find(f=>f.path==='interface.json')!,bytes=Buffer.from('{"nodes":[],"acceptance":[],"extra":true}');
 Object.assign(file,{bytes:bytes.toString('base64'),size:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')});
 assert.throws(()=>validatePrivateValueReplication(forged,f.definitions[1]!,{spaceId:f.space.spaceId,projectId,title:'Builder owner',authorize(){}},releaseOp.key),/创作同步内容或归属无效/);
 const falseEffects=structuredClone(releaseOp.value) as typeof forged&{content:{releases:Array<{manifest:{effects:unknown};permissions:unknown}>}};
 const declaration=falseEffects.content.releases[0]!;declaration.manifest.effects={};declaration.permissions={};
 const manifestFile=falseEffects.content.files[build.id]!.find(d=>d.slot==='release-1')!.files.find(f=>f.path==='manifest.json')!,manifestBytes=Buffer.from(JSON.stringify(declaration.manifest));
 Object.assign(manifestFile,{bytes:manifestBytes.toString('base64'),size:manifestBytes.length,digest:createHash('sha256').update(manifestBytes).digest('hex')});
 assert.throws(()=>validatePrivateValueReplication(falseEffects,f.definitions[1]!,{spaceId:f.space.spaceId,projectId,title:'Builder owner',authorize(){}},releaseOp.key),/创作同步内容或归属无效/,'checksum-valid permissions cannot omit effects required by the actual contract');
 writeFileSync(join(directory,'plugin.mjs'),'another body at the fixed version');f.stores[0]!.update(build.id,build.revision,row=>{row.title='force a normal owner mutation';});
 const changed=f.replicas[0]!.next()!;f.replicas[1]!.receive({...changed,revision:2});assert.equal(f.replicas[1]!.conflicts().length,1);
 assert.equal(readFileSync(join(copied.directory,'plugin.mjs'),'utf8'),bodies['plugin.mjs']);
});

test('S-67 PCSYNC-06 late revocation rolls back private business facts, editing floors, head and cursor together',t=>{
 const f=fixture(t),build=f.create();f.send();const before=f.storage[1]!.get(KEY);
 f.stores[0]!.update(build.id,build.revision,row=>{row.title='must roll back';});const changed=f.replicas[0]!.next()!;
 f.databases[1]!.function('revoke_builder_sync',()=>{f.revoke();return 0;});
 f.databases[1]!.exec("CREATE TRIGGER revoke_builder_after_insert AFTER UPDATE ON plugin_private_values WHEN NEW.item_key='plugin-builder:agent-built:v1' BEGIN SELECT revoke_builder_sync(); END");
 assert.throws(()=>f.replicas[1]!.receive({...changed,revision:2}),/REVOKED/);f.allow();assert.equal(f.storage[1]!.get(KEY),before);assert.equal(f.replicas[1]!.cursor(),1);
 f.databases[1]!.exec('DROP TRIGGER revoke_builder_after_insert');f.replicas[1]!.receive({...changed,revision:2});assert.equal(f.stores[1]!.require(build.id).title,'must roll back');
});

test('S-67 PCSYNC-12 independent creations isolate missing bytes and only the edited item is journaled across connections',t=>{
 const f=fixture(t),broken=f.create(),healthy=f.create(),badKey=JSON.stringify([projectId,BUILDER_CONTENT_REPLICA_ID,broken.id]);
 rmSync(join(broken.directory!,'src'),{recursive:true});symlinkSync(join(f.base,'missing-source'),join(broken.directory!,'src'));
 assert.throws(()=>f.replicas[0]!.next());
 const op=f.replicas[0]!.next({excludeKeys:[badKey]});assert.ok(op);assert.equal(JSON.parse(op.key)[2],healthy.id);
 f.replicas[1]!.receive({...op,revision:1});f.replicas[0]!.acknowledge(op.key,op.operationId,1);
 const target=f.stores[1]!.require(healthy.id),other=f.stores[1]!.create('独立的本机活动创作');
 f.stores[1]!.update(other.id,other.revision,row=>{row.active={token:'local-only',stage:'build'};row.phase='building';});
 const second=new DatabaseSync(join(f.homes[0]!,'project.db'));t.after(()=>second.close());
 const privateStore=new SqlitePluginPrivateStorage(second).forPlugin({install_id:'agent-studio:'+projectId,plugin_id:builderManifest.plugin_id,version:builderManifest.version,deployment:'local',grants:['storage:private'],project_id:projectId,requireGrant(){}},builderManifest);
 new AgentBuilderStore(privateStore).update(healthy.id,healthy.revision,row=>{row.title='another connection';});
 const changed=f.replicas[0]!.next({excludeKeys:[badKey]})!;assert.ok(changed);assert.equal(changed.key,op.key);
 f.replicas[1]!.receive({...changed,revision:2});f.replicas[0]!.acknowledge(changed.key,changed.operationId,2);
 assert.equal(f.stores[1]!.require(healthy.id).title,'another connection');assert.equal(f.stores[1]!.require(healthy.id).revision,target.revision+1);
 assert.equal(f.stores[1]!.require(other.id).active?.token,'local-only');assert.equal(f.replicas[0]!.next({excludeKeys:[badKey]}),null);
 assert.throws(()=>validatePrivateValueReplication(op.value,f.definitions[1]!,{spaceId:f.space.spaceId,projectId,title:'Builder owner',authorize(){}},badKey));
});

test('S-67 PCSYNC-14 Builder explicit byte projection round-trips exact files and empty files through the common codec',async t=>{
 const f=fixture(t),build=f.create(),op=f.replicas[0]!.next()!,codec=createSyncJsonContent({spaceId:f.space.spaceId,authorize(){},...builderSyncProjection});
 const encoded=codec.encode(op.key,op.value);assert.ok(encoded.blobs.length>1);assert.doesNotMatch(JSON.stringify(encoded.value),/完整工具/);
 const decoded=await codec.decode(op.key,encoded.value,async ref=>encoded.blobs.find(b=>b.digest===ref.digest)!.bytes);assert.deepEqual(decoded,op.value);
 f.replicas[1]!.receive({...op,value:decoded,revision:1});const copied=f.stores[1]!.require(build.id);assert.equal(readFileSync(join(copied.directory!,'tests','empty.ts')).length,0);
 await assert.rejects(()=>codec.decode(op.key,encoded.value,async()=>Buffer.from('changed')));
});

test('S-67 PCSYNC-22 ready mockup references keep the image owner identity without restoring an active drawing job',t=>{
 const f=fixture(t),build=f.create(),design=build.design!;
 f.stores[0]!.update(build.id,build.revision,row=>{row.candidates=[{id:'saved-proposal',title:'Saved proposal',description:'A saved mockup',rationale:'Read-only reference',journey:['Inspect'],effects:contractEffects(design),preview:{contract:design.contract,parts:design.parts},mockup:{status:'ready',jobId:'saved-image-job',imageId:'saved-image'}}];});
 f.send();assert.deepEqual(f.stores[1]!.require(build.id).candidates[0]!.mockup,{status:'ready',jobId:'saved-image-job',imageId:'saved-image'});assert.equal(f.stores[1]!.require(build.id).active,null);assert.equal(f.replicas[1]!.next(),null);
});

test('S-67 PCSYNC-01/14 actual Host rejects malformed authoring items before creating an empty target project',async t=>{
 const f=fixture(t);f.create();const op=f.replicas[0]!.next()!,previous=process.env.MOLIS_WORK_SYNC_ORIGIN;process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=previous;});
 const c=builderManifest.sync!.collections[0]!,selection={plugin_id:builderManifest.plugin_id,publisher_id:builderManifest.publisher.publisher_id,publisher_signature:builderManifest.publisher.signature,collection_id:c.id,schema_version:c.schema_version};
 let incoming:unknown=null;t.mock.method(globalThis,'fetch',async(input:URL|string)=>{const url=new URL(String(input));if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:f.space.spaceId,revision:1,selections:[selection]},(incoming as {revision:number}|null)?.revision??0);if(url.pathname==='/v1/policy')return Response.json({spaceId:f.space.spaceId,revision:1,selections:[selection]});if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});assert.equal(url.pathname,'/v1/changes');return Response.json({events:[incoming],more:false});});
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
 const original=op.value as {content:{builds:AgentBuild[];files:Record<string,unknown>}};
 for(let variant=0;variant<6;variant++){const value=structuredClone(original),row=value.content.builds[0]!;if(variant===0)row.directory='/foreign-native';if(variant===1)row.id='another-build';if(variant===2)Object.assign(row,{browserResult:{passed:true,cases:'not-a-list',at:'2026-10-19T00:00:00Z'}});if(variant===3)row.design!.contract.operations[0]!.input={type:'array'};if(variant===4)row.design!.parts[0]!.pageId='absent-page';if(variant===5){const design=structuredClone(row.design!);design.contract.pluginId='io.molis.work.generated.foreign';row.history=[{design,nodes:[],connected:[]}];}
  incoming={...op,value,revision:1};const home=join(f.base,'uninitialized-'+variant);ensureStorageSpace(home,f.space);const client=(await createPersonalSync(home,f.space,lease,withMolisWorkProjectCatalog,check))!;
  try{await client.run();assert.notEqual(client.status().error,null);assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:home},catalog=>catalog.listProjects()),[]);assert.equal(existsSync(join(home,'plugin-builder')),false);}finally{client.close();}
 }
});
