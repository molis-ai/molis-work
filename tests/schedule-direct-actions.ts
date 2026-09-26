import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createScheduleActionHandlers, type ScheduleActionPorts } from "@molis-ai/molis-work-plugin-schedule";

/** Route-level tests call the plugin's own handlers directly; Host registration is covered by schedule-actions.test.ts. */
export function directScheduleActions(ports: ScheduleActionPorts, projectId = "schedule-project"): BoundActionClient {
  const handlers = createScheduleActionHandlers(projectId, ports);
  return {
    discover: async () => [],
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      const handler = handlers.find(row => row.capability_id === definition.capability_id && row.version === definition.version);
      if (!handler) throw new Error(`missing ${definition.capability_id}`);
      return await handler.handle({ actor_id: "test", project_id: projectId, audience: "user", permissions: [], beforeEffect: async () => {} }, input) as Output;
    },
  };
}
