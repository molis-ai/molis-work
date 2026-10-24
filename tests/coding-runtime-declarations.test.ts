import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { charactersActions, openCharacters, type CharactersAgentCatalog } from "@molis-ai/molis-work-module-characters";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, codingRouteHooks, handleProjectPluginHttp, charactersProvider, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { AGENT_RUNTIME_CAPABILITIES, agentHostCapabilities as agent, defaultAgentRuntime, type AgentRuntimeDescriptor, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// PG-054 / BL-372: Coding and Characters never name a Runtime. Which one a project uses is the Home default of the platform's runtime
// directory; whether a Character may run on one is that Runtime's own declaration.

const runtime = (runtime_id: string, extra: Partial<AgentRuntimeDescriptor> = {}, off: readonly string[] = []): AgentRuntimeDescriptor => ({
  runtime_id, display_name: runtime_id, provider_version: "fixture",
  capabilities: Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map(name => [name, off.includes(name) ? "unsupported" : "supported"])) as AgentRuntimeDescriptor["capabilities"], ...extra,
});

test("RAC-450 the Home default Runtime is the first in the directory's order that can host a session; none when none can", () => {
  const cannotRun = runtime("no-run", {}, ["run.start"]), cannotCreate = runtime("no-session", {}, ["session.create"]), second = runtime("second-engine"), third = runtime("third-engine");
  assert.equal(defaultAgentRuntime([cannotRun, cannotCreate, second, third])?.runtime_id, "second-engine", "a Runtime that cannot host a session is passed over, whatever its id");
  assert.equal(defaultAgentRuntime([third, second])?.runtime_id, "third-engine", "the directory's order decides");
  assert.equal(defaultAgentRuntime([cannotRun, cannotCreate]), null);
  assert.equal(defaultAgentRuntime([]), null);
});

/** One project with a published Character, Characters' provider over it (with `catalog` as the built-in Agent's engines) and Coding's routes over a Runtime directory. */
async function environment(runtimes: AgentRuntimeDescriptor[], catalog?: CharactersAgentCatalog) {
  const home = mkdtempSync(join(tmpdir(), "coding-runtime-declarations-")), dbPath = join(home, "board.db");
  await seedConfiguredModels(home); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const personal = openCharacters(home, "web-user"), draft = personal.service.create();
  personal.service.update(draft.character_id, 1, { title: "角色", instructions: "固定要求", host_tools: null });
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const library = new ArtifactsModule(ports);
  personal.service.publish(draft.character_id, 2, content => library.commands.registerVersion({ ...pinnedArtifact(content.title, { kind: "character", id: content.character_id }),
    project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: `character:${DEMO_PROJECT_ID}:${draft.character_id}`, version: 1, artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
    producer: { plugin_id: CHARACTER_PLUGIN_ID, plugin_version: "1.0.0", binding_signature: CHARACTER_PUBLISHER_SIGNATURE },
    content: { kind: "inline", payload: content as never } }));
  const sessions = codingSessions(store);
  for (const runtime of runtimes) await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: runtime.runtime_id, title: runtime.runtime_id, runtime_id: runtime.runtime_id, at: new Date().toISOString() });
  const starts: AgentStartRequest[] = []; let created = 0, picked: string | null = null;
  const project = pluginActions(store, DEMO_PROJECT_ID);
  project.registry.registerProvider(charactersProvider({ project_id: DEMO_PROJECT_ID, artifacts: library, processItems: new ProcessItemsModule(ports) }, {
    actorId: "web-user", drafts: personal.service, publish: (id, revision, publisher) => personal.service.publish(id, revision, publisher),
    references: () => library.query.listArtifacts(DEMO_PROJECT_ID, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }).map(({ artifact_id, version }) => ({ artifact_id, version })) }, catalog));
  const host = { store, ...openProjectVersionStores(store), homeDirectory: home, projectId: DEMO_PROJECT_ID, actions: project, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === agent.listRuntimes.capability_id) return runtimes as Output;
      if (definition.capability_id === projectSettingsCapabilities.runtime.capability_id) return picked as Output;
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: home, realpath_verified: true }] as Output;
      if (definition.capability_id === projectSettingsCapabilities.browsingWorkspace.capability_id || definition.capability_id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: (args as unknown[])[0], session_id: `sdk-${created}` } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as AgentStartRequest[])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } };
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host, codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (id: string, suffix: string, method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/${id ? `sessions/${id}` : "state"}${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() };
  };
  return { project, request, starts, created: () => created, pick: (runtimeId: string | null) => { picked = runtimeId; },
    post: (path: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async result => ({ status: result.status, body: await result.json() })),
    newSession: () => fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新会话" }) })
      .then(async result => ({ status: result.status, body: await result.json() })), ref: { artifact_id: `character:${DEMO_PROJECT_ID}:${draft.character_id}`, version: 1 },
    start: (id: string, character: unknown) => request(id, "/runs", "POST", { task: "做点什么", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", character }),
    close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); personal.close(); store.close(); rmSync(home, { recursive: true, force: true }); } };
}

test("RAC-451 Characters' action catalog is the Home default Runtime's, asked by its id; no engine that takes action tools means no actions", async () => {
  const view = { capability_id: "fixture.act" } as ActionView, asked: string[] = [];
  let engines: AgentRuntimeDescriptor[] = [];
  const env = await environment([runtime("any-engine")], { listRuntimes: async () => engines, pickedRuntime: () => null, listActions: async id => { asked.push(id); return [view]; } });
  const context = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [...charactersActions.actions.action.permissions] };
  const catalog = async () => ((await env.project.client.invoke(context, charactersActions.actions, {})) as { actions: unknown[] }).actions;
  try {
    engines = [runtime("no-run", { supports_action_tools: true }, ["run.start"]), runtime("second-engine", { supports_action_tools: true }), runtime("third-engine", { supports_action_tools: true })];
    assert.deepEqual(await catalog(), [view]);
    assert.deepEqual(asked, ["second-engine"], "the first Runtime that can host a session, not an engine called by name");
    asked.length = 0;
    engines = [runtime("second-engine")];
    assert.deepEqual(await catalog(), [], "the default Runtime takes no action tools");
    engines = [];
    assert.deepEqual(await catalog(), []);
    assert.deepEqual(asked, [], "nothing is asked of a Runtime that takes no action tools");
  } finally { await env.close(); }
});

test("RAC-452 a Character runs on a Runtime that declares it has verified the limits, whatever its id, and is refused on one that has not", async () => {
  const env = await environment([runtime("plain-engine"), runtime("verified-engine", { supports_character_limits: true })]);
  try {
    assert.equal((await env.request("plain-engine", "/characters")).body.limits_verified, false);
    assert.equal((await env.request("verified-engine", "/characters")).body.limits_verified, true);
    const refused = await env.start("plain-engine", env.ref);
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(env.created(), 0, "refused before a session is made on the Runtime"); assert.equal(env.starts.length, 0);
    assert.equal((await env.start("plain-engine", null)).status, 200, "without a Character the same Runtime runs the round");
    const allowed = await env.start("verified-engine", env.ref);
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.deepEqual(env.starts.at(-1)?.character, env.ref);
  } finally { await env.close(); }
});

test("RAC-453 the state names the Runtime a new session runs on, and no source of Coding or Characters spells a Runtime's id", async () => {
  const env = await environment([runtime("no-run", {}, ["run.start"]), runtime("second-engine", {}, ["skills", "mcp"]), runtime("third-engine", {}, ["skills", "mcp"])]);
  try {
    const state = await env.request("", "");
    assert.equal(state.status, 200, JSON.stringify(state.body));
    assert.equal(state.body.project_runtime_id, "second-engine", "the Home default of the directory, not a Runtime by name");
  } finally { await env.close(); }
  const found: string[] = [];
  for (const dir of ["plugins/native/coding/src", "modules/characters/src", "apps/local-host/src"]) {
    for (const name of readdirSync(join(process.cwd(), dir)).filter(file => file.endsWith(".ts") && (dir !== "apps/local-host/src" || file.startsWith("characters")))) {
      if (/["'`]prologue["'`]/.test(readFileSync(join(process.cwd(), dir, name), "utf8"))) found.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(found, []);
});

test("RAC-455 a project that picked a Runtime runs new sessions on it; when it is no longer offered a new session is refused naming it, nothing is recorded, and going back to the default recovers", async () => {
  const runtimes = [runtime("first-engine", {}, ["skills", "mcp"]), runtime("second-engine", {}, ["skills", "mcp"])];
  const env = await environment(runtimes);
  try {
    const sessions = async () => ((await env.request("", "")).body.sessions as unknown[]).length;
    const base = await sessions();
    assert.equal((await env.newSession()).body.session.runtime_id, "first-engine", "no pick: the Home default");
    env.pick("second-engine");
    assert.equal((await env.newSession()).body.session.runtime_id, "second-engine", "the project's pick, though it is not the Home default");
    assert.equal((await env.request("", "")).body.project_runtime_id, "second-engine");
    const before = await sessions();
    runtimes.splice(1, 1);
    const refused = await env.newSession();
    assert.equal(refused.status, 503, JSON.stringify(refused.body));
    assert.match(JSON.stringify(refused.body), /second-engine.*项目设置/, "it names the Runtime and points to the project's settings");
    assert.equal(await sessions(), before, "the refusal left no session behind"); assert.equal(env.created(), 0);
    assert.equal((await env.request("", "")).body.project_runtime_id, null, "no other Runtime stands in for it");
    assert.equal((await env.post("/mcp", {})).status, 503, "the project's MCP servers are refused the same way");
    env.pick(null);
    assert.equal((await env.newSession()).body.session.runtime_id, "first-engine", "the default again");
    assert.equal(await sessions(), before + 1); assert.ok(before > base);
  } finally { await env.close(); }
});

test("RAC-456 Characters' action catalog follows the project's pick, and is empty when the pick is gone: no other engine's actions stand in for it", async () => {
  const view = { capability_id: "fixture.act" } as ActionView, asked: string[] = [];
  let picked: string | null = null;
  const engines = [runtime("first-engine", { supports_action_tools: true }), runtime("second-engine", { supports_action_tools: true })];
  const env = await environment([runtime("any-engine")], { listRuntimes: async () => engines, pickedRuntime: () => picked, listActions: async id => { asked.push(id); return [view]; } });
  const context = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [...charactersActions.actions.action.permissions] };
  const catalog = async () => ((await env.project.client.invoke(context, charactersActions.actions, {})) as { actions: unknown[] }).actions;
  try {
    picked = "second-engine";
    assert.deepEqual(await catalog(), [view]);
    picked = "gone-engine";
    assert.deepEqual(await catalog(), []);
    picked = null;
    assert.deepEqual(await catalog(), [view]);
    assert.deepEqual(asked, ["second-engine", "first-engine"], "the pick, then the Home default; the gone pick asked nobody");
  } finally { await env.close(); }
});
