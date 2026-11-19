import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { SettingsDeclaration, SettingEntryDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import { bindSettingsHandlers, defineSettingsActions } from "@molis-ai/molis-work-plugin-sdk";
import { shelfErrors, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { ShelfPreferenceKey, ShelfDeviceSettings } from "@molis-ai/molis-work-module-shelf/contract";

export const shelfPreferences = defineSettingsActions({ scope: "home",
  read: { capability_id: "shelf.preferences.read", version: /* @version action.shelf.preferences.read */ 1, title: "查看置物架本机偏好", description: "读取此设备上的置物架设置及来源", permissions: ["shelf:read"] },
  write: { capability_id: "shelf.preferences.write", version: /* @version action.shelf.preferences.write */ 1, title: "更改置物架本机偏好", description: "在本机应用或恢复一项设置", permissions: ["shelf:read", "shelf:write"] },
});

const bool: SandboxSchema = { type: "boolean" }, text: SandboxSchema = { type: "string", minLength: 1 };
const object = (properties: Record<string, SandboxSchema>, required = Object.keys(properties)): SandboxSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: SandboxSchema): SandboxSchema => ({ type: "array", items });
const hotkey = object({ key_code: { type: "integer", minimum: 0, maximum: 255 }, carbon_modifiers: { type: "integer", minimum: 1, maximum: 65535 } });
const panel = object({ code: text, meta: bool, ctrl: bool, shift: bool, alt: bool });
const shortcut = object({ id: text, name: text, kinds: array(text), prompt: text });
function device(key: ShelfPreferenceKey, title: string, schema: SandboxSchema, consequence?: SettingEntryDeclaration["consequence"]): SettingEntryDeclaration {
  return { key, title: { key: "shelf.settings-ui." + title }, layers: ["personal"], device_only: true, schema, ...(consequence && { consequence }) };
}
export const shelfSettings: SettingsDeclaration = {
  read: { capability_id: shelfPreferences.read.capability_id, version: shelfPreferences.read.version },
  write: { capability_id: shelfPreferences.write.capability_id, version: shelfPreferences.write.version },
  entries: [
    device("shelf.drop_wheel", "drop-wheel", bool),
    device("shelf.hotkeys", "global-hotkeys", object({ toggle: hotkey, capture: hotkey, files: hotkey })),
    device("shelf.panel_keys", "panel-keys", object({ hide: panel, paste: panel, copy: panel, delete: panel })),
    device("shelf.engine", "terminal-choice", text),
    device("shelf.model", "ai-model-automatic-actions", object({provider_id: text, model_id: text}, []), ["cost", "external"]),
    device("shelf.action_bar", "action-bar", object({shortcuts: array(shortcut), action_order: array(text), hidden_actions: array(text)})),
  ],
};

export function bindShelfPreferences(context: PluginStartContext, store: () => ShelfStore, remember: (settings: ShelfDeviceSettings) => void): ActionHandlerBinding[] {
  const bound = bindSettingsHandlers(shelfPreferences, shelfSettings, {
    owner_id: JSON.stringify([context.install_id, context.installation_generation]),
    errors: { setting_conflict: shelfErrors.conflict, setting_invalid: shelfErrors.invalid },
    read: (_scope, keys) => store().preferences.read(keys),
    async withWriteTransaction(scope, run) {
      const shelf = store();
      const result = await shelf.preferences.withWriteTransaction(scope, run);
      remember(shelf.settings());
      context.services?.ui?.invalidate();
      return result;
    },
  });
  const reason = "只有本机用户能查看或更改置物架设备设置";
  function availability(caller: ActionCallContext) {
    if (caller.audience !== "user" || caller.plugin_install_id || caller.host_plugin || caller.delegated_by || caller.delegated_action)
      return { available: false, code: "actions.forbidden", kind: "forbidden", reason } as const;
    return { available: true } as const;
  }
  return Object.values(bound).map(binding => ({ ...binding, availability, handle(caller, input) {
    if (!availability(caller).available) throw new ActionError("actions.forbidden", reason);
    return binding.handle(caller, input);
  } }));
}
