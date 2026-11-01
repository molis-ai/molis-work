import type { GoalsInputBinding, GoalsDocumentView } from "../document-view.js";
import type { GoalsDecisionEvent } from "../decision-view.js";
import type { GoalsPolicyBinding } from "../policy-ui-model.js";
import type { GoalPresentationState } from "../tree-order.js";
import type { BoardSnapshot } from "../contract/goals.js";

/**
 * What the Goals page reads of the page view the workbench holds. The workbench's view is larger (its plugin directory, its
 * stages, Feed and the rest) and is handed through to the ports untouched.
 */
export interface GoalsPageView {
  snapshot: BoardSnapshot;
  project: { project_id: string; display_name: string } | null;
  /** Empty only for in-process test fixtures; normal Web URLs are project-scoped. */
  route_prefix: string;
  demo: boolean;
  active_goal_id: string | null;
  goals: GoalsDocumentView[];
  archived_goals: GoalsDocumentView[];
  trashed_goals: GoalsDocumentView[];
  counts: Record<GoalPresentationState, number>;
  input_bindings: GoalsInputBinding[];
  policy_bindings: GoalsPolicyBinding[];
  events: GoalsDecisionEvent[];
  /** The Inbox scene owner's live status; the page only carries it to the client as data. */
  inbox_judgment?: unknown;
}
