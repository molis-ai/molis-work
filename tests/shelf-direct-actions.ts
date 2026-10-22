import type { ActionDefinition, ActionProviderRegistration, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfAiPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, shelfStorePorts, SHELF_ACTIONS, SHELF_PLUGIN_ID, type ShelfActionPorts } from "@molis-ai/molis-work-plugin-shelf";
import { shelfTestAi } from "./shelf-test-ai.js";

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

/**
 * Shelf's Home actions over a store the test opens with its own material ports, registered with the kernel directly so the test
 * can withdraw the provider or revoke the call; the Home instance itself is covered by shelf-actions.test.ts.
 */
export function shelfStoreProvider(store: () => ShelfStore, ai: ShelfAiPorts = shelfTestAi()): ActionProviderRegistration {
  return { provider: { provider_id: SHELF_PLUGIN_ID, plugin_id: SHELF_PLUGIN_ID, title: "Shelf", kind: "plugin" },
    definitions: SHELF_ACTIONS, handlers: createShelfActionHandlers(shelfStorePorts(store, selection => {
      const state = ai.status(selection);
      return state.available ? { available: true } : { available: false, code: "actions.connection_required", reason: state.reason ?? "请先配置 AI 模型" };
    })) };
}
