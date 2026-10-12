import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";

/** These checks cover only the W0 portions mapped in context-program §16.2, not full product acceptance.
 * Run only in the coordinator's browser/build slot; the server bundles the preview client at startup. */
async function openSlice(t: TestContext) {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required for the W0 interactive slice"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "molis-context-w0-"));
  let browser: ChromeHarness | undefined;
  const server = spawn(process.execPath, ["--import", "tsx", "scripts/preview-contextual-interaction.mts", "--judge", "rules", "--home", directory, "--port", "0"], {
    cwd: process.cwd(), env: { ...process.env, MOLIS_WORK_HOME: directory }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    await browser?.close();
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>(resolve => { const timer = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 3000); server.once("exit", () => { clearTimeout(timer); resolve(); }); });
    }
    await rm(directory, { recursive: true, force: true });
  });
  let output = "";
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`W0 server did not start: ${output}`)), 30_000);
    server.stdout.on("data", chunk => {
      output += String(chunk); const found = /http:\/\/127\.0\.0\.1:\d+/u.exec(output);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    });
    server.stderr.on("data", chunk => { output += String(chunk); });
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`W0 server exited ${code}: ${output}`)); });
  });
  browser = await ChromeHarness.start(directory, { executable: chrome, commandTimeoutMs: 10_000 });
  const page = await browser.page();
  await page.command("Page.enable"); await page.command("Runtime.enable");
  return { page, origin };
}
async function selectText(page: ChromePage, collapse = false) {
  await page.evaluate(`(() => {
    const editor = document.querySelector('[data-w0-editor] .ProseMirror'); editor.focus();
    const paragraph = [...editor.querySelectorAll('p')].find(node => node.textContent.includes('背景：'));
    paragraph.scrollIntoView({block:'center'});
    const text = paragraph.firstChild, range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, ${collapse ? "0" : "Math.min(text.length, 45)"});
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  })()`);
  await page.wait(collapse ? "!document.querySelector('[data-w0-clear-landing]').hidden" : "!document.querySelector('[data-w0-toolbar]').hidden");
}
async function capture(page: ChromePage, name: string) {
  const output = join(process.cwd(), ".impeccable/qa/review/context-w0");
  await mkdir(output, { recursive: true }); await page.screenshot(join(output, `${name}.png`));
}

for (const width of [1440, 1024, 390]) {
  test(`W0-01 W0-02 W0-03 W0-04; partial AC-P02/03/04 T01/06 AC-S05/06 Q02/04/08: W0 ${width}px`, { timeout: 120_000 }, async t => {
    const fixture = await openSlice(t); if (!fixture) return;
    const { page, origin } = fixture;
    await page.viewport(width, 950, width === 390);
    await page.command("Page.navigate", { url: origin });
    await page.wait("document.querySelector('[data-w0-editor] .ProseMirror') && document.querySelectorAll('[data-w0-material]').length === 3");
    const readDoc = async () => (await fetch(`${origin}/api/docs/doc-q4-plan`)).json();
    await selectText(page);
    assert.equal(await page.evaluate("getSelection().toString().length > 0"), true);
    assert.equal(await page.evaluate("document.querySelectorAll('[data-w0-toolbar]:not([hidden])').length"), 1);
    assert.ok(await page.evaluate<number>("document.querySelectorAll('[data-w0-toolbar] [data-w0-choice]').length") <= (width === 390 ? 2 : 3));
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: ".", code: "Period", modifiers: process.platform === "darwin" ? 4 : 2 });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: ".", code: "Period", modifiers: 0 });
    assert.equal(await page.evaluate("document.querySelector('[data-w0-toolbar]').contains(document.activeElement)"), true);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
    await capture(page, `selection-${width}-light`);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await selectText(page, true);
    if (width === 390) await page.click('[data-w0-show="shelf"]');
    await page.click('[data-w0-material="interview"]');
    await page.wait("document.querySelector('[data-w0-choice=\"sample:place\"]')");
    const before = await readDoc();
    await page.click('[data-w0-choice="sample:place"]');
    await page.wait("document.querySelector('[data-w0-placement]')");
    assert.deepEqual(await readDoc(), before, "preview alone must not change bytes or version");
    await capture(page, `landing-${width}-light`);
    await page.click("[data-w0-place-confirm]");
    await page.wait("!document.querySelector('[data-w0-placement]')");
    const inserted = await readDoc(); assert.equal(inserted.version, before.version + 1);
    assert.match(JSON.stringify(inserted.body), /8 位受访者停在了导入数据这一步/u);

    // A second page's edit makes a prepared placement stale at the actual server boundary.
    await selectText(page, true);
    if (width === 390) await page.click('[data-w0-show="shelf"]');
    await page.click('[data-w0-material="next-week"]'); await page.click('[data-w0-choice="sample:place"]');
    await page.wait("document.querySelector('[data-w0-placement]')");
    const changed = await readDoc();
    const update = await fetch(`${origin}/api/docs/doc-q4-plan`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_version: changed.version, body: changed.body }) });
    assert.equal(update.status, 200); const external = await readDoc();
    await page.click("[data-w0-place-confirm]");
    await page.wait("document.querySelector('[data-w0-panel-error]')?.textContent.includes('文档已经改变')");
    assert.deepEqual(await readDoc(), external);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });

    await page.click("[data-w0-clear-landing]");
    if (width === 390) await page.click('[data-w0-show="shelf"]');
    await page.click('[data-w0-material="observation"]');
    assert.equal(await page.evaluate("document.querySelector('[data-w0-choice=\"sample:place\"]') === null"), true);
    await page.click('[data-w0-choice="sample:create:todo"]');
    await page.wait("document.querySelectorAll('[data-w0-created-id]').length === 1");
    await page.click("[data-w0-created-id] button"); await page.wait("document.querySelectorAll('[data-w0-created-id]').length === 0");

    await page.click('[data-w0-new="shelf"]');
    await page.fill("[data-w0-create-instruction]", "明天整理这份访谈证据");
    await page.click("[data-w0-panel] form button[type=submit]");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-w0-material]').length"), 3);
    await page.click("[data-w0-create-confirm]"); await page.wait("document.querySelectorAll('[data-w0-material]').length === 4");
    await page.evaluate("document.documentElement.dataset.theme = 'dark'");
    await capture(page, `created-${width}-dark`);
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    const state = await (await fetch(`${origin}/api/w0/state`)).json(); assert.equal(state.mode, "rules");
  });
}

test("W0-02; partial AC-P01 AC-S07: browser drop uses the click list and leaves the document untouched", { timeout: 90_000 }, async t => {
  const fixture = await openSlice(t); if (!fixture) return;
  const { page, origin } = fixture; await page.viewport(1440, 950);
  await page.command("Page.navigate", { url: origin });
  await page.wait("document.querySelector('[data-w0-editor] .ProseMirror') && document.querySelector('[data-w0-material]')");
  await selectText(page, true); await page.click('[data-w0-material="interview"]');
  const clicked = await page.evaluate<string[]>("[...document.querySelectorAll('[data-w0-toolbar] [data-w0-choice]')].map(node => node.dataset.w0Choice)");
  const before = await (await fetch(`${origin}/api/docs/doc-q4-plan`)).json();
  // The DataTransfer exercises the real DOM drop handler. OS/AppKit drag-out remains a separate unverified path.
  await page.evaluate(`(() => { const target = document.querySelector('[data-w0-editor] .ProseMirror p'); const rect = target.getBoundingClientRect();
    const data = new DataTransfer(); data.setData('application/x-molis-hand+json', JSON.stringify({materialId:'interview'}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:rect.left+30,clientY:rect.top+10})); })()`);
  await page.wait("!document.querySelector('[data-w0-toolbar]').hidden");
  const dropped = await page.evaluate<string[]>("[...document.querySelectorAll('[data-w0-toolbar] [data-w0-choice]')].map(node => node.dataset.w0Choice)");
  assert.deepEqual(dropped, clicked); assert.deepEqual(await (await fetch(`${origin}/api/docs/doc-q4-plan`)).json(), before);
  await capture(page, "drop-1440-light");
});
