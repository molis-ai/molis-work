// The Host's own cutover of process items through the real Rust/WASM Worker, ephemeral D1 and R2 (specs/batch-06-shared-tools/sync-cutover.md,
// current-version-adoption.md): an old stream written as the previous Host wrote it, a Files line converted by its owner, a new attachment the
// conversion made, the other Home receiving only the adopted stream. Synthetic Auth only; nothing here reaches a real account or the cloud.
import {createStaticPersonalSync as createPersonalSync} from '../../tests/fixtures/static-personal-sync.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireStorageOwner,ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {LocalProjectDatabase,adoptProjectDatabase,openProjectVersionStores} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createProcessItemReplication} from '@molis-ai/molis-work-module-artifacts';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {FILE_SNAPSHOT_SCHEMA_VERSION,FILE_SNAPSHOT_TYPE} from '@molis-ai/molis-work-contracts/modules/workspace-artifacts';
import {CODING_PLAN_TYPE,codingManifest} from '@molis-ai/molis-work-plugin-coding';
import {cloudFixture,filesEraWriter} from './testing.mjs';

const N=JSON.stringify(['io.molis.work.artifacts','molis','official-artifacts-binding','process_items',1]);
const FILES={plugin_id:'io.molis.work.files',plugin_version:'1.0.0',binding_signature:'official-files-binding'};

test('BSH-14-A/C the Host adopts an old stream: a Files line moves to the materials source with a new attachment, other lines as they were, forged producers refused',{timeout:180000},async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-process-cutover-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(home=>ensureStorageSpace(home,space));
  const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};
  process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(()=>{for(const [key,value] of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  t.mock.method(globalThis,'fetch',cloud.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Old process lines',actor_id:'alice'}));
  const source=new LocalProjectDatabase(project.database_path),stores=openProjectVersionStores(source);
  const big='一份很长的固定快照🙂\n'.repeat(60000),planSchema=codingManifest.process_items.produces.find(type=>type.artifact_type_id===CODING_PLAN_TYPE).schema_version;
  const filesEra=filesEraWriter(project.database_path);
  filesEra.write({project_id:project.project_id,artifact_id:'files-snapshot',version:1,artifact_type_id:FILE_SNAPSHOT_TYPE,schema_version:FILE_SNAPSHOT_SCHEMA_VERSION,
    actor_id:'alice',producer:FILES,content:{kind:'inline',payload:{text:big}}});
  filesEra.close();
  stores.processItems.commands.registerVersion({project_id:project.project_id,artifact_id:'coding-plan',version:1,artifact_type_id:CODING_PLAN_TYPE,schema_version:planSchema,actor_id:'plugin:coding',
    producer:{plugin_id:codingManifest.plugin_id,plugin_version:codingManifest.version,binding_signature:codingManifest.publisher.signature},content:{kind:'inline',payload:{text:'a plan'}}});

  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
  const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));
  t.after(()=>clients.forEach(client=>client.close()));
  const selection=clients[0].status().collections.find(row=>row.selection.collection_id==='process_items').selection;
  await clients[0].save({...clients[0].policy(),selections:[selection]});
  // The previous Host's uploads, exactly as its owner read and its codec encoded them, into the public stream.
  const codec=createSyncJsonContent({spaceId:space.spaceId,authorize(){}});
  const owner=createProcessItemReplication(source.db,{spaceId:space.spaceId,projectId:project.project_id,authorize(){}},{appendEvent:event=>source.appendEvent(event),eventCursor:id=>source.eventCursor(id)});
  const send=(path,body,method=body===undefined?'GET':'POST')=>cloud.transport('https://sync.example.test'+path,{method,headers:{Authorization:'Bearer alice','Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json'},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
  const old={},bundles={};
  for(const id of ['files-snapshot','coding-plan']){
    const key=JSON.stringify([project.project_id,'process_item',id]),encoded=codec.encode(key,{project:{id:project.project_id,title:'Old process lines'},artifact:bundles[id]=owner.read(id)});
    for(const blob of encoded.blobs){
      assert.equal((await send('/v1/blobs/reserve',{namespace:N,digest:blob.digest,size:blob.size})).status,200);
      for(let part=0;part*4194304<blob.size;part++)assert.equal((await send('/v1/blobs/chunk?'+new URLSearchParams({namespace:N,digest:blob.digest,part:String(part)}),blob.bytes.subarray(part*4194304,(part+1)*4194304),'PUT')).status,200);
      assert.equal((await send('/v1/blobs/complete',{namespace:N,digest:blob.digest})).status,200);
    }
    const receipt=await send('/v1/changes',{namespace:N,policyRevision:clients[0].policy().revision,mutation:{operationId:'old-'+id,key,base:0,value:encoded.value},attachments:encoded.blobs.map(({digest,size})=>({digest,size}))});
    assert.equal(receipt.status,200,await receipt.clone().text());old[id]={key,attachments:encoded.blobs.map(blob=>blob.digest)};
  }
  assert.ok(old['files-snapshot'].attachments.length>0,'the long Files body travelled as attachments');

  // The cutover: the owner adopts each live head; the Files body changes producer, so its attachment is new bytes seeded under the seal.
  const cutover=await clients[0].processItems.cutOver();assert.equal(cutover.phase,'complete');
  assert.deepEqual(await clients[0].processItems.cutOver(),cutover,'running it again returns the same completed cutover');
  const stream=JSON.stringify(['process_items_adopted',cutover.cutoverId]);
  const seeded=(await cloud.db.prepare('SELECT key,attachments FROM sync_events WHERE namespace=? ORDER BY key').bind(stream).all()).results;
  assert.deepEqual(seeded.map(row=>row.key),[old['coding-plan'].key,old['files-snapshot'].key].sort());
  const files=JSON.parse(seeded.find(row=>row.key===old['files-snapshot'].key).attachments).map(ref=>ref.digest);
  const fresh=files.filter(digest=>!old['files-snapshot'].attachments.includes(digest));
  assert.ok(fresh.length>0,'the converted body is new bytes');
  for(const digest of fresh)assert.ok((await cloud.db.prepare('SELECT ready FROM sync_blobs WHERE digest=?').bind(digest).first()).ready,'and it was uploaded through the seed entry');
  assert.equal((await cloud.db.prepare('SELECT reserved_bytes AS r FROM sync_cutovers').first()).r,0,'the reservation is settled');

  // Home A adopts its own library before taking the stream over, so what it receives matches what it holds; Home B only takes over.
  // As in the maintenance window, the library is adopted while nothing else holds this Home, then the Host opens it again.
  await clients[0].close();source.close();
  const lease0=acquireStorageOwner(join(homes[0],'agent-runtime'));
  try{assert.equal(adoptProjectDatabase({home:homes[0],owner:lease0,projectId:project.project_id,backupDirectory:join(root,'backup')}).state,'adopted');}finally{lease0.release();}
  clients[0]=await createPersonalSync(homes[0],space,lease,withMolisWorkProjectCatalog,check);
  for(const client of clients)await client.processItems.adopt(cutover.cutoverId);
  await clients[1].run();await clients[0].run();clients.forEach(client=>assert.equal(client.status().error,null,client.status().error));
  const received=await clients[1].withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects().find(row=>row.project_id===project.project_id));
  const target=new LocalProjectDatabase(received.database_path);t.after(()=>target.close());
  const identity=id=>target.db.prepare('SELECT producer_plugin_id AS plugin,producer_binding_signature AS signature FROM process_items WHERE artifact_id=?').get(id);
  const versions=id=>target.db.prepare('SELECT producer_plugin_version AS plugin FROM process_item_versions WHERE artifact_id=?').all(id).map(row=>row.plugin);
  assert.deepEqual({...identity('files-snapshot')},{plugin:'system.materials',signature:'molis-work:system.materials'});
  assert.deepEqual(versions('files-snapshot'),[FILES.plugin_version],'the version keeps the producing version it recorded');
  assert.deepEqual({...identity('coding-plan')},{plugin:codingManifest.plugin_id,signature:codingManifest.publisher.signature});
  assert.deepEqual(openProjectVersionStores(target).processItems.query.getArtifactVersion(project.project_id,{artifact_id:'files-snapshot',version:1}).payload,{text:big});
  const count=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;
  await clients[0].run();await clients[1].run();
  assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,count,'receiving the adopted lines has no upload echo');

  // A client that skips the Host's conversion can still write the adopted stream with its own token. The receiving Host refuses a Files
  // line and a line that claims the materials source before its owner stores anything (sync-cutover.md step 4).
  const plan=bundles['coding-plan'],system={plugin:'system.materials',signature:'molis-work:system.materials'};
  const forge=(id,producer,signature)=>({...plan,identity:{...plan.identity,artifact_id:id,producer_plugin_id:producer,producer_binding_signature:signature},
    versions:plan.versions.map(version=>({...version,artifact_id:id,producer_plugin_id:producer,producer_binding_signature:signature}))});
  const policy=clients[1].policy().revision;
  for(const [name,artifact] of [['forged-files',forge('forged-files',FILES.plugin_id,FILES.binding_signature)],['forged-system',forge('forged-system',system.plugin,system.signature)]]){
    const key=JSON.stringify([project.project_id,'process_item',name]),encoded=codec.encode(key,{project:{id:project.project_id,title:'Old process lines'},artifact});
    assert.equal(encoded.blobs.length,0);
    const response=await cloud.transport('https://sync.example.test/v1/changes',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json','X-Molis-Process-Items-Cutover':cutover.cutoverId},
      body:JSON.stringify({namespace:N,policyRevision:policy,mutation:{operationId:'forged-'+name,key,base:0,value:encoded.value},attachments:[]})});
    assert.equal(response.status,200,await response.clone().text());
  }
  assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE namespace=?').bind(stream).first()).n,4,'the forged lines reached the adopted stream');
  await clients[1].run();
  assert.match(String(clients[1].status().error),/需要处理/,'each forged line is held as a failure, not received');
  for(const name of ['forged-files','forged-system'])assert.equal(identity(name),undefined,name+' was not stored');
});
