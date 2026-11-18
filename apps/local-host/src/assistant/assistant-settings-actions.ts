import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import { bindSettingsHandlers, defineSettingsActions } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore } from "./assistant-store.js";
import { DAILY_CAP_KEY, LOOKBACK_KEY } from "./assistant-setting-values.js";
import { REPORT_SCHEDULE_KEY, reportScheduleSchema } from "./assistant-report-preference.js";

export const assistantSettingActions = defineSettingsActions({
  scope: "home",
  read: { capability_id: "assistant.preferences.read", version: /* @version action.assistant.preferences.read */ 1,
    title: "读取助理偏好", description: "本人查看助理的个人偏好、当前来源与修改版本", permissions: [] },
  write: { capability_id: "assistant.preferences.write", version: /* @version action.assistant.preferences.write */ 1,
    title: "修改助理偏好", description: "按本人已查看的版本设置或恢复助理偏好", permissions: [] },
});
const declaration: SettingsDeclaration = {
  entries: [
    { key: LOOKBACK_KEY, title: { key: "workbench.settings-assistant.lookback" }, layers: ["personal"], consequence: ["reach"],
      schema: { type: "object", additionalProperties: false, required: ["count", "unit"], properties: {
        count: { type: "integer", minimum: 1 }, unit: { type: "string", enum: ["hours", "days", "weeks"] } } } },
    { key: REPORT_SCHEDULE_KEY, title: { key: "workbench.settings-assistant.report-schedule" },
      summary: { key: "workbench.settings-assistant.report-effect" }, layers: ["personal"], consequence: ["schedule"], schema: reportScheduleSchema },
    { key: DAILY_CAP_KEY, title: { key: "workbench.settings-assistant.daily-cap" }, summary: { key: "workbench.settings-assistant.cap-range" },
      layers: ["personal"], consequence: ["cost"], schema: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } },
  ],
  read: { capability_id: assistantSettingActions.read.capability_id, version: assistantSettingActions.read.version },
  write: { capability_id: assistantSettingActions.write.capability_id, version: assistantSettingActions.write.version },
};
export const assistantSettingOwner = { provider_id: "system.assistant-settings", settings_entries: declaration };

function assertPerson(caller: ActionCallContext) {
  if (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.audience !== "user" || caller.delegated_by || caller.host_plugin || caller.actor_kind === "runtime")
    throw assistantErrors.scope("只有本人能管理助理偏好");
}

export function assistantSettingsProvider(store: () => AssistantStore): ActionProviderRegistration {
  const bound = bindSettingsHandlers(assistantSettingActions, declaration, {
    owner_id: assistantSettingOwner.provider_id, errors: assistantErrors,
    read: (scope, keys) => store().preferences.read(scope.actor_id, keys),
    transaction: (scope, run) => store().preferences.transaction(scope, run),
  });
  const handlers: ActionHandlerBinding[] = Object.values(bound).map(binding => ({
    ...binding, handle(caller, input) { assertPerson(caller); return binding.handle(caller, input); },
  }));
  return { provider: { provider_id: assistantSettingOwner.provider_id, kind: "system", title: "助理偏好" },
    definitions: Object.values(assistantSettingActions), handlers };
}
