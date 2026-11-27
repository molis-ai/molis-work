import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMolisWorkLocalHost, ensureSystemAgentService, LocalProjectDatabase, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { projectGuidanceActions } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentSessionOwner, type AgentStartInput, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { managementGoals } from "./goal-management-caller.js";
import { ensureProjectRoot } from "./fixtures/goals-board.js";
import { watchSettlements, type Settlement } from "./fixtures/settlements.js";
import { callerPlugin, issuedCaller, registerProbe, startPlugin, withReaderRole } from "./fixtures/plugin-callers.js";

// N-12: Host-internal callers of Goals (the first-run Goal) call the Goals actions, through the client that starts the project's
// Runtime plugins (Goals is one of them). The project guidance a Run starts with is the platform's since batch 44 (contract-design §9).

// Shelf is a platform part (44B): its one Home instance is there from the Host's start, in every project, so it is not among these.
const RUNTIME_PLUGINS = ["io.molis.work.coding", "io.molis.work.diff"];

const personCaller = (projectId: string): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
  permissions: ["goals:read", "goals:write", "artifact:read", "files:read", "git:read"] });

test("Goals is a Runtime plugin of the project: the default client starts it before a call, an unprepared one reaches none of its actions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "goals-unprepared-client-"));
  const host = createMolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: "unprepared" });
  const caller = personCaller("unprepared");
  await ensureProjectRoot(host, reference);
  // The project's plugins: Goals' Home half (the person's methods) is the Home's and is there from the Host's start.
  const providers = async (client: ReturnType<typeof host.actionClient>) => new Set((await client.discover(caller)).filter(view => view.action.scope === "project").map(view => view.provider.provider_id));
  try {
    const bare = host.actionClient(reference, false);
    const listed = await providers(bare);
    assert.equal(listed.has(GOALS_PLUGIN_ID), false, "Goals is a plugin like the others: nothing of it is there before the project's plugins start");
    assert.deepEqual(RUNTIME_PLUGINS.filter(plugin => listed.has(plugin)), [], "no Runtime plugin was started by listing the actions");
    await assert.rejects(bindActionClient(bare, () => caller).invoke(goalsActions.snapshot, {}), { code: "actions.missing" });

    const prepared = host.actionClient(reference), after = await providers(prepared);
    assert.ok(after.has(GOALS_PLUGIN_ID), "the default client starts the project's plugins, Goals among them");
    assert.deepEqual(RUNTIME_PLUGINS.filter(plugin => !after.has(plugin)), [], "and the others with it");
    await managementGoals(prepared, "unprepared").invoke(goalsActions.initialize, { idempotency_key: "init" });
    assert.deepEqual((await bindActionClient(prepared, () => caller).invoke(goalsActions.snapshot, {})).goals, [], "the calls reached Goals");
  } finally { await host.close(); await rm(directory, { recursive: true, force: true }); }
});

test("PEQ-01: a Run reads the project guidance through the platform's action, once, and keeps it without Goals", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "guidance-read-action-")));
  let removed = false;
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspaceFor: () => ({ workspace_id: "w", canonical_path: home, realpath_verified: true, display_name: "workspace" }),
    actionAvailability: (_caller, action) =>
      removed && action.capability_id.startsWith("goals.") ? { available: false, code: "actions.plugin_disabled", reason: "Goals 已从这个项目移除" } : { available: true } });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.db"), projectId: "guided" });
  await ensureProjectRoot(host, reference);
  const composition = ensureSystemAgentService(host, home);
  const captured: AgentStartRequest[] = [];
  // A round is started by a plugin the Host started (R8 batch 3), in that plugin's own session.
  const store = new LocalProjectDatabase(join(home, "plugins.db")), starter = withReaderRole(callerPlugin("guided-starter", "project", {}, [agentHostCapabilities.startRun.capability_id]));
  let owner: AgentSessionOwner | undefined;
  composition.agentHost.register({
    descriptor: { runtime_id: "probe", display_name: "Probe", provider_version: "1", capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession() { throw new Error("Not used by this read fixture"); },
    async read() { throw new Error("Not used by this read fixture"); },
    observe() { throw new Error("Not used by this read fixture"); },
    async control() { throw new Error("Not used by this read fixture"); },
    async readCommandOutput() { throw new Error("Not used by this read fixture"); },
    async readSession(session) { return { session, owner: owner!, title: "Read", runs: [], latest_run: null }; },
    async start(request) {
      captured.push(request); const role = request.role!;
      return { ref: { run_id: `r${captured.length}`, session_id: "s" }, frozen: { role_id: role.role_id, role_version: role.version, execution: role.execution,
        model_id: "probe", prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt) })),
        host_tools: [...role.host_tools], skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null,
        directory: request.directory!, ...(role.reply_locale ? { reply_locale: role.reply_locale } : {}) } };
    },
  });
  const request: AgentStartInput = { session: { runtime_id: "probe", session_id: "s" }, task: "读取项目", role_id: "reader", directory: { canonical_path: home, realpath_verified: true } };
  const guidanceRows = (rows: readonly Settlement[]) => rows.filter(row => row.capability_id.includes("guidance"));
  try {
    const management = managementGoals(host.actionClient(reference), "guided");
    await management.invoke(goalsActions.initialize, { idempotency_key: "init" });
    await management.invoke(projectGuidanceActions.add, { kind: "constraint", content: "保留源文件。", reason: "项目边界", confirmation_summary: "用户确认", user_confirmed: true, idempotency_key: "add" });
    const probe = registerProbe(host.actionRegistry(reference), "project");
    await startPlugin(host, reference, store, starter, { home });
    const issued = await issuedCaller(probe, starter, "guided"), rounds = starter.actions("guided");
    owner = { project_id: "guided", plugin_id: issued.plugin_id, install_id: issued.install_id, actor_id: issued.actor_id };
    const settled = watchSettlements(host);

    await rounds.invoke(agentHostCapabilities.startRun, ["probe", request]);
    assert.match(captured[0]!.role!.prompts.find(prompt => prompt.prompt_id === "project-guidance")!.body, /保留源文件/, "the project layer is delivered");
    assert.deepEqual(guidanceRows(settled), [{ capability_id: "projects.guidance.read", operation: "query", actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", ok: true, code: undefined }],
      "one settlement, the platform's action as the person; no typed guidance capability");

    settled.length = 0; removed = true;
    await rounds.invoke(agentHostCapabilities.startRun, ["probe", request]);
    assert.match(captured[1]!.role!.prompts.find(prompt => prompt.prompt_id === "project-guidance")!.body, /保留源文件/, "without Goals the Run keeps the project layer");
    assert.deepEqual(guidanceRows(settled).map(row => [row.capability_id, row.ok]), [["projects.guidance.read", true]], "read once, from the platform");
  } finally { await host.close(); store.close(); await rm(home, { recursive: true, force: true }); }
});
