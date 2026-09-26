import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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

// In collaborate mode the independent reviewer may run a check in the main workspace. The command waits on a Host
// review like any other; the reviewer still has no way to write a file, even when the parent asks for one.
test("packed SDK: the collaborate reviewer runs a reviewed command and cannot write", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-review-child-")); await writeFile(join(root, "a.txt"), "original\n");
  let parentCalls = 0, childCalls = 0; const childTools: string[][] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const opening = (message: any) => typeof message.content === "string" ? message.content : (message.content ?? []).map((block: any) => block.text ?? "").join("");
    if (body.messages.some((message: any) => message.role === "user" && opening(message).startsWith("CHECK_WITH_COMMAND"))) {
      childCalls++; childTools.push((body.tools ?? []).map((tool: any) => tool.name));
      if (childCalls === 1) return response("", { name: "run-command", input: { executable: "node", argv: ["-e", "console.log(6*7)"] } });
      assert.match(JSON.stringify(body.messages), /42/, "the reviewer sees the real output of the approved command");
      return response("Check ran: 42.");
    }
    parentCalls++;
    if (parentCalls === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@3/)?.[0]; assert.ok(character, "the independent reviewer is offered");
      return response("", { name: "dispatch-subagent", input: { instruction: "CHECK_WITH_COMMAND: run the check and report.", tools: ["read", "list", "search", "run-command", "write"], character, idempotencyKey: "review-child" } });
    }
    const ref = JSON.stringify(body.messages).match(/sub-[a-z0-9-]+/)?.[0];
    if (parentCalls === 2 && ref) return response("", { name: "await-subagents", input: { refs: [ref], mode: "all", timeoutMs: 0 } });
    return response("Reviewer reported 42.");
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.review-child-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Collaborate" });
    const handle = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Have the reviewer run a check." },
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    const kinds: string[] = []; const decided = new Set<string>();
    for (const deadline = Date.now() + 40_000; ;) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason ?? ""); break; }
      if (Date.now() > deadline) throw new Error("timed out: " + JSON.stringify({ view, childCalls, kinds }));
      for (const review of queue.list("b", "pending")) if (!decided.has(review.review_id)) {
        decided.add(review.review_id); kinds.push(review.kind);
        await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(kinds, ["tool-operation", "command"], "dispatching is reviewed, and so is the reviewer's command");
    assert.equal(childTools[0]!.includes("run-command"), true);
    assert.equal(childTools[0]!.some(name => ["write", "edit"].includes(name)), false, "asking for write gives the reviewer nothing to write with");
    const [child] = await adapter.subagents!.list(handle.ref);
    assert.equal(child!.state, "completed"); assert.match(child!.result!, /42/);
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "original\n");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
