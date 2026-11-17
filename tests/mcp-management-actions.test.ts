import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock, type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalEventDecisionResult } from "@molis-ai/molis-work-plugin-goals/contract";
import { GOALS_PLUGIN_ID, goalsActions, type GoalTreeProposalDecisionResult, type GoalTreeApplicationApi } from "@molis-ai/molis-work-plugin-goals";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { dispatchMcpProjectTool, mcpWebUrl, type McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { goalApplicationOf, boardSnapshot } from "./fixtures/goal-application.js";
import { mcpGoalReviews, prepareGoalReview } from "./fixtures/project-review-entry.js";

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
  assert.equal(rows.length, 1, "a tool message identifies one original Goals command and no typed settlement");
  assert.deepEqual(rows.map(row => [row.path ?? "action", row.capability_id, row.actor_id, row.audience, row.ok]),
    [["action", capability, LOCAL_PERSON_ACTOR_ID, "user", ok]]);
  assert.equal(recordCount(host) - before, 1, "one command settlement, including when the log folds a repeated outcome");
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
  const reviews = mcpGoalReviews(afterRestart, PROJECT, fixture.databasePath);
  const decision = await reviews.prepare(goalsActions.treeDecide, { proposal_id: proposed.proposal.proposal_id, reason: "确认首个目标",
    confirm_all_pending: true, idempotency_key: "decide" });
  const decided = await success<{ record: ProjectTrustedDecision; result: GoalTreeProposalDecisionResult }>(restarted, afterRestart,
    "molis_work_v1_review_decide", fixture.args(decision), "goals.tree.decide");
  assert.deepEqual(decided.result.applied_item_ids, ["first"]);
  const act = decided.record.source.entry;
  assert.equal(act.conversation_ref, `management:${PROJECT}`);
  assert.match(act.message_ref, /^management:[0-9a-f-]+$/u);
  assert.deepEqual(decided.result.proposal.decisions.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id, item.conversation_ref, item.message_ref]),
    [[LOCAL_PERSON_ACTOR_ID, "management", null, act.conversation_ref, act.message_ref]]);
  const after = await fixture.facts(restarted);
  assert.deepEqual(after.snapshot.goals.map(goal => goal.goal_id), ["first"]);
  assert.deepEqual(await reviews.submit(decision), { record: decided.record, replayed: true });
  assert.deepEqual(await fixture.facts(restarted), after, "replay saves no second decision or Goal");
  const next = await propose(restarted, fixture.databasePath, { ...proposalInput, idempotency_key: "propose-defaults",
    items: [{ ...proposalInput.items[0], item_id: "default", payload: { goal_id: "default", title: "默认出处" } }] });
  const plainInput = await reviews.prepare(goalsActions.treeDecide, { proposal_id: next.proposal.proposal_id, decisions: [{ item_id: "default", decision: "confirm" }],
    reason: "逐项确认", idempotency_key: "tree-defaults" });
  const plain = await reviews.submit<GoalTreeProposalDecisionResult>(plainInput);
  assert.deepEqual(plain.result?.proposal.decisions.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id, item.conversation_ref, item.message_ref]),
    [[LOCAL_PERSON_ACTOR_ID, "management", null, `management:${PROJECT}`, plain.record.source.entry.message_ref]]);
  const event = await reviews.prepare(goalsActions.decide, { goal_id: "first", idempotency_key: "accept-event", conclusion: "确认执行前的业务范围",
    effects: [{ kind: "authorize_action", action: "publish" }], scope: { action: "publish" } });
  const receipt = await reviews.submit<GoalEventDecisionResult>(event);
  const recorded = receipt.result!;
  assert.deepEqual([recorded.recorded, recorded.replayed, recorded.decision.actor_id, recorded.decision.authority_source], [true, false, LOCAL_PERSON_ACTOR_ID, "management"]);
  const stored = await restarted.withProject(fixture.reference, runtime => projectReviewDecisions(runtime.store.db, PROJECT).read(recorded.decision.governance_decision_id));
  assert.deepEqual(stored, receipt.record);
  assert.deepEqual([receipt.record.actor_id, receipt.record.source.kind, receipt.record.source.entry.source, receipt.record.source.entry.conversation_ref],
    [LOCAL_PERSON_ACTOR_ID, "person", "management", `management:${PROJECT}`]);
  const afterEvent = await fixture.facts(restarted);
  assert.deepEqual(await reviews.submit(event), { record: receipt.record, replayed: true });
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
  for (const name of ["molis_work_v1_initialize", "molis_work_v1_review_request", "molis_work_v1_review_decide"]) {
    await refusal(runtime, name, {}, "mcp.authority_denied");
  }
  for (const name of ["molis_work_v1_event_decide", "molis_work_v1_goal_tree_decide"]) await refusal(management, name, {}, "mcp.tool_unknown");
  const event = prepareGoalReview(goalsActions.decide, { goal_id: "absent", conclusion: "确认", idempotency_key: "event" });
  for (const extra of [{ actor_id: "forged" }, { authority: { conversation_ref: "conversation://forged" } }]) {
    await refusal(management, "molis_work_v1_review_request", { ...event, ...extra }, "actions.input_invalid");
  }
  await refusal(management, "molis_work_v1_review_decide", { proposal_id: "absent", request_key: "tree", runtime_actor_id: "forged" }, "actions.input_invalid");
  await refusal(management, "molis_work_v1_review_decide", { proposal_id: "absent", request_key: "tree", authority: { actor_id: "forged" } }, "actions.input_invalid");
  await refusal(management, "molis_work_v1_initialize", { idempotency_key: "" }, "actions.input_invalid", "goals.board.initialize");
  await refusal(management, "molis_work_v1_review_request", { ...event, request_id: "" }, "actions.input_invalid");
  await refusal(management, "molis_work_v1_review_decide", { reference: null, request_key: "tree", choice_id: "apply" }, "actions.input_invalid");
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
    "molis_work_v1_review_decide", { project_id: "example" }, { audience: "runtime", createError }), error => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "mcp.authority_denied");
      assert.match(error.message, /受保护的管理入口或 Web/u);
      assert.equal(actionHttpStatus(error), 400);
      return true;
    });
  assert.equal(invoked, 0);
});
