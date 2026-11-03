import { setTimeout } from "node:timers/promises";
import type { PluginJobControl, PluginInstallationClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pruneUninstalledSchedules } from "./runtime-uninstall.js";
import { reconcileScheduledOperations } from "./operations.js";
import { rescheduleEnabledConversationTasks } from "./wakeup.js";
import type { ScheduleRuntime } from "./runtime-actions.js";

/** No work starts inside activation: Runtime first registers the contribution and marks its installation running. */
export async function reconcileSchedule(runtime: ScheduleRuntime, projectId: string, installations: PluginInstallationClient, control: PluginJobControl, report: (message: string | null) => void): Promise<void> {
  await setTimeout(0, undefined, { signal: control.signal });
  while (!control.signal.aborted) {
    try {
      await runtime.write(control.beforeEffect, () => {
        pruneUninstalledSchedules(runtime, projectId, installations);
        reconcileScheduledOperations(runtime.db, runtime.schedule);
        rescheduleEnabledConversationTasks(runtime.db, runtime.schedule);
      });
      report(null);
    } catch (error) {
      control.assert_authority_current();
      report(error instanceof Error ? error.message : "定时任务恢复失败");
    }
    await setTimeout(5_000, undefined, { signal: control.signal });
  }
}
