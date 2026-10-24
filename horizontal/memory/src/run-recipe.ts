import type { AgentRecalledMemory } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryRecallRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryClassReadPossible } from "./class-restrictions.js";
import { consumerAccess } from "./prefs.js";
import type { MemoryPreferences } from "./preferences.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import type { MemoryCaller } from "./service.js";
import { useTitle } from "./shapes.js";

export type MemoryRunRecipe = AgentRecalledMemory & {
  receipt_id: string;
  omitted: Array<{ memory_id: string; reason: "budget" | "limit" | "conflict" }>;
};

interface MemoryRunRecipeSources {
  scopes: Pick<MemoryScopeCommands, "scopesFor" | "prefsAt">;
  preferences: Pick<MemoryPreferences, "prefsFor">;
  newId(): string;
}

/** Prepare one Run's trusted scope, restriction snapshot and budgets; no body reads or use receipts. */
export function memoryRunRecipe(caller: MemoryCaller, request: MemoryRecallRequest,
  options: { skip?: boolean; budgetTokens?: number }, sources: MemoryRunRecipeSources): MemoryRunRecipe {
  const places = sources.scopes.scopesFor(caller, request.scopes);
  const current_scene = caller.current_scene ?? (caller.plugin_id === "io.molis.work.coding" ? "coding" : caller.consumer === "assistant" ? "assistant" : "common");
  const automatic = !options.skip && places.some(where => { const prefs = sources.scopes.prefsAt(caller.actor_id, where);
    return consumerAccess(prefs, caller.consumer, caller.plugin_id, "task").allowed && memoryClassReadPossible(prefs.class_restrictions, { consumer: caller.consumer, current_scene }, "task"); });
  const plugin = caller.plugin_id ?? request.situation?.plugin_id;
  const facts = { ...(plugin ? { plugins: [plugin] } : {}),
    ...(request.situation?.object_kind ? { object_kinds: [request.situation.object_kind] } : {}),
    ...(request.situation?.goal_id ? { goals: [request.situation.goal_id] } : {}) };
  const class_restrictions: AgentRecalledMemory["class_restrictions"] = {
    policy_version: 2, taxonomy_version: 1,
    personal: structuredClone(sources.preferences.prefsFor(caller.actor_id, "personal", null).class_restrictions),
    project: structuredClone(sources.preferences.prefsFor(caller.actor_id, "project", caller.project_id).class_restrictions),
  };
  return { class_restrictions, pinned: [], consumer: caller.consumer, usage: { title: useTitle(caller, request.used_for), ...(caller.work ? { work_id: caller.work.work_id } : {}) },
    current_scene,
    scopes: places.map(where => ({ scope: where.scope === "personal" ? "user" : where.scope, owner: where.owner })),
    task: automatic, skip: !automatic, budget_tokens: options.budgetTokens ?? 800,
    budget_chars: Math.max(100, Math.min(4000, request.budget_chars ?? 3000)),
    ...(Object.keys(facts).length ? { facts } : {}), receipt_id: `recall-${sources.newId()}`, omitted: [] };
}
