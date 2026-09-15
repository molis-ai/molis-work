import type { RuntimeIntegrationDetection, MolisWorkWebServiceDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { WebProjectNavigation, WebSettingsSection } from "./settings-navigation.js";
export interface WebSettingsProject extends WebProjectNavigation {
  database_path: string;
  source: "created" | "migrated";
  data_class: "user" | "migrated_user" | "regenerable_demo";
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
  section: WebSettingsSection;
  context_project?: WebProjectNavigation | null;
  runtimes: RuntimeIntegrationDetection[];
  projects: WebSettingsProject[];
  web_service: MolisWorkWebServiceDetection;
  diagnostics: WebInstallationDiagnostics;
}
