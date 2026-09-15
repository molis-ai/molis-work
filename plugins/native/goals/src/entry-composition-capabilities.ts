import type { GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { HostMethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";

export interface GoalTrashPlacementView {
  goal_id: string;
  status: "trashed" | "open";
}

/** Combined Host methods that must run without splitting owner calls for one response. */
export interface GoalEntryCompositionApi {
  setTrashedWithWorkState(...input: Parameters<GoalsApplicationApi["lifecycle"]["setTrashed"]>): {
    result: ReturnType<GoalsApplicationApi["lifecycle"]["setTrashed"]>;
    work_state: GoalTrashPlacementView;
  };
  readPlanningComposition(boardId: string): {
    methods: ReturnType<GoalsApplicationApi["planning"]["effectiveMethods"]>;
    composition: ReturnType<GoalsApplicationApi["planning"]["projectComposition"]>;
  };
}

export const goalEntryCompositionCapabilities = {
  setTrashedWithWorkState: {
    capability_id: "io.molis.work.goals.trash-with-work-state", version: 1, operation: "command",
  } as HostMethodCapability<GoalEntryCompositionApi["setTrashedWithWorkState"]>,
  readPlanningComposition: {
    capability_id: "io.molis.work.goals.planning-composition", version: 1, operation: "query",
  } as HostMethodCapability<GoalEntryCompositionApi["readPlanningComposition"]>,
};

export function createGoalEntryCompositionClient(client: LocalHostProjectClient): AsyncApplicationMethods<GoalEntryCompositionApi> {
  return {
    setTrashedWithWorkState: (...input) => client.invoke(goalEntryCompositionCapabilities.setTrashedWithWorkState, input),
    readPlanningComposition: (...input) => client.invoke(goalEntryCompositionCapabilities.readPlanningComposition, input),
  };
}
