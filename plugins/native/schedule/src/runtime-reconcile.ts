import { setTimeout } from "node:timers/promises";
import type { PluginJobControl, PluginInstallationClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pruneUninstalledSchedules } from "./runtime-uninstall.js";
import { endExpiredOnce } from "./missed-runs.js";
import { reconcileScheduledOperations } from "./operations.js";
import { rescheduleEnabledConversationTasks } from "./wakeup.js";
import type { ScheduleRuntime } from "./runtime-actions.js";
import type { ScheduleTaskGrants } from "./task-grants.js";
import { listScheduleConversationTasks } from "./tasks.js";

/** No work starts inside activation: Runtime first registers the contribution and marks its installation running. */
export async function reconcileSchedule(runtime: ScheduleRuntime, installations: PluginInstallationClient, grants: ScheduleTaskGrants,
  control: PluginJobControl, report: (message: string | null) => void, changed: () => void = () => undefined): Promise<void> {
  await setTimeout(0, undefined, { signal: control.signal });
  while (!control.signal.aborted) {
    // A task stopped or set for its next time after its round, or a one-time item ended after its seven days: the open page shows
    // it again (96-2), told once per pass and only by a job whose authority is still current. Set inside Schedule's write; when
    // something after it fails, the page is told anyway (a write that did not go in only costs the page one more read).
    let rescheduled = false;
    const tell = () => { if (rescheduled) { rescheduled = false; changed(); } };
    try {
      await runtime.write(control.beforeEffect, () => {
        pruneUninstalledSchedules(runtime, installations);
        reconcileScheduledOperations(runtime.db, runtime.schedule);
        const moved = rescheduleEnabledConversationTasks(runtime.db, runtime.schedule);
        rescheduled = endExpiredOnce(runtime.db, Date.now()) || moved;
      });
      // Grants of archived or vanished tasks: the platform keeps them, so they are cleared there, after Schedule's own write.
      const cleared = await grants.reconcile(() => new Set(listScheduleConversationTasks(runtime.db).map(task => task.task_id)));
      // Reconcile finished, but this round may have been cancelled or stripped of authority while it ran: only a still-current job may say so.
      control.assert_authority_current();
      tell();
      report(cleared ? null : "授权清理尚未完成，稍后重试");
    } catch (error) {
      control.assert_authority_current();
      // Something after Schedule's own write failed (the platform's clean-up, a notice it settles): the write still shows on the
      // open page now, not at some later change (the next pass may have nothing to reschedule).
      tell();
      report(error instanceof Error ? error.message : "定时任务恢复失败");
    }
    await setTimeout(5_000, undefined, { signal: control.signal });
  }
}
