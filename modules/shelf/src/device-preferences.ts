import { assertSandboxJson, canonicalJsonText, type SettingSnapshot, type SettingsOwnerScope, type SettingsTransaction } from "@molis-ai/molis-work-plugin-sdk";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { ShelfAiPorts, ShelfDeviceSettings, ShelfSettingsPatch } from "./contract.js";
import { saveCatalog, type CatalogFile, type ShelfCatalogAccess } from "./catalog.js";
import { shelfErrors } from "./errors.js";
import { SHELF_PREFERENCE_FIELDS, shelfPreferenceKey, type ShelfPreferenceKey } from "./preference-keys.js";
import { defaultShelfDeviceSettings, mergeShelfSettings, normalizeShelfSettings, parseSettingsWriteBody } from "./settings.js";

function requireKey(key: string): ShelfPreferenceKey {
  if (!shelfPreferenceKey(key)) throw shelfErrors.invalid("未知的置物架设置");
  return key;
}

function valueOf(settings: ShelfDeviceSettings, key: ShelfPreferenceKey): SandboxJson {
  const fields = SHELF_PREFERENCE_FIELDS[key];
  const value: unknown = fields.length === 1 ? settings[fields[0]] ?? {} : Object.fromEntries(fields.map(field => [field, settings[field]]));
  assertSandboxJson(value, (_kind, message) => { throw shelfErrors.invalid_file(message); });
  return value;
}

function valueProblem(settings: ShelfDeviceSettings, key: ShelfPreferenceKey, ai?: ShelfAiPorts) {
  if (key === "shelf.engine" && settings.engine.startsWith("custom:") && !settings.custom_runtimes.some(runtime => "custom:" + runtime.id === settings.engine))
    return "所选终端工具已移除";
  if (key === "shelf.model" && settings.model_selection && !ai?.status(settings.model_selection).available)
    return "所选模型或连接当前不可用";
}

export function shelfPreferenceSnapshot(catalog: CatalogFile, key: ShelfPreferenceKey, ai?: ShelfAiPorts): SettingSnapshot {
  const layer = catalog.preferences.layers[key], settings = normalizeShelfSettings(catalog.settings);
  const fallback = valueOf(defaultShelfDeviceSettings(), key);
  const value = valueOf(settings, key), problem = valueProblem(settings, key, ai);
  return { key, state: "ok", revision: JSON.stringify([layer?.revision ?? 0, fallback, problem ?? null]),
    layer_revisions: { personal: String(layer?.revision ?? 0) },
    ...(problem && { value_unavailable: problem }), layers: { provider_default: fallback, ...(layer?.explicit && { personal: value }) } };
}

function advance(catalog: CatalogFile, key: ShelfPreferenceKey, explicit: boolean) {
  const revision = (catalog.preferences.layers[key]?.revision ?? 0) + 1;
  catalog.preferences.layers[key] = { revision, explicit };
}

/** Original local administration and the desktop panel edit the same layers as a scene. */
export function saveDevicePatch(catalog: CatalogFile, patch: ShelfSettingsPatch) {
  const previous = normalizeShelfSettings(catalog.settings);
  catalog.settings = normalizeShelfSettings(mergeShelfSettings(previous, patch));
  for (const name of Object.keys(SHELF_PREFERENCE_FIELDS)) {
    const key = requireKey(name);
    if (SHELF_PREFERENCE_FIELDS[key].some(field => Object.hasOwn(patch, field))) advance(catalog, key, true);
  }
}

export class ShelfDevicePreferences {
  constructor(private readonly access: ShelfCatalogAccess, private readonly ai?: ShelfAiPorts) {}

  read(keys: readonly string[]) {
    const catalog = this.access.read();
    return keys.map(key => shelfPreferenceSnapshot(catalog, requireKey(key), this.ai));
  }

  withWriteTransaction<R>(scope: SettingsOwnerScope, run: (transaction: SettingsTransaction) => R): Promise<R> {
    return this.access.files.write(writer => {
      const catalog = this.access.from(writer);
      const receiptKey = (key: string, id: string) => JSON.stringify([scope.owner_id, scope.actor_id, key, "personal", id]);
      let dirty = false;
      const result = run({
        readCurrent: name => shelfPreferenceSnapshot(catalog, requireKey(name), this.ai),
        readReceipt: ({key, request_id}) => catalog.preferences.receipts[receiptKey(key, request_id)],
        writeChange: ({key: name, change}, restoringOriginal) => {
          const key = requireKey(name);
          const fields = SHELF_PREFERENCE_FIELDS[key];
          const value = "set" in change ? change.set : valueOf(defaultShelfDeviceSettings(), key);
          const emptyModel = key === "shelf.model" && value !== null && typeof value === "object" && !Object.keys(value).length;
          const patch = parseSettingsWriteBody(fields.length === 1 ? { [fields[0]]: emptyModel ? null : value } : value);
          if ("error" in patch) throw shelfErrors.invalid(patch.error);
          if (Object.keys(patch.ok).some(field => !(fields as readonly string[]).includes(field))) throw shelfErrors.invalid("只能修改声明的设置");
          const next = normalizeShelfSettings(mergeShelfSettings(catalog.settings, patch.ok));
          if (canonicalJsonText(valueOf(next, key)) !== canonicalJsonText(value)) throw shelfErrors.invalid("设置内容不完整或引用了未知的动作");
          const problem = valueProblem(next, key, this.ai);
          if (problem && !restoringOriginal) throw shelfErrors.invalid(problem);
          catalog.settings = next;
          advance(catalog, key, "set" in change);
        },
        saveReceipt: ({key, request_id}, receipt) => { catalog.preferences.receipts[receiptKey(key, request_id)] = receipt; dirty = true; },
      });
      if (dirty) saveCatalog(writer, catalog);
      return result;
    });
  }
}
