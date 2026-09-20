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
  projects: WebSettingsProject[];
  web_service: MolisWorkWebServiceDetection;
  diagnostics: WebInstallationDiagnostics;
}

export interface McpSettingsToolView {
  name: string;
  description: string;
  group_id: string;
  group_title: string;
  enabled: boolean;
  effect: "read" | "write";
}
