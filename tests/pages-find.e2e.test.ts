import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

// W5-10-PGF-01: exercise the public mount/view contract from the host's real bundled editor asset.

async function press(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) {
    await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
  }
}

async function fill(b: Browser, selector: string, value: string) {
  await b.evaluate(`(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    input.focus(); input.value=${JSON.stringify(value)};
    input.dispatchEvent(new InputEvent('input',{bubbles:true}));
  })()`);
}

test("W5-10-PGF-02: find cycles, replaces and undoes through the bundled editor; closing and remounting release its bar", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  // Mount the public editor on Home, where no hidden Pages stage can capture its overlays.
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  assert.equal(await b.evaluate("document.querySelector('[data-pages-stage-workspace],[data-pages=workbench]')===null"), true);
  await b.evaluate(`new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('Editor asset failed to load'));document.head.append(script);
  })`);
  await b.waitFor("typeof window.MolisWorkPagesEditor?.mount === 'function'");
  await b.evaluate(`(() => {
    const root=document.createElement('div'); root.id='find-editor-fixture'; document.body.append(root);
    window.findEditor=window.MolisWorkPagesEditor.mount(root,{doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'alpha beta alpha gamma alpha'}]}]}});
    findEditor.view.focus();
  })()`);
  const mod = await b.evaluate<number>("/Mac/.test(navigator.platform) ? 4 : 2");
  const query = ".pages-find input[type=search]";
  const replacement = ".pages-find input[type=text]";
  const text = () => b.evaluate<string>("findEditor.view.state.doc.textContent");
  const count = (value: string) => b.waitFor(`document.querySelector('.pages-find-count')?.textContent===${JSON.stringify(value)}`);
  const openFind = async () => {
    await b.evaluate("findEditor.view.focus()");
    await press(b, "f", "KeyF", 70, mod);
    await b.waitFor("document.activeElement===document.querySelector('.pages-find input[type=search]') && !document.querySelector('.pages-find').hidden");
  };
  const undo = async () => {
    await b.evaluate("findEditor.view.focus()");
    await press(b, "z", "KeyZ", 90, mod);
    assert.equal(await text(), "alpha beta alpha gamma alpha");
  };

  await openFind();
  await fill(b, query, "ALPHA");
  await count("1/3");
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit').length"), 3);
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit.is-current').length"), 1);
  await press(b, "Enter", "Enter", 13);
  await count("2/3");
  await press(b, "Enter", "Enter", 13, 8);
  await count("1/3");
  await press(b, "Enter", "Enter", 13, 8);
  await count("3/3");
  await press(b, "Enter", "Enter", 13);
  await count("1/3");
  await fill(b, replacement, "delta");
  await b.click(".pages-find button:first-of-type");
  assert.equal(await text(), "delta beta alpha gamma alpha");
  await count("1/2");
  await undo();

  await openFind();
  assert.equal(await b.evaluate("document.querySelector('.pages-find input[type=text]').value"), "delta");
  await b.click(".pages-find button:last-of-type");
  assert.equal(await text(), "delta beta delta gamma delta");
  await count("0");
  assert.equal(await b.evaluate("document.querySelectorAll('#find-editor-fixture .pages-find-hit').length"), 0);
  await undo();

  await openFind();
  await fill(b, replacement, "");
  await press(b, "Enter", "Enter", 13, mod);
  assert.equal(await text(), " beta  gamma ", "an empty replacement deletes each current match once");
  await undo();
  await openFind();
  await press(b, "Escape", "Escape", 27);
  assert.equal(await b.evaluate("document.querySelector('.pages-find').hidden && document.activeElement===findEditor.view.dom"), true);
  await openFind();
  await count("1/3");
  await b.evaluate("window.MolisWorkPagesEditor.destroy(findEditor)");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-find').length"), 0);
  await b.evaluate(`(() => {
    findEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#find-editor-fixture'),{doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'beta only'}]}]}});
  })()`);
  await openFind();
  assert.equal(await b.evaluate("document.querySelector('.pages-find input[type=search]').value"), "");
  await fill(b, query, "beta");
  await count("1/1");
  assert.equal(await text(), "beta only");
  await b.evaluate("window.MolisWorkPagesEditor.destroy(findEditor);document.querySelector('#find-editor-fixture').remove()");
  assert.equal(await b.evaluate("document.querySelectorAll('.pages-find').length"), 0);
});
