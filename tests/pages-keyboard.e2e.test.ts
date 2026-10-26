import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const docOf = (...content: object[]) => ({ type: "doc", content });
const original = docOf(...["Alpha", "Beta", "Gamma"].map(paragraph));

async function key(b: Browser, key: string, code: string, windowsVirtualKeyCode: number, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }, b.sessionId);
}

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PGK-01: public mount, formal host bundle and CSS; no internal source imports.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='keyboard-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';document.body.replaceChildren(root);
    window.keyChanges=0;window.keyOptions={doc:${JSON.stringify(original)},onChange:()=>keyChanges++};
    window.keyEditor=window.MolisWorkPagesEditor.mount(root,keyOptions);keyEditor.view.focus();
    window.KeyTextSelection=keyEditor.view.state.selection.constructor;
  })()`);
  return b;
}

const snapshot = (b: Browser) => b.evaluate("window.MolisWorkPagesEditor.getDoc(keyEditor)");
const blocks = (b: Browser) => b.evaluate("keyEditor.view.state.doc.content.content.map(node=>[node.type.name,node.textContent])");
const focused = (b: Browser) => b.evaluate("document.activeElement===keyEditor.view.dom");
const reset = (b: Browser, doc: object = original) => b.evaluate(`(() => {
  window.MolisWorkPagesEditor.setDoc(keyEditor,${JSON.stringify(doc)});
  window.MolisWorkPagesEditor.focusStart(keyEditor);keyChanges=0;
})()`);
const selectText = (b: Browser, text: string, offset = 0, length = 0) => b.evaluate(`(() => {
  const {view}=keyEditor;let at=-1;view.state.doc.descendants((node,pos)=>{if(at<0&&node.isText&&node.text===${JSON.stringify(text)})at=pos;});
  if(at<0)throw new Error('Selection text not found');at+=${offset};
  view.dispatch(view.state.tr.setSelection(KeyTextSelection.create(view.state.doc,at,at+${length})));view.focus();
})()`);
const modKey = (b: Browser) => b.evaluate<number>("/Mac|iP(hone|[oa]d)/.test(navigator.platform)?4:2");
async function group(b: Browser) {
  await key(b, "ArrowDown", "ArrowDown", 40, 8);
  await b.waitFor("!keyEditor.view.state.selection.empty");
  await key(b, "ArrowDown", "ArrowDown", 40, 8);
  await b.waitFor("document.querySelectorAll('#keyboard-fixture .is-block-selected').length===2");
}

test("W5-10-PGK-02/03: formatting, block shortcuts and history act on the current document and remounted editor", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const mod = await modKey(b), undo = () => key(b, "z", "KeyZ", 90, mod);
  await selectText(b, "Alpha", 0, 5);
  const before = await snapshot(b);
  await key(b, "b", "KeyB", 66, mod);
  const marked = await snapshot(b);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.firstChild.marks.map(mark=>mark.type.name)"), ["strong"]);
  assert.equal(await b.evaluate("keyChanges"), 1);
  await undo(); assert.deepEqual(await snapshot(b), before);
  await key(b, "y", "KeyY", 89, mod); assert.deepEqual(await snapshot(b), marked);
  await undo();
  await key(b, "Z", "KeyZ", 90, mod | 8); assert.deepEqual(await snapshot(b), marked);
  await key(b, "\\", "Backslash", 220, mod);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.firstChild.marks"), []);
  await undo(); assert.deepEqual(await snapshot(b), marked);

  await reset(b); await selectText(b, "Beta");
  await key(b, "d", "KeyD", 68, mod);
  assert.deepEqual(await blocks(b), [["paragraph", "Alpha"], ["paragraph", "Beta"], ["paragraph", "Beta"], ["paragraph", "Gamma"]]);
  await undo(); assert.deepEqual(await snapshot(b), before);
  await reset(b); await group(b);
  await key(b, "d", "KeyD", 68, mod);
  assert.deepEqual(await blocks(b), ["Alpha", "Beta", "Alpha", "Beta", "Gamma"].map(text => ["paragraph", text]));
  await undo(); assert.deepEqual(await snapshot(b), before);
  await reset(b);
  await key(b, "1", "Digit1", 49, mod | 1);
  assert.deepEqual(await blocks(b), [["heading", "Alpha"], ["paragraph", "Beta"], ["paragraph", "Gamma"]]);
  assert.equal(await b.evaluate("keyEditor.view.state.doc.firstChild.attrs.level"), 1);
  await key(b, "0", "Digit0", 48, mod | 1);
  assert.deepEqual(await snapshot(b), before);
  await key(b, "*", "Digit8", 56, mod | 8);
  assert.deepEqual(await blocks(b), [["bullet_list", "Alpha"], ["paragraph", "Beta"], ["paragraph", "Gamma"]]);
  await reset(b);
  await key(b, "(", "Digit9", 57, mod | 8);
  await key(b, "Enter", "Enter", 13, mod);
  assert.deepEqual(await b.evaluate("({type:keyEditor.view.state.doc.firstChild.type.name,checked:keyEditor.view.state.doc.firstChild.firstChild.attrs.checked})"), { type: "task_list", checked: true });

  await reset(b); await selectText(b, "Alpha", 0, 5);
  await key(b, "k", "KeyK", 75, mod);
  await b.waitFor("document.activeElement===document.querySelector('.pages-pop input[type=url]')");
  await key(b, "Escape", "Escape", 27);
  assert.equal(await focused(b), true);
  const old = await snapshot(b);
  await b.evaluate(`(() => {window.oldKeyEditor=keyEditor;window.MolisWorkPagesEditor.destroy(keyEditor);
    keyEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#keyboard-fixture'),{doc:${JSON.stringify(docOf(paragraph("New")))}});keyEditor.view.focus();})()`);
  await key(b, "1", "Digit1", 49, mod | 1);
  assert.deepEqual(await blocks(b), [["heading", "New"]]);
  assert.deepEqual(await b.evaluate("window.MolisWorkPagesEditor.getDoc(oldKeyEditor)"), old);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(keyEditor)");
});

test("W5-10-PGK-02: Enter and deletion preserve specialized handlers, task/base fallback, and group precedence", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const mod = await modKey(b), undo = () => key(b, "z", "KeyZ", 90, mod);
  await selectText(b, "Alpha", 2);
  await key(b, "Enter", "Enter", 13);
  assert.deepEqual(await blocks(b), ["Al", "pha", "Beta", "Gamma"].map(text => ["paragraph", text]));
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "pha");
  await reset(b, docOf({ type: "task_list", content: [{ type: "task_item", attrs: { checked: false }, content: [paragraph("Task")] }] }, paragraph("After")));
  await selectText(b, "Task", 2);
  await key(b, "Enter", "Enter", 13);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.content.content.map(node=>[node.type.name,node.textContent,node.attrs.checked])"), [["task_item", "Ta", false], ["task_item", "sk", false]]);
  assert.equal(await b.evaluate("keyEditor.view.state.doc.lastChild.textContent"), "After");
  await reset(b, docOf({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] }, paragraph("After")));
  await selectText(b, "Title", 5);
  await key(b, "Enter", "Enter", 13);
  assert.deepEqual(await blocks(b), [["heading", "Title"], ["paragraph", ""], ["paragraph", "After"]]);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.type.name"), "paragraph");
  await reset(b, docOf(paragraph("```ts"), paragraph("After")));
  await selectText(b, "```ts", 5);
  await key(b, "Enter", "Enter", 13);
  assert.deepEqual(await blocks(b), [["code_block", ""], ["paragraph", "After"]]);
  assert.equal(await b.evaluate("keyEditor.view.state.doc.firstChild.attrs.language"), "typescript");
  await reset(b); await selectText(b, "Alpha", 2);
  await key(b, "Enter", "Enter", 13, 8);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.content.content.map(node=>[node.type.name,node.text??''])"), [["text", "Al"], ["hard_break", ""], ["text", "pha"]]);

  for (const [name, code] of [["Backspace", 8], ["Delete", 46]] as const) {
    await reset(b); const before = await snapshot(b); await group(b);
    await key(b, name, name, code);
    assert.deepEqual(await blocks(b), [["paragraph", "Gamma"]]);
    await undo(); assert.deepEqual(await snapshot(b), before);
  }
  await reset(b, docOf(paragraph("Before"), { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] }));
  await selectText(b, "Title");
  await key(b, "Backspace", "Backspace", 8);
  assert.deepEqual(await blocks(b), [["paragraph", "Before"], ["paragraph", "Title"]]);
  await key(b, "Backspace", "Backspace", 8);
  assert.deepEqual(await blocks(b), [["paragraph", "BeforeTitle"]]);
  await reset(b, docOf(paragraph("")));
  await b.command("Input.insertText", { text: "#" }, b.sessionId);
  await b.command("Input.insertText", { text: " " }, b.sessionId);
  await b.waitFor("keyEditor.view.state.doc.firstChild.type.name==='heading'");
  await key(b, "Backspace", "Backspace", 8);
  assert.deepEqual(await blocks(b), [["paragraph", "# "]]);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(keyEditor)");
});

test("W5-10-PGK-02: Tab navigates table cells before other indentation and grows the final row once", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const mod = await modKey(b), undo = () => key(b, "z", "KeyZ", 90, mod);
  const cell = (text: string) => ({ type: "table_cell", content: [paragraph(text)] });
  const table = { type: "table", content: [{ type: "table_row", content: [cell("Left"), cell("Right")] }] };
  await reset(b, docOf(table, paragraph("After")));
  const before = await snapshot(b);
  await selectText(b, "Left");
  await key(b, "Tab", "Tab", 9);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "Right");
  await key(b, "Tab", "Tab", 9, 8);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "Left");
  assert.equal(await b.evaluate("keyChanges"), 0);
  await selectText(b, "Right");
  await key(b, "Tab", "Tab", 9);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.content.content.map(row=>row.content.content.map(cell=>cell.textContent))"), [["Left", "Right"], ["", ""]]);
  assert.equal(await b.evaluate("keyChanges"), 1);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "");
  assert.equal(await b.evaluate("keyEditor.view.state.doc.lastChild.textContent"), "After");
  assert.equal(await focused(b), true);
  await undo(); assert.deepEqual(await snapshot(b), before);
  await selectText(b, "Right");
  await key(b, "ArrowLeft", "ArrowLeft", 37, mod | 1);
  assert.deepEqual(await b.evaluate("keyEditor.view.state.doc.firstChild.firstChild.content.content.map(cell=>cell.textContent)"), ["Right", "Left"]);
  await undo(); assert.deepEqual(await snapshot(b), before);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(keyEditor)");
});

test("W5-10-PGK-02: code/container Tab and arrow navigation preserve selection, adjacent blocks and focus", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  const mod = await modKey(b), undo = () => key(b, "z", "KeyZ", 90, mod);
  await reset(b, docOf({ type: "code_block", attrs: { language: "typescript" }, content: [{ type: "text", text: "ab" }] }, paragraph("After")));
  await selectText(b, "ab", 1);
  const codeBefore = await snapshot(b);
  await key(b, "Tab", "Tab", 9);
  assert.equal(await b.evaluate("keyEditor.view.state.doc.firstChild.textContent"), "a  b");
  assert.equal(await b.evaluate("keyEditor.view.state.selection.from"), 4);
  await key(b, "Tab", "Tab", 9, 8);
  assert.deepEqual(await snapshot(b), codeBefore);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.from"), 2);

  await reset(b); await selectText(b, "Beta");
  await key(b, "Tab", "Tab", 9);
  assert.deepEqual(await blocks(b), [["toggle", "AlphaBeta"], ["paragraph", "Gamma"]]);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "Beta");
  await key(b, "Tab", "Tab", 9, 8);
  assert.deepEqual(await blocks(b), [["toggle", "Alpha"], ["paragraph", "Beta"], ["paragraph", "Gamma"]]);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "Beta");
  await reset(b);
  const plain = await snapshot(b);
  await key(b, "Tab", "Tab", 9);
  assert.deepEqual(await snapshot(b), plain);
  assert.equal(await focused(b), true);
  await selectText(b, "Beta");
  await key(b, "ArrowUp", "ArrowUp", 38, mod | 8);
  assert.deepEqual(await blocks(b), [["paragraph", "Beta"], ["paragraph", "Alpha"], ["paragraph", "Gamma"]]);
  await undo(); assert.deepEqual(await snapshot(b), plain);

  await reset(b, docOf(paragraph("Before"), { type: "horizontal_rule" }, paragraph("After")));
  await selectText(b, "Before", 6);
  await key(b, "ArrowRight", "ArrowRight", 39);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.node?.type.name"), "horizontal_rule");
  await key(b, "ArrowRight", "ArrowRight", 39);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "After");
  await selectText(b, "After", 5);
  await key(b, "ArrowDown", "ArrowDown", 40);
  assert.deepEqual(await blocks(b), [["paragraph", "Before"], ["horizontal_rule", ""], ["paragraph", "After"], ["paragraph", ""]]);
  assert.equal(await b.evaluate("keyEditor.view.state.selection.$from.parent.textContent"), "");
  assert.equal(await focused(b), true);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(keyEditor)");
});
