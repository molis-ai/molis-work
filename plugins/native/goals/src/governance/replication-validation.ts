import type { ProjectReplicaRow, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ProjectDecisionHistory } from '@molis-ai/molis-work-contracts/services/project-approvals';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const errors = defineErrorCodes('goals', { replica_governance_invalid: 'invalid' });

export function validateGovernanceReplication(rows: ProjectReplicaRows): void {
  const proposals = new Map(rows.goal_tree_proposals!.map(row => [row.proposal_id, row]));
  const items = new Map(rows.goal_tree_proposal_items!.map(row => [row.item_id, row]));
  for (const row of rows.goal_tree_proposals!) if (row.supersedes_proposal_id && !proposals.has(row.supersedes_proposal_id)) invalid();
  for (const row of rows.goal_tree_proposal_items!) {
    if (!proposals.has(row.proposal_id) || (row.revision_proposal_id && !proposals.has(row.revision_proposal_id))) invalid();
  }
  const byItem = new Map<ProjectReplicaRow[string], ProjectReplicaRow[]>();
  for (const row of rows.goal_tree_item_effects!) {
    if (!proposals.has(row.proposal_id) || items.get(row.item_id)?.proposal_id !== row.proposal_id) invalid();
    const group = byItem.get(row.item_id) ?? [];
    if (group.some(other => other.result !== 'conflict' && row.result !== 'conflict')) invalid();
    group.push(row); byItem.set(row.item_id, group);
    if (typeof row.approval_id !== 'string' || !row.approval_id || !['confirmed','rejected','revised','conflict'].includes(String(row.result))) invalid();
  }
  for (const [id, history] of byItem) {
    const item = items.get(id)!;
    const settled = history.find(row => row.result !== 'conflict');
    // A conflict can later be rechecked to pending or superseded. A final effect's object result and revision stay unchanged.
    if (!settled) {
      if (!['pending', 'conflict', 'superseded'].includes(String(item.state)) || item.revision_proposal_id !== null
        || item.materialized_objects_json !== '[]') invalid();
      continue;
    }
    const expected = { confirmed: 'applied', rejected: 'rejected', revised: 'superseded' } as const;
    if (item.state !== expected[settled.result as keyof typeof expected]
      || item.materialized_objects_json !== settled.materialized_objects_json || item.revision_proposal_id !== settled.revision_proposal_id) invalid();
  }
}

/** The Host supplies history from the platform owner, never from the incoming Goals snapshot. */
export function verifyTreeItemDecisionHistory(rows: ProjectReplicaRows, transferred: readonly ProjectDecisionHistory[], waiting: () => never): void {
  const effects = new Set(rows.goal_tree_item_effects!.map(row => row.item_id));
  const proposals = new Set(rows.goal_tree_proposals!.map(row => row.proposal_id));
  const superseded = new Set(rows.goal_tree_proposals!.map(row => row.supersedes_proposal_id).filter(Boolean));
  const key = (proposal: ProjectReplicaRow[string], item: ProjectReplicaRow[string]) => JSON.stringify([proposal, item]);
  const existing = new Set(rows.goal_tree_proposal_items!.map(item => key(item.proposal_id!, item.item_id!)));
  const history = new Map<string, ProjectDecisionHistory["original"]>();
  for (const { original } of transferred) {
    if (!["confirmed", "rejected", "revised"].includes(String(original.decision))) continue;
    const id = key(original.proposal_id!, original.item_id!);
    if (history.has(id) || (proposals.has(original.proposal_id) && !existing.has(id))) invalid();
    history.set(id, original);
  }
  for (const item of rows.goal_tree_proposal_items!) {
    const original = history.get(key(item.proposal_id!, item.item_id!));
    if (effects.has(item.item_id!)) {
      if (original) invalid();
      continue;
    }
    const objects = JSON.parse(String(item.materialized_objects_json));
    if (!Array.isArray(objects)) invalid();
    const needsDecision = item.state === "applied" || item.state === "rejected" || item.state === "approved"
      || item.revision_proposal_id !== null || objects.length > 0
      || (item.state === "superseded" && !superseded.has(item.proposal_id));
    if (!original && needsDecision) waiting();
    if (!original) continue;
    const state = original.decision === "confirmed" ? "applied" : original.decision === "rejected" ? "rejected" : "superseded";
    if (item.state !== state || item.revision_proposal_id !== original.revision_proposal_id
      || item.materialized_objects_json !== original.materialized_objects_json) invalid();
  }
}
function invalid(): never { throw errors.replica_governance_invalid('同步提案或决定的出处无效'); }
