import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ChromeHarness } from './fixtures/plugin-builder-browser.js';
import { validatePluginComponentPlans, resolvePluginComponentCall, PLUGIN_COMPONENT_STYLES } from '../packages/design-system/src/plugin-components.js';
import type { SandboxPluginContract } from '../packages/contracts/src/platform/plugin-sandbox.js';
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
    { id: 'title', pageId: 'home', regionId: 'main', intent: 'heading', purpose: '笔记', props: {}, kind: 'heading' },
    { id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '浏览笔记', props: { idField: 'id', titleField: 'text' }, read: { operationId: 'notes.list', input: {} }, kind: 'list' },
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
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id=notes] [data-pc-feedback=remove]').className`), 'pc-success', 'the result shows under the collection');
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
  const nodes = [{ id: 'answers', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '回答', props: { idField: 'id', titleField: 'title', textField: 'text' }, read: { operationId: 'answers.list', input: {} }, kind: 'list' }];
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
  const nodes = [{ id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '笔记', kind: 'list', props: { idField: 'id', titleField: 'text' }, read: { operationId: 'notes.list', input: {} } }];
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
  const nodes = [{ id: 'summary', pageId: 'home', regionId: 'main', intent: 'description', purpose: '本月合计', kind: 'text', props: {}, read: { operationId: 'summary.read', input: {} } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async()=>({total:86.5,byCategory:[{category:'餐饮',amount:56.5},{category:'交通',amount:30}]})}); await app.update(${JSON.stringify({ contract, nodes, connected: ['summary.read'] })});\n})()`);
    await page.wait(`document.querySelector('.pc-figures')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-figures > dt')].map(e=>e.textContent)`), ['本月总支出', '各分类合计']);
    assert.equal(await page.evaluate(`document.querySelector('.pc-figures > dd').textContent`), '86.5');
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-figures th')].map(e=>e.textContent)`), ['分类', '合计']);
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
  const nodes = [{ id: 'books', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, kind: 'list',
    read: { operationId: 'books.list', input: { status: { source: 'form', field: 'status' }, keyword: { source: 'form', field: 'keyword' } } } }];
  try {
    const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
    const page = await browser.page();
    await page.evaluate(`(async()=>{document.body.innerHTML='<style>'+${JSON.stringify(PLUGIN_COMPONENT_STYLES)}+'</style><div id="root"></div>'; ${compiled.outputFiles[0]!.text}; globalThis.asked=[]; const all=[{id:'a',title:'代码大全',status:'想读'},{id:'b',title:'人月神话',status:'在读'}]; globalThis.app=PluginUi.createPluginComponentClient({root:document.querySelector('#root'),call:async(id,binding,payload)=>{asked.push(payload.form);return all.filter(b=>(!payload.form.status||b.status===payload.form.status)&&(!payload.form.keyword||b.title.includes(payload.form.keyword)))}}); await app.update(${JSON.stringify({ contract: books, nodes, connected: ['books.list'] })});\n})()`);
    await page.wait(`document.querySelectorAll('[data-record-id]').length===2`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.pc-filter select option')].map(o=>o.textContent)`), ['全部', '想读', '在读', '读完']);
    assert.deepEqual(await page.evaluate(`asked[0]`), {}, 'an optional filter left at 全部 is not sent');
    await page.evaluate(`(()=>{const s=document.querySelector('.pc-filter select');s.value='在读';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
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
    await page.wait(`document.querySelector('[data-record-id="a"] dl')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-record-id="a"] dd')].map(dd=>dd.textContent)`), ['未打卡', '否'], 'a false value is still shown, not dropped as empty');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
