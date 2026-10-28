import type { ContextScope, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { FeedLedgerPort } from "./types.js";

/** A local Project partition is not a Team. Host/API authentication remains outside this owner. */
function scope(projectId: string): ContextScope {
  return { kind: "personal", id: projectId };
}

function ref(projectId: string, module: "feed" | "goals", id: string): ObjectRef {
  return { module, id, version: null, scope: scope(projectId) };
}

export class FeedGoalLinks {
  constructor(private readonly ledger: FeedLedgerPort) {}

  get(projectId: string, itemId: string): string | null {
    return this.ledger.get(projectId, this.key(itemId))?.target.id ?? null;
  }

  list(projectId: string): Map<string, string> {
    return new Map(this.ledger.list(projectId, { type: "feed.goal" })
      .map((edge) => [edge.source.id, edge.target.id]));
  }

  find(projectId: string, goalId: string): string[] {
    return this.ledger.list(projectId, {
      type: "feed.goal", target: ref(projectId, "goals", goalId),
    }).map((edge) => edge.source.id);
  }

  set(projectId: string, itemId: string, goalId: string, at: string): void {
    this.ledger.put(projectId, {
      key: this.key(itemId), type: "feed.goal", source: ref(projectId, "feed", itemId),
      target: ref(projectId, "goals", goalId), cause: "feed.link_goal", recorded_at: at,
    });
  }

  remove(projectId: string, itemId: string): void {
    this.ledger.remove(projectId, this.key(itemId), "feed.item_deleted");
  }

  private key(itemId: string): string { return `feed.goal:${itemId}`; }
}
