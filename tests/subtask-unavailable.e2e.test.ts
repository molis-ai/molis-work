import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { pageTextScript } from "./fixtures/page-text.js";

// SAI-03/10: Node owner regression proves provenance; this browser test covers the resulting public response's display.
test("old subtask descriptions use localized placeholders while replies and personal input remain readable", { timeout: 90_000 }, async t => {
  const bundled = await build({ entryPoints: ["tests/fixtures/subtask-unavailable.ts"], bundle: true, write: false, format: "iife", globalName: "UnavailableSubtask", platform: "browser" });
  const b = await openBoardBrowser(t, "empty"); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=en` }, b.sessionId));
  await b.waitFor("globalThis.molisComposerProgram && window.molisFollow");
  await b.evaluate(bundled.outputFiles[0]!.text);
  for (const [locale, words] of [["en", "Original task description unavailable"], ["zh", "原任务说明不可用"]] as const) {
    await b.evaluate(`(()=>{${pageTextScript(locale, "coding")}})()`);
    await b.evaluate("window.unavailableProbe = UnavailableSubtask.mountUnavailable()");
    await b.waitFor("document.querySelector('#unavailable-subtask [data-subtask-messages]')?.textContent.includes('Retained personal input')");
    const shown = await b.evaluate<{ summary: string; messages: string }>("({summary:document.querySelector('#unavailable-subtask [data-subtask-context]').textContent,messages:document.querySelector('#unavailable-subtask [data-subtask-messages]').textContent})");
    assert.ok(shown.summary.includes(words)); assert.ok(shown.messages.includes(words));
    assert.match(shown.messages, /Retained child result/); assert.match(shown.messages, /Retained personal input/);
    await mkdir(".impeccable/qa/review/b59-unavailable", { recursive: true });
    const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
    await writeFile(`.impeccable/qa/review/b59-unavailable/${locale}.png`, Buffer.from(shot.data, "base64"));
    await b.evaluate("unavailableProbe.destroy()");
  }
});
