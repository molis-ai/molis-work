import {syncRoundResponse} from './fixtures/sync-round.js';
import {syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import type {SyncEvent} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,readFileSync,readdirSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {createProjectsSchema,ProjectsModule,projectReplicationOwner,validatePortableProject,projectPluginRequirements,installProjectReplicationJournal} from '@molis-ai/molis-work-module-projects';
import {replicaSchemaSql,replicaMarkSql,initializeReplica,borrowedReplicaDatabase,createSqliteReplica,ensureStorageSpace,personalStorageSpace,inspectCatalogFile} from '@molis-ai/molis-work-storage';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import {createPersonalCatalogRegistration,CATALOG_SCHEMA_VERSION,ProjectDeletionService,handleProjectRecycleHttp,createPersonalSync} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog,openMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';

const spaceId='personal:alice',at='2026-10-19T00:00:00.000Z';
function moduleFixture(t:TestContext){
  const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys = ON');createProjectsSchema(db);db.exec(replicaSchemaSql());
  const ledger=borrowedReplicaDatabase({exec:sql=>db.exec(sql),prepare:sql=>db.prepare(sql)});initializeReplica(ledger);installProjectReplicationJournal(db,replicaMarkSql);
  let current=true;const authorize=()=>{if(!current)throw new Error('revoked');},options={spaceId,authorize,excludedProjectIds:['personal-root']};
  const projects=new ProjectsModule({db,spaceId,now:()=>at,plugins:{has:id=>['goals','pages'].includes(id),companions:()=>[]}});
  const owner=projectReplicationOwner(db,options),replica=createSqliteReplica(ledger,{...owner,conflictState:createSyncConflictState});
  const create=(id:string,synced=false)=>{const p=projects.lifecycle.prepareRecord({project_id:id,display_name:'项目',projects_directory:'/source/private-only',data_class:'user'});projects.lifecycle.register(p,synced?'project.sync_prepared':'project.created','alice');return p;};
  return {db,projects,replica,owner,options,create,revoke:()=>{current=false;}};
}
const value=(key:string,plugins=['goals'])=>({format:1,spaceId,project:{id:key,title:'新名称',created_at:at,updated_at:at},plugins});

test('PCSYNC-17/20 retained project lifecycle journals tombstone and explicit restore without allowing ordinary content to revive it', t => {
  const f=moduleFixture(t),p=f.create('project-recycle');
  const first=f.replica.next()!;f.replica.acknowledge(first.key,first.operationId,1);
  const before=f.projects.recycle.inspect(p.project_id);
  const input={project_id:p.project_id,actor_id:'alice',operation_id:'recycle',expected_state:before.state,recycled:true,confirmed:true};
  const archived=f.projects.recycle.change(input,f.options.authorize);
  const tombstone=f.replica.next()!;
  assert.equal(tombstone.key,p.project_id);assert.equal(tombstone.base,1);assert.equal(tombstone.value,null);
  f.replica.acknowledge(tombstone.key,tombstone.operationId,2);
  const wire={key:p.project_id,operationId:'late-content',base:2,revision:3,value:value(p.project_id)};
  f.replica.receive(wire);
  assert.equal(f.projects.recycle.inspect(p.project_id).recycled,true);
  assert.equal(f.replica.conflicts().length,1,'ordinary metadata receive cannot implicitly restore retained project');
  assert.equal(f.replica.inspectConflict!(p.project_id)!.remote!==null,true);
  assert.deepEqual(f.projects.recycle.change(input,f.options.authorize),archived);
  assert.equal(f.replica.counts().pending,0,'receipt replay creates no new mutation');
  f.projects.recycle.change({...input,operation_id:'restore',expected_state:archived.state,recycled:false},f.options.authorize);
  assert.equal(f.projects.query.getProject(p.project_id).display_name,p.display_name);
  assert.equal(f.replica.counts().pending,1);
  assert.equal(f.replica.next(),null,'an unresolved conflict still blocks the restored item upload');
  const compared=f.replica.inspectConflict!(p.project_id)!;
  f.replica.resolve(p.project_id,'local',compared.revision,compared.state);
  const restore=f.replica.next()!;
  assert.equal(restore.base,3);assert.deepEqual(restore.value,first.value);
});

test('PCSYNC-15/20 old project rename observations refuse before idempotence, events or sync queue writes',t=>{
  const f=moduleFixture(t),p=f.create('project-a',true);
  f.replica.receive({key:p.project_id,operationId:'remote:1',base:0,revision:1,value:value(p.project_id)});
  const events=f.db.prepare('SELECT * FROM project_events ORDER BY rowid').all();
  for(const name of ['旧页面草稿','新名称']){
    assert.throws(()=>f.projects.commands.renameProject(p.project_id,name,'alice',p.display_name),{code:'catalog.project_name_conflict'});
    assert.equal(f.projects.query.getProject(p.project_id).display_name,'新名称');assert.equal(f.replica.counts().pending,0);
    assert.deepEqual(f.db.prepare('SELECT * FROM project_events ORDER BY rowid').all(),events);
  }
  // A missing wire token cannot be replaced with a fresh server-side read.
  assert.throws(()=>Reflect.apply(f.projects.commands.renameProject,undefined,[p.project_id,'无观察值','alice']),{code:'catalog.project_name_conflict'});
  assert.equal(f.replica.counts().pending,0);
  assert.equal(f.projects.commands.renameProject(p.project_id,'新名称','alice','新名称').display_name,'新名称');
  assert.equal(f.replica.counts().pending,0,'fresh no-op does not enqueue');
  f.projects.commands.renameProject(p.project_id,'已核对后保存','alice','新名称');
  assert.equal(f.replica.counts().pending,1);assert.equal(f.projects.query.getProject(p.project_id).display_name,'已核对后保存');
});

test('PCSYNC-20 changing portable intent queues even when the local activation itself does not change',t=>{
  const f=moduleFixture(t),p=f.create('project-a',true);
  const settle=(revision:number)=>{const next=f.replica.next()!;assert.ok(next);f.replica.acknowledge(next.key,next.operationId,revision);};
  f.projects.commands.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});settle(1);
  f.replica.receive({key:p.project_id,operationId:'remote:2',base:1,revision:2,value:value(p.project_id)});
  assert.deepEqual(f.projects.query.listProjectPlugins(p.project_id),['goals','pages']);assert.deepEqual(f.owner.read(p.project_id)!.plugins,['goals']);
  f.db.exec("CREATE TRIGGER reject_plugin_event AFTER INSERT ON project_events WHEN NEW.type='project.plugin_added' BEGIN SELECT RAISE(ABORT,'reject portable plugin event'); END");
  assert.throws(()=>f.projects.commands.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'}),/reject portable plugin event/);
  assert.deepEqual(f.owner.read(p.project_id)!.plugins,['goals']);assert.equal(f.replica.counts().pending,0,'rejected business event rolls back portable intent too');f.db.exec('DROP TRIGGER reject_plugin_event');
  f.projects.commands.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});
  assert.equal(f.replica.counts().pending,1,'restoring desired membership must queue even if already active');settle(3);
  f.projects.commands.removeProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});settle(4);
  f.replica.receive({key:p.project_id,operationId:'remote:5',base:4,revision:5,value:value(p.project_id,['goals','pages'])});
  assert.deepEqual(f.projects.query.listProjectPlugins(p.project_id),['goals']);assert.deepEqual(f.owner.read(p.project_id)!.plugins,['goals','pages']);
  f.projects.commands.removeProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});
  assert.equal(f.replica.counts().pending,1,'removing desired membership must queue even if already inactive');
  assert.deepEqual(f.owner.read(p.project_id)!.plugins,['goals']);
});

test('PCSYNC-20 portable Projects preserve desired plugin facts separately from local activation, exclusions and directories',t=>{
  const f=moduleFixture(t),p=f.create('project-a',true);f.projects.commands.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});
  const pending=f.replica.next()!;f.replica.acknowledge(pending.key,pending.operationId,1);
  f.projects.commands.removeProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});
  const removed=f.replica.next()!;f.replica.acknowledge(removed.key,removed.operationId,2);
  f.replica.receive({key:p.project_id,operationId:'remote:1',base:2,revision:3,value:value(p.project_id,['goals','independent.plugin','pages'])});
  assert.equal(f.replica.counts().conflicts,0);assert.equal(f.replica.counts().pending,0,'passive apply never echoes an upload');
  assert.equal(f.projects.query.getProject(p.project_id).database_path,p.database_path);
  assert.equal(f.projects.query.getProject(p.project_id).display_name,'新名称');
  assert.equal(f.projects.query.wasProjectPluginRemoved(p.project_id,'pages'),true);
  assert.deepEqual(f.projects.query.listProjectPlugins(p.project_id),['goals'],'no automatic install or activation');
  assert.deepEqual(projectPluginRequirements(f.db,p.project_id,id=>['goals','pages'].includes(id)),[
    {plugin_id:'goals',installed:true,active:true},{plugin_id:'independent.plugin',installed:false,active:false},{plugin_id:'pages',installed:true,active:false}]);
  const projection=f.owner.read(p.project_id)!;assert.deepEqual(projection.plugins,['goals','independent.plugin','pages']);
  assert.doesNotMatch(JSON.stringify(projection),/private-only|database_path|actor_id|canonical_path/);
  f.projects.commands.renameProject(p.project_id,'再次改名','alice','新名称');assert.deepEqual((f.replica.next()!.value as typeof projection).plugins,projection.plugins,'renaming does not lose unavailable desired plugins');
});

test('PCSYNC-15 project metadata user edits, conflict retention, stale confirmations and revocation use the common journal atomically',t=>{
  const f=moduleFixture(t),p=f.create('project-a');assert.equal(f.replica.counts().pending,1);
  const first=f.replica.next()!;f.replica.acknowledge(first.key,first.operationId,1);
  f.db.exec("CREATE TRIGGER reject_project_event AFTER INSERT ON project_events BEGIN SELECT RAISE(ABORT,'reject project event'); END");
  assert.throws(()=>f.projects.commands.renameProject(p.project_id,'不应写入','alice','项目'),/reject project event/);assert.equal(f.projects.query.getProject(p.project_id).display_name,'项目');assert.equal(f.replica.counts().pending,0);f.db.exec('DROP TRIGGER reject_project_event');
  f.projects.commands.renameProject(p.project_id,'本机编辑','alice','项目');f.replica.receive({key:p.project_id,operationId:'remote:1',base:1,revision:2,value:value(p.project_id)});
  assert.equal(f.projects.query.getProject(p.project_id).display_name,'本机编辑');assert.equal(f.replica.counts().conflicts,1);
  const inspected=f.replica.inspectConflict!(p.project_id)!;f.projects.commands.renameProject(p.project_id,'比较后新编辑','alice','本机编辑');
  assert.throws(()=>f.replica.resolve(p.project_id,'remote',2,inspected.state),/比较内容已变化/);assert.equal(f.projects.query.getProject(p.project_id).display_name,'比较后新编辑');
  f.revoke();assert.throws(()=>f.owner.apply(p.project_id,value(p.project_id)),/revoked/);assert.equal(f.projects.query.getProject(p.project_id).display_name,'比较后新编辑');
});

test('PCSYNC-20 rejects foreign scope, extra path or grant fields, unknown format, duplicate plugins and lifecycle deletion without writes',t=>{
  const f=moduleFixture(t),p=f.create('project-a',true),before=f.owner.read(p.project_id);
  for(const invalid of [null,{...value(p.project_id),spaceId:'personal:bob'},{...value(p.project_id),format:2},{...value(p.project_id),database_path:'/etc'},
    {...value(p.project_id),permissions:['*']},{...value(p.project_id),project:{...value(p.project_id).project,database_path:'/etc'}},value(p.project_id,['pages','goals']),value(p.project_id,['goals','goals']),value('another-project')]){
    assert.throws(()=>f.owner.apply(p.project_id,invalid));assert.deepEqual(f.owner.read(p.project_id),before);
  }
  assert.throws(()=>validatePortableProject('personal-root',value('personal-root'),f.options),{code:'catalog.sync_project_scope'});
});

function homes(t:TestContext){const root=mkdtempSync(join(tmpdir(),'project-metadata-sync-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');return {root,space,make:(name:string)=>{const home=join(root,name);ensureStorageSpace(home,space);return home;}};}

test('PCSYNC-01 local-space Project edits remain local and cannot register for personal sync',async t=>{
  const f=homes(t),home=join(f.root,'local');
  await withMolisWorkProjectCatalog({homeDirectory:home},async c=>{const p=await c.createProject({display_name:'本机项目',actor_id:'local'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'artifacts',actor_id:'local'});c.renameProject(p.project_id,'本机改名','local','本机项目');});
  const db=new Database(join(home,'projects','catalog.db'),{readonly:true});try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM project_catalog_replica_changes').get()!.n,0);}finally{db.close();}
  assert.throws(()=>createPersonalCatalogRegistration(home,f.space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,'molis'),/不属于当前个人空间/);
});

for(const [label,sql] of [['journal state','DELETE FROM project_catalog_replica_state'],['owner table','DROP TABLE project_portable_plugins']] as const)test(`PCSYNC-20 current catalog missing ${label} is unavailable, never rebuilt or a successful empty collection`,async t=>{
  const f=homes(t),home=f.make('corrupt');await withMolisWorkProjectCatalog({homeDirectory:home},()=>{});const file=join(home,'projects','catalog.db');
  const db=new Database(file);db.exec(sql);db.close();const bytes=readFileSync(file);
  const registration=createPersonalCatalogRegistration(home,f.space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,'molis');await registration.refresh();
  assert.equal(registration.available!(),false);assert.throws(()=>registration.withReplica(r=>r.counts()),/暂不可用/);assert.deepEqual(readFileSync(file),bytes,'no owner table or device identity is regenerated');
});

test('PCSYNC-20 readonly catalog inspection observes committed live WAL metadata, not the older main-file version',t=>{
  const f=homes(t),file=join(f.root,'live ?#%.db'),db=new Database(file);t.after(()=>db.close());
  db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');db.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO catalog_meta VALUES('owner','molis-work-project-catalog-v1'),('schema_version','22'); PRAGMA wal_checkpoint(TRUNCATE); UPDATE catalog_meta SET value='23' WHERE key='schema_version';");
  const main=readFileSync(file),wal=readFileSync(file+'-wal'),files=readdirSync(f.root);
  assert.deepEqual(inspectCatalogFile(file),{owner:'molis-work-project-catalog-v1',version:23});assert.deepEqual(readFileSync(file),main);assert.deepEqual(readFileSync(file+'-wal'),wal);assert.deepEqual(readdirSync(f.root),files);
});

test('PCSYNC-20 partial WAL refuses before opening SQLite and does not create missing shared memory or ignore pending metadata',t=>{
  const f=homes(t),file=join(f.root,'partial.db'),db=new Database(file);
  db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');db.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO catalog_meta VALUES('owner','molis-work-project-catalog-v1'),('schema_version','22');PRAGMA wal_checkpoint(TRUNCATE);UPDATE catalog_meta SET value='23' WHERE key='schema_version';");
  const wal=readFileSync(file+'-wal');db.close();writeFileSync(file+'-wal',wal);const main=readFileSync(file),files=readdirSync(f.root);
  assert.throws(()=>inspectCatalogFile(file),{code:'storage.catalog_probe_busy'});assert.deepEqual(readFileSync(file),main);assert.deepEqual(readFileSync(file+'-wal'),wal);assert.deepEqual(readdirSync(f.root),files);
});

test('PCSYNC-MCP-RECONNECT-01 catalog inspection preserves live WAL ownership across another process closing',t=>{
  const f=homes(t),file=join(f.root,'live-lock.db'),db=new Database(file);t.after(()=>db.close());
  db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');
  db.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO catalog_meta VALUES('owner','molis-work-project-catalog-v1'),('schema_version','25');");
  const files=readdirSync(f.root),main=readFileSync(file),wal=readFileSync(file+'-wal');
  for(let attempt=0;attempt<3;attempt++){
    assert.deepEqual(inspectCatalogFile(file),{owner:'molis-work-project-catalog-v1',version:25});
    const child=spawnSync(process.execPath,['--input-type=module','-e',
      'import Database from "better-sqlite3";const db=new Database(process.argv[1]);db.prepare("SELECT * FROM catalog_meta").all();db.close();',file],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    assert.deepEqual(readdirSync(f.root),files,'a different process must not unlink the resident connection’s WAL/SHM');
    assert.deepEqual(readFileSync(file),main);assert.deepEqual(readFileSync(file+'-wal'),wal);
  }
  db.exec("UPDATE catalog_meta SET value='26' WHERE key='schema_version'");
  assert.equal(inspectCatalogFile(file).version,26,'resident writes remain readable after repeated probes and reconnects');
});

test('PCSYNC-MCP-RECONNECT-02 readonly inspection cannot release another connection’s active write lock',t=>{
  const f=homes(t),file=join(f.root,'write-lock.db'),db=new Database(file);t.after(()=>db.close());
  db.pragma('journal_mode=WAL');db.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO catalog_meta VALUES('owner','molis-work-project-catalog-v1'),('schema_version','25');BEGIN IMMEDIATE;UPDATE catalog_meta SET value='26' WHERE key='schema_version';");
  try{
    assert.equal(inspectCatalogFile(file).version,25,'the probe sees committed metadata, never the writer’s pending change');
    const child=spawnSync(process.execPath,['--input-type=module','-e',
      'import Database from "better-sqlite3";const db=new Database(process.argv[1],{timeout:0});try{db.exec("BEGIN IMMEDIATE;ROLLBACK");process.stdout.write("unlocked");}catch(error){process.stdout.write(error.code);}finally{db.close();}',file],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'SQLITE_BUSY','probing must not release the resident writer’s lock');
  }finally{db.exec('ROLLBACK');}
  assert.equal(inspectCatalogFile(file).version,25);
});

test('PCSYNC-20 actual Host passive creation and fresh catalog journal round-trip rename without source paths or automatic activation',async t=>{
  const f=homes(t),a=f.make('a'),b=f.make('b');
  const project=await withMolisWorkProjectCatalog({homeDirectory:a},async c=>{const p=await c.createProject({display_name:'源项目',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'artifacts',actor_id:'alice'});return p;});
  const registration=(home:string)=>createPersonalCatalogRegistration(home,f.space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,'molis');
  const ar=registration(a),br=registration(b);await ar.refresh();await br.refresh();
  const mutation=ar.withReplica(r=>r.next())!;assert.equal(mutation.key,project.project_id);const event={...mutation,revision:1};
  await br.prepare(event);br.withReplica(r=>r.receive(event));ar.withReplica(r=>r.acknowledge(mutation.key,mutation.operationId,1));
  assert.deepEqual(br.withReplica(r=>r.counts()),{pending:0,conflicts:0});
  await withMolisWorkProjectCatalog({homeDirectory:b},c=>{const p=c.getProject(project.project_id);assert.notEqual(p.database_path,project.database_path);assert.ok(p.database_path.startsWith(b));assert.equal(p.display_name,'源项目');assert.ok(c.projectPluginRequirements(p.project_id).some(p=>p.plugin_id==='artifacts'&&p.installed&&!p.active));c.renameProject(p.project_id,'目标改名','alice','源项目');});
  const rename=br.withReplica(r=>r.next())!;await ar.prepare({...rename,revision:2});ar.withReplica(r=>r.receive({...rename,revision:2}));
  await withMolisWorkProjectCatalog({homeDirectory:a},c=>assert.equal(c.getProject(project.project_id).display_name,'目标改名'));
  assert.equal(ar.withReplica(r=>r.counts()).pending,0);
});

for(const mode of ['DELETE','WAL'])test(`PCSYNC-20 frozen v22 ${mode} catalog is rejected byte-for-byte before writable PRAGMAs or new sidecars`,async t=>{
  const f=homes(t),home=f.make('old'),directory=join(home,'projects');mkdirSync(directory,{recursive:true});const file=join(directory,'catalog.db');
  const db=new Database(file);db.pragma('journal_mode='+mode);db.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO catalog_meta VALUES('owner','molis-work-project-catalog-v1'),('schema_version','22'); CREATE TABLE original_fact(value TEXT); INSERT INTO original_fact VALUES('retain');");db.close();
  const bytes=readFileSync(file),files=readdirSync(directory);assert.equal(CATALOG_SCHEMA_VERSION,25);
  await assert.rejects(openMolisWorkProjectCatalog({homeDirectory:home}),{code:'catalog.unsupported_schema'});assert.deepEqual(readFileSync(file),bytes);assert.deepEqual(readdirSync(directory),files);
});

test('PCSYNC-20 stale project events cannot provision ghosts before receive; explicit deferred retry can prepare a missing project',async t=>{
  const f=homes(t),home=f.make('stale-prepare');
  const registration=createPersonalCatalogRegistration(home,f.space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,'molis');await registration.refresh();
  const event={key:'project-11111111-1111-1111-1111-111111111111',operationId:'remote:old',base:0,revision:1,value:{...value('project-11111111-1111-1111-1111-111111111111'),spaceId:f.space.spaceId}};
  // A later unrelated event has already advanced this collection. Its owner rejection is retained as a conflict.
  registration.withReplica(r=>r.receive({key:'later-project',operationId:'remote:new',base:0,revision:2,value:null}));
  const before=await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.listProjects());
  await registration.prepare(event);
  assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.listProjects()),before,'ignored old event must not create a project before receive ignores it');
  assert.equal(registration.withReplica(r=>r.cursor()),2);
  await registration.prepare(event,{retry:true});registration.withReplica(r=>r.receive(event,{retry:true}));
  await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.getProject(event.key).display_name,'新名称'));
  assert.equal(registration.withReplica(r=>r.cursor()),2,'deferred retry never rewinds the shared cursor');
});


test('PCSYNC-20 actual project registration admits delete and restore through the unique service without a local echo',async t=>{
 const f=homes(t),home=f.make('lifecycle');let releases=0,dirty=false;
 const service=new ProjectDeletionService(withMolisWorkProjectCatalog,{isPanelAlive:()=>false,isProjectBusy:()=>false,async releaseProject(){releases++;}});
 const p=await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.createProject({display_name:'Keep bytes',actor_id:'alice'}));
 const bytes=readFileSync(p.database_path);
 const registration=createPersonalCatalogRegistration(home,f.space.spaceId,'alice',()=>{},withMolisWorkProjectCatalog,'molis',{service,assertChildrenSettled(){if(dirty)throw new Error('CHILD_DIRTY');}});
 await registration.refresh();const initial=registration.withReplica(r=>r.next())!;registration.withReplica(r=>r.acknowledge(initial.key,initial.operationId,1));
 const deletion={key:p.project_id,operationId:'remote-delete',base:1,revision:2,value:null};
 await registration.prepare(deletion);dirty=true;
 await assert.rejects(registration.withMutation!({kind:'receive',event:deletion,retry:false},()=>registration.withReplica(r=>r.receive(deletion))),/CHILD_DIRTY/);
 assert.equal(releases,0);await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.recycle.isRecycled(p.project_id),false));
 dirty=false;await registration.withMutation!({kind:'receive',event:deletion,retry:false},()=>registration.withReplica(r=>r.receive(deletion)));
 assert.equal(releases,1);assert.deepEqual(readFileSync(p.database_path),bytes);
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>{assert.equal(c.recycle.isRecycled(p.project_id),true);assert.equal(c.listProjects().length,0);});
 assert.deepEqual(registration.withReplica(r=>r.counts()),{pending:0,conflicts:0});
 await registration.withMutation!({kind:'receive',event:deletion,retry:false},()=>registration.withReplica(r=>r.receive(deletion)));assert.equal(releases,1,'ignored replay must not release a runtime again');
 const restore={...initial,operationId:'remote-restore',base:2,revision:3};await registration.prepare(restore);
 await registration.withMutation!({kind:'receive',event:restore,retry:false},()=>registration.withReplica(r=>r.receive(restore)));
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.getProject(p.project_id).display_name,'Keep bytes'));
 assert.equal(releases,1);assert.deepEqual(registration.withReplica(r=>r.counts()),{pending:0,conflicts:0});
 const unseen='project-9a6b83f5-e561-49cb-9e65-f99818636f00',tombstone={key:unseen,operationId:'unseen-delete',base:0,revision:4,value:null};await registration.prepare(tombstone);
 await registration.withMutation!({kind:'receive',event:tombstone,retry:false},()=>registration.withReplica(r=>r.receive(tombstone)));
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>{assert.equal(c.listProjects().length,1);assert.equal(c.recycle.isRecycled(unseen),true);});assert.equal(releases,1);
 const body={...initial.value as object,project:{id:unseen,title:'Restored unseen',created_at:at,updated_at:at}};
 const unseenRestore={key:unseen,operationId:'unseen-restore',base:4,revision:5,value:body};await registration.prepare(unseenRestore);
 await registration.withMutation!({kind:'receive',event:unseenRestore,retry:false},()=>registration.withReplica(r=>r.receive(unseenRestore)));
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.getProject(unseen).display_name,'Restored unseen'));
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.renameProject(p.project_id,'Local conflict','alice','Keep bytes'));
 const conflicting={...deletion,operationId:'delete-conflict',base:3,revision:6};
 await registration.withMutation!({kind:'receive',event:conflicting,retry:false},()=>registration.withReplica(r=>r.receive(conflicting)));
 assert.equal(releases,1,'parent conflict is recorded without releasing before an explicit choice');
 const view=registration.withReplica(r=>r.inspectConflict!(p.project_id))!;
 await assert.rejects(registration.withMutation!({kind:'resolve',key:p.project_id,choice:'remote',revision:view.revision,state:'stale'},()=>registration.withReplica(r=>r.resolve(p.project_id,'remote',view.revision,'stale'))),/版本已变化/);assert.equal(releases,1);
 await registration.withMutation!({kind:'resolve',key:p.project_id,choice:'remote',revision:view.revision,state:view.state},()=>registration.withReplica(r=>r.resolve(p.project_id,'remote',view.revision,view.state)));
 assert.equal(releases,2);await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.recycle.isRecycled(p.project_id),true));
 const recovery=registration.withReplica(r=>r.recoveries!())[0]!;
 await registration.withMutation!({kind:'restore-recovery',id:recovery.id,choice:'local',revision:recovery.revision},()=>registration.withReplica(r=>r.restoreRecovery!(recovery.id,'local',recovery.revision)));
 assert.equal(releases,2);await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.getProject(p.project_id).display_name,'Local conflict'));
 assert.equal(registration.withReplica(r=>r.next())!.key,p.project_id,'explicit local-history restore creates its intended new local revision');
});


test('PCSYNC-20 personal recycle HTTP rejects foreign space and request actor while binding observations to the unique service',async t=>{
 const f=homes(t),home=f.make('recycle-http'),p=await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.createProject({display_name:'HTTP retained',actor_id:'alice'}));let releases=0;
 const ports={isPanelAlive:()=>false,isProjectBusy:()=>false,async releaseProject(){releases++;}};
 const server=createServer((req,res)=>{void handleProjectRecycleHttp(req,res,new URL(req.url!,'http://localhost'),home,withMolisWorkProjectCatalog,ports).then(handled=>{if(!handled){res.statusCode=404;res.end();}});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();}));
 const address=server.address();assert.ok(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port,path='/api/settings/projects/'+p.project_id+'/recycle';
 const list=await (await fetch(origin+'/api/settings/projects/recycle')).json() as {items:{project_id:string;state:string}[]};assert.equal(list.items.length,1);assert.equal(JSON.stringify(list).includes(p.database_path),false);
 const post=(body:object,space=f.space.spaceId)=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json','x-molis-sync-space':space},body:JSON.stringify(body)});
 const input={operation_id:'http-recycle',expected_state:list.items[0]!.state,recycled:true,confirmed:true};
 assert.equal((await post(input,'another-space')).status,403);assert.equal((await post({...input,actor_id:'forged'})).status,400);assert.equal(releases,0);
 const response=await post(input);assert.equal(response.status,200);assert.equal(releases,1);
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.recycle.isRecycled(p.project_id),true));
 const replay=await post(input);assert.equal(replay.status,200);assert.equal(releases,1);
});


test('PCSYNC-20 composed personal sync checks all static owners and receives project deletion and restoration end to end',async t=>{
 const f=homes(t),home=f.make('composed-lifecycle'),p=await withMolisWorkProjectCatalog({homeDirectory:home},c=>c.createProject({display_name:'All owner lifecycle',actor_id:'alice'}));
 const oldOrigin=process.env.MOLIS_WORK_SYNC_ORIGIN,oldLocal=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
 t.after(()=>{if(oldOrigin===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=oldOrigin;if(oldLocal!==undefined)process.env.MOLIS_WORK_SYNC_LOCAL=oldLocal;});
 let policy={spaceId:f.space.spaceId,revision:0,selections:[] as import('@molis-ai/molis-work-contracts/modules/sync-replication').SyncSelection[]},releases=0;
 const streams=new Map<string,SyncEvent[]>(),events=(ns:string)=>{if(!streams.has(ns))streams.set(ns,[]);return streams.get(ns)!;};
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.pathname==='/v1/policy'){if(init?.method==='PUT')policy={...JSON.parse(String(init.body)),revision:policy.revision+1};return Response.json(policy);}
  if(url.pathname==='/v1/round')return syncRoundResponse(policy,s=>events(syncNamespace(s)).at(-1)?.revision??0);
  if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
  assert.equal(url.pathname,'/v1/changes','fixture must not silently accept a new protocol route');
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body)),stream=events(body.namespace);assert.equal(body.attachments.length,0);
   const existing=stream.find(row=>row.operationId===body.mutation.operationId);if(existing)return Response.json({accepted:true,revision:existing.revision});
   const revision=(stream.at(-1)?.revision??0)+1;stream.push({...body.mutation,revision});return Response.json({accepted:true,revision});
  }
  return Response.json({events:events(url.searchParams.get('namespace')!).filter(e=>e.revision>Number(url.searchParams.get('after'))),more:false});
 });
 const service=new ProjectDeletionService(withMolisWorkProjectCatalog,{isPanelAlive:()=>false,isProjectBusy:()=>false,async releaseProject(){releases++;}});
 const sync=await createPersonalSync(home,f.space,{userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic-test-token';}},withMolisWorkProjectCatalog,()=>{},undefined,service);assert.ok(sync);t.after(()=>sync.close());
 await sync.save({...sync.policy(),selections:sync.status().collections.map(c=>c.selection)});await sync.run();assert.equal(sync.status().error,null,'all fresh owners must settle before lifecycle delivery');
 const catalog=sync.status().collections.find(c=>c.selection.collection_id==='projects')!,stream=events(syncNamespace(catalog.selection)),initial=stream.find(e=>e.key===p.project_id)!;assert.ok(initial);
 const revision=(stream.at(-1)?.revision??0)+1;stream.push({key:p.project_id,operationId:'remote-delete',base:initial.revision,revision,value:null});await sync.run();
 assert.equal(sync.status().error,null);await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.recycle.isRecycled(p.project_id),true));assert.equal(releases,1);
 stream.push({...initial,operationId:'remote-restore',base:revision,revision:revision+1});await sync.run();assert.equal(sync.status().error,null);
 await withMolisWorkProjectCatalog({homeDirectory:home},c=>assert.equal(c.getProject(p.project_id).display_name,'All owner lifecycle'));assert.equal(releases,1);
});
