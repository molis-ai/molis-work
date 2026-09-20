import type { BoardSnapshot, GoalPresentationState as WebGoalStatus, GoalsDocumentView as WebGoalView, GoalsCoverageItem as WebCoverageItem, GoalsInputBinding as WebInputBinding, GoalsPolicyBinding as WebPolicyBinding, GoalsDecisionEvent as WebEventRecord } from "@molis-ai/molis-work-plugin-goals";
import type { FeedSnapshot, FeedSourceCatalogView, FeedUiModel } from "@molis-ai/molis-work-plugin-feed";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { ScheduleConversationTaskView } from "@molis-ai/molis-work-plugin-schedule";
import type { WebProjectNavigation } from "./settings-navigation.js";
export interface MolisWorkWebView {
  enabled_plugins?: import("@molis-ai/molis-work-contracts/modules/projects").ProjectPluginId[];
  /**
   * Directory panels supplied by Plugins the Host is running, keyed by project
   * plugin id. Absent means the shell renders what it always rendered.
   */
  plugin_panels?: Readonly<Record<string, string>>;
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
  schedule_jobs?: readonly ScheduleJobRecord[];
  schedule_tasks?: readonly ScheduleConversationTaskView[];
}
