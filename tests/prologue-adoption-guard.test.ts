import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

// S-23 (PA-23), specs/prologue-adoption §4.6.10 (P3a): a yield is the SDK's — dispatch, the step waits on the child's step, the run
// ends — and the step goes on only when the Host starts the session's next round, through the same start checks.

function reply(tool?: { name: string; input: object }, text = "done"): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: "dispatch-call", name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

/** Wait for the round to end; a dispatch is the person's to approve (a card, prologue-review-documents), and they approve it. */
async function terminal(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, ref: AgentRunRef, queue: AgentReviewQueue): Promise<AgentRunView> {
  for (const deadline = Date.now() + 10_000; ;) {
    const view = await adapter.read(ref);
    if (["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(view.phase)) return view;
    if (Date.now() > deadline) throw new Error(`Run did not finish: ${view.phase}`);
    for (const review of queue.list("project", "pending")) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "person" });
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

const until = async (what: string, check: () => boolean | Promise<boolean>, ms = 10_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

/** A loopback model: the parent's first call dispatches one read-only child (yielding when asked), the child answers, any later parent call answers. */
async function fixture(yieldIt: boolean, onFirst?: () => void) {
  const root = await mkdtemp(join(tmpdir(), "molis-p3a-yield-"));
  const requests: Array<{ who: "parent" | "child"; body: string }> = [];
  const errors: unknown[] = [];
  const respond = async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw) as { system: unknown; tools?: Array<{ name: string }> };
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found", not counted as a run.
    const review = endingReviewAnswer(body, () => []);
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (review) { response.end(reply(undefined, review)); return; }
    const who = body.tools?.some(tool => tool.name === "dispatch-subagent") ? "parent" : "child";
    requests.push({ who, body: raw });
    if (who === "child") { response.end(reply(undefined, "读过了：README 一共三节。")); return; }
    if (requests.filter(one => one.who === "parent").length === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@4/)?.[0];
      assert.ok(character, "the production coordinator exposes its frozen child role");
      onFirst?.();
      response.end(reply({ name: "dispatch-subagent", input: { instruction: "Read README and say how many sections it has", tools: ["read", "search"], character,
        idempotencyKey: "read-readme", background: true, ...(yieldIt ? { yield: true } : {}), maxTurns: 1 } }));
      return;
    }
    response.end(reply(undefined, "接着做完了。"));
  };
  const server = createServer((request, response) => { void respond(request, response).catch(error => { errors.push(error); response.destroy(); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.p3a-yield", appVersion: "1.0.0" },
    storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "synthetic" });
  const close = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); };
  return { root, requests, errors, queue, make, close };
}

for (const graph of ["project", "work"] as const) test(`PA-23: after a yield on a ${graph} graph, the Host takes up a continuation once; revoked starts leave it eligible and reopening asks no model`, { timeout: 40_000 }, async () => {
  const world = await fixture(true);
  let adapter = await world.make();
  try {
    const host = new AgentHost({ reviews: world.queue }); host.register(adapter);
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
    const directory = { canonical_path: world.root, realpath_verified: true };
    const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [world.root] };
    const session = await adapter.createSession({ ...owner, directory, title: "P3a yield" });
    if (graph === "work") await adapter.collaboration!.works!.open({ key: "continuation-work", session_id: session.session_id, title: "Work waiting for its child" });
    const first = await host.start("prologue", { ...owner, directory, session, role_id: "coordinator", task: "Ask one child to read README, then wait for it." }, authority);
    const ended = await terminal(adapter, first.ref, world.queue);
    assert.deepEqual(world.errors, []);
    assert.equal(ended.phase, "completed", ended.stop_reason ?? "");
    // The child ran (its own model call); the step waits on the child's step, and once it ended the continuation may go on.
    await until("the continuation may go on", async () => (await adapter.collaboration!.read("project", session.session_id))[0]?.continuation?.state === "eligible");
    const ready = (await adapter.collaboration!.read("project", session.session_id))[0]!;
    // This child only answers and never reports its step (one that does: coding-coordinator-board), so the step comes back
    // to the parent unfinished and the wait settles as failed. A yield waits until "settled" and goes on either way, so the
    // continuation may go on all the same.
    assert.deepEqual([ready.wait?.state, ready.wait?.until, ready.wait?.on_failure, ready.wait?.conditions[0]?.last.note, ready.continuation?.auto],
      ["failed", "settled", "continue", "back with you unfinished", true]);
    assert.deepEqual(world.requests.map(one => one.who), ["parent", "child"], "the Runtime starts no parent run of its own");
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(world.requests.length, 2, "an eligible continuation waits for the Host");
    // The person's authority is gone when the next round would start: refused before the Runtime starts it; nothing is asked of a model.
    await assert.rejects(host.start("prologue", { ...owner, directory, session, role_id: "coordinator", task: "Go on." },
      { ...authority, beforeStart: () => { throw Object.assign(new Error("授权已撤回"), { code: "actions.revoked" }); } }));
    assert.equal(world.requests.length, 2);
    assert.equal((await adapter.collaboration!.read("project", session.session_id))[0]?.continuation?.state, "eligible", "the continuation stays where it was");
    // The Host's next round takes the continuation up: one run, under its request key, given the child's report.
    const second = await host.start("prologue", { ...owner, directory, session, role_id: "coordinator", task: "Go on with what the child found." }, authority);
    await terminal(adapter, second.ref, world.queue);
    // Taken up, it is no longer one to go on (the view keeps only open waits and continuations not yet taken up).
    assert.deepEqual(await adapter.collaboration!.read("project", session.session_id), [{ session_id: session.session_id }]);
    assert.deepEqual(await adapter.collaboration!.awaitReady("project", 0), []);
    assert.deepEqual(world.requests.map(one => one.who), ["parent", "child", "parent"]);
    assert.match(world.requests[2]!.body, /README 一共三节/, "the child's report reaches the round that goes on");
    assert.deepEqual((await adapter.readSession(session)).runs, [first.ref, second.ref]);
    await adapter.close(); adapter = await world.make();
    const reopened = await adapter.readSession(session);
    assert.deepEqual(reopened.runs, [first.ref, second.ref], "recovery creates no parent run");
    assert.deepEqual(await adapter.collaboration!.awaitReady("project", 0), [], "reopening makes nothing eligible again");
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(world.requests.length, 3, "reopening asks no model");
  } finally { await adapter.close(); await world.close(); }
});

test("PA-07: a child is not dispatched once the round's own check fails: the Host's dispatch check refuses it and no child asks a model", { timeout: 30_000 }, async () => {
  let revoked = false;
  const world = await fixture(false, () => { revoked = true; });
  const adapter = await world.make();
  try {
    const host = new AgentHost({ reviews: world.queue }); host.register(adapter);
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
    const directory = { canonical_path: world.root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "P3a dispatch check" });
    const run = await host.start("prologue", { ...owner, directory, session, role_id: "coordinator", task: "Ask one child to read README." },
      { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [world.root],
        beforeDispatch: () => { if (revoked) throw Object.assign(new Error("授权已撤回"), { code: "actions.revoked" }); } });
    const view = await terminal(adapter, run.ref, world.queue);
    assert.notEqual(view.phase, "running");
    assert.deepEqual(world.requests.map(one => one.who), ["parent"], "no child asked a model, and the round's next call was stopped too");
    assert.deepEqual(await adapter.subagents!.list(run.ref), []);
  } finally { await adapter.close(); await world.close(); }
});
