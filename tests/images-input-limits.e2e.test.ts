import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// The compose form is open over the whole Images page (36A-3: the history is the page behind it), so the services are
// opened from its own bar; the history's own key is only there while no service is connected and nothing is open.
const SERVICES = ".plugin-stage-detail-bar [data-images-connections]";

// BL-985: the five texts of the Images page keep the service's own limits, counted as the service counts them: characters (one 🟢 is one,
// though it is two UTF-16 units) of the trimmed text. Prompt 32,000, size 64, aspect ratio 32, service name 100, model name 200
// (plugins/native/images/src/limits.ts). The page had `maxlength`, which counts units: it let a size or a ratio through to 100 units (past
// the service's 64 and 32) and stopped a prompt of emoji at 16,000. Text is typed into the real page through Chrome's input: plain
// text, emoji, and a Chinese input method's composition.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const wide = "🟢";
const LONE_HALF = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

type Field = { selector: string; max: number; name: string };
const PROMPT: Field = { selector: "[data-images-prompt]", max: 32_000, name: "图片描述" };
const SIZE: Field = { selector: "[data-images-size]", max: 64, name: "图片尺寸" };
const RATIO: Field = { selector: "[data-images-ratio]", max: 32, name: "宽高比" };
const NAME: Field = { selector: "[data-images-connection-name]", max: 100, name: "服务名称" };
const MODEL: Field = { selector: "[data-images-connection-model]", max: 200, name: "模型名称" };

async function openImages(t: TestContext) {
  const received: Array<Record<string, unknown>> = [];
  const provider = createServer(async (request, response) => {
    // Decoded once, whole: a 🟢 can be split across two chunks of the body.
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    try { received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>); } catch { received.push({}); }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => { provider.closeAllConnections(); return new Promise<void>(resolve => provider.close(() => resolve())); });
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const frame = await pluginFrameBrowser(t, browser, "images");
  const { evaluate, waitFor, click } = frame;
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click("[data-images-new]");

  const value = (field: Field) => evaluate<string>(`document.querySelector(${JSON.stringify(field.selector)}).value`);
  const images = {
    received, evaluate, waitFor, click, value,
    /** Clicks into the field, selects what it holds, and types `text` as Chrome's input does (one insertion, as a paste or a committed word is). */
    async type(field: Field, text: string, replace = true) {
      await click(field.selector);
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(field.selector)}); e.focus(); ${replace ? "e.select();" : "e.setSelectionRange(e.value.length, e.value.length);"} })()`);
      await command("Input.insertText", { text }, sessionId);
    },
    /** Selects all of the field and deletes it with the Delete key. */
    async clear(field: Field) {
      await click(field.selector);
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(field.selector)}); e.focus(); e.select(); })()`);
      for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 }, sessionId);
    },
    /** A Chinese input method: `pinyin` is composed first (still open), then `chosen` is committed. Returns the value while composing. */
    async compose(field: Field, pinyin: string, chosen: string) {
      await click(field.selector);
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(field.selector)}); e.focus(); e.setSelectionRange(e.value.length, e.value.length); })()`);
      await command("Input.imeSetComposition", { text: pinyin, selectionStart: pinyin.length, selectionEnd: pinyin.length }, sessionId);
      const composing = await value(field);
      await command("Input.insertText", { text: chosen }, sessionId);
      return composing;
    },
    note: (selector: string) => evaluate<string>(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); return n && !n.hidden ? n.textContent.trim() : ""; })()`),
    validity: (field: Field) => evaluate<string>(`document.querySelector(${JSON.stringify(field.selector)}).validationMessage`),
    /** Saves a custom service with this name and model, in the given protocol, through the dialog's own fields. */
    async saveService(name: string, model: string, format: "openai-images" | "gemini") {
      await click(SERVICES);
      await waitFor("document.querySelector('[data-images-dialog]').open");
      if (await evaluate<boolean>("Boolean(document.querySelector('[data-images-saved-connections] [data-images-edit-connection]'))")) await click("[data-images-add-connection]");
      await click('[data-images-preset="custom"]');
      await waitFor("document.querySelector('[data-images-advanced]').open");
      await click(`[data-images-format="${format}"]`);
      await images.type(NAME, name);
      await evaluate(`document.querySelector('[data-images-connection-url]').value = 'http://127.0.0.1:${address.port}/v1'`);
      await images.type(MODEL, model);
      await click("[data-images-save-connection]");
      await waitFor("!document.querySelector('[data-images-dialog]').open", 15_000);
    },
  };
  return images;
}

const cut = (field: Field) => `${field.name}最多 ${field.max} 个字符，多出的部分没有放进来。`;

/** Exactly at the limit is taken whole; one more character is left out, the page says so, and no half of a 🟢 is ever kept. */
async function checkEdges(images: NonNullable<Awaited<ReturnType<typeof openImages>>>, field: Field, note: string) {
  const name = field.name;
  for (const unit of ["a", wide, "中"]) {
    const full = unit.repeat(field.max);
    await images.type(field, full);
    assert.ok(await images.value(field) === full, `${name}: ${field.max} × ${unit} is taken whole`);
    assert.notEqual(await images.note(note), cut(field), `${name}: nothing is left out at the limit`);
    await images.type(field, unit, false);
    const after = await images.value(field);
    assert.ok(after === full, `${name}: one more ${unit} is left out (got ${[...after].length} characters)`);
    assert.equal(LONE_HALF.test(after), false, `${name}: no half of a character`);
    assert.equal(await images.note(note), cut(field), `${name}: the page says why`);
  }
  // A paste past the limit keeps its first characters, whole: limit − 1 plain ones and then 🟢🟢 keeps one 🟢.
  await images.type(field, "a".repeat(field.max - 1) + wide + wide);
  assert.ok(await images.value(field) === "a".repeat(field.max - 1) + wide, `${name}: a paste is cut between whole characters`);
  // Blank around the text is not counted, as the service trims it first.
  await images.type(field, ` ${"a".repeat(field.max)} `);
  assert.ok(await images.value(field) === ` ${"a".repeat(field.max)} `, `${name}: blank around the text does not count`);
  // A Chinese input method: the composition is left as it is while it is open, and the committed word is kept within the limit.
  await images.type(field, "a".repeat(field.max - 1));
  const composing = await images.compose(field, "zhongwen", "中文");
  assert.ok(composing.endsWith("zhongwen"), `${name}: the open composition is not cut (${composing.slice(-12)})`);
  assert.ok(await images.value(field) === "a".repeat(field.max - 1) + "中", `${name}: the committed word keeps what fits`);
  await images.clear(field);
  assert.notEqual(await images.note(note), cut(field), `${name}: the note goes once the field is within its limit again`);
}

test("BL-985: the five Images fields take exactly the service's limit in characters, one more is left out, with emoji and a Chinese input method", { timeout: 240_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  // The service dialog: service name 100, model name 200.
  await images.click(SERVICES);
  await images.waitFor("document.querySelector('[data-images-dialog]').open");
  await images.click('[data-images-preset="custom"]');
  await images.waitFor("document.querySelector('[data-images-advanced]').open");
  await checkEdges(images, NAME, "[data-images-connection-note]");
  await checkEdges(images, MODEL, "[data-images-connection-note]");
  await images.click("[data-images-dialog-close]");
  await images.waitFor("!document.querySelector('[data-images-dialog]').open");

  // A service named and modelled at its limits, in 🟢, is saved whole.
  await images.saveService(wide.repeat(100), wide.repeat(200), "openai-images");
  await images.waitFor("!document.querySelector('[data-images-size-field]').hidden");
  await checkEdges(images, PROMPT, "[data-images-note]");
  await checkEdges(images, SIZE, "[data-images-note]");
  await images.saveService("比例服务", "fixture-gemini", "gemini");
  await images.waitFor("!document.querySelector('[data-images-ratio-field]').hidden");
  await checkEdges(images, RATIO, "[data-images-note]");
});

test("BL-985: what the page submits is within the service's limits: a prompt of 32,000 🟢 and a size of 64 go through whole, a longer one set by the page stops at the form", { timeout: 240_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  await images.saveService("整字服务", "fixture-image", "openai-images");
  await images.waitFor("!document.querySelector('[data-images-size-field]').hidden");
  const prompt = wide.repeat(32_000), size = wide.repeat(64);
  await images.type(PROMPT, prompt);
  await images.type(SIZE, size);
  await images.waitFor("!document.querySelector('[data-images-generate]').disabled");
  await images.click("[data-images-generate]");
  await images.waitFor("!document.querySelector('[data-images-result]').hidden && document.querySelector('[data-images-result] h2[data-mw-state=done]')", 20_000);
  assert.equal(images.received.length, 1, "the service was called once");
  assert.ok(images.received[0]!.prompt === prompt, "the whole prompt of 32,000 🟢 reached the service");
  assert.ok(images.received[0]!.size === size, "the whole size of 64 🟢 reached the service");

  // A text the page set past its limit (as a draft saved before this change could be) is not typed, so it is not cut: submitting
  // stops at that field and says how long it is, and nothing is sent.
  await images.click("[data-images-new]");
  await images.type(PROMPT, "一张图");
  await images.evaluate(`document.querySelector('[data-images-size]').value = ${JSON.stringify("a".repeat(65))}`);
  await images.waitFor("!document.querySelector('[data-images-generate]').disabled");
  await images.click("[data-images-generate]");
  assert.equal(await images.validity(SIZE), "图片尺寸最多 64 个字符，现在有 65 个，请删短一些。");
  assert.equal(images.received.length, 1, "nothing more was sent");
  await images.type(SIZE, "1024x1024");
  assert.equal(await images.validity(SIZE), "", "a size within the limit clears the message");

  // 32,000+ chars followed by 5,000 trailing spaces cuts in linear time without freezing, and mid-surrogate caret produces no lone surrogate.
  const hugeWithSpaces = `${"a".repeat(32_000)}b${" ".repeat(5_000)}`;
  const elapsedMs = await images.evaluate<number>(`(() => {
    const field = document.querySelector('[data-images-prompt]');
    const start = performance.now();
    field.value = ${JSON.stringify(hugeWithSpaces)};
    field.setSelectionRange(field.value.length, field.value.length);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    return performance.now() - start;
  })()`);
  assert.equal(await images.value(PROMPT), "a".repeat(32_000));
  assert.ok(elapsedMs < 1_000, `linear cutToLimit should finish well under 1s, took ${elapsedMs}ms`);

  const surrogateMidValue = await images.evaluate<string>(`(() => {
    const field = document.querySelector('[data-images-size]');
    field.value = ${JSON.stringify(wide.repeat(65))};
    field.setSelectionRange(3, 3);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    return field.value;
  })()`);
  assert.equal([...surrogateMidValue].length, 64);
  assert.equal(LONE_HALF.test(surrogateMidValue), false, "aligned caret never splits a UTF-16 surrogate pair");
});
