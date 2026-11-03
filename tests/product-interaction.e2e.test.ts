import assert from "node:assert/strict";
import test from "node:test";
import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("Goal Frame keeps the outer tabs and layout offers explicit bottom splitting", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {}, undefined, undefined, true); if (!b) return;
  const { evaluate, waitFor, click, openGoalFrame, command, sessionId, navigate, origin, projectId } = b;
  const paneReads: Array<{ url: string; started: number; finished?: number }> = [];
  const observePane = (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => {
    if (request.method !== "GET" || !request.url?.includes("workbenchPane=")) return;
    const read = { url: request.url, started: Date.now(), finished: undefined as number | undefined }; paneReads.push(read); if (paneReads.length > 12) paneReads.shift();
    response.once("finish", () => { read.finished = Date.now(); });
  };
  b.server?.on("request", observePane);
  t.after(() => { b.server?.off("request", observePane); t.diagnostic("T405 product pane reads " + JSON.stringify(paneReads)); });
  await b.setViewport(1440, 960);
  await navigate(() => command("Page.navigate", {url: `${origin}/projects/${projectId}/`}, sessionId));
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await click('[data-plugin-id="goals"]');
  await openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE' && !document.querySelector('[data-goal-frame-surface]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]').getBoundingClientRect().height>0"), true);
  const core = boardSnapshot(b.store, DEMO_PROJECT_ID).goals.find(goal => goal.goal_id === "CORE")!;
  assert.equal(await evaluate<string>("document.querySelector('[data-frame-goal-title]').textContent"), core.title);
  assert.equal(await evaluate<string>("document.querySelector('[data-frame-goal-outcome]').textContent"), core.outcome);
  assert.equal(await evaluate<string>("document.querySelector('[data-frame-goal-status]').textContent"), "已完成");
  await click('[data-titlebar-tabs] [data-tab-split]');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-layout-split]')].map(x=>x.dataset.layoutSplit)"), ["right","bottom","left","top"]);
  await click('[data-layout-split="bottom"]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length===2 && document.querySelector('[data-direction=column]')");
  // Each pane is a page of its own, so both panes load the whole workbench before showing the Frame.
  try { await waitFor("[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].every(f=>f.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE')", 8_000); }
  catch (error) {
    const state = await command("Runtime.evaluate", { expression: "(()=>({surface:document.body?.dataset.desktopSurface,panes:[...document.querySelectorAll('[data-tab-pane]')].map(p=>({id:p.dataset.tabPane,current:p.querySelector('.tab-item[aria-current]')?.outerHTML.slice(0,200)})),frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({pane:f.dataset.paneOwner,tab:f.dataset.paneTab,hidden:f.hidden,src:f.src,ready:f.contentDocument?.readyState,goal:f.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal}))}))()", returnByValue: true }, sessionId, 1500).catch(observation => ({ unavailable: String(observation) }));
    t.diagnostic("T405 product after split " + JSON.stringify({ paneReads, state })); throw error;
  }
  const paneIds = await evaluate<string[]>("[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].map(f=>f.dataset.paneOwner)");
  const [paneId, otherPaneId] = paneIds;
  const pane = (id: string) => `document.querySelector('iframe.tab-content-frame[data-pane-owner="${id}"]:not([hidden])').contentDocument`;
  await evaluate(`${pane(paneId)}.querySelector('[data-frame-goal-work]').click()`);
  // 打开工作区 turns that pane, and only that pane, to the Goal's work view, and the workspace remembers it for the pane's tab.
  await waitFor(`${pane(paneId)}.querySelector('[data-goal-frame-surface]').hidden && !${pane(paneId)}.querySelector('[data-goal-node-workspace]').hidden`);
  await waitFor(`(() => { const saved = JSON.parse(localStorage.getItem('molis-work-tab-workspace:${projectId}'))?.panes.find(p=>p.id==='${paneId}'); return saved?.tabs.find(tab=>tab.id===saved.activeTabId)?.view==='work'; })()`);
  assert.equal(await evaluate(`!${pane(otherPaneId)}.querySelector('[data-goal-frame-surface]').hidden && ${pane(otherPaneId)}.querySelector('[data-goal-frame-surface]').dataset.frameGoal==='CORE'`), true);
  // The Goal's document then loads into that pane; it is a full document read, slower than the switch itself.
  await waitFor(`${pane(paneId)}.querySelector('[data-goal-view]')?.dataset.goalView==='CORE' && !${pane(paneId)}.querySelector('[data-document-pane]').hasAttribute('aria-busy')`, 8_000);
});

test("Feed task creation is a scoped panel with validation and persistent schedule", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { command, sessionId, navigate, origin, projectId } = b;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, b, "feed");
  await pluginFrameInitScript(t, b, `
    const state=window.__creationRefresh={armed:false,started:0,creator:0,nextCreator:false,held:{},completed:[],documents:{},releaseAll(){this.armed=false;Object.values(this.held).forEach(release=>release());}};
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){target[key]=key==='feed'?host=>{
      const invalidate=host.invalidateView;host.invalidateView=(...args)=>{const result=invalidate(...args);if(state.armed&&!state.creator&&document.querySelector('[data-feed-add-form]')?.dataset.createdSourceId)state.nextCreator=true;return result;};
      const read=host.view.readDocument;host.view.readDocument=async query=>{
        const id=state.armed&&!query?.object?++state.started:0;
        if(id&&state.nextCreator){state.creator=id;state.nextCreator=false;}
        const html=await read(query);
        if(id){state.documents[id]=html;if(state.armed)await new Promise(resolve=>state.held[id]=resolve);state.completed.push(id);}
        return html;
      };return factory(host);
    }:factory;return true;}});
  `);
  await addProjectPlugin(b.web, projectId!, "feed");
  await b.setViewport(1440, 960);
  await navigate(() => command("Page.navigate", {url: `${origin}/projects/${projectId}/`}, sessionId));
  await b.waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await b.click('[data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-feed-workbench]')");
  assert.equal(await evaluate("document.querySelector('[data-feed-advanced-open]')"), null);
  await click('[data-feed-add-toggle]');
  await waitFor("!document.querySelector('[data-feed-sources-dialog]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-feed-add]')"), null);
  await click('[data-feed-choose-kind="custom_rss"]');
  assert.equal(await evaluate("document.querySelector('[data-feed-source-register]').parentElement === document.querySelector('[data-feed-sources-dialog] footer [data-feed-sources-close]').parentElement"), true);
  await click('[data-feed-source-register]');
  assert.equal(await evaluate("document.querySelector('[data-feed-source-value=custom_rss]').validity.valueMissing"), true);
  await evaluate(`{
    document.querySelector('[data-feed-add-name]').value='设计观察';
    document.querySelector('[data-feed-source-value=custom_rss]').value='https://example.com/design.xml';
    document.querySelector('[data-feed-create-frequency]').value='360';
  }`);
  await evaluate('window.__creationRefresh.armed=true');
  try {
    await click('[data-feed-source-register]');
    await waitFor('window.__creationRefresh.creator && window.__creationRefresh.held[window.__creationRefresh.creator] && Object.keys(window.__creationRefresh.held).some(id=>Number(id)>window.__creationRefresh.creator)');
    assert.deepEqual(await evaluate(`(()=>{const state=window.__creationRefresh,id=document.querySelector('[data-feed-add-form]').dataset.createdSourceId,next=Object.keys(state.held).map(Number).find(id=>id>state.creator);return [state.documents[state.creator],state.documents[next]].map(html=>Boolean(id&&html.includes(id)));})()`), [true,true], 'both real document reads contain the newly persisted source');
    const created = await evaluate("document.querySelector('[data-feed-add-form]').dataset.createdSourceId");
    await evaluate('Object.entries(window.__creationRefresh.held).forEach(([id,release])=>{if(Number(id)<=window.__creationRefresh.creator)release()})');
    await waitFor('window.__creationRefresh.completed.includes(window.__creationRefresh.creator)');
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await evaluate("document.querySelector('[data-feed-add-form]').dataset.createdSourceId"), created, 'an overtaken refresh cannot finish creation before its replacement commits');
    assert.equal(await evaluate("document.querySelector('[data-feed-source-register]').disabled"), true);
  } finally { await evaluate('window.__creationRefresh.releaseAll()'); }
  await waitFor("!!document.querySelector('[data-feed-sources-dialog]').hidden");
  await waitFor("[...document.querySelectorAll('[data-feed-task]')].some(x=>x.textContent.includes('设计观察'))");
  const sourceId = await evaluate<string>("[...document.querySelectorAll('[data-feed-task]')].find(x=>x.textContent.includes('设计观察')).dataset.feedTask");
  await click(`button[data-feed-view="settings"]`);
  assert.equal(await evaluate("!document.querySelector('[data-feed-sources-dialog]').hidden"), true);
  assert.equal(await evaluate(`document.querySelector('[data-feed-task-config="${sourceId}"] [data-source-schedule-interval]').value`), "360");
  assert.equal(await evaluate(`document.querySelector('[data-feed-task-config="${sourceId}"] [data-source-schedule-enabled]').checked`), true);
  const saved = createLocalFeedApplication(b.store.db).sources.get(DEMO_PROJECT_ID, sourceId);
  assert.equal(saved.name, "设计观察");
  assert.equal(saved.schedule.mode, "interval");
  if (saved.schedule.mode === "interval") {
    assert.equal(saved.schedule.enabled, true); assert.equal(saved.schedule.interval_minutes, 360);
    assert.ok(Date.parse(saved.schedule.next_pull_at!) > Date.now());
  }
  createLocalFeedApplication(b.store.db).ingestItem({ source: saved, externalId: "browser-rule-preview", title: "Launch preview", summary: "Original material", body: "launch body", occurredAt: new Date().toISOString(), attention: false });
  await click('button[data-feed-view="rules"]');
  const section = `[data-feed-out-rules="${sourceId}"]`;
  await evaluate(`{
    document.querySelector('${section} [data-feed-out-rule-name]').value='发布相关';
    document.querySelector('${section} [data-feed-out-rule-contains]').value='launch';
  }`);
  const beforePreview = createLocalFeedApplication(b.store.db).outRules.list(DEMO_PROJECT_ID);
  await click(section + ' [data-feed-rule-preview-run]');
  await waitFor(`document.querySelector('${section} [data-feed-rule-preview]')?.textContent.includes('Launch preview')`);
  assert.deepEqual(createLocalFeedApplication(b.store.db).outRules.list(DEMO_PROJECT_ID), beforePreview, "preview has no rule write");
  await click(section + ' [data-feed-out-rule-create]');
  await waitFor(`document.querySelector('${section}')?.textContent.includes('发布相关')`);
  const rules = createLocalFeedApplication(b.store.db).outRules.list(DEMO_PROJECT_ID)
    .filter((rule) => rule.match.source_id === sourceId);
  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.name, "发布相关");
  assert.equal(rules[0]?.match.contains, "launch");
  assert.equal(rules[0]?.match.source_id, sourceId);
  assert.match(await evaluate(`document.querySelector('[data-feed-out-rules="${sourceId}"]')?.textContent || ""`), /发布相关/);
});

test("Feed creation recovers a failed schedule without duplicating the task", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { command, sessionId, navigate, origin, projectId } = b;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, b, "feed");
  await addProjectPlugin(b.web, projectId!, "feed");
  await navigate(() => command("Page.navigate", {url: `${origin}/projects/${projectId}/`}, sessionId));
  await b.waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await b.click('[data-plugin-id="feed"]');
  await click('[data-feed-add-toggle]');
  await click('[data-feed-choose-kind="custom_rss"]');
  await evaluate(`{
    document.querySelector('[data-feed-add-name]').value='失败后重试';
    document.querySelector('[data-feed-source-value=custom_rss]').value='https://example.com/retry.xml';
    document.querySelector('[data-feed-create-frequency]').value='60';
  }`);
  await b.evaluate(`{
    const original = window.fetch;
    let fail = true; window.sourceCreationRequests = 0;
    window.fetch = (url, options) => {
      if (options?.method === 'POST' && String(url).endsWith('/api/plugins/io.molis.work.feed/sources')) window.sourceCreationRequests++;
      if (fail && options?.method === 'PUT' && String(url).endsWith('/schedule')) { fail = false; return Promise.resolve(new Response(JSON.stringify({error:'计划暂时无法保存'}), {status:503,headers:{'content-type':'application/json'}})); }
      return original(url, options);
    };
  }`);
  await click('[data-feed-source-register]');
  await waitFor("document.querySelector('[data-feed-add-form]').dataset.createdSourceId && document.querySelector('[data-feed-add-error]').textContent.includes('任务已创建')");
  const sourceId = await evaluate<string>("document.querySelector('[data-feed-add-form]').dataset.createdSourceId");
  assert.equal(createLocalFeedApplication(b.store.db).sources.get(DEMO_PROJECT_ID, sourceId).schedule.mode, "manual");
  await click('[data-feed-sources-dialog] header [data-feed-sources-close]');
  await click('[data-feed-add-toggle]');
  assert.equal(await evaluate("document.querySelector('[data-feed-source-value=custom_rss]').value"), "https://example.com/retry.xml");
  assert.equal(await evaluate("document.querySelector('[data-feed-setup-back]').hidden"), true);
  await click('[data-feed-source-register]');
  await waitFor("document.querySelector('[data-feed-sources-dialog]').hidden");
  await waitFor(`document.querySelector('[data-feed-source-rail] [data-feed-task="${sourceId}"][aria-current=page]')`);
  assert.equal(await b.evaluate("window.sourceCreationRequests"), 1);
  const saved = createLocalFeedApplication(b.store.db).sources.get(DEMO_PROJECT_ID, sourceId);
  assert.equal(saved.schedule.mode, "interval");
  if (saved.schedule.mode === "interval") assert.equal(saved.schedule.interval_minutes, 60);
});

test("Feed configuration cancels drafts and saves its schedule independently", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { command, sessionId, navigate, origin, projectId } = b;
  const child = await pluginFrameBrowser(t, b, "feed"), { evaluate, waitFor, click } = child;
  await pluginFrameInitScript(t, b, `
    const state=window.__scheduleBusy={hold:false};
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){target[key]=key==='feed'?host=>{
      state.host=host;const read=host.view.readDocument;host.view.readDocument=async query=>{
        const hold=state.hold&&!query?.object;if(hold)state.hold=false;
        const html=await read(query);if(hold)await new Promise(resolve=>state.releaseRead=resolve);return html;
      };return factory(host);
    }:factory;return true;}});
  `);
  const attemptDisabled = async (selector: string) => {
    const point = await evaluate<{x:number;y:number}>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const frame = await b.evaluate<{x:number;y:number}>("document.querySelector('[data-work-surface=feed] iframe[data-plugin-frame=feed]').getBoundingClientRect().toJSON()");
    const input = {x:frame.x+point.x,y:frame.y+point.y,button:'left',clickCount:1};
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...input},sessionId);
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',...input},sessionId);
  };
  const source = createLocalFeedSourceService(b.store.db, DEMO_PROJECT_ID).register({kind:"web_query",query:"设计资料"}).source;
  const feed = createLocalFeedApplication(b.store.db);
  await addProjectPlugin(b.web, projectId!, "feed");
  await navigate(() => command("Page.navigate", {url:`${origin}/projects/${projectId}/`},sessionId));
  await b.waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");
  await b.click('[data-plugin-id="feed"]');
  const panel = `[data-feed-task-config="${source.source_id}"]`;
  // Settings open the way a person reaches them now: pick the source in the rail, then its 来源设置 tab.
  const openSettings = async () => {
    try { await click(`[data-feed-source-rail] [data-feed-task="${source.source_id}"]`); await click('[data-feed-view="settings"]'); }
    catch (error) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const state = await Promise.race([
          child.evaluate(`(()=>{const node=document.querySelector('[data-feed-source-rail] [data-feed-task="${source.source_id}"]'),host=window.__scheduleBusy.host;return {mount:host.mount,scope:{alive:host.scope.alive,visible:host.scope.visible},viewport:[innerWidth,innerHeight],view:document.querySelector('[data-feed-workbench]')?.dataset.feedView,menu:document.querySelector('[data-feed-source-menu]')?.open,target:node?{connected:node.isConnected,box:node.getBoundingClientRect().toJSON(),ancestors:[node,...(()=>{const rows=[];for(let n=node.parentElement;n&&rows.length<6;n=n.parentElement)rows.push(n);return rows;})()].map(n=>({tag:n.tagName,class:n.className,hidden:n.hidden,inert:n.inert,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility}))}:null}})()`, 1500),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('T405 Feed settings diagnostic unavailable after 1500ms')), 1500); }),
        ]);
        t.diagnostic('T405 Feed settings open failed ' + JSON.stringify(state));
      } catch (observation) { t.diagnostic('T405 Feed settings diagnostic unavailable: ' + String(observation)); }
      finally { clearTimeout(timer); }
      throw error;
    }
  };
  await openSettings();
  await evaluate(`document.querySelector('${panel} [data-source-config-field=name]').value='丢弃的名称'`);
  await click('[data-feed-sources-dialog] footer [data-feed-sources-close]');
  assert.equal(feed.sources.get(DEMO_PROJECT_ID,source.source_id).name, source.name);
  await openSettings();
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-config-field=name]').value`),source.name);
  await click(`${panel} [data-feed-plan-region] > summary`);
  await evaluate(`{const field=document.querySelector('${panel} [data-source-schedule-mode]');field.value='interval';field.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('${panel} [data-source-schedule-interval]').value='360';}`);
  await click(`${panel} [data-source-schedule-reset]`);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-schedule-mode]').value`),"manual");
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-schedule-mode] + [data-mw-select-trigger] [data-mw-select-label]').textContent`),"手动拉取");
  await evaluate(`{document.querySelector('${panel} [data-source-config-field=name]').value='保留中的名称';const field=document.querySelector('${panel} [data-source-schedule-mode]');field.value='interval';field.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('${panel} [data-source-schedule-interval]').value='360';}`);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-schedule-enabled]').checked`), true, "choosing interval enables the new schedule");
  await b.evaluate(`{const original=window.fetch;let hold=true;window.scheduleRequests=0;window.fetch=async(url,options)=>{const response=await original(url,options);if(options?.method==='PUT'&&String(url).endsWith('/schedule')){window.scheduleRequests++;if(hold){hold=false;window.scheduleResponseReady=true;await new Promise(resolve=>window.releaseScheduleResponse=resolve);}}return response;};window.restoreScheduleFetch=()=>window.fetch=original;}`);
  try {
    await click(`${panel} [data-source-schedule-save]`);
    await b.waitFor('window.scheduleResponseReady===true');
    await evaluate(`(()=>{const state=window.__scheduleBusy;state.oldButton=document.querySelector('${panel} [data-source-schedule-save]');state.hold=true;state.host.invalidateView();})()`);
    await waitFor('window.__scheduleBusy.releaseRead');
    await evaluate('window.__scheduleBusy.releaseRead()');
    await waitFor(`!window.__scheduleBusy.oldButton.isConnected && document.querySelector('${panel} [data-source-schedule-save]')!==window.__scheduleBusy.oldButton`);
    assert.deepEqual(await evaluate(`({busy:document.querySelector('[data-feed-sources-dialog]').getAttribute('aria-busy'),save:document.querySelector('${panel} [data-source-schedule-save]').disabled,reset:document.querySelector('${panel} [data-source-schedule-reset]').disabled,inert:document.querySelector('${panel}').inert})`), {busy:'true',save:true,reset:true,inert:true}, "the replacement controls stay busy while the original save response is held");
    await attemptDisabled(`${panel} [data-source-schedule-save]`);
    await attemptDisabled(`${panel} [data-source-schedule-reset]`);
    assert.equal(await b.evaluate('window.scheduleRequests'), 1, "a replacement save control cannot submit again while busy");
    assert.equal(await evaluate(`document.querySelector('${panel} [data-source-config-field=name]').value`),"保留中的名称");
  } finally {
    await evaluate('window.__scheduleBusy.releaseRead?.()');
    await b.evaluate('window.releaseScheduleResponse?.();window.restoreScheduleFetch()');
  }
  await waitFor(`!document.querySelector('${panel} [data-source-schedule-save]').disabled`);
  await waitFor(`!document.querySelector('[data-feed-sources-dialog]').hasAttribute('aria-busy') && !document.querySelector('${panel}').inert`);
  const firstPlan = feed.sources.get(DEMO_PROJECT_ID,source.source_id).schedule;
  assert.equal(firstPlan.mode,"interval"); if(firstPlan.mode==='interval') assert.equal(firstPlan.enabled,true);
  assert.equal(feed.sources.get(DEMO_PROJECT_ID,source.source_id).name,source.name);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-config-field=name]').value`),"保留中的名称");
  await click(`${panel} [data-source-schedule-enabled]`);
  await click(`${panel} [data-source-schedule-save]`);
  await waitFor(`!document.querySelector('${panel} [data-source-schedule-save]').disabled`);
  await waitFor(`!document.querySelector('[data-feed-sources-dialog]').hasAttribute('aria-busy') && !document.querySelector('${panel}').inert`);
  const pausedPlan = feed.sources.get(DEMO_PROJECT_ID,source.source_id).schedule;
  assert.equal(pausedPlan.mode,"interval"); if(pausedPlan.mode==='interval') assert.equal(pausedPlan.enabled,false);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-schedule-enabled]').defaultChecked`),false,"the current owner defaults contain the saved pause");
  await click(`${panel} [data-source-schedule-enabled]`);
  await click(`${panel} [data-source-schedule-reset]`);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-schedule-enabled]').checked`),false,"reset must preserve a saved paused schedule");
  await b.evaluate(`{const original=window.fetch; window.fetch=(url,options)=>options?.method==='PATCH'?Promise.resolve(new Response(JSON.stringify({error:'无法保存配置'}),{status:503})):original(url,options);window.restoreConfigFetch=()=>window.fetch=original;}`);
  await click('[data-feed-config-submit]');
  await waitFor(`document.querySelector('${panel} [data-source-action-status]').textContent.includes('无法保存配置')`);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-source-config-field=name]').value`),"保留中的名称");
  await b.evaluate('window.restoreConfigFetch()');
  await b.evaluate(`{ const original = window.fetch; window.configRequests = 0; window.fetch = async (url, options) => {
    const response = await original(url, options);
    if (options?.method === 'PATCH') {
      window.configRequests++;
      window.configResponseReady = true;
      await new Promise(resolve => { window.releaseConfigResponse = resolve; });
    }
    return response;
  }; }`);
  await click('[data-feed-config-submit]');
  await b.waitFor('window.configResponseReady === true');
  assert.equal(feed.sources.get(DEMO_PROJECT_ID,source.source_id).name,"保留中的名称");
  // ASC-40: disabled cancel and submit controls receive real negative interaction attempts.
  assert.equal(await evaluate("document.querySelector('[data-feed-sources-dialog] footer [data-feed-sources-close]').disabled"), true);
  await attemptDisabled('[data-feed-sources-dialog] footer [data-feed-sources-close]');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  assert.equal(await evaluate("document.querySelector('[data-feed-config-submit]').disabled"), true);
  await attemptDisabled('[data-feed-config-submit]');
  assert.equal(await evaluate("!document.querySelector('[data-feed-sources-dialog]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-feed-sources-dialog]').getAttribute('aria-busy')"), 'true');
  assert.equal(await b.evaluate('window.configRequests'), 1);
  await b.evaluate('window.releaseConfigResponse()');
  // Settings are edited in place in the work surface: a successful save stays on them instead of closing a modal.
  await waitFor("!document.querySelector('[data-feed-sources-dialog]').hasAttribute('aria-busy')");
  assert.equal(await evaluate("!document.querySelector('[data-feed-sources-dialog]').hidden"), true);
  await waitFor(`document.querySelector('[data-feed-source-rail] [data-feed-task="${source.source_id}"]')?.textContent.includes('保留中的名称')`);
  assert.equal(feed.sources.get(DEMO_PROJECT_ID,source.source_id).name,"保留中的名称");
  const plan=feed.sources.get(DEMO_PROJECT_ID,source.source_id).schedule;
  assert.equal(plan.mode,"interval"); if(plan.mode==='interval') assert.equal(plan.interval_minutes,360);
});

test("Feed reader keeps one title, tracks read state, collapses and retries a failed detail", {timeout:60_000}, async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const {command,sessionId,navigate,origin,projectId}=b;
  const child=await pluginFrameBrowser(t,b,'feed'),{evaluate,waitFor,click}=child;
  await pluginFrameInitScript(t,b,`window.__detailFails=true;window.__retryPressing=false;addEventListener('click',event=>{if(event.target.closest?.('[data-retry-feed-detail]')){window.__detailFails=false;window.__retryPressing=event.isTrusted;}},true);addEventListener('click',()=>window.__retryPressing=false);window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{const read=host.view.readDocument;host.view.readDocument=async query=>{if(query?.object?.surface==='persisted-detail'){if(window.__detailFails)throw new Error('failed detail');window.__firstDetailAfterRetry??=window.__retryPressing?'the press':'something else';}return read(query);};return value(host);}:value;return true;}});`);
  const source=createLocalFeedSourceService(b.store.db,DEMO_PROJECT_ID).register({kind:'web_query',query:'阅读测试'}).source;
  const feed=createLocalFeedApplication(b.store.db);
  const item=feed.ingestItem({source,externalId:'reader-test',title:'一次清楚的阅读',summary:'列表摘要',body:'## 核心内容\n\n阅读正文与完整来源。\n\n'+Array.from({length:30},(_,i)=>`### 检查项 ${i+1}\n\n保持标题和操作在视野内，让阅读区独立滚动。`).join('\n\n'),priority:'normal',occurredAt:'2026-09-16T00:00:00.000Z',attention:false}).item;
  await addProjectPlugin(b.web, projectId!, "feed");
  // A fixed desktop size: Chrome's default window is 756 px wide on macOS and 780 px on Linux, either side of the 760 px phone layout.
  await b.setViewport(1440,960);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/`},sessionId));
  await b.waitFor("document.querySelector('[data-titlebar-tabs] .tab-item')");await b.click('[data-plugin-id=feed]');
  const row=`[data-feed-entry-id="${item.item_id}"]`;
  await waitFor(`Boolean(document.querySelector('${row}'))`);
  // The actual owner's object-document port fails until the trusted retry is pressed. Until then the attention read's board cursor is held back: a new cursor
  // refreshes the board, which opens the selected item again and hides the retry while it does. The page also records
  // whether the first object-document read after the press was made by the press itself (the child's capture listener runs
  // before the page's click handler, its bubble listener after), so a later refresh cannot stand in for the retry.
  await b.evaluate(`{const original=window.fetch;window.__holdFeedAttention=true;window.fetch=(url,options)=>window.__holdFeedAttention&&String(url).includes('/api/attention?')?original(url,options).then(async response=>new Response(JSON.stringify({...await response.json(),board_cursor:null}),{status:response.status,headers:response.headers})):original(url,options);}`);
  const retry='[data-feed-stage-workspace] [data-feed-detail-empty] [data-retry-feed-detail]';
  await click(row);await waitFor(`document.querySelector('[data-feed-stage-shell][data-expanded=true] ${retry}')?.checkVisibility()`);
  // One retry, in the placeholder under the reader bar.
  assert.deepEqual(await evaluate<boolean[]>(`[...document.querySelectorAll('[data-feed-stage-workspace] [data-retry-feed-detail]')].filter(b=>b.checkVisibility()).map(b=>b===document.querySelector('${retry}'))`),[true]);
  await click(retry);
  await b.evaluate('window.__holdFeedAttention=false');
  await waitFor(`document.querySelector('[data-feed-detail="${item.item_id}"] .feed-rich-content')`);
  assert.equal(await evaluate<string>("window.__firstDetailAfterRetry"),'the press','the retry itself loads the detail again');
  assert.ok(feed.getFeedItem(DEMO_PROJECT_ID,item.item_id).read_at);
  assert.equal(await evaluate(`document.querySelector('${row}').getAttribute('aria-expanded')`),'true');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('[data-feed-detail="${item.item_id}"] h1')).display`),'none');
  assert.match(await evaluate<string>(`document.querySelector('[data-feed-detail="${item.item_id}"] .feed-rich-content').textContent`),/阅读正文/);
  const headerTop=await evaluate<number>("document.querySelector('.feed-stage-toolbar').getBoundingClientRect().top");
  const bodyPoint=await child.point(`[data-feed-entry-detail="${item.item_id}"] .feed-stage-item-detail`);
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',...bodyPoint,deltaX:0,deltaY:300},sessionId);
  await waitFor(`document.querySelector('[data-feed-entry-detail="${item.item_id}"] .feed-stage-item-detail').scrollTop>100`);
  assert.equal(await evaluate("document.querySelector('.feed-stage-toolbar').getBoundingClientRect().top"),headerTop,'reader scroll never moves the toolbar');
  assert.equal(await evaluate("document.scrollingElement.scrollTop"),0);
  assert.equal(await b.evaluate("document.scrollingElement.scrollTop"),0);
  await click(`[data-feed-entry-detail="${item.item_id}"]:not([hidden]) [data-feed-collapse]`);
  await waitFor("document.querySelector('[data-feed-stage-shell]')?.dataset.expanded !== 'true'");
  assert.equal(await evaluate(`document.querySelector('${row}').getAttribute('aria-expanded')`),'false');
  await click(row);assert.equal(await evaluate(`document.querySelector('[data-feed-detail="${item.item_id}"]').hidden`),false);
  await evaluate(`{const field=document.querySelector('[data-feed-search]');field.value='不存在的标题';field.dispatchEvent(new Event('input',{bubbles:true}));}`);
  assert.equal(await evaluate(`document.querySelector('${row}').closest('[data-feed-item-wrap]').hidden`),true);
  await evaluate("document.querySelector('[data-feed-clear-filters]').click()");
  assert.equal(await evaluate(`document.querySelector('${row}').closest('[data-feed-item-wrap]').hidden`),false);
});
