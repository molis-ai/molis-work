import type { ProjectReplicaDefinition } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { validateGoalReplication } from './replication-validation.js';

/** Explicit portable owner fields. No sessions, executing work or private credentials. */
export function goalReplicationDefinition(): ProjectReplicaDefinition {
  return {
    id: 'goals',
    tables: [
      {"name":"boards","columns":["project_id","title","active_goal_id","created_at","updated_at"],"keys":["project_id"],"keepRoot":true,"journalCondition":"EXISTS (SELECT 1 FROM goals WHERE project_id=$row.project_id) OR EXISTS (SELECT 1 FROM project_guidance_entries WHERE project_id=$row.project_id)"},
      {"name":"goals","columns":["goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at"],"keys":["goal_id"]},
      {"name":"acceptance_criteria","columns":["criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json"],"keys":["criterion_id"],"where":"goal_id IN (SELECT goal_id FROM goals WHERE project_id=?)","projectExpression":"(SELECT project_id FROM goals WHERE goal_id=$row.goal_id)"},
      {"name":"goal_relations","columns":["relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at"],"keys":["relation_id"]},
      {"name":"goal_trash_records","columns":["trash_record_id","project_id","goal_id","trashed_at","trashed_by","trash_reason","restored_at","restored_by","restore_reason"],"keys":["trash_record_id"]},
      {"name":"goal_trash_relation_records","columns":["trash_record_id","relation_id","prior_state","deactivated_at","restored_at"],"keys":["trash_record_id","relation_id"],"where":"trash_record_id IN (SELECT trash_record_id FROM goal_trash_records WHERE project_id=?)","projectExpression":"(SELECT project_id FROM goal_trash_records WHERE trash_record_id=$row.trash_record_id)"},
      {"name":"policy_bindings","columns":["policy_binding_id","project_id","goal_id","scope","policy_json","state","created_by","reason","created_at"],"keys":["policy_binding_id"]},
      {"name":"project_guidance_entries","columns":["guidance_id","project_id","position","revision","active","kind","content","content_hash","source_refs_json","created_by","confirmation_summary","reason","created_at","updated_by","updated_at"],"keys":["guidance_id"]},
      {"name":"project_guidance_revisions","columns":["revision_id","guidance_id","project_id","revision","kind","content","content_hash","source_refs_json","active","changed_by","change_kind","confirmation_summary","reason","created_at"],"keys":["revision_id"]},
      {"name":"planning_method_packs","columns":["project_id","method_id","version","enabled","pack_json","created_at","updated_at"],"keys":["project_id","method_id"]},
      {"name":"goal_event_configs","columns":["project_id","goal_id","current_version","updated_at","updated_by"],"keys":["project_id","goal_id"]},
      {"name":"goal_event_config_versions","columns":["project_id","goal_id","version","actor_id","adopted_planning_json","created_at","config_event_id"],"keys":["project_id","goal_id","version"]},
      {"name":"goal_event_types","columns":["project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id"],"keys":["project_id","goal_id","type_id","type_version"]},
      {"name":"goal_event_requirements","columns":["requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq"],"keys":["requirement_id"]},
      {"name":"goal_event_requirement_bindings","columns":["project_id","goal_id","type_id","requirement_id","created_in_config_version","created_at"],"keys":["project_id","goal_id","type_id","requirement_id"]},
      {"name":"goal_work_events","columns":["event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version"],"keys":["event_id"]},
      {"name":"goal_work_event_judgments","columns":["event_id","requirement_id","verdict"],"keys":["event_id","requirement_id"],"where":"event_id IN (SELECT event_id FROM goal_work_events WHERE project_id=?)","projectExpression":"(SELECT project_id FROM goal_work_events WHERE event_id=$row.event_id)"},
      {"name":"goal_event_state_owners","columns":["project_id","goal_id","owner","source","adopted_at","adopted_by"],"keys":["goal_id"]},
      {"name":"goal_event_agreements","columns":["project_id","goal_id","version","outcome","actor_id","created_at","event_id"],"keys":["project_id","goal_id","version"]},
      {"name":"goal_event_progress_summaries","columns":["summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at"],"keys":["summary_id"]},
      {"name":"goal_event_concerns","columns":["concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at"],"keys":["concern_id"]},
      {"name":"goal_event_decision_requests","columns":["request_id","project_id","goal_id","event_id","question","options_json","scope_json","purpose","proposed_change_json","commitment_json","status","created_at"],"keys":["request_id"]},
      {"name":"goal_event_applied_decisions","columns":["decision_id","project_id","goal_id","governance_decision_id","request_id","event_id","selected_option_id","conclusion","accepts_requirements","effects_json","scope_json","commitment_json","authorized_change_json","config_version","agreement_version","actor_id","authority_source","recorded_at"],"keys":["decision_id"]},
      {"name":"goal_event_requirement_conclusions","columns":["project_id","goal_id","requirement_id","decision_id","actor_id","verdict","received_at","journal_seq"],"keys":["project_id","goal_id","requirement_id","decision_id"]},
      {"name":"goal_event_closures","columns":["closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at"],"keys":["closure_id"]},
      {"name":"goal_event_work_status","columns":["project_id","goal_id","work_status","updated_at"],"keys":["goal_id"]},
      {"name":"input_bindings","columns":["binding_id","project_id","goal_id","input_name","source_type","source_ref","source_edge_key","snapshot_digest","state","reason","created_by","created_at"],"keys":["binding_id"]},
    ],
    journalTypes: ["board.%","goal.%","relation.%","policy.%","planning.%","project.guidance_%"],
    receiptOperations: ["initialize_board","set_active_goal","create_goal","create_goal_intent","add_relation","deactivate_relation","add_project_guidance","update_project_guidance","save_project_policy","set_goal_archived","set_goal_trashed","configure_goal_events_request","configure_goal_events","report_goal_events","record_goal_progress","record_goal_note","apply_goal_concern","request_goal_decision","cite_goal_decision","record_goal_user_decision","submit_goal_event_closure","resume_goal_event_work","set_goal_event_agreement"],
    sequenceFields: ["journal_seq","based_on_cursor","support_valid_after_seq","observed_event_cursor","goal_event_cursor","event_list_next_cursor","event_cursor","next_cursor"],
    validate: validateGoalReplication,
  };
}
