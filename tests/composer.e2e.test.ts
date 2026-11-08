import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { FIELD_FIT_MAX, FIELD_FIT_ROOM, fieldHeight } from "@molis-ai/molis-work-design-system";
import { renderComposer, type MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { COMPOSER_AI_LABELS, COMPOSER_PLAIN_LABELS } from "./fixtures/composer-labels.js";
import { NOTE_KIND, composerMountPlugin, composerSourcePlugin, mountScript } from "./fixtures/composer-plugins.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// The unified input in a temporary Home (specs/unified-input-voice/implementation-plan.md §5 K2 row): the Workbench page the Host
// really sends, its `window.molisComposer`, and two ordinary test plugins: one registers a `composer_source`, the other mounts the
// composer with scene controls and its own submit adapter (tests/fixtures/composer-plugins.ts). Keys go in as CDP key events, an
// input method as a real composition. The rules themselves are tests/composer-rules.test.ts's and the Host's refusals
// tests/security-invariants-composer.test.ts's; this file is what a person sees of them.

const META = process.platform === "darwin" ? 4 : 2, SHIFT = 8;
const EVIDENCE = resolve(".impeccable/qa/review/unified-input-k2");

async function open(t: TestContext, locale: "zh" | "en" = "zh") {
  // The browser first: `after` hooks run in the order they were added, so it lets go of the page before the Home closes.
  const directory = await mkdtemp(join(tmpdir(), "composer-e2e-"));
  const browser = await ChromeHarness.start(directory, { describe: "JSON.stringify({status:document.querySelector('.mw-composer__status')?.textContent,state:document.querySelector('.mw-composer')?.dataset.state,menu:document.querySelector('.mw-compose__menu:not([hidden])')?.textContent})" });
  t.after(async () => { await browser?.close(); await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); });
  if (!browser) { t.skip("Chrome is required for the unified input"); return null; }
  const source = composerSourcePlugin(), mount = composerMountPlugin(source.reader);
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [source.definition, mount.definition] } });
  const project = await f.project("统一输入");
  const page = await browser.page();
  await page.command("Page.enable");
  await page.viewport(1440, 900);
  const path = `/projects/${encodeURIComponent(project.project_id)}/`;
  // These pages test a plugin's own composer. Since K3 the bar carries the Assistant's composer too (tests/assistant-composer.e2e.test.ts):
  // it is taken off the page once it is there, so `.mw-composer…` names the plugin's and nothing of the bar sits under its stage.
  const load = async (keepAssistant = false) => {
    await Promise.all([browser.event("Page.loadEventFired"), page.command("Page.navigate", { url: f.origin + "/locale?lang=" + locale + "&next=" + encodeURIComponent(path) })]);
    await page.wait("typeof window.molisComposer === 'function' && typeof window.molisWorkRequest === 'function' && Boolean(document.querySelector('[data-assistant-composer] .mw-composer'))");
    if (!keepAssistant) await page.evaluate("document.querySelector('[data-assistant-composer]').remove()");
  };
  await load();
  const key = async (modifiers = 0, code = 13) => {
    const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", ...enter, ...(modifiers ? {} : { text: "\r" }) });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", ...enter });
  };
  const type = (text: string) => page.command("Input.insertText", { text });
  const state = () => page.evaluate<{ text: string; status: string; state: string; files: string[] }>(`({ text: document.querySelector(".mw-composer__input").value,
    status: document.querySelector(".mw-composer__status")?.textContent ?? "", state: document.querySelector(".mw-composer")?.dataset.state ?? "",
    files: [...document.querySelectorAll(".mw-composer__files .mw-upload")].map(row => row.querySelector(":scope > span:not(.mw-mark)").textContent) })`);
  // `window.molisComposer` hands a document's first mount to the shared program (/assets/molis-work-composer.js) once it is in.
  const ready = (root: string) => page.wait(`globalThis.molisComposerProgram && document.querySelector(${JSON.stringify(root + " .mw-composer")})`);
  const mountPlain = async () => { await page.evaluate(mountScript(mount.id, COMPOSER_PLAIN_LABELS)); await ready("#composer-probe"); };
  return { f, project, source, mount, page, load, key, type, state, mountPlain, ready };
}

test("UIC-05 UIC-06 UIV-01 UIV-02 UIV-03 VUX-16: keys, the input method, one send per request and the field's height", { timeout: 120_000 }, async (t) => {
  const c = await open(t);
  if (!c) return;
  const { page, key, type, state, mount } = c;
  await c.mountPlain();
  await page.click(".mw-composer__input");
  // VUX-16: two lines to start, then the field grows to min(240px, 40% of the window) and scrolls inside, by fieldHeight().
  const measure = () => page.evaluate<{ h: number; scroll: number; client: number; min: number; window: number }>(`(() => { const f = document.querySelector(".mw-composer__input");
    return { h: f.getBoundingClientRect().height, scroll: f.scrollHeight, client: f.clientHeight, min: parseFloat(getComputedStyle(f).minHeight), window: innerHeight }; })()`);
  const empty = await measure();
  assert.equal(empty.min, 44, "the composer's own min-height: two 22px lines, no padding");
  assert.equal(Math.round(empty.h), empty.min);
  await type("把第 3 步的测试补上");
  // UIC-06: a plain Enter after one written line breaks it and says once how to send now.
  await key();
  assert.equal((await state()).text, "把第 3 步的测试补上\n", "Enter breaks the line");
  assert.match((await state()).status, /回车已改为换行。要发送请按 (⌘↵|Ctrl\+↵)/);
  assert.deepEqual(mount.sent, []);
  await page.click("[data-composer-status-action=hint]");
  assert.equal((await state()).status, "", "知道了 puts the hint away");
  await page.evaluate(`(() => { const f = document.querySelector(".mw-composer__input"); f.value = "第二行"; f.setSelectionRange(3, 3); f.dispatchEvent(new InputEvent("input", { bubbles: true })); })()`);
  await key();
  assert.doesNotMatch((await state()).status, /回车已改为换行/, "the hint is shown once, never again");
  await page.evaluate(`(() => { const f = document.querySelector(".mw-composer__input"); f.value = Array.from({ length: 40 }, (_, i) => "第 " + i + " 行").join("\\n"); f.dispatchEvent(new InputEvent("input", { bubbles: true })); })()`);
  const tall = await measure();
  assert.equal(Math.round(tall.h), Math.round(fieldHeight(tall.scroll, tall.min, Math.min(FIELD_FIT_MAX, tall.window * FIELD_FIT_ROOM))), "fieldHeight(content, min, max)");
  assert.ok(tall.scroll > tall.client, "past its max the field scrolls inside");
  // UIC-05 UIV-02: a composition open (Chinese input) takes ⌘/Ctrl+Enter for itself, by isComposing or keyCode 229.
  await page.evaluate(`(() => { const f = document.querySelector(".mw-composer__input"); f.value = ""; f.dispatchEvent(new InputEvent("input", { bubbles: true })); f.focus(); })()`);
  await page.command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 });
  await key(META);
  await key(META, 229);
  assert.deepEqual(mount.sent, [], "nothing goes while composing");
  await page.command("Input.insertText", { text: "测试" });
  assert.equal((await state()).text, "测试");
  // UIV-03: one send per request: the button locks while it is under way; ⌘↵ three times sends once.
  await page.evaluate("globalThis.composerHold = new Promise(resolve => { globalThis.composerRelease = resolve; }); undefined");
  await key(META); await key(META); await key(META);
  await page.wait("document.querySelector('.mw-composer')?.dataset.state === 'sending'");
  assert.equal(await page.evaluate("document.querySelector('[data-composer-send]').disabled"), true);
  await page.evaluate("globalThis.composerHold = null; globalThis.composerRelease()");
  await page.wait("document.querySelector('.mw-composer__input').value === '' && !document.querySelector('.mw-composer').dataset.state");
  assert.equal(mount.sent.length, 1, "three presses, one send");
  assert.equal(mount.sent[0]!.text, "测试");
  assert.match(mount.sent[0]!.request_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(mount.sent[0]!.controls, { tone: "plain", notify: "off" }, "scene controls go with the send by their ids");
});

test("UIV-04 UIV-14 UIV-15 VUX-17 VUX-18 UIC-07 UIC-10 UIC-11 S-composer-source-call items 3 4: drafts, sources, picks checked at send, late results", { timeout: 120_000 }, async (t) => {
  await mkdir(EVIDENCE, { recursive: true });
  const c = await open(t);
  if (!c) return;
  const { page, type, state, mount, source, project } = c;
  assert.equal(await page.evaluate("document.body.dataset.projectId"), project.project_id);
  await c.mountPlain();
  await page.click(".mw-composer__input");
  await type("写到一半的评论");
  // UIV-04 §3.4: the platform draft, keyed by project, installation, entry and conversation, is put back after a reload with a line saying so.
  const draftKey = `mw.composer.draft:${encodeURIComponent(project.project_id)}:${encodeURIComponent(mount.id)}:comment:c1`;
  await page.wait(`localStorage.getItem(${JSON.stringify(draftKey)})?.includes("写到一半的评论")`);
  await c.load();
  await c.mountPlain();
  await page.wait("document.querySelector('.mw-composer__restore')");
  assert.equal((await state()).text, "写到一半的评论", "the reloaded page's composer has the draft back");
  await page.click("[data-composer-clear]");
  assert.equal((await state()).text, "");
  assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(draftKey)})`), null, "清空草稿 removes it here too");
  // UIC-11: storage refusing writes is said in place; the text stays and still sends.
  await page.evaluate("globalThis.realSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }");
  await page.click(".mw-composer__input");
  await type("存不下也要能发");
  await page.wait("document.querySelector('.mw-composer__status')?.textContent.includes('草稿没能保存在本机')");
  assert.equal((await state()).text, "存不下也要能发");
  await page.evaluate("Storage.prototype.setItem = globalThis.realSet");
  await page.click("[data-composer-send]");
  await page.wait("document.querySelector('.mw-composer__input').value === ''");
  assert.equal(mount.sent.at(-1)!.text, "存不下也要能发");
  // VUX-17: ＋ lists the registered source by name; picking puts a reference in the strip, with where it came from.
  await page.evaluate(`globalThis.composerNear = { kind: ${JSON.stringify(NOTE_KIND)}, id: "n3" }`);
  await page.click("[data-composer-add]");
  await page.wait("document.querySelector('[data-composer-source]')");
  assert.match(await page.evaluate<string>("document.querySelector('[data-composer-source]').textContent"), /测试笔记/);
  await page.click("[data-composer-source]");
  await page.wait("document.activeElement?.matches('[data-composer-query]')");
  await type("访谈");
  await page.wait("document.querySelectorAll('[data-composer-pick]').length === 2");
  assert.deepEqual(source.seen.at(-1), { query: "访谈", limit: 20, near: { kind: NOTE_KIND, id: "n3" } }, "the source gets the query and its own kind's object");
  await page.click("[data-composer-pick='0']");
  assert.match((await state()).files.join(), /访谈记录.*测试笔记/);
  // Item 4, UIV-15: the target reads the pick again at send; one it cannot read stops the send with the reason in its row, and stays.
  source.reading(false);
  await page.click(".mw-composer__input");
  await type("看看这条访谈");
  await page.click("[data-composer-send]");
  await page.wait("document.querySelector('.mw-composer__files .is-failed')");
  const stopped = await state();
  assert.equal(stopped.text, "看看这条访谈", "the text stays");
  assert.match(stopped.status, /移除附不上的那一项再发/);
  assert.ok((await page.evaluate<string>("document.querySelector('.mw-composer__files .is-failed').textContent")).trim(), "the row says why");
  assert.equal(await page.evaluate("document.querySelector('[data-composer-send]').disabled"), true, "never sent without it unasked");
  const sends = mount.sent.length;
  await page.click(".mw-composer__files .mw-upload:nth-child(1) [data-composer-remove]");
  await page.click("[data-composer-send]");
  await page.wait("document.querySelector('.mw-composer__input').value === ''");
  assert.equal(mount.sent.length, sends + 1);
  assert.deepEqual(mount.sent.at(-1)!.materials, [], "sent once the person removed it");
  source.reading(true);
  // Item 3: an open source turned off answers its next query with 用不了, not with results.
  await page.click("[data-composer-add]");
  await page.wait("document.querySelector('[data-composer-source]')");
  await page.click("[data-composer-source]");
  await page.wait("document.querySelectorAll('[data-composer-pick]').length === 3");
  source.off();
  await type("周");
  await page.wait("document.querySelector('.mw-compose__menu:not([hidden]) .mw-composer__line')?.textContent.includes('现在用不了')");
  assert.equal(await page.evaluate("document.querySelectorAll('[data-composer-pick]').length"), 0, "no stale results stay listed");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert.equal(await page.evaluate("document.querySelector('.mw-compose__menu:not([hidden])')"), null, "Esc closes the composer's own menu");
  source.on();
  // VUX-18: files dropped in go to the page's upload; one it refuses says why in its row, and send waits until it is removed.
  await page.evaluate(`(() => { const box = document.querySelector(".mw-composer__box"), data = new DataTransfer();
    data.items.add(new File(["x"], "草图.png", { type: "image/png" })); data.items.add(new File(["x"], "setup.exe"));
    box.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data })); })()`);
  await page.wait("document.querySelectorAll('.mw-composer__files .mw-upload').length === 2 && document.querySelector('.mw-composer__files .is-failed')");
  assert.deepEqual((await state()).files, ["草图.png", "setup.exe这里不收可执行文件"]);
  assert.equal(await page.evaluate("document.querySelector('[data-composer-send]').disabled"), true);
  await page.screenshot(join(EVIDENCE, "plain-strip-zh-1440-light.png"));
  await page.click(".mw-composer__files .mw-upload:nth-child(2) [data-composer-remove]");
  await page.click(".mw-composer__files .mw-upload:nth-child(1) [data-composer-remove]");
  // `/` on an empty line opens this page's commands; the `/` is taken out once one is chosen.
  await page.click(".mw-composer__input");
  await type("/");
  await page.wait("document.querySelector('[data-composer-command]')");
  await page.click("[data-composer-command='0']");
  assert.deepEqual(await page.evaluate("globalThis.composerCommands"), ["sum"]);
  assert.equal((await state()).text, "");
  // UIC-07: an outcome for a mount that was replaced is dropped; the new mount's box is not touched.
  await type("迟到的结果");
  await page.evaluate("globalThis.composerHold = new Promise(resolve => { globalThis.composerRelease = resolve; }); undefined");
  await page.click("[data-composer-send]");
  await page.wait("document.querySelector('.mw-composer')?.dataset.state === 'sending'");
  await c.mountPlain();
  assert.equal((await state()).state, "", "the new mount draws its own state");
  await page.evaluate("globalThis.composerHold = null; globalThis.composerRelease(); new Promise(resolve => setTimeout(resolve, 300))");
  const after = await state();
  assert.equal(after.text, "迟到的结果", "the replaced mount's sent outcome did not clear the new box");
  assert.equal(after.state, "");
  // UIC-10: removing the plugin from the project leaves none of its drafts on this machine.
  await page.evaluate("globalThis.composerHandle.insert('！')");
  await page.wait(`localStorage.getItem(${JSON.stringify(draftKey)}) !== null`);
  await page.evaluate(`document.dispatchEvent(new CustomEvent("molis-work:plugins-changed", { detail: { came: [], gone: [${JSON.stringify(mount.id)}], next: document, failed: false } }))`);
  assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(draftKey)})`), null);
  await page.evaluate("globalThis.composerHandle.destroy()");
  // UIC-10 §3.4: at start the Workbench sends its draft keys (never their text) once; those of a project no longer in the Home go,
  // a framed page's among them; this project's own stays.
  const deleted = `mw.composer.draft:p-deleted:${encodeURIComponent(mount.id)}:comment:c1`, framed = `molis-plugin-page:h:${mount.id}:p-deleted:${deleted}`;
  await page.evaluate(`[${JSON.stringify(deleted)}, ${JSON.stringify(framed)}, ${JSON.stringify(draftKey)}].forEach(key => localStorage.setItem(key, JSON.stringify({ text: "留着", at: "2026-11-08T03:00:00.000Z" })))`);
  await c.load();
  await page.wait(`localStorage.getItem(${JSON.stringify(deleted)}) === null && localStorage.getItem(${JSON.stringify(framed)}) === null`);
  assert.notEqual(await page.evaluate(`localStorage.getItem(${JSON.stringify(draftKey)})`), null, "this project's own draft stays");
});

/** The system search as the page asks it, answered by the test: each request's body is kept, `searchHits` is the answer. */
const SEARCH_STUB = `(() => {
  const real = window.fetch;
  globalThis.searchAsked = []; globalThis.searchHits = [];
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.endsWith("/api/search/query")) return real(input, init);
    globalThis.searchAsked.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ status: "ready", hits: globalThis.searchHits, next_cursor: null, sources: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
})()`;
const searchHit = (id: string, title: string, plugin: string) => ({ hit_id: id, subject: { kind: NOTE_KIND, id }, project_id: null, plugin_id: "io.molis.work.example.composernotes", plugin_title: plugin,
  source: { capability_id: "composernotes.search", version: 1, provider_id: "composernotes" }, title, snippet: title, highlights: [], revision: "r7", updated_at: null, open: null,
  locator: { field: "title", offset: 0, length: title.length, text: title } });

test("UIV-14 §3.3: `@` in the text is the system search inside the component; a hit goes to the strip with its plugin and the `@words` come out", { timeout: 120_000 }, async (t) => {
  await mkdir(EVIDENCE, { recursive: true });
  const c = await open(t);
  if (!c) return;
  const { page, type, state, mount } = c;
  await page.evaluate(SEARCH_STUB);
  await c.mountPlain();
  await page.click(".mw-composer__input");
  await type("对照 ");
  await type("@");
  assert.equal(await page.evaluate("document.querySelector('.mw-compose__menu:not([hidden])')"), null, "a bare @ has nothing to look for yet; the ＋ menu does not open");
  await page.evaluate(`globalThis.searchHits = ${JSON.stringify([searchHit("n1", "访谈记录", "测试笔记"), searchHit("n2", "访谈提纲", "测试笔记")])}`);
  await type("访谈");
  await page.wait("document.querySelectorAll('[data-composer-mention]').length === 2");
  assert.deepEqual(await page.evaluate("globalThis.searchAsked"), [{ query: "访谈", scope: "all", limit: 8 }], "one search for the words after @, as the search palette asks it");
  assert.match(await page.evaluate<string>("document.querySelector('[data-composer-mention]').textContent"), /访谈记录.*测试笔记/, "each hit says which plugin it is from");
  await page.screenshot(join(EVIDENCE, "plain-mention-zh-1440-light.png"));
  // Down from the text goes into the hits; choosing one takes the @words out and puts the reference in the strip.
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
  assert.equal(await page.evaluate("document.activeElement?.dataset.composerMention"), "0");
  await page.click("[data-composer-mention='1']");
  assert.deepEqual([(await state()).text, (await state()).files], ["对照 ", ["访谈提纲测试笔记"]]);
  assert.equal(await page.evaluate("document.activeElement?.matches('.mw-composer__input')"), true, "focus is back in the text");
  // A space ends the words; nothing found says so.
  await page.evaluate("globalThis.searchHits = []");
  await type("@");
  await type("无");
  await page.wait("document.querySelector('.mw-compose__menu:not([hidden]) .mw-composer__line')?.textContent.includes('没有找到')");
  await type(" ");
  assert.equal(await page.evaluate("document.querySelector('.mw-compose__menu:not([hidden])')"), null, "a space after the words closes it");
  await type("就这些");
  await page.click("[data-composer-send]");
  await page.wait("document.querySelector('.mw-composer__input').value === ''");
  assert.deepEqual(mount.sent.at(-1)!.materials, [{ kind: "material", ref: { subject: { kind: NOTE_KIND, id: "n2" }, pin: { mode: "current", read_revision: "r7" } }, title: "访谈提纲",
    source: { capability_id: "composernotes.search", version: 1, provider_id: "composernotes" } }], "the hit goes as a pinned reference, read again by its owner at send");
});

test("§3.1: the program is one shared file fetched on the first mount; one that cannot load leaves the first screen and says so", { timeout: 120_000 }, async (t) => {
  const c = await open(t);
  if (!c) return;
  const { page } = c;
  const fetched = () => page.evaluate<number>("performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/assets/molis-work-composer.js')).length");
  // K3: a project page mounts the Assistant's composer in the bar at once, so the program comes with the page's first mount, once.
  await page.wait("typeof globalThis.molisComposerProgram !== 'undefined'");
  assert.equal(await fetched(), 1, "the bar's Assistant is the page's first mount: the program is fetched once for it");
  // Cannot be fetched: the first screen the page drew stays, can be typed into, and its status line says why; send waits.
  await page.command("Network.enable");
  await page.command("Network.setBlockedURLs", { urls: ["*molis-work-composer.js*"] });
  await c.load(true);
  assert.equal(await page.evaluate("typeof globalThis.molisComposerProgram"), "undefined");
  await page.wait("document.querySelector('[data-assistant-composer] .mw-composer__status')");
  assert.match(await page.evaluate<string>("document.querySelector('[data-assistant-composer] .mw-composer__status').textContent"), /现在用不了/, "the Assistant's first screen stays and says so");
  await page.evaluate("document.querySelector('[data-assistant-composer]').remove()");
  const first = renderComposer({ kind: "plain", labels: COMPOSER_PLAIN_LABELS, placeholder: "写评论…" });
  await page.evaluate(`(() => { const root = document.createElement("div"); root.id = "composer-first"; root.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000";
    root.innerHTML = ${JSON.stringify(first)}; document.body.append(root);
    globalThis.firstHandle = window.molisComposer(root, { kind: "plain", labels: ${JSON.stringify(COMPOSER_PLAIN_LABELS)}, entry: "comment", draft: { conversation: "first" }, submit: async () => ({ state: "sent" }) }); })()`);
  await page.wait("document.querySelector('#composer-first .mw-composer__status')");
  assert.equal(await page.evaluate("document.querySelector('#composer-first .mw-composer__status').textContent"), "评论 现在用不了");
  assert.equal(await page.evaluate("document.querySelector('#composer-first [data-composer-send]').disabled"), true);
  await page.click("#composer-first .mw-composer__input");
  await c.type("字还能写");
  assert.equal(await page.evaluate("document.querySelector('#composer-first .mw-composer__input').value"), "字还能写");
  // The next mount tries again; once it is in, every mount is the program's own and the file is fetched once.
  await page.command("Network.setBlockedURLs", { urls: [] });
  await c.mountPlain();
  const once = await fetched();
  assert.ok(once >= 1);
  await page.evaluate(mountScript(c.mount.id, COMPOSER_PLAIN_LABELS));
  assert.equal(await page.evaluate("document.querySelectorAll('#composer-probe .mw-composer').length"), 1, "mounted at once, the same root replaced");
  assert.equal(await fetched(), once, "no fetch for the mounts after it");
});

test("§3.1: a sandboxed plugin frame fetches the program only once its page mounts a composer; one it cannot fetch keeps the first screen and says so", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let asked = 0, refuse = false;
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    // Since K3 the Workbench page itself fetches the program for the bar's Assistant (same-origin); the sandboxed frame's own
    // request comes from its opaque origin, and only those are counted.
    if (request.url === "/assets/molis-work-composer.js") {
      if (request.headers["sec-fetch-site"] !== "same-origin") asked += 1;
      if (refuse) { response.writeHead(503, { "content-type": "text/plain" }); response.end(); return; }
    }
    for (const handler of handlers) handler.call(browser.server, request, response);
  });
  const lingguang = async () => {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
    await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
    await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
    await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  };
  // The plugin draws the first screen itself (renderComposer, from its own SDK) and mounts on it, as a plugin page does.
  const first = renderComposer({ kind: "plain", labels: COMPOSER_PLAIN_LABELS, placeholder: "写评论…" });
  const mount = `(() => { const root = document.createElement("div"); root.id = "probe"; root.innerHTML = ${JSON.stringify(first)}; document.body.prepend(root);
    globalThis.probe = window.molisComposer(root, { kind: "plain", labels: ${JSON.stringify(COMPOSER_PLAIN_LABELS)}, entry: "comment", draft: { conversation: "c1" }, submit: async () => ({ state: "sent" }) }); })()`;
  await lingguang();
  assert.equal(asked, 0, "a frame whose page mounts no composer does not fetch the program");
  await child.evaluate(mount);
  await child.waitFor("typeof globalThis.molisComposerProgram === 'function'");
  assert.equal(asked, 1, "the frame's CSP lets the one shared file in");
  assert.equal(await child.evaluate("document.querySelector('#probe .mw-composer__status')"), null, "mounted, nothing to say");
  refuse = true;
  await lingguang();
  await child.evaluate(mount);
  await child.waitFor("document.querySelector('#probe .mw-composer__status')?.textContent === '评论 现在用不了'");
  assert.equal(await child.evaluate("document.querySelector('#probe [data-composer-send]').disabled"), true, "send waits");
  assert.equal(await child.evaluate("typeof globalThis.molisComposerProgram"), "undefined");
  assert.equal(await child.evaluate("document.querySelector('[data-work-surface=lingguang]').hidden"), false, "the plugin's page goes on");
});

const AI_EN: MwComposerAiLabels = {
  input: "Message to the Assistant", send: "Send", sendTitle: "Send (⌘↵)", add: "Add files and materials", more: "More",
  files: "Files and images", filesHint: "Pick from this computer, or drop them into the box", dropRefused: "Only files go here", commands: "Commands",
  searching: "Looking…", nothing: "Nothing found", unavailable: "{name} is unavailable now", reading: "Reading {name}", remove: "Remove {name}", retryFile: "Retry {name}",
  blocked: "Remove the item that cannot attach, then send", restored: "Restored your unsent draft · {time}", clear: "Clear draft",
  unsaved: "The draft could not be saved on this computer; your text is still here and can be sent",
  enterHint: "Enter now starts a new line. To send, press {keys}", enterHintDismiss: "Got it", notice: "Note", sending: "Sending", sendingText: "Sending…",
  failed: "Not sent", retry: "Retry", unknown: "Unconfirmed", unknownText: "Could not confirm it arrived; do not send it again yet", check: "Check",
  notSent: "Checked: it did not arrive. Your text is still here",
  to: "To:", stop: "Stop", stopTitle: "Stop this turn", delivery: "Choose how it is delivered", deliveryGroup: "Delivery",
  modes: {
    "next-boundary": { name: "Add", title: "Add (⌘↵)", description: "Read once the current reply or batch of tools ends; nothing is interrupted" },
    interrupt: { name: "Interrupt and redirect", title: "Interrupt and redirect", description: "Drops the reply being written and follows this instead; what is done stays done" },
    "after-run": { name: "Next turn", title: "Next turn (⌘⇧↵)", description: "Queued for the start of the next turn you begin" },
  },
  unsupported: "This receiver does not take this delivery", running: "Running", runningText: "Working on this turn · sending again adds to it",
  queued: "This turn just ended; kept for the next one", replayed: "This was already sent; it was not sent again",
};
const AI_WORDS = {
  zh: { labels: COMPOSER_AI_LABELS, refused: "这个对象不支持打断：它一次只做完一整轮", plan: "先计划", act: "直接做", web: "联网", mode: "方式", text: "顺便把失败截图也附上", queued: /这一轮刚结束，留到下一轮/ },
  en: { labels: AI_EN, refused: "This receiver cannot be interrupted: it finishes a whole turn at once", plan: "Plan first", act: "Just do it", web: "Web", mode: "Mode", text: "Attach the failure screenshot too", queued: /kept for the next one/ },
} as const;

const aiScript = (words: (typeof AI_WORDS)["zh" | "en"]) => `(() => {
  let stage = document.getElementById("composer-stage");
  if (!stage) { stage = document.createElement("main"); stage.id = "composer-stage"; stage.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;align-content:end;justify-items:center;padding:24px 16px;background:var(--page);overflow:auto"; document.body.append(stage); }
  const root = document.getElementById("composer-ai") || stage.appendChild(Object.assign(document.createElement("div"), { id: "composer-ai" })); root.style.cssText = "width:min(640px,100%)";
  globalThis.aiSent = [];
  globalThis.aiHandle = window.molisComposer(root, {
    kind: "ai", labels: ${JSON.stringify(words.labels)}, entry: "assistant", draft: { conversation: "work-1" },
    receiver: () => ({ label: "Coding · 注册接口", reset: () => {} }),
    delivery: () => ({ "next-boundary": { available: true }, interrupt: { available: false, reason: ${JSON.stringify(words.refused)} }, "after-run": { available: true } }),
    stop: async () => { globalThis.aiStopped = true; },
    controls: [{ kind: "select", id: "mode", label: ${JSON.stringify(words.mode)}, value: "plan", options: [{ value: "plan", label: ${JSON.stringify(words.plan)} }, { value: "do", label: ${JSON.stringify(words.act)} }] },
      { kind: "toggle", id: "web", label: ${JSON.stringify(words.web)}, on: true }],
    attachments: { upload: async (file) => ({ state: "attached", ref: "u:" + file.name, title: file.name }) },
    submit: async (input) => { globalThis.aiSent.push(input); return { state: "sent", receipt: { input_id: "i" + globalThis.aiSent.length, replayed: false, delivered: input.delivery === "after-run" ? "queued" : "run" } }; },
  });
  globalThis.aiHandle.setRunning(true);
})()`;

for (const locale of ["zh", "en"] as const) {
  test(`UIC-08 UIV-11 UIV-16 UIV-17: the AI layer: receiver, deliveries with reasons, stop, at three widths and both themes (${locale})`, { timeout: 150_000 }, async (t) => {
    await mkdir(EVIDENCE, { recursive: true });
    const c = await open(t, locale);
    if (!c) return;
    const { page, key, type } = c, words = AI_WORDS[locale];
    await page.evaluate(aiScript(words));
    await c.ready("#composer-ai");
    assert.match(await page.evaluate<string>("document.querySelector('.mw-composer__to').textContent"), /Coding · 注册接口/);
    assert.equal(await page.evaluate("document.querySelector('[data-composer-voice]')"), null, "no microphone on a page that takes no voice");
    await page.click(".mw-composer__input");
    await type(words.text);
    // UIC-08: while it runs the send is 补充; ▾ shows every mode, the refused one with its reason as its line, not choosable.
    await page.click("[data-compose-menu-toggle]");
    await page.wait("document.querySelector('[data-composer-delivery=interrupt]')");
    const items = await page.evaluate<Array<{ mode: string; disabled: boolean; named: string; desc: string; labelled: string }>>(`[...document.querySelectorAll("[data-composer-delivery]")].map(item => ({
      mode: item.dataset.composerDelivery, disabled: item.disabled, labelled: item.getAttribute("aria-labelledby"),
      named: document.getElementById(item.getAttribute("aria-labelledby")).textContent, desc: document.getElementById(item.getAttribute("aria-describedby")).textContent }))`);
    assert.deepEqual(items.map((item) => [item.mode, item.disabled, item.named]), [["next-boundary", false, words.labels.modes["next-boundary"].name],
      ["interrupt", true, words.labels.modes.interrupt.name], ["after-run", false, words.labels.modes["after-run"].name]]);
    assert.equal(items[1]!.desc, words.refused, "the receiver's own reason, not a generic one");
    assert.match(items[0]!.labelled, /^mw-composer-\d+-delivery-next-boundary-label$/, "item hooks carry the composer's own id");
    assert.equal(await page.evaluate("document.querySelector('[data-composer-delivery]:not(:disabled)') === document.activeElement"), true, "the menu takes focus on its first choosable item");
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await page.viewport(width, height, width < 600);
      for (const theme of ["light", "dark"] as const) {
        await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: theme }] });
        await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        await page.screenshot(join(EVIDENCE, `ai-running-menu-${locale}-${width}-${theme}.png`));
      }
      const layout = await page.evaluate<{ overflow: boolean; menuBottom: number; composerTop: number; menuLeft: number; menuRight: number; descLines: number[] }>(`(() => {
        const menu = document.querySelector(".mw-compose__menu:not([hidden])").getBoundingClientRect(), shell = document.querySelector(".mw-composer").getBoundingClientRect();
        const lines = [...document.querySelectorAll(".mw-compose__menu:not([hidden]) [id$=-desc]")].map(line => Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight)));
        return { overflow: document.documentElement.scrollWidth > innerWidth, menuBottom: menu.bottom, composerTop: shell.top, menuLeft: menu.left, menuRight: menu.right, descLines: lines }; })()`);
      assert.equal(layout.overflow, false, `${width}: no sideways scroll`);
      assert.ok(layout.menuBottom <= layout.composerTop, `${width}: the menu opens above the whole composer, not over its receiver row`);
      assert.ok(layout.menuLeft >= 0 && layout.menuRight <= width, `${width}: the menu stays on screen`);
      assert.ok(layout.descLines.every((lines) => lines >= 1 && lines <= 3), `${width}: a description wraps, never cut (${layout.descLines})`);
    }
    await page.viewport(1440, 900);
    // UIV-17: the menu's choice is this send's only: 下一轮再做 goes as after-run and its receipt says it waits; the next ⌘↵ is 补充 again.
    await page.click("[data-composer-delivery=after-run]");
    await page.wait("globalThis.aiSent.length === 1");
    assert.equal(await page.evaluate("globalThis.aiSent[0].delivery"), "after-run");
    assert.match(await page.evaluate<string>("document.querySelector('.mw-composer__status').textContent"), words.queued, "a queued receipt says so");
    await type("再补一句");
    await key(META);
    await page.wait("globalThis.aiSent.length === 2");
    assert.equal(await page.evaluate("globalThis.aiSent[1].delivery"), "next-boundary");
    assert.deepEqual(await page.evaluate("globalThis.aiSent[1].controls"), { mode: "plan", web: "on" });
    // ⌘⇧↵ is 下一轮再做 while a turn runs; with nothing running there is no turn to queue behind, so it sends nothing.
    await type("下一轮");
    await key(META | SHIFT);
    await page.wait("globalThis.aiSent.length === 3");
    assert.equal(await page.evaluate("globalThis.aiSent[2].delivery"), "after-run");
    await page.click("[data-composer-stop]");
    await page.wait("globalThis.aiStopped === true");
    await page.evaluate("globalThis.aiHandle.setRunning(false)");
    assert.equal(await page.evaluate("document.querySelector('[data-composer-stop]')"), null, "stop is there only while a turn runs");
    // Nothing running: the next turn is now, so ⌘⇧↵ is a plain send, with no delivery.
    await type("新的一轮");
    await key(META | SHIFT);
    await page.wait("globalThis.aiSent.length === 4");
    assert.equal(await page.evaluate("globalThis.aiSent[3].text"), "新的一轮");
    assert.equal(await page.evaluate("'delivery' in globalThis.aiSent[3]"), false);
    // 390: the scene controls fold behind 更多 and open above it.
    await page.viewport(390, 844, true);
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.mw-composer__controls')).display"), "none");
    await page.click("[data-composer-more]");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.mw-composer__controls')).display"), "flex");
    await page.screenshot(join(EVIDENCE, `ai-more-${locale}-390-light.png`));
  });
}
