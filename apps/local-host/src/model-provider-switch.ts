import { defineErrorCodes, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesSwitchAction, type ConnectorUsagesSwitchInput, type ConnectorUsagesSwitchResult } from "@molis-ai/molis-work-contracts/services/connector-host";
import { openConfiguredModels } from "./configured-models.js";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { shownState } from "./connector-refresh-refusals.js";
import { connectionSwitchErrors, refusalCode, switchTarget } from "./connector-usage-switch.js";

// The model settings' half of switching accounts (spec assistant-service-connections §13.4): a provider that uses one model-api
// connection's key uses another one's. The new key goes only to the address it was saved for: a provider whose address is not the
// connection's pinned origin is refused alone and keeps the key it has. `usage_id` is the provider id, as `models.connection.usages` reports it.

export const modelProviderSwitchErrors = defineErrorCodes("model_provider", { origin_mismatch: "invalid", usage_missing: "not_found", switch_failed: "conflict" });

export const modelProviderSwitch = defineConnectorUsagesSwitchAction("models.connection.switch", "换用模型配置的账号", ["connectors:management:write"], "home", /* @version action.models.connection.switch */ 1);

/** A provider's address as an origin, or `null` when it cannot be read (then no key is moved to it). */
function originOf(address: string): string | null {
  try { return new URL(address).origin; } catch { return null; }
}

/** The origin the account switched to was saved for, read at the write: `null` when it is no longer connected or has none. */
function usableOrigin(home: string, connectionId: string): string | null {
  return withConnectorConnections(home, store => {
    const now = store.get(connectionId);
    return now && shownState(home, now, store.state(now), lastConnectorCheck(store, connectionId)) === "connected" ? store.targetOrigin(connectionId) : null;
  });
}

export function modelProviderSwitchHandler(home: string): ActionHandlerBinding {
  return { ...modelProviderSwitch, handle: async (caller, value) => {
    const input = value as ConnectorUsagesSwitchInput;
    const { from, to } = switchTarget(home, input.from_connection_id, input.to_connection_id);
    const result: ConnectorUsagesSwitchResult = { switched: [], refused: [] };
    if (from.service_id !== "model-api" || !from.credential_ref || !to.credential_ref) {
      for (const usage_id of input.usage_ids ?? []) result.refused.push({ usage_id, code: modelProviderSwitchErrors.usage_missing("").code });
      return result;
    }
    const catalog = openConfiguredModels(home);
    if (!catalog) return result;
    try {
      const using = new Map(catalog.store.list().filter(provider => provider.credential_ref === from.credential_ref).map(provider => [provider.provider_id, provider]));
      const pinned = withConnectorConnections(home, store => store.targetOrigin(to.connection_id));
      const ready: string[] = [];
      for (const usage_id of input.usage_ids ?? [...using.keys()]) {
        const provider = using.get(usage_id);
        if (!provider) result.refused.push({ usage_id, code: modelProviderSwitchErrors.usage_missing("").code });
        else if (pinned === null || pinned !== originOf(provider.base_url)) result.refused.push({ usage_id, code: modelProviderSwitchErrors.origin_mismatch("").code });
        else ready.push(usage_id);
      }
      for (const usage_id of ready) {
        await caller.beforeEffect();
        try {
          const now = catalog.store.get(usage_id);
          // Changed meanwhile (another key chosen, or removed): left as the person last set it.
          if (now?.credential_ref !== from.credential_ref) throw modelProviderSwitchErrors.usage_missing("模型配置已经改过");
          // The address and the account are asked again at the write: either may have changed while the others were checked.
          const origin = usableOrigin(home, to.connection_id);
          if (origin === null) throw connectionSwitchErrors.target_unavailable("要换成的账号现在不可用，请先连好它");
          if (origin !== originOf(now.base_url)) throw modelProviderSwitchErrors.origin_mismatch("模型地址与这个账号保存时的地址不同");
          catalog.store.upsert({ provider_id: now.provider_id, display_name: now.display_name, base_url: now.base_url, api_format: now.api_format, enabled: now.enabled,
            prompt_cache: now.prompt_cache, thinking: now.thinking, models: now.models, credential_ref: to.credential_ref });
          result.switched.push(usage_id);
        } catch (error) { result.refused.push({ usage_id, code: refusalCode(error, modelProviderSwitchErrors.switch_failed) }); }
      }
      return result;
    } finally { catalog.storage.close(); }
  } };
}
