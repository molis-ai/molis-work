import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as contractsActions from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, bindOwnerPluginAction, bindPluginActionRoute, defineErrorCodes, type ActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { PluginHostExecutor, LocalProjectDatabase, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

test("unknown plugin HTTP adapter executes through the shared Kernel and revokes even zero-permission clients", async () => {
  const home = mkdtempSync(join(tmpdir(), "plugin-action-route-")), file = join(home, "board.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const action: ActionDefinition<{ value: number }, { doubled: number }> = {
    capability_id: "unknown.double", version: 1, operation: "query", action: {
      // `plugin`: the activation also calls its own action outside every call (PG-028 gives that self-call the plugin audience).
      title: "Double", description: "Pure arithmetic", kind: "query", scope: "project", audiences: ["user", "mcp", "workflow", "plugin"], permissions: [], subject_kinds: [],
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
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "owner", artifacts, processItems,
    dependencyCheck: () => ({ available: true }),
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) }), { actions });
  try {
    const installed = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [] }).install;
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
    const backend = { capability_id: "unknown.backend", version: 1, operation: "query" as const };
    assert.equal(old.availability(backend).available, true);
    await assert.rejects(old.invoke({ ...action, capability_id: "foreign.action" }, { value: 1 }));
    assert.equal(calls, 1);
    await runtime.reportCrash(installed.install_id);
    await runtime.recover(installed.install_id);
    assert.equal(old.availability(backend).available, false);
    // BL-411: outside every call the crashed activation's clients are refused and throw nothing: their calls never answer.
    assert.equal(contexts[1]!.services!.actions!.availability(backend).available, true);
    assert.equal(await within(old.invoke(action, { value: 7 })), PENDING);
    assert.equal(await within(old.discover()), PENDING);
    // BL-403: the Host routes requests to the running activation only. Held directly, the crashed activation's route is refused by
    // the Runtime with 403 before its handler runs; the action does not run (`calls` below).
    const refused = await within(route.handle(request("owner", { value: 7 })));
    assert.notEqual(refused, PENDING, "the crashed activation's route answers instead of hanging");
    assert.equal((refused as { value: { status: number } }).value.status, 403);
    assert.deepEqual(await contexts[1]!.services!.actions!.invoke(action, { value: 3 }), { doubled: 6 });
    assert.equal(calls, 2);
    await runtime.stop(installed.install_id);
    failStart = true;
    await assert.rejects(runtime.start(installed.install_id));
    const failedClient = contexts.at(-1)!.services!.actions!;
    failStart = false;
    await runtime.recover(installed.install_id);
    // An activation that never started is over as well: its call never answers, and the action does not run.
    assert.equal(await within(failedClient.invoke(action, { value: 9 })), PENDING);
    assert.equal(calls, 2);
    await runtime.stop(installed.install_id);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

// W3-02-C: the two binders are the plugin SDK's, and a route answers a failed action by its kind (one status for one kind, one body).
const routeAction: ActionDefinition<{ value: number }, { doubled: number }> = {
  capability_id: "unknown.route-errors", version: 1, operation: "query", action: {
    title: "Route errors", description: "Always fails with what the test gives it", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false },
    output_schema: { type: "object", properties: { doubled: { type: "number" } }, required: ["doubled"], additionalProperties: false },
  },
};
const routeRequest = (body: unknown, actor_id = "owner"): PluginRouteRequest => ({ actor_id, body, params: {}, query: {}, method: "POST", pathname: "/api/plugins/example/double" });
/** A context whose Host action client fails with whatever the case throws. */
function failingContext(failure: unknown, services: { actions?: boolean } = { actions: true }): PluginStartContext {
  return { actor_id: "owner", install_id: "install", requireGrant: () => undefined,
    services: services.actions === false ? {} : { actions: { invoke: async () => { throw failure; }, discover: async () => [] } } } as PluginStartContext;
}
const exampleErrors = defineErrorCodes("example", { gone: "not_found", stale: "conflict", too_big: "too_large" });

test("the route binder and the owner binder are the plugin SDK's: the contracts no longer define them", () => {
  assert.equal("bindPluginActionRoute" in contractsActions, false);
  assert.equal("bindOwnerPluginAction" in contractsActions, false);
  assert.equal(typeof bindPluginActionRoute, "function");
  assert.equal(typeof bindOwnerPluginAction, "function");
});

test("a route answers a failed action with the status of its kind and one body", async () => {
  const answer = async (failure: unknown) => bindPluginActionRoute(failingContext(failure), routeAction, request => request.body as { value: number }).handle(routeRequest({ value: 1 }));
  // The platform codes that other mappers answered with 400 (the default) or with a different number.
  for (const [code, status] of [
    ["actions.scope_mismatch", 403], ["actions.owner_mismatch", 403], ["actions.forbidden", 403], ["actions.plugin_disabled", 403],
    ["actions.missing", 404], ["actions.subject_changed", 409], ["actions.conflict", 409],
    ["actions.connection_required", 503], ["actions.unredeemed", 503], ["actions.plugin_unavailable", 503],
    ["actions.input_invalid", 400], ["actions.input_too_large", 413],
  ] as const) assert.deepEqual(await answer(new ActionError(code, "原因")), { status, body: { error: "原因", code } }, code);
  // An owner's own code answers by the kind its declaration gave it, and its details reach the body.
  assert.deepEqual(await answer(exampleErrors.gone("找不到")), { status: 404, body: { error: "找不到", code: "example.gone" } });
  assert.deepEqual(await answer(exampleErrors.too_big("太大")), { status: 413, body: { error: "太大", code: "example.too_big" } });
  assert.deepEqual(await answer(exampleErrors.stale("已变化", { current_version: 3 })), { status: 409, body: { error: "已变化", code: "example.stale", details: { current_version: 3 } } });
  // Another realm's ActionError (a Runtime bundle holds its own copy of the class) is read by shape.
  assert.deepEqual(await answer(Object.assign(new Error("别处的"), { code: "actions.forbidden" })), { status: 403, body: { error: "别处的", code: "actions.forbidden" } });
  // A failure with no code of ours is a bug or an outage, not the caller's mistake.
  assert.deepEqual(await answer(new Error("boom")), { status: 500, body: { error: "boom", code: "actions.execution_failed" } });
  assert.deepEqual(await answer("not an error"), { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } });
});

test("a route refuses a caller that is not the plugin's owner, and one without a Host action client, with coded bodies", async () => {
  const binding = (context: PluginStartContext) => bindPluginActionRoute(context, routeAction, request => request.body as { value: number });
  assert.deepEqual(await binding(failingContext(new Error("never reached"))).handle(routeRequest({ value: 1 }, "intruder")),
    { status: 403, body: { error: "调用者与当前插件入口不一致", code: "actions.forbidden" } });
  assert.deepEqual(await binding(failingContext(new Error("never reached"), { actions: false })).handle(routeRequest({ value: 1 })),
    { status: 503, body: { error: "宿主未提供系统动作调用入口", code: "actions.unredeemed" } });
});

test("a route whose request mapper rejects the request answers 400 actions.input_invalid with the mapper's sentence", async () => {
  const route = bindPluginActionRoute(failingContext(new Error("never reached")), routeAction, request => {
    if (typeof request.body !== "object" || request.body === null) throw new SyntaxError("请求内容不是对象");
    return request.body as { value: number };
  });
  assert.deepEqual(await route.handle(routeRequest("not an object")), { status: 400, body: { error: "请求内容不是对象", code: "actions.input_invalid" } });
  // A mapper that raises one of ours keeps its own code and kind.
  const coded = bindPluginActionRoute(failingContext(new Error("never reached")), routeAction, () => { throw exampleErrors.gone("没有这一条"); });
  assert.deepEqual(await coded.handle(routeRequest({ value: 1 })), { status: 404, body: { error: "没有这一条", code: "example.gone" } });
});
