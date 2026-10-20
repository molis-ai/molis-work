/** The Studio owner selects portable facts explicitly; no sqlite_master/PRAGMA discovery or execution payloads. */
export interface StudioContentTable {name:string;columns:readonly string[];keys:readonly string[];root?:boolean}
const table=(name:string,columns:string,keys='id',root=false):StudioContentTable=>({name,columns:columns.split(' '),keys:keys.split(' '),root});
export const STUDIO_CONTENT_TABLES:readonly StudioContentTable[]=[
 table('workspaces','id name created_at','id',true),
 table('workspace_actors','id workspace_id kind name created_at','id',true),
 table('directions','id workspace_id title description source_kind source_json status created_at updated_at'),
 table('exploration_runs','id direction_id status runtime_label understanding_json error_code created_at updated_at'),
 table('ideas','id direction_id lifecycle current_version created_at updated_at'),
 table('idea_cards','id exploration_run_id direction_id status title highlight target_user scenario problem mechanism value_proposition why_it_may_work unknowns_json mvp_json discarded_at kept_at kept_idea_id created_at assumptions_json position'),
 table('idea_versions','id idea_id version parent_version actor_id reason created_at source_card_id source_exploration_run_id content_json'),
 // Only terminal observation metadata travels; restoration supplies empty inputs and no lease/checkpoint.
 table('jobs','id kind status error_code created_at updated_at'),
 table('mvp_scope_versions','id idea_id version idea_version actor_id in_scope_json out_of_scope_json platform_assumptions_json integration_assumptions_json created_at'),
 table('research_plans','id idea_id idea_version mvp_scope_version lens scope_summary model_policy model_id runtime_label estimated_min_minutes estimated_max_minutes budget_kind budget_limit budget_currency created_at applied_playbook_rule_ids_json reuse_json'),
 table('lens_runs','id plan_id idea_id idea_version mvp_scope_version lens status stage runtime_label job_id error_code created_at updated_at'),
 table('evidence','id run_id source_id source_type title url excerpt captured_at content_hash'),
 table('lens_reports','id run_id revision idea_id idea_version mvp_scope_version lens status runtime_label summary created_at'),
 table('claims','id report_id position label status conclusion rationale unknowns_json change_conditions_json'),
 table('claim_evidence','claim_id evidence_id relation','claim_id evidence_id relation'),
 table('decisions','id idea_id idea_version mvp_scope_version outcome reason market_report_id market_report_revision cost_report_id cost_report_revision actor_id created_at revisit_condition source_kind'),
 table('pulse_runs','id workspace_id status stage source_ids_json runtime_label job_id error_code created_at updated_at'),
 table('source_fetches','id run_id source_id request_url status http_status fetched_at content_hash error_code rate_limit_remaining rate_limit_reset'),
 table('supply_signals','id fetch_id source_id title url summary observed_at published_at categories_json native_metrics_json supports_json cannot_prove_json'),
 table('pulse_reports','id run_id revision status title summary period_start period_end runtime_label successful_source_ids_json failed_source_ids_json coverage_gaps_json findings_json created_at'),
 table('pulse_report_signals','report_id signal_id','report_id signal_id'),
 table('opportunities','id report_id position title highlight rationale demand_inference counter_signals_json unknowns_json status saved_at dismissed_at converted_at converted_direction_id created_at'),
 table('opportunity_signals','opportunity_id signal_id','opportunity_id signal_id'),
 table('annotations','id workspace_id actor_id target_kind object_id target_revision block_id quoted_snapshot comment status created_at resolved_at'),
 table('action_proposals','id workspace_id actor_id source_kind source_id action_kind target_json summary diff_json version_impact cost_impact memory_impact payload_json status created_at applied_at rejected_at'),
 table('taste_rules','id workspace_id actor_id version title statement applies_to exceptions_json source_kind source_id status created_at updated_at'),
 table('research_playbook_rules','id workspace_id actor_id version original_feedback method_change positive_examples_json negative_examples_json scope_kind report_id direction_id source_kind source_id status created_at updated_at'),
 table('research_playbook_revisions','rule_id version snapshot_json','rule_id version'),
 table('memory_rule_applications','id rule_id plan_id run_id applied_at rule_version method_snapshot_json'),
 table('conversation_messages','id workspace_id actor_id author body context_json response_state parent_message_id runtime_label created_at'),
 table('work_reuse_receipts','plan_id run_id actor_id snapshot_json consumed_at relation_state feedback_json','plan_id'),
 table('activity_events','id workspace_id kind target_kind target_id payload_json created_at'),
];
export type StudioContentRow=Record<string,string|number|null>;
export type StudioContentGraph=Record<string,StudioContentRow[]>;
