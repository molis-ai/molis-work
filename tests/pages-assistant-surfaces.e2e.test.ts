import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { checkAssistantStage } from "./fixtures/assistant-stage-checks.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const side = `document.querySelector('[data-side-body="plugin:pages/comments"] iframe')?.contentDocument`;

// PAS-14: the moved directory view still exposes failure, retries and recovers through the real Pages client.
async function checkListRecovery(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, pageId: string, pages: Awaited<ReturnType<typeof pluginFrameBrowser>>) {
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId } = browser;
  const { identifier } = await command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: `
    const originalPagesFetch = window.fetch.bind(window);
    window.pagesListFailure = '目录暂时离线';
    window.restorePagesFetch = () => { window.fetch = originalPagesFetch; };
    window.fetch = (...args) => new URL(String(args[0]), location.href).pathname.endsWith('/api/plugins/io.molis.work.pages/pages')
      ? Promise.resolve(new Response(JSON.stringify({error:window.pagesListFailure}),{status:503,headers:{'content-type':'application/json'}})) : originalPagesFetch(...args);
  ` }, sessionId);
  try {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
    await pages.waitFor("document.querySelector('[data-pages-rows] [role=alert] p')?.textContent === '目录暂时离线'");
    assert.equal(await pages.evaluate("document.querySelector('[data-pages-empty]').hidden"), true);
    await evaluate("window.pagesListFailure='重试仍离线'");
    assert.equal(await pages.evaluate(`(() => {const button=document.querySelector('[data-pages-rows] [role=alert] button');button.click();return button.disabled;})()`), true);
    await pages.waitFor("document.querySelector('[data-pages-rows] [role=alert] p')?.textContent === '重试仍离线' && document.querySelector('[data-pages-rows] [role=alert] button')?.disabled === false");
    await evaluate("window.restorePagesFetch()");
    await pages.evaluate("document.querySelector('[data-pages-rows] [role=alert] button').click()");
    await pages.waitFor(`document.querySelector('button[data-page-id="${pageId}"]')`);
    assert.equal(await pages.evaluate("document.querySelector('[data-pages-rows] [role=alert]') === null"), true);
  } finally {
    await command("Page.removeScriptToEvaluateOnNewDocument", { identifier }, sessionId);
  }
}

// PAS-01 / VUX-35: opening a saved block discussion waits for the frame-batched context read.
async function checkDiscussionOpening(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, comments: Awaited<ReturnType<typeof pluginFrameBrowser>>) {
  const { evaluate, waitFor } = browser;
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await evaluate(`(() => {
    window.holdContextFrames=true;
    const doc=${side},script=doc.createElement('script');
    script.textContent="window.openingMessages=[];addEventListener('message',event=>{if(event.source!==parent)return;if(['molis:side-context','molis:side-shown'].includes(event.data?.type))window.openingMessages.push(event.data);if(event.data?.type==='opening-barrier')window.openingBarrier=true;});";
    doc.body.append(script);
    document.addEventListener('molis:side-shown',()=>doc.defaultView.postMessage({type:'opening-barrier'},location.origin),{once:true});
  })()`);
  try {
    await comments.evaluate(`[...document.querySelectorAll('[data-comment-notes] button')].find(button=>button.textContent==='讨论这段').click()`);
    await waitFor(`${side}.defaultView.openingBarrier`);
    assert.deepEqual(await evaluate(`${side}.defaultView.openingMessages.filter(message=>message.type==='molis:side-shown')`), [], 'PAS-01: do not publish an opening under the previous document context while its fresh read is queued');
  } finally { await evaluate("window.releaseContextFrames()"); }
  await comments.waitFor(`document.querySelector('[data-comment-quote]')?.textContent === '先完成核心体验，再安排发布。'`);
  assert.equal(await evaluate(`(() => {
    const messages=${side}.defaultView.openingMessages,shown=messages.findIndex(message=>message.type==='molis:side-shown');
    const context=messages.slice(0,shown).findLast(message=>message.type==='molis:side-context')?.context;
    const current=JSON.parse(document.querySelector('[data-work-surface="pages"][data-assistant-context], [data-work-surface="pages"] [data-assistant-context]').dataset.assistantContext);
    return context?.unsaved===false&&context.object_ref.version===current.object.version&&shown>0;
  })()`), true, 'PAS-01: the quoted discussion arrives after the saved version and can be sent immediately');
}

test("PAS-01 PAS-02 PAS-06 PAS-07: real Pages sidebar follows the active document, preserves drafts and notes; one Assistant composer moves to a main tab and back", { timeout: 120000 }, async t => {
  const browser = await openGoalBrowser(t, true);if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const comments = await pluginFrameBrowser(t, browser, "pages", '[data-side-body="plugin:pages/comments"] iframe');
  const pane = await pluginFrameBrowser(t, browser, "pages", "iframe.tab-content-frame");
  // Install before navigation so holding a frame also holds callbacks already queued by the host.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    if(window===top){
      const request=window.requestAnimationFrame.bind(window),held=[];
      window.requestAnimationFrame=callback=>request(time=>{if(window.holdContextFrames)held.push(callback);else callback(time);});
      window.releaseContextFrames=()=>{window.holdContextFrames=false;held.splice(0).forEach(callback=>request(callback));};
    }
  ` }, sessionId);
  const store = openPagesStore(homeDirectory);
  const a = store.create({ project_id: projectId!, title: "讨论中的发布计划", body: { type: "doc", content: [{ type: "paragraph", attrs: { note: "需要保留的块备注" }, content: [{ type: "text", text: "先完成核心体验，再安排发布。" }] }] } });
  const b = store.create({ project_id: projectId!, title: "另一个文档", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "此处不应出现前一篇的评论。" }] }] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // PAS-14: the side document loads declared dependencies even when no editor has been opened.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/side/pages/comments` }, sessionId));
  await pages.waitFor("typeof window.MolisWorkPagesEditor?.mountComments === 'function'");
  assert.equal(await pages.evaluate("document.querySelector('[data-comment-title]')?.textContent"), "选择一篇文档");
  assert.equal(await pages.evaluate("document.querySelectorAll('script[src$=\"/assets/molis-work-pages-editor.js\"]').length"), 1);
  await checkListRecovery(browser, a.id, pages);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${a.id}` }, sessionId));
  await pages.waitFor("document.querySelector('[data-pages-title]')?.value === '讨论中的发布计划'");
  await pages.click('[data-pages-comments-open]');
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '讨论中的发布计划'`);
  // PAS-08: actual frame messages must come from the mounted side view and its current epoch.
  await evaluate(`(() => {
    window.sideForwarded=[];
    document.addEventListener('molis:side-context-command',event=>window.sideForwarded.push(event.detail.command.request_id));
    const child=${side}.defaultView;
    const script=child.document.createElement('script');script.textContent="addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='molis:side-context')window.boundEpoch=event.data.context_epoch;if(event.source===parent&&event.data?.type==='molis:side-context-result'&&event.data.stale)(window.staleAnswers||=[]).push(event.data.request_id);});parent.postMessage({type:'molis:side-ready'},location.origin)";child.document.body.append(script);
  })()`);
  await waitFor(`${side}.defaultView.boundEpoch > 0`);
  await evaluate(`(() => {
    const child=${side}.defaultView,epoch=child.boundEpoch;
    window.postMessage({type:'molis:side-context-command',context_epoch:epoch,command:{kind:'notes',request_id:'forged-source'}},location.origin);
    const script=child.document.createElement('script');script.textContent="parent.postMessage({type:'molis:side-context-command',context_epoch:"+(epoch-1)+",command:{kind:'notes',request_id:'stale-epoch'}},location.origin);parent.postMessage({type:'molis:side-context-command',context_epoch:"+epoch+",command:{kind:'notes',request_id:'current-frame'}},location.origin)";child.document.body.append(script);
  })()`);
  await waitFor("window.sideForwarded.includes('current-frame')");
  assert.deepEqual(await evaluate("window.sideForwarded"), ['current-frame']);
  // A command asked under an older epoch runs nothing, and its own view hears so (to ask again under the context it is about
  // to receive) instead of waiting out its timeout; the forged one hears nothing.
  await waitFor(`${side}.defaultView.staleAnswers?.length > 0`);
  assert.deepEqual(await evaluate(`${side}.defaultView.staleAnswers`), ['stale-epoch']);
  const edit = (text: string) => comments.evaluate(`(() => { const doc=document,field=doc.querySelector('[data-comment-draft]');field.value=${JSON.stringify(text)};field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await edit("这条普通评论不会启动助理。");
  // PAS-05: composition Enter must neither prevent default nor submit the comment.
  assert.equal(await comments.evaluate(`document.querySelector('[data-comment-draft]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,isComposing:true,bubbles:true,cancelable:true}))`), true);
  await comments.evaluate(`document.querySelector('[data-comment-send]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-messages]')?.textContent.includes('这条普通评论不会启动助理。')`);
  assert.equal(await evaluate(`fetch('/projects/${projectId}/api/assistant/works').then(r=>r.json()).then(b=>b.works.length)`), 0);
  assert.equal(await comments.evaluate(`document.querySelector('[data-comment-run]').textContent`), "");
  await edit("属于第一篇的草稿");
  await pages.evaluate(`document.querySelector('button[data-page-id="${b.id}"]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '另一个文档'`);
  assert.equal(await comments.evaluate(`document.querySelector('[data-comment-draft]').value`), "");
  await edit("属于第二篇的草稿");
  await pages.evaluate(`document.querySelector('button[data-page-id="${a.id}"]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '讨论中的发布计划'`);
  assert.equal(await comments.evaluate(`document.querySelector('[data-comment-draft]').value`), "属于第一篇的草稿");
  // PAS-01: hold an old A response across A→B→A; replay it after saving the current A note.
  await evaluate(`(() => {const doc=${side},script=doc.createElement('script');script.textContent="addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='molis:side-context-result'&&Array.isArray(event.data.notes)&&!window.heldNotes){window.heldNotes=event.data;event.stopImmediatePropagation();}if(event.data?.type==='notes-replay-barrier')window.notesReplayDone=true;},true)";doc.body.append(script);})()`);
  await comments.evaluate(`document.querySelector('[data-comment-mode="notes"]').click()`);
  await waitFor(`${side}.defaultView.heldNotes`);
  await pages.evaluate(`document.querySelector('button[data-page-id="${b.id}"]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '另一个文档'`);
  await pages.evaluate(`document.querySelector('button[data-page-id="${a.id}"]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '讨论中的发布计划'`);
  await comments.waitFor(`document.querySelector('[data-comment-notes] textarea')?.value === '需要保留的块备注'`);
  await comments.evaluate(`(() => { const doc=document,field=doc.querySelector('[data-comment-notes] textarea');window.noteBeforeSave=field;field.value='在侧栏保存的备注';field.dispatchEvent(new Event('input',{bubbles:true}));doc.querySelector('[data-comment-notes] button').click(); })()`);
  await pages.waitFor("document.querySelector('[data-pages-editor-status]')?.textContent === '已保存'");
  await comments.waitFor(`document.querySelector('[data-comment-notes] textarea') !== window.noteBeforeSave && document.querySelector('[data-comment-notes] textarea')?.value === '在侧栏保存的备注'`);
  await evaluate(`(() => {const child=${side}.defaultView;child.postMessage(child.heldNotes,location.origin);child.postMessage({type:'notes-replay-barrier'},location.origin);})()`);
  await waitFor(`${side}.defaultView.notesReplayDone`);
  assert.equal(await comments.evaluate(`document.querySelector('[data-comment-notes] textarea').value`), '在侧栏保存的备注');
  await checkDiscussionOpening(browser, comments);
  await edit("从块备注明确发起的新讨论");
  // Starting the discussion anchors it in the body; until that is saved the button says 等待正文保存 and is disabled, as a person sees it.
  await comments.waitFor(`document.querySelector('[data-comment-send]')?.disabled === false`);
  await comments.evaluate(`document.querySelector('[data-comment-send]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-messages]')?.textContent.includes('从块备注明确发起的新讨论')`);
  // PAS-01: a second real work pane owns B; changing focused panes changes the bound sidebar.
  await evaluate("window.firstPane=document.querySelector('[data-tab-pane]').dataset.tabPane;document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  await pane.waitFor(`document.querySelector('button[data-page-id="${b.id}"]')`);
  await pane.evaluate(`document.querySelector('button[data-page-id="${b.id}"]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '另一个文档'`);
  await evaluate("window.secondPane=document.querySelector('[data-tab-pane].is-focused').dataset.tabPane;document.querySelector('[data-tab-pane=\"'+window.firstPane+'\"]').click()");
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '讨论中的发布计划'`);
  await evaluate("document.querySelector('[data-tab-pane=\"'+window.secondPane+'\"]').click()");
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '另一个文档'`);
  await evaluate("document.querySelector('[data-tab-pane=\"'+window.secondPane+'\"] [data-tab-pane-close]').click()");
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === '讨论中的发布计划'`);
  // A newly empty split pane has no Pages context, so the host can return to its general tool tab.
  // Reopen the actual comment view before measuring it; a hidden iframe is not visual evidence.
  await click('[data-side-tab="plugin:pages/comments"]');
  await waitFor("document.querySelector('[data-side-body=\"plugin:pages/comments\"]')?.checkVisibility()");
  await edit("这是一条足够长的讨论，用于确认阅读历史时仍能继续回复。\n".repeat(32));
  await comments.evaluate(`document.querySelector('[data-comment-send]').click()`);
  await comments.waitFor(`document.querySelector('[data-comment-messages]')?.textContent.includes('这是一条足够长的讨论')`);
  await edit("继续回复的草稿");
  for (const width of [1440, 1024, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", { enabled: width === 390, maxTouchPoints: 5 }, sessionId);
    await waitFor("document.documentElement.scrollWidth <= innerWidth");
    if (width === 390) {
      assert.deepEqual(await comments.evaluate(`[...document.querySelectorAll('button')].filter(node=>node.checkVisibility()).filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44;}).map(node=>node.textContent)`), [], 'PAS-06: comment actions keep 44px touch targets');
      assert.equal(await comments.evaluate(`parseFloat(getComputedStyle(document.querySelector('[data-comment-draft]')).fontSize)>=16`), true);
    }
    assert.equal(await comments.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
    assert.equal(await comments.evaluate(`(() => {const button=document.querySelector('[data-comment-send]'),box=button.getBoundingClientRect();return box.width>0&&box.height>0&&box.top>=0&&box.bottom<=innerHeight+1;})()`), true, 'PAS-06: the visible long thread keeps Send inside its viewport');
    await comments.point("[data-comment-send]"); // PAS-06: real hit test through both iframe owners.
    assert.equal(await comments.evaluate(`(() => {const doc=document,pane=doc.querySelector('[data-comment-discussion]');pane.scrollTop=pane.scrollHeight;const bounds=pane.getBoundingClientRect(),last=doc.querySelector('[data-comment-messages] article:last-child'),box=last.getBoundingClientRect();return bounds.height>0&&box.bottom>bounds.top&&box.bottom<=bounds.bottom+1&&last.contains(doc.elementFromPoint(box.x+box.width/2,box.bottom-4));})()`), true, 'PAS-06: the latest long comment is reachable by scrolling the reading area');
    const output = reviewEvidenceUrl("pages-assistant-surfaces/");await mkdir(output, { recursive: true });
    await writeFile(new URL(`real-comments-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
  await click('[data-side-toggle]');
  await issueModel(t, homeDirectory, { replyText: '这是输入与展示回归的固定回答。' });
  await click('[data-assistant-input]');
  await command("Input.insertText", { text: "新工作：保留这份助理草稿" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('[data-assistant-expand]')?.disabled === false");
  await waitFor("document.querySelector('.assistant-msg--assistant')?.textContent.includes('这是输入与展示回归的固定回答。')", 15000);
  const draft = await evaluate("document.querySelector('[data-assistant-input]').value");
  await evaluate("window.originalComposer=document.querySelector('[data-assistant-input]')");
  await click('[data-assistant-expand]');
  await waitFor("document.querySelector('[data-system-tab] [data-assistant-input]')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]') === window.originalComposer"), true);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), draft);
  assert.equal(await evaluate("document.querySelectorAll('[data-assistant-input]').length"), 1);
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("document.querySelector('[data-assistant-panel]').dataset.layout === (innerWidth >= 1240 ? 'split' : 'drawer')");
    assert.equal(await evaluate("(() => {const surface=document.querySelector('[data-system-tab]').getBoundingClientRect(),panel=document.querySelector('[data-assistant-panel]').getBoundingClientRect();return panel.left>=surface.left-1&&panel.right<=surface.right+1;})()"), true, 'PAS-03 PAS-06: main Assistant panel does not inherit dock offsets or clip its content');
  }
  await checkAssistantStage(browser);
  await click('[data-assistant-retract]');
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]') && !document.querySelector('.tab-item[data-tab-kind=system]')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]') === window.originalComposer"), true);
  const saved = openPagesStore(homeDirectory);
  try { assert.match(JSON.stringify(saved.get(a.id, projectId!).body), /在侧栏保存的备注/);assert.equal(saved.comments.list(a.id, projectId!).length, 2);assert.equal(saved.comments.list(b.id, projectId!).length, 0); }
  finally { saved.close(); }
});
