import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};
type Block = { type?: string; text?: string; content?: unknown };
type Body = { system: unknown; messages: Array<{ role: string; content: string | Block[] }> };
const bodyOf = (init: RequestInit): Body => JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
const opening = (message: Body["messages"][number]) => typeof message.content === "string" ? message.content : message.content.map(block => block.text ?? block.content ?? "").join("");
const versionIn = (messages: string) => Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] ?? 1);
const placeIn = (system: string) => ({ board: system.match(/本轮确认计划在项目任务图 (\S+) 上/)![1]!, prefix: system.match(/编号以 (\S+?)\. 开头/)![1]! });
/** The latest tool result the round was given. */
const lastResult = (body: Body) => JSON.stringify([...body.messages].reverse().find(message => Array.isArray(message.content) && message.content.some(block => block.type === "tool_result")) ?? "");
const until = async (what: string, check: () => boolean | Promise<boolean>, ms = 20_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

const planOf = (file: string) => ({ source: { artifact_id: `plan-${file}`, version: 1 }, title: `改 ${file}`, steps: [{ id: "step-1", title: `改 ${file}`, acceptance: `${file} 的测试通过` }] });
const materialOf = (one: ReturnType<typeof planOf>) => ({ material_id: "plan", source_artifact_id: one.source.artifact_id, source_version: 1, title: one.title, text: JSON.stringify(one) });

// 统筹 10-17 定 A (specs/prologue-adoption §6.0i): Coding's coordinator holds board-read and board-report, so a child it
// dispatches is given them for the step it was handed (a child never holds more than its parent, SDK T12). A child it
// yields to reports its own step, and the parent's wait on that step is satisfied instead of always failing. The Host's
// board hook still bounds both: another project's board is not theirs to read, and a step they do not hold is not theirs
// to report on.
test("PA-11 (slice): a coordinator's yielded child reports the step it was handed and the wait is satisfied; another project's board and a step the coordinator does not hold are refused", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-coordinator-board-"));
  const seen: Record<string, string[]> = {};
  let other = { board: "", prefix: "" }, peer = { board: "", prefix: "" }, step = "", board = "", character = "";
  let outsideRead = "", outsideReport = "", peerReport = "", endedReport = "", childReport = "";
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages), system = JSON.stringify(body.system);
    const who = body.messages.filter(message => message.role === "user").map(opening).reverse().map((text: string) => text.match(/^(OTHER|PEER|COORD|NEXT|CHILD)_/)?.[1]).find(Boolean);
    if (!who) return response("其他。");
    const turn = (seen[who] ??= []).push(messages);
    if (who === "OTHER") { if (turn === 1) other = placeIn(system); return response("隔壁先停在这里。"); }
    // Another session of the same project, with a plan: its step stays its own.
    if (who === "PEER") { if (turn === 1) peer = placeIn(system); return response("同项目的会话先停在这里。"); }
    if (who === "COORD") {
      // Another project's board: neither read nor reported on.
      if (turn === 1) { character = system.match(/molis-child-[a-z0-9-]+@\d+/)![0]; return response("", { name: "board-read", input: { board: other.board } }); }
      if (turn === 2) { outsideRead = lastResult(body); return response("", { name: "board-report", input: { board: other.board, node: `${other.prefix}.step-1`, state: "failed", note: "不是我的", version: 1 } }); }
      if (turn === 3) { outsideReport = lastResult(body); return response("", { name: "board-read", input: { board: peer.board } }); }
      // The project's board is its to read; a step another session holds is not its to report on.
      if (turn === 4) return response("", { name: "board-report", input: { board: peer.board, node: `${peer.prefix}.step-1`, state: "failed", note: "替它报失败", version: versionIn(messages) } });
      if (turn === 5) {
        peerReport = lastResult(body);
        return response("", { name: "dispatch-subagent", input: { instruction: "CHILD_LOOK Read README and say how many sections it has", tools: ["read", "search"], character,
          idempotencyKey: "read-readme", background: true, yield: true, maxTurns: 3 } });
      }
      return response("等它读完。");
    }
    if (who === "CHILD") {
      if (turn === 1) {
        // The SDK tells the child which step is its own, on which board.
        [, step, board] = messages.match(/Your task is step (\S+) on task board ([^:\s]+):/)!;
        return response("", { name: "board-read", input: { board } });
      }
      if (turn === 2) return response("", { name: "board-report", input: { board, node: step, state: "succeeded", note: "README 一共三节", version: versionIn(messages) } });
      childReport = lastResult(body);
      return response("读过了：README 一共三节。");
    }
    // The next round, the continuation: the child's step ended as the child reported it, and stays so.
    if (turn === 1) return response("", { name: "board-read", input: { board } });
    if (turn === 2) return response("", { name: "board-report", input: { board, node: step, state: "failed", note: "替它改成失败", version: versionIn(messages) } });
    endedReport = lastResult(body);
    return response("子任务读完了 README。");
  });
  const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.coordinator-board-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  /** Until the round ends; the person approves what it asks (dispatching the child is a review). */
  const ended = async (ref: AgentRunRef): Promise<AgentRunView> => {
    for (const deadline = Date.now() + 30_000; ;) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error("timed out " + view.phase);
      for (const review of [...queue.list("b", "pending"), ...queue.list("other", "pending")]) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const out = await adapter.createSession({ ...owner, project_id: "other", directory, title: "隔壁" });
    const outRound = await host.start("prologue", { ...owner, project_id: "other", session: out, directory, role_id: "builder", task: "OTHER_TASK 改 c.ts",
      execution_plan: planOf("c.ts"), text_materials: [materialOf(planOf("c.ts"))] } as never, authority);
    assert.equal((await ended(outRound.ref)).phase, "completed");
    const neighbour = await adapter.createSession({ ...owner, directory, title: "同项目" });
    const peerRound = await host.start("prologue", { ...owner, session: neighbour, directory, role_id: "builder", task: "PEER_TASK 改 d.ts",
      execution_plan: planOf("d.ts"), text_materials: [materialOf(planOf("d.ts"))] } as never, authority);
    const peerBefore = (await ended(peerRound.ref)).step_board;
    const session = await adapter.createSession({ ...owner, directory, title: "协作" });
    const first = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "COORD_TASK 派一个子任务读 README，等它读完。" } as never, authority);
    assert.equal((await ended(first.ref)).phase, "completed");
    assert.match(outsideRead, /blocked \\"board-read\\": 只能读取或回报本项目的任务图/);
    assert.match(outsideReport, /blocked \\"board-report\\": 只能读取或回报本项目的任务图/);
    assert.match(peerReport, new RegExp(`TASKBOARD_NOT_ASSIGNED: \\\\"${peer.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.step-1\\\\" is assigned to session ${neighbour.session_id}; only its assignee reports on it`), peerReport);
    assert.deepEqual((await adapter.read(peerRound.ref)).step_board, peerBefore, "the refused report changed nothing on the other session's plan");
    // The child reported its own step, and the wait on it is satisfied: what the decision is for.
    await until("the continuation may go on", async () => (await adapter.collaboration!.read("b", session.session_id))[0]?.continuation?.state === "eligible");
    assert.equal(board, peer.board, "the child's step is on the project's board");
    assert.match(childReport, new RegExp(`board at version \\d+; ${step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is succeeded`), childReport);
    const ready = (await adapter.collaboration!.read("b", session.session_id))[0]!;
    assert.deepEqual([ready.wait?.state, ready.wait?.conditions[0]?.last.status], ["satisfied", "satisfied"], JSON.stringify(ready.wait));
    // The next round takes the continuation up; the child's step is not its to report on.
    const next = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "NEXT_ 接着做。" } as never, authority);
    assert.equal((await ended(next.ref)).phase, "completed");
    assert.match(endedReport, /TASKBOARD_CONFLICT: \\".+\.read-readme\\" is already succeeded; it takes no further progress/, endedReport);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

// What decision A changes for the person (§6.0i): 协作 started with a confirmed plan used to be refused before it ran
// (「当前角色未开放计划回报工具」), because the coordinator did not hold the plan's report tools. Now the round runs the
// plan: its session holds the plan's steps and reports each as it goes.
test("PA-09: 协作 started with a confirmed plan is not refused; its session holds the plan's steps and reports them in order", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-coordinator-plan-"));
  const plan = { source: { artifact_id: "plan-two", version: 1 }, title: "两步", steps: [
    { id: "step-1", title: "改 a.ts", acceptance: "a 的测试通过" }, { id: "step-2", title: "改 b.ts", acceptance: "b 的测试通过" }] };
  let place = { board: "", prefix: "" }, turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages);
    const report = (id: string, state: string, note: string) => response("", { name: "board-report", input: { board: place.board, node: `${place.prefix}.${id}`, state, note, version: versionIn(messages) } });
    turn += 1;
    if (turn === 1) { place = placeIn(JSON.stringify(body.system)); return response("", { name: "board-read", input: { board: place.board } }); }
    if (turn === 2) return report("step-1", "running", "开始改 a");
    if (turn === 3) return report("step-1", "succeeded", "a 的测试通过");
    if (turn === 4) return report("step-2", "running", "开始改 b");
    if (turn === 5) return report("step-2", "succeeded", "b 的测试通过");
    return response("两步都做完了。");
  });
  const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.coordinator-plan-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  try {
    const session = await adapter.createSession({ ...owner, directory, title: "协作" });
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "按计划执行。",
      execution_plan: plan, text_materials: [materialOf(plan)] } as never, { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    let done: AgentRunView;
    for (const deadline = Date.now() + 30_000; ;) {
      done = await adapter.read(started.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(done.phase)) break;
      if (Date.now() > deadline) throw new Error("timed out " + done.phase);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(done.phase, "completed", JSON.stringify(done.phase));
    assert.ok(place.board && place.prefix, "the round was told where its plan is");
    const nodes = done.step_board!.nodes;
    assert.deepEqual(nodes.map(node => [node.id, node.state, node.owner?.kind]), [["step-1", "succeeded", "session"], ["step-2", "succeeded", "session"]]);
    assert.deepEqual(nodes.map(node => node.reports.map(entry => [entry.by, entry.note])), [
      [[{ kind: "session", label: "本会话" }, "开始改 a"], [{ kind: "session", label: "本会话" }, "a 的测试通过"]],
      [[{ kind: "session", label: "本会话" }, "开始改 b"], [{ kind: "session", label: "本会话" }, "b 的测试通过"]],
    ]);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
