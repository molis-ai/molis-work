import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentTaskGrantActions, type TaskGrantListResult, type TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { SCHEDULE_BRIEF_ROLE, SCHEDULE_READER_ROLE } from "./roles.js";

/**
 * What a conversation task may read beyond project files is the platform's to keep (a task grant subject keyed by the task's id,
 * specs/proactive-assistant/schedule-task-reads.md §3.2, §3.6). Schedule stores no kind and no grant: it reads the platform's one
 * list when it needs to know, and takes grants away when a task ends. It never sets one; only the person does, in the platform's area.
 */
export const SCHEDULE_TASK_GRANT_ACTIONS = [agentTaskGrantActions.list, agentTaskGrantActions.clear] as const;

/** How the page shows one task's reads: counts only, since the categories' own words are the providers' and the platform's to show. */
export interface ScheduleTaskReads {
  task_id: string;
  /** Categories the person turned on for the task, whatever their state now. */
  categories: number;
  granted: number;
  needs_confirmation: number;
  unavailable: number;
  removed: number;
}

/** A task with categories reads data (the `brief` role, under its own subject); one without reads project files (`reader`). */
export function roundRole(subject: TaskGrantSubject | undefined): { role_id: string; grant_subject?: string } {
  return subject && subject.categories.length > 0 ? { role_id: SCHEDULE_BRIEF_ROLE, grant_subject: subject.key } : { role_id: SCHEDULE_READER_ROLE };
}

export function scheduleTaskReads(result: TaskGrantListResult): ScheduleTaskReads[] {
  return result.subjects.filter(subject => subject.categories.length > 0).map(subject => {
    const count = (status: TaskGrantSubject["categories"][number]["status"]) => subject.categories.filter(category => category.status === status).length;
    return { task_id: subject.key, categories: subject.categories.length, granted: count("granted"), needs_confirmation: count("needs_confirmation"),
      unavailable: count("unavailable"), removed: count("removed") };
  });
}

type GrantClient = Pick<BoundActionClient, "invoke">;

/**
 * The installation's one handle on its tasks' grants. A clear that did not go through (the platform refused or was away) is kept and
 * tried again by the reconcile job, which also, once per start, clears every subject whose task is archived or gone (a replica may
 * have archived or removed it). That sweep asks the platform nothing of its own: it takes the subjects from the first list Schedule
 * reads anyway (a due round reads one to choose its role), so a project that only starts makes no task grant call.
 */
export function createScheduleTaskGrants(actions: GrantClient) {
  const pending = new Set<string>();
  let swept = false;
  /** The subjects of the first list read since start, until the one sweep has gone through. */
  let observed: readonly string[] | undefined;
  const list = async () => {
    const result = await actions.invoke(agentTaskGrantActions.list, {});
    if (!swept) observed = result.subjects.map(subject => subject.key);
    return result;
  };
  const clear = async (key: string): Promise<void> => {
    try {
      await actions.invoke(agentTaskGrantActions.clear, { key });
      pending.delete(key);
    } catch (error) {
      pending.add(key);
      throw error;
    }
  };
  return {
    list,
    /** After a task is archived: its grants go too. A refusal does not undo the archive; the reconcile job clears it later. */
    async archived(key: string): Promise<void> {
      await clear(key).catch(() => pending.add(key));
    },
    /**
     * Called by the reconcile job with a reader of the tasks that are still live. It clears what is owed, and once per start the subjects
     * of the first list read since (none read yet: nothing to sweep, and nothing is asked). The live tasks are read after that list, so
     * a task made and granted between the two is live, never cleared. Says whether it went through: one that did not is tried again on
     * the job's next pass, and Schedule's own work does not wait on it.
     */
    async reconcile(liveTasks: () => ReadonlySet<string>): Promise<boolean> {
      try {
        const sweep = swept ? undefined : observed;
        const keys = new Set([...pending, ...sweep ?? []]);
        if (keys.size === 0) return true;
        const live = liveTasks();
        for (const key of keys) {
          if (live.has(key)) pending.delete(key);
          else await clear(key);
        }
        if (sweep) { swept = true; observed = undefined; }
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type ScheduleTaskGrants = ReturnType<typeof createScheduleTaskGrants>;
