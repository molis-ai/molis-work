import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, createMolisWorkLocalHost, ensureSystemAgentService, molisWorkHostProjectReference, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { codingManifest, createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { managementGoals } from "./goal-management-caller.js";
import { watchSettlements, type Settlement } from "./fixtures/settlements.js";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";

// N-12: Host-internal callers of Goals (the first-run Goal, the project guidance read of a Run) call the
// Goals actions, and an action client can be asked not to start the project's Runtime plugins first.

const CONTROL_TOKEN = "onboarding-goals-actions-control-token-0123456789";
const RUNTIME_PLUGINS = ["io.molis.work.coding", "io.molis.work.diff", "io.molis.work.shelf", "io.molis.work.text-stats"];

const personCaller = (projectId: string): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
  permissions: ["goals:read", "goals:write", "artifact:read", "files:read", "git:read"] });

test("an action client asked not to prepare the project calls Goals without starting any Runtime plugin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "goals-unprepared-client-"));
  const host = createMolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: "unprepared" });
  const caller = personCaller("unprepared");
  const providers = async (client: ReturnType<typeof host.actionClient>) => new Set((await client.discover(caller)).map(view => view.provider.provider_id));
  try {
    const bare = host.actionClient(reference, false);
    const listed = await providers(bare);
    assert.ok(listed.has(GOALS_PLUGIN_ID), "Goals is registered when the project opens, so it needs no preparation");
    assert.deepEqual(RUNTIME_PLUGINS.filter(plugin => listed.has(plugin)), [], "no Runtime plugin was started by listing the actions");
    await managementGoals(bare, "unprepared").invoke(goalsActions.initialize, { idempotency_key: "init" });
    assert.deepEqual((await bindActionClient(bare, () => caller).invoke(goalsActions.snapshot, {})).goals, [], "the calls reached Goals");
    const after = await providers(bare);
    assert.deepEqual(RUNTIME_PLUGINS.filter(plugin => after.has(plugin)), [], "and still started no Runtime plugin");

    const prepared = await providers(host.actionClient(reference));
    assert.deepEqual(RUNTIME_PLUGINS.filter(plugin => !prepared.has(plugin)), [], "the default client still starts the project's Runtime plugins before a call");
  } finally { await host.close(); await rm(directory, { recursive: true, force: true }); }
});

test("the first-run Goal is made by the Goals action, as the person, and leaves one call-log row", async () => {
  const home = await mkdtemp(join(tmpdir(), "onboarding-goals-action-"));
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: CONTROL_TOKEN });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const settled = watchSettlements(host);
    const response = await fetch(`${origin}/api/onboarding/initialize`, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": CONTROL_TOKEN, "x-molis-work-idempotency-key": "onboarding-goals-action-request" },
      body: JSON.stringify({ project_name: "首次项目", outcome: "让第一次使用的人建立可以继续澄清的目标", intent_frame: "diagnose_fix", workspace_path: null, runtime_kind: null, user_confirmed: true }) });
    assert.equal(response.status, 201, await response.clone().text());
    const created = await response.json() as { project: { project_id: string }; goal_id: string };
    const projectId = created.project.project_id;

    assert.deepEqual(host.callLog!.list(projectId).map(row => [row.capability_id, row.provider_id, row.actor_id, row.audience, row.ok]),
      [[goalsActions.create.capability_id, GOALS_PLUGIN_ID, LOCAL_PERSON_ACTOR_ID, "user", true]],
      "one row: the Goals action, not a typed capability beside it");
    assert.deepEqual(settled.filter(row => row.path === "typed"), [], "no typed capability was called for the Goal");
    assert.deepEqual(settled.filter(row => row.capability_id === goalsActions.create.capability_id).map(row => [row.operation, row.ok]), [["command", true]]);

    const reference = molisWorkHostProjectReference({ databasePath: (await withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId))).database_path, projectId });
    const goal = (await bindActionClient(host.actionClient(reference, false), () => personCaller(projectId)).invoke(goalsActions.snapshot, {})).goals.find(item => item.goal_id === created.goal_id);
    assert.equal(goal?.outcome, "让第一次使用的人建立可以继续澄清的目标");
    assert.equal(goal?.definition_state, "draft");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * A running plugin that carries Coding's Agent block, and its typed client: a plugin's roles come only from its running declaration
 * (PG-051 RAC-195), so a start is the plugin's own call.
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

test("a Run reads the project guidance through the Goals action, once, whether or not Goals is there", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "guidance-read-action-")));
  let removed = false;
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspaceFor: () => ({ workspace_id: "w", canonical_path: home, realpath_verified: true, display_name: "workspace" }),
    actionAvailability: (_caller, action) =>
      removed && action.capability_id.startsWith("goals.") ? { available: false, code: "actions.plugin_disabled", reason: "Goals 已从这个项目移除" } : { available: true } });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.db"), projectId: "guided" });
  const composition = ensureSystemAgentService(host, home);
  const coder = await codingCaller(host, reference, home);
  const captured: AgentStartRequest[] = [];
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
        directory: request.directory! } };
    },
  });
  const request: AgentStartRequest = { ...coder.owner, session: { runtime_id: "probe", session_id: "s" },
    task: "读取项目", role_id: "reader", directory: { canonical_path: home, realpath_verified: true } };
  const guidanceRows = (rows: readonly Settlement[]) => rows.filter(row => row.capability_id.includes("guidance"));
  try {
    const management = managementGoals(host.actionClient(reference), "guided");
    await management.invoke(goalsActions.initialize, { idempotency_key: "init" });
    await management.invoke(goalsActions.guidanceAdd, { kind: "constraint", content: "保留源文件。", reason: "项目边界", confirmation_summary: "用户确认", user_confirmed: true, idempotency_key: "add" });
    const settled = watchSettlements(host);

    await coder.client.invoke(agentHostCapabilities.startRun, ["probe", request]);
    assert.match(captured[0]!.role!.prompts.find(prompt => prompt.prompt_id === "project-guidance")!.body, /保留源文件/, "the project layer is delivered");
    assert.deepEqual(guidanceRows(settled), [{ capability_id: "goals.guidance.read", path: undefined, operation: "query", actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", ok: true, code: undefined }],
      "one settlement, the Goals action as the person; no typed guidance capability");

    settled.length = 0; removed = true;
    await coder.client.invoke(agentHostCapabilities.startRun, ["probe", request]);
    assert.equal(captured[1]!.role!.prompts.some(prompt => prompt.prompt_id === "project-guidance"), false, "without Goals the Run starts with no project layer");
    assert.deepEqual(guidanceRows(settled).map(row => [row.capability_id, row.path, row.ok, row.code]), [["goals.guidance.read", undefined, false, "actions.plugin_disabled"]],
      "the refusal is the Goals action's own, told once");
  } finally { coder.store.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
