import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { LocalProjectDatabase, GoalProjectApplication, createProjectGoalReplica, createPersonalGoalRegistration } from '@molis-ai/molis-work-app-local-host';
import { PersonalSync, syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { createContextLedger } from '@molis-ai/molis-work-module-context-ledger';
import { ensureStorageSpace, personalStorageSpace, mapReplicaSequences } from '@molis-ai/molis-work-storage';
import type { SyncMutation, SyncEvent, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { SpaceSyncPolicy } from '@molis-ai/molis-work-contracts/modules/sync-replication';

const selection = { plugin_id: 'io.molis.work.goals', publisher_id: 'molis', publisher_signature: 'official-goals-binding', collection_id: 'project_goals', schema_version: 1 };
const sequenceFields = ['journal_seq', 'based_on_cursor', 'support_valid_after_seq', 'observed_event_cursor', 'goal_event_cursor', 'event_list_next_cursor', 'event_cursor', 'next_cursor', 'base_event_cursor'];
const comparable = (value: unknown) => mapReplicaSequences(value, sequenceFields, () => 0);

async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'goal-sync-'));
  const space = personalStorageSpace('http://127.0.0.1:8787', 'work', 'alice');
  const homes = ['a', 'b'].map(id => join(root, id));
  homes.forEach(home => ensureStorageSpace(home, space));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: homes[0] }, c => c.createProject({ display_name: '跨设备 Goals', actor_id: 'alice' }));
  let active = true, online = true, drop = false;
  const check = () => { if (!active) throw new Error('host.test_revoked'); };
  const registrations = homes.map(home => createPersonalGoalRegistration(home, space.spaceId, 'alice', check, withMolisWorkProjectCatalog, selection));
  let policy: SpaceSyncPolicy = { spaceId: space.spaceId, revision: 0, selections: [] };
  const events: SyncEvent[] = [];
  const transport: typeof fetch = async (input, init) => {
    if (!online) throw new Error('host.test_offline');
    const url = new URL(String(input));
    if (url.pathname === '/v1/policy') {
      if (init?.method === 'PUT') {
        const next = JSON.parse(String(init.body)) as SpaceSyncPolicy;
        if (next.revision !== policy.revision) return Response.json({}, { status: 409 });
        policy = { ...next, revision: next.revision + 1 };
      }
      return Response.json(policy);
    }
    if (init?.method === 'POST') {
      const { mutation: m } = JSON.parse(String(init.body)) as { mutation: SyncMutation };
      if (!events.some(e => e.operationId === m.operationId)) {
        if ((events.filter(e => e.key === m.key).at(-1)?.revision ?? 0) !== m.base) return Response.json({}, { status: 409 });
        events.push({ ...m, revision: events.length + 1 });
      }
      if (drop) { drop = false; throw new Error('host.test_receipt_lost'); }
      return Response.json({ accepted: true });
    }
    const rows = events.filter(e => e.revision > Number(url.searchParams.get('after')));
    return Response.json({ events: rows.slice(0, 2), more: rows.length > 2 });
  };
  const clients = homes.map((home, i) => new PersonalSync({ home, spaceId: space.spaceId, endpoint: 'http://127.0.0.1:8788', authority: { signal: new AbortController().signal, assertCurrent: check, accessToken: async () => 'test-only' }, registrations: [registrations[i]!], fetch: transport }));
  const paths = [project.database_path, ''];
  const edit = <T>(i: number, operation: (app: GoalProjectApplication, store: LocalProjectDatabase) => T): T => {
    const store = new LocalProjectDatabase(paths[i]!);
    try { return operation(new GoalProjectApplication(store), store); } finally { store.close(); }
  };
  const run = async () => {
    await clients[0]!.run(); await clients[1]!.run();
    for (const c of clients) assert.equal(c.status().error, null);
    await withMolisWorkProjectCatalog({ homeDirectory: homes[1] }, c => { paths[1] = c.listProjects().find(p => p.project_id === project.project_id)!.database_path; });
  };
  const enable = async () => { await clients[0]!.save({ ...clients[0]!.policy(), selections: [selection] }); await run(); };
  const replica = <T>(i: number, fn: (r: ReturnType<typeof createProjectGoalReplica>) => T) => edit(i, (_app, store) => fn(createProjectGoalReplica(store.db, { spaceId: space.spaceId, projectId: project.project_id, title: project.display_name, authorize: check })));
  t.after(() => { clients.forEach(c => c.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, space, project, clients, events, edit, run, enable, replica, offline: () => { online = false; }, online: () => { online = true; }, drop: () => { drop = true; }, revoke: () => { active = false; } };
}

function work(app: GoalProjectApplication, project: string, id = 'goal-main') {
  const base = { project_id: project, goal_id: id, actor_id: 'runtime-1', actor_kind: 'runtime' as const };
  app.goalEvents.createIntent({ ...base, title: '可移植的目标', outcome: '设备上可检查', idempotency_key: `${id}:intent` });
  app.goalEvents.configure({ ...base, expected_version: 0, idempotency_key: `${id}:config`, types: [{ type_id: 'delivery', version: 1, name: '交付', purpose: '结果', semantic_family: 'delivery', source: { kind: 'runtime', label: 'Goal' }, fields: [{ field_id: 'piece', name: '结果', purpose: '结果', format: 'text', required: true }] }] });
  const state = app.goalEvents.readState(project, id);
  app.goalEvents.setAgreement({ ...base, expected_config_version: state.config.version, expected_agreement_version: state.agreement.version, idempotency_key: `${id}:agreement`, new_requirements: [{ requirement_id: `${id}:requirement`, statement: '检查得到结果', human_decision_required: true }] });
  app.goalEvents.report({ ...base, idempotency_key: `${id}:report`, events: [{ type_id: 'delivery', type_version: 1, title: '已交付', fields: { piece: '结果' }, judgments: [{ requirement_id: `${id}:requirement`, verdict: 'supports' }] }] });
  app.goalEvents.recordTrustedDecision({ project_id: project, goal_id: id, idempotency_key: `${id}:decision`, authority: { actor_id: 'alice', actor_kind: 'user', authority_source: 'web', conversation_ref: `web:${project}`, message_ref: `decision:${id}` }, conclusion: '确认交付', accepts_requirements: true, scope: { requirement_ids: [`${id}:requirement`] } });
  const ready = app.goalEvents.readState(project, id);
  const close = app.goalEvents.submitClosure({ ...base, idempotency_key: `${id}:close`, kind: 'complete', result: '设备上已验证结果', reason: '验收完成', expected_config_version: ready.config.version, expected_agreement_version: ready.agreement.version });
  assert.equal(close.completion_applied, true, JSON.stringify(close.unmet_reasons));
}

test('GSYNC-01 GSYNC-02 GSYNC-03 GSYNC-04 restore completed Goals, graph, history, proposal, guidance and precise references', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, (app, db) => {
    work(app, p);
    app.goalEvents.createIntent({ project_id: p, goal_id: 'child', title: '子目标', actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: 'child' });
    app.goals.commands.addRelation(p, { from_goal_id: 'child', to_goal_id: 'goal-main', type: 'part_of', reason: '包含' }, { actor_id: 'alice', idempotency_key: 'relation' });
    app.setActiveGoal(p, { goal_id: 'child', reason: '定位' }, { actor_id: 'alice', idempotency_key: 'active' });
    app.goals.commands.addProjectGuidance({ project_id: p, actor_id: 'alice', kind: 'quality_bar', content: '完整恢复事实', reason: '同步', confirmation_summary: '已确认', user_confirmed: true, idempotency_key: 'guidance' });
    app.goals.commands.saveProjectPolicy({ project_id: p, actor_id: 'alice', user_confirmed: true, policy: { human_approval: true }, idempotency_key: 'policy' });
    const method = app.goals.planning.effectiveMethods(p)[0]!;
    app.goals.planning.saveProjectMethod({ project_id: p, actor_id: 'alice', user_confirmed: true, method: { ...method, summary: '项目自定义方法', enabled: true } });
    app.goalTreeSubmission.submitGoalTreeProposal({ project_id: p, root_goal_id: 'goal-main', actor_id: 'runtime-1', summary: '待确认结构', idempotency_key: 'proposal', items: [{ item_id: 'proposed-child', kind: 'goal', operation: 'create', payload: { goal_id: 'proposed', title: '未执行的提案', outcome: '用户决定后创建' }, source_refs: ['conversation://plan'], reason: '候选', confidence: 1, affected_objects: [{ object_type: 'goal', object_id: 'proposed' }] }] });
    app.goalInputs.register({ binding_id: 'input', project_id: p, goal_id: 'goal-main', input_name: '资料', source_type: 'feed_item', source_ref: 'feed-item:missing-feed', snapshot_digest: null, state: 'confirmed', reason: '引用', created_by: 'alice', created_at: new Date().toISOString() });
    const ledger = createContextLedger(db.db, { authorize: () => true, initializeSchema: false }), access = { actor_id: 'alice', scope: { kind: 'personal' as const, id: p } };
    ledger.commands.put(access, { key: 'output', type: 'goal.output', source: { module: 'goals', id: 'goal-main', version: null, scope: access.scope }, target: { module: 'artifacts', id: 'not-downloaded', version: 3, scope: access.scope }, cause: '交付' });
    ledger.commands.remove(access, 'output', '移除');
    db.appendEvent({ eventId: 'local-only-source', projectId: p, actorId: 'alice', type: 'artifact.local_note', objectType: 'artifact', objectId: 'private', reason: 'not Goal', payload: {}, at: new Date().toISOString() });
  });
  assert.equal(f.events.length, 0);
  await f.enable();
  const conflicts = f.clients[1]!.status().collections[0]!.conflicts;
  assert.deepEqual(conflicts, []);
  const source = f.edit(0, app => app.goalEvents.readState(p, 'goal-main'));
  const restored = f.edit(1, (app, db) => {
    assert.equal(app.goalInputs.list(p)[0]!.source_ref, 'feed-item:missing-feed');
    assert.equal(db.snapshot(p).goals.some(g => g.goal_id === 'proposed'), false, 'receiving a proposal does not execute it');
    assert.equal(db.readEventsDescending(p).some(e => e.event_id === 'local-only-source'), false);
    const ledger = createContextLedger(db.db, { authorize: () => true, initializeSchema: false });
    assert.deepEqual(ledger.query.history({ actor_id: 'alice', scope: { kind: 'personal', id: p } }, 'output').map(e => [e.revision, e.state]), [[1, 'active'], [2, 'removed']]);
    return app.goalEvents.readState(p, 'goal-main');
  });
  assert.deepEqual(comparable(restored), comparable(source));
  const { cursor: targetCursor, ...targetSnapshot } = f.edit(1, (_app, db) => db.snapshot(p));
  const { cursor: sourceCursor, ...sourceSnapshot } = f.edit(0, (_app, db) => db.snapshot(p));
  assert.equal(sourceCursor, targetCursor + 1, 'the source-only artifact event is not replicated');
  assert.deepEqual(comparable(targetSnapshot), comparable(sourceSnapshot));
  assert.ok(JSON.stringify(f.events[0]!.value).includes('@event:'));
  const n = f.events.length; await f.run(); assert.equal(f.events.length, n, 'no replication echo');
  assert.equal(f.replica(1, r => r.counts().pending), 0);
});

type GoalWire = { spaceId: string; facts: Record<string, ProjectReplicaRows>; journal: { events: Array<Record<string, string>> } };
test('GSYNC-05 invalid journal anchors, cross-project rows and decisions fail atomically even during explicit resolution', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p)); await f.enable();
  f.edit(1, (_app, db) => db.appendEvent({ eventId: 'unrelated-target', projectId: p, actorId: 'alice', type: 'artifact.local_note', objectType: 'artifact', objectId: 'private', reason: '本机记录', payload: {}, at: new Date().toISOString() }));
  const before = f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) }));
  const edits: Array<(w: GoalWire) => void> = [
    w => { w.spaceId = 'foreign'; },
    w => { w.facts.goals!.goals![0]!.project_id = 'foreign-project'; },
    w => { w.facts.goals!.goal_work_events![0]!.journal_seq = '@event:missing'; },
    w => { w.facts.goals!.goal_work_events![0]!.journal_seq = '@start'; },
    w => { w.facts.governance!.goal_event_trusted_decisions![0]!.authority_source = 'runtime_dialogue'; },
    w => { w.facts.goals!.goal_event_applied_decisions![0]!.governance_decision_id = 'missing'; },
    w => { w.facts.goals!.goals![0]!.in_scope_json = '{invalid'; },
  ];
  let revision = f.events[0]!.revision;
  for (const edit of edits) {
    const value = structuredClone(f.events[0]!.value) as GoalWire; edit(value);
    const bad = { ...f.events[0]!, value, revision: ++revision, operationId: `bad-${revision}` };
    f.replica(1, r => r.receive(bad));
    assert.equal(f.replica(1, r => r.conflicts().length), 1);
    assert.throws(() => f.replica(1, r => r.resolve(bad.key, 'remote')));
    assert.deepEqual(f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) })), before);
  }
  const good = { ...f.events[0]!, revision: ++revision, operationId: 'valid-recovery' };
  f.replica(1, r => { r.receive(good); r.resolve(good.key, 'remote'); });
  assert.deepEqual(comparable(f.edit(1, app => app.goalEvents.readState(p, 'goal-main'))), comparable(before.state));
  assert.ok(f.edit(1, (_app, db) => db.readEventsDescending(p).some(e => e.event_id === 'unrelated-target')));
  assert.equal(f.replica(1, r => r.next()), null);
});

test('GSYNC-06 policy is opt-in, disabling retains data, foreign accounts and local spaces are refused', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p));
  await f.clients[0]!.run(); assert.equal(f.events.length, 0);
  await f.enable(); const n = f.events.length;
  await f.clients[0]!.save({ ...f.clients[0]!.policy(), selections: [] });
  f.edit(0, app => app.goalEvents.createIntent({ project_id: p, goal_id: 'offline-only', title: '暂停后修改', actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: 'pause' }));
  await f.run(); assert.equal(f.events.length, n);
  assert.ok(f.edit(1, app => app.goalQueries.getGoal(p, 'goal-main')));
  assert.throws(() => f.edit(1, app => app.goalQueries.getGoal(p, 'offline-only')), { code: 'goal.not_found' });
  assert.throws(() => createPersonalGoalRegistration(f.homes[0]!, f.space.spaceId, 'bob', () => {}, withMolisWorkProjectCatalog, selection));
  const local = join(f.homes[0]!, 'local-test'); ensureStorageSpace(local);
  assert.throws(() => createPersonalGoalRegistration(local, f.space.spaceId, 'alice', () => {}, withMolisWorkProjectCatalog, selection));
});

test('GSYNC-04 GSYNC-05 offline archive/trash, lost receipts, restart and explicit concurrent resolution', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p)); await f.enable();
  f.offline();
  f.edit(0, app => app.goals.lifecycle.setArchived(p, { goal_id: 'goal-main', archived: true, reason: '离线归档' }, { actor_id: 'alice', idempotency_key: 'archive' }));
  await f.clients[0]!.run(); assert.match(f.clients[0]!.status().error!, /test_offline/);
  f.online(); f.drop(); await f.clients[0]!.run(); await f.run();
  assert.equal(f.edit(1, app => app.goalQueries.getGoal(p, 'goal-main')!.archived_at !== null), true);
  for (const i of [0, 1]) f.edit(i, app => app.goalEvents.createIntent({ project_id: p, goal_id: `extra-${i}`, title: `并发 ${i}`, actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: `extra-${i}` }));
  await f.run(); const conflict = f.replica(1, r => r.conflicts()[0]); assert.ok(conflict);
  assert.ok(f.edit(1, app => app.goalQueries.getGoal(p, 'extra-1')));
  await f.clients[1]!.resolve(syncNamespace(selection), conflict.key, 'local'); await f.run();
  assert.ok(f.edit(0, app => app.goalQueries.getGoal(p, 'extra-1')));
  f.edit(0, app => app.goals.lifecycle.setTrashed(p, { goal_id: 'extra-1', trashed: true, reason: '放入回收站' }, { actor_id: 'alice', idempotency_key: 'trash' }));
  await f.run(); assert.equal(f.edit(1, app => app.goals.lifecycle.listTrashed(p).some(g => g.goal_id === 'extra-1')), true);
});

test('GSYNC-05 malformed facts and foreign space roll back all Goal facts; revoked authority cannot read an outbox', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p)); await f.enable();
  const original = f.events[0]!;
  const before = f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) }));
  const wire = structuredClone(original.value) as { spaceId: string; facts: { goals: { goals: Array<Record<string, unknown>> } } };
  wire.facts.goals.goals[0]!.injected = 'unknown field';
  f.replica(1, r => r.receive({ ...original, operationId: 'malformed', value: wire, revision: original.revision + 1 }));
  assert.match(f.replica(1, r => r.conflicts()[0]!.reason), /replica_columns_invalid/);
  assert.deepEqual(f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) })), before);
  const foreign = structuredClone(original.value) as { spaceId: string }; foreign.spaceId = 'another-account';
  f.replica(1, r => r.receive({ ...original, operationId: 'foreign', value: foreign, revision: original.revision + 2 }));
  assert.deepEqual(f.edit(1, app => app.goalEvents.readState(p, 'goal-main')), before.state);
  f.revoke(); assert.throws(() => f.replica(0, r => r.next()), /test_revoked/);
});
