import assert from "node:assert/strict";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

test("RAC-2516 RAC-2517 RAC-2519 in-place membership owns every Feed mount, source preview keeps its Feed tab, and Inbox refresh reads its own owner", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const { projectId, command, sessionId } = b, prefix = `/projects/${projectId}`;
  const owner = new LocalHostHttpClient({ origin: b.origin, controlToken: b.controlToken });
  await owner.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed" });
  await owner.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "inbox" });
  const library = createLocalFeedApplication(b.store.db), source = createLocalFeedSourceService(b.store.db, projectId!).register({ kind: "web_query", query: "membership-live-source", name: "Membership source" }).source;
  const item = library.ingestItem({ source, externalId: "membership-live-item", title: "Membership live item", summary: "A Feed mutation wakes the retained Inbox", body: "Actual source material", occurredAt: new Date().toISOString(), attention: false }).item;
  await pluginFrameInitScript(t, b, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=['feed','inbox'].includes(key)?host=>{window.t403Host=host;window.t403Mounts=(window.t403Mounts||0)+1;window.t403Reads={total:0,pending:0,owners:[]};const read=host.view.readDocument;host.view.readDocument=async(...args)=>{t403Reads.total++;t403Reads.pending++;t403Reads.owners.push(host.pluginId);try{return await read(...args)}finally{t403Reads.pending--}};return value(host)}:value;return true}});`);
  const feed = await pluginFrameBrowser(t, b, "feed"), inbox = await pluginFrameBrowser(t, b, "inbox"), directory = await pluginFrameBrowser(t, b, "feed:source-directory"), preview = await pluginFrameBrowser(t, b, "sources");
  const { targetInfo } = await command<{ targetInfo: { targetId: string } }>("Target.getTargetInfo", {}, sessionId);
  const { windowId } = await command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: targetInfo.targetId });
  await command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1060 } });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: b.origin + prefix + "/?openPlugin=inbox" }, sessionId));
  await inbox.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-plugin-owner=\"io.molis.work.feed\"]').length"), 0);
  await b.evaluate("window.t403ShellMarker={retained:true}");
  const toggle = async (adding: boolean) => {
    await b.click('[data-plugin-picker-toggle]'); await b.click('[data-plugin-toggle=feed]'); if (!adding) await b.click('[data-plugin-toggle=feed]');
    await b.waitFor(`document.querySelector('[data-plugin-toggle=feed]').dataset.state===${JSON.stringify(adding ? "added" : "available")} && !document.querySelector('[data-plugin-tile=feed]').classList.contains('is-busy')`);
    await b.click('[data-plugin-picker-toggle]');
    assert.equal(await b.evaluate("window.t403ShellMarker?.retained"), true, "membership follows the page in place");
  };
  await toggle(true);
  const mounts = () => b.evaluate<string[]>("[...document.querySelectorAll('[data-plugin-owner=\"io.molis.work.feed\"]')].map(root=>root.dataset.pluginSurface).sort()");
  assert.deepEqual(await mounts(), ["source-directory", "source-workbench", "workbench"]);
  await b.click('[data-plugin-strip] [data-plugin-id=feed]');
  await feed.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  assert.equal(await feed.evaluate(`molisWorkRequest(t403Host.route('/api/stage/feed/objects/${item.item_id}?surface=persisted-detail')).then(()=>0,error=>error.status)`), 403, "the child cannot fetch the old Host-only stage URL");
  assert.equal(await feed.evaluate(`t403Host.view.readDocument({object:{id:${JSON.stringify(item.item_id)},surface:'foreign-surface'}}).then(()=>false,()=>true)`), true, "an undeclared object surface is refused");
  await feed.evaluate("for(const [name,value] of [['search','Membership live'],['sort','title']]){const field=document.querySelector('[data-feed-'+name+']');field.value=value;field.dispatchEvent(new Event(name==='search'?'input':'change',{bubbles:true}))}");
  await feed.click(`button[data-frame-asset=feed][data-frame-asset-id="${item.item_id}"]`);
  await feed.waitFor(`document.querySelector('[data-feed-detail="${item.item_id}"] [data-feed-action=inbox]')`);
  await feed.click('[data-feed-filter-trigger]');
  await feed.click(`[data-feed-detail="${item.item_id}"] [data-feed-action=inbox]`);
  await feed.waitFor(`document.querySelector('[data-feed-detail="${item.item_id}"] [data-destination-state=inbox]') && t403Reads.pending===0`);
  const admitted = library.listInboxEntries(projectId!).find(entry => entry.subject_id === item.item_id);
  assert.ok(admitted, "the native Feed action commits an actual Inbox entry");
  await feed.waitFor("t403Reads.pending===0 && document.querySelector('[data-feed-action=inbox]')?.disabled");
  assert.deepEqual(await feed.evaluate("({search:document.querySelector('[data-feed-search]').value,sort:document.querySelector('[data-feed-sort]').value,filterOpen:!document.querySelector('[data-feed-filter-panel]').hidden})"), { search: "Membership live", sort: "title", filterOpen: true });
  await b.click('[data-plugin-strip] [data-plugin-id=inbox]');
  await inbox.waitFor(`document.querySelector('[data-inbox-entry-id="${admitted.entry_id}"]') && t403Reads.pending===0`);
  assert.equal(await inbox.evaluate("t403Mounts"), 1, "the already mounted Inbox refreshes without remounting");
  assert.equal(await inbox.evaluate("t403Reads.owners.every(owner=>owner==='io.molis.work.inbox')"), true);
  await b.click('[data-plugin-strip] [data-plugin-id=feed]');
  const tabs = await b.evaluate<number>("document.querySelectorAll('[data-titlebar-tabs] .tab-item').length");
  // Feed's current product entry opens its main surface. Exercise its separately declared directory
  // in the real Host slot without inventing a second sidebar entry for this migration.
  await b.evaluate(`(() => {
    const workspace=document.querySelector('[data-workspace]');
    workspace.classList.remove('is-plugin-directory-empty','is-directory-collapsed');
    workspace.style.setProperty('--tree-width','240px');
    document.querySelector('#goal-tree-pane').dataset.desktopDirectory='sources';
    for(const section of document.querySelectorAll('[data-plugin-section]'))section.hidden=section.dataset.pluginSection!=='feed';
    for(const panel of document.querySelectorAll('[data-directory-panel]'))panel.hidden=panel.dataset.directoryPanel!=='sources';
  })()`);
  await directory.waitFor(`document.querySelector('[data-source-entry-id="${source.source_id}"]') && window.t403Host`);
  await directory.evaluate(`(() => {
    const row=document.querySelector('[data-source-entry-id="${source.source_id}"]');
    if(!row.getClientRects().length){const ancestors=[];for(let node=row;node;node=node.parentElement)ancestors.push({tag:node.tagName,class:node.className,hidden:node.hidden,display:getComputedStyle(node).display,rect:node.getBoundingClientRect().toJSON()});throw Error('Source directory row is hidden: '+JSON.stringify(ancestors));}
  })()`);
  await directory.click(`[data-source-entry-id="${source.source_id}"]`);
  await preview.waitFor(`document.querySelector('[data-source-detail="${source.source_id}"]')?.hidden===false`);
  assert.equal(await b.evaluate("document.querySelectorAll('[data-titlebar-tabs] .tab-item').length"), tabs);
  assert.equal(await b.evaluate("document.querySelector('.tab-item[data-plugin=sources]')"), null, "a source selection does not create a Sources tab");
  await directory.click('[data-feed-sources-open]');
  await feed.waitFor("!document.querySelector('[data-feed-sources-dialog]').hidden && document.querySelector('[data-feed-source-choices]').hidden===false");
  for (const view of [feed, directory, preview]) assert.equal(await view.evaluate("t403Mounts"), 1);
  await b.evaluate("window.t403OldFeedFrames=[...document.querySelectorAll('[data-plugin-owner=\"io.molis.work.feed\"] iframe[data-plugin-frame]')]");
  await toggle(false); assert.deepEqual(await mounts(), []);
  assert.equal(await b.evaluate("t403OldFeedFrames.every(frame=>!frame.isConnected)"), true);
  await toggle(true); assert.deepEqual(await mounts(), ["source-directory", "source-workbench", "workbench"]);
  await b.click('[data-plugin-strip] [data-plugin-id=feed]');
  await feed.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  assert.equal(await feed.evaluate("t403Mounts"), 1, "re-enable creates one new client and no duplicate listeners");
});

test("RAC-2518 RAC-2519 a replaced or hidden account picker cannot return a late dialog or bind the previous source", { timeout: 90000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, projectId, homeDirectory } = browser;
  const client = new LocalHostHttpClient({ origin: browser.origin, controlToken: browser.controlToken });
  await client.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed" });
  const prefix = `/projects/${projectId}`, api = prefix + "/api/plugins/io.molis.work.feed";
  const a = await client.post<{ source: { source_id: string } }>(api + "/sources/accounts", { service: "github", name: "Account source A" });
  const b = await client.post<{ source: { source_id: string } }>(api + "/sources/accounts", { service: "github", name: "Account source B" });
  const account = withConnectorConnections(homeDirectory, store => store.createToken({ serviceId: "github", displayName: "Picker fixture account", token: "fixture-value" }));
  await pluginFrameInitScript(t, browser, `window.t403Reads={total:0,pending:0};window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{window.t403Host=host;window.t403Mounts=(window.t403Mounts||0)+1;const read=host.view.readDocument;host.view.readDocument=async(...args)=>{t403Reads.total++;t403Reads.pending++;try{return await read(...args)}finally{t403Reads.pending--}};return value(host)}:value;return true}});`);
  const feed = await pluginFrameBrowser(t, browser, "feed");
  await browser.navigate(() => command("Page.navigate", { url: browser.origin + prefix + "/?openPlugin=feed" }, sessionId));
  await feed.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  const select = async (id: string) => {
    await feed.evaluate(`t403Host.openView({surface:'workbench',id:${JSON.stringify(id)},panel:'settings',intent:'open'})`);
    await feed.waitFor(`document.querySelector('[data-feed-workbench]').dataset.selectedSource===${JSON.stringify(id)} && !document.querySelector('[data-feed-sources-dialog]').hidden && !!document.querySelector('[data-feed-task-config="${id}"] [data-feed-account-picker]:not(:disabled)')`);
  };
  await select(a.source.source_id);
  await command("Network.enable", {}, sessionId);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/settings/connectors/connections*", requestStage: "Request" }]);
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await barrier.close(); } }; t.after(close);
  try {
    await feed.click('[data-feed-task-config="' + a.source.source_id + '"] [data-feed-account-picker]');
    const paused = await barrier.next();
    assert.equal(new URL(paused.request.url).searchParams.get("service_id"), "github");
    await select(b.source.source_id);
    await close();
    await feed.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await browser.evaluate("document.querySelectorAll('dialog[aria-label=\"请选择账号连接\"]').length"), 0, "the old in-flight choice never creates a dialog after source B takes over");
    const query = (id: string) => "/api/settings/connectors/plugin-slots/record?" + new URLSearchParams({ project: projectId!, plugin_id: "io.molis.work.feed", slot_id: "github", record_key: id });
    assert.equal((await client.get<{ connection: unknown }>(query(a.source.source_id))).connection, null);
    await feed.click('[data-feed-task-config="' + b.source.source_id + '"] [data-feed-account-picker]');
    await browser.waitFor("document.querySelectorAll('dialog[aria-label=\"请选择账号连接\"]').length===1");
    await browser.click('dialog[aria-label="请选择账号连接"] .mw-btn--ghost');
    await browser.waitFor("!document.querySelector('dialog[aria-label=\"请选择账号连接\"]')");
    await feed.waitFor(`document.querySelector('[data-feed-task-config="${b.source.source_id}"] [data-feed-account-picker]')?.disabled===true`);
    assert.equal((await client.get<{ connection: { connection_id: string } }>(query(b.source.source_id))).connection.connection_id, account.connection_id);
    assert.equal((await client.get<{ connection: unknown }>(query(a.source.source_id))).connection, null, "only the user's current source is bound");
    assert.equal(await feed.evaluate("molisWorkRequest('/api/settings/connectors/connections').then(()=>0,error=>error.status)"), 403, "the child still cannot read the account directory");
    await select(a.source.source_id);
    await feed.click('[data-feed-task-config="' + a.source.source_id + '"] [data-feed-account-picker]');
    await browser.waitFor("!!document.querySelector('dialog[aria-label=\"请选择账号连接\"]')");
    await browser.evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=home]').click()");
    await browser.waitFor("!document.querySelector('dialog[aria-label=\"请选择账号连接\"]')");
    await browser.click('[data-plugin-strip] [data-plugin-id=feed]');
    await feed.waitFor("t403Host.scope.visible && t403Reads.pending===0");
    assert.equal(await feed.evaluate("window.t403Mounts"), 1, "hiding and reopening keeps one client instance");
    assert.equal((await client.get<{ connection: unknown }>(query(a.source.source_id))).connection, null, "a hidden choice never binds its source");
  } finally { await close(); }
});

test("a hung UI asset times out, retries and ignores the late first response without remounting or losing the last selection", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  const child = await pluginFrameBrowser(t,browser,"pages");
  const sessions = new Set<string>(); let holdAsset = true;
  t.after(browser.on("Target.detachedFromTarget", params => { sessions.delete(String(params.sessionId)); }));
  await pluginFrameInitScript(t, browser, `window.reviewPagesMounts=0;
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='pages'?(...args)=>{window.reviewPagesMounts++;return value(...args)}:value;return true}});
  `, async session => { sessions.add(session); if (holdAsset) await command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-plugins/pages.js", requestStage: "Request" }] }, session); });
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  await evaluate(`(() => {
    const root = document.querySelector('[data-work-surface=pages]'); root.retainedClientRoot = true;
    root.addEventListener('molis-work:select-item', event => { window.reviewLastSelection = event.detail; });
  })()`);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  await evaluate(`(() => {
    const root = document.querySelector('[data-work-surface=pages]');
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: 'superseded-selection' } }));
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: null } }));
  })()`);
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'failed'", 13_000);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').hasAttribute('aria-busy')"), false);
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  // Release both the removed first script's network request and the retry's request.
  holdAsset = false;
  await Promise.all([...sessions].map(session => command("Fetch.disable", {}, session)));
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await child.evaluate("window.reviewPagesMounts"), 1);
  assert.deepEqual(await evaluate("window.reviewLastSelection"), { itemId: null });
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').retainedClientRoot"), true);
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  assert.equal(await child.evaluate("window.reviewPagesMounts"), 1);
});

test("registered clients mount on demand, retry resources and retain their original surfaces", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  const views=Object.fromEntries(await Promise.all(pluginSurfaceClients().map(async pack=>[pack.id,await pluginFrameBrowser(t,browser,pack.id)])));
  const child=views.pages!;
  // An isolated child can request its assets before DevTools attaches; fail at the server instead.
  const handlers = browser.server.listeners("request");
  browser.server.removeAllListeners("request");
  let failEditor = true, failedRequests = 0;
  browser.server.on("request", (request, response) => {
    if (failEditor && request.url === "/assets/molis-work-pages-editor.js") {
      failedRequests++;
      response.writeHead(503); response.end();
    } else for (const handler of handlers) handler.call(browser.server, request, response);
  });
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  assert.equal(await evaluate("typeof window.MolisWorkPagesEditor"), "undefined");
  assert.equal(await evaluate("Object.keys(window.molisWorkbenchPluginFactories || {}).length"), 0);
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-plugin-document]').length") > 10);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages] [data-ui-client-retry]')");
  assert.ok(failedRequests > 0, "the editor resource failed before the retry was offered");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  failEditor = false;
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await child.evaluate("typeof window.MolisWorkPagesEditor.mount"), "function");
  // RAC-542 W5-04 PG-070: every surface (Files, Git, Diff and Text Stats among them) mounts with the bundle of its own; the clients a
  // surface uses (Coding's Git and Files) load beside it, and each isolated document loads a bundle only once, retaining it when reopened.
  const loaded = (id: string) => `performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/assets/molis-work-plugins/${id}.js')).length`;
  const opened: string[] = [];
  for (const { id, bundle, assets } of pluginSurfaceClients()) {
    const link = `[data-plugin-strip] [data-plugin-id="${id}"]`;
    // Characters is a settings page; its existing dedicated browser test exercises that entry.
    if (!await evaluate(`!!document.querySelector(${JSON.stringify(link)})`)) continue;
    const root = `[data-work-surface="${id}"]`;
    // RAC-43 W5-01-HOME-STAGE-01: a Runtime view replaces its old build-time stage; both must never mount together.
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(root)}).length`), 1, id);
    const view=views[id]!;
    await click(link);
    await waitFor(`document.querySelector(${JSON.stringify(root)})?.dataset.uiClientState === 'ready'`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).inert`), false, id);
    await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot = true`);
    await click('[data-plugin-strip] [data-plugin-id="home"]');
    await click(link);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot`), true, id);
    assert.equal(bundle, id, `${id} has a bundle of its own`);
    assert.equal(await view.evaluate(loaded(bundle)), 1, id);
    for (const asset of assets.filter(asset => asset.startsWith("/assets/molis-work-plugins/"))) {
      assert.equal(await view.evaluate(loaded(asset.slice(asset.lastIndexOf("/") + 1, -3))), 1, `${id} loads ${asset} once`);
    }
    opened.push(id);
  }
  for (const id of ["files", "git", "diff", "text-stats"]) assert.ok(opened.includes(id), `${id}'s surface was opened with its own bundle`);
});


test("W5-02-REG-09 SYS-15-U9 the mounted Host confirms a workspace and translates failures without changing the request default", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const child = await pluginFrameBrowser(t, browser, "coding");
  await pluginFrameInitScript(t, browser, `
    window.molisWorkbenchPluginFactories = new Proxy({}, {
      set(target, key, value) { target[key] = key === 'coding' ? host => { window.workspaceTestHost = host; return value(host); } : value; return true; }
    });
  `);
  for (const [locale, linkFailure, defaultFailure] of [["zh", "无法关联工作区", "来源操作失败"], ["en", "Unable to link workspace", "Source operation failed"]]) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
    await browser.click('[data-plugin-strip] [data-plugin-id="coding"]');
    await child.waitFor("!!window.workspaceTestHost");
    const operations = [
      { expression: "workspaceTestHost.workspaces.add('/confirmed/folder')", expected: linkFailure, path: "/api/host/plugin-page-workspaces", body: { operation: "add", value: "/confirmed/folder" }, confirm: true },
      { expression: "workspaceTestHost.api('/api/plugins/io.molis.work.coding/sessions', 'POST', {})", expected: defaultFailure, path: "/api/plugins/io.molis.work.coding/sessions", body: {}, confirm: false },
    ];
    for (const operation of operations) {
      const barrier = await sendBarrier(browser, [{ urlPattern: "*" + operation.path, requestStage: "Request" }]);
      try {
        await child.evaluate(`(() => { const button=document.createElement('button');button.id='workspace-test-call';button.textContent='Test Host';
          button.style.cssText='position:fixed;top:10px;left:10px;z-index:10000';button.onclick=()=>{window.workspaceResult=${operation.expression}.then(()=>({unexpected:true}),error=>({message:error.message,status:error.status}));};document.body.append(button); })()`);
        await child.click('#workspace-test-call');
        if (operation.confirm) {
          await browser.waitFor("document.querySelector('[data-page-dialog=confirm]')?.textContent.includes('/confirmed/folder')");
          await browser.click('[data-page-dialog=confirm] [type=submit]');
        }
        const request = await barrier.next();
        assert.equal(new URL(request.request.url).pathname, "/projects/" + projectId + operation.path);
        assert.deepEqual(JSON.parse(request.request.postData ?? "null"), operation.body);
        await command("Fetch.fulfillRequest", { requestId: request.requestId, responseCode: 500,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from("{}").toString("base64") }, sessionId);
        assert.deepEqual(await child.evaluate("window.workspaceResult"), { message: operation.expected, status: 500 });
        await child.evaluate("document.querySelector('#workspace-test-call').remove()");
      } finally { await barrier.close(); }
    }
  }
});
