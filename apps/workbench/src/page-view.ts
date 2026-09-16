import type { BoardSnapshot, GoalPresentationState as WebGoalStatus, GoalsDocumentView as WebGoalView, GoalsCoverageItem as WebCoverageItem, GoalsInputBinding as WebInputBinding, GoalsPolicyBinding as WebPolicyBinding, GoalsDecisionEvent as WebEventRecord } from "@molis-ai/molis-work-plugin-goals";
import type { FeedSnapshot, FeedSourceCatalogView, FeedUiModel } from "@molis-ai/molis-work-plugin-feed";
import type { TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";
import type { WebProjectNavigation } from "./settings-navigation.js";
export interface MolisWorkWebView {
  enabled_plugins?: import("@molis-ai/molis-work-contracts/modules/projects").BuiltinProjectPluginId[];
  snapshot: BoardSnapshot;
  project: WebProjectNavigation | null;
  projects: WebProjectNavigation[];
  /** Empty only for in-process test fixtures; normal Web URLs are project-scoped. */
  route_prefix: string;
  demo: boolean;
  active_goal_id: string | null;
  goals: WebGoalView[];
  archived_goals: WebGoalView[];
  trashed_goals: WebGoalView[];
  counts: Record<WebGoalStatus, number>;
  coverage: WebCoverageItem[];
  input_bindings: WebInputBinding[];
  policy_bindings: WebPolicyBinding[];
  events: WebEventRecord[];
  feed: FeedSnapshot;
  feed_source_catalog?: FeedSourceCatalogView[];
  feed_connector_auth?: FeedUiModel["connector_auth"];
  tasks?: TaskRecord[];
}
