import { projectPluginRevisionAt } from "./fixtures/project-plugin-settings.js";
// RAC-20: streaming preserves the Host-issued project identity.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ISSUES_PLUGIN_ID, issuesManifest } from "@molis-ai/molis-work-plugin-issues";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginExecutionControl, PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { streamLines } from "./fixtures/plugin-stream.js";
import { grantHomeProbe, homeProbe, partitionInstallation, serveHomeRuntime } from "./fixtures/home-runtime.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

// Security invariant S-31 (docs/system/SECURITY-INVARIANTS.md): a plugin's route runs in a partition only when the page's path names it
// (`/projects/<id>/api/plugins/<plugin>/…`), that partition exists and has the plugin. The partition comes from the path alone: never from
// the route's query or body, and never from a control the plugin made itself. Issues runs in each partition it is added to (batch 108), so
// without the prefix there is no Issues to answer. A Home plugin's own route without the prefix runs in no project (the relay probe below).

const issue = { title: "项目里的问题", type: "bug", description: "在项目页面里记下" };

test("S-31 W5-01-STREAM-01 a partition route keeps the Host-issued project's identity while forwarding real action progress", { timeout: 60_000 }, async t => {
  // Give the real Home action a streamed route for this test. Its owner, SQL and Host-issued project control stay unchanged. The route
  // is declared in Issue's own Manifest before the Host starts and hands the definition over: the platform runs on the frozen copy it
  // takes then, so a route changed on the running instance would never be read.
  const declared = issuesManifest.routes!.find(candidate => candidate.route_id === "issues.create")!, originalStream = declared.stream;
  declared.stream = "ndjson";
  t.after(() => { if (originalStream === undefined) delete declared.stream; else declared.stream = originalStream; });
  const { home, host, request, project } = await serveHomeRuntime(t), current = await project("Stream into this project", ["issues"]);
  // The partition's instance starts when its route is first asked for.
  assert.equal((await request(`/projects/${current.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).status, 200);
  const { platform, install } = await partitionInstallation(host, current, ISSUES_PLUGIN_ID);
  assert.equal(platform.supervisor.manifest(ISSUES_PLUGIN_ID)!.routes!.find(candidate => candidate.route_id === "issues.create")!.stream, "ndjson",
    "the running instance was handed the streamed route");
  const action = platform.runtime.contribution(install.install_id)!.actions!.find(candidate => candidate.capability_id === "issues.create")!;
  const originalHandle = action.handle;
  action.handle = (caller, input) => { caller.on_progress?.({ stage: "saving", progress: 0.5 }); return originalHandle(caller, input); };
  t.after(() => { action.handle = originalHandle; });
  const lines = await streamLines(await request(`/projects/${current.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: issue }));
  assert.deepEqual(lines.filter(line => line.type === "progress"), [{ type: "progress", stage: "saving", progress: 0.5 }]);
  assert.equal(lines.at(-1)?.type, "result");
  assert.equal(createRows(home).at(-1)?.project_id, current.project_id);
  assert.equal(createRows(home).at(-1)?.ok, true);
});

/** The rows the Host's call log kept for Issue's create, oldest first: who asked, from which project, how it ended. */
function createRows(home: string): Array<{ project_id: string | null; ok: boolean }> {
  const file = join(home, "logs/action-calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { capability_id: string; project_id: string | null; ok: boolean })
    .filter(row => row.capability_id === "issues.create");
}

/** Issue's running create route in a project, the very binding the Host dispatches to, so a test can hold it or keep what it was handed. */
async function issueCreateRoute(host: MolisWorkLocalHost, request: (path: string) => Promise<Response>, space: { project_id: string; reference: LocalHostProjectReference }): Promise<PluginRouteBinding> {
  assert.equal((await request(`/projects/${space.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).status, 200);
  const { platform, install } = await partitionInstallation(host, space, ISSUES_PLUGIN_ID);
  const contribution = platform.runtime.contribution(install.install_id);
  const route = contribution?.kind === "app" ? contribution.routes?.find(candidate => candidate.route_id === "issues.create") : undefined;
  assert.ok(route, "Issue's create route is running");
  return route;
}

test("S-31 a partition plugin's route runs in the project its path names; without the prefix there is none to run", { timeout: 60_000 }, async t => {
  const { home, request, project } = await serveHomeRuntime(t);
  const one = await project("一号项目", ["issues"]), two = await project("二号项目", ["issues"]);
  const create = (prefix: string, query = "") => request(`${prefix}/api/plugins/${ISSUES_PLUGIN_ID}/create${query}`, { method: "POST", body: issue });

  const inOne = await create(`/projects/${one.project_id}`);
  assert.equal(inOne.status, 200, await inOne.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, one.project_id, "the call ran in the project its path names");

  // A project named in the query is not the Host's word; the path's project stays.
  const forgedQuery = await create(`/projects/${one.project_id}`, `?project_id=${encodeURIComponent(two.project_id)}`);
  assert.equal(forgedQuery.status, 200, await forgedQuery.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, one.project_id);

  const unprefixed = createRows(home).length, personal = await create("", `?project_id=${encodeURIComponent(one.project_id)}`);
  assert.notEqual(personal.status, 200, "without the prefix no partition answers, whatever the query says");
  assert.equal(createRows(home).length, unprefixed, "and nothing ran");

  // A project named in the body is the action's input, and Issue's input has no such field: refused, nothing written.
  const before = createRows(home).length;
  const forgedBody = await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: { ...issue, project_id: two.project_id } });
  assert.equal(forgedBody.status, 400);
  assert.equal((await forgedBody.json()).code, "actions.input_invalid");
  assert.ok(createRows(home).slice(before).every(row => !row.ok), "a refused body leaves no record that ran");
  const listed = await (await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).json() as { items: unknown[] };
  assert.equal(listed.items.length, 2, "only the two accepted creates are kept, in the project the path named");
  const other = await (await request(`/projects/${two.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).json() as { items: unknown[] };
  assert.deepEqual(other.items, [], "the project only the query named has none");
});

test("S-31 a project that does not exist, or does not have the plugin, refuses the route before it runs", { timeout: 60_000 }, async t => {
  const probe = homeProbe("routeprobe");
  const { home, host, origin, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  const shown = await project("显示 Issue", ["issues"]), hidden = await project("没有 Issue");
  const create = (projectId: string) => request(`/projects/${encodeURIComponent(projectId)}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: issue });

  const missing = await create("no-such-project");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "catalog.project_not_found", "the project chain refuses a partition that does not exist");
  const disabled = await create(hidden.project_id);
  assert.equal(disabled.status, 403);
  assert.equal((await disabled.json()).code, "actions.plugin_disabled");
  assert.deepEqual(createRows(home), [], "neither refusal reached the action");

  // RAC-569 (#679, ①): a Home plugin the build does not ship is personal, shown in every project until that project hides it, by its plugin id.
  const probeIn = (projectId: string) => request(`/projects/${encodeURIComponent(projectId)}/api/plugins/${probe.id}/state`);
  for (const partition of [hidden.project_id, shown.project_id]) {
    const enabled = await request(`/api/settings/projects/${partition}/plugins`, { method: "POST", body: { plugin_id: probe.id, expected_revision: await projectPluginRevisionAt(origin, partition) } });
    assert.equal(enabled.status, 200);
  }
  const probeShown = await probeIn(hidden.project_id);
  assert.equal(probeShown.status, 200, await probeShown.clone().text());
  assert.equal((await probeShown.json()).project_id, hidden.project_id);
  assert.deepEqual(probe.routed, [hidden.project_id], "the successful HTTP request reached the route handler");
  assert.deepEqual(probe.seen.map(call => call.project_id), [hidden.project_id], "the successful route reached the action handler");
  const hideProbe = await request(`/api/settings/projects/${hidden.project_id}/plugins`, { method: "DELETE", body: { plugin_id: probe.id, expected_revision: await projectPluginRevisionAt(origin, hidden.project_id) } });
  assert.equal(hideProbe.status, 200, await hideProbe.clone().text());
  assert.ok(!(await hideProbe.json()).plugins.includes(probe.id));
  const probeHidden = await probeIn(hidden.project_id);
  assert.equal(probeHidden.status, 403);
  assert.equal((await probeHidden.json()).code, "actions.plugin_disabled");
  assert.deepEqual(probe.routed, [hidden.project_id], "RAC-569: the hidden request was refused before the route handler ran");
  assert.deepEqual(probe.seen.map(call => call.project_id), [hidden.project_id], "the hidden request never reached the action handler");
  const probeElsewhere = await probeIn(shown.project_id);
  assert.equal(probeElsewhere.status, 200, "another project hiding it changes nothing here");
  assert.equal((await probeElsewhere.json()).project_id, shown.project_id);
  assert.deepEqual(probe.routed, [hidden.project_id, shown.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hidden.project_id, shown.project_id]);
  const unhideProbe = await request(`/api/settings/projects/${hidden.project_id}/plugins`, { method: "POST", body: { plugin_id: probe.id, expected_revision: await projectPluginRevisionAt(origin, hidden.project_id) } });
  assert.equal(unhideProbe.status, 200, await unhideProbe.clone().text());
  const probeRestored = await probeIn(hidden.project_id);
  assert.equal(probeRestored.status, 200, await probeRestored.clone().text());
  assert.equal((await probeRestored.json()).project_id, hidden.project_id);
  assert.deepEqual(probe.routed, [hidden.project_id, shown.project_id, hidden.project_id], "unhiding restores the next route call");
  assert.deepEqual(probe.seen.map(call => call.project_id), [hidden.project_id, shown.project_id, hidden.project_id]);
  // Only the Host's Home registration says which ids are such plugins: an id it does not register cannot be hidden, whatever the request says.
  const hideUnknown = await request(`/api/settings/projects/${hidden.project_id}/plugins`, { method: "DELETE", body: { plugin_id: "com.example.unregistered", expected_revision: await projectPluginRevisionAt(origin, hidden.project_id) } });
  assert.equal(hideUnknown.status, 400, await hideUnknown.clone().text());
  assert.equal((await hideUnknown.json()).code, "catalog.plugin_not_found");
  const probeAlone = await request(`/api/plugins/${probe.id}/state?project_id=${encodeURIComponent(shown.project_id)}`);
  assert.equal(probeAlone.status, 200, await probeAlone.clone().text());
  assert.equal((await probeAlone.json()).project_id, null, "without the prefix it runs as the person's own");
  // RAC-569 (#679): its page is found through the Home's registration, by its plugin id, though the build's catalog has no entry for it.
  const probePage = await request(`/plugins/${probe.id}`);
  assert.equal(probePage.status, 200, await probePage.clone().text());
  assert.match(await probePage.text(), new RegExp(`data-home-lifecycle=[\\s\\S]*${probe.id.replaceAll(".", "\\.")}`, "u"));
  assert.equal((await request(`/plugins/com.example.unregistered`)).status, 404, "a key the Home does not register opens no page");

  // A Home plugin's lifecycle operations are the Home's: under a project's path they are not there, and the plugin keeps running. (A
  // partition's plugin has the project's own lifecycle under its path, as every project plugin does.)
  for (const operation of ["disable", "enable", "retry", "restart", "upgrade", "release-quarantine"]) {
    const refused = await request(`/projects/${shown.project_id}/api/plugins/${probe.id}/${operation}`, { method: "POST", body: {} });
    assert.equal(refused.status, 404, operation);
    assert.equal((await refused.json()).code, "actions.missing", operation);
  }
  assert.equal(host.homePlugins!.installation(probe.id)!.state, "running");
  const allowed = await create(shown.project_id);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, shown.project_id);
});

test("S-31 a plugin cannot name the project itself: a project on a control the Host did not issue is not read", { timeout: 60_000 }, async t => {
  const id = "com.example.relay";
  const where: ActionDefinition<Record<string, never>, string | null> = { capability_id: "relay.where", version: 1, operation: "query",
    action: { title: "在哪个项目", description: "说出这次调用所在的项目", scope: "home", permissions: ["relay:read"], kind: "query",
      audiences: ["user"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } };
  const relay: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "relay", kind: "app",
    publisher: { publisher_id: "example", signature: "home-relay" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "探针" }, { permission: "relay:read", required: true, reason: "探针" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [where],
    routes: ["own", "plain", "spread"].map(name => ({ route_id: name, method: "GET" as const, path: `/${name}`, permission: "relay:read" })) },
    async start(context) {
      const actions = context.services!.actions!;
      // Each route asks its own action where it runs, passing the route's control as it came, a control it made, or a copy of the route's.
      const answer = (control: (request: PluginRouteRequest) => PluginExecutionControl) =>
        async (request: PluginRouteRequest) => ({ status: 200, body: { project_id: await actions.invoke(where, {}, control(request)) } });
      return { kind: "app", actions: [{ ...where, handle: caller => caller.project_id }], routes: [bindPluginActionRoute(context, where, () => ({}), "own"),
        { route_id: "plain", handle: answer(request => ({ signal: request.execution?.signal, beforeEffect: request.execution!.beforeEffect, project_id: "forged-project" })) },
        { route_id: "spread", handle: answer(request => ({ ...request.execution!, project_id: "forged-project" })) }] };
    } };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [relay] } });
  for (const name of ["own", "plain", "spread"]) {
    const response = await request(`/api/plugins/${id}/${name}?project_id=forged-project`);
    assert.equal(response.status, 200, `${name}: ${await response.clone().text()}`);
    const body = await response.json() as { project_id: string | null } | string | null;
    assert.equal(name === "own" ? body : (body as { project_id: string | null }).project_id, null, `${name}: the call runs in no project`);
  }
});

test("S-31 a project that takes the plugin away while its route waits gets no write", { timeout: 60_000 }, async t => {
  const { home, host, origin, request, project } = await serveHomeRuntime(t);
  const one = await project("等待中移除", ["issues"]);
  const route = await issueCreateRoute(host, request, one), original = route.handle.bind(route);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  // The route waits, as one waiting for a model or a service would, after the Host's checks at the start and before its write.
  route.handle = async routed => { entered.resolve(); await release.promise; return original(routed); };
  const pending = request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: issue });
  await entered.promise;
  const remove = await request(`/api/settings/projects/${one.project_id}/plugins`, { method: "DELETE", body: { plugin_id: "issues", expected_revision: await projectPluginRevisionAt(origin, one.project_id) } });
  assert.equal(remove.status, 200, await remove.clone().text());
  release.resolve();
  const response = await pending;
  assert.notEqual(response.status, 200, await response.clone().text());
  assert.ok(createRows(home).every(row => !row.ok), "the write found the plugin gone and did not run");
  const add = await request(`/api/settings/projects/${one.project_id}/plugins`, { method: "POST", body: { plugin_id: "issues", expected_revision: await projectPluginRevisionAt(origin, one.project_id) } });
  assert.equal(add.status, 200, await add.clone().text());
  const listed = await (await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).json() as { items: unknown[] };
  assert.deepEqual(listed.items, [], "added back, the project's Issues has no record of it");
});

test("S-31 a project's control ends with its request: kept and used later, it is refused, not run as the person's own", { timeout: 60_000 }, async t => {
  const { home, host, request, project } = await serveHomeRuntime(t);
  const one = await project("请求结束", ["issues"]);
  const route = await issueCreateRoute(host, request, one), original = route.handle.bind(route);
  let kept: PluginExecutionControl | undefined;
  route.handle = async routed => { kept = routed.execution; return original(routed); };
  const first = await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: issue });
  assert.equal(first.status, 200, await first.clone().text());
  assert.equal(kept?.project_id, one.project_id);
  route.handle = original;
  const before = createRows(home).length;
  const late = await original({ method: "POST", pathname: "/create", actor_id: LOCAL_PERSON_ACTOR_ID, params: {}, query: {}, body: issue, execution: kept });
  assert.notEqual(late.status, 200);
  assert.equal((late.body as { code?: string }).code, "actions.cancelled");
  assert.ok(createRows(home).slice(before).every(row => !row.ok), "the late call left no record that ran");
  const listed = await (await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/list`)).json() as { items: unknown[] };
  assert.equal(listed.items.length, 1, "only the request's own create is kept");
});
