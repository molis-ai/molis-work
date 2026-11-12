// BSH-14-D through the real Rust/WASM Worker, ephemeral D1 and R2 (specs/batch-06-shared-tools/sync-cutover.md steps 2–5): a device whose old
// journal still holds lines the old stream never had keeps them in a recovery file, adopts its library with that file, takes over the adopted
// stream, and the person's takeover moves each kept line its own way. Synthetic Auth only; nothing here reaches a real account or the cloud.
import {createStaticPersonalSync as createPersonalSync} from '../../tests/fixtures/static-personal-sync.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireStorageOwner,ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {LocalProjectDatabase,adoptProjectDatabase,captureProcessItemsRecovery,openProjectVersionStores} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createProcessItemReplication} from '@molis-ai/molis-work-module-artifacts';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {FILE_SNAPSHOT_SCHEMA_VERSION,FILE_SNAPSHOT_TYPE} from '@molis-ai/molis-work-contracts/modules/workspace-artifacts';
import {CODING_PLAN_TYPE,codingManifest} from '@molis-ai/molis-work-plugin-coding';
import {cloudFixture} from './testing.mjs';

const N=JSON.stringify(['io.molis.work.artifacts','molis','official-artifacts-binding','process_items',1]);
const FILES={plugin_id:'io.molis.work.files',plugin_version:'1.0.0',binding_signature:'official-files-binding'};
const SYSTEM={plugin:'system.materials',signature:'molis-work:system.materials'};

/** What the old build's triggers left: the same writes recorded in the original journal, and no adopted journal at all. */
function toOriginalLayout(path){
  const db=new DatabaseSync(path);
  try{
    db.exec('INSERT INTO process_items_replica_changes(key) SELECT key FROM process_items_adopted_replica_changes ORDER BY seq');
    for(const {name,sql} of db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'process_items_sync_%'").all()){db.exec(`DROP TRIGGER ${name}`);db.exec(sql.replaceAll('process_items_adopted_replica_','process_items_replica_'));}
    for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'process_items_adopted_replica_%'").all())db.exec(`DROP TABLE ${name}`);
  }finally{db.close();}
}

test('BSH-14-D a dirty device keeps its unsent lines, adopts with them and takes each over: same, conflict or a new write on the adopted stream',{timeout:180000},async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-process-takeover-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(home=>ensureStorageSpace(home,space));
  const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};
  process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(()=>{for(const [key,value] of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  t.mock.method(globalThis,'fetch',cloud.transport);
  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};

  // Device B starts the account's process-item sync; device A is the old device that wrote lines the old stream only partly has.
  const clientB=await createPersonalSync(homes[1],space,lease,withMolisWorkProjectCatalog,check);
  const clients=[clientB];t.after(()=>clients.forEach(client=>client.close()));
  const selection=clientB.status().collections.find(row=>row.selection.collection_id==='process_items').selection;
  await clientB.save({...clientB.policy(),selections:[selection]});
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Old device',actor_id:'alice'}));
  const key=id=>JSON.stringify([project.project_id,'process_item',id]);
  const codec=createSyncJsonContent({spaceId:space.spaceId,authorize(){}});
  const send=(path,body,method='POST')=>cloud.transport('https://sync.example.test'+path,{method,headers:{Authorization:'Bearer alice','Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json'},body:body instanceof Uint8Array?body:JSON.stringify(body)});
  const planSchema=codingManifest.process_items.produces.find(type=>type.artifact_type_id===CODING_PLAN_TYPE).schema_version;
  {
    const source=new LocalProjectDatabase(project.database_path),stores=openProjectVersionStores(source);
    const owner=createProcessItemReplication(source.db,{spaceId:space.spaceId,projectId:project.project_id,authorize(){}},{appendEvent:event=>source.appendEvent(event),eventCursor:id=>source.eventCursor(id)});
    const snapshot=(id,version,text)=>stores.processItems.commands.registerVersion({project_id:project.project_id,artifact_id:id,version,artifact_type_id:FILE_SNAPSHOT_TYPE,
      schema_version:FILE_SNAPSHOT_SCHEMA_VERSION,actor_id:'alice',producer:FILES,content:{kind:'inline',payload:{text}}});
    const upload=async id=>{
      const encoded=codec.encode(key(id),{project:{id:project.project_id,title:'Old device'},artifact:owner.read(id)});assert.equal(encoded.blobs.length,0);
      const receipt=await send('/v1/changes',{namespace:N,policyRevision:clientB.policy().revision,mutation:{operationId:'old-'+id,key:key(id),base:0,value:encoded.value},attachments:[]});
      assert.equal(receipt.status,200,await receipt.clone().text());
    };
    stores.processItems.commands.registerVersion({project_id:project.project_id,artifact_id:'coding-plan',version:1,artifact_type_id:CODING_PLAN_TYPE,schema_version:planSchema,actor_id:'plugin:coding',
      producer:{plugin_id:codingManifest.plugin_id,plugin_version:codingManifest.version,binding_signature:codingManifest.publisher.signature},content:{kind:'inline',payload:{text:'a plan'}}});
    snapshot('files-shared',1,'first fix');
    await upload('coding-plan');await upload('files-shared');
    // After its last upload the device fixed the shared snapshot again and fixed a new one, and never sent either.
    snapshot('files-shared',2,'second fix');snapshot('files-local',1,'only here');
    source.close();
  }
  toOriginalLayout(project.database_path);

  // Device B runs the cutover; it holds nothing locally, so it only reads the old stream.
  const cutover=await clientB.processItems.cutOver();assert.equal(cutover.phase,'complete');

  // Device A in its maintenance window: an unsettled library is refused alone, kept in a recovery file, then adopted with it.
  const ownerA=acquireStorageOwner(join(homes[0],'agent-runtime'));
  let capture;
  try{
    const input={home:homes[0],owner:ownerA,projectId:project.project_id,backupDirectory:join(root,'backup')};
    assert.equal(adoptProjectDatabase(input).state,'refused','unsent lines are not adopted without a recovery file');
    capture=captureProcessItemsRecovery({home:homes[0],owner:ownerA,cutoverId:cutover.cutoverId});
    assert.deepEqual(capture.projects,[project.project_id]);
    assert.equal(adoptProjectDatabase({...input,recovery:capture.captureId}).state,'adopted');
  }finally{ownerA.release();}

  const clientA=await createPersonalSync(homes[0],space,lease,withMolisWorkProjectCatalog,check);clients.push(clientA);
  await assert.rejects(clientA.processItems.takeOver(capture.captureId),/采用|接管/u,'nothing is taken over before this device adopts the stream');
  for(const client of clients)await client.processItems.adopt(cutover.cutoverId);
  await clientB.run();await clientA.run();
  const outcomes=Object.fromEntries((await clientA.processItems.takeOver(capture.captureId)).map(row=>[row.key,row.outcome]));
  assert.deepEqual(outcomes,{[key('coding-plan')]:'same',[key('files-local')]:'queued',[key('files-shared')]:'conflict'},
    'the stream already has the plan; it never had the local snapshot; it has an older shared snapshot than this device');
  const events=async()=>(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE namespace=?').bind(JSON.stringify(['process_items_adopted',cutover.cutoverId])).first()).n;
  const seeded=await events();
  await clientA.run();
  assert.equal(await events(),seeded+1,'the local snapshot is one new write on the adopted stream');
  await assert.rejects(clientA.processItems.takeOver(capture.captureId,[key('not-kept')]),/只能接管恢复件里保全的过程项/u);

  // The shared snapshot's conflict is the person's: keeping this device's version writes it over the stream's head.
  await clientA.resolve(N,key('files-shared'),'local');
  await clientB.run();
  const received=await clientB.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects().find(row=>row.project_id===project.project_id));
  const target=new LocalProjectDatabase(received.database_path);t.after(()=>target.close());
  const identity=id=>({...target.db.prepare('SELECT producer_plugin_id AS plugin,producer_binding_signature AS signature FROM process_items WHERE artifact_id=?').get(id)});
  const versions=id=>target.db.prepare('SELECT version FROM process_item_versions WHERE artifact_id=? ORDER BY version').all(id).map(row=>row.version);
  assert.deepEqual(identity('files-local'),SYSTEM,'a line taken over arrives under the materials source');
  assert.deepEqual(versions('files-local'),[1]);
  assert.deepEqual(identity('files-shared'),SYSTEM);
  assert.deepEqual(versions('files-shared'),[1,2],'the kept version reaches the other device');
  assert.deepEqual(openProjectVersionStores(target).processItems.query.getArtifactVersion(project.project_id,{artifact_id:'files-shared',version:2}).payload,{text:'second fix'});
  for(const client of clients)assert.equal(client.status().error,null,client.status().error);
});
