import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { MolisWorkServer, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MCP_TOOLS, MolisWorkLocalHost, molisWorkHostProjectReference, createPrivateDevelopmentHost, developInPrivateHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import type { GoalEventDecisionResult } from "@molis-ai/molis-work-plugin-goals/contract";
import { goalsActions, GOALS_PLUGIN_ID, type GoalTreeProposalDecisionResult } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
/** The retired development entry as an old caller still holding the literal would pass it: no action behind it. */
const retiredDevelopment = { capability_id: "io.molis.work.local-host.plugin.development", version: 1, operation: "command" } as ActionDefinition<unknown, unknown>;
import { managementGoals } from "./goal-management-caller.js";
import { callerPlugin, startProjectPlugins } from "./fixtures/plugin-callers.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";
import { mcpGoalReviews } from "./fixtures/project-review-entry.js";

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
    // The person submits it as the management caller (the CLI's `goal-tree-propose` was removed, PEQ-15).
    await managementGoals(host.actionClient(ref), project_id).invoke(goalsActions.treeSubmit, { summary: "拆一个子目标", idempotency_key: "propose", root_goal_id: "draft",
      items: [{ item_id: "child", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] } as never);
    const proposal = (await runtime.invoke(goalsActions.treeRead, {})).proposals[0]!;
    const reviews = mcpGoalReviews(management, project_id, project.database_path);
    const decideEntry = (input: TrustedReviewCommand) => reviews.submit<GoalTreeProposalDecisionResult>(input);
    const decision = (key: string) => reviews.prepare(goalsActions.treeDecide, { proposal_id: proposal.proposal_id,
      decisions: [{ item_id: "child", decision: "confirm" as const }], reason: "确认", idempotency_key: key });
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
    const command = await decision("decide");
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(decideEntry({ ...command, ...identity }), { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // An identity named inside the authority is not accepted either: the Host fixes who decides.
    for (const authority of [{ actor_id: "someone-else" }, { authority_source: "web" }, { actor_kind: "runtime" }]) {
      await assert.rejects(decideEntry({ ...command, authority } as TrustedReviewCommand),
        { code: "actions.input_invalid" }, `refuses ${Object.keys(authority).join(" and ")} in the authority`);
    }
    assert.deepEqual(await decisions(), [], "a refused call decides nothing");

    const decided = await decideEntry(command);
    assert.deepEqual(decided.result?.applied_item_ids, ["child"]);
    const recorded = await decisions();
    assert.deepEqual(recorded.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, "management", null]],
      "the person on this machine decided through the management door, and no Runtime relayed it");
    assert.deepEqual(await decideEntry(command), { record: decided.record, replayed: true }, "the same key replays");
  } finally { await done(); }
});

test("the Host records the real management operation as the source of the structure decision", async () => {
  const { decideEntry, project_id, proposal, decision, decisions, done } = await structureProject("evidence");
  try {
    const decided = await decideEntry(await decision("defaults"));
    assert.deepEqual(decided.result?.applied_item_ids, ["child"]);
    const [record] = await decisions();
    assert.match(decided.record.source.entry.message_ref, /^management:[0-9a-f-]+$/u);
    assert.deepEqual([record!.actor_id, record!.authority_source, record!.runtime_actor_id, record!.conversation_ref, record!.message_ref],
      [LOCAL_PERSON_ACTOR_ID, "management", null, `management:${project_id}`, decided.record.source.entry.message_ref]);
    assert.equal(proposal.project_id, project_id);
  } finally { await done(); }
});

test("the common CLI and management MCP refuse a supplied identity before recording any decision", async () => {
  const { host, runtime, decision, decisions, project_id, proposal, databasePath, done } = await structureProject("doors");
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const command = await decision("door");
    const business = { ...command, project_id };
    const evidence = { conversation_ref: "conversation://identity", message_ref: "message://confirm" };
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(() => runV1Cli(["review-decide", "--db", databasePath, "--json", JSON.stringify({ ...business, ...identity })], { localHost: host }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the CLI refuses ${Object.keys(identity).join(" and ")}`);
      await assert.rejects(() => management.callTool("molis_work_v1_review_decide", { ...business, database_path: databasePath, ...identity }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the management MCP refuses ${Object.keys(identity).join(" and ")}`);
    }
    assert.deepEqual(await decisions(), [], "no refused call decided anything");

    await assert.rejects(() => management.callTool("molis_work_v1_review_decide", { ...business, database_path: databasePath, authority: evidence }), { code: "actions.input_invalid" });
    const decided = await mcpGoalReviews(management, project_id, databasePath).submit<GoalTreeProposalDecisionResult>(command);
    assert.deepEqual(decided.result?.applied_item_ids, ["child"]);
    assert.deepEqual((await decisions()).map(item => [item.actor_id, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, null]]);
    assert.equal(proposal.project_id, project_id);
    assert.equal((await runtime.invoke(goalsActions.treeRead, { proposal_id: proposal.proposal_id })).proposals[0]!.decisions.length, 1);
  } finally { await management.close(); await done(); }
});

/** An event review uses the same Host-authenticated door as a structure review. */
async function eventDecisionProject(name: string) {
  const home = await mkdtemp(join(tmpdir(), `management-door-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const project_id = project.project_id, goal_id = "EVENT-DECISION";
  const management = new MolisWorkServer("management", null, null, host);
  const reviews = mcpGoalReviews(management, project_id, project.database_path);
  const decideEntry = (input: TrustedReviewCommand) => reviews.submit<GoalEventDecisionResult>(input);
  try {
    await managementGoals(host.actionClient(ref), project_id).invoke(goalsActions.create, { goal_id, title: "事件决定", idempotency_key: "create" });
    const cursor = () => host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readState(project_id, goal_id).goal_event_cursor);
    const decide = (key: string) => reviews.prepare(goalsActions.decide, { goal_id, idempotency_key: key, conclusion: "允许发布当前结果",
      effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } });
    const stored = (governanceId: string) => host.withProject(ref, runtime => projectReviewDecisions(runtime.store.db, project_id).read(governanceId));
    return { home, ref, host, decideEntry, project_id, goal_id, cursor, decide, stored, databasePath: project.database_path,
      done: async () => { await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); } };
  } catch (error) {
    try { await management.close(); }
    finally { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } }
    throw error;
  }
}

test("an event decision through the management MCP is recorded as the person on this machine, and refuses an identity in its arguments or its authority", async () => {
  const { decideEntry, project_id, cursor, decide, stored, done } = await eventDecisionProject("event-mcp-identity");
  try {
    const before = await cursor();
    const command = await decide("decide");
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(decideEntry({ ...command, ...identity }), { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // An identity or origin named inside the authority is not accepted either: the Host fixes who decides, as for a structure decision.
    const evidence = { conversation_ref: "conversation://identity", message_ref: "message://confirm" };
    for (const authority of [{ actor_id: "someone-else" }, { actor_id: LOCAL_PERSON_ACTOR_ID }, { actor_kind: "runtime" }, { authority_source: "web" },
      { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", authority_source: "management" }]) {
      await assert.rejects(decideEntry({ ...command, authority: { ...evidence, ...authority } } as TrustedReviewCommand),
        { code: "actions.input_invalid" }, `refuses ${Object.keys(authority).join(" and ")} in the authority`);
    }
    assert.equal(await cursor(), before, "a refused call decides nothing");

    const decided = await decideEntry(command);
    assert.equal(decided.replayed, false);
    assert.deepEqual([decided.result?.decision.actor_id, decided.result?.decision.authority_source], [LOCAL_PERSON_ACTOR_ID, "management"],
      "the person on this machine decided through the management door");
    assert.deepEqual(await stored(decided.result!.decision.governance_decision_id), decided.record);
    assert.deepEqual([decided.record.actor_id, decided.record.source.kind, decided.record.source.entry.source, decided.record.source.entry.conversation_ref],
      [LOCAL_PERSON_ACTOR_ID, "person", "management", `management:${project_id}`]);
    assert.deepEqual(await decideEntry(command), { record: decided.record, replayed: true });
  } finally { await done(); }
});

test("a partial source locator cannot replace the original management operation", async () => {
  const { decideEntry, project_id, decide, stored, done } = await eventDecisionProject("event-evidence");
  try {
    const command = await decide("defaults");
    await assert.rejects(decideEntry({ ...command, authority: { conversation_ref: "conversation://half", message_ref: "  " } } as TrustedReviewCommand), { code: "actions.input_invalid" });
    const plain = await decideEntry(command);
    assert.deepEqual(await stored(plain.result!.decision.governance_decision_id), plain.record);
    assert.equal(plain.record.source.entry.conversation_ref, `management:${project_id}`);
    assert.match(plain.record.source.entry.message_ref, /^management:[0-9a-f-]+$/u);
  } finally { await done(); }
});

test("a second management MCP connection reads and retries the same decision through its original reference", async () => {
  const { host, decideEntry, project_id, cursor, decide, stored, databasePath, done } = await eventDecisionProject("event-mcp");
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const before = await cursor();
    const command = await decide("mcp-decide");
    const call = (extra: Record<string, unknown>) => management.callTool("molis_work_v1_review_decide", { database_path: databasePath, project_id, ...command, ...extra });
    // The tool takes the business fields and nothing about who decides: neither an identity nor an authority is an argument of it.
    for (const extra of [{ authority: { conversation_ref: "conversation://mcp" } }, { authority: { actor_id: "someone-else" } }, { actor_id: "someone-else" }, { authority_source: "web" }]) {
      await assert.rejects(() => call(extra), { code: "actions.input_invalid" }, `refuses ${Object.keys(extra).join(" and ")}`);
    }
    assert.equal(await cursor(), before, "a refused call decides nothing");
    const reviews = mcpGoalReviews(management, project_id, databasePath);
    const decided = await reviews.submit<GoalEventDecisionResult>(command);
    assert.deepEqual([decided.result?.decision.actor_id, decided.result?.decision.authority_source], [LOCAL_PERSON_ACTOR_ID, "management"]);
    assert.deepEqual(await stored(decided.result!.decision.governance_decision_id), decided.record);
    assert.equal((await reviews.read({ reference: command.reference })).decision?.decision_id, decided.record.decision_id);
    assert.deepEqual(await decideEntry(command), { record: decided.record, replayed: true });
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

test("the management MCP's common decision schema names no identity or claimed source", () => {
  const tool = MCP_TOOLS.find(item => item.name === "molis_work_v1_review_decide");
  assert.ok(tool, "the management tool is listed");
  const properties = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
  assert.deepEqual(properties.sort(), ["choice_id", "database_path", "note", "project_id", "reference", "request_key"]);
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
