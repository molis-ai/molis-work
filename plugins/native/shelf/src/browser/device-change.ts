import { SHELF_PREFERENCE_FIELDS, type ShelfDeviceSettings as Settings, type ShelfPreferenceKey, type ShelfSettingsPatch } from "@molis-ai/molis-work-module-shelf/contract";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";

export function deviceChange(current: Settings, key: ShelfPreferenceKey, patch: ShelfSettingsPatch) {
  const next: Settings = { ...current, ...patch, hotkeys: { ...current.hotkeys, ...patch.hotkeys }, panel_keys: { ...current.panel_keys, ...patch.panel_keys } };
  const fields = SHELF_PREFERENCE_FIELDS[key];
  let value: unknown = fields.length === 1 ? next[fields[0]] : Object.fromEntries(fields.map(field => [field, next[field]]));
  if (key === "shelf.action_bar" && patch.shortcuts) {
    const ids = next.shortcuts.map(action => "shortcut:" + action.id);
    const retained = (slot: string) => !slot.startsWith("shortcut:") || ids.includes(slot);
    value = { shortcuts: next.shortcuts, action_order: [...new Set([...next.action_order.filter(retained), ...ids])], hidden_actions: next.hidden_actions.filter(retained) };
  }
  return value == null ? { inherit: true } : { set: value };
}

export function applyDeviceValues(settings: Settings, response: SettingsValues): Settings {
  const values = { ...settings };
  for (const item of response.values) {
    if (item.state !== "ok" || !Object.hasOwn(SHELF_PREFERENCE_FIELDS, item.key)) continue;
    const fields = SHELF_PREFERENCE_FIELDS[item.key as ShelfPreferenceKey];
    if (fields.length > 1) Object.assign(values, item.value);
    else {
      const inheritedModel = item.key === "shelf.model" && !Object.hasOwn(Object(item.value), "provider_id");
      Object.assign(values, { [fields[0]]: inheritedModel ? null : item.value });
    }
  }
  return values;
}
