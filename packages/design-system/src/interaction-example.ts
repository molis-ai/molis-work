import { renderInteractionComposerTarget, renderInteractionNextSteps, renderInteractionOperation, renderInteractionOptions, renderInteractionQuestion,
  type InteractionField, type InteractionOperationView } from './interaction.js';
import { INTERACTION_STYLES } from './styles/interaction.js';

const calendar = { months: [{ year: 2026, month: 9 }, { year: 2026, month: 10 }], today: '2026-10-12' };
const fields = (errors: Partial<Record<string, string>> = {}, refreshed?: string): InteractionField[] => [
  { id: 'format', label: '沟通方式', hint: '推荐依据：两项重点都需要现场演示。', control: { kind: 'choice', options: [
    { value: 'together', label: '一起复盘', description: '先对齐体验，再定下一步', recommended: true, selected: true },
    { value: 'async', label: '异步审阅', description: '先读材料，在文档里留判断' }] } },
  { id: 'topics', label: '重点看什么', hint: '可以多选。选中只是在填写参数。', control: { kind: 'choice', multiple: true, options: [
    { value: 'first', label: '首次使用', selected: true }, { value: 'recovery', label: '失败与恢复', selected: true }, { value: 'detail', label: '交互细节' }] } },
  { id: 'notes', label: '补充要求', hint: '也可以在输入框里说，回车后放进这里。', error: errors.notes,
    control: { kind: 'text', multiline: true, value: '只看首次使用，时长改为 45 分钟', placeholder: '例如：只讨论首次使用遇到的卡点' },
    notice: { text: '补充里写了「时长 45 分钟」，字段里是 30 分钟。用哪个？', actions: [{ id: 'adopt', label: '采用文字里的时长' }, { id: 'keep', label: '保留字段值', variant: 'ghost' }] } },
  { id: 'minutes', label: '预计时长', hint: '15–120 分钟，整数。', error: errors.minutes, refreshed,
    control: { kind: 'number', value: errors.minutes ? 'two' : '30', unit: '分钟', step: 5, stepLabels: ['减少 5 分钟', '增加 5 分钟'] } },
  { id: 'date', label: '准备截止', hint: '需要在开始当天或之前准备好。', control: { kind: 'date', value: '2026-10-15', weekday: '周四', calendar } },
  { id: 'when', label: '开始时间', hint: '时区随问题给定，不需要输入。', control: { kind: 'datetime', date: '2026-10-16', time: '10:00', weekday: '周五', zone: '洛杉矶时间 · UTC−07:00', calendar } },
  { id: 'materials', label: '关联材料', hint: '从可用材料里选 1–2 份 · 已选 1', error: errors.materials, control: { kind: 'reference', candidates: [
    { id: 'goal', label: '秋季工作台 · 内部试用', meta: 'Goal', icon: 'target', selected: !errors.materials },
    { id: 'notes', label: '10 月试用反馈摘录', meta: '文档', icon: 'file' }] } },
];
const footer = (note: string, error = false) => ({ note, error, keys: '⌘ / Ctrl + 回车 提交', actions: [{ id: 'cancel', label: '不回答', variant: 'ghost' as const }, { id: 'submit', label: '提交回答', variant: 'primary' as const, type: 'submit' as const }] });
const answeredRows: Array<[string, string]> = [['沟通方式', '一起复盘'], ['重点看什么', '首次使用、失败与恢复'], ['补充要求', '只看首次使用'], ['预计时长', '45 分钟'], ['开始时间', '2026-10-16 10:00（UTC−07:00）'], ['关联材料', '秋季工作台 · 内部试用']];
const operation = (id: string, patch: Partial<InteractionOperationView>): InteractionOperationView => ({
  id, kicker: '操作建议 · 不会自动执行', title: '创建复盘安排', badge: { label: '待你预览', tone: 'waiting' },
  target: { prefix: '作用于', label: '秋季工作台 · 内部试用', version: '版本 1' }, impact: '会在日程里创建一项，参数先给你核对。', ...patch,
});
const preview = { title: '将使用这些参数', rows: answeredRows, note: '目标：秋季工作台 · 内部试用 · 版本 1' };
const card = (label: string, body: string, wide = false) => `<figure class="mw-catalog__specimen${wide ? ' mw-ix-specimen--wide' : ''}"><figcaption>${label}</figcaption><div class="mw-ix-specimen">${body}</div></figure>`;

/** The component board's specimens of every interaction part and state, with fixed sample content. */
export function renderInteractionExample(): string {
  const question = renderInteractionQuestion({ id: 'ix-q-open', kicker: '需要你补充 · 7 项', title: '把这次复盘安排好', badge: { label: '等你回答', tone: 'waiting' },
    collapse: { id: 'collapse', label: '收起问卷' }, intro: '全部必填。预填只是起点；提交只交回答案，执行另请你确认。',
    about: '针对你说的「安排一次试用复盘」', target: { prefix: '针对', label: '秋季工作台 · 内部试用', version: '版本 1' },
    evidence: { label: '依据', rows: [['request_id', 'req-7f3a'], ['about', 'input-12'], ['pending', 'pend-3 · 第 2 版']] },
    fields: fields({ minutes: '请输入 15–120 之间的整数分钟。', materials: '请选择 1–2 份材料。' }, '已按最新材料更新'), footer: footer('还有 2 项要修正，填写都在。', true) });
  const answered = renderInteractionQuestion({ id: 'ix-q-done', kicker: '已交回 · 7 项回答', title: '把这次复盘安排好', badge: { label: '已交回', tone: 'done' }, fields: [],
    answered: { rows: answeredRows, actions: [{ id: 'revise', label: '调整回答', variant: 'ghost' }] }, footer: footer('') });
  const expired = renderInteractionQuestion({ id: 'ix-q-expired', kicker: '需要你补充 · 7 项', title: '把这次复盘安排好', badge: { label: '已过期', tone: 'quiet' },
    target: { prefix: '针对', label: '秋季工作台 · 内部试用', version: '版本 2', changed: true },
    banner: { text: '问题针对的对象已改到版本 2，旧回答不会再交回。草稿还在，可以请助理带着它重新问。', tone: 'waiting', actions: [{ id: 'reopen', label: '按新版本重新准备' }] },
    fields: fields().slice(2, 4), footer: { note: '草稿只在本页保留', actions: [{ id: 'submit', label: '提交回答', variant: 'primary', type: 'submit', disabled: true }] } });
  const steps = [
    ['问题收起时', renderInteractionNextSteps([{ id: 'question', label: '继续填写', source: '来自问卷' }])],
    ['回答已交回', renderInteractionNextSteps([{ id: 'card', label: '预览参数', source: '来自复盘安排操作卡' }])],
    ['执行中', renderInteractionNextSteps([{ id: 'card', label: '执行中…', source: '来自复盘安排操作卡', busy: true }])],
    ['完成后：一主一次', renderInteractionNextSteps([{ id: 'result', label: '打开结果', source: '来自复盘安排操作卡' }, { id: 'continue', label: '继续调整', source: '来自复盘安排操作卡', primary: false }])],
    ['记录变了：原位禁用', renderInteractionNextSteps([{ id: 'card', label: '预览参数', source: '来自复盘安排操作卡', disabled: true }])],
  ].map(([label, body]) => card(label!, `<div class="mw-ix-composer-specimen">${body}<div class="mw-ix-composer-specimen__pill">${label === '问题收起时' ? renderInteractionComposerTarget('补充到问卷') : ''}<span>继续说…</span></div></div>`)).join('');
  return `<style>${INTERACTION_STYLES}
    .mw-ix-specimen { width: min(620px, 100%); }
    .mw-ix-specimen--wide { grid-column: 1 / -1; }
    .mw-ix-composer-specimen { display: flex; align-items: center; gap: 8px; width: min(560px, 100%); }
    .mw-ix-composer-specimen__pill { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 50px; padding: 0 14px; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: var(--lift-2); color: var(--muted); }
  </style>
  <p class="mw-catalog__hint">AI 发起交互时的共享部件：问卷（混合字段、推荐理由、逐字段错误、时长冲突确认）、选项组、操作卡（作用对象与版本、参数预览、状态、结果）、输入框旁的下一步。只做呈现，调用方把自己的记录转换成展示参数；示例内容固定，不连接任何服务。</p>
  <div class="mw-catalog__specimens">
    ${card('问卷 · 待答，带错误与冲突确认', question, true)}
    ${card('问卷 · 已交回', answered)}
    ${card('问卷 · 已过期，草稿保留', expired)}
    ${card('选项组 · 带说明与推荐', renderInteractionOptions([{ value: 'a', label: '一起复盘', description: '先对齐体验，再定下一步', recommended: true, selected: true }, { value: 'b', label: '异步审阅', description: '先读材料，在文档里留判断' }], { id: 'ix-options-demo' }))}
    ${card('选项组 · 短选项多选', renderInteractionOptions([{ value: 'a', label: '首次使用', selected: true }, { value: 'b', label: '失败与恢复' }, { value: 'c', label: '交互细节', disabled: true }], { id: 'ix-choices-demo', multiple: true }))}
    ${card('操作卡 · 待预览', renderInteractionOperation(operation('ix-op-ready', { actions: [{ id: 'revise', label: '调整回答', variant: 'ghost' }, { id: 'preview', label: '预览参数' }] })))}
    ${card('操作卡 · 参数预览', renderInteractionOperation(operation('ix-op-preview', { badge: { label: '待你执行', tone: 'waiting' }, preview: { ...preview, actions: [{ id: 'revise', label: '返回调整', variant: 'ghost' }, { id: 'execute', label: '执行', variant: 'primary' }] } })))}
    ${card('操作卡 · 结果未知，只能核对', renderInteractionOperation(operation('ix-op-unknown', { badge: { label: '结果未知', tone: 'waiting' }, preview, status: { text: '连接在执行途中断开，结果未知。先核对，不会自动再执行一次。', tone: 'waiting' }, recovery: [{ id: 'reconcile', label: '核对结果' }] })))}
    ${card('操作卡 · 已完成', renderInteractionOperation(operation('ix-op-done', { badge: { label: '已完成', tone: 'done' }, result: { title: '复盘安排已准备好', body: '日程已创建；参数与回执在摘要里。', actions: [{ id: 'open', label: '打开摘要' }, { id: 'continue', label: '继续调整', variant: 'ghost' }] } })))}
    ${card('操作卡 · 对象改版后失效', renderInteractionOperation(operation('ix-op-stale', { badge: { label: '已失效', tone: 'quiet' }, target: { prefix: '作用于', label: '秋季工作台 · 内部试用', version: '版本 2', changed: true }, status: { text: '作用对象已改版，这组参数不能再执行。按新版本重新准备上面的问题。' } })))}
    ${steps}
  </div>`;
}
