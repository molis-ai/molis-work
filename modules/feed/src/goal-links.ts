import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";

/** A local Project partition is not a Team. Host/API authentication remains outside this owner. */
function access(projectId: string): ContextAccess {
  return { actor_id: "module:feed", scope: { kind: "personal", id: projectId } };
}

function ref(projectId: string, module: "feed" | "goals", id: string): ObjectRef {
  return { module, id, version: null, scope: access(projectId).scope };
}

export class FeedGoalLinks {
  constructor(private readonly ledger: ContextLedgerApi) {}

  get(projectId: string, itemId: string): string | null {
    return this.ledger.query.get(access(projectId), this.key(itemId))?.target.id ?? null;
  }

  list(projectId: string): Map<string, string> {
    return new Map(this.ledger.query.list(access(projectId), { type: "feed.goal" })
      .map((edge) => [edge.source.id, edge.target.id]));
  }

  find(projectId: string, goalId: string): string[] {
    return this.ledger.query.list(access(projectId), {
      type: "feed.goal", target: ref(projectId, "goals", goalId),
    }).map((edge) => edge.source.id);
  }

  set(projectId: string, itemId: string, goalId: string, at: string, migration = false): void {
    this.ledger.commands.put(access(projectId), {
      key: this.key(itemId), type: "feed.goal", source: ref(projectId, "feed", itemId),
      target: ref(projectId, "goals", goalId), cause: migration ? "feed.legacy_goal_link" : "feed.link_goal", recorded_at: at,
    });
  }

  remove(projectId: string, itemId: string): void {
    this.ledger.commands.remove(access(projectId), this.key(itemId), "feed.item_deleted");
  }

  private key(itemId: string): string { return `feed.goal:${itemId}`; }
}
