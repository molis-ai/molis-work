import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { LocalHost, LocalProjectDatabase, createPluginPlatform, homeStores, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseArtifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, type KnowledgeReadRequest, type KnowledgeReadResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { createCodingPlugin, codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./coding-sessions.js";
import { seedConfiguredModels } from "./configured-models.js";

/** The existing Coding effect fixture's real Plugin Runtime, Host and SDK composition, shared by recovery tests. */
export async function codingSdkRuntime(t: TestContext, options: { extraPlugins?: ReadonlyArray<{ definition: PluginDefinition; grants: string[] }>; wrapCoding?: (definition: PluginDefinition) => PluginDefinition;
  /** Stands between Coding and the Host's capability client, to count or refuse a call. */
  wrapCapabilities?: <Client extends object>(client: Client) => Client } = {}) {
  const home = await mkdtemp(join(tmpdir(), "coding-sdk-regression-")), file = join(home, "project.db");
  // The model Coding lists comes from the Home's provider catalog through `services.model` (PG-047), as it does in the Host.
  await seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture" }]);
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), sessions = codingSessions(store), reviews = new AgentReviewQueue();
  const makeAdapter = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.coding-regression-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: reviews,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await makeAdapter(), agentHost = new AgentHost({ reviews }); agentHost.register(adapter);
  const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } }), reference = { project_id: DEMO_PROJECT_ID, storage_key: file };
  const service = { ...local.actionRegistry(reference), ...local.actionClient(reference), ...local.syncActionClient(reference) };
  registerAgentHostCapabilities({ register: (definition, handler) => local.registerAction(definition, handler) }, {
    agentHost: () => agentHost, projectId: () => DEMO_PROJECT_ID, authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home], method_owner: { project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding" } }),
  });
  local.registerAction(projectSettingsCapabilities.workspaces, () => [{ workspace_id: "work", canonical_path: home, display_name: "Fixture", realpath_verified: true }]);
  const privateStorage = new SqlitePluginPrivateStorage(store.db), artifacts = new ArtifactsModule({ db: store.db, homeOwner: "web-user", appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  // Coding reads what the person brought through project knowledge (specs/project-knowledge PMAT-18); here its stand-in answers
  // a fixed version from the project's stores. The knowledge service's own reads are tested in tests/knowledge-*.test.ts.
  service.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" }, definitions: [knowledgeActions.read],
    handlers: [{ ...knowledgeActions.read, handle: (_caller, input) => {
      const asked = input as KnowledgeReadRequest, reference = asked.subject.kind === "artifact" ? parseArtifactSubjectId(asked.subject.id) : null;
      const record = reference && (artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, reference) ?? processItems.query.getArtifactVersion(DEMO_PROJECT_ID, reference));
      if (!record) throw new ActionError("knowledge.unreadable", "这份资料现在读不到");
      const text = JSON.stringify(record.payload).slice(0, asked.max_chars ?? 6_000);
      return { subject: asked.subject, ref: null, revision: String(record.version), title: record.artifact_id, layer: "original", text, start: 0, end: text.length, start_line: 1, end_line: 1, total_lines: 1,
        remaining: 0, owner_truncated: false, round_chars_left: null } satisfies KnowledgeReadResponse;
    } }] });
  const platform = createPluginPlatform({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", db: store.db, artifacts, processItems, ui: new UiHost(), home: { directory: home, completeText: () => undefined, stores: homeStores() },
    actions: { registry: service, client: service, project_id: DEMO_PROJECT_ID }, capabilities: (options.wrapCapabilities ?? (client => client))(local.client(reference)), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  await platform.start([{ definition: (options.wrapCoding ?? (definition => definition))(createCodingPlugin()), grants: ["search:read", "goals:read", "goals:write", "artifact:read", "artifact:write", "knowledge:read", "model:read", "storage:private", "workspace:read", "review:git-worktree", "review:git-integration"] }, ...(options.extraPlugins ?? [])]);
  t.after(async () => { await platform.closeCoordination(); for (const id of platform.supervisor.enabledPluginIds()) { const active = platform.supervisor.state(id); platform.supervisor.revoke(id); if (active?.install_id) await platform.runtime.stop(active.install_id); }
    await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const router = platform.router(), prefix = "/api/plugins/io.molis.work.coding";
  const call = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => router.dispatch({ method, pathname: prefix + path, actor_id: "web-user", ...(body === undefined ? {} : { body }) });
  const create = (id: string) => sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() });
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
