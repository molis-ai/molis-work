import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginManifest, PluginScheduleClient, PluginScheduleWriter, PluginScheduleJob, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { ScheduleService } from "@molis-ai/molis-work-service-scheduler";
import { joinPluginTransaction } from "./plugin-transaction.js";
import { pluginSchedulerOwner, type PluginSchedulerPorts } from "./plugin-scheduler-owner.js";
import { SCHEDULE_READ_PERMISSION, SCHEDULE_WRITE_PERMISSION } from "./plugin-service-permissions.js";

/** Every plugin gets the same owner-scoped scheduler; no plugin receives the service's database connection. */
export function pluginSchedulerFor(manifest: PluginManifest, context: PluginStartContext, database: PluginDatabase | undefined,
  schedule: ScheduleService | undefined, assertActive: () => void, ports: PluginSchedulerPorts): { client: PluginScheduleClient; dispose(): void } | undefined {
  if (!manifest.permissions.some(entry => entry.permission === SCHEDULE_READ_PERMISSION || entry.permission === SCHEDULE_WRITE_PERMISSION)) return undefined;
  if (!database || !schedule) return undefined;
  const owner = manifest.plugin_id;
  const activation = pluginSchedulerOwner(manifest, context, ports, assertActive);
  const dispose = schedule.connectActionOwner(activation.owner);
  const check = (permission: string) => {
    assertActive();
    if (!manifest.permissions.some(entry => entry.permission === permission)) throw new ActionError("actions.forbidden", "插件未声明这项调度权限");
    activation.current([permission]);
    const scope = currentPluginInvocation();
    if (scope && scope.caller.project_id !== ports.plugin_caller.project_id) throw new ActionError("actions.forbidden", "调用不属于此调度器的项目");
    assertCapturedPluginActionCurrent(scope, context);
    if (permission === SCHEDULE_WRITE_PERMISSION && pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读调用不能修改闹钟");
  };
  const owned = (jobId: string) => {
    const job = schedule.get(jobId);
    return job?.plugin_id === owner ? job : null;
  };
  const view = (job: ScheduleJobRecord): PluginScheduleJob => {
    const binding = schedule.actionBinding(job.job_id);
    const authorized = binding?.install_id === context.install_id && binding.installation_generation === activation.generation
      && activation.declares({ capability_id: job.capability_id, version: binding.action_version });
    return { ...job, authorization: authorized ? "current" : "needs_confirmation" };
  };
  const client = Object.freeze<PluginScheduleClient>({
    list: () => { check(SCHEDULE_READ_PERMISSION); return schedule.list(owner).map(view); },
    get: (jobId: string) => { check(SCHEDULE_READ_PERMISSION); const job = owned(jobId); return job ? view(job) : null; },
    isExecuting: (jobId: string) => { check(SCHEDULE_READ_PERMISSION); return !!owned(jobId) && schedule.isExecuting(jobId); },
    join: (transaction, write) => joinPluginTransaction(database, transaction, (afterCommit, live) => {
      const permit = () => { live(); check(SCHEDULE_WRITE_PERMISSION); };
      permit();
      return write(Object.freeze<PluginScheduleWriter>({
        register: input => {
          permit(); activation.definitionFor(input.action);
          const { action, ...fields } = input;
          return view(schedule.registerAction({ ...fields, capability_id: action.capability_id, plugin_id: owner },
            { install_id: context.install_id, installation_generation: activation.generation, action_version: action.version }, afterCommit));
        },
        cancel: jobId => { permit(); return schedule.cancel(jobId, owner, afterCommit); },
        setEnabled: (jobId, enabled) => {
          permit(); const job = owned(jobId);
          if (enabled && job && view(job).authorization !== "current") throw new ActionError("actions.forbidden", "需要确认此安装后重新登记闹钟");
          return view(schedule.setEnabled(jobId, enabled, owner, afterCommit));
        },
      }));
    }),
  });
  return { client, dispose };
}
