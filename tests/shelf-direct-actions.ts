import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createShelfActionHandlers, type ShelfActionPorts } from "../plugins/native/shelf/src/actions.js";

/** Browser boundary tests drive the plugin's own handlers over a fixture store; Host registration is covered by shelf-actions.test.ts. */
export function directShelfActions(ports: ShelfActionPorts): BoundActionClient {
  const handlers = createShelfActionHandlers(ports);
  return {
    discover: async () => [],
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      const handler = handlers.find(row => row.capability_id === definition.capability_id && row.version === definition.version);
      if (!handler) throw new Error(`missing ${definition.capability_id}`);
      return await handler.handle({ actor_id: "test", project_id: null, audience: "user", permissions: [], beforeEffect: async () => {} }, input) as Output;
    },
  };
}
