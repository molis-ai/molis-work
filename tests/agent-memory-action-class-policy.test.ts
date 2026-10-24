import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ModelProviderStore, ensureSystemAgentService, withConnectorConnections, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { LocalSqliteStorage, createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions, type MemoryClassRestriction } from "@molis-ai/molis-work-contracts/services/memory";
import { grantMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { serveTestHost } from "./fixtures/test-home.js";

const CODING = "io.molis.work.coding";
const SENTINEL = "FROZEN_ACTION_MEMORY_CONVENTION";
interface ProviderRequest {
  tools?: Array<{ name: string; description?: string }>;
  messages: Array<{ role: string; content: string | Array<{ type: string; content?: unknown }> }>;
}

async function until<T>(read: () => T | Promise<T>): Promise<NonNullable<T>> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (value) return value as NonNullable<T>;
    assert.ok(Date.now() < deadline, "the production Agent/HTTP path did not reach the expected state");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// MEM-CLASS-02: a normal Agent action must retain the same recipe as the Run's SDK memory.
test("production Coding memory.list keeps the old Run restriction after reopening and the next Run can read", { timeout: 60_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "agent-memory-actions-"))), directory = join(home, "work");
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const firstRequest = Promise.withResolvers<void>(), releaseFirst = Promise.withResolvers<void>();
  const requests: ProviderRequest[][] = [[], []], toolNames: string[] = [], providerErrors: unknown[] = [];
  let round = 0, host: MolisWorkLocalHost | undefined, served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  const provider = createServer(async (request, response) => {
    try {
      let body = ""; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body) as ProviderRequest, seen = requests[round]!;
      seen.push(input);
      let reply: Response;
      if (seen.length === 1) {
        const tool = input.tools?.find(item => item.name.startsWith("molis-action-") && item.description?.includes(memoryActions.list.action.title));
        assert.ok(tool, "the granted production memory.list action must actually be offered to this Run");
        toolNames[round] = tool.name;
        if (round === 0) { firstRequest.resolve(); await releaseFirst.promise; }
        reply = cogniaScriptedResponse({ name: tool.name, input: { scope: "project" } });
      } else reply = cogniaScriptedResponse(undefined, "检查完成。");
      response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await reply.text());
    } catch (error) {
      providerErrors.push(error); firstRequest.resolve(); response.writeHead(500); response.end("Controlled provider failed");
    }
  });
  t.after(async () => {
    releaseFirst.resolve();
    try { await served?.close(); await host?.close(); }
    finally {
      provider.closeAllConnections();
      if (provider.listening) await new Promise<void>(resolve => provider.close(() => resolve()));
      if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
      else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
      resetSecretStoreCache(); await rm(home, { recursive: true, force: true });
    }
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); catalog.close();
  await mkdir(directory);
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Local controlled model", token: randomUUID() }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
  const database = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try {
    new ModelProviderStore({ db: database.db, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) }).upsert({
      provider_id: "fixture", display_name: "Local controlled model", base_url: endpoint, api_format: "anthropic-messages",
      credential_ref: connection.credential_ref!, models: [{ model_id: "fixture-model", enabled: true }],
    });
  } finally { database.close(); }
  host = new MolisWorkLocalHost({ homeDirectory: home,
    workspacesFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => workspaceRefFor(catalog, projectId)),
  });
  served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Run memory action policy", ["coding"]);
  await served.web.post(`/projects/${project.project_id}/api/workspaces`, { workspace_path: directory, user_confirmed: true });
  const workspaces = await served.web.get<{ workspaces: Array<{ workspace_id: string }> }>(`/projects/${project.project_id}/api/project-settings/workspaces`);
  assert.ok(workspaces.workspaces[0]);
  const action = { capability_id: memoryActions.list.capability_id, version: memoryActions.list.version, provider_id: MEMORY_PROVIDER_ID };
  await grantMcpAction(served.web, { clientId: "agent:prologue", projectId: null, action });

  const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [...MEMORY_PERMISSIONS] };
  const memory = bindActionClient(host.actionClient(project.reference), () => person);
  const written = await memory.invoke(memoryActions.write, { scope: "project", kind: "convention", text: `项目约定：每次交付先核对 ${SENTINEL}` });
  assert.equal(written.outcome, "written"); assert.ok(written.memory);
  const restriction: MemoryClassRestriction = { selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "inherit" };
  await memory.invoke(memoryActions.savePrefs, { scope: "project", prefs: { class_restrictions: [restriction] } });
  const before = await memory.invoke(memoryActions.list, { scope: "project" });
  assert.ok(before.items.some(item => item.text.includes(SENTINEL)), "the person can read the actual persisted source before starting either Run");

  // Coding's HTTP entry carries its real running activation into composeAgentHost/startAuthority (PG-051).
  // A direct Host client has no plugin declaration and must not borrow the bundled reader role.
  const composition = ensureSystemAgentService(host, home);
  const coding = `/projects/${project.project_id}/api/plugins/${CODING}`;
  const { session } = await served.web.post<{ session: { session_id: string } }>(`${coding}/sessions`, { title: "Memory action snapshot" });
  const web = served.web;
  const start = async () => (await web.post<{ run: AgentRunView }>(`${coding}/sessions/${session.session_id}/runs`, {
    intent: "discuss", task: "请调用所选能力查看项目记忆。", workspace_id: workspaces.workspaces[0]!.workspace_id,
    action_tools: [action], provider_id: "fixture", model_id: "fixture-model",
  })).run;
  const finish = (ref: AgentRunRef): Promise<AgentRunView> => until(async () => {
    const view = await composition.agentHost.adapter("prologue").read(ref);
    return ["completed", "failed", "stopped", "cancelled"].includes(view.phase) ? view : undefined;
  });
  const old = await start();
  await firstRequest.promise;
  assert.deepEqual(providerErrors, []);
  const captured = await composition.agentHost.adapter("prologue").read(old.ref);
  assert.deepEqual(captured.class_restrictions?.project, [restriction], "the barrier is after this Run froze its original policy");
  await memory.invoke(memoryActions.savePrefs, { scope: "project", prefs: { class_restrictions: [] } });
  releaseFirst.resolve();
  const oldView = await finish(old.ref);
  assert.equal(oldView.phase, "completed", oldView.stop_reason ?? undefined);
  assert.ok(oldView.activity.some(item => item.name === toolNames[0]), "the old Run really invoked its selected action");
  const toolResults = (index: number) => requests[index]!.flatMap(request => request.messages.flatMap(message =>
    Array.isArray(message.content) ? message.content.filter(block => block.type === "tool_result") : []));
  assert.ok(toolResults(0).length > 0, "the real action result reached the next HTTP model request");
  assert.ok(!JSON.stringify(requests[0]).includes(SENTINEL), "reopening must not disclose a memory forbidden by the old Run snapshot");
  assert.ok(!JSON.stringify(oldView).includes(SENTINEL), "the old Run's visible tool output must not disclose the source either");

  round = 1;
  const next = await start(), nextView = await finish(next.ref);
  assert.deepEqual(providerErrors, []);
  assert.equal(nextView.phase, "completed", nextView.stop_reason ?? undefined);
  assert.deepEqual(nextView.class_restrictions?.project, []);
  assert.ok(nextView.activity.some(item => item.name === toolNames[1] && item.state === "completed"), "the new Run must execute the same granted action successfully");
  assert.ok(JSON.stringify(toolResults(1)).includes(SENTINEL), "the new Run can read the actual memory through the tool, not merely automatic recall");
  const after = await memory.invoke(memoryActions.list, { scope: "project" });
  assert.deepEqual(after.items.map(item => [item.memory_id, item.text, item.version]), before.items.map(item => [item.memory_id, item.text, item.version]), "reading neither replaces nor deletes the formal memory");
});
