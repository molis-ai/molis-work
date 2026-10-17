import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ISSUES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-issues";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginExecutionControl, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

// Security invariant S-31 (docs/system/SECURITY-INVARIANTS.md): a Home plugin's route runs in a project only when the page's path names
// it (`/projects/<id>/api/plugins/<plugin>/…`), that project exists and it shows the plugin. The project comes from the path alone: never
// from the route's query or body, and never from a control the plugin made itself. Without the prefix the route runs in no project.

const issue = { title: "项目里的问题", type: "bug", description: "在项目页面里记下" };

/** The rows the Host's call log kept for Issue's create, oldest first: who asked, from which project, how it ended. */
function createRows(home: string): Array<{ project_id: string | null; ok: boolean }> {
  const file = join(home, "logs/action-calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { capability_id: string; project_id: string | null; ok: boolean })
    .filter(row => row.capability_id === "issues.create");
}

test("S-31 a Home plugin's route under a project's path runs in that project; without the prefix it runs in none", { timeout: 60_000 }, async t => {
  const { home, request, project } = await serveHomeRuntime(t);
  const one = await project("一号项目"), two = await project("二号项目");
  const create = (prefix: string, query = "") => request(`${prefix}/api/plugins/${ISSUES_PLUGIN_ID}/create${query}`, { method: "POST", body: issue });

  const inOne = await create(`/projects/${one.project_id}`);
  assert.equal(inOne.status, 200, await inOne.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, one.project_id, "the call ran in the project its path names");

  // A project named in the query is not the Host's word; the path's project stays.
  const forgedQuery = await create(`/projects/${one.project_id}`, `?project_id=${encodeURIComponent(two.project_id)}`);
  assert.equal(forgedQuery.status, 200, await forgedQuery.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, one.project_id);

  const personal = await create("", `?project_id=${encodeURIComponent(one.project_id)}`);
  assert.equal(personal.status, 200, await personal.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, null, "without the prefix the route runs in no project, whatever the query says");

  // A project named in the body is the action's input, and Issue's input has no such field: refused, nothing written.
  const before = createRows(home).length;
  const forgedBody = await request(`/projects/${one.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: { ...issue, project_id: two.project_id } });
  assert.equal(forgedBody.status, 400);
  assert.equal((await forgedBody.json()).code, "actions.input_invalid");
  assert.ok(createRows(home).slice(before).every(row => !row.ok), "a refused body leaves no record that ran");
  const listed = await (await request(`/api/plugins/${ISSUES_PLUGIN_ID}/list`)).json() as { items: unknown[] };
  assert.equal(listed.items.length, 3, "only the three accepted creates are kept");
});

test("S-31 a project that does not exist, or that hides the plugin, refuses the route before it runs", { timeout: 60_000 }, async t => {
  const probe = homeProbe("routeprobe");
  const { home, host, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  const shown = await project("显示 Issue"), hidden = await project("隐藏 Issue");
  const hide = await request(`/api/settings/projects/${hidden.project_id}/plugins`, { method: "DELETE", body: { plugin_id: "issues" } });
  assert.equal(hide.status, 200, await hide.clone().text());
  assert.deepEqual((await hide.json()).hidden, ["issues"]);
  const create = (projectId: string) => request(`/projects/${encodeURIComponent(projectId)}/api/plugins/${ISSUES_PLUGIN_ID}/create`, { method: "POST", body: issue });

  const missing = await create("no-such-project");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "actions.missing");
  const disabled = await create(hidden.project_id);
  assert.equal(disabled.status, 403);
  assert.equal((await disabled.json()).code, "actions.plugin_disabled");
  assert.deepEqual(createRows(home), [], "neither refusal reached the action");

  // A Home plugin that no project shows (a fixture has no place in the project list) runs only as the person's own.
  const probeInProject = await request(`/projects/${shown.project_id}/api/plugins/${probe.id}/state`);
  assert.equal(probeInProject.status, 403);
  assert.equal((await probeInProject.json()).code, "actions.plugin_disabled");
  const probeAlone = await request(`/api/plugins/${probe.id}/state?project_id=${encodeURIComponent(shown.project_id)}`);
  assert.equal(probeAlone.status, 200, await probeAlone.clone().text());
  assert.equal((await probeAlone.json()).project_id, null);

  // The Host's lifecycle operations are the Home's: under a project's path they are not there, and the plugin keeps running.
  for (const operation of ["disable", "enable", "retry", "restart", "upgrade", "release-quarantine"]) {
    const refused = await request(`/projects/${shown.project_id}/api/plugins/${ISSUES_PLUGIN_ID}/${operation}`, { method: "POST", body: {} });
    assert.equal(refused.status, 404, operation);
    assert.equal((await refused.json()).code, "actions.missing", operation);
  }
  assert.equal(host.homePlugins!.installation(ISSUES_PLUGIN_ID)!.state, "running");
  const allowed = await create(shown.project_id);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  assert.equal(createRows(home).at(-1)?.project_id, shown.project_id);
});

test("S-31 a plugin cannot name the project itself: a project on a control the Host did not issue is not read", { timeout: 60_000 }, async t => {
  const id = "io.molis.work.example.relay";
  const where: ActionDefinition<Record<string, never>, string | null> = { capability_id: "relay.where", version: 1, operation: "query",
    action: { title: "在哪个项目", description: "说出这次调用所在的项目", scope: "home", permissions: ["relay:read"], kind: "query",
      audiences: ["user"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } };
  const relay: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "relay", kind: "app",
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
