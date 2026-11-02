import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// T405-FULL-03: a diagnostic failure must not hide the original business failure.
async function observePaneFailure<T>(read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('T405 diagnostic read unavailable after 1500ms')), 1500); })]); }
  finally { clearTimeout(timer); }
}

test("Feed source navigation, independent nested panes, resize and restore", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const main = await pluginFrameBrowser(t, browser, "feed");
  const firstPane = await pluginFrameBrowser(t, browser, "feed", 'iframe[data-t403-pane-index="0"]');
  const secondPane = await pluginFrameBrowser(t, browser, "feed", 'iframe[data-t403-pane-index="1"]');
  await addProjectPlugin(browser.web, projectId!, "feed");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click('[data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-work-surface=feed]')?.dataset.uiClientState==='ready' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  // Soft Workbench: one timeline; each row names its source and the source menu scope it belongs to.
  await main.waitFor("document.querySelectorAll('[data-feed-rows] [data-feed-entry-id]').length>0");
  const firstRow = await main.evaluate<{ source: string; task: string; label: string }>("(()=>{const row=document.querySelector('[data-feed-rows] [data-feed-entry-id]');return {source:row.dataset.feedEntrySourceId,task:row.dataset.feedEntryTask,label:row.querySelector('.feed-entry-source')?.textContent||''};})()");
  assert.ok(firstRow.source && firstRow.label);
  assert.ok(await main.evaluate(`Boolean(document.querySelector('[data-feed-source-rail] [data-feed-task="${firstRow.task}"]'))`), "the row's scope is a source in the menu");
  const sources = await main.evaluate<string[]>("[...document.querySelectorAll('[data-feed-task]')].map(x=>x.dataset.feedTask)");
  assert.ok(sources.length >= 1);
  assert.equal(sources.includes("all"), true);
  const source = await main.evaluate<string>("[...document.querySelectorAll('[data-feed-task]')].find(x=>x.textContent.includes('Solidot'))?.dataset.feedTask");
  assert.ok(source);
  const selectedSource = await main.evaluate("document.querySelector('[data-feed-source-rail] [data-feed-task=all]')?.getAttribute('aria-current')");
  if (selectedSource !== "page") t.diagnostic(JSON.stringify(await main.evaluate("({selected:document.querySelector('[data-feed-workbench]')?.dataset.selectedSource,rows:[...document.querySelectorAll('[data-feed-task]')].map(node=>({id:node.dataset.feedTask,current:node.getAttribute('aria-current')}))})")));
  assert.equal(selectedSource, "page");
  assert.ok(await main.evaluate<string>(`document.querySelector('[data-feed-source-rail] [data-feed-task="${source}"]')?.dataset.feedSourceState`));
  await main.click(`[data-feed-source-rail] [data-feed-task="${source}"]`);
  assert.equal(await main.evaluate("document.querySelector('[data-feed-workbench]')?.dataset.selectedSource"), source);
  assert.equal(await main.evaluate("document.querySelector('[data-feed-source-menu]').open"), false, "choosing a source closes its menu");
  assert.equal(await main.evaluate("document.querySelector('button[data-feed-view=settings]')?.hidden"), false);
  assert.equal(await main.evaluate(`[...document.querySelectorAll('[data-feed-rows] [data-feed-entry-id]')].filter(row=>!row.closest('[data-feed-item-wrap]').hidden).every(row=>row.dataset.feedEntryTask==="${source}")`), true, "a chosen source shows only its messages");
  await main.click('[data-feed-source-rail] [data-feed-task=all]');
  const bounds = await main.evaluate<number[]>("[...document.querySelectorAll('[data-feed-rows] [data-feed-item-wrap]:not([hidden])')].map(x=>x.getBoundingClientRect().top)");
  assert.equal(new Set(bounds).size, bounds.length, "messages must not overlap");
  const widths = await evaluate<number[]>("[...document.querySelectorAll('[data-titlebar-tabs] .tab-item:not([data-pinned])')].map(x=>Math.round(x.getBoundingClientRect().width))");
  assert.ok(widths.length >= 1 && widths.every((width) => width > 0 && width <= 172), "unpinned tabs hug or share at or below 172px: " + JSON.stringify(widths));
  await click('[data-titlebar-tabs] [data-tab-split]');
  await click('[data-layout-split=right]');
  await waitFor("document.querySelectorAll('iframe.tab-content-frame').length === 2 && [...document.querySelectorAll('iframe.tab-content-frame')].every(f=>f.contentDocument?.body?.dataset.desktopSurface==='feed')");
  // RAC-2687: a source choice belongs to its actual iframe, even after focus moved to its neighbour.
  const layoutKey = "molis-work-tab-workspace:" + projectId;
  const focusedBefore = await evaluate<string>(`JSON.parse(localStorage.getItem(${JSON.stringify(layoutKey)})).focusedPaneId`);
  await evaluate(`(() => { const frames=[...document.querySelectorAll('iframe.tab-content-frame')]; frames.forEach((frame,index)=>frame.dataset.t403PaneIndex=String(index)); window.pr2FirstPane=frames[0].dataset.paneOwner; })()`);
  await firstPane.waitFor("document.querySelector('[data-feed-task]')");
  await firstPane.evaluate(`document.querySelector('[data-feed-task="${source}"]').click()`);
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(layoutKey)})).panes.find(p=>p.id===window.pr2FirstPane).tabs.some(t=>t.plugin==='feed'&&t.kind==='plugin'&&t.view===${JSON.stringify(source)})`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(layoutKey)})).focusedPaneId`), focusedBefore);
  assert.equal(await secondPane.evaluate("document.querySelector('[data-feed-workbench]').dataset.selectedSource"), "all");
  const storedViews = await evaluate<string>(`localStorage.getItem(${JSON.stringify(layoutKey)})`);
  await evaluate(`(() => { const frame=document.querySelector('iframe.tab-content-frame'),data={type:'workbench-pane-view',view:'forged',paneId:${JSON.stringify(focusedBefore)}};
    dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
    dispatchEvent(new MessageEvent('message',{origin:'https://example.com',source:frame.contentWindow,data})); })()`);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(layoutKey)})`), storedViews, "S-30 refuses the wrong window and origin before changing any pane view");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-tab-pane] [data-tab-strip]')].every(strip => !strip.hidden)"), true);
  const unfilteredCount = await secondPane.evaluate<string>("document.querySelector('[data-feed-result-count]').textContent");
  await firstPane.evaluate(`{ const field = document.querySelector('[data-feed-search]'); field.value = 'not found in this source'; field.dispatchEvent(new Event('input',{bubbles:true})); }`);
  assert.equal(await firstPane.evaluate(`document.querySelector('[data-feed-result-count]').textContent`), "0 条消息");
  assert.equal(await secondPane.evaluate("document.querySelector('[data-feed-result-count]').textContent"), unfilteredCount);
  await click('.tab-pane.is-focused [data-tab-split]');
  await click('[data-layout-split=bottom]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length===3 && document.querySelector('[data-direction=column]')");
  assert.equal(await firstPane.evaluate(`document.querySelector('[data-feed-search]').value`), "not found in this source", "splitting a neighbour must preserve existing content state");
  const sash = await evaluate<{x:number;y:number;hit:boolean}>("(()=>{const node=document.querySelector('[data-direction=row] [data-tab-sash]'),r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/4;window.t403SashNode=node;window.t403SashTrace=[];const record=event=>{t403SashTrace.push({type:event.type,trusted:event.isTrusted,pointerId:event.pointerId,buttons:event.buttons,x:event.clientX,y:event.clientY,at:event.timeStamp,connected:node.isConnected,captured:node.hasPointerCapture(event.pointerId),target:event.target.outerHTML?.slice(0,120)});t403SashTrace.splice(0,Math.max(0,t403SashTrace.length-12))};const types=['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mousemove','mouseup'];types.forEach(type=>document.addEventListener(type,record,true));window.t403StopSash=()=>types.forEach(type=>document.removeEventListener(type,record,true));return {x,y,hit:node.contains(document.elementFromPoint(x,y))}})()");
  assert.equal(sash.hit,true,'the real sash is the hit target before the press');
  const sizing = () => evaluate("(()=>{const node=document.querySelector('[data-direction=row] [data-tab-sash]'),down=t403SashTrace.find(event=>event.type==='pointerdown');return {trace:t403SashTrace,node:{connected:t403SashNode.isConnected,same:node===t403SashNode,rect:node.getBoundingClientRect().toJSON()},viewport:[innerWidth,innerHeight],visibility:document.visibilityState,focus:document.hasFocus(),ratio:node.getAttribute('aria-valuenow'),captured:down?node.hasPointerCapture(down.pointerId):false,body:document.body.className,workspace:document.querySelector('[data-tab-workspace]').className,iframeGuard:[...document.querySelectorAll('iframe.tab-content-frame')].map(frame=>getComputedStyle(frame).pointerEvents)}})()");
  const resizeStages: unknown[] = [];
  const dispatch = async (params: Record<string, unknown>) => {
    const sent = { phase: 'CDP sent', params, at: Date.now() }; resizeStages.push(sent);
    try { const receipt = await command('Input.dispatchMouseEvent', params, sessionId); resizeStages.push({ phase: 'CDP received', type: params.type, at: Date.now(), receipt }); }
    catch (error) { resizeStages.push({ phase: 'CDP failed', type: params.type, at: Date.now(), error: String(error) }); throw error; }
  };
  let ratio: unknown;
  try {
  await dispatch({ type: "mouseMoved", x:sash.x, y:sash.y });
  try {
    await dispatch({ type: "mousePressed", x:sash.x, y:sash.y, button: "left", clickCount: 1 });
    resizeStages.push({phase:'down',state:await sizing()});
    await dispatch({ type: "mouseMoved", x: sash.x + 90, y: sash.y, button: "left", buttons: 1 });
    resizeStages.push({phase:'move',state:await sizing()});
  } finally {
    await dispatch({ type: "mouseReleased", x: sash.x + 90, y: sash.y, button: "left", clickCount: 1 });
    resizeStages.push({phase:'release',state:await sizing()});
    await evaluate('window.t403StopSash()');
  }
  ratio = await evaluate("document.querySelector('[data-direction=row] [data-tab-sash]').getAttribute('aria-valuenow')");
  assert.notEqual(ratio, "50");
  } catch (error) {
    t.diagnostic('T405 pane resize failed '+JSON.stringify(resizeStages));
    throw error;
  }
  assert.equal(await firstPane.evaluate(`document.querySelector('[data-feed-search]').value`), "not found in this source");
  await browser.reloadPage();
  await waitFor("document.querySelectorAll('[data-tab-pane]').length===3");
  assert.equal(await evaluate("document.querySelector('[data-direction=row] [data-tab-sash]').getAttribute('aria-valuenow')"), ratio);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-tab-pane]')].filter(p=>p.getBoundingClientRect().width>0).length"), 1);
  await click('.tab-pane.is-focused [data-tab-split]');
  await click('[data-focus-pane]');
  assert.equal(await evaluate("document.querySelector('.tab-pane.is-focused').dataset.tabPane===document.querySelector('[data-focus-pane]').dataset.focusPane"), true);
});

test("merging a Feed overview pane preserves its unfinished inline source form", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){target[key]=key==='feed'?host=>{
    const state=window.t405Feed={host,opens:[],clicks:[]},open=host.openView;
    host.openView=(view)=>{const row={view};state.opens.push(row);if(state.opens.length>8)state.opens.shift();try{const result=open.call(host,view);row.returned=typeof result;return result;}catch(error){row.error=String(error);throw error;}};
    document.addEventListener('click',event=>{const node=event.target.closest?.('[data-feed-add-toggle]');if(node){state.clicks.push({trusted:event.isTrusted,connected:node.isConnected,mount:host.mount?.surface,at:performance.now()});if(state.clicks.length>8)state.clicks.shift();}},true);
    return factory(host);
  }:factory;return true;}});`);
  const child = await pluginFrameBrowser(t, browser, "feed", 'iframe[data-t403-draft-frame]');
  await addProjectPlugin(browser.web, projectId!, "feed");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click('[data-titlebar-tabs] [data-tab-split]');
  await click('[data-layout-split=right]');
  await click('[data-plugin-id="feed"]');
  await waitFor("[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].some(f=>f.contentDocument?.body?.dataset.desktopSurface==='feed')");
  await evaluate(`(() => {
    window.draftFrame = [...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].find(f=>f.contentDocument.body.dataset.desktopSurface==='feed');
    window.draftDocument = draftFrame.contentDocument;
    draftFrame.dataset.t403DraftFrame = "true";
  })()`);
  await child.waitFor("document.querySelector('[data-feed-rail-toggle]')");
  // T405-FULL-03: server HTML exists before the opaque client's factory has installed its handlers.
  await waitFor("(()=>{const root=document.querySelector('iframe[data-t403-draft-frame]')?.contentDocument?.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench][data-plugin-slot=\"workbench.main\"]');return root?.dataset.uiClientState==='ready' && !root.inert;})()");
  await child.evaluate("document.querySelector('[data-feed-source-menu]').open=true;document.querySelector('[data-feed-source-rail] header [data-feed-add-toggle]').click()");
  try { await child.waitFor("document.querySelector('[data-feed-sources-dialog]')?.hidden === false && document.querySelector('[data-feed-workbench]')?.dataset.feedView === 'add'"); }
  catch (error) {
    const observations = await Promise.allSettled([
      observePaneFailure(() => child.evaluate("(()=>{const state=window.t405Feed,dialog=document.querySelector('[data-feed-sources-dialog]');return {url:location.href,mount:state?.host.mount,scope:state?{alive:state.host.scope.alive,visible:state.host.scope.visible}:null,clicks:state?.clicks,opens:state?.opens,dialog:dialog?{hidden:dialog.hidden,connected:dialog.isConnected}:null,view:document.querySelector('[data-feed-workbench]')?.dataset.feedView}})()", 1500)),
      command('Runtime.evaluate', { expression: "(()=>({frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({src:f.src,hidden:f.hidden,connected:f.isConnected,pane:f.dataset.paneOwner,tab:f.dataset.paneTab,ready:f.contentDocument?.readyState,roots:[...f.contentDocument?.querySelectorAll('[data-plugin-owner]')||[]].map(r=>({...r.dataset}))}))}))()", returnByValue: true }, sessionId, 1500),
    ]);
    t.diagnostic('T405 Feed choose/setup failed ' + JSON.stringify(observations.map(value => value.status === 'fulfilled' ? value.value : { unavailable: String(value.reason) })));
    throw error;
  }
  assert.equal(await child.evaluate("document.querySelector('[data-feed-sources-dialog]').tagName"), "SECTION", "source setup is an inline work surface");
  await child.evaluate("document.querySelector('[data-feed-choose-kind=custom_rss]').click()");
  await child.evaluate(`(() => {
    document.querySelector('[data-feed-add-name]').value = '未提交的观察来源';
    document.querySelector('[data-feed-add-form] [data-feed-source-value=custom_rss]').value = 'https://example.com/draft.xml';
    document.querySelector('[data-feed-search]').value='保留检索';
    document.querySelector('[data-feed-sources-dialog] [data-feed-sources-close]').click();

  })()`);
  await evaluate("window.sourcePane=draftFrame.dataset.paneOwner;window.targetPane=[...document.querySelectorAll('[data-tab-pane]')].find(p=>p.dataset.tabPane!==sourcePane).dataset.tabPane");
  // Feed overview is a pane view, not a draggable item tab. Merge the neighbouring
  // pane and keep the real Feed document, including its unfinished source form.
  await evaluate("document.querySelector('[data-tab-pane=\"'+targetPane+'\"] [data-tab-pane-close]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length===1");
  assert.equal(await evaluate("draftFrame.contentDocument===draftDocument && !draftFrame.hidden"), true, "merge must retain the surviving content document");
  await child.evaluate(`(() => {
    const railToggle = document.querySelector('[data-feed-rail-toggle]');
    if (railToggle.getBoundingClientRect().width && railToggle.getAttribute('aria-expanded') !== 'true') railToggle.click();
    document.querySelector('[data-feed-source-rail] header [data-feed-add-toggle]').click();
  })()`);
  await child.evaluate("document.querySelector('[data-feed-choose-kind=custom_rss]').click()");
  assert.equal(await child.evaluate("document.querySelector('[data-feed-add-form]').hidden"), false);
  assert.equal(await child.evaluate("document.querySelector('[data-feed-search]').value"), "保留检索");
  await child.evaluate("document.querySelector('[data-feed-sources-dialog] [data-feed-sources-close]').click()");
  assert.equal(await child.evaluate("document.querySelector('[data-feed-add-form] [data-feed-source-value=custom_rss]').value"), "https://example.com/draft.xml");
  // Focus messages still resolve the surviving Feed pane.
  await child.evaluate("document.querySelector('[data-feed-search]').focus()");
  assert.equal(await evaluate("document.querySelector('.tab-pane.is-focused').dataset.tabPane===sourcePane"), true);
});

test("opening a related Goal inside a pane leaves the original Goal tab intact", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, openGoalFrame, command, sessionId, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", {source:"window.t403RelatedErrors=[];const record=error=>{t403RelatedErrors.push(String(error).slice(0,200));t403RelatedErrors.splice(0,Math.max(0,t403RelatedErrors.length-8));};addEventListener('error',event=>record(event.message));addEventListener('unhandledrejection',event=>record(event.reason));"}, sessionId);
  const click = async (selector: string) => {
    await browser.click(selector);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click('[data-plugin-id="goals"]');
  await openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await click('[data-frame-goal-work]');
  await waitFor("document.querySelector('[data-goal-view]')?.dataset.goalView==='CORE'");
  await click('[data-titlebar-tabs] [data-tab-split]');
  await click('[data-layout-split=right]');
  // Each pane is a page of its own: both load the whole workbench (about five seconds on a development Mac, over twice that on the
  // Linux CI runner, whose busy main thread also delays the page's own deadline) before showing the Goal.
  await waitFor("[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].length===2 && [...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].every(f=>f.contentDocument?.querySelector('[data-goal-view]')?.dataset.goalView==='CORE' && f.contentDocument.querySelector('[data-goal-node-workspace]')?.hidden===false)", 30_000);
  await evaluate("window.t403RelatedOpen=[];window.t403RelatedListener=event=>{if(event.data?.type!=='workbench-pane-open')return;const owner=[...document.querySelectorAll('iframe.tab-content-frame')].find(frame=>frame.contentWindow===event.source);t403RelatedOpen.push({trusted:event.isTrusted,origin:event.origin,pane:owner?.dataset.paneOwner,tab:owner?.dataset.paneTab,plugin:event.data.plugin,itemId:event.data.itemId});t403RelatedOpen.splice(0,Math.max(0,t403RelatedOpen.length-8))};addEventListener('message',t403RelatedListener)");
  const relatedId = await evaluate<string>(`(() => {
    const paneId = document.querySelector('.tab-pane.is-focused').dataset.tabPane;
    window.originalFrame = document.querySelector('iframe[data-pane-owner="'+paneId+'"]:not([hidden])');
    window.originalDocument = originalFrame.contentDocument;
    originalDocument.querySelector('[data-frame-goal-work]').click();
    const toggle = originalDocument.querySelector('[data-goal-details-toggle]');
    if(toggle?.getAttribute('aria-expanded')==='false') toggle.click();
    originalDocument.querySelector('[data-goal-info]:not([open]) > summary')?.click();
    originalDocument.querySelector('[data-event-reader=description]').click();
    const link=originalDocument.querySelector('.event-reader .relation-row[data-select-goal]') || [...originalDocument.querySelectorAll('.relation-row[data-select-goal]')].find(x=>x.getBoundingClientRect().width);
    if (!link || !link.getBoundingClientRect().width) throw new Error('related Goal must be available in the content panel');
    link.click();
    return link.dataset.selectGoal;
  })()`);
  const relatedState = () => evaluate(`({messages:t403RelatedOpen,saved:JSON.parse(localStorage.getItem(${JSON.stringify('molis-work-tab-workspace:'+projectId)})),frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(frame=>({src:frame.src,hidden:frame.hidden,pane:frame.dataset.paneOwner,tab:frame.dataset.paneTab,readyState:frame.contentDocument?.readyState,goal:frame.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal,errors:frame.contentWindow?.t403RelatedErrors}))})`);
  const relatedDiagnostic = async (phase: string) => {
    try { t.diagnostic('T405 related Goal ' + phase + ' ' + JSON.stringify(await observePaneFailure(relatedState))); }
    catch (observation) { t.diagnostic('T405 related Goal ' + phase + ' diagnostic unavailable: ' + String(observation)); }
  };
  try { await waitFor(`[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].some(f=>f.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal===${JSON.stringify(relatedId)})`, 8_000); }
  catch(error){await relatedDiagnostic('business wait failed');throw error;}
  const adopted = await evaluate<{core:boolean;active:string}>(`(()=>{const state=JSON.parse(localStorage.getItem(${JSON.stringify('molis-work-tab-workspace:'+projectId)})),pane=state.panes.find(pane=>pane.id===originalFrame.dataset.paneOwner);return {core:pane.tabs.some(tab=>tab.kind==='item'&&tab.plugin==='goals'&&tab.itemId==='CORE'),active:pane.tabs.find(tab=>tab.id===pane.activeTabId)?.itemId}})()`);
  assert.equal(adopted.core,true);assert.equal(adopted.active,relatedId);
  await evaluate("document.querySelector('[data-tab-id=\"'+originalFrame.dataset.paneTab+'\"] .tab-item-trigger').click()");
  await waitFor("!originalFrame.hidden");
  assert.equal(await evaluate("originalFrame.contentDocument===originalDocument"), true);
  assert.equal(await evaluate("originalDocument.querySelector('[data-goal-view]').dataset.goalView"), "CORE");
  await evaluate("removeEventListener('message',t403RelatedListener)");
});

test("a background refresh keeps the titlebar tabs hidden while panes are split, and shown once they merge (RAC-1220, RAC-1221)", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await addProjectPlugin(browser.web, projectId!, "feed");
  // Another connection writing this project is what the shell's background refresh is for: a Goal event through Goals' own
  // application appends the journal event the board refresh reads, and the attention poll carries its new cursor to the page.
  const app = new GoalProjectApplication(browser.store);
  const refreshAfterWrite = async (key: string, title: string) => {
    const before = await evaluate<number>("JSON.parse(document.querySelector('#molis-work-data').textContent).snapshot.cursor");
    app.goalEvents.createIntent({ project_id: projectId!, title, outcome: "证明分屏之后后台刷新不再改写顶栏标签条的可见性", actor_id: "pane-refresh-test", actor_kind: "user", idempotency_key: key });
    // The cursor in the payload is not trusted: the page's refreshBoard re-reads /api/board/cursor itself;
    // the payload only makes the attention listener notice that the two cursors differ.
    await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:attention", { detail: { board_cursor: ${Number(before) + 1} } }))`);
    await waitFor(`JSON.parse(document.querySelector('#molis-work-data').textContent).snapshot.cursor !== ${before}`);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click('[data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-work-surface=feed]')?.dataset.uiClientState==='ready'");
  await click('[data-titlebar-tabs] [data-tab-split]');
  await click('[data-layout-split=right]');
  await waitFor("document.querySelectorAll('iframe.tab-content-frame').length === 2 && [...document.querySelectorAll('iframe.tab-content-frame')].every(f=>f.contentDocument?.body?.dataset.desktopSurface==='feed')");
  await refreshAfterWrite("background-refresh-split", "分屏之后的后台刷新");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), true, "RAC-1220: a background refresh must not bring the titlebar tabs back while panes are split");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-tab-pane] [data-tab-strip]')].every(strip => !strip.hidden && Boolean(strip.querySelector('.tab-item-trigger')?.getBoundingClientRect().width))"), true, "RAC-1220: every pane keeps its own visible, usable tab strip");
  await evaluate(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')];
    window.mergedPane = panes.find(pane => pane !== document.querySelector('.tab-pane.is-focused')).dataset.tabPane;
  })()`);
  await evaluate("document.querySelector('[data-tab-pane=\"'+mergedPane+'\"] [data-tab-pane-close]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), false, "RAC-1221: merging the panes back shows the titlebar tabs again");
  await refreshAfterWrite("background-refresh-merged", "合回一个窗格之后的后台刷新");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), false, "RAC-1221: a background refresh keeps the titlebar tabs shown after the panes merge");
});
