import { withProjectWorkspaceActions } from "./fixtures/project-workspace-actions.js";
import { fakeAgentHostActions, fakeWriterActions, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent, type AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

test("however many pages poll the Coding directory at once, one read runs and at most one waits; a request mid-read gets the next read", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-state-coalesce-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  for (const id of ["a", "b", "c"]) {
    await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: id, title: `会话 ${id}`, runtime_id: "prologue", at: new Date().toISOString() });
    await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, id, `sdk-${id}`, new Date().toISOString());
  }
  let reads = 0, inFlight = 0, most = 0; const batches: string[][] = [];
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, _args: Input): Promise<Output> {
    if (definition.capability_id === agent.listRuntimes.capability_id) {
      reads++; inFlight++; most = Math.max(most, inFlight);
      // Each directory read is slow, as it is with many sessions behind one project queue.
      await new Promise(resolve => setTimeout(resolve, 150));
      inFlight--;
      return [{ runtime_id: "prologue", capabilities: { mcp: "unsupported" } }] as Output;
    }
    if (definition.capability_id === agent.readSessionStatuses.capability_id) {
      batches.push([...(_args as unknown as [string, string[]])[1]]);
      // One session is mid-review, one has never run, and one cannot be read.
      return (_args as unknown as [string, string[]])[1].map(session_id => session_id === "sdk-a" ? { session_id, latest_phase: "awaiting-review", recovery: false, checkpoint_busy: false, steps: { mine: 1, subtasks: 1, unowned: 0 } }
        : session_id === "sdk-b" ? { session_id, latest_phase: null, recovery: false, checkpoint_busy: true } : { session_id, error: "读不到" }) as Output;
    }
    if (definition.capability_id === agent.listSkills.capability_id) return [] as Output;
    if (definition.capability_id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
    if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
    throw new Error(`Unexpected capability ${definition.capability_id}`);
  } };
  const host = () => withProjectWorkspaceActions({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(pluginActions(store, DEMO_PROJECT_ID), (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  }, { workspaces: () => [], browsingWorkspace: () => null, runtime: () => null });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const state = async () => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/state`);
    return { status: result.status, body: await result.json() };
  };
  try {
    const first = await state();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.sessions.length, 3);
    // Every session's standing arrives in one Host call, and is what the directory shows.
    assert.deepEqual(batches.map(batch => [...batch].sort()), [["sdk-a", "sdk-b", "sdk-c"]]);
    const byId = Object.fromEntries(first.body.sessions.map((session: { session_id: string }) => [session.session_id, session]));
    assert.equal(byId.a.state, "waiting-approval");
    // SYS15-Q1: query projections carry current plan holders without changing the stored session.
    assert.deepEqual(byId.a.steps, { mine: 1, subtasks: 1, unowned: 0 });
    assert.equal(sessions.stepsOf(DEMO_PROJECT_ID, "a"), null);
    assert.equal(byId.b.steps, undefined);
    assert.equal(byId.b.state, "idle"); assert.equal(byId.b.checkpoint_busy, true);
    assert.equal(byId.c.state, "reconcile-required", "an unreadable session is never shown as safe to continue");
    reads = 0;
    // Ten pages ask at once: the first read runs, every later request shares the single read queued behind it.
    const answers = await Promise.all(Array.from({ length: 10 }, () => state()));
    assert.ok(answers.every(answer => answer.status === 200 && answer.body.sessions.length === 3), JSON.stringify(answers.map(answer => answer.status)));
    assert.equal(reads, 2, "one read plus one queued read serve all ten requests");
    assert.equal(most, 1, "never two directory reads at the same time");
    // A request after the others have been answered starts a fresh read.
    await state();
    assert.equal(reads, 3);
    assert.equal(sessions.stepsOf(DEMO_PROJECT_ID, "a"), null, "polling never persists the projected steps");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

// PG-054 (specs/repository-anti-corruption/privileges.md): Coding names no Runtime. A new session, and the methods and MCP servers the
// project keeps, use the first Runtime in the platform's directory that can host a session (there is no per-project choice yet, BL-372); what
// a Runtime offers is read from its own capability matrix, never from its id.

type Level = "supported" | "partial" | "unsupported";
type Entry = { runtime_id: string; display_name: string; capabilities: Record<string, Level> };
const runtime = (runtime_id: string, capabilities: Record<string, Level> = {}): Entry => ({ runtime_id, display_name: runtime_id,
  capabilities: { "session.create": "supported", "run.start": "supported", skills: "partial", mcp: "partial", subagents: "partial", ...capabilities } });
/** What a letter between two sessions carries from the person who sends it. */
type Wording = { from_session: string; to_session: string; body: string };
const PLUGIN = "/api/plugins/io.molis.work.coding";

async function harness(initial: Entry[]) {
  const root = mkdtempSync(join(tmpdir(), "coding-runtime-choice-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  const calls: Array<[string, unknown]> = [];
  const world = { runtimes: initial, noLetters: false, created: 0 };
  // Reading a child's result is the Host's action (PG-035): it answers an empty view, and the call is recorded with the others.
  const actions = fakeWriterActions(pluginActions(store, DEMO_PROJECT_ID), definition => {
    if (definition.capability_id !== writerIntegrationCapabilities.read.capability_id) throw new Error(`Unexpected action ${definition.capability_id}`);
    return { workspace_id: "work", writer_workspace_id: "child", source_path: root + "-child", target_path: root, branch: "writer/child", base_commit: "abc123", files: [] };
  }, calls);
  const letter = (input: Wording, state: AgentSessionMessage["state"]): AgentSessionMessage => ({ message_id: "m1", audience: "people", kind: "request",
    from_session: input.from_session, to_session: input.to_session, from_title: "发起", to_title: "委派", body: input.body, state, sent_at_ms: Date.now(), history: [], attachments: [] });
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
    const id = definition.capability_id, input: unknown[] = Array.isArray(args) ? args : [];
    calls.push([id, args]);
    // Every call that names a Runtime says which one, so a test can tell where each went.
    if (id === agent.listRuntimes.capability_id) return world.runtimes as Output;
    // Each answer carries the Runtime it was asked of in a field of its own contract (a method's name, a server's label).
    if (id === agent.listSkills.capability_id) return [{ skill_id: "from", name: input[0] }] as Output;
    if (id === agent.listMcp.capability_id) return [{ id: "from", label: input[0] }] as Output;
    if (id === agent.saveMcp.capability_id) return { id: "saved", label: input[0] } as Output;
    if (id === agent.controlMcp.capability_id) return undefined as Output;
    if (id === agent.discoverSkills.capability_id) return [{ candidate_id: "c1", source_label: input[0] }] as Output;
    if (id === agent.installSkill.capability_id) return { skill_id: "installed", name: input[0] } as Output;
    if (id === agent.readSkill.capability_id) return { skill_id: "read", name: input[0] } as Output;
    if (id === agent.createSession.capability_id) return { runtime_id: input[0], session_id: `rt-${++world.created}` } as Output;
    if (id === agent.readMessages.capability_id) return [] as Output;
    if (id === agent.sendPeopleMessage.capability_id) {
      // A Runtime with no letters between sessions says so before it sends anything.
      if (world.noLetters) throw Object.assign(new Error("当前运行时不能发会话间的信"), { code: "agent.capability_unavailable" });
      return letter(input[1] as Wording, "queued") as Output;
    }
    if (id === agent.actOnPeopleMessage.capability_id) return letter({ from_session: "rt-1", to_session: "rt-2", body: JSON.stringify({ title: "t", task: "task" }) }, "delivered") as Output;
    if (id === agent.readSessionStatuses.capability_id) return (input[1] as string[]).map(session_id => ({ session_id, latest_phase: "completed", recovery: false, checkpoint_busy: false })) as Output;
    if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
    throw new Error(`Unexpected capability ${id}`);
  } };
  const host = () => withProjectWorkspaceActions({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(actions, (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  }, { workspaces: () => [{ workspace_id: "work", display_name: "Work", canonical_path: root, realpath_verified: true }], browsingWorkspace: () => null, runtime: () => null });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}${PLUGIN}${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  // The arguments of each call to a capability, as the list the Host takes (a single input is a list of one).
  const made = (capability: { capability_id: string }): unknown[][] => calls.filter(([id]) => id === capability.capability_id).map(([, args]) => Array.isArray(args) ? args : [args]);
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); };
  return { call, calls, made, sessions, world, close, root };
}

test("PG-054 with only Prologue in the directory a new session, the methods and the MCP servers behave as they did", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("prologue")]);
  try {
    const created = await h.call("/sessions", { title: "第一件事" });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.session.runtime_id, "prologue");
    const state = await h.call("/state");
    assert.equal(state.status, 200, JSON.stringify(state.body));
    assert.deepEqual(state.body.methods.map((method: { skill_id: string; name: string }) => [method.skill_id, method.name]), [["from", "prologue"]]);
    assert.deepEqual(state.body.mcp.map((server: { id: string; label: string }) => [server.id, server.label]), [["from", "prologue"]]);
    const saved = await h.call("/mcp", { expected_version: 0, label: "x", transport: "http", endpoint: "http://127.0.0.1:1/mcp", enabled: true, timeout_ms: 1000, auth: { kind: "none" } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.server.label, "prologue");
    assert.equal((await h.call("/mcp/s1/control", { action: "connect" })).status, 200);
    assert.equal(h.made(agent.controlMcp)[0]![0], "prologue");
    assert.equal((await h.call("/methods/discover", { workspace_id: "work", path: "skills" })).body.candidates[0].source_label, "prologue");
    assert.equal((await h.call("/methods/install", { candidate_id: "c1" })).body.method.name, "prologue");
    assert.equal((await h.call("/methods/review-change/1")).body.method.name, "prologue");
  } finally { await h.close(); }
});

test("PG-054 a Runtime listed earlier that cannot host a session is skipped: a new session, the methods and the MCP servers use the next one", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("reader", { "session.create": "unsupported", "run.start": "unsupported" }), runtime("no-rounds", { "run.start": "unsupported" }), runtime("beta"), runtime("prologue")]);
  try {
    const created = await h.call("/sessions", {});
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.session.runtime_id, "beta", "the first two in the directory cannot host a session; the third can");
    const state = await h.call("/state");
    assert.deepEqual(state.body.methods.map((method: { skill_id: string; name: string }) => [method.skill_id, method.name]), [["from", "beta"]]);
    assert.deepEqual(state.body.mcp.map((server: { id: string; label: string }) => [server.id, server.label]), [["from", "beta"]]);
    const saved = await h.call("/mcp", { expected_version: 0, label: "x", transport: "http", endpoint: "http://127.0.0.1:1/mcp", enabled: true, timeout_ms: 1000, auth: { kind: "none" } });
    assert.equal(saved.body.server.label, "beta");
    // The directory's order is the only rule: when the earlier ones can host a session again, they are the ones used.
    h.world.runtimes = [runtime("reader"), runtime("beta"), runtime("prologue")];
    assert.equal((await h.call("/sessions", {})).body.session.runtime_id, "reader");
    assert.deepEqual(h.sessions.list(DEMO_PROJECT_ID).map(session => session.runtime_id).sort(), ["beta", "reader"], "the session already made keeps its Runtime");
  } finally { await h.close(); }
});

test("PG-054 with no Runtime that can host a session a new session is refused with a readable reason and none is made", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("reader", { "session.create": "unsupported" }), runtime("no-rounds", { "run.start": "unsupported" })]);
  try {
    const refused = await h.call("/sessions", { title: "不会建立" });
    assert.deepEqual([refused.status, refused.body.code], [503, "coding.runtime_unavailable"]);
    assert.match(refused.body.error, /宿主还没有可用的运行时/);
    assert.equal(h.sessions.list(DEMO_PROJECT_ID).length, 0, "nothing was created");
    // The project still opens: no methods or MCP servers are asked of a Runtime that cannot be chosen, and none are saved.
    const state = await h.call("/state");
    assert.deepEqual([state.status, state.body.sessions, state.body.methods, state.body.mcp], [200, [], [], []]);
    assert.equal(h.made(agent.listSkills).length + h.made(agent.listMcp).length, 0);
    assert.equal((await h.call("/mcp/s1/control", { action: "connect" })).status, 503);
    assert.equal(h.made(agent.controlMcp).length, 0);
    // A Runtime that can host one appears: the same request now works, with nothing to redo.
    h.world.runtimes = [runtime("reader", { "session.create": "unsupported" }), runtime("prologue")];
    assert.equal((await h.call("/sessions", {})).body.session.runtime_id, "prologue");
  } finally { await h.close(); }
});

test("PG-054 a Runtime whose matrix offers no MCP shows no MCP servers and refuses to save or control them; methods follow their own entry", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("prologue", { mcp: "unsupported" })]);
  try {
    const state = await h.call("/state");
    assert.deepEqual([state.status, state.body.mcp], [200, []]);
    assert.deepEqual(state.body.methods.map((method: { skill_id: string; name: string }) => [method.skill_id, method.name]), [["from", "prologue"]], "methods are not tied to MCP");
    assert.equal(h.made(agent.listMcp).length, 0, "no MCP list is asked of a Runtime that has none");
    const input = { expected_version: 0, label: "x", transport: "http", endpoint: "http://127.0.0.1:1/mcp", enabled: true, timeout_ms: 1000, auth: { kind: "none" } };
    const save = await h.call("/mcp", input);
    assert.deepEqual([save.status, save.body.code], [503, "coding.runtime_unavailable"]);
    assert.match(save.body.error, /不支持 MCP/);
    const control = await h.call("/mcp/s1/control", { action: "connect" });
    assert.deepEqual([control.status, control.body.code], [503, "coding.runtime_unavailable"]);
    assert.equal(h.made(agent.saveMcp).length + h.made(agent.controlMcp).length, 0, "nothing reached the Runtime");
    // The same for methods: a Runtime that offers none shows none and refuses to find or install them.
    h.world.runtimes = [runtime("prologue", { skills: "unsupported" })];
    const bare = await h.call("/state");
    assert.deepEqual([bare.body.methods, bare.body.mcp.length], [[], 1]);
    for (const attempt of [h.call("/methods/discover", { workspace_id: "work", path: "skills" }), h.call("/methods/install", { candidate_id: "c1" }), h.call("/methods/review-change/1")]) {
      const refused = await attempt;
      assert.deepEqual([refused.status, refused.body.code], [503, "coding.runtime_unavailable"]);
    }
    assert.equal(h.made(agent.discoverSkills).length + h.made(agent.installSkill).length + h.made(agent.readSkill).length, 0);
  } finally { await h.close(); }
});

test("PG-054 a delegation is made on the Runtime of the session that asks, and a Runtime with no letters between sessions refuses before sending anything", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("beta"), runtime("prologue")]);
  const at = new Date().toISOString();
  await h.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "a", title: "发起", runtime_id: "beta", at });
  try {
    const sent = await h.call("/sessions/a/delegations", { task: "整理会议记录" });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.notEqual(sent.body.delivery_unconfirmed, true, "a successful delegation was actually delivered, not recovered after an invalid output");
    assert.equal(sent.body.session.runtime_id, "beta", "the receiving session is on the asking session's Runtime");
    assert.deepEqual(h.made(agent.createSession).map(args => args[0]), ["beta", "beta"]);
    assert.equal(h.made(agent.sendPeopleMessage)[0]![0], "beta");
    // A Runtime that cannot send letters: the call is refused, the session made for it is put away, and no letter exists.
    h.world.noLetters = true;
    const before = h.sessions.list(DEMO_PROJECT_ID).length;
    const refused = await h.call("/sessions/a/delegations", { task: "再整理一份" });
    assert.notEqual(refused.status, 200);
    assert.match(refused.body.error, /不能发会话间的信/);
    assert.equal(h.sessions.list(DEMO_PROJECT_ID).length, before, "the session made for the refused delegation is archived");
    assert.equal(h.made(agent.actOnPeopleMessage).length, 1, "nothing was delivered for the refused one");
  } finally { await h.close(); }
});

test("PG-054 integrating a child's work needs sub-agents in the session's own Runtime, not a Runtime of a particular name", { timeout: 30_000 }, async () => {
  const h = await harness([runtime("beta", { subagents: "unsupported" }), runtime("prologue")]);
  const at = new Date().toISOString();
  for (const [id, runtime_id] of [["a", "beta"], ["b", "prologue"]] as const) {
    await h.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: id, title: id, runtime_id, at });
    await h.sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, id, `rt-${id}`, at);
  }
  try {
    const none = await h.call("/sessions/a/runs/r1/subagents/c1/integration");
    assert.equal(none.status, 400, JSON.stringify(none.body));
    assert.match(none.body.error, /没有可整合的原子任务/);
    assert.equal(h.made(writerIntegrationCapabilities.read).length, 0);
    const read = await h.call("/sessions/b/runs/r1/subagents/c1/integration");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.deepEqual(h.made(writerIntegrationCapabilities.read), [[{ session_id: "rt-b", run_id: "r1", subagent_id: "c1" }]]);
  } finally { await h.close(); }
});
