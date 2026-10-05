import type { GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { HostMethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Combined Host methods that must run without splitting owner calls for one response. */
export interface GoalEntryCompositionApi {
  readPlanningComposition(boardId: string): {
    methods: ReturnType<GoalsApplicationApi["planning"]["effectiveMethods"]>;
    composition: ReturnType<GoalsApplicationApi["planning"]["projectComposition"]>;
  };
}

export const goalEntryCompositionCapabilities = {
  readPlanningComposition: {
    capability_id: "io.molis.work.goals.planning-composition", version: 1, operation: "query",
  } as HostMethodCapability<GoalEntryCompositionApi["readPlanningComposition"]>,
};

export function createGoalEntryCompositionClient(client: LocalHostProjectClient): AsyncApplicationMethods<GoalEntryCompositionApi> {
  return {
    readPlanningComposition: (...input) => client.invoke(goalEntryCompositionCapabilities.readPlanningComposition, input),
  };
}
