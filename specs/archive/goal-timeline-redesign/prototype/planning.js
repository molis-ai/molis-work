// Goal-local planning and typed records for the independent interaction prototype.
// No AI, MCP, filesystem, or production service is called here.
const planningFamilies = { progress: '工作进展', delivery: '交付', verification: '验证', concern: 'Concern / 问题与风险', observation: '一般观察' };
const planningField = (id, label, format = 'longtext', required = true) => ({ id, label, format, required });
const engineeringTypes = [
  { id: 'eng-delivery', name: '变更交付', family: 'delivery', purpose: '说明可使用的变化、成果入口和已知缺口。', usage: '交付时记录', fields: [planningField('change', '交付了什么'), planningField('entry', '在哪里查看或使用'), planningField('limits', '已知缺口', 'longtext', false)] },
  { id: 'eng-verification', name: '行为验证', family: 'verification', purpose: '用实际观察说明本次变化是否满足对应要求。', usage: '行为变化时需要', fields: [planningField('method', '怎样检查'), planningField('observation', '实际观察到什么'), planningField('scope', '检查范围与限制')] },
  { id: 'eng-ui-check', name: '界面检查', family: 'verification', purpose: '检查实际页面、关键状态与交互，材料可按需要说明。', usage: '涉及界面时使用', fields: [planningField('surface', '检查的页面与状态'), planningField('observation', '检查结果'), planningField('materials', '截图或材料说明', 'longtext', false)] },
  { id: 'eng-concern', name: '问题与风险', family: 'concern', purpose: '留下需要持续关注的问题，明确影响对象与可继续的工作。', usage: '按需记录', fields: [planningField('problem', '什么问题或风险'), planningField('impact', '影响什么'), planningField('next', '建议谁来处理、怎么继续', 'longtext', false)] },
].map(type => ({ ...type, version: 1, author: '系统预置', origin: '工程开发 · v1' }));

function createPlanningState(scenario = 'progress') {
  return { mode: ['empty', 'custom'].includes(scenario) ? 'none' : 'engineering', revision: 1, types: [], requirements: [], records: [], runtimeDesigned: false };
}
function planningTypes() {
  return [...(state.planning.mode === 'engineering' ? engineeringTypes : []), ...state.planning.types];
}
function planningName() {
  return state.planning.mode === 'engineering' ? '工程开发' : state.planning.types.length ? '为这个 Goal 设计' : '未采用模板';
}
function latestRequirementReport(requirement) {
  return state.planning.records.slice().reverse().find(record => record.kind === 'report' && record.requirementId === requirement.id && record.type.id === requirement.typeId);
}
function planningRequirements() {
  const baseline = baseCriteria().map((item, index) => ({ ...item, id: `baseline-${index}`, typeId: 'eng-verification', origin: '当前 Goal 的结果约定', baseline: true }));
  return [...baseline, ...state.planning.requirements].map(requirement => {
    const report = latestRequirementReport(requirement);
    if (!report) return { ...requirement, result: requirement.result || '待记录', done: Boolean(requirement.done) };
    return { ...requirement, done: report.assessment === 'supports', result: report.assessment === 'supports' ? `${report.author}报告满足 · 未独立核对` : report.assessment === 'contradicts' ? `${report.author}报告未达到` : '已有记录 · 仍无法判断', target: report.id };
  });
}
function criteria() { return planningRequirements(); }
function planningEntryHtml() {
  return `<div class="goal-method"><button type="button" class="text-button" data-plan-action="open">${icon('branch')}工作规划：${planningName()} ${icon('chevron')}</button><span>${state.planning.mode === 'engineering' ? '内置方法 · 当前采用 v1' : '仅用于当前 Goal'}</span></div>`;
}
function requirementRowsHtml(requirements = planningRequirements()) {
  return requirements.map(requirement => {
    const action = requirement.target ? `data-reader-jump="${requirement.target}"` : `data-plan-report="${requirement.typeId}"`;
    return `<button type="button" class="criterion ${requirement.done ? '' : 'pending'}" ${action}>${icon(requirement.done ? 'circleCheck' : 'clock')}<span><strong>${esc(requirement.text)}</strong><small>${esc(requirement.result)} · ${requirement.target ? '查看对应事件' : '记录结果'}</small><small>${esc(requirement.origin)}</small></span></button>`;
  }).join('');
}
function planningRequirementsHtml() {
  const requirements = planningRequirements();
  return `<p class="reader-lead">${esc(demoConfig().title)}</p><p class="reader-meta">${planningName()} · 当前有效要求</p>${requirements.length ? `<div class="plan-requirements">${requirementRowsHtml(requirements)}</div><p class="reader-meta">记录是否支持具体结果，需要有明确结论；事件数量不代表完成。新记录中的“报告满足”保留报告者来源。</p>` : '<div class="plan-empty"><p>还没有约定完成要求。</p><p>可以先观察、记录；在明确完成前，再说明需要得到什么。</p></div>'}<button type="button" class="summary-link" data-plan-action="open">查看工作规划与事件类型 ${icon('arrow')}</button>`;
}
function planningHtml() {
  const types = planningTypes(), requirements = planningRequirements();
  return `<div class="plan-intro"><p class="reader-lead">${planningName()}</p><p>${state.planning.mode === 'engineering' ? '围绕实际变化交付结果，用适合这次工作的方式验证。推进方法可以调整。' : types.length ? '记录方式在这个目标内生效，后续会话可以沿用。' : '这个任务从空白开始。先按目标需要设计记录方式，也可以先补充一条普通观察。'}</p><p class="reader-meta">${state.planning.mode === 'engineering' ? '系统预置 · 工程开发 v1' : '未使用任何已有模板'} · 当前 Goal 配置第 ${state.planning.revision} 版</p><div class="plan-entry-actions"><button type="button" class="button secondary" data-plan-action="new-type">${icon('plus')}新增事件类型</button>${types.length ? '<button type="button" class="text-button" data-plan-action="show-types">查看可记录的事件</button>' : ''}</div></div>
  ${state.scenario === 'custom' && !state.planning.runtimeDesigned ? '<div class="plan-demo"><p>体验 Runtime 自由规划</p><p class="reader-meta">模拟 Runtime 根据这个故事目标设计并登记类型；使用预写示例，不调用 AI。</p><button type="button" class="button secondary" data-plan-action="runtime-design">演示 Runtime 设计并登记</button></div>' : ''}
  <section class="plan-section"><div class="section-heading"><h3>完成前需要什么</h3><span>${requirements.length ? `${requirements.filter(item => item.done).length} / ${requirements.length} 项有支持` : '尚未约定'}</span></div>${requirements.length ? requirementRowsHtml(requirements) : '<p class="reader-meta">登记类型时，可以把它关联到一项具体完成要求。普通观察无需先补齐计划。</p>'}</section>
  <section class="plan-section" id="planning-event-types"><div class="section-heading"><h3>可以记录哪些事件</h3><button type="button" class="text-button" data-plan-action="new-type">${icon('plus')}新增类型</button></div>${types.length ? `<div class="event-type-list">${types.map(type => `<button type="button" class="event-type-row" data-plan-type="${type.id}"><span><strong>${esc(type.name)}</strong><small>${esc(type.purpose)}</small><small>${esc(type.origin)} · ${esc(type.author)}</small></span><span class="type-usage">${planningRequirements().some(item => item.typeId === type.id) ? '完成前需要' : esc(type.usage || '按需记录')}${icon('chevron')}</span></button>`).join('')}</div>` : '<div class="plan-empty"><p>还没有专属事件类型。</p><p>比如为这个故事增加“规则实验”，记录玩家的选择与故事回应。</p><button type="button" class="button" data-plan-action="new-type">设计第一个类型</button></div>'}</section>
  <details class="plan-guidance"><summary>方法与使用范围</summary><p>${state.planning.mode === 'engineering' ? '先理解当前结果与受影响路径，再决定实现和验证方式。只在涉及界面、迁移或发布时采用相应检查；不把全部类型变成必经步骤。' : 'Runtime 可以在已有授权内设计本目标的记录方式。用户的原始目标与明确验收继续有效。'}</p><p>新增类型只影响这个 Goal。当前版本保留在这里，规划库升级不会自动修改这次约定。</p></details>`;
}
function openPlanning(opener) { openReader('工作规划', planningHtml(), opener); }
function planningTypeHtml(type) {
  const requirements = planningRequirements().filter(item => item.typeId === type.id);
  return `<button type="button" class="text-button plan-return" data-plan-action="open">${icon('arrow')}返回工作规划</button><p class="reader-lead">${esc(type.name)}</p><p>${esc(type.purpose)}</p><p class="reader-meta">${esc(type.origin)} · ${esc(type.author)} · v${type.version} · ${planningFamilies[type.family]}</p><h3>这类事件记录什么</h3><dl class="type-fields">${type.fields.map(field => `<div><dt>${esc(field.label)}<span>${field.required ? '必填' : '可选'}</span></dt><dd>${field.format === 'text' ? '简短文字' : '详细文字'}</dd></div>`).join('')}</dl><h3>对完成的要求</h3>${requirements.length ? requirementRowsHtml(requirements) : '<p>按实际需要记录；仅新增这个类型，不会自动增加完成要求。</p>'}<div class="event-actions"><button type="button" class="button primary" data-plan-report="${type.id}">记录一条${esc(type.name)}</button></div>`;
}
function fieldEditorRow(index) {
  return `<fieldset class="field-editor-row"><legend>字段 ${index}</legend><label>字段名称<input name="field-label" type="text" maxlength="40" required placeholder="例如：玩家做了什么"></label><label>内容形式<select name="field-format"><option value="longtext">详细文字</option><option value="text">简短文字</option></select></label><label class="check-label"><input type="checkbox" name="field-required" checked>必填</label><button type="button" class="text-button remove-field" data-plan-action="remove-field" aria-label="移除字段 ${index}">移除</button></fieldset>`;
}
function typeEditorHtml() {
  return `<button type="button" class="text-button plan-return" data-plan-action="open">${icon('arrow')}返回工作规划</button><p class="reader-lead">为这个 Goal 增加记录方式</p><p class="reader-meta">只在当前目标内使用。已有的要求与规划库保持原样。</p><form id="event-type-form" class="planning-form"><label for="type-name">事件名称<input id="type-name" name="type-name" type="text" maxlength="40" placeholder="例如：规则实验" required></label><label for="type-purpose">什么时候用、记录什么<textarea id="type-purpose" name="type-purpose" rows="2" maxlength="500" placeholder="尝试一条故事规则，留下选择、回应与实际观察。" required></textarea></label><label for="type-family">它属于哪类信息<select id="type-family" name="type-family">${Object.entries(planningFamilies).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><div class="section-heading"><h3>需要填写的内容</h3><button type="button" class="text-button" data-plan-action="add-field">${icon('plus')}增加字段</button></div><div id="type-fields-editor">${fieldEditorRow(1).replace('class="text-button remove-field"', 'class="text-button remove-field" disabled')}</div><div class="requirement-editor"><label class="check-label"><input id="type-required" name="type-required" type="checkbox">完成这个 Goal 前，需要这类记录</label><label id="requirement-description-label" for="type-requirement" hidden>这类记录需要说明什么结果<textarea id="type-requirement" name="type-requirement" rows="2" maxlength="300" disabled placeholder="例如：玩家的选择会改变故事回应，且能体验完整片段。"></textarea></label><p class="reader-meta">必需的是对具体结果的支持，不能只靠出现过一次记录。</p></div><button type="submit" class="button primary">登记到当前 Goal</button></form>`;
}
function reportFormHtml(type) {
  const requirements = planningRequirements().filter(item => item.typeId === type.id);
  return `<button type="button" class="text-button plan-return" data-plan-type="${type.id}">${icon('arrow')}返回类型说明</button><p class="reader-lead">记录${esc(type.name)}</p><p class="reader-meta">${esc(type.origin)} · v${type.version} · 本次记录者：你</p><form id="typed-event-form" data-type-id="${type.id}" class="planning-form"><label for="report-title">一句话说清这次发生了什么<input id="report-title" name="report-title" type="text" maxlength="100" placeholder="先写结论，再补充下面的内容" required></label>${type.fields.map(field => `<label for="report-${field.id}">${esc(field.label)} <span class="field-hint">${field.required ? '必填' : '可选'}</span>${field.format === 'text' ? `<input id="report-${field.id}" name="${field.id}" type="text" maxlength="1000" ${field.required ? 'required' : ''}>` : `<textarea id="report-${field.id}" name="${field.id}" rows="3" maxlength="5000" ${field.required ? 'required' : ''}></textarea>`}</label>`).join('')}${requirements.length ? `<div class="report-assessment"><label for="report-requirement">对应哪项完成要求<select id="report-requirement" name="report-requirement"><option value="">只记录，不作完成判断</option>${requirements.map(item => `<option value="${item.id}">${esc(item.text)}</option>`).join('')}</select></label><label for="report-assessment">对这项要求的结论<select id="report-assessment" name="report-assessment" disabled><option value="unknown">仍无法判断</option><option value="supports">本次观察支持达到要求</option><option value="contradicts">本次观察表明尚未达到</option></select></label><p class="reader-meta">结论保留你的来源，未经过独立核对；提交记录不会自动结束目标。</p></div>` : '<p class="reader-meta">这类记录没有关联的完成要求；提交后作为工作事实保留。</p>'}<button type="submit" class="button primary">记录到时间线</button></form>`;
}
function commitPlanningRecord(record) {
  const at = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  record.id = `plan-${crypto.randomUUID()}`;
  record.time = `刚刚 ${at}`;
  record.localOrder = state.nextLocalOrder++;
  state.planning.records.push(record);
  state.selected = record.id;
  filter = 'all';
  save(); render(); selectEvent(record.id, true);
}
function runtimeDesignExample() {
  if (state.planning.runtimeDesigned) return;
  const types = [
    { id: 'story-delivery', name: '故事片段交付', family: 'delivery', purpose: '说明可以体验的片段、体验方式和范围。', fields: [planningField('piece', '交付了什么片段'), planningField('entry', '怎样体验'), planningField('limits', '已知限制', 'longtext', false)] },
    { id: 'story-experiment', name: '规则实验', family: 'verification', purpose: '核对玩家的不同选择是否带来有意义的不同回应。', fields: [planningField('scene', '实验场景', 'text'), planningField('choice', '玩家做了什么选择'), planningField('response', '故事实际怎样回应')] },
    { id: 'story-observation', name: '玩家观察', family: 'observation', purpose: '留下玩家的行为和感受，为后续调整提供线索。', fields: [planningField('behavior', '观察到什么'), planningField('meaning', '对体验有什么影响'), planningField('next', '建议下一步', 'longtext', false)] },
  ].map(type => ({ ...type, version: 1, author: 'Codex', origin: 'Runtime 为当前 Goal 设计' }));
  const requirements = [
    { id: 'story-playable', text: '有一段能从开始体验到结束的故事', typeId: 'story-delivery', origin: 'Runtime 为当前 Goal 设计' },
    { id: 'story-response', text: '不同选择带来可观察的不同回应', typeId: 'story-experiment', origin: 'Runtime 为当前 Goal 设计' },
  ];
  state.planning.types.push(...types);
  state.planning.requirements.push(...requirements);
  state.planning.mode = 'local'; state.planning.runtimeDesigned = true; state.planning.revision += 1;
  commitPlanningRecord({ kind: 'configuration', title: '已为这个故事设计三种记录方式', author: 'Codex', types: structuredClone(types), requirements: structuredClone(requirements), summary: '沿用“做出可体验片段，并让玩家选择影响回应”的目标。故事交付和规则实验分别支持两项结果要求；玩家观察按需记录。', simulated: true });
  toast('已演示 Runtime 登记；三种类型只在这个 Goal 内生效。');
}
function planningEventBody(record) {
  if (record.kind === 'configuration') return `${record.simulated ? '<p class="demo-note">以下为预写的 Runtime 上报示例，没有调用真实 AI。</p>' : ''}<p>${esc(record.summary)}</p><h3 class="record-section-title">本次登记</h3><dl class="type-fields">${record.types.map(type => `<div><dt>${esc(type.name)}<span>${planningFamilies[type.family]}</span></dt><dd>${type.fields.map(field => `${esc(field.label)}${field.required ? '' : '（可选）'}`).join(' · ')}</dd></div>`).join('')}</dl>${record.requirements.length ? `<h3 class="record-section-title">本次增加的完成要求</h3><ul class="record-list">${record.requirements.map(item => `<li>${esc(item.text)}</li>`).join('')}</ul>` : '<p>没有增加完成要求。</p>'}<p class="reader-meta">这是当时的配置记录；后续新增类型不会改写这里。</p><div class="event-actions"><button type="button" class="button secondary" data-plan-action="open">查看当前工作规划</button></div>`;
  const requirement = planningRequirements().find(item => item.id === record.requirementId);
  const judgment = record.assessment === 'supports' ? '报告满足 · 未独立核对' : record.assessment === 'contradicts' ? '报告未达到' : '仍无法判断';
  return `<p class="reader-meta">${esc(record.type.origin)} · 类型 v${record.type.version}</p><dl class="record-fields">${record.type.fields.map(field => `<div><dt>${esc(field.label)}</dt><dd>${esc(record.payload[field.id] || '未填写（可选）')}</dd></div>`).join('')}</dl>${requirement ? `<div class="record-assessment"><strong>${esc(requirement.text)}</strong><p>${esc(record.author)}：${judgment}</p><p class="reader-meta">本次报告保留来源；不代表独立验收或目标自动完成。</p></div>` : '<p class="reader-meta">本次只记录事实，没有对完成要求作结论。</p>'}<button type="button" class="summary-link" data-action="requirements">查看当前完成要求 ${icon('arrow')}</button>`;
}
function planningTimelineEvents() {
  return state.planning.records.slice().reverse().map(record => event({ id: record.id, kind: record.kind === 'configuration' ? 'note' : record.type.family === 'concern' || record.assessment === 'contradicts' ? 'problem' : ['delivery', 'verification'].includes(record.type.family) ? 'result' : 'note', title: record.title, body: planningEventBody(record), author: record.author, time: record.time, label: record.kind === 'configuration' ? '工作规划调整' : record.type.name, localOrder: record.localOrder }));
}
function customInitialEvents() {
  return [event({ id: 'custom-created', title: '先做一个会回应玩家选择的故事', author: '一骏', time: '刚刚', label: '目标与规划授权', body: '<blockquote class="quote">不用已有模板。先做出一个可以体验的互动故事片段，玩家选择要能影响回应。记录方式你根据这个目标来设计。</blockquote><p>这是新任务示例。Runtime 可以先设计本 Goal 的事件类型，也可以先留下观察。</p><div class="event-actions"><button type="button" class="button secondary" data-plan-action="open">查看工作规划</button></div>' })];
}
function customGoalConfig() {
  return { title: '做出一段会回应玩家选择的互动故事', outcome: '让玩家从头体验一个片段，并从不同选择中看到不同的故事回应。', status: '探索中', tone: '', actor: '暂无真实执行会话', note: '未采用已有模板', next: '根据这个目标设计记录方式，再做可体验片段。', owner: 'Runtime · 设计与推进', helper: '当前是独立原型中的全新任务示例。' };
}
function customGoalBriefHtml() {
  return `<p class="reader-lead">${esc(customGoalConfig().title)}</p><h3>本次希望得到什么</h3><p>${esc(customGoalConfig().outcome)}</p><h3>已经约定</h3><p>不使用已有模板。允许 Runtime 为当前 Goal 设计记录方式；类型不自动写入项目方法库。</p><h3>当前完成要求</h3>${planningRequirements().length ? requirementRowsHtml() : '<p>先保留目标意图，随后补充具体交付与验证要求。</p>'}${currentGoalFactsHtml()}<button type="button" class="summary-link" data-plan-action="open">查看工作规划 ${icon('arrow')}</button>`;
}
function planningOverview(config, facts) {
  if (state.scenario === 'custom') facts = { lead: '目标已留下，可以先观察或设计本 Goal 的记录方式。', done: '保留了可体验片段与选择反馈的目标。', next: '设计记录方式，再制作可体验片段。', owner: '待接续', risk: '尚未得到工作结果，具体完成要求待明确。' };
  const requirements = planningRequirements();
  const reports = state.planning.records.filter(item => item.kind === 'report');
  const affected = requirements.filter(item => latestRequirementReport(item));
  const concerns = reports.filter(item => item.type.family === 'concern');
  const changedRequirements = affected.length || state.planning.requirements.length;
  let currentConfig = { ...config }, currentFacts = { ...facts };

  // Recompute result facts only when a report or configuration affects a requirement.
  // A work record cannot resolve a decision, reconnect a session, or revoke completion.
  if (changedRequirements) {
    const pending = requirements.filter(item => !item.done);
    const negative = affected.filter(item => latestRequirementReport(item).assessment === 'contradicts');
    const supported = requirements.filter(item => item.done);
    const independent = [];
    if (state.scenario === 'decision' && !state.decision) independent.push('旧项目导入是否加入本轮，仍待一骏决定。');
    if (state.decision === 'include') independent.push('旧项目导入已加入本轮，完成时间需要重新评估。');
    if (state.scenario === 'blocked') independent.push('原测试环境仍不可用，尚无环境恢复记录。');
    if (state.scenario === 'interrupted') independent.push(state.prepared ? '交接已准备；真实执行会话尚未接入。' : '执行会话仍未连接，需要接入后继续。');
    if (state.scenario === 'complete') independent.push('公开分发与 Windows 不包含在本轮结果范围内。');
    const keepCompleted = state.scenario === 'complete' && !pending.length;
    const resultRisk = negative.length ? `报告未达到：${negative.map(item => item.text).join('；')}。` : pending.length ? `还需结果支持：${pending.map(item => item.text).join('；')}。` : keepCompleted ? '' : '现有要求均有结果支持，仍需形成明确的收尾结论。';
    currentFacts = {
      lead: negative.length ? '新报告指出了结果差距，已有记录与决定继续保留。' : pending.length ? '当前要求已有更新，接下来补齐尚无支持的结果。' : keepCompleted ? '本轮完成结论保留，补充报告可从对应要求查看。' : '当前要求均有结果支持，报告来源与待处理事项仍需核对。',
      done: supported.length ? supported.map(item => `${item.text}：${item.result}`).join('；') + '。' : '尚无支持当前要求的完整结果；已有观察保留在时间线中。',
      next: keepCompleted ? facts.next : pending.length ? `继续处理：${(negative[0] || pending[0]).text}。` : '核对现有报告与已知缺口，再形成收尾结论；已有检查无需重复。',
      owner: facts.owner,
      risk: [...independent, resultRisk].filter(Boolean).join(' '),
    };
    if (state.scenario === 'blocked') currentFacts.next = `先整理当前结果与恢复说明。${currentFacts.next}`;
    if (state.scenario === 'interrupted') currentFacts.next = `接入执行会话后，${currentFacts.next}`;
    if (state.scenario === 'decision' && !state.decision) currentFacts.next += ' 导入范围仍待决定。';
    const preserveStatus = ['blocked', 'interrupted'].includes(state.scenario) || (state.scenario === 'decision' && !state.decision) || keepCompleted;
    if (!preserveStatus) currentConfig = { ...config, status: negative.length || (state.scenario === 'complete' && pending.length) ? '需跟进' : pending.length ? '进行中' : '待收尾', tone: negative.length || (state.scenario === 'complete' && pending.length) ? 'is-amber' : '' };
  }
  const latest = reports.at(-1);
  if (latest) currentFacts.lead += ` 最新记录：${latest.author} · ${latest.title}。`;
  if (concerns.length) currentFacts.risk += ` 仍需关注：${concerns.at(-1).title}。`;
  return { config: currentConfig, facts: currentFacts };
}
function currentGoalFactsHtml() {
  const { facts } = planningOverview(demoConfig(), overviewFacts());
  return `<h3>当前结果</h3><p>${esc(facts.done)}</p><h3>下一步与责任</h3><p>${esc(facts.next)}</p><p class="reader-meta">${esc(facts.owner)}</p><h3>风险与待处理事项</h3><p>${esc(facts.risk)}</p>`;
}
function currentResultsHtml() {
  return `<p class="demo-note">这是独立原型中的当前结果汇总；示例检查和用户报告都保留各自来源。</p><p class="reader-lead">${esc(demoConfig().title)}</p>${planningRequirements().length ? requirementRowsHtml() : '<p>尚未约定完成要求。</p>'}${currentGoalFactsHtml()}<p class="reader-meta">点击要求查看当前依据。历史事件中的附件仍保留当时的检查范围和结论。</p>`;
}
function planningSourceHtml(id) {
  const record = state.planning.records.find(item => item.id === id);
  if (!record) return null;
  return `<p class="reader-lead">${esc(record.title)}</p><dl class="source-list"><div><dt>记录者</dt><dd>${esc(record.author)}</dd></div><div><dt>来源</dt><dd>${record.simulated ? '预写的 Runtime 设计示例；未调用 AI。' : '你在当前独立原型中的输入。'}</dd></div><div><dt>作用范围</dt><dd>仅当前示例 Goal；没有写入生产数据或项目规划库。</dd></div><div><dt>当时的数据</dt><dd>事件保留登记时的字段定义和输入内容；后续新增类型不会改写旧记录。</dd></div></dl>`;
}
function validateTrimmedFields(form) {
  for (const input of form.querySelectorAll('input[type="text"][required], textarea[required]')) {
    if (!input.value.trim()) { input.setCustomValidity('请填写实际内容，不能只有空格。'); input.reportValidity(); return false; }
  }
  return true;
}
document.addEventListener('input', event => {
  if (event.target.closest('.planning-form') && event.target.setCustomValidity) event.target.setCustomValidity('');
});
document.addEventListener('change', event => {
  if (event.target.id === 'type-required') {
    $('#requirement-description-label').hidden = !event.target.checked;
    $('#type-requirement').disabled = !event.target.checked;
    $('#type-requirement').required = event.target.checked;
  }
  if (event.target.id === 'report-requirement') $('#report-assessment').disabled = !event.target.value;
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.planAction;
  if (action === 'open') openPlanning(button);
  if (action === 'show-types') { $('#planning-event-types').scrollIntoView({ block: 'start' }); $('#planning-event-types').querySelector('button')?.focus({ preventScroll: true }); }
  if (action === 'new-type') { openReader('新增事件类型', typeEditorHtml(), button); $('#type-name').focus({ preventScroll: true }); }
  if (action === 'runtime-design') runtimeDesignExample();
  if (action === 'add-field') {
    const container = $('#type-fields-editor');
    container.insertAdjacentHTML('beforeend', fieldEditorRow(container.children.length + 1));
    container.lastElementChild.querySelector('input').focus();
    container.querySelectorAll('.remove-field').forEach(item => item.disabled = false);
  }
  if (action === 'remove-field' && $('#type-fields-editor').children.length > 1) {
    const container = $('#type-fields-editor');
    button.closest('fieldset').remove();
    [...container.children].forEach((row, index) => { row.querySelector('legend').textContent = `字段 ${index + 1}`; row.querySelector('.remove-field').setAttribute('aria-label', `移除字段 ${index + 1}`); });
    container.querySelectorAll('.remove-field').forEach(item => item.disabled = container.children.length === 1);
    container.lastElementChild.querySelector('input').focus();
  }
  if (button.dataset.planType) {
    const type = planningTypes().find(item => item.id === button.dataset.planType);
    if (type) openReader('事件类型', planningTypeHtml(type), button);
  }
  if (button.dataset.planReport) {
    const type = planningTypes().find(item => item.id === button.dataset.planReport);
    if (type) { openReader('记录一个事件', reportFormHtml(type), button); $('#report-title').focus({ preventScroll: true }); }
  }
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!['event-type-form', 'typed-event-form'].includes(form.id)) return;
  event.preventDefault();
  if (!validateTrimmedFields(form)) return;
  const values = new FormData(form);
  if (form.id === 'event-type-form') {
    const name = values.get('type-name').trim();
    if (planningTypes().some(type => type.name === name)) { $('#type-name').setCustomValidity('当前 Goal 已有同名类型，请换一个便于区分的名称。'); $('#type-name').reportValidity(); return; }
    const rows = [...form.querySelectorAll('.field-editor-row')];
    const labels = rows.map(row => row.querySelector('[name="field-label"]').value.trim());
    const duplicate = labels.findIndex((label, index) => labels.indexOf(label) !== index);
    if (duplicate !== -1) { const input = rows[duplicate].querySelector('[name="field-label"]'); input.setCustomValidity('字段名称需要能互相区分。'); input.reportValidity(); return; }
    const type = { id: `local-${crypto.randomUUID()}`, version: 1, name, purpose: values.get('type-purpose').trim(), family: values.get('type-family'), author: '你', origin: '用户为当前 Goal 设计', fields: rows.map((row, index) => planningField(`field-${index + 1}`, labels[index], row.querySelector('[name="field-format"]').value, row.querySelector('[name="field-required"]').checked)) };
    const requirements = values.has('type-required') ? [{ id: `req-${crypto.randomUUID()}`, typeId: type.id, text: values.get('type-requirement').trim(), origin: '你为当前 Goal 设置' }] : [];
    state.planning.types.push(type); state.planning.requirements.push(...requirements); state.planning.revision += 1;
    if (state.planning.mode === 'none') state.planning.mode = 'local';
    commitPlanningRecord({ kind: 'configuration', title: `新增记录方式：${name}`, author: '你', types: [structuredClone(type)], requirements: structuredClone(requirements), summary: requirements.length ? '为当前 Goal 增加一种记录方式，并设置它需要支持的具体完成结果。' : '为当前 Goal 增加一种按需使用的记录方式，原有完成要求不变。' });
    toast('已登记到当前 Goal；可从工作规划打开新类型并记录。');
  } else {
    const type = planningTypes().find(item => item.id === form.dataset.typeId);
    if (!type) return;
    const requirementId = values.get('report-requirement') || null;
    commitPlanningRecord({ kind: 'report', title: values.get('report-title').trim(), author: '你', type: structuredClone(type), payload: Object.fromEntries(type.fields.map(field => [field.id, values.get(field.id)?.trim() || ''])), requirementId, assessment: requirementId ? values.get('report-assessment') : 'unknown' });
    toast('事件已保存；当前要求按这次报告更新，目标没有自动结束。');
  }
});
