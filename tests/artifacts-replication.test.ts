import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {ArtifactsModule,createArtifactsSchema,createArtifactReplication,type ArtifactsSqliteDatabase} from '@molis-ai/molis-work-module-artifacts';

function fixture(t:any,board='project-shared'){
  const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE boards(project_id TEXT PRIMARY KEY); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT);');
  db.prepare('INSERT INTO boards VALUES (?)').run(board);createArtifactsSchema(db as ArtifactsSqliteDatabase);
  let active=true;
  const options={eventCursor:(projectId:string)=>Number((db.prepare('SELECT COALESCE(MAX(seq),0) AS cursor FROM events WHERE project_id=?').get(projectId) as {cursor:number}).cursor),appendEvent:()=>Number(db.prepare('INSERT INTO events(project_id) VALUES (?)').run(board).lastInsertRowid),now:()=> '2026-09-30T00:00:00.000Z'};
  const owner=new ArtifactsModule({db:db as ArtifactsSqliteDatabase,...options});
  const context={spaceId:'space-alice',projectId:board,authorize:()=>{if(!active)throw new Error('REVOKED');}};
  const replication=createArtifactReplication(db as ArtifactsSqliteDatabase,context,options);
  const publish=(version=1,payload:unknown={title:'Report',text:'Full content'})=>owner.commands.registerVersion({
    project_id:board,artifact_id:'artifact',version,actor_id:'user-alice',artifact_type_id:'io.example.report',schema_version:1,origin:{kind:'imported',file_name:'report.json'},title:'Report',media_type:'application/json',
    producer:{plugin_id:'io.example.writer',plugin_version:'1.0.0',binding_signature:'publisher-binding'},content:{kind:'inline',payload:payload as any},
    ...(version>1?{supersedes_version:version-1}:{})});
  return {db,owner,replication,publish,context,options,revoke:()=>active=false};
}

test('portable Artifact round-trip preserves identities, all fixed versions, timestamps and archive state',t=>{
  const a=fixture(t,'project-shared'),b=fixture(t,'project-shared');a.publish();a.publish(2,{title:'Second',text:'Retained version'});
  a.owner.commands.archiveVersion({project_id:'project-shared',artifact_id:'artifact',version:1,actor_id:'user-alice'});
  const payload=a.replication.read('artifact')!;b.replication.apply(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(b.replication.read('artifact'),payload);
  b.replication.apply(payload);assert.equal(b.owner.query.listArtifactVersions('project-shared','artifact').length,2);
  assert.equal(b.owner.query.getArtifactVersion('project-shared',{artifact_id:'artifact',version:1})?.lifecycle_state,'archived');
});
test('same fixed version cannot be overwritten, and incomplete remote bundles cannot discard local versions',t=>{
  const a=fixture(t),b=fixture(t);a.publish();b.publish(1,{different:true});
  assert.throws(()=>b.replication.apply(a.replication.read('artifact')),/不同内容/);
  const c=fixture(t);c.publish();c.publish(2);
  assert.throws(()=>c.replication.apply(a.replication.read('artifact')),/缺少本机已有版本/);
  assert.equal(c.owner.query.listArtifactVersions('project-shared','artifact').length,2);
});
test('tampering, missing supersession, foreign scope and nonportable content fail atomically',t=>{
  const a=fixture(t),b=fixture(t);a.publish();a.publish(2);const value=a.replication.read('artifact')!;
  for(const mutate of [
    (p:any)=>p.spaceId='space-bob',
    (p:any)=>p.versions[1].payload={tampered:true},
    (p:any)=>p.versions[1].supersedes_version=99,
    (p:any)=>p.versions[1].scope='team_project',
    (p:any)=>p.versions[1].content_kind='reference',
  ]){const candidate=structuredClone(value);mutate(candidate);assert.throws(()=>b.replication.apply(candidate));assert.equal(b.replication.read('artifact'),null);}
  const local=fixture(t);local.publish(1,{url:'file:///private/document'});assert.throws(()=>local.replication.read('artifact'),/本机文件/);
});
test('revocation at final commit rolls back both versions and owner journal',t=>{
  const a=fixture(t),b=fixture(t);a.publish();const value=a.replication.read('artifact')!;
  let calls=0;
  const target=createArtifactReplication(b.db as ArtifactsSqliteDatabase,{...b.context,authorize:()=>{if(++calls===4)throw new Error('REVOKED');}},b.options);
  assert.throws(()=>target.apply(value),/REVOKED/);
  assert.equal(b.replication.read('artifact'),null);assert.equal((b.db.prepare('SELECT COUNT(*) AS n FROM events').get() as any).n,0);
});

test('state imports use owner journal once and reject forged archive owners or divergent history',t=>{
  const a=fixture(t),b=fixture(t);a.publish();b.replication.apply(a.replication.read('artifact'));
  const before=Number((b.db.prepare('SELECT COUNT(*) AS n FROM events').get() as any).n);
  a.owner.commands.markUnavailable({project_id:'project-shared',artifact_id:'artifact',version:1,actor_id:'user-alice',reason:'Original content unavailable'});
  a.owner.commands.archiveVersion({project_id:'project-shared',artifact_id:'artifact',version:1,actor_id:'user-alice'});
  const value=a.replication.read('artifact')!;b.replication.apply(value);b.replication.apply(value);
  assert.equal((b.db.prepare('SELECT COUNT(*) AS n FROM events').get() as any).n,before+2);
  const forged=structuredClone(value);forged.versions[0].archived_by='another-user';assert.throws(()=>b.replication.apply(forged),/owner/);
  const divergent=structuredClone(value);divergent.versions[0].archived_at='2026-09-30T01:00:00.000Z';assert.throws(()=>b.replication.apply(divergent),/归档历史冲突/);
});
