import assert from "node:assert/strict";
import test from "node:test";
import { openAuditBrowser } from "./fixtures/workbench-audit-browser.js";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { feedManifest, feedSourceActions, feedQueryActions } from "@molis-ai/molis-work-plugin-feed";
import { openTestHome } from "./fixtures/test-home.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("W1-18-TAB-FORMAT-01: real item tabs, collapsed user groups and a nested split restore; unsupported stored tabs are discarded instead of converted", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t, true); if (!browser) return;
  await browser.setViewport(1440, 1000);
  const paneReads: Array<{ url: string; started: number; finished?: number }> = [];
  const observePane = (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => {
    if (request.method !== "GET" || !request.url?.includes("workbenchPane=")) return;
    const read = { url: request.url, started: Date.now(), finished: undefined as number | undefined }; paneReads.push(read); if (paneReads.length > 12) paneReads.shift();
    response.once("finish", () => { read.finished = Date.now(); });
  };
  browser.server?.on("request", observePane);
  t.after(() => { browser.server?.off("request", observePane); });
  await browser.click('[data-plugin-strip] [data-plugin-id="goals"]');
  await browser.waitFor("document.querySelector('.tree-node[data-select-goal=CORE]')?.getClientRects().length > 0", 15_000);
  await browser.openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await browser.waitFor("document.querySelector('.tab-item[aria-current][data-item-id=CORE]')");
  await browser.evaluate("document.querySelector('.tab-item[aria-current] .tab-item-trigger').focus()");
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 }, browser.sessionId);
  await browser.waitFor("document.querySelector('[data-workspace-tab-menu]').matches(':popover-open')");
  await browser.click("[data-tab-menu-action=new-group]");
  await browser.click(".tab-group-label");
  await browser.waitFor("!!document.querySelector('.tab-group[data-collapsed=true]')");
  await browser.click("[data-layout-open]"); await browser.click('[data-layout-split="right"]');
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const key = "molis-work-tab-workspace:" + browser.projectId;
  await browser.evaluate(`(() => { const state=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));
    document.querySelector('[data-tab-pane="'+state.focusedPaneId+'"] [data-tab-edge=bottom]').click(); })()`);
  try { await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 3"); }
  catch (error) {
    const state = await browser.command('Runtime.evaluate', { expression: `(()=>({stage:'nested split after bottom edge click',saved:localStorage.getItem(${JSON.stringify(key)}),panes:[...document.querySelectorAll('[data-tab-pane]')].map(p=>({id:p.dataset.tabPane,focused:p.classList.contains('is-focused'),box:p.getBoundingClientRect().toJSON()})),frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({src:f.src,hidden:f.hidden,pane:f.dataset.paneOwner,tab:f.dataset.paneTab,ready:f.contentDocument?.readyState}))}))()`, returnByValue: true }, browser.sessionId, 1500).catch(observation => ({ unavailable: String(observation) }));
    t.diagnostic('T405 current tabs nested split failed ' + JSON.stringify({ paneReads, state }));
    throw error;
  }
  const saved = await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`);
  const before = JSON.parse(saved) as { panes: Array<{ tabs: Array<{ kind: string; itemId?: string }>; groups: Array<{ collapsed: boolean }>; viewPlugin?: string | null }> };
  assert.equal(before.panes.length, 3);
  assert.ok(before.panes.every(pane => pane.tabs.some(tab => tab.kind === "item" && tab.itemId === "CORE")));
  assert.ok(before.panes.some(pane => pane.groups.some(group => group.collapsed)));
  assert.equal(await browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).layout.tree.children[1].direction`), "column");
  await browser.reloadPage();
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 3", 15_000);
  assert.deepEqual(JSON.parse(await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)), JSON.parse(saved));
  assert.equal(await browser.evaluate("document.querySelector('.tab-item[data-tab-kind=mother], .tab-item[data-preview]')"), null);
  await browser.waitFor("document.querySelectorAll('.tab-content-frame').length === 3", 15_000);
  await browser.waitFor("[...document.querySelectorAll('.tab-content-frame')].every(frame=>frame.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE')", 15_000);

  for (const change of [
    "tab.kind='mother'", "tab.preview=true", "pane.collapsed=true",
    "tab.plugin='task';tab.kind='task';tab.goalId='CORE';delete tab.itemId",
    "tab.goalView='canvas'",
  ]) {
    await browser.evaluate(`(() => { const stored=${saved},pane=stored.panes[0],tab=pane.tabs.find(row=>row.kind==='item');${change};
      localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored)); })()`);
    await browser.reloadPage();
    await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 15_000);
    const current = JSON.parse(await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)) as typeof before;
    assert.equal(current.panes.length, 1, change);
    // 07-S2 (口径 3, 4): the project home is no longer a tab; a fresh workspace is one pane with no tab and no plugin page.
    assert.ok(current.panes.every(pane => pane.tabs.length === 0 && pane.viewPlugin === null), change + " starts from current Home rather than converting the old item");
    assert.equal(await browser.evaluate("document.querySelector('.tab-item[data-tab-kind=mother], .tab-item[data-preview]')"), null);
  }

  // 口径 4 (07-S1 review B1): a plugin id is a value, not the shape. A tab of a plugin neither this build nor Home knows (one
  // uninstalled from Home, or named before a rename) is read as it is: the three panes and the nested split stay, the other
  // tabs are where they were, and that tab is drawn removed.
  await browser.evaluate(`(() => { const stored=${saved},tab=stored.panes[0].tabs.find(row=>row.kind==='item');tab.plugin='uninstalled-plugin';
    localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored)); })()`);
  await browser.reloadPage();
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 3 && document.querySelector('.tab-item[data-plugin=uninstalled-plugin][data-tab-removed]')", 15_000);
  const kept = JSON.parse(await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)) as typeof before & { layout: unknown };
  const ids = (state: typeof before) => state.panes.map(pane => pane.tabs.filter(tab => tab.kind !== "plugin").map(tab => tab.itemId ?? tab.kind));
  assert.deepEqual(ids(kept), ids(before), "every pane keeps its tabs in their places");
  assert.deepEqual(kept.layout, (JSON.parse(saved) as { layout: unknown }).layout, "the split is the same");
  assert.ok(kept.panes[0].tabs.some(tab => (tab as { plugin?: string }).plugin === "uninstalled-plugin"), "the unknown plugin's tab is still saved");
});

test("personal Home uses the bottom navigation while Goals retains its current plugin group", { timeout: 90_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  await browser.setViewport(1440, 1000);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/personal/" }, browser.sessionId));
  await browser.waitFor("document.body.dataset.projectId === 'personal' && document.body.dataset.desktopSurface === 'home'", 15_000);

  const duplicatePrimaryEntry = "[data-titlebar-tabs] :is([data-plugin=home], .tab-view-chip)";
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(duplicatePrimaryEntry)})`), null);
  assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=home]'))"), true);
  assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=goals]'))"), true);

  await browser.click('[data-plugin-strip] [data-plugin-id="goals"]');
  // PTG-01/PTG-07: the current plugin tab replaces the removed location chip.
  await browser.waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] [data-plugin-group=goals] .tab-item[aria-current][data-tab-kind=plugin]')", 15_000);
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(duplicatePrimaryEntry)})`), null);
  await browser.waitFor("document.querySelector('[data-create-dialog]')?.open === true");
  await browser.click('[data-create-dialog] [data-close-create]');
  await browser.waitFor("document.querySelector('[data-create-dialog]')?.open === false");
  await browser.click('[data-plugin-strip] [data-plugin-id="home"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'home' && !document.querySelector('[data-titlebar-tabs] [data-plugin=home]')", 15_000);
  await browser.click('[data-titlebar-tabs] .tab-item[data-plugin="goals"][data-tab-kind="plugin"] .tab-item-trigger');
  await browser.waitFor("document.body.dataset.desktopSurface === 'goals'", 15_000);
  await browser.reloadPage();
  await browser.waitFor("!document.querySelector('[data-titlebar-tabs] [data-plugin=home]') && document.querySelectorAll('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-tab-kind=plugin]').length === 1", 15_000);
});

test("RAC-2687 old layout and UI caches reset once; a real browser restart restores new pane views without changing owner facts", { timeout: 150_000 }, async t => {
  const executable = locateTestChrome();
  assert.ok(executable, "RAC-2687 requires the dedicated test browser");
  const served = await openTestHome(t), project = await served.createProject("PR2 saved views", ["feed", "pages"]);
  await seedDemoGoals(project.database_path, project.project_id);
  const feedReads = new Set([feedSourceActions.register.capability_id, feedQueryActions.snapshot.capability_id]);
  const actions = bindActionClient(served.host.actionClient(project.reference), () => ({
    actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user",
    permissions: ["goals:read", ...feedManifest.actions.filter(action => feedReads.has(action.capability_id)).flatMap(action => action.action.permissions)],
  }));
  const { source } = await actions.invoke(feedSourceActions.register, { kind: "web_query", name: "固定观察来源", query: "PR2 fixed source" });
  const pages = openPagesStore(served.home);
  const document = pages.create({ project_id: project.project_id, title: "重启前后的固定正文", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "保持正文、ID 与版本" }] }] } });
  pages.close();
  const facts = async () => {
    const store = openPagesStore(served.home);
    try { return { goal: await actions.invoke(goalsActions.document, { goal_id: "CORE" }), page: store.get(document.id, project.project_id),
      sources: (await actions.invoke(feedQueryActions.snapshot, {})).sources }; }
    finally { store.close(); }
  };
  const before = await facts(), profileDirectory = join(served.home, "restart-profile");
  let chrome = await ChromeHarness.start(served.home, { executable, profileDirectory, profileTimeouts: true });
  try {
    let page = await chrome.page();
    const storageChanges: unknown[] = [];
    const observeStorage = async (phase: string) => {
      for (const method of ['DOMStorage.domStorageItemUpdated', 'DOMStorage.domStorageItemAdded']) t.after(chrome.on(method, (params, session) => {
        if (session !== page.sessionId || params.key !== 'molis-work-tab-workspace:' + project.project_id) return;
        storageChanges.push({ phase, method, storageId: params.storageId, oldValue: params.oldValue, newValue: params.newValue });
        if (storageChanges.length > 12) storageChanges.shift();
      }));
      await page.command('DOMStorage.enable');
    };
    await observeStorage('first process');
    const frameBrowser = () => ({ command: chrome.command.bind(chrome), on: chrome.on.bind(chrome), evaluate: page.evaluate.bind(page), sessionId: page.sessionId });
    const feed = await pluginFrameBrowser(t, frameBrowser(), "feed");
    const prefix = served.origin + "/projects/" + project.project_id + "/";
    const load = async (url: string) => {
      await page.command("Page.enable");
      const { windowId } = await page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: page.targetId });
      await page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1000 } });
      await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await Promise.all([chrome.event("Page.domContentEventFired"), page.command("Page.navigate", { url })]);
      // A restored split draws tabs in each pane, while a single pane uses the titlebar strip.
      await page.wait("[...document.querySelectorAll('[data-titlebar-tabs] .tab-item, [data-tab-pane] .tab-item')].some(tab=>tab.getClientRects().length>0)", {
        describe: "JSON.stringify({url:location.href,title:document.title,readyState:document.readyState,body:document.body?.innerText.slice(0,1200),panes:document.querySelectorAll('[data-tab-pane]').length})",
      });
    };
    await load(prefix);
    const key = "molis-work-tab-workspace:" + project.project_id, ui = "molis-work-ui:" + project.project_id, history = "molis-work-tab-history:" + project.project_id;
    await page.evaluate(`(() => {
      const stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})),pane=stored.panes[0];
      pane.tabs.push({id:'old-inactive',plugin:'goals',kind:'item',itemId:'CORE',title:'old',view:'work',goalView:null});
      localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored));
      sessionStorage.setItem(${JSON.stringify(ui + ":current")},JSON.stringify({feedTask:null,feedPresets:{feed:{task:'',query:'旧缓存不应应用'}},treeWidth:999}));
      sessionStorage.setItem(${JSON.stringify(ui)},JSON.stringify({feedTask:'old-source'}));
      sessionStorage.setItem(${JSON.stringify(history)},JSON.stringify({'old-pane':{stack:['old-inactive'],index:0}}));
      localStorage.setItem('molis-work-tab-workspace:other-project','preserved');
      sessionStorage.setItem('molis-work-ui:other-project:current','preserved');
    })()`);
    await load(prefix);
    const reset = await page.evaluate<{ panes: Array<{ tabs: Array<{ kind: string }>; viewPlugin: string | null }> }>(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
    assert.equal(reset.panes.length, 1);
    // 07-S2 (口径 3): the fresh workspace shows the project home with no tab for it.
    assert.deepEqual([reset.panes[0]!.tabs.length, reset.panes[0]!.viewPlugin], [0, null]);
    assert.equal(await page.evaluate(`sessionStorage.getItem(${JSON.stringify(ui)})`), null);
    assert.equal(await page.evaluate(`(sessionStorage.getItem(${JSON.stringify(history)})||'').includes('old-pane')`), false);
    assert.equal(await page.evaluate("localStorage.getItem('molis-work-tab-workspace:other-project')"), "preserved");
    assert.equal(await page.evaluate("sessionStorage.getItem('molis-work-ui:other-project:current')"), "preserved");
    assert.deepEqual(await facts(), before);

    await load(prefix + "?openPlugin=goals&openItem=CORE&openView=work");
    await page.wait("document.querySelector('[data-goal-node-workspace]')?.hidden === false");
    if (await page.evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=feed]')?.closest('[data-plugin-picker-popover]')?.hidden === true")) {
      await page.click('[data-plugin-picker-toggle]');
    }
    if (!await page.evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=feed]')?.getClientRects().length)")) {
      await page.click('.plugin-rail-items [data-rail-tools-toggle]');
    }
    await page.click('[data-plugin-strip] [data-plugin-id="feed"]');
    await feed.waitFor(`document.querySelector('[data-feed-task="${source.source_id}"]') && document.querySelector('[data-feed-search]')`);
    assert.notEqual(await feed.evaluate("document.querySelector('[data-feed-search]').value"), "旧缓存不应应用");
    await feed.click("[data-feed-source-menu] > summary");
    await feed.click(`[data-feed-task="${source.source_id}"]`);
    await feed.waitFor(`document.querySelector('[data-feed-workbench]').dataset.selectedSource===${JSON.stringify(source.source_id)}`);
    await page.wait(`(()=>{const state=JSON.parse(localStorage.getItem(${JSON.stringify(key)})),pane=state.panes.find(p=>p.id===state.focusedPaneId);return pane.viewPlugin==='feed' && pane.tabs.find(tab=>tab.kind==='plugin' && tab.plugin==='feed')?.view===${JSON.stringify(source.source_id)};})()`);
    await page.click('[data-layout-open]');
    await page.click('[data-layout-split="right"]');
    const feedPanes = "document.querySelectorAll('iframe.tab-content-frame:not([hidden])').length===2 && [...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].every(f=>f.contentDocument?.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench][data-plugin-slot=\"workbench.main\"] iframe[data-plugin-frame=feed]'))";
    await page.wait(feedPanes, { timeoutMs: 30_000 });
    const saved = await page.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`);
    const state = JSON.parse(saved) as { panes: Array<{ id: string; activeTabId: string; tabs: Array<{ id: string; plugin: string; kind: string; view?: string }> }> };
    assert.equal(state.panes.length, 2);
    assert.ok(state.panes.some(pane => pane.tabs.some(tab => tab.plugin === "goals" && tab.kind === "item" && tab.view === "work")));
    assert.ok(state.panes.every(pane => pane.tabs.some(tab => tab.plugin === "feed" && tab.kind === "plugin" && tab.view === source.source_id)));
    assert.doesNotMatch(saved, /"(?:goalView|feedTask)"/);
    const newUi = await page.evaluate<string>(`sessionStorage.getItem(${JSON.stringify(ui + ":current")}) || '{}'`);
    assert.doesNotMatch(newUi, /"feedTask"|"task"\s*:/);
    const uiKeys = [ui, ui + ":current", ui + ":archive", ui + ":trash"];
    const closing = await page.evaluate<{saved:string;marker:string|null;ui:Record<string,string|null>}>(`({saved:localStorage.getItem(${JSON.stringify(key)}),marker:localStorage.getItem('molis-work-tab-workspace:other-project'),ui:Object.fromEntries(${JSON.stringify(uiKeys)}.map(key=>[key,sessionStorage.getItem(key)]))})`);
    assert.equal(closing.saved, saved, "the original layout remains exact immediately before closing the first process");
    await chrome.close();
    chrome = await ChromeHarness.start(served.home, { executable, profileDirectory, profileTimeouts: true });
    page = await chrome.page();
    await observeStorage('restart');
    await page.command("Page.addScriptToEvaluateOnNewDocument", { source: `if(window.top===window&&location.origin===${JSON.stringify(served.origin)})window.__restartPreboot={origin:location.origin,href:location.href,saved:localStorage.getItem(${JSON.stringify(key)}),marker:localStorage.getItem('molis-work-tab-workspace:other-project'),ui:Object.fromEntries(${JSON.stringify(uiKeys)}.map(key=>[key,sessionStorage.getItem(key)]))};` });
    const restoredFeeds = [];
    // A plugin page has no active item tab: paneFrameKey uses this pane's ":view" owner.
    for (const pane of state.panes) restoredFeeds.push(await pluginFrameBrowser(t, frameBrowser(), "feed", `iframe.tab-content-frame[data-pane-owner="${pane.id}"][data-pane-tab="${pane.activeTabId || pane.id + ":view"}"]`));
    await load(prefix);
    try { await page.wait(feedPanes, { timeoutMs: 30_000,
      describe: `JSON.stringify({preboot:window.__restartPreboot,closing:${JSON.stringify(closing)},expected:${JSON.stringify(saved)},goalsOffered:Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')),saved:localStorage.getItem(${JSON.stringify(key)}),panes:document.querySelectorAll('[data-tab-pane]').length,feed:document.querySelectorAll('[data-feed-workbench]').length,
        frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({src:f.src,hidden:f.hidden,readyState:f.contentDocument?.readyState,feed:f.contentDocument?.querySelectorAll('[data-feed-workbench]').length}))})` }); }
    catch (error) {
      const stored = await page.command('DOMStorage.getDOMStorageItems', { storageId: { securityOrigin: served.origin, isLocalStorage: true } }, 1500).catch(observation => ({ unavailable: String(observation) }));
      t.diagnostic('T405 restart Feed panes failed ' + JSON.stringify({ storageChanges, stored }));
      throw error;
    }
    assert.deepEqual(JSON.parse(await page.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)), JSON.parse(saved), "a fresh browser process accepts the new layout without a second reset");
    for (const restored of restoredFeeds) await restored.waitFor(`document.querySelector('[data-feed-workbench]')?.dataset.selectedSource===${JSON.stringify(source.source_id)}`);
    assert.deepEqual(await facts(), before, "Goal facts and Pages body/version/id and Feed source records are unchanged after reset and restart");
  } finally {
    await chrome.close();
    // T405-FULL-03: this restart profile is caller-owned until both browser processes have closed.
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
