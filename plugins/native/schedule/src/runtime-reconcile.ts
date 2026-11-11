import { setTimeout } from "node:timers/promises";
import type { PluginJobControl, PluginInstallationClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pruneUninstalledSchedules } from "./runtime-uninstall.js";
import { reconcileScheduledOperations } from "./operations.js";
import { rescheduleEnabledConversationTasks } from "./wakeup.js";
import type { ScheduleRuntime } from "./runtime-actions.js";
import type { ScheduleTaskGrants } from "./task-grants.js";
import { listScheduleConversationTasks } from "./tasks.js";

/** No work starts inside activation: Runtime first registers the contribution and marks its installation running. */
export async function reconcileSchedule(runtime: ScheduleRuntime, projectId: string, installations: PluginInstallationClient, grants: ScheduleTaskGrants,
  control: PluginJobControl, report: (message: string | null) => void): Promise<void> {
  await setTimeout(0, undefined, { signal: control.signal });
  while (!control.signal.aborted) {
    try {
      await runtime.write(control.beforeEffect, () => {
        pruneUninstalledSchedules(runtime, projectId, installations);
        reconcileScheduledOperations(runtime.db, runtime.schedule);
        rescheduleEnabledConversationTasks(runtime.db, runtime.schedule);
      });
      // Grants of archived or vanished tasks: the platform keeps them, so they are cleared there, after Schedule's own write.
      const cleared = await grants.reconcile(() => new Set(listScheduleConversationTasks(runtime.db).map(task => task.task_id)));
      // Reconcile finished, but this round may have been cancelled or stripped of authority while it ran: only a still-current job may say so.
      control.assert_authority_current();
      report(cleared ? null : "授权清理尚未完成，稍后重试");
    } catch (error) {
      control.assert_authority_current();
      report(error instanceof Error ? error.message : "定时任务恢复失败");
    }
    await setTimeout(5_000, undefined, { signal: control.signal });
  }
}
