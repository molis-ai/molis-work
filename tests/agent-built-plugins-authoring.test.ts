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
  assert.throws(() => expandDesign(design({ input: {}, output: { month: '1970-01', total: 0 } }), base, 'io.molis.work.generated.x', 'r', []), /期望结果写了具体日期「1970-01」/, 'an exact output still goes back');
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

test('a separate filter part beside a list (as MiniMax writes it) becomes the list\'s filter bar; a required filter with an empty example is explained', () => {
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
  assert.throws(() => validateAgentDesign(expandDesign(design('status'), base, 'io.molis.work.generated.x', 'r', []), [], [], contract => assertContract(contract)),
    /操作 books\.list 的示例输入缺少必填字段 status：可以不填的字段写成 "status\?"/);
});
