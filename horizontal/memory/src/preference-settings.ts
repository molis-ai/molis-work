import { LOCAL_PERSON_ACTOR_ID, requireSynchronous, type ActionAvailability, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SettingLayer, SettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import { MEMORY_CONFIGURE_PERMISSION, MEMORY_PROVIDER_ID, memoryPreferenceMarkerPrefix, type MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { bindSettingsHandlers, defineSettingsActions, type SettingSnapshot, type SettingsOwner, type SettingsOwnerScope,
  type SettingsRequestIdentity, type SettingsWriteReceipt } from "@molis-ai/molis-work-plugin-sdk";
import { memoryErrors } from "./errors.js";
import { completePrefs, defaultPrefs, isCompletePrefs, PERSONAL_PREFS_KEY, PROJECT_DEFAULT_PREFS_KEY, projectPrefsKey } from "./prefs.js";
import { preferenceLayer, savePreferenceLayer } from "./preference-layers.js";
import { decodePreferenceSetting, encodePreferenceSetting, preferenceSettingSchema } from "./preference-setting-value.js";

export const MEMORY_SETTING_KEYS = { personal: "memory.personal_preferences", project: "memory.project_preferences" } as const;
const actions = defineSettingsActions({
  scope: "home",
  read: { capability_id: "memory.preferences.read", version: /* @version action.memory.preferences.read */ 1,
    title: "读取记忆偏好", description: "本人查看当前记忆偏好和各层选择", permissions: [MEMORY_CONFIGURE_PERMISSION] },
  write: { capability_id: "memory.preferences.write", version: /* @version action.memory.preferences.write */ 1,
    title: "修改记忆偏好", description: "本人采用或恢复已查看的记忆设置", permissions: [MEMORY_CONFIGURE_PERMISSION] },
});
const declaration: SettingsDeclaration = {
  entries: [
    { key: MEMORY_SETTING_KEYS.personal, title: { key: "workbench.scene.memory-personal" },
      layers: ["personal"], schema: preferenceSettingSchema, consequence: ["reach"] },
    { key: MEMORY_SETTING_KEYS.project, title: { key: "workbench.scene.memory-project" },
      layers: ["personal", "project"], schema: preferenceSettingSchema, consequence: ["reach"] },
  ],
  read: { capability_id: actions.read.capability_id, version: actions.read.version },
  write: { capability_id: actions.write.capability_id, version: actions.write.version },
};
export const memorySettingActions = actions;
export const memorySettingOwner = { provider_id: MEMORY_PROVIDER_ID, settings_entries: declaration };

function profileKey(key: string, layer: SettingLayer, project: string | null): string {
  if (key === MEMORY_SETTING_KEYS.personal && layer === "personal") return PERSONAL_PREFS_KEY;
  if (key === MEMORY_SETTING_KEYS.project) {
    if (layer === "personal") return PROJECT_DEFAULT_PREFS_KEY;
    if (layer === "project" && project) return projectPrefsKey(project);
  }
  throw memoryErrors.setting_invalid("这项记忆偏好不适用于所选范围");
}

function snapshot(ledger: MemoryLedgerPort, scope: SettingsOwnerScope, key: string): SettingSnapshot {
  const target = key === MEMORY_SETTING_KEYS.personal ? "personal" : "project";
  const baseKey = profileKey(key, "personal", null), base = ledger.prefs(scope.actor_id, baseKey);
  const baseLayer = preferenceLayer(ledger, scope.actor_id, baseKey, base !== null);
  const ownKey = target === "project" && scope.project_id ? projectPrefsKey(scope.project_id) : null;
  const own = ownKey ? ledger.prefs(scope.actor_id, ownKey) : null;
  const ownLayer = ownKey ? preferenceLayer(ledger, scope.actor_id, ownKey, own !== null) : null;
  const revision = JSON.stringify(["reviewed-1", baseLayer.revision, ownLayer?.revision ?? 0]);
  if (!isCompletePrefs(base) || own !== null && !isCompletePrefs(own) || ownLayer && ownLayer.explicit !== (own !== null)) {
    return { key, revision, state: "unavailable", reason: "缺少完整的现行记忆偏好" };
  }
  return { key, state: "ok", revision, layer_revisions: { personal: String(baseLayer.revision), ...(ownLayer && { project: String(ownLayer.revision) }) }, layers: {
    provider_default: encodePreferenceSetting(defaultPrefs(target, "reviewed")),
    ...(baseLayer.explicit && { personal: encodePreferenceSetting(base) }),
    ...(own && { project: encodePreferenceSetting(own) }),
  }, effective_value: encodePreferenceSetting(completePrefs(target, base, own)) };
}

export function memorySettingHandlers(ledger: MemoryLedgerPort, assertActive: () => void) {
  const owner: SettingsOwner = {
    owner_id: MEMORY_PROVIDER_ID, errors: memoryErrors,
    read: (scope, keys) => ledger.transaction(() => { assertActive(); return keys.map(key => snapshot(ledger, scope, key)); }),
    transaction: (scope, run) => ledger.transaction(() => {
      assertActive();
      const receiptKey = ({ key, layer, request_id }: SettingsRequestIdentity) => {
        const profile = layer === "personal"
          ? profileKey(key, layer, null)
          : scope.project_id ? projectPrefsKey(scope.project_id) : profileKey(key, layer, null);
        return memoryPreferenceMarkerPrefix(profile) + "receipt/" + JSON.stringify([key, layer, request_id]);
      };
      return run({
        readCurrent(key) {
          const current = snapshot(ledger, scope, key);
          if (current.state === "unavailable") throw memoryErrors.unavailable(current.reason);
          return current;
        },
        readReceipt: identity => ledger.marker(scope.actor_id, receiptKey(identity))?.body as SettingsWriteReceipt | undefined,
        writeChange({ key, layer, change }) {
          const profile = profileKey(key, layer, scope.project_id);
          const explicit = "set" in change;
          const prefs = explicit ? decodePreferenceSetting(change.set) : layer === "project" ? null
            : defaultPrefs(key === MEMORY_SETTING_KEYS.personal ? "personal" : "project", "reviewed");
          savePreferenceLayer(ledger, scope.actor_id, profile, prefs, explicit, scope.project_id ?? undefined);
        },
        saveReceipt: (identity, receipt) => ledger.setMarker(scope.actor_id, receiptKey(identity), receipt, new Date().toISOString()),
      });
    }),
  };
  const bound = bindSettingsHandlers(actions, declaration, owner);
  const refusal = memoryErrors.forbidden("只有本人可以管理记忆偏好");
  const denied = { available: false, code: refusal.code, kind: refusal.kind, reason: refusal.message } as const;
  function availability(caller: ActionCallContext): ActionAvailability {
    return caller.actor_id === LOCAL_PERSON_ACTOR_ID && caller.audience === "user" && caller.actor_kind !== "runtime" && !caller.host_plugin && !caller.delegated_by
      ? { available: true } : denied;
  }
  function forPerson(binding: ActionHandlerBinding): ActionHandlerBinding {
    return { ...binding, availability, handle(caller, input) {
      if (!availability(caller).available) throw memoryErrors.forbidden(denied.reason);
      const current = () => { assertActive(); caller.memory_session?.assertCurrent(); };
      current();
      return binding.handle({ ...caller, assert_authority_current(ref, required) {
        requireSynchronous(caller.assert_authority_current?.(ref, required), "最终权限检查必须同步完成"); current();
      } }, input);
    } };
  }
  return [forPerson(bound.read), forPerson(bound.write)];
}
