import { defineErrorCodes, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_CONNECTION_RECORD_KEY_MAX, type PluginConnectionSlotDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { defineConnectorUsagesAction, defineConnectorUsagesSwitchAction, type ConnectorConnectionView, type ConnectorUsage, type ConnectorUsagesInput, type ConnectorUsagesSwitchInput, type ConnectorUsagesSwitchResult } from "@molis-ai/molis-work-contracts/services/connector-host";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { pinnedToAnother, pluginSlotScope, targetScope } from "./connector-plugin-requests.js";
import { shownState } from "./connector-refresh-refusals.js";
import { connectionSwitchErrors as switchErrors, refusalCode, switchTarget } from "./connector-usage-switch.js";

// Which of the person's accounts a plugin installation's connection slot uses (`services.connections`, S0b-2, S-57). Only the person
// binds: the audience is `user`, so neither a plugin page nor an Agent nor MCP can choose the account a plugin sends requests with.
// Binding checks the installation's Manifest (BL-350): an installation of that plugin in the caller's project (or the Home's) that
// declares the slot, for that service and with that kind of binding; the plugin's send checks the declaration again. The installation action binds an
// `installation` slot: one account for the installation, in every project. The record action binds a `per_record` slot (S-71 provisional): one
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

export const pluginSlotErrors = defineErrorCodes("connector.plugin_slots", { installation_missing: "not_found", slot_undeclared: "invalid", project_required: "invalid",
  usage_missing: "not_found", connection_pinned: "forbidden", switch_failed: "conflict" });

/** The slots an installation in the caller's project (or the Home) declares, `null` when there is no such installation of that plugin. */
export type PluginSlotDeclarations = (caller: ActionCallContext, install_id: string, plugin_id: string) => Promise<readonly PluginConnectionSlotDeclaration[] | null>;
const noInstallations: PluginSlotDeclarations = async () => null;

export const connectorPluginSlotActions = {
  read: { capability_id: "connectors.plugin_slot.read", version: /* @version action.connectors.plugin_slot.read */ 1, operation: "query", action: { ...metadata,
    title: "查看插件连接槽的账号", description: "读取一个插件安装的连接槽当前绑定的账号；没有绑定时插件的请求不带凭据。不返回凭据。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ],
    input_schema: { type: "object", properties: slot, required: ["install_id", "plugin_id", "slot_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connection: { type: ["object", "null"] } }, required: ["connection"], additionalProperties: false } } } as ActionDefinition<SlotInput, { connection: ConnectorConnectionView | null }>,
  bind: { capability_id: "connectors.plugin_slot.bind", version: /* @version action.connectors.plugin_slot.bind */ 1, operation: "command", action: { ...metadata,
    title: "为插件连接槽选择账号", description: "把本人的一条已连通的服务连接绑定到插件安装的连接槽，或传 connection_id: null 解除绑定。插件只能经平台向该服务的固定地址发请求，看不到凭据。",
    kind: "operation", effect: "write", permissions: [CONNECTOR_MANAGEMENT_WRITE],
    input_schema: { type: "object", properties: { ...slot, service_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" },
      connection_id: { anyOf: [{ type: "string", pattern: "^[a-z0-9-]{1,100}$" }, { type: "null" }] } },
    required: ["install_id", "plugin_id", "slot_id", "service_id", "connection_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connection: { type: ["object", "null"] } }, required: ["connection"], additionalProperties: false } } } as ActionDefinition<SlotInput & { service_id: string; connection_id: string | null }, { connection: ConnectorConnectionView | null }>,
  readRecord: { capability_id: "connectors.plugin_slot.record.read", version: /* @version action.connectors.plugin_slot.record.read */ 1, operation: "query", action: { ...metadata, scope: "project",
    title: "查看插件记录的账号", description: "读取本项目里一个插件安装按记录绑定的连接槽上，某条记录绑定的账号；没有绑定时插件为这条记录发的请求不带凭据。不返回凭据。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ],
    input_schema: { type: "object", properties: record, required: ["install_id", "plugin_id", "slot_id", "record_key"], additionalProperties: false },
    output_schema: result } } as ActionDefinition<RecordInput, { connection: ConnectorConnectionView | null }>,
  bindRecord: { capability_id: "connectors.plugin_slot.record.bind", version: /* @version action.connectors.plugin_slot.record.bind */ 1, operation: "command", action: { ...metadata, scope: "project",
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
    return connection ? { ...store.view(connection), state: shownState(home, connection, store.state(connection), lastConnectorCheck(store, connection.connection_id)) } : null;
  });
}

/** A record's scope, in the caller's project: the project is never read from the input. */
function recordScope(caller: ActionCallContext, input: RecordInput): string {
  if (!caller.project_id) throw pluginSlotErrors.project_required("按记录绑定的账号要在一个项目里选择");
  return targetScope({ install_id: input.install_id, project_id: caller.project_id, record_key: input.record_key });
}

export function connectorPluginSlotHandlers(home: string, declarations: PluginSlotDeclarations = noInstallations): ActionHandlerBinding[] {
  return [
    { capability_id: connectorPluginSlotActions.read.capability_id, version: connectorPluginSlotActions.read.version, handle: (_caller, input) => ({ connection: bound(home, input as SlotInput) }) },
    { capability_id: connectorPluginSlotActions.bind.capability_id, version: connectorPluginSlotActions.bind.version, handle: async (caller, value) => {
      const input = value as SlotInput & { service_id: string; connection_id: string | null };
      if (input.connection_id !== null) await assertDeclared(declarations, caller, input, "installation");
      await caller.beforeEffect();
      withConnectorConnections(home, store => input.connection_id === null
        ? store.unbind(pluginSlotScope(input.install_id), input.plugin_id, input.slot_id)
        : store.bind({ scopeId: pluginSlotScope(input.install_id), pluginId: input.plugin_id, slotId: input.slot_id, serviceId: input.service_id, connectionId: input.connection_id }));
      return { connection: bound(home, input) };
    } },
    { capability_id: connectorPluginSlotActions.readRecord.capability_id, version: connectorPluginSlotActions.readRecord.version, handle: (caller, value) => {
      const input = value as RecordInput;
      return { connection: bound(home, input, recordScope(caller, input)) };
    } },
    { capability_id: connectorPluginSlotActions.bindRecord.capability_id, version: connectorPluginSlotActions.bindRecord.version, handle: async (caller, value) => {
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
export const connectorPluginSlotUsages = defineConnectorUsagesAction("connectors.plugin_slot.usages", "插件连接槽使用的连接", [CONNECTOR_MANAGEMENT_READ], "home", /* @version action.connectors.plugin_slot.usages */ 1);

/** One use of a connection: an installation slot, or one plugin slot's `per_record` bindings in one project; `scopes` are its binding rows. */
interface SlotUse { usage_id: string; install_id: string; plugin_id: string; slot_id: string; project_id?: string; scopes: string[] }

/** The uses of a connection the caller may see: a caller in a project sees that project's records only, one at the Home every project's. */
function slotUses(home: string, caller: ActionCallContext, connectionId: string): { connected: boolean; uses: Map<string, SlotUse> } | null {
  const found = withConnectorConnections(home, store => { const connection = store.get(connectionId); return connection ? { connected: store.state(connection) === "connected", bindings: store.pluginBindings(connectionId) } : null; });
  if (!found) return null;
  const uses = new Map<string, SlotUse>();
  for (const binding of found.bindings) {
    if (binding.project_id !== undefined && caller.project_id && binding.project_id !== caller.project_id) continue;
    const usage_id = JSON.stringify([binding.install_id, binding.plugin_id, binding.slot_id, binding.project_id ?? null]);
    const use = uses.get(usage_id) ?? { usage_id, install_id: binding.install_id, plugin_id: binding.plugin_id, slot_id: binding.slot_id, ...(binding.project_id === undefined ? {} : { project_id: binding.project_id }), scopes: [] };
    use.scopes.push(targetScope(binding));
    uses.set(usage_id, use);
  }
  return { connected: found.connected, uses };
}

export function connectorPluginSlotUsagesHandler(home: string): ActionHandlerBinding {
  return { ...connectorPluginSlotUsages, handle: (caller, value) => {
    const found = slotUses(home, caller, (value as ConnectorUsagesInput).connection_id);
    if (!found) return { usages: [] };
    const usages: ConnectorUsage[] = [...found.uses.values()].map(use => ({ usage_id: use.usage_id, title: `${use.plugin_id} · ${use.slot_id}`,
      enabled: found.connected, actions: [],
      detail: use.project_id === undefined ? "插件这个安装发出的请求都用这个账号" : `项目 ${use.project_id} 里 ${use.scopes.length} 条记录用这个账号` }));
    return { usages };
  } };
}

/**
 * Switching a plugin slot's account (§13.4) is binding it again, so each use passes what binding it would (S-57, S-71): an installation here
 * that declares the slot for this service with this kind of binding, and an account not made for another package's installation (T-134). A
 * `per_record` use is switched only in the caller's own project, which comes from the call, never from the input. A use that does not pass is
 * refused alone; the account the use already has stays. Nothing is written before `beforeEffect`, and a use whose binding changed meanwhile is left.
 */
export const connectorPluginSlotSwitch = defineConnectorUsagesSwitchAction("connectors.plugin_slot.switch", "换用插件连接槽的账号", [CONNECTOR_MANAGEMENT_WRITE], "home", /* @version action.connectors.plugin_slot.switch */ 1);

export function connectorPluginSlotSwitchHandler(home: string, declarations: PluginSlotDeclarations = noInstallations): ActionHandlerBinding {
  return { ...connectorPluginSlotSwitch, handle: async (caller, value) => {
    const input = value as ConnectorUsagesSwitchInput;
    const { to } = switchTarget(home, input.from_connection_id, input.to_connection_id);
    const found = slotUses(home, caller, input.from_connection_id), uses = found?.uses ?? new Map<string, SlotUse>();
    const pinned = withConnectorConnections(home, store => new Set([...uses.values()].filter(use => pinnedToAnother(store, to.connection_id, use.install_id)).map(use => use.usage_id)));
    const result: ConnectorUsagesSwitchResult = { switched: [], refused: [] }, ready: SlotUse[] = [];
    for (const usage_id of input.usage_ids ?? [...uses.keys()]) {
      const use = uses.get(usage_id);
      try {
        if (!use) throw pluginSlotErrors.usage_missing("这个账号没有这处使用位置");
        if (use.project_id !== undefined && use.project_id !== caller.project_id) throw pluginSlotErrors.project_required("按记录绑定的账号要在它所在的项目里换");
        if (pinned.has(usage_id)) throw pluginSlotErrors.connection_pinned("要换成的账号是为另一个插件建的");
        await assertDeclared(declarations, caller, { ...use, service_id: to.service_id }, use.project_id === undefined ? "installation" : "per_record");
        ready.push(use);
      } catch (error) { caller.signal?.throwIfAborted(); result.refused.push({ usage_id, code: refusalCode(error, pluginSlotErrors.switch_failed) }); }
    }
    for (const use of ready) {
      await caller.beforeEffect();
      try {
        // Asked again at the write, in the one open this use takes: the account switched to may have been disconnected, marked (S-70)
        // or pinned to another package meanwhile, and the slot may have been bound to something else.
        withConnectorConnections(home, store => {
          const now = store.get(to.connection_id);
          if (!now || shownState(home, now, store.state(now), lastConnectorCheck(store, now.connection_id)) !== "connected") throw switchErrors.target_unavailable("要换成的账号现在不可用，请先连好它");
          if (pinnedToAnother(store, to.connection_id, use.install_id)) throw pluginSlotErrors.connection_pinned("要换成的账号是为另一个插件建的");
          for (const scope of use.scopes) {
            if (store.binding(scope, use.plugin_id, use.slot_id)?.connection_id === input.from_connection_id) store.bind({ scopeId: scope, pluginId: use.plugin_id, slotId: use.slot_id, serviceId: to.service_id, connectionId: to.connection_id });
          }
        });
        result.switched.push(use.usage_id);
      } catch (error) { result.refused.push({ usage_id: use.usage_id, code: refusalCode(error, pluginSlotErrors.switch_failed) }); }
    }
    return result;
  } };
}
