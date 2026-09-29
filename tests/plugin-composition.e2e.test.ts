import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { VISUAL_FOUNDATION_STYLES, renderIconSprite, PLUGIN_COMPONENT_STYLES, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from '@molis-ai/molis-work-design-system';
import { ChromeHarness } from './fixtures/plugin-builder-browser.js';
import { readingContract, readingNodes, readingPresentation, readingSamples } from './fixtures/plugin-composition.js';

test('composed reading plugin retains input, opens and returns from details, survives failures and layout changes', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'molis-composition-')), browser = await ChromeHarness.start(directory);
  assert.ok(browser, 'Chrome is required');
  const evidence = resolve('.impeccable/qa/review/plugin-composition'); await mkdir(evidence, { recursive: true });
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const view = { contract: readingContract, nodes: readingNodes, connected: readingContract.operations.map(op => op.id), presentation: readingPresentation };
    const html = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阅读摘记 · 可交互切片</title><style>' + VISUAL_FOUNDATION_STYLES + PLUGIN_COMPONENT_STYLES + 'body{margin:0;background:var(--page);color:var(--ink)}.preview-label{padding:12px 28px;color:var(--muted);font:12px sans-serif}#root{padding:32px;min-height:80vh;background:var(--paper)}@media(max-width:600px){#root{padding:20px}}</style>' + '<div hidden>' + renderIconSprite() + '</div>' + '<div class="preview-label">可交互切片 · 示例内容 · 数据仅保存在本页内存</div><main id="root"></main><script>' + compiled.outputFiles[0]!.text + '\n' + `globalThis.view=${JSON.stringify(view)};globalThis.rows=${JSON.stringify(readingSamples)};globalThis.fail=false;globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async(id,binding,payload)=>{if(binding==='read')return rows.filter(r=>r.title.includes(payload.form.query||''));if(fail)throw Error('保存失败，请重试');if(id==='remove'){rows=rows.filter(r=>r.id!==payload.selection.notes.id);return {removed:true}}rows.unshift({...payload.form,id:'n'+Date.now()});return rows[0]}});app.update(view);` + '</script></html>';
    await writeFile(join(evidence, 'reading.html'), html);
    const page = await browser.page(); await page.viewport(1440, 1000); await page.command('Page.navigate', { url: 'file://' + join(evidence, 'reading.html') });
    await page.wait('document.querySelectorAll("[data-record-id]").length===3');
    assert.equal(await page.evaluate('document.querySelector(".pc-detail-pane h2")!==null'), false);
    assert.equal(await page.evaluate('document.querySelector(".pc-layout").firstElementChild.dataset.componentId'), 'heading');
    await page.click('[data-record-id="one"] [data-pc-select]'); await page.wait('document.querySelector(".pc-detail-pane h2")?.textContent.includes("注意力")');
    await page.screenshot(join(evidence, 'desktop.png'));
    await page.evaluate('document.querySelector("[data-component-id=notes]").style.width="320px"');
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector(".pc-detail-back")).display!=="none"'), true, 'a narrow column uses the detail back path even on a wide viewport');
    assert.ok(await page.evaluate<number>('document.querySelector(".pc-detail-copy").getBoundingClientRect().width') > 280, 'body width follows the actual column, not the whole viewport');
    await page.evaluate('document.querySelector("[data-component-id=notes]").style.width=""');
    await page.evaluate('document.documentElement.dataset.resolvedTheme="dark"'); await page.screenshot(join(evidence, 'dark.png')); await page.evaluate('delete document.documentElement.dataset.resolvedTheme');
    await page.viewport(390, 844, true); await page.screenshot(join(evidence, 'mobile.png'));
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await page.click('[data-pc-back]');
    assert.equal(await page.evaluate('(()=>{const button=document.querySelector("[data-record-id=one] [data-pc-action=remove]"),label=button.querySelector("[data-slot=button-label]");return label.getBoundingClientRect().right<=button.getBoundingClientRect().right+1})()'), true, 'text actions do not inherit the directory icon-only width');
    await page.click('[data-record-id="two"] [data-pc-select]');
    assert.match(await page.evaluate<string>('document.querySelector(".pc-detail-pane h2").textContent'), /散步/);
    await page.click('[data-pc-back]'); await page.click('[data-pc-open="editor"]');
    await page.fill('[name=title]', '保留这段输入'); await page.fill('[name=text]', '内容不能因为修改布局或保存失败而消失');
    await page.evaluate('fail=true'); await page.click('dialog[open] [type=submit]'); await page.wait('document.querySelector("dialog[open] .pc-dialog-error")?.textContent.includes("保存失败")');
    assert.equal(await page.evaluate('document.querySelector("[name=title]").value'), '保留这段输入');
    await page.evaluate('(async()=>{const field=document.querySelector("[name=text]");field.focus();field.setSelectionRange(2,5);view.presentation.pages[0].layout.gap="tight";await app.update(view);})()');
    assert.deepEqual(await page.evaluate('({value:document.activeElement.value,caret:document.activeElement.selectionStart})'), {value:'内容不能因为修改布局或保存失败而消失',caret:2});
    await page.evaluate('fail=false'); await page.click('dialog[open] [type=submit]'); await page.wait('rows.length===4&&!document.querySelector("dialog[open]")');
    await page.viewport(1440,1000); await page.click('[data-record-id="one"] [data-pc-action="remove"]'); await page.click('[data-pc-confirm-yes]'); await page.wait('rows.length===3');
    assert.equal(await page.evaluate('document.querySelector(".pc-detail-pane h2")!==null'), false);
    await page.click('[data-record-id="two"] [data-pc-select]');
    await page.evaluate('(async()=>{view=structuredClone(view);view.nodes.find(node=>node.id==="notes").kind="card";view.presentation.parts.notes.kind="card";await app.update(view)})()');
    assert.match(await page.evaluate<string>('document.querySelector(".pc-detail-pane h2").textContent'), /散步/, 'switching the collection kind keeps a live detail pane');
    await page.evaluate('(async()=>{delete view.presentation;await app.update(view)})()');
    assert.equal(await page.evaluate('!!document.querySelector(".pc-layout")'), false);
    assert.equal(await page.evaluate('document.querySelectorAll("[data-record-id]").length'), 3);
    assert.equal(await page.evaluate('document.querySelector("[data-pc-open=editor]").classList.contains("mw-btn--primary")'), true, 'legacy presentation restores the original primary action');
    await page.evaluate(`(async()=>{app.destroy();const contract=structuredClone(view.contract);contract.operations.find(op=>op.id==='notes.list').output=contract.operations.find(op=>op.id==='notes.list').output.items;const node={...view.nodes.find(node=>node.id==='notes'),intent:'description',kind:'card'};app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>({id:'private-id',title:'完整文章',text:'对象返回的正文也应连续阅读',source:'读书摘记'})});await app.update({contract,nodes:[node],connected:['notes.list']})})()`);
    assert.equal(await page.evaluate('document.querySelector(".pc-single-record h2").textContent'), '完整文章');
    assert.match(await page.evaluate<string>('document.querySelector(".pc-single-record .pc-detail-copy").textContent'), /连续阅读/);
    assert.equal(await page.evaluate('document.querySelectorAll(".pc-stat").length'), 0);
    assert.doesNotMatch(await page.evaluate<string>('document.querySelector("#root").innerText'), /private-id/);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('visual inspection detects real viewport overflow and a covered action on the isolated canvas', { timeout: 90_000 }, async () => {
  const { createServer } = await import('node:http');
  const { inspectBuilderPresentation } = await import('../apps/local-host/src/plugin-builder/browser.js');
  let fault = false;
  const server = createServer((_request, response) => { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end('<!doctype html><html><style>body{margin:0}.pc-view{width:100%;min-height:200px}button{height:40px;width:120px}' + (fault ? 'body{width:2400px}.cover{position:absolute;top:0;left:0;width:120px;height:40px;background:black}' : '') + '</style><main class="pc-view"><div class="pc-page" data-page="home"><section data-component-id="notes"><span data-record-id="sample">示例</span><button>新建</button></section><section data-component-id="reader"><article class="pc-single-record">完整正文</article></section></div></main><div class="cover"></div><script>globalThis.__molisPluginReady=true;globalThis.__molisPluginPending=0</script></html>'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const build = { design: { contract: readingContract, acceptance: [{ id: 'visible', description: '示例显示', steps: [{ action: 'expect', componentId: 'notes', text: '示例' }, { action: 'expect', componentId: 'reader', text: '完整正文' }] }] }, nodes: readingNodes } as any;
  const options = { url: 'http://127.0.0.1:' + (server.address() as { port: number }).port, signal: new AbortController().signal };
  try {
    const clean = await inspectBuilderPresentation(build, options); assert.equal(clean.structural, true); assert.equal(clean.images.length, 6, 'captures the list and the completed article state');
    fault = true; const broken = await inspectBuilderPresentation(build, options); assert.equal(broken.structural, false); assert.ok(broken.issues.some(issue => issue.includes('横向溢出'))); assert.ok(broken.issues.some(issue => issue.includes('遮挡')));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('directory previews preserve full reading, overlay renaming preserves drafts, and reduced-motion feedback expires', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'molis-reading-controls-')), browser = await ChromeHarness.start(directory);
  assert.ok(browser, 'Chrome is required');
  const evidence = resolve('.impeccable/qa/review/plugin-composition/controls-fixture'); await mkdir(evidence, { recursive: true });
  try {
    const contract = structuredClone(readingContract), nodes = structuredClone(readingNodes), presentation = structuredClone(readingPresentation);
    contract.operations.push({ id: 'notes.read', kind: 'query', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, output: contract.operations[0]!.output.items!, effects: {}, examples: [], errors: [] });
    contract.pages[0]!.regions[0]!.operationIds.push('notes.read');
    nodes.push({ id: 'reader', pageId: 'home', regionId: 'main', intent: 'description', purpose: '读取完整摘记', kind: 'card', props: { titleField: 'title', textField: 'text' }, read: { operationId: 'notes.read', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } },
      { id: 'open', pageId: 'home', regionId: 'main', intent: 'action', purpose: '展开正文', kind: 'button', props: { submitLabel: '展开阅读' }, submit: { operationId: 'notes.read', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } }, outputPath: 'text' } });
    presentation.pages[0]!.layout = { layout: 'stack', children: nodes.map(node => ({ part: node.id })) }; presentation.parts.notes!.detail = false; presentation.parts.reader = { measure: 'reading' };
    const view = { contract, nodes, presentation, connected: contract.operations.map(op => op.id) };
    const html = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + VISUAL_FOUNDATION_STYLES + PLUGIN_COMPONENT_STYLES + 'body{margin:0;background:var(--paper)}#root{padding:20px}</style><div hidden>' + renderIconSprite() + '</div><main id="root"></main><script>'
      + `globalThis.view=${JSON.stringify(view)};globalThis.rows=${JSON.stringify(readingSamples)};globalThis.calls=[];globalThis.fail=false;globalThis.app=(${PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT})({root:document.querySelector('#root'),call:async(id,binding,payload)=>{calls.push({id,binding,payload});if(id==='notes')return rows;if(fail)throw Error('读取失败，请重试');if(id==='reader'||id==='open')return rows.find(row=>row.id===payload.selection.notes.id);return {saved:true}}});app.update(view);` + '</script></html>';
    await writeFile(join(directory, 'index.html'), html);
    const page = await browser.page(); await page.viewport(390, 844, true); await page.command('Page.navigate', { url: 'file://' + join(directory, 'index.html') });
    await page.wait('document.querySelectorAll("[data-record-id]").length===3');
    const preview = 'document.querySelector("[data-record-id=one] .pc-record-text")';
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector("[data-component-id=editor]>.pc-output")).display'), 'none', 'a relocated opener leaves no empty grid item');
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector("[data-pc-feedback=editor]")).display'), 'none');
    assert.equal(await page.evaluate(`getComputedStyle(${preview}).whiteSpace`), 'normal');
    assert.ok(await page.evaluate<number>(`${preview}.getBoundingClientRect().height / parseFloat(getComputedStyle(${preview}).lineHeight)`) <= 2.05, 'paragraphs in a long summary use at most two visual lines');
    assert.equal(await page.evaluate(`${preview}.textContent`), readingSamples[0]!.text, 'summary formatting never mutates the text');
    await page.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.click('[data-record-id=one] [data-pc-action=open]');
    await page.wait('document.querySelector(".pc-single-record .pc-detail-copy")?.textContent.includes("回头补地图")');
    assert.equal(await page.evaluate('calls.find(call=>call.id==="open").payload.selection.notes.id'), 'one', 'the first row action selects its own record without a separate click');
    assert.equal(await page.evaluate('document.querySelector(".pc-single-record .pc-detail-copy").textContent'), readingSamples[0]!.text);
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector(".pc-single-record .pc-detail-copy")).whiteSpace'), 'pre-wrap');
    await page.wait('document.querySelector("[data-pc-feedback=open]").textContent===""');
    assert.equal(await page.evaluate('matchMedia("(prefers-reduced-motion:reduce)").matches'), true, 'success clears independently of animation');
    await page.screenshot(join(evidence, 'mobile.png'));
    await page.viewport(1280, 900); await page.screenshot(join(evidence, 'desktop.png'));
    await page.evaluate('document.documentElement.dataset.resolvedTheme="dark"'); await page.screenshot(join(evidence, 'dark.png'));
    await page.evaluate('document.documentElement.dataset.resolvedTheme="light"');
    await page.click('[data-pc-open=editor]'); await page.fill('[name=text]', '改名时保留的草稿');
    await page.evaluate(`(async()=>{const field=document.querySelector('[name=text]');field.focus();field.setSelectionRange(2,4);view=structuredClone(view);view.nodes.find(node=>node.id==='editor').props={title:'写一条摘记',description:'保留自己的思考',submitLabel:'保存到摘记'};await app.update(view)})()`);
    assert.deepEqual(await page.evaluate('({text:document.activeElement.value,caret:document.activeElement.selectionStart,open:document.querySelector("dialog[open]")!==null})'), { text: '改名时保留的草稿', caret: 2, open: true });
    assert.equal(await page.evaluate('document.querySelector("[data-pc-open=editor]").textContent'), '写一条摘记');
    assert.equal(await page.evaluate('document.querySelector("dialog[open] h2").textContent'), '写一条摘记');
    assert.equal(await page.evaluate('document.querySelector("dialog[open] [type=submit]").textContent'), '保存到摘记');
    assert.equal(await page.evaluate('document.querySelector("dialog[open] [data-pc-overlay-description]").textContent'), '保留自己的思考');
    await page.fill('[name=title]', '验证保存提示'); await page.click('dialog[open] [type=submit]');
    await page.wait('document.querySelector("[data-pc-feedback=editor]").classList.contains("pc-success")');
    assert.ok(await page.evaluate<number>('document.querySelector("[data-pc-feedback=editor]").getBoundingClientRect().width') < 200, 'a header action feedback stays content-sized instead of becoming a full-width banner');
    await page.wait('document.querySelector("[data-pc-feedback=editor]").textContent===""');
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector("[data-pc-feedback=editor]")).display'), 'none', 'cleared feedback no longer holds a grid row');
    await page.evaluate(`(async()=>{view=structuredClone(view);view.nodes=view.nodes.filter(node=>node.id!=='reader');view.presentation.pages[0].layout.children=view.presentation.pages[0].layout.children.filter(node=>node.part!=='reader');await app.update(view)})()`);
    await page.viewport(390, 844, true);
    assert.equal(await page.evaluate(`getComputedStyle(${preview}).whiteSpace`), 'pre-wrap');
    assert.ok(await page.evaluate<number>(`${preview}.getBoundingClientRect().height / parseFloat(getComputedStyle(${preview}).lineHeight)`) > 2.05, 'a directory without a configured reader keeps its full content');
    await page.click('[data-record-id=one] [data-pc-action=open]');
    await page.wait('document.querySelector("[data-pc-feedback=open]").textContent!==""');
    await page.evaluate('fail=true'); await page.click('[data-record-id=two] [data-pc-action=open]');
    await page.wait('document.querySelector("[data-pc-feedback=open]").classList.contains("pc-error")');
    await page.evaluate('new Promise(resolve=>setTimeout(resolve,3600))');
    assert.match(await page.evaluate<string>('document.querySelector("[data-pc-feedback=open]").textContent'), /读取失败/, 'an earlier success timer must not clear a later error');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('G7 waits for selection reads before acting on a repainted record and refuses covered controls', { timeout: 45_000 }, async () => {
  const { createServer } = await import('node:http');
  const { runBuilderBrowserAcceptance } = await import('../apps/local-host/src/plugin-builder/browser.js');
  let calls = 0, covered = false;
  const server = createServer((request, response) => {
    if (request.url === '/action') { calls++; response.end('ok'); return; }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><style>button{height:40px}.cover{position:fixed;inset:0;background:white;z-index:10}</style>
      <main class="pc-view"><div class="pc-page" data-page="home"><section data-component-id="notes"></section><section data-component-id="open"><p data-pc-feedback="open"></p></section></div></main>${covered ? '<div class="cover"></div>' : ''}
      <script>globalThis.__molisPluginReady=true;globalThis.__molisPluginPending=0;function render(){document.querySelector('[data-component-id=notes]').innerHTML='<div data-record-id="one">示例<button data-pc-select onclick="choose()">选择</button><button data-pc-action="open" onclick="act()">展开</button></div>'}function choose(){globalThis.__molisPluginPending=1;document.querySelector('[data-pc-action]').disabled=true;setTimeout(()=>{render();globalThis.__molisPluginPending=0},250)}async function act(){await fetch('/action');const feedback=document.querySelector('[data-pc-feedback=open]');feedback.className='pc-success';feedback.textContent='已展开'}render()</script></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const build = { design: { contract: readingContract, acceptance: [{ id: 'open', description: '选择后展开', steps: [{ action: 'select', componentId: 'notes', text: '示例' }, { action: 'submit', componentId: 'open' }, { action: 'expect', componentId: 'open', text: '已展开' }] }] }, nodes: readingNodes } as any;
  const options = { url: 'http://127.0.0.1:' + (server.address() as { port: number }).port, signal: new AbortController().signal };
  try {
    const result = await runBuilderBrowserAcceptance(build, options);
    assert.equal(result.passed, true, JSON.stringify(result.cases)); assert.equal(calls, 1, 'exactly one operation after selection has settled');
    covered = true; const blocked = await runBuilderBrowserAcceptance(build, options);
    assert.equal(blocked.passed, false); assert.match(blocked.cases[0]!.detail, /被遮挡/); assert.equal(calls, 1, 'covered controls cause no operation');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
