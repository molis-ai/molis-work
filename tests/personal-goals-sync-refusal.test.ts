import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {fixture,work,comparable} from './fixtures/personal-goals-sync.js';
import {goalWire} from './fixtures/runtime-goal-sync.js';
import type {ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { MolisWorkServer } from '@molis-ai/molis-work-app-desktop';
import { molisWorkHostProjectReference } from '@molis-ai/molis-work-app-local-host';
import { goalsActions, goalsManifest } from '@molis-ai/molis-work-plugin-goals';
import type { ReviewRequest } from '@molis-ai/molis-work-contracts/platform/ui';
import type { ProjectTrustedDecision } from '@molis-ai/molis-work-contracts/services/project-approvals';
import { mcpGoalReviews } from './fixtures/project-review-entry.js';

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
    w => { w.facts.goals!.goal_event_applied_decisions![0]!.authority_source = 'runtime_dialogue'; },
    w => { w.facts.goals!.goals![0]!.in_scope_json = '{invalid'; },
    // RISK-01: a concern's cited objects arrive only as Goals writes them (a JSON list of at most 8 distinct, trimmed, nonempty {kind, id}).
    ...['not json', '{"kind":"risk","id":"r"}', JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ kind: 'risk', id: `r${i}` }))),
      '[{"kind":"","id":"r"}]', '[{"kind":"risk","id":"r","title":"copied"}]', '[{"kind":" risk","id":"r"}]',
      '[{"kind":"risk","id":"r "}]', '[{"kind":"risk","id":"r"},{"kind":"risk","id":"r"}]'].map(cited => (w: GoalWire) => { citeConcern(w, cited); }),
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

test('APR-19 a received Goal outcome waits for its original decision before replacing any local facts', async t => {
  const f = await fixture(t), p = f.project.project_id;
  f.edit(0, app => work(app, p));
  await f.enable();
  const valid = f.events[0]!;
  const decision = f.approvalEvents[0]!;
  const original = f.edit(1, app => app.goalEvents.readState(p, 'goal-main'));
  f.edit(1, (_app, store) => {
    // The receiving test peer starts before its approvals stream has reached this project.
    store.db.exec('DELETE FROM project_review_decisions');
  });
  const draft = { ...valid, operationId: 'incoming-goal-before-approval', revision: valid.revision + 1 };
  f.replica(1, replica => replica.receive(draft));
  assert.equal(f.replica(1, replica => replica.conflicts()[0]?.waiting), true);
  assert.deepEqual(f.edit(1, app => app.goalEvents.readState(p, 'goal-main')), original);
  f.approvalReplica(1, replica => replica.receive({ ...decision, operationId: 'delayed-approval', revision: decision.revision + 1 }));
  f.replica(1, replica => replica.retryWaiting?.());
  assert.deepEqual(f.replica(1, replica => replica.conflicts()), []);
  assert.deepEqual(comparable(f.edit(1, app => app.goalEvents.readState(p, 'goal-main'))), comparable(original));
});

test('APR-19 Goal sync preserves the exact recorded outcome across invalid snapshots and explicit resolution', async t => {
  const f = await fixture(t), p = f.project.project_id;
  const goal = 'owner-sync-goal', requirement = 'owner-sync-requirement';
  const reference = molisWorkHostProjectReference({ projectId: p, databasePath: f.project.database_path });
  const actions = f.host.actionClient(reference), caller = await f.host.localPersonContext(reference);
  await actions.invoke(caller, goalsActions.create, { goal_id: goal, title: 'Compare the delivered result across Homes',
    idempotency_key: 'sync-owner-new-goal', requirements: [{ requirement_id: requirement, statement: 'Person compared the result', human_decision_required: true }] });
  const { decision_request } = await actions.invoke(caller, goalsActions.requestDecision, { goal_id: goal, idempotency_key: 'sync-owner-request',
    question: 'Did the result meet the requirement?', options: [{ option_id: 'yes', label: 'Met', impact: 'Record the conclusion' },
      { option_id: 'no', label: 'More work', impact: 'Keep working' }], purpose: 'requirement_acceptance',
    scope: { requirement_ids: [requirement] },
  }) as { decision_request: { request_id: string } };
  const server = new MolisWorkServer('management', null, null, f.host);
  t.after(() => server.close());
  const reviews = mcpGoalReviews(server, p, f.project.database_path);
  const review = await reviews.prepare(goalsActions.decide, { goal_id: goal, request_id: decision_request.request_id,
    idempotency_key: 'sync-owner-decision', selected_option_id: 'yes', conclusion: 'Compared the delivered result',
    scope: { requirement_ids: [requirement] }, effects: [{ kind: 'accept_requirements' }] });
  const { record } = await reviews.submit(review);
  assert.match(record.outcome_digest ?? '', /^sha256:[a-f0-9]{64}$/u);
  await f.enable();
  const valid = f.events[0]!;
  const snapshot = () => f.edit(1, (app, store) => ({
    state: app.goalEvents.readState(p, goal),
    conclusions: store.db.prepare<[], { verdict: string }>('SELECT * FROM goal_event_requirement_conclusions ORDER BY requirement_id').all(),
    approvals: store.db.prepare<[], { record_json: string }>('SELECT record_json FROM project_review_decisions ORDER BY decision_id').all(),
  }));
  const before = snapshot();
  assert.equal(before.approvals.length, 1);
  assert.deepEqual(JSON.parse(String(before.approvals[0]?.record_json)), record);
  assert.equal(before.conclusions[0]?.verdict, 'accepted');
  let revision = valid.revision;
  for (const edit of [
    (goals: ProjectReplicaRows) => { goals.goal_event_applied_decisions![0]!.commitment_json = '{"outcome":"changed","requirements":[]}'; },
    (goals: ProjectReplicaRows) => { goals.goal_event_requirement_conclusions![0]!.verdict = 'rejected'; },
    (goals: ProjectReplicaRows) => {
      goals.goal_event_requirement_conclusions!.splice(0);
      goals.goal_event_applied_decisions!.splice(0);
    },
  ]) {
    const value = structuredClone(valid.value);
    edit((goalWire(value) as GoalWire).facts.goals!);
    const invalid = { ...valid, value, revision: ++revision, operationId: `approval-outcome-${revision}` };
    f.replica(1, replica => replica.receive(invalid));
    assert.deepEqual(f.replica(1, replica => replica.conflicts().map(row => row.waiting)), [false]);
    assert.throws(() => f.replica(1, replica => replica.resolve(invalid.key, 'remote')));
    assert.deepEqual(snapshot(), before);
  }
  const recovery = { ...valid, revision: ++revision, operationId: 'same-approval-outcome' };
  f.replica(1, replica => { replica.receive(recovery); replica.resolve(recovery.key, 'remote'); });
  const after = snapshot();
  assert.deepEqual(after.approvals, before.approvals);
  assert.deepEqual(comparable(after.state), comparable(before.state));
  assert.deepEqual(f.replica(1, replica => replica.conflicts()), []);
});

async function confirmTree(t: TestContext, f: Awaited<ReturnType<typeof fixture>>) {
  const p = f.project.project_id, databasePath = f.project.database_path;
  const reference = molisWorkHostProjectReference({ projectId: p, databasePath });
  const actions = f.host.actionClient(reference), caller = await f.host.localPersonContext(reference);
  const { proposal } = await actions.invoke(caller, goalsActions.treeSubmit, {
    summary: 'Create a verified Goal on both devices', idempotency_key: 'tree-sync-source-proposal',
    items: [{ item_id: 'tree-sync-item', kind: 'goal', operation: 'create', payload: { goal_id: 'synced-child', title: 'Synced child', outcome: 'Visible in both Homes' },
      source_refs: ['project:sync-test'], reason: 'The reviewer approves this exact item', confidence: 1 }],
  }) as { proposal: { proposal_id: string } };
  const server = new MolisWorkServer('management', null, null, f.host);
  t.after(() => server.close());
  const read = JSON.parse(await server.callTool('molis_work_v1_review_request', {
    project_id: p, database_path: databasePath, request_id: proposal.proposal_id,
    action: { capability_id: goalsActions.treeDecide.capability_id, version: goalsActions.treeDecide.version, provider_id: goalsManifest.plugin_id },
  })) as ReviewRequest;
  const approved = JSON.parse(await server.callTool('molis_work_v1_review_decide', {
    project_id: p, database_path: databasePath, reference: read.reference, choice_id: 'confirm', request_key: 'tree-sync-approval',
  })) as { result: { applied_item_ids: string[] }; record: ProjectTrustedDecision };
  assert.deepEqual(approved.result.applied_item_ids, ['tree-sync-item']);
  assert.match(approved.record.outcome_digest ?? '', /^sha256:[a-f0-9]{64}$/u);
  return { proposal, record: approved.record };
}

test('APR-19 a Goal Tree decision from the management entry preserves exact owner effects on another Home', async t => {
  const f = await fixture(t), p = f.project.project_id;
  const { proposal, record } = await confirmTree(t, f);
  await f.enable(true);
  const current = f.events.at(-1)!;
  assert.ok(current);
  const snapshot = (i: number) => f.edit(i, (app, store) => ({
    proposal: app.governance.query.getGoalTreeProposal(p, proposal.proposal_id),
    child: app.goalsQuery.getGoal(p, 'synced-child'),
    approvals: store.db.prepare('SELECT record_json FROM project_review_decisions WHERE decision_id=?').all(record.decision_id),
  }));
  const empty = snapshot(1);
  assert.equal(empty.proposal, null);
  const missingEffect = structuredClone(current.value);
  (goalWire(missingEffect) as GoalWire).facts.governance!.goal_tree_item_effects!.splice(0);
  const missing = { ...current, value: missingEffect, revision: current.revision + 1, operationId: 'first-receipt-missing-tree-effect' };
  f.replica(1, replica => replica.receive(missing));
  assert.equal(f.replica(1, replica => replica.conflicts()[0]?.waiting), false);
  assert.throws(() => f.replica(1, replica => replica.resolve(current.key, 'remote')));
  assert.deepEqual(snapshot(1), empty);
  const recovered = { ...current, revision: missing.revision + 1, operationId: 'first-receipt-exact-tree-effect' };
  f.replica(1, replica => { replica.receive(recovered); replica.resolve(recovered.key, 'remote'); });
  assert.deepEqual(f.replica(1, replica => replica.conflicts()), []);
  const before = snapshot(1);
  assert.equal(before.child?.title, 'Synced child');
  assert.equal(before.proposal?.decisions[0]?.authority_source, 'management');
  assert.equal(before.approvals.length, 1);
  assert.deepEqual(comparable(before), comparable(snapshot(0)));
  const effects = (wire: unknown) => (goalWire(wire) as GoalWire).facts.governance!.goal_tree_item_effects!;
  assert.equal(effects(current.value)[0]?.approval_id, record.decision_id);
  let revision = recovered.revision;
  for (const edit of [
    (rows: ProjectReplicaRows) => { rows.goal_tree_item_effects![0]!.materialized_objects_json = '[]'; },
    (rows: ProjectReplicaRows) => { rows.goal_tree_proposal_items![0]!.materialized_objects_json = '[]'; },
    (rows: ProjectReplicaRows) => { rows.goal_tree_item_effects!.splice(0); },
  ]) {
    const value = structuredClone(current.value);
    edit((goalWire(value) as GoalWire).facts.governance!);
    const invalid = { ...current, value, revision: ++revision, operationId: `invalid-tree-effect-${revision}` };
    f.replica(1, replica => replica.receive(invalid));
    assert.deepEqual(f.replica(1, replica => replica.conflicts().map(row => row.waiting)), [false]);
    assert.throws(() => f.replica(1, replica => replica.resolve(invalid.key, 'remote')));
    assert.deepEqual(snapshot(1), before);
  }
  const recovery = { ...current, revision: ++revision, operationId: 'original-tree-effect' };
  f.replica(1, replica => { replica.receive(recovery); replica.resolve(recovery.key, 'remote'); });
  assert.deepEqual(f.replica(1, replica => replica.conflicts()), []);
  assert.deepEqual(comparable(snapshot(1)), comparable(before));
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
