import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedCaptureTrigger, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import { createHomeJudgmentTrigger, HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { memoryForAgentRun } from "./memory/memory-host.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { bindScheduledTaskRunner, closeHostSchedule, scheduleServiceFor } from "./schedule-runtime.js";
import { createHostScheduledTaskRunner } from "./schedule-task-runner.js";
import { feedPull } from "./web-view.js";
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
    composition.runtimes.clear();
    await Promise.all([...state.projects.values()].map(({ runtime }) => closeHostSchedule(runtime.store.db)));
  };
}

/** Runs before owners and SQLite are released, including direct Host close and project deletion. */
export async function closeProjectSchedulers(host: MolisWorkLocalHost, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): Promise<void> {
  const state = owners.get(host);
  state?.projects.delete(reference.storage_key);
  state?.composition?.runtimes.delete(reference.storage_key);
  await closeHostSchedule(runtime.store.db);
}

export function projectFeedOptions(host: MolisWorkLocalHost, reference: LocalHostProjectReference) {
  const scenes = host.sceneClient(reference);
  const context = (permissions: readonly string[]) => () => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: reference.project_id, audience: "user" as const, permissions: [...permissions] });
  return {
    captureJudgment: createFeedCaptureTrigger({ scenes, projectId: reference.project_id,
      context: context(["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]) }),
    homeJudgment: createHomeJudgmentTrigger({ scenes, projectId: reference.project_id,
      context: context(HOME_ACTION_PERMISSIONS.filter(permission => permission !== "home:write")) }),
    inboxJudgment: createInboxJudgmentTrigger({ scenes, projectId: reference.project_id,
      context: context(["inbox:read", "model:invoke", "functions:invoke"]) }),
  };
}

function activate(host: MolisWorkLocalHost, composition: Composition, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference): void {
  if (composition.runtimes.has(reference.storage_key)) return;
  const feed = createLocalFeedApplication(runtime.store.db, projectFeedOptions(host, reference));
  feed.recoverInterruptedSourceRuns(reference.project_id);
  const actions = bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS);
  const scheduler = { tick: () => feedPull(() => actions.invoke(feedSourceActions.tick, {})) };
  const schedule = scheduleServiceFor(runtime.store.db);
  if (!schedule.active) schedule.start();
  bindScheduledTaskRunner(runtime.store.db, createHostScheduledTaskRunner({ ...composition, projectId: reference.project_id,
    memory: (task, title) => memoryForAgentRun(host, { project_id: reference.project_id, task, plugin_id: SCHEDULE_PLUGIN_ID,
      used_for: `定时任务 · ${title.replace(/\s+/g, " ").trim().slice(0, 40)}` }) }));
  composition.runtimes.set(reference.storage_key, { scheduler, schedule });
  void scheduler.tick().then(result => { if (result.completed || result.failed) composition.changed(reference.storage_key); }).catch(() => undefined);
}
