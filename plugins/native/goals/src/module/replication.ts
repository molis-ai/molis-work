import type { ProjectReplicaDefinition } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { validateGoalReplication } from './replication-validation.js';

/** Explicit portable owner fields. No sessions, executing work or private credentials. */
export function goalReplicationDefinition(): ProjectReplicaDefinition {
  return {
    id: 'goals',
    assetKind:'project_goals',
    tables: [
      {"name":"boards","columns":["id","active_goal_id","created_at","updated_at"],"keys":["id"],"keepRoot":true,"journalCondition":"EXISTS (SELECT 1 FROM goals)"},
      {"name":"goals","columns":["goal_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at"],"keys":["goal_id"]},
      {"name":"acceptance_criteria","columns":["criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json"],"keys":["criterion_id"]},
      {"name":"goal_relations","columns":["relation_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at"],"keys":["relation_id"]},
      {"name":"goal_trash_records","columns":["trash_record_id","goal_id","trashed_at","trashed_by","trash_reason","restored_at","restored_by","restore_reason"],"keys":["trash_record_id"]},
      {"name":"goal_trash_relation_records","columns":["trash_record_id","relation_id","prior_state","deactivated_at","restored_at"],"keys":["trash_record_id","relation_id"]},
      {"name":"goal_event_configs","columns":["goal_id","current_version","updated_at","updated_by"],"keys":["goal_id"]},
      {"name":"goal_event_config_versions","columns":["goal_id","version","actor_id","created_at","config_event_id"],"keys":["goal_id","version"]},
      {"name":"goal_event_types","columns":["goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id"],"keys":["goal_id","type_id","type_version"]},
      {"name":"goal_event_requirement_bindings","columns":["goal_id","type_id","requirement_id","created_in_config_version","created_at"],"keys":["goal_id","type_id","requirement_id"]},
      {"name":"goal_work_events","columns":["event_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version"],"keys":["event_id"]},
      {"name":"goal_requirement_links","columns":["goal_id","requirement_id","origin_json","created_in_config_version","created_at"],"keys":["goal_id","requirement_id"]},
      {"name":"goal_event_state_owners","columns":["goal_id","owner","source","adopted_at","adopted_by"],"keys":["goal_id"]},
      {"name":"goal_event_agreements","columns":["goal_id","version","outcome","actor_id","created_at","event_id"],"keys":["goal_id","version"]},
      {"name":"goal_event_progress_summaries","columns":["summary_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at"],"keys":["summary_id"]},
      {"name":"goal_event_concerns","columns":["concern_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at","cited_subjects_json"],"keys":["concern_id"]},
      {"name":"goal_event_decision_requests","columns":["request_id","goal_id","event_id","question","options_json","scope_json","purpose","proposed_change_json","commitment_json","status","created_at"],"keys":["request_id"]},
      {"name":"goal_event_applied_decisions","columns":["decision_id","goal_id","governance_decision_id","request_id","event_id","selected_option_id","conclusion","accepts_requirements","effects_json","scope_json","commitment_json","authorized_change_json","config_version","agreement_version","actor_id","authority_source","recorded_at"],"keys":["decision_id"]},
      {"name":"goal_event_closures","columns":["closure_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round"],"keys":["closure_id"]},
      {"name":"goal_event_work_status","columns":["goal_id","work_status","updated_at"],"keys":["goal_id"]},
      {"name":"input_bindings","columns":["binding_id","goal_id","input_name","source_type","source_ref","source_edge_key","snapshot_digest","state","reason","created_by","created_at"],"keys":["binding_id"]},
    ],
    journalTypes: ["board.%","goal.%","relation.%","policy.%"],
    receiptOperations: ["initialize_board","set_active_goal","create_goal","create_goal_intent","add_relation","deactivate_relation","save_project_policy","set_goal_archived","set_goal_trashed","configure_goal_events_request","configure_goal_events","report_goal_events","record_goal_progress","record_goal_note","acknowledge_goal_event","apply_goal_concern","request_goal_decision","cite_goal_decision","record_goal_user_decision","submit_goal_event_closure","resume_goal_event_work","set_goal_event_agreement"],
    sequenceFields: ["journal_seq","based_on_cursor","observed_event_cursor","goal_event_cursor","event_list_next_cursor","event_cursor","next_cursor"],
    validate: validateGoalReplication,
  };
}
