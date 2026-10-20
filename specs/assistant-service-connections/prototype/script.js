const byId = id => document.getElementById(id);
let state = 'waiting';
let connected = false;
let completed = false;
let resultSaved = false;
let taskStopped = false;
let scenario = 'new';
let notice = '';

const descriptions = {
  waiting: '接入方案已准备好。请以 Alpha 团队工作账号完成登录；完成后我会回到这项任务。',
  ready: '知识库已连通，账号与项目范围符合这项任务，可以继续读取资料。',
  permission: '账号已连接，也能读取资料。这个连接目前只允许 Coding 使用，助理还缺少 Alpha 项目的读取权限。',
  failed: '配置和账号授权还在，但知识库暂时无法连接。没有读取新资料，也没有保存文档。',
  cancelled: '这次接入已取消。晚到的授权结果不会启用连接，原任务和已经完成的工作仍然保留。',
  disabled: '连接已停用。当前配置保留，依赖它的新调用会被拒绝。',
  removed: '已移除这条演示连接。已有文档仍然保留；移除本地连接不等于撤销服务端授权。',
  completed: '已读取 Alpha 的发布规范，并按这项任务的最新要求完成处理。',
};
const status = {
  waiting: ['等待本人授权', ''], ready: ['可以调用', 'ready'], permission: ['需要助理使用权限', ''],
  failed: ['暂时无法连接', 'failed'], cancelled: ['接入已取消', ''], disabled: ['已停用', ''], removed: ['已移除', ''], completed: ['本次读取成功', 'ready'],
};
function button(label, action, primary = false) { return `<button data-action="${action}" class="${primary ? 'primary' : 'quiet'}">${label}</button>`; }
function render() {
  const [label, tone] = status[state];
  let actions = '';
  if (state === 'waiting') actions = button('登录并授权', 'authorize', true) + button('取消这次接入', 'cancel') + button('停止任务，连接继续', 'stop');
  if (state === 'ready') actions = button(taskStopped ? '继续这项任务' : '读取上线要求', 'run', true);
  if (state === 'permission') actions = button('允许助理读取此项目', 'permit', true) + button('暂不允许', 'decline');
  if (state === 'failed') actions = button('重新检查连接', 'retry', true) + button('查看连接详情', 'details');
  if (state === 'cancelled' || state === 'removed') actions = button('重新发起接入', 'reset', true);
  if (state === 'disabled') actions = button('重新启用', 'enable', true);
  if (state === 'completed') actions = button('查看连接详情', 'details');
  byId('reply').innerHTML = `<p class="reply-copy">${descriptions[state]}</p>
    <section class="connection" aria-label="知识库连接状态"><div class="connection-heading"><span class="service-mark" aria-hidden="true">知</span><div class="connection-title"><strong>团队知识库</strong><small>Alpha 团队 · 工作账号 · 仅 Alpha 项目</small></div><span class="status ${tone}">${label}</span></div>
    <p class="connection-meta">${scenario === 'reuse' ? '来自 Coding；关闭原页面不影响当前使用。' : '检索与读取资料；凭据由本人授权界面接收。'}</p>
    <div class="progress"><span class="done">✓ 配置已检查</span><span class="${connected ? 'done' : ''}">${connected ? '✓ 账号已验证' : '○ 账号待验证'}</span><span class="${completed ? 'done' : ''}">${completed ? '✓ 已完成演示读取' : '○ 业务尚未调用'}</span></div></section>
    ${notice ? `<p class="secondary">${notice}</p>` : ''}
    ${state === 'completed' ? `<div class="result"><strong>Alpha 上线要求</strong><p>周四 10:00–12:00 发布；上线前完成权限复核，确认后发送客户通知。</p><a href="#source" class="source-link">依据：团队知识库 / Alpha 发布规范</a><p class="note">${resultSaved ? '已保存至 Pages 的「上线准备」（演示文档）。' : '按等待期间的新要求，只读取资料，没有保存文档。'}</p></div>` : ''}
    <div class="actions">${actions}</div><p class="note">${taskStopped ? '业务任务已停止。连接可继续完成，但不会自动读取或保存。' : state === 'waiting' ? '可以关闭授权页或切换页面；这项任务会保留等待。' : '以上服务状态与结果为交互演示。'}</p>`;
}
function reset() {
  scenario = byId('scenario').value;
  state = { new: 'waiting', reuse: 'ready', permission: 'permission', failure: 'failed' }[scenario];
  connected = scenario !== 'new'; completed = false; resultSaved = false; taskStopped = false; notice = '';
  byId('instruction').value = 'save'; byId('saved-result').hidden = true; byId('assistant').hidden = false;
  render();
}
function run() {
  if (state !== 'ready') return;
  taskStopped = false; completed = true; state = 'completed'; notice = '';
  resultSaved = byId('instruction').value === 'save';
  byId('saved-result').hidden = !resultSaved;
  render();
}
function details() {
  const available = connected && state !== 'disabled' && state !== 'removed' && state !== 'failed';
  byId('connection-details').innerHTML = `<p>团队知识库 · Alpha 团队工作账号</p><div class="state-grid"><div><span>配置</span><span>${state === 'removed' ? '已移除' : '完整'}</span></div><div><span>连接</span><span>${available ? '连通' : state === 'failed' ? '检查失败' : '未连接'}</span></div><div><span>服务端授权</span><span>${connected ? '允许读取资料' : '未完成'}</span></div><div><span>助理使用权限</span><span>${state === 'permission' ? '尚未授予' : 'Alpha 项目'}</span></div><div><span>能力</span><span>${available && state !== 'permission' ? '检索、读取' : '暂不可调用'}</span></div><div><span>最近实际调用</span><span>${completed ? '本次读取成功（演示）' : '尚未调用'}</span></div></div><div class="actions">${state === 'disabled' ? button('重新启用', 'enable', true) : button('停用连接', 'disable')}${button('移除连接', 'remove')}</div><p class="note">状态分别来自配置、连接检查、授权与调用记录。</p>`;
  if (!byId('details').open) byId('details').showModal();
}
function act(action) {
  if (action === 'authorize') byId('authorization').showModal();
  if (action === 'cancel') { state = 'cancelled'; notice = ''; render(); }
  if (action === 'stop') { taskStopped = true; render(); }
  if (action === 'run') run();
  if (action === 'permit') { state = 'ready'; notice = '只新增助理对 Alpha 项目的读取权限，原 Coding 授权保留。'; render(); }
  if (action === 'decline') { notice = '没有授予助理权限。原连接及 Coding 的使用不受影响。'; render(); }
  if (action === 'retry' || action === 'enable') { state = 'ready'; connected = true; notice = '已重新检查连接与能力。'; byId('details').close(); render(); }
  if (action === 'disable' || action === 'remove') { state = action === 'disable' ? 'disabled' : 'removed'; notice = ''; byId('details').close(); render(); }
  if (action === 'details') details();
  if (action === 'reset') reset();
}
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) act(action);
  if (event.target.closest('.source-link')) { event.preventDefault(); byId('guide').showModal(); }
});
byId('authorization').addEventListener('close', () => {
  const result = byId('authorization').returnValue;
  if (state !== 'waiting') return;
  if (result === 'cancel') { state = 'cancelled'; notice = ''; }
  else if (result === 'authorize') { connected = true; state = 'ready'; notice = '授权完成，已刷新检索与读取能力。'; if (!taskStopped) { run(); return; } }
  else notice = '授权页已关闭，等待仍然保留。可以重新打开继续。';
  render();
});
byId('instruction').addEventListener('change', () => { notice = '已更新当前要求；尚未执行的步骤按新要求继续。'; if (completed) notice = '要求已更新；此前已完成的操作不会撤回。'; render(); });
byId('scenario').addEventListener('change', reset);
byId('restart').addEventListener('click', reset);
byId('collapse').addEventListener('click', () => { byId('assistant').hidden = true; });
byId('reopen').addEventListener('click', () => { byId('assistant').hidden = false; });
byId('home-view').addEventListener('click', () => { byId('assistant').hidden = true; });
byId('connections-view').addEventListener('click', details);
byId('close-details').addEventListener('click', () => byId('details').close());
byId('show-guide').addEventListener('click', () => byId('guide').showModal());
byId('close-guide').addEventListener('click', () => byId('guide').close());
reset();
