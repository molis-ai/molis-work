import { readFileSync } from "node:fs";
import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";

/** The bundle name an installed signed package's page loads (`/assets/molis-work-plugins/installed-plugin.js`). */
export const INSTALLED_PLUGIN_BUNDLE = "installed-plugin";

/**
 * The platform's program for an installed signed package's page (`src/browser/installed-plugin/`, bundled into
 * `dist/installed-plugin-client.js`), after the shared component renderer it draws the package's declared view with.
 */
let client: string | null = null;
export function renderMolisWorkInstalledPluginClientScript(): string {
  return client ??= "globalThis.molisInstalledPluginComponents=" + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + ";\n"
    + readFileSync(new URL("../installed-plugin-client.js", import.meta.url), "utf8").trim();
}
