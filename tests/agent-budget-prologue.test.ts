import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { parseAgentRunBudget, type AgentRunBudget, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

function toolResponse(): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "read-call", name: "read", input: {} } });
  emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ path: "note.txt" }) } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

for (const mode of ["output", "total", "turns", "duration"] as const) test(`real Prologue SDK enforces the declared ${mode} budget`, { timeout: 15_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-budget-")); await writeFile(join(home, "note.txt"), "Original file");
  const requests: any[] = []; let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)); requests.push(body);
    if (mode === "duration") return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(cogniaModelResponse("Too late")), 2_000);
      const abort = () => { aborted = true; clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      init.signal!.addEventListener("abort", abort, { once: true }); if (init.signal!.aborted) abort();
    });
    return mode === "total" || mode === "turns" ? toolResponse() : cogniaModelResponse("Finished");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.budget-test", appVersion: "1.0.0" }, storageRoot: join(home, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  try {
    const owner = { board_id: "board", plugin_id: "fixture", install_id: "install", actor_id: "owner", directory: { canonical_path: home, realpath_verified: true } };
    const session = await adapter.createSession({ ...owner, title: "Budget" });
    const budget: AgentRunBudget = mode === "duration" ? { max_duration_ms: 100 } : mode === "total" ? { max_total_tokens: 1, max_turns: 5 } : mode === "turns" ? { max_turns: 1 } : { max_output_tokens: 7, max_turns: 1 };
    const started = Date.now();
    const handle = await adapter.start({ ...owner, session, role_id: "reader", task: "Read the original file", budget,
      role: { role_id: "reader", version: 1, execution: "read-only", prompts: [], host_tools: ["read-file"] } });
    const view = await new Promise<AgentRunView>((resolve, reject) => {
      let off = () => {}; const timeout = setTimeout(() => reject(new Error("Budget did not stop the original run")), 6_000);
      off = adapter.observe(handle.ref, view => { if (!["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return;
        clearTimeout(timeout); queueMicrotask(() => off()); resolve(view); });
    });
    assert.deepEqual(handle.frozen.budget, budget);
    assert.equal(requests.length, 1, "an exhausted budget cannot dispatch another request");
    if (mode === "output") { assert.equal(requests[0].max_tokens, 7); assert.equal(view.phase, "completed"); }
    else if (mode === "duration") { assert.equal(aborted, true); assert.equal(view.phase, "failed"); assert.ok(Date.now() - started < 1_500); }
    else { assert.ok(view.stop_reason && /budget|turn|token/i.test(view.stop_reason), JSON.stringify(view)); }
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("Agent budgets reject malformed limits before any Runtime work and snapshot valid input", () => {
  for (const field of ["max_turns", "max_output_tokens", "max_total_tokens", "max_duration_ms"] as const) {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "8"]) assert.throws(() => parseAgentRunBudget({ [field]: value } as any), /预算/);
  }
  assert.throws(() => parseAgentRunBudget({ max_duration_ms: 2_147_483_648 }), /预算/);
  const original = { max_output_tokens: 5000 }, parsed = parseAgentRunBudget(original); original.max_output_tokens = 2;
  assert.equal(parsed!.max_output_tokens, 5000);
});
