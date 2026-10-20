import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openCoding, coding } from "./fixtures/coding-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience §composer-mentions (VUX-16): a `data-fit` field grows with what is written, falls back when
// lines go, stops at min(its max, 40% of the frame) and scrolls inside with the caret in view, without moving the page
// around it. Chrome has `field-sizing: content`; the desktop's older WebKit does not, so every check runs twice: with the
// engine's own sizing, and with it taken away so the fallback in `browser/field-fit.ts` measures.

/** Takes `field-sizing` away before the page's scripts run: `CSS.supports` says no and the property does nothing. */
const WITHOUT_FIELD_SIZING = `(() => { const supports = CSS.supports.bind(CSS);
  CSS.supports = (...args) => String(args[0]).includes('field-sizing') ? false : supports(...args);
  const still = () => { const style = document.createElement('style'); style.textContent = 'textarea{field-sizing:fixed!important}'; document.head.append(style); };
  if (document.head) still(); else document.addEventListener('DOMContentLoaded', still); })();`;

for (const mode of ["field-sizing", "fallback"] as const) {
  test(`VUX-16 (${mode}): the field grows, falls back, stops at its max and keeps the caret and the page in place`, { timeout: 90_000 }, async (t) => {
    const browser = await openGoalBrowser(t, true); if (!browser) return;
    const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
    if (mode === "fallback") await command("Page.addScriptToEvaluateOnNewDocument", { source: WITHOUT_FIELD_SIZING }, sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor("typeof window.molisFit === 'function'", 20_000);
    assert.equal(await evaluate("CSS.supports('field-sizing', 'content')"), mode === "field-sizing");
    await evaluate(`(() => { const box = document.createElement('div'); box.id = 'box';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:white';
      box.innerHTML = '<div style="height:800px"></div><textarea id="f" data-fit style="display:block;width:300px;font:14px/20px sans-serif;padding:8px;border:1px solid;box-sizing:border-box"></textarea><div style="height:800px"></div>';
      document.body.append(box); box.scrollTop = 700; document.querySelector('#f').focus({ preventScroll: true }); })()`);
    const height = () => evaluate<number>("document.querySelector('#f').getBoundingClientRect().height");
    const write = (text: string) => command("Input.insertText", { text }, sessionId);
    // The caret's line is in view, whole: the field is scrolled to its end.
    const caretSeen = () => evaluate<boolean>("(() => { const f = document.querySelector('#f'); return f.scrollTop + f.clientHeight >= f.scrollHeight - 1; })()");
    await waitFor("document.querySelector('#f').getBoundingClientRect().height > 0");
    // Two lines and its padding to start: 2 × 20 + 16.
    assert.equal(await height(), 56);

    await write("第一行");
    for (const line of ["第二行", "第三行", "第四行"]) await write("\n" + line);
    // Four lines: 4 × 20, the padding and the border.
    assert.equal(await height(), 98, "four lines are four lines high");
    assert.equal(await evaluate("document.querySelector('#box').scrollTop"), 700, "the page around it did not move");

    for (let line = 5; line <= 24; line++) await write("\n第 " + line + " 行");
    assert.equal(await height(), 240, "the field stops at its max");
    assert.ok(await evaluate("document.querySelector('#f').scrollHeight > 240"), "the rest scrolls inside");
    assert.ok(await caretSeen(), "the caret at the end stays in view");
    assert.equal(await evaluate("document.querySelector('#box').scrollTop"), 700);

    // Deleting everything brings it back down: the height is measured again, not only grown.
    await evaluate("document.querySelector('#f').select()");
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
    assert.equal(await evaluate("document.querySelector('#f').value"), "");
    assert.equal(await height(), 56, "an emptied field falls back to its start");

    // A value put back by code (a draft restored) sends no input event; the page calls molisFit.
    await evaluate("(() => { const f = document.querySelector('#f'); f.value = Array.from({ length: 30 }, (_, n) => '草稿 ' + n).join('\\n'); f.setSelectionRange(f.value.length, f.value.length); window.molisFit(f); })()");
    assert.equal(await height(), 240);
    assert.ok(await caretSeen(), "a restored draft shows where the caret is");

    // A caret elsewhere keeps the field where the person left it.
    await evaluate("(() => { const f = document.querySelector('#f'); f.setSelectionRange(0, 0); f.scrollTop = 0; })()");
    await write("开头");
    assert.equal(await evaluate("document.querySelector('#f').scrollTop"), 0, "writing at the start does not jump to the end");

    // Lines rewrap when the width changes: one long line in a narrow field is several, in a wide one fewer.
    await evaluate("(() => { const f = document.querySelector('#f'); f.value = '很长的一句话，'.repeat(12); window.molisFit(f); })()");
    const narrow = await height();
    await evaluate("document.querySelector('#f').style.width = '900px'");
    await waitFor(`document.querySelector('#f').getBoundingClientRect().height < ${narrow}`, 5_000);

    // A short frame gives the field less: never more than 40% of it.
    await evaluate("(() => { const f = document.querySelector('#f'); f.style.width = '300px'; f.value = Array.from({ length: 30 }, (_, n) => '行 ' + n).join('\\n'); window.molisFit(f); })()");
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 400, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("document.querySelector('#f').getBoundingClientRect().height <= 160.5", 5_000);
  });
}

for (const fallback of [false, true]) {
  test(`VUX-16 (${fallback ? "fallback" : "field-sizing"}): Coding's box grows to 320 px and starts small again in a new session`, { timeout: 150_000 }, async (t) => {
    const browser = await openCoding(t, fallback ? WITHOUT_FIELD_SIZING : ""); if (!browser) return;
    const { evaluate, waitFor, command, sessionId, box, start } = browser;
    assert.equal(await evaluate(`${box}.hasAttribute('data-fit')`), true);
    const height = () => evaluate<number>(`${box}.getBoundingClientRect().height`);
    await start("一行");
    const one = await height();
    await evaluate(`${box}.focus()`);
    for (let line = 2; line <= 30; line++) await command("Input.insertText", { text: "\n第 " + line + " 行" }, sessionId);
    // 40% of a 900 px frame is 360 px, so the box's own 320 px is the max.
    assert.equal(await height(), 320, "the box stops at 320 px");
    assert.ok(await evaluate(`(() => { const f = ${box}; return f.scrollTop + f.clientHeight >= f.scrollHeight - 1; })()`), "the last line is in view, whole");
    // A new session's box is emptied by the page's draft (no input event): it starts small again.
    await browser.click(`${coding} [data-coding-new]`);
    await waitFor(`${box}.value === '' && !${box}.disabled`, 15_000);
    assert.ok(await height() <= one + 0.5, `the empty box is back to its start (${await height()} > ${one})`);
  });
}

test("VUX-16: the component board shows the field growing and at its max, as the product draws it", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.querySelectorAll('.mw-catalog-fit').length === 2", 20_000);
  const [grow, full] = ["0", "1"].map(n => `document.querySelectorAll('.mw-catalog-fit')[${n}]`);
  assert.equal(await evaluate(`${full}.getBoundingClientRect().height`), 160, "the specimen at its max is 160 px");
  assert.ok(await evaluate(`${full}.scrollHeight > 160`), "and scrolls inside");
  const empty = await evaluate<number>(`${grow}.getBoundingClientRect().height`);
  await evaluate(`(() => { ${grow}.scrollIntoView({ block: 'center', behavior: 'instant' }); ${grow}.focus(); })()`);
  for (const line of ["写第一行", "\n第二行", "\n第三行"]) await command("Input.insertText", { text: line }, sessionId);
  assert.ok(await evaluate<number>(`${grow}.getBoundingClientRect().height`) > empty, "the empty specimen grows as it is written in");
  const evidence = reviewEvidenceUrl("field-fit/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("board.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
});
