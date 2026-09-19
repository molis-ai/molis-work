import type {
  PluginAppContribution,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginEventContract } from "./event-contract.js";

/** One activated Plugin instance, resolved lazily when work arrives for it. */
export interface PluginActiveInstance {
  install_id: string;
  /** False once the Host revoked or stopped this instance mid-flight. */
  active(): boolean;
  contribution: PluginAppContribution;
}

/**
 * The Host side that coordination services (events, wiring) depend on.
 *
 * They never reach into lifecycle state themselves: enabling, activation,
 * isolation and revocation stay with whoever owns the Plugin set.
 */
export interface PluginHostLifecycle {
  manifest(pluginId: string): PluginManifest | undefined;
  contract(pluginId: string): PluginEventContract | undefined;
  /**
   * The Plugin's enablement epoch. It stays stable across a restart, so work
   * already queued survives one; only revoking the Plugin invalidates it.
   * `undefined` means the Plugin is not enabled and must receive nothing.
   */
  generation(pluginId: string): number | undefined;
  enabledPluginIds(): readonly string[];
  ensureStarted(pluginId: string): Promise<PluginActiveInstance | undefined>;
}
