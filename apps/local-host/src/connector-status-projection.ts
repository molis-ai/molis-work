import { actionReachesAudience, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorConnectionStatus, ConnectorObservations } from "@molis-ai/molis-work-contracts/services/connector-host";

/** Only owner facts and the actual caller's directory determine this view. */
export function projectConnectorStatus(input: {
  revision: string; configured: boolean; enabled: boolean; active: boolean; source: string;
  observations: ConnectorObservations; actions: readonly ActionView[]; caller: ActionCallContext;
  noAuthentication: boolean; live?: boolean;
}): ConnectorConnectionStatus {
  const { observations, revision, actions, caller, active } = input;
  const check = observations.check?.revision === revision ? observations.check : undefined;
  const recentCall = observations.call?.revision === revision && (!check || observations.call.at > check.at) ? observations.call : undefined;
  const connectivity = !active ? "disconnected" : input.live === false ? check?.outcome === "failed" ? "failed" : "disconnected"
    : recentCall ? recentCall.outcome === "unknown" ? "unknown" : "connected" : check?.outcome ?? (input.live ? "connected" : "unchecked");
  const authorized = (view: ActionView) => view.action.permissions.every(permission => caller.permissions.includes(permission))
    && actionReachesAudience(view.action, view.capability_id, caller.audience)
    && (!caller.allowed_actions || caller.allowed_actions.some(ref => ref.capability_id === view.capability_id && ref.version === view.version && (!ref.provider_id || ref.provider_id === view.provider.provider_id)));
  const entries = actions.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
    title: view.action.title, operation: view.operation, input_schema: view.action.input_schema, permissions: view.action.permissions,
    available: view.availability.available && authorized(view) && connectivity === "connected",
    ...(!view.availability.available ? { reason: view.availability.reason } : !authorized(view) ? { reason: "当前调用者未获准使用此能力" }
      : !active ? { reason: "连接已停用或断开" } : connectivity !== "connected" ? { reason: "尚未通过当前配置的连通检查" } : {}) }));
  const callable = entries.filter(entry => entry.available).length, granted = actions.filter(authorized).length;
  return {
    configuration: { state: input.configured ? "complete" : "incomplete", enabled: input.enabled, revision, source: input.source },
    connectivity: { state: connectivity, source: input.live !== undefined ? "connection-owner-live" : recentCall ? "business-call" : "connection-check",
      ...(recentCall || check ? { observed_at: recentCall?.at ?? check!.at } : {}),
      ...(observations.check ? { last_check: observations.check, current: observations.check.revision === revision && active } : {}) },
    authorization: {
      service: { state: input.noAuthentication ? "not-required" : check?.authorization ?? (input.live ? "verified" : "unknown"),
        scopes: check?.scopes ?? null, scope_state: check?.scopes ? "reported" : "unknown" },
      work: { state: !actions.length ? "unknown" : granted === actions.length ? "allowed" : granted ? "partial" : "blocked",
        missing_permissions: [...new Set(actions.flatMap(view => view.action.permissions.filter(permission => !caller.permissions.includes(permission))))],
        source: "current-caller-authority", note: "各能力的当前策略和配置限制见能力列表，派出时再次核对" },
    },
    capabilities: { state: !entries.length ? "none-discovered" : callable === entries.length ? "callable" : callable ? "partial" : "blocked",
      entries, coverage: "direct-connection-actions", note: "插件对具体来源、模型或业务对象的操作，仍以该插件的当前配置和动作目录为准" },
    ...(observations.call ? { last_call: { ...observations.call, current_revision: observations.call.revision === revision } } : {}),
  };
}
