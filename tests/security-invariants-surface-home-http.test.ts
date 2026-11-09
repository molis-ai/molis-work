import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { bindActionHandler, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

const route = "/api/host/surface-home";
const findCard = (description: SurfaceDescription, owner: string) => description.groups.find(group => group.kind === "plugin" && group.owner_plugin_id === owner);

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json() as T;
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
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
  const membership = "/api/settings/projects/" + f.project.project_id + "/plugins";
  await json(await f.request(membership, { method: "POST", body: { plugin_id: "inbox" } }));
  await f.warm();
  const read = await f.read();
  assert.equal(findCard(read, "io.molis.work.inbox")?.state, "undeclared");
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

  await json(await f.request(membership, { method: "DELETE", body: { plugin_id: "inbox" } }));
  await json(await f.request(membership, { method: "DELETE", body: { plugin_id: "todo" } }));
  const next = await f.read({ home_order: ["io.molis.work.todo"] });
  const disabled = findCard(next, "io.molis.work.inbox");
  assert.equal(disabled?.state, "disabled");
  assert.deepEqual(disabled.plugin_card, {}, "removal does not give a stage, summary or guessed member revision");
  assert.equal(findCard(next, "io.molis.work.todo"), undefined);
  assert.equal(findCard(next, f.crashing.id)?.state, "unreadable");
  assert.equal(findCard(next, "io.molis.work.coding"), undefined);
});
