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
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { roundParts } from "./fixtures/round-parts.js";

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
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const names = (body.tools ?? []).map((tool: { name: string }) => tool.name);
    if (JSON.stringify(body.messages).includes("委托的子任务")) { childTools.push(names); return reply(undefined, "三条要点：1. 每周手工对账两小时。2. 希望自动化。3. 愿意试用。"); }
    parentTools.push(names);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  // What each round asked the Host for: a delegated work never gets the person's side panel browser.
  const starts: Array<{ task: string; browser?: false; queued?: unknown }> = [];
  const start = host.start.bind(host);
  host.start = (async (runtime, input, authority) => { starts.push(input as never); return start(runtime, input, authority); }) as typeof host.start;
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
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
    assert.ok(starts.every(input => input.queued === "carry"), "RC-06: each round takes the words its session kept from a round that had just ended");
    await service.list();
    assert.deepEqual(service.notices(null).filter(notice => notice.work_id === child.work.work_id), [], "a delegated work reports to its parent, not to the person");

    // WG-01: the work's own graph — its root held by its session, the part a step under it held by the part's session,
    // ended as the part's round ended; the part keeps only that step, and which work asked is read from the graph.
    const works = host.adapter("prologue").collaboration!.works!, parentStored = store.get("web-user", sent.work.work_id), childStored = store.get("web-user", child.work.work_id);
    const graph = () => works.read(parentStored.graph_id!);
    assert.deepEqual((await graph()).map(node => [node.node_id, node.parent ?? null, node.session_id, node.state]),
      [["work", null, parentStored.session_id, "running"], [childStored.delegated_by!.node_id, "work", childStored.session_id, "succeeded"]]);
    assert.equal(childStored.graph_id, undefined, "a part stands on its delegating work's graph, not one of its own");
    const delegation = service.delegation(store.get("web-user", sent.work.work_id))!;
    // WG-02: each follow-up is a step of its own under the part, never the ended step reopened; a third is refused.
    await delegation.follow_up(child.work.work_id, "每条再短一点");
    await until(async () => (await graph()).every(node => node.node_id === "work" || ["succeeded", "failed", "cancelled"].includes(node.state)), "first follow-up ended");
    await delegation.follow_up(child.work.work_id, "去掉编号");
    await until(async () => (await graph()).every(node => node.node_id === "work" || ["succeeded", "failed", "cancelled"].includes(node.state)), "second follow-up ended");
    // W2-18-A4-LIMITS-01: the limits are the Assistant's own table, in the words the model has always been told.
    await assert.rejects(delegation.follow_up(child.work.work_id, "再改一次"), (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid"
      && error.message === "已经追加过 2 次；仍达不到验收时停止它，并把实际情况告诉用户", "follow-ups are bounded");
    const part = childStored.delegated_by!.node_id;
    assert.deepEqual((await graph()).filter(node => node.node_id !== "work").map(node => [node.node_id, node.parent, node.state]),
      [[part, "work", "succeeded"], [`${part}.f1`, part, "succeeded"], [`${part}.f2`, part, "succeeded"]]);
    assert.equal((await service.read(sent.work.work_id)).delegated![0]!.follow_ups, 2, "the board counts the follow-ups from the graph");
    const other = await service.send({ text: "别的事", request_id: "req-delegation-2" }, { project_ref: project });
    await assert.rejects(service.delegation(store.get("web-user", other.work.work_id))!.stop(child.work.work_id), (error: unknown) => error instanceof ActionError && error.code === "assistant.scope" && error.kind === "forbidden");
    assert.equal(service.delegation(store.get("web-user", child.work.work_id)), undefined);
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a sub-task reports to the work that handed it over: its report is not held for the identifiers that work needs (D1②, ADH-17)", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  let childRequests = 0, parentStep = 0;
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "查能力", brief: "查一下能用哪些能力，交回结果。", acceptance: "列出能力" } }),
    () => reply({ name: "check-delegated-work", input: { wait_seconds: 20 } }),
    () => reply(undefined, "我用 check-delegated-work 看过了。"),
    (body: unknown) => { assert.match(JSON.stringify(body), /internal identifiers \(check-delegated-work\)/, "the person's own work is still held for it"); return reply(undefined, "子任务已经交回结果。"); },
  ];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托的子任务")) { childRequests++; return reply(undefined, "用 find-capabilities 查过了：这里能新建待办。"); }
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "分给子任务查一下能用哪些能力", request_id: "req-delegation-ids" }, { project_ref: { project_id: "board", storage_key: "memory:project" } });
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.length ? view : undefined; }, "parent completion");
    const child = await service.read(done.delegated![0]!.work_id);
    assert.equal(child.work.state, "completed");
    assert.equal(childRequests, 1, "the sub-task's report went back as it was");
    assert.deepEqual(child.rounds[0]!.activity.filter(item => item.verb === "auto-continue"), []);
    assert.equal(parentStep, 4, "the parent's own reply was held once for the tool's name");
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a sub-task whose session opened under the Assistant's own role carries its next round as the delegated role, on that same session", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegated-role-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const requests: Array<{ system: string; messages: string }> = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push({ system: JSON.stringify(body.system ?? ""), messages: JSON.stringify(body.messages) });
    return reply(undefined, "这一部分做完了。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegated-role-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  const delegatedLayer = /你在做另一项工作委托出来的一部分/;
  try {
    const parent = await service.send({ text: "主工作", request_id: "req-delegated-role-1" }, { project_ref: project });
    await until(async () => (await service.read(parent.work.work_id)).work.state === "completed", "parent completion");
    assert.doesNotMatch(requests[0]!.system, delegatedLayer, "the person's own work runs as the Assistant");
    assert.match(requests[0]!.system, /## 分工[\s\S]*## 记忆/, "with its own layer on delegating and memory");
    // A sub-task as works were handed out before the delegated role existed: its session was opened under the Assistant's role.
    const child = store.create({ actor_id: "web-user", title: "早先的子任务", scope: parent.work.scope, origin: { surface: "assistant", title: `「${parent.work.title}」委托` }, project_ref: project,
      delegated_by: { graph_id: store.get("web-user", parent.work.work_id).graph_id!, node_id: "p-earlier", title: parent.work.title, acceptance: "一段话" } });
    const session = await host.createSession("prologue", { project_id: project.project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: "web-user",
      title: child.title, workspace: "business", role_id: "assistant" }, await assistantAuthority(local, child, () => new Set()));
    store.update("web-user", child.work_id, null, { session_id: session.session_id });
    await service.delegation(store.get("web-user", parent.work.work_id))!.follow_up(child.work_id, "接着把这一部分做完");
    await until(async () => (await service.read(child.work_id)).work.state === "completed", "sub-task completion");
    assert.equal(store.get("web-user", child.work_id).session_id, session.session_id, "it keeps the session it had");
    const run = (await host.adapter("prologue").readSession({ session_id: session.session_id })).latest_run!;
    assert.equal(run.frozen.role_id, "assistant-delegated");
    assert.deepEqual(run.frozen.prompts.map(prompt => prompt.prompt_id).filter(id => id.startsWith("assistant-") && id !== "assistant-compaction"), ["assistant-base", "assistant-delegated"]);
    // The sub-task's own round (the delegating work then goes on by itself once it is handed back, as the Assistant).
    const own = requests.filter(request => request.messages.includes("接着把这一部分做完") && !request.messages.includes("子任务都已交回"));
    assert.ok(own.length > 0 && own.every(request => delegatedLayer.test(request.system)), "the sub-task's round carries the delegated layer");
    assert.ok(own.every(request => !/## 分工|## 记忆/.test(request.system)), "and not the delegating work's layer: it neither delegates nor keeps memories");
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
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
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托的子任务")) {
      // A model request that takes its time, and gives up when the run is stopped (as a real one does).
      await Promise.race([childHeld, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, "草稿。");
    }
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-stop-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
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
  } finally { releaseChild(); service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
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
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const text = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(text);
    if (JSON.stringify(body.messages).includes("委托的子任务")) {
      await Promise.race([childHeld, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, "草稿。");
    }
    parentBodies.push(text);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))(body);
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-takeback-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
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
    assert.match(checked[0]!.note ?? "", /用户把这个子任务收回到这项工作：它已停下，已产出的保留。/, "a round still checking on it reads that it was taken back");
    await until(async () => ["stopped", "failed"].includes((await service.read(childId)).work.state), "child stopped");
    await assert.rejects(service.takeBack(childId), /已经收回/);
    // The delegating work's next round hears it, and a follow-up to the sub-task is refused.
    await service.send({ work_id: sent.work.work_id, text: "结论那部分你自己接着写完", request_id: "req-delegation-takeback-2" }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const told = parentBodies.find(body => roundParts(body).data.includes("用户收回的子任务"));
    assert.ok(told && roundParts(told).data.includes("起草结论"), "the round is told the part is back");
    // ADH-12: that it is back is the data; finishing it here, not delegating it again, is the work layer's, said once.
    assert.doesNotMatch(roundParts(told).data, /不要再委托出去/);
    assert.match(roundParts(told).role, /用户收回的子任务由这项工作接着做完（可以读取它们已产出的对象），不再委托出去，也不再对它们追加要求。/);
    const last = parentBodies.at(-1)!;
    assert.match(last, /用户已把这个子任务收回到这项工作/, "the follow-up was refused");
    assert.equal((await service.read(sent.work.work_id)).delegated![0]!.follow_ups, 0);
    // WG-03: on the graph the person ended what of the part was not done, as theirs; nothing was handed to the delegating
    // work's session, whose rounds still stand on its own root.
    const stored = store.get("web-user", sent.work.work_id), nodes = await host.adapter("prologue").collaboration!.works!.read(stored.graph_id!);
    const step = nodes.find(node => node.node_id === store.get("web-user", childId).delegated_by!.node_id)!;
    assert.equal(step.state, "cancelled");
    assert.equal(step.ended_by_person?.note, "用户把这个子任务收回到这项工作：它已停下，已产出的保留。");
    assert.deepEqual(nodes.filter(node => node.session_id === stored.session_id).map(node => node.node_id), ["work"]);
  } finally { releaseChild(); service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

/** A delegating work and a runtime whose model can be held or switched off; the parent's model script is the caller's. */
async function delegationFixture(t: import("node:test").TestContext, parentScript: Array<() => Response>, child: (round: number, signal: AbortSignal | null | undefined) => Promise<Response>) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-fixture-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  let parentStep = 0, childRound = 0;
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托的子任务")) return child(childRound++, init.signal);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))();
  }));
  const flags = { model: true, beforeAuthority: undefined as (() => Promise<void>) | undefined, beforeStart: undefined as (() => Promise<void>) | undefined, assertBeforeStart: undefined as (() => void) | undefined,
    partBeforeStart: undefined as (() => Promise<void>) | undefined };
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-fixture-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => flags.model ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" } : null, resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => {
      const base = assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work));
      if (!work.delegated_by) await flags.beforeAuthority?.();
      return { ...base, beforeStart: async () => { await base.beforeStart?.(); await (work.delegated_by ? flags.partBeforeStart : flags.beforeStart)?.(); }, assertBeforeStart: () => { base.assertBeforeStart?.(); if(!work.delegated_by)flags.assertBeforeStart?.(); } };
    }, projectTitle: async () => "项目" }, "web-user");
  return { service, store, project, flags, adapter, home, close: async () => { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
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

    await f.service.archive(childId, await f.service.lifecycle.preview(childId, true), { beforeEffect: async () => {}, assert_current: () => {} });
    assert.equal((await f.service.read(sent.work.work_id)).delegated, undefined, "the board no longer shows a sub-task put away");
    assert.deepEqual((await f.service.read(sent.work.work_id)).usage, before, "its tokens and rounds still count toward the work's cap");

    // Its place among the six also stays: three more handed out and three put away leave no room.
    const made = [childId];
    for (let index = 0; index < 5; index++) {
      const extra = f.store.create({ actor_id: "web-user", title: `子任务 ${index}`, scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project,
        delegated_by: { graph_id: f.store.get("web-user", sent.work.work_id).graph_id!, node_id: `p-extra-${index}`, title: sent.work.title, acceptance: "完成" } });
      made.push(extra.work_id);
    }
    for (const id of made.slice(1, 3)) await f.service.archive(id, await f.service.lifecycle.preview(id, true), { beforeEffect: async () => {}, assert_current: () => {} });
    const delegation = f.service.delegation(f.store.get("web-user", sent.work.work_id))!;
    // W2-18-A4-LIMITS-01
    await assert.rejects(delegation.start({ title: "第七个", brief: "再来一个。", acceptance: "完成" }), (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid"
      && error.message === "这项工作已经委托了 6 个子任务，不能再多；请自己完成剩下的部分或告诉用户");

    // A delegation cannot implicitly restore what the person archived. The original Session and rounds stay put.
    const archivedChild = f.store.get("web-user", childId), childSession = await f.adapter.readSession({ session_id: archivedChild.session_id! });
    const childRounds = f.store.rounds(childId);
    await assert.rejects(delegation.follow_up(childId, "归档时不能追加"), { code: "assistant.conflict" });
    assert.deepEqual((await f.adapter.readSession({ session_id: archivedChild.session_id! })).runs, childSession.runs);
    assert.deepEqual(f.store.rounds(childId), childRounds);
    await f.service.archive(childId, await f.service.lifecycle.preview(childId, false), { beforeEffect: async () => {}, assert_current: () => {} });
    // After the person's explicit restore, the parent's stop still reaches the same independent sub-task.
    await delegation.follow_up(childId, "再改改");
    await until(async () => (await f.service.read(childId)).work.state === "running", "the sub-task runs again");
    const stopped = await f.service.control(sent.work.work_id, { kind: "stop" });
    assert.equal(stopped.work.state, "completed", "the parent's own finished round stays finished");
    const child = await until(async () => { const view = await f.service.read(childId); return ["stopped", "failed"].includes(view.work.state) ? view : undefined; }, "the put-away sub-task stopped");
    assert.equal(child.work.state, "stopped");
  } finally { release(); await f.close(); }
});

// W2-18-A4-LIMITS-01: three parts with a step still going leave no room for a fourth, in the words the model has always been told.
test("W2-18-A4-LIMITS-01 three sub-tasks still going leave no room for another one", { timeout: 60_000 }, async t => {
  const f = await delegationFixture(t, [() => reply({ name: "delegate-work", input: { title: "起草", brief: "起草一段话。", acceptance: "一段话" } }), () => reply(undefined, "已交给子任务。")],
    async () => reply(undefined, "草稿。"));
  try {
    const sent = await f.service.send({ text: "分给子任务起草", request_id: "req-delegation-active" }, { project_ref: f.project });
    await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" && view.rounds.length === 2 && view.delegated?.[0]?.state === "completed" ? view : undefined; }, "child done, handed back");
    const parent = f.store.get("web-user", sent.work.work_id), works = f.adapter.collaboration!.works!;
    // Three parts whose step has not ended (the finished one is not going).
    for (let index = 0; index < 3; index++) {
      const node_id = `p-going-${index}`;
      await works.add({ graph_id: parent.graph_id!, node_id, under: "work", session_id: parent.session_id!, title: `子任务 ${index}` });
      f.store.create({ actor_id: "web-user", title: `子任务 ${index}`, scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project,
        delegated_by: { graph_id: parent.graph_id!, node_id, title: parent.title, acceptance: "完成" } });
    }
    await assert.rejects(f.service.delegation(f.store.get("web-user", sent.work.work_id))!.start({ title: "第五个", brief: "再来一个。", acceptance: "完成" }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.message === "已有 3 个子任务在进行，等其中一个结束再委托");
    assert.equal(f.store.delegatedBy("web-user", parent).length, 4, "the refused one left no work behind");
  } finally { await f.close(); }
});

// W2-18-DELEGATION-PLACED-01: the person's own round in a finished sub-task stands on a new step under it. A round that
// does not start ends that step again, so the part is not left "still working": its place among the limit is free and
// its delegating work is handed back to again.
test("W2-18-DELEGATION-PLACED-01: a round in a finished sub-task that does not start leaves no open step behind", { timeout: 60_000 }, async t => {
  const held = Promise.withResolvers<void>();
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "Draft", brief: "写一段。", acceptance: "一段文字" } }),
    () => reply(undefined, "交出去了，等它交回。"),
  ], async round => { if (round > 0) await held.promise; return reply(undefined, `第 ${round + 1} 段文字。`); });
  try {
    const sent = await f.service.send({ text: "委托起草", request_id: "req-placed-refused" }, { project_ref: f.project });
    const handedBack = (rounds: number) => until(async () => f.store.rounds(sent.work.work_id).length === rounds && (await f.service.read(sent.work.work_id)).work.state === "completed", `hand-back round ${rounds}`);
    await handedBack(2);
    const parent = f.store.get("web-user", sent.work.work_id), childId = f.store.delegatedBy("web-user", parent)[0]!.work_id;
    f.flags.model = false;
    await assert.rejects(f.service.send({ work_id: childId, text: "再改一下", request_id: "req-placed-refused-child" }, { project_ref: f.project }), /模型/);
    f.flags.model = true;
    const nodes = await f.adapter.collaboration!.works!.read(parent.graph_id!);
    assert.deepEqual(nodes.filter(node => node.node_id !== "work" && !["succeeded", "failed", "cancelled"].includes(node.state)).map(node => node.node_id), [], "no step of the part is left open");
    assert.equal(nodes.find(node => /\.r1$/.test(node.node_id))?.state, "cancelled", "the round's own step ended again");
    // Its place is free: the limit's three parts can be handed out, all held running.
    const delegation = f.service.delegation(parent)!;
    for (const title of ["A", "B", "C"]) await delegation.start({ title, brief: "写一段。", acceptance: "一段文字" });
    held.resolve();
    await handedBack(3);
  } finally { held.resolve(); await f.close(); }
});

// W2-18-DELEGATION-PLACED-02 (BL-154): two sends in a finished sub-task at once. The first adds the step both stand on and
// then fails before it starts; the second found the step open and went on with it. The first does not end it under it.
test("W2-18-DELEGATION-PLACED-02: a round that does not start leaves alone the step another round of the same session went on with", { timeout: 60_000 }, async t => {
  const held = Promise.withResolvers<void>(), stopped = Promise.withResolvers<void>(), failing = Promise.withResolvers<void>();
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "Draft", brief: "写一段。", acceptance: "一段文字" } }),
    () => reply(undefined, "交出去了，等它交回。"),
  ], async round => { if (round > 0) await held.promise; return reply(undefined, `第 ${round + 1} 段文字。`); });
  try {
    const sent = await f.service.send({ text: "委托起草", request_id: "req-placed-shared" }, { project_ref: f.project });
    await until(async () => f.store.rounds(sent.work.work_id).length === 2 && (await f.service.read(sent.work.work_id)).work.state === "completed", "handed back");
    const parent = f.store.get("web-user", sent.work.work_id), childId = f.store.delegatedBy("web-user", parent)[0]!.work_id;
    const steps = async () => (await f.adapter.collaboration!.works!.read(parent.graph_id!)).filter(node => /\.r\d+$/.test(node.node_id));
    let first = true;
    f.flags.partBeforeStart = async () => { if (!first) return; first = false; stopped.resolve(); await failing.promise; throw new Error("这一轮临时出错"); };
    const a = f.service.send({ work_id: childId, text: "再改一下", request_id: "req-placed-shared-a" }, { project_ref: f.project });
    a.catch(() => undefined);
    await stopped.promise;
    await f.service.send({ work_id: childId, text: "再加一句", request_id: "req-placed-shared-b" }, { project_ref: f.project });
    await until(async () => (await steps())[0]?.state === "running", "the second round runs on the step the first added");
    failing.resolve();
    await assert.rejects(a, /临时出错/);
    assert.deepEqual((await steps()).map(step => [step.node_id.replace(/^.*\./, ""), step.state]), [["r1", "running"]], "one step for both rounds, still the second round's");
    held.resolve();
    await until(async () => (await steps())[0]?.state === "succeeded", "it ends as the second round did");
  } finally { held.resolve(); failing.resolve(); await f.close(); }
});

test("a sub-task whose first round cannot start is not left behind: no idle orphan, and failed starts do not use up the slots", { timeout: 60_000 }, async t => {
  const f = await delegationFixture(t, [], async () => reply(undefined, "草稿。"));
  try {
    // A work's graph is opened before its first round: the round that delegates has one.
    const sent = await f.service.send({ text: "总任务", request_id: "req-delegation-orphan" }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "parent's own round");
    const parent = f.store.get("web-user", sent.work.work_id);
    const delegation = f.service.delegation(parent)!;
    f.flags.model = false;
    // Seven failed starts: each says why, none is told the six are used up.
    for (let attempt = 0; attempt < 7; attempt++) {
      await assert.rejects(delegation.start({ title: `子任务 ${attempt}`, brief: "做一点。", acceptance: "完成" }), (error: unknown) => !(error instanceof ActionError && error.code === "assistant.limit" && error.kind === "invalid") && /模型/.test(String((error as Error).message)));
    }
    assert.deepEqual(f.store.delegatedBy("web-user", parent), [], "no orphan is left on the board");
    // WG-04: nor on the graph — a part that never started leaves no step that still has something to do.
    const nodes = await f.adapter.collaboration!.works!.read(parent.graph_id!);
    assert.deepEqual(nodes.filter(node => node.node_id !== "work" && !["succeeded", "failed", "cancelled"].includes(node.state)), []);
    assert.deepEqual(f.store.list("web-user", { archived: true }).concat(f.store.list("web-user")).map(work => work.work_id), [parent.work_id], "nor anywhere else");
    f.flags.model = true;
    const started = await delegation.start({ title: "能开始的", brief: "做一点。", acceptance: "完成" });
    assert.equal(f.store.delegatedBy("web-user", parent).length, 1);
    assert.equal(started.title, "能开始的");
  } finally { await f.close(); }
});


/** A work's root on its own graph: what it waits for, and the continuation its next round takes up (§6.0n). */
const rootOf = async (f: Awaited<ReturnType<typeof delegationFixture>>, workId: string) =>
  (await f.adapter.collaboration!.works!.read(f.store.get("web-user", workId).graph_id!)).find(node => node.node_id === "work")!;

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
    const archiveOriginal = stage === "sdk-prepared-start" ? await f.service.lifecycle.preview(sent.work.work_id, true) : null;
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
    if (stage !== "sdk-prepared-start") await f.service.archive(sent.work.work_id, await f.service.lifecycle.preview(sent.work.work_id, true), { beforeEffect: async () => {}, assert_current: () => {} });
    else {
      const beforeArchive = f.store.get("web-user", sent.work.work_id);
      await assert.rejects(f.service.archive(sent.work.work_id, archiveOriginal!, { beforeEffect: async () => {}, assert_current: () => {} }), { code: "agent.session_busy" });
      assert.deepEqual(f.store.get("web-user", sent.work.work_id), beforeArchive, "a prepared SDK start refuses a real archive without a Work effect");
    }
    release.resolve();
    await until(() => f.service.notices(null).some(notice => notice.kind === "needs-decision" && notice.text.includes("没有自动接着做")), "cancelled hand-back settles");
    const after = await f.adapter.readSession({ session_id: before.session_id });
    assert.deepEqual(after.runs, beforeSession.runs, "the actual SDK accepted no hand-back run");
    assert.equal(f.store.rounds(sent.work.work_id).length, 1); assert.equal(f.store.get("web-user", sent.work.work_id).archived, true);
    assert.equal(parentCalls, 2, "no automatic model inference was dispatched");
    assert.equal((await rootOf(f, sent.work.work_id)).continuation?.state, "eligible", "a rejected hand-back leaves the continuation for the work's next round");
    f.flags.beforeAuthority = undefined; f.flags.beforeStart = undefined; f.flags.assertBeforeStart = undefined;
    // The prepared case injected only the business bit inside the synchronous guard; its SDK remained active.
    if (stage === "sdk-prepared-start") f.store.update("web-user", sent.work.work_id, null, { archived: false });
    else await f.service.archive(sent.work.work_id, await f.service.lifecycle.preview(sent.work.work_id, false), { beforeEffect: async () => {}, assert_current: () => {} });
    await f.service.send({ work_id: sent.work.work_id, text: "恢复后核对子任务交回的结果", request_id: "handback-resume-" + stage }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "explicit resumed round completes");
    assert.equal(f.store.rounds(sent.work.work_id).length, 2);
    // Refused once the SDK had committed the start, the continuation's key starts nothing else: held, the round goes on without it.
    assert.equal((await rootOf(f, sent.work.work_id)).continuation?.state, stage === "sdk-prepared-start" ? "blocked" : "started", "the person's round took it up");
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
      await f.service.send({ work_id: parent.work_id, text: "按我这次新要求继续核对", request_id: "new-parent-round" }, { project_ref: f.project });
      await until(async () => (await f.service.read(parent.work_id)).work.state === "completed");
    }
    release.resolve();
    await until(() => f.service.notices(null).some(notice => notice.text.includes("没有自动接着做")), "old hand-back refused");
    assert.equal((await f.adapter.readSession({ session_id: parent.session_id })).runs.length, change === "stop" ? 1 : 2);
    if (change === "stop") {
      assert.equal((await rootOf(f, parent.work_id)).continuation?.state, "blocked", "the person's stop holds what came back for them");
      await f.service.send({ work_id: parent.work_id, text: "现在由我明确要求继续核对交回结果", request_id: "resume-stopped-handback" }, { project_ref: f.project });
      await until(async () => (await f.service.read(parent.work_id)).work.state === "completed");
    }
    assert.equal(f.store.rounds(parent.work_id).length, 2);
    assert.equal((await f.adapter.readSession({ session_id: parent.session_id })).runs.length, 2, "only the person's current continuation was accepted");
    // The new round took the continuation up; one held for the person after the stop stays held (a new wait replaces it).
    assert.equal((await rootOf(f, parent.work_id)).continuation?.state, change === "stop" ? "blocked" : "started");
  } finally { childRelease.resolve(); release.resolve(); await f.close(); }
});

// The current caller refuses the hand-back only once it holds the continuation (§6.0n): the continuation is given back,
// the person is told, and the hand-back is not started again by itself; the work's next round takes it up.
test("W2-18-HANDBACK-CURRENT-03: a hand-back refused after it took the continuation up is told once and not started again by itself", { timeout: 60_000 }, async t => {
  const childWaiting = Promise.withResolvers<void>(), finishChild = Promise.withResolvers<void>();
  let parentCalls = 0, refused = 0;
  const f = await delegationFixture(t, [
    () => { parentCalls++; return reply({ name: "delegate-work", input: { title: "Draft", brief: "写出一段交回的文字。", acceptance: "一段文字" } }); },
    () => { parentCalls++; return reply(undefined, "子任务正在写。等它交回。"); },
    () => { parentCalls++; return reply(undefined, "已核对交回的文字。"); },
  ], async () => { childWaiting.resolve(); await finishChild.promise; return reply(undefined, "已交回的一段完整文字。"); });
  try {
    const sent = await f.service.send({ text: "委托起草并等它交回", request_id: "handback-refused-once" }, { project_ref: f.project });
    await childWaiting.promise;
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "parent finishes before child");
    f.flags.beforeStart = async () => { if (!refused && (await rootOf(f, sent.work.work_id)).continuation?.state === "claimed") { refused++; throw new Error("这一刻不能开始"); } };
    finishChild.resolve();
    await until(() => f.service.notices(null).some(notice => notice.text.includes("没有自动接着做")), "the refused hand-back is told");
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(refused, 1);
    assert.equal(f.store.rounds(sent.work.work_id).length, 1, "not started again by itself");
    assert.equal(parentCalls, 2);
    assert.equal((await rootOf(f, sent.work.work_id)).continuation?.state, "eligible", "given back for the work's next round");
    f.flags.beforeStart = undefined;
    await f.service.send({ work_id: sent.work.work_id, text: "核对子任务交回的结果", request_id: "handback-refused-once-next" }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed" && f.store.rounds(sent.work.work_id).length === 2, "the person's round");
    assert.equal((await rootOf(f, sent.work.work_id)).continuation?.state, "started", "the person's round took it up");
    assert.equal(parentCalls, 3);
  } finally { finishChild.resolve(); await f.close(); }
});
