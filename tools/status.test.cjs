const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const template = readFileSync(process.env.GRAPH_TEMPLATE || resolve(__dirname, 'template.html'), 'utf8');
const algorithm = template.slice(template.indexOf('const STAGES='), template.indexOf('// 上次读到的进展'));
const generated = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const snapshot = JSON.parse(generated.match(/const D=(.*);\nconst STAGES=/)[1]);
function apply(data, statuses) {
  const D = structuredClone(data);
  const rows = D.batches.flatMap(b => b.items.map((i, n) => {
    const status = statuses?.[`${b.id}-${n + 1}`] || '待认领';
    return `| ${b.id} | ${i.t} | ${status === '待认领' ? '' : 'Codex-测试-本机'} | | ${status} | |`;
  })).join('\n');
  runInNewContext(`${algorithm}\napplyBoard(board);`, { D, board: statuses ? rows : D.board });
  return D;
}
function batch(id, track, hard = [], partial = []) {
  return { id, items: [{ t: id, track, occ: true }], nodes: [{ id, items: [0], hard, partial }] };
}
const fixture = batches => ({ batches, state: {}, claimers: {} });

test('RAR-03 same track and C subtracks do not block unrelated work', () => {
  const D = apply(fixture([batch('01', 'E'), batch('02', 'E'), batch('03', 'C1'), batch('04', 'C2')]),
    { '01-1': '实施中', '03-1': '实施中' });
  assert.equal(D.state['01'], 'doing');
  assert.equal(D.state['02'], 'open');
  assert.equal(D.state['04'], 'open');
  assert.ok(D.activeTracks.E.has('01'));
  assert.ok(D.activeTracks.C.has('03'));
});

test('RAR-03/RAR-04 hard prerequisites, pauses, claims and incomplete design remain distinct', () => {
  const D = apply(fixture([batch('01', 'C1'), batch('02', 'C2', ['01']), batch('03', 'D'),
    batch('04', 'D'), batch('05', 'F')]), { '01-1': '定样中', '03-1': '暂停', '04-1': '已认领', '05-1': '已合入' });
  assert.equal(D.state['01'], 'doing');
  assert.equal(D.state['02'], 'wait');
  assert.equal(D.state['03'], 'pause');
  assert.equal(D.state['04'], 'doing');
  assert.equal(D.state['05'], 'done');
});

test('a status is read from its word, and a row the page cannot read is reported instead of silently counting as claimed', () => {
  const read = rows => {
    const D = structuredClone(fixture([batch('01', 'D'), batch('02', 'D'), batch('03', 'D')]));
    const board = rows.map(([id, status]) => `| ${id} | ${id} | Codex-测试-本机 | | ${status} | |`).join('\n');
    return runInNewContext(`${algorithm}\napplyBoard(board);({state:D.state,items:D.batches.map(b=>b.items[0]),off:boardOff})`, { D, board });
  };
  const readable = read([['01', '已合入'], ['02', '**暂停（等第 02 批结束）**：余项'], ['03', '已认领：定样已合入']]);
  assert.equal(readable.off, 0);
  assert.equal(readable.state['01'], 'done');
  assert.equal(readable.state['02'], 'pause');
  assert.equal(readable.items[1].note, '（等第 02 批结束）：余项');
  assert.equal(readable.state['03'], 'doing');
  const names = read([['01', '已认领：`project_runtime_settings` 待进基线'], ['02', '已合入'], ['03', '已合入']]);
  assert.equal(names.items[0].note, '`project_runtime_settings` 待进基线');
  const bracketed = read([['01', '已合入（11-05）'], ['02', '已合入。规则与检查'], ['03', '已认领：定样已合入']]);
  assert.equal(bracketed.items[0].note, '11-05');
  assert.equal(bracketed.items[1].note, '规则与检查');
  const unreadable = read([['01', '规则与检查已于 11-05 合入'], ['02', '已合入'], ['03', '已合入']]);
  assert.equal(unreadable.off, 1);
  assert.equal(unreadable.items[0].s, '已认领');
  assert.notEqual(unreadable.state['01'], 'done');
});

test('RAR-04 unmet partial dependencies stay visible until merged, without claiming completion', () => {
  const data = fixture([batch('01', 'C1'), batch('02', 'D', [], ['01'])]);
  const D = apply(data, {});
  assert.equal(D.state['02'], 'open');
  assert.equal(JSON.stringify(D.batches[1].remainingParts), '["01"]');
  const merged = apply(data, { '01-1': '已合入' });
  assert.equal(merged.batches[1].remainingParts.length, 0);
  assert.equal(merged.state['02'], 'open');
});

test('RAR-04 generated contract dependencies separate partial prerequisites from whole-item blockers', () => {
  const nodes = Object.fromEntries(snapshot.batches.flatMap(b => b.nodes.map(n => [n.id, n])));
  assert.deepEqual(nodes['08'].hard, ['02.2']);
  for (const id of ['05.1', '05.2', '05.3']) assert.ok(nodes['08'].partial.includes(id));
  assert.deepEqual(nodes['14.1'].hard, ['03', '02.2']);
  assert.deepEqual(nodes['14.3'].hard, ['14.1', '14.2']);
  assert.deepEqual(nodes['20.1'].hard, ['02.2', '04']);
  for (const id of ['05.2', '08', '14.1', '36.1']) assert.ok(nodes['20.1'].partial.includes(id));
  assert.ok(nodes['36.1'].partial.includes('20.1'));
  const finished = new Set();
  function visit(id, active = new Set()) {
    assert.ok(nodes[id], `unknown dependency ${id}`);
    assert.ok(!active.has(id), `hard cycle at ${id}`);
    if (finished.has(id)) return;
    const next = new Set(active).add(id);
    nodes[id].hard.forEach(parent => visit(parent, next));
    nodes[id].partial.forEach(parent => assert.ok(nodes[parent], `unknown partial dependency ${parent}`));
    finished.add(id);
  }
  Object.keys(nodes).forEach(id => visit(id));
});

test('RAR-03 live-board snapshot releases batch 70 without marking it done or removing its hard blockers', () => {
  const D = apply(snapshot);
  const batch70 = D.batches.find(b => b.id === '70');
  assert.equal(D.state['70'], 'open');
  assert.ok(batch70.ready.length > 0);
  assert.ok(batch70.ready.length < batch70.items.length);
  assert.equal(batch70.merged, 0);
});

test('RAR-04 early contract work does not unlock consumers that need the complete batch', () => {
  const statuses = { '02-2': '已合入' };
  for (const id of ['03', '04']) {
    snapshot.batches.find(b => b.id === id).items.forEach((_, i) => { statuses[`${id}-${i + 1}`] = '已合入'; });
  }
  const D = apply(snapshot, statuses);
  for (const id of ['08', '20']) {
    assert.equal(D.state[id], 'open');
    assert.ok(D.batches.find(b => b.id === id).remainingParts.length > 0);
    assert.equal(D.batches.find(b => b.id === id).merged, 0);
  }
  assert.equal(D.state['14'], 'open');
  assert.equal(D.batches.find(b => b.id === '14').merged, 0);
  assert.equal(D.state['09'], 'wait');
  assert.equal(D.state['16'], 'wait');
});

test('RAR-04 batch 12 remains unfinished until its added return capability is delivered', () => {
  const D = apply(snapshot, { '12-1': '已合入', '12-2': '已合入' });
  const batch12 = D.batches.find(b => b.id === '12');
  const returning = batch12.items.find(i => i.t === '草稿与返回能力');
  assert.ok(returning);
  assert.equal(returning.s, '待认领');
  assert.equal(batch12.merged, 2);
  assert.notEqual(D.state['12'], 'done');
  assert.equal(D.state['13'], 'wait');
});

test('RAR-05 generated page uses the tested template algorithm', () => {
  assert.equal(generated.slice(generated.indexOf('const STAGES='), generated.indexOf('// 上次读到的进展')), algorithm);
});
