import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

const ROOT = "#subtask-conversation .mw-subtask";
const first = `document.querySelector(${JSON.stringify(ROOT)})`;

// B58-06: the actual component-board route, not the standalone export. The demo does not start an agent.
test("B58-06: subtask board states, local input, recovery, IME and touch targets", { timeout: 240_000 }, async t => {
  const b = await openBoardBrowser(t, "empty"); if (!b) return;
  const exceptions: unknown[] = [];
  const releaseErrors = b.on("Runtime.exceptionThrown", event => exceptions.push(event));
  t.after(() => { releaseErrors(); if (exceptions.length) t.diagnostic(JSON.stringify(exceptions)); });
  const { evaluate, waitFor, command, sessionId } = b;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "batch-58") : "";
  if (shots) await mkdir(shots, { recursive: true });
  for (const lang of ["zh", "en"]) for (const width of [1440, 1024, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await b.navigate(() => command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=${lang}&width=${width}#subtask-conversation` }, sessionId));
    await waitFor(`document.querySelectorAll('${ROOT}').length === 9 && globalThis.molisComposerProgram`, 20_000);
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.resolvedTheme = '${theme}'; ${first}.scrollIntoView({block:'center'})`);
      const measured = await evaluate<Array<{ width: number; scroll: number; composer: number; input: number; bottom: number; touch: number[][] }>>(`
        [...document.querySelectorAll('${ROOT}')].map(root => { const box = root.getBoundingClientRect(); return {
          width: box.width, scroll: root.scrollWidth, bottom: box.bottom,
          composer: root.querySelector('[data-subtask-composer]').getBoundingClientRect().bottom,
          input: root.querySelector('textarea').getBoundingClientRect().bottom,
          touch: [...root.querySelectorAll('[data-subtask-head] button')].map(button => { const r = button.getBoundingClientRect(); return [r.width, r.height]; })
        }; })`);
      for (const item of measured) {
        assert.ok(item.width > 0 && item.scroll <= item.width + 1, JSON.stringify(item));
        assert.ok(item.composer <= item.bottom + 1 && item.input <= item.bottom + 1, JSON.stringify(item));
        if (width === 390) assert.ok(item.touch.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(item.touch));
      }
      if (width === 390) {
        const small = await evaluate<Array<[string, number, number]>>(`
          [...document.querySelectorAll('${ROOT} .mw-btn')].flatMap(button => {
            const box = button.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.height < 44
              ? [[button.textContent.trim(), Math.round(box.width), Math.round(box.height)]]
              : [];
          })`);
        assert.deepEqual(small, [], "every visible subtask control keeps the 44px touch height");
      }
      assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
      assert.equal(await evaluate(`document.querySelectorAll('${ROOT} [data-subtask-action="stop"]').length`), 4, "running, waiting for answer, approval, and read-failed keep Stop");
      if (shots) {
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(join(shots, `catalog-${lang}-${theme}-${width}.png`), Buffer.from(shot.data, "base64"));
      }
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), true, "the reduced-motion preference is the one being exercised");
  await evaluate(`${first}.scrollIntoView({block:'center'}); ${first}.querySelector('textarea').focus()`);
  await command("Input.imeSetComposition", { text: "输入法候选", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  assert.equal(await evaluate(`${first}.querySelectorAll('[data-subtask-messages] article').length`), 2, "IME confirmation cannot submit a message");
  await command("Input.insertText", { text: "补充已确认" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  await waitFor(`${first}.querySelectorAll('[data-subtask-messages] article').length === 3`);
  assert.equal(await evaluate(`${first}.querySelector('textarea').value`), "");
  await evaluate(`${first}.querySelector('[data-subtask-action="stop"]').focus()`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor(`${first}.querySelector('textarea').disabled && ${first}.querySelector('[data-subtask-action="continue"]')`);
  await b.click(`${ROOT} [data-subtask-action="continue"]`);
  await waitFor(`!${first}.querySelector('textarea').disabled`);
  await b.click('[data-subtask-demo="history"]');
  const readingThread = `${first}.querySelector('[data-subtask-thread]')`;
  assert.ok(await evaluate(`${readingThread}.scrollHeight > 3000`));
  await evaluate(`${first}.scrollIntoView({block:"center"})`);
  await waitFor(`${readingThread}.scrollTop > 0 && ${readingThread}.scrollHeight - ${readingThread}.clientHeight - ${readingThread}.scrollTop <= 1`);
  const scrollAt = await evaluate<{ x: number; y: number; top: number }>(`(() => { const thread = ${readingThread}, box = thread.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: thread.scrollTop }; })()`);
  // Detachment precedes the browser's scroll. Let the wheel land before writing the test's anchor.
  await evaluate(`void (window.boardWheelSettled = new Promise(resolve => {
    const thread = ${readingThread};
    const landed = () => {
      if (thread.scrollTop >= ${scrollAt.top}) return;
      thread.removeEventListener('scrollend', landed);
      resolve(true);
    };
    thread.addEventListener('wheel', () => thread.addEventListener('scrollend', landed), {once:true});
  }))`);
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: scrollAt.x, y: scrollAt.y, deltaX: 0, deltaY: -8000 }, sessionId);
  await evaluate("window.boardWheelSettled");
  await waitFor(`${readingThread}.dataset.follow === 'detached'`);
  await evaluate(`${readingThread}.scrollTop = 200`);
  await b.click('[data-subtask-demo="read-error"]');
  assert.equal(await evaluate(`${first}.querySelector('[data-subtask-messages]').children.length`), 83);
  await b.click(`${ROOT} [data-subtask-retry]`);
  await waitFor(`!${first}.querySelector('[data-subtask-feedback]').textContent`);
  assert.equal(await evaluate(`${first}.querySelector('[data-subtask-messages]').children.length`), 83, "rereading retains already read history");
  assert.equal(await evaluate(`${readingThread}.scrollTop`), 200);
  // Start in Chinese, copy a translated specimen verbatim, then switch once. A text-equality translator must not rewrite the user's send.
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=zh&scenario=translation#subtask-conversation` }, sessionId));
  await waitFor(`globalThis.molisComposerProgram && ${first}.querySelector('textarea')`);
  const copied = await evaluate<string>(`${first}.querySelector('[data-role="assistant"] .mw-subtask__words').textContent`);
  await evaluate(`${first}.querySelector('textarea').focus()`);
  await command("Input.insertText", { text: copied }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  await waitFor(`${first}.querySelectorAll('[data-subtask-messages] article').length === 3`);
  await b.click('[data-board-lang="en"]');
  await waitFor("document.documentElement.dataset.uiLanguageTag === 'en'");
  assert.equal(await evaluate<string>(`${first}.querySelector('[data-subtask-messages] article:last-child').textContent`), copied);
  await b.click(`${ROOT} [data-subtask-action="stop"]`);
  await waitFor(`${first}.querySelector('[data-subtask-action="continue"]')`);
  assert.doesNotMatch(await evaluate<string>(`[...${first}.querySelectorAll("[data-subtask-head], [data-subtask-context], [data-subtask-intro], [data-subtask-composer]")].map(el => el.textContent).join(" ")`), /[㐀-鿿]/u, "actions after a live language switch stay in that language");
  await b.click('[data-subtask-demo="read-error"]');
  assert.doesNotMatch(await evaluate<string>(`${first}.querySelector('[data-subtask-feedback]').textContent`), /[㐀-鿿]/u);
  const approval = '#subtask-conversation [data-subtask-demo-state="approval"]';
  await b.click(`${approval} [data-subtask-action="deny"]`);
  await waitFor(`document.querySelector('${approval} [data-subtask-action="continue"]')`);
  assert.equal(await evaluate(`document.querySelector('${approval} textarea').disabled`), true, "denial stops the specimen; it never resumes work");
  const unavailable = '#subtask-conversation [data-subtask-demo-state="unavailable"]';
  assert.equal(await evaluate(`document.querySelector('${unavailable} textarea').disabled`), true);
  assert.doesNotMatch(await evaluate<string>(`document.querySelector('${unavailable} [data-subtask-composer]').textContent`), /new attempt/i, "withdrawal retains its own reason rather than a continue hint");
  // B58-02/03: the board's real nested demo owns a separate receiver, draft, messages and controls.
  await b.click('[data-subtask-demo="reset"]');
  await waitFor(`${first}.querySelector('[data-subtask-action="stop"]')`);
  await evaluate(`const parentField=${first}.querySelector('textarea'); parentField.value='parent draft'; parentField.dispatchEvent(new Event('input',{bubbles:true})); ${first}.querySelector('[data-subtask-open="mobile"]').click()`);
  await waitFor(`${first}.querySelector('[data-subtask-head] strong').textContent.includes('narrow-screen')`);
  assert.equal(await evaluate(`${first}.querySelector('textarea').value`), "");
  assert.match(await evaluate<string>(`${first}.querySelector('.mw-composer__to').textContent`), /narrow-screen/i);
  await evaluate(`const nestedField=${first}.querySelector('textarea'); nestedField.value='nested only'; nestedField.dispatchEvent(new Event('input',{bubbles:true})); ${first}.querySelector('[data-composer-send]').click()`);
  await waitFor(`${first}.querySelector('[data-subtask-messages]').textContent.includes('nested only')`);
  await evaluate(`${first}.querySelector('[data-subtask-action="stop"]').click()`);
  await waitFor(`${first}.querySelector('[data-subtask-action="continue"]')`);
  await evaluate(`${first}.querySelector('[data-subtask-back]').click()`);
  await waitFor(`${first}.querySelector('textarea').value === 'parent draft'`);
  assert.ok(await evaluate(`${first}.querySelector('[data-subtask-action="stop"]') !== null`));
  assert.doesNotMatch(await evaluate<string>(`${first}.querySelector('[data-subtask-messages]').textContent`), /nested only/);
});
