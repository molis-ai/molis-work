import type { PluginLifecycleState } from "./plugin.js";

/** Public installation metadata in this activation's scope; no grants, credentials, entrypoint or private paths. */
export interface PluginInstallationView {
  install_id: string;
  installation_generation: string;
  plugin_id: string;
  version: string;
  publisher_id: string;
  name: string;
  state: PluginLifecycleState;
}

/** Requires plugins:read. A project client never reads another project's installations. */
export interface PluginInstallationClient {
  list(): readonly PluginInstallationView[];
  /** Includes a known uninstalled record so owners can clean up; missing or another scope returns null. */
  get(installId: string): PluginInstallationView | null;
}
