import type { PluginDirectory, PluginDirectoryEntry, PluginOffer } from "@molis-ai/molis-work-ui-host";
import { pluginDirectoryFor } from "./plugin-catalog.js";

/**
 * The plugins a page deals with, whoever published them: what the Host's Runtimes run here, then what this build ships that none of them
 * runs (`pluginDirectoryFor`). A page asks it for "the plugin that does this" instead of looking one up in the build's own catalog, so an
 * installed package is found by the declaration a built-in is found by, under the same name, order and key.
 */
export class RuntimePluginDirectory {
  readonly entries: PluginDirectory;

  constructor(running?: PluginDirectory) { this.entries = pluginDirectoryFor(running); }

  /** The plugin a page may point at for this service: the first one that says so, in the directory's order. */
  offering(offer: PluginOffer): PluginDirectoryEntry | undefined {
    return this.entries.find(entry => entry.offers?.includes(offer));
  }
}
