import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COPY_DONE_HOLD_MS, COPY_FEEDBACK_CLIENT_SCRIPT, MICRO_INTERACTION_CLIENT_SCRIPT, MICRO_INTERACTION_STYLES, renderCollapsible, renderToggleGroup,
} from "@molis-ai/molis-work-design-system";
import type { ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";

// The design mechanisms of specs/visual-ui-experience §5 that live in the shared tail: the shipped stylesheet and page
// scripts, on a blank page, driven the way a page drives them.
async function openPage(t: test.TestContext, body: string): Promise<ChromePage | null> {
  const directory = mkdtempSync(join(tmpdir(), "visual-mechanisms-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return null; }
  t.after(async () => { await browser.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.page();
  await page.viewport(900, 700);
  // The viewport helper turns reduced motion on; these mechanisms are checked with motion, and with reduced motion where said.
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.evaluate(`(() => {
    const style = document.createElement("style");
    // The page's own motion tokens, as every product page defines them.
    style.textContent = ":root{--ease-quint:cubic-bezier(.22,1,.36,1);--ease-spring:cubic-bezier(.34,1.56,.64,1);--motion-fast:130ms;--motion-normal:250ms}" + ${JSON.stringify(MICRO_INTERACTION_STYLES)} + "body{font:14px system-ui}";
    document.head.append(style);
    document.body.innerHTML = ${JSON.stringify(body)};
    for (const code of [${JSON.stringify(MICRO_INTERACTION_CLIENT_SCRIPT)}, ${JSON.stringify(COPY_FEEDBACK_CLIENT_SCRIPT)}]) { const s = document.createElement("script"); s.textContent = code; document.body.append(s); }
  })()`);
  return page;
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("VUX-19 copy feedback: done only after the clipboard took it, same width, renewed by a newer press, never overwriting a newer failure", { timeout: 60_000 }, async t => {
  const page = await openPage(t, `<p><button id="copy">复制</button><span id="next">下一个</span></p>`);
  if (!page) return;
  // A clipboard the test answers: each write waits for its own verdict.
  await page.evaluate(`(() => {
    window.writes = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text) => new Promise((resolve, reject) => window.writes.push({ text, resolve, reject })) } });
  })()`);
  const state = () => page.evaluate<string>(`document.getElementById("copy").dataset.copy ?? "idle"`);
  const width = () => page.evaluate<number>(`document.getElementById("copy").getBoundingClientRect().width`);
  const press = (labels = "{ done: '已复制', failed: '复制失败' }") => page.evaluate(`void window.molisCopy(document.getElementById("copy"), "正文", ${labels})`);

  await press();
  await page.wait(`window.writes.length === 1`);
  const idleWidth = await width();
  assert.equal(await state(), "idle", "nothing is claimed while the clipboard has not answered");
  await page.evaluate(`window.writes[0].resolve()`);
  await page.wait(`document.getElementById("copy").dataset.copy === "done"`);
  assert.equal(await width(), idleWidth, "the success label takes no more room than the reserved width");
  await page.wait(`document.querySelector("[role=status].mw-sr-only")?.textContent === "已复制"`);

  // A newer press renews the hold: still done after the first hold would have ended.
  await sleep(COPY_DONE_HOLD_MS - 1000);
  await press(); await page.wait(`window.writes.length === 2`); await page.evaluate(`window.writes[1].resolve()`);
  await sleep(1500);
  assert.equal(await state(), "done", "the earlier timer does not end the renewed result");
  await page.wait(`!document.getElementById("copy").dataset.copy`, { timeoutMs: COPY_DONE_HOLD_MS + 1000 });

  // A slow success that answers after a newer failure does not cover it.
  await press(); await press();
  await page.wait(`window.writes.length === 4`);
  await page.evaluate(`window.writes[3].reject(new Error("denied"))`);
  await page.wait(`document.getElementById("copy").dataset.copy === "failed"`);
  assert.equal(await width(), idleWidth, "the failure label fits the same width");
  await page.evaluate(`window.writes[2].resolve()`);
  await sleep(200);
  assert.equal(await state(), "failed", "the older success is not shown over the newer failure");
  assert.equal(await page.evaluate(`document.getElementById("copy").textContent.includes("复制")`), true);

  // The button's own content stays its idle face; a removed button is let go without errors.
  await page.evaluate(`document.getElementById("copy").remove()`);
  await sleep(100);
});

test("VUX-19 an icon-only copy button answers with a check or a cross in its own box, and its words are read out", { timeout: 60_000 }, async t => {
  const page = await openPage(t, `<p><button id="copy" aria-label="复制" style="width:32px;height:32px;padding:0"><svg aria-hidden="true" width="16" height="16"><use href="#icon-copy"></use></svg></button></p>`);
  if (!page) return;
  await page.evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text) => text === "坏" ? Promise.reject(new Error("denied")) : Promise.resolve() } })`);
  const box = () => page.evaluate<number[]>(`(() => { const r = document.getElementById("copy").getBoundingClientRect(); return [r.width, r.height]; })()`);
  const before = await box();
  await page.evaluate(`void window.molisCopy(document.getElementById("copy"), "正文", { done: "已复制", failed: "复制失败" })`);
  await page.wait(`document.getElementById("copy").dataset.copy === "done"`);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll("#copy > [data-copy-face]")].map((n) => [n.dataset.copyFace, n.textContent.trim(), n.querySelector("use")?.getAttribute("href") ?? ""])`),
    [["idle", "", "#icon-copy"], ["done", "", "#icon-check"], ["failed", "", "#icon-x"]], "no words inside an icon button: a check for done, a cross for failed");
  assert.deepEqual(await box(), before, "the icon button keeps its size");
  await page.wait(`document.querySelector("[role=status].mw-sr-only")?.textContent === "已复制"`);
  await page.evaluate(`void window.molisCopy(document.getElementById("copy"), "坏", { done: "已复制", failed: "复制失败" })`);
  await page.wait(`document.getElementById("copy").dataset.copy === "failed"`);
  await page.wait(`document.querySelector("[role=status].mw-sr-only")?.textContent === "复制失败"`);
});

test("VUX-22 a collapsible opens to its natural height, reverses midway, grows with its content and keeps no hidden focus", { timeout: 60_000 }, async t => {
  const body = renderCollapsible({ summary: "详情", body: `<p id="line">第一行</p><button id="inside">里面的按钮</button>` });
  const page = await openPage(t, `<div id="host">${body}</div><p id="after">之后的段落</p>`);
  if (!page) return;
  const height = () => page.evaluate<number>(`document.querySelector(".mw-collapsible__body").getBoundingClientRect().height`);
  // The body's height in every frame for a while after `act`, read in the page so no frame is missed.
  const frames = (act: string, ms = 400) => page.evaluate<number[]>(`new Promise(resolve => { const body = document.querySelector(".mw-collapsible__body"), seen = [], start = performance.now();
    ${act}; const step = () => { seen.push(Math.round(body.getBoundingClientRect().height)); if (performance.now() - start < ${ms}) requestAnimationFrame(step); else resolve(seen); }; requestAnimationFrame(step); })`);
  assert.equal(await height(), 0, "closed: the body takes no room");
  const opening = await frames(`document.querySelector(".mw-collapsible").open = true`);
  const full = await height();
  const between = new Set(opening.filter(h => h > 0 && h < full));
  assert.ok(full > 40 && between.size >= 3, `the height travels through ${[...between].join(", ")} to ${full}; it does not jump`);

  // Content added while open: the body grows to it, no fixed ceiling.
  await page.evaluate(`document.getElementById("line").insertAdjacentHTML("afterend", "<p>第二行</p><p>第三行</p><p>第四行</p>")`);
  await page.wait(`document.querySelector(".mw-collapsible__body").getBoundingClientRect().height > ${full + 40}`);

  // Reversed midway: closing during the opening continues from the height reached, down to nothing.
  const grown = await height();
  const closing = await frames(`document.querySelector(".mw-collapsible").open = false`, 60);
  const reopening = await frames(`document.querySelector(".mw-collapsible").open = true`, 120);
  const reached = closing.at(-1)!;
  assert.ok(reached > 0 && reached < grown, `closing was stopped midway at ${reached}`);
  assert.ok(Math.abs(reopening[0]! - reached) < grown / 3, `reopening continues from ${reached}, not from 0 or the top (${reopening.slice(0, 4).join(", ")})`);
  await page.evaluate(`document.querySelector(".mw-collapsible").open = false`);
  await page.wait(`document.querySelector(".mw-collapsible__body").getBoundingClientRect().height === 0`);
  await sleep(350);
  assert.equal(await page.evaluate<boolean>(`(() => { const inside = document.getElementById("inside"); inside.focus(); return document.activeElement === inside; })()`), false, "a closed body takes no focus");

  // Reduced motion: it opens at once.
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page.evaluate(`document.querySelector(".mw-collapsible").open = true`);
  await sleep(30);
  assert.ok(await height() > full, "reduced motion: open at once");
});

test("VUX-22 the segmented thumb follows the current option when its pane resizes or its labels change, without a window resize", { timeout: 60_000 }, async t => {
  const group = renderToggleGroup({ label: "视图", items: [{ value: "a", label: "全部" }, { value: "b", label: "今天", current: true }, { value: "c", label: "本周" }] });
  const page = await openPage(t, `<div id="pane" style="width:400px">${group.replace('class="mw-toggle-group"', 'class="mw-toggle-group" style="display:flex;width:100%"')}</div>`);
  if (!page) return;
  const fit = () => page.evaluate<number>(`(() => { const track = document.querySelector(".mw-toggle-group"), current = track.querySelector('[aria-pressed="true"]');
    const s = getComputedStyle(track), box = track.getBoundingClientRect(), slot = current.getBoundingClientRect();
    return Math.abs(parseFloat(s.getPropertyValue("--seg-x")) - (slot.left - box.left)) + Math.abs(parseFloat(s.getPropertyValue("--seg-w")) - slot.width); })()`);
  await page.wait(`document.querySelector(".mw-toggle-group").hasAttribute("data-seg-thumb")`);
  assert.ok(await fit() < 1, "the thumb sits on the current option");
  await page.evaluate(`document.getElementById("pane").style.width = "260px"`);
  await page.wait(`(() => { const s = getComputedStyle(document.querySelector(".mw-toggle-group")); return parseFloat(s.getPropertyValue("--seg-w")) < 100; })()`);
  assert.ok(await fit() < 1, "a narrower pane: the thumb follows without a window resize");
  await page.evaluate(`document.querySelector('[aria-pressed="true"]').firstChild.data = "Today, this week"`);
  await sleep(100);
  assert.ok(await fit() < 1, "a label in another language: the thumb takes its new width");
});

test("VUX-42 VUX-44 VUX-45 a live number keeps its width over its range, in another font too, and only its value is text", { timeout: 60_000 }, async t => {
  const page = await openPage(t, `<p id="row"><span id="n" class="mw-num" data-num-ghost="59 分 59 秒">0 秒</span><button id="near">停止</button></p>`);
  if (!page) return;
  const values = ["0 秒", "9 秒", "10 秒", "59 秒", "1 分 0 秒", "9 分 59 秒", "10 分 0 秒", "59 分 59 秒"];
  const run = async (font: string) => {
    await page.evaluate(`document.getElementById("row").style.fontFamily = ${JSON.stringify(font)}`);
    const seen = new Set<string>();
    for (const value of values) {
      seen.add(await page.evaluate<string>(`(() => { const n = document.getElementById("n"); n.textContent = ${JSON.stringify(value)};
        return n.getBoundingClientRect().width.toFixed(2) + "@" + document.getElementById("near").getBoundingClientRect().left.toFixed(2); })()`));
    }
    return seen;
  };
  for (const font of ["system-ui", "Georgia, serif", "ui-monospace, monospace"]) assert.equal((await run(font)).size, 1, `${font}: one width and one neighbour position for the whole range`);
  assert.equal(await page.evaluate(`document.getElementById("n").textContent`), "59 分 59 秒", "the ghost is not text");
  assert.equal(await page.evaluate(`getComputedStyle(document.getElementById("n")).fontVariantNumeric`), "tabular-nums");
  // Past the range it grows instead of cutting the value.
  const before = await page.evaluate<number>(`document.getElementById("n").getBoundingClientRect().width`);
  const past = await page.evaluate<{ box: number; text: number }>(`(() => { const n = document.getElementById("n"); n.textContent = "100 分 59 秒";
    const range = document.createRange(); range.selectNodeContents(n); return { box: n.getBoundingClientRect().width, text: range.getBoundingClientRect().width }; })()`);
  assert.ok(past.box > before && past.text <= past.box + 0.5, `a value past the reserved range is shown whole (${JSON.stringify(past)})`);
});
