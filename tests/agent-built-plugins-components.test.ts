import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ChromeHarness } from './fixtures/plugin-builder-browser.js';
import { validatePluginComponentPlans, resolvePluginComponentCall, PLUGIN_COMPONENT_STYLES } from '../packages/design-system/src/plugin-components.js';
import type { SandboxPluginContract } from '../packages/contracts/src/platform/plugin-sandbox.js';
/** The acceptance driver, loaded when a test needs it (one reference to its source for the whole file). */
const loadDriver = () => import('../apps/local-host/src/plugin-builder/browser.js');
const contract: SandboxPluginContract = {
  version: 1, pluginId: 'test.components', revision: 'one', entities: [], acceptance: [],
  operations: [{ id: 'save', kind: 'command', input: { type: 'object', properties: { text: { type: 'string', maxLength: 100 }, enabled: { type: 'boolean' }, choice: { type: 'boolean', enum: [true, false] } }, required: ['text', 'enabled', 'choice'], additionalProperties: false }, output: { type: 'string' }, errors: [], effects: {}, examples: [{ input: { text: 'hello', enabled: false, choice: false }, output: 'saved' }] }],
  pages: [{ id: 'home', title: '编辑', regions: [{ id: 'body', title: '编辑', operationIds: ['save'] }] }],
};
const plan = { id: 'editor', pageId: 'home', regionId: 'body', intent: 'input' as const, purpose: '编辑文本', props: { title: '原始标题', submitLabel: '保存' }, submit: { operationId: 'save', input: { text: { source: 'form' as const, field: 'text' }, enabled: { source: 'form' as const, field: 'enabled' }, choice: { source: 'form' as const, field: 'choice' } } } };
test('component contracts reject unsupported bindings and resolve selected sources separately', () => {
  assert.equal(validatePluginComponentPlans([plan], contract).length, 1);
  assert.throws(() => validatePluginComponentPlans([{ ...plan, submit: { ...plan.submit, input: { ...plan.submit.input, text: { source: 'form', field: 'profile.name' } } } }], contract), /单层/);
  assert.throws(() => validatePluginComponentPlans([{ ...plan, submit: { ...plan.submit, input: { ...plan.submit.input, text: { source: 'event', field: 'value' } } } }], contract), /来源/);
  assert.throws(() => validatePluginComponentPlans([{ ...plan, read: plan.submit }], contract), /查询/);
  assert.deepEqual(resolvePluginComponentCall({ ...plan, kind: 'form', submit: { operationId: 'save', input: { text: { source: 'selection', componentId: 'topics', field: 'text' }, enabled: { source: 'selection', componentId: 'cards', field: 'enabled' } } } }, 'submit', { selection: { topics: { text: 'topic' }, cards: { enabled: false } } }), { operationId: 'save', input: { text: 'topic', enabled: false } });
});
test('real browser retains forms and focus, refreshes changed schemas, preserves failed input and submits false booleans', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`document.head.innerHTML='<meta name="viewport" content="width=device-width,initial-scale=1">';`);
    await page.evaluate(`(async()=>{document.body.innerHTML='<style>'+${JSON.stringify(PLUGIN_COMPONENT_STYLES)}+'</style><div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.payloads=[]; globalThis.fail=false; globalThis.view=${JSON.stringify({ contract, nodes: [{ ...plan, kind: 'form' }], connected: ['save'] })}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async(id,binding,payload)=>{if(globalThis.fail)throw Error('保存失败');payloads.push(payload);return 'saved'}}); await app.update(view);\n})()`);
    await page.fill('[name=text]', 'unfinished text');
    await page.evaluate(`(async()=>{globalThis.original=document.querySelector('[name=text]'); original.setSelectionRange(4,8); view.nodes[0].props.title='更新标题'; await app.update(view);\n})()`);
    assert.deepEqual(await page.evaluate(`({same:original===document.querySelector('[name=text]'),value:original.value,focused:document.activeElement===original,caret:original.selectionStart})`), { same: true, value: 'unfinished text', focused: true, caret: 4 });
    await page.evaluate(`document.querySelector('[name=choice]').value='false';`); await page.click('[type=submit]'); await page.wait('payloads.length===1');
    assert.deepEqual(await page.evaluate('payloads[0].form'), { text: 'unfinished text', enabled: false, choice: false });
    assert.equal(await page.evaluate(`document.querySelector('[name=text]').value`), '', 'a create form starts empty after a successful save');
    await page.evaluate(`document.querySelector('[name=text]').value='unfinished text'`);
    await page.evaluate(`fail=true`); await page.click('[type=submit]'); await page.wait(`document.querySelector('.pc-error')?.textContent==='保存失败'`);
    assert.equal(await page.evaluate(`document.querySelector('[name=text]').value`), 'unfinished text');
    await page.evaluate(`(async()=>{view.contract.revision='two';view.contract.operations[0].input.properties.text={type:'integer'};await app.update(view);\n})()`);
    assert.equal(await page.evaluate(`document.querySelector('[name=text]').type`), 'number');
    await page.evaluate(`(async()=>{view.nodes[0].props.title='<img src=x onerror="globalThis.injected=true">';await app.update(view);\n})()`);
    assert.equal(await page.evaluate(`document.querySelector('img')===null && globalThis.injected===undefined`), true);
    await page.viewport(390, 844, true);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=390'), true);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
test('real browser puts an action on each record it acts on, follows the view order and hides a single page switcher', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const records: SandboxPluginContract = {
    version: 1, pluginId: 'test.records', revision: 'one', entities: [], acceptance: [],
    operations: [
      { id: 'notes.list', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: {}, examples: [] },
      { id: 'notes.remove', kind: 'command', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: { type: 'boolean' }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '笔记', regions: [{ id: 'main', title: '笔记', operationIds: ['notes.list', 'notes.remove'] }] }],
  };
  const nodes = [
    { id: 'title', pageId: 'home', regionId: 'main', intent: 'heading', purpose: '笔记', props: {}, kind: 'frame' },
    { id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '浏览笔记', props: { idField: 'id', titleField: 'text' }, read: { operationId: 'notes.list', input: {} }, kind: 'directory' },
    { id: 'remove', pageId: 'home', regionId: 'main', intent: 'action', purpose: '删除选中的笔记', props: { submitLabel: '删除选中' }, submit: { operationId: 'notes.remove', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } }, kind: 'button' },
  ];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<style>'+${JSON.stringify(PLUGIN_COMPONENT_STYLES)}+'</style><div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.notes=[{id:'a',text:'第一条'},{id:'b',text:'写错了'}]; globalThis.view=${JSON.stringify({ contract: records, nodes, connected: ['notes.list', 'notes.remove'] })}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async(id,binding,payload)=>{if(binding==='read')return notes;notes=notes.filter(n=>n.id!==payload.selection.notes.id);return true}}); await app.update(view);\n})()`);
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.pc-tabs')).display`), 'none', 'one page needs no page switcher');
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id=remove]').getClientRects().length`), 0, 'the action has no block of its own');
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id] [data-pc-action=remove]')].map(b=>b.textContent)`), ['删除', '删除']);
    assert.equal(await page.evaluate(`document.querySelector('[data-pc-select]')`), null, 'nothing else consumes the selection, so there is no separate "choose"');
    await page.click('[data-record-id="b"] [data-pc-action=remove]');
    await page.wait(`document.querySelectorAll('[data-record-id]').length===1`);
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id=notes] [data-pc-feedback=remove]').classList.contains('pc-success')`), true, 'the result shows under the collection');
    await page.evaluate(`(async()=>{view.nodes=[view.nodes[1],view.nodes[0],view.nodes[2]];await app.update(view);\n})()`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-region > [data-component-id]')].map(e=>e.dataset.componentId)`), ['notes', 'title', 'remove'], 'parts follow the view order');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
test('real browser shows a model answer\'s emphasis without ever treating it as markup', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const records: SandboxPluginContract = { version: 1, pluginId: 'test.prose', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'answers.list', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '回答', regions: [{ id: 'main', title: '回答', operationIds: ['answers.list'] }] }] };
  const nodes = [{ id: 'answers', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '回答', props: { idField: 'id', titleField: 'title', textField: 'text' }, read: { operationId: 'answers.list', input: {} }, kind: 'directory' }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>[{id:'a',title:'提取练习',text:'## 方向\\n1. **关于目的** 为什么？\\n**<img src=x onerror="globalThis.injected=true">**'}]}); await app.update(${JSON.stringify({ contract: records, nodes, connected: ['answers.list'] })});\n})()`);
    await page.wait(`document.querySelector('[data-record-id="a"] p')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] p strong')].map(e=>e.textContent)`), ['关于目的', '<img src=x onerror="globalThis.injected=true">']);
    assert.equal(await page.evaluate(`document.querySelector('[data-record-id="a"] p').textContent.includes('**')||document.querySelector('[data-record-id="a"] p').textContent.includes('## ')`), false);
    assert.equal(await page.evaluate(`document.querySelector('img')===null&&globalThis.injected===undefined`), true);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('real browser: a table chosen for a titled list still shows the title, named from the contract', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const books: SandboxPluginContract = { version: 1, pluginId: 'test.titles', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'books.list', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string', description: '书名' }, author: { type: 'string' } } } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '书', regions: [{ id: 'main', title: '书', operationIds: ['books.list'] }] }] };
  const nodes = [{ id: 'books', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '书单', kind: 'table', props: { idField: 'id', titleField: 'title', columns: [{ field: 'author', label: '作者' }] }, read: { operationId: 'books.list', input: {} } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>[{id:'a',title:'人月神话',author:'Brooks'}]}); await app.update(${JSON.stringify({ contract: books, nodes, connected: ['books.list'] })});\n})()`);
    await page.wait(`document.querySelector('[data-record-id="a"]')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('thead th')].slice(0,2).map(th=>th.textContent)`), ['书名', '作者']);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] td')].slice(0,2).map(td=>td.textContent)`), ['人月神话', 'Brooks']);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('real browser: an error an earlier read left goes away once a read succeeds', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const contract: SandboxPluginContract = { version: 1, pluginId: 'test.retry', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'notes.list', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '笔记', regions: [{ id: 'main', title: '笔记', operationIds: ['notes.list'] }] }] };
  const nodes = [{ id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '笔记', kind: 'directory', props: { idField: 'id', titleField: 'text' }, read: { operationId: 'notes.list', input: {} } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.broken=true; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>{if(broken)throw Error('还没有接通的功能可以试用');return [{id:'a',text:'第一条'}]}}); await app.update(${JSON.stringify({ contract, nodes, connected: ['notes.list'] })});\n})()`);
    await page.wait(`document.querySelector('[data-pc-feedback=notes]').textContent==='还没有接通的功能可以试用'`);
    await page.evaluate(`(async()=>{broken=false;await app.refresh();\n})()`);
    await page.wait(`document.querySelector('[data-record-id="a"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-pc-feedback=notes]').textContent`), '');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('real browser shows a total and its breakdown as labelled figures, named from the contract', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const contract: SandboxPluginContract = { version: 1, pluginId: 'test.summary', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'summary.read', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false },
      output: { type: 'object', properties: { total: { type: 'number', description: '本月总支出' }, byCategory: { type: 'array', description: '各分类合计', items: { type: 'object', properties: { category: { type: 'string', description: '分类' }, amount: { type: 'number', description: '合计' } } } } } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '账', regions: [{ id: 'main', title: '账', operationIds: ['summary.read'] }] }] };
  const nodes = [{ id: 'summary', pageId: 'home', regionId: 'main', intent: 'description', purpose: '本月合计', kind: 'card', props: {}, read: { operationId: 'summary.read', input: {} } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>({total:86.5,byCategory:[{category:'餐饮',amount:56.5},{category:'交通',amount:30}]})}); await app.update(${JSON.stringify({ contract, nodes, connected: ['summary.read'] })});\n})()`);
    await page.wait(`document.querySelector('.pc-figures')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-figures dt')].map(e=>e.textContent)`), ['本月总支出', '各分类合计']);
    assert.equal(await page.evaluate(`document.querySelector('.pc-stat > dd').textContent`), '86.5', 'a figure is a tile with its label');
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-bar')].map(e=>e.querySelector('span').textContent+' '+e.querySelector('strong').textContent)`), ['餐饮 56.5', '交通 30'], 'a label and an amount per row read as bars');
    assert.equal(await page.evaluate(`document.querySelector('.pc-bars').getAttribute('aria-label')`), '分类 / 合计');
    assert.doesNotMatch(await page.evaluate<string>(`document.querySelector('[data-component-id=summary]').innerText`), /\{"/, 'never raw JSON');
    await page.evaluate(`(async()=>{const v=${JSON.stringify({ contract, nodes, connected: ['summary.read'] })};v.contract.revision='two';delete v.contract.operations[0].output.properties.byCategory.description;await app.update(v);\n})()`);
    await page.wait(`document.querySelector('.pc-figures-wide')`);
    assert.doesNotMatch(await page.evaluate<string>(`document.querySelector('[data-component-id=summary]').innerText`), /byCategory/, 'an undescribed list shows no raw key');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('real browser filters a collection by its read\'s own fields: 全部 first, re-read on every change', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const books: SandboxPluginContract = { version: 1, pluginId: 'test.books', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'books.list', kind: 'query', input: { type: 'object', properties: { status: { type: 'string', enum: ['想读', '在读', '读完'], description: '状态' }, keyword: { type: 'string', description: '书名包含' } }, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '书', regions: [{ id: 'main', title: '书', operationIds: ['books.list'] }] }] };
  const nodes = [{ id: 'books', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, kind: 'directory',
    read: { operationId: 'books.list', input: { status: { source: 'form', field: 'status' }, keyword: { source: 'form', field: 'keyword' } } } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<style>'+${JSON.stringify(PLUGIN_COMPONENT_STYLES)}+'</style><div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.asked=[]; const all=[{id:'a',title:'代码大全',status:'想读'},{id:'b',title:'人月神话',status:'在读'}]; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async(id,binding,payload)=>{asked.push(payload.form);return all.filter(b=>(!payload.form.status||b.status===payload.form.status)&&(!payload.form.keyword||b.title.includes(payload.form.keyword)))}}); await app.update(${JSON.stringify({ contract: books, nodes, connected: ['books.list'] })});\n})()`);
    await page.wait(`document.querySelectorAll('[data-record-id]').length===2`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-filter [data-pc-value]')].map(o=>o.textContent)`), ['全部', '想读', '在读', '读完'], 'a short set of choices shows as chips');
    assert.equal(await page.evaluate(`document.querySelector('.pc-filter [aria-checked=true]').textContent`), '全部');
    assert.deepEqual(await page.evaluate(`asked[0]`), {}, 'an optional filter left at 全部 is not sent');
    await page.click('.pc-filter [data-pc-value="在读"]');
    await page.wait(`document.querySelectorAll('[data-record-id]').length===1&&document.querySelector('[data-record-id="b"]')`);
    await page.fill('.pc-filter input[name=keyword]', '代码');
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id=books]').hasAttribute('data-pc-pending')`), true, 'typing says it is about to re-read');
    await page.wait(`!document.querySelector('[data-pc-pending]')&&document.querySelectorAll('[data-record-id]').length===0`);
    assert.deepEqual(await page.evaluate(`asked.at(-1)`), { status: '在读', keyword: '代码' });
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('real browser shows a field in the column\'s own words, and a plain boolean as 是/否, in tables and lists alike', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const habits: SandboxPluginContract = { version: 1, pluginId: 'test.habits', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'habits.list', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '习惯', regions: [{ id: 'main', title: '习惯', operationIds: ['habits.list'] }] }] };
  const columns = [{ field: 'name', label: '习惯' }, { field: 'checkedToday', label: '今日', values: { true: '已打卡', false: '未打卡' } }, { field: 'archived', label: '归档' }];
  const node = (kind: string) => ({ id: 'habits', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '习惯', props: { idField: 'id', titleField: 'name', columns }, read: { operationId: 'habits.list', input: {} }, kind });
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>[{id:'a',name:'早起',checkedToday:false,archived:false}]}); await app.update(${JSON.stringify({ contract: habits, nodes: [node('table')], connected: ['habits.list'] })});\n})()`);
    await page.wait(`document.querySelector('[data-record-id="a"]')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] td')].slice(0,3).map(td=>td.textContent)`), ['早起', '未打卡', '否']);
    await page.evaluate(`(async()=>{await app.update(${JSON.stringify({ contract: { ...habits, revision: 'two' }, nodes: [node('list')], connected: ['habits.list'] })});\n})()`);
    await page.wait(`document.querySelector('[data-record-id="a"] .pc-record-meta')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] .pc-tag')].map(tag=>tag.textContent)`), ['今日 未打卡', '归档 否'], 'a false value is still shown, not dropped as empty, and keeps its name for assistive technology');
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] .pc-tag')].map(tag=>tag.dataset.tone)`), ['gray', 'gray']);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('the acceptance driver works through catalog overlays: a sheet form, choice chips, an accordion and a confirmed delete', { timeout: 120_000 }, async t => {
  const { existsSync } = await import('node:fs');
  if (!['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].some(path => existsSync(path)) && !process.env.MOLIS_WORK_BUILDER_BROWSER) { t.skip('Chrome is required'); return; }
  const { createServer } = await import('node:http');
  const { runBuilderBrowserAcceptance } = await loadDriver();
  const tag = { type: 'string' as const, enum: ['设计', '阅读', '产品'], description: '标签' };
  const contract: SandboxPluginContract = { version: 1, pluginId: 'test.catalog', revision: 'one', entities: [], acceptance: [],
    operations: [
      { id: 'ideas.list', kind: 'query', input: { type: 'object', properties: { tag }, additionalProperties: false }, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, tag } } }, errors: [], effects: {}, examples: [] },
      { id: 'ideas.add', kind: 'command', input: { type: 'object', properties: { title: { type: 'string', maxLength: 60, description: '标题' }, description: { type: 'string', maxLength: 500, description: '描述' }, tag }, required: ['title', 'tag'], additionalProperties: false }, output: { type: 'object' }, errors: [], effects: {}, examples: [] },
      { id: 'ideas.remove', kind: 'command', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: { type: 'boolean' }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '灵感', regions: [{ id: 'main', title: '灵感', operationIds: ['ideas.list', 'ideas.add', 'ideas.remove'] }] }] };
  const nodes = [
    { id: 'title', pageId: 'home', regionId: 'main', intent: 'heading', purpose: '标题', props: { title: '灵感收集板' }, kind: 'frame' },
    { id: 'editor', pageId: 'home', regionId: 'main', intent: 'input', purpose: '记一条', props: { title: '记一条灵感', submitLabel: '保存' }, kind: 'sheet',
      submit: { operationId: 'ideas.add', input: { title: { source: 'form', field: 'title' }, description: { source: 'form', field: 'description' }, tag: { source: 'form', field: 'tag' } } } },
    { id: 'ideas', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '浏览', kind: 'accordion', props: { idField: 'id', titleField: 'title', textField: 'description', columns: [{ field: 'tag', label: '标签' }] },
      read: { operationId: 'ideas.list', input: { tag: { source: 'form', field: 'tag' } } } },
    { id: 'remove', pageId: 'home', regionId: 'main', intent: 'action', purpose: '删除选中的灵感', props: { submitLabel: '删除' }, kind: 'alert-dialog', submit: { operationId: 'ideas.remove', input: { id: { source: 'selection', componentId: 'ideas', field: 'id' } } } },
  ];
  const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
  const html = `<!doctype html><meta charset="utf-8"><style>${PLUGIN_COMPONENT_STYLES}</style><div id="root"></div><script>${compiled.outputFiles[0]!.text}
    let ideas=[],next=0;globalThis.__molisPluginPending=0;
    const call=async(id,binding,payload)=>{if(binding==='read')return ideas.filter(i=>!payload.form.tag||i.tag===payload.form.tag);
      if(id==='editor'){const idea={id:'i'+(++next),...payload.form};ideas=[idea,...ideas];return idea}
      if(id==='remove'){ideas=ideas.filter(i=>i.id!==payload.selection.ideas.id);return true}};
    PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call}).update(${JSON.stringify({ contract, nodes, connected: ['ideas.list', 'ideas.add', 'ideas.remove'] })}).then(()=>{globalThis.__molisPluginReady=true});</script>`;
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/';
  const acceptance = [
    { id: 'add', description: '在侧边面板里记一条，折叠列表里能读到', steps: [
      { action: 'fill', componentId: 'editor', field: 'title', value: '暗黑模式' }, { action: 'fill', componentId: 'editor', field: 'description', value: '所有插件跟随产品主题' },
      { action: 'fill', componentId: 'editor', field: 'tag', value: '阅读' }, { action: 'submit', componentId: 'editor' },
      { action: 'expect', componentId: 'ideas', text: '暗黑模式' }, { action: 'expect', componentId: 'ideas', text: '跟随产品主题' }] },
    { id: 'remove', description: '删除要先确认', steps: [
      { action: 'fill', componentId: 'editor', field: 'title', value: '临时' }, { action: 'fill', componentId: 'editor', field: 'tag', value: '产品' }, { action: 'submit', componentId: 'editor' },
      { action: 'select', componentId: 'ideas', text: '临时' }, { action: 'submit', componentId: 'remove' }, { action: 'expectAbsent', componentId: 'ideas', text: '临时' }] },
    { id: 'filter', description: '按标签筛选（选项可以写显示用词）', steps: [
      { action: 'fill', componentId: 'editor', field: 'title', value: '留白' }, { action: 'fill', componentId: 'editor', field: 'tag', value: '设计' }, { action: 'submit', componentId: 'editor' },
      { action: 'fill', componentId: 'editor', field: 'title', value: '慢读' }, { action: 'fill', componentId: 'editor', field: 'tag', value: '阅读' }, { action: 'submit', componentId: 'editor' },
      { action: 'fill', componentId: 'ideas', field: 'tag', value: '阅读' }, { action: 'expect', componentId: 'ideas', text: '慢读' }, { action: 'expectAbsent', componentId: 'ideas', text: '留白' }] },
  ];
  try {
    const result = await runBuilderBrowserAcceptance({ design: { acceptance }, nodes } as unknown as Parameters<typeof runBuilderBrowserAcceptance>[0], { url, signal: new AbortController().signal, reset: async () => {} });
    assert.deepEqual(result.cases.map(item => [item.id, item.passed, item.passed ? '' : item.detail]), [['add', true, ''], ['remove', true, ''], ['filter', true, '']]);
  } finally { server.close(); }
});

// Security invariant S-09 (docs/system/SECURITY-INVARIANTS.md): the acceptance browser asks the shared loopback check what counts as the host's own preview.
test("the acceptance browser opens only the host's own preview: another host, another scheme and a look-alike name are refused before any navigation", { timeout: 120_000 }, async t => {
  const { existsSync } = await import('node:fs');
  if (!['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].some(path => existsSync(path)) && !process.env.MOLIS_WORK_BUILDER_BROWSER) { t.skip('Chrome is required'); return; }
  const { runBuilderBrowserAcceptance } = await loadDriver();
  // The driver reads nothing of a build before it navigates: it refuses the address first.
  const build = { design: { acceptance: [] }, nodes: [] } as never;
  for (const url of ['http://example.com/', 'https://127.0.0.1/', 'file:///etc/hosts', 'http://localhost.evil.example/', 'http://127.0.0.2/', 'http://0.0.0.0/']) {
    await assert.rejects(runBuilderBrowserAcceptance(build, { url, signal: new AbortController().signal }), /界面验收只能打开宿主本机预览/, url);
  }
});

test('real browser fills a sentence the design wrote around a result, and never shows the raw template', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'builder-components-'));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { await rm(directory, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const contract: SandboxPluginContract = { version: 1, pluginId: 'test.water', revision: 'one', entities: [], acceptance: [],
    operations: [{ id: 'water.today', kind: 'query', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'object', properties: { count: { type: 'integer' } } }, errors: [], effects: {}, examples: [] }],
    pages: [{ id: 'home', title: '喝水', regions: [{ id: 'main', title: '喝水', operationIds: ['water.today'] }] }] };
  const nodes = [{ id: 'count', pageId: 'home', regionId: 'main', intent: 'description', purpose: '杯数', kind: 'card', props: { description: '今天已经喝了 {{count}} 杯' }, read: { operationId: 'water.today', input: {} } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>({count:3})}); await app.update(${JSON.stringify({ contract, nodes, connected: ['water.today'] })});\n})()`);
    await page.wait(`document.querySelector('.pc-filled')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id=count]').innerText.replace(/\\s+/g,' ').trim()`), '今天已经喝了 3 杯');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
