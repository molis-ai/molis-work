import type { ContextMaterializationApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";

interface LinkedFeedItem {
  item_id: string;
  revision: number;
  updated_at: string;
}

/** Product selection stays here; Ledger locates references and owner Query supplies content. */
export function readLinkedFeedContext<T extends LinkedFeedItem>(input: {
  project_id: string;
  goal_id: string;
  item_id?: string;
  materializer: ContextMaterializationApi;
  readGoal(): { goal_id: string; board_id: string; current_contract_revision: number };
  readItem(itemId: string): T | null;
  renderItem(item: T): string;
}): { source_context: string } | null {
  const scope = { kind: "personal" as const, id: input.project_id };
  const root: ObjectRef = { module: "goals", id: input.goal_id, version: null, scope };
  type Value = { kind: "goal" } | { kind: "feed"; item: T };
  const result = input.materializer.rebuild<Value>({ actor_id: "plugin:feed", scope }, {
    roots: [root], direction: "incoming", relation_types: ["feed.goal"], max_depth: 1,
    max_nodes: Number.MAX_SAFE_INTEGER,
  }, (ref) => {
    if (ref.module === "goals") {
      const goal = input.readGoal();
      return { state: "resolved", ref: { ...root, id: goal.goal_id, version: goal.current_contract_revision,
        scope: { ...scope, id: goal.board_id } }, value: { kind: "goal" } };
    }
    if (ref.module !== "feed") return { state: "unavailable" };
    if (input.item_id && ref.id !== input.item_id) return { state: "unavailable" };
    const item = input.readItem(ref.id);
    return item ? { state: "resolved", ref: { ...ref, id: item.item_id, version: item.revision },
      value: { kind: "feed", item } } : { state: "missing" };
  });
  const items = result.nodes.flatMap((node) => node.state === "resolved" && node.value.kind === "feed"
    ? [node.value.item] : []);
  // Preserve the former Feed Query's SQLite updated_at DESC / item_id ASC ordering.
  items.sort((a, b) => a.updated_at === b.updated_at
    ? (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0)
    : (a.updated_at > b.updated_at ? -1 : 1));
  return items[0] ? { source_context: input.renderItem(items[0]) } : null;
}
