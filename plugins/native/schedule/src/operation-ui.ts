import type { ScheduledOperationView } from './operation-management.js';
import type { ScheduledOperationOccurrence } from './operations.js';
import type { ScheduleUiPrimitives } from './ui.js';

const labels = { enabled: '已启用', paused: '已暂停', needs_confirmation: '待确认归属', needs_review: '结果待核对', completed: '已完成' };
const occurrenceLabels = { pending: '等待执行', running: '正在执行', succeeded: '执行成功', failed: '执行失败', unknown: '结果未知', skipped: '已跳过' };
export function renderOperationRow(run: ScheduledOperationView, p: ScheduleUiPrimitives): string {
  return `<article class="inbox-stage-item feed-stage-item"><button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="job" data-schedule-job-id="operation:${p.escape(run.id)}">
    <span class="feed-stage-leading"><strong>${p.escape(run.pluginTitle)} · ${p.escape(run.operationTitle)}</strong></span>
    <span class="feed-entry-source">${run.job ? p.escape(p.formatDate(run.job.next_due_at)) : p.text('原闹钟已不存在')}</span>
    <span class="mw-status mw-status--${run.state.startsWith('needs_') ? 'attention' : 'quiet'} mw-status--plain feed-entry-status">${p.text(labels[run.state])}</span>
  </button></article>`;
}
export function renderOperationDetail(run: ScheduledOperationView, p: ScheduleUiPrimitives): string {
  const target = run.installation, unknown = run.occurrences.find(item => item.state === 'unknown');
  const review = run.state === 'needs_confirmation' || run.state === 'needs_review';
  const canRecover = run.job && target?.operations.some(item => item.id === run.operationId);
  const confirmation = target ? { operation_id: run.id, expected_revision: run.revision,
    expected_installation_id: target.installationId, expected_generation: target.generation, expected_version: target.version } : null;
  const recover = (decision: string, label: string) => `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-operation-decision="${decision}" data-operation-id="${p.escape(run.id)}" data-confirmation="${p.escape(JSON.stringify(confirmation))}">${p.text(label)}</button>`;
  const controls = review ? (canRecover ? unknown ? recover('skip', '跳过本次并继续') + recover('retry', '重试本次') : recover('resume', '确认归属并恢复') : '')
    : run.job && run.state !== 'completed' ? `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-enabled-action="${run.state !== 'enabled'}" data-schedule-job-id="${p.escape(run.jobId)}" data-schedule-detail-id="operation:${p.escape(run.id)}">${p.text(run.state === 'enabled' ? '暂停' : '恢复')}</button>` : '';
  return `<article class="feed-detail inbox-reference-detail" data-schedule-detail="operation:${p.escape(run.id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${p.text('返回定时任务列表')}">${p.icon('chevron-right')}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${p.escape(run.pluginTitle)}</span><span class="mw-status mw-status--${review ? 'attention' : 'quiet'}">${p.text(labels[run.state])}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(run.operationTitle)}</h1></header>
    <div class="inbox-reference-body"><p>${p.escape(run.detail ?? '')}</p><p data-schedule-operation-target>${target ? p.escape(`${target.title} · ${target.version} · ${target.publisher}`) : p.text('请先安装并启用对应插件，再刷新查看当前安装。')}</p>
      ${target && !canRecover && review ? `<p>${p.text('原闹钟或功能已不存在，请保留历史并新建定时。')}</p>` : ''}
      <dl class="inbox-attention-context"><div><dt>${p.text('执行功能')}</dt><dd>${p.escape(run.operationId)}</dd></div><div><dt>${p.text('重复')}</dt><dd>${p.text(run.repeat === 'none' ? '单次' : run.repeat === 'daily' ? '每隔 24 小时' : '每隔 7 天')}</dd></div></dl>
      <p>${p.text('原输入')}</p><pre data-schedule-operation-input>${p.escape(JSON.stringify(run.input, null, 2))}</pre>
    </div>
    <div class="inbox-reference-footer"><div class="feed-detail-actions">${controls}<button class="mw-btn mw-btn--ghost" type="button" data-schedule-operation-refresh="${p.escape(run.id)}">${p.text('刷新任务与安装')}</button></div><p class="feed-action-status" data-schedule-action-status role="status" hidden></p></div>
    <div class="schedule-thread">${run.occurrences.map(item => renderOccurrence(item, p)).join('') || `<p>${p.text('尚未执行')}</p>`}</div>
  </article>`;
}
function renderOccurrence(item: ScheduledOperationOccurrence, p: ScheduleUiPrimitives): string {
  return `<article class="schedule-turn"><header><strong>${p.text(occurrenceLabels[item.state])}</strong><time>${p.escape(p.formatDate(item.dueAt))}</time></header><p>${p.escape(item.detail ?? '')}</p>
    ${(item.decisions ?? []).map(decision => `<p>${p.escape(p.formatDate(decision.at))} · ${p.text(decision.decision === 'retry' ? '已确认重试' : '已确认跳过')} · ${p.escape(decision.previousDetail ?? '')}</p>`).join('')}</article>`;
}
export function renderOperationRecoveryDialog(p: ScheduleUiPrimitives): string {
  return `<dialog class="mw-dialog mw-dialog--form" data-schedule-operation-dialog aria-labelledby="schedule-operation-title"><form class="mw-form mw-dialog__shell" data-schedule-operation-form>
    <header class="mw-form__header"><h2 id="schedule-operation-title">${p.text('核对定时操作')}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-schedule-operation-close aria-label="${p.text('关闭')}">${p.icon('x')}</button></header>
    <div class="mw-form__body"><p data-operation-review-title></p><p data-operation-review-target></p><pre data-operation-review-input></pre><p data-operation-review-warning></p><p class="form-error" data-operation-review-error role="alert" hidden></p></div>
    <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-schedule-operation-close>${p.text('取消')}</button><button class="mw-btn mw-btn--ghost" type="button" data-operation-review-refresh>${p.text('刷新任务与安装')}</button><button class="mw-btn mw-btn--primary" type="submit">${p.text('确认决定')}</button></footer>
  </form></dialog>`;
}
