import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { hostLog } from "./host-log.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { bindScheduledTaskRunner, closeHostSchedule, scheduleServiceFor } from "./schedule-runtime.js";
import { createHostScheduledTaskRunner, scheduledTaskMemory } from "./schedule-task-runner.js";
import { createProjectFeedScheduler } from "./workflow-feed-options.js";
import type { FeedSchedulerRuntime } from "./web-types.js";

type Composition = Omit<Parameters<typeof createHostScheduledTaskRunner>[0], "projectId" | "memory"> & {
  runtimes: Map<string, FeedSchedulerRuntime>;
  changed(databasePath: string): void;
};
type Project = { runtime: MolisWorkProjectRuntime; reference: LocalHostProjectReference };
type State = { projects: Map<string, Project>; composition?: Composition };
const owners = new WeakMap<MolisWorkLocalHost, State>();
function stateFor(host: MolisWorkLocalHost): State {
  let state = owners.get(host);
  if (!state) owners.set(host, state = { projects: new Map() });
  return state;
}

/** Only instance bookkeeping: task facts and execution leases stay in their existing owners. */
export function openProjectSchedulers(host: MolisWorkLocalHost, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): void {
  const state = stateFor(host);
  state.projects.set(reference.storage_key, { runtime, reference });
  if (state.composition) activate(host, state.composition, runtime, reference);
}

/** The service binds existing instances and all later action-created instances, before any page is requested. */
export function bindProjectSchedulers(host: MolisWorkLocalHost, composition: Composition): () => Promise<void> {
  const state = stateFor(host);
  if (state.composition) throw new Error("项目后台调度已绑定到这个 Host");
  state.composition = composition;
  for (const { runtime, reference } of state.projects.values()) activate(host, composition, runtime, reference);
  return async () => {
    if (state.composition !== composition) return;
    state.composition = undefined;
    for (const { scheduler } of composition.runtimes.values()) scheduler.close?.();
    composition.runtimes.clear();
    await Promise.all([...state.projects.values()].map(({ runtime }) => closeHostSchedule(runtime.store.db)));
  };
}

/** Runs before owners and SQLite are released, including direct Host close and project deletion. */
export async function closeProjectSchedulers(host: MolisWorkLocalHost, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): Promise<void> {
  const state = owners.get(host);
  state?.projects.delete(reference.storage_key);
  state?.composition?.runtimes.get(reference.storage_key)?.scheduler.close?.();
  state?.composition?.runtimes.delete(reference.storage_key);
  await closeHostSchedule(runtime.store.db);
}


function activate(host: MolisWorkLocalHost, composition: Composition, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): void {
  if (composition.runtimes.has(reference.storage_key)) return;
  const scheduler = createProjectFeedScheduler(host, runtime, reference);
  const schedule = scheduleServiceFor(runtime.store.db);
  if (!schedule.active) schedule.start();
  bindScheduledTaskRunner(runtime.store.db, createHostScheduledTaskRunner({ ...composition, projectId: reference.project_id,
    memory: scheduledTaskMemory(host, reference.project_id) }));
  composition.runtimes.set(reference.storage_key, { scheduler, schedule });
  void scheduler.tick().then(result => { if (result.completed || result.failed) composition.changed(reference.storage_key); })
    .catch(error => { hostLog.warn("schedule", "round_failed", error, { schedule: "feed", first: true }); });
}
