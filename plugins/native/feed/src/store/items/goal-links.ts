import type { ContextScope, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { FeedLedgerPort } from "./types.js";
import { FEED_PLUGIN_ID } from "../../identity.js";

/** A local Project partition is not a Team. Host/API authentication remains outside this owner. */
function scope(projectId: string): ContextScope {
  return { kind: "personal", id: projectId };
}

/** The plugin whose Goals an item is linked to (`feed.goal`), through its public contract. */
const GOALS_OWNER = "io.molis.work.goals";

/** One of Feed's items, or a Goal it is linked to: each an object of the plugin that owns it (batch 44 C6). */
function ref(projectId: string, kind: "feed_item" | "goal", id: string): ObjectRef {
  return { module: "plugins", plugin_id: kind === "feed_item" ? FEED_PLUGIN_ID : GOALS_OWNER, object_type: kind, id, version: null, scope: scope(projectId) };
}

export class FeedGoalLinks {
  constructor(private readonly ledger: FeedLedgerPort) {}

  get(projectId: string, itemId: string): string | null {
    return this.ledger.get(projectId, this.key(itemId))?.target.id ?? null;
  }

  list(projectId: string, itemIds?: readonly string[]): Map<string, string> {
    return new Map(this.ledger.list(projectId, { type: "feed.goal", ...(itemIds ? { keys: itemIds.map(id => this.key(id)) } : {}) })
      .map((edge) => [edge.source.id, edge.target.id]));
  }

  find(projectId: string, goalId: string): string[] {
    return this.ledger.list(projectId, {
      type: "feed.goal", target: ref(projectId, "goal", goalId),
    }).map((edge) => edge.source.id);
  }

  set(projectId: string, itemId: string, goalId: string, at: string): void {
    this.ledger.put(projectId, {
      key: this.key(itemId), type: "feed.goal", source: ref(projectId, "feed_item", itemId),
      target: ref(projectId, "goal", goalId), cause: "feed.link_goal", recorded_at: at,
    });
  }

  remove(projectId: string, itemId: string): void {
    this.ledger.remove(projectId, this.key(itemId), "feed.item_deleted");
  }

  private key(itemId: string): string { return `feed.goal:${itemId}`; }
}
