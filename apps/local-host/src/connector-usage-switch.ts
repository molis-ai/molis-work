import { ActionError, defineErrorCodes, retainActionAuthority, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONNECTOR_USAGES_SWITCH_INPUT_TYPE, CONNECTOR_USAGES_SWITCH_OUTPUT_TYPE, type ConnectorConnectionRecord, type ConnectorUsagesSwitchResult } from "@molis-ai/molis-work-contracts/services/connector-host";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { shownState } from "./connector-refresh-refusals.js";

// Moving what uses one account of a service to another account of it (spec assistant-service-connections §13.4, S-108). Each consumer
// declares its own switch beside its usages read; this action finds them in the directory and calls each once with the person's own
// context. Only the person decides which account a plugin or a model uses, so every switch here is `user` only. The accounts stay.
// Each consumer the Host holds checks everything itself (the same service, the account switched to connected, its T-134 pin, the
// declaration a bind would ask for, the model's address), so calling it directly gives no more than calling it through here.

export const connectionSwitchErrors = defineErrorCodes("connector.switch", {
  same_connection: "invalid", connection_missing: "not_found", service_mismatch: "invalid", target_unavailable: "conflict", consumer_unavailable: "conflict", consumer_failed: "conflict",
  consumer_unsupported: "forbidden",
});

/**
 * The two connections a switch moves between, checked as it is now: both there, two different accounts of one service, and the one switched
 * to connected (not disabled, disconnected, nor waiting for the person to log in again, S-70). Every consumer asks again before it writes.
 */
export function switchTarget(home: string, fromId: string, toId: string): { from: ConnectorConnectionRecord; to: ConnectorConnectionRecord } {
  if (fromId === toId) throw connectionSwitchErrors.same_connection("要换成的是同一个账号");
  return withConnectorConnections(home, store => {
    const from = store.get(fromId), to = store.get(toId);
    if (!from || !to) throw connectionSwitchErrors.connection_missing("账号已不存在");
    if (from.service_id !== to.service_id) throw connectionSwitchErrors.service_mismatch("只能换成同一服务的另一个账号");
    if (shownState(home, to, store.state(to), lastConnectorCheck(store, to.connection_id)) !== "connected") throw connectionSwitchErrors.target_unavailable("要换成的账号现在不可用，请先连好它");
    return { from, to };
  });
}

/** The stable code of a refusal, never its words: the page says it in the person's language (§13.4). */
export function refusalCode(error: unknown, fallback: (message: string) => ActionError): string {
  return error instanceof ActionError ? error.code : fallback("").code;
}

type Source = { capability_id: string; version: number; provider_id: string };
export interface ConnectorUsagesSwitchReport { results: Array<Source & ConnectorUsagesSwitchResult & { reporter: string }>; failed: Array<Source & { code: string }> }
const code = { type: "string", minLength: 1, maxLength: 200 };
const source = { capability_id: code, version: { type: "integer", minimum: 1 }, provider_id: code };
const connectionId = { type: "string", minLength: 1, maxLength: 160 };

export const connectorUsagesSwitchAction: ActionDefinition<{ from_connection_id: string; to_connection_id: string }, ConnectorUsagesSwitchReport> = {
  capability_id: "connectors.usages.switch", version: 1, operation: "command", action: {
    title: "换用同一服务的另一个账号", description: "把用到一个账号的模型、插件连接槽等，换成同一服务的另一个已连通账号；逐个使用方办理，换过去的与没换的分开列出。两个账号本身都不动。",
    kind: "operation", effect: "write", scope: "home", scheduling: "concurrent", audiences: ["user"], permissions: ["connectors:management:write"], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: { from_connection_id: connectionId, to_connection_id: connectionId }, required: ["from_connection_id", "to_connection_id"], additionalProperties: false },
    output_schema: { type: "object", properties: {
      results: { type: "array", items: { type: "object", properties: { ...source, reporter: code, switched: { type: "array", items: code },
        refused: { type: "array", items: { type: "object", properties: { usage_id: code, code }, required: ["usage_id", "code"], additionalProperties: false } } },
      required: ["capability_id", "version", "provider_id", "reporter", "switched", "refused"], additionalProperties: false } },
      failed: { type: "array", items: { type: "object", properties: { ...source, code }, required: ["capability_id", "version", "provider_id", "code"], additionalProperties: false } } },
    required: ["results", "failed"], additionalProperties: false },
  } };

/**
 * One request per consumer, never one per usage (N42～N56). When the account switched to stops being usable part way, the consumers not yet
 * asked are not asked and are reported as failed; what was switched stays switched and is reported as it is.
 */
export function connectorUsagesSwitchHandler(home: string, clientFor?: (caller: ActionCallContext) => ActionClient): ActionHandlerBinding {
  return { ...connectorUsagesSwitchAction, handle: async (caller, value) => {
    if (!clientFor) throw new ActionError("actions.connection_required", "当前入口未装配业务目录");
    const input = value as { from_connection_id: string; to_connection_id: string };
    switchTarget(home, input.from_connection_id, input.to_connection_id);
    const client = clientFor(caller), nested = retainActionAuthority(caller, { ...connectorUsagesSwitchAction, provider_id: "system.connectors" });
    const consumers = (await client.discover(nested)).filter(view => view.action.input_type === CONNECTOR_USAGES_SWITCH_INPUT_TYPE && view.action.output_type === CONNECTOR_USAGES_SWITCH_OUTPUT_TYPE);
    const report: ConnectorUsagesSwitchReport = { results: [], failed: [] };
    let stopped: string | undefined;
    for (const consumer of consumers) {
      const at: Source = { capability_id: consumer.capability_id, version: consumer.version, provider_id: consumer.provider.provider_id };
      if (!stopped) try { switchTarget(home, input.from_connection_id, input.to_connection_id); } catch (error) { stopped = refusalCode(error, connectionSwitchErrors.target_unavailable); }
      if (stopped) { report.failed.push({ ...at, code: stopped }); continue; }
      // Only the Host's own consumers for now: one a plugin declares cannot yet tell this nested call from a direct one, and B is not
      // checked against S-95 for it, so it is never called (BL-1045; the hub, 2026-11-05).
      if (!consumer.provider.provider_id.startsWith("system.")) { report.failed.push({ ...at, code: connectionSwitchErrors.consumer_unsupported("").code }); continue; }
      if (!consumer.availability.available) { report.failed.push({ ...at, code: connectionSwitchErrors.consumer_unavailable("").code }); continue; }
      try {
        const result = await client.invoke(nested, at, input) as ConnectorUsagesSwitchResult;
        report.results.push({ ...at, reporter: consumer.provider.title, switched: result.switched, refused: result.refused });
      } catch (error) {
        caller.signal?.throwIfAborted();
        report.failed.push({ ...at, code: refusalCode(error, connectionSwitchErrors.consumer_failed) });
      }
    }
    return report;
  } };
}
