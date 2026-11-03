import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { schedulerErrors } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { ScheduleWakeupControl, ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { ScheduleSqliteDatabase } from "./index.js";

/** Persisted by Scheduler, never accepted from a plugin's action input. */
export interface ScheduleActionBinding {
  readonly install_id: string;
  readonly installation_generation: string;
  readonly action_version: number;
}

/** A live activation issued by the platform. Its gateway retains the real installation's authority. */
export interface ScheduleActionOwner {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly installation_generation: string;
  readonly actions: readonly ActionReference[];
  assertCurrent(action: ActionReference): void;
  invoke(action: ActionReference, input: ScheduleWakeupInput, control: ScheduleWakeupControl): Promise<ScheduleWakeupReply | void>;
}

export const SCHEDULE_ACTION_BINDINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS schedule_action_bindings (
  job_id TEXT PRIMARY KEY REFERENCES schedule_jobs(job_id) ON DELETE CASCADE,
  install_id TEXT NOT NULL,
  installation_generation TEXT NOT NULL,
  action_version INTEGER NOT NULL CHECK (action_version > 0)
);`;

/** Owners are live; bindings persist across Host restarts. Neither can substitute for the other. */
export function createActionWakeups(db: ScheduleSqliteDatabase, executions: ReadonlyMap<string, { controller: AbortController }>) {
  const owners = new Map<string, ScheduleActionOwner>();
  const bindingFor = (jobId: string) => db.prepare("SELECT install_id, installation_generation, action_version FROM schedule_action_bindings WHERE job_id = ?")
    .get(jobId) as ScheduleActionBinding | undefined;
  const interrupt = (binding: Pick<ScheduleActionBinding, "install_id" | "installation_generation">) => {
    for (const [jobId, execution] of executions) {
      const current = bindingFor(jobId);
      if (current?.install_id === binding.install_id && current.installation_generation === binding.installation_generation) {
        execution.controller.abort(new DOMException("Scheduled action activation ended", "AbortError"));
      }
    }
  };
  const ownerFor = (binding: ScheduleActionBinding, pluginId: string, capabilityId: string) => {
    const owner = owners.get(binding.install_id), reference = { capability_id: capabilityId, version: binding.action_version };
    if (!owner || owner.plugin_id !== pluginId || owner.installation_generation !== binding.installation_generation
      || !owner.actions.some(action => action.capability_id === capabilityId && action.version === binding.action_version)) return null;
    try { owner.assertCurrent(reference); } catch { return null; }
    return owner;
  };
  return {
    bindingFor,
    accepts: (binding: ScheduleActionBinding, pluginId: string, capabilityId: string) => !!ownerFor(binding, pluginId, capabilityId),
    connect(owner: ScheduleActionOwner) {
      const previous = owners.get(owner.install_id);
      if (previous) interrupt(previous);
      owners.set(owner.install_id, owner);
      return () => {
        if (owners.get(owner.install_id) !== owner) return;
        owners.delete(owner.install_id); interrupt(owner);
      };
    },
    save(jobId: string, binding: ScheduleActionBinding) {
      db.prepare(`INSERT INTO schedule_action_bindings (job_id, install_id, installation_generation, action_version) VALUES (?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET install_id = excluded.install_id, installation_generation = excluded.installation_generation, action_version = excluded.action_version`)
        .run(jobId, binding.install_id, binding.installation_generation, binding.action_version);
    },
    current(input: Pick<ScheduleWakeupInput, "job_id" | "plugin_id" | "capability_id">) {
      const binding = bindingFor(input.job_id);
      return !binding || !!ownerFor(binding, input.plugin_id, input.capability_id);
    },
    invoke(input: ScheduleWakeupInput, control: ScheduleWakeupControl) {
      const binding = bindingFor(input.job_id);
      if (!binding) throw schedulerErrors.handler_missing("叫醒对象还没有提供执行接口");
      const owner = ownerFor(binding, input.plugin_id, input.capability_id);
      if (!owner) throw new DOMException("Scheduled action authorization ended", "AbortError");
      return owner.invoke({ capability_id: input.capability_id, version: binding.action_version }, input, control);
    },
  };
}
