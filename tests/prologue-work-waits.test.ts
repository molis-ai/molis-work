import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { reply } from "./fixtures/fixture-replies.js";

// specs/prologue-adoption §6.0n: one step has one continuation. The Host changes only the waits it armed on a work's root,
// and hands nothing out while the root waits on one its round armed; a round's own wait is refused while the Host's is open.

const until = async (what: string, check: () => boolean | Promise<boolean>, ms = 15_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

/** A session on a work's graph, with the builder role (it may wait with `board-wait`), and one part's session; `script` answers its model calls in turn. */
async function world(t: TestContext, script: (hold: () => PromiseWithResolvers<void>) => Array<(body: string) => Response | Promise<Response>>) {
  const root = await mkdtemp(join(tmpdir(), "molis-work-waits-"));
  const bodies: string[] = [], held: Array<() => void> = [];
  /** A point a model call stops at until the test lets it go; let go, too, when the test ends (failed or not). */
  const hold = () => { const one = Promise.withResolvers<void>(); held.push(one.resolve); return one; };
  const answers = script(hold);
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    bodies.push(body);
    return (answers[bodies.length - 1] ?? (() => reply(undefined, "好的。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work-waits", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  t.after(async () => { for (const go of held) go(); await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
  const directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const session = await adapter.createSession({ ...owner, directory, title: "Work" });
  const part = await adapter.createSession({ ...owner, directory, title: "Part" });
  const works = adapter.collaboration!.works!;
  const { graph_id } = await works.open({ key: "one-continuation", session_id: session.session_id, title: "Work" });
  const read = () => works.read(graph_id);
  const rootStep = async () => (await read()).find(node => node.node_id === "work")!;
  const start = (task: string) => host.start("prologue", { ...owner, directory, session, role_id: "builder", task }, authority);
  /** The round ends; a step the round asks the person about is approved. */
  const ended = async (ref: AgentRunRef) => {
    await until("the round ends", async () => {
      for (const review of queue.list("project", "pending")) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "person" });
      return ["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes((await adapter.read(ref)).phase);
    });
    return adapter.read(ref);
  };
  const handOut = (node_id: string) => works.add({ graph_id, node_id, session_id: part.session_id, title: node_id, wait_reason: "等交出去的子任务都结束" });
  return { works, graph_id, part, bodies, read, rootStep, start, ended, handOut };
}

const boardWait = (graph: string, node: string) => reply({ name: "board-wait", input: { on: [{ kind: "node", board: graph, node }], until: "settled", onFailure: "continue", reason: `等 ${node}` } }, "");

test("W2-18-HANDBACK-ONE-CONTINUATION-01: while the root waits on a wait its round armed, a hand-out is refused and changes nothing; after that wait, it goes through", { timeout: 60_000 }, async t => {
  let graph = "", said!: PromiseWithResolvers<void>, saying!: PromiseWithResolvers<void>, second!: PromiseWithResolvers<void>, holding!: PromiseWithResolvers<void>;
  const w = await world(t, hold => {
    said = hold(); saying = hold(); second = hold(); holding = hold();
    return [() => boardWait(graph, "p-1"), async () => { saying.resolve(); await said.promise; return reply(undefined, "在等 p-1。"); },
      async () => { holding.resolve(); await second.promise; return reply(undefined, "接着做完了。"); }];
  });
  graph = w.graph_id;
  // ASC-19 ASC-34: only Host-owned waits reach the hand-back listener; Agent waits have their own continuation owner.
  const handbacks: string[] = [];
  t.after(w.works.onReady(ready => { handbacks.push(ready.request_key); }));
  const refused = (error: unknown) => (error as { code?: string }).code === "agent.collaboration_conflict" && /自己登记的事/.test(String((error as Error).message));
  await w.works.add({ graph_id: w.graph_id, node_id: "p-1", session_id: w.part.session_id, title: "p-1" });
  const first = await w.start("等 p-1 做完再接着做。");
  // The round armed its own wait and is still saying what it waits for: the root runs, with the round's wait on it.
  await saying.promise;
  const before = await w.read();
  assert.deepEqual([before.find(node => node.node_id === "work")?.state, before.find(node => node.node_id === "work")?.continuation?.state], ["running", "armed"]);
  await assert.rejects(w.handOut("p-2"), refused);
  assert.deepEqual(await w.read(), before, "nothing was added and the round's wait was not touched");
  said.resolve();
  assert.equal((await w.ended(first.ref)).phase, "completed");
  const waiting = await w.read();
  assert.equal(waiting.find(node => node.node_id === "work")?.continuation?.state, "armed", "the round's own wait stays open on the root");
  await assert.rejects(w.handOut("p-2"), refused);
  // The person stops the work: the Host ends only a wait it armed, and holds only a continuation of one.
  await w.works.hold({ graph_id: w.graph_id, note: "用户停止了这项工作" });
  assert.deepEqual(await w.read(), waiting, "the round's wait is not the Host's to end");
  // The step the round waits on ends: its wait is over, and the work's next round takes the continuation up.
  await w.works.end({ graph_id: w.graph_id, node_id: "p-1", note: "做完了" });
  await until("the round's wait is over", async () => (await w.rootStep()).continuation?.state === "eligible");
  await w.works.hold({ graph_id: w.graph_id, note: "用户停止了这项工作" });
  assert.equal((await w.rootStep()).continuation?.state, "eligible", "nor its continuation the Host's to hold");
  assert.deepEqual(handbacks, [], "an Agent wait must not trigger the Host's child hand-back round");
  const next = await w.start("接着做。");
  await holding.promise;
  await w.handOut("p-2");
  const after = await w.read();
  assert.equal(after.find(node => node.node_id === "p-2")?.state, "ready");
  assert.equal(after.find(node => node.node_id === "work")?.continuation?.state, "armed", "the work now waits for p-2");
  second.resolve();
  await w.ended(next.ref);
});

test("W2-18-HANDBACK-ONE-CONTINUATION-02: while the Host's wait is open on the root, the round's own board-wait is refused and the Host's wait stays", { timeout: 60_000 }, async t => {
  let graph = "", go!: PromiseWithResolvers<void>, holding!: PromiseWithResolvers<void>;
  const w = await world(t, hold => {
    go = hold(); holding = hold();
    return [async () => { holding.resolve(); await go.promise; return boardWait(graph, "p-1"); }, () => reply(undefined, "已经在等了。")];
  });
  graph = w.graph_id;
  const round = await w.start("交出 p-1，再等它。");
  await holding.promise;
  await w.handOut("p-1");
  const armed = (await w.rootStep()).continuation;
  assert.equal(armed?.state, "armed");
  go.resolve();
  assert.equal((await w.ended(round.ref)).phase, "completed");
  assert.match(w.bodies[1] ?? "", /WAIT_ALREADY_ARMED|already waits/, "the round is told the step already waits");
  assert.deepEqual((await w.rootStep()).continuation, armed, "the Host's wait is the one the root still waits on");
});

// BL-154: a round that did not start ends its step only while no round has started on it, checked and ended in one step.
test("W2-18-DELEGATION-PLACED-03: ending a step only while it is ready leaves one a round has started on, and ends one still ready", { timeout: 60_000 }, async t => {
  let go!: PromiseWithResolvers<void>, holding!: PromiseWithResolvers<void>;
  const w = await world(t, hold => {
    go = hold(); holding = hold();
    return [async () => { holding.resolve(); await go.promise; return reply(undefined, "做完了。"); }];
  });
  const round = await w.start("做这一步。");
  await holding.promise;
  const running = await w.read();
  assert.equal(running.find(node => node.node_id === "work")?.state, "running");
  await w.works.end({ graph_id: w.graph_id, node_id: "work", note: "这一轮没有开始", if_ready: true });
  assert.deepEqual(await w.read(), running, "a step a round has started on is that round's to end");
  await w.handOut("p-1");
  assert.equal((await w.read()).find(node => node.node_id === "p-1")?.state, "ready");
  await w.works.end({ graph_id: w.graph_id, node_id: "p-1", note: "这一轮没有开始", if_ready: true });
  assert.equal((await w.read()).find(node => node.node_id === "p-1")?.state, "cancelled", "a step no round has started on is ended");
  go.resolve();
  assert.equal((await w.ended(round.ref)).phase, "completed");
});

test("W2-18-HANDBACK-ARM-FAILED-01: a hand-out whose wait cannot be armed takes its step back, and the work waits again for what it waited for", { timeout: 60_000 }, async t => {
  let go!: PromiseWithResolvers<void>, holding!: PromiseWithResolvers<void>;
  const w = await world(t, hold => {
    go = hold(); holding = hold();
    return [async () => { holding.resolve(); await go.promise; return reply(undefined, "交出去了。"); }];
  });
  const round = await w.start("把这几段交出去。");
  await holding.promise;
  const parts = Array.from({ length: 8 }, (_, index) => `p-${index + 1}`);
  for (const part of parts) await w.handOut(part);
  // A wait takes at most eight things (the SDK refuses more before it writes anything): the ninth is added, then not waited for.
  await assert.rejects(w.handOut("p-9"), /at most 8/);
  const after = await w.read();
  assert.equal(after.find(node => node.node_id === "p-9")?.state, "cancelled", "the step nothing would wait for is ended again");
  assert.deepEqual(after.filter(node => node.node_id !== "work" && !["succeeded", "failed", "cancelled"].includes(node.state)).map(node => node.node_id), parts);
  assert.equal(after.find(node => node.node_id === "work")?.continuation?.state, "armed", "the work waits again for the eight");
  go.resolve();
  assert.equal((await w.ended(round.ref)).phase, "completed");
  for (const part of parts.slice(0, -1)) await w.works.end({ graph_id: w.graph_id, node_id: part, note: "做完了" });
  assert.equal((await w.rootStep()).continuation?.state, "armed", "one still running: the work still waits");
  await w.works.end({ graph_id: w.graph_id, node_id: parts.at(-1)!, note: "做完了" });
  await until("the work may go on", async () => (await w.rootStep()).continuation?.state === "eligible");
});
