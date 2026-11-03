import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const docOf = (...content: object[]) => ({ type: "doc", content });
const original = docOf(...["Alpha", "Beta", "Gamma"].map(paragraph));
const labels = ["加粗", "斜体", "下划线", "删除线", "代码", "标题 1", "标题 2", "标题 3", "无序列表", "有序列表", "清单", "颜色", "链接", "评论"];

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  // W5-10-PGT-01: exercise the public handle from the formal host JS and CSS.
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='tools-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;max-width:90vw;margin:48px auto';
    const other=document.createElement('button');other.id='other-focus';other.textContent='Other';document.body.replaceChildren(root,other);
    window.toolCounts={change:0,tools:0,screen:0};window.toolTranslations=[];window.toolComments=[];
    window.toolOptions={doc:${JSON.stringify(original)},onChange:()=>toolCounts.change++,onTools:()=>toolCounts.tools++,onScreen:()=>toolCounts.screen++,onComment:id=>toolComments.push(id),
      translate:label=>{toolTranslations.push({label,editorExists:Boolean(root.querySelector('.ProseMirror'))});return label==='加粗'?'Bold fixture':label;}};
    window.toolEditor=window.MolisWorkPagesEditor.mount(root,toolOptions);toolEditor.view.focus();
    window.ToolTextSelection=toolEditor.view.state.selection.constructor;
  })()`);
  return b;
}

const snapshot = (b: Browser) => b.evaluate("window.MolisWorkPagesEditor.getDoc(toolEditor)");
const pressed = (b: Browser) => b.evaluate<string[]>("toolEditor.tools().flatMap(group=>group.items).filter(item=>item.pressed).map(item=>item.id)");
const reset = (b: Browser, doc: object = original) => b.evaluate(`(() => {
  window.MolisWorkPagesEditor.setDoc(toolEditor,${JSON.stringify(doc)});
  window.MolisWorkPagesEditor.focusStart(toolEditor);toolCounts.change=0;
})()`);
const selectText = (b: Browser, text: string, offset = 0, length = text.length) => b.evaluate(`(() => {
  const {view}=toolEditor;let at=-1;view.state.doc.descendants((node,pos)=>{if(at<0&&node.isText&&node.text===${JSON.stringify(text)})at=pos;});
  if(at<0)throw new Error('Selection text not found');at+=${offset};
  view.dispatch(view.state.tr.setSelection(ToolTextSelection.create(view.state.doc,at,at+${length})));view.focus();
})()`);
async function undo(b: Browser) {
  const modifiers = await b.evaluate<number>("/Mac|iP(hone|[oa]d)/.test(navigator.platform)?4:2");
  for (const type of ["keyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers }, b.sessionId);
}

test("W5-10-PGT-01/02: tools retain definition order, optional fields, translations and current pressed state", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  assert.deepEqual(await b.evaluate("toolTranslations.slice(3,17)"), labels.map(label => ({ label, editorExists: false })));
  assert.deepEqual(await b.evaluate("toolEditor.tools()"), [
    { id: "marks", collapse: "overflow", items: [
      { id: "strong", label: "Bold fixture", glyph: "B", pressed: false },
      { id: "em", label: "斜体", glyph: "I", pressed: false },
      { id: "underline", label: "下划线", glyph: "U", pressed: false },
      { id: "strike", label: "删除线", glyph: "S", pressed: false },
      { id: "code", label: "代码", icon: "code", pressed: false },
    ] },
    { id: "blocks", collapse: "overflow", items: [
      { id: "h1", label: "标题 1", glyph: "H1", pressed: false },
      { id: "h2", label: "标题 2", glyph: "H2", pressed: false },
      { id: "h3", label: "标题 3", glyph: "H3", pressed: false },
      { id: "ul", label: "无序列表", icon: "rows", pressed: false },
      { id: "ol", label: "有序列表", icon: "list-ordered", pressed: false },
      { id: "task", label: "清单", icon: "check", pressed: false },
    ] },
    { id: "insert", collapse: "never", items: [
      { id: "tone", label: "颜色", glyph: "A", opens: "panel" },
      { id: "link", label: "链接", icon: "link", opens: "panel" },
      { id: "comment", label: "评论", icon: "message", opens: "panel" },
    ] },
  ]);
  await reset(b, docOf({ type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "strong" }] }, { type: "text", text: " plain" }] }, paragraph("After")));
  await selectText(b, "Bold", 0, 10); assert.deepEqual(await pressed(b), []);
  await selectText(b, "Bold"); assert.deepEqual(await pressed(b), ["strong"]);
  await selectText(b, "Bold", 2, 0); assert.deepEqual(await pressed(b), []);
  await reset(b, docOf({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] }, paragraph("After")));
  await selectText(b, "Title"); assert.deepEqual(await pressed(b), ["h2"]);
  await reset(b, docOf({ type: "bullet_list", content: [{ type: "list_item", content: [paragraph("Item")] }] }, paragraph("After")));
  await selectText(b, "Item"); assert.deepEqual(await pressed(b), ["ul"]);
  const before = await b.evaluate("({doc:window.MolisWorkPagesEditor.getDoc(toolEditor),counts:{...toolCounts},translations:toolTranslations.length})");
  await b.evaluate("toolEditor.tools();toolEditor.screen();toolEditor.tools();toolEditor.screen()");
  assert.deepEqual(await b.evaluate("({doc:window.MolisWorkPagesEditor.getDoc(toolEditor),counts:{...toolCounts},translations:toolTranslations.length})"), before);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(toolEditor)");
});

test("W5-10-PGT-02: runTool changes the selection, preserves neighbors and undo, and routes the three panels", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  await selectText(b, "Alpha");
  const before = await snapshot(b);
  await b.evaluate("toolCounts.change=0;toolEditor.runTool('strong')");
  assert.deepEqual(await b.evaluate("toolEditor.view.state.doc.firstChild.firstChild.marks.map(mark=>mark.type.name)"), ["strong"]);
  assert.equal(await b.evaluate("toolCounts.change"), 1);
  assert.deepEqual(await b.evaluate("toolEditor.view.state.doc.content.content.slice(1).map(node=>node.textContent)"), ["Beta", "Gamma"]);
  assert.equal(await b.evaluate("toolEditor.view.state.doc.textBetween(toolEditor.view.state.selection.from,toolEditor.view.state.selection.to)"), "Alpha");
  assert.equal(await b.evaluate("document.activeElement===toolEditor.view.dom"), true);
  await undo(b); assert.deepEqual(await snapshot(b), before);
  await b.evaluate("toolEditor.runTool('h2')");
  assert.deepEqual(await b.evaluate("({type:toolEditor.view.state.doc.firstChild.type.name,level:toolEditor.view.state.doc.firstChild.attrs.level})"), { type: "heading", level: 2 });
  assert.deepEqual(await pressed(b), ["h2"]);
  await undo(b); assert.deepEqual(await snapshot(b), before);
  await b.evaluate("toolEditor.runTool('ul')");
  assert.deepEqual(await b.evaluate("toolEditor.view.state.doc.content.content.map(node=>[node.type.name,node.textContent])"), [["bullet_list", "Alpha"], ["paragraph", "Beta"], ["paragraph", "Gamma"]]);
  assert.deepEqual(await pressed(b), ["ul"]);
  await undo(b); assert.deepEqual(await snapshot(b), before);
  await b.evaluate("document.querySelector('#other-focus').focus()");
  const counts = await b.evaluate("({...toolCounts})");
  await b.evaluate("toolEditor.runTool('missing-tool')");
  assert.deepEqual(await snapshot(b), before);
  assert.deepEqual(await b.evaluate("({...toolCounts})"), counts);
  assert.equal(await b.evaluate("document.activeElement.id"), "other-focus");

  await selectText(b, "Alpha"); await b.evaluate("toolEditor.runTool('tone')");
  await b.waitFor("document.querySelector('.pages-pop:not([hidden]) [data-pages-tone=blue]')");
  await b.click('.pages-pop [data-pages-tone-kind="font_color"][data-pages-tone="blue"]');
  assert.deepEqual(await b.evaluate("toolEditor.view.state.doc.firstChild.firstChild.marks.map(mark=>({type:mark.type.name,attrs:mark.attrs}))"), [{ type: "font_color", attrs: { tone: "blue" } }]);
  assert.equal(await b.evaluate("document.querySelector('.pages-pop').hidden"), true);
  await undo(b); assert.deepEqual(await snapshot(b), before);
  await selectText(b, "Alpha"); await b.evaluate("toolEditor.runTool('link')");
  await b.waitFor("document.activeElement===document.querySelector('.pages-pop input[type=url]')");
  await b.evaluate("document.querySelector('.pages-pop input[type=url]').value='https://example.com/tools'");
  await b.click(".pages-pop-actions .mw-btn--primary");
  assert.equal(await b.evaluate("toolEditor.view.state.doc.firstChild.firstChild.marks.find(mark=>mark.type.name==='link')?.attrs.href"), "https://example.com/tools");
  assert.equal(await b.evaluate("document.querySelector('.pages-pop').hidden"), true);
  await undo(b); assert.deepEqual(await snapshot(b), before);
  await selectText(b, "Alpha"); await b.evaluate("toolEditor.runTool('comment')");
  const comment = await b.evaluate<{ ids: string[]; id: string; text: string }>("({ids:toolComments,id:toolEditor.view.state.doc.firstChild.firstChild.marks.find(mark=>mark.type.name==='comment')?.attrs.id,text:toolEditor.view.state.doc.firstChild.textContent})");
  assert.equal(comment.ids.length, 1); assert.ok(comment.id); assert.equal(comment.ids[0], comment.id); assert.equal(comment.text, "Alpha");
  assert.equal(await b.evaluate("toolEditor.view.state.doc.child(1).firstChild.marks.length"), 0);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(toolEditor)");
});

type Rect = { left: number; right: number; top: number; bottom: number };
async function rectangle(b: Browser) {
  const value = await b.evaluate<{ screen: Rect; dom: Rect }>(`(() => {
    const rect=getSelection().getRangeAt(0).getBoundingClientRect();
    return {screen:toolEditor.screen(),dom:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}};
  })()`);
  assert.deepEqual(Object.keys(value.screen).sort(), ["bottom", "left", "right", "top"]);
  for (const field of ["left", "right", "top", "bottom"] as const) {
    assert.ok(Number.isFinite(value.screen[field]));
    assert.ok(Math.abs(value.screen[field] - value.dom[field]) <= 2, `${field} follows the visible DOM selection: ${JSON.stringify(value)}`);
  }
  assert.ok(value.screen.right > value.screen.left); assert.ok(value.screen.bottom > value.screen.top);
  return value.screen;
}

test("W5-10-PGT-03: tools and screen follow setDoc, scroll and remount without acting on the old instance", { timeout: 90_000 }, async t => {
  const b = await mount(t);
  if (!b) return;
  await selectText(b, "Alpha"); await b.evaluate("toolEditor.runTool('strong')");
  await reset(b, docOf({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Fresh" }] }, paragraph("Neighbor")));
  await b.evaluate("document.documentElement.style.overflow='auto';document.body.style.cssText='height:auto;overflow:auto;display:block;min-height:2400px';document.querySelector('#tools-fixture').style.marginTop='420px'");
  await selectText(b, "Fresh");
  assert.deepEqual(await pressed(b), ["h2"]);
  const first = await rectangle(b);
  await b.evaluate("window.toolScreenBefore=toolCounts.screen;window.scrollBy(0,120)");
  await b.waitFor("toolCounts.screen>toolScreenBefore");
  await b.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const moved = await rectangle(b);
  assert.ok(first.top - moved.top > 100, "the selection rectangle follows the real document scroll");
  await b.evaluate("toolEditor.runTool('em')");
  assert.deepEqual(await b.evaluate("toolEditor.view.state.doc.firstChild.firstChild.marks.map(mark=>mark.type.name)"), ["em"]);
  assert.equal(await b.evaluate("toolEditor.view.state.doc.lastChild.textContent"), "Neighbor");
  const old = await snapshot(b);
  await b.evaluate(`(() => {window.oldToolEditor=toolEditor;window.MolisWorkPagesEditor.destroy(toolEditor);
    toolEditor=window.MolisWorkPagesEditor.mount(document.querySelector('#tools-fixture'),{...toolOptions,doc:${JSON.stringify(docOf(paragraph("Remount"), paragraph("After")))}});toolEditor.view.focus();})()`);
  await selectText(b, "Remount");
  assert.deepEqual(await pressed(b), []);
  await rectangle(b);
  await b.evaluate("toolEditor.runTool('h1')");
  assert.deepEqual(await pressed(b), ["h1"]);
  assert.equal(await b.evaluate("toolEditor.view.state.doc.firstChild.textContent"), "Remount");
  assert.equal(await b.evaluate("toolEditor.view.state.doc.lastChild.textContent"), "After");
  assert.deepEqual(await b.evaluate("window.MolisWorkPagesEditor.getDoc(oldToolEditor)"), old);
  await b.evaluate("window.MolisWorkPagesEditor.destroy(toolEditor)");
});
