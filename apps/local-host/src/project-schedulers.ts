import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { closeProjectClock, scheduleServiceFor } from "./project-clock.js";
import type { ProjectScheduleRuntime } from "./web-types.js";

type Composition = {
  runtimes: Map<string, ProjectScheduleRuntime>;
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
  if (state.composition) activate(state.composition, runtime, reference);
}

/** The service binds existing instances and all later action-created instances, before any page is requested. */
export function bindProjectSchedulers(host: MolisWorkLocalHost, composition: Composition): () => Promise<void> {
  const state = stateFor(host);
  if (state.composition) throw new Error("项目后台调度已绑定到这个 Host");
  state.composition = composition;
  for (const { runtime, reference } of state.projects.values()) activate(composition, runtime, reference);
  return async () => {
    if (state.composition !== composition) return;
    state.composition = undefined;
    composition.runtimes.clear();
    await Promise.all([...state.projects.values()].map(({ runtime }) => closeProjectClock(runtime.store.db)));
  };
}

/** Runs before owners and SQLite are released, including direct Host close and project deletion. */
export async function closeProjectSchedulers(host: MolisWorkLocalHost, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): Promise<void> {
  const state = owners.get(host);
  state?.projects.delete(reference.storage_key);
  state?.composition?.runtimes.delete(reference.storage_key);
  await closeProjectClock(runtime.store.db);
}


function activate(composition: Composition, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): void {
  if (composition.runtimes.has(reference.storage_key)) return;
  const schedule = scheduleServiceFor(runtime.store.db);
  if (!schedule.active) schedule.start();
  composition.runtimes.set(reference.storage_key, { schedule });
}
