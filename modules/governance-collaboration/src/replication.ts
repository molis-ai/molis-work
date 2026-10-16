import type { ProjectReplicaDefinition } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { validateGovernanceReplication } from './replication-validation.js';

/** Explicit portable owner fields. No sessions, executing work or private credentials. */
export function governanceReplicationDefinition(): ProjectReplicaDefinition {
  return {
    id: 'governance',
    tables: [
      {"name":"goal_tree_proposals","columns":["proposal_id","project_id","root_goal_id","submitted_by","submitted_session_id","state","version","supersedes_proposal_id","base_event_cursor","summary","narrative_json","decision_json","created_at","updated_at","decided_at"],"keys":["proposal_id"]},
      {"name":"goal_tree_proposal_items","columns":["item_id","proposal_id","project_id","ordinal","kind","operation","payload_json","source_refs_json","reason","explanation_json","confidence","affected_objects_json","baseline_versions_json","requires_user_confirmation","state","conflict_json","materialized_objects_json","revision_proposal_id","supersedes_item_id","created_at","updated_at"],"keys":["item_id"]},
      {"name":"goal_tree_proposal_decisions","columns":["decision_id","project_id","proposal_id","item_id","decision","actor_id","authority_source","runtime_actor_id","conversation_ref","message_ref","reason","revision_proposal_id","materialized_objects_json","created_at"],"keys":["decision_id"]},
      {"name":"goal_event_trusted_decisions","columns":["decision_id","project_id","goal_id","actor_id","actor_kind","authority_source","conversation_ref","message_ref","request_id","selected_option_id","conclusion","accepts_requirements","scope_json","change_json","recorded_at"],"keys":["decision_id"]},
    ],
    journalTypes: ["goal_tree_proposal.%"],
    receiptOperations: ["submit_goal_tree_proposal","check_goal_tree_proposal","decide_goal_tree_proposal"],
    sequenceFields: ["base_event_cursor","observed_event_cursor","event_cursor"],
    validate: validateGovernanceReplication,
  };
}
