import { MEMORY_CONSUMERS, MEMORY_KINDS, isMemoryClassRestrictions, type MemoryConsumer, type MemoryKind, type MemoryPrefs, type MemoryPreset, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";

/**
 * The assisted base switches; Home creation explicitly persists reviewed instead. Completing a stored override
 * never chooses whether a Home is new. External AI clients cannot read personal memories by default.
 */
export function defaultPrefs(scope: MemoryScope, preset: "reviewed" | "assisted" = "assisted"): MemoryPrefs {
  return {
    enabled: true, task_recall: true, form: true, auto: preset === "assisted", learn_from_work: true, learn_from_ui: true,
    consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: scope === "project" },
    plugins: {}, class_restrictions: [],
  };
}

/** Kinds a plugin reads when the person set nothing for it: how they like things done, not personal background facts. */
export const PLUGIN_DEFAULT_KINDS: readonly MemoryKind[] = ["preference", "convention"];
/**
 * In a project, a plugin also reads the facts the person approved for that project (a port, a branch name): the same for every
 * plugin, never personal facts (user 2026-11-12, BL-1073). Any other scope, or none given, keeps the personal default.
 */
export const PLUGIN_PROJECT_DEFAULT_KINDS: readonly MemoryKind[] = ["preference", "convention", "fact"];
export const pluginDefaultKinds = (scope?: MemoryScope): readonly MemoryKind[] => scope === "project" ? PLUGIN_PROJECT_DEFAULT_KINDS : PLUGIN_DEFAULT_KINDS;

/** The ledger key of one scope's switches. A project without its own uses the project default. */
export const PERSONAL_PREFS_KEY = "personal";
export const PROJECT_DEFAULT_PREFS_KEY = "project-default";
export const projectPrefsKey = (projectId: string) => `project:${projectId}`;

export { isCompleteMemoryPrefs as isCompletePrefs } from "@molis-ai/molis-work-contracts/services/memory";

/** Merge current preference layers; startup owns validation of stored profile completeness. */
export function completePrefs(scope: MemoryScope, ...layers: Array<Partial<MemoryPrefs> | null | undefined>): MemoryPrefs {
  const out = defaultPrefs(scope);
  for (const layer of layers) {
    if (!layer) continue;
    if (Object.hasOwn(layer, "class_restrictions")) {
      if (!isMemoryClassRestrictions(layer.class_restrictions)) throw memoryErrors.invalid("记忆分类限制含未知字段、取值或重复选择条件");
      out.class_restrictions = structuredClone(layer.class_restrictions);
    }
    for (const key of ["enabled", "task_recall", "form", "auto", "learn_from_work", "learn_from_ui"] as const) if (typeof layer[key] === "boolean") out[key] = layer[key]!;
    if (layer.consumers && typeof layer.consumers === "object") for (const consumer of MEMORY_CONSUMERS)
      if (typeof layer.consumers[consumer] === "boolean") out.consumers[consumer] = layer.consumers[consumer];
    if (layer.plugins && typeof layer.plugins === "object") for (const [pluginId, rule] of Object.entries(layer.plugins)) {
      if (!rule || typeof rule.allowed !== "boolean") continue;
      const kinds = Array.isArray(rule.kinds) ? rule.kinds.filter((kind): kind is MemoryKind => MEMORY_KINDS.includes(kind)) : [...pluginDefaultKinds(scope)];
      out.plugins[pluginId] = { allowed: rule.allowed, kinds: [...new Set(kinds)] };
    }
  }
  return out;
}

/** Whether a consumer may read a scope's memories, and the kinds a plugin may read (`scope` picks the plugin default). */
export function consumerAccess(prefs: MemoryPrefs, consumer: MemoryConsumer, pluginId?: string | null, readMode: "explicit" | "task" = "task",
  scope?: MemoryScope): { allowed: boolean; kinds: readonly MemoryKind[] | null } {
  if (!prefs.enabled || (readMode === "task" && !prefs.task_recall) || !prefs.consumers[consumer]) return { allowed: false, kinds: null };
  if (consumer !== "plugin") return { allowed: true, kinds: null };
  const rule = pluginId ? prefs.plugins[pluginId] : undefined;
  if (rule) return { allowed: rule.allowed && rule.kinds.length > 0, kinds: rule.kinds };
  return { allowed: true, kinds: pluginDefaultKinds(scope) };
}

/**
 * Whether anything new may be formed in a scope: 允许记住 is set on the personal page and holds everywhere, so the scope's own switch
 * only narrows it. Memory switched off personally, or 允许记住 off there, stops candidates, suggestions and automatic keeps in every project too.
 */
export function formationAllowed(personal: MemoryPrefs, own: MemoryPrefs): boolean {
  return personal.enabled && personal.form && own.form;
}

export const CONSUMER_LABELS: Record<MemoryConsumer, string> = {
  assistant: "助理", agent: "Agent 工作", ui: "界面推荐", plugin: "插件", mcp: "外部 AI 客户端",
};

/** A person's chosen recipe changes only its four controls, preserving finer permissions and learning choices. */
export function presetPrefs(current: MemoryPrefs, preset: MemoryPreset): MemoryPrefs {
  if (preset === "off") return { ...current, enabled: false };
  return { ...current, enabled: true, task_recall: preset !== "manual", form: preset !== "manual", auto: preset === "assisted" };
}
