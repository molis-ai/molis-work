import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,work} from './fixtures/personal-goals-sync.js';
import {join} from 'node:path';
import {runtimeGoalSync} from './fixtures/runtime-goal-sync.js';
import {ensureStorageSpace} from '@molis-ai/molis-work-storage';

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
