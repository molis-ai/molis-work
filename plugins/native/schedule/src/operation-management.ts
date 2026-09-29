import { createHash } from 'node:crypto';
import { ScheduleError, type ScheduleJobRecord } from '@molis-ai/molis-work-contracts/services/scheduler';
import type { ScheduleTaskDatabase } from './tasks.js';
import { getScheduledOperation, listScheduledOperations, listScheduledOperationOccurrences, migrateScheduledOperations, OPERATIONS_PER_INSTALLATION,
  saveScheduledOperation, saveScheduledOperationOccurrence, type ScheduledOperation, type ScheduledOperationInstallation,
  type ScheduledOperationOccurrence, type ScheduledOperationScheduler } from './operations.js';

export interface OperationRecoveryInstallation extends ScheduledOperationInstallation { publisher: string }
export interface ScheduledOperationView extends ScheduledOperation {
  job: ScheduleJobRecord | null; installation: OperationRecoveryInstallation | null;
  occurrences: ScheduledOperationOccurrence[]; revision: string;
}
export interface RecoverScheduledOperationInput {
  operation_id: string; decision: 'resume' | 'retry' | 'skip'; expected_revision: string;
  expected_installation_id: string; expected_generation: string; expected_version: string;
}

/** Recovery is a product decision. The opaque revision fences exactly the plan/history the caller reviewed. */
export function createScheduledOperationManagement(options: {
  db: ScheduleTaskDatabase; boardId: string; schedule: ScheduledOperationScheduler;
  currentInstallation(pluginId: string): OperationRecoveryInstallation | null; now?(): Date;
}) {
  const { db, boardId, schedule } = options, now = options.now ?? (() => new Date());
  migrateScheduledOperations(db);
  const view = (run: ScheduledOperation): ScheduledOperationView => {
    const job = schedule.get(run.jobId), installation = options.currentInstallation(run.pluginId);
    const occurrences = listScheduledOperationOccurrences(db, boardId, run.id);
    // Exclude technical receipt timestamps: an unrelated Scheduler receipt does not alter a reviewed decision.
    const revision = createHash('sha256').update(JSON.stringify([run, occurrences, job && [job.job_id, job.next_due_at, job.recurrence, job.enabled]])).digest('hex');
    return { ...run, job, installation, occurrences, revision };
  };
  return {
    list: () => listScheduledOperations(db, boardId).map(view),
    orphanedOccurrences: () => listScheduledOperationOccurrences(db, boardId).filter(item => !getScheduledOperation(db, boardId, item.operationId)),
    recover(input: RecoverScheduledOperationInput): ScheduledOperationView {
      return db.transaction(() => {
        const run = getScheduledOperation(db, boardId, input.operation_id);
        if (!run) throw new ScheduleError('schedule_job_not_found', '这条定时操作已不存在，请刷新列表');
        const current = view(run), target = current.installation, job = current.job;
        if (current.revision !== input.expected_revision) throw new ScheduleError('schedule_job_invalid', '任务或执行结果已变更，请刷新查看并重新确认');
        if (!job || job.plugin_id !== run.jobOwner) throw new ScheduleError('schedule_job_invalid', '原闹钟已不存在，历史记录已保留，请新建定时');
        if (schedule.isExecuting(job.job_id)) throw new ScheduleError('schedule_job_invalid', '本次操作仍在执行，请等待结果后刷新');
        if (!target) throw new ScheduleError('schedule_job_invalid', '请先安装并启用对应插件，再刷新查看当前安装');
        if (target.installationId !== input.expected_installation_id || target.generation !== input.expected_generation || target.version !== input.expected_version) {
          throw new ScheduleError('schedule_job_invalid', '插件安装或版本已变更，请刷新查看并重新确认');
        }
        if (!target.operations.some(item => item.id === run.operationId)) throw new ScheduleError('schedule_job_invalid', '当前安装没有原功能，不能恢复这条定时操作');
        if (current.occurrences.some(item => item.state === 'running')) throw new ScheduleError('schedule_job_invalid', '中断结果尚待核对，请稍后刷新');
        const unknown = current.occurrences.find(item => item.state === 'unknown');
        if (run.state === 'completed') throw new ScheduleError('schedule_job_invalid', '这条一次性定时操作已经完成，请新建定时');
        if (input.decision === 'resume' && unknown) throw new ScheduleError('schedule_job_invalid', '结果未知，请明确选择重试或跳过本次');
        if (input.decision !== 'resume' && !unknown) throw new ScheduleError('schedule_job_invalid', '没有待核对的未知结果，请刷新列表');
        const count = listScheduledOperations(db, boardId).filter(item => item.id !== run.id && item.pluginId === run.pluginId && item.installationId === target.installationId
          && item.installationGeneration === target.generation && item.state !== 'completed').length;
        if (count >= OPERATIONS_PER_INSTALLATION) throw new ScheduleError('schedule_job_invalid', '这个插件的定时执行已经太多了，先取消一些');
        if (unknown) saveScheduledOperationOccurrence(db, { ...unknown, state: input.decision === 'retry' ? 'pending' : 'skipped',
          detail: input.decision === 'retry' ? '已明确选择重试，等待下一次唤醒' : '已明确跳过本次',
          startedAt: input.decision === 'retry' ? null : unknown.startedAt, finishedAt: input.decision === 'retry' ? null : now().toISOString(),
          decisions: [...(unknown.decisions ?? []), { decision: input.decision as 'retry' | 'skip', at: now().toISOString(), previousDetail: unknown.detail }] });
        const occurrences = listScheduledOperationOccurrences(db, boardId, run.id), pending = occurrences.find(item => item.state === 'pending');
        const needsReview = occurrences.some(item => item.state === 'unknown');
        const completed = run.repeat === 'none' && occurrences.length > 0 && !pending && !needsReview;
        const next: ScheduledOperation = { ...run, installationId: target.installationId, installationGeneration: target.generation,
          state: needsReview ? 'needs_review' : completed ? 'completed' : 'enabled', detail: needsReview ? '还有结果未知的调用，请逐次核对' : completed ? '已跳过本次，不再运行' : null };
        saveScheduledOperation(db, next);
        if (needsReview || completed) schedule.setEnabled(job.job_id, false, job.plugin_id);
        else {
          let dueAt = pending?.dueAt ?? job.next_due_at;
          // Skipping must not dispatch the same due time again; keep the original interval anchor.
          if (!pending && input.decision === 'skip' && job.recurrence.kind === 'interval') {
            const due = Date.parse(dueAt), step = job.recurrence.interval_ms;
            dueAt = new Date(due + Math.max(0, Math.floor((now().getTime() - due) / step) + 1) * step).toISOString();
          }
          schedule.register({ plugin_id: job.plugin_id, capability_id: job.capability_id, object_ref: job.object_ref, title: job.title, recurrence: job.recurrence, due_at: dueAt });
        }
        return view(next);
      }).immediate();
    },
  };
}
export type ScheduledOperationManagement = ReturnType<typeof createScheduledOperationManagement>;
