import type { BoardSnapshot, GoalPresentationState as WebGoalStatus, GoalsDocumentView as WebGoalView, GoalsInputBinding as WebInputBinding, GoalsPolicyBinding as WebPolicyBinding, GoalsDecisionEvent as WebEventRecord } from "@molis-ai/molis-work-plugin-goals";
import type { UiContribution, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WebProjectNavigation } from "./settings-navigation.js";
import type { UnavailablePluginStage } from "./unavailable-plugin-stage.js";
import type { PluginDirectory } from "./plugin-directory.js";
import type { HomePluginNavigationEntry } from "./home-plugin-navigation.js";
export interface MolisWorkWebView {
  /** Matched Manifest owner and its successful presentation; scoped to this one page request. */
  page_owner?: string;
  page_stage?: import("./declared-stages.js").RenderedStagePage;
  cli_availability?: Record<string, boolean>;
  inbox_judgment?: import("@molis-ai/molis-work-plugin-inbox").InboxJudgmentSummary;
  /** Presentation-only: an embedded pane requests this plugin, never execution authority. */
  pane_plugin?: string;
  enabled_plugins?: import("@molis-ai/molis-work-contracts/modules/projects").ProjectPluginId[];
  /** Personal plugins this project has hidden. They stay installed; the rail omits them. */
  hidden_plugins?: import("@molis-ai/molis-work-contracts/modules/projects").ProjectPluginId[];
  /** The plugins the page shows (enabled ones, and personal ones the project did not hide), as the Host works it out (W5-02 B1). */
  shown_plugins?: readonly string[];
  /**
   * Directory panels supplied by Plugins the Host is running, keyed by project
   * plugin id. Absent means the shell renders what it always rendered.
   */
  plugin_panels?: Readonly<Record<string, string>>;
  plugin_stages?: readonly string[];
  /** Host-owned failures render as static text, without activating a plugin page. */
  unavailable_plugin_stages?: readonly UnavailablePluginStage[];
  /** Request-local views retain the actual running owner selected before its single data read. */
  plugin_stage_views?: Readonly<Record<string, UiContribution | null>>;
  plugin_stage_surfaces?: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">>;
  plugin_overlays?: readonly string[];
  /**
   * The declarations of the plugins the Host's Runtimes run in this project, read from their Manifests for this page: built-in
   * and installed at run time alike (W5-06 余项 2). Absent means a page drawn with no Runtime, which reads the built-in catalog's.
   */
  plugin_directory?: PluginDirectory;
  /** The signed packages installed in the Home, for the tool bar beside its built-in tools (read per page, for the person's own page only). */
  home_plugin_nav?: readonly HomePluginNavigationEntry[];
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
  input_bindings: WebInputBinding[];
  policy_bindings: WebPolicyBinding[];
  events: WebEventRecord[];
  /**
   * The answers of the plugins' declared stage reads (`stage_data`), by project plugin id, read per request as the person (T-133). A
   * plugin that is not shown, declares none, or is not there to answer has no key; its stage is drawn without `data`.
   */
  stage_data?: Readonly<Record<string, unknown>>;
  /**
   * The request parameters each shown plugin's stage names in its `stage_data.input`, by project plugin id (T-116): those its own
   * `page_routes` declare and the request carried, as strings, and nothing else of the request. A stage that names none has no key.
   */
  stage_request?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The Host runs in developer mode: the plugin list also offers what is otherwise kept out of it (Text Stats). */
  developer_mode?: boolean;
  /** Live authorized status from the Inbox scene owner. */
}
