import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

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
    await assert.rejects(delegation.follow_up(child.work.work_id, "再改一次"), (error: unknown) => error instanceof AssistantError && error.code === "assistant.limit", "follow-ups are bounded");
    const other = await service.send({ text: "别的事", request_id: "req-delegation-2" }, { project_ref: project });
    await assert.rejects(service.delegation(store.get("web-user", other.work.work_id))!.stop(child.work.work_id), (error: unknown) => error instanceof AssistantError && error.code === "assistant.scope");
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
