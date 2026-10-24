import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {personalStorageSpace,ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {openPagesStore} from '@molis-ai/molis-work-plugin-pages';
import {PersonalSync} from '@molis-ai/molis-work-module-sync-replication';
import Database from 'better-sqlite3';
import {ArtifactsModule,createArtifactsSchema,createArtifactReplication} from '@molis-ai/molis-work-module-artifacts';
import {openFormStore,formManifest} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore,datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore,pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore,lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase,GoalProjectApplication,createPersonalGoalRegistration} from '@molis-ai/molis-work-app-local-host';

test('real Rust WASM + isolated D1: two-device sync, authentication, CAS and isolation',{timeout:120000},async()=>{
  const {Miniflare,Response:RuntimeResponse,convertV4MiniflareOptions}=await import(process.env.MOLIS_SYNC_MINIFLARE_MODULE||'miniflare');
  const root=mkdtempSync(join(tmpdir(),'molis-rust-sync-'));
  const mf=new Miniflare(convertV4MiniflareOptions({modulesRoot:fileURLToPath(new URL('./dist/',import.meta.url)),modules:[{type:'ESModule',path:fileURLToPath(new URL('./dist/index.js',import.meta.url))},{type:'CompiledWasm',path:fileURLToPath(new URL('./dist/index_bg.wasm',import.meta.url))}],compatibilityDate:'2026-09-19',d1Persist:false,r2Persist:false,r2Buckets:{FILES:"isolated-blobs"},d1Databases:{DB:'rust-isolated-test'},bindings:{DEPLOYMENT_MODE:'local',AUTH_ORIGIN:'http://127.0.0.1:8787',APPLICATION_ID:'work'},outboundService:async request=>{
    assert.equal(new URL(request.url).origin,'http://127.0.0.1:8787');
    const token=request.headers.get('Authorization')?.replace('Bearer ','');
    if(!['alice','bob','wrong-app'].includes(token))return RuntimeResponse.json({error:'UNAUTHORIZED'},{status:401});
    return RuntimeResponse.json({data:{userId:token,applicationId:token==='wrong-app'?'other':'work'}});
  }}));
  const clients=[];
  try{
    const db=await mf.getD1Database('DB');
    const sql=readFileSync(new URL('../../server/migrations/sync/0001_sync.sql',import.meta.url),'utf8');
    for(const [statement] of sql.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;|CREATE (?:TABLE|INDEX)[\s\S]*?;|INSERT INTO sync_schema[\s\S]*?;/g))await db.prepare(statement).run();
    const call=(path,token,body,method=body===undefined?'GET':'POST')=>mf.dispatchFetch('http://local'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    assert.equal((await call('/v1/policy','invalid')).status,401);
    assert.equal((await call('/v1/policy','wrong-app')).status,403);
    const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');
    const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:0,selections:[],unexpected:true},'PUT')).status,400);
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:0,selections:[selection,{...selection,schema_version:2}]},'PUT')).status,400);
    const homes=[join(root,'a'),join(root,'b')];homes.forEach(h=>ensureStorageSpace(h,space));
    const withStore=(i,run)=>{const s=openPagesStore(homes[i]);try{return run(s);}finally{s.close();}};
    let revoked=false;
    const check=()=>{if(revoked)throw new Error('REVOKED');};
    const authority={assertCurrent:check,signal:new AbortController().signal,accessToken:async()=>'alice'};
    for(let i=0;i<2;i++)clients.push(new PersonalSync({home:homes[i],spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority,fetch:async(url,init)=>mf.dispatchFetch('http://local'+new URL(url).pathname+new URL(url).search,init),registrations:[{selection,title:'Documents',refresh:async()=>{},prepare:async()=>{},withReplica:run=>withStore(i,s=>run(s.replica({authorize:check,project:()=>({title:'Synthetic',context:{spaceId:space.spaceId,projectId:'project',authorize:check,hasReference:()=>true}})})))}]}));
    await clients[0].save({spaceId:space.spaceId,revision:0,selections:[selection]});await clients[0].run();
    const page=withStore(0,s=>s.create({project_id:'project',title:'From A'}));
    await clients[0].run();assert.equal(clients[0].status().error,null);
    await clients[1].run();assert.equal(clients[1].status().error,null);
    assert.equal(withStore(1,s=>s.get(page.id).title),'From A');
    withStore(1,s=>s.update(page.id,{title:'From B'}));await clients[1].run();await clients[0].run();
    assert.equal(withStore(0,s=>s.get(page.id).title),'From B');
    const namespace=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,1]);
    const forged={spaceId:space.spaceId,revision:0,selections:[selection]};
    assert.equal((await call('/v1/policy','bob',forged,'PUT')).status,403);
    assert.equal((await call('/v1/changes?namespace='+encodeURIComponent(namespace)+'&after=0','bob')).status,403);
    const mutation={operationId:'stale',key:JSON.stringify(['project','document',page.id]),base:0,value:null};
    assert.equal((await call('/v1/changes','alice',{namespace,policyRevision:1,mutation,attachments:[]})).status,409);
    withStore(0,s=>s.delete(page.id));await clients[0].run();await clients[1].run();
    assert.equal(withStore(1,s=>s.list('project').length),0);
    // Actual artifact owner -> WASM/D1 opaque transport -> another owner, not a JSON-only mock.
    const artifactSelection={plugin_id:'io.molis.work.artifacts',publisher_id:'molis',publisher_signature:'official-artifacts-binding',collection_id:'versions',schema_version:1};
    const artifactNamespace=JSON.stringify([artifactSelection.plugin_id,artifactSelection.publisher_id,artifactSelection.publisher_signature,artifactSelection.collection_id,1]);
    const nextPolicy=await call('/v1/policy','alice',{spaceId:space.spaceId,revision:1,selections:[selection,artifactSelection]},'PUT');assert.equal(nextPolicy.status,200);
    const databases=[new Database(':memory:'),new Database(':memory:')];
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
    const selections=creative.map(([,m])=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:m.sync.collections[0].id,schema_version:1}));
    assert.equal((await call('/v1/policy','alice',{spaceId:space.spaceId,revision:2,selections:[selection,artifactSelection,...selections]},'PUT')).status,200);
    for(const [index,[open,manifest]] of creative.entries()){
      const a=open(homes[0]),b=open(homes[1]);
      try{
        const context={spaceId:space.spaceId,authorize:check,canUploadProject:()=>true,project:()=>({title:'Synthetic'}),hasArtifact:()=>true};
        const record=a.create({project_id:'creative-project',title:manifest.name+' through Rust/D1'}),ra=a.replica(context),rb=b.replica(context),mutation=ra.next();assert.ok(mutation);
        const s=selections[index],ns=JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,1]);
        assert.equal((await call('/v1/changes','alice',{namespace:ns,policyRevision:3,mutation,attachments:[]})).status,200);
        const response=await call('/v1/changes?namespace='+encodeURIComponent(ns)+'&after=0','alice');assert.equal(response.status,200);
        for(const e of (await response.json()).events){ra.receive(e);rb.receive(e);}
        assert.equal(b.get(record.id).title,record.title);assert.equal(ra.next(),null);assert.equal(rb.next(),null);
        assert.equal((await call('/v1/changes?namespace='+encodeURIComponent(ns)+'&after=0','bob')).status,403);
      }finally{a.close();b.close();}
    }
    await verifyGoalsTransport({homes,space,check,authority,mf,clients});
    revoked=true;assert.throws(()=>clients[0].status(),/REVOKED/);
  }finally{clients.forEach(c=>c.close());await mf.dispose();rmSync(root,{recursive:true,force:true});}
});

// GSYNC-01/04: real Host project creation and Goal facts through Rust/WASM and D1.
async function verifyGoalsTransport({homes,space,check,authority,mf,clients}) {
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},c=>c.createProject({display_name:'Goals through D1',actor_id:'alice'}));
  const selection={plugin_id:'io.molis.work.goals',publisher_id:'molis',publisher_signature:'official-goals-binding',collection_id:'project_goals',schema_version:1};
  const sync=homes.map(home=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority,
    fetch:(url,init)=>mf.dispatchFetch('http://local'+new URL(url).pathname+new URL(url).search,init),
    registrations:[createPersonalGoalRegistration(home,space.spaceId,'alice',check,withMolisWorkProjectCatalog,selection)]}));
  clients.push(...sync);
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
  const destination=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(p=>p.project_id===project.project_id));
  assert.ok(destination);
  const restored=new LocalProjectDatabase(destination.database_path);
  try {
    const snapshot=restored.snapshot(project.project_id);
    assert.deepEqual(snapshot.goals.map(g=>g.goal_id).sort(),['child','parent']);
    assert.equal(snapshot.relations[0].from_goal_id,'child');assert.equal(snapshot.relations[0].to_goal_id,'parent');
    assert.equal(new GoalProjectApplication(restored).goalQueries.getGoal(project.project_id,'parent')?.goal_id,'parent');
  }finally{restored.close();}
  await sync[0].run();await sync[1].run();
  for(const client of sync){assert.equal(client.status().error,null);assert.equal(client.status().collections[0].pending,0);}
}
