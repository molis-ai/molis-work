/**
 * What each settings page reads from the address the workbench hands it (BL-543, S-47).
 *
 * A plugin page may name a settings address (`molis-work:open-settings-path`); the workbench opens that page in place. Before this table
 * existed it passed the address's whole query string and fragment along, so a plugin page could put any parameter into a settings page.
 * The table says, per settings page, which query parameters that page actually reads and which fragments it accepts; the workbench keeps
 * those and drops the rest. A page with no entry (a plugin's own settings page from its Manifest) gets the default: the project and desktop
 * selectors every settings page is rendered with.
 *
 * The shell (`scripts/client/settings-directory.ts`) and the standalone Home model settings (`scripts/home-model-settings.ts`) both inject
 * this table and their own copy of the filter; `tests/security-invariants-plugin-pages.test.ts` holds both to this table.
 */
export interface SettingsAddressParams {
  /** Query parameters the page reads; every other one is dropped when the workbench forwards the address. */
  readonly query: readonly string[];
  /** The exact fragments the page reads today; any other fragment is dropped. */
  readonly exactHashes: readonly string[];
  /** The projects page reads the picked project's id from the fragment (`#<project_id>`). */
  readonly projectIdHash?: boolean;
}

/** The global settings pages, named by the section the workbench opens (`settings-sections.ts`). */
export const GLOBAL_SETTINGS_ADDRESS_PARAMS: Readonly<Record<string, SettingsAddressParams>> = {
  appearance: { query: ["project", "desktop"], exactHashes: [] },
  directories: { query: ["plugin", "project", "desktop"], exactHashes: [] },
  memory: { query: ["project", "desktop"], exactHashes: [] },
  models: { query: ["setup", "template", "project", "desktop"], exactHashes: [] },
  assistant: { query: ["project", "desktop"], exactHashes: ["#contributions"] },
  characters: { query: ["project", "desktop"], exactHashes: [] },
  prompts: { query: ["role", "project", "desktop"], exactHashes: [] },
  runtimes: { query: ["project", "desktop"], exactHashes: [] },
  library: { query: ["project", "provider", "q", "kind", "action", "version"], exactHashes: [] },
  connections: { query: ["project", "setup", "connector", "desktop", "q", "kind", "action", "version"], exactHashes: [] },
  access: { query: ["project", "q", "filter", "format", "kind", "action", "version"], exactHashes: [] },
  history: { query: ["project", "q", "kind", "action", "version"], exactHashes: [] },
  diagnostics: { query: ["call", "project", "desktop"], exactHashes: ["#agent-diagnostics"] },
  planning: { query: ["project", "desktop"], exactHashes: [] },
  projects: { query: ["project", "desktop"], exactHashes: [], projectIdHash: true },
};

/** The project settings pages, named by the section the workbench opens; `planning` includes the nested method pages. */
export const PROJECT_SETTINGS_ADDRESS_PARAMS: Readonly<Record<string, SettingsAddressParams>> = {
  general: { query: ["desktop"], exactHashes: [] },
  workspaces: { query: ["desktop"], exactHashes: [] },
  guidance: { query: ["draft", "desktop"], exactHashes: [] },
  memory: { query: ["desktop"], exactHashes: [] },
  knowledge: { query: ["desktop"], exactHashes: [] },
  plugins: { query: ["desktop"], exactHashes: [] },
  rules: { query: ["desktop"], exactHashes: [] },
  planning: { query: ["project", "desktop"], exactHashes: [] },
};

/** A plugin's own settings page (from its Manifest) reads the project and desktop selectors; anything finer needs a Manifest declaration. */
export const PLUGIN_SETTINGS_ADDRESS_PARAMS: SettingsAddressParams = { query: ["project", "desktop"], exactHashes: [] };

/** The standalone Home model settings dialog, named by the address it opens. */
export const HOME_MODEL_SETTINGS_ADDRESS_PARAMS: Readonly<Record<string, SettingsAddressParams>> = {
  "/settings/models": GLOBAL_SETTINGS_ADDRESS_PARAMS.models!,
  "/settings/connectors": GLOBAL_SETTINGS_ADDRESS_PARAMS.connections!,
  "/capabilities/connections": GLOBAL_SETTINGS_ADDRESS_PARAMS.connections!,
};
