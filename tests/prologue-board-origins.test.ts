// Stage 3d-3 of specs/ai-input-receipts (§4.5, D2, D23): a supplement the AI calls a new task becomes a step only when the
// person adds it, and that step points back at the supplement on the runtime's own board. The round itself has no way to add one.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};

function sse(content: { tool?: { name: string; input: unknown }; text?: string }, round: number): Response {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: `m-${round}`, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: content.tool ? { type: "tool_use", id: `call-${round}`, name: content.tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: content.tool ? { type: "input_json_delta", partial_json: JSON.stringify(content.tool.input) } : { type: "text_delta", text: content.text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: content.tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("RCPT-350/351 a new task the AI names is not a step until the person adds it; the round cannot add it, and the added step points at the supplement", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-board-origins-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  type Body = { system: unknown; messages: unknown[] };
  let place = { board: "", prefix: "" }, input = "", release = () => {}, round = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as Body;
    const messages = JSON.stringify(body.messages), version = Number([...messages.matchAll(/version (\d+)/g)].at(-1)?.[1] ?? 1);
    round += 1; requests.push(messages.slice(-600));
    if (round === 1) {
      const system = JSON.stringify(body.system);
      place = { board: system.match(/本轮确认计划在项目任务图 (\S+) 上/)![1]!, prefix: system.match(/编号以 (\S+?)\. 开头/)![1]! };
      await held;
      return sse({ tool: { name: "board-read", input: { board: place.board } } }, round);
    }
    if (round === 2) return sse({ tool: { name: "acknowledge-inputs", input: { items: [{ input, treatment: "new-task", impacts: ["scope"], note: "另起一步" }] } } }, round);
    // RCPT-351: the round tries to add the step itself, pointing at the supplement; the Host's hook refuses it.
    if (round === 3) return sse({ tool: { name: "board-revise", input: { board: place.board, version, node: `${place.prefix}.extra`, change: "add", title: "覆盖注册接口", forInputs: [input] } } }, round);
    return sse({ text: "记下了，等你确认。" }, round);
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.board-origins.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only" });
  t.after(() => adapter.close?.());
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "plan-a", version: 1 }, title: "改登录", steps: [{ id: "step-1", title: "改登录接口", acceptance: "测试通过" }] };
  const session = await adapter.createSession({ ...owner, directory, title: "origins" });
  const handle = await adapter.start({ ...owner, directory, session, task: "改登录", role_id: "builder", execution_plan: plan,
    text_materials: [{ material_id: "plan", source_artifact_id: "plan-a", source_version: 1, title: plan.title, text: JSON.stringify(plan) }],
    role: { role_id: "builder", version: 1, execution: "text-edit", prompts: [], host_tools: ["board-read", "board-report", "board-revise", "acknowledge-inputs"] } } as never);
  await until(() => round >= 1, "the first model request");
  input = (await adapter.inputs!.send(handle.ref, { text: "顺便把注册接口也覆盖一下" })).input_id;
  release();
  const done: AgentRunView = await until(async () => { const view = await adapter.read(handle.ref); if (view.phase === "failed") throw new Error(JSON.stringify([view.stop_reason, requests])); return view.phase === "completed" && view; }, "the round's end");

  const steer = done.turns.find(turn => turn.steer?.id === input)?.steer;
  assert.equal(steer?.model_claim?.treatment, "new-task", `the AI says it is a new task: ${JSON.stringify(done.turns)}`);
  assert.match(requests[3] ?? "", /只能读取或回报本项目的任务图/u, "RCPT-351 the round's own board-revise is refused by the Host");
  assert.deepEqual(done.step_board?.nodes.map(node => [node.id, node.origins]), [["step-1", undefined]], "RCPT-351 the claim and the refused add leave the board as it was: no step, no pointer");

  const board = await adapter.collaboration!.revise(handle.ref, { kind: "insert", after: "step-1", title: "覆盖注册接口", acceptance: "注册的测试通过", origin: input }, done.step_board!.version, "user");
  const added = board.nodes.find(node => node.inserted);
  assert.deepEqual([added?.title, added?.origins], ["覆盖注册接口", [{ session_id: session.session_id, input_id: input }]], "RCPT-350 the person's step points at the supplement, as the runtime's board records it");
  assert.deepEqual((await adapter.read(handle.ref)).step_board?.nodes.find(node => node.inserted)?.origins, added?.origins, "RCPT-350 the run view reads it back from the board");
});
