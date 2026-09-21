import type { ConnectorAccountState, ConnectorAuthKind, ConnectorDirectoryAvailability, ConnectorDirectoryGroupId, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { RuntimeIntegrationDetection, MolisWorkWebServiceDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { WebProjectNavigation, WebSettingsSection } from "./settings-navigation.js";
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

export interface MolisWorkSettingsView {
  section: WebSettingsSection | string;
  plugin_settings_html?: string;
  context_project?: WebProjectNavigation | null;
  runtimes: RuntimeIntegrationDetection[];
  mcp_tools?: readonly McpSettingsToolView[];
  connectors?: readonly ConnectorSettingsCardView[];
  projects: WebSettingsProject[];
  web_service: MolisWorkWebServiceDetection;
  diagnostics: WebInstallationDiagnostics;
}

export interface ConnectorSettingsCardView {
  connector_id: string;
  title: string;
  availability: ConnectorDirectoryAvailability;
  auth_kind: ConnectorAuthKind;
  group_id: ConnectorDirectoryGroupId;
  summary: string;
  account_state: ConnectorAccountState;
  capabilities?: readonly { label: string; fulfillment: "live" | "unfulfilled" }[];
  hint?: string;
  unavailable_reason?: string;
  readonly outbound_note?: string;
  readonly token_label?: string;
  readonly token_placeholder?: string;
  readonly auth_help?: string;
  readonly setup_links?: readonly ConnectorSetupLink[];
  github_client_id_configured?: boolean;
  gmail_oauth_configured?: boolean;
}

export interface McpSettingsToolView {
  name: string;
  description: string;
  group_id: string;
  group_title: string;
  enabled: boolean;
  effect: "read" | "write";
}
