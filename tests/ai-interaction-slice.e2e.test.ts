import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, ChromePage, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { createPreviewServer } from "../scripts/ai-interaction-slice/server.ts";

// Prepared for the coordinator's exclusive browser slot. This test never starts a Home/model.
const assistant = '[data-scene="assistant"]';
const coding = '[data-scene="coding"]';
const action = (name: string, scope = assistant) => `${scope} [data-action="${name}"]`;
const field = (name: string, scope = assistant) => `${scope} [data-value="${name}"]`;
async function selected(page: ChromePage, selector: string): Promise<string | null> {
  return page.evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`);
}
async function waitState(page: ChromePage, question: string, execution?: string): Promise<void> {
  await page.wait(`document.querySelector('${assistant}').dataset.questionState === ${JSON.stringify(question)}${execution ? ` && document.querySelector('${assistant}').dataset.executionState === ${JSON.stringify(execution)}` : ""}`);
}
async function fillValid(page: ChromePage): Promise<void> {
  await page.fill(field("notes"), "只讨论首次使用，给失败恢复留出时间。");
  await page.click(`${assistant} [data-reference="0"]`);
}
async function controls(page: ChromePage): Promise<void> {
  if (!(await page.evaluate<boolean>("document.querySelector('.demo-controls').open"))) await page.click(".demo-controls summary");
}
async function demo(page: ChromePage, name: string): Promise<void> {
  await controls(page);
  await page.click(`.demo-controls [data-action="${name}"]`);
}
async function submit(page: ChromePage): Promise<void> {
  await page.click(`${assistant} [data-submit]`);
  await waitState(page, "received");
}
async function questionnairePath(page: ChromePage): Promise<void> {
  await page.click(`${assistant} [data-submit]`);
  assert.equal(await page.evaluate("document.activeElement?.id"), "assistant-notes");
  await page.fill(field("notes"), "时长改为 45 分钟，先看失败恢复");
  assert.equal(await page.evaluate(`document.querySelector('${field("minutes")}').value`), "30");
  await page.click(action("adopt"));
  assert.equal(await page.evaluate(`document.querySelector('${field("minutes")}').value`), "45");
  await page.fill(field("minutes"), "two");
  await page.fill(field("date"), "2026-02-30");
  await page.click(`${assistant} [data-reference="0"]`);
  await page.click(`${assistant} [data-submit]`);
  assert.equal(await page.evaluate("document.activeElement?.id"), "assistant-minutes");
  assert.match(await page.evaluate<string>(`document.querySelector('${assistant} [data-field="date"] .field-error').textContent`), /真实日期/);
  assert.equal(await page.evaluate(`document.querySelector('${field("minutes")}').value`), "two");
  await page.fill(field("minutes"), "45"); await page.fill(field("date"), "2026-10-15");
  await submit(page);
  assert.match(await page.evaluate<string>("document.querySelector('[data-counts]').textContent"), /演示回答 1 次 · 演示执行 0 次/);
  await page.click(action("preview"));
  assert.match(await page.evaluate<string>(`document.querySelector('${assistant} [data-summary]').textContent`), /45 分钟/);
  await page.click(action("execute"));
  await page.evaluate(`document.querySelector('${action("execute")}').click()`);
  await waitState(page, "received", "done");
  assert.match(await page.evaluate<string>("document.querySelector('[data-counts]').textContent"), /演示执行 1 次/);
  await page.click(action("result"));
  assert.match(await page.evaluate<string>(`document.querySelector('${assistant} [data-result-summary]').textContent`), /时长改为 45 分钟/);
}
async function preservationPath(page: ChromePage): Promise<void> {
  await page.fill(field("notes"), "保留这段，别替我重新填写。");
  await page.fill(field("minutes"), "37");
  await page.click(action("close"));
  await page.click('[data-layout="coding"]');
  await page.fill(field("notes", coding), "只核对，不要修改代码。");
  await page.click('[data-layout="assistant"]');
  await page.click(action("open"));
  assert.equal(await page.evaluate(`document.querySelector('${field("notes")}').value`), "保留这段，别替我重新填写。");
  await page.evaluate(`document.querySelector('${field("notes")}').focus(); window.scrollTo(0, 400);`);
  const before = await page.evaluate("({focus:document.activeElement.id, scroll:scrollY})");
  await page.evaluate("document.querySelector('.demo-controls [data-action=background]').click()");
  assert.deepEqual(await page.evaluate("({focus:document.activeElement.id, scroll:scrollY})"), before);
  assert.equal(await page.evaluate(`document.querySelector('${field("minutes")}').value`), "37");
  await demo(page, "expire");
  assert.equal(await page.evaluate(`document.querySelector('${assistant} [data-submit]').disabled`), true);
  await page.click(action("reopen"));
  assert.equal(await page.evaluate(`document.querySelector('${field("notes")}').value`), "保留这段，别替我重新填写。");
}
async function recommendationPath(page: ChromePage): Promise<void> {
  await page.fill(`${assistant} [data-composer]`, "正在补充");
  const next = `${assistant} [data-next]`;
  const position = await page.evaluate(`(()=>{const r=document.querySelector('${next}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})()`);
  // Synthetic composition verifies event handling only, not a real OS input method.
  await page.evaluate(`document.querySelector('${assistant} [data-composer]').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'正'})); document.querySelector('.demo-controls [data-action=expire]').click();`);
  assert.equal(await page.evaluate(`document.querySelector('${next}').hidden`), false);
  assert.equal(await page.evaluate(`document.querySelector('${next}').disabled`), true);
  assert.deepEqual(await page.evaluate(`(()=>{const r=document.querySelector('${next}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})()`), position);
  await page.evaluate(`document.querySelector('${assistant} [data-composer]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'正在'})); document.querySelector('[data-theme-toggle]').focus();`);
  await page.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await page.wait(`document.querySelector('${next}').hidden`);
}
async function failurePath(page: ChromePage): Promise<void> {
  await fillValid(page); await demo(page, "answer-failure");
  await page.click(`${assistant} [data-submit]`); await waitState(page, "failed");
  assert.equal(await page.evaluate(`document.querySelector('${field("notes")}').value`), "只讨论首次使用，给失败恢复留出时间。");
  await demo(page, "outcome-unknown"); await submit(page); await page.click(action("preview"));
  await page.click(action("execute")); await waitState(page, "received", "unknown");
  assert.equal(await page.evaluate(`document.querySelector('${action("execute")}').disabled`), true);
  await page.click(action("reconcile")); await waitState(page, "received", "done");
  assert.match(await page.evaluate<string>("document.querySelector('[data-counts]').textContent"), /演示执行 1 次/);
  await page.click(action("continue")); await submit(page); await demo(page, "outcome-failed");
  await page.click(action("preview")); await page.click(action("execute")); await waitState(page, "received", "failed");
  await demo(page, "outcome-done"); await page.click(action("retry")); await page.click(action("execute"));
  await waitState(page, "received", "done");
}
async function visualMatrix(page: ChromePage, evidence: string): Promise<void> {
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) for (const layout of ["assistant", "coding"]) {
    await page.viewport(width, 1000, width === 390);
    await page.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await page.click(`[data-layout="${layout}"]`);
    await page.evaluate("window.scrollTo(0,0)");
    const metrics = await page.evaluate<{ overflow: number; minTarget: number; transition: string }>(`(()=>{
      const buttons=[...document.querySelectorAll('[data-scene="${layout}"] button')].filter(b=>b.checkVisibility());
      return {overflow:document.documentElement.scrollWidth-innerWidth,minTarget:Math.min(...buttons.map(b=>b.getBoundingClientRect().height)),transition:getComputedStyle(buttons[0]).transitionDuration};
    })()`);
    assert.ok(metrics.overflow <= 1, `${layout} ${width} must not scroll horizontally`);
    if (width === 390) assert.ok(metrics.minTarget >= 44, `${layout}: touch targets >= 44px`);
    assert.equal(metrics.transition, "0s");
    await page.screenshot(join(evidence, `${layout}-${theme}-${width}.png`));
  }
}
test("AC-13 AC-14 AC-15 AC-16 / I0 actual preview interaction paths (simulated operations)", { timeout: 150_000 }, async t => {
  const chrome = locateTestChrome();
  if (!chrome) return t.skip("Chrome is required; visual and interaction verification remains unverified");
  const directory = await mkdtemp(join(tmpdir(), "molis-interaction-i0-"));
  const evidence = join(process.cwd(), ".impeccable/qa/review/ai-interaction-i0");
  let browser: ChromeHarness | undefined;
  const server = await createPreviewServer();
  t.after(async () => {
    try { await browser?.close(); }
    finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await ChromeHarness.start(directory, { executable: chrome });
  const { targetId } = await browser.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const page = new ChromePage(browser, sessionId, targetId);
  await page.command("Page.enable");
  await page.command("Page.addScriptToEvaluateOnNewDocument", { source: "window.previewErrors=[];addEventListener('error',e=>previewErrors.push(e.message));addEventListener('unhandledrejection',e=>previewErrors.push(String(e.reason)));" });
  const fresh = async () => {
    await page.viewport(1440, 1000);
    await page.command("Page.navigate", { url: origin });
    await page.wait("document.documentElement.dataset.sliceReady === 'true'");
  };
  await fresh();
  await t.test("AC-13 complete field correction, explicit answer, preview, execution and result", () => questionnairePath(page));
  await fresh();
  await t.test("AC-14 drafts survive close, layout switch, background refresh and expiry", () => preservationPath(page));
  await fresh();
  await t.test("AC-15 invalid recommendation keeps its slot during synthetic composition", () => recommendationPath(page));
  await fresh();
  await t.test("AC-14 failed answer retries; unknown execution only reconciles; failed execution retries explicitly", () => failurePath(page));
  await fresh();
  await t.test("AC-15 keyboard can activate a choice without submitting", async () => {
    await page.evaluate(`document.querySelector('${assistant} [data-choice="format"][data-index="1"]').focus()`);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " " });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
    assert.equal(await selected(page, `${assistant} [data-choice="format"][data-index="1"]`), "true");
    assert.equal(await page.evaluate(`document.querySelector('${assistant}').dataset.questionState`), "open");
  });
  await mkdir(evidence, { recursive: true });
  await t.test("AC-15 both layouts, light/dark, 1440/1024/390 and reduced motion", () => visualMatrix(page, evidence));
  assert.deepEqual(await page.evaluate("window.previewErrors"), []);
});
