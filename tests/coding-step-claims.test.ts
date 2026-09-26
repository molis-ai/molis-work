import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};
const bodyOf = (init: RequestInit) => JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
const opening = (message: any) => typeof message.content === "string" ? message.content : (message.content ?? []).map((block: any) => block.text ?? block.content ?? "").join("");
/** The latest board version this side saw in its own tool results. */
const versionIn = (messages: string) => Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] ?? 1);

const plan = { source: { artifact_id: "fixed-plan", version: 1 }, title: "三步", steps: [
  { id: "step-1", title: "改 a.ts", acceptance: "a 的测试通过" },
  { id: "step-2", title: "改 b.ts", acceptance: "b 的测试通过", depends_on: [] },
  { id: "step-3", title: "合起来跑全部测试", acceptance: "npm test 全过", depends_on: ["step-1", "step-2"] },
] };
const material = { material_id: "plan", source_artifact_id: plan.source.artifact_id, source_version: 1, title: plan.title, text: JSON.stringify(plan) };
const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" };

async function bench(t: { mock: { method: Function } }, script: (side: "parent" | "child", body: any, turn: number) => Promise<Response> | Response) {
  // Plans with subtasks run under the parallel-writers role: each subtask in its own directory.
  const root = await mkdtemp(join(tmpdir(), "molis-step-claims-")), main = join(root, "main"), writer = join(root, "writer-0");
  await mkdir(main); await mkdir(writer); await writeFile(join(writer, "b.ts"), "export const b = 1;\n");
  const turns = { parent: 0, child: 0 };
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), child = body.messages.some((message: any) => message.role === "user" && opening(message).startsWith("CHILD_TWO"));
    const side = child ? "child" : "parent";
    return script(side, body, ++turns[side]);
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.step-claims-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const directory = { canonical_path: main, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Claims" });
  const start = () => host.start("prologue", { ...owner, session, directory, role_id: "writers", task: "按计划执行。", execution_plan: plan, text_materials: [material],
    subagent_workspaces: [{ workspace_id: "writer-0", directory: { canonical_path: writer, realpath_verified: true } }] } as never,
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [main, writer] });
  const settle = async (ref: AgentRunRef): Promise<AgentRunView> => {
    const decided = new Set<string>();
    for (const deadline = Date.now() + 40_000; ;) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error("timed out: " + JSON.stringify({ phase: view.phase, turns }));
      for (const review of queue.list("b", "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" }); }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const startPlain = (task: string) => host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task } as never,
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [main, writer] });
  return { adapter, start, startPlain, settle, turns, close: async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); } };
}

test("a coordinator hands a step to a subtask: only the subtask reports on it, the coordinator hears its progress, and an unfinished step comes back", { timeout: 60_000 }, async t => {
  let release!: () => void; const parentDone = new Promise<void>(resolve => { release = resolve; });
  let board = "", system = "", refused = "", delta = "", subagent = "", childSaw = "";
  const b = await bench(t, async (side, body, turn) => {
    const messages = JSON.stringify(body.messages);
    const report = (node: string, state: string, note: string) => response("", { name: "board-report", input: { board, node, state, note, version: versionIn(messages) } });
    if (side === "child") {
      // The child waits until the coordinator has tried its step and finished its own, so versions do not race.
      if (turn === 1) { await parentDone; return response("", { name: "board-read", input: { board } }); }
      if (turn === 2) {
        assert.match(messages, /step-2 \[ready\] — 步骤 2 — owner you \(this session\)/);
        assert.match(messages, /step-3 \[not-started\] — 步骤 3 — owner the session that dispatched you/);
        return report("step-2", "running", "开始改 b");
      }
      childSaw = messages; return response("b 只改了一半，轮次用完。");
    }
    if (turn === 1) {
      system = JSON.stringify(body.system); board = system.match(/任务图：([^。]+)。/)![1]!;
      const character = system.match(/molis-child-[a-z0-9-]+@\d+/)![0];
      return response("", { name: "dispatch-subagent", input: { instruction: "CHILD_TWO 改 b.ts，完成条件：b 的测试通过。", tools: ["read", "search", "context-remaining", "write", "edit", "run-command"],
        character, workspace: "writer-0", idempotencyKey: "two", background: true, claims: { board, nodes: ["step-2"] } } });
    }
    if (turn === 2) { subagent = messages.match(/sub-[a-z0-9-]+/)![0]; return response("", { name: "board-read", input: { board } }); }
    if (turn === 3) return report("step-2", "running", "我自己来做 b");
    if (turn === 4) { refused = messages; return response("", { name: "board-read", input: { board } }); }
    if (turn === 5) return report("step-1", "running", "开始改 a");
    if (turn === 6) return report("step-1", "succeeded", "a 的测试通过");
    if (turn === 7) { release(); return response("", { name: "await-subagents", input: { refs: [subagent], mode: "all", timeoutMs: 10_000 } }); }
    // Long enough for the change note about the subtask to be queued for this round.
    if (turn === 8) { await new Promise(resolve => setTimeout(resolve, 2_000)); return response("", { name: "board-read", input: { board } }); }
    if (turn === 9) { delta = messages; return report("step-2", "running", "子任务交回，接着改 b"); }
    if (turn === 10) return report("step-2", "succeeded", "b 的测试通过");
    if (turn === 11) return report("step-3", "running", "合起来跑测试");
    if (turn === 12) return report("step-3", "succeeded", "npm test 全过");
    return response("全部完成。");
  });
  try {
    const started = await b.start();
    const done = await b.settle(started.ref);
    assert.equal(done.phase, "completed", JSON.stringify({ phase: done.phase, turns: b.turns }));
    // The round starts with the graph at a glance: every step and who holds it, and how to hand steps on.
    assert.match(system, /任务图摘要（第 1 版/);
    assert.match(system, /step-2「改 b\.ts」可开始（ready），负责：本会话/);
    assert.match(system, /claims/);
    // While the subtask held step-2 the coordinator could not report on it.
    assert.match(refused, /TASKBOARD_NOT_ASSIGNED/);
    // What the subtask did reached the coordinator without it asking.
    assert.match(delta, /任务图有更新/);
    assert.match(delta, /step-2「改 b\.ts」.*负责：/);
    const nodes = done.step_board!.nodes;
    assert.deepEqual(nodes.map(node => [node.id, node.state, node.owner?.kind]), [["step-1", "succeeded", "session"], ["step-2", "succeeded", "session"], ["step-3", "succeeded", "session"]]);
    const two = nodes.find(node => node.id === "step-2")!;
    assert.match(childSaw, /board at version \d+; step-2 is running/, childSaw);
    assert.deepEqual(two.reports.map(entry => [entry.by, entry.note]), [
      ["改派", "本会话 → 子任务「two」（派出子任务时交给它）"],
      ["子任务「two」", "开始改 b"],
      ["改派", "子任务「two」 → 本会话（子任务结束时没做完，交回）"],
      ["本会话", "子任务交回，接着改 b"],
      ["本会话", "b 的测试通过"],
    ]);
    assert.ok(two.reports.filter(entry => entry.handover).length === 2);
  } finally { await b.close(); }
});

test("a person takes a step on, records its result, adds a step for themselves and hands one back", { timeout: 60_000 }, async t => {
  let board = "", later = "";
  const b = await bench(t, (side, body, turn) => {
    const messages = JSON.stringify(body.messages);
    if (JSON.stringify(body.messages).includes("现在每一步谁在负责")) { later = JSON.stringify(body.system); return response("step-1 用户已完成，step-2 在本会话，插入的一步由用户处理。"); }
    if (turn === 1) { board = JSON.stringify(body.system).match(/任务图：([^。]+)。/)![1]!; return response("", { name: "board-read", input: { board } }); }
    // The round stops early, leaving the graph unfinished for the person.
    return response(messages.includes("board at version") ? "先停在这里，等用户安排。" : "…");
  });
  try {
    const started = await b.start();
    const done = await b.settle(started.ref);
    assert.equal(done.phase, "completed");
    let view = done.step_board!;
    const amend = async (amendment: object) => { view = await b.adapter.amendStepBoard!(started.ref, amendment as never, view.version, "user"); return view; };
    await assert.rejects(amend({ kind: "resolve", node: "step-1", state: "succeeded", note: "做完了" }), /只有你认领的步骤/);
    await amend({ kind: "assign", node: "step-1", to: "me" });
    assert.deepEqual(view.nodes.find(node => node.id === "step-1")!.owner, { kind: "person", label: "用户", actor_id: "user" });
    await assert.rejects(amend({ kind: "assign", node: "step-1", to: "me" }), /已经由你处理/);
    await amend({ kind: "resolve", node: "step-1", state: "succeeded", note: "手动改了 a 并跑过测试" });
    const one = view.nodes.find(node => node.id === "step-1")!;
    assert.equal(one.state, "succeeded");
    assert.deepEqual(one.reports.slice(-2).map(entry => [entry.by, entry.note]), [["用户", "用户开始处理"], ["用户", "用户完成：手动改了 a 并跑过测试"]]);
    // A step the person adds for themselves is theirs from the start.
    await amend({ kind: "insert", after: "step-2", title: "手工核对页面", acceptance: "页面正常", mine: true });
    const added = view.nodes.find(node => node.inserted)!;
    assert.equal(added.owner?.kind, "person");
    assert.match(added.reports[0]!.note, /由用户处理/);
    // Taking one on and handing it back leaves both handovers on the record.
    await amend({ kind: "assign", node: "step-2", to: "me" });
    await amend({ kind: "assign", node: "step-2", to: "session" });
    const two = view.nodes.find(node => node.id === "step-2")!;
    assert.equal(two.owner?.kind, "session");
    assert.deepEqual(two.reports.map(entry => entry.note), ["本会话 → 用户（用户改派给自己处理）", "用户 → 本会话（用户交回本会话）"]);
    // A directory reads who holds the open steps without opening the round: the added step is yours.
    assert.deepEqual((await b.adapter.readSessionStatus!(started.ref as never)).status.steps, { mine: 1, subtasks: 0, unowned: 0 });
    // A later round without a plan of its own starts knowing who holds what on the unfinished graph.
    const asked = await b.startPlain("现在每一步谁在负责？");
    assert.equal((await b.settle(asked.ref)).phase, "completed");
    assert.match(later, /本会话还有一张没结束的任务图/);
    assert.match(later, /step-1「改 a\.ts」已完成（succeeded），负责：用户/);
    assert.match(later, /step-2「改 b\.ts」可开始（ready），负责：本会话/);
    assert.match(later, /user-1「手工核对页面」.*负责：用户/);
  } finally { await b.close(); }
});
