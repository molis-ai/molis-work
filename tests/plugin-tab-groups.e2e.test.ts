import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

/** WCAG contrast of every tab title in a group against the tint it sits on, composited over the desk. */
const GROUP_CONTRAST = `(() => {
  const rgb = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const desk = rgb(getComputedStyle(document.body).backgroundColor);
  return [...document.querySelectorAll("[data-titlebar-tabs] .tab-group .tab-item")].map((tab) => {
    let bg = over(rgb(getComputedStyle(tab.closest(".tab-group")).backgroundColor), desk);
    const own = rgb(getComputedStyle(tab).backgroundColor);
    if (own[3]) bg = over(own, bg);
    const a = lum(rgb(getComputedStyle(tab.querySelector(".tab-item-name")).color)), b = lum(bg);
    return { tab: tab.dataset.plugin + "/" + tab.dataset.tabKind, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
})()`;

test("RAC2804 RAC2805 RAC2806: the right Goals page stays readable beside CORE", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, origin, projectId } = browser;
  const phases: Array<{ action: string; at: number }> = [];
  const mark = (action: string) => { phases.push({ action, at: Date.now() }); if (phases.length > 12) phases.shift(); };
  const click: typeof browser.click = (selector, options) => { mark('click ' + selector); return browser.click(selector, options); };
  const waitFor: typeof browser.waitFor = (expression, timeout) => { mark('wait ' + expression.slice(0, 180)); return browser.waitFor(expression, timeout); };
  const navigate: typeof browser.navigate = action => { mark('navigate'); return browser.navigate(action); };
  const reloadPage = () => { mark('reload'); return browser.reloadPage(); };
  const frameEvents: unknown[] = [];
  for (const method of ['Page.frameAttached', 'Page.frameDetached', 'Page.frameNavigated']) t.after(browser.on(method, (params, session) => {
    frameEvents.push({ method, session, frame: params.frame, frameId: params.frameId, reason: params.reason });
    if (frameEvents.length > 12) frameEvents.shift();
  }));
  t.signal.addEventListener('abort', () => t.diagnostic('T405 Goals beside CORE aborted ' + JSON.stringify({ phases, frameEvents })), { once: true });
  try {
  const coreTitle = "让每项工作都有可信的完成依据";
  const coreOutcome = "用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成";
  const interfacesTitle = "让不同 AI 对话看到同一项目进度";
  const interfacesOutcome = "用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作";
  const pane = (id: string) => `[data-tab-pane=${JSON.stringify(id)}]`;
  const activeFrame = (id: string) => `[...document.querySelectorAll('iframe[data-pane-owner=${JSON.stringify(id)}]')].find(f => !f.hidden)`;
  const gesture = async (point: { x: number; y: number }, clicks = 2) => {
    for (let count = 1; count <= clicks; count += 1) for (const type of ["mousePressed", "mouseReleased"] as const) {
      await command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: count }, sessionId);
    }
  };
  const framePoint = async (id: string, selector: string, requireFrame = true) => evaluate<{ x: number; y: number }>(`(async () => {
    const f=${activeFrame(id)}, d=f?.contentDocument || document, row=d.querySelector(${JSON.stringify(selector)});
    if (${requireFrame} && !f) throw new Error('Missing active pane iframe');
    if (!row) throw new Error('Missing visible row: ' + ${JSON.stringify(selector)});
    row.scrollIntoView({block:'nearest',behavior:'instant'});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r=row.getBoundingClientRect(), offset=f?.getBoundingClientRect() || {left:0,top:0};
    const innerX=r.left+Math.min(40,r.width/2), innerY=r.top+r.height/2;
    const hit=d.elementFromPoint(innerX,innerY), x=offset.left+innerX, y=offset.top+innerY;
    if (!r.width || !r.height || !row.contains(hit) || (f && document.elementFromPoint(x,y)!==f)) throw new Error('Pane pointer target is not visible: ' + ${JSON.stringify(selector)});
    return {x,y};
  })()`);
  await browser.setViewport(1440, 1000);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await click('[data-board-view-tab="list"]');
  await waitFor("document.querySelector('.tree-node[data-select-goal=CORE]')?.getClientRects().length > 0");
  await evaluate("window.__t380CoreTrusted = []; document.addEventListener('pointerdown', e => { const row=e.target.closest('[data-select-goal]'); if (row) window.__t380CoreTrusted.push({id:row.dataset.selectGoal,trusted:e.isTrusted}); }, true)");
  const corePoint = await evaluate<{ x: number; y: number }>("(() => { const r=document.querySelector('.tree-node[data-select-goal=CORE]').getBoundingClientRect(); return {x:r.left+Math.min(40,r.width/2),y:r.top+r.height/2}; })()");
  await gesture(corePoint);
  await waitFor("document.querySelector('.tab-item[aria-current][data-item-id=CORE]') && document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  assert.deepEqual(await evaluate("window.__t380CoreTrusted"), [{ id: "CORE", trusted: true }, { id: "CORE", trusted: true }]);
  await click('[data-tab-split]');
  await click('[data-layout-split="right"]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const paneIds = await evaluate<string[]>("[...document.querySelectorAll('[data-tab-pane]')].sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(p=>p.dataset.tabPane)");
  const [leftId, rightId] = paneIds;
  await waitFor(`document.querySelector(${JSON.stringify(pane(rightId))})?.querySelector('.tab-item[aria-current][data-item-id=CORE]') && ${activeFrame(rightId)}?.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'`, 30_000);
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-frame-goal-title]')?.textContent`), coreTitle);
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  assert.equal(await evaluate(`${activeFrame(rightId)}.contentDocument.querySelector('[data-frame-goal-title]')?.textContent`), coreTitle);
  assert.equal(await evaluate(`${activeFrame(rightId)}.contentDocument.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  const leftCoreTabId = await evaluate<string>(`document.querySelector(${JSON.stringify(pane(leftId))}).querySelector('.tab-item[aria-current][data-item-id=CORE]').dataset.tabId`);
  await click(`${pane(rightId)} .tab-item[data-tab-kind=plugin][data-plugin=goals] .tab-item-trigger`);
  const rightPage = `(${activeFrame(rightId)})`;
  await waitFor(`${rightPage}?.contentDocument?.readyState === 'complete' && !${rightPage}.contentWindow.location.search.includes('paneItem=')`, 30_000);
  // RAC2804: the correct right document, its current page tab, and a readable INTERFACES row agree.
  await waitFor(`${rightPage}.contentDocument.querySelector('.tree-node[data-select-goal=INTERFACES]')?.getClientRects().length > 0`, 10_000);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(pane(rightId))}).querySelector('.tab-item[aria-current]')?.dataset.tabKind`), "plugin");
  assert.equal(await evaluate(`${rightPage}.contentDocument.querySelector('[data-goal-canvas-shell]').hidden`), false);
  assert.equal(await evaluate(`${rightPage}.contentDocument.body.innerText.includes(${JSON.stringify(interfacesTitle)})`), true);
  assert.equal(await evaluate(`${rightPage}.contentDocument.querySelector('[data-goal-canvas-shell]').closest('[data-tab-pane-body]') != null`), true);
  assert.equal(await evaluate(`${activeFrame(leftId)}?.contentDocument?.querySelector('[data-frame-goal-title]')?.textContent`), coreTitle);
  assert.equal(await evaluate(`${activeFrame(leftId)}?.contentDocument?.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  await evaluate(`window.__t380RightTrusted=[]; ${rightPage}.contentDocument.addEventListener('pointerdown', e => { const row=e.target.closest('[data-select-goal]'); if (row) window.__t380RightTrusted.push({id:row.dataset.selectGoal,trusted:e.isTrusted,url:e.view.location.href}); }, true)`);
  await gesture(await framePoint(rightId, '.tree-node[data-select-goal=INTERFACES]'));
  // RAC2805: a real double click in the right iframe opens its item and leaves left CORE intact.
  await waitFor(`document.querySelector(${JSON.stringify(pane(rightId))}).querySelector('.tab-item[aria-current][data-item-id=INTERFACES]') && ${activeFrame(rightId)}?.contentWindow.location.search.includes('paneItem=INTERFACES') && ${activeFrame(rightId)}?.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'INTERFACES'`, 30_000);
  assert.deepEqual(await evaluate("window.__t380RightTrusted.map(({id,trusted})=>({id,trusted}))"), [{ id: "INTERFACES", trusted: true }, { id: "INTERFACES", trusted: true }]);
  assert.equal(await evaluate(`window.__t380RightTrusted.every(r=>r.url.includes('workbenchPane=${rightId}') && !r.url.includes('paneItem='))`), true);
  assert.equal(await evaluate(`${activeFrame(rightId)}.contentDocument.querySelector('[data-frame-goal-title]')?.textContent`), interfacesTitle);
  assert.equal(await evaluate(`${activeFrame(rightId)}.contentDocument.querySelector('[data-frame-goal-outcome]')?.textContent`), interfacesOutcome);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(pane(leftId))}).querySelector('.tab-item[aria-current]')?.dataset.tabId`), leftCoreTabId);
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal`), "CORE");
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  await click(`${pane(rightId)} .tab-item[data-tab-kind=plugin][data-plugin=goals] .tab-item-trigger`);
  await waitFor(`${rightPage}?.contentDocument?.querySelector('.tree-node[data-select-goal=INTERFACES]')?.getClientRects().length > 0 && !${rightPage}.contentWindow.location.search.includes('paneItem=')`, 30_000);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(pane(rightId))}).querySelector('.tab-item[data-item-id=CORE]') != null`), true);
  // RAC2806: reload retains the distinct page and item, then closing right retains the original left CORE tab.
  await reloadPage();
  await waitFor(`document.querySelector(${JSON.stringify(pane(leftId))})?.querySelector('.tab-item[aria-current][data-item-id=CORE]') && ${activeFrame(leftId)}?.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'`, 30_000);
  await waitFor(`${rightPage}?.contentDocument?.querySelector('.tree-node[data-select-goal=INTERFACES]')?.getClientRects().length > 0`, 30_000);
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-frame-goal-title]')?.textContent`), coreTitle);
  assert.equal(await evaluate(`${activeFrame(leftId)}.contentDocument.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  assert.equal(await evaluate(`${rightPage}.contentDocument.body.innerText.includes(${JSON.stringify(interfacesTitle)})`), true);
  await click(`${pane(rightId)} [data-tab-pane-close]`);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1");
  assert.equal(await evaluate(`document.querySelector('[data-tab-pane]')?.dataset.tabPane`), leftId);
  await waitFor(`document.querySelector('[data-titlebar-tabs][data-chrome-pane=${JSON.stringify(leftId)}] .tab-item[aria-current][data-item-id=CORE]')`);
  assert.equal(await evaluate(`document.querySelector('[data-titlebar-tabs] .tab-item[aria-current]')?.dataset.tabId`), leftCoreTabId);
  const remainingCore = `((${activeFrame(leftId)})?.contentDocument || document)`;
  await waitFor(`${remainingCore}.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && ${remainingCore}.querySelector('[data-frame-goal-work]')?.getClientRects().length > 0`, 30_000);
  assert.equal(await evaluate(`${remainingCore}.querySelector('[data-frame-goal-title]')?.textContent`), coreTitle);
  assert.equal(await evaluate(`${remainingCore}.querySelector('[data-frame-goal-outcome]')?.textContent`), coreOutcome);
  await gesture(await framePoint(leftId, '[data-frame-goal-work]', false), 1);
  await waitFor(`${remainingCore}.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === 'CORE' && ${remainingCore}.querySelector('[data-goal-node-workspace]')?.getClientRects().length > 0`, 30_000);
  } catch (error) {
    const state = await command('Runtime.evaluate', { expression: "(()=>({url:location.href,ready:document.readyState,visibility:document.visibilityState,focus:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,180),surface:document.body?.dataset.desktopSurface,viewport:[innerWidth,innerHeight],panes:[...document.querySelectorAll('[data-tab-pane]')].map(p=>({id:p.dataset.tabPane,focused:p.classList.contains('is-focused'),tabs:[...p.querySelectorAll('.tab-item')].map(t=>({id:t.dataset.tabId,plugin:t.dataset.plugin,kind:t.dataset.tabKind,item:t.dataset.itemId,current:t.hasAttribute('aria-current')}))})),frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({src:f.src,hidden:f.hidden,connected:f.isConnected,pane:f.dataset.paneOwner,tab:f.dataset.paneTab,ready:f.contentDocument?.readyState,surface:f.contentDocument?.body?.dataset.desktopSurface,roots:[...f.contentDocument?.querySelectorAll('[data-ui-client-state]')||[]].map(r=>({state:r.dataset.uiClientState,plugin:r.dataset.pluginOwner,page:r.dataset.pluginPage,hidden:r.hidden})),children:[...f.contentDocument?.querySelectorAll('iframe[data-plugin-frame]')||[]].map(c=>({surface:c.dataset.pluginFrame,src:c.src,connected:c.isConnected}))}))}))()", returnByValue: true }, sessionId, 1500).catch(observation => ({ unavailable: String(observation) }));
    t.diagnostic('T405 Goals beside CORE failed ' + JSON.stringify({ phases, frameEvents, state }));
    throw error;
  }
});

test("RAC-2515 FULL16: revision updates and a hidden refresh retain the item tab of a real structured frame", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { projectId, store, localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const source = createLocalFeedSourceService(store.db, projectId!).register({ kind: "web_query", query: "frame item binding", name: "Frame binding" }).source;
  const feedLibrary = createLocalFeedApplication(store.db);
  const make = (name: string) => feedLibrary.ingestItem({ source, externalId: "frame-binding-" + name, title: "Binding " + name, summary: "Item navigation after a display update", body: "Body " + name, occurredAt: new Date().toISOString(), attention: false }).item;
  const a = make("A"), b = make("B");
  await pluginFrameInitScript(t, browser, `
    window.t403Tagged=[];window.t403HiddenSignals=0;
    addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='molis:plugin-connect')window.t403InitialItem=event.data.config.itemTab;},true);
    const descriptor=Object.getOwnPropertyDescriptor(MessagePort.prototype,'onmessage');
    Object.defineProperty(MessagePort.prototype,'onmessage',{...descriptor,set(handler){const port=this;descriptor.set.call(port,typeof handler!=='function'?handler:event=>{if(event.data?.type==='ui'&&event.data.name==='openItem')window.t403Tagged.push({tab:event.data.itemTabId,id:event.data.args[1]});handler.call(port,event);});}});
    let frameApi;Object.defineProperty(globalThis,'molisPluginFrames',{configurable:true,get:()=>frameApi,set(api){const mount=api.mount;api.mount=(root,host,pack)=>{if(pack.id==='feed'){const request=globalThis.molisWorkRequest;let pollingSignal,polls=0;globalThis.molisWorkRequest=Object.assign(async(...args)=>{const own=root.dataset.pluginSurface==='workbench'&&String(args[0]).endsWith('/io.molis.work.feed/view-revision')&&args[1]?.signal&&args[1].headers?.['x-molis-plugin-page']===root.dataset.pluginPage;if(own){if(pollingSignal!==args[1].signal){pollingSignal=args[1].signal;polls=0;}window.t403OwningPolls=++polls;window.t403PollingPage=root.dataset.pluginPage;}const value=await request(...args);if(own&&!args[1].signal.aborted)window.t403PolledRevision=value.revision;return value;},request);window.t403TrustedRefresh=()=>host.invalidateView(root);root.addEventListener('molis-work:select-item',event=>{if(event.detail?.invalidate&&!root.checkVisibility())window.t403HiddenSignals++;});}return mount(root,host,pack);};frameApi=api;}});
    globalThis.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){target[key]=host=>{if(key==='feed'){
      window.t403Host=host;window.t403Invalidations=0;window.t403PendingReads=0;window.t403ReadTrace=[];
      // Hold actual read results: the initial selected detail stays pending until a real refresh has taken it over.
      const handoff=window.t403ReadHandoff={initial:null,refresh:null,takeover:null,refreshWaiters:[],releaseRefresh(){this.refreshReleased=true;for(const release of this.refreshWaiters.splice(0))release();},releaseAll(){this.releaseInitial?.();this.releaseRefresh();}};
      host.scope.own(()=>handoff.releaseAll());
      let sequence=0;const read=host.view.readDocument;
      host.view.readDocument=async(...args)=>{
        const object=args[0]?.object,entry={id:++sequence,object,phase:'start'};
        const initial=object?.surface==='persisted-detail'&&!handoff.initial;
        const refresh=!object&&!handoff.refreshReleased;
        if(initial)handoff.initial={request:entry.id,itemId:object.id};
        if(refresh&&!handoff.refresh)handoff.refresh={request:entry.id};
        if(object?.surface==='persisted-detail'&&!initial&&handoff.refreshReleased&&!handoff.initialReleased&&!handoff.takeover)handoff.takeover={request:entry.id,itemId:object.id};
        t403ReadTrace.push(entry);t403ReadTrace.splice(0,Math.max(0,t403ReadTrace.length-8));t403PendingReads++;
        try{
          let value,failure,failed=false;
          try{value=await read(...args);}catch(error){failure=error;failed=true;}
          entry.outcome=failed?'error':'ok';
          if(initial){handoff.initialSettled=failed?'error':'ok';entry.phase='held';await new Promise(resolve=>{handoff.releaseInitial=()=>{handoff.initialReleased=true;resolve();};});}
          if(refresh&&!handoff.refreshReleased){entry.phase='held';await new Promise(resolve=>handoff.refreshWaiters.push(resolve));}
          if(failed)throw failure;
          entry.phase='ok';return value;
        }catch(error){entry.phase='error';entry.error={name:error?.name,code:error?.code,message:String(error?.message||error).slice(0,160)};throw error;}
        finally{t403PendingReads--;}
      };
      host.root.addEventListener('molis-work:select-item',event=>{if(event.detail?.invalidate)window.t403Invalidations++;});
    }return factory(host);};return true;}});
  `);
  const feed = await pluginFrameBrowser(t, browser, "feed");
  await browser.setViewport(1440, 1000);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=feed&openItem=${a.item_id}` }, sessionId));
  await feed.waitFor("window.t403Host?.mount?.surface==='workbench' && window.t403InitialItem");
  const initial = await feed.evaluate<{ tabId: string; itemId: string }>("window.t403InitialItem");
  assert.equal(initial.itemId, a.item_id);
  await feed.waitFor("Boolean(t403ReadHandoff.initialSettled)");
  assert.equal(await feed.evaluate("t403ReadHandoff.initial.itemId"), a.item_id, "the held result is the actual initial A detail read");
  // Use the existing owning page's real invalidation path while the initial A result is held.
  await evaluate("t403TrustedRefresh()");
  await feed.waitFor("t403ReadTrace.some(entry=>!entry.object && entry.id>t403ReadHandoff.initial.request && entry.phase==='held' && entry.outcome==='ok')");
  await feed.evaluate("t403ReadHandoff.releaseRefresh()");
  try { await feed.waitFor("Boolean(t403ReadHandoff.takeover)"); }
  catch (error) {
    t.diagnostic("FULL16 handoff setup " + JSON.stringify(await feed.evaluate("({initial:t403ReadHandoff.initial,initialSettled:t403ReadHandoff.initialSettled,refresh:t403ReadHandoff.refresh,refreshReleased:t403ReadHandoff.refreshReleased,initialReleased:t403ReadHandoff.initialReleased,takeover:t403ReadHandoff.takeover,pending:t403PendingReads,trace:t403ReadTrace})").catch(observation=>({observation:String(observation)}))));
    throw error;
  }
  const takeoverRead = await feed.evaluate<{ initial: { itemId: string }; takeover: { itemId: string }; initialSettled: string; refreshReleased: boolean; initialReleased?: boolean; trace: unknown[] }>("({initial:t403ReadHandoff.initial,takeover:t403ReadHandoff.takeover,initialSettled:t403ReadHandoff.initialSettled,refreshReleased:t403ReadHandoff.refreshReleased,initialReleased:t403ReadHandoff.initialReleased,trace:t403ReadTrace})");
  assert.equal(takeoverRead.takeover.itemId, a.item_id, "the real list refresh takes over the same selected A before its first result is delivered");
  assert.equal(takeoverRead.refreshReleased, true); assert.notEqual(takeoverRead.initialReleased, true);
  t.diagnostic("FULL16 real read handoff " + JSON.stringify(takeoverRead));
  await feed.evaluate("t403ReadHandoff.releaseInitial()");
  await waitFor("t403OwningPolls>=2 && t403PollingPage===document.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench]').dataset.pluginPage");
  assert.ok(localHost.homePlugins);
  const platform = await localHost.homePlugins.ready();
  assert.ok(platform);
  const rowState = () => feed.evaluate<{ visible: boolean }>(`(()=>{const target=document.querySelector('[data-frame-asset=feed][data-frame-asset-id="${b.item_id}"]');return{visible:Boolean(target?.checkVisibility()),workbench:{...document.querySelector('[data-feed-workbench]').dataset},filters:[...document.querySelectorAll('[data-feed-search],[data-feed-source-filter],[data-feed-type-filter],[data-feed-time-filter],[data-feed-status-filter]')].map(field=>({name:[...field.attributes].find(a=>a.name.startsWith('data-feed-')).name,value:field.value})),rows:[...document.querySelectorAll('[data-feed-entry-id]')].map(row=>({id:row.dataset.feedEntryId,type:row.dataset.feedEntryType,source:row.dataset.feedEntrySourceId,status:row.dataset.feedEntryStatus,visible:row.checkVisibility(),hidden:row.closest('[data-feed-item-wrap]')?.hidden})),ancestors:(()=>{const nodes=[];for(let node=target;node;node=node.parentElement)nodes.push({tag:node.tagName,class:node.className,hidden:node.hidden,display:getComputedStyle(node).display});return nodes;})()};})()`);
  const beforeRevision = await rowState();
  assert.equal(beforeRevision.visible, true, JSON.stringify(beforeRevision));
  try { await feed.waitFor(`document.querySelector('[data-feed-entry-id="${a.item_id}"]').dataset.feedEntryRead==='read' && t403PendingReads===0`); }
  catch (error) {
    t.diagnostic('revision owner read state '+JSON.stringify(await feed.evaluate(`({pending:t403PendingReads,trace:t403ReadTrace,row:{...document.querySelector('[data-feed-entry-id="${a.item_id}"]')?.dataset},expanded:document.querySelector('[data-feed-stage-shell]')?.dataset.expanded,retry:document.querySelector('[data-retry-feed-detail]')?.checkVisibility(),placeholder:document.querySelector('[data-feed-detail-empty]')?.textContent})`).catch(observation=>({observation:String(observation)}))));
    throw error;
  }
  const revision = platform.viewRevision("io.molis.work.feed");
  await waitFor(`t403PolledRevision===${JSON.stringify(revision)}`);
  assert.equal(await evaluate("t403PolledRevision"), revision, "the actual owning page reads the Home instance's Feed revision");
  const beforeInvalidation = await feed.evaluate<number>("t403Invalidations");
  platform.invalidateView("io.molis.work.feed");
  const nextRevision = platform.viewRevision("io.molis.work.feed");
  assert.notEqual(nextRevision, revision);
  await waitFor(`t403PolledRevision===${JSON.stringify(nextRevision)}`);
  await feed.waitFor(`t403Invalidations>${beforeInvalidation} && t403PendingReads===0`);
  const afterRevision = await rowState();
  assert.equal(afterRevision.visible, true, JSON.stringify(afterRevision));
  await feed.click(`button[data-frame-asset=feed][data-frame-asset-id="${b.item_id}"]`);
  const layout = () => evaluate<{ focusedPaneId: string; panes: Array<{ id: string; activeTabId: string; tabs: Array<{ id: string; itemId?: string }> }> }>(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}'))`);
  await waitFor(`(()=>{const state=JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}')),pane=state.panes.find(p=>p.id===state.focusedPaneId);return pane.tabs.find(tab=>tab.id===pane.activeTabId)?.itemId===${JSON.stringify(b.item_id)};})()`);
  const saved = await layout(), pane = saved.panes.find(p => p.id === saved.focusedPaneId)!, bTab = pane.activeTabId;
  assert.deepEqual(await evaluate("t403Tagged.at(-1)"), { tab: initial.tabId, id: b.item_id }, "a real click after a revision still names its original item tab");
  await click("[data-plugin-picker-toggle]"); await click('[data-plugin-strip] [data-plugin-id=goals]');
  await waitFor("document.body.dataset.desktopSurface==='goals'");
  const invalidations = await feed.evaluate<number>("t403Invalidations");
  await evaluate("t403TrustedRefresh()");
  await waitFor("t403HiddenSignals>0");
  assert.equal(await feed.evaluate("t403Invalidations"), invalidations, "the hidden root queues its refresh instead of sending it to the child");
  await click(`[data-titlebar-tabs] .tab-item[data-tab-id="${bTab}"] .tab-item-trigger`);
  await feed.waitFor(`t403Invalidations>${invalidations} && t403PendingReads===0 && document.body.hidden===false`);
  await feed.click(`button[data-frame-asset=feed][data-frame-asset-id="${a.item_id}"]`);
  await waitFor(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}')).panes.find(p=>p.id===${JSON.stringify(pane.id)}).activeTabId===${JSON.stringify(initial.tabId)}`);
  assert.deepEqual(await evaluate("t403Tagged.at(-1)"), { tab: bTab, id: a.item_id }, "a real click after the queued refresh still names B's item tab");
  assert.equal((await layout()).panes.find(p => p.id === pane.id)!.tabs.filter(tab => tab.itemId === a.item_id).length, 1, "returning to A reuses its exact original tab");
});

test("PTG-01 PTG-06 PTG-07 PTG-09 plugins stay on the strip as coloured groups; ⌘-click opens a record in its group", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await addProjectPlugin(browser.web, projectId!, "feed");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  const plugin = (id: string) => `[data-titlebar-tabs] .tab-item[data-tab-kind=plugin][data-plugin=${id}]`;

  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(`document.querySelector('${plugin("goals")}[aria-current]')`);
  await click("[data-titlebar-tabs] [data-tab-add]");
  await click("[data-tab-menu-action=open-feed]");
  await waitFor(`document.querySelector('${plugin("feed")}[aria-current]') && document.querySelector('${plugin("goals")}:not([aria-current])')`);
  // PTG-07 the plugin tab is the place; no location chip ahead of the tabs.
  assert.equal(await evaluate("document.querySelector('.tab-view-chip:not(.is-exclusive)')"), null);
  await click(`${plugin("goals")} .tab-item-trigger`);
  await waitFor(`document.body.dataset.desktopSurface === 'goals' && document.querySelector('${plugin("goals")}[aria-current]')`);

  // PTG-06 a ⌘-click on a Goal in the list opens it in the Goals group and the pane stays on the list.
  // D24 the Goals tree does not pick several, so the ⌘-click is still the tab group's (the other side of the D24 case below).
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('.tree-node[data-select-goal=\"CORE\"]')?.getClientRects().length > 0");
  const point = await evaluate<{ x: number; y: number }>("(() => { const r = document.querySelector('.tree-node[data-select-goal=\"CORE\"]').getBoundingClientRect(); return { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2 }; })()");
  for (const type of ["mousePressed", "mouseReleased"] as const) {
    await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1, modifiers: 4 }, sessionId);
  }
  await waitFor("document.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')");
  assert.equal(await evaluate(`document.querySelector('${plugin("goals")}')?.getAttribute('aria-current')`), "page");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-plugin-group=goals] .tab-item')].map((tab) => tab.dataset.tabKind).join()"), "plugin,item");

  // PTG-09 a plugin's group takes the plugin's hue, and every title in it reads at 4.5:1 or better in both themes.
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=goals]').style.getPropertyValue('--group-color')"), "var(--hue-blue)");
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=feed]').style.getPropertyValue('--group-color')"), "var(--hue-brown)");
  for (const scheme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`(() => { document.documentElement.dataset.theme = "${scheme}"; document.documentElement.dataset.resolvedTheme = "${scheme}"; })()`);
    await waitFor(`getComputedStyle(document.body).getPropertyValue('--hue-blue').trim() === ${JSON.stringify(scheme === "light" ? "#3c6fc6" : "#8fb2f5")}`);
    const low = (await evaluate<Array<{ tab: string; ratio: number }>>(GROUP_CONTRAST)).filter((entry) => entry.ratio < 4.5);
    assert.deepEqual(low, [], `${scheme}: every title in a group reads at 4.5:1`);
  }

  // PTG-06 in a split pane (an iframe) the ⌘-click is handed to the workbench and opens in that pane's Goals group.
  await evaluate("document.querySelector('[data-plugin-group=goals] .tab-item[data-item-id=CORE] [data-tab-close]').click()");
  await waitFor("!document.querySelector('[data-plugin-group=goals] .tab-item[data-item-id=CORE]')");
  await evaluate(`(() => {
    const transfer = new DataTransfer(), body = document.querySelector('[data-tab-pane-body]'), r = body.getBoundingClientRect();
    document.querySelector('${plugin("feed")}').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width * 0.95, clientY: r.top + r.height / 2 };
    body.dispatchEvent(new DragEvent('dragover', at)); body.dispatchEvent(new DragEvent('drop', at));
  })()`);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const goalsPaneId = await evaluate<string>("[...document.querySelectorAll('[data-tab-pane]')].find((pane) => pane.querySelector('[data-plugin-group=goals]')).dataset.tabPane");
  const goalsPaneSelector = `[data-tab-pane=${JSON.stringify(goalsPaneId)}]`;
  const goalsPane = `document.querySelector(${JSON.stringify(goalsPaneSelector)})`;
  await evaluate(`${goalsPane}.querySelector('.tab-item[data-tab-kind=plugin][data-plugin=goals] .tab-item-trigger').click()`);
  const frame = `document.querySelector('iframe[data-pane-owner="' + ${goalsPane}.dataset.tabPane + '"]')`;
  await waitFor(`${frame}?.contentDocument?.querySelector('[data-record-owner=goals] [data-tree-item][data-goal-id=CORE]')`, 30_000);
  await evaluate(`(() => { const f = ${frame}; f.contentDocument.querySelector('[data-tree-item][data-goal-id=CORE] .tree-node').dispatchEvent(new f.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true, ctrlKey: true })); })()`);
  await waitFor(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')`);
  assert.equal(await evaluate(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[aria-current]')?.dataset.tabKind`), "plugin", "the pane stays on the Goals page");

  // PRR-07 PTG-05: the parent owns the split pane's visible strip; the embedded page's strip is hidden and does not own CORE.
  // Keep the pane identity through closing the group, then use its visible undo chip to restore the group and current page.
  await click(`${goalsPaneSelector} [data-tab-kind=plugin][data-plugin=goals] [data-tab-close]`);
  await waitFor(`!${goalsPane}.querySelector('[data-plugin-group=goals] [data-tab-kind=plugin][data-plugin=goals]')`);
  await waitFor(`${goalsPane}.querySelector('[data-tab-undo]')`, 10_000);
  await click(`${goalsPaneSelector} [data-tab-undo]`);
  await waitFor(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')`);
  assert.equal(await evaluate(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[aria-current]')?.dataset.tabKind`), "plugin", "undo restores the Goals page as current");
});

test("D24 a list that picks several keeps ⌘-click for picking; a middle click there still opens the page behind", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const store = openPagesStore(homeDirectory);
  const pages = (() => { try { return ["A", "B", "C"].map((letter) => store.create({ project_id: projectId!, title: `Page ${letter}`, body: { type: "doc", content: [] } })); } finally { store.close(); } })();
  const [a, b, c] = pages.map((page) => page.id) as [string, string, string];
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${a}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-rows] button[data-page-id="${c}"]')?.getClientRects().length > 0`);
  const selected = `[...document.querySelectorAll('[data-pages-rows] button[data-page-id]')].filter((row) => row.getAttribute('aria-selected') === 'true').map((row) => row.dataset.pageId).sort().join()`;
  assert.deepEqual(await child.evaluate(`(() => { const list = document.querySelector('[data-pages-rows]'); return [list.getAttribute('role'), list.getAttribute('aria-multiselectable'), list.querySelector('button[data-page-id]').getAttribute('role')]; })()`),
    ["listbox", "true", "option"], "the list says it picks several");
  const press = async (id: string, button: "left" | "middle", modifiers: number) => {
    const point = await child.point(`[data-pages-rows] button[data-page-id="${id}"]`);
    for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button, clickCount: 1, modifiers }, sessionId);
  };

  // D24 a real ⌘-click on B picks it, with the open A, and opens no tab.
  await press(b, "left", 4);
  await child.waitFor(`(${selected}) === ${JSON.stringify([a, b].sort().join())} && document.querySelectorAll('[data-pages-rows] .pages-doc-row.is-picked').length === 2`);
  assert.equal(await evaluate(`document.querySelector('[data-plugin-group=pages] .tab-item[data-tab-kind=item][data-item-id="${b}"]')`), null, "a ⌘-click in the list opens no tab");

  // D24 a middle click on C still opens it behind in the Pages group; the picks and the open page stay. The page was
  // opened with openItem, so the current tab is A's item tab (or the Pages tab): whichever it is, it stays current.
  const current = `(() => { const tab = document.querySelector('[data-titlebar-tabs] .tab-item[aria-current]'); return tab ? tab.dataset.tabKind + ":" + (tab.dataset.itemId ?? tab.dataset.plugin) : null; })()`;
  const before = await evaluate<string | null>(current);
  assert.ok(before === `item:${a}` || before === "plugin:pages", `the pane is on Pages before the middle click (${before})`);
  await press(c, "middle", 0);
  await waitFor(`document.querySelector('[data-plugin-group=pages] .tab-item[data-tab-kind=item][data-item-id="${c}"]')`);
  assert.equal(await evaluate(current), before, "the pane stays where it was");
  assert.equal(await child.evaluate("document.querySelector('[data-pages-title]')?.value"), "Page A", "A stays open in the editor");
  assert.equal(await child.evaluate(selected), [a, b].sort().join(), "the middle click leaves the picks alone");
});


test("T405-FULL-16 FULL16-A FULL16-B: item navigation preserves the original Pages editor and refuses stale tagged frame intents", { timeout: 120_000 }, async t => {
  const heldSaves: Array<() => void> = [];
  t.after(() => { heldSaves.splice(0).forEach(release => release()); });
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { evaluate, waitFor, click, navigate, command, sessionId, origin, projectId, homeDirectory, server } = browser;
  const store = openPagesStore(homeDirectory);
  const makePage = (name: string) => store.create({ project_id: projectId!, title: `Item ${name}`, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Saved body ${name}` }] }] } });
  const a = makePage("A"), b = makePage("B"), c = makePage("C"), d = makePage("D"); store.close();
  let holdSaves = false, heldStatus = 0, saveArrived!: () => void;
  const saveHeld = new Promise<void>(resolve => { saveArrived = resolve; });
  const handlers = server.listeners("request"); server.removeAllListeners("request");
  server.on("request", (request, response) => {
    if (holdSaves && request.method === "POST" && new URL(request.url!, origin).pathname === `/projects/${projectId}/api/plugins/io.molis.work.pages/pages/${a.id}`) {
      const end = response.end;
      response.end = (...args: Parameters<typeof end>) => {
        heldStatus = response.statusCode;
        heldSaves.push(() => { Reflect.apply(end, response, args); }); saveArrived();
        return response;
      };
    }
    for (const handler of handlers) handler.call(server, request, response);
  });
  await pluginFrameInitScript(t, browser, `
    window.t405HeldItemIntents=[];window.t405TaggedCount=0;window.t405IntentBarriers=0;
    addEventListener('message',event=>{
      if(event.data?.type==='t405-record-intent-barrier')window.t405IntentBarriers++;
      if(event.source===parent&&event.data?.type==='molis:plugin-connect')window.t405InitialItem=event.data.config.itemTab;
    },true);
    const descriptor=Object.getOwnPropertyDescriptor(MessagePort.prototype,'onmessage');
    Object.defineProperty(MessagePort.prototype,'onmessage',{...descriptor,set(handler){
      const port=this;
      descriptor.set.call(port,typeof handler!=='function'?handler:event=>{
        if(event.data?.type==='ui'&&event.data.name==='openItem'&&event.data.itemTabId){
          window.t405TaggedCount++;
          if(window.t405HoldItemIntent){window.t405HeldItemIntents.push({message:event.data,deliver:()=>handler.call(port,event)});return;}
        }
        handler.call(port,event);
      });
    }});
    window.t405ReleaseItemIntent=()=>{const held=window.t405HeldItemIntents.shift();if(!held)throw Error('No held record intent');held.deliver();parent.postMessage({type:'t405-record-intent-barrier'},location.origin);};
    let frameApi;
    Object.defineProperty(globalThis,'molisPluginFrames',{configurable:true,get:()=>frameApi,set(api){
      const mount=api.mount;
      api.mount=(root,host,pack)=>{if(pack.id==='pages'&&!host.side&&new URL(location.href).searchParams.get('paneItem')===${JSON.stringify(a.id)}){window.t405EarlySelects=(window.t405EarlySelects||0)+1;root.dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(a.id)}}}));}return mount(root,host,pack);};frameApi=api;
    }});
    globalThis.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){target[key]=host=>{
      if(key==='pages'&&!host.side){window.t405Host=host;const editor=window.MolisWorkPagesEditor;
        window.MolisWorkPagesEditor={...editor,mount(...args){return window.t405Editor=editor.mount(...args);}};}
      return factory(host);
    };return true;}});
  `);
  const aRight = await pluginFrameBrowser(t, browser, "pages", 'iframe[data-full16-owner="right-a"]');
  const aLeft = await pluginFrameBrowser(t, browser, "pages", 'iframe[data-full16-owner="left-a"]');
  const bRight = await pluginFrameBrowser(t, browser, "pages", 'iframe[data-full16-owner="right-b"]');
  const defaultPage = await pluginFrameBrowser(t, browser, "pages", 'iframe[data-full16-owner="right-default"]');
  await browser.setViewport(2200, 1000);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${a.id}` }, sessionId));
  await waitFor("document.querySelector('[data-tab-edge=right]')");
  await evaluate("document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length===2 && document.querySelectorAll('iframe[data-pane-owner]:not([hidden])').length===2");
  const paneIds = await evaluate<string[]>("[...document.querySelectorAll('[data-tab-pane]')].sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(p=>p.dataset.tabPane)");
  const [left, right] = paneIds;
  const layout = () => evaluate<{ panes: Array<{ id: string; activeTabId: string; tabs: Array<{ id: string; kind: string; itemId?: string; title?: string }> }> }>(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}'))`);
  const initial = await layout(), leftTab = initial.panes.find(p => p.id === left)!.activeTabId, rightTab = initial.panes.find(p => p.id === right)!.activeTabId;
  const ownerSelector = (paneId: string, tabId: string) => `iframe[data-pane-owner="${paneId}"][data-pane-tab="${tabId}"]`;
  const sourceSelector = ownerSelector(right!, rightTab);
  const ownerWindow = `document.querySelector(${JSON.stringify(sourceSelector)}).contentWindow`;
  await evaluate(`document.querySelector(${JSON.stringify(sourceSelector)}).dataset.full16Owner='right-a';document.querySelector(${JSON.stringify(ownerSelector(left!, leftTab))}).dataset.full16Owner='left-a'`);
  await aRight.waitFor("document.querySelector('[data-pages-title]')?.value==='Item A'");
  await aLeft.waitFor("document.querySelector('[data-pages-title]')?.value==='Item A'");
  const rightBinding = await aRight.evaluate<{ tabId: string; itemId: string }>("window.t405InitialItem");
  const leftBinding = await aLeft.evaluate<{ tabId: string; itemId: string }>("window.t405InitialItem");
  assert.equal(rightBinding.itemId, a.id); assert.equal(leftBinding.itemId, a.id); assert.notEqual(rightBinding.tabId, leftBinding.tabId, "initial bindings belong to their own pane, never the globally focused one");
  assert.ok(await evaluate(`${ownerWindow}.t405EarlySelects>0`), "a select deliberately preceded the mount's listener; initial config still reads the owner");
  const itemCount = async (id: string) => (await layout()).panes.find(p => p.id === right)!.tabs.filter(tab => tab.kind === "item" && tab.itemId === id).length;
  // Programmatic selection keeps its existing in-place behavior; it emits no new item intent.
  await aRight.evaluate(`document.querySelector('button[data-page-id="${b.id}"]').click()`);
  await aRight.waitFor("document.querySelector('[data-pages-title]').value==='Item B'");
  assert.equal(await itemCount(b.id), 0); assert.equal(await evaluate(`${ownerWindow}.t405TaggedCount`), 0);
  await aRight.evaluate(`document.querySelector('button[data-page-id="${a.id}"]').click()`);
  await aRight.waitFor("document.querySelector('[data-pages-title]').value==='Item A'");
  assert.equal(await aRight.evaluate(`(()=>{const row=document.querySelector('button[data-page-id="${b.id}"]'),box=row?.getBoundingClientRect();return Boolean(row?.checkVisibility()&&box.width>0&&box.height>0);})()`), true, "the actual right-A pane keeps a visible Pages row before independent control input");
  // An independent control inside a broad declared row keeps its own action, rather than opening the row's item.
  await aRight.evaluate(`(()=>{const row=document.querySelector('button[data-page-id="${b.id}"]');const control=document.createElement('span');control.dataset.t405RowControl='1';control.setAttribute('role','button');control.tabIndex=0;control.textContent='control';control.addEventListener('click',event=>{event.stopPropagation();window.t405ControlClicks=(window.t405ControlClicks||0)+1;});row.append(control);})()`);
  await aRight.click("[data-t405-row-control]");
  assert.equal(await aRight.evaluate("window.t405ControlClicks"), 1); assert.equal(await itemCount(b.id), 0);
  await aRight.evaluate("(()=>{window.t405OriginalEditor=window.t405Editor;window.t405OriginalEditorNode=document.querySelector('[data-pages-editor] .ProseMirror');})()");
  await aLeft.evaluate("void(window.t405OriginalEditorNode=document.querySelector('[data-pages-editor] .ProseMirror'))");
  await evaluate(`void(window.t405OriginalAFrame=document.querySelector(${JSON.stringify(sourceSelector)}))`);
  const draft = "Original A editor draft held across B navigation";
  holdSaves = true;
  await aRight.evaluate(`(()=>{const view=window.t405Editor.view;view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,view.state.schema.nodes.paragraph.create(null,view.state.schema.text(${JSON.stringify(draft)}))));})()`);
  await saveHeld; assert.equal(heldStatus, 200, "the real A save handler completed while its reply remains held");
  await aRight.click(`button[data-page-id="${b.id}"]`);
  await waitFor(`(()=>{const s=JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}')),p=s.panes.find(p=>p.id===${JSON.stringify(right)});return p.tabs.find(t=>t.id===p.activeTabId)?.itemId===${JSON.stringify(b.id)};})()`);
  let saved = await layout(), rightPane = saved.panes.find(p => p.id === right)!, bTab = rightPane.activeTabId;
  assert.equal(rightPane.tabs.find(tab => tab.id === rightTab)?.itemId, a.id); assert.equal(rightPane.tabs.find(tab => tab.id === bTab)?.title, "Item B");
  assert.equal(saved.panes.find(p => p.id === left)!.activeTabId, leftTab);
  await evaluate(`document.querySelector(${JSON.stringify(ownerSelector(right!, bTab))}).dataset.full16Owner='right-b'`);
  await bRight.waitFor("document.querySelector('[data-pages-title]')?.value==='Item B'");
  assert.match(await bRight.evaluate<string>("window.t405Editor.view.state.doc.textContent"), /Saved body B/);
  assert.deepEqual(await aRight.evaluate(`({id:JSON.parse(document.querySelector('[data-work-surface]').dataset.assistantContext).object.id,title:document.querySelector('[data-pages-title]').value,text:window.t405Editor.view.state.doc.textContent,sameEditor:window.t405Editor===window.t405OriginalEditor,sameNode:document.querySelector('[data-pages-editor] .ProseMirror')===window.t405OriginalEditorNode})`),
    { id: a.id, title: "Item A", text: draft, sameEditor: true, sameNode: true });
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(sourceSelector)})===window.t405OriginalAFrame && window.t405OriginalAFrame.hidden`), true);
  assert.equal(await aLeft.evaluate("document.querySelector('[data-pages-title]').value==='Item A' && document.querySelector('[data-pages-editor] .ProseMirror')===window.t405OriginalEditorNode"), true);
  assert.equal(await evaluate(`new URL(document.querySelector(${JSON.stringify(ownerSelector(right!, bTab))}).src).searchParams.get('paneItem')`), b.id, "read the actual B frame, not retained hidden A");
  const selectTab = async (id: string) => { await click(`[data-tab-pane="${right}"] [data-tab-strip] .tab-item[data-tab-id="${id}"] .tab-item-trigger`); };
  await selectTab(rightTab);
  await aRight.waitFor("document.querySelector('[data-pages-title]').value==='Item A'");
  assert.equal(await aRight.evaluate(`window.t405Editor===window.t405OriginalEditor && window.t405Editor.view.state.doc.textContent===${JSON.stringify(draft)}`), true);
  holdSaves = false; heldSaves.splice(0).forEach(release => release());
  await aRight.waitFor("document.querySelector('[data-pages-editor-status]').textContent==='已保存'");
  await aRight.click(`button[data-page-id="${b.id}"]`);
  await waitFor(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}')).panes.find(p=>p.id===${JSON.stringify(right)})?.activeTabId===${JSON.stringify(bTab)}`);
  await bRight.waitFor("document.querySelector('[data-pages-title]').value==='Item B'");
  assert.equal(await itemCount(b.id), 1); assert.equal((await layout()).panes.find(p => p.id === right)!.activeTabId, bTab, "B deduplicates to its original tab");
  await bRight.click(`button[data-page-id="${b.id}"]`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(ownerSelector(right!, bTab))}).contentWindow.t405TaggedCount`), 0, "same-item clicks do not emit a new item intent");
  await evaluate(`document.querySelector('[data-tab-pane="${left}"]').click()`);
  await evaluate(`document.querySelector('[data-tab-pane="${right}"]').click()`);
  await bRight.waitFor("document.querySelector('[data-pages-title]').value==='Item B'");
  const holdIntent = async (id: string) => {
    await selectTab(rightTab); await aRight.waitFor("document.querySelector('[data-pages-title]').value==='Item A'");
    await evaluate(`${ownerWindow}.t405HoldItemIntent=true`);
    await aRight.click(`button[data-page-id="${id}"]`);
    await waitFor(`${ownerWindow}.t405HeldItemIntents.length===1`);
  };
  const releaseIntent = async (before = "", after = "") => {
    const barriers = await evaluate<number>("window.t405IntentBarriers");
    await evaluate(`(()=>{const view=${ownerWindow};${before}view.t405ReleaseItemIntent();${after}view.t405HoldItemIntent=false;})()`);
    await waitFor(`window.t405IntentBarriers===${barriers + 1}`);
  };
  await holdIntent(c.id); await selectTab(bTab); await releaseIntent();
  assert.equal(await itemCount(c.id), 0, "an actual held intent from a now-hidden A frame opens nothing");
  for (const kind of ["default", "different item"] as const) {
    await holdIntent(c.id);
    const change = `const tab=view.document.querySelector('[data-work-surface=pages]').closest('[data-tab-pane]').querySelector('[data-tab-strip] [data-tab-id="'+CSS.escape(view.t405HeldItemIntents[0].message.itemTabId)+'"][aria-current="page"]'),saved={...tab.dataset};`;
    const mutate = kind === "default" ? "tab.dataset.tabKind='plugin';delete tab.dataset.itemId;" : `tab.dataset.tabId='later-item-tab';tab.dataset.itemId=${JSON.stringify(b.id)};`;
    await releaseIntent(change + mutate, "Object.assign(tab.dataset,saved);");
    assert.equal(await itemCount(c.id), 0, `${kind} owner state rejects the earlier tagged intent`);
  }
  await holdIntent(d.id);
  await releaseIntent("view.document.querySelector('[data-work-surface=pages]').remove();");
  assert.equal(await itemCount(d.id), 0, "a removed source root cannot replay its earlier item intent");
  await selectTab(bTab);
  await bRight.evaluate(`window.t405Host.openItem('pages',${JSON.stringify(c.id)},'Item C')`);
  await waitFor(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}')).panes.find(p=>p.id===${JSON.stringify(right)}).tabs.some(t=>t.itemId===${JSON.stringify(c.id)})`);
  assert.equal(await itemCount(c.id), 1, "the existing untagged legal openItem still works");
  await click(`[data-tab-pane="${right}"] [data-tab-strip] .tab-item[data-plugin=pages][data-tab-kind=plugin] .tab-item-trigger`);
  await evaluate(`document.querySelector('iframe[data-pane-owner="${right}"]:not([hidden])').dataset.full16Owner='right-default'`);
  await defaultPage.waitFor("window.t405InitialItem===null && document.querySelector('[data-pages-rows]')");
  const defaultTab = (await layout()).panes.find(p => p.id === right)!.activeTabId;
  await defaultPage.click(`button[data-page-id="${c.id}"]`);
  await defaultPage.waitFor("document.querySelector('[data-pages-title]').value==='Item C'");
  assert.equal((await layout()).panes.find(p => p.id === right)!.activeTabId, defaultTab, "a default plugin page still selects in place");
  await selectTab(bTab); await browser.reloadPage();
  await waitFor(`document.querySelector(${JSON.stringify(ownerSelector(right!, bTab))})`);
  await evaluate(`document.querySelector(${JSON.stringify(ownerSelector(right!, bTab))}).dataset.full16Owner='right-b'`);
  await bRight.waitFor("document.querySelector('[data-pages-title]')?.value==='Item B'");
  saved = await layout(); rightPane = saved.panes.find(p => p.id === right)!;
  assert.equal(rightPane.activeTabId, bTab); assert.equal(rightPane.tabs.find(tab => tab.id === rightTab)?.itemId, a.id);
  assert.equal(saved.panes.find(p => p.id === left)!.activeTabId, leftTab);
});
