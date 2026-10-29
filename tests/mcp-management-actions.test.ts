import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock, type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalEventDecisionResult } from "@molis-ai/molis-work-plugin-goals/contract";
import { GOALS_PLUGIN_ID, type GoalTreeProposalDecisionResult, type GoalTreeApplicationApi } from "@molis-ai/molis-work-plugin-goals";
import { dispatchMcpProjectTool, mcpWebUrl, type McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { goalApplicationOf, boardSnapshot } from "./fixtures/goal-application.js";

const PROJECT = "management-actions", FORGED = "11111111-2222-4333-8444-555555555555";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function setup(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "mcp-management-actions-")), databasePath = join(home, "project.db");
  const reference = molisWorkHostProjectReference({ projectId: PROJECT, databasePath });
  const hosts: MolisWorkLocalHost[] = [], servers: LocalMcpServer[] = [], closed: string[] = [];
  t.after(async () => {
    const failures: unknown[] = [];
    for (const resource of [...[...servers].reverse(), ...[...hosts].reverse()]) {
      try { await resource.close(); } catch (error) { failures.push(error); }
    }
    try { await rm(home, { recursive: true, force: true }); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Management MCP test cleanup failed");
  });
  const host = () => {
    const value = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, onRuntimeClose: ref => { closed.push(ref.project_id); } });
    hosts.push(value); return value;
  };
  const server = (host: MolisWorkLocalHost, audience: "runtime" | "management" = "management") => {
    // This embedded management entry names its DB explicitly; no environment Home or catalog connection is consulted.
    const value = new LocalMcpServer(withCatalog, audience, null, {
      runtimeContext: { runtime_id: "management-test", stable_work_context_id: "test", host_declares_stable: true },
    }, host);
    servers.push(value); return value;
  };
  const facts = (host: MolisWorkLocalHost) => host.withProject(reference, runtime => ({
    snapshot: boardSnapshot(runtime.store, PROJECT), events: runtime.store.readEventsDescending(PROJECT),
    proposals: goalApplicationOf(runtime).goalTree.listGoalTreeProposals({ project_id: PROJECT }),
  }));
  const args = (input: Record<string, unknown>) => ({ database_path: databasePath, project_id: PROJECT, ...input });
  return { home, databasePath, reference, host, server, closed, facts, args };
}

async function message(server: LocalMcpServer, name: string, input: Record<string, unknown>): Promise<McpToolResult> {
  const reply = await server.handleMessage({ id: 1, method: "tools/call", params: { name, arguments: input,
    _meta: { "molis-work/callId": FORGED, call_id: FORGED } } }) as { result: McpToolResult };
  return reply.result;
}

const recordCount = (host: MolisWorkLocalHost) => host.callLog!.list(PROJECT).reduce((count, row) => count + (row.count ?? 1), 0);

function oneAction(host: MolisWorkLocalHost, id: unknown, capability: string, ok: boolean, before: number) {
  assert.equal(typeof id, "string"); assert.match(String(id), UUID); assert.notEqual(id, FORGED);
  const rows = host.callLog!.find(String(id));
  assert.equal(rows.length, 1, "a tool message reaches exactly one Goals action, without a typed settlement");
  assert.deepEqual(rows.map(row => [row.path ?? "action", row.capability_id, row.actor_id, row.audience, row.ok]),
    [["action", capability, LOCAL_PERSON_ACTOR_ID, "user", ok]]);
  assert.equal(recordCount(host) - before, 1, "one settlement, including when the log folds a repeated outcome");
  assert.deepEqual(host.callLog!.find(FORGED), [], "the client cannot choose a recorded operation number");
}

async function success<Output>(host: MolisWorkLocalHost, server: LocalMcpServer, name: string, input: Record<string, unknown>, capability: string): Promise<Output> {
  const before = recordCount(host);
  const result = await message(server, name, input);
  assert.equal(result.isError, false, JSON.stringify(result));
  oneAction(host, result._meta?.["molis-work/callId"], capability, true, before);
  return JSON.parse(result.content[0]!.text) as Output;
}

async function propose(host: MolisWorkLocalHost, databasePath: string, input: object) {
  const lines: string[] = [], printing = mock.method(console, "log", (...values: unknown[]) => { lines.push(values.map(String).join(" ")); });
  try {
    assert.equal(await runV1Cli(["goal-tree-propose", "--db", databasePath, "--json", JSON.stringify(input)], { localHost: host }), 0);
    return JSON.parse(lines.at(-1)!) as ReturnType<GoalTreeApplicationApi["submitGoalTreeProposal"]>;
  } finally { printing.mock.restore(); }
}

test("W3-07-4-01 / W3-07-4-02: management MCP shares Goals actions and CLI proposals across a real Host close/restart", async t => {
  const fixture = await setup(t), host = fixture.host(), management = fixture.server(host);
  const initialize = fixture.args({ idempotency_key: 42, actor_id: "forged-runtime", actor_kind: "runtime" });
  const initialized = await success<{ project_id: string; replayed: boolean; observed_event_cursor: number }>(host, management,
    "molis_work_v1_initialize", initialize, "goals.board.initialize");
  assert.deepEqual([initialized.project_id, initialized.replayed], [PROJECT, false]);
  assert.deepEqual(await success(host, management, "molis_work_v1_initialize", initialize, "goals.board.initialize"), { ...initialized, replayed: true });
  const boardFacts = await fixture.facts(host);
  assert.equal(boardFacts.events.find(event => event.type === `${GOALS_PLUGIN_ID}:board.created`)?.actor_id, LOCAL_PERSON_ACTOR_ID);
  const proposalInput = { project_id: PROJECT, summary: "首个目标", idempotency_key: "propose",
    items: [{ item_id: "first", kind: "goal", operation: "create", payload: { goal_id: "first", title: "验证管理入口", outcome: "重启后决定" },
      source_refs: ["conversation://management-actions"], reason: "明确用户要留的结果", confidence: 1 }] };
  const proposed = await propose(host, fixture.databasePath, proposalInput);
  assert.deepEqual([proposed.proposal.submitted_by, proposed.proposal.submitted_session_id], [LOCAL_PERSON_ACTOR_ID, null]);
  const before = await fixture.facts(host);
  assert.deepEqual(before.snapshot.goals, [], "CLI submission alone materializes no Goal");
  await management.close(); await host.close();
  assert.deepEqual(fixture.closed, [PROJECT], "the original project's real runtime closed before a new Host opened it");
  const restarted = fixture.host(), afterRestart = fixture.server(restarted);
  assert.deepEqual(await fixture.facts(restarted), before, "the new Host reads the persisted pending proposal");
  const decision = fixture.args({ proposal_id: proposed.proposal.proposal_id, reason: "确认首个目标", confirm_all_pending: true, idempotency_key: "decide",
    authority: { conversation_ref: "conversation://management-actions", message_ref: "message://confirm", whole_confirmation_prompted: true,
      prompted_proposal_id: proposed.proposal.proposal_id }, web_base_url: "http://127.0.0.1:4173" });
  const decided = await success<GoalTreeProposalDecisionResult>(restarted, afterRestart, "molis_work_v1_goal_tree_decide", decision, "goals.tree.decide");
  assert.deepEqual(decided.applied_item_ids, ["first"]);
  assert.deepEqual(decided.proposal.decisions.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id, item.conversation_ref, item.message_ref]),
    [[LOCAL_PERSON_ACTOR_ID, "management", null, "conversation://management-actions", "message://confirm"]]);
  const after = await fixture.facts(restarted);
  assert.deepEqual(after.snapshot.goals.map(goal => goal.goal_id), ["first"]);
  assert.deepEqual(await success(restarted, afterRestart, "molis_work_v1_goal_tree_decide", decision, "goals.tree.decide"), { ...decided, replayed: true });
  assert.deepEqual(await fixture.facts(restarted), after, "replay saves no second decision or Goal");
  const next = await propose(restarted, fixture.databasePath, { ...proposalInput, idempotency_key: "propose-defaults",
    items: [{ ...proposalInput.items[0], item_id: "default", payload: { goal_id: "default", title: "默认出处" } }] });
  const plainInput = fixture.args({ proposal_id: next.proposal.proposal_id, decisions: [{ item_id: "default", decision: "confirm" }],
    reason: "逐项确认", idempotency_key: "tree-defaults" });
  const plain = await success<GoalTreeProposalDecisionResult>(restarted, afterRestart, "molis_work_v1_goal_tree_decide", plainInput, "goals.tree.decide");
  assert.deepEqual(plain.proposal.decisions.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id, item.conversation_ref, item.message_ref]),
    [[LOCAL_PERSON_ACTOR_ID, "management", null, `management:${PROJECT}`, "management:tree-defaults"]]);
  const event = fixture.args({ goal_id: "first", idempotency_key: 7, conclusion: 9, effects: [{ kind: "authorize_action", action: "publish" }], scope: { action: "publish" } });
  const recorded = await success<GoalEventDecisionResult>(restarted, afterRestart, "molis_work_v1_event_decide", event, "goals.decisions.record");
  assert.deepEqual([recorded.recorded, recorded.replayed, recorded.decision.actor_id, recorded.decision.authority_source], [true, false, LOCAL_PERSON_ACTOR_ID, "management"]);
  const stored = await restarted.withProject(fixture.reference, runtime => goalApplicationOf(runtime).governance.eventDecisions.read(PROJECT, recorded.decision.governance_decision_id));
  assert.deepEqual([stored?.actor_id, stored?.actor_kind, stored?.authority_source, stored?.conversation_ref, stored?.message_ref],
    [LOCAL_PERSON_ACTOR_ID, "user", "management", `management:${PROJECT}`, "management:7"]);
  const afterEvent = await fixture.facts(restarted);
  assert.deepEqual(await success(restarted, afterRestart, "molis_work_v1_event_decide", event, "goals.decisions.record"), { ...recorded, replayed: true });
  assert.deepEqual(await fixture.facts(restarted), afterEvent, "event replay saves no second owner fact");
});

test("W3-07-4-01 / W3-07-4-02: pre-action refusals have no number or row; each action-layer refusal has one real Goals row and changes no facts", async t => {
  const fixture = await setup(t), host = fixture.host(), management = fixture.server(host), runtime = fixture.server(host, "runtime");
  await success(host, management, "molis_work_v1_initialize", fixture.args({ idempotency_key: "initialize" }), "goals.board.initialize");
  const before = await fixture.facts(host);
  const refusal = async (server: LocalMcpServer, name: string, input: Record<string, unknown>, code: string, action?: string) => {
    const rows = host.callLog!.list(PROJECT), count = recordCount(host), result = await message(server, name, fixture.args(input));
    assert.equal(result.isError, true, JSON.stringify(result)); assert.equal(result._meta?.["molis-work/callId"], undefined);
    const body = JSON.parse(result.content[0]!.text) as { code: string; call_id?: string; details?: { fields?: string[] } };
    assert.equal(body.code, code);
    if (action) { oneAction(host, body.call_id, action, false, count); assert.equal(host.callLog!.find(body.call_id!)[0]!.refused, true); }
    else { assert.equal(body.call_id, undefined); assert.deepEqual(host.callLog!.list(PROJECT), rows); }
    assert.deepEqual(host.callLog!.find(FORGED), []);
    assert.deepEqual(await fixture.facts(host), before, "refusal saves no Goal, event or governance decision");
    return body;
  };
  for (const name of ["molis_work_v1_initialize", "molis_work_v1_event_decide", "molis_work_v1_goal_tree_decide"]) {
    await refusal(runtime, name, {}, "mcp.authority_denied");
  }
  const event = { goal_id: "absent", conclusion: "确认", idempotency_key: "event" };
  for (const extra of [{ actor_id: "forged" }, { authority: { conversation_ref: "conversation://forged" } }]) {
    const body = await refusal(management, "molis_work_v1_event_decide", { ...event, ...extra }, "mcp.unexpected_field");
    assert.deepEqual(body.details?.fields, Object.keys(extra), "the original unexpected-field detail is retained");
  }
  await refusal(management, "molis_work_v1_goal_tree_decide", { proposal_id: "absent", idempotency_key: "tree", runtime_actor_id: "forged" }, "actions.input_invalid");
  await refusal(management, "molis_work_v1_goal_tree_decide", { proposal_id: "absent", idempotency_key: "tree", authority: { actor_id: "forged" } }, "goals.goal_tree_proposal.authority_source_invalid");
  await refusal(management, "molis_work_v1_initialize", { idempotency_key: "" }, "actions.input_invalid", "goals.board.initialize");
  await refusal(management, "molis_work_v1_event_decide", { ...event, conclusion: "" }, "actions.input_invalid", "goals.decisions.record");
  await refusal(management, "molis_work_v1_goal_tree_decide", { proposal_id: "absent", idempotency_key: "tree", confirm_all_pending: "yes" }, "actions.input_invalid", "goals.tree.decide");
});


test("R-MCP-OWNER-01: MCP presentation and Runtime approval refusals keep their message, transport status and zero dispatch", async () => {
  const createError = (code: string, message: string, details?: Record<string, unknown>) => new ActionError(code, message, { details });
  assert.throws(() => mcpWebUrl("/projects/example", "invalid-base", createError), error => {
    assert.ok(error instanceof ActionError);
    assert.equal(error.code, "mcp.url_invalid");
    assert.equal(error.message, "无效的 Molis Work Web 地址: invalid-base");
    assert.equal(actionHttpStatus(error), 400);
    return true;
  });
  assert.equal(mcpWebUrl("/projects/example", "http://127.0.0.1:4173", createError), "http://127.0.0.1:4173/projects/example");
  let invoked = 0;
  await assert.rejects(dispatchMcpProjectTool({ project_id: "example", fields: () => [], invoke: async () => { invoked++; throw new Error("must not dispatch"); } },
    "molis_work_v1_goal_tree_decide", { project_id: "example" }, { audience: "runtime", createError }), error => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "mcp.runtime_decide_unsupported");
      assert.equal(error.message, "Runtime 不能写入 Goal Tree 决定。请让用户在 Web 或管理入口批准已保存的提案。");
      assert.equal(actionHttpStatus(error), 400);
      return true;
    });
  assert.equal(invoked, 0);
});
