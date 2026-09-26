import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { composeAgentHost } from "../apps/local-host/src/agent-host-composition.js";
import { PluginHostExecutor } from "../apps/local-host/src/plugin-executor.js";
import { PluginRuntime, createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase } from "../apps/local-host/src/project-database.js";
import { agentHostCapabilities as agent, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

const rejected = { code: "agent.session_unknown" };
async function terminal(adapter: any, ref: any): Promise<AgentRunView> {
  return new Promise((resolve, reject) => {
    let off = () => {}; const timer = setTimeout(() => reject(new Error("Original run did not finish")), 8_000);
    off = adapter.observe(ref, (view: AgentRunView) => {
      if (!["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return;
      clearTimeout(timer); queueMicrotask(() => off()); resolve(view);
    });
  });
}

test("real Plugin executor binds unknown Agent declarations and rejects forged owner/options and foreign sessions", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "plugin-agent-identity-"));
  const project = { project_id: "project", board_id: "board", storage_key: join(home, "project.sqlite") };
  const store = new LocalProjectDatabase(project.storage_key), artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const local = new LocalHost({ runtimeFactory: { open: () => ({ project_id: project.project_id, board_id: project.board_id, store, coordinator: { artifacts } }), close: () => {} } });
  let modelCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { modelCalls++; return cogniaModelResponse("Original owner result"); });
  const composition = composeAgentHost({ localHost: { registerCapability: local.register.bind(local), client: local.client.bind(local) } as any,
    workspaceFor: () => ({ workspace_id: "workspace", canonical_path: home, realpath_verified: true }), cliRuntimes: [],
    prologue: { storageRoot: join(home, "runtime"), modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" } });
  const contexts: PluginStartContext[] = [], definitions: PluginDefinition[] = [];
  let stopWait: Promise<void> | undefined, stopEntered = () => {};
  const make = (plugin_id: string) => {
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id, version: "1.0.0", name: "Unknown agent", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: Object.values(agent).map(item => item.capability_id) }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      agent: { roles: [{ role_id: "private-reader", version: 1, execution: "read-only", prompts: ["reader"], host_tools: [] }], prompts: [{ prompt_id: "reader", version: 1 }] } },
      agent_prompts: [{ prompt_id: "reader", version: 1, body: "Answer from supplied context only.", layer: "role" }],
      async start(context) { contexts.push(context); return { kind: "app" }; },
      async stop() { if (plugin_id === "io.molis.work.example.own-agent") { stopEntered(); await stopWait; } } };
    definitions.push(definition); return definition;
  };
  const actions = { registry: local.actionRegistry(project), client: { ...local.actionClient(project), ...local.syncActionClient(project) }, project_id: project.project_id };
  const executor = new PluginHostExecutor({ actions, board_id: project.board_id, actor_id: "web-user", artifacts, ui: new UiHost(), capabilities: local.client(project),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor);
  const first = runtime.install({ definition: make("io.molis.work.example.own-agent"), deployment: "local", grants: [] }).install;
  const second = runtime.install({ definition: make("io.molis.work.example.other-agent"), deployment: "local", grants: [] }).install;
  try {
    await runtime.start(first.install_id); await runtime.start(second.install_id);
    const a = contexts[0]!, b = contexts[1]!, api = a.services!.capabilities!, other = b.services!.capabilities!;
    const owner = { board_id: project.board_id, plugin_id: a.plugin_id, install_id: a.install_id, actor_id: "web-user", directory: { canonical_path: home, realpath_verified: true } };
    assert.deepEqual(await api.invoke(agent.availableRoles, ["prologue", a.plugin_id]), [{ role_id: "private-reader", available: true }]);
    const forged = { ...owner, plugin_id: "io.molis.work.coding", install_id: "forged-install" };
    await assert.rejects(api.invoke(agent.createSession, ["prologue", { ...forged, title: "Forged" }]), rejected);
    await assert.rejects(api.invoke(agent.availableRoles, ["prologue", "io.molis.work.coding"]), rejected);
    const forgedOptions = { plugin_caller: { ...forged, project_id: project.project_id, assertActive() {}, declaration: { manifest: definitions[0]!.manifest } }, consumer: undefined };
    await assert.rejects(api.invoke(agent.createSession, ["prologue", { ...forged, title: "Forged options" }], forgedOptions), rejected);
    const bareSdk = createPluginCapabilityClient(definitions[0]!.manifest, local.client(project));
    await assert.rejects(bareSdk.invoke(agent.createSession, ["prologue", { ...forged, title: "Unbound SDK" }], forgedOptions), rejected);
    assert.equal(modelCalls, 0);
    const session = await api.invoke(agent.createSession, ["prologue", { ...owner, title: "Owned" }]);
    const view = await api.invoke(agent.readSession, [session]);
    assert.deepEqual(view.owner, { board_id: project.board_id, plugin_id: a.plugin_id, install_id: a.install_id, actor_id: "web-user" });
    const handle = await api.invoke(agent.startRun, ["prologue", { ...owner, session, role_id: "private-reader", task: "Read", budget: { max_turns: 1 } }]);
    const adapter = composition.agentHost.adapter("prologue");
    assert.equal((await terminal(adapter, handle.ref)).phase, "completed"); assert.equal(modelCalls, 1);
    for (const [definition, input] of [
      [agent.readSession, [session]], [agent.readRun, [session, handle.ref]], [agent.controlRun, [session, handle.ref, { kind: "cancel" }]],
      [agent.inspectRecovery, [session]], [agent.listCheckpoints, [session]], [agent.readRunReviews, [session, handle.ref]],
      [agent.readCommandOutput, [session, { call_id: "foreign" }]], [agent.listSubagents, [session, handle.ref]],
    ] as const) await assert.rejects(other.invoke(definition as any, input), rejected);
    await assert.rejects(api.invoke(agent.startRun, ["prologue", { ...owner, actor_id: "another-user", session, role_id: "private-reader", task: "Read" }]), rejected);
    let releaseQueue = () => {}, releaseStop = () => {}, queueEntered = () => {};
    const queueReady = new Promise<void>(resolve => { queueEntered = resolve; });
    const queueWait = new Promise<void>(resolve => { releaseQueue = resolve; });
    const stopReady = new Promise<void>(resolve => { stopEntered = resolve; });
    stopWait = new Promise<void>(resolve => { releaseStop = resolve; });
    const blocker = { capability_id: "fixture.hold", version: 1, operation: "command" as const };
    local.register(blocker, async () => { queueEntered(); await queueWait; });
    const holding = local.client(project).invoke(blocker, {}); await queueReady;
    const queued = api.invoke(agent.createSession, ["prologue", { ...owner, title: "Queued before stop" }]);
    const queuedRejected = assert.rejects(queued, /已停止/);
    const stopping = runtime.stop(first.install_id); await stopReady;
    try {
      await assert.rejects(api.invoke(agent.readSession, [session]), /已停止/);
      releaseQueue(); await holding; await queuedRejected;
    } finally { releaseQueue(); releaseStop(); await stopping; }
    await assert.rejects(api.invoke(agent.readSession, [session]), /已停止/);
    assert.equal(modelCalls, 1, "rejected calls never dispatch another model");
  } finally {
    await runtime.stop(first.install_id).catch(() => {}); await runtime.stop(second.install_id).catch(() => {});
    await composition.dispose(); await local.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});
