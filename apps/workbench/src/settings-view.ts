import type { ModelSettingsModel } from "./settings-models.js";
import type { ConnectorAuthKind, ConnectorConnectionView, ConnectorDirectoryAvailability, ConnectorDirectoryGroupId, ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorConnectionStatus } from "@molis-ai/molis-work-contracts/services/connector-host";

export type ConnectorSettingsConnection = ConnectorConnectionView & { status?: ConnectorConnectionStatus; project_id?: string; revision?: string };
import type { RuntimeIntegrationDetection, MolisWorkWebServiceDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { WebProjectNavigation, WebSettingsSection } from "./settings-navigation.js";
import type { CallRowView } from "./call-row.js";
export interface WebSettingsProject extends WebProjectNavigation {
  database_path: string;
  source: "created";
  data_class: "user" | "regenerable_demo";
  created_at: string;
}

export interface WebInstallationDiagnostics {
  home_directory: string;
  installation_state: "ready" | "missing" | "invalid";
  version: string | null;
  release_directory: string | null;
  project_count: number;
  launchers: Array<{
    name: "CLI" | "MCP" | "Web";
    path: string;
    state: "ready" | "missing";
  }>;
}

/** One periodic task of the Host (W4-09): its Chinese title, how often it runs and how its last run went. */
export interface WebPeriodicTask {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly interval_ms: number;
  readonly runs: number;
  readonly running: boolean;
  readonly last_finished_at: string | null;
  readonly last_error: string | null;
}

export interface MolisWorkSettingsView {
  section: WebSettingsSection | string;
  capabilities?: import("./capabilities.js").CapabilitiesView;
  functions_settings?: Omit<import("./functions/settings-ui.js").FunctionsSettingsUiModel, "primitives">;
  plugin_settings_html?: string;
  model_settings?: Omit<ModelSettingsModel, "primitives">;
  context_project?: WebProjectNavigation | null;
  /** Project plugins enabled for the settings context. Personal plugins are listed unless hidden. */
  enabled_plugins?: readonly string[];
  hidden_plugins?: readonly string[];
  /** The plugins the settings context shows, as the Host works it out (W5-02 B1); their settings pages are listed. */
  shown_plugins?: readonly string[];
  runtimes: RuntimeIntegrationDetection[];
  mcp_access?: import("./mcp-access.js").McpAccessModel;
  connectors?: readonly ConnectorSettingsCardView[];
  connector_connections?: readonly ConnectorSettingsConnection[];
  connector_setup?: import("./settings-connector-request.js").ConnectorSetupView | null;
  /**
   * 服务连接 › 插件用的账号: the installation slots of the Home's plugins and the context project's, with the account bound to each (BL-350).
   * `tenant`: a service on each tenant's own origin (BL-595), which sends nothing without an account whose site is pinned.
   */
  plugin_slots?: ReadonlyArray<{ install_id: string; plugin_id: string; plugin_name: string; slot_id: string; service_id: string; reason: string; connection_id: string | null; tenant: boolean }>;
  projects: WebSettingsProject[];
  web_service: MolisWorkWebServiceDetection;
  diagnostics: WebInstallationDiagnostics;
  /** 设置 › 诊断: what this server does on a timer, from its one registry of periodic tasks. */
  periodic_tasks?: readonly WebPeriodicTask[];
  /** 设置 › 诊断: what was typed into the lookup by 诊断编号, the fewest characters it takes, and the rows it found (none when the text is too short to look for). */
  call_query?: { text: string; min_length: number; matches?: readonly CallRowView[] };
  /** 设置 › 诊断: with no id asked for, the newest calls of any project that failed or were turned away. */
  recent_calls?: readonly CallRowView[];
}

export interface ConnectorSettingsCardView {
  feed_available?: boolean;
  connector_id: string;
  title: string;
  availability: ConnectorDirectoryAvailability;
  auth_kind: ConnectorAuthKind;
  group_id: ConnectorDirectoryGroupId;
  summary: string;
  capabilities?: readonly { label: string; fulfillment: "live" | "unfulfilled" }[];
  unavailable_reason?: string;
  readonly outbound_note?: string;
  readonly token_label?: string;
  readonly token_placeholder?: string;
  readonly auth_help?: string;
  readonly setup_links?: readonly ConnectorSetupLink[];
  readonly method_options?: readonly ConnectorMethodOption[];
  github_client_id_configured?: boolean;
  gmail_oauth_configured?: boolean;
  notion_oauth_configured?: boolean;
}

