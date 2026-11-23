import { readFileSync } from "node:fs";
import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

/** The bundle name an installed signed package's page loads (`/assets/molis-work-plugins/installed-plugin.js`). */
export const INSTALLED_PLUGIN_BUNDLE = "installed-plugin";

/** The page class an installed package's view is drawn in (`renderInstalledPluginBody`), standalone or in its frame. */
export const INSTALLED_PLUGIN_PAGE_CLASS = "installed-plugin-page";

/** The page an installed package's program mounts its declared view in (`src/browser/installed-plugin/entry.ts`). */
export const renderInstalledPluginBody = (pluginId: string): string =>
  '<main class="' + INSTALLED_PLUGIN_PAGE_CLASS + '" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';

/**
 * The sheet an installed package's frame links (`/assets/molis-work-plugins/installed-plugin.css`): the shared components every
 * generated view is drawn with, and the page they sit on.
 */
export function renderMolisWorkInstalledPluginStylesheet(): string {
  return ".installed-plugin-page{display:block;max-width:980px;margin:0 auto 32px;padding:32px clamp(16px,5%,56px);background:var(--paper);min-height:calc(100vh - 56px);"
    + "border-radius:0 0 14px 14px;color:var(--ink);font:13px/1.65 var(--font);-webkit-font-smoothing:antialiased}.installed-plugin-page *{box-sizing:border-box}"
    + "html:has(> body > .installed-plugin-page),body:has(> .installed-plugin-page){margin:0;background:var(--canvas,var(--rail))}" + PLUGIN_COMPONENT_STYLES;
}

/**
 * The platform's program for an installed signed package's page (`src/browser/installed-plugin/`, bundled into
 * `dist/installed-plugin-client.js`), after the shared component renderer it draws the package's declared view with.
 */
let client: string | null = null;
export function renderMolisWorkInstalledPluginClientScript(): string {
  return client ??= "globalThis.molisInstalledPluginComponents=" + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + ";\n"
    + readFileSync(new URL("../installed-plugin-client.js", import.meta.url), "utf8").trim();
}
