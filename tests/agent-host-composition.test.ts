import assert from "node:assert/strict";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LocalProjectDatabase,
  MolisWorkLocalHost,
  composeAgentHost,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities, type AgentActionClient, type AgentStartExecution, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { managementGoals } from "./goal-management-caller.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";
import { codingManifest, createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

/** 产品装配真的构造了 Agent Host，插件经 Capability 够得到它。 */

const CODING = "io.molis.work.coding";
/** A test-only Runtime that, like any Runtime without a Host approval bridge, can read but not write or run commands. */
const READ_ONLY = "fixture-read-only";

function readOnlyRuntime(runtimeId: string): AgentRuntimeAdapter {
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  return {
    descriptor: { runtime_id: runtimeId, display_name: "Read-only fixture", provider_version: "1", capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, readSession: unused, start: unused, read: unused, control: unused, readCommandOutput: unused,
    observe() { throw new Error("Not used by this fixture"); },
  };
}

/**
 * A running plugin that carries Coding's Agent block, and its typed client: a plugin's roles come only from its running declaration
 * (PG-051 RAC-195), so a start or a role listing is the plugin's own call.
 */
async function codingCaller(localHost: MolisWorkLocalHost, reference: LocalHostProjectReference, directory: string) {
  const coding = createCodingPlugin();
  const plugin = callerPlugin("coder", "project", {}, Object.values(agentHostCapabilities).map(entry => entry.capability_id),
    { block: codingManifest.agent!, agent_prompts: coding.agent_prompts, agent_skills: coding.agent_skills });
  const store = new LocalProjectDatabase(join(directory, "coder.sqlite"));
  const { install_id } = await startPlugin(localHost, reference, store, plugin, { capabilities: localHost.client(reference) });
  const owner = { project_id: reference.project_id, plugin_id: plugin.id, install_id, actor_id: LOCAL_PERSON_ACTOR_ID };
  return { store, owner, client: plugin.context(reference.project_id).services!.capabilities! };
}

async function fixture(workspace: ProjectWorkspaceRef | null) {
  const directory = await mkdtemp(join(tmpdir(), "agent-composition-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({
    databasePath: join(directory, "project.db"),
    projectId: "project-a",
  });
  const composition = composeAgentHost({ localHost, workspaceFor: () => workspace });
  composition.agentHost.register(readOnlyRuntime(READ_ONLY));
  return { directory, localHost, reference, composition, client: localHost.client(reference) };
}

async function close(item: Awaited<ReturnType<typeof fixture>>) {
  item.composition.dispose();
  await item.localHost.closeProject(item.reference);
  await item.localHost.close();
  await rm(item.directory, { recursive: true, force: true });
}

test("Agent Host loads current guidance through actions and freezes each real revision", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "agent-guidance-")));
  let denied = false, reads = 0;
  const localHost = new MolisWorkLocalHost({ completeText: null, actionAvailability: (_caller, action) => {
    if (action.capability_id === "goals.guidance.read") {
      reads++;
      if (denied) return { available: false, code: "actions.plugin_disabled", reason: "说明不可用" };
    }
    return { available: true };
  } });
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: "board" });
  const composition = composeAgentHost({ localHost, workspaceFor: () => ({ workspace_id: "w", canonical_path: directory, realpath_verified: true, display_name: "workspace" }) });
  const captured: AgentStartRequest[] = [];
  const coder = await codingCaller(localHost, reference, directory);
  composition.agentHost.register({
    descriptor: { runtime_id: "probe", display_name: "Probe", provider_version: "1", capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession() { throw new Error("Not used by this read fixture"); },
    async read() { throw new Error("Not used by this read fixture"); },
    observe() { throw new Error("Not used by this read fixture"); },
    async control() { throw new Error("Not used by this read fixture"); },
    async readCommandOutput() { throw new Error("Not used by this read fixture"); },
    async readSession(session) { return { session, owner: coder.owner, title: "Read", runs: [], latest_run: null }; },
    async start(request) {
      captured.push(request); const role = request.role!;
      return { ref: { run_id: `r${captured.length}`, session_id: "s" }, frozen: { role_id: role.role_id, role_version: role.version, execution: role.execution,
        model_id: "probe", prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt) })),
        host_tools: [...role.host_tools], skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null,
        ...(request.workspace === "none" ? { workspace: "none" as const } : { directory: request.directory }) } };
    },
  });
  const client = coder.client;
  try {
    const management = managementGoals(localHost.actionClient(reference), "board");
    await management.invoke(goalsActions.initialize, { idempotency_key: "init" });
    const added = await management.invoke(goalsActions.guidanceAdd, { kind: "constraint",
      content: "保留源文件。", reason: "项目边界", confirmation_summary: "用户确认", user_confirmed: true, idempotency_key: "add" });
    const request: AgentStartRequest = { ...coder.owner, session: { runtime_id: "probe", session_id: "s" },
      task: "读取项目", role_id: "reader", directory: { canonical_path: directory, realpath_verified: true } };
    await client.invoke(agentHostCapabilities.startRun, ["probe", request]);
    const first = captured[0]!.role!.prompts.find(prompt => prompt.prompt_id === "project-guidance")!;
    assert.match(first.body, /保留源文件/); assert.equal(first.version, 1);
    await management.invoke(goalsActions.guidanceUpdate, { guidance_id: added.entry.guidance_id,
      action: "edit", kind: "constraint", content: "保留源文件和备份。", reason: "补充边界", confirmation_summary: "用户确认", user_confirmed: true, idempotency_key: "edit" });
    await client.invoke(agentHostCapabilities.startRun, ["probe", request]);
    const second = captured[1]!.role!.prompts.find(prompt => prompt.prompt_id === "project-guidance")!;
    assert.match(second.body, /保留源文件和备份/); assert.equal(second.version, 2);
    assert.doesNotMatch(first.body, /和备份/, "the previous run retains its original prompt");
    denied = true;
    await client.invoke(agentHostCapabilities.startRun, ["probe", request]);
    assert.equal(captured[2]!.role!.prompts.some(prompt => prompt.prompt_id === "project-guidance"), false);
    assert.ok(reads >= 3, "each start consults the real guidance action policy");
  } finally { await composition.dispose(); coder.store.close(); await localHost.close(); await rm(directory, { recursive: true, force: true }); }
});

test("an Agent round carries the number of the call that started it: its tool calls and the start the Runtime is given", async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "agent-call-id-")));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const localHost = new MolisWorkLocalHost({ completeText: null });
  let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  t.after(async () => {
    try { await served?.close(); }
    finally {
      try { await localHost.close(); }
      finally { await rm(home, { recursive: true, force: true }); }
    }
  });
  // The web server reuses the service this Host owns instead of registering a second Agent composition.
  const composition = localHost.ensureAgentService(home, () => composeAgentHost({ localHost, homeDirectory: home,
    workspaceFor: () => ({ workspace_id: "w", canonical_path: home, realpath_verified: true, display_name: "workspace" }) }));
  // The tool lives on this Host, whose real catalog and access settings serve the grant.
  served = await serveTestHost(null, { home, host: localHost });
  const project = await served.createProject("Numbers");
  const reference = project.reference;
  const ping: ActionDefinition = { capability_id: "fixture.agent.ping", version: 1, operation: "query", action: { title: "Ping", description: "Answers", kind: "query", scope: "project",
    audiences: ["agent", "mcp"], permissions: [], subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false } } };
  const handled: Array<string | undefined> = [];
  const coder = await codingCaller(localHost, reference, home);
  t.after(() => coder.store.close());
  let execution: AgentStartExecution | undefined, tools: AgentActionClient | undefined, request: AgentStartRequest | undefined;
  composition.agentHost.register({
    descriptor: { runtime_id: "probe", display_name: "Probe", provider_version: "1", supports_action_tools: true, capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession() { throw new Error("Not used by this fixture"); },
    async read() { throw new Error("Not used by this fixture"); },
    observe() { throw new Error("Not used by this fixture"); },
    async control() { throw new Error("Not used by this fixture"); },
    async readCommandOutput() { throw new Error("Not used by this fixture"); },
    async readSession(session) { return { session, owner: coder.owner, title: "Read", runs: [], latest_run: null }; },
    async start(given, guards) {
      request = given; execution = guards; tools = given.role!.actions!.client; const role = given.role!;
      return { ref: { run_id: "r1", session_id: "s" }, frozen: { role_id: role.role_id, role_version: role.version, execution: role.execution, model_id: "probe",
        prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt) })), host_tools: [...role.host_tools],
        skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null, directory: { canonical_path: home, realpath_verified: true as const }, action_tools: given.action_tools } };
    },
  });
  const client = coder.client;
  localHost.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture.agent", kind: "plugin", title: "Fixture" }, definitions: [ping],
    handlers: [{ ...ping, handle(context) { handled.push(context.call_id); return "pong"; } }] });
  await grantGoalsMcp(served, project, "agent:probe", [ping]);
  const action = { capability_id: ping.capability_id, version: 1, provider_id: "fixture.agent" };
  const start = { ...coder.owner, session: { runtime_id: "probe", session_id: "s" },
    task: "读取项目", role_id: "reader", directory: { canonical_path: home, realpath_verified: true }, action_tools: [action] };
  // A number in the request body is the plugin's own data: it is never the round's number.
  const started = newCallId();
  const forged = { ...start, call_id: "forged" };
  await withCallId(started, () => client.invoke(agentHostCapabilities.startRun, ["probe", forged]));
  assert.equal(request?.role?.actions?.tools.length, 1, "the round was offered the tool");
  // The Runtime calls its tools later, in its own loop, outside the call that started the round.
  await tools!.invoke(action, {});
  await tools!.invoke(action, {});
  assert.equal(handled.length, 2);
  assert.equal(execution?.call_id, started, "the start the Runtime is given carries the number of the typed call that started it");
  assert.deepEqual(handled, [started, started], "every tool call of the round has the round's number");
});

test("装配不带任何默认 Runtime：命令行 Runtime 已删除，没给 Prologue 时运行时列表为空", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-composition-empty-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: "project-a" });
  const composition = composeAgentHost({ localHost, workspaceFor: () => null });
  try {
    assert.deepEqual(composition.agentHost.descriptors(), [], "a Host registers only what its owner supplied");
    assert.deepEqual(await localHost.client(reference).invoke(agentHostCapabilities.listRuntimes, []), []);
  } finally {
    await composition.dispose();
    await localHost.closeProject(reference);
    await localHost.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("装配之后，运行时列表经 Capability 就能拿到", async () => {
  const item = await fixture(null);
  try {
    const runtimes = await item.client.invoke(agentHostCapabilities.listRuntimes, []);
    assert.deepEqual(runtimes.map((entry) => entry.runtime_id), [READ_ONLY]);
    // 没有接宿主审批的 Runtime 只读：写入与命令如实报不支持
    assert.equal(runtimes[0]?.capabilities["text-edit"], "unsupported");
    assert.equal(runtimes[0]?.capabilities.command, "unsupported");
  } finally {
    await close(item);
  }
});

test("Coding 的角色从它自己的 Manifest 解析；只读的可用，会写的不可用", async () => {
  const item = await fixture(null), coder = await codingCaller(item.localHost, item.reference, item.directory);
  try {
    const roles = await coder.client.invoke(agentHostCapabilities.availableRoles,
      [READ_ONLY, coder.owner.plugin_id]);
    const reader = roles.find((role) => role.role_id === "reader");
    const writer = roles.find((role) => role.role_id === "writer");
    assert.equal(reader?.available, true);
    assert.equal(writer?.available, false, "Runtime 没接宿主审批，会写的角色就该不可用");
    assert.match(writer?.reason ?? "", /text-edit/);
    // RAC-195: a call no running plugin makes finds no roles in the catalog; it is answered with none, not refused.
    assert.deepEqual(await item.client.invoke(agentHostCapabilities.availableRoles, [READ_ONLY, CODING]), []);
  } finally {
    coder.store.close();
    await close(item);
  }
});

test("没有声明 Agent 的插件，一个角色都拿不到", async () => {
  const item = await fixture(null);
  try {
    assert.deepEqual(
      await item.client.invoke(agentHostCapabilities.availableRoles, [READ_ONLY, "io.molis.work.feed"]),
      [], "没声明就是没有，不是给个默认角色");
  } finally {
    await close(item);
  }
});

// 目录闸在建会话时就拦下：没授权的目录连会话都开不出来，更轮不到起跑。
test("项目没绑定工作区时，建会话就被目录那道闸拦住", async () => {
  const item = await fixture(null);
  try {
    await assert.rejects(
      () => item.client.invoke(agentHostCapabilities.createSession, [READ_ONLY, {
        plugin_id: CODING, project_id: "project-a", install_id: "coding", actor_id: "user", title: "看看代码",
        directory: { canonical_path: "/tmp/anywhere", realpath_verified: true },
      }]),
      (error: unknown) => (error as { code?: string }).code === "agent.directory_unauthorized",
    );
  } finally {
    await close(item);
  }
});

test("插件不能拿一个宿主没授权的目录开会话", async () => {
  const real = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  const item = await fixture({
    workspace_id: "w", canonical_path: real, realpath_verified: true, display_name: "ws",
  });
  try {
    await assert.rejects(
      () => item.client.invoke(agentHostCapabilities.createSession, [READ_ONLY, {
        plugin_id: CODING, project_id: "project-a", install_id: "coding", actor_id: "user", title: "看看代码",
        directory: { canonical_path: "/somewhere/else", realpath_verified: true },
      }]),
      (error: unknown) => (error as { code?: string }).code === "agent.directory_unauthorized",
      "授权的是这个项目绑定的目录，不是插件报上来的那个",
    );
  } finally {
    await close(item);
    await rm(real, { recursive: true, force: true });
  }
});

test('Git result projection excludes active, uncertain, undelivered and foreign reviews without turning approval into success', async () => {
  const { readGitResultsCapability } = await import('@molis-ai/molis-work-contracts/modules/workspace-artifacts');
  const item = await fixture({ workspace_id: 'w', canonical_path: '/unused', realpath_verified: true } as ProjectWorkspaceRef);
  const store = new LocalProjectDatabase(join(item.directory, 'plugins.sqlite'));
  try {
    // A plugin-only action (PG-035): read the way Git reads it, by an installation that consumes it and holds workspace:read.
    const reader = callerPlugin('gitresults', 'project', { 'workspace:read': true }, [readGitResultsCapability.capability_id]);
    await startPlugin(item.localHost, item.reference, store, reader);
    const actions = reader.actions(item.reference.project_id);
    const queue = item.composition.agentHost.reviews;
    for (const id of ['pending', 'approved', 'unknown', 'undelivered', 'done', 'failed', 'denied', 'other-workspace', 'other-project']) {
      queue.request({ review_id: id, project_id: id === 'other-project' ? 'project-b' : 'project-a', run: null, plugin_id: 'io.molis.work.git', kind: 'git-index',
        operation: { kind: 'git-index', operation_id: id, workspace_id: id === 'other-workspace' ? 'other' : 'w' },
        document: { kind: 'git-index', action: 'stage', workspace_name: 'fixture', files: [{ path: 'note', before_text: 'old', after_text: 'new', before_mode: '100644', after_mode: '100644' }] },
        requested_at: '2026-09-22T00:00:00Z', expires_at: null }, { plugin_id: 'io.molis.work.git', install_id: 'fixture', holds: () => true });
      if (id === 'pending') continue;
      queue.decide({ review_id: id, decision: id === 'denied' ? 'reject' : 'approve', actor_id: 'reviewer' });
      if (id === 'denied') continue;
      queue.consumeApproval(id);
      if (id === 'unknown') queue.uncertain(id, 'missing receipt');
      else if (id === 'undelivered') queue.deliveryFailed(id, 'lost delivery');
      else if (id === 'failed') queue.settle(id, { ok: false, error: 'refused changed version' });
      else if (id !== 'approved') queue.settle(id, { ok: true });
    }
    const reconciliation = { actor_id: 'reconciler', at: '2026-09-22T00:05:00Z', reason: 'original process ended before dispatch' };
    queue.recordReconciliation('failed', reconciliation);
    const result = await actions.invoke(readGitResultsCapability, { workspace_id: 'w' });
    assert.deepEqual(result.map(one => [one.operation_id, one.outcome]).sort(), [['denied', 'denied'], ['done', 'succeeded'], ['failed', 'failed']]);
    assert.ok(result.every(one => one.review.decided_by === 'reviewer'));
    assert.deepEqual(result.find(one => one.operation_id === 'failed')?.review.reconciliation, reconciliation);
    assert.equal(result.find(one => one.operation_id === 'failed')?.review.failure_reason, 'refused changed version');
    await assert.rejects(actions.invoke(readGitResultsCapability, { workspace_id: 'unlinked' }), { code: 'workspace_git.workspace_unavailable' });
  } finally { await close(item); store.close(); }
});
