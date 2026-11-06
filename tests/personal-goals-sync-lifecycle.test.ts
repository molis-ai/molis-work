import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,work} from './fixtures/personal-goals-sync.js';
import {join} from 'node:path';
import {runtimeGoalSync,goalSyncSelection as selection} from './fixtures/runtime-goal-sync.js';
import {ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {syncNamespace} from '@molis-ai/molis-work-module-sync-replication';

test('GSYNC-06 policy is opt-in, disabling retains data, foreign accounts and local spaces are refused', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p));
  await f.clients[0]!.run(); assert.equal(f.events.length, 0);
  await f.enable(); const n = f.events.length;
  await f.clients[0]!.save({ ...f.clients[0]!.policy(), selections: [] });
  f.edit(0, app => app.goalEvents.createIntent({ project_id: p, goal_id: 'offline-only', title: '暂停后修改', actor_id: 'runtime-1', actor_kind: 'runtime', idempotency_key: 'pause' }));
  await f.run(); assert.equal(f.events.length, n);
  assert.ok(f.edit(1, app => app.goalQueries.getGoal(p, 'goal-main')));
  assert.throws(() => f.edit(1, app => app.goalQueries.getGoal(p, 'offline-only')), { code: 'goals.not_found' });
  assert.throws(() => runtimeGoalSync(f.homes[0]!, f.space.spaceId, 'bob', () => {}));
  const local = join(f.homes[0]!, 'local-test'); ensureStorageSpace(local);
  assert.throws(() => runtimeGoalSync(local, f.space.spaceId, 'alice', () => {}));
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
