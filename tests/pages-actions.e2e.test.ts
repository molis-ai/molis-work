import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// SYS-15-V1: selection, return to list and reopening keep the isolated document in sync with its shell.

// What the Assistant and the context bar read for the open document: Pages' own naming with its version and title,
// not the workbench's fallback (named_by: "workbench", kind and id only).
const namesItself = (title: string, version?: number) => `(() => {
  const context = JSON.parse(document.querySelector('[data-pages=workbench]').getAttribute('data-assistant-context') || 'null');
  const object = context && context.object;
  return Boolean(object && !context.named_by && context.surface_title === 'Pages' && object.kind === 'pages_document'
    && Number.isInteger(object.version) && ${version === undefined ? "true" : `object.version === ${version}`} && object.title === ${JSON.stringify(title)});
})()`;
// The workbench's fallback runs 250 ms after it opens an item and then reads the surfaces: give it time to (not) land.
const pastFallback = () => new Promise(resolve => setTimeout(resolve, 1200));

test("PAGESCTX-05: real unsaved long drafts keep their context through the child observer and parent, then save and switch cleanly", { timeout: 90000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
    target[key]=host=>{if(key==='pages'&&!host.side){const editor=window.MolisWorkPagesEditor;
      window.MolisWorkPagesEditor={...editor,mount(...args){return window.contextBudgetEditor=editor.mount(...args);}};}return factory(host);};return true;
  }});`);
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const documentOf = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const store = openPagesStore(homeDirectory);
  const a = store.create({ project_id: projectId!, title: '长稿"上下文', body: documentOf("已保存原稿") });
  const b = store.create({ project_id: projectId!, title: "另一个文档", body: documentOf("另一篇正文") });store.close();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${a.id}` }, sessionId));
  await pages.waitFor("window.contextBudgetEditor?.view && document.querySelector('[data-pages-title]')?.value === " + JSON.stringify(a.title));
  const parent = `JSON.parse(document.querySelector('[data-work-surface="pages"]')?.getAttribute('data-assistant-context')||'null')`;
  const child = "JSON.parse(document.querySelector('[data-pages=workbench]').getAttribute('data-assistant-context')||'null')";
  await waitFor(`(${parent})?.object?.id===${JSON.stringify(a.id)}`);
  await evaluate(`(() => {
    const original=window.fetch.bind(window),path='/projects/${projectId}/api/plugins/io.molis.work.pages/pages/${a.id}';let hold=true;const pending=[];
    window.fetch=(input,init)=>new URL(input instanceof Request?input.url:String(input),location.href).pathname===path&&(init?.method||input.method)==='POST'&&hold
      ?new Promise((resolve,reject)=>pending.push(()=>original(input,init).then(resolve,reject))):original(input,init);
    window.releaseBudgetSaves=async()=>{hold=false;await Promise.all(pending.splice(0).map(run=>run()));};
    window.restoreBudgetFetch=async()=>{window.fetch=original;await window.releaseBudgetSaves();};
  })()`);
  const edit = (text: string) => pages.evaluate(`(() => {const view=window.contextBudgetEditor.view;view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,view.state.schema.nodes.paragraph.create(null,view.state.schema.text(${JSON.stringify(text)}))));})()`);
  try {
    const long = '"'.repeat(44000);await edit(long);
    await waitFor(`(${parent})?.unsaved===true && (${parent})?.object?.id===${JSON.stringify(a.id)}`);
    const context = await evaluate<{ plugin_id: string; surface_title: string; object: { kind: string; id: string; version: number; title: string }; unsaved: boolean; draft_text: string }>(parent);
    const raw = await pages.evaluate<string>("document.querySelector('[data-pages=workbench]').getAttribute('data-assistant-context')");
    assert.ok(raw.length < 32000);assert.ok(context.draft_text.length < 20000);assert.ok(long.startsWith(context.draft_text));
    assert.deepEqual({ ...context, draft_text: undefined }, { plugin_id: "io.molis.work.pages", surface_title: "Pages", object: { kind: "pages_document", id: a.id, title: a.title, version: a.version }, unsaved: true, draft_text: undefined });
    assert.deepEqual(await pages.evaluate(child), context, "the actual child publication survives the unchanged parent path");
    assert.equal(await pages.evaluate("window.contextBudgetEditor.view.state.doc.textContent.length"), 44000, "only the excerpt shrinks, never the editor document");
    const oldSize = JSON.stringify({ ...context, draft_text: long.slice(0, 20000) }).length;
    assert.ok(oldSize >= 32000, "the former raw slice exceeded this same real parent's gate");
    const short = '短稿"\\😀';await edit(short);
    await waitFor(`(${parent})?.draft_text===${JSON.stringify(short)}`);
    assert.equal(await pages.evaluate(`(${child}).draft_text`), short);
    await evaluate("window.releaseBudgetSaves()");
    await pages.waitFor("document.querySelector('[data-pages-editor-status]').textContent==='已保存'");
    await waitFor(`(${parent})?.object?.id===${JSON.stringify(a.id)} && !(${parent}).unsaved && !('draft_text' in (${parent}))`);
    const savedVersion = await evaluate<number>(`(${parent}).object.version`);assert.ok(savedVersion > a.version);
    await pages.evaluate(`document.querySelector('button[data-page-id="${b.id}"]').click()`);
    await waitFor(`(${parent})?.object?.id===${JSON.stringify(b.id)} && !(${parent}).unsaved && !('draft_text' in (${parent}))`);
    assert.equal(await pages.evaluate("window.contextBudgetEditor.view.state.doc.textContent"), "另一篇正文");
    await pages.evaluate(`document.querySelector('button[data-page-id="${a.id}"]').click()`);
    await waitFor(`(${parent})?.object?.id===${JSON.stringify(a.id)} && (${parent}).object.version===${savedVersion} && !('draft_text' in (${parent}))`);
    assert.equal(await pages.evaluate("window.contextBudgetEditor.view.state.doc.textContent"), short);
    t.diagnostic(JSON.stringify({ originalDraftLength: long.length, oldSerializedLength: oldSize, retainedSerializedLength: raw.length, retainedExcerptLength: context.draft_text.length, originalVersion: a.version, savedVersion, parentId: a.id, homeDirectory }));
  } finally { await evaluate("window.restoreBudgetFetch()"); }
});

for (const width of [1440, 390]) {
  test(`Pages ${width}px: real create/edit, model candidate, restart and conflicting save`, { timeout: 90_000 }, async t => {
    const prompts: string[] = [];
    const browser = await openGoalBrowser(t, true, undefined, async prompt => { prompts.push(prompt); return "整理后的文稿：把讨论转成可执行的下一步。"; });
    if (!browser) return;
    const { command, sessionId, navigate, reloadPage, origin, projectId, homeDirectory } = browser;
    const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "pages");
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
    await browser.waitFor("document.querySelector('[data-plugin-id=pages]')");
    await browser.click('[data-plugin-strip] [data-plugin-id=pages]');
    await waitFor("document.querySelector('[data-pages-new]')");
    await click('[data-pages-new]');
    await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')");
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '项目讨论记录'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
    await click('[data-pages-editor] .ProseMirror');
    await command("Input.insertText", { text: "今天讨论了动作服务的使用流程，下一步需要验证真实执行。" }, sessionId);
    await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    await evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
    // The writing actions are the context toolbar's: 更多 lists every action for the selection, 总结 among them.
    await browser.waitFor("document.querySelectorAll('.mw-ctx:not([hidden]) .mw-btn[data-key]').length > 0");
    await browser.click('.mw-ctx:not([hidden]) [data-more]');
    await browser.waitFor("[...document.querySelectorAll('.mw-ctx-menu button')].some(button => button.querySelector('span').textContent.trim() === '总结')");
    await browser.evaluate(`[...document.querySelectorAll('.mw-ctx-menu button')].find(button => button.querySelector('span').textContent.trim() === '总结').click()`);
    await waitFor("document.querySelector('.pages-pop textarea')?.value.includes('整理后的文稿')");
    assert.equal(prompts.length, 1); assert.match(prompts[0]!, /今天讨论了动作服务/);
    const store = openPagesStore(homeDirectory);
    try {
      const page = store.list(projectId!)[0]!;
      assert.equal(page.title, "项目讨论记录");
      assert.match(JSON.stringify(page.body), /今天讨论/);
      assert.doesNotMatch(JSON.stringify(page.body), /整理后的文稿/, "candidate requires user confirmation");
    } finally { store.close(); }
    await evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === "插到后面").click()`);
    await waitFor("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('整理后的文稿') && document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    const saved = openPagesStore(homeDirectory);
    try { assert.match(JSON.stringify(saved.list(projectId!)[0]!.body), /整理后的文稿/); } finally { saved.close(); }
    await reloadPage();
    await browser.waitFor("document.querySelector('[data-plugin-id=pages]')");
    if (await browser.evaluate("document.body.dataset.desktopSurface") !== 'pages') {
      await browser.click('[data-plugin-strip] [data-plugin-id=pages]');
    }
    // The document being edited comes back by itself (specs/archive/page-interaction-flow: a plugin's page reopens the record that was open in it after a reload).
    await waitFor("document.querySelector('[data-pages-title]')?.value === '项目讨论记录' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('整理后的文稿')");
    // And Pages names it itself again, with its version and title.
    await waitFor(namesItself("项目讨论记录"));
    await pastFallback();
    assert.equal(await evaluate(namesItself("项目讨论记录")), true, "the reopened document keeps Pages' own naming");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    const output = reviewEvidenceUrl("action-service/"); await mkdir(output, { recursive: true });
    await writeFile(new URL(`pages-actions-${width}.png`, output), Buffer.from((await command<{data:string}>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
    const other = openPagesStore(homeDirectory);
    try { const page = other.list(projectId!)[0]!; other.update(page.id, { title: "另一窗口的新标题" }, projectId!); } finally { other.close(); }
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '当前未保存的草稿'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
    await waitFor("document.querySelector('[data-pages-note]').textContent.includes('其他窗口修改')");
    assert.equal(await evaluate("document.querySelector('[data-pages-title]').value"), "当前未保存的草稿");
    await click('[data-pages-back]');
    assert.equal(await evaluate("document.querySelector('[data-pages-stage-workspace]').hidden"), false);
    const final = openPagesStore(homeDirectory);
    try { assert.equal(final.list(projectId!)[0]!.title, "另一窗口的新标题"); } finally { final.close(); }
  });
}

test("the open page never saves over what it cannot show or has not seen: changed elsewhere, it redraws; unreadable, it stays read-only", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "pages");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const paragraph = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  // Seen with MiniMax-M3 before writes were checked: another editor's node names, stored as they were.
  const foreign = { type: "doc" as const, content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "原来的要点" }] }] }] }] };
  const setup = openPagesStore(homeDirectory);
  const [shown, unreadable] = (() => { try { return [setup.create({ project_id: projectId!, title: "别处会改的文档", body: paragraph("第一版正文") }), setup.create({ project_id: projectId!, title: "结构不对的文档", body: foreign })]; } finally { setup.close(); } })();
  const open = async (id: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${id}` }, sessionId));
    await waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')`);
  };
  await open(shown.id);
  await waitFor("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('第一版正文')");
  // Opened as its tab on a fresh page, the document is named by Pages, not by the workbench's fallback.
  await waitFor(namesItself("别处会改的文档", shown.version));
  await pastFallback();
  assert.equal(await evaluate(namesItself("别处会改的文档", shown.version)), true, "the workbench's fallback does not replace Pages' naming");
  // The Pages list hides it (the workbench takes its name off); back on its tab, Pages names it again.
  await browser.click('[data-tab-kind="plugin"][data-plugin="pages"] .tab-item-trigger');
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'");
  await browser.click(".tab-item[data-tab-kind=item][data-plugin=pages] .tab-item-trigger");
  await waitFor(namesItself("别处会改的文档", shown.version));
  await pastFallback();
  assert.equal(await evaluate(namesItself("别处会改的文档", shown.version)), true, "shown again, the document keeps Pages' own naming");
  // Another window saves a new version; coming back to this one shows it instead of keeping the old text under it.
  const other = openPagesStore(homeDirectory);
  const changed = (() => { try { return other.update(shown.id, { body: paragraph("另一个窗口的第二版"), expected_version: shown.version }, projectId!); } finally { other.close(); } })();
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('另一个窗口的第二版')");
  await waitFor(namesItself("别处会改的文档", changed.version));
  // A body the editor cannot show opens read-only with a note, and nothing is saved over it.
  await open(unreadable.id);
  await waitFor("/显示不了/.test(document.querySelector('[data-pages=workbench]').textContent) && document.querySelector('[data-pages-editor] .ProseMirror').getAttribute('contenteditable') === 'false'");
  await new Promise(resolve => setTimeout(resolve, 1200));
  const after = openPagesStore(homeDirectory);
  try {
    const stored = after.get(unreadable.id, projectId!);
    assert.equal(stored.version, unreadable.version, "never saved");
    assert.match(JSON.stringify(stored.body), /原来的要点/);
  } finally { after.close(); }
});
