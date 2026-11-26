import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionDelegationScope, AgentDelegationScope, AgentDelegationState, AgentDelegationSubject } from "@molis-ai/molis-work-contracts/services/agent-host";
import { WorkDelegationStore, actionDigest, reviewProposalVersion, type WorkDelegationStorage, type ReviewDecisionControl } from "@molis-ai/molis-work-service-agent-host";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { createPagesActionHandlers, ownPagesStores, pagesActions, pagesManifest, PagesStore, PAGES_DATABASE, PAGES_ACTIONS, PAGES_ACTION_PERMISSIONS, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";

type Proposal = Parameters<WorkDelegationStore["actionDecision"]>[1];
const subject: AgentDelegationSubject = { kind: "work", actor_id: "person", project_id: "a",
  executor: { plugin_id: "executor", install_id: "executor-install", installation_generation: "executor-1", role_id: "writer" }, work: { owner_id: "works", id: "work" } };
const ongoing: AgentDelegationSubject = { kind: "ongoing", actor_id: subject.actor_id, project_id: subject.project_id, executor: subject.executor };
const userControl = { beforeEffect: () => {}, assertCurrent: () => {} };
const changed = (state: AgentDelegationState) => ({ expected_version: state.storage_version, id: state.selection_id!, revision: state.selections.at(-1)!.revision });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t: TestContext) {
  const records = new Map<string, { version: number; value: unknown }>();
  const faults: { read?: () => Promise<void> } = {}, flags = { action: true, target: true, confirm: false };
  const storage: WorkDelegationStorage = {
    async read(id) { await faults.read?.(); return structuredClone(records.get(id)?.value); },
    async list() { return [...records.keys()]; },
    async compareAndSet(id, expected, value, control) {
      await control.beforeEffect(); control.assertCurrent();
      assert.equal(records.get(id)?.version ?? 0, expected);
      records.set(id, { version: expected + 1, value: structuredClone(value) });
    },
  };
  const store = new WorkDelegationStore(storage), work = await store.ensureWork(subject, userControl);
  const db = new DatabaseSync(":memory:"); db.exec(PAGES_DATABASE.schema);
  const pages = new PagesStore({ get: (sql, args = []) => db.prepare(sql).get(...args), all: (sql, args = []) => db.prepare(sql).all(...args),
    run: (sql, args = []) => db.prepare(sql).run(...args) }, "a", new Map(), run => {
    if (db.isTransaction) return run(); db.exec("BEGIN IMMEDIATE");
    try { const value = run(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
  const service = new ActionService(), provider = { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin" as const, project_id: "a" };
  const unregister = service.registerProvider({ provider, definitions: PAGES_ACTIONS, handlers: createPagesActionHandlers({ ...ownPagesStores(run => run(pages)),
    modelAvailability: () => ({ available: false, code: "actions.connection_required", reason: "fixture" }),
    prepareImport: async () => { throw new Error("unused"); },
    promote: async () => assert.fail("a permission decision must not publish a document") }) });
  t.after(async () => { await store.close(); unregister(); pages.close(); db.close(); });
  const caller: ActionCallContext = { actor_id: "person", audience: "agent", actor_kind: "runtime", project_id: "a", permissions: PAGES_ACTION_PERMISSIONS,
    assert_authority_current: () => { if (!flags.action) throw new Error("original action revoked"); } };
  const catalog = await service.discover(caller), doc = pages.create({ title: "Original" });
  const view = (key: keyof typeof pagesActions) => catalog.find(row => row.capability_id === pagesActions[key].capability_id)!;
  const owner = { provider_id: provider.provider_id, installation_generation: "pages-1", kind: PAGES_SUBJECT_KIND };
  const proposal = (key: keyof typeof pagesActions, input: unknown, patch: Partial<Proposal> = {}): Proposal => ({ work_epoch: work.epoch, view: view(key), input,
    provider_installation_generation: "pages-1", confirmation_required: flags.confirm,
    target_owners: { document: { identity: owner, assertCurrent() { if (!flags.target) throw new Error("original target replaced"); } } }, ...patch });
  const control = (p: Proposal): ReviewDecisionControl => {
    const original = service.prepareReview(caller, p.view, p.input), confirm = p.confirmation_required;
    return { beforeEffect: original.beforeEffect, assertCurrent() { original.assertCurrent(); if (flags.confirm !== confirm) throw new Error("confirmation choice changed"); } };
  };
  const decide = (p: Proposal, held = control(p)) => store.actionDecision(subject, p, held);
  const scopes = (selected: ActionView = view("update")): AgentActionDelegationScope => ({ kind: "action-objects",
    action: { capability_id: selected.capability_id, version: selected.version, provider_id: provider.provider_id }, declaration_digest: actionDigest(selected), provider_installation_generation: "pages-1",
    operations: [{ key: "edit", targets: { document: { owner, ids: [doc.id] } } }] });
  const grant = async (ranges: readonly AgentDelegationScope[], mode: "automatic" | "confirm" | "read-only" = "automatic", forSubject = subject) => {
    const current = await store.read(forSubject);
    return store.grant(forSubject, { expected_version: current?.storage_version ?? 0, mode, scopes: ranges, expires_at: null }, userControl);
  };
  const exact = (p: Proposal): AgentDelegationScope => ({ kind: "action-exact", action: { capability_id: p.view.capability_id, version: p.view.version, provider_id: provider.provider_id },
    declaration_digest: actionDigest(p.view), provider_installation_generation: "pages-1", input_json: canonicalJsonText(p.input)! });
  return { store, work, pages, doc, service, caller, flags, faults, proposal, decide, control, scopes, grant, exact, view, unregister, restart: () => new WorkDelegationStore(storage) };
}

test("APR-07/08: current object scope permits changed content through real Pages, but never adds move or delete", async t => {
  const f = await fixture(t), saved = await f.grant([f.scopes()]);
  const p = f.proposal("update", { id: f.doc.id, title: "Changed", expected_version: f.doc.version });
  const permit = await f.decide(p); assert.equal(permit.decision.state, "delegation");
  assert.equal(permit.input_version, reviewProposalVersion(p.input));
  if (permit.decision.state !== "delegation") throw new Error("expected delegation");
  assert.deepEqual(permit.decision.source, { kind: "delegation", delegation: { id: saved.selection_id, revision: 1, grantor_id: "person", work_epoch: f.work.epoch } });
  await f.service.invoke({ ...f.caller, validate_authority: () => permit.beforeEffect(), assert_authority_current: () => permit.assertCurrent() },
    { capability_id: p.view.capability_id, version: p.view.version, provider_id: p.view.provider.provider_id }, p.input);
  const after = f.pages.get(f.doc.id); assert.equal(after.title, "Changed"); assert.equal(after.version, f.doc.version + 1);
  assert.equal((await f.decide(f.proposal("update", { id: f.doc.id, title: "Another", expected_version: after.version }))).decision.state, "delegation");
  assert.equal((await f.decide(f.proposal("update", { id: f.doc.id, folder_id: "", expected_version: after.version }))).decision.state, "confirm");
  assert.equal((await f.decide(f.proposal("delete", { id: f.doc.id }))).decision.state, "confirm");
  assert.equal(f.pages.get(f.doc.id).title, "Changed", "decisions themselves perform no business writes");
});

test("APR-08: declared unsupported and confirmation-only inputs cannot borrow an exact grant", async t => {
  const f = await fixture(t);
  for (const [p, reason] of [
    [f.proposal("update", { id: f.doc.id, goal_id: "foreign-goal", expected_version: 1 }), "target-unsupported"],
    [f.proposal("promote", { id: f.doc.id, expected_version: 1 }), "target-missing"],
    [f.proposal("revert", { change_id: "original-change" }), "confirmation-only"],
  ] as const) {
    await f.grant([f.exact(p)]);
    assert.deepEqual((await f.decide(p)).decision, { state: "confirm", reason });
  }
  assert.equal(f.pages.get(f.doc.id).title, "Original");
});

test("APR-07/08: only undeclared actions accept complete exact JSON; MCP keeps its connection boundary", async t => {
  const f = await fixture(t), p = f.proposal("createFolder", { title: "Authorized" }); await f.grant([f.exact(p)]);
  assert.equal((await f.decide(p)).decision.state, "delegation");
  assert.deepEqual((await f.decide({ ...p, input: { title: "Different" } })).decision, { state: "confirm", reason: "scope" });
  assert.deepEqual((await f.decide({ ...p, input: {} })).decision, { state: "confirm", reason: "scope" });
  assert.deepEqual((await f.decide({ ...p, view: { ...p.view, provider: { ...p.view.provider, kind: "mcp" } } })).decision, { state: "confirm", reason: "identity" });
  for (const input of [{ title: undefined }, { title: NaN }, { title: Infinity }, { title: new Date() }, { title: () => "ignored" }]) {
    await assert.rejects(f.store.actionDecision(subject, { ...p, input }, userControl), { code: "agent.delegation_invalid" });
  }
});

test("APR-11/13: read-only writes cannot be approved; explicit confirmation and unset policy remain distinct", async t => {
  const f = await fixture(t), write = f.proposal("update", { id: f.doc.id, title: "Not sent", expected_version: 1 });
  assert.deepEqual((await f.decide(write)).decision, { state: "original" });
  await f.grant([f.scopes()], "read-only");
  await assert.rejects(f.decide(write), { code: "agent.review_not_permitted" });
  assert.deepEqual((await f.decide(f.proposal("get", { id: f.doc.id }))).decision, { state: "read" });
  f.flags.confirm = true;
  assert.deepEqual((await f.decide(f.proposal("get", { id: f.doc.id }))).decision, { state: "confirm", reason: "required" });
  await assert.rejects(f.decide({ ...write, confirmation_required: true }), { code: "agent.review_not_permitted" });
  f.flags.confirm = false;
  const read = f.proposal("get", { id: f.doc.id });
  const notRead: ActionView[] = [{ ...read.view, action: { ...read.view.action, effect: "write" } },
    { ...read.view, operation: "command", action: { ...read.view.action, effect: "read" } }];
  for (const view of notRead) await assert.rejects(f.store.actionDecision(subject, { ...read, view }, userControl), { code: "agent.review_not_permitted" });
  await f.grant([f.scopes()], "confirm"); assert.deepEqual((await f.decide(write)).decision, { state: "confirm", reason: "mode" });
  await f.grant([f.scopes()]); f.flags.confirm = true;
  assert.deepEqual((await f.decide({ ...write, confirmation_required: true })).decision, { state: "confirm", reason: "required" });
  assert.equal(f.pages.get(f.doc.id).title, "Original");
});

test("APR-08/11: target fences guard matched object grants without blocking original review or reads", async t => {
  const f = await fixture(t), write = f.proposal("update", { id: f.doc.id, title: "Pending", expected_version: 1 });
  f.flags.target = false;
  const original = await f.decide(write);
  assert.deepEqual(original.decision, { state: "original" }); await original.beforeEffect(); original.assertCurrent();
  await f.grant([f.scopes()]);
  const read = await f.decide(f.proposal("get", { id: f.doc.id }));
  assert.deepEqual(read.decision, { state: "read" }); await read.beforeEffect(); read.assertCurrent();
  const outside = await f.decide(f.proposal("update", { id: f.doc.id, folder_id: "", expected_version: 1 }));
  assert.deepEqual(outside.decision, { state: "confirm", reason: "scope" }); await outside.beforeEffect(); outside.assertCurrent();
  f.flags.confirm = true;
  const required = await f.decide({ ...write, confirmation_required: true });
  assert.deepEqual(required.decision, { state: "confirm", reason: "required" }); await required.beforeEffect(); required.assertCurrent();
  f.flags.confirm = false;
  await f.grant([f.scopes()], "confirm");
  const confirm = await f.decide(write);
  assert.deepEqual(confirm.decision, { state: "confirm", reason: "mode" }); await confirm.beforeEffect(); confirm.assertCurrent();
  await f.grant([f.scopes()]);
  await assert.rejects(f.decide(write), /original target replaced/);
  assert.equal(f.pages.get(f.doc.id).title, "Original");
});

test("APR-08/11: object identity needs the exact target owner and fence, installation and declaration", async t => {
  const f = await fixture(t), p = f.proposal("update", { id: f.doc.id, title: "Proposed", expected_version: 1 }); await f.grant([f.scopes()]);
  const owners: Proposal["target_owners"][] = [{}, { document: { ...p.target_owners.document!, identity: { ...p.target_owners.document!.identity, kind: "other-kind" } } },
    { document: { ...p.target_owners.document!, identity: { ...p.target_owners.document!.identity, installation_generation: "new-target" } } }];
  for (const target_owners of owners) {
    assert.equal((await f.decide({ ...p, target_owners })).decision.state, "confirm");
  }
  assert.equal((await f.decide({ ...p, provider_installation_generation: "new-provider" })).decision.state, "confirm");
  assert.equal((await f.decide({ ...p, provider_installation_generation: null })).decision.state, "confirm");
  await f.grant([{ ...f.scopes(), declaration_digest: "previous-declaration" }]); assert.equal((await f.decide(p)).decision.state, "confirm");
  await f.grant([f.scopes()]);
  await assert.rejects(f.decide({ ...p, target_owners: { document: { identity: p.target_owners.document!.identity, assertCurrent: async () => {} } } }), { code: "actions.async_required" });
  const permit = await f.decide(p); f.flags.target = false; assert.throws(() => permit.assertCurrent(), /target replaced/);
  f.flags.target = true; f.flags.confirm = true; await assert.rejects(permit.beforeEffect(), /confirmation choice changed/);
});

test("APR-07/11: revoked original action after permission read cannot produce a decision", async t => {
  const f = await fixture(t); await f.grant([f.scopes()]);
  const restarted = f.restart(); t.after(() => restarted.close());
  const entered = deferred(), resume = deferred(); f.faults.read = async () => { entered.resolve(); await resume.promise; };
  const p = f.proposal("update", { id: f.doc.id, title: "Not sent", expected_version: 1 });
  const refused = assert.rejects(restarted.actionDecision(subject, p, f.control(p)), /original action revoked/);
  await entered.promise; f.flags.action = false; resume.resolve(); await refused;
  assert.equal(f.pages.get(f.doc.id).title, "Original");
});

test("APR-07/11: final control rejects revoke during owner await and the actual Pages write stays untouched", async t => {
  const f = await fixture(t), saved = await f.grant([f.scopes()]);
  const p = f.proposal("update", { id: f.doc.id, title: "Not sent", expected_version: 1 }), original = f.control(p);
  const entered = deferred(), resume = deferred(); let wait = false;
  const permit = await f.decide(p, { assertCurrent: original.assertCurrent, beforeEffect: async () => { await original.beforeEffect(); if (wait) { entered.resolve(); await resume.promise; } } });
  wait = true;
  const refused = assert.rejects(f.service.invoke({ ...f.caller, validate_authority: () => permit.beforeEffect(), assert_authority_current: () => permit.assertCurrent() },
    { capability_id: p.view.capability_id, version: p.view.version, provider_id: p.view.provider.provider_id }, p.input), { code: "agent.delegation_changed" });
  await entered.promise; await f.store.revoke(subject, changed(saved), userControl); resume.resolve(); await refused;
  assert.equal(f.pages.get(f.doc.id).title, "Original"); assert.equal(f.pages.get(f.doc.id).version, 1);
  assert.throws(() => permit.assertCurrent(), { code: "agent.delegation_changed" });
});

test("APR-11/13: ongoing source names the actual work epoch; ending/reopening cannot rebind an old Run", async t => {
  const f = await fixture(t), persistent = await f.grant([f.scopes()], "automatic", ongoing);
  const p = f.proposal("update", { id: f.doc.id, title: "Allowed", expected_version: 1 }), permit = await f.decide(p);
  assert.equal(permit.decision.state, "delegation");
  if (permit.decision.state !== "delegation") throw new Error("expected ongoing grant");
  assert.deepEqual(permit.decision.subject, ongoing); assert.equal(permit.decision.source.delegation.id, persistent.selection_id);
  assert.equal(permit.decision.source.delegation.work_epoch, f.work.epoch); assert.notEqual(f.work.epoch, persistent.epoch);
  await f.store.beginEnd(subject, f.work.epoch, "stopped", userControl);
  const ended = await f.store.finishEnd(subject, f.work.epoch, userControl);
  const reopened = await f.store.reopen(subject, { expected_version: ended.storage_version, mode: "automatic", scopes: [f.scopes()], expires_at: null }, userControl);
  assert.throws(() => permit.assertCurrent(), { code: "agent.delegation_changed" });
  await assert.rejects(f.decide(p), { code: "agent.delegation_changed" });
  assert.equal((await f.decide({ ...p, work_epoch: reopened.epoch })).decision.state, "delegation");
});

test("APR-08: proposal mutation while authority awaits cannot change the selected scope or input fingerprint", async t => {
  const f = await fixture(t); await f.grant([f.scopes()]);
  const input = { id: f.doc.id, title: "Frozen", expected_version: 1 }, expected = reviewProposalVersion(input);
  const p = f.proposal("update", input), original = f.control(p), entered = deferred(), resume = deferred();
  const deciding = f.decide(p, { assertCurrent: original.assertCurrent, beforeEffect: async () => { entered.resolve(); await resume.promise; await original.beforeEffect(); } });
  await entered.promise; input.id = "different-document"; input.title = "Changed"; resume.resolve();
  const permit = await deciding; assert.equal(permit.input_version, expected); assert.notEqual(permit.input_version, reviewProposalVersion(input));
  assert.equal(permit.decision.state, "delegation");
  f.unregister(); assert.throws(() => permit.assertCurrent(), { code: "actions.provider_changed" });
  assert.equal(f.pages.get(f.doc.id).title, "Original");
});
