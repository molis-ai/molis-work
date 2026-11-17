import { inAssistantPage, noticeText } from "./fixtures/assistant-saved-text.js";
import assert from "node:assert/strict";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import test from "node:test";

// The Assistant words every round's materials in the language it runs in (`format.date`): the process needs the
// Host's text context installed, as a running Host has it.
installHostUiText();
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { installHostUiText, LocalHost, AssistantStore, AssistantService, assistantAuthority, hostQuestionTypes } from "@molis-ai/molis-work-app-local-host";
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

// PWA-127: explicitly handed-off work runs in the background as a work of its own, with nothing proactive switched on in this fixture.
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
    // WLN-32, WLN-09: the board says when each part was handed out and where it stands on the line: a part of a work that is an
    // event of the line is done for that event unless the round placed it elsewhere (a personal work has no line).
    assert.deepEqual([done.delegated![0]!.created_at, done.delegated![0]!.serves, done.delegated![0]!.line_event], [child.work.created_at, sent.work.scope.kind === "project" ? [{ kind: "assistant_work", id: sent.work.work_id }] : undefined, undefined]);
    assert.equal(child.work.state, "completed");
    assert.deepEqual(child.rounds[0]!.materials.map(material => material.title), ["访谈记录"], "the child gets only the material handed to it");
    assert.ok(parentTools[0]!.includes("delegate-work"), "the parent may delegate");
    assert.ok(!childTools[0]!.includes("delegate-work") && !childTools[0]!.includes("check-delegated-work"), "a delegated work does not delegate further");
    assert.deepEqual(done.rounds[0]!.activity.map(item => item.verb), ["delegate", "delegate-check"]);
    assert.equal(starts[0]!.browser, undefined, "the person's own work may use the side panel browser");
    assert.ok(starts.length > 1 && starts.slice(1).every(input => input.browser === false), "the delegated work starts without it");
    assert.ok(starts.every(input => input.queued === "carry"), "RC-06: each round takes the words its session kept from a round that had just ended");
    await service.list();
    assert.deepEqual(service.notices.notices(null).filter(notice => notice.work_id === child.work.work_id), [], "a delegated work reports to its parent, not to the person");

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
    assert.match(requests[0]!.system, /## 分工[\s\S]*## 长期内容/, "with its own layer on delegating and memory");
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

// PWA-134: stopping a work stops its sub-tasks (the subtree), nothing else.
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

// PWA-134: taking a sub-task back acts on that sub-task.
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
async function delegationFixture(t: import("node:test").TestContext, parentScript: Array<() => Response>, child: (round: number, signal: AbortSignal | null | undefined) => Promise<Response>, isChild?: (body: { messages: Array<{ role: string; content?: unknown }> }) => boolean) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delegation-fixture-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  let parentStep = 0, childRound = 0; const parentBodies: string[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (isChild ? isChild(body) : JSON.stringify(body.messages).includes("委托的子任务")) return child(childRound++, init.signal);
    parentBodies.push(JSON.stringify(body));
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))();
  }));
  const flags = { model: true, beforeAuthority: undefined as (() => Promise<void>) | undefined, beforeStart: undefined as (() => Promise<void>) | undefined, assertBeforeStart: undefined as (() => void) | undefined,
    partBeforeStart: undefined as (() => Promise<void>) | undefined };
  const queue = new AgentReviewQueue();
  const openHost = async () => {
    const host = new AgentHost({ reviews: queue });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delegation-fixture-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue, questionTypes: hostQuestionTypes(),
      modelConfiguration: async () => flags.model ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" } : null, resolveCredential: () => "fixture-only" });
    host.register(adapter); return { host, adapter };
  };
  let { host, adapter } = await openHost();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  let service: AssistantService;
  const openService = () => new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => {
      const base = assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work));
      if (!work.delegated_by) await flags.beforeAuthority?.();
      return { ...base, beforeStart: async () => { await base.beforeStart?.(); await (work.delegated_by ? flags.partBeforeStart : flags.beforeStart)?.(); }, assertBeforeStart: () => { base.assertBeforeStart?.(); if(!work.delegated_by)flags.assertBeforeStart?.(); } };
    }, projectTitle: async () => "项目" }, "web-user");
  service = openService();
  return { get service() { return service; }, restart: () => { service.continuations.close(); service = openService(); service.subtaskReports.attach(); },
    restartHost: async () => { service.continuations.close(); await adapter.close(); ({ host, adapter } = await openHost()); service = openService(); },
    store, project, flags, get adapter() { return adapter; }, queue, home, parentBodies, close: async () => { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a sub-task the person put away still counts for the work that handed it out: its tokens and its place among the limit; it takes no follow-up until the person restores it, then the stop reaches it", { timeout: 60_000 }, async t => {
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

    // There is no cap on how many a work hands out in all (specs/work-line/contract-design.md §10): with six there already,
    // some put away, a seventh still starts.
    const made = [childId];
    for (let index = 0; index < 5; index++) {
      const extra = f.store.create({ actor_id: "web-user", title: `子任务 ${index}`, scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project,
        delegated_by: { graph_id: f.store.get("web-user", sent.work.work_id).graph_id!, node_id: `p-extra-${index}`, title: sent.work.title, acceptance: "完成" } });
      made.push(extra.work_id);
    }
    for (const id of made.slice(1, 3)) await f.service.archive(id, true);
    const delegation = f.service.delegation(f.store.get("web-user", sent.work.work_id))!;
    // (No round of the work runs here, so the hand-out itself may be refused for that; what matters is that the count is not why.)
    await delegation.start({ title: "第七个", brief: "再来一个。", acceptance: "完成" }).then(() => undefined, (error: unknown) => assert.notEqual((error as { code?: string }).code, "assistant.limit"));

    // Put away is the person's decision and archives its execution session with it: the work that handed it out cannot set it going again.
    const rounds = f.store.rounds(childId).length;
    await assert.rejects(delegation.follow_up(childId, "再改改"), (error: unknown) => error instanceof ActionError && error.code === "assistant.invalid" && error.kind === "invalid"
      && error.message === "用户已把这个子任务收起，不要再对它追加；还需要它时告诉用户，由用户先恢复它");
    assert.equal(f.store.rounds(childId).length, rounds, "a refused follow-up starts no round");
    assert.equal((await f.service.read(childId)).work.state, "completed");

    // Once the person restores it, a follow-up sets it going again, and the parent's stop reaches it.
    await f.service.archive(childId, false);
    await delegation.follow_up(childId, "再改改");
    await until(async () => (await f.service.read(childId)).work.state === "running", "the sub-task runs again");
    const stopped = await f.service.control(sent.work.work_id, { kind: "stop" });
    assert.equal(stopped.work.state, "completed", "the parent's own finished round stays finished");
    const child = await until(async () => { const view = await f.service.read(childId); return ["stopped", "failed"].includes(view.work.state) ? view : undefined; }, "the put-away sub-task stopped");
    assert.equal(child.work.state, "stopped");
  } finally { release(); await f.close(); }
});

// W2-18-A4-LIMITS-01, PWA-131: five parts with a step still going leave no room for a sixth; it is refused, not shown as running.
// PWA-128: no room for another sub-task is said as refused, not shown as running.
test("W2-18-A4-LIMITS-01 five sub-tasks still going leave no room for another one", { timeout: 60_000 }, async t => {
  const f = await delegationFixture(t, [() => reply({ name: "delegate-work", input: { title: "起草", brief: "起草一段话。", acceptance: "一段话" } }), () => reply(undefined, "已交给子任务。")],
    async () => reply(undefined, "草稿。"));
  try {
    const sent = await f.service.send({ text: "分给子任务起草", request_id: "req-delegation-active" }, { project_ref: f.project });
    await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" && view.rounds.length === 2 && view.delegated?.[0]?.state === "completed" ? view : undefined; }, "child done, handed back");
    const parent = f.store.get("web-user", sent.work.work_id), works = f.adapter.collaboration!.works!;
    // Five parts whose step has not ended (the finished one is not going).
    for (let index = 0; index < 5; index++) {
      const node_id = `p-going-${index}`;
      await works.add({ graph_id: parent.graph_id!, node_id, under: "work", session_id: parent.session_id!, title: `子任务 ${index}` });
      f.store.create({ actor_id: "web-user", title: `子任务 ${index}`, scope: { kind: "project", project_id: "board" }, origin: null, project_ref: f.project,
        delegated_by: { graph_id: parent.graph_id!, node_id, title: parent.title, acceptance: "完成" } });
    }
    await assert.rejects(f.service.delegation(f.store.get("web-user", sent.work.work_id))!.start({ title: "第五个", brief: "再来一个。", acceptance: "完成" }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.limit" && error.message === "已有 5 个子任务在办：这一件没有开始。告诉用户它在排队，等其中一个交回后再委托");
    assert.equal(f.store.delegatedBy("web-user", parent).length, 6, "the refused one left no work behind");
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
    await assert.rejects(inAssistantPage("zh", () => f.service.send({ work_id: childId, text: "再改一下", request_id: "req-placed-refused-child" }, { project_ref: f.project })), /模型/);
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
    if (stage === "authority") f.flags.beforeAuthority = async () => { entered.resolve(); await release.promise; };
    else if (stage === "before-start") f.flags.beforeStart = async () => { entered.resolve(); await release.promise; };
    else {
      const inspector = createNodeHost({ storageRoot: join(f.home, "sdk") });
      const indexKind = "molis-agent-index-" + createHash("sha256").update("io.molis.work.assistant-delegation-fixture-test").digest("hex").slice(0, 24);
      let armed = false, held = false;
      f.flags.assertBeforeStart = () => {
        // The SDK's commit frame can sit deeper than V8's default ten frames (the SDK's own run journal sits between), so read the whole stack.
        const limit = Error.stackTraceLimit; Error.stackTraceLimit = Infinity;
        const stack = new Error().stack ?? ""; Error.stackTraceLimit = limit;
        if(!armed || !/[\\/]session[\\/]core[\\/]session\.js/.test(stack))return;
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
    await until(() => f.service.notices.notices(null).some(notice => notice.kind === "needs-decision" && noticeText(notice).includes("没有自动接着做")), "cancelled hand-back settles");
    const after = await f.adapter.readSession({ session_id: before.session_id });
    assert.deepEqual(after.runs, beforeSession.runs, "the actual SDK accepted no hand-back run");
    assert.equal(f.store.rounds(sent.work.work_id).length, 1); assert.equal(f.store.get("web-user", sent.work.work_id).archived, true);
    assert.equal(parentCalls, 2, "no automatic model inference was dispatched");
    assert.equal((await rootOf(f, sent.work.work_id)).continuation?.state, "eligible", "a rejected hand-back leaves the continuation for the work's next round");
    f.flags.beforeAuthority = undefined; f.flags.beforeStart = undefined; f.flags.assertBeforeStart = undefined;
    await f.service.archive(sent.work.work_id, false);
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
    await until(() => f.service.notices.notices(null).some(notice => noticeText(notice).includes("没有自动接着做")), "old hand-back refused");
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
    await until(() => f.service.notices.notices(null).some(notice => noticeText(notice).includes("没有自动接着做")), "the refused hand-back is told");
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

test("SAI-03/04/05/08/10: Work child input binds the original execution; a lost receipt is queried without resending and a completed continuation replays", { timeout: 60_000 }, async t => {
  const held = Promise.withResolvers<void>(); let childCalls = 0;
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "起草", brief: "写一段。", acceptance: "一段文字" } }),
    () => reply(undefined, "等待子任务。"),
  ], async (round, signal) => {
    childCalls++;
    if (round > 0) await Promise.race([held.promise, new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }))]);
    return reply(undefined, `草稿 ${round + 1}`);
  });
  const caller = (id: string, text: string) => ({ project_ref: f.project, original_input: {
    input_id: id, text, written_by: "person" as const, occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID,
  } });
  try {
    const parent = await f.service.send({ text: "委托起草", request_id: "req-b59-work-parent" }, { project_ref: f.project });
    await until(async () => { const view = await f.service.read(parent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" && view.delegated?.[0]?.state === "completed"; }, "first child and hand-back completed");
    const child = f.store.delegatedBy("web-user", f.store.get("web-user", parent.work.work_id))[0]!;
    const original = (await f.service.readSubtask(child.work_id)).binding!;
    const notify = f.adapter.inputs.notify!.bind(f.adapter.inputs), notices: Array<{ text: string; notification_id: string }> = [];
    const faults = ["before", "after"];
    t.mock.method(f.adapter.inputs, "notify", async (...args: Parameters<typeof notify>) => {
      const fault = faults.shift();
      if (fault === "before") throw new Error("notification transport unavailable before acceptance");
      const result = await notify(...args); notices.push({ text: args[0].text, ...result });
      if (fault === "after") throw new Error("notification response lost after acceptance");
      return result;
    });
    const request_id = "req-b59-work-continue", text = "只继续这项子任务";
    const input = { work_id: child.work_id, request_id, text, subtask: { binding: original, operation: "continue" as const } };
    const continued = await f.service.send(input, caller(request_id, text));
    assert.equal(continued.work.session_id, original.run.session_id);
    assert.notEqual(continued.run_id, original.run.run_id);
    await f.service.subtaskReports.idle();
    assert.equal(notices.length, 0, "a failed report does not roll back or repeat the accepted child input");
    f.restart(); await f.service.subtaskReports.idle();
    assert.equal(notices.length, 1, "a fresh service finds the accepted input from its original owner");
    f.restart(); await f.service.subtaskReports.idle();
    assert.equal(new Set(notices.map(one => one.notification_id)).size, 1, "recovery after a lost report receipt keeps its original envelope");
    await until(() => childCalls === 2, "the second child attempt is running");
    const active = (await f.service.readSubtask(child.work_id)).binding!;
    await assert.rejects(f.service.control(child.work_id, { kind: "stop", request_id: "req-b59-stale-stop", subtask: original }), (error: unknown) => error instanceof ActionError && error.code === "assistant.stale");
    assert.equal((await f.adapter.read(active.run)).phase, "running", "an old stop never targets the new Run");
    const send = f.adapter.inputs.send.bind(f.adapter.inputs);
    let sends = 0;
    t.mock.method(f.adapter.inputs, "send", async (...args: Parameters<typeof send>) => { sends++; await send(...args); throw new Error("response lost after owner accepted"); });
    const supplementId = "req-b59-work-supplement", supplement = "保留这句原话";
    await assert.rejects(f.service.send({ work_id: child.work_id, request_id: supplementId, text: supplement, subtask: { binding: active, operation: "send" } }, caller(supplementId, supplement)),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.pending_request");
    assert.equal((await f.service.checkSubtaskRequest(child.work_id, supplementId)).state, "applied");
    await assert.rejects(f.service.send({ work_id: child.work_id, request_id: supplementId, text: supplement, subtask: { binding: active, operation: "send" } }, caller(supplementId, supplement)),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.pending_request");
    assert.equal(sends, 1, "checking and repeating the pending request never resends");
    const originalInput = await f.adapter.inputs.findByKey!(active.run.session_id, `send.${supplementId}`);
    assert.equal(originalInput?.state, "run");
    assert.equal(originalInput?.state === "run" ? originalInput.receipt.original?.text ?? originalInput.text : undefined, supplement);
    await f.service.control(child.work_id, { kind: "stop", request_id: "req-b59-current-stop", subtask: active });
    assert.equal((await f.service.checkSubtaskRequest(child.work_id, "req-b59-current-stop")).state, "applied");
    await f.service.control(child.work_id, { kind: "stop", request_id: "req-b59-current-stop", subtask: active });
    const replay = await f.service.send(input, caller(request_id, text));
    assert.equal(replay.run_id, continued.run_id); assert.equal(childCalls, 2, "replaying the old accepted continue starts nothing");
    await until(() => notices.some(one => one.text.includes("已结束") && one.text.includes(active.run.run_id)), "the original child result was reported");
    await f.service.subtaskReports.idle();
    assert.equal(new Set(notices.map(one => one.notification_id)).size, 3, "original start, supplement and result each keep one envelope");
    assert.equal(f.store.rounds(parent.work.work_id).length, 2, "human continuation and stop never start the parent");
    const parentNext = await f.service.send({ work_id: parent.work.work_id, text: "现在核对子任务更新", request_id: "req-b59-parent-explicit" }, { project_ref: f.project });
    await until(async () => (await f.service.read(parent.work.work_id)).rounds.some(round => round.run_id === parentNext.run_id && round.phase === "completed"), "explicit parent round completed");
    assert.match(f.parentBodies.at(-1)!, new RegExp(active.run.run_id));
    assert.match(f.parentBodies.at(-1)!, new RegExp(request_id));
    assert.match(f.parentBodies.at(-1)!, new RegExp(originalInput!.ref.input_id));
  } finally { held.resolve(); await f.close(); }
});

test("SAI-05/08: a stop held before SDK admission cannot change the next personal child Run", { timeout: 60_000 }, async t => {
  const first = Promise.withResolvers<void>(), second = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const f = await delegationFixture(t, [() => reply({ name: "delegate-work", input: { title: "起草", brief: "写一段。", acceptance: "一段文字" } }), () => reply(undefined, "等待子任务。")],
    async (round, signal) => {
      if (round > 0) await Promise.race([(round === 1 ? first : second).promise, new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }))]);
      return reply(undefined, `草稿 ${round}`);
    });
  try {
    const parent = await f.service.send({ text: "委托起草", request_id: "sai-stale-parent" }, { project_ref: f.project });
    await until(async () => { const view = await f.service.read(parent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" && view.delegated?.[0]?.state === "completed"; });
    const child = f.store.delegatedBy("web-user", f.store.get("web-user", parent.work.work_id))[0]!;
    const more = async (id: string) => {
      const binding = (await f.service.readSubtask(child.work_id)).binding!;
      return f.service.send({ work_id: child.work_id, request_id: id, text: id, subtask: { binding, operation: "continue" } }, { project_ref: f.project,
        original_input: { input_id: id, text: id, written_by: "person", occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID } });
    };
    await more("sai-stale-first");
    const binding = (await f.service.readSubtask(child.work_id)).binding!;
    const effect = f.adapter.withEffect.bind(f.adapter); let held = false;
    t.mock.method(f.adapter, "withEffect", async (fence, operation) => {
      if (!held) { held = true; entered.resolve(); await release.promise; }
      return effect(fence, operation);
    });
    const stopped = f.service.control(child.work_id, { kind: "stop", request_id: "sai-stale-stop", subtask: binding });
    const refused = assert.rejects(stopped, (error: unknown) => error instanceof ActionError && error.code === "assistant.stale");
    await entered.promise;
    first.resolve(); await until(async () => (await f.adapter.read(binding.run)).phase === "completed");
    const next = await more("sai-stale-next");
    release.resolve(); await refused;
    const now = (await f.service.readSubtask(child.work_id)).binding!;
    assert.equal(now.run.run_id, next.run_id);
    assert.equal((await f.adapter.read(now.run)).phase, "running");
    assert.equal(f.store.get("web-user", child.work_id).continuation_hold, undefined);
    assert.equal((await f.service.checkSubtaskRequest(child.work_id, "sai-stale-stop")).state, "unknown");
    for (let i = 0; i < 501; i++) f.store.create({ actor_id: "web-user", title: `Later ${i}`, scope: { kind: "person" }, origin: null });
    assert.equal((await f.service.readSubtask(child.work_id)).binding!.parent_work_id, parent.work.work_id, "original parent lookup is not a recent-Work window");
    await f.service.control(child.work_id, { kind: "stop", request_id: "sai-current-stop", subtask: now });
  } finally { first.resolve(); second.resolve(); release.resolve(); await f.close(); }
});

test("SAI-01/02/04/09: the actual Assistant business role dispatches SDK children and continues only its owned child", { timeout: 60_000 }, async t => {
  const childBodies: string[] = [];
  const f = await delegationFixture(t, [() => {
    const character = f.parentBodies.at(-1)!.match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
    return reply({ name: "dispatch-subagent", input: { instruction: "SAI_SDK_CHILD: draft one sentence.", tools: [], character, idempotencyKey: "assistant-sdk-child" } });
  }, () => reply(undefined, "等待子代理结果。")], async round => reply(undefined, `SDK child answer ${round}`), body => {
    const first = body.messages.find((one: { role: string }) => one.role === "user");
    const child = JSON.stringify(first?.content).includes("SAI_SDK_CHILD");
    if (child) childBodies.push(JSON.stringify(body.messages));
    return child;
  });
  try {
    const parent = await f.service.send({ text: "派一个 SDK 子代理起草", request_id: "sai-sdk-parent" }, { project_ref: f.project });
    const [child] = await until(async () => { for (const review of f.queue.list("board", "pending")) await f.queue.respond({ review_id: review.review_id, actor_id: "web-user", decision: "approve" }); const children = await f.service.sdkSubtasks.list(parent.work.work_id); return children.length && children.every(one => one.state === "completed") ? children : undefined; }, "Assistant SDK child completion");
    assert.ok(child?.child_run);
    const view = await f.service.sdkSubtasks.read(parent.work.work_id, child.parent_run.run_id, child.subagent_id);
    assert.ok(view.conversation.messages.some(one => one.text.includes("SDK child answer 0")));
    const text = "Make that exact sentence shorter.", command = { kind: "continue" as const, child_run: child.child_run, request_id: "sai-sdk-continue", text };
    const caller = { beforeEffect: async () => {}, assertCurrent: () => {}, original: { input_id: command.request_id, text, written_by: "person" as const, occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID } };
    await assert.rejects(f.service.sdkSubtasks.command(parent.work.work_id, child.parent_run.run_id, child.subagent_id, command, { ...caller, original: undefined }), /原件/);
    const result = await f.service.sdkSubtasks.command(parent.work.work_id, child.parent_run.run_id, child.subagent_id, command, caller);
    assert.equal(result.state, "applied");
    await until(async () => {
      for (const review of f.queue.list("board", "pending")) await f.queue.respond({ review_id: review.review_id, actor_id: "web-user", decision: "approve" });
      return (await f.service.sdkSubtasks.list(parent.work.work_id))[0]?.state === "completed" && childBodies.length === 2;
    });
    assert.match(childBodies.at(-1)!, /Make that exact sentence shorter/);
    assert.deepEqual(await f.service.sdkSubtasks.check(parent.work.work_id, child.parent_run.run_id, child.subagent_id, command.request_id), result);
    assert.deepEqual(await f.service.sdkSubtasks.command(parent.work.work_id, child.parent_run.run_id, child.subagent_id, command, caller), result);
    assert.equal(childBodies.length, 2);
    const other = f.store.create({ actor_id: "web-user", title: "Other", scope: { kind: "project", project_id: "board" }, project_ref: f.project, origin: null });
    await assert.rejects(f.service.sdkSubtasks.read(other.work_id, child.parent_run.run_id, child.subagent_id), /原助理会话/);
    await f.service.archive(parent.work.work_id, true);
    assert.ok((await f.service.sdkSubtasks.read(parent.work.work_id, child.parent_run.run_id, child.subagent_id)).conversation.input_unavailable);
  } finally { await f.close(); }
});

for (const parked of [false, true]) test(`SAI-06/08/09/15: delegated Work answers its original ${parked ? 'parked' : 'live'} question once and resumes separately`, { timeout: 90_000 }, async t => {
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "Confirm duration", brief: "问清时长再交回。", acceptance: "给出确认的时长" } }),
    () => reply(undefined, "主任务等子任务的结果。"),
  ], async round => round === 1 ? reply({ name: "ask-user", input: { why: "确认时长", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true }] } }) : reply(undefined, "确认时长为 45 分钟。"));
  try {
    const parent = await f.service.send({ text: "委托确认时长", request_id: `sai-question-parent-${parked}` }, { project_ref: f.project });
    const child = await until(async () => (await f.service.read(parent.work.work_id)).delegated?.[0], "delegated child");
    await until(async () => { const view = await f.service.read(parent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "original parent wait and hand-back finish");
    const first = (await f.service.readSubtask(child.work_id)).binding!;
    await f.service.send({ work_id: child.work_id, text: "重新问清时长", request_id: `sai-question-child-again-${parked}`, subtask: { binding: first, operation: "continue" } }, { project_ref: f.project });
    await until(async () => (await f.service.read(child.work_id)).rounds.at(-1)?.awaiting_input.length, "original question");
    if (parked) await f.restartHost();
    const original = await f.service.readSubtask(child.work_id), binding = original.binding!;
    const question = original.view.rounds.at(-1)!.awaiting_input[0]!;
    assert.equal(Boolean(question.parked), parked);
    const input = { request_id: `sai-original-answer-${parked}`, subtask: binding, pending_id: question.pending_id, pending_revision: question.pending_revision!, answers: [{ question: 0, value: 45 }] };
    if (!parked) {
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), control = f.adapter.control.bind(f.adapter);
      const intercepted = t.mock.method(f.adapter, "control", async (...args: Parameters<typeof control>) => { entered.resolve(); await release.promise; return control(...args); });
      const attempt = { ...input, request_id: "sai-answer-final-revision-fence" }, waiting = f.service.workSubtasks.answer(child.work_id, attempt);
      await entered.promise;
      f.store.update("web-user", child.work_id, null, { title: "Changed while answering" }, false);
      release.resolve(); await assert.rejects(waiting, { code: "assistant.pending_request" });
      intercepted.mock.restore();
      assert.equal((await f.service.read(child.work_id)).rounds.at(-1)!.awaiting_input[0]!.pending_id, question.pending_id, "final refusal writes no answer");
      await assert.rejects(f.service.workSubtasks.answer(child.work_id, attempt), { code: "assistant.pending_request" });
      assert.equal((await f.service.checkSubtaskRequest(child.work_id, attempt.request_id)).state, "unknown", "a failed handoff is never inferred accepted");
    }
    await assert.rejects(f.service.workSubtasks.answer(child.work_id, { ...input, request_id: `sai-invalid-answer-${parked}`, answers: [{ question: 0, value: 400 }] }), { code: "agent.answer_invalid" });
    assert.equal((await f.service.read(child.work_id)).rounds.at(-1)!.awaiting_input[0]!.pending_id, question.pending_id);
    const beforeParent = (await f.service.read(parent.work.work_id)).rounds.length;
    const answered = await f.service.workSubtasks.answer(child.work_id, input);
    const receipt = f.store.requests.read("web-user", input.request_id);
    assert.equal(receipt.state, "sent");
    if (receipt.state === "sent") assert.equal(receipt.result.outcome, "answered");
    await f.service.workSubtasks.answer(child.work_id, input);
    await assert.rejects(f.service.workSubtasks.answer(child.work_id, { ...input, answers: [{ question: 0, value: 60 }] }), { code: "assistant.conflict" });
    await assert.rejects(f.service.send({ work_id: child.work_id, request_id: input.request_id, text: "same key is not a Send" }, { project_ref: f.project }), { code: "assistant.conflict" });
    await assert.rejects(f.service.control(child.work_id, { kind: "stop", request_id: input.request_id, subtask: binding }), { code: "assistant.conflict" });
    if (parked) {
      assert.equal(answered.rounds.length, original.view.rounds.length, "answer-only starts no replacement Run");
      const queued = answered.queued_inputs!.find(item => item.key === `answer.${question.pending_id}`)!;
      assert.equal(queued.left_by?.run_id, binding.run.run_id);
      f.store.update("web-user", child.work_id, null, { draft: "keep the independent composer" }, false);
      const resume = { request_id: "sai-resume-original-answer", subtask: binding, pending_id: question.pending_id, queued_input_id: queued.input_id };
      await f.service.workSubtasks.resume(child.work_id, resume);
      await f.service.workSubtasks.resume(child.work_id, resume);
      await until(async () => (await f.service.read(child.work_id)).rounds.at(-1)?.phase === "completed", "resumed child");
      const after = await f.service.read(child.work_id);
      assert.equal(after.rounds.length, original.view.rounds.length + 1);
      assert.equal(after.work.draft, "keep the independent composer");
      assert.ok(after.rounds.at(-1)!.turns.some(turn => turn.text.includes("45")));
    } else await until(async () => (await f.service.read(child.work_id)).rounds.at(-1)?.phase === "completed", "answered live child");
    assert.equal((await f.service.read(parent.work.work_id)).rounds.length, beforeParent, "the answer and explicit child continuation never start the parent");
    assert.equal((await f.service.checkSubtaskRequest(child.work_id, input.request_id)).state, "applied");
  } finally { await f.close(); }
});

for (const takenBack of [false, true]) test(`SAI-06/08/09: scoped Work next-step review ${takenBack ? 'refuses a take-back at its final write' : 'uses the original step owner'}`, { timeout: 90_000 }, async t => {
  const f = await delegationFixture(t, [
    () => reply({ name: "delegate-work", input: { title: "Read the note", brief: "整理记录", acceptance: "一句话" } }),
    () => reply(undefined, "收到。"),
  ], async () => reply(undefined, "整理完成。"));
  try {
    const parent = await f.service.send({ text: "委托整理记录", request_id: `sai-review-parent-${takenBack}` }, { project_ref: f.project });
    const view = await until(async () => { const current = await f.service.read(parent.work.work_id); return current.rounds.length === 2 && current.work.state === "completed" ? current : undefined; });
    const childId = view.delegated![0]!.work_id, binding = (await f.service.readSubtask(childId)).binding!;
    await f.service.continuations.stepGate.set(childId, true);
    assert.equal(f.service.continuations.stepGate.pass(f.store.get("web-user", childId), "continuation", "sai-original-step", binding.run.run_id), false);
    const gate = f.store.get("web-user", childId).step_gate!;
    const answer = f.service.continuations.stepGate.answer.bind(f.service.continuations.stepGate);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    if (takenBack) t.mock.method(f.service.continuations.stepGate, "answer", async (...args: Parameters<typeof answer>) => { entered.resolve(); await release.promise; return answer(...args); });
    const deciding = f.service.workSubtasks.review(childId, { subtask: binding, review_id: gate.id, decision: "reject" }, {});
    if (takenBack) {
      await entered.promise;
      const work = f.store.get("web-user", childId);
      f.store.update("web-user", childId, null, { delegated_by: { ...work.delegated_by!, taken_back_at: new Date().toISOString() } }, false);
      release.resolve(); await assert.rejects(deciding, { code: "assistant.stale" });
      assert.equal(f.store.get("web-user", childId).step_gate?.id, gate.id);
      assert.equal(f.store.get("web-user", childId).step_answer, undefined, "a refused original decision leaves no answer record");
    } else {
      await deciding;
      assert.equal(f.store.get("web-user", childId).step_gate, undefined);
      assert.deepEqual(f.store.get("web-user", childId).step_answer, { request_key: "sai-original-step", decision: "reject" });
    }
    assert.equal((await f.service.read(parent.work.work_id)).rounds.length, view.rounds.length);
  } finally { await f.close(); }
});

for (const archived of [false, true]) test(`SAI-06/08/09: Assistant SDK child review ${archived ? 'refuses parent archival inside the original decision handler' : 'keeps exact child ownership'}`, { timeout: 60_000 }, async t => {
  const childHeld = Promise.withResolvers<void>(), deciding = Promise.withResolvers<void>(), releaseDecision = Promise.withResolvers<void>();
  const f = await delegationFixture(t, [() => {
    const character = f.parentBodies.at(-1)!.match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
    return reply({ name: "dispatch-subagent", input: { instruction: "SAI_REVIEW_CHILD: wait for the review.", tools: [], character, idempotencyKey: "sai-review-sdk-child" } });
  }, () => reply(undefined, "子任务处理中。")], async () => { await childHeld.promise; return reply(undefined, "完成。"); }, body => JSON.stringify(body.messages.find((one: { role: string }) => one.role === "user")?.content).includes("SAI_REVIEW_CHILD"));
  try {
    const parent = await f.service.send({ text: "派子任务核对", request_id: `sai-review-sdk-parent-${archived}` }, { project_ref: f.project });
    const child = await until(async () => {
      for (const review of f.queue.list("board", "pending")) if (review.run?.session_id === parent.work.session_id)
        await f.queue.respond({ review_id: review.review_id, actor_id: "web-user", decision: "approve" });
      return (await f.service.sdkSubtasks.list(parent.work.work_id)).find(one => one.child_run);
    }, "actual SDK child binding");
    const reviewId = `sai-original-owner-${archived}`;
    f.queue.request({ review_id: reviewId, project_id: "board", plugin_id: ASSISTANT_PLUGIN_ID, run: child.child_run!, kind: "text-edit",
      document: { kind: "text-edit", target_path: "fixture", exists: false, before_text: "", after_text: "one" }, requested_at: new Date().toISOString(), expires_at: null });
    let accepted = 0;
    // A delayed original execution owner tests propagation; SDK pending/bridge behavior has separate original-owner tests.
    f.queue.registerDecisionHandler(reviewId, async input => { deciding.resolve(); await releaseDecision.promise; const receipt = f.queue.decide(input); accepted++; return receipt; });
    const input = { child_run: child.child_run!, review_id: reviewId, decision: "approve" as const }, caller = { beforeEffect: async () => {}, assertCurrent() {} };
    await assert.rejects(f.service.sdkSubtasks.review(parent.work.work_id, child.parent_run.run_id, child.subagent_id,
      { ...input, child_run: { ...input.child_run, run_id: "another-run" } }, caller), { code: "assistant.stale" });
    assert.equal(accepted, 0);
    const pending = f.service.sdkSubtasks.review(parent.work.work_id, child.parent_run.run_id, child.subagent_id, input, caller);
    await deciding.promise;
    if (archived) f.store.update("web-user", parent.work.work_id, null, { archived: true }, false);
    releaseDecision.resolve();
    if (archived) { await assert.rejects(pending, { code: "assistant.stale" }); assert.equal(accepted, 0); assert.equal(f.queue.receipt(reviewId)!.status, "pending"); }
    else { assert.equal((await pending).status, "approved"); assert.equal(accepted, 1); }
  } finally { childHeld.resolve(); releaseDecision.resolve(); await f.close(); }
});
