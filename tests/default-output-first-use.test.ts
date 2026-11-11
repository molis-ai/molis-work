import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, MolisWorkLocalHost, characterNativeExecution, composeAgentHost, molisWorkHostProjectReference, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { ARTIFACTS_PROVIDER_ID, artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability, workspaceReadActions, writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { CharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentRuntimeAdapter, type AgentSessionOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { callerPlugin, startPlugin, withReaderRole } from "./fixtures/plugin-callers.js";

// SSC-24 (specs/shared-sources-and-surfaces §3 「碰磁盘的调用方」): a new project's default output directory is not made with the project.
// It is made the first time something starts there to write or run — an Agent session or round, a native Character — once every check
// passed; a refused start makes nothing. A read makes nothing either: Git answers that there is no repository and makes no worktree,
// and a file opened by its reference is not found. Every port here is the catalog's own, as the web server wires them.

const INPUT_ONLY = { code: "projects.directory_input_only" };

/** A new project in a temporary Home, with an input folder beside its default output directory, which is not made yet. */
async function newProject(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "default-output-first-use-")));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: join(root, "home") });
  t.after(async () => { catalog.close(); await rm(root, { recursive: true, force: true }); });
  const project = await catalog.createProject({ display_name: "新项目", actor_id: "user" });
  const projectId = project.project_id, inputPath = join(root, "input");
  await mkdir(inputPath);
  catalog.changeDirectories({ project_id: projectId, actor_id: "user", change: { kind: "add_input", workspace_path: inputPath },
    expected_revision: catalog.projectDirectories(projectId).revision });
  const output = workspaceRefFor(catalog, projectId)!;
  const input = catalog.listWorkspaceDirectory(projectId).find(item => item.canonical_path === inputPath)!;
  const prepared: string[] = [];
  const ports = {
    workspaceFor: () => workspaceRefFor(catalog, projectId),
    workspacesFor: async () => catalog.listWorkspaceDirectory(projectId),
    directoriesFor: () => catalog.projectDirectories(projectId),
    prepareDirectory: (id: string, workspaceId: string, mode: "read" | "write") => {
      prepared.push(`${mode} ${workspaceId}`);
      return catalog.prepareWorkspaceDirectory(id, workspaceId, mode);
    },
  };
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId });
  assert.equal(existsSync(output.canonical_path), false, "the project's default output directory is not made with it");
  return { root, home: join(root, "home"), catalog, projectId, output, input, prepared, ports, reference, made: () => existsSync(output.canonical_path) };
}

/** The Agent service over that project and a Runtime that records what reaches it, with a plugin that opens sessions and starts rounds. */
async function openAgentHost(t: TestContext) {
  const f = await newProject(t);
  const host = new MolisWorkLocalHost({ completeText: null, ...f.ports });
  const composition = composeAgentHost({ localHost: host, ...f.ports });
  const store = new LocalProjectDatabase(join(f.root, "plugins.sqlite"));
  t.after(async () => { await composition.dispose(); await host.close(); store.close(); });
  const sessions: Array<{ there: boolean }> = [], starts: Array<{ there: boolean }> = [];
  let owner: AgentSessionOwner | undefined;
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  const runtime: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: { ...emptyCapabilityMatrix(), "session.create": "supported", "run.start": "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession(input) { sessions.push({ there: existsSync(input.directory!.canonical_path) }); return { runtime_id: "fixture", session_id: `session-${sessions.length}` }; },
    async readSession(session) { return { session, owner: owner!, title: "Fixture", runs: [], latest_run: null }; },
    async start(request) { starts.push({ there: existsSync(request.directory!.canonical_path) }); throw new Error("the fixture records the round and runs nothing"); },
    read: unused, control: unused, readCommandOutput: unused, observe() { throw new Error("Not used by this fixture"); },
  };
  composition.agentHost.register(runtime);
  const plugin = withReaderRole(callerPlugin("first-use-agent", "project", {}, [agentHostCapabilities.createSession.capability_id, agentHostCapabilities.startRun.capability_id]));
  await startPlugin(host, f.reference, store, plugin);
  const context = plugin.context(f.projectId);
  owner = { project_id: f.projectId, plugin_id: plugin.id, install_id: context.install_id, actor_id: context.actor_id! };
  const at = (folder: { canonical_path: string }) => ({ canonical_path: folder.canonical_path, realpath_verified: true as const });
  return { ...f, actions: plugin.actions(f.projectId), sessions, starts, at };
}

test("SSC-24 an Agent session in a new project's default output directory makes it after its checks, before the Runtime is asked; a refused one makes nothing", { timeout: 60_000 }, async t => {
  const h = await openAgentHost(t);
  await assert.rejects(h.actions.invoke(agentHostCapabilities.createSession, ["fixture", { title: "在输入目录里", directory: h.at(h.input) }]), INPUT_ONLY);
  assert.deepEqual([h.prepared, h.made(), h.sessions], [[], false, []], "a refused session makes nothing and asks nothing");
  await h.actions.invoke(agentHostCapabilities.createSession, ["fixture", { title: "第一次", directory: h.at(h.output) }]);
  assert.deepEqual(h.prepared, [`write ${h.output.workspace_id}`]);
  assert.deepEqual(h.sessions, [{ there: true }], "the folder was there when the Runtime was asked");
});

test("SSC-24 an Agent round in the default output directory makes it if it is not there, after every check, before the Runtime is asked", { timeout: 60_000 }, async t => {
  const h = await openAgentHost(t);
  const session = await h.actions.invoke(agentHostCapabilities.createSession, ["fixture", { title: "第一次", directory: h.at(h.output) }]);
  await rm(h.output.canonical_path, { recursive: true });
  h.prepared.length = 0;
  await assert.rejects(h.actions.invoke(agentHostCapabilities.startRun, ["fixture", { session, task: "改代码", role_id: "reader", directory: h.at(h.input) }]), INPUT_ONLY);
  assert.deepEqual([h.prepared, h.made(), h.starts], [[], false, []], "a refused round makes nothing and asks nothing");
  await assert.rejects(h.actions.invoke(agentHostCapabilities.startRun, ["fixture", { session, task: "改代码", role_id: "reader", directory: h.at(h.output) }]), /runs nothing/u);
  assert.deepEqual(h.prepared, [`write ${h.output.workspace_id}`]);
  assert.deepEqual(h.starts, [{ there: true }], "the folder was there when the Runtime was asked");
});

test("SSC-24 Git in a default output directory not made yet: staging and committing answer that it is not a repository, its reviews read as none, it has no worktree, and nothing makes it", { timeout: 60_000 }, async t => {
  const f = await newProject(t);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("this test sends nothing"); });
  const host = new MolisWorkLocalHost({ completeText: null, ...f.ports });
  const composition = composeAgentHost({ localHost: host, homeDirectory: f.root, ...f.ports,
    prologue: { storageRoot: join(f.root, "runtime"), resolveCredential: () => "fixture-only",
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }) } });
  const store = new LocalProjectDatabase(join(f.root, "plugins.sqlite"));
  t.after(async () => { await composition.dispose(); await host.close(); store.close(); });
  const grants = ["review:git-index", "review:git-operation", "review:git-worktree", "workspace:read"];
  const plugin = callerPlugin("first-use-git", "project", Object.fromEntries(grants.map(grant => [grant, false])),
    [workspaceReadActions.git.capability_id, prepareGitIndexCapability.capability_id, prepareGitOperationCapability.capability_id, readGitOperationsCapability.capability_id, readGitResultsCapability.capability_id, writerDirectoryCapabilities.list.capability_id, writerDirectoryCapabilities.prepare.capability_id]);
  await startPlugin(host, f.reference, store, plugin, { grants, dependencies: host.client(f.reference) });
  const actions = plugin.actions(f.projectId), output = f.output.workspace_id;
  const NOT_A_REPOSITORY = { code: "workspace_git.not_a_repository", message: /不是 Git 仓库/u };
  const raw = { outcome: "not-a-repository", message: "这个文件夹还没有建立，不是 Git 仓库" };
  assert.deepEqual(await actions.invoke(workspaceReadActions.git, { workspace_id: output, kind: "status" }), { ...raw, reason: "directory_not_created" });
  assert.deepEqual(await actions.invoke(workspaceReadActions.git, { workspace_id: output, kind: "summary" }), raw);
  await assert.rejects(actions.invoke(prepareGitIndexCapability, { workspace_id: output, path: ["README.md"], action: "stage", revision: "fixture", operation_id: "stage-before-made" }), NOT_A_REPOSITORY);
  await assert.rejects(actions.invoke(prepareGitOperationCapability, { workspace_id: output, operation_id: "commit-before-made", revision: "fixture",
    operation: { action: "commit", message: "第一次提交" } }), NOT_A_REPOSITORY);
  // The two reads list review records only: a folder not made yet has none, rather than reading as one whose permission was taken back.
  assert.deepEqual(await actions.invoke(readGitOperationsCapability, { workspace_id: output }), [], "no operation was asked for in a folder not made yet");
  assert.deepEqual(await actions.invoke(readGitResultsCapability, { workspace_id: output }), [], "no staging was asked for in a folder not made yet");
  assert.deepEqual(await actions.invoke(writerDirectoryCapabilities.list, { workspace_id: output }), [], "a folder not made yet has no worktree");
  await assert.rejects(actions.invoke(writerDirectoryCapabilities.prepare, { workspace_id: output, operation_id: "writer-before-made" }),
    { code: "workspace_git.writer.workspace_unavailable", message: /还没有建立/u });
  assert.deepEqual(composition.agentHost.reviews.list(f.projectId), [], "no review was prepared");
  assert.equal(f.made(), false, "nothing made the folder");
  assert.deepEqual([...new Set(f.prepared)], [`read ${output}`], "each call only read whether it is there");
  // An input folder is still only an input: refused as one, not as a folder not made.
  await assert.rejects(actions.invoke(prepareGitOperationCapability, { workspace_id: f.input.workspace_id, operation_id: "commit-in-input", revision: "fixture",
    operation: { action: "commit", message: "不该提交" } }), INPUT_ONLY);
});

test("SSC-24 a native Character starts in a new project's default output directory, which is made for it once the folder is checked", async t => {
  const f = await newProject(t);
  const spawned: Array<{ cwd?: string }> = [];
  const ports = characterNativeExecution({ home: f.home, actorId: "user", projectId: f.projectId, workspaces: () => f.ports.workspacesFor(), output: async () => f.ports.workspaceFor(),
    prepare: async workspaceId => { f.ports.prepareDirectory(f.projectId, workspaceId, "write"); },
    spawn: request => { spawned.push(request); return { attached: false, started: true, replay: "" }; }, executable: () => "/known/codex" });
  const content: CharacterContent = { character_id: "c", title: "Fixer", instructions: "", host_tools: null, source: { owner_actor_id: "user", draft_revision: 1 },
    import_snapshot: { runtime_id: "codex", config_root: "/config", captured_at: "2026-11-08T00:00:00Z", rules: [], skills: [] } };
  const reference = { artifact_id: `character:${f.projectId}:c`, version: 1 };
  await assert.rejects(ports.launch(content, reference, { task: "改一下", workspace_id: f.input.workspace_id, request_id: "c1a2b3d4-4333-4222-b555-987654321012" }), INPUT_ONLY);
  assert.deepEqual([f.prepared, f.made(), spawned], [[], false, []], "a refused launch makes nothing");
  const started = await ports.launch(content, reference, { task: "改一下", workspace_id: f.output.workspace_id, request_id: "d1a2b3d4-4333-4222-b555-987654321012" });
  assert.equal(started.run.status, "dispatched");
  assert.deepEqual(f.prepared, [`write ${f.output.workspace_id}`]);
  assert.deepEqual(spawned.map(request => request.cwd), [await realpath(f.output.canonical_path)]);
});

test("SSC-24 a file opened by its project reference before the default output directory is made is not found, and nothing makes it", { timeout: 60_000 }, async t => {
  const f = await newProject(t);
  const host = new MolisWorkLocalHost({ completeText: null, ...f.ports });
  t.after(() => host.close());
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.projectId, audience: "user" as const, permissions: ["artifacts:read", "workspace:read"] };
  await assert.rejects(host.actionClient(f.reference).invoke(person, { ...artifactsActions.projectReference, provider_id: ARTIFACTS_PROVIDER_ID }, { reference: "project://notes.md" }),
    { code: "host.project_reference_not_found" });
  assert.deepEqual([f.prepared, f.made()], [[`read ${f.output.workspace_id}`], false]);
});
