import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { HostSurfaceAction, HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

/*
 * The Assistant drives the side panel's browser through Molis's own wiring (specs/archive/side-panel P5): a business round gets
 * the surface tools while the project's page is attached, looks without asking — also at a page that has not opened a
 * site yet — and every action stops for the person, with a card in their words, before the page is touched.
 */

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

function reply(tool?: { name: string; input: unknown }, text = "Done."): Response {
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
 * A page that starts blank; opening a site changes its scope, as the real driver's does. Like the real driver it reads
 * the person's blocks as they stand, and refuses a blocked site before looking or acting.
 */
function fakePage(decisions: ReadonlyArray<{ scope: string; decision: "allow" | "block" }>, start = "about:blank") {
  let scope = start, visits = 0, looks = 0;
  const done: HostSurfaceAction[] = [];
  const refuse = () => { if (decisions.some(row => row.scope === scope && row.decision === "block")) throw new Error("用户禁止助理查看或操作这个网站。"); };
  const driver: HostSurfaceDriver = {
    kind: "browser", project_id: "project",
    async identity() { return `${scope}#${visits}`; },
    async scope() { return scope; },
    async observe() {
      refuse();
      looks += 1;
      return new TextEncoder().encode(scope === "about:blank" ? "侧栏浏览器现在是空白页。" : "页面：Example Domain\n[1] link「Learn more」 @(10,20)");
    },
    async perform(action) {
      refuse();
      done.push(action);
      if (action.what === "navigate") { scope = new URL(action.url).origin; visits += 1; }
    },
    async close() {},
    async describePoint() { return "Learn more"; },
    masked: () => false,
  };
  return { driver, done, looks: () => looks };
}

const wire = (body: any) => JSON.stringify(body.messages);
const targetOf = (body: any) => /([A-Za-z0-9_-]+) — browser/u.exec(wire(body))?.[1] ?? "";
const observationOf = (body: any) => [...wire(body).matchAll(/observation ([A-Za-z0-9_-]+)/gu)].at(-1)?.[1] ?? "";

async function fixture(t: import("node:test").TestContext, script: Array<(body: any) => Response>, decisions: Array<{ scope: string; decision: "allow" | "block" }> = [], start?: string) {
  const home = await mkdtemp(join(tmpdir(), "molis-side-surface-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const page = fakePage(decisions, start);
  const requests: any[] = [];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script[turn++] ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.side-surface-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
    surfaces: { driverFor: owner => owner === "board" ? page.driver : null, siteDecisions: () => decisions } });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user"), (offer, views) => service.recordOffer(work, offer, views),
      (view, input, output) => service.recordResult(work, view, input, output), undefined,
      (view, call) => service.trackUnsettled(work, `${view.provider.title} · ${view.action.title}`, call), undefined, undefined, view => service.noteDispatched(work, view)),
    projectTitle: async () => "Fixture project", timeZone: "Asia/Shanghai" }, "web-user");
  const send = (text: string) => service.send({ text, request_id: `req-${Math.random().toString(36).slice(2, 10)}`, context: { source: { surface: "home", title: "项目首页" }, captured_at: new Date().toISOString() } }, { project_ref: project });
  const pending = () => until(() => queue.list("board", "pending")[0], "a pending review");
  return { service, queue, requests, page, send, pending, adapter, async close() { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

test("from a blank page the Assistant looks, then opens a site and clicks only after the person approves each step", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "surface-list", input: {} }),
    body => reply({ name: "surface-observe", input: { target: targetOf(body), kind: "accessibility-tree" } }),
    body => { assert.match(wire(body), /untrusted-page-content[\s\S]*空白页/u, "the blank page's words reach the model as page content");
      return reply({ name: "surface-act", input: { observation: observationOf(body), do: "navigate", url: "https://example.com/" } }); },
    body => reply({ name: "surface-observe", input: { target: targetOf(f.requests[1]), kind: "accessibility-tree" } }),
    body => { assert.match(wire(body), /Learn more/u); return reply({ name: "surface-act", input: { observation: observationOf(body), do: "pointer", x: 10, y: 20, button: "left" } }); },
    () => reply(undefined, "新页面的标题是 Example Domain。"),
  ]);
  try {
    const sent = await f.send("在侧栏浏览器打开 example.com 并点 Learn more");
    assert.equal(sent.outcome, "started");
    await until(() => f.requests[0], "the first model request");
    const offered = f.requests[0].tools.map((tool: any) => tool.name);
    for (const name of ["surface-list", "surface-observe", "surface-act"]) assert.ok(offered.includes(name), `${name} is offered: ${offered.join(",")}`);
    assert.match(JSON.stringify(f.requests[0].system ?? f.requests[0]), /侧栏浏览器/u, "the round is told how to use the page");

    const opening = await f.pending();
    assert.equal(opening.document.kind, "tool-operation");
    assert.match(opening.document.summary, /在 空白页 打开网址/u);
    assert.ok(opening.document.fields?.some(field => field.value === "打开 https://example.com/"), JSON.stringify(opening.document));
    assert.equal(f.page.looks(), 1, "looking did not wait for anyone");
    assert.deepEqual(f.page.done, [], "nothing happens on the page before approval");
    await f.queue.respond({ review_id: opening.review_id, decision: "approve", actor_id: "web-user" });

    const click = await until(() => f.queue.list("board", "pending").find(row => row.review_id !== opening.review_id), "the click's review");
    assert.match(click.document.summary, /在 https:\/\/example\.com 点击页面/u);
    assert.ok(click.document.fields?.some(field => field.value === "点击「Learn more」"), JSON.stringify(click.document));
    assert.equal(f.page.done.length, 1);
    await f.queue.respond({ review_id: click.review_id, decision: "approve", actor_id: "web-user" });

    const done = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "completion");
    assert.deepEqual(f.page.done, [{ what: "navigate", url: "https://example.com/" }, { what: "pointer", x: 10, y: 20, button: "left", clicks: 1 }]);
    assert.ok(done.rounds[0]!.activity.every(item => item.state === "completed"), JSON.stringify(done.rounds[0]!.activity));
  } finally { await f.close(); }
});

test("a site the person allowed is acted on without asking; a blocked one is not even looked at", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "surface-list", input: {} }),
    body => reply({ name: "surface-observe", input: { target: targetOf(body), kind: "accessibility-tree" } }),
    body => reply({ name: "surface-act", input: { observation: observationOf(body), do: "navigate", url: "https://example.com/" } }),
    body => reply({ name: "surface-observe", input: { target: targetOf(f.requests[1]), kind: "accessibility-tree" } }),
    body => reply({ name: "surface-act", input: { observation: observationOf(body), do: "pointer", x: 10, y: 20, button: "left" } }),
    () => reply(undefined, "点好了。"),
    // Second round, on a blocked site.
    () => reply({ name: "surface-list", input: {} }),
    body => reply({ name: "surface-observe", input: { target: targetOf(body), kind: "accessibility-tree" } }),
    body => { assert.match(wire(body), /forbid|禁止|denied/iu, "the model is told looking was refused"); return reply(undefined, "这个网站不能查看。"); },
  ], [{ scope: "https://example.com", decision: "allow" }, { scope: "https://blocked.test", decision: "block" }]);
  try {
    const first = await f.send("打开 example.com 点 Learn more");
    const opening = await f.pending();
    assert.match(opening.document.summary, /空白页/u, "leaving the blank page still asks");
    await f.queue.respond({ review_id: opening.review_id, decision: "approve", actor_id: "web-user" });
    await until(async () => (await f.service.read(first.work.work_id)).work.state === "completed", "the first round");
    assert.equal(f.queue.list("board", "pending").length, 0);
    assert.deepEqual(f.page.done.map(action => action.what), ["navigate", "pointer"], "the click on the allowed site did not ask");

    await f.page.driver.perform({ what: "navigate", url: "https://blocked.test/" }, { session_id: null });
    const looksBefore = f.page.looks();
    const second = await f.send("看看这个页面");
    await until(async () => { const view = await f.service.read(second.work.work_id); return ["completed", "failed"].includes(view.work.state) ? view : undefined; }, "the second round");
    assert.equal(f.page.looks(), looksBefore, "a blocked site is not looked at");
  } finally { await f.close(); }
});

test("a site allowed before the runtime started asks again as soon as the person takes it back", { timeout: 60_000 }, async t => {
  const click = [
    () => reply({ name: "surface-list", input: {} }),
    (body: any) => reply({ name: "surface-observe", input: { target: targetOf(body), kind: "accessibility-tree" } }),
    (body: any) => reply({ name: "surface-act", input: { observation: observationOf(body), do: "pointer", x: 10, y: 20, button: "left" } }),
    () => reply(undefined, "点好了。"),
  ];
  const decisions: Array<{ scope: string; decision: "allow" | "block" }> = [{ scope: "https://example.com", decision: "allow" }];
  const f = await fixture(t, [...click, ...click], decisions, "https://example.com");
  try {
    const first = await f.send("点一下 Learn more");
    await until(async () => (await f.service.read(first.work.work_id)).work.state === "completed", "the first round");
    assert.equal(f.queue.list("board", "pending").length, 0, "the allowed site did not ask");
    assert.equal(f.page.done.length, 1);

    // 撤销 in the side panel: the saved decision goes, and the running runtime forgets the approval with it.
    decisions.length = 0;
    f.adapter.surfaces!.decide({ scope: "https://example.com", decision: "forget" });
    await f.send("再点一下");
    const asked = await f.pending();
    assert.match(asked.document.summary, /在 https:\/\/example\.com 点击页面/u);
    assert.equal(f.page.done.length, 1, "nothing happens before the person answers");
  } finally { await f.close(); }
});
