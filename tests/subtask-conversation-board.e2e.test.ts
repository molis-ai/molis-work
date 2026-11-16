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
      assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
      assert.equal(await evaluate(`document.querySelectorAll('${ROOT} [data-subtask-action="stop"]').length`), 4, "running, waiting for answer, approval, and read-failed keep Stop");
      if (shots) {
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(join(shots, `catalog-${lang}-${theme}-${width}.png`), Buffer.from(shot.data, "base64"));
      }
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
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
  assert.ok(await evaluate(`${first}.querySelector('[data-subtask-thread]').scrollHeight > 3000`));
  await evaluate(`${first}.querySelector('[data-subtask-thread]').scrollTop = 200`);
  await b.click('[data-subtask-demo="read-error"]');
  assert.equal(await evaluate(`${first}.querySelector('[data-subtask-messages]').children.length`), 83);
  await b.click(`${ROOT} [data-subtask-retry]`);
  await waitFor(`!${first}.querySelector('[data-subtask-feedback]').textContent`);
  assert.equal(await evaluate(`${first}.querySelector('[data-subtask-messages]').children.length`), 83, "rereading retains already read history");
  assert.equal(await evaluate(`${first}.querySelector('[data-subtask-thread]').scrollTop`), 200);
  // The page's language switch keeps the document. Later actions must read its new language, not startup templates.
  await b.click('[data-board-lang="zh"]');
  await waitFor("document.documentElement.dataset.uiLanguageTag === 'zh'");
  await b.click('[data-board-lang="en"]');
  await waitFor("document.documentElement.dataset.uiLanguageTag === 'en'");
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
});
