import assert from 'node:assert/strict';
import type {TestContext} from 'node:test';
import {mkdtempSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import type {PluginManifest,PluginPrivateStorage} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {PrivateValueReplicationOwner,SyncContentCodec,SyncBlobSource} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {StorageSpace} from '@molis-ai/molis-work-contracts/platform/storage';
import {createPersonalSync,LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createSqliteReplica,namespacedReplicaDatabase,ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {privateValueReplicaOwner,SqlitePluginPrivateStorage,SqlitePluginRuntimeRepository} from '@molis-ai/molis-work-plugin-runtime';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import {fixedSyncDownload} from './sync-download.js';

interface Options {
 home:string;space:StorageSpace;projectId:string;itemId:string;manifest:PluginManifest;storage:PluginPrivateStorage;
 owner(home:string):PrivateValueReplicationOwner;codec:SyncContentCodec;
 verifyTarget(target:LocalProjectDatabase,home:string,projectId:string,itemId:string):Promise<void>;
 call():{started:Promise<void>;settled:Promise<unknown>;release():void};
}
/** The caller supplies a real, normally produced/published owner and starts a real preview operation. */
export async function proveAuthoringSync(t:TestContext,o:Options):Promise<void>{
 const owner=o.owner(o.home),raw=o.storage.get(owner.key)!,original=JSON.parse(raw) as {builds:Array<{id:string;revision:number}>};
 const content=owner.project(JSON.parse(raw),o.projectId,o.itemId),key=JSON.stringify([o.projectId,owner.assetKind,o.itemId]);
 const value={format:1,spaceId:o.space.spaceId,project:{id:o.projectId,title:'Actual generated authoring'},content};
 const encoded=o.codec.encode(key,value),decoded=await o.codec.decode(key,encoded.value,async ref=>encoded.blobs.find(b=>b.digest===ref.digest)!.bytes);
 assert.deepEqual(decoded,value);
 // Recover full source/published bytes into a fresh real owner. No execution or installation is used to do it.
 const targetHome=mkdtempSync(join(tmpdir(),'actual-authoring-copy-'));t.after(()=>rmSync(targetHome,{recursive:true,force:true}));ensureStorageSpace(targetHome,o.space);
 const p=await withMolisWorkProjectCatalog({homeDirectory:targetHome},c=>c.ensureSyncedProject({project_id:o.projectId,display_name:'Passive generated copy',actor_id:'alice'},()=>{}));
 const target=new LocalProjectDatabase(p.database_path);t.after(()=>target.close());
 const context={spaceId:o.space.spaceId,projectId:o.projectId,title:p.display_name,authorize(){}};
 const replica=createSqliteReplica(namespacedReplicaDatabase(target.replicationDatabase,'builder'),{...privateValueReplicaOwner(target.db,o.owner(targetHome),context),conflictState:createSyncConflictState});
 replica.receive({key,value:decoded,revision:1,base:0,operationId:'actual-published-copy'});assert.deepEqual(replica.conflicts(),[]);assert.equal(replica.next(),null);
 const privateStorage=new SqlitePluginPrivateStorage(target.db),copied=privateStorage.snapshotInstallationData(owner.namespacePrefix+o.projectId).find(v=>v.item_key===owner.key);assert.ok(copied);
 const restored=JSON.parse(copied.item_value) as {builds:Array<{id:string;revision:number;active:unknown;phase:string;directory?:string;history:Array<{directory?:string}>}>;releases:Array<{buildId:string;version:number;directory:string}>};
 const unit=content as {files:Record<string,Array<{slot:string;files:Array<{path:string;bytes:string}>}>>};
 const build=restored.builds.find(b=>b.id===o.itemId)!;assert.equal(build.active,null);assert.equal(build.phase,'paused');assert.equal(build.revision,1);
 assert.ok(restored.releases.some(r=>r.buildId===o.itemId),'normal publication metadata must exist');
 assert.equal(new SqlitePluginRuntimeRepository(target.db).list().filter(r=>r.plugin_id==='io.molis.work.generated.'+o.itemId).length,0);
 for(const directory of unit.files[o.itemId]!){const slot=directory.slot.replace(/-settled$/,''),base=slot==='current'?build.directory:slot.startsWith('release-')?restored.releases.find(r=>r.buildId===o.itemId&&r.version===Number(slot.slice(8)))?.directory:slot.startsWith('history-')?build.history[Number(slot.slice(8))]?.directory:undefined;
  assert.ok(base,'every source directory must have a target location');const path=directory.slot.endsWith('-settled')?base+'.settled':base;
  for(const file of directory.files)assert.deepEqual(readFileSync(join(path,file.path)),Buffer.from(file.bytes,'base64'));
 }
 await o.verifyTarget(target,targetHome,o.projectId,o.itemId);
 const checked=JSON.parse(privateStorage.snapshotInstallationData(owner.namespacePrefix+o.projectId).find(v=>v.item_key===owner.key)!.item_value) as {builds:Array<{id:string;phase:string;directory:string;checks:{global:{passed:boolean;bundlePath:string}}}>};
 const verified=checked.builds.find(b=>b.id===o.itemId)!;assert.equal(verified.phase,'ready');assert.equal(verified.checks.global.passed,true);const native=relative(realpathSync(targetHome),realpathSync(verified.checks.global.bundlePath));assert.ok(native&&!isAbsolute(native)&&native!=='..'&&!native.startsWith('..'+sep));assert.equal(new SqlitePluginRuntimeRepository(target.db).list().filter(r=>r.plugin_id==='io.molis.work.generated.'+o.itemId).length,0);
 assert.notEqual(verified.directory,build.directory,'explicit continuation must fork the immutable received inputs');
 for(const directory of unit.files[o.itemId]!){const slot=directory.slot.replace(/-settled$/,''),base=slot==='current'?build.directory:slot.startsWith('release-')?restored.releases.find(r=>r.buildId===o.itemId&&r.version===Number(slot.slice(8)))?.directory:build.history[Number(slot.slice(8))]?.directory;assert.ok(base);for(const file of directory.files)assert.deepEqual(readFileSync(join(directory.slot.endsWith('-settled')?base+'.settled':base,file.path)),Buffer.from(file.bytes,'base64'),'local checks must not mutate retained immutable inputs');}
 // Exercise the actual Host's separately opened sync connection while a real preview remains in flight.
 const collection=o.manifest.sync!.collections[0]!,selection={plugin_id:o.manifest.plugin_id,publisher_id:o.manifest.publisher.publisher_id,publisher_signature:o.manifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};
 const previous=process.env.MOLIS_WORK_SYNC_ORIGIN;process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=previous;});
 const uploads:SyncBlobSource[]=[];
 const download=t.mock.method(globalThis,'fetch',fixedSyncDownload({spaceId:o.space.spaceId,revision:1,selections:[selection]},{key,value:encoded.value,attachments:encoded.blobs.map(({digest,size})=>({digest,size})),revision:100,base:0,operationId:'actual-preview-overwrite'},encoded.blobs,uploads));
 const lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'};
 const client=(await createPersonalSync(o.home,o.space,lease,withMolisWorkProjectCatalog,()=>{}))!,call=o.call();
 try{
  let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([call.started,call.settled.then(()=>{throw new Error('real preview settled before the model barrier');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('real preview model never started')),10000);})]);}finally{if(timer)clearTimeout(timer);}
  const namespace=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
  for(let round=0;round<8&&!client.status().collections.find(c=>c.selection.plugin_id===o.manifest.plugin_id)?.conflicts.length;round++)await client.run();
  assert.equal(client.status().collections.find(c=>c.selection.plugin_id===o.manifest.plugin_id)!.conflicts.length,1);
  await assert.rejects(()=>client.resolve(namespace,key,'remote',100),{code:'host.sync_execution_busy'});
  assert.equal(o.storage.get(owner.key),raw,'the actual running preview protects the original authoring document');
  call.release();await call.settled;
  const inspected=client.inspectConflict(namespace,key);assert.ok(inspected);uploads.push(...o.codec.encode(key,inspected.local).blobs);
  await client.resolve(namespace,key,'remote',100);assert.equal(client.status().error,null,'a settled cached runner is not an active operation');
  const adopted=JSON.parse(o.storage.get(owner.key)!) as typeof original;assert.equal(adopted.builds.find(b=>b.id===o.itemId)!.revision,original.builds.find(b=>b.id===o.itemId)!.revision+1);
 }finally{call.release();await call.settled.catch(()=>undefined);client.close();download.mock.restore();}
}
