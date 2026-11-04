import type { GoalTreeProposalItemRecord } from "./contract/governance-collaboration.js";

/** New Goals first, then relations that may point at them. Ordering never grants approval. */
export function goalTreeMaterializationGroups(
  items: readonly GoalTreeProposalItemRecord[],
): GoalTreeProposalItemRecord[][] {
  const goals: GoalTreeProposalItemRecord[] = [];
  const relations: GoalTreeProposalItemRecord[] = [];
  for (const item of items) {
    if (item.kind === "goal") goals.push(item);
    else relations.push(item);
  }
  return [goals, relations];
}
