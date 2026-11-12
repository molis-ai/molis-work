// The person's process-item steps in sync settings (specs/batch-06-shared-tools/sync-cutover.md steps 1–5, user 2026-11-12 layout), through
// the real Rust/WASM Worker, ephemeral D1 and R2: one device cuts over, a dirty old device is refused until it keeps its unsent lines,
// adopts with them (each library held closed while it moves), joins the adopted stream, takes Files' consents back and takes the kept
// lines over. Synthetic Auth only; nothing here reaches a real account or the cloud.
import {createStaticPersonalSync as createPersonalSync} from '../../tests/fixtures/static-personal-sync.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireStorageOwner,ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {HomeConsentLedger,LocalProjectDatabase,createPersonalSync as createHostSync,createWebCatalogAccess,openProjectVersionStores,processItemsMaintenance} from '@molis-ai/molis-work-app-local-host';
import {openMolisWorkProjectCatalog,withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createProcessItemReplication} from '@molis-ai/molis-work-module-artifacts';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {FILE_SNAPSHOT_SCHEMA_VERSION,FILE_SNAPSHOT_TYPE} from '@molis-ai/molis-work-contracts/modules/workspace-artifacts';
import {cloudFixture} from './testing.mjs';

const N=JSON.stringify(['io.molis.work.artifacts','molis','official-artifacts-binding','process_items',1]);
const FILES={plugin_id:'io.molis.work.files',plugin_version:'1.0.0',binding_signature:'official-files-binding'};

/** What the old build's triggers left: the same writes recorded in the original journal, and no adopted journal at all. */
function toOriginalLayout(path){
  const db=new DatabaseSync(path);
  try{
    db.exec('INSERT INTO process_items_replica_changes(key) SELECT key FROM process_items_adopted_replica_changes ORDER BY seq');
    for(const {name,sql} of db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'process_items_sync_%'").all()){db.exec(`DROP TRIGGER ${name}`);db.exec(sql.replaceAll('process_items_adopted_replica_','process_items_replica_'));}
    for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'process_items_adopted_replica_%'").all())db.exec(`DROP TABLE ${name}`);
  }finally{db.close();}
}

test('BSH-14-D/F the sync settings steps: cut over, refused until kept, kept, adopted with each library held, joined, Files consents taken back, kept lines taken over',{timeout:180000},async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-process-steps-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(home=>ensureStorageSpace(home,space));
  const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};
  process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(()=>{for(const [key,value] of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  t.mock.method(globalThis,'fetch',cloud.transport);
  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};

  const clientB=await createPersonalSync(homes[1],space,lease,withMolisWorkProjectCatalog,check);
  const clients=[clientB];t.after(()=>clients.forEach(client=>client.close()));
  const selection=clientB.status().collections.find(row=>row.selection.collection_id==='process_items').selection;
  await clientB.save({...clientB.policy(),selections:[selection]});
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Old device',actor_id:'alice'}));
  const quiet=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Quiet',actor_id:'alice'}));
  const key=id=>JSON.stringify([project.project_id,'process_item',id]);
  const codec=createSyncJsonContent({spaceId:space.spaceId,authorize(){}});
  {
    const source=new LocalProjectDatabase(project.database_path),stores=openProjectVersionStores(source);
    const owner=createProcessItemReplication(source.db,{spaceId:space.spaceId,projectId:project.project_id,authorize(){}},{appendEvent:event=>source.appendEvent(event),eventCursor:id=>source.eventCursor(id)});
    const snapshot=(id,version,text)=>stores.processItems.commands.registerVersion({project_id:project.project_id,artifact_id:id,version,artifact_type_id:FILE_SNAPSHOT_TYPE,
      schema_version:FILE_SNAPSHOT_SCHEMA_VERSION,actor_id:'alice',producer:FILES,content:{kind:'inline',payload:{text}}});
    snapshot('files-shared',1,'first fix');
    const encoded=codec.encode(key('files-shared'),{project:{id:project.project_id,title:'Old device'},artifact:owner.read('files-shared')});
    const receipt=await cloud.transport('https://sync.example.test/v1/changes',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},
      body:JSON.stringify({namespace:N,policyRevision:clientB.policy().revision,mutation:{operationId:'old-shared',key:key('files-shared'),base:0,value:encoded.value},attachments:[]})});
    assert.equal(receipt.status,200,await receipt.clone().text());
    // After its last upload the device fixed a new snapshot and never sent it.
    snapshot('files-local',1,'only here');
    source.close();
  }
  toOriginalLayout(project.database_path);
  // The old device kept the receipt of each upload as its head: it took part in the old stream, so its unsent lines need keeping.
  {const db=new DatabaseSync(project.database_path);try{for(const id of ['files-shared'])db.prepare('INSERT INTO process_items_replica_heads(key,revision) VALUES (?,1)').run(key(id));}finally{db.close();}}
  // Files' own agreement in the Home ledger, from before the retirement.
  const ledger=new HomeConsentLedger(homes[0]);
  const [files]=ledger.record({plugin_id:FILES.plugin_id,publisher_signature:FILES.binding_signature,manifest_digest:'sha256:old',granted_by:'user',grants:[{kind:'default_group',subject:'files-group'}],at:'2026-11-01T00:00:00Z'});

  // As in the running Host: the Host holds the Home's storage owner, and its catalog and the steps use that same owner.
  const ownerA=acquireStorageOwner(join(homes[0],'agent-runtime'));
  const access=createWebCatalogAccess(homes[0],options=>openMolisWorkProjectCatalog({...options,storageOwner:ownerA}));
  const clientA=await createHostSync(homes[0],space,lease,access.withCatalog,check,undefined,undefined,access.read);
  t.after(async()=>{clientA.close();await access.close();ownerA.release();});
  const held=[],names=async()=>new Map(await access.withCatalog({homeDirectory:homes[0]},catalog=>catalog.listProjects().map(row=>[row.project_id,row.display_name])));
  const stepsA=processItemsMaintenance(clientA,{home:homes[0],owner:()=>ownerA,holdProject:async(projectId,work)=>{held.push(projectId);return work();},names,now:()=>'2026-11-12T00:00:00Z'});
  const stepsB=processItemsMaintenance(clientB,{home:homes[1],owner:()=>{throw new Error('B adopts nothing');},holdProject:async()=>{throw new Error('B holds nothing');},names:async()=>new Map()});

  // ① Before the cutover nothing local can start.
  let status=await stepsA.status();
  assert.equal(status.cutover.phase,'open');
  const old=status.projects.find(row=>row.project_id===project.project_id);
  assert.deepEqual([old.name,old.layout,old.unsettled.length>0,old.refused],['Old device','original',true,[]],'the old library needs only its unsent lines kept');
  assert.deepEqual(status.projects.find(row=>row.project_id===quiet.project_id),{project_id:quiet.project_id,name:'Quiet',layout:'current',pending:0,unsettled:[],refused:[]});
  await assert.rejects(stepsA.capture(),/请先完成第一步/u);
  await assert.rejects(stepsA.adopt(),/请先完成第一步/u);
  const cutover=await stepsB.cutOver();assert.equal(cutover.phase,'complete');

  // ③ before ②: the unsettled library is refused, nothing joins the stream, and Files keeps its consent.
  const refused=await stepsA.adopt();
  assert.equal(refused.adopted,false);
  assert.deepEqual(refused.projects.map(row=>[row.project_id,row.state]),[[project.project_id,'refused']],'only the library with something to move is touched');
  assert.equal((await stepsA.status()).adopted,false);
  assert.equal(ledger.consent(files.consent_id).revoked_at,null);

  // ② keeps the unsent lines; the page sees which.
  const kept=await stepsA.capture();
  assert.deepEqual(kept.projects,[project.project_id]);
  status=await stepsA.status();
  assert.equal(status.capture.captureId,kept.captureId);
  assert.deepEqual(status.capture.items.map(row=>[row.name,row.artifact_id,row.versions]).sort(),[['Old device','files-local',1],['Old device','files-shared',1]]);

  // ③ again: adopted with the kept file, each moved library held, the stream joined, Files' consent taken back.
  held.length=0;
  const adopted=await stepsA.adopt();
  assert.equal(adopted.adopted,true);
  assert.deepEqual(adopted.projects.map(row=>[row.project_id,row.state]),[[project.project_id,'adopted']]);
  assert.deepEqual(held,[project.project_id],'the quiet project is not closed for nothing');
  status=await stepsA.status();
  assert.equal(status.adopted,true);
  assert.deepEqual(status.projects.find(row=>row.project_id===project.project_id),{project_id:project.project_id,name:'Old device',layout:'current',pending:0,unsettled:[],refused:[]});
  assert.equal(ledger.consent(files.consent_id).revoked_at,'2026-11-12T00:00:00Z');

  // ④ after the stream is read up to its completion head: the shared snapshot is the same, the local one is a new write.
  await clientB.processItems.adopt(cutover.cutoverId);
  await clientB.run();await clientA.run();
  const outcomes=Object.fromEntries((await stepsA.takeOver()).map(row=>[row.key,row.outcome]));
  assert.deepEqual(outcomes,{[key('files-local')]:'queued',[key('files-shared')]:'same'});
  await clientA.run();await clientB.run();
  const received=await clientB.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects().find(row=>row.project_id===project.project_id));
  const target=new LocalProjectDatabase(received.database_path);t.after(()=>target.close());
  assert.deepEqual(openProjectVersionStores(target).processItems.query.getArtifactVersion(project.project_id,{artifact_id:'files-local',version:1}).payload,{text:'only here'});
  for(const client of [...clients,clientA])assert.equal(client.status().error,null,client.status().error);
});
