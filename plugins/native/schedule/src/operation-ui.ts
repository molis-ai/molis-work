import type { ScheduledOperationView } from './operation-management.js';
import type { ScheduledOperationOccurrence } from './operations.js';
import type { ScheduleUiPrimitives } from './ui.js';

const ringStates = { enabled: 'ready', paused: 'paused', needs_confirmation: 'approval', needs_review: 'verify', completed: 'done' };
const occurrenceStates = { pending: 'queued', running: 'running', succeeded: 'done', failed: 'failed', unknown: 'verify', skipped: 'cancelled' };
/** What a scheduled operation's state is called; each state's words are chosen here, never built from the state. */
const stateWords = (state: ScheduledOperationView["state"], p: ScheduleUiPrimitives): string => {
  switch (state) {
    case "enabled": return p.text("schedule.status.enabled");
    case "paused": return p.text("schedule.status.paused");
    case "needs_confirmation": return p.text("schedule.status.needs-confirmation");
    case "needs_review": return p.text("schedule.status.needs-review");
    case "completed": return p.text("schedule.status.completed");
  }
};
const occurrenceWords = (state: ScheduledOperationOccurrence["state"], p: ScheduleUiPrimitives): string => {
  switch (state) {
    case "pending": return p.text("schedule.occurrence.pending");
    case "running": return p.text("schedule.occurrence.running");
    case "succeeded": return p.text("schedule.occurrence.succeeded");
    case "failed": return p.text("schedule.occurrence.failed");
    case "unknown": return p.text("schedule.occurrence.unknown");
    case "skipped": return p.text("schedule.occurrence.skipped");
  }
};
export function renderOperationRow(run: ScheduledOperationView, p: ScheduleUiPrimitives): string {
  return `<article class="inbox-stage-item feed-stage-item"><button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="job" data-schedule-job-id="operation:${p.escape(run.id)}">
    <span class="feed-stage-leading"><strong>${p.escape(run.pluginTitle)} · ${p.escape(run.operationTitle)}</strong></span>
    <span class="feed-entry-source">${run.job ? p.escape(p.formatDate(run.job.next_due_at)) : p.text('schedule.operation.alarm-missing')}</span>
    <span class="mw-status mw-status--${run.state.startsWith('needs_') ? 'attention' : 'quiet'} mw-status--plain feed-entry-status" data-mw-state="${ringStates[run.state]}">${stateWords(run.state, p)}</span>
  </button></article>`;
}
export function renderOperationDetail(run: ScheduledOperationView, p: ScheduleUiPrimitives): string {
  const target = run.installation, unknown = run.occurrences.find(item => item.state === 'unknown');
  const review = run.state === 'needs_confirmation' || run.state === 'needs_review';
  const canRecover = run.job && target?.operations.some(item => item.id === run.operationId);
  const confirmation = target ? { operation_id: run.id, expected_revision: run.revision,
    expected_installation_id: target.installationId, expected_generation: target.generation, expected_version: target.version } : null;
  const recover = (decision: string, label: string) => `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-operation-decision="${decision}" data-operation-id="${p.escape(run.id)}" data-confirmation="${p.escape(JSON.stringify(confirmation))}">${label}</button>`;
  const controls = review ? (canRecover ? unknown ? recover('skip', p.text('schedule.operation.skip')) + recover('retry', p.text('schedule.operation.retry')) : recover('resume', p.text('schedule.action.confirm-restore')) : '')
    : run.job && run.state !== 'completed' ? `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-enabled-action="${run.state !== 'enabled'}" data-schedule-job-id="${p.escape(run.jobId)}" data-schedule-detail-id="operation:${p.escape(run.id)}">${run.state === 'enabled' ? p.text('schedule.action.pause') : p.text('schedule.action.resume')}</button>` : '';
  return `<article class="feed-detail inbox-reference-detail" data-schedule-detail="operation:${p.escape(run.id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${p.text('schedule.action.back')}">${p.icon('chevron-right')}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${p.escape(run.pluginTitle)}</span><span class="mw-status mw-status--${review ? 'attention' : 'quiet'}" data-mw-state="${ringStates[run.state]}">${stateWords(run.state, p)}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(run.operationTitle)}</h1></header>
    <div class="inbox-reference-body"><p>${p.escape(run.detail ?? '')}</p><p data-schedule-operation-target>${target ? p.escape(`${target.title} · ${target.version} · ${target.publisher}`) : p.text('schedule.job.install-first')}</p>
      ${target && !canRecover && review ? `<p>${p.text('schedule.operation.gone')}</p>` : ''}
      <dl class="inbox-attention-context"><div><dt>${p.text('schedule.operation.function')}</dt><dd>${p.escape(run.operationId)}</dd></div><div><dt>${p.text('schedule.job.repeat')}</dt><dd>${run.repeat === 'none' ? p.text('schedule.label.once') : run.repeat === 'daily' ? p.text('schedule.operation.daily') : p.text('schedule.operation.weekly')}</dd></div></dl>
      <p>${p.text('schedule.operation.input')}</p><pre data-schedule-operation-input>${p.escape(JSON.stringify(run.input, null, 2))}</pre>
    </div>
    <div class="inbox-reference-footer"><div class="feed-detail-actions">${controls}<button class="mw-btn mw-btn--ghost" type="button" data-schedule-operation-refresh="${p.escape(run.id)}">${p.text('schedule.operation.refresh')}</button></div><p class="feed-action-status" data-schedule-action-status role="status" hidden></p></div>
    <div class="schedule-thread">${run.occurrences.map(item => renderOccurrence(item, p)).join('') || `<p>${p.text('schedule.operation.not-run')}</p>`}</div>
  </article>`;
}
function renderOccurrence(item: ScheduledOperationOccurrence, p: ScheduleUiPrimitives): string {
  return `<article class="schedule-turn"><header><strong data-mw-state="${occurrenceStates[item.state]}">${occurrenceWords(item.state, p)}</strong><time>${p.escape(p.formatDate(item.dueAt))}</time></header><p>${p.escape(item.detail ?? '')}</p>
    ${(item.decisions ?? []).map(decision => `<p>${p.escape(p.formatDate(decision.at))} · ${decision.decision === 'retry' ? p.text('schedule.operation.retry-confirmed') : p.text('schedule.operation.skip-confirmed')} · ${p.escape(decision.previousDetail ?? '')}</p>`).join('')}</article>`;
}
export function renderOperationRecoveryDialog(p: ScheduleUiPrimitives): string {
  return `<dialog class="mw-dialog mw-dialog--form" data-schedule-operation-dialog aria-labelledby="schedule-operation-title"><form class="mw-form mw-dialog__shell" data-schedule-operation-form>
    <header class="mw-form__header"><h2 id="schedule-operation-title">${p.text('schedule.operation.review-title')}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-schedule-operation-close aria-label="${p.text('schedule.action.close')}">${p.icon('x')}</button></header>
    <div class="mw-form__body"><p data-operation-review-title></p><p data-operation-review-target></p><pre data-operation-review-input></pre><p data-operation-review-warning></p><p class="form-error" data-operation-review-error role="alert" hidden></p></div>
    <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-schedule-operation-close>${p.text('schedule.action.cancel')}</button><button class="mw-btn mw-btn--ghost" type="button" data-operation-review-refresh>${p.text('schedule.operation.refresh')}</button><button class="mw-btn mw-btn--primary" type="submit">${p.text('schedule.operation.confirm-decision')}</button></footer>
  </form></dialog>`;
}
