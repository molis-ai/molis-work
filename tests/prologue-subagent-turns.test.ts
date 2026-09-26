import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, SUBAGENT_DEFAULT_TURNS } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

// A subagent dispatched without a turn count gets the default the user chose (20), not the SDK's 8.
test("packed SDK: a subagent dispatched without maxTurns may take 20 turns", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-subagent-turns-")); await writeFile(join(root, "sample.txt"), "CHILD FILE");
  let parentCalls = 0, childCalls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const opening = (message: any) => typeof message.content === "string" ? message.content : (message.content ?? []).map((block: any) => block.text ?? "").join("");
    const child = body.messages.some((message: any) => message.role === "user" && opening(message).startsWith("KEEP_READING"));
    if (child) { childCalls++; return response("", { name: "read", input: { path: "sample.txt" } }); }
    parentCalls++;
    if (parentCalls === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@4/)?.[0]; assert.ok(character);
      return response("", { name: "dispatch-subagent", input: { instruction: "KEEP_READING sample.txt until told otherwise.", tools: ["read", "search"], character, idempotencyKey: "turns-child" } });
    }
    const messages = JSON.stringify(body.messages), ref = messages.match(/sub-[a-z0-9-]+/)?.[0];
    if (parentCalls === 2 && ref) return response("", { name: "await-subagents", input: { refs: [ref], mode: "all", timeoutMs: 0 } });
    return response("Child stopped at its turn limit.");
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.subagent-turns-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Parent" });
    const handle = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Delegate one long read." },
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    const decided = new Set<string>();
    for (const deadline = Date.now() + 40_000; ;) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) break;
      if (Date.now() > deadline) throw new Error("timed out: " + JSON.stringify({ view, childCalls }));
      for (const review of queue.list("b", "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" }); }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const children = await adapter.subagents!.list(handle.ref);
    assert.equal(children.length, 1);
    assert.equal(childCalls, SUBAGENT_DEFAULT_TURNS, "the child ran out of turns at 20, not at the SDK's 8");
    assert.equal(SUBAGENT_DEFAULT_TURNS, 20);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
