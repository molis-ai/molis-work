import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectApprovalRuleScope, ProjectTrustedDecision, TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { ActionService, withTrustedDecision } from "@molis-ai/molis-work-kernel";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { approvalRequiresPerson, projectApprovalRules, projectReviewDecisions, PROJECT_APPROVALS_SCHEMA_SQL } from "@molis-ai/molis-work-service-project-approvals";
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
const current = { beforeEffect: async () => undefined, assertCurrent() {} };

function projectLibrary(t: TestContext) {
  const storage = new LocalSqliteStorage(":memory:");
  t.after(() => storage.close());
  storage.db.exec(PROJECT_ROOT_SCHEMA_SQL + PROJECT_APPROVALS_SCHEMA_SQL);
  storage.db.prepare("INSERT INTO project_root(project_id, created_at) VALUES (?, ?),(?, ?)").run("p1", at, "p2", at);
  return storage.db;
}

test("APR-18/19: a decision joins the business write, rolls back on a late refusal, and replays only the original command", t => {
  const db = projectLibrary(t), p1 = projectReviewDecisions(db, "p1"), p2 = projectReviewDecisions(db, "p2");
  db.exec("CREATE TABLE fixture_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
  const note = () => db.prepare("SELECT title FROM fixture_notes").all();
  const count = () => db.prepare("SELECT COUNT(*) AS n FROM project_review_decisions").get();
  assert.throws(() => p1.commit(request, person, frozen, at, current.assertCurrent), { code: "actions.forbidden" });
  assert.throws(() => db.transaction(() => {
    p1.commit(request, person, frozen, at, current.assertCurrent);
    db.prepare("INSERT INTO fixture_notes VALUES (?, ?)").run("n1", frozen.title);
    throw new ActionError("actions.expired", "entry revoked before commit");
  }).immediate(), { code: "actions.expired" });
  assert.deepEqual(note(), []);
  assert.deepEqual(count(), { n: 0 });

  const saved = db.transaction(() => {
    const result = p1.commit(request, person, frozen, at, current.assertCurrent);
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
      requires_trusted_decision: true, audiences: ["user", "agent"], permissions: [], subject_kinds: ["note"],
      input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } },
  }, async (ctx, input: { title: string }) => {
    entered += 1;
    await assert.rejects(service.invoke(ctx, action, input), { code: "actions.forbidden" });
    afterEnter();
    await ctx.beforeEffect();
    db.prepare("INSERT INTO fixture_notes VALUES (?)").run(input.title);
    return { saved: true };
  });
  service.registerProvider({ provider: { provider_id: action.provider_id, title: "Notes", kind: "plugin" },
    definitions: [declared.definition], handlers: [declared.handler] });
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
