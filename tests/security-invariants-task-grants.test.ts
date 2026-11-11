// SECURITY-INVARIANTS S-task-grant-subjects (with S-08 and S-17): a background task of a plugin reads only what the person allowed that one task. Its
// grant subject `agent:task:<project>:<installation>:<key>` is composed by the Host from the call (the plugin gives only the key), holds
// nothing by default, reads only, and is checked again at every call (specs/proactive-assistant/schedule-task-reads.md §3–§4).
// Every refusal asserts the refusal itself and that nothing was written or run.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { MolisWorkLocalHost, pluginInstallActions, projectDeletedHooksFor, readMcpToolPreference, taskGrantActionProvider } from "@molis-ai/molis-work-app-local-host";
import {
  LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionView, type ExactActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginAgentRunInput, PluginDefinition, PluginReadGroupDeclaration, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { agentHostCapabilities, type AgentActionClient, type AgentRunView, type AgentRuntimeAdapter, type AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  agentTaskGrantActions, type TaskGrantSetCategory, type TaskGrantListResult, type TaskGrantSubject,
} from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { SCHEDULE_PLUGIN_ID, scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { isLocalHostHttpError, readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { homePackage, mac, person as installer, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";
import { openTestHome, serveTestHost, type TestHostServer, type TestProject } from "./fixtures/test-home.js";

const READER = "io.molis.work.example.taskreader";
/** The plugin Agent service runs its rounds on the Prologue Runtime; this fixture's Runtime answers under its id. */
const RUNTIME = "prologue";
const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const query = (capability_id: string, scope: "project" | "home" = "project"): ActionDefinition => ({ capability_id, version: 1, operation: "query", action: {
  title: capability_id, description: "What a task reads", kind: "query", scope, audiences: ["agent", "user"], permissions: [], subject_kinds: [],
  input_schema: empty, output_schema: { type: "object" } } });
const notes = query("taskreader.notes.list"), loose = query("taskreader.loose.list");
const brief: ActionDefinition = { capability_id: "taskreader.brief", version: 1, operation: "command", action: { title: "Brief", description: "Runs one of its roles",
  kind: "operation", scope: "project", audiences: ["user"], permissions: ["agent:run"], subject_kinds: [], scheduling: "concurrent",
  input_schema: { type: "object" }, output_schema: { type: "object" } } };
const role = (role_id: string, fields: object) => ({ role_id, version: 1, prompts: ["brief"], host_tools: [], ...fields });

/** The plugin whose tasks these are: `notes` is its one read group, `loose` a read in no group; `brief` runs one of its roles. */
function taskReader() {
  const contexts: PluginStartContext[] = [];
  const handled: Array<{ capability_id: string; actor_id: string; audit_actor_id: string | undefined }> = [];
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: READER, version: "1.0.0", name: "Task reader", kind: "app",
    publisher: { publisher_id: "example", signature: "taskreader" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    // `projects:settings` is held so that a plugin's set is refused for its audience, not for a permission it lacks.
    permissions: [{ permission: "agent:run", required: true, reason: "Run its background tasks" },
      { permission: "projects:settings", required: true, reason: "Reach the person's settings action, to be refused it" }],
    capabilities: { provides: [], consumes: [agentTaskGrantActions.set.capability_id, agentTaskGrantActions.clear.capability_id, agentTaskGrantActions.list.capability_id, agentHostCapabilities.listActions.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [notes, loose, brief],
    read_groups: [{ group_id: "notes", title: "笔记", description: "这个插件的笔记", actions: [notes.capability_id] }],
    agent: { roles: [role("brief", { workspace: "business", execution: "read-only" }), role("operator", { workspace: "business", execution: "operate" }),
      role("reviewer", { execution: "read-only" })], prompts: [{ prompt_id: "brief", version: 1 }] } },
    agent_prompts: [{ prompt_id: "brief", version: 1, body: "Read what the task allows.", layer: "role" }],
    async start(context) {
      contexts.push(context);
      const reads = [notes, loose].map(action => ({ ...action, handle(caller: { actor_id: string; audit_actor_id?: string }) {
        handled.push({ capability_id: action.capability_id, actor_id: caller.actor_id, audit_actor_id: caller.audit_actor_id }); return { notes: [] };
      } }));
      return { kind: "app", actions: [...reads, { ...brief, async handle(_caller, input) {
        const agents = context.services?.agents;
        assert.ok(agents, "the plugin declares agent:run");
        return agents.run(input as PluginAgentRunInput);
      } }] };
    } };
  return { definition, contexts, handled };
}

const SHELF = "io.molis.work.example.taskshelf", CHANGES = "io.molis.work.example.taskchanges";
/** The shelf declares no read groups, so it is one whole category: its read, beside a command and a query that writes. */
const shelfRead = query("taskshelf.list"), shelfAdded = query("taskshelf.count");
const shelfChange: ActionDefinition = { capability_id: "taskshelf.change", version: 1, operation: "command", action: { title: "Change", description: "Changes",
  kind: "operation", scope: "project", audiences: ["agent", "user"], permissions: [], subject_kinds: [], input_schema: empty } };
const shelfTouch: ActionDefinition = { ...query("taskshelf.touch"), action: { ...query("taskshelf.touch").action, effect: "write" } };
/** A plugin whose only action is a command: it reads nothing. */
const changesChange: ActionDefinition = { ...shelfChange, capability_id: "taskchanges.change" };

/** A plugin with a Manifest and no read groups, offering these actions as declared; each answers `{}`. */
function plainPlugin(plugin_id: string, name: string, actions: readonly ActionDefinition[]): PluginDefinition {
  return { manifest: { schema_version: 1, host_api_version: 1, plugin_id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: name.toLowerCase() }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [...actions] },
    async start() { return { kind: "app", actions: actions.map(action => ({ ...action, handle: () => ({}) })) }; } };
}

type During = (gateway: AgentActionClient | undefined) => Promise<void>;

/**
 * A Host assembled as the product assembles it, served over its web server, with the task reader in every project and a Runtime of our
 * own: it starts each round by running `during` with the action gateway the Host gave it (the calls a model would make), then ends it.
 */
async function world(t: TestContext) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "task-grants-")));
  const reader = taskReader();
  /** Holds the next catalog read of one subject for `notes`, so a test can revoke while that call is in flight. */
  const hold: { subject?: string; entered?: PromiseWithResolvers<void>; release?: PromiseWithResolvers<void> } = {};
  /** Actions whose provider is switched off: in the catalog, not callable. */
  const off = new Set<string>();
  const plugins = [reader.definition, plainPlugin(SHELF, "Shelf", [shelfRead, shelfChange, shelfTouch]), plainPlugin(CHANGES, "Changes", [changesChange])];
  const localHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: plugins },
    actionAvailability: async (caller, action) => {
      if (hold.subject && caller.actor_id === hold.subject && action.capability_id === notes.capability_id && hold.entered && hold.release) {
        const { entered, release } = hold; hold.subject = undefined; entered.resolve(); await release.promise;
      }
      return off.has(action.capability_id) ? { available: false, code: "fixture.off", reason: "提供方已停用" } : { available: true };
    } });
  let served: TestHostServer | undefined;
  t.after(async () => {
    hold.release?.resolve();
    try { await served?.close(); }
    finally {
      try { await localHost.close(); }
      finally { await rm(home, { recursive: true, force: true }); }
    }
  });
  // The Host bound its Home's one Agent service when it was built; this borrows it.
  const composition = localHost.ensureAgentService(home, () => { throw new Error("The Host binds its Home's Agent service when it is built"); });
  served = await serveTestHost(null, { home, host: localHost });
  const rounds: Array<{ gateway: AgentActionClient | undefined; tools: boolean }> = [];
  const sessions = new Map<string, AgentSessionView>();
  let during: During | undefined;
  // The Home's one Agent service registers the Prologue Runtime when it is first needed; its rounds here are this fixture's, so no model
  // is called: the Runtime keeps its descriptor and answers sessions and rounds as below.
  await composition.ready;
  const probe: Pick<AgentRuntimeAdapter, "withEffect" | "createSession" | "readSession" | "read" | "observe" | "control" | "start"> = {
    async withEffect(_effect, operation) { return operation(); },
    async createSession(input) {
      const session = { runtime_id: RUNTIME, session_id: `s${sessions.size + 1}` };
      sessions.set(session.session_id, { session, owner: { project_id: input.project_id, plugin_id: input.plugin_id, install_id: input.install_id, actor_id: input.actor_id },
        title: input.title, runs: [], latest_run: null, ...(input.workspace ? { workspace: input.workspace } : {}) });
      return session;
    },
    async readSession(session) {
      const found = sessions.get(session.session_id);
      if (!found) throw new Error("Not a session of this fixture");
      return found;
    },
    async read() { throw new Error("Not used by this fixture"); },
    observe(ref, listener) {
      queueMicrotask(() => listener({ ref, phase: "completed", turns: [{ kind: "assistant", text: "读完了" }] } as AgentRunView));
      return () => {};
    },
    async control() {},
    async start(given) {
      const frozenRole = given.role;
      assert.ok(frozenRole, "the Host froze the role");
      const gateway = frozenRole.action_gateway?.client;
      rounds.push({ gateway, tools: frozenRole.actions !== undefined });
      await during?.(gateway);
      const ref = { run_id: `r${rounds.length}`, session_id: given.session.session_id };
      return { ref, frozen: { role_id: frozenRole.role_id, role_version: frozenRole.version, execution: frozenRole.execution,
        ...(frozenRole.workspace ? { workspace: frozenRole.workspace } : {}), model_id: "probe",
        prompts: frozenRole.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt) })),
        host_tools: [...frozenRole.host_tools], skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null, action_tools: given.action_tools,
        ...(frozenRole.action_gateway ? { action_gateway: true as const } : {}), ...(frozenRole.reply_locale ? { reply_locale: frozenRole.reply_locale } : {}) } };
    },
  };
  Object.assign(composition.agentHost.adapter(RUNTIME), probe);

  const person = (project: TestProject, audience: ActionAudience = "user"): ActionCallContext => ({ actor_id: audience === "user" ? LOCAL_PERSON_ACTOR_ID : `${audience}:fixture`,
    audience, project_id: project.project_id, permissions: ["projects:settings", "agent:run"] });
  const call = <Output>(project: TestProject, caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    localHost.actionClient(project.reference).invoke(caller, { capability_id: action.capability_id, version: action.version }, input) as Promise<Output>;
  const list = (project: TestProject) => call<TaskGrantListResult>(project, person(project), agentTaskGrantActions.list, {});

  /** A project with the task reader started in it, as the person opening it starts it. */
  async function open(name: string) {
    const project = await served!.createProject(name);
    const views = await localHost.inspectActions(person(project), project.reference);
    const plugin = reader.contexts.at(-1), view = views.find(item => item.capability_id === notes.capability_id);
    assert.ok(plugin && view, "the task reader runs in the project");
    const install = plugin.install_id, providerId = view.provider.provider_id;
    const shelfView = views.find(item => item.capability_id === shelfRead.capability_id), changesView = views.find(item => item.capability_id === changesChange.capability_id);
    assert.ok(shelfView && changesView, "the shelf and the changes plugin run in the project");
    const shelfProvider = shelfView.provider;
    /**
     * What the shelf offers beyond its Manifest's actions, registered as its own installation's: the catalog as it reads after the
     * shelf added an action. Its Manifest says nothing of them, and it declares no groups, so they are in its one whole category.
     */
    const shelfAdds = (definitions: readonly ActionDefinition[]) => localHost.actionRegistry(project.reference).registerProvider({ provider: { ...shelfProvider },
      definitions, handlers: definitions.map(definition => ({ ...definition, handle: () => ({}) })) });
    const subject = (key: string) => `agent:task:${project.project_id}:${install}:${key}`;
    /** The categories by the person's switches, from the revision `list` gave. */
    const set = async (key: string, categories: readonly TaskGrantSetCategory[], expected?: string) => {
      const revision = expected ?? (await list(project)).subjects.find(item => item.plugin_install_id === install && item.key === key)?.revision ?? "";
      return call<TaskGrantSubject>(project, person(project), agentTaskGrantActions.set, { plugin_install_id: install, key, categories, expected_revision: revision });
    };
    /** One round of `brief` (or another role), with `grant_subject` if given; `during` makes its calls. */
    const run = async (input: Partial<PluginAgentRunInput>, calls?: During) => {
      during = calls;
      try {
        return await localHost.actionClient(project.reference).invoke(person(project), { capability_id: brief.capability_id, version: brief.version, provider_id: providerId },
          { role_id: "brief", title: "读一读", task: "读这个任务能读的", ...input });
      } finally { during = undefined; }
    };
    return { project, plugin, install, providerId, subject, set, run, group: { provider_id: providerId, group_id: "notes" },
      shelf: { provider_id: shelfProvider.provider_id }, changes: { provider_id: changesView.provider.provider_id }, shelfAdds };
  }
  /** What a gateway finds, as `capability_id`s. */
  const found = async (gateway: AgentActionClient | undefined) => { assert.ok(gateway, "the round has the Host's gateway"); return (await gateway.discover()).map(view => view.capability_id).sort(); };
  const exact = (view: Pick<ActionView, "capability_id" | "version" | "provider">): ExactActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
  const records = async (prefix: string) => (await readMcpToolPreference(home)).action_grants.filter(grant => grant.client_id.startsWith(prefix));
  type Grant = Awaited<ReturnType<typeof records>>[number];
  /** Grants written into the Home's action grants as an earlier write left them, beside the ones there (setup only, never what is asserted). */
  const plant = async (grants: ReadonlyArray<Omit<Grant, "generation">>) => {
    const current = await readMcpToolPreference(home);
    await mkdir(join(home, "config"), { recursive: true });
    await writeFile(join(home, "config", "mcp-tools.json"), `${JSON.stringify({ version: current.version,
      action_grants: [...current.action_grants, ...grants.map(grant => ({ ...grant, generation: randomUUID() }))] }, null, 2)}\n`);
  };
  return { home, localHost, served: served!, reader, rounds, hold, off, open, list, call, person, found, exact, records, plant };
}

test("S-task-grant-subjects a task's grant subject is the Host's: no default actions, then only the categories the person turned on for that one task", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Tasks");
  const offered = (await w.list(a.project)).categories;
  assert.ok(offered.some(category => category.provider_id === a.providerId && category.group_id === "notes"), "the read group is offered as a category");
  assert.equal(offered.some(category => category.provider_id === a.providerId && category.group_id === undefined), false, "a provider with groups is no whole category");

  // Nothing is open by default: no project knowledge, no permission-free system action (§3.3, G1).
  await a.run({ grant_subject: "daily" }, async gateway => { assert.deepEqual(await w.found(gateway), []); });
  await a.set("daily", [a.group]);
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.deepEqual(await w.found(gateway), [notes.capability_id], "the group's read and nothing left out of every group");
    const view = (await gateway!.discover())[0]!;
    await gateway!.invoke(w.exact(view), {});
  });
  assert.equal(w.reader.handled.length, 1);
  const [called] = w.reader.handled;
  assert.equal(called?.actor_id, a.subject("daily"), "the call is the subject's, composed from the call's project and installation");
  assert.match(called?.audit_actor_id ?? "", /^agent:prologue:s\d+$/, "the author recorded is the round's session");

  // Another task of the same installation and project: another subject, with nothing (S-task-grant-subjects ①).
  await a.run({ grant_subject: "weekly" }, async gateway => {
    assert.deepEqual(await w.found(gateway), []);
    await assert.rejects(gateway!.invoke({ capability_id: notes.capability_id, version: 1, provider_id: a.providerId }, {}), { code: "mcp.action_revoked" });
  });
  assert.equal(w.reader.handled.length, 1, "the refused call did not run");
});

test("S-task-grant-subjects a task's grants are not the built-in Agent's or an MCP client's, and not another project's or installation's", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("A"), b = await w.open("B");
  const control = { beforeEffect: async () => {} };
  const directory = async () => (await a.plugin.services!.actions!.invoke(agentHostCapabilities.listActions, [RUNTIME], control)).map(view => view.capability_id).sort();
  const mcp = async () => { const connected = await w.served.mcp("runtime:codex", a.project.project_id); return connected.client.discover(connected.caller); };
  const agentBefore = await directory(), mcpBefore = (await mcp()).map(view => view.capability_id).sort();
  await a.set("daily", [a.group]);
  assert.deepEqual(await directory(), agentBefore, "the built-in Agent's directory gained nothing (S-task-grant-subjects ②)");
  assert.equal(agentBefore.includes(notes.capability_id), false);
  assert.deepEqual((await mcp()).map(view => view.capability_id).sort(), mcpBefore, "an MCP client's directory gained nothing");
  assert.equal(mcpBefore.includes(notes.capability_id), false);

  // The same key in another project is another subject with nothing, and an installation the project does not have names no subject (③).
  await b.run({ grant_subject: "daily" }, async gateway => { assert.deepEqual(await w.found(gateway), []); });
  assert.deepEqual((await w.list(b.project)).subjects, []);
  await assert.rejects(w.call(b.project, w.person(b.project), agentTaskGrantActions.set, { plugin_install_id: "plugin-install-another", key: "daily", categories: [b.group], expected_revision: "" }),
    { code: "actions.input_invalid" });
  assert.deepEqual(await w.records(`agent:task:${b.project.project_id}:`), [], "nothing was recorded in the other project");
});

test("S-task-grant-subjects S-08 taking a task's grants back refuses its next call and a call already under way, and runs neither", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Revoke");
  await a.set("daily", [a.group]);
  const reference = { capability_id: notes.capability_id, version: 1, provider_id: a.providerId };
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.ok(gateway);
    await gateway.invoke(reference, {});
    // A call that has passed its first checks is held in its catalog read while the person takes the task's grants back.
    w.hold.entered = Promise.withResolvers(); w.hold.release = Promise.withResolvers(); w.hold.subject = a.subject("daily");
    const pending = gateway.invoke(reference, {});
    const refused = assert.rejects(pending, { code: "mcp.action_revoked" });
    await w.hold.entered.promise;
    assert.deepEqual(await w.call(a.project, w.person(a.project), agentTaskGrantActions.clear, { plugin_install_id: a.install, key: "daily" }), { cleared: true });
    w.hold.release.resolve();
    await refused;
    await assert.rejects(gateway.invoke(reference, {}), { code: "mcp.action_revoked" });
  });
  assert.equal(w.reader.handled.length, 1, "only the call before the revocation ran");
  assert.deepEqual(await w.records("agent:task:"), []);
});

test("S-task-grant-subjects only the person sets a task's grants; a plugin clears and lists only its own installation's tasks", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Who writes");
  const input = { plugin_install_id: a.install, key: "daily", categories: [a.group], expected_revision: "" };
  // Not offered to the audience: the call is refused as one this caller has no such action for, before it runs.
  const notOffered = (error: unknown) => error instanceof Error && "code" in error && ["actions.missing", "actions.forbidden", "actions.dependency_missing"].includes(String(error.code));
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    await assert.rejects(w.call(a.project, w.person(a.project, audience), agentTaskGrantActions.set, input), notOffered, audience);
  }
  const own = a.plugin.services!.actions!, control = { beforeEffect: async () => {} };
  // The plugin's own call, as its Manifest consumes the action: the plugin audience is not offered it either.
  await assert.rejects(own.invoke(agentTaskGrantActions.set, input, control), notOffered, "plugin");
  assert.deepEqual(await w.records("agent:task:"), [], "no audience but the person's wrote anything");
  await a.set("daily", [a.group]);
  await assert.rejects(own.invoke(agentTaskGrantActions.clear, { plugin_install_id: "plugin-install-another", key: "daily" }, control), { code: "actions.forbidden" });
  await assert.rejects(own.invoke(agentTaskGrantActions.list, { plugin_install_id: "plugin-install-another" }, control), { code: "actions.forbidden" });
  const listed = await own.invoke(agentTaskGrantActions.list, {}, control);
  assert.deepEqual(listed.categories, [], "a plugin is not told what the project offers");
  assert.deepEqual(listed.subjects.map(subject => [subject.plugin_install_id, subject.key, subject.categories.map(category => category.status)]), [[a.install, "daily", ["granted"]]]);
  assert.equal((await w.records("agent:task:")).length, 1, "the refused clear took nothing");
  assert.deepEqual(await own.invoke(agentTaskGrantActions.clear, { key: "daily" }, control), { cleared: true });
  assert.deepEqual(await w.records("agent:task:"), []);
});

test("S-task-grant-subjects a task is only given reads: a provider's commands and writing queries are never recorded, and naming none of its reads is refused", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Reads only");
  await assert.rejects(a.set("daily", [a.group, a.changes]), { code: "actions.input_invalid" }, "a provider without a read offers no category");
  assert.deepEqual(await w.records("agent:task:"), [], "the whole call was refused");
  await a.set("daily", [a.shelf]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id), [shelfRead.capability_id], "only the read was recorded");
});

test("S-task-grant-subjects a provider of the Host's own that does not declare task_readable is no category: not listed, naming one is refused, and a record of one reads nothing", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Undeclared");
  let systemCalls = 0;
  const systemRead = query("fixture.system.read");
  t.after(w.localHost.actionRegistry(a.project.reference).registerProvider({ provider: { provider_id: "system.fixture", kind: "system", title: "System fixture",
    project_id: a.project.project_id }, definitions: [systemRead], handlers: [{ ...systemRead, handle: () => { systemCalls++; return {}; } }] }));
  // The Host's own reads open to an Agent that do not declare a task may read them (search, memory, placement, and this one) have no
  // Manifest and may read across plugins: none of them is a category, and naming any of them, beside a category that is offered,
  // refuses the whole call.
  const views = await w.localHost.inspectActions(w.person(a.project), a.project.reference);
  const undeclared = [...new Set(views.filter(view => view.provider.kind !== "plugin" && view.provider.task_readable !== true
    && view.action.audiences.includes("agent") && view.operation === "query").map(view => view.provider.provider_id))].sort();
  assert.ok(undeclared.includes("system.fixture") && undeclared.length > 1, `the catalog holds the Host's own undeclared reads: ${undeclared.join(", ")}`);
  const offered = (await w.list(a.project)).categories;
  assert.deepEqual(offered.filter(category => undeclared.includes(category.provider_id)), [], "no undeclared provider is a category");
  for (const provider_id of undeclared) {
    await assert.rejects(a.set("daily", [a.group, { provider_id }]), { code: "actions.input_invalid" }, provider_id);
  }
  assert.deepEqual(await w.records("agent:task:"), [], "nothing of the refused calls was recorded");
  // A record of one, however it got there, reads nothing: a task's round does not find it, and the call is refused unrun.
  await a.set("daily", [a.group]);
  await w.plant([{ client_id: a.subject("daily"), project_id: a.project.project_id, capability_id: systemRead.capability_id, version: 1, provider_id: "system.fixture", permissions: [], enabled: true }]);
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.deepEqual(await w.found(gateway), [notes.capability_id]);
    await assert.rejects(gateway!.invoke({ capability_id: systemRead.capability_id, version: 1, provider_id: "system.fixture" }, {}),
      (error: unknown) => error instanceof Error && "code" in error && ["mcp.action_revoked", "actions.missing"].includes(String(error.code)));
  });
  assert.equal(systemCalls, 0);
});

test("S-task-grant-subjects project knowledge is a category because its provider declares task_readable: listed, off by default, and readable once turned on", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Knowledge");
  const knowledge = { provider_id: KNOWLEDGE_PROVIDER_ID };
  const offered = (await w.list(a.project)).categories.filter(category => category.provider_id === KNOWLEDGE_PROVIDER_ID);
  assert.deepEqual(offered.map(category => [category.group_id ?? null, category.title]), [[null, "项目资料"]], "one whole category, in the provider's own name");
  // Off by default: a task with nothing turned on finds none of it (§8 第 2 条, G1).
  await a.run({ grant_subject: "daily" }, async gateway => { assert.deepEqual(await w.found(gateway), []); });
  await a.set("daily", [knowledge]);
  const recorded = (await w.records("agent:task:")).map(grant => grant.capability_id).sort();
  assert.ok(recorded.includes(knowledgeActions.list.capability_id), `the reads are recorded: ${recorded.join(", ")}`);
  for (const id of recorded) assert.ok(Object.values(knowledgeActions).some(action => action.capability_id === id), `${id} is one of its agent reads, not a management action`);
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.ok(gateway);
    const views = await gateway.discover(), list = views.find(view => view.capability_id === knowledgeActions.list.capability_id);
    assert.ok(list, "the task finds project knowledge");
    const answer = await gateway.invoke(w.exact(list), {}) as { pieces?: unknown };
    assert.ok(Array.isArray(answer.pieces), "and reads it");
  });
});

test("S-task-grant-subjects a category that is not offered now is refused as a whole call: no group for a provider with groups (C3), a group it no longer declares (S3), a stale revision", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Named");
  await assert.rejects(a.set("daily", [{ provider_id: a.providerId }]), { code: "actions.input_invalid" });
  await assert.rejects(a.set("daily", [a.group, { provider_id: a.providerId, group_id: "gone" }]), { code: "actions.input_invalid" });
  await assert.rejects(a.set("daily", [{ provider_id: "fixture.unknown" }]), { code: "actions.input_invalid" });
  assert.deepEqual(await w.records("agent:task:"), []);
  const first = await a.set("daily", [a.group]);
  await assert.rejects(a.set("daily", [], "a-revision-from-before"), { code: "actions.conflict" });
  assert.equal((await w.list(a.project)).subjects[0]?.revision, first.revision, "the stale call changed nothing");
  await a.set("daily", []);
  assert.deepEqual(await w.records("agent:task:"), [], "an empty list takes them all back");
});

test("S-task-grant-subjects R1 R2 PWA-152 turning on another category keeps a category that needs confirmation as it was: what its provider added stays unreadable", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Keep unconfirmed");
  await a.set("daily", [a.shelf]);
  t.after(a.shelfAdds([shelfAdded]));
  const status = async () => (await w.list(a.project)).subjects[0]?.categories.map(category => [category.provider_id, category.status]).sort();
  assert.deepEqual(await status(), [[a.shelf.provider_id, "needs_confirmation"]]);
  await a.set("daily", [a.shelf, a.group]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id).sort(), [shelfRead.capability_id, notes.capability_id].sort(), "the shelf's records are as they were");
  assert.deepEqual(await status(), [[a.providerId, "granted"], [a.shelf.provider_id, "needs_confirmation"]].sort());
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.deepEqual(await w.found(gateway), [shelfRead.capability_id, notes.capability_id].sort(), "what the shelf added is still not readable");
  });
});

test("S-task-grant-subjects R1 §3.4 turning on another category while one is unavailable keeps its records, and it reads again when its provider is back", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Keep unavailable");
  await a.set("daily", [a.shelf]);
  w.off.add(shelfRead.capability_id);
  const status = async () => (await w.list(a.project)).subjects[0]?.categories.map(category => [category.provider_id, category.status]).sort();
  assert.deepEqual(await status(), [[a.shelf.provider_id, "unavailable"]]);
  await a.set("daily", [a.shelf, a.group]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id).sort(), [shelfRead.capability_id, notes.capability_id].sort(), "the shelf's record is kept");
  w.off.delete(shelfRead.capability_id);
  assert.deepEqual(await status(), [[a.providerId, "granted"], [a.shelf.provider_id, "granted"]].sort(), "back unchanged, it is granted again");
  await a.run({ grant_subject: "daily" }, async gateway => { assert.deepEqual(await w.found(gateway), [shelfRead.capability_id, notes.capability_id].sort()); });
});

test("S-task-grant-subjects R3 R4 only the person's confirm records a held category anew, and a held category left out of the call loses its records", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Confirm");
  await a.set("daily", [a.shelf, a.group]);
  t.after(a.shelfAdds([shelfAdded]));
  await a.set("daily", [{ ...a.shelf, confirm: true }, a.group]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id).sort(), [shelfAdded.capability_id, shelfRead.capability_id, notes.capability_id].sort(),
    "allowed again, the shelf records what it offers now");
  await a.run({ grant_subject: "daily" }, async gateway => { assert.ok((await w.found(gateway)).includes(shelfAdded.capability_id)); });
  await a.set("daily", [a.group]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id), [notes.capability_id], "the shelf left out of the call is taken off");
  await a.run({ grant_subject: "daily" }, async gateway => { assert.deepEqual(await w.found(gateway), [notes.capability_id]); });
});

test("S-task-grant-subjects R5 a category new to the task whose provider is off records nothing and refuses the whole call", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Off");
  w.off.add(shelfRead.capability_id);
  await assert.rejects(a.set("daily", [a.group, a.shelf]), { code: "actions.input_invalid" });
  await assert.rejects(a.set("daily", [a.group, { ...a.shelf, confirm: true }]), { code: "actions.input_invalid" });
  assert.deepEqual(await w.records("agent:task:"), [], "no empty grant and nothing else of the call was recorded");
  w.off.delete(shelfRead.capability_id);
  await a.set("daily", [a.group, a.shelf]);
  assert.equal((await w.records("agent:task:")).length, 2, "switched back on, it can be turned on");
});

test("S-task-grant-subjects R5 every category list offers is one set takes as a new category: one with nothing callable now is not offered, and a task holding it sees it unavailable", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Offered is settable");
  const offered = (await w.list(a.project)).categories;
  assert.ok(offered.length > 2, "the built-in plugins, the fixtures and project knowledge offer categories");
  for (const [index, category] of offered.entries()) {
    const reference = { provider_id: category.provider_id, ...(category.group_id ? { group_id: category.group_id } : {}) };
    await a.set(`k${index}`, [reference]).catch((error: unknown) => assert.fail(`list offered ${JSON.stringify(reference)} and set refused it: ${String(error)}`));
  }
  await a.set("daily", [a.shelf]);
  w.off.add(shelfRead.capability_id);
  const now = await w.list(a.project);
  assert.equal(now.categories.some(category => category.provider_id === a.shelf.provider_id), false, "nothing of it callable now, the shelf is no switch");
  assert.deepEqual(now.subjects.find(subject => subject.key === "daily")?.categories.map(category => [category.provider_id, category.status]),
    [[a.shelf.provider_id, "unavailable"]], "the task that holds it sees it under its own state");
});

test("S-task-grant-subjects R1 a reference neither held nor offered now names nothing for a task new to it, and is a stale one, refused as a conflict, from a task holding its provider", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Held by records");
  // New to the task, neither names a category offered now.
  await assert.rejects(a.set("daily", [{ provider_id: a.providerId }]), { code: "actions.input_invalid" });
  await assert.rejects(a.set("daily", [{ ...a.shelf, group_id: "gone" }]), { code: "actions.input_invalid" });
  await a.set("daily", [a.group, a.shelf]);
  const before = (await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort();
  // The task holds these providers under other categories: such references come from a view of before their groups changed.
  await assert.rejects(a.set("daily", [{ provider_id: a.providerId }, a.shelf]), { code: "actions.conflict" });
  await assert.rejects(a.set("daily", [a.group, { ...a.shelf, group_id: "gone" }]), { code: "actions.conflict" });
  assert.deepEqual((await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort(), before, "the refused calls changed nothing");
});

/**
 * The Host's task grant provider over ports whose catalog and declarations this test sets. A running plugin's Manifest is the
 * platform's frozen copy, so a provider that changes its read groups between two calls (an upgrade with other groups) is written
 * here as the declarations the ports answer; the records are the Home's, read and written as the Host does.
 */
async function regroupable(t: TestContext) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "task-grant-regroup-")));
  t.after(() => rm(home, { recursive: true, force: true }));
  const reference: LocalHostProjectReference = { project_id: "p-regroup", storage_key: "p-regroup" };
  const install = "install-reader", shelfInstall = "install-shelf";
  const view = (definition: ActionDefinition, provider_id: string, plugin_id: string): ActionView => ({ capability_id: definition.capability_id,
    version: definition.version, operation: definition.operation, action: definition.action, availability: { available: true },
    provider: { provider_id, title: plugin_id, kind: "plugin", plugin_id, plugin_install_id: provider_id } });
  const views = [view(notes, install, READER), view(loose, install, READER), view(shelfRead, shelfInstall, SHELF)];
  const state: { groups?: PluginReadGroupDeclaration[] } = {};
  const provider = taskGrantActionProvider({ homeDirectory: home, project: id => id === reference.project_id ? reference : undefined,
    catalog: async () => views,
    declarations: async () => ({ of: ({ provider_id }) => provider_id === install && state.groups ? { read_groups: state.groups } : {},
      installed: id => id === install || id === shelfInstall }) });
  const handle = (action: { capability_id: string }, input: unknown) => {
    const handler = provider.handlers.find(entry => entry.capability_id === action.capability_id);
    assert.ok(handler, `the provider handles ${action.capability_id}`);
    const caller: ActionExecutionContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: reference.project_id, permissions: ["projects:settings"],
      beforeEffect: async () => {} };
    return Promise.resolve(handler.handle(caller, input));
  };
  const list = async () => await handle(agentTaskGrantActions.list, {}) as TaskGrantListResult;
  const subject = async (key: string) => (await list()).subjects.find(item => item.key === key);
  const set = async (key: string, categories: readonly TaskGrantSetCategory[], expected?: string) => await handle(agentTaskGrantActions.set,
    { plugin_install_id: install, key, categories, expected_revision: expected ?? (await subject(key))?.revision ?? "" }) as TaskGrantSubject;
  const held = async () => (await readMcpToolPreference(home)).action_grants.map(grant => [grant.client_id, grant.capability_id, grant.generation]).sort();
  const status = async (key: string) => (await subject(key))?.categories.map(category => [category.provider_id, category.group_id ?? null, category.status]).sort();
  const recorded = async (key: string) => (await readMcpToolPreference(home)).action_grants.filter(grant => grant.client_id.endsWith(`:${key}`)).map(grant => grant.capability_id).sort();
  return { state, install, shelf: { provider_id: shelfInstall }, set, subject, held, status, recorded };
}

test("S-task-grant-subjects R1 R4 PWA-151 a set built on what the person read before the provider changed its read groups is a conflict and changes nothing", async t => {
  const r = await regroupable(t);
  const whole = { provider_id: r.install }, notesGroup = { provider_id: r.install, group_id: "notes" }, looseGroup = { provider_id: r.install, group_id: "loose" };
  const notesDeclared: PluginReadGroupDeclaration = { group_id: "notes", title: "笔记", description: "这个插件的笔记", actions: [notes.capability_id] };
  const looseDeclared: PluginReadGroupDeclaration = { group_id: "loose", title: "零散", description: "不在笔记里的", actions: [loose.capability_id] };

  // Scenario one: the reader declared no groups and the person turned on all of it; it then declares `notes`, leaving `loose` in none.
  await r.set("daily", [whole]);
  const seen = (await r.subject("daily"))?.revision;
  r.state.groups = [notesDeclared];
  let before = await r.held();
  // The page still shows the whole reader: turning on the shelf beside it sends that row back. Taken as it reads now, the call would
  // keep `loose` alone (under the reader with no group) and drop `notes`, which the person never touched.
  await assert.rejects(r.set("daily", [whole, r.shelf], seen), { code: "actions.conflict" });
  assert.deepEqual(await r.held(), before, "nothing was kept or dropped");
  assert.deepEqual(await r.status("daily"), [[r.install, null, "removed"], [r.install, "notes", "granted"]].sort(), "read again, the person sees the groups as they are now");

  // Scenario two: the reader declares `notes` and `loose`, both turned on; it then drops `loose`.
  r.state.groups = [notesDeclared, looseDeclared];
  await r.set("weekly", [notesGroup, looseGroup]);
  const earlier = (await r.subject("weekly"))?.revision;
  r.state.groups = [notesDeclared];
  before = await r.held();
  // The page still shows both: turning `notes` off sends `loose` alone. Taken as it reads now, it would keep the whole reader, `notes` too.
  await assert.rejects(r.set("weekly", [looseGroup], earlier), { code: "actions.conflict" });
  // With the revision read now the reference is still a stale one: neither held nor offered, of a provider the task holds.
  await assert.rejects(r.set("weekly", [looseGroup]), { code: "actions.conflict" });
  assert.deepEqual(await r.held(), before, "nothing was kept or dropped");
  assert.deepEqual(await r.status("weekly"), [[r.install, null, "removed"], [r.install, "notes", "granted"]].sort());
  // Read again, turning `notes` off takes it off (PWA-151): the removed row, sent back as it is listed, keeps its record.
  await r.set("weekly", [whole]);
  assert.deepEqual(await r.recorded("weekly"), [loose.capability_id]);
  assert.deepEqual(await r.status("weekly"), [[r.install, null, "removed"]]);
});

test("S-task-grant-subjects R1 R4 C1 a category its provider no longer declares is listed as removed, kept exactly while it is held and unreadable meanwhile, and gone once left out", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Removed");
  await a.set("daily", [a.group]);
  // The record a whole-provider grant left before the reader declared its groups: its Manifest now puts `loose` in no group. A fixture's
  // Manifest is the one its installation was installed with, so the record is written as that earlier grant left it.
  await w.plant([{ client_id: a.subject("daily"), project_id: a.project.project_id, capability_id: loose.capability_id, version: 1, provider_id: a.providerId, permissions: [], enabled: true }]);
  const status = async () => (await w.list(a.project)).subjects[0]?.categories.map(category => [category.provider_id, category.group_id ?? null, category.status]).sort();
  assert.deepEqual(await status(), [[a.providerId, null, "removed"], [a.providerId, "notes", "granted"]].sort());
  const before = (await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort();
  // Turning a switch sends the removed row back as it is listed: the provider with no group. Held, it keeps its record as it was.
  await a.set("daily", [a.group, { provider_id: a.providerId }]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort(), before, "the removed category's record is kept exactly");
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.deepEqual(await w.found(gateway), [notes.capability_id], "what the provider no longer offers a task is not readable, whatever the record says");
    await assert.rejects(gateway!.invoke({ capability_id: loose.capability_id, version: 1, provider_id: a.providerId }, {}),
      (error: unknown) => error instanceof Error && "code" in error && ["mcp.action_revoked", "actions.missing"].includes(String(error.code)));
  });
  assert.deepEqual(w.reader.handled, [], "the refused call did not run");
  // 「移除」: the row left out of the call loses its record.
  await a.set("daily", [a.group]);
  assert.deepEqual((await w.records("agent:task:")).map(grant => grant.capability_id), [notes.capability_id]);
  assert.deepEqual(await status(), [[a.providerId, "notes", "granted"]]);
});

test("S-task-grant-subjects R3 confirm only re-records a category the task holds now, as the Host holds it, and not one that records nothing callable now", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Confirm held");
  await assert.rejects(a.set("daily", [{ ...a.group, confirm: true }]), { code: "actions.input_invalid" }, "confirm on a category the task does not hold");
  assert.deepEqual(await w.records("agent:task:"), []);
  const first = await a.set("daily", [a.group, a.shelf]);
  const before = (await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort();
  w.off.add(shelfRead.capability_id);
  await assert.rejects(a.set("daily", [a.group, { ...a.shelf, confirm: true }]), { code: "actions.input_invalid" }, "nothing callable to record now");
  w.off.delete(shelfRead.capability_id);
  assert.deepEqual((await w.records("agent:task:")).map(grant => [grant.capability_id, grant.generation]).sort(), before, "the refused call changed nothing");
  // What the task holds is what the Host holds at the call: once a plugin has cleared it, the person's earlier view confirms nothing.
  const own = a.plugin.services!.actions!, control = { beforeEffect: async () => {} };
  await own.invoke(agentTaskGrantActions.clear, { key: "daily" }, control);
  await assert.rejects(a.set("daily", [{ ...a.group, confirm: true }], first.revision), { code: "actions.conflict" });
  await assert.rejects(a.set("daily", [{ ...a.group, confirm: true }]), { code: "actions.input_invalid" });
  assert.deepEqual(await w.records("agent:task:"), [], "nothing came back");
});

test("S-task-grant-subjects PWA-149 a task granted Schedule's 提醒 reads the reminders in its round, and not the task list of 定时操作", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Reminders");
  const offered = (await w.list(a.project)).categories.filter(category => category.plugin_id === SCHEDULE_PLUGIN_ID);
  const reminders = offered.find(category => category.group_id === "reminders");
  assert.ok(reminders && offered.some(category => category.group_id === "operations"), "Schedule offers 提醒 and 定时操作 as two categories");
  await a.set("daily", [{ provider_id: reminders.provider_id, group_id: "reminders" }]);
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.ok(gateway);
    const views = await gateway.discover(), ids = views.map(view => view.capability_id);
    assert.ok(ids.includes(scheduleActions.reminders.capability_id), "the reminders query is readable by the task");
    assert.equal(ids.includes(scheduleActions.list.capability_id), false, "the task list is not");
    const answer = await gateway.invoke(w.exact(views.find(view => view.capability_id === scheduleActions.reminders.capability_id)!), {}) as { reminders?: unknown };
    assert.ok(Array.isArray(answer.reminders), "and it answers");
    await assert.rejects(gateway.invoke({ capability_id: scheduleActions.list.capability_id, version: scheduleActions.list.version, provider_id: reminders.provider_id }, {}),
      { code: "mcp.action_revoked" });
  });
});

test("S-task-grant-subjects S-17 a plugin's round reads as a task only from a read-only business role, by a key alone, and without one it borrows nothing", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Roles");
  await a.set("daily", [a.group]);
  for (const role_id of ["operator", "reviewer"]) {
    await assert.rejects(a.run({ role_id, grant_subject: "daily" }), { code: "actions.input_invalid" }, role_id);
  }
  await assert.rejects(a.run({ grant_subject: "a:b" }), { code: "actions.input_invalid" }, "a key cannot name another installation or project");
  assert.equal(w.rounds.length, 0, "no round started");
  // A business role without a task gets no gateway and no tools: it does not borrow the built-in Agent's grants (§3.3).
  await a.run({});
  assert.deepEqual(w.rounds.map(round => [round.gateway === undefined, round.tools]), [[true, false]]);
  // A tool input that names an identity is business input, refused before the action runs.
  await a.run({ grant_subject: "daily" }, async gateway => {
    for (const field of ["actor_id", "grant_subject", "audit_actor_id"]) {
      await assert.rejects(gateway!.invoke({ capability_id: notes.capability_id, version: 1, provider_id: a.providerId }, { [field]: "agent:task:x:y:z" }), { code: "actions.input_invalid" }, field);
    }
  });
  assert.deepEqual(w.reader.handled, []);
});

test("S-task-grant-subjects S-08 a task's subject is no client of 对外接入 and cannot cross the action gateway", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Not a client");
  await a.set("daily", [a.group]);
  const subject = a.subject("daily");
  await assert.rejects(readMcpActionAccess(w.served.web, { clientId: subject, projectId: a.project.project_id }), (error: unknown) => isLocalHostHttpError(error) && error.code === "mcp.grant_invalid");
  await assert.rejects(w.served.mcp(subject, a.project.project_id), { code: "actions.forbidden" });
  assert.equal(w.reader.handled.length, 0);
  assert.equal((await w.records(subject)).length, 1, "its grant stays the task's");
});

test("S-task-grant-subjects a task reads a Home plugin's items only in its own project: all projects stays the person's (C2, S-74)", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Home reads");
  const todo = (await w.list(a.project)).categories.filter(category => category.plugin_id === "io.molis.work.todo");
  assert.ok(todo.length, "Todo offers a category");
  await a.set("daily", todo.map(category => ({ provider_id: category.provider_id, ...(category.group_id ? { group_id: category.group_id } : {}) })));
  await a.run({ grant_subject: "daily" }, async gateway => {
    assert.ok(gateway);
    const view = (await gateway.discover()).find(item => item.capability_id === "todo.items.list");
    assert.ok(view, "the to-do list is readable by the task");
    await gateway.invoke(w.exact(view), {});
    await assert.rejects(gateway.invoke(w.exact(view), { all_projects: true }), { code: "actions.forbidden" });
  });
});

test("S-task-grant-subjects deleting a project takes its tasks' grants with it and leaves another project's", { timeout: 120_000 }, async t => {
  const w = await world(t), a = await w.open("Deleted"), b = await w.open("Kept");
  await a.set("daily", [a.group]); await b.set("daily", [b.group]);
  assert.equal(await projectDeletedHooksFor(w.home).clear("task-grants", a.project.project_id), true);
  assert.deepEqual(await w.records(`agent:task:${a.project.project_id}:`), []);
  assert.equal((await w.records(`agent:task:${b.project.project_id}:`)).length, 1);
});

test("S-task-grant-subjects uninstalling a plugin takes its tasks' grants with it", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Uninstalled");
  const client = home.host.actionClient(project.reference);
  const preview = await client.invoke(installer(project.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await client.invoke(installer(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const install = home.host.homePlugins?.installation(PACKAGE_PLUGIN_ID)?.install_id;
  assert.ok(install, "the package is installed in the Home");
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["projects:settings"] };
  const listed = await client.invoke(caller, ref(agentTaskGrantActions.list), {}) as TaskGrantListResult;
  const category = listed.categories[0];
  assert.ok(category, "the project offers a category");
  await client.invoke(caller, ref(agentTaskGrantActions.set), { plugin_install_id: install, key: "daily", expected_revision: "",
    categories: [{ provider_id: category.provider_id, ...(category.group_id ? { group_id: category.group_id } : {}) }] });
  const subjects = async () => (await readMcpToolPreference(home.home)).action_grants.filter(grant => grant.client_id.startsWith(`agent:task:${project.project_id}:${install}:`));
  assert.ok((await subjects()).length > 0);
  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data: true });
  assert.deepEqual(await subjects(), [], "kept data or not, what its tasks could read goes with it");
});
