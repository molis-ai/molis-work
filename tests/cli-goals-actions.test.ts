import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { managementCaller, managementGoals } from "./goal-management-caller.js";

// N-12 / W3-07: the CLI is a management entry. A `molis-work v1` command calls one Goals action as the person on this machine
// (origin management); it does not go through a typed Host capability that calls the action a second time.

const PROJECT = "cli-goals-actions";

/** A Home-backed Host that also keeps every caller the Host's action client was handed, so a test can read who a command acted as. */
class WatchedHost extends MolisWorkLocalHost {
  readonly callers: Array<{ capability_id: string; caller: ActionCallContext; prepared: boolean }> = [];
  override actionClient(reference: Parameters<MolisWorkLocalHost["actionClient"]>[0], preparePlugins = true) {
    const real = super.actionClient(reference, preparePlugins);
    return { ...real, invoke: (caller: ActionCallContext, action: Parameters<typeof real.invoke>[1], input: unknown) => {
      this.callers.push({ capability_id: action.capability_id, caller, prepared: preparePlugins });
      return real.invoke(caller, action, input);
    } } as typeof real;
  }
  /** The management callers made for one capability since `callers` was last emptied. */
  managed(capabilityId: string) {
    return this.callers.filter(entry => entry.capability_id === capabilityId && entry.caller.user_action?.source === "management").map(entry => entry.caller);
  }
  /** Whether any client a management call went through prepared the project's Runtime plugins first. */
  preparedManagementCalls() {
    return this.callers.filter(entry => entry.caller.user_action?.source === "management" && entry.prepared).map(entry => entry.capability_id);
  }
}

interface Settled { capability_id: string; operation: string; actor_id: string; audience: string | undefined; ok: boolean; call_id: string }

/** Every call this Home settles, with the number of the operation it belonged to. */
function watchCalls(host: WatchedHost): Settled[] {
  const seen: Settled[] = [];
  const log = host.callLog!;
  const record = log.record.bind(log);
  log.record = (caller, action, outcome) => {
    seen.push({ capability_id: action.capability_id, operation: action.operation,
      actor_id: caller.actor_id, audience: caller.audience, ok: outcome.ok, call_id: caller.call_id });
    record(caller, action, outcome);
  };
  return seen;
}

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "cli-goals-actions-"));
  const host = new WatchedHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "cli", "project.db");
  const reference = molisWorkHostProjectReference({ databasePath, projectId: PROJECT });
  /** Runs one command and returns what it printed, as JSON. */
  const cli = async <Printed = unknown>(operation: string, input: object = { project_id: PROJECT }, ...extra: string[]): Promise<Printed> => {
    const lines: string[] = [];
    const printing = mock.method(console, "log", (...values: unknown[]) => { lines.push(values.map(String).join(" ")); });
    try {
      assert.equal(await runV1Cli([operation, "--db", databasePath, "--json", JSON.stringify(input), ...extra], { localHost: host }), 0);
      return JSON.parse(lines.at(-1)!) as Printed;
    } finally { printing.mock.restore(); }
  };
  const person = managementGoals(host.actionClient(reference, false), PROJECT);
  return { home, host, reference, cli, person, calls: watchCalls(host),
    done: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

const proposal = (key: string) => ({ project_id: PROJECT, root_goal_id: "root", summary: "新增一个子目标", idempotency_key: key,
  items: [{ item_id: "child", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "结果" },
    source_refs: ["conversation://cli"], reason: "需要", confidence: 1, affected_objects: [{ object_type: "goal", object_id: "child" }] }] });
interface Proposed { proposal: { proposal_id: string } }
interface Listed { proposals: Array<{ decisions: Array<{ actor_id: string; authority_source: string; conversation_ref: string; message_ref: string }> }> }
const evidence = { conversation_ref: "conversation://cli", message_ref: "message://confirm" };

test("each CLI command is one Goals action call as the person on this machine: one row, its own call number, nothing beside it", async () => {
  const { host, cli, person, calls, done } = await setup();
  try {
    const rows: Array<[string, Settled]> = [];
    const run = async (operation: string, expected: string, input?: object) => {
      calls.length = 0;
      const output = await cli(operation, input);
      assert.equal(calls.length, 1, `${operation} leaves one settlement: ${JSON.stringify(calls.map(row => row.capability_id))}`);
      assert.equal(calls[0]!.capability_id, expected, operation);
      rows.push([operation, calls[0]!]);
      return output;
    };
    await run("init", goalsActions.initialize.capability_id, { project_id: PROJECT, idempotency_key: "init" });
    await person.invoke(goalsActions.create, { goal_id: "root", title: "根目标", outcome: "可以由命令行继续", idempotency_key: "root" });
    await run("snapshot", goalsActions.snapshot.capability_id);
    await run("active-goal", goalsActions.active.capability_id, { project_id: PROJECT, goal_id: "root", reason: "当前工作", idempotency_key: "active" });
    const proposed = await run("goal-tree-propose", goalsActions.treeSubmit.capability_id, proposal("propose")) as Proposed;
    const proposalId = proposed.proposal.proposal_id;
    await run("goal-tree-read", goalsActions.treeRead.capability_id, { project_id: PROJECT, proposal_id: proposalId });
    await run("goal-tree-check", goalsActions.treeCheck.capability_id, { project_id: PROJECT, proposal_id: proposalId, idempotency_key: "check" });
    await run("goal-tree-decide", goalsActions.treeDecide.capability_id, { project_id: PROJECT, proposal_id: proposalId, decisions: [{ item_id: "child", decision: "confirm" }],
      reason: "确认", idempotency_key: "decide", authority: evidence });

    for (const [operation, row] of rows) {
      assert.deepEqual([row.actor_id, row.audience, row.ok], [LOCAL_PERSON_ACTOR_ID, "user", true], `${operation}: the Goals action, as the person`);
      assert.ok(row.call_id, `${operation} has a call number`);
    }
    assert.equal(new Set(rows.map(([, row]) => row.call_id)).size, rows.length, "each command is its own operation");
    const kept = host.callLog!.list(PROJECT);
    assert.deepEqual(kept.map(row => row.capability_id).sort(), [goalsActions.initialize, goalsActions.create, goalsActions.active, goalsActions.treeSubmit, goalsActions.treeCheck, goalsActions.treeDecide]
      .map(definition => definition.capability_id).sort(), "the call log keeps the commands that ran, once each");
  } finally { await done(); }
});

test("the CLI acts as the caller the management test helper builds, and keeps the stored provenance format", async () => {
  const { host, cli, person, done } = await setup();
  try {
    const pick = (caller: ActionCallContext) => JSON.parse(JSON.stringify({ actor_id: caller.actor_id, actor_kind: caller.actor_kind, audience: caller.audience,
      project_id: caller.project_id, user_action: caller.user_action }));
    host.callers.length = 0;
    await cli("init", { project_id: PROJECT, idempotency_key: "init" });
    const managed = host.managed(goalsActions.initialize.capability_id);
    assert.equal(managed.length, 1, "init reaches the Host's action client once, as a management caller (not through a typed capability)");
    const initialize = managed[0]!;
    assert.deepEqual(pick(initialize), pick(managementCaller(PROJECT, "init")), "init: the same actor, kind, audience, source and reference format as the helper");
    assert.deepEqual(host.preparedManagementCalls(), [], "a command starts none of the project's Runtime plugins: Goals is registered when the project opens");
    assert.deepEqual([initialize.permissions, initialize.allowed_actions], [goalsActions.initialize.action.permissions,
      [{ capability_id: goalsActions.initialize.capability_id, version: goalsActions.initialize.version, provider_id: GOALS_PLUGIN_ID }]], "only that one action, with its own permissions");

    await person.invoke(goalsActions.create, { goal_id: "root", title: "根目标", outcome: "可以由命令行继续", idempotency_key: "root" });
    host.callers.length = 0;
    await cli("active-goal", { project_id: PROJECT, goal_id: "root", reason: "当前工作", idempotency_key: "active" });
    assert.deepEqual(host.managed(goalsActions.active.capability_id).map(pick), [pick(managementCaller(PROJECT, "active"))], "active-goal: as the helper");

    const proposed = await cli<Proposed>("goal-tree-propose", proposal("propose"));
    const proposalId = proposed.proposal.proposal_id;
    host.callers.length = 0;
    await cli("goal-tree-decide", { project_id: PROJECT, proposal_id: proposalId, reason: "确认", idempotency_key: "decide",
      confirm_all_pending: true, authority: { ...evidence, whole_confirmation_prompted: true, prompted_proposal_id: proposalId } });
    assert.deepEqual(host.managed(goalsActions.treeDecide.capability_id).map(caller => pick(caller).user_action), [{ source: "management", ...evidence,
      whole_confirmation_prompted: true, prompted_subject_id: proposalId }], "a decision points at the conversation it came from, and says the whole proposal was shown");

    const [decided] = (await cli<Listed>("goal-tree-read", { project_id: PROJECT, proposal_id: proposalId })).proposals[0]!.decisions;
    assert.deepEqual([decided!.actor_id, decided!.authority_source, decided!.conversation_ref, decided!.message_ref], [LOCAL_PERSON_ACTOR_ID, "management", evidence.conversation_ref, evidence.message_ref]);

    // Without evidence the decision points at the management entry itself, in the format it has always recorded.
    const second = (await cli<Proposed>("goal-tree-propose", { ...proposal("propose-2"), items: [{ ...proposal("x").items[0], item_id: "other", payload: { goal_id: "other", title: "另一个", outcome: "结果" },
      affected_objects: [{ object_type: "goal", object_id: "other" }] }] })).proposal.proposal_id;
    await cli("goal-tree-decide", { project_id: PROJECT, proposal_id: second, decisions: [{ item_id: "other", decision: "confirm" }], reason: "确认", idempotency_key: "decide-2" });
    const [stored] = (await cli<Listed>("goal-tree-read", { project_id: PROJECT, proposal_id: second })).proposals[0]!.decisions;
    assert.deepEqual([stored!.actor_id, stored!.authority_source, stored!.conversation_ref, stored!.message_ref], [LOCAL_PERSON_ACTOR_ID, "management", `management:${PROJECT}`, "management-tree-decision:decide-2"]);
  } finally { await done(); }
});

test("the CLI keeps its wire: the payload's project must be the bound one, init picks its fields, and identity is refused with the same codes and words", async () => {
  const { cli, person, done } = await setup();
  try {
    // PLIB-15 (S8): init picks project_id and idempotency_key; a title in the payload, which the board no longer has, is one more field it does not read.
    const first = await cli<{ project_id: string }>("init", { project_id: PROJECT, idempotency_key: "init", title: "没有地方存的名字", actor_id: "someone-else", extra: "ignored" });
    assert.equal(first.project_id, PROJECT);
    await person.invoke(goalsActions.create, { goal_id: "root", title: "根目标", outcome: "可以由命令行继续", idempotency_key: "root" });
    const before = await cli<{ board: Record<string, unknown> }>("snapshot");
    assert.equal("title" in before.board, false, "and the snapshot's board carries no name");

    // A payload that does not carry the project this command is bound to (here by --project-id) is refused, and nothing is written.
    const { project_id: _bound, ...proposed0 } = proposal("k");
    for (const [operation, input] of [["init", { idempotency_key: "k" }], ["snapshot", {}], ["active-goal", { goal_id: "root", reason: "r", idempotency_key: "k" }],
      ["goal-tree-propose", proposed0], ["goal-tree-read", {}], ["goal-tree-check", { proposal_id: "p", idempotency_key: "k" }],
      ["goal-tree-decide", { proposal_id: "p", idempotency_key: "k" }]] as const) {
      await assert.rejects(cli(operation, input, "--project-id", PROJECT), { code: "actions.scope_mismatch" }, `${operation} without the bound project`);
    }
    assert.deepEqual(await cli("snapshot"), before, "a refused command writes nothing");

    const proposed = await cli<Proposed>("goal-tree-propose", proposal("propose"));
    const proposalId = proposed.proposal.proposal_id;
    // An identity in the arguments of a write is refused in the words the typed door always used, naming the field; what the contract
    // alone does not know (an unknown field, or an identity on a read) is refused by the contract, as it was.
    const hostSays = (...fields: string[]) => ({ code: "actions.input_invalid", message: new RegExp(`^写入者由宿主确定（管理入口是本机这个人，插件取自调用上下文），参数里不能带 ${fields.join("、")}$`) });
    const contractSays = { code: "actions.input_invalid", message: /^输入不符合能力合同：/ };
    const check = { project_id: PROJECT, proposal_id: proposalId, idempotency_key: "check" };
    for (const [name, field] of [["actor_id", { actor_id: "someone-else" }], ["actor_kind", { actor_kind: "runtime" }]] as const) {
      await assert.rejects(cli("goal-tree-propose", { ...proposal("forged"), ...field }), hostSays(name), `propose refuses ${name}`);
      await assert.rejects(cli("goal-tree-check", { ...check, ...field }), hostSays(name), `check refuses ${name}`);
      await assert.rejects(cli("goal-tree-read", { project_id: PROJECT, ...field }), contractSays, `read refuses ${name}, by its contract`);
    }
    await assert.rejects(cli("goal-tree-propose", { ...proposal("forged"), submitted_session_id: "forged-session" }), hostSays("submitted_session_id"), "propose names no Runtime Session");
    for (const field of [{ submitted_session_id: "forged-session" }, { unknown_field: 1 }]) {
      await assert.rejects(cli("goal-tree-check", { ...check, ...field }), contractSays, `check refuses ${Object.keys(field)}, by its contract`);
      await assert.rejects(cli("goal-tree-read", { project_id: PROJECT, ...field }), contractSays, `read refuses ${Object.keys(field)}, by its contract`);
    }
    await assert.rejects(cli("goal-tree-propose", { ...proposal("forged"), unknown_field: 1 }), contractSays, "propose refuses an unknown field, by its contract");
    const decide = { project_id: PROJECT, proposal_id: proposalId, decisions: [{ item_id: "child", decision: "confirm" }], reason: "确认", idempotency_key: "decide" };
    for (const [names, identity] of [[["runtime_actor_id"], { runtime_actor_id: "forged" }], [["audit_actor_id"], { audit_actor_id: "runtime:forged:session" }],
      [["actor_id", "actor_kind"], { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]] as const) {
      await assert.rejects(cli("goal-tree-decide", { ...decide, authority: evidence, ...identity }), hostSays(...names), `decide refuses ${names}`);
      // The arguments are looked at before the authority the decision points at, so both carrying an identity is the arguments' refusal.
      await assert.rejects(cli("goal-tree-decide", { ...decide, authority: { ...evidence, actor_id: "someone-else" }, ...identity }), hostSays(...names), `decide refuses ${names} before the authority`);
    }
    await assert.rejects(cli("goal-tree-decide", { ...decide, unknown_field: 1, authority: evidence }), contractSays, "decide refuses an unknown field, by its contract");
    for (const named of [{ actor_id: "someone-else" }, { authority_source: "web" }, { actor_kind: "runtime" }]) {
      await assert.rejects(cli("goal-tree-decide", { ...decide, authority: { ...evidence, ...named } }), { code: "goals.goal_tree_proposal.authority_source_invalid" }, `decide refuses ${Object.keys(named)} in the authority`);
    }
    assert.deepEqual((await cli<Listed>("goal-tree-read", { project_id: PROJECT, proposal_id: proposalId })).proposals[0]!.decisions, [], "nothing was decided");
  } finally { await done(); }
});
