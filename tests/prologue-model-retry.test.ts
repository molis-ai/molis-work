import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const response = (text: string) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

test("a model call whose connection drops before any response is sent again, and the round goes on (the person chose retrying)", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-model-retry-")); await writeFile(join(root, "README.md"), "x\n");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    // The first try: the connection is reset before anything comes back.
    if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
    return response("第二次就回来了。");
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.model-retry-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "重试" });
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "reader", task: "说一句话" } as never,
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    let view = await adapter.read(started.ref);
    for (const deadline = Date.now() + 30_000; !["completed", "failed", "cancelled"].includes(view.phase); view = await adapter.read(started.ref)) {
      if (Date.now() > deadline) throw new Error("timed out " + view.phase); await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(view.phase, "completed", view.stop_reason ?? "");
    assert.equal(calls, 2, "sent once more after the dropped connection");
    assert.match(JSON.stringify(view.turns), /第二次就回来了/);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
