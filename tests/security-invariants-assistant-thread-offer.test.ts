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
