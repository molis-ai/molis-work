import { MEMORY_CONSUMERS, MEMORY_KINDS, type MemoryConsumer, type MemoryKind, type MemoryPrefs, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";

/**
 * Switches, as spec §10 lists them. Forming, automatic writing (D2: on, undoable) and learning from work and the
 * interface are on; every consumer may use memories except external AI clients reading personal ones.
 */
export function defaultPrefs(scope: MemoryScope): MemoryPrefs {
  return {
    form: true, auto: true, learn_from_work: true, learn_from_ui: true,
    consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: scope === "project" },
    plugins: {},
  };
}

/** Kinds a plugin reads when the person set nothing for it: how they like things done, not background facts. */
export const PLUGIN_DEFAULT_KINDS: readonly MemoryKind[] = ["preference", "convention"];

/** The ledger key of one scope's switches. A project without its own uses the project default. */
export const PERSONAL_PREFS_KEY = "personal";
export const PROJECT_DEFAULT_PREFS_KEY = "project-default";
export const projectPrefsKey = (projectId: string) => `project:${projectId}`;

/** A stored (possibly partial or older) record, completed with the defaults; unknown keys are dropped. */
export function completePrefs(scope: MemoryScope, ...layers: Array<Partial<MemoryPrefs> | null | undefined>): MemoryPrefs {
  const out = defaultPrefs(scope);
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of ["form", "auto", "learn_from_work", "learn_from_ui"] as const) if (typeof layer[key] === "boolean") out[key] = layer[key]!;
    if (layer.consumers && typeof layer.consumers === "object") for (const consumer of MEMORY_CONSUMERS)
      if (typeof layer.consumers[consumer] === "boolean") out.consumers[consumer] = layer.consumers[consumer];
    if (layer.plugins && typeof layer.plugins === "object") for (const [pluginId, rule] of Object.entries(layer.plugins)) {
      if (!rule || typeof rule.allowed !== "boolean") continue;
      const kinds = Array.isArray(rule.kinds) ? rule.kinds.filter((kind): kind is MemoryKind => MEMORY_KINDS.includes(kind)) : [...PLUGIN_DEFAULT_KINDS];
      out.plugins[pluginId] = { allowed: rule.allowed, kinds: [...new Set(kinds)] };
    }
  }
  return out;
}

/** Whether a consumer may read a scope's memories, and the kinds a plugin may read. */
export function consumerAccess(prefs: MemoryPrefs, consumer: MemoryConsumer, pluginId?: string | null): { allowed: boolean; kinds: readonly MemoryKind[] | null } {
  if (!prefs.consumers[consumer]) return { allowed: false, kinds: null };
  if (consumer !== "plugin") return { allowed: true, kinds: null };
  const rule = pluginId ? prefs.plugins[pluginId] : undefined;
  if (rule) return { allowed: rule.allowed && rule.kinds.length > 0, kinds: rule.kinds };
  return { allowed: true, kinds: PLUGIN_DEFAULT_KINDS };
}

export const CONSUMER_LABELS: Record<MemoryConsumer, string> = {
  assistant: "助理", agent: "Agent 工作", ui: "界面推荐", plugin: "插件", mcp: "外部 AI 客户端",
};
