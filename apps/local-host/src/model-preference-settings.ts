import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SettingSnapshot, SettingsOwner, SettingsRequestIdentity } from "@molis-ai/molis-work-plugin-sdk";
import { openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";
import { commitModelPreference, readModelPreference, type ConsumerModelConfigurationDeclaration, type ModelPreferenceFile } from "./model-configuration.js";

const errors = defineErrorCodes("host", { setting_conflict: "conflict", setting_invalid: "invalid" });

function configuredSelection(home: string, choice?: PluginModelSelection) {
  const catalog = openConfiguredModels(home);
  try {
    const resolved = catalog && selectConfiguredTextModel(home, catalog.store, choice);
    return resolved ? { provider_id: resolved.provider.provider_id, model_id: resolved.model.model_id } : null;
  } finally { catalog?.storage.close(); }
}

/** Store the actual personal layer and the SDK receipt in a single replacement of the owner's preference file. */
export function modelPreferenceOwner(home: string, declaration: ConsumerModelConfigurationDeclaration, key: string, installation: string): SettingsOwner {
  const snapshot = (state: ModelPreferenceFile): SettingSnapshot => {
    const fallback = configuredSelection(home);
    const unavailable = state.selection && !configuredSelection(home, state.selection);
    return { key, state: "ok", ...(unavailable && { value_unavailable: "所选模型或连接当前不可用" }), revision: JSON.stringify([state.revision, fallback, Boolean(unavailable)]), layer_revisions: { personal: String(state.revision) },
      layers: { provider_default: fallback, ...(state.selection && { personal: { ...state.selection } }) } };
  };
  return {
    owner_id: installation, errors,
    read: (_scope, keys) => keys.map(() => snapshot(readModelPreference(home, declaration))),
    transaction(scope, run) {
      const state = readModelPreference(home, declaration);
      const receiptKey = (identity: SettingsRequestIdentity) => JSON.stringify([installation, scope.actor_id, identity.key, identity.layer, identity.request_id]);
      let changed = false;
      const result = run({
        readCurrent: () => snapshot(state),
        readReceipt: identity => state.receipts[receiptKey(identity)],
        writeChange({ change }, restoringOriginal) {
          let choice: PluginModelSelection | null = null;
          if ("set" in change) {
            const requested = change.set;
            if (!requested || typeof requested !== "object" || Array.isArray(requested) || typeof requested.provider_id !== "string" || typeof requested.model_id !== "string" ||
              Object.keys(requested).length !== 2) throw errors.setting_invalid("请选择已配置的供应商和模型");
            const selection = { provider_id: requested.provider_id, model_id: requested.model_id };
            choice = restoringOriginal ? selection : configuredSelection(home, selection);
            if (!choice) throw errors.setting_invalid("所选模型或连接当前不可用");
          }
          state.selection = choice; state.revision++;
        },
        saveReceipt(identity, receipt) { state.receipts[receiptKey(identity)] = receipt; changed = true; },
      });
      if (changed) commitModelPreference(home, declaration, state);
      return result;
    },
  };
}
