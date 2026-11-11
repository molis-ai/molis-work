import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { LocalHostHttpClient, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import test from "node:test";
import { DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { installProducers } from "./fixtures/installed-producers.js";
import { boardSnapshot, GoalProjectApplication } from "./fixtures/goal-application.js";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

/** A separate same-origin Window writes storage; the receiver runs its real storage listener. */
async function syncFrameStorage(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, change: string, receiver = "window", redundant = false) {
  const receipt = await browser.evaluate<{ trusted: boolean; oldValue: string; newValue: string; camera: { x: number; y: number; z: number } }>(`new Promise(resolve => {
    const view=${receiver},key=${JSON.stringify("molis-work-frame-container:" + browser.projectId + ":goal:CORE")};
    const oldValue=view.localStorage.getItem(key),value=JSON.parse(oldValue);
    ${change};
    const newValue=JSON.stringify(value${redundant ? ",null,2" : ""});
    if(newValue===oldValue)throw Error('The storage writer must actually change the saved value');
    const writer=view.document.createElement('iframe');writer.hidden=true;view.document.body.append(writer);
    const done=event=>{
      if(event.key!==key||event.newValue!==newValue)return;
      view.removeEventListener('storage',done);
      queueMicrotask(()=>{
        writer.remove();
        const matrix=new view.DOMMatrix(view.getComputedStyle(view.document.querySelector('[data-frame-world]')).transform);
        resolve({trusted:event.isTrusted,oldValue:event.oldValue,newValue:event.newValue,camera:{x:matrix.e,y:matrix.f,z:matrix.a}});
      });
    };
    view.addEventListener('storage',done);
    const scope=view.document.querySelector('meta[name="molis-work-page-session"]')?.content.split('.')[1];
    writer.contentWindow.localStorage.setItem((scope?'molis-account-cache:'+encodeURIComponent(scope)+':':'')+key,newValue);
  })`);
  assert.equal(receipt.trusted, true, "the browser delivers storage from another same-origin Window");
  assert.notEqual(receipt.newValue, receipt.oldValue, "the other Window really writes storage");
  assert.deepEqual(receipt.camera, JSON.parse(receipt.newValue).camera, "the visible camera consumes the incoming state");
  return receipt;
}


// T01-FRAME-CURSOR-01: fixture writes must finish refreshing the page before measuring camera-only reads.
// A real board refresh may reread the owner; it is not a second read caused by the tested storage event.
async function awaitFrameCursor(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, owner: LocalHostHttpClient, receiver = "window") {
  const cursor = await owner.get<{ observed_event_cursor: number }>(`/projects/${browser.projectId}/api/board/cursor`);
  await browser.waitFor(`Number(${receiver}.document.querySelector('#molis-work-data').boardCursor) >= ${cursor.observed_event_cursor}`);
}

test("RAC-2516 RAC-2518 trusted Feed and Inbox drag handles reach the actual Goal pane; child messages and late withdrawn sources cannot add blocks", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null, undefined, undefined, {}, undefined, undefined, true); if (!b) return;
  const { command, sessionId, projectId, origin } = b;
  assert.ok(projectId);
  const capture = async (name: string) => {
    const output=reviewEvidenceUrl("t403-native/"); await mkdir(output,{recursive:true});
    await writeFile(new URL(name+".png",output),Buffer.from((await command<{data:string}>("Page.captureScreenshot",{format:"png"},sessionId)).data,"base64"));
  };
  const owner = new LocalHostHttpClient({ origin, controlToken: b.controlToken });
  await owner.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed", expected_revision: await projectPluginRevision(owner, projectId) });
  await owner.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "inbox", expected_revision: await projectPluginRevision(owner, projectId) });
  const feed = createLocalFeedApplication(b.store.db), now = new Date().toISOString();
  const source = feed.sources.upsert({ project_id: projectId!, source_id: "native-frame-source", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "Frame drag source", description: "", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "native-frame-drag", title: "Actual opaque drag", summary: "Owner display fields", body: "Original material", occurredAt: now, attention: false }).item;
  const inboxEntry = feed.ensureInboxEntryForFeedItem(projectId!, item.item_id, "manual").entry;
  for (let index=0;index<8;index++) feed.ingestItem({ source, externalId: "drag-scroll-"+index, title: "Other drag material "+index, summary: "Actual rows make the source list scroll", occurredAt: new Date(Date.parse(now)-(index+1)*1000).toISOString(), attention: false });
  await pluginFrameInitScript(t, b, `const receive=MessagePort.prototype.addEventListener;MessagePort.prototype.addEventListener=function(type,listener,options){if(type==='message')receive.call(this,type,event=>{if(event.data?.type==='molis:plugin-connect'){window.t403Port=event.ports[0];receive.call(t403Port,'message',event=>{if(event.data?.type==='frame-asset-source')window.t403Handle=event.data.handle})}},{once:true});return receive.call(this,type,listener,options)};
    window.t403OpaqueTrace=[];window.t403Reads={pending:0,total:0,trace:[],pendingIds:new Set()};
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=['feed','inbox'].includes(key)?host=>{
      window.t403Host=host;const read=host.view.readDocument;
      host.view.readDocument=async(...args)=>{
        const query=args[0],id=++t403Reads.total,started=performance.now();
        const trace={id,object:query?.object?{id:query.object.id,surface:query.surface||query.object.kind}:'stage',phase:'start',aborted:Boolean(query?.signal?.aborted)};
        t403Reads.trace.push(trace);t403Reads.trace.splice(0,Math.max(0,t403Reads.trace.length-12));t403Reads.pending++;t403Reads.pendingIds.add(id);
        try{
          const html=await read(...args),doc=new DOMParser().parseFromString(html,'text/html'),detail=doc.querySelector('[data-feed-detail="'+${JSON.stringify(item.item_id)}+'"]');
          Object.assign(trace,{phase:'ok',hasTargetDetail:Boolean(detail),hasAction:Boolean(detail?.querySelector('[data-feed-action]')),revision:Number(detail?.querySelector('[data-feed-revision]')?.dataset.feedRevision||0)});
          return html;
        }catch(error){Object.assign(trace,{phase:'error',error:{name:error?.name,code:error?.code,message:String(error?.message||error).slice(0,200)}});throw error;}
        finally{trace.duration=Math.round(performance.now()-started);trace.aborted=Boolean(query?.signal?.aborted);t403Reads.pending--;t403Reads.pendingIds.delete(id);}
      };return value(host);
    }:value;return true}});`);
  const child = await pluginFrameBrowser(t, b, "feed", "iframe[data-t403-feed-pane]");
  const inboxChild = await pluginFrameBrowser(t, b, "inbox", "iframe[data-t403-feed-pane]");
  const { targetInfo } = await command<{ targetInfo: { targetId: string } }>("Target.getTargetInfo", {}, sessionId);
  const { windowId } = await command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: targetInfo.targetId });
  await command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1100 } });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=goals]');
  await b.waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded==='true'");
  await b.evaluate("document.querySelector('[data-board-view-tab=canvas]').click()");
  await b.waitFor("document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]')");
  await b.evaluate("document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]').click()");
  await b.waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal==='CORE' && !document.querySelector('[data-goal-frame-surface]').hidden && !!window.molisPluginFrames");
  await b.click('[data-layout-open]'); await b.click('[data-layout-split=right]');
  await b.waitFor("document.querySelectorAll('iframe.tab-content-frame').length===2");
  try { await b.click('[data-plugin-strip] [data-plugin-id=feed]'); }
  catch (error) {
    // T405-FULL-03: observation cannot replace the original click error or its 15 s deadline.
    const snapshot = await b.command('Runtime.evaluate', { expression: "(()=>({url:location.href,ready:document.readyState,visibility:document.visibilityState,focus:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,180),surface:document.body?.dataset.desktopSurface,viewport:[innerWidth,innerHeight],panes:[...document.querySelectorAll('[data-tab-pane]')].map(p=>({id:p.dataset.tabPane,focused:p.classList.contains('is-focused'),tabs:[...p.querySelectorAll('.tab-item')].map(t=>({id:t.dataset.tabId,plugin:t.dataset.plugin,kind:t.dataset.tabKind,item:t.dataset.itemId,current:t.hasAttribute('aria-current')}))})),frames:[...document.querySelectorAll('iframe.tab-content-frame')].map(f=>({src:f.src,hidden:f.hidden,connected:f.isConnected,pane:f.dataset.paneOwner,tab:f.dataset.paneTab,ready:f.contentDocument?.readyState,surface:f.contentDocument?.body?.dataset.desktopSurface,roots:[...f.contentDocument?.querySelectorAll('[data-ui-client-state]')||[]].map(r=>({state:r.dataset.uiClientState,plugin:r.dataset.pluginOwner,page:r.dataset.pluginPage,hidden:r.hidden})),children:[...f.contentDocument?.querySelectorAll('iframe[data-plugin-frame]')||[]].map(c=>({surface:c.dataset.pluginFrame,src:c.src,connected:c.isConnected}))}))}))()", returnByValue: true }, sessionId, 1500).catch(observation => ({ unavailable: String(observation) }));
    t.diagnostic('T405 Feed click failed ' + JSON.stringify(snapshot));
    throw error;
  }
  await b.waitFor("[...document.querySelectorAll('iframe.tab-content-frame')].some(frame=>frame.contentDocument?.body?.dataset.desktopSurface==='feed')");
  await b.evaluate("for(const frame of document.querySelectorAll('iframe.tab-content-frame')){frame.removeAttribute('data-t403-feed-pane');frame.removeAttribute('data-t403-goal-pane');if(!frame.hidden)frame.toggleAttribute(frame.contentDocument.body.dataset.desktopSurface==='feed'?'data-t403-feed-pane':'data-t403-goal-pane',true)}");
  const sourcePane = await b.evaluate<string>("document.querySelector('iframe[data-t403-feed-pane]').dataset.paneOwner");
  const goalPane = await b.evaluate<string>("document.querySelector('iframe[data-t403-goal-pane]').dataset.paneOwner");
  const focusSource = () => b.click(`[data-tab-pane="${sourcePane}"] .tab-item[aria-current] .tab-item-trigger`);
  await child.waitFor(`window.t403Port && t403Reads.total>0 && t403Reads.pending===0 && document.querySelector('[data-feed-item-id="${item.item_id}"]')`);
  const count = () => b.evaluate<number>("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelectorAll('[data-frame-block]').length");
  // The rest of the row still receives an actual owner click; only its new small slot belongs to the Host.
  await child.click(`[data-frame-asset-id="${item.item_id}"] strong`);
  try { await child.waitFor(`document.querySelector('[data-feed-detail="${item.item_id}"] [data-feed-action]') && t403Reads.pending===0`); }
  catch (error) {
    const snapshot = await Promise.allSettled([
      child.evaluate(`(()=>{const detail=document.querySelector('[data-feed-detail="${item.item_id}"]'),row=document.querySelector('[data-feed-entry-id="${item.item_id}"]');return {reads:{total:t403Reads.total,pending:t403Reads.pending,ids:[...t403Reads.pendingIds],trace:t403Reads.trace},detail:{connected:Boolean(detail?.isConnected),hasAction:Boolean(detail?.querySelector('[data-feed-action]'))},row:row?{...row.dataset}:null,placeholder:document.querySelector('[data-feed-detail-empty]')?.textContent.slice(-200),retry:document.querySelector('[data-retry-feed-detail]')?.checkVisibility(),scope:{alive:t403Host.scope.alive,visible:t403Host.scope.visible},bodyHidden:document.body.hidden}})()`),
      b.evaluate("(()=>{const owner=document.querySelector('iframe[data-t403-feed-pane]'),doc=owner.contentDocument,root=doc.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench]'),frame=root?.querySelector('iframe[data-plugin-frame=feed]');return {owner:{...owner.dataset},page:doc.location.href,root:root?{...root.dataset}:null,frame:frame?{...frame.dataset}:null}})()"),
    ]);
    t.diagnostic(JSON.stringify(snapshot.map(value=>value.status==='fulfilled'?value.value:{unavailable:String(value.reason)})));
    throw error;
  }
  await child.click('[data-feed-collapse]');
  await child.evaluate(`document.querySelector('[data-frame-asset-id="${item.item_id}"]').scrollIntoView({block:'center'})`);
  const sourceHandle = (id = item.item_id) => b.waitFor(`document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-host-frame-drag="${id}"]')`);
  await sourceHandle();
  // A fresh owner document can gain B while this still-current handle's original projection contains only A.
  const originalHandle = await child.evaluate<string>("t403Handle");
  const originalProjection = await b.evaluate<string>("document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench] script[data-plugin-document]').textContent");
  const revisionHold = await sendBarrier(b,[{urlPattern:"*/api/plugins/io.molis.work.feed/view-revision",requestStage:"Request"}]);
  try {
    const added = feed.ingestItem({source,externalId:"fresh-outside-drag-projection",title:"Fresh owner material outside the old handle",summary:"A later real record outside the original drag projection",occurredAt:new Date(Date.parse(now)-20000).toISOString(),attention:false}).item;
    assert.equal(originalProjection.includes(added.item_id),false);
    assert.equal(await b.evaluate(`fetch(document.querySelector('iframe[data-t403-feed-pane]').src).then(response=>response.text()).then(html=>html.includes(${JSON.stringify(added.item_id)}))`),true,"the real fresh owner HTML contains the later reference");
    assert.equal(await child.evaluate("t403Handle"),originalHandle,"the source handle has not rotated while revision delivery is held");
    assert.equal(await b.evaluate(`document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-plugin-owner="io.molis.work.feed"][data-plugin-surface=workbench] script[data-plugin-document]').textContent`),originalProjection);
    assert.equal(await b.evaluate(`document.querySelector('iframe[data-t403-feed-pane]').contentWindow.molisPluginFrames.assets.localDrag({handle:${JSON.stringify(originalHandle)},reference:{kind:'feed_item',id:${JSON.stringify(added.item_id)}}}).then(asset=>asset?.reference??null)`),null,"production localDrag refuses a fresh-only ref absent from this handle's original projection");
  } finally { await revisionHold.close(); }
  await child.evaluate(`document.querySelector('[data-feed-search]').value='no matching drag source';document.querySelector('[data-feed-search]').dispatchEvent(new Event('input',{bubbles:true}))`);
  await b.waitFor(`!document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-host-frame-drag="${item.item_id}"]')`);
  await child.evaluate("document.querySelector('[data-feed-search]').value='';document.querySelector('[data-feed-search]').dispatchEvent(new Event('input',{bubbles:true}))");
  await child.evaluate(`document.querySelector('[data-frame-asset-id="${item.item_id}"]').scrollIntoView({block:'center'})`); await sourceHandle();
  await child.evaluate(`(() => {const row=document.querySelector('[data-frame-asset-id="${item.item_id}"]'),list=row.closest('.feed-stage-tree');list.scrollTop=row.getBoundingClientRect().top-list.getBoundingClientRect().top<list.clientHeight/2?list.scrollHeight:0;})()`);
  await b.waitFor(`!document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-host-frame-drag="${item.item_id}"]')`);
  await child.evaluate(`document.querySelector('[data-frame-asset-id="${item.item_id}"]').scrollIntoView({block:'center'})`); await sourceHandle();
  const restoreSlots = async () => {
    await child.evaluate(`document.querySelector('[data-frame-asset-id="${item.item_id}"] [data-frame-drag-slot]').hidden=true;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await child.evaluate(`document.querySelector('[data-frame-asset-id="${item.item_id}"] [data-frame-drag-slot]').hidden=false`);
    await sourceHandle();
  };
  for (const slot of [{ reference: { kind: "foreign", id: "not-in-the-owner-view" }, box: {x:0,y:0,width:24,height:24} }, { reference: {kind:"feed_item",id:item.item_id}, box: {x:0,y:0,width:999,height:999} }]) {
    await child.evaluate(`t403Port.postMessage({type:'frame-asset-layout',handle:t403Handle,slots:[${JSON.stringify(slot)}],title:'forged title',goalId:'OTHER'})`);
    await b.waitFor(`!document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-host-frame-drag="${item.item_id}"]')`);
    assert.equal(await count(),0,"layout proposals and forged fields grant no Frame write"); await restoreSlots();
  }
  await child.evaluate(`t403Port.postMessage({type:'frame-add',reference:{kind:'feed_item',id:${JSON.stringify(item.item_id)}},goalId:'CORE',isTrusted:true});t403Port.postMessage({type:'frame-assets',rows:[],isTrusted:true})`);
  await child.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await count(), 0, "an ordinary child message has no Frame write authority");
  const destination = () => b.evaluate<{ x: number; y: number }>(`(() => {
    const frame=document.querySelector('iframe[data-t403-goal-pane]'),doc=frame.contentDocument,canvas=doc.querySelector('[data-frame-canvas]'),outer=frame.getBoundingClientRect(),inner=canvas.getBoundingClientRect();
    const local={x:inner.left+inner.width/2,y:inner.top+Math.min(180,inner.height/2)},point={x:outer.left+local.x,y:outer.top+local.y};
    const top=document.elementFromPoint(point.x,point.y),inside=doc.elementFromPoint(local.x,local.y);
    window.t403Destination={outer:outer.toJSON(),inner:inner.toJSON(),point,local,visible:frame.checkVisibility({visibilityProperty:true}),top:top?.outerHTML.slice(0,300),inside:inside?.outerHTML.slice(0,200),pointer:getComputedStyle(frame).pointerEvents,workspace:document.querySelector('[data-tab-workspace]')?.className,narrow:document.querySelector('[data-tab-workspace]')?.hasAttribute('data-split-narrow')};
    if(!t403Destination.visible||top!==frame||!inside||!canvas.contains(inside))throw Error('Native Frame destination is not hit: '+JSON.stringify(t403Destination));
    return point;
  })()`);
  type DragData = { items: Array<{ mimeType: string; data: string }>; dragOperationsMask: number };
  let interceptedSession: string | undefined;
  let lastDrag: DragData | undefined;
  const drag = async (reference = { kind: "feed_item", id: item.item_id }) => {
    await destination();
    await (reference.kind === "feed_item" ? child : inboxChild).evaluate(`document.querySelector('[data-frame-asset-id="${reference.id}"]').scrollIntoView({block:'center'})`);
    await sourceHandle(reference.id);
    const point = await b.evaluate<{x:number;y:number}>(`(() => {
      const frame=document.querySelector('iframe[data-t403-feed-pane]'),doc=frame.contentDocument,node=doc.querySelector('[data-host-frame-drag="${reference.id}"]'),box=node.getBoundingClientRect(),outer=frame.getBoundingClientRect(),local={x:box.x+box.width/2,y:box.y+box.height/2};
      const point={x:outer.x+local.x,y:outer.y+local.y};
      if(!frame.checkVisibility()||box.width>24||box.height>24||doc.elementFromPoint(local.x,local.y)!==node||document.elementFromPoint(point.x,point.y)!==frame)throw Error('Trusted drag handle is not hit');
      const view=frame.contentWindow;
      if(!view.t403SourceObserved){view.t403SourceObserved=true;view.t403FrameTrace||=[];for(const type of ['dragstart','dragend'])doc.addEventListener(type,event=>{view.t403FrameTrace.push({type,trusted:event.isTrusted});if(type==='dragstart')view.t403NativeDrag={trusted:event.isTrusted,raw:event.dataTransfer.getData('application/x-molis-work-asset')};});}
      view.t403NativeDrag=null;return point;
    })()`);
    let deliver!: (data: DragData) => void;
    const intercepted = new Promise<DragData>(resolve => { deliver = resolve; });
    const off = b.on("Input.dragIntercepted", (event, sourceSession) => { interceptedSession = sourceSession; deliver(event.data as DragData); });
    await command("Input.setInterceptDrags", { enabled: true }, sessionId);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, buttons: 0 }, sessionId);
      await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 }, sessionId);
      for (const delta of [8, 18, 32]) await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + delta, y: point.y + 3, button: "left", buttons: 1 }, sessionId);
      const data = await Promise.race([intercepted, new Promise<never>((_, reject) => { timeout=setTimeout(()=>reject(Error('Native drag was not intercepted')),5000); })]);
      await b.waitFor("document.querySelector('iframe[data-t403-feed-pane]').contentWindow.t403NativeDrag?.trusted");
      const receipt = await b.evaluate<{ trusted: boolean; raw: string }>("document.querySelector('iframe[data-t403-feed-pane]').contentWindow.t403NativeDrag"), payload = JSON.parse(receipt.raw);
      assert.deepEqual(payload.reference, reference);
      assert.deepEqual(Object.keys(payload).sort(), ["handle", "reference"]);
      assert.equal(data.items.find(value=>value.mimeType==='application/x-molis-work-asset')?.data,receipt.raw,"the browser's original DragData carries the actual native payload");
      lastDrag = data;
      return data;
    } finally { off(); clearTimeout(timeout); }
  };
  const drop = async (data: DragData) => {
    const point = await destination();
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "left", buttons: 1 }, sessionId);
    for(const type of ['dragEnter','dragOver','drop'])await command("Input.dispatchDragEvent",{type,...point,data},sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 }, sessionId);
    await command("Input.setInterceptDrags", { enabled: false }, sessionId);
  };
  await b.waitFor("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelector('[data-goal-frame-surface]')?.hidden===false && !!document.querySelector('iframe[data-t403-goal-pane]').contentWindow.molisPluginFrames");
  await b.evaluate(`(() => {
    window.t403FrameTopTrace=[];for(const type of ['dragenter','dragover','drop','dragend'])document.addEventListener(type,event=>t403FrameTopTrace.push({type,x:event.clientX,y:event.clientY,trusted:event.isTrusted,target:event.target.outerHTML?.slice(0,200),types:[...event.dataTransfer.types],dropEffect:event.dataTransfer.dropEffect,defaultPrevented:event.defaultPrevented}),true);
    for(const name of ['goal','feed']) {
      const frame=document.querySelector('iframe[data-t403-'+name+'-pane]'),view=frame.contentWindow,doc=frame.contentDocument;
      view.t403FrameTrace=[];
      if(name==='feed')view.t403SourceObserved=true;
      for(const type of ['dragstart','dragenter','dragover','drop','dragend','pointerdown','pointerup','click'])doc.addEventListener(type,event=>{
        view.t403FrameTrace.push({type,trusted:event.isTrusted,target:event.target.outerHTML.slice(0,200),raw:event.dataTransfer?.getData('application/x-molis-work-asset')});
        if(type==='dragstart')view.t403NativeDrag={trusted:event.isTrusted,raw:event.dataTransfer.getData('application/x-molis-work-asset')};
      },type!=='dragstart');
      const assets=view.molisPluginFrames.assets,method=name==='goal'?'drag':'localDrag',original=assets[method];
      assets[method]=async(...args)=>{view.t403FrameTrace.push({method,input:args[0]});try{const result=await original(...args);view.t403FrameTrace.push({method,result:result?.id});return result}catch(error){view.t403FrameTrace.push({method,error:String(error)});throw error}};
    }
  })()`);
  const firstDrag = await drag();
  // A forged DOM drop is a negative control; the same browser drag still has to complete through a trusted drop.
  await b.evaluate(`(() => {const doc=document.querySelector('iframe[data-t403-goal-pane]').contentDocument,data=new doc.defaultView.DataTransfer();data.setData('application/x-molis-work-asset',${JSON.stringify(firstDrag.items.find(value=>value.mimeType==='application/x-molis-work-asset')!.data)});doc.querySelector('[data-frame-canvas]').dispatchEvent(new doc.defaultView.DragEvent('drop',{bubbles:true,dataTransfer:data}));})()`);
  assert.equal(await count(),0,"a synthetic Host drop is refused even with the current real native payload");
  const firstBarrier = await sendBarrier(b, [{ urlPattern: `*/projects/${projectId}/?*`, requestStage: "Request" }]);
  try {
    await drop(firstDrag); await firstBarrier.next();
    await b.waitFor("document.querySelector('iframe[data-t403-feed-pane]').contentWindow.t403FrameTrace.some(event=>event.type==='dragend'&&event.trusted)");
    assert.equal(await count(),0,"normal native dragend does not grant a block before its fresh owner read");
  } finally { await firstBarrier.close(); }
  try { await b.waitFor("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelectorAll('[data-frame-block]').length===1"); }
  catch (error) {
    t.diagnostic(JSON.stringify({ interceptedSession, targetSession: sessionId, drag: lastDrag, opaque: await child.evaluate("t403OpaqueTrace"), host: await b.evaluate("({destination:t403Destination,top:t403FrameTopTrace,panes:[...document.querySelectorAll('iframe[data-t403-goal-pane],iframe[data-t403-feed-pane]')].map(frame=>({pane:frame.dataset.paneOwner,trace:frame.contentWindow.t403FrameTrace,body:frame.contentDocument.body.dataset.desktopSurface,frame:frame.contentDocument.querySelector('[data-goal-frame-surface]')?.hidden,rect:frame.contentDocument.querySelector('[data-frame-canvas]')?.getBoundingClientRect().toJSON()}))})") }));
    throw error;
  }
  const dropped = await b.evaluate<{trusted:boolean;raw:string}>("document.querySelector('iframe[data-t403-goal-pane]').contentWindow.t403FrameTrace.find(event=>event.type==='drop'&&event.trusted)");
  assert.equal(dropped.trusted,true,"the target Host receives the real trusted drop");
  assert.equal(JSON.parse(dropped.raw).reference.id,item.item_id);
  const stored = () => b.evaluate<{ camera: { x: number; y: number; z: number }; expanded: string; blocks: Array<{ id: string; kind: string; itemId: string; title: string; x: number; y: number }> }>(`JSON.parse(localStorage.getItem('molis-work-frame-container:${projectId}:goal:CORE'))`);
  const firstStored = await stored(); assert.equal(firstStored.blocks[0]!.kind, "feed"); assert.equal(firstStored.blocks[0]!.itemId, item.item_id); assert.equal(firstStored.blocks[0]!.title, item.title);
  assert.ok(firstStored.blocks[0]!.x >= 16 && firstStored.blocks[0]!.y >= 16, "the actual target canvas chooses the stored position");
  await b.click(`[data-tab-pane="${goalPane}"] .tab-item[aria-current] .tab-item-trigger`);
  const goalWindow = "document.querySelector('iframe[data-t403-goal-pane]').contentWindow";
  await awaitFrameCursor(b, owner, goalWindow);
  const gesture = <T>(expression: string) => b.evaluate<T>(`(() => {const view=${goalWindow},doc=view.document,p=view.t403Gesture;return (${expression});})()`);
  await b.evaluate(`(() => {
    const view=${goalWindow},doc=view.document,p=view.t403Gesture={events:[],reads:[],target:null,article:null};
    for(const type of ['pointerdown','pointerup','click'])doc.addEventListener(type,event=>{
      if(type==='pointerdown'){p.target=event.target;p.article=event.target.closest('[data-frame-block]');}
      if(!p.article)return;
      p.events.push({type,trusted:event.isTrusted,sameArticle:event.target.closest('[data-frame-block]')===p.article});
    },true);
    const fetch=view.fetch;view.fetch=(input,...args)=>{
      const url=String(input?.url||input);if(url.includes('/api/stage/')&&url.includes('/objects/'))p.reads.push(url);
      return fetch.call(view,input,...args);
    };
  })()`);
  const pressBlock = async () => {
    await gesture("(p.events=[],p.reads=[],p.target=null,p.article=null)");
    const point = await b.evaluate<{x:number;y:number}>(`(() => {const frame=document.querySelector('iframe[data-t403-goal-pane]'),doc=frame.contentDocument,node=doc.querySelector('[data-frame-block-kind=feed]'),rect=node.getBoundingClientRect(),outer=frame.getBoundingClientRect(),local={x:rect.left+80,y:rect.top+20};if(!frame.checkVisibility({visibilityProperty:true})||document.elementFromPoint(outer.x+local.x,outer.y+local.y)!==frame||!node.contains(doc.elementFromPoint(local.x,local.y)))throw Error('Frame block is not hit');return{x:outer.x+local.x,y:outer.y+local.y};})()`);
    await command("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",buttons:1,clickCount:1},sessionId);
    assert.equal(await gesture("p.events.some(event=>event.type==='pointerdown'&&event.trusted)"),true);
    return point;
  };
  // FCS-03: changing the identity or deleting the pressed block must still invalidate its real gesture.
  for (const change of [
    `Object.assign(value.blocks[0],{kind:'inbox',itemId:${JSON.stringify(inboxEntry.entry_id)},itemRef:${JSON.stringify(inboxEntry.entry_id)},entryId:${JSON.stringify(inboxEntry.entry_id)}})`,
    "value.blocks=[]",
  ]) {
    const point = await pressBlock();
    const changed = await syncFrameStorage(b,change,goalWindow);
    assert.equal(await gesture("p.target.isConnected||p.article.isConnected"),false,"changed block data discards the pressed DOM");
    assert.deepEqual(await gesture("[...doc.querySelectorAll('[data-frame-block]')].map(node=>({id:node.dataset.frameBlock,kind:node.dataset.frameBlockKind}))"),JSON.parse(changed.newValue).blocks.map((block: { id: string; kind: string })=>({id:block.id,kind:block.kind})),"the changed identity or removal is actually drawn");
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",buttons:0,clickCount:1},sessionId);
    assert.equal(await gesture("p.events.some(event=>event.type==='pointerup'&&event.trusted)"),true);
    assert.equal((await stored()).expanded,"","a stale release cannot expand the removed or replacement block");
    assert.deepEqual(await gesture("p.reads"),[],"a stale release cannot read either owner");
    await syncFrameStorage(b,`Object.assign(value,${JSON.stringify(firstStored)})`,goalWindow);
  }
  // FCS-01/FCS-04: keep the original trusted click and owner assertions, interleaving a real camera-only write.
  const blockPoint = await pressBlock();
  const cameraSync = await syncFrameStorage(b,"value.camera.x+=1",goalWindow);
  assert.deepEqual(JSON.parse(cameraSync.newValue).blocks,firstStored.blocks);
  assert.equal(JSON.parse(cameraSync.newValue).expanded,firstStored.expanded);
  assert.equal(await gesture("p.target.isConnected&&p.article.isConnected&&doc.querySelector('[data-frame-block]')===p.article"),true,"camera-only storage keeps the pressed target and the exact block node");
  await command("Input.dispatchMouseEvent",{type:"mouseReleased",...blockPoint,button:"left",buttons:0,clickCount:1},sessionId);
  try { await b.waitFor("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelector('[data-frame-block-body]')?.textContent.includes('Original material')"); }
  catch(error){t.diagnostic(JSON.stringify({stored:await stored(),goal:await b.evaluate("(()=>{const frame=document.querySelector('iframe[data-t403-goal-pane]');return{trace:frame.contentWindow.t403FrameTrace,html:frame.contentDocument.querySelector('[data-frame-block]')?.outerHTML}})()")}));throw error;}
  assert.equal(await gesture("p.events.some(event=>event.type==='pointerup'&&event.trusted&&event.sameArticle)"),true,"the original block receives the trusted release");
  assert.equal(await gesture("p.events.filter(event=>event.type==='click'&&event.trusted&&event.sameArticle).length"),1,"one real release produces one click on the original block");
  assert.equal((await stored()).expanded,firstStored.blocks[0]!.id);
  assert.equal(await gesture("p.reads.length"),1,"the click reads its owner once");
  assert.match(await gesture<string>("p.reads[0]"),new RegExp("/api/stage/feed/objects/"+item.item_id));
  await gesture("(p.body=doc.querySelector('[data-frame-block-body]'))");
  await syncFrameStorage(b,"value.camera.x+=1",goalWindow);
  assert.equal(await gesture("p.body.isConnected&&doc.querySelector('[data-frame-block-body]')===p.body&&p.body.dataset.loaded==='feed:'+"+JSON.stringify(item.item_id)),true);
  assert.equal(await gesture("p.reads.length"),1,"camera-only storage does not reread the completed Feed body");
  const markSource = async (plugin: string) => {
    await b.waitFor(`[...document.querySelectorAll('iframe.tab-content-frame')].some(frame=>!frame.hidden&&frame.contentDocument?.body?.dataset.desktopSurface===${JSON.stringify(plugin)})`);
    await b.evaluate(`for(const frame of document.querySelectorAll('iframe.tab-content-frame')){frame.removeAttribute('data-t403-feed-pane');if(!frame.hidden&&frame.contentDocument?.body?.dataset.desktopSurface===${JSON.stringify(plugin)})frame.setAttribute('data-t403-feed-pane','')}`);
  };
  await focusSource(); await sourceHandle(); await capture("feed-goal-pane");
  await b.click('[data-plugin-strip] [data-plugin-id=inbox]'); await markSource("inbox");
  await inboxChild.waitFor("t403Reads.total>0 && t403Reads.pending===0"); await sourceHandle(inboxEntry.entry_id);
  await drop(await drag({kind:"inbox_entry",id:inboxEntry.entry_id}));
  await b.waitFor("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelectorAll('[data-frame-block]').length===2");
  const before = await stored(); assert.equal(before.blocks[1]!.kind,"inbox"); assert.equal(before.blocks[1]!.itemId,inboxEntry.entry_id); assert.equal(before.blocks[1]!.title,item.title);
  await capture("inbox-goal-pane");
  await b.click('[data-plugin-strip] [data-plugin-id=feed]'); await markSource("feed");
  // Back on Feed the child context can be a fresh document: wait until it has been handed its source handle before reading it.
  await child.waitFor("t403Reads.pending===0 && typeof window.t403Handle==='string'");
  const settled = () => b.evaluate<number>("document.querySelector('iframe[data-t403-goal-pane]').contentWindow.t403FrameTrace.filter(event=>event.method==='drag'&&('result' in event||'error' in event)).length");
  for (const reason of ["hidden", "producer"] as const) {
    const previous = await settled(), originalHandle = await child.evaluate<string>("t403Handle"), pending = await drag();
    const held = await sendBarrier(b, [{urlPattern:`*/projects/${projectId}/?*`,requestStage:"Request"}]);
    try {
      await drop(pending); await held.next();
      await b.evaluate(reason === "hidden" ? "document.querySelector('iframe[data-t403-feed-pane]').hidden=true" : "(()=>{const root=document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench]');window.t403OriginalProducer=root.dataset.pluginProducer;root.dataset.pluginProducer='replaced-producer';})()");
      await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      await b.evaluate(reason === "hidden" ? "document.querySelector('iframe[data-t403-feed-pane]').hidden=false" : "document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-plugin-owner=\"io.molis.work.feed\"][data-plugin-surface=workbench]').dataset.pluginProducer=t403OriginalProducer");
    } finally { await held.close(); }
    await b.waitFor(`document.querySelector('iframe[data-t403-goal-pane]').contentWindow.t403FrameTrace.filter(event=>event.method==='drag'&&('result' in event||'error' in event)).length>${previous}`);
    assert.deepEqual(await stored(),before,reason+" during the fresh read rejects the late add even after the surface returns");
    await sourceHandle(); await child.waitFor(`t403Handle && t403Handle!==${JSON.stringify(originalHandle)}`);
    await child.evaluate(`t403Port.postMessage({type:'frame-asset-layout',handle:${JSON.stringify(originalHandle)},slots:[]});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await b.evaluate(`!!document.querySelector('iframe[data-t403-feed-pane]').contentDocument.querySelector('[data-host-frame-drag="${item.item_id}"]')`),true,"old-handle layout cannot remove the current control");
  }
  const data = await drag();
  const barrier = await sendBarrier(b, [{ urlPattern: `*/projects/${projectId}/?*`, requestStage: "Request" }]);
  try {
    await drop(data); await barrier.next();
    await owner.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed", expected_revision: await projectPluginRevision(owner, projectId) });
    await b.evaluate("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelector('[data-board-view-tab=list]').click()");
  } finally { await barrier.close(); }
  await b.waitFor("document.querySelector('iframe[data-t403-goal-pane]').contentDocument.querySelector('[data-goal-frame-surface]').hidden");
  await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.deepEqual(await stored(), before, "source withdrawal and a target switch discard the late add without changing the original Goal");
  await b.reloadPage();
  assert.deepEqual(await stored(), before, "the successful native drop retains its exact reference and position after reload");
});

test("Goal Frames use outer tabs, preserve references, and isolate project state", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, store, projectId } = browser;
  assert.ok(projectId);
  // RAR-09 / T01-FRAME-01: a Frame redraw can replace the ready preview between two CDP calls.
  // Capture readiness, content and forbidden controls together, with the original 10 s deadline.
  const readPreview = (ready: string, forbidden: string) => evaluate<{ text: string; hasForbidden: boolean; surface: string; expanded: number }>(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const read = () => {
      const block = document.querySelector('[data-frame-block].is-expanded');
      if (block?.querySelector(${JSON.stringify(ready)})) return resolve({ text: block.textContent || '', hasForbidden: !!block.querySelector(${JSON.stringify(forbidden)}), surface: document.body.dataset.desktopSurface, expanded: document.querySelectorAll('[data-frame-block].is-expanded').length });
      if (Date.now() >= deadline) reject(new Error('Frame preview did not become ready: ' + ${JSON.stringify(ready)}));
      else setTimeout(read, 16);
    }; read();
  })`);
  // T405-FULL-01: the running Host keeps ownership while this fixture enables its project plugins.
  const owner = new LocalHostHttpClient({ origin, controlToken: browser.controlToken });
  for (const plugin_id of ["feed", "inbox"] as const) {
    await owner.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id, expected_revision: await projectPluginRevision(owner, projectId) });
  }
  const now = new Date().toISOString();
  const feed = createLocalFeedApplication(store.db);
  const source = feed.sources.upsert({
    project_id: DEMO_PROJECT_ID, source_id: "frame-rss", kind: "rss", definition_id: "rss", sync_kind: "manual",
    name: "产品观察", description: "Frame 验证", status: "active", enabled: true, item_count: 0, origin: "molis_work",
    config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null,
    last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now,
  });
  const feedItem = feed.ingestItem({
    source, externalId: "frame-feed", title: "核对 Frame 的 Feed 条目",
    summary: "点进 Frame 后应变成引用卡片。", body: "只验证引用，不打开整页。", occurredAt: now, attention: false,
  });
  const inbox = feed.ensureInboxEntryForFeedItem(DEMO_PROJECT_ID, feedItem.item.item_id, "manual");
  const archived = feed.ingestItem({ source, externalId: "frame-archived", title: "已忽略的 Frame 材料", summary: "隐藏筛选仍可引用", occurredAt: now, attention: false }).item;
  feed.setDisposition(DEMO_PROJECT_ID, archived.item_id, "archived");
  const historyItem = feed.ingestItem({ source, externalId: "frame-history", title: "已处理的 Frame 事项", summary: "保留历史引用", occurredAt: now, attention: false }).item;
  const history = feed.ensureInboxEntryForFeedItem(DEMO_PROJECT_ID, historyItem.item_id, "manual").entry;
  feed.setInboxEntryStatus(DEMO_PROJECT_ID, history.entry_id, "done");
  new GoalProjectApplication(store).goalTreeSubmission.submitGoalTreeProposal({ project_id: DEMO_PROJECT_ID, actor_id: "runtime:frame-fixture:session", root_goal_id: "CORE", summary: "Frame 中保留待决定事项", items: [{ item_id: "frame-pending-child", kind: "goal", operation: "create", payload: { goal_id: "frame-pending-child", title: "待确认的 Frame 子目标", outcome: "保留原候选范围" }, source_refs: ["runtime"], reason: "用户确认后创建", confidence: 1 }], idempotency_key: "frame-pending-goal" });
  const decision = new AttentionModule(store.db, { exists: (_project, kind, id) => kind === "goal_decision" && id === "CORE" }).query.findForSubject(DEMO_PROJECT_ID, "goal_decision", "CORE", "io.molis.work.goals")[0]!;
  assert.ok(decision, "Goals creates its own pending decision before the cold picker opens");
  installProducers(store.db, { plugin_id: "example.writer", artifact_types: ["example.note"] });
  for (const version of [1, 2]) openProjectVersionStores(store).artifacts.commands.registerVersion({ ...pinnedArtifact("Frame artifact", undefined, String(version)),
    project_id: DEMO_PROJECT_ID, actor_id: "frame-container", artifact_id: "frame-note", version,
    artifact_type_id: "example.note", schema_version: 1,
    producer: { plugin_id: "example.writer", plugin_version: "1.0.0", binding_signature: "fixture" },
    content: { kind: "inline", payload: { text: "Frame artifact" } }, metadata: {},
  });
  const before = boardSnapshot(store, DEMO_PROJECT_ID);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  // 07-S2: the project home is not a tab; the titlebar's strip is drawn once its ＋ is there.
  await waitFor("Boolean(document.querySelector('[data-titlebar-tabs] .tab-add-button'))");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.body.dataset.desktopSurface === 'goals' && !document.querySelector('.tab-item[data-tab-kind=mother]')");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && Boolean(document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]'))");
  assert.equal(await evaluate("document.querySelector('[data-directory-open=frame],[data-plugin-id=frame]')"), null);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-momentum]')?.textContent || ''"), /箭头从前置成果指向后续工作|单击看血缘/);
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-goal-canvas-shell]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-frame-surface]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]').hidden"), true);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-frame-surface]')?.textContent || ''"), /把会话、Feed|这些内容只为完成|从目录把会话/);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && !document.querySelector('[data-goal-canvas-shell]').hidden");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelectorAll('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').length"), 1);
  // RAC-2516/2517: a cold picker reads every authorized owner without mounting either opaque client.
  assert.equal(await evaluate("document.querySelector('iframe[data-plugin-frame=feed],iframe[data-plugin-frame=inbox]')"), null);
  await click('.frame-goal-actions [data-frame-add-content]');
  await waitFor("document.querySelector('[data-frame-picker]').open");
  for (const value of ['feed:' + archived.item_id, 'inbox:' + history.entry_id, 'inbox:' + decision.entry_id]) {
    assert.equal(await evaluate(`!!document.querySelector('[data-frame-picker-asset="${value}"]')`), true, value + " remains in the original picker range");
  }
  assert.equal(await evaluate("document.querySelector('iframe[data-plugin-frame=feed],iframe[data-plugin-frame=inbox]')"), null, "opening the picker does not start a factory");
  await evaluate("document.querySelector('[data-frame-picker-search]').value='核对 Frame';document.querySelector('[data-frame-picker-search]').dispatchEvent(new Event('input',{bubbles:true}))");
  await click(`[data-frame-picker-asset="feed:${feedItem.item.item_id}"]`);
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 1");
  assert.match(await evaluate<string>("[...document.querySelectorAll('[data-frame-block]')].map(block => block.textContent).join(' ')"), /核对 Frame 的 Feed 条目/);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=feed]').hidden"), true);
  await evaluate(`(() => {
    const canvas = document.querySelector("[data-frame-canvas]");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { getData: (type) => type === "application/x-molis-work-asset" ? JSON.stringify({ kind: "artifact", id: "frame-note#1", title: "Frame artifact" }) : "" },
    });
    canvas.dispatchEvent(event);
  })()`);
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 2");
  assert.match(await evaluate<string>("[...document.querySelectorAll('[data-frame-block]')].map(block => block.textContent).join(' ')"), /Frame artifact/);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=artifacts]').hidden"), true);
  await click('.frame-goal-actions [data-frame-add-content]');
  await waitFor("document.querySelector('[data-frame-picker]').open");
  assert.equal(await evaluate(`document.querySelector('[data-frame-picker-asset="feed:${feedItem.item.item_id}"]').disabled`), true, "already added references remain disabled");
  await evaluate("document.querySelector('[data-frame-picker-kind]').value='inbox';document.querySelector('[data-frame-picker-kind]').dispatchEvent(new Event('change',{bubbles:true}))");
  await click(`[data-frame-picker-asset="inbox:${inbox.entry.entry_id}"]`);
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 3");
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && !document.querySelector('[data-work-surface=feed]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-goal-frame-surface]').hidden"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('.tab-item[aria-current]')?.dataset.tabKind === 'plugin'");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]') && !document.querySelector('[data-goal-frame-surface]').hidden");
  assert.equal(await evaluate("document.querySelectorAll('[data-frame-block]').length"), 3);
  await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=feed] > p').click()");
  const feedPreview = await readPreview('.frame-reading .feed-rich-content', '.feed-detail-actions, [data-open-source-record], [data-feed-action]');
  assert.match(feedPreview.text, /只验证引用/);
  assert.equal(feedPreview.hasForbidden, false);
  assert.equal(feedPreview.surface, "goals");
  assert.equal(feedPreview.expanded, 1);
  await awaitFrameCursor(browser, owner);
  // FCS-02: observe real GETs and hold the actual first response; no body or loaded marker is supplied by the test.
  await evaluate(`(() => {
    window.t403Artifact={reads:[]};const fetch=window.fetch;
    window.fetch=(input,...args)=>{const url=String(input?.url||input);if(url.includes('/artifacts/frame-note/versions/'))t403Artifact.reads.push({url,method:args[0]?.method||input?.method||'GET'});return fetch.call(window,input,...args);};
  })()`);
  const firstArtifact = await sendBarrier(browser,[{urlPattern:"*/artifacts/frame-note/versions/1*",requestStage:"Response"}]);
  try {
    await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=artifact]').click()");
    const response = await firstArtifact.next();
    assert.equal(response.responseStatusCode,200,"the real owner produced the initial artifact response");
    assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]').textContent"),/正在打开/);
    assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]').dataset.loaded"),undefined);
    assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded .artifact-facts')"),null,"the first response must arrive before any artifact facts appear");
  } finally { await firstArtifact.close(); }
  const artifactPreview = await readPreview('.frame-reading .artifact-facts', '.artifact-actions, .artifact-raw');
  assert.match(artifactPreview.text, /example\.note/);
  assert.equal(artifactPreview.hasForbidden, false);
  await waitFor("document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]')?.dataset.loaded==='artifact:frame-note#1'");
  await evaluate("Object.assign(t403Artifact,{body:document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]'),facts:document.querySelector('[data-frame-block].is-expanded .artifact-facts'),id:document.querySelector('[data-frame-block].is-expanded').dataset.frameBlock})");
  const repeatedArtifact = await sendBarrier(browser,[{urlPattern:"*/artifacts/frame-note/versions/1*",requestStage:"Request"}]);
  try {
    for (const redundant of [false,true]) {
      const receipt = await syncFrameStorage(browser,redundant ? "" : "value.camera.x+=1","window",redundant);
      const previous = JSON.parse(receipt.oldValue),incoming = JSON.parse(receipt.newValue);
      assert.deepEqual(incoming.blocks,previous.blocks);
      assert.equal(incoming.expanded,previous.expanded);
      assert.equal(await evaluate("t403Artifact.body.isConnected&&t403Artifact.facts.isConnected&&document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]')===t403Artifact.body&&document.querySelector('[data-frame-block].is-expanded .artifact-facts')===t403Artifact.facts"),true,(redundant ? "redundant layout" : "camera-only storage")+" keeps the completed body and facts nodes");
      assert.equal(await evaluate("t403Artifact.body.dataset.loaded"),"artifact:frame-note#1");
      assert.deepEqual(await evaluate("t403Artifact.reads.map(read=>read.method)"),["GET"],"storage does not start a second artifact GET");
    }
  } finally { await repeatedArtifact.close(); }
  const nextArtifact = await sendBarrier(browser,[{urlPattern:"*/artifacts/frame-note/versions/2*",requestStage:"Response"}]);
  try {
    await syncFrameStorage(browser,"value.blocks.find(block=>block.kind==='artifact').itemId='frame-note#2'");
    assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded').dataset.frameBlock===t403Artifact.id"),true,"a genuine version change retains the block id and expanded selection");
    assert.equal(await evaluate("t403Artifact.body.isConnected||t403Artifact.facts.isConnected"),false,"a genuine version change discards the old completed body");
    assert.equal((await nextArtifact.next()).responseStatusCode,200);
    assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]').dataset.loaded"),undefined);
    assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]').textContent"),/正在打开/);
  } finally { await nextArtifact.close(); }
  await waitFor("document.querySelector('[data-frame-block].is-expanded [data-frame-reading=artifact]')?.dataset.artifactVersion==='2'&&document.querySelector('[data-frame-block].is-expanded [data-frame-block-body]')?.dataset.loaded==='artifact:frame-note#2'");
  assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded .artifact-facts').textContent"),/Schema 1/);
  assert.deepEqual(await evaluate("t403Artifact.reads.map(read=>({version:new URL(read.url,location.href).pathname.split('/').pop(),method:read.method}))"),[{version:"1",method:"GET"},{version:"2",method:"GET"}]);
  await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=inbox]').click()");
  const inboxPreview = await readPreview('[data-frame-reading=inbox]', '[data-frame-block-retry]');
  assert.match(inboxPreview.text, /你手工加入/);
  assert.match(inboxPreview.text, /查看原消息并处理/);
  await evaluate(`(() => {
    const canvas = document.querySelector("[data-frame-canvas]");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { getData: (type) => type === "application/x-molis-work-asset" ? JSON.stringify({ kind: "goal", id: "CORE", title: "CORE" }) : "" },
    });
    canvas.dispatchEvent(event);
  })()`);
  await waitFor("document.querySelector('[data-toast]').classList.contains('is-visible') && document.querySelector('[data-toast]').textContent.includes('Goal 留在主画布')");
  assert.equal(await evaluate("document.querySelectorAll('[data-frame-block]').length"), 3);
  await evaluate("document.querySelector('.tree-node[data-select-goal=CORE]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:1}));document.querySelector('.tree-node[data-select-goal=CORE]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:2}))");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && !document.querySelector('[data-goal-frame-surface]').hidden && document.querySelector('.tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]') != null"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE] [data-tab-close]').click()");
  await waitFor("!document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && !document.querySelector('[data-goal-canvas-shell]')?.hidden");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-frame-block]')");
  const otherId = await evaluate<string>(`(async()=>{const r=await fetch('/api/settings/projects',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({display_name:'Frame 隔离',user_confirmed:true})});if(!r.ok)throw new Error(await r.text());return (await r.json()).project.project_id;})()`);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + otherId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && !document.querySelector('.tab-item[data-tab-kind=mother]')");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')"), null);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-titlebar-tabs] .tab-item, [data-tab-workspace] .tab-item'))");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').click()");
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 3");
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).runs, before.runs);
});

// SYS-52: the Frame draws itself again whenever its stored state arrives from another window (the `storage` handler) or a block opens, closes
// or moves. A redraw with the same words must leave their Text alone, or a selection the person is making in the title or outcome collapses
// under them; words that did change still show.
test("SYS-52 a Goal Frame drawn again with the same words keeps the title and outcome Text and the person's selection; other words still show", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, store, projectId } = browser;
  const goals = boardSnapshot(store, DEMO_PROJECT_ID).goals;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.body.dataset.desktopSurface === 'goals'");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && Boolean(document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]'))");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && !document.querySelector('[data-goal-frame-surface]').hidden");
  const core = goals.find(goal => goal.goal_id === "CORE")!;
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-title]').textContent"), core.title);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-outcome]').textContent"), core.outcome);
  const key = "molis-work-frame-container:" + projectId + ":goal:CORE";
  // FCS-04: changing expanded still takes the redraw path even when the Goal words stay the same. The marker proves the draw ran;
  // the Text the person selected in is the one still in the page, and so is the selection.
  const redrawKeeps = async (field: "title" | "outcome") => {
    const kept = await evaluate<{ drawn: boolean; connected: boolean; same: boolean; anchored: boolean; selected: string; expected: string }>(`(() => {
      const line = document.querySelector('[data-frame-goal-${field}]'), text = line.firstChild;
      const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, Math.min(9, text.length));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const expected = selection.toString();
      const marker = document.createElement('i'); document.querySelector('[data-frame-world]').append(marker);
      const value = JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || JSON.stringify({ camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" }));
      value.expanded = 'sys52-${field}';
      window.dispatchEvent(new StorageEvent('storage', { key: ${JSON.stringify(key)}, newValue: JSON.stringify(value) }));
      return { drawn: !marker.isConnected, connected: text.isConnected, same: line.firstChild === text, anchored: getSelection().anchorNode === text,
        selected: getSelection().toString(), expected };
    })()`);
    assert.equal(kept.drawn, true, `the Frame drew itself again (${field})`);
    assert.ok(kept.expected.length > 0, `something of the ${field} was selected`);
    assert.equal(kept.connected && kept.same, true, `the ${field} keeps its Text when its words are the same`);
    assert.equal(kept.anchored, true, `the selection stays in the ${field}`);
    assert.equal(kept.selected, kept.expected, `the selected words of the ${field} stay selected`);
  };
  await redrawKeeps("title");
  await redrawKeeps("outcome");
  // Other words do show: the same Frame drawn for another Goal says that Goal's title and outcome.
  const otherId = await evaluate<string>("[...document.querySelectorAll('.tree-node[data-select-goal]')].map(node => node.dataset.selectGoal).find(id => id !== 'CORE')");
  const other = goals.find(goal => goal.goal_id === otherId)!;
  assert.ok(other && other.title !== core.title, "another Goal with other words");
  await evaluate("window.__sys52Title = document.querySelector('[data-frame-goal-title]').firstChild");
  await evaluate(`(() => { const node = document.querySelector('.tree-node[data-select-goal=${JSON.stringify(otherId)}]');
    node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:1}));
    node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:2})); })()`);
  await waitFor(`document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === ${JSON.stringify(otherId)} && !document.querySelector('[data-goal-frame-surface]').hidden`);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-title]').textContent"), other.title);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-outcome]').textContent"), other.outcome || "还没有写明预期结果，可在工作区补充。");
  assert.equal(await evaluate("window.__sys52Title.isConnected"), false, "changed words replace the Text");
});
