import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Point = { x: number; y: number };
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const original = { type: "doc", content: ["Alpha", "Beta", "Gamma"].map(paragraph) };

async function key(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
}

async function mouse(b: Browser, type: string, point: Point, modifiers = 0, pressed = false) {
  await b.command("Input.dispatchMouseEvent", {
    type, ...point, button: type === "mouseMoved" && !pressed ? "none" : "left",
    buttons: pressed || type === "mousePressed" ? 1 : 0,
    ...(type === "mouseMoved" ? {} : { clickCount: 1 }), modifiers,
  }, b.sessionId);
}

async function grip(b: Browser) {
  const point = await b.evaluate<Point>(`(() => {
    const rect=dragEditor.view.nodeDOM(0).getBoundingClientRect();return {x:rect.left+16,y:rect.top+rect.height/2};
  })()`);
  await mouse(b, "mouseMoved", point);
  await b.waitFor("!document.querySelector('.pages-block-handle').hidden");
  return b.evaluate<Point>(`(() => {
    const element=document.querySelector('[data-pages-grip]'),rect=element.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    if(!element.contains(document.elementFromPoint(x,y)))throw new Error('Grip cannot receive the real pointer');
    return {x,y};
  })()`);
}

async function startDrag(b: Browser, modifiers = 0) {
  const start = await grip(b);
  const target = await b.evaluate<Point>(`(() => {
    const doc=dragEditor.view.state.doc,rect=dragEditor.view.nodeDOM(doc.content.size-doc.lastChild.nodeSize).getBoundingClientRect();
    return {x:${start.x},y:rect.bottom+10};
  })()`);
  await mouse(b, "mousePressed", start, modifiers);
  await mouse(b, "mouseMoved", { x: start.x, y: start.y + 8 }, modifiers, true);
  await mouse(b, "mouseMoved", target, modifiers, true);
  await b.waitFor("!document.querySelector('.pages-block-ghost').hidden && !!document.querySelector('.pages-drag-preview')");
  return target;
}

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PGH-01: public editor contract, formal host bundle and stylesheet.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='drag-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';document.body.replaceChildren(root);
    window.dragOptions={doc:${JSON.stringify(original)}};
    window.dragEditor=window.MolisWorkPagesEditor.mount(root,dragOptions);dragEditor.view.focus();
  })()`);
  return b;
}

test("W5-10-PGH-02: clicking the grip opens its menu without moving the block", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const before = await b.evaluate("window.MolisWorkPagesEditor.getDoc(dragEditor)");
  const point = await grip(b);
  await mouse(b, "mousePressed", point);
  await mouse(b, "mouseReleased", point);
  assert.equal(await b.evaluate("document.querySelector('.pages-block-menu').hidden"), false);
  assert.deepEqual(await b.evaluate("window.MolisWorkPagesEditor.getDoc(dragEditor)"), before);
  await key(b, "Escape", "Escape", 27);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(dragEditor)");
});

test("W5-10-PGH-02: real pointer previews without writing, moves or copies on release, cancels and remounts", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const texts = () => b.evaluate<string[]>("dragEditor.view.state.doc.content.content.map(node=>node.textContent)");
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const clean = async () => {
    assert.equal(await b.evaluate("document.querySelector('.pages-block-ghost').hidden && !document.querySelector('.pages-drag-preview') && !document.documentElement.classList.contains('is-pages-dragging')"), true);
  };
  let target = await startDrag(b);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await mouse(b, "mouseReleased", target);
  assert.deepEqual(await texts(), ["Beta", "Gamma", "Alpha"]);
  await clean();
  await key(b, "z", "KeyZ", 90, mod);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);

  target = await startDrag(b, 1);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await mouse(b, "mouseReleased", target, 1);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma", "Alpha"]);
  await clean();
  await key(b, "z", "KeyZ", 90, mod);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);

  target = await startDrag(b);
  await key(b, "Escape", "Escape", 27);
  await mouse(b, "mouseReleased", target);
  assert.deepEqual(await texts(), ["Alpha", "Beta", "Gamma"]);
  await clean();

  target = await startDrag(b);
  await b.evaluate("dragEditor.view.dispatch(dragEditor.view.state.tr.insertText('Changed ',1))");
  await mouse(b, "mouseReleased", target);
  assert.deepEqual(await texts(), ["Changed Alpha", "Beta", "Gamma"]);
  await clean();
  await b.evaluate("window.MolisWorkPagesEditor.destroy(dragEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-block-handle,.pages-block-menu,.pages-block-ghost,.pages-drag-preview').length"), 0);
  await b.evaluate("void (dragEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#drag-fixture'),dragOptions))");
  target = await startDrag(b);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(dragEditor)");
  await mouse(b, "mouseReleased", target);
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-block-handle,.pages-block-menu,.pages-block-ghost,.pages-drag-preview').length"), 0);
  assert.equal(await b.evaluate("document.documentElement.classList.contains('is-pages-dragging')"), false);
});
