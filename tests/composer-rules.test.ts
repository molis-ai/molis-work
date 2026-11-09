import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPOSER_DRAFT_PREFIX, composerDeliveries, composerDraft, composerDraftKey, composerGenerations, composerKey, composing, parseComposerDraftKey,
  pickComposerDelivery, renderComposerDeliveryMenu, staleComposerDrafts, wantsEnterHint, type ComposerStorage,
} from "@molis-ai/molis-work-design-system";
import { COMPOSER_AI_LABELS } from "./fixtures/composer-labels.js";

// The unified input's rules (specs/unified-input-voice/implementation-plan.md §3.1–3.5, slice K2): the page program
// (`browser/composer.ts`) calls these, so each rule is checked once here and in the browser case only as it shows.

const key = (over: Partial<KeyboardEvent> = {}) => ({ key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, keyCode: 13, ...over });

test("UIC-05 UIV-01: Enter writes a line, ⌘/Ctrl+Enter sends, ⌘/Ctrl+Shift+Enter is for the next turn; interrupting has no key", () => {
  assert.equal(composerKey(key()), null, "Enter is the browser's own new line");
  assert.equal(composerKey(key({ metaKey: true })), "send");
  assert.equal(composerKey(key({ ctrlKey: true })), "send");
  assert.equal(composerKey(key({ metaKey: true, shiftKey: true })), "after-run");
  assert.equal(composerKey(key({ ctrlKey: true, shiftKey: true })), "after-run");
  assert.equal(composerKey(key({ metaKey: true, altKey: true })), null, "no key chord interrupts");
  assert.equal(composerKey(key({ key: "Escape" })), null, "Esc is only the open menu's");
  assert.equal(composerKey(key({ key: "Tab" })), null);
  assert.equal(composerKey(key({ shiftKey: true })), null);
  // A decision's reason (`submitKeys: false`): the send keys only write.
  assert.equal(composerKey(key({ metaKey: true }), false), null);
  assert.equal(composerKey(key({ metaKey: true, shiftKey: true }), false), null);
});

test("UIC-05 UIV-02: nothing is sent or hinted while an input method composes, by isComposing or keyCode 229", () => {
  assert.equal(composing({ isComposing: true, keyCode: 13 }), true);
  assert.equal(composing({ isComposing: false, keyCode: 229 }), true, "WebKit's Enter that ends a composition");
  assert.equal(composing({ isComposing: false, keyCode: 13 }), false);
  assert.equal(composerKey(key({ metaKey: true, isComposing: true })), null);
  assert.equal(composerKey(key({ metaKey: true, keyCode: 229 })), null);
  assert.equal(wantsEnterHint(key({ keyCode: 229 }), "你好", 2), false);
});

test("UIC-06: the Enter hint is for someone sending the old way: one written line, the caret at its end", () => {
  assert.equal(wantsEnterHint(key(), "把测试补上", 5), true);
  assert.equal(wantsEnterHint(key(), "把测试补上", 2), false, "the caret inside the line is someone breaking it");
  assert.equal(wantsEnterHint(key(), "第一行\n第二行", 7), false, "a second line is someone writing lines");
  assert.equal(wantsEnterHint(key(), "   ", 3), false, "nothing written");
  assert.equal(wantsEnterHint(key({ shiftKey: true }), "x", 1), false);
  assert.equal(wantsEnterHint(key({ metaKey: true }), "x", 1), false);
});

test("UIC-08 RC-03: a delivery the target does not take is shown with its reason and never sent as another", () => {
  const unsupported = COMPOSER_AI_LABELS.unsupported;
  // Nothing runs: a send starts the turn; interrupting is never offered, whatever the target says.
  const idle = composerDeliveries(false, { "next-boundary": { available: true }, interrupt: { available: true }, "after-run": { available: true } }, unsupported);
  assert.deepEqual(idle.interrupt, { available: false, reason: unsupported });
  // Running without the target's word: only the default supplement.
  const plain = composerDeliveries(true, undefined, unsupported);
  assert.deepEqual([plain["next-boundary"].available, plain.interrupt.available, plain["after-run"].available], [true, false, false]);
  // The target's own reasons stay its own.
  const offered = composerDeliveries(true, { "next-boundary": { available: true }, interrupt: { available: false, reason: "它一次只做完一整轮" }, "after-run": { available: true } }, unsupported);
  assert.deepEqual(pickComposerDelivery("interrupt", offered), { refused: "它一次只做完一整轮" }, "refused, not downgraded to a supplement");
  assert.deepEqual(pickComposerDelivery("after-run", offered), { mode: "after-run" });
  // The menu shows the refused item, not choosable, with the reason as its description line.
  const menu = renderComposerDeliveryMenu("c1", COMPOSER_AI_LABELS, offered, false);
  assert.match(menu, /aria-labelledby="c1-delivery-interrupt-label" aria-describedby="c1-delivery-interrupt-desc" disabled data-composer-delivery="interrupt">.*它一次只做完一整轮/s);
  assert.match(menu, /c1-delivery-next-boundary-label">补充<\/span>.*Ctrl\+↵/s, "Ctrl off a Mac");
  assert.doesNotMatch(menu.slice(menu.indexOf("delivery-interrupt"), menu.indexOf("delivery-after-run")), /mw-menu__shortcut/, "interrupting has no key");
});

test("UIC-07: a result from a generation that is no longer the latest, or was let go, is dropped", async () => {
  const generations = composerGenerations(), applied: string[] = [];
  let release!: (value: string) => void;
  const slow = generations.latest((signal) => new Promise<string>((resolve) => { release = resolve; signal.addEventListener("abort", () => resolve("aborted")); }), (value) => applied.push(value));
  const first = release;
  await generations.latest(async () => "second", (value) => applied.push(value));
  first("first, late");
  await slow;
  assert.deepEqual(applied, ["second"], "the earlier query's late answer never reaches the box");
  const signal = generations.next();
  generations.end();
  assert.equal(signal.aborted, true, "letting go aborts what is under way");
  await generations.latest(async () => "after", (value) => applied.push(value));
  assert.deepEqual(applied, ["second", "after"]);
});

test("UIC-10: draft keys name project, installation, entry and conversation; a deleted project or removed plugin leaves none", () => {
  const place = { project: "p:1", install: "io.molis.work.notes", entry: "session", conversation: "a/b:c" };
  const key = composerDraftKey(place);
  assert.equal(key, COMPOSER_DRAFT_PREFIX + "p%3A1:io.molis.work.notes:session:a%2Fb%3Ac", "a `:` inside a part cannot shift the rest");
  assert.deepEqual(parseComposerDraftKey(key), place);
  assert.equal(composerDraftKey({ ...place, project: "" }).split(":")[1], "home", "outside a project the project part is home");
  assert.equal(parseComposerDraftKey("mw.composer.draft:a:b:c"), null);
  assert.equal(parseComposerDraftKey("other:a:b:c:d"), null);
  const keys = [key, composerDraftKey({ ...place, install: "io.molis.work.todo" }), composerDraftKey({ ...place, project: "p2" }), "mw.other:p:1", "unrelated"];
  assert.deepEqual(staleComposerDrafts(keys, { project: "p:1", install: "io.molis.work.notes" }), [key], "a removed plugin: its drafts in that project only");
  assert.deepEqual(staleComposerDrafts(keys, { project: "p:1" }), keys.slice(0, 2), "a deleted project: every draft in it, nothing else");
});

test("UIC-11: a storage that refuses reads or writes says so and never throws; the text stays the page's", () => {
  const values = new Map<string, string>();
  const working: ComposerStorage = { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); }, removeItem: (name) => { values.delete(name); } };
  const draft = composerDraft(() => working, "k");
  assert.equal(draft.read(), null);
  assert.equal(draft.write("写到一半", "2026-11-08T03:00:00.000Z"), true);
  assert.deepEqual(draft.read(), { text: "写到一半", at: "2026-11-08T03:00:00.000Z" });
  assert.equal(draft.write("  "), true);
  assert.equal(values.has("k"), false, "an empty draft is removed, not kept");
  values.set("k", "not a draft");
  assert.equal(draft.read(), null, "a value not of the composer's shape is no draft");
  const full: ComposerStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => { throw new Error("SecurityError"); } };
  const refused = composerDraft(() => full, "k");
  assert.equal(refused.read(), false);
  assert.equal(refused.write("字还在"), false);
  assert.equal(composerDraft(() => { throw new Error("localStorage disabled"); }, "k").write("x"), false, "even reaching storage may throw");
});
