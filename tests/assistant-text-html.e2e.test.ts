import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";

test("PAS-15: Host text streams, keeps reading state, copies exact code, opens named objects and submits real review decisions", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const pages = openPagesStore(homeDirectory);
  const page = pages.create({ project_id: projectId!, title: "代码验证文档", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "打开的是实际文档。" }] }] } });
  pages.close();
  // VUX-33: an indented first line and a blank last line are part of the code, shown and copied as written.
  const code = "  // 首行缩进\n" + Array.from({ length: 19 }, (_, index) => `const value${index} = "<safe>&";`).join("\n") + "\n";
  const model = await assistantTextModel(t, homeDirectory, `「${page.title}」\n\n<img src=x onerror="window.injected=1"> [不能执行](javascript:alert)\n\n\`\`\`ts\n${code}\n\`\`\``);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '代码验证文档'");
  await click("[data-assistant-input]");
  // The work is linked under the document because the hand-over brings it (viewing a page no longer adds it, context-program
  // §21.5), so the hand-over names the document by its own kind.
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-message', {detail:{message_id:'text-projection-delegate',purpose:'delegate',source:{surface:'pages',title:'文档'},object:{kind:'pages_document',id:${JSON.stringify(page.id)},title:${JSON.stringify(page.title)},version:1},text:'整理这份文档',materials:[]}}))`);
  await waitFor("document.querySelector('.assistant-rich strong')?.textContent === '第一段'", 30_000);
  await evaluate("window.firstBubble=document.querySelector('.assistant-msg--assistant')");
  model.finish();
  await waitFor("document.querySelector('.assistant-code-copy') && document.querySelector('.assistant-inline-object')", 30_000);
  assert.equal(await evaluate("window.firstBubble === document.querySelector('.assistant-msg--assistant')"), true, "the streaming bubble stays the same node");
  assert.equal(await evaluate("Boolean(window.injected) || !!document.querySelector('.assistant-rich img, .assistant-rich a[href^=javascript]')"), false);
  assert.equal(await evaluate("document.querySelector('.assistant-code pre code').textContent"), code);
  assert.equal(await evaluate("document.querySelector('.assistant-code').dataset.lines"), String(code.split("\n").length), "the blank last line is counted");
  await evaluate("document.querySelector('.assistant-code-more').click()");
  assert.equal(await evaluate("document.querySelector('.assistant-code').hasAttribute('data-folded')"), false);
  assert.equal(await evaluate(`(() => { const pre = document.querySelector('.assistant-code pre'), style = getComputedStyle(pre), line = parseFloat(getComputedStyle(pre.querySelector('code')).lineHeight);
    return Math.round((pre.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / line); })()`), code.split("\n").length, "every line, the blank last one included, takes its own line");
  // Read the real Clipboard API after a real click, without replacing the production clipboard handler.
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  // Copy takes the code as written, not what the page drew: a decoration added to the coloured lines is not copied.
  await evaluate("document.querySelector('.assistant-code pre code').prepend(Object.assign(document.createElement('span'), { textContent: '12 ' }))");
  await evaluate("document.querySelector('.assistant-code-copy').scrollIntoView({block:'center'})");
  await click(".assistant-code-copy");
  await waitFor("document.querySelector('.assistant-code-copy').dataset.copy === 'done'");
  assert.equal(await evaluate("navigator.clipboard.readText()"), code);
  const api = `/projects/${projectId}/api/assistant`;
  await waitFor(`fetch(${JSON.stringify(api + '/works')}).then(r=>r.json()).then(b=>b.works[0]?.state==='completed')`);
  await evaluate(`(() => { window.codeFigure=document.querySelector('.assistant-code');window.refreshed=false;const original=window.fetch;
    window.fetch=async(url,init)=>{const response=await original(url,init);if(new URL(String(url),location.href).pathname.startsWith(${JSON.stringify(api + '/works/')})){await response.clone().text();requestAnimationFrame(()=>{window.refreshed=true;});}return response;};window.restoreTextFetch=()=>{window.fetch=original;};window.dispatchEvent(new Event('focus')); })()`);
  await waitFor("window.refreshed");
  assert.equal(await evaluate("window.codeFigure === document.querySelector('.assistant-code') && !window.codeFigure.hasAttribute('data-folded')"), true, "an observed repeat response preserves the open code block");
  await evaluate("window.restoreTextFetch()");
  await evaluate("window.openedObject=null;document.addEventListener('molis:side-open',event=>{window.openedObject=event.detail.target;event.preventDefault();},{once:true});document.querySelector('.assistant-inline-object').click()");
  assert.deepEqual(await evaluate("window.openedObject.open"), { surface: "pages", id: page.id });
  // The same text is projected on reload; bindings are restored once, so folding works in both directions.
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('.assistant-code-more')");
  await evaluate("document.querySelector('.assistant-code-more').click();document.querySelector('.assistant-code-more').click()");
  assert.equal(await evaluate("document.querySelector('.assistant-code').hasAttribute('data-folded')"), true);

  // Arrival has no object-opening port: the same work remains readable as the original quoted words.
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.querySelector('.assistant-rich')?.textContent.includes('代码验证文档')");
  assert.equal(await evaluate("document.querySelector('.assistant-rich .assistant-inline-object') === null"), true);
  assert.match(await evaluate<string>("document.querySelector('.assistant-rich').textContent"), /「代码验证文档」/);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('.assistant-code-more')");
  await click("[data-assistant-input]");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden");

  for (const decision of ["reject", "approve"]) {
    model.review(`投影测试-${decision}`);
    await click("[data-assistant-new]");
    await click("[data-assistant-input]");
    await command("Input.insertText", { text: `添加待办：投影测试-${decision}` }, sessionId);
    await click("[data-assistant-send]");
    await waitFor("document.querySelector('[data-review] [data-assistant-decision]')", 30_000);
    assert.match(await evaluate<string>("document.querySelector('[data-review]').textContent"), new RegExp(`投影测试-${decision}`));
    if (decision === "reject") {
      // Hold only this review request: failure restores the same card's decisions and exposes the original diagnostic.
      await evaluate(`(() => { const original=window.fetch;window.restoreReviewFetch=()=>{window.fetch=original};window.fetch=(url,init)=>String(url).includes('/reviews/') ? new Promise((resolve,reject)=>{window.failReview=()=>reject(new Error('review transport unavailable'))}) : original(url,init);document.querySelector('[data-assistant-decision=reject]').click(); })()`);
      assert.equal(await evaluate("[...document.querySelectorAll('[data-review] .assistant-card-actions button')].every(button=>button.disabled)"), true);
      await evaluate("window.failReview()");
      await waitFor("document.querySelector('.assistant-problem')?.textContent.includes('不知道这次操作有没有完成，请刷新后核对') && [...document.querySelectorAll('[data-review] .assistant-card-actions button')].every(button=>!button.disabled)");
      await evaluate("window.restoreReviewFetch()");
    }
    await evaluate(`document.querySelector('[data-assistant-decision=${decision}]').click()`);
    await waitFor("!document.querySelector('[data-review]')", 30_000);
    await waitFor(`fetch(${JSON.stringify(api + '/works')}).then(r=>r.json()).then(b=>b.works.find(w=>w.work_id===localStorage.getItem('molis.assistant.current'))?.state==='completed')`, 30_000);
    const todos = openTodoStore(homeDirectory);
    try {
      assert.equal(todos.list({ projectId, projectIds: [], actor: "user", actorId: "web-user" }).filter(item => item.title === `投影测试-${decision}`).length, decision === "approve" ? 1 : 0,
        "a real approval persists exactly one todo; a rejection persists none");
    } finally { todos.close(); }
  }
});
