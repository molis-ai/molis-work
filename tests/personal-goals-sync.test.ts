import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, work, comparable, approvalSelections } from './fixtures/personal-goals-sync.js';
import { boardSnapshot } from './fixtures/goal-application.js';
import { goalSyncSelection as selection, runtimeGoalSync } from './fixtures/runtime-goal-sync.js';
import { createContextLedger } from '@molis-ai/molis-work-module-context-ledger';
import { syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { projectApprovalRules, projectReviewDecisions } from '@molis-ai/molis-work-service-project-approvals';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';

test('GSYNC-01 GSYNC-02 GSYNC-03 GSYNC-04 restore completed Goals, graph, history, proposal and precise references (since batch 44 the guidance travels in the platform collection)', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, (app, db) => {
    work(app, p);
    app.goalEvents.createIntent({ project_id: p, goal_id: 'child', title: '子目标', actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: 'child' });
    app.goals.commands.addRelation(p, { from_goal_id: 'child', to_goal_id: 'goal-main', type: 'part_of', reason: '包含' }, { actor_id: 'alice', idempotency_key: 'relation' });
    app.setActiveGoal(p, { goal_id: 'child', reason: '定位' }, { actor_id: 'alice', idempotency_key: 'active' });
    app.saveProjectApproval(p, 'alice', true, 'Reviewed project rule');
    app.goalTreeSubmission.submitGoalTreeProposal({ project_id: p, root_goal_id: 'goal-main', actor_id: 'runtime-1', summary: '待确认结构', idempotency_key: 'proposal', items: [{ item_id: 'proposed-child', kind: 'goal', operation: 'create', payload: { goal_id: 'proposed', title: '未执行的提案', outcome: '用户决定后创建' }, source_refs: ['conversation://plan'], reason: '候选', confidence: 1, affected_objects: [{ object_type: 'goal', object_id: 'proposed' }] }] });
    app.goalInputs.register({ binding_id: 'input', project_id: p, goal_id: 'goal-main', input_name: '资料', source_type: 'feed_item', source_ref: 'feed-item:missing-feed', snapshot_digest: null, state: 'confirmed', reason: '引用', created_by: 'alice', created_at: new Date().toISOString() });
    const ledger = createContextLedger(db.db, { authorize: () => true, initializeSchema: false }), access = { actor_id: 'alice', scope: { kind: 'personal' as const, id: p } };
    ledger.commands.put(access, { key: 'output', type: 'goal.output', source: { module: 'plugins', plugin_id: 'io.molis.work.goals', object_type: 'goal', id: 'goal-main', version: null, scope: access.scope }, target: { module: 'artifacts', id: 'not-downloaded', version: 3, scope: access.scope }, cause: '交付' });
    ledger.commands.remove(access, 'output', '移除');
    db.appendEvent({ eventId: 'local-only-source', projectId: p, actorId: 'alice', type: 'artifact.local_note', objectType: 'artifact', objectId: 'private', reason: 'not Goal', payload: {}, at: new Date().toISOString() });
  });
  assert.equal(f.events.length, 0);
  await f.clients[0]!.save({...f.clients[0]!.policy(),selections:approvalSelections});
  assert.ok(f.replica(0,replica=>replica.counts().pending)>0,'real user facts always create a local upload');
  await f.run();
  const conflicts = f.clients[1]!.status().collections[0]!.conflicts;
  assert.deepEqual(conflicts, []);
  const source = f.edit(0, app => app.goalEvents.readState(p, 'goal-main'));
  const restored = f.edit(1, (app, db) => {
    const applied = app.goalEvents.readState(p, 'goal-main').applied_decisions[0]!;
    assert.equal(projectReviewDecisions(db.db, p).findCommitted(applied.governance_decision_id)?.actor_id, 'alice');
    assert.equal(projectApprovalRules(db.db, p).read().rules[0]?.requires_person, true);
    assert.equal(app.goalInputs.list(p)[0]!.source_ref, 'feed-item:missing-feed');
    assert.equal(boardSnapshot(db,p).goals.some(g => g.goal_id === 'proposed'), false, 'receiving a proposal does not execute it');
    assert.equal(db.readEventsDescending(p).some(e => e.event_id === 'local-only-source'), false);
    const ledger = createContextLedger(db.db, { authorize: () => true, initializeSchema: false });
    assert.deepEqual(ledger.query.history({ actor_id: 'alice', scope: { kind: 'personal', id: p } }, 'output').map(e => [e.revision, e.state]), [[1, 'active'], [2, 'removed']]);
    return app.goalEvents.readState(p, 'goal-main');
  });
  assert.deepEqual(comparable(restored), comparable(source));
  const { cursor: targetCursor, ...targetSnapshot } = f.edit(1, (_app, db) => boardSnapshot(db,p));
  const { cursor: sourceCursor, ...sourceSnapshot } = f.edit(0, (_app, db) => boardSnapshot(db,p));
  assert.ok(sourceCursor > 0 && targetCursor > 0);
  const sourceEvents=f.edit(0,(_app,db)=>db.readEventsDescending(p).filter(e=>e.type.startsWith(selection.plugin_id+':')).map(e=>e.event_id).sort());
  const targetEvents=f.edit(1,(_app,db)=>db.readEventsDescending(p).map(e=>e.event_id).sort());
  assert.deepEqual(targetEvents,sourceEvents,'all Goal journal events, and no foreign owner history, are restored');
  assert.deepEqual(comparable(targetSnapshot), comparable(sourceSnapshot));
  assert.ok(JSON.stringify(f.events[0]!.value).includes('@event:'));
  assert.ok(f.approvalEvents.length > 0);
  const n = f.events.length; await f.run(); assert.equal(f.events.length, n, 'no replication echo');
  assert.equal(f.replica(1, r => r.counts().pending), 0);
});

test('GSYNC-06 policy is opt-in, disabling retains data, foreign accounts and local spaces are refused', async t => {
  const f = await fixture(t);
  const p = f.project.project_id;
  f.edit(0, app => work(app, p));
  await f.clients[0]!.run();
  assert.equal(f.events.length, 0);
  await f.enable();
  const n = f.events.length;
  await f.clients[0]!.save({ ...f.clients[0]!.policy(), selections: [] });
  f.edit(0, app => app.goalEvents.createIntent({ project_id: p, goal_id: 'offline-only', title: '暂停后修改', actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: 'pause' }));
  await f.run();
  assert.equal(f.events.length, n);
  assert.ok(f.edit(1, app => app.goalQueries.getGoal(p, 'goal-main')));
  assert.throws(() => f.edit(1, app => app.goalQueries.getGoal(p, 'offline-only')), { code: 'goals.not_found' });
  assert.throws(() => runtimeGoalSync(f.homes[0]!, f.space.spaceId, 'bob', () => {}));
  const local = join(f.homes[0]!, 'local-test');
  ensureStorageSpace(local);
  assert.throws(() => runtimeGoalSync(local, f.space.spaceId, 'alice', () => {}));
});

test('GSYNC-04 GSYNC-05 offline archive/trash, lost receipts, restart and explicit concurrent resolution', async t => {
  const f = await fixture(t);
  const p = f.project.project_id;
  f.edit(0, app => work(app, p));
  await f.enable();
  f.offline();
  f.edit(0, app => app.goals.lifecycle.setArchived(p, { goal_id: 'goal-main', archived: true, reason: '离线归档' }, { actor_id: 'alice', idempotency_key: 'archive' }));
  await f.clients[0]!.run();
  assert.match(f.clients[0]!.status().error!, /test_offline/);
  f.online();
  f.drop();
  await f.clients[0]!.run();
  // QRF-10: the server applied this operation, but the sender did not receive its receipt.
  const frozen = f.replica(0, replica => replica.next());
  assert.ok(frozen);
  assert.equal(f.events.filter(event => event.operationId === frozen.operationId).length, 1);
  f.restart(0);
  assert.equal(f.replica(0, replica => replica.next())?.operationId, frozen.operationId);
  await f.run();
  const delivered = f.events.length;
  await f.run();
  assert.equal(f.events.length, delivered);
  assert.equal(f.events.filter(event => event.operationId === frozen.operationId).length, 1);
  assert.equal(f.edit(1, app => app.goalQueries.getGoal(p, 'goal-main')!.archived_at !== null), true);
  for (const i of [0, 1]) {
    f.edit(i, app => app.goalEvents.createIntent({ project_id: p, goal_id: `extra-${i}`, title: `并发 ${i}`, actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: `extra-${i}` }));
  }
  await f.run();
  const conflict = f.replica(1, r => r.conflicts()[0]);
  assert.ok(conflict);
  assert.ok(f.edit(1, app => app.goalQueries.getGoal(p, 'extra-1')));
  await f.clients[1]!.resolve(syncNamespace(selection), conflict.key, 'local');
  await f.run();
  assert.ok(f.edit(0, app => app.goalQueries.getGoal(p, 'extra-1')));
  f.edit(0, app => app.goals.lifecycle.setTrashed(p, { goal_id: 'extra-1', trashed: true, reason: '放入回收站' }, { actor_id: 'alice', idempotency_key: 'trash' }));
  await f.run();
  assert.equal(f.edit(1, app => app.goals.lifecycle.listTrashed(p).some(g => g.goal_id === 'extra-1')), true);
});
