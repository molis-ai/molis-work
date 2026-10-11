import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  UI_REQUEST_CLIENT_SCRIPT,
  createUiFailureView,
  createUiRequest,
  type UiFailureViewPorts,
  type UiFetchInit,
  type UiRequestPorts,
} from "@molis-ai/molis-work-ui-host";

// The one browser request helper (specs/repository-anti-corruption W3-10): control headers, one-time key, errors as a message
// plus a code plus a diagnostic ID, and the button that shows and copies the ID. Everything here goes through the package's
// public entry with fake ports, the way a page, a plugin client (W5-04) or a bundled client receives them.

const ORIGIN = "http://127.0.0.1:4173";
const CALL_ID = "3f9a2c1d-8b47-4e0a-9c55-0d1f6a7b2e90";

interface Seen { readonly input: string; readonly init: UiFetchInit }
const headersOf = (seen: Seen) => seen.init.headers;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fill = (text: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);

function harness(answer: (seen: Seen) => Response | Promise<Response> = () => json(200, {})) {
  const seen: Seen[] = [];
  let keys = 0;
  const ports: UiRequestPorts = {
    fetch: async (input, init) => { const entry = { input, init }; seen.push(entry); return answer(entry); },
    origin: ORIGIN,
    token: () => "page-token",
    newKey: () => `key-${String(++keys).padStart(8, "0")}`,
    translate: fill,
  };
  return { seen, ports, request: createUiRequest(ports) };
}

async function failureOf(run: Promise<unknown>): Promise<UiRequestFailure> {
  try { await run; } catch (error) { return error as UiRequestFailure; }
  throw new assert.AssertionError({ message: "the request was expected to fail" });
}

test("a read carries no control token and no one-time key, and is never cached", async () => {
  const { seen, request } = harness(() => json(200, { items: [1, 2] }));
  assert.deepEqual(await request("/api/things"), { items: [1, 2] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.input, `${ORIGIN}/api/things`, "the address that was checked is the address that is sent");
  assert.equal(seen[0]!.init.method, "GET");
  assert.equal(seen[0]!.init.cache, "no-store");
  assert.equal(seen[0]!.init.body, undefined);
  assert.deepEqual(Object.keys(headersOf(seen[0]!)), [], "a read has no token, no key and no content type to leak");
});

test("a write carries the token, a fresh one-time key and the JSON type; a given key is reused for the same intent", async () => {
  const { seen, request } = harness();
  await request("/api/things", { body: { a: 1 } });
  await request("/api/things", { body: { a: 1 } });
  await request("/api/things", { body: { a: 1 }, key: "intent-0001" });
  await request("/api/things", { method: "DELETE" });
  await request("/api/things", { body: { a: 2 }, key: "intent-0001" });
  assert.deepEqual(seen.map(entry => entry.init.method), ["POST", "POST", "POST", "DELETE", "POST"]);
  assert.equal(seen[0]!.init.body, JSON.stringify({ a: 1 }), "the body is always JSON");
  assert.equal(seen[3]!.init.body, undefined, "no body, none sent");
  for (const entry of seen) {
    assert.deepEqual(Object.keys(headersOf(entry)).sort(), ["content-type", "x-molis-work-control-token", "x-molis-work-idempotency-key"]);
    assert.equal(headersOf(entry)["content-type"], "application/json");
    assert.equal(headersOf(entry)["x-molis-work-control-token"], "page-token");
    assert.equal(entry.init.cache, "no-store");
  }
  const keys = seen.map(entry => headersOf(entry)["x-molis-work-idempotency-key"]);
  assert.equal(new Set([keys[0], keys[1], keys[3]]).size, 3, "each request that gave no key gets its own");
  assert.deepEqual([keys[2], keys[4]], ["intent-0001", "intent-0001"], "a key the caller gives is the one that goes out");
});

test("a caller's headers cannot replace or add the control headers, in any letter case, on a read or a write", async () => {
  const { seen, request } = harness();
  const spoof = { "X-Molis-Work-Control-Token": "stolen", "x-molis-work-idempotency-key": "forged-key", "Content-Type": "text/plain", "x-molis-work-fragment": "plugin" };
  await request("/api/things", { body: {}, headers: spoof });
  await request("/api/things", { headers: spoof });
  assert.equal(headersOf(seen[0]!)["x-molis-work-control-token"], "page-token");
  assert.equal(headersOf(seen[0]!)["x-molis-work-idempotency-key"], "key-00000001");
  assert.equal(headersOf(seen[0]!)["content-type"], "application/json");
  assert.equal(headersOf(seen[0]!)["x-molis-work-fragment"], "plugin", "any other header passes");
  assert.deepEqual(Object.keys(headersOf(seen[1]!)), ["x-molis-work-fragment"], "a read gets no control header from the caller either");
});

test("headers() and token() are the same headers and token the helper sends", async () => {
  const { request } = harness();
  const first = request.headers();
  const second = request.headers();
  assert.deepEqual(Object.keys(first).sort(), ["content-type", "x-molis-work-control-token", "x-molis-work-idempotency-key"]);
  assert.equal(first["x-molis-work-control-token"], "page-token");
  assert.notEqual(first["x-molis-work-idempotency-key"], second["x-molis-work-idempotency-key"]);
  assert.equal(request.headers("fixed-key-1")["x-molis-work-idempotency-key"], "fixed-key-1");
  assert.equal(request.token(), "page-token");
});

test("a failed answer becomes a plain Error with message, code, status, call ID and body, read only from the body", async () => {
  const body = { error: "这个名字已被占用", code: "things.name_taken", call_id: CALL_ID, message: "alias", detail: "alias" };
  const { seen, request } = harness(() => new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json", "x-molis-work-call-id": "from-the-header" } }));
  const failure = await failureOf(request("/api/things", { body: {}, fallback: "never used" }));
  assert.equal(seen.length, 1);
  assert.equal(failure.message, "这个名字已被占用");
  assert.equal(failure.code, "things.name_taken");
  assert.equal(failure.status, 409);
  assert.equal(failure.callId, CALL_ID);
  assert.deepEqual(failure.body, body);
  assert.equal(Object.getPrototypeOf(failure), Error.prototype, "a plain Error carrying fields, never a subclass");
});

test("the call ID is the body's call_id only: the response header alone gives none", async () => {
  const { request } = harness(() => new Response(JSON.stringify({ error: "出错了", code: "things.broken" }), { status: 500, headers: { "x-molis-work-call-id": CALL_ID } }));
  const failure = await failureOf(request("/api/things"));
  assert.equal(failure.callId, null, "the Host writes call_id into the body only when the call can be looked up");
  assert.equal(failure.code, "things.broken");
});

test("an answer without an explanation uses the caller's fallback, then a neutral one; an answer that is not JSON keeps its text", async () => {
  const { request } = harness(() => new Response("<html>Bad gateway</html>", { status: 502 }));
  const given = await failureOf(request("/api/things", { fallback: "保存没有成功" }));
  assert.equal(given.message, "保存没有成功");
  assert.equal(given.code, "ui_host.uncoded");
  assert.equal(given.status, 502);
  assert.equal(given.callId, null);
  assert.equal(given.body, "<html>Bad gateway</html>");
  const neutral = await failureOf(request("/api/things"));
  assert.equal(neutral.message, "暂时处理不了，请稍后重试");
  const empty = harness(() => new Response(null, { status: 500 }));
  const none = await failureOf(empty.request("/api/things"));
  assert.equal(none.body, null);
  assert.equal(none.code, "ui_host.uncoded");
});

test("accept lets a chosen non-2xx status be read as the answer, as JSON or as text", async () => {
  const { request } = harness(() => new Response(JSON.stringify({ fragment: "<p>gone</p>" }), { status: 404 }));
  assert.deepEqual(await request("/api/things/1", { accept: [404] }), { fragment: "<p>gone</p>" });
  assert.equal(await request("/api/things/1", { accept: [404], as: "text" }), JSON.stringify({ fragment: "<p>gone</p>" }));
  const other = await failureOf(request("/api/things/1", { accept: [409] }));
  assert.equal(other.status, 404, "only the listed statuses count as an answer");
});

test("as: response returns any status untouched and never reads the body", async () => {
  const { seen, request } = harness(() => json(500, { error: "x" }));
  const response = await request<Response>("/api/stream", { as: "response" });
  assert.equal(response.status, 500);
  assert.equal(response.bodyUsed, false);
  assert.equal(seen.length, 1);
});

test("a successful answer is read as JSON (empty is null), as text, or refused when it is not JSON", async () => {
  const empty = harness(() => new Response(null, { status: 204 }));
  assert.equal(await empty.request("/api/things", { method: "DELETE" }), null);
  const text = harness(() => new Response("plain words", { status: 200 }));
  assert.equal(await text.request("/api/note", { as: "text" }), "plain words");
  const broken = harness(() => new Response("not json", { status: 200 }));
  const failure = await failureOf(broken.request("/api/things", { fallback: "读取失败" }));
  assert.equal(failure.code, "ui_host.invalid_response");
  assert.equal(failure.status, 200);
  assert.equal(failure.message, "读取失败");
  assert.equal(failure.body, "not json");
});

test("no answer: a read says the service cannot be reached, a write says the outcome is unknown; neither is retried", async () => {
  let calls = 0;
  const { request } = harness(() => { calls++; throw new TypeError("Failed to fetch"); });
  const read = await failureOf(request("/api/things"));
  assert.equal(read.code, "ui_host.unreachable");
  assert.equal(read.message, "连不上 Molis Work 服务，请稍后重试");
  assert.deepEqual([read.status, read.callId, read.body], [0, null, null]);
  const write = await failureOf(request("/api/things", { body: { a: 1 } }));
  assert.equal(write.code, "ui_host.outcome_unknown");
  assert.equal(write.message, "不知道这次操作有没有完成，请刷新后核对");
  assert.deepEqual([write.status, write.callId, write.body], [0, null, null]);
  const removal = await failureOf(request("/api/things/1", { method: "DELETE" }));
  assert.equal(removal.code, "ui_host.outcome_unknown", "a delete is a write");
  assert.equal(calls, 3, "one try each, whatever went wrong");
  for (const message of [read.message, write.message]) assert.doesNotMatch(message, /Failed to fetch/, "no browser English");
});

test("a server error is not retried either", async () => {
  const { seen, request } = harness(() => json(503, { error: "服务暂时不可用", code: "host.unavailable" }));
  await failureOf(request("/api/things", { body: {} }));
  assert.equal(seen.length, 1);
});

test("an abort passes through untouched, from the fetch and from reading the body", async () => {
  const aborted = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
  const early = harness(() => { throw aborted; });
  assert.equal(await failureOf(early.request("/api/things", { body: {} })), aborted, "the very same error, not a failure object");
  const midBody = harness(() => Object.assign(json(200, {}), { text: async () => { throw aborted; } }));
  assert.equal(await failureOf(midBody.request("/api/things")), aborted);
});

test("a scope owns the request: its fetch is used, and the page is asked again after the body is read", async () => {
  const log: string[] = [];
  const { seen, request } = harness();
  const signal = new AbortController().signal;
  const scope = {
    fetch: async (input: string, init: object) => { log.push(`fetch ${input}`); assert.equal((init as UiFetchInit).cache, "no-store"); return json(200, { ok: 1 }); },
    assertCurrent: (given?: AbortSignal) => { log.push(`current ${given === signal}`); },
  };
  assert.deepEqual(await request("/api/things", { scope, signal }), { ok: 1 });
  assert.equal(seen.length, 0, "the plain fetch is not used when a scope is given");
  assert.deepEqual(log, [`fetch ${ORIGIN}/api/things`, "current true"]);
  const left = Object.assign(new Error("View unmounted"), { name: "AbortError" });
  const gone = { fetch: async () => json(200, {}), assertCurrent: () => { throw left; } };
  assert.equal(await failureOf(request("/api/things", { scope: gone })), left, "a view that has gone away hears an abort, not an answer");
});

test("text() gives a request failure's message, a page's own Error's message, and a fallback for browser errors and aborts", () => {
  const view = createUiFailureView(viewPorts().ports);
  const failure = Object.assign(new Error("服务说的话"), { code: "x.y", status: 400, callId: null, body: null });
  assert.equal(view.text(failure, "兜底"), "服务说的话");
  assert.equal(view.text(new Error("这个文件不是记忆包"), "兜底"), "这个文件不是记忆包");
  assert.equal(view.text(new TypeError("Failed to fetch"), "兜底"), "兜底", "a browser's own words are never shown");
  assert.equal(view.text(Object.assign(new Error("x"), { name: "SyntaxError" })), "暂时处理不了，请稍后重试");
  assert.equal(view.text("a string", "兜底"), "兜底");
  assert.equal(view.text(undefined), "暂时处理不了，请稍后重试");
  assert.equal(view.text(Object.assign(new Error("aborted"), { name: "AbortError" }), "兜底"), "", "a request that was cancelled says nothing");
});

// ---- the display half ----------------------------------------------------------------------------------------------

class FakeNode {
  own = ""; children: FakeNode[] = []; parent: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly style = { pointerEvents: "" };
  readonly listeners = new Map<string, Array<() => void>>();
  readonly classList = { add: (name: string) => { this.classes.add(name); }, remove: (name: string) => { this.classes.delete(name); } };
  get textContent(): string { return this.own + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string | null) { this.own = value ?? ""; this.children = []; }
  append(node: FakeNode) { node.parent = this; this.children.push(node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  fire(type: string) { for (const listener of this.listeners.get(type) ?? []) listener(); }
  closest(selector: string): FakeNode | null { return selector === "[data-molis-call-id]" && this.attributes.has("data-molis-call-id") ? this : null; }
  get button(): FakeNode | undefined { return this.children[0]; }
}

function viewPorts(copy: (text: string) => Promise<void> = async () => {}) {
  let now = 0, next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const copied: string[] = [];
  const ports: UiFailureViewPorts = {
    createElement: () => new FakeNode(),
    copy: async (text) => { copied.push(text); await copy(text); },
    translate: fill,
    setTimeout: (run, ms) => { const id = next++; pending.set(id, { at: now + ms, run }); return id; },
    clearTimeout: (id) => { pending.delete(id as number); },
  };
  const clock = {
    get pending() { return pending.size; },
    tick(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) if (timer.at <= now && pending.delete(id)) timer.run();
    },
  };
  return { ports, clock, copied };
}
const failureWithId = (message = "没有找到这条记忆") => Object.assign(new Error(message), { code: "memory.not_found", status: 404, callId: CALL_ID, body: null });

test("show() writes the message and, when the Host gave a call ID, a diagnostic ID button that carries the whole ID", () => {
  const view = createUiFailureView(viewPorts().ports);
  const box = new FakeNode();
  view.show(box, failureWithId(), "兜底");
  assert.equal(box.own, "没有找到这条记忆");
  const button = box.button!;
  assert.equal(box.children.length, 1);
  assert.equal(button.getAttribute("data-molis-call-id"), CALL_ID, "the whole ID is what gets copied");
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.getAttribute("class"), "mw-btn mw-btn--link mw-btn--sm", "existing classes only");
  assert.equal(button.textContent, `诊断编号 ${CALL_ID.slice(0, 8)}`, "what is shown is the short ID: its first eight characters");
  assert.equal(button.getAttribute("aria-label"), `复制诊断编号 ${CALL_ID.slice(0, 8)}`);
  view.show(box, new Error("换一条提示"));
  assert.equal(box.children.length, 0, "a new message replaces the old button");
  assert.equal(box.own, "换一条提示");
});

test("show() adds no button when there is no call ID: the page's own errors, browser errors and unlookable failures", () => {
  const view = createUiFailureView(viewPorts().ports);
  const box = new FakeNode();
  for (const error of [new TypeError("Failed to fetch"), new Error("页面自己的错误"), Object.assign(new Error("无编号"), { callId: null }), Object.assign(new Error("空编号"), { callId: "" })]) {
    view.show(box, error, "兜底");
    assert.equal(box.children.length, 0);
  }
});

test("the short ID shown is the first eight characters of the ID, the rule the Host's shortCallId states", () => {
  const view = createUiFailureView(viewPorts().ports);
  for (const id of [CALL_ID, "00000000-0000-4000-8000-000000000001", "abcdef12", "short"]) {
    const box = new FakeNode();
    view.show(box, Object.assign(new Error("x"), { callId: id }));
    assert.equal(box.button!.textContent, `诊断编号 ${id.slice(0, 8)}`);
  }
});

test("install() copies the whole ID on a click, says so for a moment, and is installed once per document", async () => {
  const { ports, clock, copied } = viewPorts();
  const view = createUiFailureView(ports);
  const clicks: Array<(event: { target: unknown }) => void> = [];
  const captures: boolean[] = [];
  const doc = { documentElement: { dataset: {} as Record<string, string | undefined> }, addEventListener: (_type: string, listener: (event: { target: unknown }) => void, capture: boolean) => { clicks.push(listener); captures.push(capture); } };
  view.install(doc);
  assert.deepEqual(captures, [true], "the handler listens on the way down, so a panel that stops a click on its way up cannot take the button away");
  view.install(doc);
  assert.equal(clicks.length, 1, "a second program on the same document installs nothing more");
  const secondView = createUiFailureView(ports);
  secondView.install(doc);
  assert.equal(clicks.length, 1, "nor does another view on that document");
  const box = new FakeNode();
  view.show(box, failureWithId());
  clicks[0]!({ target: box.button });
  clicks[0]!({ target: box });
  clicks[0]!({ target: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(copied, [CALL_ID], "only the diagnostic ID button copies, and once per click");
  assert.equal(box.button!.textContent, "已复制");
  clock.tick(1500);
  assert.equal(box.button!.textContent, `诊断编号 ${CALL_ID.slice(0, 8)}`, "the label comes back");
});

test("when copying is refused the button shows the whole ID so it can be copied by hand", async () => {
  const { ports, clock } = viewPorts(async () => { throw new Error("denied"); });
  const view = createUiFailureView(ports);
  const clicks: Array<(event: { target: unknown }) => void> = [];
  view.install({ documentElement: { dataset: {} }, addEventListener: (_type, listener) => { clicks.push(listener); } });
  const box = new FakeNode();
  view.show(box, failureWithId());
  clicks[0]!({ target: box.button });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(box.button!.textContent, `复制失败 ${CALL_ID}`);
  clock.tick(1500);
  assert.equal(box.button!.textContent, `诊断编号 ${CALL_ID.slice(0, 8)}`);
});

test("toast(): an error toast with a diagnostic ID stays about eight seconds and is not dismissed while pointed at or focused", () => {
  const { ports, clock } = viewPorts();
  const view = createUiFailureView(ports);
  const toast = new FakeNode();
  view.toast(toast, failureWithId(), "兜底", { ms: 2200 });
  assert.ok(toast.classes.has("is-visible") && toast.classes.has("is-error"));
  assert.equal(toast.style.pointerEvents, "auto", "the toast carries a button, so it can be pointed at");
  assert.equal(toast.button!.getAttribute("data-molis-call-id"), CALL_ID);
  clock.tick(7900);
  assert.ok(toast.classes.has("is-visible"), "the page's 2.2 seconds do not apply to a toast with an ID");
  toast.fire("mouseenter");
  clock.tick(60_000);
  assert.ok(toast.classes.has("is-visible"), "a pointer on it holds it");
  toast.fire("mouseleave");
  toast.fire("focusin");
  clock.tick(60_000);
  assert.ok(toast.classes.has("is-visible"), "so does focus inside it");
  toast.fire("focusout");
  clock.tick(7900);
  assert.ok(toast.classes.has("is-visible"));
  clock.tick(200);
  assert.ok(!toast.classes.has("is-visible"));
  assert.equal(toast.style.pointerEvents, "", "gone, it no longer takes the pointer");
  assert.equal(toast.children.length, 0, "and its button can no longer be tabbed to");
});

test("toast(): an error without an ID keeps the page's own time and is never held", () => {
  const { ports, clock } = viewPorts();
  const view = createUiFailureView(ports);
  const toast = new FakeNode();
  view.toast(toast, new Error("没有保存"), "兜底", { ms: 2200 });
  assert.equal(toast.own, "没有保存");
  assert.equal(toast.style.pointerEvents, "");
  assert.equal(toast.children.length, 0);
  toast.fire("mouseenter");
  clock.tick(2300);
  assert.ok(!toast.classes.has("is-visible"));
  view.toast(toast, new Error("再来一次"), "兜底");
  clock.tick(2500);
  assert.ok(toast.classes.has("is-visible"), "without a time from the page, the default is a little longer");
  clock.tick(200);
  assert.ok(!toast.classes.has("is-visible"));
});

test("toast(): each target has one timer, so a later message restarts the time instead of being cut short by the earlier one", () => {
  const { ports, clock } = viewPorts();
  const view = createUiFailureView(ports);
  const toast = new FakeNode();
  const other = new FakeNode();
  view.toast(toast, new Error("第一条"), "兜底", { ms: 2000 });
  view.toast(other, new Error("别处"), "兜底", { ms: 2000 });
  clock.tick(1500);
  view.toast(toast, failureWithId("第二条"), "兜底", { ms: 2000 });
  assert.equal(clock.pending, 2, "one timer per target");
  clock.tick(3000);
  assert.ok(toast.classes.has("is-visible"), "the first message's timer did not hide the second");
  assert.ok(!other.classes.has("is-visible"), "the other target runs on its own timer");
  assert.equal(toast.own, "第二条");
});

// ---- the pieces must travel as source into a page ------------------------------------------------------------------

test("each factory runs on its own after toString(), with nothing from the module around it", async () => {
  // A new context has only the language's built-ins; the page adds URL, as every browser does. __name is what the test
  // runner's compiler wraps named functions with, and a compiled build has none.
  const context = vm.createContext({ URL, __name: (value: unknown) => value });
  const makeRequest = vm.runInContext(`(${createUiRequest.toString()})`, context) as typeof createUiRequest;
  const makeView = vm.runInContext(`(${createUiFailureView.toString()})`, context) as typeof createUiFailureView;
  const seen: string[] = [];
  const request = makeRequest({
    fetch: async (input, init) => { seen.push(`${init.method} ${input}`); assert.deepEqual(Object.keys(init.headers).sort(), ["content-type", "x-molis-work-control-token", "x-molis-work-fragment", "x-molis-work-idempotency-key"]); assert.equal(init.headers["x-molis-work-control-token"], "t"); return json(200, { ok: true }); },
    origin: ORIGIN, token: () => "t", newKey: () => "k-0000001", translate: fill,
  });
  // The page's context has its own Object, so a parsed answer is compared by value.
  assert.equal(JSON.stringify(await request("/api/x", { body: {}, headers: { "X-Molis-Work-Control-Token": "stolen", "x-molis-work-fragment": "1" } })), JSON.stringify({ ok: true }));
  assert.deepEqual(seen, [`POST ${ORIGIN}/api/x`]);
  const refused = await failureOf(request("//evil.example/x", { body: {} }));
  assert.equal(refused.code, "ui_host.cross_origin");
  const box = new FakeNode();
  makeView(viewPorts().ports).show(box, failureWithId());
  assert.equal(box.button!.getAttribute("data-molis-call-id"), CALL_ID);
});

interface PageContext {
  readonly context: vm.Context;
  readonly fetched: Array<{ input: string; init: UiFetchInit }>;
  readonly clicks: Array<(event: { target: unknown }) => void>;
}
function pageContext(extra: Record<string, unknown> = {}): PageContext {
  const fetched: PageContext["fetched"] = [];
  const clicks: PageContext["clicks"] = [];
  let keys = 0;
  const meta = { content: "meta-token" };
  const sandbox = {
    URL, setTimeout, clearTimeout,
    location: { origin: ORIGIN },
    crypto: { randomUUID: () => `uuid-${String(++keys).padStart(8, "0")}` },
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      documentElement: { dataset: {} },
      querySelector: (selector: string) => selector === 'meta[name="molis-work-control-token"]' ? meta : null,
      createElement: () => new FakeNode(),
      addEventListener: (_type: string, listener: (event: { target: unknown }) => void) => { clicks.push(listener); },
    },
    fetch: async (input: string, init: UiFetchInit) => { fetched.push({ input, init }); return json(200, { echoed: true }); },
    ...extra,
  };
  return { context: vm.createContext(sandbox), fetched, clicks };
}
const run = (page: PageContext, code: string) => vm.runInContext(code, page.context) as unknown;

test("the page program installs molisWorkRequest and molisWorkControlHeaders, reading the token from the page's meta tag", async () => {
  const page = pageContext();
  run(page, UI_REQUEST_CLIENT_SCRIPT);
  assert.equal(run(page, "typeof molisWorkRequest"), "function");
  for (const member of ["headers", "token", "text", "show", "toast"]) assert.equal(run(page, `typeof molisWorkRequest.${member}`), "function", member);
  assert.equal(run(page, "molisWorkRequest.token()"), "meta-token");
  const first = run(page, "molisWorkControlHeaders()") as Record<string, string>;
  const second = run(page, "molisWorkControlHeaders()") as Record<string, string>;
  assert.deepEqual({ ...first, "x-molis-work-idempotency-key": "" }, { "content-type": "application/json", "x-molis-work-control-token": "meta-token", "x-molis-work-idempotency-key": "" });
  assert.notEqual(first["x-molis-work-idempotency-key"], second["x-molis-work-idempotency-key"], "a fresh key each time, as before");
  assert.equal(page.clicks.length, 1, "the copy handler is installed with the program");
  assert.equal(JSON.stringify(await run(page, `molisWorkRequest("/api/things", { body: { a: 1 } })`)), JSON.stringify({ echoed: true }));
  assert.equal(page.fetched[0]!.input, `${ORIGIN}/api/things`);
  assert.equal(page.fetched[0]!.init.headers["x-molis-work-control-token"], "meta-token");
});

test("the page program runs once per page and leaves an existing molisWorkControlHeaders alone", () => {
  const own = () => ({ "x-own": "1" });
  const page = pageContext({ molisWorkControlHeaders: own });
  run(page, UI_REQUEST_CLIENT_SCRIPT);
  const request = run(page, "molisWorkRequest");
  run(page, UI_REQUEST_CLIENT_SCRIPT);
  assert.equal(run(page, "molisWorkRequest"), request, "the second program does nothing");
  assert.equal(run(page, "molisWorkControlHeaders"), own);
  assert.equal(page.clicks.length, 1);
});

test("the page program speaks the page's language when there is one, and plain Chinese when there is none", async () => {
  const withTranslator = pageContext({ L: (text: string) => `EN ${text}`, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  run(withTranslator, UI_REQUEST_CLIENT_SCRIPT);
  const english = await run(withTranslator, `molisWorkRequest("/api/things").catch(error => error.message)`);
  assert.equal(english, "EN 连不上 Molis Work 服务，请稍后重试");
  const plain = pageContext({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
  run(plain, UI_REQUEST_CLIENT_SCRIPT);
  assert.equal(await run(plain, `molisWorkRequest("/api/things").catch(error => error.message)`), "连不上 Molis Work 服务，请稍后重试");
});
