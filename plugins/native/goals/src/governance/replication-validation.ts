import type { ProjectReplicaRow, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
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
function invalid(): never { throw errors.replica_governance_invalid('同步提案或决定的出处无效'); }
