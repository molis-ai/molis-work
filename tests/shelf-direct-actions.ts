import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import type { ActionDefinition, ActionProviderRegistration, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfAiPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, shelfManifest, shelfStorePorts, SHELF_ACTIONS, SHELF_PLUGIN_ID, type ShelfActionPorts, type ShelfPluginRouteHandler, type ShelfPluginRouteRequest } from "@molis-ai/molis-work-plugin-shelf";
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

/** Current route shapes come from the same Manifest matcher as Runtime; a route with no handler here (the project half's) answers nothing. */
export class ShelfPluginRouteTable {
  private readonly match = pluginRouteMatcher(shelfManifest);
  constructor(private readonly handlers: Readonly<Record<string, ShelfPluginRouteHandler>>) {}
  async handle(request: ShelfPluginRouteRequest) {
    const match = this.match(request.method, request.pathname), handle = match && this.handlers[match.route_id];
    return match && handle ? handle({ params: match.params, request }) : null;
  }
}

/**
 * Shelf's Home actions over a store the test opens with its own material ports, registered with the kernel directly so the test
 * can withdraw the provider or revoke the call; the Home instance itself is covered by shelf-actions.test.ts. The terminal action
 * needs the Home instance's terminal service, so it is left out here.
 */
export function shelfStoreProvider(store: () => ShelfStore, ai: ShelfAiPorts = shelfTestAi()): ActionProviderRegistration {
  const handlers = createShelfActionHandlers(shelfStorePorts(store, selection => {
    const state = ai.status(selection);
    return state.available ? { available: true } : { available: false, code: "actions.connection_required", reason: state.reason ?? "请先配置 AI 模型" };
  }));
  return { provider: { provider_id: SHELF_PLUGIN_ID, plugin_id: SHELF_PLUGIN_ID, title: "Shelf", kind: "plugin" },
    definitions: SHELF_ACTIONS.filter(definition => handlers.some(row => row.capability_id === definition.capability_id && row.version === definition.version)),
    handlers };
}
