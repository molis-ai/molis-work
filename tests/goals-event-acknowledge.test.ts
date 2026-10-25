import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkServer, openMolisWorkProjectCatalog, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, createMolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, renderWorkEventBody } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchLocale } from "@molis-ai/molis-work-app-workbench";
import { RECEIPT_WORDS } from "@molis-ai/molis-work-design-system";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionAvailability, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalWorkEventRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { managementCaller, managementGoals, mcpRuntimeCaller } from "./goal-management-caller.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { serveTestHost } from "./fixtures/test-home.js";

/**
 * `goals.events.acknowledge` is how an external AI session says it read a note, a requirement or the person's decision on a Goal and how
 * it will treat it (specs/ai-input-receipts §8.4, stage 4). It lands as one `input_acknowledged` system record on the Goal's timeline,
 * under the session's own identity, and changes nothing else. Everything here goes through the public action, the real MCP server, or the
 * timeline's history route; each refusal checks that nothing was written.
 */
const TOOL = (id: string) => {
  const definition = Object.values(goalsActions).find(action => action.capability_id === id);
  assert.ok(definition, `Goals declares ${id}`);
  return `molis_work_v1_action_${id}__v${definition.version}`;
};
const ACK = TOOL("goals.events.acknowledge");
const NOTE = "先别动登录页，接口先做完";
const SAID = "先做接口，登录页放到下一步";
const ack = goalsActions.acknowledge.capability_id;
const operationOf = (event: GoalWorkEventRecord) => (event.payload as { operation?: string }).operation;

/** A probe offered to plugins only: it keeps the caller each plugin's call reached it with, which only the Host issues. */
const PROBE: ActionDefinition<Record<string, never>, null> = { capability_id: "goals-ack.probe.peek", version: 1, operation: "query",
  action: { title: "读取探针", description: "记下调用它的插件", kind: "query", scope: "project", audiences: ["plugin"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false } } };

/** A plugin that holds Goals' read and write permissions and declares the acknowledge action, started by the Host like any other. */
function goalsPlugin() {
  const contexts: PluginStartContext[] = [];
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.goals-ack", version: "1.0.0",
    name: "Goals ack", kind: "app", publisher: { publisher_id: "example", signature: "goals-ack" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["goals:read", "goals:write"].map(permission => ({ permission, required: true, reason: "读写目标" })),
    capabilities: { provides: [], consumes: [PROBE.capability_id, ack] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start(context) { contexts.push(context); return { kind: "app" }; } };
  return { definition, contexts };
}

async function hostRig(label: string, plugin?: ReturnType<typeof goalsPlugin>) {
  const home = await mkdtemp(join(tmpdir(), `goals-ack-${label}-`));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Ack", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const gate: { availability: ActionAvailability } = { availability: { available: true } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    view.capability_id === ack ? gate.availability : { available: true }, ...(plugin ? { pluginFixtures: { project: [plugin.definition] } } : {}) });
  const project_id = project.project_id, actions = host.actionClient(ref), person = managementGoals(actions, project_id);
  const events = async (goal_id: string) => (await person.invoke(goalsActions.events, { goal_id })).events as GoalWorkEventRecord[];
  const acknowledged = async (goal_id: string) => (await events(goal_id)).filter(event => operationOf(event) === "input_acknowledged");
  const cursor = async (goal_id: string) => (await person.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
  const newGoal = async (goal_id: string) => {
    await person.invoke(goalsActions.create, { goal_id, title: `目标 ${goal_id}`, outcome: "一段结果", idempotency_key: `create-${goal_id}` });
    return person.invoke(goalsActions.note, { goal_id, body: NOTE, idempotency_key: `note-${goal_id}` });
  };
  const input = (goal_id: string, event_id: string, read_cursor: number, idempotency_key: string) =>
    ({ goal_id, event_id, treatment: "later-step" as const, note: SAID, read_cursor, idempotency_key });
  /**
   * What `plugin` presents on a call here, claiming `permissions`: the project's plugins start, as when the person opens the project, and
   * the plugin reads the probe through its own SDK; its call carries the caller the Host issued its session (S-15).
   */
  const pluginCaller = async (plugin: ReturnType<typeof goalsPlugin>, permissions: readonly string[]): Promise<ActionCallContext> => {
    const seen: HostPluginCaller[] = [];
    host.actionRegistry(ref).registerProvider({ provider: { provider_id: "goals-ack-probe", title: "探针", kind: "system" }, definitions: [PROBE],
      handlers: [{ ...PROBE, handle(context) { seen.push(context.host_plugin!); return null; } }] });
    await host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id, permissions: [] }, ref);
    const started = plugin.contexts.at(-1);
    assert.ok(started?.services?.actions, "the plugin has started and reaches actions through its own SDK");
    await started.services.actions.invoke(PROBE, {});
    const issued = seen.at(-1);
    assert.ok(issued, "the probe saw the plugin's call");
    assert.equal(issued.plugin_id, plugin.definition.manifest.plugin_id, "the caller is the one the Host issued that plugin");
    return { actor_id: issued.actor_id, actor_kind: "user", project_id, audience: "plugin", permissions, plugin_install_id: issued.install_id, host_plugin: issued };
  };
  return { home, project_id, ref, host, actions, person, gate, events, acknowledged, cursor, newGoal, input, pluginCaller,
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

async function mcpRig(runtimeId: string, stable: string | null) {
  const directory = await mkdtemp(join(tmpdir(), "goals-ack-mcp-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost({ homeDirectory });
  const project = await catalog.createProject({ display_name: "Ack MCP", actor_id: "user" });
  // The rig's Host is the Home's: the grants go through the access settings it serves.
  const served = await serveTestHost(null, { home: homeDirectory, host });
  await grantGoalsMcp({ web: served.web }, project, `runtime:${runtimeId}`);
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const actions = host.actionClient(ref), project_id = project.project_id, person = managementGoals(actions, project_id);
  const mcp = new MolisWorkServer("runtime", { databasePath: project.database_path, projectId: project_id, webBaseUrl: "http://127.0.0.1:4173" },
    { homeDirectory, runtimeContext: { runtime_id: runtimeId, stable_work_context_id: stable, host_declares_stable: stable !== null } }, host);
  const call = async (id: string, input: object) => JSON.parse(await mcp.callTool(TOOL(id), input));
  return { mcp, call, host, actions, person, project_id,
    close: async () => { await mcp.close(); await served.close(); await host.close(); catalog.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("RCPT-376: a stable-session MCP caller says how it will treat the person's note: one system record under the session, the note it answers, replayed by key", { timeout: 120_000 }, async () => {
  const r = await mcpRig("claude-code", "ack-sess-01234567");
  try {
    const goal_id = "ACK-MCP";
    const note = await r.person.invoke(goalsActions.create, { goal_id, title: "接口先行", outcome: "先交付接口", idempotency_key: "create" })
      .then(() => r.person.invoke(goalsActions.note, { goal_id, body: NOTE, idempotency_key: "note" }));
    // RCPT-383: the strict output union changed, so only @2 is offered; the old pinned tools cannot silently receive it.
    const catalog = await r.mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) as { result: { tools: Array<{ name: string }> } };
    const names = catalog.result.tools.map(tool => tool.name);
    for (const id of ["goals.events.list", "goals.events.latest", "goals.events.read"]) {
      assert.ok(names.includes(`molis_work_v1_action_${id}__v2`));
      assert.ok(!names.includes(`molis_work_v1_action_${id}__v1`));
      await assert.rejects(r.mcp.callTool(`molis_work_v1_action_${id}__v1`, { goal_id, event_id: note.event_id }), { code: "mcp.tool_unknown" });
    }
    const noted = await r.call("goals.events.read", { goal_id, event_id: note.event_id }) as GoalWorkEventRecord;
    const input = { goal_id, event_id: note.event_id, treatment: "later-step", note: SAID, read_cursor: note.observed_event_cursor, idempotency_key: "ack-1" };

    const said = await r.call("goals.events.acknowledge", input);
    assert.deepEqual([said.recorded, said.replayed], [true, false]);
    assert.ok(said.observed_event_cursor > note.observed_event_cursor);
    const read = await r.call("goals.events.read", { goal_id, event_id: said.event_id }) as GoalWorkEventRecord;
    assert.deepEqual([read.kind, read.actor_kind], ["system", "runtime"]);
    const session = /^runtime:claude-code:(.+)$/.exec(read.actor_id)?.[1];
    assert.ok(session, `the author is the session's audit identity: ${read.actor_id}`);
    assert.deepEqual(read.payload, {
      operation: "input_acknowledged",
      reference: { event_id: note.event_id, category: "note", operation: "observation_note", title: noted.title, journal_seq: noted.journal_seq },
      treatment: "later-step", note: SAID, read_cursor: note.observed_event_cursor,
      by: { channel: "mcp", runtime_id: "claude-code", session_id: session },
    }, "who said it comes from the call, and the note it answers is copied from that note");

    // The same key says the same thing again and writes nothing; a different statement under the same key is not the same call.
    assert.deepEqual(await r.call("goals.events.acknowledge", input), { ...said, replayed: true });
    await assert.rejects(r.call("goals.events.acknowledge", { ...input, treatment: "noted" }), { code: "goals.request.idempotency_key_reused" });

    // All three @2 reads accept the new strict system payload: the lists, the latest page and one record.
    const listed = await r.call("goals.events.list", { goal_id }), latest = await r.call("goals.events.latest", { goal_id });
    for (const page of [listed, latest]) {
      assert.equal((page.events as GoalWorkEventRecord[]).filter(event => operationOf(event) === "input_acknowledged").length, 1);
      assert.ok((page.events as GoalWorkEventRecord[]).every(event => ["system", "report", "configuration"].includes(event.kind)));
    }
    assert.deepEqual((listed.events as GoalWorkEventRecord[]).map(event => event.event_id).at(-1), said.event_id);
    assert.equal((latest.events as GoalWorkEventRecord[])[0]!.event_id, said.event_id);
    const timeline = await r.person.invoke(goalsActions.timeline, { goal_id });
    assert.equal(timeline.items.find(item => item.event_id === said.event_id)?.system_operation, "input_acknowledged");

    // It says nothing about the Goal: the state is what it was before, and the person's note is still the person's.
    assert.equal((await r.person.invoke(goalsActions.state, { goal_id })).work_status, "open");
    assert.equal((await r.call("goals.events.read", { goal_id, event_id: note.event_id })).actor_kind, "user");
  } finally { await r.close(); }
});

test("RCPT-377/378: only a note, a requirement or the person's decision is answered; an unknown or foreign record, and a cursor that does not fit, are refused and write nothing", { timeout: 120_000 }, async () => {
  const r = await hostRig("kinds");
  const mcp = mcpRuntimeCaller(r.project_id, "runtime:claude-code", "kinds-session-1");
  const say = (goal_id: string, event_id: string, read_cursor: number, key: string, over: object = {}) =>
    r.actions.invoke(mcp, goalsActions.acknowledge, { ...r.input(goal_id, event_id, read_cursor, key), ...over });
  try {
    const goal_id = "ACK-KINDS", other = "ACK-OTHER";
    const note = await r.newGoal(goal_id), foreign = await r.newGoal(other);
    const asPerson = { ...managementCaller(r.project_id, "decide-1"), permissions: ["goals:read", "goals:write", "goals:decide"] };
    await r.actions.invoke(asPerson, goalsActions.decide, { goal_id, idempotency_key: "decide-1", conclusion: "接口可以先上线", effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } });
    await r.person.invoke(goalsActions.progress, { goal_id, based_on_cursor: await r.cursor(goal_id), summary: "接口做了一半", idempotency_key: "progress" });
    await r.person.invoke(goalsActions.requestDecision, { goal_id, question: "是否先上线接口？", purpose: "action", scope: { action: "publish" }, idempotency_key: "ask",
      options: [{ option_id: "yes", label: "先上线", impact: "用户先用上" }, { option_id: "no", label: "等登录页", impact: "晚一点上线" }] });
    await r.person.invoke(goalsActions.configure, { goal_id, expected_version: 0, idempotency_key: "cfg", types: [{ type_id: "story", version: 1, name: "交付", purpose: "说明可体验的片段",
      fields: [{ field_id: "piece", name: "片段", purpose: "可体验内容", format: "text", required: true }] }] });
    await r.person.invoke(goalsActions.report, { goal_id, idempotency_key: "report", events: [{ type_id: "story", type_version: 1, title: "做出了开场", fields: { piece: "开场洞穴" } }] });
    const state = await r.person.invoke(goalsActions.state, { goal_id });
    await r.person.invoke(goalsActions.agree, { goal_id, idempotency_key: "agree", expected_config_version: state.config.version, expected_agreement_version: state.agreement.version,
      new_requirements: [{ requirement_id: "api-first", statement: "接口先于页面" }] });
    const records = await r.events(goal_id);
    const idOf = (match: (event: GoalWorkEventRecord) => boolean) => records.find(match)!.event_id;
    const answered = [
      ["note", note.event_id], ["decision", idOf(event => operationOf(event) === "user_decision")],
      ["requirement", idOf(event => operationOf(event) === "agreement_set")], ["requirement", idOf(event => event.kind === "configuration")],
    ] as const;
    let cursor = await r.cursor(goal_id);
    for (const [category, event_id] of answered) {
      const said = await say(goal_id, event_id, cursor, `ack-${event_id}`) as { event_id: string };
      cursor = await r.cursor(goal_id);
      const written = (await r.events(goal_id)).find(event => event.event_id === said.event_id)!;
      assert.equal((written.payload as { reference: { category: string } }).reference.category, category, `${category} is answered`);
    }
    const wrongKind = [
      idOf(event => operationOf(event) === "progress_summary"), idOf(event => operationOf(event) === "decision_requested"),
      idOf(event => event.kind === "report"), idOf(event => operationOf(event) === "intent_created"), (await r.acknowledged(goal_id))[0]!.event_id,
    ];
    const refusal = async (code: string, run: () => Promise<unknown>, label: string) => {
      const before = (await r.events(goal_id)).length, atCursor = await r.cursor(goal_id);
      await assert.rejects(run(), { code }, label);
      assert.equal((await r.events(goal_id)).length, before, `${label}: the timeline has no extra record`);
      assert.equal(await r.cursor(goal_id), atCursor, `${label}: the cursor did not move`);
    };
    for (const [index, event_id] of wrongKind.entries()) await refusal("goals.event_acknowledgement.reference_kind", () => say(goal_id, event_id, cursor, `kind-${index}`), `kind ${index}`);
    await refusal("goals.event_acknowledgement.reference_missing", () => say(goal_id, "gevt-no-such-record", cursor, "missing"), "an unknown record");
    await refusal("goals.event_acknowledgement.reference_missing", () => say(goal_id, foreign.event_id, cursor, "foreign-goal"), "a record of another Goal");
    const project2 = await withCatalog({ homeDirectory: r.home }, c => c.createProject({ display_name: "Other", actor_id: "user" }));
    const ref2 = molisWorkHostProjectReference({ projectId: project2.project_id, databasePath: project2.database_path });
    const otherPerson = managementGoals(r.host.actionClient(ref2), project2.project_id);
    await otherPerson.invoke(goalsActions.create, { goal_id, title: "另一个项目里同名的目标", outcome: "x", idempotency_key: "create-2" });
    const elsewhere = await otherPerson.invoke(goalsActions.note, { goal_id, body: NOTE, idempotency_key: "note-2" });
    await refusal("goals.event_acknowledgement.reference_missing", () => say(goal_id, elsewhere.event_id, cursor, "foreign-project"), "a record of another project");

    // The cursor is the session's word for how far it read: whole, not negative, no later than the project, not before the note it answers.
    const noted = (await r.events(goal_id)).find(event => event.event_id === note.event_id)!;
    for (const read_cursor of [1.5, -1, cursor + 1000]) await refusal("goals.event_acknowledgement.cursor_invalid", () => say(goal_id, note.event_id, read_cursor, `cursor-${read_cursor}`), `cursor ${read_cursor}`);
    await refusal("goals.event_acknowledgement.cursor_before_reference", () => say(goal_id, note.event_id, noted.journal_seq - 1, "cursor-before"), "a cursor before the note");
    await refusal("actions.input_invalid", () => say(goal_id, note.event_id, "9" as never, "cursor-text"), "a cursor that is not a number");
    await refusal("goals.event_note.body_required", () => say(goal_id, note.event_id, cursor, "empty", { note: "   " }), "a note of spaces only");
    await refusal("actions.input_invalid", () => say(goal_id, note.event_id, cursor, "long", { note: "字".repeat(301) }), "a note over 300 characters");
    await refusal("actions.input_invalid", () => say(goal_id, note.event_id, cursor, "treatment", { treatment: "done" }), "a treatment that is not one of the eight");
    // The edges are accepted: the note's own cursor, and the project's current one.
    await say(goal_id, note.event_id, noted.journal_seq, "edge-low");
    await say(goal_id, note.event_id, await r.cursor(goal_id), "edge-high");
  } finally { await r.close(); }
});

test("RCPT-379: who is speaking comes from the call alone; a Runtime with no stable session writes nothing", { timeout: 120_000 }, async () => {
  const r = await hostRig("identity");
  try {
    const goal_id = "ACK-WHO", note = await r.newGoal(goal_id), read_cursor = await r.cursor(goal_id);
    const mcp = mcpRuntimeCaller(r.project_id, "runtime:claude-code", "identity-session-9");
    for (const forged of [{ actor_id: "someone-else" }, { project_id: "foreign" }, { session_id: "borrowed" }, { actor_kind: "user" }, { by: { channel: "mcp", runtime_id: "codex", session_id: "x" } }]) {
      await assert.rejects(r.actions.invoke(mcp, goalsActions.acknowledge, { ...r.input(goal_id, note.event_id, read_cursor, `forged-${Object.keys(forged)[0]}`), ...forged } as never), { code: "actions.input_invalid" }, Object.keys(forged)[0]);
    }
    await assert.rejects(r.actions.invoke({ ...mcp, runtime_session_missing: true }, goalsActions.acknowledge, r.input(goal_id, note.event_id, read_cursor, "no-session")), { code: "kernel.runtime_identity_missing" });
    assert.deepEqual(await r.acknowledged(goal_id), []);

    // The channel and the session are read from the context: the assistant's session, a Coding Agent with none, an MCP client by its Runtime.
    const assistant: ActionCallContext = { actor_id: "assistant", audit_actor_id: "assistant:work-7", runtime_session_id: "asst-session-0001", actor_kind: "runtime", audience: "agent",
      project_id: r.project_id, permissions: ["goals:read", "goals:write"] };
    const coding: ActionCallContext = { actor_id: "agent:codex", actor_kind: "runtime", audience: "agent", project_id: r.project_id, permissions: ["goals:read", "goals:write"] };
    const unnamed = { ...mcp, actor_id: "client-without-runtime", audit_actor_id: "client-without-runtime:s1" };
    const writers: Array<[string, ActionCallContext, object]> = [
      ["assistant", assistant, { channel: "assistant", runtime_id: null, session_id: "asst-session-0001" }],
      ["agent", coding, { channel: "agent", runtime_id: null, session_id: null }],
      ["mcp", mcp, { channel: "mcp", runtime_id: "claude-code", session_id: "identity-session-9" }],
      ["unnamed", unnamed, { channel: "mcp", runtime_id: null, session_id: "identity-session-9" }],
    ];
    for (const [name, caller, by] of writers) {
      const said = await r.actions.invoke(caller, goalsActions.acknowledge, r.input(goal_id, note.event_id, read_cursor, `by-${name}`)) as { event_id: string };
      const written = (await r.events(goal_id)).find(event => event.event_id === said.event_id)!;
      assert.deepEqual((written.payload as { by: object }).by, by, name);
      assert.equal(written.actor_id, caller.audit_actor_id ?? caller.actor_id, `${name}: the author is the caller's audit identity`);
    }
    // The real MCP server marks a Runtime without a stable session, and the action refuses it at dispatch.
  } finally { await r.close(); }
  const sessionless = await mcpRig("claude-code", null);
  try {
    const goal_id = "ACK-NOSESSION", note = await sessionless.person.invoke(goalsActions.create, { goal_id, title: "无会话", outcome: "x", idempotency_key: "create" })
      .then(() => sessionless.person.invoke(goalsActions.note, { goal_id, body: NOTE, idempotency_key: "note" }));
    await assert.rejects(sessionless.call("goals.events.acknowledge", { goal_id, event_id: note.event_id, treatment: "noted", note: SAID, read_cursor: note.observed_event_cursor, idempotency_key: "k" }),
      (error: unknown) => error instanceof ActionError && error.code === "kernel.runtime_identity_missing" && /稳定 Session/.test(error.message));
    assert.equal((await sessionless.person.invoke(goalsActions.events, { goal_id })).events.filter(event => operationOf(event as GoalWorkEventRecord) === "input_acknowledged").length, 0);
  } finally { await sessionless.close(); }
});

test("RCPT-380: only an Agent or an MCP session may answer; a page, a workflow or a plugin may not, and another project's context is a scope mismatch", async () => {
  const plugin = goalsPlugin(), r = await hostRig("audience", plugin);
  try {
    const goal_id = "ACK-AUDIENCE", note = await r.newGoal(goal_id), read_cursor = await r.cursor(goal_id);
    const mcp = mcpRuntimeCaller(r.project_id, "runtime:claude-code", "audience-session");
    const input = r.input(goal_id, note.event_id, read_cursor, "audience");
    const offered = async (caller: ActionCallContext) => (await r.actions.discover(caller)).some(view => view.capability_id === ack);
    for (const audience of ["agent", "mcp"] as const) assert.equal(await offered({ ...mcp, audience }), true, `${audience} is offered it`);
    // A plugin's call is the one its SDK makes, with the caller the Host issued it; the person and a workflow are told apart by audience alone.
    const fromPlugin = await r.pluginCaller(plugin, ["goals:read", "goals:write"]);
    for (const audience of ["plugin", "user", "workflow"] as const) {
      const caller = audience === "plugin" ? fromPlugin : { ...mcp, audience, permissions: ["goals:read", "goals:write"] };
      assert.equal(await offered(caller), false, `${audience} is not offered it`);
      await assert.rejects(r.actions.invoke(caller, goalsActions.acknowledge, input), { code: "actions.forbidden" }, `${audience} holding goals:write is still refused`);
    }
    await assert.rejects(r.actions.invoke({ ...mcp, permissions: ["goals:read"] }, goalsActions.acknowledge, input), { code: "actions.forbidden" });
    await assert.rejects(r.actions.invoke({ ...mcp, project_id: "foreign" }, goalsActions.acknowledge, input), { code: "actions.scope_mismatch" });
    assert.deepEqual(await r.acknowledged(goal_id), [], "nothing was written by any refusal");
    assert.deepEqual([goalsActions.acknowledge.action.audiences, goalsActions.acknowledge.action.plugin], [["agent", "mcp"], false]);
  } finally { await r.close(); }
});

test("RCPT-381: a call cancelled, revoked or disabled before its handler writes no record and no idempotency entry, and leaves a 「未执行」 row without the content", { timeout: 60_000 }, async () => {
  const r = await hostRig("refused");
  try {
    const goal_id = "ACK-REFUSED", note = await r.newGoal(goal_id), read_cursor = await r.cursor(goal_id);
    const mcp = mcpRuntimeCaller(r.project_id, "runtime:claude-code", "refused-session");
    const input = r.input(goal_id, note.event_id, read_cursor, "refused-key");
    const stopped = new Error("cancelled by the person");
    const count = async () => (await r.events(goal_id)).length;
    const before = await count();
    await assert.rejects(r.actions.invoke({ ...mcp, signal: AbortSignal.abort(stopped) }, goalsActions.acknowledge, input), error => error === stopped);
    await assert.rejects(r.actions.invoke({ ...mcp, validate_authority: () => { throw new ActionError("actions.revoked", "授权已撤销"); } }, goalsActions.acknowledge, input), { code: "actions.revoked" });
    r.gate.availability = { available: false, code: "actions.plugin_disabled", reason: "Goals 已停用" };
    await assert.rejects(r.actions.invoke(mcp, goalsActions.acknowledge, input), { code: "actions.plugin_disabled" });
    r.gate.availability = { available: true };
    assert.equal(await count(), before, "no handler began: the timeline is as it was");

    const rows = r.host.callLog!.list(r.project_id).filter(row => row.capability_id === ack);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(row => row.ok === false && row.refused === true && row.message === undefined), "each is a row marked 「未执行」 with no message");
    assert.deepEqual(rows.map(row => row.code).filter(Boolean), ["actions.plugin_disabled", "actions.revoked"]);
    const log = await readFile(join(r.home, "logs/action-calls.jsonl"), "utf8");
    assert.ok(!log.includes(SAID) && !log.includes(NOTE) && !log.includes("refused-key"), "the log has who, what and how it ended, not what was said");

    // Nothing was remembered under the key: the same call, now allowed, is a first call, not a replay.
    const first = await r.actions.invoke(mcp, goalsActions.acknowledge, input) as { replayed: boolean };
    assert.equal(first.replayed, false);
    assert.equal(await count(), before + 1);
  } finally { await r.close(); }
});

test("RCPT-382: the timeline says which session read what, how it will be handled and what it said; 「你的」 only for the person's own record; English on an English page", { timeout: 120_000 }, async () => {
  const r = await mcpRig("claude-code", "ack-sess-01234567");
  try {
    const goal_id = "ACK-TIMELINE", note = await r.person.invoke(goalsActions.create, { goal_id, title: "时间线", outcome: "x", idempotency_key: "create" })
      .then(() => r.person.invoke(goalsActions.note, { goal_id, body: NOTE, idempotency_key: "note" }));
    const said = await r.call("goals.events.acknowledge", { goal_id, event_id: note.event_id, treatment: "later-step", note: SAID, read_cursor: note.observed_event_cursor, idempotency_key: "ack" });
    const record = await r.call("goals.events.read", { goal_id, event_id: said.event_id }) as GoalWorkEventRecord;
    const reference = (record.payload as { reference: { title: string } }).reference;

    const page = await r.person.invoke(goalsActions.historyItem, { goal_id, item_id: said.event_id });
    assert.ok(page, "the timeline opens the record");
    assert.ok(page.html.includes(`Claude Code 会话 ack-sess 在游标 ${note.observed_event_cursor} 读到了你的笔记「${reference.title}」`), page.html);
    for (const part of [`处理方式：${RECEIPT_WORDS.TREATMENT["later-step"]}`, SAID, "AI 自己说的，Molis 没有核对", `data-locate-event="${note.event_id}"`, "定位到被说明的记录"]) {
      assert.ok(page.html.includes(part), `the card shows ${part}`);
    }

    // A note the person did not write is "this note", never "your note".
    const writer = mcpRuntimeCaller(r.project_id, "runtime:codex", "writer-session");
    const theirs = await r.actions.invoke(writer, goalsActions.note, { goal_id, body: "Codex 记下的一条", idempotency_key: "their-note" }) as { event_id: string; observed_event_cursor: number };
    const answered = await r.call("goals.events.acknowledge", { goal_id, event_id: theirs.event_id, treatment: "noted", note: SAID, read_cursor: theirs.observed_event_cursor, idempotency_key: "ack-theirs" });
    const second = await r.person.invoke(goalsActions.historyItem, { goal_id, item_id: answered.event_id });
    assert.ok(second!.html.includes("读到了这条笔记「"), second!.html);
    assert.ok(!second!.html.includes("你的"), "the person did not write it");

    // English: every phrase the card adds has an English form; only the person's and the session's own words stay as written.
    const english = createWorkbenchLocale(() => "en").L;
    const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const html = renderWorkEventBody(record, english, escape, {}, "user");
    assert.ok(html.includes(`read your note “${reference.title}” at cursor ${note.observed_event_cursor}`), html);
    assert.ok(/Claude Code session ack-sess read/.test(html), html);
    assert.ok(html.includes("How it will be handled:") && html.includes("Locate the record it answers") && html.includes(english("AI 自己说的，Molis 没有核对")), html);
    assert.notEqual(english("AI 自己说的，Molis 没有核对"), "AI 自己说的，Molis 没有核对");
    // The meta line's type word comes from SYSTEM_TYPE_LABELS, which every system record shows in Chinese; this slice keeps that, so it is left out here.
    const body = html.replace(/<p class="event-meta">.*?<\/p>/, "").replaceAll(reference.title, "").replaceAll(SAID, "");
    assert.doesNotMatch(body, /\p{Script=Han}/u, "no Chinese is left around the person's words");
  } finally { await r.close(); }
});

// RCPT-383: the callable contract is written down in tooling/gates/actions (the action-contract snapshot, which tests/action-contract-snapshot
// checks against the Manifests): the new action is one row at @1 that only an Agent or an MCP session may call, and the three event reads
// are registered only at @2 for the expanded strict system payload (docs/system/CONTRACT-CHANGES.md).
test("RCPT-383: the action snapshot has one goals.events.acknowledge@1 row for agent and mcp only, and the event reads only at @2", async () => {
  const text = await readFile(new URL("../tooling/gates/actions/actions.tsv", import.meta.url), "utf8");
  const header = text.split("\n").find(line => line.startsWith("capability_id\t"))!.split("\t");
  const rows = text.split("\n").filter(line => line && !line.startsWith("#") && !line.startsWith("capability_id\t")).map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(header.map((name, index) => [name, cells[index]])) as Record<string, string>;
  });
  const of = (id: string) => rows.filter(row => row.capability_id === id);
  const acknowledgeRows = of("goals.events.acknowledge");
  assert.equal(acknowledgeRows.length, 1, "one row, one version");
  const [row] = acknowledgeRows;
  assert.equal(row!.version, "1");
  assert.equal(row!.provider, "io.molis.work.goals");
  assert.equal(row!.operation, "command");
  assert.equal(row!.audiences, "agent,mcp", "no user, workflow or plugin audience");
  assert.equal(row!.permissions, "goals:write");
  for (const id of ["goals.events.list", "goals.events.latest", "goals.events.read"]) {
    const reads = of(id);
    assert.deepEqual(reads.map(read => read.version), ["2"], `${id} is registered only at @2`);
    assert.equal(reads[0]!.audiences, "agent,mcp,user,workflow");
  }
});
