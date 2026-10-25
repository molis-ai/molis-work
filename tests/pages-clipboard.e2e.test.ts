import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const original = { type: "doc", content: ["Alpha", "Beta", "Gamma"].map(paragraph) };

async function key(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
}

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PGP-01: formal host assets and the public editor contract.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='clipboard-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';document.body.replaceChildren(root);
    window.clipChanges=0;window.clipOptions={doc:${JSON.stringify(original)},onChange:()=>clipChanges++};
    window.clipEditor=window.MolisWorkPagesEditor.mount(root,clipOptions);clipEditor.view.focus();
  })()`);
  return b;
}

const doc = (b: Browser) => b.evaluate("window.MolisWorkPagesEditor.getDoc(clipEditor)");
const reset = (b: Browser, value: object = original) => b.evaluate(`(() => {
  window.MolisWorkPagesEditor.setDoc(clipEditor,${JSON.stringify(value)});
  window.MolisWorkPagesEditor.focusStart(clipEditor);window.clipChanges=0;
})()`);
const paste = (b: Browser, text: string, html = "", shift = false) => b.evaluate<boolean>(`(() => {
  const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(text)});data.setData('text/html',${JSON.stringify(html)});
  const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
  Object.defineProperty(event,'shiftKey',{value:${shift}});clipEditor.view.dom.dispatchEvent(event);return event.defaultPrevented;
})()`);
const blocks = (b: Browser) => b.evaluate("clipEditor.view.state.doc.content.content.map(node=>({type:node.type.name,text:node.textContent,marks:node.firstChild?.marks.map(mark=>({type:mark.type.name,attrs:mark.attrs}))??[]}))");

async function selectGroup(b: Browser) {
  await key(b, "ArrowDown", "ArrowDown", 40, 8);
  await b.waitFor("!clipEditor.view.state.selection.empty");
  await key(b, "ArrowDown", "ArrowDown", 40, 8);
  await b.waitFor("document.querySelectorAll('#clipboard-fixture .is-block-selected').length===2");
}

const clipboard = (b: Browser, type: "copy" | "cut") => b.evaluate<{ html: string; text: string; prevented: boolean }>(`(() => {
  const data=new DataTransfer();data.setData('application/x-unused','stale');
  const event=new ClipboardEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,clipboardData:data});
  clipEditor.view.dom.dispatchEvent(event);if(data.getData('application/x-unused'))throw new Error('Stale clipboard format retained');
  return {html:data.getData('text/html'),text:data.getData('text/plain'),prevented:event.defaultPrevented};
})()`);

test("W5-10-PGP-02: multi-block copy/cut writes complete HTML and Markdown, replaces the group, and undoes", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const undo = () => key(b, "z", "KeyZ", 90, mod);
  const before = await doc(b);
  await selectGroup(b);
  const copied = await clipboard(b, "copy");
  assert.equal(copied.prevented, true);
  assert.equal(copied.text, "Alpha\n\nBeta");
  assert.equal(await b.evaluate(`(() => {const root=new DOMParser().parseFromString(${JSON.stringify(copied.html)},'text/html').body;return JSON.stringify([...root.children].map(node=>[node.tagName,node.textContent]));})()`), JSON.stringify([["P", "Alpha"], ["P", "Beta"]]));
  assert.deepEqual(await doc(b), before);
  assert.equal(await b.evaluate("clipChanges"), 0);
  const cut = await clipboard(b, "cut");
  assert.deepEqual(cut, copied);
  assert.deepEqual(await blocks(b), [{ type: "paragraph", text: "Gamma", marks: [] }]);
  assert.equal(await b.evaluate("clipChanges"), 1);
  await undo();
  assert.deepEqual(await doc(b), before);
  await reset(b);
  await selectGroup(b);
  assert.equal(await paste(b, "# Replacement", "<p><u>HTML must not win</u></p>"), true);
  assert.deepEqual(await blocks(b), [{ type: "heading", text: "Replacement", marks: [] }, { type: "paragraph", text: "Gamma", marks: [] }]);
  await undo();
  assert.deepEqual(await doc(b), before);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(clipEditor)");
});

test("W5-10-PGP-02: paste keeps URL, marked HTML, structured Markdown and Shift priorities with no empty writes", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const empty = { type: "doc", content: [{ type: "paragraph" }] };
  await reset(b, empty);
  assert.equal(await paste(b, "https://example.com/path", "<p><strong>Wrong HTML</strong></p>"), true);
  assert.deepEqual(await blocks(b), [{ type: "bookmark", text: "", marks: [] }]);
  assert.equal(await b.evaluate("clipEditor.view.state.doc.firstChild.attrs.href"), "https://example.com/path");
  await reset(b, empty);
  await paste(b, "# Markdown", "<p><u>Underlined HTML</u></p>");
  assert.deepEqual(await blocks(b), [{ type: "paragraph", text: "Underlined HTML", marks: [{ type: "underline", attrs: {} }] }]);
  await reset(b, empty);
  await paste(b, "# Markdown", "<p><strong>Wrong HTML</strong></p>");
  assert.deepEqual(await blocks(b), [{ type: "heading", text: "Markdown", marks: [] }]);
  await reset(b, empty);
  await paste(b, "Plain", "<p><strong>Rich HTML</strong></p>");
  assert.deepEqual(await blocks(b), [{ type: "paragraph", text: "Rich HTML", marks: [{ type: "strong", attrs: {} }] }]);
  await reset(b, empty);
  await paste(b, "# **Literal**", "<p><u>Wrong HTML</u></p>", true);
  assert.deepEqual(await blocks(b), [{ type: "paragraph", text: "# **Literal**", marks: [] }]);
  await reset(b, empty);
  const before = await doc(b);
  await paste(b, "");
  await b.evaluate(`(() => {const data=new DataTransfer();data.items.add(new File(['ignored'],'fixture.bin',{type:'application/octet-stream'}));clipEditor.view.dom.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`);
  assert.deepEqual(await doc(b), before);
  assert.equal(await b.evaluate("clipChanges"), 0);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(clipEditor)");
});

test("W5-10-PGP-03: image paste wins over text, drop uses its point, destroy discards the read and remount accepts paste", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  // The existing W2-18-PAGES-TRANSIENT-01 separately proves delayed mapping and document replacement.
  await b.evaluate(`window.imageData=()=>{
    const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    const data=new DataTransfer();data.items.add(new File([bytes],'fixture.png',{type:'image/png'}));data.setData('text/plain','# Wrong text');return data;
  };undefined`);
  await b.evaluate("clipEditor.view.dom.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:imageData()}))");
  await b.waitFor("clipEditor.view.state.doc.content.content.some(node=>node.type.name==='image')");
  assert.equal(await b.evaluate("clipEditor.view.state.doc.textContent"), "AlphaBetaGamma");
  await reset(b);
  assert.equal(await b.evaluate(`(() => {
    const doc=clipEditor.view.state.doc,rect=clipEditor.view.nodeDOM(doc.content.size-doc.lastChild.nodeSize).getBoundingClientRect();
    const args={bubbles:true,cancelable:true,dataTransfer:imageData(),clientX:rect.left+4,clientY:(rect.top+rect.bottom)/2};
    const over=new DragEvent('dragover',args);clipEditor.view.dom.dispatchEvent(over);
    const drop=new DragEvent('drop',args);clipEditor.view.dom.dispatchEvent(drop);return over.defaultPrevented&&drop.defaultPrevented;
  })()`), true);
  await b.waitFor("clipEditor.view.state.doc.content.content.some(node=>node.type.name==='image')");
  assert.deepEqual(await b.evaluate("clipEditor.view.state.doc.content.content.map(node=>node.type.name==='image'?'[image]':node.textContent)"), ["Alpha", "Beta", "Gamma", "[image]"]);
  await reset(b);
  await b.evaluate(`(() => {
    const read=FileReader.prototype.readAsDataURL;window.clipReadEnded=false;
    FileReader.prototype.readAsDataURL=function(file){this.addEventListener('loadend',()=>window.clipReadEnded=true,{once:true});read.call(this,file);};
    clipEditor.view.dom.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:imageData()}));
    FileReader.prototype.readAsDataURL=read;
    window.oldClipEditor=clipEditor;window.MolisWorkPagesEditor.destroy(clipEditor);
    clipEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#clipboard-fixture'),clipOptions);clipEditor.view.focus();
  })()`);
  await b.waitFor("clipReadEnded");
  await paste(b, "Current ");
  await b.waitFor("clipEditor.view.state.doc.firstChild.textContent==='Current Alpha'");
  assert.equal(await b.evaluate("oldClipEditor.view.state.doc.content.content.some(node=>node.type.name==='image')"), false);
  assert.deepEqual(await blocks(b), ["Current Alpha", "Beta", "Gamma"].map(text => ({ type: "paragraph", text, marks: [] })));
  assert.equal(await b.evaluate("clipChanges"), 1);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(clipEditor)");
});
