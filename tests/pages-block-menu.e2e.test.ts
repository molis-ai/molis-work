import assert from "node:assert/strict";
import test from "node:test";
import { pageTextScript } from "./fixtures/page-text.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const original = { type: "doc", content: ["Alpha", "Beta", "Gamma"].map(paragraph) };

async function press(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
}

async function choose(b: Browser, label: string) {
  const point = await b.evaluate<{ x: number; y: number; visible: boolean }>(`(() => {
    const button=[...document.querySelectorAll('.pages-block-menu:not([hidden]) button')].find(button=>button.textContent.trim()===${JSON.stringify(label)});
    if(!button || button.disabled) throw new Error('Menu action is unavailable');
    button.scrollIntoView({block:'nearest'});
    const rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;return {x,y,visible:button.contains(document.elementFromPoint(x,y))};
  })()`);
  assert.equal(point.visible, true, `menu action ${label} can receive the real click`);
  for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 }, b.sessionId);
}

test("SYS-48/W5-10-PGM-02: block menu navigates, changes the selected blocks, undoes, and releases its UI on remount", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PGM-01: load the formal host assets and mount the public editor contract.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='block-menu-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';document.body.replaceChildren(root);
    window.blockOptions={doc:${JSON.stringify(original)}};
    window.blockEditor=window.MolisWorkPagesEditor.mount(root,blockOptions);blockEditor.view.focus();
  })()`);
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const texts = () => b.evaluate<string[]>("blockEditor.view.state.doc.content.content.map(node=>node.textContent)");
  const open = async () => {
    await b.evaluate("blockEditor.view.focus()");
    await press(b, "/", "Slash", 191, mod);
    await b.waitFor("document.querySelector('.pages-block-menu:not([hidden])')!==null");
  };
  const reset = () => b.evaluate(`(() => {
    window.MolisWorkPagesEditor.setDoc(blockEditor,${JSON.stringify(original)});
    window.MolisWorkPagesEditor.focusStart(blockEditor);
  })()`);
  const undo = () => press(b, "z", "KeyZ", 90, mod);
  await open();
  assert.deepEqual(await b.evaluate("[...document.querySelectorAll('.pages-block-menu button')].map(button=>button.textContent.trim())"), ["转换为", "颜色", "创建副本", "备注", "上移", "下移", "删除"]);
  await press(b, "ArrowRight", "ArrowRight", 39);
  assert.equal(await b.evaluate("document.querySelector('.pages-block-menu button.is-on').textContent.trim()"), "返回");
  await press(b, "ArrowLeft", "ArrowLeft", 37);
  assert.equal(await b.evaluate("document.querySelector('.pages-block-menu button.is-on').textContent.trim()"), "转换为");
  await press(b, "ArrowRight", "ArrowRight", 39);
  await press(b, "ArrowDown", "ArrowDown", 40);
  await press(b, "ArrowDown", "ArrowDown", 40);
  await press(b, "Enter", "Enter", 13);
  assert.deepEqual(await b.evaluate("({type:blockEditor.view.state.doc.firstChild.type.name,level:blockEditor.view.state.doc.firstChild.attrs.level,text:blockEditor.view.state.doc.firstChild.textContent})"), { type: "heading", level: 1, text: "Alpha" });
  await undo();
  assert.equal(await b.evaluate("blockEditor.view.state.doc.firstChild.type.name"), "paragraph");

  await reset();
  await open();
  await choose(b, "颜色");
  await b.click(".pages-block-menu .pages-tone-strip:first-of-type [data-pages-tone=red]");
  assert.deepEqual(await b.evaluate("blockEditor.view.state.doc.firstChild.firstChild.marks.map(mark=>({type:mark.type.name,attrs:mark.attrs}))"), [{ type: "font_color", attrs: { tone: "red" } }]);
  assert.equal(await b.evaluate("blockEditor.view.state.doc.child(1).firstChild.marks.length"), 0);
  await undo();
  assert.equal(await b.evaluate("blockEditor.view.state.doc.firstChild.firstChild.marks.length"), 0);
  await open();
  await choose(b, "创建副本");
  assert.deepEqual(await texts(), ["Alpha", "Alpha", "Beta", "Gamma"]);
  await undo();
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await open();
  await choose(b, "删除");
  assert.deepEqual(await texts(), ["Beta", "Gamma"]);
  await undo();
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);

  await reset();
  await press(b, "ArrowDown", "ArrowDown", 40, 8);
  // The first arrow uses native text selection; wait for ProseMirror to observe selectionchange.
  await b.waitFor("!blockEditor.view.state.selection.empty");
  await press(b, "ArrowDown", "ArrowDown", 40, 8);
  await b.waitFor("document.querySelectorAll('#block-menu-fixture .is-block-selected').length===2");
  assert.equal(await b.evaluate("document.querySelectorAll('#block-menu-fixture .is-block-selected').length"), 2);
  await open();
  assert.deepEqual(await b.evaluate("[...document.querySelectorAll('.pages-block-menu button')].map(button=>button.textContent.trim())"), ["上移", "下移", "颜色", "转换为", "创建副本", "删除"]);
  await choose(b, "创建副本");
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Alpha", "Beta", "Gamma"]);
  await undo();
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await open();
  await press(b, "Escape", "Escape", 27);
  assert.equal(await b.evaluate("document.querySelector('.pages-block-menu').hidden"), true);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(blockEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-block-menu,.pages-block-handle,.pages-block-ghost').length"), 0);
  // SYS-48: the formal English translator keeps the editor action distinct from clipboard Copy.
  await b.evaluate(pageTextScript("en", "pages")); // Pages' editor runs in Pages' frame: its own English with the page's catalog
  await b.evaluate("blockOptions.translate=window.L; void (blockEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#block-menu-fixture'),blockOptions))");
  await open();
  await choose(b, "Duplicate");
  assert.deepEqual(await texts(), ["Alpha", "Alpha", "Beta", "Gamma"]);
  await undo();
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(blockEditor)");
});
