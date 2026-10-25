import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openPagesStore, nodeFromUnknown } from "@molis-ai/molis-work-plugin-pages";
import { openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import type { PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W5-10-PGC-03 / W5-10-PGV-02: exercise the bundled commands and node views through the real editor and host.
async function openContentBrowser(t: TestContext, surface: string, completion: Parameters<typeof openGoalBrowser>[3]) {
  const browser = await openGoalBrowser(t, true, undefined, completion);
  return browser ? { ...browser, frame: await pluginFrameBrowser(t, browser, surface) } : null;
}
type Browser = NonNullable<Awaited<ReturnType<typeof openContentBrowser>>>;

test("W2-18-PAGES-COMMENT-01: a plain comment popup follows its original range and refuses a replaced document", { timeout: 90_000 }, async t => {
  const b = await openContentBrowser(t, "pages", null); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + b.projectId + "/?openPlugin=pages" }, b.sessionId));
  await b.frame.waitFor("typeof window.MolisWorkPagesEditor?.mount === 'function'");
  await b.frame.evaluate("(() => { const root=document.createElement('div'); root.id='comment-anchor-fixture'; document.body.append(root); window.commentHandle=window.MolisWorkPagesEditor.mount(root,{doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Document A',marks:[{type:'comment',attrs:{id:'comment-a',text:'A note'}}]}]}]}}); const view=commentHandle.view; view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc,2))); view.focus(); })()");
  await b.frame.waitFor("[...document.querySelectorAll('.pages-comment-preview')].some(node=>!node.hidden && node.textContent.includes('A note'))");
  await b.frame.evaluate("[...document.querySelectorAll('.pages-comment-preview')].find(node=>!node.hidden && node.textContent.includes('A note')).querySelector('button').click()");
  await b.frame.waitFor("[...document.querySelectorAll('.pages-pop:not([hidden]) textarea')].some(node=>node.value==='A note')");
  await b.frame.evaluate("(() => { const area=[...document.querySelectorAll('.pages-pop:not([hidden]) textarea')].find(node=>node.value==='A note'); window.oldCommentApply=area.closest('.pages-pop').querySelector('.mw-btn--primary'); area.value='Mapped note'; commentHandle.view.dispatch(commentHandle.view.state.tr.insertText('Prefix ',1)); oldCommentApply.click(); })()");
  const mapped = await b.frame.evaluate<{ content: Array<{ content: Array<{ text: string; marks?: Array<{ type: string; attrs: { text: string } }> }> }> }>("window.MolisWorkPagesEditor.getDoc(commentHandle)");
  assert.equal(mapped.content[0]!.content.map(node => node.text).join(""), "Prefix Document A");
  assert.ok(mapped.content[0]!.content.some(node => node.text === "Document A" && node.marks?.some(mark => mark.type === "comment" && mark.attrs.text === "Mapped note")), "the original text carries the saved annotation after the insertion moved it");
  assert.ok(!mapped.content[0]!.content.some(node => node.text.includes("Prefix") && node.marks?.some(mark => mark.type === "comment" && mark.attrs.text === "Mapped note")), "the inserted prefix was not silently included in the old range");
  await b.frame.evaluate("(() => { const view=commentHandle.view; view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc,10))); view.focus(); })()");
  await b.frame.waitFor("[...document.querySelectorAll('.pages-comment-preview')].some(node=>!node.hidden && node.textContent.includes('Mapped note'))");
  await b.frame.evaluate("[...document.querySelectorAll('.pages-comment-preview')].find(node=>!node.hidden && node.textContent.includes('Mapped note')).querySelector('button').click()");
  await b.frame.waitFor("[...document.querySelectorAll('.pages-pop:not([hidden]) textarea')].some(node=>node.value==='Mapped note')");
  await b.frame.evaluate("(() => { const area=[...document.querySelectorAll('.pages-pop:not([hidden]) textarea')].find(node=>node.value==='Mapped note'); window.detachedCommentButton=area.closest('.pages-pop').querySelector('.mw-btn--primary'); area.value='Must not enter B'; window.MolisWorkPagesEditor.setDoc(commentHandle,{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Document B'}]}]}); })()");
  const before = await b.frame.evaluate("window.MolisWorkPagesEditor.getDoc(commentHandle)");
  await b.frame.evaluate("window.detachedCommentButton.click()");
  assert.deepEqual(await b.frame.evaluate("window.MolisWorkPagesEditor.getDoc(commentHandle)"), before, "a retained old popup handler cannot annotate the next document");
  await b.frame.evaluate("window.MolisWorkPagesEditor.destroy(commentHandle);document.querySelector('#comment-anchor-fixture').remove()");
});
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const body = (text: string) => ({ type: "doc" as const, content: [paragraph(text)] });
const readPage = (b: Browser, id: string) => { const store = openPagesStore(b.homeDirectory); try { return store.get(id, b.projectId!); } finally { store.close(); } };
const open = async (b: Browser, plugin: string, id: string) => {
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=${plugin}&${plugin === 'ppt' ? 'openRecord' : 'openItem'}=${id}` }, b.sessionId));
  await b.frame.waitFor(`document.querySelector('[data-${plugin}=workbench]')?.dataset.expanded === 'true'`);
};
const input = (b: Browser, selector: string, value: string) => b.frame.evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const typeEnd = async (b: Browser, text: string) => {
  await b.frame.evaluate(`(() => { const editor=document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus(); const range=document.createRange(); range.selectNodeContents(editor);range.collapse(false); const selection=getSelection();selection.removeAllRanges();selection.addRange(range); })()`);
  await b.command("Input.insertText", { text }, b.sessionId);
};
// A person moves the caret with the pointer; the editor puts a caret set only through the DOM back where its own state has
// it, so a script that sets a DOM range and then presses keys races the editor (on Linux CI the editor won, and "Prefix "
// landed at the paragraph's end). Click at the start or the end of the paragraph's text, then wait until the caret is there.
const clickCaret = async (b: Browser, paragraph: number, at: "start" | "end") => {
  const point = await b.frame.evaluate<{ x: number; y: number }>(`(() => { const text=document.querySelectorAll('.ProseMirror p')[${paragraph}].firstChild,range=document.createRange();
    ${at === "start" ? "range.setStart(text,0);range.setEnd(text,1);" : "range.setStart(text,text.length-1);range.setEnd(text,text.length);"}
    const rect=range.getBoundingClientRect();return {x:${at === "start" ? "rect.left+1" : "rect.right-1"},y:rect.top+rect.height/2}; })()`);
  const offset = await b.evaluate<{x:number;y:number}>("(()=>{const box=document.querySelector('iframe[data-plugin-frame=pages]').getBoundingClientRect();return{x:box.x,y:box.y}})()");
  point.x += offset.x; point.y += offset.y;
  for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, b.sessionId);
  await b.frame.waitFor(`(() => { const s=getSelection(),p=document.querySelectorAll('.ProseMirror p')[${paragraph}];if(!s.isCollapsed||!p.contains(s.anchorNode))return false;
    const r=document.createRange();r.setStart(p,0);r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().length===${at === "start" ? "0" : "p.textContent.length"}; })()`);
};
const holdTimers = (b: Browser) => b.frame.evaluate(`(() => { const original=window.setTimeout, held=[]; window.setTimeout=(fn,delay,...args)=>{const id=original(fn,delay===400?60000:delay,...args);if(delay===400)held.push(id);return id;}; window.restoreContentTimers=()=>{window.setTimeout=original;held.forEach(clearTimeout);}; })()`);
// The page asks through the frame's molisWorkRequest (it captured fetch when the frame started), so the real Host's answer is held by wrapping that helper: it hands back the parsed payload.
const holdReply = (b: Browser, path: string) => b.frame.evaluate(`(() => { const original=window.molisWorkRequest;let held=false; window.molisWorkRequest=Object.assign(async (url,options)=>{const payload=await original(url,options);if(!held&&options?.method==='POST'&&new URL(url,"http://plugin.invalid").pathname.endsWith(${JSON.stringify(path)})){held=true;window.heldContentPayload=payload;await new Promise(resolve=>window.releaseContentReply=resolve);}return payload;},original);window.restoreContentFetch=()=>{window.molisWorkRequest=original;}; })()`);
const chooseActions = async (b: Browser) => {
  await b.frame.evaluate(`(() => { const editor=document.querySelector('[data-pages-editor] .ProseMirror'),p=editor.querySelector('p');editor.focus();const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange')); })()`);
  await b.frame.waitFor("!getSelection().isCollapsed && getSelection().toString() === document.querySelector('[data-pages-editor] .ProseMirror p').textContent");
  await b.waitFor("document.querySelector('.mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) [data-more]')");
  await b.click(".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) [data-more]");
  await b.waitFor("[...document.querySelectorAll('.mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) button,.mw-ctx-menu button')].some(button=>button.textContent.includes('拆成行动项'))");
  await b.evaluate("[...document.querySelectorAll('.mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) button,.mw-ctx-menu button')].find(button=>button.textContent.includes('拆成行动项')).click()");
  await b.frame.waitFor("document.querySelector('.pages-pop:not([hidden]) textarea')");
};

test("W2-18-PAGES-CALLOUT-01: a callout popup belongs to its original document; the new document has working controls", { timeout: 90_000 }, async t => {
  const b = await openContentBrowser(t, "pages", null); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=pages` }, b.sessionId));
  await b.frame.waitFor("typeof window.MolisWorkPagesEditor?.mount === 'function'");
  await b.frame.evaluate(`(() => {
    const api=window.MolisWorkPagesEditor, root=document.createElement('div'); root.id='callout-lifetime-fixture'; document.body.append(root);
    window.calloutDoc = text => ({type:'doc',content:[{type:'callout',attrs:{tone:'cyan',icon:'info'},content:[{type:'paragraph',content:[{type:'text',text}]}]}]});
    window.calloutEditor=api.mount(root,{doc:window.calloutDoc('Document A')});
    root.querySelector('[data-pages-callout-pick]').click();
    const popup=[...document.querySelectorAll('.pages-pop')].find(node=>!node.hidden && node.querySelector('.pages-icon-pick'));
    window.oldCalloutIcon=popup.querySelector('[aria-label="星标"]')||popup.querySelector('.pages-icon-pick:last-child');
    window.oldCalloutTone=popup.querySelector('[data-pages-tone="purple"]');
    window.oldCalloutPopup=popup; api.setDoc(window.calloutEditor,window.calloutDoc('Document B'));
  })()`);
  const before = await b.frame.evaluate("window.MolisWorkPagesEditor.getDoc(window.calloutEditor)");
  assert.equal(await b.frame.evaluate("window.oldCalloutPopup.hidden && window.oldCalloutPopup.childElementCount===0"), true);
  await b.frame.evaluate("window.oldCalloutIcon.click();window.oldCalloutTone.click()");
  assert.deepEqual(await b.frame.evaluate("window.MolisWorkPagesEditor.getDoc(window.calloutEditor)"), before, "the retained old handlers cannot change Document B");
  await b.frame.evaluate("document.querySelector('#callout-lifetime-fixture [data-pages-callout-pick]').click()");
  await b.frame.waitFor("[...document.querySelectorAll('.pages-pop')].some(node=>!node.hidden && node.querySelector('[data-pages-tone=purple]'))");
  await b.frame.evaluate("[...document.querySelectorAll('.pages-pop')].find(node=>!node.hidden && node.querySelector('[data-pages-tone=purple]')).querySelector('[data-pages-tone=purple]').click()");
  const after = await b.frame.evaluate<{ content: Array<{ attrs: { tone: string }; content: unknown }> }>("window.MolisWorkPagesEditor.getDoc(window.calloutEditor)");
  assert.equal(after.content[0]!.attrs.tone, "purple");
  assert.match(JSON.stringify(after.content[0]!.content), /Document B/);
  await b.frame.evaluate("window.MolisWorkPagesEditor.destroy(window.calloutEditor);document.querySelector('#callout-lifetime-fixture').remove()");
});

test("W2-18-PAGES-READONLY-01: real Back/import/publish/extract never save the empty placeholder; valid replacement reopens", { timeout: 90_000 }, async t => {
  const b = await openContentBrowser(t, "pages", null); if (!b) return;
  const foreign = { type: "doc" as const, content: [{ type: "foreign_node", content: [{ type: "text", text: "Unshowable original evidence" }] }] };
  const store = openPagesStore(b.homeDirectory);
  const page = (() => { try { return store.create({ project_id: b.projectId!, title: "Unknown body", body: foreign }); } finally { store.close(); } })();
  await open(b, "pages", page.id);
  await b.frame.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')?.getAttribute('contenteditable') === 'false'");
  await b.frame.click("[data-pages-back]"); await b.frame.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'");
  assert.deepEqual(readPage(b, page.id), page);
  await open(b, "pages", page.id);
  await b.frame.click("[data-pages-import]"); await b.frame.waitFor("document.querySelector('[data-pages-import-dialog]').open");
  assert.deepEqual(readPage(b, page.id), page);
  await b.frame.evaluate("document.querySelector('[data-pages-import-dialog]').close()");
  for (const operation of ["extract", "promote"]) {
    await b.frame.click("[data-pages-more]"); await b.frame.click(`[data-pages-${operation}]`);
    await b.frame.waitFor("document.querySelector('[data-pages-note]').textContent.includes('暂不支持此操作')");
    assert.deepEqual(readPage(b, page.id), page);
  }
  const replacement = openPagesStore(b.homeDirectory);
  try { replacement.update(page.id, { body: body("Supported replacement"), expected_version: page.version }, b.projectId!); } finally { replacement.close(); }
  await b.frame.evaluate("window.dispatchEvent(new Event('focus'))");
  await b.frame.waitFor("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('Supported replacement') && document.querySelector('[data-pages-editor] .ProseMirror').getAttribute('contenteditable') !== 'false'");
});

for (const operation of ["create", "extract"] as const) test(`W2-18-PAGES-CREATE-01: ${operation} reply after new typing preserves the real draft and honest SQL outcome`, { timeout: 90_000 }, async t => {
  const b = await openContentBrowser(t, "pages", null); if (!b) return;
  const store = openPagesStore(b.homeDirectory);
  const page = (() => { try { return store.create({ project_id: b.projectId!, title: "Source A", body: { type: "doc", content: [paragraph("Original words"), { type: "task_list", content: [{ type: "task_item", attrs: { checked: false }, content: [paragraph("Actual extracted task")] }] }] } }); } finally { store.close(); } })();
  await open(b, "pages", page.id); await b.frame.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')");
  await holdTimers(b); await holdReply(b, operation === "create" ? "/api/plugins/io.molis.work.pages/pages" : `/api/plugins/io.molis.work.pages/pages/${page.id}/extract`);
  if (operation === "create") await b.frame.click("[data-pages-new]");
  else { await b.frame.click("[data-pages-more]"); await b.frame.click("[data-pages-extract]"); }
  await b.frame.waitFor("typeof window.releaseContentReply === 'function'");
  await typeEnd(b, " NEW LOCAL WORDS");
  const committed = await b.frame.evaluate<{ document: PagesRecord }>("window.heldContentPayload");
  await b.frame.evaluate("window.releaseContentReply()");
  if (operation === "create") {
    await b.frame.waitFor(`JSON.parse(document.querySelector('[data-pages=workbench]').getAttribute('data-assistant-context')||'{}').object?.id === ${JSON.stringify(committed.document.id)}`);
    assert.match(JSON.stringify(readPage(b, page.id).body), /NEW LOCAL WORDS/);
    assert.equal(readPage(b, committed.document.id).id, committed.document.id);
  } else {
    await b.frame.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '保存失败'");
    assert.equal(await b.frame.evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('NEW LOCAL WORDS')"), true);
    assert.deepEqual(readPage(b, page.id), committed.document, "the acknowledged extraction stays; unsaved text is kept for explicit conflict resolution");
  }
  await b.frame.evaluate("window.restoreContentFetch();window.restoreContentTimers()");
});

test("W2-18-PAGES-TRANSIENT-01: delayed image/popup on A cannot write B; a read in the same document uses its mapped anchor", { timeout: 120_000 }, async t => {
  const b = await openContentBrowser(t, "pages", null); if (!b) return;
  const store = openPagesStore(b.homeDirectory);
  const [a, c] = (() => { try { return [store.create({ project_id: b.projectId!, title: "A", body: { type: "doc", content: [paragraph("A text"), { type: "task_card", attrs: { title: "A task", status: "todo", description: "A only", due: "" } }] } }), store.create({ project_id: b.projectId!, title: "B", body: { type: "doc", content: [paragraph("Original anchor"), paragraph("Later caret")] } })]; } finally { store.close(); } })();
  await open(b, "pages", a.id);
  await b.frame.evaluate(`(() => { window.contentEditor=document.querySelector('.ProseMirror'); const original=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){this.onloadend=()=>window.contentReadDone=true;window.releaseContentRead=()=>original.call(this,file);};window.restoreContentRead=()=>FileReader.prototype.readAsDataURL=original; })()`);
  const paste = () => b.frame.evaluate(`(() => { window.contentReadDone=false;const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'fixture.png',{type:'image/png'}));document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`);
  await paste(); await b.frame.waitFor("typeof window.releaseContentRead === 'function'");
  await b.frame.click(`button[data-page-id="${c.id}"]`);
  await b.frame.waitFor("document.querySelector('.ProseMirror').textContent.includes('Original anchor')");
  assert.equal(await b.frame.evaluate("window.contentEditor === document.querySelector('.ProseMirror')"), true);
  await b.frame.evaluate("window.releaseContentRead()"); await b.frame.waitFor("window.contentReadDone === true");
  assert.deepEqual(readPage(b, c.id), c);
  await b.frame.click(`button[data-page-id="${a.id}"]`); await b.frame.waitFor("document.querySelector('.pages-card--task')");
  await b.frame.click(".pages-card--task"); await b.frame.waitFor("document.querySelector('.pages-pop[data-open=card]')");
  await b.frame.click(`button[data-page-id="${c.id}"]`); await b.frame.waitFor("!document.querySelector('.pages-pop[data-open=card]')");
  assert.deepEqual(readPage(b, c.id), c);
  await clickCaret(b, 0, "end");
  await paste();
  await clickCaret(b, 0, "start");
  await b.command("Input.insertText", { text: "Prefix " }, b.sessionId);
  await clickCaret(b, 1, "end");
  await b.frame.evaluate("window.releaseContentRead()");
  await b.frame.waitFor("document.querySelector('.ProseMirror img') && document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
  const saved = nodeFromUnknown(readPage(b, c.id).body);
  assert.deepEqual([saved.child(0).type.name, saved.child(1).type.name, saved.child(2).type.name], ["paragraph", "image", "paragraph"]);
  assert.equal(saved.child(0).textContent, "Prefix Original anchor"); assert.equal(saved.child(2).textContent, "Later caret");
  await b.frame.evaluate("window.restoreContentRead()");
});

test("W2-18-PAGES-ACTIONS-01: real candidate inserts exact unchecked tasks once and refuses a changed frozen passage", { timeout: 120_000 }, async t => {
  const b = await openContentBrowser(t, "pages", async () => "- Ask Alice\n- Publish roadmap"); if (!b) return;
  const store = openPagesStore(b.homeDirectory);
  const [a, changed] = (() => { try { return [store.create({ project_id: b.projectId!, title: "Plan", body: body("安排访谈并发布计划。") }), store.create({ project_id: b.projectId!, title: "Changed", body: body("安排采访和后续发布完整计划。") })]; } finally { store.close(); } })();
  await open(b, "pages", a.id); await chooseActions(b);
  await b.frame.evaluate("window.oldContentApply=document.querySelector('.pages-pop .mw-btn--primary');window.oldContentApply.click();window.oldContentApply.click()");
  await b.frame.waitFor("document.querySelector('.ProseMirror .pages-task-list') && document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
  const saved = nodeFromUnknown(readPage(b, a.id).body);
  assert.equal(saved.child(0).textContent, "安排访谈并发布计划。");
  assert.equal(saved.child(1).type.name, "task_list"); assert.equal(saved.child(1).childCount, 2);
  assert.deepEqual([saved.child(1).child(0).textContent, saved.child(1).child(1).textContent], ["Ask Alice", "Publish roadmap"]);
  assert.equal(saved.child(1).child(0).attrs.checked, false); assert.equal(saved.child(1).child(1).attrs.checked, false);
  await open(b, "pages", changed.id); await chooseActions(b);
  await b.frame.evaluate(`(() => { const editor=document.querySelector('.ProseMirror');editor.focus();const text=editor.querySelector('.pages-focus-frozen').firstChild,range=document.createRange();range.setStart(text,2);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);})()`);
  await b.command("Input.insertText", { text: "改变" }, b.sessionId);
  await b.frame.click(".pages-pop .mw-btn--primary"); await b.frame.waitFor("document.querySelector('.pages-pop-error')?.textContent.includes('没有写入')");
  await b.frame.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
  assert.equal(nodeFromUnknown(readPage(b, changed.id).body).childCount, 1);
  assert.match(nodeFromUnknown(readPage(b, changed.id).body).textContent, /改变/);
});

test("W2-18-PPT-02: closing a generating dialog protects later typing and a reopened dialog from its late response", { timeout: 120_000 }, async t => {
  let release!: () => void, entered!: () => void, cancelled!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), model = new Promise<void>(resolve => { release = resolve; });
  const cancellation = new Promise<void>(resolve => { cancelled = resolve; });
  const b = await openContentBrowser(t, "ppt", async (_prompt, options) => {
    entered();
    await Promise.race([model, new Promise<void>((_resolve, reject) => { const abort = () => { cancelled(); reject(options?.signal?.reason || new Error("Cancelled")); }; if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener("abort", abort, { once: true }); })]);
    return "## Generated\n- Old result";
  }); if (!b) return;
  t.after(() => release());
  const store = openPptStore(b.homeDirectory);
  const deck = (() => { try { return store.create({ title: "Deck", project_id: b.projectId! }); } finally { store.close(); } })();
  await open(b, "ppt", deck.id); await b.frame.click("[data-ppt-outline-open]");
  await b.frame.evaluate(`(() => { const original=window.molisWorkRequest;window.pptCallEnded=false;window.molisWorkRequest=Object.assign(async(url,options)=>{try{return await original(url,options);}finally{if(options?.method==='POST'&&new URL(url,"http://plugin.invalid").pathname.endsWith('/outline-ai'))window.pptCallEnded=true;}},original);window.restorePptFetch=()=>{window.molisWorkRequest=original;};})()`);
  await input(b, "[data-ppt-outline-text]", "Original source"); await b.frame.click('[data-ppt-outline-mode="ai"]');
  await b.frame.click("[data-ppt-outline-submit]"); await started;
  await b.frame.click("[data-ppt-outline-close]"); await cancellation; await holdTimers(b);
  await b.frame.waitFor("window.pptCallEnded === true && !document.querySelector('[data-ppt-outline-submit]').disabled");
  await input(b, "[data-ppt-slide-title]", "New local heading");
  await b.frame.click("[data-ppt-outline-open]"); await input(b, "[data-ppt-outline-text]", "New dialog source");
  release();
  assert.equal(await b.frame.evaluate("document.querySelector('[data-ppt-slide-title]').value"), "New local heading");
  assert.equal(await b.frame.evaluate("document.querySelector('[data-ppt-outline-dialog]').open"), true);
  assert.equal(await b.frame.evaluate("document.querySelector('[data-ppt-outline-text]').value"), "New dialog source");
  await b.frame.click("[data-ppt-outline-close]"); await b.frame.evaluate("window.restoreContentTimers()");
  await b.frame.evaluate("document.querySelector('[data-ppt-title]').dispatchEvent(new Event('input',{bubbles:true}))");
  await b.frame.waitFor("document.querySelector('[data-ppt-editor-status]').textContent.includes('已保存')");
  const after = openPptStore(b.homeDirectory);
  try { const stored = after.get(deck.id, b.projectId!); assert.equal(stored.slides[0]!.title, "New local heading"); assert.equal(stored.slides.length, 1); } finally { after.close(); }
  await b.frame.evaluate("window.restorePptFetch()");
});

test("W2-18-LINGGUANG-REVISION-01: list metadata from B cannot acknowledge unshown A edits; the real save conflicts", { timeout: 90_000 }, async t => {
  const b = await openContentBrowser(t, "lingguang", null); if (!b) return;
  const store = openLingguangStore(b.homeDirectory);
  const [a, other] = (() => { try { return [store.create({ project_id: b.projectId!, title: "A", body: "Original A" }), store.create({ project_id: b.projectId!, title: "B", body: "Original B" })]; } finally { store.close(); } })();
  await open(b, "lingguang", a.id); await b.frame.waitFor("document.querySelector('[data-lingguang-body]').value === 'Original A'");
  const external = openLingguangStore(b.homeDirectory);
  const remote = (() => { try { return external.update(a.id, { title: "Remote heading", body: "Remote A", expected_updated_at: a.updated_at }, b.projectId!); } finally { external.close(); } })();
  await b.frame.evaluate(`window.dispatchEvent(new CustomEvent('molis:placement-changed',{detail:{mode:'copy',from:{kind:'lingguang_spark',id:${JSON.stringify(other.id)}},to:{kind:'lingguang_spark',id:${JSON.stringify(other.id)}}}}))`);
  await b.frame.waitFor(`document.querySelector('[data-lingguang-id="${a.id}"]').textContent.includes('Remote heading')`);
  await input(b, "[data-lingguang-body]", "Local A must stay");
  await b.frame.waitFor("document.querySelector('[data-lingguang-save-status]').textContent === '保存失败'");
  assert.equal(await b.frame.evaluate("document.querySelector('[data-lingguang-body]').value"), "Local A must stay");
  const after = openLingguangStore(b.homeDirectory); try { assert.deepEqual(after.get(a.id, b.projectId!), remote); } finally { after.close(); }
  await open(b, "lingguang", a.id); await b.frame.waitFor("document.querySelector('[data-lingguang-body]').value === 'Remote A'");
});
