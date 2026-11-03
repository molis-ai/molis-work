import { createScheduleService, type ScheduleActionBinding, type ScheduleActionOwner, type ScheduleService, type ScheduleSqliteDatabase } from "@molis-ai/molis-work-service-scheduler";
import type { ScheduleJobRecord, ScheduleRegisterInput, ScheduleWakeupControl, ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";

export type WakeupAction = (input: ScheduleWakeupInput, control: ScheduleWakeupControl) => Promise<ScheduleWakeupReply | void>;

/** A scheduler service plus what a plugin's installation does with it: `register` is that installation's registration, `disconnect` ends its activation. */
export type BoundScheduler = Omit<ScheduleService, "active"> & {
  readonly active: boolean;
  register(input: ScheduleRegisterInput): ScheduleJobRecord;
  disconnect(): void;
};

/**
 * One plugin installation as the Scheduler knows it: the wakeup actions it offers, the gateway the Scheduler calls them through
 * (the action begins with `control.beforeEffect()`, as the platform's gateway does) and the binding every job it registers carries.
 * Several services over the same library can be connected to it, as a Host restart or a second process would.
 */
export function wakeupInstallation(pluginId: string, installId = `install-${pluginId}`, generation = "generation-1") {
  const actions = new Map<string, WakeupAction>();
  const owner: ScheduleActionOwner = {
    plugin_id: pluginId, install_id: installId, installation_generation: generation,
    get actions() { return [...actions.keys()].map(capability_id => ({ capability_id, version: 1 })); },
    assertCurrent(action) { if (!actions.has(action.capability_id)) throw new Error(`${pluginId} does not offer ${action.capability_id}`); },
    async invoke(action, input, control) {
      control.beforeEffect();
      return actions.get(action.capability_id)!(input, control);
    },
  };
  const binding: ScheduleActionBinding = { install_id: installId, installation_generation: generation, action_version: 1 };
  return {
    /** Offers `action` as the installation's wakeup action for `capabilityId`, replacing one offered before; the returned function withdraws it. */
    action(capabilityId: string, action: WakeupAction): () => void {
      actions.set(capabilityId, action);
      return () => { if (actions.get(capabilityId) === action) actions.delete(capabilityId); };
    },
    /** A scheduler service over `db` with this installation's activation connected to it. */
    scheduler(db: ScheduleSqliteDatabase, options: Parameters<typeof createScheduleService>[1] = {}): BoundScheduler {
      const service = createScheduleService(db, options), disconnect = service.connectActionOwner(owner);
      return { ...service, get active() { return service.active; }, disconnect,
        register: input => service.registerAction(input, binding, effect => effect()) };
    },
  };
}
