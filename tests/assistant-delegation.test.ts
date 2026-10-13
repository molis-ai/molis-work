import assert from "node:assert/strict";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost, AssistantStore, AssistantService, assistantAuthority } from "@molis-ai/molis-work-app-local-host";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
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

test("a work hands an independent part to a work of its own, waits for it, reads back what it did; one level deep and bounded", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const parentTools: string[][] = [], childTools: string[][] = [];
  let parentStep = 0;
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "整理访谈要点", brief: "把给你的访谈记录整理成三条要点。", acceptance: "恰好三条、每条一句话", materials: [{ title: "访谈记录", text: "用户说每周要手工对账两小时。" }] } }),
    () => reply({ name: "check-delegated-work", input: { wait_seconds: 20 } }),
    (body: any) => { assert.match(JSON.stringify(body.messages), /对账/, "the parent reads back the child's reply"); return reply(undefined, "子任务已整理出三条要点。"); },
  ];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const names = (body.tools ?? []).map((tool: { name: string }) => tool.name);
    if (JSON.stringify(body.messages).includes("委托给你的子任务")) { childTools.push(names); return reply(undefined, "三条要点：1. 每周手工对账两小时。2. 希望自动化。3. 愿意试用。"); }
    parentTools.push(names);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  // What each round asked the Host for: a delegated work never gets the person's side panel browser.
  const starts: Array<{ task: string; browser?: false }> = [];
  const start = host.start.bind(host);
  host.start = (async (runtime, input, authority) => { starts.push(input as never); return start(runtime, input, authority); }) as typeof host.start;
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "把这次访谈整理一下，分给子任务做", request_id: "req-delegation-1" }, { project_ref: project });
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.length ? view : undefined; }, "parent completion");
    assert.equal(done.delegated!.length, 1);
    const child = await service.read(done.delegated![0]!.work_id);
    assert.deepEqual(child.work.delegated_by, { work_id: sent.work.work_id, title: sent.work.title, acceptance: "恰好三条、每条一句话" });
    assert.equal(child.work.state, "completed");
    assert.deepEqual(child.rounds[0]!.materials.map(material => material.title), ["访谈记录"], "the child gets only the material handed to it");
    assert.ok(parentTools[0]!.includes("delegate-work"), "the parent may delegate");
    assert.ok(!childTools[0]!.includes("delegate-work") && !childTools[0]!.includes("check-delegated-work"), "a delegated work does not delegate further");
    assert.deepEqual(done.rounds[0]!.activity.map(item => item.verb), ["delegate", "delegate-check"]);
    assert.equal(starts[0]!.browser, undefined, "the person's own work may use the side panel browser");
    assert.ok(starts.length > 1 && starts.slice(1).every(input => input.browser === false), "the delegated work starts without it");
    await service.list();
    assert.deepEqual(service.notices(null).filter(notice => notice.work_id === child.work.work_id), [], "a delegated work reports to its parent, not to the person");

    const delegation = service.delegation(store.get("web-user", sent.work.work_id))!;
    await delegation.follow_up(child.work.work_id, "每条再短一点");
    await delegation.follow_up(child.work.work_id, "去掉编号");
    await assert.rejects(delegation.follow_up(child.work.work_id, "再改一次"), (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid", "follow-ups are bounded");
    const other = await service.send({ text: "别的事", request_id: "req-delegation-2" }, { project_ref: project });
    await assert.rejects(service.delegation(store.get("web-user", other.work.work_id))!.stop(child.work.work_id), (error: unknown) => error instanceof ActionError && error.code === "assistant.scope" && error.kind === "forbidden");
    assert.equal(service.delegation(store.get("web-user", child.work.work_id)), undefined);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("stopping a work also stops the sub-tasks it handed out that are still running, even after its own round ended", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-stop-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  let parentStep = 0;
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "起草", brief: "起草一段话。", acceptance: "一段话" } }),
    () => reply(undefined, "已交给子任务，它还在做。"),
  ];
  let releaseChild!: () => void;
  const childHeld = new Promise<void>(resolve => { releaseChild = resolve; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托给你的子任务")) {
      // A model request that takes its time, and gives up when the run is stopped (as a real one does).
      await Promise.race([childHeld, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, "草稿。");
    }
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-stop-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "分给子任务起草", request_id: "req-delegation-stop" }, { project_ref: project });
    // The parent's round is over; its sub-task is still running.
    const parent = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.[0]?.state === "running" ? view : undefined; }, "child running");
    const stopped = await service.control(sent.work.work_id, { kind: "stop" });
    assert.equal(stopped.work.state, "completed", "the parent's finished round stays finished");
    const child = await until(async () => { const view = await service.read(parent.delegated![0]!.work_id); return ["stopped", "failed"].includes(view.work.state) ? view : undefined; }, "child stopped");
    assert.equal(child.work.state, "stopped");
    await assert.rejects(service.control(sent.work.work_id, { kind: "stop" }), /没有在执行/, "nothing left to stop");
  } finally { releaseChild(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("the person takes a sub-task back: it stops, the board says so, no more follow-ups go to it, and the delegating work finishes that part", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-takeback-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  let parentStep = 0, childId = "";
  const parentBodies: string[] = [];
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "起草结论", brief: "起草一段结论。", acceptance: "一段话，不超过三句" } }),
    () => reply(undefined, "已交给子任务，它还在做。"),
    // After the take-back: a follow-up to it is refused, then the round does the part itself.
    () => reply({ name: "follow-up-delegated-work", input: { work_id: childId, text: "再改改" } }),
    () => reply(undefined, "这部分我自己写完了。"),
  ];
  let releaseChild!: () => void;
  const childHeld = new Promise<void>(resolve => { releaseChild = resolve; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const text = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(text);
    if (JSON.stringify(body.messages).includes("委托给你的子任务")) {
      await Promise.race([childHeld, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, "草稿。");
    }
    parentBodies.push(text);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-takeback-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "分给子任务起草结论", request_id: "req-delegation-takeback" }, { project_ref: project });
    const parent = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.[0]?.state === "running" ? view : undefined; }, "child running");
    childId = parent.delegated![0]!.work_id;
    // Taken back from the board: the sub-task stops and the board marks it.
    const after = await service.takeBack(childId);
    assert.equal(after.work.work_id, sent.work.work_id, "the board shown is the delegating work's");
    assert.equal(after.delegated![0]!.taken_back, true);
    const checked = await service.delegation(store.get("web-user", sent.work.work_id))!.status({ work_ids: [childId] });
    assert.match(checked[0]!.note ?? "", /由你在这项工作里完成/, "a round still checking on it reads what taking it back means");
    await until(async () => ["stopped", "failed"].includes((await service.read(childId)).work.state), "child stopped");
    await assert.rejects(service.takeBack(childId), /已经收回/);
    // The delegating work's next round hears it, and a follow-up to the sub-task is refused.
    await service.send({ work_id: sent.work.work_id, text: "结论那部分你自己接着写完", request_id: "req-delegation-takeback-2" }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const told = parentBodies.find(body => body.includes("用户收回的子任务"));
    assert.ok(told && told.includes("起草结论") && told.includes("不要再委托出去"), "the round is told the part is back");
    const last = parentBodies.at(-1)!;
    assert.match(last, /用户已把这个子任务收回到这项工作/, "the follow-up was refused");
    assert.equal((await service.read(childId)).work.follow_ups ?? 0, 0);
  } finally { releaseChild(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

/** A delegating work and a runtime whose model can be held or switched off; the parent's model script is the caller's. */
async function delegationFixture(t: import("node:test").TestContext, parentScript: Array<() => Response>, child: (round: number, signal: AbortSignal | null | undefined) => Promise<Response>) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-fixture-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  let parentStep = 0, childRound = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托给你的子任务")) return child(childRound++, init.signal);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))();
  });
  const flags = { model: true, beforeAuthority: undefined as (() => Promise<void>) | undefined, beforeStart: undefined as (() => Promise<void>) | undefined, assertBeforeStart: undefined as (() => void) | undefined };
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-fixture-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => flags.model ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" } : null, resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => {
      const base = assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work));
      if (!work.delegated_by) await flags.beforeAuthority?.();
      return { ...base, beforeStart: async () => { await base.beforeStart?.(); if (!work.delegated_by) await flags.beforeStart?.(); }, assertBeforeStart: () => { base.assertBeforeStart?.(); if(!work.delegated_by)flags.assertBeforeStart?.(); } };
    }, projectTitle: async () => "项目" }, "web-user");
  return { service, store, project, flags, adapter, home, close: async () => { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a sub-task the person put away still counts for the work that handed it out: its tokens, its place among the limit, and the stop", { timeout: 60_000 }, async t => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const f = await delegationFixture(t, [() => reply({ name: "delegate-work", input: { title: "起草", brief: "起草一段话。", acceptance: "一段话" } }), () => reply(undefined, "已交给子任务。")],
    async (round, signal) => {
      // The first round answers at once; a later one (after a follow-up) takes its time and gives up when stopped.
      if (round > 0) await Promise.race([held, new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }))]);
      return reply(undefined, "草稿。");
    });
  try {
    const sent = await f.service.send({ text: "分给子任务起草", request_id: "req-delegation-archived" }, { project_ref: f.project });
    // The parent ended without checking on its sub-task, so the result comes back to it in one more round of its own
    // (specs/prologue-adoption §4.6): the parent's round, the sub-task's, and that hand-back round.
    const parent = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" && view.rounds.length === 2 && view.delegated?.[0]?.state === "completed" ? view : undefined; }, "child done, handed back");
    const childId = parent.delegated![0]!.work_id;
    const before = (await f.service.read(sent.work.work_id)).usage!;
    assert.ok(before.tokens > 0 && before.rounds === 3, JSON.stringify(before));

    await f.service.archive(childId, true);
    assert.equal((await f.service.read(sent.work.work_id)).delegated, undefined, "the board no longer shows a sub-task put away");
    assert.deepEqual((await f.service.read(sent.work.work_id)).usage, before, "its tokens and rounds still count toward the work's cap");

    // Its place among the six also stays: three more handed out and three put away leave no room.
    const made = [childId];
    for (let index = 0; index < 5; index++) {
      const extra = f.store.create({ actor_id: "web-user", title: `子任务 ${index}`, scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project,
        delegated_by: { work_id: sent.work.work_id, title: sent.work.title, acceptance: "完成" } });
      made.push(extra.work_id);
    }
    for (const id of made.slice(1, 3)) await f.service.archive(id, true);
    const delegation = f.service.delegation(f.store.get("web-user", sent.work.work_id))!;
    await assert.rejects(delegation.start({ title: "第七个", brief: "再来一个。", acceptance: "完成" }), (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid");

    // The parent's stop reaches a put-away sub-task that a follow-up has set going again.
    await delegation.follow_up(childId, "再改改");
    await until(async () => (await f.service.read(childId)).work.state === "running", "the sub-task runs again");
    const stopped = await f.service.control(sent.work.work_id, { kind: "stop" });
    assert.equal(stopped.work.state, "completed", "the parent's own finished round stays finished");
    const child = await until(async () => { const view = await f.service.read(childId); return ["stopped", "failed"].includes(view.work.state) ? view : undefined; }, "the put-away sub-task stopped");
    assert.equal(child.work.state, "stopped");
  } finally { release(); await f.close(); }
});

test("a sub-task whose first round cannot start is not left behind: no idle orphan, and failed starts do not use up the slots", { timeout: 60_000 }, async t => {
  const f = await delegationFixture(t, [], async () => reply(undefined, "草稿。"));
  try {
    const parent = f.store.create({ actor_id: "web-user", title: "总任务", scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project });
    const delegation = f.service.delegation(parent)!;
    f.flags.model = false;
    // Seven failed starts: each says why, none is told the six are used up.
    for (let attempt = 0; attempt < 7; attempt++) {
      await assert.rejects(delegation.start({ title: `子任务 ${attempt}`, brief: "做一点。", acceptance: "完成" }), (error: unknown) => !(error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid") && /模型/.test(String((error as Error).message)));
    }
    assert.deepEqual(f.store.delegatedBy("web-user", parent.work_id), [], "no orphan is left on the board");
    assert.deepEqual(f.store.list("web-user", { archived: true }).concat(f.store.list("web-user")).map(work => work.work_id), [parent.work_id], "nor anywhere else");
    f.flags.model = true;
    const started = await delegation.start({ title: "能开始的", brief: "做一点。", acceptance: "完成" });
    assert.equal(f.store.delegatedBy("web-user", parent.work_id).length, 1);
    assert.equal(started.title, "能开始的");
  } finally { await f.close(); }
});


for (const stage of ["authority", "before-start", "sdk-prepared-start"] as const) test(`W2-18-HANDBACK-CURRENT-01: archive during ${stage} prevents an automatic accepted run`, { timeout: 60_000 }, async t => {
  const childWaiting = Promise.withResolvers<void>(), finishChild = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let parentCalls = 0;
  const f = await delegationFixture(t, [
    () => { parentCalls++; return reply({ name: "delegate-work", input: { title: "Draft", brief: "写出一段交回的文字。", acceptance: "一段文字" } }); },
    () => { parentCalls++; return reply(undefined, "子任务正在写。等它交回。" ); },
    () => { parentCalls++; return reply(undefined, "恢复后已核对交回的完整文字。"); },
  ], async () => { childWaiting.resolve(); await finishChild.promise; return reply(undefined, "已交回的一段完整文字。"); });
  try {
    const sent = await f.service.send({ text: "委托起草并等它交回", request_id: "handback-archive-" + stage }, { project_ref: f.project });
    await childWaiting.promise;
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "parent finishes before child");
    const before = f.store.get("web-user", sent.work.work_id); assert.ok(before.session_id);
    const beforeSession = await f.adapter.readSession({ session_id: before.session_id }); assert.equal(beforeSession.runs.length, 1);
    if (stage === "authority") f.flags.beforeAuthority = async () => { entered.resolve(); await release.promise; };
    else if (stage === "before-start") f.flags.beforeStart = async () => { entered.resolve(); await release.promise; };
    else {
      const inspector = createNodeHost({ storageRoot: join(f.home, "sdk") });
      const indexKind = "molis-agent-index-" + createHash("sha256").update("io.molis.work.assistant-delegation-fixture-test").digest("hex").slice(0, 24);
      let armed = false, held = false;
      f.flags.assertBeforeStart = () => {
        if(!armed || !/[\\/]session[\\/]core[\\/]session\.js/.test(new Error().stack ?? ""))return;
        armed=false;
        // The real SDK Session commit calls this original authority checker synchronously.
        // Archive in that checker; the hand-back's final guard must reject before SDK acceptance.
        f.store.update("web-user",sent.work.work_id,null,{archived:true});
      };
      f.flags.beforeStart = async () => {
        const bytes = await inspector.storage.readSecure({ kind: indexKind, id: before.session_id! });
        const prepared = JSON.parse(new TextDecoder().decode(bytes)); bytes.fill(0);
        if (!held && prepared.attempts.length > beforeSession.runs.length && !prepared.attempts.at(-1).run_id) {
          held = true; entered.resolve(); await release.promise; armed = true;
        }
      };
    }
    finishChild.resolve(); await entered.promise;
    if (stage !== "sdk-prepared-start") await f.service.archive(sent.work.work_id, true);
    release.resolve();
    await until(() => f.service.notices(null).some(notice => notice.kind === "needs-decision" && notice.text.includes("没有自动接着做")), "cancelled hand-back settles");
    const after = await f.adapter.readSession({ session_id: before.session_id });
    assert.deepEqual(after.runs, beforeSession.runs, "the actual SDK accepted no hand-back run");
    assert.equal(f.store.rounds(sent.work.work_id).length, 1); assert.equal(f.store.get("web-user", sent.work.work_id).archived, true);
    assert.equal(parentCalls, 2, "no automatic model inference was dispatched");
    const child = f.store.delegatedBy("web-user", sent.work.work_id, "any")[0]!;
    assert.equal(child.handed_back_run, undefined, "a rejected hand-back did not consume the child's result");
    f.flags.beforeAuthority = undefined; f.flags.beforeStart = undefined; f.flags.assertBeforeStart = undefined;
    await f.service.archive(sent.work.work_id, false);
    await f.service.send({ work_id: sent.work.work_id, text: "恢复后核对子任务交回的结果", request_id: "handback-resume-" + stage });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "explicit resumed round completes");
    assert.equal(f.store.rounds(sent.work.work_id).length, 2);
    assert.equal(f.store.get("web-user", child.work_id).handed_back_run, f.store.rounds(child.work_id).at(-1)?.run_id);
    assert.equal((await f.adapter.readSession({ session_id: before.session_id })).runs.length, 2);
    assert.equal(parentCalls, 3);
  } finally { finishChild.resolve(); release.resolve(); await f.close(); }
});


for (const change of ["stop", "new-round"] as const) test(`W2-18-HANDBACK-CURRENT-02: ${change} invalidates an older prepared hand-back`, { timeout: 60_000 }, async t => {
  const waiting = Promise.withResolvers<void>(), childRelease = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "Draft", brief: "写一段交回。", acceptance: "一段文字" } }),
    () => reply(undefined, "主任务先收工，等子任务交回。"),
    () => reply(undefined, "按用户的新要求核对子任务并完成。"),
  ], async () => { waiting.resolve(); await childRelease.promise; return reply(undefined, "子任务的固定交回文字。"); });
  try {
    const sent = await f.service.send({ text: "委托起草", request_id: "handback-current-" + change }, { project_ref: f.project });
    await waiting.promise; await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed");
    const parent = f.store.get("web-user", sent.work.work_id); assert.ok(parent.session_id);
    f.flags.beforeAuthority = async () => { entered.resolve(); await release.promise; };
    childRelease.resolve(); await entered.promise; f.flags.beforeAuthority = undefined;
    if (change === "stop") await f.service.control(parent.work_id, { kind: "stop" });
    else {
      await f.service.send({ work_id: parent.work_id, text: "按我这次新要求继续核对", request_id: "new-parent-round" });
      await until(async () => (await f.service.read(parent.work_id)).work.state === "completed");
    }
    release.resolve();
    await until(() => f.service.notices(null).some(notice => notice.text.includes("没有自动接着做")), "old hand-back refused");
    const child = f.store.delegatedBy("web-user", parent.work_id, "any")[0]!;
    assert.equal((await f.adapter.readSession({ session_id: parent.session_id })).runs.length, change === "stop" ? 1 : 2);
    if (change === "stop") {
      assert.equal(child.handed_back_run, undefined); assert.equal(f.store.get("web-user", parent.work_id).hand_back_held, f.store.rounds(parent.work_id)[0]!.run_id);
      await f.service.send({ work_id: parent.work_id, text: "现在由我明确要求继续核对交回结果", request_id: "resume-stopped-handback" });
      await until(async () => (await f.service.read(parent.work_id)).work.state === "completed");
    }
    assert.equal(f.store.rounds(parent.work_id).length, 2);
    assert.equal((await f.adapter.readSession({ session_id: parent.session_id })).runs.length, 2, "only the person's current continuation was accepted");
    assert.equal(f.store.get("web-user", child.work_id).handed_back_run, f.store.rounds(child.work_id).at(-1)?.run_id);
  } finally { childRelease.resolve(); release.resolve(); await f.close(); }
});
