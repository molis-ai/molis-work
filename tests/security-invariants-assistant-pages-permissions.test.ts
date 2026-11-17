import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService, installHostUiText, molisWorkHostProjectReference, runWithLocale, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentDelegationActions, type AgentDelegationActionChoice } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PAGES_ACTION_PERMISSIONS, PAGES_HOME_STORE, PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID, pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { TODO_ACTION_PERMISSIONS, TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID, todoActions } from "@molis-ai/molis-work-plugin-todo";
import { homeSqlitePath, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { watchSettlements } from "./fixtures/settlements.js";
import { serveTestHost } from "./fixtures/test-home.js";

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

async function fixture(t: TestContext, homePlugins: readonly PluginDefinition[] = []) {
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
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const address = url instanceof Request ? url.url : String(url);
    if (address.startsWith("http://127.0.0.1:") && !address.startsWith("http://127.0.0.1:1/")) return localFetch(url, init);
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : "";
    const review = asideReply(body);
    return review ? reply(undefined, review) : await (steps.shift()?.() ?? reply());
  });
  let policy: (caller: ActionCallContext, view: ActionView) => void | Promise<void> = () => {};
  let local: MolisWorkLocalHost | undefined;
  const open = async () => {
    local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: homePlugins }, actionAvailability: async (caller, view) => {
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

test("APR-11: a never-run draft ends its stored grant across restart and ordinary restore", { timeout: 45_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t);
  const { document } = await f.person.invoke(pagesActions.create, { title: "Unsent draft scope", markdown: "Original" });
  const work = createWork(f, "Unsent draft");
  const choice = { work_id: work.work_id, lifetime: "work" as const, choices: [objectChoice(document.id)] };
  const preview = await f.person.invoke(agentDelegationActions.prepare, choice);
  const grant = { ...choice, expected_version: preview.storage_version, candidate_digest: preview.candidate_digest, mode: "automatic" as const, expires_at: null };
  await f.person.invoke(agentDelegationActions.grant, grant);

  const next = await f.reopen();
  assert.equal(next.agents.agentHost.workDelegations("prologue"), undefined);
  assert.equal((await next.service.archive(work.work_id, true)).archived, true);
  assert.equal((await next.service.archive(work.work_id, false)).archived, false);
  assert.equal(next.store.get(person, work.work_id).session_id, null);
  const restored = await next.person.invoke(agentDelegationActions.prepare, choice);
  assert.equal(restored.lifecycle, "ended");
  assert.ok(restored.selection?.revoked_at);
  await assert.rejects(next.person.invoke(agentDelegationActions.grant, grant), { code: "actions.conflict" });
  await assert.rejects(next.service.send({ work_id: work.work_id, text: "Continue on the old grant", request_id: "archived-draft-old-send" },
    { project_ref: f.reference }), { code: "agent.delegation_ended" });
  assert.deepEqual((await next.person.invoke(pagesActions.get, { id: document.id })).document, document);
  assert.equal(next.store.get(person, work.work_id).session_id, null);
}));

// ASC-52 is proven by the restart and revoke interleavings here.
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
    assert.deepEqual(pagesRows(f.home), before);
    assert.equal(refusal.ok, false, JSON.stringify(seen.filter(row => row.capability_id === update.capability_id)));
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
  await f.agents.agentHost.reviews.refresh(f.projectId);
  const originalReceipt = f.agents.agentHost.reviews.receipt(pending.review_id);
  assert.equal(originalReceipt?.status, "cancelled");
  assert.equal(originalReceipt?.source, undefined);
  const next = await f.reopen();
  await next.agents.ready;
  await next.agents.agentHost.reviews.refresh(f.projectId);
  const recoveredReceipt = next.agents.agentHost.reviews.receipt(pending.review_id);
  assert.deepEqual(recoveredReceipt, originalReceipt, "the SDK owner's original closed receipt survives a Home restart");
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
  assert.deepEqual((outcome.error as { code?: string }).code, "assistant.state");
  const round = (await f.service.read(work.work_id)).rounds[0]!;
  assert.ok(round.turns.every(turn => !turn.text?.includes("14 November")));
}));

test("APR-11: a Send held in the Pages owner cannot use permission granted after its original work stopped", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t);
  const { document } = await f.person.invoke(pagesActions.create, { title: "Read while sending", markdown: "The original page" });
  const work = createWork(f, "Wait for the original person");
  await grantWork(f, work.work_id, [document.id]);
  f.steps.push(() => reply({ name: "ask-user", input: { why: "Which date?", questions: [{ id: "date", type: "text", prompt: "Enter a date" }] } }));
  const first = await f.service.send({ work_id: work.work_id, text: "Ask me which date", request_id: "permission-send-original" }, { project_ref: f.reference });
  await until("original round awaits an answer", async () => (await f.service.read(work.work_id)).rounds[0]?.awaiting_input[0]);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  f.setPolicy(async (caller, view) => {
    if (caller.audience !== "user" || view.capability_id !== pagesActions.subject.capability_id || !caller.allowed_actions?.length) return;
    entered.resolve(); await release.promise;
  });
  const subject = { kind: "pages_document", id: document.id }, request = "permission-send-held";
  const sending = f.service.send({ work_id: work.work_id, request_id: request, text: "This input should never arrive",
    materials: [{ material_id: "original-page", kind: "object", title: document.title, explicit: true, object: subject,
      reference: { material: { subject, pin: { mode: "current", read_revision: String(document.version) } } } }] }, { project_ref: f.reference });
  const rejected = assert.rejects(sending, { code: "assistant.state" });
  let stopped;
  try {
    await Promise.race([entered.promise, sending.then(() => assert.fail("the original Send should remain held"), error => { throw error; })]);
    assert.equal((await f.service.control(work.work_id, { kind: "stop" })).work.state, "stopped");
    await grantWork(f, work.work_id, [document.id]);
    stopped = f.store.get(person, work.work_id);
  } finally { release.resolve(); }
  await rejected;
  assert.deepEqual(f.store.get(person, work.work_id), stopped, "a late input leaves no draft or work revision");
  const latest = await f.service.read(work.work_id);
  assert.deepEqual(latest.rounds.map(row => row.run_id), [first.run_id]);
  assert.ok(latest.rounds[0]!.turns.every(turn => !turn.text?.includes("This input should never arrive")));
  assert.ok(latest.objects.every(object => object.subject.id !== document.id), "a late input leaves no material link");
  assert.equal(f.store.requests.read(person, request).state, "not-sent");
}));

test("APR-07/08/11 H1: the actual permission picker uses the live original Pages proposal, and saves for later without approving it", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const f = await fixture(t);
  const browser = await serveTestHost(t, { home: f.home, host: f.host });
  const { document } = await f.person.invoke(pagesActions.create, { title: "Choose by real title", markdown: "Original" });
  const { folder } = await f.person.invoke(pagesActions.createFolder, { title: "Other project folder" });
  const work = createWork(f, "Change the minutes");
  f.steps.push(updateReply({ id: document.id, expected_version: document.version, markdown: "Do not run this old request", folder_id: folder.id }));
  await f.service.send({ work_id: work.work_id, request_id: "choice-original-pending", text: "Change and move the page" }, { project_ref: f.reference });
  const review = await until("original Pages decision with scoped choices", async () => (await f.service.read(work.work_id)).reviews.find(row => row.permission_available));
  const ref = { review_id: review.review_id, version: review.version, lifetime: "work" };
  const path = `/projects/${f.projectId}/api/assistant/works/${work.work_id}/permission`;
  const preview = await browser.web.get<{ preview: { candidate_digest: string; storage_version: number; candidates: Array<{ operations: Array<{ key: string; targets: Array<{ values: Array<{ label: string }> }> }> }> } }>(
    path + "?" + new URLSearchParams({ ...ref, selected: "edit" }));
  assert.deepEqual(preview.preview.candidates[0]?.operations.map(operation => [operation.key, operation.targets[0]?.values[0]?.label]), [["edit", "Choose by real title"]]);
  const picked = { ...ref, mode: "automatic", selected: ["edit"], expected_version: preview.preview.storage_version, candidate_digest: preview.preview.candidate_digest };
  await assert.rejects(browser.web.post(path, { ...picked, choices: [objectChoice(document.id)] }), { code: "assistant.invalid" });
  await assert.rejects(browser.web.post(path, { ...picked, selected: ["move"] }), { code: "actions.conflict" });
  const before = (await f.person.invoke(pagesActions.get, { id: document.id })).document;
  const saved = await browser.web.post<{ selection: { id: string } }>(path, picked);
  assert.ok(saved.selection.id);
  await f.agents.agentHost.reviews.refresh(f.projectId);
  assert.notEqual(f.agents.agentHost.reviews.receipt(review.review_id)?.status, "approved");
  assert.deepEqual((await f.person.invoke(pagesActions.get, { id: document.id })).document, before);
  await assert.rejects(browser.web.post(path, picked));
  f.steps.push(updateReply({ id: document.id, expected_version: before.version, markdown: "Next round only" }));
  await f.service.send({ work_id: work.work_id, request_id: "choice-following-round", text: "Only edit the page" }, { project_ref: f.reference });
  await until("real update from new permission", async () => (await f.person.invoke(pagesActions.get, { id: document.id })).document.version > before.version ? true : undefined);
  assert.deepEqual((await f.person.invoke(pagesActions.get, { id: document.id })).document.body, body("Next round only"));
  await f.agents.agentHost.reviews.refresh(f.projectId);
  assert.ok(f.reviews().some(row => row.source?.kind === "delegation" && row.source.delegation.id === saved.selection.id && row.effect_settled));
}));

test("APR-11: an empty target needs a label from its own provider before it can be granted", { timeout: 45_000 }, async t => runWithLocale("en", async () => {
  const pluginId = "io.molis.work.fixture.permission-location";
  const action: ActionDefinition = { capability_id: "fixture.permission_location.move", version: 1, operation: "command", action: {
    title: "Move a note", description: "Set the note's folder or collection", kind: "operation", scope: "home", audiences: ["user", "agent"],
    permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { folder: { type: "string" }, collection: { type: "string" } }, additionalProperties: false },
    delegation: {
      targets: [
        { key: "folder", field: "folder", kind: "fixture-folder", title: "Folder", empty_title: { key: "permission-location.scope.root" } },
        { key: "collection", field: "collection", kind: "fixture-collection", title: "Collection",
          empty_title: { key: "permission-location.scope.collection", fallback: "No collection" } },
      ],
      operations: [
        { key: "folder", title: "Choose folder", fields: ["folder"], targets: ["folder"], when: ["folder"] },
        { key: "collection", title: "Choose collection", fields: ["collection"], targets: ["collection"], when: ["collection"] },
      ],
      control_fields: [],
    },
  } };
  const plugin: PluginDefinition = {
    manifest: { schema_version: 1, host_api_version: 1, plugin_id: pluginId, name: "Note location", kind: "app", version: "1.0.0",
      publisher: { publisher_id: "fixture", signature: "fixture-permission-location" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, permissions: [], ui: { contributions: [] }, actions: [action] },
    async start() { return { kind: "app", actions: [{ ...action, handle: () => assert.fail("declaring a scope does not run the action") }] }; },
  };
  const f = await fixture(t, [plugin]);
  const work = f.store.create({ actor_id: person, title: "Move a note", scope: { kind: "personal" }, origin: null });
  const client = bindActionClient(f.host.homeActionClient(), () => ({ ...f.caller, project_id: null }));
  const view = (await client.discover()).find(row => row.capability_id === action.capability_id);
  assert.ok(view?.availability.available && view.provider.plugin_id === pluginId, JSON.stringify(view));
  const proposal = (key: "folder" | "collection") => ({ work_id: work.work_id, lifetime: "work" as const, choices: [{
    kind: "objects" as const, action: { capability_id: action.capability_id, version: action.version, provider_id: view.provider.provider_id },
    operations: [{ key, targets: [{ key, ids: [""] }] }],
  }] });
  const unnamed = proposal("folder"), preview = await client.invoke(agentDelegationActions.prepare, unnamed);
  assert.equal(preview.candidates[0]?.state, "unavailable");
  assert.equal(preview.candidates[0]?.operations, undefined);
  await assert.rejects(client.invoke(agentDelegationActions.grant, { ...unnamed, mode: "automatic",
    expires_at: null, expected_version: preview.storage_version, candidate_digest: preview.candidate_digest }), { code: "assistant.invalid" });
  const named = proposal("collection"), available = await client.invoke(agentDelegationActions.prepare, named);
  assert.equal(available.storage_version, preview.storage_version);
  assert.equal(available.selection, null);
  assert.equal(available.candidates[0]?.state, "ready");
  assert.deepEqual(available.candidates[0]?.operations?.[0]?.targets[0]?.values, [{ id: "", label: "No collection" }]);
  const saved = await client.invoke(agentDelegationActions.grant, { ...named, mode: "automatic", expires_at: null,
    expected_version: available.storage_version, candidate_digest: available.candidate_digest });
  assert.equal(saved.selection?.mode, "automatic");

  const pages = { work_id: createWork(f, "File a page").work_id, lifetime: "work" as const, choices: [{
    kind: "objects" as const, action: { capability_id: pagesActions.create.capability_id, version: pagesActions.create.version, provider_id: PAGES_PLUGIN_ID },
    operations: [{ key: "create", targets: [{ key: "folder", ids: [""] }, { key: "goal", ids: [""] }] }],
  }] };
  const labels = (candidate: typeof available) => candidate.candidates[0]?.operations?.[0]?.targets.map(target => target.values[0]?.label);
  const english = await f.person.invoke(agentDelegationActions.prepare, pages);
  const chinese = await runWithLocale("zh", () => f.person.invoke(agentDelegationActions.prepare, pages));
  assert.deepEqual(labels(english), ["Root folder", "No Goal"]);
  assert.deepEqual(labels(chinese), ["根目录", "不关联 Goal"]);
  assert.equal(english.candidate_digest, chinese.candidate_digest);
}));

test("APR-07/08/11 ASC-51/52: Assistant reuses one real connector MCP tool across restart and refuses changed account, input and dispatch authority", { timeout: 90_000 }, async t => runWithLocale("en", async () => {
  const writes: Array<{ account: string; note: string }> = [];
  let pause: { entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> } | undefined;
  let dropReceipt = false;
  const remote = createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== "Bearer fixture-" + request.url?.slice(1) + "-account") { response.writeHead(401).end(); return; }
      if (request.method === "GET") { response.writeHead(405).end(); return; }
      if (request.method === "DELETE") { response.writeHead(204).end(); return; }
      let text = ""; for await (const chunk of request) text += String(chunk);
      const message = JSON.parse(text) as { method: string; id?: number; params: { protocolVersion: string; arguments: { note: string } } };
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      let result: unknown;
      if (message.method === "initialize") result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "notes", version: "1" } };
      else if (message.method === "tools/list") {
        const gate = pause;
        if (gate) { pause = undefined; gate.entered.resolve(); await gate.release.promise; }
        result = { tools: [{ name: "record_note", inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false } }] };
      } else if (message.method === "tools/call") {
        writes.push({ account: request.url!, note: message.params.arguments.note });
        if (dropReceipt) { response.destroy(); return; }
        result = { content: [{ type: "text", text: "Note recorded" }] };
      } else { response.writeHead(400).end(); return; }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    } catch (error) { response.writeHead(500).end(String(error)); }
  });
  await new Promise<void>(resolve => remote.listen(0, "127.0.0.1", resolve));
  const address = remote.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { remote.closeAllConnections(); await new Promise<void>(resolve => remote.close(() => resolve())); });
  const f = await fixture(t), web = await serveTestHost(null, { home: f.home, host: f.host });
  t.after(() => web.close());
  const connect = async (account: string) => {
    const { connection_id: id } = await web.web.post<{ connection_id: string }>("/api/settings/connectors/methods/mcp/start", {
      service_id: "mcp-bearer", display_name: account, authentication: "bearer", token: `fixture-${account}-account`,
      endpoint: `http://127.0.0.1:${address.port}/${account}`,
    });
    const view = (await f.host.actionClient(f.reference).discover({ ...f.caller, permissions: ["mcp:external"] }))
      .find(row => row.provider.provider_id === "system.connectors#mcp:" + id && row.action.title === "record_note");
    assert.ok(view?.availability.available);
    return { id, action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } };
  };
  const first = await connect("personal"), other = await connect("team"), work = createWork(f, "Record notes in my service");
  const send = async (current: Pick<typeof f, "service">, target = first.action, note = "Original note") => {
    f.steps.push(() => reply({ name: "change-capability", input: { ...target, input: { note } } }));
    await current.service.send({ work_id: work.work_id, request_id: crypto.randomUUID(), text: "Record the requested note" }, { project_ref: f.reference });
  };
  const pending = (current: Pick<typeof f, "service">) => until("real MCP review", async () => (await current.service.read(work.work_id)).reviews[0]);
  const complete = (current: Pick<typeof f, "service">) => until("round completed", async () =>
    (await current.service.read(work.work_id)).work.state === "completed" ? true : undefined);
  await send(f);
  const original = await pending(f);
  const path = `/projects/${f.projectId}/api/assistant/works/${work.work_id}/permission`;
  const reference = { review_id: original.review_id, version: original.version, lifetime: "work" };
  const { automatic } = await web.web.get<{ automatic: { storage_version: number; candidate_digest: string; candidates: Array<{ state: string; exact_parameters?: string }> } }>(
    path + "?" + new URLSearchParams(reference));
  assert.equal(automatic.candidates[0]?.state, "ready");
  assert.deepEqual(JSON.parse(automatic.candidates[0]!.exact_parameters!), { note: "Original note" });
  const saved = await web.web.post<{ selection: { id: string; mode: string } }>(path, {
    ...reference, mode: "automatic", expected_version: automatic.storage_version, candidate_digest: automatic.candidate_digest,
  });
  assert.equal(saved.selection.mode, "automatic");
  assert.deepEqual(writes, [], "saving future scope sends no business request");
  await until("original work stopped after selection", async () => !(await f.service.read(work.work_id)).reviews.length ? true : undefined);
  await send(f); await complete(f);
  await f.agents.agentHost.reviews.refresh(f.projectId);
  assert.ok(f.reviews().some(row => row.source?.kind === "delegation" && row.source.delegation.id === saved.selection.id && row.effect_settled));
  await web.close();
  const next = await f.reopen();
  await send(next); await complete(next);
  const allowed = [{ account: "/personal", note: "Original note" }, { account: "/personal", note: "Original note" }];
  assert.deepEqual(writes, allowed);
  for (const [target, note] of [[other.action, "Original note"], [first.action, "Different note"]] as const) {
    await send(next, target, note);
    const review = await pending(next);
    assert.deepEqual(writes, allowed, "new account or arguments still require a decision");
    await next.service.outcomes.decide(work.work_id, { review_id: review.review_id, version: review.version, decision: "reject" });
    await complete(next);
  }
  const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
  pause = gate;
  try {
    await send(next);
    await until("remote tool discovery started", () => pause ? undefined : true);
    await gate.entered.promise;
    withConnectorConnections(f.home, store => { store.setEnabled(first.id, false); store.setEnabled(first.id, true); });
    gate.release.resolve();
    await complete(next);
    assert.deepEqual(writes, allowed, "changing the account generation during real tool discovery leaves no remote write");
  } finally { gate.release.resolve(); }
  await send(next);
  const expired = await pending(next);
  assert.deepEqual(writes, allowed, "the prior account revision cannot become automatic again");
  await next.service.outcomes.decide(work.work_id, { review_id: expired.review_id, version: expired.version, decision: "reject" });
  await complete(next);
  // A real request that reached the server and lost its response settles on the original SDK effect as unknown.
  dropReceipt = true;
  await send(next);
  const accepted = await pending(next);
  await next.service.outcomes.decide(work.work_id, { review_id: accepted.review_id, version: accepted.version, decision: "approve" });
  await until("server recorded the original request", () => writes.length > allowed.length ? true : undefined);
  const unknown = await until("original MCP result awaiting reconciliation", async () => {
    await next.agents.agentHost.reviews.refresh(f.projectId);
    const receipt = next.agents.agentHost.reviews.receipt(accepted.review_id);
    return receipt?.effect_uncertain ? receipt : undefined;
  });
  assert.equal(unknown.source?.kind, "person");
  const unresolved = await until("original Assistant run requires reconciliation", async () => {
    const state = await next.service.read(work.work_id);
    return state.rounds.at(-1)?.phase === "reconcile-required" ? state : undefined;
  });
  assert.equal(unresolved.work.work_id, work.work_id);
  // Ending the grant must not close, repeat, or retarget the already dispatched remote effect.
  await next.service.control(work.work_id, { kind: "stop" });
  const closed = await next.person.invoke(agentDelegationActions.prepare, { work_id: work.work_id, lifetime: "work", choices: [] });
  assert.equal(closed.lifecycle, "ended");
  const restarted = await f.reopen();
  const afterRestart = await restarted.service.read(work.work_id);
  assert.equal(afterRestart.rounds.at(-1)?.phase, "reconcile-required");
  assert.equal(afterRestart.rounds.at(-1)?.run_id, unresolved.rounds.at(-1)?.run_id);
  await restarted.agents.agentHost.reviews.refresh(f.projectId);
  const recovered = restarted.agents.agentHost.reviews.receipt(accepted.review_id);
  assert.ok(recovered?.effect_uncertain);
  assert.deepEqual(recovered.source, unknown.source);
  await assert.rejects(restarted.service.send({ work_id: work.work_id, text: "Continue", request_id: "mcp-after-stop-01" }, { project_ref: f.reference }),
    { code: "agent.delegation_ended" });
  assert.deepEqual(writes, [...allowed, allowed[0]], "an uncertain tool request is not replayed");
}));
