import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { text, count, array, object, nullable, enumeration } from "./goal-event-action-schemas.js";
import { goalRecordSchema, goalDecompositionReviewSchema } from "./goal-record-action-schema.js";
import { goalPolicySchema, goalRelationSchema } from "./goal-policy-action-schemas.js";
import { treeProposalSchema } from "./goal-tree-action-schemas.js";

const maybeText = nullable(text);
const board = object({ project_id: text, active_goal_id: maybeText, created_at: text, updated_at: text });
const proposals = { goal_tree_proposals: array(treeProposalSchema) };
export const boardSnapshotSchema = object({ cursor: count, board, goals: array(goalRecordSchema), relations: array(goalRelationSchema), ...proposals });
const coverage = (goalDecompositionReviewSchema.properties as Record<string, ActionSchema>).contract_coverage!;
export const goalContractSchema = object({ board, observed_event_cursor: count, goal_path: text, goal: goalRecordSchema,
  parent_contract_coverage: array(object({ parent_goal_id: text, parent_goal_title: text, record_status: enumeration(["recorded", "unrecorded"]),
    ...coverage.properties as Record<string, ActionSchema> })), relations: array(goalRelationSchema),
  resolved_policy: goalPolicySchema, ...proposals });
