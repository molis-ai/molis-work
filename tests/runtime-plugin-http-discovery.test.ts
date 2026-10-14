import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute, type ActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { handleCodingPluginHttp } from "../apps/local-host/dist/coding-surface.js";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("formal Runtime HTTP entry discovers a new registered plugin without a Host ID list", async () => {
  const home = mkdtempSync(join(tmpdir(), "runtime-http-discovery-"));
  const database = join(home, "project.db");
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database);
  store.db.exec("CREATE TABLE unfamiliar_results (value INTEGER NOT NULL)");
  const shared = pluginActions(store, DEMO_PROJECT_ID);
  let dependencyCalls = 0;
  const ports = { store, projectId: DEMO_PROJECT_ID, actorId: "web-user", actions: shared,
    goalTitle: () => undefined, escapeHtml: String, translate: (value: string) => value,
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
    void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), ports).then(handled => {
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
    const started = await ensureProjectPlugins({ store: runtime.store, projectId: project.project_id, actorId: "web-user",
      homeDirectory: home, goalTitle: () => undefined, capabilities: host.client(reference),
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

// HTTP-LIFETIME-01..04: real Host requests, cancellation, bounded input and byte-preserving output.
async function requestLifetimeFixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "runtime-http-lifetime-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Request lifetime", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const pluginId = `io.molis.work.example.${randomUUID()}`;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), settled = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const uploadStarted = Promise.withResolvers<void>();
  const action: ActionDefinition<{ text: string }, { saved: string }> = {
    capability_id: "unfamiliar.controlled.write", version: 1, operation: "command", action: {
      title: "Save", description: "Wait, recheck the caller, then save", kind: "operation", scope: "project",
      audiences: ["user"], permissions: [], subject_kinds: [], scheduling: "concurrent",
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      output_schema: { type: "object", properties: { saved: { type: "string" } }, required: ["saved"], additionalProperties: false },
    },
  };
  const bytes = new Uint8Array([0, 80, 75, 255, 0, 128, 10]);
  const platform = await host.withProject(reference, async runtime => {
    runtime.store.db.exec("CREATE TABLE request_notes (text TEXT NOT NULL)");
    const started = await ensureProjectPlugins({ store: runtime.store, projectId: project.project_id, actorId: "web-user",
      homeDirectory: home, goalTitle: () => undefined, capabilities: host.client(reference),
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: project.project_id } });
    assert.ok(started.platform);
    const definition: PluginDefinition = {
      manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Request lifetime",
        kind: "app", publisher: { publisher_id: "example", signature: "runtime-request-lifetime" },
        entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
        capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
        actions: [action], routes: [
          { route_id: action.capability_id, method: "POST", path: "/notes" },
          { route_id: "bounded-notes", method: "POST", path: "/bounded-notes", max_body_bytes: 500_000 },
          { route_id: "download", method: "POST", path: "/download" },
        ] },
      async start(context) { return { kind: "app", actions: [{ ...action, async handle(caller, input) {
        const text = (input as { text: string }).text;
        try {
          if (text === "late") { entered.resolve(); await release.promise; }
          await caller.beforeEffect();
          runtime.store.db.prepare("INSERT INTO request_notes VALUES (?)").run(text);
          return { saved: text };
        } finally { if (text === "late") settled.resolve(); }
      } }], routes: [bindPluginActionRoute(context, action, request => request.body as { text: string }),
        { ...bindPluginActionRoute(context, action, request => request.body as { text: string }), route_id: "bounded-notes" },
        { route_id: "download", async handle(request) {
          if ((request.body as { wait?: boolean })?.wait) { entered.resolve(); await release.promise; }
          await request.execution?.beforeEffect();
          return { status: 200, bytes, mime: "application/zip", filename: "research.zip", headers: { "cache-control": "no-store" } };
        } }], }; },
    };
    const report = await started.platform.start([{ definition }]);
    assert.ok(report.running.includes(pluginId));
    return started.platform;
  });
  const token = "runtime-http-lifetime-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  server.on("request", (request, response) => {
    if (request.url?.endsWith("/notes")) {
      response.once("close", () => { if (!response.writableEnded) disconnected.resolve(); });
      // Observe the production parser starting, without draining its bytes.
      request.once("resume", () => uploadStarted.resolve());
    }
  });
  t.after(async () => {
    release.resolve();
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await host.close(); rmSync(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (operation: string, input: unknown = {}, signal?: AbortSignal, authorized = true) => fetch(
    `${origin}/projects/${project.project_id}/api/plugins/${pluginId}/${operation}`, {
      method: "POST", signal, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(input),
    });
  const rows = () => host.withProject(reference, runtime => runtime.store.db.prepare("SELECT text FROM request_notes ORDER BY text").all());
  return { platform, pluginId, request, rows, entered, release, settled, disconnected, uploadStarted, bytes, origin, token, project };
}

test("disconnect during a partial upload cannot dispatch, crash the server or poison the next request", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t);
  const upload = httpRequest(`${f.origin}/projects/${f.project.project_id}/api/plugins/${f.pluginId}/notes`, {
    method: "POST", headers: { origin: f.origin, "content-type": "application/json",
      "x-molis-work-control-token": f.token, "x-molis-work-idempotency-key": randomUUID() },
  });
  upload.on("error", () => {});
  upload.write('{"text":"unfinished');
  await f.uploadStarted.promise;
  upload.destroy();
  await f.disconnected.promise;
  assert.deepEqual(await f.rows(), []);
  const next = await f.request("notes", { text: "after interrupted upload" });
  assert.equal(next.status, 200, await next.clone().text());
  assert.deepEqual(await f.rows(), [{ text: "after interrupted upload" }]);
});

test("real Web disconnect cancels only its own action and no late record is saved", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t), abort = new AbortController();
  const pending = f.request("notes", { text: "late" }, abort.signal);
  await f.entered.promise;
  abort.abort();
  await assert.rejects(pending);
  await f.disconnected.promise;
  const other = await f.request("notes", { text: "other" });
  assert.equal(other.status, 200, await other.clone().text());
  f.release.resolve(); await f.settled.promise;
  assert.deepEqual(await f.rows(), [{ text: "other" }]);
  assert.equal((await f.request("notes", { text: "recovered" })).status, 200);
  assert.deepEqual(await f.rows(), [{ text: "other" }, { text: "recovered" }]);
});

test("real Web plugin stop prevents a waiting write; JSON cannot forge execution control", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t);
  assert.equal((await f.request("notes", { text: "forged", execution: { signal: null } })).status, 400);
  assert.equal((await f.request("notes", { text: "unauthorized" }, undefined, false)).status, 403);
  const pending = f.request("notes", { text: "late" });
  await f.entered.promise;
  f.platform.supervisor.revoke(f.pluginId); f.release.resolve();
  assert.equal((await pending).status, 403);
  assert.deepEqual(await f.rows(), []);
  await f.platform.supervisor.enable(f.pluginId);
  assert.equal((await f.request("notes", { text: "new activation" })).status, 200);
});

test("real Web plugin binary response preserves bytes, MIME and cache policy", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t);
  const response = await f.request("download");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-disposition") ?? "", /research\.zip/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
});

test("a completed restart cannot revive an older in-flight file response", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t);
  const pending = f.request("download", { wait: true });
  await f.entered.promise;
  assert.equal((await f.request("restart")).status, 200);
  f.release.resolve();
  const response = await pending;
  assert.equal(response.status, 403);
  assert.notEqual(response.headers.get("content-type"), "application/zip");
  assert.equal((await f.request("download")).status, 200);
});

test("only a declared bounded route accepts a larger JSON body; overflow never invokes or stores", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t), text = "界".repeat(100_000);
  assert.equal((await f.request("notes", { text })).status, 413);
  assert.deepEqual(await f.rows(), []);
  assert.equal((await f.request("bounded-notes", { text })).status, 200);
  assert.equal((await f.rows())[0]?.text, text);
  assert.equal((await f.request("bounded-notes", { text: "界".repeat(180_000) })).status, 413);
  assert.equal((await f.rows()).length, 1);
});

test("malformed JSON and UTF-8 are rejected before dispatch and a valid retry still saves", { timeout: 15_000 }, async t => {
  const f = await requestLifetimeFixture(t);
  for (const body of [Buffer.from('{"text":'), Buffer.from([0x7b, 0xff, 0x7d])]) {
    const response = await fetch(`${f.origin}/projects/${f.project.project_id}/api/plugins/${f.pluginId}/notes`, {
      method: "POST", headers: { origin: f.origin, "content-type": "application/json",
        "x-molis-work-control-token": f.token, "x-molis-work-idempotency-key": randomUUID() }, body,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await f.rows(), []);
  }
  assert.equal((await f.request("notes", { text: "after invalid input" })).status, 200);
  assert.deepEqual(await f.rows(), [{ text: "after invalid input" }]);
});
