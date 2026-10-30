// PG-057, S-47 (specs/repository-anti-corruption/slices/pg031-pg057.md §5): a plugin page asks for an AI reply to one of its
// comment threads by handing it to the Assistant (`molis:assistant-message` with `thread`). The reply starts only from the
// shell: the shell names the plugin from the frame that sent it, never from what the page says, and the Assistant starts the
// reply as the person (`assistant.threads.start@1`, audience `user` only) when the person presses the step it draws.
// The frame bridge runs bundled from its browser source; the Assistant's step row and reply fragment are the shipped scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT, ASSISTANT_THREAD_REPLY_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { assistantThreadActions } from "@molis-ai/molis-work-app-local-host";

const PAGES = "io.molis.work.pages";
const PRESENTATION = buildSync({ entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/presentation.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "Presentation", platform: "browser", target: "es2022" }).outputFiles[0]!.text;
const COMMENTS = buildSync({ entryPoints: [fileURLToPath(new URL("../plugins/native/pages/src/comment-side-client.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "Comments", platform: "browser", target: "es2022" }).outputFiles[0]!.text;

type Detail = Record<string, unknown> & { source?: Record<string, unknown> };
/** The shell's side of one Pages frame: what the page posts goes through `pagePresentation`; what the shell dispatches is kept. */
const shell = (gesture: boolean) => {
  const sent: Detail[] = [];
  const frame = {};
  class CustomEvent { constructor(readonly type: string, readonly init: { detail: Detail }) {} }
  const context = vm.createContext({ CustomEvent, JSON,
    window: { dispatchEvent: (event: CustomEvent) => { if (event.type === "molis:assistant-message") sent.push(JSON.parse(JSON.stringify(event.init.detail)) as Detail); return true; } },
    document: { activeElement: gesture ? frame : null }, navigator: { userActivation: { isActive: gesture } } });
  vm.runInContext(PRESENTATION, context);
  const make = vm.runInContext("Presentation.pagePresentation", context) as (...args: unknown[]) => (message: unknown) => void;
  const post = make({ alive: true, visible: true, listen: () => () => {} }, frame, { dataset: { workSurfaceLabel: "Pages" }, getAttribute: () => null },
    { id: "pages", plugin_id: PAGES, bundle: "pages", assets: [] }, "page-1");
  return { sent, post: (detail: Detail) => post({ type: "presentation", name: "assistant-message", value: detail }) };
};

const THREAD = { thread_id: "t1", message_id: "m1" };
const asked = (source: Record<string, unknown>): Detail => ({ message_id: "x1", purpose: "suggest", source, object: { kind: "pages_document", id: "doc-1", title: "周报" },
  text: "请回复这条评论", thread: THREAD });

test("RAC-914 S-47: the shell names the plugin from the frame; a page that claims another provider is overwritten", () => {
  const { sent, post } = shell(false);
  post(asked({ surface: "todo", title: "Todo", plugin_id: "io.molis.work.todo" }));
  post(asked({ surface: "pages" }));
  assert.deepEqual(sent.map(detail => detail.source), [{ surface: "pages", title: "Pages", plugin_id: PAGES }, { surface: "pages", title: "Pages", plugin_id: PAGES }],
    "the frame's plugin, whatever the page wrote, and also when it wrote none");
  assert.deepEqual(sent[0]!.thread, THREAD, "the thread goes on to the Assistant as data; nothing is started here");
  const pressed = shell(true);
  pressed.post({ ...asked({ surface: "pages", plugin_id: "io.molis.work.todo" }), purpose: "delegate" });
  assert.equal(pressed.sent[0]!.source!.plugin_id, PAGES, "a hand-over the person pressed in the page still names only the frame's plugin");
  // RAC-916-L5: the side-owner relay does not broaden what the actual opaque bridge admits or how it checks gestures.
  const unpressed = shell(false);
  unpressed.post({ ...asked({ surface: "pages", plugin_id: "io.molis.work.todo" }), purpose: "delegate", card: { title: "forged" } });
  assert.equal(unpressed.sent[0]!.purpose, "suggest");
  assert.equal(unpressed.sent[0]!.card, undefined);
  unpressed.post({ ...asked({ surface: "pages" }), purpose: "reply" });
  assert.equal(unpressed.sent.length, 1, "the opaque plugin still cannot send a reply through the bridge");
});

interface Step { title: string; dataset: Record<string, string>; children: unknown[]; remove(): void; click(): void; append(...nodes: unknown[]): void; addEventListener(name: string, fn: () => void): void }
/** The Assistant's row with a bare DOM: a page's suggestion is its one step; pressing it goes to `reply` or `take`, as the island binds them. */
const row = () => {
  const steps: Step[] = [], replied: unknown[] = [], taken: unknown[] = [];
  const el = (): Step => {
    let onClick = () => {};
    const node: Step = { title: "", dataset: {}, children: [], remove: () => { steps.splice(steps.indexOf(node), 1); }, click: () => onClick(),
      append: (...nodes) => { node.children.push(...nodes); for (const one of nodes as Step[]) if (one.dataset && "stepOffer" in one.dataset) steps.push(one); },
      addEventListener: (_name, fn) => { onClick = fn; } };
    return node;
  };
  const group = el(), rowNode = { hidden: true, append: () => {}, addEventListener: () => {},
    querySelector: (selector: string) => selector === ".mw-ix-steps" ? group : selector === ".mw-ix-step" ? steps[0] ?? null : null };
  const factory = vm.runInContext(`(${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})`, vm.createContext({ CSS: { escape: (value: string) => value } })) as (input: unknown) => { offer(message: unknown, unconfirmed: boolean): void };
  const made = factory({ row: rowNode, thread: { querySelectorAll: () => [] }, L: (text: string) => text, el,
    drawn: () => {}, jumpTo: () => {}, bindText: () => {}, view: () => null, open: () => false, other: () => {},
    take: (message: unknown) => { taken.push(message); }, reply: (message: unknown) => { replied.push(message); } });
  return { steps, replied, taken, offer: (message: unknown) => made.offer(message, false) };
};

const offered = (source: Record<string, unknown>) => ({ message_id: "x1", purpose: "suggest", source, object: { kind: "pages_document", id: "doc-1" }, text: "请回复", materials: [], thread: THREAD });

test("RAC-915 S-47: a thread offer starts nothing until the person presses it, and only an offer the shell named a plugin for starts a reply", () => {
  const framed = row();
  framed.offer(offered({ surface: "pages", title: "Pages", plugin_id: PAGES }));
  assert.deepEqual([framed.steps.length, framed.replied.length, framed.taken.length], [1, 0, 0], "shown as one step; no reply is started by the offer itself");
  assert.match(framed.steps[0]!.title, /回复写回原评论/);
  framed.steps[0]!.click();
  assert.deepEqual([framed.replied.length, framed.taken.length, framed.steps.length], [1, 0, 0], "the press starts it, once, and the step is gone");
  const unnamed = row();
  unnamed.offer(offered({ surface: "pages", title: "Pages" }));
  unnamed.steps[0]!.click();
  assert.deepEqual([unnamed.replied.length, unnamed.taken.length], [0, 1], "no plugin from a frame: only words for the input, never a reply");
  assert.deepEqual(assistantThreadActions.start.action.audiences, ["user"], "the reply action stays the person's: a plugin page cannot call it through the gateway");
});

test("RAC-916 S-47: the reply goes to the plugin the shell named, for that object and thread; malformed or cut threads are not replies", async () => {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [], opened: unknown[] = [];
  const context = vm.createContext({ api: async (path: string, _method: string, body: Record<string, unknown>) => { calls.push({ path, body }); return { work_id: "w9" }; },
    loadWorks: async () => {}, switchTo: async (id: string) => { opened.push(id); }, setPanel: () => {}, showError: (error: unknown) => { throw error; } });
  const { tidyThread, replyToThread } = vm.runInContext(`${ASSISTANT_THREAD_REPLY_SCRIPT}; ({ tidyThread, replyToThread })`, context) as {
    tidyThread(raw: unknown): unknown; replyToThread(message: unknown): Promise<void> };
  const draft = { text: "未保存的段落", revision: "7" };
  await replyToThread({ source: { surface: "pages", title: "Pages", plugin_id: PAGES }, object: { kind: "pages_document", id: "doc-1" }, thread: tidyThread({ ...THREAD, draft }) });
  // The fragment runs in its own realm: compared as the JSON it sends.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ path: "/threads/start", body: { target: { provider_id: PAGES, subject_kind: "pages_document", subject_id: "doc-1", thread_id: "t1" }, message_id: "m1", draft } }]);
  assert.deepEqual(opened, ["w9"], "the panel opens on the work that carries the reply, where it is followed, retried or stopped");
  for (const raw of [null, "t1", { thread_id: "t1" }, { thread_id: "", message_id: "m1" }, { thread_id: "t".repeat(161), message_id: "m1" },
    { ...THREAD, draft: { text: "x".repeat(100001), revision: "7" } }, { ...THREAD, draft: { text: "x", revision: "" } }, { ...THREAD, draft: "x" }])
    assert.equal(tidyThread(raw), null, `not a reply: ${JSON.stringify(raw).slice(0, 80)}`);
});

class CommentNode {
  value = ""; textContent = ""; hidden = false; disabled = false; checked = false;
  private handlers = new Map<string, (event: { preventDefault(): void }) => void>();
  setAttribute(): void {}
  replaceChildren(): void {}
  append(): void {}
  focus(): void {}
  addEventListener(name: string, handler: (event: { preventDefault(): void }) => void): void { this.handlers.set(name, handler); }
  fire(name: string): void { this.handlers.get(name)?.({ preventDefault() {} }); }
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
type SavedComment = { message_id: string; request_id: string; body: string; author: string; created_at: string };
/** Run the production Pages controller with its existing DOM, storage and HTTP ports; hand offers to the actual shell bridge. */
async function commentSide() {
  const nodes = new Map<string, CommentNode>();
  const node = (name: string) => { if (!nodes.has(name)) nodes.set(name, new CommentNode()); return nodes.get(name)!; };
  const storage = new Map<string, string>(), framed = shell(false), assistant = row(), raw: Detail[] = [];
  const threads: Array<{ thread_id: string; anchor: { kind: string; excerpt: string }; messages: SavedComment[] }> = [];
  let receive = (_message: Record<string, unknown>) => {}, sequence = 0, saves = 0, draftReads = 0, snapshot = "";
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const context = vm.createContext({ JSON, Date, Map, Error, clearTimeout,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    document: { querySelector: () => ({ querySelector: (selector: string) => node(selector.slice(14, -1)), querySelectorAll: () => [] }), createElement: () => new CommentNode() },
    CustomEvent: class { constructor(readonly type: string, readonly init: { detail: Detail }) {} },
    window: { setTimeout, dispatchEvent: (event: { init: { detail: Detail } }) => {
      raw.push(copy(event.init.detail));const before = framed.sent.length;framed.post(event.init.detail);
      for (const detail of framed.sent.slice(before)) assistant.offer(detail);return true;
    } },
    molisWorkRequest: async (_path: string, options: { body?: Record<string, string> }) => {
      if (!options.body) return { threads: copy(threads) };
      saves++;const body = options.body;
      let thread = threads.find(item => item.thread_id === body.thread_id);
      if (!thread) { thread = { thread_id: body.thread_id!, anchor: { kind: "document", excerpt: "" }, messages: [] }; threads.push(thread); }
      thread.messages.push({ message_id: "11111111-1111-4111-8111-111111111111", request_id: body.request_id!, body: body.body!, author: "user", created_at: "2026-10-25T00:00:00Z" });
      return { thread: copy(thread) };
    } });
  vm.runInContext(COMMENTS, context);
  const mount = vm.runInContext("Comments.mountComments", context) as (host: unknown) => void;
  mount({ projectId: "project-1", translate: (key: string) => key, pluginRoute: (path: string) => path,
    messages: { listen: (listener: typeof receive) => { receive = listener; }, send: (message: { type: string; command?: { request_id: string } }) => {
      if (message.type === "molis:side-context-command") { draftReads++;receive({ type: "molis:side-context-result", request_id: message.command!.request_id, object_id: "doc-1", text: snapshot, version: 7, notes: [] }); }
    } } });
  receive({ type: "molis:side-context", context_epoch: 1, context: { plugin_id: PAGES, unsaved: true,
    object_ref: { kind: "pages_document", id: "doc-1", title: '周报"\n草稿', version: 7 } } });
  await tick();
  const pending = () => {
    const saved = JSON.parse(storage.get("molis.pages.comments:project-1")!) as Record<string, unknown>;
    const active = (saved.__active as Record<string, string>)["doc-1"];
    return saved[`doc-1:${active}`] as { body: string; request_id: string; message_id?: string } | undefined;
  };
  return { raw, framed, assistant, threads, node, pending, get saves() { return saves; }, get draftReads() { return draftReads; },
    body: (text: string) => { node("draft").value = text;node("draft").fire("input"); },
    ai: () => node("ai").fire("click"),
    draft: (text: string) => { snapshot = text;node("include-draft").checked = true;node("include-draft").fire("change"); },
    savedDocument: () => receive({ type: "molis:side-context", context_epoch: 2, context: { plugin_id: PAGES, unsaved: false,
      object_ref: { kind: "pages_document", id: "doc-1", title: '周报"\n草稿', version: 8 } } }),
    unsavedDocument: () => receive({ type: "molis:side-context", context_epoch: 3, context: { plugin_id: PAGES, unsaved: true,
      object_ref: { kind: "pages_document", id: "doc-1", title: '周报"\n草稿', version: 8 } } }),
    send: async () => { node("form").fire("submit");await tick(); } };
}

test("RAC-916-L1: complete detail rejects long comments plus draft and JSON escaping before saving; pending input survives", async () => {
  for (const text of ["x".repeat(85000), '"\n'.repeat(22000)]) {
    const side = await commentSide();side.ai();side.body("c".repeat(19000));side.draft(text);
    const request = side.pending()!.request_id;
    await side.send();
    assert.deepEqual([side.saves, side.raw.length, side.assistant.steps.length], [0, 0, 0]);
    assert.equal(side.node("error").textContent, "pages.comments.draft-too-long");
    assert.equal(side.node("error").hidden, false);
    assert.equal(side.node("run").textContent, "");
    assert.equal(side.pending()!.body, "c".repeat(19000));
    assert.equal(side.pending()!.request_id, request);
  }
});

test("RAC-916-L1 RAC-916-L2 RAC-916-L3: final detail at the bridge cap passes; one character over keeps saved identity and retries without another save", async () => {
  const sample = await commentSide();sample.ai();sample.body('评论"\n原文');sample.draft("");await sample.send();
  const overhead = JSON.stringify(sample.raw[0]).length;
  for (const extra of [0, 1]) {
    const side = await commentSide();side.ai();side.body('评论"\n原文');side.draft("x".repeat(100000 - overhead + extra));
    const request = side.pending()!.request_id;
    await side.send();
    assert.equal(side.saves, 1);
    if (extra === 0) {
      assert.equal(JSON.stringify(side.raw[0]).length, 100000);
      assert.equal(side.framed.sent.length, 1, "the actual bridge accepts exactly its cap");
      const rejected = shell(false);rejected.post({ ...side.raw[0], text: String(side.raw[0]!.text) + "x" });
      assert.equal(rejected.sent.length, 0, "the actual bridge rejects 100001");
    } else {
      assert.deepEqual([side.raw.length, side.framed.sent.length, side.assistant.steps.length], [0, 0, 0]);
      assert.equal(side.node("error").textContent, "pages.comments.saved-offer-too-long");
      assert.equal(side.node("run").textContent, "");
      assert.equal(side.threads[0]!.messages[0]!.body, '评论"\n原文');
      assert.equal(side.pending()!.body, '评论"\n原文');
      assert.equal(side.pending()!.request_id, request);
      assert.equal(side.pending()!.message_id, side.threads[0]!.messages[0]!.message_id);
      await side.send();
      assert.equal(side.saves, 1, "even an unchanged oversize retry reuses the saved comment");
      assert.equal(side.pending()!.request_id, request);
      side.draft('缩短后的"\n文档草稿');await side.send();
      assert.equal(side.saves, 1, "recover by shortening the document draft, without saving the comment again");
      const offer = side.framed.sent[0]!;
      assert.deepEqual(offer.thread, { thread_id: side.threads[0]!.thread_id, message_id: side.threads[0]!.messages[0]!.message_id, draft: { text: '缩短后的"\n文档草稿', revision: "7" } });
      assert.deepEqual(offer.object, { kind: "pages_document", id: "doc-1", title: '周报"\n草稿' });
      assert.equal(offer.text, '评论"\n原文');
      assert.equal(offer.source!.plugin_id, PAGES);
    }
    assert.equal(side.pending(), undefined, "successful forwarding clears only the pending draft");
    assert.equal(side.node("error").hidden, true);
    assert.equal(side.node("run").textContent, "pages.comments.handed");
    assert.deepEqual([side.assistant.steps.length, side.assistant.replied.length, side.assistant.taken.length], [1, 0, 0], "the real Assistant row still waits for a human press");
    side.assistant.steps[0]!.click();assert.equal(side.assistant.replied.length, 1);
  }
});

test("RAC-916-L2 RAC-916-L3: ordinary comments skip offer limits; a later oversize ask clears the old handed status", async () => {
  const side = await commentSide();side.savedDocument();side.body("c".repeat(20000));side.draft('"\n'.repeat(50000));await side.send();
  assert.deepEqual([side.saves, side.draftReads, side.raw.length], [1, 0, 0]);
  assert.equal(side.node("run").textContent, "");
  side.ai();side.body("请助理回复");await side.send();
  assert.equal(side.node("run").textContent, "pages.comments.handed");
  side.unsavedDocument();side.ai();side.body("c".repeat(19000));side.draft("x".repeat(85000));await side.send();
  assert.equal(side.saves, 2, "the oversize subsequent ask was not saved");
  assert.equal(side.node("run").textContent, "", "a previous success cannot label this failed attempt as handed");
  assert.equal(side.node("error").hidden, false);
});
