import type { ContextScope, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { GOALS_PLUGIN_ID } from "./identity.js";

/** The plugin whose items a Goal's confirmed inputs come from (`goal.input` edges), through its public contract. */
export const FEED_ITEMS_PLUGIN_ID = "io.molis.work.feed";

/** A Goal in the project's ledger: an object of this plugin, of kind `goal` (batch 44 C6: the ledger names no plugin of its own). */
export function goalRef(goalId: string, scope: ContextScope): ObjectRef {
  return { module: "plugins", plugin_id: GOALS_PLUGIN_ID, object_type: "goal", id: goalId, version: null, scope };
}

/** A Feed item a Goal takes as an input. */
export function feedItemRef(itemId: string, scope: ContextScope): ObjectRef {
  return { module: "plugins", plugin_id: FEED_ITEMS_PLUGIN_ID, object_type: "feed_item", id: itemId, version: null, scope };
}

/** Whether a ledger reference is one of this plugin's Goals (`goalId`, when given). */
export function isGoalRef(ref: Pick<ObjectRef, "module" | "plugin_id" | "object_type" | "id">, goalId?: string): boolean {
  return ref.module === "plugins" && ref.plugin_id === GOALS_PLUGIN_ID && ref.object_type === "goal" && (goalId === undefined || ref.id === goalId);
}

/** Whether a ledger reference is a Feed item. */
export function isFeedItemRef(ref: Pick<ObjectRef, "module" | "plugin_id" | "object_type">): boolean {
  return ref.module === "plugins" && ref.plugin_id === FEED_ITEMS_PLUGIN_ID && ref.object_type === "feed_item";
}
