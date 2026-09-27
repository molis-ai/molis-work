import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";

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

test("sessions in one project see each other's work: overlaps before a round starts, in its context and on its write, and a round can wait for another", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-project-work-")); await mkdir(join(root, "src")); await writeFile(join(root, "src/label.ts"), "export const label = 1;\n");
  let releaseA!: () => void; const holdA = new Promise<void>(resolve => { releaseA = resolve; });
  let bOpening = "", bRead = "", turnsB = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), first = opening(body.messages.find((message: any) => message.role === "user")), messages = JSON.stringify(body.messages);
    if (first.startsWith("A_TASK")) { await holdA; return response("A 做完了。"); }
    if (first.startsWith("B_TASK")) {
      turnsB++;
      if (turnsB === 1) { bOpening = messages; return response("", { name: "board-read", input: { board: messages.match(/第 (\S+?) 号项目任务图/)![1] } }); }
      if (turnsB === 2) { bRead = messages; return response("", { name: "read", input: { path: "src/label.ts" } }); }
      if (turnsB === 3) return response("", { name: "write", input: { path: "src/label.ts", text: "export const label = 2;\n" } });
      return response("B 做完了。");
    }
    return response("其他。");
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.project-work-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
    const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
    const sessionA = await adapter.createSession({ ...owner, directory, title: "新编码会话" });
    const sessionB = await adapter.createSession({ ...owner, directory, title: "标签加前缀" });
    // A was created under a placeholder name; the person sees it by the name given with its round.
    const a = await host.start("prologue", { ...owner, session: sessionA, directory, role_id: "reader", task: "A_TASK 看看 src/label.ts 该怎么改格式", session_title: "改标签格式" } as never, authority);
    const work = adapter.projectWork!;
    for (const deadline = Date.now() + 10_000; !(await work.read("b")).items.some(item => item.state === "running");) {
      if (Date.now() > deadline) throw new Error("A never listed " + JSON.stringify((await work.read("b")).items)); await new Promise(resolve => setTimeout(resolve, 20));
    }
    // Before B starts: A is under way in the same directory and names the same file.
    const probe = await work.read("b", { session_id: sessionB.session_id, directory: root, text: "B_TASK 给 src/label.ts 加前缀" });
    assert.deepEqual(probe.overlaps.map(overlap => [overlap.work.title, overlap.paths]), [["改标签格式", ["src/label.ts"]]]);
    assert.equal((await work.read("b", { session_id: sessionB.session_id, directory: join(root, "elsewhere"), text: "src/label.ts" })).overlaps.length, 0, "another directory is not the same work");
    // B waits for A as a work item; giving it up leaves nothing waiting.
    const waiting = await work.queue("b", { session: sessionB, directory: root, task: "B_TASK 等一等", after: probe.overlaps[0]!.work.work_id }, "user");
    assert.equal(waiting.state, "waiting"); assert.deepEqual(waiting.waits_for, [probe.overlaps[0]!.work.work_id]);
    // B is parked on A's work in the SDK, carrying what to start with and the item it waits as.
    const parkedOnWork = (await adapter.waits!.read("b", sessionB.session_id))[0]!;
    assert.deepEqual([parkedOnWork.by, parkedOnWork.state, parkedOnWork.wait_id, parkedOnWork.waiting_on, (parkedOnWork.data as any).work_id], ["app", "waiting", waiting.wait_id, "「改标签格式」那一轮", waiting.work_id]);
    // The person starts B anyway: it takes over its waiting item and the wait is dropped.
    const b = await host.start("prologue", { ...owner, session: sessionB, directory, role_id: "builder", task: "B_TASK 给 src/label.ts 加前缀", queued_work_id: waiting.work_id } as never, authority);
    let reviewed = false;
    for (const deadline = Date.now() + 20_000; ;) {
      const view = await adapter.read(b.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) break;
      if (Date.now() > deadline) throw new Error("B timed out " + view.phase);
      for (const review of queue.list("b", "pending")) {
        if (review.document.kind === "text-edit") {
          // The card names the other session working on the same file.
          assert.deepEqual(review.document.concurrent, ["会话「改标签格式」（进行中）"]);
          reviewed = true;
        }
        await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(reviewed, "B's write was reviewed");
    // B's round started knowing what A is doing and where they overlap, and could read the project's graph.
    assert.match(bOpening, /项目里其他会话正在做的事/);
    assert.match(bOpening, /会话「改标签格式」（session \S+?）进行中/, "named with the id it can be written to by");
    assert.match(bOpening, /会话「改标签格式」也在改 src\/label\.ts/);
    assert.doesNotMatch(bRead, /TOOL_(DENIED|HOOK)|只能读取或回报本轮确认计划/);
    assert.match(bRead, /改标签格式/);
    const listed = (await work.read("b")).items;
    const itemB = listed.find(item => item.work_id === waiting.work_id)!;
    assert.equal(itemB.state, "done"); assert.equal(itemB.waits_for, undefined, "started anyway: the wait was dropped");
    assert.deepEqual((await adapter.waits!.read("b", sessionB.session_id)).map(wait => [wait.state, wait.note]), [["resumed", "等待中的那一轮已开始"]], "its firing starts nothing more");
    assert.deepEqual(itemB.paths, ["src/label.ts"]);
    releaseA();
    for (const deadline = Date.now() + 10_000; (await work.read("b")).items.some(item => item.state === "running");) {
      if (Date.now() > deadline) throw new Error("A never ended"); await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual((await work.read("b")).items.map(item => [item.title, item.state]), [["标签加前缀", "done"], ["改标签格式", "done"]]);
    void (a.ref as AgentRunRef);
  } finally { releaseA(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
