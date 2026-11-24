import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2'-3 (specs/context-program §21.6, specs/context-program/side-shelf.md §6): the desktop's Shelf entries after Shelf moved into the side panel.
// The page runs the shell's real bootstrap (`NATIVE_DESKTOP_BOOTSTRAP_SCRIPT`, inlined in every page) against a stand-in Tauri
// bridge that records what the shell would be told. Opening Shelf names the plugin and lands where its declarations put it;
// the shell is told the Shelf tab's box while that tab shows, and nothing otherwise — from the top page only, never a frame.

const SHELF_TAB = "plugin:shelf/side";
const BRIDGE = `globalThis.__TAURI__ = { window:{getCurrentWindow:()=>({label:"main",isFullscreen:async()=>false,onResized:async()=>()=>{}})}, core: { invoke: (command, args) => {
  (window.top.__invokes ||= []).push({ command, args: JSON.parse(JSON.stringify(args ?? null)), top: window.top === window });
  return Promise.resolve(null);
} } };`;

test("ONB-22/29 Desktop receives adopted wheel and hotkeys from the active Shelf owner while the settings page is closed", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", {source:BRIDGE}, sessionId);
  await navigate(() => command("Page.navigate", {url:origin + "/projects/" + projectId + "/?desktop=1"}, sessionId));
  const bridge = "window.__invokes?.filter(event=>event.command==='shelf_sync_device_preferences').at(-1)?.args.settings";
  await waitFor(bridge + "?.drop_wheel_enabled === true");
  const idle = "performance.getEntriesByType('resource').filter(row=>new URL(row.name).pathname.endsWith('/view-revision') && new URL(row.name).pathname.includes('system.shelf')).length";
  const reads = await evaluate<number>(idle);
  await new Promise(resolve => setTimeout(resolve, 3250));
  assert.equal(await evaluate<number>(idle), reads, "an idle desktop waits for invalidation without polling Shelf");
  await evaluate(`(async()=>{
    const base="/api/platform/shelf/preferences/";
    const keys=["shelf.drop_wheel","shelf.hotkeys"];
    const {values}=await molisWorkRequest(base+"read",{method:"POST",body:{keys}});
    for(const {key,revision,value} of values){
      const set=key==="shelf.drop_wheel"?false:{...value,toggle:{...value.toggle,key_code:14}};
      await molisWorkRequest(base+"write",{method:"POST",body:{key,expected_revision:revision,layer:"personal",change:{set},request_id:crypto.randomUUID()}});
    }
  })()`);
  await waitFor(bridge + "?.drop_wheel_enabled === false && " + bridge + "?.hotkeys.toggle.key_code === 14");
});

test("ONB-22: a late Shelf settings reply cannot rebind an older desktop shortcut", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded");
  if (!b) return;
  const { web, command, sessionId, navigate, origin, projectId, evaluate, waitFor, click } = b;
  const api = "/api/platform/shelf", key = "shelf.hotkeys";
  type Chord = { key_code: number; carbon_modifiers: number };
  type Keys = Record<"toggle" | "capture" | "files", Chord>;
  const hotkeys = (await web.get<{ hotkeys: Keys }>(api + "/settings")).hotkeys;
  const initialCode = hotkeys.toggle.key_code === 14 ? 15 : 14;
  const adoptedCode = initialCode + 2;
  const { values: [initial] } = await web.post<{values: {revision: string}[]}>(api + "/preferences/read", { keys: [key] });
  await web.post(api + "/preferences/write", { key, layer: "personal", expected_revision: initial!.revision, request_id: "seed-shortcuts",
    change: { set: { ...hotkeys, toggle: { ...hotkeys.toggle, key_code: initialCode } } } });
  await command("Page.addScriptToEvaluateOnNewDocument", { source: BRIDGE }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/?desktop=1" }, sessionId));
  const calls = "window.__invokes.filter(e=>e.command==='shelf_sync_device_preferences')";
  const boundCode = calls + ".at(-1)?.args.settings?.hotkeys.toggle.key_code";
  await waitFor(boundCode + "===" + initialCode);
  await click("[data-directory-open=settings]");
  const entry = '[data-directory-panel=settings] [data-settings-section="shelf"]';
  await waitFor("document.querySelector(" + JSON.stringify(entry) + ")");
  await click(entry);
  const reset = "[data-shelf-hotkey-slot=toggle] [data-shelf-hotkey-reset]";
  await waitFor("document.querySelector(" + JSON.stringify(reset) + ")?.hidden===false");
  // Only delay delivery to the settings page. Its request has already committed when the scene writes B.
  await evaluate(`(() => {
    const fetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await fetch.apply(this,args);
      if (new URL(response.url).pathname.endsWith('/preferences/write') && !window.releaseFirstSave) {
        await new Promise(resolve => { window.releaseFirstSave=resolve; });
      }
      return response;
    };
  })()`);
  await click(reset);
  await waitFor("typeof window.releaseFirstSave==='function'");
  const {values: [current]} = await web.post<{values: {revision: string; value: Keys}[]}>(api + "/preferences/read", { keys: [key] });
  assert.ok(current);
  assert.equal(current.value.toggle.key_code, hotkeys.toggle.key_code, "the settings page committed its reset");
  await web.post(api + "/preferences/write", { key, expected_revision: current.revision, layer: "personal", request_id: "later-scene",
    change: { set: { ...current.value, toggle: { ...current.value.toggle, key_code: adoptedCode } } } });
  await waitFor(boundCode + "===" + adoptedCode);
  const count = await evaluate<number>("window.__invokes.length");
  await evaluate("window.releaseFirstSave()");
  await waitFor("window.__invokes.slice(" + count + ").some(e=>e.command==='shelf_hotkey_status')");
  assert.equal(await evaluate(boundCode), adoptedCode);
  assert.equal(await evaluate("window.__invokes.slice(" + count + ").some(e=>e.command==='shelf_apply_hotkeys')"), false);
});

test("DESK-SHELF-01 DESK-SHELF-02 the hotkey's Shelf opens its side tab, and the shell is told that tab's box only while it shows", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: BRIDGE }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-tabs] [data-side-tab]') && new URLSearchParams(location.search).get('desktop') === '1'", 15_000);
  const reports = "(window.__invokes || []).filter((call) => call.command === 'shelf_surface_changed')";
  const last = `${reports}.at(-1)?.args`;
  await waitFor(`${reports}.length > 0`);
  assert.equal(await evaluate(`${last}.panel`), null, "nothing of Shelf shows yet");

  // DESK-SHELF-01: the hotkey and the menu bar call molisWorkOpenShelf; it opens Shelf by name, into its side tab.
  await evaluate("globalThis.molisWorkOpenShelf()");
  await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tabs] [role=tab][aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(SHELF_TAB)}`, 8_000);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=shelf], [data-tab-workspace] [data-tab-plugin=shelf]')"), null, "nothing of Shelf opens in the work area");

  // DESK-SHELF-02: the shell is told where the Shelf tab is, as the page lays it out once the panel has settled.
  const box = `(() => { const r = document.querySelector('[data-side-body=${JSON.stringify(SHELF_TAB)}]').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`;
  await waitFor(`(() => { const p = ${last}?.panel, b = ${box}; return Boolean(p) && ['x', 'y', 'width', 'height'].every((k) => Math.abs(p[k] - b[k]) < 0.5); })()`, 8_000);
  const panel = await evaluate<{ x: number; width: number; height: number }>(`${last}.panel`);
  assert.ok(panel.width > 0 && panel.height > 0 && panel.x > 0, "a box on the right, not the whole window");
  assert.ok(await evaluate<boolean>(`${reports}.every((call) => call.top)`), "only the top page reports; a frame never does");

  // Another tab in the panel, then the panel closed: no Shelf box either way.
  await evaluate(`document.querySelector('[data-side-tabs] [role=tab][data-side-tab]:not([data-side-tab=${JSON.stringify(SHELF_TAB)}])').click()`);
  await waitFor(`${last}?.panel === null`, 8_000);
  await evaluate("globalThis.molisWorkOpenShelf()");
  await waitFor(`Boolean(${last}?.panel)`, 8_000);
  // The page collapses the side from the layout menu (收起右侧); the side has no close event of its own (07-1 S4b).
  await evaluate("document.body.dataset.sideOpen === 'true' && (document.querySelector('[data-layout-open]').click(), document.querySelector('[data-layout-action=side]').click())");
  await waitFor(`document.body.dataset.sideOpen === 'false' && ${last}?.panel === null`, 8_000);
});

for (const locale of ["zh", "en"] as const) test(`PG-026-S1-S3-5 PG-026-S1-S3-7 real desktop bootstrap shows ${locale} partial feedback outside Shelf without changing its tab, visibility or focus`, { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: BRIDGE }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${locale}&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
  await waitFor("typeof globalThis.molisWorkShelfNotice === 'function' && globalThis.molisWorkRequest?.toast && document.querySelector('[data-plugin-picker-toggle]')");
  assert.equal(await evaluate("document.documentElement.lang.startsWith(" + JSON.stringify(locale) + ")"), true);
  const message = "副本已收下，但未能登记原件；后续处理将无法核对原件是否变化。";
  const translated = locale === "en" ? "The copy was saved, but the original could not be registered. Later processing cannot check whether the original has changed." : message;
  const toast = "document.querySelector('[data-settings-toast], [data-toast]')";
  const state = `({open:document.body.dataset.sideOpen,
    tab:document.querySelector('[data-side-tabs] [role=tab][aria-selected=true]')?.dataset.sideTab ?? null,
    focus:document.activeElement === document.querySelector('[data-plugin-picker-toggle]')})`;
  await evaluate("window.__shelfNotices=[];window.addEventListener('molis:shelf-notice',event=>window.__shelfNotices.push(event.detail.message))");
  for (const opened of [false, true]) {
    if (opened) {
      await evaluate("globalThis.molisWorkOpenShelf()");
      await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tabs] [role=tab][aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(SHELF_TAB)}`);
      await waitFor(`document.querySelector('[data-side-body=${JSON.stringify(SHELF_TAB)}] iframe')`);
    } else {
      await evaluate("document.body.dataset.sideOpen === 'true' && (document.querySelector('[data-layout-open]').click(), document.querySelector('[data-layout-action=side]').click())");
      await waitFor("document.body.dataset.sideOpen === 'false'");
    }
    // Focus on a control in the bar, outside Shelf (the switcher; the bar's side button is gone since 07-1 S4b).
    await evaluate("document.querySelector('[data-plugin-picker-toggle]').focus()");
    const before = await evaluate(state);
    await evaluate(`globalThis.molisWorkShelfNotice(${JSON.stringify(message)},true,${JSON.stringify(message)})`);
    await waitFor(`${toast}?.classList.contains('is-visible') && ${toast}.textContent === ${JSON.stringify(translated)}`);
    assert.equal(await evaluate(`${toast}.ownerDocument === document && ${toast}.getBoundingClientRect().height > 0`), true, "the visible notice belongs to the top page, even when Shelf is an opaque iframe");
    assert.equal(await evaluate(`${toast}.dataset.mwState`), "partial");
    assert.equal(await evaluate(`${toast}.classList.contains('is-error')`), false);
    await evaluate("globalThis.molisWorkShelfRefresh();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await evaluate(`${toast}.classList.contains('is-visible')`), true, "the existing refresh does not erase the notice");
    assert.deepEqual(await evaluate(state), before, "feedback leaves the panel, selected tab and keyboard focus alone");
  }
  assert.deepEqual(await evaluate("window.__shelfNotices"), [message, message], "the existing event is retained once per notice");
  const beforeError = await evaluate(state);
  await evaluate("globalThis.molisWorkShelfNotice('文件未收下')");
  assert.equal(await evaluate(`${toast}.textContent`), "文件未收下");
  assert.equal(await evaluate(`${toast}.dataset.mwState`), "failed");
  assert.equal(await evaluate(`${toast}.classList.contains('is-error')`), true, "an omitted partial flag still means a real failure");
  assert.deepEqual(await evaluate(state), beforeError);
  const failure = "已收下 1 项，另有文件未收下：读取失败";
  const mixed = failure + "\n" + message;
  await evaluate(`globalThis.molisWorkShelfNotice(${JSON.stringify(mixed)},false,${JSON.stringify(message)})`);
  assert.equal(await evaluate(`${toast}.textContent`), failure + "\n" + translated, "the fixed warning is translated even after a dynamic native failure line");
  assert.equal(await evaluate(`${toast}.dataset.mwState`), "failed");
  assert.equal(await evaluate(`${toast}.classList.contains('is-error')`), true);
  assert.equal(await evaluate("window.__shelfNotices.at(-1)"), mixed, "the existing event retains its original payload");
  await evaluate(`globalThis.molisWorkShelfNotice(${JSON.stringify(message)},false)`);
  assert.equal(await evaluate(`${toast}.textContent`), message, "an unmarked diagnostic is displayed as given");
  assert.deepEqual(await evaluate(state), beforeError);
});
