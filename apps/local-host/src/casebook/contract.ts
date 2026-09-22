/** MolisWork-owned interaction facts. No business text or arbitrary payload crosses this boundary. */
import type { ProjectRecoveryDetails } from '../project-recovery-details.js';
export const CONTRACT = 'goalboard.casebook.interaction-facts';
export const VERSION = '2.0.0';
export const PURPOSE = 'casebook.interaction-review.v1';
export const CONTEXT_PURPOSE = 'casebook.goal-context.v1';
export const RECEIPTS_PURPOSE = 'casebook.operation-receipts.v1';
export class CasebookError extends Error {
  constructor(readonly code: string, readonly details?: ProjectRecoveryDetails) { super(code); }
}
export type AuthorizationAction = 'join' | 'pause' | 'resume' | 'remove';
export interface AuthorizationRequest {
  project_ref: string; action: AuthorizationAction; purpose: typeof PURPOSE | typeof CONTEXT_PURPOSE | typeof RECEIPTS_PURPOSE;
  include_goal_context?: true; actor_ref: string; user_action_ref: string; user_confirmed: true; idempotency_key: string;
}
export interface ReadRequest {
  project_ref: string; schema_version: typeof VERSION; authorization_epoch: string;
  after_cursor: number; limit: number;
}
export interface Condition {
  goal_ref: string | null; contract_revision: number | null; action_condition: string | null;
  progress: string | null; display_status: string | null;
}
export interface Selection {
  event_refs:string[]; requirement_refs:string[]; expected_config_version:number|null; expected_agreement_version:number|null;
  goal_ref: string | null; proposal_ref: string | null; obligation_ref: string | null;
  evidence_refs: string[] | null; action_ref: string | null; action_condition: string | null;
  contract_revision: number | null; content_comparison: string;
}
export interface Offered extends Condition {
  action_ref: string | null; action_kind: string | null; status: string | null;
  requires_parent_confirmation: boolean | null; reason_codes: string[];
}
export interface Saved {
  event_refs:string[];
  review_ref: string | null; evidence_refs: string[] | null;
  goal_ref: string | null; proposal_ref: string | null; state: string | null;
}
export interface ResultReason {
  code:string;
  recovery:{next_action:string|null;requires_user_confirmation:boolean|null;retry_same_idempotency_key:boolean|null}|null;
}
export interface EventState {
 work_status:'open'|'completed'|'cancelled'; config_version:number; agreement_version:number; goal_event_cursor:number;
 can_record:boolean; completion_effect:boolean; requirement_refs:string[]; unmet_requirement_refs:string[];
 pending_decision_refs:string[]; blocking_concern_refs:string[]; refs_truncated:boolean;
}
export interface Fact {
 channel:'local-host.capability.v1'|'web.goal-events.v1'; event_state:EventState|null;
  fact_id: string; seq: number; occurred_at: string; operation_id: string;
  kind: 'attempt' | 'result' | 'correction'; capability: string; capability_version: number;
  request_key: string | null; selection: Selection; condition: Condition;
  accepted: boolean | null; projection_version: '2.0.0';
  related_states: { object_ref: string; object_type: 'run' | 'claim'; state: string | null }[];
  related_states_truncated: boolean;
  outcome: 'pending' | 'returned' | 'threw'; reason_code: string | null; result_reasons: ResultReason[];
  replayed: boolean | null; saved: Saved | null; offered: Offered[];
  offered_truncated: boolean; source_digest: string; corrects_fact_id: string | null;
}
export interface Envelope {
  contract_id: typeof CONTRACT; schema_version: typeof VERSION; project_ref: string;
  authorization_epoch: string; exported_at: string; stream_id: string;
  cursor: { after_exclusive: number; to_inclusive: number; has_more: boolean };
  coverage: { recording_since: string; retained_from_seq: number; channels: string[];
    missing: string[]; unpersisted_failures: number; incomplete_operations: number;
    paused_windows: number; historical_backfill: false; external_outcome: 'unknown' };
  facts: Fact[];
}
export function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CasebookError('invalid_request');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new CasebookError('unknown_field');
}
export function requiredText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new CasebookError('invalid_request');
}

export interface ContextRequest {
  project_ref:string; schema_version:typeof VERSION; authorization_epoch:string;
  context_authorization_epoch:string; operation_ids:string[];
}
export interface GoalContext {
  context_id:string; operation_id:string; phase:'before'|'after'; captured_at:string;
  goal_ref:string; goal_id:string; goal_title:string; title_truncated:boolean; contract_revision:number;
  source_digest:string;
}
export interface ContextEnvelope {
  contract_id:'goalboard.casebook.goal-context'; schema_version:typeof VERSION; project_ref:string;
  authorization_epoch:string; context_authorization_epoch:string; contexts:GoalContext[];
  missing_operation_ids:string[];
}
