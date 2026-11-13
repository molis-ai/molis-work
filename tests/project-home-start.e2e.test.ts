import assert from "node:assert/strict";
import test from "node:test";

import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { CODING_OPEN } from "./fixtures/coding-composer.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { waitForHomeRow } from "./fixtures/home-rows.js";


test("The project button holds settings and the account, and opens settings in the stage", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const {command,sessionId,evaluate,navigate,click,origin,projectId,waitFor}=browser;
  const directory = reviewEvidenceUrl("home-footer-quotes/");
  await mkdir(directory,{recursive:true});
  await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]},sessionId);
  await command("Network.setCookie",{name:"molis_work_locale",value:"en",url:origin},sessionId);
  await navigate(()=>command("Page.navigate",{url:origin+"/projects/"+projectId+"/"},sessionId));
  await waitFor("document.body.dataset.desktopSurface==='home'");
  assert.equal(await evaluate("document.querySelector('.personal-account-copy strong').textContent"), "Not signed in");
  assert.equal(await evaluate("document.querySelector('.personal-account-copy small').textContent"), "Local space");
  assert.equal(await evaluate("document.querySelector('.personal-account').disabled"), false);
  await waitFor("document.querySelector('.personal-account').getAttribute('aria-controls') === 'mw-account-menu'");
  assert.equal(await evaluate("document.querySelector('[data-unified-account-link]').disabled"), false);
  assert.equal(await evaluate("document.querySelector('[data-unified-account-link]').getAttribute('aria-label')"), "Molis account");
  for(const width of [761,760,600,390]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<=600},sessionId);
    for(const theme of ["light","dark"]){
      await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      // The person rides with the project: capabilities, settings and the account open from the round button at the foot.
      await evaluate("document.querySelector('.bar-end [data-project-menu]').open=true");
      await waitFor("getComputedStyle(document.querySelector('.personal-account')).color===getComputedStyle(document.querySelector('.navigator-project-manage')).color");
      await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      const metrics=await evaluate<any>(`(()=>{const account=document.querySelector('.personal-account'),avatar=account.querySelector('.personal-account-avatar'),icon=avatar.querySelector('svg'),popover=account.closest('.navigator-project-menu-popover'),button=document.querySelector('.bar-end .navigator-project-selector');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {avatar:rect(avatar),icon:rect(icon),account:rect(account),popover:rect(popover),button:rect(button),copyDisplay:getComputedStyle(account.querySelector('.personal-account-copy')).display,name:account.querySelector('strong').getBoundingClientRect().width,decoration:getComputedStyle(account).textDecorationLine}})()`);
      assert.notEqual(metrics.copyDisplay,"none",width+theme+": the account shows its name and space");
      assert.ok(metrics.name>0,width+theme+": the name is readable");
      assert.equal(metrics.decoration,"none",width+theme);
      assert.ok(await evaluate("Boolean(document.querySelector('[data-plugin-id=settings]').closest('.bar-end [data-project-menu] [data-personal-menu]'))"),width+theme+": settings live under the project button");
      assert.ok(Math.abs(metrics.avatar.x+metrics.avatar.width/2-metrics.icon.x-metrics.icon.width/2)<1,width+theme+": avatar centered horizontally");
      assert.ok(Math.abs(metrics.avatar.y+metrics.avatar.height/2-metrics.icon.y-metrics.icon.height/2)<1,width+theme+": avatar centered vertically");
      assert.ok(metrics.popover.x>=0 && metrics.popover.right<=width && metrics.popover.y>=0,width+theme+": the menu stays on screen");
      assert.ok(metrics.popover.bottom<=metrics.button.y,width+theme+": the menu opens above the button, never over it");
      // The project menu's rows are menu rows: 30–36px on a desktop, 44px targets at phone width (W2-18 decision 10, DESIGN.md
      // "Focus and accessibility": what the bar opens is 44px on a phone or with a coarse pointer).
      const [low,high]=width<=600?[44,44]:[30,36];
      assert.ok(metrics.account.height>=low && metrics.account.height<=high,width+theme+": the account is one menu row like the others ("+low+"–"+high+"px) "+metrics.account.height);
      const shot=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
      await writeFile(new URL("footer-"+width+"-"+theme+".png",directory),Buffer.from(shot.data,"base64"));
      await evaluate("document.querySelector('.bar-end [data-project-menu]').open=false");
    }
  }
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate("dispatchEvent(new Event('resize'))");
  await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  await click(".bar-end .navigator-project-selector");
  await click(".bar-end [data-account-link]");
  await waitFor("!document.querySelector('#mw-account-menu').hidden");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  // WORK-03 / T01-ACCOUNT-ENTRY-01: the enabled account entry opens in place and can return to this project.
  await click(".bar-end .navigator-project-selector");
  await click(".bar-end [data-unified-account-link]");
  await waitFor("!!document.querySelector('.account-dialog[open] .account-form')");
  assert.equal(await evaluate("document.querySelector('#account-title').textContent"), "Molis account");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  await click(".account-dialog > button");
  await waitFor("!document.querySelector('.account-dialog')");
  assert.equal(await evaluate("document.activeElement === document.querySelector('.bar-end .navigator-project-selector')"), true);
  await click(".bar-end .navigator-project-selector");
  await click("[data-plugin-id=settings]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='settings' && document.querySelector('#goal-tree-pane').getBoundingClientRect().width>80 && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='settings' && document.querySelector('[data-work-surface=settings] [data-theme-option=dark]')");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("!!document.querySelector('[data-directory-panel=settings] [data-theme-option=dark]')"), false);
  await evaluate("document.querySelector('[data-work-surface=settings] [data-theme-option=dark]').click()");
  await waitFor("document.documentElement.dataset.resolvedTheme==='dark'");
  await click("[data-plugin-id=goals]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='root' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').hasAttribute('aria-current')"), false);
  await click(".navigator-project-settings");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='project-settings' && document.querySelector('#goal-tree-pane').getBoundingClientRect().width>80 && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && document.querySelector('[data-work-surface=project-settings] [data-project-rename]') && !document.body.dataset.navigationPending");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').hasAttribute('aria-current')"), false);
  await click('[data-directory-panel=project-settings] [data-settings-section="guidance"]');
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-guidance-form]')");
  await click("[data-plugin-id=goals]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='root' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').hasAttribute('aria-current')"), false);
});

const endpoint = "/api/host/surface-home";
const homeCard = (owner: string) => '[data-home-card="io.molis.work.' + owner + '"]';
const homeRow = (kind: string, id: string) => '[data-home-subject-kind="' + kind + '"][data-home-subject-id="' + id + '"]';
const visible = (selector: string) => '!!document.querySelector(' + JSON.stringify(selector) + ')?.checkVisibility()';

test("WBR-24: Home opens the exact original Inbox item, Feed source, and a newly created Coding session", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const active = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "home-navigation" }).source;
  const source = feed.sources.upsert({ ...active, status: "error", last_error_code: "source_offline" });
  const material = feed.ingestItem({ source, externalId: "home-navigation", title: "The original material", summary: "Source metadata",
    occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(projectId, material.item_id, "manual").entry;
  const inbox = await pluginFrameBrowser(t, b, "inbox"), sourceView = await pluginFrameBrowser(t, b, "sources"),
    coding = await pluginFrameBrowser(t, b, "coding"), feedView = await pluginFrameBrowser(t, b, "feed");
  await b.setViewport(1440, 900);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + projectId + "/" }, b.sessionId));
  const open = async (selector: string) => {
    await b.waitFor(visible(selector), 15_000);
    await b.click(selector);
  };
  const home = () => open('[data-dock-pin="home"]');
  // Each owner answers the home under one budget; a slow one shows 重试, which openRow presses as a person would (fixtures/home-rows.ts).
  const openRow = async (selector: string, owner: string) => { await waitForHomeRow(b, selector, "io.molis.work." + owner); await b.click(selector); };
  await openRow(homeRow("inbox_entry", entry.entry_id) + ' .mw-presentation__row-title', "inbox");
  await open('[data-home-peek] [data-presentation-action$=":peek-open"]');
  await inbox.waitFor(`document.querySelector('[data-inbox-detail="${entry.entry_id}"]')?.hidden === false`);
  await home();
  await openRow(homeRow("source", source.source_id) + ' [data-presentation-action$=":open"]', "feed");
  await sourceView.waitFor(`document.querySelector('[data-source-detail="${source.source_id}"]')?.hidden === false`);
  assert.equal(await b.evaluate("document.querySelectorAll('[data-tab-id][data-plugin=sources]').length"), 0);
  await home();
  await openRow(homeRow("feed_item", material.item_id) + ' [data-presentation-action$=":open"]', "feed");
  await feedView.waitFor(`document.querySelector('[data-feed-detail="${material.item_id}"][data-feed-detail-read=read]')`);
  await home();
  const sessions = async () => (await b.web.post<SurfaceHomeDisplay>("/projects/" + projectId + endpoint, {})).display.rows
    .filter(row => row.subject.kind === "coding_session").map(row => row.subject.id);
  const before = await sessions();
  await open(homeCard("coding") + ' [data-home-control$=":start:0"]');
  // Coding takes the workbench bar's one input (batch 11): the new session is current in its frame and the bar's box takes words.
  await coding.waitFor("!!document.querySelector('[data-coding-session][aria-current=true]')");
  await b.waitFor(CODING_OPEN);
  const selected = await coding.evaluate<string>("document.querySelector('[data-coding-session][aria-current=true]').dataset.codingSession");
  assert.deepEqual((await sessions()).filter(id => !before.includes(id)), [selected]);
});

test("WBR-21 QHR-01: a real background Home refresh keeps the current row, newer values win, and another project is isolated", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const first = await createProject(b.web, "Refresh source"), second = await createProject(b.web, "Another Home view");
  const project = (id: string) => "/projects/" + id;
  const go = (id: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + project(id) + "/" }, b.sessionId));
  const add = (id: string, title: string) => b.web.post<{ goal: { goal_id: string } }>(project(id) + "/api/plugins/io.molis.work.goals/goals",
    { title, idempotency_key: title });
  const goal = (id: string) => homeRow("goal", id) + ' .mw-presentation__row-title';
  await go(first.project_id);
  const kept = (await add(first.project_id, "Keep the focused row")).goal.goal_id;
  await go(first.project_id);
  await b.waitFor(visible(goal(kept)));
  await b.evaluate(`(() => {
    const original = window.fetch, row = document.querySelector(${JSON.stringify(goal(kept))});
    row.focus();
    window.homeProbe = { row, requests: 0 };
    const held = new Promise(resolve => { window.homeProbe.release = resolve; });
    window.fetch = async (url, options) => {
      const first = String(url).endsWith(${JSON.stringify(endpoint)}) && ++window.homeProbe.requests === 1;
      const response = await original(url, options);
      if (first) { window.homeProbe.signal = options.signal; window.homeProbe.first = await response.clone().json(); await held; }
      return response;
    };
  })()`);
  const announce = async () => {
    const { observed_event_cursor: cursor } = await b.web.get<{ observed_event_cursor: number }>(project(first.project_id) + "/api/board/cursor");
    await b.evaluate(`document.dispatchEvent(new CustomEvent("molis-work:attention", {detail:{board_cursor:${cursor}}}))`);
  };
  const early = (await add(first.project_id, "An earlier Home response")).goal.goal_id;
  await announce();
  await b.waitFor("!!window.homeProbe.first");
  assert.equal(await b.evaluate(`homeProbe.first.display.rows.some(row=>row.subject.id===${JSON.stringify(early)})`), true);
  assert.equal(await b.evaluate("homeProbe.row.isConnected && document.activeElement === homeProbe.row"), true);
  const later = (await add(first.project_id, "A newer Home response")).goal.goal_id;
  await announce();
  try {
    await b.waitFor(visible(goal(later)), 15_000);
    assert.equal(await b.evaluate("homeProbe.signal.aborted"), true, "the superseded request was cancelled");
    assert.equal(await b.evaluate("homeProbe.row.isConnected && document.activeElement === homeProbe.row"), true, "unchanged row stays put");
  } finally { await b.evaluate("homeProbe.release()"); }
  await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await b.evaluate(visible(goal(later))), true, "the older real reply did not replace the newer one");
  await go(second.project_id);
  await b.waitFor(visible(homeCard("goals")));
  assert.equal(await b.evaluate("document.querySelectorAll('[data-home-row]').length"), 0);
});

test("SCS-11: a reply from the Home in an older focused split cannot open Goals in the other pane", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const start = homeCard("goals") + ' [data-home-control$=":start:0"]';
  const go = () => b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + b.projectId + "/" }, b.sessionId));
  await b.setViewport(1440, 960);
  await go();
  await b.click('[data-plugin-strip] [data-plugin-id="goals"]');
  await b.click('[data-layout-open]');
  await b.click('[data-layout-split="right"]');
  await b.waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  await b.click('[data-dock-pin="home"]');
  const frame = "document.querySelector('iframe[data-pane-key=\"plugin:home\"]:not([hidden])')";
  await b.waitFor(`${frame}?.contentDocument?.querySelector(${JSON.stringify(start)})`);
  const from = await b.evaluate<string>(`${frame}.dataset.paneOwner`);
  const other = await b.evaluate<string>(`[...document.querySelectorAll('[data-tab-pane]')].find(pane=>pane.dataset.tabPane!==${JSON.stringify(from)}).dataset.tabPane`);
  const otherTab = '[data-tab-pane="' + other + '"] [data-tab-id][data-plugin="goals"]';
  await b.evaluate(`(() => {
    const win=${frame}.contentWindow, previous=win.fetch;
    const held=new Promise(resolve=>{window.releaseOldHomeClick=resolve});
    win.fetch=async (url, options)=>{
      const response=await previous(url, options);
      if(String(url).endsWith(${JSON.stringify(endpoint + "/click")})){ window.oldHomeClick=await response.clone().json(); await held; }
      return response;
    };
    win.document.querySelector(${JSON.stringify(start)}).click();
  })()`);
  try {
    await b.waitFor("window.oldHomeClick?.selection?.panel === 'create-dialog'");
    await b.click(otherTab);
    await b.waitFor(`document.querySelector('[data-tab-pane="${other}"]').classList.contains('is-focused')`);
  } finally { await b.evaluate("releaseOldHomeClick()"); }
  await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await b.evaluate(`${frame}?.dataset.paneOwner`), from, "the stale reply did not navigate its own Home pane either");
  assert.equal(await b.evaluate("![document,...[...document.querySelectorAll('iframe[data-pane-tab]:not([hidden])')].map(frame=>frame.contentDocument)].some(doc=>doc?.querySelector('[data-create-dialog]')?.open)"), true);
});

test("WBR-21: the retired website shortcut entry does not delete its saved data", { timeout: 45_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const key = "molis-work:home-shortcuts:" + b.projectId, saved = '[{"id":"website","name":"Existing link","url":"https://example.com/"}]';
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + b.projectId + "/" }, b.sessionId));
  await b.evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(saved)})`);
  await b.reloadPage();
  await b.waitFor(visible(homeCard("goals")));
  assert.equal(await b.evaluate(`localStorage.getItem(${JSON.stringify(key)})`), saved);
  assert.equal(await b.evaluate("document.querySelector('[data-home-shortcut-add], [data-home-shortcut-link], [data-home-day]') === null"), true);
});
