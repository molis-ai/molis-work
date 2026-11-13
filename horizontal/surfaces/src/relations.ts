import { CONTEXT_RELATION_TYPES, type ContextRelationType } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { SurfaceItem } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { subjectKey, type SurfaceRelation } from "./ports.js";

/** Group only the candidates proven readable in this call, in the order supplied by the position. */
export function mergeRelated(items: readonly SurfaceItem[], relations: readonly SurfaceRelation[], attention: ReadonlySet<string>) {
  const byKey = new Map(items.map(item => [subjectKey(item.subject), item]));
  const links = new Map<string, Array<{ key: string; type: ContextRelationType }>>();
  const derived = new Set<string>();
  const add = (key: string, other: string, type: ContextRelationType) => {
    const existing = links.get(key);
    if (existing) existing.push({ key: other, type });
    else links.set(key, [{ key: other, type }]);
  };
  const used = relations.filter(relation => {
    const child = subjectKey(relation.derived), origin = subjectKey(relation.origin);
    if (child === origin || !byKey.has(child) || !byKey.has(origin)) return false;
    if (relation.type !== CONTEXT_RELATION_TYPES.copied_from && relation.type !== CONTEXT_RELATION_TYPES.derived_from) return false;
    derived.add(child);
    add(child, origin, relation.type);
    add(origin, child, relation.type);
    return true;
  });

  // Away from Attention, start with origins. A cycle still has a deterministic representative in position order.
  const keys = [...byKey.keys()];
  const roots = [...keys.filter(key => attention.has(key)),
    ...keys.filter(key => !attention.has(key) && !derived.has(key)), ...keys.filter(key => !attention.has(key) && derived.has(key))];
  const seen = new Set<string>();
  const representatives = new Map<string, SurfaceItem>();
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    const merged: NonNullable<SurfaceItem["merged"]> = [];
    const visit = [root];
    for (const current of visit) for (const link of links.get(current) ?? []) {
      if (seen.has(link.key)) continue;
      seen.add(link.key);
      visit.push(link.key);
      const item = byKey.get(link.key)!;
      merged.push({ subject: item.subject, owner_plugin_id: item.owner_plugin_id, relation: link.type });
    }
    const item = byKey.get(root)!;
    representatives.set(root, merged.length ? { ...item, merged } : item);
  }
  return { representatives, used };
}
