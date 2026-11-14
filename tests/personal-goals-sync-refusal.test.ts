import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,work,comparable} from './fixtures/personal-goals-sync.js';
import {goalWire} from './fixtures/runtime-goal-sync.js';
import type {ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';

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
    // RISK-01: a concern's cited objects arrive only as Goals writes them (a JSON list of at most 8 nonempty {kind, id}).
    ...['not json', '{"kind":"risk","id":"r"}', JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ kind: 'risk', id: `r${i}` }))),
      '[{"kind":"","id":"r"}]', '[{"kind":"risk","id":"r","title":"copied"}]'].map(cited => (w: GoalWire) => { citeConcern(w, cited); }),
  ];
  let revision = f.events[0]!.revision;
  for (const edit of edits) {
    const value = structuredClone(f.events[0]!.value) ; edit(goalWire(value) as GoalWire);
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

test('GSYNC-05 malformed facts and foreign space roll back all Goal facts; revoked authority cannot read an outbox', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p)); await f.enable();
  const original = f.events[0]!;
  const before = f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) }));
  const wire = structuredClone(original.value);
  (goalWire(wire) as {facts:{goals:{goals:Array<Record<string,unknown>>}}}).facts.goals.goals[0]!.injected = 'unknown field';
  f.replica(1, r => r.receive({ ...original, operationId: 'malformed', value: wire, revision: original.revision + 1 }));
  assert.match(f.replica(1, r => r.conflicts()[0]!.reason), /replica_columns_invalid/);
  assert.deepEqual(f.edit(1, (app, db) => ({ state: app.goalEvents.readState(p, 'goal-main'), events: db.readEventsDescending(p) })), before);
  const foreign = structuredClone(original.value); (goalWire(foreign) as {spaceId:string}).spaceId = 'another-account';
  f.replica(1, r => r.receive({ ...original, operationId: 'foreign', value: foreign, revision: original.revision + 2 }));
  assert.deepEqual(f.edit(1, app => app.goalEvents.readState(p, 'goal-main')), before.state);
  f.revoke(); assert.throws(() => f.replica(0, r => r.next()), /test_revoked/);
});

/** A concern on the wire's first event, complete but for what it cites. */
function citeConcern(w: GoalWire, cited: string): void {
  const goals = w.facts.goals!, event = goals.goal_work_events![0]!, at = String(event.created_at);
  (goals.goal_event_concerns ??= []).push({ concern_id: 'concern-cited', project_id: goals.goals![0]!.project_id, goal_id: event.goal_id, event_id: event.event_id,
    title: '供应商', statement: '可能延期', scope_json: '{}', blocks_closure: 0, status: 'open', resolution_reason: null, resolution_event_id: null,
    cited_decision_id: null, previous_status: null, created_at: at, updated_at: at, cited_subjects_json: cited });
}
