import assert from 'node:assert/strict';
import test from 'node:test';
import {personalSyncFixture} from './fixtures/personal-sync-coordinator.js';
import { runtimePersonalSync, syncOwnerPair } from './fixtures/runtime-personal-sync.js';
import {openFormStore,openDatasetStore,openPptStore,openLingguangStore,openWorkflowsStore,openJellyStore,openTodoStore} from './fixtures/plugin-sync-stores.js';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase, homeAgentDefinitions, personalConfigRegistrations} from '@molis-ai/molis-work-app-local-host';
import { APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION, appearanceSelectionActions, type UiAppearanceSelection } from '@molis-ai/molis-work-contracts/platform/ui';
import { bindActionClient, type ActionCallContext } from '@molis-ai/molis-work-contracts/platform/actions';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { createAppearanceOwner } from '@molis-ai/molis-work-service-appearance';
import { AdoptionStore } from '@molis-ai/molis-work-service-blueprints';
import { createFunctionsService } from '@molis-ai/molis-work-module-judgment-rules';
import { AttentionModule } from '@molis-ai/molis-work-module-attention-resumption';
import { createSurfaceCorrections } from '@molis-ai/molis-work-service-surfaces';
import type { Blueprint } from '@molis-ai/molis-work-contracts/platform/blueprints';
import { ASSISTANT_PLUGIN_ID } from '@molis-ai/molis-work-contracts/services/assistant';
import { syncNamespace, type SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext } from 'node:test';
import {formManifest} from '@molis-ai/molis-work-plugin-form';
import {datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {workflowsManifest,newStation,manualLink} from '@molis-ai/molis-work-plugin-workflows';
import {jellyManifest} from '@molis-ai/molis-work-plugin-jelly';
import {todoManifest} from '@molis-ai/molis-work-plugin-todo';
import {scheduleManifest} from '@molis-ai/molis-work-plugin-schedule';
import {feedManifest,FeedOutRuleStore} from '@molis-ai/molis-work-plugin-feed';
import {SourcesModule,fromProjectConnection} from '@molis-ai/molis-work-plugin-feed/store';
import {openCharacters} from '@molis-ai/molis-work-module-characters';
import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';
import {CHARACTER_PLUGIN_ID,CHARACTER_PUBLISHER_SIGNATURE} from '@molis-ai/molis-work-contracts/modules/characters';
test('Host exposes and transfers all registered creative collections through the shared coordinator',{timeout:60000},async t=>{
  const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{
    const p=await c.createProject({display_name:'多插件项目',actor_id:'alice'});
    for(const plugin_id of ['form','dataset','ppt','lingguang','workflows','schedule','feed','todo'])c.addProjectPlugin({project_id:p.project_id,plugin_id,actor_id:'alice'});return p;
  });
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async c=>{await c.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});for(const plugin_id of ['form','dataset','ppt','lingguang','workflows','schedule','feed','todo'])c.addProjectPlugin({project_id:project.project_id,plugin_id,actor_id:'alice'});});
  const sourceRuntime=await runtimePersonalSync(f.homes[0],f.space),targetRuntime=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(()=>sourceRuntime.close());f.closeWith(()=>targetRuntime.close());const a=sourceRuntime.sync,b=targetRuntime.sync;
  const factories=[openFormStore,openDatasetStore,openPptStore,openLingguangStore];
  const ids=factories.map(open=>{const s=open(f.homes[0],project.project_id);try{return s.create({title:'跨设备业务内容'}).id;}finally{s.close();}});
  const workflow=(()=>{const s=openWorkflowsStore(f.homes[0], project.project_id);try{
    const flow=s.create({title:'跨设备流程',chain:{stations:[newStation('pages'),newStation('inbox')],links:[manualLink()]}});
    return {id:flow.workflow_id,instance:s.startInstance(flow,{plugin:'pages',item_id:'source',title:'资料'}).instance_id};
  }finally{s.close();}})();
  const jelly=(()=>{const s=openJellyStore(f.homes[0]);try{const now=new Date().toISOString();return s.write(store=>store.insert('note',{id:'sync-note',title:'跨设备笔记',body:'同步内容',day:null,revision:1,created_at:now,updated_at:now})).id;}finally{s.close();}})();
  // Todo keeps a library in each partition since batch 108: this one is the project's.
  const todo=(()=>{const s=openTodoStore(f.homes[0],undefined,project.project_id);try{return s.create({title:'跨设备待办'},{projectId:null,projectIds:[],actor:'user',actorId:'alice'}).item.id;}finally{s.close();}})();
  const character=(()=>{const s=openCharacters(f.homes[0],LOCAL_PERSON_ACTOR_ID);try{
    return s.service.create({title:'跨设备角色',instructions:'核对事实',host_tools:null}).character_id;
  }finally{s.close();}})();
  const scheduleStore=new LocalProjectDatabase(project.database_path);
  let feedRuleId='';
  try{
    scheduleStore.db.prepare(`INSERT INTO schedule_conversation_tasks (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('sync-task','跨设备提醒','检查进展',9,0,1,1,0,0,'origin-job',null,null,'2026-10-14T00:00:00.000Z','2026-10-14T00:00:00.000Z');
    feedRuleId=new FeedOutRuleStore(fromProjectConnection(scheduleStore.db)).create(project.project_id,{name:'跨设备捕捉',match:{contains:'发布'},enabled:true}).rule_id;
    new SourcesModule(fromProjectConnection(scheduleStore.db)).commands.save({project_id:project.project_id,source_id:'portable-source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'跨设备来源',description:'只同步描述与历史',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'this-device-only-connection'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:null},connection_ref:'this-device-only-reference',account_label:'This device',last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:'2026-10-18T00:00:00.000Z',updated_at:'2026-10-18T00:00:00.000Z'});
  }finally{scheduleStore.close();}
  await a.run();await b.run();
  const selections=[formManifest,datasetManifest,pptManifest,lingguangManifest,workflowsManifest,jellyManifest,todoManifest,scheduleManifest,feedManifest].flatMap(m=>m.sync!.collections.map(c=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:c.id,schema_version:c.schema_version})));
  selections.push({plugin_id:CHARACTER_PLUGIN_ID,publisher_id:'molis',publisher_signature:CHARACTER_PUBLISHER_SIGNATURE,collection_id:'drafts',schema_version:1});
  for(const selection of selections){const available=a.status().collections.find(row=>row.selection.plugin_id===selection.plugin_id&&row.selection.collection_id===selection.collection_id);assert.ok(available,selection.plugin_id+' '+selection.collection_id+' '+JSON.stringify(a.status().collections));assert.deepEqual(available.selection,selection);}assert.ok(a.status().collections.some(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1'));assert.equal(a.policy().selections.length,0,'all current owner collections are opt-in');
  await a.save({...a.policy(),selections});for(let round=0;round<4;round++){await a.run();await b.run();}assert.equal(a.status().error,null);assert.equal(b.status().error,null);
  factories.forEach((open,i)=>{const s=open(f.homes[1],project.project_id);try{assert.equal(s.get(ids[i]!).title,'跨设备业务内容');}finally{s.close();}});
  const received=openWorkflowsStore(f.homes[1], project.project_id);try{
    assert.equal(received.get(workflow.id).title,'跨设备流程');
    assert.equal(received.instance(workflow.instance).title,'资料');
    assert.throws(()=>received.assertExecutableInstance(workflow.instance),/仅可查看/);
  }finally{received.close();}
  const receivedJelly=openJellyStore(f.homes[1]);try{
    assert.equal(receivedJelly.read(store=>store.get('note',jelly))?.title,'跨设备笔记');
  }finally{receivedJelly.close();}
  const receivedTodo=openTodoStore(f.homes[1],undefined,project.project_id);try{
    assert.equal(receivedTodo.get(todo,{projectId:null,projectIds:[],actor:'user',actorId:'alice'}).title,'跨设备待办');
  }finally{receivedTodo.close();}
  const receivedCharacter=openCharacters(f.homes[1],LOCAL_PERSON_ACTOR_ID);try{
    assert.equal(receivedCharacter.service.get(character)?.title,'跨设备角色');
  }finally{receivedCharacter.close();}
  const target=await targetRuntime.withCatalog({homeDirectory:f.homes[1]},c=>c.listProjects().find(p=>p.project_id===project.project_id)!);
  const receivedSchedule=new LocalProjectDatabase(target.database_path);try{
    const task=receivedSchedule.db.prepare('SELECT enabled,job_id,title FROM schedule_conversation_tasks WHERE task_id=?').get('sync-task') as {enabled:number;job_id:string|null;title:string};
    assert.equal(task.title,'跨设备提醒');assert.equal(task.enabled,0);assert.equal(task.job_id,null);
    const rule=new FeedOutRuleStore(fromProjectConnection(receivedSchedule.db)).get(project.project_id,feedRuleId);
    assert.equal(rule.name,'跨设备捕捉');assert.equal(rule.enabled,false,'received capture rules cannot run before local opt-in');
    const source=new SourcesModule(fromProjectConnection(receivedSchedule.db)).query.get(project.project_id,'portable-source');assert.equal(source.name,'跨设备来源');assert.equal(source.enabled,false);assert.equal(source.connection_ref,null);assert.deepEqual(source.config,{});assert.deepEqual(source.schedule,{mode:'manual'});
  }finally{receivedSchedule.close();}
  for(const client of [a,b])for(const collection of client.status().collections)assert.deepEqual(collection.conflicts,[],collection.selection.plugin_id+' '+collection.selection.collection_id);
  const before=f.events.length;await a.run();await b.run();assert.equal(f.events.length,before,'no replication echo');
  assert.doesNotMatch(JSON.stringify(f.events),/this-device-only-connection|this-device-only-reference/,'source setup never enters the transport');
});

const configIds = ['appearance', 'surfaces', 'prompt_overrides', 'blueprints', 'judgment_rules', 'attention'];
const promptKey = ASSISTANT_PLUGIN_ID + '/assistant-base';
const configText = { literal: 'Personal planning' };
const configBlueprint: Blueprint = {
  title: configText, purpose: { audience: configText, work: configText, inputs: configText, outputs: configText, first_result: configText },
  parts: [{ part_id: 'note', layer: 'personal', required: false, proposal: { kind: 'content', type: 'notes.outline.v1', body: {} } }],
  steps: [{ step_id: 'next', title: configText, part_ids: ['note'] }],
  example_task: { title: configText, input: configText, step_ids: ['next'], result: { part_id: 'note', location: configText } },
};
const configAppearance: UiAppearanceSelection = {
  skin: { id: 'soft-workbench', revision: 1 }, font: { policy: 'pinned', scheme: { id: 'system-sans', revision: 1 } }, mono: null,
};
const configSlot = { kind: 'home' } as const;
const now = () => '2026-11-20T00:00:00.000Z';
const noop = () => {};
function appearanceClient(home: string, actor: string) {
  const owner = createAppearanceOwner(home, { locale: { defaultLocale: 'en', isSupported: (value): value is 'en' => value === 'en',
    readFailed: noop, writeFailed: noop, writeSucceeded: noop }, listenerFailed: noop });
  const dispatcher = new ActionService();
  const close = dispatcher.registerProvider(owner.provider());
  const client = bindActionClient(dispatcher, () => ({ actor_id: actor, audience: 'user' as const, project_id: null,
    permissions: [APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION] }));
  return { client, close() { close(); owner.close(); } };
}

async function platformConfigPair(t: TestContext) {
  // Attention is a platform registration even when Inbox is not running on either Home.
  const pair = await syncOwnerPair(t, []);
  const { source, owner } = pair;
  const withProject = <T>(side: typeof source, run: (db: LocalProjectDatabase['db'], projectId: string) => T): T => {
    const project = side.project();
    const store = new LocalProjectDatabase(project.database_path);
    try { return run(store.db, project.project_id); } finally { store.close(); }
  };
  const appearance = appearanceClient(source.home, owner);
  t.after(appearance.close);
  await appearance.client.invoke(appearanceSelectionActions.apply, { request_id: 'choose-skin', expected_revision: 0,
    choice: { kind: 'selection', selection: configAppearance } });
  const caller: Pick<ActionCallContext, 'actor_id' | 'audience'> = { actor_id: owner, audience: 'user' };
  const pin = async (position: number, expected_revision: string) => {
    const store = new LocalProjectDatabase(source.project().database_path);
    try {
      await createSurfaceCorrections(store.db, caller).correct({ slot: configSlot, subject: { kind: 'goal', id: 'saved-goal' },
        correction: 'pin', position, expected_revision }, { beforeEffect: async () => {}, current: noop }, now);
    } finally { store.close(); }
  };
  await pin(2, '0');
  withProject(source, (db, projectId) => {
    const attention = new AttentionModule(db, { exists: () => true });
    const { entry } = attention.commands.create({ project_id: projectId, entry_id: 'persisted-attention', subject_type: 'goal',
      subject_id: 'saved-goal', reason: 'manual' });
    attention.commands.setStatus(projectId, entry.entry_id, 'done', entry.revision);
  });
  const definitions = homeAgentDefinitions(source.home);
  definitions.save(promptKey, 'Check the saved facts.', null, owner);
  const blueprints = new AdoptionStore(source.home);
  const scope = { actor_id: owner, project_id: null };
  const draft = blueprints.saveDraft(scope, { blueprint: configBlueprint, expected_revision: null }, 'en').draft;
  assert.equal(draft.source.kind, 'draft');
  const draftId = draft.source.draft_id;
  const functions = createFunctionsService({ home: source.home, credential: () => null });
  let rule: ReturnType<typeof functions.createChoice>;
  try { rule = functions.createChoice({ name: 'Personal test rule', function_key: 'personal_test_rule' }); }
  finally { functions.close(); }

  async function read(side: typeof source) {
    const skin = appearanceClient(side.home, owner);
    const decisions = createFunctionsService({ home: side.home, credential: () => null });
    try {
      const selected = await skin.client.invoke(appearanceSelectionActions.get, {});
      const [surfaces, attention] = withProject(side, (db, projectId) => [
        createSurfaceCorrections(db, caller).read(configSlot).corrections.map(row => row.position),
        new AttentionModule(db, { exists: () => false }).query.list(projectId).find(row => row.entry_id === 'persisted-attention')?.status ?? null,
      ] as const);
      const prompt = homeAgentDefinitions(side.home).prompt(promptKey);
      const present = decisions.getByKey(rule.function_key);
      let blueprint = null;
      try { blueprint = new AdoptionStore(side.home).draft(scope, draftId).blueprint.title; }
      catch (error) { assert.equal((error as { code?: string }).code, 'actions.missing'); }
      return [selected.selection, surfaces, prompt.user ? prompt.body : null, blueprint, present?.name ?? null, attention];
    } finally { skin.close(); decisions.close(); }
  }
  async function editAll() {
    const selection = await appearance.client.invoke(appearanceSelectionActions.apply, { request_id: 'restore-skin',
      expected_revision: 1, choice: { kind: 'restore' } });
    await pin(3, '1');
    const prompt = definitions.prompt(promptKey).user;
    assert.ok(prompt);
    definitions.save(promptKey, 'Recheck the saved facts.', prompt.revision, owner);
    const title = { literal: 'Updated planning' };
    blueprints.saveDraft(scope, { draft_id: draftId, expected_revision: 1, blueprint: { ...configBlueprint, title } }, 'en');
    const decisions = createFunctionsService({ home: source.home, credential: () => null });
    try { decisions.updateDraft(rule.id, { name: 'Updated personal rule' }, rule.updated_at); }
    finally { decisions.close(); }
    withProject(source, (db, projectId) => {
      const attention = new AttentionModule(db, { exists: () => true });
      const entry = attention.query.list(projectId).find(row => row.entry_id === 'persisted-attention');
      assert.ok(entry);
      attention.commands.setStatus(projectId, entry.entry_id, 'open', entry.revision);
    });
    return [selection.selection, [3], 'Recheck the saved facts.', title, 'Updated personal rule', 'open'];
  }
  return { ...pair, read, editAll };
}

test('AC-M1-04 each platform configuration has independent consent, restores through its owner and survives reopening', { timeout: 120_000 }, async t => {
  const { source, target, read, editAll, space } = await platformConfigPair(t);
  await source.sync.run();
  await target.sync.run();
  assert.deepEqual(source.sync.policy().selections, []);
  const original = await read(target);
  const expected = [configAppearance, [2], 'Check the saved facts.', configText, 'Personal test rule', 'done'];
  assert.notDeepEqual(original, expected);
  const selections: SyncSelection[] = [];
  for (const [index, id] of configIds.entries()) {
    const found = source.sync.status().collections.filter(row => row.selection.collection_id === id && row.group === 'platform');
    assert.equal(found.length, 1, id);
    selections.push(found[0]!.selection);
    await source.sync.save({ ...source.sync.policy(), selections: [...selections] });
    await source.sync.run();
    await target.sync.run();
    assert.equal(source.sync.status().error, null, id);
    assert.equal(target.sync.status().error, null, id);
    assert.deepEqual(await read(target), [...expected.slice(0, index + 1), ...original.slice(index + 1)], id);
  }
  const updated = await editAll();
  await source.sync.run();
  await target.sync.run();
  assert.deepEqual(await read(target), updated);
  await target.close();
  const reopened = await runtimePersonalSync(target.home, space);
  try {
    assert.deepEqual(await read({ ...target, ...reopened }), updated);
    assert.equal(reopened.sync.policy().selections.length, 6);
  } finally { await reopened.close(); }
});

test('AC-M1-05 all six adapters reject unknown fields, oversize, physical paths and suspected credentials before owner writes', { timeout: 120_000 }, async t => {
  const { source, target, owner, space, read } = await platformConfigPair(t);
  const make = (side: typeof source) => {
    const selections = side.sync.status().collections.filter(row => row.group === 'platform' && configIds.includes(row.selection.collection_id)).map(row => row.selection);
    return personalConfigRegistrations({ home: side.home, actor: owner, spaceId: space.spaceId, authorize: noop,
      catalog: side.withCatalog, readCatalog: side.readCatalog, selected: () => ({ revision: 1, selections }) });
  };
  // The six adapters M1-B2 added; the person settings of batch 106 have their own refusals (security-invariants-person-settings).
  const origins = make(source).filter(row => configIds.includes(row.selection.collection_id));
  const attention = origins.find(row => row.selection.collection_id === 'attention')!;
  const project = source.project();
  const sourceOnlyPath = '/private/tmp/only-on-source';
  await source.withCatalog({ homeDirectory: source.home }, catalog =>
    catalog.commit(() => catalog.renameProject(project.project_id, sourceOnlyPath, owner, project.display_name)));
  assert.throws(() => attention.withReplica(replica => replica.next()), 'attention does not publish a physical path used as the project title');
  await source.withCatalog({ homeDirectory: source.home }, catalog =>
    catalog.commit(() => catalog.renameProject(project.project_id, project.display_name, owner, sourceOnlyPath)));

  const targetById = new Map(make(target).map(row => [syncNamespace(row.selection), row]));
  const original = await read(target);
  for (const origin of origins) {
    const destination = targetById.get(syncNamespace(origin.selection))!;
    const mutation = origin.withReplica(replica => replica.next());
    assert.ok(mutation?.value, origin.title);
    for (const [index, mark] of [
      'unrecognized', 'x'.repeat(1024 * 1024), '/private/tmp/only-on-source', ['token', 'dummy-payload-value'].join('='), 'synthetic-only',
    ].entries()) {
      const value = structuredClone(mutation.value) as Record<string, unknown>;
      if (index === 0) value.foreign = mark;
      else if (index === 4) value.clientSecret = mark;
      else if (origin.selection.collection_id === 'attention') {
        const facts = value.facts as { attention_content: { attention_entries: { subject_id: string }[] } };
        facts.attention_content.attention_entries[0]!.subject_id = mark;
      } else if (origin.selection.collection_id === 'appearance') {
        (value.selection as { skin: { id: string } }).skin.id = mark;
      } else if (origin.selection.collection_id === 'surfaces') {
        (value.data as Array<{ subject_id: string }>)[0]!.subject_id = mark;
      } else if (origin.selection.collection_id === 'prompt_overrides') {
        (value.data as { overrides: Array<{ body: string }> }).overrides[0]!.body = mark;
      } else if (origin.selection.collection_id === 'blueprints') {
        (value.data as { blueprint: { title: { literal: string } } }).blueprint.title.literal = mark;
      } else (value.data as { instructions: string }).instructions = mark;
      const event = { ...mutation, value, revision: index + 1, operationId: 'invalid-config-' + index };
      assert.throws(() => destination.withReplica(replica => replica.receive(event)), origin.title);
      assert.equal(destination.withReplica(replica => replica.counts().conflicts), 0, origin.title);
      assert.deepEqual(await read(target), original, origin.title);
    }
  }
});

test('AC-M1-06 local space, another account, and a revoked account cannot read or write any platform configuration replica', { timeout: 120_000 }, async t => {
  const { source, owner, space } = await platformConfigPair(t);
  const local = mkdtempSync(join(tmpdir(), 'm1-b2-local-'));
  t.after(() => rmSync(local, { recursive: true, force: true }));
  ensureStorageSpace(local);
  const selections = source.sync.status().collections.filter(row => row.group === 'platform' && configIds.includes(row.selection.collection_id)).map(row => row.selection);
  for (const [home, actor, authorize] of [[local, owner, noop], [source.home, 'other-account', noop],
    [source.home, owner, () => { throw new Error('TEST_LEASE_REVOKED'); }]] as const) {
    const registrations = personalConfigRegistrations({ home, actor, spaceId: space.spaceId, authorize, catalog: source.withCatalog,
      readCatalog: source.readCatalog, selected: () => ({ revision: 1, selections }) });
    assert.equal(registrations.length, 7, "the six of M1-B2 and the person settings of batch 106");
    for (const registration of registrations) {
      await assert.rejects(registration.refresh(), /不属于当前个人空间|TEST_LEASE_REVOKED/);
      assert.throws(() => registration.withReplica(replica => replica.counts()), /不属于当前个人空间|TEST_LEASE_REVOKED/);
      assert.throws(() => registration.withReplica(replica => replica.receive({ key: 'foreign', revision: 1, base: 0, operationId: 'forged', value: null })),
        /不属于当前个人空间|TEST_LEASE_REVOKED/);
    }
  }
});
