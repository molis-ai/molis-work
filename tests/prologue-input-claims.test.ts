// Stage 3a of specs/ai-input-receipts (§3.4, §11): what the runtime's ledger says about each supplement beyond its state —
// the model's own statement about it and the questions asked about it — reaches the run view through the runtime's own
// projection (`projectInputReceipts`), never a second one.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentReviewQueue, applyRunEvent, createPrologueNodeAdapter, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunView, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";

/** The runtime's own projection, resolved the way the Host resolves its SDK. */
interface RuntimeReceipt { steerId: string; state: string; handlingRevisions?: number; questions?: Array<{ pending: string; state: string }>;
  handling?: { treatment: string; targets: object[]; impacts: string[]; note?: string; callId?: string; toolCallId?: string } }
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { projectInputReceipts } = await import(requireSdk.resolve("@prologue/sdk")) as { projectInputReceipts: (events: readonly unknown[]) => readonly RuntimeReceipt[] };

const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};
const steers = (view: { turns: AgentTurnView[] }) => new Map(view.turns.flatMap(turn => turn.steer ? [[turn.text, turn.steer] as const] : []));

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

test("RCPT-301/302 a real round's statements and questions about its supplements reach the run view as the model's claim, and survive a restart", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-input-claims-")), project = join(root, "project");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(project); await writeFile(join(project, "a.ts"), "export const api = 1;\n");
  const ids: { keep?: string; logs?: string } = {};
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let round = 0;
  t.mock.method(globalThis, "fetch", async () => {
    round += 1;
    if (round === 1) { await held; return sse({ tool: { name: "read", input: { path: "a.ts" } } }, round); }
    if (round === 2) return sse({ tool: { name: "acknowledge-inputs", input: { items: [{ input: ids.keep, treatment: "later-step", impacts: ["scope"], note: "先记下" }] } } }, round);
    // The model changes its mind: the latest statement stands, and it was made twice.
    if (round === 3) return sse({ tool: { name: "acknowledge-inputs", input: { items: [{ input: ids.keep, treatment: "apply-now", kind: "constraint", impacts: ["constraint", "scope"],
      targets: [{ kind: "input", id: ids.logs }], note: "公开接口不改" }] } } }, round);
    if (round === 4) return sse({ tool: { name: "ask-user", input: { why: "日志要改成中文吗？", about: ids.logs } } }, round);
    return sse({ text: "完成。" }, round);
  });
  const queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "molis.input-claims.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only" });
  let adapter = await make();
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: project, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "input claims" });
  const handle = await adapter.start({ ...owner, directory, session, task: "改 a.ts 的注释", role_id: "reader", role: { role_id: "reader", version: 1, execution: "text-edit", prompts: [],
    host_tools: ["read-file", "acknowledge-inputs", "ask-user"] } });
  await until(() => round >= 1, "the first model request");
  ids.keep = (await adapter.inputs!.send(handle.ref, { text: "不要改公开接口" })).input_id;
  ids.logs = (await adapter.inputs!.send(handle.ref, { text: "日志也改成中文" })).input_id;
  release();
  const waiting = await until(async () => { const view = await adapter.read(handle.ref); if (view.phase === "failed") throw new Error(JSON.stringify(view)); return view.awaiting_input[0] && view; }, "the question about an input");
  const asked = waiting.awaiting_input[0]!;
  assert.deepEqual(steers(waiting).get("日志也改成中文")?.questions, [{ pending_id: asked.pending_id, state: "open" }], "RCPT-302 the question points at the input it is about");
  await adapter.control(handle.ref, { kind: "answer", pending_id: asked.pending_id, pending_revision: asked.pending_revision!, text: "要" });
  const done: AgentRunView = await until(async () => { const view = await adapter.read(handle.ref); return view.phase === "completed" && view; }, "the round's end");
  const claim = steers(done).get("不要改公开接口");
  assert.equal(claim?.state, "read", "a statement does not move the receipt: read stays read");
  assert.deepEqual({ ...claim?.model_claim, call_id: undefined, tool_call_id: undefined }, { treatment: "apply-now", kind: "constraint", impacts: ["constraint", "scope"],
    targets: [{ kind: "input", id: ids.logs }], note: "公开接口不改", revisions: 2, call_id: undefined, tool_call_id: undefined }, "RCPT-301 the latest statement, counted twice");
  assert.equal(claim?.model_claim?.tool_call_id, "call-3", "it names the tool call that carried it");
  assert.deepEqual(steers(done).get("日志也改成中文")?.questions, [{ pending_id: asked.pending_id, state: "settled" }]);
  assert.equal(steers(done).get("日志也改成中文")?.model_claim, undefined, "no statement is invented for an input the model said nothing about");
  // The view is rebuilt from the saved ledger after a restart: the same receipts.
  await adapter.close?.();
  adapter = await make();
  const restored = await adapter.read(handle.ref);
  assert.deepEqual([...steers(restored)], [...steers(done)]);
  await adapter.close?.();
});

// RCPT-304: the run view's receipts are the runtime's projection of the same ledger, input by input, plus the one fact the
// Host adds (a round it closed on a record that stopped short read nothing more).
const prompt = (steerId: string, text: string, extra: object = {}): PrologueEvent => ({ type: "prompt", role: "user", text, steerId, atMs: 1, ...extra });
const LEDGERS: Record<string, PrologueEvent[]> = {
  "revised statements, then withdrawn after another was read": [
    prompt("s-1", "先跑测试", { key: "send.k1" }), prompt("s-2", "别动夹具"), prompt("s-3", "改成 40 分钟"),
    { type: "steer-applied", steerId: "s-1" }, { type: "steer-applied", steerId: "s-2" }, { type: "steer-read", steerIds: ["s-1", "s-2"], callId: "c-1" },
    { type: "inputs-acknowledged", callId: "c-1", toolCallId: "t-1", items: [{ steerId: "s-1", treatment: "later-step", targets: [], impacts: ["approach"] }] },
    { type: "inputs-acknowledged", callId: "c-2", toolCallId: "t-2", items: [{ steerId: "s-1", treatment: "apply-now", kind: "request", targets: [{ kind: "board-node", board: "b-1", id: "n-1" }], impacts: ["approach"], note: "现在就跑" },
      { steerId: "s-2", treatment: "noted", targets: [], impacts: [] }] },
    { type: "steer-withdrawn", steerId: "s-3" },
    { type: "completed" },
  ],
  "questions asked about inputs, one settled and one left open when the round failed": [
    prompt("s-1", "日志改中文"), prompt("s-2", "顺便升级依赖", { carried: { from: "r-0" } }),
    { type: "steer-applied", steerId: "s-1" }, { type: "steer-applied", steerId: "s-2" }, { type: "steer-read", steerIds: ["s-1", "s-2"], callId: "c-1" },
    { type: "awaiting-input", pendingRef: { id: "p-1", revision: 1 }, kind: "text", why: "全部日志吗？", about: { session: "sess", input: "s-1" } },
    { type: "pending-settled", pendingRef: { id: "p-1", revision: 1 } },
    { type: "awaiting-input", pendingRef: { id: "p-2", revision: 1 }, kind: "text", why: "升到哪个版本？", about: { session: "sess", input: "s-2" } },
    { type: "failed", error: { code: "MODEL_UNAVAILABLE", safeMessage: "down" } },
  ],
  "unread at the end, in the context or not": [
    prompt("s-1", "下一步先发布"), prompt("s-2", "不要发布"), { type: "steer-applied", steerId: "s-2" }, { type: "cancelled" },
  ],
};

for (const [name, events] of Object.entries(LEDGERS)) {
  test(`RCPT-304 the run view equals the runtime's projection of the same ledger: ${name}`, () => {
    const state = emptyPrologueStreamState();
    for (const event of events) applyRunEvent(state, event, null);
    const view = new Map(state.turns.flatMap(turn => turn.steer ? [[turn.steer.id, turn.steer] as const] : []));
    const runtime = projectInputReceipts(events);
    assert.equal(view.size, runtime.length);
    for (const receipt of runtime) {
      const steer = view.get(receipt.steerId);
      assert.equal(steer?.state, receipt.state === "accepted" ? "received" : receipt.state, receipt.steerId);
      assert.equal(steer?.key, receipt.key, `${receipt.steerId} key (RC-17: the page that sent it knows it by its key)`);
      assert.equal(steer?.model_claim?.treatment, receipt.handling?.treatment, `${receipt.steerId} treatment`);
      assert.equal(steer?.model_claim?.revisions, receipt.handlingRevisions, `${receipt.steerId} revisions`);
      assert.deepEqual(steer?.model_claim?.targets, receipt.handling?.targets.map(target => ({ ...target })), `${receipt.steerId} targets`);
      assert.deepEqual(steer?.model_claim?.impacts, receipt.handling ? [...receipt.handling.impacts] : undefined);
      assert.equal(steer?.model_claim?.note, receipt.handling?.note);
      assert.equal(steer?.model_claim?.call_id, receipt.handling?.callId);
      assert.equal(steer?.model_claim?.tool_call_id, receipt.handling?.toolCallId);
      assert.deepEqual(steer?.questions, receipt.questions?.map(question => ({ pending_id: question.pending, state: question.state })), `${receipt.steerId} questions`);
    }
  });
}

test("RCPT-304 a round the Host closed on a record that stopped short: what was not read is unread, an open question unresolved", () => {
  const state = emptyPrologueStreamState();
  for (const event of [prompt("s-1", "先跑测试"), prompt("s-2", "别动夹具"), { type: "steer-applied", steerId: "s-2" },
    { type: "awaiting-input", pendingRef: { id: "p-1", revision: 1 }, kind: "text", why: "哪个夹具？", about: { session: "sess", input: "s-2" } }] as PrologueEvent[]) applyRunEvent(state, event, null);
  assert.deepEqual([...state.turns.flatMap(turn => turn.steer ? [[turn.steer.id, turn.steer.state]] : [])], [["s-1", "received"], ["s-2", "applied"]]);
  applyRunEvent(state, { type: "run-recovered", atMs: 2, transcript: "durable-prefix", operations: [] }, null);
  assert.deepEqual(state.turns.flatMap(turn => turn.steer ? [[turn.steer.id, turn.steer.state, turn.steer.questions]] : []),
    [["s-1", "unread", undefined], ["s-2", "unread", [{ pending_id: "p-1", state: "unresolved" }]]]);
});

// RCPT-303: a report a round made about an input points back at it. (A round still may not change its confirmed plan's steps;
// a step comes from an input only when the person adds it, stage 3d-3: tests/prologue-board-origins.test.ts.)
test("RCPT-303 the step board carries the inputs a report refers to", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-input-origins-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  type Body = { system: unknown; messages: unknown[] };
  let place = { board: "", prefix: "" }, input = "", release = () => {}, round = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const results: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as Body;
    const messages = JSON.stringify(body.messages), version = Number([...messages.matchAll(/version (\d+)/g)].at(-1)?.[1] ?? 1);
    round += 1; results.push(messages.slice(-400));
    if (round === 1) {
      const system = JSON.stringify(body.system);
      place = { board: system.match(/本轮确认计划在项目任务图 (\S+) 上/)![1]!, prefix: system.match(/编号以 (\S+?)\. 开头/)![1]! };
      await held;
      return sse({ tool: { name: "board-read", input: { board: place.board } } }, round);
    }
    if (round === 2) return sse({ tool: { name: "board-report", input: { board: place.board, node: `${place.prefix}.step-1`, state: "running", note: "按补充先写文档", version, inputs: [input] } } }, round);
    return sse({ text: "记下了。" }, round);
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.input-origins.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only" });
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "plan-a", version: 1 }, title: "改 a.ts", steps: [{ id: "step-1", title: "改 a.ts", acceptance: "测试通过" }] };
  const session = await adapter.createSession({ ...owner, directory, title: "origins" });
  const handle = await adapter.start({ ...owner, directory, session, task: "改 a.ts", role_id: "builder", execution_plan: plan,
    text_materials: [{ material_id: "plan", source_artifact_id: "plan-a", source_version: 1, title: plan.title, text: JSON.stringify(plan) }],
    role: { role_id: "builder", version: 1, execution: "text-edit", prompts: [], host_tools: ["board-read", "board-report"] } } as never);
  await until(() => round >= 1, "the first model request");
  input = (await adapter.inputs!.send(handle.ref, { text: "先补一份文档" })).input_id;
  release();
  const done: AgentRunView = await until(async () => { const view = await adapter.read(handle.ref); if (view.phase === "failed") throw new Error(JSON.stringify([view.stop_reason, results])); return view.phase === "completed" && view; }, "the round's end");
  const ref = { session_id: session.session_id, input_id: input };
  const step = done.step_board?.nodes.find(node => node.id === "step-1");
  assert.deepEqual(step?.reports.find(report => report.note === "按补充先写文档")?.inputs, [ref], `the report refers to the input: ${JSON.stringify([done.step_board, results])}`);
  assert.equal(step?.reports.some(report => report.note !== "按补充先写文档" && report.inputs), false, "other reports refer to no input");
  await adapter.close?.();
});
