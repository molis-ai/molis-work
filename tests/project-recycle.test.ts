import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import {createSqliteReplica,initializeReplica,replicaSchemaSql,replicaMarkSql} from '@molis-ai/molis-work-storage';
import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createProjectsSchema, ProjectsModule, projectReplicationOwner, installProjectReplicationJournal } from '@molis-ai/molis-work-module-projects';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { ProjectDeletionService } from '@molis-ai/molis-work-app-local-host';

test('PCSYNC-17/20 owner recycling keeps facts, rejects stale confirmations, and replays receipts without changing a later state', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys=ON');createProjectsSchema(db);
    const projects = new ProjectsModule({ db, spaceId: 'personal:test', plugins: { has: id => id === 'pages', companions: () => [] } });
    const p = projects.lifecycle.prepareRecord({ display_name: '原项目', projects_directory: '/tmp/recycle', data_class: 'user' });
    projects.lifecycle.register(p, 'project.created', 'alice');
    projects.commands.addProjectPlugin({ project_id: p.project_id, plugin_id: 'pages', actor_id: 'alice' });
    const workspace = projects.commands.addWorkspaceProject({ project_id: p.project_id, canonical_path: '/tmp/recycle-workspace', actor_id: 'alice', user_confirmed: true });
    const original = projects.query.getProject(p.project_id);
    const plugins = projects.query.listProjectPlugins(p.project_id);
    const portable = projectReplicationOwner(db, { spaceId: 'personal:test', authorize() {}, excludedProjectIds: [] });
    const body = portable.read(p.project_id);
    const first = projects.recycle.inspect(p.project_id);
    const input = { project_id: p.project_id, actor_id: 'alice', operation_id: 'archive-one', expected_state: first.state, recycled: true, confirmed: true };
    const archived = projects.recycle.change(input, () => {});
    assert.equal(archived.generation, 1);assert.equal(archived.recycled, true);
    assert.deepEqual(projects.query.listProjects(), []);assert.deepEqual(projects.query.selections(), []);
    assert.deepEqual(projects.query.listWorkspaceMemberships(), []);
    assert.deepEqual(projects.query.workspaceProjectSelections(workspace.workspace_id), []);
    assert.throws(() => projects.query.getProject(p.project_id), { code: 'catalog.project_not_found' });
    assert.throws(() => projects.commands.renameProject(p.project_id, '禁止编辑', 'alice', p.display_name), { code: 'catalog.project_not_found' });
    assert.throws(() => projects.commands.addWorkspaceProject({ project_id: p.project_id, canonical_path: '/tmp/other', actor_id: 'alice', user_confirmed: true }), { code: 'catalog.project_not_found' });
    assert.equal(portable.read(p.project_id), null);
    assert.throws(() => portable.apply(p.project_id, body), { code: 'catalog.sync_project_scope' });
    const restored = projects.recycle.change({ ...input, operation_id: 'restore-one', expected_state: archived.state, recycled: false }, () => {});
    assert.equal(restored.generation, 2);assert.notEqual(restored.state, first.state);
    assert.deepEqual(projects.query.getProject(p.project_id), original);assert.deepEqual(projects.query.listProjectPlugins(p.project_id), plugins);
    assert.equal(projects.query.preferredWorkspacePath(p.project_id), '/tmp/recycle-workspace');
    assert.deepEqual(portable.read(p.project_id), body);
    assert.deepEqual(projects.recycle.change(input, () => {}), archived, 'retry returns original receipt');
    assert.equal(projects.recycle.inspect(p.project_id).recycled, false, 'old receipt never rearchives restored project');
    assert.throws(() => projects.recycle.change({ ...input, operation_id: 'stale' }, () => {}), { code: 'catalog.recycle_changed' });
    assert.throws(() => projects.recycle.change({ ...input, recycled: false }, () => {}), { code: 'catalog.recycle_changed' });
    let checks = 0;
    assert.throws(() => projects.recycle.change({ ...input, operation_id: 'revoked', expected_state: restored.state }, () => { if (++checks === 2) throw new Error('revoked'); }), /revoked/);
    assert.deepEqual(projects.recycle.inspect(p.project_id), restored, 'tail authorization failure rolls back facts and receipt');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM project_recycle_receipts WHERE operation_id='revoked'").get()?.n, 0);
  } finally { db.close(); }
});

test('PCSYNC-20 the unique Host service retains project bytes, refuses active terminals and stale release results, and restores without starting execution', async t => {
  const home = await mkdtemp(join(tmpdir(), 'molis-project-recycle-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });t.after(() => catalog.close());
  const p = await catalog.createProject({ display_name: '保留原件', actor_id: 'alice' });
  const bytes = await readFile(p.database_path);
  const panel = catalog.openDesktopPanel({ project_id: p.project_id, goal_id: 'goal', runtime_kind: 'generic', launch_command: '/bin/cat', cwd: home, actor_id: 'alice', user_confirmed: true });
  let alive = true, releases = 0, mutate = false;
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, {
    isPanelAlive: id => id === panel.panel_id && alive,
    isProjectBusy: () => false,
    async releaseProject() { releases++;if (mutate) catalog.renameProject(p.project_id, '等待期间改名', 'alice', '保留原件'); },
  });
  const input = { project_id: p.project_id, actor_id: 'alice', operation_id: 'first', expected_state: catalog.recycle.inspect(p.project_id).state, recycled: true, confirmed: true };
  await assert.rejects(service.changeRecycled(home, input, () => {}), { code: 'catalog.project_terminal_live' });assert.equal(releases, 0);
  alive = false;mutate = true;
  await assert.rejects(service.changeRecycled(home, input, () => {}), { code: 'catalog.recycle_changed' });
  assert.equal(catalog.recycle.inspect(p.project_id).recycled, false);assert.equal(catalog.recycle.list().length, 0);
  mutate = false;
  const archived = await service.changeRecycled(home, { ...input, expected_state: catalog.recycle.inspect(p.project_id).state }, () => {});
  assert.equal(existsSync(p.database_path), true);assert.deepEqual(await readFile(p.database_path), bytes);
  assert.equal(catalog.listProjects().length, 0);assert.equal(catalog.listProjectDeletions().length, 0);
  const before = releases;
  await service.changeRecycled(home, { ...input, operation_id: 'restore', expected_state: archived.state, recycled: false }, () => {});
  assert.equal(releases, before);assert.equal(catalog.getProject(p.project_id).display_name, '等待期间改名');
  assert.equal(catalog.listDesktopPanels(p.project_id)[0].panel_id, panel.panel_id);
});

test('PCSYNC-20 frozen actual v23 catalog is refused before modifying any bytes', async t => {
  const home = await mkdtemp(join(tmpdir(), 'molis-project-recycle-old-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { mkdir } = await import('node:fs/promises');await mkdir(join(home, 'projects'));
  const file = join(home, 'projects', 'catalog.db'), db = new Database(file);
  db.exec(await readFile(new URL('./fixtures/project-catalog-v23.sql', import.meta.url), 'utf8'));db.close();
  const bytes = await readFile(file);
  await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: home }), { code: 'catalog.unsupported_schema' });
  assert.deepEqual(await readFile(file), bytes);
});


test('PCSYNC-20 receiver retains unknown project tombstones without ghost projects and requires lifecycle admission',()=>{
 const db=new Database(':memory:');try{
  db.pragma('foreign_keys=ON');createProjectsSchema(db);db.exec(replicaSchemaSql());initializeReplica(db);installProjectReplicationJournal(db,replicaMarkSql);
  const options={spaceId:'personal:test',authorize(){},excludedProjectIds:[]};
  const denied=createSqliteReplica(db,projectReplicationOwner(db,options));
  denied.receive({key:'unseen',operationId:'delete',base:0,revision:1,value:null});
  assert.equal(denied.conflicts().length,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM project_recycle').get()?.n,0);
  let permitted=true;
  const owner=projectReplicationOwner(db,{...options,authorizeLifecycle(){if(!permitted)throw new Error('PERMIT_REVOKED');}}),replica=createSqliteReplica(db,{...owner,conflictState:createSyncConflictState});
  replica.receive({key:'other-unseen',operationId:'delete-other',base:0,revision:2,value:null});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects').get()?.n,0);
  assert.equal(db.prepare('SELECT recycled FROM project_recycle WHERE project_id=?').get('other-unseen')?.recycled,1);
  const projects=new ProjectsModule({db,spaceId:'personal:test',plugins:{has:()=>true,companions:()=>[]}});
  assert.deepEqual(projects.recycle.list(),[],'unknown tombstones do not become user-visible fake projects');
  replica.receive({key:'other-unseen',operationId:'old',base:0,revision:1,value:{bad:true}});
  assert.equal(db.prepare('SELECT generation FROM project_recycle WHERE project_id=?').get('other-unseen')?.generation,1,'old events cannot revive or change tombstone');
  const p=projects.lifecycle.prepareRecord({display_name:'Restored',projects_directory:'/tmp/recycle',data_class:'user'});p.project_id='other-unseen';projects.lifecycle.register(p,'project.created','alice');
  const local=replica.next()!;replica.acknowledge(local.key,local.operationId,3);
  const body={format:1,spaceId:'personal:test',project:{id:p.project_id,title:p.display_name,created_at:p.created_at,updated_at:p.updated_at},plugins:[]};
  permitted=false;replica.receive({key:p.project_id,operationId:'restore-denied',base:3,revision:4,value:body});
  assert.equal(projects.recycle.isRecycled(p.project_id),true);
  permitted=true;const conflict=replica.inspectConflict!(p.project_id)!;replica.resolve(p.project_id,'remote',conflict.revision,conflict.state);
  assert.equal(projects.recycle.isRecycled(p.project_id),false);assert.equal(projects.query.getProject(p.project_id).display_name,'Restored');
  assert.equal(replica.next(),null,'received lifecycle does not enqueue local command echo');
 }finally{db.close();}
});

test('PCSYNC-20 actual frozen v24 catalog is refused unchanged by v25',async t=>{
 const home=await mkdtemp(join(tmpdir(),'molis-project-v24-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const {mkdir}=await import('node:fs/promises');await mkdir(join(home,'projects'));
 const file=join(home,'projects/catalog.db'),db=new Database(file);db.exec(await readFile(new URL('./fixtures/project-catalog-v24.sql',import.meta.url),'utf8'));db.close();
 const before=await readFile(file);await assert.rejects(openMolisWorkProjectCatalog({homeDirectory:home}),{code:'catalog.unsupported_schema'});assert.deepEqual(await readFile(file),before);
});
