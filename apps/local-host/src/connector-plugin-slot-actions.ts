import { defineErrorCodes, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_CONNECTION_RECORD_KEY_MAX, type PluginConnectionSlotDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { defineConnectorUsagesAction, type ConnectorConnectionView, type ConnectorUsage, type ConnectorUsagesInput } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { pluginSlotScope, targetScope } from "./connector-plugin-requests.js";
import { shownState } from "./connector-refresh-refusals.js";

// Which of the person's accounts a plugin installation's connection slot uses (`services.connections`, S0b-2, S-57). Only the person
// binds: the audience is `user`, so neither a plugin page nor an Agent nor MCP can choose the account a plugin sends requests with.
// Binding checks the installation's Manifest (BL-350): an installation of that plugin in the caller's project (or the Home's) that
// declares the slot, for that service and with that kind of binding; the plugin's send checks the declaration again. Version 1 binds an
// `installation` slot: one account for the installation, in every project. Version 2 binds a `per_record` slot (S-71 provisional): one
// account for one of the plugin's records, in the caller's project.

const slot = {
  install_id: { type: "string", minLength: 1, maxLength: 160 },
  plugin_id: { type: "string", pattern: "^io\\.molis\\.work\\.[a-z0-9][a-z0-9.-]*$", maxLength: 160 },
  slot_id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
};
const metadata = { scope: "home", audiences: ["user"], subject_kinds: ["connector"] } as const;
interface SlotInput { install_id: string; plugin_id: string; slot_id: string }
interface RecordInput extends SlotInput { record_key: string }
type BindInput<Input> = Input & { service_id: string; connection_id: string | null };
const record = { ...slot, record_key: { type: "string", minLength: 1, maxLength: PLUGIN_CONNECTION_RECORD_KEY_MAX, pattern: "^[^/:\\u0000-\\u001f\\u007f]+$" } };
const binding = { service_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" }, connection_id: { anyOf: [{ type: "string", pattern: "^[a-z0-9-]{1,100}$" }, { type: "null" }] } };
const result = { type: "object", properties: { connection: { type: ["object", "null"] } }, required: ["connection"], additionalProperties: false };

export const pluginSlotErrors = defineErrorCodes("connector.plugin_slots", { installation_missing: "not_found", slot_undeclared: "invalid", project_required: "invalid" });

/** The slots an installation in the caller's project (or the Home) declares, `null` when there is no such installation of that plugin. */
export type PluginSlotDeclarations = (caller: ActionCallContext, install_id: string, plugin_id: string) => Promise<readonly PluginConnectionSlotDeclaration[] | null>;
const noInstallations: PluginSlotDeclarations = async () => null;

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
  readRecord: { capability_id: "connectors.plugin_slot.read", version: 2, operation: "query", action: { ...metadata, scope: "project",
    title: "查看插件记录的账号", description: "读取本项目里一个插件安装按记录绑定的连接槽上，某条记录绑定的账号；没有绑定时插件为这条记录发的请求不带凭据。不返回凭据。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ],
    input_schema: { type: "object", properties: record, required: ["install_id", "plugin_id", "slot_id", "record_key"], additionalProperties: false },
    output_schema: result } } as ActionDefinition<RecordInput, { connection: ConnectorConnectionView | null }>,
  bindRecord: { capability_id: "connectors.plugin_slot.bind", version: 2, operation: "command", action: { ...metadata, scope: "project",
    title: "为插件的一条记录选择账号", description: "在本项目里，把本人的一条已连通的服务连接绑定到插件安装按记录绑定的连接槽上的一条记录，或传 connection_id: null 解除绑定。只认这个项目（或 Home）里安装、在 Manifest 里声明为 per_record 的槽。插件看不到凭据。",
    kind: "operation", effect: "write", permissions: [CONNECTOR_MANAGEMENT_WRITE],
    input_schema: { type: "object", properties: { ...record, ...binding }, required: ["install_id", "plugin_id", "slot_id", "record_key", "service_id", "connection_id"], additionalProperties: false },
    output_schema: result } } as ActionDefinition<BindInput<RecordInput>, { connection: ConnectorConnectionView | null }>,
};

/**
 * An installation here that declares this slot, for this service, with this kind of binding. Only binding asks: unbinding only takes an
 * account away, so a binding left by a plugin no longer installed (or whose Manifest dropped the slot) can still be removed.
 */
async function assertDeclared(declarations: PluginSlotDeclarations, caller: ActionCallContext, input: SlotInput & { service_id: string }, binding: "installation" | "per_record"): Promise<void> {
  const slots = await declarations(caller, input.install_id, input.plugin_id);
  if (!slots) throw pluginSlotErrors.installation_missing(`这里没有插件 ${input.plugin_id} 的这个安装`);
  const declared = slots.find(item => item.slot_id === input.slot_id);
  if (!declared || (declared.binding ?? "installation") !== binding || declared.service_id !== input.service_id) {
    throw pluginSlotErrors.slot_undeclared(`插件没有声明${binding === "per_record" ? "按记录绑定" : "按安装绑定"}、用 ${input.service_id} 的连接槽 ${input.slot_id}`);
  }
}

function bound(home: string, input: SlotInput, scope = pluginSlotScope(input.install_id)): ConnectorConnectionView | null {
  return withConnectorConnections(home, store => {
    const binding = store.binding(scope, input.plugin_id, input.slot_id);
    const connection = binding && store.get(binding.connection_id);
    return connection ? { ...store.view(connection), state: shownState(home, connection, store.state(connection)) } : null;
  });
}

/** A record's scope, in the caller's project: the project is never read from the input. */
function recordScope(caller: ActionCallContext, input: RecordInput): string {
  if (!caller.project_id) throw pluginSlotErrors.project_required("按记录绑定的账号要在一个项目里选择");
  return targetScope({ install_id: input.install_id, project_id: caller.project_id, record_key: input.record_key });
}

export function connectorPluginSlotHandlers(home: string, declarations: PluginSlotDeclarations = noInstallations): ActionHandlerBinding[] {
  return [
    { capability_id: connectorPluginSlotActions.read.capability_id, version: 1, handle: (_caller, input) => ({ connection: bound(home, input as SlotInput) }) },
    { capability_id: connectorPluginSlotActions.bind.capability_id, version: 1, handle: async (caller, value) => {
      const input = value as SlotInput & { service_id: string; connection_id: string | null };
      if (input.connection_id !== null) await assertDeclared(declarations, caller, input, "installation");
      await caller.beforeEffect();
      withConnectorConnections(home, store => input.connection_id === null
        ? store.unbind(pluginSlotScope(input.install_id), input.plugin_id, input.slot_id)
        : store.bind({ scopeId: pluginSlotScope(input.install_id), pluginId: input.plugin_id, slotId: input.slot_id, serviceId: input.service_id, connectionId: input.connection_id }));
      return { connection: bound(home, input) };
    } },
    { capability_id: connectorPluginSlotActions.readRecord.capability_id, version: 2, handle: (caller, value) => {
      const input = value as RecordInput;
      return { connection: bound(home, input, recordScope(caller, input)) };
    } },
    { capability_id: connectorPluginSlotActions.bindRecord.capability_id, version: 2, handle: async (caller, value) => {
      const input = value as BindInput<RecordInput>, scope = recordScope(caller, input);
      if (input.connection_id !== null) await assertDeclared(declarations, caller, input, "per_record");
      await caller.beforeEffect();
      withConnectorConnections(home, store => input.connection_id === null ? store.unbind(scope, input.plugin_id, input.slot_id)
        : store.bind({ scopeId: scope, pluginId: input.plugin_id, slotId: input.slot_id, serviceId: input.service_id, connectionId: input.connection_id }));
      return { connection: bound(home, input, scope) };
    } },
  ];
}

/**
 * The plugin slots a connection is bound to, as its uses (T-121): installation slots, and `per_record` ones counted per plugin, slot and project,
 * never naming a record. A caller in a project sees that project's records only; one at the Home sees every project's. A plugin keeps no
 * connection of its own, so the platform, which holds the bindings, is the one to say where an account is used.
 */
export const connectorPluginSlotUsages = defineConnectorUsagesAction("connectors.plugin_slot.usages", "插件连接槽使用的连接", [CONNECTOR_MANAGEMENT_READ], "home");

export function connectorPluginSlotUsagesHandler(home: string): ActionHandlerBinding {
  return { ...connectorPluginSlotUsages, handle: (caller, value) => {
    const id = (value as ConnectorUsagesInput).connection_id;
    const found = withConnectorConnections(home, store => { const connection = store.get(id); return connection ? { connected: store.state(connection) === "connected", bindings: store.pluginBindings(id) } : null; });
    if (!found) return { usages: [] };
    const counted = new Map<string, { binding: (typeof found.bindings)[number]; records: number }>();
    for (const binding of found.bindings) {
      if (binding.project_id !== undefined && caller.project_id && binding.project_id !== caller.project_id) continue;
      const key = JSON.stringify([binding.install_id, binding.plugin_id, binding.slot_id, binding.project_id ?? null]);
      counted.set(key, { binding, records: (counted.get(key)?.records ?? 0) + 1 });
    }
    const usages: ConnectorUsage[] = [...counted].map(([key, { binding, records }]) => ({ usage_id: key, title: `${binding.plugin_id} · ${binding.slot_id}`,
      enabled: found.connected, actions: [],
      detail: binding.project_id === undefined ? "插件这个安装发出的请求都用这个账号" : `项目 ${binding.project_id} 里 ${records} 条记录用这个账号` }));
    return { usages };
  } };
}
