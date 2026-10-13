import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function reply(tool?: { name: string; input: unknown }, text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/**
 * One Home: a parent that delegates the given sub-tasks and ends its round, children held until released, and every
 * model request the parent's later rounds make. `authority` may refuse a start (a revoked scope, a Host gone away).
 */
async function fixture(t: TestContext, name: string, children: string[], options: { refuse?: () => string | undefined } = {}) {
  const home = await mkdtemp(join(tmpdir(), `molis-handback-${name}-`));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const releases = new Map(children.map(title => [title, Promise.withResolvers<void>()]));
  const later: string[] = [];
  let parentStep = 0;
  const parentScript = [...children.map(title => () => reply({ name: "delegate-work", input: { title, brief: `起草「${title}」。`, acceptance: "一段话" } })),
    () => reply(undefined, "已交给子任务，它们还在做，做完我再汇总。")];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const raw = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(raw), said = JSON.stringify(body.messages);
    if (said.includes("委托给你的子任务")) {
      const title = children.find(item => said.includes(`起草「${item}」`))!;
      await Promise.race([releases.get(title)!.promise, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, `「${title}」的草稿：三句话。`);
    }
    if (parentStep < parentScript.length) return parentScript[parentStep++]!();
    later.push(raw);
    return reply(undefined, "已核对子任务的结果，汇总好了。");
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.work.handback-${name}`, appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const open = (): AssistantService => {
    const service: AssistantService = new AssistantService(store, { host: async () => host,
      authority: async work => { const refused = options.refuse?.(); if (refused) throw new Error(refused); return assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)); },
      projectTitle: async () => "项目" }, "web-user");
    return service;
  };
  const service = open();
  t.after(async () => { for (const release of releases.values()) release.resolve(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const sent = await service.send({ text: "把这两段分给子任务起草，做完汇总", request_id: `req-${name}` }, { project_ref: project });
  const started = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.length === children.length && view.delegated.every(child => child.state === "running") ? view : undefined; }, "parent ended, sub-tasks running");
  return { service, store, open, parentId: sent.work.work_id, children: started.delegated!, release: (title: string) => releases.get(title)!.resolve(), later, rounds: () => store.rounds(sent.work.work_id) };
}

// specs/prologue-adoption §4.6 (item 14): a sub-task that finishes after its delegating work's round ended hands its
// result back once, and the work goes on by itself in one round the Host writes — with the result as material,
// started like any other round.
test("sub-tasks that finish after their delegating work's round ended hand back once: the work goes on by itself in one Host-written round", { timeout: 90_000 }, async t => {
  const { service, store, parentId, children, release, later, rounds } = await fixture(t, "once", ["开头", "结尾"]);
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "first sub-task done");
  await pause(400);
  assert.equal(rounds().length, 1, "one sub-task still running: the work waits for both");
  // Both settle at once: still one round.
  release("结尾");
  const done = await until(async () => { const view = await service.read(parentId); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "the hand-back round");
  const handBack = rounds()[1]!;
  assert.equal(handBack.written_by, "host", "the Host wrote it, not the person");
  assert.match(handBack.text, /^（子任务都已交回）请核对「开头」「结尾」的结果/);
  assert.equal(later.length, 1);
  assert.match(later[0]!, /子任务交回/, "the results come as the round's material");
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  assert.match(later[0]!, /「结尾」的草稿：三句话/);
  assert.match(done.rounds[1]!.turns.map(turn => turn.text).join("\n"), /汇总好了/);
  // Each result reached it once: settling again (as after a restart) starts nothing, and its next round is not told again.
  for (const child of children) assert.equal(store.get("web-user", child.work_id).handed_back_run, store.rounds(child.work_id).at(-1)!.run_id);
  await service.attachSchedule();
  await pause(500);
  assert.equal(rounds().length, 2, "no second hand-back round");
  await service.send({ work_id: parentId, text: "谢谢", request_id: "req-once-thanks" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 3, "the person's round");
  assert.doesNotMatch(later.at(-1)!, /子任务交回/, "what was handed back is not told again");
});

// A delegation the person closed does not come back by itself: the work they stopped, or a sub-task someone stopped,
// waits for their next round, which is told what happened.
test("no hand-back round when the person stopped the delegating work; their next round is told what the sub-tasks did", { timeout: 90_000 }, async t => {
  const { service, parentId, children, release, later, rounds } = await fixture(t, "stopped", ["开头", "结尾"]);
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "first sub-task done");
  // The person stops the work: the sub-task still running stops with it; the finished one does not move it on.
  await service.control(parentId, { kind: "stop" });
  await until(async () => (await service.read(children[1]!.work_id)).work.state === "stopped", "second sub-task stopped");
  await pause(600);
  assert.equal(rounds().length, 1, "nothing starts after the person stopped it");
  assert.equal(later.length, 0);
  await service.send({ work_id: parentId, text: "子任务做得怎么样？", request_id: "req-stopped-ask" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 2, "the person's round");
  assert.match(later[0]!, /子任务交回/);
  assert.match(later[0]!, /「开头」：已完成/);
  assert.match(later[0]!, /「结尾」：被停止了/);
});

test("a sub-task someone stopped is not news enough to move its delegating work on", { timeout: 90_000 }, async t => {
  const { service, parentId, children, rounds, later } = await fixture(t, "child-stopped", ["开头"]);
  await service.control(children[0]!.work_id, { kind: "stop" });
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "stopped", "sub-task stopped");
  await pause(600);
  assert.equal(rounds().length, 1);
  assert.equal(later.length, 0);
  assert.equal((await service.read(parentId)).work.state, "completed");
});

// The hand-back round starts like any round: refused (the scope revoked, the Host away), it tells the person why and
// starts nothing; once the Host is back (a restart: a new service on the same store), it is taken up once.
test("a refused hand-back tells the person why; after a restart it is taken up once", { timeout: 90_000 }, async t => {
  let refusing: string | undefined;
  const { service, open, parentId, children, release, rounds, later } = await fixture(t, "refused", ["开头"], { refuse: () => refusing });
  refusing = "这个项目的授权已撤回";
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "sub-task done");
  const notice = await until(() => service.notices(null).find(item => item.work_id === parentId && /子任务都已交回，但没有自动接着做：这个项目的授权已撤回/.test(item.text)), "the notice");
  assert.equal(notice.kind, "needs-decision");
  assert.equal(rounds().length, 1, "nothing started");
  // The Host comes back.
  refusing = undefined;
  const restarted = open();
  assert.equal(await restarted.attachSchedule(), true);
  await until(async () => (await restarted.read(parentId)).work.state === "completed" && rounds().length === 2, "the hand-back round after the restart");
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  await restarted.attachSchedule();
  await pause(500);
  assert.equal(rounds().length, 2, "taken up once");
});
