import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const link = (href: string) => ({ type: "link", attrs: { href } });
const comment = (id: string, text: string) => ({ type: "comment", attrs: { id, text } });
const paragraph = (text: string, marks: object[] = []) => ({ type: "paragraph", content: [{ type: "text", text, marks }] });
const docOf = (...content: object[]) => ({ type: "doc", content });
const original = docOf(paragraph("Both", [link("https://one.example/path"), comment("first", "First note")]),
  paragraph("Second link", [link("https://two.example/next")]), paragraph("Second comment", [comment("second", "Second note")]), paragraph("Plain"));

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.command("Emulation.setDeviceMetricsOverride", { width: 780, height: 493, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PPV-01/02: formal host bundle/CSS, public mount, real Chrome DOM and input.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='previews-fixture';root.className='pages-editor-host';root.style.cssText='width:640px;max-width:90vw;margin:260px auto';
    const other=document.createElement('button');other.id='other-focus';other.textContent='Other';other.style.cssText='position:fixed;bottom:8px;right:8px';
    document.body.replaceChildren(root,other);document.documentElement.style.overflow='auto';document.body.style.cssText='height:auto;overflow:auto;display:block;min-height:2200px';
    window.previewCounts={change:0,screen:0};window.previewComments=[];window.previewOpened=[];window.previewTranslations=[];window.previewRelease=[];
    window.open=(...args)=>{previewOpened.push(args);return null};
    window.previewOptions={doc:${JSON.stringify(original)},onChange:()=>previewCounts.change++,onScreen:()=>previewCounts.screen++,onComment:id=>previewComments.push(id),
      onTools:()=>{if(window.releasingPreview){const before=previewCounts.screen;window.dispatchEvent(new Event('resize'));previewRelease.push({link:previewLink.isConnected,comment:previewComment.isConnected,screenDelta:previewCounts.screen-before})}},
      translate:label=>{previewTranslations.push(label);return label}};
    window.previewEditor=MolisWorkPagesEditor.mount(root,previewOptions);previewEditor.view.focus();window.PreviewSelection=previewEditor.view.state.selection.constructor;
    window.previewLink=document.querySelector('.pages-link-preview');window.previewComment=document.querySelector('.pages-comment-preview');
  })()`);
  return b;
}

const select = (b: Browser, text: string, length = 0) => b.evaluate(`(() => {
  const {view}=previewEditor;let pos=-1;view.state.doc.descendants((node,at)=>{if(pos<0&&node.isText&&node.text===${JSON.stringify(text)})pos=at+1});
  if(pos<0)throw new Error('Missing selection text');view.dispatch(view.state.tr.setSelection(PreviewSelection.create(view.state.doc,pos,pos+${length})));view.focus();
})()`);
const state = (b: Browser) => b.evaluate("({link:!previewLink.hidden,comment:!previewComment.hidden,label:previewLink.querySelector('span').textContent,text:previewComment.querySelector('p').textContent})");
const settleBlur = (b: Browser) => b.evaluate("new Promise(resolve=>setTimeout(resolve,180))");
async function escape(b: Browser) {
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
}
async function placement(b: Browser) {
  const value = await b.evaluate<{ text: { top: number; bottom: number }; link: { top: number; bottom: number }; comment: { top: number; bottom: number } }>(`(() => {
    const text=previewEditor.view.dom.querySelector('p').getBoundingClientRect(),link=previewLink.getBoundingClientRect(),comment=previewComment.getBoundingClientRect();
    return {text:{top:text.top,bottom:text.bottom},link:{top:link.top,bottom:link.bottom},comment:{top:comment.top,bottom:comment.bottom}};
  })()`);
  assert.ok(value.link.bottom <= value.text.top, `link preview is above the marked paragraph: ${JSON.stringify(value)}`);
  assert.ok(value.comment.top >= value.text.bottom, `comment preview is below the marked paragraph: ${JSON.stringify(value)}`);
  return value;
}

test("W5-10-PPV-01: previews follow current marks, buttons, edits and the original setDoc refresh point", { timeout: 90_000 }, async t => {
  const b = await mount(t); if (!b) return;
  assert.deepEqual(await b.evaluate("previewTranslations.slice(0,3)"), ["打开", "编辑", "编辑"]);
  await select(b, "Both");
  assert.deepEqual(await state(b), { link: true, comment: true, label: "one.example", text: "First note" });
  await placement(b);
  const selection = await b.evaluate("previewEditor.view.state.selection.toJSON()");
  await b.click(".pages-link-preview button:first-of-type");
  assert.deepEqual(await b.evaluate("previewOpened"), [["https://one.example/path", "_blank", "noopener,noreferrer"]]);
  assert.deepEqual(await b.evaluate("previewEditor.view.state.selection.toJSON()"), selection);
  await b.click(".pages-comment-preview button");
  assert.deepEqual(await b.evaluate("previewComments"), ["first"]);
  await select(b, "Second link");
  assert.equal((await state(b) as { comment: boolean }).comment, false);
  await b.click(".pages-link-preview button:first-of-type");
  assert.deepEqual(await b.evaluate("previewOpened[1]"), ["https://two.example/next", "_blank", "noopener,noreferrer"]);
  await b.click(".pages-link-preview button:last-of-type");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop input').value"), "https://two.example/next");
  await b.evaluate("document.querySelector('.pages-pop input').value='https://edited.example/result'");
  await b.click(".pages-pop-actions .mw-btn--primary");
  assert.equal(await b.evaluate("previewEditor.view.state.doc.child(1).firstChild.marks.find(mark=>mark.type.name==='link').attrs.href"), "https://edited.example/result");
  assert.equal(await b.evaluate("previewEditor.view.state.doc.firstChild.firstChild.marks.find(mark=>mark.type.name==='link').attrs.href"), "https://one.example/path");
  await b.click(".pages-link-preview button:last-of-type");
  await b.evaluate("document.querySelector('.pages-pop input').value='https://cancelled.example/'"); await escape(b);
  assert.equal(await b.evaluate("previewEditor.view.state.doc.child(1).firstChild.marks.find(mark=>mark.type.name==='link').attrs.href"), "https://edited.example/result");
  await select(b, "Second comment"); await b.click(".pages-comment-preview button");
  assert.deepEqual(await b.evaluate("previewComments"), ["first", "second"]);
  await b.evaluate("delete previewOptions.onComment");
  await b.click(".pages-comment-preview button");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop textarea').value"), "Second note");
  await b.evaluate("document.querySelector('.pages-pop textarea').value='Edited note'"); await b.click(".pages-pop-actions .mw-btn--primary");
  assert.equal(await b.evaluate("previewEditor.view.state.doc.child(2).firstChild.marks.find(mark=>mark.type.name==='comment').attrs.text"), "Edited note");
  // W5-10-PPV-03: the extracted comment form must close its current transient, after showPop replaced the previous one.
  assert.equal(await b.evaluate("document.querySelector('.pages-pop').hidden"), true, "saving closes the current comment form");
  await b.click(".pages-comment-preview button");
  await b.evaluate("document.querySelector('.pages-pop textarea').value='Button cancelled note'");
  await b.click(".pages-pop-actions .mw-btn--ghost");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop').hidden"), true, "cancel button closes the current comment form");
  assert.equal(await b.evaluate("previewEditor.view.state.doc.child(2).firstChild.marks.find(mark=>mark.type.name==='comment').attrs.text"), "Edited note");
  await b.click(".pages-comment-preview button");
  await b.evaluate("document.querySelector('.pages-pop textarea').value='Cancelled note'"); await escape(b);
  assert.equal(await b.evaluate("previewEditor.view.state.doc.child(2).firstChild.marks.find(mark=>mark.type.name==='comment').attrs.text"), "Edited note");
  await select(b, "Both", 2); assert.equal(await b.evaluate("previewLink.hidden&&previewComment.hidden"), true);
  await select(b, "Plain"); assert.equal(await b.evaluate("previewLink.hidden&&previewComment.hidden"), true);
  await select(b, "Both");
  const before = await state(b);
  await b.evaluate(`MolisWorkPagesEditor.setDoc(previewEditor,${JSON.stringify(docOf(paragraph("Fresh", [link("https://fresh.example/"), comment("fresh", "Fresh note")]), paragraph("After")))})`);
  assert.deepEqual(await state(b), before, "setDoc alone preserves the existing preview until a selection transaction");
  await select(b, "Fresh");
  assert.deepEqual(await state(b), { link: true, comment: true, label: "fresh.example", text: "Fresh note" });
  await b.click(".pages-link-preview button:first-of-type");
  assert.deepEqual(await b.evaluate("previewOpened.at(-1)"), ["https://fresh.example/", "_blank", "noopener,noreferrer"]);
  await b.evaluate("MolisWorkPagesEditor.destroy(previewEditor)");
});

test("W5-10-PPV-02: focus, scrolling, release reentry and pending blur keep instance ownership", { timeout: 90_000 }, async t => {
  const b = await mount(t); if (!b) return;
  await select(b, "Both"); await b.click(".pages-link-preview button:last-of-type");
  await b.waitFor("document.activeElement===document.querySelector('.pages-pop input')"); await settleBlur(b);
  assert.equal(await b.evaluate("!previewLink.hidden&&!previewComment.hidden"), true, "form focus preserves previews after blur delay");
  await escape(b); await b.click("#other-focus"); await settleBlur(b);
  assert.equal(await b.evaluate("previewLink.hidden&&previewComment.hidden"), true);
  await select(b, "Both"); const first = await placement(b);
  await b.evaluate("window.beforeScreen=previewCounts.screen;window.scrollBy(0,80)");
  await b.waitFor("previewCounts.screen>beforeScreen");
  const moved = await placement(b);
  assert.ok(first.link.top - moved.link.top > 60, "real page scroll moves the shown preview with the text");
  await b.evaluate("previewOptions.onScreen=function(){previewCounts.screen+=10;window.previewScreenThis=this===previewOptions};window.beforeScreen=previewCounts.screen;window.dispatchEvent(new Event('resize'))");
  assert.equal(await b.evaluate("previewCounts.screen-beforeScreen"), 10);
  assert.equal(await b.evaluate("previewScreenThis"), true, "follow reads the current callback with original options receiver");
  assert.equal(await b.evaluate("(() => {const before=previewCounts.screen;previewLink.querySelector('span').dispatchEvent(new Event('scroll'));return previewCounts.screen-before})()"), 0, "scroll inside link preview is excluded");
  assert.equal(await b.evaluate("(() => {const before=previewCounts.screen;previewComment.querySelector('p').dispatchEvent(new Event('scroll'));return previewCounts.screen-before})()"), 10, "comment scroll keeps the original follow behavior");
  await b.evaluate("document.querySelector('#other-focus').focus();window.beforeScreen=previewCounts.screen;window.dispatchEvent(new Event('resize'))");
  assert.equal(await b.evaluate("previewLink.hidden&&previewComment.hidden"), true);
  assert.equal(await b.evaluate("previewCounts.screen-beforeScreen"), 10);
  await select(b, "Both"); await b.click(".pages-link-preview button:last-of-type");
  await b.evaluate("window.releasingPreview=true;previewEditor.release();window.releasingPreview=false");
  const release = await b.evaluate<Array<{ link: boolean; comment: boolean; screenDelta: number }>>("previewRelease");
  assert.ok(release.length > 0, "closing the frozen form reenters the original transaction path");
  assert.ok(release.every(item => item.link && item.comment && item.screenDelta === 0), "follow is stopped before hidePop reentry, while both preview nodes are still mounted");
  assert.equal(await b.evaluate("!previewLink.isConnected&&!previewComment.isConnected&&!document.querySelector('.pages-pop')"), true);
  await b.evaluate("previewEditor.view.destroy();window.oldPreviewCount=previewCounts.screen;window.dispatchEvent(new Event('resize'));document.dispatchEvent(new Event('scroll'))");
  assert.equal(await b.evaluate("previewCounts.screen"), await b.evaluate("oldPreviewCount"));
  await pendingBlurRemount(b);
});

async function pendingBlurRemount(b: Browser) {
  await b.evaluate(`(() => {
    previewEditor=MolisWorkPagesEditor.mount(document.querySelector('#previews-fixture'),{doc:${JSON.stringify(original)}});previewEditor.view.focus();
    previewLink=document.querySelector('.pages-link-preview');previewComment=document.querySelector('.pages-comment-preview');
  })()`);
  await select(b, "Both");
  await b.evaluate(`(() => {
    const old=previewEditor;window.oldPreviewLink=previewLink;window.oldPreviewComment=previewComment;
    document.querySelector('#other-focus').focus();MolisWorkPagesEditor.destroy(old);
    window.newPreviewScreen=0;previewEditor=MolisWorkPagesEditor.mount(document.querySelector('#previews-fixture'),{doc:${JSON.stringify(original)},onScreen:()=>newPreviewScreen++});
    previewLink=document.querySelector('.pages-link-preview');previewComment=document.querySelector('.pages-comment-preview');previewEditor.view.focus();
  })()`);
  await select(b, "Both"); await settleBlur(b);
  assert.equal(await b.evaluate("!previewLink.hidden&&!previewComment.hidden&&!oldPreviewLink.isConnected&&!oldPreviewComment.isConnected"), true);
  assert.equal(await b.evaluate("oldPreviewLink.hidden&&oldPreviewComment.hidden"), true, "pending old blur still affects only removed old nodes");
  await b.evaluate("window.beforeNewScreen=newPreviewScreen;window.dispatchEvent(new Event('resize'))");
  assert.equal(await b.evaluate("newPreviewScreen-beforeNewScreen"), 1);
  assert.equal(await b.evaluate("previewCounts.screen"), await b.evaluate("oldPreviewCount"), "old subscriptions do not fire after remount");
  await b.click(".pages-link-preview button:last-of-type");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop input').value"), "https://one.example/path");
  await escape(b); await b.click(".pages-comment-preview button");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop textarea').value"), "First note");
  await escape(b); await b.evaluate("MolisWorkPagesEditor.destroy(previewEditor)");
}
