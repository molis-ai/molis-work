import assert from "node:assert/strict";
import test from "node:test";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { deferred, grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";

test("SYS-15 S-47 registered HTTP pages allow only their own concrete routes and do not receive Runtime services", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Registered pages"), other = await f.project("Other registered pages");
  const prefix = `/projects/${project.project_id}`;
  const open = async (pluginId: string) => {
    const response = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: pluginId } });
    assert.equal(response.status, 200, await response.clone().text());
    return { "x-molis-plugin-page": (await response.json()).page_id as string };
  };
  for (const [id, read, foreign] of [["io.molis.work.plugin-builder", "/api/plugin-builder/studio/state", "/api/alchemist/studio/api/v1/bootstrap"],
    ["io.molis.work.alchemist", "/api/alchemist/studio/api/v1/bootstrap", "/api/plugin-builder/studio/state"]]) {
    const headers = await open(id), second = await open(id);
    assert.equal((await f.request(prefix + read, { headers })).status, 200);
    for (const path of [foreign, "/api/settings/models", `/api/plugins/${id}/view-revision`, "/api/host/directory-grants", "/api/host/plugin-page-actions", "/api/host/plugin-page-files"]) {
      const result = await f.request(prefix + path, { headers, ...(path.startsWith("/api/host/") ? { method: "POST", body: {} } : {}) });
      assert.equal(result.status, 403, path + ": " + await result.text());
    }
    assert.equal((await f.request(`/projects/${other.project_id}` + read, { headers })).status, 403);
    await f.request(prefix + "/api/host/plugin-pages/" + headers["x-molis-plugin-page"], { method: "DELETE" });
    assert.equal((await f.request(prefix + read, { headers })).status, 403);
    assert.equal((await f.request(prefix + read, { headers: second })).status, 200, "closing one view does not revoke a different view");
  }
});

test("SYS-15 S-47 page authority allows declared routes and refuses other plugins, lifecycle and owner services", async t => {
  const a = homeProbe("pagea"), b = homeProbe("pageb");
  a.definition.manifest.routes!.push({ route_id: "collision", method: "POST", path: "/disable" });
  const start = a.definition.start;
  a.definition.start = async context => {
    const contribution = await start(context); assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, routes: [...(contribution.routes ?? []), { route_id: "collision", handle: () => ({ status: 200, body: {} }) }] };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [a.definition, b.definition] } });
  await grantHomeProbe(f.host, a); await grantHomeProbe(f.host, b);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: a.id } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json(); const headers = { "x-molis-plugin-page": page_id };
  assert.equal((await f.request(`/api/plugins/${a.id}/save`, { method: "POST", body: { text: "owned" }, headers })).status, 200);
  assert.equal((await (await f.request(`/api/plugins/${a.id}/state`, { headers })).json()).value, "owned");
  for (const path of [`/api/plugins/${b.id}/state`, `/api/plugins/${a.id}/disable`, "/api/host/plugin-pages", "/api/assistant/works", "/api/settings/projects", "/settings", "/"]) {
    const response = await f.request(path, { method: path.endsWith("disable") || path.endsWith("plugin-pages") ? "POST" : "GET", headers });
    assert.equal(response.status, 403, `${path}: ${await response.text()}`);
  }
  assert.equal((await f.request("/api/host/directory-grants", { method: "POST", body: { plugin_id: a.id }, headers })).status, 403, "undeclared directory permission");
  assert.equal((await f.request(`/api/plugins/${a.id}/state`, { headers: { "x-molis-plugin-page": "invented" } })).status, 403);
  await grantHomeProbe(f.host, a);
  assert.equal((await f.request(`/api/plugins/${a.id}/state`, { headers })).status, 403, "same installation after activation restart");
  assert.equal((await f.request(`/api/plugins/${a.id}/state`)).status, 200, "the owner's independent session still works");
});

test("SYS-15 S-47 project page cannot switch project or Home and deletion invalidates its authority", async t => {
  const f = await serveHomeRuntime(t), p = await f.project("Page owner"), q = await f.project("Other page");
  const prefix = `/projects/${p.project_id}`;
  const response = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: "io.molis.work.cognia" } });
  assert.equal(response.status, 200, await response.clone().text());
  const { page_id } = await response.json(), headers = { "x-molis-plugin-page": page_id };
  const library = "/api/plugins/io.molis.work.cognia/library";
  assert.equal((await f.request(prefix + library, { headers })).status, 200);
  assert.equal((await f.request(`/projects/${q.project_id}` + library, { headers })).status, 403);
  assert.equal((await f.request(library, { headers })).status, 403);
  assert.equal((await f.request(prefix + "/api/host/directory-grants", { method: "POST", body: { plugin_id: "io.molis.work.todo" }, headers })).status, 403);
  await projectDeletedHooksFor(f.home).clear("plugin-pages", p.project_id);
  assert.equal((await f.request(prefix + library, { headers })).status, 403);
});

test("SYS-15 S-47 closing a page cancels a running command without revoking the plugin's other pages", async t => {
  const probe = homeProbe("closingpage"), entered = deferred(), release = deferred();
  probe.behavior.ask = async context => { entered.resolve(); await release.promise; context.services!.storage!.set("late", "must not be written"); return "late"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json();
  const pending = f.request(`/api/plugins/${probe.id}/ask`, { method: "POST", body: {}, headers: { "x-molis-plugin-page": page_id } });
  await entered.promise;
  assert.equal((await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" })).status, 200);
  release.resolve(); assert.equal((await pending).status, 403);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
  assert.equal((await f.request(`/api/plugins/${probe.id}/state`)).status, 200);
});

test("SYS-15 S-47 an opaque frame cannot navigate into owner HTML to recover a token", async t => {
  const f = await serveHomeRuntime(t);
  const refused = await f.request("/", { authorized: false, headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" } });
  assert.equal(refused.status, 403); assert.doesNotMatch(await refused.text(), /molis-work-control-token/);
  const owner = await f.request("/", { headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate" } });
  assert.equal(owner.status, 200, "the shell's trusted panes keep their navigation");
});

test("SYS-15 S-47 a raw route cannot return buffered private content after its page closes", async t => {
  const probe = homeProbe("bufferedpage"), entered = deferred(), release = deferred();
  probe.definition.manifest.routes!.push({ route_id: "buffered", method: "GET", path: "/buffered" });
  const start = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await start(context); assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, routes: [...(contribution.routes ?? []), { route_id: "buffered", handle: async () => {
      entered.resolve(); await release.promise; return { status: 200, body: { private: "buffered private content" } };
    } }] };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json();
  const pending = f.request(`/api/plugins/${probe.id}/buffered`, { headers: { "x-molis-plugin-page": page_id } });
  await entered.promise;
  await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" });
  release.resolve(); const response = await pending;
  assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /buffered private content/);
});

test("SYS-15 S-47 page actions use the real definition, declared dependencies and installation grants", async t => {
  const source = homeProbe("pagesource"), target = homeProbe("pagetarget");
  target.state.action.audiences.push("plugin");
  source.definition.manifest.capabilities.consumes.push(target.state.capability_id, target.save.capability_id);
  source.definition.manifest.permissions.push({ permission: target.permissions[1]!, required: false, reason: "读取所声明的依赖" });
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [source.definition, target.definition] } });
  await grantHomeProbe(f.host, source, [...source.permissions, target.permissions[1]!]); await grantHomeProbe(f.host, target);
  await f.request(`/api/plugins/${target.id}/save`, { method: "POST", body: { text: "target-owned" } });
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: source.id } });
  const { page_id } = await opened.json();
  const invoke = (reference: { capability_id: string; version: number; provider_id?: string }, input: unknown = {}) =>
    f.request("/api/host/plugin-page-actions", { method: "POST", headers: { "x-molis-plugin-page": page_id }, body: { reference, input } });
  const own = await invoke(source.save, { text: "own-page" }); assert.equal(own.status, 200, await own.clone().text());
  assert.equal((await (await invoke(source.state)).json()).value, "own-page");
  const consumed = await invoke(target.state); assert.equal(consumed.status, 200, await consumed.clone().text());
  assert.equal((await consumed.json()).value, "target-owned");
  assert.notEqual((await invoke(target.save, { text: "forbidden" })).status, 200, "consumes alone does not grant the target's write or audience");
  assert.equal((await invoke(target.ask)).status, 403, "undeclared dependency");
  assert.equal((await invoke({ ...source.state, provider_id: target.id })).status, 403, "cannot replace an own action's provider");
  assert.equal((await f.request("/api/host/plugin-page-actions", { method: "POST", body: { reference: source.state, input: {} } })).status, 403);
  assert.equal((await (await f.request(`/api/plugins/${target.id}/state`)).json()).value, "target-owned");
});

for (const transport of ["route", "action"] as const) test(`SYS-15 S-47 ${transport} accepted background work outlives the page but retains installation authority`, async t => {
  const probe = backgroundProbe("pagejob" + transport), entered = deferred(), release = deferred();
  probe.behavior.work = async () => { entered.resolve(); await release.promise; return "accepted work"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json(), headers = { "x-molis-plugin-page": page_id };
  try {
    const response = await f.request(transport === "route" ? `/api/plugins/${probe.id}/background` : "/api/host/plugin-page-actions", {
      method: "POST", headers, body: transport === "route" ? { id: "job" } : { reference: probe.start, input: { id: "job" } },
    });
    assert.equal(response.status, 200, await response.clone().text()); await entered.promise;
    await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" });
    assert.equal(probe.controls[0]!.signal!.aborted, false);
    release.resolve(); assert.equal(await probe.handles[0]!.result, "accepted work");
    assert.equal(probe.stored("result.job"), "accepted work");
  } finally { release.resolve(); }
});
