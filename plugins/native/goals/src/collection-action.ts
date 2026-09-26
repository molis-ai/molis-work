import type { ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalAction } from "./action-contract.js";
import { text, count, boolean, array, object, nullable, enumeration } from "./event-action-schemas.js";
import { boardSnapshotSchema } from "./snapshot-action-schemas.js";
import { goalPolicySchema, goalPolicyBindingSchema } from "./configuration-actions.js";
import { goalRiskSchema, goalRecordSchema } from "./goal-record-schema.js";
import { GOALS_PRESENTATION_STATES } from "./document-view.js";
import { buildGoalsDocumentCollection, type GoalsDocumentCollectionView } from "./document-collection.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";

const snapshot = boardSnapshotSchema.properties as Record<string, ActionSchema>;
const coverage = array(object({ requirement_id: text, statement: text, disposition: text, owner_goal_id: nullable(text),
  reason: nullable(text), revisit_condition: nullable(text), blocking: boolean, created_at: text, updated_at: text }));
const inputs = array(object({ binding_id: text, goal_id: text, input_name: text, source_type: text, source_ref: text,
  snapshot_digest: nullable(text), state: enumeration(["proposed", "confirmed", "inactive"]), reason: text, created_by: text, created_at: text }));
const policies = array(goalPolicyBindingSchema);
// Journal payload is unknown in its original contract and must retain JSON primitives as well as objects.
const events = array(object({ seq: count, event_id: text, actor_id: text, type: text, object_type: text, object_id: text,
  reason: text, payload: {}, at: text }));
const itemFields = { goal: goalRecordSchema, status: enumeration(GOALS_PRESENTATION_STATES),
  display_status: enumeration(["continue", "in_progress", "blocked", "waiting_user", "waiting", "completed"]),
  status_label: text, main_action_label: text, action_summary: text, event_work: boolean,
  claims: snapshot.claims!, runs: snapshot.runs!, evidence: snapshot.evidence!, review_obligations: snapshot.review_obligations!,
  reviews: snapshot.reviews!, risks: array(object({ ...goalRiskSchema.properties as Record<string, ActionSchema>, goal_ids: array(text) })),
  impacts: snapshot.impacts!, relations: snapshot.relations!, coverage, input_bindings: inputs, policy_bindings: policies,
  events, resolved_policy: goalPolicySchema, passed_criteria: array(text), pending_reviews: array(text), created_by: nullable(text) };
const items = array(object(itemFields, Object.keys(itemFields).filter(key => key !== "created_by")));
export const goalsCollectionAction = goalAction<Record<string, never>, GoalsDocumentCollectionView>(
  "goals.collection.read", "读取完整目标集合", "读取当前、归档和回收站目标的完整集合、历史资料、覆盖及绑定。包含原状态说明，不生成 HTML 或修改目标", "query", object({}),
  object({ snapshot: boardSnapshotSchema, active_goal_id: nullable(text), goals: items, archived_goals: items, trashed_goals: items,
    counts: object(Object.fromEntries(GOALS_PRESENTATION_STATES.map(status => [status, count]))), coverage, input_bindings: inputs,
    policy_bindings: policies, events }));
export function createGoalsCollectionActionHandler(boardId: string, ports: GoalsDocumentReadPorts): ActionHandlerBinding {
  return { ...goalsCollectionAction, handle: () => buildGoalsDocumentCollection(ports, boardId) };
}
