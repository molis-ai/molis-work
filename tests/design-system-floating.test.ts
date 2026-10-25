import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followScroll, pinAt, placeFloating, placeOverlay, scrollShouldFollow } from "@molis-ai/molis-work-plugin-sdk/browser";

// W1-02 (context-program §18): where a floating layer goes is one thing in the design system. The Pages editor, the toolbar next to
// a selection and the popovers in a split pane place themselves with it. It is a leaf with no import, so a page bundle takes it alone.

/** A stand-in for a DOM object that has only what the code under test touches. */
const stub = <T>(value: object): T => value as T;

const viewport = { width: 1000, height: 800 };
const size = { width: 200, height: 100 };
const anchor = (over: Partial<{ left: number; top: number; right: number; bottom: number }> = {}) => ({ left: 100, top: 300, right: 200, bottom: 320, ...over });

test("W1-02: a layer goes on the side that fits and stays inside the screen", () => {
  assert.deepEqual(placeFloating(anchor(), size, viewport, "below"), { left: 100, top: 328 });
  assert.deepEqual(placeFloating(anchor(), size, viewport, "above"), { left: 100, top: 192 });
  assert.deepEqual(placeFloating(anchor({ top: 20, bottom: 40 }), size, viewport, "above"), { left: 100, top: 48 }, "no room above: below");
  assert.deepEqual(placeFloating(anchor({ top: 700, bottom: 720 }), size, viewport, "below"), { left: 100, top: 592 }, "no room below: above");
  assert.deepEqual(placeFloating(anchor({ left: 950, right: 990 }), size, viewport, "below").left, 792, "kept inside the right margin");
  assert.deepEqual(placeFloating(anchor({ left: 2, right: 40 }), size, viewport, "below").left, 8, "kept inside the left margin");
  assert.deepEqual(placeFloating(anchor(), size, viewport, "beside"), { left: 208, top: 300 }, "on the right when it fits");
  assert.equal(placeFloating(anchor({ left: 850, right: 950 }), size, viewport, "beside").left, 642, "on the left when the right has no room");
  assert.deepEqual(placeFloating(anchor(), { width: 200, height: 2000 }, viewport, "below").top, 8, "taller than the screen: held to the margin");
});

class FakeNode {}
function withNode<T>(run: () => T): T {
  const saved = (globalThis as { Node?: unknown }).Node;
  Object.assign(globalThis, { Node: FakeNode });
  try { return run(); } finally { Object.assign(globalThis, { Node: saved }); }
}

test("W1-02: scrolling inside the panel does not move it; the page scrolling does", () => {
  const inside = new FakeNode(), outside = new FakeNode();
  const panel = stub<Element>({ contains: (node: unknown) => node === inside });
  withNode(() => {
    assert.equal(scrollShouldFollow(stub<EventTarget>(inside), panel), false);
    assert.equal(scrollShouldFollow(stub<EventTarget>(outside), panel), true);
  });
  assert.equal(scrollShouldFollow(null, panel), true, "no target: follow");
  assert.equal(scrollShouldFollow(stub<EventTarget>(inside), null), true, "no panel: follow");
});

function fakeLayer(offset = { left: 0, top: 0 }, box = { width: 200, height: 100 }, stageBox?: { left: number; top: number; right: number; bottom: number }) {
  const style: Record<string, string> = {};
  return stub<HTMLElement>({
    style,
    closest: (selector: string) => selector === "[data-floating-stage]" && stageBox ? { getBoundingClientRect: () => stageBox } : null,
    getBoundingClientRect: () => ({ left: parseFloat(style.left ?? "0") + offset.left, top: parseFloat(style.top ?? "0") + offset.top, width: box.width, height: box.height }),
  });
}

test("W1-02: a pane that is itself the fixed box shifts the layer, and pinAt measures where it landed and corrects", () => {
  const plain = fakeLayer();
  pinAt(plain, 100, 200);
  assert.deepEqual([plain.style.left, plain.style.top], ["100px", "200px"]);
  const shifted = fakeLayer({ left: 5, top: 7 });
  pinAt(shifted, 100, 200);
  assert.deepEqual([shifted.style.left, shifted.style.top], ["95px", "193px"], "corrected by the difference");
});

test("W1-02: an overlay fits the stage it is in and never grows past its own CSS cap", () => {
  const saved = { window: (globalThis as { window?: unknown }).window, getComputedStyle: (globalThis as { getComputedStyle?: unknown }).getComputedStyle };
  Object.assign(globalThis, { window: { innerWidth: 1000, innerHeight: 800 }, getComputedStyle: () => ({ maxWidth: "none", maxHeight: "300px" }) });
  try {
    const layer = fakeLayer({ left: 0, top: 0 }, { width: 200, height: 100 }, { left: 100, top: 50, right: 600, bottom: 450 });
    placeOverlay(layer, anchor({ left: 150, top: 200, right: 250, bottom: 220 }), "below");
    assert.deepEqual([layer.style.maxWidth, layer.style.maxHeight], ["484px", "300px"], "the stage less its margins, capped by the CSS");
    assert.deepEqual([layer.style.left, layer.style.top], ["150px", "228px"], "placed in the stage's own coordinates, then pinned");
    const free = fakeLayer();
    placeOverlay(free, anchor(), "below");
    assert.deepEqual([free.style.left, free.style.top], ["100px", "328px"], "no stage: the screen");
  } finally { Object.assign(globalThis, saved); }
});

test("W1-02: following the page's scroll stops when asked, and ignores the panel's own", () => {
  const inside = new FakeNode(), outside = new FakeNode();
  const panel = stub<Element>({ contains: (node: unknown) => node === inside });
  const handlers: Array<{ added: Array<[string, (event: { target: unknown }) => void, unknown]>; removed: Array<[string, unknown, unknown]> }> = [{ added: [], removed: [] }];
  const log = handlers[0]!;
  const saved = (globalThis as { document?: unknown }).document;
  Object.assign(globalThis, { document: {
    addEventListener: (type: string, fn: (event: { target: unknown }) => void, capture: unknown) => { log.added.push([type, fn, capture]); },
    removeEventListener: (type: string, fn: unknown, capture: unknown) => { log.removed.push([type, fn, capture]); },
  } });
  try {
    withNode(() => {
      let runs = 0;
      const stop = followScroll(panel, () => { runs += 1; });
      assert.deepEqual(log.added.map(entry => [entry[0], entry[2]]), [["scroll", true]], "one capture listener");
      log.added[0]![1]({ target: outside });
      log.added[0]![1]({ target: inside });
      assert.equal(runs, 1);
      stop();
      assert.deepEqual(log.removed.map(entry => [entry[0], entry[1] === log.added[0]![1], entry[2]]), [["scroll", true, true]]);
    });
  } finally { Object.assign(globalThis, { document: saved }); }
});

test("W1-02: the subpath is a leaf a page bundle can take alone: no import, nothing of Node", () => {
  const source = readFileSync(new URL(import.meta.resolve("@molis-ai/molis-work-plugin-sdk/browser")), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.doesNotMatch(source, /\bfrom\s+["']/u);
  assert.doesNotMatch(source, /node:/u);
});
