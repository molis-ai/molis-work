import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, ChromePage, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import {
  INTERACTION_CLIENT_SCRIPT, INTERACTION_STYLES, PRIMITIVE_STYLES, TYPEFACE_STYLES,
  renderControlMetrics, renderIconSprite, renderInteractionQuestion, renderPrimitiveCatalog, renderShapeTokens, renderShellTokens,
} from "@molis-ai/molis-work-design-system";

// The shared interaction behaviour, exercised in a real browser on the design system's own markup. Nothing here starts a
// Home or a model. Composition events are synthetic: they prove the event handling, not a real input method.
const calendar = { months: [{ year: 2026, month: 9 }, { year: 2026, month: 10 }], today: "2026-10-12" };
const card = renderInteractionQuestion({
  id: "q", kicker: "k", title: "t", footer: { note: "", actions: [{ id: "submit", label: "提交", type: "submit", variant: "primary" }] },
  fields: [
    { id: "title", label: "标题", control: { kind: "text", value: "" } },
    { id: "format", label: "方式", control: { kind: "choice", options: [{ value: "a", label: "A", description: "第一种", selected: true }, { value: "b", label: "B", description: "第二种" }] } },
    { id: "topics", label: "重点", control: { kind: "choice", multiple: true, options: [{ value: "x", label: "X", selected: true }, { value: "y", label: "Y" }, { value: "z", label: "Z" }],
      other: { label: "其他", value: "" } } },
    { id: "notes", label: "补充", control: { kind: "text", multiline: true, value: "" } },
    { id: "minutes", label: "时长", control: { kind: "number", value: "30", step: 5, min: 15, max: 40, integer: true, unit: "分钟" } },
    { id: "date", label: "日期", control: { kind: "date", value: "2026-10-15", calendar } },
    { id: "when", label: "开始", control: { kind: "datetime", date: "2026-10-16", time: "10:00", zone: "UTC−07:00", calendar } },
    { id: "refs", label: "材料", control: { kind: "reference", candidates: [{ id: "g", label: "G" }, { id: "d", label: "D" }] } },
  ],
});
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>:root{${renderShellTokens("light")}${renderShapeTokens()}${renderControlMetrics()}}${TYPEFACE_STYLES}${PRIMITIVE_STYLES}${INTERACTION_STYLES}body{margin:0;padding:24px;background:var(--paper);color:var(--ink);font-family:var(--font)}.icon-sprite{position:absolute;width:0;height:0}svg{width:14px;height:14px;fill:none;stroke:currentColor}</style></head>
  <body>${renderIconSprite()}<div id="card" style="width:640px">${card}</div>
  <script>window.log=[];window.client=(${INTERACTION_CLIENT_SCRIPT})(document.getElementById("card"),{onChange:c=>log.push(["change",c]),onAction:id=>log.push(["action",id]),onSubmit:()=>log.push(["submit"]),onStep:i=>log.push(["step",i])});document.documentElement.dataset.ready="1"</script></body></html>`;
const evaluate = <T = unknown>(browser: ChromePage, expression: string) => browser.evaluate<T>(expression);
const log = (browser: ChromePage) => evaluate<Array<[string, unknown]>>(browser, "JSON.parse(JSON.stringify(window.log))");
const clear = (browser: ChromePage) => evaluate(browser, "window.log.length = 0");
const key = async (browser: ChromePage, name: string, modifiers = 0) => {
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name === "Enter" ? "Enter" : name, text: name === "Enter" ? "\r" : undefined, modifiers });
  await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name === "Enter" ? "Enter" : name, modifiers });
};
const MOD = process.platform === "darwin" ? 4 : 2;

test("AC-18 / the shared interaction client works on the design system's markup in a real browser", { timeout: 120_000 }, async t => {
  const chrome = locateTestChrome();
  if (!chrome) return t.skip("Chrome is required; browser behaviour stays unverified");
  const directory = await mkdtemp(join(tmpdir(), "molis-interaction-client-"));
  const server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(page); });
  let harness: ChromeHarness | undefined;
  t.after(async () => {
    try { await harness?.close(); } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  harness = await ChromeHarness.start(directory, { executable: chrome });
  const { targetId } = await harness.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await harness.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const browser = new ChromePage(harness, sessionId, targetId);
  await browser.command("Page.enable");
  await browser.viewport(1000, 1400);
  await browser.command("Page.navigate", { url: `http://127.0.0.1:${address.port}` });
  await browser.wait("document.documentElement.dataset.ready === '1'");
  const value = (id: string) => evaluate<unknown>(browser, `window.client.read()[${JSON.stringify(id)}]`);

  await t.test("one pick is a radio group: clicking moves the pick, arrows move it too, and only one option is a tab stop", async () => {
    assert.deepEqual(await value("format"), ["a"]);
    assert.deepEqual(await evaluate(browser, `[...document.querySelectorAll('[data-ix-field=format] [role=radio]')].map(r => r.tabIndex)`), [0, -1]);
    await clear(browser);
    await browser.click('[data-ix-field="format"] [data-ix-option="b"]');
    assert.deepEqual(await value("format"), ["b"]);
    assert.deepEqual(await evaluate(browser, `[...document.querySelectorAll('[data-ix-field=format] [role=radio]')].map(r => [r.getAttribute('aria-checked'), r.tabIndex])`), [["false", -1], ["true", 0]]);
    assert.deepEqual((await log(browser)).filter(([kind]) => kind === "change").length, 1);
    await key(browser, "ArrowUp");
    assert.deepEqual(await value("format"), ["a"], "arrows pick the previous radio and wrap");
    assert.equal(await evaluate(browser, "document.activeElement.dataset.ixOption"), "a");
  });
  await t.test("several picks toggle independently; the other text is part of the value", async () => {
    await browser.click('[data-ix-field="topics"] [data-ix-option="y"]');
    await browser.click('[data-ix-field="topics"] [data-ix-option="x"]');
    await browser.fill('[data-ix-other="topics"]', "别的方向");
    assert.deepEqual(await value("topics"), { picked: ["y"], other: "别的方向" });
  });
  await t.test("the stepper keeps to min and max; a blank number only takes focus", async () => {
    await browser.click('[data-ix-step-by="5"]');
    await browser.click('[data-ix-step-by="5"]');
    assert.equal(await value("minutes"), "40", "30 → 35 → 40, then the max holds");
    await browser.click('[data-ix-step-by="5"]');
    assert.equal(await value("minutes"), "40");
    await browser.fill('[data-ix-value="minutes"]', "");
    await browser.click('[data-ix-step-by="-5"]');
    assert.equal(await value("minutes"), "", "an empty field is not stepped from zero");
    assert.equal(await evaluate(browser, "document.activeElement.dataset.ixValue"), "minutes");
  });
  await t.test("a composition reports once, when it ends (synthetic events)", async () => {
    await clear(browser);
    await evaluate(browser, `(()=>{const n=document.querySelector('[data-ix-value=notes]');n.focus();n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='你';n.dispatchEvent(new Event('input',{bubbles:true}));n.value='你好';n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal((await log(browser)).length, 0, "no change is reported mid-composition");
    assert.equal(await evaluate(browser, "window.client.composing"), true);
    await evaluate(browser, `(()=>{const n=document.querySelector('[data-ix-value=notes]');n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你好'}));})()`);
    assert.deepEqual(await log(browser), [["change", { field: "notes", value: "你好" }]]);
    assert.equal(await evaluate(browser, "window.client.composing"), false);
  });
  await t.test("write() leaves the field being typed in alone and writes the rest", async () => {
    await evaluate(browser, `document.querySelector('[data-ix-value=notes]').focus()`);
    await evaluate(browser, `window.client.write({ notes: "被覆盖？", minutes: "25", date: "2026-10-17", when: { date: "2026-10-18", time: "09:30" }, format: ["b"], refs: ["d"] })`);
    assert.equal(await value("notes"), "你好", "the focused field keeps what the person typed");
    assert.equal(await value("minutes"), "25");
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-weekday]').textContent`), "周六");
    assert.deepEqual(await value("when"), { date: "2026-10-18", time: "09:30" });
    assert.deepEqual(await value("format"), ["b"]);
    assert.deepEqual(await value("refs"), ["d"]);
  });
  await t.test("Enter in a single-line field moves on; only ⌘/Ctrl+Enter submits; the submit button submits", async () => {
    await clear(browser);
    await evaluate(browser, `document.querySelector('[data-ix-value=minutes]').focus()`);
    await key(browser, "Enter");
    assert.deepEqual(await log(browser), [], "plain Enter does not submit");
    assert.notEqual(await evaluate(browser, "document.activeElement.dataset.ixValue"), "minutes", "it moves to the next control");
    await key(browser, "Enter", MOD);
    assert.deepEqual(await log(browser), [["submit"]]);
    await clear(browser);
    await browser.click('[data-ix-action="submit"]');
    assert.deepEqual(await log(browser), [["submit"]], "the form's submit goes to onSubmit once, not also onAction");
  });
  await t.test("the calendar opens on the field's day, arrows move, Enter picks into the field, Escape returns focus", async () => {
    await clear(browser);
    await browser.click('[data-ix-field="date"] [data-ix-calendar-open]');
    assert.equal(await evaluate(browser, "document.activeElement.getAttribute('aria-label')"), "10月17日");
    await key(browser, "ArrowLeft");
    await key(browser, "ArrowDown");
    await key(browser, "Enter");
    assert.equal(await value("date"), "2026-10-23");
    assert.deepEqual((await log(browser)).filter(([kind]) => kind === "change").length, 1);
    assert.equal(await evaluate(browser, "document.activeElement.hasAttribute('data-ix-calendar-open')"), true, "focus returns to the opener");
    await browser.click('[data-ix-field="date"] [data-ix-calendar-open]');
    await key(browser, "Escape");
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-calendar]').hidden`), true);
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-weekday]').textContent`), "周五");
  });
  await t.test("a press anywhere outside the date field closes the calendar, and only then", async () => {
    await browser.click('[data-ix-field="date"] [data-ix-calendar-open]');
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-calendar]').hidden`), false);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", x: 900, y: 300, button: "left", clickCount: 1 });
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: 900, y: 300, button: "left", clickCount: 1 });
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-calendar]').hidden`), true, "empty page space closes it");
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-calendar-open]').getAttribute('aria-expanded')`), "false");
    await browser.click('[data-ix-field="date"] [data-ix-calendar-open]');
    await browser.click('[data-ix-field="date"] [data-ix-calendar-open]');
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=date] [data-ix-calendar]').hidden`), true, "pressing the opener again closes it (the outside listener leaves the field alone)");
  });
  await t.test("the Enter that confirms an input-method candidate (keyCode 229, isComposing false) does not move on", async () => {
    await clear(browser);
    await evaluate(browser, `document.querySelector('[data-ix-value=title]').focus()`);
    const result = await evaluate<{ prevented: boolean; active: string }>(browser, `(()=>{const t=document.querySelector('[data-ix-value=title]');const e=new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true});t.dispatchEvent(e);return {prevented:e.defaultPrevented,active:document.activeElement.dataset.ixValue}})()`);
    assert.deepEqual(result, { prevented: false, active: "title" }, "the Enter is left to the input method");
    assert.deepEqual(await log(browser), []);
  });
  await t.test("Enter that lands on an option group focuses the pick inside it, not the container", async () => {
    await evaluate(browser, `document.querySelector('[data-ix-value=title]').focus()`);
    await key(browser, "Enter");
    assert.deepEqual(await evaluate(browser, `(e=>[e.getAttribute('role'), e.getAttribute('aria-checked'), e.dataset.ixOption])(document.activeElement)`), ["radio", "true", "b"], "the checked radio, which is also the single tab stop");
  });
  await t.test("showErrors marks each field, clears the others, and focuses the first on request", async () => {
    await evaluate(browser, `window.client.showErrors({ minutes: "请输入整数", refs: "请选一份" }, { focus: true })`);
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=minutes] [data-ix-error]').textContent`), "请输入整数");
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=minutes] [data-ix-error]').hidden`), false);
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=minutes] input').getAttribute('aria-invalid')`), "true");
    assert.equal(await evaluate(browser, "document.activeElement.dataset.ixValue"), "minutes");
    await evaluate(browser, `window.client.showErrors({ refs: "请选一份" })`);
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=minutes] [data-ix-error]').hidden`), true, "a field that is fine again goes quiet");
    assert.equal(await evaluate(browser, `document.querySelector('[data-ix-field=refs] [data-ix-references]').getAttribute('aria-invalid')`), "true");
  });
  await t.test("destroy() removes every listener", async () => {
    await clear(browser);
    await evaluate(browser, "window.client.destroy()");
    await browser.click('[data-ix-field="format"] [data-ix-option="a"]');
    assert.deepEqual(await log(browser), []);
  });
  await t.test("the component board's own sample runs its script: adopt rewrites the field, submit shows the remaining error", async () => {
    const board = `<!doctype html><html><head><meta charset="utf-8"><style>:root{${renderShellTokens("light")}${renderShapeTokens()}${renderControlMetrics()}}${TYPEFACE_STYLES}${PRIMITIVE_STYLES}</style></head><body>${renderIconSprite()}${renderPrimitiveCatalog()}</body></html>`;
    await browser.command("Page.navigate", { url: "about:blank" });
    await browser.command("Page.setDocumentContent", { frameId: (await browser.command<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree")).frameTree.frame.id, html: board });
    await browser.wait(`!!document.querySelector('[data-ix-question="ix-q-open"]')`);
    // The document's own inline script has run by now; running it again would mount a second client on the same card.
    const card = '[data-ix-question="ix-q-open"]';
    await browser.click(`${card} [data-ix-action="adopt"]`);
    assert.equal(await evaluate(browser, `document.querySelector('${card} [data-ix-value=minutes]').value`), "45");
    assert.equal(await evaluate(browser, `document.querySelector('${card} [data-ix-notice]').hidden`), true);
    assert.equal(await evaluate(browser, `document.querySelector('${card} [data-ix-field=minutes] [data-ix-error]').hidden`), true);
    await browser.click(`${card} [data-ix-reference="goal"]`);
    assert.equal(await evaluate(browser, `document.querySelector('${card} [data-ix-field=materials] [data-ix-error]').hidden`), true, "changing a field clears its own error");
    await browser.fill(`${card} [data-ix-value=minutes]`, "x");
    await browser.click(`${card} [data-ix-action="submit"]`);
    assert.match(await evaluate<string>(browser, `document.querySelector('${card} [data-ix-field=minutes] [data-ix-error]').textContent`), /15–120/);
    assert.equal(await evaluate(browser, `document.querySelector('${card} [data-ix-field=materials] [data-ix-error]').hidden`), true, "a fine field stays quiet");
  });
});
