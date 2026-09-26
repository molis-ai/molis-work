import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { executionSteps, parseCodingPlan, planMaterial } from "../plugins/native/coding/src/plans.js";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

test("plan steps name the earlier steps they wait for; left out, a step waits for the one before it", () => {
  const plan = parseCodingPlan({ title: "两处独立修改", blockers: "", change_reason: "", steps: [
    { title: "改 a.ts", acceptance: "a 的测试通过" },
    { title: "改 b.ts", acceptance: "b 的测试通过", after: [] },
    { title: "合起来跑全部测试", acceptance: "npm test 全过", after: [2, 1] },
    { title: "写说明", acceptance: "README 更新" },
  ] });
  assert.deepEqual(plan.steps.map(step => step.after), [undefined, [], [1, 2], undefined]);
  assert.deepEqual(executionSteps(plan).map(step => [step.id, step.depends_on]), [["step-1", undefined], ["step-2", []], ["step-3", ["step-1", "step-2"]], ["step-4", undefined]]);
  // Plans written before steps could wait on others freeze exactly as they did, so earlier rounds still match them.
  const old = parseCodingPlan({ title: "旧计划", steps: [{ title: "一", acceptance: "甲" }, { title: "二", acceptance: "乙" }] });
  assert.equal(JSON.stringify(executionSteps(old)), JSON.stringify(old.steps.map((step, index) => ({ id: `step-${index + 1}`, ...step }))));
  assert.doesNotMatch(planMaterial({ revision: 1, content: old, source: { session_id: "s", run_id: "r", task: "t", workspace_path: "/w" }, confirmed: { artifact_id: "coding-plan:s:1", version: 1 } }).text, /after/);
  assert.match(planMaterial({ revision: 1, content: plan, source: { session_id: "s", run_id: "r", task: "t", workspace_path: "/w" }, confirmed: { artifact_id: "coding-plan:s:1", version: 1 } }).text, /\[\] 表示不等任何步骤/);
  for (const after of [[2], [3], [0], [1, 1], [1.5], "1"]) {
    assert.throws(() => parseCodingPlan({ title: "t", steps: [{ title: "一", acceptance: "甲" }, { title: "二", acceptance: "乙", after }] }), /第 2 步的前置步骤只能是它之前的步骤编号/, JSON.stringify(after));
  }
  assert.throws(() => parseCodingPlan({ title: "t", steps: [{ title: "一", acceptance: "甲", after: [1] }] }), /第 1 步/);
});

test("steps that wait on nothing run side by side on the SDK graph, and a joining step waits for all of them", { timeout: 45_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-step-deps-"));
  let turn = 0, calls = 0, ref: AgentRunRef | undefined, sideBySide: string[] = [];
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.step-deps-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const adapter = await make();
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; turn++;
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const system = JSON.stringify(body.system), messages = JSON.stringify(body.messages);
    const board = system.match(/任务图：([^。]+)。/)?.[1];
    assert.ok(board, system);
    const version = Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] || 1);
    const report = (node: string, state: string, note: string) => response("", { name: "board-report", input: { board, node, state, note, version } });
    if (turn === 1) { assert.match(system, /写明了步骤之间的依赖/); return response("", { name: "board-read", input: { board } }); }
    if (turn === 2) return report("step-3", "running", "想先做合并那一步");
    if (turn === 3) return response("", { name: "board-read", input: { board } });
    if (turn === 4) return report("step-1", "running", "开始改 a");
    if (turn === 5) return report("step-2", "running", "同时开始改 b");
    if (turn === 6) { sideBySide = (await adapter.read(ref!)).step_board!.nodes.map(node => node.state); return report("step-2", "succeeded", "b 的测试通过"); }
    if (turn === 7) return report("step-3", "running", "a 还没完成");
    if (turn === 8) return response("", { name: "board-read", input: { board } });
    if (turn === 9) return report("step-1", "succeeded", "a 的测试通过");
    if (turn === 10) return report("step-3", "running", "两步都完成，开始合并");
    if (turn === 11) return report("step-3", "succeeded", "全部测试通过");
    return response("三步都已报告，等待用户验收。");
  });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "fixed-plan", version: 1 }, title: "两处独立修改", steps: [
    { id: "step-1", title: "改 a.ts", acceptance: "a 的测试通过" },
    { id: "step-2", title: "改 b.ts", acceptance: "b 的测试通过", depends_on: [] },
    { id: "step-3", title: "合起来跑全部测试", acceptance: "npm test 全过", depends_on: ["step-1", "step-2"] },
  ] };
  const material = { material_id: "plan", source_artifact_id: plan.source.artifact_id, source_version: 1, title: plan.title, text: JSON.stringify(plan) };
  try {
    const host = new AgentHost(); host.register(adapter); const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
    const session = await adapter.createSession({ ...owner, directory, title: "Deps" });
    const request = (execution_plan: unknown) => ({ ...owner, session, directory, role_id: "builder", task: "按计划执行。", execution_plan, text_materials: [material] }) as never;
    // A step may only wait on steps before it: no forward edges, no unknown or repeated ids, so the graph has no cycles.
    for (const depends_on of [["step-2"], ["step-9"], ["step-1", "step-1"], "step-1"]) {
      await assert.rejects(host.start("prologue", request({ ...plan, steps: [plan.steps[0], { ...plan.steps[1], depends_on }, plan.steps[2]] }), authority), /步骤格式无效/, JSON.stringify(depends_on));
    }
    assert.equal(calls, 0);
    const started = await host.start("prologue", request(plan), authority); ref = started.ref;
    const deadline = Date.now() + 20_000;
    let done;
    for (;;) { done = await adapter.read(started.ref); if (["completed", "failed", "stopped", "cancelled"].includes(done.phase)) break; if (Date.now() > deadline) throw new Error("Timeout " + JSON.stringify(done)); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.equal(done.phase, "completed", JSON.stringify(done));
    assert.deepEqual(sideBySide, ["running", "running", "not-started"], "the two independent steps were running at the same time");
    const nodes = done.step_board!.nodes;
    assert.deepEqual(nodes.map(node => [node.id, node.state, node.depends_on]), [["step-1", "succeeded", []], ["step-2", "succeeded", []], ["step-3", "succeeded", ["step-1", "step-2"]]]);
    // Both early reports on the joining step were refused whole, so neither note is on the graph.
    assert.deepEqual(nodes[2]!.reports.map(entry => entry.note), ["两步都完成，开始合并", "全部测试通过"]);
    assert.deepEqual(done.frozen.execution_plan, plan);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
