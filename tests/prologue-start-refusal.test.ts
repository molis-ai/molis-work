import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

test("a round the runtime refuses while packing its context leaves the session usable, across a restart; the window and context use are recorded", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-start-refusal-"));
  t.mock.method(globalThis, "fetch", async () => {
    const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 1234, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  let window: number | undefined = 200;
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.refusal-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture", ...(window ? { context_tokens: window } : {}) }),
    resolveCredential: () => "test-only" });
  let adapter = await make();
  const directory = { canonical_path: root, realpath_verified: true };
  const role = { role_id: "reader", version: 1, execution: "read-only" as const, host_tools: ["read-file"],
    prompts: [{ prompt_id: "base", version: 1, layer: "base" as const, body: "Keep this instruction. ".repeat(200) }] };
  const start = (history?: "digest") => adapter.start({ plugin_id: "io.molis.work.coding", session, directory, role_id: "reader", task: "Say done.", role, ...(history ? { history } : {}) } as never);
  const settle = async (ref: { session_id: string; run_id: string }) => {
    for (const until = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) return view;
      if (Date.now() > until) throw new Error("run did not finish");
    }
  };
  const session = await adapter.createSession({ title: "Refusal", board_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "test", directory });
  try {
    // A 200-token window cannot hold the role's instructions: refused before any run exists.
    await assert.rejects(start(), (error: { code?: string }) => error.code === "CONTEXT_BUDGET_EXCEEDED");
    assert.equal((await adapter.readSession(session)).recovery, undefined, "a refusal is not an unknown outcome");

    window = undefined;
    const first = await settle((await start()).ref);
    assert.equal(first.phase, "completed");
    assert.deepEqual(first.frozen.model_context, { window_tokens: 120_000, prompt_includes_cache: false }, "no stated window: the runtime default");
    assert.deepEqual(first.usage.context, { tokens: 1234, coverage: "partial" }, "Anthropic-style cache fields were not reported, so the prompt is at least this");

    window = 64_000;
    const digest = await settle((await start("digest")).ref);
    assert.equal(digest.frozen.history, "digest");
    assert.equal(digest.frozen.model_context?.window_tokens, 64_000, "a model's smaller window is the one packed against");

    await adapter.close(); adapter = await make();
    const restored = await adapter.readSession(session);
    assert.equal(restored.recovery, undefined, "after a restart the refused attempt still does not block the session");
    assert.equal(restored.runs.length, 2);
    assert.equal((await settle((await start()).ref)).phase, "completed");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
