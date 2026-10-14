import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

function reply(tool?: { name: string; input: object }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: "yield-call", name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text: "Yield was refused; no child was started." } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

async function terminal(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, ref: AgentRunRef): Promise<AgentRunView> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timer = setTimeout(() => { stop(); reject(new Error("Run did not finish")); }, 10_000);
    stop = adapter.observe(ref, view => {
      if (!["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(view.phase)) return;
      clearTimeout(timer); queueMicrotask(() => stop()); resolve(view);
    });
  });
}

test("PA-23: production Node adapter refuses yield before dispatch, with no child or resumed parent after reopen", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-a0-yield-"));
  const requests: string[] = [];
  const errors: unknown[] = [];
  const respond = async (request: IncomingMessage, response: ServerResponse) => {
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    requests.push(raw);
    const body = JSON.parse(raw) as { system: unknown; messages: unknown };
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (requests.length === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@4/)?.[0];
      assert.ok(character, "the production coordinator exposes its frozen child role");
      response.end(reply({ name: "dispatch-subagent", input: { instruction: "Read a file", tools: ["read", "search"], character,
        idempotencyKey: "denied-yield", background: true, yield: true, maxTurns: 1 } }));
    } else {
      assert.match(JSON.stringify(body.messages), /cannot hand its wake-up to subtasks/);
      response.end(reply());
    }
  };
  const server = createServer((request, response) => {
    void respond(request, response).catch(error => { errors.push(error); response.destroy(); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.a0-guard", appVersion: "1.0.0" },
    storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "synthetic" });
  let adapter = await make();
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "A0 yield refusal" });
    const run = await host.start("prologue", { ...owner, directory, session, role_id: "coordinator", task: "Ask one child to read, then yield." },
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
    const view = await terminal(adapter, run.ref);
    assert.deepEqual(errors, []);
    assert.equal(view.phase, "completed", view.stop_reason ?? "");
    assert.equal(requests.length, 2, "only the original parent asks and receives the refusal");
    assert.ok(view.activity.some(item => item.name === "dispatch-subagent" && item.state === "failed" && /wake-up/.test(item.output ?? "")));
    assert.deepEqual(await adapter.subagents!.list(run.ref), []);
    assert.deepEqual(queue.list("project", "pending"), [], "no approval exists for the rejected dispatch");
    assert.deepEqual((await adapter.readSession(session)).runs, [run.ref]);
    await adapter.close(); adapter = await make();
    const reopened = await adapter.readSession(session);
    assert.deepEqual(reopened.runs, [run.ref], "recovery does not create a new parent Run");
    assert.equal(reopened.latest_run?.phase, "completed");
    assert.deepEqual(await adapter.subagents!.list(run.ref), []);
    assert.equal(requests.length, 2, "reopening performs no model requests");
  } finally {
    await adapter.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
