import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-23/24 (§drag-split): the divider between split panes. A press is only a candidate until the
// pointer has gone about 4 px; while it moves it follows frame by frame inside the room both sides need and settles on the
// default with hysteresis; Escape, a cancelled pointer or the window losing focus put the ratio back and leave no guard or
// cursor behind; the keyboard reads and sets the same value and range; a stage too small for every pane's minimum takes the
// narrow layout instead of squeezing; and a layout this device cannot keep says so once.

test("VUX-23/24: the split divider has a dead zone, follows, snaps with hysteresis, cancels to where it was, speaks its range and gives way to the narrow layout", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click("[data-titlebar-tabs] [data-tab-split]");
  await click("[data-layout-split=right]");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2 && document.querySelector('[data-direction=row] [data-tab-sash]')");
  const sash = "document.querySelector('[data-direction=row] [data-tab-sash]')", root = "document.querySelector('[data-tab-workspace]')";
  const value = () => evaluate<number>(`Number(${sash}.getAttribute('aria-valuenow'))`);
  const center = await evaluate<{ x: number; y: number; width: number }>(`(() => { const box = ${sash}.getBoundingClientRect(), split = ${sash}.parentElement.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 3, width: split.width }; })()`);
  const mouse = (type: string, x: number, buttons = 1) => command("Input.dispatchMouseEvent", { type, x, y: center.y, button: "left", buttons, clickCount: 1 }, sessionId);
  /** Where the divider would be for this ratio, in page x. */
  const at = (ratio: number) => center.x + (ratio - 0.5) * center.width;
  const guarded = () => evaluate<{ resizing: boolean; frames: string[] }>(`({ resizing: ${root}.classList.contains('is-resizing'), frames: [...document.querySelectorAll('iframe.tab-content-frame')].map(frame => getComputedStyle(frame).pointerEvents) })`);
  assert.equal(await value(), 50);

  // A press and a 3 px wobble is still a click: nothing moves and nothing is guarded.
  await mouse("mousePressed", center.x);
  await mouse("mouseMoved", center.x + 3);
  assert.equal((await guarded()).resizing, false, "under the dead zone the press is only a candidate");
  await mouse("mouseReleased", center.x, 0);
  assert.equal(await value(), 50);

  // Past it, the divider follows the pointer; the frames are guarded while it moves and released after.
  await mouse("mousePressed", center.x);
  await mouse("mouseMoved", at(0.62));
  const moving = await guarded();
  assert.equal(moving.resizing, true);
  assert.ok(moving.frames.every(value => value === "none"), "the panes' frames do not take the pointer mid-drag");
  assert.equal(await value(), 62, "the divider is where the pointer is");
  // Back near the default it settles there; 12 px off it holds; past 16 px it lets go again.
  await mouse("mouseMoved", center.x + 6);
  assert.equal(await value(), 50, "within 8 px it settles on the default");
  await mouse("mouseMoved", center.x + 12);
  assert.equal(await value(), 50, "12 px off, a settled divider holds");
  await mouse("mouseMoved", center.x + 30);
  assert.ok(Math.abs((await value()) - 50 - 30 / center.width * 100) < 1, "past 16 px it follows again");
  await mouse("mouseMoved", at(0.4));
  await mouse("mouseReleased", at(0.4), 0);
  assert.equal(await value(), 40);
  const after = await guarded();
  assert.equal(after.resizing, false); assert.ok(after.frames.every(value => value !== "none"), "nothing stays guarded");
  assert.equal(await evaluate<number>(`Math.round(JSON.parse(localStorage.getItem('molis-work-tab-workspace:' + ${JSON.stringify(projectId)})).layout.tree.ratio * 100)`), 40, "a release keeps the ratio");

  // Escape mid-drag puts back the ratio of the press; the pointer moving on changes nothing.
  await mouse("mousePressed", at(0.4));
  await mouse("mouseMoved", at(0.7));
  assert.equal(await value(), 70);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  assert.equal(await value(), 40, "Escape restores the ratio it had at the press");
  assert.equal((await guarded()).resizing, false);
  await mouse("mouseMoved", at(0.75));
  await mouse("mouseReleased", at(0.75), 0);
  assert.equal(await value(), 40, "the rest of a cancelled drag does nothing");
  // The window losing focus mid-drag cancels the same way.
  await mouse("mousePressed", at(0.4));
  await mouse("mouseMoved", at(0.3));
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await value(), 40); assert.equal((await guarded()).resizing, false);
  await mouse("mouseReleased", at(0.3), 0);

  // A drag never takes a side below a pane's minimum; the keyboard reads and sets the same range.
  await mouse("mousePressed", at(0.4));
  await mouse("mouseMoved", 4);
  await mouse("mouseReleased", 4, 0);
  const range = await evaluate<{ min: number; max: number; now: number }>(`({ min: Number(${sash}.getAttribute('aria-valuemin')), max: Number(${sash}.getAttribute('aria-valuemax')), now: Number(${sash}.getAttribute('aria-valuenow')) })`);
  assert.equal(range.now, range.min, "dragged past the edge, it stops at the range");
  assert.ok(range.min >= 15 && range.max <= 85 && range.min < range.max);
  assert.ok(await evaluate<boolean>("[...document.querySelectorAll('[data-tab-pane]')].every(pane => pane.getBoundingClientRect().width >= 236)"), "no pane is squeezed under its minimum");
  await evaluate(`${sash}.focus()`);
  const key = async (name: string, code = name) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code }, sessionId);
  };
  await key("End"); assert.equal(await value(), range.max);
  await key("Home"); assert.equal(await value(), range.min);
  await key("Enter"); assert.equal(await value(), 50, "Enter goes back to the default");
  await key("ArrowRight"); assert.equal(await value(), 55);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: at(0.55), y: center.y, button: "left", clickCount: 1 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: at(0.55), y: center.y, button: "left", clickCount: 1 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: at(0.55), y: center.y, button: "left", clickCount: 2 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: at(0.55), y: center.y, button: "left", clickCount: 2 }, sessionId);
  assert.equal(await value(), 50, "a double click goes back to the default");

  // A layout this device cannot keep is said once, not on every step.
  await evaluate("window.realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota'); }");
  await evaluate(`${sash}.focus()`);
  await key("ArrowLeft");
  await waitFor("document.querySelector('[data-toast]')?.textContent.includes('布局没能保存')", 5_000);
  await evaluate("document.querySelector('[data-toast]').textContent = ''");
  await key("ArrowLeft");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate("document.querySelector('[data-toast]').textContent.includes('布局没能保存')"), false, "the same failure is not said again");
  await evaluate("Storage.prototype.setItem = window.realSetItem");
  await key("ArrowRight");

  // Four columns on a stage too narrow for four panes (4 × 240 px and the gaps) take the narrow layout; widening gives the split back.
  for (const count of [3, 4]) {
    await click(".tab-pane.is-focused [data-tab-split]");
    await click("[data-layout-split=right]");
    await waitFor(`document.querySelectorAll('[data-tab-pane]').length === ${count}`);
  }
  assert.equal(await evaluate(`${root}.hasAttribute('data-split-narrow')`), false);
  await command("Emulation.setDeviceMetricsOverride", { width: 960, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`${root}.hasAttribute('data-split-narrow') || document.querySelector('[data-tab-panes]').getBoundingClientRect().width > 984`, 5_000);
  assert.equal(await evaluate(`${root}.hasAttribute('data-split-narrow')`), true, `the stage is ${await evaluate("Math.round(document.querySelector('[data-tab-panes]').getBoundingClientRect().width)")} px`);
  const narrow = await evaluate<{ shown: number; stage: number; pane: number; split: boolean }>(`(() => { const shown = [...document.querySelectorAll('[data-tab-pane]')].filter(pane => pane.getBoundingClientRect().width > 0);
    return { shown: shown.length, stage: Math.round(document.querySelector('[data-tab-panes]').getBoundingClientRect().width), pane: Math.round(shown[0].getBoundingClientRect().width), split: document.querySelector('.tab-pane.is-focused [data-tab-split]') !== null }; })()`);
  const evidence = reviewEvidenceUrl("split-divider/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("narrow.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  assert.equal(narrow.shown, 1, "only the focused pane shows");
  assert.equal(narrow.pane, narrow.stage, "and it takes the whole stage");
  await click(".tab-pane.is-focused [data-tab-split]");
  assert.equal(await evaluate("document.querySelector('[data-layout-split=right]').disabled"), true, "no further split is offered");
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-focus-pane]').length") >= 4, "every pane can still be switched to");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`!${root}.hasAttribute('data-split-narrow')`, 5_000);
  assert.equal(await evaluate<number>("[...document.querySelectorAll('[data-tab-pane]')].filter(pane => pane.getBoundingClientRect().width > 0).length"), 4, "a wide stage gives the four columns back");
});
