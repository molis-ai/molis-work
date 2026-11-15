import { text, object, array, enumeration } from "./goal-event-action-schemas.js";

const strings = array(text);
export const planningGraphIssueSchema = object({ code: enumeration(["goals.planning.goal_missing", "goals.planning.goal_trashed", "goals.planning.relation_self_reference",
  "goals.planning.relation_duplicate", "goals.planning.part_of_cycle", "goals.planning.dependency_cycle", "goals.planning.execution_cycle"]),
  message: text, goal_ids: strings, relation_ids: strings, path: strings });
export const planningImpactSchema = object({ changed_goal_ids: strings, affected_ancestors: strings, affected_dependents: strings,
  adjacent_dependencies: strings, reusable_open_goal_ids: strings, review_order: strings, graph_issues: array(planningGraphIssueSchema) });
