// Security invariant S-30 (docs/system/SECURITY-INVARIANTS.md): a split pane and the page around it take each other's
// messages only from this origin and from each other's window; a token handed to one pane is taken back by that pane's
// frame alone, and once. The shipped check (every pane-message handler on either side asks it first) runs here on a small
// window port. Public entries only (tests may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { PANE_MESSAGES_SCRIPT } from "@molis-ai/molis-work-app-workbench";

const ORIGIN = "http://127.0.0.1:4173";
interface Panes {
  from(event: unknown): unknown;
  fromParent(event: unknown): boolean;
  keep(token: string, frame: unknown, value: unknown): void;
  take(token: string, frame: unknown): unknown;
}

/** The page around the panes: two pane frames, and a frame that is not a pane. */
function page() {
  const top: Record<string, unknown> = {};
  top.parent = top;
  const paneA = { contentWindow: { name: "pane a" }, dataset: { paneOwner: "a" } };
  const paneB = { contentWindow: { name: "pane b" }, dataset: { paneOwner: "b" } };
  const stray = { contentWindow: { name: "not a pane" }, dataset: {} };
  const document = { querySelectorAll: (selector: string) => selector === "iframe[data-pane-owner]" ? [paneA, paneB] : [paneA, paneB, stray] };
  const panes = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: top, document, location: { origin: ORIGIN } }) as Panes;
  return { top, paneA, paneB, stray, panes };
}

/** Inside a pane: the page around it, and another window. */
function pane() {
  const around = { name: "page" };
  const self: Record<string, unknown> = { parent: around };
  const panes = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: self, document: { querySelectorAll: () => [] }, location: { origin: ORIGIN } }) as Panes;
  return { around, self, panes };
}

test("S-30 the page takes a pane message only from this origin and from the window of one of its panes", () => {
  const { top, paneA, paneB, stray, panes } = page();
  const message = { type: "workbench-surface-landing", landing: null };
  assert.equal(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data: message }), paneA, "a pane's own message names its frame");
  assert.equal(panes.from({ origin: ORIGIN, source: paneB.contentWindow, data: message }), paneB);
  assert.equal(panes.from({ origin: ORIGIN, source: stray.contentWindow, data: message }), null, "a frame that is not a pane");
  assert.equal(panes.from({ origin: ORIGIN, source: top, data: message }), null, "the page itself");
  assert.equal(panes.from({ origin: ORIGIN, source: { name: "another window" }, data: message }), null, "a window that is not a frame here (a popup, an opener)");
  for (const origin of ["http://127.0.0.1:4174", "http://localhost:4173", "https://example.com", "null", ""]) {
    assert.equal(panes.from({ origin, source: paneA.contentWindow, data: message }), null, `from ${JSON.stringify(origin)}`);
  }
  for (const data of [null, undefined, "workbench-surface-landing", { type: 7 }, {}]) {
    assert.equal(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data }), null, `data ${JSON.stringify(data)}`);
  }
});

test("S-30 a pane takes a message only from the page around it, from this origin", () => {
  const { around, self, panes } = pane();
  const message = { type: "workbench-context-attach-chosen", token: "t" };
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: message }), true);
  assert.equal(panes.fromParent({ origin: ORIGIN, source: self, data: message }), false, "the pane's own window");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: { name: "a sibling pane" }, data: message }), false, "another pane or window");
  assert.equal(panes.fromParent({ origin: "https://example.com", source: around, data: message }), false, "another origin");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: { token: "t" } }), false, "no type");
  // A page that is not framed has no page around it: what it posts to itself is not from a parent.
  const alone: Record<string, unknown> = {};
  alone.parent = alone;
  const top = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: alone, document: { querySelectorAll: () => [] }, location: { origin: ORIGIN } }) as Panes;
  assert.equal(top.fromParent({ origin: ORIGIN, source: alone, data: message }), false);
});

test("S-30 a token handed to one pane is taken back only by that pane's frame, and only once", () => {
  const { paneA, paneB, panes } = page();
  const choice = { run: "the ranked landing" };
  panes.keep("token-1", paneA, choice);
  assert.equal(panes.take("token-1", paneB), null, "another pane cannot use it");
  assert.equal(panes.take("token-2", paneA), null, "a token that was never handed out");
  assert.equal(panes.take("token-1", paneA), choice, "its own pane takes it");
  assert.equal(panes.take("token-1", paneA), null, "a second time it is gone");
});

test("S-30 a pane shows its landing only when the page around it asks, from this origin", () => {
  const { around, self, panes } = pane();
  const flash = { type: "workbench-surface-landing-flash" };
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: flash }), true, "the page around it");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: self, data: flash }), false, "the pane asking itself");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: { name: "a sibling pane" }, data: flash }), false, "a sibling pane or a popup");
  for (const origin of ["http://127.0.0.1:4174", "https://example.com", "null"]) {
    assert.equal(panes.fromParent({ origin, source: around, data: flash }), false, `from ${JSON.stringify(origin)}`);
  }
  // The page does not take it back from a pane: a pane cannot make the page around it, or another pane, flash.
  const { paneA, panes: top } = page();
  assert.equal(top.fromParent({ origin: ORIGIN, source: paneA.contentWindow, data: flash }), false);
});
