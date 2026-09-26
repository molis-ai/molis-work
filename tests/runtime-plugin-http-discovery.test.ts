import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindPluginActionRoute, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DEMO_BOARD_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
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
  const shared = pluginActions(store, DEMO_BOARD_ID);
  let dependencyCalls = 0;
  const ports = { store, boardId: DEMO_BOARD_ID, actorId: "web-user", actions: shared,
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
    await releaseProjectPlugins(store, DEMO_BOARD_ID);
    store.close(); rmSync(home, { recursive: true, force: true });
  }
});

test("product Web server mounts a registered unfamiliar plugin with control-token and project isolation", async () => {
  const home = mkdtempSync(join(tmpdir(), "runtime-product-discovery-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Registered", actor_id: "user" }));
  const other = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Other", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
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
    const started = await ensureProjectPlugins({ store: runtime.store, boardId: project.board_id, actorId: "web-user",
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
    assert.equal((await fetch(`${origin}/projects/${project.project_id}/api/plugins/io.molis.work.coding/state`)).status, 404,
      "generic registration must not bypass bundled project enablement");
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
