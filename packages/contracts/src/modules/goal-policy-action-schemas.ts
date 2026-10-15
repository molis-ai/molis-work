import { goalRelationTypes } from "./goals.js";
import { text, identifier, boolean, object, enumeration, nullable } from "./goal-event-action-schemas.js";

const policyFields = { human_approval: boolean };
export const goalPolicySchema = object(policyFields);
export const goalPolicyBindingSchema = object({ policy_binding_id: text, goal_id: nullable(text), scope: enumeration(["project_default", "ancestor_minimum", "goal"]),
  policy: object(policyFields, []), state: enumeration(["active", "replaced", "withdrawn"]), created_by: text, reason: text, created_at: text });
export const goalRelationEndpoints = { from_goal_id: identifier, to_goal_id: identifier, type: { ...enumeration(goalRelationTypes),
  description: "part_of：子目标到父目标；depends_on：消费目标到前置目标。其他类型同样按 from → to 保存，不能颠倒。" } };
export const goalRelationSchema = object({ relation_id: text, project_id: text, ...goalRelationEndpoints, state: enumeration(["proposed", "active", "inactive"]),
  reason: text, created_by: text, created_at: text, deactivated_at: nullable(text) });
