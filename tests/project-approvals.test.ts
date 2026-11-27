import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { TRUSTED_REVIEW_OWNER_INPUT_SCHEMA, type ProjectApprovalRuleScope, type ProjectTrustedDecision, type TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { ActionService, withTrustedDecision } from "@molis-ai/molis-work-kernel";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { approvalRequiresPerson, projectApprovalReplica, projectApprovalRules, projectReviewDecisions, PROJECT_APPROVALS_SCHEMA_SQL } from "@molis-ai/molis-work-service-project-approvals";
import { PROJECT_ROOT_SCHEMA_SQL } from "@molis-ai/molis-work-module-projects";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";

const at = "2026-11-14T09:00:00.000Z";
const person = { actor_id: "actual-person", source: { kind: "person", actor_id: "actual-person",
  entry: { source: "web", conversation_ref: "web:approvals", message_ref: "web:click" } } } as const satisfies
  Pick<ProjectTrustedDecision, "actor_id" | "source">;
const original = { kind: "trusted-decision", project_id: "p1", scope: "project", plugin_id: "example.notes",
  install_id: "current", installation_generation: "generation-2" } as const;
const request: TrustedReviewCommand = { reference: { owner: original, id: "proposal-choice-1", version: "v4" },
  choice_id: "accept", request_key: "actual-click" };
const frozen = { title: "Only these words", version: 4 };
const coverage = { publisher_signature: "fixture-note-publisher", review: {
  target: { owner: { kind: "plugin", scope: "project", project_id: "p1", plugin_id: original.plugin_id,
    install_id: original.install_id, installation_generation: original.installation_generation, provider_id: "note-provider" },
  subject: { kind: "note", id: "n1" }, version: "4" }, requirements: [],
} } satisfies Pick<ProjectTrustedDecision, "publisher_signature" | "review">;
const current = { beforeEffect: async () => undefined, assertCurrent() {} };

function projectLibrary(t: TestContext) {
  const storage = new LocalSqliteStorage(":memory:");
  t.after(() => storage.close());
  storage.db.exec(PROJECT_ROOT_SCHEMA_SQL + PROJECT_APPROVALS_SCHEMA_SQL);
  storage.db.prepare("INSERT INTO project_root(project_id, created_at) VALUES (?, ?),(?, ?)").run("p1", at, "p2", at);
  return storage.db;
}

test("APR-19 an empty project's rule revision cannot be spent in another empty project", async t => {
  const db = projectLibrary(t);
  const first = projectApprovalRules(db, "p1"), second = projectApprovalRules(db, "p2");
  assert.notEqual(first.read().revision, second.read().revision);
  await assert.rejects(second.change({ kind: "set", expected_revision: first.read().revision,
    scope: { kind: "project_default" }, requires_person: true, reason: "Original project only" }, person.actor_id, at, current), { code: "actions.conflict" });
  assert.deepEqual(second.read().rules, []);
});

test("APR-19 platform sync merges the original decisions and rule revisions, keeps local history and rejects changed immutable records", async t => {
  const from = projectLibrary(t), to = projectLibrary(t);
  const sender = projectApprovalReplica(from, "p1", "same-space", () => undefined);
  let revoke = false;
  const receiver = projectApprovalReplica(to, "p1", "same-space", () => {
    if (revoke) throw new ActionError("actions.forbidden", "sync selection revoked");
  });
  const source = projectReviewDecisions(from, "p1"), copy = projectReviewDecisions(to, "p1");
  const originalRecord = from.transaction(() => source.commit(request, person, frozen, coverage, at, current.assertCurrent).record).immediate();
  const rules = projectApprovalRules(from, "p1");
  const saved = await rules.change({ kind: "set", expected_revision: rules.read().revision, scope: { kind: "project_default" },
    requires_person: true, reason: "require confirmation" }, person.actor_id, at, current);
  const first = sender.next()!;
  assert.ok(first);
  const sent = { ...first, revision: 1 };
  receiver.receive(sent);
  receiver.receive(sent, { retry: true });
  sender.acknowledge(first.key, first.operationId, 1);
  assert.deepEqual(copy.read(originalRecord.decision_id), originalRecord);
  assert.equal(approvalRequiresPerson(projectApprovalRules(to, "p1").read()), true);
  await rules.change({ kind: "withdraw", expected_revision: saved.revision, id: saved.rules[0]!.id, reason: "ended" }, person.actor_id, at, current);
  const second = sender.next()!;
  revoke = true;
  assert.throws(() => receiver.receive({ ...second, revision: 2 }), { code: "actions.forbidden" });
  assert.equal(receiver.cursor(), 1);
  revoke = false;
  receiver.receive({ ...second, revision: 2 });
  assert.equal(approvalRequiresPerson(projectApprovalRules(to, "p1").read()), false);
  assert.equal(projectApprovalRules(to, "p1").read().rules[0]?.change_reason, "ended");
  receiver.receive({ ...second, base: 2, revision: 3, operationId: "omit",
    value: { space_id: "same-space", project_id: "p1", decisions: [], rules: [] } });
  assert.deepEqual(copy.read(originalRecord.decision_id), originalRecord);
  assert.equal(projectApprovalRules(to, "p1").read().rules[0]?.state, "withdrawn");
  const altered = structuredClone(first.value) as { decisions: Array<{ record_json: string }>; rules: unknown[] };
  const row = altered.decisions[0]!;
  row.record_json = JSON.stringify({ ...JSON.parse(row.record_json), decision: "one other result" });
  receiver.receive({ ...second, base: 3, revision: 4, operationId: "changed", value: altered });
  assert.equal(receiver.conflicts().length, 1);
  assert.deepEqual(copy.read(originalRecord.decision_id), originalRecord);
  assert.equal(projectApprovalRules(to, "p1").read().rules[0]?.state, "withdrawn");
});

test("APR-18/19: a decision joins the business write, rolls back on a late refusal, and replays only the original command", t => {
  const db = projectLibrary(t), p1 = projectReviewDecisions(db, "p1"), p2 = projectReviewDecisions(db, "p2");
  db.exec("CREATE TABLE fixture_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
  const note = () => db.prepare("SELECT title FROM fixture_notes").all();
  const count = () => db.prepare("SELECT COUNT(*) AS n FROM project_review_decisions").get();
  assert.throws(() => p1.commit(request, person, frozen, coverage, at, current.assertCurrent), { code: "actions.forbidden" });
  assert.throws(() => db.transaction(() => {
    p1.commit(request, person, frozen, coverage, at, current.assertCurrent);
    db.prepare("INSERT INTO fixture_notes VALUES (?, ?)").run("n1", frozen.title);
    throw new ActionError("actions.expired", "entry revoked before commit");
  }).immediate(), { code: "actions.expired" });
  assert.deepEqual(note(), []);
  assert.deepEqual(count(), { n: 0 });

  const saved = db.transaction(() => {
    const result = p1.commit(request, person, frozen, coverage, at, current.assertCurrent);
    db.prepare("INSERT INTO fixture_notes VALUES (?, ?)").run("n1", frozen.title);
    return result.record;
  }).immediate();
  assert.deepEqual(p1.read(saved.decision_id), saved);
  assert.equal(p2.read(saved.decision_id), null);
  assert.deepEqual(p1.sameRequest(request, person.actor_id, frozen), saved);
  for (const changed of [
    { ...request, choice_id: "return" },
    { ...request, request_key: "second-click" },
    { ...request, reference: { ...request.reference, version: "v5" } },
    { ...request, reference: { ...request.reference, owner: { ...original, install_id: "later" } } },
  ]) assert.throws(() => p1.sameRequest(changed, person.actor_id, frozen), { code: "actions.conflict" });
  assert.throws(() => p1.sameRequest(request, person.actor_id, { ...frozen, title: "changed" }), { code: "actions.conflict" });
  assert.throws(() => p2.sameRequest(request, person.actor_id, frozen), { code: "actions.scope_mismatch" });
  assert.deepEqual(note(), [{ title: frozen.title }]);
  assert.deepEqual(count(), { n: 1 });
});

test("APR-19: project rules keep history and revision, cannot be weakened by an object rule or crossed between owners", async t => {
  const db = projectLibrary(t), p1 = projectApprovalRules(db, "p1"), p2 = projectApprovalRules(db, "p2");
  const first = p1.read(false);
  const make = (scope: ProjectApprovalRuleScope, requires_person: boolean, expected_revision: string, reason = "original") =>
    p1.change({ kind: "set", scope, requires_person, expected_revision, reason }, person.actor_id, at, current);
  const project = { kind: "project_default" } as const;
  let policy = await make(project, true, first.revision);
  await assert.rejects(make(project, false, first.revision), { code: "actions.conflict" });
  const owner = { kind: "plugin", plugin_id: "example.notes", publisher_signature: "publisher-a" } as const;
  const object = { kind: "object", owner, subject: { kind: "folder", id: "work" } } as const;
  policy = await make(object, false, policy.revision);
  assert.equal(approvalRequiresPerson(policy, object), true);
  policy = await make(project, false, policy.revision);
  const parent = { kind: "folder", id: "parent" };
  policy = await make({ kind: "ancestor_minimum", owner, subject: parent }, true, policy.revision);
  assert.equal(approvalRequiresPerson(policy, object, [parent]), true);
  assert.equal(approvalRequiresPerson(policy, object), false);
  assert.equal(approvalRequiresPerson(policy, { ...object, owner: { ...owner, publisher_signature: "another" } }, [parent]), false);
  assert.equal(approvalRequiresPerson(p2.read()), false);
  const ancestor = policy.rules.find(rule => rule.scope.kind === "ancestor_minimum")!;
  await p1.change({ kind: "withdraw", id: ancestor.id, expected_revision: policy.revision, reason: "user removed" }, person.actor_id, at, current);
  const after = p1.read(), withdrawn = after.rules.find(rule => rule.id === ancestor.id)!;
  assert.equal(after.revision, p1.read(false).revision);
  assert.equal(approvalRequiresPerson(after, object, [parent]), false);
  assert.equal(withdrawn.reason, "original");
  assert.deepEqual([withdrawn.revision, withdrawn.changed_by, withdrawn.change_reason], [2, person.actor_id, "user removed"]);
  assert.equal(after.rules.filter(rule => rule.state === "replaced").length, 1);
});

test("APR-17/18: the action gateway only spends the original proof once and rechecks it at the actual write", async t => {
  const db = projectLibrary(t), service = new ActionService();
  db.exec("CREATE TABLE fixture_notes (title TEXT)");
  const action = { capability_id: "example.notes.accept", version: 1, provider_id: "notes-provider" } satisfies ExactActionReference;
  const caller: ActionCallContext = { actor_id: person.actor_id, actor_kind: "user", project_id: original.project_id, audience: "user",
    permissions: [], user_action: person.source.entry };
  const seen = () => db.prepare("SELECT title FROM fixture_notes").all();
  let active = true, entered = 0;
  let afterEnter = () => {};
  const declared = defineAction({ capability_id: action.capability_id, version: action.version, operation: "command",
    action: { title: "Accept note", description: "Save the exact reviewed note", kind: "operation", scope: "project",
      requires_trusted_decision: true, trusted_decision_request: { capability_id: "example.notes.review", version: 1 },
      audiences: ["user", "agent"], permissions: [], subject_kinds: ["note"],
      input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } },
  }, async (ctx, input: { title: string }) => {
    entered += 1;
    assert.throws(() => { input.title = "different from shown"; }, TypeError);
    await assert.rejects(service.invoke(ctx, action, input), { code: "actions.forbidden" });
    afterEnter();
    await ctx.beforeEffect();
    db.prepare("INSERT INTO fixture_notes VALUES (?)").run(input.title);
    return { saved: true };
  });
  const reader = defineAction({ capability_id: "example.notes.review", version: 1, operation: "query",
    action: { title: "Read note", description: "Read the original note", kind: "query", scope: "project", audiences: ["user"],
      permissions: [], subject_kinds: ["note"], input_schema: TRUSTED_REVIEW_OWNER_INPUT_SCHEMA } }, () => null);
  service.registerProvider({ provider: { provider_id: action.provider_id, title: "Notes", kind: "plugin" },
    definitions: [reader.definition, declared.definition], handlers: [reader.handler, declared.handler] });
  const input = { title: "reviewed version" };
  const proof = { actor_id: caller.actor_id, project_id: "p1", entry: person.source.entry, action, input,
    assertCurrent() { if (!active) throw new ActionError("actions.expired", "expired original request"); } };
  await assert.rejects(service.invoke({ ...caller, user_action: { ...person.source.entry } }, action, input), { code: "actions.forbidden" });
  await assert.rejects(service.invoke({ ...caller, actor_kind: "agent", audience: "agent" }, action, input), { code: "actions.forbidden" });
  await assert.rejects(withTrustedDecision(proof, () => service.invoke(caller, action, { title: "different input" })), { code: "actions.forbidden" });
  assert.deepEqual(seen(), []);
  assert.equal(entered, 0);
  afterEnter = () => { active = false; };
  await assert.rejects(withTrustedDecision(proof, () => service.invoke(caller, action, input)), { code: "actions.expired" });
  assert.deepEqual(seen(), []);
  afterEnter = () => {};
  active = true;
  const result = await withTrustedDecision(proof, async () => {
    const written = await service.invoke(caller, action, input);
    await assert.rejects(service.invoke(caller, action, input), { code: "actions.forbidden" });
    return written;
  });
  assert.deepEqual(result, { saved: true });
  assert.deepEqual(seen(), [input]);
  assert.equal(entered, 2);
});

test("APR-19: platform sync replicates system.acceptance trusted decisions and rejects forged system owners", t => {
  const from = projectLibrary(t), to = projectLibrary(t);
  const sender = projectApprovalReplica(from, "p1", "same-space", () => undefined);
  const receiver = projectApprovalReplica(to, "p1", "same-space", () => undefined);
  const systemOwner = { kind: "trusted-decision", project_id: "p1", scope: "project", provider_id: "system.acceptance" } as const;
  const systemCommand: TrustedReviewCommand = {
    reference: { owner: systemOwner, id: "acceptance:todo-1:v1", version: "digest-1" },
    choice_id: "accept_all",
    request_key: "system-acceptance-click",
  };
  const systemReview = {
    publisher_signature: "system:system.acceptance",
    review: {
      target: {
        owner: { kind: "system", scope: "project", project_id: "p1", provider_id: "system.acceptance" },
        subject: { kind: "todo_item", id: "todo-1" },
        version: "v1",
      },
      requirements: [],
    },
  } satisfies Pick<ProjectTrustedDecision, "publisher_signature" | "review">;
  const committed = from.transaction(() =>
    projectReviewDecisions(from, "p1").commit(systemCommand, person, frozen, systemReview, at, current.assertCurrent).record,
  ).immediate();
  const outbound = sender.next()!;
  assert.ok(outbound);
  receiver.receive({ ...outbound, revision: 1 });
  assert.deepEqual(projectReviewDecisions(to, "p1").read(committed.decision_id), committed);

  for (const mutate of [
    (record: Record<string, unknown>) => ({ ...record, publisher_signature: "system:other.provider" }),
    (record: Record<string, unknown>) => ({
      ...record,
      reference: { ...(record.reference as object), owner: { ...systemOwner, plugin_id: "io.molis.work.todo" } },
    }),
  ]) {
    const badTo = projectLibrary(t);
    const badReceiver = projectApprovalReplica(badTo, "p1", "same-space", () => undefined);
    const tampered = structuredClone(outbound.value) as { decisions: Array<{ decision_id: string; record_json: string }>; rules: unknown[] };
    const bad = mutate({ ...JSON.parse(tampered.decisions[0]!.record_json), decision_id: "forged-system-id" });
    tampered.decisions = [{ ...tampered.decisions[0]!, decision_id: "forged-system-id", record_json: JSON.stringify(bad) }];
    badReceiver.receive({ ...outbound, revision: 1, operationId: "forged", value: tampered });
    assert.equal(badReceiver.conflicts().length, 1);
    assert.equal(projectReviewDecisions(badTo, "p1").read("forged-system-id"), null);
    assert.equal(projectReviewDecisions(badTo, "p1").count(), 0);
  }
});

test("F-horiz-runtime-23: concurrent same-request decisions record a structured conflict without raw SQLite UNIQUE errors and support remote resolve", t => {
  const from = projectLibrary(t), to = projectLibrary(t);
  const sender = projectApprovalReplica(from, "p1", "same-space", () => undefined);
  const receiver = projectApprovalReplica(to, "p1", "same-space", () => undefined);

  const remoteRecord = from.transaction(() =>
    projectReviewDecisions(from, "p1").commit(request, person, frozen, coverage, at, current.assertCurrent).record,
  ).immediate();
  const localRecord = to.transaction(() =>
    projectReviewDecisions(to, "p1").commit({ ...request, choice_id: "return" }, person, frozen, coverage, at, current.assertCurrent).record,
  ).immediate();

  const outbound = sender.next()!;
  assert.ok(outbound);
  receiver.receive({ ...outbound, revision: 1 });

  const conflicts = receiver.conflicts();
  assert.equal(conflicts.length, 1);
  assert.doesNotMatch(conflicts[0]!.reason, /UNIQUE constraint failed/u);
  assert.deepEqual(projectReviewDecisions(to, "p1").read(localRecord.decision_id), localRecord);

  receiver.resolve(conflicts[0]!.key, "remote", 1);
  assert.equal(receiver.conflicts().length, 0);
  assert.deepEqual(projectReviewDecisions(to, "p1").read(remoteRecord.decision_id), remoteRecord);
  assert.equal(projectReviewDecisions(to, "p1").read(localRecord.decision_id), null);
});

test("F-horiz-runtime-23: sync rejects malformed rule state/revision and dual-active scopes, and active rules merge conservatively", async t => {
  const from = projectLibrary(t), to = projectLibrary(t);
  const sender = projectApprovalReplica(from, "p1", "same-space", () => undefined);
  const receiver = projectApprovalReplica(to, "p1", "same-space", () => undefined);

  const fromRules = projectApprovalRules(from, "p1");
  const toRules = projectApprovalRules(to, "p1");
  await fromRules.change({
    kind: "set", expected_revision: fromRules.read().revision, scope: { kind: "project_default" },
    requires_person: false, reason: "device-a relax",
  }, person.actor_id, at, current);
  await toRules.change({
    kind: "set", expected_revision: toRules.read().revision, scope: { kind: "project_default" },
    requires_person: true, reason: "device-b strict",
  }, person.actor_id, at, current);

  const outbound = sender.next()!;
  assert.ok(outbound);
  receiver.receive({ ...outbound, revision: 1 });
  assert.equal(receiver.conflicts().length, 1);
  assert.equal(approvalRequiresPerson(toRules.read()), true);

  for (const mutate of [
    (rule: Record<string, unknown>) => ({ ...rule, state: "active", revision: 2 }),
    (rule: Record<string, unknown>) => ({ ...rule, state: "withdrawn", revision: 1, changed_by: null, changed_at: null, change_reason: null }),
  ]) {
    const badTo = projectLibrary(t);
    const badReceiver = projectApprovalReplica(badTo, "p1", "same-space", () => undefined);
    const tampered = structuredClone(outbound.value) as { decisions: unknown[]; rules: Record<string, unknown>[] };
    tampered.rules = [mutate(tampered.rules[0]!)];
    badReceiver.receive({ ...outbound, revision: 1, operationId: "bad-rule", value: tampered });
    assert.equal(badReceiver.conflicts().length, 1);
    assert.deepEqual(projectApprovalRules(badTo, "p1").read().rules, []);
  }

  // Conservative merge if two active project_default rules (true + later false) coexist in storage or snapshot.
  const dualDb = projectLibrary(t);
  const dualRules = projectApprovalRules(dualDb, "p1");
  await dualRules.change({
    kind: "set", expected_revision: dualRules.read().revision, scope: { kind: "project_default" },
    requires_person: true, reason: "strict",
  }, person.actor_id, at, current);
  dualDb.prepare(`INSERT INTO project_approval_rules
    (id, project_id, scope_json, rule_order, requires_person, revision, state, created_by, created_at, reason)
    VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?)`)
    .run("dual-false-later", "p1", "{\"kind\":\"project_default\"}", 99, 0, person.actor_id, at, "later-false");
  assert.equal(approvalRequiresPerson(dualRules.read()), true);
  assert.equal(dualRules.page().project_default_requires_person, true);
});
