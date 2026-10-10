import type { GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { HostMethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";

/** A management write takes no caller identity: the host records the person on this machine and refuses one carried in the arguments. */
type ManagementEntry<Method extends (input: never) => unknown> = (input: Omit<Parameters<Method>[0], "actor_id">) => ReturnType<Method>;

/** Host-registered Goals commands that still have current callers. */
export interface GoalsEntryApi {
  commands: {
    addProjectGuidance: ManagementEntry<GoalsApplicationApi["commands"]["addProjectGuidance"]>;
    updateProjectGuidance: ManagementEntry<GoalsApplicationApi["commands"]["updateProjectGuidance"]>;
  };
  planning: Pick<GoalsApplicationApi["planning"], "analyzeChange" | "validateBoardGraph"> & {
    saveProjectMethod: ManagementEntry<GoalsApplicationApi["planning"]["saveProjectMethod"]>;
  };
}

export type AsyncGoalsEntryApi = {
  [Group in keyof GoalsEntryApi]: AsyncApplicationMethods<GoalsEntryApi[Group]>;
};

export const goalsEntryCapabilities = {
  commands: {
    // Both guidance writes and the method save are management entries: `host_only`, so a plugin that lists one under
    // capabilities.consumes is refused instead of being recorded as the person on this machine (tests/goal-management-identity.test.ts).
    addProjectGuidance: {
      capability_id: "io.molis.work.goals.commands.add-project-guidance", version: 1, operation: "command", host_only: true,
    } as HostMethodCapability<GoalsEntryApi["commands"]["addProjectGuidance"]>,
    updateProjectGuidance: {
      capability_id: "io.molis.work.goals.commands.update-project-guidance", version: 1, operation: "command", host_only: true,
    } as HostMethodCapability<GoalsEntryApi["commands"]["updateProjectGuidance"]>,
  },
  planning: {
    saveProjectMethod: {
      capability_id: "io.molis.work.goals.planning.save-project-method", version: 1, operation: "command", host_only: true,
    } as HostMethodCapability<GoalsEntryApi["planning"]["saveProjectMethod"]>,
    analyzeChange: {
      capability_id: "io.molis.work.goals.planning.analyze-change", version: 1, operation: "query",
    } as HostMethodCapability<GoalsEntryApi["planning"]["analyzeChange"]>,
    validateBoardGraph: {
      capability_id: "io.molis.work.goals.planning.validate-board-graph", version: 1, operation: "query",
    } as HostMethodCapability<GoalsEntryApi["planning"]["validateBoardGraph"]>,
  },
};

export function createGoalsEntryClient(client: LocalHostProjectClient): AsyncGoalsEntryApi {
  return {
    commands: {
      addProjectGuidance: (...input) => client.invoke(goalsEntryCapabilities.commands.addProjectGuidance, input),
      updateProjectGuidance: (...input) => client.invoke(goalsEntryCapabilities.commands.updateProjectGuidance, input),
    },
    planning: {
      saveProjectMethod: (...input) => client.invoke(goalsEntryCapabilities.planning.saveProjectMethod, input),
      analyzeChange: (...input) => client.invoke(goalsEntryCapabilities.planning.analyzeChange, input),
      validateBoardGraph: (...input) => client.invoke(goalsEntryCapabilities.planning.validateBoardGraph, input),
    },
  };
}
