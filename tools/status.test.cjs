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
  assert.ok(['open', 'doing'].includes(D.state['70']), `expected batch 70 to be released (open or doing), got ${D.state['70']}`);
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

const U66 = ['111.1', '111.2', '111.3'];

test('moved redirect batches stay non-claimable and batch 91/92-105 dependencies and conditions stay well-formed', () => {
  const D = apply(snapshot);
  assert.notEqual(D.state['72'], 'open');
  const nodes = Object.fromEntries(snapshot.batches.flatMap(b => b.nodes.map(n => [n.id, n])));
  assert.deepEqual(nodes['91.1'].hard, ['36A.7']);
  assert.deepEqual(nodes['91.2'].hard, ['31.1', '101.1', '101.2', ...U66]);
  assert.deepEqual(nodes['91.3'].hard, ['91.1', '91.2', '36A.1', '36A.2', '36A.3', '37.2', ...U66]);
  assert.deepEqual(nodes['91.4'].hard, ['91.1', '91.2', '35.2', '36A.4', ...U66]);
  assert.deepEqual(nodes['91.5'].hard, ['91.1', '36A.1', '36A.2', '36A.3', '36A.4', '36A.5', '36A.6', '36A.7']);
  for (const id of ['91B.1', '91B.2', '91B.3']) assert.deepEqual(nodes[id].hard, ['91.1', '101.1', ...U66]);
  assert.deepEqual(nodes['91B.4'].hard, ['91B.1', '91B.2', '91B.3']);
  assert.deepEqual(nodes['100.1'].hard, []);
  assert.deepEqual(nodes['100.2'].hard, ['100.1']);
  assert.deepEqual(nodes['101.1'].hard, ['100.2']);
  assert.deepEqual(nodes['101.2'].hard, ['100.2']);
  assert.deepEqual(nodes['102.1'].hard, ['100.2', '36A.1', '36A.2', '36A.3']);
  assert.deepEqual(nodes['102.2'].hard, ['100.2']);
  assert.deepEqual(nodes['103.1'].hard, ['101.1', '101.2']);
  assert.deepEqual(nodes['103.2'].hard, ['101.1', '101.2']);
  assert.deepEqual(nodes['104.1'].hard, ['91.2']);
  assert.deepEqual(nodes['104.2'].hard, ['104.1', '101.1']);
  assert.deepEqual(nodes['105.1'].hard, ['39.1', '39.2', '100.2', ...U66]);
  assert.ok(nodes['105.1'].partial.includes('62.1'));
  assert.deepEqual(nodes['105.2'].hard, ['100.2', ...U66]);
  assert.ok(nodes['65.2'].hard.includes('105.1'));
  for (const id of [
    '91.1', '91.2', '91.3', '91.4', '91.5', '91B.1', '91B.2', '91B.3', '91B.4',
    '92.1', '92.2', '92.3', '93.1', '93.2', '94', '95.1', '95.2', '95.3', '96.1', '96.2', '97.1', '97.2', '98', '99',
    '100.1', '100.2', '101.1', '101.2', '102.1', '102.2', '103.1', '103.2', '104.1', '104.2', '105.1', '105.2',
    '44B.1', '44B.2', '44B.3', '106.1', '106.2', '106.3', '107.1', '107.2', '108.1', '108.2', '108.3',
    '109.1', '109.2', '109.3', '110.1', '110.2', '110.3', '111.1', '111.2', '111.3',
  ]) {
    assert.ok(nodes['90'].hard.includes(id), `90.hard missing ${id}`);
  }
  for (const bid of ['44B', '92', '93', '94', '95', '96', '97', '98', '99', '100', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111']) {
    const b = snapshot.batches.find(x => x.id === bid);
    assert.ok(b, `missing batch ${bid}`);
    assert.notEqual(b.stage, 'S', `batch ${bid} must not be classified as server stage S`);
  }
  for (const b of snapshot.batches) {
    for (const c of b.cond) assert.ok(!/决定 \d+（待定）：\s*$/.test(c), `empty pending decision in ${b.id}: ${c}`);
  }
});

test('decision 66 chain 44B → 106～111 is a hard serial chain and every downstream batch waits for 111', () => {
  const nodes = Object.fromEntries(snapshot.batches.flatMap(b => b.nodes.map(n => [n.id, n])));
  const chain = [['44B', 3], ['106', 3], ['107', 2], ['108', 3], ['109', 3], ['110', 3], ['111', 3]];
  for (const [b, n] of chain) assert.equal(snapshot.batches.find(x => x.id === b).items.length, n, `item count of ${b}`);
  // 44B-0（位置 44B.1）无前置；批内逐项串行；110-3 只等 110-1
  assert.deepEqual(nodes['44B.1'].hard, []);
  assert.deepEqual(nodes['44B.2'].hard, ['44B.1']);
  assert.deepEqual(nodes['44B.3'].hard, ['44B.2']);
  assert.deepEqual(nodes['110.3'].hard, ['110.1']);
  // 每批的第一项等上一批全部项
  const prevOf = { 106: ['44B.1', '44B.2', '44B.3'], 107: ['106.1', '106.2', '106.3'], 108: ['107.1', '107.2'],
    109: ['108.1', '108.2', '108.3'], 110: ['109.1', '109.2', '109.3'], 111: ['110.1', '110.2', '110.3'] };
  for (const [b, prev] of Object.entries(prevOf)) assert.deepEqual(nodes[`${b}.1`].hard, prev, `${b}.1`);
  // 链上不出现下游，也没有环：111 的祖先全在 44B～110
  const seen = new Set(); const st = ['111.3'];
  while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); st.push(...nodes[x].hard); }
  for (const x of seen) assert.ok(/^(44B|10[6-9]|110|111)\./.test(x), `111 ancestor outside chain: ${x}`);
  // 决定 66 点名的下游批次：整批或指定项等 111
  const waits = id => assert.ok(U66.every(h => nodes[id].hard.includes(h)), `${id} must wait for 111`);
  ['91.2', '91.3', '91.4', '91B.1', '91B.2', '91B.3', '105.1', '105.2', '57', '60', '63', '76', '77', '78', '85', '86', '54',
    '56.3', '64.3', '67.1', '70d', '73.3', '75.1', '75.3', 'REL-2.1', 'REL-4.1', 'REL-5', 'SRV-3', 'SRV-4', 'SRV-8.1', 'SRV-8.2', 'SRV-8.3'].forEach(waits);
  for (const b of ['43', '45', '46', '48', '52', '53', '55', '62', '63A', '65', '66', '68', '69', '71', '82', '83', '84', '89']) {
    for (const n of snapshot.batches.find(x => x.id === b).nodes) waits(n.id);
  }
  // 只有部分条目等 111 的单元用部分前置，不整项挡住
  for (const id of ['70a', 'SRV-1', 'SRV-2', 'SRV-5', 'SRV-6', 'SRV-7']) assert.ok(nodes[id].partial.includes('111.3'), `${id} partial 111`);
  // 56.2、64.1 等批内没点名的项不被误挡
  for (const id of ['56.1', '64.1', '67.2', '73.1', '104.1']) assert.ok(!nodes[id].hard.includes('111.3'), `${id} should not wait for 111 directly`);
});
