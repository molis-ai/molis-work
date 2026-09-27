import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertContract } from '../packages/plugin-sandbox/dist/index.js';
import { BUILDER_PROMPTS, expandDesign, expandType, normalizeProposal, parseModelJson, parseStep, validateAgentDesign } from '../plugins/native/plugin-builder/src/index.js';

const base = { id: 'quick', title: '随手记', description: '写一句就保存', rationale: '最短路径', journey: ['写', '看'] };
const strict = (design: ReturnType<typeof expandDesign>) => validateAgentDesign(design, [], [], contract => assertContract(contract));

test('the designer prompt example is itself a valid design once the host expands it', () => {
  const text = BUILDER_PROMPTS.designer.text;
  const start = text.indexOf('【mode = "detail" 的完整回答示例】') + '【mode = "detail" 的完整回答示例】'.length;
  const example = text.slice(start, text.indexOf('\n\nmode = "propose"', start)).trim();
  const dropped: string[] = [];
  const design = strict(expandDesign(parseModelJson(example), base, 'io.molis.work.generated.example', 'r1', dropped));
  assert.deepEqual(dropped, [], 'the example must not rely on anything the host drops');
  assert.deepEqual(design.contract.operations.map(item => item.id), ['notes.list', 'notes.add', 'notes.remove']);
  assert.deepEqual(design.parts.find(part => part.id === 'remove')?.submit?.input, { id: { source: 'selection', componentId: 'notes', field: 'id' } });
  assert.deepEqual(design.acceptance[1]!.steps[2], { action: 'select', componentId: 'notes', text: '写错了' });
  assert.deepEqual(design.contract.operations[1]!.input.properties!.text, { type: 'string', minLength: 1, maxLength: 500, description: '笔记' });
});

test('type shorthand expands into strict schemas', () => {
  assert.deepEqual(expandType({ title: 'string(1..100) 书名', 'rating?': 'integer(1..5)', status: '未读|在读|已读', tags: 'string[]' }, 't'), {
    type: 'object', required: ['title', 'status', 'tags'], additionalProperties: false, properties: {
      title: { type: 'string', minLength: 1, maxLength: 100, description: '书名' }, rating: { type: 'integer', minimum: 1, maximum: 5 },
      status: { type: 'string', enum: ['未读', '在读', '已读'] }, tags: { type: 'array', items: { type: 'string' } } } });
  assert.deepEqual(expandType([{ id: 'string' }], 't'), { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } });
  const dropped: string[] = [];
  assert.deepEqual(expandType({ type: 'object', properties: { text: { type: 'string', minLength: 1, default: '' } }, required: ['text'] }, 'input', dropped),
    { type: 'object', properties: { text: { type: 'string', minLength: 1 } }, required: ['text'], additionalProperties: false }, 'a real JSON Schema is closed and cleaned');
  assert.deepEqual(dropped, ['input.text 的 default']);
  assert.throws(() => expandType({ 书名: 'string' }, 't'), /英文字母开头/);
  assert.throws(() => expandType('text(1..2)x', 't'), /无法识别/);
});

test('one-line acceptance steps parse, and a single-field form needs no field name', () => {
  const parts = [{ id: 'editor', pageId: 'home', regionId: 'main', intent: 'input' as const, purpose: 'p', props: {}, submit: { operationId: 'notes.add', input: { text: { source: 'form' as const, field: 'text' } } } }];
  assert.deepEqual(parseStep('fill editor = 你好', parts, 's'), { action: 'fill', componentId: 'editor', field: 'text', value: '你好' });
  assert.deepEqual(parseStep('fill editor.done = true', parts, 's'), { action: 'fill', componentId: 'editor', field: 'done', value: true });
  assert.deepEqual(parseStep('expect notes "你好"', parts, 's'), { action: 'expect', componentId: 'notes', text: '你好' });
  assert.deepEqual(parseStep('expect-not notes 你好', parts, 's'), { action: 'expectAbsent', componentId: 'notes', text: '你好' });
  assert.deepEqual(parseStep('select notes #n1', parts, 's'), { action: 'select', componentId: 'notes', recordId: 'n1' });
  assert.deepEqual(parseStep('expect notes 新的一条 before 旧的一条', parts, 's'), { action: 'expectOrder', componentId: 'notes', texts: ['新的一条', '旧的一条'] });
  assert.deepEqual(parseStep({ action: 'expect', componentId: 'notes', text: '你好', absent: true }, parts, 's'), { action: 'expectAbsent', componentId: 'notes', text: '你好' });
  assert.throws(() => parseStep('click somewhere', parts, 's'), /看不懂/);
});

test('examples that can never pass on an empty store are rejected before any code is written', () => {
  const design = { operations: [{ id: 'notes.list', kind: 'query', input: {}, output: [{ id: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [{ id: 'n1' }] }] }],
    pages: [{ id: 'home', parts: [{ id: 'notes', intent: 'collection', purpose: 'p', read: 'notes.list' }] }], acceptance: [{ id: 'a', steps: ['expect notes x'] }] };
  assert.throws(() => expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), /空存储/);
  const unused = { ...design, operations: [...design.operations.map(item => ({ ...item, examples: [{ input: {}, output: [] }] })), { id: 'notes.add', kind: 'command', input: { text: 'string' }, output: 'string', effects: ['storage'], examples: [{ input: { text: 'a' }, output: 'a' }] }] };
  assert.throws(() => expandDesign(unused, base, 'io.molis.work.generated.x', 'r', []), /没有任何组件使用/);
  const query = { ...design, operations: [{ ...design.operations[0], effects: { storage: ['write'] }, examples: [{ input: {}, output: [] }] }] };
  assert.throws(() => expandDesign(query, base, 'io.molis.work.generated.x', 'r', []), /查询（query）不能写入/);
});

test('real MiniMax answers written against the old format normalize into proposals or fail with a reason the model can act on', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/builder-designer/minimax-notes-v1.json', import.meta.url), 'utf8')) as { answers: string[] };
  let normalized = 0;
  for (const answer of fixture.answers) {
    let value: unknown;
    try { value = parseModelJson(answer); } catch (error) { assert.match(String(error), /不是完整 JSON，第 \d+ 个字符附近/); continue; }
    const candidates = (value as { candidates: unknown[] }).candidates;
    for (const [index, candidate] of candidates.entries()) {
      const dropped: string[] = [];
      try {
        const proposal = normalizeProposal(candidate, index, 'io.molis.work.generated.x', dropped);
        normalized++;
        assert.ok(proposal.id && proposal.journey.length && proposal.preview.parts.length, 'candidate-id / journal / separate parts are understood');
        assert.ok(proposal.preview.contract.operations.every(operation => operation.input.type === 'object'));
      } catch (error) { assert.match(String(error), /：/, 'a rejection names where and why'); }
    }
  }
  assert.ok(normalized >= 1, 'at least one real answer becomes a usable proposal');
});

test('a type hint in brackets may contain spaces', () => {
  // Real MiniMax answer (今日天气, round 5): three repairs over "string(YYYY-MM-DD HH:mm) 查询时间".
  assert.deepEqual(expandType('string(YYYY-MM-DD HH:mm) 查询时间', 'x'), { type: 'string', description: '查询时间，YYYY-MM-DD HH:mm' });
  assert.deepEqual(expandType('string(1..500) 笔记内容', 'x'), { type: 'string', minLength: 1, maxLength: 500, description: '笔记内容' });
});

test('a sketched proposal that repeats a part on its second page gets the repeat renamed, not rejected', () => {
  // Real MiniMax answer shape (目标进展助手, round 4): both pages had "title" and "goals"; three repairs later the model dropped the proposal.
  const operations = [{ id: 'goals.refresher', kind: 'query', description: '目标', input: {}, output: { items: [{ goal_id: 'string', title: 'string' }] } }];
  const candidate = { id: 'B', title: '两页', description: '先选再写', rationale: 'r', journey: ['选', '写'], operations, pages: [
    { id: 'pick', title: '选目标', parts: [{ id: 'title', intent: 'heading', purpose: '标题' }, { id: 'goals', intent: 'collection', purpose: '目标', read: 'goals.refresher' }] },
    { id: 'write', title: '写进展', parts: [{ id: 'title', intent: 'heading', purpose: '标题' }, { id: 'goals', intent: 'collection', purpose: '目标', read: 'goals.refresher' }] },
  ] };
  const proposal = normalizeProposal(candidate, 1, 'io.molis.work.generated.x', []);
  assert.deepEqual(proposal.preview.parts.map(part => part.pageId + '/' + part.id), ['pick/title', 'pick/goals', 'write/title-write', 'write/goals-write']);
  // A full design is referred to by its acceptance steps, so there the repeat is still the designer's to fix.
  const design = { operations: [{ ...operations[0], examples: [{ input: {}, output: { items: [] } }] }], pages: candidate.pages, acceptance: [{ id: 'a', steps: ['expect goals 包含 目标'] }] };
  assert.throws(() => expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), /组件标识重复/);
});

test('a form can take one field from another part and show a command result; the rest stays the person\'s to fill', () => {
  const design = {
    operations: [
      { id: 'concepts.ask', kind: 'command', input: { concept: 'string(1..200) 概念' }, output: { concept: 'string', question: 'string' }, effects: { capabilities: ['model.generate'] }, examples: [{ input: { concept: 'x' }, includes: {} }] },
      { id: 'concepts.add', kind: 'command', input: { concept: 'string', question: 'string', answer: 'string(1..2000) 我的回答' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { concept: 'x', question: 'q', answer: 'a' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'asker', intent: 'input', purpose: '出题', submit: { op: 'concepts.ask', show: 'question' } },
      { id: 'answer', intent: 'input', purpose: '回答', submit: { op: 'concepts.add', input: { concept: 'prefill:asker.concept', question: 'prefill:asker.question' } } },
    ] }],
    acceptance: [{ id: 'a', steps: ['fill asker = 间隔重复', 'submit asker', 'expect answer 包含 ［模型替身］', 'fill answer.answer = 我想是因为提取', 'submit answer'] }],
  };
  const dropped: string[] = [];
  const result = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped), ['model.generate'], [], contract => assertContract(contract));
  const asker = result.parts.find(part => part.id === 'asker')!, answer = result.parts.find(part => part.id === 'answer')!;
  assert.equal(asker.submit?.outputPath, 'question');
  assert.deepEqual(answer.submit?.input, { concept: { source: 'form', field: 'concept', prefill: { componentId: 'asker', field: 'concept' } }, question: { source: 'form', field: 'question', prefill: { componentId: 'asker', field: 'question' } }, answer: { source: 'form', field: 'answer' } });
  assert.deepEqual(result.acceptance[0]!.steps[2], { action: 'expect', componentId: 'answer', text: '［模型替身］' }, '"包含" is a word of the step, not of the text');
});

test('a prefilled field must exist in what it is taken from, before any code is written', () => {
  const design = {
    operations: [
      { id: 'concepts.ask', kind: 'command', input: { concept: 'string' }, output: { question: 'string' }, effects: { capabilities: ['model.generate'] }, examples: [{ input: { concept: 'x' }, includes: {} }] },
      { id: 'concepts.add', kind: 'command', input: { concept: 'string', question: 'string' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { concept: 'x', question: 'q' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'asker', intent: 'input', purpose: '出题', submit: { op: 'concepts.ask', show: 'question' } },
      { id: 'answer', intent: 'input', purpose: '回答', submit: { op: 'concepts.add', input: { concept: 'prefill:asker.concept', question: 'prefill:asker.question' } } },
    ] }],
    acceptance: [{ id: 'a', steps: ['fill asker = x', 'submit asker', 'submit answer', 'expect answer x'] }],
  };
  assert.throws(() => validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), ['model.generate'], [], contract => assertContract(contract)),
    /answer 的 concept 取自 asker\.concept，但 asker 的命令结果里没有 concept：把 concept 加进 concepts\.ask 的 output/);
});

test('host messages name the part, the operation and the allowed values, so a repair can find what to fix', () => {
  const design = (status: string, advance: unknown) => ({
    operations: [
      { id: 'books.list', kind: 'query', input: {}, output: [{ id: 'string', title: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'books.add', kind: 'command', input: { title: 'string', status: '未读|在读|已读' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { title: 'x', status }, includes: {} }] },
      { id: 'books.update', kind: 'command', input: { id: 'string', status: '未读|在读|已读' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { id: 'missing', status: '在读' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'editor', intent: 'input', purpose: '录入', submit: 'books.add' },
      { id: 'books', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, read: 'books.list' },
      { id: 'advance', intent: 'action', purpose: '改状态', submit: advance },
    ] }],
    acceptance: [{ id: 'a', steps: ['fill editor.title = x', 'fill editor.status = 未读', 'submit editor', 'expect books x'] }],
  });
  const check = (value: unknown) => () => validateAgentDesign(expandDesign(value, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract));
  assert.throws(check(design('想读', { op: 'books.update', input: { id: 'selection:books.id', status: 'form' } })), /操作 books\.add 第 1 个示例的 status 是「想读」，不在 未读\/在读\/已读 之内/);
  assert.throws(check(design('未读', { op: 'books.update', input: { id: 'selection:books.id' } })), /组件 advance：缺少必需输入的绑定：status（books\.update 要求 status/);
});

test('a constant the operation cannot accept is refused at design time with what to do instead', () => {
  const design = {
    operations: [
      { id: 'books.list', kind: 'query', input: {}, output: [{ id: 'string', title: 'string', status: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'books.update', kind: 'command', input: { id: 'string', status: '未读|在读|已读' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { id: 'missing', status: '在读' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'books', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, read: 'books.list' },
      { id: 'advance', intent: 'action', purpose: '下一状态', submit: { op: 'books.update', input: { id: 'selection:books.id', status: 'next:books.status' } } },
    ] }],
    acceptance: [{ id: 'a', steps: ['select books x', 'submit advance', 'expect books 在读'] }],
  };
  assert.throws(() => validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract)),
    /组件 advance：常量「"next:books\.status"」不是 books\.update 的 status 能接受的值（只能是 未读\/在读\/已读）；要按当前记录推算/);
});

test('type shorthand takes the bounds and format hints designers write; an empty expectation says what is missing', () => {
  assert.deepEqual(expandType('number(>0) 金额', 't'), { type: 'number', minimum: 0, description: '金额，大于 0' });
  assert.deepEqual(expandType('integer(>=1,<=5)', 't'), { type: 'integer', minimum: 1, maximum: 5 });
  assert.deepEqual(expandType('string(YYYY-MM) 月份', 't'), { type: 'string', description: '月份，YYYY-MM' });
  assert.throws(() => expandType('enum', 't'), /枚举写成 A\|B\|C/);
  assert.throws(() => parseStep('expect summary', [], 's'), /缺少期望的文字/);
});

test('"form.category" and "form?" are form fields, not constants', () => {
  const design = { operations: [{ id: 'expenses.list', kind: 'query', input: { 'category?': '餐饮|交通', 'note?': 'string' }, output: [{ id: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] }],
    pages: [{ id: 'home', parts: [{ id: 'list', intent: 'collection', purpose: '账单', props: { idField: 'id' }, read: { op: 'expenses.list', input: { category: 'form.category?', note: 'form?' } } }] }],
    acceptance: [{ id: 'a', steps: ['fill list.category = 餐饮', 'expect-not list x'] }] };
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract));
  assert.deepEqual(valid.parts[0]!.read?.input, { category: { source: 'form', field: 'category' }, note: { source: 'form', field: 'note' } });
});

test('an example cannot pin today\'s date; a date it was given may be checked', () => {
  const design = (example: unknown) => ({ operations: [{ id: 'summary.read', kind: 'query', input: { 'month?': 'string(YYYY-MM)' }, output: { month: 'string', total: 'number' }, effects: { storage: ['read'] }, examples: [example] }],
    pages: [{ id: 'home', parts: [{ id: 'summary', intent: 'description', purpose: '合计', read: 'summary.read' }] }], acceptance: [{ id: 'a', steps: ['expect summary 0'] }] });
  const dropped: string[] = [];
  const settled = expandDesign(design({ input: {}, includes: { month: '1970-01', total: 0 } }), base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(settled.contract.operations[0]!.examples[0], { input: {}, outputIncludes: { total: 0 } }, 'a partial expectation drops the date it cannot meet');
  assert.match(dropped.join(), /month（依赖当天日期/);
  const exact: string[] = [];
  assert.deepEqual(expandDesign(design({ input: {}, output: { month: '1970-01', total: 0 } }), base, 'io.molis.work.generated.x', 'r', exact).contract.operations[0]!.examples[0],
    { input: {}, outputIncludes: { total: 0 } }, 'an exact output keeps checking what does not depend on today');
  assert.match(exact.join(), /month（依赖当天日期/);
  assert.throws(() => expandDesign(design({ input: {}, output: { month: { label: '1970-01' }, total: 0 } }), base, 'io.molis.work.generated.x', 'r', []), /期望结果写了具体日期「1970-01」/, 'a date deeper inside still goes back');
  assert.doesNotThrow(() => expandDesign(design({ input: { month: '2026-09' }, includes: { month: '2026-09', total: 0 } }), base, 'io.molis.work.generated.x', 'r', []));
});

test('an example that expects a type name instead of a value is sent back', () => {
  const design = { operations: [{ id: 'summary.read', kind: 'query', input: {}, output: { month: 'string', total: 'number' }, effects: { storage: ['read'] }, examples: [{ input: {}, includes: { month: 'string', total: 0 } }] }],
    pages: [{ id: 'home', parts: [{ id: 'summary', intent: 'description', purpose: '合计', read: 'summary.read' }] }], acceptance: [{ id: 'a', steps: ['expect summary 0'] }] };
  const dropped: string[] = [];
  assert.deepEqual(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped).contract.operations[0]!.examples[0], { input: {}, outputIncludes: { total: 0 } });
  assert.match(dropped.join(), /month（写成了类型名/);
});

test('a form that "submits" the query a list reads becomes that list\'s filter bar, and its submit step goes', () => {
  const design = {
    operations: [
      { id: 'expenses.list', kind: 'query', input: { 'category?': '餐饮|交通' }, output: [{ id: 'string', note: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'expenses.add', kind: 'command', input: { note: 'string', category: '餐饮|交通' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { note: 'x', category: '餐饮' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'filter', intent: 'input', purpose: '筛选', submit: 'expenses.list' },
      { id: 'editor', intent: 'input', purpose: '记一笔', submit: 'expenses.add' },
      { id: 'list', intent: 'collection', purpose: '明细', props: { idField: 'id', titleField: 'note' }, read: 'expenses.list' },
    ] }],
    acceptance: [{ id: 'filter', steps: ['fill editor.note = 公交', 'fill editor.category = 交通', 'submit editor', 'fill filter.category = 餐饮', 'submit filter', 'expect-not list 公交'] }],
  };
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract));
  assert.deepEqual(valid.parts.map(part => part.id), ['editor', 'list']);
  assert.deepEqual(valid.parts[1]!.read?.input, { category: { source: 'form', field: 'category' } });
  assert.deepEqual(valid.acceptance[0]!.steps.slice(3), [{ action: 'fill', componentId: 'list', field: 'category', value: '餐饮' }, { action: 'expectAbsent', componentId: 'list', text: '公交' }]);
});

test('a collection can be filtered by its query\'s own input, and a step on a missing field says where and what exists', () => {
  const design = {
    operations: [
      { id: 'books.list', kind: 'query', input: { 'status?': '想读|在读|读完' }, output: [{ id: 'string', title: 'string', status: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'books.add', kind: 'command', input: { title: 'string(1..100) 书名', status: '想读|在读|读完' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { title: 'x', status: '想读' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'editor', intent: 'input', purpose: '加一本书', submit: 'books.add' },
      { id: 'books', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, read: { op: 'books.list', input: { status: 'form' } } },
    ] }],
    acceptance: [{ id: 'filter', steps: ['fill editor.title = 代码大全', 'fill editor.status = 想读', 'submit editor', 'fill books = 在读', 'expect-not books 代码大全'] }],
  };
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract));
  assert.deepEqual(valid.parts.find(part => part.id === 'books')?.read?.input, { status: { source: 'form', field: 'status' } });
  assert.deepEqual(valid.acceptance[0]!.steps[3], { action: 'fill', componentId: 'books', field: 'status', value: '在读' });
  const wrong = { ...design, acceptance: [{ id: 'filter', steps: ['submit editor', 'fill books.author = x', 'expect books x'] }] };
  assert.throws(() => validateAgentDesign(expandDesign(wrong, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract)),
    /验收「filter」第 2 步：组件 books 没有可填写的字段 author（它的字段是 status）/);
});

test('a separate filter part beside a list (as MiniMax writes it) becomes the list\'s filter bar; a filter its example leaves out is optional', () => {
  const design = (status: string) => ({
    operations: [
      { id: 'books.list', kind: 'query', input: { [status]: '未读|在读|已读 状态（不填则全部）' }, output: [{ id: 'string', title: 'string', status: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'books.add', kind: 'command', input: { title: 'string(1..100) 书名', status: '未读|在读|已读' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { title: 'x', status: '未读' }, includes: {} }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'editor', intent: 'input', purpose: '录入', submit: 'books.add' },
      { id: 'filter', intent: 'schedule', purpose: '按状态筛选', read: { op: 'books.list', input: { status: 'form' } } },
      { id: 'books', intent: 'collection', purpose: '书单', props: { idField: 'id', titleField: 'title' }, read: 'books.list' },
    ] }],
    acceptance: [{ id: 'filter', steps: ['fill editor.title = 黑客与画家', 'fill editor.status = 在读', 'submit editor', 'fill filter.status = 未读', 'expect-not books 黑客与画家'] }],
  });
  const dropped: string[] = [];
  const valid = validateAgentDesign(expandDesign(design('status?'), base, 'io.molis.work.generated.x', 'r', dropped), [], [], contract => assertContract(contract));
  assert.deepEqual(valid.parts.map(part => part.id), ['editor', 'books']);
  assert.deepEqual(valid.parts[1]!.read?.input, { status: { source: 'form', field: 'status' } });
  assert.deepEqual(valid.acceptance[0]!.steps[3], { action: 'fill', componentId: 'books', field: 'status', value: '未读' });
  assert.ok(dropped.some(note => /filter 是列表 books 的筛选/.test(note)));
  const notes: string[] = [];
  const relaxed = validateAgentDesign(expandDesign(design('status'), base, 'io.molis.work.generated.x', 'r', notes), [], [], contract => assertContract(contract));
  assert.deepEqual(relaxed.contract.operations.find(operation => operation.id === 'books.list')!.input.required, [], 'a query input its examples leave out is a filter, so optional');
  assert.ok(notes.some(note => /books\.list 的 status 是筛选条件/.test(note)));
});

test('an operation that reads a platform capability promises a partial result, never an exact one', () => {
  const design = { operations: [
      { id: 'reports.goals', kind: 'query', input: {}, output: [{ id: 'string', title: 'string' }], effects: { capabilities: ['goals.list'] }, examples: [{ input: {}, output: [] }] },
    ],
    pages: [{ id: 'home', parts: [{ id: 'goals', intent: 'collection', purpose: '目标', props: { idField: 'id', titleField: 'title' }, read: 'reports.goals' }] }],
    acceptance: [{ id: 'a', steps: ['expect goals 示例目标'] }] };
  const dropped: string[] = [];
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped), ['goals.list'], [], contract => assertContract(contract));
  assert.deepEqual(valid.contract.operations[0]!.examples[0], { input: {}, outputIncludes: [] });
  assert.match(dropped.join(), /用到平台能力，精确结果改为部分匹配/);
});

test('a case must choose a record before pressing a button that lives on records', () => {
  const design = { operations: [
      { id: 'logs.list', kind: 'query', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'logs.remove', kind: 'command', input: { id: 'string' }, output: { removed: 'boolean' }, effects: { storage: ['read', 'write'] }, errors: ['not_found: 不存在'], examples: [{ input: { id: 'missing' }, error: 'not_found' }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'logs', intent: 'collection', purpose: '记录', props: { idField: 'id', titleField: 'text' }, read: 'logs.list' },
      { id: 'remove', intent: 'action', purpose: '删除', submit: { op: 'logs.remove', input: { id: 'selection:logs.id' } } },
    ] }],
    acceptance: [{ id: 'not_found', steps: ['submit remove', 'expect logs 找不到'] }] };
  assert.throws(() => validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract)),
    /remove 是 logs 每条记录上的按钮，先写 select logs/);
});

test('a list-type part over a query that returns one object becomes a summary', () => {
  const design = { operations: [
      { id: 'water.today', kind: 'query', input: {}, output: { cups: 'integer 今天喝了几杯' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { cups: 0 } }] },
      { id: 'water.add', kind: 'command', input: {}, output: { cups: 'integer' }, effects: { storage: ['read', 'write'] }, examples: [{ input: {}, output: { cups: 1 } }] },
    ],
    pages: [{ id: 'home', parts: [
      { id: 'today', intent: 'collection', purpose: '今天', read: 'water.today' },
      { id: 'add', intent: 'action', purpose: '喝了一杯', props: { submitLabel: '喝了一杯' }, submit: { op: 'water.add', input: {} } },
    ] }],
    acceptance: [{ id: 'a', steps: ['submit add', 'expect today 1'] }] };
  const dropped: string[] = [];
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped), [], [], contract => assertContract(contract));
  assert.equal(valid.parts[0]!.intent, 'description');
  assert.match(dropped.join(), /改用正文显示/);
});

test('real designer slips are normalized once, in the open: choices, optional marks, misplaced cases, display words and a closing bracket', () => {
  assert.deepEqual(expandType('string(设计|阅读|产品) 标签', 'x'), { type: 'string', enum: ['设计', '阅读', '产品'], description: '标签' }, 'string(A|B) is a choice, not a string whose name contains bars');
  // A tag written as a choice where it is added, and as a plain string where it is filtered and listed.
  const design = {
    operations: [
      { id: 'ideas.list', kind: 'query', input: { tag: 'string?' }, output: [{ id: 'string', title: 'string', tag: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'ideas.add', kind: 'command', input: { title: 'string(1..60)', tag: 'string(设计|阅读|产品)' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { title: '暗黑模式', tag: '设计' }, includes: {} }] },
      { id: 'ideas.status', kind: 'command', input: { id: 'string', state: 'new|done' }, output: { id: 'string' }, effects: { storage: ['write'] }, errors: ['NOT_FOUND: 没有这条'], examples: [{ input: { id: 'x', state: '完成了' }, error: 'NOT_FOUND' }] },
      { id: 'ideas.remove', kind: 'command', input: { id: 'string' }, output: { removed: 'boolean' }, effects: { storage: ['write'] }, errors: ['NOT_FOUND: 没有这条'], examples: [{ input: { id: 'missing' }, error: 'NOT_FOUND' }] }],
    pages: [{ id: 'home', parts: [
      { id: 'editor', intent: '输入', purpose: '记一条灵感', submit: { op: 'ideas.add', input: { title: 'form', tag: 'form' } } },
      { id: 'ideas', intent: '卡片', purpose: '浏览灵感', read: { op: 'ideas.list', input: { tag: 'form' } }, props: { idField: 'id', titleField: 'title', columns: [{ field: 'state', label: '状态', values: { new: '新的', done: '完成了' } }] } },
      { id: 'finish', intent: 'action', purpose: '标记完成', submit: { op: 'ideas.status', input: { id: 'selection:ideas.id', state: 'done' } } },
      { id: 'remove', intent: 'action', purpose: '删除选中的灵感', submit: { op: 'ideas.remove', input: { id: 'selection:ideas.id' } } }],
      // Cases written inside the page, one of which presses a record's button with no record chosen.
      acceptance: [{ id: 'add', steps: ['fill editor.title = 暗黑模式', 'fill editor.tag = 设计', 'submit editor', 'expect ideas 暗黑模式'] }, { id: 'missing', steps: ['submit remove', 'expect ideas 找不到'] }] }],
  };
  const notes: string[] = [];
  const valid = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', notes), [], [], contract => assertContract(contract));
  const list = valid.contract.operations.find(operation => operation.id === 'ideas.list')!;
  assert.deepEqual(list.input.properties!.tag!.enum, ['设计', '阅读', '产品'], 'the filter offers the same choices the form writes');
  assert.deepEqual(list.input.required, [], '"string?" marks the field optional');
  assert.deepEqual((list.output as { items: { properties: Record<string, { enum?: string[] }> } }).items.properties.tag!.enum, ['设计', '阅读', '产品']);
  assert.deepEqual(valid.parts.map(part => part.intent), ['input', 'collection', 'action', 'action'], 'intents written in Chinese');
  assert.deepEqual(valid.acceptance.map(test => test.id), ['add'], 'a case that cannot happen on screen is left to the operation examples');
  assert.equal(valid.contract.operations.find(operation => operation.id === 'ideas.status')!.examples[0]!.input && (valid.contract.operations.find(operation => operation.id === 'ideas.status')!.examples[0]!.input as { state: string }).state, 'done', 'an example in display words means the stored value');
  for (const note of [/字段 tag 在各操作里统一/, /验收「missing」/, /显示用词/]) assert.ok(notes.some(item => note.test(item)), String(note));
  // A long answer that ended with its brackets out of order is repaired; one that was cut off is not guessed at.
  assert.deepEqual(parseModelJson('{"design": {"pages": [{"id": "home", "acceptance": [{"id": "a", "steps": ["reload"]}]}}}'), { design: { pages: [{ id: 'home', acceptance: [{ id: 'a', steps: ['reload'] }] }] } });
  assert.throws(() => parseModelJson('{"design": {"pages": [{"id": "ho'), /不是完整 JSON/);
});

test('an example cannot expect a field its own output does not have: the expectation keeps what the output declares', () => {
  const design = { operations: [
    { id: 'ideas.add', kind: 'command', input: { title: 'string(1..100)', description: 'string(1..1000)' }, output: { id: 'string', title: 'string' }, effects: { storage: ['write'] },
      examples: [{ input: { title: '留白', description: '在卡片之间留大量空白，让眼睛先看清结构' }, includes: { title: '留白', description: '在卡片之间留大量空白' } }] },
    { id: 'ideas.list', kind: 'query', input: {}, output: [{ id: 'string', title: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] }],
    pages: [{ id: 'home', parts: [{ id: 'editor', intent: 'input', purpose: '记', submit: { op: 'ideas.add', input: { title: 'form', description: 'form' } } }, { id: 'ideas', intent: 'collection', purpose: '看', read: 'ideas.list', props: { idField: 'id', titleField: 'title' } }] }],
    acceptance: [{ id: 'a', steps: ['fill editor.title = 留白', 'fill editor.description = 空白', 'submit editor', 'expect ideas 留白'] }] };
  const notes: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', notes);
  assert.deepEqual(expanded.contract.operations[0]!.examples[0], { input: { title: '留白', description: '在卡片之间留大量空白，让眼睛先看清结构' }, outputIncludes: { title: '留白' } });
  assert.ok(notes.some(note => /期望的 description 不在 output 里/.test(note)));
});

test('a plugin operation named like a capability, or a {{field}} its part cannot fill, goes back with what to write instead', () => {
  const design = (op: string, read: boolean, sentence: string) => ({ operations: [
    { id: op, kind: 'query', input: {}, output: { count: 'integer 今天的杯数' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { count: 0 } }] },
    { id: 'water.add', kind: 'command', input: {}, output: { count: 'integer' }, effects: { storage: ['read', 'write'] }, examples: [{ input: {}, includes: { count: 1 } }] }],
    pages: [{ id: 'home', parts: [
      { id: 'count', intent: 'description', purpose: '今天的杯数', props: { description: sentence }, ...(read ? { read: op } : {}) },
      { id: 'add', intent: 'action', purpose: '记一杯', props: { submitLabel: '喝了一杯' }, submit: 'water.add' }] }],
    acceptance: [{ id: 'a', steps: ['submit add', 'expect count 1 杯'] }] });
  const check = (value: unknown) => validateAgentDesign(expandDesign(value, base, 'io.molis.work.generated.x', 'r', []), ['goals.list'], [], contract => assertContract(contract));
  assert.throws(() => check(design('goals.list', true, '今天已经喝了 {{count}} 杯')), /和平台能力同名.*effects\.capabilities/);
  assert.throws(() => check(design('water.today', true, '今天已经喝了 {{cups}} 杯')), /\{\{cups\}\}.*read/);
  assert.doesNotThrow(() => check(design('water.today', true, '今天已经喝了 {{count}} 杯')));
});

test('a success example that looks a record up by id on an empty store is unmeetable: dropped with a note, the error kept', () => {
  const design = { operations: [
    { id: 'words.list', kind: 'query', input: {}, output: [{ id: 'string', word: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'words.add', kind: 'command', input: { word: 'string(1..60) 单词' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { word: 'apple' }, includes: {} }] },
    { id: 'words.remove', kind: 'command', input: { id: 'string' }, output: { removed: 'boolean' }, effects: { storage: ['read', 'write'] }, errors: ['not_found: 单词不存在'],
      examples: [{ input: { id: 'missing' }, error: 'not_found' }, { input: { id: 'w-1' }, output: { removed: true } }] }],
    pages: [{ id: 'home', parts: [{ id: 'editor', intent: 'input', purpose: '记', submit: 'words.add' }, { id: 'words', intent: 'collection', purpose: '看', read: 'words.list', props: { idField: 'id', titleField: 'word' } },
      { id: 'remove', intent: 'action', purpose: '删', props: { submitLabel: '删除' }, submit: { op: 'words.remove', input: { id: 'selection:words.id' } } }] }],
    acceptance: [{ id: 'a', steps: ['fill editor.word = apple', 'submit editor', 'expect words apple'] }] };
  const notes: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', notes);
  assert.deepEqual(expanded.contract.operations[2]!.examples, [{ input: { id: 'missing' }, error: 'not_found' }]);
  assert.ok(notes.some(note => /这个成功示例已去掉/.test(note)));
  // A delete that does not mind a missing record ({removed: false}) is a valid example on an empty store and stays.
  const tolerant = structuredClone(design); tolerant.operations[2]!.examples = [{ input: { id: 'missing' }, output: { removed: false } } as never];
  assert.deepEqual(expandDesign(tolerant, base, 'io.molis.work.generated.x', 'r', []).contract.operations[2]!.examples, [{ input: { id: 'missing' }, output: { removed: false } }]);
});

test('several broken operation references go back in one repair, not one per round', () => {
  // The shape of a real answer: a list reading a misspelled query, a button for an operation never defined, one query unused.
  const design = { operations: [
    { id: 'inbox_entries.list', kind: 'query', description: '列出待处理事项', input: {}, output: [{ id: 'string', title: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'notes.add', kind: 'command', description: '记一句备注', input: { entry_id: 'string', note: 'string' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { entry_id: 'e1', note: '先看' }, includes: {} }] },
    { id: 'notes.list', kind: 'query', description: '列出备注', input: {}, output: [{ id: 'string', note: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
  ], pages: [{ id: 'home', title: '收件箱摘要', parts: [
    { id: 'editor', intent: 'input', purpose: '记备注', submit: 'notes.add' },
    { id: 'entries', intent: 'collection', purpose: '待处理事项', read: 'entries.list' },
    { id: 'remove', intent: 'action', purpose: '删除备注', submit: { op: 'notes.remove', input: { id: 'selection:entries.id' } } },
  ] }], acceptance: [{ id: 'add', description: '记下后能看到', steps: ['fill editor.note = 先看', 'submit editor', 'expect entries 先看'] }] };
  assert.throws(() => expandDesign(design, base, 'io.molis.work.generated.x', 'r', []), (error: Error) =>
    /有 3 处要一起改/.test(error.message) && /entries 的 read 绑定了不存在的操作 entries\.list/.test(error.message)
    && /remove 的 submit 绑定了不存在的操作 notes\.remove/.test(error.message) && /inbox_entries\.list、notes\.list 没有任何组件使用/.test(error.message));
});

test('a part naming its own field ("editor.note") means the person fills it', () => {
  const design = { operations: [
    { id: 'items.list', kind: 'query', description: '列出事项', input: {}, output: [{ id: 'string', title: 'string', note: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'items.setnote', kind: 'command', description: '记备注', input: { id: 'string', note: 'string(1..500) 备注' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { id: 'x', note: '跟进' }, error: 'NOT_FOUND' }], errors: ['NOT_FOUND'] },
  ], pages: [{ id: 'home', title: '收件箱摘要', parts: [
    { id: 'items', intent: 'collection', purpose: '事项', read: 'items.list', props: { idField: 'id', titleField: 'title' } },
    { id: 'editor', intent: 'input', purpose: '记备注', submit: { op: 'items.setnote', input: { id: 'selection:items.id', note: 'editor.note' } } },
  ] }], acceptance: [{ id: 'note', description: '记下备注后看到', steps: ['select items 事项一', 'fill editor.note = 跟进', 'submit editor', 'expect items 跟进'] }] };
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(expanded.parts.find(part => part.id === 'editor')!.submit!.input.note, { source: 'form', field: 'note' });
});

test('a lookup by a snake_case id ("entry_id") that also expects to find one on empty storage keeps only the not-found example', () => {
  const design = { operations: [
    { id: 'notes.list', kind: 'query', description: '列出备注', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'notes.add', kind: 'command', description: '给事项记备注', input: { entry_id: 'string', text: 'string' }, output: { entry_id: 'string', text: 'string' }, effects: { storage: ['write'] }, errors: ['not_found'],
      examples: [{ input: { entry_id: 'missing', text: '备注' }, error: 'not_found' }, { input: { entry_id: 'ent-1', text: '跟进' }, includes: { text: '跟进' } }] },
  ], pages: [{ id: 'home', title: '备注', parts: [
    { id: 'editor', intent: 'input', purpose: '记备注', submit: 'notes.add' },
    { id: 'notes', intent: 'collection', purpose: '备注', read: 'notes.list', props: { idField: 'id', titleField: 'text' } },
  ] }], acceptance: [{ id: 'add', description: '记下后看到', steps: ['fill editor.entry_id = e1', 'fill editor.text = 跟进', 'submit editor', 'expect notes 跟进'] }] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(expanded.contract.operations[1]!.examples.map(example => example.error ?? 'ok'), ['not_found']);
  assert.ok(dropped.some(line => /entry_id/.test(line)));
});

test('acceptance cannot expect another plugin\'s data to change or empty: those steps go, a case left with nothing to check goes too', () => {
  const design = { operations: [
    { id: 'tasks.list', kind: 'query', description: '列出 Inbox 待处理', input: {}, output: [{ id: 'string', title: 'string' }], effects: { capabilities: ['inbox.list'] }, examples: [{ input: {}, includes: [] }] },
    { id: 'tasks.done', kind: 'command', description: '标为完成', input: { id: 'string' }, output: { status: 'string' }, effects: { capabilities: ['inbox.entry.status'] }, examples: [{ input: { id: 'x' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '快处理', parts: [
    { id: 'tasks', intent: 'collection', purpose: '待处理', read: 'tasks.list', props: { idField: 'id', titleField: 'title', emptyText: '没有待处理事项' } },
    { id: 'done', intent: 'action', purpose: '完成', submit: { op: 'tasks.done', input: { id: 'selection:tasks.id' } }, props: { title: '完成' } },
  ] }], acceptance: [
    { id: 'gone', description: '完成后消失', steps: ['select tasks 示例', 'submit done', 'expect-not tasks 示例'] },
    { id: 'empty', description: '空状态', steps: ['expect tasks 没有待处理事项'] },
    { id: 'shown', description: '看到事项', steps: ['expect tasks 示例'] },
  ] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(expanded.acceptance.map(test => test.id), ['shown']);
  assert.deepEqual(expanded.contract.acceptance.map(test => test.id), ['shown']);
  assert.ok(dropped.some(line => /固定替身/.test(line)));
  // When every case needed the other plugin's data to change, what can still be checked is that its record shows.
  const onlyImpossible = { ...design, acceptance: design.acceptance.slice(0, 2) };
  const fallback = expandDesign(onlyImpossible, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(fallback.acceptance.map(test => [test.id, test.steps]), [['shows-records', [{ action: 'expect', componentId: 'tasks', text: '示例' }]]]);
});

test('a site an operation reaches is named by its exact host', () => {
  const design = (domain: string) => ({ operations: [
    { id: 'weather.today', kind: 'command', description: '查今天天气', input: {}, output: { text: 'string' }, effects: { storage: ['write'], networkDomains: [domain] }, examples: [{ input: {}, includes: {} }] },
    { id: 'weather.list', kind: 'query', description: '查过的天气', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
  ], pages: [{ id: 'home', title: '天气', parts: [
    { id: 'check', intent: 'input', purpose: '查一次', submit: 'weather.today', props: { submitLabel: '查天气' } },
    { id: 'history', intent: 'collection', purpose: '记录', read: 'weather.list', props: { idField: 'id', titleField: 'text' } },
  ] }], acceptance: [{ id: 'check', description: '查一次', steps: ['submit check', 'expect history 示例'] }] });
  assert.doesNotThrow(() => strict(expandDesign(design('api.open-meteo.com'), base, 'io.molis.work.generated.x', 'r', [])));
  for (const bad of ['https://api.open-meteo.com/v1', '127.0.0.1', '*.example.com', 'printer.local', 'localhost'])
    assert.throws(() => strict(expandDesign(design(bad), base, 'io.molis.work.generated.x', 'r', [])), /确切域名/, bad);
});

test('a list result expected "to include" one record written as that record means the list contains it', () => {
  const design = { operations: [
    { id: 'tasks.list', kind: 'query', description: '列出 Inbox 待处理', input: {}, output: [{ id: 'string', title: 'string' }], effects: { capabilities: ['inbox.list'] }, examples: [{ input: {}, includes: { title: '示例' } }] },
  ], pages: [{ id: 'home', title: '快处理', parts: [{ id: 'tasks', intent: 'collection', purpose: '待处理', read: 'tasks.list', props: { idField: 'id', titleField: 'title' } }] }],
  acceptance: [{ id: 'shown', description: '看到事项', steps: ['expect tasks 示例'] }] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(expanded.contract.operations[0]!.examples[0], { input: {}, outputIncludes: [{ title: '示例' }] });
  assert.ok(dropped.some(line => /列表里有这样一条/.test(line)));
});

test('an operation that only passes a request to another plugin cannot promise that plugin\'s errors: its example checks the result\'s shape', () => {
  const design = { operations: [
    { id: 'tasks.list', kind: 'query', description: '列出 Inbox 待处理', input: {}, output: [{ id: 'string', title: 'string', revision: 'integer' }], effects: { capabilities: ['inbox.list'] }, examples: [{ input: {}, includes: [] }] },
    { id: 'tasks.done', kind: 'command', description: '标为完成', input: { id: 'string', revision: 'integer' }, output: { id: 'string', status: 'string' }, errors: ['conflict'], effects: { capabilities: ['inbox.entry.status'] },
      examples: [{ input: { id: 'missing', revision: 1 }, error: 'conflict' }] },
  ], pages: [{ id: 'home', title: '快处理', parts: [
    { id: 'tasks', intent: 'collection', purpose: '待处理', read: 'tasks.list', props: { idField: 'id', titleField: 'title' } },
    { id: 'done', intent: 'action', purpose: '完成', submit: { op: 'tasks.done', input: { id: 'selection:tasks.id', revision: 'selection:tasks.revision' } } },
  ] }], acceptance: [{ id: 'shown', description: '看到事项', steps: ['expect tasks 示例'] }] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(expanded.contract.operations[1]!.examples, [{ input: { id: 'missing', revision: 1 }, outputIncludes: {} }]);
  assert.ok(dropped.some(line => /总是成功/.test(line)));
});

test('a command\'s result shown "beside" its binding is shown; a model stand-in expectation is checked as the prefix and the words', () => {
  const design = { operations: [
    { id: 'notes.add', kind: 'command', description: '记一件事', input: { text: 'string' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { text: 'x' }, includes: {} }] },
    { id: 'notes.list', kind: 'query', description: '今天的事', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'summary.run', kind: 'command', description: '汇总成一句话', input: {}, output: { text: 'string' }, effects: { storage: ['read', 'write'], capabilities: ['model.generate'] }, examples: [{ input: {}, includes: {} }] },
  ], pages: [{ id: 'home', title: '小结', parts: [
    { id: 'editor', intent: 'input', purpose: '记事', submit: 'notes.add' },
    { id: 'today', intent: 'collection', purpose: '今天', read: 'notes.list', props: { idField: 'id', titleField: 'text' } },
    { id: 'runnow', intent: 'action', purpose: '现在汇总', submit: { op: 'summary.run', input: {} }, submitShow: { op: 'summary.run', show: 'text' } },
  ] }], acceptance: [{ id: 'run', description: '汇总', steps: ['fill editor.text = 上午写了周报', 'submit editor', 'submit runnow', 'expect runnow ［模型替身］上午写了周报'] }] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.equal(expanded.parts.find(part => part.id === 'runnow')!.submit!.outputPath, 'text');
  assert.ok(!dropped.some(line => /submitShow/.test(line)), 'not reported as dropped');
  assert.deepEqual(expanded.acceptance[0]!.steps.filter(step => step.action === 'expect').map(step => (step as { text: string }).text), ['［模型替身］', '上午写了周报']);
});

test('a part choosing from itself ("selection:calendar.habitId" in its own read) means the person picks it', () => {
  const design = { operations: [
    { id: 'habits.add', kind: 'command', description: '加一个习惯', input: { name: 'string' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { name: '跑步' }, includes: {} }] },
    { id: 'habits.days', kind: 'query', description: '某个习惯的打卡日', input: { habitId: 'string' }, output: [{ id: 'string', date: 'date' }], effects: { storage: ['read'] }, examples: [{ input: { habitId: 'h' }, output: [] }] },
  ], pages: [{ id: 'home', title: '习惯', parts: [
    { id: 'editor', intent: 'input', purpose: '加习惯', submit: 'habits.add' },
    { id: 'calendar', intent: 'schedule', purpose: '打卡日历', read: { op: 'habits.days', input: { habitId: 'selection:calendar.habitId' } }, props: { idField: 'id', titleField: 'date' } },
  ] }], acceptance: [{ id: 'add', description: '加一个', steps: ['fill editor.name = 跑步', 'submit editor', 'expect calendar 暂无'] }] };
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(expanded.parts.find(part => part.id === 'calendar')!.read!.input.habitId, { source: 'form', field: 'habitId' });
});

test('an answer whose root closed one brace early and went on with more keys is read as one object', () => {
  assert.deepEqual(parseModelJson('{"summary":"s","design":{"a":[1,{"b":2}]}},"rework":[{"op":"x"}]}'), { summary: 's', design: { a: [1, { b: 2 }] }, rework: [{ op: 'x' }] });
  assert.throws(() => parseModelJson('{"summary":"s"},"x":'), /不是完整 JSON/, 'a cut-off answer is not guessed at');
});

test('a list of another plugin\'s data stays the stand-in even when the design says it reads storage: a write never shows in it', () => {
  const design = { operations: [
    { id: 'tasks.list', kind: 'query', description: '列出 Inbox 待处理', input: {}, output: [{ id: 'string', title: 'string', status: 'string(open|done)' }], effects: { storage: ['read'], capabilities: ['inbox.list'] }, examples: [{ input: {}, includes: [] }] },
    { id: 'tasks.done', kind: 'command', description: '标为完成', input: { id: 'string' }, output: { status: 'string' }, effects: { storage: ['read'], capabilities: ['inbox.entry.status'] }, examples: [{ input: { id: 'x' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '快处理', parts: [
    { id: 'tasks', intent: 'collection', purpose: '待处理', read: 'tasks.list', props: { idField: 'id', titleField: 'title', emptyText: '没有待处理事项' } },
    { id: 'done', intent: 'action', purpose: '完成', submit: { op: 'tasks.done', input: { id: 'selection:tasks.id' }, show: 'status' }, props: { title: '完成' } },
  ] }], acceptance: [
    { id: 'complete', description: '完成一条', steps: ['select tasks 示例', 'submit done', 'expect tasks done', 'expect-not tasks 示例', 'expect done done'] },
    { id: 'shown', description: '看到事项', steps: ['expect tasks 示例'] },
  ] };
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(expanded.acceptance.find(test => test.id === 'complete')!.steps.map(step => step.action + ':' + ('componentId' in step ? step.componentId : '')), ['select:tasks', 'submit:done', 'expect:done'], 'after the write only the button feedback is checked');
});

test('text expected on a part that only shows fixed words, right after another part ran a command, is that command\'s result shown where it ran', () => {
  const design = { operations: [
    { id: 'meetings.list', kind: 'query', description: '以前的提炼', input: {}, output: [{ id: 'string', preview: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'meetings.summarize', kind: 'command', description: '提炼待办', input: { text: 'string' }, output: { todos: ['string'], raw: 'string' }, effects: { storage: ['write'], capabilities: ['model.generate'] }, examples: [{ input: { text: 'x' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '会议要点', parts: [
    { id: 'editor', intent: 'input', purpose: '粘贴会议记录', submit: 'meetings.summarize' },
    { id: 'result', intent: 'description', purpose: '提炼结果', props: { description: '提炼出的三条待办' } },
    { id: 'history', intent: 'collection', purpose: '以前的', read: 'meetings.list', props: { idField: 'id', titleField: 'preview' } },
  ] }], acceptance: [{ id: 'summarize', description: '看到待办', steps: ['fill editor.text = 周二前提交方案', 'submit editor', 'expect result 周二前提交方案', 'expect result 提炼出的三条待办'] }] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.equal(expanded.parts.find(part => part.id === 'editor')!.submit!.outputPath, undefined, 'two fields of content (todos, raw): the whole result shows, nothing hidden');
  assert.deepEqual(expanded.acceptance[0]!.steps.filter(step => step.action === 'expect').map(step => (step as { componentId: string }).componentId), ['editor', 'result'], 'its own fixed words stay where they are');
  // One field of content beside its id and time is that field.
  const single = { ...design, operations: [design.operations[0], { ...design.operations[1], output: { id: 'string', todos: ['string'], createdAt: 'datetime' } }] };
  assert.equal(expandDesign(single, base, 'io.molis.work.generated.x', 'r', []).parts.find(part => part.id === 'editor')!.submit!.outputPath, 'todos');
});

test('an exact expected result missing a required output field is explained, not reported as "$: missing"', () => {
  const design = { operations: [
    { id: 'notes.list', kind: 'query', description: '这周记下的事', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'report.make', kind: 'command', description: '整理成周报', input: { week: 'string' }, output: { documentTitle: 'string', count: 'integer' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { week: '本周' }, output: { count: 0 } }] },
  ], pages: [{ id: 'home', title: '周报', parts: [
    { id: 'notes', intent: 'collection', purpose: '记下的事', read: 'notes.list', props: { idField: 'id', titleField: 'text' } },
    { id: 'make', intent: 'input', purpose: '整理', submit: 'report.make' },
  ] }], acceptance: [{ id: 'make', description: '整理', steps: ['fill make.week = 本周', 'submit make', 'expect notes 暂无'] }] };
  assert.throws(() => strict(expandDesign(design, base, 'io.molis.work.generated.x', 'r', [])), /report\.make 第 1 个示例的期望结果缺少 documentTitle/);
});


test('steps with nothing in them, fills on parts with nothing to fill, and cases about parts that do not exist are left out', () => {
  const design = { operations: [
    { id: 'water.add', kind: 'command', description: '记一杯', input: {}, output: { count: 'integer' }, effects: { storage: ['read', 'write'] }, examples: [{ input: {}, includes: {} }] },
    { id: 'water.today', kind: 'query', description: '今天几杯', input: {}, output: { count: 'integer' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { count: 0 } }] },
  ], pages: [{ id: 'home', title: '喝水', parts: [
    { id: 'counter', intent: 'description', purpose: '杯数', read: 'water.today', props: { description: '今天已经喝了 {{count}} 杯' } },
    { id: 'add', intent: 'action', purpose: '记一杯', submit: { op: 'water.add', input: {} }, props: { submitLabel: '喝了一杯' } },
  ] }], acceptance: [
    { id: 'add', description: '记一杯', steps: ['fill', 'fill counter = 0', 'submit add', 'expect counter 今天已经喝了 1 杯', 'expect logs '] },
    { id: 'ghost', description: '不存在的组件', steps: ['submit add', 'expect editor 1'] },
  ] };
  const dropped: string[] = [];
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped);
  assert.deepEqual(expanded.acceptance.map(test => test.id), ['add']);
  assert.deepEqual(expanded.acceptance[0]!.steps.map(step => step.action), ['submit', 'expect']);
  assert.ok(dropped.some(line => /不存在的组件 editor/.test(line)));
});

test('a field written into the text of a part that reads nothing is shown where the command that returns it runs', () => {
  const design = { operations: [
    { id: 'meetings.summarize', kind: 'command', description: '提炼待办', input: { text: 'string' }, output: { action_items: ['string'] }, effects: { storage: ['write'] }, examples: [{ input: { text: 'x' }, includes: {} }] },
    { id: 'meetings.list', kind: 'query', description: '以前的', input: {}, output: [{ id: 'string', preview: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
  ], pages: [{ id: 'home', title: '会议要点', parts: [
    { id: 'editor', intent: 'input', purpose: '粘贴会议记录', submit: 'meetings.summarize' },
    { id: 'preview', intent: 'description', purpose: '提炼结果', props: { description: '三条待办：{{action_items}}' } },
    { id: 'history', intent: 'collection', purpose: '以前的', read: 'meetings.list', props: { idField: 'id', titleField: 'preview' } },
  ] }], acceptance: [{ id: 'go', description: '提炼', steps: ['fill editor.text = 周二交方案', 'submit editor', 'expect editor 周二交方案'] }] };
  const expanded = strict(expandDesign(design, base, 'io.molis.work.generated.x', 'r', []));
  assert.equal(expanded.parts.find(part => part.id === 'editor')!.submit!.outputPath, 'action_items');
  assert.equal(expanded.parts.find(part => part.id === 'preview')!.props.description, '三条待办：');
});

test('a sentence of record fields over a list query means the result of the command that returns them', () => {
  // Real MiniMax answer (会议要点, round 5): "显示最新一次的三条" read minutes.list with "{{title}}：1. {{task1}}…"; three repairs did not fix it.
  const design = { operations: [
    { id: 'minutes.extract', kind: 'command', description: '提炼', input: { text: 'string(1..40000) 会议记录原文' }, output: { id: 'string', title: 'string', task1: 'string', task2: 'string', task3: 'string' }, effects: { storage: ['read', 'write'], capabilities: ['model.generate'] }, examples: [{ input: { text: 'x' }, includes: {} }] },
    { id: 'minutes.list', kind: 'query', description: '以前的', input: {}, output: [{ id: 'string', title: 'string', task1: 'string', task2: 'string', task3: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
  ], pages: [{ id: 'home', title: '会议要点', parts: [
    { id: 'extract-input', intent: 'input', purpose: '粘贴会议记录并提炼', submit: 'minutes.extract' },
    { id: 'extract-result', intent: 'description', purpose: '显示最新一次的三条', props: { description: '{{title}}：1. {{task1}}｜2. {{task2}}｜3. {{task3}}' }, read: 'minutes.list' },
    { id: 'history', intent: 'collection', purpose: '以前的', read: 'minutes.list', props: { idField: 'id', titleField: 'title' } },
  ] }], acceptance: [{ id: 'go', description: '提炼', steps: ['fill extract-input.text = 周五发布', 'submit extract-input', 'expect extract-result ［模型替身］周五发布'] }] };
  const dropped: string[] = [];
  const expanded = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped), ['model.generate'], [], contract => assertContract(contract));
  const result = expanded.parts.find(part => part.id === 'extract-result')!, runner = expanded.parts.find(part => part.id === 'extract-input')!;
  assert.equal(result.read, undefined);
  assert.equal(runner.submit!.outputPath, undefined, 'several fields show as the whole result, each labelled');
  assert.ok(dropped.some(note => /是记录列表/.test(note)));
  assert.deepEqual(expanded.acceptance[0]!.steps.filter(step => step.action === 'expect').map(step => (step as { componentId: string }).componentId), ['extract-input', 'extract-input']);
});

test('an idempotency key is the code\'s to make, and the sentence a command just wrote prefills the next form', () => {
  // Real MiniMax design (目标进展助手, round 6): the person had to type "幂等键", and retype the polished sentence.
  const design = { operations: [
    { id: 'progress.goals.list', kind: 'query', description: '目标', input: {}, output: [{ id: 'string', title: 'string' }], effects: { capabilities: ['goals.list'] }, examples: [{ input: {}, output: [] }] },
    { id: 'progress.polish', kind: 'command', description: '润色', input: { goal_id: 'string 所选目标 id', draft: 'string(1..1000) 本周做了什么原话' }, output: { polished: 'string 润色后的一句进展', goal_id: 'string' }, effects: { capabilities: ['model.generate'] }, examples: [{ input: { goal_id: 'g', draft: 'x' }, includes: {} }] },
    { id: 'progress.record', kind: 'command', description: '记录', input: { goal_id: 'string 所选目标 id', summary: 'string(1..300) 一句进展', idempotency_key: 'string 幂等键，避免重复记录' }, output: { recorded: 'boolean' }, effects: { capabilities: ['goals.progress.record'] }, examples: [{ input: { goal_id: 'g', summary: 's', idempotency_key: 'k' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '目标进展助手', parts: [
    { id: 'goal-list', intent: 'collection', purpose: '选目标', read: 'progress.goals.list', props: { idField: 'id', titleField: 'title' } },
    { id: 'polish-btn', intent: 'action', purpose: '润色', submit: { op: 'progress.polish', show: 'polished', input: { goal_id: 'selection:goal-list.id', draft: 'form' } } },
    { id: 'record-btn', intent: 'action', purpose: '记录', submit: { op: 'progress.record', input: { goal_id: 'selection:goal-list.id', summary: 'form', idempotency_key: 'form' } } },
  ] }], acceptance: [{ id: 'go', description: '记一句', steps: ['select goal-list 示例', 'fill polish-btn.draft = 写了向导', 'submit polish-btn', 'expect polish-btn ［模型替身］写了向导', 'submit record-btn'] }] };
  const dropped: string[] = [];
  const result = validateAgentDesign(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped), ['goals.list', 'model.generate', 'goals.progress.record'], [], contract => assertContract(contract));
  const record = result.contract.operations.find(operation => operation.id === 'progress.record')!, part = result.parts.find(item => item.id === 'record-btn')!;
  assert.deepEqual(Object.keys(record.input.properties ?? {}), ['goal_id', 'summary']);
  assert.ok(!('idempotency_key' in (record.examples[0]!.input as object)));
  assert.deepEqual(part.submit!.input.summary, { source: 'form', field: 'summary', prefill: { componentId: 'polish-btn', field: 'polished' } });
  assert.equal(part.submit!.input.idempotency_key, undefined);
  assert.equal((result.parts.find(item => item.id === 'polish-btn')!.submit!.input.draft as { prefill?: unknown }).prefill, undefined, 'the person\'s own words stay theirs');
});

test('buttons written inside the list they act on become parts of the page beside it', () => {
  // Real MiniMax design (习惯打卡, round 8): "actions": [...] inside the list; three repairs over "没有任何组件使用".
  const design = { operations: [
    { id: 'habits.list', kind: 'query', description: '习惯', input: {}, output: [{ id: 'string', title: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'habits.add', kind: 'command', description: '加', input: { title: 'string(1..30) 习惯名' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { title: 'x' }, includes: {} }] },
    { id: 'habits.remove', kind: 'command', description: '删', input: { id: 'string' }, output: { removed: 'boolean' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { id: 'nope' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '习惯', parts: [
    { id: 'editor', intent: 'input', purpose: '加习惯', submit: 'habits.add' },
    { id: 'habits-list', intent: 'collection', purpose: '管理习惯', props: { idField: 'id', titleField: 'title' }, read: 'habits.list',
      actions: [{ id: 'remove-habit', intent: 'action', purpose: '删除选中的习惯', props: { submitLabel: '删除' }, submit: { op: 'habits.remove', input: { id: 'selection:habits-list.id' } } }] },
  ] }], acceptance: [{ id: 'go', description: '删', steps: ['fill editor.title = 读书', 'submit editor', 'select habits-list 读书', 'submit remove-habit', 'expect-not habits-list 读书'] }] };
  const dropped: string[] = [];
  const result = strict(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped));
  assert.deepEqual(result.parts.map(part => part.id), ['editor', 'habits-list', 'remove-habit']);
  assert.equal(result.parts.find(part => part.id === 'remove-habit')!.submit!.operationId, 'habits.remove');
  assert.ok(dropped.some(note => /嵌套的按钮 remove-habit/.test(note)));
});

test('an example value that only names its field ("loggedAt": "loggedAt") checks that the field is there', () => {
  // Real MiniMax design (喝水打卡, round 8): three code repairs could not return the literal word "loggedAt".
  const design = { operations: [
    { id: 'water.add', kind: 'command', description: '记一杯', input: {}, output: { id: 'string', loggedAt: 'datetime' }, effects: { storage: ['read', 'write'] }, examples: [{ input: {}, output: { loggedAt: 'loggedAt' } }] },
    { id: 'water.today', kind: 'query', description: '今天几杯', input: {}, output: { count: 'integer' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { count: 0 } }] },
  ], pages: [{ id: 'home', title: '喝水', parts: [
    { id: 'today', intent: 'description', purpose: '杯数', read: 'water.today', props: { description: '今天已经喝了 {{count}} 杯' } },
    { id: 'drink', intent: 'action', purpose: '记一杯', submit: { op: 'water.add', input: {} } },
  ] }], acceptance: [{ id: 'go', description: '记一杯', steps: ['submit drink', 'expect today 今天已经喝了 1 杯'] }] };
  const dropped: string[] = [];
  const result = strict(expandDesign(design, base, 'io.molis.work.generated.x', 'r', dropped));
  assert.deepEqual(result.contract.operations[0]!.examples[0], { input: {}, outputIncludes: {} });
  assert.deepEqual(result.contract.operations[1]!.examples[0], { input: {}, output: { count: 0 } }, 'a real value stays exact');
  assert.ok(dropped.some(note => /loggedAt 写的是占位词/.test(note)));
});

test('a form asking for the id of a record takes it from the list of those records on the page', () => {
  const design = { operations: [
    { id: 'habits.list', kind: 'query', description: '习惯', input: {}, output: [{ id: 'string', name: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
    { id: 'habits.add', kind: 'command', description: '加习惯', input: { name: 'string' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { name: '晨跑' }, includes: {} }] },
    { id: 'checkins.add', kind: 'command', description: '打卡', input: { habitId: 'string', note: 'string?' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { habitId: 'h' }, includes: {} }] },
  ], pages: [{ id: 'home', title: '习惯', parts: [
    { id: 'editor', intent: 'input', purpose: '加习惯', submit: 'habits.add' },
    { id: 'habits', intent: 'collection', purpose: '习惯', read: 'habits.list', props: { idField: 'id', titleField: 'name' } },
    { id: 'checkin', intent: 'input', purpose: '打卡', submit: 'checkins.add' },
  ] }], acceptance: [{ id: 'go', description: '打卡', steps: ['fill editor.name = 晨跑', 'submit editor', 'select habits 晨跑', 'submit checkin', 'expect habits 晨跑'] }] };
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(expanded.parts.find(part => part.id === 'checkin')!.submit!.input.habitId, { source: 'form', field: 'habitId', prefill: { componentId: 'habits', field: 'id' } });
});

test('a case that expects an operation to report its declared error is left to the examples', () => {
  const design = { operations: [
    { id: 'water.today', kind: 'query', description: '今天几杯', input: {}, output: { count: 'integer' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { count: 0 } }] },
    { id: 'water.add', kind: 'command', description: '记一杯', input: {}, output: { count: 'integer' }, effects: { storage: ['read', 'write'] }, examples: [{ input: {}, includes: {} }] },
    { id: 'water.undo', kind: 'command', description: '撤销', input: {}, output: { count: 'integer' }, errors: [{ code: 'nothing_to_undo', description: '今天还没有打卡记录' }], effects: { storage: ['read', 'write'] }, examples: [{ input: {}, error: 'nothing_to_undo' }] },
  ], pages: [{ id: 'home', title: '喝水', parts: [
    { id: 'summary', intent: 'description', purpose: '杯数', read: 'water.today', props: { description: '今天已经喝了 {{count}} 杯' } },
    { id: 'add', intent: 'action', purpose: '记一杯', submit: { op: 'water.add', input: {} } },
    { id: 'undo', intent: 'action', purpose: '撤销', submit: { op: 'water.undo', input: {} } },
  ] }], acceptance: [
    { id: 'add', description: '记一杯', steps: ['submit add', 'expect summary 今天已经喝了 1 杯'] },
    { id: 'undo_empty', description: '没有可撤销', steps: ['submit undo', 'expect summary 今天还没有打卡记录'] },
  ] };
  const expanded = expandDesign(design, base, 'io.molis.work.generated.x', 'r', []);
  assert.deepEqual(expanded.acceptance.map(test => test.id), ['add']);
  // Real MiniMax answer (喝水打卡, round 6): the case expected the error's code on the button.
  const byCode = { ...design, acceptance: [design.acceptance[0], { id: 'undo_empty', description: '命令会返回 nothing_to_undo', steps: ['expect undo 撤销', 'submit undo', 'expect undo nothing_to_undo'] }] };
  assert.deepEqual(expandDesign(byCode, base, 'io.molis.work.generated.x', 'r', []).acceptance.map(test => test.id), ['add']);
});
