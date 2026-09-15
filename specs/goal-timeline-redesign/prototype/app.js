const storageKey = 'molis-work-timeline-design-v1';
const defaultState = (scenario = 'progress') => ({ scenario, decision: null, notes: [], selected: null, prepared: false, nextLocalOrder: 1, planning: createPlanningState(scenario) });
let state = defaultState();
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  if (saved && ['progress', 'custom', 'decision', 'blocked', 'interrupted', 'complete', 'empty', 'parent'].includes(saved.scenario)) state = { ...defaultState(saved.scenario), ...saved };
} catch { /* The prototype remains usable without session storage. */ }
let filter = 'all';
let readerOpener = null;
let readerReturnAction = null;
let visibleEvents = [];
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
  goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  circleCheck: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  decision: '<path d="M5 4h14v12H9l-4 4zM9 8h6m-6 4h4"/>',
  note: '<path d="M5 3h14v18H5zM8 7h8m-8 5h8m-8 5h5"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M9 8v8m6-8v8"/>',
  work: '<path d="M5 5h14v14H5zM9 9l3 3-3 3m5 0h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  branch: '<path d="M6 3v12a3 3 0 0 0 3 3h9M6 9h12m-3-3 3 3-3 3m0 3 3 3-3 3"/>',
  link: '<path d="m10 7 2-2a4 4 0 0 1 6 6l-2 2m-2 4-2 2a4 4 0 0 1-6-6l2-2m0 5 8-8"/>',
  minus: '<path d="M5 12h14"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.note}</svg>`;
const save = () => { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { toast('浏览器未允许保存；当前页面仍可继续体验。'); } };
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
function demoConfig() {
  if (state.scenario === 'custom') return customGoalConfig();
  const extra = state.decision === 'include';
  const base = {
    title: '让新用户独立完成第一次目标协作',
    outcome: '从创建项目到得到第一个结果，再到重启后接着做，整条路径都不需要有人在旁边解释。',
    status: '进行中', tone: '', actor: 'Codex 正在处理',
    note: '下一步：验证重启后的接续路径', next: '用一个干净环境验证：重启后能找到上次结果，并接着做。', owner: 'Codex · 当前会话', helper: '这一步在已确认范围内，无需你介入。',
  };
  if (state.scenario === 'decision') return { ...base, status: state.decision ? '进行中' : '有一项决定', tone: state.decision ? '' : 'is-amber', note: state.decision ? (extra ? '下一步：补充导入方案；继续验证重启' : '已按你的决定继续；旧项目导入留到后续') : '其余工作仍在继续', next: extra ? '继续验证重启；随后补充旧项目导入的处理方案。' : base.next, helper: state.decision ? '你的决定已更新到目标说明，后续会话可以沿用。' : '导入范围等你决定；重启验证可以先做。' };
  if (state.scenario === 'blocked') return { ...base, status: '部分受阻', tone: 'is-amber', actor: 'Codex 可继续其他工作', note: '重启实测暂缺测试环境；恢复说明可以继续', next: '先整理接续说明；测试环境恢复后补做重启实测。', helper: '阻塞只影响重启实测，不影响记录和说明。' };
  if (state.scenario === 'interrupted') return { ...base, status: '待接续', tone: 'is-amber', actor: '当前没有连接的执行会话', note: '最后一次结果已保存 · 下一步没有丢失', next: '在执行会话中接着验证重启恢复。', owner: '待连接 · 建议交给 Codex', helper: state.prepared ? '交接摘要已准备好；尚未启动真实执行会话。' : '接续会沿用已有结果、范围与决定。' };
  if (state.scenario === 'complete') return { ...base, status: '已完成', tone: 'is-green', actor: 'Codex 已结束本轮工作', note: '三项完成要求均已有对应检查结果', next: '当前目标已完成。公开发布仍需另行决定。', helper: '本轮只完成内部使用路径。', owner: '一骏 · 公开发布时决定' };
  if (state.scenario === 'empty') return { ...base, title: '让第一次使用 Molis Work 更顺畅', outcome: '先把这个想法留下。你已经表达过的意图，会成为接下来工作的起点。', status: '尚未开始', actor: '还没有执行会话', note: '可以先梳理现状；当前尚未约定完成要求', next: '结合当前使用路径，整理希望改善的结果和明显差距。', owner: '待分配', helper: '无需先填写完整计划才能保存目标。' };
  if (state.scenario === 'parent') return { ...base, title: '让 Molis Work 可以交给第一批用户试用', outcome: '安装、第一次协作、遇到问题后的恢复，都能连成一条真实可用的体验。', status: '进行中', actor: '首次协作子目标正在处理', note: '下一步：补齐首次协作，再走一次完整试用', next: '接上首次协作结果，再从安装开始验证完整试用。', owner: 'Codex · 首次协作；一骏 · 试用反馈', helper: '子目标都完成后，仍要核对整条试用体验。' };
  return base;
}
function actionButton(action, label, image = 'arrow', style = '') {
  return `<button type="button" class="button ${style}" data-action="${action}">${icon(image)}${label}</button>`;
}
function meta(actor = 'Codex', time = '今天 14:32', source = 'result', label = '工作更新') {
  return `<div class="event-meta"><span class="avatar ${actor === '一骏' || actor === '你' ? 'human' : ''}" aria-hidden="true">${actor === 'Codex' ? 'C' : actor === '你' ? '你' : '骏'}</span><span>${esc(actor)}</span><span class="meta-divider">·</span><time>${esc(time)}</time><span class="meta-divider">·</span><button type="button" data-source="${source}">${esc(label)}</button></div>`;
}
function event({ id, kind = 'note', marker = 'note', title, body, author, time, source, label, status = '', localOrder = 0 }) {
  return { id, kind, marker, title, body, author: author || 'Codex', time: time || '今天 14:32', source: source || id, label: label || '工作更新', status, localOrder };
}
function artifactButton(label = '首次使用验证记录', caption = '两项已验证 · 含检查范围与剩余问题', action = 'artifact') {
  return `<button type="button" class="attachment" data-action="${action}">${icon('file')}<span><strong>${label}</strong><small>${caption}</small></span>${icon('arrow')}</button>`;
}
function proofDetails(complete = false) {
  return `<details class="proof"><summary>查看检查结果与材料</summary><div class="proof-body"><div class="proof-row">${icon('circleCheck')}<div><strong>新用户能独立创建项目</strong><small>从空白状态创建成功；重新打开后项目仍在。</small></div></div><div class="proof-row">${icon('circleCheck')}<div><strong>能完成第一个真实目标</strong><small>结果可以打开，完成要求与对应材料可以核对。</small></div></div><div class="proof-row ${complete ? '' : 'waiting'}">${icon(complete ? 'circleCheck' : 'clock')}<div><strong>重启后能继续上次工作</strong><small>${complete ? '已从新会话找回结果、范围和下一步，并完成接续。' : '已有恢复方案；尚未在干净环境中完成实测。'}</small></div></div><p class="proof-foot">示例检查范围：macOS、本地项目、首次创建。附件可打开不等于内容已通过。</p><button type="button" class="summary-link" data-action="artifact">打开完整验证记录 ${icon('arrow')}</button></div></details>`;
}
function resultEvent(complete = false) {
  return event({ id: complete ? 'completion' : 'result', kind: 'result', marker: 'circleCheck', title: complete ? '重启后的接续也已走通，首次协作可以完整完成' : '首次使用已走通，重启恢复还差一次验证', body: `<p>${complete ? '从创建项目、完成第一个目标，到关闭再重新打开，整条路径都已跑通。结果和原先的约定没有丢失。' : '现在可以创建项目，并独立完成第一个真实目标。结果能找得到，下一步也能接上。'}</p>${!complete ? '<p>剩下的是在干净环境中确认：重启后，这条路径仍然成立。</p>' : '<p>本轮完成的是内部使用路径，公开发布仍保留给你决定。</p>'}${artifactButton(complete ? '首次协作完整验证记录' : undefined, complete ? '三项已验证 · 含重启与新会话接续' : undefined)}${proofDetails(complete)}`, time: complete ? '今天 16:20' : '今天 14:32', source: complete ? 'completion' : 'result', label: '检查结果与产物' });
}
function decisionEvent() {
  const resolved = Boolean(state.decision);
  const include = state.decision === 'include';
  const body = resolved
    ? `<p>${include ? '旧项目导入已加入本轮范围，新增完成要求：导入后项目、结果和已有决定保持完整。' : '这轮继续把新项目的首次协作做完整。旧项目导入留在后续考虑，当前完成要求不变。'}</p><blockquote class="quote">${include ? '把旧项目导入加入本轮，并补充完成要求。' : '这轮只做好新项目，旧项目导入以后再做。'}</blockquote><button type="button" class="summary-link" data-action="brief">查看更新后的目标说明 ${icon('arrow')}</button>`
    : `<p>试用时有人从旧版本带来数据。支持导入会多出数据兼容与恢复工作，超出了当前“从新项目开始”的范围。</p><div class="decision-body"><h4>建议先把新项目路径做完整</h4><p>旧项目导入可以后续单独跟进。这个决定不妨碍继续做重启验证。</p><div class="decision-options"><div class="decision-option"><button type="button" class="button primary" data-decision="later">这轮只做好新项目</button><small>保留当前范围；旧项目导入留到后续。</small></div><div class="decision-option"><button type="button" class="button" data-decision="include">把旧项目导入加入本轮</button><small>扩大范围，新增数据完整性要求；完成时间需要重新评估。</small></div></div><p class="context-note">只需要决定新增的这一部分；之前的约定继续有效。</p></div>`;
  return event({ id: 'decision', kind: 'decision', marker: 'decision', title: resolved ? (include ? '已决定：这轮也支持旧项目导入' : '已决定：这轮只做好新项目') : '旧项目导入，这一轮要一起支持吗？', body, author: resolved ? '一骏' : 'Codex', time: resolved ? '刚刚' : '今天 14:50', source: 'decision', label: resolved ? '已确认决定' : '范围变化建议', status: resolved ? '已更新当前约定' : '' });
}
function problemEvent() {
  return event({ id: 'problem', kind: 'problem', marker: 'alert', title: '重启实测暂时做不了，恢复说明可以先补齐', body: '<p>用于验证的干净测试环境当前不可用。前两项检查结果仍然保留，受影响的是最后一项重启实测。</p><p>Codex 先整理恢复说明；测试环境恢复后，再补这一次检查。</p><div class="event-actions">' + actionButton('blocker', '查看原因与可继续的工作', 'arrow') + '</div>', time: '今天 14:45', source: 'problem', label: '执行受阻记录' });
}
function interruptionEvent() {
  return event({ id: 'interrupted', kind: 'problem', marker: 'pause', title: state.prepared ? '接续摘要已准备好，等待执行会话接入' : '执行会话中断了，已有结果和下一步都还在', body: '<p>最后保存的结果是：首次使用的前两项已验证。接下来仍是重启恢复，不需要重新解释目标或重复已做的检查。</p><div class="event-actions">' + actionButton('handoff', state.prepared ? '查看交接摘要' : '准备接续', 'work', 'secondary') + '</div><p class="execution-note">原型只准备交接内容，不会启动真实执行会话。</p>', time: '今天 14:40', source: 'interrupted', label: '会话连接状态' });
}
function agreementEvent() {
  return event({ id: 'agreement', kind: 'decision', marker: 'decision', title: '已对齐：先做完整的内部使用路径', body: '<blockquote class="quote">先把 macOS 上从新项目开始的路径做好。范围内的本地修改和测试你直接做，公开发布前再问我。</blockquote><p style="margin-top:10px">这项约定持续生效，后续会话可以直接沿用。</p>', author: '一骏', time: '昨天 17:10', source: 'agreement', label: '用户原话与适用范围' });
}
function earlierEvents() {
  return [event({ id: 'discovery', kind: 'note', marker: 'note', title: '找到首次使用中最容易断开的两处', body: '<p>创建完成后不知道先做什么；拿到结果后不知道从哪里接着做。先修通这两处，再验证重启恢复。</p>', time: '昨天 16:40', source: 'discovery', label: '观察与工作计划' }), event({ id: 'created', kind: 'note', marker: 'goal', title: '从一个具体愿望开始', body: '<blockquote class="quote">我希望新用户不用理解一堆术语，也能把第一次协作完整做完。</blockquote>', author: '一骏', time: '昨天 16:20', source: 'created', label: '最初的意图' })];
}
function parentEvents() {
  return [event({ id: 'parent-result', kind: 'result', marker: 'branch', title: '安装路径已验证，首次协作还差重启接续', body: '<p>新机器上的安装和启动已经走通。首次协作完成了前半段，最后的重启接续还在验证；完整试用要等这段接上。</p>' + artifactButton('查看各项成果与缺口', '安装已完成 · 首次协作进行中 · 整体试用待验证', 'children'), time: '今天 14:32', source: 'parent', label: '来自相关子目标' }), event({ id: 'parent-plan', kind: 'note', marker: 'note', title: '以整条试用体验为完成标准', body: '<p>安装成功、首次协作顺畅并不自动证明整体可用。最后仍要从安装开始走完一次，并记录试用者遇到的问题。</p>', time: '昨天 17:20', source: 'parent-plan', label: '完成要求' })];
}
function renderHeader() {
  const config = demoConfig();
  $('#goal-header').innerHTML = `<div class="title-row"><div><h1 id="goal-title" tabindex="-1">${config.title}</h1><p class="goal-outcome">${config.outcome}</p></div><div class="header-actions">${actionButton('brief', '目标说明', 'file')}${actionButton('focus-note', '补充一条', 'plus')}</div></div>${planningEntryHtml()}`;
}
function baseCriteria() {
  if (['empty', 'custom'].includes(state.scenario)) return [];
  if (state.scenario === 'parent') return [
    { text: '新机器上能安装并启动', result: '已验证', done: true, target: 'parent-result' },
    { text: '首次目标协作完整可用', result: '等待接续验证', target: 'parent-result' },
    { text: '从安装到协作完整试用', result: '尚未验证', target: 'parent-plan' },
  ];
  const list = [
    { text: '能独立创建项目', result: '已验证', done: true, target: 'result' },
    { text: '能完成第一个真实目标', result: '已验证', done: true, target: 'result' },
    { text: '重启后能接着做', result: state.scenario === 'complete' ? '已验证' : state.scenario === 'blocked' ? '等待测试环境' : '尚未验证', done: state.scenario === 'complete', target: state.scenario === 'blocked' ? 'problem' : 'result' },
  ];
  if (state.scenario === 'complete') for (const item of list) item.target = 'completion';
  if (state.decision === 'include') list.push({ text: '旧项目数据完整导入', result: '新增 · 待处理', target: 'decision' });
  return list;
}
function overviewFacts() {
  const config = demoConfig();
  const facts = {
    lead: '首次协作的主链路已走通，最后一段重启接续还需要实测。',
    done: '项目创建、首个真实目标和结果核对已验证。',
    next: '验证重启后能接着做，找回结果、旧决定和下一步。',
    owner: 'Codex', risk: '接续可靠性尚未实测，暂不能宣称整条路径完整可用。',
  };
  if (state.scenario === 'decision') return { ...facts, lead: state.decision ? (state.decision === 'include' ? '首次协作继续收尾；旧项目导入刚刚纳入本轮。' : '范围已明确：这轮只做好新项目，继续验证重启接续。') : '首次协作继续收尾；旧项目导入是否加入本轮，等你决定。', next: state.decision === 'include' ? '继续重启验证，再补充旧项目导入方案。' : facts.next, risk: state.decision === 'include' ? '新增导入与数据完整性要求，完成时间需要重新评估。' : state.decision === 'later' ? facts.risk : '导入范围待一骏决定；不影响当前的重启验证。' };
  if (state.scenario === 'blocked') return { ...facts, lead: '已完成的两项结果仍然有效；重启实测暂时受阻。', next: '先整理恢复说明，测试环境恢复后补做重启实测。', risk: '干净测试环境不可用，只影响重启实测；其他工作可以继续。' };
  if (state.scenario === 'interrupted') return { ...facts, lead: '执行会话已中断；结果、约定和下一步都已保存。', next: '在新的执行会话中继续重启验证。', owner: '待接续', risk: state.prepared ? '交接摘要已准备；真实执行会话尚未接入。' : '当前无人执行，需要接入会话后继续。' };
  if (state.scenario === 'complete') return { ...facts, lead: '创建项目、拿到首个结果、重启接续，三段路径均已验证。', done: '本轮内部使用路径完整走通，结果与有效约定均可找回。', next: '本目标无需继续执行；公开发布另行决定。', owner: '一骏', risk: '尚未验证公开分发与 Windows，不包含在本次完成结论中。' };
  if (state.scenario === 'empty') return { ...facts, lead: '意图已保存，可以先观察首次使用中真正困难的地方。', done: '保留了最初想法，尚无执行结果。', next: '观察现有路径，再明确本轮希望改善的结果。', owner: '待分配', risk: '本轮范围和完成要求还未约定，无需为保存想法先补齐表格。' };
  if (state.scenario === 'parent') return { ...facts, lead: '安装已就绪；首次协作还差接续，整体验证尚未开始。', done: '新机器上的安装与启动已验证；首次协作完成了前半段。', next: '补齐首次协作，再从安装开始完成一次整体试用。', owner: 'Codex / 一骏', risk: '子目标成果尚未串成一次完整体验，不能只凭子项完成收口。' };
  return facts;
}
function renderSummary() {
  const { config, facts } = planningOverview(demoConfig(), overviewFacts());
  const expanded = $('#current-summary').classList.contains('is-expanded');
  $('#current-summary').innerHTML = `<div class="overview-heading"><h2>整体进展</h2><span class="state-pill ${config.tone}"><i aria-hidden="true"></i>${esc(config.status)}</span><div class="overview-tools"><span class="overview-timestamp">当前判断 · ${state.decision || state.prepared || state.planning.records.length ? '刚刚更新' : state.scenario === 'complete' ? '今天 16:20' : ['empty', 'custom'].includes(state.scenario) ? '刚刚保存' : '今天 14:32'}</span><button type="button" class="text-button" data-action="requirements">完成要求 ${icon('chevron')}</button><button type="button" class="text-button overview-toggle" data-action="overview" aria-expanded="${expanded}">${expanded ? '收起' : '展开'}</button></div></div><p class="overview-lead">${esc(facts.lead)}</p><p class="overview-mobile-next">${esc(facts.owner)} · ${esc(facts.next)}</p><div class="overview-grid"><section><h3>已经做成</h3><p>${esc(facts.done)}</p></section><section><h3>接下来做什么 · <span class="owner">${esc(facts.owner)}</span></h3><p>${esc(facts.next)}</p></section><section><h3>风险与待决定</h3><p class="risk-copy">${esc(facts.risk)}</p></section></div>`;
}
function getTimelineEvents() {
  const notes = state.notes.map((note, index) => event({ id: `note-${index}`, title: '补充了一条信息', body: `<p class="user-note">${esc(note.text)}</p><p class="proof-foot">已保留原话，尚未变更当前要求。</p>`, author: '你', time: note.time, source: `note-${index}`, label: '用户补充', localOrder: note.localOrder || 0 }));
  const localEvents = [...notes, ...planningTimelineEvents()].sort((left, right) => right.localOrder - left.localOrder);
  if (state.scenario === 'custom') return [...localEvents, ...customInitialEvents()];
  if (state.scenario === 'empty') return [...localEvents, event({ id: 'created', title: '创建目标，先把想法留下', marker: 'goal', body: '<blockquote class="quote">我觉得第一次使用还有点难，想让这段体验更顺畅。</blockquote><p>可以先观察最影响首次使用的地方，再明确本轮要改善的结果。</p><div class="event-actions">' + actionButton('draft', '看看可以怎样开始', 'arrow', 'secondary') + '</div>', author: '一骏', time: '刚刚', source: 'created', label: '最初的意图' })];
  if (state.scenario === 'parent') return [...localEvents, ...parentEvents()];
  const recent = [];
  if (state.scenario === 'decision') recent.push(decisionEvent());
  if (state.scenario === 'blocked') recent.push(problemEvent());
  if (state.scenario === 'interrupted') recent.push(interruptionEvent());
  if (state.scenario === 'complete') recent.push(resultEvent(true));
  recent.push(resultEvent(false));
  const milestones = [
    event({ id: 'restart-gap', kind: 'problem', title: '发现重启接续仍缺少一次实测', time: '今天 13:55', label: '检查缺口', body: '<p>恢复方案已经形成，但还没有从干净环境重启并换一个会话跑通。</p><p>这意味着前两段可以作为已验证结果保留；“整条路径完整可用”仍缺最后一项支持。</p>' + (state.scenario === 'complete' ? '<div class="callout">这条历史缺口已在今天 16:20 的完整验证中解决。顶部整体进展显示最新结论。</div>' : '') }),
    event({ id: 'first-result', kind: 'result', title: '第一个真实目标与产物已验证', time: '今天 13:20', label: '检查结果', body: '<p>用户从一个明确目标开始工作，执行后可以打开实际产物，核对它满足哪些完成要求。</p><p>结果和对应要求留在同一目标下。后续接续不需要重新从聊天里寻找它们。</p>' + artifactButton('查看本轮验证记录', '包括首个目标、产物和完成要求的核对') }),
    event({ id: 'project-created', kind: 'result', title: '新项目创建与重新打开已验证', time: '今天 11:40', label: '检查结果', body: '<p>从空白状态创建一个项目，能进入目标工作区。关闭页面再打开，刚创建的项目仍然可找到。</p><p>这一步验证的是项目创建和页面重新打开，不代表完整重启与新会话接续已经验证。</p>' }),
    event({ id: 'start-work', kind: 'note', title: '开始验证第一次使用的完整路径', time: '今天 09:15', label: '工作进展', body: '<p>沿创建项目、执行第一个目标、打开产物、重启接续的实际路径检查。</p><p>继续沿用已经确认的范围。检查中发现的新事实会留在这个目标下，不必重复申请本地修改和测试权限。</p>' }),
  ];
  return [...localEvents, ...recent, ...milestones, agreementEvent(), ...earlierEvents()];
}
function shortTitle(item) {
  const titles = { result: '本轮结果已汇总，待验证重启接续', completion: '完整路径已验证，目标完成', decision: state.decision ? (state.decision === 'include' ? '已决定：加入旧项目导入' : '已决定：这轮只做好新项目') : '旧项目导入，是否加入本轮？', problem: '重启实测受阻，其他工作继续', interrupted: state.prepared ? '交接已准备，等待会话接入' : '会话中断，结果与下一步已保存', agreement: '确认本轮范围与自主执行约定', discovery: '找到首次使用中两处断点', created: state.scenario === 'empty' ? '创建目标，先把想法留下' : '创建目标，记录最初意图', 'parent-result': '汇总子目标成果与剩余差距', 'parent-plan': '明确整条试用体验的完成要求' };
  return titles[item.id] || item.title;
}
function renderSelectedEvent() {
  const selected = visibleEvents.find(item => item.id === state.selected);
  $('#reader').hidden = true;
  $('#note-form').hidden = true;
  $('#event-detail').hidden = false;
  $('#previous-event').disabled = !selected || visibleEvents.indexOf(selected) === 0;
  $('#next-event').disabled = !selected || visibleEvents.indexOf(selected) === visibleEvents.length - 1;
  if (!selected) {
    $('#detail-location').textContent = '没有匹配的事件';
    $('#event-detail').innerHTML = '<p class="no-results">这个场景还没有这类事件。切回“全部”可以查看已保存的进展。</p>';
    return;
  }
  $('#detail-location').textContent = `${selected.time} · ${selected.label}`;
  $('#event-detail').innerHTML = `<article class="event ${selected.kind}" id="event-${selected.id}"><h2 id="selected-event-title" tabindex="-1">${esc(selected.title)}</h2>${meta(selected.author, selected.time, selected.source, selected.label)}${selected.body}${selected.status ? `<div class="event-state">${icon('check')}${selected.status}</div>` : ''}${state.scenario === 'complete' && selected.id === 'result' ? '<div class="callout">这是当时的阶段性结果。重启接续已在后续完成，顶部始终显示当前整体进展。</div>' : ''}</article>`;
  const proof = $('#event-detail').querySelector('details.proof');
  if (proof) proof.open = true;
  $('#event-detail').scrollTop = 0;
}
function renderTimeline() {
  const scroll = $('#timeline').scrollTop;
  const all = getTimelineEvents();
  visibleEvents = all.filter(item => filter === 'all' || item.kind === filter);
  if (!visibleEvents.some(item => item.id === state.selected)) state.selected = visibleEvents[0]?.id || null;
  let day = '';
  $('#timeline').innerHTML = visibleEvents.length ? visibleEvents.map(item => {
    const group = item.time.includes('昨天') ? '昨天 · 9 月 8 日' : '今天 · 9 月 9 日';
    const heading = group !== day ? `<div class="day-label">${group}</div>` : '';
    day = group;
    const time = item.time.includes('刚刚') ? '刚刚' : item.time.match(/\d{2}:\d{2}/)?.[0] || '';
    return `${heading}<button type="button" class="timeline-entry is-${item.kind}" id="time-${item.id}" data-event="${item.id}" aria-current="${item.id === state.selected}" aria-controls="event-detail" title="${esc(item.title)}"><time>${time}</time><span class="timeline-dot" aria-hidden="true"><i></i></span><span class="timeline-copy"><strong>${esc(shortTitle(item))}</strong><small>${esc(item.label)} · ${esc(item.author)}</small></span></button>`;
  }).join('') : '<p class="no-results">暂无这类事件</p>';
  $('#timeline').scrollTop = scroll;
  $('#event-count').textContent = String(visibleEvents.length);
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  renderSelectedEvent();
}
function selectEvent(id, focusContent = false) {
  if (!visibleEvents.some(item => item.id === id)) return;
  state.selected = id; save();
  document.querySelectorAll('[data-event]').forEach(button => button.setAttribute('aria-current', String(button.dataset.event === id)));
  renderSelectedEvent();
  $('#goal-layout').classList.add('show-event');
  if (focusContent || innerWidth <= 680) $('#selected-event-title')?.focus({ preventScroll: true });
}
function render() { renderHeader(); renderSummary(); renderTimeline(); $('#scenario').value = state.scenario; }
function openReader(title, html, opener) {
  if ($('#reader').hidden) { readerOpener = opener || document.activeElement; readerReturnAction = readerOpener?.dataset?.action || null; }
  $('#reader-title').textContent = title;
  $('#reader-content').innerHTML = html;
  $('#reader').hidden = false;
  $('#event-detail').hidden = true;
  $('#note-form').hidden = true;
  $('#goal-layout').classList.add('show-event');
  $('#reader-content').scrollTop = 0;
  $('#close-reader').focus({ preventScroll: true });
}
function closeReader() {
  if ($('#reader').hidden && $('#note-form').hidden) return;
  $('#reader').hidden = true;
  $('#note-form').hidden = true;
  $('#event-detail').hidden = false;
  const returnTarget = readerOpener?.isConnected ? readerOpener : readerReturnAction ? document.querySelector(`[data-action="${readerReturnAction}"]`) : document.querySelector(`[data-event="${state.selected}"]`);
  if (innerWidth <= 680) $('#selected-event-title')?.focus({ preventScroll: true });
  else returnTarget?.focus({ preventScroll: true });
}
function briefHtml() {
  if (state.scenario === 'custom') return customGoalBriefHtml();
  const config = demoConfig();
  if (state.scenario === 'empty') return `<p class="reader-lead">${config.title}</p><p class="reader-meta">当前仅保存意图 · 尚未确认完整范围</p><h3>最初想改善什么</h3><p>第一次使用还有点难，希望从创建项目到得到结果的路径更顺畅。</p><h3>还需要逐步明确</h3><p>最容易卡在哪里？希望先做好哪一段？怎样知道这段已经好用？</p><p>这些未知不会妨碍先保存意图或调查现状；明确完成前需要约定可核对的结果。</p>${planningRequirements().length ? requirementRowsHtml() : ''}${currentGoalFactsHtml()}`;
  if (state.scenario === 'parent') return `<p class="reader-lead">${config.title}</p><p class="reader-meta">当前有效说明 · 原型示例</p><h3>希望得到的结果</h3><p>${config.outcome}</p><h3>怎样知道完成</h3>${requirementRowsHtml()}${currentGoalFactsHtml()}<h3>相关目标</h3><button type="button" class="related-goal" data-action="children">安装与启动 · 首次协作 · 完整试用 →</button><h3>已经确认</h3><p>先内部试用；公开发布仍由一骏决定。</p><h3>整合责任</h3><p>子目标产出是整体验证的输入。Codex 汇总交付，一骏提供试用反馈，不用子目标完成数量代替整体结果。</p>`;
  return `<p class="reader-lead">${config.title}</p><p class="reader-meta">当前有效说明 · ${state.decision ? '刚刚更新' : '9 月 8 日确认'} · 原型示例</p><h3>希望得到的结果</h3><p>${config.outcome}</p><h3>为什么做</h3><p>第一次使用的人不应先学会证据、门槛和执行协议，才能知道自己有没有做完，以及怎样接着做。</p><h3>这次的范围</h3><div class="scope-row">${icon('check')}<span>macOS、本地新项目、第一次目标协作与重启接续。</span></div>${state.decision === 'include' ? `<div class="scope-row">${icon('check')}<span>旧项目导入；导入后项目、结果与已有决定保持完整。<br><small>刚刚由一骏加入，完成时间待评估。</small></span></div>` : `<div class="scope-row out">${icon('minus')}<span>旧项目数据导入${state.decision === 'later' ? '已明确留到后续' : '尚未纳入'}。</span></div>`}<div class="scope-row out">${icon('minus')}<span>Windows 支持与公开发布不在本轮范围内。</span></div><h3>怎样知道完成</h3>${requirementRowsHtml()}<h3>已经确认的决定</h3><blockquote class="quote">范围内的本地修改和测试直接做，公开发布前再问我。</blockquote><p class="reader-meta">一骏 · 9 月 8 日 17:10 · 适用于当前目标范围</p>${state.decision ? `<p>${state.decision === 'include' ? '刚刚：把旧项目导入加入本轮，并补充数据完整性要求。' : '刚刚：这轮只做好新项目，旧项目导入以后再做。'}</p>` : ''}${currentGoalFactsHtml()}<h3>相关目标与依赖</h3><button type="button" class="related-goal" data-action="children">属于：让 Molis Work 可以交给第一批用户试用 →</button><p>完整试用会使用本目标的成果。首次协作本身无需等待公开发布。</p><h3>过程与参考材料</h3><p>实际做法可根据发现调整；当前结果与缺口以对应要求的最新报告为准，已确认的范围与决定继续有效。</p><button type="button" class="related-goal" data-action="current-artifact">首次使用验证记录 →</button><button type="button" class="related-goal" data-action="handoff-read">接续所需的当前信息 →</button>`;
}
function artifactHtml(complete = false) {
  return `<p class="demo-note">这是一份用于体验设计的示例材料，并非真实测试报告。</p><p class="reader-lead">首次使用验证记录</p><p class="reader-meta">Codex · 9 月 9 日 ${complete ? '16:20' : '14:32'}</p><div class="flow-path"><span>创建项目</span>${icon('arrow')}<span>完成首个目标</span>${icon('arrow')}<span>重启接续</span></div><h3>结论</h3><p>${complete ? '三段路径均已在示例场景完成检查，可以支撑本轮内部使用目标。' : '前两段路径已验证；重启恢复仍缺一次干净环境的实测。'}</p><div class="mini-document"><h3>创建一个新项目</h3><p>从空白状态开始，用户能找到创建入口，创建后进入目标工作区。关闭页面再打开，项目仍可找到。</p><p class="result-line">${icon('circleCheck')}示例结果：通过</p><h3>完成第一个真实目标</h3><p>录入一个明确结果，执行后打开产物，并核对完成要求。产物和对应要求留在同一目标下。</p><p class="result-line">${icon('circleCheck')}示例结果：通过</p><h3>重启后继续</h3><p>重启后，新会话应能找回上次产物、当前有效范围、已经做过的决定和下一步，接着完成剩余工作。</p>${complete ? `<p class="result-line">${icon('circleCheck')}示例结果：通过，已从新会话完成接续</p>` : '<div class="callout">尚未验证。已有恢复方案不等于真实重启成功。</div>'}</div><h3>检查的范围</h3><p>macOS、本地项目、首次创建。没有检查 Windows 或公开安装分发；本记录不支持这些范围的完成结论。</p><h3>对应的完成要求</h3><p>独立创建项目；完成第一个真实目标；重启后能继续。</p><h3>来源与记录</h3><p>原型模拟了执行者提交的结果说明和观察记录。正式产品中此处会显示具体检查、文件、截图或其他可核对的产物，而不是只显示路径可访问。</p>`;
}
function handoffHtml() {
  const { config } = planningOverview(demoConfig(), overviewFacts());
  const scope = state.scenario === 'custom' ? '不使用已有模板；允许 Runtime 为当前 Goal 设计记录方式。' : state.scenario === 'empty' ? '先保留已有意图，范围与完成要求按当前目标说明逐步明确。' : state.scenario === 'parent' ? '先内部试用；公开发布由一骏决定。子目标结果需要整合验证。' : `macOS、本地新项目。范围内本地修改与测试直接做；公开发布前问一骏。${state.decision === 'include' ? '旧项目导入已加入本轮，需要满足数据完整性要求。' : state.scenario === 'decision' && !state.decision ? '旧项目导入是否加入本轮，仍待一骏决定。' : '旧项目导入不在本轮。'}`;
  return `<p class="demo-note">交接内容可供阅读；原型没有连接或启动任何执行会话。</p><p class="reader-lead">${esc(config.title)}</p><p class="reader-meta">当前状态：${esc(config.status)}</p><h3>要完成什么</h3><p>${esc(config.outcome)}</p><h3>当前要求与依据</h3>${planningRequirements().length ? requirementRowsHtml() : '<p>尚未约定完成要求，可以先调查与记录。</p>'}${currentGoalFactsHtml()}<h3>沿用哪些决定</h3><p>${esc(scope)}</p><h3>如何接续</h3><p>沿用已保存的结果、要求和决定，只处理当前缺口。报告保留来源；需核对报告时查看对应事件，不能仅因换了会话就重复已完成检查。</p><h3>接入状态</h3><p>当前原型没有真实 Runtime。正式产品由 Host 提供连接状态；新增工作记录不会改变实际连接。</p>`;
}
function sourceHtml(type) {
  const planningSource = planningSourceHtml(type);
  if (planningSource) return planningSource;
  const sources = {
    agreement: ['用户决定', '一骏', '9 月 8 日 17:10', '范围内的本地修改和测试直接做，公开发布前再问我。', '当前 macOS 新项目目标；公开发布未授权。'],
    decision: [state.decision ? '用户决定' : '模型建议', state.decision ? '一骏' : 'Codex', state.decision ? '刚刚' : '9 月 9 日 14:50', state.decision === 'include' ? '把旧项目导入加入本轮，并补充完成要求。' : state.decision === 'later' ? '这轮只做好新项目，旧项目导入以后再做。' : '旧项目导入是否纳入本轮？建议后续处理。', state.decision ? '已经按选择更新当前范围；原决定继续保留。' : '尚未成为正式范围，原有授权继续有效。'],
    result: ['执行者报告与检查材料', 'Codex', '9 月 9 日 14:32', '首次使用前两段已走通，重启恢复还差一次验证。', '只支持列出的两项结果，不代表完整 Goal 已完成。'],
    completion: ['完整检查材料', 'Codex', '9 月 9 日 16:20', '三项要求均已完成示例检查。', '仅覆盖本轮内部使用要求，不代表公开发布已获授权。'],
    problem: ['执行受阻记录', 'Codex', '9 月 9 日 14:45', '干净测试环境不可用。', '只影响重启实测；恢复说明仍可继续。'],
    interrupted: ['会话连接状态', 'Host（示例）', '9 月 9 日 14:40', '执行会话已断开，最后一轮结果已保存。', '准备接续内容不等于会话已重新连接。'],
    created: ['用户意图', '一骏', state.scenario === 'empty' ? '刚刚' : '9 月 8 日 16:20', state.scenario === 'empty' ? '我觉得第一次使用还有点难，想让这段体验更顺畅。' : '我希望新用户不用理解一堆术语，也能把第一次协作完整做完。', state.scenario === 'empty' ? '当前仅保存意图，尚未确认完成要求。' : '意图已保存；正式范围来自之后确认的目标说明。'],
    discovery: ['观察与建议', 'Codex', '9 月 8 日 16:40', '先修通创建后下一步与结果后接续。', '执行路径可调整，不自动改写目标要求。'],
    parent: ['子目标成果汇总', 'Molis Work（示例）', '9 月 9 日 14:32', '安装路径已完成，首次协作待接续，整体验证未运行。', '聚合保留来源；子目标完成不能自动证明整体验证通过。'],
    note: ['用户补充', '你', '当前浏览器会话', '保留在对应进展条目中的原话。', '只记录补充，尚未替代已确认范围或授权。'],
  };
  const matching = getTimelineEvents().find(item => item.source === type);
  const note = type.startsWith('note-') ? state.notes[Number(type.slice(5))] : null;
  const record = sources[type] || (matching ? [matching.label, matching.author, matching.time, note ? esc(note.text) : matching.title, '这是所选时间点的记录；顶部整体进展持续显示当前判断。'] : sources.result);
  return `<p class="demo-note">以下为原型中的来源示例，均不是真实生产记录。</p><dl class="source-list"><div><dt>这是什么</dt><dd>${record[0]}</dd></div><div><dt>由谁提供</dt><dd>${record[1]}</dd></div><div><dt>何时记录</dt><dd>${record[2]}</dd></div><div><dt>记录内容</dt><dd>${record[3]}</dd></div><div><dt>适用范围与限制</dt><dd>${record[4]}</dd></div></dl><h3>如何保留来路</h3><p>正式产品中关联原始消息、材料与执行记录。后续修订以新记录解释变化，历史结论保留，不会因归纳而被覆盖。</p>`;
}
function jumpToEvent(id, reveal = true) {
  filter = 'all';
  state.selected = id;
  renderTimeline();
  selectEvent(id, reveal);
  document.querySelector(`[data-event="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}
function handleAction(action, opener) {
  if (action === 'brief') openReader('目标说明', briefHtml(), opener);
  if (action === 'requirements') openReader('当前完成要求', planningRequirementsHtml(), opener);
  if (action === 'overview') { $('#current-summary').classList.toggle('is-expanded'); renderSummary(); }
  if (action === 'timeline') { $('#goal-layout').classList.remove('show-event'); document.querySelector(`[data-event="${state.selected}"]`)?.focus({ preventScroll: true }); }
  if (action === 'return-event') closeReader();
  if (action === 'artifact') openReader('事件关联的成果', artifactHtml(state.selected === 'completion'), opener);
  if (action === 'current-artifact') openReader('当前完整成果', currentResultsHtml(), opener);
  if (action === 'handoff' || action === 'handoff-read') {
    if (action === 'handoff') { state.prepared = true; save(); renderHeader(); renderSummary(); renderTimeline(); }
    openReader('接续所需的信息', handoffHtml(), opener);
  }
  if (action === 'focus-note') { readerOpener = opener; readerReturnAction = 'focus-note'; $('#event-detail').hidden = true; $('#reader').hidden = true; $('#note-form').hidden = false; $('#goal-layout').classList.add('show-event'); $('#note').focus({ preventScroll: true }); }
  if (action === 'blocker') openReader('重启验证为什么暂时做不了', '<p class="reader-lead">只有重启实测在等测试环境</p><h3>已经发生的情况</h3><p>干净测试环境当前不可用，因此不能证明全新环境中重启恢复可靠。此前两项检查结果仍保留。</p><h3>谁来处理</h3><p>Codex 在环境恢复后补做验证；如果环境需要用户权限，只请求恢复环境需要的具体操作。</p><h3>现在仍能做</h3><p>整理接续说明；检查已有结果、当前约定和下一步是否都能从 Goal 找到。保存这些结果不需要先解除实测阻塞。</p><h3>什么情况下可以继续实测</h3><p>有可用的干净 macOS 测试环境，并有在该环境中执行检查的权限。</p><h3>对完成的影响</h3><p>“重启后能接着做”仍显示尚未验证，不能据此宣称整个目标完成。</p>', opener);
  if (action === 'draft') openReader('从当前意图开始', '<p class="demo-note">这是一份示例草稿，尚未写入正式要求，也未调用 AI。</p><p class="reader-lead">先找出第一次使用最容易断开的地方</p><h3>已有意图</h3><p>希望第一次使用更顺畅，不需要先理解许多术语。</p><h3>可以先做的一步</h3><p>沿创建项目、第一次执行、查看结果、再次打开的路径观察现状，记录真实困难。</p><h3>值得明确的结果</h3><p>根据观察选择本轮最值得改善的部分，并说明什么表现代表已经好用。不必先填写整棵目标树。</p><h3>仍需决定</h3><p>先改善哪一段、做到什么程度。已有意图和调查结果都可以保留，未知不需要编造。</p>', opener);
  if (action === 'children') openReader('整条试用体验', `<p class="reader-lead">让 Molis Work 可以交给第一批用户试用</p><h3>安装与启动</h3><p>已有结果：新机器安装成功，能打开工作区。供首次协作使用。</p><h3>第一次目标协作</h3><p>${state.scenario === 'complete' ? '项目创建、第一个结果与重启接续均已验证，当前目标已完成。' : '项目创建和第一个结果已验证；重启接续仍在处理。'}这就是当前原型演示的目标。</p><h3>完整试用</h3><p>${state.scenario === 'complete' ? '现在可以使用安装与首次协作的结果，从头走一次完整试用；这项整体验证尚未运行。' : '使用安装和首次协作的结果，从头走完一次。尚未验证；它需要前两项的真实产物。'}</p><h3>责任与承接</h3><p>Codex 汇总路径与结果，一骏提供试用反馈。子目标的过程留在各自时间流；这里只呈现整体验收需要的成果和差距。</p><h3>没有丢掉的要求</h3><p>目标不因子项数量归零自动完成。整合体验需要对应的实际结果。</p>`, opener);
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.filter) { filter = button.dataset.filter; renderTimeline(); }
  if (button.dataset.event) selectEvent(button.dataset.event);
  if (button.dataset.action) handleAction(button.dataset.action, button);
  if (button.dataset.source) openReader('查看这条进展的来源', sourceHtml(button.dataset.source), button);
  if (button.dataset.jump) jumpToEvent(button.dataset.jump);
  if (button.dataset.readerJump) { closeReader(); jumpToEvent(button.dataset.readerJump); }
  if (button.dataset.decision) {
    state.decision = button.dataset.decision;
    save(); render();
    $('#selected-event-title').focus({ preventScroll: true });
    toast(state.decision === 'include' ? '已模拟更新范围与完成要求；你的决定留在时间流中。' : '已模拟记录决定；当前要求不变，重启验证继续。');
  }
});
$('#close-reader').innerHTML = icon('arrow') + '返回所选事件';
$('#brand').innerHTML = icon('goal');
$('#previous-event').innerHTML = icon('chevron');
$('#next-event').innerHTML = icon('chevron');
function adjacentEvent(direction) {
  const next = visibleEvents[visibleEvents.findIndex(item => item.id === state.selected) + direction];
  if (next) selectEvent(next.id);
  document.querySelector(`[data-event="${state.selected}"]`)?.scrollIntoView({ block: 'nearest' });
}
$('#previous-event').addEventListener('click', () => adjacentEvent(-1));
$('#next-event').addEventListener('click', () => adjacentEvent(1));
$('#close-reader').addEventListener('click', closeReader);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (!$('#reader').hidden || !$('#note-form').hidden)) closeReader();
  if (event.target.closest('[data-event]') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Home') selectEvent(visibleEvents[0]?.id);
    else if (event.key === 'End') selectEvent(visibleEvents.at(-1)?.id);
    else adjacentEvent(event.key === 'ArrowDown' ? 1 : -1);
    if (innerWidth > 680) document.querySelector(`[data-event="${state.selected}"]`)?.focus({ preventScroll: true });
  }
});
$('#scenario').addEventListener('change', (event) => {
  const selected = event.target.value;
  state = defaultState(selected);
  filter = 'all'; save(); closeReader(); render();
  $('#goal-layout').classList.remove('show-event');
  $('#note').value = '';
  toast('已切换示例 Goal；演示中的规划、记录与决定已重置。');
});
$('#reset-demo').addEventListener('click', () => {
  state = defaultState(); filter = 'all'; save(); closeReader(); render(); $('#note').value = '';
  $('#goal-layout').classList.remove('show-event');
  toast('演示已重置；未修改任何真实 Goal。');
});
$('#note-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#note').value.trim();
  if (!text) { $('#note').setCustomValidity('请写下要补充的信息。'); $('#note').reportValidity(); return; }
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  state.notes.push({ text, time: `刚刚 ${time}`, localOrder: state.nextLocalOrder++ });
  save(); filter = 'all'; renderTimeline(); $('#note').value = '';
  jumpToEvent(`note-${state.notes.length - 1}`, false);
  toast('已保留你的原话；当前目标要求与授权尚未变化。');
});
$('#note').addEventListener('input', () => $('#note').setCustomValidity(''));
render();
