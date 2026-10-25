import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-06 and VUX-23 (a keyboard equivalent for what a pointer does by dragging): Pages sizes a
// selected image, a table column and a layout column from the keyboard with Mod-Alt-Shift-← and →, through the same
// commands as their handles, and the handles name those keys. Each press reads the new width out once through the page's
// status region (window.molisAnnounce, the one copy feedback uses).

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const cell = (type: string, text: string) => ({ type, content: [paragraph(text)] });

async function mount(t: TestContext) {
  const b = await openGoalBrowser(t, true, undefined, null);
  if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  await b.evaluate(`Promise.all([
    new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}),
    Promise.all(['/assets/molis-work-workbench.css','/assets/molis-work-plugins/pages.css'].map(href=>new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.onload=resolve;css.onerror=reject;document.head.append(css)})))
  ]).then(()=>undefined)`);
  // A 400 × 100 picture, drawn here so it passes the editor's own image check.
  const src = await b.evaluate<string>("(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 400, 100); return c.toDataURL('image/png'); })()");
  const doc = { type: "doc", content: [
    { type: "table", content: [{ type: "table_row", content: [cell("table_header", "名称"), cell("table_header", "说明")] }, { type: "table_row", content: [cell("table_cell", "甲"), cell("table_cell", "乙")] }] },
    { type: "column_list", content: [{ type: "column", attrs: { width: 1 }, content: [paragraph("左栏")] }, { type: "column", attrs: { width: 1 }, content: [paragraph("右栏")] }] },
    { type: "image", attrs: { src, width: 0 } },
    paragraph("结尾"),
  ] };
  await b.evaluate(`(() => {
    const root=document.createElement('div');root.id='size-fixture';root.className='pages-editor-host';
    root.style.cssText='width:640px;margin:48px auto';document.body.replaceChildren(root);
    window.sizeEditor=window.MolisWorkPagesEditor.mount(root,{doc:${JSON.stringify(doc)},onChange:()=>{}});sizeEditor.view.focus();
    window.SizeSelection=sizeEditor.view.state.selection.constructor;
  })()`);
  return b;
}
const caretIn = (b: Browser, text: string) => b.evaluate(`(() => { const {view}=sizeEditor; let at=-1;
  view.state.doc.descendants((node,pos)=>{ if(at<0&&node.isText&&node.text===${JSON.stringify(text)}) at=pos; });
  view.dispatch(view.state.tr.setSelection(SizeSelection.create(view.state.doc,at+1))); view.focus(); })()`);
async function size(b: Browser, direction: "ArrowLeft" | "ArrowRight") {
  const mod = await b.evaluate<number>("/Mac|iP(hone|[oa]d)/.test(navigator.platform)?4:2");
  for (const type of ["rawKeyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key: direction, code: direction, windowsVirtualKeyCode: direction === "ArrowLeft" ? 37 : 39, modifiers: mod | 1 | 8 }, b.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 80));
}
const said = (b: Browser) => b.evaluate<string>("document.querySelector('[role=status].mw-sr-only')?.textContent ?? ''");
const attrs = (b: Browser) => b.evaluate<{ cols: number[]; shares: number[]; image: number }>(`(() => { const doc = sizeEditor.view.state.doc; const out = { cols: [], shares: [], image: -1 };
  doc.descendants((node) => { if (node.type.name === 'table_row' && !out.cols.length) node.forEach(c => out.cols.push(c.attrs.colwidth));
    if (node.type.name === 'column') out.shares.push(node.attrs.width); if (node.type.name === 'image') out.image = node.attrs.width; });
  return out; })()`);

test("VUX-06: Mod-Alt-Shift-← and → size a table column, a layout column and a selected image from the keyboard, and the handles name the keys", { timeout: 90_000 }, async (t) => {
  const b = await mount(t);
  if (!b) return;
  const keys = await b.evaluate<string[]>("[...document.querySelectorAll('#size-fixture :is(.pages-col-resize, .pages-column-resize, .pages-image-resize)')].map(h => h.getAttribute('aria-keyshortcuts'))");
  assert.ok(keys.length >= 4 && keys.every((value) => /^(Meta|Control)\+Alt\+Shift\+ArrowLeft (Meta|Control)\+Alt\+Shift\+ArrowRight$/.test(value ?? "")), `every handle names the keys: ${JSON.stringify(keys)}`);

  // A table column: from its drawn width, 32 px a press, every row together.
  await caretIn(b, "甲");
  const drawn = await b.evaluate<number>("Math.round(document.querySelector('#size-fixture td').getBoundingClientRect().width)");
  await size(b, "ArrowRight");
  let now = await attrs(b);
  assert.equal(now.cols[0], drawn + 32, "the first column widens by one step from where it was drawn");
  assert.equal(now.cols[1], 0, "the other column keeps sharing the row");
  assert.equal(await said(b), `列宽 ${drawn + 32} 像素`, "the new width is read out");
  assert.equal(await b.evaluate("Math.round(document.querySelector('#size-fixture tr + tr td').getBoundingClientRect().width)"), drawn + 32, "the cells under it follow");
  await size(b, "ArrowLeft");
  await size(b, "ArrowLeft");
  assert.equal((await attrs(b)).cols[0], drawn - 32);
  assert.equal(await b.evaluate("document.activeElement === sizeEditor.view.dom"), true, "the caret stays in the document");

  // A layout column: a twentieth of the pair a press; the last column moves its left edge.
  await caretIn(b, "左栏");
  await size(b, "ArrowRight");
  now = await attrs(b);
  assert.deepEqual(now.shares, [1.1, 0.9], "the left column takes from its neighbour");
  assert.equal(await said(b), "栏宽 55%");
  await caretIn(b, "右栏");
  await size(b, "ArrowRight");
  await size(b, "ArrowRight");
  assert.deepEqual((await attrs(b)).shares, [0.9, 1.1], "the last column widens by moving its left edge");
  assert.equal(await said(b), "栏宽 55%", "the share read out is the caret's column");

  // A selected image: from its drawn width; reaching the line, it fills the line again.
  // Select it the way a person does: a press on the picture.
  const at = await b.evaluate<{ x: number; y: number }>("(() => { const box = document.querySelector('#size-fixture .pages-image').getBoundingClientRect(); return { x: box.x + 40, y: box.y + 40 }; })()");
  for (const type of ["mousePressed", "mouseReleased"] as const) await b.command("Input.dispatchMouseEvent", { type, ...at, button: "left", clickCount: 1 }, b.sessionId);
  await b.waitFor("sizeEditor.view.state.selection.node?.type.name === 'image'", 5_000);
  const image = await b.evaluate<number>("Math.round(document.querySelector('#size-fixture .pages-image').getBoundingClientRect().width)");
  await size(b, "ArrowLeft");
  assert.equal((await attrs(b)).image, image - 32, "a selected image narrows by one step");
  assert.equal(await said(b), `宽度 ${image - 32} 像素`);
  assert.equal(await b.evaluate("Math.round(document.querySelector('#size-fixture .pages-image-frame').getBoundingClientRect().width)"), image - 32, "and is drawn so");
  const widths: number[] = [];
  for (let press = 0; press < 12 && (await attrs(b)).image !== 0; press++) { await size(b, "ArrowRight"); widths.push((await attrs(b)).image); }
  assert.equal(widths.at(-1), 0, `widened to the line, it fills the line again (${widths.join(" → ")})`);
  assert.equal(await said(b), "占满一行");
  assert.ok(widths.slice(0, -1).every((width, index) => width === image - 32 + (index + 1) * 32), `each press widens it by one step (${widths.join(" → ")})`);

  // Outside anything sizable the keys do nothing.
  const before = await attrs(b);
  await caretIn(b, "结尾");
  await size(b, "ArrowRight");
  assert.deepEqual(await attrs(b), before);
  assert.equal(await said(b), "占满一行", "and say nothing new");
});

test("SYS-08 Shift-Tab exposes Pages table and layout width handles with a visible focus outline", { timeout: 90_000 }, async t => {
  const b = await mount(t); if (!b) return;
  await caretIn(b, "结尾");
  await b.evaluate("const start=document.createElement('button'); start.id='focus-start'; start.textContent='Start'; document.body.append(start); start.focus()");
  const seen = new Set<string>();
  for (let step = 0; step < 15 && seen.size < 2; step++) {
    for (const type of ["rawKeyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 }, b.sessionId);
    const handle = await b.evaluate<{ kind: string; opacity: string; outline: string; focused: boolean }>(`(() => {
      const at = document.activeElement, style = getComputedStyle(at);
      return { kind: at.matches('.pages-column-resize') ? 'layout' : at.matches('.pages-col-resize') ? 'table' : '',
        opacity: style.opacity, outline: style.outlineStyle, focused: at.matches(':focus-visible') };
    })()`);
    if (!handle.kind) continue;
    assert.equal(handle.focused, true);
    assert.equal(handle.opacity, "1", `${handle.kind} handle is visible without hover`);
    assert.notEqual(handle.outline, "none", `${handle.kind} handle shows where keyboard focus is`);
    seen.add(handle.kind);
  }
  assert.deepEqual([...seen].sort(), ["layout", "table"], "both handles are reached with Shift-Tab");
});

test("VUX-23: each sizing handle is a vertical splitter that reads its value and takes ← → itself", { timeout: 90_000 }, async (t) => {
  const b = await mount(t);
  if (!b) return;
  const read = (selector: string) => b.evaluate<Record<string, string | null>>(`(() => { const h = document.querySelector(${JSON.stringify(selector)});
    return Object.fromEntries(['role', 'aria-orientation', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext'].map((name) => [name, h.getAttribute(name)])); })()`);
  const press = async (selector: string, key: "ArrowLeft" | "ArrowRight") => {
    await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    for (const type of ["rawKeyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: key === "ArrowLeft" ? 37 : 39 }, b.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 80));
    return b.evaluate<boolean>(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
  };
  const column = "#size-fixture .pages-column:first-child > .pages-column-resize", cell = "#size-fixture tr:first-child th:first-child .pages-col-resize", image = "#size-fixture .pages-image-resize";

  assert.deepEqual(await read(column), { role: "separator", "aria-orientation": "vertical", "aria-valuenow": "50", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuetext": "栏宽 50%" });
  assert.equal(await press(column, "ArrowRight"), true, "the handle keeps the focus");
  assert.deepEqual((await attrs(b)).shares, [1.1, 0.9], "→ on a layout column's handle widens it as the keys do");
  assert.equal((await read(column))["aria-valuenow"], "55");
  assert.equal((await read(column))["aria-valuetext"], "栏宽 55%");

  await b.evaluate(`document.querySelector(${JSON.stringify(cell)}).focus()`);
  const drawn = await b.evaluate<number>("Math.round(document.querySelector('#size-fixture th').getBoundingClientRect().width)");
  const before = await read(cell);
  assert.equal(before.role, "separator");
  assert.equal(before["aria-valuenow"], String(drawn), "a column without its own width reads the width it is drawn at");
  assert.deepEqual([before["aria-valuemin"], before["aria-valuemax"]], ["80", "640"]);
  assert.equal(await press(cell, "ArrowRight"), true);
  assert.equal((await attrs(b)).cols[0], drawn + 32);
  assert.equal((await read(cell))["aria-valuetext"], `列宽 ${drawn + 32} 像素`);

  await b.evaluate(`document.querySelector(${JSON.stringify(image)}).focus()`);
  const shown = await read(image);
  assert.equal(shown.role, "separator");
  assert.equal(shown["aria-valuetext"], "占满一行", "an image without its own width says it fills its line");
  assert.equal(await press(image, "ArrowLeft"), true);
  const width = (await attrs(b)).image;
  assert.ok(width > 0, `← narrows the image (${width})`);
  assert.equal((await read(image))["aria-valuenow"], String(width));
  assert.equal((await read(image))["aria-valuetext"], `宽度 ${width} 像素`);
  assert.equal(await said(b), `宽度 ${width} 像素`, "and is read out once, as the keys are");
});
