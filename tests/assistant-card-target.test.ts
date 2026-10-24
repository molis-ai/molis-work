// W3-A3a (specs/context-program §21.2 item 5; 统筹 10-17): a write chosen on the page asks the Assistant which work its card
// goes into (`molis:assistant-card-target`). The shipped asking and answering scripts run here on a bare document: no
// answer means a new work, one answer counts, and the Assistant answers only for an open panel on its own work that holds
// the object (the work's objects, or what was added to its strip). Public entries only (pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT, CARD_TARGET_ASK_SCRIPT } from "@molis-ai/molis-work-app-workbench";

const page = () => vm.createContext({ document: new EventTarget(), CustomEvent });
const ask = (context: vm.Context, object: unknown) => vm.runInContext(`${CARD_TARGET_ASK_SCRIPT}(${JSON.stringify(object)})`, context) as string | null;
const answerWith = (context: vm.Context, replies: unknown[]) => vm.runInContext(`document.addEventListener("molis:assistant-card-target", (event) => {
  for (const id of ${JSON.stringify(replies)}) event.detail.reply(id);
})`, context);
const doc = { kind: "pages_document", id: "doc-1" };

test("W3-A3a: with nobody answering, the page's card goes into a new work", () => {
  assert.equal(ask(page(), doc), null);
});

test("W3-A3a: one answer counts; a second one, or one that is not a work id or null, is ignored", () => {
  const twice = page();
  answerWith(twice, ["work-a", "work-b"]);
  assert.equal(ask(twice, doc), "work-a");
  const nullFirst = page();
  answerWith(nullFirst, [null, "work-b"]);
  assert.equal(ask(nullFirst, doc), null);
  const malformed = page();
  answerWith(malformed, [42, { work_id: "x" }, "work-c"]);
  assert.equal(ask(malformed, doc), "work-c");
});

test("W3-A3a: the Assistant answers with its current work only when the panel is open, the work is its own and holds the object", () => {
  const context = page();
  const state = { open: true, executor: "assistant", objects: [{ subject: doc }] as unknown[] };
  vm.runInContext(`globalThis.joined = new Set(); globalThis.state = ${JSON.stringify(state)};`, context);
  const parts = vm.runInContext(`(${ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT})({ api: () => Promise.resolve({ works: [] }), joined, open: () => state.open, repaint: () => {},
    current: () => state.current === null ? null : { work: { work_id: "work-1", executor: { kind: state.executor } }, objects: state.objects } })`, context) as { holds(object: unknown): boolean };
  assert.equal(ask(context, doc), "work-1", "one of the work's own objects");
  const other = { kind: "pages_document", id: "doc-2" };
  assert.equal(ask(context, other), null, "an object the work does not hold");
  vm.runInContext(`joined.add("pages_document:doc-2")`, context);
  assert.equal(ask(context, other), "work-1", "added to the work's strip with +");
  assert.equal(parts.holds(other), true, "the same rule the strip uses");
  vm.runInContext(`state.open = false`, context);
  assert.equal(ask(context, doc), null, "panel closed");
  vm.runInContext(`state.open = true; state.executor = "plugin"`, context);
  assert.equal(ask(context, doc), null, "a work carried by a plugin takes no cards");
  vm.runInContext(`state.executor = "assistant"; state.current = null`, context);
  assert.equal(ask(context, doc), null, "no work on show");
  vm.runInContext(`delete state.current`, context);
  assert.equal(ask(context, { kind: "pages_document" }), null, "an object without an id gets no answer");
});
