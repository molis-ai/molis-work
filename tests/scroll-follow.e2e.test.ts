import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FOLLOW_COOLDOWN_MS, FOLLOW_STYLES, SCROLL_FOLLOW_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";

// specs/visual-ui-experience VUX-26: one owner for a growing conversation's scroll, the shipped page script on a blank page,
// driven by real wheel and key input and by the calls a conversation makes (pin, toLatest, release).
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("VUX-26 scroll ownership: only the person detaches, pins wait out a gesture, back to latest is one trip, anchoring only while detached", { timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "scroll-follow-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  t.after(async () => { await browser.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.page();
  await page.viewport(900, 700);
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.evaluate(`(() => {
    const style = document.createElement("style");
    style.textContent = ${JSON.stringify(FOLLOW_STYLES)} + "body{margin:0;font:14px system-ui}#thread{height:300px;overflow:auto;margin:40px}#thread p{margin:0;height:40px}";
    document.head.append(style);
    const thread = document.createElement("div"); thread.id = "thread"; thread.tabIndex = 0;
    for (let i = 0; i < 40; i++) { const p = document.createElement("p"); p.textContent = "第 " + i + " 段"; p.id = "p" + i; thread.append(p); }
    document.body.append(thread);
    thread.scrollTop = thread.scrollHeight;
    const s = document.createElement("script"); s.textContent = ${JSON.stringify(SCROLL_FOLLOW_CLIENT_SCRIPT)}; document.body.append(s);
    window.changes = [];
    window.follow = window.molisFollow(thread, { onChange: (state) => window.changes.push(state) });
    window.grow = (n = 3) => { for (let i = 0; i < n; i++) { const p = document.createElement("p"); p.textContent = "新的"; thread.append(p); } window.follow.pin(); };
  })()`);
  const state = () => page.evaluate<string>(`document.getElementById("thread").dataset.follow`);
  const distance = () => page.evaluate<number>(`(() => { const t = document.getElementById("thread"); return t.scrollHeight - t.scrollTop - t.clientHeight; })()`);
  const anchor = () => page.evaluate<string>(`getComputedStyle(document.getElementById("thread")).overflowAnchor`);
  const wheel = (deltaY: number) => page.command("Input.dispatchMouseEvent", { type: "mouseWheel", x: 200, y: 200, deltaX: 0, deltaY });
  const frames = () => page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);

  assert.equal(await state(), "following", "a conversation opened at its end follows");
  assert.equal(await anchor(), "none", "while following the pin owns the shift, not the browser's anchoring");
  await page.evaluate(`window.grow()`); await frames();
  assert.ok(await distance() <= 1, "new content is pinned in view");
  // The input growing takes height from the conversation: following, the last line stays in view.
  await page.evaluate(`document.getElementById("thread").style.height = "220px"`); await frames();
  assert.ok(await distance() <= 1, "a shorter viewport keeps the end in view");

  // The page shrinking the content clamps at the end: a scroll it made, not the person's, and it stays at the end.
  await page.evaluate(`document.getElementById("thread").lastElementChild.remove()`); await frames();
  assert.equal(await state(), "following", "a scroll the page caused at the end does not detach");

  // One wheel notch towards the start detaches at once; new content then waits.
  await wheel(-120);
  await page.wait(`document.getElementById("thread").dataset.follow === "detached"`);
  await sleep(200);
  const reading = await page.evaluate<number>(`document.getElementById("thread").scrollTop`);
  await page.evaluate(`window.grow()`); await frames();
  assert.equal(await page.evaluate<number>(`document.getElementById("thread").scrollTop`), reading, "detached, new content does not move the reader");
  assert.equal(await anchor(), "auto", "detached, the browser keeps the paragraph being read in place");
  const seen = await page.evaluate<string>(`(() => { const t = document.getElementById("thread"), top = t.getBoundingClientRect().top; return [...t.children].find((p) => p.getBoundingClientRect().top >= top).id; })()`);
  const before = await page.evaluate<number>(`document.getElementById(${JSON.stringify(seen)}).getBoundingClientRect().top`);
  await page.evaluate(`(() => { const block = document.createElement("p"); block.style.height = "200px"; document.getElementById("thread").prepend(block); })()`);
  await frames();
  assert.ok(Math.abs(await page.evaluate<number>(`document.getElementById(${JSON.stringify(seen)}).getBoundingClientRect().top`) - before) <= 1, "a block opening above does not push the paragraph being read");

  // The person scrolling back to the end follows again.
  for (let i = 0; i < 12 && await state() !== "following"; i++) { await wheel(400); await sleep(80); }
  assert.equal(await state(), "following", "coming back to the end oneself follows again");

  // Cooldown: a pin during a gesture waits until the gesture is over, then lands once.
  await wheel(120); await page.evaluate(`window.grow(5)`); await frames();
  assert.ok(await distance() > 40, "a pin does not land in the middle of a gesture");
  await sleep(FOLLOW_COOLDOWN_MS + 100);
  assert.ok(await distance() <= 1, "after the cooldown the pin lands");

  // A key towards the start detaches.
  await page.evaluate(`document.getElementById("thread").focus()`);
  await page.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 });
  assert.equal(await state(), "detached", "PageUp detaches");

  // Back to latest: one smooth trip, following the whole way (no flicker to detached in the middle).
  await page.evaluate(`window.changes.length = 0; window.follow.toLatest()`);
  await page.wait(`(() => { const t = document.getElementById("thread"); return t.scrollHeight - t.scrollTop - t.clientHeight <= 1; })()`);
  await sleep(100);
  assert.deepEqual(await page.evaluate<string[]>(`window.changes`), ["following"], "the trip back follows from its first frame to its last");

  // Selecting text inside means reading: detached.
  await page.evaluate(`(() => { const range = document.createRange(); range.selectNodeContents(document.getElementById("p10")); getSelection().removeAllRanges(); getSelection().addRange(range); })()`);
  await page.wait(`document.getElementById("thread").dataset.follow === "detached"`);
  await page.evaluate(`getSelection().removeAllRanges(); window.follow.toLatest()`);
  await page.wait(`document.getElementById("thread").dataset.follow === "following"`);

  // A scroll the page made away from the end (a card re-rendering above, a panel keeping its anchor) is not the person
  // leaving: it keeps following, and the next pin lands.
  await sleep(400);
  await page.evaluate(`document.getElementById("thread").scrollTop = 100`); await sleep(100);
  assert.equal(await state(), "following", "a page-made scroll never detaches");
  await page.evaluate(`window.grow()`); await frames();
  assert.ok(await distance() <= 1, "the next pin takes the reader to the end again");

  // A downward gesture on the way back to latest does not detach; only moving away from the end does.
  await wheel(-400); await page.wait(`document.getElementById("thread").dataset.follow === "detached"`); await sleep(200);
  await page.evaluate(`window.changes.length = 0; window.follow.toLatest()`);
  await wheel(120);
  await page.wait(`(() => { const t = document.getElementById("thread"); return t.scrollHeight - t.scrollTop - t.clientHeight <= 1; })()`);
  await sleep(150);
  assert.deepEqual(await page.evaluate<string[]>(`window.changes`), ["following"], "scrolling down on the way back keeps following");

  // The page's own words: restore(top) judges the restored place, resume() follows a fresh conversation, release() steps aside.
  await page.evaluate(`window.follow.restore(100)`);
  assert.equal(await state(), "detached", "a saved place away from the end is read as reading");
  await page.evaluate(`window.follow.restore(document.getElementById("thread").scrollHeight)`);
  assert.equal(await state(), "following", "a saved place at the end follows");
  await page.evaluate(`window.follow.release()`);
  assert.equal(await state(), "detached", "release() detaches before the page scrolls to a card");
  await page.evaluate(`window.follow.resume(); window.grow()`); await frames();
  assert.equal(await state(), "following"); assert.ok(await distance() <= 1, "resume() lets the next pin land");

  // Content growing while the person scrolls down (the pin still waiting out the gesture) leaves the end further away,
  // but they moved towards it: still following.
  await page.evaluate(`(() => { const t = document.getElementById("thread"); for (let i = 0; i < 5; i++) t.append(Object.assign(document.createElement("p"), { textContent: "长得比滚得快" })); })()`);
  await wheel(60); await sleep(150);
  assert.equal(await state(), "following", "scrolling down while content grows is not leaving");
  await page.evaluate(`window.follow.pin()`); await sleep(FOLLOW_COOLDOWN_MS + 100);
  assert.ok(await distance() <= 1, "and the waiting pin lands");

  // A second caller gets the same owner; its onChange is not the one kept.
  await page.evaluate(`window.second = []; window.molisFollow(document.getElementById("thread"), { onChange: (state) => window.second.push(state) }).release()`);
  assert.deepEqual(await page.evaluate<string[]>(`window.second`), [], "a later caller's onChange is not called");
  await page.evaluate(`window.follow.resume()`);

  // One owner per element; dispose() lets everything go.
  assert.equal(await page.evaluate<boolean>(`window.molisFollow(document.getElementById("thread")) === window.follow`), true, "the same element gets the same owner");
  await page.evaluate(`window.follow.dispose()`);
  assert.equal(await page.evaluate<string | null>(`document.getElementById("thread").dataset.follow ?? null`), null);
  await wheel(-120); await sleep(100);
  assert.equal(await page.evaluate<string | null>(`document.getElementById("thread").dataset.follow ?? null`), null, "a disposed owner no longer listens");
  assert.notEqual(await page.evaluate<boolean>(`window.molisFollow(document.getElementById("thread")) === window.follow`), true, "after dispose a new owner can be made");
});
