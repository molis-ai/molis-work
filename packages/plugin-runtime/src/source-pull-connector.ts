import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_CONNECTIONS_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import {
  PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION, type ConnectorPullReceipt, type ConnectorPullRequest, type ConnectorSignalDraft, type PluginConnectorSourceClient,
} from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { ConnectorRawEvent } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { RawEventAdapter } from "@molis-ai/molis-work-contracts/services/listener-host";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly } from "./action-scope.js";
import { slotTarget, type PluginConnectionTarget } from "./connections-service.js";
import type { PluginSourcePullGate, PluginSourcePullRun } from "./source-pull-service.js";

const errors = defineErrorCodes("plugin", {
  source_pull_connector_call_required: "forbidden", source_pull_connector_permission_undeclared: "forbidden", source_pull_connector_action_not_concurrent: "forbidden",
  source_pull_connector_read_only: "forbidden", source_pull_connector_slot_undeclared: "invalid", source_pull_connector_request_invalid: "invalid",
});

const INTEGRATION_ID = /^[a-z0-9][a-z0-9-]{0,99}$/u;
const SETTING_KEY = /^[a-z][a-z0-9_]{0,31}$/u;
/** Names the platform reads from the bound account: a plugin cannot supply them, not even to be ignored. */
const RESERVED_SETTINGS = new Set(["token_refs", "connection_id", "credential_ref", "config"]);
const MAX_SETTINGS = 8, MAX_SETTING_VALUE = 512, MAX_CURSOR = 64 * 1024, MAX_EVENT = 1024 * 1024, MAX_SERVICES = 64;
const RAW_EVENT_TEXT = ["raw_event_id", "provider_dedupe_id", "occurred_at", "observed_at"] as const;

/** The Host's side of a connector pull: the registry's integrations and the person's binding. No plugin code chooses either. */
export interface PluginConnectorPort {
  /** Whether the integration is registered as a source of this service, and its adapter's identity. Refuses what is not. */
  open(service_id: string, integration_id: string): Promise<RawEventAdapter["adapter"]>;
  pull(target: PluginConnectionTarget, request: { readonly integration_id: string; readonly cursor: unknown; readonly intent?: { readonly sync_mode?: string }; readonly settings?: Readonly<Record<string, string>> },
    run: Pick<PluginSourcePullRun, "signal" | "current" | "beforeEffect">): Promise<ConnectorPullReceipt>;
  adapt(target: PluginConnectionTarget, integration_id: string, event: ConnectorRawEvent): Promise<ConnectorSignalDraft>;
  accounts(service_ids: readonly string[]): Readonly<Record<string, { readonly bound: boolean }>>;
}

/**
 * The client a plugin's `services.sourcePull.connector` is. Authority comes from the call the plugin's code is running in, as with
 * `services.connections`: this installation's own action (or kept job) declaring `connections:use` and `sources:pull_connector`, both held
 * by the caller; a pull also needs `scheduling: "concurrent"` and a call that may write. The slot is a `per_record` slot of the Manifest and
 * the record is the call's project's. The request is closed: the account is the person's binding, never a field.
 */
export function createPluginConnectorSourceClient(manifest: PluginManifest, port: PluginConnectorPort, gate: PluginSourcePullGate): PluginConnectorSourceClient {
  const slots = new Map((manifest.connections?.slots ?? []).map(slot => [slot.slot_id, slot]));
  const enter = (permissions: readonly string[], pulls: boolean) => {
    const scope = currentPluginInvocation();
    if (!scope || !inPluginInstance(scope, gate) || "scene" in scope) throw errors.source_pull_connector_call_required("账号来源只能在本插件自己的动作或后台作业里使用");
    const missing = permissions.find(item => !scope.caller.permissions.includes(item) || ("definition" in scope && !scope.definition.action.permissions.includes(item)));
    if (missing) throw errors.source_pull_connector_permission_undeclared(`这次调用没有声明并持有 ${missing}`);
    if (pulls && "definition" in scope && scope.definition.action.scheduling !== "concurrent") throw errors.source_pull_connector_action_not_concurrent("取账号来源的动作必须声明 scheduling: concurrent");
    if (pulls && pluginInvocationReadOnly(scope)) throw errors.source_pull_connector_read_only("只读调用里不能取账号来源");
    return scope;
  };
  const currentFor = (scope: NonNullable<ReturnType<typeof currentPluginInvocation>>, permissions: readonly string[], signal?: AbortSignal) => () => {
    signal?.throwIfAborted(); gate.assertActive();
    for (const permission of permissions) gate.requireGrant(permission);
    assertCapturedPluginActionCurrent(scope, gate); signal?.throwIfAborted();
  };
  const slotOf = (slot_id: unknown) => {
    const slot = typeof slot_id === "string" ? slots.get(slot_id) : undefined;
    if (!slot || slot.binding !== "per_record") throw errors.source_pull_connector_slot_undeclared(`连接槽 ${String(slot_id)} 不是 Manifest 声明的按记录绑定的槽`);
    return slot;
  };
  const integration = (value: unknown): string => {
    if (typeof value !== "string" || !INTEGRATION_ID.test(value)) throw errors.source_pull_connector_request_invalid("集成号不合法");
    return value;
  };
  const both = [PLUGIN_CONNECTIONS_PERMISSION, PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION];
  return Object.freeze<PluginConnectorSourceClient>({
    async open(slot_id, integration_id) {
      const slot = slotOf(slot_id), id = integration(integration_id), scope = enter(both, false);
      currentFor(scope, both, scope.caller.signal)();
      const adapter = await port.open(slot.service_id, id);
      return { adapter: { plugin_id: String(adapter.plugin_id), version: String(adapter.version) } };
    },
    async pull(request, options) {
      const checked = checkedPull(request), slot = slotOf(checked.slot_id), scope = enter(both, true);
      const target = slotTarget(manifest, gate, slot, checked.record_key, scope.caller.project_id);
      const signal = AbortSignal.any([scope.caller.signal, options?.signal].filter((item): item is AbortSignal => item !== undefined));
      const current = currentFor(scope, both, signal);
      const beforeEffect = async () => { current(); if ("definition" in scope) await scope.caller.beforeEffect(); current(); };
      await beforeEffect();
      const receipt = await port.pull(target, { integration_id: checked.integration_id, cursor: checked.cursor, ...(checked.intent ? { intent: checked.intent } : {}),
        ...(checked.settings ? { settings: checked.settings } : {}) }, { signal, current, beforeEffect });
      await beforeEffect();
      // Rebuilt from five fields, so nothing else the Host's side might carry (a connection, a reference) reaches the plugin.
      const { receipt_id, driver_id, started_at, completed_at, result } = structuredClone(receipt);
      return { receipt_id, driver_id, started_at, completed_at, result };
    },
    async adapt(request) {
      const checked = checkedAdapt(request), slot = slotOf(checked.slot_id), scope = enter(both, false);
      const target = slotTarget(manifest, gate, slot, checked.record_key, scope.caller.project_id);
      currentFor(scope, both, scope.caller.signal)();
      return structuredClone(await port.adapt(target, checked.integration_id, checked.event));
    },
    async accounts(service_ids) {
      const declared = new Set([...slots.values()].map(slot => slot.service_id));
      if (!Array.isArray(service_ids) || service_ids.length > MAX_SERVICES || !service_ids.every(id => typeof id === "string" && declared.has(id))) {
        throw errors.source_pull_connector_request_invalid("只能问 Manifest 声明了连接槽的服务");
      }
      const scope = enter([PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION], false);
      currentFor(scope, [PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION], scope.caller.signal)();
      const answer = port.accounts([...new Set(service_ids)]);
      return Object.fromEntries(Object.entries(answer).map(([service, state]) => [service, { bound: state.bound === true }]));
    },
  });

  function checkedPull(request: unknown): ConnectorPullRequest {
    const value = closed(request, ["slot_id", "integration_id", "record_key", "cursor", "intent", "settings"], "取数请求");
    const intent = value.intent === undefined ? undefined : closed(value.intent, ["sync_mode"], "intent");
    if (intent?.sync_mode !== undefined && (typeof intent.sync_mode !== "string" || intent.sync_mode.length === 0 || intent.sync_mode.length > 40)) throw errors.source_pull_connector_request_invalid("sync_mode 不合法");
    return { slot_id: String(value.slot_id), integration_id: integration(value.integration_id), record_key: value.record_key as string, cursor: plainCursor(value.cursor),
      ...(intent ? { intent: intent as { sync_mode?: string } } : {}), ...(value.settings === undefined ? {} : { settings: checkedSettings(value.settings) }) };
  }

  function checkedAdapt(request: unknown): { slot_id: string; integration_id: string; record_key: string; event: ConnectorRawEvent } {
    const value = closed(request, ["slot_id", "integration_id", "record_key", "event"], "适配请求");
    return { slot_id: String(value.slot_id), integration_id: integration(value.integration_id), record_key: value.record_key as string, event: checkedEvent(value.event) };
  }
}

/** A request object with only the fields listed: any other is refused before anything leaves. */
function closed(value: unknown, allowed: readonly string[], what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.source_pull_connector_request_invalid(`${what}必须是对象`);
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length > 0) throw errors.source_pull_connector_request_invalid(`${what}不认这些字段：${extra.join("、")}`);
  return value as Record<string, unknown>;
}

function checkedSettings(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.source_pull_connector_request_invalid("settings 必须是对象");
  const entries = Object.entries(value);
  if (entries.length > MAX_SETTINGS) throw errors.source_pull_connector_request_invalid(`settings 至多 ${MAX_SETTINGS} 项`);
  for (const [key, setting] of entries) {
    if (!SETTING_KEY.test(key) || RESERVED_SETTINGS.has(key)) throw errors.source_pull_connector_request_invalid(`settings 不能用 ${key} 这个名字`);
    if (typeof setting !== "string" || setting.length > MAX_SETTING_VALUE) throw errors.source_pull_connector_request_invalid(`settings.${key} 必须是 ${MAX_SETTING_VALUE} 个字符以内的文本`);
  }
  return Object.freeze({ ...(value as Record<string, string>) });
}

function plainCursor(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    if (text !== undefined && text.length > MAX_CURSOR) throw new Error("too large");
    return structuredClone(value);
  } catch { throw errors.source_pull_connector_request_invalid(`游标必须是 ${MAX_CURSOR / 1024} KB 以内的普通数据`); }
}

function checkedEvent(value: unknown): ConnectorRawEvent {
  const event = closed(value, [...RAW_EVENT_TEXT, "payload", "cursor_after"], "原始事件");
  if (!RAW_EVENT_TEXT.every(key => typeof event[key] === "string" && (event[key] as string).length > 0 && (event[key] as string).length <= 2_048)
    || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) throw errors.source_pull_connector_request_invalid("原始事件的字段不合法");
  try {
    if (JSON.stringify(event).length > MAX_EVENT) throw new Error("too large");
    const copy = structuredClone(event);
    return { raw_event_id: copy.raw_event_id as string, provider_dedupe_id: copy.provider_dedupe_id as string, occurred_at: copy.occurred_at as string,
      observed_at: copy.observed_at as string, payload: copy.payload as Record<string, unknown>, ...(copy.cursor_after === undefined ? {} : { cursor_after: copy.cursor_after }) };
  } catch { throw errors.source_pull_connector_request_invalid("原始事件必须是 1 MB 以内的普通数据"); }
}
