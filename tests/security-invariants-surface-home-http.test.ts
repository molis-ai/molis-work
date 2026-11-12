import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionHandler, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { join } from "node:path";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectPluginActions, type VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { registration as inbox } from "@molis-ai/molis-work-plugin-inbox/registration";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

const route = "/api/host/surface-home";
const findCard = (description: SurfaceDescription, owner: string) => description.groups.find(group => group.kind === "plugin" && group.owner_plugin_id === owner);

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json() as T;
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const INBOX = "io.molis.work.inbox";

/** The person's membership as the settings page reads it, with the revision a write must name. */
async function members(f: Fixture): Promise<VersionedProjectPluginMembership> {
  const { projects } = await json<{ projects: Array<VersionedProjectPluginMembership & { project_id: string }> }>(await f.request("/api/settings/project-plugins"));
  const row = projects.find(item => item.project_id === f.project.project_id);
  assert.ok(row);
  return { plugins: row.plugins, hidden: row.hidden, revision: row.revision };
}

async function setMember(f: Fixture, plugin_id: string, enabled: boolean) {
  const path = "/api/settings/projects/" + f.project.project_id + "/plugins";
  await json(await f.request(path, { method: enabled ? "POST" : "DELETE", body: { plugin_id, expected_revision: (await members(f)).revision } }));
}

function memberEvents(f: Fixture) {
  const db = openTestSqlite(join(f.home, "projects", "catalog.db"), { readonly: true });
  try {
    return db.prepare(`SELECT type, json_extract(payload_json, '$.plugin_id') AS plugin_id FROM project_events
      WHERE project_id = ? AND type IN ('project.plugin_added', 'project.plugin_removed') ORDER BY rowid`).all(f.project.project_id);
  } finally { db.close(); }
}

async function inboxRecords(f: Fixture) {
  const records = await f.host.withProject(f.project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const record = () => { const found = records.list().find(item => item.plugin_id === INBOX); assert.ok(found); return found; };
  return { records, record };
}

/** Inbox chosen, warmed and then removed: its home card is the restore card. */
async function removedInbox(f: Fixture) {
  await setMember(f, "inbox", true);
  await f.warm();
  await setMember(f, "inbox", false);
  const card = findCard(await f.read(), INBOX);
  assert.equal(card?.state, "disabled");
  const enable = card.plugin_card?.enable;
  assert.ok(enable?.kind === "project_membership");
  return enable;
}

async function fixture(t: TestContext) {
  const dual = dualPlugin("surface-dual", true);
  const overview = definePresentationOverviewAction("surface-dual.overview", 1, "Project overview", [dual.read]);
  const start = { capability_id: dual.actions.project.capability_id, version: dual.actions.project.version };
  dual.manifest.actions = [...dual.manifest.actions ?? [], overview];
  dual.manifest.presentation = { objects: [], overview: { capability_id: overview.capability_id, version: overview.version,
    note: { key: "surface-dual.note" }, start: [start] } };
  let reads = 0, starts = 0, modelCalls = 0;
  let wait: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const projectHalf = dual.half("project", () => ({ actions: [bindActionHandler(overview, async (_input, caller) => {
    reads++;
    const paused = wait;
    if (paused) { paused.entered.resolve(); await paused.release.promise; }
    return { summary: { key: "surface-dual.project-summary", args: [{ name: "project", kind: "text", text: caller.project_id! }] }, subjects: [], start: [start] };
  })] }));
  const homeHalf: PluginDefinition = { ...dual.home, start(context) { starts++; return dual.home.start(context); } };
  const crashing = dualPlugin("surface-crashing");
  const crashed: PluginDefinition = { manifest: { ...crashing.manifest, actions: [], ports: undefined, events: undefined, routes: [],
    artifacts: { produces: [], consumes: [] } }, start() { throw new Error("Fixture plugin crashed on its actual startup"); } };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: homeHalf, dual_instance: true }, crashed], project: [projectHalf] },
    completeText: async () => { modelCalls++; throw new Error("Homepage must not invoke the model"); } });
  const project = await f.project("Homepage"), prefix = "/projects/" + project.project_id;
  const post = (path: string, body: unknown = {}, headers?: Record<string, string>) => f.request(prefix + path, { method: "POST", body, headers });
  const read = (body: unknown = {}) => post(route, body).then(response => json<SurfaceDescription>(response));
  const click = (owner_plugin_id: string, target: unknown) => post(route + "/click", { owner_plugin_id, target });
  const warm = async () => { await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, permissions: [], audience: "user" }, project.reference); };
  return { ...f, project, prefix, post, read, click, warm, dual, crashing, counts: () => ({ reads, starts, modelCalls }),
    holdOverview() { return wait = { entered: deferred(), release: deferred() }; } };
}

test("S-surface-composition SCS-07 SCS-08 protected HTTP does not start a cold project, a plugin or a model; the two real halves supply one card", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  assert.equal((await f.request(f.prefix + route, { method: "POST", body: {}, authorized: false })).status, 403);
  const before = f.counts();
  const personalProjects = () => f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).read(catalog =>
    catalog.listProjects().filter(project => project.project_id === "personal"));
  assert.deepEqual(personalProjects(), []);
  await json(await f.request("/projects/personal" + route, { method: "POST", body: {} }), 404);
  assert.deepEqual(personalProjects(), [], "a read does not provision an unopened personal project");
  assert.equal(f.host.projects().some(project => project.project_id === f.project.project_id), false);
  await json(await f.post(route), 503);
  assert.equal(f.host.projects().some(project => project.project_id === f.project.project_id), false);
  await f.host.withProject(f.project.reference, () => undefined);
  const cold = await f.read({ home_order: [f.dual.id] });
  assert.equal(findCard(cold, f.dual.id), undefined);
  assert.deepEqual(f.counts(), before, "even the already-open project read cannot prepare providers or call a model");

  await f.warm();
  const result = await f.read({ home_order: ["io.molis.work.not-installed", f.dual.id] });
  assert.equal(result.groups.filter(group => group.owner_plugin_id === f.dual.id).length, 1);
  assert.equal(result.groups[1]?.owner_plugin_id, f.dual.id);
  assert.equal(findCard(result, "io.molis.work.not-installed"), undefined);
  const card = findCard(result, f.dual.id)?.plugin_card;
  assert.ok(card?.open);
  assert.deepEqual(card.summary, { owner: f.dual.id, key: "surface-dual.project-summary", args: [{ name: "project", kind: "text", text: f.project.project_id }] });
  assert.equal(card.open.installation.scope, "home");
  assert.equal(card.start?.[0]?.installation.scope, "project");
  assert.equal(f.counts().reads, 1, "a card with both halves reads its actual project overview once");
  assert.equal(f.counts().modelCalls, 0);

  const open = await json<{ kind: string; producer: string; selection: unknown; shell_key: string }>(await f.click(f.dual.id, card.open));
  assert.deepEqual([open.kind, open.shell_key, open.selection], ["stage", f.dual.id, { surface: "workbench", id: "stage", intent: "open" }]);
  assert.ok(open.producer);
  const mount = { contribution_id: f.dual.view, surface: "workbench", target_slot_id: "workbench.main" };
  const page = await json<{ page_id: string }>(await f.post("/api/host/plugin-pages", { plugin_id: f.dual.id, mount, producer: open.producer }));
  assert.ok(page.page_id);
  await json(await f.post("/api/host/plugin-pages", { plugin_id: f.dual.id, mount, producer: open.producer + "-changed" }), 409);
  await json(await f.post(route, {}, { "x-molis-plugin-page": page.page_id }), 403);
  await json(await f.click(f.dual.id, { ...card.open, installation: { ...card.open.installation, scope: "project" } }), 409);
  await json(await f.click(f.dual.id, { ...card.start![0], input: { call: "arbitrary" } }), 409);
  assert.equal(await f.host.withProject(f.project.reference, runtime => {
    const rows = new SqlitePluginPrivateStorage(runtime.store.db);
    return rows.snapshotInstallationData(card.start![0]!.installation.install_id).length;
  }), 0, "opening and rejected clicks leave plugin data alone");
  f.dual.inside(async caller => { await caller.beforeEffect(); f.dual.services.project!.storage!.set("clicks", "one"); });
  const invoked = await json<{ kind: string; result: unknown }>(await f.click(f.dual.id, card.start![0]));
  assert.deepEqual(invoked, { kind: "invoked", result: { half: "project", project_id: f.project.project_id } });
  assert.equal(f.dual.services.project!.storage!.get("clicks"), "one");
});

test("S-surface-composition SCS-08 SCS-09 a real overview suspended at the owner cannot return after grant withdrawal", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await f.warm();
  const records = await f.host.withProject(f.project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const record = records.list().find(item => item.plugin_id === f.dual.id);
  assert.ok(record?.grants.includes(f.dual.read));
  const wait = f.holdOverview(), pending = f.post(route);
  try {
    await Promise.race([wait.entered.promise, pending.then(async answer => assert.fail("The overview did not wait: " + await answer.clone().text()))]);
    records.save({ ...record, grants: record.grants.filter(grant => grant !== f.dual.read) });
    wait.release.resolve();
    const answer = await json<{ code: string; groups?: unknown }>(await pending, 403);
    assert.equal(answer.code, "actions.plugin_permission");
    assert.equal(answer.groups, undefined);
  } finally { wait.release.resolve(); records.save(record); }
  assert.equal(f.counts().reads, 1);
});

test("SCS-07 SCS-08 Catalog hiding, actual member removal and an actual failed startup remain different", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await setMember(f, "inbox", true);
  await f.warm();
  const read = await f.read();
  assert.equal(findCard(read, "io.molis.work.inbox")?.state, "ok");
  assert.equal(findCard(read, "io.molis.work.todo")?.state, "undeclared");
  assert.notEqual(f.host.homePlugins?.installation(f.crashing.id)?.state, "running");
  assert.equal(findCard(read, f.crashing.id)?.state, "unreadable");
  assert.equal(findCard(read, f.crashing.id)?.plugin_card?.enable, undefined);

  await f.host.closeProject(f.project.reference);
  await f.host.withProject(f.project.reference, () => undefined);
  const cold = findCard(await f.read(), "io.molis.work.inbox");
  assert.equal(cold?.state, "unreadable", "a selected native plugin with no current activation is not an explicit disable");
  assert.deepEqual(cold.plugin_card, {});
  await f.warm();

  await setMember(f, "inbox", false);
  await setMember(f, "todo", false);
  const next = await f.read({ home_order: ["io.molis.work.todo"] });
  const disabled = findCard(next, "io.molis.work.inbox");
  assert.equal(disabled?.state, "disabled");
  const { enable, ...rest } = disabled.plugin_card ?? {};
  assert.deepEqual(rest, {}, "removal gives no stage or summary");
  assert.ok(enable?.kind === "project_membership");
  assert.equal(enable.expected_revision, (await members(f)).revision, "the restore card carries the revision of this same Catalog read");
  assert.deepEqual(enable.action, { ref: projectPluginActions.set.capability_id + "@" + projectPluginActions.set.version, provider_id: PROJECT_WORKSPACE_PROVIDER_ID, primary: true });
  assert.equal(findCard(next, "io.molis.work.todo"), undefined);
  assert.equal(findCard(next, f.crashing.id)?.state, "unreadable");
  assert.equal(findCard(next, "io.molis.work.coding"), undefined);
});

test("SCS-11 a committed homepage command keeps its fact if the original authority changes before the reply", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await f.warm();
  const start = findCard(await f.read(), f.dual.id)?.plugin_card?.start?.[0];
  assert.ok(start?.kind === "invoke");
  const { records, storage } = await f.host.withProject(f.project.reference, runtime => ({
    records: new SqlitePluginRuntimeRepository(runtime.store.db), storage: new SqlitePluginPrivateStorage(runtime.store.db),
  }));
  const original = records.get(start.installation.install_id);
  assert.ok(original?.grants.includes(f.dual.read));
  f.dual.inside(async caller => {
    await caller.beforeEffect();
    f.dual.services.project!.storage!.set("committed-click", "once");
  });
  const log = f.host.callLog!;
  const record = log.record;
  let committed = 0;
  log.record = function (caller, action, outcome) {
    record.call(this, caller, action, outcome);
    // The real Kernel has finished the command and accepted its output, before the waiting HTTP entry can deliver it.
    if (action.capability_id === f.dual.actions.project.capability_id && outcome.ok) {
      committed++;
      records.save({ ...original, grants: original.grants.filter(grant => grant !== f.dual.read) });
    }
  };
  try {
    const response = await json<{ code: string; result?: unknown }>(await f.click(f.dual.id, start), 500);
    assert.equal(response.code, "actions.outcome_unknown");
    assert.equal(response.result, undefined);
    assert.equal(committed, 1);
    assert.deepEqual(storage.snapshotInstallationData(original.install_id), [{ item_key: "committed-click", item_value: "once" }]);
    const executions = log.list(f.project.project_id).filter(call => call.capability_id === f.dual.actions.project.capability_id);
    assert.equal(executions.reduce((count, call) => count + (call.count ?? 1), 0), 1, "the entry never retries an already committed command");
  } finally { log.record = record; records.save(original); }
});

test("S-surface-composition SCS-12 a removed native plugin comes back from its home card through Projects' setter, and only with the revision it showed", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const stale = await removedInbox(f), events = memberEvents(f).length;
  await setMember(f, "inbox", true);
  await setMember(f, "inbox", false);
  assert.equal((await members(f)).plugins.includes("inbox"), false, "an ABA leaves the same members under a new revision");
  await json(await f.click(INBOX, stale), 409);
  assert.equal(memberEvents(f).length, events + 2, "the stale card writes nothing");

  const { records, record } = await inboxRecords(f);
  const card = findCard(await f.read(), INBOX)?.plugin_card?.enable;
  assert.ok(card?.kind === "project_membership");
  const before = await members(f), original = record();
  records.save({ ...original, installation_generation: original.installation_generation + 1 });
  try {
    await json(await f.click(INBOX, card), 409);
  } finally { records.save(original); }
  assert.deepEqual(await members(f), before, "an unchanged revision does not cover a replaced installation");

  const restored = await json<{ kind: string }>(await f.click(INBOX, card));
  assert.deepEqual(restored, { kind: "enabled" });
  const after = await members(f);
  assert.ok(after.plugins.includes("inbox"));
  assert.notEqual(after.revision, before.revision);
  assert.deepEqual(memberEvents(f).at(-1), { type: "project.plugin_added", plugin_id: "inbox" });
  assert.equal(record().state, "running", "the Runtime switched the restored member on");
  assert.equal(findCard(await f.read(), INBOX)?.state, "ok");
  const count = memberEvents(f).length;
  await json(await f.click(INBOX, card), 409);
  assert.equal(memberEvents(f).length, count, "the same card is spent once it was used");
});

test("S-surface-composition SCS-12 a membership restore queued behind the Catalog writes nothing when its card or the page authority changed meanwhile", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const card = await removedInbox(f), before = await members(f), events = memberEvents(f).length;
  const { records, record } = await inboxRecords(f), original = record();
  const catalog = await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, value => value);
  const commit = catalog.commit;
  let waiting = deferred(), checks = 0;
  t.mock.method(catalog, "commit", <T>(write: () => T, check?: () => Promise<void>) => commit(write, async () => {
    await check?.();
    // The second acquisition check follows an actual SQLITE_BUSY: the change lands before the owner transaction's synchronous fence.
    if (++checks === 2) waiting.resolve();
  }));
  const queued = async (send: () => Promise<number | string>, during: () => Promise<unknown> | void) => {
    checks = 0; waiting = deferred();
    const blocker = openTestSqlite(join(f.home, "projects", "catalog.db"));
    blocker.exec("BEGIN IMMEDIATE");
    try {
      const pending = send();
      await Promise.race([waiting.promise, pending.then(status => assert.fail(`the restore answered ${status} before waiting for the Catalog`))]);
      await during();
      blocker.exec("ROLLBACK");
      return await pending;
    } finally { blocker.close(); }
  };
  try {
    const status = await queued(() => f.click(INBOX, card).then(response => response.status),
      () => records.save({ ...original, installation_generation: original.installation_generation + 1 }));
    assert.equal(status, 409);
  } finally { records.save(original); }

  const page = await fetch(f.origin + "/settings/appearance");
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(await page.text())?.[1];
  const cookie = page.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  assert.ok(proof && cookie);
  const headers = { cookie, "x-molis-work-page-session": proof };
  const status = await queued(() => f.request(f.prefix + route + "/click", { method: "POST", authorized: false, headers, body: { owner_plugin_id: INBOX, target: card } })
    .then(response => response.status, () => "disconnected"), async () => {
    assert.equal((await f.request("/api/web-session", { method: "DELETE", authorized: false, headers })).status, 200);
  });
  assert.ok(status !== 200, `a revoked page could still restore (${status})`);
  assert.deepEqual(await members(f), before);
  assert.equal(memberEvents(f).length, events, "neither a replaced installation nor a revoked page left a membership event");
  assert.equal(record().state, "disabled");
});

test("S-surface-composition SCS-12 a restore saved before its Runtime switch failed answers Projects' 503, and the card is not retried", { timeout: 60_000 }, async t => {
  let fail = false;
  const declaration = inbox.project_runtime!, create = declaration.create;
  t.mock.method(declaration, "create", () => {
    const definition = create();
    return { ...definition, async start(context: Parameters<typeof definition.start>[0]) {
      if (fail) throw new Error("fixture Inbox start failed");
      return definition.start(context);
    } };
  });
  const f = await fixture(t);
  const card = await removedInbox(f), events = memberEvents(f).length;
  fail = true;
  const answer = await json<{ code: string; details: { committed: boolean; membership?: VersionedProjectPluginMembership } }>(await f.click(INBOX, card), 503);
  assert.equal(answer.code, "host.project_plugins_refresh_failed");
  assert.equal(answer.details.committed, true);
  const saved = await members(f);
  assert.deepEqual(answer.details.membership, saved);
  assert.ok(saved.plugins.includes("inbox"), "the choice is saved although the switch did not finish");
  assert.equal(memberEvents(f).length, events + 1);
  await json(await f.click(INBOX, card), 409);
  assert.equal(memberEvents(f).length, events + 1, "a retry with the shown card writes nothing");
  fail = false;
  assert.equal((await f.request(f.prefix + "/")).status, 200);
  const { record } = await inboxRecords(f);
  assert.equal(record().state, "running", "reopening the project page repairs only the Runtime");
  assert.deepEqual(await members(f), saved);
});
