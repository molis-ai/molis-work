import type { ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const errors = defineErrorCodes('goals', { replica_governance_invalid: 'invalid' });

export function validateGovernanceReplication(rows: ProjectReplicaRows): void {
  const proposals = new Map(rows.goal_tree_proposals!.map(row => [row.proposal_id, row]));
  const items = new Map(rows.goal_tree_proposal_items!.map(row => [row.item_id, row]));
  for (const row of rows.goal_tree_proposals!) if (row.supersedes_proposal_id && !proposals.has(row.supersedes_proposal_id)) invalid();
  for (const row of rows.goal_tree_proposal_items!) {
    if (!proposals.has(row.proposal_id) || (row.revision_proposal_id && !proposals.has(row.revision_proposal_id))) invalid();
  }
  for (const row of rows.goal_tree_proposal_decisions!) {
    if (!proposals.has(row.proposal_id) || items.get(row.item_id)?.proposal_id !== row.proposal_id) invalid();
    if (!['web', 'management', 'runtime_dialogue'].includes(String(row.authority_source)) || !row.conversation_ref || !row.message_ref) invalid();
  }
  for (const row of rows.goal_event_trusted_decisions!) {
    if (row.actor_kind !== 'user' || !['web', 'management'].includes(String(row.authority_source)) || !row.conversation_ref || !row.message_ref || !row.conclusion) invalid();
  }
}
function invalid(): never { throw errors.replica_governance_invalid('同步提案或决定的出处无效'); }
