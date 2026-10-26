import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { checkAssistantStage } from "./fixtures/assistant-stage-checks.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const side = `document.querySelector('[data-side-body="plugin:pages/comments"] iframe')?.contentDocument`;

test("RAC-916-L1 RAC-916-L2 RAC-916-L3: oversized real Pages offers preserve comments and recover through the frame bridge into an Assistant step", { timeout: 120000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  // Observe the editor handle at the public factory, preserving its real mount, onChange, context and save callbacks.
  await pluginFrameInitScript(t, browser, `globalThis.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
    target[key]=host=>{if(key==='pages'&&!host.side){const editor=window.MolisWorkPagesEditor;
      window.MolisWorkPagesEditor={...editor,mount(...args){return window.racEditor=editor.mount(...args);}};}return factory(host);};return true;
  }});`);
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const comments = await pluginFrameBrowser(t, browser, "pages", '[data-side-body="plugin:pages/comments"] iframe');
  const store = openPagesStore(homeDirectory);
  const page = store.create({ project_id: projectId!, title: '完整消息"与草稿', body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "已保存正文" }] }] } });store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await pages.waitFor(`document.querySelector('[data-pages-title]')?.value === ${JSON.stringify(page.title)}`);
  await pages.click('[data-pages-comments-open]');
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === ${JSON.stringify(page.title)}`);
  // Keep the real editor dirty while the real comment HTTP routes remain live. Intercept only explicit Assistant start to avoid a model call.
  await evaluate(`(() => {
    const pagePath='/projects/${projectId}/api/plugins/io.molis.work.pages/pages/${page.id}',restores=[];
    window.racOffers=[];window.racSideOffers=[];window.racStarts=[];window.racCommentPosts=0;window.racHeldSaves=[];
    addEventListener('molis:assistant-message',event=>window.racOffers.push(event.detail));
    ${side}.defaultView.addEventListener('molis:assistant-message',event=>window.racSideOffers.push(event.detail));
    for(const view of [window,${side}.defaultView]){
      const original=view.fetch.bind(view);restores.push(()=>{view.fetch=original;});
      view.fetch=(input,init)=>{
        const path=new URL(input instanceof view.Request?input.url:String(input),location.href).pathname,method=init?.method||input.method||'GET';
        if(method==='POST'&&path===pagePath)return new Promise((resolve,reject)=>window.racHeldSaves.push(()=>original(input,init).then(resolve,reject)));
        if(method==='POST'&&path===pagePath+'/comments')window.racCommentPosts++;
        if(path.endsWith('/api/assistant/threads/start')){window.racStarts.push(JSON.parse(init.body));return Promise.resolve(new Response(JSON.stringify({error:'本次验证停在启动请求'}),{status:503,headers:{'content-type':'application/json'}}));}
        return original(input,init);
      };
    }
    window.racRestoreFetch=()=>{restores.forEach(restore=>restore());window.racHeldSaves.splice(0).forEach(release=>release());};
  })()`);
  await comments.evaluate(`(() => {
    window.racRaw=[];window.racSizes=[];addEventListener('molis:assistant-message',event=>window.racRaw.push(event.detail));
    const stringify=JSON.stringify.bind(JSON);JSON.stringify=(value,...rest)=>{const result=stringify(value,...rest);
      if(value?.purpose==='suggest'&&value.source?.surface==='pages'&&value.thread&&typeof result==='string')window.racSizes.push({message_id:value.message_id,size:result.length,draftLength:value.thread.draft?.text.length||0,commentLength:value.text.length,savedIdLength:value.thread.message_id.length});
      return result;};
  })()`);
  const body = (text: string) => comments.evaluate(`(() => {const input=document.querySelector('[data-comment-draft]');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const draft = async (text: string) => {
    await pages.click('[data-pages-editor] .ProseMirror');
    await pages.evaluate(`(() => {const view=window.racEditor.view;view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,view.state.schema.nodes.paragraph.create(null,view.state.schema.text(${JSON.stringify(text)}))));})()`);
    await comments.waitFor("!document.querySelector('[data-comment-unsaved]').hidden");
    await comments.evaluate("(() => {const check=document.querySelector('[data-comment-include-draft]');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await comments.waitFor("!document.querySelector('[data-comment-send]').disabled");
  };
  const pending = () => comments.evaluate<{ body: string; request_id: string; message_id?: string } | null>(`(() => {const saved=JSON.parse(localStorage.getItem('molis.pages.comments:${projectId}'));return saved['${page.id}:'+saved.__active['${page.id}']]||null;})()`);
  try {
    await body("普通评论仍只保存");await comments.click('[data-comment-send]');
    await comments.waitFor("document.querySelector('[data-comment-messages]').textContent.includes('普通评论仍只保存')");
    assert.deepEqual(await evaluate("[window.racCommentPosts,window.racOffers.length,window.racStarts.length]"), [1, 0, 0]);
    await comments.click('[data-comment-new]');await comments.click('[data-comment-ai]');
    await body("正常评论先显示助理下一步");await comments.click('[data-comment-send]');
    await waitFor("window.racSideOffers.length===1");
    await waitFor("window.racOffers.length===1", 3000);
    assert.equal(await evaluate("window.racOffers[0]?.message_id"), await comments.evaluate("window.racRaw[0].message_id"), "the same offer must cross the trusted side owner into the top Assistant");
    await waitFor("document.querySelectorAll('.mw-ix-step[data-step-offer]').length===1");
    assert.equal(await evaluate("window.racStarts.length"), 0);
    await comments.click('[data-comment-new]');await comments.click('[data-comment-ai]');
    // Keep the advertised 20k context excerpt within its separate 32k bridge cap; the full draft command still carries the escaped tail.
    const comment = "c".repeat(18996)+'"\n尾';await body(comment);await draft("p".repeat(20000)+'"'.repeat(31000));
    const request = (await pending())!.request_id;
    await comments.click('[data-comment-send]');
    await comments.waitFor("!document.querySelector('[data-comment-error]').hidden && document.querySelector('[data-comment-error]').textContent.includes('评论未发送')");
    assert.deepEqual(await evaluate("[window.racCommentPosts,window.racOffers.length,window.racStarts.length]"), [2, 1, 0]);
    assert.equal(await comments.evaluate("window.racSizes.at(-1).draftLength===51000 && window.racSizes.at(-1).size>100000 && window.racSizes.at(-1).savedIdLength===0"), true, "the real pre-save serialized detail includes the complete escaped draft and legal comment");
    assert.equal((await pending())!.request_id, request);assert.equal((await pending())!.body, comment);
    assert.equal(await comments.evaluate("document.querySelector('[data-comment-run]').textContent"), "");
    await draft('恢复后的"草稿');await comments.click('[data-comment-send]');
    await waitFor("window.racOffers.length===2 && document.querySelectorAll('.mw-ix-step[data-step-offer]').length===1");
    assert.equal(await evaluate("window.racStarts.length"), 0, "the actual Assistant next step waits for the person");
    assert.equal(await evaluate("window.racOffers[0].source.plugin_id"), "io.molis.work.pages");
    assert.equal(await evaluate("window.racOffers[1].text"), comment);
    assert.equal(await evaluate("window.racOffers[1].thread.draft.text"), '恢复后的"草稿');
    await comments.waitFor("document.querySelector('[data-comment-run]').textContent.includes('已交给助理')");
    await comments.click('[data-comment-new]');await comments.click('[data-comment-ai]');await body("边界后的重试评论");
    const overhead = await comments.evaluate<number>(`(() => {const sample=structuredClone(window.racRaw.at(-1));sample.text='边界后的重试评论';sample.thread.draft.text='';return JSON.stringify(sample).length;})()`);
    await draft("x".repeat(100001 - overhead));
    const before = (await pending())!;await comments.click('[data-comment-send]');
    await comments.waitFor("document.querySelector('[data-comment-error]').textContent.includes('评论已保存，尚未交给助理')");
    const saved = (await pending())!;
    assert.equal(await comments.evaluate("window.racSizes.at(-1).size"), 100001, "the actual final post-save detail is one character over the real bridge cap");
    assert.equal(saved.request_id, before.request_id);assert.ok(saved.message_id);assert.equal(saved.body, before.body);
    assert.equal(await comments.evaluate("document.querySelector('[data-comment-messages]').textContent.includes('边界后的重试评论')"), true);
    assert.equal(await comments.evaluate("document.querySelector('[data-comment-run]').textContent"), "");
    assert.deepEqual(await evaluate("[window.racCommentPosts,window.racOffers.length,window.racStarts.length]"), [4, 2, 0]);
    await comments.click('[data-comment-send]');
    await comments.waitFor("!document.querySelector('[data-comment-send]').disabled");
    assert.equal((await pending())!.message_id, saved.message_id);
    assert.equal(await evaluate("window.racCommentPosts"), 4);
    await draft('同一评论恢复的"完整草稿');await comments.click('[data-comment-send]');
    await waitFor("window.racOffers.length===3 && document.querySelectorAll('.mw-ix-step[data-step-offer]').length===1");
    assert.deepEqual(await evaluate("[window.racCommentPosts,window.racStarts.length]"), [4, 0]);
    assert.equal(await evaluate("window.racOffers[2].thread.message_id"), saved.message_id);
    assert.equal(await evaluate("window.racOffers[2].thread.draft.text"), '同一评论恢复的"完整草稿');
    await comments.waitFor("document.querySelector('[data-comment-draft]').value==='' && document.querySelector('[data-comment-run]').textContent.includes('已交给助理')");
    const checked = openPagesStore(homeDirectory);try { assert.equal(checked.comments.list(page.id, projectId!).flatMap(thread => thread.messages).length, 4); } finally { checked.close(); }
    await browser.click('.mw-ix-step[data-step-offer]:last-child');
    await waitFor("window.racStarts.length===1");
    assert.equal(await evaluate("window.racStarts[0].message_id"), saved.message_id);
    assert.equal(await evaluate("window.racStarts[0].target.provider_id"), "io.molis.work.pages");
    t.diagnostic(JSON.stringify(await comments.evaluate("({sizes:racSizes,childOffers:racRaw.map(detail=>detail.message_id)})")));
    t.diagnostic(JSON.stringify(await evaluate("({sideOffers:racSideOffers.map(detail=>({message_id:detail.message_id,source:detail.source})),topOffers:racOffers.map(detail=>detail.message_id),commentPosts:racCommentPosts,starts:racStarts.length})")));
    t.diagnostic("real Pages comment save → unchanged frame bridge → Assistant next step passed; explicit press reached start, intercepted before a model call");
  } catch (error) {
    t.diagnostic(JSON.stringify(await pages.evaluate("({editorTextLength:window.racEditor?.view.state.doc.textContent.length,unsaved:JSON.parse(document.querySelector('[data-assistant-context]')?.dataset.assistantContext||'{}').unsaved})")));
    t.diagnostic(JSON.stringify(await comments.evaluate("({childOffers:racRaw.map(detail=>({message_id:detail.message_id,size:JSON.stringify(detail).length})),ai:document.querySelector('[data-comment-ai]').getAttribute('aria-pressed'),unsavedHidden:document.querySelector('[data-comment-unsaved]').hidden,error:document.querySelector('[data-comment-error]').textContent,handed:document.querySelector('[data-comment-run]').textContent})")));
    t.diagnostic(JSON.stringify(await evaluate("({commentPosts:racCommentPosts,sideOffers:racSideOffers.map(detail=>({message_id:detail.message_id,source:detail.source})),topOffers:racOffers.map(detail=>detail.message_id),starts:racStarts.length,steps:document.querySelectorAll('.mw-ix-step[data-step-offer]').length})")));
    throw error;
  } finally { await evaluate("window.racRestoreFetch()"); }
});

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
