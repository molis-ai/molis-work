/**
 * What each settings page reads from the address the workbench hands it (BL-543, S-47).
 *
 * A plugin page may name a settings address (`molis-work:open-settings-path`); the workbench opens that page in place. Before this table
 * existed it passed the address's whole query string and fragment along, so a page could put any parameter into a settings page. The table
 * says what each settings page actually reads: every page starts from the selectors it is rendered with, and a page that reads more lists
 * the extra variables by name; the workbench keeps those and drops the rest. A plugin's own settings page (from its Manifest) only reads the
 * selectors every settings page is rendered with.
 *
 * The shell (`scripts/client/settings-directory.ts`) and the standalone Home model settings (`scripts/home-model-settings.ts`) both inject
 * these declarations and their own copy of the filter; `tests/security-invariants-plugin-pages.test.ts` holds both to them.
 */

/** The query selectors every settings page of a kind is rendered with; a page's own entries add what it also reads. */
export const SETTINGS_ADDRESS_DEFAULTS = { global: "project desktop", project: "desktop", plugin: "project desktop" } as const;

/** Global settings pages that read more than the defaults, by the section the workbench opens (`settings-sections.ts`). */
export const GLOBAL_SETTINGS_QUERY_EXTRAS: Readonly<Record<string, string>> = {
  directories: "plugin",
  models: "setup template",
  prompts: "role",
  library: "provider q kind action version",
  connections: "setup connector q kind action version",
  access: "q filter format kind action version",
  history: "q kind action version",
  diagnostics: "call",
};

/** Project settings pages that read more than the defaults, by the section the workbench opens. */
export const PROJECT_SETTINGS_QUERY_EXTRAS: Readonly<Record<string, string>> = { guidance: "draft", planning: "project" };

/** The fragments settings pages read today, by section; any other fragment is dropped. */
export const SETTINGS_ADDRESS_HASHES: Readonly<Record<string, string>> = { diagnostics: "#agent-diagnostics", assistant: "#contributions" };

/** The projects page reads the picked project's id from the fragment (`#<project_id>`); it is a field, not one more fragment name. */
export const PROJECT_ID_HASH_SECTION = "projects";

/** The standalone Home model settings pages that read more than the defaults, by the address the dialog opens. */
export const HOME_SETTINGS_QUERY_EXTRAS: Readonly<Record<string, string>> = {
  "/settings/models": "setup template",
  "/settings/connectors": "setup connector",
  "/capabilities/connections": "setup connector",
};
