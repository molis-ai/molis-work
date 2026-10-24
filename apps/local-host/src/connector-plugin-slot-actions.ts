import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { pluginSlotScope } from "./connector-plugin-requests.js";
import { shownState } from "./connector-refresh-refusals.js";

// Which of the person's accounts a plugin installation's connection slot uses (`services.connections`, S0b-2, S-57). Only the person
// binds: the audience is `user`, so neither a plugin page nor an Agent nor MCP can choose the account a plugin sends requests with.
// The slot's declaration is checked when the plugin sends (its Manifest's slot and service), so a binding for a slot the
// installation does not declare is never used.

const slot = {
  install_id: { type: "string", minLength: 1, maxLength: 160 },
  plugin_id: { type: "string", pattern: "^io\\.molis\\.work\\.[a-z0-9][a-z0-9.-]*$", maxLength: 160 },
  slot_id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
};
const metadata = { scope: "home", audiences: ["user"], subject_kinds: ["connector"] } as const;
interface SlotInput { install_id: string; plugin_id: string; slot_id: string }

export const connectorPluginSlotActions = {
  read: { capability_id: "connectors.plugin_slot.read", version: 1, operation: "query", action: { ...metadata,
    title: "查看插件连接槽的账号", description: "读取一个插件安装的连接槽当前绑定的账号；没有绑定时插件的请求不带凭据。不返回凭据。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ],
    input_schema: { type: "object", properties: slot, required: ["install_id", "plugin_id", "slot_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connection: { type: ["object", "null"] } }, required: ["connection"], additionalProperties: false } } } as ActionDefinition<SlotInput, { connection: ConnectorConnectionView | null }>,
  bind: { capability_id: "connectors.plugin_slot.bind", version: 1, operation: "command", action: { ...metadata,
    title: "为插件连接槽选择账号", description: "把本人的一条已连通的服务连接绑定到插件安装的连接槽，或传 connection_id: null 解除绑定。插件只能经平台向该服务的固定地址发请求，看不到凭据。",
    kind: "operation", effect: "write", permissions: [CONNECTOR_MANAGEMENT_WRITE],
    input_schema: { type: "object", properties: { ...slot, service_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" },
      connection_id: { anyOf: [{ type: "string", pattern: "^[a-z0-9-]{1,100}$" }, { type: "null" }] } },
    required: ["install_id", "plugin_id", "slot_id", "service_id", "connection_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connection: { type: ["object", "null"] } }, required: ["connection"], additionalProperties: false } } } as ActionDefinition<SlotInput & { service_id: string; connection_id: string | null }, { connection: ConnectorConnectionView | null }>,
};

function bound(home: string, input: SlotInput): ConnectorConnectionView | null {
  return withConnectorConnections(home, store => {
    const binding = store.binding(pluginSlotScope(input.install_id), input.plugin_id, input.slot_id);
    const connection = binding && store.get(binding.connection_id);
    return connection ? { ...store.view(connection), state: shownState(home, connection, store.state(connection)) } : null;
  });
}

export function connectorPluginSlotHandlers(home: string): ActionHandlerBinding[] {
  return [
    { capability_id: connectorPluginSlotActions.read.capability_id, version: 1, handle: (_caller, input) => ({ connection: bound(home, input as SlotInput) }) },
    { capability_id: connectorPluginSlotActions.bind.capability_id, version: 1, handle: async (caller, value) => {
      const input = value as SlotInput & { service_id: string; connection_id: string | null };
      await caller.beforeEffect();
      withConnectorConnections(home, store => input.connection_id === null
        ? store.unbind(pluginSlotScope(input.install_id), input.plugin_id, input.slot_id)
        : store.bind({ scopeId: pluginSlotScope(input.install_id), pluginId: input.plugin_id, slotId: input.slot_id, serviceId: input.service_id, connectionId: input.connection_id }));
      return { connection: bound(home, input) };
    } },
  ];
}
