import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {personalStorageSpace,ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {pagesManifest} from '@molis-ai/molis-work-plugin-pages';
import {openPagesStore,openFormStore,openDatasetStore,openPptStore,openLingguangStore} from '../../tests/fixtures/plugin-sync-stores.ts';
import {runtimePersonalSync,prepareSyncTestHome} from '../../tests/fixtures/runtime-personal-sync.ts';
import {openTestSqlite} from '@molis-ai/molis-work-test-kit/sqlite';
import {ArtifactsModule,createArtifactsSchema,createArtifactReplication} from '@molis-ai/molis-work-module-artifacts';
import {formManifest} from '@molis-ai/molis-work-plugin-form';
import {datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {GoalProjectApplication,boardSnapshot} from '../../tests/fixtures/goal-application.ts';
import {applySql} from './testing.mjs';
import {goalSyncSelection} from '../../tests/fixtures/runtime-goal-sync.ts';

test('real Rust WASM + isolated D1: two-device sync, authentication, CAS and isolation',{timeout:120000},async t=>{
  const {Miniflare,Response:RuntimeResponse,convertV4MiniflareOptions}=await import(process.env.MOLIS_SYNC_MINIFLARE_MODULE||'miniflare');
  const root=mkdtempSync(join(tmpdir(),'molis-rust-sync-'));
  const mf=new Miniflare(convertV4MiniflareOptions({modulesRoot:fileURLToPath(new URL('./dist/',import.meta.url)),modules:[{type:'ESModule',path:fileURLToPath(new URL('./dist/index.js',import.meta.url))},{type:'CompiledWasm',path:fileURLToPath(new URL('./dist/index_bg.wasm',import.meta.url))}],compatibilityDate:'2026-09-19',d1Persist:false,r2Persist:false,r2Buckets:{FILES:"isolated-blobs"},d1Databases:{DB:'rust-isolated-test'},bindings:{DEPLOYMENT_MODE:'local',AUTH_ORIGIN:'http://127.0.0.1:8787',APPLICATION_ID:'work'},outboundService:async request=>{
    assert.equal(new URL(request.url).origin,'http://127.0.0.1:8787');
    const token=request.headers.get('Authorization')?.replace('Bearer ','');
    if(!['alice','bob','wrong-app'].includes(token))return RuntimeResponse.json({error:'UNAUTHORIZED'},{status:401});
    return RuntimeResponse.json({data:{userId:token,applicationId:token==='wrong-app'?'other':'work'}});
  }}));
  const clients=[],runtimes=[];
  const previousLocal=process.env.MOLIS_WORK_SYNC_LOCAL,previousOrigin=process.env.MOLIS_WORK_SYNC_ORIGIN;
  process.env.MOLIS_WORK_SYNC_LOCAL='1';delete process.env.MOLIS_WORK_SYNC_ORIGIN;
  t.after(()=>{if(previousLocal===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previousLocal;if(previousOrigin===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=previousOrigin;});
  t.mock.method(globalThis,'fetch',(url,init)=>mf.dispatchFetch('http://local'+new URL(url).pathname+new URL(url).search,init));
  try{
    const db=await mf.getD1Database('DB');
    // The Worker serves only v6 plus the same-version cutover structure, so the fixture loads both files like a fresh database.
    for(const file of ['0001_sync.sql','0002_process_items_cutover.sql'])await applySql(db,file);
    const call=(path,token,body,method=body===undefined?'GET':'POST')=>mf.dispatchFetch('http://local'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    assert.equal((await call('/v1/policy','invalid')).status,401);
    assert.equal((await call('/v1/policy','wrong-app')).status,403);
    const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');
    const selection={plugin_id:pagesManifest.plugin_id,publisher_id:pagesManifest.publisher.publisher_id,publisher_signature:pagesManifest.publisher.signature,collection_id:'documents',schema_version:pagesManifest.sync.collections[0].schema_version};
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:0,selections:[],unexpected:true},'PUT')).status,400);
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:0,selections:[selection,{...selection,schema_version:selection.schema_version+1}]},'PUT')).status,400);
    const homes=[join(root,'a'),join(root,'b')];homes.forEach(h=>{ensureStorageSpace(h,space);prepareSyncTestHome(h);});
    const withStore=(i,run)=>{const s=openPagesStore(homes[i]);try{return run(s);}finally{s.close();}};
    let revoked=false;
    const check=()=>{if(revoked)throw new Error('REVOKED');};
    const authority={assertCurrent:check,signal:new AbortController().signal,accessToken:async()=>'alice'};
    const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{
      const p=await c.createProject({display_name:'Synthetic transport',actor_id:'alice'});
      for(const plugin_id of ['pages','form','dataset','ppt','lingguang'])c.addProjectPlugin({project_id:p.project_id,plugin_id,actor_id:'alice'});return p;
    });
    await withMolisWorkProjectCatalog({homeDirectory:homes[1]},async c=>{
      await c.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});
      for(const plugin_id of ['pages','form','dataset','ppt','lingguang'])c.addProjectPlugin({project_id:project.project_id,plugin_id,actor_id:'alice'});
    });
    for(const home of homes){const runtime=await runtimePersonalSync(home,space,check,{accessToken:async()=>'alice'});runtimes.push(runtime);clients.push(runtime.sync);}
    await clients[0].run();await clients[1].run();
    await clients[0].save({spaceId:space.spaceId,revision:0,selections:[selection]});await clients[0].run();
    const page=withStore(0,s=>s.create({project_id:project.project_id,title:'From A'}));
    await clients[0].run();assert.equal(clients[0].status().error,null);
    await clients[1].run();assert.equal(clients[1].status().error,null);
    assert.equal(withStore(1,s=>s.get(page.id).title),'From A');
    withStore(1,s=>s.update(page.id,{title:'From B'}));await clients[1].run();await clients[0].run();
    assert.equal(withStore(0,s=>s.get(page.id).title),'From B');
    const namespace=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
    const forged={spaceId:space.spaceId,revision:0,selections:[selection]};
    assert.equal((await call('/v1/policy','bob',forged,'PUT')).status,403);
    assert.equal((await call('/v1/changes?namespace='+encodeURIComponent(namespace)+'&after=0','bob')).status,403);
    const mutation={operationId:'stale',key:JSON.stringify([null,JSON.stringify([project.project_id,'document',page.id])]),base:0,value:null};
    assert.equal((await call('/v1/changes','alice',{namespace,policyRevision:1,mutation,attachments:[]})).status,409);
    withStore(0,s=>s.delete(page.id));await clients[0].run();await clients[1].run();
    assert.equal(withStore(1,s=>s.list(project.project_id).length),0);
    // Actual artifact owner -> WASM/D1 opaque transport -> another owner, not a JSON-only mock.
    const artifactSelection={plugin_id:'io.molis.work.artifacts',publisher_id:'molis',publisher_signature:'official-artifacts-binding',collection_id:'versions',schema_version:1};
    const artifactNamespace=JSON.stringify([artifactSelection.plugin_id,artifactSelection.publisher_id,artifactSelection.publisher_signature,artifactSelection.collection_id,1]);
    const nextPolicy=await call('/v1/policy','alice',{spaceId:space.spaceId,revision:1,selections:[selection,artifactSelection]},'PUT');assert.equal(nextPolicy.status,200);
    const databases=[openTestSqlite(':memory:'),openTestSqlite(':memory:')];
    try{
      const replicas=databases.map((d,index)=>{
        d.pragma('foreign_keys=ON');d.exec('CREATE TABLE project_root(project_id TEXT PRIMARY KEY);CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT);');
        const board='project-artifact';d.prepare('INSERT INTO project_root VALUES (?)').run(board);createArtifactsSchema(d);
        const options={now:()=> '2026-09-30T00:00:00.000Z',appendEvent:()=>Number(d.prepare('INSERT INTO events(project_id) VALUES (?)').run(board).lastInsertRowid)};
        const owner=new ArtifactsModule({db:d,...options});
        const replica=createArtifactReplication(d,{spaceId:space.spaceId,projectId:board,authorize:check},options);
        return {owner,replica,board};
      });
      for(const version of [1,2])replicas[0].owner.commands.registerVersion({project_id:replicas[0].board,artifact_id:'artifact-rust',version,actor_id:'alice',artifact_type_id:'io.example.result',schema_version:1,origin:{kind:'imported',file_name:'result.json'},title:'完整成果',media_type:'application/json',producer:{plugin_id:'io.example.writer',plugin_version:'1.0.0',binding_signature:'synthetic-writer'},content:{kind:'inline',payload:{title:'完整成果',version,text:'Body preserved through D1'}}});
      const snapshot=replicas[0].replica.read('artifact-rust');
      const value={project:{id:'project-artifact',title:'Synthetic'},artifact:snapshot};
      const upload=await call('/v1/changes','alice',{namespace:artifactNamespace,policyRevision:2,mutation:{operationId:'artifact-op-1',key:JSON.stringify(['project-artifact','artifact','artifact-rust']),base:0,value},attachments:[]});assert.equal(upload.status,200);
      const response=await call('/v1/changes?namespace='+encodeURIComponent(artifactNamespace)+'&after=0','alice');assert.equal(response.status,200);
      const downloaded=await response.json();assert.equal(downloaded.events.length,1);replicas[1].replica.apply(downloaded.events[0].value.artifact);
      assert.deepEqual(replicas[1].replica.read('artifact-rust'),snapshot);
      assert.equal((await call('/v1/changes?namespace='+encodeURIComponent(artifactNamespace)+'&after=0','bob')).status,403);
    }finally{databases.forEach(d=>d.close());}
    const creative=[[openFormStore,formManifest],[openDatasetStore,datasetManifest],[openPptStore,pptManifest],[openLingguangStore,lingguangManifest]];
    const selections=creative.map(([,m])=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:m.sync.collections[0].id,schema_version:m.sync.collections[0].schema_version}));
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:2,selections:[selection,...selections]},'PUT')).status,200);
    for(const [index,[open,manifest]] of creative.entries()){
      const a=open(homes[0]),b=open(homes[1]);
      try{
        const record=a.create({project_id:project.project_id,title:manifest.name+' through Rust/D1'});
        await clients[0].run();await clients[1].run();
        assert.equal(b.get(record.id,project.project_id).title,record.title);
        const selection=selections[index],ns=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
        for(const client of clients){assert.equal(client.status().error,null);const collection=client.status().collections.find(c=>c.selection.plugin_id===selection.plugin_id);assert.equal(collection.pending,0);assert.deepEqual(collection.conflicts,[]);}
        assert.equal((await call('/v1/changes?namespace='+encodeURIComponent(ns)+'&after=0','bob')).status,403);
      }finally{a.close();b.close();}
    }
    const before=(await db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before,'Runtime receipts prevent feedback uploads');
    await verifyGoalsTransport({homes,space,check,authority,mf,clients,runtimes});
    revoked=true;assert.throws(()=>clients[0].status(),/REVOKED/);
  }finally{for(const runtime of runtimes)await runtime.close();await mf.dispose();rmSync(root,{recursive:true,force:true});}
});

// GSYNC-01/04: real Host project creation and Goal facts through Rust/WASM and D1.
async function verifyGoalsTransport({homes,check,clients,runtimes}) {
  const project=await runtimes[0].withCatalog({homeDirectory:homes[0]},c=>c.createProject({display_name:'Goals through D1',actor_id:'alice'}));
  const selection=goalSyncSelection,sync=clients;
  await runtimes[1].withCatalog({homeDirectory:homes[1]},catalog=>catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},check));
  for(const runtime of runtimes)await runtime.openProjects();
  const store=new LocalProjectDatabase(project.database_path);
  try {
    const app=new GoalProjectApplication(store),base={project_id:project.project_id,actor_id:'runtime',actor_kind:'runtime'};
    for(const id of ['parent','child'])app.goalEvents.createIntent({...base,goal_id:id,title:id,idempotency_key:id});
    app.goals.commands.addRelation(project.project_id,{from_goal_id:'child',to_goal_id:'parent',type:'part_of',reason:'关系同步'},{actor_id:'alice',idempotency_key:'link'});
  }finally{store.close();}
  await sync[0].run();
  await sync[0].save({...sync[0].policy(),selections:[selection]});
  await sync[0].run();await sync[1].run();
  for(const client of sync)assert.equal(client.status().error,null);
  const destination=await runtimes[1].withCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(p=>p.project_id===project.project_id));
  assert.ok(destination);
  const restored=new LocalProjectDatabase(destination.database_path);
  try {
    const snapshot=boardSnapshot(restored,project.project_id);
    assert.deepEqual(snapshot.goals.map(g=>g.goal_id).sort(),['child','parent']);
    assert.equal(snapshot.relations[0].from_goal_id,'child');assert.equal(snapshot.relations[0].to_goal_id,'parent');
    assert.equal(new GoalProjectApplication(restored).goalQueries.getGoal(project.project_id,'parent')?.goal_id,'parent');
  }finally{restored.close();}
  await sync[0].run();await sync[1].run();
  for(const client of sync){assert.equal(client.status().error,null);assert.equal(client.status().collections.find(row=>row.selection.plugin_id===selection.plugin_id&&row.selection.collection_id===selection.collection_id).pending,0);}
}
