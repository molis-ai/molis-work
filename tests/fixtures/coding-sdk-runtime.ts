import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { LocalHost, LocalProjectDatabase, createPluginPlatform, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { CodingSessionStore, createCodingPlugin, codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

/** The existing Coding effect fixture's real Plugin Runtime, Host and SDK composition, shared by recovery tests. */
export async function codingSdkRuntime(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "coding-sdk-regression-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), sessions = new CodingSessionStore(store.db), service = new ActionService(), reviews = new AgentReviewQueue();
  const makeAdapter = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.coding-regression-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: reviews,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await makeAdapter(), agentHost = new AgentHost({ reviews }); agentHost.register(adapter);
  const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } }), reference = { project_id: DEMO_PROJECT_ID, storage_key: file };
  registerAgentHostCapabilities({ register: (definition, handler) => local.register(definition, handler) }, {
    agentHost: () => agentHost, projectId: () => DEMO_PROJECT_ID, authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }),
  });
  local.register(projectSettingsCapabilities.workspaces, () => [{ workspace_id: "work", canonical_path: home, display_name: "Fixture", realpath_verified: true }]);
  const privateStorage = new SqlitePluginPrivateStorage(store.db), artifacts = new ArtifactsModule({ db: store.db, homeOwner: "web-user", appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const platform = createPluginPlatform({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", db: store.db, artifacts, processItems, ui: new UiHost(), home: null,
    actions: { registry: service, client: service, project_id: DEMO_PROJECT_ID }, capabilities: local.client(reference), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  await platform.start([{ definition: createCodingPlugin({ execution: { sessions, goalTitle: () => undefined, ready: async () => {}, models: async () => [{ provider_id: "fixture", model_id: "fixture", label: "Fixture" }] } }), grants: ["artifact:read", "artifact:write", "storage:private"] }]);
  t.after(async () => { await platform.closeCoordination(); for (const id of platform.supervisor.enabledPluginIds()) { const active = platform.supervisor.state(id); platform.supervisor.revoke(id); if (active?.install_id) await platform.runtime.stop(active.install_id); }
    await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const router = platform.router(), prefix = "/api/plugins/io.molis.work.coding";
  const call = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => router.dispatch({ method, pathname: prefix + path, actor_id: "web-user", ...(body === undefined ? {} : { body }) });
  const create = (id: string) => sessions.create({ project_id: DEMO_PROJECT_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() });
  const reopenSdk = async () => { await adapter.close(); adapter = await makeAdapter(); agentHost = new AgentHost({ reviews }); agentHost.register(adapter); };
  return { home, store, sessions, service, reviews, platform, call, create, reopenSdk, get adapter() { return adapter; } };
}

export function codingToolResponse(name: string, input: unknown): Response {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + crypto.randomUUID(), name, input } });
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}
