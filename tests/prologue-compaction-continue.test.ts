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
const bodyOf = (init: RequestInit) => JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));

test("a round whose early compaction fails goes on while its history still fits the model's window", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-compaction-continue-"));
  // Enough text that later requests are past Coding's compaction threshold, far from the model's window.
  const files = Array.from({ length: 6 }, (_, i) => `part-${i}.md`);
  for (const name of files) await writeFile(join(root, name), Array.from({ length: 200 }, (_, i) => `${name} line ${i}: a habit check-in note that makes the context large enough.`).join("\n") + "\n");
  let compactions = 0, calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init);
    // The compaction request carries no tools: its answer is not a selection, so the compaction fails.
    if (!body.tools?.length) { compactions++; return response("这不是一个选择记录"); }
    calls++;
    return calls <= files.length ? response("", { name: "read", input: { path: files[calls - 1] } }) : response("读完了，每个文件 200 行。");
  });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.compaction-continue-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  try {
    const session = await adapter.createSession({ ...owner, directory, title: "整理失败" });
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task: "逐个读 part-0.md 到 part-5.md，说各有多少行", session_title: "整理失败" } as never,
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    let view = await adapter.read(started.ref);
    for (const deadline = Date.now() + 30_000; !["completed", "failed", "cancelled"].includes(view.phase); view = await adapter.read(started.ref)) {
      if (Date.now() > deadline) throw new Error("timed out in " + view.phase);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(compactions >= 1, "the compaction was tried");
    assert.equal(view.phase, "completed", view.stop_reason);
    assert.equal(calls, files.length + 1, "the round went on to its answer with the history it had");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
