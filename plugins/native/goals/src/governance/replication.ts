import type { ProjectReplicaDefinition } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { validateGovernanceReplication } from './replication-validation.js';

/** Explicit portable owner fields. No sessions, executing work or private credentials. */
export function governanceReplicationDefinition(): ProjectReplicaDefinition {
  return {
    id: 'governance',
    assetKind:'project_goals',
    tables: [
      {"name":"goal_tree_proposals","columns":["proposal_id","root_goal_id","submitted_by","submitted_session_id","state","version","supersedes_proposal_id","base_event_cursor","summary","narrative_json","decision_json","created_at","updated_at","decided_at"],"keys":["proposal_id"]},
      {"name":"goal_tree_proposal_items","columns":["item_id","proposal_id","ordinal","kind","operation","payload_json","source_refs_json","reason","explanation_json","confidence","affected_objects_json","baseline_versions_json","requires_user_confirmation","state","conflict_json","materialized_objects_json","revision_proposal_id","supersedes_item_id","created_at","updated_at"],"keys":["item_id"]},
      {"name":"goal_tree_item_effects","columns":["effect_id","proposal_id","item_id","approval_id","result","runtime_actor_id","reason","revision_proposal_id","materialized_objects_json","created_at"],"keys":["effect_id"]},
    ],
    journalTypes: ["goal_tree_proposal.%"],
    receiptOperations: ["submit_goal_tree_proposal","check_goal_tree_proposal","decide_goal_tree_proposal"],
    sequenceFields: ["base_event_cursor","observed_event_cursor","event_cursor"],
    validate: validateGovernanceReplication,
  };
}
