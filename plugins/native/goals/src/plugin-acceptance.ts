import { ACCEPTANCE_READ_MAX, acceptanceActions, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginExecutionControl, PluginProjectDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { GoalHungRequirement } from "./contract/goals.js";
import { GOALS_ACCEPTANCE_READERS } from "./event-command-actions.js";
import { goalAcceptanceSubject } from "./goal-event-application.js";
import { acceptanceReading } from "./acceptance-summary.js";
import { goalDocumentAction } from "./document-action.js";
import { goalsStageAction } from "./stage-action.js";
import type { PluginSqlite } from "./plugin-sqlite.js";

type Prepare = (caller: ActionExecutionContext, input: unknown) => Promise<unknown>;

export interface GoalsProjectWindow {
  read<T>(body: () => T): T;
  write<T>(caller: ActionExecutionContext, body: () => T): Promise<T>;
}

/**
 * Goals' side of the platform's acceptance (contract-design §10.3): Goals reads and hangs a Goal's requirements as itself (its own grant,
 * as the subject's provider), outside its synchronous windows. `requirementsHung` keeps what a write hung on a new Goal until that write
 * commits; the write window then sends it. `before` reads what a call stands on before its window opens.
 */
export function goalsAcceptanceWiring(deps: {
  actions: Pick<PluginActionClient, "invoke">;
  control: (caller: ActionExecutionContext) => PluginExecutionControl;
  sqlite: PluginSqlite;
  database: PluginProjectDatabase;
  goalIds: () => string[];
}): { requirementsHung: (goal: { goal_id: string }, requirements: GoalHungRequirement[]) => void; window: GoalsProjectWindow; before: ReadonlyMap<string, Prepare>;
  read: (caller: ActionExecutionContext, goalIds: readonly string[]) => Promise<Map<string, AcceptanceView> | undefined> } {
  const { actions, control, sqlite, database } = deps;
  const hanging: Array<{ goal_id: string; requirements: GoalHungRequirement[] }> = [];
  const readAcceptance = async (caller: ActionExecutionContext, goalIds: readonly string[]): Promise<Map<string, AcceptanceView>> => {
    const views = new Map<string, AcceptanceView>();
    for (let at = 0; at < goalIds.length; at += ACCEPTANCE_READ_MAX) {
      const chunk = goalIds.slice(at, at + ACCEPTANCE_READ_MAX);
      const read = await actions.invoke(acceptanceActions.read, { subjects: chunk.map(goalAcceptanceSubject) }, control(caller));
      chunk.forEach((goalId, index) => { const view = read.views[index]; if (view) views.set(goalId, view); });
    }
    return views;
  };
  /**
   * Hangs what a committed write hung on a new Goal: the platform's list as it stands, plus the ones it does not have yet. Before the first
   * delivery the provider may still write the list; after it only the person can, so nothing is sent then. A failure or a cancelled call
   * leaves the Goal as it was made: its page lists what is not hung (「要求未挂上」), and the same request again hangs it again.
   */
  const hang = async (caller: ActionExecutionContext, goalId: string, hung: readonly GoalHungRequirement[]): Promise<void> => {
    try {
      const view = (await readAcceptance(caller, [goalId])).get(goalId);
      if (!view || view.round > 0) return;
      const listed = new Set(view.requirements.map(requirement => requirement.id));
      const missing = hung.filter(requirement => !listed.has(requirement.requirement_id));
      if (!missing.length) return;
      await actions.invoke(acceptanceActions.set, { subject: goalAcceptanceSubject(goalId), requirements: [
        ...view.requirements.map(({ id, statement, expected, part, requires_person }) => ({ id, statement, requires_person,
          ...(expected !== null ? { expected } : {}), ...(part !== null ? { part } : {}) })),
        ...missing.map(requirement => ({ id: requirement.requirement_id, statement: requirement.statement, requires_person: requirement.human_decision_required })),
      ] }, control(caller));
    } catch { /* The Goal stands; what is not hung shows on its page. */ }
  };
  const window: GoalsProjectWindow = {
    read: body => sqlite.read(database, body, database.journal),
    write: async (caller, body) => {
      let hung: typeof hanging = [];
      const result = await database.transaction(() => caller.beforeEffect(), transaction => sqlite.write(transaction, () => {
        hanging.length = 0;
        try {
          const value = body();
          hung = hanging.splice(0);
          return value;
        } finally { hanging.length = 0; }
      }));
      for (const goal of hung) await hang(caller, goal.goal_id, goal.requirements);
      return result;
    },
  };

  // What it read is handed to the handler as its third argument. A command whose reading failed gets none, and is refused only where it
  // stands on the requirements (`goals.event_requirement.unread`); a page shows its requirements as not read.
  const goalOf = (input: unknown): string | null => {
    const goalId = typeof input === "object" && input !== null ? (input as { goal_id?: unknown }).goal_id : undefined;
    return typeof goalId === "string" && goalId.trim() ? goalId.trim() : null;
  };
  const readSome = async (caller: ActionExecutionContext, goalIds: () => readonly string[]) => {
    try { return await readAcceptance(caller, goalIds()); } catch (error) {
      if (caller.signal?.aborted) throw error;
      return undefined;
    }
  };
  const readOne = async (caller: ActionExecutionContext, input: unknown) => {
    const goalId = goalOf(input);
    return goalId ? (await readSome(caller, () => [goalId]))?.get(goalId) : undefined;
  };
  const before = new Map<string, Prepare>([
    ...GOALS_ACCEPTANCE_READERS.map(id => [id, async (caller: ActionExecutionContext, input: unknown) => {
      const view = await readOne(caller, input);
      return view ? acceptanceReading(view) : undefined;
    }] as const),
    ...[goalDocumentAction.capability_id, "goals.history.read"].map(id => [id, async (caller: ActionExecutionContext, input: unknown) => {
      const view = await readOne(caller, input), goalId = goalOf(input);
      return view && goalId ? new Map([[goalId, view]]) : undefined;
    }] as const),
    // The stage may open any Goal of the project, the active one when none is named.
    [goalsStageAction.capability_id, caller => readSome(caller, () => window.read(deps.goalIds))],
  ]);
  return { requirementsHung: (goal, requirements) => { hanging.push({ goal_id: goal.goal_id, requirements }); }, window, before,
    read: (caller, goalIds) => readSome(caller, () => goalIds) };
}
