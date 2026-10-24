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
/** Selects (or, collapsed, places the caret at the start of) the paragraph containing `marker`, as a person's drag would. */
async function selectText(page: ChromePage, collapse = false, marker = "背景：", landing = "") {
  await page.evaluate(`(() => {
    const editor = document.querySelector('[data-w0-editor] .ProseMirror'); editor.focus();
    const paragraph = [...editor.querySelectorAll('p')].find(node => node.textContent.includes(${JSON.stringify(marker)}));
    paragraph.scrollIntoView({block:'center'});
    const text = paragraph.firstChild, range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, ${collapse ? "0" : "Math.min(text.length, 45)"});
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  })()`);
  if (!collapse) await page.wait("!document.querySelector('[data-w0-toolbar]').hidden");
  else await page.wait(`(document.body.dataset.w0Landing ?? '').endsWith(${JSON.stringify(`${landing}光标处`)})`);
}
async function landingLabel(page: ChromePage) {
  return page.evaluate<string>("document.querySelector('[data-w0-toolbar] [data-w0-target]')?.title ?? ''");
}
async function capture(page: ChromePage, name: string) {
  const output = join(process.cwd(), ".impeccable/qa/review/context-w0");
  await mkdir(output, { recursive: true }); await page.screenshot(join(output, `${name}.png`));
}
/** On a phone the right panel is its own view, reached from the document's bar. */
async function showSide(page: ChromePage, phone: boolean) {
  if (phone && await page.evaluate("document.body.dataset.mobileView !== 'side'")) await page.click('[data-w0-show="side"]');
}
const dismissToast = (page: ChromePage) => page.evaluate("document.querySelector('[data-w0-toast]').hidden = true");
async function pick(page: ChromePage, id: string, phone: boolean) {
  await showSide(page, phone);
  await page.click(`[data-w0-hand="${id}"]`);
  await page.wait("!document.querySelector('[data-w0-toolbar]').hidden && document.querySelector('[data-w0-toolbar]').dataset.place === 'side'");
}
const choices = (page: ChromePage) => page.evaluate<string[]>("[...document.querySelectorAll('[data-w0-toolbar] [data-w0-choice]')].map(node => node.dataset.w0Choice)");
const noScroll = (page: ChromePage) => page.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth");

for (const width of [1440, 1024, 390]) {
  test(`W0-01 W0-02 W0-03 W0-04; partial AC-P02/03/04 T01/05/06 AC-S05/06 Q02/04/08: W0 ${width}px`, { timeout: 150_000 }, async t => {
    const fixture = await openSlice(t); if (!fixture) return;
    const { page, origin } = fixture, phone = width === 390;
    await page.viewport(width, 950, phone);
    await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await page.command("Page.navigate", { url: origin });
    await page.wait("document.querySelector('[data-w0-editor] .ProseMirror') && document.querySelectorAll('[data-w0-material]').length === 3");
    assert.equal(await page.evaluate("document.documentElement.dataset.resolvedTheme"), "light");
    const readDoc = async () => (await fetch(`${origin}/api/docs/doc-q4-plan`)).json();

    // T01 / T06: a left selection gets one bar beside it, keyboard in with ⌘., out with Esc.
    await selectText(page);
    assert.equal(await page.evaluate("getSelection().toString().length > 0"), true);
    assert.equal(await page.evaluate("document.querySelectorAll('[data-w0-toolbar]:not([hidden])').length"), 1);
    assert.ok((await choices(page)).length <= (phone ? 2 : 3));
    assert.equal(await noScroll(page), true);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: ".", code: "Period", modifiers: process.platform === "darwin" ? 4 : 2 });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: ".", code: "Period", modifiers: 0 });
    assert.equal(await page.evaluate("document.querySelector('[data-w0-toolbar]').contains(document.activeElement)"), true);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
    assert.notEqual(await page.evaluate("getComputedStyle(document.activeElement).outlineStyle"), "none", "keyboard focus on the bar is visible");
    await capture(page, `selection-${width}-light`);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    assert.equal(await page.evaluate("document.querySelector('[data-w0-toolbar]').hidden"), true);

    // AC-S04 / AC-S05: a caret on the left is the landing of what is picked on the right; the label names it in the reader's terms.
    await selectText(page, true, "背景：", "Q4 增长计划 · 第 1 段");
    await pick(page, "shelf:interview", phone);
    assert.match(await landingLabel(page), /Q4 增长计划 · 第 1 段光标处/u);
    assert.equal((await choices(page))[0], "sample:place:quote", "someone else's words lead with a quote");
    const before = await readDoc();
    await page.click('[data-w0-choice="sample:place:quote"]');
    await page.wait("document.querySelector('[data-w0-placement]')");
    assert.deepEqual(await readDoc(), before, "preview alone must not change bytes or version");
    assert.match(await page.evaluate<string>("document.querySelector('[data-w0-placement]').innerText"), /之后/u);
    await capture(page, `landing-${width}-light`);
    await page.click("[data-w0-place-confirm]");
    await page.wait("!document.querySelector('[data-w0-placement]') && document.querySelector('[data-w0-unplace]')");
    const inserted = await readDoc(); assert.equal(inserted.version, before.version + 1);
    assert.match(JSON.stringify(inserted.body), /"blockquote".*8 位受访者停在了导入数据这一步.*—— Shelf · 用户访谈/u);
    await page.click("[data-w0-unplace]");
    await page.wait("document.querySelector('[data-w0-toast]').innerText.includes('已撤销这次放入')");
    const undone = await readDoc(); assert.equal(undone.version, before.version + 2); assert.deepEqual(undone.body, before.body);
    await dismissToast(page);

    // AC-S05: another page's edit makes a prepared placement stale at the actual server boundary; nothing is written.
    await selectText(page, true, "我们认为", "核心判断 · 第 1 段");
    await pick(page, "shelf:next-week", phone);
    assert.match(await landingLabel(page), /核心判断 · 第 1 段光标处/u);
    await page.click('[data-w0-choice="sample:place:insert"]');
    await page.wait("document.querySelector('[data-w0-placement]')");
    const changed = await readDoc();
    const update = await fetch(`${origin}/api/docs/doc-q4-plan`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_version: changed.version, body: changed.body }) });
    assert.equal(update.status, 200); const external = await readDoc();
    await page.click("[data-w0-place-confirm]");
    await page.wait("document.querySelector('[data-w0-panel-error]')?.textContent.includes('文档已经改变')");
    assert.deepEqual(await readDoc(), external);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });

    // AC-S06: with no landing, no 放进 action appears; Q08: a proposal opens a prefilled card, a direct creation offers 撤销.
    await page.click("[data-w0-about]"); await page.click("[data-w0-no-landing]"); await page.click("[data-w0-about]");
    await pick(page, "shelf:observation", phone);
    assert.equal((await choices(page)).some(key => key.startsWith("sample:place")), false);
    await page.click('[data-w0-choice="sample:create:goal"]');
    await page.wait("document.querySelector('[data-w0-create-confirm]')");
    assert.equal(await page.evaluate("document.querySelector('[data-w0-records]').hidden"), true, "a card creates nothing before 确认");
    await page.click("[data-w0-create-confirm]");
    await page.wait("document.querySelector('[data-w0-records-count]').textContent === '1'");
    await dismissToast(page);
    await pick(page, "shelf:observation", phone);
    await page.click('[data-w0-choice="sample:create:pages"]');
    await page.wait("document.querySelector('[data-w0-undo]') && document.querySelector('[data-w0-records-count]').textContent === '2'");
    await page.click("[data-w0-undo]");
    await page.wait("document.querySelector('[data-w0-records-count]').textContent === '1'");
    await dismissToast(page);

    // Q01: Shelf's ✦ drafts under one line, creates on one confirmation, and the new row arrives in Shelf.
    await showSide(page, phone);
    await page.click('[data-w0-new="shelf"]');
    await page.fill("[data-w0-create-instruction]", "明天整理这份访谈证据");
    assert.equal(await page.evaluate("document.querySelector('[data-w0-create-confirm]').disabled"), true, "nothing to confirm before a draft");
    await page.evaluate("document.querySelector('.w0-oneline').requestSubmit()");
    await page.wait("document.querySelector('[data-w0-draft-title]')?.value === '明天整理这份访谈证据'");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-w0-material]').length"), 3);
    await page.click("[data-w0-create-confirm]"); await page.wait("document.querySelectorAll('[data-w0-material]').length === 4");
    await page.click("[data-w0-theme]");
    assert.equal(await page.evaluate("document.documentElement.dataset.resolvedTheme"), "dark");
    await capture(page, `created-${width}-dark`);
    assert.equal(await noScroll(page), true);
    const state = await (await fetch(`${origin}/api/w0/state`)).json(); assert.equal(state.mode, "rules");
  });
}

test("W0-02; partial AC-P01 AC-S07: browser drop uses the click list and leaves the document untouched", { timeout: 90_000 }, async t => {
  const fixture = await openSlice(t); if (!fixture) return;
  const { page, origin } = fixture; await page.viewport(1440, 950);
  await page.command("Page.navigate", { url: origin });
  await page.wait("document.querySelector('[data-w0-editor] .ProseMirror') && document.querySelector('[data-w0-material]')");
  await selectText(page, true, "背景：", "Q4 增长计划 · 第 1 段"); await page.click('[data-w0-hand="shelf:interview"]');
  await page.wait("!document.querySelector('[data-w0-toolbar]').hidden");
  const clicked = await choices(page);
  const before = await (await fetch(`${origin}/api/docs/doc-q4-plan`)).json();
  // The DataTransfer exercises the real DOM drop handler. OS/AppKit drag-out remains a separate unverified path.
  await page.evaluate(`(() => { const target = [...document.querySelectorAll('[data-w0-editor] .ProseMirror p')].find(node => node.textContent.includes('我们认为')); const rect = target.getBoundingClientRect();
    const data = new DataTransfer(); data.setData('application/x-molis-hand+json', JSON.stringify({hand:'shelf:interview'}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:rect.left+30,clientY:rect.top+10})); })()`);
  await page.wait("!document.querySelector('[data-w0-toolbar]').hidden && document.querySelector('[data-w0-toolbar]').dataset.place === 'side' && document.querySelector('[data-w0-target]')?.title.includes('核心判断')");
  const dropped = await choices(page);
  assert.deepEqual(dropped.slice(0, clicked.length), clicked, "the drop shows the same list, one more where there is room");
  assert.deepEqual(await (await fetch(`${origin}/api/docs/doc-q4-plan`)).json(), before);
  await capture(page, "drop-1440-light");
});

test("AC-S01 AC-S04 (partial): six places in order; a web excerpt and a message are in hand with their own kinds", { timeout: 90_000 }, async t => {
  const fixture = await openSlice(t); if (!fixture) return;
  const { page, origin } = fixture; await page.viewport(1440, 950);
  await page.command("Page.navigate", { url: origin });
  await page.wait("document.querySelector('[data-w0-editor] .ProseMirror') && document.querySelector('[data-w0-material]')");
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-w0-tab]')].map(node => node.textContent)"), ["Shelf", "灵光", "文件", "浏览器", "电脑", "讨论"]);
  // T03 (partial): a tool edits the selection in place and the bar stays with it.
  await selectText(page);
  await page.click('[data-w0-tool="strong"]');
  await page.wait("document.querySelector('[data-w0-editor] .ProseMirror strong') && !document.querySelector('[data-w0-toolbar]').hidden && document.querySelector('[data-w0-tool=\"strong\"]')?.getAttribute('aria-pressed') === 'true'");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await page.click('[data-w0-tab="browser"]');
  await page.evaluate(`(() => { const paragraph = document.querySelector('[data-w0-web] p'), range = document.createRange();
    range.setStart(paragraph.firstChild, 0); range.setEnd(paragraph.firstChild, 24);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`);
  await page.wait("!document.querySelector('[data-w0-toolbar]').hidden && document.querySelector('[data-w0-context]').innerText.includes('网页')");
  assert.equal((await choices(page))[0], "sample:place:quote");
  await capture(page, "web-1440-light");
  await page.click('[data-w0-tab="discussion"]');
  await page.click('[data-w0-hand="message:2"]');
  await page.wait("document.querySelector('[data-w0-context]').innerText.includes('讨论 · Lee')");
  assert.equal(await page.evaluate("document.querySelector('[data-w0-hand=\"message:2\"]').title"), "对象种类：discussion_message");
  await capture(page, "message-1440-light");
  await page.click('[data-w0-tab="computer"]');
  assert.match(await page.evaluate<string>("document.querySelector('[data-w0-side-content]').innerText"), /Computer Use/u);
});
