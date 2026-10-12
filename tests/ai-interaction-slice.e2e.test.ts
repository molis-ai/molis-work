import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, ChromePage, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { createPreviewServer } from "../scripts/ai-interaction-slice/server.ts";

// Runs in the coordinator's browser slot. This test never starts a Home or a model; every submit is simulated.
const assistant = '[data-scene="assistant"]';
const coding = '[data-scene="coding"]';
const action = (name: string, scope = assistant) => `${scope} [data-action="${name}"]`;
const field = (name: string, scope = assistant) => `${scope} [data-value="${name}"]`;
const read = <T = string>(page: ChromePage, expression: string) => page.evaluate<T>(expression);
const value = (page: ChromePage, selector: string) => read(page, `document.querySelector(${JSON.stringify(selector)}).value`);
async function selected(page: ChromePage, selector: string): Promise<string | null> {
  return page.evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`);
}
async function waitState(page: ChromePage, question: string, execution?: string, scope = assistant): Promise<void> {
  await page.wait(`document.querySelector('${scope}').dataset.questionState === ${JSON.stringify(question)}${execution ? ` && document.querySelector('${scope}').dataset.executionState === ${JSON.stringify(execution)}` : ""}`);
}
async function fillValid(page: ChromePage, scope = assistant): Promise<void> {
  await page.fill(field("notes", scope), "只讨论首次使用，给失败恢复留出时间。");
  await page.click(`${scope} [data-reference="0"]`);
}
async function demo(page: ChromePage, name: string): Promise<void> {
  if (!(await read<boolean>(page, "document.querySelector('.demo-controls').open"))) await page.click(".demo-controls summary");
  await page.click(`.demo-controls [data-action="${name}"]`);
  assert.equal(await read(page, "document.querySelector('.demo-controls').open"), false, "the demo menu closes after a choice");
}
async function submit(page: ChromePage, scope = assistant): Promise<void> {
  await page.click(`${scope} [data-submit]`);
  await waitState(page, "received", undefined, scope);
}
const step = (index = 0, scope = assistant) => `${scope} [data-step-index="${index}"]`;
const stepLabel = (page: ChromePage, index = 0, scope = assistant) => read(page, `document.querySelector('${step(index, scope)}').hidden ? null : document.querySelector('${step(index, scope)}').textContent.trim()`);
const box = (page: ChromePage, selector: string) => read<{ x: number; y: number; width: number }>(page, `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})()`);

async function questionnairePath(page: ChromePage): Promise<void> {
  await page.click(`${assistant} [data-submit]`);
  assert.equal(await read(page, "document.activeElement?.id"), "assistant-notes");
  await page.fill(field("notes"), "时长改为 45 分钟，先看失败恢复");
  assert.equal(await value(page, field("minutes")), "30");
  await page.click(action("adopt"));
  assert.equal(await value(page, field("minutes")), "45");
  await page.fill(field("minutes"), "two");
  await page.fill(field("date"), "2026-02-30");
  await page.click(`${assistant} [data-reference="0"]`);
  await page.click(`${assistant} [data-submit]`);
  assert.equal(await read(page, "document.activeElement?.id"), "assistant-minutes");
  assert.match(await read(page, `document.querySelector('${assistant} [data-field="date"] .field-error').textContent`), /真实日期/);
  assert.equal(await value(page, field("minutes")), "two");
  await page.fill(field("minutes"), "45"); await page.fill(field("date"), "2026-10-15");
  await submit(page);
  assert.match(await read(page, "document.querySelector('[data-counts]').textContent"), /演示回答 1 次 · 演示执行 0 次/);
  assert.equal(await read(page, `document.querySelector('${assistant} [data-question-form]').hidden`), true, "a received answer folds into its summary");
  assert.match(await read(page, `document.querySelector('${assistant} [data-answered-summary]').textContent`), /45 分钟/);
  await page.click(action("preview"));
  assert.match(await read(page, `document.querySelector('${assistant} [data-summary]').textContent`), /45 分钟/);
  await page.click(action("execute"));
  await page.evaluate(`document.querySelector('${action("execute")}').click()`);
  await waitState(page, "received", "done");
  assert.match(await read(page, "document.querySelector('[data-counts]').textContent"), /演示执行 1 次/);
  await page.click(action("result"));
  assert.match(await read(page, `document.querySelector('${assistant} [data-result-summary]').textContent`), /时长改为 45 分钟/);
}
async function composerPath(page: ChromePage): Promise<void> {
  await page.fill(`${assistant} [data-composer]`, "只看首次使用，时长改为 40 分钟");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r" });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  assert.equal(await value(page, `${assistant} [data-composer]`), "", "sent words leave the composer");
  assert.equal(await value(page, field("notes")), "只看首次使用，时长改为 40 分钟", "and land in the question's notes");
  assert.equal(await read(page, `document.querySelector('${assistant} [data-conflict]').hidden`), false, "a stated duration asks before it changes the field");
  assert.equal(await value(page, field("minutes")), "30");
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.questionState`), "open", "sending a supplement does not answer");
  // Enter in a single-line field moves on; only ⌘/Ctrl+Enter answers.
  await page.click(action("keep"));
  await page.click(`${assistant} [data-reference="1"]`);
  await page.fill(`${assistant} [data-when-part="time"]`, "9:30");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r" });
  assert.equal(await read(page, "document.activeElement?.id"), "assistant-references");
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.questionState`), "open");
  await page.click(`${assistant} [data-calendar-open="date"]`);
  assert.equal(await read(page, "document.activeElement?.getAttribute('aria-label')"), "10月15日");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft" });
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r" });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  assert.equal(await value(page, field("date")), "2026-10-14", "the calendar writes the picked day into the field");
  assert.equal(await read(page, `document.querySelector('${assistant} [data-calendar="date"]').hidden`), true);
  assert.equal(await read(page, "document.activeElement?.dataset.calendarOpen"), "date", "focus returns to the calendar button");
  await page.evaluate(`document.querySelector('${field("notes")}').focus()`);
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: process.platform === "darwin" ? 4 : 2 });
  await waitState(page, "received");
  assert.match(await read(page, `document.querySelector('${assistant} [data-answered-summary]').textContent`), /2026-10-16 09:30（UTC-07:00）/);
}
async function preservationPath(page: ChromePage): Promise<void> {
  await page.fill(field("notes"), "保留这段，别替我重新填写。");
  await page.fill(field("minutes"), "37");
  await page.click(action("close"));
  await page.click('[data-layout="coding"]');
  await page.fill(field("notes", coding), "只核对，不要修改代码。");
  await page.click('[data-layout="assistant"]');
  await page.click(action("open"));
  assert.equal(await value(page, field("notes")), "保留这段，别替我重新填写。");
  await page.click(action("minimise"));
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.panel`), "closed");
  await page.click(`${assistant} [data-composer]`);
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.panel`), "open", "the composer brings the panel back");
  assert.equal(await value(page, field("notes")), "保留这段，别替我重新填写。");
  await page.evaluate(`document.querySelector('${field("notes")}').focus(); document.querySelector('${assistant} [data-thread]').scrollTop = 120;`);
  const position = `({focus:document.activeElement.id, scroll:document.querySelector('${assistant} [data-thread]').scrollTop})`;
  const before = await page.evaluate(position);
  await page.evaluate("document.querySelector('.demo-controls [data-action=background]').click()");
  assert.deepEqual(await page.evaluate(position), before, "a background update keeps focus and reading position");
  assert.equal(await value(page, field("minutes")), "37", "and does not overwrite what the person typed");
  await demo(page, "expire");
  assert.equal(await read(page, `document.querySelector('${assistant} [data-submit]').disabled`), true);
  await page.fill(field("notes"), "过期后接着写草稿");
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.questionState`), "expired");
  await page.click(`${assistant} [data-question-state] [data-action="reopen"]`);
  assert.equal(await value(page, field("notes")), "过期后接着写草稿");
  assert.equal(await read(page, `document.querySelector('${assistant}').dataset.questionState`), "open");
}
async function recommendationPath(page: ChromePage): Promise<void> {
  await fillValid(page); await submit(page);
  assert.equal(await stepLabel(page), "预览参数");
  await page.fill(`${assistant} [data-composer]`, "正在补充");
  const position = await box(page, step());
  // Synthetic composition verifies event handling only, not a real OS input method.
  await page.evaluate(`document.querySelector('${assistant} [data-composer]').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'正'})); document.querySelector('.demo-controls [data-action=object]').click();`);
  assert.equal(await stepLabel(page), "预览参数", "the shown step keeps its label while composing");
  assert.equal(await read(page, `document.querySelector('${step()}').disabled`), true, "and cannot run once its record changed");
  assert.deepEqual(await box(page, step()), position, "and keeps its place");
  await page.evaluate(`document.querySelector('${assistant} [data-composer]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'正在'})); document.querySelector('[data-theme-toggle]').focus();`);
  await page.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await page.wait(`document.querySelector('${step()}').textContent.trim() === '按新版本重新准备' && !document.querySelector('${step()}').disabled`);
  assert.equal(await value(page, `${assistant} [data-composer]`), "正在补充", "the composer keeps its words through the change");
}
async function failurePath(page: ChromePage): Promise<void> {
  await fillValid(page); await demo(page, "answer-failure");
  await page.click(`${assistant} [data-submit]`); await waitState(page, "failed");
  assert.equal(await value(page, field("notes")), "只讨论首次使用，给失败恢复留出时间。");
  await demo(page, "outcome-unknown"); await submit(page); await page.click(action("preview"));
  await page.click(action("execute")); await waitState(page, "received", "unknown");
  assert.equal(await read(page, `document.querySelector('${action("execute")}').disabled`), true);
  assert.equal(await stepLabel(page), "核对结果", "beside the composer too, unknown only reconciles");
  await page.click(step()); await waitState(page, "received", "done");
  assert.match(await read(page, "document.querySelector('[data-counts]').textContent"), /演示执行 1 次/);
  await page.click(action("continue")); await submit(page); await demo(page, "outcome-failed");
  await page.click(action("preview")); await page.click(action("execute")); await waitState(page, "received", "failed");
  await demo(page, "outcome-done"); await page.click(action("retry")); await page.click(step());
  await waitState(page, "received", "done");
  assert.match(await read(page, "document.querySelector('[data-counts]').textContent"), /演示执行 3 次/, "the composer's step runs the same card");
}
async function codingPath(page: ChromePage): Promise<void> {
  await page.click('[data-layout="coding"]');
  await fillValid(page, coding);
  await submit(page, coding);
  await page.click(step(0, coding)); await page.click(step(0, coding));
  await waitState(page, "received", "done", coding);
  assert.equal(await stepLabel(page, 0, coding), "查看变更");
  assert.equal(await stepLabel(page, 1, coding), "继续调整");
  await page.click(step(0, coding));
  assert.equal(await read(page, `document.querySelector('${coding} [data-tools]').dataset.tools`), "open");
  assert.equal(await read(page, "document.activeElement?.dataset.toolsPanel"), "", "the review column takes focus");
}
async function gallery(page: ChromePage, evidence: string, fresh: (width?: number, height?: number, mobile?: boolean) => Promise<void>): Promise<void> {
  const shot = (name: string) => page.screenshot(join(evidence, `state-${name}.png`));
  await fresh(1440, 900); await page.click(`${assistant} [data-submit]`); await shot("assistant-1440-field-errors");
  await page.fill(`${assistant} [data-composer]`, "时长改为 45 分钟"); await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r" });
  await page.evaluate(`document.querySelector('${assistant} [data-conflict]').scrollIntoView({block:'center'})`); await shot("assistant-1440-conflict");
  await page.click(action("adopt")); await page.click(`${assistant} [data-reference="0"]`); await submit(page); await shot("assistant-1440-received");
  await page.click(step()); await shot("assistant-1440-preview");
  await demo(page, "outcome-unknown"); await page.click(step()); await waitState(page, "received", "unknown"); await shot("assistant-1440-unknown");
  await page.click(step()); await waitState(page, "received", "done"); await shot("assistant-1440-done");
  await fresh(1440, 900); await fillValid(page); await demo(page, "expire"); await shot("assistant-1440-expired");
  await fresh(1440, 900); await fillValid(page); await submit(page); await demo(page, "object"); await shot("assistant-1440-object-changed");
  await fresh(1440, 900); await page.click('[data-layout="coding"]'); await fillValid(page, coding); await submit(page, coding);
  await page.click(step(0, coding)); await shot("coding-1440-preview");
  await fresh(390, 844, true); await fillValid(page); await submit(page); await shot("assistant-390-next-step");
  await fresh(390, 844, true); await page.evaluate("document.documentElement.dataset.theme='dark'"); await page.click('[data-layout="coding"]'); await shot("coding-390-dark");
}
async function visualMatrix(page: ChromePage, evidence: string): Promise<void> {
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) for (const layout of ["assistant", "coding"]) {
    await page.viewport(width, 1000, width === 390);
    await page.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await page.click(`[data-layout="${layout}"]`);
    const metrics = await page.evaluate<{ overflow: number; minTarget: number; transition: string; offscreen: string[] }>(`(()=>{
      const buttons=[...document.querySelectorAll('[data-scene="${layout}"] button')].filter(b=>b.checkVisibility());
      const offscreen=buttons.filter(b=>{const r=b.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1}).map(b=>b.textContent.trim()||b.getAttribute('aria-label'));
      return {overflow:document.documentElement.scrollWidth-innerWidth,minTarget:Math.min(...buttons.map(b=>b.getBoundingClientRect().height)),transition:getComputedStyle(buttons[0]).transitionDuration,offscreen};
    })()`);
    assert.ok(metrics.overflow <= 1, `${layout} ${width} must not scroll horizontally`);
    assert.deepEqual(metrics.offscreen, [], `${layout} ${width}: every visible button stays inside the window`);
    if (width === 390) assert.ok(metrics.minTarget >= 44, `${layout}: touch targets >= 44px`);
    assert.equal(metrics.transition, "0s");
    await page.screenshot(join(evidence, `${layout}-${theme}-${width}.png`));
  }
}
test("AC-13 AC-14 AC-15 AC-16 / I0 actual preview interaction paths (simulated operations)", { timeout: 240_000 }, async t => {
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
  const errors: unknown[] = [];
  const fresh = async (width = 1440, height = 1000, mobile = false) => {
    if (await page.evaluate("typeof window.previewErrors !== 'undefined'")) errors.push(...await page.evaluate<unknown[]>("window.previewErrors"));
    await page.viewport(width, height, mobile);
    await page.command("Page.navigate", { url: origin });
    await page.wait("document.documentElement.dataset.sliceReady === 'true'");
  };
  await fresh();
  await t.test("AC-13 complete field correction, explicit answer, preview, execution and result", () => questionnairePath(page));
  await fresh();
  await t.test("AC-13 composer words join the notes draft; Enter moves on, ⌘/Ctrl+Enter answers; calendar picks a day", () => composerPath(page));
  await fresh();
  await t.test("AC-14 drafts survive collapse, layout switch, minimise, background refresh and expiry", () => preservationPath(page));
  await fresh();
  await t.test("AC-15 a stale next step keeps its slot during synthetic composition, then gives way", () => recommendationPath(page));
  await fresh();
  await t.test("AC-14 failed answer retries; unknown execution only reconciles; failed execution retries explicitly", () => failurePath(page));
  await fresh();
  await t.test("AC-16 Coding shares the interaction and keeps its professional follow-up", () => codingPath(page));
  await fresh();
  await t.test("AC-15 keyboard can activate a choice without submitting", async () => {
    await page.evaluate(`document.querySelector('${assistant} [data-choice="format"][data-index="1"]').focus()`);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " " });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
    assert.equal(await selected(page, `${assistant} [data-choice="format"][data-index="1"]`), "true");
    assert.equal(await read(page, `document.querySelector('${assistant}').dataset.questionState`), "open");
  });
  await mkdir(evidence, { recursive: true });
  await t.test("AC-15 both layouts, light/dark, 1440/1024/390 and reduced motion", () => visualMatrix(page, evidence));
  await t.test("AC-13 AC-14 key states as screenshots for review", () => gallery(page, evidence, fresh));
  errors.push(...await page.evaluate<unknown[]>("window.previewErrors"));
  assert.deepEqual(errors, []);
});
