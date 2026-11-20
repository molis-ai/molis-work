import { MEMORY_CONSUMERS, MEMORY_FORMAL_KINDS, MEMORY_KINDS, MEMORY_LIFECYCLES, MEMORY_SCENES,
  isCompleteMemoryPrefs, type MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import type { SandboxJson, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { memoryErrors } from "./errors.js";

const flag: SandboxSchema = { type: "boolean" };
const options = (values: readonly string[]): SandboxSchema => ({ type: "string", enum: [...values] });
const object = (properties: Record<string, SandboxSchema>, required = Object.keys(properties)): SandboxSchema =>
  ({ type: "object", properties, required, additionalProperties: false });

/** Settings values have a closed schema. Per-plugin rules use a list so installation ids remain values. */
export const preferenceSettingSchema = object({
  enabled: flag, task_recall: flag, form: flag, auto: flag, learn_from_work: flag, learn_from_ui: flag,
  consumers: object(Object.fromEntries(MEMORY_CONSUMERS.map(key => [key, flag]))),
  plugins: { type: "array", items: object({ plugin_id: { type: "string", minLength: 1 }, allowed: flag,
    kinds: { type: "array", items: options(MEMORY_KINDS) } }) },
  class_restrictions: { type: "array", items: object({
    selector: object({ consumer: options(MEMORY_CONSUMERS), current_scene: options(MEMORY_SCENES), scene: options(MEMORY_SCENES),
      kind: options(MEMORY_FORMAL_KINDS), lifecycle: options(MEMORY_LIFECYCLES) }, ["consumer", "current_scene"]),
    read: options(["inherit", "explicit-only", "off"]), form: options(["inherit", "off"]),
  }) },
});

export function encodePreferenceSetting(prefs: MemoryPrefs): SandboxJson {
  return { ...prefs, plugins: Object.keys(prefs.plugins).sort().map(plugin_id => ({ plugin_id, ...prefs.plugins[plugin_id]! })),
    class_restrictions: prefs.class_restrictions.map(rule => ({ ...rule, selector: { ...rule.selector } })) };
}

/** The common settings handler checks the schema. This checks unique ids and the Memory owner's rules. */
export function decodePreferenceSetting(value: SandboxJson): MemoryPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.plugins)) throw memoryErrors.invalid("记忆偏好无效");
  const plugins = new Map<string, { allowed: SandboxJson | undefined; kinds: SandboxJson | undefined }>();
  for (const rule of value.plugins) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule) || typeof rule.plugin_id !== "string" || plugins.has(rule.plugin_id))
      throw memoryErrors.invalid("记忆偏好含无效或重复的插件规则");
    plugins.set(rule.plugin_id, { allowed: rule.allowed, kinds: rule.kinds });
  }
  const prefs = { ...value, plugins: Object.fromEntries(plugins) };
  if (!isCompleteMemoryPrefs(prefs)) throw memoryErrors.invalid("记忆偏好含无效的规则");
  return prefs;
}
