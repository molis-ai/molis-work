import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { MolisWorkServer, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createPrivateDevelopmentHost, developInPrivateHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import type { GoalEventDecisionResult } from "@molis-ai/molis-work-contracts/modules/goals";
import { MCP_TOOLS } from "@molis-ai/molis-work-app-mcp";
import { goalsActions, GOALS_PLUGIN_ID, type GoalTreeProposalDecisionResult } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
/** The retired development entry as an old caller still holding the literal would pass it: no action behind it. */
const retiredDevelopment = { capability_id: "io.molis.work.local-host.plugin.development", version: 1, operation: "command" } as ActionDefinition<unknown, unknown>;
import { managementGoals } from "./goal-management-caller.js";
import { callerPlugin, startProjectPlugins } from "./fixtures/plugin-callers.js";
import { bindGoalsManagementActions } from "@molis-ai/molis-work-app-local-host";
import { goalApplicationOf } from "./fixtures/goal-application.js";

/**
 * The management door (the CLI and the management MCP) has no caller identity of its own: the Host records
 * the person on this machine and refuses an identity carried in the arguments (repository-anti-corruption §9.5 #6). The structure
 * decision, the event decision and the plugin development run are three more entries of that door.
 */
const IDENTITY_FIELDS = [{ runtime_actor_id: "forged-runtime" }, { actor_id: "someone-else" }, { actor_kind: "runtime" }, { audit_actor_id: "runtime:forged:session" },
  { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }];

async function structureProject(name: string, plugins: readonly PluginDefinition[] = []) {
  const home = await mkdtemp(join(tmpdir(), `management-door-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [...plugins] } });
  const typed = host.client(ref), project_id = project.project_id;
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:writer", audit_actor_id: "runtime:writer:session", actor_kind: "runtime",
    audience: "agent", project_id, permissions: ["goals:read", "goals:write"], runtime_session_id: "session" }));
  const management = new MolisWorkServer("management", null, null, host);
  try {
    await runtime.invoke(goalsActions.create, { goal_id: "draft", title: "整理入口", outcome: "提案先保存，用户决定后生效", idempotency_key: "start" });
    await runV1Cli(["goal-tree-propose", "--db", project.database_path, "--json", JSON.stringify({ project_id, summary: "拆一个子目标", idempotency_key: "propose", root_goal_id: "draft",
      items: [{ item_id: "child", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] })], { localHost: host });
    const proposal = (await runtime.invoke(goalsActions.treeRead, {})).proposals[0]!;
    const decideEntry = async (input: Record<string, unknown>) => JSON.parse(await management.callTool("molis_work_v1_goal_tree_decide",
      { database_path: project.database_path, ...input })) as GoalTreeProposalDecisionResult;
    const decision = (key: string) => ({ project_id, proposal_id: proposal.proposal_id, decisions: [{ item_id: "child", decision: "confirm" as const }], reason: "确认", idempotency_key: key,
      authority: { conversation_ref: "conversation://identity", message_ref: "message://confirm" } });
    const decisions = async () => (await runtime.invoke(goalsActions.treeRead, { proposal_id: proposal.proposal_id })).proposals[0]!.decisions;
    return { home, ref, host, typed, runtime, decideEntry, project_id, proposal, decision, decisions, databasePath: project.database_path,
      done: async () => { await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); } };
  } catch (error) {
    try { await management.close(); }
    finally { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } }
    throw error;
  }
}

// R3-01/R3-02: current owner refusal and protected identity flow through the real MCP door.
test("a structure decision through the management MCP is recorded as the person on this machine, and refuses an identity in its arguments", async () => {
  const { decideEntry, decision, decisions, done } = await structureProject("mcp-identity");
  try {
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(decideEntry({ ...decision("forged"), ...identity }), { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // An identity named inside the authority is not accepted either: the Host fixes who decides.
    for (const authority of [{ actor_id: "someone-else" }, { authority_source: "web" }, { actor_kind: "runtime" }]) {
      await assert.rejects(decideEntry({ ...decision("forged-authority"), authority: { ...decision("forged-authority").authority, ...authority } }),
        { code: "goals.goal_tree_proposal.authority_source_invalid" }, `refuses ${Object.keys(authority).join(" and ")} in the authority`);
    }
    assert.deepEqual(await decisions(), [], "a refused call decides nothing");

    const decided = await decideEntry(decision("decide"));
    assert.deepEqual(decided.applied_item_ids, ["child"]);
    const recorded = await decisions();
    assert.deepEqual(recorded.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, "management", null]],
      "the person on this machine decided through the management door, and no Runtime relayed it");
    assert.equal((await decideEntry(decision("decide"))).replayed, true, "the same key replays");
  } finally { await done(); }
});

test("the management structure decision takes only the conversation it came from: the Host builds the authority, with defaults when none is given", async () => {
  const { decideEntry, project_id, proposal, decision, decisions, done } = await structureProject("evidence");
  try {
    const { authority: _evidence, ...business } = decision("defaults");
    const decided = await decideEntry(business);
    assert.deepEqual(decided.applied_item_ids, ["child"]);
    const [record] = await decisions();
    assert.deepEqual([record!.actor_id, record!.authority_source, record!.runtime_actor_id, record!.conversation_ref, record!.message_ref],
      [LOCAL_PERSON_ACTOR_ID, "management", null, `management:${project_id}`, "management:defaults"], "a decision without evidence points at the management door itself");
    assert.equal(proposal.project_id, project_id);
  } finally { await done(); }
});

test("the CLI's goal-tree-decide and the management MCP's goal_tree_decide refuse a runtime_actor_id or any other identity, and decide nothing", async () => {
  const { host, runtime, decision, decisions, project_id, proposal, databasePath, done } = await structureProject("doors");
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const payload = decision("door");
    const { authority, ...business } = payload;
    const evidence = { conversation_ref: authority.conversation_ref, message_ref: authority.message_ref };
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(() => runV1Cli(["goal-tree-decide", "--db", databasePath, "--json", JSON.stringify({ ...business, authority: evidence, ...identity })], { localHost: host }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the CLI refuses ${Object.keys(identity).join(" and ")}`);
      await assert.rejects(() => management.callTool("molis_work_v1_goal_tree_decide", { ...business, database_path: databasePath, authority: evidence, ...identity }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the management MCP refuses ${Object.keys(identity).join(" and ")}`);
    }
    assert.deepEqual(await decisions(), [], "no refused call decided anything");

    const decided = JSON.parse(await management.callTool("molis_work_v1_goal_tree_decide", { ...business, database_path: databasePath, authority: evidence })) as { applied_item_ids: string[] };
    assert.deepEqual(decided.applied_item_ids, ["child"]);
    assert.deepEqual((await decisions()).map(item => [item.actor_id, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, null]]);
    assert.equal(proposal.project_id, project_id);
    assert.equal((await runtime.invoke(goalsActions.treeRead, { proposal_id: proposal.proposal_id })).proposals[0]!.decisions.length, 1);
  } finally { await management.close(); await done(); }
});

/** The action takes the project from its caller, so its input does not name one. */
const withoutProject = <T extends { project_id: string }>({ project_id: _project, ...input }: T): Omit<T, "project_id"> => input;

/**
 * The event decision is the other decision door of the management entry. It works like the structure decision above: its
 * `authority` points at the conversation, the Host builds who decides (the person on this machine, origin management), and an
 * identity named in the arguments or in the authority is refused instead of read.
 */
async function eventDecisionProject(name: string) {
  const home = await mkdtemp(join(tmpdir(), `management-door-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const project_id = project.project_id, goal_id = "EVENT-DECISION";
  const management = new MolisWorkServer("management", null, null, host);
  const decideEntry = async (input: Record<string, unknown>) => JSON.parse(await management.callTool("molis_work_v1_event_decide",
    { database_path: project.database_path, ...input })) as GoalEventDecisionResult;
  try {
    await managementGoals(host.actionClient(ref), project_id).invoke(goalsActions.create, { goal_id, title: "事件决定", idempotency_key: "create" });
    const cursor = () => host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readState(project_id, goal_id).goal_event_cursor);
    const decide = (key: string) => ({ project_id, goal_id, idempotency_key: key, conclusion: "允许发布当前结果",
      effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } });
    const stored = (governanceId: string) => host.withProject(ref, runtime => goalApplicationOf(runtime).governance.eventDecisions.read(project_id, governanceId));
    return { home, ref, host, decideEntry, project_id, goal_id, cursor, decide, stored, databasePath: project.database_path,
      done: async () => { await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); } };
  } catch (error) {
    try { await management.close(); }
    finally { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } }
    throw error;
  }
}

test("an event decision through the management MCP is recorded as the person on this machine, and refuses an identity in its arguments or its authority", async () => {
  const { decideEntry, host, ref, project_id, cursor, decide, stored, done } = await eventDecisionProject("event-mcp-identity");
  try {
    const before = await cursor();
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(decideEntry({ ...decide("forged"), ...identity }), { code: "mcp.unexpected_field" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // An identity or origin named inside the authority is not accepted either: the Host fixes who decides, as for a structure decision.
    const evidence = { conversation_ref: "conversation://identity", message_ref: "message://confirm" };
    for (const authority of [{ actor_id: "someone-else" }, { actor_id: LOCAL_PERSON_ACTOR_ID }, { actor_kind: "runtime" }, { authority_source: "web" },
      { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", authority_source: "management" }]) {
      await assert.rejects(bindGoalsManagementActions(host.actionClient(ref), ref).invoke(goalsActions.decide, withoutProject(decide("forged-authority")), { ...evidence, ...authority }),
        { code: "goals.event_decision_authority_invalid" });
      await assert.rejects(decideEntry({ ...decide("forged-authority"), authority: { ...evidence, ...authority } }),
        { code: "mcp.unexpected_field" }, `refuses ${Object.keys(authority).join(" and ")} in the authority`);
    }
    assert.equal(await cursor(), before, "a refused call decides nothing");

    const decided = await decideEntry(decide("decide"));
    assert.equal(decided.replayed, false);
    assert.deepEqual([decided.decision.actor_id, decided.decision.authority_source], [LOCAL_PERSON_ACTOR_ID, "management"],
      "the person on this machine decided through the management door");
    const record = await stored(decided.decision.governance_decision_id);
    assert.deepEqual([record?.actor_id, record?.actor_kind, record?.authority_source, record?.conversation_ref, record?.message_ref],
      [LOCAL_PERSON_ACTOR_ID, "user", "management", `management:${project_id}`, "management:decide"], "the MCP fixes the management provenance");
    assert.equal((await decideEntry(decide("decide"))).replayed, true, "the same key replays");
  } finally { await done(); }
});

test("the management event decision takes only the conversation it came from: the Host builds the authority, with defaults when none is given", async () => {
  const { decideEntry, host, ref, project_id, decide, stored, done } = await eventDecisionProject("event-evidence");
  try {
    const plain = await decideEntry(decide("defaults"));
    const record = await stored(plain.decision.governance_decision_id);
    assert.deepEqual([record?.actor_id, record?.authority_source, record?.conversation_ref, record?.message_ref],
      [LOCAL_PERSON_ACTOR_ID, "management", `management:${project_id}`, "management:defaults"], "a decision without evidence points at the management door itself");
    // A reference that is not a usable string falls back to the default, so the stored authority always has both.
    const half = await bindGoalsManagementActions(host.actionClient(ref), ref).invoke(goalsActions.decide, withoutProject(decide("blank")), { conversation_ref: "conversation://half", message_ref: "  " });
    const halfRecord = await stored(half.decision.governance_decision_id);
    assert.deepEqual([halfRecord?.conversation_ref, halfRecord?.message_ref], ["conversation://half", "management:blank"]);
    await assert.rejects(decideEntry({ ...decide("blank"), authority: { conversation_ref: "conversation://half", message_ref: "  " } }), { code: "mcp.unexpected_field" });
  } finally { await done(); }
});

test("the management MCP's event_decide records the person on this machine and has no way to carry an authority", async () => {
  const { host, decideEntry, project_id, goal_id, cursor, decide, stored, databasePath, done } = await eventDecisionProject("event-mcp");
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const before = await cursor();
    const { project_id: _project, goal_id: _goal, ...business } = decide("mcp-decide");
    const call = (extra: Record<string, unknown>) => management.callTool("molis_work_v1_event_decide", { database_path: databasePath, project_id, goal_id, ...business, ...extra });
    // The tool takes the business fields and nothing about who decides: neither an identity nor an authority is an argument of it.
    for (const extra of [{ authority: { conversation_ref: "conversation://mcp" } }, { authority: { actor_id: "someone-else" } }, { actor_id: "someone-else" }, { authority_source: "web" }]) {
      await assert.rejects(() => call(extra), (error: unknown) => (error as { code?: string }).code === "mcp.unexpected_field", `refuses ${Object.keys(extra).join(" and ")}`);
    }
    assert.equal(await cursor(), before, "a refused call decides nothing");
    const decided = JSON.parse(await call({})) as { decision: { actor_id: string; authority_source: string; governance_decision_id: string } };
    assert.deepEqual([decided.decision.actor_id, decided.decision.authority_source], [LOCAL_PERSON_ACTOR_ID, "management"]);
    const record = await stored(decided.decision.governance_decision_id);
    assert.deepEqual([record?.conversation_ref, record?.message_ref], [`management:${project_id}`, "management:mcp-decide"]);
    // A second actual management invocation replays the same decision.
    assert.equal((await decideEntry(decide("mcp-decide"))).replayed, true);
  } finally { await management.close(); await done(); }
});

/** docs/mcp.md says so: `initialize` is the one management tool that does not refuse an identity field, it does not read one. */
test("the management MCP's initialize reads only project_id and idempotency_key: an identity in its arguments is ignored, not read", async () => {
  const home = await mkdtemp(join(tmpdir(), "management-door-initialize-"));
  const databasePath = join(home, "project.db"), project_id = "project/initialize";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const call = async (extra: Record<string, unknown>) => JSON.parse(await management.callTool("molis_work_v1_initialize",
      { database_path: databasePath, project_id, idempotency_key: "init", ...extra })) as { replayed: boolean };
    assert.equal((await call({ actor_id: "someone-else", actor_kind: "runtime" })).replayed, false, "a forged identity does not stop the call");
    // The same operation of the same person replays whatever identity fields ride along: had one been read, it would be someone else's request.
    for (const identity of IDENTITY_FIELDS) assert.equal((await call(identity)).replayed, true, `ignores ${Object.keys(identity).join(" and ")}`);
    const actors = await host.withProject(molisWorkHostProjectReference({ projectId: project_id, databasePath }),
      runtime => runtime.store.db.prepare("SELECT actor_id FROM events WHERE project_id = ? AND type = ?").all(project_id, `${GOALS_PLUGIN_ID}:board.created`) as Array<{ actor_id: string }>);
    assert.deepEqual(actors.map(row => row.actor_id), [LOCAL_PERSON_ACTOR_ID], "the board was created by the person on this machine");
  } finally { await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

/** W3-01 D / W3-07-4-01: the management door is reached through MCP messages too. Its one Goals action leaves a row, and the result says which. */
test("a management tool call is one operation: its single Goals action leaves a row and the result names that operation", async () => {
  const home = await mkdtemp(join(tmpdir(), "management-door-call-id-"));
  const databasePath = join(home, "project.db"), project_id = "project/call-id";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const reply = await management.handleMessage({ id: 1, method: "tools/call", params: { name: "molis_work_v1_initialize",
      arguments: { database_path: databasePath, project_id, idempotency_key: "init-call-id" }, _meta: { "molis-work/callId": "11111111-2222-4333-8444-555555555555" } } }) as { result: { isError: boolean; _meta?: Record<string, unknown> } };
    assert.equal(reply.result.isError, false, JSON.stringify(reply));
    const id = String(reply.result._meta?.["molis-work/callId"]);
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(id, "11111111-2222-4333-8444-555555555555", "a number the client put in `_meta` is not taken");
    const rows = host.callLog!.find(id);
    assert.equal(rows.length, 1, "the operation left exactly one Goals action row");
    assert.equal(rows[0]!.count ?? 1, 1, "the first message settled only once");
    assert.deepEqual(rows.map(row => [row.call_id, row.operation, row.path ?? "action", row.capability_id, row.ok]),
      [[id, "command", "action", "goals.board.initialize", true]]);
  } finally { await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("the management MCP's goal_tree_decide schema names no identity", () => {
  const tool = MCP_TOOLS.find(item => item.name === "molis_work_v1_goal_tree_decide");
  assert.ok(tool, "the management tool is listed");
  const properties = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
  assert.deepEqual(properties.filter(name => ["actor_id", "actor_kind", "audit_actor_id", "runtime_actor_id"].includes(name)), []);
  const authority = (tool.inputSchema as { properties: Record<string, { properties: Record<string, unknown> }> }).properties.authority!.properties;
  assert.deepEqual(Object.keys(authority).sort(), ["conversation_ref", "message_ref", "prompted_proposal_id", "whole_confirmation_prompted"], "the authority points at the conversation; it does not name who decides");
});

/** A plugin that lists these entries under capabilities.consumes would otherwise be recorded as the person, or run unsigned code with the grants it names. */
test("a plugin that lists the plugin development run under consumes is refused", async () => {
  const writer = callerPlugin("doorwriter", "project", {}, [retiredDevelopment.capability_id]);
  const { host, ref, typed, decisions, project_id, done } = await structureProject("plugin", [writer.definition]);
  try {
    await startProjectPlugins(host, ref);
    const entries = [
      { name: "run plugin development", capability: retiredDevelopment,
        input: { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true } as unknown },
    ];
    // W3-07-6-02: the old protocol is absent from the actual Host, including the normal user client.
    for (const { capability, input } of entries) await assert.rejects(typed.invoke(capability, input), { code: "actions.missing" });
    // The plugin's own action client: listing the entry under consumes does not bring it back.
    const sdk = writer.actions(project_id), control = { beforeEffect: async () => {} };
    for (const { name, capability, input } of entries) {
      const available = sdk.availability(capability);
      assert.equal(available.available, false, `${name} is not available to a plugin`);
      assert.equal(!available.available && available.code, "actions.dependency_missing", name);
      await assert.rejects(sdk.invoke(capability, input, control), { code: "actions.dependency_missing" }, `${name}: through the plugin client`);
      const forged = { ...capability, host_only: false };
      await assert.rejects(sdk.invoke(forged, input, control), { code: "actions.dependency_missing" }, `${name}: through an unflagged copy`);
    }
    assert.deepEqual(await decisions(), [], "nothing was decided");
  } finally { await done(); }
});

test("W3-07-6-01 RAC-997: the plugin development run takes no actor: one named in its arguments is refused, and the Host records its own", async () => {
  const { host: ordinary, ref, project_id, done } = await structureProject("development");
  // RAC-997: the door takes a Host made for development (no Home, closed after), never the project's ordinary Host.
  const host = createPrivateDevelopmentHost();
  try {
    await assert.rejects(developInPrivateHost(ordinary, ref, { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true }), { code: "actions.forbidden" },
      "an ordinary Host, with a Home and its projects, does not run unsigned code");
    for (const identity of [{ actor_id: "someone-else" }, { actor_id: LOCAL_PERSON_ACTOR_ID }, { actor_kind: "user" }, { audit_actor_id: "runtime:forged:session" }]) {
      await assert.rejects(developInPrivateHost(host, ref, { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true, ...identity } as never),
        { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // The project is the one the client opened: another project in the arguments is a scope mismatch, checked before the identity.
    await assert.rejects(developInPrivateHost(host, ref, { directory: "/nonexistent", project_id: "foreign", grants: [], allow_unsigned_development: true, actor_id: "someone-else" } as never),
      { code: "actions.scope_mismatch" });
    // Without an identity the call gets as far as the directory it was asked to load: the refusal above came first.
    await assert.rejects(developInPrivateHost(host, ref, { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true }),
      (error: unknown) => (error as { code?: string }).code !== "actions.input_invalid");
  } finally { await host.close(); await done(); }
});

/** Type errors a small caller gets from the built declarations. The test runner strips types, so the types are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./management-door-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => `line ${diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start ?? 0).line + 1 : 0}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
}

test("the decision actions and plugin development input carry no caller identity", { timeout: 180_000 }, () => {
  const source = `
import type { PluginDevelopmentInput } from "@molis-ai/molis-work-contracts/platform/tooling";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
type Input<T> = T extends ActionDefinition<infer I, infer _O> ? I : never;
type Identity = "actor_id" | "actor_kind" | "audit_actor_id" | "runtime_actor_id" | "authority";
type KeysOf<T> = T extends readonly [infer First, ...unknown[]] ? keyof First : keyof T;
type Free<T> = [Extract<KeysOf<T>, Identity>] extends [never] ? true : false;
export const decideFree: Free<Input<typeof goalsActions.treeDecide>> = true;
export const eventDecideFree: Free<Input<typeof goalsActions.decide>> = true;
export const developmentFree: Free<PluginDevelopmentInput> = true;
`;
  assert.deepEqual(typeErrors(source), []);
});
