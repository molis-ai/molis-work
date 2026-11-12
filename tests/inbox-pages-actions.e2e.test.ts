import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";


import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

test("RAC-2518 RAC-2519 a held Inbox compose response survives hide and same-mount reopen with its request and editable draft",{timeout:90000},async t=>{
  let calls=0;
  const b=await openGoalBrowser(t,true,undefined,async prompt=>{calls++;assert.match(prompt,/保留原材料边界/);return "这份文稿只来自当前材料。[材料 1]";});if(!b)return;
  const {projectId,origin,command,sessionId}=b;
  const feed=createLocalFeedApplication(b.store.db),source=createLocalFeedSourceService(b.store.db,projectId!).register({kind:"web_query",query:"same-mount-compose",name:"Compose lifecycle source"}).source;
  const item=feed.ingestItem({source,externalId:"same-mount-compose",title:"保留原材料边界",summary:"保留原材料边界",occurredAt:new Date().toISOString(),attention:false}).item;
  const entry=feed.ensureInboxEntryForFeedItem(projectId!,item.item_id,"manual").entry;
  await pluginFrameInitScript(t,b,`window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='inbox'?host=>{window.t403InboxHost=host;window.t403InboxMounts=(window.t403InboxMounts||0)+1;window.t403InboxReads={total:0,pending:0};const read=host.view.readDocument;host.view.readDocument=async(...args)=>{t403InboxReads.total++;t403InboxReads.pending++;try{return await read(...args)}finally{t403InboxReads.pending--}};window.t403InboxInputs=[];const ids=new WeakMap;let next=0;for(const type of ['pointerdown','pointerup'])document.addEventListener(type,event=>{const target=event.target;if(target&&!ids.has(target))ids.set(target,++next);t403InboxInputs.push({type,id:target&&ids.get(target),html:target?.outerHTML?.slice(0,300),x:event.clientX,y:event.clientY,at:performance.now(),pending:t403InboxReads.pending});t403InboxInputs.splice(0,Math.max(0,t403InboxInputs.length-20))},{capture:true,passive:true});return value(host)}:value;return true}});`);
  const inbox=await pluginFrameBrowser(t,b,"inbox"),pagesClient=await pluginFrameBrowser(t,b,"pages");
  await b.setViewport(390,844);
  await b.navigate(()=>command("Page.navigate",{url:`${origin}/projects/${projectId}/?openPlugin=inbox`},sessionId));
  const openComposer=async()=>{try{await inbox.click('[data-inbox-compose-open=""]');}catch(failure){t.diagnostic(JSON.stringify(await inbox.evaluate("({reads:t403InboxReads,inputs:t403InboxInputs,visible:t403InboxHost.scope.visible,open:document.querySelector('[data-inbox-compose]')?.open})")));throw failure;}};
  await inbox.waitFor("window.t403InboxHost && t403InboxHost.scope.visible && t403InboxReads.total>0 && t403InboxReads.pending===0");
  await openComposer();
  await inbox.click(`[data-inbox-compose] input[name=entry_id][value="${entry.entry_id}"]`);
  await inbox.evaluate("(()=>{const form=document.querySelector('[data-inbox-compose-form]');form.elements.title.value='同一份可继续编辑的草稿';form.elements.instructions.value='保留原材料边界';form.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const barrier=await sendBarrier(b,[{urlPattern:"*/api/plugins/io.molis.work.inbox/pages",requestStage:"Response"}]);
  const pages=openPagesStore(b.homeDirectory);
  try{
    await inbox.click('[data-inbox-compose-submit]');
    const held=await barrier.next(),request=JSON.parse(held.request.postData!);
    assert.equal(held.responseStatusCode,200);assert.ok(request.request_id);
    assert.equal(pages.list(projectId!).length,1,"the real server committed before its response was withheld");
    const originalDocument=pages.generation(projectId!,request.request_id)!.document_id!;
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-form]').elements.title.disabled"),true);
    await inbox.click('[data-inbox-compose-close]');
    await b.click('[data-plugin-strip] [data-plugin-id=home]');
    await inbox.waitFor("!t403InboxHost.scope.visible");
    const readsWhenHidden=await inbox.evaluate<number>("t403InboxReads.total");
    await b.click('[data-plugin-strip] [data-plugin-id=inbox]');
    await inbox.waitFor(`t403InboxHost.scope.visible && t403InboxReads.total>${readsWhenHidden} && t403InboxReads.pending===0`);
    await openComposer();
    await inbox.waitFor("document.querySelector('[data-inbox-compose]').open && !document.querySelector('[data-inbox-compose-form]').elements.title.disabled && !document.querySelector('[data-inbox-compose-submit]').disabled");
    assert.equal(await inbox.evaluate("t403InboxMounts"),1,"hide/reopen retains the same client rather than masking busy with a remount");
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-form]').elements.title.value"),"同一份可继续编辑的草稿");
    assert.doesNotMatch(await inbox.evaluate<string>("document.querySelector('[data-inbox-compose-status]').textContent"),/正在整理材料/,"a reopened editable draft does not retain the old busy message");
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-status]').textContent"),"草稿已保留，可继续编辑或重试。");
    assert.equal(await inbox.evaluate("JSON.parse(sessionStorage.getItem('molis-inbox-compose:'+t403InboxHost.route('/'))).request_id"),request.request_id);
    await inbox.click('[data-inbox-compose-form] input[name=title]');
    await barrier.close();
    await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await b.evaluate("document.body.dataset.desktopSurface"),"inbox","the old response cannot navigate the reopened composer to Pages");
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose]').open"),true);
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-form]').elements.title.value"),"同一份可继续编辑的草稿");
    await inbox.waitFor("document.querySelector('[data-inbox-compose-results] .inbox-compose-result')");
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-status]').textContent"),"草稿已保留，可继续编辑或重试。","the old response cannot overwrite the restored draft status");
    const output=reviewEvidenceUrl("t403-native/");await mkdir(output,{recursive:true});
    await writeFile(new URL("inbox-narrow-390.png",output),Buffer.from((await command<{data:string}>("Page.captureScreenshot",{format:"png"},sessionId)).data,"base64"));
    await inbox.click('[data-inbox-compose-submit]');
    await pagesClient.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('这份文稿只来自当前材料')");
    assert.equal(calls,1,"explicit retry reuses the already committed request without another generation");
    assert.equal(pages.list(projectId!).length,1);assert.equal(pages.generations(projectId!).length,1);
    assert.equal(pages.generation(projectId!,request.request_id)!.document_id,originalDocument);
    assert.equal(feed.getInboxEntry(projectId!,entry.entry_id).status,"open");
  }finally{await barrier.close();pages.close();}
});

for (const width of [1440, 390]) {
  test(`BHI-03 BHI-04 Inbox ${width}px: recover generation and open the persisted Pages result from history`, { timeout: 90_000 }, async t => {
    let calls = 0;
    const browser = await openGoalBrowser(t, "seeded", undefined, async prompt => {
      calls++; assert.match(prompt, /仅阅读研究摘要，尚未核对全文/);
      if (calls === 1) throw new Error("测试模型暂时不可用，材料已保留");
      return "本次观察来自研究摘要，全文仍待核对。[材料 1]";
    });
    if (!browser) return;
    const child=await pluginFrameBrowser(t,browser,"pages");
    const inbox=await pluginFrameBrowser(t,browser,"inbox");
    const { store, command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, homeDirectory } = browser;
    const projectId = browser.projectId!;
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, projectId).register({ kind: "research_library", repository: "fixture/observations", research_source: "summary" }).source;
    const item = feed.ingestItem({ source, externalId: "pages-ui-material", title: "产品研究摘要", summary: "仅阅读研究摘要，尚未核对全文", occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual").entry;
    const inboxRow = `[data-inbox-row][data-inbox-entry-id="${entry.entry_id}"]`;
    const composeTrigger = '[data-inbox-compose-open=""]';
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const showInbox = async () => {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=inbox` }, sessionId));
      await waitFor("document.querySelector('[data-plugin-id=inbox]')");
      if (await evaluate("document.body.dataset.desktopSurface") !== "inbox") {
        await click('[data-plugin-strip] [data-plugin-id=inbox]');
      }
      await waitFor("document.body.dataset.desktopSurface === 'inbox'");
    };
    const openInbox = async () => {
      await showInbox();
      await inbox.click(composeTrigger);
      await inbox.waitFor("document.querySelector('[data-inbox-compose]').open");
    };
    await openInbox();
    await inbox.click(`[data-inbox-compose] input[name=entry_id][value="${entry.entry_id}"]`);
    await inbox.evaluate(`(() => { const form = document.querySelector('[data-inbox-compose-form]'); form.elements.title.value = '研究观察草稿'; form.elements.instructions.value = '区分摘要观察和未核验信息，保留材料边界'; form.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await inbox.click('[data-inbox-compose-submit]');
    // W5-01-SHM-01: Pages asks the model through the Runtime, which shows its public failure and keeps the injected provider message private.
    await inbox.waitFor("document.querySelector('[data-inbox-compose-status]').textContent.includes('模型请求失败，请重试')");
    assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-status]').textContent.includes('测试模型暂时不可用')"), false);
    const pages = openPagesStore(homeDirectory);
    try {
      const failed = pages.generations(projectId!)[0]!;
      assert.equal(failed.status, "failed"); assert.equal(failed.error, "模型请求失败，请重试"); assert.equal(failed.inputs[0]!.item_id, item.item_id); assert.equal(pages.list(projectId!).length, 0);
      await reloadPage();
      await openInbox();
      await inbox.waitFor("document.querySelector('[data-inbox-compose-results]').textContent.includes('恢复处理')");
      await inbox.click('[data-inbox-compose-results] .inbox-compose-result button');
      assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-compose-form]').elements.title.value"), "研究观察草稿");
      await inbox.click('[data-inbox-compose-submit]');
      await child.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('全文仍待核对')", 12_000);
      assert.equal(calls, 2);
      const record = pages.generation(projectId!, failed.request_id)!;
      assert.equal(record.status, "completed"); assert.equal(pages.list(projectId!).length, 1);
      assert.equal(feed.getInboxEntry(projectId, entry.entry_id).status, "open");
      await child.evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '人工补充后的研究草稿'; title.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
      await child.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
      assert.equal(pages.get(record.document_id!, projectId!).title, "人工补充后的研究草稿");
      assert.match(JSON.stringify(pages.get(record.document_id!, projectId!).body), new RegExp(`/projects/${projectId}/`));
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      await showInbox();
      await inbox.click(inboxRow);
      await inbox.click("[data-inbox-detail]:not([hidden]) [data-inbox-action=done]");
      await inbox.waitFor(`document.querySelector('[data-inbox-stage-group=history] ${inboxRow}')`);
      assert.equal(feed.getInboxEntry(projectId, entry.entry_id).status, "done");
      assert.equal(await inbox.evaluate("document.querySelector('[data-inbox-stage-group=active] [data-inbox-row]')"), null);
      const historySummary = "[data-inbox-stage-group=history] summary";
      await inbox.click(historySummary);
      assert.ok(await inbox.evaluate(`(() => {
        const history = document.querySelector(${JSON.stringify(historySummary)}).parentElement;
        const trigger = document.querySelector(${JSON.stringify(composeTrigger)});
        const group = history.getBoundingClientRect(), button = trigger.getBoundingClientRect();
        return !history.open && history.nextElementSibling === trigger && button.left === group.left && button.width < group.width;
      })()`), "the compact trigger remains reachable beside collapsed history");
      await inbox.click(composeTrigger);
      await inbox.click(`[data-inbox-compose-results] [data-inbox-compose-request="${failed.request_id}"] button`);
      await waitFor("document.body.dataset.desktopSurface === 'pages'");
      await child.waitFor("document.querySelector('[data-pages-title]')?.value === '人工补充后的研究草稿'");
      assert.equal(calls, 2, "opening a document from history makes no generation");
      const output = reviewEvidenceUrl("action-service/"); await mkdir(output, { recursive: true });
      await writeFile(new URL(`inbox-pages-actions-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
    } finally { pages.close(); }
  });
}
