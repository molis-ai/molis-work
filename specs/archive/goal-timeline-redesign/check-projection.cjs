// Regression checks for current facts versus historical event content.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const element = { addEventListener() {}, classList: { contains: () => false } };
const context = vm.createContext({
  document: { addEventListener() {}, querySelector: () => element },
  sessionStorage: { getItem: () => null }, structuredClone,
});
for (const file of ['planning.js', 'app.js']) {
  let source = fs.readFileSync(path.join(__dirname, 'prototype', file), 'utf8');
  if (file === 'app.js') source = source.replace(/render\(\);\s*$/, '');
  vm.runInContext(source, context, { filename: file });
}
const run = code => vm.runInContext(code, context);
run(`function addReport(assessment = 'unknown', requirementId = null, typeId = 'eng-delivery') {
  const type = planningTypes().find(item => item.id === typeId);
  state.planning.records.push({ kind: 'report', id: 'test-' + state.planning.records.length, title: '本次观察', author: '你', type: structuredClone(type), payload: {}, requirementId, assessment });
}
function current() { return planningOverview(demoConfig(), overviewFacts()); }`);
for (const scenario of ['decision', 'blocked', 'interrupted', 'complete']) {
  run(`state = defaultState('${scenario}')`);
  const before = run('current()');
  run('addReport()');
  const after = run('current()');
  assert.equal(after.config.status, before.config.status, `${scenario}: status must survive an unrelated report`);
  for (const key of ['done', 'next', 'owner', 'risk']) assert.equal(after.facts[key], before.facts[key], `${scenario}: ${key}`);
}
for (const scenario of ['progress', 'decision', 'blocked', 'interrupted', 'complete']) {
  run(`state = defaultState('${scenario}'); addReport('supports', 'baseline-2', 'eng-verification')`);
  for (const reader of ['briefHtml()', 'handoffHtml()', 'currentResultsHtml()']) {
    const html = run(reader);
    assert.match(html, /你报告满足 · 未独立核对/, `${scenario}: current reader retains support provenance`);
    assert.doesNotMatch(html, /重启后接续尚未完成实测|尚未验证重启后能否可靠接续|重启恢复仍缺一次干净环境的实测/, `${scenario}: stale result instructions`);
  }
  if (scenario === 'decision') assert.match(run('current().facts.risk'), /仍待一骏决定/);
  if (scenario === 'blocked') assert.match(run('current().facts.risk'), /原测试环境仍不可用/);
  if (scenario === 'interrupted') assert.match(run('current().facts.risk'), /执行会话仍未连接/);
  if (scenario === 'complete') assert.equal(run('current().config.status'), '已完成');
  run(`addReport('contradicts', 'baseline-2', 'eng-verification')`);
  assert.equal(run('planningRequirements()[2].done'), false);
  for (const reader of ['briefHtml()', 'handoffHtml()', 'currentResultsHtml()']) {
    assert.match(run(reader), /你报告未达到/);
    assert.doesNotMatch(run(reader), /当前目标已完成，没有待接续工作|三项均已有对应检查结果/);
  }
  if (scenario === 'complete') assert.equal(run('current().config.status'), '需跟进');
  // Historical successful report remains successful after current counterevidence.
  assert.match(run('planningEventBody(state.planning.records[0])'), /报告满足 · 未独立核对/);
  assert.match(run('artifactHtml(false)'), /重启恢复仍缺一次干净环境的实测/);
}
run(`state = defaultState('complete'); state.planning.requirements.push({id:'extra', typeId:'eng-verification', text:'补充恢复验证', origin:'你'});`);
assert.equal(run('current().config.status'), '需跟进');
run(`state = defaultState('complete'); addReport('unknown', 'baseline-2', 'eng-verification')`);
assert.equal(run('planningRequirements()[2].done'), false);
assert.equal(run('current().config.status'), '需跟进');
run(`state = defaultState('progress'); addReport('unknown', null, 'eng-concern')`);
assert.match(run('current().facts.risk'), /接续可靠性尚未实测/);
assert.match(run('current().facts.risk'), /仍需关注：本次观察/);
console.log('PASS: unrelated records preserve decisions, environment, connection and completion; current readers agree on support/counterevidence/unknown; historical reports stay historical.');
