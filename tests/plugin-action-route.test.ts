import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindPluginActionRoute, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { PluginHostExecutor, LocalProjectDatabase, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

test("unknown plugin HTTP adapter executes through the shared Kernel and revokes even zero-permission clients", async () => {
  const home = mkdtempSync(join(tmpdir(), "plugin-action-route-")), file = join(home, "board.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_BOARD_ID);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const action: ActionDefinition<{ value: number }, { doubled: number }> = {
    capability_id: "unknown.double", version: 1, operation: "query", action: {
      title: "Double", description: "Pure arithmetic", kind: "query", scope: "project", audiences: ["user", "mcp", "workflow"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false },
      output_schema: { type: "object", properties: { doubled: { type: "number" } }, required: ["doubled"], additionalProperties: false },
    },
  };
  let calls = 0, failStart = false;
  const contexts: PluginStartContext[] = [];
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.unfamiliar", version: "1.0.0", name: "Unfamiliar", kind: "app",
      publisher: { publisher_id: "example", signature: "example-unfamiliar" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: ["unknown.backend"] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [action], routes: [{ route_id: action.capability_id, method: "POST", path: "/double" }] },
    async start(context) {
      contexts.push(context);
      if (failStart) throw new Error("start failure");
      return { kind: "app", actions: [{ ...action, handle: (_caller, input) => { calls++; return { doubled: (input as { value: number }).value * 2 }; } }],
        routes: [bindPluginActionRoute(context, action, request => request.body as { value: number })] };
    },
  };
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, board_id: DEMO_BOARD_ID, actor_id: "owner", artifacts,
    capabilities: { availability: () => ({ available: true }), invoke: async () => 1 as never },
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) }), { actions });
  try {
    const installed = runtime.install({ definition, deployment: "local", grants: [] }).install;
    await runtime.start(installed.install_id);
    const contribution = runtime.contribution(installed.install_id)!;
    assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app contribution");
    const route = contribution.routes![0]!;
    const request = (actor_id: string, body: unknown) => ({ actor_id, body, params: {}, query: {}, method: "POST" as const, pathname: "/api/plugins/io.molis.work.example.unfamiliar/double" });
    assert.deepEqual(await route.handle(request("owner", { value: 7 })), { status: 200, body: { doubled: 14 } });
    assert.equal((await route.handle(request("owner", { value: "bad" }))).status, 400);
    assert.equal((await route.handle(request("intruder", { value: 7 }))).status, 403);
    const old = contexts[0]!.services!.actions!;
    const oldCapabilities = contexts[0]!.services!.capabilities!;
    const backend = { capability_id: "unknown.backend", version: 1, operation: "query" as const };
    assert.equal(oldCapabilities.availability(backend).available, true);
    assert.equal(await oldCapabilities.invoke(backend, {}), 1);
    await assert.rejects(old.invoke({ ...action, capability_id: "foreign.action" }, { value: 1 }));
    assert.equal(calls, 1);
    await runtime.reportCrash(installed.install_id);
    await runtime.recover(installed.install_id);
    assert.equal(oldCapabilities.availability(backend).available, false);
    await assert.rejects(oldCapabilities.invoke(backend, {}), /已停止/);
    assert.equal(contexts[1]!.services!.capabilities!.availability(backend).available, true);
    await assert.rejects(old.invoke(action, { value: 7 }), { code: "actions.forbidden" });
    await assert.rejects(old.discover(), { code: "actions.forbidden" });
    assert.equal((await route.handle(request("owner", { value: 7 }))).status, 403);
    assert.deepEqual(await contexts[1]!.services!.actions!.invoke(action, { value: 3 }), { doubled: 6 });
    assert.equal(calls, 2);
    await runtime.stop(installed.install_id);
    failStart = true;
    await assert.rejects(runtime.start(installed.install_id));
    const failedClient = contexts.at(-1)!.services!.actions!;
    failStart = false;
    await runtime.recover(installed.install_id);
    await assert.rejects(failedClient.invoke(action, { value: 9 }), { code: "actions.forbidden" });
    assert.equal(calls, 2);
    await runtime.stop(installed.install_id);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});
