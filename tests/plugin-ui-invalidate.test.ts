import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * PG-061: a plugin tells its own open pages to read again (`services.ui.invalidate()`), the way Files and Git will once their
 * Host ports are gone. What a page watches is the plugin's `/view-revision` (`scope.watchRevision`), so that is what these read.
 */

/** A project plugin with one view (unless `views` is false) and a command whose handler makes its pages read again. */
function viewProbe(name: string, views = true) {
  const id = `io.molis.work.example.${name}`, write = `${name}:write`, contexts: PluginStartContext[] = [], atStart: unknown[] = [];
  const touch: ActionDefinition<Record<string, never>, string> = { capability_id: `${name}.touch`, version: 1, operation: "command",
    action: { title: "改动", description: "改了以后让自己的页面重新读取", kind: "operation", scope: "project", audiences: ["user"], permissions: [write],
      subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } };
  const view = { contribution_id: `${id}.list`, kind: "embedded" as const, label: "列表", slots: [] };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `views-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: write, required: true, reason: "改动自己的内容" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: views ? { contributions: [view.contribution_id], views: [{ view_id: "list", slot: "navigator", title: "列表" }] } : { contributions: [] },
    actions: [touch], routes: [{ route_id: "touch", method: "POST", path: "/touch", permission: write }] },
  async start(context) {
    contexts.push(context);
    // Before the activation runs nothing moves, and nothing is refused either (PG061-01).
    try { context.services!.ui.invalidate(); atStart.push("quiet"); } catch (error) { atStart.push(error); }
    return { kind: "app", views: views ? [{ descriptor: view, render: () => "<p>列表</p>" }] : [],
      actions: [{ ...touch, async handle(caller) { await caller.beforeEffect(); context.services!.ui.invalidate(); return "touched"; } }],
      routes: [bindPluginActionRoute(context, touch, () => ({}), "touch")] };
  } };
  return { id, definition, contexts, atStart, current: () => contexts.at(-1)!.services!.ui };
}

async function viewRig(t: TestContext, probes: readonly ReturnType<typeof viewProbe>[]) {
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: probes.map(probe => probe.definition) } } });
  const project = await s.createProject("页面重新读取");
  const call = (path: string, method = "GET") => fetch(`${s.origin}/projects/${project.project_id}/api/plugins/${path}`, { method,
    headers: { origin: s.origin, "content-type": "application/json", "x-molis-work-control-token": s.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    ...(method === "GET" ? {} : { body: "{}" }) });
  const revision = async (probe: ReturnType<typeof viewProbe>) => {
    const response = await call(`${probe.id}/view-revision`);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json() as { revision: string }).revision;
  };
  return { call, revision };
}

const outsideAnyCall = (run: () => void) => new Promise<void>((resolve, reject) => { setTimeout(() => { try { resolve(run()); } catch (error) { reject(error); } }, 0); });

test("PG061-01 PG061-02 a project plugin's own pages read again, from its action or a timer; start is quiet and other plugins' pages stay", { timeout: 60_000 }, async t => {
  const files = viewProbe("viewsone"), other = viewProbe("viewstwo"), { call, revision } = await viewRig(t, [files, other]);
  const initial = await revision(files), untouched = await revision(other);
  assert.match(initial, /:0$/u, "an invalidate during start moves nothing");
  assert.deepEqual(files.atStart, ["quiet"], "and refuses nothing");
  const touched = await call(`${files.id}/touch`, "POST");
  assert.equal(touched.status, 200, await touched.clone().text());
  const afterAction = await revision(files);
  assert.notEqual(afterAction, initial, "PG061-01 an action's invalidate moves the plugin's revision");
  // Files and Git will call it from their watchers, where no action is running.
  await outsideAnyCall(() => files.current().invalidate());
  assert.notEqual(await revision(files), afterAction, "PG061-01 so does one from outside any call");
  assert.equal(await revision(other), untouched, "PG061-02 another plugin's pages are not told to read again");
});

test("PG061-03 the call is bound to its activation: after a restart the old one does nothing and the new one counts", { timeout: 60_000 }, async t => {
  const probe = viewProbe("viewsrestart"), { call, revision } = await viewRig(t, [probe]);
  await revision(probe); // a project plugin starts on its first request
  const old = probe.current();
  const restarted = await call(`${probe.id}/restart`, "POST");
  assert.equal(restarted.status, 200, await restarted.clone().text());
  assert.equal(probe.contexts.length, 2);
  const before = await revision(probe);
  // BL-411: the old activation is refused, and the refusal throws nothing into the timer that made it.
  assert.equal(await outsideAnyCall(() => old.invalidate()), undefined);
  assert.equal(await revision(probe), before, "the refused call moves nothing");
  probe.current().invalidate();
  assert.notEqual(await revision(probe), before, "the running activation's call counts");
});

test("PG061-04 a plugin whose Manifest declares no view is refused", { timeout: 60_000 }, async t => {
  const probe = viewProbe("viewsnone", false), { revision } = await viewRig(t, [probe]);
  const before = await revision(probe);
  assert.deepEqual(probe.atStart.map(item => (item as { code?: string }).code), ["ui_host.plugin_denied"], "refused during start too");
  assert.throws(() => probe.current().invalidate(), { code: "ui_host.plugin_denied" });
  assert.equal(await revision(probe), before);
});

test("PG061-05 PG061-03 BL411-04 a Home instance moves the Home route's revision until it is disabled", { timeout: 60_000 }, async t => {
  const probe = homeProbe("homeviews"), view = { contribution_id: `${probe.id}.panel`, kind: "embedded" as const, label: "面板", slots: [] };
  probe.definition.manifest = { ...probe.definition.manifest, ui: { contributions: [view.contribution_id], views: [{ view_id: "panel", slot: "island", title: "面板" }] } };
  const start = probe.definition.start;
  probe.definition.start = async context => ({ ...await start(context), views: [{ descriptor: view, render: () => "<p>面板</p>" }] });
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  const { host, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  const route = (operation: string) => `/api/plugins/${probe.id}/${operation}`;
  const revision = async () => (await (await request(route("view-revision"))).json() as { revision: string }).revision;
  const before = await revision(), running = probe.contexts.at(-1)!.services!.ui;
  await outsideAnyCall(() => running.invalidate());
  const after = await revision();
  assert.notEqual(after, before, "PG061-05 a Home instance's own pages read again");
  assert.equal((await request(route("disable"), { method: "POST", body: {} })).status, 200);
  assert.equal(await outsideAnyCall(() => running.invalidate()), undefined, "PG061-03 BL411-04 a stopped activation is refused, and throws nothing into its timer");
  assert.equal((await request(route("enable"), { method: "POST", body: {} })).status, 200);
  assert.equal(await revision(), after, "the refused call moved nothing");
  // Running again, it is the new activation that counts: the old one stays without effect, so the revision can only move if it is not.
  const again = probe.contexts.at(-1)!.services!.ui;
  assert.notEqual(again, running, "enabling starts another activation");
  assert.equal(await outsideAnyCall(() => running.invalidate()), undefined, "PG061-03 an activation that stopped stays refused once another runs");
  assert.equal(await revision(), after, "and moves nothing");
  again.invalidate();
  assert.notEqual(await revision(), after, "the running activation's call counts");
  assert.deepEqual(entries.filter(entry => entry.event === "stopped_service_call").map(entry => entry.fields),
    [{ plugin_id: probe.id, install_id: host.homePlugins!.installation(probe.id)!.install_id, service: "ui", method: "invalidate" }],
    "BL411-04 the Home logs the stopped instance's first call of the method, once");
});
