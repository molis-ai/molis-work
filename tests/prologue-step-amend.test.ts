import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

test("a person inserts, skips and reorders steps of a running plan; the model reports on the new graph and every change is on the record", { timeout: 45_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-step-amend-")); await writeFile(join(root, "sample.txt"), "EVIDENCE");
  let turn = 0, release: () => void = () => {}; const held = new Promise<void>(resolve => { release = resolve; });
  let reportedInserted = "";
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    turn++;
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const system = JSON.stringify(body.system), messages = JSON.stringify(body.messages);
    const board = system.match(/任务图：([^。]+)。/)?.[1]; assert.ok(board, system);
    const version = Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] || 1);
    const report = (node: string, state: string, note: string) => response("", { name: "board-report", input: { board, node, state, note, version } });
    if (turn === 1) return response("", { name: "board-read", input: { board } });
    if (turn === 2) return report("step-1", "running", "开始第一步");
    if (turn === 3) { await held; return response("", { name: "board-read", input: { board } }); }
    if (turn === 4) return report("step-1", "succeeded", "第一步完成");
    if (turn === 5) return response("", { name: "board-read", input: { board } });
    if (turn === 6) return report("step-2", "running", "提前后的第二步");
    if (turn === 7) return report("step-2", "succeeded", "第二步完成");
    if (turn === 8) return report("user-1", "running", "插入的步骤开始");
    if (turn === 9) { reportedInserted = messages; return report("user-1", "succeeded", "插入的步骤完成"); }
    return response("All adjusted steps reported.");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.step-amend-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "fixed-plan", version: 1 }, title: "Plan", steps: [
    { id: "step-1", title: "读取样本", acceptance: "读到 EVIDENCE" }, { id: "step-2", title: "核对结论", acceptance: "记录结果" }, { id: "step-3", title: "整理说明", acceptance: "写出总结" }] };
  const material = { material_id: "plan", source_artifact_id: plan.source.artifact_id, source_version: 1, title: plan.title, text: JSON.stringify(plan) };
  try {
    const host = new AgentHost(); host.register(adapter);
    const session = await adapter.createSession({ ...owner, directory, title: "Amend" });
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task: "Follow steps.", execution_plan: plan, text_materials: [material] },
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    const deadline = Date.now() + 10_000; while (turn < 3) { if (Date.now() > deadline) throw new Error("model never reached the held turn"); await new Promise(resolve => setTimeout(resolve, 10)); }
    const board = async () => (await adapter.read(started.ref)).step_board!;
    let current = await board();
    assert.deepEqual(current.nodes.map(node => [node.id, node.state]), [["step-1", "running"], ["step-2", "not-started"], ["step-3", "not-started"]]);
    assert.equal(current.nodes[1]!.title, "核对结论", "confirmed steps carry the plan's own titles");

    await assert.rejects(adapter.amendStepBoard!(started.ref, { kind: "skip", node: "step-2", reason: "x" }, current.version - 1), /刚刚有更新/, "a stale view never changes the graph");
    await assert.rejects(adapter.amendStepBoard!(started.ref, { kind: "skip", node: "step-1", reason: "x" }, current.version), /正在执行/, "a running step is not skipped from under the model");
    await assert.rejects(adapter.amendStepBoard!(started.ref, { kind: "unblock", node: "step-2", note: "x" }, current.version), /没有受阻/);

    current = await adapter.amendStepBoard!(started.ref, { kind: "insert", after: "step-1", title: "补一条回归测试", acceptance: "新测试通过" }, current.version);
    assert.deepEqual(current.nodes.map(node => node.id), ["step-1", "user-1", "step-2", "step-3"]);
    assert.equal(current.nodes[1]!.inserted, true); assert.deepEqual(current.nodes[2]!.depends_on, ["user-1"], "the step after the insertion now waits for it");
    current = await adapter.amendStepBoard!(started.ref, { kind: "skip", node: "step-3", reason: "这次不需要总结" }, current.version);
    current = await adapter.amendStepBoard!(started.ref, { kind: "move", node: "step-2", direction: "up" }, current.version);
    assert.deepEqual(current.nodes.map(node => node.id), ["step-1", "step-2", "user-1", "step-3"]);
    assert.deepEqual(current.nodes.find(node => node.id === "step-2")!.depends_on, ["step-1"]);
    assert.deepEqual(current.nodes.find(node => node.id === "user-1")!.depends_on, ["step-2"]);

    release();
    const until = Date.now() + 20_000; let view = await adapter.read(started.ref);
    while (!["completed", "failed", "stopped", "cancelled"].includes(view.phase)) { if (Date.now() > until) throw new Error("run did not finish " + JSON.stringify(view)); await new Promise(resolve => setTimeout(resolve, 10)); view = await adapter.read(started.ref); }
    assert.equal(view.phase, "completed", JSON.stringify(view));
    assert.doesNotMatch(reportedInserted, /不能访问其他任务图/, "the model may report on a step a person inserted");
    const final = view.step_board!;
    assert.deepEqual(final.nodes.map(node => [node.id, node.state]), [["step-1", "succeeded"], ["step-2", "succeeded"], ["user-1", "succeeded"], ["step-3", "cancelled"]]);
    assert.equal(final.terminal, true);
    const notes = (id: string) => final.nodes.find(node => node.id === id)!.reports.map(report => report.note).join(" | ");
    assert.match(notes("user-1"), /用户插入：补一条回归测试；完成条件：新测试通过/);
    assert.match(notes("step-3"), /用户跳过：这次不需要总结/);
    assert.match(notes("step-2"), /用户把这一步提前/);
    await assert.rejects(adapter.amendStepBoard!(started.ref, { kind: "skip", node: "user-1", reason: "x" }, final.version), /已经结束/, "an ended round keeps its graph as the record");
  } finally { release(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("a later round continues the same unfinished graph, keeping a person's changes; a different plan or a finished graph is refused", { timeout: 45_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-step-continue-")); await writeFile(join(root, "sample.txt"), "EVIDENCE");
  let stage = "first", turn = 0, boards: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    turn++;
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const system = JSON.stringify(body.system), messages = JSON.stringify(body.messages);
    const board = system.match(/任务图：([^。]+)。/)?.[1]; assert.ok(board, system); if (!boards.includes(board)) boards.push(board);
    const version = Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] || 1);
    const report = (node: string, state: string, note: string) => response("", { name: "board-report", input: { board, node, state, note, version } });
    if (stage === "first") {
      if (turn === 1) return response("", { name: "board-read", input: { board } });
      if (turn === 2) return report("step-1", "running", "开始");
      if (turn === 3) return report("step-1", "succeeded", "第一步完成");
      return new Promise<Response>((_resolve, reject) => { const abort = () => reject(new DOMException("Stopped", "AbortError")); if (init.signal?.aborted) abort(); else init.signal?.addEventListener("abort", abort, { once: true }); });
    }
    if (turn === 1) return response("", { name: "board-read", input: { board } });
    if (turn === 2) return report("user-1", "running", "接着做插入的一步");
    if (turn === 3) return report("user-1", "succeeded", "插入的一步完成");
    if (turn === 4) return response("", { name: "board-read", input: { board } });
    if (turn === 5) return report("step-2", "running", "最后一步");
    if (turn === 6) return report("step-2", "succeeded", "最后一步完成");
    return response("Plan finished across two rounds.");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.step-continue-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "fixed-plan", version: 1 }, title: "Plan", steps: [{ id: "step-1", title: "读取样本", acceptance: "读到" }, { id: "step-2", title: "收尾", acceptance: "完成" }] };
  const material = { material_id: "plan", source_artifact_id: plan.source.artifact_id, source_version: 1, title: plan.title, text: JSON.stringify(plan) };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const finish = async (ref: any) => { const until = Date.now() + 20_000; for (;;) { const view = await adapter.read(ref); if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) return view; if (Date.now() > until) throw new Error("timeout " + JSON.stringify(view)); await new Promise(resolve => setTimeout(resolve, 10)); } };
  try {
    const host = new AgentHost(); host.register(adapter);
    const session = await adapter.createSession({ ...owner, directory, title: "Continue" });
    const request = (extra = {}) => ({ ...owner, session, directory, role_id: "builder", task: "Follow steps.", execution_plan: plan, text_materials: [material], ...extra });
    const first = await host.start("prologue", request(), authority);
    const deadline = Date.now() + 10_000; while (turn < 4) { if (Date.now() > deadline) throw new Error("first round never held"); await new Promise(resolve => setTimeout(resolve, 10)); }
    let board = (await adapter.read(first.ref)).step_board!;
    board = await adapter.amendStepBoard!(first.ref, { kind: "insert", after: "step-1", title: "补一个边界测试", acceptance: "测试通过" }, board.version);
    await assert.rejects(host.start("prologue", request({ continue_step_board_of: first.ref.run_id }), authority), /还没有结束|仍在执行/, "a live round's graph is not taken over");
    await adapter.control(first.ref, { kind: "stop" }); const stopped = await finish(first.ref);
    assert.deepEqual(stopped.step_board!.nodes.map(node => [node.id, node.state]), [["step-1", "succeeded"], ["user-1", "ready"], ["step-2", "not-started"]]);
    // Between rounds the latest round's unfinished graph can still be changed: the next round carries on from it.
    let between = await adapter.amendStepBoard!(first.ref, { kind: "move", node: "step-2", direction: "up" }, stopped.step_board!.version);
    between = await adapter.amendStepBoard!(first.ref, { kind: "move", node: "step-2", direction: "down" }, between.version);
    assert.ok(between.version > stopped.step_board!.version, "both changes are on the record");

    const otherPlan = { ...plan, steps: [...plan.steps, { id: "step-3", title: "多一步", acceptance: "x" }] };
    await assert.rejects(host.start("prologue", request({ execution_plan: otherPlan, continue_step_board_of: first.ref.run_id }), authority), /同一版确认计划/);

    stage = "second"; turn = 0;
    const second = await host.start("prologue", request({ continue_step_board_of: first.ref.run_id }), authority);
    const done = await finish(second.ref);
    assert.equal(done.phase, "completed", JSON.stringify(done));
    assert.equal(done.frozen.continues_step_board_of, first.ref.run_id, "the continuation is part of what the round was frozen with");
    assert.equal(boards.length, 1, "both rounds worked on one graph");
    assert.equal(done.step_board!.board_id, stopped.step_board!.board_id);
    assert.deepEqual(done.step_board!.nodes.map(node => [node.id, node.state]), [["step-1", "succeeded"], ["user-1", "succeeded"], ["step-2", "succeeded"]]);
    assert.equal(done.step_board!.terminal, true);
    await assert.rejects(adapter.amendStepBoard!(first.ref, { kind: "skip", node: "step-2", reason: "x" }, done.step_board!.version), /新的计划轮/, "an earlier round's graph stays the record it was");
    await assert.rejects(host.start("prologue", request({ continue_step_board_of: second.ref.run_id }), authority), /已经结束/, "a finished graph is not reopened");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
