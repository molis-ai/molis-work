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

/**
 * The projects this plugin itself is installed in, by id and nothing else. `complete` is false when some project's installation records
 * could not be read, so the list may be missing projects: a caller that needs "none" must not conclude it from an incomplete answer.
 */
export interface PluginInstallationProjects {
  readonly project_ids: readonly string[];
  readonly complete: boolean;
}

/** Requires plugins:read. A project client never reads another project's installations. */
export interface PluginInstallationClient {
  list(): readonly PluginInstallationView[];
  /** Includes a known uninstalled record so owners can clean up; missing or another scope returns null. */
  get(installId: string): PluginInstallationView | null;
  /**
   * Where this plugin is installed, or uninstalled with its data kept for a reinstall: the projects that hold what it wrote. Only a Home
   * activation may ask; a project activation is refused, since it already knows its own project. It names no other plugin's installation
   * and no project this plugin has no claim on, so the Home's project list is not learned from it.
   */
  projects(): PluginInstallationProjects;
}
