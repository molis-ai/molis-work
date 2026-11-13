import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService, installHostUiText, molisWorkHostProjectReference, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentDelegationActions, type AgentDelegationActionChoice } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PAGES_ACTION_PERMISSIONS, PAGES_HOME_STORE, PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID, pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { TODO_ACTION_PERMISSIONS, TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID, todoActions } from "@molis-ai/molis-work-plugin-todo";
import { homeSqlitePath, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { watchSettlements } from "./fixtures/settlements.js";

installHostUiText();

const person = LOCAL_PERSON_ACTOR_ID;
const update = { capability_id: "pages.update", version: 1, provider_id: PAGES_PLUGIN_ID };
const updateReply = (input: Record<string, unknown>) => () => reply({ name: "change-capability", input: { ...update, input } });
const body = (text: string) => ({ type: "doc", content: [{ type: "paragraph", attrs: { note: "" }, content: [{ type: "text", text }] }] });

async function until<T>(label: string, check: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 12_000;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) throw new Error("Timed out waiting for " + label);
    await delay(30);
  }
}

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-pages-permission-"));
  // Both the real Memory policy and the plugin supervisor must see the same project's catalog record.
  await runWithMolisWorkHome(home, () => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture" }]));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "Permission project", actor_id: person });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: PAGES_PROJECT_PLUGIN_ID, actor_id: person });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: TODO_PROJECT_PLUGIN_ID, actor_id: person });
    return created;
  });
  const projectId = project.project_id;
  const reference = molisWorkHostProjectReference({ projectId, databasePath: project.database_path });
  const steps: Array<() => Response | Promise<Response>> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : "";
    const review = asideReply(body);
    return review ? reply(undefined, review) : await (steps.shift()?.() ?? reply());
  });
  let policy: (caller: ActionCallContext, view: ActionView) => void | Promise<void> = () => {};
  let local: MolisWorkLocalHost | undefined;
  const open = async () => {
    local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: async (caller, view) => {
      await policy(caller, view);
      return { available: true };
    } });
    const host = local, catalog = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
    const agents = ensureSystemAgentService(host, home, catalog);
    const { service, store } = assistantServiceFor({ localHost: host, homeDirectory: home, agentHost: agents.agentHost, agentReady: () => agents.ready,
      pages: async () => ["pages"], projectTitle: async () => "Permission project", projectReference: async () => reference });
    const caller: ActionCallContext = { actor_id: person, actor_kind: "user", project_id: projectId, audience: "user", permissions: [...PAGES_ACTION_PERMISSIONS, ...TODO_ACTION_PERMISSIONS] };
    const actions = host.actionClient(reference);
    return { host, agents, service, store, actions, caller, person: bindActionClient(actions, () => caller),
      reviews: () => agents.agentHost.reviews.list(projectId).map(row => agents.agentHost.reviews.receipt(row.review_id)!) };
  };
  t.after(async () => { try { await local?.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const first = await open();
  return { ...first, home, projectId, reference, steps, setPolicy: (next: typeof policy) => { policy = next; },
    reopen: async () => { await local?.close(); return open(); } };
}

const objectChoice = (id: string): AgentDelegationActionChoice =>
  ({ kind: "objects", action: update, operations: [{ key: "edit", targets: [{ key: "document", ids: [id] }] }] });

function createWork(f: Awaited<ReturnType<typeof fixture>>, title: string) {
  return f.store.create({ actor_id: person, title, scope: { kind: "project", project_id: f.projectId }, origin: null, project_ref: f.reference });
}

async function grantWork(f: Pick<Awaited<ReturnType<typeof fixture>>, "person">, workId: string, ids: readonly string[]) {
  const choice = { work_id: workId, lifetime: "work" as const, choices: ids.map(objectChoice) };
  const preview = await f.person.invoke(agentDelegationActions.prepare, choice);
  return f.person.invoke(agentDelegationActions.grant, { ...choice, expected_version: preview.storage_version, candidate_digest: preview.candidate_digest, mode: "automatic", expires_at: null });
}

test("APR-07/08/11/12/13 ASC-51/52: the selected Pages scope survives rounds and restart, with durable sources and actual refusal after revoke", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t);
  const { document } = await f.person.invoke(pagesActions.create, { title: "Minutes", markdown: "Original content" });
  const work = createWork(f, "Edit minutes");
  const choice = { work_id: work.work_id, lifetime: "work" as const, choices: [objectChoice(document.id)] };
  const prepared = await f.person.invoke(agentDelegationActions.prepare, choice);
  assert.equal(prepared.candidates[0]?.operations?.[0]?.targets[0]?.values[0]?.label, "Minutes", JSON.stringify(prepared.candidates));
  const grant = { ...choice, expected_version: prepared.storage_version, candidate_digest: prepared.candidate_digest, mode: "automatic" as const, expires_at: null };
  await assert.rejects(f.actions.invoke({ ...f.caller, actor_kind: "runtime", audience: "agent" }, agentDelegationActions.grant, grant), { code: "actions.forbidden" });
  const saved = await f.person.invoke(agentDelegationActions.grant, grant);
  assert.ok(saved.selection);
  await assert.rejects(f.person.invoke(agentDelegationActions.grant, grant), { code: "actions.conflict" });

  const first = { id: document.id, expected_version: document.version, markdown: "A new body within the approved scope" };
  f.steps.push(updateReply(first));
  const sent = await f.service.send({ work_id: work.work_id, request_id: "scope-round-0001", text: "Edit the minutes" }, { project_ref: f.reference });
  await until("first round completed", async () => (await f.service.read(work.work_id)).work.state === "completed" ? true : undefined);
  await f.agents.agentHost.reviews.refresh(f.projectId);
  const settled = f.reviews().find(row => row.source?.kind === "delegation");
  assert.ok(settled?.effect_settled, JSON.stringify(f.reviews()));
  assert.equal(settled.source?.kind, "delegation");
  if (settled.source?.kind !== "delegation") assert.fail("delegation source");
  const originalEpoch = settled.source.delegation.work_epoch;
  assert.deepEqual(settled.source.delegation, { id: saved.selection.id, revision: saved.selection.revision, grantor_id: person, work_epoch: originalEpoch });
  const committed = (await f.person.invoke(pagesActions.get, { id: document.id })).document;
  assert.equal(committed.version, document.version + 1);
  assert.deepEqual(committed.body, body(first.markdown));

  const next = await f.reopen();
  const seen = await next.person.invoke(agentDelegationActions.prepare, choice);
  assert.deepEqual(seen.selection, saved.selection);
  await next.agents.agentHost.reviews.refresh(f.projectId);
  assert.ok(next.reviews().some(row => row.review_id === settled.review_id && row.source?.kind === "delegation" && row.source.delegation.work_epoch === originalEpoch));
  const second = { id: document.id, expected_version: committed.version, markdown: "Second body after Home restart" };
  f.steps.push(updateReply(second));
  const secondRound = await next.service.send({ work_id: work.work_id, request_id: "scope-round-0002", text: "Continue the minutes" }, { project_ref: f.reference });
  assert.notEqual(secondRound.run_id, sent.run_id);
  await until("second round completed", async () => (await next.service.read(work.work_id)).work.state === "completed" ? true : undefined);
  await next.agents.agentHost.reviews.refresh(f.projectId);
  assert.ok(next.reviews().some(row => row.review_id !== settled.review_id && row.source?.kind === "delegation"
    && row.source.delegation.id === saved.selection!.id && row.source.delegation.work_epoch === originalEpoch && row.effect_settled));
  const edited = (await next.person.invoke(pagesActions.get, { id: document.id })).document;
  assert.deepEqual(edited.body, body(second.markdown));

  const { folder } = await next.person.invoke(pagesActions.createFolder, { title: "Unapproved move" });
  f.steps.push(updateReply({ id: document.id, expected_version: edited.version, folder_id: folder.id, markdown: "Must not move" }));
  await next.service.send({ work_id: work.work_id, request_id: "scope-round-0003", text: "Change and move the minutes" }, { project_ref: f.reference });
  const held = await until("combined edit and move needs a person", () => next.reviews().find(row => row.status === "pending"));
  assert.equal(held.source, undefined);
  assert.deepEqual((await next.person.invoke(pagesActions.get, { id: document.id })).document, edited);
  const revoked = await next.person.invoke(agentDelegationActions.revoke, { work_id: work.work_id, lifetime: "work", expected_version: seen.storage_version,
    id: saved.selection.id, revision: saved.selection.revision });
  assert.equal(revoked.selection?.mode, "confirm");
  assert.ok(revoked.selection?.revoked_at);
  assert.notEqual(next.agents.agentHost.reviews.receipt(held.review_id)?.status, "approved");
  assert.deepEqual((await next.person.invoke(pagesActions.get, { id: document.id })).document, edited);
}));

function pagesRows(home: string): Record<string, string[]> {
  const db = new DatabaseSync(homeSqlitePath(home, PAGES_HOME_STORE.path), { readOnly: true });
  try {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => String(row.name));
    return Object.fromEntries(names.map(name => [name, db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]));
  } finally { db.close(); }
}

test("APR-07/11/13 ASC-51/52: a saved delegation withdrawn while the real Pages write waits leaves no business rows", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t);
  const { document } = await f.person.invoke(pagesActions.create, { title: "Protected minutes", markdown: "Do not change" });
  const work = createWork(f, "Edit minutes");
  const choice = { work_id: work.work_id, lifetime: "work" as const, choices: [objectChoice(document.id)] };
  const saved = await grantWork(f, work.work_id, [document.id]);
  assert.ok(saved.selection);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const guard = { checks: 0 };
  const seen = watchSettlements(f.host);
  f.setPolicy(async (caller, view) => {
    if (caller.audience !== "agent" || view.capability_id !== update.capability_id || !caller.signal || !caller.allowed_actions) return;
    if (++guard.checks !== 2) return;
    entered.resolve();
    await release.promise;
  });
  const before = pagesRows(f.home);
  f.steps.push(updateReply({ id: document.id, expected_version: document.version, markdown: "Never committed" }));
  await f.service.send({ work_id: work.work_id, request_id: "scope-late-revoke", text: "Edit the protected minutes" }, { project_ref: f.reference });
  try {
    await until("Pages' check after admission", () => guard.checks === 2 ? true : undefined);
    await entered.promise;
    assert.ok(f.reviews().some(row => row.status === "approved" && row.source?.kind === "delegation"));
    assert.equal(seen.some(row => row.capability_id === update.capability_id && row.audience === "agent"), false);
    assert.deepEqual(pagesRows(f.home), before);
    const revoked = f.person.invoke(agentDelegationActions.revoke, { work_id: work.work_id, lifetime: "work", expected_version: saved.storage_version,
      id: saved.selection.id, revision: saved.selection.revision }).then(value => ({ value }), (error: unknown) => ({ error }));
    // The store invalidates first and commits the CAS before waiting for its original Run to finish cancelling.
    const result = await until("persisted revocation", async () => {
      const current = await f.person.invoke(agentDelegationActions.prepare, { ...choice, choices: [] });
      return current.selection?.revoked_at ? current : undefined;
    });
    assert.equal(result.selection?.mode, "confirm");
    release.resolve();
    assert.deepEqual(await revoked, { value: { storage_version: result.storage_version, lifecycle: result.lifecycle, cancellation_pending: false, selection: result.selection } });
    const refusal = await until("Pages refusal", () => seen.find(row => row.capability_id === update.capability_id && row.audience === "agent"));
    assert.equal(refusal.ok, false);
    assert.deepEqual(pagesRows(f.home), before);
  } finally { release.resolve(); }
}));

test("APR-11 ASC-51/52: stopping the original work closes its permission across restart until a person explicitly grants again", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t), work = createWork(f, "Stopped minutes");
  const { document } = await f.person.invoke(pagesActions.create, { title: "Stopped minutes" });
  const edit = updateReply({ id: document.id, expected_version: document.version, markdown: "Original round edit" });
  const chosen = await grantWork(f, work.work_id, [document.id]);
  // A request outside the original scope is left at a real SDK wait.
  const { folder } = await f.person.invoke(pagesActions.createFolder, { title: "Move requires approval" });
  f.steps.push(updateReply({ id: document.id, expected_version: document.version, folder_id: folder.id, markdown: "Do not move" }));
  await f.service.send({ work_id: work.work_id, text: "Move these minutes", request_id: "scope-stop-0001" }, { project_ref: f.reference });
  const pending = await until("original pending", () => f.reviews().find(row => row.status === "pending"));
  const stopped = await f.service.control(work.work_id, { kind: "stop" });
  assert.equal(stopped.work.state, "stopped");
  assert.notEqual(f.agents.agentHost.reviews.receipt(pending.review_id)?.status, "approved");
  const next = await f.reopen();
  const where = { work_id: work.work_id, lifetime: "work" as const, choices: [] };
  assert.equal((await next.person.invoke(agentDelegationActions.prepare, where)).lifecycle, "ended");
  await assert.rejects(next.service.send({ work_id: work.work_id, text: "Continue without reopening", request_id: "scope-stop-0002" }, { project_ref: f.reference }),
    { code: "agent.delegation_ended" });
  assert.deepEqual((await next.person.invoke(pagesActions.get, { id: document.id })).document, document);
  const reopened = await grantWork(next, work.work_id, [document.id]);
  assert.equal(reopened.lifecycle, "open");
  assert.notEqual(reopened.selection?.id, chosen.selection?.id);
  f.steps.push(edit);
  await next.service.send({ work_id: work.work_id, text: "Edit the minutes", request_id: "scope-stop-0003" }, { project_ref: f.reference });
  await until("reopened write", async () => (await next.person.invoke(pagesActions.get, { id: document.id })).document.version === document.version + 1 ? true : undefined);
  assert.ok(next.reviews().some(row => row.source?.kind === "delegation" && row.source.delegation.id === reopened.selection?.id));
}));

test("APR-08/11 H1: a revoked grant with an unacknowledged stop can only be settled by its current human management entry", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t), work = createWork(f, "Retry original stop");
  const { document } = await f.person.invoke(pagesActions.create, { title: "Stop receipt" });
  const saved = await grantWork(f, work.work_id, [document.id]);
  assert.ok(saved.selection);
  await f.agents.ready;
  const owner = f.agents.agentHost.workDelegations("prologue");
  assert.ok(owner);
  let settlements = 0;
  const unbind = owner.subscribe(change => change.reason === "selection" ? { settle: async () => {
    if (++settlements === 1) throw new Error("First stop acknowledgement unavailable");
  } } : undefined);
  try {
    const scope = { work_id: work.work_id, lifetime: "work" as const };
    const token = { ...scope, expected_version: saved.storage_version, id: saved.selection.id, revision: saved.selection.revision };
    await assert.rejects(f.person.invoke(agentDelegationActions.revoke, token), { code: "agent.delegation_cancellation_pending" });
    const current = await f.person.invoke(agentDelegationActions.prepare, { ...scope, choices: [] });
    assert.equal(current.cancellation_pending, true);
    assert.ok(current.selection?.revoked_at);
    assert.equal(current.selection.mode, "confirm");
    const retry = { ...token, expected_version: current.storage_version, revision: current.selection.revision };
    await assert.rejects(f.person.invoke(agentDelegationActions.settle, token), { code: "actions.conflict" });
    await assert.rejects(f.actions.invoke({ ...f.caller, audience: "agent", actor_kind: "runtime" }, agentDelegationActions.settle, retry), { code: "actions.forbidden" });
    assert.equal(settlements, 1);
    const settled = await f.person.invoke(agentDelegationActions.settle, retry);
    assert.deepEqual(settled, { storage_version: current.storage_version, lifecycle: "open", cancellation_pending: false, selection: current.selection });
    assert.equal(settlements, 2);
  } finally { unbind(); }
}));

test("APR-07/12/13: exact parameters are previewed, and an original reversible change records policy before a real Todo write", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t), work = createWork(f, "Follow-up for minutes");
  const action = { capability_id: todoActions.create.capability_id, version: todoActions.create.version, provider_id: TODO_PLUGIN_ID };
  const input = { title: "Follow up on the approved minutes" };
  const preview = (params: Record<string, unknown>) => f.person.invoke(agentDelegationActions.prepare, {
    work_id: work.work_id, lifetime: "work", choices: [{ action, kind: "exact", input: params }],
  });
  const prepared = await preview(input);
  assert.equal(prepared.candidates[0]?.state, "ready", JSON.stringify(prepared.candidates));
  assert.equal(prepared.candidates[0]?.exact_parameters, JSON.stringify(input));
  const sensitive = await preview({ title: "Example password=demo-only" });
  assert.equal(sensitive.candidates[0]?.state, "unavailable");
  assert.equal(sensitive.candidates[0]?.exact_parameters, undefined);

  let sourceAtDispatch = false;
  f.setPolicy((caller, view) => {
    if (caller.audience === "agent" && caller.signal && view.capability_id === action.capability_id) {
      sourceAtDispatch ||= f.reviews().some(row => row.source?.kind === "policy" && row.status === "approved");
    }
  });
  f.steps.push(() => reply({ name: "change-reversible", input: { ...action, input } }));
  await f.service.send({ work_id: work.work_id, text: input.title, request_id: "permission-original-reversible" }, { project_ref: f.reference });
  await until("original policy write", async () => (await f.person.invoke(todoActions.list, { view: "all" })).items.find(row => row.title === input.title));
  await until("reversible work completed", async () => (await f.service.read(work.work_id)).work.state === "completed" ? true : undefined);
  await f.agents.agentHost.reviews.refresh(f.projectId);
  const receipt = f.reviews().find(row => row.source?.kind === "policy");
  assert.ok(receipt?.effect_settled && receipt.source?.kind === "policy");
  assert.equal(receipt.source.owner, "agent.assistant-reversible");
  assert.equal(sourceAtDispatch, true);
  const next = await f.reopen();
  await next.agents.ready;
  await next.agents.agentHost.reviews.refresh(f.projectId);
  assert.deepEqual(next.reviews().find(row => row.review_id === receipt.review_id)?.source, receipt.source);
}));

test("APR-11: a late live answer cannot become input after the original work stops", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t), work = createWork(f, "Waiting for a date");
  f.steps.push(() => reply({ name: "ask-user", input: { why: "Which date?", questions: [{ id: "date", type: "text", prompt: "Enter a date" }] } }));
  const sent = await f.service.send({ work_id: work.work_id, text: "Ask me which date", request_id: "permission-original-question" }, { project_ref: f.reference });
  const question = await until("question in original live run", async () => (await f.service.read(work.work_id)).rounds[0]?.awaiting_input[0]);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const answer = f.service.outcomes.answer(work.work_id, { run_id: sent.run_id!, pending_id: question.pending_id, pending_revision: question.pending_revision,
    answers: [{ question: 0, value: "14 November" }] }, { beforeStart: async () => { entered.resolve(); await release.promise; } })
    .then(value => ({ value }), (error: unknown) => ({ error }));
  try {
    await Promise.race([entered.promise, answer.then(outcome => { throw new Error("Answer never reached its authorization check: " + JSON.stringify(outcome)); })]);
    assert.equal((await f.service.control(work.work_id, { kind: "stop" })).work.state, "stopped");
  } finally { release.resolve(); }
  const outcome = await answer;
  assert.ok("error" in outcome);
  assert.match(String(outcome.error), /权限已结束|授权已经结束/);
  const round = (await f.service.read(work.work_id)).rounds[0]!;
  assert.ok(round.turns.every(turn => !turn.text?.includes("14 November")));
}));
