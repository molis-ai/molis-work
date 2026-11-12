import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORK_EXECUTOR_ROLES, workExecutorRoleOf, type ActionCallContext, type ActionDefinition, type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectDirectoryActions, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { inspectActionCrossReferences, inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { codingManifest, codingRouteActions, DEFAULT_SESSION_TITLE } from "@molis-ai/molis-work-plugin-coding";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, ensureSystemAgentService, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// specs/archive/repository-anti-corruption PG-036 (C8-2): Coding takes on work from the Assistant as an executor of the work-executor
// protocol v1. Its six roles answer through the code its page runs, so a work handed over is a Coding session the page shows.

const roles = Object.fromEntries(codingManifest.actions!.flatMap(row => {
  const role = workExecutorRoleOf(row.action);
  return role ? [[role, row]] : [];
})) as Record<WorkExecutorRole, ActionDefinition>;
const find = (id: string) => codingRouteActions[id]!.definition;
const CODING = "io.molis.work.coding";
/** A Host whose project folders are the Home catalog's own, as the application's are; the catalog is read once the Host has it. */
function catalogHost(home: string) {
  const host: MolisWorkLocalHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: projectId => withCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withCatalog({ homeDirectory: home }, catalog => workspaceRefFor(catalog, projectId)),
    directoriesFor: projectId => withCatalog({ homeDirectory: home }, catalog => catalog.projectDirectories(projectId)) });
  const withCatalog = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  return { host, withCatalog };
}
/** Makes `path` the project's output, as the person does in the project's settings (`projects.directories.set_output@1`). */
async function setOutput(client: ReturnType<MolisWorkLocalHost["actionClient"]>, person: ActionCallContext, path: string): Promise<ProjectDirectories> {
  const { revision } = await client.invoke(person, projectDirectoryActions.get, {}) as ProjectDirectories;
  return await client.invoke(person, projectDirectoryActions.setOutput, { workspace_path: path, expected_revision: revision }) as ProjectDirectories;
}
type Session = { session_id: string; title: string; mode: string | null; runs: AgentRunView[]; runtime_session_id: string | null;
  recovery: { message: string } | null; workspace_id?: string | null; mcp_tools?: unknown[] };

test("W5-01-CODING-70 Coding publishes the protocol's six roles once each, for the person only, and the SDK's checks pass", () => {
  assert.deepEqual(Object.keys(roles).sort(), [...WORK_EXECUTOR_ROLES].sort());
  for (const role of WORK_EXECUTOR_ROLES) {
    assert.equal(roles[role].capability_id, `coding.executor.${role}`);
    assert.equal(roles[role].version, 1);
    assert.deepEqual(roles[role].action.audiences, ["user"], `${role}: no Agent or MCP client reaches a role`);
  }
  assert.deepEqual(inspectActionDeclarations(Object.values(roles), undefined), []);
  assert.deepEqual(inspectActionCrossReferences(codingManifest.actions!), []);
  assert.equal(roles["run.start"].action.scheduling, "concurrent", "a round may wait on its model for a digest first");
});

test("W5-01-CODING-71..76 the roles open, read and set a Coding session the page reads the same way", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "coding-executor-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "执行方", actor_id: "web-user" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
  catalog.close();
  await mkdir(join(home, "fixture"));
  const { host, withCatalog } = catalogHost(home);
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  // The project's one folder is its output, a folder of its own named `fixture`.
  const folders = await setOutput(client, { ...owner, permissions: ["projects:settings"] }, join(home, "fixture"));
  const workspace = folders.directories.find(row => row.roles.includes("output"))!;
  assert.equal(workspace.canonical_path, await realpath(join(home, "fixture")));
  const invoke = <Output>(role: WorkExecutorRole, input: unknown) => client.invoke(owner, roles[role], input) as Promise<Output>;
  const own = (session_id: string) => client.invoke(owner, find("coding.read-session"), { session_id }) as Promise<{ session: { title: string }; configuration: unknown }>;
  const sessions = async () => ((await client.invoke(owner, find("coding.state"), {})) as { sessions: unknown[] }).sessions.length;
  try {
    // W5-01-CODING-71: found by their types under one provider; a client that is not the person sees none of them.
    const directory = (await client.discover(owner)).filter(row => workExecutorRoleOf(row.action));
    assert.deepEqual(directory.map(row => workExecutorRoleOf(row.action)).sort(), [...WORK_EXECUTOR_ROLES].sort());
    assert.ok(directory.every(row => row.provider.plugin_id === CODING && row.availability.available));
    const mcp = { ...owner, actor_id: "runtime:client", audience: "mcp" as const };
    assert.deepEqual((await client.discover(mcp)).filter(row => workExecutorRoleOf(row.action)), []);
    await assert.rejects(client.invoke(mcp, roles.state, {}), (error: { code?: string }) => ["actions.owner_mismatch", "actions.forbidden"].includes(error.code ?? ""));

    // W5-01-CODING-72: a mode needs a model to run with; refused before the session exists, so nothing is left behind.
    const before = await sessions();
    await assert.rejects(invoke("session.open", { title: "先选模型", mode: "plan" }), (error: { code?: string }) => error.code === "coding.executor_unprepared");
    assert.equal(await sessions(), before);
    await seedConfiguredModels(home, undefined, undefined, withCatalog);

    // W5-01-CODING-73: the state names Coding's ways, the directory new rounds run in, and the project's directories.
    const state = await invoke<{ modes: { id: string }[]; default_mode: string; images: boolean; workspace_id: string | null; workspaces: unknown[]; mcp: unknown[] }>("state", {});
    assert.deepEqual(state.modes.map(mode => mode.id), ["discuss", "plan", "edit", "execute", "review"]);
    assert.equal(state.default_mode, "execute");
    assert.equal(state.images, false);
    assert.equal(state.workspace_id, workspace.workspace_id);
    assert.deepEqual(state.workspaces, [{ workspace_id: workspace.workspace_id, name: "fixture", path: workspace.canonical_path }]);
    assert.ok(Array.isArray(state.mcp));

    // W5-01-CODING-74: a session opened in a mode keeps the settings the page's own read shows; its next round runs with them.
    const planned = await invoke<{ session_id: string }>("session.open", { title: "", mode: "plan" });
    const page = await own(planned.session_id);
    assert.equal(page.session.title, DEFAULT_SESSION_TITLE);
    assert.deepEqual(page.configuration, { intent: "plan", provider_id: "p", model_id: "m", workspace_id: workspace.workspace_id });
    assert.deepEqual(await invoke<Session>("session.read", { session_id: planned.session_id }), { session_id: planned.session_id, title: DEFAULT_SESSION_TITLE,
      mode: "plan", runs: [], runtime_session_id: null, recovery: null, workspace_id: workspace.workspace_id, mcp_tools: [] });
    const plain = await invoke<{ session_id: string }>("session.open", { title: "修复登录" });
    assert.equal((await own(plain.session_id)).session.title, "修复登录");
    assert.equal((await own(plain.session_id)).configuration, null, "no mode, nothing chosen: the page asks as it always does");
    assert.equal((await invoke<Session>("session.read", { session_id: plain.session_id })).mode, null);

    // W5-01-CODING-75: changing the mode keeps the rest of the session's settings, or starts from Coding's defaults.
    assert.deepEqual(await invoke("session.update", { session_id: planned.session_id, mode: "edit" }), { session_id: planned.session_id, mode: "edit" });
    assert.deepEqual((await own(planned.session_id)).configuration, { intent: "edit", provider_id: "p", model_id: "m", workspace_id: workspace.workspace_id });
    await invoke("session.update", { session_id: plain.session_id, mode: "review" });
    assert.deepEqual((await own(plain.session_id)).configuration, { intent: "review", provider_id: "p", model_id: "m", workspace_id: workspace.workspace_id });
    assert.equal((await invoke<Session>("session.read", { session_id: plain.session_id })).mode, "review");

    // W5-01-CODING-76: ways that need the page first, unknown sessions, and control before any round are refused.
    const count = await sessions();
    await assert.rejects(invoke("session.open", { title: "并行", mode: "parallel" }), (error: { code?: string }) => error.code === "coding.executor_mode_unknown");
    assert.equal(await sessions(), count);
    await assert.rejects(invoke("session.update", { session_id: plain.session_id, mode: "collaborate" }), (error: { code?: string }) => error.code === "coding.executor_mode_unknown");
    assert.equal((await invoke<Session>("session.read", { session_id: plain.session_id })).mode, "review");
    await assert.rejects(invoke("session.read", { session_id: "missing" }), (error: { code?: string }) => error.code === "coding.session_unknown");
    await assert.rejects(invoke("run.control", { session_id: plain.session_id, run_id: "run-1", kind: "stop" }), /这个会话尚未执行/);
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

// Covers only the executor's default directory part of CHO-37; telling the two directories apart on the page, "back to the work
// directory", and real reads and writes in A with B untouched come with the input/output directories (batches 05②, 06, 07).
// The rule since 05②: where a panel browses is the page's own state, in no contract (SSC-05); rounds that name no folder run in the
// project's output (SSC-17). So a folder the person can look at — an input — never becomes where the Assistant's rounds run.
test("CHO-37 SSC-05 SSC-17 batch 12 item 1: a folder the person can browse does not move where the Assistant's rounds run; they run in the output", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "coding-executor-dir-"));
  const browse = await mkdtemp(join(tmpdir(), "coding-executor-browse-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "执行目录", actor_id: "web-user" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
  catalog.close();
  await mkdir(join(home, "output"));
  const { host, withCatalog } = catalogHost(home);
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private", "projects:settings"] };
  const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  const invoke = <Output>(role: WorkExecutorRole, input: unknown) => client.invoke(owner, roles[role], input) as Promise<Output>;
  try {
    await seedConfiguredModels(home, undefined, undefined, withCatalog);
    const output = (await setOutput(client, owner, join(home, "output"))).directories.find(row => row.roles.includes("output"))!;
    const { revision } = await client.invoke(owner, projectDirectoryActions.get, {}) as ProjectDirectories;
    const folders = await client.invoke(owner, projectDirectoryActions.addInput, { workspace_path: browse, expected_revision: revision }) as ProjectDirectories;
    const input = folders.directories.find(row => row.workspace_id !== output.workspace_id)!;
    assert.deepEqual(input.roles, ["input"], "the other folder is one the person can look at, not the output");
    // SSC-05: no project setting says where a panel browses, so looking at the other folder cannot reach where rounds run.
    assert.deepEqual((await client.discover(owner)).filter(row => /browsing|workspaces\.list|settings\.workspaces/.test(row.capability_id)).map(row => row.capability_id), [],
      "the old browsing and folder-list settings are gone");
    const state = await invoke<{ workspace_id: string | null; workspaces: Array<{ workspace_id: string }> }>("state", {});
    assert.equal(state.workspace_id, output.workspace_id, "the Assistant is told rounds run in the output");
    assert.deepEqual(state.workspaces.map(row => row.workspace_id).sort(), [output.workspace_id, input.workspace_id].sort(), "both folders are the project's, listed");
    const opened = await invoke<{ session_id: string }>("session.open", { title: "", mode: "execute" });
    const own = await client.invoke(owner, find("coding.read-session"), { session_id: opened.session_id }) as { configuration: { workspace_id: string } | null };
    assert.equal(own.configuration?.workspace_id, output.workspace_id, "the round the Assistant starts runs in the output, not the folder the person can browse");
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
    await rm(browse, { recursive: true, force: true });
  }
});

test("W5-01-CODING-77..81 a round the Assistant starts is the page's round: same settings, its supplement's receipt, its stop", { timeout: 90_000 }, async t => {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const f = await codingProductHost(t, async () => { await held; return cogniaModelResponse("好的。"); });
  t.after(() => release());
  const project = f.project.project_id;
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: project }));
  const invoke = <Output>(role: WorkExecutorRole, input: unknown) => client.invoke(owner, roles[role], input) as Promise<Output>;
  const page = (sessionId: string) => f.call<{ session: { runtime_session_id: string | null }; configuration: unknown; runs: Array<{ ref: { run_id: string } }> }>(project, `/api/plugins/${CODING}/sessions/${sessionId}`);

  // W5-01-CODING-77: with nothing chosen, the round runs with Coding's defaults, and keeps them for the page's next round.
  const { session_id } = await invoke<{ session_id: string }>("session.open", { title: "把登录改到新接口" });
  const { run_id } = await invoke<{ run_id: string }>("run.start", { session_id, task: "把登录改到新接口" });
  const deadline = Date.now() + 15_000;
  while (!f.requests.length) { assert.ok(Date.now() < deadline, "the round's first model request was sent"); await new Promise(resolve => setTimeout(resolve, 20)); }
  const shown = await page(session_id);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.deepEqual(shown.body.configuration, { intent: "execute", provider_id: "fixture", model_id: "fixture-model", workspace_id: f.workspaceId });
  assert.deepEqual(shown.body.runs.map(run => run.ref.run_id), [run_id], "the page shows the round the Assistant started");

  // W5-01-CODING-78: a supplement answers with its receipt and nothing else of the page's answer; a stop is taken.
  const steered = await invoke<{ accepted: boolean; receipt?: Record<string, unknown> }>("run.control", { session_id, run_id, kind: "steer", text: "不要动数据库" });
  assert.equal(steered.accepted, true);
  assert.deepEqual(Object.keys(steered.receipt ?? {}).sort(), ["delivered", "input_id", "replayed"]);
  assert.deepEqual(await invoke("run.control", { session_id, run_id, kind: "stop" }), { accepted: true });
  release();

  // W5-01-CODING-79: the session the Assistant reads is the one the page reads: its runtime session, the round and its end.
  let read = await invoke<Session>("session.read", { session_id });
  for (const end = Date.now() + 15_000; read.runs[0]?.phase !== "stopped"; read = await invoke<Session>("session.read", { session_id })) {
    assert.ok(Date.now() < end, `the stopped round ends: ${read.runs[0]?.phase}`); await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(read.mode, "execute");
  assert.equal(read.runtime_session_id, shown.body.session.runtime_session_id);
  assert.deepEqual(read.runs.map(run => run.ref.run_id), [run_id]);
  assert.equal(read.recovery, null);

  // W5-01-CODING-80: the round carries the session's own choices as the page's start sends them: its Skills, and writer assignments
  // only for parallel writers, so a session set up for them on the page and switched to another way still starts.
  const chose = await invoke<{ session_id: string }>("session.open", { title: "按技能修改" });
  const { skills } = await client.invoke(owner, find("coding.state"), {}) as { skills: Array<{ ref: { skill_id: string } }> };
  await client.invoke(owner, find("coding.update-session"), { session_id: chose.session_id, skills: [skills.find(skill => skill.ref.skill_id === "coding-review-change")!.ref],
    configuration: { intent: "parallel", provider_id: "fixture", model_id: "fixture-model", workspace_id: f.workspaceId, writer_assignments: [{ worktree_id: "writer-1", task: "改登录" }] } });
  await invoke("session.update", { session_id: chose.session_id, mode: "edit" });
  const second = await invoke<{ run_id: string }>("run.start", { session_id: chose.session_id, task: "按技能修改登录" });
  let edited = await invoke<Session>("session.read", { session_id: chose.session_id });
  for (const end = Date.now() + 15_000; !["completed", "failed", "cancelled", "stopped"].includes(edited.runs[0]?.phase ?? ""); edited = await invoke<Session>("session.read", { session_id: chose.session_id })) {
    assert.ok(Date.now() < end, `the round ends: ${edited.runs[0]?.phase}`); await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.deepEqual(edited.runs.map(run => run.ref.run_id), [second.run_id]);
  assert.deepEqual(edited.runs[0]!.frozen.skills.map(skill => [skill.ref.skill_id, skill.ref.version]), [["coding-review-change", 2]]);

  // W5-01-CODING-81: a start that is refused leaves the session as it was: nothing chosen, so the page still asks.
  const unread = await invoke<{ session_id: string }>("session.open", { title: "材料读不到" });
  await client.invoke(owner, find("coding.update-session"), { session_id: unread.session_id, materials: [{ kind: "note", id: "missing", title: "不存在的材料" }] });
  await assert.rejects(invoke("run.start", { session_id: unread.session_id, task: "按材料修改" }), /不存在的材料/);
  const asked = await page(unread.session_id);
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(asked.body.configuration, null);

  // Stopping is a durable SDK settlement, not only a transient page projection.
  const system = ensureSystemAgentService(f.host, f.home), adapter = system.agentHost.adapter("prologue");
  assert.deepEqual(adapter.diagnostics?.().ledger_failures, []);
  assert.ok(read.runtime_session_id);
  const stoppedRef = { session_id: read.runtime_session_id, run_id };
  const supplementRef = { session_id: read.runtime_session_id, input_id: String(steered.receipt!.input_id) };
  assert.equal((await adapter.inputs?.read?.(supplementRef))?.state, "queued", "the unread supplement returns to its owning queue");
  await f.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const restoredSystem = ensureSystemAgentService(reopened, f.home, withMolisWorkProjectCatalog); await restoredSystem.ready;
    const restored = restoredSystem.agentHost.adapter("prologue");
    assert.equal((await restored.read(stoppedRef)).phase, "stopped");
    assert.equal((await restored.inputs?.read?.(supplementRef))?.state, "queued");
    assert.deepEqual(restored.diagnostics?.().ledger_failures, []);
  } finally { await reopened.close(); }
});
