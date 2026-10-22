import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {ArtifactsModule,createArtifactsSchema,createArtifactReplication,createArtifactSyncContent} from '@molis-ai/molis-work-module-artifacts';
import {createSqliteReplica,initializeReplica,replicaSchemaSql,queueReplicaChange,ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {PersonalSync} from '@molis-ai/molis-work-module-sync-replication';
import {LocalProjectDatabase,GoalProjectApplication,createPersonalGoalRegistration} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-11/12/13 a large Goal fact unit restores atomically through real WASM D1/R2',async t=>{
  const f=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-large-goal-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b','damaged'].map(n=>join(root,n));homes.forEach(home=>ensureStorageSpace(home,space));
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},c=>c.createProject({display_name:'Large Goals',actor_id:'alice'}));
  const store=new LocalProjectDatabase(project.database_path);
  try {
    const app=new GoalProjectApplication(store);
    for(let i=0;i<12;i++)app.goalEvents.createIntent({project_id:project.project_id,goal_id:'large-'+i,title:'Goal '+i,outcome:'完整工作内容🙂'.repeat(6000),actor_id:'runtime',actor_kind:'runtime',idempotency_key:'intent-'+i});
  }finally{store.close();}
  const make=(home,transport=f.transport)=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'alice';}},fetch:transport,registrations:[createPersonalGoalRegistration(home,space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,f.selection)]});
  let a=make(homes[0]),b=make(homes[1]);t.after(()=>{a.close();b.close();});
  await a.save({spaceId:space.spaceId,revision:0,selections:[f.selection]});
  const finish=async(client,home)=>{
    for(let round=0;round<12;round++){
      await client.run();if(client.status().error===null)return client;
      assert.match(client.status().error,/附件传输尚未完成/,'only the bounded cycle may interrupt healthy content');
      if(home===homes[1])assert.equal(await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.listProjects().length),0,'incomplete download does not create a project');
      client.close();client=make(home);
    }
    client.close();assert.fail('Goal transfer did not finish within bounded resumed cycles');
  };
  a=await finish(a,homes[0]);assert.equal(a.status().error,null);
  const row=await f.db.prepare('SELECT value,attachments FROM sync_events').first();assert.equal(JSON.parse(row.value).format,2);assert.ok(Buffer.byteLength(row.value)<4096);assert.ok(JSON.parse(row.attachments).length>1);
  b=await finish(b,homes[1]);assert.equal(b.status().error,null);
  const target=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.listProjects()[0]);
  const read=path=>{const db=new LocalProjectDatabase(path);try{return db.snapshot(project.project_id);}finally{db.close();}};
  const source=read(project.database_path);assert.ok(Buffer.byteLength(JSON.stringify(source))>512*1024);
  const targetDb=new LocalProjectDatabase(target.database_path);
  try{assert.equal(targetDb.snapshot(project.project_id).goals.length,12);assert.equal(new GoalProjectApplication(targetDb).goalQueries.getGoal(project.project_id,'large-0').outcome,'完整工作内容🙂'.repeat(6000));}finally{targetDb.close();}
  const objects=await f.bucket.list();await f.bucket.put(objects.objects[0].key,Buffer.from('damaged'));
  const c=make(homes[2]);t.after(()=>c.close());await c.run();assert.notEqual(c.status().error,null);
  assert.equal(await withMolisWorkProjectCatalog({homeDirectory:homes[2]},c=>c.listProjects().length),0,'failed content does not even create an empty project');
  assert.deepEqual(read(project.database_path),source,'source content is never changed by failed restore');
});

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=bytes=>({digest:hash(bytes),size:bytes.length});
const query=(f,r,part=0)=>'/v1/blobs/chunk?'+new URLSearchParams({namespace:f.namespace,digest:r.digest,part:String(part)});
const reserve=(f,r,user='alice')=>f.call('/v1/blobs/reserve',user,{namespace:f.namespace,...r});
const complete=(f,r,user='alice')=>f.call('/v1/blobs/complete',user,{namespace:f.namespace,digest:r.digest});
const put=(f,r,bytes,part=0,user='alice')=>f.transport('https://sync.example.test'+query(f,r,part),{method:'PUT',headers:{Authorization:'Bearer '+user},body:bytes});

test('PCSYNC-09/10/11 actual 100 MB of private content fills the shared quota without seeded usage', {timeout:60000},async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');
 const chunk=4*1024*1024,files=[];
 for(const fill of [71,72]){
  const bytes=Buffer.alloc(49999500,fill),reference=ref(bytes);files.push(reference);
  assert.equal((await reserve(f,reference)).status,200);
  for(let part=0;part<Math.ceil(bytes.length/chunk);part++)assert.equal((await put(f,reference,bytes.subarray(part*chunk,(part+1)*chunk),part)).status,200);
  assert.equal((await complete(f,reference)).status,200);assert.equal((await complete(f,reference)).status,200,'completion replay does not charge again');
 }
 const value={files},published=await f.write('full:files','files',value,{attachments:files});assert.equal(published.status,200);const revision=(await published.json()).revision;
 const before=(await(await f.call('/v1/quota')).json()).usedBytes;assert.equal(before,99999000+Buffer.byteLength(JSON.stringify(value)));
 const remaining=100000000-before;assert.ok(remaining>=2&&remaining<1000);const filler='x'.repeat(remaining-2);
 assert.equal((await f.write('full:filler','filler',filler)).status,200);assert.equal((await f.write('full:filler','filler',filler)).status,200,'receipt replay at full quota remains idempotent');
 assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,100000000);
 assert.equal((await reserve(f,ref(Buffer.from('one more')))).status,413);assert.equal((await f.write('full:refused','refused','x')).status,413);
 for(const reference of files){
  const digest=createHash('sha256');let downloaded=0;
  for(let part=0;part<Math.ceil(reference.size/chunk);part++){const response=await f.call(query(f,reference,part));assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());downloaded+=bytes.length;digest.update(bytes);}
  assert.equal(downloaded,reference.size);assert.equal(digest.digest('hex'),reference.digest,'all real stored bytes remain downloadable at full quota');
 }
 assert.equal((await f.write('full:delete','files',null,{base:revision})).status,200);assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,100000000,'soft deletion retains charged content');
 assert.equal((await f.call(query(f,files[0]),'bob')).status,404);assert.equal((await(await f.call('/v1/quota','bob')).json()).usedBytes,0);assert.equal((await f.write('bob:own','own','ok',{user:'bob'})).status,200);
});

test('PCSYNC-01/09/11/12 private R2 parts resume, reserve once, and require a complete verified body',async t=>{
  const f=await cloudFixture(t);await f.enable();await f.enable('bob');
  const bytes=Buffer.alloc(4*1024*1024+11,71),r=ref(bytes);
  assert.equal((await reserve(f,r)).status,200);assert.equal((await reserve(f,r)).status,200);
  assert.equal((await f.call('/v1/quota')).status,200);assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytes.length);
  assert.equal((await put(f,r,bytes.subarray(0,4*1024*1024))).status,200);
  assert.equal((await put(f,r,Buffer.from('x'))).status,411,'declared part length is checked before reading an oversized or malformed body');
  assert.equal((await complete(f,r)).status,409);
  assert.equal((await f.call(query(f,r))).status,409,'unfinished content is not readable');
  assert.equal((await f.write('early','asset',{file:r},{attachments:[r]})).status,409,'unfinished reference is not published');
  const receipt=await(await reserve(f,r)).json();assert.equal(receipt.parts.length,1);
  assert.equal((await put(f,r,bytes.subarray(0,4*1024*1024))).status,200);
  assert.equal((await put(f,r,Buffer.alloc(4*1024*1024,72))).status,409,'a committed part cannot be replaced');
  assert.equal((await put(f,r,bytes.subarray(4*1024*1024),1)).status,200);
  assert.equal((await complete(f,r)).status,200);assert.equal((await complete(f,r)).status,200);
  assert.equal((await f.call(query(f,r),'bob')).status,404,'knowledge of a digest gives no other account access');
  assert.equal((await complete(f,r,'bob')).status,404);
  assert.equal((await put(f,r,bytes.subarray(0,4*1024*1024),0,'bob')).status,404);
  assert.equal((await f.call('/v1/blobs/status?'+new URLSearchParams({namespace:f.namespace,digest:'../../private'}))).status,400);
  assert.equal((await f.write('foreign','asset',{file:r},{user:'bob',attachments:[r]})).status,409);
  assert.equal((await f.write('linked','asset',{file:r},{attachments:[r]})).status,200);
  assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytes.length+Buffer.byteLength(JSON.stringify({file:r})));
  const response=await f.call(query(f,r));assert.equal(response.headers.get('Content-Type'),'application/octet-stream');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(0,4*1024*1024));
  const objects=await f.bucket.list();assert.equal(objects.objects.length,2);assert.ok(objects.objects.every(o=>o.key.startsWith(f.space('alice')+'/')));
});

test('PCSYNC-09/10 reservations and record writes share one atomic 100 MB account ledger',async t=>{
  const f=await cloudFixture(t);await f.enable();
  await f.db.prepare('INSERT INTO sync_usage VALUES (?,?)').bind(f.space('alice'),99999995).run();
  const r=ref(Buffer.from('four'));
  const results=await Promise.all([reserve(f,r),f.write('race','record','x')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,413]);
  assert.ok((await(await f.call('/v1/quota')).json()).usedBytes<=100000000);
  const row=await f.db.prepare('SELECT size FROM sync_blobs WHERE space=? AND digest=?').bind(f.space('alice'),r.digest).first();
  if(row){assert.equal((await reserve(f,r)).status,200);assert.equal((await reserve(f,{...r,size:5})).status,409);}
});

test('PCSYNC-11/12 wrong digest or damaged R2 chunks never become a usable attachment',async t=>{
  const f=await cloudFixture(t);await f.enable();const r=ref(Buffer.from('good'));
  await reserve(f,r);assert.equal((await put(f,r,Buffer.from('evil'))).status,200);
  assert.equal((await complete(f,r)).status,409);assert.equal((await f.write('bad','record',{}, {attachments:[r]})).status,409);
  const proper=ref(Buffer.from('okay'));await reserve(f,proper);await put(f,proper,Buffer.from('okay'));await complete(f,proper);
  const objects=await f.bucket.list();const key=objects.objects.find(o=>o.key.includes('/'+proper.digest+'/')).key;
  await f.bucket.put(key,Buffer.from('oops'));
  assert.equal((await f.call(query(f,proper))).status,503);
});

function artifactDevice(t,f,name,fetcher=f.transport){
  const home=mkdtempSync(join(tmpdir(),'molis-r2-'+name+'-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const db=new Database(join(home,'fixture.db'));t.after(()=>db.close());
  db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE project_root(project_id TEXT PRIMARY KEY);CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT);');db.prepare('INSERT INTO project_root VALUES (?)').run('project');createArtifactsSchema(db);db.exec(replicaSchemaSql());initializeReplica(db);
  const options={eventCursor:()=>0,appendEvent:()=>0,now:()=> '2026-10-17T00:00:00Z'};
  const owner=new ArtifactsModule({db,...options}),replication=createArtifactReplication(db,{spaceId:space.spaceId,projectId:'project',authorize(){}},options),key=JSON.stringify(['project','artifact','asset']);
  const replica=createSqliteReplica(db,{authorize(){},read:()=>{const artifact=replication.read('asset');return artifact?{project:{id:'project',title:'R2 fixture'},artifact}:null;},apply:(_,value)=>replication.apply(value.artifact)});
  const registration={selection:f.selection,title:'Artifact',content:createArtifactSyncContent(space.spaceId),async refresh(){},async prepare(){},withReplica:run=>run(replica)};
  const make=()=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'alice';}},fetch:fetcher,registrations:[registration]});
  const publish=(version,payload,type='io.molis.work.document')=>{owner.commands.registerVersion({project_id:'project',artifact_id:'asset',version,actor_id:'alice',artifact_type_id:type,schema_version:1,origin:{kind:'imported',file_name:'file.bin'},title:'A saved file',media_type:'application/octet-stream',producer:{plugin_id:'io.example.import',plugin_version:'1.0.0',binding_signature:'synthetic'},content:{kind:'inline',payload},...(version>1?{supersedes_version:version-1}:{})});queueReplicaChange(db,key);};
  return {home,owner,replication,publish,make,replica};
}

test('PCSYNC-11/12/13 Artifact original bytes and large immutable bodies round-trip through real WASM D1/R2',async t=>{
  const f=await cloudFixture(t);let fail=true,uploads=0;
  const transport=async(url,options)=>{const result=await f.transport(url,options);if(options?.method==='PUT'&&new URL(String(url)).pathname==='/v1/blobs/chunk'){uploads++;if(fail){fail=false;throw new Error('simulated lost upload response');}}return result;};
  const a=artifactDevice(t,f,'source',transport),b=artifactDevice(t,f,'target');
  const file=Buffer.alloc(5*1024*1024,41),payload={original_file:{filename:'image.jpg',mime:'image/jpeg',data_base64:file.toString('base64')}};
  a.publish(1,payload);a.publish(2,{content:'大正文'.repeat(100000)},'io.example.report');
  let sender=a.make();await sender.save({spaceId:f.space('alice'),revision:0,selections:[f.selection]});await sender.run();assert.match(sender.status().error,/simulated lost/);assert.equal(a.replica.counts().pending,1);sender.close();
  sender=a.make();t.after(()=>sender.close());await sender.run();assert.equal(sender.status().error,null);assert.equal(a.replica.counts().pending,0);
  assert.equal(uploads,4,'lost reply resumes the stored first part rather than uploading it again');
  const receiver=b.make();t.after(()=>receiver.close());await receiver.run();assert.equal(receiver.status().error,null);
  assert.deepEqual(b.replication.read('asset'),a.replication.read('asset'));assert.deepEqual(Buffer.from(b.owner.query.getArtifactVersion('project',{artifact_id:'asset',version:1}).payload.original_file.data_base64,'base64'),file);
  const rows=await f.db.prepare('SELECT value,attachments FROM sync_events').all();assert.equal(rows.results.length,1);assert.ok(Buffer.byteLength(rows.results[0].value)<512*1024);assert.ok(!rows.results[0].value.includes(file.toString('base64').slice(0,100)));
  const attachments=JSON.parse(rows.results[0].attachments);const bytes=attachments.reduce((sum,r)=>sum+r.size,0);assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytes+Buffer.byteLength(rows.results[0].value));
  const objects=await f.bucket.list();const fileKey=objects.objects.find(o=>o.key.includes('/'+hash(file)+'/')).key;await f.bucket.put(fileKey,Buffer.alloc(4*1024*1024,99));
  const c=artifactDevice(t,f,'damaged-target'),damaged=c.make();t.after(()=>damaged.close());await damaged.run();assert.notEqual(damaged.status().error,null);assert.equal(c.replication.read('asset'),null,'no partial business import');assert.deepEqual(Buffer.from(a.owner.query.getArtifactVersion('project',{artifact_id:'asset',version:1}).payload.original_file.data_base64,'base64'),file,'the unique original is unchanged');
});

test('PCSYNC-04/12 bounded cycles resume past completed prefixes across coordinator restarts',async t=>{
  const f=await cloudFixture(t);let requests=0;
  const transport=async(url,options)=>{if(new URL(String(url)).pathname.startsWith('/v1/blobs/'))requests++;return f.transport(url,options);};
  const a=artifactDevice(t,f,'many-source',transport),b=artifactDevice(t,f,'many-target',transport);
  for(let version=1;version<=40;version++)a.publish(version,{original_file:{filename:'file.bin',mime:'application/octet-stream',data_base64:Buffer.from('file-'+version).toString('base64')}});
  let sender=a.make();await sender.save({spaceId:f.space('alice'),revision:0,selections:[f.selection]});let finished=false;
  for(let round=0;round<12;round++){requests=0;await sender.run();assert.ok(requests<=32,'one cycle obeys the attachment request budget');if(sender.status().error===null&&a.replica.counts().pending===0){finished=true;break;}sender.close();sender=a.make();}
  sender.close();assert.ok(finished,'a completed prefix cannot starve the remaining files');
  let receiver=b.make();finished=false;
  for(let round=0;round<12;round++){requests=0;await receiver.run();assert.ok(requests<=32);if(receiver.status().error===null){finished=true;break;}assert.equal(b.replication.read('asset'),null);receiver.close();receiver=b.make();}
  receiver.close();assert.ok(finished);assert.deepEqual(b.replication.read('asset'),a.replication.read('asset'));
});
