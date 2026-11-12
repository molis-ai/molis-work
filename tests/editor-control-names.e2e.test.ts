import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import test, { type TestContext } from "node:test";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openDatasetStore, openJellyStore, openPptStore } from "./fixtures/plugin-home-stores.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Frame = Awaited<ReturnType<typeof pluginFrameBrowser>>;
type AXNode = {
  nodeId: string;
  childIds?: string[];
  ignored: boolean;
  role?: { value: string };
  name?: { value: string };
  properties?: { name: string; value: { value: unknown } }[];
};
type Tree = { nodes: AXNode[] };
const node = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
const keys = { Tab: 9, Enter: 13, Escape: 27, " ": 32, ArrowRight: 39 };

async function keyboard(b: Browser, key: keyof typeof keys) {
  const event = { key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: keys[key], nativeVirtualKeyCode: keys[key] };
  await b.command("Input.dispatchKeyEvent", key === "Enter"
    ? { ...event, type: "keyDown", text: "\r", unmodifiedText: "\r" }
    : { ...event, type: "rawKeyDown" }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { ...event, type: "keyUp" }, b.sessionId);
}

async function focus(frame: Frame, selector: string) {
  await frame.evaluate(`${node(selector)}.focus()`);
  await frame.waitFor(`document.hasFocus() && document.activeElement === ${node(selector)}`);
}

async function activate(b: Browser, frame: Frame, selector: string, key: "Enter" | " " = "Enter") {
  await focus(frame, selector);
  await keyboard(b, key);
}

async function typeInto(b: Browser, frame: Frame, selector: string, text: string) {
  await focus(frame, selector);
  await frame.evaluate(`${node(selector)}.select()`);
  await b.command("Input.insertText", { text }, b.sessionId);
}

async function navigate(b: Browser, frame: Frame, plugin: string) {
  const url = `${b.origin}/projects/${b.projectId}/?openPlugin=${plugin}`;
  await b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));
  await b.waitFor(`document.body.dataset.desktopSurface === "${plugin}"`);
  await frame.clientReady();
}

async function axNode(frame: Frame, selector: string): Promise<AXNode | undefined> {
  const { result } = await frame.frameCommand<{ result: { objectId?: string } }>(
    "Runtime.evaluate", { expression: node(selector), returnByValue: false });
  assert.ok(result.objectId, selector);
  try {
    const { nodes } = await frame.frameCommand<Tree>("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
    return nodes.find(entry => !entry.ignored);
  } finally {
    await frame.frameCommand("Runtime.releaseObject", { objectId: result.objectId });
  }
}

async function assertNames(frame: Frame, controls: readonly (readonly [string, string, string])[]) {
  for (const [selector, role, name] of controls) {
    const control = await axNode(frame, selector);
    assert.deepEqual([control?.role?.value, control?.name?.value], [role, name], selector);
  }
}

async function accessibleTree(frame: Frame) {
  const { nodes } = await frame.frameCommand<Tree>("Accessibility.getFullAXTree", { frameId: await frame.frameId() });
  return nodes.filter(control => !control.ignored);
}

async function assertNamedButtons(frame: Frame) {
  const unnamed = (await accessibleTree(frame)).filter(control =>
    ["button", "radio", "DisclosureTriangle"].includes(control.role?.value ?? "") && !control.name?.value.trim());
  assert.deepEqual(unnamed.map(control => control.role?.value), [], "visible buttons and radio options have names");
}

async function screenshot(b: Browser, name: string) {
  const output = reviewEvidenceUrl("batch27-editor-names/");
  await mkdir(output, { recursive: true });
  const { data } = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  await writeFile(new URL(name + ".png", output), Buffer.from(data, "base64"));
}

function postCounter(t: TestContext, b: Browser, path: string) {
  let count = 0;
  const observe = (request: IncomingMessage) => {
    if (request.method === "POST" && new URL(request.url ?? "/", b.origin).pathname.endsWith(path)) count++;
  };
  b.server.on("request", observe);
  t.after(() => { b.server.off("request", observe); });
  return () => count;
}

async function auditDataset(t: TestContext, b: Browser) {
  const frame = await pluginFrameBrowser(t, b, "dataset");
  const read = () => {
    const store = openDatasetStore(b.homeDirectory);
    try { return store.list(b.projectId!)[0]!; } finally { store.close(); }
  };
  const title = "[data-dataset-title]";
  const more = "[data-dataset-stage-workspace] .plugin-stage-more > summary";
  const text = "Release feedback from workshop participants";
  await navigate(b, frame, "dataset");
  await frame.click("[data-dataset-new]");
  await frame.waitFor(`!${node("[data-dataset-stage-workspace]")}.hidden`);
  await focus(frame, more);
  await keyboard(b, "Tab");
  await frame.waitFor(`document.activeElement === ${node(title)}`);
  await typeInto(b, frame, title, text);
  await activate(b, frame, "[data-dataset-table-empty] [data-dataset-add-column]");
  await frame.waitFor(`${node("[data-dataset-editor-status]")}.textContent === "已保存"`);
  const dataset = read();
  assert.equal(dataset.title, text);
  assert.equal(dataset.columns.length, 1);
  await assertNames(frame, [
    [title, "textbox", "标题"], ["[data-dataset-back]", "button", "返回数据表列表"],
    ["[data-dataset-table] [data-dataset-add-column]", "button", "加一列"],
    ["[data-column-remove]", "button", "删列"], ["[data-row-remove]", "button", "删行"],
  ]);
  await assertNamedButtons(frame);
  await activate(b, frame, "[data-dataset-back]");
  await frame.click(`[data-dataset-rows] [data-dataset-id="${dataset.id}"]`);
  await frame.waitFor(`${node(title)}.value === ${JSON.stringify(text)}`);
  assert.equal(read().id, dataset.id);
  await screenshot(b, "dataset-editor");
}

async function auditJelly(t: TestContext, b: Browser) {
  const frame = await pluginFrameBrowser(t, b, "jelly");
  const read = () => {
    const store = openJellyStore(b.homeDirectory);
    try { return store.read(); } finally { store.close(); }
  };
  const field = (name: string) => `[data-jelly-field="${name}"]`;
  const submit = "[data-jelly-item-form] button[type=submit]";
  const dialog = node("[data-jelly-item-dialog]");
  await navigate(b, frame, "jelly");
  await frame.waitFor("document.querySelector('[data-jelly-content] [data-jelly-day]')");
  await frame.click("[data-jelly-new]");
  await frame.waitFor(`${dialog}.open`);
  await assertNames(frame, [
    [field("start_time"), "InputTime", "开始时间"],
    [field("end_time"), "InputTime", "结束时间"], [field("notes"), "textbox", "备注"],
  ]);
  await assertNamedButtons(frame);
  await focus(frame, field("start_time"));
  for (let i = 0; i < 4 && await frame.evaluate(`document.activeElement === ${node(field("start_time"))}`); i++) await keyboard(b, "Tab");
  await frame.waitFor(`document.activeElement === ${node(field("end_time"))}`);
  await typeInto(b, frame, field("title"), "Workshop readout");
  await typeInto(b, frame, field("notes"), "Share the slides after the review.");
  // Native time controls split input into locale-dependent segments. Exercise focus via Tab and use known values for persistence.
  await frame.evaluate(`${node(field("start_time"))}.value = "09:30"; ${node(field("end_time"))}.value = "10:45"`);
  const date = await frame.evaluate<string>(`${node(field("end_date"))}.value`);
  const writes = postCounter(t, b, "/api/plugins/io.molis.work.jelly/commands");
  await typeInto(b, frame, field("end_date"), "2000-01-01");
  await activate(b, frame, submit);
  await frame.waitFor("!document.querySelector('[data-jelly-item-error]').hidden");
  assert.equal(writes(), 0);
  assert.equal(await frame.evaluate(`${node(field("notes"))}.value`), "Share the slides after the review.");
  await screenshot(b, "jelly-date-error");
  await typeInto(b, frame, field("end_date"), date);
  await activate(b, frame, submit);
  await frame.waitFor(`!${dialog}.open`);
  const [item] = read().items;
  assert.ok(item);
  assert.deepEqual([writes(), read().items.length, item.title, item.start_time, item.end_time, item.notes],
    [1, 1, "Workshop readout", 570, 645, "Share the slides after the review."]);
  await frame.click('[data-jelly-mode="list"]');
  await frame.click("[data-jelly-occurrence]");
  await frame.waitFor(`${dialog}.open`);
  assert.deepEqual(await frame.evaluate(`[${node(field("start_time"))}.value, ${node(field("end_time"))}.value, ${node(field("notes"))}.value]`),
    ["09:30", "10:45", "Share the slides after the review."]);
  await screenshot(b, "jelly-reopened");
}

async function auditFeed(t: TestContext, b: Browser, sourceId: string) {
  const frame = await pluginFrameBrowser(t, b, "feed");
  const add = ".feed-column-actions [data-feed-add-toggle]";
  const panel = node("[data-feed-sources-dialog]");
  const close = "[data-feed-sources-dialog] header [data-feed-sources-close]";
  await navigate(b, frame, "feed");
  await frame.click("[data-feed-rail-toggle]");
  await frame.click(`[data-feed-task="${sourceId}"]`);
  await frame.waitFor(`!document.querySelector('[data-feed-current-sync]').hidden`);
  await assertNames(frame, [[add, "button", "添加来源"], ["[data-feed-current-sync]", "button", "立即拉取"]]);
  await assertNamedButtons(frame);
  await activate(b, frame, add);
  await frame.waitFor(`!${panel}.hidden`);
  await assertNames(frame, [[close, "button", "关闭"]]);
  await assertNamedButtons(frame);
  await screenshot(b, "feed-add-source");
  await activate(b, frame, close);
  await frame.waitFor(`${panel}.hidden`);
  assert.equal(await frame.evaluate("document.querySelector('[data-feed-workbench]').dataset.selectedSource"), sourceId);
}

async function auditInbox(t: TestContext, b: Browser, entryId: string) {
  const frame = await pluginFrameBrowser(t, b, "inbox");
  const back = "[data-inbox-detail]:not([hidden]) [data-inbox-collapse]";
  const close = "[data-inbox-compose] header [data-inbox-compose-close]";
  await b.setViewport(390, 844);
  await navigate(b, frame, "inbox");
  await frame.click(`[data-inbox-row][data-inbox-entry-id="${entryId}"]`);
  await assertNames(frame, [[back, "button", "返回 Inbox 列表"]]);
  await assertNamedButtons(frame);
  await activate(b, frame, "[data-inbox-detail]:not([hidden]) [data-inbox-compose-open]");
  await frame.waitFor("document.querySelector('[data-inbox-compose]').open");
  await assertNames(frame, [[close, "button", "关闭"]]);
  await assertNamedButtons(frame);
  await screenshot(b, "inbox-compose");
  await activate(b, frame, close);
  await frame.waitFor("!document.querySelector('[data-inbox-compose]').open");
  assert.equal(await frame.evaluate("document.querySelector('[data-inbox-row].is-selected').dataset.inboxEntryId"), entryId);
  await activate(b, frame, back);
  await frame.waitFor(`!${node(back)} || !${node(back)}.getClientRects().length`);
}

test("B27-NAMES-01 · existing named Dataset, Jelly, Feed and Inbox controls", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  const project = b.projectId!;
  const feed = createLocalFeedApplication(b.store.db);
  const source = createLocalFeedSourceService(b.store.db, project).register({ kind: "web_query", query: "release readout", name: "Operations notes" }).source;
  const item = feed.ingestItem({ source, externalId: "control-name-material", title: "Workshop readout to verify",
    summary: "Slides and decisions from a pilot workshop", body: "The pilot workshop reviewed the release.", occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(project, item.item_id, "manual").entry;
  await b.setViewport(1024, 900);
  await t.test("Dataset title, table controls and reopening", s => auditDataset(s, b));
  await t.test("Jelly start and end times, notes and recovery", s => auditJelly(s, b));
  await t.test("Feed add-source and source header actions", s => auditFeed(s, b, source.source_id));
  await t.test("Inbox item and compose actions", s => auditInbox(s, b, entry.entry_id));
});

const paletteNames = {
  zh: [
    ["主题色", ["靛蓝", "蓝", "紫", "绿", "红"]],
    ["背景", ["柔白", "淡紫", "淡蓝", "炭黑"]],
    ["文字", ["深灰", "蓝灰", "柔白"]],
  ],
  en: [
    ["Accent", ["Indigo", "Blue", "Purple", "Green", "Red"]],
    ["Background", ["Off-white", "Pale purple", "Pale blue", "Charcoal"]],
    ["Text", ["Dark gray", "Blue gray", "Off-white"]],
  ],
} as const;

async function assertPalette(frame: Frame, locale: keyof typeof paletteNames) {
  const tree = await accessibleTree(frame);
  const names = paletteNames[locale].map(([roleName]) => {
    const group = tree.find(entry => entry.role?.value === "radiogroup" && entry.name?.value === roleName);
    assert.ok(group, roleName);
    const radios = (group.childIds ?? []).map(id => tree.find(entry => entry.nodeId === id)).filter(entry => entry?.role?.value === "radio");
    return radios.map(entry => entry?.name?.value);
  });
  assert.deepEqual(names, paletteNames[locale].map(([roleName, hues]) => hues.map(hue => `${roleName} · ${hue}`)));
}

const swatch = (group: string, color: string) => `[data-ppt-color-${group}] [data-ppt-swatch="${color}"]`;
const titleField = "[data-ppt-title]";
const pptMore = "[data-ppt-stage-workspace] .plugin-stage-more:not(.ppt-export-menu) > summary";
const pptSaved = (frame: Frame) => frame.waitFor("document.querySelector('[data-ppt-editor-status]').dataset.mwState === 'saved' && document.querySelector('[data-ppt=workbench]').getAttribute('aria-busy') === 'false'");
const checked = async (frame: Frame, selector: string) => (await axNode(frame, selector))?.properties?.find(property => property.name === "checked")?.value.value;

async function auditPptLabels(b: Browser, frame: Frame, locale: keyof typeof paletteNames) {
  await assertNames(frame, locale === "zh" ? [
    [titleField, "textbox", "标题"], ["[data-ppt-slide-title]", "textbox", "页标题"],
    ["[data-ppt-back]", "button", "返回演示稿列表"], ["[data-slide-move='-1']", "button", "上移"],
    ["[data-slide-move='1']", "button", "下移"], ["[data-slide-remove]", "button", "删除这一页"],
  ] : [
    [titleField, "textbox", "Title"], ["[data-ppt-slide-title]", "textbox", "Slide title"],
    ["[data-ppt-back]", "button", "Back to deck list"], ["[data-slide-move='-1']", "button", "Move up"],
    ["[data-slide-move='1']", "button", "Move down"], ["[data-slide-remove]", "button", "Remove slide"],
  ]);
  await activate(b, frame, "[data-ppt-outline-open]");
  await frame.waitFor("document.querySelector('[data-ppt-outline-dialog]').open");
  await assertNames(frame, [["header [data-ppt-outline-close]", "button", locale === "zh" ? "关闭" : "Close"]]);
  await assertNamedButtons(frame);
  await keyboard(b, "Escape");
  await frame.waitFor("!document.querySelector('[data-ppt-outline-dialog]').open");
}

async function assertPaletteFits(frame: Frame) {
  const covered = await frame.evaluate<string[]>(`[...document.querySelectorAll('[data-ppt-swatch]')].filter(button => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return !button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
  }).map(button => button.getAttribute('aria-label'))`);
  assert.deepEqual(covered, [], "all swatch centers are reachable on the current page");
}

test("B27-NAMES-02 / B27-NAMES-03 · PPT color names and saved selection", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  const frame = await pluginFrameBrowser(t, b, "ppt");
  const read = () => {
    const store = openPptStore(b.homeDirectory);
    try { return store.list(b.projectId!)[0]!; } finally { store.close(); }
  };
  await b.setViewport(1440, 900);
  await navigate(b, frame, "ppt");
  await frame.click("[data-ppt-new]");
  await pptSaved(frame);
  const id = read().id;
  const writes = postCounter(t, b, "/api/plugins/io.molis.work.ppt/ppt/" + id);
  const title = "Workshop decisions for the release";
  const background = swatch("background", "#FCFCFB");
  const defaultText = swatch("text", "#292A2E");
  const offWhiteText = swatch("text", "#FCFCFB");
  const reopen = async () => {
    await navigate(b, frame, "ppt");
    await frame.waitFor(`${node(titleField)}.value === ${JSON.stringify(title)}`);
  };
  await t.test("B27-NAMES-03 · same background and text color stay selected after an ordinary save and reopening", async () => {
    assert.equal(await checked(frame, background), "true");
    assert.equal(await checked(frame, defaultText), "true");
    await focus(frame, pptMore);
    await keyboard(b, "Tab");
    await frame.waitFor(`document.activeElement === ${node(titleField)}`);
    await typeInto(b, frame, titleField, title);
    await pptSaved(frame);
    assert.deepEqual([writes(), read().title, read().color_background, read().color_text], [1, title, "#fcfcfb", "#292a2e"]);
    await reopen();
    assert.deepEqual([await checked(frame, background), await checked(frame, defaultText)], ["true", "true"]);
  });

  for (const locale of ["zh", "en"] as const) {
    await b.setViewport(1440, 900);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: b.origin }, b.sessionId);
    await reopen();
    await t.test(`B27-NAMES-01 · existing PPT titles and slide actions · ${locale}`, () => auditPptLabels(b, frame, locale));
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await b.setViewport(width, height);
      for (const theme of ["light", "dark"]) {
        const variant = `${width}-${locale}-${theme}`;
        await t.test(`B27-NAMES-02 · all color names · ${variant}`, async () => {
          await b.evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
          await frame.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
          await frame.evaluate("document.querySelector('.ppt-workspace').scrollTop = 0");
          await screenshot(b, `ppt-${variant}`);
          await assertPaletteFits(frame);
          await assertNamedButtons(frame);
          await assertPalette(frame, locale);
        });
      }
    }
  }

  await t.test("B27-NAMES-03 · selecting the named off-white text radio with a key persists the intended color", async () => {
    await focus(frame, "[data-ppt-description]");
    for (const current of [swatch("primary", "#5e6ad2"), background, defaultText]) {
      await keyboard(b, "Tab");
      await frame.waitFor(`document.activeElement === ${node(current)}`);
    }
    await keyboard(b, "ArrowRight");
    await keyboard(b, "ArrowRight");
    await frame.waitFor(`document.activeElement === ${node(offWhiteText)}`);
    assert.equal(writes(), 1, "Tab and arrows move focus without a write");
    await keyboard(b, " ");
    await pptSaved(frame);
    assert.deepEqual([writes(), read().id, read().color_background, read().color_text], [2, id, "#fcfcfb", "#fcfcfb"]);
    assert.equal(await checked(frame, offWhiteText), "true");
    await frame.waitFor(`document.activeElement === ${node(offWhiteText)}`);
    await reopen();
    assert.deepEqual([await checked(frame, offWhiteText), await checked(frame, defaultText)], ["true", "false"]);
  });

  await t.test("B27-NAMES-03 · an out-of-date color edit stays in the draft until confirmed reload", async () => {
    const other = openPptStore(b.homeDirectory);
    const description = "An update from another editor";
    try { other.update(id, { description }, b.projectId!); } finally { other.close(); }
    await activate(b, frame, defaultText);
    await frame.waitFor("document.querySelector('[data-ppt-editor-status]').dataset.mwState === 'failed'");
    assert.deepEqual([writes(), read().color_text, await checked(frame, defaultText)], [3, "#fcfcfb", "true"]);
    await screenshot(b, "ppt-color-conflict");
    await activate(b, frame, pptMore);
    await activate(b, frame, "[data-ppt-reload]");
    await frame.waitFor("document.querySelector('[data-ppt-confirm]').open");
    await activate(b, frame, "[data-ppt-confirm] [data-confirm-ok]");
    await pptSaved(frame);
    assert.equal(await frame.evaluate(`${node("[data-ppt-description]")}.value`), description);
    assert.deepEqual([writes(), read().id, await checked(frame, offWhiteText), await checked(frame, defaultText)], [3, id, "true", "false"]);
  });
});
