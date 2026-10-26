// RAC-23: both Host routes close on cancellation or instance invalidation, before late effects.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute, type ActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard, handleProjectPluginHttp, openProjectVersionStores, hostDependencyCheck } from "@molis-ai/molis-work-app-local-host";
import { ensureProjectPlugins, releaseProjectPlugins, runningProjectPlatform } from "../apps/local-host/dist/project-plugins.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { streamProbe } from "./fixtures/plugin-stream.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";

import { FORM_PLUGIN_ID } from "@molis-ai/molis-work-plugin-form";
import { TODO_PLUGIN_ID } from "@molis-ai/molis-work-plugin-todo";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { lingguangActions } from "@molis-ai/molis-work-plugin-lingguang";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { pluginDocuments } from "./fixtures/plugin-documents.js";
import { serveLingguang } from "./fixtures/lingguang-runtime.js";
import type { HostTextRequestOptions } from "@molis-ai/molis-work-app-local-host";

for (const mode of ["stop", "revoke", "restart", "caller-revoke"] as const) {
  test(`RAC-34 Lingguang ${mode} rejects late model text and the whole turn; recovery uses the same library`, { timeout: 60_000 }, async t => {
    const entered = deferred(), release = deferred();
    let progress: HostTextRequestOptions["onProgress"], calls = 0, allowed = true;
    const f = await serveLingguang(t, { completeText: async (_prompt, options) => {
      if (++calls === 1) { progress = options?.onProgress; progress?.({ type: "text-delta", text: "预览" }); entered.resolve(); await release.promise; }
      return "完整回复";
    } });
    const { spark } = await f.bound.invoke(lingguangActions.create, { body: "保留的想法" });
    const { conversation } = await f.bound.invoke(lingguangActions.openConversation, { spark_ids: [spark.id] });
    const seen: string[] = [];
    const pending = f.client.invoke({ ...f.caller, on_progress: event => { if (event.text_delta) seen.push(event.text_delta); },
      assert_authority_current: () => { if (!allowed) throw new Error("caller revoked"); },
    }, lingguangActions.message, { id: conversation.id, body: "取消的提问" });
    const refused = assert.rejects(pending);
    try {
      await entered.promise;
      const platform = await f.host.withProject(f.project.reference, runtime => runningProjectPlatform(runtime.store, f.project.project_id));
      assert.ok(platform);
      const plugin = "io.molis.work.lingguang", installId = platform.supervisor.state(plugin)!.install_id!;
      if (mode === "stop") await platform.runtime.stop(installId);
      else if (mode === "revoke") platform.supervisor.revoke(plugin);
      else if (mode === "restart") assert.equal((await platform.supervisor.restart(plugin)).status, "running");
      else allowed = false;
      assert.throws(() => progress!({ type: "text-delta", text: "迟到的文字" }));
      release.resolve(); await refused;
      assert.deepEqual(seen, ["预览"]);
      const reopened = openLingguangStore(f.home);
      try { assert.deepEqual(reopened.conversation(conversation.id, f.project.project_id).messages, []); assert.equal(reopened.get(spark.id).body, "保留的想法"); }
      finally { reopened.close(); }
      if (mode === "stop") assert.equal((await platform.supervisor.restart(plugin)).status, "running");
      if (mode === "revoke") assert.equal((await platform.supervisor.enable(plugin)).status, "running");
      allowed = true;
      const recovered = await f.bound.invoke(lingguangActions.message, { id: conversation.id, body: "重新提问" });
      assert.deepEqual(recovered.messages.map(row => [row.role, row.body]), [["user", "重新提问"], ["assistant", "完整回复"]]);
    } finally { release.resolve(); await refused; }
  });
}

test("RAC-34 Lingguang HTTP disconnect cancels model preview and saves no partial turn; a later turn recovers", { timeout: 60_000 }, async t => {
  const entered = deferred(), release = deferred(), cancelled = deferred();
  let progress: HostTextRequestOptions["onProgress"], calls = 0;
  const f = await serveLingguang(t, { completeText: async (_prompt, options) => {
    if (++calls === 1) {
      assert.ok(options?.signal);
      options.signal.addEventListener("abort", cancelled.resolve, { once: true });
      progress = options.onProgress; progress?.({ type: "text-delta", text: "未完成的预览" });
      entered.resolve(); await release.promise;
    }
    return "完整回复";
  } });
  const { spark } = await f.bound.invoke(lingguangActions.create, { body: "保留的想法" });
  const { conversation } = await f.bound.invoke(lingguangActions.openConversation, { spark_ids: [spark.id] });
  const abort = new AbortController();
  try {
    const response = await f.rawRequest(`${f.path}/conversations/${conversation.id}/messages`, {
      method: "POST", body: { body: "取消的提问" }, signal: abort.signal,
    });
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /ndjson/u);
    await entered.promise;
    const closed = assert.rejects(response.text(), { name: "AbortError" });
    abort.abort(); await closed; await cancelled.promise;
    assert.throws(() => progress!({ type: "text-delta", text: "取消后的文字" }));
    release.resolve();
    const recovered = await f.bound.invoke(lingguangActions.message, { id: conversation.id, body: "重新提问" });
    assert.deepEqual(recovered.messages.map(row => [row.role, row.body]), [["user", "重新提问"], ["assistant", "完整回复"]]);
    const reopened = openLingguangStore(f.home);
    try { assert.deepEqual(reopened.conversation(conversation.id, f.project.project_id).messages, recovered.messages); }
    finally { reopened.close(); }
  } finally { release.resolve(); abort.abort(); }
});

for (const scope of ["home", "project"] as const) for (const invalidation of ["disconnect", "stop", "revoke", "upgrade"] as const) {
  test(`S-03 W5-01-STREAM-04 ${scope} streaming ${invalidation} ends the response and refuses late business writes`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(scope), entered = deferred(), release = deferred(), finished = deferred(), cancelled = deferred();
    let refusal: unknown;
    probe.behavior.action = async (caller, context) => {
      caller.signal!.addEventListener("abort", cancelled.resolve, { once: true });
      entered.resolve(); await release.promise;
      try { await caller.beforeEffect(); context.services!.storage!.set("late", "must not be saved"); return "late result"; }
      catch (error) { refusal = error; throw error; }
      finally { finished.resolve(); }
    };
    const { host, request, project } = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const current = scope === "project" ? await project("Cancel a streamed action") : undefined;
    const path = `${current ? `/projects/${current.project_id}` : ""}/api/plugins/${probe.id}/run`;
    const abort = new AbortController();
    try {
      const response = await request(path, { method: "POST", body: {}, signal: abort.signal });
      await entered.promise;
      const platform = current
        ? await host.withProject(current.reference, runtime => runningProjectPlatform(runtime.store, current.project_id))
        : await host.homePlugins!.ready();
      assert.ok(platform);
      const text = response.text();
      const closed = invalidation === "disconnect" ? assert.rejects(text) : text;
      if (invalidation === "disconnect") abort.abort();
      else if (invalidation === "stop") await platform.runtime.stop(probe.contexts.at(-1)!.install_id);
      else if (invalidation === "upgrade") await platform.runtime.upgrade({ install_id: probe.contexts.at(-1)!.install_id,
        definition: { ...probe.definition, manifest: { ...probe.definition.manifest, version: "1.1.0",
          upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } } } });
      else platform.supervisor.revoke(probe.id);
      await cancelled.promise;
      const body = await closed;
      if (typeof body === "string") {
        const lines = body.trim().split("\n").map(line => JSON.parse(line));
        assert.equal(lines.length, 1); assert.equal(lines[0].type, "error");
        assert.equal(lines[0].code, "actions.cancelled");
      }
      // The connection ended while the original handler was still held. Its eventual write must still be refused.
      release.resolve(); await finished.promise;
      assert.ok(refusal instanceof Error);
      if (invalidation === "stop") await platform.supervisor.restart(probe.id);
      else if (invalidation === "revoke") await platform.supervisor.enable(probe.id);
      assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
    } finally { release.resolve(); abort.abort(); }
  });
}

test("formal Runtime HTTP entry discovers a new registered plugin without a Host ID list", async () => {
  const home = mkdtempSync(join(tmpdir(), "runtime-http-discovery-"));
  const database = join(home, "project.db");
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database);
  store.db.exec("CREATE TABLE unfamiliar_results (value INTEGER NOT NULL)");
  const shared = pluginActions(store, DEMO_PROJECT_ID);
  let dependencyCalls = 0;
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", actions: shared,
    escapeHtml: String, translate: (value: string) => value,
    capabilities: { availability: () => ({ available: true as const }), invoke: async () => { dependencyCalls++; return null as never; } } };
  const pluginId = `io.molis.work.example.${randomUUID()}`;
  const action: ActionDefinition<{ value: number }, { doubled: number; report: { title: string; body_markdown: string; run_id: string } }> = {
    capability_id: "unfamiliar.persist", version: 1, operation: "command", action: {
      title: "Save doubled value", description: "Persist the result", kind: "operation", scope: "project",
      audiences: ["user", "workflow", "mcp"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { value: { type: "integer" } }, required: ["value"], additionalProperties: false },
      output_schema: { type: "object", properties: { doubled: { type: "integer" }, report: { type: "object",
        properties: { title: { type: "string" }, body_markdown: { type: "string" }, run_id: { type: "string" } },
        required: ["title", "body_markdown", "run_id"], additionalProperties: false } }, required: ["doubled", "report"], additionalProperties: false },
    },
  };
  const result = (value: number) => ({ doubled: value * 2, report: { title: "Opaque data", body_markdown: "**unchanged**", run_id: "unrelated" } });
  let starts = 0;
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Unfamiliar",
      kind: "app", publisher: { publisher_id: "example", signature: "runtime-http-discovery" },
      entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [action], routes: [{ route_id: action.capability_id, method: "POST", path: "/persist" }] },
    async start(context) {
      starts++;
      return { kind: "app", actions: [{ ...action, handle: (_caller, input) => {
        const value = (input as { value: number }).value;
        store.db.prepare("INSERT INTO unfamiliar_results (value) VALUES (?)").run(value * 2);
        return result(value);
      } }], routes: [bindPluginActionRoute(context, action, request => request.body as { value: number })] };
    },
  };
  const server = createServer((request, response) => {
    void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), ports).then(handled => {
      if (!handled) { response.writeHead(404); response.end("fallthrough"); }
    }).catch(error => { response.writeHead(500); response.end(String(error)); });
  });
  try {
    const { platform } = await ensureProjectPlugins(ports);
    assert.ok(platform);
    const report = await platform.start([{ definition }]);
    assert.ok(report.running.includes(pluginId));
    assert.ok(platform.router().match("GET", "/api/plugins/io.molis.work.coding/state"), "adding a plugin must preserve previously registered routes");
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (path: string, body?: unknown) => fetch(`${origin}/api/plugins/${pluginId}/${path}`, body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    // The platform's first web route announces the project as opened (BL-521), which reads the folder Files browses once; open it
    // with a route nothing answers, so the next one is measured for what only it causes.
    assert.equal((await request("undeclared", {})).status, 404);
    dependencyCalls = 0;
    let response = await request("persist", { value: 7 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result(7), "Coding report enrichment must not mutate another plugin's response");
    assert.equal(dependencyCalls, 0, "an unrelated route must not refresh Files");
    response = await request("persist", { value: "7" });
    assert.equal(response.status, 400);
    assert.deepEqual(store.db.prepare("SELECT value FROM unfamiliar_results").all().map(row => (row as { value: number }).value), [14]);
    assert.equal((await request("undeclared", {})).status, 404);
    assert.equal((await fetch(`${origin}/api/plugins/io.molis.work.not-installed/restart`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${origin}/api/plugins/io.molis.work.pages/list`)).status, 404, "native routes must fall through");
    assert.equal((await request("restart")).status, 405);
    assert.equal((await request("restart", {})).status, 200);
    assert.equal(starts, 2);
    assert.equal((await request("persist", { value: 9 })).status, 200);
    platform.supervisor.revoke(pluginId);
    assert.equal((await request("persist", { value: 11 })).status, 503);
    assert.equal((await request("restart", {})).status, 409, "restart must not re-enable a revoked plugin");
    await platform.supervisor.enable(pluginId);
    response = await request("persist", { value: 13 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result(13));
    assert.deepEqual(store.db.prepare("SELECT value FROM unfamiliar_results").all().map(row => (row as { value: number }).value), [14, 18, 26]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    store.close(); rmSync(home, { recursive: true, force: true });
  }
});

test("product Web server mounts a registered unfamiliar plugin with control-token and project isolation", async () => {
  const home = mkdtempSync(join(tmpdir(), "runtime-product-discovery-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Registered", actor_id: "user" }));
  const other = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Other", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const pluginId = `io.molis.work.example.${randomUUID()}`;
  const action: ActionDefinition<{ text: string }, { count: number }> = {
    capability_id: "unfamiliar.web.save", version: 1, operation: "command", action: {
      title: "Save", description: "Save a project note", kind: "operation", scope: "project",
      audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      output_schema: { type: "object", properties: { count: { type: "integer" } }, required: ["count"], additionalProperties: false },
    },
  };
  const platform = await host.withProject(reference, async runtime => {
    runtime.store.db.exec("CREATE TABLE web_plugin_notes (text TEXT NOT NULL)");
    const started = await ensureProjectPlugins({ store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems, projectId: project.project_id, actorId: "web-user",
      homeDirectory: home, dependencyCheck: hostDependencyCheck(host.client(reference)),
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: project.project_id } });
    assert.ok(started.platform);
    await started.platform.start([{ definition: {
      manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Web Note",
        kind: "app", publisher: { publisher_id: "example", signature: "web-note-example" },
        entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
        capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
        actions: [action], routes: [{ route_id: action.capability_id, method: "POST", path: "/notes" }] },
      async start(context) { return { kind: "app", actions: [{ ...action, handle: (_caller, input) => {
        runtime.store.db.prepare("INSERT INTO web_plugin_notes VALUES (?)").run((input as { text: string }).text);
        return { count: (runtime.store.db.prepare("SELECT count(*) AS count FROM web_plugin_notes").get() as { count: number }).count };
      } }], routes: [bindPluginActionRoute(context, action, request => request.body as { text: string })] }; },
    } }]);
    return started.platform;
  });
  const token = "runtime-http-discovery-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (projectId: string, path: string, body: unknown, authorized = true) => fetch(
      `${origin}/projects/${projectId}/api/plugins/${pluginId}/${path}`, {
        method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
          ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body),
      });
    assert.equal((await request(project.project_id, "notes", { text: "no token" }, false)).status, 403);
    let response = await request(project.project_id, "notes", { text: "through real Web routing" });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { count: 1 });
    assert.equal((await request(other.project_id, "notes", { text: "wrong project" })).status, 404);
    assert.equal((await request(project.project_id, "notes", { text: "forged", actor_id: "someone" })).status, 400);
    // W3-02-C: a bundled plugin the project has not enabled answers with the platform's own code and status, the one the action layer uses.
    const notEnabled = await fetch(`${origin}/projects/${project.project_id}/api/plugins/io.molis.work.coding/state`);
    assert.equal(notEnabled.status, 403, "generic registration must not bypass bundled project enablement");
    assert.deepEqual(await notEnabled.json(), { error: "此项目未启用该插件", code: "actions.plugin_disabled" });
    assert.equal((await request(project.project_id, "restart", {}, false)).status, 403);
    assert.equal((await request(project.project_id, "restart", {})).status, 200);
    platform.supervisor.revoke(pluginId);
    assert.equal((await request(project.project_id, "notes", { text: "revoked" })).status, 503);
    assert.equal((await request(project.project_id, "restart", {})).status, 409);
    await platform.supervisor.enable(pluginId);
    response = await request(project.project_id, "notes", { text: "re-enabled" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { count: 2 });
    const rows = await host.withProject(reference, runtime => runtime.store.db.prepare("SELECT text FROM web_plugin_notes").all());
    assert.deepEqual(rows, [{ text: "through real Web routing" }, { text: "re-enabled" }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); rmSync(home, { recursive: true, force: true });
  }
});

for (const scope of ["home", "project"] as const) {
  test(`S-18 RAC-52 RAC-54 ${scope} revokes accepted work before awaiting stop and refuses a route without its installation grant`, { timeout: 30_000 }, async t => {
    const probe = backgroundProbe(`background-stop-${scope}`, scope), entered = deferred(), release = deferred();
    // The business permission is optional here so the real grant API can leave the plugin running without it.
    probe.definition.manifest.permissions.find(item => item.permission === `background-stop-${scope}:write`)!.required = false;
    probe.behavior.work = async () => { entered.resolve(); await release.promise; throw new Error("late provider failure"); };
    const f = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const project = scope === "project" ? await f.project("Stop a background action") : undefined;
    // First activate project fixtures, then grant through the lifecycle API while stopped.
    if (project) await f.host.inspectActions(person(probe.permissions, project.project_id), project.reference);
    const platform = project ? await f.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, project.project_id)) : await f.host.homePlugins!.ready();
    assert.ok(platform);
    const installId = platform.supervisor.state(probe.id)!.install_id!;
    await platform.runtime.stop(installId);
    platform.runtime.grant(installId, probe.permissions); await platform.supervisor.restart(probe.id);
    const path = `${project ? `/projects/${project.project_id}` : ""}/api/plugins/${probe.id}/background`;
    const heldStop = deferred(), stopEntered = deferred();
    probe.lifecycle.stop = async () => { stopEntered.resolve(); await heldStop.promise; };
    try {
      assert.equal((await f.request(path, { method: "POST", body: { id: "held" } })).status, 200); await entered.promise;
      const rejected = assert.rejects(probe.handles[0]!.result);
      const stop = platform.runtime.stop(installId); await stopEntered.promise;
      assert.equal(probe.controls[0]!.signal!.aborted, true); await rejected;
      await assert.rejects(probe.controls[0]!.beforeEffect());
      heldStop.resolve(); await stop;
      platform.runtime.grant(installId, probe.permissions.filter(permission => !permission.endsWith(":write")));
      await platform.supervisor.restart(probe.id);
      release.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(probe.stored("result.held"), null); assert.equal(probe.stored("failure.held"), null);
      const before = probe.requests.length;
      const denied = await f.request(path, { method: "POST", body: { id: "denied", permissions: probe.permissions } });
      assert.equal(denied.status, 403); assert.equal(probe.requests.length, before, "route grant is checked before plugin code");
      assert.equal(probe.handles.length, 1);
    } finally { release.resolve(); heldStop.resolve(); }
  });
}

test("S-47 RAC-79 W5-06-STAGE-01 a project Runtime plugin's stage is its running instance's; a stopped one shows the unavailable shell, never the catalog's", { timeout: 60_000 }, async t => {
  const { host, project, request } = await serveHomeRuntime(t);
  const one = await project("Project stage has one Runtime owner");
  const formUnavailable = /data-work-surface="form"[^>]*\bdata-project-plugin-unavailable\b/u;
  const page = async (locale = "zh") => {
    const response = await request(`/projects/${one.project_id}`, { headers: { cookie: `molis_work_locale=${locale}` } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal([...html.matchAll(/data-work-surface="form"/gu)].length, 1, "Form has one stage");
    const stage = pluginDocuments(html).find(document => /data-work-surface="form"/u.test(document))
      ?? html.match(/<section\b[^>]*data-work-surface="form"[^>]*data-project-plugin-unavailable[^>]*>[\s\S]*?<\/section>/u)?.[0];
    assert.ok(stage, "the actual project Form stage is present");
    return stage;
  };
  assert.match(await page(), /data-form-new/u);
  const platform = await host.withProject(one.reference, runtime => runningProjectPlatform(runtime.store, one.project_id));
  assert.ok(platform);
  const pagePath = `/projects/${one.project_id}/api/host/plugin-pages`;
  const opened = await request(pagePath, { method: "POST", body: { plugin_id: FORM_PLUGIN_ID } });
  assert.equal(opened.status, 200);
  const { page_id } = await opened.json();
  await platform.runtime.stop(platform.supervisor.state(FORM_PLUGIN_ID)!.install_id!);
  assert.equal((await request(pagePath, { method: "POST", body: { plugin_id: FORM_PLUGIN_ID } })).status, 403,
    "a stopped instance cannot grant a page just to display its placeholder");
  assert.equal((await request(`/projects/${one.project_id}/api/plugins/${FORM_PLUGIN_ID}/forms`, {
    method: "POST", body: { title: "must not be created" }, headers: { "x-molis-plugin-page": page_id },
  })).status, 403, "a page granted before stop cannot write through its stale authority");
  for (const [locale, title, reason, hint] of [
    ["zh", "Forms 暂不可用", "插件没有在运行", "请检查插件状态后重新打开。"],
    ["en", "Forms is unavailable", "The plugin is not running", "Check the plugin status, then reopen it."],
  ]) {
    const unavailable = await page(locale);
    assert.match(unavailable, formUnavailable);
    for (const text of [title, reason, hint]) assert.ok(unavailable.includes(text), `${locale}: ${text}`);
    assert.doesNotMatch(unavailable, /data-form-new/u, "a stopped instance's stage is not drawn from the build catalog");
  }
  assert.equal((await platform.supervisor.restart(FORM_PLUGIN_ID)).status, "running");
  assert.equal((await (await request(`/projects/${one.project_id}/api/plugins/${FORM_PLUGIN_ID}/forms`)).json()).forms.length, 0);
  const back = await page();
  assert.match(back, /data-form-new/u);
  assert.doesNotMatch(back, formUnavailable);

  const original = platform.supervisor.contribution.bind(platform.supervisor);
  const form = original(FORM_PLUGIN_ID);
  assert.ok(form?.kind === "app");
  // Inject failures at the Runtime's public contribution port; each assertion still requests the production project page.
  for (const [contribution, zh, en] of [
    [null, "插件正在运行，但未提供页面", "The plugin is running but has not provided a page"],
    [{ ...form, views: [] }, "插件页面未注册", "The plugin page is not registered"],
    [{ ...form, views: form.views?.map(view => ({ ...view, render() { throw new Error("page render failed"); } })) },
      "插件页面读取失败", "The plugin page could not be loaded"],
  ] as const) {
    const fault = t.mock.method(platform.supervisor, "contribution", id => id === FORM_PLUGIN_ID ? contribution : original(id));
    try {
      assert.equal(platform.runtime.get(platform.supervisor.state(FORM_PLUGIN_ID)!.install_id!).state, "running");
      for (const [locale, reason] of [["zh", zh], ["en", en]]) {
        const unavailable = await page(locale);
        assert.match(unavailable, formUnavailable);
        assert.ok(unavailable.includes(reason), `${locale}: ${reason}`);
        assert.doesNotMatch(unavailable, /插件没有在运行|The plugin is not running|data-form-new/u);
      }
    } finally { fault.mock.restore(); }
  }
  assert.match(await page(), /data-form-new/u, "the same live instance draws again after its contribution becomes available");
});


test("RAC-612 RAC-613 RAC-614 a failed or crashed project plugin's placeholder says why and offers to start it again; one switched off, blocked, stopped or uninstalled gets no button", { timeout: 90_000 }, async t => {
  const { host, project, request } = await serveHomeRuntime(t);
  const one = await project("Project placeholder restart");
  await request(`/projects/${one.project_id}`); // opening the project page starts its plugin platform
  const platform = await host.withProject(one.reference, runtime => runningProjectPlatform(runtime.store, one.project_id));
  assert.ok(platform);
  const installId = platform.supervisor.state(FORM_PLUGIN_ID)!.install_id!;
  const placeholder = async (locale = "zh") => {
    const response = await request(`/projects/${one.project_id}`, { headers: { cookie: `molis_work_locale=${locale}` } });
    assert.equal(response.status, 200);
    return (await response.text()).match(/<section\b[^>]*data-work-surface="form"[^>]*data-project-plugin-unavailable[^>]*>[\s\S]*?<\/section>/u)?.[0] ?? null;
  };
  const button = (stage: string | null) => stage?.match(/<button[^>]*data-project-plugin-restart="([a-z-]+)"[^>]*data-restart-plugin="([^"]+)"/u)?.slice(1) ?? null;
  assert.equal(await placeholder(), null, "a running Form draws its stage");

  // RAC-612: a crashed instance (the supervisor still counts it running) says so and offers a restart; the Host's route starts it again.
  await platform.runtime.reportCrash(installId);
  const crashed = await placeholder();
  assert.ok(crashed, "a crashed instance gets the placeholder");
  assert.deepEqual(button(crashed), ["restart", FORM_PLUGIN_ID]);
  assert.ok(crashed.includes(">重启<") && crashed.includes("data-project-plugin-restart-status"));
  assert.ok((await placeholder("en"))!.includes(">Restart<"), "RAC-614: the English placeholder has the button text");
  assert.equal((await request(`/projects/${one.project_id}/api/plugins/${FORM_PLUGIN_ID}/restart`, { method: "POST", body: {} })).status, 200);
  assert.equal(await placeholder(), null, "after the restart the stage is drawn again");

  const state = platform.supervisor.state.bind(platform.supervisor), contribution = platform.supervisor.contribution.bind(platform.supervisor), get = platform.runtime.get.bind(platform.runtime);
  const fault = (supervisor: Record<string, unknown> | null, instance?: string) => {
    const mocks = [t.mock.method(platform.supervisor, "contribution", id => id === FORM_PLUGIN_ID ? null : contribution(id))];
    if (supervisor) mocks.push(t.mock.method(platform.supervisor, "state", id => id === FORM_PLUGIN_ID ? { plugin_id: FORM_PLUGIN_ID, install_id: installId, code: null, message: null, ...supervisor } : state(id)));
    if (instance) mocks.push(t.mock.method(platform.runtime, "get", id => id === installId ? { ...get(id), state: instance } : get(id)));
    return () => mocks.forEach(mock => mock.mock.restore());
  };
  const failed = { status: "failed", code: "plugin.start_failed", message: "启动时出错" };

  // RAC-612: the supervisor's failure shows as a status line with its code and reason, and a restart.
  let restore = fault(failed, "crashed");
  try {
    for (const [locale, status, reason] of [["zh", "状态：启动失败", "启动时出错"], ["en", "Status: Failed to start", "启动时出错"]]) {
      const stage = (await placeholder(locale))!;
      assert.deepEqual(button(stage), ["restart", FORM_PLUGIN_ID]);
      assert.ok(stage.includes(status) && stage.includes("plugin.start_failed") && stage.includes(reason), `${locale}: status, code and reason`);
    }
  } finally { restore(); }

  // RAC-614: a quarantined instance is released, not just restarted.
  restore = fault({ status: "running" }, "quarantined");
  try {
    assert.deepEqual(button((await placeholder())!), ["release-quarantine", FORM_PLUGIN_ID]);
    const stage = (await placeholder("en"))!;
    assert.ok(stage.includes(">Release quarantine and restart<"));
    assert.equal(button(stage)?.[0], "release-quarantine");
  } finally { restore(); }

  // RAC-613: no button for a plugin the person switched off, one the Runtime blocks, one only stopped, and one uninstalled.
  for (const [name, supervisor, instance] of [
    ["switched off", { status: "failed", code: "plugin.revoked", message: "插件的停用还没有完成，请稍后再试" }, "crashed"],
    ["blocked", { status: "blocked", code: "plugin.blocked", message: "被阻止" }, "crashed"],
    ["stopped", { status: "running" }, "disabled"],
    ["uninstalled", failed, "uninstalled"],
  ] as const) {
    restore = fault(supervisor, instance);
    try {
      const stage = await placeholder();
      assert.ok(stage, `${name}: the placeholder is drawn`);
      assert.doesNotMatch(stage, /data-project-plugin-restart/u, `${name}: no restart button`);
      assert.equal(/data-project-plugin-status/u.test(stage), name === "blocked" || name === "uninstalled", `${name}: the status line shows for what the supervisor reports, not for a switch-off or a stop`);
    } finally { restore(); }
  }

  // Only the Host's route starts it again: the 409 for a switched-off plugin and the refusal of the page frame are asserted in the tests above
  // (`restart must not re-enable a revoked plugin`, tests/security-invariants-home-route-project.test.ts); nothing here adds a route.
  assert.equal(await placeholder(), null, "with the faults gone the stage is drawn again");
});

test("RAC-612 RAC-613 RAC-614 the served client ignores forged controls, shows a real 409 and retries, encodes the target, and restores crashed and quarantined stages", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  if (!browser) return;
  const { localHost, projectId, databasePath, evaluate, click, waitFor, reloadPage, navigate } = browser;
  assert.ok(localHost && projectId);
  await navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${projectId}/` }, browser.sessionId));
  const platform = await localHost.withProject(molisWorkHostProjectReference({ databasePath, projectId }), runtime => runningProjectPlatform(runtime.store, projectId));
  assert.ok(platform);
  const installId = platform.supervisor.state(FORM_PLUGIN_ID)!.install_id!;
  const stage = '[data-work-surface="form"][data-project-plugin-unavailable]';
  const button = stage + ' button[data-project-plugin-restart]', note = stage + ' [data-project-plugin-restart-status]';
  const requests: Array<{ url: string; method: string; token: string | string[] | undefined }> = [];
  browser.server.on("request", request => {
    if (/\/(restart|release-quarantine)$/u.test(request.url ?? "")) requests.push({ url: request.url!, method: request.method!, token: request.headers["x-molis-work-control-token"] });
  });
  await platform.runtime.reportCrash(installId);
  await reloadPage();
  await click('[data-plugin-strip] [data-plugin-id="form"]');
  await waitFor(`!!document.querySelector(${JSON.stringify(button)})`);

  // The real fetch is retained. Recording at dispatch makes zero requests observable without a timing sleep.
  await evaluate(`(() => {
    window.restartDispatches = [];
    const send = window.fetch.bind(window);
    window.fetch = (url, init) => { if (/\\/(restart|release-quarantine)$/.test(new URL(url, location.href).pathname)) window.restartDispatches.push(String(url)); return send(url, init); };
    const home = document.querySelector('[data-work-surface="home"]'), fake = document.createElement('div'); fake.id = 'restart-forgeries';
    fake.innerHTML = '<button id="forged-restart" data-project-plugin-restart="restart" data-restart-plugin="${FORM_PLUGIN_ID}">Forged restart</button>'
      + '<div data-tab-workspace><div data-surface-pool>' + document.querySelector(${JSON.stringify(stage)}).outerHTML + '</div></div>';
    const nested = fake.querySelector('[data-project-plugin-unavailable]'); nested.hidden = false; nested.querySelector('button').id = 'nested-forged-restart';
    home.append(fake);
  })()`);
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await click("#forged-restart");
  await click("#nested-forged-restart");
  assert.deepEqual(await evaluate("window.restartDispatches"), [], "RAC-613: a plugin's content, even with a forged workspace/pool/placeholder, cannot borrow the shell's request");
  assert.equal(requests.length, 0);
  await evaluate("document.querySelector('#restart-forgeries').remove()");
  await click('[data-plugin-strip] [data-plugin-id="form"]');
  await evaluate(`document.querySelector(${JSON.stringify(button)}).dataset.projectPluginRestart = 'disable'`);
  await click(button);
  assert.deepEqual(await evaluate("window.restartDispatches"), [], "RAC-613: an unknown operation cannot turn into release-quarantine");
  await evaluate(`document.querySelector(${JSON.stringify(button)}).dataset.projectPluginRestart = 'restart'`);

  // The existing Host route returns { state } on 409. Its actual reason must reach the placeholder as text.
  const restart = platform.supervisor.restart.bind(platform.supervisor), reason = "重启被拒：<b>依赖仍不可用</b>";
  let refuse = true;
  t.mock.method(platform.supervisor, "restart", async (id, options) => refuse && id === FORM_PLUGIN_ID
    ? { ...platform.supervisor.state(id)!, status: "failed", code: "plugin.start_failed", message: reason }
    : restart(id, options));
  await click(button);
  await waitFor(`document.querySelector(${JSON.stringify(note)})?.textContent === ${JSON.stringify(reason)} && !document.querySelector(${JSON.stringify(button)}).disabled`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(note)}).hidden`), false);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(note)}).querySelector('b')`), null, "the Host reason is text, never HTML");
  assert.deepEqual(requests, [{ url: `/projects/${projectId}/api/plugins/${encodeURIComponent(FORM_PLUGIN_ID)}/restart`, method: "POST", token: browser.controlToken }]);
  assert.equal(platform.runtime.get(installId).state, "crashed", "the refused restart did not restore the instance");

  // Transport probe on the same Host-rendered control: reserved characters stay inside one encoded plugin-id segment.
  const encodedId = "io.molis.work.example/a b?x=1&y=%", barrier = await sendBarrier(browser, [{ urlPattern: "*/api/plugins/*/restart", requestStage: "Request" }]);
  try {
    await evaluate(`document.querySelector(${JSON.stringify(button)}).dataset.restartPlugin = ${JSON.stringify(encodedId)}`);
    await click(button);
    const paused = await barrier.next();
    assert.equal(new URL(paused.request.url).pathname, `/projects/${projectId}/api/plugins/${encodeURIComponent(encodedId)}/restart`);
    assert.equal(paused.request.postData, "{}");
    await browser.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 409,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ state: { message: "编码目标的拒绝原因" } })).toString("base64") }, browser.sessionId);
    await waitFor(`document.querySelector(${JSON.stringify(note)}).textContent === '编码目标的拒绝原因' && !document.querySelector(${JSON.stringify(button)}).disabled`);
  } finally {
    await barrier.close();
    await evaluate(`document.querySelector(${JSON.stringify(button)}).dataset.restartPlugin = ${JSON.stringify(FORM_PLUGIN_ID)}`);
  }

  refuse = false;
  await navigate(() => click(button)); // The production listener, not the test, calls location.reload().
  await waitFor(`!document.querySelector(${JSON.stringify(stage)}) && !!document.querySelector('[data-work-surface="form"]')`);
  assert.equal(platform.runtime.get(installId).state, "running");
  const form = await pluginFrameBrowser(t, browser, "form");
  await form.waitFor("!!document.querySelector('[data-form-new]')");

  // Reach real quarantine through the Runtime's recovery budget, then use the other Host-generated operation.
  for (let attempt = 0; attempt < 4 && platform.runtime.get(installId).state !== "quarantined"; attempt++) {
    await platform.runtime.reportCrash(installId);
    await platform.supervisor.restart(FORM_PLUGIN_ID);
  }
  assert.equal(platform.runtime.get(installId).state, "quarantined");
  await reloadPage();
  await click('[data-plugin-strip] [data-plugin-id="form"]');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(button)}).dataset.projectPluginRestart`), "release-quarantine");
  await navigate(() => click(button));
  await waitFor(`!document.querySelector(${JSON.stringify(stage)})`);
  assert.equal(platform.runtime.get(installId).state, "running");
  assert.deepEqual(requests.at(-1), { url: `/projects/${projectId}/api/plugins/${encodeURIComponent(FORM_PLUGIN_ID)}/release-quarantine`, method: "POST", token: browser.controlToken });
});

test("S-47 RAC-79 W5-06-STAGE-01 Home stage placeholders use the request locale, escape owner messages and distinguish a running instance without a view", { timeout: 60_000 }, async t => {
  const { host, project, request } = await serveHomeRuntime(t);
  const one = await project("Home stage language");
  const platform = await host.homePlugins!.ready();
  const install = host.homePlugins!.installation(TODO_PLUGIN_ID);
  assert.ok(install);
  const page = async (locale: string) => {
    const response = await request(`/projects/${one.project_id}`, { headers: { cookie: `molis_work_locale=${locale}` } });
    assert.equal(response.status, 200);
    const html = await response.text();
    const stage = pluginDocuments(html).find(document => /data-work-surface="todo"/u.test(document))
      ?? html.match(/<section\b[^>]*data-work-surface="todo"[^>]*data-home-plugin-unavailable[^>]*>[\s\S]*?<\/section>/u)?.[0];
    assert.ok(stage, "the actual Home Todo stage is present");
    return stage;
  };
  await platform.runtime.stop(install.install_id);
  for (const [locale, heading, reason, link] of [
    ["zh", "暂不可用", "插件已停用", "查看插件状态"],
    ["en", "is unavailable", "The plugin is disabled", "View plugin status"],
  ]) {
    const html = await page(locale);
    assert.match(html, /data-home-plugin-unavailable/u);
    for (const text of [heading, reason, link]) assert.ok(html.includes(text), `${locale}: ${text}`);
  }
  assert.equal((await platform.supervisor.restart(TODO_PLUGIN_ID)).status, "running");
  const original = platform.runtime.contribution.bind(platform.runtime);
  const fault = t.mock.method(platform.runtime, "contribution", id => id === install.install_id ? null : original(id));
  try {
    for (const [locale, reason] of [["zh", "插件页面未注册"], ["en", "The plugin page is not registered"]]) {
      const html = await page(locale);
      assert.ok(html.includes(reason));
      assert.doesNotMatch(html, /插件已停用|The plugin is disabled/u);
    }
    const state = platform.supervisor.state.bind(platform.supervisor);
    const message = '<img src=x onerror="throw new Error(1)">';
    const ownerError = t.mock.method(platform.supervisor, "state", id => {
      const current = state(id);
      return id === TODO_PLUGIN_ID && current ? { ...current, message } : current;
    });
    try {
      const html = await page("en");
      assert.ok(html.includes("&lt;img src=x onerror=&quot;throw new Error(1)&quot;&gt;"));
      assert.doesNotMatch(html, /<img\b/u, "owner failure text cannot become markup in the Host placeholder");
    } finally { ownerError.mock.restore(); }
  } finally { fault.mock.restore(); }
  assert.doesNotMatch(await page("en"), /data-home-plugin-unavailable/u);
});

test("S-47 RAC-79 W5-06-STAGE-01 the real Form frame stays usable after a stopped stage placeholder and restart; forged unavailable markers stay isolated", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { localHost, projectId, databasePath, origin, command, sessionId, navigate, reloadPage } = browser;
  assert.ok(localHost && projectId);
  const frame = await pluginFrameBrowser(t, browser, "form");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=form` }, sessionId));
  // loadList writes this link after the real list response; aria-busy is only set by a later user command.
  const loaded = "document.querySelector('[data-form-new]') && document.querySelector('[data-form-ai-reason] a[href=\"/settings/models\"]')";
  await frame.waitFor(loaded);
  const reference = molisWorkHostProjectReference({ databasePath, projectId });
  const platform = await localHost.withProject(reference, runtime => runningProjectPlatform(runtime.store, projectId));
  assert.ok(platform);
  const original = platform.supervisor.contribution.bind(platform.supervisor), form = original(FORM_PLUGIN_ID);
  assert.ok(form?.kind === "app");
  const forged = { ...form, views: form.views?.map(view => ({ ...view, render(request: Parameters<typeof view.render>[0]) {
    return view.render(request).replace('data-form="workbench"', 'data-form="workbench" data-project-plugin-unavailable="workbench" data-home-plugin-unavailable="workbench"');
  } })) };
  const spoof = t.mock.method(platform.supervisor, "contribution", id => id === FORM_PLUGIN_ID ? forged : original(id));
  try {
    await reloadPage(); await frame.waitFor(loaded);
    assert.equal(await frame.evaluate("Boolean(document.querySelector('[data-project-plugin-unavailable][data-home-plugin-unavailable]'))"), true);
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-project-plugin-unavailable], [data-home-plugin-unavailable]').length"), 0,
      "plugin HTML cannot promote itself into the Host's static placeholder path");
    assert.equal(await frame.evaluate("(()=>{try{parent.document.body;return 'readable'}catch(error){return error.name}})()"), "SecurityError",
      "a forged unavailable marker does not escape the actual opaque frame");
  } finally { spoof.mock.restore(); }
  await platform.runtime.stop(platform.supervisor.state(FORM_PLUGIN_ID)!.install_id!);
  await reloadPage();
  await browser.waitFor("(()=>{const alert=document.querySelector('[data-project-plugin-unavailable] [role=alert]');return alert?.checkVisibility() && alert.textContent.includes('插件没有在运行')})()");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-form-new], iframe[data-plugin-frame=form], [data-work-surface=form][data-deferred-surface]').length"), 0,
    "the Host's visible placeholder neither mounts nor executes the stopped Form client");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-work-surface=form]').length"), 1);
  assert.equal((await platform.supervisor.restart(FORM_PLUGIN_ID)).status, "running");
  await reloadPage();
  await frame.waitFor(loaded);
  assert.equal(await frame.evaluate("document.querySelectorAll('[data-project-plugin-unavailable]').length"), 0);
  await frame.click("[data-form-new]");
  await frame.waitFor("document.querySelector('[data-form-stage-workspace]')?.hidden === false && document.querySelector('[data-form=workbench]')?.getAttribute('aria-busy') === 'false'");
  const created = await browser.web.get<{ forms: readonly unknown[] }>(`/projects/${projectId}/api/plugins/${FORM_PLUGIN_ID}/forms`);
  assert.equal(created.forms.length, 1, "after recovery the real frame creates a persisted Form");
});
