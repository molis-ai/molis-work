import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const doc = (...texts: string[]) => ({ type: "doc", content: texts.map(paragraph) });

async function openEditor(t: TestContext, texts: string[]) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return null;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  await b.evaluate(`new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('Editor asset failed to load'));document.head.append(script);
  })`);
  await b.evaluate(`Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{
    const css=document.createElement('link');css.rel='stylesheet';css.href=href;
    css.onload=resolve;css.onerror=()=>reject(new Error('Workbench styles failed to load'));document.head.append(css);
  })))`);
  // W5-10-PGI-01: the host's bundled editor and styles, mounted through its public contract in a visible fixture.
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='insert-editor-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';document.body.replaceChildren(root);
    window.insertOptions={doc:${JSON.stringify(doc(...texts))},pages:()=>[{id:'alpha-page',title:'Alpha spec'},{id:'beta-page',title:'Beta notes'}]};
    window.insertEditor=window.MolisWorkPagesEditor.mount(root,insertOptions);insertEditor.view.focus();
  })()`);
  return b;
}

async function press(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) {
    await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
  }
}

async function replaceDoc(b: Browser, ...texts: string[]) {
  await b.evaluate(`(() => {
    window.MolisWorkPagesEditor.setDoc(insertEditor,${JSON.stringify(doc(...texts))});
    const view=insertEditor.view,at=1+view.state.doc.firstChild.content.size;
    view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc,at)));view.focus();
  })()`);
}

test("W5-10-PGI-02: slash chooses the filtered block, mentions insert the selected document, and dismissal keeps existing text", { timeout: 90_000 }, async t => {
  const b = await openEditor(t, [""]);
  if (!b) return;
  const slash = ".pages-slash:not(.pages-mention-menu):not([hidden])";
  await b.command("Input.insertText", { text: "/code_block" }, b.sessionId);
  await b.waitFor(`document.querySelectorAll('${slash} button').length===1`);
  assert.equal(await b.evaluate(`document.querySelector('${slash} strong').textContent`), "代码");
  await press(b, "Enter", "Enter", 13);
  assert.equal(await b.evaluate("insertEditor.view.state.doc.firstChild.type.name"), "code_block");
  assert.equal(await b.evaluate("insertEditor.view.state.doc.textContent"), "");
  assert.equal(await b.evaluate(`document.querySelector('${slash}')===null`), true);

  await replaceDoc(b, "Before", "After");
  await b.command("Input.insertText", { text: " @Bet" }, b.sessionId);
  await b.waitFor("document.querySelectorAll('.pages-mention-menu:not([hidden]) button').length===1");
  assert.equal(await b.evaluate("document.querySelector('.pages-mention-menu:not([hidden]) strong').textContent"), "Beta notes");
  await press(b, "Tab", "Tab", 9);
  assert.deepEqual(await b.evaluate("({type:insertEditor.view.state.doc.firstChild.lastChild.type.name,attrs:insertEditor.view.state.doc.firstChild.lastChild.attrs})"), {
    type: "page_mention", attrs: { page_id: "beta-page", title: "Beta notes" },
  });
  assert.equal(await b.evaluate("insertEditor.view.state.doc.child(1).textContent"), "After");
  assert.equal(await b.evaluate("document.querySelector('.pages-mention-menu:not([hidden])')===null"), true);

  await replaceDoc(b, "Kept");
  await b.command("Input.insertText", { text: " /heading1" }, b.sessionId);
  await b.waitFor(`document.querySelector('${slash}')!==null`);
  await press(b, "Escape", "Escape", 27);
  assert.equal(await b.evaluate("insertEditor.view.state.doc.textContent"), "Kept", "Escape removes the slash token and its separator while keeping preceding text");
  await replaceDoc(b, "Before", "After");
  await b.command("Input.insertText", { text: " @Bet" }, b.sessionId);
  await b.waitFor("document.querySelector('.pages-mention-menu:not([hidden])')!==null");
  const point = await b.evaluate<{ x: number; y: number; visible: boolean }>(`(() => {
    const paragraph=document.querySelector('#insert-editor-fixture .ProseMirror p:last-child');
    const rect=paragraph.getBoundingClientRect(),x=rect.left+3,y=rect.top+rect.height/2;
    return {x,y,visible:paragraph.contains(document.elementFromPoint(x,y))};
  })()`);
  assert.equal(point.visible, true, "a visible part of the second paragraph is outside the mention menu");
  for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 }, b.sessionId);
  await b.waitFor("document.querySelector('.pages-mention-menu:not([hidden])')===null");
  assert.equal(await b.evaluate("insertEditor.view.state.doc.firstChild.textContent"), "Before ");
  assert.equal(await b.evaluate("insertEditor.view.state.doc.child(1).textContent"), "After");
  await b.evaluate("window.MolisWorkPagesEditor.destroy(insertEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-slash').length"), 0);
});

test("W5-10-PGI-03: gap input inserts between its original blocks, escapes empty input, undoes and remounts", { timeout: 90_000 }, async t => {
  const b = await openEditor(t, ["Before", "After"]);
  if (!b) return;
  const gap = "#insert-editor-fixture [data-pages-gap][data-after='0']";
  const openGap = async () => {
    await b.click(gap);
    await b.waitFor("document.activeElement===document.querySelector('.pages-provisional')");
  };
  const texts = () => b.evaluate<string[]>("insertEditor.view.state.doc.content.content.map(node=>node.textContent)");
  await openGap();
  await press(b, "Escape", "Escape", 27);
  assert.deepEqual(await texts(), ["Before", "After"]);
  assert.equal(await b.evaluate("document.querySelector('.pages-provisional')===null && document.activeElement===insertEditor.view.dom"), true);
  await openGap();
  await b.command("Input.insertText", { text: "Middle" }, b.sessionId);
  assert.deepEqual(await texts(), ["Before", "Middle", "After"]);
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  await press(b, "z", "KeyZ", 90, mod);
  assert.deepEqual(await texts(), ["Before", "After"]);
  await openGap();
  await b.command("Input.imeSetComposition", { text: "zhongwen", selectionStart: 8, selectionEnd: 8 }, b.sessionId);
  assert.deepEqual(await texts(), ["Before", "After"], "composition stays in the temporary input before a candidate is chosen");
  await b.command("Input.insertText", { text: "中文" }, b.sessionId);
  assert.deepEqual(await texts(), ["Before", "中文", "After"]);
  await press(b, "z", "KeyZ", 90, mod);
  assert.deepEqual(await texts(), ["Before", "After"]);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(insertEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-provisional,[data-pages-gap]').length"), 0);
  await b.evaluate("void (insertEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#insert-editor-fixture'),insertOptions))");
  await openGap();
  await b.command("Input.insertText", { text: "Again" }, b.sessionId);
  assert.deepEqual(await texts(), ["Before", "Again", "After"]);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(insertEditor)");
});
